// عامل الخدمة: يحفظ ملفات التطبيق على الجهاز عشان يفتح بدون إنترنت.
// بيانات الأصناف نفسها تنحفظ من داخل الصفحة (آخر نسخة نزلت)، وبيانات
// الإدارة يحفظها Firebase بنفسه — هذا الملف ما يلمس Firebase ولا جوجل شيت.
const CACHE = 'jadu-v1';
const SHELL = [
  './', './index.html', './manifest.json',
  './jadu-logo.png', './jadu-intro-poster.jpg', './icon-192.png', './icon-512.png',
  // المكتبات الخارجية — تنحفظ من أول مرة عشان التطبيق يشتغل كامل بدون نت
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&family=IBM+Plex+Mono:wght@600;700&display=swap'
];
// مواقع ما نتدخل فيها أبدًا (بيانات حيّة أو تسجيل دخول)
const BYPASS = [
  'docs.google.com', 'googleusercontent.com', 'firestore.googleapis.com',
  'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(SHELL.map(u => c.add(u).catch(() => {})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (BYPASS.some(h => url.hostname.endsWith(h))) return;
  if (url.pathname.endsWith('.mp4')) return; // الفيديو: لو ما فيه نت تظهر صورة الشعار بدله

  // صفحة التطبيق نفسها: من الإنترنت أولًا (عشان التحديثات توصل)، وبدون نت من المحفوظ
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('.html'))) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // باقي الملفات (المكتبات، الخطوط، الصور): من المحفوظ فورًا، ونحدّثه بالخلفية
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
