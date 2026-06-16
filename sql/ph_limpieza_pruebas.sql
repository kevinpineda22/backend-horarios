-- ============================================================================
-- LIMPIEZA DE DATOS DE PRUEBA — Programador de Horarios
-- Deja el módulo "en blanco" para probar desde cero, CONSERVANDO la configuración.
--
-- ⚠️ DESTRUCTIVO E IRREVERSIBLE. Revisar antes de correr. Hacer backup si aplica.
-- ⚠️ NO toca las tablas compartidas con la empresa: `empleados` ni `sedes`.
--
-- BORRA (datos transaccionales / de prueba):
--   horarios, ph_auditoria_horario, ph_asignacion_jornada,
--   horas_compensacion (banco legacy), observaciones (novedades)
--
-- CONSERVA (configuración / catálogo):
--   ph_jornadas (los 2 turnos), ph_parametros_globales,
--   ph_sede_config (cupos), ph_sede_visibilidad, ph_notificacion_destinatarios
--
-- NOTA: los archivos adjuntos de incapacidades viven en el bucket de Storage
--   "documentos-observaciones-ph". El SQL borra los registros, NO los archivos.
--   Vaciar el bucket aparte (ver instrucciones al pie).
-- ============================================================================

begin;

-- Auditoría primero (referencia a horarios con ON DELETE SET NULL).
delete from public.ph_auditoria_horario;

-- Horarios generados.
delete from public.horarios;

-- Turnos base asignados a cada colaborador (vuelven a quedar "sin turno").
delete from public.ph_asignacion_jornada;

-- Banco de horas (modelo legacy; ya no se escribe, pero se limpia el histórico).
delete from public.horas_compensacion;

-- Novedades (estudio, incapacidad, etc.).
delete from public.observaciones;

commit;

-- ---------------------------------------------------------------------------
-- Verificación (correr después; todas deben dar 0):
--   select count(*) from public.horarios;
--   select count(*) from public.ph_auditoria_horario;
--   select count(*) from public.ph_asignacion_jornada;
--   select count(*) from public.horas_compensacion;
--   select count(*) from public.observaciones;
--
-- Storage (archivos de incapacidad): en el panel de Supabase →
--   Storage → bucket "documentos-observaciones-ph" → seleccionar todo → borrar.
-- ---------------------------------------------------------------------------
