// src/controllers/horariosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import { generateScheduleRandomRange } from '../utils/schedule.js';

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/horarios?select=*&empleado_id=eq.${empleado_id}&order=fecha_inicio.desc`;
    const { data } = await supabaseAxios.get(url);
    res.json(data || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error fetching horarios' });
  }
};

export const createHorario = async (req, res) => {
  try {
    const { empleado_id, fecha_inicio, fecha_fin, working_weekdays } = req.body;
    const lider_id = req.user?.id || null;

    if (!empleado_id || !fecha_inicio || !fecha_fin || !Array.isArray(working_weekdays) || working_weekdays.length === 0) {
      return res.status(400).json({ message: 'Faltan parámetros requeridos.' });
    }

    // Genera semanas aleatorias con 8–10h L–V y 7h sábado (con breaks visuales)
    const semanas = generateScheduleRandomRange(fecha_inicio, fecha_fin, working_weekdays);

    // Inserta semanas
    const payload = semanas.map(s => ({
      empleado_id,
      lider_id,
      tipo: 'semanal',
      fecha_inicio: s.fecha_inicio,
      fecha_fin: s.fecha_fin,
      dias: s.dias,
      total_horas_semana: s.total_horas_semana
    }));

    const { data, error } = await supabaseAxios.post('/horarios', payload);
    if (error) throw error;

    res.status(201).json(data || []);
  } catch (e) {
    console.error('Error creating horario:', e);
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
    const totalSemana = (newDias || []).reduce((s,x)=> s + Number(x.horas || 0), 0);

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
