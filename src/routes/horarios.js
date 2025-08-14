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
 * Crea horario(s) semanal(es) automático(s).
 * Body:
 * {
 *   empleado_id: "<uuid>",
 *   fecha_inicio: "YYYY-MM-DD",
 *   fecha_fin: "YYYY-MM-DD",
 *   working_weekdays: [2,3,4,5,6],     // 1..7 => Lun..Dom
 *   worked_holidays: ["YYYY-MM-DD"]    // festivos que SÍ se trabajan (08:00–13:00)
 * }
 * Reglas:
 *  - Base diaria real = 8h (Sáb 8h). Festivo trabajado = 5h.
 *  - Extras objetivo 12h/semana (si no alcanza por capacidad/festivos, se crea igual con warning).
 */
router.post('/', ctrl.createHorario);

/**
 * PUT /api/horarios/:id
 * Actualiza un horario existente (valida capacidad diaria y extras ≤ 12h/semana)
 */
router.put('/:id', ctrl.updateHorario);

/**
 * DELETE /api/horarios/:id
 * Elimina un horario
 */
router.delete('/:id', ctrl.deleteHorario);

export default router;
