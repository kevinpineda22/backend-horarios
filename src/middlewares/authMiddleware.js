// src/middlewares/authMiddleware.js
import supabase from '../services/supabase.service.js';

const authenticateLider = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) {
    return res.status(401).send('Unauthorized: No token provided');
  }

  const token = authorization.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).send('Unauthorized: Invalid token');
  }

  req.user = user;
  next();
};

export default authenticateLider;