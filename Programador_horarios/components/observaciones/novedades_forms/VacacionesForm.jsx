import React from 'react';
import { FaCalendarCheck, FaCalendarDay,FaCalendarAlt, FaInfoCircle, FaClipboardList } from 'react-icons/fa';

const VacacionesForm = ({ formData, updateFormData, isEditing }) => {

    // Campos que el backend debe almacenar en 'vacaciones_details' (un objeto JSON)
    const {
        periodo_vacacional_ano, // Campo extra para el año del periodo
        fecha_inicio_vacaciones,
        fecha_fin_vacaciones,
        fecha_regreso_vacaciones,
    } = formData;

    return (
        <>
            {/* TÍTULO DE SECCIÓN */}
            <div className="observaciones-ph-form-section-title observaciones-ph-form-span-full">
                <h4>Especificaciones de la Solicitud</h4>
            </div>

            {/* AÑO DEL PERÍODO VACACIONAL */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="periodo_vacacional_ano"><FaClipboardList /> Periodo Vacacional (Año)</label>
                <input
                    type="number"
                    id="periodo_vacacional_ano"
                    className="observaciones-ph-form-input"
                    name="periodo_vacacional_ano"
                    value={periodo_vacacional_ano || new Date().getFullYear()}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    placeholder="Año"
                    required
                    min="2020"
                />
            </div>

            {/* FECHA DE INICIO */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="fecha_inicio_vacaciones"><FaCalendarCheck /> Fecha de Inicio Vacaciones</label>
                <input
                    type="date"
                    id="fecha_inicio_vacaciones"
                    className="observaciones-ph-form-input"
                    name="fecha_inicio_vacaciones"
                    value={fecha_inicio_vacaciones || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    required
                />
            </div>

            {/* FECHA DE FIN */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="fecha_fin_vacaciones"><FaCalendarDay /> Fecha de Fin Vacaciones</label>
                <input
                    type="date"
                    id="fecha_fin_vacaciones"
                    className="observaciones-ph-form-input"
                    name="fecha_fin_vacaciones"
                    value={fecha_fin_vacaciones || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    required
                />
            </div>

            {/* FECHA DE REGRESO */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="fecha_regreso_vacaciones"><FaCalendarAlt /> Fecha de Regreso</label>
                <input
                    type="date"
                    id="fecha_regreso_vacaciones"
                    className="observaciones-ph-form-input"
                    name="fecha_regreso_vacaciones"
                    value={fecha_regreso_vacaciones || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    required
                />
            </div>

            {/* OBSERVACIONES/CONSIDERACIONES (Usa el campo OBSERVACION principal) */}
            <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
                <label htmlFor="observacion_vacaciones"><FaInfoCircle /> Observaciones o Consideraciones</label>
                <textarea
                    id="observacion_vacaciones"
                    className="observaciones-ph-form-input"
                    rows="3"
                    name="observacion" // Utiliza el campo de observación principal
                    value={formData.observacion || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    placeholder="Detalle cualquier consideración importante sobre el disfrute de las vacaciones."
                    required
                />
            </div>
        </>
    );
};

export default VacacionesForm;