# Programador de Horarios — Estado de implementación

> Doc vivo. Se actualiza en cada avance. Fuente única de verdad spec → código.
> Última actualización: 2026-06-12.

## Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Modelo de horario | **Turnos fijos** (07:00–16:00 / 09:00–18:00), NO el motor de horas variables anterior |
| Turno base por colaborador | Con **historial de vigencia** (`ph_asignacion_jornada`, vigente_desde/hasta) |
| Distribución 2+2 por sede | **Alerta blanda** (avisa, no bloquea) |
| Destinatarios de novedades | DB-driven (`ph_notificacion_destinatarios`, tipo `critica`) con fallback |
| Límites legales | Cableados a `ph_parametros_globales` con fallback a constantes |

## Hallazgo raíz

El schema original estaba bien diseñado PARA esta spec, pero **nada estaba cableado**:
el motor usaba constantes hardcodeadas y el subsistema de config (`ph_*`) no se
consumía. `ph_jornadas` ya trae `sabado_entrada/salida` (regla 2.3) y `ph_sede_config`
ya modela la distribución 2+2. El trabajo es CONECTAR + reescribir el motor.

## Estado por sección de la spec

| Sección | Estado | Notas |
|---------|--------|-------|
| 2.1 Jornada base L-V/Sáb | 🟢 | Motor `generateScheduleByShift` usa el turno: 8h netas L-V, 4h Sáb. Verificado (44h) |
| 2.2 Config por sede 2+2 | 🟢 | Cupos en panel + alerta blanda al asignar (backend + UI). Falta (opcional) dashboard 2+2 por sede |
| 2.3 Sábado automático | 🟢 | Derivado del turno (07-16→Sáb 07-11; 09-18→Sáb 10-14). Verificado |
| 3.1 Opciones válidas por colaborador | 🟢 | Tab "Asignar Turnos" (frontend): selección + historial + alerta 2+2 |
| 3.2 Auto-asignar sábado al guardar | 🟢 | El motor lo deriva al generar |
| 4.1 Extras por día, sin masivo | 🟡 | Registro de extras al editar el día (Fase 4) |
| 4.2 Máx extras por quincena + alerta | 🟡 | Backend ✅: `GET /horarios/extras-quincena/:id` acumula por quincena (1-15 / 16-fin) vs. param `max_extra_por_quincena` (configurable, blank=sin límite). Falta **alerta visual** en UI de edición (Fase 4) |
| 5.1 Editar por día | 🟢 | `updateHorario` recalcula bloques según el turno del colaborador (`buildEditedDayBlocks`): base en el turno, extra después de la salida. Verificado |
| 5.1 Intercambio de turnos | 🟡 | Backend ✅ `POST /horarios/intercambio` (recalcula + audita ambos). Falta UI |
| 5.2 / 8 Historial auditable | 🟡 | Backend ✅: cada edición/intercambio escribe en `ph_auditoria_horario` (usuario/fecha/antes/después). Falta UI de consulta. Ojo: el front debe enviar `usuario_email`/`usuario_nombre` en el PATCH para registrar al autor |
| 6 Estudio + compensación extras | 🟢 | El día de estudio queda CUBIERTO (se paga el turno completo). Compensa `min(horas_estudio, tope)` desde el banco; resto, empresa. Tope = param `horas_estudio_colaborador` (default 4). Verificado contra Caso 1 y Caso 2 de la spec |
| 7.1 Incapacidad general/ARL | 🟢 | Ya distingue: `tipoIncapacidad` = "Enfermedad General" (general) / "Incidente de Trabajo" (= ARL). Valida docs por caso. Sin cambios de código |
| 7.2 Docs obligatorios | 🟢 | `observacionesController` valida incapacidad + historia clínica |
| 7.3 Notificar a 4 personas | 🟡 | DB-driven listo. Los 4 nombres de la spec **NO están en el código** (lo hardcodeado son 5 direcciones por rol SST, que hoy actúan como fallback). Cargar los 4 correos reales desde el panel (tipo `critica`). Nota: `ALLOWED_EMAILS` en observacionesController es lista de PERMISOS, no de notificación |

## Plan por fases

1. **Cimientos de datos** — 🟢 HECHO
   - ✅ SQL `sql/ph_fase1_cimientos.sql` (recrea asignacion + auditoria, siembra 2 turnos)
   - ✅ Backend asignación: `GET/POST /ph-config/asignaciones` + alerta 2+2 + helper `getJornadaBaseVigente`
   - ✅ Frontend: tab "Asignar Turnos" (`tabs/AsignacionTurnos.jsx`) — selección de colaborador, asignación con vigencia, historial, alerta blanda 2+2 vía toast
2. **Motor de generación** por turno fijo + sábado automático — 🟢 HECHO
   - ✅ `generateScheduleByShift` en `schedule.js` (turno → días → bloques con descanso)
   - ✅ `createHorario` lee turno base (`getJornadaBaseVigente`); 409 si el colaborador no tiene turno
   - ✅ Verificado: 07-16 y 09-18 dan 8h L-V / 4h Sáb / 44h semana
   - ⚠️ `updateHorario` (edición manual) TODAVÍA usa el modelo viejo (`getDayInfo` 07-18) → se reescribe en Fase 4
   - ⚠️ El cálculo de semana asume servidor en UTC (Vercel lo es); en dev local hay corrimiento de día
3. **Extras**: acumulado quincenal + alerta — 🟡 BACKEND HECHO
   - ✅ `src/utils/quincena.js` (quincenas 1-15 / 16-fin, verificado con bisiesto)
   - ✅ `GET /horarios/extras-quincena/:empleado_id?fecha=` (acumulado vs. `max_extra_por_quincena`)
   - ✅ Frontend `services/horariosService.js` con `getExtrasQuincena`
   - ⬜ Alerta visual en la UI de edición + registro de extras por día → va con Fase 4
4. **Edición manual** + intercambio + auditoría — 🟡 BACKEND HECHO
   - ✅ `updateHorario`: bloques por turno (`buildEditedDayBlocks`), auditoría por día, `extras_quincena` en la respuesta
   - ✅ `POST /horarios/intercambio` (spec 5.1) — recalcula y audita ambos colaboradores
   - ✅ `buildEditedDayBlocks` verificado (8h/10h/6h L-V, 4h/6h Sáb)
   - ⬜ Frontend: pintar alerta visual de quincena (la respuesta ya trae `extras_quincena`), UI de intercambio, UI de consulta de auditoría; el front debe mandar `usuario_email`/`usuario_nombre`
   - ⚠️ `updateHorario` conserva las validaciones semanales viejas (extra ≤12/sem, payable 2-3/día) y la lógica de banco del modelo anterior. La spec controla extras por QUINCENA → reconciliar (junto con banco) en una pasada con Fase 5
5. **Estudio** (política 4h/4h) + **Incapacidad** (ARL + 4 correos) — 🟢 BACKEND HECHO
   - ✅ Motor: día de estudio cubierto + metadatos (`horas_estudio`, `estudio_compensa_banco`, `estudio_cubre_empresa`). Verificado vs Caso 1 y 2
   - ✅ `createHorario` debita del banco hasta lo disponible; devuelve `compensacion_estudio`
   - ✅ Param `horas_estudio_colaborador` (default 4) en `buildScheduleConfig`
   - ✅ Incapacidad ARL ya distinguida; solo faltan los 4 correos (dato)
   - ⚠️ SUPUESTOS a validar al probar: (a) el día se paga completo; (b) la bolsa es el banco `horas_compensacion`. Si el cliente quiere otra cosa, es ajuste acotado

## Supuestos abiertos (validar al probar)

- **Compensación de estudio**: día cubierto (pago completo) + débito del banco `horas_compensacion` hasta `min(horas_estudio, tope)`. Confirmado el cálculo; falta validar representación con negocio.
- **Banco vs quincena en edición**: `updateHorario` aún valida extras por semana (≤12) y mantiene el banco viejo. La spec controla por quincena → reconciliar.

## Tareas de datos pendientes (las hace el usuario en Supabase/panel)

- [ ] Correr `sql/ph_fase1_cimientos.sql` (una sola vez)
- [ ] Configurar cupos 2+2 por sede desde el panel "Sedes y Cupos"
- [ ] Asignar turno base a cada colaborador — **requerido para generar** (si falta, el motor responde 409). Vía `POST /ph-config/asignaciones` o la futura UI
- [ ] Cargar los 4 correos de incapacidad (tipo `critica`) — desde el panel, cuando se tengan
- [x] ~~Definir máximo de extras por quincena~~ → queda **configurable por el admin** (param `max_extra_por_quincena`), en blanco por defecto; la alerta no dispara hasta que lo cargue

## Arquitectura de UI (reorganización)

Mental model en 3 momentos, sin redundancia:
- **Configuración** (se toca poco): Jornadas, Parámetros, Sedes y Cupos, Destinatarios.
- **Por empleado**: el turno base se asigna **dentro del Programador** (`TurnoBaseEmpleado`), al seleccionar el colaborador. Un solo lugar, un solo buscador.
- **Operación diaria** (Programador): elegir empleado → ver/ajustar turno base → generar (sin elegir jornada ni días: vienen del turno) → editar/intercambiar.

Cambios hechos:
- ✅ Tab "Asignar Turnos" de Configuración → **eliminado**; integrado en Programador vía `TurnoBaseEmpleado.jsx`.
- ✅ `ScheduleCreator` → se le quitó el dropdown de jornada y el selector de días (redundantes; el turno base manda).
- ✅ `useScheduleManagement` → ya no exige `jornadaId` ni envía `jornada_id`.
- ✅ Tab "Jornadas" → arreglado el mapeo `dias_laborales` ↔ `dias_aplica` (enteros ISO). Crear/editar/mostrar OK.
- ✅ Eliminado `tabs/AsignacionTurnos.jsx` (código muerto).

## Deuda técnica / issues conocidos

- **`updateHorario`**: bloques ya por turno (Fase 4 ✅), pero conserva las validaciones semanales viejas (extra ≤12/sem) + banco del modelo anterior. La spec controla por quincena → reconciliar.
- **`ALLOWED_EMAILS`** en `observacionesController` (permisos): lista hardcodeada con un gmail personal. Tema de permisos, no de notificación. Limpiar aparte.
- **Frontend — hecho en pasada de bugs/edición**:
  - ✅ Crashes `toast.info`/`toast.warning` (no existen en react-hot-toast) corregidos en `useScheduleManagement`, `useScheduleAndBlockingData`, `ObservacionesPH`.
  - ✅ `useScheduleEditing` reescrito: ya NO recalcula al modelo viejo (corrupción 10/7 que metía extras fantasma). Ahora solo envía las horas de cada día (preserva las existentes) + `usuario_email`/`usuario_nombre` (auditoría) y muestra la alerta de quincena (`extras_quincena`) por toast.
- **Frontend pendiente**: UI de intercambio de turnos (backend `POST /horarios/intercambio` listo), vista de consulta de auditoría, mostrar compensación de estudio (4h/4h) en el calendario. Limpiar el selector de "día reducido" de `WeekHistory` (quedó inerte).
- **Config Vercel (no es código)**: el envío de correo falla con `535 auth` → credenciales SMTP de Outlook (`EMAIL_USER`/`EMAIL_PASS`) mal o vencidas en las env vars de Vercel. El horario se crea igual; solo el correo no sale.

## Archivos clave

- `src/utils/schedule.js` — motor de generación (a reescribir en Fase 2)
- `src/controllers/horariosController.js` — crear/editar horario, banco de horas
- `src/controllers/phConfigController.js` — config: jornadas, parámetros, sedes, asignación, destinatarios
- `src/services/phConfigService.js` — lee config de negocio (`buildScheduleConfig`)
- `src/config/notificationDefaults.js` — fallback de destinatarios y constantes
- `sql/ph_fase1_cimientos.sql` — migración Fase 1
- Frontend (repo `Pagina-web_React`): `src/pages/Programador_horarios/components/Configuracion/tabs/AsignacionTurnos.jsx` — tab de asignación; `services/phConfigService.js` — métodos `getAsignaciones`/`asignarJornada`
