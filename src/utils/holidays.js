// src/utils/holidays.js
import Holidays from 'date-holidays';

const pad = (n) => String(n).padStart(2, '0');

export function getHolidaySet(startISO, endISO) {
  const start = new Date(startISO);
  const end   = new Date(endISO);
  const years = new Set([start.getFullYear(), end.getFullYear()]);
  const hd = new Holidays('CO');

  const set = new Set();
  for (const y of years) {
    const list = hd.getHolidays(y) || [];
    for (const h of list) {
      // h.date suele venir en ISO: "2025-01-01 00:00:00"
      const ymd = `${h.date.slice(0,4)}-${h.date.slice(5,7)}-${h.date.slice(8,10)}`;
      const d = new Date(`${ymd}T00:00:00`);
      if (d >= start && d <= end) set.add(ymd);
    }
  }
  return set;
}
