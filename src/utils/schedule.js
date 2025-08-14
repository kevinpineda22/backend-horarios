// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format
} from 'date-fns';

// ================== Helpers base ==================
const pad = (n) => String(n).padStart(2,'0');
export const YMD = (d) => new Date(d).toISOString().slice(0,10);
export const addDays = (d, n) => dfAddDays(new Date(d), n);
export const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
export const isoWeekday = (d) => { const wd = new Date(d).getDay(); return wd === 0 ? 7 : wd; }; // 1..7

// Capacidad "trabajable" (en horas exactas) por día
// L–V: 10h netas (07–12 y 13–18) => 10
// Sáb: 8h netas (07–15 continuas) => 8
// Dom: 0
export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return 10; // Lun-Vie
  if (weekday === 6) return 8; // Sábado (07–15, 8h exactas)
  return 0; // Domingo
}

// Objetivo base por día (en horas exactas):
// - Día normal L–S: 8h
// - Festivo trabajado: 5h (08:00–13:00 fijas)
// - Festivo no trabajado: 0h
const BASE_NORMAL_DAY = 8;
const BASE_HOLIDAY_WORKED = 5;

// Extras objetivo por semana (en horas exactas)
const WEEKLY_EXTRA_TARGET = 12;

// Horario del establecimiento
const OPENING = {
  weekday: { start: '07:00', lunchStart: '12:00', lunchEnd: '13:00', end: '18:00' },
  saturday: { start: '07:00', end: '15:00' }, // continuo 8h
};

// ================== Utils de tiempo ==================
const toDateAt = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00`);
const addHours = (date, h) => new Date(date.getTime() + h*3600*1000);

// Random start en horas enteras
function randomStartHour(ymd, options /* array de 'HH:00' */) {
  const idx = Math.floor(Math.random() * options.length);
  return toDateAt(ymd, options[idx]);
}

// Construye bloques en horas exactas. Sin decimales.
function buildDayBlocks({ ymd, weekday, baseHours, extraHours, isWorkedHoliday }) {
  const blocks = [];
  let usedBase = 0;
  let usedExtra = 0;

  // Festivo trabajado: fijo 08:00–13:00 (5h), sin extras.
  if (isWorkedHoliday) {
    if (baseHours > 0) {
      const s = toDateAt(ymd, '08:00');
      const e = toDateAt(ymd, '13:00');
      blocks.push({ start: s.toISOString(), end: e.toISOString(), hours: 5 });
      usedBase = 5;
    }
    return { blocks, usedBase, usedExtra };
  }

  // Sábado: 07:00–15:00 (8h continuas), sin extras
  if (weekday === 6) {
    if (baseHours > 0) {
      const s = toDateAt(ymd, OPENING.saturday.start);
      const e = toDateAt(ymd, OPENING.saturday.end);
      blocks.push({ start: s.toISOString(), end: e.toISOString(), hours: 8 });
      usedBase = Math.min(8, baseHours); // debería ser 8 exacto
    }
    return { blocks, usedBase, usedExtra };
  }

  // L–V: entrada aleatoria en hora exacta 07:00 / 08:00 / 09:00
  const start = randomStartHour(ymd, ['07:00', '08:00', '09:00']);
  const lunchStart = toDateAt(ymd, OPENING.weekday.lunchStart);
  const lunchEnd   = toDateAt(ymd, OPENING.weekday.lunchEnd);
  const dayEnd     = toDateAt(ymd, OPENING.weekday.end);

  let remainingBase = Math.max(0, Math.floor(baseHours));  // entero
  let remainingExtra = Math.max(0, Math.floor(extraHours)); // entero

  // --- Mañana (hasta 12:00) ---
  if (start < lunchStart && remainingBase > 0) {
    const morningCap = Math.floor((lunchStart - start) / (3600*1000)); // horas enteras
    const use = Math.min(remainingBase, morningCap);
    if (use > 0) {
      const end = addHours(start, use);
      blocks.push({ start: start.toISOString(), end: end.toISOString(), hours: use });
      remainingBase -= use;
    }
  }

  // --- Tarde base (13:00..18:00) ---
  let cursor = lunchEnd;
  if (remainingBase > 0 && cursor < dayEnd) {
    const afternoonCap = Math.floor((dayEnd - cursor) / (3600*1000));
    const use = Math.min(remainingBase, afternoonCap);
    if (use > 0) {
      const end = addHours(cursor, use);
      blocks.push({ start: cursor.toISOString(), end: end.toISOString(), hours: use });
      cursor = end;
      remainingBase -= use;
    }
  }

  usedBase = Math.max(0, Math.floor(baseHours)) - remainingBase;

  // --- Tarde extras (en horas enteras) ---
  if (remainingExtra > 0 && cursor < dayEnd) {
    const extraCap = Math.floor((dayEnd - cursor) / (3600*1000));
    const use = Math.min(remainingExtra, extraCap);
    if (use > 0) {
      const end = addHours(cursor, use);
      blocks.push({ start: cursor.toISOString(), end: end.toISOString(), hours: use });
      cursor = end;
      remainingExtra -= use;
      usedExtra = use;
    }
  }

  return { blocks, usedBase, usedExtra };
}

// ================== Generador semanal ==================
function generateWeek({
  weekStart,
  rangeStart,
  rangeEnd,
  workingWeekdays,
  holidaySet,
  workedHolidaySet,
  warnings,
}) {
  // Días del subrango de esa semana
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;
    const ymd = YMD(d);
    const wd = isoWeekday(d);
    const isHoliday = holidaySet.has(ymd);
    const isWorkedHoliday = workedHolidaySet.has(ymd);
    const isWorking = workingWeekdays.includes(wd);

    let baseTarget = 0;
    if (isWorking && !isHoliday) baseTarget = BASE_NORMAL_DAY;           // 8h
    if (isHoliday && isWorkedHoliday) baseTarget = BASE_HOLIDAY_WORKED;  // 5h

    const cap = getDailyCapacity(wd);
    days.push({ ymd, wd, isHoliday, isWorkedHoliday, isWorking, baseTarget, cap });
  }

  // 1) Asignar BASE (enteros)
  const outDays = [];
  let sumBase = 0;
  for (const d of days) {
    const base = Math.min(d.baseTarget, d.cap);
    const capacityLeft = Math.max(0, d.cap - base); // para extras
    outDays.push({
      ymd: d.ymd,
      wd: d.wd,
      isHoliday: d.isHoliday,
      isWorkedHoliday: d.isWorkedHoliday,
      cap: d.cap,
      base,
      capacityLeft,
      extraTargetToday: 0,
      blocks: [],
    });
    sumBase += base;
  }

  // 2) Repartir EXTRAS semanales: 12h, solo en días NO festivos (L–V)
  let extrasLeft = WEEKLY_EXTRA_TARGET;
  const pref = outDays
    .filter(d => d.wd >= 1 && d.wd <= 5 && !d.isHoliday); // L–V no festivo
  for (const d of pref) {
    if (extrasLeft <= 0) break;
    if (d.capacityLeft <= 0) continue;
    const use = Math.min(d.capacityLeft, extrasLeft); // en enteros
    d.extraTargetToday = use;
    extrasLeft -= use;
  }

  // 3) Construir bloques en horas enteras
  let sumExtra = 0;
  for (const d of outDays) {
    const { blocks, usedBase, usedExtra } = buildDayBlocks({
      ymd: d.ymd,
      weekday: d.wd,
      baseHours: d.base,
      extraHours: d.extraTargetToday,
      isWorkedHoliday: d.isWorkedHoliday
    });

    const horas_base = usedBase;          // enteros
    const horas_extra = usedExtra;        // enteros
    const horas = horas_base + horas_extra;

    sumExtra += horas_extra;

    Object.assign(d, {
      horas_base,
      horas_extra,
      horas,
      blocks,
      descripcion: ''
    });
  }

  const total = outDays.reduce((s,d)=> s + (d.horas || 0), 0);

  // Warnings si no alcanzamos objetivo típico (por ejemplo 56h) o extras<12
  // Nota: dejamos el warning informativo, pero la semana igual se crea.
  if (sumExtra < WEEKLY_EXTRA_TARGET) {
    warnings.push(`Semana ${YMD(weekStart)}: extras asignadas ${sumExtra}h (objetivo 12h).`);
  }

  const dias = outDays.map(d => ({
    descripcion: d.descripcion,
    fecha: d.ymd,
    start: d.blocks.length ? d.blocks[0].start.slice(0,10) : d.ymd,
    end:   d.blocks.length ? d.blocks[d.blocks.length-1].end.slice(0,10) : d.ymd,
    horas_base: d.horas_base,
    horas_extra: d.horas_extra,
    horas: d.horas,
    bloques: d.blocks
  }));

  return { dias, total_horas_semana: total };
}

// ================== API principal ==================
/**
 * Genera horarios semanales dentro del rango [startDate, endDate]
 * - Base diaria: 8h exactas (Sáb 8h). Festivo trabajado: 5h exactas.
 * - Extras objetivo: 12h/semana (enteras; si no alcanza, warning).
 * - Festivos NO trabajados se omiten.
 * - Bloques con entrada aleatoria a hora exacta y foco mañana.
 */
export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet, workedHolidaySet = new Set()) {
  const schedules = [];
  const warnings = [];

  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd   = addDays(weekStart, 6);
    const segStart  = new Date(Math.max(weekStart, rangeStart));
    const segEnd    = new Date(Math.min(weekEnd, end));

    const { dias, total_horas_semana } = generateWeek({
      weekStart,
      rangeStart: segStart,
      rangeEnd: segEnd,
      workingWeekdays,
      holidaySet,
      workedHolidaySet,
      warnings,
    });

    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin:    format(weekEnd,   'yyyy-MM-dd'),
      dias,
      total_horas_semana
    });

    cursor = addWeeks(weekStart, 1);
  }

  return { schedules, warnings };
}
