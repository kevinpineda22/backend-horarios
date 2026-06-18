# Programador de Horarios — Seguimiento de solicitudes

> Lista de todo lo solicitado en la construcción del módulo, con su estado.
> ✅ Hecho · 🟡 Parcial / en curso · ⬜ Pendiente · 🧰 Dato/config del usuario
> Última actualización: 2026-06-17.

---

## 🚀 PRÓXIMOS PASOS (retomar acá)

> **Estado del código:** hay cambios **sin commitear** (frontend en rama `Johan` del repo
> `Pagina-web_React`, y backend en `backendHorarios`). El usuario NO quiere que se hagan commits.

### Para poner a funcionar lo ya hecho (orden recomendado)
1. **Redeploy del backend** en Vercel (hay endpoints y motor nuevos sin desplegar).
2. **Correr los SQL** en Supabase:
   - `sql/ph_sede_visibilidad.sql` (sedes ocultables).
   - `sql/ph_limpieza_pruebas.sql` *(solo si querés dejar el módulo en blanco para pruebas; ver advertencias en el archivo + vaciar el bucket `documentos-observaciones-ph`)*.
3. **Probar el frontend local** (`npm run dev` en `Pagina-web_React`) apuntando al backend de Vercel.
4. **Configurar datos** en el panel:
   - Parámetros → `max_extra_por_quincena = 24`.
   - Sedes y Cupos → dejar solo BARBOSA / LA 10 / LA CEBRA / PARQUE (renombrar + ocultar/eliminar) y cargar cupos 2+2.
   - Gestión de Empleados → reasignar empleados a las 4 sedes (botón "Cambiar").
   - Asignar turno base a cada colaborador (desde Vista por Sede o el Programador).
   - Destinatarios → cargar los 4 correos de incapacidad.
5. **Correo saliente**: migrar a Resend/Brevo (solo env vars en Vercel — ver `PUESTA-EN-MARCHA.md`).
6. **Publicar el frontend** nuevo a producción.

### Desarrollo pendiente (lo único de código)
- **#2 — Permiso por horas**: ✅ **COMPLETO (back + front)**. El permiso resta **solo
  las horas marcadas** (ausencia parcial, NO se pagan; el día paga menos — sin
  compensación, a diferencia del estudio). Backend: motor + 34 tests verdes. Frontend
  (rama `Johan`): toggle "Permiso por horas" en `PermisoForm` + paridad visual en el
  calendario. Contrato: `details.horas_permiso = [{ fecha, inicio, fin }]`; sin ese
  campo el permiso sigue bloqueando el día completo (compatibilidad). Falta solo
  redeploy + publicar para usarlo en prod.
- **#6 (resto)** Gestión de empleados más completa (alta más ágil, etc.) — definir según uso real.

### Cómo verificar que no se rompió nada (backend)
`cd backendHorarios && TZ=UTC npx vitest run` → deben pasar **30 tests**.

---

## A. Cumplimiento de la Especificación Técnica
Todos los puntos funcionales de la spec están implementados (detalle en
`docs/PROGRAMADOR-HORARIOS-CUMPLIMIENTO-SPEC.md`).

- [x] ✅ 2.1 / 2.2 / 2.3 — Jornadas, 2+2 por sede, sábado automático
- [x] ✅ 3.1 / 3.2 — Turno base y sábado al guardar
- [x] ✅ 4.1 / 4.2 — Extras por día + alerta de quincena
- [x] ✅ 5.1 / 5.2 — Edición, intercambio y auditoría
- [x] ✅ 6.1 / 6.2 — Estudio y compensación (Casos 1 y 2 verificados)
- [x] ✅ 7.1 / 7.2 / 7.3 — Incapacidad general/ARL, documentos, notificación
- [x] ✅ 8 — Validaciones, historial auditable, reglas configurables

## B. Mejoras y correcciones entregadas

- [x] ✅ Vista de **Auditoría de Cambios** (endpoint + pantalla)
- [x] ✅ Compensación de estudio visible en el calendario
- [x] ✅ Limpieza del "día reducido" inerte
- [x] ✅ `updateHorario`: quitado el bloqueo semanal de extras (control por quincena)
- [x] ✅ `ALLOWED_EMAILS`: removido gmail personal (configurable por env)
- [x] ✅ **Reconciliación del banco** → "Extras Acumulados" (con desglose día a día)
- [x] ✅ **Vista por Sede** (tablero Kanban con 2+2 en vivo)
- [x] ✅ **Programar e intercambiar** desde la Vista por Sede (intercambio con vista previa)
- [x] ✅ Auditoría ampliada: creación, eliminación y cambio de turno
- [x] ✅ **Sedes ocultables** del Programador (sin tocar datos compartidos)
- [x] ✅ Fix: error 500 al borrar un turno en uso → mensaje claro
- [x] ✅ Fix: "Cancelar Creación" ya no creaba el horario igual
- [x] ✅ **ABM de sedes** (crear / renombrar / eliminar) en Sedes y Cupos
- [x] ✅ Formulario de empleados usa **sedes reales** (no crea sedes fantasma) + fix correo
- [x] ✅ **Cambiar sede de empleado** desde Gestión de Empleados

## C. Documentación entregada

- [x] ✅ Estado vivo del proyecto — `PROGRAMADOR-HORARIOS-ESTADO.md`
- [x] ✅ Cumplimiento de la spec (entregable) — `PROGRAMADOR-HORARIOS-CUMPLIMIENTO-SPEC.md`
- [x] ✅ Puesta en marcha (datos + correo + SQL) — `PROGRAMADOR-HORARIOS-PUESTA-EN-MARCHA.md`
- [x] ✅ Script de limpieza de pruebas — `sql/ph_limpieza_pruebas.sql`
- [x] ✅ Este seguimiento — `PROGRAMADOR-HORARIOS-BACKLOG.md`

## D. Lote de pedidos del 2026-06-17

- [x] ✅ **#6 (parte)** Plantilla Excel documentada + cambiar sede de empleado
- [ ] 🧰 **#3** Extras por quincena = 24h → setear `max_extra_por_quincena = 24` en Parámetros *(config del usuario; opción: dejarlo como default en código)*
- [ ] 🧰 **#1** Dejar solo BARBOSA / LA 10 / LA CEBRA / PARQUE *(datos: renombrar + reasignar empleados + borrar sobrantes; herramientas ya disponibles)*
- [ ] 🟡 **#6 (resto)** Gestión de empleados más completa (crear más ágil, etc.) *(cambiar sede ya está; resto a definir según uso)*
- [x] ✅ **#4 / #5** Estudio "día libre" y "redistribuir" — motor (30 tests verdes) + formulario con **selector de modo** (parcial / día libre / redistribuir) y **recurrencia** ("todos los [día] del mes"). El parcial conserva la compensación 6.2.
- [x] ✅ **#2** Permiso por horas — COMPLETO (back + front): motor resta solo las horas marcadas (ausencia parcial, sin compensación) + 4 tests; formulario con toggle "por horas" y paridad visual en el calendario (rama `Johan`).

## E. Pendientes de infraestructura / datos (no son desarrollo)

- [ ] 🧰 Cargar cupos 2+2 por sede
- [ ] 🧰 Asignar turno base a cada colaborador
- [ ] 🧰 Cargar los 4 correos de incapacidad
- [ ] 🧰 Dejar operativo el correo saliente (Resend/Brevo — solo env vars)
- [ ] 🧰 Correr SQL pendientes en Supabase (`ph_sede_visibilidad.sql`)
- [ ] 🧰 Redeploy del backend + publicar el frontend
