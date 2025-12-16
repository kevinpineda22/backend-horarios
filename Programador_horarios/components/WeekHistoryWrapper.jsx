// src/components/programador/WeekHistoryWrapper.jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaCalendarCheck, FaSpinner, FaTimes } from "react-icons/fa";
import { useScheduleEditing } from "../hooks/useScheduleEditing"; // Ajusta la ruta a tu hook
import WeekHistory from "./WeekHistory"; // Importa el componente visual (que haremos después)

// Este componente es el "cerebro" del historial.
const WeekHistoryWrapper = ({
  loading, // Estado de carga (true si se carga historial O bloqueos)
  selectedEmployee, // Para saber si mostrar algo
  horariosHistory, // La lista de semanas del historial
  blockingDatesMap, // El mapa de fechas bloqueadas (para el hook de edición)
  onScheduleUpdated, // Callback para refrescar datos (pasa al hook)
  onDeleteWeek, // Función para eliminar una semana (pasa al hook)
}) => {
  // 1. Usamos el hook de edición. Toda la lógica de estado (editingWeekId, manualReductions, etc.)
  // y las funciones (handleEditWeek, handleSaveEdit, etc.) viven aquí.
  const {
    editingWeekId,
    isSaving,
    manualReductions,
    reducedDay,
    reducedDayType,
    sundayStatus,
    setReducedDay,
    setReducedDayType,
    setSundayStatus,
    handleEditWeek,
    handleCancelEdit,
    handleManualHourAdjustment,
    handleRemoveManualReduction,
    handleSaveEdit,
  } = useScheduleEditing(blockingDatesMap, onScheduleUpdated); // Pasamos el mapa y el callback

  return (
    <div className="programmador-horarios-seccion-inferior">
      {/* --- Título de la Sección --- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2
          className="programmador-horarios-search-title"
          style={{ marginBottom: 0 }}
        >
          <FaCalendarCheck /> Historial de Horarios
          {selectedEmployee && (
            <div className="total-weeks-info" style={{ marginLeft: 8 }}>
              ({horariosHistory?.length ?? 0} semana
              {(horariosHistory?.length ?? 0) !== 1 ? "s" : ""})
            </div>
          )}
        </h2>
        {/* Indicador de guardado (controlado por el hook) */}
        {isSaving && (
          <FaSpinner
            className="programmador-horarios-spinner"
            title="Guardando cambios..."
          />
        )}
      </div>

      {/* --- Renderizado Condicional del Historial --- */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="history-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="programmador-horarios-message"
          >
            <FaSpinner className="programmador-horarios-spinner" /> Cargando
            historial...
          </motion.div>
        ) : !selectedEmployee ? (
          <motion.div
            key="history-no-employee"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="programmador-horarios-message"
          >
            <FaTimes /> Selecciona un empleado para ver su historial.
          </motion.div>
        ) : (horariosHistory?.length ?? 0) === 0 ? (
          <motion.div
            key="history-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="programmador-horarios-message"
          >
            <FaTimes /> No hay historial de horarios para este empleado.
          </motion.div>
        ) : (
          // --- Renderizar la lista de semanas ---
          <motion.div
            key="history-list-ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="programmador-horarios-weeklist" // Clase contenedora
          >
            {/* Mapeamos el historial y pasamos todas las props
                          al componente visual 'WeekHistory'.
                        */}
            {horariosHistory.map((week) => (
              <WeekHistory
                key={week.id}
                week={week}
                // Props de estado del hook
                isEditing={editingWeekId === week.id}
                isSaving={isSaving}
                manualReductions={manualReductions}
                reducedDay={reducedDay}
                reducedDayType={reducedDayType}
                sundayStatus={sundayStatus}
                // Datos necesarios
                blockingDatesMap={blockingDatesMap}
                // Handlers/Acciones del hook (pasados como props)
                onEditWeek={() => handleEditWeek(week)}
                onDeleteWeek={() => onDeleteWeek(week.id)} // onDeleteWeek viene del padre
                onManualAdjustment={handleManualHourAdjustment}
                onRemoveManualReduction={handleRemoveManualReduction}
                onReducedDayChange={setReducedDay}
                onReducedDayTypeChange={setReducedDayType}
                onSundayStatusChange={setSundayStatus}
                onSaveEdit={() => handleSaveEdit(week)}
                onCancelEdit={handleCancelEdit}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WeekHistoryWrapper;
