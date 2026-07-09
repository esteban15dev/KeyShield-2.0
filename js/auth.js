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

// Helper para generar salt criptográfico aleatorio en el cliente
function generateSalt() {
  const arr = new Uint8Array(32);
  window.crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
    // Generar un salt único para derivación de claves en este usuario
    const salt = generateSalt();

    const { data, error } = await window.sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre_usuario,
          salt
        }
      }
    });

    if (error) throw error;

    showToast('¡Registro exitoso! Ya puedes iniciar sesión.');
    registerForm.reset();
    toLoginLink.click();
  } catch (error) {
    showToast(error.message || 'Error en el registro');
  }
});

// Manejo de Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const { data, error } = await window.sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Almacenar contraseña maestra TEMPORALMENTE en sessionStorage para criptografía offline/local
    // No persiste al cerrar la pestaña/ventana del navegador
    sessionStorage.setItem('keyshield_master', password);

    showToast('¡Acceso concedido!');
    loginForm.reset();
  } catch (error) {
    showToast(error.message || 'Error de autenticación');
  }
});

// Cierre de Sesión
document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    await window.sb.auth.signOut();
    sessionStorage.removeItem('keyshield_master');
    if (window.offlineDB) {
      await window.offlineDB.clearOfflineData();
    }
    showToast('Sesión cerrada.');
  } catch (err) {
    console.error('Error al cerrar sesión:', err);
  }
});

// Verificar si hay sesión activa y sincronizar UI
async function checkAuth() {
  const { data: { session } } = await window.sb.auth.getSession();
  
  if (session && session.user) {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    const userMetadata = session.user.user_metadata || {};
    document.getElementById('user-display').textContent = userMetadata.nombre_usuario || session.user.email;
    
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
  // Suscribirse a cambios en el estado de autenticación (Login, Logout, etc.)
  window.sb.auth.onAuthStateChange((event, session) => {
    console.log('Cambio de estado de Auth Supabase:', event);
    checkAuth();
  });

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
