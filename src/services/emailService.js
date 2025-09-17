import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: false, 
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

export const sendEmail = async (to, subject, htmlContent) => {
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to,
            subject,
            html: htmlContent,
        });
        console.log(`📨 Correo de notificación enviado a ${to}`);
    } catch (error) {
        console.error('❌ Error al enviar el correo:', error);
        // La operación de creación de horario no se interrumpe si el correo falla
    }
};