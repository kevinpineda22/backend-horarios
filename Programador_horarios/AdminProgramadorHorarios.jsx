import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCalendarAlt,
  FaClipboardList,
  FaUsers,
  FaHistory,
  FaArrowLeft,
} from "react-icons/fa";
import { Toaster } from "react-hot-toast";
import ProgramadorHorarios from "./ProgramadorHorarios";
import Observaciones from "./ObservacionesPH";
import GestionEmpleados from "./GestionEmpleados";
import HistorialGeneralHorarios from "./HistorialGeneralHorarios";
import "./AdminProgramadorHorarios.css";
import { Link } from "react-router-dom";

const TITULOS_VISTA = {
  programador: "Gestión de Horarios",
  observaciones: "Gestión de Observaciones",
  empleados: "Gestión de Empleados",
  historial: "Historial General",
};

const AdminProgramadorHorarios = () => {
  const [user] = useState({ email: "lider@example.com" });
  const [vista, setVista] = useState("programador");

  return (
    <div className="admin-sch-main-container">
      <Toaster position="top-center" reverseOrder={false} />

      <motion.div
        initial={{ x: -250 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.5 }}
        className="admin-sch-sidebar"
      >
        <div className="admin-sch-sidebar-header">
          <Link
            to="/acceso"
            className="admin-sch-back-button"
            title="Volver al acceso"
          >
            <FaArrowLeft />
          </Link>

          <img
            src="/iconoConstruahorro.png"
            alt="Logo Construahorro"
            className="admin-sch-logo"
          />

          <h2 className="admin-sch-sidebar-title">Panel Administrador</h2>
        </div>

        <nav className="admin-sch-sidebar-nav">
          <button
            onClick={() => setVista("programador")}
            className={`admin-sch-sidebar-button ${
              vista === "programador" ? "admin-sch-sidebar-button-active" : ""
            }`}
          >
            <FaCalendarAlt />
            <span className="admin-sch-sidebar-text">
              Programador de Horarios
            </span>
          </button>

          <button
            onClick={() => setVista("observaciones")}
            className={`admin-sch-sidebar-button ${
              vista === "observaciones" ? "admin-sch-sidebar-button-active" : ""
            }`}
          >
            <FaClipboardList />
            <span className="admin-sch-sidebar-text">Observaciones</span>
          </button>

          <button
            onClick={() => setVista("empleados")}
            className={`admin-sch-sidebar-button ${
              vista === "empleados" ? "admin-sch-sidebar-button-active" : ""
            }`}
          >
            <FaUsers />
            <span className="admin-sch-sidebar-text">Gestión de Empleados</span>
          </button>

          <button
            onClick={() => setVista("historial")}
            className={`admin-sch-sidebar-button ${
              vista === "historial" ? "admin-sch-sidebar-button-active" : ""
            }`}
          >
            <FaHistory />
            <span className="admin-sch-sidebar-text">Historial General</span>
          </button>
        </nav>
      </motion.div>

      <div className="admin-sch-content">
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="admin-sch-main-title"
        >
          {TITULOS_VISTA[vista]}
        </motion.h1>

        <AnimatePresence mode="wait">
          {vista === "programador" && (
            <motion.div
              key="programador"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <ProgramadorHorarios user={user} />
            </motion.div>
          )}

          {vista === "observaciones" && (
            <motion.div
              key="observaciones"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <Observaciones user={user} />
            </motion.div>
          )}

          {vista === "empleados" && (
            <motion.div
              key="empleados"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <GestionEmpleados />
            </motion.div>
          )}

          {vista === "historial" && (
            <motion.div
              key="historial"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <HistorialGeneralHorarios />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export { AdminProgramadorHorarios };
