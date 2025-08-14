// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format
} from 'date-fns';

const pad = (n) => String(n).padStart(2,'0');
export const YMD = (d) => new Date(d).toISOString().slice(0,10);
export const addDays = (d, n) => dfAddDays(new Date(d), n);
export const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
export const isoWeekday = (d) => { const wd = new Date(d).getDay(); return wd === 0 ? 7 : wd; }; // 1..7

// Capacidad por día (neto en ventanas con pausas)
export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return 10; // Lun-Vie: 07–09, 09:15–12, 12:45–18  => 2 + 2.75 + 5.25 = 10h
  if (weekday === 6) return 7;  // Sábado: 07–09, 09:15–12, 12:45–15 => 2 + 2.75 + 2.25 = 7h
  return 0; // Domingo
}

// Segmentos con pausas ya incluidas
export function getDailySegments(weekday) {
  if (weekday >= 1 && weekday <= 5) {
    return [
      { from: '07:00', to: '09:00' },
      { from: '09:15', to: '12:00' },
      { from: '12:45', to: '18:00' },
    ];
  }
  if (weekday === 6) {
    return [
      { from: '07:00', to: '09:00' },
      { from: '09:15', to: '12:00' },
      { from: '12:45', to: '15:00' },
    ];
  }
  return [];
}

function takeFromSegments(dateISO, segments, hoursNeeded) {
  const toDate = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00`);
  const diffH = (a,b) => (b - a) / (1000*60*60);

  const blocks = [];
  let remaining = hoursNeeded;

  for (const seg of segments) {
    if (remaining <= 0) break;
    const s = toDate(dateISO, seg.from);
    const e = toDate(dateISO, seg.to);
    const cap = Math.max(0, diffH(s,e));
    const use = Math.min(cap, remaining);
    if (use > 0) {
      const end = new Date(s.getTime() + use * 3600 * 1000);
      const fmt = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      blocks.push({ start: `${dateISO}T${fmt(s)}:00`, end: `${dateISO}T${fmt(end)}:00`, hours: use });
      remaining -= use;
    }
  }
  return { blocks, used: hoursNeeded - remaining };
}

// Festivo trabajado: bloque fijo 08:00–13:00 (5h)
function holidayWorkedBlock(dateISO) {
  return [{ start: `${dateISO}T08:00:00`, end: `${dateISO}T13:00:00`, hours: 5 }];
}

// Objetivos
const DAILY_BASE_TARGET_WEEKDAY = 7.3; // horas legales/día
const DAILY_BASE_TARGET_SAT = 7.0;     // capacidad máxima del sábado
const WEEKLY_EXTRAS_TARGET = 12.0;     // extras por semana

/**
 * Genera horarios semanales dentro del rango [startDate, endDate], cumpliendo:
 * - Objetivo semanal 56h = base diaria 7.3h (sáb 7h) + extras 12h/sem.
 * - Festivos omitidos, salvo los marcados como "trabajados" (08:00–13:00).
 * - Pausas respetadas (bloques).
 * - Si no alcanza la capacidad: crea igual y devuelve warnings con horas logradas.
 */
export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet, workedHolidaySet = new Set()) {
  const weeks = [];
  const warnings = [];
  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd   = addDays(weekStart, 6);

    // Subrango de esta semana que cae dentro del rango global
    const segStart  = new Date(Math.max(weekStart, rangeStart));
    const segEnd    = new Date(Math.min(weekEnd, end));

    // Pasada 1: calcular base por día y capacidad disponible para extras
    const dayPlan = []; // { ymd, wd, baseTarget, baseUsed, cap, isHoliday, isHolidayWorked }
    let weeklyBaseSum = 0;
    let weeklyCapLeft = 0;
    let weeklyBaseTarget = 0;

    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (d < segStart || d > segEnd) continue;
      const ymd = YMD(d);
      const wd  = isoWeekday(d);

      const isWorkingDay = workingWeekdays.includes(wd);
      const isHoliday = holidaySet.has(ymd);
      const isHolidayWorked = isHoliday && workedHolidaySet.has(ymd);

      if (!isWorkingDay) {
        // No laborable (o domingo), 0h
        dayPlan.push({ ymd, wd, baseTarget: 0, baseUsed: 0, cap: 0, isHoliday, isHolidayWorked });
        continue;
      }

      if (isHoliday && !isHolidayWorked) {
        // Festivo no trabajado
        dayPlan.push({ ymd, wd, baseTarget: 0, baseUsed: 0, cap: 0, isHoliday, isHolidayWorked });
        continue;
      }

      if (isHolidayWorked) {
        // Festivo trabajado: 5h fijas, sin extras este día
        const baseTarget = 5; // objetivo del día cuando es festivo trabajado
        const baseUsed   = 5;
        const cap        = 5;
        dayPlan.push({ ymd, wd, baseTarget, baseUsed, cap, isHoliday, isHolidayWorked });
        weeklyBaseSum += baseUsed;
        weeklyBaseTarget += baseTarget;
        // capLeft = 0 (no extras en festivo)
        continue;
      }

      // Día normal laborable
      const cap = getDailyCapacity(wd);
      const baseTarget = (wd === 6) ? DAILY_BASE_TARGET_SAT : DAILY_BASE_TARGET_WEEKDAY;
      const baseUsed = Math.min(cap, baseTarget);

      dayPlan.push({ ymd, wd, baseTarget, baseUsed, cap, isHoliday, isHolidayWorked: false });

      weeklyBaseSum += baseUsed;
      weeklyBaseTarget += baseTarget;
      weeklyCapLeft += Math.max(0, cap - baseUsed);
    }

    // Extras a asignar esta semana
    let extrasToAssign = Math.min(WEEKLY_EXTRAS_TARGET, weeklyCapLeft);
    let weeklyExtrasSum = 0;

    // Pasada 2: construir bloques (base + extras) por día
    const dias = [];
    for (const dp of dayPlan) {
      const { ymd, wd, cap, baseUsed, isHolidayWorked } = dp;

      if (cap === 0) {
        // Día omitido (no laborable o festivo no trabajado)
        continue;
      }

      let extrasForDay = 0;
      if (!isHolidayWorked) {
        extrasForDay = Math.min(extrasToAssign, Math.max(0, cap - baseUsed));
      }

      const totalForDay = baseUsed + extrasForDay;

      let bloques = [];
      if (isHolidayWorked) {
        bloques = holidayWorkedBlock(ymd); // 5h fijas 08–13
      } else {
        const segments = getDailySegments(wd);
        const { blocks } = takeFromSegments(ymd, segments, totalForDay);
        bloques = blocks;
      }

      // Redondeo suave a 2 decimales
      const round2 = (x) => Math.round(x * 100) / 100;

      dias.push({
        descripcion: '',
        fecha: ymd,
        start: ymd,
        end: ymd,
        horas_base: round2(baseUsed),
        horas_extra: round2(extrasForDay),
        horas: round2(totalForDay),
        bloques
      });

      weeklyExtrasSum += extrasForDay;
      extrasToAssign = Math.max(0, extrasToAssign - extrasForDay);
    }

    const totalSemana = dias.reduce((s, d) => s + Number(d.horas || 0), 0);
    const weekObj = {
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin: format(weekEnd, 'yyyy-MM-dd'),
      dias,
      total_horas_semana: Math.round(totalSemana * 100) / 100
    };
    weeks.push(weekObj);

    // Warnings de la semana
    const targetTotal = weeklyBaseTarget + WEEKLY_EXTRAS_TARGET;
    if (weeklyBaseSum + weeklyExtrasSum < targetTotal - 1e-6) {
      warnings.push(
        `Semana ${weekObj.fecha_inicio}: total ${Math.round((weeklyBaseSum + weeklyExtrasSum)*100)/100}h (objetivo ${targetTotal}h).`
      );
    }
    if (weeklyBaseSum < weeklyBaseTarget - 1e-6) {
      warnings.push(
        `Semana ${weekObj.fecha_inicio}: base ${Math.round(weeklyBaseSum*100)/100}h (objetivo ${weeklyBaseTarget}h).`
      );
    }
    if (weeklyExtrasSum < WEEKLY_EXTRAS_TARGET - 1e-6) {
      warnings.push(
        `Semana ${weekObj.fecha_inicio}: extra ${Math.round(weeklyExtrasSum*100)/100}h (objetivo ${WEEKLY_EXTRAS_TARGET}h).`
      );
    }

    cursor = addWeeks(weekStart, 1);
  }

  return { weeks, warnings };
}
