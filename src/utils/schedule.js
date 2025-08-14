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

// Horario de apertura del establecimiento:
// L–V: 07:00–18:00 (capacidad 10h netas para trabajo efectivo)
// Sábado: 07:00–15:00 (capacidad 8h netas)
// Domingo: cerrado (0)
export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return 10; // Lun-Vie
  if (weekday === 6) return 8; // Sábado (07–15)
  return 0; // Domingo
}

// Objetivo base por día (obligatoria):
// - Días normales (L–S): 8h
// - Festivo trabajado: 5h (08:00–13:00 fijas)
// - Festivo NO trabajado: 0h
const BASE_NORMAL_DAY = 8;
const BASE_HOLIDAY_WORKED = 5;

// Extras objetivo por semana:
const WEEKLY_EXTRA_TARGET = 12;

// Ventanas recomendadas para construir bloques (enfoque mañana)
const OPENING = {
  weekday: { start: '07:00', lunchStart: '12:00', lunchEnd: '13:00', end: '18:00' },
  saturday: { start: '07:00', lunchStart: '12:00', lunchEnd: '12:30', end: '15:00' },
};

// ================== Utils de tiempo ==================
const toDateAt = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00`);
const diffH = (a,b) => (b - a) / (1000*60*60);
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes*60000);
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

// Random en múltiplos de 15m
function randomStartBetween(ymd, fromHHMM, toHHMM) {
  const from = toDateAt(ymd, fromHHMM);
  const to = toDateAt(ymd, toHHMM);
  const steps = Math.floor((to - from) / (15*60000));
  const k = steps > 0 ? Math.floor(Math.random() * (steps + 1)) : 0;
  return addMinutes(from, k*15);
}

// Crea bloques priorizando mañana: [start .. lunchStart] y [lunchEnd .. end],
// respetando base + extra, sin exceder capacidad ni horario del establecimiento.
function buildDayBlocks({ ymd, weekday, baseHours, extraHours, isWorkedHoliday }) {
  const blocks = [];
  if (baseHours + extraHours <= 0) return { blocks, usedBase: 0, usedExtra: 0 };

  // Festivo trabajado: bloque fijo 08:00–13:00 (5h), sin extras ese día.
  if (isWorkedHoliday) {
    const s = toDateAt(ymd, '08:00');
    const e = toDateAt(ymd, '13:00');
    return {
      blocks: [{ start: s.toISOString(), end: e.toISOString(), hours: 5 }],
      usedBase: 5,
      usedExtra: 0
    };
  }

  const isSat = weekday === 6;
  const W = isSat ? OPENING.saturday : OPENING.weekday;

  // Entrada aleatoria en la mañana para repartir picos (07:00–08:30 en L–V; 07:00–07:45 en Sáb)
  const startRand = isSat
    ? randomStartBetween(ymd, '07:00', '07:45')
    : randomStartBetween(ymd, '07:00', '08:30');

  const lunchStart = toDateAt(ymd, W.lunchStart);
  const lunchEnd = toDateAt(ymd, W.lunchEnd);
  const dayEnd = toDateAt(ymd, W.end);

  let remainingBase = baseHours;
  let remainingExtra = extraHours;

  // === Bloque mañana ===
  if (startRand < lunchStart && remainingBase > 0) {
    const morningCap = diffH(startRand, lunchStart);
    const usedMorningBase = clamp(remainingBase, 0, morningCap);
    if (usedMorningBase > 0) {
      const mEnd = addMinutes(startRand, usedMorningBase * 60);
      blocks.push({ start: startRand.toISOString(), end: mEnd.toISOString(), hours: usedMorningBase });
      remainingBase -= usedMorningBase;
    }
  }

  // === Bloque tarde (primero base, luego extras) ===
  let current = lunchEnd;

  // Base por la tarde (si faltó completar las 8h de base)
  if (remainingBase > 0 && current < dayEnd) {
    const afternoonCap = diffH(current, dayEnd);
    const usedAfBase = clamp(remainingBase, 0, afternoonCap);
    if (usedAfBase > 0) {
      const afEnd = addMinutes(current, usedAfBase * 60);
      blocks.push({ start: current.toISOString(), end: afEnd.toISOString(), hours: usedAfBase });
      current = afEnd;
      remainingBase -= usedAfBase;
    }
  }

  // Extras por la tarde
  if (remainingExtra > 0 && current < dayEnd) {
    const extraCap = diffH(current, dayEnd);
    const usedAfExtra = clamp(remainingExtra, 0, extraCap);
    if (usedAfExtra > 0) {
      const exEnd = addMinutes(current, usedAfExtra * 60);
      blocks.push({ start: current.toISOString(), end: exEnd.toISOString(), hours: usedAfExtra });
      current = exEnd;
      remainingExtra -= usedAfExtra;
    }
  }

  const usedBase = baseHours - remainingBase;
  const usedExtra = extraHours - remainingExtra;

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
  // Construir días candidatos dentro del subrango
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;
    const ymd = YMD(d);
    const wd = isoWeekday(d);
    const isHoliday = holidaySet.has(ymd);
    const isWorkedHoliday = workedHolidaySet.has(ymd);
    const isWorking = workingWeekdays.includes(wd);

    // Si es festivo NO trabajado => 0h
    // Si es festivo trabajado => 5h fijas
    // Si normal => 8h base
    let baseTarget = 0;
    if (isWorking && !isHoliday) baseTarget = BASE_NORMAL_DAY;
    if (isHoliday && isWorkedHoliday) baseTarget = BASE_HOLIDAY_WORKED;

    const cap = getDailyCapacity(wd);
    days.push({ ymd, wd, isHoliday, isWorkedHoliday, isWorking, baseTarget, cap });
  }

  // Asignar BASE y luego EXTRAS por la semana
  const outDays = [];
  let sumBase = 0;
  let sumExtra = 0;

  // 1) BASE (8h normales, 5h festivo trabajado)
  for (const d of days) {
    let base = Math.min(d.baseTarget, d.cap);
    let extraTargetToday = 0; // luego lo llenamos
    let extraUsed = 0;

    // Capacidad restante para extras (solo si no es sábado o si sobra ventana; sábado cap = 8 => 0 extras)
    const capacityLeft = Math.max(0, d.cap - base);
    // guardamos para usar en el paso 2
    outDays.push({
      ymd: d.ymd,
      wd: d.wd,
      isHoliday: d.isHoliday,
      isWorkedHoliday: d.isWorkedHoliday,
      cap: d.cap,
      base,
      extraTargetToday,
      capacityLeft,
      blocks: [],
    });
    sumBase += base;
  }

  // 2) EXTRAS: objetivo 12h/semana, priorizar L–V y tardes
  let extrasLeft = WEEKLY_EXTRA_TARGET;

  // Orden de preferencia: L–V no festivo (wd 1..5 & !isHoliday)
  const prefOrder = outDays
    .filter(d => d.wd >= 1 && d.wd <= 5 && !d.isHoliday) // días hábiles normales
    .concat(outDays.filter(d => d.wd >= 1 && d.wd <= 5 && d.isWorkedHoliday === true)) // si quisieras permitir extra en festivo trabajado, muévelo aquí
    .concat(outDays.filter(d => d.wd === 6)); // sábado al final (cap suele ser 0 extra)

  for (const d of prefOrder) {
    if (extrasLeft <= 0) break;
    if (d.capacityLeft <= 0) continue;
    const use = Math.min(d.capacityLeft, extrasLeft);
    d.extraTargetToday = use;
    extrasLeft -= use;
  }

  // 3) Construir bloques reales (random de mañana + tarde fija + extra tarde)
  for (const d of outDays) {
    const { blocks, usedBase, usedExtra } = buildDayBlocks({
      ymd: d.ymd,
      weekday: d.wd,
      baseHours: d.base,
      extraHours: d.extraTargetToday,
      isWorkedHoliday: d.isWorkedHoliday
    });

    const horas_base = usedBase;
    const horas_extra = usedExtra;
    const horas = horas_base + horas_extra;

    sumExtra += horas_extra;

    outDays[ outDays.findIndex(x => x.ymd === d.ymd) ] = {
      ...d,
      base: horas_base,
      extraTargetToday: horas_extra,
      blocks,
      horas_base,
      horas_extra,
      horas,
      descripcion: '' // opcional
    };
  }

  const total = outDays.reduce((s,d) => s + (d.horas || 0), 0);

  // Warnings: si no alcanzamos 56h (44 + 12) por capacidad / festivos no trabajados
  if (total < (BASE_NORMAL_DAY * 5 +  // suposición de 5 días hábiles de 8h
               (outDays.find(x => x.wd === 6) ? BASE_NORMAL_DAY : 0) + // si hay sábado operativo: +8h
               WEEKLY_EXTRA_TARGET)) {
    warnings.push(`Semana ${YMD(weekStart)}: no se alcanzan 56h. Se programaron ${total}h (base ${sumBase} + extra ${sumExtra}).`);
  }
  if (sumExtra < WEEKLY_EXTRA_TARGET) {
    warnings.push(`Semana ${YMD(weekStart)}: extras asignadas ${sumExtra}h (objetivo 12h).`);
  }

  // Empaquetar salida compatible con BD
  const dias = outDays.map(d => ({
    descripcion: d.descripcion,
    fecha: d.ymd,
    start: d.blocks.length ? d.blocks[0].start.slice(0,10) : d.ymd, // para allDay fallback
    end: d.blocks.length ? d.blocks[d.blocks.length-1].end.slice(0,10) : d.ymd,
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
 * - Base diaria: 8h reales (Sáb 8h). Festivo trabajado: 5h (08–13).
 * - Extras objetivo: 12h/semana (si no alcanza, warning).
 * - Festivos NO trabajados se omiten.
 * - Bloques con entrada aleatoria y foco mañana.
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
