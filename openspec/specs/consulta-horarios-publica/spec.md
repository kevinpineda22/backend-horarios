# Consulta Pública de Horarios — Specification

## Purpose

La consulta pública de horarios permite a cualquier empleado (sin autenticación) ingresar su número de cédula y visualizar su programación semanal con toda la información del sistema nuevo: turno base, horas base/extra, estudio, permisos, festivos trabajados, jornada reducida, redistribución, y bloqueos por novedades. Reemplaza por completo el componente anterior que dependía del sistema de banco de horas eliminado.

## Requirements

### Functional Requirements

#### FR1: Employee Lookup by Cédula

The system MUST provide a text input for the employee's cédula and a submit action.

- GIVEN a cédula input field
- WHEN the user submits the form
- THEN the system MUST send `POST /api/public/consulta-horarios` with body `{ "cedula": "<value>" }`

The system SHALL handle the following error responses from the API:

- **Empty cédula** — GIVEN the user submits with an empty cédula, WHEN the form validates, THEN the system MUST show a validation message "La cédula es requerida" without making an API call.
- **Employee not found** — GIVEN the cédula does not match any employee, WHEN the API returns 404, THEN the system MUST display "No se encontró información para la cédula ingresada".
- **Employee inactive** — GIVEN the employee exists but `estado !== "activo"`, WHEN the API returns 403, THEN the system MUST display "El empleado se encuentra inactivo".
- **Server error** — GIVEN a 500 response, WHEN the API fails, THEN the system MUST display "Error en la consulta. Intenta de nuevo más tarde."

#### FR2: Employee Info Display

Upon successful lookup, the system MUST display the employee's `nombre_completo` and current base shift information.

The system SHALL show the following `turno_base` fields when present: `nombre`, `hora_entrada`–`hora_salida` (Monday–Friday), `sabado_entrada`–`sabado_salida` (Saturday).

- GIVEN the employee has a current `ph_asignacion_jornada` (with `vigente_hasta = null`), WHEN the API returns a non-null `turno_base`, THEN the system MUST display the shift name and hours.
- GIVEN the employee has NO current shift assignment, WHEN `turno_base` is `null`, THEN the system MUST display "Sin turno base asignado".

#### FR3: Global Summary (Resumen)

The system MUST display an aggregate summary across ALL returned weeks, positioned above the weekly accordion.

The summary SHALL include these metrics calculated from the `dias[]` arrays across all `horarios`:

| Metric | Source | Condition |
|--------|--------|-----------|
| Total horas legales | `dias[].horas_base` | Sum of all `horas_base` across every day in every week |
| Total horas extra | `dias[].horas_extra` | Sum of all `horas_extra` across every day in every week |
| Total horas | Sum of horas_base + horas_extra | Same aggregation |
| Días laborados | Count of days | Days where `horas > 0` AND not a total block day |

The system MUST additionally show:

- **Estudio compensado** — IF any day has `es_estudio = true`, THEN show total estudio hours broken into "Colaborador" (`estudio_cubre_empresa = false`) and "Empresa" (`estudio_cubre_empresa = true`)
- **Horas de permiso** — IF any day has `horas_permiso > 0`, THEN show the total `horas_permiso` across all days

The system MUST NOT include or compute any bank hours concepts (`horas_extra_reducidas`, `horas_legales_reducidas`).

#### FR4: Weekly Breakdown (Accordion)

The system MUST render one collapsible panel per `horario` (week) in the API response.

Each week panel header SHALL show: `fecha_inicio` formatted as "DD/MM/YYYY" → `fecha_fin` formatted as "DD/MM/YYYY", and `total_horas_semana`.

The first week (index 0) MUST start open. All other weeks MUST start closed.

- GIVEN a list of 3 horarios, WHEN the page loads, THEN the first week panel is expanded and the remaining 2 are collapsed.
- GIVEN a collapsed week panel header, WHEN the user clicks it, THEN the panel expands with a smooth animation.
- GIVEN an expanded week panel header, WHEN the user clicks it, THEN the panel collapses with a smooth animation.

#### FR5: Day Card — Active Work Day

The system MUST render a day card with a **blue left border** for days that meet ALL of: `horas > 0`, NOT a total block, NOT Sunday.

The card SHALL display:

| Element | Source | Format |
|---------|--------|--------|
| Day name | Computed from `fecha` | "Lunes", "Martes", etc. |
| Date | `fecha` | "DD/MM/YYYY" |
| Jornada | `jornada_entrada` → `jornada_salida` | "HH:mm - HH:mm" |
| Horas base | `horas_base` | Badge: "Base: Xh" |
| Horas extra | `horas_extra` | Badge: "Extra: Xh" (only if > 0) |
| Total | Computed: `horas_base + horas_extra` | Badge: "Total: Xh" |

The card SHALL additionally show conditionally-applied badges:

| Badge | Condition | Display |
|-------|-----------|---------|
| Festivo trabajado | `es_festivo = true` AND `festivo_trabajado = true` | Badge: "Festivo: {festivo_nombre}" |
| Jornada reducida | `jornada_reducida = true` | Badge: "Reducida" with tooltip showing `tipo_jornada_reducida` ("entrar-tarde" or "salir-temprano") |
| Estudio | `es_estudio = true` AND `horas > 0` | Badge: "Estudio: Xh" |
| Permiso | `horas_permiso > 0` | Badge: "Permiso: Xh" |
| Redistribuidas | `horas_redistribuidas > 0` | Badge: "Redistribuidas: Xh" |

#### FR6: Day Card — Total Block Day

The system MUST render a day card with a **RED left border and light red background tint** for days that overlap with a "total block" novedad.

A "total block" novedad is any observation whose `tipo_novedad` is one of: `Incapacidades`, `Licencias`, `Vacaciones`, `Permisos` (where `details.horas_permiso` is absent/empty), `Día de la Familia`.

The card SHALL display:
- Day name
- Date
- Block reason (the `tipo_novedad` display name, e.g., "Vacaciones", "Incapacidad", "Licencia", "Día de la Familia")
- An icon indicating the day is blocked
- NO hours display (hours are overridden by the block)

- GIVEN an Incapacidad observation spans a date range, WHEN a day falls within that range, THEN the day card shows RED with "Incapacidad" and zero hours.
- GIVEN a day has both horas and a total block overlapping, THEN the total block overrides — the card MUST show as blocked and NOT display any hours.

#### FR7: Day Card — Partial Block / Study Day

The system MUST render a day card with an **AMBER/ORANGE left border** for days where `es_estudio = true` OR a partial Permiso applies.

**Partial Study (es_estudio = true with horas > 0):**
- Show all work info (as FR5) PLUS the study badge
- The card has an amber border

**Full Study Day (es_estudio = true with horas = 0):**
- Show: day name, date
- Display `estudio_modo` ("libre" or "redistribuir")
- Show compensation breakdown: study hours that are `estudio_compensa_banco` (compensated to bank) or `estudio_cubre_empresa` (covered by company)
- The card has an amber border

**Partial Permiso (horas_permiso > 0 without total block):**
- Show all work info plus "Permiso: Xh" badge
- The card has an amber border

#### FR8: Day Card — Sunday

The system MUST render a day card for days where `fecha` is a Sunday. The card SHALL display "Domingo" and the `domingo_estado` value ("compensado" or "sin-compensar").

- GIVEN a Sunday with `domingo_estado = "compensado"`, WHEN the card renders, THEN it shows "Domingo Compensado".
- GIVEN a Sunday with `domingo_estado = "sin-compensar"`, WHEN the card renders, THEN it shows "Domingo Sin Compensar".
- The system MUST NOT display any working hours for Sundays.

Style: Static visual — no hours shown, treated as a non-working day.

#### FR9: Day Card — Free Day

The system MUST render a day card with a **gray left border and light gray background** for days that do NOT match any other state: `horas = 0`, NOT a total block, NOT a Sunday, NOT a study day.

The card SHALL display: day name, date, and the label "Día Libre".

#### FR10: No Schedules Message

The system MUST show a specific message when the employee exists but has no horarios.

- GIVEN the API returns `empleado` with `horarios = []` (empty array), WHEN the results render, THEN the system MUST display "No hay horarios programados para este empleado".
- This includes cases where all horarios are archived (not returned by API due to `estado_visibilidad != "publico"`).

### Backend Requirements

#### BR1: Extend API Response with turno_base

The `POST /api/public/consulta-horarios` endpoint MUST include a `turno_base` field in the `empleado` object.

The response shape SHALL be:

```json
{
  "empleado": {
    "id": "uuid",
    "nombre_completo": "string",
    "estado": "activo",
    "turno_base": {
      "nombre": "string",
      "hora_entrada": "string (HH:mm)",
      "hora_salida": "string (HH:mm)",
      "sabado_entrada": "string (HH:mm)",
      "sabado_salida": "string (HH:mm)",
      "dias_aplica": "number[] (0=Sun, 1=Mon, ..., 6=Sat)"
    } | null
  },
  "horarios": [...],
  "observaciones": [...]
}
```

- The system MUST call `getJornadaBaseVigente(empleado.id)` from `phConfigController.js` to obtain the current assignment.
- If the employee has NO current assignment (`vigente_hasta = null` not found), `turno_base` MUST be `null`.
- Only horarios with `estado_visibilidad = "publico"` MUST be returned.
- The endpoint MUST remain unauthenticated (public).

#### BR2: Import Path

The import `getJornadaBaseVigente` in `public.js` SHALL import from `../controllers/phConfigController.js`:

```js
import { getJornadaBaseVigente } from "../controllers/phConfigController.js";
```

### UI/UX Requirements

#### UIR1: Loading State

While the API call is in flight, the system MUST show a loading indicator (spinner) in the results area. The input form MUST remain interactive.

#### UIR2: Error State

When the API returns an error (4xx or 5xx), the system MUST display the error message with an appropriate error icon. Previous results (if any) MUST be cleared.

#### UIR3: Empty State

- Employee not found: "No se encontró información" with search icon
- Employee inactive: "El empleado se encuentra inactivo" with warning icon
- No schedules: "No hay horarios programados para este empleado" with calendar icon
- No base shift: "Sin turno base asignado" displayed in employee info

#### UIR4: Transitions

Week panel expand/collapse SHALL use smooth animations (framer-motion). Animate: height (0 → auto), opacity, and a chevron rotation.

#### UIR5: Responsive Layout

The system MUST work on:

- **Mobile** (< 768px): Day cards in a single column
- **Desktop** (>= 768px): Day cards in a responsive grid (3 columns or auto-fill)

The week accordion SHALL use full width at all screen sizes.

#### UIR6: Color Coding

Day cards SHALL use these color conventions:

| State | Left Border | Background |
|-------|-------------|------------|
| Active work | `#3b82f6` (blue-500) | White |
| Total block | `#ef4444` (red-500) | `#fef2f2` (red-50) |
| Partial/Study | `#f59e0b` (amber-500) | `#fffbeb` (amber-50) |
| Free day | `#9ca3af` (gray-400) | `#f9fafb` (gray-50) |
| Sunday | `#9ca3af` (gray-400) | `#f9fafb` (gray-50) |

#### UIR7: Visual Style

The component SHALL match the existing app style: primary color `#210d65` (purple), clean sans-serif typography, rounded corners on cards (8px), subtle shadows.

### Data Requirements

#### DR1: Source of Truth

Every day field displayed in the UI MUST be read directly from the day object in the `dias[]` array. No derived/computed fields that don't exist in the data.

#### DR2: No Bank Hours

The system MUST NOT reference `horas_extra_reducidas`, `horas_legales_reducidas`, or any "reduced hours" concept anywhere in the component, CSS, or logic.

#### DR3: No Bank Sums

No SUM aggregation for bank hours or reduction concepts in the global summary or anywhere else.

#### DR4: Blocking Logic

The system MUST read the `observaciones` array from the API response and determine, for each day in each week, whether any observation overlaps with that day's date.

**Blocking classification:**

| Classification | tipo_novedad | Condition |
|---------------|--------------|-----------|
| Total block | `Incapacidades` | Always |
| Total block | `Licencias` | Always |
| Total block | `Vacaciones` | Always |
| Total block | `Día de la Familia` | Always |
| Total block | `Permisos` | `details.horas_permiso` is absent, empty, or undefined |
| Partial block | `Estudio` | Always (even if `horas = 0` — it's a study day) |
| Partial block | `Permisos` | `details.horas_permiso` is a non-empty array |

Date overlap: an observation overlaps a day if `day.date >= obs.startDate AND day.date <= obs.endDate`, where `startDate` and `endDate` are extracted from the observation's `details` following the same date inference logic in `horariosController.js` `normalizeBlockingObservation`.

#### DR5: Block Overrides Hours

If a day is classified as a total block, the day MUST display as blocked REGARDLESS of whether `horas > 0` in the day object. The block always overrides.

---

## Scenarios

### Scenario 1: Happy Path — Employee with Full Schedule

- GIVEN an active employee with 3 weeks of horarios
- AND weeks contain a mix of work days (M–F), one Colombian holiday (`es_festivo = true`), and free days
- AND the employee has an active jornada assignment
- WHEN the user submits a valid cédula
- THEN the page shows the employee name and turno base info
- AND the global summary shows aggregated totals
- AND the first week accordion is open, others are collapsed
- AND work days show blue bordered cards with badges
- AND the holiday shows "Festivo: {nombre}" badge
- AND free days show "Día Libre" with gray border
- AND no bank hours references appear anywhere

### Scenario 2: Employee with Blocks

- GIVEN an employee whose horarios include days overlapping with an Incapacidad observation
- AND other days overlapping with Estudio observation (with dias_estudio)
- WHEN the results render
- THEN the Incapacidad days display RED cards with "Incapacidad" and no hours
- AND the Estudio days display AMBER cards with study info and badges
- AND blocked days show hours = 0 even if the day object has horas > 0

### Scenario 3: Employee with No Schedules

- GIVEN an active employee with zero horarios in the API response
- WHEN the results render
- THEN the system shows "No hay horarios programados para este empleado"
- AND no global summary or weeks are shown
- AND the employee info is still displayed

### Scenario 4: Employee Not Found

- GIVEN the user enters a cédula that doesn't match any employee
- WHEN the API returns 404
- THEN the system shows "No se encontró información para la cédula ingresada"
- AND no employee info or schedules are displayed

### Scenario 5: Employee Inactive

- GIVEN the employee exists but `estado = "inactivo"`
- WHEN the API returns 403
- THEN the system shows "El empleado se encuentra inactivo"
- AND no further data is displayed

### Scenario 6: Employee with No Base Shift

- GIVEN an active employee with horarios but `turno_base = null`
- WHEN the results render
- THEN schedules display normally with all week panels and day cards
- AND the employee info section shows "Sin turno base asignado"
- AND the global summary still calculates correctly

### Scenario 7: Week with Study + Work Mix

- GIVEN an employee with a day where `es_estudio = true` AND `horas > 0`
- WHEN that day's card renders
- THEN it shows a blue border (active work) OR amber border (partial study) — work info with all badges
- AND includes an "Estudio: Xh" badge
- GIVEN a day where `es_estudio = true` AND `horas = 0`
- WHEN that day's card renders
- THEN it shows an amber border
- AND displays `estudio_modo` ("libre" or "redistribuir")
- AND shows the compensation breakdown

### Scenario 8: Sunday Handling

- GIVEN a horario that includes a Sunday
- AND the Sunday has `domingo_estado = "compensado"`
- WHEN that day's card renders
- THEN it displays "Domingo Compensado" with no hours
- AND it uses gray style (not blue, red, or amber)
- GIVEN a Sunday with `domingo_estado = "sin-compensar"`
- WHEN that day's card renders
- THEN it displays "Domingo Sin Compensar" with no hours

---

## Glossary

| Term | Definition |
|------|------------|
| Base shift (turno_base) | The employee's currently active jornada assignment (`ph_asignacion_jornada` with `vigente_hasta = null`) |
| Total block | A day fully overridden by a novedad (Incapacidad, Licencia, Vacaciones, full Permiso, Día de la Familia) — no hours worked |
| Partial block | A day with reduced hours due to Estudio or partial Permiso — work info is still shown alongside the block info |
| Bank hours | The old system of `horas_extra_reducidas` / `horas_legales_reducidas` — removed entirely |
| Jornada reducida | A day where the employee enters late ("entrar-tarde") or leaves early ("salir-temprano") |
