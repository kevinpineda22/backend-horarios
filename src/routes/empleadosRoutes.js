// src/routes/empleadosRoutes.js
import express from 'express';
import { getEmpleados, createEmpleado, uploadEmpleados, toggleEmpleadoStatus, updateEmpleadoSede, updateEmpleadoDatos } from '../controllers/empleadosController.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import multer from 'multer';

const router = express.Router();
const upload = multer(); // Configura multer para manejar archivos en memoria

// Todas las rutas de empleados requieren autenticación.
router.use(authenticateUser);

// Ruta para obtener la lista de todos los empleados
// GET /api/empleados
router.get('/', getEmpleados);

// Ruta para la creación manual de un empleado
// POST /api/empleados
router.post('/', createEmpleado);

// Ruta para la carga masiva de empleados
// POST /api/empleados/upload
router.post('/upload', upload.single('file'), uploadEmpleados);

// Ruta para cambiar la sede de un empleado
// PATCH /api/empleados/:id/sede
router.patch('/:id/sede', updateEmpleadoSede);

// Ruta para editar los datos básicos de un empleado (cédula, nombre, correo, etc.)
// PATCH /api/empleados/:id/datos
router.patch('/:id/datos', updateEmpleadoDatos);

// Ruta para actualizar el estado de un empleado
// PATCH /api/empleados/:id
router.patch('/:id', toggleEmpleadoStatus);

export default router;