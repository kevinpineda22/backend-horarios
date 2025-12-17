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
  partialObservations = []
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
    let legalLeft = WEEKLY_LEGAL_LIMIT;
    let extraLeft = WEEKLY_EXTRA_LIMIT;

    for (const day of workableDays) {
      const totals = { base: 0, extra: 0, total: 0 };
      const isSaturday = day.wd === 6;
      const isReduced = day.jornada_reducida || false;
      const isHolidayWorked = day.isHoliday && day.override === "work";

      let targetTotalHours;
      if (isHolidayWorked) targetTotalHours = HOLIDAY_HOURS; // 6h
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

      const dayLegalCap = getLegalCapForDay(day.wd);
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
