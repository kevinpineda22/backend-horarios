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

export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return 10; // Lun-Vie
  if (weekday === 6) return 7; // Sábado
  return 0; // Domingo
}

export function getDailySegments(weekday) {
  if (weekday >= 1 && weekday <= 5) {
    // 10h netas: 07–09, 09:15–12, 12:45–18
    return [
      { from: '07:00', to: '09:00' },
      { from: '09:15', to: '12:00' },
      { from: '12:45', to: '18:00' },
    ];
  }
  if (weekday === 6) {
    // 7h netas: 07–09, 09:15–12, 12:45–15
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

function generateBaseWeek({
  weekStart,
  rangeStart,
  rangeEnd,
  workingWeekdays,
  holidaySet,
}) {
  let remainingBase = 44;
  const dias = [];

  // candidatos (solo días de esta semana dentro del subrango)
  const candidates = [];
  for (let i=0;i<7;i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;
    const ymd = YMD(d);
    const wd  = isoWeekday(d);
    const ok = workingWeekdays.includes(wd) && !holidaySet.has(ymd);
    const cap = getDailyCapacity(wd);
    candidates.push({ ymd, wd, ok: ok && cap > 0, cap });
  }

  const maxPossible = candidates.reduce((s,c)=> s + (c.ok ? Math.min(10, c.cap) : 0), 0);
  if (maxPossible < 44) {
    const w = YMD(weekStart);
    throw new Error(`Semana ${w}: con los días seleccionados y festivos solo hay ${maxPossible}h posibles. No se pueden cumplir 44h.`);
  }

  for (let i=0;i<candidates.length;i++) {
    const c = candidates[i];
    const segments = getDailySegments(c.wd);

    let base = 0;
    if (c.ok && remainingBase > 0) {
      const ideal = Math.min(10, c.cap);
      base = Math.min(ideal, remainingBase); // el último día cerrará exacto
    }

    const { blocks, used } = takeFromSegments(c.ymd, segments, base);
    base = used;

    dias.push({
      descripcion: '', // opcional
      fecha: c.ymd,
      start: c.ymd, // si usas allDay
      end: c.ymd,
      horas_base: base,
      horas_extra: 0,
      horas: base,
      bloques: blocks
    });

    remainingBase -= base;
  }

  if (remainingBase > 0.0001) {
    const w = YMD(weekStart);
    throw new Error(`Semana ${w}: no se logró cerrar en 44h (faltan ${remainingBase.toFixed(2)}h).`);
  }

  const total = dias.reduce((s,d)=> s + d.horas, 0);
  return { dias, total_horas_semana: total };
}

/**
 * Genera horarios semanales dentro del rango [startDate, endDate], cumpliendo:
 * - 44h base exactas por semana
 * - Días laborables = workingWeekdays (array de 1..7 => Lun..Dom)
 * - Festivos omitidos (holidaySet)
 * - Capacidad diaria respetada (10 L–V, 7 Sáb)
 * - Pausas respetadas (bloques)
 */
export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet) {
  const schedules = [];
  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd   = addDays(weekStart, 6);
    const segStart  = new Date(Math.max(weekStart, rangeStart));
    const segEnd    = new Date(Math.min(weekEnd, end));

    const { dias, total_horas_semana } = generateBaseWeek({
      weekStart,
      rangeStart: segStart,
      rangeEnd: segEnd,
      workingWeekdays,
      holidaySet,
    });

    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin:    format(weekEnd,   'yyyy-MM-dd'),
      dias,
      total_horas_semana
    });

    cursor = addWeeks(weekStart, 1);
  }

  return schedules;
}
