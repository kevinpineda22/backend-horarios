// app.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";

import publicRoutes from "./src/routes/public.js";
import liderRoutes from "./src/routes/lider.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Manejo global de preflight OPTIONS para CORS
app.options("*", cors());

app.use("/api/public", publicRoutes);
app.use("/api/lider", liderRoutes);

app.get("/", (req, res) => {
  res.status(200).send("yujuuuuuuuuuuuuuuuuuuuu");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
