import React from "react";
import {
  FaMoneyBillWave,
  FaSortNumericUp,
  FaRegCommentDots,
} from "react-icons/fa";

const PrestamoForm = ({ formData, updateFormData, isEditing }) => {
  const {
    monto_solicitado, // Usaremos este campo
    numero_cuotas, // Nuevo campo
    observacion, // Usado para Motivo del Préstamo (OBLIGATORIO)
  } = formData;

  // Función para formatear el monto como moneda
  const formatearMonto = (value) => {
    if (!value) return "";
    // Remover todo lo que no sean números
    const numeroLimpio = value.replace(/\D/g, "");
    if (!numeroLimpio) return "";

    // Formatear como moneda colombiana
    const formatter = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    });

    return formatter.format(numeroLimpio);
  };

  // Manejador para el cambio del monto
  const handleMontoChange = (e) => {
    const valorFormateado = formatearMonto(e.target.value);
    updateFormData("monto_solicitado", valorFormateado);
  };

  return (
    <>
      {/* TÍTULO DE SECCIÓN */}
      <div className="observaciones-ph-form-section-title observaciones-ph-form-span-full">
        <h4>Detalles de la Solicitud de Préstamo</h4>
      </div>

      {/* MONTO SOLICITADO */}
      <div className="observaciones-ph-form-group">
        <label htmlFor="monto_solicitado">
          <FaMoneyBillWave /> Monto Solicitado (COP)
        </label>
        <input
          type="text"
          id="monto_solicitado"
          className="observaciones-ph-form-input"
          name="monto_solicitado"
          value={monto_solicitado || ""}
          onChange={handleMontoChange}
          placeholder="Ej: $1.500.000"
          required
        />
      </div>

      {/* NÚMERO DE CUOTAS */}
      <div className="observaciones-ph-form-group">
        <label htmlFor="numero_cuotas">
          <FaSortNumericUp /> Número de Cuotas Mensuales
        </label>
        <input
          type="number"
          id="numero_cuotas"
          className="observaciones-ph-form-input"
          name="numero_cuotas"
          value={numero_cuotas || ""}
          onChange={(e) => updateFormData(e.target.name, e.target.value)}
          placeholder="Ej: 12"
          required
          min="1"
        />
      </div>

      {/* Motivo / Observación del Préstamo (local) */}
      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <label htmlFor="observacion">
          <FaRegCommentDots /> Motivo / Observación del Préstamo
        </label>
        <textarea
          id="observacion"
          className="observaciones-ph-form-input"
          rows="3"
          name="observacion"
          value={formData.observacion || ""}
          onChange={(e) => updateFormData(e.target.name, e.target.value)}
          placeholder="Describa el motivo del préstamo (ej: compra de electrodoméstico, gastos médicos, etc.)."
          required
        />
      </div>
    </>
  );
};

export default PrestamoForm;
