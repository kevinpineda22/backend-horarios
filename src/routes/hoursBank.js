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
