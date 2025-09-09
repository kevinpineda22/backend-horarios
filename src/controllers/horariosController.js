import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleForRange56,
  getDailyCapacity,
  isoWeekday,
  startOfISOWeek,
  WEEKLY_EXTRA,
  WEEKLY_BASE,
} from "../utils/schedule.js";
import { getHolidaySet } from "../utils/holidays.js";
import { format } from 'date-fns';

// La importación de Nodemailer se ha comentado
// import { sendEmail } from "../services/emailService.js";

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/horarios?select=*&empleado_id=eq.${empleado_id}&order=fecha_inicio.desc`;
    const { data } = await supabaseAxios.get(url);
    
    res.json(data);
  } catch (e) {
    console.error('Error completo:', e);
    res.status(500).json({ message: "Error fetching horarios" });
  }
};

export const createHorario = async (req, res) => {
  try {
    const {
      empleado_id,
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holiday_overrides,
      sunday_overrides,
    } = req.body;
    const lider_id = req.user.id;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res.status(400).json({ message: "working_weekdays es requerido." });
    }

    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);

    const { schedule: horariosSemanales } = generateScheduleForRange56(
      fecha_inicio,
      fecha_fin,
      workingWeekdays,
      holidaySet,
      holiday_overrides || {},
      sunday_overrides || {}
    );

    // Archivar los horarios existentes antes de crear los nuevos
    await archivarHorariosPorEmpleado(empleado_id);

    const payloadSemanales = horariosSemanales.map((horario) => ({
      empleado_id,
      lider_id,
      tipo: "semanal",
      domingo_estado: horario.domingo_estado,
      dias: horario.dias,
      fecha_inicio: horario.fecha_inicio,
      fecha_fin: horario.fecha_fin,
      total_horas_semana: horario.total_horas_semana,
      estado_visibilidad: 'publico', // <--- NUEVO CAMPO
    }));
    
    const { data: dataSemanales, error: errorSemanales } = await supabaseAxios.post("/horarios", payloadSemanales);
    if (errorSemanales) throw errorSemanales;

    // Se ha comentado la lógica de envío de correos
    /*
    // Obtener datos del empleado para el correo
    const { data: empleadoData, error: empleadoError } = await supabaseAxios.get(`/empleados?select=nombre_completo,correo_electronico&id=eq.${empleado_id}`);
    if (empleadoError) throw empleadoError;
    const empleado = empleadoData[0];
    
    // Llamar al servicio de correo para enviar la notificación
    if (empleado && empleado.correo_electronico) {
      const subject = "¡Tu nuevo horario semanal está listo!";
      const htmlContent = `
        <p>Hola ${empleado.nombre_completo},</p>
        <p>Te informamos que tu horario de trabajo semanal ha sido asignado y está listo para ser consultado.</p>
        <p>Puedes ver los detalles de tu jornada laboral haciendo clic en el siguiente enlace:</p>
        <p><a href="${process.env.PUBLIC_CONSULTA_URL}">Consultar mi horario</a></p>
        <p>Gracias por tu dedicación.</p>
      `;
      await sendEmail(empleado.correo_electronico, subject, htmlContent);
    }
    */

    res.status(201).json(dataSemanales);
  } catch (e) {
    console.error("Error detallado en createHorario:", e);
    res.status(500).json({ 
      message: "Error creating horario", 
      error: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined 
    });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    const { data: [current] } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) return res.status(404).json({ message: "Horario no encontrado" });

    const newDias = p.dias || current.dias;
    const byWeek = new Map();
    
    for (const d of newDias) {
      const wd = isoWeekday(new Date(d.fecha));
      const cap = getDailyCapacity(wd, false, null);
      const base = Number(d.horas_base || 0);
      const extra = Number(d.horas_extra || 0);
      const total = Number(d.horas || base + extra);

      if (total > cap + 1e-6) {
        return res.status(400).json({ message: `Capacidad diaria excedida (${cap}h) en ${d.fecha}` });
      }

      const weekStart = startOfISOWeek(new Date(d.fecha));
      const key = weekStart.toISOString().slice(0, 10);
      if (!byWeek.has(key)) byWeek.set(key, { extrasSum: 0, baseSum: 0 });
      byWeek.get(key).extrasSum += extra;
      byWeek.get(key).baseSum += base;
    }

    for (const [week, agg] of byWeek.entries()) {
      if (agg.extrasSum > WEEKLY_EXTRA + 1e-6) {
        return res.status(400).json({ message: `Máximo ${WEEKLY_EXTRA}h extra por semana (semana ${week}).` });
      }
    }

    const totalSemana = newDias.reduce((s, x) => s + Number(x.horas || 0), 0);
    const updatePayload = { ...p, dias: newDias, total_horas_semana: totalSemana };
    
    await supabaseAxios.patch(`/horarios?id=eq.${id}`, updatePayload);
    
    res.json({ message: "Updated" });
  } catch (e) {
    console.error("Error detallado en updateHorario:", e);
    res.status(500).json({ message: "Error updating horario" });
  }
};

export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAxios.delete(`/horarios?id=eq.${id}`);
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("Error eliminando horario:", e);
    res.status(500).json({ message: "Error deleting horario" });
  }
};

// Función interna para archivar horarios (se utiliza en `createHorario`)
const archivarHorariosPorEmpleado = async (empleadoId) => {
  try {
    await supabaseAxios.patch(
      `/horarios?empleado_id=eq.${empleadoId}`,
      { estado_visibilidad: 'archivado' }
    );
  } catch (e) {
    console.error(`Error archivando horarios para el empleado ${empleadoId}:`, e);
    throw e;
  }
};