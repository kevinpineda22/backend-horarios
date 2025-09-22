import express from "express";
import { authenticateUser } from "../middlewares/authMiddleware.js";
import * as ctrl from "../controllers/observacionesController.js";
const router = express.Router();

// Aplica el middleware de autenticación a todas las rutas a continuación.
// Esto incluye /stats y todas las demás rutas de observaciones.
router.use(authenticateUser);

/**
 * POST /api/observaciones/stats
 * Obtiene estadísticas de observaciones para múltiples empleados.
 * Ahora requiere autenticación.
 */
router.post("/stats", ctrl.getObservacionesStats);

router.get("/:empleado_id", ctrl.getObservacionesByEmpleadoId);
router.post("/", ctrl.createObservacion);
router.put("/:id", ctrl.updateObservacion);
router.delete("/:id", ctrl.deleteObservacion);

export default router;