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
export const DAILY_LEGAL_MIN = 8; // mínimo legal por día (visual / preferencia)
export const DAILY_CAP_WEEKDAY = 10; // técnica Lun-Vie (capacidad maxima utilizable por día)
export const DAILY_CAP_SAT = 8;      // sábado 07:00-15:00 => 8h disponible visualmente
export const BUSINESS = {
  weekday: { open: '07:00', close: '18:00' },
  saturday: { open: '07:00', close: '15:00' }
};

// Devuelve la capacidad técnica por día (horas enteras)
export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return DAILY_CAP_WEEKDAY;
  if (weekday === 6) return DAILY_CAP_SAT;
  return 0;
}

/**
 * Ventanas (segmentos) respetando los descansos:
 * - 07:00 - 09:00
 * - 09:15 - 12:00
 * - 12:45 - 18:00 (hasta 18:00)
 * Breaks: 09:00-09:15 (15m breakfast), 12:00-12:45 (45m lunch)
 * Para sábado se corta el último segmento en 15:00.
 *
 * Si holidayOverride === 'work' => festivo trabajado: 08:00-13:00 (visual, 5h window).
 */
export function getDailySegments(weekday, holidayOverride) {
  if (holidayOverride === 'work') {
    return [{ from: '08:00', to: '13:00' }]; // festivo trabajado: 5h
  }

  if (weekday >= 1 && weekday <= 5) {
    return [
      { from: '07:00', to: '09:00' },  // 2h
      { from: '09:15', to: '12:00' },  // 2h45 -> floor -> 2h usable (visualmente se muestran minutos)
      { from: '12:45', to: '18:00' }   // 5h15   -> 5h usable (rounded)
    ];
  }
  if (weekday === 6) {
    return [
      { from: '07:00', to: '09:00' },  // 2h
      { from: '09:15', to: '12:00' },  // 2h45
      { from: '12:45', to: '15:00' }   // 2h15
    ];
  }
  return [];
}

/* Convierte hh:mm a minutos desde 00:00 */
const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh*60 + (mm||0);
};
/* Horas enteras disponibles en un segmento (floor de horas) */
const segHoursFloor = (seg) => Math.floor(Math.max(0, hmToMinutes(seg.to) - hmToMinutes(seg.from)) / 60);

/**
 * Crea una hora en formato HH:MM, redondeando minutos a múltiplos de 15.
 */
const roundTo15 = (minutes) => Math.round(minutes / 15) * 15;
const minutesToHHMM = (m) => {
  const hh = Math.floor(m/60);
  const mm = m%60;
  return `${pad(hh)}:${pad(mm)}`;
};

/**
 * Allocates integer hours across segments starting from chosen startSegment index and optional offset in minutes (multiple of 15).
 * Returns blocks with start/end in ISO datetimes, hours integer and type 'base'|'extra'|'break' (break not used here).
 */
function allocateWithRandomStart(dateISO, segments, hoursNeeded) {
  // Build per-seg available minutes (rounded down to full hours blocks but we will allow partial first block aligned to 15m)
  const segInfos = segments.map(seg => {
    const fromMin = hmToMinutes(seg.from);
    const toMin = hmToMinutes(seg.to);
    const totalMin = Math.max(0, toMin - fromMin);
    return { fromMin, toMin, totalMin, seg };
  });

  // Find all possible startSegment indices such that sum of floor hours >= hoursNeeded
  const candidates = [];
  for (let si = 0; si < segInfos.length; si++) {
    let totalMinAvail = 0;
    for (let j = si; j < segInfos.length; j++) totalMinAvail += segInfos[j].totalMin;
    if (Math.floor(totalMinAvail/60) >= hoursNeeded) candidates.push(si);
  }
  if (candidates.length === 0) {
    // cannot fulfill with these segments
    return { blocks: [], used: 0 };
  }

  // choose a random candidate start segment
  const startIdx = candidates[Math.floor(Math.random() * candidates.length)];

  // compute allocation
  let remaining = hoursNeeded;
  const blocks = [];
  let first = true;
  for (let i = startIdx; i < segInfos.length && remaining > 0; i++) {
    const info = segInfos[i];
    const segHours = Math.floor(info.totalMin / 60);

    // available minutes in this segment
    let availableMin = info.totalMin;

    // if first segment allow an offset (multiple of 15) so start is randomized but ensuring enough remaining
    let startMin = info.fromMin;
    if (first) {
      // maximum shift such that floor((to - startShift)/60) still >= neededRemaining in this and following segments combined
      // compute total minutes from this segment start to end
      const minsFollowing = segInfos.slice(i).reduce((s,x)=> s + x.totalMin, 0);
      const maxShift = Math.max(0, info.totalMin - (hoursNeeded * 60)); // crude safety
      // choose shift as multiple of 15 within [0, maxShift]
      const shiftSteps = Math.floor(maxShift / 15);
      const shift = shiftSteps > 0 ? (Math.floor(Math.random()* (shiftSteps+1)) * 15) : 0;
      startMin = info.fromMin + shift;
      availableMin = Math.max(0, info.toMin - startMin);
      first = false;
    }

    const takeHours = Math.min(Math.floor(availableMin/60), remaining);
    if (takeHours <= 0) continue;
    const startHHMM = minutesToHHMM(startMin);
    const endMin = startMin + takeHours * 60;
    const endHHMM = minutesToHHMM(endMin);

    blocks.push({
      start: `${dateISO}T${startHHMM}:00`,
      end: `${dateISO}T${endHHMM}:00`,
      hours: takeHours,
      type: 'base'
    });

    remaining -= takeHours;
    // next segment start is seg.from (no offset) automatically
  }

  const used = hoursNeeded - remaining;
  return { blocks, used };
}

/**
 * Genera la base por semana (intenta asignar 44h legales).
 * Strategy:
 * - Compute desired base per workday:
 *   * Si incluye Lun..Vie + Sáb => Lun-Vie:8h, Sáb:4h (total 44)
 *   * Si no incluye Sáb => dividir 44 entre días seleccionados (integers, distribuir resto a los primeros días)
 * - Para cada día, intenta asignar esa cantidad de horas (enteras) usando segmentos y start aleatorio
 * - Si el día es festivo y override==='skip' => no asigna (0h)
 * - Si override==='work' => treat as worked day but segments special (08-13)
 * - Si no se logra asignar todo el target por restricciones -> remaining_base_unfilled cuenta la diferencia
 */
function computeBasePerDayTargets(workingWeekdays) {
  const ws = [...workingWeekdays].sort((a,b)=>a-b);
  // If includes Mon-Fri and Sat => target: 8,8,8,8,8,4
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

  // otherwise distribute 44 across selected weekdays
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

/**
 * generateBaseWeek: creates dias[] with horas_base assigned as integers, bloques with type 'base'
 */
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
    const override = holidayOverrides[ymd]; // 'work' | 'skip'
    const isHoliday = holidaySet.has(ymd);
    const effectiveSkip = (isHoliday && override === 'skip');

    let target = targets[wd] || 0;
    // If holiday worked, we may want to set a target (prefer same target)
    if (isHoliday && override === 'work') {
      // allow up to 5h (we'll attempt to allocate target but segments are smaller)
      // keep target as min(target, 5) so it doesn't exceed available festivo window
      target = Math.min(target, 5);
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

  // remainingBase could be >0 if not able to assign all base
  return {
    dias,
    total_horas_legales: dias.reduce((s,d)=> s + (d.horas_base || 0), 0),
    remaining_base_unfilled: Math.max(0, remainingBase)
  };
}

/**
 * Distribuye las horas extras (WEEKLY_EXTRA) entre los dias de la semana.
 * Regla: repartir por rondas 1h/día por día con capacidad (día no exceda su daily cap),
 * priorizando días laborales entre Lunes-Viernes (para "hora pico" en la mañana).
 */
function distributeExtras(dias) {
  // build day capacites = daily cap - horas (current)
  const caps = dias.map(d => {
    const wd = isoWeekday(new Date(d.fecha));
    const cap = getDailyCapacity(wd);
    return Math.max(0, cap - (d.horas || 0));
  });

  let remaining = WEEKLY_EXTRA;
  const priorityIdx = dias
    .map((d,i)=>({d, i}))
    .sort((a,b) => {
      // Prioritize Mon-Fri over Saturday, and earlier days first (morning peak)
      const wa = isoWeekday(new Date(a.d.fecha));
      const wb = isoWeekday(new Date(b.d.fecha));
      const pa = wa >=1 && wa <=5 ? 0 : 1;
      const pb = wb >=1 && wb <=5 ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.i - b.i;
    })
    .map(x=>x.i);

  // allocate in rounds
  while (remaining > 0) {
    let allocatedThisRound = 0;
    for (const i of priorityIdx) {
      if (remaining <= 0) break;
      if (caps[i] <= 0) continue;
      // try to allocate 1h (use same allocateWithRandomStart but for 'extra' we append blocks)
      const wd = isoWeekday(new Date(dias[i].fecha));
      const segments = getDailySegments(wd);
      const { blocks, used } = allocateWithRandomStart(dias[i].fecha, segments, 1);
      if (used > 0) {
        // convert blocks to 'extra' type blocks
        const extraBlocks = blocks.map(b => ({...b, type: 'extra'}));
        dias[i].bloques = (dias[i].bloques || []).concat(extraBlocks);
        dias[i].horas_extra = (dias[i].horas_extra || 0) + used;
        dias[i].horas = (dias[i].horas || 0) + used;
        caps[i] -= used;
        remaining -= used;
        allocatedThisRound += used;
      }
    }
    if (allocatedThisRound === 0) break; // no more allocation possible
  }

  return {
    dias,
    extrasAssigned: WEEKLY_EXTRA - remaining,
    extrasUnassigned: remaining
  };
}

/**
 * Main: genera semanas intentando 56h (44 base + 12 extra).
 * holidayOverrides: { 'YYYY-MM-DD': 'work'|'skip' }
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

    // base
    const baseRes = generateBaseWeek({
      weekStart,
      rangeStart: segStart,
      rangeEnd: segEnd,
      workingWeekdays,
      holidaySet,
      holidayOverrides
    });

    // try to move missing base hours to Saturday if possible (accumulate)
    if (baseRes.remaining_base_unfilled > 0) {
      // find saturday index in dias
      const sat = baseRes.dias.find(d => isoWeekday(d.fecha) === 6);
      if (sat) {
        const satCap = getDailyCapacity(6);
        const availableForSat = Math.max(0, satCap - (sat.horas || 0));
        const move = Math.min(availableForSat, baseRes.remaining_base_unfilled);
        if (move > 0) {
          // allocate 'move' hours to sat using allocateWithRandomStart on saturday segments
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

    // distribute extras
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

/* backward-compat helper (genera solo base) */
export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const weeks56 = generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides);
  return weeks56.map(w => ({
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
    dias: w.dias.map(d => ({ ...d, horas_extra: 0, horas: d.horas_base })),
    total_horas_semana: w.total_horas_legales
  }));
}
