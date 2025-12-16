// src/components/programador/EmployeeSelector.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaSearch,
    FaSpinner,
    FaUser,
    FaUndo,
    FaChevronDown,
} from 'react-icons/fa';

// Este es un componente "tonto" (dumb component).
// Solo recibe props y renderiza JSX. No sabe de dónde vienen los datos.
const EmployeeSelector = ({
    empleados, // La lista de empleados ya filtrada y rebanada (slice)
    searchQuery,
    loadingEmpleados,
    selectedEmployee,
    hasMoreEmployees,
    setSearchQuery,
    handleLoadMore,
    handleSelectEmployee,
    handleResetSelection,
}) => {
    return (
        <div className="programmador-horarios-search-card">
            <h2 className="programmador-horarios-search-title">
                <FaSearch /> Buscar Empleado
            </h2>

            {/* Input de búsqueda (solo si no hay empleado seleccionado) */}
            {!selectedEmployee && (
                <input
                    type="text"
                    className="programmador-horarios-form-input"
                    placeholder="Cédula o Nombre"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={loadingEmpleados}
                />
            )}

            {/* Animación para cambiar entre la tabla y la tarjeta de selección */}
            <AnimatePresence mode="wait">
                {!selectedEmployee ? (
                    // --- VISTA DE TABLA DE BÚSQUEDA ---
                    <motion.div
                        key="employee-table-view"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="programmador-horarios-table-wrapper"
                        style={{ marginTop: '1rem' }} // Margen para separar del input
                    >
                        <table className="programmador-horarios-table">
                            <thead>
                                <tr>
                                    <th>Cédula</th>
                                    <th>Nombre</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingEmpleados ? (
                                    <tr>
                                        <td colSpan="3" className="programmador-horarios-table-cell">
                                            <FaSpinner className="programmador-horarios-spinner" /> Cargando...
                                        </td>
                                    </tr>
                                ) : empleados.length > 0 ? (
                                    empleados.map((emp) => (
                                        <tr key={emp.id}>
                                            <td className="programmador-horarios-table-cell">{emp.cedula}</td>
                                            <td className="programmador-horarios-table-cell">{emp.nombre_completo}</td>
                                            <td className="programmador-horarios-table-cell">
                                                <button
                                                    className="programmador-horarios-btn-action"
                                                    onClick={() => handleSelectEmployee(emp)}
                                                >
                                                    Seleccionar
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="programmador-horarios-table-cell">
                                            {searchQuery ? 'No se encontraron empleados.' : 'No hay empleados activos.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        
                        {/* Botón Cargar Más */}
                        {hasMoreEmployees && !loadingEmpleados && (
                            <button
                                className="programmador-horarios-btn-action"
                                style={{ width: '100%', marginTop: '1rem' }}
                                onClick={handleLoadMore}
                            >
                                <FaChevronDown /> Cargar más
                            </button>
                        )}
                    </motion.div>
                ) : (
                    // --- VISTA DE EMPLEADO YA SELECCIONADO ---
                    <motion.div
                        key="employee-selected-view"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="programmador-horarios-selected-empleado"
                        style={{ marginTop: '1rem' }}
                    >
                        <FaUser />
                        <span>
                            <b>{selectedEmployee.nombre_completo}</b> ({selectedEmployee.cedula})
                        </span>
                        <button
                            className="programmador-horarios-btn-action"
                            style={{ marginLeft: 'auto' }}
                            onClick={handleResetSelection}
                        >
                            <FaUndo /> Cambiar
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default EmployeeSelector;