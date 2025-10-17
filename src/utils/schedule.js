// src/utils/schedule.js
import {
    startOfWeek as dfStartOfWeek,
    addWeeks,
    addDays as dfAddDays,
    format,
    parseISO, // Importar parseISO
    isValid,  // Importar isValid
} from "date-fns";

// ========================
// Constantes de negocio (Asegúrate que coincidan con horariosController)
// ========================
const DAILY_LEGAL_LIMIT = 8; // L-V
const SATURDAY_LEGAL_LIMIT = 4;
export const WEEKLY_LEGAL_LIMIT = 44;
export const WEEKLY_EXTRA_LIMIT = 12; // Máximo extra pagable semanal
export const WEEKLY_TOTAL_LIMIT = 56; // Límite legal total (44+12)
const HOLIDAY_HOURS = 6; // Horas estándar para festivo trabajado

const BREAKFAST_MINUTES = 15;
const LUNCH_MINUTES = 45;

// ========================
// Helpers de fecha/hora
// ========================
const pad = (n) => String(n).padStart(2, '0');

// Formatea Date a YYYY-MM-DD
export const YMD = (d) => {
    if (!d || !(d instanceof Date) || !isValid(d)) return null; // Validación
    // Usar getUTC... para evitar problemas de zona horaria al formatear
    const year = d.getUTCFullYear();
    const month = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    return `${year}-${month}-${day}`;
};

// Añade días a una fecha (objeto Date o string YYYY-MM-DD)
export const addDays = (d, n) => {
    const date = (d instanceof Date) ? new Date(d) : parseISO(d + 'T00:00:00Z'); // Asegurar UTC
    if (!isValid(date)) return null;
    date.setUTCDate(date.getUTCDate() + n); // Operar en UTC
    return date;
};

// Obtiene el inicio de la semana ISO (Lunes)
export const startOfISOWeek = (d) => {
    const date = (d instanceof Date) ? new Date(d) : parseISO(d + 'T00:00:00Z'); // Asegurar UTC
    if (!isValid(date)) return null;
    return dfStartOfWeek(date, { weekStartsOn: 1 }); // weekStartsOn: 1 para Lunes
};

// Obtiene el día de la semana ISO (1=Lunes, 7=Domingo)
export const isoWeekday = (d) => {
    const date = (d instanceof Date) ? d : parseISO(d + 'T00:00:00Z'); // Asegurar UTC
    if (!isValid(date)) return 0; // Devolver 0 si es inválido
    const wd = date.getUTCDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    return wd === 0 ? 7 : wd; // Convertir Domingo 0 a 7
};

// Convierte HH:MM a minutos totales desde medianoche
const hmToMinutes = (hhmm) => {
    if (typeof hhmm !== 'string') return 0;
    const [hh, mm] = hhmm.split(':').map(Number);
    return (hh || 0) * 60 + (mm || 0);
};

// Convierte minutos desde medianoche a HH:MM
const minutesToHM = (m) => {
    if (typeof m !== 'number' || Number.isNaN(m) || m < 0) return '00:00';
    const totalMinutes = Math.round(m); // Redondear minutos
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${pad(hh)}:${pad(mm)}`;
};

// ========================
// Nombres de días
// ========================
const WD_NAME = {
    1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves",
    5: "Viernes", 6: "Sábado", 7: "Domingo",
};

// ========================
// Info de día (Segmentos y Descansos)
// ========================
// IMPORTANTE: Esta función define los TRAMOS horarios, no el total de horas.
export function getDayInfo(
    wd, // ISO Weekday (1-7)
    isHoliday,
    holidayOverride,
    isReduced = false,
    tipoJornadaReducida = "salir-temprano"
) {
    // Caso: Festivo Trabajado
    if (isHoliday && holidayOverride === "work") {
        return {
            // Capacidad total es 6h, pero los segmentos definen cómo se distribuyen
            capacity: HOLIDAY_HOURS, // 6 horas
            segments: [{ from: hmToMinutes("07:00"), to: hmToMinutes("13:00") }], // 7am - 1pm
            breaks: [{ start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES }], // Descanso corto
        };
    }

    // Caso: Domingo (Sin trabajo por defecto)
    if (wd === 7) {
        return { capacity: 0, segments: [], breaks: [] };
    }

    // Caso: Sábado (wd = 6)
    if (wd === 6) {
        if (isReduced) {
            // Sábado Reducido (6 horas totales)
            if (tipoJornadaReducida === "entrar-tarde") {
                 return {
                    capacity: 6,
                    segments: [ // 8am-9am (1h) + 9:15am-12pm (2.75h) + 12:45pm-3pm (2.25h) = 6h
                        { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
                        { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
                        { from: hmToMinutes("12:45"), to: hmToMinutes("15:00") } // Salida normal sábado
                    ],
                    breaks: [
                        { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
                        { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
                    ],
                };
            } else { // salir-temprano
                 return {
                    capacity: 6,
                    segments: [ // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-2pm (1.25h) = 6h
                        { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
                        { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
                        { from: hmToMinutes("12:45"), to: hmToMinutes("14:00") } // Sale 1h antes
                    ],
                    breaks: [
                        { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
                        { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
                    ],
                };
            }
        } else {
            // Sábado Normal (7 horas totales)
            return {
                capacity: 7, // 7 horas
                segments: [ // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-3pm (2.25h) = 7h
                    { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
                    { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
                    { from: hmToMinutes("12:45"), to: hmToMinutes("15:00") } // Salida 3pm
                ],
                breaks: [
                    { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
                    { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
                ],
            };
        }
    }

    // Caso: Lunes a Viernes (wd = 1 a 5)
    if (isReduced) {
        // L-V Reducido (9 horas totales)
        if (tipoJornadaReducida === "entrar-tarde") {
            return {
                capacity: 9,
                segments: [ // 8am-9am (1h) + 9:15am-12pm (2.75h) + 12:45pm-6pm (5.25h) = 9h
                    { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
                    { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
                    { from: hmToMinutes("12:45"), to: hmToMinutes("18:00") } // Salida normal 6pm
                ],
                breaks: [
                    { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
                    { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
                ],
            };
        } else { // salir-temprano
            return {
                capacity: 9,
                segments: [ // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-5pm (4.25h) = 9h
                    { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
                    { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
                    { from: hmToMinutes("12:45"), to: hmToMinutes("17:00") } // Sale 1h antes 5pm
                ],
                breaks: [
                    { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
                    { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
                ],
            };
        }
    } else {
        // L-V Normal (10 horas totales)
        return {
            capacity: 10,
            segments: [ // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-6pm (5.25h) = 10h
                { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
                { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
                { from: hmToMinutes("12:45"), to: hmToMinutes("18:00") } // Salida 6pm
            ],
            breaks: [
                { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
                { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
            ],
        };
    }
}


// ========================
// Asignación de horas en bloques (Sin cambios funcionales)
// ========================
export function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
    if (hoursNeeded <= 0) return { blocks: [], used: 0, entryTime: null, exitTime: null };
    const { segments } = dayInfo;
    if (!segments || segments.length === 0) return { blocks: [], used: 0, entryTime: null, exitTime: null };

    const requestedWorkMins = Math.max(0, Math.round(hoursNeeded * 60));
    let remaining = requestedWorkMins;
    let cursor = segments[0].from;
    const rawBlocks = [];

    for (const seg of segments) {
        if (remaining <= 0) break;
        if (cursor < seg.from) cursor = seg.from;
        if (cursor >= seg.to) continue;
        const availInSeg = seg.to - cursor;
        if (availInSeg <= 0) continue;
        const take = Math.min(availInSeg, remaining);
        rawBlocks.push({ startMinutes: cursor, endMinutes: cursor + take });
        cursor += take;
        remaining -= take;
    }

    // Si faltaron horas por asignar (ej. se pidieron 11h pero los segmentos solo suman 10),
    // se añaden al final del último bloque.
    if (rawBlocks.length > 0 && remaining > 0) {
        rawBlocks[rawBlocks.length - 1].endMinutes += remaining;
    } else if (rawBlocks.length === 0 && segments.length > 0) {
         // Caso borde: Se pidieron horas pero no cupieron, o día sin segmentos válidos.
         // Crear un bloque vacío al inicio del primer segmento disponible.
         rawBlocks.push({ startMinutes: segments[0].from, endMinutes: segments[0].from });
    } else if (rawBlocks.length === 0 && segments.length === 0) {
         // Día sin segmentos (ej: Domingo), retornar vacío
         return { blocks: [], used: 0, entryTime: null, exitTime: null };
    }


    const blocks = rawBlocks.map(block => ({
        start: `${dateISO}T${minutesToHM(block.startMinutes)}:00`,
        end: `${dateISO}T${minutesToHM(block.endMinutes)}:00`,
        hours: (block.endMinutes - block.startMinutes) / 60,
    }));

    const entryTime = minutesToHM(rawBlocks[0].startMinutes);
    const exitTime = minutesToHM(rawBlocks[rawBlocks.length - 1].endMinutes);

    return { blocks, used: requestedWorkMins / 60, entryTime, exitTime };
}


// ========================
// Capacidad Diaria Total (Usada para definir horas default en generación)
// ========================
// Esta es diferente de getRegularDailyCap, porque incluye reducciones por defecto.
export function getDailyCapacity(wd, isHoliday, holidayOverride) {
    // Si es festivo trabajado -> 6h
    if (isHoliday && holidayOverride === "work") return HOLIDAY_HOURS;
    // Si es Sábado -> 7h (capacidad normal sábado)
    if (wd === 6) return 7;
    // Si es Lunes a Viernes -> 10h (capacidad normal L-V)
    if (wd >= 1 && wd <= 5) return 10;
    // Si es Domingo o festivo no trabajado -> 0h
    return 0;
}

// ========================
// Generación semanal completa (Lógica actual, sin enfoque de 2 pasadas)
// ========================
export function generateScheduleForRange56(
    fechaInicio, fechaFin, workingWeekdays, holidaySet,
    holidayOverrides = {}, sundayOverrides = {}
) {
    const outWeeks = [];
    let cursor = startOfISOWeek(fechaInicio); // Asegura empezar en Lunes
    const rangeStart = parseDateOnly(fechaInicio);
    const rangeEnd = parseDateOnly(fechaFin);

    if (!cursor || !rangeStart || !rangeEnd) {
        console.error("Fechas inválidas para generar horario:", fechaInicio, fechaFin);
        return { schedule: [] }; // Devolver vacío si las fechas son inválidas
    }


    while (cursor <= rangeEnd) {
        const weekStart = new Date(cursor);
        const weekEnd = addDays(weekStart, 6); // Lunes a Domingo
        const dias = [];
        const workableDays = [];

        // 1. Identificar días laborables y domingos
        for (let i = 0; i < 7; i++) {
            const d = addDays(weekStart, i);
            const ymd = YMD(d);
            if (!ymd || d < rangeStart || d > rangeEnd) continue; // Saltar si YMD es nulo o fuera de rango

            const wd = isoWeekday(d);
            const isSunday = wd === 7;
            const isHoliday = holidaySet?.has?.(ymd) || false;
            const holidayOverride = holidayOverrides[ymd];
            const sundayStatus = isSunday ? sundayOverrides[ymd] : null;

            if (isHoliday && holidayOverride === "skip") continue;

            if (isSunday) {
                dias.push({ fecha: ymd, descripcion: WD_NAME[wd], domingo_estado: sundayStatus || null, horas: 0, horas_base: 0, horas_extra: 0, bloques: null, jornada_entrada: null, jornada_salida: null, jornada_reducida: false });
            } else if (workingWeekdays.includes(wd) || (isHoliday && holidayOverride === "work")) {
                const dayCapacity = getDailyCapacity(wd, isHoliday, holidayOverride); // Capacidad TOTAL esperada
                if (dayCapacity > 0) {
                    workableDays.push({ date: d, ymd, wd, isHoliday, override: holidayOverride, capacity: dayCapacity });
                }
            }
        }

        // 2. Determinar día reducido aleatorio
        const eligibleForReduction = workableDays.filter(d => d.wd >= 1 && d.wd <= 6 && !(d.isHoliday && d.override === 'work'));
        let reducedDayYmd = null;
        if (eligibleForReduction.length > 0) {
            const randomIndex = Math.floor(Math.random() * eligibleForReduction.length);
            reducedDayYmd = eligibleForReduction[randomIndex].ymd;
             // Marcar el día elegido para usarlo después
             const chosenDay = workableDays.find(d => d.ymd === reducedDayYmd);
             if (chosenDay) chosenDay.jornada_reducida = true;
        }

        // 3. Asignar horas día por día
        const dayTotals = new Map();
        let legalLeft = WEEKLY_LEGAL_LIMIT;
        let extraLeft = WEEKLY_EXTRA_LIMIT; // Límite de extras *pagables*

        for (const day of workableDays) {
            const totals = { base: 0, extra: 0, total: 0 };
            const isSaturday = day.wd === 6;
            const isReduced = day.jornada_reducida || false;
            const isHolidayWorked = day.isHoliday && day.override === "work";

            // Determinar horas objetivo para el día
            let targetTotalHours;
            if (isHolidayWorked) targetTotalHours = HOLIDAY_HOURS; // 6h
            else if (isSaturday) targetTotalHours = isReduced ? 6 : 7; // 6h o 7h
            else targetTotalHours = isReduced ? 9 : 10; // 9h o 10h

            // Calcular horas base (legales)
            const dayLegalCap = getLegalCapForDay(day.wd); // 8h L-V, 4h Sáb
            const baseHours = Math.min(targetTotalHours, dayLegalCap, legalLeft);
            totals.base = baseHours;
            legalLeft -= baseHours;

            // Calcular horas extra (pagables)
            const dayExtraPossible = Math.max(0, targetTotalHours - baseHours);
            const dayPayableExtraCap = getPayableExtraCapForDay(day.wd); // 2h L-V, 3h Sáb
            const extraHours = Math.min(dayExtraPossible, dayPayableExtraCap, extraLeft);
            totals.extra = extraHours; // Estas son las extras pagables
            extraLeft -= extraHours;

            // Calcular total final del día y guardar
            totals.total = totals.base + totals.extra; // Total = Base + Extra Pagable (según esta lógica)
            dayTotals.set(day.ymd, totals);
        }

        // 4. Generar objeto final para cada día trabajado
        for (const x of workableDays) {
            const totals = dayTotals.get(x.ymd) || { base: 0, extra: 0, total: 0 };
            const isReduced = x.jornada_reducida || false;
            // El tipo de reducción lo asumimos 'salir-temprano' por defecto en la generación
            const tipoReduccion = isReduced ? 'salir-temprano' : null;

            const dayInfo = getDayInfo(x.wd, x.isHoliday, x.override, isReduced, tipoReduccion);
            const { blocks, entryTime, exitTime } = allocateHoursRandomly(x.ymd, dayInfo, totals.total);

            dias.push({
                fecha: x.ymd, descripcion: WD_NAME[x.wd],
                horas: totals.total, horas_base: totals.base, horas_extra: totals.extra, // Guardar base y extra calculados
                bloques, jornada_entrada: entryTime || null, jornada_salida: exitTime || null,
                domingo_estado: null, // Los domingos ya están
                jornada_reducida: isReduced,
                tipo_jornada_reducida: tipoReduccion, // Guardar el tipo usado
                es_festivo: x.isHoliday || false,
                festivo_trabajado: Boolean(x.isHoliday && x.override === "work"),
                festivo_nombre: x.isHoliday ? (holidaySet.get?.(x.ymd)?.name || 'Festivo') : null // Intentar obtener nombre
            });
        }

        // 5. Ensamblar semana
        outWeeks.push({
            fecha_inicio: YMD(weekStart), // Usar YMD para asegurar formato
            fecha_fin: YMD(weekEnd),     // Usar YMD para asegurar formato
            dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
            total_horas_semana: dias.reduce((s, d) => s + (Number(d.horas) || 0), 0),
        });

        cursor = addDays(weekStart, 7); // Avanzar al siguiente Lunes
    }

    return { schedule: outWeeks };
}