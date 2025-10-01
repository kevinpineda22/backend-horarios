import { supabaseAxios, storageClient } from "../services/supabaseAxios.js";
import { Buffer } from "buffer";
import { sendEmail } from "../services/emailService.js"; // Importar el servicio de email

// CRÍTICA: Definir los correos de destino en el backend (no en el frontend)
const NOTIFICATION_EMAILS = [
  "johanmerkahorro777@gmail.com",
  "juanmerkahorro@gmail.com",
];

// Helper para subir archivos y devolver la URL
const uploadFileAndGetUrl = async (
  base64,
  fileName,
  bucketName = "documentos-observaciones-ph"
) => {
  if (!base64 || !fileName) return null;

  // Si ya es una URL, la devolvemos (usado en la edición)
  if (typeof base64 === "string" && base64.startsWith("http")) return base64;

  const buf = Buffer.from(base64, "base64");
  // Usamos un nombre único para evitar colisiones
  const fn = `${Date.now()}_${Math.random()
    .toString(36)
    .substr(2)}_${fileName}`;

  // Subir el buffer al storage
  const { data, error } = await storageClient.storage
    .from(bucketName)
    .upload(fn, buf, { upsert: true });

  if (error) throw new Error(`Error al subir archivo: ${error.message}`);

  // Obtener la URL pública
  return storageClient.storage.from(bucketName).getPublicUrl(data.path).data
    .publicUrl;
};

// **NUEVA FUNCIÓN DE VALIDACIÓN ESTRICTA DEL LADO DEL SERVIDOR**
const validateIncapacidadPayload = (payload) => {
  const {
    sub_tipo_novedad,
    dias_incapacidad,
    incapacidad_base64,
    historia_base64,
    documento_incapacidad,
    documento_historia_clinica,
  } = payload;

  // Función helper para verificar si un documento existe (nuevo Base64 o URL existente)
  const documentExists = (base64, existingUrl) => {
    return (
      (base64 && base64.length > 0 && !base64.startsWith("http")) ||
      (existingUrl && existingUrl.length > 0)
    );
  };

  if (!sub_tipo_novedad)
    return "El subtipo de incapacidad (Incidente/Enfermedad) es obligatorio.";

  if (sub_tipo_novedad === "Incidente de Trabajo") {
    if (!documentExists(incapacidad_base64, documento_incapacidad))
      return "Falta el archivo de Incapacidad (obligatorio para Incidente de Trabajo).";
    if (!documentExists(historia_base64, documento_historia_clinica))
      return "Falta el archivo de Historia Clínica (obligatorio para Incidente de Trabajo).";
  }

  if (sub_tipo_novedad === "Enfermedad General") {
    if (!dias_incapacidad)
      return "Falta indicar la duración de la Enfermedad General.";

    if (dias_incapacidad === "Mayor a 3 días") {
      if (!documentExists(incapacidad_base64, documento_incapacidad))
        return "Falta el archivo de Incapacidad (obligatorio).";
      if (!documentExists(historia_base64, documento_historia_clinica))
        return "Falta el archivo de Historia Clínica (obligatorio).";
    }

    if (dias_incapacidad === "Menor a 3 días") {
      if (!documentExists(incapacidad_base64, documento_incapacidad))
        return "Falta el archivo de Incapacidad (obligatorio).";
      // Historia Clínica es opcional para este caso.
    }
  }

  return null;
};

/**
 * Endpoint para obtener el historial completo de observaciones de un empleado.
 */
export const getObservacionesByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    // Seleccionamos todos los nuevos campos para que el frontend los pueda leer
    // Asegúrate de que 'documento_incapacidad' y 'documento_historia_clinica' existan en la tabla observaciones
    const url = `/observaciones?select=*,sub_tipo_novedad,dias_incapacidad,documento_incapacidad,documento_historia_clinica&empleado_id=eq.${empleado_id}&order=fecha_creacion.desc`;
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
    fecha_novedad,
    horario_estudio,
    documento_base64,
    file_name,
    sub_tipo_novedad,
    dias_incapacidad,
    incapacidad_base64,
    incapacidad_file_name,
    historia_base64,
    historia_file_name,
    shouldNotify, // NUEVO: Flag para notificar
  } = req.body;

  let urlPublic = null; // Para archivo general o Restricciones/Recomendaciones
  let urlIncapacidad = null;
  let urlHistoria = null;

  try {
    // 1. Validar y subir archivos
    if (tipo_novedad === "Incapacidades") {
      const validationError = validateIncapacidadPayload({
        ...req.body,
        documento_incapacidad: null,
        documento_historia_clinica: null,
      });
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      // Subimos los archivos al bucket
      urlIncapacidad = await uploadFileAndGetUrl(
        incapacidad_base64,
        incapacidad_file_name,
        "documentos-observaciones-ph"
      );
      urlHistoria = await uploadFileAndGetUrl(
        historia_base64,
        historia_file_name,
        "documentos-observaciones-ph"
      );
    } else if (tipo_novedad === "Restricciones/Recomendaciones") {
      // NUEVA LÓGICA RR
      if (!documento_base64) {
        return res.status(400).json({
          message:
            "Falta el archivo de Restricciones/Recomendaciones (obligatorio).",
        });
      }
      urlPublic = await uploadFileAndGetUrl(
        documento_base64,
        file_name,
        "documentos-observaciones-ph"
      );
    } else {
      // 2. Subir archivo General (si existe)
      urlPublic = await uploadFileAndGetUrl(
        documento_base64,
        file_name,
        "documentos-observaciones-ph"
      );
    }

    // 3. Construir el payload final para la DB
    const payload = {
      empleado_id,
      observacion,
      tipo_novedad,
      fecha_novedad,
      revisada: false,
      horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,

      sub_tipo_novedad:
        tipo_novedad === "Incapacidades" ? sub_tipo_novedad || null : null,
      dias_incapacidad:
        tipo_novedad === "Incapacidades" ? dias_incapacidad || null : null,

      // Asignación condicional de URLs a los campos correctos
      documento_adjunto: tipo_novedad !== "Incapacidades" ? urlPublic : null, // General y RR usan este campo
      documento_incapacidad:
        tipo_novedad === "Incapacidades" ? urlIncapacidad || null : null,
      documento_historia_clinica:
        tipo_novedad === "Incapacidades" ? urlHistoria || null : null,
    };

    const { data, error } = await supabaseAxios.post("/observaciones", [
      payload,
    ]);
    if (error) throw error;

    // 4. NUEVO: Lógica de Notificación por Correo
    if (shouldNotify) {
      const empleadoRes = await supabaseAxios.get(
        `/empleados?select=nombre_completo,cedula&id=eq.${empleado_id}`
      );
      const empleado = empleadoRes.data?.[0] || {
        nombre_completo: "Empleado Desconocido",
        cedula: "N/A",
      };

      const subject = `[ALERTA] Nueva Novedad: ${tipo_novedad} para ${empleado.nombre_completo}`;
      const systemUrl = "https://merkahorro.com/programador-horarios";
      const htmlContent = `
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Notificación de Novedad</title>
                </head>
                <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #210d65; color: #ffffff; text-align: center; padding: 25px;">
                            <h1 style="margin: 0; font-size: 24px;">🔔 Nueva Novedad Registrada</h1>
                        </div>
                        <div style="padding: 30px;">
                            <p style="color: #333333; font-size: 16px; margin: 0 0 20px 0; line-height: 1.5;">
                                Se ha registrado una nueva novedad para el siguiente empleado:
                            </p>
                            <div style="background-color: #f8f9ff; border-left: 4px solid #210d65; padding: 15px; margin-bottom: 20px;">
                                <p style="margin: 0 0 10px 0;"><strong>Empleado:</strong> ${
                                  empleado.nombre_completo
                                }</p>
                                <p style="margin: 0 0 10px 0;"><strong>Cédula:</strong> ${
                                  empleado.cedula
                                }</p>
                                <p style="margin: 0 0 10px 0;"><strong>Tipo de Novedad:</strong> ${tipo_novedad}</p>
                                <p style="margin: 0;"><strong>Fecha de Novedad:</strong> ${fecha_novedad}</p>
                            </div>
                            <p style="color: #333333; font-size: 16px;"><strong>Observación:</strong></p>
                            <p style="color: #555555; font-size: 15px; border: 1px solid #eeeeee; padding: 10px; border-radius: 4px;">${observacion}</p>
                            
                            ${
                              payload.documento_adjunto
                                ? `<p style="margin-top: 15px;"><strong>Documento Adjunto:</strong> <a href="${payload.documento_adjunto}" style="color: #210d65;">Ver Documento</a></p>`
                                : ""
                            }
                            ${
                              payload.documento_incapacidad
                                ? `<p style="margin-top: 15px;"><strong>Incapacidad:</strong> <a href="${payload.documento_incapacidad}" style="color: #210d65;">Ver Incapacidad</a></p>`
                                : ""
                            }
                            ${
                              payload.documento_historia_clinica
                                ? `<p style="margin-top: 15px;"><strong>Historia Clínica:</strong> <a href="${payload.documento_historia_clinica}" style="color: #210d65;">Ver Historia</a></p>`
                                : ""
                            }

                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${systemUrl}" style="background-color: #210d65; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 16px; font-weight: bold; border-radius: 5px;">
                                    Ir al Sistema
                                </a>
                            </div>
                        </div>
                        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0; color: #666666; font-size: 14px;">Este es un mensaje automatizado del sistema de horarios.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

      // Envío a todos los destinatarios
      await sendEmail(NOTIFICATION_EMAILS.join(","), subject, htmlContent);
    }

    res.status(201).json(data[0]);
  } catch (e) {
    console.error("Error creating observacion:", e);
    res
      .status(500)
      .json({ message: e.message || "Error creating observacion" });
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
    fecha_novedad,
    horario_estudio,
    documento_adjunto_existente,
    documento_base64,
    file_name,
    // Campos de incapacidad
    sub_tipo_novedad,
    dias_incapacidad,
    incapacidad_base64,
    incapacidad_file_name,
    historia_base64,
    historia_file_name,
    // URLs existentes enviadas desde el frontend para verificar si se mantienen
    documento_incapacidad,
    documento_historia_clinica,
    shouldNotify, // NUEVO: Flag para notificar
  } = req.body;

  // Inicializar URLs con los valores existentes
  let urlPublic = documento_adjunto_existente;
  let urlIncapacidad = documento_incapacidad;
  let urlHistoria = documento_historia_clinica;

  try {
    // Lógica para manejar la subida/eliminación de archivos en la edición
    if (tipo_novedad === "Incapacidades") {
      const validationError = validateIncapacidadPayload(req.body);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      // Subida/eliminación de archivo de Incapacidad
      if (incapacidad_base64 && !incapacidad_base64.startsWith("http")) {
        urlIncapacidad = await uploadFileAndGetUrl(
          incapacidad_base64,
          incapacidad_file_name,
          "documentos-observaciones-ph"
        );
      } else if (incapacidad_base64 === null && documento_incapacidad) {
        // Se marcó para eliminar
        const fileName = documento_incapacidad.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
        urlIncapacidad = null;
      }

      // Subida/eliminación de archivo de Historia Clínica
      if (historia_base64 && !historia_base64.startsWith("http")) {
        urlHistoria = await uploadFileAndGetUrl(
          historia_base64,
          historia_file_name,
          "documentos-observaciones-ph"
        );
      } else if (historia_base64 === null && documento_historia_clinica) {
        // Se marcó para eliminar
        const fileName = documento_historia_clinica.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
        urlHistoria = null;
      }
    } else {
      // Lógica de subida/eliminación de archivo General (incluye Restricciones/Recomendaciones)
      if (documento_base64 && documento_base64.length > 0) {
        // Nuevo archivo subido
        urlPublic = await uploadFileAndGetUrl(
          documento_base64,
          file_name,
          "documentos-observaciones-ph"
        );
      } else if (documento_base64 === null && documento_adjunto_existente) {
        // Se marcó para eliminar
        const fileName = documento_adjunto_existente.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
        urlPublic = null;
      }

      // Asegurarse de que los campos de incapacidad se limpien si el tipo de novedad cambia
      urlIncapacidad = null;
      urlHistoria = null;
    }

    // 2. Construir el payload final para la DB
    const payload = {
      observacion,
      tipo_novedad,
      fecha_novedad,
      horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
      sub_tipo_novedad:
        tipo_novedad === "Incapacidades" ? sub_tipo_novedad || null : null,
      dias_incapacidad:
        tipo_novedad === "Incapacidades" ? dias_incapacidad || null : null,

      // Asignación de URLs
      documento_adjunto: tipo_novedad !== "Incapacidades" ? urlPublic : null,
      documento_incapacidad:
        tipo_novedad === "Incapacidades" ? urlIncapacidad || null : null,
      documento_historia_clinica:
        tipo_novedad === "Incapacidades" ? urlHistoria || null : null,
    };

    const { error } = await supabaseAxios.patch(
      `/observaciones?id=eq.${id}`,
      payload
    );
    if (error) throw error;

    // 3. Lógica de Notificación por Correo (solo si es necesario y en edición)
    if (shouldNotify) {
      const subject = `[ACTUALIZACIÓN] Novedad: ${tipo_novedad} Actualizada (ID: ${id})`;
      const systemUrl = "https://merkahorro.com/programador-horarios";
      const htmlContent = `
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Actualización de Novedad</title>
                </head>
                <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #210d65; color: #ffffff; text-align: center; padding: 25px;">
                            <h1 style="margin: 0; font-size: 24px;">🔄 Novedad Actualizada</h1>
                        </div>
                        <div style="padding: 30px;">
                            <p style="color: #333333; font-size: 16px; margin: 0 0 20px 0; line-height: 1.5;">
                                Se ha actualizado una novedad en el sistema.
                            </p>
                            <div style="background-color: #f8f9ff; border-left: 4px solid #210d65; padding: 15px; margin-bottom: 20px;">
                                <p style="margin: 0 0 10px 0;"><strong>ID de Novedad:</strong> ${id}</p>
                                <p style="margin: 0 0 10px 0;"><strong>Tipo de Novedad:</strong> ${tipo_novedad}</p>
                                <p style="margin: 0;"><strong>Fecha de Novedad:</strong> ${fecha_novedad}</p>
                            </div>
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${systemUrl}" style="background-color: #210d65; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 16px; font-weight: bold; border-radius: 5px;">
                                    Revisar en el Sistema
                                </a>
                            </div>
                        </div>
                        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0; color: #666666; font-size: 14px;">Este es un mensaje automatizado.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
      await sendEmail(NOTIFICATION_EMAILS.join(","), subject, htmlContent);
    }

    res.json({ message: "Updated" });
  } catch (e) {
    console.error("Error updating observacion:", e);
    res.status(500).json({ message: "Error updating observacion" });
  }
};

// ... (El resto de las funciones: deleteObservacion, getObservacionesStats, marcarComoRevisadas)
// Se mantienen sin cambios
export const deleteObservacion = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Obtener todas las URLs de documentos posibles para esa observación
    const {
      data: [obs],
      error: fetchError,
    } = await supabaseAxios.get(
      `/observaciones?select=documento_adjunto,documento_incapacidad,documento_historia_clinica&id=eq.${id}`
    );
    if (fetchError) throw fetchError;

    // 2. Intentar eliminar cada archivo del storage
    const filesToDelete = [
      obs?.documento_adjunto,
      obs?.documento_incapacidad,
      obs?.documento_historia_clinica,
    ].filter((url) => url);

    for (const url of filesToDelete) {
      try {
        // El nombre del archivo es la última parte de la URL de Supabase Storage
        const fileName = url.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
      } catch (storageError) {
        console.warn(`No se pudo eliminar el archivo ${url}:`, storageError);
      }
    }

    // 3. Eliminar el registro de la BD
    const { error: deleteError } = await supabaseAxios.delete(
      `/observaciones?id=eq.${id}`
    );
    if (deleteError) throw deleteError;

    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("Error deleting observacion:", e);
    res.status(500).json({ message: "Error deleting observacion" });
  }
};

export const getObservacionesStats = async (req, res) => {
  try {
    const { data, error } = await supabaseAxios.post(
      "/rpc/obtener_stats_empleados"
    );
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
