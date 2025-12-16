import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  forwardRef,
  useRef,
  useImperativeHandle,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUser,
  FaClipboardList,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaUndo,
  FaPencilAlt,
  FaTrashAlt,
  FaHistory,
  FaPaperclip,
  FaTimesCircle,
  FaChevronDown,
  FaPlus,
  FaSave,
  FaEye,
  FaCalendarAlt,
  FaInfoCircle,
  FaSignature,
  FaEraser,
  FaCheckCircle,
} from "react-icons/fa";
import { useDropzone } from "react-dropzone";
import { toast } from "react-toastify";
import { api } from "../../services/apiHorarios";
import { Worker } from "@react-pdf-viewer/core";
import { Viewer } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import "./ObservacionesPH.css";
import Swal from "sweetalert2";

import NovedadForm from "./components/observaciones/novedades_forms/NovedadForm";
import { FileAttachmentChip } from "./components/observaciones/novedades_forms/FileDropzone";
import SignatureField from "./components/observaciones/novedades_forms/SignatureField";

const MAX_FILE_MB = 10;
const DROP_ACCEPT = {
  "application/pdf": [".pdf"],
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"],
};

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = (error) => reject(error);
  });

const isPdfUrl = (url = "") => url.toLowerCase().endsWith(".pdf");
const isImageUrl = (url = "") => /\.(png|jpg|jpeg|webp|gif)$/i.test(url);

const initialFormData = {
  observacion: "",
  tipoNovedad: "",
  fechaNovedad: "",

  documentoAdjunto: null,
  archivoExistenteUrl: null,
  archivoExistenteUrlOriginal: null,

  sub_tipo_novedad: "",
  fecha_inicio_licencia: "",
  fecha_termino_licencia: "",
  duracion_dias: "",
  lider_aprueba: "",
  fecha_aprobacion: "",
  motivo_licencia: "",

  monto_solicitado: "",
  numero_cuotas: "",
  fecha_desembolso: "",
  cantidad_cuota_prestamo: "",
  valor_total_prestamo: "",
  revisado_jefe: "",
  aprobado_gh: "",
  contabilizado_tesoreria: "",

  tipoIncapacidad: "",
  diasIncapacidad: "",
  fecha_inicio_incapacidad: "",
  fecha_fin_incapacidad: "",
  archivoIncapacidad: null,
  archivoHistoriaClinica: null,
  urlIncapacidadExistente: null,
  urlHistoriaExistente: null,

  nuevoArchivoRR: null,
  urlRRexistente: null,

  horarioEstudio: "",
  fecha_inicio_permiso: "",
  fecha_fin_permiso: "",
  fecha_inicio_estudio: "",
  fecha_fin_estudio: "",

  periodo_vacacional_ano: new Date().getFullYear().toString(),
  fecha_inicio_vacaciones: "",
  fecha_fin_vacaciones: "",
  fecha_regreso_vacaciones: "",

  // DÍA DE LA FAMILIA
  fecha_inicio_dia_familia: "",
  fecha_fin_dia_familia: "",
  fecha_propuesta_dia_familia: "",
  justificacion_dia_familia: "",
  cargo_solicitante_familia: "",

  // FIRMAS
  firmaEmpleadoBase64: null,
  urlFirmaEmpleadoExistente: null,
  firmaLiderBase64: null,
  urlFirmaLiderExistente: null,
};

// =======================================================
// COMPONENTE WRAPPER DE FIRMA (Lógica Aislada)
// =======================================================

const SignatureInput = forwardRef(
  (
    {
      label,
      name,
      value,
      urlExistente,
      updateFormData,
      isRequired = false,
      openPreview,
    },
    ref
  ) => {
    const sigPadRef = useRef();
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    useEffect(() => {
      // Si se carga una URL existente, la dibujamos en el lienzo
      if (urlExistente && sigPadRef.current) {
        sigPadRef.current.fromDataURL(urlExistente);
      } else if (!value && !urlExistente && sigPadRef.current) {
        // Si no hay valor ni URL, se limpia (ej. al cancelar edición o enviar formulario)
        sigPadRef.current.clear();
      }
    }, [urlExistente, value]);

    const handleDrawingStart = () => {
      setHasUnsavedChanges(true);
    };

    const handleDrawingEnd = () => {
      // No hacemos nada aquí, solo esperamos el click en "Guardar Firma"
    };

    const handleSaveSignature = () => {
      if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
        const dataURL = sigPadRef.current.toDataURL("image/png");
        const base64Content = dataURL.split(",")[1];

        updateFormData(name, base64Content);
        updateFormData(name.replace("Base64", "Existente"), null);

        setHasUnsavedChanges(false);
        toast.success("Firma capturada y guardada localmente.");
      } else {
        toast.error("El lienzo de firma está vacío.");
      }
    };

    const handleClearCanvas = () => {
      if (sigPadRef.current) {
        sigPadRef.current.clear();
      }
      setHasUnsavedChanges(false);
    };

    const handleRemoveSignature = () => {
      if (sigPadRef.current) {
        sigPadRef.current.clear();
      }
      updateFormData(name, null);
      updateFormData(name.replace("Base64", "Existente"), null);
      setHasUnsavedChanges(false);
      toast.info("Firma eliminada del formulario.");
    };

    const isSigned = urlExistente || value;
    const isNewSignature = value && !urlExistente;

    return (
      <div className="observaciones-ph-form-group">
        <label className="observaciones-ph-file-label">
          <FaSignature /> {label}{" "}
          {isRequired && (
            <span style={{ color: "var(--obs-ph-danger)" }}>(Obligatorio)</span>
          )}
        </label>

        <div
          style={{
            border: isSigned
              ? "2px solid var(--obs-ph-success)"
              : "2px dashed var(--obs-ph-border-secondary)",
            borderRadius: "var(--obs-ph-radius-md)",
            overflow: "hidden",
            background: "white",
            position: "relative",
          }}
        >
          <SignatureField
            ref={sigPadRef}
            onBegin={handleDrawingStart}
            onEnd={handleDrawingEnd}
            width={600}
            height={150}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "0.5rem",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={handleSaveSignature}
              className="observaciones-ph-btn-action primary"
              disabled={!hasUnsavedChanges || isSigned}
            >
              <FaSave /> Guardar Firma
            </button>
            <button
              type="button"
              className="observaciones-ph-btn-action"
              onClick={handleClearCanvas}
              disabled={!hasUnsavedChanges || isSigned}
            >
              <FaEraser /> Limpiar Lienzo
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginLeft: "auto",
            }}
          >
            {isSigned && (
              <span
                style={{
                  color: isNewSignature
                    ? "var(--obs-ph-primary)"
                    : "var(--obs-ph-success)",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <FaCheckCircle />{" "}
                {isNewSignature
                  ? "Firma Lista para Enviar"
                  : "Firma Registrada"}
              </span>
            )}

            {urlExistente && (
              <button
                type="button"
                className="observaciones-ph-btn-action"
                onClick={() => openPreview(urlExistente)}
              >
                <FaEye /> Ver Existente
              </button>
            )}

            {isSigned && (
              <button
                type="button"
                className="observaciones-ph-btn-action observaciones-ph-btn-danger"
                onClick={handleRemoveSignature}
              >
                <FaTimesCircle /> Quitar
              </button>
            )}
          </div>
        </div>

        {isRequired && (
          <input type="hidden" value={isSigned ? "signed" : ""} required />
        )}
      </div>
    );
  }
);

SignatureInput.displayName = "SignatureInput";

const ObservacionesPH = () => {
  const [allEmpleados, setAllEmpleados] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmpleado, setSelectedEmpleado] = useState(null);
  const [observacionesHistory, setObservacionesHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingEmpleados, setLoadingEmpleados] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [visibleEmployees, setVisibleEmployees] = useState(10);

  const tiposNovedad = useMemo(
    () => [
      "Incapacidades",
      "Licencias",
      "Préstamos",
      "Permisos",
      "Estudio",
      "Vacaciones",
      "Restricciones/Recomendaciones",
      "Día de la Familia",
    ],
    []
  );
  const [isEditing, setIsEditing] = useState(false);
  const [observacionId, setObservacionId] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMode, setPreviewMode] = useState("");

  const HISTORY_PER_PAGE = 5;

  const [formData, setFormData] = useState({
    ...initialFormData,
    tipoNovedad: tiposNovedad[0],
  });
  const updateFormData = useCallback((key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const fileStates = useMemo(
    () => ({
      archivoIncapacidad: formData.archivoIncapacidad,
      urlIncapacidadExistente: formData.urlIncapacidadExistente,
      archivoHistoriaClinica: formData.archivoHistoriaClinica,
      urlHistoriaExistente: formData.urlHistoriaExistente,
      nuevoArchivoRR: formData.nuevoArchivoRR,
      urlRRexistente: formData.urlRRexistente,
      documentoAdjunto: formData.documentoAdjunto,
      archivoExistenteUrl: formData.archivoExistenteUrl,
      archivoExistenteUrlOriginal: formData.archivoExistenteUrlOriginal,
    }),
    [formData]
  );

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  const fetchEmpleados = useCallback(async () => {
    try {
      const { data } = await api.get("/empleados?estado=eq.activo");
      setAllEmpleados(data || []);
      setEmpleados(data || []);
    } catch (err) {
      toast.error("Error al cargar empleados: " + err.message);
    } finally {
      setLoadingEmpleados(false);
    }
  }, []);

  useEffect(() => {
    fetchEmpleados();
  }, [fetchEmpleados]);

  useEffect(() => {
    const filtered = allEmpleados.filter(
      (emp) =>
        (emp.cedula || "").includes(searchQuery) ||
        (emp.nombre_completo || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
    );
    setEmpleados(filtered);
    setVisibleEmployees(10);
  }, [searchQuery, allEmpleados]);

  const fetchHistory = useCallback(async () => {
    if (!selectedEmpleado) {
      setObservacionesHistory([]);
      setHistoryPage(1);
      return;
    }
    setLoadingHistory(true);
    try {
      const { data } = await api.get(`/observaciones/${selectedEmpleado.id}`);
      setObservacionesHistory(data || []);
    } catch (err) {
      toast.error(
        "Error al cargar historial: " +
          (err.response?.data?.message || err.message)
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedEmpleado]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedEmpleado]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(observacionesHistory.length / HISTORY_PER_PAGE)
    );
    if (historyPage > totalPages) {
      setHistoryPage(totalPages);
    }
  }, [observacionesHistory, historyPage]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onDrop = (acceptedFiles, fileRejections, key) => {
    if (!acceptedFiles?.length) return;
    const file = acceptedFiles[0];
    updateFormData(key, file);
    if (key === "archivoIncapacidad")
      updateFormData("urlIncapacidadExistente", null);
    if (key === "archivoHistoriaClinica")
      updateFormData("urlHistoriaExistente", null);
    if (key === "nuevoArchivoRR") updateFormData("urlRRexistente", null);
    if (key === "documentoAdjunto") updateFormData("archivoExistenteUrl", null);
  };

  const commonDropzoneProps = {
    accept: DROP_ACCEPT,
    maxFiles: 1,
    maxSize: MAX_FILE_MB * 1024 * 1024,
    multiple: false,
  };

  const createDropzone = (key) =>
    useDropzone({
      ...commonDropzoneProps,
      onDrop: (files, rejects) => onDrop(files, rejects, key),
    });

  const {
    getRootProps: getRootPropsGeneral,
    getInputProps: getInputPropsGeneral,
    isDragActive: isDragActiveGeneral,
  } = createDropzone("documentoAdjunto");
  const {
    getRootProps: getRootPropsIncap,
    getInputProps: getInputPropsIncap,
    isDragActive: isDragActiveIncap,
  } = createDropzone("archivoIncapacidad");
  const {
    getRootProps: getRootPropsHistoria,
    getInputProps: getInputPropsHistoria,
    isDragActive: isDragActiveHistoria,
  } = createDropzone("archivoHistoriaClinica");
  const {
    getRootProps: getRootPropsRR,
    getInputProps: getInputPropsRR,
    isDragActive: isDragActiveRR,
  } = createDropzone("nuevoArchivoRR");

  const resetForm = () => {
    setFormData({ ...initialFormData, tipoNovedad: tiposNovedad[0] });
    setIsEditing(false);
    setObservacionId(null);
  };

  const normalizeDateInput = (value) => {
    if (!value) return "";

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "";
      if (trimmed.includes("T")) {
        return trimmed.split("T")[0];
      }
      if (trimmed.length >= 10) {
        return trimmed.slice(0, 10);
      }
      return trimmed;
    }

    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch (error) {
      console.warn("normalizeDateInput fallback", error);
      return "";
    }
  };

  const formatFecha = (rawValue) => {
    if (!rawValue) return "Sin fecha";

    const datePortion = normalizeDateInput(rawValue);
    if (!datePortion) {
      return typeof rawValue === "string" ? rawValue : "Sin fecha";
    }

    const [year, month, day] = datePortion.split("-");
    if (!year || !month || !day) {
      return datePortion;
    }

    const displayDate = new Date(Number(year), Number(month) - 1, Number(day));

    return displayDate.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (value) => {
    if (typeof value === "string") {
      const num = value.replace(/[$.]/g, "");
      if (!isNaN(num) && num.length > 0) {
        return new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency: "COP",
          minimumFractionDigits: 0,
        }).format(Number(num));
      }
    }
    return value || "N/A";
  };

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(observacionesHistory.length / HISTORY_PER_PAGE)
  );

  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);

  const historySliceStart = (safeHistoryPage - 1) * HISTORY_PER_PAGE;
  const paginatedHistory = observacionesHistory.slice(
    historySliceStart,
    historySliceStart + HISTORY_PER_PAGE
  );

  const handleValidation = () => {
    if (!selectedEmpleado) return "Debes seleccionar un empleado.";
    if (!formData.fechaNovedad) return "Selecciona la fecha de la novedad.";

    const { tipoNovedad, tipoIncapacidad, diasIncapacidad } = formData;

    if (tipoNovedad === "Licencias") {
      if (!formData.sub_tipo_novedad)
        return "Debes seleccionar el tipo de licencia (Remunerada/Sin Remunerar).";
      if (!formData.duracion_dias || Number(formData.duracion_dias) <= 0)
        return "La licencia debe tener una duración válida (> 0 días).";
      if (!formData.fecha_inicio_licencia || !formData.fecha_termino_licencia)
        return "Debes especificar las fechas de inicio y término.";
      if (!formData.motivo_licencia)
        return "El motivo de la Licencia es obligatorio.";
    }

    if (tipoNovedad === "Préstamos") {
      if (!formData.monto_solicitado)
        return "Debes especificar el monto solicitado.";
      if (!formData.numero_cuotas || Number(formData.numero_cuotas) <= 0)
        return "Debes especificar el número de cuotas.";
      if (!formData.observacion)
        return "El motivo del préstamo es obligatorio.";
    }

    if (tipoNovedad === "Restricciones/Recomendaciones") {
      if (!fileStates.nuevoArchivoRR && !fileStates.urlRRexistente)
        return "Falta adjuntar el archivo de Restricciones/Recomendaciones (obligatorio).";
    }

    if (tipoNovedad === "Permisos") {
      if (!formData.observacion) return "El motivo del permiso es obligatorio.";
      if (!formData.fecha_inicio_permiso || !formData.fecha_fin_permiso)
        return "Debes indicar las fechas de inicio y fin del permiso.";
      if (formData.fecha_fin_permiso < formData.fecha_inicio_permiso)
        return "La fecha de fin del permiso no puede ser anterior a la fecha de inicio.";
    }

    if (tipoNovedad === "Estudio") {
      if (!formData.dias_estudio || formData.dias_estudio.length === 0)
        return "Debes seleccionar al menos un día de estudio con su horario.";

      for (const dia of formData.dias_estudio) {
        if (!dia.inicio || !dia.fin)
          return "Debes indicar hora inicio y fin para todos los días seleccionados.";
      }

      if (!formData.observacion)
        return "El motivo de la novedad de estudio es obligatorio.";
      if (!formData.fecha_inicio_estudio || !formData.fecha_fin_estudio)
        return "Debes indicar las fechas de inicio y fin del periodo de estudio.";
      if (formData.fecha_fin_estudio < formData.fecha_inicio_estudio)
        return "La fecha de fin del estudio no puede ser anterior a la fecha de inicio.";
    }

    if (tipoNovedad === "Día de la Familia") {
      if (!formData.fecha_inicio_dia_familia || !formData.fecha_fin_dia_familia)
        return "Debes indicar las fechas de inicio y fin para el Día de la Familia.";
      if (formData.fecha_fin_dia_familia < formData.fecha_inicio_dia_familia)
        return "La fecha final del Día de la Familia no puede ser anterior a la fecha de inicio.";
    }

    if (tipoNovedad === "Incapacidades") {
      if (!tipoIncapacidad)
        return "Debes seleccionar si es Incidente de Trabajo o Enfermedad General.";
      if (!formData.fecha_inicio_incapacidad || !formData.fecha_fin_incapacidad)
        return "Debes indicar las fechas de inicio y fin de la incapacidad.";
      if (formData.fecha_fin_incapacidad < formData.fecha_inicio_incapacidad)
        return "La fecha final de la incapacidad no puede ser anterior a la fecha de inicio.";
      const isNewOrExistingIncap =
        fileStates.archivoIncapacidad || fileStates.urlIncapacidadExistente;
      const isNewOrExistingHistoria =
        fileStates.archivoHistoriaClinica || fileStates.urlHistoriaExistente;

      if (tipoIncapacidad === "Incidente de Trabajo") {
        if (!isNewOrExistingIncap)
          return "Falta adjuntar el archivo de Incapacidad (obligatorio).";
        if (!isNewOrExistingHistoria)
          return "Falta adjuntar el archivo de Historia Clínica (obligatorio).";
      }
      if (tipoIncapacidad === "Enfermedad General") {
        if (!diasIncapacidad)
          return "Debes indicar la duración (Mayor o Menor a 3 días).";
        if (diasIncapacidad === "Mayor a 3 días") {
          if (!isNewOrExistingIncap)
            return "Falta adjuntar el archivo de Incapacidad (obligatorio).";
          if (!isNewOrExistingHistoria)
            return "Falta adjuntar el archivo de Historia Clínica (obligatorio).";
        }
        if (diasIncapacidad === "Menor a 3 días") {
          if (!isNewOrExistingIncap)
            return "Falta adjuntar el archivo de Incapacidad (obligatorio).";
        }
      }
    }

    // Validación de Firma del Empleado (Obligatoria)
    if (!formData.firmaEmpleadoBase64 && !formData.urlFirmaEmpleadoExistente) {
      return "Se requiere la firma digital del Empleado (Solicitante).";
    }

    return null;
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    const validationError = handleValidation();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const savingToast = toast.loading(
      isEditing ? "Guardando cambios…" : "Creando observación…"
    );
    try {
      const isRestriccion =
        formData.tipoNovedad === "Restricciones/Recomendaciones";
      const isPermiso = formData.tipoNovedad === "Permisos";
      const isIncapacidad = formData.tipoNovedad === "Incapacidades";
      const isLicencia = formData.tipoNovedad === "Licencias";
      const isVacaciones = formData.tipoNovedad === "Vacaciones";
      const isPrestamo = formData.tipoNovedad === "Préstamos";
      const isEstudio = formData.tipoNovedad === "Estudio";
      const isDiaFamilia = formData.tipoNovedad === "Día de la Familia";

      // 1. CREAR OBJETO DETAILS (JSONB) Y LA OBSERVACIÓN PRINCIPAL
      let specificDetails = {};
      let mainObservation = formData.observacion || "";

      if (isLicencia) {
        specificDetails = {
          sub_tipo_novedad: formData.sub_tipo_novedad,
          fecha_inicio: formData.fecha_inicio_licencia,
          fecha_termino: formData.fecha_termino_licencia,
          duracion_dias: formData.duracion_dias,
          lider_aprueba: formData.lider_aprueba,
          fecha_aprobacion: formData.fecha_aprobacion,
        };
        mainObservation = formData.motivo_licencia || "";
      } else if (isVacaciones) {
        specificDetails = {
          periodo_vacacional_ano: formData.periodo_vacacional_ano,
          fecha_inicio_vacaciones: formData.fecha_inicio_vacaciones,
          fecha_fin_vacaciones: formData.fecha_fin_vacaciones,
          fecha_regreso_vacaciones: formData.fecha_regreso_vacaciones,
        };
        mainObservation = formData.observacion || "";
      } else if (isPrestamo) {
        specificDetails = {
          monto_solicitado: formData.monto_solicitado,
          numero_cuotas: formData.numero_cuotas,
          fecha_desembolso: formData.fecha_desembolso,
          cantidad_cuota_prestamo: formData.cantidad_cuota_prestamo,
          valor_total_prestamo: formData.valor_total_prestamo,
          revisado_jefe: formData.revisado_jefe,
          aprobado_gh: formData.aprobado_gh,
          contabilizado_tesoreria: formData.contabilizado_tesoreria,
        };
        mainObservation = formData.observacion || "";
      } else if (isIncapacidad) {
        specificDetails = {
          tipoIncapacidad: formData.tipoIncapacidad,
          diasIncapacidad: formData.diasIncapacidad,
          fecha_inicio: formData.fecha_inicio_incapacidad,
          fecha_fin: formData.fecha_fin_incapacidad,
        };
        mainObservation = formData.observacion || "";
      } else if (isPermiso) {
        specificDetails = {
          fecha_inicio: formData.fecha_inicio_permiso,
          fecha_fin: formData.fecha_fin_permiso,
        };
        mainObservation = formData.observacion || "";
      } else if (isEstudio) {
        specificDetails = {
          fecha_inicio: formData.fecha_inicio_estudio,
          fecha_fin: formData.fecha_fin_estudio,
          horarioEstudio: formData.horarioEstudio,
          dias_estudio: formData.dias_estudio, // <--- AGREGADO: Guardar días específicos
        };
        mainObservation = formData.observacion || "";
      } else if (isDiaFamilia) {
        specificDetails = {
          fecha_inicio:
            formData.fecha_inicio_dia_familia ||
            formData.fecha_propuesta_dia_familia,
          fecha_fin:
            formData.fecha_fin_dia_familia ||
            formData.fecha_inicio_dia_familia ||
            formData.fecha_propuesta_dia_familia,
          fecha_propuesta_dia_familia: formData.fecha_propuesta_dia_familia,
          justificacion_dia_familia: formData.justificacion_dia_familia,
          cargo_solicitante_familia: formData.cargo_solicitante_familia,
        };
        mainObservation = formData.observacion || "";
      } else if (isRestriccion) {
        mainObservation = formData.observacion || "";
      }

      // 2. Construir Payload Base
      const payload = {
        empleado_id: selectedEmpleado.id,
        observacion: mainObservation,
        tipo_novedad: formData.tipoNovedad,
        fecha_novedad: formData.fechaNovedad,
        shouldNotify: isIncapacidad || isRestriccion,

        details: Object.keys(specificDetails).length > 0 ? specificDetails : {},

        documento_base64: null,
        file_name: null,
        documento_adjunto_existente: null,
        incapacidad_base64: null,
        incapacidad_file_name: null,
        historia_base64: null,
        historia_file_name: null,
        documento_incapacidad: fileStates.urlIncapacidadExistente,
        documento_historia_clinica: fileStates.urlHistoriaExistente,

        // FIRMAS - ALINEADO CON EL BACKEND Y LA DB
        firma_empleado_base64: formData.firmaEmpleadoBase64,
        documento_firma_empleado: formData.urlFirmaEmpleadoExistente,

        firma_lider_base64: formData.firmaLiderBase64,
        documento_firma_lider: formData.urlFirmaLiderExistente,
      };

      // 3. Lógica de Archivos (se mantiene igual)
      if (isIncapacidad) {
        payload.incapacidad_base64 = fileStates.archivoIncapacidad
          ? await toBase64(fileStates.archivoIncapacidad)
          : fileStates.urlIncapacidadExistente === null
          ? null
          : fileStates.urlIncapacidadExistente;
        payload.incapacidad_file_name =
          fileStates.archivoIncapacidad?.name || null;

        payload.historia_base64 = fileStates.archivoHistoriaClinica
          ? await toBase64(fileStates.archivoHistoriaClinica)
          : fileStates.urlHistoriaExistente === null
          ? null
          : fileStates.urlHistoriaExistente;
        payload.historia_file_name =
          fileStates.archivoHistoriaClinica?.name || null;
      } else if (isRestriccion) {
        payload.documento_base64 = fileStates.nuevoArchivoRR
          ? await toBase64(fileStates.nuevoArchivoRR)
          : fileStates.urlRRexistente === null
          ? null
          : fileStates.urlRRexistente;
        payload.file_name = fileStates.nuevoArchivoRR?.name || null;
        payload.documento_adjunto_existente = isEditing
          ? fileStates.archivoExistenteUrlOriginal
          : null;
      } else if (!isIncapacidad && !isRestriccion) {
        if (fileStates.documentoAdjunto) {
          payload.documento_base64 = await toBase64(
            fileStates.documentoAdjunto
          );
          payload.file_name = fileStates.documentoAdjunto.name;
        } else if (isEditing && fileStates.archivoExistenteUrlOriginal) {
          payload.documento_adjunto_existente =
            fileStates.archivoExistenteUrlOriginal;
        } else if (
          isEditing &&
          fileStates.documentoAdjunto === null &&
          fileStates.archivoExistenteUrl === null
        ) {
          payload.documento_base64 = null;
        }
      }

      // 4. Ejecución del API
      let response;
      if (isEditing) {
        response = await api.put(`/observaciones/${observacionId}`, payload);
      } else {
        response = await api.post("/observaciones", payload);
      }

      // 5. Actualización del historial usando la respuesta directa del backend
      const newObservation = response.data;

      if (isEditing) {
        setObservacionesHistory((prev) =>
          prev.map((o) => (o.id === observacionId ? newObservation : o))
        );
      } else {
        // Al crear, la nueva observación va primero para que se vea arriba
        setObservacionesHistory((prev) => [newObservation, ...prev]);
        setHistoryPage(1);
      }

      resetForm();
      toast.update(savingToast, {
        render: "¡Listo!",
        type: "success",
        isLoading: false,
        autoClose: 2200,
      });
    } catch (err) {
      toast.update(savingToast, {
        render:
          err.response?.data?.message || err.message || "Error al guardar",
        type: "error",
        isLoading: false,
        autoClose: 4000,
      });
    }
  };

  const handleEdit = (obs) => {
    setIsEditing(true);
    setObservacionId(obs.id);

    const details = obs.details || {};

    const isLicencia = obs.tipo_novedad === "Licencias";

    const newFormData = {
      ...initialFormData,
      observacion: obs.observacion || "",
      tipoNovedad: obs.tipo_novedad || tiposNovedad[0],

      motivo_licencia: isLicencia ? obs.observacion : "",

      // Cargar URLs de firmas existentes (para visualización) - CORREGIDO
      urlFirmaEmpleadoExistente: obs.documento_firma_empleado || null,
      firmaEmpleadoBase64: null,
      urlFirmaLiderExistente: obs.documento_firma_lider || null,
      firmaLiderBase64: null,

      archivoExistenteUrl: obs.documento_adjunto || null,
      archivoExistenteUrlOriginal: obs.documento_adjunto || null,

      tipoIncapacidad: details.tipoIncapacidad || "",
      diasIncapacidad: details.diasIncapacidad || "",
      fecha_inicio_incapacidad:
        normalizeDateInput(details.fecha_inicio) ||
        normalizeDateInput(obs.fecha_novedad),
      fecha_fin_incapacidad:
        normalizeDateInput(details.fecha_fin) ||
        normalizeDateInput(details.fecha_inicio) ||
        normalizeDateInput(obs.fecha_novedad),
      urlIncapacidadExistente: obs.documento_incapacidad || null,
      urlHistoriaExistente: obs.documento_historia_clinica || null,

      sub_tipo_novedad: details.sub_tipo_novedad || "",
      fecha_inicio_licencia: normalizeDateInput(details.fecha_inicio),
      fecha_termino_licencia: normalizeDateInput(details.fecha_termino),
      duracion_dias: details.duracion_dias || "",
      lider_aprueba: details.lider_aprueba || "",
      fecha_aprobacion: normalizeDateInput(details.fecha_aprobacion),

      periodo_vacacional_ano:
        details.periodo_vacacional_ano ||
        initialFormData.periodo_vacacional_ano,
      fecha_inicio_vacaciones: normalizeDateInput(
        details.fecha_inicio_vacaciones
      ),
      fecha_fin_vacaciones: normalizeDateInput(details.fecha_fin_vacaciones),
      fecha_regreso_vacaciones: normalizeDateInput(
        details.fecha_regreso_vacaciones
      ),

      monto_solicitado: details.monto_solicitado || "",
      numero_cuotas: details.numero_cuotas || "",
      fecha_desembolso: normalizeDateInput(details.fecha_desembolso),
      cantidad_cuota_prestamo: details.cantidad_cuota_prestamo || "",
      valor_total_prestamo: details.valor_total_prestamo || "",
      revisado_jefe: details.revisado_jefe || "",
      aprobado_gh: details.aprobado_gh || "",
      contabilizado_tesoreria: details.contabilizado_tesoreria || "",

      horarioEstudio: details.horarioEstudio || "",
      fecha_inicio_permiso:
        obs.tipo_novedad === "Permisos"
          ? normalizeDateInput(details.fecha_inicio || obs.fecha_novedad)
          : "",
      fecha_fin_permiso:
        obs.tipo_novedad === "Permisos"
          ? normalizeDateInput(
              details.fecha_fin || details.fecha_inicio || obs.fecha_novedad
            )
          : "",
      fecha_inicio_estudio:
        obs.tipo_novedad === "Estudio"
          ? normalizeDateInput(details.fecha_inicio || obs.fecha_novedad)
          : "",
      fecha_fin_estudio:
        obs.tipo_novedad === "Estudio"
          ? normalizeDateInput(
              details.fecha_fin || details.fecha_inicio || obs.fecha_novedad
            )
          : "",
      dias_estudio: details.dias_estudio || [], // <--- AGREGADO: Cargar días específicos al editar

      // Campos de Día de la Familia
      fecha_inicio_dia_familia:
        obs.tipo_novedad === "Día de la Familia"
          ? normalizeDateInput(
              details.fecha_inicio ||
                details.fecha_propuesta_dia_familia ||
                obs.fecha_novedad
            )
          : "",
      fecha_fin_dia_familia:
        obs.tipo_novedad === "Día de la Familia"
          ? normalizeDateInput(
              details.fecha_fin ||
                details.fecha_inicio ||
                details.fecha_propuesta_dia_familia ||
                obs.fecha_novedad
            )
          : "",
      fecha_propuesta_dia_familia: normalizeDateInput(
        details.fecha_propuesta_dia_familia ||
          details.fecha_inicio ||
          obs.fecha_novedad
      ),
      justificacion_dia_familia: details.justificacion_dia_familia || "",
      cargo_solicitante_familia: details.cargo_solicitante_familia || "",

      nuevoArchivoRR: null,
      urlRRexistente: obs.documento_adjunto || null,
    };

    newFormData.fechaNovedad = normalizeDateInput(obs.fecha_novedad);

    if (
      obs.tipo_novedad === "Permisos" ||
      obs.tipo_novedad === "Estudio" ||
      obs.tipo_novedad === "Incapacidades" ||
      obs.tipo_novedad === "Vacaciones" ||
      obs.tipo_novedad === "Préstamos" ||
      obs.tipo_novedad === "Restricciones/Recomendaciones"
    ) {
      newFormData.observacion = obs.observacion || "";
    }

    setFormData(newFormData);
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "¿Estás seguro?",
      text: "Esta acción eliminará la observación por completo y no se puede deshacer.",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      customClass: {
        confirmButton: "observaciones-ph-swal-confirm",
        cancelButton: "observaciones-ph-swal-cancel",
      },
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/observaciones/${id}`);
        setObservacionesHistory((prev) => prev.filter((o) => o.id !== id));
        if (isEditing && observacionId === id) resetForm();
        Swal.fire({
          icon: "success",
          title: "¡Eliminada!",
          text: "La observación ha sido eliminada con éxito.",
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (error) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo eliminar la observación.",
        });
      }
    }
  };

  const openPreview = (urlOrFile) => {
    let url = "";
    if (typeof urlOrFile === "string") {
      url = urlOrFile;
    } else {
      url = urlOrFile.preview;
    }

    if (!url) return;
    if (isPdfUrl(url)) {
      setPreviewMode("pdf");
      setPreviewUrl(url);
      setPreviewOpen(true);
    } else if (isImageUrl(url)) {
      setPreviewMode("image");
      setPreviewUrl(url);
      setPreviewOpen(true);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewUrl("");
    setPreviewMode("");
  };

  return (
    <div className="observaciones-ph-layout-container">
      <div className="observaciones-ph-seccion-superior">
        {/* CARD DE BÚSQUEDA Y SELECCIÓN */}
        <div className="observaciones-ph-search-card">
          <h2 className="observaciones-ph-search-title">
            <FaSearch /> Buscar Empleado
          </h2>
          {!selectedEmpleado && (
            <input
              type="text"
              className="observaciones-ph-form-input"
              placeholder="Cédula o Nombre"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          )}
          <AnimatePresence mode="wait">
            {!selectedEmpleado && (
              <motion.div
                key="table-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="observaciones-ph-table-wrapper"
              >
                <table className="observaciones-ph-table">
                  <thead>
                    <tr>
                      <th>Cédula</th>
                      <th>Nombre</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingEmpleados ? (
                      <tr>
                        <td colSpan="3" className="observaciones-ph-table-cell">
                          <FaSpinner className="observaciones-ph-spinner" />{" "}
                          Cargando...
                        </td>
                      </tr>
                    ) : empleados.length > 0 ? (
                      empleados.slice(0, visibleEmployees).map((emp) => (
                        <tr key={emp.id}>
                          <td className="observaciones-ph-table-cell">
                            {emp.cedula}
                          </td>
                          <td className="observaciones-ph-table-cell">
                            {emp.nombre_completo}
                          </td>
                          <td className="observaciones-ph-table-cell">
                            <button
                              className="observaciones-ph-btn-action"
                              onClick={() => {
                                setSelectedEmpleado(emp);
                                resetForm();
                              }}
                            >
                              Seleccionar
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className="observaciones-ph-table-cell">
                          No hay empleados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {empleados.length > visibleEmployees && (
                  <button
                    className="observaciones-ph-btn-action"
                    style={{ width: "100%", marginTop: "1rem" }}
                    onClick={() => setVisibleEmployees((v) => v + 10)}
                  >
                    <FaChevronDown /> Cargar más
                  </button>
                )}
              </motion.div>
            )}
            {selectedEmpleado && (
              <motion.div
                key="selected-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="observaciones-ph-selected-empleado"
              >
                <FaUser />
                <span>
                  Empleado: <b>{selectedEmpleado.nombre_completo}</b> (
                  {selectedEmpleado.cedula})
                </span>
                <button
                  className="observaciones-ph-btn-action"
                  style={{ marginLeft: "auto" }}
                  onClick={() => {
                    setSelectedEmpleado(null);
                    resetForm();
                  }}
                >
                  <FaUndo /> Cambiar
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* CARD DE CREACIÓN/EDICIÓN */}
        {selectedEmpleado && (
          <motion.div
            key="create-observation"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="observaciones-ph-search-card"
          >
            <h2 className="observaciones-ph-search-title">
              <FaClipboardList />{" "}
              {isEditing ? "Editar Observación" : "Crear Observación"}
            </h2>
            <form
              onSubmit={handleCreateOrUpdate}
              className="observaciones-ph-form"
            >
              {/* CAMPOS BASE */}
              <div className="observaciones-ph-form-row">
                <div className="observaciones-ph-form-group">
                  <label htmlFor="tipoNovedad">Tipo de Novedad</label>
                  <select
                    id="tipoNovedad"
                    className="observaciones-ph-form-input"
                    value={formData.tipoNovedad}
                    onChange={(e) =>
                      updateFormData("tipoNovedad", e.target.value)
                    }
                    required
                  >
                    {tiposNovedad.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="observaciones-ph-form-group">
                  <label htmlFor="fechaNovedad">Fecha de Novedad</label>
                  <input
                    type="date"
                    id="fechaNovedad"
                    className="observaciones-ph-form-input"
                    value={formData.fechaNovedad}
                    onChange={(e) =>
                      updateFormData("fechaNovedad", e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              {/* ZONA DE NOVEDADES ESPECÍFICAS (EL SWITCH) */}
              <div className="observaciones-ph-novedad-specific-area">
                <NovedadForm
                  tipoNovedad={formData.tipoNovedad}
                  formData={formData}
                  updateFormData={updateFormData}
                  fileDropzoneProps={{
                    getRootPropsGeneral,
                    getInputPropsGeneral,
                    isDragActiveGeneral,
                    getRootPropsIncap,
                    getInputPropsIncap,
                    isDragActiveIncap,
                    getRootPropsHistoria,
                    getInputPropsHistoria,
                    isDragActiveHistoria,
                    getRootPropsRR,
                    getInputPropsRR,
                    isDragActiveRR,
                  }}
                  fileStates={fileStates}
                  isEditing={isEditing}
                  openPreview={openPreview}
                />
              </div>

              {/* FIRMA DE EMPLEADO (OBLIGATORIA) */}
              <SignatureInput
                label="Firma del Empleado"
                name="firmaEmpleadoBase64"
                value={formData.firmaEmpleadoBase64}
                urlExistente={formData.urlFirmaEmpleadoExistente}
                updateFormData={updateFormData}
                isRequired={true}
                openPreview={openPreview}
              />

              {/* FIRMA DE LÍDER  */}
              <SignatureInput
                label="Firma del Líder/Aprobador"
                name="firmaLiderBase64"
                value={formData.firmaLiderBase64}
                urlExistente={formData.urlFirmaLiderExistente}
                updateFormData={updateFormData}
                isRequired={true}
                openPreview={openPreview}
              />

              {/* ACCIONES */}
              <div className="observaciones-ph-form-actions observaciones-ph-form-span-full">
                <button
                  type="submit"
                  className={`observaciones-ph-btn-action ${
                    isEditing ? "" : "primary"
                  }`}
                  style={{ flex: 1 }}
                >
                  {isEditing ? (
                    <>
                      <FaSave /> Guardar Cambios
                    </>
                  ) : (
                    <>
                      <FaPlus /> Crear Observación
                    </>
                  )}
                </button>
                {isEditing && (
                  <button
                    type="button"
                    className="observaciones-ph-btn-action"
                    onClick={resetForm}
                  >
                    <FaUndo /> Cancelar
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        )}
      </div>

      {/* SECCIÓN INFERIOR: HISTORIAL */}
      <div className="observaciones-ph-seccion-inferior">
        <h2 className="observaciones-ph-search-title">
          <FaHistory /> Historial de Observaciones
        </h2>
        <AnimatePresence mode="wait">
          {loadingHistory ? (
            <motion.div
              key="loading-history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="observaciones-ph-message"
            >
              <FaSpinner className="observaciones-ph-spinner" /> Cargando
              historial...
            </motion.div>
          ) : observacionesHistory.length > 0 ? (
            <motion.div
              key="history-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {paginatedHistory.map((o) => {
                const details = o.details || {};

                return (
                  <motion.div
                    key={o.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`observaciones-ph-history-card ${
                      !o.revisada ? "not-reviewed" : ""
                    }`}
                  >
                    <div className="observaciones-ph-history-card-header">
                      <span className="observaciones-ph-history-date">
                        {formatFecha(o.fecha_novedad)}
                      </span>
                      {o.revisada ? (
                        <span className="historial-general-observacion-revisada-badge">
                          Revisada
                        </span>
                      ) : (
                        <span className="historial-general-observacion-norevisada-badge">
                          Pendiente
                        </span>
                      )}
                      <span className="observaciones-ph-history-type">
                        {o.tipo_novedad}
                      </span>
                    </div>
                    <div className="observaciones-ph-history-summary">
                      {/* Mostrar observación general solo si no es un tipo con "Motivo" específico */}
                      {o.tipo_novedad !== "Licencias" &&
                        o.tipo_novedad !== "Préstamos" &&
                        o.tipo_novedad !== "Permisos" &&
                        o.tipo_novedad !== "Estudio" &&
                        o.tipo_novedad !== "Día de la Familia" &&
                        o.observacion && (
                          <p style={{ marginBottom: "0.5rem" }}>
                            {o.observacion}
                          </p>
                        )}

                      {/* DETALLES DE LICENCIAS */}
                      {o.tipo_novedad === "Licencias" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          <p>
                            <strong>Tipo:</strong> {details.sub_tipo_novedad}
                          </p>
                          <p>
                            <strong>Duración:</strong>{" "}
                            {details.duracion_dias || "0"} días
                          </p>
                          <p>
                            <strong>Periodo:</strong>{" "}
                            {formatFecha(details.fecha_inicio)} al{" "}
                            {formatFecha(details.fecha_termino)}
                          </p>
                          <p>
                            <strong>Motivo (Descripción):</strong>{" "}
                            {o.observacion || "N/A"}
                          </p>
                          <p>
                            <strong>Aprobación:</strong>{" "}
                            {details.lider_aprueba || "N/A"} -{" "}
                            {details.fecha_aprobacion
                              ? formatFecha(details.fecha_aprobacion)
                              : "Pendiente"}
                          </p>
                        </div>
                      )}

                      {/* DETALLES DE OTROS TIPOS DE NOVEDAD */}
                      {o.tipo_novedad === "Préstamos" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          <p>
                            <strong>Monto:</strong>{" "}
                            {formatCurrency(details.monto_solicitado)}
                          </p>
                          <p>
                            <strong>Cuotas:</strong> {details.numero_cuotas}
                          </p>
                          <p>
                            <strong>Motivo:</strong> {o.observacion || "N/A"}
                          </p>
                        </div>
                      )}
                      {o.tipo_novedad === "Vacaciones" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          <p>
                            <strong>Periodo:</strong>{" "}
                            {details.periodo_vacacional_ano}
                          </p>
                          <p>
                            <strong>Fechas:</strong>{" "}
                            {formatFecha(details.fecha_inicio_vacaciones)} al{" "}
                            {formatFecha(details.fecha_fin_vacaciones)}
                          </p>
                          <p>
                            <strong>Regreso:</strong>{" "}
                            {formatFecha(details.fecha_regreso_vacaciones)}
                          </p>
                        </div>
                      )}
                      {o.tipo_novedad === "Incapacidades" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          <p>
                            <strong>Tipo:</strong> {details.tipoIncapacidad}
                          </p>
                          {details.fecha_inicio && (
                            <p>
                              <strong>Periodo:</strong>{" "}
                              {formatFecha(details.fecha_inicio)}
                              {details.fecha_fin
                                ? ` al ${formatFecha(details.fecha_fin)}`
                                : ""}
                            </p>
                          )}
                          {details.diasIncapacidad && (
                            <p>
                              <strong>Duración:</strong>{" "}
                              {details.diasIncapacidad}
                            </p>
                          )}
                        </div>
                      )}
                      {o.tipo_novedad === "Estudio" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          <p>
                            <strong>Horario:</strong> {details.horarioEstudio}
                          </p>
                          {details.fecha_inicio && (
                            <p>
                              <strong>Periodo:</strong>{" "}
                              {formatFecha(details.fecha_inicio)} al{" "}
                              {formatFecha(
                                details.fecha_fin || details.fecha_inicio
                              )}
                            </p>
                          )}
                          {o.observacion && (
                            <p>
                              <strong>Descripción:</strong> {o.observacion}
                            </p>
                          )}
                        </div>
                      )}
                      {o.tipo_novedad === "Permisos" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          {details.fecha_inicio && (
                            <p>
                              <strong>Periodo:</strong>{" "}
                              {formatFecha(details.fecha_inicio)} al{" "}
                              {formatFecha(
                                details.fecha_fin || details.fecha_inicio
                              )}
                            </p>
                          )}
                          {o.observacion && (
                            <p>
                              <strong>Motivo:</strong> {o.observacion}
                            </p>
                          )}
                        </div>
                      )}
                      {o.tipo_novedad === "Día de la Familia" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          {details.fecha_inicio && (
                            <p>
                              <strong>Periodo solicitado:</strong>{" "}
                              {formatFecha(details.fecha_inicio)} al{" "}
                              {formatFecha(
                                details.fecha_fin || details.fecha_inicio
                              )}
                            </p>
                          )}
                          {details.fecha_propuesta_dia_familia && (
                            <p>
                              <strong>Fecha alternativa propuesta:</strong>{" "}
                              {formatFecha(details.fecha_propuesta_dia_familia)}
                            </p>
                          )}
                          {details.justificacion_dia_familia && (
                            <p>
                              <strong>Justificación:</strong>{" "}
                              {details.justificacion_dia_familia}
                            </p>
                          )}
                          {details.cargo_solicitante_familia && (
                            <p>
                              <strong>Cargo del solicitante:</strong>{" "}
                              {details.cargo_solicitante_familia}
                            </p>
                          )}
                          {o.observacion && (
                            <p>
                              <strong>Observaciones:</strong> {o.observacion}
                            </p>
                          )}
                        </div>
                      )}
                      {/* DETALLES DE DÍA DE LA FAMILIA */}
                      {o.tipo_novedad === "Día de la Familia" && (
                        <div
                          className="observaciones-ph-details-group"
                          style={{
                            fontSize: "0.9rem",
                            color: "#334155",
                            marginTop: "0.5rem",
                          }}
                        >
                          {details.fecha_propuesta_dia_familia && (
                            <p>
                              <strong>
                                Fecha Propuesta para el Día de la Familia:
                              </strong>{" "}
                              {formatFecha(details.fecha_propuesta_dia_familia)}
                            </p>
                          )}
                          {details.cargo_solicitante_familia && (
                            <p>
                              <strong>Cargo del Solicitante:</strong>{" "}
                              {details.cargo_solicitante_familia}
                            </p>
                          )}
                          {details.justificacion_dia_familia && (
                            <p>
                              <strong>Justificación:</strong>{" "}
                              {details.justificacion_dia_familia}
                            </p>
                          )}
                          {o.observacion && (
                            <p>
                              <strong>Observaciones Adicionales:</strong>{" "}
                              {o.observacion}
                            </p>
                          )}
                        </div>
                      )}

                      {/* SECCIÓN DE FIRMAS Y ADJUNTOS */}
                      <div
                        className="observaciones-ph-details-group"
                        style={{ marginTop: "1rem" }}
                      >
                        <strong
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "0.9rem",
                            color: "#334155",
                          }}
                        >
                          Firmas y Adjuntos:
                        </strong>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                          }}
                        >
                          {/* Firma Empleado - CORREGIDO */}
                          {o.documento_firma_empleado && (
                            <FileAttachmentChip
                              url={o.documento_firma_empleado}
                              label="Firma Empleado"
                              openPreview={openPreview}
                            />
                          )}
                          {/* Firma Líder - CORREGIDO */}
                          {o.documento_firma_lider && (
                            <FileAttachmentChip
                              url={o.documento_firma_lider}
                              label="Firma Líder"
                              openPreview={openPreview}
                            />
                          )}
                          {/* Otros Documentos */}
                          {o.documento_adjunto && (
                            <FileAttachmentChip
                              url={o.documento_adjunto}
                              label={
                                o.tipo_novedad ===
                                "Restricciones/Recomendaciones"
                                  ? "Documento RR"
                                  : "Documento General"
                              }
                              openPreview={openPreview}
                            />
                          )}
                          {o.documento_incapacidad && (
                            <FileAttachmentChip
                              url={o.documento_incapacidad}
                              label="Incapacidad Médica"
                              openPreview={openPreview}
                            />
                          )}
                          {o.documento_historia_clinica && (
                            <FileAttachmentChip
                              url={o.documento_historia_clinica}
                              label="Historia Clínica"
                              openPreview={openPreview}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="observaciones-ph-history-actions">
                      <button
                        className="observaciones-ph-btn-action"
                        onClick={() => handleEdit(o)}
                      >
                        <FaPencilAlt /> Editar
                      </button>
                      <button
                        className="observaciones-ph-btn-action observaciones-ph-btn-danger"
                        onClick={() => handleDelete(o.id)}
                      >
                        <FaTrashAlt /> Eliminar
                      </button>
                    </div>
                  </motion.div>
                );
              })}
              {totalHistoryPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "1.5rem",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="observaciones-ph-btn-action"
                    onClick={() =>
                      setHistoryPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={safeHistoryPage === 1}
                  >
                    <FaChevronDown style={{ transform: "rotate(90deg)" }} />
                    Anterior
                  </button>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--obs-ph-text-secondary)",
                    }}
                  >
                    Página {safeHistoryPage} de {totalHistoryPages}
                  </span>
                  <button
                    type="button"
                    className="observaciones-ph-btn-action"
                    onClick={() =>
                      setHistoryPage((prev) =>
                        Math.min(totalHistoryPages, prev + 1)
                      )
                    }
                    disabled={safeHistoryPage === totalHistoryPages}
                  >
                    Siguiente
                    <FaChevronDown style={{ transform: "rotate(-90deg)" }} />
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty-history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="observaciones-ph-message"
            >
              <FaTimes /> Sin observaciones.
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MODAL DE VISTA PREVIA (Se mantiene) */}
      <AnimatePresence>
        {previewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="observaciones-ph-modal-overlay"
            onClick={(e) => {
              if (e.target.classList.contains("observaciones-ph-modal-overlay"))
                closePreview();
            }}
            aria-modal="true"
            role="dialog"
          >
            <motion.div
              initial={{ scale: 0.98, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: 10 }}
              className="observaciones-ph-modal-content"
            >
              <div className="observaciones-ph-modal-header">
                <h4>Vista previa</h4>
                <button
                  className="observaciones-ph-modal-close"
                  onClick={closePreview}
                  aria-label="Cerrar vista previa"
                >
                  <FaTimes />
                </button>
              </div>
              <div className="observaciones-ph-modal-body">
                {previewMode === "image" && (
                  <img
                    src={previewUrl}
                    alt="vista previa"
                    className="observaciones-ph-modal-image"
                  />
                )}
                {previewMode === "pdf" && (
                  <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                    <div className="observaciones-ph-modal-pdf">
                      <Viewer
                        fileUrl={previewUrl}
                        plugins={[defaultLayoutPluginInstance]}
                      />
                    </div>
                  </Worker>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ObservacionesPH;
