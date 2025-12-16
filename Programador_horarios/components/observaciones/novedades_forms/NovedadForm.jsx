import React from "react";
import LicenciaForm from "./LicenciaForm";
import IncapacidadForm from "./IncapacidadForm";
import VacacionesForm from "./VacacionesForm";
import PrestamoForm from "./PrestamoForm";
import PermisoForm from "./PermisoForm";
import EstudioForm from "./EstudioForm";
import DiaFamiliaForm from "./DiaFamiliaForm"; // <-- NUEVO
import { FileDropzone } from "./FileDropzone";

/**
 * Componente que actúa como un SWITCH (router) para renderizar el formulario específico
 * basado en el tipo de novedad seleccionado.
 */
const NovedadForm = ({
  tipoNovedad,
  formData,
  updateFormData,
  fileDropzoneProps,
  fileStates,
  isEditing,
  openPreview,
}) => {
  // Desestructurar props de archivos genéricos y de restricción
  const { getRootPropsRR, getInputPropsRR, isDragActiveRR } = fileDropzoneProps;

  const commonProps = {
    formData,
    updateFormData,
    isEditing,
    fileStates,
    openPreview,
    fileDropzoneProps,
  };

  switch (tipoNovedad) {
    case "Licencias":
      return <LicenciaForm {...commonProps} />;

    case "Vacaciones":
      return <VacacionesForm {...commonProps} />;

    case "Incapacidades":
      return <IncapacidadForm {...commonProps} />;

    case "Restricciones/Recomendaciones":
      return (
        <FileDropzone
          label="Adjuntar Documento de Restricción/Recomendación"
          file={fileStates.nuevoArchivoRR}
          setFile={(f) => updateFormData("nuevoArchivoRR", f)}
          getRootProps={getRootPropsRR}
          getInputProps={getInputPropsRR}
          isDragActive={isDragActiveRR}
          isRequired={true}
          isEditing={isEditing}
          urlExistente={fileStates.urlRRexistente}
          setUrlExistente={(u) => updateFormData("urlRRexistente", u)}
          openPreview={openPreview}
        />
      );

    case "Estudio":
      return <EstudioForm {...commonProps} />;

    case "Permisos":
      return <PermisoForm {...commonProps} />;

    case "Préstamos":
      return <PrestamoForm {...commonProps} />;

    case "Día de la Familia":
      return <DiaFamiliaForm {...commonProps} />;

    default:
      return null;
  }
};

export default NovedadForm;
