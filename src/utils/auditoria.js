import { supabaseAxios } from "../services/supabaseAxios.js";

// Identidad del ACTOR para auditoría. El email (la identidad verificada) sale
// SIEMPRE del token (req.user), nunca de datos que manda el cliente: así el
// "quién" no es falsificable. El nombre usa lo que traiga el token y, solo como
// respaldo para mostrar algo legible, un label enviado por el cliente.
export const auditUserFromReq = (req) => {
  const meta = req?.user?.user_metadata || {};
  const email = req?.user?.email || null;
  const nombre =
    meta.full_name ||
    meta.name ||
    req?.body?.usuario_nombre ||
    req?.body?.creado_por ||
    email ||
    null;
  return { email, nombre };
};

// Congela el nombre del colaborador en el registro de auditoría (best-effort),
// para que el histórico NO dependa de que el empleado siga existiendo o activo.
export const resolveEmpleadoNombre = async (empleadoId) => {
  if (!empleadoId) return null;
  try {
    const { data } = await supabaseAxios.get(
      `/empleados?select=nombre_completo&id=eq.${empleadoId}`
    );
    return data?.[0]?.nombre_completo || null;
  } catch {
    return null;
  }
};

// Escribe UN evento de auditoría en ph_auditoria_horario (best-effort: nunca
// tumba la operación principal). Sirve para acciones que no son edición día-a-día
// (crear/eliminar horario, cambiar turno base, etc.). spec 5.2 / 8.
//
// tipoCambio sugeridos: "creacion_horario" | "eliminacion_horario" |
//   "asignacion_turno" | "edicion_manual" | "intercambio_turno".
export const writeAuditEvent = async ({
  horarioId = null,
  empleadoId = null,
  empleadoNombre = null,
  diaAfectado = null,
  tipoCambio,
  valorAnterior = null,
  valorNuevo = null,
  usuario = null,
}) => {
  try {
    const nombreColaborador =
      empleadoNombre || (await resolveEmpleadoNombre(empleadoId));
    await supabaseAxios.post("/ph_auditoria_horario", [
      {
        horario_id: horarioId,
        empleado_id: empleadoId,
        empleado_nombre: nombreColaborador,
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
