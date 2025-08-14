// src/routes/horarios.js
import express from 'express';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import * as ctrl from '../controllers/horariosController.js';

const router = express.Router();

// Protegidas
router.use(authenticateUser);

// Historial por empleado
router.get('/:empleado_id', ctrl.getHorariosByEmpleadoId);

// Crear semanas aleatorias (8–10 L–V, 7 Sáb, con breaks visuales)
router.post('/', ctrl.createHorario);

// Actualizar (opcional)
router.put('/:id', ctrl.updateHorario);

// Eliminar semana
router.delete('/:id', ctrl.deleteHorario);

export default router;
