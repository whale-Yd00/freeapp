const CACHE_NAME = 'whale-llt-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/js/api.js',
  '/lib/db.js',
  '/config/sync-config.js',
  '/utils/promptBuilder.js',
  '/utils/memoryTable.js',
  '/utils/fileStorageManager.js',
  '/utils/imageStorageAPI.js',
  '/utils/imageDisplayHelper.js',
  '/utils/imageMigrationManager.js',
  '/utils/chatEmojiMigrationManager.js',
  '/utils/dataMigrator.js',
  '/utils/announcementManager.js',
  '/utils/characterMemory.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
      .catch(error => {
        console.warn('Fetch failed:', event.request.url, error);
        // 对于关键资源失败，返回一个基本的响应
        if (event.request.url.includes('.html') || event.request.url.includes('.js') || event.request.url.includes('.css')) {
          return new Response('', { status: 200, statusText: 'OK' });
        }
        // 对于其他资源，重新抛出错误
        throw error;
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});