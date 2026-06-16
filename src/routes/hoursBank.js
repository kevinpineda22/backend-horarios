// ⚠️ LEGACY — "Banco de horas" del modelo viejo (exceso sobre 56h/semana).
// La spec controla los extras por QUINCENA (alerta) y la compensación de estudio
// descuenta de los EXTRAS reales acumulados (derivados de los días), no de este
// banco. El sistema YA NO ESCRIBE en `horas_compensacion` (ver horariosController).
// Estas rutas quedan solo de lectura para inspeccionar datos históricos. Se pueden
// eliminar junto con la tabla `horas_compensacion` cuando no se necesite el histórico.
import express from "express";
import {
  listPendingByEmpleado,
  applyToWeeks,
  annulEntry,
  listHistory,
} from "../controllers/hoursBankController.js";

const router = express.Router();

router.get("/:empleadoId/pending", listPendingByEmpleado);
router.get("/:empleadoId/history", listHistory);
router.patch("/apply/:empleadoId", applyToWeeks);
router.patch("/:id/annul", annulEntry);

export default router;
