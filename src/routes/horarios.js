import express from 'express';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/horariosController.js';

const router = express.Router();

// Todas las rutas bajo /api/horarios requieren un token válido
router.use(authenticateUser);

/**
 * PATCH /api/horarios/archivar
 * Archiva todos los horarios de un empleado.
 * Esta ruta DEBE estar antes de la ruta que utiliza el ID.
 */
router.patch('/archivar', ctrl.archivarHorarios);

/**
 * GET /api/horarios/available-slots/:empleado_id/:fecha
 * Obtiene los slots de tiempo disponibles para un empleado en una fecha específica
 */
router.get('/available-slots/:empleado_id/:fecha', ctrl.getAvailableTimeSlots);

/**
 * POST /api/horarios/validate-schedule
 * Valida un horario propuesto contra conflictos existentes
 */
router.post('/validate-schedule', ctrl.validateScheduleConflicts);

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