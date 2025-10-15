import { supabaseAxios } from "../services/supabaseAxios.js";

const mapRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    horas_excedidas: Number(row.horas_excedidas || 0),
    horas_pendientes: Number(row.horas_pendientes || 0),
  };
};

export const listPendingByEmpleado = async (req, res) => {
  const { empleadoId } = req.params;
  try {
    const { data, error } = await supabaseAxios.get(
      `/horas_compensacion?empleado_id=eq.${empleadoId}&estado=in.(pendiente,parcial)&order=semana_inicio.asc`
    );
    if (error) throw error;
    res.json((data || []).map(mapRow));
  } catch (err) {
    console.error("Error listando horas pendientes:", err);
    res.status(500).json({ message: "Error consultando horas pendientes" });
  }
};

export const createOrUpdateExcess = async ({
  empleadoId,
  semanaInicio,
  semanaFin,
  horasExcedidas,
}) => {
  const payload = {
    empleado_id: empleadoId,
    semana_inicio: semanaInicio,
    semana_fin: semanaFin,
    horas_excedidas: horasExcedidas,
    horas_pendientes: horasExcedidas,
    estado: "pendiente",
  };

  const { data } = await supabaseAxios.get(
    `/horas_compensacion?select=id,horas_excedidas,horas_pendientes,estado&empleado_id=eq.${empleadoId}&semana_inicio=eq.${semanaInicio}&semana_fin=eq.${semanaFin}`
  );

  const existing = data?.[0];
  if (existing) {
    const newPendientes =
      Number(existing.horas_pendientes || 0) + horasExcedidas;
    const updatePayload = {
      horas_excedidas: Number(existing.horas_excedidas || 0) + horasExcedidas,
      horas_pendientes: newPendientes,
      estado: "pendiente",
    };
    await supabaseAxios.patch(
      `/horas_compensacion?id=eq.${existing.id}`,
      updatePayload
    );
    return { ...existing, ...updatePayload, id: existing.id };
  }

  const { data: inserted, error } = await supabaseAxios.post(
    "/horas_compensacion",
    payload
  );
  if (error) throw error;
  return inserted?.[0] || payload;
};

export const applyToWeeks = async (req, res) => {
  const { empleadoId } = req.params;
  const { applications } = req.body; // [{ id, horas_consumidas, semana_aplicada_inicio, semana_aplicada_fin }]

  if (!Array.isArray(applications) || applications.length === 0) {
    return res.status(400).json({ message: "applications es requerido" });
  }

  try {
    const updates = [];
    for (const app of applications) {
      const {
        id,
        horas_consumidas,
        semana_aplicada_inicio,
        semana_aplicada_fin,
      } = app;
      if (!id || horas_consumidas == null) {
        return res
          .status(400)
          .json({ message: "Formato inválido en applications" });
      }

      const { data: rows } = await supabaseAxios.get(
        `/horas_compensacion?select=*&id=eq.${id}&empleado_id=eq.${empleadoId}`
      );
      const row = rows?.[0];
      if (!row) {
        return res
          .status(404)
          .json({ message: `Registro ${id} no encontrado` });
      }

      const pendientes = Number(row.horas_pendientes || 0);
      const consumidas = Number(horas_consumidas || 0);
      const remaining = Math.max(0, pendientes - consumidas);

      const nextState = remaining > 0 ? "parcial" : "aplicado";
      const patchPayload = {
        horas_pendientes: remaining,
        estado: nextState,
        semana_aplicada_inicio:
          semana_aplicada_inicio || row.semana_aplicada_inicio,
        semana_aplicada_fin: semana_aplicada_fin || row.semana_aplicada_fin,
      };

      await supabaseAxios.patch(
        `/horas_compensacion?id=eq.${id}`,
        patchPayload
      );
      updates.push({ id, ...patchPayload });
    }

    res.json({ updates });
  } catch (err) {
    console.error("Error aplicando horas acumuladas:", err);
    res.status(500).json({ message: "Error aplicando horas acumuladas" });
  }
};

export const annulEntry = async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAxios.patch(`/horas_compensacion?id=eq.${id}`, {
      estado: "anulado",
      horas_pendientes: 0,
    });
    res.json({ message: "Registro anulado" });
  } catch (err) {
    console.error("Error anulando registro: ", err);
    res.status(500).json({ message: "Error anulando registro" });
  }
};

export const listHistory = async (req, res) => {
  const { empleadoId } = req.params;
  const { limit = 10 } = req.query;
  try {
    const { data, error } = await supabaseAxios.get(
      `/horas_compensacion?empleado_id=eq.${empleadoId}&order=semana_inicio.desc&limit=${limit}`
    );
    if (error) throw error;
    res.json((data || []).map(mapRow));
  } catch (err) {
    console.error("Error listando historial:", err);
    res.status(500).json({ message: "Error consultando historial" });
  }
};

export const recomputeExcessForHorario = async ({ horario }) => {
  const dias = Array.isArray(horario?.dias) ? horario.dias : [];
  const total = dias.reduce((acc, d) => acc + Number(d.horas || 0), 0);
  const limit = 56;
  const exceso = Number((total - limit).toFixed(2));

  if (exceso <= 0) {
    return null;
  }

  const semanaInicio = horario.fecha_inicio;
  const semanaFin = horario.fecha_fin;
  const empleadoId = horario.empleado_id;

  return createOrUpdateExcess({
    empleadoId,
    semanaInicio,
    semanaFin,
    horasExcedidas: exceso,
  });
};

export const fetchAllPendingForEmpleado = async (empleadoId) => {
  const { data } = await supabaseAxios.get(
    `/horas_compensacion?empleado_id=eq.${empleadoId}&estado=in.(pendiente,parcial)&order=semana_inicio.asc`
  );
  return (data || []).map(mapRow);
};

export const updateEntry = async (id, patchPayload) => {
  await supabaseAxios.patch(`/horas_compensacion?id=eq.${id}`, patchPayload);
};

export const resetForSemana = async ({
  empleadoId,
  semanaInicio,
  semanaFin,
}) => {
  const { data: rows } = await supabaseAxios.get(
    `/horas_compensacion?empleado_id=eq.${empleadoId}&semana_inicio=eq.${semanaInicio}&semana_fin=eq.${semanaFin}`
  );

  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    await supabaseAxios.patch(`/horas_compensacion?id=eq.${row.id}`, {
      horas_excedidas: 0,
      horas_pendientes: 0,
      estado: "anulado",
    });
  }
};
