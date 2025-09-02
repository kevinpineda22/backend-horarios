import { supabaseAxios, storageClient } from '../services/supabaseAxios.js';
import { Buffer } from 'buffer';

export const getObservacionesByEmpleadoId = async (req, res) => {
  const { empleado_id } = req.params;
  try {
    const url = `/observaciones?select=*&empleado_id=eq.${empleado_id}&order=fecha_creacion.desc`;
    const { data } = await supabaseAxios.get(url);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error fetching observaciones' });
  }
};

export const createObservacion = async (req, res) => {
  const { empleado_id, observacion, tipo_novedad, documento_base64, file_name, fecha_novedad } = req.body;
  let urlPublic = null;
  try {
    if (documento_base64 && file_name) {
      const buf = Buffer.from(documento_base64, 'base64');
      const fn = `${Date.now()}_${Math.random().toString(36).substr(2)}_${file_name}`;
      const { data, error } = await storageClient
        .storage.from('documentos-observaciones-ph')
        .upload(fn, buf);
      if (error) throw error;
      urlPublic = storageClient.storage.from('documentos-observaciones-ph').getPublicUrl(data.path).data.publicUrl;
    }
    const payload = { empleado_id, observacion, tipo_novedad, documento_adjunto: urlPublic, lider_id: req.user.id, fecha_novedad };
    const { data } = await supabaseAxios.post('/observaciones', [payload]);
    res.status(201).json(data[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error creating observacion' });
  }
};

export const updateObservacion = async (req, res) => {
  const { id } = req.params;
  const { observacion, tipo_novedad, documento_adjunto_existente, documento_base64, file_name, fecha_novedad } = req.body;
  let urlPublic = documento_adjunto_existente;
  try {
    if (documento_base64 && file_name) {
      // borrar antiguo si existe
      if (documento_adjunto_existente) {
        const old = documento_adjunto_existente.split('/').pop();
        await storageClient.storage.from('documentos-observaciones-ph').remove([old]);
      }
      const buf = Buffer.from(documento_base64, 'base64');
      const fn = `${Date.now()}_${Math.random().toString(36).substr(2)}_${file_name}`;
      const { data } = await storageClient
        .storage.from('documentos-observaciones-ph')
        .upload(fn, buf);
      urlPublic = storageClient.storage.from('documentos-observaciones-ph').getPublicUrl(data.path).data.publicUrl;
    } else if (documento_base64 === null && documento_adjunto_existente) {
      const old = documento_adjunto_existente.split('/').pop();
      await storageClient.storage.from('documentos-observaciones-ph').remove([old]);
      urlPublic = null;
    }
    const payload = { observacion, tipo_novedad, documento_adjunto: urlPublic, fecha_novedad };
    await supabaseAxios.patch(`/observaciones?id=eq.${id}`, payload);
    res.json({ message: 'Updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error updating observacion' });
  }
};

export const deleteObservacion = async (req, res) => {
  const { id } = req.params;
  try {
    // fetch adjunto
    const { data: [obs] } = await supabaseAxios.get(`/observaciones?select=documento_adjunto&id=eq.${id}`);
    if (obs.documento_adjunto) {
      const old = obs.documento_adjunto.split('/').pop();
      await storageClient.storage.from('documentos-observaciones-ph').remove([old]);
    }
    await supabaseAxios.delete(`/observaciones?id=eq.${id}`);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error deleting observacion' });
  }
};