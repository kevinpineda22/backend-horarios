-- ============================================================================
-- Programador de Horarios — Fase 1: Cimientos de datos
-- Correr UNA sola vez en Supabase (el sistema aún no está en uso).
-- Reconstruye las tablas de la spec y siembra los 2 turnos base.
-- ============================================================================

-- 1) Turno base por colaborador, CON historial de vigencia (spec 3.1 / 8).
create table if not exists public.ph_asignacion_jornada (
  id uuid not null default gen_random_uuid (),
  empleado_id uuid not null,
  jornada_id uuid not null,
  vigente_desde date not null,
  vigente_hasta date null,
  creado_en timestamp with time zone not null default now(),
  creado_por text null,
  constraint ph_asignacion_jornada_pkey primary key (id),
  constraint ph_asignacion_jornada_empleado_id_fkey foreign key (empleado_id) references empleados (id) on delete cascade,
  constraint ph_asignacion_jornada_jornada_id_fkey foreign key (jornada_id) references ph_jornadas (id) on delete restrict
) tablespace pg_default;

create index if not exists idx_ph_asignacion_empleado on public.ph_asignacion_jornada using btree (empleado_id) tablespace pg_default;
create index if not exists idx_ph_asignacion_vigente on public.ph_asignacion_jornada using btree (empleado_id, vigente_hasta) tablespace pg_default;

-- 2) Historial auditable de cambios de horario (spec 5.2 / 8).
create table if not exists public.ph_auditoria_horario (
  id uuid not null default gen_random_uuid (),
  horario_id uuid null,
  empleado_id uuid null,
  dia_afectado date null,
  tipo_cambio text not null,
  valor_anterior jsonb null,
  valor_nuevo jsonb null,
  usuario_email text null,
  usuario_nombre text null,
  fecha_cambio timestamp with time zone not null default now(),
  constraint ph_auditoria_horario_pkey primary key (id),
  constraint ph_auditoria_horario_empleado_id_fkey foreign key (empleado_id) references empleados (id) on delete set null,
  constraint ph_auditoria_horario_horario_id_fkey foreign key (horario_id) references horarios (id) on delete set null
) tablespace pg_default;

create index if not exists idx_ph_auditoria_horario on public.ph_auditoria_horario using btree (horario_id) tablespace pg_default;
create index if not exists idx_ph_auditoria_empleado on public.ph_auditoria_horario using btree (empleado_id) tablespace pg_default;

-- 3) Catálogo de los 2 turnos, con su sábado derivado embebido (spec 2.1 / 2.3).
--    Correr SOLO si la tabla no los tiene ya (no hay unique en nombre).
insert into public.ph_jornadas
  (nombre, hora_entrada, hora_salida, sabado_entrada, sabado_salida, dias_aplica, activo)
select * from (values
  ('07:00 - 16:00', time '07:00', time '16:00', time '07:00', time '11:00', array[1,2,3,4,5,6], true),
  ('09:00 - 18:00', time '09:00', time '18:00', time '10:00', time '14:00', array[1,2,3,4,5,6], true)
) as v(nombre, hora_entrada, hora_salida, sabado_entrada, sabado_salida, dias_aplica, activo)
where not exists (select 1 from public.ph_jornadas where nombre = v.nombre);

-- 4) Cupos 2+2 por sede (spec 2.2): se configuran desde el panel "Sedes y Cupos",
--    porque dependen de los UUID de cada sede. (Cada sede: 2 cupos por turno.)
