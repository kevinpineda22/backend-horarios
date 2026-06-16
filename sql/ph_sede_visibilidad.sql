-- ============================================================================
-- Visibilidad de sedes en el Programador de Horarios.
-- Tabla PROPIA del módulo: NO toca la tabla compartida `sedes`.
-- Una sede se considera VISIBLE por defecto; solo se oculta si tiene una fila
-- con visible = false. Correr una vez en Supabase.
-- ============================================================================
create table if not exists public.ph_sede_visibilidad (
  sede_id uuid not null,
  visible boolean not null default true,
  constraint ph_sede_visibilidad_pkey primary key (sede_id),
  constraint ph_sede_visibilidad_sede_id_fkey
    foreign key (sede_id) references public.sedes (id) on delete cascade
);
