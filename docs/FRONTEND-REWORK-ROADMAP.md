# Roadmap Rework Frontend: Programador de Horarios

Estado de la refactorización arquitectónica y de usabilidad del frontend
(`Pagina-web_React`) del módulo de Programador de Horarios.

> **Ubicación del código:** `Pagina-web_React/src/pages/Programador_horarios/`
> (rama `Johan`). Cambios sin commitear.

## Resumen de estado

| Fase | Tema | Estado |
|------|------|--------|
| 1 | Estandarización visual + responsive | ✅ Completada |
| 2 | Destripar los monolitos (arquitectura) | ✅ Completada (Historial y `ObservacionesPH.jsx` descompuestos) |
| 3 | UX de alta velocidad (flujos) | ✅ Completada (carga con preview + asignación masiva) |

**Reducción de monolitos lograda:**

| Archivo | Antes | Ahora |
|---------|-------|-------|
| `HistorialGeneralHorarios.jsx` | 1713 | **840** (−51%) |
| `ObservacionesPH.jsx` | 1962 | **1139** (−42%) |

---

## ✅ FASE 1 (COMPLETADA) — Estandarización Visual y Responsive Real

Unificar el diseño y asegurar que el sistema sea 100% utilizable en móvil sin
pérdida de datos.

- **Centralización de estilos:** `ProgramadorHorarios.css`, `HistorialGeneralHorarios.css`
  y `ObservacionesPH.css` migrados al sistema de variables unificado (`ph-tokens.css`).
- **Limpieza de CSS:** Se eliminaron variables locales (`--hgh-`, `--obs-ph-`) y
  colores quemados. Los gradientes se tokenizaron (`--ph-grad-primary`,
  `--ph-grad-primary-hover`, `--ph-grad-disabled`, `--ph-grad-surface`) y se
  eliminó la última variable huérfana `--obs-ph-bg-secondary` (→ `--ph-surface-muted`).
- **Responsive "Table-to-Card":** en `<768px` las tablas mutan a tarjetas
  apilables vía CSS, sin ocultar columnas (sin pérdida de información).
- **Conexión JSX:** atributos `data-label` en los `<td>` de `EmployeeSelector.jsx`,
  `ObservacionesPH.jsx` e `HistorialGeneralHorarios.jsx` para que las tarjetas
  móviles expongan el título de cada dato.

### Corrección posterior (regresión de la migración)

La migración dejó variables `--obs-ph-*` **sin definir** pero aún referenciadas
en estilos inline de JSX (`var(--undefined)` invalida la declaración completa).
Síntoma: el **lienzo de la firma no se veía** (borde invisible). Se remapearon
las 6 variables fantasma a tokens `--ph-*` reales en `ObservacionesPH.jsx`,
`DiaFamiliaForm.jsx` y `FileDropzone.jsx`. Verificado: `--adm-sch-*` (Configuración)
sí seguía definida; solo las `--obs-ph-*` estaban rotas.

Además se corrigió el **offset del cursor en la firma**: `SignatureField.jsx`
tenía buffer de canvas fijo con CSS `width:100%` (el trazo aparecía corrido del
puntero). Reescrito responsive con `devicePixelRatio` + `ResizeObserver`.

---

## ✅ FASE 2 (COMPLETADA) — Destripar los Monolitos (Arquitectura)

Reducir deuda técnica y acoplamiento aplicando **Container-Presentational**:
separar el render masivo (tablas, modales, tarjetas) de la lógica de estado.

### ✅ Hecho

- **Helpers de presentación centralizados** — `utils/phFormatters.js` con los
  formatters puros (`isPdfUrl`, `isImageUrl`, `toNumber`, `fmtHM`,
  `formatHoursAndMinutes`, `fmtFechaLarga`, `fmtFechaHora`, `formatCurrency`,
  `getWeekCreatorLabel`, `addBreaksToBlocks`). Eliminó la duplicación entre ambos
  monolitos.
- **`components/modales/PreviewModal.jsx`** — modal de vista previa (imagen/PDF)
  presentacional, parametrizado por `classPrefix`. Lo consumen **ambos** monolitos;
  la dependencia pesada de `@react-pdf-viewer` quedó centralizada en un solo archivo.
- **`components/Skeleton/`** — `Skeleton.jsx` + `Skeleton.css` (shimmer con tokens,
  respeta `prefers-reduced-motion`) con variantes `TableRowsSkeleton` y `ListSkeleton`.
  Reemplazan los 6 spinners (`FaSpinner`) de ambos monolitos.
- **`components/tablas/EmployeeHistoryTable.jsx`** — tabla de empleados de Historial
  (5 columnas con indicadores/stats). Colores de indicadores tokenizados.
- **`components/tablas/ObservacionesEmployeeTable.jsx`** — tabla de empleados de
  Observaciones (3 columnas). NO se comparte con la de Historial a propósito:
  la estructura difiere demasiado (misma decisión que el modal y el `FileAttachmentChip`).
- **`components/listas/HistorialWeekCard.jsx`** — tarjeta de semana de Historial
  (header + días + bloques/descansos), solo lectura.
- **`components/listas/HistorialObservacionCard.jsx`** — tarjeta de observación de
  Historial (~455 líneas, render por tipo de novedad). `FileAttachmentChip` vive
  adentro. **Con esto `HistorialGeneralHorarios.jsx` quedó descompuesto: 1713 → 845.**

> **Criterio aplicado:** no se fuerzan componentes "compartidos" cuando la
> estructura difiere de verdad (modal, chip, tablas de empleados). Una abstracción
> con demasiada parametrización es peor que dos componentes simples.

- **`ObservacionesPH.jsx` descompuesto: 1847 → 1139 (−42%).** Se extrajeron:
  - **`components/observaciones/novedades_forms/SignatureInput.jsx`** — wrapper de
    firma (`forwardRef` + estado local del lienzo), antes inline (~190 líneas).
  - **`components/listas/ObservacionHistoryCard.jsx`** — tarjeta del historial de
    observaciones (render por tipo de novedad, solo lectura + callbacks de
    revisar/editar/eliminar), antes inline (~460 líneas).
  - **`normalizeDateInput` + `formatFecha`** movidos a `utils/phFormatters.js`
    (funciones puras; estaban duplicadas inline y las consume la card).
  - **Bug corregido al extraer:** el bloque "Día de la Familia" se renderizaba
    **dos veces** (copy-paste), mostrando los mismos campos duplicados. Consolidado
    en un solo bloque.

- **Hex sueltos tokenizados** ✅ — `#334155` → `var(--ph-text-body)` y `#64748b` →
  `var(--ph-text-muted)` en `ObservacionHistoryCard.jsx`. Sin colores quemados en el
  render de Observaciones.

---

## ✅ FASE 3 (COMPLETADA) — UX de Alta Velocidad (Flujos y Experiencia)

Automatizar procesos para que la gestión del administrador sea rápida y a prueba
de errores.

### ✅ Carga de Empleados con Preview (frontend-only)

- **`components/empleados/CargaMasivaEmpleados.jsx`** — reemplaza la carga a ciegas
  por: drop del CSV/Excel → **parseo en el navegador con `xlsx`** → **tabla editable**
  con validación → reconstrucción del `.xlsx` corregido → POST al endpoint que ya
  existe (`/empleados/upload`). **NO toca el backend** (sin redeploy).
- **Validación clave:** la columna `SEDE` se edita con un `<select>` de sedes reales;
  si no matchea, la fila se marca en rojo y bloquea el submit. Esto evita que el
  backend cree **sedes fantasma** vía `findOrCreateId` (gotcha real del controller).
- **Resumen en vivo:** filas totales, nuevas vs a actualizar (compara contra cédulas
  existentes), y conteo de filas con error.
- Headers respetados (los que parsea el backend): `CEDULA`, `NOMBRE`, `SEDE`,
  `CORREO ELECTRONICO`, `CELULAR`, `FECHA CONTRATACION`.

### ✅ Asignación Masiva de Horarios

- **`components/AsignacionMasivaModal.jsx`** — desde la Vista por Sede, genera el
  horario de varios colaboradores en el mismo rango a partir de su turno base, con
  un solo flujo. Cableado en `VistaPorSede.jsx` (botón en la toolbar).
- **Reglas:** solo seleccionados; solo programables (con turno base); **cupo 2+2**
  validado por turno (los seleccionados por turno no pueden superar su `cupo` →
  botón bloqueado si se excede, garantizando "nunca más de 4 por sede");
  **sobrescribe** (archiva + recrea, el modelo que ya usa el backend).
- **Refactor de `crearHorarioFlow.js`:** extraído en `resolveDateOverrides`
  (pregunta festivos/domingos UNA vez para todo el lote) + `sendHorario` (archiva +
  POST sin prompts) + `crearHorariosMasivo` (loop con errores aislados por persona,
  no corta el lote). `crearHorarioFlow` (single) se mantiene, ahora compuesto de
  esas piezas.
- **Bug corregido de paso:** el flujo single archivaba los horarios previos ANTES de
  preguntar festivos/domingos; si el usuario cancelaba el prompt, el empleado quedaba
  **sin horario activo**. Ahora se archiva recién después de resolver los prompts.

---

## Mapa de componentes creados (Fase 2)

```
components/
├── modales/
│   └── PreviewModal.jsx            (compartido Historial + Observaciones)
├── tablas/
│   ├── EmployeeHistoryTable.jsx    (Historial)
│   └── ObservacionesEmployeeTable.jsx (Observaciones)
├── listas/
│   ├── HistorialWeekCard.jsx       (Historial)
│   ├── HistorialObservacionCard.jsx (Historial; contiene FileAttachmentChip)
│   └── ObservacionHistoryCard.jsx  (Observaciones; tarjeta de historial editable)
├── observaciones/novedades_forms/
│   └── SignatureInput.jsx          (Observaciones; wrapper de firma forwardRef)
└── Skeleton/
    ├── Skeleton.jsx                (Skeleton, TableRowsSkeleton, ListSkeleton)
    └── Skeleton.css
utils/
└── phFormatters.js                 (formatters puros compartidos;
                                     + normalizeDateInput, formatFecha)
```
