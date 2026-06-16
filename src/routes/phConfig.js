// src/routes/phConfig.js
// Rutas del panel de configuración del Programador de Horarios (/api/ph-config).
// Todas requieren autenticación. (TODO: añadir gate de rol admin como en
// observacionesController — hoy basta con estar autenticado.)
import express from "express";
import * as ctrl from "../controllers/phConfigController.js";
import { authenticateUser } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(authenticateUser);

// Parámetros globales
router.get("/parametros", ctrl.listParametros);
router.put("/parametros", ctrl.upsertParametro);
router.delete("/parametros/:clave", ctrl.deleteParametro);

// Jornadas (lapsos base / turnos)
router.get("/jornadas", ctrl.listJornadas);
router.post("/jornadas", ctrl.createJornada);
router.patch("/jornadas/:id", ctrl.updateJornada);
router.delete("/jornadas/:id", ctrl.deleteJornada);

// Configuración por sede (cupos)
// Lista todas las sedes con sus cupos agregados ({ [jornada_id]: cupos }).
router.get("/sedes", ctrl.listSedesConCupos);
// Guarda todos los cupos de una sede de una sola vez.
router.put("/sedes/:id", ctrl.updateSedeCupos);
// Tablero de la sede (Vista por Sede): colaboradores + turno vigente + cupos.
router.get("/sedes/:sede_id/panel", ctrl.getSedePanel);
// Mostrar/ocultar una sede en el Programador (tabla propia, no toca `sedes`).
router.put("/sedes/:id/visibilidad", ctrl.setSedeVisibilidad);

// Asignación de turno base por colaborador (con historial de vigencia)
router.get("/asignaciones/:empleado_id", ctrl.listAsignaciones);
router.post("/asignaciones", ctrl.asignarJornada);

// Destinatarios de notificación (lista plana de correos para novedades críticas)
router.get("/destinatarios", ctrl.listDestinatarios);
router.put("/destinatarios", ctrl.replaceDestinatarios);

export default router;
