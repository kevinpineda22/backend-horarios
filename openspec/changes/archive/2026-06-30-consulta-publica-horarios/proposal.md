# Proposal: Reconstrucción de Consulta Pública de Horarios

## Intent

El componente `ConsultaHorariosPublica` (React) está atado al sistema VIEJO: referencia `horas_extra_reducidas`/`horas_legales_reducidas` (banco de horas eliminado), ignora los campos nuevos del sistema de turno base (estudio, permisos, redistribución, festivos trabajados, jornada reducida) y no expone el turno base del empleado. Reconstruirlo desde cero para mostrar el horario completo del sistema NUEVO.

## Scope

### In Scope
- Frontend: Reconstruir `ConsultaHorariosPublica.jsx` + `ConsultaHorariosPublica.css` (ruta: `Pagina-web_React/src/pages/Programador_horarios/`)
- Backend: Extender endpoint `POST /api/public/consulta-horarios` para devolver jornada base vigente del empleado
- Nuevos sub-componentes: `DayCard`, `WeekPanel`, `ResumenGlobal` con datos actualizados
- Mapa de bloqueos (observaciones) con diferenciación parcial vs total

### Out of Scope
- Autenticación/login de empleados (sigue siendo pública por cédula)
- Cambios al flujo de creación/edición de horarios
- Sistema de notificaciones
- Email/notificaciones push
- Commit creation

## Capabilities

### New Capabilities
- `consulta-horarios-publica`: Consulta pública de horarios mostrando turno base del empleado, desglose semanal con tarjetas de día enriquecidas (estudio modo/compensación, permisos por hora, festivos trabajados, jornada reducida, redistribución), bloqueos parciales vs totales.

### Modified Capabilities
- None (pure refactor — no spec-level behavior changes)

## Approach

1. **Backend**: En `public.js`, al buscar el empleado, llamar `getJornadaBaseVigente(empleado.id)` para incluir `turno_base` (nombre del turno, entrada/salida L-V y sábado) en la respuesta del empleado.
2. **Frontend**: Reconstruir componente con React moderno (hooks, framer-motion). Arquitectura: `ConsultaHorariosPublica` → `ResumenGlobal` + `WeekPanel[]` → `DayCard[]`.
3. **DayCard** maneja 4 estados: trabajo activo, bloqueo total (rojo), bloqueo parcial/estudio (ámbar), día libre/domingo. Muestra todos los campos nuevos como badges.
4. Eliminar todo código de banco de horas (`horas_extra_reducidas`, `horas_legales_reducidas`, `sum-card.bank`).
5. El resumen global incluye: horas base, extras, estudio compensado, permiso, días laborados.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/routes/public.js` | Modified | Añadir `turno_base` en respuesta del endpoint |
| `Pagina-web_React/.../ConsultaHorariosPublica.jsx` | Modified | Reconstrucción completa del componente |
| `Pagina-web_React/.../ConsultaHorariosPublica.css` | Modified | Actualizar estilos (eliminar banco, nuevos badges) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Frontend está en workspace diferente: rutas de import (`../../services/apiHorarios`) pueden romperse | Medium | Verificar patch de import y dependencias existentes antes de cortar código |
| API necesita dependencia circular (phConfigController importado en routes) | Low | Import directo desde `phConfigController.js` en `public.js` |
| El endpoint actual devuelve `horarios` tal cual de Supabase — no asegura que todos los campos nuevos estén presentes | Medium | Verificar schema de la tabla `horarios` y mapear `dias[]` del JSON |

## Rollback Plan

- **Backend**: Revertir cambios en `public.js` (git checkout del archivo).
- **Frontend**: Restaurar `ConsultaHorariosPublica.jsx` y `.css` desde git. El componente antiguo sigue funcionando (datos viejos se muestran como antes).
- **Data**: No hay migración de datos — solo lectura. Rollback es instantáneo y sin pérdida.

## Dependencies

- La tabla `horarios` en Supabase debe tener las columnas `dias` con los campos nuevos (`horas_estudio`, `es_estudio`, `estudio_modo`, etc.) — se asume que la generación actual ya los escribe.
- Frontend: `apiHorarios` service en `Pagina-web_React/src/services/` — verificar que `apiPublic` apunte a la URL correcta.

## Success Criteria

- [ ] Usuario ingresa cédula y ve: nombre, turno base, resumen global (base + extras + estudio + permiso), lista de semanas plegables
- [ ] Cada día muestra correctamente: badges de estudio (modo y compensación), permiso por hora, festivo trabajado, jornada reducida
- [ ] Bloqueos totales (Vacaciones, Incapacidad) se muestran como día bloqueado en rojo; estudio parcial como ámbar
- [ ] Sin referencias a banco de horas en UI ni en código
- [ ] Resumen global suma correctamente todos los conceptos del nuevo sistema
