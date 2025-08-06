// src/routes/public.js
import { Router } from 'express';
const router = Router();
import supabase from '../services/supabase.service.js';

router.post('/consulta-horarios', async (req, res) => {
  const { cedula } = req.body;
  if (!cedula) {
    return res.status(400).send('Cédula no proporcionada.');
  }

  try {
    const { data: empleado, error: empleadoError } = await supabase
      .from("empleados")
      .select("id, nombre_completo")
      .eq("cedula", cedula)
      .maybeSingle();

    if (empleadoError || !empleado) {
      return res.status(404).send('Empleado no encontrado.');
    }

    const { data: horarios, error: horariosError } = await supabase
      .from("horarios")
      .select("tipo, fecha_inicio, fecha_fin, dias, total_horas_semana")
      .eq("empleado_id", empleado.id)
      .order("fecha_inicio", { ascending: false });

    if (horariosError) throw horariosError;

    res.status(200).json({ empleado, horarios });

  } catch (error) {
    console.error('Error en la consulta pública:', error);
    res.status(500).send('Error interno del servidor');
  }
});

export default router;