// src/controllers/phConfigController.js
// ----------------------------------------------------------------------------
// Programador de Horarios (PH) — Controlador del panel de configuración.
// CRUD sobre las tablas ph_* para que el ADMIN gestione todo desde el panel,
// sin tocar SQL ni código. Cada escritura invalida la caché de phConfigService.
// ----------------------------------------------------------------------------
import { supabaseAxios } from "../services/supabaseAxios.js";
import { invalidatePhConfigCache } from "../services/phConfigService.js";

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

export const listSedeConfig = async (req, res) => {
  const { sede_id } = req.params;
  try {
    const { data, error } = await supabaseAxios.get(
      `/ph_sede_config?select=*,ph_jornadas(nombre)&sede_id=eq.${sede_id}`
    );
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    handleError(res, e, "Error listando configuración de sede");
  }
};

// Upsert cupos: { sede_id, jornada_id, cupos }
export const upsertSedeConfig = async (req, res) => {
  const { sede_id, jornada_id, cupos } = req.body;
  if (!sede_id || !jornada_id || cupos == null) {
    return res
      .status(400)
      .json({ message: "sede_id, jornada_id y cupos son requeridos." });
  }
  try {
    const { data, error } = await supabaseAxios.post(
      `/ph_sede_config?on_conflict=sede_id,jornada_id`,
      { sede_id, jornada_id, cupos },
      { headers: { Prefer: "resolution=merge-duplicates,return=representation" } }
    );
    if (error) throw error;
    res.status(200).json(data?.[0] || { sede_id, jornada_id, cupos });
  } catch (e) {
    handleError(res, e, "Error guardando cupos de sede");
  }
};

// ========================= ASIGNACIÓN DE JORNADA ============================

export const listAsignaciones = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const { data, error } = await supabaseAxios.get(
      `/ph_asignacion_jornada?select=*,ph_jornadas(nombre,hora_entrada,hora_salida)&empleado_id=eq.${empleado_id}&order=vigente_desde.desc`
    );
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    handleError(res, e, "Error listando asignaciones");
  }
};

// Asigna un turno cerrando la asignación vigente anterior. Body: { empleado_id, jornada_id, vigente_desde }
export const asignarJornada = async (req, res) => {
  const { empleado_id, jornada_id, vigente_desde } = req.body;
  if (!empleado_id || !jornada_id || !vigente_desde) {
    return res.status(400).json({
      message: "empleado_id, jornada_id y vigente_desde son requeridos.",
    });
  }
  try {
    // Cerrar la asignación vigente anterior (vigente_hasta = vigente_desde - 1 día sería ideal;
    // por simplicidad la cerramos en la fecha de inicio de la nueva).
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
    res.status(201).json(data?.[0] || payload);
  } catch (e) {
    handleError(res, e, "Error asignando jornada");
  }
};

// ===================== DESTINATARIOS DE NOTIFICACIÓN ========================

export const listDestinatarios = async (req, res) => {
  try {
    const { tipo_novedad } = req.query;
    let url = `/ph_notificacion_destinatarios?select=*&order=tipo_novedad.asc`;
    if (tipo_novedad) url += `&tipo_novedad=eq.${encodeURIComponent(tipo_novedad)}`;
    const { data, error } = await supabaseAxios.get(url);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    handleError(res, e, "Error listando destinatarios");
  }
};

export const createDestinatario = async (req, res) => {
  const { tipo_novedad, correo, nombre, activo } = req.body;
  if (!tipo_novedad || !correo) {
    return res
      .status(400)
      .json({ message: "tipo_novedad y correo son requeridos." });
  }
  try {
    const payload = {
      tipo_novedad,
      correo,
      nombre: nombre || null,
      activo: activo ?? true,
    };
    const { data, error } = await supabaseAxios.post(
      `/ph_notificacion_destinatarios?on_conflict=tipo_novedad,correo`,
      payload,
      { headers: { Prefer: "resolution=merge-duplicates,return=representation" } }
    );
    if (error) throw error;
    res.status(201).json(data?.[0] || payload);
  } catch (e) {
    handleError(res, e, "Error creando destinatario");
  }
};

export const deleteDestinatario = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAxios.delete(
      `/ph_notificacion_destinatarios?id=eq.${id}`
    );
    if (error) throw error;
    res.json({ message: "Destinatario eliminado." });
  } catch (e) {
    handleError(res, e, "Error eliminando destinatario");
  }
};
