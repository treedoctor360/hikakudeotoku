// ══════════════════════════════════════════
// お買い物比較 - Service Worker
// ネットワーク優先戦略（常に最新版を取得）
// ══════════════════════════════════════════

const CACHE_NAME = 'okaimono-hikaku-v4';

const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── インストール時：キャッシュに保存 ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] キャッシュ作成:', CACHE_NAME);
      // addAllの失敗でSW全体が止まらないよう個別にtry
      return Promise.allSettled(
        CACHE_FILES.map(url => cache.add(url).catch(err => {
          console.warn('[SW] キャッシュ失敗:', url, err);
        }))
      );
    })
  );
  // 即座に有効化
  self.skipWaiting();
});

// ── アクティベート時：古いキャッシュを削除 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] 古いキャッシュ削除:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── フェッチ時：ネットワーク優先 → キャッシュ ──
// GAS・外部APIはキャッシュしない
// HTMLファイルは常にネットワークから取得（最新版を確保）
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // GAS・Google系・フォントはSWをスルー
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com')
  ) {
    return;
  }

  // HTMLファイルは必ずネットワーク優先（キャッシュは使わない）
  // → index.htmlが更新されたら即反映される
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // 取得成功したらキャッシュも更新しておく
          if (response && response.status === 200) {
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, toCache));
          }
          return response;
        })
        .catch(() => {
          // オフライン時のみキャッシュから返す
          return caches.match(e.request);
        })
    );
    return;
  }

  // 画像・manifest等はキャッシュ優先（変更が少ないため）
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, toCache));
        return response;
      });
    })
  );
});
