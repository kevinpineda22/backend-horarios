-- ============================================================================
-- Programador de Horarios (PH) — Esquema de configuración autogestiva
-- ----------------------------------------------------------------------------
-- Fase 1: tablas de configuración. TODAS nacen VACÍAS.
-- El desarrollador NO siembra valores de negocio: el administrador los define
-- desde el panel. Convención: toda tabla nueva lleva el prefijo `ph_`
-- (PH = Programador de Horarios).
--
-- Ejecutar en el SQL Editor de Supabase.
-- NOTA: las FK asumen que empleados.id, sedes.id y horarios.id son UUID.
--       Si en tu instancia alguno es bigint/serial, ajustá el tipo de la
--       columna referenciante antes de correr.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Parámetros globales (clave/valor) — límites, quincena, descansos, etc.
--    El admin decide TODO esto. Sin filas por defecto.
-- ----------------------------------------------------------------------------
create table if not exists ph_parametros_globales (
  clave           text primary key,
  valor           jsonb not null,
  descripcion     text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

comment on table ph_parametros_globales is
  'PH: parámetros de negocio configurables por el admin (límites semanales/quincenales, modelo de quincena, descansos). Sin valores sembrados por el desarrollador.';

-- ----------------------------------------------------------------------------
-- 2) Jornadas (los "lapsos base" / turnos) — el corazón de la autogestión.
--    Incluye la regla de sábado como DATO (no como código).
-- ----------------------------------------------------------------------------
create table if not exists ph_jornadas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  sede_id          uuid references sedes(id) on delete cascade, -- null = jornada global
  hora_entrada     time not null,
  hora_salida      time not null,
  sabado_entrada   time,                 -- regla de sábado: el admin la define
  sabado_salida    time,                 -- (p. ej. 07:00→11:00 ó 10:00→14:00)
  dias_aplica      int[] not null,       -- días ISO 1..7 (sin default: el admin elige)
  capacidad_diaria numeric(4,2),         -- opcional; si null se deriva de entrada/salida
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  creado_por       text
);

create index if not exists idx_ph_jornadas_sede   on ph_jornadas (sede_id);
create index if not exists idx_ph_jornadas_activo on ph_jornadas (activo);

comment on table ph_jornadas is
  'PH: lapsos horarios base (turnos) que el admin crea y asigna. La hora de salida del sábado vive aquí como dato configurable, no en el código.';

-- ----------------------------------------------------------------------------
-- 3) Configuración por sede — distribución de cupos por jornada (ej: 2 + 2).
-- ----------------------------------------------------------------------------
create table if not exists ph_sede_config (
  id         uuid primary key default gen_random_uuid(),
  sede_id    uuid not null references sedes(id)      on delete cascade,
  jornada_id uuid not null references ph_jornadas(id) on delete cascade,
  cupos      int  not null check (cupos >= 0),
  creado_en  timestamptz not null default now(),
  unique (sede_id, jornada_id)
);

create index if not exists idx_ph_sede_config_sede on ph_sede_config (sede_id);

comment on table ph_sede_config is
  'PH: cuántos colaboradores van en cada jornada por sede (la distribución obligatoria la define el admin).';

-- ----------------------------------------------------------------------------
-- 4) Asignación de jornada por colaborador (con vigencia).
-- ----------------------------------------------------------------------------
create table if not exists ph_asignacion_jornada (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references empleados(id)  on delete cascade,
  jornada_id    uuid not null references ph_jornadas(id) on delete restrict,
  vigente_desde date not null,
  vigente_hasta date,                    -- null = asignación vigente
  creado_en     timestamptz not null default now(),
  creado_por    text
);

create index if not exists idx_ph_asignacion_empleado on ph_asignacion_jornada (empleado_id);
create index if not exists idx_ph_asignacion_vigente  on ph_asignacion_jornada (empleado_id, vigente_hasta);

comment on table ph_asignacion_jornada is
  'PH: qué jornada/turno tiene cada colaborador y desde cuándo.';

-- ----------------------------------------------------------------------------
-- 5) Auditoría de cambios de horario (requisito 5.2).
-- ----------------------------------------------------------------------------
create table if not exists ph_auditoria_horario (
  id              uuid primary key default gen_random_uuid(),
  horario_id      uuid references horarios(id)  on delete set null,
  empleado_id     uuid references empleados(id) on delete set null,
  dia_afectado    date,
  tipo_cambio     text not null,         -- 'edicion' | 'intercambio'
  valor_anterior  jsonb,
  valor_nuevo     jsonb,
  usuario_email   text,
  usuario_nombre  text,
  fecha_cambio    timestamptz not null default now()
);

create index if not exists idx_ph_auditoria_horario  on ph_auditoria_horario (horario_id);
create index if not exists idx_ph_auditoria_empleado on ph_auditoria_horario (empleado_id);

comment on table ph_auditoria_horario is
  'PH: historial auditable de cambios de horario (quién, cuándo, valor anterior y nuevo).';

-- ----------------------------------------------------------------------------
-- 6) Destinatarios de notificación por tipo de novedad (requisito 7.3).
-- ----------------------------------------------------------------------------
create table if not exists ph_notificacion_destinatarios (
  id           uuid primary key default gen_random_uuid(),
  tipo_novedad text not null,
  correo       text not null,
  nombre       text,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  unique (tipo_novedad, correo)
);

create index if not exists idx_ph_notif_tipo on ph_notificacion_destinatarios (tipo_novedad, activo);

comment on table ph_notificacion_destinatarios is
  'PH: a quién se notifica por cada tipo de novedad (configurable por el admin, sin correos hardcodeados).';

-- ============================================================================
-- RLS: estas tablas deben seguir la MISMA postura de seguridad que el resto
-- del esquema (el backend escribe con la service key vía PostgREST). Si tu
-- proyecto usa RLS en las tablas existentes, replicá las políticas aquí.
-- ============================================================================
