// src/routes/horarios.js
import express from 'express';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/horariosController.js';

const router = express.Router();

// Todas las rutas bajo /api/horarios requieren un token válido
router.use(authenticateUser);

/**
 * GET  /api/horarios/:empleado_id
 * Devuelve el historial de horarios de un empleado
 */
router.get('/:empleado_id', ctrl.getHorariosByEmpleadoId);

/**
 * POST /api/horarios
 * Crea un nuevo horario SEMANAL automático (44h base, sin extras).
 * Body:
 * {
 *   empleado_id: "<uuid>",
 *   fecha_inicio: "YYYY-MM-DD",
 *   fecha_fin: "YYYY-MM-DD",
 *   working_weekdays: [2,3,4,5,6] // Ej: Mar–Sáb. Lun..Dom => 1..7
 * }
 */
router.post('/', ctrl.createHorario);

/**
 * PUT /api/horarios/:id
 * Actualiza un horario existente
 */
router.put('/:id', ctrl.updateHorario);

/**
 * DELETE /api/horarios/:id
 * Elimina un horario
 */
router.delete('/:id', ctrl.deleteHorario);

export default router;
