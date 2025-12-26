import React from 'react';
import { FaInfoCircle, FaFileContract } from 'react-icons/fa';
import { FileDropzone } from './FileDropzone'; 

const RestriccionForm = ({ formData, updateFormData, fileDropzoneProps, fileStates, isEditing, openPreview }) => {
    
    // Desestructurar los props de Dropzone específicos
    const { getRootPropsRR, getInputPropsRR, isDragActiveRR } = fileDropzoneProps;
    
    return (
        <>
            <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
                <label htmlFor="observacion_rr"><FaInfoCircle /> Observación / Detalles de la Restricción</label>
                <textarea
                    id="observacion_rr"
                    className="observaciones-ph-form-input"
                    rows="4"
                    name="observacion" // Utiliza el campo de observación principal
                    value={formData.observacion || ''}
                    onChange={(e) => updateFormData(e.target.name, e.target.value)}
                    placeholder="Detalle claramente la restricción o recomendación médica."
                    required
                />
            </div>
            
            <div className="observaciones-ph-form-group observaciones-ph-form-span-full">
                <label><FaFileContract /> Documento (Certificado Médico/Especialista)</label>
            </div>

            {/* Adjunto de Restricción */}
            <FileDropzone 
                label="Documento de Restricción/Recomendación" 
                file={fileStates.nuevoArchivoRR} 
                setFile={(f) => updateFormData('nuevoArchivoRR', f)} 
                getRootProps={getRootPropsRR} 
                getInputProps={getInputPropsRR} 
                isDragActive={isDragActiveRR} 
                isRequired={true} 
                isEditing={isEditing} 
                urlExistente={fileStates.urlRRexistente} 
                setUrlExistente={(u) => updateFormData('urlRRexistente', u)} 
                openPreview={openPreview}
            />
        </>
    );
};

export default RestriccionForm;