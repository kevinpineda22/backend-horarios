// src/routes/public.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import Holidays from 'date-holidays';
dotenv.config();

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const client = axios.create({ baseURL: `${supabaseUrl}/rest/v1`, headers: {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`
}});

// (ya existente)
router.post('/consulta-horarios', async (req, res) => { /* ... */ });

// NUEVO: GET /api/public/festivos?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/festivos', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'start y end son requeridos (YYYY-MM-DD)' });

    const s = new Date(start), e = new Date(end);
    const years = new Set([s.getFullYear(), e.getFullYear()]);
    const hd = new Holidays('CO');
    const out = [];

    for (const y of years) {
      const list = hd.getHolidays(y) || [];
      for (const h of list) {
        const ymd = h.date.slice(0,10); // YYYY-MM-DD
        const d = new Date(`${ymd}T00:00:00`);
        if (d >= s && d <= e) out.push({ fecha: ymd, nombre: h.name });
      }
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error obteniendo festivos' });
  }
});

export default router;
