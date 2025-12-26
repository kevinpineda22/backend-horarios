// src/pages/ConsultaHorariosPublica.jsx
import React, { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaSearch,
  FaSpinner,
  FaTimes,
  FaUser,
  FaCalendarAlt,
  FaClock,
  FaChevronDown,
  FaChevronUp,
  FaInfoCircle,
  FaExclamationTriangle,
  FaBan,
  FaGift,
  FaArchive,
  FaPencilAlt,
  FaCalendarCheck,
  FaCircle,
} from "react-icons/fa";
import { apiPublic } from "../../services/apiHorarios";
import { format, parseISO, addDays, isValid } from "date-fns"; // Importar isValid y addDays
import { es } from "date-fns/locale";
import "./consultahorariospublica.css";

// --- Helpers de formato ---

const formatHours = (value) => {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0";
  const fixed = num.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed; // "7.0" -> "7", "7.5" -> "7.5"
};

const formatTimeLabel = (value) => {
  if (!value || value === "—") return null;
  const [hourStr, minuteStr = "00"] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const hour12 = ((hour % 12) + 12) % 12 || 12;
  const period = hour >= 12 ? "p.m." : "a.m.";
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
};

const fmtFechaLarga = (fecha) => {
  if (!fecha) return "";
  try {
    // Usar parseISO para manejar correctamente la fecha como string
    const date = parseISO(fecha + "T00:00:00"); // Asumir hora local o UTC consistente
    return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
  } catch {
    return fecha;
  }
};

const formatShortDate = (fecha) => {
  try {
    return format(parseISO(fecha + "T00:00:00"), "dd/MM/yyyy");
  } catch {
    return fecha;
  }
};

// --- Helpers de Lógica (Traídos de programadorHorariosUtils) ---

const wdOrder = {
  Lunes: 1,
  Martes: 2,
  Miércoles: 3,
  Miercoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sábado: 6,
  Sabado: 6,
  Domingo: 7,
};

const BLOCKING_NOVEDAD_TYPES = new Set([
  "Incapacidades",
  "Licencias",
  "Vacaciones",
  "Permisos",
  "Estudio",
  "Día de la Familia",
]);

// Helper para parsear fechas YYYY-MM-DD a objetos Date UTC
const parseDateOnlyUTC = (value) => {
  if (!value) return null;
  if (value instanceof Date && isValid(value)) {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  const raw = `${value}`.trim();
  if (!raw) return null;
  const normalized = raw.length > 10 ? raw.slice(0, 10) : raw;
  const parsed = parseISO(normalized + "T00:00:00Z"); // Parsear como UTC
  return isValid(parsed) ? parsed : null;
};

// Helper para inferir fecha de fin de bloqueo
const inferBlockingEnd = (tipo, startDate, rawEnd, details) => {
  let endDate = parseDateOnlyUTC(rawEnd);

  if (!endDate || endDate < startDate) {
    if (tipo === "Vacaciones" && details?.fecha_regreso_vacaciones) {
      const regreso = parseDateOnlyUTC(details.fecha_regreso_vacaciones);
      if (regreso) endDate = addDays(regreso, -1);
    }
  }
  if (!endDate || endDate < startDate) {
    const duration = Number(details?.duracion_dias);
    if (!Number.isNaN(duration) && duration > 0) {
      endDate = addDays(startDate, duration - 1);
    }
  }
  if (!endDate || endDate < startDate) {
    let maybeDuration = NaN;
    if (details?.diasIncapacidad) {
      if (typeof details.diasIncapacidad === "number") {
        maybeDuration = details.diasIncapacidad;
      } else if (typeof details.diasIncapacidad === "string") {
        const match = details.diasIncapacidad.match(/\d+/);
        if (match) maybeDuration = Number(match[0]);
      }
    }
    if (!Number.isNaN(maybeDuration) && maybeDuration > 0) {
      endDate = addDays(startDate, maybeDuration - 1);
    }
  }
  if (!endDate || endDate < startDate) {
    endDate = startDate;
  }
  return endDate;
};

// Helper para normalizar y filtrar bloqueos
const normalizeAndFilterBlockages = (observaciones) => {
  return (observaciones || [])
    .map((obs) => {
      const tipo = obs.tipo_novedad || obs.tipo;
      if (!tipo || !BLOCKING_NOVEDAD_TYPES.has(tipo)) return null;

      const details =
        obs.details && typeof obs.details === "object" ? obs.details : {};

      let startCandidate =
        obs.fecha_inicio ||
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia && tipo === "Día de la Familia") ||
        obs.fecha_novedad;
      let endCandidate =
        obs.fecha_fin ||
        details.fecha_fin ||
        details.fecha_termino ||
        details.fecha_inicio ||
        (details.fecha_propuesta_dia_familia && tipo === "Día de la Familia") ||
        obs.fecha_novedad;

      if (tipo === "Vacaciones") {
        startCandidate = details.fecha_inicio_vacaciones || obs.fecha_novedad;
        endCandidate = details.fecha_fin_vacaciones;
      }

      const startDate = parseDateOnlyUTC(startCandidate);
      if (!startDate) return null;

      const endDate = inferBlockingEnd(tipo, startDate, endCandidate, details);

      return {
        id: obs.id,
        tipo,
        observacion: obs.observacion || "",
        start: startDate, // Devolver como objeto Date
        end: endDate, // Devolver como objeto Date
        details: details, // ¡NUEVO! Pasar detalles para renderizado avanzado
      };
    })
    .filter(Boolean) // Quitar nulos
    .sort((a, b) => a.start.getTime() - b.start.getTime()); // Comparar con getTime()
};

// --- Componente Principal ---
export default function ConsultaHorariosPublica() {
  const [cedula, setCedula] = useState("");
  const [empleado, setEmpleado] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [observaciones, setObservaciones] = useState([]); // ¡NUEVO!
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busquedaHecha, setBusquedaHecha] = useState(false);
  const [openWeek, setOpenWeek] = useState(null);

  const handleBuscar = async (e) => {
    e.preventDefault();
    setBusquedaHecha(true);
    setLoading(true);
    setError(null);
    setEmpleado(null);
    setHorarios([]);
    setObservaciones([]); // ¡NUEVO!
    setOpenWeek(null);

    const ced = cedula.trim();
    if (!ced) {
      setError("Por favor, ingresa tu cédula.");
      setLoading(false);
      return;
    }

    try {
      // Asumimos que la API ahora devuelve { empleado, horarios, observaciones }
      const { data } = await apiPublic.post("/consulta-horarios", {
        cedula: ced,
      });

      const sortedHorarios = (data.horarios || [])
        .map((h) => ({
          ...h,
          dias: (h.dias || []).slice().sort((a, b) => {
            const A = wdOrder[a.descripcion] || 99;
            const B = wdOrder[b.descripcion] || 99;
            if (A !== B) return A - B;
            return (a.fecha || "").localeCompare(b.fecha || "");
          }),
        }))
        .sort((a, b) => {
          // Ordenar semanas de la más reciente a la más antigua
          return (b.fecha_inicio || "").localeCompare(a.fecha_inicio || "");
        });

      setEmpleado(data.empleado);
      setHorarios(sortedHorarios);
      setObservaciones(normalizeAndFilterBlockages(data.observaciones)); // ¡NUEVO!

      // Abrir la primera semana automáticamente si existe
      if (sortedHorarios.length > 0) {
        setOpenWeek(sortedHorarios[0].id);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Ocurrió un error. Intenta de nuevo más tarde."
      );
    } finally {
      setLoading(false);
    }
  };

  // Crea el mapa de bloqueos, igual que en el programador
  const blockingDatesMap = useMemo(() => {
    const map = new Map();
    observaciones.forEach((block) => {
      let currentDate = new Date(block.start);
      const endDate = new Date(block.end);
      while (currentDate <= endDate) {
        const ymd = format(currentDate, "yyyy-MM-dd");
        if (!map.has(ymd)) map.set(ymd, []);
        map.get(ymd).push(block);
        currentDate = addDays(currentDate, 1);
      }
    });
    return map;
  }, [observaciones]);

  // Resumen global ahora incluye reducciones de banco
  const resumenGlobal = useMemo(() => {
    const todosLosDias = horarios.flatMap((w) => w.dias || []);
    const base = todosLosDias.reduce((s, d) => s + (d.horas_base || 0), 0);
    const extra = todosLosDias.reduce((s, d) => s + (d.horas_extra || 0), 0);
    const reduction = todosLosDias.reduce(
      (s, d) =>
        s + (d.horas_extra_reducidas || 0) + (d.horas_legales_reducidas || 0),
      0
    );
    const total = todosLosDias.reduce((s, d) => s + (d.horas || 0), 0);
    const diasTrab = todosLosDias.filter((d) => (d.horas || 0) > 0).length;
    return { base, extra, total, reduction, diasTrab };
  }, [horarios]);

  const toggleWeek = (weekId) => {
    setOpenWeek(openWeek === weekId ? null : weekId);
  };

  return (
    <div className="pubcal-container">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="pubcal-card"
      >
        <div className="pubcal-logo">
          <FaCalendarAlt />
        </div>
        <h1 className="pubcal-title">Consulta de Horarios</h1>
        <p className="pubcal-subtitle">
          Ingresa tu número de cédula para ver tus horarios de trabajo.
        </p>

        <form onSubmit={handleBuscar} className="pubcal-form">
          <div className="pubcal-input-wrap">
            <input
              type="text"
              placeholder=" "
              className="pubcal-input"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              disabled={loading}
            />
            <label className="pubcal-label">Cédula del empleado</label>
          </div>
          <button
            type="submit"
            className="pubcal-btn primary"
            disabled={loading}
          >
            {loading ? <FaSpinner className="spin" /> : <FaSearch />}
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {/* --- SECCIÓN DE RESULTADOS --- */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="pubcal-msg" style={{ minHeight: "150px" }}>
                <FaSpinner className="spin" /> Buscando información...
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="pubcal-msg error">
                <FaExclamationTriangle /> {error}
              </div>
            </motion.div>
          ) : busquedaHecha && !empleado ? (
            <motion.div
              key="no-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="pubcal-msg">
                <FaTimes /> No se encontró información para la cédula ingresada.
              </div>
            </motion.div>
          ) : empleado ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* --- Info del Empleado y Resumen Global --- */}
              <div className="pubcal-header">
                <div className="pubcal-emp">
                  <FaUser /> <b>{empleado?.nombre_completo}</b>
                </div>
                <div className="pubcal-summary">
                  <div className="sum-card legal">
                    <span>H. Legales</span>
                    <strong>{formatHours(resumenGlobal.base)}h</strong>
                  </div>
                  <div className="sum-card extra">
                    <span>H. Extras</span>
                    <strong>{formatHours(resumenGlobal.extra)}h</strong>
                  </div>
                  {/* ¡NUEVO! Banco Aplicado */}
                  {resumenGlobal.reduction > 0 && (
                    <div className="sum-card bank">
                      <span>H. Banco Aplic.</span>
                      <strong>-{formatHours(resumenGlobal.reduction)}h</strong>
                    </div>
                  )}
                  <div className="sum-card total">
                    <span>Total Horas</span>
                    <strong>{formatHours(resumenGlobal.total)}h</strong>
                  </div>
                  <div className="sum-card dias">
                    <span>Días Lab.</span>
                    <strong>{resumenGlobal.diasTrab}</strong>
                  </div>
                </div>
              </div>

              <hr className="separator" />

              {/* --- Lista de Semanas --- */}
              <div className="pubcal-weekly-list">
                <h2 className="pubcal-weekly-title">
                  <FaCalendarCheck /> Detalle por Semanas
                </h2>
                {horarios.length === 0 && (
                  <div className="pubcal-msg">
                    <FaTimes /> No hay horarios programados para este empleado.
                  </div>
                )}
                {horarios.map((week) => (
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
                        </span>
                      </div>
                      <div className="week-summary">
                        <div className="week-total-hours">
                          <FaCircle className="dot" />
                          {formatHours(week.total_horas_semana)}h en total
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
                              <DayCard
                                key={d.fecha}
                                dia={d}
                                blockingMap={blockingDatesMap}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// --- Sub-Componente DayCard (¡Nuevo y Mejorado!) ---
const DayCard = ({ dia, blockingMap }) => {
  // 1. Extraer toda la información
  const {
    descripcion,
    fecha,
    horas,
    horas_base,
    horas_extra,
    jornada_entrada,
    jornada_salida,
    domingo_estado,
    festivo_trabajado,
    jornada_reducida,
    tipo_jornada_reducida,
    horas_extra_reducidas,
    horas_legales_reducidas,
    horas_reducidas_manualmente,
  } = dia;

  const totalHoras = Number(horas || 0);
  const totalReduccionBanco =
    Number(horas_extra_reducidas || 0) + Number(horas_legales_reducidas || 0);
  const hasWork = totalHoras > 0;
  const blocks = blockingMap.get(fecha) || [];
  const isBlocked = blocks.length > 0;
  const primaryBlock = blocks[0];

  // 2. Determinar qué mostrar
  let content;
  if (hasWork) {
    // --- Renderizar Día de Trabajo ---
    const jornadaLabel =
      jornada_entrada && jornada_salida
        ? `${formatTimeLabel(jornada_entrada)} – ${formatTimeLabel(
            jornada_salida
          )}`
        : "Jornada no definida";

    content = (
      <>
        <div className="day-jornada">
          <FaClock />
          <span>{jornadaLabel}</span>
        </div>
        <div className="hours-badges">
          <span className="badge legal">
            {formatHours(horas_base)}h Legales
          </span>
          <span className="badge extra">
            {formatHours(horas_extra)}h Extras
          </span>
          <span className="badge total">{formatHours(totalHoras)}h Total</span>
        </div>
        <div className="tags-badges">
          {festivo_trabajado && (
            <span className="badge tag-holiday">
              <FaGift /> Festivo Trabajado
            </span>
          )}
          {jornada_reducida && (
            <span
              className="badge tag-reduced"
              title={
                tipo_jornada_reducida === "entrar-tarde"
                  ? "Entra 1h tarde"
                  : "Sale 1h antes"
              }
            >
              <FaInfoCircle /> Jornada Reducida
            </span>
          )}
          {totalReduccionBanco > 0 && (
            <span className="badge tag-bank">
              <FaArchive /> Banco Aplicado (-{formatHours(totalReduccionBanco)}
              h)
            </span>
          )}
          {horas_reducidas_manualmente && (
            <span className="badge tag-manual">
              <FaPencilAlt /> Ajuste Manual
            </span>
          )}
          {/* Mostrar etiqueta de Novedad si hay trabajo pero también novedad (ej. Estudio parcial) */}
          {isBlocked && (
            <span className="badge tag-novedad">
              <FaInfoCircle /> {primaryBlock.tipo}
            </span>
          )}
        </div>
      </>
    );
  } else if (isBlocked) {
    // --- Renderizar Día Bloqueado ---
    const isEstudio = blocks.every((b) => b.tipo === "Estudio");

    content = (
      <div className={`day-blocked-info ${isEstudio ? "estudio-blocked" : ""}`}>
        {isEstudio ? <FaExclamationTriangle /> : <FaBan />}
        <div className="blocked-details">
          <strong>{primaryBlock.tipo}</strong>
          {/* Solo mostramos el tipo como explicación principal */}
        </div>
      </div>
    );
  } else if (domingo_estado) {
    // --- Renderizar Domingo ---
    content = (
      <div className="day-sunday-info">
        <FaCalendarCheck />
        <span className={`status-${domingo_estado}`}>
          Domingo{" "}
          {domingo_estado === "compensado" ? "Compensado" : "Sin Compensar"}
        </span>
      </div>
    );
  } else {
    // --- Renderizar Día Libre ---
    content = (
      <div className="day-off-info">
        <span>Día Libre</span>
      </div>
    );
  }

  return (
    <div
      className={`day-card ${isBlocked ? "blocked" : ""} ${
        !hasWork && !isBlocked && !domingo_estado ? "off" : ""
      }`}
    >
      <div className="day-header">
        <span className="day-name">{descripcion}</span>
        <span className="day-date">{fmtFechaLarga(fecha)}</span>
      </div>
      <div className="day-content">{content}</div>
    </div>
  );
};
