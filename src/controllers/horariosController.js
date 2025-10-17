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

const toFixedNumber = (value) => Number(Number(value || 0).toFixed(2));
const MAX_OVERTIME_PER_DAY = 4; // Horas adicionales permitidas para banco.

const BLOCKING_NOVEDADES = new Set([
  "Incapacidades",
  "Licencias",
  "Vacaciones",
  "Permisos",
  "Estudio",
  "Día de la Familia",
]);

const getLegalCapForDay = (weekday) => {
  if (weekday === 6) return 4;
  if (weekday >= 1 && weekday <= 5) return 8;
  return 0;
};

const getRegularDailyCap = (weekday) => {
  if (weekday === 6) return 6;
  if (weekday >= 1 && weekday <= 5) return 10;
  return 0;
};

const getPayableExtraCapForDay = (weekday) => {
  if (weekday >= 1 && weekday <= 6) return 2;
  return 0;
};

const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const strValue = `${value}`.trim();
  if (!strValue) return null;

  const normalized = strValue.length > 10 ? strValue.slice(0, 10) : strValue;
  const parsed = parseISO(normalized);
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
    const diasIncapacidad = details.diasIncapacidad;
    const parsedNumber = Number(diasIncapacidad);

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
  if (!rawObs || !BLOCKING_NOVEDADES.has(rawObs.tipo_novedad)) {
    return null;
  }

  const details =
    rawObs.details && typeof rawObs.details === "object" ? rawObs.details : {};

  let startCandidate = null;
  let endCandidate = null;

  switch (rawObs.tipo_novedad) {
    case "Vacaciones": {
      startCandidate =
        details.fecha_inicio_vacaciones || rawObs.fecha_novedad || null;

      if (details.fecha_fin_vacaciones) {
        endCandidate = details.fecha_fin_vacaciones;
      } else if (details.fecha_regreso_vacaciones) {
        const regresoDate = parseDateOnly(details.fecha_regreso_vacaciones);
        if (regresoDate) {
          endCandidate = toISODateString(addDays(regresoDate, -1));
        }
      }

      if (!endCandidate) {
        endCandidate =
          details.fecha_inicio_vacaciones || rawObs.fecha_novedad || null;
      }
      break;
    }
    case "Licencias":
      startCandidate = details.fecha_inicio || rawObs.fecha_novedad || null;
      endCandidate = details.fecha_termino || details.fecha_inicio;
      break;
    case "Incapacidades":
      startCandidate = details.fecha_inicio || rawObs.fecha_novedad || null;
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
        rawObs.fecha_novedad ||
        null;
      endCandidate =
        details.fecha_fin ||
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia &&
        rawObs.tipo_novedad === "Día de la Familia"
          ? details.fecha_propuesta_dia_familia
          : null) ||
        rawObs.fecha_novedad ||
        null;
      break;
    default:
      startCandidate = rawObs.fecha_novedad || null;
      endCandidate = rawObs.fecha_novedad || null;
      break;
  }

  const startDate = parseDateOnly(startCandidate);
  if (!startDate) {
    return null;
  }

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

  if (error) {
    throw error;
  }

  return (data || [])
    .map((obs) => normalizeBlockingObservation(obs))
    .filter(Boolean)
    .filter((obs) => obs.rawEnd >= startDate && obs.rawStart <= endDate);
};

const serializeObservationForResponse = (obs) => ({
  id: obs.id,
  tipo: obs.tipo,
  observacion: obs.observacion,
  fecha_inicio: obs.start,
  fecha_fin: obs.end,
});

const applyBankedHours = (weeks, bankEntries) => {
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return { bankUpdates: [], summaries: [] };
  }

  const weekSummariesMap = new Map();
  const bankUpdates = [];

  const shuffleDays = (days) => {
    const arr = [...days];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      if (j !== i) {
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
    }
    return arr;
  };

  for (const entry of bankEntries) {
    let remaining = Number(
      entry.horas_pendientes ?? entry.horas_excedidas ?? 0
    );
    if (remaining <= 0) continue;

    let consumed = 0;
    let firstAppliedWeek = null;
    let lastAppliedWeek = null;

    for (const week of weeks) {
      if (remaining <= 0) break;

      let weekApplied = false;
      const diasAjustados = [];

      const candidates = shuffleDays(
        (week.dias || []).filter(
          (d) => isoWeekday(d.fecha) !== 7 && Number(d.horas || 0) > 0
        )
      );

      for (const day of candidates) {
        const wd = isoWeekday(day.fecha);

        const originalExtra = Number(day.horas_extra || 0);
        const originalBase = Number(day.horas_base || 0);
        let extraRemoved = 0;
        let baseRemoved = 0;

        if (remaining > 0 && originalExtra > 0) {
          extraRemoved = Math.min(originalExtra, remaining);
          day.horas_extra = Math.max(
            0,
            toFixedNumber(originalExtra - extraRemoved)
          );
          day.horas = Math.max(
            0,
            toFixedNumber(Number(day.horas || 0) - extraRemoved)
          );
          remaining = toFixedNumber(remaining - extraRemoved);
          consumed = toFixedNumber(consumed + extraRemoved);
        }

        if (remaining > 0) {
          const updatedBase = Number(day.horas_base || 0);
          if (updatedBase > 0) {
            baseRemoved = Math.min(updatedBase, remaining);
            day.horas_base = Math.max(
              0,
              toFixedNumber(updatedBase - baseRemoved)
            );
            day.horas = Math.max(
              0,
              toFixedNumber(Number(day.horas || 0) - baseRemoved)
            );
            remaining = toFixedNumber(remaining - baseRemoved);
            consumed = toFixedNumber(consumed + baseRemoved);
          }
        }

        if (extraRemoved > 0 || baseRemoved > 0) {
          weekApplied = true;
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
            Number(day.horas || 0)
          );
          day.bloques = blocks;
          day.jornada_entrada = entryTime;
          day.jornada_salida = exitTime;

          diasAjustados.push({
            fecha: day.fecha,
            banco_id: entry.id,
            horas_extra_reducidas: toFixedNumber(extraRemoved),
            horas_legales_reducidas: toFixedNumber(baseRemoved),
          });
        }

        if (remaining <= 0) break;
      }

      // Si aún quedan horas y no hubo candidatos, intentar con el resto
      if (remaining > 0) {
        const remainingDays = shuffleDays(
          (week.dias || []).filter((d) => !candidates.includes(d))
        );
        for (const day of remainingDays) {
          if (remaining <= 0) break;
          if (isoWeekday(day.fecha) === 7 || Number(day.horas || 0) <= 0) {
            continue;
          }

          const wd = isoWeekday(day.fecha);
          const originalExtra = Number(day.horas_extra || 0);
          const originalBase = Number(day.horas_base || 0);
          let extraRemoved = 0;
          let baseRemoved = 0;

          if (remaining > 0 && originalExtra > 0) {
            extraRemoved = Math.min(originalExtra, remaining);
            day.horas_extra = Math.max(
              0,
              toFixedNumber(originalExtra - extraRemoved)
            );
            day.horas = Math.max(
              0,
              toFixedNumber(Number(day.horas || 0) - extraRemoved)
            );
            remaining = toFixedNumber(remaining - extraRemoved);
            consumed = toFixedNumber(consumed + extraRemoved);
          }

          if (remaining > 0) {
            const updatedBase = Number(day.horas_base || 0);
            if (updatedBase > 0) {
              baseRemoved = Math.min(updatedBase, remaining);
              day.horas_base = Math.max(
                0,
                toFixedNumber(updatedBase - baseRemoved)
              );
              day.horas = Math.max(
                0,
                toFixedNumber(Number(day.horas || 0) - baseRemoved)
              );
              remaining = toFixedNumber(remaining - baseRemoved);
              consumed = toFixedNumber(consumed + baseRemoved);
            }
          }

          if (extraRemoved > 0 || baseRemoved > 0) {
            weekApplied = true;
            day.horas_extra_reducidas = toFixedNumber(
              Number(day.horas_extra_reducidas || 0) + extraRemoved
            );
            day.horas_legales_reducidas = toFixedNumber(
              Number(day.horas_legales_reducidas || 0) + baseRemoved
            );
            day.banco_compensacion_id = entry.id;

            const { blocks, entryTime, exitTime } = allocateHoursRandomly(
              day.fecha,
              getDayInfo(
                wd,
                false,
                null,
                Boolean(day.jornada_reducida),
                day.tipo_jornada_reducida || "salir-temprano"
              ),
              Number(day.horas || 0)
            );
            day.bloques = blocks;
            day.jornada_entrada = entryTime;
            day.jornada_salida = exitTime;

            diasAjustados.push({
              fecha: day.fecha,
              banco_id: entry.id,
              horas_extra_reducidas: toFixedNumber(extraRemoved),
              horas_legales_reducidas: toFixedNumber(baseRemoved),
            });
          }
        }
      }

      if (weekApplied) {
        week.total_horas_semana = toFixedNumber(
          (week.dias || []).reduce((sum, d) => sum + Number(d.horas || 0), 0)
        );

        firstAppliedWeek = firstAppliedWeek || week.fecha_inicio;
        lastAppliedWeek = week.fecha_fin;

        const summaryKey = `${week.fecha_inicio}`;
        if (!weekSummariesMap.has(summaryKey)) {
          weekSummariesMap.set(summaryKey, {
            semana_inicio: week.fecha_inicio,
            semana_fin: week.fecha_fin,
            dias: [],
          });
        }
        const summary = weekSummariesMap.get(summaryKey);
        summary.dias.push(...diasAjustados);
      }
    }

    if (consumed > 0) {
      bankUpdates.push({
        id: entry.id,
        horas_consumidas: toFixedNumber(consumed),
        horas_pendientes: Math.max(0, toFixedNumber(remaining)),
        estado: remaining > 0 ? "parcial" : "aplicado",
        semana_aplicada_inicio: firstAppliedWeek,
        semana_aplicada_fin: lastAppliedWeek,
      });
    }
  }

  return {
    bankUpdates,
    summaries: Array.from(weekSummariesMap.values()),
  };
};

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  const { incluir_archivados = "false" } = req.query;
  try {
    let url = `/horarios?select=*&empleado_id=eq.${empleado_id}`; // Si no se solicitan los archivados, solo mostrar públicos

    if (incluir_archivados === "false") {
      url += `&estado_visibilidad=eq.publico`;
    }

    url += `&order=fecha_inicio.desc`;

    const { data } = await supabaseAxios.get(url);
    res.json(data);
  } catch (e) {
    console.error("Error completo:", e);
    res.status(500).json({ message: "Error fetching horarios" });
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
    } = req.body;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res
        .status(400)
        .json({ message: "working_weekdays es requerido." });
    }

    const scheduleStart = parseDateOnly(fecha_inicio);
    const scheduleEnd = parseDateOnly(fecha_fin);

    if (!scheduleStart || !scheduleEnd) {
      return res.status(400).json({
        message: "Las fechas de inicio y fin del horario deben ser válidas.",
      });
    }

    if (scheduleEnd < scheduleStart) {
      return res.status(400).json({
        message: "La fecha final no puede ser anterior a la fecha inicial.",
      });
    }

    const blockingObservations = await fetchBlockingObservationsInRange(
      empleado_id,
      scheduleStart,
      scheduleEnd
    );

    if (blockingObservations.length) {
      return res.status(409).json({
        message:
          "No es posible generar el horario: existe(n) novedad(es) vigente(s) que bloquean el periodo solicitado.",
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
      const baseSelection = bank_entry_ids.length
        ? pendientes.filter((p) => bank_entry_ids.includes(p.id))
        : pendientes;

      const { bankUpdates: updates, summaries } = applyBankedHours(
        horariosSemanales,
        baseSelection
      );
      bankUpdates = updates;
      compensationSummaries = summaries;
    }

    await archivarHorariosPorEmpleado(empleado_id);

    const payloadSemanales = horariosSemanales.map((horario) => ({
      empleado_id,
      tipo: "semanal",
      dias: horario.dias,
      fecha_inicio: horario.fecha_inicio,
      fecha_fin: horario.fecha_fin,
      total_horas_semana: horario.total_horas_semana,
      estado_visibilidad: "publico",
    }));

    const { data: dataSemanales, error: errorSemanales } =
      await supabaseAxios.post("/horarios", payloadSemanales);
    if (errorSemanales) throw errorSemanales;

    for (const update of bankUpdates) {
      await updateHoursBankEntry(update.id, {
        horas_pendientes: update.horas_pendientes,
        estado: update.estado,
        semana_aplicada_inicio: update.semana_aplicada_inicio,
        semana_aplicada_fin: update.semana_aplicada_fin,
      });
    }

    // Intentar enviar el correo electrónico
    let emailStatus = {
      sent: false,
      error: null,
      empleado: null,
    };

    try {
      const {
        data: [empleado],
        error: empleadoError,
      } = await supabaseAxios.get(
        `/empleados?select=nombre_completo,correo_electronico&id=eq.${empleado_id}`
      );

      if (empleadoError || !empleado) {
        emailStatus.error = "No se pudo obtener los datos del empleado";
        console.error("Error obteniendo empleado:", empleadoError);
      } else if (!empleado.correo_electronico) {
        emailStatus.error =
          "El empleado no tiene correo electrónico registrado";
        emailStatus.empleado = empleado.nombre_completo;
        console.error(
          "El empleado no tiene email registrado:",
          empleado.nombre_completo
        );
      } else {
        const subject = `🗓️ Horario asignado: ${fecha_inicio} al ${fecha_fin}`;
        const publicUrl = "https://merkahorro.com/consulta-horarios";
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Horario Asignado</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0;">
        <div style="background-color: #210d65; color: #ffffff; text-align: center; padding: 25px;">
            <h1 style="margin: 0; font-size: 24px;">📅 Horario Asignado</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Sistema de Gestión de Horarios</p>
        </div>
        
        <div style="padding: 30px;">
            <p style="font-size: 18px; color: #210d65; margin: 0 0 20px 0;">
                Hola <strong>${empleado.nombre_completo}</strong>,
            </p>
            
            <p style="color: #333333; font-size: 16px; margin: 0 0 20px 0; line-height: 1.5;">
                Te informamos que tu nuevo horario laboral ha sido generado y asignado exitosamente.
            </p>
            
            <div style="background-color: #f8f9ff; border-left: 3px solid #210d65; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">
                    <strong>Período asignado:</strong>
                </p>
                <p style="font-size: 18px; color: #210d65; text-align: center; margin: 0; font-weight: bold;">
                    ${fecha_inicio} al ${fecha_fin}
                </p>
            </div>
            
            <hr style="border: none; height: 1px; background-color: #e0e0e0; margin: 25px 0;">
            
            <p style="color: #333333; font-size: 16px; text-align: center; margin: 0 0 25px 0; line-height: 1.5;">
                Puedes consultar los detalles completos de tu horario haciendo clic en el siguiente enlace:
            </p>
            
            <div style="text-align: center;">
                <a href="${publicUrl}" style="background-color: #210d65; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 16px; font-weight: bold;">
                    Ver Mi Horario
                </a>
            </div>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; color: #666666; font-size: 14px;">Este es un mensaje automatizado del sistema de horarios.</p>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #666666;">
                Si tienes alguna consulta, contacta a tu supervisor directo.
            </p>
        </div>
    </div>
</body>
</html>
              `;

        await sendEmail(empleado.correo_electronico, subject, htmlContent);
        emailStatus.sent = true;
        emailStatus.empleado = empleado.nombre_completo;
        console.log(
          `Correo enviado exitosamente a: ${empleado.correo_electronico}`
        );
      }
    } catch (emailError) {
      emailStatus.error = `Error al enviar correo: ${emailError.message}`;
      console.error("Error enviando email:", emailError);
    } // Respuesta incluyendo el estado del email

    res.status(201).json({
      ...dataSemanales,
      email_notification: emailStatus,
      horas_compensadas: compensationSummaries,
    });
  } catch (e) {
    console.error("Error detallado en createHorario:", e);
    res.status(500).json({
      message: "Error creating horario",
      error: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const { dias } = req.body;
  try {
    const {
      data: [current],
    } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }
    if (!Array.isArray(dias) || dias.length === 0) {
      return res
        .status(400)
        .json({ message: "El payload debe incluir 'dias' como arreglo." });
    }

    const parsedDays = dias
      .map((day) => ({
        fecha: day.fecha,
        horas: Number(day.horas || 0),
        parsedDate: parseDateOnly(day.fecha),
      }))
      .filter((day) => day.parsedDate);

    if (!parsedDays.length) {
      return res.status(400).json({
        message: "Cada día debe incluir una fecha válida.",
      });
    }

    const previousDays = Array.isArray(current?.dias) ? current.dias : [];
    const previousDayMap = new Map(
      previousDays.map((day) => [day.fecha, Number(day.horas || 0)])
    );
    const previousTotalHours = previousDays.reduce(
      (sum, day) => sum + Number(day.horas || 0),
      0
    );
    const previousWeeklyExcess = Math.max(
      0,
      toFixedNumber(previousTotalHours - WEEKLY_TOTAL_LIMIT)
    );

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
          }));

        if (conflictDays.length) {
          conflicts.push({
            ...serializeObservationForResponse(obs),
            dias_conflictivos: conflictDays,
          });
        }
      }

      if (conflicts.length) {
        return res.status(409).json({
          message:
            "No es posible actualizar el horario: hay novedades vigentes que bloquean las fechas seleccionadas.",
          bloqueos: conflicts,
        });
      }
    }

    const updatedDias = JSON.parse(JSON.stringify(dias));
    const allowOvertime = Boolean(req.body.allow_overtime);
    let legalSum = 0;
    let extraSum = 0;
    let payableExtraSum = 0;
    let totalSum = 0;
    let legalCapacitySum = 0;
    let extraCapacitySum = 0;
    let manualOvertimeDelta = 0;
    let manualOvertimeTotal = 0;
    const manualOvertimeDetails = [];

    for (let i = 0; i < updatedDias.length; i++) {
      const d = updatedDias[i];
      const wd = isoWeekday(new Date(d.fecha));
      const totalHours = Number(d.horas || 0);
      const isReduced = Boolean(d.jornada_reducida);
      const tipoJornadaReducida = d.tipo_jornada_reducida || "salir-temprano";

      const dailyCap = getDailyCapacity(wd, false, null);
      const overtimeCap = dailyCap + MAX_OVERTIME_PER_DAY;
      const effectiveCap = allowOvertime ? overtimeCap : dailyCap;
      if (totalHours > effectiveCap + 1e-6) {
        const capMsg = allowOvertime
          ? `Capacidad manual excedida (${effectiveCap}h)`
          : `Capacidad excedida (${dailyCap}h)`;
        return res.status(400).json({ message: `${capMsg} en ${d.fecha}` });
      }

      if (dailyCap > 0) {
        const previousHours = previousDayMap.get(d.fecha) ?? 0;
        const prevOver = Math.max(0, toFixedNumber(previousHours - dailyCap));
        const newOver = Math.max(0, toFixedNumber(totalHours - dailyCap));
        const deltaOver = toFixedNumber(newOver - prevOver);
        manualOvertimeTotal = toFixedNumber(manualOvertimeTotal + newOver);
        if (deltaOver > 0) {
          manualOvertimeDelta = toFixedNumber(manualOvertimeDelta + deltaOver);
          manualOvertimeDetails.push({
            fecha: d.fecha,
            limite_diario: dailyCap,
            horas_previas: toFixedNumber(previousHours),
            horas_nuevas: toFixedNumber(totalHours),
            excedente_registrado: deltaOver,
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
      extraSum = toFixedNumber(extraSum + extra);
      payableExtraSum = toFixedNumber(payableExtraSum + payableExtra);
      totalSum = toFixedNumber(totalSum + totalHours);

      d.horas_base = base;
      d.horas_extra = extra;

      if (totalHours > 0 && wd !== 7) {
        // Pasar el parámetro tipoJornadaReducida a getDayInfo
        const dayInfo = getDayInfo(
          wd,
          false,
          null,
          isReduced,
          tipoJornadaReducida
        );
        const { blocks, entryTime, exitTime } = allocateHoursRandomly(
          d.fecha,
          dayInfo,
          totalHours
        );
        d.bloques = blocks;
        d.jornada_entrada = entryTime;
        d.jornada_salida = exitTime;
      } else {
        d.bloques = null;
        d.jornada_entrada = null;
        d.jornada_salida = null;
      }
    }

    const legalLimit = Math.min(WEEKLY_LEGAL_LIMIT, legalCapacitySum);
    const extraLimit = Math.min(WEEKLY_EXTRA_LIMIT, extraCapacitySum);

    if (payableExtraSum - extraLimit > 1e-6) {
      return res.status(400).json({
        message:
          "Límite semanal de horas extra (12h) excedido. Reduce las horas extra antes de guardar.",
      });
    }

    if (payableExtraSum > 0 && legalSum + 1e-6 < legalLimit) {
      return res.status(400).json({
        message:
          "No puedes reducir horas legales mientras existan horas extra pendientes en la semana.",
      });
    }

    const updatePayload = {
      dias: updatedDias,
      total_horas_semana: totalSum,
    };

    await supabaseAxios.patch(`/horarios?id=eq.${id}`, updatePayload);

    const weeklyExcesoTotal = Math.max(
      0,
      toFixedNumber(totalSum - WEEKLY_TOTAL_LIMIT)
    );
    const weeklyExcesoDelta = Math.max(
      0,
      toFixedNumber(weeklyExcesoTotal - previousWeeklyExcess)
    );
    const manualOvertimeDeltaPositive = Math.max(
      0,
      toFixedNumber(manualOvertimeDelta)
    );
    const manualOvertimeTotalRounded = toFixedNumber(manualOvertimeTotal);
    const manualOvertimeToRegister = Math.max(
      0,
      toFixedNumber(manualOvertimeDeltaPositive - weeklyExcesoDelta)
    );

    let manualDetailsApplied = manualOvertimeDetails;
    if (manualOvertimeDetails.length && manualOvertimeToRegister > 1e-6) {
      let remainingManual = manualOvertimeToRegister;
      manualDetailsApplied = manualOvertimeDetails.map((detail) => {
        const applicable = Math.max(
          0,
          Math.min(detail.excedente_registrado, remainingManual)
        );
        remainingManual = toFixedNumber(remainingManual - applicable);
        return {
          ...detail,
          registrado_en_banco: toFixedNumber(applicable),
        };
      });
    } else if (manualOvertimeDetails.length) {
      manualDetailsApplied = manualOvertimeDetails.map((detail) => ({
        ...detail,
        registrado_en_banco: 0,
      }));
    }

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

    res.json({
      message: "Updated",
      total_horas: toFixedNumber(totalSum),
      horas_legales: toFixedNumber(legalSum),
      horas_extras: toFixedNumber(extraSum),
      horas_excedentes_registradas: weeklyExcesoTotal,
      horas_excedentes_delta: weeklyExcesoDelta,
      horas_manual_excedentes_registradas: manualOvertimeToRegister,
      horas_manual_totales_semana: manualOvertimeTotalRounded,
      manual_overtime_details: manualDetailsApplied,
    });
  } catch (e) {
    console.error("Error updating horarios:", e);
    res.status(500).json({ message: "Error updating" });
  }
};

export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAxios.delete(`/horarios?id=eq.${id}`);
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("Error eliminando horario:", e);
    res.status(500).json({ message: "Error deleting horario" });
  }
};

export const archivarHorarios = async (req, res) => {
  const { empleado_id } = req.body;
  if (!empleado_id) {
    return res
      .status(400)
      .json({ message: "El ID del empleado es requerido." });
  }
  try {
    // Cambiar estado a "archivado" en lugar de eliminar
    await supabaseAxios.patch(
      `/horarios?empleado_id=eq.${empleado_id}&estado_visibilidad=eq.publico`,
      {
        estado_visibilidad: "archivado",
      }
    );
    res.json({ message: "Horarios del empleado archivados con éxito." });
  } catch (e) {
    console.error("Error archivando horarios:", e);
    res.status(500).json({ message: "Error al archivar los horarios." });
  }
};

const archivarHorariosPorEmpleado = async (empleadoId) => {
  try {
    // Verificar si hay horarios públicos para archivar
    const { data: horariosPublicos } = await supabaseAxios.get(
      `/horarios?select=id&empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`
    );

    if (horariosPublicos && horariosPublicos.length > 0) {
      // Cambiar estado a "archivado" manteniendo los registros
      await supabaseAxios.patch(
        `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`,
        { estado_visibilidad: "archivado" }
      );
      console.log(
        `${horariosPublicos.length} horarios archivados para el empleado ${empleadoId}.`
      );
    } else {
      console.log(
        `No se encontraron horarios públicos para el empleado ${empleadoId}. No se archivó nada.`
      );
    }
  } catch (e) {
    console.error(
      `Error archivando horarios para el empleado ${empleadoId}:`,
      e
    );
    throw e;
  }
};
