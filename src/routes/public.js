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
    }

    // 2. Obtener SOLO los horarios públicos (activos) del empleado
    const { data: horariosData, error: horariosError } = await client.get(
      `/horarios?empleado_id=eq.${empleado.id}&estado_visibilidad=eq.publico&order=fecha_inicio.desc`
    );
    if (horariosError) throw horariosError;

    // 3. Devolver el empleado y sus horarios activos
    res.json({ empleado, horarios: horariosData || [] });
  } catch (e) {
    console.error("Error en la consulta pública de horarios:", e);
    res
      .status(500)
      .json({ message: "Error en la consulta. Intenta de nuevo más tarde." });
  }
});

// POST /api/public/observaciones-stats
router.post("/observaciones-stats", async (req, res) => {
  try {
    const { empleado_ids } = req.body;

    if (!Array.isArray(empleado_ids) || empleado_ids.length === 0) {
      return res
        .status(400)
        .json({ message: "Se requiere un array de empleado_ids" });
    }

    const results = [];

    // Procesar cada empleado individualmente
    for (const empleadoId of empleado_ids) {
      try {
        const { data: obs, error: obsError } = await client.get(
          `/observaciones?select=tipo_novedad,fecha_novedad&empleado_id=eq.${empleadoId}`
        );

        if (obsError) {
          console.error(
            `Error fetching observaciones for ${empleadoId}:`,
            obsError
          );
          continue;
        }

        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        );

        // Filtrar observaciones recientes (últimos 30 días)
        const recientes = obs.filter((o) => {
          const fechaObs = new Date(o.fecha_novedad);
          return fechaObs >= thirtyDaysAgo;
        });

        // Obtener tipos únicos de novedades
        const tipos = [...new Set(obs.map((o) => o.tipo_novedad))];

        // Encontrar la fecha de la última observación
        const ultimaFecha =
          obs.length > 0
            ? obs.reduce(
                (max, o) =>
                  new Date(o.fecha_novedad) > new Date(max)
                    ? o.fecha_novedad
                    : max,
                obs[0].fecha_novedad
              )
            : null;

        results.push({
          empleado_id: empleadoId,
          total_observaciones: obs.length,
          observaciones_recientes: recientes.length,
          ultima_observacion: ultimaFecha,
          tipos_novedades: tipos,
        });
      } catch (err) {
        console.error(`Error processing empleado ${empleadoId}:`, err);
        results.push({
          empleado_id: empleadoId,
          total_observaciones: 0,
          observaciones_recientes: 0,
          ultima_observacion: null,
          tipos_novedades: [],
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Error en observaciones-stats:", error);
    res.status(500).json({
      message: "Error al obtener estadísticas de observaciones",
      error: error.message,
    });
  }
});

export default router;
