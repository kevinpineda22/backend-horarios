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
      holiday_overrides,
      sunday_overrides, // Nuevo: Recibir los overrides del domingo
    } = req.body;
    const lider_id = req.user.id;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res.status(400).json({ message: "working_weekdays es requerido." });
    }

    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);

    const horariosSemanales = generateScheduleForRange56(
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holidaySet,
      holiday_overrides || {},
      sunday_overrides || {} // Nuevo: Pasar los overrides del domingo
    );

    const payload = horariosSemanales.map((horario) => ({
      empleado_id,
      lider_id,
      tipo: "semanal",
      ...horario,
    }));

    const { data, error } = await supabaseAxios.post("/horarios", payload);
    if (error) throw error;

    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error creating horario", error: e.message });
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
    await supabaseAxios.patch(`/horarios?id=eq.${id}`, { ...p, dias: newDias, total_horas_semana: totalSemana });
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