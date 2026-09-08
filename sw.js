// ============================================
// SERVICE WORKER - Odong-Odong PWA
// ============================================

const CACHE_NAME = 'odong-odong-v1.0.1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ============================================
// INSTALL EVENT
// ============================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// ============================================
// ACTIVATE EVENT
// ============================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Removing old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// ============================================
// FETCH EVENT
// ============================================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip Firebase API calls
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis')) {
    return;
  }

  // HTML pages - Network first
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) return cachedResponse;
              return caches.match('/index.html');
            });
        })
    );
    return;
  }

  // Assets - Cache first
  if (request.url.match(/\.(css|js|json|png|jpg|jpeg|svg|webp|ico)$/)) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                const clonedResponse = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, clonedResponse);
                });
              }
              return response;
            });
        })
    );
    return;
  }

  // Default
  event.respondWith(
    fetch(request)
      .catch(() => {
        return caches.match(request);
      })
  );
});

// ============================================
// PUSH NOTIFICATION
// ============================================
self.addEventListener('push', (event) => {
  let data = {
    title: 'Odong-Odong',
    body: 'Ada pembaruan!',
    icon: '/icon-192.png',
    badge: '/icon-192.png'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Odong-Odong', options)
  );
});

// ============================================
// NOTIFICATION CLICK
// ============================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

console.log('[SW] Service Worker loaded');
