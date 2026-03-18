// sw.js
// BUMPED TO v4!
const CACHE_NAME = 'flashcard-cache-v4';

const urlsToCache = [
    './',
    './index.html',
    './styles/main.css',
    './src/database.js',
    './src/app.js',
    './src/dexie.js' // <--- Pointing to your new local file!
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

// Automatically deletes any older caches!
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