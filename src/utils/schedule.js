// src/utils/schedule.js
import { differenceInCalendarWeeks, addDays, format } from 'date-fns';

// --- Constantes de negocio ---
const DAILY_LEGAL_LIMIT = 8;       // Horas legales por día
const WEEKLY_LEGAL_LIMIT = 44;     // Horas legales por semana
const WEEKLY_EXTRA_LIMIT = 12;     // Máx extras por semana
const WEEKLY_TOTAL_LIMIT = 56;     // 44 legales + 12 extras
const HOLIDAY_HOURS = 6;           // Capacidad festivo trabajado

const BREAKFAST_MINUTES = 15;      // 15 min desayuno
const LUNCH_MINUTES = 45;          // 45 min almuerzo

// --- Nombres de días (ISO 1 = Lunes ... 7 = Domingo) ---
const WD_NAME = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

// --- Utilidades ---
function hmToMinutes(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
function minutesToHM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// --- Info por día según calendario ---
function getDayInfo(wd, isHoliday, holidayOverride) {
  if (isHoliday && holidayOverride === 'work') {
    // Festivo trabajado: 7–13 (6h) + desayuno
    return {
      capacity: HOLIDAY_HOURS,
      segments: [{ from: hmToMinutes('07:00'), to: hmToMinutes('13:00') }],
      breaks: [
        { start: hmToMinutes('09:00'), duration: BREAKFAST_MINUTES },
      ],
    };
  }

  const info = {
    capacity: wd === 6 ? 8 : 10,
    segments: [
      { from: hmToMinutes('07:00'), to: hmToMinutes('09:00') },
      { from: hmToMinutes('09:15'), to: hmToMinutes('12:00') },
      { from: hmToMinutes('12:45'), to: hmToMinutes(wd === 6 ? '16:00' : '18:00') },
    ],
    breaks: [
      { start: hmToMinutes('09:00'), duration: BREAKFAST_MINUTES },
      { start: hmToMinutes('12:00'), duration: LUNCH_MINUTES },
    ],
  };
  return info;
}

// --- Distribuye horas aleatoriamente en el rango del día ---
function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
  if (hoursNeeded <= 0) return { blocks: [], used: 0, entryTime: null, exitTime: null };

  const { segments, breaks } = dayInfo;
  // Siempre sumamos los descansos definidos del día
  let totalShiftMinutes = hoursNeeded * 60 + breaks.reduce((s, b) => s + (b.duration || 0), 0);

  const earliestStart = segments[0].from;
  const latestEnd = segments[segments.length - 1].to;
  const latestStart = latestEnd - totalShiftMinutes;

  if (latestStart < earliestStart) {
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }

  const start = earliestStart; // fijo desde 7:00
  let cursor = start;
  const blocks = [];

  for (const seg of segments) {
    if (cursor < seg.from) cursor = seg.from;
    if (cursor >= seg.to) continue;

    let segAvail = seg.to - cursor;
    let need = totalShiftMinutes - (cursor - start);
    let take = Math.min(segAvail, need);
    if (take <= 0) break;

    blocks.push({
      from: minutesToHM(cursor),
      to: minutesToHM(cursor + take),
    });
    cursor += take;
  }

  const used = hoursNeeded;
  const entryTime = minutesToHM(start);
  const exitTime = minutesToHM(start + totalShiftMinutes);
  return { blocks, used, entryTime, exitTime };
}

// --- Distribución principal ---
export function generateScheduleForRange56(fechaInicio, fechaFin, festivos, holidayOverrides) {
  const dias = [];
  let current = new Date(fechaInicio);
  const end = new Date(fechaFin);

  let weekStart = new Date(current);
  let weekLegalUsed = 0;
  let weekExtraUsed = 0;

  while (current <= end) {
    const wd = current.getDay() === 0 ? 7 : current.getDay(); // 1=Mon ... 7=Sun
    const ymd = format(current, 'yyyy-MM-dd');
    const isHoliday = festivos.some(f => f.fecha === ymd);
    const holidayOverride = holidayOverrides[ymd];
    const workable = (wd <= 6) && (!isHoliday || holidayOverride === 'work');

    if (wd === 1 && dias.length > 0) {
      // Reinicio semana
      weekLegalUsed = 0;
      weekExtraUsed = 0;
      weekStart = new Date(current);
    }

    if (!workable) {
      dias.push({
        fecha: ymd,
        descripcion: WD_NAME[wd],
        horas: 0,
        horas_base: 0,
        horas_extra: 0,
        bloques: [],
        jornada_entrada: null,
        jornada_salida: null,
      });
      current = addDays(current, 1);
      continue;
    }

    const dayInfo = getDayInfo(wd, isHoliday, holidayOverride);
    const maxLegalToday = Math.min(DAILY_LEGAL_LIMIT, dayInfo.capacity);
    let base = 0, extra = 0;

    // Asignar legales primero
    if (weekLegalUsed < WEEKLY_LEGAL_LIMIT) {
      const remainLegal = WEEKLY_LEGAL_LIMIT - weekLegalUsed;
      base = Math.min(maxLegalToday, remainLegal);
    }

    weekLegalUsed += base;

    // Luego extras si caben
    const remainExtra = WEEKLY_EXTRA_LIMIT - weekExtraUsed;
    if (remainExtra > 0) {
      const avail = dayInfo.capacity - base;
      extra = Math.min(remainExtra, avail);
    }

    weekExtraUsed += extra;
    const totalHours = base + extra;

    const { blocks, entryTime, exitTime } = allocateHoursRandomly(ymd, dayInfo, totalHours);

    dias.push({
      fecha: ymd,
      descripcion: WD_NAME[wd],
      horas: totalHours,
      horas_base: base,
      horas_extra: extra,
      bloques: blocks,
      jornada_entrada: entryTime || null,
      jornada_salida: exitTime || null,
    });

    current = addDays(current, 1);
  }

  return dias;
}

// --- Export adicional ---
export function getDailyCapacity(wd, isHoliday) {
  if (isHoliday) return HOLIDAY_HOURS;
  if (wd === 6) return 8;
  if (wd >= 1 && wd <= 5) return 10;
  return 0;
}
