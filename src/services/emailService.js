// emailservice.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Configuración corregida para Outlook/Office 365
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === "true", // false para STARTTLS en puerto 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

export const sendEmail = async (to, subject, htmlContent) => {
    // CRÍTICA: La variable 'to' debe ser una cadena de correos separados por coma
    // si son múltiples (p. ej. "correo1@ejemplo.com,correo2@ejemplo.com")
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
        throw error;
    }
};