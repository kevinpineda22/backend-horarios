import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";

import horariosRoutes from "./routes/horarios.js";
import observacionesRoutes from "./routes/observaciones.js";
import publicRoutes from "./routes/public.js";
import empleadosRoutes from "./routes/empleadosRoutes.js";
import hoursBankRoutes from "./routes/hoursBank.js";

const app = express();
const PORT = process.env.PORT;

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

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
