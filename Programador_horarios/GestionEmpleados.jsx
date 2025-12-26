import React, { useState, useEffect } from "react";
import {
  FaUser,
  FaPlus,
  FaFileUpload,
  FaSpinner,
  FaTimes,
  FaToggleOn,
  FaToggleOff,
  FaChevronDown,
  FaUndo,
  FaFileCsv,
} from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { toast } from "react-hot-toast";
import { api } from "../../services/apiHorarios";
import "./ObservacionesPH.css"; // Reutilizamos estilos

// --- COMPONENTE FormularioEmpleado ---
const FormularioEmpleado = ({ onEmpleadoCreado, onCancel }) => {
  const [cedula, setCedula] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [correo, setCorreo] = useState("");
  const [fechaContratacion, setFechaContratacion] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [saving, setSaving] = useState(false);

  const sedesDisponibles = [
    "LA 10 GIRARDOTA",
    "BARBOSA",
    "PARQUE GIRARDOTA",
    "LOTE",
    "ANDAMIOS GIRARDOTA",
    "MERKAHORRO",
    "LA CEBRA GIRARDOTA",
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cedula || !nombreCompleto || !sedeId) {
      toast.error("Cédula, Nombre y Sede son obligatorios.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/empleados", {
        cedula,
        nombre_completo: nombreCompleto,
        correo,
        fecha_contratacion: fechaContratacion || null,
        sede_id: sedeId,
        estado: "activo",
      });
      toast.success("Empleado creado exitosamente.");
      onEmpleadoCreado();
    } catch (err) {
      toast.error(
        "Error al crear empleado: " +
          (err.response?.data?.message || err.message)
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="observaciones-ph-search-card"
    >
      <h3 className="observaciones-ph-search-title">
        <FaPlus /> Nuevo Empleado
      </h3>
      <form onSubmit={handleSubmit}>
        <div className="observaciones-ph-form-group">
          <label htmlFor="cedula">Cédula *</label>
          <input
            type="text"
            id="cedula"
            className="observaciones-ph-form-input"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            required
          />
        </div>
        <div className="observaciones-ph-form-group">
          <label htmlFor="nombreCompleto">Nombre Completo *</label>
          <input
            type="text"
            id="nombreCompleto"
            className="observaciones-ph-form-input"
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
            required
          />
        </div>
        <div className="observaciones-ph-form-group">
          <label htmlFor="correo">Correo Electrónico</label>
          <input
            type="email"
            id="correo"
            className="observaciones-ph-form-input"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </div>
        <div className="observaciones-ph-form-group">
          <label htmlFor="fechaContratacion">Fecha de Contratación</label>
          <input
            type="date"
            id="fechaContratacion"
            className="observaciones-ph-form-input"
            value={fechaContratacion}
            onChange={(e) => setFechaContratacion(e.target.value)}
          />
        </div>
        <div className="observaciones-ph-form-group">
          <label htmlFor="sedeId">Sede *</label>
          <select
            id="sedeId"
            className="observaciones-ph-form-input"
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            required
          >
            <option value="">Seleccionar sede...</option>
            {sedesDisponibles.map((sede) => (
              <option key={sede} value={sede}>
                {sede}
              </option>
            ))}
          </select>
        </div>
        <div className="observaciones-ph-form-actions">
          <button
            type="submit"
            className="observaciones-ph-btn-action primary"
            disabled={saving}
          >
            {saving ? (
              <FaSpinner className="observaciones-ph-spinner" />
            ) : (
              <FaPlus />
            )}{" "}
            Crear
          </button>
          <button
            type="button"
            className="observaciones-ph-btn-action observaciones-ph-btn-danger"
            onClick={onCancel}
          >
            <FaUndo /> Cancelar
          </button>
        </div>
      </form>
    </motion.div>
  );
};

// --- COMPONENTE GestionEmpleados ACTUALIZADO ---
const GestionEmpleados = () => {
  const [allEmpleados, setAllEmpleados] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleEmployees, setVisibleEmployees] = useState(20);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Reusamos la lógica de `useDropzone` de ObservacionesPH para una experiencia de usuario más intuitiva
  const onDrop = ([acceptedFile]) => {
    setFile(acceptedFile);
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    multiple: false,
  });

  const fetchEmpleados = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/empleados");
      if (Array.isArray(data)) {
        setAllEmpleados(data);
        setEmpleados(data);
      } else {
        throw new Error("La respuesta de la API no es un array.");
      }
    } catch (err) {
      toast.error(
        "Error al cargar empleados: " +
          (err.message || err.response?.data?.message)
      );
      setAllEmpleados([]);
      setEmpleados([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmpleados();
  }, []);

  useEffect(() => {
    const filtered = Array.isArray(allEmpleados)
      ? allEmpleados.filter(
          (emp) =>
            emp.cedula?.includes(searchQuery) ||
            emp.nombre_completo
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase())
        )
      : [];
    setEmpleados(filtered);
    setVisibleEmployees(20);
  }, [searchQuery, allEmpleados]);

  const handleToggleEstado = async (empleado) => {
    const nuevoEstado = empleado.estado === "activo" ? "inactivo" : "activo";
    try {
      await api.patch(`/empleados/${empleado.id}`, { estado: nuevoEstado });
      toast.success(
        `Empleado ${empleado.nombre_completo} ha sido ${
          nuevoEstado === "activo" ? "activado" : "desactivado"
        }.`
      );
      setAllEmpleados((prev) =>
        prev.map((emp) =>
          emp.id === empleado.id ? { ...emp, estado: nuevoEstado } : emp
        )
      );
    } catch (err) {
      toast.error(
        "Error al actualizar el estado: " +
          (err.response?.data?.message || err.message)
      );
    }
  };

  const handleFileUpload = async () => {
    if (!file) {
      toast.error("Por favor, selecciona un archivo CSV/Excel.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/empleados/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      toast.success(
        `Archivo procesado. Nuevos empleados creados: ${data.nuevos}, Actualizados: ${data.actualizados}.`
      );
      setFile(null);
      setShowUploadForm(false);
      fetchEmpleados();
    } catch (err) {
      toast.error(
        "Error al subir el archivo: " +
          (err.response?.data?.message || err.message)
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="observaciones-ph-layout-container">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="observaciones-ph-search-card"
      >
        <h2 className="observaciones-ph-search-title">
          <FaUser /> Opciones de Empleados
        </h2>
        <div
          className="observaciones-ph-form-actions"
          style={{ flexDirection: "column" }}
        >
          <button
            className="observaciones-ph-btn-action primary"
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setShowUploadForm(false);
            }}
          >
            <FaPlus /> Crear Empleado Manualmente
          </button>
          <button
            className="observaciones-ph-btn-action"
            onClick={() => {
              setShowUploadForm(!showUploadForm);
              setShowCreateForm(false);
            }}
            style={{ marginTop: "1rem" }}
          >
            <FaFileUpload /> Subir Archivo CSV/Excel
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showCreateForm && (
          <FormularioEmpleado
            onEmpleadoCreado={() => {
              setShowCreateForm(false);
              fetchEmpleados();
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}
        {showUploadForm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="observaciones-ph-search-card"
          >
            <h3 className="observaciones-ph-search-title">
              <FaFileCsv /> Carga Masiva
            </h3>
            <div className="observaciones-ph-form-group">
              <label className="observaciones-ph-file-label">
                Archivo de Carga
              </label>
              <div
                {...getRootProps()}
                className={`observaciones-ph-dropzone ${
                  isDragActive ? "observaciones-ph-dropzone-active" : ""
                } ${file ? "observaciones-ph-dropzone-has-file" : ""}`}
              >
                <input {...getInputProps()} />
                {file ? (
                  <div className="observaciones-ph-file-chip">
                    <FaFileCsv />
                    <span className="observaciones-ph-file-chip-name">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      className="observaciones-ph-btn-action observaciones-ph-btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      <FaTimes /> Quitar
                    </button>
                  </div>
                ) : (
                  <div className="observaciones-ph-dropzone-inner">
                    <div className="observaciones-ph-dropzone-icon">
                      <FaFileUpload />
                    </div>
                    <div className="observaciones-ph-dropzone-text">
                      <p className="observaciones-ph-dropzone-title">
                        Arrastra y suelta tu archivo aquí
                      </p>
                      <p className="observaciones-ph-dropzone-subtitle">
                        o <b>haz clic</b> para seleccionar
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <button
              className="observaciones-ph-btn-action primary"
              onClick={handleFileUpload}
              disabled={!file || uploading}
              style={{ width: "100%", marginTop: "1rem" }}
            >
              {uploading ? (
                <FaSpinner className="observaciones-ph-spinner" />
              ) : (
                <FaFileUpload />
              )}
              {uploading ? "Cargando..." : "Subir y Procesar"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="observaciones-ph-search-card"
      >
        <h2 className="observaciones-ph-search-title">
          <FaUser /> Listado de Empleados
        </h2>
        <input
          type="text"
          className="observaciones-ph-form-input"
          placeholder="Buscar por Cédula o Nombre"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div
          className="observaciones-ph-table-wrapper"
          style={{ marginTop: "1rem" }}
        >
          <table className="observaciones-ph-table">
            <thead>
              <tr>
                <th style={{ width: "15%", textAlign: "left" }}>Cédula</th>
                <th style={{ width: "45%", textAlign: "left" }}>Nombre</th>
                <th style={{ width: "20%", textAlign: "center" }}>Estado</th>
                <th style={{ width: "20%", textAlign: "center" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="observaciones-ph-table-cell">
                    <FaSpinner className="observaciones-ph-spinner" />{" "}
                    Cargando...
                  </td>
                </tr>
              ) : Array.isArray(empleados) && empleados.length > 0 ? (
                empleados.slice(0, visibleEmployees).map((emp) => (
                  <tr key={emp.id}>
                    <td
                      className="observaciones-ph-table-cell"
                      style={{ textAlign: "left" }}
                    >
                      {emp.cedula}
                    </td>
                    <td
                      className="observaciones-ph-table-cell"
                      style={{ textAlign: "left" }}
                    >
                      {emp.nombre_completo}
                    </td>
                    <td
                      className="observaciones-ph-table-cell"
                      style={{ textAlign: "center" }}
                    >
                      <span
                        className="observaciones-ph-chip"
                        style={{
                          background:
                            emp.estado === "activo" ? "#d1fae5" : "#f1f5f9",
                          color:
                            emp.estado === "activo" ? "#065f46" : "#475569",
                          borderColor:
                            emp.estado === "activo" ? "#10b981" : "#cbd5e1",
                        }}
                      >
                        {emp.estado}
                      </span>
                    </td>
                    <td
                      className="observaciones-ph-table-cell"
                      style={{ textAlign: "center" }}
                    >
                      <button
                        className="observaciones-ph-btn-action"
                        onClick={() => handleToggleEstado(emp)}
                      >
                        {emp.estado === "activo" ? (
                          <FaToggleOn style={{ color: "#10b981" }} />
                        ) : (
                          <FaToggleOff style={{ color: "#64748b" }} />
                        )}
                        {emp.estado === "activo" ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="observaciones-ph-table-cell">
                    <FaTimes /> No hay empleados que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {Array.isArray(empleados) && empleados.length > visibleEmployees && (
          <button
            className="observaciones-ph-btn-action primary"
            style={{ width: "100%", marginTop: "1rem" }}
            onClick={() => setVisibleEmployees((v) => v + 20)}
          >
            <FaChevronDown /> Cargar más
          </button>
        )}
      </motion.div>
    </div>
  );
};
export default GestionEmpleados;
