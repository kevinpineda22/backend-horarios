// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format,
  parseISO,
  isValid,
} from "date-fns";

// ========================
// Constantes de negocio
// ========================
const DAILY_LEGAL_LIMIT = 8;
const SATURDAY_LEGAL_LIMIT = 4;
export const WEEKLY_LEGAL_LIMIT = 44;
export const WEEKLY_EXTRA_LIMIT = 12;
export const WEEKLY_TOTAL_LIMIT = 56;
const HOLIDAY_HOURS = 6;

const BREAKFAST_MINUTES = 15;
const LUNCH_MINUTES = 45;

// ========================
// Helpers de fecha/hora
// ========================
const pad = (n) => String(n).padStart(2, "0");

export const YMD = (d) => {
  if (!d || !(d instanceof Date) || !isValid(d)) return null;
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  return `${year}-${month}-${day}`;
};

export const addDays = (d, n) => {
  const date = d instanceof Date ? new Date(d) : parseISO(d + "T00:00:00Z");
  if (!isValid(date)) return null;
  date.setUTCDate(date.getUTCDate() + n);
  return date;
};

export const startOfISOWeek = (d) => {
  const date = d instanceof Date ? new Date(d) : parseISO(d + "T00:00:00Z");
  if (!isValid(date)) return null;
  return dfStartOfWeek(date, { weekStartsOn: 1 });
};

export const isoWeekday = (d) => {
  const date = d instanceof Date ? d : parseISO(d + "T00:00:00Z");
  if (!isValid(date)) return 0;
  const wd = date.getUTCDay();
  return wd === 0 ? 7 : wd;
};

const hmToMinutes = (hhmm) => {
  if (typeof hhmm !== "string") return 0;
  const [hh, mm] = hhmm.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

const minutesToHM = (m) => {
  if (typeof m !== "number" || Number.isNaN(m) || m < 0) return "00:00";
  const totalMinutes = Math.round(m);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${pad(hh)}:${pad(mm)}`;
};

const subtractTimeRanges = (segments, blockedRanges) => {
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

// ========================
// Nombres de días
// ========================
const WD_NAME = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

// ========================
// Lógica de Capacidad (¡CON EXPORTS CORREGIDOS!)
// ========================

// Capacidad Legal Máxima (Base para 'horas_base')
// Acepta un `cfg` opcional (de buildScheduleConfig). Si la config no define
// el tope diario, cae a los valores legales actuales (8 L-V / 4 Sáb).
export const getLegalCapForDay = (weekday, cfg = null) => {
  if (weekday === 6) return Number(cfg?.limites?.legalDiarioSabado ?? 4); // Sábado
  if (weekday >= 1 && weekday <= 5)
    return Number(cfg?.limites?.legalDiarioSemana ?? 8); // Lunes a Viernes
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
export function getDailyCapacity(wd, isHoliday, holidayOverride) {
  if (isHoliday && holidayOverride === "work") return HOLIDAY_HOURS;
  if (wd === 6) return 7; // Sábado normal
  if (wd >= 1 && wd <= 5) return 10; // L-V normal
  return 0;
}

// ========================
// Info de día (Segmentos y Descansos)
// ========================
export function getDayInfo(
  wd, // ISO Weekday (1-7)
  isHoliday,
  holidayOverride,
  isReduced = false,
  tipoJornadaReducida = "salir-temprano"
) {
  const BREAKFAST_MINUTES = 15;
  const LUNCH_MINUTES = 45;

  if (isHoliday && holidayOverride === "work") {
    return {
      capacity: HOLIDAY_HOURS,
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
            { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("15:00") },
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
            { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("14:00") },
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
          { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
          { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
          { from: hmToMinutes("12:45"), to: hmToMinutes("15:00") },
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
          { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
          { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
          { from: hmToMinutes("12:45"), to: hmToMinutes("18:00") },
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
          { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
          { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
          { from: hmToMinutes("12:45"), to: hmToMinutes("17:00") },
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
        { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
        { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
        { from: hmToMinutes("12:45"), to: hmToMinutes("18:00") },
      ],
      breaks: [
        { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
        { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
      ],
    };
  }
}

// ========================
// Asignación de horas en bloques
// ========================
export function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
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
  };
}

// ========================
// Generación semanal completa
// ========================
export function generateScheduleForRange56(
  fechaInicio,
  fechaFin,
  workingWeekdays,
  holidaySet,
  holidayOverrides = {},
  sundayOverrides = {},
  partialObservations = [],
  cfg = null // Config de negocio (buildScheduleConfig). Null => usa los defaults legales actuales.
) {
  const outWeeks = [];
  let cursor = startOfISOWeek(fechaInicio);
  const rangeStart = parseISO(fechaInicio + "T00:00:00Z");
  const rangeEnd = parseISO(fechaFin + "T00:00:00Z");

  if (!cursor || !isValid(rangeStart) || !isValid(rangeEnd)) {
    console.error(
      "Fechas inválidas para generar horario:",
      fechaInicio,
      fechaFin
    );
    return { schedule: [] };
  }

  // Límites efectivos: lo que defina el panel, o el valor legal actual como fallback.
  // Con la tabla ph_parametros_globales vacía, esto es idéntico al comportamiento previo.
  const weeklyLegalLimit = Number(cfg?.limites?.legalSemanal ?? WEEKLY_LEGAL_LIMIT);
  const weeklyExtraLimit = Number(cfg?.limites?.extraSemanal ?? WEEKLY_EXTRA_LIMIT);
  const holidayHours = Number(cfg?.limites?.horasFestivoTrabajado ?? HOLIDAY_HOURS);

  while (cursor <= rangeEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = addDays(weekStart, 6);
    const dias = [];
    const workableDays = [];

    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const ymd = YMD(d);
      if (!ymd || d < rangeStart || d > rangeEnd) continue;

      const wd = isoWeekday(d);
      const isSunday = wd === 7;
      const isHoliday = holidaySet?.has?.(ymd); // .has() es correcto para Map
      const holidayOverride = holidayOverrides[ymd];
      const sundayStatus = isSunday ? sundayOverrides[ymd] : null;

      if (isHoliday && holidayOverride === "skip") continue;

      if (isSunday) {
        dias.push({
          fecha: ymd,
          descripcion: WD_NAME[wd],
          domingo_estado: sundayStatus || null,
          horas: 0,
          horas_base: 0,
          horas_extra: 0,
          bloques: null,
          jornada_entrada: null,
          jornada_salida: null,
          jornada_reducida: false,
        });
      } else if (
        workingWeekdays.includes(wd) ||
        (isHoliday && holidayOverride === "work")
      ) {
        const dayCapacity = getDailyCapacity(wd, isHoliday, holidayOverride);
        if (dayCapacity > 0) {
          const holidayInfo = isHoliday
            ? holidaySet.get(ymd) || { name: "Festivo" }
            : null;
          workableDays.push({
            date: d,
            ymd,
            wd,
            isHoliday,
            holidayName: holidayInfo?.name || null,
            override: holidayOverride,
            capacity: dayCapacity,
          });
        }
      }
    }

    const eligibleForReduction = workableDays.filter(
      (d) => d.wd >= 1 && d.wd <= 6 && !(d.isHoliday && d.override === "work")
    );
    let reducedDayYmd = null;
    if (eligibleForReduction.length > 0) {
      const randomIndex = Math.floor(
        Math.random() * eligibleForReduction.length
      );
      reducedDayYmd = eligibleForReduction[randomIndex].ymd;
      const chosenDay = workableDays.find((d) => d.ymd === reducedDayYmd);
      if (chosenDay) chosenDay.jornada_reducida = true;
    }

    const dayTotals = new Map();
    let legalLeft = weeklyLegalLimit;
    let extraLeft = weeklyExtraLimit;

    for (const day of workableDays) {
      const totals = { base: 0, extra: 0, total: 0 };
      const isSaturday = day.wd === 6;
      const isReduced = day.jornada_reducida || false;
      const isHolidayWorked = day.isHoliday && day.override === "work";

      let targetTotalHours;
      if (isHolidayWorked) targetTotalHours = holidayHours; // festivo trabajado
      else if (isSaturday) targetTotalHours = isReduced ? 6 : 7; // 6h o 7h
      else targetTotalHours = isReduced ? 9 : 10; // 9h o 10h

      // Check for partial observations (Estudio)
      let absenceMinutes = 0;
      const studyRanges = []; // <-- Collect ranges for subtraction

      if (partialObservations && partialObservations.length > 0) {
        for (const obs of partialObservations) {
          if (day.ymd >= obs.start && day.ymd <= obs.end) {
            if (obs.details && obs.details.dias_estudio) {
              // Try to find by specific date (new format)
              let dayConfig = obs.details.dias_estudio.find(
                (d) => d.fecha === day.ymd
              );

              // If not found, try to find by weekday (old format)
              if (!dayConfig) {
                dayConfig = obs.details.dias_estudio.find(
                  (d) => d.dia === day.wd
                );
              }

              if (dayConfig && dayConfig.inicio && dayConfig.fin) {
                const startMins = hmToMinutes(dayConfig.inicio);
                const endMins = hmToMinutes(dayConfig.fin);
                if (endMins > startMins) {
                  absenceMinutes += endMins - startMins;
                  studyRanges.push({ start: startMins, end: endMins });
                }
              }
            }
          }
        }
      }
      day.studyRanges = studyRanges; // Store for later use in allocation
      const absenceHours = absenceMinutes / 60;
      targetTotalHours = Math.max(0, targetTotalHours - absenceHours);

      const dayLegalCap = getLegalCapForDay(day.wd, cfg);
      const baseHours = Math.min(targetTotalHours, dayLegalCap, legalLeft);
      totals.base = baseHours;
      legalLeft -= baseHours;

      const dayExtraPossible = Math.max(0, targetTotalHours - baseHours);
      const dayPayableExtraCap = getPayableExtraCapForDay(day.wd);
      const extraHours = Math.min(
        dayExtraPossible,
        dayPayableExtraCap,
        extraLeft
      );
      totals.extra = extraHours;
      extraLeft -= extraHours;

      totals.total = totals.base + totals.extra;
      dayTotals.set(day.ymd, totals);
    }

    for (const x of workableDays) {
      const totals = dayTotals.get(x.ymd) || { base: 0, extra: 0, total: 0 };
      const isReduced = x.jornada_reducida || false;
      const tipoReduccion = isReduced ? "salir-temprano" : null;

      const dayInfo = getDayInfo(
        x.wd,
        x.isHoliday,
        x.override,
        isReduced,
        tipoReduccion
      );

      // --- Apply Study Ranges Subtraction ---
      if (x.studyRanges && x.studyRanges.length > 0) {
        dayInfo.segments = subtractTimeRanges(dayInfo.segments, x.studyRanges);
      }
      // --------------------------------------

      // --- ¡AQUÍ ESTÁ LA CORRECCIÓN! ---
      const { blocks, entryTime, exitTime } = allocateHoursRandomly(
        x.ymd,
        dayInfo,
        totals.total
      );

      dias.push({
        fecha: x.ymd,
        descripcion: WD_NAME[x.wd],
        horas: totals.total,
        horas_base: totals.base,
        horas_extra: totals.extra,
        bloques: blocks, // <-- Asignar 'blocks' (con 's') a la propiedad 'bloques'
        jornada_entrada: entryTime || null,
        jornada_salida: exitTime || null,
        domingo_estado: null,
        jornada_reducida: isReduced,
        tipo_jornada_reducida: tipoReduccion,
        es_festivo: x.isHoliday || false,
        festivo_trabajado: Boolean(x.isHoliday && x.override === "work"),
        festivo_nombre: x.holidayName,
      });
      // --- FIN DE LA CORRECCIÓN ---
    }

    outWeeks.push({
      fecha_inicio: YMD(weekStart),
      fecha_fin: YMD(weekEnd),
      dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      total_horas_semana: dias.reduce((s, d) => s + (Number(d.horas) || 0), 0),
    });

    cursor = addDays(weekStart, 7);
  }

  return { schedule: outWeeks };
}

// ============================================================================
// Generación por TURNO FIJO (spec: 07-16 / 09-18 con sábado derivado)
// ----------------------------------------------------------------------------
// Modelo determinista: cada colaborador tiene un turno base. L-V trabaja su
// ventana menos 1h de descanso (8h netas legales); el sábado, la ventana
// derivada continua (4h). Sin generación aleatoria ni día reducido. Las extras
// NO se generan acá: son manuales (Fase 3).
// ============================================================================

// "07:00:00" (time de Supabase) o "07:00" -> "07:00"
const normalizeHM = (t) => (typeof t === "string" ? t.slice(0, 5) : null);

// Segmentos de trabajo de un turno en un día, descontando descansos.
// withBreaks=true (L-V): desayuno 15' a las +2h y almuerzo 45' a las +5h => -1h.
// withBreaks=false (sábado): bloque continuo, sin descanso.
function buildShiftSegments(entrada, salida, withBreaks) {
  const start = hmToMinutes(entrada);
  const end = hmToMinutes(salida);
  if (!(end > start)) return { segments: [], netHours: 0 };
  if (!withBreaks) {
    return {
      segments: [{ from: start, to: end }],
      netHours: (end - start) / 60,
    };
  }
  const blocked = [
    { start: start + 120, end: start + 120 + BREAKFAST_MINUTES },
    { start: start + 300, end: start + 300 + LUNCH_MINUTES },
  ];
  const segments = subtractTimeRanges([{ from: start, to: end }], blocked);
  const netHours =
    segments.reduce((s, seg) => s + (seg.to - seg.from), 0) / 60;
  return { segments, netHours };
}

function segmentsToBlocks(dateISO, segments) {
  return segments.map((seg) => ({
    start: `${dateISO}T${minutesToHM(seg.from)}:00`,
    end: `${dateISO}T${minutesToHM(seg.to)}:00`,
    hours: (seg.to - seg.from) / 60,
  }));
}

const emptyDay = (ymd, wd, extra = {}) => ({
  fecha: ymd,
  descripcion: WD_NAME[wd],
  horas: 0,
  horas_base: 0,
  horas_extra: 0,
  bloques: null,
  jornada_entrada: null,
  jornada_salida: null,
  jornada_reducida: false,
  ...extra,
});

function buildDay(ymd, wd, segments, horasBase, extra = {}) {
  const blocks = segmentsToBlocks(ymd, segments);
  return {
    fecha: ymd,
    descripcion: WD_NAME[wd],
    horas: horasBase,
    horas_base: horasBase,
    horas_extra: 0, // las extras son manuales (Fase 3)
    bloques: blocks.length ? blocks : null,
    jornada_entrada: segments.length ? minutesToHM(segments[0].from) : null,
    jornada_salida: segments.length
      ? minutesToHM(segments[segments.length - 1].to)
      : null,
    domingo_estado: null,
    jornada_reducida: false,
    es_festivo: false,
    festivo_trabajado: false,
    festivo_nombre: null,
    ...extra,
  };
}

// Rangos de estudio que afectan un día (para restarlos del turno). Spec 6.
function collectStudyRanges(partialObservations, ymd, wd) {
  const ranges = [];
  for (const obs of partialObservations || []) {
    if (!(ymd >= obs.start && ymd <= obs.end)) continue;
    const list = obs.details?.dias_estudio;
    if (!Array.isArray(list)) continue;
    const dayConfig =
      list.find((x) => x.fecha === ymd) || list.find((x) => x.dia === wd);
    if (dayConfig?.inicio && dayConfig?.fin) {
      const s = hmToMinutes(dayConfig.inicio);
      const e = hmToMinutes(dayConfig.fin);
      if (e > s) ranges.push({ start: s, end: e });
    }
  }
  return ranges;
}

export function generateScheduleByShift(
  fechaInicio,
  fechaFin,
  turno, // fila de ph_jornadas: { hora_entrada, hora_salida, sabado_entrada, sabado_salida, dias_aplica }
  holidaySet,
  holidayOverrides = {},
  sundayOverrides = {},
  partialObservations = [],
  cfg = null
) {
  const outWeeks = [];
  let cursor = startOfISOWeek(fechaInicio);
  const rangeStart = parseISO(fechaInicio + "T00:00:00Z");
  const rangeEnd = parseISO(fechaFin + "T00:00:00Z");
  if (!cursor || !isValid(rangeStart) || !isValid(rangeEnd) || !turno) {
    console.error("Datos inválidos para generar horario por turno:", {
      fechaInicio,
      fechaFin,
      tieneTurno: Boolean(turno),
    });
    return { schedule: [] };
  }

  const entrada = normalizeHM(turno.hora_entrada);
  const salida = normalizeHM(turno.hora_salida);
  const sabEntrada = normalizeHM(turno.sabado_entrada);
  const sabSalida = normalizeHM(turno.sabado_salida);
  const diasAplica = Array.isArray(turno.dias_aplica)
    ? turno.dias_aplica
    : [1, 2, 3, 4, 5, 6];
  const holidayHours = Number(
    cfg?.limites?.horasFestivoTrabajado ?? HOLIDAY_HOURS
  );

  while (cursor <= rangeEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = addDays(weekStart, 6);
    const dias = [];

    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const ymd = YMD(d);
      if (!ymd || d < rangeStart || d > rangeEnd) continue;

      const wd = isoWeekday(d);
      const isSunday = wd === 7;
      const isHoliday = holidaySet?.has?.(ymd);
      const holidayOverride = holidayOverrides[ymd];

      if (isHoliday && holidayOverride === "skip") continue;

      // Domingo: no se trabaja.
      if (isSunday) {
        dias.push(
          emptyDay(ymd, wd, {
            domingo_estado: sundayOverrides[ymd] || null,
          })
        );
        continue;
      }

      // Festivo trabajado: bloque único de holidayHours desde la entrada.
      if (isHoliday && holidayOverride === "work") {
        const start = hmToMinutes(entrada);
        const segs = [{ from: start, to: start + holidayHours * 60 }];
        dias.push(
          buildDay(ymd, wd, segs, holidayHours, {
            es_festivo: true,
            festivo_trabajado: true,
            festivo_nombre: holidaySet.get(ymd)?.name || "Festivo",
          })
        );
        continue;
      }

      // ¿El turno aplica este día?
      if (!diasAplica.includes(wd)) {
        dias.push(emptyDay(ymd, wd, { es_festivo: Boolean(isHoliday) }));
        continue;
      }

      const isSaturday = wd === 6;
      const entradaDia = isSaturday ? sabEntrada : entrada;
      const salidaDia = isSaturday ? sabSalida : salida;
      if (!entradaDia || !salidaDia) {
        dias.push(emptyDay(ymd, wd));
        continue;
      }

      const full = buildShiftSegments(
        entradaDia,
        salidaDia,
        !isSaturday // sábado sin descanso
      );
      let segments = full.segments;

      // Estudio (parcial, spec 6.2): se quitan los rangos de estudio de la
      // presencia física, pero el día queda CUBIERTO (se paga el turno completo).
      let horasEstudio = 0;
      const studyRanges = collectStudyRanges(partialObservations, ymd, wd);
      if (studyRanges.length) {
        segments = subtractTimeRanges(full.segments, studyRanges);
        const presentNet =
          segments.reduce((s, seg) => s + (seg.to - seg.from), 0) / 60;
        horasEstudio = Math.round((full.netHours - presentNet) * 100) / 100;
      }

      // Tope legal del día (8 L-V / 4 Sáb). El día se paga completo (cubierto).
      const horasBase = Math.min(full.netHours, getLegalCapForDay(wd, cfg));

      // Compensación: el colaborador cubre hasta `tope` desde sus extras; resto, empresa.
      let extraMeta = {};
      if (horasEstudio > 0) {
        const tope = Number(cfg?.compensacion?.topeEstudioColaborador ?? 4);
        const compensaBanco = Math.min(horasEstudio, tope);
        extraMeta = {
          horas_estudio: horasEstudio,
          estudio_compensa_banco: Math.round(compensaBanco * 100) / 100,
          estudio_cubre_empresa:
            Math.round((horasEstudio - compensaBanco) * 100) / 100,
        };
      }
      dias.push(buildDay(ymd, wd, segments, horasBase, extraMeta));
    }

    outWeeks.push({
      fecha_inicio: YMD(weekStart),
      fecha_fin: YMD(weekEnd),
      dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      total_horas_semana: dias.reduce(
        (s, dd) => s + (Number(dd.horas) || 0),
        0
      ),
    });
    cursor = addDays(weekStart, 7);
  }
  return { schedule: outWeeks };
}

// Bloques de un día EDITADO manualmente, respetando el turno del colaborador.
// base = horas dentro del turno (con descansos L-V); extra = horas después de la
// salida del turno. Determinista. Devuelve { bloques, entrada, salida }.
export function buildEditedDayBlocks(ymd, turno, wd, totalHours) {
  if (!turno || !(totalHours > 0) || wd === 7) {
    return { bloques: null, entrada: null, salida: null };
  }
  const isSaturday = wd === 6;
  const entrada = normalizeHM(
    isSaturday ? turno.sabado_entrada : turno.hora_entrada
  );
  const salida = normalizeHM(
    isSaturday ? turno.sabado_salida : turno.hora_salida
  );
  if (!entrada || !salida) {
    return { bloques: null, entrada: null, salida: null };
  }

  const { segments: shiftSegs, netHours } = buildShiftSegments(
    entrada,
    salida,
    !isSaturday
  );
  const baseHours = Math.min(totalHours, netHours);
  const extraHours = Math.max(0, totalHours - netHours);

  // Llenar las horas base dentro de los segmentos del turno (desde el inicio).
  const segs = [];
  let remaining = Math.round(baseHours * 60);
  for (const seg of shiftSegs) {
    if (remaining <= 0) break;
    const take = Math.min(seg.to - seg.from, remaining);
    segs.push({ from: seg.from, to: seg.from + take });
    remaining -= take;
  }
  // Extra: bloque continuo después de la salida del turno.
  if (extraHours > 0) {
    const exitMin = hmToMinutes(salida);
    segs.push({ from: exitMin, to: exitMin + Math.round(extraHours * 60) });
  }

  const bloques = segmentsToBlocks(ymd, segs);
  return {
    bloques: bloques.length ? bloques : null,
    entrada: segs.length ? minutesToHM(segs[0].from) : null,
    salida: segs.length ? minutesToHM(segs[segs.length - 1].to) : null,
  };
}
