const CACHE_NAME = 'keyshield-cache-v12';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'offline.html',
  'css/styles.css',
  'js/auth.js',
  'js/app.js',
  'js/offlineDB.js',
  'js/cryptoClient.js',
  'js/supabaseClient.js',
  'manifest.json',
  'icons/icon-192x192.png',
  'icons/icon-512x512.png'
];

// URLs externas que también queremos cachear (fuentes, iconos, SDK Supabase)
const EXTERNAL_URLS_TO_CACHE = [
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

// Evento de instalación: guardar recursos estáticos básicos en caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[Service Worker] Cacheando recursos de la shell...');

      // Cachear assets locales (si uno falla, no bloqueamos)
      await cache.addAll(ASSETS_TO_CACHE);

      // Cachear recursos externos de forma individual (no bloquea si alguno falla)
      for (const url of EXTERNAL_URLS_TO_CACHE) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('[Service Worker] No se pudo cachear recurso externo:', url, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Evento de activación: limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Limpiando caché obsoleta...', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Evento fetch: interceptar peticiones
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Si es una petición hacia la base de datos Supabase (comunicación API de Supabase),
  // usar Network Only (no cachear respuestas de datos dinámicos)
  if (requestUrl.host.includes('supabase.co')) {
    return;
  }

  // Para todo lo demás (assets locales + CDN externas): Cache First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Devolver caché inmediatamente y actualizar en segundo plano
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => { /* ignorar fallos offline */ });

        return cachedResponse;
      }

      // Si no está en caché, intentar red
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          // Guardar en caché para la próxima vez
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          return networkResponse;
        })
        .catch(() => {
          // Si falla la red al intentar cargar una página HTML, mostrar offline.html
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/offline.html');
          }
        });
    })
  );
});
