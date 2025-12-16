// src/components/programador/WeekHistory.jsx
import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaEdit,
  FaTrash,
  FaSave,
  FaBan,
  FaUndo,
  FaClock,
  FaExclamationTriangle,
  FaCalendarAlt,
  FaGift,
  FaCheckCircle,
  FaTimesCircle,
  FaInfoCircle,
  FaSpinner,
} from "react-icons/fa";
import {
  computeWeekSums,
  describePartialReasons,
  formatBlockingLabel,
  formatHours,
  getSundayStatusForWeek,
  isoWeekdayFromYMD,
} from "../utils/programadorHorariosUtils"; // Ajusta la ruta a tus utils
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// --- Helpers de formato específicos para este componente ---

// Formatea 'YYYY-MM-DD' a 'dd/MM/yyyy'
const formatShortDate = (ymd) => {
  try {
    // Asegurar que parseISO trate la fecha como local (o UTC, pero sé consistente)
    // Añadir T00:00:00 previene que se mueva un día por zona horaria
    return format(parseISO(ymd + "T00:00:00"), "dd/MM/yyyy");
  } catch {
    return ymd;
  }
};

// Formatea 'YYYY-MM-DD' a 'Lunes', 'Martes', etc.
const formatDayName = (ymd) => {
  try {
    const date = parseISO(ymd + "T00:00:00");
    let dayName = format(date, "EEEE", { locale: es });
    return dayName.charAt(0).toUpperCase() + dayName.slice(1); // Capitalizar
  } catch {
    return "N/A";
  }
};

// Formatea 'YYYY-MM-DD' a '01 de Enero de 2025'
const formatLongDate = (fecha) => {
  try {
    const [y, m, d] = fecha.split("-").map(Number);
    const date = new Date(y, m - 1, d); // Usar Date constructor local
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
};

const getWeekCreatorLabel = (week) => {
  if (!week) return "Sin registrar";
  const candidates = [
    week.creado_por_nombre,
    week.creado_por,
    week.creado_por_email,
    week.created_by_name,
    week.created_by,
    week.created_by_email,
    week.usuario_creador,
  ];
  const found = candidates.find((value) =>
    value && String(value).trim().length > 0 ? value : null
  );
  if (!found) {
    return "Sin registrar";
  }
  return String(found).trim();
};
// ----------------------------------------------------

/**
 * Componente Visual (tonto) para renderizar UNA tarjeta de semana.
 * Recibe toda la lógica y el estado como props desde WeekHistoryWrapper.
 */
const WeekHistory = ({
  week,
  isEditing,
  isSaving,
  manualReductions,
  reducedDay,
  reducedDayType,
  sundayStatus,
  blockingDatesMap,
  onEditWeek,
  onDeleteWeek,
  onManualAdjustment,
  onRemoveManualReduction,
  onReducedDayChange,
  onReducedDayTypeChange,
  onSundayStatusChange,
  onSaveEdit,
  onCancelEdit,
}) => {
  // --- Cálculos para la vista ---
  // Recalcula los totales de la semana CADA VEZ, basándose en los ajustes manuales si se está editando
  const weeklyData = useMemo(() => {
    if (!isEditing) {
      // Si no se edita, usa los datos precalculados (computeWeekSums ya usa los datos de `week.dias`)
      return computeWeekSums(week);
    }

    // Si SÍ se está editando, recalcula los totales sobre la marcha
    const tempWeek = JSON.parse(JSON.stringify(week)); // Copia profunda para no mutar
    tempWeek.dias.forEach((day) => {
      const manual = manualReductions[day.descripcion];
      const isReduced = day.descripcion === reducedDay;
      const iso = isoWeekdayFromYMD(day.fecha);

      if (manual) {
        day.horas = manual.horas_reducidas;
        day.horas_reducidas_manualmente = true;
        day.horas_originales = manual.horas_originales;
      } else if (isReduced) {
        day.horas = iso === 6 ? 6 : 9; // Aplicar reducción programada
        day.horas_reducidas_manualmente = false; // Quitar marca manual
        day.horas_originales = null;
      } else {
        // Volver al default si no hay ajuste manual ni reducción programada
        day.horas = iso === 7 ? 0 : iso === 6 ? 7 : 10; // Lógica de horas default
        day.horas_reducidas_manualmente = false;
        day.horas_originales = null;
      }
      // El backend recalculará base/extra al guardar, solo necesitamos el total aquí
    });

    // Usar los días modificados temporalmente para calcular los nuevos totales
    return computeWeekSums(tempWeek);
  }, [week, isEditing, manualReductions, reducedDay]);

  const { base, extra, total, bank, reduction } = weeklyData;
  const partialInfo = describePartialReasons(week); // Basado en datos originales
  const partialReasons = partialInfo.labels || [];
  const sundayStatusLabel = getSundayStatusForWeek(week);
  const weekPeriodLabel = `${formatLongDate(
    week.fecha_inicio
  )} al ${formatLongDate(week.fecha_fin)}`;
  const creatorLabel = useMemo(() => getWeekCreatorLabel(week), [week]);
  const sundayDay = useMemo(
    () => week.dias?.find((day) => isoWeekdayFromYMD(day.fecha) === 7) || null,
    [week]
  );

  const getBlocksForDate = (ymd) => {
    if (!blockingDatesMap || typeof blockingDatesMap.get !== "function")
      return [];
    return blockingDatesMap.get(ymd) || [];
  };

  return (
    <div className="programmador-horarios-week-card">
      {/* --- VISTA RESUMIDA (NO EDICIÓN) --- */}
      {/* Usamos las clases CSS que definiste */}
      <div className="programmador-horarios-week-card-content">
        <div className="programmador-horarios-week-card-left">
          <div>
            <div className="programmador-horarios-week-range">
              {weekPeriodLabel}
            </div>
            <div className="programmador-horarios-week-period">
              Semana del {formatShortDate(week.fecha_inicio)} al{" "}
              {formatShortDate(week.fecha_fin)}
            </div>
            <div
              className="programmador-horarios-week-creator"
              title="Horario registrado por"
            >
              Creado por: <span className="creator-name">{creatorLabel}</span>
            </div>
          </div>
          <div className="programmador-horarios-week-meta">
            <span>
              Legales: <b>{formatHours(base)}h</b>
            </span>
            <span>•</span>
            <span>
              Extras: <b>{formatHours(extra)}h</b>
            </span>
            <span>•</span>
            <span>
              Total: <b>{formatHours(total)}h</b>
            </span>
            {bank > 0 && <span>•</span>}
            {bank > 0 && (
              <span title="Horas generadas para el banco">
                Banco: <b>+{formatHours(bank)}h</b>
              </span>
            )}
            {reduction > 0 && <span>•</span>}
            {reduction > 0 && (
              <span title="Horas consumidas del banco">
                Banco: <b>-{formatHours(reduction)}h</b>
              </span>
            )}
            {partialReasons.length > 0 && (
              <span
                className="badge badge-partial"
                title={partialReasons.join(" | ")}
              >
                <FaExclamationTriangle /> Semana parcial
              </span>
            )}
          </div>
          <div className="programmador-horarios-week-status">
            {sundayStatusLabel && (
              <div
                className={`programmador-horarios-sunday-status ${sundayStatusLabel}`}
              >
                <span>Domingo: </span>
                <strong>
                  {sundayStatusLabel === "compensado"
                    ? "Compensado"
                    : sundayStatusLabel === "sin-compensar"
                    ? "Sin Compensar"
                    : "Mixto"}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* --- ACCIONES (Botones de Editar/Borrar) --- */}
        <div className="programmador-horarios-week-actions">
          <button
            className="programmador-horarios-btn-edit"
            onClick={onEditWeek}
            title="Editar horario"
            disabled={isSaving} // Deshabilitar si se está guardando algo
          >
            <FaEdit />
          </button>
          <button
            className="programmador-horarios-btn-delete"
            onClick={onDeleteWeek}
            title="Eliminar horario"
            disabled={isSaving}
          >
            <FaTrash />
          </button>
        </div>
      </div>

      {/* --- FORMULARIO DE EDICIÓN (VISIBLE CONDICIONALMENTE) --- */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            className="programmador-horarios-edit-form"
            initial={{ opacity: 0, height: 0, marginTop: 0, padding: 0 }}
            animate={{
              opacity: 1,
              height: "auto",
              marginTop: "1rem",
              padding: "0.875rem",
            }}
            exit={{ opacity: 0, height: 0, marginTop: 0, padding: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h4
              className="edit-panel-title"
              style={{ marginTop: 0, marginBottom: "1.5rem", fontSize: "1rem" }}
            >
              <FaEdit /> Editando Semana
            </h4>

            {/* --- Sección de Ajuste Manual de Horas --- */}
            <div className="manual-reduction-section">
              <h5>
                <FaClock /> Ajustar Horas por Día
              </h5>
              <p className="help-text">
                Modifica las horas de días específicos. Los días bloqueados no
                se pueden editar.
              </p>
              <div className="manual-reduction-days">
                {week.dias
                  .filter((day) => isoWeekdayFromYMD(day.fecha) !== 7) // Excluir Domingos
                  .map((day) => {
                    const adjustment = manualReductions[day.descripcion];
                    const blockingForDay = getBlocksForDate(day.fecha);

                    // Identificar si es bloqueo total o parcial
                    const isFullBlock = blockingForDay.some(
                      (b) => b.tipo !== "Estudio"
                    );
                    const isPartialBlock = blockingForDay.some(
                      (b) => b.tipo === "Estudio"
                    );

                    // Solo bloqueamos la edición si es un bloqueo total (rojo)
                    const isBlocked = isFullBlock;

                    const displayHours = adjustment
                      ? adjustment.horas_reducidas
                      : day.horas;
                    const originalHours = adjustment
                      ? adjustment.horas_originales
                      : day.horas;
                    const isAdjusted = !!adjustment;

                    const isReduction =
                      isAdjusted && displayHours < originalHours;
                    const isIncrease =
                      isAdjusted && displayHours > originalHours;

                    return (
                      <div
                        key={day.fecha}
                        className={`manual-reduction-day ${
                          isBlocked ? "blocked" : ""
                        }`}
                      >
                        <div className="day-info">
                          <span className="day-name">
                            {day.descripcion}
                            {isBlocked && (
                              <span
                                className="day-blocked-pill"
                                title={blockingForDay
                                  .map((b) => b.tipo)
                                  .join(", ")}
                              >
                                <FaBan /> Bloq.
                              </span>
                            )}
                            {!isBlocked && isPartialBlock && (
                              <span
                                className="day-blocked-pill"
                                style={{
                                  backgroundColor: "#fef3c7",
                                  color: "#b45309",
                                  border: "1px solid #f59e0b",
                                }}
                                title={blockingForDay
                                  .map((b) => b.tipo)
                                  .join(", ")}
                              >
                                <FaExclamationTriangle /> Estudio
                              </span>
                            )}
                          </span>
                          <span className="day-hours">
                            {isAdjusted ? (
                              <>
                                <span className="original-hours">
                                  {formatHours(originalHours)}h
                                </span>
                                <span
                                  className="arrow"
                                  style={{ margin: "0 0.25rem" }}
                                >
                                  →
                                </span>
                                <span
                                  className={
                                    isReduction
                                      ? "reduced-hours"
                                      : isIncrease
                                      ? "increased-hours"
                                      : "current-hours"
                                  }
                                >
                                  {formatHours(displayHours)}h
                                </span>
                              </>
                            ) : (
                              <span className="current-hours">
                                {formatHours(displayHours)}h
                              </span>
                            )}
                          </span>
                        </div>

                        <div
                          className="day-actions"
                          style={{ display: "flex", gap: "0.5rem" }}
                        >
                          {isAdjusted && (
                            <button
                              type="button"
                              className="btn-remove-adjustment"
                              onClick={() =>
                                onRemoveManualReduction(day.descripcion)
                              }
                              title="Quitar ajuste manual"
                              disabled={isSaving}
                            >
                              <FaUndo />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-adjust-hours"
                            onClick={() =>
                              onManualAdjustment(week, day.descripcion)
                            }
                            title={
                              isBlocked
                                ? `Bloqueado: ${blockingForDay[0].tipo}`
                                : "Ajustar horas manualmente"
                            }
                            disabled={isBlocked || isSaving}
                          >
                            <FaClock />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* --- Sección de Día Reducido --- */}
            {sundayDay && (
              <div className="edit-day-row">
                <label style={{ flexGrow: 1, fontWeight: 500 }}>
                  Estado del domingo
                </label>
                <select
                  value={sundayStatus || ""}
                  onChange={(e) => onSundayStatusChange(e.target.value)}
                  className="programmador-horarios-form-input"
                  style={{ maxWidth: "250px" }}
                  disabled={isSaving}
                >
                  <option value="">Sin estado</option>
                  <option value="compensado">Compensado</option>
                  <option value="sin-compensar">Sin compensar</option>
                </select>
              </div>
            )}

            <div
              className="form-separator"
              style={{ borderTop: "1px solid #e5e7eb", margin: "1.5rem 0" }}
            />

            <div className="edit-day-row">
              <label style={{ flexGrow: 1, fontWeight: 500 }}>
                Día con jornada reducida (9h L-V / 6h Sáb)
              </label>
              <select
                value={reducedDay || ""}
                onChange={(e) => onReducedDayChange(e.target.value)}
                className="programmador-horarios-form-input" // Reutilizar input style
                style={{ maxWidth: "250px" }}
                disabled={isSaving}
              >
                <option value="">Seleccionar día...</option>
                {week.dias
                  .filter((day) => isoWeekdayFromYMD(day.fecha) !== 7) // Excluir Domingo
                  .map((day) => {
                    const optionBlocked =
                      getBlocksForDate(day.fecha).length > 0;
                    // Deshabilitar si está bloqueado
                    const isDisabled = optionBlocked;
                    return (
                      <option
                        key={day.fecha}
                        value={day.descripcion}
                        disabled={isDisabled}
                      >
                        {day.descripcion}
                        {isDisabled ? " (Bloqueado)" : ""}
                      </option>
                    );
                  })}
              </select>
            </div>

            {reducedDay && ( // Solo mostrar si se ha seleccionado un día reducido
              <div className="edit-day-row">
                <label style={{ flexGrow: 1, fontWeight: 500 }}>
                  Tipo de jornada reducida
                </label>
                <select
                  value={reducedDayType}
                  onChange={(e) => onReducedDayTypeChange(e.target.value)}
                  className="programmador-horarios-form-input"
                  style={{ maxWidth: "250px" }}
                  disabled={isSaving}
                >
                  <option value="salir-temprano">Salir 1 hora antes</option>
                  <option value="entrar-tarde">Entrar 1 hora tarde</option>
                </select>
              </div>
            )}

            {/* --- Acciones de Edición (Botones Guardar/Cancelar) --- */}
            <div className="edit-form-actions" style={{ marginTop: "1.5rem" }}>
              <button
                type="button"
                className="btn-action btn-save" // Clase de tu CSS
                onClick={onSaveEdit}
                disabled={isSaving}
              >
                {isSaving ? <FaSpinner className="spinning" /> : <FaSave />}
                {isSaving ? "Guardando..." : "Guardar Cambios"}
              </button>
              <button
                type="button"
                className="btn-action btn-cancel" // Clase de tu CSS
                onClick={onCancelEdit}
                disabled={isSaving}
              >
                <FaBan /> Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WeekHistory;
