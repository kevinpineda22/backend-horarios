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
const DAILY_MIN_WEEKDAY = 8;
const DAILY_MAX_WEEKDAY = 10;
const HOLIDAY_HOURS = 6;
const BREAKFAST_MINUTES = 15;
const LUNCH_MINUTES = 45;

// --- HELPERS ---
const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + (mm || 0);
};

const minutesToHHMM = (m) => {
  const hh = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return `${pad(hh)}:${pad(mm)}`;
};

export function getDailyCapacity(wd, isHoliday, holidayOverride) {
  if (isHoliday && holidayOverride === 'work') return HOLIDAY_HOURS;
  if (wd >= 1 && wd <= 5) return DAILY_MAX_WEEKDAY;
  if (wd === 6) return 8; // Capacidad Sábado
  return 0;
}

function getDayInfo(wd, isHoliday, holidayOverride) {
  if (isHoliday && holidayOverride === 'work') {
    return {
      capacity: HOLIDAY_HOURS,
      segments: [{ from: hmToMinutes('07:00'), to: hmToMinutes('13:00') }],
      breaks: [],
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

function calculateShiftEndTime(startTimeMinutes, workMinutes, breaks) {
  let endTimeMinutes = startTimeMinutes + workMinutes;
  for (const breakInfo of breaks) {
    if (startTimeMinutes < breakInfo.start && endTimeMinutes > breakInfo.start) {
      endTimeMinutes += breakInfo.duration;
    }
  }
  return endTimeMinutes;
}

function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
  if (hoursNeeded <= 0) return { blocks: [], used: 0, entryTime: null, exitTime: null };
  
  const { segments, breaks } = dayInfo;
  let totalShiftMinutes = hoursNeeded * 60;
  if (hoursNeeded > 4) totalShiftMinutes += LUNCH_MINUTES;
  if (hoursNeeded > 2) totalShiftMinutes += BREAKFAST_MINUTES;

  const earliestStart = segments[0].from;
  const latestEnd = segments[segments.length - 1].to;
  const latestStart = latestEnd - totalShiftMinutes;
  
  if (latestStart < earliestStart) return { blocks: [], used: 0, entryTime: null, exitTime: null };

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
  return { blocks, used: hoursNeeded, entryTime: minutesToHHMM(startTimeMinutes), exitTime: minutesToHHMM(finalExitTime) };
}

// --- LÓGICA PRINCIPAL ---
export function generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const schedules = [];
  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd = addDays(weekStart, 6);
    const dias = [];
    let hoursToDistribute = WEEKLY_BASE + WEEKLY_EXTRA;

    const workableDaysThisWeek = [];
    for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        if (d < rangeStart || d > end) continue;

        const ymd = YMD(d);
        const wd = isoWeekday(d);
        if (!workingWeekdays.includes(wd)) continue;

        const isHoliday = holidaySet.has(ymd);
        const override = holidayOverrides[ymd];
        if (isHoliday && override === 'skip') continue;
        
        const dayInfo = getDayInfo(wd, isHoliday, override);
        if (dayInfo.capacity > 0) {
            workableDaysThisWeek.push({ ymd, wd, isHoliday, override, hours: 0, capacity: dayInfo.capacity });
        }
    }
    if (workableDaysThisWeek.length === 0) {
        cursor = addWeeks(weekStart, 1);
        continue;
    }

    workableDaysThisWeek.forEach(day => {
        if (day.isHoliday && day.override === 'work') {
            day.hours = HOLIDAY_HOURS;
            hoursToDistribute -= HOLIDAY_HOURS;
        }
    });

    const weekdays = workableDaysThisWeek.filter(d => d.wd <= 5 && !d.isHoliday);
    weekdays.forEach(day => {
        day.hours = DAILY_MIN_WEEKDAY;
        hoursToDistribute -= DAILY_MIN_WEEKDAY;
    });

    let attempts = 100;
    while(hoursToDistribute > 0 && attempts > 0) {
        const randomDay = workableDaysThisWeek[Math.floor(Math.random() * workableDaysThisWeek.length)];
        const maxHours = (randomDay.wd <= 5 && !randomDay.isHoliday) ? DAILY_MAX_WEEKDAY : randomDay.capacity;

        if (randomDay.hours < maxHours) {
            randomDay.hours++;
            hoursToDistribute--;
        }
        attempts--;
    }

    for (const day of workableDaysThisWeek) {
        if (day.hours > 0) {
            const dayInfo = getDayInfo(day.wd, day.isHoliday, day.override);
            const { blocks, entryTime, exitTime } = allocateHoursRandomly(day.ymd, dayInfo, day.hours);
            const base = day.isHoliday ? 0 : Math.min(day.hours, WEEKLY_BASE); // Simplificado

            dias.push({
                fecha: day.ymd,
                horas: day.hours,
                horas_base: base,
                horas_extra: day.hours - base,
                // ===================================================================
                // INICIO DE LA CORRECCIÓN: Se usa 'blocks' en lugar de 'bloques'
                // ===================================================================
                bloques: blocks,
                // ===================================================================
                // FIN DE LA CORRECCIÓN
                // ===================================================================
                jornada_entrada: entryTime,
                jornada_salida: exitTime,
            });
        }
    }
    
    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin: format(weekEnd, 'yyyy-MM-dd'),
      dias: dias.sort((a,b) => a.fecha.localeCompare(b.fecha)),
      total_horas_semana: dias.reduce((sum, d) => sum + d.horas, 0),
    });

    cursor = addWeeks(weekStart, 1);
  }

  return schedules;
}