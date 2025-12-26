import React from "react";
import { FaCalendarAlt, FaInfoCircle } from "react-icons/fa";
import { FileDropzone } from "./FileDropzone";

const PermisoForm = ({
  formData,
  updateFormData,
  fileDropzoneProps,
  fileStates,
  isEditing,
  openPreview,
}) => {
  const { getRootPropsGeneral, getInputPropsGeneral, isDragActiveGeneral } =
    fileDropzoneProps;

  const handleChange = (event) => {
    const { name, value } = event.target;
    updateFormData(name, value);
  };

  return (
    <>
      <div className="observaciones-ph-form-group">
        <label htmlFor="fecha_inicio_permiso">
          <FaCalendarAlt /> Fecha de Inicio del Permiso (Obligatorio)
        </label>
        <input
          type="date"
          id="fecha_inicio_permiso"
          name="fecha_inicio_permiso"
          className="observaciones-ph-form-input"
          value={formData.fecha_inicio_permiso || ""}
          onChange={handleChange}
          required
        />
      </div>

      <div className="observaciones-ph-form-group">
        <label htmlFor="fecha_fin_permiso">
          <FaCalendarAlt /> Fecha de Fin del Permiso (Obligatorio)
        </label>
        <input
          type="date"
          id="fecha_fin_permiso"
          name="fecha_fin_permiso"
          className="observaciones-ph-form-input"
          value={formData.fecha_fin_permiso || ""}
          min={formData.fecha_inicio_permiso || undefined}
          onChange={handleChange}
          required
        />
      </div>

      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <label htmlFor="observacion_permiso">
          <FaInfoCircle /> Motivo del Permiso (Obligatorio)
        </label>
        <textarea
          id="observacion_permiso"
          className="observaciones-ph-form-input"
          rows="3"
          name="observacion"
          value={formData.observacion || ""}
          onChange={handleChange}
          placeholder="Detalle el motivo del permiso (ej: cita médica personal, trámite bancario, etc.)."
          required
        />
      </div>

      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <label htmlFor="documentoAdjunto">
          Documento de Soporte (Obligatorio)
        </label>
        <FileDropzone
          label="Adjuntar Soporte de Permiso"
          file={fileStates.documentoAdjunto}
          setFile={(f) => updateFormData("documentoAdjunto", f)}
          getRootProps={getRootPropsGeneral}
          getInputProps={getInputPropsGeneral}
          isDragActive={isDragActiveGeneral}
          isEditing={isEditing}
          urlExistente={fileStates.archivoExistenteUrl}
          setUrlExistente={(u) => updateFormData("archivoExistenteUrl", u)}
          openPreview={openPreview}
          required
        />
      </div>
    </>
  );
};

export default PermisoForm;
