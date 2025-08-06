// src/controllers/observacionesController.js
import supabase from '../services/supabase.service.js';
import { Buffer } from 'node:buffer';

export const getObservacionesByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const { data, error } = await supabase
      .from("observaciones")
      .select("*")
      .eq("empleado_id", empleado_id)
      .order("fecha_creacion", { ascending: false });
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).send('Error al obtener observaciones.');
  }
};

export const createObservacion = async (req, res) => {
    const { empleado_id, observacion, tipo_novedad, documento_base64, file_name, fecha_novedad } = req.body;
    let documentoUrl = null;
    try {
        if (documento_base64 && file_name) {
            const buffer = Buffer.from(documento_base64, 'base64');
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${file_name}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('documentos-observaciones-ph')
                .upload(fileName, buffer, {
                    contentType: 'application/octet-stream'
                });

            if (uploadError) throw uploadError;
            documentoUrl = supabase.storage.from('documentos-observaciones-ph').getPublicUrl(uploadData.path).data.publicUrl;
        }

        const payload = {
            empleado_id,
            observacion,
            tipo_novedad,
            documento_adjunto: documentoUrl,
            lider_id: req.user.id,
            fecha_creacion: new Date().toISOString(),
            fecha_novedad: fecha_novedad || new Date().toISOString()
        };

        const { error } = await supabase.from("observaciones").insert([payload]);
        if (error) throw error;
        res.status(201).send('Observación guardada exitosamente.');

    } catch (error) {
        console.error('Error al guardar observación:', error);
        res.status(500).send('Error al guardar observación.');
    }
};

export const updateObservacion = async (req, res) => {
  const { id } = req.params;
  const { observacion, tipo_novedad, documento_base64, file_name, documento_adjunto_existente, fecha_novedad } = req.body;
  let documentoUrl = documento_adjunto_existente;

  try {
      if (documento_base64 && file_name) {
          if (documento_adjunto_existente) {
              const oldFileName = documento_adjunto_existente.split('/').pop();
              await supabase.storage.from('documentos-observaciones-ph').remove([oldFileName]);
          }

          const buffer = Buffer.from(documento_base64, 'base64');
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${file_name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
              .from('documentos-observaciones-ph')
              .upload(fileName, buffer, {
                  contentType: 'application/octet-stream'
              });

          if (uploadError) throw uploadError;
          documentoUrl = supabase.storage.from('documentos-observaciones-ph').getPublicUrl(uploadData.path).data.publicUrl;
      } else if (documento_base64 === null) {
          if (documento_adjunto_existente) {
              const oldFileName = documento_adjunto_existente.split('/').pop();
              await supabase.storage.from('documentos-observaciones-ph').remove([oldFileName]);
          }
          documentoUrl = null;
      }

      const payload = {
          observacion,
          tipo_novedad,
          documento_adjunto: documentoUrl,
          fecha_novedad: fecha_novedad || new Date().toISOString()
      };

      const { error } = await supabase.from("observaciones").update(payload).eq("id", id);
      if (error) throw error;
      res.status(200).send('Observación actualizada exitosamente.');

  } catch (error) {
      console.error('Error al actualizar observación:', error);
      res.status(500).send('Error al actualizar observación.');
  }
};

export const deleteObservacion = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: obs, error: fetchError } = await supabase.from("observaciones").select("documento_adjunto").eq("id", id).single();
    if (fetchError) throw fetchError;

    if (obs.documento_adjunto) {
      const fileName = obs.documento_adjunto.split('/').pop();
      const { error: deleteFileError } = await supabase.storage.from('documentos-observaciones-ph').remove([fileName]);
      if (deleteFileError) console.error('Error al eliminar archivo del storage:', deleteFileError);
    }

    const { error } = await supabase.from("observaciones").delete().eq("id", id);
    if (error) throw error;
    res.status(200).send('Observación eliminada exitosamente.');
  } catch (error) {
    res.status(500).send('Error al eliminar observación.');
  }
};