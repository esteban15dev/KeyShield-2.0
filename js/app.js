// Referencias del DOM del Dashboard
const categoriesListEl = document.getElementById('categories-list');
const accountsListEl = document.getElementById('accounts-list');
const searchInput = document.getElementById('search-input');
const accountsCountEl = document.getElementById('accounts-count');

// Modales y botones
const accountModal = document.getElementById('account-modal');
const categoryModal = document.getElementById('category-modal');
const btnAddAccount = document.getElementById('btn-add-account');
const btnAddCategory = document.getElementById('btn-add-category');

const accountForm = document.getElementById('account-form');
const categoryForm = document.getElementById('category-form');

const btnGenPass = document.getElementById('btn-gen-pass');
const btnToggleModalPass = document.getElementById('btn-toggle-modal-pass');
const modalPassInput = document.getElementById('acc-password');

// Cierre de modales
document.querySelectorAll('.btn-close-modal').forEach(btn => {
  btn.addEventListener('click', () => accountModal.classList.add('hidden'));
});
document.querySelectorAll('.btn-close-cat-modal').forEach(btn => {
  btn.addEventListener('click', () => categoryModal.classList.add('hidden'));
});

// Variables de estado local
let allAccounts = [];
let allCategories = [];
let selectedCategoryId = null; // null significa "Todos"
let deferredPrompt = null;

// Capturar el evento de instalación de la PWA
window.addEventListener('beforeinstallprompt', (e) => {
  // Evitar que el navegador muestre el banner por defecto
  e.preventDefault();
  // Guardar el evento para dispararlo luego
  deferredPrompt = e;
  // Mostrar nuestro botón personalizado en la UI
  const installBtn = document.getElementById('btn-install-app');
  if (installBtn) {
    installBtn.classList.remove('hidden');
  }
});

// Configurar acción del botón de instalación
document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('btn-install-app');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      // Mostrar prompt nativo
      deferredPrompt.prompt();
      // Esperar respuesta del usuario
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Usuario eligió instalar: ${outcome}`);
      // Limpiar el prompt diferido
      deferredPrompt = null;
      // Ocultar botón
      installBtn.classList.add('hidden');
    });
  }
});

window.addEventListener('appinstalled', (evt) => {
  console.log('KeyShield ha sido instalada correctamente.');
  const installBtn = document.getElementById('btn-install-app');
  if (installBtn) {
    installBtn.classList.add('hidden');
  }
  showToast('¡KeyShield instalada con éxito!');
});

// Obtener token
function getAuthHeader() {
  const token = localStorage.getItem('keyshield_token');
  return { 'Authorization': `Bearer ${token}` };
}

// Inicialización de la aplicación principal
window.initializeDashboard = async function() {
  updateConnectionBadge();
  await fetchCategories();
  await fetchAccounts();
};

// Monitorear cambios de red
window.addEventListener('online', () => {
  updateConnectionBadge();
  showToast('Conexión restablecida. Sincronizando datos...');
  window.initializeDashboard();
});

window.addEventListener('offline', () => {
  updateConnectionBadge();
  showToast('Trabajando en modo local (Offline).');
});

function updateConnectionBadge() {
  const badge = document.getElementById('offline-badge');
  if (badge) {
    if (navigator.onLine) {
      badge.classList.add('hidden');
    } else {
      badge.classList.remove('hidden');
    }
  }
}

// ==========================================
// SECCIÓN DE CATEGORÍAS
// ==========================================

async function fetchCategories() {
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/clasificaciones', {
        headers: getAuthHeader()
      });
      if (res.status === 403 || res.status === 401) {
        localStorage.removeItem('keyshield_token');
        window.location.reload();
        return;
      }
      allCategories = await res.json();
      
      // Guardar copia local en IndexedDB
      if (window.offlineDB) {
        await window.offlineDB.saveClasificaciones(allCategories);
      }
    } catch (err) {
      console.error('Error al obtener clasificaciones online:', err);
    }
  } else {
    // Si está offline, recuperar de IndexedDB
    if (window.offlineDB) {
      try {
        allCategories = await window.offlineDB.getClasificaciones();
      } catch (err) {
        console.error('Error al leer clasificaciones offline:', err);
      }
    }
  }
  
  renderCategories();
  renderCategoriesInModal();
}

function renderCategories() {
  // Limpiar listado
  categoriesListEl.innerHTML = '';

  // Botón "Todos"
  const allChip = document.createElement('div');
  allChip.className = `category-chip ${selectedCategoryId === null ? 'active' : ''}`;
  allChip.innerHTML = `<i class="ri-apps-2-line"></i> <span>Todos</span>`;
  allChip.addEventListener('click', () => {
    selectedCategoryId = null;
    renderCategories();
    filterAndRenderAccounts();
  });
  categoriesListEl.appendChild(allChip);

  // Botones dinámicos de categorías
  allCategories.forEach(cat => {
    const chip = document.createElement('div');
    chip.className = `category-chip ${selectedCategoryId === cat.id_clasificacion ? 'active' : ''}`;
    chip.style.borderColor = cat.color;
    chip.innerHTML = `
      <i class="ri-${cat.icono || 'folder-line'}" style="color: ${cat.color}"></i>
      <span>${cat.nombre}</span>
    `;
    chip.addEventListener('click', () => {
      selectedCategoryId = cat.id_clasificacion;
      renderCategories();
      filterAndRenderAccounts();
    });
    categoriesListEl.appendChild(chip);
  });
}

// Cargar categorías dentro del modal de Cuentas (Checkboxes)
function renderCategoriesInModal() {
  const grid = document.getElementById('modal-categories-grid');
  grid.innerHTML = '';

  allCategories.forEach(cat => {
    const label = document.createElement('label');
    label.className = 'cat-check-label';
    label.innerHTML = `
      <input type="checkbox" name="modal-cats" value="${cat.id_clasificacion}">
      <i class="ri-${cat.icono || 'folder-line'}" style="color: ${cat.color}"></i>
      <span>${cat.nombre}</span>
    `;
    grid.appendChild(label);
  });
}

// Crear nueva categoría
btnAddCategory.addEventListener('click', () => {
  categoryForm.reset();
  categoryModal.classList.remove('hidden');
});

categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('cat-name').value;
  const color = document.querySelector('input[name="cat-color"]:checked').value;

  try {
    const res = await fetch('/api/clasificaciones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ nombre, color, icono: 'folder-line' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Categoría creada exitosamente.');
    categoryModal.classList.add('hidden');
    await fetchCategories();
  } catch (err) {
    showToast(err.message);
  }
});


// ==========================================
// SECCIÓN DE CUENTAS
// ==========================================

async function fetchAccounts() {
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/cuentas', {
        headers: getAuthHeader()
      });
      allAccounts = await res.json();
      
      // Guardar en la base de datos local
      if (window.offlineDB) {
        await window.offlineDB.saveCuentas(allAccounts);
      }
    } catch (err) {
      console.error('Error al cargar cuentas online:', err);
    }
  } else {
    // Modo Offline: Cargar copia local de IndexedDB
    if (window.offlineDB) {
      try {
        allAccounts = await window.offlineDB.getCuentas();
      } catch (err) {
        console.error('Error al cargar cuentas offline:', err);
      }
    }
  }
  filterAndRenderAccounts();
}

function filterAndRenderAccounts() {
  const searchTerm = searchInput.value.toLowerCase().trim();

  const filtered = allAccounts.filter(acc => {
    // 1. Filtro por categoría seleccionada
    const matchesCategory = selectedCategoryId === null || 
      acc.clasificaciones.some(cat => cat.id_clasificacion === selectedCategoryId);

    // 2. Filtro por término de búsqueda
    const matchesSearch = acc.nombre_servicio.toLowerCase().includes(searchTerm) ||
      acc.nombre_cuenta.toLowerCase().includes(searchTerm) ||
      (acc.notas && acc.notas.toLowerCase().includes(searchTerm));

    return matchesCategory && matchesSearch;
  });

  accountsCountEl.textContent = `${filtered.length} cuenta${filtered.length === 1 ? '' : 's'} guardada${filtered.length === 1 ? '' : 's'}`;
  renderAccounts(filtered);
}

// Búsqueda en tiempo real
searchInput.addEventListener('input', filterAndRenderAccounts);

function renderAccounts(accounts) {
  accountsListEl.innerHTML = '';

  if (accounts.length === 0) {
    accountsListEl.innerHTML = `
      <div class="empty-state">
        <i class="ri-shield-line"></i>
        <p>No se encontraron cuentas.</p>
      </div>
    `;
    return;
  }

  accounts.forEach(acc => {
    const card = document.createElement('article');
    card.className = 'account-card';
    card.setAttribute('data-id', acc.id_cuenta);

    // Formatear categorías asignadas
    const tagsHtml = acc.clasificaciones.map(tag => `
      <span class="tag-badge" style="background-color: ${tag.color}15; color: ${tag.color}; border: 1px solid ${tag.color}30">
        <i class="ri-${tag.icono || 'folder-line'}"></i>
        ${tag.nombre}
      </span>
    `).join('');

    card.innerHTML = `
      <div class="account-top">
        <div class="service-info">
          <h3>${escapeHtml(acc.nombre_servicio)}</h3>
          <p>${escapeHtml(acc.nombre_cuenta)}</p>
        </div>
        <div class="account-actions">
          <button class="btn-action-icon btn-share" title="Compartir"><i class="ri-share-line"></i></button>
          <button class="btn-action-icon btn-edit" title="Editar"><i class="ri-edit-line"></i></button>
          <button class="btn-action-icon danger-hover btn-delete" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
        </div>
      </div>

      <div class="tags-row">
        ${tagsHtml}
      </div>

      <div class="password-reveal-area">
        <span class="masked-password" id="pass-display-${acc.id_cuenta}">••••••••••••</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn-action-icon btn-reveal" title="Mostrar contraseña"><i class="ri-eye-line"></i></button>
          <button class="btn-action-icon btn-copy" title="Copiar contraseña" style="display: none;"><i class="ri-file-copy-line"></i></button>
        </div>
      </div>
      
      ${acc.notas ? `<p class="account-notes" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;"><strong>Notas:</strong> ${escapeHtml(acc.notas)}</p>` : ''}
    `;

    // Eventos
    const btnReveal = card.querySelector('.btn-reveal');
    const btnCopy = card.querySelector('.btn-copy');
    const passDisplay = card.querySelector(`#pass-display-${acc.id_cuenta}`);

    let decryptedPass = null;

    btnReveal.addEventListener('click', async () => {
      const eyeIcon = btnReveal.querySelector('i');
      if (eyeIcon.classList.contains('ri-eye-line')) {
        // Cargar/Descifrar si no está en caché
        if (!decryptedPass) {
          decryptedPass = await decryptPassword(acc.id_cuenta);
        }
        
        if (decryptedPass) {
          passDisplay.textContent = decryptedPass;
          passDisplay.className = 'revealed-password';
          eyeIcon.className = 'ri-eye-off-line';
          btnCopy.style.display = 'inline-flex';
        }
      } else {
        passDisplay.textContent = '••••••••••••';
        passDisplay.className = 'masked-password';
        eyeIcon.className = 'ri-eye-line';
        btnCopy.style.display = 'none';
      }
    });

    btnCopy.addEventListener('click', () => {
      if (decryptedPass) {
        navigator.clipboard.writeText(decryptedPass);
        showToast('¡Contraseña copiada al portapapeles!');
      }
    });

    // Evento de compartir cuenta de forma nativa
    const btnShare = card.querySelector('.btn-share');
    btnShare.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Credenciales de ${acc.nombre_servicio}`,
            text: `Servicio: ${acc.nombre_servicio}\nUsuario: ${acc.nombre_cuenta}${acc.url_servicio ? `\nEnlace: ${acc.url_servicio}` : ''}\n\nEnviado seguro desde KeyShield.`,
          });
          showToast('Datos compartidos correctamente.');
        } catch (err) {
          // Ignorar si el usuario canceló la acción nativa
          if (err.name !== 'AbortError') {
            showToast('Error al compartir.');
          }
        }
      } else {
        // Fallback si no está disponible la Web Share API (ej. en navegadores de escritorio viejos)
        const textToCopy = `Servicio: ${acc.nombre_servicio}\nUsuario: ${acc.nombre_cuenta}${acc.url_servicio ? `\nEnlace: ${acc.url_servicio}` : ''}`;
        navigator.clipboard.writeText(textToCopy);
        showToast('Datos copiados para compartir.');
      }
    });

    card.querySelector('.btn-edit').addEventListener('click', () => openEditAccountModal(acc));
    card.querySelector('.btn-delete').addEventListener('click', () => deleteAccount(acc.id_cuenta));

    accountsListEl.appendChild(card);
  });
}

// Descifrar contraseña de forma dinámica a demanda
async function decryptPassword(id_cuenta) {
  if (navigator.onLine) {
    try {
      const res = await fetch(`/api/cuentas/${id_cuenta}/ver`, {
        method: 'POST',
        headers: getAuthHeader()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.password;
    } catch (err) {
      showToast('Error al descifrar la contraseña');
      return null;
    }
  } else {
    // Desencriptado local/offline usando la Web Crypto API y el pepper de sessionStorage
    try {
      const acc = allAccounts.find(a => a.id_cuenta === id_cuenta);
      if (!acc) throw new Error('Cuenta no encontrada localmente.');
      
      const user = JSON.parse(localStorage.getItem('keyshield_user'));
      if (!user || !user.salt) throw new Error('Usuario o salt no válidos.');

      if (window.cryptoClient && window.cryptoClient.decryptPasswordOffline) {
        const decrypted = await window.cryptoClient.decryptPasswordOffline(acc.password_cifrada, acc.iv, user.salt);
        if (!decrypted) throw new Error('Criptografía fallida.');
        return decrypted;
      } else {
        throw new Error('Módulo criptográfico no disponible.');
      }
    } catch (err) {
      console.error('Error descifrado offline:', err);
      showToast('Error al descifrar la contraseña en modo offline');
      return null;
    }
  }
}

// Eliminar cuenta
async function deleteAccount(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta cuenta permanentemente?')) return;

  try {
    const res = await fetch(`/api/cuentas/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    if (!res.ok) throw new Error('No se pudo eliminar la cuenta');
    
    showToast('Cuenta eliminada.');
    await fetchAccounts();
  } catch (err) {
    showToast(err.message);
  }
}

// ==========================================
// MANEJO DEL MODAL DE CREAR / EDITAR
// ==========================================

btnAddAccount.addEventListener('click', () => {
  document.getElementById('account-id').value = '';
  accountForm.reset();
  document.getElementById('modal-title').textContent = 'Añadir Cuenta';
  // Desmarcar todos los checkboxes del modal
  document.querySelectorAll('input[name="modal-cats"]').forEach(cb => cb.checked = false);
  accountModal.classList.remove('hidden');
});

function openEditAccountModal(account) {
  document.getElementById('account-id').value = account.id_cuenta;
  document.getElementById('acc-service').value = account.nombre_servicio;
  document.getElementById('acc-url').value = account.url_servicio || '';
  document.getElementById('acc-username').value = account.nombre_cuenta;
  document.getElementById('acc-notes').value = account.notas || '';
  document.getElementById('modal-title').textContent = 'Editar Cuenta';
  
  // No rellenamos la contraseña por defecto para forzar que sea opcional en la actualización
  modalPassInput.value = '';
  modalPassInput.placeholder = '•••••••••••• (dejar vacío si no cambia)';
  modalPassInput.required = false;

  // Marcar los checkboxes correspondientes
  document.querySelectorAll('input[name="modal-cats"]').forEach(cb => {
    cb.checked = account.clasificaciones.some(cat => cat.id_clasificacion == cb.value);
  });

  accountModal.classList.remove('hidden');
}

// Submit del Formulario del Modal (Cuentas)
accountForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('account-id').value;
  const nombre_servicio = document.getElementById('acc-service').value;
  const url_servicio = document.getElementById('acc-url').value;
  const nombre_cuenta = document.getElementById('acc-username').value;
  const password_texto_plano = modalPassInput.value;
  const notas = document.getElementById('acc-notes').value;

  // Obtener clasificaciones seleccionadas
  const clasificaciones = Array.from(document.querySelectorAll('input[name="modal-cats"]:checked'))
    .map(cb => parseInt(cb.value));

  const body = { nombre_servicio, url_servicio, nombre_cuenta, notas, clasificaciones };
  
  // Agregar contraseña si está especificada o si es una creación obligatoria
  if (password_texto_plano) {
    body.password_texto_plano = password_texto_plano;
  }

  const isEdit = id !== '';
  const url = isEdit ? `/api/cuentas/${id}` : '/api/cuentas';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar');

    showToast(isEdit ? 'Cuenta actualizada correctamente.' : 'Cuenta guardada correctamente.');
    accountModal.classList.add('hidden');
    await fetchAccounts();
  } catch (err) {
    showToast(err.message);
  }
});

// Generador de contraseñas seguras integrado en el Modal
btnGenPass.addEventListener('click', () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
  let pass = "";
  for (let i = 0; i < 16; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  modalPassInput.value = pass;
  modalPassInput.type = 'text'; // Mostrar en claro al generar
  btnToggleModalPass.querySelector('i').className = 'ri-eye-off-line';
  showToast('Contraseña aleatoria generada de 16 caracteres.');
});

// Botón Mostrar/Ocultar del Modal
btnToggleModalPass.addEventListener('click', () => {
  const eyeIcon = btnToggleModalPass.querySelector('i');
  if (modalPassInput.type === 'password') {
    modalPassInput.type = 'text';
    eyeIcon.className = 'ri-eye-off-line';
  } else {
    modalPassInput.type = 'password';
    eyeIcon.className = 'ri-eye-line';
  }
});

// Helper de seguridad para escapar HTML y prevenir XSS en el renderizado
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

// ==========================================
// DETECCIÓN DE FORTALEZA DE CONTRASEÑA (Fase 5)
// ==========================================
const strengthBar = document.getElementById('password-strength-bar');
const strengthText = document.getElementById('password-strength-text');

modalPassInput.addEventListener('input', () => {
  const value = modalPassInput.value;
  let score = 0;

  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  let color = 'var(--text-muted)';
  let text = 'Muy corta';
  let width = '0%';

  if (value.length > 0) {
    if (score <= 2) {
      color = 'var(--accent-danger)';
      text = 'Débil 🔴';
      width = '33%';
    } else if (score <= 4) {
      color = '#f59e0b'; // Amarillo/Naranja
      text = 'Media 🟡';
      width = '66%';
    } else {
      color = 'var(--accent-success)';
      text = 'Fuerte 🟢';
      width = '100%';
    }
  }

  strengthBar.style.backgroundColor = color;
  strengthBar.style.width = width;
  strengthText.textContent = `Fuerza de la contraseña: ${text}`;
});

// ==========================================
// TEMPORIZADOR DE AUTO-LOGOUT (Fase 5)
// ==========================================
let inactivityTimeout;

function resetInactivityTimer() {
  clearTimeout(inactivityTimeout);
  
  // 15 minutos = 15 * 60 * 1000 ms
  inactivityTimeout = setTimeout(() => {
    const token = localStorage.getItem('keyshield_token');
    if (token) {
      localStorage.removeItem('keyshield_token');
      localStorage.removeItem('keyshield_user');
      window.location.reload();
      alert('Tu sesión ha expirado por inactividad.');
    }
  }, 15 * 60 * 1000);
}

// Registrar eventos de interacción para resetear el temporizador de inactividad
['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'].forEach(event => {
  document.addEventListener(event, resetInactivityTimer, true);
});

// Inicializar el temporizador al cargar la página
resetInactivityTimer();

