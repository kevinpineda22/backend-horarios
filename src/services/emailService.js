import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Configuración corregida para Outlook/Office 365
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true", // false para STARTTLS en puerto 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendEmail = async (to, subject, htmlContent) => {
  try {
    const info = await transporter.sendMail({
      from: `"Sistema de Horarios" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent,
    });

    console.log(`📨 Correo enviado a ${to}:`, info.messageId);
    return info; // Devolver información del envío exitoso
  } catch (error) {
    console.error("❌ Error al enviar el correo:", error);
    // Relanzar el error para que pueda ser manejado por el llamador
    throw error;
  }
};
