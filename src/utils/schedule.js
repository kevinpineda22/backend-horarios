import {
  startOfWeek,
  addWeeks,
  format,
  addDays,
  setHours,
  setMinutes,
  isSameDay
} from 'date-fns';
import { es } from 'date-fns/locale';

// Constantes para un código más claro
const BREAK_MINUTES = 60; // 45 de almuerzo + 15 de desayuno

// Función principal que genera un horario para una semana específica
const generateWeekSchedule = (date) => {
  const startDayOfWeek = startOfWeek(date, { weekStartsOn: 1 }); // Lunes
  const endDayOfWeek = addDays(startDayOfWeek, 5); // Sábado

  const days = [];
  let totalHoras = 0;

  for (let i = 0; i < 6; i++) { // Lunes a Sábado
    const currentDay = addDays(startDayOfWeek, i);
    const dayOfWeek = format(currentDay, 'EEEE', { locale: es });
    let start, end;
    let horasDiarias;

    // Horarios de lunes a viernes
    if (i < 5) {
      start = setMinutes(setHours(currentDay, 7), 0);
      
      if (i < 4) { // Lunes a Jueves: 7am - 6pm
        end = setMinutes(setHours(currentDay, 18), 0);
      } else { // Viernes: 7am - 5pm
        end = setMinutes(setHours(currentDay, 17), 0);
      }

      horasDiarias = (end.getHours() - start.getHours()) - (BREAK_MINUTES / 60);

    } 
    // Horario del Sábado
    else {
      start = setMinutes(setHours(currentDay, 7), 0);
      end = setMinutes(setHours(currentDay, 15), 0);
      horasDiarias = (end.getHours() - start.getHours()) - (BREAK_MINUTES / 60);
    }

    // Convertir las fechas a un formato que no cambie la zona horaria
    const startString = format(start, "yyyy-MM-dd'T'HH:mm:ss");
    const endString = format(end, "yyyy-MM-dd'T'HH:mm:ss");

    days.push({
      descripcion: dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
      fecha: format(currentDay, 'yyyy-MM-dd'),
      start: startString,
      end: endString,
      horas: horasDiarias
    });

    totalHoras += horasDiarias;
  }

  return {
    fecha_inicio: format(startDayOfWeek, 'yyyy-MM-dd'),
    fecha_fin: format(endDayOfWeek, 'yyyy-MM-dd'),
    dias: days,
    total_horas_semana: totalHoras,
  };
};

export const generateScheduleForRange = (startDate, endDate) => {
  const schedules = [];
  let currentWeek = new Date(startDate);
  currentWeek = startOfWeek(currentWeek, { weekStartsOn: 1 });

  while (currentWeek <= new Date(endDate)) {
    schedules.push(generateWeekSchedule(currentWeek));
    currentWeek = addWeeks(currentWeek, 1);
  }

  return schedules;
};