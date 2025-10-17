// src/controllers/horariosController.js
import { supabaseAxios } from "../services/supabaseAxios.js";
import {
    generateScheduleForRange56,
    getDailyCapacity, // OJO: Esta podría necesitar revisión si causa problemas en generación
    isoWeekday,
    WEEKLY_LEGAL_LIMIT,
    WEEKLY_EXTRA_LIMIT,
    WEEKLY_TOTAL_LIMIT,
    getDayInfo,
    allocateHoursRandomly,
} from "../utils/schedule.js"; // Asegúrate que la ruta sea correcta
import { getHolidaySet } from "../utils/holidays.js"; // Asegúrate que la ruta sea correcta
import { format, parseISO, isValid, addDays } from "date-fns";
import { sendEmail } from "../services/emailService.js"; // Asegúrate que la ruta sea correcta
import {
    createOrUpdateExcess,
    fetchAllPendingForEmpleado,
    updateEntry as updateHoursBankEntry,
    resetForSemana,
} from "./hoursBankController.js"; // Asegúrate que la ruta sea correcta

// --- Constantes y Helpers (Revisados/Añadidos) ---
const toFixedNumber = (value) => Number(Number(value || 0).toFixed(2));
const MAX_OVERTIME_PER_DAY = 4; // Horas adicionales MÁXIMAS permitidas para banco por día.

const BLOCKING_NOVEDADES = new Set([
    "Incapacidades", "Licencias", "Vacaciones",
    "Permisos", "Estudio", "Día de la Familia",
]);

// Capacidad Legal Máxima por día (para cálculo de horas_base)
const getLegalCapForDay = (weekday) => {
    if (weekday === 6) return 4; // Sábado
    if (weekday >= 1 && weekday <= 5) return 8; // Lunes a Viernes
    return 0; // Domingo
};

// Capacidad Regular Total por día (antes de considerar banco)
const getRegularDailyCap = (weekday) => {
    if (weekday === 6) return 7; // Sábado: 7h
    if (weekday >= 1 && weekday <= 5) return 10; // L-V: 10h
    return 0; // Domingo
};

// Capacidad Extra Pagable Máxima por día (las primeras extras que se pagan)
const getPayableExtraCapForDay = (weekday) => {
    if (weekday === 6) return 3; // Sábado: 3h extras pagables (hasta 7h total)
    if (weekday >= 1 && weekday <= 5) return 2; // L-V: 2h extras pagables (hasta 10h total)
    return 0; // Domingo
};

// Helper para parsear fechas YYYY-MM-DD a objetos Date (importante para comparaciones)
const parseDateOnly = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        // Clonar para evitar mutaciones accidentales
        const date = new Date(value);
        date.setUTCHours(0, 0, 0, 0); // Asegurar que sea medianoche UTC
        return date;
    }
    const strValue = `${value}`.trim();
    if (!strValue) return null;
    const normalized = strValue.length > 10 ? strValue.slice(0, 10) : strValue;
    // Intentar parsear como YYYY-MM-DD asegurando UTC
    const parsed = parseISO(normalized + 'T00:00:00Z');
    return isValid(parsed) ? parsed : null;
};

// Helper para formatear Date a YYYY-MM-DD
const toISODateString = (date) => format(date, "yyyy-MM-dd");

// Helper para inferir fecha de fin de bloqueo (sin cambios)
const inferEndDate = (startDate, endCandidate, details) => {
    let inferred = parseDateOnly(endCandidate);
    if (!inferred || inferred < startDate) {
        const duration = Number(details?.duracion_dias);
        if (!Number.isNaN(duration) && duration > 0) {
            inferred = addDays(startDate, duration - 1);
        }
    }
    if ((!inferred || inferred < startDate) && details?.diasIncapacidad) {
        const diasIncapacidad = details.diasIncapacidad;
        // Considerar "Mayor a 3 días" o "Menor a 3 días" si es string
        let parsedNumber = NaN;
        if (typeof diasIncapacidad === 'number') {
             parsedNumber = diasIncapacidad;
        } else if (typeof diasIncapacidad === 'string') {
             const match = diasIncapacidad.match(/\d+/); // Extraer número si existe
             if (match) parsedNumber = Number(match[0]);
        }

        if (!Number.isNaN(parsedNumber) && parsedNumber > 0) {
            inferred = addDays(startDate, parsedNumber - 1);
        }
    }
    if (!inferred || inferred < startDate) {
        inferred = startDate;
    }
    return inferred;
};


// Helper para normalizar observaciones bloqueantes (sin cambios)
const normalizeBlockingObservation = (rawObs) => {
    if (!rawObs || !BLOCKING_NOVEDADES.has(rawObs.tipo_novedad)) return null;
    const details = rawObs.details && typeof rawObs.details === 'object' ? rawObs.details : {};
    let startCandidate = null, endCandidate = null;

    switch (rawObs.tipo_novedad) {
        case "Vacaciones":
            startCandidate = details.fecha_inicio_vacaciones || rawObs.fecha_novedad;
            if (details.fecha_fin_vacaciones) endCandidate = details.fecha_fin_vacaciones;
            else if (details.fecha_regreso_vacaciones) {
                const regreso = parseDateOnly(details.fecha_regreso_vacaciones);
                if (regreso) endCandidate = toISODateString(addDays(regreso, -1));
            }
            if (!endCandidate) endCandidate = startCandidate;
            break;
        case "Licencias":
            startCandidate = details.fecha_inicio || rawObs.fecha_novedad;
            endCandidate = details.fecha_termino || details.fecha_inicio;
            break;
        case "Incapacidades":
            startCandidate = details.fecha_inicio || rawObs.fecha_novedad;
            endCandidate = details.fecha_fin || details.fecha_inicio;
            break;
        case "Permisos":
        case "Estudio":
        case "Día de la Familia":
            startCandidate = details.fecha_inicio || (details.fecha_propuesta_dia_familia && rawObs.tipo_novedad === "Día de la Familia" ? details.fecha_propuesta_dia_familia : null) || rawObs.fecha_novedad;
            endCandidate = details.fecha_fin || details.fecha_inicio || (details.fecha_propuesta_dia_familia && rawObs.tipo_novedad === "Día de la Familia" ? details.fecha_propuesta_dia_familia : null) || rawObs.fecha_novedad;
            break;
        default:
            startCandidate = rawObs.fecha_novedad;
            endCandidate = rawObs.fecha_novedad;
            break;
    }

    const startDate = parseDateOnly(startCandidate);
    if (!startDate) return null;
    const endDate = inferEndDate(startDate, endCandidate, details);

    return {
        id: rawObs.id, tipo: rawObs.tipo_novedad, observacion: rawObs.observacion || "",
        start: toISODateString(startDate), end: toISODateString(endDate), // Guardar como string YYYY-MM-DD
        rawStart: startDate, rawEnd: endDate // Mantener objetos Date para comparaciones internas
    };
};

// Helper para buscar observaciones bloqueantes en un rango (sin cambios)
const fetchBlockingObservationsInRange = async (empleadoId, startDate, endDate) => {
    const { data, error } = await supabaseAxios.get(
        `/observaciones?select=id,tipo_novedad,observacion,fecha_novedad,details&empleado_id=eq.${empleadoId}&order=fecha_novedad.desc`
    );
    if (error) throw error;
    return (data || [])
        .map(normalizeBlockingObservation)
        .filter(Boolean)
        .filter(obs => obs.rawEnd >= startDate && obs.rawStart <= endDate);
};

// Helper para formatear observación para respuesta (sin cambios)
const serializeObservationForResponse = (obs) => ({
    id: obs.id, tipo: obs.tipo, observacion: obs.observacion,
    fecha_inicio: obs.start, fecha_fin: obs.end,
    // Incluir objetos Date si el frontend los necesita para DayPicker, aunque es mejor que el front los parsee
    rawStart: obs.rawStart, rawEnd: obs.rawEnd
});

// Helper para aplicar horas del banco (sin cambios, asume que funciona)
const applyBankedHours = (weeks, bankEntries) => {
    // ... (tu lógica existente de applyBankedHours) ...
    // Asegúrate que esta función modifique correctamente los campos:
    // dias[].horas, dias[].horas_base, dias[].horas_extra,
    // dias[].horas_extra_reducidas, dias[].horas_legales_reducidas,
    // dias[].banco_compensacion_id, dias[].bloques, dias[].jornada_entrada, dias[].jornada_salida
    // Y que devuelva { bankUpdates: [...], summaries: [...] }
      if (!Array.isArray(weeks) || weeks.length === 0 || !Array.isArray(bankEntries) || bankEntries.length === 0) {
        return { bankUpdates: [], summaries: [] };
    }

    const weekSummariesMap = new Map();
    const bankUpdates = [];

    // Función auxiliar para mezclar días aleatoriamente (Fisher-Yates shuffle)
    const shuffleDays = (days) => {
        const arr = [...days];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]]; // Intercambio de elementos
        }
        return arr;
    };


    for (const entry of bankEntries) {
        let remaining = Number(entry.horas_pendientes ?? entry.horas_excedidas ?? 0);
        if (remaining <= 0) continue;

        let consumed = 0;
        let firstAppliedWeekStart = null;
        let lastAppliedWeekEnd = null;

        // Iterar sobre las semanas para aplicar las horas
        for (const week of weeks) {
            if (remaining <= 0) break; // Si ya se consumieron todas las horas del banco

            let weekAppliedHours = 0; // Horas aplicadas en ESTA semana
            const diasAjustadosEnSemana = []; // Detalles de los días ajustados en ESTA semana

            // Obtener y mezclar días candidatos (laborables con horas > 0)
            const candidates = shuffleDays(
                (week.dias || []).filter(d => isoWeekday(parseDateOnly(d.fecha)) !== 7 && Number(d.horas || 0) > 0)
            );

            for (const day of candidates) {
                if (remaining <= 0) break; // Si ya se consumieron

                const wd = isoWeekday(parseDateOnly(day.fecha));
                const originalHours = Number(day.horas || 0);
                const originalExtra = Number(day.horas_extra || 0);
                const originalBase = Number(day.horas_base || 0);
                let extraRemoved = 0;
                let baseRemoved = 0;

                // 1. Reducir horas extra primero
                if (remaining > 0 && originalExtra > 0) {
                    extraRemoved = Math.min(originalExtra, remaining);
                    day.horas_extra = toFixedNumber(originalExtra - extraRemoved);
                    remaining = toFixedNumber(remaining - extraRemoved);
                    consumed = toFixedNumber(consumed + extraRemoved);
                    weekAppliedHours = toFixedNumber(weekAppliedHours + extraRemoved);
                }

                // 2. Reducir horas base si aún quedan horas por aplicar
                if (remaining > 0 && originalBase > 0) {
                    // Recalcular base efectiva después de quitar extras
                    const currentBase = Math.max(0, toFixedNumber(originalHours - extraRemoved));
                    baseRemoved = Math.min(currentBase, originalBase, remaining); // Asegurar no quitar más de la base original
                    day.horas_base = toFixedNumber(originalBase - baseRemoved); // Reducir desde la base original
                    remaining = toFixedNumber(remaining - baseRemoved);
                    consumed = toFixedNumber(consumed + baseRemoved);
                    weekAppliedHours = toFixedNumber(weekAppliedHours + baseRemoved);
                }

                // 3. Actualizar total de horas y registrar reducción si hubo cambios
                if (extraRemoved > 0 || baseRemoved > 0) {
                    day.horas = toFixedNumber(day.horas_base + day.horas_extra); // Recalcular total
                    day.horas_extra_reducidas = toFixedNumber(Number(day.horas_extra_reducidas || 0) + extraRemoved);
                    day.horas_legales_reducidas = toFixedNumber(Number(day.horas_legales_reducidas || 0) + baseRemoved);
                    day.banco_compensacion_id = entry.id; // Marcar qué entrada del banco se usó

                    // Recalcular bloques horarios
                    const dayInfo = getDayInfo(wd, false, null, Boolean(day.jornada_reducida), day.tipo_jornada_reducida || 'salir-temprano');
                    const { blocks, entryTime, exitTime } = allocateHoursRandomly(day.fecha, dayInfo, day.horas);
                    day.bloques = blocks;
                    day.jornada_entrada = entryTime;
                    day.jornada_salida = exitTime;

                    diasAjustadosEnSemana.push({
                        fecha: day.fecha,
                        banco_id: entry.id,
                        horas_extra_reducidas: toFixedNumber(extraRemoved),
                        horas_legales_reducidas: toFixedNumber(baseRemoved),
                    });
                }
            } // Fin loop días candidatos

            // Si se aplicaron horas en esta semana, actualizar rangos y resumen
            if (weekAppliedHours > 0) {
                week.total_horas_semana = toFixedNumber(
                    (week.dias || []).reduce((sum, d) => sum + Number(d.horas || 0), 0)
                );

                firstAppliedWeekStart = firstAppliedWeekStart || week.fecha_inicio;
                lastAppliedWeekEnd = week.fecha_fin; // Siempre la última semana donde se aplicó algo

                // Agregar al resumen semanal
                const summaryKey = week.fecha_inicio; // Usar fecha de inicio como clave única
                if (!weekSummariesMap.has(summaryKey)) {
                    weekSummariesMap.set(summaryKey, {
                        semana_inicio: week.fecha_inicio,
                        semana_fin: week.fecha_fin,
                        dias: [],
                    });
                }
                const summary = weekSummariesMap.get(summaryKey);
                summary.dias.push(...diasAjustadosEnSemana);
            }
        } // Fin loop semanas

        // Si se consumió alguna hora de esta entrada del banco, preparar la actualización
        if (consumed > 0) {
            bankUpdates.push({
                id: entry.id,
                horas_consumidas: consumed, // Total consumido de ESTA entrada
                horas_pendientes: remaining, // Lo que quedó pendiente de ESTA entrada
                estado: remaining > 0 ? 'parcial' : 'aplicado',
                semana_aplicada_inicio: firstAppliedWeekStart,
                semana_aplicada_fin: lastAppliedWeekEnd,
            });
        }
    } // Fin loop bankEntries

    return {
        bankUpdates,
        summaries: Array.from(weekSummariesMap.values()),
    };

};


// --- Endpoints ---

// GET /horarios/:empleado_id (Sin cambios)
export const getHorariosByEmpleadoId = async (req, res) => {
    const { empleado_id } = req.params;
    const { incluir_archivados = "false" } = req.query;
    try {
        let url = `/horarios?select=*&empleado_id=eq.${empleado_id}`;
        if (incluir_archivados === "false") {
            url += `&estado_visibilidad=eq.publico`;
        }
        url += `&order=fecha_inicio.desc`;
        const { data, error } = await supabaseAxios.get(url);
        if (error) throw error;
        res.json(data || []); // Devolver array vacío si no hay datos
    } catch (e) {
        console.error("Error fetching horarios:", e);
        res.status(500).json({ message: "Error fetching horarios", error: e.message });
    }
};

// POST /horarios (Sin cambios, asume que generateScheduleForRange56 y applyBankedHours funcionan)
export const createHorario = async (req, res) => {
    try {
        const {
            empleado_id, fecha_inicio, fecha_fin, working_weekdays,
            holiday_overrides, sunday_overrides,
            apply_banked_hours = false, bank_entry_ids = []
        } = req.body;

        if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
            return res.status(400).json({ message: "working_weekdays es requerido." });
        }
        const scheduleStart = parseDateOnly(fecha_inicio);
        const scheduleEnd = parseDateOnly(fecha_fin);
        if (!scheduleStart || !scheduleEnd) return res.status(400).json({ message: "Fechas inválidas." });
        if (scheduleEnd < scheduleStart) return res.status(400).json({ message: "Fecha fin anterior a inicio." });

        const blockingObservations = await fetchBlockingObservationsInRange(empleado_id, scheduleStart, scheduleEnd);
        if (blockingObservations.length) {
            return res.status(409).json({
                message: "Conflicto: Periodo bloqueado por novedades existentes.",
                bloqueos: blockingObservations.map(serializeObservationForResponse),
            });
        }

        const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);
        const { schedule: horariosSemanales } = generateScheduleForRange56(
            fecha_inicio, fecha_fin, working_weekdays, holidaySet,
            holiday_overrides || {}, sunday_overrides || {}
        );

        let bankUpdates = [];
        let compensationSummaries = [];
        if (apply_banked_hours) {
            const pendientes = await fetchAllPendingForEmpleado(empleado_id);
            const selection = bank_entry_ids.length ? pendientes.filter(p => bank_entry_ids.includes(p.id)) : pendientes;
            const { bankUpdates: updates, summaries } = applyBankedHours(horariosSemanales, selection);
            bankUpdates = updates;
            compensationSummaries = summaries;
        }

        await archivarHorariosPorEmpleado(empleado_id);

        const payloadSemanales = horariosSemanales.map(h => ({ ...h, empleado_id, tipo: "semanal", estado_visibilidad: "publico" }));
        const { data: dataSemanales, error: errorSemanales } = await supabaseAxios.post("/horarios", payloadSemanales, { headers: { Prefer: 'return=representation' } });
        if (errorSemanales) throw errorSemanales;

        for (const update of bankUpdates) {
            await updateHoursBankEntry(update.id, {
                horas_pendientes: update.horas_pendientes, estado: update.estado,
                semana_aplicada_inicio: update.semana_aplicada_inicio, semana_aplicada_fin: update.semana_aplicada_fin
            });
        }

        // ... (Lógica de envío de email sin cambios) ...
        let emailStatus = { sent: false, error: null, empleado: null };
        try {
            const { data: [emp], error: empErr } = await supabaseAxios.get(`/empleados?select=nombre_completo,correo_electronico&id=eq.${empleado_id}`);
            if (empErr || !emp) { emailStatus.error = "No se pudo obtener datos del empleado"; }
            else if (!emp.correo_electronico) { emailStatus.error = "Empleado sin correo"; emailStatus.empleado = emp.nombre_completo; }
            else {
                const subject = `🗓️ Horario asignado: ${fecha_inicio} al ${fecha_fin}`;
                const publicUrl = "https://merkahorro.com/consulta-horarios"; // Cambia si es necesario
                const htmlContent = `... (tu HTML de correo aquí) ...`; // Asegúrate que el HTML esté completo
                await sendEmail(emp.correo_electronico, subject, htmlContent);
                emailStatus.sent = true; emailStatus.empleado = emp.nombre_completo;
            }
        } catch(emailError){ emailStatus.error = `Error enviando correo: ${emailError.message}`; }

        res.status(201).json({
            horarios: dataSemanales || [], // Devolver los horarios creados
            email_notification: emailStatus,
            horas_compensadas: compensationSummaries,
        });
    } catch (e) {
        console.error("Error detallado en createHorario:", e);
        res.status(500).json({ message: "Error creating horario", error: e.message, stack: e.stack });
    }
};


// PATCH /horarios/:id (Ya corregida y enviada en el paso anterior)
export { updateHorario }; // Asegúrate que esté exportada si la definiste antes


// DELETE /horarios/:id (Usar la versión simplificada si aplica)
export const deleteHorario = async (req, res) => {
    const { id } = req.params;
    try {
        const { error, count } = await supabaseAxios.delete(`/horarios?id=eq.${id}`, { count: 'exact' });
        if (error && error.code !== 'PGRST204') throw error; // Ignorar error si no se encontró
        if (count === 0) {
            console.warn(`Intento de eliminar horario ${id} no encontrado.`);
            return res.status(204).json({ message: "Horario no encontrado o ya eliminado." });
        }
        res.json({ message: "Horario eliminado correctamente" });
    } catch (e) {
        console.error("Error eliminando horario:", e);
        res.status(500).json({ message: "Error al eliminar el horario", error: e.response?.data?.message || e.message });
    }
};

// PATCH /horarios/archivar (Sin cambios)
export const archivarHorarios = async (req, res) => {
    const { empleado_id } = req.body;
    if (!empleado_id) return res.status(400).json({ message: "ID de empleado requerido." });
    try {
        await supabaseAxios.patch(
            `/horarios?empleado_id=eq.${empleado_id}&estado_visibilidad=eq.publico`,
            { estado_visibilidad: "archivado" }
        );
        res.json({ message: "Horarios archivados." });
    } catch (e) {
        console.error("Error archivando horarios:", e);
        res.status(500).json({ message: "Error al archivar." });
    }
};

// Función auxiliar archivarHorariosPorEmpleado (Sin cambios)
const archivarHorariosPorEmpleado = async (empleadoId) => {
    try {
        const { count, error } = await supabaseAxios.patch(
            `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`,
            { estado_visibilidad: "archivado" }, { count: 'exact' }
        );
        if (error) throw error;
        if (count > 0) console.log(`${count} horarios archivados para ${empleadoId}.`);
        else console.log(`No hay horarios públicos para archivar para ${empleadoId}.`);
    } catch (e) {
        console.error(`Error archivando para ${empleadoId}:`, e);
        throw e;
    }
};