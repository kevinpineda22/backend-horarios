// src/controllers/horariosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import { generateScheduleForRange, getDailyCapacity, isoWeekday, startOfISOWeek, addDays } from '../utils/schedule.js';
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
    const { empleado_id, fecha_inicio, fecha_fin, working_weekdays } = req.body;
    const lider_id = req.user.id;

    if (!Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res.status(400).json({ message: 'working_weekdays es requerido (array de 1..7; 1=Lun).' });
    }

    // Festivos Colombia en el rango
    const holidaySet = getHolidaySet(fecha_inicio, fecha_fin);

    // Genera base 44h/semana con ventanas reales
    const horariosSemanales = generateScheduleForRange(fecha_inicio, fecha_fin, working_weekdays, holidaySet);

    const payload = horariosSemanales.map(horario => ({
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
    res.status(201).json(data);

  } catch (e) {
    console.error(e);
    // Si la función lanzó un error de imposibilidad de 44h, devuélvelo como 400
    if (String(e.message || '').includes('No se pueden cumplir 44h') || String(e.message || '').includes('no se logró cerrar en 44h')) {
      return res.status(400).json({ message: e.message });
    }
    res.status(500).json({ message: 'Error creating horario', error: e.message });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    // Trae el horario actual para validar por semanas
    const { data: [current] } = await supabaseAxios.get(`/horarios?select=*&id=eq.${id}`);
    if (!current) return res.status(404).json({ message: 'Horario no encontrado' });

    const newDias = p.dias || current.dias;

    // Validación: por día no pasar capacidad; extras >= 0; total día = base + extra
    // Validación: por semana, extras ≤ 12
    const byWeek = new Map(); // key = weekStartYMD, value = { extrasSum }
    for (const d of newDias) {
      const wd = isoWeekday(new Date(d.fecha));
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

      const weekStart = startOfISOWeek(new Date(d.fecha));
      const key = weekStart.toISOString().slice(0,10);
      if (!byWeek.has(key)) byWeek.set(key, { extrasSum: 0, baseSum: 0 });
      byWeek.get(key).extrasSum += extra;
      byWeek.get(key).baseSum   += base;
    }

    for (const [week, agg] of byWeek.entries()) {
      if (agg.extrasSum > 12 + 1e-6) {
        return res.status(400).json({ message: `Máximo 12h extra por semana (semana ${week}).` });
      }
      // (Opcional pero recomendado): asegúrate que la base siga en 44h
      // Si tus semanas guardadas siempre tienen lunes..domingo, esto protege que no "rompan" la base.
      if (Math.round(agg.baseSum) !== 44) {
        return res.status(400).json({ message: `Las horas base de la semana ${week} deben sumar 44h.` });
      }
    }

    // Recalcular total_horas_semana por lo que envían
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
