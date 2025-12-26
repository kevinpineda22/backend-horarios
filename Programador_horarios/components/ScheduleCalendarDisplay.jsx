// src/components/programador/ScheduleCalendarDisplay.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { FaSpinner, FaTimes, FaCalendarAlt } from 'react-icons/fa'; // Añadido FaCalendarAlt

const ScheduleCalendarDisplay = ({
    loading, // Estado de carga combinado (true si se carga historial O bloqueos)
    hasSelectedEmployee, // boolean (true si hay un empleado seleccionado)
    events, // El array combinado de eventos (horarios, festivos, bloqueos)
    onDatesSet, // La función callback para cargar festivos
    eventContentRenderer, // La función que renderiza el contenido de CADA evento
    
    // Handlers opcionales para popovers (si decides implementarlos)
    // onEventClick,
    // onEventMouseEnter,
    // onEventMouseLeave,
}) => {
    return (
        <div className="programmador-horarios-search-card" style={{ marginTop: '1.25rem' }}>
            {/* Título para la sección del calendario */}
            <h2 className="programmador-horarios-search-title">
                <FaCalendarAlt /> Calendario Unificado
            </h2>

            <AnimatePresence mode="wait">
                {loading ? (
                    // --- Estado de Carga ---
                    <motion.div
                        key="calendar-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="programmador-horarios-message" // Reutilizar clase
                        style={{ marginTop: '1rem', minHeight: '300px' }} // Dar altura mínima
                    >
                        <FaSpinner className="programmador-horarios-spinner" /> Cargando calendario...
                    </motion.div>
                ) : !hasSelectedEmployee ? (
                    // --- Mensaje si no hay empleado seleccionado ---
                    <motion.div
                        key="calendar-no-employee"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="programmador-horarios-message" // Reutilizar clase
                        style={{ marginTop: '1rem', minHeight: '300px' }}
                    >
                        <FaTimes /> Selecciona un empleado para ver su calendario.
                    </motion.div>
                ) : (
                    // --- Renderizado del Calendario ---
                    <motion.div
                        key="calendar-view-ready"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="programmador-horarios-calendar-container" // Reutilizar clase
                    >
                        <FullCalendar
                            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                            locale={esLocale}
                            initialView="dayGridMonth" // Vista inicial
                            firstDay={1} // Lunes como primer día de la semana
                            headerToolbar={{
                                left: 'prev,next today',
                                center: 'title',
                                right: 'dayGridMonth,timeGridWeek', // Vistas disponibles
                            }}
                            events={events} // Pasar los eventos combinados
                            datesSet={onDatesSet} // Handler para cuando cambia el rango visible
                            eventContent={eventContentRenderer} // Función personalizada para renderizar eventos
                            dayMaxEvents={false} // Mostrar "+X eventos" si no caben (poner `true` si prefieres)
                            
                            // Handlers de interacción (descomentar si los necesitas)
                            // eventClick={onEventClick}
                            // eventMouseEnter={onEventMouseEnter}
                            // eventMouseLeave={onEventMouseLeave}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ScheduleCalendarDisplay;