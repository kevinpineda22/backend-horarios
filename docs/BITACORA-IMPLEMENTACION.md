# Bitácora de implementación — Autogestión del Programador de Horarios

Registro cronológico de lo realizado y lo pendiente. Documento vivo.

## Convenciones

- **Prefijo de BD:** toda tabla nueva del módulo lleva `ph_` (PH = Programador de
  Horarios). Coherente con el bucket existente `documentos-observaciones-ph`.
- **Archivos backend:** los nuevos del módulo se nombran con `ph` (ej.
  `phConfigService.js`).
- **Principio rector:** el desarrollador entrega la herramienta **sin parámetros
  sembrados**. Todo valor de negocio lo define el administrador desde el panel.

---

## Fase 1 — Cimientos de datos + lectura de configuración ✅ (en curso)

**Fecha:** 2026-06-11

### Realizado
- **`db/ph_config_schema.sql`** — esquema SQL con 6 tablas (todas vacías):
  - `ph_parametros_globales` — límites, modelo de quincena, descansos (clave/valor).
  - `ph_jornadas` — lapsos base/turnos; incluye `sabado_entrada`/`sabado_salida`
    como dato configurable (la regla de sábado deja de estar en código).
  - `ph_sede_config` — distribución de cupos por sede y jornada (ej. 2 + 2).
  - `ph_asignacion_jornada` — turno por colaborador, con vigencia.
  - `ph_auditoria_horario` — historial auditable de cambios (requisito 5.2).
  - `ph_notificacion_destinatarios` — destinatarios por tipo de novedad (req. 7.3).
- **`src/services/phConfigService.js`** — lee `ph_parametros_globales` y
  `ph_jornadas` con caché en memoria (TTL 60s). Expone getters y
  `assertConfigCompleta()` que lanza `PhConfigIncompletaError` (HTTP 409) cuando
  el admin todavía no configuró. **Sin valores por defecto.**

### Acción manual requerida
- Ejecutar `db/ph_config_schema.sql` en el SQL Editor de Supabase. ✅ **Hecho (2026-06-11).**
- Verificar tipos de ID. ✅ **Confirmado:** `empleados.id`, `sedes.id`,
  `horarios.id` son `uuid`.

### Seed inicial editable — `db/ph_config_seed.sql` (2026-06-11)
- A pedido del usuario, se siembran valores de PARTIDA (de la spec + ley CO) como
  filas **editables**, no como código. Distinción documentada en
  `ESPECIFICACION-PROGRAMADOR-HORARIOS.md` §7.5.
- Carga: 2 jornadas (Turno A 07-16 / sáb 07-11, Turno B 09-18 / sáb 10-14),
  8 de 9 parámetros globales, y distribución 2+2 por sede.
- **No se siembra** `max_extra_por_quincena` (sin evidencia: lo pone el admin).
- Idempotente. Correr DESPUÉS del schema.

### Pendiente de la fase
- Replicar políticas RLS de las tablas existentes sobre las `ph_*` (si aplica).
- Admin: cargar `max_extra_por_quincena` (último parámetro) y, opcional,
  destinatarios de notificación.

---

## Fase 2 — Motor leyendo `config` ⏳ (en curso)

### Realizado (paso 2a — contrato + costura)
- **`docs/CONTRATO-CONFIGURACION-PH.md`** — contrato de configuración: qué guarda
  el admin en cada parámetro/jornada y con qué forma; derivación de capacidades;
  forma del objeto `config` normalizado. Es el idioma compartido panel ↔ motor.
- **`src/services/phConfigService.js`** — añadido:
  - `buildScheduleConfig()` → arma el `config` normalizado desde la BD.
  - `capLegalDia(config, isoWeekday)` → cap legal por día, leído del config.
  - `PARAMETROS_REQUERIDOS` ampliado a 9 claves (incluye `limite_legal_diario`
    y `horas_festivo_trabajado`).

### Pendiente (paso 2b — cirugía del motor)
- `src/utils/schedule.js`: que las funciones reciban `config` en vez de usar
  constantes internas (`WEEKLY_*`, `get*CapForDay`, descansos, `HOLIDAY_HOURS`).
- `src/controllers/horariosController.js`: cargar `config` con
  `buildScheduleConfig()` y pasarlo al motor.
- **Decisión de secuencia:** el candado `assertConfigCompleta()` en el flujo real
  de creación/edición se activa junto con la cirugía del motor (paso 2b) y el
  cableado de jornadas (Fase 4), para no romper el sistema que hoy funciona con
  las tablas aún vacías.

### Nota de alcance
- Los **lapsos/segmentos** (entrada/salida concretos por día) se derivan de la
  jornada asignada al colaborador → se cablean en **Fase 4** (necesitan
  `ph_asignacion_jornada` y que el frontend envíe `jornada_id`). En el paso 2b se
  parametrizan los **límites y caps globales**, que no dependen del colaborador.

## Fase 3 — Panel admin (CRUD) ⏳

- Endpoints `/api/config/*` (jornadas, parámetros, cupos, destinatarios).
- Invalidar caché de `phConfigService` tras cada escritura.
- Pantallas de administración en el frontend (`Programador_horarios`):
  gestión de jornadas, parámetros/quincena, cupos por sede, destinatarios.

## Fases siguientes (resumen)

- 4: asignación de jornada + regla de sábado automática y no editable.
- 5: auditoría en edición + bloqueo de sábado.
- 6: validación de extras por quincena + alerta visual.
- 7: intercambio de turnos entre colaboradores.
- 8: destinatarios de notificación configurables en el flujo de novedades.

> Detalle completo del diseño en `docs/ESPECIFICACION-PROGRAMADOR-HORARIOS.md`.
