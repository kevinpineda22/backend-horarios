import { supabaseAxios } from "../services/supabaseAxios.js";

// Escribe UN evento de auditoría en ph_auditoria_horario (best-effort: nunca
// tumba la operación principal). Sirve para acciones que no son edición día-a-día
// (crear/eliminar horario, cambiar turno base, etc.). spec 5.2 / 8.
//
// tipoCambio sugeridos: "creacion_horario" | "eliminacion_horario" |
//   "asignacion_turno" | "edicion_manual" | "intercambio_turno".
export const writeAuditEvent = async ({
  horarioId = null,
  empleadoId = null,
  diaAfectado = null,
  tipoCambio,
  valorAnterior = null,
  valorNuevo = null,
  usuario = null,
}) => {
  try {
    await supabaseAxios.post("/ph_auditoria_horario", [
      {
        horario_id: horarioId,
        empleado_id: empleadoId,
        dia_afectado: diaAfectado,
        tipo_cambio: tipoCambio,
        valor_anterior: valorAnterior,
        valor_nuevo: valorNuevo,
        usuario_email: usuario?.email || null,
        usuario_nombre: usuario?.nombre || usuario?.email || null,
      },
    ]);
  } catch (e) {
    console.error("No se pudo escribir auditoría (no bloquea):", e?.message || e);
  }
};
