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

    let newDias = p.dias || current.dias;
    const byWeek = new Map();
    let legalSum = 0;
    let extraSum = 0;

    // Validar y ajustar cada día
    for (const d of newDias) {
      const wd = isoWeekday(new Date(d.fecha));
      const cap = getDailyCapacity(wd, false, null);
      let base = Number(d.horas_base || 0);
      let extra = Number(d.horas_extra || 0);
      let total = Number(d.horas || base + extra);

      if (total > cap + 1e-6) {
        return res.status(400).json({ message: `Capacidad diaria excedida (${cap}h) en ${d.fecha}` });
      }

      // Ajustar sábado: 4 base + 3 extra
      if (wd === 6) {
        base = Math.min(4, base);
        extra = Math.min(3, extra);
        total = base + extra;
        d.horas_base = base;
        d.horas_extra = extra;
        d.horas = total;
      }

      legalSum += base;
      extraSum += extra;

      const weekStart = startOfISOWeek(new Date(d.fecha));
      const key = weekStart.toISOString().slice(0, 10);
      if (!byWeek.has(key)) byWeek.set(key, { extrasSum: 0, baseSum: 0 });
      byWeek.get(key).extrasSum += extra;
      byWeek.get(key).baseSum += base;
    }

    // Validar límites semanales
    if (legalSum > WEEKLY_BASE + 1e-6) {
      return res.status(400).json({ message: `Máximo ${WEEKLY_BASE}h legales por semana excedido.` });
    }
    if (extraSum > WEEKLY_EXTRA + 1e-6) {
      return res.status(400).json({ message: `Máximo ${WEEKLY_EXTRA}h extras por semana excedido.` });
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