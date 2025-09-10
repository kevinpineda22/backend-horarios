import { supabaseAxios } from "../services/supabaseAxios.js";
import {
  generateScheduleForRange56,
  getDailyCapacity,
  isoWeekday,
  WEEKLY_LEGAL_LIMIT,
  WEEKLY_EXTRA_LIMIT,
  getDayInfo,
  allocateHoursRandomly,
} from "../utils/schedule.js";
import { getHolidaySet } from "../utils/holidays.js";
import { format } from "date-fns";

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/horarios?select=*&empleado_id=eq.${empleado_id}&order=fecha_inicio.desc`;
    const { data } = await supabaseAxios.get(url);
    res.json(data);
  } catch (e) {
    console.error("Error completo:", e);
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
      estado_visibilidad: "publico",
    }));

    const { data: dataSemanales, error: errorSemanales } = await supabaseAxios.post(
      "/horarios",
      payloadSemanales
    );
    if (errorSemanales) throw errorSemanales;

    res.status(201).json(dataSemanales);
  } catch (e) {
    console.error("Error detallado en createHorario:", e);
    res.status(500).json({
      message: "Error creating horario",
      error: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const { dias } = req.body; // esperamos un arreglo de días
  try {
    const { data: [current] } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) {
      return res.status(404).json({ message: "Horario no encontrado" });
    }
    if (!Array.isArray(dias) || dias.length === 0) {
      return res.status(400).json({ message: "El payload debe incluir 'dias' como arreglo." });
    }

    const updatedDias = JSON.parse(JSON.stringify(dias)); // copia profunda
    let legalSum = 0;
    let extraSum = 0;
    let totalSum = 0;

    for (let i = 0; i < updatedDias.length; i++) {
      const d = updatedDias[i];
      const wd = isoWeekday(new Date(d.fecha)); // 1..7
      const totalHours = Number(d.horas || 0);

      // 1) Validación de capacidad diaria visible (10h L–V, 7h S, 0h D)
      const dailyCap = getDailyCapacity(wd, false, null);
      if (totalHours > dailyCap + 1e-6) {
        return res
          .status(400)
          .json({ message: `Capacidad excedida (${dailyCap}h) en ${d.fecha}` });
      }

      // 2) Cálculo de legales/extras con regla especial de sábado
      let base, extra;
      if (wd === 7) {
        // Domingo siempre 0 y sin bloques
        base = 0;
        extra = 0;
      } else if (wd === 6) {
        // Sábado: 4 legales + resto extra (normalmente 3 si total=7)
        base = Math.min(4, totalHours);
        extra = Math.max(0, totalHours - base);
      } else {
        // L–V: hasta 8 legales, resto extra
        base = Math.min(totalHours, 8);
        extra = Math.max(0, totalHours - base);
      }

      d.horas_base = base;
      d.horas_extra = extra;

      // 3) Recalcular bloques si hay horas; si no, limpiar campos de jornada
      if (totalHours > 0 && wd !== 7) {
        const dayInfo = getDayInfo(wd, false, null);
        const { blocks, entryTime, exitTime } = allocateHoursRandomly(
          d.fecha,
          dayInfo,
          totalHours
        );
        d.bloques = blocks;
        d.jornada_entrada = entryTime;
        d.jornada_salida = exitTime;
      } else {
        d.bloques = null;
        d.jornada_entrada = null;
        d.jornada_salida = null;
      }

      legalSum += base;
      extraSum += extra;
      totalSum += totalHours;
    }

    // 4) Límites semanales
    if (legalSum > WEEKLY_LEGAL_LIMIT + 1e-6) {
      return res
        .status(400)
        .json({
          message: `Excede ${WEEKLY_LEGAL_LIMIT}h legales semanales (${legalSum.toFixed(
            2
          )}h).`,
        });
    }
    if (extraSum > WEEKLY_EXTRA_LIMIT + 1e-6) {
      return res
        .status(400)
        .json({
          message: `Excede ${WEEKLY_EXTRA_LIMIT}h extras semanales (${extraSum.toFixed(
            2
          )}h).`,
        });
    }

    const updatePayload = {
      dias: updatedDias,
      total_horas_semana: totalSum,
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
    await supabaseAxios.patch(`/horarios?empleado_id=eq.${empleado_id}`, {
      estado_visibilidad: "archivado",
    });
    res.json({ message: "Horarios del empleado archivados con éxito." });
  } catch (e) {
    console.error("Error archivando horarios:", e);
    res.status(500).json({ message: "Error al archivar los horarios." });
  }
};

const archivarHorariosPorEmpleado = async (empleadoId) => {
  try {
    const { data: horariosPublicos } = await supabaseAxios.get(
      `/horarios?select=id&empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`
    );
    if (horariosPublicos && horariosPublicos.length > 0) {
      await supabaseAxios.patch(
        `/horarios?empleado_id=eq.${empleadoId}&estado_visibilidad=eq.publico`,
        { estado_visibilidad: "archivado" }
      );
    } else {
      console.log(
        `No se encontraron horarios públicos para el empleado ${empleadoId}. No se archivó nada.`
      );
    }
  } catch (e) {
    console.error(`Error archivando horarios para el empleado ${empleadoId}:`, e);
    throw e;
  }
};
