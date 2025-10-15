import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";

import horariosRoutes from "./src/routes/horarios.js";
import observacionesRoutes from "./src/routes/observaciones.js";
import publicRoutes from "./src/routes/public.js";
import empleadosRoutes from "./src/routes/empleadosRoutes.js";
import hoursBankRoutes from "./src/routes/hoursBank.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: true, // Temporalmente permitir todos los orígenes para debug
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 200,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/horarios", horariosRoutes);
app.use("/api/observaciones", observacionesRoutes);
app.use("/api/empleados", empleadosRoutes);
app.use("/api/horas-compensacion", hoursBankRoutes);
app.use("/api/public", publicRoutes);

app.get("/", (_, res) => res.send("Gestor de Horarios API corriendooooo"));

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log(`Server on port ${PORT}`));
}

export default app;
