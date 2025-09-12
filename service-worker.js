const CACHE_NAME = 'whale-llt-v10';
const CACHE_VERSION = Date.now(); // 添加时间戳确保版本唯一性
const urlsToCache = [
  '/',
  '/index.html',
  '/interact.html',
  '/sync-key-generator.html',
  '/style.css',
  '/script.js',
  '/bubble.html',
  '/manifest.json',
  '/js/api.js',
  '/js/environment-indicator.js',
  '/lib/db.js',
  '/config/sync-config.js',
  '/config/environment-config.js',
  '/utils/UnifiedDBManager.js',
  '/utils/apiConfigManager.js',
  '/utils/characterMemory.js',
  '/utils/chatEmojiMigrationManager.js',
  '/utils/colorUtils.js',
  '/utils/fileStorageExporter.js',
  '/utils/fileStorageImporter.js',
  '/utils/fontLoader.js',
  '/utils/formatUtils.js',
  '/utils/imageDisplayHelper.js',
  '/utils/imageKeywordGenerator.js',
  '/utils/imageMigrationManager.js',
  '/utils/imageStorageAPI.js',
  '/utils/memoryTable.js',
  '/utils/promptBuilder.js',
  '/utils/systemUtilities.js',
  '/utils/uiEventHandlers.js',
  '/utils/uiManager.js',
  '/utils/uiUtils.js',
  '/utils/voiceStorageAPI.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

self.addEventListener('install', event => {
  console.log('Service Worker 安装中...', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('缓存已打开，开始缓存资源...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('所有资源已缓存，跳过等待...');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('Service Worker 安装失败:', err);
        throw err;
      })
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
  console.log('Service Worker 激活中...', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      console.log('正在清理旧缓存...', cacheNames);
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker 激活完成，接管所有页面');
      // 立即接管所有页面，不需要等待页面刷新
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});