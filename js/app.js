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

// Helper para obtener el usuario autenticado y su salt
async function getAuthUserAndSalt() {
  const { data: { session } } = await window.sb.auth.getSession();
  if (!session || !session.user) {
    throw new Error('Sesión de usuario no activa.');
  }
  return {
    userId: session.user.id,
    salt: session.user.user_metadata.salt
  };
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

// Helper para ordenar las categorías de acuerdo al orden guardado
async function sortCategories(categories) {
  let userId = null;
  try {
    const { userId: uid } = await getAuthUserAndSalt();
    userId = uid;
  } catch (_) {}
  
  const orderKey = userId ? `category_order_${userId}` : 'category_order_global';
  const savedOrderStr = localStorage.getItem(orderKey);
  
  if (savedOrderStr) {
    try {
      const savedOrder = JSON.parse(savedOrderStr);
      const orderMap = {};
      savedOrder.forEach((id, index) => {
        orderMap[id] = index;
      });
      
      return categories.sort((a, b) => {
        const aIndex = orderMap[a.id_clasificacion];
        const bIndex = orderMap[b.id_clasificacion];
        if (aIndex !== undefined && bIndex !== undefined) {
          return aIndex - bIndex;
        }
        if (aIndex !== undefined) return -1;
        if (bIndex !== undefined) return 1;
        
        // Orden por defecto
        if (a.id_usuario === null && b.id_usuario !== null) return -1;
        if (a.id_usuario !== null && b.id_usuario === null) return 1;
        return a.nombre.localeCompare(b.nombre);
      });
    } catch (e) {
      console.error('Error al parsear el orden de categorías:', e);
    }
  }
  
  // Orden por defecto
  return categories.sort((a, b) => {
    if (a.id_usuario === null && b.id_usuario !== null) return -1;
    if (a.id_usuario !== null && b.id_usuario === null) return 1;
    return a.nombre.localeCompare(b.nombre);
  });
}

async function fetchCategories() {
  if (navigator.onLine) {
    try {
      const { data, error } = await window.sb
        .from('clasificacion')
        .select('id_clasificacion, id_usuario, nombre, color, icono')
        .order('nombre', { ascending: true });
        
      if (error) throw error;
      
      const rawCategories = data || [];
      allCategories = await sortCategories(rawCategories);
      
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
        const rawCategories = await window.offlineDB.getClasificaciones();
        allCategories = await sortCategories(rawCategories);
      } catch (err) {
        console.error('Error al leer clasificaciones offline:', err);
      }
    }
  }
  
  renderCategories();
  renderCategoriesInModal();
}

function renderCategories() {
  categoriesListEl.innerHTML = '';

  // Botón "Todos"
  const allChip = document.createElement('div');
  allChip.className = `category-chip ${selectedCategoryId === null ? 'active' : ''}`;
  allChip.innerHTML = `<i class="ri-apps-2-line"></i> <span>Todos</span>`;
  allChip.addEventListener('click', (e) => {
    if (isDraggingScroll) return;
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
    chip.dataset.id = cat.id_clasificacion;
    chip.draggable = false; // Por defecto desactivado para no interferir con scroll
    
    // Si la categoría pertenece al usuario (no es global), añadir botón de eliminar
    const isCustom = cat.id_usuario !== null;
    
    chip.innerHTML = `
      <div class="drag-handle" title="Arrastrar para reordenar" style="display: inline-flex; align-items: center; justify-content: center; padding: 4px 6px; margin-left: -8px; margin-right: 2px; cursor: grab; color: var(--text-muted); font-size: 1.1rem;">
        <i class="ri-draggable"></i>
      </div>
      <div class="category-chip-content" style="display: flex; align-items: center; gap: 6px;">
        <i class="ri-${cat.icono || 'folder-line'}" style="color: ${cat.color}"></i>
        <span>${cat.nombre}</span>
      </div>
      ${isCustom ? `<button class="btn-delete-cat" data-id="${cat.id_clasificacion}" title="Eliminar categoría" style="background: none; border: none; padding: 2px; cursor: pointer; color: var(--text-muted); display: inline-flex; align-items: center; margin-left: 4px; font-size: 1rem;"><i class="ri-close-line"></i></button>` : ''}
    `;

    // Activar drag solo cuando se presione el handle (PC)
    const handleEl = chip.querySelector('.drag-handle');
    
    handleEl.addEventListener('mousedown', () => {
      chip.draggable = true;
    });

    handleEl.addEventListener('mouseup', () => {
      chip.draggable = false;
    });

    // Soporte para pantallas táctiles (Móvil)
    let touchTimeout;
    let startTouchX = 0;
    let startTouchY = 0;
    let isTouchDragging = false;

    handleEl.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startTouchX = touch.clientX;
      startTouchY = touch.clientY;
      isTouchDragging = false;

      // Detectar pulsación larga (450ms) para iniciar el modo arrastre
      touchTimeout = setTimeout(() => {
        isTouchDragging = true;
        chip.classList.add('dragging');
        if (navigator.vibrate) {
          navigator.vibrate(50); // Feedback háptico de vibración
        }
      }, 450);
    }, { passive: false });

    handleEl.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];

      if (!isTouchDragging) {
        // Cancelar pulsación larga si el usuario se mueve rápido (scroll)
        if (Math.abs(touch.clientX - startTouchX) > 10 || Math.abs(touch.clientY - startTouchY) > 10) {
          clearTimeout(touchTimeout);
        }
        return;
      }

      // Evitar scroll nativo mientras se arrastra la categoría
      e.preventDefault();

      const x = touch.clientX;
      const y = touch.clientY;

      // Limpiar clases visuales previas
      document.querySelectorAll('.category-chip').forEach(c => {
        c.classList.remove('drag-over', 'drop-left', 'drop-right');
      });

      // Temporalmente ocultar puntero sobre el elemento arrastrado para que elementFromPoint detecte lo que hay debajo
      chip.style.pointerEvents = 'none';
      const elementUnderTouch = document.elementFromPoint(x, y);
      chip.style.pointerEvents = '';

      if (!elementUnderTouch) return;

      const targetChip = elementUnderTouch.closest('.category-chip');
      if (targetChip && targetChip !== chip && targetChip.dataset.id) {
        const rect = targetChip.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        if (x < midpoint) {
          targetChip.classList.add('drop-left');
        } else {
          targetChip.classList.add('drop-right');
        }
        targetChip.classList.add('drag-over');
      }
    }, { passive: false });

    handleEl.addEventListener('touchend', (e) => {
      clearTimeout(touchTimeout);

      if (!isTouchDragging) return;

      chip.classList.remove('dragging');

      const touch = e.changedTouches[0];
      const x = touch.clientX;
      const y = touch.clientY;

      // Desactivar temporalmente puntero para leer elemento debajo
      chip.style.pointerEvents = 'none';
      const elementUnderTouch = document.elementFromPoint(x, y);
      chip.style.pointerEvents = '';

      const targetChip = elementUnderTouch ? elementUnderTouch.closest('.category-chip') : null;

      if (targetChip && targetChip !== chip && targetChip.dataset.id) {
        const draggedId = parseInt(chip.dataset.id);
        const targetId = parseInt(targetChip.dataset.id);

        const draggedIndex = allCategories.findIndex(c => c.id_clasificacion === draggedId);
        const targetIndex = allCategories.findIndex(c => c.id_clasificacion === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          const rect = targetChip.getBoundingClientRect();
          const midpoint = rect.left + rect.width / 2;
          let newIndex = targetIndex;
          if (x >= midpoint) {
            newIndex = targetIndex + 1;
          }

          // Reordenar array
          const [draggedItem] = allCategories.splice(draggedIndex, 1);
          let insertIndex = newIndex;
          if (draggedIndex < newIndex) {
            insertIndex = newIndex - 1;
          }
          allCategories.splice(insertIndex, 0, draggedItem);

          // Guardar orden
          saveCategoryOrderDirectly();
        }
      }

      document.querySelectorAll('.category-chip').forEach(c => {
        c.classList.remove('drag-over', 'drop-left', 'drop-right');
      });
      isTouchDragging = false;
      renderCategories();
    });

    handleEl.addEventListener('touchcancel', () => {
      clearTimeout(touchTimeout);
      if (isTouchDragging) {
        chip.classList.remove('dragging');
        document.querySelectorAll('.category-chip').forEach(c => {
          c.classList.remove('drag-over', 'drop-left', 'drop-right');
        });
        isTouchDragging = false;
        renderCategories();
      }
    });

    // Evento de click principal en el chip de categoría
    chip.querySelector('.category-chip-content').addEventListener('click', (e) => {
      if (isDraggingScroll) return;
      selectedCategoryId = cat.id_clasificacion;
      renderCategories();
      filterAndRenderAccounts();
    });

    // Evento de click para eliminar la categoría
    if (isCustom) {
      chip.querySelector('.btn-delete-cat').addEventListener('click', async (e) => {
        e.stopPropagation(); // Evitar cambiar de filtro al presionar borrar
        if (confirm(`¿Estás seguro de eliminar la categoría "${cat.nombre}"? Las relaciones con las cuentas se removerán.`)) {
          await deleteCategory(cat.id_clasificacion);
        }
      });
    }

    // Drag and Drop Event Listeners (PC)
    chip.addEventListener('dragstart', (e) => {
      isMouseDownForScroll = false;
      categoriesListEl.classList.remove('grabbing');
      
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', cat.id_clasificacion);
      e.dataTransfer.effectAllowed = 'move';
    });

    chip.addEventListener('dragend', () => {
      chip.draggable = false;
      chip.classList.remove('dragging');
      document.querySelectorAll('.category-chip').forEach(c => {
        c.classList.remove('drag-over', 'drop-left', 'drop-right');
      });
    });

    chip.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = chip.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      if (e.clientX < midpoint) {
        chip.classList.add('drop-left');
        chip.classList.remove('drop-right');
      } else {
        chip.classList.add('drop-right');
        chip.classList.remove('drop-left');
      }
      chip.classList.add('drag-over');
    });

    chip.addEventListener('dragleave', () => {
      chip.classList.remove('drag-over', 'drop-left', 'drop-right');
    });

    chip.addEventListener('drop', async (e) => {
      e.preventDefault();
      chip.classList.remove('drag-over', 'drop-left', 'drop-right');
      const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
      if (isNaN(draggedId) || draggedId === cat.id_clasificacion) return;

      const draggedIndex = allCategories.findIndex(c => c.id_clasificacion === draggedId);
      const targetIndex = allCategories.findIndex(c => c.id_clasificacion === cat.id_clasificacion);

      if (draggedIndex === -1 || targetIndex === -1) return;

      const rect = chip.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      let newIndex = targetIndex;
      if (e.clientX >= midpoint) {
        newIndex = targetIndex + 1;
      }

      // Reorder array
      const [draggedItem] = allCategories.splice(draggedIndex, 1);
      let insertIndex = newIndex;
      if (draggedIndex < newIndex) {
        insertIndex = newIndex - 1;
      }
      allCategories.splice(insertIndex, 0, draggedItem);

      saveCategoryOrderDirectly();
      renderCategories();
    });

    categoriesListEl.appendChild(chip);
  });
}

// Función auxiliar para guardar el orden preferido
async function saveCategoryOrderDirectly() {
  try {
    let userId = null;
    try {
      const auth = await getAuthUserAndSalt();
      userId = auth.userId;
    } catch (_) {}
    const orderKey = userId ? `category_order_${userId}` : 'category_order_global';
    const orderIds = allCategories.map(c => c.id_clasificacion);
    localStorage.setItem(orderKey, JSON.stringify(orderIds));
  } catch (err) {
    console.error('Error al guardar el orden:', err);
  }
}

// Variables y lógica para arrastre del mouse (desplazamiento horizontal en PC)
let isMouseDownForScroll = false;
let startScrollX;
let scrollLeftVal;
let isDraggingScroll = false;

categoriesListEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.btn-delete-cat')) return;

  isMouseDownForScroll = true;
  isDraggingScroll = false;
  startScrollX = e.pageX - categoriesListEl.offsetLeft;
  scrollLeftVal = categoriesListEl.scrollLeft;
});

categoriesListEl.addEventListener('mouseleave', () => {
  isMouseDownForScroll = false;
  categoriesListEl.classList.remove('grabbing');
});

categoriesListEl.addEventListener('mouseup', () => {
  isMouseDownForScroll = false;
  setTimeout(() => {
    isDraggingScroll = false;
  }, 50);
  categoriesListEl.classList.remove('grabbing');
});

categoriesListEl.addEventListener('mousemove', (e) => {
  if (!isMouseDownForScroll) return;
  e.preventDefault();

  const x = e.pageX - categoriesListEl.offsetLeft;
  const walk = (x - startScrollX) * 1.5;

  if (Math.abs(x - startScrollX) > 5) {
    isDraggingScroll = true;
    categoriesListEl.classList.add('grabbing');
  }

  categoriesListEl.scrollLeft = scrollLeftVal - walk;
});

// Eliminar categoría
async function deleteCategory(id) {
  try {
    const { error } = await window.sb
      .from('clasificacion')
      .delete()
      .eq('id_clasificacion', id);

    if (error) throw error;

    showToast('Categoría eliminada.');
    if (selectedCategoryId === id) {
      selectedCategoryId = null;
    }
    await fetchCategories();
    // Refrescar las cuentas para limpiar las clasificaciones removidas
    await fetchAccounts();
  } catch (err) {
    showToast(err.message || 'No se pudo eliminar la categoría.');
  }
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
    const { userId } = await getAuthUserAndSalt();
    
    const { data, error } = await window.sb
      .from('clasificacion')
      .insert([{
        id_usuario: userId,
        nombre,
        color,
        icono: 'folder-line'
      }])
      .select('id_clasificacion');

    if (error) throw error;

    showToast('Categoría creada exitosamente.');
    categoryModal.classList.add('hidden');
    await fetchCategories();
  } catch (err) {
    showToast(err.message || 'Error al crear la categoría.');
  }
});


// ==========================================
// SECCIÓN DE CUENTAS
// ==========================================

async function fetchAccounts() {
  if (navigator.onLine) {
    try {
      // Llamar al helper RPC get_mis_cuentas definido en keyshield_v2.sql
      const { data, error } = await window.sb.rpc('get_mis_cuentas');
      if (error) throw error;
      
      allAccounts = data || [];
      
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
      (acc.clasificaciones && acc.clasificaciones.some(cat => cat.id_clasificacion === selectedCategoryId));

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
    const clasifArray = acc.clasificaciones || [];
    const tagsHtml = clasifArray.map(tag => `
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
          if (err.name !== 'AbortError') {
            showToast('Error al compartir.');
          }
        }
      } else {
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

// Descifrar contraseña de forma dinámica en el cliente
async function decryptPassword(id_cuenta) {
  try {
    const acc = allAccounts.find(a => a.id_cuenta === id_cuenta);
    if (!acc) throw new Error('Cuenta no encontrada.');
    
    const { salt } = await getAuthUserAndSalt();

    if (window.cryptoClient && window.cryptoClient.decryptPasswordOffline) {
      const decrypted = await window.cryptoClient.decryptPasswordOffline(acc.password_cifrada, acc.iv, salt);
      if (!decrypted) throw new Error('Criptografía fallida.');
      return decrypted;
    } else {
      throw new Error('Módulo criptográfico no disponible.');
    }
  } catch (err) {
    console.error('Error al descifrar contraseña:', err);
    showToast('Error al descifrar la contraseña.');
    return null;
  }
}

// Eliminar cuenta
async function deleteAccount(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta cuenta permanentemente?')) return;

  try {
    const { error } = await window.sb
      .from('cuenta')
      .delete()
      .eq('id_cuenta', id);
      
    if (error) throw error;
    
    showToast('Cuenta eliminada.');
    await fetchAccounts();
  } catch (err) {
    showToast(err.message || 'No se pudo eliminar la cuenta');
  }
}

// ==========================================
// MANEJO DEL MODAL DE CREAR / EDITAR
// ==========================================

btnAddAccount.addEventListener('click', () => {
  document.getElementById('account-id').value = '';
  accountForm.reset();
  document.getElementById('modal-title').textContent = 'Añadir Cuenta';
  document.querySelectorAll('input[name="modal-cats"]').forEach(cb => cb.checked = false);
  accountModal.classList.remove('hidden');
});

function openEditAccountModal(account) {
  document.getElementById('account-id').value = account.id_cuenta;
  document.getElementById('acc-service').value = account.nombre_servicio;
  document.getElementById('acc-url').value = account.url_servicio || '';
  document.getElementById('acc-username').value = account.nombre_cuenta;
  document.getElementById('acc-notes').value = account.notes || account.notas || '';
  document.getElementById('modal-title').textContent = 'Editar Cuenta';
  
  modalPassInput.value = '';
  modalPassInput.placeholder = '•••••••••••• (dejar vacío si no cambia)';
  modalPassInput.required = false;

  const clasifArray = account.clasificaciones || [];
  document.querySelectorAll('input[name="modal-cats"]').forEach(cb => {
    cb.checked = clasifArray.some(cat => cat.id_clasificacion == cb.value);
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

  const clasificaciones = Array.from(document.querySelectorAll('input[name="modal-cats"]:checked'))
    .map(cb => parseInt(cb.value));

  try {
    const { userId, salt } = await getAuthUserAndSalt();
    const isEdit = id !== '';

    let payload = {
      id_usuario: userId,
      nombre_servicio,
      url_servicio: url_servicio || null,
      nombre_cuenta,
      notas: notas || null
    };

    // Si se especificó una nueva contraseña o si es creación obligatoria
    if (password_texto_plano) {
      const encrypted = await window.cryptoClient.encryptPasswordLocal(password_texto_plano, salt);
      if (!encrypted) throw new Error('Error al cifrar la contraseña en el cliente.');
      payload.password_cifrada = encrypted.encryptedData;
      payload.iv = encrypted.iv;
    } else if (!isEdit) {
      throw new Error('La contraseña es obligatoria para nuevas cuentas.');
    }

    let accountId = id;

    if (isEdit) {
      const { error } = await window.sb
        .from('cuenta')
        .update(payload)
        .eq('id_cuenta', id);
        
      if (error) throw error;
    } else {
      const { data, error } = await window.sb
        .from('cuenta')
        .insert([payload])
        .select('id_cuenta');
        
      if (error) throw error;
      accountId = data[0].id_cuenta;
    }

    // Actualizar clasificaciones asociadas en la tabla puente cuenta_clasificacion
    if (isEdit) {
      // Borrar relaciones viejas
      const { error: delError } = await window.sb
        .from('cuenta_clasificacion')
        .delete()
        .eq('id_cuenta', accountId);
        
      if (delError) throw delError;
    }

    if (clasificaciones.length > 0) {
      const bridgeRows = clasificaciones.map(id_clasif => ({
        id_cuenta: accountId,
        id_clasificacion: id_clasif
      }));
      
      const { error: insertError } = await window.sb
        .from('cuenta_clasificacion')
        .insert(bridgeRows);
        
      if (insertError) throw insertError;
    }

    showToast(isEdit ? 'Cuenta actualizada correctamente.' : 'Cuenta guardada correctamente.');
    accountModal.classList.add('hidden');
    await fetchAccounts();
  } catch (err) {
    showToast(err.message || 'Error al guardar la cuenta.');
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
  inactivityTimeout = setTimeout(async () => {
    const { data: { session } } = await window.sb.auth.getSession();
    if (session) {
      await window.sb.auth.signOut();
      sessionStorage.removeItem('keyshield_master');
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

