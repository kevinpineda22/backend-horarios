// src/controllers/phConfigController.js
// ----------------------------------------------------------------------------
// Programador de Horarios (PH) — Controlador del panel de configuración.
// CRUD sobre las tablas ph_* para que el ADMIN gestione todo desde el panel,
// sin tocar SQL ni código. Cada escritura invalida la caché de phConfigService.
// ----------------------------------------------------------------------------
import { supabaseAxios } from "../services/supabaseAxios.js";
import { invalidatePhConfigCache } from "../services/phConfigService.js";
import { DEFAULT_SST_EMAILS, TIPO_CRITICA } from "../config/notificationDefaults.js";

const REPRESENTATION = { headers: { Prefer: "return=representation" } };

const handleError = (res, e, msg) => {
  console.error(`${msg}:`, e?.response?.data || e?.message || e);
  res
    .status(500)
    .json({ message: msg, error: e?.response?.data?.message || e?.message });
};

// ============================ PARÁMETROS GLOBALES ===========================

export const listParametros = async (_req, res) => {
  try {
    const { data, error } = await supabaseAxios.get(
      `/ph_parametros_globales?select=*&order=clave.asc`
    );
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    handleError(res, e, "Error listando parámetros");
  }
};

// Upsert por clave (crea o actualiza). Body: { clave, valor, descripcion? }
export const upsertParametro = async (req, res) => {
  const { clave, valor, descripcion } = req.body;
  if (!clave || valor === undefined) {
    return res.status(400).json({ message: "clave y valor son requeridos." });
  }
  try {
    const payload = {
      clave,
      valor,
      descripcion: descripcion ?? null,
      actualizado_en: new Date().toISOString(),
      actualizado_por: req.user?.email || null,
    };
    const { data, error } = await supabaseAxios.post(
      `/ph_parametros_globales?on_conflict=clave`,
      payload,
      { headers: { Prefer: "resolution=merge-duplicates,return=representation" } }
    );
    if (error) throw error;
    invalidatePhConfigCache();
    res.status(200).json(data?.[0] || payload);
  } catch (e) {
    handleError(res, e, "Error guardando parámetro");
  }
};

export const deleteParametro = async (req, res) => {
  const { clave } = req.params;
  try {
    const { error } = await supabaseAxios.delete(
      `/ph_parametros_globales?clave=eq.${clave}`
    );
    if (error) throw error;
    invalidatePhConfigCache();
    res.json({ message: "Parámetro eliminado." });
  } catch (e) {
    handleError(res, e, "Error eliminando parámetro");
  }
};

// ================================ JORNADAS ==================================

export const listJornadas = async (req, res) => {
  try {
    const { sede_id } = req.query;
    let url = `/ph_jornadas?select=*&order=nombre.asc`;
    if (sede_id) url += `&or=(sede_id.eq.${sede_id},sede_id.is.null)`;
    const { data, error } = await supabaseAxios.get(url);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    handleError(res, e, "Error listando jornadas");
  }
};

export const createJornada = async (req, res) => {
  const {
    nombre,
    sede_id,
    hora_entrada,
    hora_salida,
    sabado_entrada,
    sabado_salida,
    dias_aplica,
    capacidad_diaria,
    activo,
  } = req.body;
  if (!nombre || !hora_entrada || !hora_salida || !Array.isArray(dias_aplica)) {
    return res.status(400).json({
      message: "nombre, hora_entrada, hora_salida y dias_aplica son requeridos.",
    });
  }
  try {
    const payload = {
      nombre,
      sede_id: sede_id || null,
      hora_entrada,
      hora_salida,
      sabado_entrada: sabado_entrada || null,
      sabado_salida: sabado_salida || null,
      dias_aplica,
      capacidad_diaria: capacidad_diaria ?? null,
      activo: activo ?? true,
      creado_por: req.user?.email || null,
    };
    const { data, error } = await supabaseAxios.post(
      `/ph_jornadas`,
      payload,
      REPRESENTATION
    );
    if (error) throw error;
    invalidatePhConfigCache();
    res.status(201).json(data?.[0] || payload);
  } catch (e) {
    handleError(res, e, "Error creando jornada");
  }
};

export const updateJornada = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseAxios.patch(
      `/ph_jornadas?id=eq.${id}`,
      req.body,
      REPRESENTATION
    );
    if (error) throw error;
    invalidatePhConfigCache();
    res.json(data?.[0] || { message: "Jornada actualizada." });
  } catch (e) {
    handleError(res, e, "Error actualizando jornada");
  }
};

export const deleteJornada = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAxios.delete(`/ph_jornadas?id=eq.${id}`);
    if (error) throw error;
    invalidatePhConfigCache();
    res.json({ message: "Jornada eliminada." });
  } catch (e) {
    handleError(res, e, "Error eliminando jornada");
  }
};

// ============================ CONFIG POR SEDE ===============================

// Lista todas las sedes con sus cupos agregados por jornada.
// Respuesta: [{ id, nombre, ..., cupos_por_turno: { [jornada_id]: cupos } }]
// Hacemos dos queries y mergeamos en JS para no depender de una FK declarada
// en PostgREST entre ph_sede_config y sedes.
export const listSedesConCupos = async (_req, res) => {
  try {
    const [sedesRes, cfgRes] = await Promise.all([
      supabaseAxios.get(`/sedes?select=*&order=nombre.asc`),
      supabaseAxios.get(`/ph_sede_config?select=sede_id,jornada_id,cupos`),
    ]);
    const sedes = sedesRes.data || [];
    const configs = cfgRes.data || [];
    const bySede = configs.reduce((acc, c) => {
      (acc[c.sede_id] ||= {})[c.jornada_id] = c.cupos;
      return acc;
    }, {});
    res.json(sedes.map((s) => ({ ...s, cupos_por_turno: bySede[s.id] || {} })));
  } catch (e) {
    handleError(res, e, "Error listando sedes");
  }
};

// Guarda todos los cupos de una sede de una sola vez.
// Body: { cupos_por_turno: { [jornada_id]: cantidad } }
export const updateSedeCupos = async (req, res) => {
  const { id: sede_id } = req.params;
  const { cupos_por_turno } = req.body;
  if (!cupos_por_turno || typeof cupos_por_turno !== "object") {
    return res.status(400).json({ message: "cupos_por_turno es requerido." });
  }
  try {
    const rows = Object.entries(cupos_por_turno).map(([jornada_id, cupos]) => ({
      sede_id,
      jornada_id,
      cupos: Number(cupos) || 0,
    }));
    if (rows.length) {
      const { error } = await supabaseAxios.post(
        `/ph_sede_config?on_conflict=sede_id,jornada_id`,
        rows,
        { headers: { Prefer: "resolution=merge-duplicates,return=representation" } }
      );
      if (error) throw error;
    }
    res.status(200).json({ message: "Cupos actualizados.", sede_id, cupos_por_turno });
  } catch (e) {
    handleError(res, e, "Error guardando cupos de sede");
  }
};

// ================= ASIGNACIÓN DE JORNADA (TURNO BASE) =======================
// Cada colaborador tiene un turno base (07-16 / 09-18) con historial de
// vigencia (spec 3.1 / 8). La distribución 2+2 por sede se valida con ALERTA
// BLANDA: no bloquea, solo avisa cuando se supera el cupo configurado (2.2).

// Jornada base vigente de un colaborador (o null). Usada por el motor de horarios.
export const getJornadaBaseVigente = async (empleadoId) => {
  const { data, error } = await supabaseAxios.get(
    `/ph_asignacion_jornada?select=*,ph_jornadas(*)&empleado_id=eq.${empleadoId}&vigente_hasta=is.null&order=vigente_desde.desc&limit=1`
  );
  if (error) throw error;
  return data?.[0] || null;
};

export const listAsignaciones = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const { data, error } = await supabaseAxios.get(
      `/ph_asignacion_jornada?select=*,ph_jornadas(nombre,hora_entrada,hora_salida,sabado_entrada,sabado_salida)&empleado_id=eq.${empleado_id}&order=vigente_desde.desc`
    );
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    handleError(res, e, "Error listando asignaciones");
  }
};

// Compara los colaboradores con turno vigente en la sede contra el cupo
// configurado. Devuelve { cupo, ocupados, excede } o null si no aplica.
const evaluarCupoSede = async (sedeId, jornadaId) => {
  if (!sedeId) return null;
  const [empRes, cupoRes] = await Promise.all([
    supabaseAxios.get(`/empleados?select=id&sede_id=eq.${sedeId}`),
    supabaseAxios.get(
      `/ph_sede_config?select=cupos&sede_id=eq.${sedeId}&jornada_id=eq.${jornadaId}`
    ),
  ]);
  const ids = (empRes.data || []).map((e) => e.id);
  if (ids.length === 0) return null;
  const { data: asigs } = await supabaseAxios.get(
    `/ph_asignacion_jornada?select=empleado_id&jornada_id=eq.${jornadaId}&vigente_hasta=is.null&empleado_id=in.(${ids.join(
      ","
    )})`
  );
  const ocupados = (asigs || []).length;
  const cupo = cupoRes.data?.[0]?.cupos ?? null;
  return { cupo, ocupados, excede: cupo != null && ocupados > cupo };
};

// Asigna un turno cerrando la vigente anterior. Body: { empleado_id, jornada_id, vigente_desde }
// Responde { asignacion, alerta } — alerta != null si rompe la distribución 2+2.
export const asignarJornada = async (req, res) => {
  const { empleado_id, jornada_id, vigente_desde } = req.body;
  if (!empleado_id || !jornada_id || !vigente_desde) {
    return res.status(400).json({
      message: "empleado_id, jornada_id y vigente_desde son requeridos.",
    });
  }
  try {
    // Cerrar la asignación vigente anterior en la fecha de inicio de la nueva.
    await supabaseAxios.patch(
      `/ph_asignacion_jornada?empleado_id=eq.${empleado_id}&vigente_hasta=is.null`,
      { vigente_hasta: vigente_desde }
    );
    const payload = {
      empleado_id,
      jornada_id,
      vigente_desde,
      vigente_hasta: null,
      creado_por: req.user?.email || null,
    };
    const { data, error } = await supabaseAxios.post(
      `/ph_asignacion_jornada`,
      payload,
      REPRESENTATION
    );
    if (error) throw error;

    // Alerta blanda 2+2 (best-effort: si falla, no bloquea la asignación).
    let alerta = null;
    try {
      const { data: emp } = await supabaseAxios.get(
        `/empleados?select=sede_id&id=eq.${empleado_id}`
      );
      const cupo = await evaluarCupoSede(emp?.[0]?.sede_id, jornada_id);
      if (cupo?.excede) {
        alerta = `Atención: este turno ya tiene ${cupo.ocupados} colaboradores con cupo ${cupo.cupo} en la sede. Rompe la distribución configurada.`;
      }
    } catch (_) {
      /* la alerta es informativa, no debe tumbar la asignación */
    }

    res.status(201).json({ asignacion: data?.[0] || payload, alerta });
  } catch (e) {
    handleError(res, e, "Error asignando jornada");
  }
};

// ===================== DESTINATARIOS DE NOTIFICACIÓN ========================

// Lista plana de correos que reciben novedades críticas (Incapacidades /
// Restricciones). Si la tabla aún no fue configurada, devolvemos los
// destinatarios por defecto para que el panel refleje la verdad actual.
// Respuesta: { emails: ["a@x.com", ...] }
export const listDestinatarios = async (_req, res) => {
  try {
    const { data, error } = await supabaseAxios.get(
      `/ph_notificacion_destinatarios?select=correo&tipo_novedad=eq.${TIPO_CRITICA}&order=correo.asc`
    );
    if (error) throw error;
    const emails = (data || []).map((r) => r.correo).filter(Boolean);
    res.json({ emails: emails.length ? emails : DEFAULT_SST_EMAILS });
  } catch (e) {
    handleError(res, e, "Error listando destinatarios");
  }
};

// Reemplaza la lista completa de destinatarios críticos. Body: { emails: [...] }
// Estrategia delete+insert: si algo fallara, la tabla queda vacía y el envío
// degrada al fallback por defecto (nunca a "sin destinatarios").
export const replaceDestinatarios = async (req, res) => {
  const { emails } = req.body;
  if (!Array.isArray(emails)) {
    return res.status(400).json({ message: "emails (array) es requerido." });
  }
  try {
    const limpios = [
      ...new Set(
        emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      ),
    ];
    const { error: delError } = await supabaseAxios.delete(
      `/ph_notificacion_destinatarios?tipo_novedad=eq.${TIPO_CRITICA}`
    );
    if (delError) throw delError;
    if (limpios.length) {
      const rows = limpios.map((correo) => ({
        tipo_novedad: TIPO_CRITICA,
        correo,
        activo: true,
      }));
      const { error } = await supabaseAxios.post(
        `/ph_notificacion_destinatarios`,
        rows,
        REPRESENTATION
      );
      if (error) throw error;
    }
    res.json({ emails: limpios });
  } catch (e) {
    handleError(res, e, "Error guardando destinatarios");
  }
};
