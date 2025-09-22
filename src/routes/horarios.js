import express from "express";
import * as ctrl from "../controllers/horariosController.js";

const router = express.Router();

/**
 * PATCH /api/horarios/archivar
 * Archiva todos los horarios de un empleado.
 * Esta ruta DEBE estar antes de la ruta que utiliza el ID.
 */
router.patch("/archivar", ctrl.archivarHorarios);

/**
 * GET  /api/horarios/:empleado_id/completo
 * Devuelve el historial completo de horarios de un empleado (incluyendo archivados)
 */
router.get("/:empleado_id/completo", (req, res) => {
  // Agregar query parameter para incluir archivados
  req.query.incluir_archivados = "true";
  ctrl.getHorariosByEmpleadoId(req, res);
});

/**
 * GET  /api/horarios/:empleado_id
 * Devuelve el historial de horarios activos de un empleado
 */
router.get("/:empleado_id", ctrl.getHorariosByEmpleadoId);

/**
 * POST /api/horarios
 * Crea horario(s) semanal(es) automático(s).
 */
router.post("/", ctrl.createHorario);

/**
 * PATCH /api/horarios/:id
 * Actualiza un horario existente de forma parcial.
 */
router.patch("/:id", ctrl.updateHorario);

/**
 * DELETE /api/horarios/:id
 * Elimina un horario
 */
router.delete("/:id", ctrl.deleteHorario);

export default router;
