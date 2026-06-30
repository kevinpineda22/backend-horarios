import express from "express";
import * as ctrl from "../controllers/observacionesController.js";
import { authenticateUser } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Todas las rutas de observaciones requieren autenticación.
// (La consulta pública lee observaciones aparte, en /api/public.)
router.use(authenticateUser);

/**
 * POST /api/observaciones/stats
 * Obtiene estadísticas de observaciones para múltiples empleados
 */
router.post("/stats", ctrl.getObservacionesStats);

router.patch("/:empleado_id/marcar-revisadas", ctrl.marcarComoRevisadas);
router.patch("/:id/revisar", ctrl.marcarUnaComoRevisada);
router.get("/permissions", ctrl.checkPermissions);
router.get("/:empleado_id", ctrl.getObservacionesByEmpleadoId);
router.post("/", ctrl.createObservacion);
router.put("/:id", ctrl.updateObservacion); // El frontend usa PUT para actualizar
router.delete("/:id", ctrl.deleteObservacion);

export default router;
