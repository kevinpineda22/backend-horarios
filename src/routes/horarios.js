// src/routes/horarios.js
import express from 'express';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/horariosController.js';

const router = express.Router();

// Rutas protegidas
router.use(authenticateUser);

/**
 * GET  /api/horarios/:empleado_id
 * Historial de horarios del empleado
 */
router.get('/:empleado_id', ctrl.getHorariosByEmpleadoId);

/**
 * POST /api/horarios
 * Crea horarios semanales automáticos:
 * - Intenta 44h base + 12h extra (56h)
 * - Si no alcanza, crea con lo máximo posible y devuelve "warnings"
 * Body:
 * {
 *   empleado_id: "<uuid>",
 *   fecha_inicio: "YYYY-MM-DD",
 *   fecha_fin: "YYYY-MM-DD",
 *   working_weekdays: [1,2,3,4,5,6],
 *   worked_holidays: ["YYYY-MM-DD", ...] // festivos que sí se trabajan (08:00–13:00)
 * }
 */
router.post('/', ctrl.createHorario);

/**
 * PUT /api/horarios/:id
 * Actualiza un horario (no exceder 44 base ni 12 extra/semana)
 */
router.put('/:id', ctrl.updateHorario);

/**
 * DELETE /api/horarios/:id
 */
router.delete('/:id', ctrl.deleteHorario);

export default router;
