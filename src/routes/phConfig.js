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
router.get("/sedes/:sede_id/config", ctrl.listSedeConfig);
router.put("/sedes/config", ctrl.upsertSedeConfig);

// Asignación de jornada por colaborador
router.get("/asignaciones/:empleado_id", ctrl.listAsignaciones);
router.post("/asignaciones", ctrl.asignarJornada);

// Destinatarios de notificación
router.get("/destinatarios", ctrl.listDestinatarios);
router.post("/destinatarios", ctrl.createDestinatario);
router.delete("/destinatarios/:id", ctrl.deleteDestinatario);

export default router;
