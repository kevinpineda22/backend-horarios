// src/routes/public.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import Holidays from 'date-holidays';
dotenv.config();

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const client = axios.create({
  baseURL: `${supabaseUrl}/rest/v1`,
  headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
});

// ... (tu ruta /consulta-horarios se mantiene)

// GET /api/public/festivos?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/festivos', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: 'start y end son requeridos (YYYY-MM-DD)' });
    }

    const s = new Date(start), e = new Date(end);
    const years = new Set([s.getFullYear(), e.getFullYear()]);

    const hd = new Holidays('CO');
    // 🔤 forzar nombres en español (siempre que el país tenga traducción)
    if (typeof hd.setLanguages === 'function') {
      hd.setLanguages('es');
    }

    const out = [];
    for (const y of years) {
      const list = hd.getHolidays(y) || [];
      for (const h of list) {
        // h.date formato ISO “YYYY-MM-DD …”
        const ymd = h.date.slice(0, 10);
        const d = new Date(`${ymd}T00:00:00`);
        if (d >= s && d <= e) {
          out.push({
            fecha: ymd,
            nombre: h.name,          // ← razón (en español si disponible)
            tipo: h.type || null,    // 'public', 'bank', 'observance', etc.
            trasladado: !!h.substitute,
            regla: h.rule || null    // p.ej. "monday after 2025-01-06"
          });
        }
      }
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error obteniendo festivos' });
  }
});

export default router;
