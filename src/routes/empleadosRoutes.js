// src/routes/empleadosRoutes.js
import express from 'express';
import { createEmpleado, uploadEmpleados, toggleEmpleadoStatus } from '../controllers/empleadosController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer(); // Configura multer para manejar archivos en memoria

// Ruta para la creación manual de un empleado
router.post('/', createEmpleado);

// Ruta para la carga masiva de empleados
router.post('/upload', upload.single('file'), uploadEmpleados);

// Ruta para actualizar el estado de un empleado
router.patch('/:id', toggleEmpleadoStatus);

export default router;
