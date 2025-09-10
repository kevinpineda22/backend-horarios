import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleForRange56,
  getDailyCapacity,
  isoWeekday,
  startOfISOWeek,
  WEEKLY_BASE,
  WEEKLY_EXTRA,
  getDayInfo,
  allocateHoursRandomly, // <-- IMPORTADO
} from "../utils/schedule.js";
import { getHolidaySet } from "../utils/holidays.js";
// import { sendEmail } from "../services/emailService.js";
import { format } from 'date-fns';

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
      working_weekdays,
      holidaySet,
      holiday_overrides || {},
      sunday_overrides || {}
    );

    await archivarHorariosPorEmpleado(empleado_id);

    const payloadSemanales = horariosSemanales.map((horario) => ({
      empleado_id,
      lider_id,
      tipo: "semanal",
      dias: horario.dias,
      fecha_inicio: horario.fecha_inicio,
      fecha_fin: horario.fecha_fin,
      total_horas_semana: horario.total_horas_semana,
      estado_visibilidad: 'publico',
    }));
    
    const { data: dataSemanales, error: errorSemanales } = await supabaseAxios.post("/horarios", payloadSemanales);
    if (errorSemanales) throw errorSemanales;

    /*
    // Obtener datos del empleado para el correo
    const { data: empleadoData, error: empleadoError } = await supabaseAxios.get(`/empleados?select=nombre_completo,correo_electronico&id=eq.${empleado_id}`);
    if (empleadoError) throw empleadoError;
    const empleado = empleadoData[0];
    
    if (empleado && empleado.correo_electronico) {
      const subject = "¡Tu nuevo horario semanal está listo!";
      const htmlContent = `
        <p>Hola ${empleado.nombre_completo},</p>
        <p>Te informamos que tu horario de trabajo semanal ha sido asignado y está listo para ser consultado.</p>
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
  const { dias } = req.body;
  try {
    const { data: [current] } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) return res.status(404).json({ message: "Horario no encontrado" });

    let updatedDias = JSON.parse(JSON.stringify(dias));
    let legalSum = 0;
    let extraSum = 0;
    let totalSum = 0;

    for (let i = 0; i < updatedDias.length; i++) {
      const d = updatedDias[i];
      const wd = isoWeekday(new Date(d.fecha));
      const totalHours = Number(d.horas || 0);

      d.horas_base = Math.min(totalHours, 8);
      d.horas_extra = totalHours > 8 ? totalHours - 8 : 0;
      
      if (totalHours > 0) {
        const dayInfo = getDayInfo(wd, false, null);
        const { blocks, entryTime, exitTime } = allocateHoursRandomly(d.fecha, dayInfo, totalHours);
        d.bloques = blocks;
        d.jornada_entrada = entryTime;
        d.jornada_salida = exitTime;
      } else {
        d.bloques = null;
        d.jornada_entrada = null;
        d.jornada_salida = null;
      }

      legalSum += d.horas_base;
      extraSum += d.horas_extra;
      totalSum += totalHours;
    }

    if (legalSum > WEEKLY_LEGAL_LIMIT + 1e-6) {
      return res.status(400).json({ message: `Excede ${WEEKLY_LEGAL_LIMIT}h legales semanales (${legalSum.toFixed(2)}h).` });
    }
    if (extraSum > WEEKLY_EXTRA_LIMIT + 1e-6) {
      return res.status(400).json({ message: `Excede ${WEEKLY_EXTRA_LIMIT}h extras semanales (${extraSum.toFixed(2)}h).` });
    }
    
    const updatePayload = { 
      dias: updatedDias, 
      total_horas_semana: totalSum 
    };

    await supabaseAxios.patch(`/horarios?id=eq.${id}`, updatePayload);
    res.json({ message: "Updated" });
  } catch (e) {
    console.error("Error updating horarios:", e);
    res.status(500).json({ message: "Error updating" });
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

export const archivarHorarios = async (req, res) => {
  const { empleado_id } = req.body;
  if (!empleado_id) {
    return res.status(400).json({ message: "El ID del empleado es requerido." });
  }
  try {
    await supabaseAxios.patch(
      `/horarios?empleado_id=eq.${empleado_id}`,
      { estado_visibilidad: 'archivado' }
    );
    res.json({ message: "Horarios del empleado archivados con éxito." });
  } catch (e) {
    console.error("Error archivando horarios:", e);
    res.status(500).json({ message: "Error al archivar los horarios." });
  }
};

const archivarHorariosPorEmpleado = async (empleadoId) => {
  try {
    const { data: horariosPublicos } = await supabaseAxios.get(`/horarios?select=id&empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`);
    if (horariosPublicos && horariosPublicos.length > 0) {
      await supabaseAxios.patch(
        `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`,
        { estado_visibilidad: 'archivado' }
      );
    } else {
      console.log(`No se encontraron horarios públicos para el empleado ${empleadoId}. No se archivó nada.`);
    }
  } catch (e) {
    console.error(`Error archivando horarios para el empleado ${empleadoId}:`, e);
    throw e;
  }
};