# Programador de Horarios — Estado del proyecto

> Doc vivo. Fuente única de verdad spec → código. Última actualización: 2026-06-12.
> **Si retomás el proyecto, leé este doc primero.** La sección "👉 QUÉ FALTA" es el punto de continuación.

---

## 0. Resumen en 30 segundos

- Se reescribió el módulo al modelo de la **Especificación Técnica**: **turnos fijos** (07:00–16:00 / 09:00–18:00) por colaborador, con sábado derivado, extras por quincena, edición auditada, compensación de estudio e incapacidad con notificación.
- **Backend: COMPLETO y verificado** en todas las secciones de la spec. Está commiteado y desplegado en Vercel (`backend-horarios-lake.vercel.app`).
- **Frontend: 100% de la spec en código** (2026-06-16): vista de auditoría, compensación de estudio en el calendario y limpieza de UI vieja ya hechas. Queda solo tech-debt (reconciliar el preview de edición a quincena). Los cambios viven en la rama **`Johan`** (repo `Pagina-web_React`); el grueso ya está commiteado, los últimos 3 (auditoría/estudio/limpieza) están **en el working tree sin commitear**.
- Se prueba con: **frontend local** (`npm run dev`) → **backend de Vercel**. No hace falta desplegar el frontend para probar; sí para que lo usen los usuarios reales en merkahorro.com.

---

## 1. El modelo (clave para entender todo)

| | Qué es | De quién depende | Dónde se gestiona |
|---|---|---|---|
| **Turno** (jornada base) | Franja FIJA: 07-16 o 09-18 | de la **persona** | Programador → panel "Turno base" (`TurnoBaseEmpleado`) |
| **Horario** | Calendario concreto de X semanas (días, horas, bloques) | se **deriva** del turno + fechas | Programador → generar/editar |

El turno es el molde; el horario son las semanas que salen del molde. El sábado se deriva del turno (regla 2.3).

---

## 2. Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Modelo | Turnos fijos (NO el motor de horas variables anterior) |
| Turno base | Con historial de vigencia (`ph_asignacion_jornada`) |
| Distribución 2+2 por sede | Alerta blanda (avisa, no bloquea) |
| Destinatarios novedades | DB-driven (`ph_notificacion_destinatarios`, tipo `critica`) con fallback a la lista SST hardcodeada |
| Reglas (límites, topes) | Configurables vía `ph_parametros_globales` con fallback a los valores legales |
| Compensación estudio | Día cubierto (pago completo); el colaborador cubre `min(horas_estudio, tope)` desde el banco, el resto la empresa. Tope = param `horas_estudio_colaborador` (default 4) |
| Tab "Jornadas" | Editable (se arregló el mapeo de días) |

---

## 3. Cumplimiento de la spec (estado actual)

| Sección | Estado | Nota |
|---------|--------|------|
| 2.1 Jornada base L-V/Sáb | 🟢 | Motor usa el turno: 8h netas L-V, 4h Sáb |
| 2.2 Config por sede 2+2 | 🟢 | Cupos + alerta blanda al asignar. Falta cargar cupos (dato) |
| 2.3 Sábado automático | 🟢 | Derivado del turno. Verificado |
| 3.1 Opciones válidas por colaborador | 🟢 | Panel "Turno base" en el Programador |
| 3.2 Auto-asignar sábado | 🟢 | El motor lo deriva al generar |
| 4.1 Extras por día | 🟢 | Se registran editando el día |
| 4.2 Máx extras quincena + alerta | 🟢 | Endpoint + alerta visual (toast) al editar |
| 5.1 Edición diaria | 🟢 | `updateHorario` recalcula bloques desde el turno |
| 5.1 Intercambio de turnos | 🟢 | Backend + UI (`IntercambioTurnos`) |
| 5.2 / 8 Auditoría (registrar) | 🟢 | Se escribe en `ph_auditoria_horario` con usuario/fecha/antes/después |
| 5.2 / 8 Auditoría (consultar) | 🟢 | `GET /horarios/auditoria/:empleado_id` + vista "Auditoría de Cambios" en el sidebar |
| 6 Estudio (cálculo compensación) | 🟢 | Verificado vs Caso 1 y 2 de la spec |
| 6 Estudio (mostrar compensación) | 🟢 | Icono + pill + tooltip "Estudio Xh · col. Yh / emp. Zh" en el calendario |
| 7.1 Incapacidad general/ARL | 🟢 | "Enfermedad General" / "Incidente de Trabajo" (=ARL) |
| 7.2 Docs obligatorios | 🟢 | Valida incapacidad + historia clínica |
| 7.3 Notificar a 4 personas | 🟡 | DB-driven listo; **faltan cargar los 4 correos** (dato) |
| 8 Reglas configurables | 🟢 | Tab "Parámetros" completo |

---

## 4. 👉 QUÉ FALTA (punto de continuación)

### Frontend (código) — en orden recomendado
1. ~~**Vista de auditoría (5.2/8)**~~ ✅ HECHO (2026-06-16)
   - Backend: `getAuditoria` + ruta `GET /horarios/auditoria/:empleado_id?horario_id=&limit=` (lee `ph_auditoria_horario`, orden `fecha_cambio.desc`; `empleado_id=todos` trae todo).
   - Frontend: `AuditoriaHorarios.jsx` + `.css`, vista "Auditoría de Cambios" en el sidebar; `horariosService.getAuditoria`. Tabla con fecha, colaborador, día, tipo, antes → después, autor.
2. ~~**Mostrar compensación de estudio (6.2)**~~ ✅ HECHO (2026-06-16)
   - `ProgramadorHorarios.jsx`: los metadatos `horas_estudio`/`estudio_compensa_banco`/`estudio_cubre_empresa` se pasan a `extendedProps` (rama de día regular, el día de estudio se paga completo → cae ahí) y se pintan en `eventContentRenderer`: icono `FaGraduationCap`, pill "Estudio Xh · col. Yh / emp. Zh", línea de tooltip y clase `ph-study-day`. CSS en `ProgramadorHorarios.css` (`.ph-study-pill`, `.study-comp-icon`, `.ph-study-day`).
3. ~~**Limpieza UI**~~ ✅ HECHO (2026-06-16)
   - Eliminado el selector de "día reducido" y "tipo de jornada reducida" de `WeekHistory.jsx` + props huérfanas (`reducedDay`/`reducedDayType`/`onReducedDay*`) en `WeekHistoryWrapper.jsx` y el estado/setters en `useScheduleEditing.js`. Se conservó la rama `else` del preview de edición (defaults 10/7) — eso es tech-debt aparte (reconciliar a quincena).
4. ~~**Bug "Cancelar Creación"**~~ ✅ HECHO (2026-06-16)
   - En `useScheduleManagement.js`, el try/catch de la consulta del banco atrapaba el throw de cancelación → el horario se creaba igual (pedía festivo y creaba). Ahora el try/catch envuelve SOLO la consulta; la cancelación del usuario aborta todo el flujo.
5. ~~**Banco de Horas → "Extras Acumulados"**~~ ✅ RECONCILIADO (2026-06-16)
   - El banco viejo (exceso sobre 56h/sem) se retiró. La pestaña pasó a `ExtrasAcumulados.jsx` + `.css`: por colaborador y quincena muestra el acumulado de extras vs. el máximo (spec 4.2, con color de alerta), el neto tras estudio, y el **desglose día por día** (qué día aportó cada extra / qué día de estudio descontó) — esto último responde el "porque el día X" que el banco viejo no podía.

### Tech debt
- ~~**`updateHorario`** + **banco de horas**~~ ✅ RECONCILIADO (2026-06-16) — ver "Reconciliación del banco" abajo.
- **`updateHorario`**: (2026-06-16) quitado el **bloqueo semanal de extras**. Los extras se controlan por **quincena** con alerta visual (spec 4.2). Se conservan los topes **diarios** legales (8h L-V / 4h Sáb + máximo diario).

### Reconciliación del banco a "extras reales acumulados" ✅ (2026-06-16)
Decisión del usuario: el banco de horas (concepto del modelo viejo, NO está en la spec) se retira; el estudio descuenta de los **extras reales acumulados** (derivados de los días, `Σ horas_extra`), alineado a la spec 6.2.
- **Fase 0** — Red de seguridad: `src/tests/schedule.estudio.test.js` (vitest), valida Casos 1 y 2 de la spec + regresión 44h. Correr: `TZ=UTC npx vitest run`. **28 tests verdes.**
- **Fase 1** — `createHorario`: el estudio ya NO debita la tabla; reporta `compensacion_estudio: { cubierto_colaborador, cubierto_empresa }` desde los metadatos por día.
- **Fase 2** — Retirado el banco viejo del backend: eliminados `applyBankedHours`, `apply_banked_hours`/`bank_entry_ids`, la sección 8 de `updateHorario` (`createOrUpdateExcess`/`resetForSemana` + `manualOvertime`), e imports muertos. `hoursBankController.js`/`routes/hoursBank.js` marcados **LEGACY** (read-only; ya no se escribe en `horas_compensacion`; la tabla se puede droppear cuando no haga falta el histórico).
- **Fase 3** — Frontend: quitado el diálogo "¿aplicar banco?" de `useScheduleManagement.js`; pestaña reconvertida a `ExtrasAcumulados.jsx`.
- ~~**`ALLOWED_EMAILS`** en `observacionesController`~~ ✅ HECHO (2026-06-16): removido el gmail personal hardcodeado; lista de GH ahora extensible por env `HR_ALLOWED_EMAILS` (CSV) con fallback a los 5 correos corporativos.

### Datos (los carga el usuario en Supabase/panel)
> 📋 Guía paso a paso con SQL listo para correr: **`docs/PROGRAMADOR-HORARIOS-PUESTA-EN-MARCHA.md`**
- [ ] Cupos 2+2 por sede → panel "Sedes y Cupos".
- [ ] Asignar turno base a cada colaborador → Programador (requerido para generar; si falta, 409).
- [ ] Cargar los 4 correos de incapacidad (Valentina Flórez, Laura Obando, Laura Melisa Caro, Laura Ariza) → panel "Destinatarios" (tipo `critica`).
- [x] SQL `sql/ph_fase1_cimientos.sql` — ya corrió (tablas + 2 turnos sembrados).
- [x] Params legales sembrados (limite_legal_semanal=44, etc.).

### Deploy / infra
- [ ] **Commitear la rama `Johan` (frontend) y desplegar** cuando se quiera poner en producción para los usuarios reales. Hoy el frontend de merkahorro.com es el VIEJO (incompatible con el backend nuevo).
- [ ] **Correo (Outlook 535)**: las credenciales SMTP fallan en Vercel (`EMAIL_USER`/`EMAIL_PASS`). Opciones: arreglar credenciales / habilitar SMTP autenticado / **migrar a Resend o Brevo** (recomendado, más robusto). NO es código.
- [ ] **Pausa de correos en pruebas**: poner `EMAIL_ENABLED=false` en Vercel (+ redeploy) pausa TODO el envío. Quitar cuando se quiera reactivar.

---

## 5. Cómo se prueba (setup actual)

- Backend: desplegado en Vercel. **Cada cambio de backend requiere redeploy** para verlo.
- Frontend: local con `npm run dev`. Usa el `.env` que apunta a Vercel (NO hay `.env.local`).
- Para iterar backend más rápido sin redeploy: correr `npm start` local (puerto 3000) y crear `.env.local` en el front con `VITE_BACKEND_HORARIOS_URL=http://localhost:3000`.
- ⚠️ El cálculo de semana asume servidor en **UTC** (Vercel lo es). En dev local (UTC-5) hay un corrimiento de día en las pruebas del motor; usar `TZ=UTC` para reproducir producción.

---

## 6. Archivos clave

### Backend (`backendHorarios`)
- `src/utils/schedule.js` — motor: `generateScheduleByShift` (generación por turno), `buildEditedDayBlocks` (edición), compensación de estudio.
- `src/utils/quincena.js` — cálculo de quincenas (1-15 / 16-fin).
- `src/controllers/horariosController.js` — crear/editar/intercambiar horario, extras-quincena, auditoría (`writeAuditEntries`), banco.
- `src/controllers/phConfigController.js` — jornadas, parámetros (upsert masivo), sedes/cupos, asignación de turno (`getJornadaBaseVigente`), destinatarios.
- `src/services/phConfigService.js` — `buildScheduleConfig` (lee reglas de la DB con fallback).
- `src/services/emailService.js` — envío + kill-switch `EMAIL_ENABLED`.
- `src/config/notificationDefaults.js` — fallback de destinatarios.
- `sql/ph_fase1_cimientos.sql` — migración (tablas + 2 turnos).

### Frontend (`Pagina-web_React`, rama `Johan`)
- `src/pages/Programador_horarios/ProgramadorHorarios.jsx` — pantalla principal (empleado → turno base → intercambio → generar → editar).
- `src/pages/Programador_horarios/components/TurnoBaseEmpleado.jsx` — asignar/cambiar turno base.
- `src/pages/Programador_horarios/components/IntercambioTurnos.jsx` — intercambio de turnos.
- `src/pages/Programador_horarios/components/ScheduleCreator.jsx` — generar (solo rango de fechas).
- `src/pages/Programador_horarios/hooks/useScheduleManagement.js` — crear horario.
- `src/pages/Programador_horarios/hooks/useScheduleEditing.js` — editar (envía horas + usuario, muestra alerta quincena).
- `src/pages/Programador_horarios/components/Configuracion/` — tabs Jornadas, Parámetros, SedesCupos, Destinatarios.
- `src/services/phConfigService.js` — API de config (jornadas, parámetros, sedes, asignaciones, destinatarios).
- `src/services/horariosService.js` — `getExtrasQuincena`, `intercambiarTurnos`.

### Endpoints backend principales
- `POST /api/horarios` — generar (lee turno base; 409 si no tiene).
- `PATCH /api/horarios/:id` — editar (audita; devuelve `extras_quincena`).
- `POST /api/horarios/intercambio` — intercambio de turnos.
- `GET /api/horarios/extras-quincena/:empleado_id?fecha=` — acumulado de extras por quincena.
- `GET/POST /api/ph-config/asignaciones` — turno base por colaborador.
- `GET/PUT /api/ph-config/parametros|sedes|destinatarios` + `jornadas` — configuración.
