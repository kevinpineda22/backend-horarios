import { startOfWeek, addDays, isAfter, isBefore, parseISO, eachDayOfInterval, format, isSameDay } from "date-fns";

// Constantes
export const WEEKLY_BASE = 44;
export const WEEKLY_EXTRA = 12;

// Obtener el día de la semana en formato ISO (1=Lun, ..., 6=Sab, 7=Dom)
export const isoWeekday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 ? 7 : day;
};

// Obtener el inicio de la semana ISO (lunes)
export const startOfISOWeek = (date) => {
  return startOfWeek(date, { weekStartsOn: 1 }).toISOString().slice(0, 10);
};

// Obtener la capacidad diaria según el día, festivo o sobreescritura
export const getDailyCapacity = (wd, isHoliday, holidayOverride) => {
  if (isHoliday && holidayOverride === "work") return 6;
  if (wd === 7) return 0; // Domingo
  return wd === 6 ? 7 : 10; // Sábado: 7h, Días laborables: 10h
};

// Obtener información de programación del día (capacidad, segmentos, descansos)
export const getDayInfo = (wd, isHoliday, holidayOverride) => {
  if (isHoliday && holidayOverride === "work") {
    return {
      capacity: 6,
      segments: [{ from: 420, to: 780 }], // 07:00-13:00 en minutos
      breaks: [{ start: 540, duration: 15 }], // 09:00, 15min
    };
  }
  if (wd === 7) return { capacity: 0, segments: [], breaks: [] };
  const weekdayCapacity = wd === 6 ? 7 : 10;
  const saturdayEndTime = 900; // 15:00 en minutos
  const weekdayEndTime = 1080; // 18:00 en minutos
  return {
    capacity: weekdayCapacity,
    segments: [
      { from: 420, to: 540 }, // 07:00-09:00
      { from: 555, to: 720 }, // 09:15-12:00
      { from: 765, to: wd === 6 ? saturdayEndTime : weekdayEndTime }, // 12:45-fin
    ],
    breaks: [
      { start: 540, duration: 15 }, // 09:00 desayuno
      { start: 720, duration: 45 }, // 12:00 almuerzo
    ],
  };
};

// Asignar horas en bloques de tiempo para un día dado
export const allocateHoursRandomly = (dateISO, dayInfo, hoursNeeded) => {
  if (hoursNeeded <= 0) return { blocks: [], used: 0, entryTime: null, exitTime: null };
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
    const startHM = `${Math.floor(cursor / 60).toString().padStart(2, '0')}:${(cursor % 60).toString().padStart(2, '0')}`;
    const endHM = `${Math.floor((cursor + take) / 60).toString().padStart(2, '0')}:${((cursor + take) % 60).toString().padStart(2, '0')}`;
    blocks.push({
      start: `${dateISO}T${startHM}:00`,
      end: `${dateISO}T${endHM}:00`,
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
};

// Generar horario para un rango de fechas, apuntando a 56 horas por semana
export const generateScheduleForRange56 = (start, end, workingWeekdays, holidaySet, holidayOverrides, sundayOverrides) => {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const weeks = [];
  let currentWeekStart = startOfWeek(startDate, { weekStartsOn: 1 });

  while (isBefore(currentWeekStart, endDate) || isSameDay(currentWeekStart, endDate)) {
    const weekEnd = addDays(currentWeekStart, 6);
    const weekDays = eachDayOfInterval({
      start: currentWeekStart,
      end: weekEnd > endDate ? endDate : weekEnd,
    });

    let baseHours = 0;
    let extraHours = 0;
    const dias = [];

    for (const day of weekDays) {
      const ymd = format(day, "yyyy-MM-dd");
      const wd = isoWeekday(day);
      const isHoliday = holidaySet.has(ymd);
      const holidayOverride = holidayOverrides[ymd];
      const isSunday = wd === 7;
      const sundayStatus = sundayOverrides[ymd];
      const isWorkingDay = workingWeekdays.includes(wd) && !(isHoliday && holidayOverride !== "work");

      let horas = 0;
      let horas_base = 0;
      let horas_extra = 0;
      let jornada_reducida = false;
      let bloques = [];
      let entrada = null;
      let salida = null;
      let domingo_estado = null;

      if (isSunday && sundayStatus) {
        domingo_estado = sundayStatus;
      } else if (isWorkingDay) {
        const dayInfo = getDayInfo(wd, isHoliday, holidayOverride);
        horas = wd === 6 ? 7 : baseHours >= WEEKLY_BASE ? 0 : Math.min(dayInfo.capacity, WEEKLY_BASE - baseHours);
        // Asignar jornada reducida (9 horas) a un día laborable si es posible
        if (wd !== 6 && horas === 9) jornada_reducida = true;
        horas_base = Math.min(horas, wd === 6 ? 4 : 8);
        horas_extra = horas - horas_base;

        const { blocks, entryTime, exitTime } = allocateHoursRandomly(ymd, dayInfo, horas);
        bloques = blocks;
        entrada = entryTime;
        salida = exitTime;

        baseHours += horas_base;
        extraHours += horas_extra;
      }

      dias.push({
        fecha: ymd,
        descripcion: format(day, "EEEE", { locale: require('date-fns/locale/es') }),
        horas,
        horas_base,
        horas_extra,
        jornada_reducida,
        bloques,
        jornada_entrada: entrada,
        jornada_salida: salida,
        domingo_estado,
      });
    }

    // Ajustar horas para alcanzar 56 por semana si es posible
    if (baseHours < WEEKLY_BASE && extraHours < WEEKLY_EXTRA) {
      for (let i = 0; i < dias.length && (baseHours < WEEKLY_BASE || extraHours < WEEKLY_EXTRA); i++) {
        const d = dias[i];
        const wd = isoWeekday(new Date(d.fecha));
        if (wd === 7 || d.horas >= getDailyCapacity(wd, holidaySet.has(d.fecha), holidayOverrides[d.fecha])) continue;
        const dayInfo = getDayInfo(wd, holidaySet.has(d.fecha), holidayOverrides[d.fecha]);
        const remainingBase = WEEKLY_BASE - baseHours;
        const remainingExtra = WEEKLY_EXTRA - extraHours;
        const maxAdditional = Math.min(dayInfo.capacity - d.horas, remainingBase + remainingExtra);
        if (maxAdditional <= 0) continue;

        let additionalBase = Math.min(maxAdditional, remainingBase);
        let additionalExtra = maxAdditional > additionalBase ? Math.min(maxAdditional - additionalBase, remainingExtra) : 0;
        if (wd === 6) {
          additionalBase = 4 - d.horas_base;
          additionalExtra = 3 - d.horas_extra;
        }

        if (additionalBase > 0 || additionalExtra > 0) {
          d.horas += additionalBase + additionalExtra;
          d.horas_base += additionalBase;
          d.horas_extra += additionalExtra;
          d.jornada_reducida = wd !== 6 && d.horas === 9;

          const { blocks, entryTime, exitTime } = allocateHoursRandomly(d.fecha, dayInfo, d.horas);
          d.bloques = blocks;
          d.jornada_entrada = entryTime;
          d.jornada_salida = exitTime;

          baseHours += additionalBase;
          extraHours += additionalExtra;
        }
      }
    }

    weeks.push({
      fecha_inicio: format(currentWeekStart, "yyyy-MM-dd"),
      fecha_fin: format(weekEnd > endDate ? endDate : weekEnd, "yyyy-MM-dd"),
      dias,
      total_horas_semana: baseHours + extraHours,
    });

    currentWeekStart = addDays(currentWeekStart, 7);
  }

  return { schedule: weeks };
};