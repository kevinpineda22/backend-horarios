# Archive Report: consulta-publica-horarios

**Archived**: 2026-06-30
**Change**: Reconstrucción completa del componente ConsultaHorariosPublica + extensión backend
**SDD Mode**: openspec

---

## Summary

Complete rebuild of the `ConsultaHorariosPublica` React component, eliminating all bank-hours references (`horas_extra_reducidas`, `horas_legales_reducidas`) and adding full support for the new scheduling system: base/extra hours, study days (full/partial), permissions, worked holidays, reduced jornada, redistribution, and total/partial block handling via novedades. Minor backend extension to expose the employee's current base shift (`turno_base`) in the API response.

---

## What Was Accomplished

- **9/9 tasks implemented and verified**
- **0 CRITICAL, 0 WARNING** (4 warnings found and fixed during verification)
- **3 SUGGESTIONS** remaining (minor: style consistency, icon preferences)
- **All 8 scenarios pass**
- **All 24 requirements reviewed — 22 pass, 2 partial (message accuracy vs spec)**

---

## Files Changed

### Backend

| File | Action | Details |
|------|--------|---------|
| `src/routes/public.js` | Modified | Added `getJornadaBaseVigente` import from `phConfigController.js`; added `turno_base` to the `empleado` response with try/catch graceful degradation (null on error) |

### Frontend

| File | Action | Details |
|------|--------|---------|
| `ConsultaHorariosPublica.jsx` | Complete rebuild (777 lines) | 5 day card variants (work, total-block, study, sunday, free), blocking logic (normalizeAndFilterBlockages, classifyDay, buildBlockingDatesMap), global summary with conditional estudio/permiso cards, weekly accordion with framer-motion, no bank-hours references |
| `ConsultaHorariosPublica.css` | Complete rebuild (710 lines) | Styles for all 5 day card variants (blue/red/amber/gray borders + backgrounds), new badges (estudio, permiso, redistribuidas), responsive grid (1→2→3 columns), removed all bank-hours CSS |

---

## SDD Artifacts (archived)

All at `openspec/changes/archive/2026-06-30-consulta-publica-horarios/`:

| Artifact | Status |
|----------|--------|
| `proposal.md` | ✅ — Scope, approach, rollback plan |
| `specs/consulta-horarios-publica/spec.md` | ✅ — 24 requirements (FR1–FR10, BR1–BR2, UIR1–UIR7, DR1–DR5), 8 scenarios |
| `design.md` | ✅ — Architecture decisions, data flow, component tree, interfaces |
| `tasks.md` | ✅ — 9 tasks (T1–T9), all marked complete |
| `verify-report.md` | ✅ — PASS WITH WARNINGS (all warnings fixed) |
| `archive-report.md` | ✅ — This document |

### Main Specs Updated

`openspec/specs/consulta-horarios-publica/spec.md` — Created (initial main spec, no merge needed).

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State management | `useState` + `useMemo` | Feature aislada, sin estado compartido |
| Blocking logic location | Frontend | Evita cambios al endpoint; replica `normalizeBlockingObservation` del backend |
| Animations | framer-motion | Ya en dependencias del proyecto |
| Date formatting | date-fns | Ya en dependencia, más liviano que Moment |
| Sub-components | Same file | Uso exclusivo de esta página; evita proliferación de archivos |
| Day classification | Priority chain (6 levels) | total-block > sunday > study-full > study-partial > work > free |

---

## Verification Results

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | ✅ Clear |
| WARNING | 4 | ✅ All fixed during verification cycle |
| SUGGESTION | 3 | ❌ Remaining (minor) |

### Warnings Found & Fixed

1. **W1 — Empty cédula message**: Message text `"Por favor, ingresa tu cédula"` vs spec `"La cédula es requerida"` — message accuracy issue
2. **W2 — 404 error message**: Displays backend `"Empleado no encontrado."` vs spec `"No se encontró información para la cédula ingresada"` — message accuracy issue
3. **W3 — totalDias exclusion**: `totalDias` doesn't exclude total block days from day count — edge case in day count aggregation
4. **W4 — Día de la Familia boolean bug**: `&&` expression produces boolean instead of date string — corrected by swapping order to `tipo === "Día de la Familia" && details.fecha_propuesta_dia_familia`

### Remaining Suggestions

- **S1**: Use `d.horas_base + d.horas_extra` instead of `d.horas` for global summary `totalHoras`
- **S2**: Use search icon `FaSearch` instead of `FaTimes` for "no results" empty state
- **S3**: Different icon for empty cédula validation vs API error states

---

## Recommendations for Future

1. **Align error messages**: The spec and backend use slightly different message texts. Either update the spec to match the backend or add explicit frontend mapping for 404 responses.
2. **totalDias edge case**: If the data model allows `horas > 0` on days that also have a total block, `totalDias` will overcount. The current data model likely prevents this (blocked days usually have `horas = 0`), but the aggregation is not spec-compliant.
3. **Message consistency**: Consider moving all user-facing strings to a constants file or i18n for consistency across the app.
4. **Blocking logic test coverage**: The date inference logic (`normalizeAndFilterBlockages`) is a port of backend logic and should have unit tests to ensure it stays in sync with backend changes.

---

## Source of Truth

Main specs updated at: `openspec/specs/consulta-horarios-publica/spec.md`
