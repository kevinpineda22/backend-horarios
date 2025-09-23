import { supabaseAxios, storageClient } from "../services/supabaseAxios.js";
import { Buffer } from "buffer";

/**
 * Endpoint para obtener el historial completo de observaciones de un empleado.
 */
export const getObservacionesByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/observaciones?select=*&empleado_id=eq.${empleado_id}&order=fecha_creacion.desc`;
    const { data, error } = await supabaseAxios.get(url);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error("Error fetching observaciones:", e);
    res.status(500).json({ message: "Error fetching observaciones" });
  }
};

/**
 * Endpoint para crear una nueva observación para un empleado.
 */
export const createObservacion = async (req, res) => {
  const {
    empleado_id,
    observacion,
    tipo_novedad,
    documento_base64,
    file_name,
    fecha_novedad,
    horario_estudio,
  } = req.body;
  let urlPublic = null;
  try {
    // Lógica de subida de archivo a Supabase Storage
    if (documento_base64 && file_name) {
      const buf = Buffer.from(documento_base64, "base64");
      const fn = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2)}_${file_name}`;
      const { data, error } = await storageClient.storage
        .from("documentos-observaciones-ph")
        .upload(fn, buf);
      if (error) throw error;
      urlPublic = storageClient.storage
        .from("documentos-observaciones-ph")
        .getPublicUrl(data.path).data.publicUrl;
    }
    
    // Crear el payload con el nuevo campo `revisada: false`
    const payload = {
      empleado_id,
      observacion,
      tipo_novedad,
      documento_adjunto: urlPublic,
      fecha_novedad,
      horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
      revisada: false, // Nueva observación por defecto NO está revisada
    };
    
    const { data, error } = await supabaseAxios.post("/observaciones", [payload]);
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) {
    console.error("Error creating observacion:", e);
    res.status(500).json({ message: "Error creating observacion" });
  }
};

/**
 * Endpoint para actualizar una observación existente.
 */
export const updateObservacion = async (req, res) => {
  const { id } = req.params;
  const {
    observacion,
    tipo_novedad,
    documento_adjunto_existente,
    documento_base64,
    file_name,
    fecha_novedad,
    horario_estudio,
  } = req.body;
  let urlPublic = documento_adjunto_existente;
  try {
    // Lógica para actualizar/eliminar archivo adjunto
    if (documento_base64 && file_name) {
      if (documento_adjunto_existente) {
        const old = documento_adjunto_existente.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([old]);
      }
      const buf = Buffer.from(documento_base64, "base64");
      const fn = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2)}_${file_name}`;
      const { data, error } = await storageClient.storage
        .from("documentos-observaciones-ph")
        .upload(fn, buf);
      if (error) throw error;
      urlPublic = storageClient.storage
        .from("documentos-observaciones-ph")
        .getPublicUrl(data.path).data.publicUrl;
    } else if (documento_base64 === null && documento_adjunto_existente) {
      const old = documento_adjunto_existente.split("/").pop();
      await storageClient.storage
        .from("documentos-observaciones-ph")
        .remove([old]);
      urlPublic = null;
    }
    
    // El campo 'revisada' no se toca en una actualización, ya que se revisa en otro endpoint
    const payload = {
      observacion,
      tipo_novedad,
      documento_adjunto: urlPublic,
      fecha_novedad,
      horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
    };
    
    const { error } = await supabaseAxios.patch(`/observaciones?id=eq.${id}`, payload);
    if (error) throw error;
    res.json({ message: "Updated" });
  } catch (e) {
    console.error("Error updating observacion:", e);
    res.status(500).json({ message: "Error updating observacion" });
  }
};

/**
 * Endpoint para eliminar una observación.
 */
export const deleteObservacion = async (req, res) => {
  const { id } = req.params;
  try {
    // Lógica para eliminar el archivo adjunto antes de la observación
    const { data: [obs], error: fetchError } = await supabaseAxios.get(
      `/observaciones?select=documento_adjunto&id=eq.${id}`
    );
    if (fetchError) throw fetchError;
    
    if (obs?.documento_adjunto) {
      const old = obs.documento_adjunto.split("/").pop();
      await storageClient.storage
        .from("documentos-observaciones-ph")
        .remove([old]);
    }
    
    const { error: deleteError } = await supabaseAxios.delete(`/observaciones?id=eq.${id}`);
    if (deleteError) throw deleteError;
    
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("Error deleting observacion:", e);
    res.status(500).json({ message: "Error deleting observacion" });
  }
};

/**
 * Endpoint optimizado para obtener estadísticas de observaciones usando una función de la base de datos (RPC).
 */
export const getObservacionesStats = async (req, res) => {
  try {
    const { data, error } = await supabaseAxios.post('/rpc/obtener_stats_empleados');
    if (error) {
      console.error("Error detallado del RPC:", error);
      throw error;
    }
    res.json(data);
  } catch (error) {
    console.error("Error en getObservacionesStats:", error);
    res.status(500).json({
      message: "Error al obtener estadísticas de observaciones",
      error: error.message,
    });
  }
};

/**
 * Endpoint para marcar todas las observaciones no revisadas de un empleado como revisadas.
 */
export const marcarComoRevisadas = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const { error } = await supabaseAxios.patch(
      `/observaciones?empleado_id=eq.${empleado_id}&revisada=eq.false`,
      { revisada: true }
    );
    if (error) throw error;
    res.json({ message: "Observaciones marcadas como revisadas con éxito." });
  } catch (e) {
    console.error("Error al marcar observaciones como revisadas:", e);
    res.status(500).json({
      message: "Error interno al actualizar observaciones",
      error: e.message,
    });
  }
};