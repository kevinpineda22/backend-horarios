// src/utils/schedule.js
import {
  startOfWeek as dfStartOfWeek,
  addWeeks,
  addDays as dfAddDays,
  format,
  eachDayOfInterval,
  getDay,
} from "date-fns";
import Holidays from "date-holidays";

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
const pad = (n) => String(n).padStart(2, "0");
export const YMD = (d) => new Date(d).toISOString().slice(0, 10);
export const addDays = (d, n) => dfAddDays(new Date(d), n);
export const startOfISOWeek = (d) =>
  dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
export const isoWeekday = (d) => {
  const wd = new Date(d).getDay();
  return wd === 0 ? 7 : wd;
};

const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(":").map(Number);
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
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

// ========================
// Info de día y asignación de horas
// ========================
export function getDayInfo(
  wd,
  isHoliday,
  holidayOverride,
  isReduced = false,
  tipoJornadaReducida = "salir-temprano"
) {
  if (isHoliday && holidayOverride === "work") {
    return {
      capacity: HOLIDAY_HOURS,
      segments: [{ from: hmToMinutes("07:00"), to: hmToMinutes("13:00") }],
      breaks: [{ start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES }],
    };
  }

  if (wd === 7) {
    return {
      capacity: 0,
      segments: [],
      breaks: [],
    };
  }

  if (isReduced) {
    if (wd === 6) {
      if (tipoJornadaReducida === "entrar-tarde") {
        return {
          capacity: 6,
          segments: [
            { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("15:00") },
          ],
          breaks: [
            { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
            { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
          ],
        };
      } else { // salir-temprano
        return {
          capacity: 6,
          segments: [
            { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("14:00") },
          ],
          breaks: [
            { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
            { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
          ],
        };
      }
    } else { // Día entre semana
      if (tipoJornadaReducida === "entrar-tarde") {
        return {
          capacity: 9,
          segments: [
            { from: hmToMinutes("08:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("18:00") },
          ],
          breaks: [
            { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
            { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
          ],
        };
      } else { // salir-temprano
        return {
          capacity: 9,
          segments: [
            { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
            { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
            { from: hmToMinutes("12:45"), to: hmToMinutes("17:00") },
          ],
          breaks: [
            { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
            { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
          ],
        };
      }
    }
  }

  const weekdayCapacity = wd === 6 ? 7 : 10;
  const saturdayEndTime = "15:00";
  const weekdayEndTime = "18:00";

  return {
    capacity: weekdayCapacity,
    segments: [
      { from: hmToMinutes("07:00"), to: hmToMinutes("09:00") },
      { from: hmToMinutes("09:15"), to: hmToMinutes("12:00") },
      {
        from: hmToMinutes("12:45"),
        to: hmToMinutes(wd === 6 ? saturdayEndTime : weekdayEndTime),
      },
    ],
    breaks: [
      { start: hmToMinutes("09:00"), duration: BREAKFAST_MINUTES },
      { start: hmToMinutes("12:00"), duration: LUNCH_MINUTES },
    ],
  };
}

export function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
  if (hoursNeeded <= 0 || !dayInfo || !Array.isArray(dayInfo.segments) || dayInfo.segments.length === 0) {
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }
  const { segments } = dayInfo;
  const segmentsCapacityMins = segments.reduce((s, seg) => s + (seg.to - seg.from), 0);
  const workMinutes = Math.min(Math.round(hoursNeeded * 60), segmentsCapacityMins);
  let remaining = workMinutes;
  let cursor = segments[0].from;
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
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (blocks.length === 0) return { blocks: [], used: 0, entryTime: null, exitTime: null };
  const entryTime = blocks[0].start.slice(11, 16);
  const exitTime = blocks[blocks.length - 1].end.slice(11, 16);
  return { blocks, used: workMinutes / 60, entryTime, exitTime };
}

export function getDailyCapacity(wd, isHoliday, holidayOverride) {
    if (isHoliday && holidayOverride === "work") return HOLIDAY_HOURS;
    if (wd === 6) return 7;
    if (wd >= 1 && wd <= 5) return 10;
    return 0;
}

// **Función Principal Refactorizada**
export function generateSchedule(
  fechaInicio,
  fechaFin,
  workingWeekdays,
  holidaySet,
  holidayOverrides = {},
  sundayOverrides = {},
  horasACompensar = 0
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
    let weekTotalHours = WEEKLY_TOTAL_LIMIT;
    
    // Aplicar compensación solo a la primera semana del rango
    let compensationApplied = false;
    if (outWeeks.length === 0 && horasACompensar > 0) {
      weekTotalHours = Math.max(0, WEEKLY_TOTAL_LIMIT - horasACompensar);
      compensationApplied = true;
    }

    // 1. Identificar y procesar días trabajables
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const ymd = YMD(d);
      if (d < rangeStart || d > rangeEnd) continue;

      const wd = isoWeekday(d);
      const isSunday = wd === 7;
      const isHoliday = holidaySet?.has?.(ymd) || false;
      const holidayOverride = holidayOverrides[ymd];

      if (isHoliday && holidayOverride === "skip") {
        dias.push({
          fecha: ymd,
          descripcion: WD_NAME[wd],
          horas: 0,
          horas_base: 0,
          horas_extra: 0,
          bloques: null,
          jornada_entrada: null,
          jornada_salida: null,
          domingo_estado: null,
          jornada_reducida: false,
          tipo_jornada_reducida: null,
        });
        weekTotalHours -= getDailyCapacity(wd, isHoliday, holidayOverride);
        continue;
      }
      
      if (isSunday) {
        dias.push({
          fecha: ymd,
          descripcion: WD_NAME[wd],
          domingo_estado: sundayOverrides[ymd] || null,
          horas: 0,
          horas_base: 0,
          horas_extra: 0,
          bloques: null,
          jornada_entrada: null,
          jornada_salida: null,
          jornada_reducida: false,
          tipo_jornada_reducida: null,
        });
        continue;
      }

      if (workingWeekdays.includes(wd) || (isHoliday && holidayOverride === "work")) {
        workableDays.push({ date: d, ymd, wd, isHoliday, override: holidayOverride });
      }
    }

    // 2. Distribuir horas totales entre días trabajables
    const totalWorkableHours = workableDays.reduce((sum, d) => sum + getDayInfo(d.wd, d.isHoliday, d.override).capacity, 0);
    const availableHours = Math.min(weekTotalHours, totalWorkableHours);
    
    let hoursLeftToDistribute = availableHours;
    
    // Distribución por defecto (más horas a días con mayor capacidad)
    const sortedWorkableDays = workableDays.sort((a, b) => getDayInfo(b.wd, b.isHoliday, b.override).capacity - getDayInfo(a.wd, a.isHoliday, a.override).capacity);

    for (const day of sortedWorkableDays) {
      const dailyCapacity = getDayInfo(day.wd, day.isHoliday, day.override).capacity;
      const hoursToAssign = Math.floor(hoursLeftToDistribute / sortedWorkableDays.length);
      
      let finalHours = Math.min(hoursToAssign, dailyCapacity);
      if (hoursLeftToDistribute % sortedWorkableDays.length !== 0) {
        finalHours++; // distribuir el remanente
      }

      const allocatedHours = Math.min(finalHours, hoursLeftToDistribute);
      hoursLeftToDistribute -= allocatedHours;

      const info = getDayInfo(day.wd, day.isHoliday, day.override);
      const { blocks, entryTime, exitTime } = allocateHoursRandomly(day.ymd, info, allocatedHours);

      const base = Math.min(WEEKLY_LEGAL_LIMIT / 6, allocatedHours);
      const extra = Math.max(0, allocatedHours - base);

      dias.push({
        fecha: day.ymd,
        descripcion: WD_NAME[day.wd],
        horas: allocatedHours,
        horas_base: base,
        horas_extra: extra,
        bloques: blocks,
        jornada_entrada: entryTime || null,
        jornada_salida: exitTime || null,
        domingo_estado: null,
        jornada_reducida: false,
        tipo_jornada_reducida: null,
      });
    }

    outWeeks.push({
      fecha_inicio: format(weekStart, "yyyy-MM-dd"),
      fecha_fin: format(weekEnd, "yyyy-MM-dd"),
      dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      total_horas_semana: availableHours, // El total real de horas asignadas
    });

    cursor = addWeeks(weekStart, 1);
  }

  return { schedule: outWeeks, horas_compensadas: horasACompensar };
}

export const generateScheduleForRange56 = generateSchedule; // Alias para compatibilidad