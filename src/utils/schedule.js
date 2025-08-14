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
export const WEEKLY_BASE = 44;    // siempre 44h legales semanales
export const WEEKLY_EXTRA = 12;   // objetivo extras
export const WEEKLY_TOTAL = WEEKLY_BASE + WEEKLY_EXTRA;
export const DAILY_LEGAL_MIN = 8; // (usado en distribución visual/targets)
export const DAILY_CAP_WEEKDAY = 10; // Lun-Vie
export const DAILY_CAP_SAT = 8;      // Sábado

// Horario del negocio (usado para límites)
export const BUSINESS = {
  weekday: { open: '07:00', close: '18:00' },
  saturday: { open: '07:00', close: '15:00' }
};

export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return DAILY_CAP_WEEKDAY;
  if (weekday === 6) return DAILY_CAP_SAT;
  return 0;
}

/* segment helpers */
const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh*60 + (mm||0);
};
const minutesToHHMM = (m) => {
  const hh = Math.floor(m/60);
  const mm = m%60;
  return `${pad(hh)}:${pad(mm)}`;
};

/**
 * getDailySegments(weekday, holidayOverride)
 * - normal weekday segments: 07:00-09:00, 09:15-12:00, 12:45-18:00 (sat end 15:00)
 * - holidayOverride === 'work' -> 08:00-13:00 (5h window)
 */
export function getDailySegments(weekday, holidayOverride) {
  if (holidayOverride === 'work') {
    return [{ from: '08:00', to: '13:00' }];
  }
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

/**
 * allocateWithRandomStart
 * Intenta asignar `hoursNeeded` (integer) en los segmentos, eligiendo
 * aleatoriamente el segmento inicial y un desplazamiento de inicio múltiplo de 15 minutos
 * para que la hora de entrada sea "variada".
 *
 * Devuelve { blocks: [{start,end,hours,type}], used } (used = horas asignadas integer)
 */
function allocateWithRandomStart(dateISO, segments, hoursNeeded) {
  const segInfos = segments.map(seg => {
    const fromMin = hmToMinutes(seg.from);
    const toMin = hmToMinutes(seg.to);
    const totalMin = Math.max(0, toMin - fromMin);
    return { fromMin, toMin, totalMin, seg };
  });

  let remaining = hoursNeeded;
  const blocks = [];

  // Determine candidate starts: any segment index where total remaining hours (floor) >= hoursNeeded
  const candidates = [];
  for (let si = 0; si < segInfos.length; si++) {
    const mins = segInfos.slice(si).reduce((s,x)=> s + x.totalMin, 0);
    if (Math.floor(mins/60) >= hoursNeeded) candidates.push(si);
  }
  if (candidates.length === 0) {
    // Not possible to allocate full hours
    // Try greedy allocation from first segment
    for (let i=0;i<segInfos.length && remaining>0;i++) {
      const info = segInfos[i];
      const take = Math.min(Math.floor(info.totalMin/60), remaining);
      if (take>0) {
        const startHHMM = minutesToHHMM(info.fromMin);
        const endMin = info.fromMin + take*60;
        const endHHMM = minutesToHHMM(endMin);
        blocks.push({ start: `${dateISO}T${startHHMM}:00`, end: `${dateISO}T${endHHMM}:00`, hours: take, type: 'base' });
        remaining -= take;
      }
    }
    return { blocks, used: hoursNeeded - remaining };
  }

  const startIdx = candidates[Math.floor(Math.random()*candidates.length)];
  let first = true;
  for (let i = startIdx; i < segInfos.length && remaining > 0; i++) {
    const info = segInfos[i];
    let startMin = info.fromMin;
    if (first) {
      // compute max shift that still allows integer hours in this+following segments
      const minsFollowing = segInfos.slice(i).reduce((s,x)=> s + x.totalMin, 0);
      const maxShift = Math.max(0, info.totalMin - (hoursNeeded*60));
      const shiftSteps = Math.floor(maxShift / 15);
      const shift = shiftSteps > 0 ? (Math.floor(Math.random() * (shiftSteps + 1)) * 15) : 0;
      startMin = info.fromMin + shift;
      first = false;
    }

    const availableMin = Math.max(0, info.toMin - startMin);
    const take = Math.min(Math.floor(availableMin/60), remaining);
    if (take <= 0) continue;
    const startHHMM = minutesToHHMM(startMin);
    const endMin = startMin + take * 60;
    const endHHMM = minutesToHHMM(endMin);
    blocks.push({ start: `${dateISO}T${startHHMM}:00`, end: `${dateISO}T${endHHMM}:00`, hours: take, type: 'base' });
    remaining -= take;
  }

  return { blocks, used: hoursNeeded - remaining };
}

/**
 * computeBasePerDayTargets(workingWeekdays)
 * - if Mon-Fri + Sat selected -> targets Mon-Fri 8h, Sat 4h (sums 44)
 * - otherwise distribute 44 equally (integers) across selected days
 */
function computeBasePerDayTargets(workingWeekdays) {
  const ws = [...workingWeekdays].sort((a,b)=>a-b);
  const targets = {};
  const includesMonToFri = [1,2,3,4,5].every(d => ws.includes(d));
  const includesSat = ws.includes(6);
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
  let rem = WEEKLY_BASE - base*days;
  for (let i=0;i<ws.length;i++) {
    const d = ws[i];
    targets[d] = base + (rem>0 ? 1 : 0);
    rem = Math.max(0, rem-1);
  }
  return targets;
}

/**
 * generateBaseWeek: assigns horas_base integer and bloques (type: base).
 * Returns dias[], total_horas_legales, remaining_base_unfilled
 */
function generateBaseWeek({ weekStart, rangeStart, rangeEnd, workingWeekdays, holidaySet, holidayOverrides = {} }) {
  const targets = computeBasePerDayTargets(workingWeekdays);
  const dias = [];
  let remainingBase = WEEKLY_BASE;

  for (let i=0;i<7;i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;
    const ymd = YMD(d);
    const wd = isoWeekday(d);
    const isWorkingDay = workingWeekdays.includes(wd);
    const isHoliday = holidaySet.has(ymd);
    const override = holidayOverrides[ymd]; // 'work' | 'skip'
    const effectiveSkip = (isHoliday && override === 'skip');

    let target = targets[wd] || 0;
    if (isHoliday && override === 'work') {
      // limit target to 5h (window 08-13)
      target = Math.min(target, 5);
    }

    if (!isWorkingDay || effectiveSkip || target <= 0) {
      dias.push({ descripcion: isHoliday ? '(festivo)' : '', fecha: ymd, start: ymd, end: ymd, horas_base: 0, horas_extra: 0, horas: 0, bloques: [] });
      continue;
    }

    const segments = getDailySegments(wd, override);
    const { blocks, used } = allocateWithRandomStart(ymd, segments, target);
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

/**
 * distributeExtras(dias)
 * Reparte WEEKLY_EXTRA por rondas, priorizando Lun-Vie y días anteriores.
 * No excede getDailyCapacity por día.
 */
function distributeExtras(dias) {
  const caps = dias.map(d => {
    const wd = isoWeekday(new Date(d.fecha));
    const cap = getDailyCapacity(wd);
    return Math.max(0, cap - (d.horas || 0));
  });

  let remaining = WEEKLY_EXTRA;
  const priorityIdx = dias
    .map((d,i)=>({d,i}))
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
      const { blocks, used } = allocateWithRandomStart(dias[i].fecha, segments, 1);
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

  return { dias, extrasAssigned: WEEKLY_EXTRA - remaining, extrasUnassigned: remaining };
}

/**
 * generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides)
 * Devuelve array de semanas con dias[] y totales
 */
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

    const baseRes = generateBaseWeek({ weekStart, rangeStart: segStart, rangeEnd: segEnd, workingWeekdays, holidaySet, holidayOverrides });

    // try move remaining base to saturday if possible
    if (baseRes.remaining_base_unfilled > 0) {
      const sat = baseRes.dias.find(d => isoWeekday(d.fecha) === 6);
      if (sat) {
        const satCap = getDailyCapacity(6);
        const availableForSat = Math.max(0, satCap - (sat.horas || 0));
        const move = Math.min(availableForSat, baseRes.remaining_base_unfilled);
        if (move > 0) {
          const segmentsSat = getDailySegments(6);
          const { blocks, used } = allocateWithRandomStart(sat.fecha, segmentsSat, move);
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

/* backward-compat */
export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const weeks = generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides);
  return weeks.map(w => ({
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
    dias: w.dias.map(d => ({ ...d, horas_extra: 0, horas: d.horas_base })),
    total_horas_semana: w.total_horas_legales
  }));
}
