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

// Constantes públicas
export const WEEKLY_BASE = 44;    // siempre 44h legales
export const WEEKLY_EXTRA = 12;   // siempre 12h extras cuando sea posible
export const WEEKLY_TOTAL = WEEKLY_BASE + WEEKLY_EXTRA;
export const DAILY_BASE_MAX = 8;  // legales por día (usar para asegurar 8h)
export const DAILY_CAP_WEEKDAY = 10; // capacidad técnica Lun-Vie (máx utilizable)
export const DAILY_CAP_SAT = 7;      // capacidad técnica Sáb

export function getDailyCapacity(weekday) {
  if (weekday >= 1 && weekday <= 5) return DAILY_CAP_WEEKDAY; // Lun-Vie
  if (weekday === 6) return DAILY_CAP_SAT;                   // Sábado
  return 0;                                                  // Domingo
}

/**
 * Devuelve segmentos (ventanas de trabajo) por día.
 * Si holidayOverride === 'work' => el festivo trabajado tiene ventana 08:00-13:00.
 */
export function getDailySegments(weekday, holidayOverride) {
  if (holidayOverride === 'work') {
    // Fecha festiva trabajada: 08:00-13:00 (5h -> se contabilizará en enteros)
    return [{ from: '08:00', to: '13:00' }];
  }

  if (weekday >= 1 && weekday <= 5) {
    return [
      { from: '07:00', to: '09:00' },   // 2h
      { from: '09:15', to: '12:00' },   // 2h45 -> contabilizamos enteros con floor
      { from: '12:45', to: '18:00' }    // 5h15
    ];
  }

  if (weekday === 6) {
    return [
      { from: '07:00', to: '09:00' },   // 2h
      { from: '09:15', to: '12:00' },   // 2h45
      { from: '12:45', to: '15:00' }    // 2h15
    ];
  }

  return [];
}

/** Convierte hh:mm a minutos desde 00:00 */
const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
};
/** Diff horas enteras entre hh:mm ranges (floor de horas) */
const segmentHoursFloor = (from, to) => {
  const minutes = Math.max(0, hmToMinutes(to) - hmToMinutes(from));
  return Math.floor(minutes / 60);
};

/**
 * Rellena los segmentos secuencialmente hasta cubrir `hoursNeeded`.
 * Retorna bloques { start, end, hours, type } donde type = 'base' | 'extra'
 * start/end en formato ISO datetime: YYYY-MM-DDTHH:MM:00
 */
function allocateHoursToSegments(dateISO, segments, hoursNeeded, type = 'base') {
  const toDate = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00`);
  let remaining = Math.max(0, Math.floor(hoursNeeded || 0));
  const blocks = [];

  for (const seg of segments) {
    if (remaining <= 0) break;
    const segStart = toDate(dateISO, seg.from);
    const segCap = segmentHoursFloor(seg.from, seg.to);
    if (segCap <= 0) continue;
    const use = Math.min(segCap, remaining);

    const end = new Date(segStart.getTime() + use * 3600 * 1000);
    const fmt = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    blocks.push({
      start: `${dateISO}T${fmt(segStart)}:00`,
      end:   `${dateISO}T${fmt(end)}:00`,
      hours: use,
      type
    });

    remaining -= use;
  }

  const used = Math.max(0, Math.floor(hoursNeeded || 0)) - remaining;
  return { blocks, used };
}

/**
 * Genera la parte base de la semana (44h) en enteros.
 * Permite overrides por festivos: holidayOverrides = { 'YYYY-MM-DD': 'work'|'skip' }.
 * Retorna dias con horas_base y remaining_base_unfilled si no se pudo completar 44h.
 */
function generateBaseWeek({
  weekStart,
  rangeStart,
  rangeEnd,
  workingWeekdays,
  holidaySet,
  holidayOverrides = {}
}) {
  let remainingBase = WEEKLY_BASE;
  const dias = [];

  const candidates = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (d < rangeStart || d > rangeEnd) continue;
    const ymd = YMD(d);
    const wd = isoWeekday(d);
    const isHoliday = holidaySet.has(ymd);
    const override = holidayOverrides[ymd]; // 'work' | 'skip' | undefined
    const skipByOverride = (isHoliday && override === 'skip');
    const ok = workingWeekdays.includes(wd) && !skipByOverride;
    candidates.push({ ymd, wd, ok, override, isHoliday });
  }

  for (const c of candidates) {
    const segments = getDailySegments(c.wd, c.override);
    const segCap = segments.reduce((s, seg) => s + segmentHoursFloor(seg.from, seg.to), 0);
    let assignedBase = 0;
    if (c.ok && remainingBase > 0 && segCap > 0) {
      // asignamos máximo DAILY_BASE_MAX (8) por día, o lo que falte del weekly base
      const canTake = Math.min(DAILY_BASE_MAX, segCap, remainingBase);
      const { blocks, used } = allocateHoursToSegments(c.ymd, segments, canTake, 'base');
      assignedBase = used;
      dias.push({
        descripcion: c.isHoliday ? '(festivo)' : '',
        fecha: c.ymd,
        start: c.ymd,
        end: c.ymd,
        horas_base: assignedBase,
        horas_extra: 0,
        horas: assignedBase,
        bloques: blocks
      });
      remainingBase -= assignedBase;
    } else {
      dias.push({
        descripcion: c.isHoliday ? '(festivo)' : '',
        fecha: c.ymd,
        start: c.ymd,
        end: c.ymd,
        horas_base: 0,
        horas_extra: 0,
        horas: 0,
        bloques: []
      });
    }
  }

  const total = dias.reduce((s,d) => s + Number(d.horas || 0), 0);
  return {
    dias,
    total_horas_semana: total,
    remaining_base_unfilled: Math.max(0, remainingBase)
  };
}

/**
 * Distribuye las horas extras (WEEKLY_EXTRA) entre los días de la semana.
 * Reparte por rondas 1h por día hasta asignar o agotar capacidades.
 */
function distributeExtrasWeek(dias) {
  const dayCaps = dias.map(d => {
    const wd = isoWeekday(new Date(d.fecha));
    const cap = getDailyCapacity(wd);
    return Math.max(0, cap - (d.horas_base || 0));
  });

  let remainingExtra = WEEKLY_EXTRA;
  const totalPossibleExtra = dayCaps.reduce((s,x)=> s + x, 0);
  const toAllocate = Math.min(remainingExtra, totalPossibleExtra);
  remainingExtra = remainingExtra - toAllocate;

  let left = toAllocate;
  while (left > 0) {
    let progress = false;
    for (let i = 0; i < dias.length && left > 0; i++) {
      if (dayCaps[i] > 0) {
        const segments = getDailySegments(isoWeekday(new Date(dias[i].fecha)));
        const { blocks, used } = allocateHoursToSegments(dias[i].fecha, segments, 1, 'extra');
        dias[i].bloques = dias[i].bloques.concat(blocks);
        dias[i].horas_extra = (dias[i].horas_extra || 0) + used;
        dias[i].horas = (dias[i].horas || 0) + used;
        dayCaps[i] -= used;
        left -= used;
        progress = true;
      }
    }
    if (!progress) break;
  }

  const totalExtrasAssigned = toAllocate - left;
  return { dias, extrasAssigned: totalExtrasAssigned, extrasUnassigned: remainingExtra + left };
}

/**
 * Genera semanas en el rango intentando asignar 56h (44 base + 12 extras).
 * holidayOverrides: { 'YYYY-MM-DD': 'work'|'skip' } — frontend decide por festivo.
 */
export function generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const schedules = [];
  let cursor = startOfISOWeek(new Date(startDate));
  const end = new Date(endDate);
  const rangeStart = new Date(startDate);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd   = addDays(weekStart, 6);
    const segStart  = new Date(Math.max(weekStart, rangeStart));
    const segEnd    = new Date(Math.min(weekEnd, end));

    const baseRes = generateBaseWeek({
      weekStart,
      rangeStart: segStart,
      rangeEnd: segEnd,
      workingWeekdays,
      holidaySet,
      holidayOverrides
    });

    const diasCopy = baseRes.dias.map(d => ({ ...d, bloques: [...(d.bloques || [])] }));
    const { dias: diasWithExtras, extrasAssigned, extrasUnassigned } = distributeExtrasWeek(diasCopy);

    const totalBase = diasWithExtras.reduce((s,d) => s + Number(d.horas_base || 0), 0);
    const totalExtra = diasWithExtras.reduce((s,d) => s + Number(d.horas_extra || 0), 0);
    const totalSemana = totalBase + totalExtra;

    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin:    format(weekEnd,   'yyyy-MM-dd'),
      dias: diasWithExtras,
      total_horas_semana: totalSemana,
      total_horas_legales: totalBase,
      total_horas_extras: totalExtra,
      remaining_base_unfilled: baseRes.remaining_base_unfilled,
      extras_assigned: extrasAssigned,
      extras_unassigned: extrasUnassigned
    });

    cursor = addWeeks(weekStart, 1);
  }

  return schedules;
}

/**
 * Versión retrocompatible que genera solo la parte base (si necesitas)
 */
export function generateScheduleForRange(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const weeks56 = generateScheduleForRange56(startDate, endDate, workingWeekdays, holidaySet, holidayOverrides);
  return weeks56.map(w => ({
    fecha_inicio: w.fecha_inicio,
    fecha_fin: w.fecha_fin,
    dias: w.dias.map(d => ({
      ...d,
      horas_extra: 0,
      horas: d.horas_base
    })),
    total_horas_semana: w.total_horas_legales
  }));
}
