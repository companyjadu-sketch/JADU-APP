// =====================================================================
// رفع صور الأصناف دفعة واحدة + صفحة الموافقات (صفحة staff.html فقط)
// ---------------------------------------------------------------------
// • زر «إضافة صور» في أعلى الموقع يظهر فقط لهاتف معتمد في نظام الحضور (أو إدارة عامة
//   مسجّلة الدخول). السؤال يُوجَّه للخادم (Apps Script: img_whoami)، والخادم يعيد
//   التحقق من الهوية في كل رفع — فإخفاء الزر هنا للراحة فقط وليس هو الحماية.
// • الصور تُضغط في المتصفح، وتُحفظ في IndexedDB (حفظ تلقائي)، وتُرفع واحدة واحدة
//   بالخلفية؛ لو أُغلقت الصفحة أو انقطع الإنترنت يُستأنف الرفع من حيث توقف.
// • الإدارة: نشر مباشر (الخادم يكتب images/رقم.jpg في GitHub). الموظف: إلى مجلد انتظار
//   في Drive وتظهر للإدارة في صفحة الموافقات.
// • لا يوجد هنا أي مفتاح GitHub — المفتاح في Script Properties فقط.
// • للمعاينة بدون خادم: staff.html?img-demo=admin  أو  ?img-demo=staff
// يعتمد على دوال app.js: showView, showConfirm, itemImage, ITEMS, loadItems, escapeHtml
// =====================================================================
(function(){
'use strict';
if(!document.body || document.body.dataset.page !== 'staff') return;

const API_URL = "https://script.google.com/macros/s/AKfycbwu4D9_kR2wWv7EVFQ7UA06IvILceQSRb-7q6wO1H521ErCtoRxfaXKjtD6GWfKm4lTdQ/exec"; // نفس خادم الحضور
const DEMO = /[?&]img-demo/.test(location.search);
const DEMO_ROLE = ((location.search.match(/img-demo=(admin|staff|none)/) || [])[1]) || 'admin';
const FLAKY = /[?&]flaky/.test(location.search);           // محاكاة انقطاع الإنترنت أثناء المعاينة
const MAX_FILES = 100, MAX_SIDE = 1200;
const LS_DEV = 'jadu_att_device';                          // معرّف الهاتف الذي ينشئه نظام الحضور
const LS_ROLE = 'jadu_photo_role_v1';

const $ = (s, r) => (r || document).querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => escapeHtml(s);
const ICON = {
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/></svg>'
};

// =====================================================================
// الاتصال بالخادم
// =====================================================================
function lsGet(k){ try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; } }
function lsSet(k, v){ try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch(e){} }

async function api(action, data){
  data = Object.assign({ action }, data || {});
  try { data.deviceId = localStorage.getItem(LS_DEV) || ''; } catch(e){ data.deviceId = ''; }
  if(DEMO) return mock(action, data);
  const u = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if(u){ try { data.idToken = await u.getIdToken(); } catch(e){} }
  let res;
  try { res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) }); }
  catch(e){ const er = new Error('لا يوجد اتصال بالإنترنت'); er.network = true; throw er; }
  const body = await res.json().catch(() => null);
  if(!body){ const er = new Error('تعذّر الوصول للخادم'); er.network = true; throw er; }
  if(!body.ok){ const er = new Error(body.error || 'حدث خطأ'); er.fatal = !!body.fatal; throw er; }
  return body.data;
}

// خادم تجريبي داخل المتصفح (للمعاينة فقط — لا يلمس أي شيء حقيقي)
let flakyN = 0;
const stagedDemo = new Set();
async function mock(action, d){
  await sleep(220 + Math.random() * 300);
  const all = await dbAll('demo');
  if(action === 'img_whoami') return { role: DEMO_ROLE, name: DEMO_ROLE === 'admin' ? 'الإدارة العامة' : DEMO_ROLE === 'staff' ? 'حكيم سحيم' : '' };
  if(DEMO_ROLE === 'none'){ const e = new Error('هذا الهاتف غير مسجّل كموظف'); e.fatal = true; throw e; }
  if(action === 'img_upload'){
    if(FLAKY && (++flakyN % 4 === 0)){ const e = new Error('لا يوجد اتصال بالإنترنت'); e.network = true; throw e; }
    if(DEMO_ROLE === 'admin'){ stagedDemo.add(d.id); return { status: 'staged' }; }
    if(!all.some(x => x.id === d.id)) await dbPut('demo', { id: d.id, itemNos: d.itemNos, itemNames: d.itemNames || [], by: 'حكيم سحيم', at: new Date().toLocaleString('en-GB').slice(0, 16).replace(',', ''), data: d.data });
    return { status: 'pending' };
  }
  if(action === 'img_link'){
    if(DEMO_ROLE === 'admin') return { status: 'published', path: itemImage(d.from) };
    if(!all.some(x => x.id === d.id)) await dbPut('demo', { id: d.id, itemNos: [d.to], itemNames: [d.toName || ''], from: d.from, by: 'حكيم سحيم', at: new Date().toLocaleString('en-GB').slice(0, 16).replace(',', '') });
    return { status: 'pending' };
  }
  if(DEMO_ROLE !== 'admin'){ const e = new Error('هذه العملية للإدارة العامة فقط'); e.fatal = true; throw e; }
  if(action === 'img_publish'){ const n = stagedDemo.size; stagedDemo.clear(); return { count: n, paths: {} }; }
  if(action === 'img_decide_batch'){ for(const id of d.ids) await dbDel('demo', id); return { done: d.ids, paths: {} }; }
  if(action === 'img_pending_count') return { count: all.length };
  if(action === 'img_pending_list') return { items: all.map(x => ({ id: x.id, itemNos: x.itemNos, itemNames: x.itemNames, by: x.by, at: x.at, from: x.from || '' })) };
  if(action === 'img_pending_get'){ const x = all.find(y => y.id === d.id); if(!x){ const e = new Error('غير موجودة'); e.fatal = true; throw e; } return { data: x.data }; }
  if(action === 'img_decide'){ const x = all.find(y => y.id === d.id); await dbDel('demo', d.id); return { status: d.decision === 'approve' ? 'approved' : 'rejected', path: x && x.from ? itemImage(x.from) : 'images/demo.jpg' }; }
  throw new Error('طلب غير معروف');
}

// =====================================================================
// التخزين المحلي (IndexedDB) — الحفظ التلقائي للتقدم
// =====================================================================
let dbp = null, dbBroken = false;
const MEM = { items: new Map(), demo: new Map() };       // بديل مؤقت لو IndexedDB غير متاح
function idb(){
  if(dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('jadu-photo-upload', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('items', { keyPath: 'id' }); d.createObjectStore('demo', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch(e){ rej(e); }
  });
  dbp.catch(() => { dbBroken = true; });
  return dbp;
}
async function dbRun(store, mode, fn){
  try {
    const d = await idb();
    return await new Promise((res, rej) => {
      const t = d.transaction(store, mode), out = fn(t.objectStore(store));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = t.onabort = () => rej(t.error);
    });
  } catch(e){ dbBroken = true; throw e; }
}
async function dbPut(store, rec){ try { await dbRun(store, 'readwrite', s => s.put(rec)); } catch(e){ MEM[store].set(rec.id, rec); } }
async function dbDel(store, id){ MEM[store].delete(id); try { await dbRun(store, 'readwrite', s => s.delete(id)); } catch(e){} }
async function dbAll(store){
  try { return (await dbRun(store, 'readonly', s => s.getAll())) || []; }
  catch(e){ return [...MEM[store].values()]; }
}

// =====================================================================
// الصلاحية (من الخادم)
// =====================================================================
let ROLE = 'none', ROLE_NAME = '';
function setRole(role, name){
  ROLE = role || 'none'; ROLE_NAME = name || '';
  lsSet(LS_ROLE, ROLE === 'none' ? null : { role: ROLE, name: ROLE_NAME });
  renderTop(); renderChrome();
  if(ROLE !== 'none') runQueue();                        // استئناف أي رفع متوقف
  if(ROLE === 'admin') pollCount();
  else setCount(0);
}
let accessResolve; const accessReady = new Promise(r => { accessResolve = r; });
// كل طلب يحمل رقمًا؛ نعتمد ردّ آخر طلب فقط (حتى لا يطغى ردّ قديم بلا دخول إدارة على ردّ أحدث)
let accessSeq = 0;
async function refreshAccess(){
  const my = ++accessSeq;
  try { const r = await api('img_whoami'); if(my === accessSeq) setRole(r.role, r.name); }
  catch(e){ if(!e.network && my === accessSeq) setRole('none'); }   // بدون إنترنت: نُبقي آخر حالة معروفة
  if(my === accessSeq) accessResolve(ROLE);
}
// ننتظر أول حالة دخول من Firebase قبل أول سؤال للخادم، حتى يُرسل دخول الإدارة إن وُجد
function authSettled(){
  return new Promise(res => {
    try {
      if(DEMO || typeof auth === 'undefined' || !auth) return res();
      let done = false; const fin = () => { if(!done){ done = true; res(); } };
      const off = auth.onAuthStateChanged(() => { fin(); try { off(); } catch(e){} });
      setTimeout(fin, 4000);
    } catch(e){ res(); }
  });
}

// =====================================================================
// أدوات: البحث عن الأصناف + تحليل اسم الملف
// =====================================================================
const AR_DIG = '٠١٢٣٤٥٦٧٨٩', FA_DIG = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = s => String(s || '').replace(/[٠-٩]/g, d => AR_DIG.indexOf(d)).replace(/[۰-۹]/g, d => FA_DIG.indexOf(d));
const normAr = s => latinDigits(s).toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();

let idxFor = null, idxMap = null, idxNorm = null;
function itemIndex(){
  if(idxFor !== ITEMS){
    idxFor = ITEMS; idxMap = new Map(); idxNorm = new Map();
    ITEMS.forEach(it => { const n = String(it.number).trim(); idxMap.set(n, it); idxNorm.set(n, normAr([it.name, it.company, it.typeCode, it.color].join(' '))); });
  }
  return idxMap;
}
const findItem = n => itemIndex().get(String(n).trim());
const hasPrev = n => { try { return !!itemImage(String(n)); } catch(e){ return false; } };

function searchItems(q, max){
  q = normAr(q); if(!q) return [];
  itemIndex();
  const toks = q.split(' '), out = [];
  for(const it of ITEMS){
    const num = String(it.number).trim().toLowerCase(), nm = idxNorm.get(num) || '';
    let score = -1;
    if(num === q) score = 0; else if(num.startsWith(q)) score = 1;
    else if(toks.every(t => nm.includes(t) || num.includes(t))) score = 2;
    if(score >= 0) out.push({ it, score });
  }
  out.sort((a, b) => a.score - b.score || String(a.it.number).length - String(b.it.number).length);
  return out.slice(0, max || 4).map(x => x.it);
}

// اسم الملف: رقم صنف موجود ← اقتراح للربط. اسم موديل ← يوضع في خانة البحث. غير ذلك ← يُترك فارغًا
const CAMERA_NAME = /^(img|dsc|dscn|dcim|pxl|mvimg|vid|whatsapp|screenshot|screen|photo|image|pic|signal|telegram|snapchat|\d{8}[_-]\d{4,})/i;
function analyzeName(fileName){
  const stem = latinDigits(String(fileName || '').replace(/\.[^.]+$/, '')).trim();
  if(!stem || CAMERA_NAME.test(stem)) return {};
  const m = stem.match(/^(\d{1,10})(?=$|[\s_\-.()،,+])/);
  if(m && findItem(m[1])) return { itemNo: m[1] };
  const q = stem.replace(/[_\-.()+]+/g, ' ').replace(/\s+/g, ' ').trim();
  return q.length >= 2 ? { query: q } : {};
}

// =====================================================================
// ضغط الصورة داخل المتصفح
// =====================================================================
function canvasBlob(c, q){ return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', q)); }
async function decodeImage(file){
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch(e){
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('bad image')); };
      im.src = u;
    });
  }
}
async function compress(file){
  const im = await decodeImage(file), w = im.width || im.naturalWidth, h = im.height || im.naturalHeight;
  if(!w || !h) throw new Error('bad image');
  const draw = (side) => {
    const r = Math.min(1, side / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(h * r));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    return c;
  };
  let blob = await canvasBlob(draw(MAX_SIDE), 0.82);
  if(blob.size > 450000) blob = await canvasBlob(draw(1000), 0.7);
  const tc = draw(120), thumb = tc.toDataURL('image/jpeg', 0.6);
  if(im.close) try { im.close(); } catch(e){}
  return { blob, thumb };
}
const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

// =====================================================================
// الحالة والقائمة
// =====================================================================
// st: new | suggest | ready | queued | uploading | done | skipped | error
let LIST = [];
let RUNNING = false;
const rt = it => it._ || (it._ = {});                    // حقول وقت التشغيل (لا تُحفظ)
const persist = it => { const rec = Object.assign({}, it); delete rec._; return dbPut('items', rec); };
let saveTimers = {};
const saveSoon = it => { clearTimeout(saveTimers[it.id]); saveTimers[it.id] = setTimeout(() => persist(it), 400); };
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
// الصورة الواحدة قد تُربط بأكثر من صنف: it.items = [{ no, name }]
const nosOf = it => (it.items || []).map(x => x.no);
// مكرر = أحد أصناف الصورة مربوط أيضًا بصورة سابقة في القائمة لم تُرفع بعد (يُرجع رقم الصنف المكرر)
const dupNo = it => {
  if(!it.items || !it.items.length || (it.st !== 'ready' && it.st !== 'suggest' && it.st !== 'new')) return '';
  const i = LIST.indexOf(it), mine = nosOf(it);
  for(let j = 0; j < i; j++){
    const o = LIST[j]; if(o.st === 'skipped' || o.st === 'error' || o.st === 'done') continue;
    const hit = nosOf(o).find(n => mine.includes(n)); if(hit) return hit;
  }
  return '';
};
const isDup = it => !!dupNo(it);
const thumbSrc = it => { const r = rt(it); if(!r.url && it.blob) r.url = URL.createObjectURL(it.blob); return r.url || it.thumb || ''; };

// ---------- الواجهة: عناصر ثابتة ----------
const top = document.createElement('div');
top.className = 'pu-top'; top.hidden = true;
top.innerHTML = `<div class="pu-top-in">
  <button type="button" class="pu-bell" id="puBell" hidden aria-label="صور بانتظار الموافقة">${ICON.bell}<span class="pu-badge" id="puBadge" hidden>0</span></button>
  <button type="button" class="pu-open" id="puOpen">${ICON.plus}<span id="puOpenTx">إضافة صور</span></button></div>`;
document.body.appendChild(top);

const appEl = $('.app');
const upView = document.createElement('div');
upView.className = 'view'; upView.id = 'view-photo-upload';
upView.innerHTML = `
  <div class="pu-head"><div class="back-row"><button type="button" class="back-btn" id="puBack" aria-label="رجوع">${ICON.back}</button><h2>رفع صور الأصناف</h2></div><span class="pu-chip" id="puChip"></span></div>
  <p class="pu-sub" id="puWho"></p>
  <label class="pu-pick" id="puPick" for="puFiles">${ICON.up}<b>اختر الصور (حتى ${MAX_FILES} صورة)</b><small>تُضغط تلقائيًا قبل الرفع</small></label>
  <input type="file" id="puFiles" accept="image/*" multiple hidden>
  <div class="msg" id="puMsg" role="status"></div>
  <div class="pu-sum"><span id="puCount"></span><span id="puHint"></span></div>
  <div class="pu-tools"><button type="button" id="puAcceptSug" hidden></button><button type="button" id="puClearDone" hidden>تنظيف المكتمل</button><button type="button" class="warn" id="puClearAll" hidden>حذف الكل</button></div>
  <div id="puList"></div>
  <div class="pu-bar">
    <div class="pu-prog" id="puProg" hidden><div class="bar"><i id="puProgBar"></i></div><span id="puProgTx"></span></div>
    <button type="button" class="primary-btn" id="puGo">حفظ ونشر الصور المربوطة</button>
    <span class="pu-note" id="puNote"></span>
  </div>`;
appEl.appendChild(upView);

const apView = document.createElement('div');
apView.className = 'view'; apView.id = 'view-photo-approvals';
apView.innerHTML = `
  <div class="pu-head"><div class="back-row"><button type="button" class="back-btn" id="apBack" aria-label="رجوع">${ICON.back}</button><h2>الصور بانتظار الموافقة</h2></div></div>
  <div id="apBody"><div class="empty-note"><span class="spinner"></span> جارِ التحميل…</div></div>`;
appEl.appendChild(apView);

const modal = document.createElement('div');
modal.className = 'pu-modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
document.body.appendChild(modal);

// =====================================================================
// صف الصورة
// =====================================================================
const rowEls = new Map();
function mkRow(it){
  const el = document.createElement('div');
  el.className = 'pu-row'; el.dataset.id = it.id;
  el.innerHTML = `<img class="pu-th" alt="">
    <div class="pu-main">
      <div class="pu-top-line"><span class="pu-fn"></span><button type="button" class="pu-rm" aria-label="حذف الصورة">✕</button></div>
      <div class="pu-link" hidden></div>
      <div class="pu-find"><span class="pu-qw"><input type="text" class="pu-q" placeholder="ابحث بالاسم أو رقم الصنف…" autocomplete="off" aria-label="بحث عن الصنف"><button type="button" class="pu-clr" aria-label="مسح نص البحث">×</button></span><div class="pu-res" hidden></div></div>
      <div class="pu-st"></div>
    </div>`;
  $('.pu-fn', el).textContent = it.name || '';
  const q = $('.pu-q', el); q.value = it.q || '';
  const open = () => { rt(it).open = true; renderResults(it); };
  q.addEventListener('focus', () => { open(); setTimeout(() => { try { q.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch(e){} }, 250); });
  q.addEventListener('input', () => { it.q = q.value; saveSoon(it); open(); });
  q.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ rt(it).open = false; renderResults(it); }
    if(e.key === 'Enter'){ e.preventDefault(); const f = searchItems(q.value, 1)[0]; if(f) linkItem(it, f); }
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    if(b.classList.contains('pu-rm')) removeRow(it);
    else if(b.classList.contains('pu-clr')){ const i = $('.pu-q', el); i.value = ''; it.q = ''; saveSoon(it); rt(it).open = false; renderResults(it); i.focus(); }
    else if(b.dataset.n) linkItem(it, findItem(b.dataset.n));
    else if(b.dataset.x){ unlinkItem(it, b.dataset.x); }
    else if(b.classList.contains('ok')){ it.st = 'ready'; it.sugg = false; persist(it); refresh(it); }
    else if(b.classList.contains('more')){ rt(it).adding = true; it.q = ''; refresh(it); const i = $('.pu-q', el); i.value = ''; i.focus(); }
    else if(b.classList.contains('cancel')){ rt(it).adding = false; rt(it).open = false; it.q = ''; refresh(it); }
    else if(b.classList.contains('retry')){ it.st = 'queued'; it.tries = 0; it.msg = ''; it.b = true; persist(it); refresh(it); runQueue(); }
  });
  rowEls.set(it.id, el);
  refresh(it);
  return el;
}
// نغلق قائمة النتائج عند الضغط خارجها (لا عند فقدان التركيز، حتى لا تُغلق أثناء التمرير داخلها)
document.addEventListener('pointerdown', e => {
  LIST.forEach(it => {
    const r = rt(it); if(!r.open) return;
    const el = rowEls.get(it.id), f = el && $('.pu-find', el);
    if(!f || !f.contains(e.target)){ r.open = false; renderResults(it); }
  });
}, true);
function linkItem(it, item){
  if(!item) return;
  const no = String(item.number).trim();
  if(!(it.items || (it.items = [])).some(x => x.no === no)) it.items.push({ no, name: item.name || '' });
  it.sugg = false; if(it.st === 'new' || it.st === 'suggest') it.st = 'ready'; it.q = '';
  rt(it).adding = false; rt(it).open = false;
  const el = rowEls.get(it.id); if(el) $('.pu-q', el).value = '';
  persist(it); refresh(it);
}
function unlinkItem(it, no){
  it.items = (it.items || []).filter(x => x.no !== no);
  if(!it.items.length){ it.st = 'new'; it.sugg = false; }
  persist(it); refresh(it);
}
function renderResults(it){
  const el = rowEls.get(it.id); if(!el) return;
  const box = $('.pu-res', el), q = (it.q || '').trim();
  if(!rt(it).open || !q){ box.hidden = true; box.innerHTML = ''; return; }
  const found = searchItems(q, 40), have = nosOf(it);
  box.hidden = false;
  box.innerHTML = found.length
    ? `<div class="cnt">${found.length >= 40 ? 'أول 40 نتيجة — اكتب أكثر لتضييق البحث' : found.length + ' نتيجة'}</div>` + found.map(f => { const n = String(f.number).trim(); return `<button type="button" data-n="${esc(n)}"${have.includes(n) ? ' disabled' : ''}><b>${esc(f.number)}</b><span>${esc(f.name)}</span>${[f.company, f.country].filter(Boolean).length ? `<small>${esc([f.company, f.country].filter(Boolean).join(' · '))}</small>` : ''}${hasPrev(n) ? '<small>· له صورة</small>' : ''}</button>`; }).join('')
    : '<div class="none">لا توجد نتائج</div>';
}
function refresh(it){
  const el = rowEls.get(it.id); if(!el) return;
  const busy = it.st === 'queued' || it.st === 'uploading' || it.st === 'staged', fin = it.st === 'done' || it.st === 'skipped';
  const dupN = dupNo(it), dup = !!dupN, has = !!(it.items && it.items.length);
  el.className = 'pu-row' + (it.st === 'ready' && !dup ? ' is-ready' : '') + (it.st === 'suggest' ? ' is-sug' : '') + (dup ? ' is-dup' : '') + (it.st === 'error' ? ' is-error' : '') + (fin ? ' is-done' : '');
  const img = $('.pu-th', el), s = thumbSrc(it); if(img.getAttribute('src') !== s) img.src = s;
  $('.pu-rm', el).disabled = it.st === 'uploading' || it.st === 'staged';
  const link = $('.pu-link', el), find = $('.pu-find', el), st = $('.pu-st', el), adding = !!rt(it).adding && !busy && !fin;
  if(has){
    link.hidden = false;
    link.innerHTML = it.items.map(x => `<span class="pu-ch"><b>${esc(x.no)}</b><span class="nm">${esc(x.name)}</span>${busy || fin ? '' : `<button type="button" class="x" data-x="${esc(x.no)}" aria-label="حذف الصنف ${esc(x.no)}">×</button>`}</span>`).join('') +
      (it.st === 'suggest' ? `<span class="pu-tag">اقتراح — راجِع</span><button type="button" class="ok main">تأكيد</button>` : '') +
      (busy || fin || adding ? '' : `<button type="button" class="more">+ صنف آخر</button>`);
    find.hidden = !adding;
    if(adding && !$('.cancel', find)) find.insertAdjacentHTML('beforeend', '<button type="button" class="cancel">إلغاء</button>');
    if(!adding){ const c = $('.cancel', find); if(c) c.remove(); }
  } else { link.hidden = true; link.innerHTML = ''; find.hidden = false; const c = $('.cancel', find); if(c) c.remove(); }
  renderResults(it);
  const prevNos = (!fin && has) ? nosOf(it).filter(hasPrev) : [];
  let h = '';
  if(dup) h = `<span class="err">مكرر — الصنف ${esc(dupN)} مربوط بصورة أخرى</span>`;
  else if(it.st === 'new') h = it.q ? 'اضغط خانة البحث لعرض الأصناف' : 'لم يُحدَّد بعد';
  else if(it.st === 'suggest') h = '';
  else if(it.st === 'ready') h = `<span class="ok">✓ جاهز</span>`;
  else if(it.st === 'queued') h = it.msg ? esc(it.msg) : 'بالانتظار في الطابور…';
  else if(it.st === 'uploading') h = '<span class="spinner"></span> جارِ الرفع…';
  else if(it.st === 'staged') h = `<span class="ok">✓ رُفعت</span> ${esc(it.msg || 'بانتظار النشر مع الدفعة')}`;
  else if(it.st === 'done') h = `<span class="ok">${esc(it.msg || '✓ تم')}</span>`;
  else if(it.st === 'skipped') h = esc(it.msg || 'تم التجاوز');
  else if(it.st === 'error') h = `<span class="err">${esc(it.msg || 'فشل الرفع')}</span><button type="button" class="retry">إعادة المحاولة</button>`;
  if(prevNos.length){
    const which = it.items.length > 1 ? ` (${prevNos.join('، ')})` : '';
    h += `<span class="pu-tag">${ROLE === 'admin' ? 'له صورة من قبل' + which + ' — سيُطلب التأكيد' : 'له صورة من قبل' + which + ' — تُرسل كاستبدال'}</span>`;
  }
  st.innerHTML = h;
  renderChrome();
}

// =====================================================================
// أعلى الصفحة وأسفلها
// =====================================================================
const counts = () => {
  const c = { total: LIST.length, linked: 0, sug: 0, ready: 0, queued: 0, staged: 0, done: 0, err: 0, skipped: 0, batch: 0, batchDone: 0 };
  LIST.forEach(it => {
    if(it.items && it.items.length) c.linked++;
    if(it.st === 'suggest') c.sug++;
    if(it.st === 'ready' && !isDup(it)) c.ready++;
    if(it.st === 'queued' || it.st === 'uploading') c.queued++;
    if(it.st === 'staged') c.staged++;
    if(it.st === 'done') c.done++;
    if(it.st === 'skipped') c.skipped++;
    if(it.st === 'error') c.err++;
    if(it.b){ c.batch++; if(it.st === 'done' || it.st === 'skipped' || it.st === 'error' || it.st === 'staged') c.batchDone++; }
  });
  return c;
};
function renderChrome(){
  const c = counts();
  $('#puChip').textContent = ROLE === 'admin' ? 'إدارة' : ROLE === 'staff' ? 'موظف' : '';
  $('#puWho').textContent = ROLE === 'none' ? '' : 'داخل بحساب: ' + (ROLE === 'admin' ? 'الإدارة العامة' : (ROLE_NAME || 'موظف'));
  $('#puCount').textContent = c.total ? `${c.total} صورة — تم ربط ${c.linked} من ${c.total}` : 'لم تُختر صور بعد';
  $('#puHint').textContent = c.sug ? `${c.sug} اقتراح بانتظار مراجعتك` : (c.total && !c.linked ? 'اختر الصنف لكل صورة' : '');
  const bs = $('#puAcceptSug'); bs.hidden = !c.sug; bs.textContent = `اعتماد كل الاقتراحات (${c.sug})`;
  $('#puClearDone').hidden = !(c.done || c.skipped);
  $('#puClearAll').hidden = !c.total || RUNNING;
  $('#puPick').classList.toggle('off', LIST.length >= MAX_FILES);
  const go = $('#puGo'), note = $('#puNote'), prog = $('#puProg');
  const label = ROLE === 'staff' ? 'إرسال للمراجعة' : 'حفظ ونشر الصور المربوطة';
  if(RUNNING || c.queued){
    go.disabled = true; go.textContent = c.queued ? `جارِ الرفع… ${c.batchDone} / ${c.batch}` : 'جارِ النشر…';
  } else if(c.staged && !c.ready){
    go.disabled = false; go.textContent = `إعادة محاولة النشر (${c.staged})`;
  } else {
    go.disabled = !c.ready; go.textContent = c.ready ? `${label} (${c.ready})` : label;
  }
  prog.hidden = !c.batch || (!RUNNING && !c.queued && c.batchDone === c.batch && !c.err && c.batch === 0);
  if(c.batch){
    prog.hidden = false;
    $('#puProgBar').style.width = Math.round(c.batchDone / c.batch * 100) + '%';
    $('#puProgTx').textContent = c.queued ? `${c.batchDone} من ${c.batch} — يُحفظ التقدم تلقائيًا، يمكنك إغلاق الصفحة والمتابعة لاحقًا`
      : c.staged ? (RUNNING ? 'جارِ نشر الدفعة كلها دفعة واحدة…' : `رُفعت ${c.staged} صورة وبانتظار النشر — اضغط «إعادة محاولة النشر»`)
      : (c.err ? `اكتمل ${c.batchDone - c.err} من ${c.batch} — ${c.err} فشلت (اضغط «إعادة المحاولة» بجانبها)` : `✓ اكتمل ${c.batch} من ${c.batch}`);
  } else prog.hidden = true;
  note.textContent = ROLE === 'staff' ? 'الصور تذهب للإدارة للموافقة قبل ظهورها في الموقع' : ROLE === 'admin' ? 'تظهر الصورة للجميع خلال دقيقة تقريبًا من النشر' : '';
  renderTop();
}
// زر «إضافة صور» والجرس لا يظهران في الواجهة الرئيسية ولا في وضع الزبون —
// فقط بعد الدخول لقسم الموظف أو الإدارة العامة
function inStaffArea(){
  const v = document.querySelector('.view.active');
  if(!v || v.id === 'view-gate') return false;
  if(v.id === 'view-employee' && typeof currentViewerRole !== 'undefined' && currentViewerRole === 'customer') return false;
  return true;
}
function renderTop(){
  const c = counts(), busy = RUNNING || c.queued;
  top.hidden = ROLE === 'none' || !inStaffArea() || $('#view-photo-upload').classList.contains('active') || $('#view-photo-approvals').classList.contains('active');
  $('#puBell').hidden = ROLE !== 'admin';
  $('#puOpen').classList.toggle('busy', !!busy);
  $('#puOpenTx').textContent = busy ? `رفع ${c.batchDone}/${c.batch}` : 'إضافة صور';
}
let COUNT = 0;
function setCount(n){ COUNT = n; const b = $('#puBadge'); b.textContent = String(n); b.hidden = !n; $('#puBell').setAttribute('aria-label', n ? `صور بانتظار الموافقة: ${n}` : 'صور بانتظار الموافقة'); }
async function pollCount(){
  if(ROLE !== 'admin' || document.hidden) return;
  try { setCount((await api('img_pending_count')).count || 0); } catch(e){}
}
setInterval(pollCount, 60000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) pollCount(); });
new MutationObserver(renderTop).observe(upView, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(renderTop).observe(apView, { attributes: true, attributeFilter: ['class'] });

// =====================================================================
// إضافة الصور
// =====================================================================
async function ensureItems(){
  try { if(typeof loadItems === 'function') loadItems(); } catch(e){}
  for(let i = 0; i < 75 && !(typeof itemsLoaded !== 'undefined' && itemsLoaded && ITEMS.length); i++) await sleep(200);
}
function setMsg(t, k){ const m = $('#puMsg'); m.textContent = t || ''; m.className = 'msg' + (k ? ' ' + k : ''); }

async function addFiles(files){
  files = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name));
  if(!files.length) return;
  const room = MAX_FILES - LIST.length;
  if(room <= 0){ setMsg(`وصلت للحد الأقصى (${MAX_FILES} صورة) — ارفع المربوط أولًا ثم أضف غيره`, 'err'); return; }
  let cut = 0;
  if(files.length > room){ cut = files.length - room; files = files.slice(0, room); }
  await ensureItems();
  let bad = 0, n = 0;
  $('#puPick').classList.add('off');
  for(const f of files){
    setMsg(`جارِ ضغط الصور… ${++n} / ${files.length}`);
    try {
      const { blob, thumb } = await compress(f);
      const a = analyzeName(f.name);
      const it = { id: uid(), name: f.name, blob, thumb, order: Date.now() * 1000 + LIST.length, items: [], q: '', st: 'new', sugg: false, msg: '', tries: 0, b: false };
      if(a.itemNo){ const item = findItem(a.itemNo); it.items = [{ no: a.itemNo, name: item ? item.name : '' }]; it.st = 'suggest'; it.sugg = true; }
      else if(a.query) it.q = a.query;
      LIST.push(it);
      await persist(it);
      $('#puList').appendChild(mkRow(it));
    } catch(e){ bad++; }
    if(n % 5 === 0) await sleep(0);
  }
  $('#puPick').classList.remove('off');
  const parts = [`✓ أُضيفت ${files.length - bad} صورة`];
  if(bad) parts.push(`${bad} لم تُقرأ`);
  if(cut) parts.push(`${cut} تجاوزت الحد (${MAX_FILES})`);
  setMsg(parts.join(' — '), bad || cut ? 'err' : 'ok');
  LIST.forEach(refresh);
}

function removeRow(it){
  const el = rowEls.get(it.id); if(el) el.remove();
  rowEls.delete(it.id);
  const u = rt(it).url; if(u) try { URL.revokeObjectURL(u); } catch(e){}
  LIST = LIST.filter(x => x !== it); dbDel('items', it.id);
  LIST.forEach(refresh);
}

// =====================================================================
// تأكيد الاستبدال (الإدارة)
// =====================================================================
// يُسأل عن كل صنف على حدة (الصورة الواحدة قد تضم عدة أصناف)
function askReplace(it, x, idx, total){
  return new Promise(res => {
    const item = findItem(x.no), old = (() => { try { return itemImage(x.no); } catch(e){ return ''; } })();
    modal.innerHTML = `<div class="pu-card">
      <h3>${ICON.warn}<span>هذا الصنف له صورة من قبل</span></h3>
      <p>${esc((item && item.name) || x.name)} · رقم ${esc(x.no)} — هل أنت متأكد أنك تريد استبدال الصورة؟${total > 1 ? `<br><small>(${idx} من ${total})</small>` : ''}${it.items.length > 1 ? `<br><small>الصورة مربوطة بـ ${it.items.length} أصناف؛ رفضك هنا يستثني هذا الصنف فقط.</small>` : ''}</p>
      <div class="pu-pair">
        <figure><div class="im">${old ? `<img src="${esc(old)}" alt="الصورة الحالية">` : 'الصورة الحالية'}</div><figcaption>الحالية</figcaption></figure>
        <figure><div class="im new"><img src="${esc(thumbSrc(it))}" alt="الصورة الجديدة"></div><figcaption class="new">الجديدة</figcaption></figure>
      </div>
      <div class="btns"><button type="button" class="main" data-v="1">نعم، استبدل الصورة</button><button type="button" data-v="0">لا، احتفظ بالحالية</button></div></div>`;
    modal.classList.add('open');
    modal.onclick = e => { const b = e.target.closest('button[data-v]'); if(!b) return; modal.classList.remove('open'); modal.onclick = null; res(b.dataset.v === '1'); };
    const f = $('button[data-v="1"]', modal); if(f) f.focus();
  });
}

// =====================================================================
// الرفع بالخلفية — واحدة واحدة
// =====================================================================
async function startUpload(){
  const ready = LIST.filter(it => it.st === 'ready' && !isDup(it));
  if(!ready.length){ LIST.forEach(it => { if(it.st === 'staged') it.msg = ''; }); runQueue(); return; }   // لا جديد: إعادة محاولة نشر المرفوع
  LIST.forEach(it => { if(it.st === 'done' || it.st === 'skipped' || it.st === 'error') it.b = false; });
  if(ROLE === 'admin'){
    let total = 0, i = 0;
    ready.forEach(it => it.items.forEach(x => { if(hasPrev(x.no)) total++; }));
    for(const it of ready){
      for(const x of [...it.items]){
        if(!hasPrev(x.no)) continue;
        if(!await askReplace(it, x, ++i, total)) it.items = it.items.filter(y => y.no !== x.no);   // رُفض استبدال هذا الصنف: يخرج من الربط
      }
      if(!it.items.length){ it.st = 'skipped'; it.msg = 'أُبقيت الصور الحالية'; persist(it); refresh(it); continue; }
      it.st = 'queued'; it.b = true; it.tries = 0; it.msg = ''; await persist(it); refresh(it);
    }
  } else {
    for(const it of ready){ it.st = 'queued'; it.b = true; it.tries = 0; it.msg = ''; await persist(it); refresh(it); }
  }
  runQueue();
}
async function waitOnline(ms){
  if(navigator.onLine === false){
    await new Promise(res => { const f = () => { window.removeEventListener('online', f); res(); }; window.addEventListener('online', f); setTimeout(f, 30000); });
  } else await sleep(ms);
}
// أثر محلي فوري بعد النشر (إلى أن يصل الإصدار الجديد من GitHub)
function setLocalImage(itemNo, src){
  try { if(typeof ITEM_IMAGES !== 'undefined' && src) ITEM_IMAGES[String(itemNo)] = src; } catch(e){}
  try { if(typeof renderResults === 'function') renderResults(); } catch(e){}
}
// الإدارة: الصور المرفوعة (staged) تُنشر كلها دفعة واحدة = commit واحد في GitHub (فلا يُعاد بناء الموقع مئات المرات)
async function publishStaged(){
  for(let attempt = 0; attempt < 6; attempt++){
    const staged = LIST.filter(it => it.st === 'staged');
    if(!staged.length || ROLE !== 'admin') return;
    try {
      await api('img_publish');
      for(const it of staged){
        it.st = 'done'; it.msg = '✓ نُشرت — تظهر للجميع خلال دقيقة';
        if(it.blob){ const lu = URL.createObjectURL(it.blob); nosOf(it).forEach(n => setLocalImage(n, lu)); }
        delete it.blob; const u = rt(it).url; if(u){ rt(it).url = ''; try { URL.revokeObjectURL(u); } catch(e){} }
        await persist(it); refresh(it);
      }
      return;
    } catch(e){
      if(e.network){ await waitOnline(6000); continue; }
      staged.forEach(it => { it.msg = e.message; refresh(it); });
      return;                                            // خطأ نهائي (مثل مفتاح GitHub): تبقى الصور محفوظة وتظهر «إعادة محاولة النشر»
    }
  }
}
async function runQueue(){
  if(RUNNING || ROLE === 'none') return;
  if(!LIST.some(it => it.st === 'queued' || it.st === 'uploading' || (it.st === 'staged' && ROLE === 'admin'))) return;
  RUNNING = true; renderChrome();
  try {
    for(;;){
      if(ROLE === 'none') break;
      const it = LIST.find(x => x.st === 'queued' || x.st === 'uploading'); if(!it) break;
      it.st = 'uploading'; refresh(it);
      try {
        if(!it.blob) throw Object.assign(new Error('الصورة المحفوظة غير متوفرة — أعد اختيارها'), { fatal: true });
        const r = await api('img_upload', { id: it.id, itemNos: nosOf(it), itemNames: it.items.map(x => x.name), data: await blobToB64(it.blob) });
        if(r.status === 'staged'){ it.st = 'staged'; it.msg = 'بانتظار النشر مع الدفعة'; }   // نبقي الصورة محليًا إلى أن تُنشر
        else {
          it.st = 'done'; it.msg = r.status === 'published' ? '✓ نُشرت — تظهر للجميع خلال دقيقة' : '✓ أُرسلت للإدارة للمراجعة';
          delete it.blob;                                    // نوفّر مساحة الجهاز بعد النجاح (المصغّرة تبقى للعرض)
          const u = rt(it).url; if(u){ rt(it).url = ''; try { URL.revokeObjectURL(u); } catch(e){} }
        }
      } catch(e){
        if(e.network){ it.st = 'queued'; it.msg = 'انقطع الاتصال — سيُستأنف تلقائيًا'; refresh(it); await persist(it); await waitOnline(6000); continue; }
        if(e.fatal){ it.st = 'error'; it.msg = e.message; }
        else { it.tries = (it.tries || 0) + 1; if(it.tries >= 3){ it.st = 'error'; it.msg = e.message; } else { it.st = 'queued'; it.msg = 'إعادة المحاولة…'; refresh(it); await persist(it); await sleep(1500 * it.tries); continue; } }
      }
      await persist(it); refresh(it);
    }
    await publishStaged();
  } finally { RUNNING = false; renderChrome(); if(ROLE === 'admin') pollCount(); }
}
window.addEventListener('online', () => { if(ROLE !== 'none') runQueue(); });

// =====================================================================
// صفحة الموافقات (الإدارة)
// =====================================================================
let PENDING = [];
const PIMG = new Map();                                  // id -> data URL (معاينة)
const pNos = p => p.itemNos && p.itemNos.length ? p.itemNos : (p.itemNo ? [p.itemNo] : []);
const pNames = p => p.itemNames && p.itemNames.length ? p.itemNames : (p.itemName ? [p.itemName] : []);
const pHasPrev = p => pNos(p).some(hasPrev);
let imgQ = [], imgBusy = 0;
const INFLIGHT = new Map();
function loadPendImg(id){
  if(PIMG.has(id)) return Promise.resolve(PIMG.get(id));
  if(INFLIGHT.has(id)) return INFLIGHT.get(id);
  const pr = new Promise(res => { imgQ.push({ id, res }); pump(); }).then(u => { INFLIGHT.delete(id); return u; });
  INFLIGHT.set(id, pr); return pr;
}
function pump(){
  while(imgBusy < 2 && imgQ.length){
    const job = imgQ.shift(); imgBusy++;
    api('img_pending_get', { id: job.id }).then(r => { const u = 'data:image/jpeg;base64,' + r.data; PIMG.set(job.id, u); job.res(u); }).catch(() => job.res('')).then(() => { imgBusy--; pump(); });
  }
}
function fillPendImgs(root){
  root.querySelectorAll('[data-pimg]').forEach(box => {
    loadPendImg(box.dataset.pimg).then(u => { if(!u) { box.textContent = 'تعذّر التحميل'; return; } const im = document.createElement('img'); im.src = u; im.alt = ''; box.textContent = ''; box.appendChild(im); box.dataset.src = u; });
  });
}
async function openApprovals(){
  showView('photo-approvals');
  await loadPending();
}
async function loadPending(){
  const body = $('#apBody');
  body.innerHTML = '<div class="empty-note"><span class="spinner"></span> جارِ التحميل…</div>';
  try { await ensureItems(); PENDING = (await api('img_pending_list')).items || []; setCount(PENDING.length); renderPending(); }
  catch(e){ body.innerHTML = `<div class="empty-note">${esc(e.network ? 'تحقق من الإنترنت وحاول مرة أخرى' : e.message)}</div>`; }
}
function renderPending(){
  const body = $('#apBody');
  if(!PENDING.length){ body.innerHTML = '<div class="empty-note">لا توجد صور بانتظار الموافقة</div>'; return; }
  const plain = PENDING.filter(p => !pHasPrev(p)).length;
  body.innerHTML = PENDING.map(p => {
    if(p.from) return linkCard(p);
    const nos = pNos(p), names = pNames(p), prevNos = nos.filter(hasPrev), prev = prevNos.length > 0;
    // كل الأصناف المرتبطة بالصورة، والتي لها صورة سابقة موسومة
    const list = nos.map((n, i) => { const it = findItem(n); return `<div class="meta"><b>${esc(n)}</b> ${esc((it && it.name) || names[i] || '—')}${hasPrev(n) ? ' <span class="pu-tag">استبدال</span>' : ' <span class="pu-tag new">أولى</span>'}</div>`; }).join('');
    const pairs = prevNos.map(n => { const old = itemImage(n), it = findItem(n); return `<div class="pu-pair pair"><figure><div class="im" data-src="${esc(old)}"><img src="${esc(old)}" alt="الصورة الحالية"></div><figcaption>الحالية — ${esc(n)}${it ? ' · ' + esc(it.name) : ''}</figcaption></figure>
        <figure><div class="im new" data-pimg="${esc(p.id)}"><span class="spinner"></span></div><figcaption class="new">الجديدة</figcaption></figure></div>`; }).join('');
    return `<div class="pu-ap${prev ? ' replace' : ''}" data-id="${esc(p.id)}">
      <div class="top">
        ${prev ? '' : `<button type="button" class="big" data-pimg="${esc(p.id)}" aria-label="تكبير الصورة"><span class="spinner"></span></button>`}
        <div><div class="nm">${nos.length > 1 ? `صورة واحدة لـ ${nos.length} أصناف` : esc(((findItem(nos[0]) || {}).name) || names[0] || '—')}</div>
        <div class="meta">من: ${esc(p.by)} · ${esc(p.at)}</div></div>
      </div>
      ${nos.length > 1 || prev ? `<div class="pu-lst">${list}</div>` : `<div class="meta">رقم ${esc(nos[0])}</div>`}
      <span class="pu-tag ${prev ? '' : 'new'}" style="align-self:flex-start">${prev ? 'استبدال — ' + (nos.length > 1 ? 'لبعض الأصناف صورة من قبل' : 'للصنف صورة من قبل') : (nos.length > 1 ? 'صورة أولى لكل الأصناف' : 'صورة أولى للصنف')}</span>
      ${pairs}
      <div class="act"><button type="button" class="ok" data-d="approve">${prev ? 'قبول واستبدال' : 'قبول'}</button><button type="button" class="no" data-d="reject">رفض</button></div>
      <div class="msg" role="status"></div></div>`;
  }).join('') + `<button type="button" class="pu-allbtn" id="apAll" ${plain ? '' : 'disabled'}>قبول الكل (بدون الاستبدالات)${plain ? ` — ${plain}` : ''}</button>`;
  fillPendImgs(body);
}
// طلب «ربط صورة موجودة» من موظف: الصورة موجودة أصلًا على الموقع (صورة الصنف المصدر)
function linkCard(p){
  const to = pNos(p)[0], src = (() => { try { return itemImage(p.from); } catch(e){ return ''; } })(), prev = hasPrev(to);
  const fromIt = findItem(p.from), toIt = findItem(to), old = prev ? itemImage(to) : '';
  return `<div class="pu-ap link${prev ? ' replace' : ''}" data-id="${esc(p.id)}">
    <div class="top">
      ${prev ? '' : `<button type="button" class="big" aria-label="تكبير الصورة" data-src="${esc(src)}">${src ? `<img src="${esc(src)}" alt="">` : 'لا توجد صورة'}</button>`}
      <div><span class="pu-tag link">طلب ربط صورة موجودة</span>
      <div class="meta">من: ${esc(p.by)} · ${esc(p.at)}</div></div>
    </div>
    <div class="pu-lst">
      <div class="meta">صورة الصنف: <b>${esc(p.from)}</b> ${esc((fromIt && fromIt.name) || '—')}</div>
      <div class="meta">تُستخدم أيضًا للصنف: <b>${esc(to)}</b> ${esc((toIt && toIt.name) || pNames(p)[0] || '—')}</div>
    </div>
    ${prev ? `<span class="pu-tag" style="align-self:flex-start">ربط + استبدال — للصنف صورة من قبل</span>
      <div class="pu-pair pair"><figure><div class="im" data-src="${esc(old)}"><img src="${esc(old)}" alt="الصورة الحالية"></div><figcaption>الحالية</figcaption></figure>
      <figure><div class="im new" data-src="${esc(src)}">${src ? `<img src="${esc(src)}" alt="الصورة الجديدة">` : '—'}</div><figcaption class="new">الجديدة</figcaption></figure></div>` : ''}
    <div class="act"><button type="button" class="ok" data-d="approve">${prev ? 'قبول واستبدال' : 'قبول'}</button><button type="button" class="no" data-d="reject">رفض</button></div>
    <div class="msg" role="status"></div></div>`;
}
async function decide(p, decision, card){
  const btns = card ? card.querySelectorAll('button') : [], msg = card && $('.msg', card);
  btns.forEach(b => b.disabled = true);
  if(msg){ msg.className = 'msg'; msg.innerHTML = '<span class="spinner"></span> جارِ الحفظ…'; }
  try {
    const r = await api('img_decide', { id: p.id, decision });
    if(decision === 'approve') pNos(p).forEach(n => setLocalImage(n, PIMG.get(p.id) || r.paths && r.paths[n] || r.path));
    PENDING = PENDING.filter(x => x.id !== p.id); PIMG.delete(p.id);
    if(card) card.remove();
    setCount(PENDING.length);
    return true;
  } catch(e){
    if(msg){ msg.className = 'msg err'; msg.textContent = e.network ? 'تحقق من الإنترنت وحاول مرة أخرى' : e.message; }
    btns.forEach(b => b.disabled = false);
    return false;
  }
}
apView.addEventListener('click', async e => {
  const zoom = e.target.closest('.big, .im[data-src], .im[data-pimg]');
  if(zoom && !e.target.closest('button[data-d]')){ const s = zoom.dataset.src; if(s && typeof openLightbox === 'function') openLightbox(s, ''); return; }
  const b = e.target.closest('button[data-d]');
  if(b){
    const card = b.closest('.pu-ap'), p = PENDING.find(x => x.id === card.dataset.id); if(!p) return;
    if(b.dataset.d === 'reject' && !await showConfirm('رفض هذه الصورة؟', { title: 'رفض الصورة', okText: 'رفض' })) return;
    await decide(p, b.dataset.d, card);
    if(!PENDING.length) renderPending(); else { const all = $('#apAll'); if(all){ const n = PENDING.filter(x => !pHasPrev(x)).length; all.disabled = !n; all.textContent = 'قبول الكل (بدون الاستبدالات)' + (n ? ` — ${n}` : ''); } }
    return;
  }
  if(e.target.closest('#apAll')){
    const all = $('#apAll'), seen = new Set(), todo = [];
    PENDING.forEach(p => {                              // صنف مشترك بين صورتين منتظرتين: الأولى فقط، والثانية تبقى استبدالًا لقرارك
      const nos = pNos(p);
      if(!pHasPrev(p) && !nos.some(n => seen.has(n))){ nos.forEach(n => seen.add(n)); todo.push(p); }
    });
    const skip = PENDING.length - todo.length;
    if(!todo.length) return;
    if(!await showConfirm(`قبول ${todo.length} صورة جديدة؟ تُنشر كلها في commit واحد.` + (skip ? `\nالاستبدالات (${skip}) لن تُقبل تلقائيًا — تبقى لقرارك.` : ''), { title: 'قبول الكل', okText: 'قبول' })) return;
    all.disabled = true; all.textContent = `جارِ نشر ${todo.length} صورة دفعة واحدة…`;
    let fail = '';
    try {
      for(let i = 0; i < todo.length; i += 100){
        const chunk = todo.slice(i, i + 100), r = await api('img_decide_batch', { ids: chunk.map(p => p.id), decision: 'approve' });
        (r.done || []).forEach(id => { const p = PENDING.find(x => x.id === id); if(p) pNos(p).forEach(n => setLocalImage(n, PIMG.get(id) || (r.paths || {})[n])); });
        PENDING = PENDING.filter(x => !(r.done || []).includes(x.id)); setCount(PENDING.length);
      }
    } catch(e){ fail = e.network ? 'تحقق من الإنترنت وحاول مرة أخرى' : e.message; }
    renderPending();
    if(fail){ const m = document.createElement('div'); m.className = 'msg err'; m.textContent = fail; $('#apBody').prepend(m); }
  }
});
const apBody = () => $('#apBody');

// =====================================================================
// الأزرار
// =====================================================================
// =====================================================================
// ربط صنف بصورة صنف آخر موجودة على الموقع (بدون رفع ولا نسخ الملف)
// =====================================================================
const hostedImage = n => { try { return typeof ITEM_IMAGES !== 'undefined' && ITEM_IMAGES[String(n).trim()] || ''; } catch(e){ return ''; } };
const lkModal = document.createElement('div');
lkModal.className = 'pu-modal pu-sheet'; lkModal.setAttribute('role', 'dialog'); lkModal.setAttribute('aria-modal', 'true');
document.body.appendChild(lkModal);
let LK = null;   // { to, from, q }
function closeLink(){ lkModal.classList.remove('open'); LK = null; }
try { registerBackLayer(lkModal, closeLink); } catch(e){}
function openLink(toNo){
  const to = findItem(toNo); if(!to) return;
  LK = { to: String(to.number).trim(), from: '', q: '' };
  lkModal.innerHTML = `<div class="pu-card lk">
    <div class="lk-h"><h3><span>استخدام صورة صنف آخر</span></h3><button type="button" class="lk-x" aria-label="إغلاق">×</button></div>
    <p>للصنف: <b>${esc(LK.to)}</b> ${esc(to.name || '')}</p>
    <label class="lk-lb">ابحث عن الصنف الذي له الصورة</label>
    <div class="pu-find"><span class="pu-qw"><input type="text" class="pu-q" id="lkQ" placeholder="الاسم أو رقم الصنف…" autocomplete="off" aria-label="بحث عن الصنف الذي له الصورة"><button type="button" class="pu-clr" aria-label="مسح نص البحث">×</button></span></div>
    <div class="lk-res" id="lkRes"><div class="none">اكتب للبحث — تظهر فقط الأصناف التي لها صورة</div></div>
    <div class="lk-prev" id="lkPrev" hidden></div>
    <div class="msg" id="lkMsg" role="status"></div>
    <div class="btns"><button type="button" class="main" id="lkGo" disabled>${ROLE === 'admin' ? 'ربط الصورة' : 'إرسال للموافقة'}</button><button type="button" id="lkCancel">إلغاء</button></div>
  </div>`;
  lkModal.classList.add('open');
  const q = $('#lkQ', lkModal);
  q.addEventListener('input', () => { LK.q = q.value; renderLink(); });
  setTimeout(() => q.focus(), 60);
}
function renderLink(){
  if(!LK) return;
  const box = $('#lkRes', lkModal), q = (LK.q || '').trim();
  if(!q){ box.innerHTML = '<div class="none">اكتب للبحث — تظهر فقط الأصناف التي لها صورة</div>'; }
  else {
    const found = searchItems(q, 400).filter(f => String(f.number).trim() !== LK.to && hostedImage(f.number)).slice(0, 40);
    box.innerHTML = found.length ? found.map(f => { const n = String(f.number).trim(); return `<button type="button" data-from="${esc(n)}" class="${n === LK.from ? 'on' : ''}"><img src="${esc(hostedImage(n))}" alt="" loading="lazy"><span><b>${esc(n)}</b> ${esc(f.name || '')}${[f.company, f.country].filter(Boolean).length ? `<small>${esc([f.company, f.country].filter(Boolean).join(' · '))}</small>` : ''}</span></button>`; }).join('')
      : '<div class="none">لا توجد أصناف لها صورة بهذا الاسم</div>';
  }
  const pv = $('#lkPrev', lkModal);
  if(LK.from){ pv.hidden = false; pv.innerHTML = `<img src="${esc(hostedImage(LK.from))}" alt="معاينة الصورة المختارة"><small>ستُستخدم نفس الصورة للصنفين — بدون رفع أو نسخ</small>`; }
  else { pv.hidden = true; pv.innerHTML = ''; }
  $('#lkGo', lkModal).disabled = !LK.from;
}
lkModal.addEventListener('click', async e => {
  if(e.target === lkModal){ closeLink(); return; }
  const b = e.target.closest('button'); if(!b || !LK) return;
  if(b.classList.contains('lk-x') || b.id === 'lkCancel'){ closeLink(); return; }
  if(b.classList.contains('pu-clr')){ const q = $('#lkQ', lkModal); q.value = ''; LK.q = ''; LK.from = ''; renderLink(); q.focus(); return; }
  if(b.dataset.from){ LK.from = b.dataset.from; renderLink(); return; }
  if(b.id === 'lkGo') await submitLink();
});
async function submitLink(){
  const go = $('#lkGo', lkModal), msg = $('#lkMsg', lkModal), { to, from } = LK, toIt = findItem(to);
  if(ROLE === 'admin' && hasPrev(to) && !await showConfirm('هذا الصنف له صورة من قبل، هل تريد استبدالها بصورة الصنف ' + from + '؟', { title: 'استبدال الصورة', okText: 'نعم، استبدل' })) return;
  go.disabled = true; msg.className = 'msg'; msg.innerHTML = '<span class="spinner"></span> جارِ الحفظ…';
  try {
    const r = await api('img_link', { id: uid(), from, to, toName: (toIt && toIt.name) || '' });
    if(r.status === 'published'){
      setLocalImage(to, r.path || hostedImage(from));
      closeLink();
      try { if(typeof currentItem !== 'undefined' && currentItem && String(currentItem.number).trim() === to) openItemDetail(to); } catch(e){}
      try { await showAlert('تم ربط الصورة — تظهر للجميع خلال دقيقة تقريبًا.', { title: 'تم', okText: 'حسنًا' }); } catch(e){}
    } else {
      closeLink();
      try { await showAlert('أُرسل طلب الربط للإدارة، ويظهر بعد موافقتها.', { title: 'تم الإرسال', okText: 'حسنًا' }); } catch(e){}
    }
  } catch(e){
    msg.className = 'msg err'; msg.textContent = e.network ? 'تحقق من الإنترنت وحاول مرة أخرى' : e.message; go.disabled = false;
  }
}
// زر «استخدام صورة صنف آخر» في صفحة صنف بلا صورة — للموظفين والإدارة فقط (لا يظهر للزبون)
function addLinkBtn(no){
  const card = document.getElementById('employeeItemCard'); if(!card) return;
  const old = $('.lk-empty', card); if(old) old.remove();
  if(ROLE === 'none' || (typeof currentViewerRole !== 'undefined' && currentViewerRole === 'customer')) return;
  if(hasPrev(no)) return;
  card.insertAdjacentHTML('afterbegin', `<div class="lk-empty"><span>لا توجد صورة لهذا الصنف بعد</span>
    <button type="button" class="lk-open" data-to="${esc(no)}">${ICON.link}<span>استخدام صورة صنف آخر</span></button>
    <small>أو ارفع صورة جديدة من «إضافة صور»</small></div>`);
}
document.addEventListener('click', e => { const b = e.target.closest('.lk-open'); if(b) openLink(b.dataset.to); });
if(typeof window.openItemDetail === 'function'){
  const _openItemDetail = window.openItemDetail;
  window.openItemDetail = function(n){ const r = _openItemDetail.apply(this, arguments); try { addLinkBtn(String(n).trim()); } catch(e){} return r; };
}

async function openUpload(){
  showView('photo-upload');
  setMsg(''); await ensureItems(); LIST.forEach(refresh);
}
$('#puOpen').addEventListener('click', openUpload);
// يستعمله app.js لإعادة فتح شاشة الرفع/الموافقات بعد تحديث الصفحة
window.JADU_PU = { openUpload, openApprovals, ready: accessReady };
// إظهار/إخفاء الزر مع كل تنقّل بين الشاشات
document.querySelectorAll('.view').forEach(v => new MutationObserver(renderTop).observe(v, { attributes: true, attributeFilter: ['class'] }));
$('#puBell').addEventListener('click', openApprovals);
$('#puBack').addEventListener('click', () => history.back());
$('#apBack').addEventListener('click', () => history.back());
$('#puFiles').addEventListener('change', e => { const f = e.target.files; addFiles(f).then(() => { e.target.value = ''; }); });
$('#puGo').addEventListener('click', startUpload);
$('#puAcceptSug').addEventListener('click', () => { LIST.forEach(it => { if(it.st === 'suggest'){ it.st = 'ready'; it.sugg = false; persist(it); } }); LIST.forEach(refresh); });
$('#puClearDone').addEventListener('click', () => { LIST.filter(it => it.st === 'done' || it.st === 'skipped').forEach(removeRow); });
$('#puClearAll').addEventListener('click', async () => {
  if(!await showConfirm(`حذف كل الصور (${LIST.length}) من القائمة؟ لن يُرفع منها شيء.`, { title: 'حذف الكل', okText: 'حذف' })) return;
  [...LIST].forEach(removeRow);
});

// =====================================================================
// التشغيل
// =====================================================================
(async function init(){
  // آخر صلاحية معروفة (تُظهر الزر فورًا حتى بدون إنترنت) ثم يؤكدها الخادم
  const cached = lsGet(LS_ROLE);
  if(cached && cached.role && !DEMO){ ROLE = cached.role; ROLE_NAME = cached.name || ''; }
  try {
    const saved = (await dbAll('items')).sort((a, b) => a.order - b.order);
    saved.forEach(it => {
      if(it.st === 'uploading') it.st = 'queued';
      if(!it.items) it.items = it.itemNo ? [{ no: it.itemNo, name: it.itemName || '' }] : [];   // ترحيل الصيغة القديمة (صنف واحد)
      LIST.push(it);
    });
    await ensureItemsQuiet();
    LIST.forEach(it => $('#puList').appendChild(mkRow(it)));
  } catch(e){}
  renderChrome();
  await authSettled();
  refreshAccess();
  try { if(typeof auth !== 'undefined' && auth) { let first = true; auth.onAuthStateChanged(() => { if(first){ first = false; return; } refreshAccess(); }); } } catch(e){}
  if(DEMO){ const t = document.createElement('div'); t.style.cssText = 'position:fixed;bottom:6px;left:6px;z-index:60;background:#C9962B;color:#000;font:700 11px Tajawal,sans-serif;padding:3px 8px;border-radius:6px;opacity:.9;pointer-events:none'; t.textContent = 'معاينة تجريبية — الحساب: ' + (DEMO_ROLE === 'admin' ? 'إدارة' : DEMO_ROLE === 'staff' ? 'موظف' : 'غير مسجّل'); document.body.appendChild(t); }
})();
async function ensureItemsQuiet(){ try { if(typeof loadItems === 'function') loadItems(); } catch(e){} }
})();
