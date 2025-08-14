// src/controllers/horariosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import {
  generateScheduleForRange,
} from '../utils/schedule.js';
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

    // Festivos Colombia en el rango
    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);
    // Festivos que el usuario decidió trabajar
    const workedHolidaySet = new Set(worked_holidays || []);

    // Genera semanas con objetivo 56h (base diaria 7.3h; sáb 7h; extras 12h/sem)
    const { weeks, warnings } = generateScheduleForRange(
      fecha_inicio,
      fecha_fin,
      working_weekdays,
      holidaySet,
      workedHolidaySet
    );

    const payload = weeks.map(sem => ({
      empleado_id,
      lider_id,
      tipo: 'semanal',
      fecha_inicio: sem.fecha_inicio,
      fecha_fin: sem.fecha_fin,
      dias: sem.dias,
      total_horas_semana: sem.total_horas_semana
    }));

    const { data, error } = await supabaseAxios.post('/horarios', payload);
    if (error) throw error;

    return res.status(201).json({ created: data, warnings });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Error creating horario', error: e.message });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    // Trae el horario actual
    const { data: [current] } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) return res.status(404).json({ message: 'Horario no encontrado' });

    const newDias = p.dias || current.dias;

    // Validaciones suaves:
    // - extra >= 0
    // - horas = base + extra
    // - extras semanales <= 12
    // - (dejamos de exigir base exacta 44h por semana; ahora la base diaria objetivo es 7.3h,
    //   pero puede no alcanzarse por capacidad/festivos; el generador ya advierte)
    let weeklyExtras = 0;
    for (const d of newDias) {
      const base  = Number(d.horas_base || 0);
      const extra = Number(d.horas_extra || 0);
      const total = Number(d.horas || (base + extra));

      if (extra < 0) return res.status(400).json({ message: `Extras negativas en ${d.fecha}` });
      if (Math.abs(total - (base + extra)) > 1e-6) {
        return res.status(400).json({ message: `Total del día debe ser base + extra en ${d.fecha}` });
      }
      weeklyExtras += extra;
    }

    if (weeklyExtras > 12 + 1e-6) {
      return res.status(400).json({ message: `Máximo 12h extra por semana.` });
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
