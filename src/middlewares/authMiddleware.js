import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    console.log('Auth middleware - Headers:', {
      authorization: authHeader ? 'Present' : 'Missing',
      userAgent: req.headers['user-agent']?.slice(0, 50),
      origin: req.headers.origin
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth middleware - No valid Bearer token found');
      return res.status(401).json({ message: 'Token de acceso requerido' });
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    
    if (!token) {
      console.log('Auth middleware - Empty token after Bearer');
      return res.status(401).json({ message: 'Token vacío' });
    }

    // Verificar JWT usando el secreto de Supabase
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    
    console.log('Auth middleware - Token decoded successfully for user:', decoded.sub);
    
    // Agregar información del usuario al request
    req.user = { 
      id: decoded.sub,
      email: decoded.email,
      ...decoded 
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware - Token verification failed:', {
      error: error.message,
      name: error.name,
      tokenPresent: !!req.headers.authorization
    });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Token inválido' });
    } else {
      return res.status(401).json({ message: 'Error de autenticación' });
    }
  }
};