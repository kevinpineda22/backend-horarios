// src/pages/ProgramadorHorarios.jsx
import React, { useState, useMemo, useCallback } from "react";
import { format, addDays as addDaysFn, parseISO } from "date-fns";
import "react-day-picker/dist/style.css";
import { es } from "date-fns/locale";
import {
  FaBan,
  FaCalendarAlt,
  FaArchive,
  FaExclamationTriangle,
  FaSpinner,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import { apiPublic, api } from "../../services/apiHorarios"; // Ajusta a tu ruta de servicios
import Swal from "./utils/swalCustom"; // Importar Swal para el borrado

// --- 1. Importar Hooks ---
import { useEmployeeData } from "./hooks/useEmployeeData";
import { useScheduleAndBlockingData } from "./hooks/useScheduleAndBlockingData";
import { useScheduleManagement } from "./hooks/useScheduleManagement";
// (useScheduleEditing se usa dentro de WeekHistoryWrapper)
import { useAuth } from "../../hooks/useAuth";

// --- 2. Importar Componentes ---
import EmployeeSelector from "./components/EmployeeSelector";
import ScheduleCreator from "./components/ScheduleCreator";
import WeekHistoryWrapper from "./components/WeekHistoryWrapper";
import ScheduleCalendarDisplay from "./components/ScheduleCalendarDisplay";

// --- 3. Importar Utils ---
import {
  isSundayLocal,
  weekdayFromYMD,
  formatHours,
  formatTimeLabel,
  formatBlockingLabel,
} from "./utils/programadorHorariosUtils";

// --- 4. Importar CSS ---
import "./ProgramadorHorarios.css";

const ProgramadorHorarios = () => {
  const { user } = useAuth();
  // --- Hook de Empleados ---
  const {
    empleados,
    searchQuery,
    loadingEmpleados,
    selectedEmployee,
    hasMoreEmployees,
    setSearchQuery,
    handleLoadMore,
    handleSelectEmployee,
    handleResetSelection,
  } = useEmployeeData(true);

  // --- Hook de Horarios y Bloqueos ---
  const {
    horariosHistory,
    loading: loadingScheduleData,
    blockingDatesMap,
    disabledDaysForPicker,
    refreshAllData: refreshScheduleAndBlockingData,
  } = useScheduleAndBlockingData(selectedEmployee?.id);

  // --- Estado Local de UI para Creación ---
  const [range, setRange] = useState(null);
  const [workingWeekdays, setWorkingWeekdays] = useState([1, 2, 3, 4, 5, 6]);

  // --- Callback post-creación ---
  const handleScheduleCreated = useCallback(() => {
    refreshScheduleAndBlockingData();
    setRange(null);
  }, [refreshScheduleAndBlockingData]);

  // --- Hook de Gestión de Creación ---
  const { creating, handleCreateHorario } = useScheduleManagement(
    selectedEmployee?.id,
    range,
    workingWeekdays,
    handleScheduleCreated,
    user
  );

  // --- Estado Local para Festivos del Calendario ---
  const [holidayEvents, setHolidayEvents] = useState([]);

  // --- Funciones de Callback para Componentes Hijos ---

  const handleDatesSet = useCallback(async (arg) => {
    try {
      const startYMD = arg.start.toISOString().slice(0, 10);
      const endVisible = new Date(arg.end.getTime() - 24 * 60 * 60 * 1000);
      const endYMD = endVisible.toISOString().slice(0, 10);

      const { data } = await apiPublic.get("/festivos", {
        params: { start: startYMD, end: endYMD },
      });

      const bgEvents = (data || []).map((f) => ({
        id: `hol-${f.fecha}`,
        title: f.nombre,
        start: f.fecha,
        allDay: true,
        display: "background", // <--- Este es el evento que causa el problema
        backgroundColor: "#fef9c3",
      }));
      setHolidayEvents(bgEvents);
    } catch (err) {
      console.error("Error cargando festivos", err);
      toast.error("No se pudieron cargar los días festivos.");
    }
  }, []);

  const handleDeleteHorarioDirect = useCallback(
    async (horarioId) => {
      const result = await Swal.fire({
        icon: "warning",
        title: "Eliminar horario",
        text: "¿Eliminar esta semana de forma permanente?",
        showCancelButton: true,
        confirmButtonText: "Eliminar",
        cancelButtonText: "Cancelar",
        reverseButtons: true,
      });

      if (result.isConfirmed) {
        try {
          await api.delete(`/horarios/${horarioId}`);
          toast.success("Horario eliminado con éxito.");
          refreshScheduleAndBlockingData();
        } catch (err) {
          console.error("Error al eliminar horario:", err);
          toast.error(
            "Error al eliminar el horario: " +
              (err.response?.data?.message || err.message)
          );
        }
      }
    },
    [refreshScheduleAndBlockingData]
  );

  // --- Lógica de Renderizado de Eventos (Memoizada) ---

  const eventosCalendar = useMemo(() => {
    return (horariosHistory || []).flatMap((h) => {
      return (h.dias || [])
        .map((d) => {
          const base = formatHours(d.horas_base);
          const extra = formatHours(d.horas_extra);
          const total = formatHours(d.horas);
          const domingo = isSundayLocal(d.fecha);
          const sundayStatus = d.domingo_estado;
          const blockingForDay = blockingDatesMap.get(d.fecha) || [];
          const formattedBlocks = blockingForDay.map((block) => ({
            id: block.id,
            tipo: block.tipo,
            observacion: block.observacion,
            range: block.range,
          }));

          if (domingo && sundayStatus) {
            return {
              id: `${h.id}-${d.fecha}-dom`,
              start: d.fecha,
              allDay: true,
              title:
                sundayStatus === "compensado" ? "Compensado" : "Sin Compensar",
              className: `ph-sunday-event ph-sunday-event-${sundayStatus}`,
              extendedProps: {
                isDomingo: true,
                blockingSummary: formattedBlocks,
              },
            };
          } else if (!domingo && Number(total) > 0) {
            let className = "ph-regular-day";
            if (d.festivo_trabajado) className += " festivo-trabajado";
            if (
              Number(d.horas_extra_reducidas || 0) +
                Number(d.horas_legales_reducidas || 0) >
              0
            )
              className += " bank-compensation";
            if (d.horas_reducidas_manualmente && d.horas_originales != null) {
              const diff = Number(total) - Number(d.horas_originales);
              if (Math.abs(diff) > 1e-6)
                className +=
                  diff < 0 ? " manual-reduction" : " manual-increase";
            } else if (d.jornada_reducida) className += " reduced";

            return {
              id: `${h.id}-${d.fecha}-reg`,
              title: `${base}h Leg + ${extra}h Ext = ${total}h`,
              start: d.fecha,
              allDay: true,
              className,
              extendedProps: {
                entrada: d.jornada_entrada,
                salida: d.jornada_salida,
                bloques: d.bloques || [],
                jornada_reducida: d.jornada_reducida,
                tipo_jornada_reducida: d.tipo_jornada_reducida,
                isSaturday: weekdayFromYMD(d.fecha) === 6,
                horas_reducidas_manualmente: d.horas_reducidas_manualmente,
                horas_originales: d.horas_originales,
                diferencia_manual:
                  d.horas_reducidas_manualmente && d.horas_originales != null
                    ? Number(total) - Number(d.horas_originales)
                    : 0,
                isHolidayWorked: d.festivo_trabajado,
                holidayName: d.festivo_nombre,
                bankedReductionAmount:
                  Number(d.horas_extra_reducidas || 0) +
                  Number(d.horas_legales_reducidas || 0),
                blockingSummary: formattedBlocks,
              },
            };
          } else if (
            !domingo &&
            Number(total) === 0 &&
            blockingForDay.length > 0
          ) {
            return {
              id: `block-zero-${d.fecha}`,
              title: blockingForDay[0].tipo || "Bloqueado",
              start: d.fecha,
              allDay: true,
              display: "background",
              className: "ph-blocking-event ph-zero-hours",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              extendedProps: {
                isBlockingPlaceholder: true,
                blockingSummary: formattedBlocks,
              },
            };
          }
          return null;
        })
        .filter(Boolean);
    });
  }, [horariosHistory, blockingDatesMap]);

  const blockingCalendarEvents = useMemo(() => {
    const scheduledDays = new Set(eventosCalendar.map((ev) => ev.start));
    const blockingEvents = [];
    blockingDatesMap.forEach((blocks, ymd) => {
      if (!scheduledDays.has(ymd) && blocks.length > 0) {
        // Check if it's ONLY partial blocks (Estudio)
        const isOnlyPartial = blocks.every((b) => b.tipo === "Estudio");

        blockingEvents.push({
          id: `block-${ymd}`,
          title: blocks[0].tipo || "Bloqueado",
          start: ymd,
          allDay: true,
          display: "block",
          className: isOnlyPartial
            ? "ph-blocking-event ph-partial-block"
            : "ph-blocking-event",
          backgroundColor: isOnlyPartial
            ? "rgba(255, 193, 7, 0.2)" // Yellowish for partial
            : "rgba(239, 68, 68, 0.1)", // Red for full block
          extendedProps: {
            isBlocking: true,
            blockingSummaryFull: blocks,
            tipo: blocks[0].tipo,
            observacion: blocks[0].observacion,
            blockRangeLabel: blocks[0].range,
          },
        });
      }
    });
    return blockingEvents;
  }, [blockingDatesMap, eventosCalendar]);

  const combinedCalendarEvents = useMemo(() => {
    return [...eventosCalendar, ...holidayEvents, ...blockingCalendarEvents];
  }, [eventosCalendar, holidayEvents, blockingCalendarEvents]);

  /**
   * Función de renderizado que se pasa a FullCalendar.
   * Define el JSX para CADA evento en el calendario.
   */
  const eventContentRenderer = useCallback(
    (arg) => {
      // --- 1. Extraer props ---
      const {
        entrada,
        salida,
        isDomingo,
        jornada_reducida,
        isSaturday,
        tipo_jornada_reducida,
        horas_reducidas_manualmente,
        horas_originales,
        diferencia_manual,
        isHolidayWorked,
        holidayName,
        bankedReductionAmount,
        bloques,
        isBlocking,
        isBlockingPlaceholder,
        blockingSummary,
        blockingSummaryFull,
      } = arg.event.extendedProps || {};

      // ¡NUEVO! Extraer el 'display' del evento
      const display = arg.event.display;

      // --- 2. Renderizado de Bloqueos ---
      if (isBlocking || isBlockingPlaceholder) {
        const summary = isBlockingPlaceholder
          ? blockingSummary
          : blockingSummaryFull || [
              { tipo: "Bloqueo", observacion: "", range: "" },
            ];
        const tooltip = summary
          .map(
            (b) =>
              `${b.tipo || "Bloqueo"}${b.range ? ` (${b.range})` : ""}${
                b.observacion ? `: ${b.observacion}` : ""
              }`
          )
          .join("\n");

        // Detectar si es SOLO estudio (para cambiar visualización)
        const isEstudio = summary.every((b) => b.tipo === "Estudio");

        if (isBlockingPlaceholder) {
          return (
            <div className="ph-blocking-placeholder" title={tooltip}>
              {isEstudio ? <FaExclamationTriangle /> : <FaBan />}{" "}
              {summary[0]?.tipo || "Bloqueado"}
            </div>
          );
        }
        return (
          <div
            className={`ph-blocking-content ${
              isEstudio ? "ph-partial-content" : ""
            }`}
            title={tooltip}
          >
            <div
              className="ph-blocking-title"
              style={isEstudio ? { color: "#b45309" } : {}}
            >
              {isEstudio ? (
                <FaExclamationTriangle className="ph-blocking-icon" />
              ) : (
                <FaBan className="ph-blocking-icon" />
              )}{" "}
              {isEstudio ? "Novedad" : "Bloqueado"}
            </div>
            <div
              className="ph-blocking-type"
              style={isEstudio ? { color: "#92400e" } : {}}
            >
              {summary[0]?.tipo || "Observación"}
            </div>
            {summary[0]?.observacion && (
              <div
                className="ph-blocking-note"
                style={isEstudio ? { color: "#92400e" } : {}}
              >
                {summary[0]?.observacion}
              </div>
            )}
          </div>
        );
      }

      // --- 3. Renderizado de Domingos ---
      if (isDomingo) {
        const hasBlocking =
          Array.isArray(blockingSummary) && blockingSummary.length > 0;
        const sundayTooltip = hasBlocking
          ? `${arg.event.title}\nBloqueado por: ${blockingSummary
              .map((b) => b.tipo || "Obs.")
              .join(", ")}`
          : arg.event.title;
        return (
          <div
            className={`ph-sunday-content ${
              hasBlocking ? "ph-blocked-card" : ""
            }`}
            title={sundayTooltip}
          >
            <div className="ph-sunday-title">{arg.event.title}</div>
            {hasBlocking && (
              <div className="ph-blocking-list ph-blocking-list-small">
                <FaBan /> Bloqueado
              </div>
            )}
          </div>
        );
      }

      // --- 4. ¡NUEVO! Renderizado para Festivos (eventos de fondo) ---
      // Si es un evento de fondo (como un festivo), solo mostramos el título.
      // Esto previene que caiga en el bloque 'else' y obtenga una jornada default.
      if (display === "background") {
        // Usamos una clase simple para que el CSS pueda darle estilo
        // Nota: FullCalendar le dará opacidad y lo pondrá detrás.
        return (
          <div className="ph-background-event-title" title={arg.event.title}>
            {arg.event.title}
          </div>
        );
      }

      // --- 5. Renderizado para DÍAS REGULARES (con horas) ---
      // (Este bloque 'else' ahora solo se ejecuta para días de trabajo reales)
      let entradaReal = entrada && entrada !== "—" ? entrada : null;
      let salidaReal = salida && salida !== "—" ? salida : null;

      if (
        (!entradaReal || !salidaReal) &&
        Array.isArray(bloques) &&
        bloques.length
      ) {
        const firstBlock = bloques[0];
        const lastBlock = bloques[bloques.length - 1];
        if (!entradaReal && firstBlock?.start)
          entradaReal = firstBlock.start.slice(11, 16);
        if (!salidaReal && lastBlock?.end)
          salidaReal = lastBlock.end.slice(11, 16);
      }
      if (!entradaReal || !salidaReal) {
        if (!isHolidayWorked) {
          if (isSaturday) {
            entradaReal = entradaReal || "07:00";
            salidaReal =
              salidaReal ||
              (jornada_reducida
                ? tipo_jornada_reducida === "entrar-tarde"
                  ? "15:00"
                  : "14:00"
                : "15:00");
          } else if (jornada_reducida) {
            entradaReal =
              entradaReal ||
              (tipo_jornada_reducida === "entrar-tarde" ? "08:00" : "07:00");
            salidaReal =
              salidaReal ||
              (tipo_jornada_reducida === "entrar-tarde" ? "18:00" : "17:00");
          } else {
            entradaReal = entradaReal || "07:00";
            salidaReal = salidaReal || "18:00";
          }
        } else {
          entradaReal = entradaReal || "07:00";
          salidaReal = salidaReal || "13:00";
        }
      }

      const jornadaLabel =
        entradaReal && salidaReal && entradaReal !== "—" && salidaReal !== "—"
          ? `${formatTimeLabel(entradaReal)} – ${formatTimeLabel(salidaReal)}`
          : "Jornada no definida";

      // Construir Tooltip
      let tooltipText = `${arg.event.title}\nJornada: ${jornadaLabel}`;
      if (isHolidayWorked)
        tooltipText += `\n🎉 Festivo laborado${
          holidayName ? `: ${holidayName}` : ""
        }`;
      if (bankedReductionAmount > 0)
        tooltipText += `\n🏦 Banco aplicado: ${formatHours(
          bankedReductionAmount
        )}h`;
      if (
        horas_reducidas_manualmente &&
        horas_originales != null &&
        diferencia_manual !== 0
      ) {
        const tipoAjuste = diferencia_manual < 0 ? "Reducción" : "Aumento";
        tooltipText += `\n⚠️ ${tipoAjuste} manual: ${formatHours(
          Math.abs(diferencia_manual)
        )}h (${formatHours(horas_originales)}h → ${formatHours(
          Number(horas_originales) + diferencia_manual
        )}h)`;
      }
      const hasBlocking =
        Array.isArray(blockingSummary) && blockingSummary.length > 0;
      if (hasBlocking) {
        const blockLines = blockingSummary
          .map((b) => `- ${b.tipo || "Obs."}${b.range ? ` (${b.range})` : ""}`)
          .join("\n");
        tooltipText += `\n🚫 Bloqueos activos:\n${blockLines}`;
      }

      // Iconos
      const adjustmentIcons = [];
      if (
        horas_reducidas_manualmente &&
        horas_originales != null &&
        diferencia_manual !== 0
      ) {
        adjustmentIcons.push(
          diferencia_manual < 0 ? (
            <FaExclamationTriangle
              key="m-red"
              className="manual-reduction-icon"
              title={`Reducción: ${formatHours(Math.abs(diferencia_manual))}h`}
            />
          ) : (
            <FaExclamationTriangle
              key="m-inc"
              className="manual-increase-icon"
              title={`Aumento: ${formatHours(diferencia_manual)}h`}
            />
          )
        );
      }
      if (isHolidayWorked)
        adjustmentIcons.push(
          <FaCalendarAlt
            key="h-work"
            className="holiday-worked-icon"
            title={`Festivo: ${holidayName || ""}`}
          />
        );
      if (bankedReductionAmount > 0)
        adjustmentIcons.push(
          <FaArchive
            key="b-comp"
            className="bank-comp-icon"
            title={`Banco aplicado: ${formatHours(bankedReductionAmount)}h`}
          />
        );

      return (
        <div
          className={`ph-regular-content ${
            isHolidayWorked ? " ph-holiday-card" : ""
          } ${hasBlocking ? " ph-blocked-card" : ""}`}
          title={tooltipText}
        >
          <div className="ph-regular-title">
            {adjustmentIcons}
            {arg.event.title}
          </div>
          <div className="ph-regular-hours">{jornadaLabel}</div>

          {isHolidayWorked && (
            <div className="ph-holiday-pill">Festivo trabajado</div>
          )}
          {bankedReductionAmount > 0 && (
            <div className="ph-bank-pill">
              Banco aplicado: {formatHours(bankedReductionAmount)}h
            </div>
          )}

          {hasBlocking && (
            <div className="ph-blocking-list">
              {/* Detectar si es SOLO estudio para cambiar el título e icono */}
              {blockingSummary.every((b) => b.tipo === "Estudio") ? (
                <span
                  className="ph-blocking-list-title"
                  style={{ color: "#b45309" }}
                >
                  <FaExclamationTriangle /> Novedad:
                </span>
              ) : (
                <span className="ph-blocking-list-title">
                  <FaBan /> Bloqueado por:
                </span>
              )}

              {blockingSummary.slice(0, 2).map((block) => (
                <div
                  key={block.id}
                  className="ph-blocking-chip"
                  style={
                    block.tipo === "Estudio"
                      ? {
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          border: "1px solid #fcd34d",
                        }
                      : {}
                  }
                >
                  <span className="chip-type">{block.tipo || "Bloqueo"}</span>
                </div>
              ))}
              {blockingSummary.length > 2 && (
                <div className="ph-blocking-chip-more">
                  ...y {blockingSummary.length - 2} más
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [blockingDatesMap]
  );

  // --- Renderizado del Layout Principal ---
  return (
    <div className="programmador-horarios-layout-container">
      {/* --- Sección Superior: Selección y Creación --- */}
      <div className="programmador-horarios-seccion-superior">
        <EmployeeSelector
          empleados={empleados}
          searchQuery={searchQuery}
          loadingEmpleados={loadingEmpleados}
          selectedEmployee={selectedEmployee}
          hasMoreEmployees={hasMoreEmployees}
          setSearchQuery={setSearchQuery}
          handleLoadMore={handleLoadMore}
          handleSelectEmployee={handleSelectEmployee}
          handleResetSelection={handleResetSelection}
        />

        {selectedEmployee && (
          <ScheduleCreator
            range={range}
            setRange={setRange}
            disabledDays={disabledDaysForPicker}
            workingWeekdays={workingWeekdays}
            setWorkingWeekdays={setWorkingWeekdays}
            handleCreateHorario={handleCreateHorario}
            creating={creating}
          />
        )}
      </div>

      {/* --- Sección Inferior: Historial y Calendario --- */}

      <WeekHistoryWrapper
        loading={loadingScheduleData || loadingEmpleados}
        selectedEmployee={selectedEmployee}
        horariosHistory={horariosHistory}
        blockingDatesMap={blockingDatesMap}
        onScheduleUpdated={refreshScheduleAndBlockingData}
        onDeleteWeek={handleDeleteHorarioDirect}
      />

      <ScheduleCalendarDisplay
        loading={loadingScheduleData || loadingEmpleados}
        hasSelectedEmployee={!!selectedEmployee}
        events={combinedCalendarEvents}
        onDatesSet={handleDatesSet}
        eventContentRenderer={eventContentRenderer}
      />
    </div>
  );
};

export default ProgramadorHorarios;
