// src/routes/lider.js
import { Router } from "express";
const router = Router();
import authenticateLider from "../middlewares/authMiddleware.js";
import {
  getHorariosByEmpleadoId,
  createHorario,
  updateHorario,
  deleteHorario,
} from "../controllers/horariosController.js";
import {
  getObservacionesByEmpleadoId,
  createObservacion,
  updateObservacion,
  deleteObservacion,
} from "../controllers/observacionesController.js";
import supabase from "../services/supabase.service.js";

router.use(authenticateLider);

router.get("/empleados", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("empleados")
      .select("id, cedula, nombre_completo")
      .order("nombre_completo");
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error("Error al obtener empleados:", error);
    res.status(500).send("Error al obtener empleados.");
  }
});

router.get("/horarios/:empleado_id", getHorariosByEmpleadoId);
router.post("/horarios", createHorario);
router.put("/horarios/:id", updateHorario);
router.delete("/horarios/:id", deleteHorario);

router.get("/observaciones/:empleado_id", getObservacionesByEmpleadoId);
router.post("/observaciones", createObservacion);
router.put("/observaciones/:id", updateObservacion);
router.delete("/observaciones/:id", deleteObservacion);

export default router;
