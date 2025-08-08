import express from 'express';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/horariosController.js';
const router = express.Router();

router.use(authenticateUser);
router.get('/:empleado_id', ctrl.getHorariosByEmpleadoId);
router.post('/', ctrl.createHorario);
router.put('/:id', ctrl.updateHorario);
router.delete('/:id', ctrl.deleteHorario);

export default router;