import express from "express";
import { authenticateUser } from "../middlewares/authMiddleware.js";
import * as ctrl from "../controllers/observacionesController.js";
const router = express.Router();

router.use(authenticateUser);

/**
 * POST /api/observaciones/stats
 * Obtiene estadísticas de observaciones para múltiples empleados
 */
router.post("/stats", ctrl.getObservacionesStats);

router.get("/:empleado_id", ctrl.getObservacionesByEmpleadoId);
router.post("/", ctrl.createObservacion);
router.put("/:id", ctrl.updateObservacion);
router.delete("/:id", ctrl.deleteObservacion);

export default router;