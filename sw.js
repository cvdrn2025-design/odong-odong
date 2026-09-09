// ============================================
// SERVICE WORKER - Odong-Odong PWA
// ============================================

const CACHE_NAME = 'odong-odong-v2.0.0';
const BASE_URL = 'https://cvdrn2025-design.github.io/odong-odong';

// Daftar aset yang harus di-cache
const ASSETS_TO_CACHE = [
    BASE_URL + '/',
    BASE_URL + '/index.html',
    BASE_URL + '/admin.html',
    BASE_URL + '/manifest.json',
    BASE_URL + '/icon-192.png',
    BASE_URL + '/icon-512.png'
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
                // Jika ada aset yang gagal di-cache, tetap lanjutkan
                return self.skipWaiting();
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
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic')) {
        return;
    }

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // HTML pages - Network first with cache fallback
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Clone response and cache it
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clonedResponse);
                    });
                    return response;
                })
                .catch(() => {
                    // Network failed, try cache
                    return caches.match(request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                console.log('[SW] Serving from cache:', request.url);
                                return cachedResponse;
                            }
                            // If not in cache, serve index.html
                            return caches.match(BASE_URL + '/index.html');
                        });
                })
        );
        return;
    }

    // Assets (CSS, JS, images, etc.) - Cache first with network fallback
    if (request.url.match(/\.(css|js|json|png|jpg|jpeg|svg|webp|ico|woff|woff2)$/)) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        console.log('[SW] Serving from cache:', request.url);
                        return cachedResponse;
                    }
                    return fetch(request)
                        .then((response) => {
                            // Only cache successful responses
                            if (response && response.status === 200) {
                                const clonedResponse = response.clone();
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, clonedResponse);
                                });
                            }
                            return response;
                        })
                        .catch(() => {
                            console.error('[SW] Failed to fetch:', request.url);
                            return new Response('Offline', {
                                status: 503,
                                statusText: 'Service Unavailable'
                            });
                        });
                })
        );
        return;
    }

    // Default - Network first with cache fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful GET responses
                if (response && response.status === 200) {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clonedResponse);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(request);
            })
    );
});

// ============================================
// PUSH NOTIFICATION
// ============================================
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'Ada pembaruan!',
        icon: BASE_URL + '/icon-192.png',
        badge: BASE_URL + '/icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            url: BASE_URL + '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification('Odong-Odong', options)
    );
});

// ============================================
// NOTIFICATION CLICK
// ============================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || BASE_URL + '/';

    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});

// ============================================
// SYNC EVENT
// ============================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    try {
        // Kirim data yang tersimpan di IndexedDB ke Firebase
        const db = await openDatabase();
        const tx = db.transaction('pendingData', 'readonly');
        const store = tx.objectStore('pendingData');
        const allData = await store.getAll();
        
        for (const data of allData) {
            // Kirim ke Firebase
            await fetch(data.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data.body)
            });
        }
        
        // Hapus data yang sudah terkirim
        const clearTx = db.transaction('pendingData', 'readwrite');
        const clearStore = clearTx.objectStore('pendingData');
        clearStore.clear();
        
        console.log('[SW] Sync completed successfully');
    } catch (error) {
        console.error('[SW] Sync failed:', error);
    }
}

// Fungsi untuk membuka database IndexedDB
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('odong-odong-db', 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pendingData')) {
                db.createObjectStore('pendingData', { keyPath: 'id', autoIncrement: true });
            }
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// ============================================
// MESSAGE EVENT
// ============================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_URLS') {
        const urls = event.data.urls || [];
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return Promise.all(
                    urls.map(url => cache.add(url).catch(err => console.warn('Failed to cache:', url, err)))
                );
            })
        );
    }
});

console.log('[SW] Service Worker loaded for Odong-Odong PWA');
