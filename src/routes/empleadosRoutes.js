// src/routes/empleadosRoutes.js
import express from 'express';
import { getEmpleados, createEmpleado, uploadEmpleados, toggleEmpleadoStatus } from '../controllers/empleadosController.js';
import multer from 'multer';

const router = express.Router();
const upload = multer(); // Configura multer para manejar archivos en memoria

// Ruta para obtener la lista de todos los empleados
router.get('/empleados', getEmpleados);

// Ruta para la creación manual de un empleado
router.post('/empleados', createEmpleado);

// Ruta para la carga masiva de empleados
router.post('/empleados/upload', upload.single('file'), uploadEmpleados);

// Ruta para actualizar el estado de un empleado
router.patch('/empleados/:id', toggleEmpleadoStatus);

export default router;
