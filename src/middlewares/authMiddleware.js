import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

// Logs informativos solo en desarrollo: en producción inundan los logs y filtran
// PII (ids/emails de usuarios). Los errores fatales reales sí se loguean siempre.
const isDev = process.env.NODE_ENV !== 'production';

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (isDev) {
      console.log('Auth middleware - Headers:', {
        authorization: authHeader ? 'Present' : 'Missing',
        userAgent: req.headers['user-agent']?.slice(0, 50),
        origin: req.headers.origin
      });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token de acceso requerido' });
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    if (!token) {
      return res.status(401).json({ message: 'Token vacío' });
    }

    try {
      // Verificar JWT usando el secreto de Supabase
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);

      if (isDev) {
        console.log('Auth middleware - Token verificado para usuario:', decoded.sub);
      }

      // Agregar información del usuario al request
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        ...decoded
      };

      next();

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expirado' });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Token inválido' });
      } else {
        if (isDev) {
          console.error('Auth middleware - Token verification failed:', {
            error: error.message,
            name: error.name
          });
        }
        return res.status(401).json({ message: 'Error de autenticación' });
      }
    }
  } catch (error) {
    // Error inesperado del servidor: se loguea siempre, también en producción.
    console.error('Auth middleware - Fatal error:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};
