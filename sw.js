// sw.js
// BUMPED TO v2!
const CACHE_NAME = 'flashcard-cache-v2';

const urlsToCache = [
    './',
    './index.html',
    './styles/main.css',
    './src/database.js',
    './src/app.js',
    'https://unpkg.com/dexie/dist/dexie.js'
];

self.addEventListener('install', event => {
    self.skipWaiting(); // Forces the new code to take over immediately
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.url.includes('sync.php')) {
        return; 
    }
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});

// NEW: This automatically deletes the old v1 cache!
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});