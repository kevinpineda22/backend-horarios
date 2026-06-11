-- ============================================================================
-- Programador de Horarios (PH) — SEED de configuración (punto de partida)
-- ----------------------------------------------------------------------------
-- Carga valores INICIALES y EDITABLES tomados de la especificación de negocio
-- y del comportamiento actual del código (ley laboral CO). NO son valores
-- "hardcodeados": viven como filas que el admin puede editar desde el panel.
--
-- Idempotente: se puede correr más de una vez sin duplicar ni pisar ediciones
-- del admin (usa ON CONFLICT DO NOTHING / NOT EXISTS).
--
-- Ejecutar DESPUÉS de db/ph_config_schema.sql, en el SQL Editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Jornadas base (de la spec 2.2 y 2.3)
--    Turno A: 07:00–16:00  → sábado 07:00–11:00
--    Turno B: 09:00–18:00  → sábado 10:00–14:00
--    Globales (sede_id = null): aplican a todas las sedes salvo que se creen
--    jornadas específicas por sede.
-- ----------------------------------------------------------------------------
insert into ph_jornadas
  (nombre, sede_id, hora_entrada, hora_salida, sabado_entrada, sabado_salida, dias_aplica, capacidad_diaria, activo, creado_por)
select 'Turno A (07:00-16:00)', null, '07:00', '16:00', '07:00', '11:00', '{1,2,3,4,5,6}', null, true, 'seed-spec'
where not exists (select 1 from ph_jornadas where nombre = 'Turno A (07:00-16:00)');

insert into ph_jornadas
  (nombre, sede_id, hora_entrada, hora_salida, sabado_entrada, sabado_salida, dias_aplica, capacidad_diaria, activo, creado_por)
select 'Turno B (09:00-18:00)', null, '09:00', '18:00', '10:00', '14:00', '{1,2,3,4,5,6}', null, true, 'seed-spec'
where not exists (select 1 from ph_jornadas where nombre = 'Turno B (09:00-18:00)');

-- ----------------------------------------------------------------------------
-- 2) Parámetros globales (de la ley CO / código actual). 8 de 9 cargados.
--    Todos EDITABLES por el admin. Ver docs/CONTRATO-CONFIGURACION-PH.md
-- ----------------------------------------------------------------------------
insert into ph_parametros_globales (clave, valor, descripcion, actualizado_por) values
  ('limite_legal_semanal',    '44'::jsonb,                          'Horas legales por semana',                'seed-spec'),
  ('limite_extra_semanal',    '12'::jsonb,                          'Extras pagables por semana',              'seed-spec'),
  ('limite_total_semanal',    '56'::jsonb,                          'Total (legales + extras) por semana',     'seed-spec'),
  ('max_extra_por_dia',       '4'::jsonb,                           'Máximo de extras en un día',              'seed-spec'),
  ('limite_legal_diario',     '{"semana": 8, "sabado": 4}'::jsonb,  'Cap legal por tipo de día',               'seed-spec'),
  ('horas_festivo_trabajado', '6'::jsonb,                           'Horas de un festivo que se trabaja',      'seed-spec'),
  ('descansos',
     '[{"nombre": "desayuno", "inicio": "09:00", "duracion_min": 15}, {"nombre": "almuerzo", "inicio": "12:00", "duracion_min": 45}]'::jsonb,
     'Pausas que se restan de la jornada', 'seed-spec'),
  ('modelo_quincena',         '{"tipo": "fijo"}'::jsonb,            'Quincenas 1-15 y 16-fin de mes (ajustable)', 'seed-spec')
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 3) EL ÚNICO valor que falta — solo el admin lo sabe (no lo invento).
--    Descomentá y poné el número real de máximo de extras por quincena:
-- ----------------------------------------------------------------------------
-- insert into ph_parametros_globales (clave, valor, descripcion, actualizado_por)
-- values ('max_extra_por_quincena', '24'::jsonb, 'Máximo de extras acumuladas por quincena', 'admin')
-- on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 4) Distribución por sede (spec 2.2: 2 + 2). Crea 2 cupos por turno en CADA
--    sede existente. Editable luego desde el panel. Idempotente.
-- ----------------------------------------------------------------------------
insert into ph_sede_config (sede_id, jornada_id, cupos)
select s.id, j.id, 2
from sedes s
cross join ph_jornadas j
where j.nombre in ('Turno A (07:00-16:00)', 'Turno B (09:00-18:00)')
on conflict (sede_id, jornada_id) do nothing;

-- ----------------------------------------------------------------------------
-- 5) Destinatarios de notificación (OPCIONAL — referencia).
--    La spec 7.3 nombra a Valentina Flórez, Laura Obando, Laura Melisa Caro y
--    Laura Ariza, pero NO trae sus correos. Abajo quedan los correos del área
--    SST que el código usa HOY, como punto de partida. El admin debe
--    reconciliar nombres ↔ correos reales desde el panel.
-- ----------------------------------------------------------------------------
-- insert into ph_notificacion_destinatarios (tipo_novedad, correo, nombre, activo) values
--   ('Incapacidades', 'auxiliarsst@merkahorrosas.com',        null, true),
--   ('Incapacidades', 'sistemageneralsst@merkahorrosas.com',  null, true),
--   ('Incapacidades', 'analistajuniordh@merkahorrosas.com',   null, true),
--   ('Incapacidades', 'analistadh@merkahorrosas.com',          null, true),
--   ('Incapacidades', 'asistentegh@merkahorrosas.com',         null, true)
-- on conflict (tipo_novedad, correo) do nothing;

-- ============================================================================
-- Tras correr este seed, la configuración queda 8/9. Falta solo
-- `max_extra_por_quincena` (punto 3). Hasta cargarlo, assertConfigCompleta()
-- seguirá marcando la config como incompleta — a propósito.
-- ============================================================================
