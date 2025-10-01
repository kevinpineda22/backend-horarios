import express from "express";
import * as ctrl from "../controllers/observacionesController.js";
const router = express.Router();

/**
 * POST /api/observaciones/stats
 * Obtiene estadísticas de observaciones para múltiples empleados
 */
router.post("/stats", ctrl.getObservacionesStats);

router.patch("/:empleado_id/marcar-revisadas", ctrl.marcarComoRevisadas);
router.get("/:empleado_id", ctrl.getObservacionesByEmpleadoId);
router.post("/", ctrl.createObservacion);
router.put("/:id", ctrl.updateObservacion); // El frontend usa PUT para actualizar
router.delete("/:id", ctrl.deleteObservacion);

export default router;