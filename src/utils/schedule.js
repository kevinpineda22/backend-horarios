// src/utils/schedule.js
import { addDays, format, startOfWeek, isBefore, addWeeks } from 'date-fns';

/**
 * Genera el arreglo de días para una semana de Lunes a Sábado
 * con 44 h obligatorias + hasta 12 h extra, respetando los breaks y ventanas.
 * @param {string|Date} start - ISO string o Date, debe ser lunes
 * @param {number} extras - 0–12 h extra
 * @returns {Array<{fecha:string,descripcion:string,horas:number,start:string,end:string}>}
 */
function generateWeekSchedule(start, extras = 0) {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const oblig = 44;
  const daysCount = 6;
  const breakMin = 60; // 45min almuerzo + 15min desayuno

  const base = Math.floor(oblig / daysCount);
  const rem = oblig - base * daysCount;
  let leftExtras = Math.min(Math.max(extras, 0), 12);

  const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const out = [];

  for (let i = 0; i < daysCount; i++) {
    const dateObj = addDays(startDate, i);
    let hrs = base + (i < rem ? 1 : 0);
    const cap = i < 5 ? 10 : 7; // L-V max 10h, S max 7h
    const give = Math.min(leftExtras, cap - hrs);
    hrs += give;
    leftExtras -= give;

    const totalMin = hrs * 60 + breakMin;
    const dtStart = new Date(dateObj);
    dtStart.setHours(7, 0, 0, 0);
    const dtEnd = new Date(dtStart.getTime() + totalMin * 60000);

    out.push({
      fecha: format(dateObj, 'yyyy-MM-dd'),
      descripcion: names[i],
      horas: hrs,
      start: dtStart.toISOString(),
      end: dtEnd.toISOString(),
    });
  }

  return {
    fecha_inicio: format(startDate, 'yyyy-MM-dd'),
    fecha_fin: format(addDays(startDate, 5), 'yyyy-MM-dd'),
    dias: out,
    total_horas_semana: out.reduce((sum, d) => sum + d.horas, 0)
  };
}

/**
 * Genera el arreglo de horarios para un rango de fechas dado.
 * @param {string} start - Fecha de inicio del rango (ISO string)
 * @param {string} end - Fecha de fin del rango (ISO string)
 * @param {number} extras - Horas extras por semana
 * @returns {Array} - Arreglo de objetos de horario, uno por cada semana
 */
export function generateScheduleForRange(start, end, extras) {
  const startDate = startOfWeek(new Date(start), { weekStartsOn: 1 }); // weekStartsOn: 1 = Lunes
  const endDate = new Date(end);
  const horarios = [];
  let currentWeekStart = startDate;

  while (isBefore(currentWeekStart, endDate) || format(currentWeekStart, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
    horarios.push(generateWeekSchedule(currentWeekStart, extras));
    currentWeekStart = addWeeks(currentWeekStart, 1);
  }

  return horarios;
}