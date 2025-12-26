// src/components/programador/ScheduleCreator.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css'; // Estilos base de DayPicker
import { es } from 'date-fns/locale';
import { format } from 'date-fns';
import { FaCalendarAlt, FaSpinner, FaPlus, FaBan } from 'react-icons/fa';

const ScheduleCreator = ({
    // Estado y handlers para el rango de fechas
    range,
    setRange,
    disabledDays, // Array de objetos Date [new Date(), ...]

    // Estado y handlers para los días laborables
    workingWeekdays,
    setWorkingWeekdays,

    // Acción y estado de creación
    handleCreateHorario,
    creating, // boolean
}) => {
    // Modificador para aplicar la clase CSS a los días bloqueados
    const blockedModifier = { blocked: disabledDays || [] };

    // Handler para los checkboxes de días laborables
    const handleWeekdayChange = (dayValue, isChecked) => {
        setWorkingWeekdays((prev) => {
            const currentSet = new Set(prev);
            if (isChecked) {
                currentSet.add(dayValue);
            } else {
                currentSet.delete(dayValue);
            }
            // Devolver un nuevo array ordenado
            return Array.from(currentSet).sort((a, b) => a - b);
        });
    };

    return (
        <motion.div
            key="create-schedule-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="programmador-horarios-search-card" // Reutiliza la clase de tarjeta
        >
            <h2 className="programmador-horarios-search-title">
                <FaCalendarAlt /> Asignar Horario
            </h2>
            <div className="programmador-horarios-form">
                {/* --- Selector de Rango de Fechas --- */}
                <div className="programmador-horarios-form-group">
                    <label>Seleccionar rango de fechas</label>
                    <DayPicker
                        mode="range"
                        selected={range}
                        onSelect={setRange}
                        numberOfMonths={2} // Mantenemos 2 meses para mejor UX
                        showOutsideDays
                        locale={es}
                        disabled={disabledDays} // Deshabilita la selección
                        modifiers={blockedModifier} // Aplica el modificador
                        modifiersClassNames={{ blocked: 'rdp-day_blocked' }} // Asigna la clase CSS
                    />
                    <div className="programmador-horarios-info-box" style={{ marginTop: '10px' }}>
                        Rango:{" "}
                        <b>{range?.from ? format(range.from, 'dd/MM/yyyy') : '...'}</b> al <b>{range?.to ? format(range.to, 'dd/MM/yyyy') : '...'}</b>
                    </div>
                    {/* Mensaje de advertencia si hay días bloqueados */}
                    {(disabledDays?.length ?? 0) > 0 && (
                        <div className="programmador-horarios-blocking-hint">
                            <FaBan /> Los días marcados en rojo están bloqueados por novedades.
                        </div>
                    )}
                </div>

                {/* --- Selector de Días Laborables --- */}
                <div className="programmador-horarios-form-group">
                    <label>Días laborables</label>
                    <div className="programmador-horarios-weekday-checks">
                        {[
                            { d: 1, l: 'Lun' }, { d: 2, l: 'Mar' }, { d: 3, l: 'Mié' },
                            { d: 4, l: 'Jue' }, { d: 5, l: 'Vie' }, { d: 6, l: 'Sáb' },
                            // { d: 7, l: 'Dom' }, // Opcional: Habilitar si se pueden programar Domingos
                        ].map(({ d, l }) => (
                            <label
                                key={d}
                                className={`programmador-horarios-weekday-check ${workingWeekdays.includes(d) ? 'checked' : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={workingWeekdays.includes(d)}
                                    onChange={(e) => handleWeekdayChange(d, e.target.checked)}
                                />{' '}
                                {l}
                            </label>
                        ))}
                    </div>
                </div>

                {/* --- Botón de Acción --- */}
                <div className="programmador-horarios-btn-container">
                    <button
                        type="button"
                        className="programmador-horarios-btn-action primary"
                        style={{ width: '100%', maxWidth: '280px' }}
                        disabled={creating || !range?.from || !range?.to || workingWeekdays.length === 0}
                        onClick={handleCreateHorario} // Llama a la función del hook
                    >
                        {creating ? (
                            <><FaSpinner className="programmador-horarios-spinner" /> Generando...</>
                        ) : (
                            <><FaPlus /> Generar Horario</>
                        )}
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default ScheduleCreator;