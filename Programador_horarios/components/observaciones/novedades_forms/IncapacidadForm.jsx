import React from "react";
import { FileDropzone } from "./FileDropzone";

const IncapacidadForm = ({
  formData,
  updateFormData,
  fileDropzoneProps,
  fileStates,
  isEditing,
  openPreview,
}) => {
  const { tipoIncapacidad, diasIncapacidad } = formData;

  // Desestructurar los props de Dropzone específicos
  const {
    getRootPropsIncap,
    getInputPropsIncap,
    isDragActiveIncap,
    getRootPropsHistoria,
    getInputPropsHistoria,
    isDragActiveHistoria,
  } = fileDropzoneProps;

  // Lógica Condicional para Adjuntos
  const isIT = tipoIncapacidad === "Incidente de Trabajo";
  const isEGM =
    tipoIncapacidad === "Enfermedad General" &&
    diasIncapacidad === "Mayor a 3 días";

  return (
    <>
      {/* Tipo de Incapacidad */}
      <div className="observaciones-ph-form-group">
        <label htmlFor="tipoIncapacidad">Tipo de Incapacidad</label>
        <select
          id="tipoIncapacidad"
          className="observaciones-ph-form-input"
          name="tipoIncapacidad"
          value={tipoIncapacidad}
          onChange={(e) => updateFormData("tipoIncapacidad", e.target.value)}
          required
        >
          <option value="">Seleccionar...</option>
          <option value="Incidente de Trabajo">ARL</option>
          <option value="Enfermedad General">Enfermedad General</option>
        </select>
      </div>

      {/* Fechas de la incapacidad */}
      <div className="observaciones-ph-form-group">
        <label htmlFor="fecha_inicio_incapacidad">Fecha de inicio</label>
        <input
          type="date"
          id="fecha_inicio_incapacidad"
          className="observaciones-ph-form-input"
          name="fecha_inicio_incapacidad"
          value={formData.fecha_inicio_incapacidad || ""}
          onChange={(e) =>
            updateFormData("fecha_inicio_incapacidad", e.target.value)
          }
          required
        />
      </div>

      <div className="observaciones-ph-form-group">
        <label htmlFor="fecha_fin_incapacidad">Fecha de finalización</label>
        <input
          type="date"
          id="fecha_fin_incapacidad"
          className="observaciones-ph-form-input"
          name="fecha_fin_incapacidad"
          value={formData.fecha_fin_incapacidad || ""}
          onChange={(e) =>
            updateFormData("fecha_fin_incapacidad", e.target.value)
          }
          required
        />
      </div>

      {/* Duración (Solo si es Enfermedad General) */}
      {tipoIncapacidad === "Enfermedad General" && (
        <div className="observaciones-ph-form-group">
          <label htmlFor="diasIncapacidad">Duración</label>
          <select
            id="diasIncapacidad"
            className="observaciones-ph-form-input"
            name="diasIncapacidad"
            value={diasIncapacidad}
            onChange={(e) => updateFormData("diasIncapacidad", e.target.value)}
            required
          >
            <option value="">Seleccionar...</option>
            <option value="Mayor a 3 días">Mayor a 3 días</option>
            <option value="Menor a 3 días">Menor o igual a 3 días</option>
          </select>
        </div>
      )}

      {/* ZONA DE ADJUNTOS DE INCAPACIDAD */}
      {tipoIncapacidad && (isIT || diasIncapacidad) && (
        <>
          {/* Adjunto Incapacidad */}
          <FileDropzone
            label="Adjuntar Incapacidad"
            file={fileStates.archivoIncapacidad}
            setFile={(f) => updateFormData("archivoIncapacidad", f)}
            getRootProps={getRootPropsIncap}
            getInputProps={getInputPropsIncap}
            isDragActive={isDragActiveIncap}
            isRequired={true}
            isEditing={isEditing}
            urlExistente={fileStates.urlIncapacidadExistente}
            setUrlExistente={(u) =>
              updateFormData("urlIncapacidadExistente", u)
            }
            openPreview={openPreview}
          />

          {/* Adjunto Historia Clínica (Solo si es IT o EG > 3 días) */}
          {(isIT || isEGM) && (
            <FileDropzone
              label="Adjuntar Historia Clínica"
              file={fileStates.archivoHistoriaClinica}
              setFile={(f) => updateFormData("archivoHistoriaClinica", f)}
              getRootProps={getRootPropsHistoria}
              getInputProps={getInputPropsHistoria}
              isDragActive={isDragActiveHistoria}
              isRequired={true}
              isEditing={isEditing}
              urlExistente={fileStates.urlHistoriaExistente}
              setUrlExistente={(u) => updateFormData("urlHistoriaExistente", u)}
              openPreview={openPreview}
            />
          )}
        </>
      )}
    </>
  );
};

export default IncapacidadForm;
