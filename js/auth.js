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

// Iniciar sesión con Google OAuth
async function signInWithGoogle() {
  try {
    const { data, error } = await window.sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  } catch (error) {
    showToast(error.message || 'Error al conectar con Google.');
    console.error('Error Google OAuth:', error);
  }
}

// Escuchar clics en los botones de Google
document.querySelectorAll('.btn-google-login').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    signInWithGoogle();
  });
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

  // Loading state en el botón de registro
  const submitBtn = document.getElementById('btn-register-submit');
  const originalContent = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 1s linear infinite;"></i> <span>Creando cuenta...</span>';

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

    // Mostrar pantalla de confirmación clara para verificación de correo
    document.getElementById('confirm-email-display').textContent = email;
    registerForm.classList.add('hidden');
    document.getElementById('email-confirm-screen').classList.remove('hidden');
    document.getElementById('auth-subtitle').textContent = 'Verifica tu cuenta';
    
    registerForm.reset();
  } catch (error) {
    showToast(error.message || 'Error en el registro');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalContent;
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

// Botón de retorno al registro desde confirmación
document.getElementById('btn-back-to-register').addEventListener('click', () => {
  document.getElementById('email-confirm-screen').classList.add('hidden');
  registerForm.classList.remove('hidden');
  document.getElementById('auth-subtitle').textContent = 'Crea tu cuenta de almacenamiento cifrado';
});

// Botón "Ya verifiqué, ir a Iniciar Sesión"
document.getElementById('btn-back-to-login').addEventListener('click', () => {
  document.getElementById('email-confirm-screen').classList.add('hidden');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  document.getElementById('auth-subtitle').textContent = 'Guarda y organiza tus accesos de forma segura';
  showToast('¡Genial! Ahora inicia sesión con tu cuenta verificada.');
});

// Cierre de Sesión
const logoutAction = async () => {
  try {
    await window.sb.auth.signOut();
    sessionStorage.removeItem('keyshield_master');
    document.getElementById('reauth-modal').classList.add('hidden');
    if (window.offlineDB) {
      await window.offlineDB.clearOfflineData();
    }
    showToast('Sesión cerrada.');
  } catch (err) {
    console.error('Error al cerrar sesión:', err);
  }
};

document.getElementById('btn-logout').addEventListener('click', logoutAction);
document.getElementById('btn-reauth-logout').addEventListener('click', logoutAction);

// Manejo del formulario de re-autenticación rápida
document.getElementById('reauth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('reauth-password').value;

  try {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session || !session.user) {
      throw new Error('No hay sesión de Supabase activa. Inicie sesión de nuevo.');
    }

    const salt = session.user.user_metadata?.salt;
    const vaultCheck = session.user.user_metadata?.vault_check;

    if (vaultCheck && salt) {
      // 1. Verificación criptográfica con vault_check
      const computedHash = await window.cryptoClient.hashVaultPassword(password, salt);
      if (computedHash !== vaultCheck) {
        throw new Error('Contraseña de bóveda incorrecta.');
      }
    } else {
      // 2. Si no tiene vault_check, intentamos validar con credenciales de Supabase (usuarios antiguos)
      let isValidPassword = false;
      try {
        const { error } = await window.sb.auth.signInWithPassword({
          email: session.user.email,
          password: password
        });
        if (!error) isValidPassword = true;
      } catch (_) {}

      // Si es un usuario nuevo de Google que apenas está creando su contraseña de bóveda
      const isGoogleUser = session.user.app_metadata?.provider === 'google' || 
                           session.user.identities?.some(id => id.provider === 'google');

      if (!isValidPassword && !isGoogleUser) {
        throw new Error('Contraseña de bóveda incorrecta.');
      }

      if (isGoogleUser && !isValidPassword && password.length < 8) {
        throw new Error('La contraseña de bóveda debe tener al menos 8 caracteres.');
      }

      // Inicializar y guardar el vault_check en los metadatos para futuras validaciones estrictas
      if (salt) {
        const newVaultHash = await window.cryptoClient.hashVaultPassword(password, salt);
        await window.sb.auth.updateUser({
          data: { vault_check: newVaultHash }
        });
      }
    }

    // Contraseña válida, guardar en sessionStorage para cifrado/descifrado en memoria
    sessionStorage.setItem('keyshield_master', password);
    document.getElementById('reauth-password').value = '';
    document.getElementById('reauth-modal').classList.add('hidden');
    
    showToast('Bóveda desbloqueada con éxito.');
    
    // Inicializar dashboard
    if (window.initializeDashboard) {
      window.initializeDashboard();
    }
  } catch (err) {
    showToast(err.message || 'Contraseña incorrecta.');
  }
});

// Verificar si hay sesión activa y sincronizar UI
async function checkAuth() {
  const { data: { session } } = await window.sb.auth.getSession();
  
  if (session && session.user) {
    // Si es un usuario que ingresó con Google y aún no tiene salt asignado, se lo generamos
    if (!session.user.user_metadata?.salt) {
      const generatedSalt = generateSalt();
      const friendlyName = session.user.user_metadata?.full_name || 
                           session.user.email.split('@')[0];
      await window.sb.auth.updateUser({
        data: {
          salt: generatedSalt,
          nombre_usuario: session.user.user_metadata?.nombre_usuario || friendlyName
        }
      });
    }

    // Ocultar Auth Container y mostrar App Container
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    const userMetadata = session.user.user_metadata || {};
    document.getElementById('user-display').textContent = userMetadata.nombre_usuario || userMetadata.full_name || session.user.email;
    
    // Verificar si la contraseña maestra se perdió en sessionStorage (pestaña recargada, app cerrada)
    const masterPassword = sessionStorage.getItem('keyshield_master');
    if (!masterPassword) {
      // Mostrar el modal de re-autenticación rápida
      document.getElementById('reauth-modal').classList.remove('hidden');
    } else {
      // Todo listo, disparar dashboard
      if (window.initializeDashboard) {
        window.initializeDashboard();
      }
    }
  } else {
    appContainer.classList.add('hidden');
    authContainer.classList.remove('hidden');
    // Asegurar ocultamiento de pantallas adicionales
    document.getElementById('email-confirm-screen').classList.add('hidden');
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
