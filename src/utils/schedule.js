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

// Ventanas del establecimiento
const OPEN_WEEKDAY = 7;  // 07:00
const CLOSE_WEEKDAY = 18; // 18:00 (capacidad total 11h)
const OPEN_SAT = 7;      // 07:00
const CLOSE_SAT = 15;    // 15:00 (capacidad total 8h)
const HOL_OPEN = 8;      // 08:00 (festivo trabajado)
const HOL_CLOSE = 13;    // 13:00 (5h fijas si se trabaja)

// Base legal por día (enteras)
const BASE_LEGAL_WEEKDAY = 8; // L-V
const BASE_LEGAL_SAT = 8;     // Sábado
const BASE_HOLIDAY = 5;       // Festivo trabajado (08–13)

// Objetivo semanal
const TARGET_BASE_WEEK = 44;  // legales
const TARGET_EXTRA_WEEK = 12; // extras
const TARGET_TOTAL_WEEK = TARGET_BASE_WEEK + TARGET_EXTRA_WEEK; // 56

// util
const hh = (n) => String(n).padStart(2, '0');
const toISO = (ymd, hour) => `${ymd}T${hh(hour)}:00:00`;

/**
 * Selecciona una hora de inicio (entera) sesgada a la mañana.
 * Pesos: 7(0.45), 8(0.35), 9(0.15), 10(0.05)
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
 * Construye un único bloque de trabajo (sin pausas visibles) con horas enteras.
 * Si no cabe, ajusta el inicio hacia atrás; si aún no cabe, recorta horas.
 * Devuelve { startH, endH, placedHours } (todas enteras).
 */
function buildSingleBlock({ ymd, openH, closeH, desiredHours, preferMorning = true }) {
  // Máximo que cabe ese día
  const dayCapacity = Math.max(0, closeH - openH);
  let hours = Math.min(desiredHours, dayCapacity);

  // Inicio tentativo sesgado a la mañana
  let latestStart = closeH - hours;
  let startH = preferMorning ? pickMorningStartHour(openH, latestStart) : openH;
  // Si por sesgo queda muy tarde, corrige
  if (startH > latestStart) startH = latestStart;
  if (startH < openH) startH = openH;

  let endH = startH + hours;
  if (endH > closeH) {
    // Mueve inicio hacia atrás
    const overflow = endH - closeH;
    startH = Math.max(openH, startH - overflow);
    endH = startH + hours;
    if (endH > closeH) {
      // Sigue sin caber: recorta horas
      hours = Math.max(0, closeH - startH);
      endH = startH + hours;
    }
  }
  return { startH, endH, placedHours: hours };
}

/**
 * Distribuye extras enteras de forma "lo más pareja posible" respetando capacidad por día.
 * days: [{ key, maxExtras }]
 * totalExtras: entero
 * Devuelve un Map key->extrasAsignadas (enteras)
 */
function distributeExtrasEvenly(days, totalExtras) {
  const result = new Map(days.map(d => [d.key, 0]));
  if (totalExtras <= 0 || days.length === 0) return result;

  // Cap semanal real
  const maxWeekCap = days.reduce((s,d)=> s + Math.max(0, d.maxExtras), 0);
  let remaining = Math.min(totalExtras, maxWeekCap);

  if (remaining === 0) return result;

  // reparto base
  const baseShare = Math.floor(remaining / days.length);
  const remainder = remaining % days.length;

  // 1) Dar baseShare a todos los que soporten
  days.forEach(d => {
    const give = Math.min(d.maxExtras, baseShare);
    result.set(d.key, give);
  });

  // 2) Repartir el resto de a 1h hasta agotar o llegar al tope de cada día
  let r = remainder;
  let idx = 0;
  while (r > 0) {
    const d = days[idx % days.length];
    const cur = result.get(d.key);
    if (cur < d.maxExtras) {
      result.set(d.key, cur + 1);
      r--;
      if (r === 0) break;
    }
    idx++;
    // Si todos están llenos, cortamos
    if (idx > days.length * 3) break;
  }

  return result;
}

/**
 * Genera horarios por semanas dentro del rango, intentando 56h (44+12).
 * - L-V: base 8h, extras hasta 3h (capacidad total 11h).
 * - Sáb: 7–15 base 8h, extras 0 (no hay ventana).
 * - Festivo trabajado: 08–13 (5h) fijas, extras 0.
 * - Festivo NO trabajado: se omite el día.
 * - Todo en horas enteras; sin decimales.
 * - Si no alcanzan 56, asigna lo máximo posible y marca warning por semana.
 *
 * workedHolidays: Set<string YMD> con los festivos que SÍ se trabajan (08–13).
 * workingWeekdays: array de 1..7 (L..D) seleccionados por el usuario.
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

    // Candidatos en esta semana dentro del subrango
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (d < segStart || d > segEnd) continue;
      const ymd = YMD(d);
      const wd  = isoWeekday(d); // 1..7

      const isWorkingDay = workingWeekdays.includes(wd);
      const isHoliday = holidaySet.has(ymd);
      const isHolidayWorked = isHoliday && workedHolidays.has(ymd);

      // Config día
      let openH, closeH, base, maxExtras, type;
      if (!isWorkingDay) {
        // no se trabaja ese día
        continue;
      }

      if (isHoliday) {
        if (isHolidayWorked) {
          // Festivo trabajado: 08–13 fijas, 5h sin extras
          openH = HOL_OPEN;
          closeH = HOL_CLOSE;
          base = BASE_HOLIDAY; // 5
          maxExtras = 0;
          type = 'weekday'; // lo tratamos visualmente como laborable
        } else {
          // Festivo NO trabajado: se omite
          continue;
        }
      } else if (wd >= 1 && wd <= 5) {
        // L-V
        openH = OPEN_WEEKDAY;
        closeH = CLOSE_WEEKDAY;
        base = BASE_LEGAL_WEEKDAY; // 8
        // Cap total del día = 11; extras max = 3
        maxExtras = Math.max(0, (closeH - openH) - base); // 11 - 8 = 3
        type = 'weekday';
      } else if (wd === 6) {
        // Sábado
        openH = OPEN_SAT;
        closeH = CLOSE_SAT;
        base = BASE_LEGAL_SAT; // 8
        maxExtras = 0; // no hay ventana para más
        type = 'saturday';
      } else {
        continue; // Domingo
      }

      days.push({ ymd, wd, openH, closeH, base, maxExtras, type, isHolidayWorked });
    }

    // Suma base posible esta semana
    const baseSum = days.reduce((s,d)=> s + d.base, 0);

    // Extras: intentar 12 pero respetando capacidad semanal real
    const extraCandidates = days
      .filter(d => d.maxExtras > 0)
      .map(d => ({ key: d.ymd, maxExtras: d.maxExtras }));

    const totalExtraCap = extraCandidates.reduce((s,d)=> s + d.maxExtras, 0);
    const extrasToAssign = Math.min(TARGET_EXTRA_WEEK, totalExtraCap);

    const extrasMap = distributeExtrasEvenly(extraCandidates, extrasToAssign);

    // Ahora construimos bloques por día
    const dias = [];
    let totalHours = 0;

    for (const d of days) {
      const extras = extrasMap.get(d.ymd) || 0;
      const desired = d.base + extras;

      // Para festivo trabajado, bloque fijo 08–13
      let startH, endH, placedHours;
      if (d.isHolidayWorked) {
        startH = HOL_OPEN;
        endH = HOL_CLOSE;
        placedHours = BASE_HOLIDAY; // 5
      } else if (d.type === 'saturday') {
        // Sábado fijo 07–15 (8h)
        startH = OPEN_SAT;
        endH   = CLOSE_SAT;
        placedHours = BASE_LEGAL_SAT; // 8
      } else {
        const blk = buildSingleBlock({
          ymd: d.ymd,
          openH: d.openH,
          closeH: d.closeH,
          desiredHours: desired,
          preferMorning: true,
        });
        startH = blk.startH;
        endH   = blk.endH;
        placedHours = blk.placedHours;
      }

      // Ajuste de extras reales por si algo se recortó al encajar
      const realExtras = Math.max(0, placedHours - d.base);

      totalHours += placedHours;

      dias.push({
        descripcion: '',        // puedes rellenar si deseas
        fecha: d.ymd,
        start: d.ymd,
        end: d.ymd,
        horas_base: d.base,     // SIEMPRE enteras (8 o 5)
        horas_extra: realExtras,// enteras
        horas: placedHours,     // enteras
        bloques: [
          {
            type: 'trabajo',
            start: toISO(d.ymd, startH),
            end: toISO(d.ymd, endH),
          }
        ]
      });
    }

    // Ordenar por día (L..D)
    dias.sort((a,b) => (new Date(a.fecha)) - (new Date(b.fecha)));

    // Warning si no llegamos a 56
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
