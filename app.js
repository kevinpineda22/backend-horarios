// app.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";

import publicRoutes from "./src/routes/public.js";
import liderRoutes from "./src/routes/lider.js";

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use("/api/public", publicRoutes);
app.use("/api/lider", liderRoutes);

app.get("/", (req, res) => {
  res.status(200).send("yujuuuuuuuuuuuuuuuuuuuu");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
