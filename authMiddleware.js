const jwt = require('jsonwebtoken');
const db = require('./db'); // Cliente de Supabase
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'desarrollo_secreto_12345';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Obtener información adicional del usuario desde Supabase
    const { data: rows, error } = await db
      .from('usuario')
      .select('id_usuario, nombre_usuario, email, salt')
      .eq('id_usuario', decoded.id_usuario);

    if (error) {
      console.error('Error al verificar usuario en middleware:', error);
      return res.status(500).json({ error: 'Error al verificar autenticación.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Guardar los datos completos del usuario en el objeto request
    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
}

module.exports = authMiddleware;
