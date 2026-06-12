// src/utils/quincena.js
// Quincenas de nómina: primera = días 1–15, segunda = día 16 al fin de mes.
// (Spec 4.2: el tope de horas extra se controla por quincena.)

const pad = (n) => String(n).padStart(2, "0");

// Devuelve { inicio, fin } en formato YYYY-MM-DD para la quincena que contiene `fecha`.
export const getQuincenaRange = (fecha) => {
  if (typeof fecha !== "string") return null;
  const ymd = fecha.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  if (d <= 15) {
    return { inicio: `${y}-${pad(m)}-01`, fin: `${y}-${pad(m)}-15` };
  }
  // Date.UTC(y, m, 0) con m en base 1 => último día del mes m.
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { inicio: `${y}-${pad(m)}-16`, fin: `${y}-${pad(m)}-${pad(ultimoDia)}` };
};
