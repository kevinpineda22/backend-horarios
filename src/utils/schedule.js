// src/utils/schedule.js
import { addDays, format } from 'date-fns';

/**
 * Genera el arreglo de días para una semana de Lunes a Sábado
 * con 44 h obligatorias + hasta 12 h extra, respetando:
 * - Lun–Vie: ventana 07:00–18:00 (11 h) con 1 h breaks → máx 10 h trabajo
 * - Sáb:      ventana 07:00–15:00 (8 h)  con 1 h breaks → máx 7 h trabajo
 *
 * @param {string|Date} start — ISO string o Date, debe ser lunes
 * @param {number} extras — 0–12 h extra
 * @returns {Array<{fecha:string,descripcion:string,horas:number,start:string,end:string}>}
 */
export function generateWeekSchedule(start, extras = 0) {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const oblig = 44;
  const daysCount     = 6;
  const weekdayWindow = 11 * 60; // minutos
  const saturdayWindow=  8 * 60;
  const breakMin      = 60;      // 15'+45'

  const base = Math.floor(oblig / daysCount);
  const rem  = oblig - base * daysCount;
  let leftExtras = Math.min(Math.max(extras, 0), 12);

  const names = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const out = [];

  for (let i = 0; i < daysCount; i++) {
    const dateObj = addDays(startDate, i);
    let hrs = base + (i < rem ? 1 : 0);
    const windowMin = i < 5 ? weekdayWindow : saturdayWindow;
    const cap = Math.floor((windowMin - breakMin) / 60);
    const give = Math.min(leftExtras, cap - hrs);
    hrs += give;
    leftExtras -= give;

    const dtStart = new Date(dateObj);
    dtStart.setHours(7,0,0,0);
    const totalMin = hrs * 60 + breakMin;
    const dtEnd   = new Date(dtStart.getTime() + totalMin * 60000);

    out.push({
      fecha:      format(dateObj, 'yyyy-MM-dd'),
      descripcion: names[i],
      horas:      hrs,
      start:      dtStart.toISOString(),
      end:        dtEnd.toISOString()
    });
  }

  return out;
}
