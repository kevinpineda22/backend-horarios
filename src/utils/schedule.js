// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format
} from 'date-fns';

export const YMD = (d) => new Date(d).toISOString().slice(0,10);
export const addDays = (d, n) => dfAddDays(new Date(d), n);
export const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
export const isoWeekday = (d) => { const wd = new Date(d).getDay(); return wd === 0 ? 7 : wd; }; // 1..7

// Ventanas del establecimiento (reales)
const OPEN_WEEKDAY = 7;   // 07:00
const CLOSE_WEEKDAY = 18; // 18:00  (ventana real 11h)
// Pausas L–V (45' almuerzo + 15' desayuno = 1h neta)
const BREAK_HOURS_WEEKDAY = 1; // restar de la capacidad diaria neta

const OPEN_SAT = 7;       // 07:00
const CLOSE_SAT = 15;     // 15:00 (8h netas, sin extras)

const HOL_OPEN = 8;       // Festivo trabajado 08:00…13:00
const HOL_CLOSE = 13;     // 5h netas

// Base legal por día (horas enteras)
const BASE_LEGAL_WEEKDAY = 8; // L–V
const BASE_LEGAL_SAT = 8;     // Sábado
const BASE_HOLIDAY = 5;       // Festivo trabajado

// Objetivo semanal
const TARGET_BASE_WEEK = 44;      // referencial (no forzamos 44 exactas si los días seleccionados no dan)
const TARGET_EXTRA_WEEK = 12;     // intentamos 12 extras
const TARGET_TOTAL_WEEK = TARGET_BASE_WEEK + TARGET_EXTRA_WEEK; // 56

const hh = (n) => String(n).padStart(2, '0');
const toISO = (ymd, hour) => `${ymd}T${hh(hour)}:00:00`;

/**
 * Hora de inicio sesgada a la mañana.
 */
function pickMorningStartHour(minStart, maxAllowedStart) {
  const options = [7,8,9,10].filter(h => h >= minStart && h <= maxAllowedStart);
  if (options.length === 0) return Math.max(minStart, 7);
  const weights = {7: 0.45, 8: 0.35, 9: 0.15, 10: 0.05};
  let bag = [];
  options.forEach(h => { const w = Math.round((weights[h] || 0.1) * 100); bag = bag.concat(Array(w).fill(h)); });
  return bag[Math.floor(Math.random() * bag.length)];
}

/**
 * Un solo bloque continuo (horas enteras).
 */
function buildSingleBlock({ ymd, openH, closeH, desiredHours, preferMorning = true }) {
  const dayCapacity = Math.max(0, closeH - openH);
  let hours = Math.min(desiredHours, dayCapacity);

  let latestStart = closeH - hours;
  let startH = preferMorning ? pickMorningStartHour(openH, latestStart) : openH;
  if (startH > latestStart) startH = latestStart;
  if (startH < openH) startH = openH;

  let endH = startH + hours;
  if (endH > closeH) {
    const overflow = endH - closeH;
    startH = Math.max(openH, startH - overflow);
    endH = startH + hours;
    if (endH > closeH) {
      hours = Math.max(0, closeH - startH);
      endH = startH + hours;
    }
  }
  return { startH, endH, placedHours: hours };
}

/**
 * Reparto parejo de extras (enteras) respetando capacidad por día.
 */
function distributeExtrasEvenly(days, totalExtras) {
  const result = new Map(days.map(d => [d.key, 0]));
  if (totalExtras <= 0 || days.length === 0) return result;

  const maxWeekCap = days.reduce((s,d)=> s + Math.max(0, d.maxExtras), 0);
  let remaining = Math.min(totalExtras, maxWeekCap);
  if (remaining === 0) return result;

  const baseShare = Math.floor(remaining / days.length);
  let r = remaining % days.length;

  // reparto base
  days.forEach(d => {
    const give = Math.min(d.maxExtras, baseShare);
    result.set(d.key, give);
  });

  // repartir sobrante de a 1h
  let i = 0;
  while (r > 0 && i < days.length * 3) {
    const d = days[i % days.length];
    const cur = result.get(d.key);
    if (cur < d.maxExtras) {
      result.set(d.key, cur + 1);
      r--;
    }
    i++;
  }
  return result;
}

/**
 * Generador principal (todo en horas enteras):
 * - L–V: ventana 07–18, pero NETO 10h por día (1h de pausas ⇒ extras máx = 2).
 * - Sáb: 07–15 (8h netas, sin extras).
 * - Festivo trabajado: 08–13 (5h), sin extras.
 * - Si no se puede llegar a 56h, asigna lo máximo posible y envía warning.
 */
export function generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, workedHolidays = new Set()) {
  const schedules = [];
  const warnings = [];
  const rangeStart = new Date(startDate);
  const end = new Date(endDate);
  let cursor = startOfISOWeek(rangeStart);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd   = addDays(weekStart, 6);
    const segStart  = new Date(Math.max(weekStart, rangeStart));
    const segEnd    = new Date(Math.min(weekEnd, end));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (d < segStart || d > segEnd) continue;
      const ymd = YMD(d);
      const wd  = isoWeekday(d); // 1..7

      const isWorkingDay = workingWeekdays.includes(wd);
      const isHoliday = holidaySet.has(ymd);
      const isHolidayWorked = isHoliday && workedHolidays.has(ymd);

      if (!isWorkingDay) continue;

      let openH, closeH, base, maxExtras, type;

      if (isHoliday) {
        if (!isHolidayWorked) continue; // festivo NO trabajado ⇒ omitir
        openH = HOL_OPEN; closeH = HOL_CLOSE;
        base = BASE_HOLIDAY; // 5
        maxExtras = 0;
        type = 'weekday';
      } else if (wd >= 1 && wd <= 5) {
        // L–V: ventana real 11h, pero neto 10h por pausas (BREAK_HOURS_WEEKDAY)
        openH = OPEN_WEEKDAY; closeH = CLOSE_WEEKDAY;
        base = BASE_LEGAL_WEEKDAY; // 8
        const effectiveCapacity = (closeH - openH) - BREAK_HOURS_WEEKDAY; // 11 - 1 = 10
        maxExtras = Math.max(0, effectiveCapacity - base); // 10 - 8 = 2
        type = 'weekday';
      } else if (wd === 6) {
        // Sábado fijo 07–15 (8 netas)
        openH = OPEN_SAT; closeH = CLOSE_SAT;
        base = BASE_LEGAL_SAT; // 8
        maxExtras = 0;
        type = 'saturday';
      } else {
        continue; // Domingo
      }

      days.push({ ymd, wd, openH, closeH, base, maxExtras, type, isHolidayWorked });
    }

    // Reparto de extras: intentar 12h pero limitado por capacidad real
    const extraCandidates = days
      .filter(d => d.maxExtras > 0)
      .map(d => ({ key: d.ymd, maxExtras: d.maxExtras }));
    const totalExtraCap = extraCandidates.reduce((s,d)=> s + d.maxExtras, 0);
    const extrasToAssign = Math.min(TARGET_EXTRA_WEEK, totalExtraCap);
    const extrasMap = distributeExtrasEvenly(extraCandidates, extrasToAssign);

    // Construir días con bloques reales
    const dias = [];
    let totalHours = 0;

    for (const d of days) {
      const extras = extrasMap.get(d.ymd) || 0;
      const desired = d.base + extras;

      let startH, endH, placedHours;
      if (d.isHolidayWorked) {
        startH = HOL_OPEN; endH = HOL_CLOSE; placedHours = BASE_HOLIDAY; // 5
      } else if (d.type === 'saturday') {
        startH = OPEN_SAT; endH = CLOSE_SAT; placedHours = BASE_LEGAL_SAT; // 8
      } else {
        // L–V con capacidad neta 10h
        const effectiveCapacity = (d.closeH - d.openH) - BREAK_HOURS_WEEKDAY;
        const want = Math.min(desired, effectiveCapacity); // asegura no pasar de 10h netas
        const blk = buildSingleBlock({
          ymd: d.ymd,
          openH: d.openH,
          closeH: d.closeH,
          desiredHours: want,
          preferMorning: true,
        });
        startH = blk.startH; endH = blk.endH; placedHours = blk.placedHours;
      }

      const realExtras = Math.max(0, placedHours - d.base);
      totalHours += placedHours;

      dias.push({
        descripcion: '',
        fecha: d.ymd,
        start: d.ymd,
        end: d.ymd,
        horas_base: d.base,       // enteras
        horas_extra: realExtras,  // enteras
        horas: placedHours,       // enteras
        bloques: [{ type: 'trabajo', start: toISO(d.ymd, startH), end: toISO(d.ymd, endH) }]
      });
    }

    // Orden cronológico
    dias.sort((a,b) => (new Date(a.fecha)) - (new Date(b.fecha)));

    // Warning si no se llega a 56h
    let note = null;
    if (totalHours < TARGET_TOTAL_WEEK) {
      note = `Semana ${YMD(weekStart)}: objetivo 56h, asignadas ${totalHours}h.`;
      warnings.push(note);
    }

    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin:    format(weekEnd,   'yyyy-MM-dd'),
      dias,
      total_horas_semana: totalHours,
      objetivo_horas_semana: TARGET_TOTAL_WEEK,
      warning: note
    });

    cursor = addWeeks(weekStart, 1);
  }

  return { schedules, warnings };
}
