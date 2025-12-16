import React from 'react';
import { FaCalendarAlt, FaUserTie, FaInfoCircle, FaClock } from 'react-icons/fa';

const LicenciaForm = ({ formData, updateFormData, isEditing }) => {

    const {
        sub_tipo_novedad, 
        fecha_inicio_licencia,
        fecha_termino_licencia,
        duracion_dias,
        lider_aprueba,
        fecha_aprobacion,
        motivo_licencia, 
    } = formData;

    return (
        <>
            {/* Tipo de Licencia */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="sub_tipo_novedad">Tipo de Licencia</label>
                <select
                    id="sub_tipo_novedad"
                    className="observaciones-ph-form-input"
                    name="sub_tipo_novedad"
                    value={sub_tipo_novedad || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    required
                >
                    <option value="">Seleccionar...</option>
                    <option value="Licencia Remunerada">Licencia Remunerada</option>
                    <option value="Licencia Sin Remunerar">Licencia Sin Remunerar</option>
                </select>
            </div>

            {/* Duración en Días */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="duracion_dias"><FaClock /> Duración (Número de Días)</label>
                <input
                    type="number"
                    id="duracion_dias"
                    className="observaciones-ph-form-input"
                    name="duracion_dias"
                    value={duracion_dias || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    placeholder="Número de Días"
                    required
                    min="1"
                />
            </div>

            {/* Fecha de Inicio */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="fecha_inicio_licencia"><FaCalendarAlt /> Fecha de Inicio</label>
                <input
                    type="date"
                    id="fecha_inicio_licencia"
                    className="observaciones-ph-form-input"
                    name="fecha_inicio_licencia"
                    value={fecha_inicio_licencia || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    required
                />
            </div>

            {/* Fecha de Término */}
            <div className="observaciones-ph-form-group">
                <label htmlFor="fecha_termino_licencia"><FaCalendarAlt /> Fecha de Término</label>
                <input
                    type="date"
                    id="fecha_termino_licencia"
                    className="observaciones-ph-form-input"
                    name="fecha_termino_licencia"
                    value={fecha_termino_licencia || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    required
                />
            </div>

            {/* Motivo de la Licencia (Campo separado que usa el campo motivo_licencia) */}
            <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
                <label htmlFor="motivo_licencia"><FaInfoCircle /> Motivo de la Licencia (Descripción Obligatoria)</label>
                <textarea
                    id="motivo_licencia"
                    className="observaciones-ph-form-input"
                    rows="3"
                    name="motivo_licencia"
                    value={motivo_licencia || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    placeholder="Detalle el motivo (ej: enfermedad, duelo, etc.)."
                />
            </div>

            {/* Datos de Aprobación */}
            <div className="observaciones-ph-form-section-title observaciones-ph-form-span-full">
                <h4>Datos de Aprobación</h4>
            </div>

            <div className="observaciones-ph-form-group">
                <label htmlFor="lider_aprueba"><FaUserTie /> Líder que Aprueba</label>
                <input
                    type="text"
                    id="lider_aprueba"
                    className="observaciones-ph-form-input"
                    name="lider_aprueba"
                    value={lider_aprueba || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    placeholder="Nombre del líder que aprueba"
                />
            </div>

            <div className="observaciones-ph-form-group">
                <label htmlFor="fecha_aprobacion"><FaCalendarAlt /> Fecha de Aprobación</label>
                <input
                    type="date"
                    id="fecha_aprobacion"
                    className="observaciones-ph-form-input"
                    name="fecha_aprobacion"
                    value={fecha_aprobacion || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                />
            </div>
        </>
    );
};

export default LicenciaForm;