import React from "react";
import { FaCalendarAlt, FaInfoCircle, FaSignature } from "react-icons/fa";
import { FileDropzone } from "./FileDropzone";

/**
 * Formulario específico para solicitud de Día de la Familia
 * Basado en la Ley 1857 de 2017
 */
const DiaFamiliaForm = ({
  formData,
  updateFormData,
  fileDropzoneProps,
  fileStates,
  isEditing,
  openPreview,
}) => {
  // Desestructurar props de archivos genéricos
  const { getRootPropsGeneral, getInputPropsGeneral, isDragActiveGeneral } =
    fileDropzoneProps;

  return (
    <>
      {/* Rango de fechas solicitadas */}
      <div className="observaciones-ph-form-group">
        <label htmlFor="fecha_inicio_dia_familia">
          <FaCalendarAlt /> Fecha de Inicio (Obligatorio)
        </label>
        <input
          type="date"
          id="fecha_inicio_dia_familia"
          name="fecha_inicio_dia_familia"
          className="observaciones-ph-form-input"
          value={formData.fecha_inicio_dia_familia || ""}
          onChange={(e) => updateFormData(e.target.name, e.target.value)}
          required
        />
      </div>

      <div className="observaciones-ph-form-group">
        <label htmlFor="fecha_fin_dia_familia">
          <FaCalendarAlt /> Fecha de Fin (Obligatorio)
        </label>
        <input
          type="date"
          id="fecha_fin_dia_familia"
          name="fecha_fin_dia_familia"
          className="observaciones-ph-form-input"
          value={formData.fecha_fin_dia_familia || ""}
          min={formData.fecha_inicio_dia_familia || undefined}
          onChange={(e) => updateFormData(e.target.name, e.target.value)}
          required
        />
      </div>

      {/* Fecha Propuesta para el Día de la Familia */}
      <div className="observaciones-ph-form-group">
        <label htmlFor="fecha_propuesta_dia_familia">
          <FaCalendarAlt /> Fecha Propuesta para el Día de la Familia (Opcional)
        </label>
        <input
          type="date"
          id="fecha_propuesta_dia_familia"
          name="fecha_propuesta_dia_familia"
          className="observaciones-ph-form-input"
          value={formData.fecha_propuesta_dia_familia || ""}
          onChange={(e) => updateFormData(e.target.name, e.target.value)}
        />
      </div>

      {/* Información sobre Modalidades de Cumplimiento */}
      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <div
          style={{
            background: "#e0f2fe",
            border: "1px solid #7dd3fc",
            borderRadius: "var(--obs-ph-radius-md)",
            padding: "1rem",
            fontSize: "0.875rem",
            color: "#0c4a6e",
            lineHeight: "1.6",
          }}
        >
          <strong
            style={{
              color: "#0369a1",
              display: "block",
              marginBottom: "0.5rem",
            }}
          >
            <FaInfoCircle style={{ marginRight: "0.5rem" }} />
            Acepto que el empleador puede cumplir con esta obligación de las
            siguientes maneras:
          </strong>
          <ol
            style={{
              marginTop: "0.5rem",
              marginBottom: "0",
              paddingLeft: "1.5rem",
            }}
          >
            <li>Proporcionar un espacio para compartir con la familia.</li>
            <li>Coordinar con la Caja de Compensación Familiar.</li>
            <li>
              Otorgar una jornada libre remunerada si las anteriores opciones no
              son viables.
            </li>
          </ol>
        </div>
      </div>

      {/* Cargo del Solicitante */}
      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <label htmlFor="cargo_solicitante_familia">
          Cargo del Solicitante 
        </label>
        <input
          type="text"
          id="cargo_solicitante_familia"
          name="cargo_solicitante_familia"
          className="observaciones-ph-form-input"
          value={formData.cargo_solicitante_familia || ""}
          onChange={(e) => updateFormData(e.target.name, e.target.value)}
          placeholder="Ej: Operario, Coordinador, etc."
        />
      </div>

      {/* Observaciones Adicionales */}
      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <label htmlFor="observacion">
          <FaInfoCircle /> Observaciones Adicionales (Opcional)
        </label>
        <textarea
          id="observacion"
          name="observacion"
          className="observaciones-ph-form-input"
          rows="3"
          value={formData.observacion || ""}
          onChange={(e) => updateFormData(e.target.name, e.target.value)}
          placeholder="Agregue cualquier comentario o información adicional relevante..."
        />
      </div>

      {/* Documento Adjunto (Opcional) */}
      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <FileDropzone
          label="Adjuntar Documento de Soporte (Opcional)"
          file={fileStates.documentoAdjunto}
          setFile={(f) => updateFormData("documentoAdjunto", f)}
          getRootProps={getRootPropsGeneral}
          getInputProps={getInputPropsGeneral}
          isDragActive={isDragActiveGeneral}
          isRequired={false}
          isEditing={isEditing}
          urlExistente={fileStates.archivoExistenteUrl}
          setUrlExistente={(u) => updateFormData("archivoExistenteUrl", u)}
          openPreview={openPreview}
        />
      </div>

      {/* Información Legal */}
      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <div
          style={{
            background: "var(--obs-ph-primary-light)",
            border: "1px solid var(--obs-ph-border-secondary)",
            borderRadius: "var(--obs-ph-radius-md)",
            padding: "1rem",
            fontSize: "0.875rem",
            color: "var(--obs-ph-text-secondary)",
            lineHeight: "1.6",
          }}
        >
          <strong style={{ color: "var(--obs-ph-primary)" }}>
            <FaInfoCircle style={{ marginRight: "0.5rem" }} />
            Marco Legal: Ley 1857 de 2017
          </strong>
          <p style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
            Esta ley establece la obligación de los empleadores de facilitar una
            jornada laboral semestral para que los trabajadores compartan con
            sus familias.
          </p>
          <p style={{ margin: "0" }}>
            <strong>Modalidades de cumplimiento:</strong>
          </p>
          <ol
            style={{
              marginTop: "0.25rem",
              marginBottom: "0",
              paddingLeft: "1.5rem",
            }}
          >
            <li>Proporcionar un espacio para compartir con la familia</li>
            <li>Coordinar con la Caja de Compensación Familiar</li>
            <li>
              Otorgar una jornada libre remunerada si las anteriores opciones no
              son viables
            </li>
          </ol>
        </div>
      </div>
    </>
  );
};

export default DiaFamiliaForm;
