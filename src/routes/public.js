import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const client = axios.create({ baseURL: `${supabaseUrl}/rest/v1`, headers: {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`
}});

router.post('/consulta-horarios', async (req, res) => {
  const { cedula } = req.body;
  if (!cedula) return res.status(400).json({ message: 'Cédula missing' });
  try {
    // buscar empleado
    const { data: [emp] } = await client.get(
      `/empleados?select=id,nombre_completo&cedula=eq.${cedula}`
    );
    if (!emp) return res.status(404).json({ message: 'Empleado not found' });
    // buscar horarios
    const { data: horarios } = await client.get(
      `/horarios?select=tipo,fecha_inicio,fecha_fin,total_horas_semana,dias&empleado_id=eq.${emp.id}&order=fecha_inicio.desc`
    );
    res.json({ empleado: emp, horarios });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;