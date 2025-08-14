// src/controllers/horariosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import { generateScheduleForRange, getDailyCapacity, isoWeekday, startOfISOWeek } from '../utils/schedule.js';
import { getHolidaySet } from '../utils/holidays.js';

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/horarios?select=*&empleado_id=eq.${empleado_id}&order=fecha_inicio.desc`;
    const { data } = await supabaseAxios.get(url);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error fetching horarios' });
  }
};

export const createHorario = async (req, res) => {
  try {
    const { empleado_id, fecha_inicio, fecha_fin, working_weekdays, worked_holidays = [] } = req.body;
    const lider_id = req.user.id;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res.status(400).json({ message: 'working_weekdays es requerido (array de 1..7; 1=Lun).' });
    }

    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);
    const workedHolidaySet = new Set((worked_holidays || []).map(String));

    const { schedules, warnings } = generateScheduleForRange(
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holidaySet,
      workedHolidaySet
    );

    const payload = schedules.map(horario => ({
      empleado_id,
      lider_id,
      tipo: 'semanal',
      fecha_inicio: horario.fecha_inicio,
      fecha_fin: horario.fecha_fin,
      dias: horario.dias,
      total_horas_semana: horario.total_horas_semana
    }));

    const { data, error } = await supabaseAxios.post('/horarios', payload);
    if (error) throw error;

    res.status(201).json({ created: data, warnings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error creating horario', error: e.message });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    const { data: [current] } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) return res.status(404).json({ message: 'Horario no encontrado' });

    const newDias = p.dias || current.dias;

    // Validaciones: total día = base + extra; capacidad diaria; extras semanales ≤ 12h
    const byWeek = new Map();
    for (const d of newDias) {
      const wdDate = new Date(d.fecha);
      const wd = isoWeekday(wdDate);
      const cap = getDailyCapacity(wd);

      const base  = Number(d.horas_base || 0);
      const extra = Number(d.horas_extra || 0);
      const total = Number(d.horas || (base + extra));

      if (extra < 0) return res.status(400).json({ message: `Extras negativas en ${d.fecha}` });
      if (Math.abs(total - (base + extra)) > 1e-6) {
        return res.status(400).json({ message: `Total del día debe ser base + extra en ${d.fecha}` });
      }
      if (total > cap + 1e-6) {
        return res.status(400).json({ message: `Capacidad diaria excedida (${cap}h) en ${d.fecha}` });
      }

      const weekStart = startOfISOWeek(wdDate);
      const key = weekStart.toISOString().slice(0,10);
      if (!byWeek.has(key)) byWeek.set(key, { extrasSum: 0 });
      byWeek.get(key).extrasSum += extra;
    }

    for (const [week, agg] of byWeek.entries()) {
      if (agg.extrasSum > 12 + 1e-6) {
        return res.status(400).json({ message: `Máximo 12h extra por semana (semana ${week}).` });
      }
    }

    const totalSemana = newDias.reduce((s,x)=> s + Number(x.horas || 0), 0);

    await supabaseAxios.patch(`/horarios?id=eq.${id}`, {
      ...p,
      dias: newDias,
      total_horas_semana: totalSemana
    });
    res.json({ message: 'Updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error updating horario' });
  }
};

export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAxios.delete(`/horarios?id=eq.${id}`);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error deleting horario' });
  }
};
