// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format
} from 'date-fns';

const pad = (n) => String(n).padStart(2,'0');
const YMD = (d) => new Date(d).toISOString().slice(0,10);
const addDays = (d, n) => dfAddDays(new Date(d), n);
const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
const isoWeekday = (d) => { const wd = new Date(d).getDay(); return wd === 0 ? 7 : wd; }; // 1..7

// Negocio
const BUSINESS = {
  weekday: { open: '07:00', close: '18:00' }, // L–V
  saturday: { open: '07:00', close: '15:00' } // Sáb
};

// Breaks (visuales, NO se cuentan)
const BREAKS = {
  breakfast: 15, // minutos
  lunch: 45     // minutos
};

// Capacidades netas por día (sin breaks)
function getDailyNetCap(weekday) {
  if (weekday >= 1 && weekday <= 5) return 10; // L–V
  if (weekday === 6) return 7;                 // Sábado
  return 0;                                    // Domingo
}

// ventana negocio por día
function getBusinessWindow(weekday) {
  if (weekday >= 1 && weekday <= 5) return BUSINESS.weekday;
  if (weekday === 6) return BUSINESS.saturday;
  return null;
}

function hmToMinutes(hhmm) { const [h,m] = hhmm.split(':').map(Number); return h*60 + (m||0); }
function minutesToHHMM(m) { const h = Math.floor(m/60); const mm = m%60; return `${pad(h)}:${pad(mm)}`; }

// aleatorio múltiplo de 15’
function randomStartInWindow(minStartMin, maxStartMin) {
  if (maxStartMin < minStartMin) return minStartMin;
  const steps = Math.floor((maxStartMin - minStartMin) / 15);
  const rndSteps = Math.floor(Math.random() * (steps + 1));
  return minStartMin + rndSteps * 15;
}

/**
 * buildDayWithBreaks
 * Genera bloques de trabajo y breaks.
 * - horasNetas: 8|9|10 (L–V) o 7 (Sáb)
 * - El turno visible = horasNetas + 60min (breaks).
 * - Breakfast a las ~2h del inicio; Lunch en la mitad del turno visible.
 * - Devuelve {bloques, entradaHHMM, salidaHHMM}
 */
function buildDayWithBreaks(dateISO, weekday, horasNetas) {
  if (horasNetas <= 0) {
    return { bloques: [], entradaHHMM: null, salidaHHMM: null };
  }

  const window = getBusinessWindow(weekday);
  const openMin = hmToMinutes(window.open);
  const closeMin = hmToMinutes(window.close);
  const visibleMinutes = horasNetas * 60 + (BREAKS.breakfast + BREAKS.lunch);

  // última hora de inicio para caber dentro del negocio
  const maxStart = closeMin - visibleMinutes;
  const startMin = randomStartInWindow(openMin, Math.max(openMin, maxStart));
  const endMin = startMin + visibleMinutes;

  // ubicamos breakfast (≈ +2h) y lunch (≈ mitad del turno visible)
  const breakfastStart = startMin + 120; // +2h
  const breakfastEnd   = breakfastStart + BREAKS.breakfast;

  const midPoint = startMin + Math.floor(visibleMinutes / 2);
  const lunchStart = midPoint;
  const lunchEnd   = lunchStart + BREAKS.lunch;

  // bloques de trabajo (tres tramos) + breaks
  // Tramo A: inicio -> breakfastStart
  // Break breakfast: breakfastStart -> breakfastEnd
  // Tramo B: breakfastEnd -> lunchStart
  // Break lunch: lunchStart -> lunchEnd
  // Tramo C: lunchEnd -> endMin
  const blocks = [];

  const pushWork = (a, b) => {
    const dur = Math.max(0, b - a);
    if (dur >= 15) {
      blocks.push({
        start: `${dateISO}T${minutesToHHMM(a)}:00`,
        end: `${dateISO}T${minutesToHHMM(b)}:00`,
        hours: Math.floor(dur/60), // solo horas enteras
        type: 'work'
      });
    }
  };

  const pushBreak = (a, b, kind) => {
    if (b > a) {
      blocks.push({
        start: `${dateISO}T${minutesToHHMM(a)}:00`,
        end: `${dateISO}T${minutesToHHMM(b)}:00`,
        hours: 0,
        type: kind // 'break_breakfast' | 'break_lunch'
      });
    }
  };

  // A
  pushWork(startMin, breakfastStart);
  // breakfast
  pushBreak(breakfastStart, breakfastEnd, 'break_breakfast');
  // B
  pushWork(breakfastEnd, lunchStart);
  // lunch
  pushBreak(lunchStart, lunchEnd, 'break_lunch');
  // C
  pushWork(lunchEnd, endMin);

  // Ajuste: asegura que la suma de horas work == horasNetas
  const sumNet = blocks.filter(b => b.type === 'work').reduce((s,b)=> s + b.hours, 0);
  if (sumNet !== horasNetas) {
    // corrige redondeando el último tramo de trabajo
    const idx = [...blocks].reverse().findIndex(b => b.type === 'work');
    if (idx >= 0) {
      const lastWorkIndex = blocks.length - 1 - idx;
      const diff = horasNetas - sumNet;
      blocks[lastWorkIndex].hours = Math.max(0, blocks[lastWorkIndex].hours + diff);
      // y estira su 'end' en horas enteras
      const st = blocks[lastWorkIndex].start.split('T')[1].slice(0,5);
      const stMin = hmToMinutes(st);
      const newEnd = stMin + blocks[lastWorkIndex].hours * 60;
      blocks[lastWorkIndex].end = `${dateISO}T${minutesToHHMM(newEnd)}:00`;
    }
  }

  const entradaHHMM = minutesToHHMM(startMin);
  const salidaHHMM  = minutesToHHMM(endMin);

  return { bloques: blocks, entradaHHMM, salidaHHMM };
}

/**
 * generateRandomWeek
 * - L–V: horas netas aleatorias 8..10 (enteras)
 * - Sáb: 7 netas (turno 7:00–15:00 visible por breaks)
 * - Dom: 0
 * - Solo se generan días que estén (a) dentro del rango y (b) en workingWeekdays
 */
function generateRandomWeek({ weekStart, rangeStart, rangeEnd, workingWeekdays }) {
  const dias = [];

  for (let i=0;i<7;i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;

    const ymd = YMD(d);
    const wd = isoWeekday(d);
    const isWorking = workingWeekdays.includes(wd);

    if (!isWorking || wd === 7) {
      dias.push({ descripcion:'', fecha: ymd, start: ymd, end: ymd, horas: 0, bloques: [] });
      continue;
    }

    let horasNetas = 0;
    if (wd >= 1 && wd <= 5) { // L–V
      horasNetas = 8 + Math.floor(Math.random() * 3); // 8,9,10
      horasNetas = Math.min(horasNetas, getDailyNetCap(wd));
    } else if (wd === 6) { // Sábado fijo 7 netas
      horasNetas = 7;
    }

    const { bloques, entradaHHMM, salidaHHMM } = buildDayWithBreaks(ymd, wd, horasNetas);
    const netHours = bloques.filter(b => b.type === 'work').reduce((s,b)=> s + b.hours, 0);

    dias.push({
      descripcion: '',
      fecha: ymd,
      start: ymd,
      end: ymd,
      horas: netHours, // solo netas
      entrada: entradaHHMM,
      salida: salidaHHMM,
      bloques
    });
  }

  const total = dias.reduce((s,d)=> s + (d.horas || 0), 0);
  return { dias, total_horas_semana: total };
}

/**
 * generateScheduleRandomRange
 * Recorre semanas ISO entre startDate y endDate y genera aleatoriamente las horas por día.
 */
export function generateScheduleRandomRange(startDate, endDate, workingWeekdays) {
  const schedules = [];
  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd   = addDays(weekStart, 6);
    const segStart  = new Date(Math.max(weekStart, rangeStart));
    const segEnd    = new Date(Math.min(weekEnd, end));

    const { dias, total_horas_semana } = generateRandomWeek({
      weekStart,
      rangeStart: segStart,
      rangeEnd: segEnd,
      workingWeekdays
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

// Exports útiles a otros módulos
export {
  YMD,
  addDays,
  startOfISOWeek,
  isoWeekday
};
