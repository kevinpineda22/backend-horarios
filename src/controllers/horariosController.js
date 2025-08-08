// src/controllers/horariosController.js
import { supabaseAxios } from '../services/supabaseAxios.js';
import { generateScheduleForRange } from '../utils/schedule.js';

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
    const { empleado_id, fecha_inicio, fecha_fin } = req.body;
    const lider_id = req.user.id;
    const extras = 12; // Valor fijo de 12 horas extra

    // Genera un arreglo de horarios, uno por cada semana en el rango
    const horariosSemanales = generateScheduleForRange(fecha_inicio, fecha_fin, extras);

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
    res.status(500).json({ message: 'Error creating horario' });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    await supabaseAxios.patch(`/horarios?id=eq.${id}`, p);
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