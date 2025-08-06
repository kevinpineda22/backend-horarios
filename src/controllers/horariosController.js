// src/controllers/horariosController.js
import supabase from '../services/supabase.service.js';

export const getHorariosByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const { data, error } = await supabase
      .from("horarios")
      .select("*")
      .eq("empleado_id", empleado_id)
      .order("fecha_inicio", { ascending: false });
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).send('Error al obtener horarios.');
  }
};

export const createHorario = async (req, res) => {
  const payload = req.body;
  payload.lider_id = req.user.id;
  try {
    const { error } = await supabase.from("horarios").insert([payload]);
    if (error) throw error;
    res.status(201).send('Horario guardado.');
  } catch (error) {
    res.status(500).send('Error al guardar horario.');
  }
};

export const updateHorario = async (req, res) => {
  const { id } = req.params;
  const payload = req.body;
  try {
    const { error } = await supabase.from("horarios").update(payload).eq("id", id);
    if (error) throw error;
    res.status(200).send('Horario actualizado.');
  } catch (error) {
    res.status(500).send('Error al actualizar horario.');
  }
};

export const deleteHorario = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase.from("horarios").delete().eq("id", id);
    if (error) throw error;
    res.status(200).send('Horario eliminado.');
  } catch (error) {
    res.status(500).send('Error al eliminar horario.');
  }
};