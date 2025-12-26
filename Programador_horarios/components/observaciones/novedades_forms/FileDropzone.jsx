import React from 'react';
import { FaPaperclip, FaUpload, FaFileAlt, FaTimesCircle, FaEye } from 'react-icons/fa';
import { useDropzone } from "react-dropzone"; 

// Este es el componente que debe exportarse para ser usado en IncapacidadForm, LicenciaForm, etc.
const FileDropzone = ({
    label,
    file,
    setFile,
    getRootProps,
    getInputProps,
    isDragActive,
    isRequired,
    isEditing,
    urlExistente,
    setUrlExistente,
    openPreview,
}) => {
    
    // Si la URL existente ha sido anulada, asumimos que el usuario quiere reemplazar.
    const isFileExisting = urlExistente && urlExistente !== 'null';

    // 1. Vista de Edición con Archivo Existente
    if (isEditing && isFileExisting && !file) {
        return (
            <div className="observaciones-ph-form-group">
                <label className="observaciones-ph-file-label">
                    <FaPaperclip /> {label}{" "}
                    {isRequired && (<span style={{ color: "var(--obs-ph-danger)" }}>*</span>)}
                </label>
                <div className="observaciones-ph-file-chip">
                    <FaFileAlt />
                    <span className="observaciones-ph-file-chip-name">
                        Archivo Existente
                    </span>
                    <div className="observaciones-ph-file-actions">
                        <button
                            type="button"
                            className="observaciones-ph-btn-action"
                            onClick={(e) => { e.stopPropagation(); openPreview(urlExistente); }}
                        >
                            <FaEye /> Ver
                        </button>
                        <button
                            type="button"
                            className="observaciones-ph-btn-action observaciones-ph-btn-danger"
                            onClick={(e) => { e.stopPropagation(); setUrlExistente(null); }}
                        >
                            <FaTimesCircle /> Quitar
                        </button>
                    </div>
                </div>
                {urlExistente === null && (
                    <p className="observaciones-ph-file-chip-warning">
                        Archivo marcado para eliminación/reemplazo al guardar.
                    </p>
                )}
            </div>
        );
    }

    // 2. Vista de Carga o Reemplazo
    return (
        <div className="observaciones-ph-form-group">
            <label className="observaciones-ph-file-label">
                <FaPaperclip /> {label}{" "}
                {isRequired && (<span style={{ color: "var(--obs-ph-danger)" }}>* (Obligatorio)</span>)}
            </label>
            <div
                {...getRootProps()}
                className={`observaciones-ph-dropzone ${isDragActive ? "observaciones-ph-dropzone-active" : ""} ${file ? "observaciones-ph-dropzone-has-file" : ""}`}
                role="button"
                tabIndex={0}
            >
                <input {...getInputProps()} />
                <div className="observaciones-ph-dropzone-inner">
                    <div className="observaciones-ph-dropzone-icon"> <FaUpload /> </div>
                    <div className="observaciones-ph-dropzone-text">
                        {file ? (
                            <span className="observaciones-ph-file-chip-name"> {file.name} </span>
                        ) : (
                            <>
                                <p className="observaciones-ph-dropzone-title"> Arrastra y suelta aquí </p>
                                <p className="observaciones-ph-dropzone-subtitle"> o haz clic para seleccionar </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {file && (
                <div className="observaciones-ph-file-chip">
                    <FaFileAlt />
                    <span className="observaciones-ph-file-chip-name">{file.name}</span>
                    <div className="observaciones-ph-file-actions">
                        <button
                            type="button"
                            className="observaciones-ph-btn-action observaciones-ph-btn-danger"
                            onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        >
                            <FaTimesCircle /> Quitar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const FileAttachmentChip = ({ url, label, openPreview }) => (
    <div className="observaciones-ph-chip">
        <FaPaperclip /> {label}
        <button
            type="button"
            className="observaciones-ph-btn-action"
            onClick={(e) => { e.stopPropagation(); openPreview(url); }}
            style={{ padding: "0.25rem 0.5rem", marginLeft: "0.5rem" }}
            title={`Ver ${label}`}
        >
            <FaEye />
        </button>
    </div>
);

export { FileDropzone, FileAttachmentChip };