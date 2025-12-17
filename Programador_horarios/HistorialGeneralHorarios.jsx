import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUser,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaCalendarCheck,
  FaChevronDown,
  FaChevronUp,
  FaCircle,
  FaClock,
  FaUtensils,
  FaCoffee,
  FaInfoCircle,
  FaClipboardList,
  FaHistory,
  FaPaperclip,
  FaEye,
  FaCheckCircle,
  FaCalendarAlt,
  FaFilter,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { api } from "../../services/apiHorarios";
import { supabase } from "../../supabaseClient";
import { Worker, Viewer } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import "./HistorialGeneralHorarios.css";
import Swal from "sweetalert2";

const isPdfUrl = (url = "") => url.toLowerCase().endsWith(".pdf");
const isImageUrl = (url = "") => /\.(png|jpg|jpeg|webp|gif)$/i.test(url);
const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const normalized =
    typeof value === "string" ? value.replace(/,/g, ".").trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtHM = (date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;

const formatHoursAndMinutes = (totalHours) => {
  if (totalHours === 0) return "0h";
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  let result = "";
  if (hours > 0) result += `${hours}h`;
  if (minutes > 0) result += ` ${minutes}min`;
  return result.trim();
};

const fmtFechaLarga = (fecha) => {
  if (!fecha) return "";
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-CO", {
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

const getWeekCreatorLabel = (week) => {
  if (!week) return "Sin registrar";
  const candidates = [
    week.creado_por_nombre,
    week.creado_por,
    week.creado_por_email,
    week.created_by_name,
    week.created_by,
    week.created_by_email,
    week.usuario_creador,
  ];
  const match = candidates.find((entry) =>
    entry && String(entry).trim().length > 0 ? entry : null
  );
  return match ? String(match).trim() : "Sin registrar";
};

const addBreaksToBlocks = (blocks, descripcion) => {
  if (!blocks || blocks.length === 0) return [];
  const sortedBlocks = blocks
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const finalBlocks = [];
  let prevEnd = null;
  sortedBlocks.forEach((block, index) => {
    if (prevEnd) {
      const diffMinutes = (new Date(block.start) - prevEnd) / 60000;
      if (diffMinutes === 15) {
        finalBlocks.push({
          start: fmtHM(prevEnd),
          end: fmtHM(new Date(prevEnd.getTime() + 15 * 60000)),
          type: "break",
          desc: "Desayuno",
        });
      } else if (diffMinutes === 45) {
        finalBlocks.push({
          start: fmtHM(prevEnd),
          end: fmtHM(new Date(prevEnd.getTime() + 45 * 60000)),
          type: "break",
          desc: "Almuerzo",
        });
      }
    }
    let endHour = block.end;
    if (descripcion === "Sábado" && index === sortedBlocks.length - 1) {
      endHour = `${block.end.slice(0, 11)}15:00:00`;
    }
    finalBlocks.push({
      start: fmtHM(new Date(block.start)),
      end: fmtHM(new Date(endHour)),
      type: "work",
      hours: block.hours,
    });
    prevEnd = new Date(block.end);
  });
  return finalBlocks;
};

const HistorialGeneralHorarios = () => {
  const [allEmpleados, setAllEmpleados] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmpleado, setSelectedEmpleado] = useState(null);
  const [loadingEmpleados, setLoadingEmpleados] = useState(true);
  const [visibleEmployees, setVisibleEmployees] = useState(10);
  const [activeTab, setActiveTab] = useState("horarios");
  const [employeeStats, setEmployeeStats] = useState({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [horarios, setHorarios] = useState([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [openWeek, setOpenWeek] = useState(null);
  const [observacionesHistory, setObservacionesHistory] = useState([]);
  const [loadingObservaciones, setLoadingObservaciones] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMode, setPreviewMode] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [isHR, setIsHR] = useState(false);

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  useEffect(() => {
    const checkPerms = async () => {
      try {
        const { data } = await api.get("/observaciones/permissions");
        setIsHR(data.canApprove);
      } catch (e) {
        console.error("Error checking permissions", e);
        setIsHR(false);
      }
    };
    checkPerms();
  }, []);

  const fetchEmpleados = async () => {
    try {
      // Usamos la API del backend para obtener TODOS los empleados, ignorando RLS
      const { data } = await api.get(
        "/empleados?select=id,cedula,nombre_completo,estado"
      );
      setAllEmpleados(data || []);
      setEmpleados(data || []);
    } catch (err) {
      toast.error(`Error al cargar empleados: ${err.message}`);
    } finally {
      setLoadingEmpleados(false);
    }
  };

  const fetchEmployeeStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const { data } = await api.post("/observaciones/stats");
      const statsMap = {};
      (data || []).forEach((stat) => {
        statsMap[stat.empleado_id] = {
          total_observaciones: stat.total_observaciones || 0,
          observaciones_no_revisadas: stat.observaciones_no_revisadas || 0,
          ultima_observacion: stat.ultima_observacion || null,
          tipos_novedades: stat.tipos_novedades || [],
        };
      });
      setEmployeeStats(statsMap);
    } catch (err) {
      console.error("Error al cargar estadísticas:", err);
      setEmployeeStats({});
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchObservaciones = useCallback(async () => {
    if (!selectedEmpleado) {
      setObservacionesHistory([]);
      return;
    }
    setLoadingObservaciones(true);
    try {
      const { data } = await api.get(`/observaciones/${selectedEmpleado.id}`);
      setObservacionesHistory(data || []);
    } catch (err) {
      console.error("Error al cargar observaciones:", err);
      toast.error(
        "Error al cargar historial: " +
          (err.response?.data?.message || err.message)
      );
      setObservacionesHistory([]);
    } finally {
      setLoadingObservaciones(false);
    }
  }, [selectedEmpleado]);

  useEffect(() => {
    fetchEmpleados();
  }, []);

  useEffect(() => {
    if (allEmpleados.length > 0) {
      fetchEmployeeStats();
    }
  }, [allEmpleados, fetchEmployeeStats]);

  useEffect(() => {
    let filtered = allEmpleados.filter(
      (emp) =>
        (emp.cedula || "").includes(searchQuery) ||
        (emp.nombre_completo || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
    );

    if (filterType !== "all") {
      filtered = filtered.filter((emp) => {
        const stats = employeeStats[emp.id];
        if (!stats) return filterType === "without-observations";

        const hasIncapacidad = stats.tipos_novedades.includes("Incapacidades");

        switch (filterType) {
          case "with-observations":
            return stats.total_observaciones > 0;
          case "without-observations":
            return stats.total_observaciones === 0;
          case "pending-review":
            return (stats.observaciones_no_revisadas || 0) > 0;
          case "has-incapacidades":
            return hasIncapacidad;
          default:
            return true;
        }
      });
    }

    filtered.sort((a, b) => {
      const statsA = employeeStats[a.id] || {};
      const statsB = employeeStats[b.id] || {};

      if (
        statsA.observaciones_no_revisadas !== statsB.observaciones_no_revisadas
      ) {
        return (
          (statsB.observaciones_no_revisadas || 0) -
          (statsA.observaciones_no_revisadas || 0)
        );
      }
      if (statsA.total_observaciones !== statsB.total_observaciones) {
        return (
          (statsB.total_observaciones || 0) - (statsA.total_observaciones || 0)
        );
      }
      return a.nombre_completo.localeCompare(b.nombre_completo);
    });

    setEmpleados(filtered);
    setVisibleEmployees(10);
  }, [searchQuery, allEmpleados, employeeStats, filterType]);

  useEffect(() => {
    const fetchHorarios = async () => {
      if (!selectedEmpleado) {
        setHorarios([]);
        return;
      }
      setLoadingHorarios(true);
      try {
        const { data } = await api.get(
          `/horarios/${selectedEmpleado.id}/completo`
        );
        const sorted = (data || []).map((h) => ({
          ...h,
          dias: (h.dias || [])
            .slice()
            .sort((a, b) => a.fecha.localeCompare(b.fecha)),
        }));
        setHorarios(sorted);
      } catch (err) {
        console.error("Error al cargar horarios:", err);
        setHorarios([]);
      } finally {
        setLoadingHorarios(false);
      }
    };
    fetchHorarios();
  }, [selectedEmpleado]);

  useEffect(() => {
    fetchObservaciones();
  }, [selectedEmpleado, fetchObservaciones]);

  const normalizedRange = useMemo(() => {
    const from = dateRange.from || "";
    const to = dateRange.to || "";
    if (from && to && from > to) {
      return { from: to, to: from };
    }
    return { from, to };
  }, [dateRange]);

  const isRangeActive = Boolean(normalizedRange.from || normalizedRange.to);

  const filteredHorarios = useMemo(() => {
    if (!isRangeActive) return horarios;
    const { from, to } = normalizedRange;

    return horarios
      .map((week) => {
        const diasFiltrados = (week.dias || []).filter((dia) => {
          const fecha = dia.fecha || "";
          if (from && fecha < from) return false;
          if (to && fecha > to) return false;
          return true;
        });

        if (diasFiltrados.length === 0) {
          return null;
        }

        const totalHorasSemana = diasFiltrados.reduce(
          (sum, dia) =>
            sum + toNumber(dia.horas_base) + toNumber(dia.horas_extra),
          0
        );

        return {
          ...week,
          dias: diasFiltrados,
          total_horas_semana: totalHorasSemana,
        };
      })
      .filter(Boolean);
  }, [horarios, isRangeActive, normalizedRange]);

  const filterSummary = useMemo(() => {
    if (!isRangeActive) return null;

    const totalWeeks = filteredHorarios.length;
    const totalDays = filteredHorarios.reduce(
      (sum, week) => sum + (week.dias?.length || 0),
      0
    );

    const fromLabel = normalizedRange.from
      ? `desde ${fmtFechaLarga(normalizedRange.from)}`
      : "";
    const toLabel = normalizedRange.to
      ? `${normalizedRange.from ? "hasta" : "Hasta"} ${fmtFechaLarga(
          normalizedRange.to
        )}`
      : "";
    const label = [fromLabel, toLabel].filter(Boolean).join(" ").trim();

    return { totalWeeks, totalDays, label };
  }, [filteredHorarios, isRangeActive, normalizedRange]);

  const resumenGlobal = useMemo(() => {
    const todosLosDias = filteredHorarios.flatMap((w) => w.dias || []);
    const base = todosLosDias.reduce(
      (sum, day) => sum + toNumber(day.horas_base),
      0
    );
    const extra = todosLosDias.reduce(
      (sum, day) => sum + toNumber(day.horas_extra),
      0
    );
    const total = base + extra;
    const diasTrab = todosLosDias.filter(
      (day) => toNumber(day.horas_base) + toNumber(day.horas_extra) > 0
    ).length;
    return { base, extra, total, diasTrab };
  }, [filteredHorarios]);

  const toggleWeek = (weekId) => {
    setOpenWeek(openWeek === weekId ? null : weekId);
  };

  const getDomingoStatus = (dia) => {
    if (dia.descripcion === "Domingo" && dia.domingo_estado) {
      return dia.domingo_estado === "compensado"
        ? "Compensado"
        : "Sin Compensar";
    }
    return null;
  };

  const openPreview = (url) => {
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

  const handleDateChange = (key, value) => {
    setDateRange((prev) => {
      const nextRange = { ...prev, [key]: value };
      if (nextRange.from && nextRange.to && nextRange.from > nextRange.to) {
        return { from: nextRange.to, to: nextRange.from };
      }
      return nextRange;
    });
    setOpenWeek(null);
  };

  const resetDateRange = () => {
    setDateRange({ from: "", to: "" });
    setOpenWeek(null);
  };

  const handleChangeEmployee = () => {
    setSelectedEmpleado(null);
    setSearchQuery("");
    setHorarios([]);
    setObservacionesHistory([]);
    setOpenWeek(null);
    setActiveTab("horarios");
    setDateRange({ from: "", to: "" });
  };

  const getEmployeeIndicator = (empleado) => {
    const stats = employeeStats[empleado.id];
    if (!stats) return null;

    if (stats.observaciones_no_revisadas > 0) {
      return {
        type: "pending-review",
        color: "#f59e0b",
        icon: "⚠️",
        text: `${stats.observaciones_no_revisadas} sin revisar`,
        tooltip: `Tiene ${stats.observaciones_no_revisadas} observaciones pendientes de revisión`,
      };
    } else if (stats.total_observaciones > 0) {
      return {
        type: "has-data",
        color: "#10b981",
        icon: "✅",
        text: `${stats.total_observaciones} revisadas`,
        tooltip: "Todas las observaciones han sido revisadas",
      };
    }

    return {
      type: "no-data",
      color: "#6b7280",
      icon: "○",
      text: "Sin observaciones",
      tooltip: "No tiene observaciones registradas",
    };
  };

  const generalStats = useMemo(() => {
    const stats = Object.values(employeeStats);
    const con_observaciones_no_revisadas = stats.filter(
      (s) => (s.observaciones_no_revisadas || 0) > 0
    ).length;
    const con_observaciones = stats.filter(
      (s) => s.total_observaciones > 0
    ).length;
    const sin_observaciones = stats.filter(
      (s) => s.total_observaciones === 0
    ).length;

    return {
      total_empleados: allEmpleados.length,
      con_observaciones,
      sin_observaciones,
      con_observaciones_no_revisadas,
    };
  }, [allEmpleados.length, employeeStats]);

  const handleSelectEmpleado = (empleado) => {
    setSelectedEmpleado(empleado);
    setDateRange({ from: "", to: "" });
    setOpenWeek(null);
  };

  const handleMarkAsReviewed = async () => {
    if (!selectedEmpleado?.id) return;
    const result = await Swal.fire({
      icon: "question",
      title: "¿Marcar como revisadas?",
      text: `¿Estás seguro de que quieres marcar todas las observaciones pendientes de ${selectedEmpleado.nombre_completo} como revisadas?`,
      showCancelButton: true,
      confirmButtonText: "Sí, marcar",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      try {
        await api.patch(
          `/observaciones/${selectedEmpleado.id}/marcar-revisadas`
        );
        toast.success(
          `Observaciones de ${selectedEmpleado.nombre_completo} marcadas como revisadas.`
        );
        fetchObservaciones();
        fetchEmployeeStats();
      } catch (err) {
        toast.error("Error al marcar como revisadas. Inténtalo de nuevo.");
      }
    }
  };

  return (
    <div className="historial-general-container">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="historial-general-card"
      >
        <div className="historial-general-logo">
          <FaHistory />
        </div>
        <h1 className="historial-general-title">Historial General</h1>
        <p className="historial-general-subtitle">
          Consulta el historial de horarios y observaciones de los empleados
          desde un solo lugar.
        </p>

        <div className="historial-general-stats-overview">
          <div className="stats-card">
            <span className="stats-number">{generalStats.total_empleados}</span>
            <span className="stats-label">Total Empleados</span>
          </div>
          <div className="stats-card success">
            <span className="stats-number">
              {generalStats.con_observaciones}
            </span>
            <span className="stats-label">Con Historial</span>
          </div>
          <div className="stats-card neutral">
            <span className="stats-number">
              {generalStats.sin_observaciones}
            </span>
            <span className="stats-label">Sin Observaciones</span>
          </div>
          <div className="stats-card highlight">
            <span className="stats-number">
              {generalStats.con_observaciones_no_revisadas}
            </span>
            <span className="stats-label">Pendientes</span>
          </div>
        </div>

        <div className="historial-general-search-section">
          <div className="historial-general-input-wrap">
            <input
              type="text"
              placeholder=" "
              className="historial-general-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loadingEmpleados || selectedEmpleado}
            />
            <label className="historial-general-label">Cédula o Nombre</label>
          </div>

          {!selectedEmpleado && (
            <div className="historial-general-filters">
              <select
                className="historial-general-filter-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                disabled={loadingEmpleados}
              >
                <option value="all">Todos los empleados</option>
                <option value="pending-review">
                  Pendientes de revisión (Nuevas)
                </option>
                <option value="has-incapacidades">
                  Con Incapacidades (Histórico)
                </option>
                <option value="with-observations">
                  Con otras observaciones (Histórico)
                </option>
                <option value="without-observations">Sin Observaciones</option>
              </select>
            </div>
          )}

          {selectedEmpleado && (
            <button
              className="historial-general-btn secondary"
              onClick={handleChangeEmployee}
            >
              <FaTimes /> Cambiar Empleado
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!selectedEmpleado ? (
            <motion.div
              key="table-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="historial-general-table-wrapper"
            >
              <table className="historial-general-table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Cédula</th>
                    <th>Nombre</th>
                    <th>Observaciones</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEmpleados ? (
                    <tr>
                      <td colSpan="5" className="historial-general-table-cell">
                        <FaSpinner className="spin" /> Cargando empleados...
                      </td>
                    </tr>
                  ) : loadingStats ? (
                    <tr>
                      <td colSpan="5" className="historial-general-table-cell">
                        <FaSpinner className="spin" /> Cargando estadísticas...
                      </td>
                    </tr>
                  ) : empleados.length > 0 ? (
                    empleados.slice(0, visibleEmployees).map((emp) => {
                      const indicator = getEmployeeIndicator(emp);
                      const stats = employeeStats[emp.id];

                      return (
                        <tr key={emp.id} className="employee-row">
                          <td className="historial-general-table-cell indicator-cell">
                            {indicator && (
                              <div
                                className={`employee-indicator ${indicator.type}`}
                                title={indicator.tooltip}
                                style={{ color: indicator.color }}
                              >
                                <span className="indicator-icon">
                                  {indicator.icon}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="historial-general-table-cell">
                            {emp.cedula}
                          </td>
                          <td className="historial-general-table-cell employee-name">
                            {emp.nombre_completo}
                          </td>
                          <td className="historial-general-table-cell observations-cell">
                            {stats ? (
                              <div className="observations-summary">
                                {stats.observaciones_no_revisadas > 0 && (
                                  <span
                                    className="total-count"
                                    style={{ color: "#f59e0b" }}
                                  >
                                    {stats.observaciones_no_revisadas}{" "}
                                    pendientes
                                  </span>
                                )}
                                <span className="total-count">
                                  {stats.total_observaciones} en total
                                </span>
                                {stats.tipos_novedades.length > 0 && (
                                  <div className="novedad-types">
                                    {stats.tipos_novedades
                                      .slice(0, 2)
                                      .map((tipo) => (
                                        <span
                                          key={tipo}
                                          className="novedad-type-badge"
                                        >
                                          {tipo}
                                        </span>
                                      ))}
                                    {stats.tipos_novedades.length > 2 && (
                                      <span className="more-types">
                                        +{stats.tipos_novedades.length - 2}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="no-data">Sin datos</span>
                            )}
                          </td>
                          <td className="historial-general-table-cell">
                            <div className="action-buttons">
                              <button
                                className="historial-general-btn-action"
                                onClick={() => handleSelectEmpleado(emp)}
                              >
                                Ver Detalle
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="5" className="historial-general-table-cell">
                        {filterType === "all"
                          ? "No hay empleados activos."
                          : "No hay empleados que coincidan con el filtro seleccionado."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {empleados.length > visibleEmployees && (
                <button
                  className="historial-general-btn-action"
                  style={{ width: "100%", marginTop: "1rem" }}
                  onClick={() => setVisibleEmployees((v) => v + 10)}
                >
                  <FaChevronDown /> Cargar más (
                  {empleados.length - visibleEmployees} restantes)
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="selected-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="historial-general-selected-empleado"
            >
              <FaUser />
              <span>
                <b>{selectedEmpleado.nombre_completo}</b> (
                {selectedEmpleado.cedula})
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedEmpleado && (
          <>
            <div className="historial-general-tabs">
              <button
                className={`historial-general-tab ${
                  activeTab === "horarios" ? "active" : ""
                }`}
                onClick={() => setActiveTab("horarios")}
              >
                <FaCalendarCheck /> Horarios
              </button>
              <button
                className={`historial-general-tab ${
                  activeTab === "observaciones" ? "active" : ""
                }`}
                onClick={() => setActiveTab("observaciones")}
              >
                <FaClipboardList /> Observaciones
              </button>
            </div>

            {/* TAB CONTENT: HORARIOS */}
            {activeTab === "horarios" && (
              <motion.div
                key="horarios-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="historial-general-header">
                  <div className="historial-general-emp">
                    <FaUser /> <b>{selectedEmpleado?.nombre_completo}</b>
                  </div>
                  <div className="historial-general-summary">
                    <div className="sum-card legal">
                      <span>Horas legales</span>
                      <strong>
                        {formatHoursAndMinutes(resumenGlobal.base)}
                      </strong>
                    </div>
                    <div className="sum-card extra">
                      <span>Horas extra</span>
                      <strong>
                        {formatHoursAndMinutes(resumenGlobal.extra)}
                      </strong>
                    </div>
                    <div className="sum-card total">
                      <span>Total</span>
                      <strong>
                        {formatHoursAndMinutes(resumenGlobal.total)}
                      </strong>
                    </div>
                    <div className="sum-card dias">
                      <span>Días trabajados</span>
                      <strong>{resumenGlobal.diasTrab}</strong>
                    </div>
                  </div>
                </div>

                <div className="historial-general-date-filter">
                  <div className="date-filter-group">
                    <label>
                      <FaFilter /> Desde
                    </label>
                    <input
                      type="date"
                      value={dateRange.from}
                      max={dateRange.to || undefined}
                      onChange={(e) => handleDateChange("from", e.target.value)}
                    />
                  </div>
                  <div className="date-filter-group">
                    <label>Hasta</label>
                    <input
                      type="date"
                      value={dateRange.to}
                      min={dateRange.from || undefined}
                      onChange={(e) => handleDateChange("to", e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="historial-general-btn-tertiary"
                    onClick={resetDateRange}
                    disabled={!isRangeActive}
                  >
                    <FaTimes /> Limpiar filtro
                  </button>
                </div>

                {filterSummary && (
                  <div className="historial-general-filter-summary">
                    <span className="filter-count">
                      {filterSummary.totalDays}{" "}
                      {filterSummary.totalDays === 1 ? "día" : "días"}
                    </span>
                    <span>
                      en {filterSummary.totalWeeks}{" "}
                      {filterSummary.totalWeeks === 1 ? "semana" : "semanas"}
                      {filterSummary.label ? ` ${filterSummary.label}` : ""}
                    </span>
                  </div>
                )}

                <hr className="separator" />

                <div className="historial-general-weekly-list">
                  <h2 className="historial-general-weekly-title">
                    <FaCalendarCheck /> Detalle por Semanas
                  </h2>

                  {loadingHorarios ? (
                    <div className="historial-general-msg">
                      <FaSpinner className="spin" /> Cargando horarios...
                    </div>
                  ) : horarios.length === 0 ? (
                    <div className="historial-general-msg">
                      <FaTimes /> No hay horarios registrados para este
                      empleado.
                    </div>
                  ) : filteredHorarios.length === 0 ? (
                    <div className="historial-general-msg">
                      <FaFilter /> No hay horarios dentro del rango
                      seleccionado.
                    </div>
                  ) : (
                    filteredHorarios.map((week) => (
                      <motion.div
                        key={week.id}
                        className="weekly-item"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div
                          className="weekly-header"
                          onClick={() => toggleWeek(week.id)}
                        >
                          <div className="week-info">
                            <span className="week-date">
                              {fmtFechaLarga(week.fecha_inicio)} -{" "}
                              {fmtFechaLarga(week.fecha_fin)}
                              {week.estado_visibilidad === "archivado" && (
                                <span className="archived-badge">
                                  Archivado
                                </span>
                              )}
                            </span>
                            <span className="historial-general-week-creator">
                              <FaUser /> Creado por:{" "}
                              <strong>{getWeekCreatorLabel(week)}</strong>
                            </span>
                          </div>
                          <div className="week-summary">
                            <div className="week-total-hours">
                              <FaCircle className="dot" />{" "}
                              {formatHoursAndMinutes(week.total_horas_semana)}{" "}
                              en total
                            </div>
                            <span className="toggle-icon">
                              {openWeek === week.id ? (
                                <FaChevronUp />
                              ) : (
                                <FaChevronDown />
                              )}
                            </span>
                          </div>
                        </div>

                        <AnimatePresence>
                          {openWeek === week.id && (
                            <motion.div
                              className="weekly-details"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div className="days-grid">
                                {week.dias.map((d) => (
                                  <div key={d.fecha} className="day-card">
                                    <div className="day-header">
                                      <span className="day-name">
                                        {d.descripcion}
                                      </span>
                                      <span className="day-date">
                                        {fmtFechaLarga(d.fecha)}
                                      </span>
                                    </div>
                                    <div className="day-content">
                                      {getDomingoStatus(d) ? (
                                        <div className="sunday-status">
                                          <FaInfoCircle /> Domingo:{" "}
                                          <strong
                                            className={`status-${d.domingo_estado}`}
                                          >
                                            {getDomingoStatus(d)}
                                          </strong>
                                        </div>
                                      ) : (
                                        <>
                                          {d.jornada_reducida && (
                                            <div className="reduced-day-info">
                                              <span className="badge reduced">
                                                Jornada reducida (9h/6h)
                                              </span>
                                              {d.tipo_jornada_reducida && (
                                                <span className="badge reduced-type">
                                                  {d.tipo_jornada_reducida ===
                                                  "entrar-tarde"
                                                    ? "Entra 1 hora tarde"
                                                    : "Sale 1 hora antes"}
                                                </span>
                                              )}
                                              <div className="hours-badges">
                                                <span className="badge legal">
                                                  {formatHoursAndMinutes(
                                                    d.horas_base
                                                  )}{" "}
                                                  Legales
                                                </span>
                                                <span className="badge extra">
                                                  {formatHoursAndMinutes(
                                                    d.horas_extra
                                                  )}{" "}
                                                  Extras
                                                </span>
                                              </div>
                                            </div>
                                          )}
                                          {!d.jornada_reducida && (
                                            <div className="hours-badges">
                                              <span className="badge legal">
                                                {formatHoursAndMinutes(
                                                  d.horas_base
                                                )}{" "}
                                                Legales
                                              </span>
                                              <span className="badge extra">
                                                {formatHoursAndMinutes(
                                                  d.horas_extra
                                                )}{" "}
                                                Extras
                                              </span>
                                            </div>
                                          )}
                                          {d.bloques &&
                                            d.bloques.length > 0 && (
                                              <div className="blocks-section">
                                                <h4 className="blocks-title">
                                                  Jornada:
                                                </h4>
                                                <ul className="time-blocks">
                                                  {addBreaksToBlocks(
                                                    d.bloques,
                                                    d.descripcion
                                                  ).map((b, idx) => (
                                                    <li
                                                      key={idx}
                                                      className={`${b.type}-item`}
                                                    >
                                                      {b.type === "work" ? (
                                                        <FaClock className="block-icon" />
                                                      ) : b.desc ===
                                                        "Almuerzo" ? (
                                                        <FaUtensils className="break-icon" />
                                                      ) : (
                                                        <FaCoffee className="break-icon" />
                                                      )}
                                                      <span className="block-time">
                                                        {b.start} - {b.end}
                                                      </span>
                                                      <span className="block-desc">
                                                        {b.type === "work"
                                                          ? `(${formatHoursAndMinutes(
                                                              b.hours
                                                            )})`
                                                          : `Descanso: ${b.desc}`}
                                                      </span>
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT: OBSERVACIONES */}
            {activeTab === "observaciones" && (
              <motion.div
                key="observaciones-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="historial-general-observaciones-section"
              >
                <div className="historial-general-observaciones-list">
                  <div className="observaciones-header-section">
                    <h2 className="historial-general-weekly-title">
                      <FaHistory /> Historial de Observaciones
                    </h2>
                    {employeeStats[selectedEmpleado.id]
                      ?.observaciones_no_revisadas > 0 &&
                      isHR && (
                        <button
                          className="historial-general-btn-action mark-reviewed-internal"
                          onClick={handleMarkAsReviewed}
                          style={{
                            alignSelf: "flex-start",
                            marginBottom: "1rem",
                          }}
                        >
                          <FaCheckCircle /> Marcar pendientes como revisadas
                        </button>
                      )}
                  </div>

                  <p className="historial-general-info-note">
                    <FaInfoCircle /> Esta es una vista de solo consulta. Para
                    crear o editar observaciones, use la sección
                    "Observaciones".
                  </p>

                  <AnimatePresence mode="wait">
                    {loadingObservaciones ? (
                      <div className="historial-general-msg">
                        <FaSpinner className="spin" /> Cargando observaciones...
                      </div>
                    ) : observacionesHistory.length > 0 ? (
                      <motion.div
                        key="observaciones-list"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        {observacionesHistory.map((o) => {
                          const details = o.details || {};

                          return (
                            <motion.div
                              key={o.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`historial-general-observacion-card historial-general-observacion-readonly ${
                                !o.revisada ? "not-reviewed" : ""
                              }`}
                            >
                              <div className="historial-general-observacion-header">
                                <span className="historial-general-observacion-date">
                                  {fmtFechaLarga(o.fecha_novedad)}
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
                                <span className="historial-general-observacion-type">
                                  {o.tipo_novedad}
                                </span>
                              </div>
                              <div className="historial-general-observacion-summary">
                                {/* Lógica para no duplicar el motivo */}
                                {o.tipo_novedad !== "Licencias" &&
                                  o.tipo_novedad !== "Préstamos" &&
                                  o.tipo_novedad !== "Permisos" &&
                                  o.tipo_novedad !== "Día de la Familia" &&
                                  o.observacion && (
                                    <p style={{ marginBottom: "0.5rem" }}>
                                      {o.observacion}
                                    </p>
                                  )}

                                {/* MOSTRAR DETALLES DE NOVEDAD USANDO details */}
                                {(() => {
                                  const baseStyle = {
                                    fontSize: "0.9rem",
                                    color: "#334155",
                                    marginTop: "0.5rem",
                                  };

                                  if (o.tipo_novedad === "Licencias") {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        <p>
                                          <strong>Tipo:</strong>{" "}
                                          {details.sub_tipo_novedad}
                                        </p>
                                        <p>
                                          <strong>Duración:</strong>{" "}
                                          {details.duracion_dias || "0"} días
                                        </p>
                                        <p>
                                          <strong>Periodo:</strong>{" "}
                                          {fmtFechaLarga(details.fecha_inicio)}{" "}
                                          al{" "}
                                          {fmtFechaLarga(details.fecha_termino)}
                                        </p>
                                        <p>
                                          <strong>Motivo (Descripción):</strong>{" "}
                                          {o.observacion || "N/A"}
                                        </p>
                                        <p>
                                          <strong>Aprobación:</strong>{" "}
                                          {details.lider_aprueba || "N/A"} -{" "}
                                          {details.fecha_aprobacion
                                            ? fmtFechaLarga(
                                                details.fecha_aprobacion
                                              )
                                            : "Pendiente"}
                                        </p>
                                      </div>
                                    );
                                  }
                                  if (o.tipo_novedad === "Préstamos") {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        <p>
                                          <strong>Monto Solicitado:</strong>{" "}
                                          {formatCurrency(
                                            details.monto_solicitado
                                          )}
                                        </p>
                                        <p>
                                          <strong>Cuotas:</strong>{" "}
                                          {details.numero_cuotas || "N/A"}
                                        </p>
                                        <p>
                                          <strong>Motivo:</strong>{" "}
                                          {o.observacion}
                                        </p>
                                        {(details.revisado_jefe ||
                                          details.aprobado_gh ||
                                          details.contabilizado_tesoreria) && (
                                          <p>
                                            <strong>Aprobación:</strong> Jefe (
                                            {details.revisado_jefe || "N/A"}) |
                                            GH ({details.aprobado_gh || "N/A"})
                                            | Tesorería (
                                            {details.contabilizado_tesoreria ||
                                              "N/A"}
                                            )
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }
                                  if (o.tipo_novedad === "Vacaciones") {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        <p>
                                          <strong>Período Año:</strong>{" "}
                                          {details.periodo_vacacional_ano ||
                                            "N/A"}
                                        </p>
                                        <p>
                                          <strong>Inicio/Fin:</strong>{" "}
                                          {fmtFechaLarga(
                                            details.fecha_inicio_vacaciones
                                          )}{" "}
                                          al{" "}
                                          {fmtFechaLarga(
                                            details.fecha_fin_vacaciones
                                          )}
                                        </p>
                                        <p>
                                          <strong>Regreso:</strong>{" "}
                                          {fmtFechaLarga(
                                            details.fecha_regreso_vacaciones
                                          )}
                                        </p>
                                      </div>
                                    );
                                  }
                                  if (o.tipo_novedad === "Incapacidades") {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        <p>
                                          <strong>Tipo Incap.:</strong>{" "}
                                          {details.tipoIncapacidad}
                                        </p>
                                        {details.diasIncapacidad && (
                                          <p>
                                            <strong>Duración:</strong>{" "}
                                            {details.diasIncapacidad}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }
                                  if (o.tipo_novedad === "Estudio") {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        <p>
                                          <strong>Motivo:</strong>{" "}
                                          {o.observacion}
                                        </p>
                                        {details.dias_estudio &&
                                        details.dias_estudio.length > 0 ? (
                                          <div style={{ marginTop: "0.5rem" }}>
                                            <strong>Días y Horarios:</strong>
                                            <ul
                                              style={{
                                                paddingLeft: "1.2rem",
                                                marginTop: "0.2rem",
                                                marginBottom: "0.5rem",
                                              }}
                                            >
                                              {details.dias_estudio.map(
                                                (dia, idx) => (
                                                  <li key={idx}>
                                                    {fmtFechaLarga(dia.fecha)}:{" "}
                                                    {dia.inicio} - {dia.fin}
                                                  </li>
                                                )
                                              )}
                                            </ul>
                                          </div>
                                        ) : (
                                          details.horarioEstudio && (
                                            <p>
                                              <strong>Horario:</strong>{" "}
                                              {details.horarioEstudio}
                                            </p>
                                          )
                                        )}
                                      </div>
                                    );
                                  }
                                  if (o.tipo_novedad === "Permisos") {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        <p>
                                          <strong>Motivo:</strong>{" "}
                                          {o.observacion || "N/A"}
                                        </p>
                                      </div>
                                    );
                                  }
                                  if (
                                    o.tipo_novedad ===
                                    "Restricciones/Recomendaciones"
                                  ) {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        <p>
                                          <strong>Detalles:</strong>{" "}
                                          {o.observacion}
                                        </p>
                                      </div>
                                    );
                                  }
                                  if (o.tipo_novedad === "Día de la Familia") {
                                    return (
                                      <div
                                        className="observaciones-ph-details-group"
                                        style={baseStyle}
                                      >
                                        {details.fecha_propuesta_dia_familia && (
                                          <p>
                                            <strong>
                                              Fecha Propuesta para el Día de la
                                              Familia:
                                            </strong>{" "}
                                            {fmtFechaLarga(
                                              details.fecha_propuesta_dia_familia
                                            )}
                                          </p>
                                        )}
                                        {details.cargo_solicitante_familia && (
                                          <p>
                                            <strong>
                                              Cargo del Solicitante:
                                            </strong>{" "}
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
                                            <strong>
                                              Observaciones Adicionales:
                                            </strong>{" "}
                                            {o.observacion}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}

                                {/* SECCIÓN DE FIRMAS Y ADJUNTOS (UNIFICADA) */}
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
                                    {/* Firma Empleado */}
                                    {o.documento_firma_empleado && (
                                      <FileAttachmentChip
                                        url={o.documento_firma_empleado}
                                        label="Firma Empleado"
                                        openPreview={openPreview}
                                      />
                                    )}
                                    {/* Firma Líder */}
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
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty-observaciones"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="historial-general-msg"
                      >
                        <FaTimes /> Sin observaciones registradas.
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </>
        )}
        <AnimatePresence>
          {previewOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="historial-general-modal-overlay"
              onClick={(e) => {
                if (
                  e.target.classList.contains("historial-general-modal-overlay")
                )
                  closePreview();
              }}
              aria-modal="true"
              role="dialog"
            >
              <motion.div
                initial={{ scale: 0.98, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.98, y: 10 }}
                className="historial-general-modal-content"
              >
                <div className="historial-general-modal-header">
                  <h4>Vista previa</h4>
                  <button
                    className="historial-general-modal-close"
                    onClick={closePreview}
                    aria-label="Cerrar vista previa"
                  >
                    <FaTimes />
                  </button>
                </div>

                <div className="historial-general-modal-body">
                  {previewMode === "image" && (
                    <img
                      src={previewUrl}
                      alt="vista previa"
                      className="historial-general-modal-image"
                    />
                  )}
                  {previewMode === "pdf" && (
                    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                      <div className="historial-general-modal-pdf">
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
      </motion.div>
    </div>
  );
};

const FileAttachmentChip = ({ url, label, openPreview }) => (
  <div className="historial-general-chip" title={`Ver ${label}`}>
    <FaPaperclip /> {label}
    <button
      type="button"
      className="historial-general-btn-action"
      onClick={(e) => {
        e.stopPropagation();
        openPreview(url);
      }}
      style={{ padding: "0.25rem 0.5rem", marginLeft: "0.5rem" }}
    >
      <FaEye />
    </button>
  </div>
);

export default HistorialGeneralHorarios;
