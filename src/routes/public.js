import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import Holidays from "date-holidays";
dotenv.config();

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const client = axios.create({
  baseURL: `${supabaseUrl}/rest/v1`,
  headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
});

// GET /api/public/festivos?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get("/festivos", (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res
        .status(400)
        .json({ message: "start y end son requeridos (YYYY-MM-DD)" });
    }

    const s = new Date(start),
      e = new Date(end);
    const years = new Set([s.getFullYear(), e.getFullYear()]);

    const hd = new Holidays("CO");
    if (typeof hd.setLanguages === "function") {
      hd.setLanguages("es");
    }

    const out = [];
    for (const y of years) {
      const list = hd.getHolidays(y) || [];
      for (const h of list) {
        const ymd = h.date.slice(0, 10);
        const d = new Date(`${ymd}T00:00:00`);
        if (d >= s && d <= e) {
          out.push({
            fecha: ymd,
            nombre: h.name,
            tipo: h.type || null,
            trasladado: !!h.substitute,
            regla: h.rule || null,
          });
        }
      }
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error obteniendo festivos" });
  }
});

// NUEVA RUTA PARA LA CONSULTA PÚBLICA DE HORARIOS
// POST /api/public/consulta-horarios
router.post("/consulta-horarios", async (req, res) => {
  const { cedula } = req.body;
  if (!cedula) {
    return res.status(400).json({ message: "La cédula es requerida." });
  }

  try {
    // 1. Buscar al empleado por cédula
    const { data: empleadosData, error: empleadosError } = await client.get(
      `/empleados?cedula=eq.${cedula}&select=id,nombre_completo,estado`
    );
    if (empleadosError) throw empleadosError;

    const empleado = empleadosData[0];
    if (!empleado) {
      return res.status(404).json({ message: "Empleado no encontrado." });
    }
    if (empleado.estado !== "activo") {
      return res
        .status(403)
        .json({ message: "El empleado se encuentra inactivo." });
    } // 2. Obtener los horarios del empleado, filtrando por 'público'

    const { data: horariosData, error: horariosError } = await client.get(
      `/horarios?empleado_id=eq.${empleado.id}&estado_visibilidad=eq.publico&order=fecha_inicio.desc`
    );
    if (horariosError) throw horariosError; // 3. Devolver el empleado y sus horarios

    res.json({ empleado, horarios: horariosData || [] });
  } catch (e) {
    console.error("Error en la consulta pública de horarios:", e);
    res
      .status(500)
      .json({ message: "Error en la consulta. Intenta de nuevo más tarde." });
  }
});

export default router;
