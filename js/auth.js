// Utilidades del DOM y notificaciones
const toastEl = document.getElementById('toast');

function showToast(message, duration = 3000) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  
  // Animación básica
  toastEl.style.opacity = '1';
  
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, duration);
}

// Configuración global de la API
const API_URL = '/api';

// Elementos de autenticación
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toRegisterLink = document.getElementById('to-register');
const toLoginLink = document.getElementById('to-login');

// Intercambio de pantallas de auth
toRegisterLink.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  document.getElementById('auth-subtitle').textContent = 'Crea tu cuenta de almacenamiento cifrado';
});

toLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  document.getElementById('auth-subtitle').textContent = 'Guarda y organiza tus accesos de forma segura';
});

// Manejo de Registro
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre_usuario = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  if (password.length < 8) {
    showToast('La contraseña maestra debe tener al menos 8 caracteres.');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario, email, password })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en el registro');
    }

    showToast('¡Registro exitoso! Ya puedes iniciar sesión.');
    registerForm.reset();
    toLoginLink.click();
  } catch (error) {
    showToast(error.message);
  }
});

// Manejo de Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error de autenticación');
    }

    // Almacenar token de sesión y parámetros criptográficos
    localStorage.setItem('keyshield_token', data.token);
    localStorage.setItem('keyshield_user', JSON.stringify(data.usuario));
    sessionStorage.setItem('keyshield_pepper', data.pepper);

    showToast('¡Acceso concedido!');
    loginForm.reset();
    
    // Iniciar dashboard principal
    checkAuth();
  } catch (error) {
    showToast(error.message);
  }
});

// Cierre de Sesión
document.getElementById('btn-logout').addEventListener('click', async () => {
  localStorage.removeItem('keyshield_token');
  localStorage.removeItem('keyshield_user');
  sessionStorage.removeItem('keyshield_pepper');
  if (window.offlineDB) {
    try {
      await window.offlineDB.clearOfflineData();
    } catch (err) {
      console.error('Error al limpiar datos offline:', err);
    }
  }
  checkAuth();
  showToast('Sesión cerrada.');
});

// Verificar si hay sesión activa al cargar
function checkAuth() {
  const token = localStorage.getItem('keyshield_token');
  const user = JSON.parse(localStorage.getItem('keyshield_user'));

  if (token && user) {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    document.getElementById('user-display').textContent = user.nombre_usuario;
    
    // Disparar carga del dashboard en app.js
    if (window.initializeDashboard) {
      window.initializeDashboard();
    }
  } else {
    appContainer.classList.add('hidden');
    authContainer.classList.remove('hidden');
  }
}

// Inicializar autenticación al cargar el documento
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Registrar Service Worker para soporte PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
        .catch(err => console.error('Error al registrar Service Worker:', err));
    });
  }

  // Configurar botones de ojo en formularios de autenticación
  document.querySelectorAll('.btn-auth-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const icon = btn.querySelector('i');

      if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'ri-eye-off-line';
      } else {
        input.type = 'password';
        icon.className = 'ri-eye-line';
      }
    });
  });
});
