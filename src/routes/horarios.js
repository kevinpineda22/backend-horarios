import express from "express";
import * as ctrl from "../controllers/horariosController.js";
import { authenticateUser } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Todas las rutas de horarios requieren autenticación.
// (La consulta pública de horarios vive aparte, en /api/public.)
router.use(authenticateUser);

/**
 * PATCH /api/horarios/archivar
 * Archiva todos los horarios de un empleado.
 * Esta ruta DEBE estar antes de la ruta que utiliza el ID.
 */
router.patch("/archivar", ctrl.archivarHorarios);

/**
 * GET /api/horarios/extras-quincena/:empleado_id?fecha=YYYY-MM-DD
 * Acumulado de horas extra en la quincena vs. el máximo configurable (spec 4.2).
 * Debe ir antes de la ruta genérica /:empleado_id.
 */
router.get("/extras-quincena/:empleado_id", ctrl.getExtrasQuincena);

/**
 * GET /api/horarios/auditoria/:empleado_id?horario_id=&limit=
 * Historial de cambios auditados: quién, cuándo, antes → después (spec 5.2 / 8).
 * Debe ir antes de la ruta genérica /:empleado_id.
 */
router.get("/auditoria/:empleado_id", ctrl.getAuditoria);

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
 * POST /api/horarios/intercambio
 * Intercambia los turnos de dos colaboradores para una fecha (spec 5.1).
 */
router.post("/intercambio", ctrl.intercambiarTurnos);

/**
 * POST /api/horarios/notificar/:empleado_id
 * Reenvía manualmente el correo de horario al colaborador (tras editarlo).
 */
router.post("/notificar/:empleado_id", ctrl.notificarHorario);

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
