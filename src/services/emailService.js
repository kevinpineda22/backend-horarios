import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

export const sendEmail = async (to, subject, htmlContent) => {
    try {
        await transporter.sendMail({
            from: `"Gestor de Horarios" <${process.env.SMTP_FROM}>`,
            to,
            subject,
            html: htmlContent,
        });
        console.log(`📨 Correo enviado a ${to}`);
    } catch (error) {
        console.error('❌ Error al enviar el correo:', error);
        throw error;
    }
};