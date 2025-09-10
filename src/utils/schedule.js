import { 
  startOfWeek as dfStartOfWeek, 
  addWeeks, 
  addDays as dfAddDays, 
  format, 
} from 'date-fns'; 

// ======================== 
// Constantes de negocio 
// ======================== 
const DAILY_LEGAL_LIMIT = 8; 
export const WEEKLY_LEGAL_LIMIT = 44; 
export const WEEKLY_EXTRA_LIMIT = 12; 
export const WEEKLY_TOTAL_LIMIT = 56;
const HOLIDAY_HOURS = 6; 

const BREAKFAST_MINUTES = 15; 
const LUNCH_MINUTES = 45; 

// ======================== 
// Helpers de fecha/hora 
// ======================== 
const pad = (n) => String(n).padStart(2, '0'); 
export const YMD = (d) => new Date(d).toISOString().slice(0, 10); 
export const addDays = (d, n) => dfAddDays(new Date(d), n); 
export const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 }); 
export const isoWeekday = (d) => { 
  const wd = new Date(d).getDay(); 
  return wd === 0 ? 7 : wd; 
}; 

const hmToMinutes = (hhmm) => { 
  const [hh, mm] = hhmm.split(':').map(Number); 
  return hh * 60 + (mm || 0); 
}; 
const minutesToHM = (m) => { 
  const hh = Math.floor(m / 60); 
  const mm = Math.round(m % 60); 
  return `${pad(hh)}:${pad(mm)}`; 
}; 

// ======================== 
// Nombres de días 
// ======================== 
const WD_NAME = { 
  1: 'Lunes', 
  2: 'Martes', 
  3: 'Miércoles', 
  4: 'Jueves', 
  5: 'Viernes', 
  6: 'Sábado', 
  7: 'Domingo', 
}; 

// ======================== 
// Info de día 
// ======================== 
export function getDayInfo(wd, isHoliday, holidayOverride) { 
  if (isHoliday && holidayOverride === 'work') { 
    return { 
      capacity: HOLIDAY_HOURS, 
      segments: [{ from: hmToMinutes('07:00'), to: hmToMinutes('13:00') }], 
      breaks: [{ start: hmToMinutes('09:00'), duration: BREAKFAST_MINUTES }], 
    }; 
  } 

  if (wd === 7) { 
    return { 
      capacity: 0, 
      segments: [], 
      breaks: [], 
    }; 
  } 

  const weekdayCapacity = wd === 6 ? 7 : 10;
  const saturdayEndTime = '15:00';
  const weekdayEndTime = '18:00';
  
  const info = {
    capacity: weekdayCapacity,
    segments: [
      { from: hmToMinutes('07:00'), to: hmToMinutes('09:00') },
      { from: hmToMinutes('09:15'), to: hmToMinutes('12:00') },
      { from: hmToMinutes('12:45'), to: hmToMinutes(wd === 6 ? saturdayEndTime : weekdayEndTime) },
    ],
    breaks: [
      { start: hmToMinutes('09:00'), duration: BREAKFAST_MINUTES },
      { start: hmToMinutes('12:00'), duration: LUNCH_MINUTES },
    ],
  };
  return info;
} 

// ======================== 
// Asignación de horas 
// ======================== 
export function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) { 
  if (hoursNeeded <= 0) { 
    return { blocks: [], used: 0, entryTime: null, exitTime: null }; 
  } 

  const { segments } = dayInfo; 
  // Agregamos esta validación para evitar el error 'from'
  if (!segments || segments.length === 0) {
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }

  const segmentsCapacityMins = segments.reduce((s, seg) => s + (seg.to - seg.from), 0); 
  const requestedWorkMins = Math.round(hoursNeeded * 60); 
  const workMinutes = Math.min(requestedWorkMins, segmentsCapacityMins); 

  const start = segments[0].from; 

  let remaining = workMinutes; 
  let cursor = start; 
  const blocks = []; 

  for (const seg of segments) { 
    if (cursor < seg.from) cursor = seg.from; 
    if (cursor >= seg.to) continue; 

    const availInSeg = seg.to - cursor; 
    if (availInSeg <= 0) continue; 

    const take = Math.min(availInSeg, remaining); 

    blocks.push({ 
      start: `${dateISO}T${minutesToHM(cursor)}:00`, 
      end: `${dateISO}T${minutesToHM(cursor + take)}:00`, 
      hours: take / 60, 
    }); 

    cursor += take; 
    remaining = Math.max(0, remaining - take); 
    if (remaining <= 0) break; 
  } 

  if (blocks.length === 0) { 
    return { blocks: [], used: 0, entryTime: null, exitTime: null }; 
  } 

  const entryTime = blocks[0].start.slice(11, 16); 
  const exitTime = blocks[blocks.length - 1].end.slice(11, 16); 

  return { 
    blocks, 
    used: workMinutes / 60, 
    entryTime, 
    exitTime, 
  }; 
} 

// ======================== 
// Capacidad "visible" por día 
// ======================== 
export function getDailyCapacity(wd, isHoliday, holidayOverride) { 
  if (isHoliday && holidayOverride === 'work') return HOLIDAY_HOURS; 
  if (wd === 6) return 7; 
  if (wd >= 1 && wd <= 5) return 10;
  return 0; 
} 

// ======================== 
// Generación semanal completa 
// ======================== 
export function generateScheduleForRange56( 
  fechaInicio, 
  fechaFin, 
  workingWeekdays, 
  holidaySet, 
  holidayOverrides = {}, 
  sundayOverrides = {} 
) { 
  const outWeeks = []; 
  let cursor = startOfISOWeek(new Date(fechaInicio)); 
  const rangeStart = new Date(fechaInicio); 
  const rangeEnd = new Date(fechaFin); 
  
  while (cursor <= rangeEnd) { 
    const weekStart = new Date(cursor); 
    const weekEnd = addDays(weekStart, 6); 

    const dias = []; 
    const workableDays = []; 

    for (let i = 0; i < 7; i++) { 
      const d = addDays(weekStart, i); 
      const ymd = YMD(d); 
      if (d < rangeStart || d > rangeEnd) continue; 

      const wd = isoWeekday(d); 
      const isSunday = wd === 7; 
      const isHoliday = holidaySet?.has?.(ymd) || false; 
      const holidayOverride = holidayOverrides[ymd]; 
      const sundayStatus = isSunday ? sundayOverrides[ymd] : null;

      if (isHoliday && holidayOverride === 'skip') continue; 

      if (isSunday) { 
        dias.push({ 
          fecha: ymd, 
          descripcion: WD_NAME[wd], 
          domingo_estado: sundayStatus || null, 
          horas: 0, 
          horas_base: 0, 
          horas_extra: 0, 
          bloques: null, 
          jornada_entrada: null, 
          jornada_salida: null, 
        }); 
      } else if (workingWeekdays.includes(wd) || (isHoliday && holidayOverride === 'work')) { 
        const info = getDayInfo(wd, isHoliday, holidayOverride); 
        const capacity = info.capacity || 0; 
        
        if (capacity > 0) { 
          workableDays.push({ 
            date: d, 
            ymd, 
            wd, 
            isHoliday, 
            override: holidayOverride, 
            capacity, 
            info, 
          }); 
        } 
      } 
    } 

    const dayTotals = new Map(); 
    for (const x of workableDays) { 
      dayTotals.set(x.ymd, { base: 0, extra: 0, total: 0 }); 
    }

    let legalLeft = WEEKLY_LEGAL_LIMIT; // 44 horas legales por semana
    let extraLeft = WEEKLY_EXTRA_LIMIT; // 12 horas extras por semana

    // Asignar horas legales primero
    const weekdays = workableDays.filter(d => isoWeekday(d.date) >= 1 && isoWeekday(d.date) <= 5);
    let reducedDayYmd = null;
    if (weekdays.length > 0) {
      const randomIndex = Math.floor(Math.random() * weekdays.length);
      reducedDayYmd = weekdays[randomIndex].ymd;
    }

    // Asignar horas a los días laborables
    for (const day of workableDays) {
      const totals = dayTotals.get(day.ymd);
      const isSaturday = isoWeekday(day.date) === 6;
      const isReduced = day.ymd === reducedDayYmd;

      if (isSaturday) {
        // Sábado: 4 horas legales, 3 horas extras
        const baseHours = Math.min(4, legalLeft);
        const extraHours = Math.min(3, extraLeft);
        totals.base = baseHours;
        totals.extra = extraHours;
        totals.total = baseHours + extraHours;
        legalLeft -= baseHours;
        extraLeft -= extraHours;
        day.jornada_reducida = false;
      } else if (isReduced) {
        // Día reducido: 8 horas legales, 1 hora extra
        const baseHours = Math.min(8, legalLeft);
        const extraHours = Math.min(1, extraLeft);
        totals.base = baseHours;
        totals.extra = extraHours;
        totals.total = baseHours + extraHours;
        legalLeft -= baseHours;
        extraLeft -= extraHours;
        day.jornada_reducida = true;
      } else {
        // Día normal: 8 horas legales, 2 horas extras
        const baseHours = Math.min(8, legalLeft);
        const extraHours = Math.min(2, extraLeft);
        totals.base = baseHours;
        totals.extra = extraHours;
        totals.total = baseHours + extraHours;
        legalLeft -= baseHours;
        extraLeft -= extraHours;
        day.jornada_reducida = false;
      }
    }

    // Generar bloques de horario para cada día laborable
    for (const x of workableDays) { 
      const totals = dayTotals.get(x.ymd) || { base: 0, extra: 0 }; 
      const total = totals.base + totals.extra; 

      const { blocks, entryTime, exitTime } = allocateHoursRandomly(x.ymd, x.info, total); 
      dias.push({ 
        fecha: x.ymd, 
        descripcion: WD_NAME[x.wd], 
        horas: total, 
        horas_base: totals.base, 
        horas_extra: totals.extra, 
        bloques: blocks, 
        jornada_entrada: entryTime || null, 
        jornada_salida: exitTime || null, 
        domingo_estado: null, 
        jornada_reducida: x.jornada_reducida,
      }); 
    } 

    // Añadir el domingo al arreglo de días
    const sundayDate = addDays(weekStart, 6);
    const sundayYmd = YMD(sundayDate);
    if (!dias.some(d => d.fecha === sundayYmd)) {
      dias.push({
        fecha: sundayYmd,
        descripcion: WD_NAME[7],
        domingo_estado: sundayOverrides[sundayYmd] || null,
        horas: 0,
        horas_base: 0,
        horas_extra: 0,
        bloques: null, 
        jornada_entrada: null, 
        jornada_salida: null, 
      }); 
    } 

    outWeeks.push({ 
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'), 
      fecha_fin: format(weekEnd, 'yyyy-MM-dd'), 
      dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)), 
      total_horas_semana: dias.reduce((s, d) => s + (Number(d.horas) || 0), 0), 
    }); 

    cursor = addWeeks(weekStart, 1); 
  } 

  return { schedule: outWeeks }; 
} 
