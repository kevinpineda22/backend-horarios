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

export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return DAILY_CAP_WEEKDAY;
  if (weekday === 6) return DAILY_CAP_SAT;
  return 0;
}

/**
 * Devuelve los segmentos de trabajo y los descansos para un día.
 */
function getDaySegmentsAndBreaks(weekday, holidayOverride) {
  if (holidayOverride === 'work') {
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

/**
 * Calcula la hora de finalización de una jornada, teniendo en cuenta los descansos.
 */
function calculateShiftEndTime(startTimeMinutes, workMinutes, breaks) {
  let endTimeMinutes = startTimeMinutes + workMinutes;
  for (const breakInfo of breaks) {
    if (startTimeMinutes < breakInfo.start && endTimeMinutes >= breakInfo.start) {
      endTimeMinutes += breakInfo.duration;
    }
  }
  return endTimeMinutes;
}

/**
 * Distribuye las 44 horas base de forma aleatoria entre los días laborables,
 * respetando el mínimo de 8 horas diarias de Lunes a Viernes.
 */
function distributeBaseHoursRandomly(workingWeekdays) {
  const targets = {};
  let hoursToDistribute = WEEKLY_BASE;
  const weekdays = workingWeekdays.filter(d => d >= 1 && d <= 5);

  // Asignar el mínimo obligatorio
  for (const day of weekdays) {
    targets[day] = DAILY_MIN_BASE_WEEKDAY;
    hoursToDistribute -= DAILY_MIN_BASE_WEEKDAY;
  }

  // Distribuir las horas restantes aleatoriamente
  while (hoursToDistribute > 0) {
    const randomDay = weekdays[Math.floor(Math.random() * weekdays.length)];
    const capacity = getDailyCapacity(randomDay);
    if (targets[randomDay] < capacity) {
      targets[randomDay]++;
      hoursToDistribute--;
    }
  }
  return targets;
}

/**
 * Asigna los bloques de trabajo para un número de horas dado, con una hora de inicio aleatoria.
 */
function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
  if (hoursNeeded <= 0) {
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }

  const { segments, breaks } = dayInfo;
  
  // Calcular la duración total de la jornada (trabajo + descansos que apliquen)
  let totalShiftMinutes = hoursNeeded * 60;
  if (hoursNeeded > 4) totalShiftMinutes += LUNCH_MINUTES;
  if (hoursNeeded > 2) totalShiftMinutes += BREAKFAST_MINUTES;

  const earliestStart = segments[0].from;
  const latestEnd = segments[segments.length - 1].to;
  const latestStart = latestEnd - totalShiftMinutes;
  
  if (latestStart < earliestStart) { // No hay suficiente tiempo en el día
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }

  // Elegir una hora de inicio aleatoria (en incrementos de 15 min para variedad controlada)
  const range = (latestStart - earliestStart) / 15;
  const randomStep = Math.floor(Math.random() * (range + 1));
  const startTimeMinutes = earliestStart + randomStep * 15;

  const finalExitTime = calculateShiftEndTime(startTimeMinutes, hoursNeeded * 60, breaks);
  
  // Construir los bloques de trabajo
  const blocks = [];
  let remainingWork = hoursNeeded * 60;
  let currentTime = startTimeMinutes;

  while (remainingWork > 0) {
    const currentBreak = breaks.find(b => currentTime >= b.start && currentTime < b.start + b.duration);
    if (currentBreak) { // Si estamos en un descanso, saltar al final del mismo
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


// --- LÓGICA PRINCIPAL DE GENERACIÓN ---
export function generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const schedules = [];
  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd = addDays(weekStart, 6);

    // 1. Distribuir horas base aleatoriamente
    const baseTargets = distributeBaseHoursRandomly(workingWeekdays);
    
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const ymd = YMD(d);
      const wd = isoWeekday(d);

      if (d < rangeStart || d > end || !workingWeekdays.includes(wd)) {
        continue;
      }

      const override = holidayOverrides[ymd];
      const isHoliday = holidaySet.has(ymd);
      if (isHoliday && override !== 'work') continue;

      const dayInfo = getDaySegmentsAndBreaks(wd, override);
      const baseHours = baseTargets[wd] || 0;
      const { blocks, used, entryTime, exitTime } = allocateHoursRandomly(ymd, dayInfo, baseHours);
      
      dias.push({
        fecha: ymd,
        horas_base: used,
        horas_extra: 0,
        horas: used,
        bloques: blocks.map(b => ({ ...b, type: 'base' })),
        jornada_entrada: entryTime,
        jornada_salida: exitTime,
      });
    }

    // 2. Distribuir horas extras
    let extrasToDistribute = WEEKLY_EXTRA;
    let attempts = 50; // Para evitar bucles infinitos
    while (extrasToDistribute > 0 && attempts > 0) {
        const randomDay = dias[Math.floor(Math.random() * dias.length)];
        const wd = isoWeekday(randomDay.fecha);
        const capacity = getDailyCapacity(wd);

        if (randomDay.horas < capacity) {
            randomDay.horas_extra++;
            randomDay.horas++;
            extrasToDistribute--;
        }
        attempts--;
    }

    // 3. Recalcular bloques y jornada final para cada día con extras
    for(const dia of dias) {
      if(dia.horas > dia.horas_base) {
        const wd = isoWeekday(dia.fecha);
        const override = holidayOverrides[dia.fecha];
        const dayInfo = getDaySegmentsAndBreaks(wd, override);
        const { blocks, entryTime, exitTime } = allocateHoursRandomly(ymd, dayInfo, dia.horas);
        
        dia.bloques = blocks.map(b => ({...b, type: 'compound'})); // Tipo genérico
        dia.jornada_entrada = entryTime;
        dia.jornada_salida = exitTime;
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