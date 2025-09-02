// src/routes/horarios.js
import express from 'express';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/horariosController.js';

const router = express.Router();

// Todas las rutas bajo /api/horarios requieren un token válido
router.use(authenticateUser);

/**
 * GET  /api/horarios/:empleado_id
 * Devuelve el historial de horarios de un empleado
 */
router.get('/:empleado_id', ctrl.getHorariosByEmpleadoId);

/**
 * POST /api/horarios
 * Crea horario(s) semanal(es) automático(s).
 */
router.post('/', ctrl.createHorario);

/**
 * PATCH /api/horarios/:id
 * Actualiza un horario existente de forma parcial.
 */
router.patch('/:id', ctrl.updateHorario);

/**
 * DELETE /api/horarios/:id
 * Elimina un horario
 */
router.delete('/:id', ctrl.deleteHorario);

export default router;