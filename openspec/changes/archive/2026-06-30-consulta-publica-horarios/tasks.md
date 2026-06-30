# Tasks: Consulta Pública de Horarios

## Delivery Strategy

- **exception-ok**: No size restriction, no chained PRs needed.
- **No commits**: Do NOT include any commit/PR steps — implementation only.

---

## Task Dependency Graph

```
T1 (Backend: turno_base)
  │
  ▼
T2 (Blocking Logic Utils) ──┐
                            ├──► T4 (Page Shell) ──► T5 (EmployeeInfo) ──► T6 (GlobalSummary) ──► T7 (WeekPanel) ──► T8 (DayCard)
T3 (Formatting Utils) ──────┘                                                                                              │
                                                                                                                          │
                                                                                                                          ▼
                                                                                                                     T9 (CSS)
```

- T1 is independent — can run in parallel with T2, T3.
- T2 + T3 feed into T4 (Page Shell needs both utility sets).
- T4 through T8 are sequential (each sub-component depends on the shell).
- T9 (CSS) can partially overlap with T4–T8 but must be done before the final render test.

---

## Phase 1: Backend

### T1 — Add `getJornadaBaseVigente` import and `turno_base` in response

**Description**: Extend the `POST /api/public/consulta-horarios` endpoint to fetch the employee's current base shift assignment and include it in the response.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\BACKEND\backendHorarios\src\routes\public.js`

**Dependencies**: None (independent).

**Implementation**:

1. **Add import** at the top of `public.js`:
   ```js
   import { getJornadaBaseVigente } from "../controllers/phConfigController.js";
   ```

2. **Fetch turno_base** after finding the employee (after line 97, before querying horarios):
   ```js
   let turno_base = null;
   try {
     const asignacion = await getJornadaBaseVigente(empleado.id);
     turno_base = asignacion?.ph_jornadas || null;
   } catch (e) {
     console.error("Error fetching turno_base:", e.message);
     // Graceful degradation — turno_base stays null, don't block the response
   }
   ```

3. **Include in response** — modify the response object (around line 115-119):
   ```js
   res.json({
     empleado: { ...empleado, turno_base },
     horarios: horariosData || [],
     observaciones: observacionesData || []
   });
   ```
   Note: Destructure `empleado` via spread so that `turno_base` is merged into the empleado object (`{ ...empleado, turno_base }`).

4. **Error handling**: Wrap the `getJornadaBaseVigente` call in try/catch. If it fails, `turno_base` is `null`. The rest of the response still works. Log the error server-side for debugging.

**Acceptance criteria**:
- [ ] `getJornadaBaseVigente` is imported from `phConfigController.js`
- [ ] Response includes `turno_base` (with `nombre`, `hora_entrada`, `hora_salida`, `sabado_entrada`, `sabado_salida`, `dias_aplica`) inside the `empleado` object
- [ ] When employee has NO current assignment, `turno_base` is `null`
- [ ] When `getJornadaBaseVigente` throws, the endpoint still returns a valid response with `turno_base = null`
- [ ] No circular dependency introduced (phConfigController does NOT import from public.js — verified: phConfigController imports only from `supabaseAxios.js`)

**Estimated effort**: Small (~10–15 lines changed in a single file)

---

## Phase 2: Frontend — Core Utilities

### T2 — Create blocking logic utilities (normalizeObservation, classifyDay, BlockingTypes)

**Description**: Implement the frontend-side blocking logic that replicates the backend's `normalizeBlockingObservation` date inference. This is necessary because the endpoint does not pre-process observations into date ranges — the frontend does that.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.jsx`

(All utilities are module-level functions at the top of the same file, above the component.)

**Dependencies**: None (independent of components).

**Implementation details**:

1. **Define constants**:
   ```js
   const BLOCKING_NOVEDAD_TYPES = new Set([
     "Incapacidades", "Licencias", "Vacaciones", "Permisos",
     "Estudio", "Día de la Familia",
   ]);
   ```

2. **Helper: `isTotalBlock(block)`** — returns `true` if the block's `tipo` is Incapacidades, Licencias, Vacaciones, Día de la Familia, or Permisos with no `details.horas_permiso`.

3. **Helper: `isPartialBlock(block)`** — returns `true` if the block's `tipo` is Estudio (always partial), or Permisos with `details.horas_permiso`.

4. **Helper: `parseDateOnlyUTC(value)`** — port the existing function (lines 90–102 of current file). Parses YYYY-MM-DD strings → Date objects at UTC midnight. Returns `null` for invalid input.

5. **Helper: `inferBlockingEnd(tipo, startDate, rawEnd, details)`** — port the existing function (lines 105–138 of current file). Date inference per tipo:
   - **Vacaciones**: try `details.fecha_fin_vacaciones` → `fecha_regreso_vacaciones` - 1d → duration-based fallback
   - **Licencias**: `details.fecha_termino` → `details.fecha_inicio`
   - **Incapacidades**: `details.fecha_fin` → `details.diasIncapacidad` (parse number from string)
   - **Permisos / Día de la Familia**: `details.fecha_fin` → `details.fecha_inicio`
   - **Estudio**: `details.dias_estudio[n-1].fecha` → `details.fecha_inicio`
   - Ultimate fallback: `endDate = startDate`

6. **Helper: `normalizeAndFilterBlockages(observaciones)`** — port the existing function (lines 141–184 of current file). Maps each observation to `{ id, tipo, observacion, start: Date, end: Date, details }`, filters out non-blocking types, sorts by start date.

7. **Helper: `classifyDay(dia, blocksForDay)`** — NEW function with priority chain:
   ```
   1. If blocksForDay has a total block → "total-block"
   2. If fecha is Sunday (day of week = 0) → "sunday"
   3. If es_estudio = true AND horas = 0 → "study-full"
   4. If es_estudio = true AND horas > 0 → "study-partial"
   5. If horas > 0 → "work"
   6. Otherwise → "free"
   ```
   Returns a classification string.

**Key edge cases**:
- Days that overlap with BOTH a total block and Estudio must be classified as "total-block" (priority chain)
- Empty/null `observaciones` array should not crash — return empty array
- `details` field should be parsed as object if it arrives as string (JSONB from PostgREST)

**Acceptance criteria**:
- [ ] `normalizeAndFilterBlockages` correctly infers date ranges for all observation types
- [ ] `classifyDay` correctly prioritizes: total-block > sunday > study-full > study-partial > work > free
- [ ] Empty observaciones returns empty array
- [ ] Invalid/missing `details` does not crash
- [ ] Functions are pure and independently testable
- [ ] All existing blocking logic from the old component is retained and cleaned

**Estimated effort**: Medium (~80–120 lines)

---

### T3 — Create formatting utilities (formatHours, formatTimeLabel, fmtFechaLarga, formatShortDate)

**Description**: Port the formatting helper functions from the old component but remove ALL bank-hours-related formatting. These functions are used across the main component and all sub-components.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.jsx`

(Module-level functions at the top of the file, after imports.)

**Dependencies**: None (independent).

**Functions to port (as-is)**:
- `formatHours(value)` — lines 29–34: Formats a number to 1 decimal, strips ".0" suffix. No changes needed.
- `formatTimeLabel(value)` — lines 36–45: Convert HH:mm to 12h format with a.m./p.m. No changes needed.
- `fmtFechaLarga(fecha)` — lines 47–56: Format ISO date to "d de MMMM de yyyy" in Spanish locale. No changes needed.
- `formatShortDate(fecha)` — lines 58–64: Format ISO date to "dd/MM/yyyy". No changes needed.

**What to REMOVE** (do not port):
- Any function that formats or displays `horas_extra_reducidas`, `horas_legales_reducidas`
- Any `reductionLabel` or bank-hours formatting

**Acceptance criteria**:
- [ ] `formatHours`: `7.0 → "7"`, `7.5 → "7.5"`, `0 → "0"`, `NaN → "0"`
- [ ] `formatTimeLabel`: `"07:00" → "7:00 a.m."`, `"14:30" → "2:30 p.m."`, `null → null`
- [ ] `fmtFechaLarga`: `"2026-06-15" → "15 de junio de 2026"`
- [ ] `formatShortDate`: `"2026-06-15" → "15/06/2026"`
- [ ] No bank-hours formatting logic present

**Estimated effort**: Small (~40 lines, mostly porting)

---

## Phase 3: Frontend — Components

### T4 — Build the Page Shell (ConsultaHorariosPublica main component)

**Description**: Rebuild the main `ConsultaHorariosPublica` component with modern state management. This is the orchestrator component that holds all state and renders sub-components.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.jsx`

**Dependencies**: T2 (blocking utils), T3 (formatting utils).

**Implementation**:

1. **State variables** (via `useState`):
   - `cedula` (string) — the input value
   - `empleado` (object|null) — API response employee
   - `horarios` (array) — sorted horarios with sorted `dias` arrays
   - `observaciones` (array) — normalized blockages from `normalizeAndFilterBlockages`
   - `loading` (boolean)
   - `error` (string|null)
   - `busquedaHecha` (boolean)
   - `openWeekId` (number|null) — NEW: ID of the currently open week panel

2. **`handleBuscar` function**:
   - Validate cedula is not empty (client-side: "La cédula es requerida")
   - Call `apiPublic.post("/consulta-horarios", { cedula })`
   - Sort horarios by `fecha_inicio` descending
   - Sort `dias` arrays by day-of-week order (wdOrder map) + fecha
   - Normalize observaciones via `normalizeAndFilterBlockages`
   - Set `openWeekId` to first horario's `id` if any exist
   - Handle errors: 404 → "No se encontró información", 403 → "El empleado se encuentra inactivo", 5xx → generic error

3. **Computed values** (via `useMemo`):
   - `blockingDatesMap` — builds `Map<"YYYY-MM-DD", BlockInfo[]>` from observaciones (same logic as current lines 254–267)

4. **Render structure**:
   ```
   <div class="pubcal-container">
     <div class="pubcal-card">
       <div class="pubcal-logo"><FaCalendarAlt /></div>
       <h1 class="pubcal-title">Consulta de Horarios</h1>
       <p class="pubcal-subtitle">...</p>

       <SearchForm /> (inline JSX, not a separate component)

       <AnimatePresence mode="wait">
         LoadingState / ErrorState / EmptyState / Results
       </AnimatePresence>
     </div>
   </div>
   ```

5. **State-based rendering** with `AnimatePresence` (framer-motion):
   - `loading` → spinner with "Buscando información..."
   - `error` → error message with `FaExclamationTriangle`
   - `busquedaHecha && !empleado` → "No se encontró información"
   - `empleado` (results) → renders: `EmployeeInfo` + `GlobalSummary` + `WeekPanel[]`

6. **Import changes from old component**:
   - Keep all existing imports (`React`, `useMemo`, `useState`, `useCallback`, framer-motion, react-icons, `apiPublic`, `date-fns`, CSS)
   - The `wdOrder` map stays as-is (lines 68–78)

**What to REMOVE from old state logic**:
- `totalReduccionBanco` computation
- `horas_extra_reducidas` / `horas_legales_reducidas` references in resumenGlobal
- The `sum-card.bank` rendering block

**Acceptance criteria**:
- [ ] 8 state variables correctly initialized
- [ ] Form submission calls API with cedula
- [ ] Loading shows spinner, error shows error message, empty shows "no se encontró"
- [ ] Results show all sub-components: EmployeeInfo, GlobalSummary, WeekPanel list
- [ ] First week opens by default (openWeekId set)
- [ ] Empty horarios array shows "No hay horarios programados" message
- [ ] No bank hours references anywhere in the component

**Estimated effort**: Medium (~150–200 lines)

---

### T5 — Build EmployeeInfo sub-component

**Description**: Display the employee's name and current base shift (turno_base) info. Renders inside the results section.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.jsx`

(Sub-component defined in the same file, below the main component.)

**Dependencies**: T4 (page shell exists, passes empleado as prop).

**Implementation**:

1. **Component signature**: `const EmployeeInfo = ({ empleado }) => { ... }`

2. **Name display**:
   ```jsx
   <div className="pubcal-emp">
     <FaUser /> <b>{empleado.nombre_completo}</b>
   </div>
   ```

3. **Turno base info**:
   ```jsx
   {empleado.turno_base ? (
     <div className="pubcal-turno">
       <FaClock />
       <span>
         Turno: <strong>{empleado.turno_base.nombre}</strong>
         {" — "}
         {formatTimeLabel(empleado.turno_base.hora_entrada)} – {formatTimeLabel(empleado.turno_base.hora_salida)}
         {empleado.turno_base.sabado_entrada && (
           <> / Sáb: {formatTimeLabel(empleado.turno_base.sabado_entrada)} – {formatTimeLabel(empleado.turno_base.sabado_salida)}</>
         )}
       </span>
     </div>
   ) : (
     <div className="pubcal-turno sin-turno">
       <FaInfoCircle /> Sin turno base asignado
     </div>
   )}
   ```

4. **CSS classes needed** (write in T9, but reference them now):
   - `.pubcal-emp` — already exists
   - `.pubcal-turno` — new, for turno info layout
   - `.pubcal-turno.sin-turno` — new, muted style when no shift

**Acceptance criteria**:
- [ ] Employee full name is displayed with user icon
- [ ] When `turno_base` exists: shows shift name, entrance–exit times, Saturday times if present
- [ ] When `turno_base` is null: shows "Sin turno base asignado"
- [ ] Uses `formatTimeLabel` for time display
- [ ] Properly handles missing `sabado_entrada`/`sabado_salida`

**Estimated effort**: Small (~40 lines)

---

### T6 — Build GlobalSummary sub-component

**Description**: Display aggregate statistics across all weeks. Stat cards for legal hours, extra hours, total hours, days worked. Conditional cards for estudio compensado and horas permiso.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.jsx`

(Sub-component defined in the same file.)

**Dependencies**: T4 (page shell passes horarios data).

**Implementation details**:

1. **Component signature**: `const GlobalSummary = ({ horarios }) => { ... }`

2. **Computed totals** via `useMemo`:
   ```js
   const summary = useMemo(() => {
     const dias = horarios.flatMap(w => w.dias || []);
     return {
       totalBase: dias.reduce((s, d) => s + (d.horas_base || 0), 0),
       totalExtra: dias.reduce((s, d) => s + (d.horas_extra || 0), 0),
       totalHoras: dias.reduce((s, d) => s + (d.horas || 0), 0),
       totalDias: dias.filter(d => (d.horas || 0) > 0).length,
       totalEstudio: dias.reduce((s, d) => s + (d.horas_estudio || 0), 0),
       totalPermiso: dias.reduce((s, d) => s + (d.horas_permiso || 0), 0),
       estudioCompensaBanco: dias.reduce((s, d) => s + (d.estudio_compensa_banco || 0), 0),
       estudioCubreEmpresa: dias.reduce((s, d) => s + (d.estudio_cubre_empresa || 0), 0),
     };
   }, [horarios]);
   ```

3. **StatCard helper** (inline, not a separate function):
   ```jsx
   const StatCard = ({ label, value, unit = "h", className = "" }) => (
     <div className={`sum-card ${className}`}>
       <span>{label}</span>
       <strong>{formatHours(value)}{unit}</strong>
     </div>
   );
   ```

4. **Always-show cards**:
   - H. Legales (`.sum-card.legal`): `summary.totalBase`
   - H. Extras (`.sum-card.extra`): `summary.totalExtra`
   - Total Horas (`.sum-card.total`): `summary.totalHoras`
   - Días Lab. (`.sum-card.dias`): `summary.totalDias` (unit: "")

5. **Conditional cards** (only render when > 0):
   - **Estudio compensado**: if `summary.totalEstudio > 0`
     - Split into "Colaborador" (`estudioCompensaBanco`) and "Empresa" (`estudioCubreEmpresa`)
   - **Horas permiso**: if `summary.totalPermiso > 0`
     - Card: P. Permiso with total permiso hours

6. **What NOT to render**:
   - NO `sum-card.bank`
   - NO banco apilcado / reduction
   - NO `horas_extra_reducidas` / `horas_legales_reducidas` references

**Acceptance criteria**:
- [ ] Stat cards render: legal, extra, total, días
- [ ] Conditional estudio cards render when `horas_estudio > 0`
- [ ] Conditional permiso card renders when `horas_permiso > 0`
- [ ] Study compensation shows breakdown (colaborador vs empresa)
- [ ] No bank hours cards or references
- [ ] Computation uses `useMemo` and re-computes when `horarios` changes
- [ ] Previous search results clear when a new search starts

**Estimated effort**: Medium (~60–80 lines)

---

### T7 — Build WeekPanel accordion component

**Description**: Collapsible panel per horario week. Header shows date range + total hours. First week open by default. Uses framer-motion for smooth animation.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.jsx`

(Sub-component defined in the same file.)

**Dependencies**: T4 (page shell passes horarios, openWeekId, toggle handler), T3 (formatting utils).

**Implementation**:

1. **Component signature**: `const WeekPanel = ({ week, isOpen, onToggle, blockingMap }) => { ... }`

2. **WeekHeader** (clickable):
   ```jsx
   <div className="weekly-header" onClick={onToggle}>
     <div className="week-info">
       <span className="week-date">
         {formatShortDate(week.fecha_inicio)} — {formatShortDate(week.fecha_fin)}
       </span>
     </div>
     <div className="week-summary">
       <span className="week-total-hours">
         <FaCircle className="dot" />
         {formatHours(week.total_horas_semana)}h en total
       </span>
       <motion.span
         className="toggle-icon"
         animate={{ rotate: isOpen ? 180 : 0 }}
       >
         <FaChevronDown />
       </motion.span>
     </div>
   </div>
   ```

3. **WeekBody** (animated expand/collapse):
   ```jsx
   <AnimatePresence initial={false}>
     {isOpen && (
       <motion.div
         className="weekly-details"
         initial={{ opacity: 0, height: 0 }}
         animate={{ opacity: 1, height: "auto" }}
         exit={{ opacity: 0, height: 0 }}
         transition={{ duration: 0.3, ease: "easeInOut" }}
       >
         <div className="days-grid">
           {week.dias.map(dia => (
             <DayCard key={dia.fecha} dia={dia} blockingMap={blockingMap} />
           ))}
         </div>
       </motion.div>
     )}
   </AnimatePresence>
   ```

4. **Integration in main component**:
   ```jsx
   {horarios.map((week) => (
     <WeekPanel
       key={week.id}
       week={week}
       isOpen={openWeekId === week.id}
       onToggle={() => toggleWeek(week.id)}
       blockingMap={blockingDatesMap}
     />
   ))}
   ```

5. **`toggleWeek` handler**: If clicking the already-open week, close it. Otherwise, open the clicked one.

**Acceptance criteria**:
- [ ] Header shows date range and total hours
- [ ] Chevron animates rotation on toggle
- [ ] Body animates height 0↔auto with opacity
- [ ] First week is open by default
- [ ] Only one week can be open at a time
- [ ] Clicking the same week twice closes it
- [ ] Empty horarios show "No hay horarios programados" instead of the list

**Estimated effort**: Medium (~70–100 lines)

---

### T8 — Build DayCard with 5 variants

**Description**: Render individual day cards with 5 possible visual states depending on classification. Each variant has specific content, border color, and badge set.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.jsx`

(Sub-component defined in the same file, below WeekPanel.)

**Dependencies**: T2 (classifyDay), T3 (formatting utils), T7 (WeekPanel renders DayCard).

**Implementation**:

1. **Component signature**: `const DayCard = ({ dia, blockingMap }) => { ... }`

2. **Destructure `dia` fields**:
   - Core: `descripcion`, `fecha`, `horas`, `horas_base`, `horas_extra`, `jornada_entrada`, `jornada_salida`
   - Conditional: `domingo_estado`, `festivo_trabajado`, `festivo_nombre`, `jornada_reducida`, `tipo_jornada_reducida`
   - New fields: `es_estudio`, `horas_estudio`, `estudio_modo`, `estudio_compensa_banco`, `estudio_cubre_empresa`
   - New fields: `horas_permiso`, `horas_redistribuidas`

3. **Get blocks for this day**: `const blocks = blockingMap.get(fecha) || [];`

4. **Classify day**:
   ```js
   const classification = classifyDay(dia, blocks);
   ```

5. **Render by variant**:

   **a) `total-block`** (red border + red-50 bg):
   ```jsx
   <div className="day-card day-card--blocked">
     <div className="day-header">...</div>
     <div className="day-blocked-info">
       <FaBan />
       <div className="blocked-details">
         <strong>{primaryBlock.tipo}</strong>
         {primaryBlock.observacion && <span>{primaryBlock.observacion}</span>}
       </div>
     </div>
   </div>
   ```

   **b) `sunday`** (gray border + gray-50 bg):
   ```jsx
   <div className="day-card day-card--sunday">
     <div className="day-header">...</div>
     <div className="day-sunday-info">
       <FaCalendarCheck />
       <span className={domingo_estado === "compensado" ? "status-compensado" : "status-sin-compensar"}>
         Domingo {domingo_estado === "compensado" ? "Compensado" : "Sin Compensar"}
       </span>
     </div>
   </div>
   ```

   **c) `study-full`** (amber border + amber-50 bg, NO hours):
   ```jsx
   <div className="day-card day-card--study">
     <div className="day-header">...</div>
     <div className="day-study-info">
       <FaGraduationCap />
       <div>
         <strong>Estudio — {estudio_modo === "redistribuir" ? "Redistribuir" : "Libre"}</strong>
         {estudio_compensa_banco > 0 && <span>Compensa: {formatHours(estudio_compensa_banco)}h</span>}
         {estudio_cubre_empresa > 0 && <span>Cubre empresa: {formatHours(estudio_cubre_empresa)}h</span>}
       </div>
     </div>
   </div>
   ```

   **d) `study-partial`** (amber border + work info + study badge):
   ```jsx
   <div className="day-card day-card--study">
     <div className="day-header">...</div>
     {/* Work info */}
     <div className="day-jornada">...</div>
     <div className="hours-badges">...</div>
     <div className="tags-badges">
       <span className="badge tag-estudio">Estudio: {formatHours(horas_estudio)}h</span>
       {/* Other conditionals */}
     </div>
   </div>
   ```

   **e) `work`** (blue border + work info + conditional badges):
   ```jsx
   <div className="day-card day-card--work">
     <div className="day-header">
       <span className="day-name">{descripcion}</span>
       <span className="day-date">{formatShortDate(fecha)}</span>
     </div>
     <div className="day-jornada">
       <FaClock />
       <span>{formatTimeLabel(jornada_entrada)} – {formatTimeLabel(jornada_salida)}</span>
     </div>
     <div className="hours-badges">
       <span className="badge badge-legal">{formatHours(horas_base)}h Base</span>
       {horas_extra > 0 && <span className="badge badge-extra">{formatHours(horas_extra)}h Extra</span>}
       <span className="badge badge-total">{formatHours(horas_base + horas_extra)}h Total</span>
     </div>
     <div className="tags-badges">
       {festivo_trabajado && <span className="badge tag-holiday">Festivo: {festivo_nombre || "Sí"}</span>}
       {jornada_reducida && (
         <span className="badge tag-reduced" title={tipo_jornada_reducida === "entrar-tarde" ? "Entra 1h tarde" : "Sale 1h antes"}>
           Jornada Reducida
         </span>
       )}
       {es_estudio && horas_estudio > 0 && (
         <span className="badge tag-estudio">Estudio: {formatHours(horas_estudio)}h</span>
       )}
       {horas_permiso > 0 && (
         <span className="badge tag-permiso">Permiso: {formatHours(horas_permiso)}h</span>
       )}
       {horas_redistribuidas > 0 && (
         <span className="badge tag-redistribuidas">Redistribuidas: {formatHours(horas_redistribuidas)}h</span>
       )}
     </div>
   </div>
   ```

   **f) `free`** (gray border + "Día Libre"):
   ```jsx
   <div className="day-card day-card--free">
     <div className="day-header">...</div>
     <div className="day-off-info"><span>Día Libre</span></div>
   </div>
   ```

6. **What to REMOVE from old DayCard**:
   - `horas_extra_reducidas` destructure (line 491)
   - `horas_legales_reducidas` destructure (line 492)
   - `totalReduccionBanco` computation (lines 497–498)
   - `.badge.tag-bank` rendering (lines 548–553)
   - `horas_reducidas_manualmente` badge (lines 554–558)
   - The old CSS class logic (`isBlocked ? "blocked" : ""`, `!hasWork && !isBlocked && !domingo_estado ? "off" : ""`)

**Acceptance criteria**:
- [ ] Work days show blue border, jornada, hours badges (base/extra/total), conditional badges
- [ ] Total block days show red border, block reason, no hours
- [ ] Study-full days show amber border, estudio_modo + compensation breakdown
- [ ] Study-partial days show amber border, work info + estudio badge
- [ ] Sundays show gray card with domingo_estado status
- [ ] Free days show gray card with "Día Libre"
- [ ] No bank hours references (no `badge.tag-bank`, no `totalReduccionBanco`)
- [ ] Conditional badges work: festivo, reducida, estudio, permiso, redistribuidas
- [ ] Block override: if total block + horas > 0, card shows as blocked (no hours)

**Estimated effort**: Large (~150–200 lines)

---

## Phase 4: Frontend — Styles

### T9 — Write complete CSS for the new component

**Description**: Rewrite `ConsultaHorariosPublica.css` with all styles for the new component structure. Remove all bank-hours CSS. Add styles for new sub-components and badges.

**Files affected**:
- `C:\Users\johan.sanchez\Desktop\Pagina-web_React\src\pages\Programador_horarios\ConsultaHorariosPublica.css`

**Dependencies**: Must be done after T4–T8 to style all new elements. Can overlap with T4 for container/form styles.

**Style sections** (organize in this order):

1. **Container & Card** (keep existing, minor updates):
   - `.pubcal-container`, `.pubcal-card` — as-is, clean gradient, white card, shadow
   - `.pubcal-logo`, `.pubcal-title`, `.pubcal-subtitle` — as-is

2. **Form styles** (keep existing):
   - `.pubcal-form`, `.pubcal-input-wrap`, `.pubcal-input`, `.pubcal-label`, `.pubcal-btn`, `.pubcal-btn.primary`

3. **Loading/Error/Empty states** (keep existing):
   - `.pubcal-msg`, `.pubcal-msg.error`, `.spin`, `@keyframes spin`

4. **Employee Info** (NEW — update existing `.pubcal-header`):
   - `.pubcal-emp` — name + icon, already exists
   - `.pubcal-turno` — NEW: turno info row with clock icon
   - `.pubcal-turno.sin-turno` — NEW: muted/italic style when no shift

5. **Global Summary** (major updates to `.pubcal-summary`):
   - `.pubcal-summary` — grid layout (auto-fit, minmax)
   - `.sum-card` — base card style
   - `.sum-card.legal` — purple tint (keep)
   - `.sum-card.extra` — amber tint (keep)
   - `.sum-card.total` — cyan tint (keep)
   - `.sum-card.dias` — gray tint (keep)
   - `.sum-card.estudio` — NEW: green tint for estudio
   - `.sum-card.permiso` — NEW: orange tint for permiso
   - **REMOVE**: `.sum-card.bank` (lines 249–256)

6. **Week Accordion** (keep existing, minor updates):
   - `.weekly-item`, `.weekly-header`, `.weekly-header:hover`
   - `.week-info`, `.week-date`, `.week-summary`
   - `.week-total-hours`, `.dot`, `.toggle-icon`
   - `.weekly-details`, `.days-grid`
   - `.days-grid` responsive: 1 col < 768px, 2 cols @768px, 3 cols @1100px

7. **Day Card variants** (REWRITE — replace old `.day-card` logic):
   - `.day-card` — base: white bg, 8px radius, padding, grid gap, flex column
   - `.day-card--work` — left border 4px solid `#3b82f6` (blue-500)
   - `.day-card--blocked` — left border 4px solid `#ef4444` (red-500), bg `#fef2f2` (red-50)
   - `.day-card--study` — left border 4px solid `#f59e0b` (amber-500), bg `#fffbeb` (amber-50)
   - `.day-card--sunday` — left border 4px solid `#9ca3af` (gray-400), bg `#f9fafb`
   - `.day-card--free` — left border 4px solid `#9ca3af` (gray-400), bg `#f9fafb`

8. **DayCard internals** (keep existing, update):
   - `.day-header`, `.day-name`, `.day-date` — as-is
   - `.day-jornada` — as-is
   - `.hours-badges` — as-is
   - `.badge`, `.badge.badge-legal`, `.badge.badge-extra`, `.badge.badge-total` — as-is

9. **NEW Badge styles**:
   - `.badge.tag-estudio` — amber bg, amber text (keep existing at line 372–376)
   - `.badge.tag-permiso` — NEW: orange/amber variant
   - `.badge.tag-redistribuidas` — NEW: purple variant
   - **REMOVE**: `.badge.tag-bank` (lines 533–537)
   - `.badge.tag-holiday`, `.badge.tag-reduced`, `.badge.tag-manual` — keep as-is

10. **Day variant content** (update):
    - `.day-blocked-info` — red text, icon (keep, add styles for new compact layout)
    - `.day-study-info` — NEW: amber text, icon, multi-line compensation info
    - `.day-sunday-info` — as-is
    - `.day-off-info` — as-is
    - `.status-compensado`, `.status-sin-compensar` — as-is

11. **Responsive** (keep existing, update gap/padding for new cards):
    - `@media (max-width: 900px)` — summary grid
    - `@media (max-width: 640px)` — card padding, form direction, header direction

12. **Animations** (keep existing):
    - `.spin`, `@keyframes spin` — as-is

**Acceptance criteria**:
- [ ] Container/card styles match existing design system (primary: `#210d65`)
- [ ] All 5 day card variants have correct border colors and backgrounds
- [ ] Badges render correctly: legal, extra, total, holiday, reduced, estudio, permiso, redistribuidas
- [ ] `.sum-card.bank` class is completely removed
- [ ] `.badge.tag-bank` class is completely removed
- [ ] Responsive: mobile single column, desktop multi-column (2→3)
- [ ] Week accordion animation works with framer-motion classes
- [ ] Checkbox/radio styles match (none needed — clean forms)
- [ ] No unused CSS classes from old bank-hours logic

**Estimated effort**: Large (~500–700 lines)

---

## Deleted Code Checklist (from old component)

These are the specific references to REMOVE from `ConsultaHorariosPublica.jsx`:

- [ ] **Line 276** (JSX): `s + (d.horas_extra_reducidas || 0) + (d.horas_legales_reducidas || 0)` — delete entire `reduction` computation
- [ ] **Lines 381–387** (JSX): `<div className="sum-card bank">` block — delete entire conditional rendering
- [ ] **Line 491** (JSX): `horas_extra_reducidas,` — delete destructure
- [ ] **Line 492** (JSX): `horas_legales_reducidas,` — delete destructure
- [ ] **Lines 497–498** (JSX): `const totalReduccionBanco = Number(...) + Number(...)` — delete
- [ ] **Lines 548–553** (JSX): `<span className="badge tag-bank">` block — delete
- [ ] **Lines 554–558** (JSX): `{horas_reducidas_manualmente` block — delete (not in spec)
- [ ] **Lines 602–605** (JSX): Old CSS class logic `isBlocked ? "blocked" : ""` — replace with new variant classes

These to remove from `ConsultaHorariosPublica.css`:

- [ ] **Lines 249–256**: `.sum-card.bank` — delete entire block
- [ ] **Lines 533–537**: `.badge.tag-bank` — delete entire block

---

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| **Total files changed** | 3 |
| **Backend (public.js)** | ~10–15 lines added |
| **Frontend JSX** | ~500–700 lines (rewrite of 614-line file) |
| **Frontend CSS** | ~500–700 lines (rewrite of 701-line file) |
| **Total estimated lines** | ~1,000–1,400 lines across 3 files |
| **Estimated effort** | **Large** |
| **Largest task** | T8 (DayCard — ~150-200 lines JSX, highest complexity) |
| **Most CSS-intensive** | T9 (500–700 lines, all new variant styles) |
| **Fastest task** | T1 (10-15 lines backend, ~15 min) |
| **Highest risk** | T2 (date inference must exactly match backend logic) |

### Task size summary

| Task | Type | Est. Lines | Effort |
|------|------|-----------|--------|
| T1 | Backend | ~15 | Small |
| T2 | Frontend utils | ~100 | Medium |
| T3 | Frontend utils | ~40 | Small |
| T4 | Frontend component | ~180 | Medium |
| T5 | Frontend component | ~40 | Small |
| T6 | Frontend component | ~70 | Medium |
| T7 | Frontend component | ~90 | Medium |
| T8 | Frontend component | ~180 | Large |
| T9 | Frontend CSS | ~600 | Large |

### Edge cases & gotchas to watch for

1. **T1**: Import path `../controllers/phConfigController.js` — verify at runtime that circular deps don't happen (phConfigController imports from `supabaseAxios.js`, public.js uses its own `axios` client — safe).
2. **T2**: PostgREST returns `details` as JSONB — it may arrive as a parsed object or as a JSON string in some cases. The normalize function must handle `typeof details === "string"` and `JSON.parse()`.
3. **T4**: The old component uses `openWeek` (single value). The new component must still enforce single-open accordion behavior.
4. **T6**: `es_estudio` is distinct from `estudio_compensa_banco`/`estudio_cubre_empresa` — these may exist independently. The global summary should aggregate from `horas_estudio`, not from the boolean flag.
5. **T8**: A day may have BOTH `horas > 0` AND a total block overlapping. The total block MUST win per the spec (DR5). The priority chain in `classifyDay` guarantees this.
6. **T9**: The CSS rewrite must be complete — any leftover `.sum-card.bank` or `.badge.tag-bank` will cause visual artifacts if the classes are referenced but the CSS is removed. Search the entire CSS file for "bank" after rewrite.
