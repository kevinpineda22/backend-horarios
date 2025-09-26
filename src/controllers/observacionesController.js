import { supabaseAxios, storageClient } from "../services/supabaseAxios.js";
import { Buffer } from "buffer";

// Helper para subir archivos y devolver la URL
const uploadFileAndGetUrl = async (base64, fileName, bucketName = "documentos-observaciones-ph") => {
    if (!base64 || !fileName) return null;
    
    // Si ya es una URL, la devolvemos (usado en la edición)
    if (typeof base64 === 'string' && base64.startsWith('http')) return base64;

    const buf = Buffer.from(base64, "base64");
    const fn = `${Date.now()}_${Math.random().toString(36).substr(2)}_${fileName}`;
    
    const { data, error } = await storageClient.storage
        .from(bucketName)
        .upload(fn, buf, { upsert: true });

    if (error) throw new Error(`Error al subir archivo: ${error.message}`);
    
    return storageClient.storage.from(bucketName).getPublicUrl(data.path).data.publicUrl;
};

// **NUEVA FUNCIÓN DE VALIDACIÓN ESTRICTA DEL LADO DEL SERVIDOR**
const validateIncapacidadPayload = (payload) => {
    const { sub_tipo_novedad, dias_incapacidad, incapacidad_base64, historia_base64, documento_incapacidad, documento_historia_clinica } = payload;
    
    // Función helper para verificar si un documento existe (nuevo Base64 o URL existente)
    const documentExists = (base64, existingUrl) => {
        return (base64 && base64.length > 0) || (existingUrl && existingUrl.length > 0);
    }

    if (!sub_tipo_novedad) return "El subtipo de incapacidad (Incidente/Enfermedad) es obligatorio.";

    if (sub_tipo_novedad === "Incidente de Trabajo") {
        if (!documentExists(incapacidad_base64, documento_incapacidad)) return "Falta el archivo de Incapacidad (obligatorio para Incidente de Trabajo).";
        if (!documentExists(historia_base64, documento_historia_clinica)) return "Falta el archivo de Historia Clínica (obligatorio para Incidente de Trabajo).";
    }
    
    if (sub_tipo_novedad === "Enfermedad General") {
        if (!dias_incapacidad) return "Falta indicar la duración de la Enfermedad General.";

        if (dias_incapacidad === "Mayor a 3 días") {
            if (!documentExists(incapacidad_base64, documento_incapacidad)) return "Falta el archivo de Incapacidad (obligatorio).";
            if (!documentExists(historia_base64, documento_historia_clinica)) return "Falta el archivo de Historia Clínica (obligatorio).";
        }
        
        if (dias_incapacidad === "Menor a 3 días") {
            if (!documentExists(incapacidad_base64, documento_incapacidad)) return "Falta el archivo de Incapacidad (obligatorio).";
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
		empleado_id, observacion, tipo_novedad, fecha_novedad, horario_estudio, 
		documento_base64, file_name, 
		sub_tipo_novedad, dias_incapacidad,
		incapacidad_base64, incapacidad_file_name,
		historia_base64, historia_file_name
	} = req.body;
	
	let urlPublic = null;
  let urlIncapacidad = null;
  let urlHistoria = null;

	try {
        // 1. Validar y subir archivos si es Incapacidad
		if (tipo_novedad === "Incapacidades") {
			const validationError = validateIncapacidadPayload({ ...req.body, documento_incapacidad: null, documento_historia_clinica: null });
			if (validationError) {
				return res.status(400).json({ message: validationError });
			}
			
            // Subimos los archivos al bucket
			urlIncapacidad = await uploadFileAndGetUrl(incapacidad_base64, incapacidad_file_name, "documentos-observaciones-ph");
			urlHistoria = await uploadFileAndGetUrl(historia_base64, historia_file_name, "documentos-observaciones-ph");
			
		} else {
            // 2. Subir archivo General (si existe)
			urlPublic = await uploadFileAndGetUrl(documento_base64, file_name, "documentos-observaciones-ph");
		}
		
        // 3. Construir el payload final
		const payload = {
			empleado_id, observacion, tipo_novedad, fecha_novedad, revisada: false, 
			horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
            
            sub_tipo_novedad: sub_tipo_novedad || null,
            dias_incapacidad: dias_incapacidad || null,
            
            documento_adjunto: urlPublic || null,
            documento_incapacidad: urlIncapacidad || null,
            documento_historia_clinica: urlHistoria || null,
		};
		
		const { data, error } = await supabaseAxios.post("/observaciones", [payload]);
		if (error) throw error;
		res.status(201).json(data[0]);
	} catch (e) {
		console.error("Error creating observacion:", e);
		res.status(500).json({ message: e.message || "Error creating observacion" });
	}
};

/**
 * Endpoint para actualizar una observación existente.
 */
export const updateObservacion = async (req, res) => {
	const { id } = req.params;
	const {
		observacion, tipo_novedad, fecha_novedad, horario_estudio,
		documento_adjunto_existente, documento_base64, file_name, 
        // Campos de incapacidad
        sub_tipo_novedad, dias_incapacidad,
        incapacidad_base64, incapacidad_file_name,
        historia_base64, historia_file_name,
        // URLs existentes enviadas desde el frontend para verificar si se mantienen
        documento_incapacidad, documento_historia_clinica 
	} = req.body;
	
    let urlPublic = documento_adjunto_existente;
    let urlIncapacidad = documento_incapacidad;
    let urlHistoria = documento_historia_clinica;

	try {
        // 1. Validación estricta para Incapacidades
        if (tipo_novedad === "Incapacidades") {
            const validationError = validateIncapacidadPayload(req.body);
            if (validationError) {
                return res.status(400).json({ message: validationError });
            }
            
            // Subida o actualización de archivo de Incapacidad
            if (incapacidad_base64 && !incapacidad_base64.startsWith("http")) { 
                urlIncapacidad = await uploadFileAndGetUrl(incapacidad_base64, incapacidad_file_name, "documentos-observaciones-ph");
            } else if (incapacidad_base64 === null && documento_incapacidad) {
                const fileName = documento_incapacidad.split("/").pop();
                await storageClient.storage.from("documentos-observaciones-ph").remove([fileName]);
                urlIncapacidad = null;
            }

            // Subida o actualización de archivo de Historia Clínica
            if (historia_base64 && !historia_base64.startsWith("http")) { 
                urlHistoria = await uploadFileAndGetUrl(historia_base64, historia_file_name, "documentos-observaciones-ph");
            } else if (historia_base64 === null && documento_historia_clinica) {
                const fileName = documento_historia_clinica.split("/").pop();
                await storageClient.storage.from("documentos-observaciones-ph").remove([fileName]);
                urlHistoria = null;
            }

        } else {
            // Lógica de subida/eliminación de archivo General
            if (documento_base64 && documento_base64.length > 0) {
                urlPublic = await uploadFileAndGetUrl(documento_base64, file_name, "documentos-observaciones-ph");
            } else if (documento_base64 === null && documento_adjunto_existente) {
                const fileName = documento_adjunto_existente.split("/").pop();
                await storageClient.storage.from("documentos-observaciones-ph").remove([fileName]);
                urlPublic = null;
            }
        }
		
        // 2. Construir el payload final
		const payload = {
			observacion, tipo_novedad, fecha_novedad,
			horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
            sub_tipo_novedad: sub_tipo_novedad || null,
            dias_incapacidad: dias_incapacidad || null,
            
            // Asignación de URLs
            documento_adjunto: tipo_novedad !== "Incapacidades" ? urlPublic : null,
            documento_incapacidad: tipo_novedad === "Incapacidades" ? urlIncapacidad : null,
            documento_historia_clinica: tipo_novedad === "Incapacidades" ? urlHistoria : null,
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
 * Endpoint para eliminar una observación. (CORREGIDO PARA ELIMINAR MÚLTIPLES ADJUNTOS)
 */
export const deleteObservacion = async (req, res) => {
	const { id } = req.params;
	try {
        // 1. Obtener todas las URLs de documentos posibles para esa observación
		const { data: [obs], error: fetchError } = await supabaseAxios.get(
			`/observaciones?select=documento_adjunto,documento_incapacidad,documento_historia_clinica&id=eq.${id}`
		);
		if (fetchError) throw fetchError;
		
        // 2. Intentar eliminar cada archivo del storage
        const filesToDelete = [
            obs?.documento_adjunto,
            obs?.documento_incapacidad,
            obs?.documento_historia_clinica
        ].filter(url => url);

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