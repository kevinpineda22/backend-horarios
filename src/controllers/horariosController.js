// src/controllers/horariosController.js
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

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/horarios?select=*&empleado_id=eq.${empleado_id}&order=fecha_inicio.desc`;
    const { data } = await supabaseAxios.get(url);
    res.json(data);
  } catch (e) {
    console.error(e);
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
      holidayOverrides,
    } = req.body;
    const lider_id = req.user.id;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res
        .status(400)
        .json({
          message: "working_weekdays es requerido (array de 1..7; 1=Lun).",
        });
    }

    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);

    // Genera semanas intentando 56h (44 + 12 automáticas)
    const horariosSemanales = generateScheduleForRange56(
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holidaySet,
      holidayOverrides || {}
    );

    // Detectar semanas con problemas (no completaron base o no asignaron todas extras)
    const problematicWeeks = horariosSemanales
      .map((w) => ({
        fecha_inicio: w.fecha_inicio,
        fecha_fin: w.fecha_fin,
        total_horas_legales: w.total_horas_legales,
        total_horas_extras: w.total_horas_extras,
        total_horas_semana: w.total_horas_semana,
        remaining_base_unfilled: w.remaining_base_unfilled,
        extras_unassigned: w.extras_unassigned,
      }))
      .filter((w) => w.remaining_base_unfilled > 0 || w.extras_unassigned > 0);

    // Payload para insertar por semana
    const payload = horariosSemanales.map((horario) => ({
      empleado_id,
      lider_id,
      tipo: "semanal",
      fecha_inicio: horario.fecha_inicio,
      fecha_fin: horario.fecha_fin,
      dias: horario.dias,
      total_horas_semana: horario.total_horas_semana,
    }));

    const { data, error } = await supabaseAxios.post("/horarios", payload);
    if (error) throw error;

    res.status(201).json({
      created: data,
      problematicWeeks,
    });
  } catch (e) {
    console.error(e);
    if (
      String(e.message || "").includes("No se pueden cumplir 44h") ||
      String(e.message || "").includes("no se logró cerrar en 44h")
    ) {
      return res.status(400).json({ message: e.message });
    }
    res
      .status(500)
      .json({ message: "Error creating horario", error: e.message });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    const {
      data: [current],
    } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current)
      return res.status(404).json({ message: "Horario no encontrado" });

    const newDias = p.dias || current.dias;

    const byWeek = new Map();
    for (const d of newDias) {
      const wd = isoWeekday(new Date(d.fecha));
      const cap = getDailyCapacity(wd);

      const base = Number(d.horas_base || 0);
      const extra = Number(d.horas_extra || 0);
      const total = Number(d.horas || base + extra);

      if (extra < 0)
        return res
          .status(400)
          .json({ message: `Extras negativas en ${d.fecha}` });
      if (Math.abs(total - (base + extra)) > 1e-6) {
        return res
          .status(400)
          .json({
            message: `Total del día debe ser base + extra en ${d.fecha}`,
          });
      }
      if (total > cap + 1e-6) {
        return res
          .status(400)
          .json({
            message: `Capacidad diaria excedida (${cap}h) en ${d.fecha}`,
          });
      }

      const weekStart = startOfISOWeek(new Date(d.fecha));
      const key = weekStart.toISOString().slice(0, 10);
      if (!byWeek.has(key)) byWeek.set(key, { extrasSum: 0, baseSum: 0 });
      byWeek.get(key).extrasSum += extra;
      byWeek.get(key).baseSum += base;
    }

    for (const [week, agg] of byWeek.entries()) {
      if (agg.extrasSum > WEEKLY_EXTRA + 1e-6) {
        return res
          .status(400)
          .json({
            message: `Máximo ${WEEKLY_EXTRA}h extra por semana (semana ${week}).`,
          });
      }
      if (Math.round(agg.baseSum) !== WEEKLY_BASE) {
        return res
          .status(400)
          .json({
            message: `Las horas base de la semana ${week} deben sumar ${WEEKLY_BASE}h.`,
          });
      }
    }

    const totalSemana = newDias.reduce((s, x) => s + Number(x.horas || 0), 0);

    await supabaseAxios.patch(`/horarios?id=eq.${id}`, {
      ...p,
      dias: newDias,
      total_horas_semana: totalSemana,
    });
    res.json({ message: "Updated" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error updating horario" });
  }
};

export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAxios.delete(`/horarios?id=eq.${id}`);
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error deleting horario" });
  }
};
