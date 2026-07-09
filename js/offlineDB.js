const DB_NAME = 'keyshield_offline';
const DB_VERSION = 1;

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Error abriendo IndexedDB:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store de cuentas (clave primaria id_cuenta)
      if (!db.objectStoreNames.contains('cuentas')) {
        db.createObjectStore('cuentas', { keyPath: 'id_cuenta' });
      }
      
      // Store de clasificaciones (clave primaria id_clasificacion)
      if (!db.objectStoreNames.contains('clasificaciones')) {
        db.createObjectStore('clasificaciones', { keyPath: 'id_clasificacion' });
      }
    };
  });
}

async function saveCuentas(cuentas) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cuentas'], 'readwrite');
    const store = transaction.objectStore('cuentas');

    // Limpiar previas
    store.clear();

    cuentas.forEach(cuenta => {
      store.put(cuenta);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

async function getCuentas() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cuentas'], 'readonly');
    const store = transaction.objectStore('cuentas');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveClasificaciones(clasificaciones) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['clasificaciones'], 'readwrite');
    const store = transaction.objectStore('clasificaciones');

    store.clear();

    clasificaciones.forEach(cat => {
      store.put(cat);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

async function getClasificaciones() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['clasificaciones'], 'readonly');
    const store = transaction.objectStore('clasificaciones');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function clearOfflineData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cuentas', 'clasificaciones'], 'readwrite');
    transaction.objectStore('cuentas').clear();
    transaction.objectStore('clasificaciones').clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

window.offlineDB = {
  saveCuentas,
  getCuentas,
  saveClasificaciones,
  getClasificaciones,
  clearOfflineData
};
