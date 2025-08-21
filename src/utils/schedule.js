// src/utils/schedule.js
import { addDays as dfAddDays, format, startOfWeek as dfStartOfWeek } from 'date-fns';

// =============== Helpers de fecha/hora ===============
const pad = (n) => String(n).padStart(2, '0');
export const YMD = (d) => new Date(d).toISOString().slice(0, 10);
export const addDays = (d, n) => dfAddDays(new Date(d), n);
export const startOfISOWeek = (d) => dfStartOfWeek(new Date(d), { weekStartsOn: 1 });
export const isoWeekday = (d) => { const wd = new Date(d).getDay(); return wd === 0 ? 7 : wd; };

// =============== Constantes de negocio ===============
const DAILY_LEGAL_LIMIT     = 8;   // horas legales/día
const DAILY_MAX_LIMIT       = 10;  // máximo/día (legales + extra)
const WEEKLY_LEGAL_LIMIT    = 44;  // horas legales/semana
const WEEKLY_EXTRA_LIMIT    = 12;  // horas extra/semana
const WEEKLY_TOTAL_LIMIT    = 56;  // tope/semana
const HOLIDAY_HOURS         = 6;   // festivo trabajado: 7–13

const BREAKFAST_MINUTES     = 15;  // siempre
const LUNCH_MINUTES         = 45;  // siempre (excepto festivo trabajado 7–13)

// =============== Etiquetas de días ===============
const WD_NAME = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

// =============== Utilidades hh:mm ⇄ minutos ===============
const hmToMinutes = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + (mm || 0);
};
const minutesToHHMM = (m) => {
  const hh = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return `${pad(hh)}:${pad(mm)}`;
};

// =============== Capacidad y estructura diaria ===============
export function getDailyCapacity(wd, isHoliday = false, holidayOverride = null) {
  if (isHoliday && holidayOverride === 'work') return HOLIDAY_HOURS; // 7–13
  if (wd >= 1 && wd <= 5) return 10; // L–V: 7–18 (10h de capacidad)
  if (wd === 6) return 8;            // Sábado: 7–16 (8h)
  return 0;                          // Domingo: no se trabaja
}

function getDayInfo(wd, isHoliday, holidayOverride) {
  if (isHoliday && holidayOverride === 'work') {
    // Festivo trabajado: 7–13 con desayuno (para mantener la salida 13:00)
    return {
      capacity: HOLIDAY_HOURS,
      segments: [{ from: hmToMinutes('07:00'), to: hmToMinutes('13:00') }],
      breaks: [{ start: hmToMinutes('09:00'), duration: BREAKFAST_MINUTES }],
    };
  }
  // Días normales
  return {
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
}

// Calcula la hora de salida sumando descansos atravesados
function calculateShiftEndTime(startTimeMinutes, workMinutes, breaks) {
  let endTimeMinutes = startTimeMinutes + workMinutes;
  for (const br of breaks) {
    if (startTimeMinutes < br.start && endTimeMinutes > br.start) {
      endTimeMinutes += br.duration;
    }
  }
  return endTimeMinutes;
}

// Asigna bloques empezando lo más temprano posible (7:00) y respetando descansos/segmentos
function allocateHoursRandomly(dateISO, dayInfo, hoursNeeded) {
  if (hoursNeeded <= 0) return { blocks: [], used: 0, entryTime: null, exitTime: null };

  const { segments, breaks } = dayInfo;
  const earliestStart = segments[0].from;
  const baseWorkMinutes = hoursNeeded * 60;
  const exitWithBreaks = calculateShiftEndTime(earliestStart, baseWorkMinutes, breaks);

  // Asegura que cabe en la ventana del día
  const latestEnd = segments[segments.length - 1].to;
  if (exitWithBreaks > latestEnd) {
    // Si no cabe, no generamos bloques (esto no debería ocurrir con capacidades correctas)
    return { blocks: [], used: 0, entryTime: null, exitTime: null };
  }

  const blocks = [];
  let remainingWork = baseWorkMinutes;
  let cursor = earliestStart;

  while (remainingWork > 0) {
    // Si estamos dentro de un descanso, saltarlo
    const inBreak = breaks.find(b => cursor >= b.start && cursor < b.start + b.duration);
    if (inBreak) {
      cursor = inBreak.start + inBreak.duration;
      continue;
    }
    // Asegurar que estamos dentro de un segmento
    const seg = segments.find(s => cursor >= s.from && cursor < s.to) ||
                segments.find(s => cursor < s.from); // saltar al próximo segmento
    if (!seg) break;
    if (cursor < seg.from) { cursor = seg.from; continue; }

    const nextBreak = breaks.find(b => b.start > cursor && b.start < seg.to);
    const segLimit = nextBreak ? nextBreak.start : seg.to;
    const take = Math.min(remainingWork, segLimit - cursor);
    if (take <= 0) { cursor = seg.to; continue; }

    blocks.push({
      start: `${dateISO}T${minutesToHHMM(cursor)}:00`,
      end: `${dateISO}T${minutesToHHMM(cursor + take)}:00`,
      hours: take / 60,
    });

    remainingWork -= take;
    cursor += take;

    // Si llegamos justo a un descanso, lo saltamos para el siguiente bloque
    const hitBreak = breaks.find(b => cursor === b.start);
    if (hitBreak) cursor += hitBreak.duration;
  }

  const entryTime = minutesToHHMM(earliestStart);
  const exitTime = minutesToHHMM(exitWithBreaks);
  return { blocks, used: hoursNeeded, entryTime, exitTime };
}

// =============== Generación principal por semanas (máx 56 h/sem) ===============
export function generateScheduleForRange56(fechaInicio, fechaFin, workingWeekdays, holidaySet, holidayOverrides = {}) {
  const schedules = [];
  const start = new Date(fechaInicio);
  const end = new Date(fechaFin);

  let cursor = startOfISOWeek(start);

  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd = addDays(weekStart, 6);

    // Días trabajables dentro del rango y filtros
    const workableDays = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (d < start || d > end) continue;
      const ymd = YMD(d);
      const wd = isoWeekday(d);
      if (!workingWeekdays.includes(wd)) continue;

      const isHoliday = holidaySet instanceof Set ? holidaySet.has(ymd) : false;
      const override = holidayOverrides[ymd]; // 'work' | 'skip' | undefined
      if (isHoliday && override === 'skip') continue; // festivo omitido

      const info = getDayInfo(wd, isHoliday, override);
      const capacity = getDailyCapacity(wd, isHoliday, override);
      if (capacity > 0) {
        workableDays.push({ d, ymd, wd, isHoliday, override, info, capacity });
      }
    }

    const dias = [];
    if (workableDays.length > 0) {
      // --- Distribución de horas semanales ---
      const dayHours = {};
      workableDays.forEach(x => dayHours[x.ymd] = { base: 0, extra: 0 });

      // Legales primero (44h): en días no festivos máx 8h/día; si hay festivo trabajado, puede llevar hasta 6h legales
      let baseRemain = WEEKLY_LEGAL_LIMIT;

      // Si hay festivo trabajado, reservar hasta 6h legales allí (sin superar baseRemain)
      const holidayWorked = workableDays.find(x => x.isHoliday && x.override === 'work');
      if (holidayWorked) {
        const take = Math.min(HOLIDAY_HOURS, baseRemain);
        dayHours[holidayWorked.ymd].base += take;
        baseRemain -= take;
      }

      // Reparto simple round-robin de legales en laborables no festivos (máx 8h/día)
      const nonHolidayDays = workableDays.filter(x => !x.isHoliday);
      let idx = 0;
      while (baseRemain > 0 && nonHolidayDays.length > 0) {
        const day = nonHolidayDays[idx % nonHolidayDays.length];
        const current = dayHours[day.ymd].base;
        if (current < Math.min(DAILY_LEGAL_LIMIT, day.capacity)) {
          dayHours[day.ymd].base += 1; // 1 hora
          baseRemain -= 1;
        }
        idx++;
        // seguridad para evitar bucles infinitos
        if (idx > 1000) break;
      }

      // Extras (12h): sin superar DAILY_MAX_LIMIT (10h) ni capacidad del día
      let extraRemain = WEEKLY_EXTRA_LIMIT;
      idx = 0;
      while (extraRemain > 0 && workableDays.length > 0) {
        const day = workableDays[idx % workableDays.length];
        const curBase = dayHours[day.ymd].base;
        const curExtra = dayHours[day.ymd].extra;
        const totalNow = curBase + curExtra;
        const maxToday = Math.min(DAYLY_MAX_LIMIT_SAFE(day), day.capacity); // helper inline para 10h top

        if (totalNow < maxToday) {
          dayHours[day.ymd].extra += 1;
          extraRemain -= 1;
        }
        idx++;
        if (idx > 1000) break;
      }

      // Construir días con bloques/entradas/salidas
      for (const day of workableDays) {
        const base = dayHours[day.ymd].base;
        const extra = dayHours[day.ymd].extra;
        const total = base + extra;
        if (total <= 0) continue;

        const { blocks, entryTime, exitTime } = allocateHoursRandomly(day.ymd, day.info, total);

        dias.push({
          fecha: day.ymd,
          descripcion: WD_NAME[day.wd],
          horas: total,
          horas_base: base,
          horas_extra: extra,
          bloques: blocks,                 // [{start, end, hours}]
          jornada_entrada: entryTime || null,
          jornada_salida: exitTime || null,
        });
      }
    }

    schedules.push({
      fecha_inicio: format(weekStart, 'yyyy-MM-dd'),
      fecha_fin: format(weekEnd, 'yyyy-MM-dd'),
      dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      total_horas_semana: dias.reduce((s, x) => s + (x.horas || 0), 0),
    });

    cursor = dfAddDays(weekStart, 7);
  }

  return schedules;

  // helper local para 10h/día max
  function DAYLY_MAX_LIMIT_SAFE(day) {
    // En laborables L–V máx 10; sábado máx 8; festivo trabajado máx 6
    if (day.isHoliday && day.override === 'work') return HOLIDAY_HOURS;
    if (day.wd === 6) return 8;
    return DAILY_MAX_LIMIT;
  }
}

// =============== Aliases para retrocompatibilidad ===============
export const WEEKLY_BASE  = WEEKLY_LEGAL_LIMIT; // 44
export const WEEKLY_EXTRA = WEEKLY_EXTRA_LIMIT; // 12
export const WEEKLY_TOTAL = WEEKLY_TOTAL_LIMIT; // 56
