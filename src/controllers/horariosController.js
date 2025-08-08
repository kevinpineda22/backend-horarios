import { supabaseAxios } from '../services/supabaseAxios.js';

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
  const p = req.body;
  p.lider_id = req.user.id;
  // cálculo de fecha_inicio/fin y total_horas por frontend ya enviado
  try {
    const { data } = await supabaseAxios.post(
      '/horarios', [p]
    );
    res.status(201).json(data[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error creating horario' });
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    await supabaseAxios.patch(
      `/horarios?id=eq.${id}`, p
    );
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