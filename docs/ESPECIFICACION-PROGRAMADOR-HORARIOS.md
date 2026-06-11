# Programador de Horarios — Construahorro

> Documentación técnica del módulo de programación de horarios, horas extras y
> novedades. Cubre **lo que existe hoy**, la **brecha** contra la especificación
> solicitada, y el **diseño para volver el sistema autogestivo** (configurable por
> un administrador, no por el programador).

- **Backend:** `C:\Users\johan.sanchez\Desktop\BACKEND\backendHorarios`
- **Frontend:** `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios`
- **Stack:** Node.js + Express (ESM) · Supabase (PostgREST + Storage + Auth JWT) ·
  Nodemailer (Outlook/365) · React (frontend)

---

## 1. Resumen ejecutivo

El módulo funciona, pero **todas las reglas de negocio están escritas en código**
(`src/utils/schedule.js`). Jornadas, lapsos horarios, capacidades diarias y
semanales, descansos y hasta la elección del día de jornada reducida (vía
`Math.random()`) están **hardcodeadas**.

El requisito central nuevo —que la programación, la asignación de horas y la
**creación de los lapsos de horario base sea autogestiva**— no es "agregar un
panel". Es **invertir el modelo**:

| Hoy | Objetivo |
|-----|----------|
| Las reglas viven en el código | Las reglas viven en la **base de datos** |
| Cambiar una jornada = editar JS y desplegar | Cambiar una jornada = formulario del admin |
| No existe el concepto de "turno"/"lapso" | Turnos/lapsos como entidad CRUD |
| El programador es el cuello de botella | El admin gestiona sin tocar código |

> **El código debe pasar de DEFINIR las reglas a LEER las reglas.**

---

## 2. Estado actual del sistema

### 2.1 Arquitectura

```
app.js
 ├─ /api/horarios            → routes/horarios.js        → horariosController.js
 ├─ /api/observaciones       → routes/observaciones.js   → observacionesController.js
 ├─ /api/empleados           → routes/empleadosRoutes.js → empleadosController.js
 ├─ /api/horas-compensacion  → routes/hoursBank.js       → hoursBankController.js
 └─ /api/public              → routes/public.js          (consulta pública por cédula)

src/utils/schedule.js   → TODA la lógica de generación de horarios (hardcodeada)
src/utils/holidays.js   → festivos Colombia (date-holidays)
src/services/           → supabaseAxios (PostgREST), emailService (nodemailer)
src/middlewares/        → authMiddleware (verifica JWT de Supabase)
```

No hay ORM: se habla con Supabase vía **PostgREST** (URLs tipo
`/horarios?empleado_id=eq.<id>`) usando un cliente axios (`supabaseAxios`).

### 2.2 Modelo de datos actual (inferido del código)

| Tabla | Uso | Campos relevantes |
|-------|-----|-------------------|
| `empleados` | Colaboradores | `id`, `cedula`, `nombre_completo`, `rol`, `empresa_id`, `sede_id`, `correo_electronico`, `estado` |
| `empresas` | Catálogo | `id`, `nombre` |
| `sedes` | Catálogo | `id`, `nombre` *(solo nombre — sin configuración de turnos)* |
| `horarios` | Horario semanal generado | `id`, `empleado_id`, `fecha_inicio`, `fecha_fin`, `dias` (JSONB), `total_horas_semana`, `tipo`, `estado_visibilidad` (`publico`/`archivado`), `creado_por` |
| `observaciones` | Novedades | `id`, `empleado_id`, `tipo_novedad`, `fecha_novedad`, `observacion`, `details` (JSONB), `documento_*`, `revisada` |
| `horas_compensacion` | Banco de horas | `id`, `empleado_id`, `semana_inicio`, `semana_fin`, `horas_excedidas`, `horas_pendientes`, `estado` (`pendiente`/`parcial`/`aplicado`/`anulado`) |

El campo `horarios.dias` es un array JSONB; cada día:
```jsonc
{
  "fecha": "2026-06-09",
  "descripcion": "Lunes",
  "horas": 10, "horas_base": 8, "horas_extra": 2,
  "bloques": [{ "start": "...T07:00:00", "end": "...T09:00:00", "hours": 2 }],
  "jornada_entrada": "07:00", "jornada_salida": "18:00",
  "jornada_reducida": false, "tipo_jornada_reducida": null,
  "es_festivo": false, "festivo_trabajado": false
}
```

### 2.3 Reglas de negocio HARDCODEADAS (`src/utils/schedule.js`)

| Constante / lógica | Valor actual | Dónde |
|--------------------|--------------|-------|
| Límite legal diario | 8h (L-V), 4h (Sáb) | `getLegalCapForDay` |
| Capacidad regular diaria | 10h (L-V), 7h (Sáb) | `getRegularDailyCap` |
| Extra pagable diaria | 2h (L-V), 3h (Sáb) | `getPayableExtraCapForDay` |
| Límite legal **semanal** | 44h | `WEEKLY_LEGAL_LIMIT` |
| Límite extra **semanal** | 12h | `WEEKLY_EXTRA_LIMIT` |
| Límite total **semanal** | 56h | `WEEKLY_TOTAL_LIMIT` |
| Festivo trabajado | 6h | `HOLIDAY_HOURS` |
| Descanso desayuno | 15 min @ 09:00 | `getDayInfo` |
| Descanso almuerzo | 45 min @ 12:00 | `getDayInfo` |
| Lapso L-V | 07:00 → 18:00 | `getDayInfo` (segments) |
| Lapso Sábado | 07:00 → **15:00** | `getDayInfo` ⚠️ spec pide 14:00 |
| Máx. extra por día | 4h | `MAX_OVERTIME_PER_DAY` (controller) |
| Día de jornada reducida | **aleatorio** (`Math.random`) | `generateScheduleForRange56` |
| Asignación de horas en bloques | **aleatoria** | `allocateHoursRandomly` |

### 2.4 Endpoints actuales

**Horarios** (`/api/horarios`)
- `GET /:empleado_id` — horarios activos (`estado_visibilidad=publico`)
- `GET /:empleado_id/completo` — incluye archivados
- `POST /` — genera horario(s) semanal(es); valida bloqueos por novedades, aplica
  banco de horas opcional, archiva los anteriores, envía correo al empleado
- `PATCH /:id` — edición manual por día; recalcula base/extra/bloques, valida
  límites diarios y semanales, actualiza el banco de horas
- `DELETE /:id` — elimina un horario
- `PATCH /archivar` — archiva todos los de un empleado

**Observaciones / Novedades** (`/api/observaciones`)
- `GET /:empleado_id`, `POST /` *(auth)*, `PUT /:id`, `DELETE /:id`
- `POST /stats`, `PATCH /:empleado_id/marcar-revisadas` *(auth+HR)*,
  `PATCH /:id/revisar` *(auth+HR)*, `GET /permissions` *(auth)*

**Banco de horas** (`/api/horas-compensacion`)
- `GET /:empleadoId/pending`, `GET /:empleadoId/history`,
  `PATCH /apply/:empleadoId`, `PATCH /:id/annul`

**Empleados** (`/api/empleados`)
- `GET /`, `POST /`, `POST /upload` (Excel/CSV), `PATCH /:id` (estado)

**Público** (`/api/public`)
- `GET /festivos`, `POST /consulta-horarios` (por cédula), `POST /observaciones-stats`

### 2.5 Novedades soportadas hoy

Tipos que **bloquean** el horario (`BLOCKING_NOVEDADES`): `Incapacidades`,
`Licencias`, `Vacaciones`, `Permisos`, `Estudio`, `Día de la Familia`.

- **Estudio** es un bloqueo **parcial**: resta los rangos horarios del día
  (`subtractTimeRanges`) y se compensa con el banco de horas (`applyBankedHours`).
- **Incapacidad**: subtipos actuales = `Incidente de Trabajo` y `Enfermedad General`.
  Documentos: archivo de incapacidad + historia clínica (según subtipo/duración).
  Notifica a correos del área SST (`NOTIFICATION_EMAILS_SST`).

---

## 3. Brecha: especificación solicitada vs. implementación actual

| # | Requisito de la spec | Estado hoy | Acción |
|---|----------------------|------------|--------|
| 2.1 | Jornada L-V 07:00–18:00, Sáb 07:00–**14:00** | L-V ok; **Sáb 07:00–15:00** | ⚠️ Corregir + parametrizar |
| 2.2 | Sede con 4 colaboradores: 2 en 07:00–16:00 y 2 en 09:00–18:00 | **No existe** turno ni config por sede | ❌ Construir |
| 2.3 | Sábado automático según jornada (07-16→07-11, 09-18→10-14) | **No existe** ese vínculo; sábado es genérico/aleatorio | ❌ Construir |
| 2.3 | Sábado **no editable** por defecto | `PATCH /:id` permite editar cualquier día | ❌ Implementar candado |
| 3.1 | Al elegir colaborador mostrar solo 07-16 / 09-18 | El frontend solo elige días+rango, **no turnos** | ❌ Construir |
| 3.2 | Asignar sábado automático al guardar jornada | No hay jornada semanal por turno | ❌ Construir |
| 4.1 | Horas extras **por día**, sin registro masivo | `PATCH /:id` es por día ✅ (parcial) | 🟡 Reforzar |
| 4.2 | Validar máximo de extras **por quincena** + alerta | Solo valida por **semana** y por día | ❌ Agregar quincena |
| 5.1 | Editar por día + **intercambiar turnos** entre colaboradores | Editar sí; intercambio **no existe** | ❌ Construir |
| 5.2 | Auditoría: usuario, fecha, horario anterior, nuevo | Solo `creado_por` en creación; **sin historial de cambios** | ❌ Construir |
| 6 | Estudio: compensar con banco de horas | Existe (parcial/banco) ✅ | 🟡 Afinar política 4h/4h |
| 7.1 | Incapacidad: subtipos | Subtipos actuales: `Incidente`/`Enfermedad General` | ✅ Se mantienen (decisión: no renombrar) |
| 7.2 | Documentos: incapacidad + historia clínica | Existe ✅ | ✅ |
| 7.3 | Notificar a Valentina Flórez, Laura Obando, Laura Melisa Caro, Laura Ariza | Hoy va a correos genéricos de SST | ⚠️ Hacer destinatarios configurables |
| 8 | Reglas **configurables por parámetros** | Todo hardcodeado | ❌ **Núcleo del cambio** |

Leyenda: ✅ cumple · 🟡 parcial · ⚠️ desajuste a corregir · ❌ no existe

---

## 4. Cambios requeridos (especificación)

### 4.1 Configuración base (parámetros globales y por sede)
- Jornada global: L-V 07:00–18:00, Sáb 07:00–14:00.
- Por sede: 4 colaboradores, distribución obligatoria 2× (07:00–16:00) + 2× (09:00–18:00).

### 4.2 Regla de sábado automática (no editable)
| Jornada semanal | Sábado asignado |
|-----------------|-----------------|
| 07:00–16:00 | 07:00–11:00 |
| 09:00–18:00 | 10:00–14:00 |

### 4.3 Programación
- Al seleccionar colaborador: mostrar solo las jornadas válidas (07-16 / 09-18).
- Al guardar la jornada semanal: asignar sábado automáticamente; impedir inconsistencias.

### 4.4 Horas extras
- Registro **por día** (sin masivo).
- Acumulado y **alerta visual al alcanzar/superar el máximo por quincena**.

### 4.5 Cambios manuales
- Edición por día + intercambio de turnos entre colaboradores.
- **Auditoría obligatoria**: usuario, fecha, horario anterior, horario nuevo.

### 4.6 Novedad por estudio
- Programar secuencia de días de estudio; descontar automáticamente horas extras
  acumuladas. Política: en día laboral parcial de 8h → empresa cubre 4h, colaborador
  cubre 4h (descontar 4h del banco; el resto de extras no se afecta).

### 4.7 Novedad por incapacidad
- Tipos: **general** y **ARL**.
- Documentos obligatorios: archivo de incapacidad + historia clínica.
- Notificación automática a la lista de destinatarios (configurable).

---

## 5. Diseño para autogestión (propuesto)

> Objetivo: que un administrador cree y edite jornadas, lapsos, capacidades,
> descansos, límites y destinatarios **desde un panel**, y que el backend solo
> **lea** esas reglas.

### 5.1 Nuevas tablas (Supabase)

**`parametros_globales`** — clave/valor para reglas generales
```
clave (text, PK)        | valor (jsonb) | descripcion (text)
"limite_legal_semanal"  | 44
"limite_extra_semanal"  | 12
"limite_total_semanal"  | 56
"max_extra_por_dia"     | 4
"max_extra_por_quincena"| 24
"descansos"             | [{ "nombre":"desayuno","inicio":"09:00","min":15 }, ...]
```

**`jornadas`** (los "lapsos base" / turnos) — el corazón de la autogestión
```
id (uuid) | nombre ("Turno A 07-16") | sede_id (fk, nullable=global)
hora_entrada ("07:00") | hora_salida ("16:00")
sabado_entrada ("07:00") | sabado_salida ("11:00")   ← regla 2.3 como dato
dias_aplica (int[] {1..6}) | capacidad_diaria (num) | activo (bool)
```

**`sede_config`** — distribución obligatoria por sede
```
sede_id (fk) | jornada_id (fk) | cupos (int)
-- ej: sede X → jornada(07-16) cupos=2 ; jornada(09-18) cupos=2
```

**`asignacion_jornada`** — qué turno tiene cada colaborador y desde cuándo
```
id | empleado_id (fk) | jornada_id (fk) | vigente_desde | vigente_hasta (null=actual)
```

**`auditoria_horario`** — requisito 5.2
```
id | horario_id (fk) | empleado_id | fecha_cambio (timestamptz)
usuario_email | usuario_nombre | dia_afectado (date)
valor_anterior (jsonb) | valor_nuevo (jsonb) | tipo_cambio ("edicion"|"intercambio")
```

**`notificacion_destinatarios`** — requisito 7.3 configurable
```
id | tipo_novedad ("Incapacidades") | correo | nombre | activo
```

### 5.2 Refactor del backend

`src/utils/schedule.js` deja de exportar constantes y pasa a recibir un objeto
`config` cargado desde la BD. Patrón sugerido:

```
src/services/configService.js   ← carga parametros_globales + jornadas (con caché)
src/utils/schedule.js           ← funciones puras: reciben (config, ...args)
```

- `getLegalCapForDay`, `getPayableExtraCapForDay`, `WEEKLY_*`, descansos y lapsos
  pasan a leerse de `config`.
- La jornada reducida y la asignación en bloques dejan de ser `Math.random()`:
  se derivan de la **jornada asignada** al colaborador (determinístico).
- La regla de sábado (2.3) sale de `jornadas.sabado_entrada/salida` según el turno.

### 5.3 Nuevos endpoints CRUD (panel admin)

```
/api/config/parametros        GET, PATCH                 (parámetros globales)
/api/config/jornadas          GET, POST, PATCH, DELETE    (lapsos base / turnos)
/api/config/sedes/:id/cupos   GET, PUT                    (distribución 2+2)
/api/asignaciones             GET, POST, PATCH            (turno por colaborador)
/api/horarios/:id/intercambiar POST                       (swap entre colaboradores)
/api/horarios/:id/auditoria   GET                         (historial de cambios)
/api/config/notificaciones    GET, POST, PATCH, DELETE    (destinatarios por tipo)
```

> Proteger todos los `/api/config/*` con `authenticateUser` + verificación de rol
> admin (extender la lista `ALLOWED_EMAILS` / `role`).

### 5.4 Cambios en endpoints existentes
- `POST /api/horarios`: en vez de recibir `working_weekdays` sueltos, recibir
  `jornada_id`; derivar lapsos, capacidades y sábado desde la config.
- `PATCH /api/horarios/:id`: **bloquear edición del sábado** salvo override
  explícito; **registrar en `auditoria_horario`** (usuario del JWT, valor anterior
  vs. nuevo); validar **acumulado de extras por quincena**.

### 5.5 Frontend (panel de admin)
Nuevo panel bajo `Programador_horarios` (junto a `AdminProgramadorHorarios.jsx`):
- **Gestión de Jornadas**: CRUD de lapsos (entrada/salida, sábado, días, capacidad).
- **Configuración por sede**: definir los cupos 2+2.
- **Parámetros globales**: límites semanales/quincenales, descansos.
- **Destinatarios de notificación** por tipo de novedad.
- En `ScheduleCreator.jsx`: reemplazar los checkboxes de días por un **selector de
  jornada** (poblado desde `/api/config/jornadas`), mostrando solo las válidas para
  la sede del colaborador. El sábado se muestra como **solo lectura** (derivado).

---

## 6. Roadmap sugerido

| Fase | Entregable | Prioridad |
|------|-----------|-----------|
| 1 | Tablas `parametros_globales` + `jornadas` + `sede_config`; `configService` con caché | 🔴 Alta |
| 2 | Refactor `schedule.js` para leer `config` (sin cambiar comportamiento) | 🔴 Alta |
| 3 | CRUD `/api/config/*` + panel admin (jornadas, parámetros, cupos) | 🔴 Alta |
| 4 | `asignacion_jornada` + regla de sábado automática y no editable | 🟠 Media |
| 5 | `auditoria_horario` + bloqueo de sábado en edición | 🟠 Media |
| 6 | Validación de extras por **quincena** + alerta visual | 🟠 Media |
| 7 | Intercambio de turnos entre colaboradores | 🟢 Baja |
| 8 | Destinatarios de notificación configurables + alinear subtipos incapacidad (General/ARL) | 🟢 Baja |

---

## 7. Decisiones tomadas

> **Principio rector:** el desarrollador entrega la herramienta **sin parámetros
> sembrados**. TODO valor de negocio lo define el administrador desde el panel.

1. **Sábado (14:00 / 15:00)**: NO se decide en código. La hora de salida del sábado
   es un **campo configurable** (`jornadas.sabado_salida`). El admin la fija por turno.
2. **Quincena**: NO se decide en código. El admin define el **modelo de quincena**
   (fechas de corte) y el **máximo de extras por quincena** desde el panel.
3. **Incapacidad**: los subtipos actuales (`Incidente de Trabajo` / `Enfermedad
   General`) **se mantienen tal cual**. No se renombran.
4. **Límites y descansos**: todos configurables (`parametros_globales`).
5. **Seed inicial editable (decisión 2026-06-11)**: se permite **sembrar valores
   de partida** tomados de la especificación de negocio y de la ley laboral CO,
   mediante `db/ph_config_seed.sql`. Distinción clave: esto **no es hardcodear**.
   - Hardcodear = el valor vive en el código (`schedule.js`); cambiarlo exige
     desplegar. ❌
   - Sembrar = el valor vive como **fila editable** en las tablas `ph_*`; el admin
     lo cambia desde el panel cuando quiera. ✅
   Los valores no los inventa el desarrollador: provienen de la spec/ley. El único
   número sin evidencia (`max_extra_por_quincena`) **no se siembra**: lo carga el
   admin.

## 8. Riesgos técnicos (a resolver en implementación)

1. **Arranque "en frío"**: como no sembramos parámetros, el sistema **exige que el
   admin configure jornadas y parámetros antes de generar el primer horario nuevo**.
   El backend debe responder con un error claro ("Configuración incompleta: defina
   jornadas y parámetros en el panel") en vez de fallar silenciosamente.
2. **Horarios históricos**: los `horarios` ya generados se hicieron con los valores
   viejos hardcodeados. Se conservan como están (archivados/históricos); la nueva
   config solo aplica a horarios nuevos.
3. **Jornada reducida aleatoria**: hoy es `Math.random()`. Al derivarla del turno
   asignado pasa a ser determinística; solo aplica a horarios nuevos.
```
