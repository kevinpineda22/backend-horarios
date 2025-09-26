import { supabaseAxios, storageClient } from "../services/supabaseAxios.js";
import { Buffer } from "buffer";

// Helper para subir archivos y devolver la URL
const uploadFileAndGetUrl = async (base64, fileName, bucketName = "documentos-observaciones-ph") => {
    if (!base64 || !fileName) return null;
    
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
    const { sub_tipo_novedad, dias_incapacidad, incapacidad_base64, historia_base64 } = payload;

    if (!sub_tipo_novedad) return "El subtipo de incapacidad (Incidente/Enfermedad) es obligatorio.";

    if (sub_tipo_novedad === "Incidente de Trabajo") {
        if (!incapacidad_base64) return "Falta el archivo de Incapacidad (obligatorio para Incidente de Trabajo).";
        if (!historia_base64) return "Falta el archivo de Historia Clínica (obligatorio para Incidente de Trabajo).";
    }
    
    if (sub_tipo_novedad === "Enfermedad General") {
        if (!dias_incapacidad) return "Falta indicar la duración (Mayor/Menor a 3 días).";

        if (dias_incapacidad === "Mayor a 3 días") {
            if (!incapacidad_base64) return "Falta el archivo de Incapacidad (obligatorio).";
            if (!historia_base64) return "Falta el archivo de Historia Clínica (obligatorio).";
        }
        
        if (dias_incapacidad === "Menor a 3 días") {
            if (!incapacidad_base64) return "Falta el archivo de Incapacidad (obligatorio).";
            // La Historia Clínica es opcional para este caso.
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
		documento_base64, file_name, // Adjunto General
		// Campos de Incapacidades
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
			const validationError = validateIncapacidadPayload(req.body);
			if (validationError) {
				return res.status(400).json({ message: validationError });
			}
			
            // Subimos los archivos al bucket específico
			urlIncapacidad = await uploadFileAndGetUrl(incapacidad_base64, incapacidad_file_name, "documentos-observaciones-ph");
			urlHistoria = await uploadFileAndGetUrl(historia_base64, historia_file_name, "documentos-observaciones-ph");
			
		} else {
            // 2. Subir archivo General (si existe)
			urlPublic = await uploadFileAndGetUrl(documento_base64, file_name, "documentos-observaciones-ph");
		}
		
        // 3. Construir el payload final
		const payload = {
			empleado_id,
			observacion,
			tipo_novedad,
			fecha_novedad,
			horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
			revisada: false, 
            
            // Asignación a los campos nuevos de la BD
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
        historia_base64, historia_file_name
	} = req.body;
	
    // Variables para URLs (existentes o nuevas)
	let urlPublic = documento_adjunto_existente;
    let urlIncapacidad = null;
    let urlHistoria = null;

	try {
        // Validación estricta para Incapacidades durante la edición (aunque el frontend debe prevenir esto)
        if (tipo_novedad === "Incapacidades") {
            const validationError = validateIncapacidadPayload(req.body);
            if (validationError) {
                return res.status(400).json({ message: validationError });
            }
            
            // Lógica de subida para Incapacidad y Historia Clínica
            // NOTA: Se asume que no necesitas la lógica de 'quitar' un adjunto en este update, 
            // sino solo la subida de uno nuevo (si base64 existe)
            if (incapacidad_base64) {
                urlIncapacidad = await uploadFileAndGetUrl(incapacidad_base64, incapacidad_file_name, "documentos-observaciones-ph");
            }
            if (historia_base64) {
                urlHistoria = await uploadFileAndGetUrl(historia_base64, historia_file_name, "documentos-observaciones-ph");
            }

        } else {
            // Lógica de subida/eliminación de archivo General
            if (documento_base64 && file_name) {
                urlPublic = await uploadFileAndGetUrl(documento_base64, file_name, "documentos-observaciones-ph");
            } else if (documento_base64 === null && documento_adjunto_existente) {
                const old = documento_adjunto_existente.split("/").pop();
                await storageClient.storage.from("documentos-observaciones-ph").remove([old]);
                urlPublic = null;
            }
        }
		
        // Construir el payload final
		const payload = {
			observacion,
			tipo_novedad,
			fecha_novedad,
			horario_estudio: tipo_novedad === "Estudio" ? horario_estudio : null,
            
            sub_tipo_novedad: sub_tipo_novedad || null,
            dias_incapacidad: dias_incapacidad || null,
            
            // Asignación condicional de URLs
            documento_adjunto: tipo_novedad !== "Incapacidades" ? urlPublic : null,
            documento_incapacidad: urlIncapacidad || null,
            documento_historia_clinica: urlHistoria || null,
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