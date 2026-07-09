const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db'); // Cliente de Supabase
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar Rate Limiter para Auth
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de inicio de sesión desde esta IP. Intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(__dirname));

// Endpoint de Registro
app.post('/api/auth/register', async (req, res) => {
  const { nombre_usuario, email, password } = req.body;

  if (!nombre_usuario || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    // Verificar si el usuario ya existe
    const { data: existing, error: checkError } = await db
      .from('usuario')
      .select('id_usuario')
      .or(`nombre_usuario.eq.${nombre_usuario},email.eq.${email}`);

    if (checkError) throw checkError;

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario o correo ya está registrado.' });
    }

    // Hashear contraseña
    const password_hash = await bcrypt.hash(password, 10);
    const salt = crypto.randomBytes(32).toString('hex');

    // Insertar usuario
    const { error: insertError } = await db
      .from('usuario')
      .insert([{ nombre_usuario, email, password_hash, salt }]);

    if (insertError) throw insertError;

    res.status(201).json({ message: 'Usuario registrado con éxito.' });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Endpoint de Login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  try {
    // Buscar usuario
    const { data: users, error: findError } = await db
      .from('usuario')
      .select('id_usuario, nombre_usuario, email, password_hash, salt')
      .eq('email', email);

    if (findError) throw findError;

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const user = users[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    // Generar Token JWT
    const token = jwt.sign(
      { id_usuario: user.id_usuario, nombre_usuario: user.nombre_usuario },
      process.env.JWT_SECRET || 'desarrollo_secreto_12345',
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login exitoso.',
      token,
      usuario: {
        id_usuario: user.id_usuario,
        nombre_usuario: user.nombre_usuario,
        email: user.email,
        salt: user.salt
      },
      pepper: process.env.JWT_SECRET || 'llave_secreta_por_defecto_para_pepper'
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

const authMiddleware = require('./authMiddleware');
const cryptoHelper = require('./cryptoHelper');

// ==========================================
// ENDPOINTS DE LA API DE CUENTAS
// ==========================================

// 1. Crear Cuenta
app.post('/api/cuentas', authMiddleware, async (req, res) => {
  const { nombre_servicio, url_servicio, nombre_cuenta, password_texto_plano, notas, clasificaciones } = req.body;

  if (!nombre_servicio || !nombre_cuenta || !password_texto_plano) {
    return res.status(400).json({ error: 'El servicio, la cuenta y la contraseña son campos obligatorios.' });
  }

  try {
    // Cifrar la contraseña
    const { encryptedData, iv } = cryptoHelper.encrypt(password_texto_plano, req.user.salt);

    // Insertar cuenta y obtener el ID retornado
    const { data: accountData, error: accountError } = await db
      .from('cuenta')
      .insert([{
        id_usuario: req.user.id_usuario,
        nombre_servicio,
        url_servicio: url_servicio || null,
        nombre_cuenta,
        password_cifrada: encryptedData,
        iv,
        notas: notas || null
      }])
      .select('id_cuenta');

    if (accountError) throw accountError;

    const id_cuenta = accountData[0].id_cuenta;

    // Si se enviaron clasificaciones, asociarlas
    if (clasificaciones && Array.isArray(clasificaciones) && clasificaciones.length > 0) {
      const bridgeRows = clasificaciones.map(id_clasif => ({
        id_cuenta,
        id_clasificacion: id_clasif
      }));

      const { error: bridgeError } = await db
        .from('cuenta_clasificacion')
        .insert(bridgeRows);

      if (bridgeError) throw bridgeError;
    }

    res.status(201).json({
      message: 'Cuenta guardada exitosamente.',
      id_cuenta
    });
  } catch (error) {
    console.error('Error al crear cuenta:', error);
    res.status(500).json({ error: 'Error interno al guardar la cuenta.' });
  }
});

// 2. Listar Cuentas
app.get('/api/cuentas', authMiddleware, async (req, res) => {
  try {
    // Obtener todas las cuentas del usuario (con cifrado e iv incluidos para el soporte offline del cliente)
    const { data: cuentas, error: cuentasError } = await db
      .from('cuenta')
      .select('id_cuenta, nombre_servicio, url_servicio, nombre_cuenta, password_cifrada, iv, notas, fecha_creacion, fecha_modificacion')
      .eq('id_usuario', req.user.id_usuario)
      .order('nombre_servicio', { ascending: true });

    if (cuentasError) throw cuentasError;

    if (!cuentas || cuentas.length === 0) {
      return res.json([]);
    }

    // Obtener relaciones de clasificación
    const { data: relaciones, error: relError } = await db
      .from('cuenta_clasificacion')
      .select(`
        id_cuenta,
        clasificacion!inner (
          id_clasificacion,
          nombre,
          color,
          icono,
          id_usuario
        )
      `)
      .eq('clasificacion.id_usuario', req.user.id_usuario); // traemos los tags del usuario y globales

    // Alternativa robusta para traer también los globales (id_usuario IS NULL)
    // Para simplificar, obtenemos todas las relaciones unidas a las clasificaciones accesibles
    const { data: relacionesFull, error: relFullError } = await db
      .from('cuenta_clasificacion')
      .select('id_cuenta, id_clasificacion, clasificacion(id_clasificacion, nombre, color, icono, id_usuario)');

    if (relFullError) throw relFullError;

    // Mapear clasificaciones a cuentas
    const cuentasConClasificaciones = cuentas.map(cuenta => {
      const tags = relacionesFull
        .filter(rel => rel.id_cuenta === cuenta.id_cuenta && rel.clasificacion)
        .map(rel => ({
          id_clasificacion: rel.clasificacion.id_clasificacion,
          nombre: rel.clasificacion.nombre,
          color: rel.clasificacion.color,
          icono: rel.clasificacion.icono
        }));
      return { ...cuenta, clasificaciones: tags };
    });

    res.json(cuentasConClasificaciones);
  } catch (error) {
    console.error('Error al listar cuentas:', error);
    res.status(500).json({ error: 'Error interno al obtener las cuentas.' });
  }
});

// 3. Ver/Descifrar una contraseña específica
app.post('/api/cuentas/:id/ver', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: rows, error } = await db
      .from('cuenta')
      .select('password_cifrada, iv')
      .eq('id_cuenta', id)
      .eq('id_usuario', req.user.id_usuario);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Cuenta no encontrada o sin permisos.' });
    }

    const { password_cifrada, iv } = rows[0];
    const password_descifrada = cryptoHelper.decrypt(password_cifrada, iv, req.user.salt);

    res.json({ password: password_descifrada });
  } catch (error) {
    console.error('Error al descifrar contraseña:', error);
    res.status(500).json({ error: 'Error al descifrar la contraseña.' });
  }
});

// 4. Editar Cuenta
app.put('/api/cuentas/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { nombre_servicio, url_servicio, nombre_cuenta, password_texto_plano, notas, clasificaciones } = req.body;

  if (!nombre_servicio || !nombre_cuenta) {
    return res.status(400).json({ error: 'El servicio y la cuenta son obligatorios.' });
  }

  try {
    // Verificar propiedad
    const { data: existing, error: existError } = await db
      .from('cuenta')
      .select('id_cuenta')
      .eq('id_cuenta', id)
      .eq('id_usuario', req.user.id_usuario);

    if (existError) throw existError;

    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Cuenta no encontrada o sin permisos.' });
    }

    const updateData = {
      nombre_servicio,
      url_servicio: url_servicio || null,
      nombre_cuenta,
      notas: notas || null,
      fecha_modificacion: new Date().toISOString()
    };

    if (password_texto_plano) {
      const { encryptedData, iv } = cryptoHelper.encrypt(password_texto_plano, req.user.salt);
      updateData.password_cifrada = encryptedData;
      updateData.iv = iv;
    }

    const { error: updateError } = await db
      .from('cuenta')
      .update(updateData)
      .eq('id_cuenta', id)
      .eq('id_usuario', req.user.id_usuario);

    if (updateError) throw updateError;

    // Eliminar relaciones anteriores
    const { error: deleteRelError } = await db
      .from('cuenta_clasificacion')
      .delete()
      .eq('id_cuenta', id);

    if (deleteRelError) throw deleteRelError;

    // Insertar nuevas relaciones
    if (clasificaciones && Array.isArray(clasificaciones) && clasificaciones.length > 0) {
      const bridgeRows = clasificaciones.map(id_clasif => ({
        id_cuenta: id,
        id_clasificacion: id_clasif
      }));

      const { error: insertRelError } = await db
        .from('cuenta_clasificacion')
        .insert(bridgeRows);

      if (insertRelError) throw insertRelError;
    }

    res.json({ message: 'Cuenta actualizada exitosamente.' });
  } catch (error) {
    console.error('Error al editar cuenta:', error);
    res.status(500).json({ error: 'Error al actualizar la cuenta.' });
  }
});

// 5. Eliminar Cuenta
app.delete('/api/cuentas/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await db
      .from('cuenta')
      .delete()
      .eq('id_cuenta', id)
      .eq('id_usuario', req.user.id_usuario);

    if (error) throw error;

    res.json({ message: 'Cuenta eliminada exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar cuenta:', error);
    res.status(500).json({ error: 'Error al eliminar la cuenta.' });
  }
});

// ==========================================
// ENDPOINTS DE CLASIFICACIONES
// ==========================================

// 1. Listar Clasificaciones
app.get('/api/clasificaciones', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await db
      .from('clasificacion')
      .select('id_clasificacion, id_usuario, nombre, color, icono')
      .or(`id_usuario.is.null,id_usuario.eq.${req.user.id_usuario}`)
      .order('nombre', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error al listar clasificaciones:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// 2. Crear Clasificación Personalizada
app.post('/api/clasificaciones', authMiddleware, async (req, res) => {
  const { nombre, color, icono } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre de la clasificación es obligatorio.' });
  }

  try {
    const { data, error } = await db
      .from('clasificacion')
      .insert([{
        id_usuario: req.user.id_usuario,
        nombre,
        color: color || '#3b82f6',
        icono: icono || 'folder'
      }])
      .select('id_clasificacion');

    if (error) throw error;

    res.status(201).json({
      message: 'Clasificación creada exitosamente.',
      id_clasificacion: data[0].id_clasificacion
    });
  } catch (error) {
    console.error('Error al crear clasificación:', error);
    res.status(500).json({ error: 'Error al crear la clasificación.' });
  }
});

// 3. Editar Clasificación Personalizada
app.put('/api/clasificaciones/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { nombre, color, icono } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  try {
    const { data, error } = await db
      .from('clasificacion')
      .update({
        nombre,
        color: color || '#3b82f6',
        icono: icono || 'folder'
      })
      .eq('id_clasificacion', id)
      .eq('id_usuario', req.user.id_usuario)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Clasificación no encontrada o no tienes permiso para modificarla.' });
    }

    res.json({ message: 'Clasificación actualizada exitosamente.' });
  } catch (error) {
    console.error('Error al editar clasificación:', error);
    res.status(500).json({ error: 'Error al actualizar la clasificación.' });
  }
});

// 4. Eliminar Clasificación Personalizada
app.delete('/api/clasificaciones/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await db
      .from('clasificacion')
      .delete()
      .eq('id_clasificacion', id)
      .eq('id_usuario', req.user.id_usuario)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Clasificación no encontrada o no tienes permiso para eliminarla.' });
    }

    res.json({ message: 'Clasificación eliminada exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar clasificación:', error);
    res.status(500).json({ error: 'Error al eliminar la clasificación.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
