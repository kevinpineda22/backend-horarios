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
import { v4 as uuidv4 } from 'uuid';

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/horarios?select=*&empleado_id=eq.${empleado_id}&order=fecha_inicio.desc`;
    const { data: horariosSemanales, error: semanalError } = await supabaseAxios.get(url);
    if (semanalError) throw semanalError;
    
    const urlDomingos = `/horarios_domingos?select=*&empleado_id=eq.${empleado_id}&order=fecha.desc`;
    const { data: horariosDomingos, error: domingosError } = await supabaseAxios.get(urlDomingos);
    if (domingosError) throw domingosError;

    const combinedData = {
      horariosSemanales: horariosSemanales,
      horariosDomingos: horariosDomingos
    };
    
    res.json(combinedData);
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

    const { schedule: horariosSemanales, sundayData } = generateScheduleForRange56(
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holidaySet,
      holiday_overrides || {},
      sunday_overrides || {}
    );

    const payloadSemanales = horariosSemanales.map((horario) => ({
      empleado_id,
      lider_id,
      tipo: "semanal",
      ...horario,
    }));

    const payloadDomingos = sundayData
      .filter(domingo => domingo.domingo_estado !== undefined && domingo.domingo_estado !== null)
      .map(domingo => {
        return {
          id: uuidv4(),
          empleado_id,
          lider_id,
          fecha: domingo.fecha,
          domingo_estado: domingo.domingo_estado,
          horas: domingo.horas
        };
      });

    const { data: dataSemanales, error: errorSemanales } = await supabaseAxios.post("/horarios", payloadSemanales);
    if (errorSemanales) throw errorSemanales;

    let dataDomingos = [];
    if (payloadDomingos.length > 0) {
      const { data: dData, error: dError } = await supabaseAxios.post("/horarios_domingos", payloadDomingos);
      if (dError) throw dError;
      dataDomingos = dData;
    }

    res.status(201).json({ horariosSemanales: dataSemanales, horariosDomingos: dataDomingos });
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