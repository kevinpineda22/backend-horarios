# Guía para el Panel de Administración - Programador de Horarios (Frontend)

Este documento detalla lo que debemos construir en el frontend de React (`Pagina-web_React/src/pages/Programador_horarios`) en la nueva sesión de Gemini CLI.

El objetivo es crear el "Panel de Control" que consumirá los endpoints del backend que acabamos de terminar (`/api/ph-config/*`), para que el administrador pueda gestionar las reglas de negocio de manera autogestiva.

---

## 1. Estructura de Pantallas (Pestañas o Vistas)

Necesitamos un componente principal (`AdminPanel.jsx` o similar) que se divida en **4 secciones o pestañas principales**:

### A. Gestión de Jornadas (Turnos Base)
- **Endpoint:** `/api/ph-config/jornadas` (GET, POST, PUT, DELETE)
- **UI Requerida:** 
  - Una tabla que liste las jornadas existentes.
  - Un formulario (modal o expandible) para crear/editar una jornada.
- **Campos del formulario:**
  - `nombre` (Ej: Turno A)
  - `hora_entrada` (Ej: 07:00:00)
  - `hora_salida` (Ej: 16:00:00)
  - `sabado_entrada` (Ej: 07:00:00)
  - `sabado_salida` (Ej: 11:00:00)
  - `dias_laborales` (Selector múltiple: Lunes a Viernes)

### B. Parámetros Globales (Límites y Reglas)
- **Endpoint:** `/api/ph-config/parametros` (GET, PUT)
- **UI Requerida:**
  - Un formulario único con botón de "Guardar Cambios".
- **Campos del formulario:**
  - `max_extra_por_quincena` (Número: Máximo de extras permitidas a la quincena)
  - `max_extra_por_dia` (Número: Máximo de extras por día)
  - `limite_legal_semanal` (Ej: 44)
  - `limite_extra_semanal` (Ej: 12)
  - `modelo_quincena` (Selector: 'fija' o 'movil')
  - `descansos` (Lista dinámica para añadir tiempos de descanso: ej. 15m desayuno, 45m almuerzo).

### C. Configuración por Sede (Cupos)
- **Endpoint:** `/api/ph-config/sedes` (GET, PUT)
- **UI Requerida:**
  - Un listado de las sedes.
  - Al seleccionar una sede, poder asignarle cuántos cupos tiene para cada jornada.
- **Campos:**
  - `sede_id` (Se debe leer de la tabla de sedes actual).
  - `cupos_por_turno` (Mapeo de jornada -> cantidad de cupos).

### D. Destinatarios de Notificaciones (Incapacidades)
- **Endpoint:** `/api/ph-config/destinatarios` (GET, PUT)
- **UI Requerida:**
  - Una lista simple (tags) de correos electrónicos.
  - Input para agregar y "X" para quitar correos.

---

## 2. Asignación de Turnos a Empleados (Fase 4 - Motor)

Además del Panel de Admin para "crear" los turnos, necesitamos actualizar la vista donde se programan las semanas de los empleados.

- **Antes:** Se asignaban horas manualmente.
- **Ahora:** Se debe desplegar un *Dropdown (Select)* que liste las jornadas creadas en el paso 1A (Ej: Turno A, Turno B).
- **Acción:** Al seleccionar el turno, el frontend envía el `jornada_id` al backend, y el motor de horarios automáticamente rellenará la semana y el sábado de ese empleado según las reglas que definimos en el panel.

---

## 💡 Prompt de Inicio para la Nueva Sesión

Cuando abras Gemini CLI en la carpeta `Pagina-web_React`, simplemente cópiale y pégale este texto:

> "Vengo del backend de Horarios. Ya terminamos de construir las tablas autogestivas y los endpoints CRUD en `/api/ph-config`. Tengo un documento llamado `INSTRUCCIONES-FRONTEND-PH.md` que explica todo lo que necesito. 
> 
> Mi objetivo principal es construir en `src/pages/Programador_horarios` el Panel de Administración visual con 4 pestañas: 1. Jornadas, 2. Parámetros, 3. Sedes y 4. Destinatarios, consumiendo los endpoints de Axios/Fetch apuntando a `/api/ph-config/*`. Además, tengo que actualizar el selector de turnos de los empleados. 
>
> ¿Por dónde empezamos a crear los componentes?"
