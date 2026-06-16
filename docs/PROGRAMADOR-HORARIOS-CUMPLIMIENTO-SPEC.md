# Programador de Horarios — Cumplimiento de la Especificación Técnica

> Documento de entrega. Compara, punto por punto, la Especificación Técnica solicitada
> contra cómo funciona el sistema implementado.
> Fecha: 2026-06-16.

**Convenciones de estado:**
✅ Implementado y funcionando · ⚙️ Implementado, requiere cargar un dato de configuración · 📧 Implementado, depende del servicio de correo

---

## 1. Configuración base del sistema

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **2.1 Jornada laboral** — L-V 07:00–18:00, Sáb 07:00–14:00 | ✅ | Esa franja es el **marco de operación**. Dentro de ella, cada colaborador trabaja un **turno fijo de 8 horas netas** de lunes a viernes (con 1 hora de descansos: 15 min de desayuno y 45 min de almuerzo, descontados automáticamente). El sábado son 4 horas. Total semanal: **44 horas**. |
| **2.2 Configuración por sede** — 4 colaboradores, 2 en 07:00–16:00 y 2 en 09:00–18:00 | ⚙️ | El sistema maneja los dos turnos (07:00–16:00 y 09:00–18:00) y permite definir **cupos por sede** (2 y 2). Al asignar un turno, si se rompe la distribución 2+2 el sistema **avisa** (alerta suave) pero no bloquea, para dar flexibilidad operativa. *Requiere cargar los cupos de cada sede una vez.* |
| **2.3 Regla de sábado (automática)** — 07:00–16:00 → Sáb 07:00–11:00 / 09:00–18:00 → Sáb 10:00–14:00 | ✅ | El horario del sábado se **calcula solo** a partir del turno de la semana, exactamente con esa tabla. No se ingresa a mano y no es editable: se evita cualquier inconsistencia entre semana y sábado. |

---

## 2. Módulo de Programación de Horarios

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **3.1 Selección de colaborador** — mostrar solo las opciones válidas (07:00–16:00 / 09:00–18:00) | ✅ | Al elegir un colaborador, el sistema muestra su **turno base** y solo permite los dos turnos válidos. El turno guarda historial de vigencia (desde cuándo rige), por si un colaborador cambia de turno. |
| **3.2 Asignación automática de sábado** al guardar | ✅ | Al generar el horario, el sistema asigna el sábado automáticamente según la regla 2.3. No permite incoherencias entre la semana y el sábado. |

> **Nota de operación:** para generar el horario de un colaborador es **obligatorio** que tenga un turno base asignado. Si no lo tiene, el sistema lo avisa y no genera (evita horarios sin fundamento).

---

## 3. Módulo de Horas Extras

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **4.1 Registro por día** (no masivo) | ✅ | Las horas extra se registran **día por día**, editando el horario de la jornada puntual. No existe carga masiva semanal/mensual. |
| **4.2 Máximo por quincena + alerta visual** al alcanzar o superar | ✅ | El sistema **acumula las horas extra por quincena** (1–15 y 16–fin de mes) y, al guardar una edición, muestra una **alerta visual**: un aviso amarillo cuando se **alcanza** el máximo y uno rojo cuando se **supera**. Es una alerta, no un bloqueo (el responsable decide). El máximo por quincena es **configurable**. |

---

## 4. Cambios manuales de horario

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **5.1 Edición diaria + intercambio de turnos** | ✅ | Se puede **modificar el horario de un día** puntual y también **intercambiar turnos entre dos colaboradores** para una fecha. El sistema recalcula automáticamente las horas y los bloques según el turno de cada uno. |
| **5.2 Registrar: quién, cuándo, horario anterior y nuevo** | ✅ | **Cada cambio queda auditado**: se guarda el usuario que lo hizo, la fecha y hora, el día afectado, y el "antes → después". Esto se consulta en la pestaña **"Auditoría de Cambios"** (se puede filtrar por colaborador). |

---

## 5. Módulo de Novedades por Estudio

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **6.1 Programar la secuencia de días de estudio** y asociarla al colaborador | ✅ | Se registra la novedad de estudio para el colaborador, indicando los días y el horario de estudio dentro de la jornada. |
| **6.2 Compensación con horas extras** — identificar horas afectadas y descontar extras acumuladas | ✅ | El día de estudio **se paga completo**. La parte que cubre el **colaborador** se descuenta de sus **horas extra realmente acumuladas**, hasta un tope (configurable, por defecto 4 h); lo que exceda ese tope **lo cubre la empresa**. Todo el reparto se muestra en el calendario ("Estudio Xh · colaborador Yh / empresa Zh") y en la pestaña "Extras Acumulados". |

**Casos de la spec — verificados con pruebas automáticas:**

| Caso | Situación | Resultado del sistema |
|---|---|---|
| **Caso 1** (Luisa Córdoba) | Estudio sábado completo (4 h) | Descuenta **4 h** de las horas extra del colaborador. Empresa: 0 h. Día cubierto. |
| **Caso 2** (David Ávalo) | Estudio lunes completo (8 h) | Colaborador cubre **4 h** (su tope) con extras; empresa cubre las otras **4 h**. Si hay más extras, no se afectan. |

---

## 6. Módulo de Novedades por Incapacidad

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **7.1 Tipos: general y ARL** | ✅ | El sistema distingue **Incapacidad General** (Enfermedad General) e **Incapacidad ARL** (Incidente de Trabajo). |
| **7.2 Documentos obligatorios** — incapacidad e historia clínica | ✅ | Al registrar la novedad, el sistema **exige adjuntar** el archivo de incapacidad y la historia clínica. |
| **7.3 Notificación automática** a Valentina Flórez, Laura Obando, Laura Melisa Caro y Laura Ariza | ⚙️📧 | Al registrar la incapacidad, el sistema **envía los documentos por correo** a la lista de destinatarios. La lista es **configurable** desde el panel. *Falta cargar los 4 correos y dejar operativo el envío de correo (ver "Pendientes" abajo).* |

---

## 7. Requisitos funcionales (sección 8)

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **Validaciones en tiempo real** | ✅ | El sistema valida mientras se opera: avisa de topes diarios, días bloqueados por novedades, alerta de quincena, etc., con mensajes inmediatos en pantalla. |
| **Historial de cambios auditable** | ✅ | Toda edición de horario queda registrada y es **consultable** en la pestaña "Auditoría de Cambios" (quién, cuándo, antes → después). |
| **Reglas configurables por parámetros** | ✅ | Los límites y topes (jornada legal, extras por quincena, tope de estudio del colaborador, etc.) se configuran desde el panel **"Parámetros"**, sin tocar el sistema. |

---

## 8. Funcionalidades adicionales (más allá de la spec)

- **Pestaña "Extras Acumulados":** por colaborador y quincena muestra el total de extras vs. el máximo, el neto después de descontar estudio, y el **desglose día por día** (qué día generó cada extra y qué día de estudio descontó).
- **Calendario unificado:** muestra en un solo lugar jornadas, festivos, novedades (estudio, incapacidades) y ajustes manuales.
- **Notificación de horario al colaborador** por correo cuando se le genera/asigna su horario.

---

## 9. Pendientes para puesta en producción (no son desarrollo)

Estos puntos son **carga de datos y configuración**, no programación:

1. **Cupos 2+2 por sede** — cargar una vez en el panel.
2. **Turno base por colaborador** — asignar a cada persona (requisito para generar su horario).
3. **Los 4 correos de incapacidad** — cargar en el panel de destinatarios.
4. **Servicio de correo** — dejar operativo el envío saliente (el sistema ya tiene la lógica; depende de la configuración del proveedor de correo).
5. **Publicación** — desplegar la versión nueva para los usuarios finales.

---

**Resumen:** todos los puntos funcionales de la Especificación Técnica están **implementados**. Lo que resta para el uso real es **cargar datos de configuración** (cupos, turnos, correos) y **dejar operativo el correo y la publicación** — ninguno de ellos requiere más desarrollo.
