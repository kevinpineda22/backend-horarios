// src/controllers/horariosController.js
import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleForRange56,
  getDailyCapacity,
  isoWeekday,
  WEEKLY_LEGAL_LIMIT,
  WEEKLY_EXTRA_LIMIT,
  WEEKLY_TOTAL_LIMIT,
  getDayInfo,
  allocateHoursRandomly,
  getLegalCapForDay, // <-- Importación correcta
  getRegularDailyCap, // <-- Importación correcta
  getPayableExtraCapForDay, // <-- Importación correcta
} from "../utils/schedule.js";
import { getHolidaySet } from "../utils/holidays.js";
import { format, parseISO, isValid, addDays } from "date-fns";
import { sendEmail } from "../services/emailService.js";
import {
  createOrUpdateExcess,
  fetchAllPendingForEmpleado,
  updateEntry as updateHoursBankEntry,
  resetForSemana,
} from "./hoursBankController.js";

// --- Constantes y Helpers ---
const toFixedNumber = (value) => Number(Number(value || 0).toFixed(2));
const MAX_OVERTIME_PER_DAY = 4;

const BLOCKING_NOVEDADES = new Set([
  "Incapacidades",
  "Licencias",
  "Vacaciones",
  "Permisos",
  "Estudio",
  "Día de la Familia",
]);

const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  const strValue = `${value}`.trim();
  if (!strValue) return null;
  const normalized = strValue.length > 10 ? strValue.slice(0, 10) : strValue;
  const parsed = parseISO(normalized + "T00:00:00Z");
  return isValid(parsed) ? parsed : null;
};

const toISODateString = (date) => format(date, "yyyy-MM-dd");

const inferEndDate = (startDate, endCandidate, details) => {
  let inferred = parseDateOnly(endCandidate);
  if (!inferred || inferred < startDate) {
    const duration = Number(details?.duracion_dias);
    if (!Number.isNaN(duration) && duration > 0) {
      inferred = addDays(startDate, duration - 1);
    }
  }
  if ((!inferred || inferred < startDate) && details?.diasIncapacidad) {
    let parsedNumber = NaN;
    if (typeof details.diasIncapacidad === "number") {
      parsedNumber = details.diasIncapacidad;
    } else if (typeof details.diasIncapacidad === "string") {
      const match = details.diasIncapacidad.match(/\d+/);
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

const normalizeBlockingObservation = (rawObs) => {
  if (!rawObs || !BLOCKING_NOVEDADES.has(rawObs.tipo_novedad)) return null;
  const details =
    rawObs.details && typeof rawObs.details === "object" ? rawObs.details : {};
  let startCandidate = null,
    endCandidate = null;

  switch (rawObs.tipo_novedad) {
    case "Vacaciones":
      startCandidate = details.fecha_inicio_vacaciones || rawObs.fecha_novedad;
      if (details.fecha_fin_vacaciones)
        endCandidate = details.fecha_fin_vacaciones;
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
      startCandidate =
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia &&
        rawObs.tipo_novedad === "Día de la Familia"
          ? details.fecha_propuesta_dia_familia
          : null) ||
        rawObs.fecha_novedad;
      endCandidate =
        details.fecha_fin ||
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia &&
        rawObs.tipo_novedad === "Día de la Familia"
          ? details.fecha_propuesta_dia_familia
          : null) ||
        rawObs.fecha_novedad;
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
    id: rawObs.id,
    tipo: rawObs.tipo_novedad,
    observacion: rawObs.observacion || "",
    start: toISODateString(startDate),
    end: toISODateString(endDate),
    rawStart: startDate,
    rawEnd: endDate,
  };
};

const fetchBlockingObservationsInRange = async (
  empleadoId,
  startDate,
  endDate
) => {
  const { data, error } = await supabaseAxios.get(
    `/observaciones?select=id,tipo_novedad,observacion,fecha_novedad,details&empleado_id=eq.${empleadoId}&order=fecha_novedad.desc`
  );
  if (error) throw error;
  return (data || [])
    .map(normalizeBlockingObservation)
    .filter(Boolean)
    .filter((obs) => obs.rawEnd >= startDate && obs.rawStart <= endDate);
};

const serializeObservationForResponse = (obs) => ({
  id: obs.id,
  tipo: obs.tipo,
  observacion: obs.observacion,
  fecha_inicio: obs.start,
  fecha_fin: obs.end,
  rawStart: obs.rawStart,
  rawEnd: obs.rawEnd,
});

const applyBankedHours = (weeks, bankEntries) => {
  if (
    !Array.isArray(weeks) ||
    weeks.length === 0 ||
    !Array.isArray(bankEntries) ||
    bankEntries.length === 0
  ) {
    return { bankUpdates: [], summaries: [] };
  }
  const weekSummariesMap = new Map();
  const bankUpdates = [];

  const shuffleDays = (days) => {
    const arr = [...days];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  for (const entry of bankEntries) {
    let remaining = Number(
      entry.horas_pendientes ?? entry.horas_excedidas ?? 0
    );
    if (remaining <= 0) continue;
    let consumed = 0;
    let firstAppliedWeekStart = null;
    let lastAppliedWeekEnd = null;

    for (const week of weeks) {
      if (remaining <= 0) break;
      let weekAppliedHours = 0;
      const diasAjustadosEnSemana = [];
      const candidates = shuffleDays(
        (week.dias || []).filter(
          (d) =>
            isoWeekday(parseDateOnly(d.fecha)) !== 7 && Number(d.horas || 0) > 0
        )
      );

      for (const day of candidates) {
        if (remaining <= 0) break;
        const wd = isoWeekday(parseDateOnly(day.fecha));
        const originalHours = Number(day.horas || 0);
        const originalExtra = Number(day.horas_extra || 0);
        const originalBase = Number(day.horas_base || 0);
        let extraRemoved = 0;
        let baseRemoved = 0;

        if (remaining > 0 && originalExtra > 0) {
          extraRemoved = Math.min(originalExtra, remaining);
          day.horas_extra = toFixedNumber(originalExtra - extraRemoved);
          remaining = toFixedNumber(remaining - extraRemoved);
          consumed = toFixedNumber(consumed + extraRemoved);
          weekAppliedHours = toFixedNumber(weekAppliedHours + extraRemoved);
        }

        if (remaining > 0 && originalBase > 0) {
          const currentBase = Math.max(
            0,
            toFixedNumber(originalHours - extraRemoved)
          );
          baseRemoved = Math.min(currentBase, originalBase, remaining);
          day.horas_base = toFixedNumber(originalBase - baseRemoved);
          remaining = toFixedNumber(remaining - baseRemoved);
          consumed = toFixedNumber(consumed + baseRemoved);
          weekAppliedHours = toFixedNumber(weekAppliedHours + baseRemoved);
        }

        if (extraRemoved > 0 || baseRemoved > 0) {
          day.horas = toFixedNumber(day.horas_base + day.horas_extra);
          day.horas_extra_reducidas = toFixedNumber(
            Number(day.horas_extra_reducidas || 0) + extraRemoved
          );
          day.horas_legales_reducidas = toFixedNumber(
            Number(day.horas_legales_reducidas || 0) + baseRemoved
          );
          day.banco_compensacion_id = entry.id;

          const dayInfo = getDayInfo(
            wd,
            false,
            null,
            Boolean(day.jornada_reducida),
            day.tipo_jornada_reducida || "salir-temprano"
          );
          const { blocks, entryTime, exitTime } = allocateHoursRandomly(
            day.fecha,
            dayInfo,
            day.horas
          );
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
      } // Fin loop días

      if (weekAppliedHours > 0) {
        week.total_horas_semana = toFixedNumber(
          (week.dias || []).reduce((sum, d) => sum + Number(d.horas || 0), 0)
        );
        firstAppliedWeekStart = firstAppliedWeekStart || week.fecha_inicio;
        lastAppliedWeekEnd = week.fecha_fin;

        const summaryKey = week.fecha_inicio;
        if (!weekSummariesMap.has(summaryKey)) {
          weekSummariesMap.set(summaryKey, {
            semana_inicio: week.fecha_inicio,
            semana_fin: week.fecha_fin,
            dias: [],
          });
        }
        weekSummariesMap.get(summaryKey).dias.push(...diasAjustadosEnSemana);
      }
    } // Fin loop semanas

    if (consumed > 0) {
      bankUpdates.push({
        id: entry.id,
        horas_consumidas: consumed,
        horas_pendientes: remaining,
        estado: remaining > 0 ? "parcial" : "aplicado",
        semana_aplicada_inicio: firstAppliedWeekStart,
        semana_aplicada_fin: lastAppliedWeekEnd,
      });
    }
  } // Fin loop bankEntries
  return { bankUpdates, summaries: Array.from(weekSummariesMap.values()) };
};

// --- Endpoints ---

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
    res.json(data || []);
  } catch (e) {
    console.error("Error fetching horarios:", e);
    res
      .status(500)
      .json({ message: "Error fetching horarios", error: e.message });
  }
};

export const createHorario = async (req, res) => {
  try {
    const {
      empleado_id,
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holiday_overrides,
      sunday_overrides,
      apply_banked_hours = false,
      bank_entry_ids = [],
      creado_por,
    } = req.body;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res
        .status(400)
        .json({ message: "working_weekdays es requerido." });
    }
    const scheduleStart = parseDateOnly(fecha_inicio);
    const scheduleEnd = parseDateOnly(fecha_fin);
    if (!scheduleStart || !scheduleEnd)
      return res.status(400).json({ message: "Fechas inválidas." });
    if (scheduleEnd < scheduleStart)
      return res.status(400).json({ message: "Fecha fin anterior a inicio." });

    const blockingObservations = await fetchBlockingObservationsInRange(
      empleado_id,
      scheduleStart,
      scheduleEnd
    );
    if (blockingObservations.length) {
      return res.status(409).json({
        message: "Conflicto: Periodo bloqueado por novedades existentes.",
        bloqueos: blockingObservations.map(serializeObservationForResponse),
      });
    }

    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);
    const { schedule: horariosSemanales } = generateScheduleForRange56(
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holidaySet,
      holiday_overrides || {},
      sunday_overrides || {}
    );

    let bankUpdates = [];
    let compensationSummaries = [];
    if (apply_banked_hours) {
      const pendientes = await fetchAllPendingForEmpleado(empleado_id);
      const selection = bank_entry_ids.length
        ? pendientes.filter((p) => bank_entry_ids.includes(p.id))
        : pendientes;
      const { bankUpdates: updates, summaries } = applyBankedHours(
        horariosSemanales,
        selection
      );
      bankUpdates = updates;
      compensationSummaries = summaries;
    }

    await archivarHorariosPorEmpleado(empleado_id);

    const creatorValue =
      typeof creado_por === "string" && creado_por.trim().length > 0
        ? creado_por.trim()
        : null;

    const payloadSemanales = horariosSemanales.map((h) => ({
      ...h,
      empleado_id,
      tipo: "semanal",
      estado_visibilidad: "publico",
      creado_por: creatorValue,
    }));
    const { data: dataSemanales, error: errorSemanales } =
      await supabaseAxios.post("/horarios", payloadSemanales, {
        headers: { Prefer: "return=representation" },
      });
    if (errorSemanales) throw errorSemanales;

    for (const update of bankUpdates) {
      await updateHoursBankEntry(update.id, {
        horas_pendientes: update.horas_pendientes,
        estado: update.estado,
        semana_aplicada_inicio: update.semana_aplicada_inicio,
        semana_aplicada_fin: update.semana_aplicada_fin,
      });
    }

    let emailStatus = { sent: false, error: null, empleado: null };
    try {
      const {
        data: [emp],
        error: empErr,
      } = await supabaseAxios.get(
        `/empleados?select=nombre_completo,correo_electronico&id=eq.${empleado_id}`
      );
      if (empErr || !emp) {
        emailStatus.error = "No se pudo obtener datos del empleado";
      } else if (!emp.correo_electronico) {
        emailStatus.error = "Empleado sin correo";
        emailStatus.empleado = emp.nombre_completo;
      } else {
        const subject = `🗓️ Horario asignado: ${fecha_inicio} al ${fecha_fin}`;
        const publicUrl = "https://merkahorro.com/consulta-horarios"; // Cambia si es necesario
        const htmlContent = `
                    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Horario Asignado</title></head>
                    <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0;">
                        <div style="background-color: #210d65; color: #ffffff; text-align: center; padding: 25px;">
                            <h1 style="margin: 0; font-size: 24px;">📅 Horario Asignado</h1>
                        </div>
                        <div style="padding: 30px;">
                            <p style="font-size: 18px; color: #210d65; margin: 0 0 20px 0;">Hola <strong>${emp.nombre_completo}</strong>,</p>
                            <p style="color: #333333; font-size: 16px; margin: 0 0 20px 0; line-height: 1.5;">
                                Te informamos que tu nuevo horario laboral ha sido generado y asignado:
                            </p>
                            <div style="background-color: #f8f9ff; border-left: 3px solid #210d65; padding: 15px; margin: 20px 0;">
                                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px;"><strong>Período asignado:</strong></p>
                                <p style="font-size: 18px; color: #210d65; text-align: center; margin: 0; font-weight: bold;">
                                    ${fecha_inicio} al ${fecha_fin}
                                </p>
                            </div>
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${publicUrl}" style="background-color: #210d65; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 16px; font-weight: bold;">
                                    Ver Mi Horario
                                </a>
                            </div>
                        </div>
                        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0; color: #666666; font-size: 14px;">Este es un mensaje automatizado.</p>
                        </div>
                    </div>
                    </body></html>`;
        await sendEmail(emp.correo_electronico, subject, htmlContent);
        emailStatus.sent = true;
        emailStatus.empleado = emp.nombre_completo;
      }
    } catch (emailError) {
      emailStatus.error = `Error enviando correo: ${emailError.message}`;
    }

    res.status(201).json({
      horarios: dataSemanales || [],
      email_notification: emailStatus,
      horas_compensadas: compensationSummaries,
    });
  } catch (e) {
    console.error("Error detallado en createHorario:", e);
    res.status(500).json({
      message: "Error creating horario",
      error: e.message,
      stack: e.stack,
    });
  }
};

// --- FUNCIÓN updateHorario CORREGIDA ---
export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const { dias } = req.body;
  try {
    // 1. Obtener el horario actual
    const {
      data: [current],
      error: fetchError,
    } = await supabaseAxios.get(
      `/horarios?select=id,empleado_id,fecha_inicio,fecha_fin,dias&id=eq.${id}`
    );
    if (fetchError) throw fetchError;
    if (!current) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }
    if (!Array.isArray(dias) || dias.length === 0) {
      return res.status(400).json({
        message: "El payload debe incluir 'dias' como un arreglo válido.",
      });
    }

    // 2. Validar fechas y parsear días
    const parsedDays = dias
      .map((day) => ({
        ...day,
        horas: Number(day.horas || 0),
        parsedDate: parseDateOnly(day.fecha),
      }))
      .filter((day) => day.parsedDate);

    if (!parsedDays.length || parsedDays.length !== dias.length) {
      return res.status(400).json({
        message:
          "Todos los días deben incluir una fecha válida en formato YYYY-MM-DD.",
      });
    }

    // 3. Verificar bloqueos
    const minDate = parsedDays.reduce(
      (acc, day) => (day.parsedDate < acc ? day.parsedDate : acc),
      parsedDays[0].parsedDate
    );
    const maxDate = parsedDays.reduce(
      (acc, day) => (day.parsedDate > acc ? day.parsedDate : acc),
      parsedDays[0].parsedDate
    );
    const blockingObservations = await fetchBlockingObservationsInRange(
      current.empleado_id,
      minDate,
      maxDate
    );

    if (blockingObservations.length) {
      const conflicts = [];
      for (const obs of blockingObservations) {
        const conflictDays = parsedDays
          .filter(
            (day) =>
              day.horas > 0 &&
              day.parsedDate >= obs.rawStart &&
              day.parsedDate <= obs.rawEnd
          )
          .map((day) => ({
            fecha: day.fecha,
            horas: day.horas,
            descripcion: day.descripcion,
          }));

        if (conflictDays.length) {
          conflicts.push({
            ...serializeObservationForResponse(obs),
            dias_conflictivos: conflictDays,
          });
        }
      }
      if (conflicts.length) {
        const conflictDetails = conflicts
          .map(
            (c) =>
              `<li>${c.tipo} (${format(c.rawStart, "dd/MM")} - ${format(
                c.rawEnd,
                "dd/MM"
              )}) bloquea: ${c.dias_conflictivos
                .map((d) => d.descripcion || d.fecha)
                .join(", ")}</li>`
          )
          .join("");
        return res.status(409).json({
          message:
            "Conflicto: No se pueden asignar horas a días bloqueados por novedades.",
          bloqueos: conflicts,
          htmlMessage: `No se pueden guardar los cambios porque algunos días con horas asignadas ahora están bloqueados:<ul>${conflictDetails}</ul> Ajusta las horas a 0 para esos días.`,
        });
      }
    }

    // 4. Preparar datos previos para deltas del banco
    const previousDays = Array.isArray(current?.dias) ? current.dias : [];
    const previousDayMap = new Map(previousDays.map((day) => [day.fecha, day]));
    const previousTotalHours = previousDays.reduce(
      (sum, day) => sum + Number(day.horas || 0),
      0
    );
    const previousWeeklyExcess = Math.max(
      0,
      toFixedNumber(
        previousTotalHours - (WEEKLY_LEGAL_LIMIT + WEEKLY_EXTRA_LIMIT)
      )
    ); // Exceso > 56h (Usando constantes)

    // 5. Recalcular horas base, extra, bloques y deltas del banco
    const updatedDiasRecalculated = [];
    // const allowOvertime = Boolean(req.body.allow_overtime); // <-- Esta línea ya no es necesaria
    let legalSum = 0,
      payableExtraSum = 0,
      totalSum = 0;
    let legalCapacitySum = 0,
      extraCapacitySum = 0;
    let manualOvertimeDelta = 0,
      manualOvertimeTotal = 0;
    const manualOvertimeDetails = [];

    for (const dayDataFromFrontend of parsedDays) {
      const day = { ...dayDataFromFrontend };
      const wd = isoWeekday(day.parsedDate);
      const totalHours = day.horas;

      const regularCap = getRegularDailyCap(wd);
      const overtimeLimit = regularCap + MAX_OVERTIME_PER_DAY;

      if (totalHours > overtimeLimit + 1e-6) {
        return res.status(400).json({
          message: `Límite diario (${overtimeLimit}h) excedido en ${day.fecha}`,
        });
      }

      if (regularCap > 0) {
        const previousDayInfo = previousDayMap.get(day.fecha);
        const previousHours = Number(previousDayInfo?.horas || 0);
        const prevOverRegular = Math.max(
          0,
          toFixedNumber(previousHours - regularCap)
        );
        const newOverRegular = Math.max(
          0,
          toFixedNumber(totalHours - regularCap)
        );
        manualOvertimeTotal = toFixedNumber(
          manualOvertimeTotal + newOverRegular
        );
        const deltaOver = toFixedNumber(newOverRegular - prevOverRegular);
        if (deltaOver !== 0) {
          manualOvertimeDelta = toFixedNumber(manualOvertimeDelta + deltaOver);
          manualOvertimeDetails.push({
            fecha: day.fecha,
            limite_regular_diario: regularCap,
            horas_previas: toFixedNumber(previousHours),
            horas_nuevas: toFixedNumber(totalHours),
            excedente_delta: deltaOver,
          });
        }
      }

      const legalCapForDay = getLegalCapForDay(wd);
      const payableExtraCap = getPayableExtraCapForDay(wd);

      const base = Math.min(totalHours, legalCapForDay);
      const extra = Math.max(0, totalHours - base);
      const payableExtra = Math.min(extra, payableExtraCap);

      if (totalHours > 0 && legalCapForDay > 0) {
        legalCapacitySum = toFixedNumber(legalCapacitySum + legalCapForDay);
        extraCapacitySum = toFixedNumber(extraCapacitySum + payableExtraCap);
      }

      legalSum = toFixedNumber(legalSum + base);
      payableExtraSum = toFixedNumber(payableExtraSum + payableExtra);
      totalSum = toFixedNumber(totalSum + totalHours);

      day.horas_base = base;
      day.horas_extra = extra;

      if (totalHours > 0 && wd !== 7) {
        const dayInfo = getDayInfo(
          wd,
          false,
          null,
          Boolean(day.jornada_reducida),
          day.tipo_jornada_reducida || "salir-temprano"
        );
        const { blocks, entryTime, exitTime } = allocateHoursRandomly(
          day.fecha,
          dayInfo,
          totalHours
        );
        day.bloques = blocks;
        day.jornada_entrada = entryTime;
        day.jornada_salida = exitTime;
      } else {
        day.horas_base = 0;
        day.horas_extra = 0;
        day.bloques = null;
        day.jornada_entrada = null;
        day.jornada_salida = null;
        if (totalHours <= 0) {
          day.horas_reducidas_manualmente = null;
          day.horas_originales = null;
        }
      }

      delete day.parsedDate;
      updatedDiasRecalculated.push(day);
    }

    // 6. Validaciones semanales
    const legalLimit = Math.min(WEEKLY_LEGAL_LIMIT, legalCapacitySum);
    const extraLimit = Math.min(WEEKLY_EXTRA_LIMIT, extraCapacitySum);

    if (payableExtraSum - extraLimit > 1e-6) {
      return res.status(400).json({
        message: `Límite semanal de extras pagables (${extraLimit}h) excedido. Horas extra calculadas: ${payableExtraSum}h.`,
      });
    }
    if (payableExtraSum > 0 && legalSum + 1e-6 < legalLimit) {
      return res.status(400).json({
        message:
          "No puedes tener horas extra si no se cumplen las horas legales de la semana.",
      });
    }

    // 7. Preparar payload final y actualizar horario
    const updatePayload = {
      dias: updatedDiasRecalculated,
      total_horas_semana: totalSum,
      // allow_overtime: allowOvertime, // <-- LÍNEA ELIMINADA
    };
    const { error: updateError } = await supabaseAxios.patch(
      `/horarios?id=eq.${id}`,
      updatePayload
    );
    if (updateError) throw updateError;

    // 8. Actualizar (o resetear) registro en el banco de horas
    const weeklyExcesoTotal = Math.max(
      0,
      toFixedNumber(totalSum - (WEEKLY_LEGAL_LIMIT + WEEKLY_EXTRA_LIMIT))
    );
    const weeklyExcesoDelta = toFixedNumber(
      weeklyExcesoTotal - previousWeeklyExcess
    );
    const manualOvertimeDeltaNeto = toFixedNumber(manualOvertimeDelta);
    const manualOvertimeTotalRounded = toFixedNumber(manualOvertimeTotal);
    const manualOvertimeToRegister = Math.max(
      0,
      toFixedNumber(manualOvertimeDeltaNeto - Math.max(0, weeklyExcesoDelta))
    );

    if (weeklyExcesoDelta > 0) {
      await createOrUpdateExcess({
        empleadoId: current.empleado_id,
        semanaInicio: current.fecha_inicio,
        semanaFin: current.fecha_fin,
        horasExcedidas: weeklyExcesoDelta,
      });
    }
    if (manualOvertimeToRegister > 0) {
      await createOrUpdateExcess({
        empleadoId: current.empleado_id,
        semanaInicio: current.fecha_inicio,
        semanaFin: current.fecha_fin,
        horasExcedidas: manualOvertimeToRegister,
      });
    }
    if (weeklyExcesoTotal <= 0 && manualOvertimeTotalRounded <= 0) {
      await resetForSemana({
        empleadoId: current.empleado_id,
        semanaInicio: current.fecha_inicio,
        semanaFin: current.fecha_fin,
      });
    }

    // 9. Enviar respuesta exitosa
    res.json({
      message: "Horario actualizado con éxito.",
      total_horas: totalSum,
      horas_legales: legalSum,
      horas_extras_pagables: payableExtraSum,
      horas_al_banco_registradas_neto: manualOvertimeToRegister,
    });
  } catch (e) {
    console.error("Error updating horarios:", e);
    res.status(500).json({
      message: "Error al actualizar el horario",
      error: e.response?.data?.message || e.message,
      details: e.response?.data || e.stack,
    });
  }
};

// DELETE /horarios/:id
export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    const { error, count } = await supabaseAxios.delete(
      `/horarios?id=eq.${id}`,
      { count: "exact" }
    );
    if (error && error.code !== "PGRST204") throw error;
    if (count === 0) {
      console.warn(`Intento de eliminar horario ${id} no encontrado.`);
      return res
        .status(204)
        .json({ message: "Horario no encontrado o ya eliminado." });
    }
    res.json({ message: "Horario eliminado correctamente" });
  } catch (e) {
    console.error("Error eliminando horario:", e);
    res.status(500).json({
      message: "Error al eliminar el horario",
      error: e.response?.data?.message || e.message,
    });
  }
};

// PATCH /horarios/archivar
export const archivarHorarios = async (req, res) => {
  const { empleado_id } = req.body;
  if (!empleado_id)
    return res.status(400).json({ message: "ID de empleado requerido." });
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

// Función auxiliar archivarHorariosPorEmpleado
const archivarHorariosPorEmpleado = async (empleadoId) => {
  try {
    const { count, error } = await supabaseAxios.patch(
      `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`,
      { estado_visibilidad: "archivado" },
      { count: "exact" }
    );
    if (error) throw error;
    if (count > 0)
      console.log(`${count} horarios archivados para ${empleadoId}.`);
    else
      console.log(`No hay horarios públicos para archivar para ${empleadoId}.`);
  } catch (e) {
    console.error(`Error archivando para ${empleadoId}:`, e);
    throw e;
  }
};
