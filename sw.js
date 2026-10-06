// Service Worker لتطبيق جادو — تثبيت كتطبيق + عمل بدون إنترنت
// ملاحظة: بيانات الأصناف (الشيت) وبيانات الإدارة (Firestore) تُجلب دائمًا من الشبكة
// مباشرة من كود الصفحة نفسها (مع نسخة احتياطية محليًا عبر localStorage)،
// هذا الملف مسؤول فقط عن تخزين "هيكل" التطبيق (الصفحة، الصور، المكتبات) عشان يفتح بدون إنترنت.

const CACHE_NAME = 'jadu-app-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './staff.html',
  './app.css',
  './app.js',
  './attendance-core.js',
  './attendance.js',
  './attendance.css',
  './item-images.js',
  './manifest.json',
  './manifest-staff.json',
  './icon-192.png',
  './icon-512.png',
  './jadu-logo.jpg',
  './jadu-intro-poster.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(err => console.warn('تعذّر تخزين بعض ملفات التطبيق الأساسية', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // طلب فتح الصفحة نفسها: جرّب الشبكة أول (عشان آخر تحديث)، ولو ما فيه إنترنت ارجع للنسخة المخزنة
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        // كل صفحة ترجع لنسختها المخزنة (صفحة الموظفين ما ترجع لصفحة الزبون والعكس)
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(r => r || caches.match(new URL(req.url).pathname.endsWith('staff.html') ? './staff.html' : './index.html')))
    );
    return;
  }

  // كود التطبيق نفسه (app.js / app.css / item-images.js): الشبكة أول مثل الصفحة،
  // عشان أي تحديث يوصل فورًا وما تشتغل صفحة جديدة مع كود قديم من الكاش
  const url = new URL(req.url);
  if (url.origin === self.location.origin && /\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // باقي الملفات (صور، خطوط، مكتبات JS الخارجية): كاش أول لسرعة فورية، وتحديث بالخلفية
  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
