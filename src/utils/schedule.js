// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format
} from 'date-fns';

const pad = (n) => String(n).padStart(2, '0');
export const YMD = (d) => new Date(d).toISOString().slice(0, 10);
export const addDays = (d, n) => dfAddDays(new Date(d), n);
export const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
export const isoWeekday = (d) => { const wd = new Date(d).getDay(); return wd === 0 ? 7 : wd; };

// --- CONSTANTES ---
export const WEEKLY_BASE = 44;
export const WEEKLY_EXTRA = 12;
export const DAILY_CAP_WEEKDAY = 10;
export const DAILY_CAP_SAT = 8;
export const DAILY_MIN_BASE_WEEKDAY = 8;
const HOLIDAY_CAPACITY = 6;
const BREAKFAST_MINUTES = 15;
const LUNCH_MINUTES = 45;

// --- HELPERS DE TIEMPO ---
const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + (mm || 0);
};

const minutesToHHMM = (m) => {
  const hh = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return `${pad(hh)}:${pad(mm)}`;
};

export function getDailyCapacity(weekday, isHoliday, holidayOverride) {
  if (isHoliday && holidayOverride === 'work') return HOLIDAY_CAPACITY;
  if (weekday >= 1 && weekday <= 5) return DAILY_CAP_WEEKDAY;
  if (weekday === 6) return DAILY_CAP_SAT;
  return 0;
}

function getDaySegmentsAndBreaks(weekday, isHoliday, holidayOverride) {
  if (isHoliday && holidayOverride === 'work') {
    return {
      segments: [{ from: hmToMinutes('07:00'), to: hmToMinutes('13:00') }],
      breaks: [],
    };
  }
  const daySegments = {
    segments: [
      { from: hmToMinutes('07:00'), to: hmToMinutes('09:00') },
      { from: hmToMinutes('09:15'), to: hmToMinutes('12:00') },
      { from: hmToMinutes('12:45'), to: hmToMinutes(weekday === 6 ? '16:00' : '18:00') },
    ],
    breaks: [
      { start: hmToMinutes('09:00'), duration: BREAKFAST_MINUTES },
      { start: hmToMinutes('12:00'), duration: LUNCH_MINUTES },
    ],
  };
  return daySegments;
}

function calculateShiftEndTime(startTimeMinutes, workMinutes, breaks) {
  let endTimeMinutes = startTimeMinutes + workMinutes;
  for (const breakInfo of breaks) {
    if (startTimeMinutes < breakInfo.start && endTimeMinutes >= breakInfo.start) {
      endTimeMinutes += breakInfo.duration;
    }
  }
  return endTimeMinutes;
}

// ===================================================================
// INICIO DE LA CORRECCIÓN: Nueva función para distribuir horas base
// ===================================================================
/**
 * Distribuye las horas base entre una lista de días laborables válidos.
 * @param {Array} workableDays - Lista de objetos { wd, capacity } para los días a trabajar.
 */
function distributeBaseHours(workableDays) {
    const targets = {};
    let hoursToDistribute = WEEKLY_BASE;

    if (workableDays.length === 0) return targets;

    // Inicializar contadores
    workableDays.forEach(day => targets[day.wd] = 0);

    // Asignar el mínimo obligatorio a los días de semana que no son festivos
    const weekdays = workableDays.filter(day => day.wd >= 1 && day.wd <= 5 && day.capacity > HOLIDAY_CAPACITY);
    for (const day of weekdays) {
        const hours = Math.min(DAILY_MIN_BASE_WEEKDAY, day.capacity);
        targets[day.wd] = hours;
        hoursToDistribute -= hours;
    }

    // Distribuir las horas restantes aleatoriamente entre TODOS los días laborables
    let attempts = 100; // Safeguard
    while (hoursToDistribute > 0 && attempts > 0) {
        const randomDay = workableDays[Math.floor(Math.random() * workableDays.length)];
        
        if (targets[randomDay.wd] < randomDay.capacity) {
            targets[randomDay.wd]++;
            hoursToDistribute--;
        }
        attempts--;
    }

    return targets;
}
// ===================================================================
// FIN DE LA CORRECCIÓN
// ===================================================================

function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
  if (hoursNeeded <= 0) {
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }
  const { segments, breaks } = dayInfo;
  let totalShiftMinutes = hoursNeeded * 60;
  if (hoursNeeded > 4) totalShiftMinutes += LUNCH_MINUTES;
  if (hoursNeeded > 2) totalShiftMinutes += BREAKFAST_MINUTES;

  const earliestStart = segments[0].from;
  const latestEnd = segments[segments.length - 1].to;
  const latestStart = latestEnd - totalShiftMinutes;
  
  if (latestStart < earliestStart) {
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }

  const range = (latestStart - earliestStart) / 15;
  const randomStep = Math.floor(Math.random() * (range + 1));
  const startTimeMinutes = earliestStart + randomStep * 15;
  const finalExitTime = calculateShiftEndTime(startTimeMinutes, hoursNeeded * 60, breaks);
  const blocks = [];
  let remainingWork = hoursNeeded * 60;
  let currentTime = startTimeMinutes;

  while (remainingWork > 0) {
    const currentBreak = breaks.find(b => currentTime >= b.start && currentTime < b.start + b.duration);
    if (currentBreak) {
      currentTime = currentBreak.start + currentBreak.duration;
      continue;
    }
    const blockEnd = currentTime + remainingWork;
    const nextBreak = breaks.find(b => currentTime < b.start && blockEnd >= b.start);
    const endOfBlock = nextBreak ? nextBreak.start : blockEnd;
    const durationInBlock = endOfBlock - currentTime;

    if (durationInBlock > 0) {
      blocks.push({
        start: `${dateISO}T${minutesToHHMM(currentTime)}:00`,
        end: `${dateISO}T${minutesToHHMM(endOfBlock)}:00`,
        hours: durationInBlock / 60,
      });
    }
    remainingWork -= durationInBlock;
    currentTime = endOfBlock;
  }
  return {
    blocks,
    used: hoursNeeded,
    entryTime: minutesToHHMM(startTimeMinutes),
    exitTime: minutesToHHMM(finalExitTime)
  };
}

export function generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const schedules = [];
  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd = addDays(weekStart, 6);

    // ===================================================================
    // INICIO DE LA CORRECCIÓN: Identificar días laborables ANTES de distribuir horas
    // ===================================================================
    const workableDaysInWeek = [];
    for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        const ymd = YMD(d);
        const wd = isoWeekday(d);

        if (d < rangeStart || d > end || !workingWeekdays.includes(wd)) continue;

        const isHoliday = holidaySet.has(ymd);
        const override = holidayOverrides[ymd];
        if (isHoliday && override !== 'work') continue;
        
        const capacity = getDailyCapacity(wd, isHoliday, override);
        if (capacity > 0) {
            workableDaysInWeek.push({ ymd, wd, isHoliday, override, capacity });
        }
    }

    const baseTargets = distributeBaseHours(workableDaysInWeek);
    const dias = [];
    // ===================================================================
    // FIN DE LA CORRECCIÓN
    // ===================================================================

    for (const day of workableDaysInWeek) {
      const dayInfo = getDaySegmentsAndBreaks(day.wd, day.isHoliday, day.override);
      const baseHours = baseTargets[day.wd] || 0;
      const { blocks, used, entryTime, exitTime } = allocateHoursRandomly(day.ymd, dayInfo, baseHours);
      
      if (used > 0) {
        dias.push({
          fecha: day.ymd,
          horas_base: used,
          horas_extra: 0,
          horas: used,
          bloques: blocks.map(b => ({ ...b, type: 'base' })),
          jornada_entrada: entryTime,
          jornada_salida: exitTime,
        });
      }
    }
    
    if (dias.length > 0) {
      let extrasToDistribute = WEEKLY_EXTRA;
      let attempts = 100; 
      while (extrasToDistribute > 0 && attempts > 0) {
          const randomDay = dias[Math.floor(Math.random() * dias.length)];
          const wd = isoWeekday(randomDay.fecha);
          const isHoliday = holidaySet.has(randomDay.fecha);
          const override = holidayOverrides[randomDay.fecha];
          const capacity = getDailyCapacity(wd, isHoliday, override);

          if (randomDay.horas < capacity) {
              randomDay.horas_extra++;
              randomDay.horas++;
              extrasToDistribute--;
          }
          attempts--;
      }

      for(const dia of dias) {
        if(dia.horas > dia.horas_base) {
          const wd = isoWeekday(dia.fecha);
          const isHoliday = holidaySet.has(dia.fecha);
          const override = holidayOverrides[dia.fecha];
          const dayInfo = getDaySegmentsAndBreaks(wd, isHoliday, override);
          const { blocks, entryTime, exitTime } = allocateHoursRandomly(dia.fecha, dayInfo, dia.horas);
          
          dia.bloques = blocks.map(b => ({...b, type: 'compound'}));
          dia.jornada_entrada = entryTime;
          dia.jornada_salida = exitTime;
        }
      }
    }

    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin: format(weekEnd, 'yyyy-MM-dd'),
      dias: dias,
      total_horas_semana: dias.reduce((sum, d) => sum + d.horas, 0),
    });

    cursor = addWeeks(weekStart, 1);
  }

  return schedules;
}