// src/services/phConfigService.js
// ----------------------------------------------------------------------------
// Programador de Horarios (PH) — Servicio de configuración.
// Lee las reglas de negocio desde la BD (tablas ph_*) y las cachea en memoria.
// REGLA DE ORO: este servicio NO define valores de negocio por defecto.
// Si la configuración no existe, falla con un error claro para que el admin
// la complete desde el panel.
// ----------------------------------------------------------------------------
import { supabaseAxios } from "./supabaseAxios.js";

const CACHE_TTL_MS = 60 * 1000; // 1 minuto

let cache = { parametros: null, jornadas: null, loadedAt: 0 };

const isFresh = () =>
  cache.loadedAt > 0 && Date.now() - cache.loadedAt < CACHE_TTL_MS;

/** Invalida la caché (llamar tras crear/editar configuración desde el panel). */
export const invalidatePhConfigCache = () => {
  cache = { parametros: null, jornadas: null, loadedAt: 0 };
};

const loadParametros = async () => {
  const { data, error } = await supabaseAxios.get(
    `/ph_parametros_globales?select=clave,valor`
  );
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.clave] = row.valor;
  return map;
};

const loadJornadas = async () => {
  const { data, error } = await supabaseAxios.get(
    `/ph_jornadas?select=*&activo=eq.true`
  );
  if (error) throw error;
  return data || [];
};

const ensureLoaded = async () => {
  if (isFresh() && cache.parametros && cache.jornadas) return;
  const [parametros, jornadas] = await Promise.all([
    loadParametros(),
    loadJornadas(),
  ]);
  cache = { parametros, jornadas, loadedAt: Date.now() };
};

// --- Getters ---------------------------------------------------------------

export const getParametros = async () => {
  await ensureLoaded();
  return cache.parametros;
};

export const getParametro = async (clave) => {
  await ensureLoaded();
  return cache.parametros[clave];
};

export const getJornadas = async () => {
  await ensureLoaded();
  return cache.jornadas;
};

export const getJornadaById = async (id) => {
  await ensureLoaded();
  return cache.jornadas.find((j) => j.id === id) || null;
};

// --- Validación de configuración completa ----------------------------------

/**
 * Error semántico para cuando el admin todavía no configuró el sistema.
 * Se traduce a HTTP 409 en los controladores.
 */
export class PhConfigIncompletaError extends Error {
  constructor(faltantes) {
    super(
      `Configuración del Programador de Horarios incompleta. ` +
        `Defina en el panel: ${faltantes.join(", ")}.`
    );
    this.name = "PhConfigIncompletaError";
    this.faltantes = faltantes;
    this.statusCode = 409;
  }
}

// Claves que el admin DEBE definir antes de generar horarios nuevos.
// (No tienen valor por defecto: son decisiones de negocio del administrador.)
// Ver docs/CONTRATO-CONFIGURACION-PH.md
const PARAMETROS_REQUERIDOS = [
  "limite_legal_semanal",
  "limite_extra_semanal",
  "limite_total_semanal",
  "max_extra_por_dia",
  "max_extra_por_quincena",
  "limite_legal_diario",
  "horas_festivo_trabajado",
  "modelo_quincena",
  "descansos",
];

/**
 * Lanza PhConfigIncompletaError si falta configuración mínima.
 * Úsese al inicio de la generación/edición de horarios.
 */
export const assertConfigCompleta = async () => {
  await ensureLoaded();
  const faltantes = [];

  if (!cache.jornadas || cache.jornadas.length === 0) {
    faltantes.push("al menos una jornada");
  }
  for (const clave of PARAMETROS_REQUERIDOS) {
    const v = cache.parametros?.[clave];
    if (v === undefined || v === null) faltantes.push(clave);
  }

  if (faltantes.length > 0) throw new PhConfigIncompletaError(faltantes);
};

// --- Objeto `config` normalizado para el motor (schedule.js) ---------------

/**
 * Arma el objeto `config` que consumirá el motor de horarios, leyendo los
 * parámetros y jornadas desde la BD. NO inventa valores: si falta algo,
 * llamar antes a assertConfigCompleta() para fallar con un mensaje claro.
 * Ver docs/CONTRATO-CONFIGURACION-PH.md (sección 4).
 */
export const buildScheduleConfig = async () => {
  await ensureLoaded();
  const p = cache.parametros || {};
  const legalDiario = p.limite_legal_diario || {};

  return {
    limites: {
      legalSemanal: p.limite_legal_semanal,
      extraSemanal: p.limite_extra_semanal,
      totalSemanal: p.limite_total_semanal,
      maxExtraPorDia: p.max_extra_por_dia,
      maxExtraPorQuincena: p.max_extra_por_quincena,
      legalDiarioSemana: legalDiario.semana,
      legalDiarioSabado: legalDiario.sabado,
      horasFestivoTrabajado: p.horas_festivo_trabajado,
    },
    descansos: Array.isArray(p.descansos) ? p.descansos : [],
    modeloQuincena: p.modelo_quincena || null,
    jornadas: cache.jornadas || [],
  };
};

/**
 * Cap legal del día según el día ISO (1=Lun … 7=Dom), leído del `config`.
 * Helper puro: recibe el config ya construido por buildScheduleConfig().
 */
export const capLegalDia = (config, isoWeekday) => {
  if (isoWeekday === 6) return Number(config?.limites?.legalDiarioSabado ?? 0);
  if (isoWeekday >= 1 && isoWeekday <= 5)
    return Number(config?.limites?.legalDiarioSemana ?? 0);
  return 0; // domingo
};
