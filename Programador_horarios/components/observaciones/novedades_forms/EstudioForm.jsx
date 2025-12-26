import React, { useState } from "react";
import {
  FaCalendarAlt,
  FaClock,
  FaInfoCircle,
  FaPlus,
  FaTrash,
} from "react-icons/fa";
import { FileDropzone } from "./FileDropzone";
import { format, parseISO, isValid } from "date-fns";

const EstudioForm = ({
  formData,
  updateFormData,
  fileDropzoneProps,
  fileStates,
  isEditing,
  openPreview,
}) => {
  const { getRootPropsGeneral, getInputPropsGeneral, isDragActiveGeneral } =
    fileDropzoneProps;

  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    updateFormData(name, value);
  };

  const handleAddDay = () => {
    if (!newDate || !newStart || !newEnd) return;

    const currentList = formData.dias_estudio || [];
    // Validar duplicados
    if (currentList.some((d) => d.fecha === newDate)) {
      alert("Ya has agregado este día.");
      return;
    }

    const newList = [
      ...currentList,
      { fecha: newDate, inicio: newStart, fin: newEnd },
    ];

    // Ordenar por fecha
    newList.sort((a, b) => a.fecha.localeCompare(b.fecha));

    updateFormData("dias_estudio", newList);

    // Actualizar fechas globales (inicio y fin del rango total)
    if (newList.length > 0) {
      updateFormData("fecha_inicio_estudio", newList[0].fecha);
      updateFormData("fecha_fin_estudio", newList[newList.length - 1].fecha);
    }

    setNewDate("");
    setNewStart("");
    setNewEnd("");
  };

  const handleRemoveDay = (index) => {
    const currentList = formData.dias_estudio || [];
    const newList = currentList.filter((_, i) => i !== index);
    updateFormData("dias_estudio", newList);

    // Actualizar fechas globales
    if (newList.length > 0) {
      updateFormData("fecha_inicio_estudio", newList[0].fecha);
      updateFormData("fecha_fin_estudio", newList[newList.length - 1].fecha);
    } else {
      updateFormData("fecha_inicio_estudio", "");
      updateFormData("fecha_fin_estudio", "");
    }
  };

  return (
    <>
      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <label>
          <FaCalendarAlt /> Días Específicos de Estudio (Obligatorio)
        </label>

        {/* Inputs para agregar nuevo día */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
            marginBottom: "15px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "150px" }}>
            <label style={{ fontSize: "0.8em" }}>Fecha:</label>
            <input
              type="date"
              className="observaciones-ph-form-input"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: "120px" }}>
            <label style={{ fontSize: "0.8em" }}>Hora Inicio:</label>
            <input
              type="time"
              className="observaciones-ph-form-input"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: "120px" }}>
            <label style={{ fontSize: "0.8em" }}>Hora Fin:</label>
            <input
              type="time"
              className="observaciones-ph-form-input"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="observaciones-ph-btn-action"
            onClick={handleAddDay}
            disabled={!newDate || !newStart || !newEnd}
            style={{ height: "42px", marginBottom: "1px" }}
          >
            <FaPlus /> Agregar
          </button>
        </div>

        {/* Lista de días agregados */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {(formData.dias_estudio || []).map((item, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px",
                border: "1px solid #eee",
                borderRadius: "5px",
                backgroundColor: "#f9f9f9",
              }}
            >
              <div>
                <strong>{item.fecha}</strong>: {item.inicio} - {item.fin}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveDay(index)}
                style={{
                  background: "none",
                  border: "none",
                  color: "red",
                  cursor: "pointer",
                }}
                title="Eliminar día"
              >
                <FaTrash />
              </button>
            </div>
          ))}
          {(!formData.dias_estudio || formData.dias_estudio.length === 0) && (
            <div style={{ color: "#666", fontStyle: "italic" }}>
              No has agregado días de estudio.
            </div>
          )}
        </div>
      </div>

      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <label htmlFor="observacion_estudio">
          <FaInfoCircle /> Detalle del Estudio (Obligatorio)
        </label>
        <textarea
          id="observacion_estudio"
          name="observacion"
          className="observaciones-ph-form-input"
          rows="3"
          value={formData.observacion || ""}
          onChange={handleChange}
          placeholder="Describe el programa académico y cómo impacta tu horario laboral."
          required
        />
      </div>

      <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
        <FileDropzone
          label="Adjuntar Soporte"
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
    </>
  );
};

export default EstudioForm;
