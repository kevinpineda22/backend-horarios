// src/routes/empleadosRoutes.js
import express from 'express';
import { getEmpleados, createEmpleado, uploadEmpleados, toggleEmpleadoStatus } from '../controllers/empleadosController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer(); // Configura multer para manejar archivos en memoria

// Esta ruta ahora responde a GET /api/empleados
router.get('/', getEmpleados);

// Ruta para la creación manual de un empleado (POST /api/empleados)
router.post('/', createEmpleado);

// Ruta para la carga masiva de empleados (POST /api/empleados/upload)
router.post('/upload', upload.single('file'), uploadEmpleados);

// Ruta para actualizar el estado de un empleado (PATCH /api/empleados/:id)
router.patch('/:id', toggleEmpleadoStatus);

export default router;
