import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleForRange56,
  getDailyCapacity,
  isoWeekday,
  startOfISOWeek,
  WEEKLY_BASE,
  WEEKLY_EXTRA,
  getDayInfo,
  allocateHoursRandomly, 
} from "../utils/schedule.js";
import { getHolidaySet } from "../utils/holidays.js";

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

    let newDias = JSON.parse(JSON.stringify(p.dias || current.dias)); // Deep copy
    let legalSum = 0;
    let extraSum = 0;

    // Encontrar el día con 9 horas (jornada_reducida: true)
    const originalReducedDay = current.dias.find(
      (day) => day.jornada_reducida && Number(day.horas) === 9
    );

    for (let i = 0; i < newDias.length; i++) {
      const d = newDias[i];
      const wd = isoWeekday(new Date(d.fecha));
      const cap = getDailyCapacity(wd, false, null);
      let total = Number(d.horas || 0);
      let base = Number(d.horas_base || 0);
      let extra = Number(d.horas_extra || 0);

      // Validar capacidad diaria
      if (total > cap + 1e-6) {
        return res.status(400).json({ message: `Capacidad excedida (${cap}h) en ${d.fecha}` });
      }

      // Forzar sábado: 4 base + 3 extra
      if (wd === 6) {
        base = 4;
        extra = 3;
        total = 7;
      } else if (
        originalReducedDay &&
        d.fecha === originalReducedDay.fecha &&
        total === 0
      ) {
        // Día original con 9 horas, ahora en 0: asignar 10 horas
        total = 10;
        base = 8;
        extra = 2;
      } else {
        // Otros días: recalcular base y extra
        base = Math.min(total, 8);
        extra = total - base;
      }

      // Recalcular bloques para todos los días
      const dayInfo = getDayInfo(wd, false, null);
      const { blocks, entryTime, exitTime } = allocateHoursRandomly(d.fecha, dayInfo, total);
      newDias[i] = {
        ...d,
        horas_base: base,
        horas_extra: extra,
        horas: total,
        bloques: blocks,
        jornada_entrada: entryTime,
        jornada_salida: exitTime,
      };

      legalSum += base;
      extraSum += extra;
    }

    // Validar límites semanales
    if (legalSum > WEEKLY_BASE + 1e-6) {
      return res.status(400).json({ message: `Excede ${WEEKLY_BASE}h legales semanales (${legalSum}h).` });
    }
    if (extraSum > WEEKLY_EXTRA + 1e-6) {
      return res.status(400).json({ message: `Excede ${WEEKLY_EXTRA}h extras semanales (${extraSum}h).` });
    }

    const totalSemana = newDias.reduce((s, x) => s + Number(x.horas || 0), 0);
    const updatePayload = { dias: newDias, total_horas_semana: totalSemana };

    await supabaseAxios.patch(`/horarios?id=eq.${id}`, updatePayload);
    res.json({ message: "Updated" });
  } catch (e) {
    console.error(e);
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