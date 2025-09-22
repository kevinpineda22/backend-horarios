import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log("Auth middleware - Headers:", {
    authorization: authHeader ? "Present" : "Missing",
    userAgent: req.headers["user-agent"],
    origin: req.headers.origin,
  });

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Auth middleware - No valid Bearer token found");
    return res.status(401).json({ message: "Token de acceso requerido" });
  }

  const token = authHeader.substring(7); // Remove "Bearer "

  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    console.log(
      "Auth middleware - Token decoded successfully for user:",
      decoded.sub
    );
    req.user = { id: decoded.sub, ...decoded };
    next();
  } catch (error) {
    console.error("Auth middleware - Token verification failed:", {
      error: error.message,
      tokenPresent: !!token,
      tokenLength: token?.length,
    });
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
