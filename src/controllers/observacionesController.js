import { supabaseAxios, storageClient } from "../services/supabaseAxios.js";
import { Buffer } from "buffer";
import { sendEmail } from "../services/emailService.js";

const NOTIFICATION_EMAILS = [
  "johanmerkahorro777@gmail.com",
  "juanmerkahorro@gmail.com",
];

const uploadFileAndGetUrl = async (
  base64,
  fileName,
  bucketName = "documentos-observaciones-ph"
) => {
  if (!base64 || !fileName) return null;

  if (typeof base64 === "string" && base64.startsWith("http")) return base64;

  const buf = Buffer.from(base64, "base64");
  // Usamos el nombre del archivo con un timestamp y un ID único
  const fn = `doc_${fileName}_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2)}.png`;

  const { data, error } = await storageClient.storage
    .from(bucketName)
    .upload(fn, buf, {
      upsert: true,
      contentType: "image/png",
    });

  if (error) throw new Error(`Error al subir archivo: ${error.message}`);

  return storageClient.storage.from(bucketName).getPublicUrl(data.path).data
    .publicUrl;
};

// FUNCIÓN DE VALIDACIÓN ESTRICTA DEL LADO DEL SERVIDOR (ADAPTADA)
const validateIncapacidadPayload = (payload) => {
  const details = payload.details || {};
  const tipoIncapacidad = details.tipoIncapacidad;
  const diasIncapacidad = details.diasIncapacidad;

  const incapacidad_base64 = payload.incapacidad_base64;
  const historia_base64 = payload.historia_base64;
  const documento_incapacidad = payload.documento_incapacidad;
  const documento_historia_clinica = payload.documento_historia_clinica;

  const documentExists = (base64, existingUrl) => {
    return (
      (base64 && base64.length > 0 && !base64.startsWith("http")) ||
      (existingUrl && existingUrl.length > 0)
    );
  };

  if (!tipoIncapacidad)
    return "El subtipo de incapacidad (Incidente/Enfermedad) es obligatorio.";

  if (tipoIncapacidad === "Incidente de Trabajo") {
    if (!documentExists(incapacidad_base64, documento_incapacidad))
      return "Falta el archivo de Incapacidad (obligatorio para Incidente de Trabajo).";
    if (!documentExists(historia_base64, documento_historia_clinica))
      return "Falta el archivo de Historia Clínica (obligatorio para Incidente de Trabajo).";
  }

  if (tipoIncapacidad === "Enfermedad General") {
    if (!diasIncapacidad)
      return "Falta indicar la duración de la Enfermedad General.";

    if (diasIncapacidad === "Mayor a 3 días") {
      if (!documentExists(incapacidad_base64, documento_incapacidad))
        return "Falta el archivo de Incapacidad (obligatorio).";
      if (!documentExists(historia_base64, documento_historia_clinica))
        return "Falta el archivo de Historia Clínica (obligatorio).";
    }

    if (diasIncapacidad === "Menor a 3 días") {
      if (!documentExists(incapacidad_base64, documento_incapacidad))
        return "Falta el archivo de Incapacidad (obligatorio).";
    }
  }

  return null;
};

// FUNCIÓN CENTRAL PARA CREAR EL OBJETO JSONB 'details'
const getDetailsPayload = (body) => {
  // La firma del líder ya NO está aquí, el frontend se encarga de que solo vengan los campos de novedad.
  const details = body.details || {};
  return Object.keys(details).length > 0 ? details : null;
};

// ---------------------------------------------------------------
// ENDPOINTS
// ---------------------------------------------------------------

export const getObservacionesByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    // Obtenemos las dos columnas de firma directamente
    const url = `/observaciones?select=*,details,documento_incapacidad,documento_historia_clinica,documento_firma_empleado,documento_firma_lider&empleado_id=eq.${empleado_id}&order=fecha_creacion.desc`;
    const { data, error } = await supabaseAxios.get(url);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error("Error fetching observaciones:", e);
    res.status(500).json({ message: "Error fetching observaciones" });
  }
};

export const createObservacion = async (req, res) => {
  const {
    empleado_id,
    observacion,
    tipo_novedad,
    fecha_novedad,
    shouldNotify,
    documento_base64,
    file_name,
    incapacidad_base64,
    incapacidad_file_name,
    historia_base64,
    historia_file_name,
    // Firmas Base64
    firma_empleado_base64,
    firma_lider_base64,
  } = req.body;

  let urlPublic = null;
  let urlIncapacidad = null;
  let urlHistoria = null;
  let urlFirmaEmpleado = null;
  let urlFirmaLider = null;

  try {
    // 1. Validar y subir archivos
    if (tipo_novedad === "Incapacidades") {
      const validationError = validateIncapacidadPayload(req.body);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      urlIncapacidad = await uploadFileAndGetUrl(
        incapacidad_base64,
        "incap",
        "documentos-observaciones-ph"
      );
      urlHistoria = await uploadFileAndGetUrl(
        historia_base64,
        "historia",
        "documentos-observaciones-ph"
      );
    } else if (tipo_novedad === "Restricciones/Recomendaciones") {
      if (!documento_base64) {
        return res
          .status(400)
          .json({
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
      urlPublic = await uploadFileAndGetUrl(
        documento_base64,
        file_name,
        "documentos-observaciones-ph"
      );
    }

    // **GESTIÓN DE LAS FIRMAS DIGITALES**
    if (firma_empleado_base64) {
      urlFirmaEmpleado = await uploadFileAndGetUrl(
        firma_empleado_base64,
        `${empleado_id}_empleado`,
        "documentos-observaciones-ph"
      );
    }
    if (firma_lider_base64) {
      urlFirmaLider = await uploadFileAndGetUrl(
        firma_lider_base64,
        `${empleado_id}_lider`,
        "documentos-observaciones-ph"
      );
    }

    // 2. Construir el payload final para la DB
    const payload = {
      empleado_id,
      observacion,
      tipo_novedad,
      fecha_novedad,
      revisada: false,

      details: getDetailsPayload(req.body),

      documento_adjunto: tipo_novedad !== "Incapacidades" ? urlPublic : null,
      documento_incapacidad:
        tipo_novedad === "Incapacidades" ? urlIncapacidad || null : null,
      documento_historia_clinica:
        tipo_novedad === "Incapacidades" ? urlHistoria || null : null,
      documento_firma_empleado: urlFirmaEmpleado || null, // <-- Firma Empleado
      documento_firma_lider: urlFirmaLider || null, // <-- Firma Líder
    };

    const { data, error } = await supabaseAxios.post("/observaciones", [
      payload,
    ]);
    if (error) throw error;

    // 3. Lógica de Notificación por Correo
    if (shouldNotify) {
      try {
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
                                    Se ha registrado una nueva novedad para el siguiente empleado.
                                    **Para ver los detalles completos y los documentos adjuntos, ingrese al sistema.**
                                </p>
                                <div style="background-color: #f8f9ff; border-left: 4px solid #210d65; padding: 15px; margin-bottom: 20px;">
                                    <p style="margin: 0 0 10px 0;"><strong>Empleado:</strong> ${empleado.nombre_completo}</p>
                                    <p style="margin: 0 0 10px 0;"><strong>Cédula:</strong> ${empleado.cedula}</p>
                                    <p style="margin: 0 0 10px 0;"><strong>Tipo de Novedad:</strong> ${tipo_novedad}</p>
                                    <p style="margin: 0;"><strong>Fecha de Novedad:</strong> ${fecha_novedad}</p>
                                </div>
                                <p style="color: #333333; font-size: 16px;"><strong>Observación:</strong></p>
                                <p style="color: #555555; font-size: 15px; border: 1px solid #eeeeee; padding: 10px; border-radius: 4px;">${observacion}</p>
                                
                                <div style="text-align: center; margin-top: 30px;">
                                    <a href="${systemUrl}" style="background-color: #210d65; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 16px; font-weight: bold; border-radius: 5px;">
                                        Ir a la Plataforma (Revisar Documentos)
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
        await sendEmail(NOTIFICATION_EMAILS.join(","), subject, htmlContent);
      } catch (emailError) {
        console.error(
          "Error al enviar email de notificación (creación):",
          emailError
        );
      }
    }

    res.status(201).json(data[0]);
  } catch (e) {
    console.error("Error creating observacion:", e);
    res
      .status(500)
      .json({ message: e.message || "Error creating observacion" });
  }
};

export const updateObservacion = async (req, res) => {
  const { id } = req.params;
  const {
    observacion,
    tipo_novedad,
    fecha_novedad,
    documento_adjunto_existente,
    documento_base64,
    file_name,
    incapacidad_base64,
    incapacidad_file_name,
    historia_base64,
    historia_file_name,
    documento_incapacidad,
    documento_historia_clinica,
    shouldNotify,
    // Firmas
    firma_empleado_base64,
    documento_firma_empleado, // URL existente de empleado
    firma_lider_base64,
    documento_firma_lider, // URL existente de líder
  } = req.body;

  // Obtenemos los detalles existentes para no perder campos JSONB no relacionados con la firma
  const {
    data: [currentObs],
  } = await supabaseAxios.get(`/observaciones?select=details&id=eq.${id}`);

  let urlPublic = documento_adjunto_existente;
  let urlIncapacidad = documento_incapacidad;
  let urlHistoria = documento_historia_clinica;
  let urlFirmaEmpleado = documento_firma_empleado; // URL del empleado existente
  let urlFirmaLider = documento_firma_lider; // URL del líder existente

  try {
    // 1. Manejo de Archivos (General/Incapacidad)
    if (tipo_novedad === "Incapacidades") {
      const validationError = validateIncapacidadPayload(req.body);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      if (incapacidad_base64 && !incapacidad_base64.startsWith("http")) {
        urlIncapacidad = await uploadFileAndGetUrl(
          incapacidad_base64,
          `${id}_incap`,
          "documentos-observaciones-ph"
        );
      } else if (incapacidad_base64 === null && documento_incapacidad) {
        const fileName = documento_incapacidad.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
        urlIncapacidad = null;
      }
      if (historia_base64 && !historia_base64.startsWith("http")) {
        urlHistoria = await uploadFileAndGetUrl(
          historia_base64,
          `${id}_historia`,
          "documentos-observaciones-ph"
        );
      } else if (historia_base64 === null && documento_historia_clinica) {
        const fileName = documento_historia_clinica.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
        urlHistoria = null;
      }
    } else {
      if (documento_base64 && documento_base64.length > 0) {
        urlPublic = await uploadFileAndGetUrl(
          documento_base64,
          file_name,
          "documentos-observaciones-ph"
        );
      } else if (documento_base64 === null && documento_adjunto_existente) {
        const fileName = documento_adjunto_existente.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
        urlPublic = null;
      }

      urlIncapacidad = null;
      urlHistoria = null;
    }

    // 1b. GESTIÓN DE LAS DOS FIRMAS DIGITALES (Update)

    // Firma Empleado
    if (firma_empleado_base64) {
      urlFirmaEmpleado = await uploadFileAndGetUrl(
        firma_empleado_base64,
        `${id}_empleado_upd`,
        "documentos-observaciones-ph"
      );
    } else if (firma_empleado_base64 === null && documento_firma_empleado) {
      const fileName = documento_firma_empleado.split("/").pop();
      await storageClient.storage
        .from("documentos-observaciones-ph")
        .remove([fileName]);
      urlFirmaEmpleado = null;
    }

    // Firma Líder
    if (firma_lider_base64) {
      urlFirmaLider = await uploadFileAndGetUrl(
        firma_lider_base64,
        `${id}_lider_upd`,
        "documentos-observaciones-ph"
      );
    } else if (firma_lider_base64 === null && documento_firma_lider) {
      const fileName = documento_firma_lider.split("/").pop();
      await storageClient.storage
        .from("documentos-observaciones-ph")
        .remove([fileName]);
      urlFirmaLider = null;
    }

    // 2. Construir el payload final para la DB
    const payload = {
      observacion,
      tipo_novedad,
      fecha_novedad,

      // Mantener detalles existentes y no relacionados con la firma, si los hay.
      details: getDetailsPayload(req.body, urlFirmaLider),

      documento_adjunto: tipo_novedad !== "Incapacidades" ? urlPublic : null,
      documento_incapacidad:
        tipo_novedad === "Incapacidades" ? urlIncapacidad || null : null,
      documento_historia_clinica:
        tipo_novedad === "Incapacidades" ? urlHistoria || null : null,
      documento_firma_empleado: urlFirmaEmpleado || null, // URL FINAL DEL EMPLEADO
      documento_firma_lider: urlFirmaLider || null, // URL FINAL DEL LÍDER
    };

    // Limpiamos los campos Base64 del payload final antes de enviarlo al DB
    delete payload.firma_empleado_base64;
    delete payload.firma_lider_base64;

    const { error } = await supabaseAxios.patch(
      `/observaciones?id=eq.${id}`,
      payload
    );
    if (error) throw error;

    // 3. Lógica de Notificación por Correo
    if (shouldNotify) {
      try {
        const subject = `[ACTUALIZACIÓN] Novedad: ${tipo_novedad} (ID: ${id})`;
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
                                    Se ha actualizado una novedad en el sistema (ID: ${id}, Tipo: ${tipo_novedad}).
                                </p>
                                <div style="background-color: #f8f9ff; border-left: 4px solid #210d65; padding: 15px; margin-bottom: 20px;">
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
      } catch (emailError) {
        console.error(
          "Error al enviar email de notificación (actualización):",
          emailError
        );
      }
    }

    res.json({ message: "Updated" });
  } catch (e) {
    console.error("Error updating observacion:", e);
    res.status(500).json({ message: "Error updating observacion" });
  }
};

export const deleteObservacion = async (req, res) => {
  const { id } = req.params;
  try {
    const {
      data: [obs],
      error: fetchError,
    } = await supabaseAxios.get(
      `/observaciones?select=documento_adjunto,documento_incapacidad,documento_historia_clinica,documento_firma_empleado,documento_firma_lider,details&id=eq.${id}`
    );
    if (fetchError) throw fetchError;

    const filesToDelete = [
      obs?.documento_adjunto,
      obs?.documento_incapacidad,
      obs?.documento_historia_clinica,
      obs?.documento_firma_empleado,
      obs?.documento_firma_lider,
    ].filter((url) => url);

    for (const url of filesToDelete) {
      try {
        const fileName = url.split("/").pop();
        await storageClient.storage
          .from("documentos-observaciones-ph")
          .remove([fileName]);
      } catch (storageError) {
        console.warn(`No se pudo eliminar el archivo ${url}:`, storageError);
      }
    }

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
