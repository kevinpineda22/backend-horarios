# Programador de Horarios — Cumplimiento de la Especificación Técnica

> Documento de entrega. Compara, punto por punto, la Especificación Técnica solicitada
> contra cómo funciona el sistema implementado.
> Última actualización: 2026-06-16.

**Convenciones de estado:**
✅ Implementado y funcionando · ⚙️ Implementado, requiere cargar un dato de configuración · 📧 Implementado, depende del servicio de correo

---

## 1. Configuración base del sistema

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **2.1 Jornada laboral** — L-V 07:00–18:00, Sáb 07:00–14:00 | ✅ | Esa franja es el **marco de operación**. Dentro de ella, cada colaborador trabaja un **turno fijo de 8 horas netas** de lunes a viernes (con 1 hora de descansos: 15 min de desayuno y 45 min de almuerzo, descontados automáticamente). El sábado son 4 horas. Total semanal: **44 horas**. |
| **2.2 Configuración por sede** — 4 colaboradores, 2 en 07:00–16:00 y 2 en 09:00–18:00 | ⚙️ | El sistema maneja los dos turnos y permite definir **cupos por sede** (2 y 2). La nueva **Vista por Sede** muestra en vivo el cumplimiento del 2+2 (verde si está completo, ámbar si falta o sobra). Al asignar un turno, si se rompe la distribución, **avisa** (no bloquea). *Requiere cargar los cupos de cada sede una vez.* |
| **2.3 Regla de sábado (automática)** — 07:00–16:00 → Sáb 07:00–11:00 / 09:00–18:00 → Sáb 10:00–14:00 | ✅ | El horario del sábado se **calcula solo** a partir del turno de la semana, con esa tabla exacta. No se ingresa a mano y la franja no es editable: se evita cualquier inconsistencia entre semana y sábado. |

---

## 2. Módulo de Programación de Horarios

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **3.1 Selección de colaborador** — mostrar solo las opciones válidas (07:00–16:00 / 09:00–18:00) | ✅ | Al elegir un colaborador, el sistema muestra su **turno base** y solo permite los dos turnos válidos. El turno guarda historial de vigencia (desde cuándo rige). |
| **3.2 Asignación automática de sábado** al guardar | ✅ | Al generar el horario, el sistema asigna el sábado automáticamente según la regla 2.3. No permite incoherencias entre la semana y el sábado. |

> **Nota de operación:** para generar el horario de un colaborador es **obligatorio** que tenga un turno base asignado. Si no lo tiene, el sistema avisa y no genera (evita horarios sin fundamento). Esto se puede hacer cómodamente desde la **Vista por Sede**.

---

## 3. Módulo de Horas Extras

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **4.1 Registro por día** (no masivo) | ✅ | Las horas extra se registran **día por día**, editando el horario de la jornada puntual. No existe carga masiva. |
| **4.2 Máximo por quincena + alerta visual** al alcanzar o superar | ✅ | El sistema **acumula las horas extra por quincena** (1–15 y 16–fin de mes) y, al guardar, muestra una **alerta visual**: aviso amarillo al **alcanzar** el máximo y rojo al **superarlo**. Es alerta, no bloqueo. El máximo es **configurable**. Además hay una pestaña **"Extras Acumulados"** para consultarlo por colaborador con desglose día por día. |

---

## 4. Cambios manuales de horario

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **5.1 Edición diaria + intercambio de turnos** | ✅ | Se puede **modificar el horario de un día** y también **intercambiar turnos entre dos colaboradores**. El intercambio ahora muestra **una vista previa de los dos turnos** antes de confirmar (ya no es a ciegas). Se puede hacer desde la Vista por Sede. |
| **5.2 Registrar: quién, cuándo, horario anterior y nuevo** | ✅ | **Cada cambio queda auditado** con usuario, fecha/hora y "antes → después". Se consulta en la pestaña **"Auditoría de Cambios"** (filtrable por colaborador). |

---

## 5. Módulo de Novedades por Estudio

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **6.1 Programar la secuencia de días de estudio** y asociarla al colaborador | ✅ | Se registra la novedad de estudio para el colaborador, indicando los días y el horario de estudio dentro de la jornada. |
| **6.2 Compensación con horas extras** — identificar horas afectadas y descontar extras acumuladas | ✅ | El día de estudio **se paga completo**. La parte que cubre el **colaborador** se descuenta de sus **horas extra realmente acumuladas**, hasta un tope (configurable, por defecto 4 h); lo que exceda lo cubre la **empresa**. El reparto se muestra en el calendario ("Estudio Xh · colaborador Yh / empresa Zh") y en la pestaña "Extras Acumulados". |

**Casos de la spec — verificados con pruebas automáticas:**

| Caso | Situación | Resultado del sistema |
|---|---|---|
| **Caso 1** (Luisa Córdoba) | Estudio sábado completo (4 h) | Descuenta **4 h** de las horas extra del colaborador. Empresa: 0 h. Día cubierto. |
| **Caso 2** (David Ávalo) | Estudio lunes completo (8 h) | Colaborador cubre **4 h** (su tope) con extras; empresa cubre las otras **4 h**. Si hay más extras, no se afectan. |

---

## 6. Módulo de Novedades por Incapacidad

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **7.1 Tipos: general y ARL** | ✅ | Distingue **Incapacidad General** (Enfermedad General) e **Incapacidad ARL** (Incidente de Trabajo). |
| **7.2 Documentos obligatorios** — incapacidad e historia clínica | ✅ | Al registrar la novedad, el sistema **exige adjuntar** el archivo de incapacidad y la historia clínica. |
| **7.3 Notificación automática** a Valentina Flórez, Laura Obando, Laura Melisa Caro y Laura Ariza | ⚙️📧 | Al registrar la incapacidad, el sistema **envía los documentos por correo** a una lista **configurable** desde el panel. *Falta cargar los 4 correos y dejar operativo el envío de correo.* |

---

## 7. Requisitos funcionales (sección 8)

| Punto de la spec | Estado | Cómo funciona en nuestro sistema |
|---|---|---|
| **Validaciones en tiempo real** | ✅ | Avisos inmediatos: topes diarios, días bloqueados por novedades, alerta de quincena, etc. |
| **Historial de cambios auditable** | ✅ | La pestaña "Auditoría de Cambios" registra y permite consultar: **edición de día, intercambio, creación de horario, eliminación de horario y cambio de turno base** (quién, cuándo, antes → después). |
| **Reglas configurables por parámetros** | ✅ | Los límites y topes se configuran desde el panel **"Parámetros"**, sin tocar el sistema. |

---

## 8. Funcionalidades adicionales (más allá de la spec)

- **Vista por Sede (tablero):** se elige una sede y se ve, de un vistazo, a sus colaboradores por turno (Kanban), el cumplimiento del 2+2, quién no tiene turno, y desde ahí **programar, intercambiar y cambiar turnos** con contexto.
- **Pestaña "Extras Acumulados":** por colaborador y quincena, total de extras vs. el máximo, neto después de estudio y **desglose día por día**.
- **Sedes ocultables:** se puede elegir qué sedes aparecen en el Programador, sin afectar la información compartida de la empresa.
- **Calendario unificado** (jornadas, festivos, novedades, ajustes manuales en un solo lugar) y **aviso de horario al colaborador** por correo al asignarlo.

---

## 9. Qué falta para la puesta en producción (no es desarrollo)

Todos los puntos funcionales de la Especificación Técnica están **implementados**. Lo que resta es **configuración e infraestructura**:

**Datos (se cargan en el panel):**
1. Cupos 2+2 por sede.
2. Turno base de cada colaborador (requisito para generar su horario).
3. Los 4 correos de incapacidad.

**Infraestructura:**
4. Dejar operativo el **correo saliente** (migración a un proveedor robusto — solo configuración).
5. **Publicar** la versión nueva (backend y frontend) para los usuarios finales.
6. Correr los **scripts SQL** pendientes en la base (incluye el de "sedes ocultables"; sin él, el sistema funciona mostrando todas las sedes).

**Mejoras opcionales (no son de la spec):**
7. Extender la auditoría también a cambios de configuración.

---

**Resumen:** el sistema cumple **el 100% de los puntos funcionales** de la Especificación Técnica. Lo único que separa al sistema del uso real es **carga de datos, correo y publicación** — ninguno de ellos requiere más desarrollo.
