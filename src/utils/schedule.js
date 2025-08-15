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

// CONSTANTES
export const WEEKLY_BASE = 44;    // siempre 44h legales semanales
export const WEEKLY_EXTRA = 12;   // objetivo extras
export const WEEKLY_TOTAL = WEEKLY_BASE + WEEKLY_EXTRA;
export const DAILY_LEGAL_MIN = 8; // mínimo legal por día (visual / preferencia)
export const DAILY_CAP_WEEKDAY = 10; // técnica Lun-Vie (capacidad maxima utilizable por día)
export const DAILY_CAP_SAT = 8;      // sábado (capacidad máxima utilizable)
export const BUSINESS = {
  weekday: { open: '07:00', close: '18:00' },
  saturday: { open: '07:00', close: '16:00' } // Corregido
};

// Devuelve la capacidad técnica por día (horas enteras)
export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return DAILY_CAP_WEEKDAY;
  if (weekday === 6) return DAILY_CAP_SAT;
  return 0;
}

/**
 * Ventanas (segmentos) respetando los descansos:
 * Breaks: 09:00-09:15 (15m), 12:00-12:45 (45m)
 */
export function getDailySegments(weekday, holidayOverride) {
  if (holidayOverride === 'work') {
    return [{ from: '07:00', to: '13:00' }]; // festivo trabajado: 6h disponibles (Corregido)
  }

  if (weekday >= 1 && weekday <= 5) {
    return [
      { from: '07:00', to: '09:00' },
      { from: '09:15', to: '12:00' },
      { from: '12:45', to: '18:00' }
    ];
  }
  if (weekday === 6) {
    return [
      { from: '07:00', to: '09:00' },
      { from: '09:15', to: '12:00' },
      { from: '12:45', to: '16:00' } // Corregido
    ];
  }
  return [];
}

/* Convierte hh:mm a minutos desde 00:00 */
const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh*60 + (mm||0);
};

/* Convierte minutos a formato HH:MM */
const minutesToHHMM = (m) => {
  const hh = Math.floor(m/60);
  const mm = m%60;
  return `${pad(hh)}:${pad(mm)}`;
};

/**
 * Asigna horas enteras de manera secuencial a través de los segmentos de un día.
 * Prioriza bloques de horas completas y evita inicios aleatorios o minutos fraccionados.
 * @returns {{blocks: Array, used: number}} Bloques de trabajo generados y el total de horas asignadas.
 */
function allocateExactHours(dateISO, segments, hoursNeeded) {
  let hoursRemaining = hoursNeeded;
  const blocks = [];

  for (const seg of segments) {
    if (hoursRemaining <= 0) break;

    const segStartMins = hmToMinutes(seg.from);
    const segEndMins = hmToMinutes(seg.to);
    const segDurationMins = segEndMins - segStartMins;
    
    if (segDurationMins <= 0) continue;

    // Calcula cuántas horas completas se pueden tomar de este segmento
    const availableHours = Math.floor(segDurationMins / 60);
    const hoursToTake = Math.min(hoursRemaining, availableHours);

    if (hoursToTake > 0) {
      const blockStartMins = segStartMins;
      const blockEndMins = blockStartMins + (hoursToTake * 60);

      blocks.push({
        start: `${dateISO}T${minutesToHHMM(blockStartMins)}:00`,
        end: `${dateISO}T${minutesToHHMM(blockEndMins)}:00`,
        hours: hoursToTake,
        type: 'base' // El tipo se ajustará a 'extra' en la función que la llama si es necesario
      });

      hoursRemaining -= hoursToTake;
    }
  }

  const used = hoursNeeded - hoursRemaining;
  return { blocks, used };
}


function computeBasePerDayTargets(workingWeekdays) {
  const ws = [...workingWeekdays].sort((a,b)=>a-b);
  const includesMonToFri = [1,2,3,4,5].every(d => ws.includes(d));
  const includesSat = ws.includes(6);
  const targets = {};
  if (includesMonToFri && includesSat) {
    for (let d=1; d<=7; d++) {
      if (d>=1 && d<=5) targets[d] = 8;
      else if (d===6) targets[d] = 4;
      else targets[d]=0;
    }
    return targets;
  }

  const days = ws.length;
  if (days === 0) return targets;
  const base = Math.floor(WEEKLY_BASE / days);
  let remainder = WEEKLY_BASE - base*days;
  for (let i=0;i<ws.length;i++) {
    const d = ws[i];
    targets[d] = base + (remainder>0 ? 1 : 0);
    remainder = Math.max(0, remainder-1);
  }
  return targets;
}

function generateBaseWeek({
  weekStart,
  rangeStart,
  rangeEnd,
  workingWeekdays,
  holidaySet,
  holidayOverrides = {}
}) {
  const targets = computeBasePerDayTargets(workingWeekdays);
  const dias = [];
  let remainingBase = WEEKLY_BASE;

  for (let i=0;i<7;i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;
    const ymd = YMD(d);
    const wd = isoWeekday(d);
    const isWorkingDay = workingWeekdays.includes(wd);
    const override = holidayOverrides[ymd];
    const isHoliday = holidaySet.has(ymd);
    const effectiveSkip = (isHoliday && override === 'skip');

    let target = targets[wd] || 0;
    if (isHoliday && override === 'work') {
      target = Math.min(target, 6);
    }

    if (!isWorkingDay || effectiveSkip || target <= 0) {
      dias.push({
        descripcion: isHoliday ? '(festivo)' : '',
        fecha: ymd,
        start: ymd,
        end: ymd,
        horas_base: 0,
        horas_extra: 0,
        horas: 0,
        bloques: []
      });
      continue;
    }

    const segments = getDailySegments(wd, override);
    const { blocks, used } = allocateExactHours(ymd, segments, target);
    const horasBaseAssigned = used;
    remainingBase -= horasBaseAssigned;

    dias.push({
      descripcion: isHoliday ? '(festivo)' : '',
      fecha: ymd,
      start: ymd,
      end: ymd,
      horas_base: horasBaseAssigned,
      horas_extra: 0,
      horas: horasBaseAssigned,
      bloques: blocks
    });
  }
  return {
    dias,
    total_horas_legales: dias.reduce((s,d)=> s + (d.horas_base || 0), 0),
    remaining_base_unfilled: Math.max(0, remainingBase)
  };
}

function distributeExtras(dias) {
  const caps = dias.map(d => {
    const wd = isoWeekday(new Date(d.fecha));
    const cap = getDailyCapacity(wd);
    return Math.max(0, cap - (d.horas || 0));
  });

  let remaining = WEEKLY_EXTRA;
  const priorityIdx = dias
    .map((d,i)=>({d, i}))
    .sort((a,b) => {
      const wa = isoWeekday(new Date(a.d.fecha));
      const wb = isoWeekday(new Date(b.d.fecha));
      const pa = wa >=1 && wa <=5 ? 0 : 1;
      const pb = wb >=1 && wb <=5 ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.i - b.i;
    })
    .map(x=>x.i);

  while (remaining > 0) {
    let allocatedThisRound = 0;
    for (const i of priorityIdx) {
      if (remaining <= 0) break;
      if (caps[i] <= 0) continue;
      
      const wd = isoWeekday(new Date(dias[i].fecha));
      const segments = getDailySegments(wd);
      const { blocks, used } = allocateExactHours(dias[i].fecha, segments, 1);

      if (used > 0) {
        const extraBlocks = blocks.map(b => ({...b, type: 'extra'}));
        dias[i].bloques = (dias[i].bloques || []).concat(extraBlocks);
        dias[i].horas_extra = (dias[i].horas_extra || 0) + used;
        dias[i].horas = (dias[i].horas || 0) + used;
        caps[i] -= used;
        remaining -= used;
        allocatedThisRound += used;
      }
    }
    if (allocatedThisRound === 0) break;
  }

  return {
    dias,
    extrasAssigned: WEEKLY_EXTRA - remaining,
    extrasUnassigned: remaining
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
    const segStart = new Date(Math.max(weekStart, rangeStart));
    const segEnd = new Date(Math.min(weekEnd, end));

    const baseRes = generateBaseWeek({
      weekStart,
      rangeStart: segStart,
      rangeEnd: segEnd,
      workingWeekdays,
      holidaySet,
      holidayOverrides
    });

    if (baseRes.remaining_base_unfilled > 0) {
      const sat = baseRes.dias.find(d => isoWeekday(d.fecha) === 6);
      if (sat) {
        const satCap = getDailyCapacity(6);
        const availableForSat = Math.max(0, satCap - (sat.horas || 0));
        const move = Math.min(availableForSat, baseRes.remaining_base_unfilled);
        if (move > 0) {
          const segmentsSat = getDailySegments(6);
          const { blocks, used } = allocateExactHours(sat.fecha, segmentsSat, move);
          sat.bloques = (sat.bloques || []).concat(blocks);
          sat.horas_base = (sat.horas_base || 0) + used;
          sat.horas = (sat.horas || 0) + used;
          baseRes.remaining_base_unfilled -= used;
          baseRes.total_horas_legales += used;
        }
      }
    }

    const diasCopy = baseRes.dias.map(d => ({ ...d, bloques: [...(d.bloques || [])] }));
    const extrasRes = distributeExtras(diasCopy);

    const totalBase = diasCopy.reduce((s,d)=> s + Number(d.horas_base || 0), 0);
    const totalExtra = diasCopy.reduce((s,d)=> s + Number(d.horas_extra || 0), 0);
    const totalWeek = totalBase + totalExtra;

    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin: format(weekEnd, 'yyyy-MM-dd'),
      dias: diasCopy,
      total_horas_legales: totalBase,
      total_horas_extras: totalExtra,
      total_horas_semana: totalWeek,
      remaining_base_unfilled: baseRes.remaining_base_unfilled,
      extras_unassigned: extrasRes.extrasUnassigned
    });

    cursor = addWeeks(weekStart, 1);
  }

  return schedules;
}

export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const weeks56 = generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides);
  return weeks56.map(w => ({
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
    dias: w.dias.map(d => ({ ...d, horas_extra: 0, horas: d.horas_base })),
    total_horas_semana: w.total_horas_legales
  }));
}