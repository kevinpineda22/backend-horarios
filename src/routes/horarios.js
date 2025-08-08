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
 * Crea un nuevo horario SEMANAL automático.
 * Body esperado:
 * {
 *   empleado_id: "<uuid del empleado>",
 *   fecha_inicio: "YYYY-MM-DD",  // debe ser lunes
 *   extras: <número de horas extra entre 0 y 12>
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
