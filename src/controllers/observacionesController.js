import { supabaseAxios, storageClient } from "../services/supabaseAxios.js";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const getObservacionesByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/observaciones?select=*&empleado_id=eq.${empleado_id}&order=fecha_creacion.desc`;
    const { data } = await supabaseAxios.get(url);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error fetching observaciones" });
  }
};

export const createObservacion = async (req, res) => {
  const {
    empleado_id,
    observacion,
    tipo_novedad,
    documento_base64,
    file_name,
    fecha_novedad,
    horario_estudio,
    lider_id, // Ahora se envía desde el frontend
  } = req.body;
  let urlPublic = null;
  try {
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
    const payload = {
      empleado_id,
      observacion,
      tipo_novedad,
      documento_adjunto: urlPublic,
      lider_id: lider_id || null, // Usar el lider_id del body o null
      fecha_novedad,
      horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
    };
    const { data } = await supabaseAxios.post("/observaciones", [payload]);
    res.status(201).json(data[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error creating observacion" });
  }
};

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
    if (documento_base64 && file_name) {
      // borrar antiguo si existe
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
      const { data } = await storageClient.storage
        .from("documentos-observaciones-ph")
        .upload(fn, buf);
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
    const payload = {
      observacion,
      tipo_novedad,
      documento_adjunto: urlPublic,
      fecha_novedad,
      horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
    };
    await supabaseAxios.patch(`/observaciones?id=eq.${id}`, payload);
    res.json({ message: "Updated" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error updating observacion" });
  }
};

export const deleteObservacion = async (req, res) => {
  const { id } = req.params;
  try {
    // fetch adjunto
    const {
      data: [obs],
    } = await supabaseAxios.get(
      `/observaciones?select=documento_adjunto&id=eq.${id}`
    );
    if (obs.documento_adjunto) {
      const old = obs.documento_adjunto.split("/").pop();
      await storageClient.storage
        .from("documentos-observaciones-ph")
        .remove([old]);
    }
    await supabaseAxios.delete(`/observaciones?id=eq.${id}`);
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error deleting observacion" });
  }
};

export const getObservacionesStats = async (req, res) => {
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
        // Obtener observaciones
        const { data: obs, error: obsError } = await supabaseAxios.get(
          `/observaciones?select=tipo_novedad,fecha_novedad&empleado_id=eq.${empleadoId}`
        );

        if (obsError) {
          console.error(
            `Error fetching observaciones for ${empleadoId}:`,
            obsError
          );
          continue;
        }

        // Obtener última revisión
        const { data: revision, error: revError } = await supabaseAxios.get(
          `/empleado_revisiones?select=ultima_revision_observaciones&empleado_id=eq.${empleadoId}&order=fecha_revision.desc&limit=1`
        );

        const now = new Date();
        const ultimaRevision =
          revision && revision.length > 0
            ? new Date(revision[0].ultima_revision_observaciones)
            : null;

        // Filtrar observaciones recientes (posteriores a la última revisión O últimos 30 días si no hay revisión)
        let recientes;
        if (ultimaRevision) {
          recientes = obs.filter(
            (o) => new Date(o.fecha_novedad) > ultimaRevision
          );
        } else {
          const thirtyDaysAgo = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          );
          recientes = obs.filter(
            (o) => new Date(o.fecha_novedad) >= thirtyDaysAgo
          );
        }

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
        // Agregar entrada vacía para mantener consistencia
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
    console.error("Error en getObservacionesStats:", error);
    res.status(500).json({
      message: "Error al obtener estadísticas de observaciones",
      error: error.message,
    });
  }
};

// En el controller de observaciones
export const marcarEmpleadoRevisado = async (req, res) => {
  try {
    const { empleado_id } = req.body;

    // Obtener el lider_id del token JWT o de la sesión
    // Esto depende de cómo manejes la autenticación en tu backend
    const token = req.headers.authorization?.replace("Bearer ", "");
    let lider_id = null;

    if (token) {
      try {
        // Decodificar el token de Supabase para obtener el user_id
        const {
          data: { user },
          error,
        } = await supabaseAuth.auth.getUser(token);
        if (!error && user) {
          // Buscar el empleado correspondiente a este usuario
          const { data: empleado } = await supabaseAxios.get(
            `/empleados?select=id&correo_electronico=eq.${user.email}&limit=1`
          );
          if (empleado && empleado.length > 0) {
            lider_id = empleado[0].id;
          }
        }
      } catch (authError) {
        console.error("Error obteniendo usuario:", authError);
      }
    }

    if (!empleado_id) {
      return res.status(400).json({ message: "empleado_id es requerido" });
    }

    // Verificar si ya existe un registro para este empleado y líder
    const { data: existingRecord } = await supabaseAxios.get(
      `/empleado_revisiones?empleado_id=eq.${empleado_id}&lider_id=eq.${
        lider_id || "null"
      }&limit=1`
    );

    let result;
    if (existingRecord && existingRecord.length > 0) {
      // Actualizar registro existente
      result = await supabaseAxios.patch(
        `/empleado_revisiones?id=eq.${existingRecord[0].id}`,
        {
          fecha_revision: new Date().toISOString(),
          ultima_revision_observaciones: new Date().toISOString(),
        }
      );
    } else {
      // Crear nuevo registro
      result = await supabaseAxios.post("/empleado_revisiones", [
        {
          empleado_id,
          lider_id,
          fecha_revision: new Date().toISOString(),
          ultima_revision_observaciones: new Date().toISOString(),
        },
      ]);
    }

    res.json({
      message: "Empleado marcado como revisado",
      data: result.data,
    });
  } catch (error) {
    console.error("Error marcando empleado como revisado:", error);
    res.status(500).json({
      message: "Error al marcar empleado como revisado",
      error: error.message,
    });
  }
};
