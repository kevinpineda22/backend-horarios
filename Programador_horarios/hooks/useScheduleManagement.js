// src/hooks/useScheduleManagement.js
import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { format, eachDayOfInterval, getDay } from "date-fns";
// ¡IMPORTANTE! Asegúrate de importar 'api' (además de 'apiPublic')
import { api, apiPublic } from "../../../services/apiHorarios"; // Ajusta la ruta a tus servicios
import {
  isoWeekdayFromYMD,
  formatHours,
} from "../utils/programadorHorariosUtils"; // Ajusta la ruta a tu utils

// --- Helpers de Swal ---

const askHolidayDecision = async (ymd, name) => {
  const out = await Swal.fire({
    icon: "question",
    title: `Festivo Detectado: ${ymd}`,
    html: `<p>El día <b>${name}</b> es festivo.<br/>¿El empleado debe trabajarlo?</p>`,
    showCancelButton: true,
    confirmButtonText: "Sí, trabajarlo (Estándar Festivo)",
    cancelButtonText: "No, tomarlo como descanso",
    reverseButtons: true,
  });
  if (out.isConfirmed) {
    return "work";
  }

  if (out.isDismissed) {
    // Si el usuario elige explicitamente el botón de "No, tomarlo como descanso"
    if (out.dismiss === Swal.DismissReason.cancel) {
      return "skip";
    }
    // Cualquier otra forma de cerrar (ESC, clic fuera, X) cancela el flujo
    return null;
  }

  return null;
};

const askSundayCompensation = async (ymd, isWorking) => {
  const inputOptions = {
    compensado: "Compensado",
    "sin-compensar": "Sin Compensar",
  };
  const htmlContent = isWorking
    ? `<p>El domingo ${ymd} ha sido seleccionado como día laborable.</p><p>¿Cómo debe ser tratado?</p>`
    : `<p>El domingo ${ymd} no ha sido seleccionado como laborable.</p><p>¿Deseas marcarlo como compensado?</p>`;

  const out = await Swal.fire({
    icon: "question",
    title: `Domingo: ${ymd}`,
    html: htmlContent,
    input: "radio",
    inputOptions,
    inputValue: "compensado",
    showCancelButton: true,
    confirmButtonText: "Confirmar",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    customClass: { container: "programmador-horarios-swal2-festivos-wrap" },
  });
  return out.value || null; // Devuelve valor o null si cancela
};

// --- ¡NUEVO HELPER SWAL! ---
/**
 * Pregunta al usuario si desea aplicar las horas del banco acumuladas.
 * @param {number} totalPendingHours - El total de horas pendientes.
 * @returns {Promise<boolean|null>} - true si acepta, false si rechaza, null si cancela.
 */
const askApplyBankedHours = async (totalPendingHours) => {
  const out = await Swal.fire({
    icon: "info",
    title: "Banco de Horas Detectado",
    html: `<p>Este empleado tiene <b>${formatHours(
      totalPendingHours
    )} horas</b> acumuladas en el banco.</p>
               <p>¿Deseas aplicar estas horas para reducir la jornada de este nuevo horario?</p>`,
    showCancelButton: true,
    showDenyButton: true, // Añadir botón "No"
    confirmButtonText: "Sí, aplicar horas",
    denyButtonText: "No, crear horario normal",
    cancelButtonText: "Cancelar Creación",
    reverseButtons: true,
  });

  if (out.isConfirmed) return true; // Sí, aplicar
  if (out.isDenied) return false; // No, crear normal
  return null; // Cancelar
};
// --- Fin Nuevo Helper ---

export function useScheduleManagement(
  employeeId,
  range,
  workingWeekdays,
  onScheduleCreated,
  creatorInfo = null
) {
  const [creating, setCreating] = useState(false);

  const handleArchivarHorarios = useCallback(async (empId) => {
    if (!empId) return;
    try {
      await api.patch("/horarios/archivar", { empleado_id: empId });
    } catch (err) {
      console.error("Error archivando horarios:", err);
      toast.error("Error al archivar horarios anteriores.");
      throw new Error("Fallo al archivar horarios previos.");
    }
  }, []);

  let storedEmployee = null;
  try {
    storedEmployee = JSON.parse(localStorage.getItem("empleado_info") || "{}");
  } catch (error) {
    console.warn(
      "No se pudo parsear empleado_info para capturar el creador:",
      error
    );
  }

  const rawName =
    creatorInfo?.nombre ||
    creatorInfo?.name ||
    storedEmployee?.nombre ||
    storedEmployee?.nombre_completo ||
    null;

  const rawEmail =
    creatorInfo?.email ||
    storedEmployee?.correo ||
    localStorage.getItem("correo_empleado") ||
    null;

  const creatorLabel =
    typeof rawName === "string" && rawName.trim().length > 0
      ? rawName.trim()
      : typeof rawEmail === "string" && rawEmail.trim().length > 0
      ? rawEmail.trim()
      : null;

  const handleCreateHorario = useCallback(async () => {
    // 1. Validaciones previas
    if (creating) return;
    if (!employeeId) {
      toast.error("Selecciona un empleado primero.");
      return;
    }
    if (!range?.from || !range?.to) {
      toast.error("Selecciona un rango de fechas válido.");
      return;
    }
    if (!workingWeekdays?.length) {
      toast.error("Selecciona al menos un día laborable.");
      return;
    }

    const fechaInicio = format(range.from, "yyyy-MM-dd");
    const fechaFin = format(range.to, "yyyy-MM-dd");

    setCreating(true);
    let apply_banked_hours = false; // Valor por defecto

    try {
      // --- ¡NUEVO PASO 1.5: Consultar Banco de Horas! ---
      try {
        const { data: pendingHours } = await api.get(
          `/horas-compensacion/${employeeId}/pending`
        );
        const totalPendingHours = (pendingHours || []).reduce(
          (sum, entry) => sum + (entry.horas_pendientes || 0),
          0
        );

        if (totalPendingHours > 0) {
          const decision = await askApplyBankedHours(totalPendingHours);
          if (decision === null) {
            // Si el usuario presiona "Cancelar Creación"
            throw new Error(
              "Creación cancelada por el usuario (banco de horas)."
            );
          }
          apply_banked_hours = decision; // será true (Sí) o false (No)
        }
      } catch (err) {
        // Si falla la consulta del banco de horas, no detenemos la creación,
        // simplemente asumimos que no se aplican.
        console.error("Error al consultar banco de horas:", err);
        toast.warning(
          "No se pudo consultar el banco de horas. Se creará un horario normal."
        );
        apply_banked_hours = false;
      }
      // --- Fin Paso 1.5 ---

      // 2. Archivar horarios anteriores
      await handleArchivarHorarios(employeeId);

      // 3. Consultar festivos
      const { data: festivos } = await apiPublic.get("/festivos", {
        params: { start: fechaInicio, end: fechaFin },
      });
      const holidayOverrides = {};
      if (festivos && festivos.length > 0) {
        for (const f of festivos) {
          const iso = isoWeekdayFromYMD(f.fecha);
          if (workingWeekdays.includes(iso)) {
            const decision = await askHolidayDecision(f.fecha, f.nombre);
            if (decision === null) {
              throw new Error("Creación cancelada por el usuario (festivo).");
            }
            holidayOverrides[f.fecha] = decision;
          }
        }
      }

      // 4. Consultar domingos
      const sundaysInInterval = eachDayOfInterval({
        start: range.from,
        end: range.to,
      }).filter((d) => getDay(d) === 0);

      const sundayOverrides = {};
      if (sundaysInInterval.length > 0) {
        for (const sunday of sundaysInInterval) {
          const sundayYMD = format(sunday, "yyyy-MM-dd");
          const isSundayWorking = workingWeekdays.includes(7);
          const decision = await askSundayCompensation(
            sundayYMD,
            isSundayWorking
          );
          if (decision === null) {
            throw new Error("Creación cancelada por el usuario (domingo).");
          }
          sundayOverrides[sundayYMD] = decision;
        }
      }

      // 5. Construir y enviar payload (¡CON EL NUEVO FLAG!)
      const payload = {
        empleado_id: employeeId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        working_weekdays: workingWeekdays,
        holiday_overrides: holidayOverrides,
        sunday_overrides: sundayOverrides,
        apply_banked_hours: apply_banked_hours, // <-- ¡AÑADIDO!
        // bank_entry_ids: [] // Opcional: Si aplicamos todo, no enviamos IDs
      };

      if (creatorLabel) {
        payload.creado_por = creatorLabel;
      }

      const response = await api.post("/horarios", payload);

      // 6. Manejar respuesta
      const emailNotification = response.data?.email_notification;
      if (emailNotification) {
        if (emailNotification.sent) {
          toast.success(
            `Horario(s) creado(s). ✅ Correo enviado a ${emailNotification.empleado}.`
          );
        } else if (emailNotification.error) {
          toast.warning(
            `Horario(s) creado(s), pero no se pudo enviar correo: ${emailNotification.error}`
          );
        } else {
          toast.success("Horario(s) creado(s) con éxito.");
        }
      } else {
        toast.success("Horario(s) creado(s) con éxito.");
      }

      // 7. Ejecutar callback
      if (onScheduleCreated) {
        onScheduleCreated();
      }
    } catch (err) {
      console.error("Error detallado al crear horario:", err);

      if (err.response?.status === 409) {
        const conflictDetails = (err.response.data.bloqueos || [])
          .map((c) => `<li>${c.tipo}: ${c.fecha_inicio} al ${c.fecha_fin}</li>`)
          .join("");
        Swal.fire({
          icon: "error",
          title: "Conflicto de Horario Detectado",
          html: `No se pudo generar el horario por conflictos con novedades existentes:<ul>${conflictDetails}</ul>`,
        });
      } else if (err.message.includes("cancelada por el usuario")) {
        toast.info(err.message); // Informar al usuario que canceló
      } else {
        toast.error(
          "Error al crear el horario: " +
            (err.response?.data?.message || err.message)
        );
      }
    } finally {
      setCreating(false);
    }
  }, [
    creating,
    employeeId,
    range,
    workingWeekdays,
    handleArchivarHorarios,
    onScheduleCreated,
    creatorLabel,
  ]);

  return {
    creating,
    handleCreateHorario,
  };
}
