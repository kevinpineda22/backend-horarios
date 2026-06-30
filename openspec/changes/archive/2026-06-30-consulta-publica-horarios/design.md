# Design: Reconstrucción de Consulta Pública de Horarios

## Technical Approach

Reconstruir el componente `ConsultaHorariosPublica` desde cero, eliminando toda referencia al banco de horas eliminado (`horas_extra_reducidas`, `horas_legales_reducidas`) y agregando soporte para todos los campos del sistema nuevo: estudio, permisos, festivos trabajados, jornada reducida, redistribución. El backend se extiende mínimamente para devolver `turno_base` del empleado usando `getJornadaBaseVigente`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|----------|---------|--------|-----------|
| State management | Context / Redux / Hooks solos | `useState` + `useMemo` | Feature aislada, sin estado compartido. Hooks son suficiente y evitan sobreingeniería |
| Ubicación de lógica de bloqueos | Backend (nueva API) / Frontend | Frontend | Evita cambios al endpoint existente. La lógica ya existe en el frontend actual y replica `normalizeBlockingObservation` del backend |
| Animaciones | CSS transitions / framer-motion | `framer-motion` | Ya está en dependencias del proyecto (`package.json`). `AnimatePresence` para acordeón semanal |
| Formato de fechas | Moment / date-fns | `date-fns` | Ya está en dependencias. Más liviano, tree-shakeable |
| Sub-componentes | Archivos separados / mismo archivo | Mismo archivo (`DayCard`, `WeekPanel`, `StatCard`) | Son sub-componentes de uso exclusivo de esta página. Evita proliferación de archivos sin beneficio real |

## Data Flow

```
User Input (cédula)
  │
  ▼
apiPublic.post("/consulta-horarios") ──→ Backend POST /api/public/consulta-horarios
                                              │
                                              ├── Busca empleado por cédula (Supabase)
                                              ├── getJornadaBaseVigente(empleado.id) ← NUEVO
                                              ├── Query horarios (estado_visibilidad=publico)
                                              └── Query observaciones
                                              │
                                              ▼
Response: { empleado (con turno_base), horarios[], observaciones[] }
  │
  ▼
Frontend:
  1. normalizeAndFilterBlockages(observaciones) → bloques normalizados con start/end Date
  2. buildBlockingDatesMap(bloques) → Map<"YYYY-MM-DD", BlockInfo[]>
  3. computeGlobalSummary(horarios) → totales agregados
  4. Render: Header → EmployeeInfo → GlobalSummary → WeekPanel[] → DayCard[]
```

## Component Architecture

```
ConsultaHorariosPublica (page, holds all state via hooks)
├── Header (logo, title, subtitle)
├── SearchForm (cédula input + submit)
├── EmployeeInfo (nombre_completo, turno_base)
├── GlobalSummary
│   └── StatCard[] (legal, extra, estudio, permiso, días)
├── WeekPanel[] (acordeón, uno por horario)
│   ├── WeekHeader (rango fechas, total horas, chevron)
│   └── WeekBody (expandido con AnimatePresence)
│       └── DayCard[] (grid responsive 1→3 cols)
└── LoadingState / ErrorState / EmptyState
```

## Key Implementation Details

### Blocking Logic (frontend replica de `normalizeBlockingObservation`)

El frontend debe replicar exactamente la lógica del backend (`horariosController.js:104-184`). Se decide deliberadamente mantener esta duplicación para evitar cambios al endpoint actual. La función `normalizeAndFilterBlockages` ya existe en el componente actual y se refactorizará.

**Date inference por tipo:**

| Tipo | Start | End |
|------|-------|-----|
| Vacaciones | `details.fecha_inicio_vacaciones` \|\| `fecha_novedad` | `details.fecha_fin_vacaciones` \|\| `fecha_regreso` - 1d \|\| start |
| Licencias | `details.fecha_inicio` \|\| `fecha_novedad` | `details.fecha_termino` \|\| `details.fecha_inicio` |
| Incapacidades | `details.fecha_inicio` \|\| `fecha_novedad` | `details.fecha_fin` \|\| `details.fecha_inicio` |
| Permisos / Día de la Familia | `details.fecha_inicio` \|\| `details.fecha_propuesta_dia_familia` \|\| `fecha_novedad` | `details.fecha_fin` \|\| `details.fecha_inicio` \|\| start |
| Estudio | `dias_estudio[0].fecha` \|\| `details.fecha_inicio` | `dias_estudio[n-1].fecha` \|\| `details.fecha_inicio` |

**Fallback**: Si endDate < startDate, intentar `details.duracion_dias` o `details.diasIncapacidad`, luego forzar endDate = startDate.

### Day Classification (priority chain)

1. **total-block** — si hay bloqueo total (Incapacidades, Licencias, Vacaciones, Día de la Familia, Permisos sin horas_permiso)
2. **sunday** — si `fecha` es domingo
3. **study-full** — si es Estudio con `horas = 0` (ámbar, sin horas)
4. **study-partial** — si es Estudio con `horas > 0` (ámbar, con badges de trabajo + estudio)
5. **work** — si `horas > 0` (azul)
6. **free** — cualquier otro caso (gris)

### Global Summary (sin banco de horas)

```typescript
{
  totalBase: sum(horas_base),
  totalExtra: sum(horas_extra),
  totalHoras: sum(horas),
  totalDiasLab: count where horas > 0,
  totalEstudio: sum(horas_estudio),
  totalPermiso: sum(horas_permiso),
  estudioCompensaBanco: sum(estudio_compensa_banco),
  estudioCubreEmpresa: sum(estudio_cubre_empresa),
}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backendHorarios/src/routes/public.js` | MODIFY | Importar y llamar `getJornadaBaseVigente`, agregar `turno_base` al response |
| `Pagina-web_React/.../ConsultaHorariosPublica.jsx` | REWRITE | Reconstrucción completa: eliminar banco horas, nuevos badges, clasificación de días |
| `Pagina-web_React/.../ConsultaHorariosPublica.css` | REWRITE | Eliminar estilos de banco, agregar estilos para badges nuevos (estudio, permiso, redistribución) |

## Interfaces

```typescript
// API Response (POST /api/public/consulta-horarios)
type ConsultaResponse = {
  empleado: {
    id: string;
    nombre_completo: string;
    estado: "activo" | "inactivo";
    turno_base: {
      nombre: string;
      hora_entrada: string;     // HH:mm
      hora_salida: string;      // HH:mm
      sabado_entrada: string | null;
      sabado_salida: string | null;
      dias_aplica: number[];    // 0=Sun, 1=Mon...6=Sat
    } | null;
  };
  horarios: Horario[];
  observaciones: Observacion[];
};

// Normalized block (after frontend normalization)
type BlockInfo = {
  id: number;
  tipo: string;
  observacion: string;
  start: Date;
  end: Date;
  details: Record<string, any>;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Backend unit | `getJornadaBaseVigente` response mapping | Verificar que turno_base se incluya en respuesta cuando hay asignación vigente |
| Frontend unit | `normalizeAndFilterBlockages` con cada tipo de novedad | Test de fecha inference (Vacaciones con fecha_regreso, Incapacidades con diasIncapacidad, etc.) |
| Frontend unit | `classifyDay` con combinaciones de estado | Test de prioridad: total-block > sunday > study > work > free |
| Frontend integration | Flujo completo: cédula → API → render | Mock de apiPublic, verificar render de todos los sub-componentes |

## Migration / Rollout

No migration required. El endpoint actual sigue funcionando sin `turno_base` (el frontend nuevo lo usa si existe, el viejo lo ignora). Rollback: git checkout de los 3 archivos.

## Open Questions

- [ ] Verificar que el import path `../controllers/phConfigController.js` desde `src/routes/public.js` no cree circular dependencies (phConfigController importa de `supabaseAxios.js`, public.js usa su propio `axios` — no debería haber ciclo).
- [ ] Confirmar que `details` en observaciones llega como objeto JSON ya parseado (PostgREST JSONB) y no como string.
