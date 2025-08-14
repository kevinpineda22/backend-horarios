// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format
} from 'date-fns';

const WEEKLY_BASE = 44;          // <-- SIEMPRE 44h legales/semana
const DAILY_BASE_MAX = 8;        // máx. legales por día
const pad = (n) => String(n).padStart(2, '0');

export const YMD = (d) => new Date(d).toISOString().slice(0,10);
export const addDays = (d, n) => dfAddDays(new Date(d), n);
export const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
export const isoWeekday = (d) => { const wd = new Date(d).getDay(); return wd === 0 ? 7 : wd; }; // 1..7

// Capacidad "total del día" (para techo; extras no deben superar esto)
export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return 10; // Lun-Vie (cap técnica del día)
  if (weekday === 6) return 7;                 // Sábado
  return 0;                                    // Domingo
}

// Segmentos de trabajo (ya incluyen pausas de 15m y almuerzo)
export function getDailySegments(weekday, holidayOverride) {
  // Si el festivo se va a trabajar, 08:00–13:00 (5h)
  if (holidayOverride === 'work') {
    return [{ from: '08:00', to: '13:00' }];
  }
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
  let remaining = Math.max(0, Math.floor(Number(hoursNeeded || 0))); // <-- horas enteras

  for (const seg of segments) {
    if (remaining <= 0) break;
    const s = toDate(dateISO, seg.from);
    const e = toDate(dateISO, seg.to);
    const cap = Math.max(0, Math.floor(diffH(s,e)));                  // <-- enteras
    const use = Math.min(cap, remaining);
    if (use > 0) {
      const end = new Date(s.getTime() + use * 3600 * 1000);
      const fmt = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      blocks.push({ start: `${dateISO}T${fmt(s)}:00`, end: `${dateISO}T${fmt(end)}:00`, hours: use });
      remaining -= use;
    }
  }
  return { blocks, used: Math.max(0, Math.floor(Number(hoursNeeded || 0))) - remaining };
}

function generateBaseWeek({
  weekStart,
  rangeStart,
  rangeEnd,
  workingWeekdays,
  holidaySet,
  holidayOverrides = {}
}) {
  let remainingBase = WEEKLY_BASE; // <-- empezamos con 44h
  const dias = [];

  // Días candidatos (dentro del rango y semana)
  const candidates = [];
  for (let i=0;i<7;i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;
    const ymd = YMD(d);
    const wd  = isoWeekday(d);
    const isHoliday = holidaySet.has(ymd);
    const override  = holidayOverrides[ymd]; // 'work' | 'skip' | undefined
    const skipByOverride = (isHoliday && override === 'skip');
    const ok = workingWeekdays.includes(wd) && !skipByOverride;
    candidates.push({ ymd, wd, ok, override });
  }

  // Asignación LEGAL: máximo 8h por día, hasta sumar EXACTAMENTE 44h en la semana.
  for (const c of candidates) {
    const segs = getDailySegments(c.wd, c.override);
    // capacidad real de segmentos (entera)
    const segCap = segs.reduce((h, seg) => {
      const [sh, sm] = seg.from.split(':').map(Number);
      const [eh, em] = seg.to.split(':').map(Number);
      return h + Math.floor(((eh*60+em) - (sh*60+sm)) / 60);
    }, 0);

    let base = 0;
    if (c.ok && remainingBase > 0 && segCap > 0) {
      base = Math.min(DAILY_BASE_MAX, segCap, remainingBase); // <-- 8h/día máx y no pasar de 44
    }
    const { blocks, used } = takeFromSegments(c.ymd, segs, base);
    base = used; // ya en enteros

    dias.push({
      descripcion: '',
      fecha: c.ymd,
      start: c.ymd,
      end: c.ymd,
      horas_base: base,           // <-- esto suma SIEMPRE 44 al final (si hay capacidad)
      horas_extra: 0,
      horas: base,
      bloques: blocks
    });

    remainingBase -= base;
  }

  // Si no alcanzó 44 (p. ej. por festivos/selección), el caller decide si acepta semana parcial
  const total = dias.reduce((s,d)=> s + d.horas, 0);
  return {
    dias,
    total_horas_semana: total,
    remaining_base_unfilled: Math.max(0, remainingBase) // información para aviso de "semana incompleta"
  };
}

export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
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
      holidayOverrides
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
