// src/utils/holidays.js
import Holidays from 'date-holidays';
import { parseISO, isValid } from 'date-fns';

// Helper para parsear fechas YYYY-MM-DD a objetos Date UTC
const parseDateOnlyUTC = (value) => {
    if (!value) return null;
    if (value instanceof Date && isValid(value)) {
        const date = new Date(value);
        date.setUTCHours(0, 0, 0, 0);
        return date;
    }
    const strValue = `${value}`.trim();
    if (!strValue) return null;
    const normalized = strValue.length > 10 ? strValue.slice(0, 10) : strValue;
    const parsed = parseISO(normalized + 'T00:00:00Z'); // Parsear como UTC
    return isValid(parsed) ? parsed : null;
};

export function getHolidaySet(startISO, endISO) { // Devuelve un Map
    const start = parseDateOnlyUTC(startISO); // <--- Variable 'start'
    const end = parseDateOnlyUTC(endISO);     // <--- Variable 'end'
    
    if (!start || !end) {
        console.error("Fechas inválidas para getHolidaySet", startISO, endISO);
        return new Map(); // Devolver mapa vacío
    }

    const years = new Set([start.getUTCFullYear(), end.getUTCFullYear()]);
    const hd = new Holidays('CO');
    if (typeof hd.setLanguages === "function") {
        hd.setLanguages("es");
    }

    const map = new Map();
    for (const y of years) {
        const list = hd.getHolidays(y) || [];
        for (const h of list) {
            const ymd = h.date.slice(0, 10);
            const d = parseDateOnlyUTC(ymd);
            
            // --- ¡AQUÍ ESTÁ LA LÍNEA CORREGIDA! ---
            if (d && d >= start && d <= end) { // <-- Usar 'start' y 'end'
                map.set(ymd, h);
            }
        }
    }
    return map;
}