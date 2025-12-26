import { addDays, format, parseISO, isValid } from "date-fns";

// --- Constantes de Negocio (SINCRONIZADAS CON BACKEND) ---
export const WEEKLY_LEGAL_LIMIT = 44; // 8h*5 + 4h
export const WEEKLY_EXTRA_LIMIT = 12; // 2h*5 + 2h (o 3h Sáb, backend lo limita a 12)
export const MAX_OVERTIME_PER_DAY = 4; // Horas MÁXIMAS de banco por día

// --- Helpers de Fecha/Hora ---
export const addDaysISO = (iso, n) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const toInt = (value) => Math.max(0, Math.round(Number(value || 0)));

const roundToTwo = (value) => Number(Number(value || 0).toFixed(2));
const EPSILON = 1e-2;

export const isSundayLocal = (ymd) => {
  if (!ymd) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
};

export const weekdayFromYMD = (ymd) => {
  if (!ymd) return -1;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Domingo, 1=Lunes...
};

export const isoWeekdayFromYMD = (ymd) => {
  const weekday = weekdayFromYMD(ymd);
  return weekday === 0 ? 7 : weekday; // 1=Lunes, 7=Domingo
};

export const pad = (value) => String(value).padStart(2, "0");

export const hmToMinutes = (hhmm) => {
  if (typeof hhmm !== "string") return 0;
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export const minutesToHM = (minutes) => {
  if (typeof minutes !== "number" || Number.isNaN(minutes) || minutes < 0)
    return "00:00";
  const hh = Math.floor(minutes / 60);
  const mm = Math.round(minutes % 60);
  return `${pad(hh)}:${pad(mm)}`;
};

export const formatHours = (value) => {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0";
  // Corregido: usar toFixed(1) para un decimal, ej: 7.5
  const fixed = num.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed; // "7.0" -> "7", "7.5" -> "7.5"
};

export const formatTimeLabel = (value) => {
  if (!value || value === "—") return null;
  const [hourStr, minuteStr = "00"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const hour12 = ((hour % 12) + 12) % 12 || 12;
  const period = hour >= 12 ? "p.m." : "a.m.";
  return `${hour12}:${pad(minute)} ${period}`;
};

// --- Lógica de Capacidad (IDÉNTICA AL BACKEND) ---

// Capacidad Legal Máxima (Base para 'horas_base')
export const getLegalCapForDay = (weekday) => {
  if (weekday === 6) return 4; // Sábado
  if (weekday >= 1 && weekday <= 5) return 8; // Lunes a Viernes
  return 0; // Domingo
};

// Capacidad Regular Total (Base para 'banco de horas')
export const getRegularDailyCap = (weekday) => {
  if (weekday === 6) return 7; // Sábado: 7h
  if (weekday >= 1 && weekday <= 5) return 10; // L-V: 10h
  return 0; // Domingo
};

// Capacidad Extra Pagable Máxima (Extras que se pagan)
export const getPayableExtraCapForDay = (weekday) => {
  if (weekday === 6) return 3; // Sábado: 3h (total 7h)
  if (weekday >= 1 && weekday <= 5) return 2; // L-V: 2h (total 10h)
  return 0;
};

// Capacidad Total por Defecto (para generación automática)
export const getDailyCapacity = (wd, isHoliday, holidayOverride) => {
  if (isHoliday && holidayOverride === "work") return 6;
  if (wd === 6) return 7; // Sábado normal
  if (wd >= 1 && wd <= 5) return 10; // L-V normal
  return 0;
};

// --- Lógica de Segmentos (IDÉNTICA AL BACKEND) ---
export const getDayInfo = (
  wd, // ISO Weekday (1-7)
  isHoliday,
  holidayOverride,
  isReduced = false,
  tipoJornadaReducida = "salir-temprano"
) => {
  const BREAKFAST_MINUTES = 15;
  const LUNCH_MINUTES = 45;

  if (isHoliday && holidayOverride === "work") {
    return {
      capacity: 6,
      segments: [{ from: hmToMinutes("07:00"), to: hmToMinutes("13:00") }],
      breaks: [{ start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES }],
    };
  }
  if (wd === 7) return { capacity: 0, segments: [], breaks: [] };

  if (wd === 6) {
    // Sábado
    if (isReduced) {
      // Sábado Reducido (6h)
      if (tipoJornadaReducida === "entrar-tarde") {
        return {
          capacity: 6,
          segments: [
            // 8am-9am (1h) + 9:15am-12pm (2.75h) + 12:45pm-3pm (2.25h) = 6h
            { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("15:00") }, // Salida normal sábado
          ],
          breaks: [
            { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
            { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
          ],
        };
      } else {
        // salir-temprano
        return {
          capacity: 6,
          segments: [
            // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-2pm (1.25h) = 6h
            { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("14:00") }, // Sale 1h antes
          ],
          breaks: [
            { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
            { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
          ],
        };
      }
    } else {
      // Sábado Normal (7h)
      return {
        capacity: 7,
        segments: [
          // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-3pm (2.25h) = 7h
          { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
          { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
          { from: hmToMinutes("12:45"), to: hmToMinutes("15:00") }, // Salida 3pm
        ],
        breaks: [
          { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
          { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
        ],
      };
    }
  }

  // Lunes a Viernes (wd = 1-5)
  if (isReduced) {
    // L-V Reducido (9h)
    if (tipoJornadaReducida === "entrar-tarde") {
      return {
        capacity: 9,
        segments: [
          // 8am-9am (1h) + 9:15am-12pm (2.75h) + 12:45pm-6pm (5.25h) = 9h
          { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
          { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
          { from: hmToMinutes("12:45"), to: hmToMinutes("18:00") }, // Salida normal 6pm
        ],
        breaks: [
          { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
          { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
        ],
      };
    } else {
      // salir-temprano
      return {
        capacity: 9,
        segments: [
          // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-5pm (4.25h) = 9h
          { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
          { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
          { from: hmToMinutes("12:45"), to: hmToMinutes("17:00") }, // Sale 1h antes 5pm
        ],
        breaks: [
          { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
          { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
        ],
      };
    }
  } else {
    // L-V Normal (10h)
    return {
      capacity: 10,
      segments: [
        // 7am-9am (2h) + 9:15am-12pm (2.75h) + 12:45pm-6pm (5.25h) = 10h
        { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
        { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
        { from: hmToMinutes("12:45"), to: hmToMinutes("18:00") }, // Salida 6pm
      ],
      breaks: [
        { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
        { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
      ],
    };
  }
};

// --- Lógica de Asignación (IDÉNTICA AL BACKEND) ---
export const allocateHoursRandomly = (dateISO, dayInfo, hoursNeeded) => {
  if (hoursNeeded <= 0)
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  const { segments } = dayInfo;
  if (!segments || segments.length === 0)
    return { blocks: [], used: 0, entryTime: null, exitTime: null };

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

  if (rawBlocks.length > 0 && remaining > 0) {
    rawBlocks[rawBlocks.length - 1].endMinutes += remaining;
  } else if (rawBlocks.length === 0 && segments.length > 0) {
    rawBlocks.push({
      startMinutes: segments[0].from,
      endMinutes: segments[0].from,
    });
  } else if (rawBlocks.length === 0 && segments.length === 0) {
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }

  const blocks = rawBlocks.map((block) => ({
    start: `${dateISO}T${minutesToHM(block.startMinutes)}:00`,
    end: `${dateISO}T${minutesToHM(block.endMinutes)}:00`,
    hours: (block.endMinutes - block.startMinutes) / 60,
  }));

  const entryTime = minutesToHM(rawBlocks[0].startMinutes);
  const exitTime = minutesToHM(rawBlocks[rawBlocks.length - 1].endMinutes);

  return {
    blocks,
    used: (requestedWorkMins - remaining) / 60,
    entryTime,
    exitTime,
  }; // Corregido: used = requested - remaining
};

// --- Lógica de Bloqueos (IDÉNTICA AL BACKEND) ---

export const BLOCKING_NOVEDAD_TYPES = new Set([
  "Incapacidades",
  "Licencias",
  "Vacaciones",
  "Permisos",
  "Estudio",
  "Día de la Familia",
]);

export const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && isValid(value)) {
    const date = new Date(value.getTime());
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const raw = `${value}`.trim();
  if (!raw) return null;
  const normalized = raw.length > 10 ? raw.slice(0, 10) : raw;
  const parsed = parseISO(normalized + "T00:00:00");
  return isValid(parsed) ? parsed : null;
};

export const inferBlockingEnd = (tipo, startDate, rawEnd, details) => {
  let endDate = parseDateOnly(rawEnd);

  if (!endDate || endDate < startDate) {
    if (tipo === "Vacaciones" && details?.fecha_regreso_vacaciones) {
      const regreso = parseDateOnly(details.fecha_regreso_vacaciones);
      if (regreso) endDate = addDays(regreso, -1);
    }
  }
  if (!endDate || endDate < startDate) {
    const duration = Number(details?.duracion_dias);
    if (!Number.isNaN(duration) && duration > 0) {
      endDate = addDays(startDate, duration - 1);
    }
  }
  if (!endDate || endDate < startDate) {
    let maybeDuration = NaN;
    if (details?.diasIncapacidad) {
      if (typeof details.diasIncapacidad === "number") {
        maybeDuration = details.diasIncapacidad;
      } else if (typeof details.diasIncapacidad === "string") {
        const match = details.diasIncapacidad.match(/\d+/);
        if (match) maybeDuration = Number(match[0]);
      }
    }
    if (!Number.isNaN(maybeDuration) && maybeDuration > 0) {
      endDate = addDays(startDate, maybeDuration - 1);
    }
  }
  if (!endDate || endDate < startDate) {
    endDate = startDate;
  }
  return endDate;
};

export const normalizeBlockingObservation = (obs) => {
  if (!obs) return null;
  const tipo = obs.tipo_novedad || obs.tipo;
  if (!tipo || !BLOCKING_NOVEDAD_TYPES.has(tipo)) return null;

  const details =
    obs.details && typeof obs.details === "object" ? obs.details : {};

  let startCandidate = null,
    endCandidate = null;

  switch (tipo) {
    case "Vacaciones":
      startCandidate = details.fecha_inicio_vacaciones || obs.fecha_novedad;
      endCandidate = details.fecha_fin_vacaciones;
      if (!endCandidate && details.fecha_regreso_vacaciones) {
        const regreso = parseDateOnly(details.fecha_regreso_vacaciones);
        if (regreso) endCandidate = addDays(regreso, -1);
      }
      break;
    case "Licencias":
      startCandidate = details.fecha_inicio || obs.fecha_novedad;
      endCandidate = details.fecha_termino || details.fecha_inicio;
      break;
    case "Incapacidades":
      startCandidate = details.fecha_inicio || obs.fecha_novedad;
      endCandidate = details.fecha_fin || details.fecha_inicio;
      break;
    case "Permisos":
    case "Día de la Familia":
      startCandidate =
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia && tipo === "Día de la Familia") ||
        obs.fecha_novedad;
      endCandidate =
        details.fecha_fin ||
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia && tipo === "Día de la Familia") ||
        obs.fecha_novedad;
      break;
    case "Estudio":
      if (
        details.dias_estudio &&
        Array.isArray(details.dias_estudio) &&
        details.dias_estudio.length > 0
      ) {
        const sorted = [...details.dias_estudio].sort((a, b) =>
          a.fecha.localeCompare(b.fecha)
        );
        startCandidate = sorted[0].fecha;
        endCandidate = sorted[sorted.length - 1].fecha;
      } else {
        startCandidate = details.fecha_inicio || obs.fecha_novedad;
        endCandidate =
          details.fecha_fin || details.fecha_inicio || obs.fecha_novedad;
      }
      break;
    default:
      startCandidate = obs.fecha_novedad;
      endCandidate = obs.fecha_novedad;
  }

  const startDate = parseDateOnly(startCandidate);
  if (!startDate) return null;
  const endDate = inferBlockingEnd(tipo, startDate, endCandidate, details);

  return {
    id: obs.id,
    tipo,
    observacion: obs.observacion || "",
    start: startDate, // Devolver como objeto Date
    end: endDate, // Devolver como objeto Date
    details,
    raw: obs,
  };
};

export const normalizeBlockingList = (list) =>
  (Array.isArray(list) ? list : [])
    .map(normalizeBlockingObservation)
    .filter(Boolean)
    .sort((a, b) => a.start.getTime() - b.start.getTime()); // Comparar con getTime()

export const formatBlockingLabel = (block) => {
  // Asume que block.start y block.end son objetos Date
  try {
    const inicio = format(block.start, "dd/MM/yyyy");
    const fin = format(block.end, "dd/MM/yyyy");
    return inicio === fin ? inicio : `${inicio} al ${fin}`;
  } catch {
    return "Rango inválido";
  }
};

// --- Helpers de Historial (Usados por WeekHistory) ---

export const getWeekPeriod = (fechaInicio, fechaFin) => {
  try {
    const [yS, mS, dS] = fechaInicio.split("-").map(Number);
    const [yE, mE, dE] = fechaFin.split("-").map(Number);
    const start = new Date(yS, mS - 1, dS);
    const end = new Date(yE, mE - 1, dE);

    const startFormatted = start.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const endFormatted = end.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    return `${startFormatted} al ${endFormatted}`;
  } catch {
    return `${fechaInicio} al ${fechaFin}`;
  }
};

export const getSundayStatusForWeek = (week) => {
  const sundayDays =
    week.dias?.filter(
      (day) => day.descripcion === "Domingo" && day.domingo_estado
    ) || [];
  if (sundayDays.length === 0) return null;
  const statuses = [...new Set(sundayDays.map((d) => d.domingo_estado))];
  return statuses.length === 1 ? statuses[0] : "mixto";
};

export const computeBankedReductions = (week) => {
  const dias = Array.isArray(week?.dias) ? week.dias : [];
  return dias.reduce((sum, day) => {
    const extra = Number(day.horas_extra_reducidas || 0);
    const legales = Number(day.horas_legales_reducidas || 0);
    return sum + extra + legales;
  }, 0);
};

export const computeManualReductions = (week) => {
  const dias = Array.isArray(week?.dias) ? week.dias : [];
  const details = [];
  let total = 0;

  dias.forEach((day) => {
    if (!day || !day.horas_reducidas_manualmente) return;
    const original = roundToTwo(day.horas_originales ?? day.horas ?? 0);
    const actual = roundToTwo(day.horas ?? 0);
    const diff = roundToTwo(original - actual);

    if (diff > EPSILON) {
      // Solo contar reducciones
      total = roundToTwo(total + diff);
      details.push({
        fecha: day.fecha,
        descripcion: day.descripcion || "",
        original,
        actual,
        diferencia: diff,
      });
    }
  });

  return { total, details };
};

export const computeWeekSums = (week) => {
  const dias = Array.isArray(week?.dias) ? week.dias : [];
  let baseSum = 0;
  let payableExtraSum = 0;
  let bankSum = 0; // Horas que van AL banco
  let totalSum = 0;
  let reductionSum = 0; // Horas reducidas DESDE el banco

  dias.forEach((day) => {
    if (!day || !day.fecha) return;
    const totalDay = Number(day.horas || 0);
    const baseDay = Number(day.horas_base || 0);
    const extraDay = Number(day.horas_extra || 0);
    const wd = isoWeekdayFromYMD(day.fecha);

    totalSum += totalDay;
    baseSum += baseDay;
    payableExtraSum += Math.min(extraDay, getPayableExtraCapForDay(wd)); // Sumar solo extras pagables

    // Calcular banco (horas > capacidad regular)
    const regularCap = getRegularDailyCap(wd);
    // El banco solo se genera si las horas exceden la capacidad regular
    const bankHours = Math.max(0, totalDay - regularCap);
    // Y está limitado por el máximo diario
    bankSum += Math.min(bankHours, MAX_OVERTIME_PER_DAY);

    // Sumar reducciones (horas gastadas del banco)
    reductionSum +=
      Number(day.horas_extra_reducidas || 0) +
      Number(day.horas_legales_reducidas || 0);
  });

  // El banco de horas total no puede exceder el límite semanal (56h)
  const weeklyExcess = Math.max(
    0,
    totalSum - (WEEKLY_LEGAL_LIMIT + WEEKLY_EXTRA_LIMIT)
  ); // Exceso sobre 56h
  bankSum = Math.max(0, bankSum - weeklyExcess); // El banco es solo lo que está entre la capacidad regular y 56h

  return {
    base: roundToTwo(baseSum),
    extra: roundToTwo(payableExtraSum),
    total: roundToTwo(totalSum),
    bank: roundToTwo(bankSum),
    reduction: roundToTwo(reductionSum),
  };
};

export const describePartialReasons = (week) => {
  const { reduction } = computeWeekSums(week);
  const manualInfo = computeManualReductions(week);
  const dias = Array.isArray(week?.dias) ? week.dias : [];
  const reasons = [];

  if (reduction > EPSILON) {
    reasons.push(`Compensación banco (${formatHours(reduction)}h)`);
  }
  if (manualInfo.total > EPSILON) {
    reasons.push(`Ajustes manuales (-${formatHours(manualInfo.total)}h)`);
  }

  const zeroHourDays = dias.filter((day) => {
    const wd = isoWeekdayFromYMD(day.fecha);
    return wd >= 1 && wd <= 6 && Math.abs(Number(day.horas || 0)) <= EPSILON;
  }).length;

  if (zeroHourDays > 0) {
    reasons.push(`${zeroHourDays} día(s) sin horas`);
  }

  return { labels: reasons };
};

export const subtractTimeRanges = (segments, blockedRanges) => {
  let currentSegments = [...segments];

  for (const block of blockedRanges) {
    const nextSegments = [];
    for (const seg of currentSegments) {
      // Case 1: Block completely covers segment -> Remove segment
      if (block.start <= seg.from && block.end >= seg.to) {
        continue;
      }
      // Case 2: Block is outside segment -> Keep segment
      if (block.end <= seg.from || block.start >= seg.to) {
        nextSegments.push(seg);
        continue;
      }
      // Case 3: Block overlaps
      // Sub-case 3a: Block cuts the start
      if (block.start <= seg.from && block.end < seg.to) {
        nextSegments.push({ from: block.end, to: seg.to });
      }
      // Sub-case 3b: Block cuts the end
      else if (block.start > seg.from && block.end >= seg.to) {
        nextSegments.push({ from: seg.from, to: block.start });
      }
      // Sub-case 3c: Block splits the segment in middle
      else if (block.start > seg.from && block.end < seg.to) {
        nextSegments.push({ from: seg.from, to: block.start });
        nextSegments.push({ from: block.end, to: seg.to });
      }
    }
    currentSegments = nextSegments;
  }
  return currentSegments.sort((a, b) => a.from - b.from);
};
