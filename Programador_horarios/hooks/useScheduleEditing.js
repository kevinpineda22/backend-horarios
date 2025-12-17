// src/hooks/useScheduleEditing.js
import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { api } from "../../../services/apiHorarios"; // Ajusta la ruta
import {
  isoWeekdayFromYMD,
  getDailyCapacity, // OJO: Esta es la capacidad *default* (10h/7h)
  getLegalCapForDay,
  getRegularDailyCap, // Esta es la capacidad *base* (10h/7h)
  getPayableExtraCapForDay,
  getDayInfo,
  allocateHoursRandomly,
  WEEKLY_LEGAL_LIMIT,
  WEEKLY_EXTRA_LIMIT,
  MAX_OVERTIME_PER_DAY, // Límite de horas banco por día
  hmToMinutes, // <-- IMPORTADO
  subtractTimeRanges,
} from "../utils/programadorHorariosUtils"; // Ajusta la ruta

// --- Helpers de Swal para edición ---

const confirmEditHorario = async () => {
  const res = await Swal.fire({
    icon: "question",
    title: "Guardar cambios",
    text: "¿Estás seguro de que quieres actualizar este horario?",
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
  });
  return res.isConfirmed;
};

const askHourAdjustment = async ({
  dayName,
  currentHours,
  regularCap,
  overtimeCap,
}) => {
  // Definir MAX_OVERTIME_PER_DAY aquí si no está global
  const MAX_OVERTIME_PER_DAY_LOCAL = 4;
  const { value: formValues } = await Swal.fire({
    title: `Ajustar horas - ${dayName}`,
    html: `
          <div style="text-align: left; margin-bottom: 1rem;">
            <p><strong>Horas actuales:</strong> ${currentHours}</p>
            <p style="margin: 0 0 0.5rem 0;">
              <strong>Capacidad regular:</strong> ${regularCap}h &nbsp;|&nbsp; 
              <strong>Límite total:</strong> ${overtimeCap}h 
              (máx. ${MAX_OVERTIME_PER_DAY_LOCAL}h al banco)
            </p>
            <label for="new-hours" style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Nuevas horas:</label>
            <input type="number" id="new-hours" class="swal2-input" min="0" max="${overtimeCap}" step="0.5" value="${currentHours}" style="margin: 0;">
            
            <div style="margin-top: 1rem; padding: 0.75rem; background: #f0f9ff; border-radius: 6px; border-left: 4px solid #3b82f6;">
              <small style="color: #1e40af;">
                <strong>💡 Tip:</strong> Puedes aumentar o reducir las horas. 
                Si superas las ${regularCap}h, el excedente va al banco.
              </small>
            </div>
            
            <div style="margin-top: 1rem; padding: 0.75rem; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
              <small style="color: #92400e;">
                <strong>⚠️ Importante:</strong> Si reduces horas, recuerda crear una observación explicando el motivo.
              </small>
            </div>
          </div>`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Aplicar Cambio",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    focusConfirm: false,
    width: "550px",
    preConfirm: () => {
      const newHours = parseFloat(document.getElementById("new-hours").value);
      if (isNaN(newHours) || newHours < 0) {
        Swal.showValidationMessage("Las horas deben ser un número >= 0");
        return false;
      }
      if (newHours > overtimeCap) {
        Swal.showValidationMessage(
          `Las horas no pueden exceder ${overtimeCap}`
        );
        return false;
      }
      return { newHours };
    },
    customClass: {
      container: "programmador-horarios-swal2-hour-reduction",
    },
  });
  return formValues || null;
};
// --- Fin Helpers Swal ---

export function useScheduleEditing(blockingDatesMap, onScheduleUpdated) {
  const [editingWeekId, setEditingWeekId] = useState(null); // ID de la semana en edición
  const [manualReductions, setManualReductions] = useState({}); // { "Lunes": { horas_originales: 10, horas_reducidas: 8 } }
  const [reducedDay, setReducedDay] = useState(""); // El *nombre* del día reducido (ej: "Sábado")
  const [reducedDayType, setReducedDayType] = useState("salir-temprano"); // 'salir-temprano' o 'entrar-tarde'
  const [sundayStatus, setSundayStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false); // Estado de carga para el botón Guardar

  // Acción: Iniciar la edición de una semana
  const handleEditWeek = useCallback((week) => {
    setEditingWeekId(week.id);
    const initialReductions = {};

    // Cargar los ajustes manuales existentes de esa semana
    week.dias.forEach((day) => {
      if (day.horas_reducidas_manualmente) {
        initialReductions[day.descripcion] = {
          horas_originales: day.horas_originales ?? day.horas, // Fallback
          horas_reducidas: day.horas,
        };
      }
    });
    setManualReductions(initialReductions);

    // Cargar el día reducido existente
    const currentReducedDay = week.dias.find((day) => day.jornada_reducida);
    setReducedDay(currentReducedDay ? currentReducedDay.descripcion : "");
    setReducedDayType(
      currentReducedDay?.tipo_jornada_reducida || "salir-temprano"
    );

    const sundayDay = week.dias.find(
      (day) => isoWeekdayFromYMD(day.fecha) === 7
    );
    setSundayStatus(sundayDay?.domingo_estado || "");
  }, []);

  // Acción: Cancelar la edición
  const handleCancelEdit = useCallback(() => {
    setEditingWeekId(null);
    setManualReductions({});
    setReducedDay("");
    setReducedDayType("salir-temprano");
    setSundayStatus("");
  }, []);

  // Acción: Abrir el popup para ajustar horas de UN día
  const handleManualHourAdjustment = useCallback(
    async (week, dayName) => {
      const day = week.dias.find((d) => d.descripcion === dayName);
      if (!day) return;

      // Usa la hora ajustada si existe, si no, la hora original del día
      const currentHours =
        manualReductions[dayName]?.horas_reducidas ?? day.horas;

      const isoWeekdayNum = isoWeekdayFromYMD(day.fecha);
      const regularCap = getRegularDailyCap(isoWeekdayNum); // 10h o 7h
      const overtimeCap = regularCap + MAX_OVERTIME_PER_DAY; // 14h o 11h

      const result = await askHourAdjustment({
        dayName,
        currentHours,
        regularCap,
        overtimeCap,
      });

      if (result) {
        const { newHours } = result;

        // Validar contra bloqueos ANTES de guardar en estado
        const blocks = blockingDatesMap.get(day.fecha);
        if (newHours > 0 && blocks && blocks.length > 0) {
          const blockTypes = blocks.map((b) => b.tipo).join(", ");
          Swal.fire({
            icon: "error",
            title: "Día Bloqueado",
            text: `No se pueden asignar horas a este día (${day.fecha}) porque está bloqueado por: ${blockTypes}.`,
          });
          return;
        }

        // Determinar cuál era la hora "original" antes de *cualquier* ajuste manual
        const originalHoursForDay =
          manualReductions[dayName]?.horas_originales ?? day.horas;

        // Si la nueva hora es diferente de la original, guardar el ajuste
        if (Math.abs(newHours - originalHoursForDay) > 1e-6) {
          setManualReductions((prev) => ({
            ...prev,
            [dayName]: {
              horas_originales: originalHoursForDay,
              horas_reducidas: newHours,
            },
          }));
        } else {
          // Si la nueva hora es igual a la original, quitar el ajuste
          setManualReductions((prev) => {
            const newState = { ...prev };
            delete newState[dayName];
            return newState;
          });
        }

        if (Math.abs(newHours - currentHours) > 1e-6) {
          toast.info(
            `Horas ajustadas para ${dayName}. Guarda los cambios para aplicar.`
          );
        }
      }
    },
    [manualReductions, blockingDatesMap]
  );

  // Acción: Quitar un ajuste manual existente
  const handleRemoveManualReduction = useCallback(
    async (dayName) => {
      const reduction = manualReductions[dayName];
      if (!reduction) return;

      const confirmResult = await Swal.fire({
        title: "Quitar Ajuste",
        html: `<p>¿Restaurar las horas de <strong>${dayName}</strong> de <strong>${reduction.horas_reducidas}h</strong> a <strong>${reduction.horas_originales}h</strong>?</p>`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, restaurar",
        cancelButtonText: "Cancelar",
      });

      if (confirmResult.isConfirmed) {
        setManualReductions((prev) => {
          const newState = { ...prev };
          delete newState[dayName];
          return newState;
        });
        toast.info(`Ajuste manual removido para ${dayName}.`);
      }
    },
    [manualReductions]
  );

  // Acción: Guardar la semana entera
  const handleSaveEdit = useCallback(
    async (week) => {
      if (!week || isSaving) return;

      // Validar que se haya seleccionado un día reducido (si hay días laborables)
      const hasWorkDays = week.dias.some((day) => {
        const manualAdj = manualReductions[day.descripcion];
        const isReduced = day.descripcion === reducedDay;
        const iso = isoWeekdayFromYMD(day.fecha);
        if (iso === 7) return false; // Ignorar domingos

        const defaultHours = getDailyCapacity(iso, false, null); // 10h o 7h
        let effectiveHours;
        if (manualAdj) effectiveHours = manualAdj.horas_reducidas;
        else if (isReduced) effectiveHours = iso === 6 ? 6 : 9;
        else effectiveHours = defaultHours;

        return effectiveHours > 0;
      });

      if (hasWorkDays && !reducedDay) {
        return toast.error(
          "Por favor, selecciona el día para la jornada reducida (9h L-V / 6h Sáb)."
        );
      }

      if (!(await confirmEditHorario())) return;
      setIsSaving(true);

      try {
        // Re-validar bloqueos en todos los días antes de enviar
        const conflicts = [];
        week.dias.forEach((day) => {
          const manualAdj = manualReductions[day.descripcion];
          const isReduced = day.descripcion === reducedDay;
          const iso = isoWeekdayFromYMD(day.fecha);

          let newHours;
          if (iso === 7) newHours = 0;
          else if (manualAdj) newHours = manualAdj.horas_reducidas;
          else if (isReduced) newHours = iso === 6 ? 6 : 9;
          else newHours = getDailyCapacity(iso, false, null); // 10h o 7h

          const blocks = blockingDatesMap.get(day.fecha);
          // Filtrar bloqueos que NO sean de tipo "Estudio"
          const realBlocks = (blocks || []).filter((b) => b.tipo !== "Estudio");

          if (newHours > 0 && realBlocks.length > 0) {
            conflicts.push({
              fecha: day.fecha,
              descripcion: day.descripcion,
              bloqueos: realBlocks.map((b) => b.tipo).join(", "),
            });
          }
        });

        if (conflicts.length > 0) {
          const conflictDetails = conflicts
            .map(
              (c) =>
                `<li>${c.descripcion} (${c.fecha}): Bloqueado por ${c.bloqueos}</li>`
            )
            .join("");
          throw new Error(`Conflicto de bloqueo:<ul>${conflictDetails}</ul>`);
        }

        // Si no hay conflictos, proceder a recalcular todo
        let legalSum = 0,
          payableExtraSum = 0,
          totalSum = 0,
          legalCapacitySum = 0,
          extraCapacitySum = 0,
          allowOvertime = false;

        const updatedDias = week.dias.map((day) => {
          const iso = isoWeekdayFromYMD(day.fecha);
          const isSunday = iso === 7;
          const isSaturday = iso === 6;
          const isReduced = !isSunday && day.descripcion === reducedDay;
          const manualAdj = manualReductions[day.descripcion];

          let newHours;
          if (isSunday) newHours = 0;
          else if (manualAdj) newHours = manualAdj.horas_reducidas;
          else if (isReduced) newHours = isSaturday ? 6 : 9;
          else newHours = getDailyCapacity(iso, false, null); // 10h o 7h

          // --- DEDUCCIÓN DE HORAS DE ESTUDIO ---
          const dayBlockingDates = blockingDatesMap.get(day.fecha) || [];
          let studyHours = 0;
          dayBlockingDates.forEach((b) => {
            if (b.tipo === "Estudio" && b.range) {
              const [startStr, endStr] = b.range.split(" - ");
              if (startStr && endStr) {
                const mins = hmToMinutes(endStr) - hmToMinutes(startStr);
                studyHours += Math.max(0, mins / 60);
              }
            }
          });
          newHours = Math.max(0, newHours - studyHours);
          // -------------------------------------

          const legalCap = getLegalCapForDay(iso); // 8h o 4h
          const regularCap = getRegularDailyCap(iso); // 10h o 7h
          const payableExtraCap = getPayableExtraCapForDay(iso); // 2h o 3h
          const overtimeCap = regularCap + MAX_OVERTIME_PER_DAY; // 14h o 11h

          newHours = Math.min(newHours, overtimeCap); // Aplicar límite máximo diario
          if (regularCap > 0 && newHours - regularCap > 1e-6)
            allowOvertime = true; // Hay horas para el banco

          if (newHours > 0 && legalCap > 0) {
            legalCapacitySum += legalCap;
            extraCapacitySum += payableExtraCap;
          }

          const base = Math.min(newHours, legalCap);
          const extra = Math.max(0, newHours - base);
          legalSum += base;
          payableExtraSum += Math.min(extra, payableExtraCap);
          totalSum += newHours;

          const dayInfo = getDayInfo(
            iso,
            false,
            null,
            isReduced,
            reducedDayType
          );

          // --- FILTRAR SEGMENTOS POR ESTUDIO ---
          const studyRanges = [];
          dayBlockingDates.forEach((b) => {
            if (b.tipo === "Estudio" && b.range) {
              const [startStr, endStr] = b.range.split(" - ");
              if (startStr && endStr) {
                studyRanges.push({
                  start: hmToMinutes(startStr),
                  end: hmToMinutes(endStr),
                });
              }
            }
          });

          if (studyRanges.length > 0) {
            dayInfo.segments = subtractTimeRanges(
              dayInfo.segments,
              studyRanges
            );
          }
          // -------------------------------------

          const { blocks, entryTime, exitTime } = allocateHoursRandomly(
            day.fecha,
            dayInfo,
            newHours
          );

          // Limpiar campos de banco si las horas se redujeron manualmente
          const oldBankReduction =
            Number(day.horas_extra_reducidas || 0) +
            Number(day.horas_legales_reducidas || 0);
          const wasManuallyAdjusted = !!manualAdj;

          const normalizedSundayState =
            typeof sundayStatus === "string" ? sundayStatus.trim() : "";
          const sundayStateForDay = isSunday
            ? normalizedSundayState || null
            : day.domingo_estado || null;

          return {
            ...day,
            horas: newHours,
            horas_base: base,
            horas_extra: extra,
            jornada_reducida: !isSunday && isReduced,
            tipo_jornada_reducida:
              !isSunday && isReduced ? reducedDayType : null,
            bloques: newHours > 0 ? blocks : null,
            jornada_entrada: newHours > 0 ? entryTime : null,
            jornada_salida: newHours > 0 ? exitTime : null,
            horas_reducidas_manualmente: wasManuallyAdjusted,
            horas_originales: wasManuallyAdjusted
              ? manualAdj.horas_originales
              : null,
            // Si se ajustó manualmente Y tenía reducción de banco, limpiar la reducción de banco
            horas_extra_reducidas:
              wasManuallyAdjusted && oldBankReduction > 0
                ? 0
                : day.horas_extra_reducidas,
            horas_legales_reducidas:
              wasManuallyAdjusted && oldBankReduction > 0
                ? 0
                : day.horas_legales_reducidas,
            banco_compensacion_id:
              wasManuallyAdjusted && oldBankReduction > 0
                ? null
                : day.banco_compensacion_id,
            domingo_estado: sundayStateForDay,
          };
        });

        // Validaciones semanales
        const legalLimit = Math.min(WEEKLY_LEGAL_LIMIT, legalCapacitySum);
        const extraLimit = Math.min(WEEKLY_EXTRA_LIMIT, extraCapacitySum);
        if (payableExtraSum - extraLimit > 1e-6)
          throw new Error(
            `Límite semanal de extras pagables (${extraLimit}h) excedido.`
          );
        if (payableExtraSum > 0 && legalSum + 1e-6 < legalLimit)
          throw new Error(
            "No puedes tener horas extra si no se cumplen las horas legales."
          );

        // Enviar payload al backend
        const payload = {
          dias: updatedDias,
          total_horas_semana: totalSum,
          allow_overtime: allowOvertime,
        };
        await api.patch(`/horarios/${week.id}`, payload);
        toast.success("Horario actualizado con éxito.");

        handleCancelEdit(); // Limpiar estado de edición
        if (onScheduleUpdated) onScheduleUpdated(); // Ejecutar callback para refrescar la lista de horarios
      } catch (err) {
        console.error("Error al guardar cambios:", err);
        if (err.message.includes("Conflicto de bloqueo:")) {
          Swal.fire({
            icon: "error",
            title: "Conflicto al Guardar",
            html: err.message,
          });
        } else {
          toast.error(`Error al actualizar: ${err.message}`);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      isSaving,
      manualReductions,
      reducedDay,
      reducedDayType, // Estado
      sundayStatus,
      blockingDatesMap,
      onScheduleUpdated,
      handleCancelEdit, // Dependencias
    ]
  );

  return {
    // Estado
    editingWeekId,
    isSaving,
    manualReductions,
    reducedDay,
    reducedDayType,
    sundayStatus,

    // Handlers de Estado
    setReducedDay,
    setReducedDayType,
    setSundayStatus,

    // Acciones
    handleEditWeek,
    handleCancelEdit,
    handleManualHourAdjustment,
    handleRemoveManualReduction,
    handleSaveEdit,
  };
}
