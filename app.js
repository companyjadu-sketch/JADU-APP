// =====================================================================
// الكود مشترك بين صفحتين:
//   index.html  ← صفحة الزبون (تصفح الأصناف فقط، بدون أي دخول للموظف/الإدارة)
//   staff.html  ← صفحة الموظف + الإدارة العامة
// كل صفحة تحدد نوعها بـ <body data-page="...">، وعناصر الصفحة الثانية ببساطة
// غير موجودة فيها (لذلك ربط الأزرار يستخدم ?. حتى ما يتعطل لو العنصر غير موجود).
// =====================================================================
const IS_CUSTOMER_PAGE = document.body.dataset.page === 'customer';

// الرابط المباشر للصنف: ?item=رقم (يأتي من QR على الماكينة). as=customer يمنع التحويل لشاشة الموظف.
const LINK_PARAMS = new URLSearchParams(location.search);
const DEEP_LINK_ITEM = (LINK_PARAMS.get('item') || '').trim().slice(0, 40);
const DEEP_LINK_FORCE_CUSTOMER = LINK_PARAMS.get('as') === 'customer';
const JADU_SITE_HOST = 'companyjadu-sketch.github.io';
// نفس رابط Apps Script الموجود في attendance.js (ATT_API_URL) — صفحة الزبون لا تحمّل ملف الحضور
const DEEPLINK_API_URL = "https://script.google.com/macros/s/AKfycbwu4D9_kR2wWv7EVFQ7UA06IvILceQSRb-7q6wO1H521ErCtoRxfaXKjtD6GWfKm4lTdQ/exec";
// إيميل الإدارة المسجَّل على هذا المتصفح، يكتبه staff.html عند دخول الإدارة ويمسحه عند الخروج (يقرأه index.html للتحويل)
const ADMIN_HINT_KEY = 'jadu_admin_hint';

/* مقدمة الشعار: تُعرض مرة واحدة فقط لكل جلسة متصفح (لتوفير البيانات على إنترنت ضعيف)،
   وبعدها تظهر الصورة الثابتة مباشرة. إن تعذّر التشغيل أو كان الجهاز بوضع توفير البيانات تظهر الصورة الثابتة فورًا */
(function(){
  var v = document.getElementById('heroIntro'), img = document.getElementById('heroLogo');
  if(!v || !img) return;
  function showStill(){ v.pause(); v.hidden = true; if(!img.src) img.src = img.dataset.src; img.hidden = false; }
  var alreadyPlayed = false;
  try{ alreadyPlayed = sessionStorage.getItem('jaduIntroPlayed') === '1'; }catch(e){}
  var saveData = (navigator.connection && navigator.connection.saveData) || false;
  if (alreadyPlayed || saveData || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { showStill(); return; }
  v.addEventListener('error', showStill);
  v.addEventListener('ended', function(){ try{ sessionStorage.setItem('jaduIntroPlayed', '1'); }catch(e){} });
  v.preload = "metadata";
  var p = v.play && v.play();
  if (p && p.catch) p.catch(showStill);
  // إنترنت ضعيف: لو الفيديو ما بدأ خلال 4 ثواني نعرض الشعار الثابت بدل ما يبقى المربع أحمر فاضي
  setTimeout(function(){ if (!v.hidden && v.currentTime === 0) showStill(); }, 4000);
})();

// =====================================================================
// نافذة تأكيد/تنبيه عامة بهوية التطبيق (بديل alert/confirm الافتراضية)
// =====================================================================
const dlgOverlay = document.getElementById('dlgOverlay');
const dlgTitle = document.getElementById('dlgTitle');
const dlgMessage = document.getElementById('dlgMessage');
const dlgCancelBtn = document.getElementById('dlgCancelBtn');
const dlgOkBtn = document.getElementById('dlgOkBtn');
let dlgResolve = null;

// =====================================================================
// حبس التركيز (focus trap) داخل النوافذ المنبثقة — إمكانية وصول: يمنع
// مفتاح Tab من "الهروب" لعناصر خلف النافذة المفتوحة، ويرجّع التركيز
// للعنصر اللي كان عليه المستخدم قبل الفتح عند الإغلاق
// =====================================================================
let focusTrapLastEl = null;
let focusTrapRemove = null;
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openFocusTrap(container){
  focusTrapLastEl = document.activeElement;
  function handleKeydown(e){
    if(e.key !== 'Tab') return;
    const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null);
    if(!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', handleKeydown);
  focusTrapRemove = () => container.removeEventListener('keydown', handleKeydown);
}
function closeFocusTrap(){
  if(focusTrapRemove){ focusTrapRemove(); focusTrapRemove = null; }
  if(focusTrapLastEl && typeof focusTrapLastEl.focus === 'function') focusTrapLastEl.focus();
  focusTrapLastEl = null;
}

function closeDialog(result){
  dlgOverlay.classList.remove('open');
  closeFocusTrap();
  if (dlgResolve) { const r = dlgResolve; dlgResolve = null; r(result); }
}
dlgCancelBtn.addEventListener('click', () => closeDialog(false));
dlgOkBtn.addEventListener('click', () => closeDialog(true));
dlgOverlay.addEventListener('click', (e) => { if (e.target === dlgOverlay) closeDialog(false); });

// يعرض نافذة تأكيد (نعم/إلغاء) وتُرجع Promise<boolean>
function showConfirm(message, opts = {}){
  return new Promise((resolve) => {
    dlgResolve = resolve;
    dlgTitle.textContent = opts.title || "تأكيد";
    dlgMessage.textContent = message;
    dlgCancelBtn.style.display = "";
    dlgCancelBtn.textContent = opts.cancelText || "إلغاء";
    dlgOkBtn.textContent = opts.okText || "تأكيد";
    dlgOverlay.classList.add('open');
    openFocusTrap(dlgOverlay);
  });
}

// يعرض نافذة تنبيه (زر واحد فقط) وتُرجع Promise<void>
function showAlert(message, opts = {}){
  return new Promise((resolve) => {
    dlgResolve = () => resolve();
    dlgTitle.textContent = opts.title || "تنبيه";
    dlgMessage.textContent = message;
    dlgCancelBtn.style.display = "none";
    dlgOkBtn.textContent = opts.okText || "حسنًا";
    dlgOverlay.classList.add('open');
    openFocusTrap(dlgOverlay);
  });
}

// =====================================================================
// إعداد Firebase — عوّض هذه القيم ببيانات مشروعك الخاص المجاني من
// https://console.firebase.google.com  (أنشئ مشروع -> Firestore Database
// -> ابدأ في وضع الاختبار "test mode" -> Project settings -> ضيف تطبيق ويب
// وانسخ القيم بالأسفل)
// =====================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBQ1xn1HKghA63Q4Qb0Yo40weBBi84l8Gk",
  authDomain: "jadu-app-90418.firebaseapp.com",
  projectId: "jadu-app-90418",
  storageBucket: "jadu-app-90418.firebasestorage.app",
  messagingSenderId: "712974951059",
  appId: "1:712974951059:web:92e7a9b484b25670f9a366"
};

let db = null;
let auth = null;
let firebaseReady = false;

// الإيميلات المسموح لها بدخول الإدارة العامة (نفس القائمة لازم تكون بقواعد Firestore)
const ADMIN_EMAILS = [
  "abdofakroun20@gmail.com",
  "no3y.fakroun20@gmail.com",
  "islam.aljhani@gmail.com"
];
function isAdminEmail(email){
  return !!email && ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

// حسابا الموظفين (حكيم وأنس) في Firebase Auth — نفس قائمة isStaff() في firestore.rules.
// حساب الموظف لا يفتح أي ميزة إدارية: كل ميزات الإدارة تبقى مربوطة بـ isAdminEmail فقط.
const STAFF_UIDS = ['8WkeswYmTnTwCynjfEUeVwPZkwA3', 'hfdODZQYB5TWqtBiIViTAbzvivm2'];
// اسم العرض لصاحب دفعة الصور (by = uid)
const STAFF_NAMES = { '8WkeswYmTnTwCynjfEUeVwPZkwA3': 'حكيم', 'hfdODZQYB5TWqtBiIViTAbzvivm2': 'أنس' };
const STAFF_EMAIL_DOMAIN = '@jadu-app-90418.firebaseapp.com';
// طريقة دخول شاشة الموظف في هذا التبويب: 'account' (حساب) أو فارغ (الرمز القديم)
const EMP_VIA_KEY = 'jadu_emp_via';
function isStaffUser(user){ return !!user && STAFF_UIDS.includes(user.uid); }
function staffSignedIn(){ return !!auth && isStaffUser(auth.currentUser); }
function empVia(){ try { return sessionStorage.getItem(EMP_VIA_KEY) || ''; } catch(e){ return ''; } }
function setEmpVia(v){ try { v ? sessionStorage.setItem(EMP_VIA_KEY, v) : sessionStorage.removeItem(EMP_VIA_KEY); } catch(e){} }
// شريط «موظف: hakim — خروج» يظهر فقط لموظف دخل بحسابه (لا للرمز القديم ولا للإدارة ولا للزبون)
function updateStaffRow(){
  const row = document.getElementById('staffUserRow');
  if (!row) return;
  const u = auth && auth.currentUser;
  const show = currentViewerRole === 'employee' && empVia() === 'account' && isStaffUser(u);
  row.hidden = !show;
  const name = document.getElementById('staffUserName');
  if (name) name.textContent = show ? 'موظف: ' + String(u.email || '').split('@')[0] : '';
}

// إعدادات إضافية للإدارة (حاليًا: سعر صرف الدولار الحالي لعرض رأس المال بالدولار)
let SETTINGS = { usdRate: 0 };

function initFirebase(){
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseReady = true;
    loadPhotoIndex();
    // صفحة الزبون: لا دخول ولا رموز ولا إعدادات إدارية — صور الأصناف فقط
    if (IS_CUSTOMER_PAGE) return;
    auth = firebase.auth();
    auth.languageCode = "ar";
    auth.onAuthStateChanged(user => {
      // المسموح فقط: حسابات الإدارة + حسابا الموظفين. أي حساب آخر (مثل sync-bot) يُخرَج فورًا
      if (user && !isAdminEmail(user.email) && !isStaffUser(user)) { auth.signOut(); return; }
      const isAdmin = !!(user && isAdminEmail(user.email));
      const el = document.getElementById('adminUserEmail');
      if (el) el.textContent = isAdmin ? user.email : "";
      try {
        if (isAdmin) localStorage.setItem(ADMIN_HINT_KEY, String(user.email || '').trim().toLowerCase());
        else localStorage.removeItem(ADMIN_HINT_KEY);
      } catch(e){}
      // موظف دخل بحسابه ثم لم يعد حسابه قائمًا (خروج، أو دخول حساب آخر): نرجعه للواجهة الرئيسية
      if (!isStaffUser(user) && empVia() === 'account') {
        setEmpVia('');
        try { sessionStorage.removeItem('jadu_emp_ok'); } catch(e){}
        const act = document.querySelector('.view.active');
        if (act && act.id === 'view-employee' && currentViewerRole === 'employee') showView('gate');
      }
      updateStaffRow();
      // ليس أدمن (خرج، أو حساب موظف): لو كان داخل شاشات الإدارة نرجعه للرئيسية، وننظّف البيانات الحساسة
      if (!isAdmin) {
        const active = document.querySelector('.view.active');
        if (active && active.id.startsWith('view-admin')) showView('gate');
        secureLoaded = false; // نظّف البيانات الحساسة من الذاكرة بعد الخروج
        SECURE_MAP = null; secureFetchedAt = 0; secureError = false;
        ITEMS.forEach(it => { it.priceWholesale = 0; it.lastPurchasePrice = 0; it.purchaseCurrency = ''; it.exchangeRate = 0; it.lastPurchaseDate = ''; });
      } else {
        // دخول إداري معتمد — اجلب بيانات الشراء المحمية من Firestore
        loadSecureItems();
        refreshPhotoEventsBadge();
        loadSettings(); // settings/currency للمدير والموظف بحساب فقط (القواعد) — تُقرأ بعد الدخول
      }
    });
  } catch(e) {
    console.warn("تعذّر تشغيل Firebase — تأكد من ضبط firebaseConfig", e);
  }
}

async function loadSettings(){
  if(!db) return;
  try {
    const doc = await db.collection("settings").doc("currency").get();
    if (doc.exists) {
      const data = doc.data();
      SETTINGS.usdRate = parseFloat(data.usdRate) || 0;
    }
    renderCapitalReport();
  } catch(e) {
    console.warn("تعذّرت قراءة سعر الصرف من القاعدة", e);
  }
}

// ---------------------------------------------------------------
// التنقل بين الشاشات + ربطها بزر الرجوع الفعلي (هاتف/متصفح)
// ---------------------------------------------------------------
// بدون هذا الربط، كل تنقل داخل التطبيق (دخول موظف -> تصنيف -> بحث...)
// ما يترك أثرًا بتاريخ المتصفح، فزر الرجوع الحقيقي بالهاتف ما يلقى شيء
// "يرجع له" غير الصفحة اللي قبل فتح التطبيق، فيطلع المستخدم كليًا.
// الحل: كل تنقل للأمام يسجَّل بـ history.pushState، وزر الرجوع (داخل
// التطبيق أو زر الهاتف) يستخدم history.back() بدل تغيير الشاشة مباشرة،
// ويتكفّل مستمع popstate بإعادة رسم الشاشة الصحيحة من حالة التاريخ.
let isRestoringNav = false; // true أثناء استرجاع حالة من popstate (يمنع تسجيل حالة جديدة فوقها)
let currentNav = { view: 'gate', step: null }; // آخر حالة تنقل مُسجَّلة فعليًا بتاريخ المتصفح

function navMatchesCurrent(view, step){
  return currentNav.view === view && (view !== 'employee' || currentNav.step === step);
}
// عدّاد الحالات المسجّلة فوق الشاشة الرئيسية (يُستعمل للرجوع للبداية عند تسجيل الخروج)
let navDepth = 0;
// رجوع برمجي (عند إغلاق نافذة بزرّها) لم يصل حدث popstate الخاص به بعد
let owedBacks = 0;
// تسجيلات مؤجَّلة إلى أن ينتهي الرجوع البرمجي — حتى لا يمسح الرجوع حالة سُجّلت للتو
const navQueue = [];
function navPush(state, url){
  const run = () => {
    navDepth++; state.d = navDepth;
    try { url === undefined ? history.pushState(state, '') : history.pushState(state, '', url); } catch(e){}
  };
  syncBackLayers();   // نافذة أُغلقت للتو ولم يُزَل أثرها بعد؟ نزيله أولًا حتى لا يمسح رجوعُها هذه الحالة الجديدة
  if (owedBacks) navQueue.push(run); else run();
  return run;
}
const layerChecks = [];
let syncingLayers = false;
function syncBackLayers(){
  if (syncingLayers) return;
  syncingLayers = true;
  try { layerChecks.forEach(f => f()); } finally { syncingLayers = false; }
}
function navBackSilently(){ owedBacks++; if (owedBacks === 1) history.back(); }

function pushNavState(view, step){
  currentNav = { view, step: view === 'employee' ? step : null };
  if (isRestoringNav) return;
  navPush({ view, step: currentNav.step }, view === 'employee' ? ('#employee-' + step) : ('#' + view));
}

// ---------------------------------------------------------------
// النوافذ المنبثقة (صورة مكبّرة، كاميرا، دخول، تأكيد، نوافذ الحضور…) وزر الرجوع
// ---------------------------------------------------------------
// كل نافذة تُفتح تسجَّل كحالة بتاريخ المتصفح، فزر الرجوع بالهاتف يغلقها هي
// فقط بدل أن يغيّر الشاشة التي خلفها. وإذا أُغلقت بزرّها نزيل حالتها من التاريخ.
const backLayers = [];
function registerBackLayer(el, close, isOpen){
  if (!el) return;
  isOpen = isOpen || (() => el.classList.contains('open'));
  let entry = null;
  const check = () => {
    const open = isOpen();
    if (open && !entry) {
      entry = { close, byBack: false };
      entry.run = navPush({ view: currentNav.view, step: currentNav.step, layer: el.id });
      backLayers.push(entry);
    } else if (!open && entry) {
      const e = entry; entry = null;
      const i = backLayers.indexOf(e); if (i > -1) backLayers.splice(i, 1);
      if (e.byBack) return;                                  // أُغلقت بزر الرجوع: حالتها خرجت من التاريخ فعلًا
      const q = navQueue.indexOf(e.run);
      if (q > -1) { navQueue.splice(q, 1); return; }         // لم تُسجَّل بعد
      navBackSilently();
    }
  };
  layerChecks.push(check);
  new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
}

function applyNavState(state){
  const view = (state && state.view) || 'gate';
  const step = (state && state.step) || 'category';
  currentNav = { view, step: view === 'employee' ? step : null };
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');
  if (view === 'employee') {
    employeeStep = step;
    document.getElementById('employeeCategoryScreen').style.display = step === "category" ? "block" : "none";
    document.getElementById('employeeSearchScreen').style.display = step === "search" ? "block" : "none";
    document.getElementById('employeeDetailScreen').style.display = step === "detail" ? "block" : "none";
    const titles = { category: "اختر التصنيف", search: "بحث الأصناف", detail: "تفاصيل الصنف" };
    document.getElementById('employeeHeaderTitle').textContent = titles[step];
  }
}

function showView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  try { updateBasketBar(); } catch(e){}
  // شاشة الموظف تسجَّل بتاريخ المتصفح عبر goEmployeeStep (لأنها اللي تعرف الخطوة الداخلية الصحيحة)
  if (id === 'employee') return;
  if (!navMatchesCurrent(id, null)) pushNavState(id, null);
}

window.addEventListener('popstate', (e) => {
  navDepth = (e.state && e.state.d) || 0;
  if (owedBacks) {   // رجوع برمجي بعد إغلاق نافذة بزرّها: لا تغيير بالشاشة
    owedBacks--;
    if (owedBacks) { history.back(); return; }
    navQueue.splice(0).forEach(run => run());
    return;
  }
  if (backLayers.length) {   // زر الرجوع ونافذة مفتوحة: نغلق أعلى نافذة فقط
    const top = backLayers[backLayers.length - 1];
    top.byBack = true;
    try { top.close(); } catch(err){}
    return;
  }
  isRestoringNav = true;
  applyNavState(e.state);
  isRestoringNav = false;
});

// نهيئ أول حالة بتاريخ المتصفح (الشاشة الرئيسية) حتى يكون فيها "قاعدة"
// يرجع لها زر الرجوع بدل ما يطلع من الصفحة مباشرة
try { history.replaceState({ view: 'gate' }, '', location.pathname + location.search); } catch(e){}

document.querySelectorAll('[data-back]').forEach(btn=>{
  btn.addEventListener('click', ()=> history.back());
});

// تنقّل واجهة الموظف بين 3 شاشات داخلية: التصنيف -> البحث -> تفاصيل الصنف
let employeeStep = "category";
// من وين دخلنا شاشة الأصناف؟ "gate" لو من الموظف أو الزبون، "admin" لو من الإدارة العامة
let employeeEntryPoint = "gate";
// من يشوف شاشة الأصناف الآن؟ "employee" | "admin" | "customer" — يتحكم بشنو يظهر (الكمية، زر المشاركة، بيانات الشراء)
let currentViewerRole = IS_CUSTOMER_PAGE ? "customer" : "employee";
function goEmployeeStep(step){
  employeeStep = step;
  try { updateStaffRow(); } catch(e){}
  document.getElementById('employeeCategoryScreen').style.display = step === "category" ? "block" : "none";
  document.getElementById('employeeSearchScreen').style.display = step === "search" ? "block" : "none";
  document.getElementById('employeeDetailScreen').style.display = step === "detail" ? "block" : "none";
  const titles = { category: "اختر التصنيف", search: "بحث الأصناف", detail: "تفاصيل الصنف" };
  document.getElementById('employeeHeaderTitle').textContent = titles[step];
  if (!navMatchesCurrent('employee', step)) pushNavState('employee', step);
}
document.getElementById('employeeBackBtn')?.addEventListener('click', ()=>{ history.back(); });
document.querySelectorAll('[data-go]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    showView(btn.dataset.go);
  });
});

// الإدارة العامة -> الأصناف: نفس شاشة بحث الموظف، لكن الرجوع يرجعنا لقائمة الإدارة
document.getElementById('adminItemsBtn')?.addEventListener('click', ()=>{
  currentViewerRole = "admin";
  employeeEntryPoint = "admin";
  activeCategoryValues = null;
  showView("employee");
  loadItems();
  goEmployeeStep("category");
});

// الإدارة العامة -> نظرة عامة
document.getElementById('adminOverviewBtn')?.addEventListener('click', ()=>{
  showView("admin-overview");
  loadItems();
  renderAdminOverview();
});

// الإدارة العامة -> كشف رأس المال
document.getElementById('adminCapitalBtn')?.addEventListener('click', ()=>{
  showView("admin-capital");
  document.getElementById('usdRateInput').value = SETTINGS.usdRate || "";
  document.getElementById('usdRateMsg').textContent = "";
  document.getElementById('usdRateMsg').className = "msg";
  loadItems();
  renderCapitalReport();
});

document.getElementById('saveUsdRateBtn')?.addEventListener('click', async () => {
  const val = parseFloat(document.getElementById('usdRateInput').value.trim());
  const msg = document.getElementById('usdRateMsg');
  if (!val || val <= 0) {
    msg.textContent = "أدخل رقمًا صحيحًا أكبر من صفر";
    msg.className = "msg err";
    return;
  }
  SETTINGS.usdRate = val;
  if (!db) {
    msg.textContent = "تم الحفظ محليًا فقط (لا يوجد اتصال بقاعدة البيانات — لن ينعكس على باقي الأجهزة)";
    msg.className = "msg err";
    renderCapitalReport();
    return;
  }
  try {
    await db.collection("settings").doc("currency").set({ usdRate: val });
    msg.textContent = "تم الحفظ وتمت مزامنته مع كل الأجهزة";
    msg.className = "msg ok";
  } catch(e) {
    msg.textContent = "تعذّر الحفظ في قاعدة البيانات";
    msg.className = "msg err";
  }
  renderCapitalReport();
});

// ---------------------------------------------------------------
// أزرار الواجهة الرئيسية: الموظف بحسابه، والإدارة بالإيميل (لا رمز سري)
// ---------------------------------------------------------------
document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const role = btn.dataset.role;
    const locked = btn.dataset.locked === "true";
    if (!locked) {
      if (role === "customer") {
        currentViewerRole = "customer";
        employeeEntryPoint = "gate";
        activeCategoryValues = null;
        showView("employee");
        loadItems();
        goEmployeeStep("category");
      }
      return;
    }
    if (role === "admin") { openAdminLogin(); return; }
    if (role === "employee" && !openStaffLogin()) {
      showAlert("تعذّر الاتصال بخدمة الدخول — تحقق من الإنترنت وأعد فتح الصفحة", { title: "دخول الموظف" });
    }
  });
});

// ---------------------------------------------------------------
// إظهار / إخفاء كلمة المرور
// ---------------------------------------------------------------
document.querySelectorAll('.eye-btn[data-eye]').forEach(btn=>{
  const hideLabel = btn.getAttribute('aria-label').replace('إظهار', 'إخفاء');
  const showLabel = btn.getAttribute('aria-label');
  btn.addEventListener('click', ()=>{
    const input = document.getElementById(btn.dataset.eye);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.classList.toggle('shown', show);
    btn.setAttribute('aria-label', show ? hideLabel : showLabel);
  });
});

// ---------------------------------------------------------------
// دخول الإدارة العامة بالإيميل وكلمة المرور (Firebase Authentication)
// ---------------------------------------------------------------
const loginOverlay = document.getElementById('loginOverlay');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginMsg = document.getElementById('loginMsg');
const loginSubmit = document.getElementById('loginSubmit');

function setLoginMsg(text, ok){
  loginMsg.textContent = text || "";
  loginMsg.className = "msg" + (text ? (ok ? " ok" : " err") : "");
}
function enterAdmin(){
  loginOverlay.classList.remove('open');
  closeFocusTrap();
  loginPassword.value = "";
  setLoginMsg("");
  showView("admin");
}
function openAdminLogin(){
  if (!auth) { alertNoAuth(); return; }
  const u = auth.currentUser;
  if (u && isAdminEmail(u.email)) { enterAdmin(); return; } // مسجّل دخول من قبل على هذا الجهاز
  setLoginMsg("");
  loginPassword.value = "";
  loginOverlay.classList.add('open');
  openFocusTrap(loginOverlay);
  setTimeout(()=> (loginEmail.value ? loginPassword : loginEmail).focus(), 50);
}
function alertNoAuth(){
  setLoginMsg("تعذّر الاتصال بخدمة الدخول — تحقق من الإنترنت");
  loginOverlay.classList.add('open');
  openFocusTrap(loginOverlay);
}
function authErrorText(e){
  const c = (e && e.code) || "";
  if (c.includes("invalid-email")) return "صيغة الإيميل غير صحيحة";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-login"))
    return "الإيميل أو كلمة المرور غير صحيحة";
  if (c.includes("too-many-requests")) return "محاولات كثيرة — انتظر شوي وحاول مرة ثانية";
  if (c.includes("network")) return "لا يوجد اتصال بالإنترنت";
  if (c.includes("unauthorized-domain")) return "هذا الموقع غير مضاف في Authorized domains";
  if (c.includes("operation-not-allowed")) return "الدخول بالإيميل غير مفعّل في Firebase";
  return "تعذّر الدخول، حاول مرة أخرى";
}

loginSubmit?.addEventListener('click', async ()=>{
  const email = loginEmail.value.trim().toLowerCase();
  const pass = loginPassword.value;
  if (!email || !pass) { setLoginMsg("أدخل الإيميل وكلمة المرور"); return; }
  if (!isAdminEmail(email)) { setLoginMsg("هذا الإيميل غير مسموح له بدخول الإدارة"); return; }
  if (!auth) { alertNoAuth(); return; }
  loginSubmit.disabled = true;
  setLoginMsg("جارِ الدخول…", true);
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    await auth.signInWithEmailAndPassword(email, pass);
    enterAdmin();
  } catch(e) {
    setLoginMsg(authErrorText(e));
  } finally {
    loginSubmit.disabled = false;
  }
});
loginPassword?.addEventListener('keydown', e => { if (e.key === "Enter") loginSubmit.click(); });
loginEmail?.addEventListener('keydown', e => { if (e.key === "Enter") loginPassword.focus(); });

document.getElementById('loginForgot')?.addEventListener('click', async ()=>{
  const email = loginEmail.value.trim().toLowerCase();
  if (!email) { setLoginMsg("اكتب الإيميل أولًا، ثم اضغط نسيت كلمة المرور"); return; }
  if (!isAdminEmail(email)) { setLoginMsg("هذا الإيميل غير مسموح له بدخول الإدارة"); return; }
  if (!auth) { alertNoAuth(); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    setLoginMsg("أرسلنا رابط تغيير كلمة المرور على إيميلك (شيك البريد المزعج Spam كمان)", true);
  } catch(e) {
    setLoginMsg(authErrorText(e));
  }
});
document.getElementById('loginCancel')?.addEventListener('click', ()=>{
  loginOverlay.classList.remove('open');
  closeFocusTrap();
  loginPassword.value = "";
  setLoginMsg("");
});
// ---------------------------------------------------------------
// دخول الموظف (حكيم/أنس) بحساب Firebase — مرة واحدة لكل هاتف (Persistence.LOCAL)
// الطريقة الوحيدة لدخول الموظف (أُلغي الرمز السري القديم).
// ---------------------------------------------------------------
const staffLoginOverlay = document.getElementById('staffLoginOverlay');
const staffUserInput = document.getElementById('staffUser');
const staffPasswordInput = document.getElementById('staffPassword');
const staffLoginMsg = document.getElementById('staffLoginMsg');
const staffLoginSubmit = document.getElementById('staffLoginSubmit');

function setStaffLoginMsg(text, ok){
  if (!staffLoginMsg) return;
  staffLoginMsg.textContent = text || "";
  staffLoginMsg.className = "msg" + (text ? (ok ? " ok" : " err") : "");
}
// اسم المستخدم كما كُتب -> الإيميل الكامل. لوحات الجوال تكبّر أول حرف، فنصغّر ونقصّ المسافات.
function staffEmailFromInput(raw){
  let name = String(raw || '').trim().toLowerCase();
  if (name.endsWith(STAFF_EMAIL_DOMAIN)) name = name.slice(0, -STAFF_EMAIL_DOMAIN.length);
  return /^[a-z0-9._-]{2,40}$/.test(name) ? name + STAFF_EMAIL_DOMAIN : '';
}
// رسائل لا تكشف سبب الفشل: «غير موجود» و«كلمة سر خاطئة» نفس الرسالة
function staffAuthErrorText(e){
  const c = (e && e.code) || "";
  if (c.includes("network")) return "لا يوجد اتصال بالإنترنت";
  if (c.includes("too-many-requests")) return "محاولات كثيرة — انتظر قليلًا وحاول مرة أخرى";
  return "اسم المستخدم أو كلمة المرور غير صحيحة";
}
// ما يُنفَّذ بعد نجاح دخول الموظف بدل فتح شاشة التصنيفات (يضبطه الرابط المباشر ?item= لهاتف معتمد)
let staffLoginThen = null;
function closeStaffLogin(){
  staffLoginThen = null;
  if (!staffLoginOverlay) return;
  staffLoginOverlay.classList.remove('open');
  closeFocusTrap();
  if (staffPasswordInput) staffPasswordInput.value = "";
  setStaffLoginMsg("");
}
function enterStaffAccount(){
  setEmpVia('account');
  try { sessionStorage.setItem('jadu_emp_ok', '1'); } catch(e){}
  showView("employee");
  currentViewerRole = "employee";
  employeeEntryPoint = "gate";
  activeCategoryValues = null;
  loadItems();
  goEmployeeStep("category");
}
// يرجع true إذا تولّى الدخول بالحساب، و false إذا تعذّر (صفحة بلا نافذة الحساب أو Firebase غير متاح)
function openStaffLogin(){
  if (!staffLoginOverlay || !auth) return false;
  if (staffSignedIn()) { enterStaffAccount(); return true; } // الهاتف مسجّل دخول من قبل
  // المدير موظف أيضًا في الحضور (إسلام): يدخل شاشة الموظف بحسابه الإداري.
  // بلا setEmpVia('account') حتى لا يُخرجه onAuthStateChanged (ذلك الشرط خاص بحسابات الموظفين).
  if (isAdminAccount_()) {
    try { sessionStorage.setItem('jadu_emp_ok', '1'); } catch(e){}
    showView("employee");
    currentViewerRole = "employee"; employeeEntryPoint = "gate"; activeCategoryValues = null;
    loadItems(); goEmployeeStep("category");
    return true;
  }
  setStaffLoginMsg("");
  if (staffPasswordInput) staffPasswordInput.value = "";
  staffLoginOverlay.classList.add('open');
  openFocusTrap(staffLoginOverlay);
  setTimeout(()=> (staffUserInput && staffUserInput.value ? staffPasswordInput : staffUserInput)?.focus(), 50);
  return true;
}

staffUserInput?.addEventListener('input', ()=>{
  const hint = document.getElementById('staffUserHint');
  if (!hint) return;
  const v = staffUserInput.value.trim().toLowerCase();
  hint.textContent = (v && !v.includes('@') ? v : '') + STAFF_EMAIL_DOMAIN;
});
staffLoginSubmit?.addEventListener('click', async ()=>{
  const pass = staffPasswordInput.value;
  if (!staffUserInput.value.trim() || !pass) { setStaffLoginMsg("أدخل اسم المستخدم وكلمة المرور"); return; }
  const email = staffEmailFromInput(staffUserInput.value);
  if (!email) { setStaffLoginMsg(staffAuthErrorText(null)); return; }
  if (!auth) { setStaffLoginMsg("تعذّر الاتصال بخدمة الدخول — تحقق من الإنترنت"); return; }
  staffLoginSubmit.disabled = true;
  setStaffLoginMsg("جارِ الدخول…", true);
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const cred = await auth.signInWithEmailAndPassword(email, pass);
    // حساب صحيح لكنه ليس حكيم/أنس (مثل sync-bot): نخرجه وبنفس الرسالة العامة
    if (!isStaffUser(cred && cred.user)) { try { await auth.signOut(); } catch(e){} throw { code: 'auth/invalid-credential' }; }
    const then = staffLoginThen;
    closeStaffLogin();
    if (then) then(); else enterStaffAccount();
  } catch(e) {
    setStaffLoginMsg(staffAuthErrorText(e));
  } finally {
    staffLoginSubmit.disabled = false;
  }
});
staffPasswordInput?.addEventListener('keydown', e => { if (e.key === "Enter") staffLoginSubmit.click(); });
staffUserInput?.addEventListener('keydown', e => { if (e.key === "Enter") staffPasswordInput.focus(); });
document.getElementById('staffLoginCancel')?.addEventListener('click', closeStaffLogin);
document.getElementById('staffLogoutBtn')?.addEventListener('click', async ()=>{
  setEmpVia('');
  try { sessionStorage.removeItem('jadu_emp_ok'); } catch(e){}
  if (auth) await auth.signOut();
  if (navDepth > 0) {
    history.go(-navDepth);
    // لو كانت نافذة مفتوحة (مثل «من أنت؟» للحضور) يلتقط الرجوعُ إغلاقها فقط؛ نضمن الوصول للرئيسية
    setTimeout(() => { if (!document.getElementById('view-gate')?.classList.contains('active')) showView('gate'); }, 500);
  } else showView('gate');
});

document.getElementById('adminLogoutBtn')?.addEventListener('click', async ()=>{
  if (auth) await auth.signOut();
  // نرجع للشاشة الرئيسية بمسح كل ما فوقها من التاريخ، حتى لا يعيد زر الرجوع شاشات الإدارة بعد الخروج
  if (navDepth > 0) history.go(-navDepth); else showView('gate');
});

// =====================================================================
// بحث الأصناف — قراءة بيانات الشيت
// =====================================================================
// رابط الشيت المنشور بصيغة CSV (File > Share > Publish to web > CSV بجوجل شيت)
// ملاحظة أمان: هذا رابط تبويب "عام" المنشور فقط — لا يحتوي على بيانات الشراء/سعر الجملة
// (تلك البيانات انتقلت إلى Firestore المحمي بدخول الإدارة فقط).
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYJP_O-jmrABM6jSTcEGTq5WZAE1J5k-wO-deCQvnpM_5gHbZmuYR2PVR7cPSZoAQHXtk68dOzH65K/pub?gid=385150651&single=true&output=csv";

const CURRENCY = "د.ل";

// كل عمود بالشيت يبدأ بـ "كمية " يُعتبر مخزن/فرع تلقائيًا — واسم الفرع
// يُؤخذ مباشرة من اسم العمود بالعربي، فإضافة مخزن جديد لاحقًا (عمود "كمية <اسم>")
// ما يحتاج أي تعديل بالكود إطلاقًا.
const QTY_PREFIX = "كمية ";

let ITEMS = [];

// تجميع تصنيفات الشيت الفعلية بأزرار مختصرة بشاشة اختيار التصنيف.
// "values: null" = زر "الكل" (يشمل كل شي، بما فيه أي تصنيف جديد أو غير مدرج هنا مثل "عام").
const CAT_ICONS = {
  all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  equip: '<svg viewBox="0 0 24 24" fill="#FF6B5E"><path d="M7 2c.3 1.6-1.2 2-1.2 3.6C5.8 6.8 6.8 7.5 8 7.5s2.2-.7 2.2-1.9C10.2 4 8.7 3.6 9 2c-.9.3-1.4 1-1.4 1.8C7.6 3 7.1 2.3 7 2Z"/><path d="M13.5 2.2c.3 1.4-1.1 1.8-1.1 3.2 0 1.1.9 1.7 2 1.7s2-.6 2-1.7c0-1.4-1.4-1.8-1.1-3.2-.8.3-1.3 1-1.3 1.7-.1-.7-.5-1.4-.5-1.7Z"/><path d="M3 10a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z"/><circle cx="8" cy="14.5" r="1.5" fill="#1B1917"/><circle cx="12" cy="14.5" r="1.5" fill="#1B1917"/><circle cx="16" cy="14.5" r="1.5" fill="#1B1917"/></svg>',
  accessories: '<svg viewBox="0 0 24 24" fill="#FFC15E"><path d="M8.5 2a1 1 0 0 1 1 1v5.6a3.2 3.2 0 0 1-1.8 2.9l-.2.1V21a1 1 0 1 1-2 0v-9.4l-.2-.1A3.2 3.2 0 0 1 3.5 8.6V3a1 1 0 1 1 2 0v5.2h.5V3a1 1 0 1 1 2 0v5.2h.5V3a1 1 0 0 1 1-1Z"/><path d="M17 2c-2.2 0-4 2-4 5.4 0 2.4 1.2 4.1 3 4.7V21a1 1 0 1 0 2 0V12.1c1.8-.6 3-2.3 3-4.7C21 4 19.2 2 17 2Z"/></svg>',
  spareparts: '<svg viewBox="0 0 24 24" fill="#9AA7B5"><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  cleaning: '<svg viewBox="0 0 24 24" fill="#6FCF8E"><path d="M11 2a1 1 0 0 1 1 1v3.2l3.6-1.6a1 1 0 1 1 .8 1.8l-4 1.8a1 1 0 0 1-.4.1v.7l4.8 2.8a1 1 0 1 1-1 1.7L12 11l-3.8 2.5a1 1 0 1 1-1-1.7L12 9v-.8L6.2 5.5a1 1 0 1 1 .8-1.8L11 5.2V3a1 1 0 0 1 1-1Z" fill-opacity=".55"/><path d="M9.5 15h5l1.8 6.3a1 1 0 0 1-1 1.7H8.7a1 1 0 0 1-1-1.7L9.5 15Z"/></svg>'
};
const CATEGORY_GROUPS = [
  { label: "الكل", values: null, icon: CAT_ICONS.all },
  { label: "المعدات", values: ["معدات", "تبريد"], icon: CAT_ICONS.equip },
  { label: "الإكسسوارات", values: ["اكسسوارات", "احواض وحافظات"], icon: CAT_ICONS.accessories },
  { label: "قطع غيار", values: ["قطع غيار", "قطع غيار مكينة قهوة"], icon: CAT_ICONS.spareparts },
  { label: "معدات نظافة", values: ["معدات نظافة"], icon: CAT_ICONS.cleaning }
];
let activeCategoryValues = null; // null = بدون فلترة (الكل)

function mapRow(r){
  const number = (r['رقم الصنف'] || '').toString().trim();
  const name = (r['اسم الصنف'] || '').toString().trim();
  const priceRetail = parseFloat(r['سعر القطاعي']) || 0;
  const priceWholesale = parseFloat(r['سعر الجملة']) || 0;
  const company = (r['الشركة المصنعة'] || '').toString().trim();
  const country = (r['بلد الصنع'] || '').toString().trim();
  const color = (r['اللون'] || '').toString().trim();
  const typeCode = (r['شفرة النوع'] || '').toString().trim();
  const category = (r['التصنيف الرئيسي'] || '').toString().trim();
  // بيانات الشراء — إدارية/حساسة، ما تظهر للموظف
  const lastPurchasePrice = parseFloat(r['آخر سعر شراء']) || 0;
  const purchaseCurrency = (r['العملة'] || '').toString().trim();
  const exchangeRate = parseFloat(r['سعر الصرف']) || 0;
  const lastPurchaseDate = (r['تاريخ آخر شراء'] || '').toString().trim();

  const branches = {};
  Object.keys(r).forEach(k=>{
    if(k.indexOf(QTY_PREFIX) === 0){
      branches[k.slice(QTY_PREFIX.length).trim()] = parseFloat(r[k]) || 0;
    }
  });
  const totalQty = Object.values(branches).reduce((a,b)=>a+b, 0);

  return {
    number, name, priceRetail, priceWholesale, company, country, color, typeCode, category,
    lastPurchasePrice, purchaseCurrency, exchangeRate, lastPurchaseDate,
    branches, totalQty
  };
}

function formatNum(n){
  const rounded = Math.round((n || 0) * 1000) / 1000;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

// لعرض الأسعار تحديدًا: سعر صفر يعني "غير مسجّل بالشيت" وليس سعرًا فعليًا بصفر،
// فنعرضه كشرطة "—" بدل "0 د.ل" حتى لا يُفهم خطأً إنه مجاني أو مقصود
function formatPrice(n){
  return (n && n > 0) ? `${formatNum(n)} ${CURRENCY}` : '—';
}

// تعقيم أمني: يحوّل أي رمز HTML خطير بنص قادم من الشيت أو من المستخدم (اسم صنف، شركة، بحث...)
// إلى نص عادي غير قابل للتنفيذ، قبل إدراجه بالصفحة عبر innerHTML
function escapeHtml(str){
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let itemsLoaded = false;
let itemsFetching = false;
let itemsLastLoadedAt = null; // وقت آخر تحميل ناجح من الشيت (مو من التخزين المحلي)
const ITEMS_CACHE_KEY = 'jadu_items_cache_v1';

// يحمّل آخر نسخة محفوظة بالجهاز (تشتغل حتى بدون إنترنت) — يرجع true لو لقى بيانات صالحة
function loadItemsFromCache_(){
  try {
    const raw = localStorage.getItem(ITEMS_CACHE_KEY);
    if(!raw) return false;
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return false;
    ITEMS = parsed.items;
    itemsLastLoadedAt = parsed.savedAt ? new Date(parsed.savedAt) : null;
    itemsLoaded = true;
    return true;
  } catch(e){ return false; }
}

function saveItemsToCache_(){
  try {
    localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify({ items: ITEMS, savedAt: itemsLastLoadedAt ? itemsLastLoadedAt.toISOString() : null }));
  } catch(e){ /* التخزين ممتلئ أو غير متاح — نتجاهل، ما يوقف التطبيق */ }
}

// force=true يفرض إعادة التحميل من الشبكة حتى لو عندنا بيانات أصلًا (زر "مزامنة الآن" والتحديث الدوري)
function loadItems(force){
  if(itemsFetching) return;

  // أول ظهور للتطبيق: نعرض آخر نسخة محفوظة محليًا فورًا (يشتغل حتى بدون إنترنت)
  // ثم نكمل ونجلب نسخة جديدة من الشيت بالخلفية مباشرة (بدل انتظار التحديث الدوري بعد 5 دقائق)
  let fromCache = false;
  if(!itemsLoaded && loadItemsFromCache_()){
    fromCache = true;
    renderResults();
    renderAdminOverview();
    renderCapitalReport();
    loadSecureItems(); // الإدارة داخلة أصلًا؟ ندمج بيانات الشراء مع النسخة المحلية فورًا
  }

  if(itemsLoaded && !force && !fromCache) return;
  if(!SHEET_CSV_URL) return;

  itemsFetching = true;
  Papa.parse(SHEET_CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(res){
      itemsFetching = false;
      const freshItems = res.data.map(mapRow).filter(it => it.number);
      if(!freshItems.length) return; // تجاهل نتيجة فاضية (خطأ مؤقت بالشيت) ونبقي النسخة القديمة
      ITEMS = freshItems;
      itemsLoaded = true;
      itemsLastLoadedAt = new Date();
      saveItemsToCache_();
      secureLoaded = false; // الأصناف اتجدّدت، لازم ندمج بيانات الشراء المحمية فيها من جديد
      renderResults();
      renderAdminOverview();
      renderCapitalReport();
      loadSecureItems(); // لو الإدارة داخلة أصلًا، نجيب بيانات الشراء المحمية الآن
    },
    error: function(err){
      itemsFetching = false;
      if(!itemsLoaded){
        document.getElementById('employeeItemCount').textContent = "تعذّر تحميل بيانات الأصناف — تحقق من الاتصال بالإنترنت";
      }
      console.warn("Sheet load error", err);
    }
  });
}

// بيانات الشراء الحساسة (سعر الجملة، آخر سعر شراء، العملة، سعر الصرف، تاريخ آخر شراء)
// محمية بـ Firestore ولا تُجلب إلا لحساب إداري معتمد وبعد تسجيل الدخول فعليًا
// مهم: تُجلب من Firestore مرة واحدة كل ساعة فقط وتُحفظ بالذاكرة (SECURE_MAP)،
// وتُدمج من الذاكرة مع كل تحديث للشيت (كل 5 دقائق) بدون قراءة Firestore من جديد.
// السبب: إعادة قراءة ~3000 مستند كل 5 دقائق كانت تستهلك حصة القراءة المجانية اليومية (50,000)
// فتتوقف القراءة وتظهر بيانات الشراء "—".
let secureLoaded = false;
let secureError = false;
let secureFetching = false;
let SECURE_MAP = null;      // Map: رقم الصنف -> بيانات الشراء
let secureFetchedAt = 0;
const SECURE_TTL_MS = 60 * 60 * 1000;

function applySecureToItems_(){
  if(!SECURE_MAP) return;
  ITEMS.forEach(item => {
    const d = SECURE_MAP.get(item.number);
    if(d){
      item.priceWholesale    = Number(d.priceWholesale) || 0;
      item.lastPurchasePrice = Number(d.lastPurchasePrice) || 0;
      item.purchaseCurrency  = d.purchaseCurrency || '';
      item.exchangeRate      = Number(d.exchangeRate) || 0;
      item.lastPurchaseDate  = d.lastPurchaseDate || '';
    }
  });
  secureLoaded = true;
  renderCapitalReport();
  if(currentItem && employeeEntryPoint === "admin"){
    openItemDetail(currentItem.number); // لتحديث قسم بيانات الشراء المعروض حاليًا لو مفتوح
  }
}

function loadSecureItems(forceFetch){
  if(!firebaseReady || !db) return;
  const user = auth && auth.currentUser;
  if(!user || !isAdminEmail(user.email)) return; // مو إدارة معتمدة — ما نحاول نقرأ أصلًا
  if(!itemsLoaded || !ITEMS.length) return; // لسا الأصناف ما تحملت، هتُستدعى تاني من loadItems()

  const fresh = SECURE_MAP && (Date.now() - secureFetchedAt) < SECURE_TTL_MS;
  if(fresh && !forceFetch){ applySecureToItems_(); return; } // من الذاكرة — بدون أي قراءة من Firestore
  if(secureFetching) return;

  secureFetching = true;
  db.collection('secure_items').get().then(snap => {
    const map = new Map();
    snap.forEach(doc => map.set(String(doc.id).trim(), doc.data()));
    SECURE_MAP = map;
    secureFetchedAt = Date.now();
    secureError = false;
    applySecureToItems_();
  }).catch(err => {
    console.warn("تعذّر تحميل بيانات الشراء المحمية من Firestore", err);
    secureError = true;
    if(SECURE_MAP){ applySecureToItems_(); } // نستخدم آخر نسخة ناجحة بدل ما تختفي البيانات
    else if(currentItem && employeeEntryPoint === "admin"){ openItemDetail(currentItem.number); }
  }).finally(() => { secureFetching = false; });
}

// containerId: أي عنصر cat-grid نبنيه فيه — onSelect: شنو يصير لما يضغط تصنيف
// (بالموظف/الإدارة يروح لشاشة البحث بواجهة الموظف، وبالشاشة الرئيسية يدخل مباشرة كزبون)
function renderCategoryGrid(containerId, onSelect){
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  wrap.innerHTML = CATEGORY_GROUPS.map((g, i) =>
    `<button class="cat-box ${g.values === null ? 'all' : ''}" data-idx="${i}" aria-label="تصفية حسب: ${escapeHtml(g.label)}">
      <span class="cat-icon">${g.icon}</span>
      <span>${g.label}</span>
    </button>`
  ).join('');
  wrap.querySelectorAll('.cat-box').forEach(box=>{
    box.addEventListener('click', ()=>{
      const group = CATEGORY_GROUPS[Number(box.dataset.idx)];
      onSelect(group);
    });
  });
}
function selectEmployeeCategory_(group){
  activeCategoryValues = group.values;
  document.getElementById('employeeSearchInput').value = "";
  goEmployeeStep("search");
  renderResults();
}
// الشاشة الرئيسية: اختيار تصنيف يدخل الزائر مباشرة كزبون لشاشة البحث بنفس التصنيف،
// بدون أي حاجة لاختيار "موظف/زبون/إدارة" أولًا
function selectGateCategory_(group){
  currentViewerRole = "customer";
  employeeEntryPoint = "gate";
  showView("employee");
  loadItems();
  selectEmployeeCategory_(group);
}
renderCategoryGrid('employeeCategoryGrid', selectEmployeeCategory_); // ثابتة، ما تعتمد على تحميل بيانات الشيت
renderCategoryGrid('gateCategoryGrid', selectGateCategory_);

// يقسّم نص البحث إلى قطع بحسب الفراغات (بحث بالأجزاء: "كرب فر كهرب" -> ["كرب","فر","كهرب"])
function tokenizeQuery(q){
  return q.split(/\s+/).map(t => t.trim()).filter(Boolean);
}

// كل ما كان الرقم أصغر كان الصنف أقرب لما تبحث عنه (0 = تطابق تام، -1 = لا يوجد تطابق)
function matchRank(it, tokens){
  const num = it.number.toLowerCase();
  const name = it.name.toLowerCase();
  const type = (it.typeCode || '').toLowerCase();
  const combined = `${num} ${name} ${type}`;

  // شرط أساسي: كل قطعة من قطع البحث لازم تكون موجودة بمكان ما (بالاسم أو الرقم أو شفرة النوع)
  const allTokensFound = tokens.every(t => combined.includes(t));
  if(!allTokensFound) return -1;

  const q = tokens.join(' ');
  if(num === q || type === q) return 0;
  if(num.startsWith(q) || type.startsWith(q)) return 1;
  if(name.startsWith(q)) return 2;
  if(num.includes(q) || type.includes(q)) return 3;
  if(name.includes(q)) return 4;
  return 5; // تطابق جزئي بكل القطع لكن مو متسلسلة بنفس الترتيب
}

function searchItems(){
  const raw = document.getElementById('employeeSearchInput').value.trim().toLowerCase();
  let list = ITEMS;
  if(activeCategoryValues !== null){
    list = list.filter(it => activeCategoryValues.includes(it.category));
  }
  if(raw){
    const tokens = tokenizeQuery(raw);
    list = list
      .map(it => ({ it, rank: matchRank(it, tokens) }))
      .filter(x => x.rank !== -1)
      .sort((a, b) => a.rank - b.rank)
      .map(x => x.it);
  }
  return list;
}

function renderResults(){
  const wrap = document.getElementById('employeeResults');
  const countEl = document.getElementById('employeeItemCount');
  const list = searchItems();
  countEl.innerHTML = ITEMS.length ? `${list.length} من ${ITEMS.length} صنف` : `<span class="spinner"></span> جارِ تحميل بيانات الأصناف…`;

  if(!ITEMS.length){ wrap.innerHTML = ""; return; }
  if(!list.length){
    wrap.innerHTML = `<div class="empty-note">ما فيه نتائج مطابقة</div>`;
    return;
  }
  const showQty = currentViewerRole !== "customer";
  wrap.innerHTML = list.slice(0, 60).map(it => {
    const subParts = [it.company, it.country, it.color].filter(Boolean).map(escapeHtml);
    const inStock = it.totalQty > 0;
    return `
    <button class="item-row with-thumb" data-num="${escapeHtml(it.number)}">
      <span class="ir-thumb" aria-hidden="true">
        <span class="ir-ph">${categoryIcon(it.category)}</span>
        ${itemImage(it.number) ? `<img src="${escapeHtml(itemImage(it.number))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      </span>
      <div class="ir-body">
      <div class="ir-top">
        <span class="num-badge">${escapeHtml(it.number)}</span>
        <span class="item-name">${escapeHtml(it.name) || '—'}</span>
        <span class="item-price">${formatPrice(it.priceRetail)}</span>
      </div>
      <div class="ir-bottom">
        <span class="ir-sub">${subParts.length ? subParts.join(' · ') : ''}</span>
        ${showQty
          ? `<span class="qty-pill ${inStock ? 'in' : 'out'}">${inStock ? '✓' : '✕'} الكمية: ${formatNum(it.totalQty)}</span>`
          : `<span class="qty-pill ${inStock ? 'in' : 'out'}">${inStock ? '✓ متوفر' : '✕ غير متوفر'}</span>`}
      </div>
      </div>
    </button>
  `;
  }).join('');
  wrap.querySelectorAll('.item-row').forEach(row=>{
    row.addEventListener('click', ()=> openItemDetail(row.dataset.num));
  });
}

// تأخير بسيط (debounce) قبل تشغيل البحث، لتخفيف الحمل أثناء الكتابة السريعة
let searchDebounceTimer = null;
document.getElementById('employeeSearchClear')?.addEventListener('click', () => {
  const inp = document.getElementById('employeeSearchInput');
  inp.value = ''; clearTimeout(searchDebounceTimer); renderResults(); inp.focus();
});
document.getElementById('employeeSearchInput')?.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(renderResults, 150);
});

// أيقونة التصنيف كبديل عن الصورة في مربع الصورة الصغير
function categoryIcon(category){
  const c = String(category || '').trim();
  const g = CATEGORY_GROUPS.find(g => g.values && g.values.includes(c));
  return g ? g.icon : CAT_ICONS.all;
}

// صورة الصنف من item-images.js (الصور المعتمدة فقط) — ترجع "" لو ما فيه صورة
function itemImage(number){
  const n = String(number).trim();
  if(UPLOADED_PHOTOS[n] && UPLOADED_PHOTOS[n].t) return UPLOADED_PHOTOS[n].t; // صورة أضافها موظف/إدارة (مصغّرة)
  return (typeof ITEM_IMAGES !== 'undefined' && ITEM_IMAGES[n]) || modelImage(n);
}

// صورة حسب رقم الموديل المكتوب في اسم الصنف (MODEL_IMAGES في item-images.js)
let modelImageCache = null, modelImageCacheFor = null;
// توحيد شفرة النوع للمقارنة: حروف كبيرة، * و × تصبح X، وحذف الشرطات والمسافات
function normCode(c){ return String(c || '').toUpperCase().replace(/[*×]/g, 'X').replace(/[^A-Z0-9]/g, ''); }
let typeCodeMap = null;
if(typeof TYPE_CODE_IMAGES !== 'undefined'){
  typeCodeMap = {};
  for(const k in TYPE_CODE_IMAGES) typeCodeMap[normCode(k)] = TYPE_CODE_IMAGES[k];
}
function modelImage(n){
  if(typeof MODEL_IMAGES === 'undefined' || !ITEMS.length) return '';
  if(modelImageCacheFor !== ITEMS){
    modelImageCache = {};
    for(const it of ITEMS){
      const name = String(it.name || '');
      for(const g of MODEL_IMAGES){
        if(!g.word.test(name)) continue;
        const nums = name.match(/\d+/g) || [];
        const hit = nums.find(x => g.images[x]);
        if(hit){ modelImageCache[String(it.number).trim()] = g.images[hit]; break; }
      }
      const key = String(it.number).trim();
      if(!modelImageCache[key] && typeCodeMap){
        const byCode = typeCodeMap[normCode(it.typeCode)];
        const byName = byCode || (name.toUpperCase().match(/[A-Z]{1,3}[\s-]*\d[A-Z0-9*×\s-]*/g) || [])
          .map(normCode).map(c => typeCodeMap[c]).find(Boolean);
        if(byCode || byName) modelImageCache[key] = byCode || byName;
      }
    }
    modelImageCacheFor = ITEMS;
  }
  return modelImageCache[n] || '';
}

// ===== صور الأصناف من الهاتف (Firestore) =====
// الإدارة: الصورة تُنشر فورًا.
// الموظف: الصور تُضاف إلى "سلة الصور" (photo_pending)، وبعد ما يكمّل يضغط "إرسال للإدارة"
//          فتصل الدفعة كاملة كإشعار واحد (photo_batches)، والإدارة تعتمدها أو ترفضها، وبعدها فقط تظهر للجميع.
// item_photos/{رقم}: الصورة الكاملة المعتمدة — تُقرأ فقط عند فتح الصنف
// photo_index/s0..s19: فهرس المصغّرات المعتمدة لكل الأصناف — يُقرأ مرة كل ساعة (20 قراءة فقط)
// مفتاح إخفاء نظام الصور القديم (Firebase: سلة الصور + دفعات الموافقة).
// اتركه true حتى تنجح التجربة الحقيقية لنظام «إضافة صور» الجديد، ثم غيّره إلى false.
// الصور القديمة المنشورة تبقى ظاهرة للجميع في الحالتين — الإخفاء يشمل أزرار الإضافة والموافقة فقط.
const LEGACY_PHOTOS_ENABLED = true;

let UPLOADED_PHOTOS = {};
const PHOTO_SHARDS = 20, PHOTO_INDEX_KEY = 'jadu_photo_index_v1', PHOTO_INDEX_TTL = 60 * 60 * 1000;
const PHOTO_BASKET_KEY = 'jadu_photo_basket_v1';
let photoIndexLoadedAt = 0;
let photoBasket = [];
try {
  const c = JSON.parse(localStorage.getItem(PHOTO_INDEX_KEY) || 'null');
  if(c && c.map){ UPLOADED_PHOTOS = c.map; photoIndexLoadedAt = c.at || 0; }
  photoBasket = JSON.parse(localStorage.getItem(PHOTO_BASKET_KEY) || '[]') || [];
} catch(e){}

function photoShard(n){ let s = 0; for(const ch of String(n)) s = (s * 31 + ch.charCodeAt(0)) % 9973; return 's' + (s % PHOTO_SHARDS); }
function savePhotoIndex_(){ try { localStorage.setItem(PHOTO_INDEX_KEY, JSON.stringify({ map: UPLOADED_PHOTOS, at: photoIndexLoadedAt })); } catch(e){} }
function saveBasket_(){ try { localStorage.setItem(PHOTO_BASKET_KEY, JSON.stringify(photoBasket)); } catch(e){} updateBasketBar(); }

function loadPhotoIndex(force){
  if(!firebaseReady || !db) return;
  if(!force && Date.now() - photoIndexLoadedAt < PHOTO_INDEX_TTL) return;
  db.collection('photo_index').get().then(snap => {
    const map = {};
    snap.forEach(doc => { const p = (doc.data() || {}).p || {}; Object.keys(p).forEach(k => { if(p[k] && p[k].t) map[k] = p[k]; }); });
    UPLOADED_PHOTOS = map; photoIndexLoadedAt = Date.now(); savePhotoIndex_();
    renderResults();
  }).catch(err => console.warn('تعذّر تحميل فهرس الصور', err));
}

// تصغير الصورة على الهاتف قبل الرفع (حجم صغير = رفع سريع وتوفير مساحة)
function resizeImage_(src, maxSide, quality){
  return new Promise((resolve, reject) => {
    const img = new Image(); const isFile = src instanceof Blob; const url = isFile ? URL.createObjectURL(src) : src;
    img.onload = () => {
      const r = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      if(isFile) URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { if(isFile) URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
async function preparePhoto_(file){
  let full = await resizeImage_(file, 1100, 0.78);
  if(full.length > 650000) full = await resizeImage_(file, 900, 0.65);
  const thumb = await resizeImage_(file, 160, 0.7);
  return { full, thumb };
}

// نشر صورة معتمدة (للإدارة فقط حسب قواعد الأمان)
async function publishPhoto_(n, name, full, thumb, by){
  n = String(n).trim();
  const ts = firebase.firestore.FieldValue.serverTimestamp();
  await db.collection('item_photos').doc(n).set({ full, by, at: ts, name: String(name || '') });
  await db.collection('photo_index').doc(photoShard(n)).set({ p: { [n]: { t: thumb, by, at: Date.now() } } }, { merge: true });
  UPLOADED_PHOTOS[n] = { t: thumb, by, at: Date.now() }; savePhotoIndex_();
  fullPhotoCache[n] = full;
}

function permMsg_(err, fallback){
  return err && err.code === 'permission-denied' ? 'العملية مرفوضة — قاعدة الأمان للصور لم تُضف بعد في Firebase' : fallback;
}

// حساب المدير المسجّل الآن (Firebase Auth) — مستقل عن الشاشة المفتوحة
function isAdminAccount_(){ const u = auth && auth.currentUser; return !!(u && isAdminEmail(u.email)); }

async function handlePhotoFile(item, file){
  const msg = document.getElementById('photoUploadMsg');
  if(!firebaseReady || !db){ msg.textContent = 'لا يوجد اتصال بقاعدة البيانات — حاول لاحقًا'; msg.className = 'msg err'; return; }
  msg.innerHTML = '<span class="spinner"></span> جارِ تجهيز الصورة ورفعها…'; msg.className = 'msg';
  const n = String(item.number).trim();
  try {
    const { full, thumb } = await preparePhoto_(file);
    // القرار بالحساب لا بدور الشاشة: المدير ينشر مباشرة حتى لو فتح الصنف بعرض الموظف
    // (الرابط المباشر ?item= أو استرجاع الشاشة بعد التحديث)، ولا تدخل صورته سلة الموظفين أبدًا
    if(isAdminAccount_()){
      const u = auth.currentUser;
      await publishPhoto_(n, item.name, full, thumb, u.email || 'الإدارة');
      renderResults(); openItemDetail(n);
      setPhotoMsg_('✓ تم نشر الصورة', 'ok');
    } else {
      // موظف: إلى السلة (لو الصنف موجود بالسلة نستبدل صورته)
      const old = photoBasket.find(b => b.num === n);
      const pending = { num: n, name: String(item.name || ''), full, thumb, status: 'draft', at: firebase.firestore.FieldValue.serverTimestamp() };
      // owner = uid الموظف (مطلوب في القواعد)
      const su = auth && auth.currentUser;
      if (isStaffUser(su)) pending.owner = su.uid;
      const ref = await db.collection('photo_pending').add(pending);
      if(old){ db.collection('photo_pending').doc(old.id).delete().catch(() => {}); photoBasket = photoBasket.filter(b => b.num !== n); }
      photoBasket.push({ id: ref.id, num: n, name: String(item.name || ''), thumb });
      saveBasket_();
      openItemDetail(n);
      setPhotoMsg_(`✓ أُضيفت لسلة الصور (${photoBasket.length}) — أرسل السلة للإدارة عند الانتهاء`, 'ok');
    }
  } catch(err){
    console.warn('تعذّر رفع الصورة', err);
    setPhotoMsg_(permMsg_(err, 'تعذّر رفع الصورة — تحقق من الإنترنت وحاول مرة أخرى'), 'err');
  }
}
function setPhotoMsg_(t, cls){ const m = document.getElementById('photoUploadMsg'); if(m){ m.textContent = t; m.className = 'msg ' + cls; } }

async function deleteItemPhoto(n){
  n = String(n).trim();
  const ok = await showConfirm('حذف الصورة المنشورة لهذا الصنف؟', { title:'حذف الصورة', okText:'حذف' });
  if(!ok) return false;
  try {
    await db.collection('item_photos').doc(n).delete();
    await db.collection('photo_index').doc(photoShard(n)).update(new firebase.firestore.FieldPath('p', n), firebase.firestore.FieldValue.delete());
    delete UPLOADED_PHOTOS[n]; delete fullPhotoCache[n]; savePhotoIndex_();
    renderResults();
    return true;
  } catch(err){ console.warn(err); await showAlert(permMsg_(err, 'تعذّر حذف الصورة — حاول مرة أخرى')); return false; }
}

// الصورة الكاملة لصورة منشورة: تُجلب عند فتح الصنف فقط
const fullPhotoCache = {};
function loadFullPhoto_(n){
  if(fullPhotoCache[n]) return Promise.resolve(fullPhotoCache[n]);
  if(!firebaseReady || !db) return Promise.resolve('');
  return db.collection('item_photos').doc(n).get().then(d => { const f = d.exists ? (d.data().full || '') : ''; if(f) fullPhotoCache[n] = f; return f; }).catch(() => '');
}

function afterItemDetailRender_(item){
  const n = String(item.number).trim();
  const canUpload = LEGACY_PHOTOS_ENABLED && currentViewerRole !== 'customer';
  const row = document.getElementById('photoUploadRow');
  row.hidden = !canUpload;
  if(canUpload){
    const inBasket = photoBasket.find(b => b.num === n);
    const admin = isAdminAccount_();   // نفس قرار handlePhotoFile: بالحساب لا بدور الشاشة
    document.getElementById('photoUploadLabel').textContent =
      admin ? (itemImage(n) ? 'تغيير صورة الصنف' : 'إضافة صورة للصنف')
      : (inBasket ? 'تغيير الصورة في السلة' : 'إضافة صورة للسلة');
    document.getElementById('photoDeleteBtn').hidden = !(admin && UPLOADED_PHOTOS[n]);
    const m = document.getElementById('photoUploadMsg');
    m.textContent = (!admin && inBasket) ? 'صورة هذا الصنف موجودة في سلتك بانتظار الإرسال للإدارة' : '';
    m.className = 'msg';
  }
  if(UPLOADED_PHOTOS[n]){
    loadFullPhoto_(n).then(full => {
      if(!full || !currentItem || String(currentItem.number).trim() !== n) return;
      const im = document.querySelector('#icPhotoBtn img'); if(im) im.src = full;
    });
  }
  updateBasketBar();
}

document.getElementById('photoInput')?.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if(f && currentItem) handlePhotoFile(currentItem, f);
});
document.getElementById('photoDeleteBtn')?.addEventListener('click', async () => {
  if(currentItem && await deleteItemPhoto(currentItem.number)) openItemDetail(currentItem.number);
});

// ===== سلة صور الموظف =====
function updateBasketBar(){
  const bar = document.getElementById('photoBasketBar'); if(!bar) return;
  const onEmployee = document.getElementById('view-employee').classList.contains('active');
  bar.hidden = !(LEGACY_PHOTOS_ENABLED && onEmployee && currentViewerRole === 'employee' && photoBasket.length);
  document.getElementById('photoBasketCount').textContent = String(photoBasket.length);
}
function renderBasket(){
  const body = document.getElementById('photoBasketBody');
  if(!photoBasket.length){ body.innerHTML = '<div class="empty-note">السلة فارغة — افتح أي صنف واضغط "إضافة صورة للسلة"</div>'; document.getElementById('sendBasketBtn').disabled = true; return; }
  document.getElementById('sendBasketBtn').disabled = false;
  body.innerHTML = photoBasket.map(b => `<div class="pe-row">
      <span class="ir-thumb"><img src="${escapeHtml(b.thumb)}" alt=""></span>
      <div style="min-width:0">
        <div class="ir-top"><span class="num-badge">${escapeHtml(b.num)}</span><span class="item-name">${escapeHtml(b.name) || '—'}</span></div>
        <div class="pe-actions"><button type="button" class="danger" data-rm="${escapeHtml(b.id)}">إزالة من السلة</button></div>
      </div></div>`).join('');
  body.querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.rm;
    db && db.collection('photo_pending').doc(id).delete().catch(() => {});
    photoBasket = photoBasket.filter(b => b.id !== id); saveBasket_(); renderBasket();
  }));
}
document.addEventListener('click', e => { if(e.target.closest('#photoBasketOpen')){ showView('photo-basket'); renderBasket(); } });
document.getElementById('sendBasketBtn')?.addEventListener('click', async () => {
  if(!photoBasket.length) return;
  const msg = document.getElementById('sendBasketMsg');
  const ok = await showConfirm(`إرسال ${photoBasket.length} صورة للإدارة العامة للموافقة؟`, { title:'إرسال للإدارة', okText:'إرسال' });
  if(!ok) return;
  msg.innerHTML = '<span class="spinner"></span> جارِ الإرسال…'; msg.className = 'msg';
  try {
    const ids = photoBasket.map(b => b.id);
    // by = uid الموظف، أو بريد المدير (القواعد تتحقق أنه صاحب الحساب نفسه)
    const u = auth && auth.currentUser;
    const by = !u ? '' : (isAdminEmail(u.email) ? String(u.email).toLowerCase() : u.uid);
    const bref = await db.collection('photo_batches').add({ ids, nums: photoBasket.map(b => b.num), count: ids.length, by, status: 'pending', at: firebase.firestore.FieldValue.serverTimestamp() });
    const batch = db.batch(); ids.forEach(id => batch.update(db.collection('photo_pending').doc(id), { status: 'sent', batch: bref.id }));
    await batch.commit();
    photoBasket = []; saveBasket_(); renderBasket();
    msg.textContent = '✓ تم الإرسال — ستظهر الصور للجميع بعد موافقة الإدارة'; msg.className = 'msg ok';
  } catch(err){ console.warn(err); msg.textContent = permMsg_(err, 'تعذّر الإرسال — تحقق من الإنترنت وحاول مرة أخرى'); msg.className = 'msg err'; }
});

// ===== الإدارة: دفعات الصور بانتظار الموافقة =====
function refreshPhotoEventsBadge(){
  if(!LEGACY_PHOTOS_ENABLED || !firebaseReady || !db) return;
  const u = auth && auth.currentUser; if(!u || !isAdminEmail(u.email)) return;
  db.collection('photo_batches').where('status', '==', 'pending').limit(99).get().then(s => {
    const b = document.getElementById('photoEventsBadge'); if(!b) return;
    b.textContent = String(s.size); b.style.display = s.size ? 'inline-block' : 'none';
  }).catch(() => {});
}

async function renderPhotoEvents(){
  const body = document.getElementById('photoEventsBody');
  body.innerHTML = '<div class="empty-note"><span class="spinner"></span> جارِ التحميل…</div>';
  try {
    const snap = await db.collection('photo_batches').where('status', '==', 'pending').limit(30).get();
    if(snap.empty){ body.innerHTML = '<div class="empty-note">لا توجد صور بانتظار الموافقة</div>'; return; }
    const batches = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.at && b.at.seconds) || 0) - ((a.at && a.at.seconds) || 0));
    const parts = [];
    for(const bt of batches){
      const docs = await Promise.all((bt.ids || []).map(id => db.collection('photo_pending').doc(id).get().catch(() => null)));
      const items = docs.filter(d => d && d.exists).map(d => ({ id: d.id, ...d.data() }));
      bt._items = items;
      const when = bt.at && bt.at.toDate ? bt.at.toDate().toLocaleString('ar-LY', { dateStyle:'medium', timeStyle:'short' }) : '—';
      parts.push(`<div class="pb-card" data-batch="${escapeHtml(bt.id)}">
        <div class="pb-head"><strong>دفعة من ${escapeHtml(STAFF_NAMES[bt.by] || bt.by || 'موظف')}</strong><span class="ir-sub">${escapeHtml(when)} · ${items.length} صورة</span></div>
        ${items.map(it => { const cur = itemImage(it.num); const itm = ITEMS.find(x => x.number === it.num); return `<div class="pb-item">
          <div class="ir-top"><span class="num-badge">${escapeHtml(it.num)}</span><span class="item-name">${escapeHtml((itm && itm.name) || it.name) || '—'}</span></div>
          ${itm ? `<div class="ir-sub">${[itm.company, itm.country, itm.color].filter(Boolean).map(escapeHtml).join(' · ')}</div>` : ''}
          <div class="pb-compare">
            <figure>
              <figcaption>الصورة الحالية</figcaption>
              ${cur ? `<button type="button" class="pb-img" data-zoomsrc="${escapeHtml(cur)}"><img src="${escapeHtml(cur)}" alt="" referrerpolicy="no-referrer"></button>` : `<div class="pb-img pb-none">بدون صورة</div>`}
            </figure>
            <figure>
              <figcaption>الصورة الجديدة</figcaption>
              <button type="button" class="pb-img pb-new" data-zoom="${escapeHtml(it.id)}"><img src="${escapeHtml(it.thumb || '')}" alt=""></button>
            </figure>
          </div>
          <label class="pb-check"><input type="checkbox" checked data-pid="${escapeHtml(it.id)}"> اعتماد الصورة الجديدة</label>
        </div>`; }).join('')}
        <div class="pb-actions">
          <button type="button" class="primary-btn" data-approve="${escapeHtml(bt.id)}" style="margin-top:0">اعتماد المحدد ورفض الباقي</button>
          <button type="button" class="photo-delete-btn" data-reject="${escapeHtml(bt.id)}">رفض الدفعة كاملة</button>
        </div>
        <div class="msg" role="status"></div>
      </div>`);
    }
    body.innerHTML = parts.join('');
    const findItem = id => { for(const b of batches) for(const it of b._items) if(it.id === id) return it; return null; };
    body.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const it = findItem(b.dataset.zoom); if(it) openLightbox(it.full, it.name); }));
    body.querySelectorAll('[data-zoomsrc]').forEach(b => b.addEventListener('click', () => { const n = b.closest('.pb-item').querySelector('.num-badge').textContent; const full = fullPhotoCache[n]; openLightbox(full || b.dataset.zoomsrc, ''); if(!full && UPLOADED_PHOTOS[n]) loadFullPhoto_(n).then(f => { if(f) openLightbox(f, ''); }); }));
    const finish = async (bt, approveIds, card) => {
      const m = card.querySelector('.msg'); m.innerHTML = '<span class="spinner"></span> جارِ الحفظ…'; m.className = 'msg';
      try {
        const u = auth && auth.currentUser; const by = 'موظف (اعتمدها ' + ((u && u.email) || 'الإدارة') + ')';
        for(const it of bt._items){
          if(approveIds.includes(it.id)) await publishPhoto_(it.num, it.name, it.full, it.thumb, by);
          await db.collection('photo_pending').doc(it.id).delete();
        }
        await db.collection('photo_batches').doc(bt.id).update({ status: 'done', approved: approveIds.length });
        renderResults(); refreshPhotoEventsBadge(); renderPhotoEvents();
      } catch(err){ console.warn(err); m.textContent = permMsg_(err, 'تعذّر الحفظ — حاول مرة أخرى'); m.className = 'msg err'; }
    };
    body.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
      const bt = batches.find(x => x.id === b.dataset.approve); const card = b.closest('.pb-card');
      const ids = [...card.querySelectorAll('input[data-pid]:checked')].map(i => i.dataset.pid);
      finish(bt, ids, card);
    }));
    body.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      if(!await showConfirm('رفض كل صور هذه الدفعة؟', { title:'رفض الدفعة', okText:'رفض' })) return;
      const bt = batches.find(x => x.id === b.dataset.reject); finish(bt, [], b.closest('.pb-card'));
    }));
  } catch(err){
    body.innerHTML = `<div class="empty-note">تعذّر التحميل — ${err && err.code === 'permission-denied' ? 'قاعدة الأمان للصور لم تُضف بعد في Firebase' : 'تحقق من الإنترنت'}</div>`;
  }
}
document.getElementById('adminPhotosBtn')?.addEventListener('click', () => { showView('admin-photos'); renderPhotoEvents(); });
if(!LEGACY_PHOTOS_ENABLED){ const b = document.getElementById('adminPhotosBtn'); if(b) b.style.display = 'none'; }

let currentItem = null;
// شاشة الصنف الواصلة من رابط QR للزبون: اسم + صورة + سعر قطاعي + متوفر/غير متوفر فقط (opts.qr)
// ملاحظة: هذا إخفاء في الواجهة فقط — بيانات الشيت العام نفسها لم تتغير.
let currentDetailQr = false;
function openItemDetail(number, opts){
  const item = ITEMS.find(it => it.number === number);
  if(!item) return;
  currentItem = item;
  const qrOnly = !!(opts && opts.qr) && currentViewerRole === 'customer';
  currentDetailQr = qrOnly;

  const branchKeys = Object.keys(item.branches);
  const branchCells = branchKeys.map(k => `
    <div class="stat"><span class="k">${escapeHtml(k)}</span><span class="v">${formatNum(item.branches[k])}</span></div>
  `).join('');

  const showQty = currentViewerRole !== "customer"; // الزبون ما يشوف أي بيانات كمية إطلاقًا
  const isAdminContext = employeeEntryPoint === "admin";

  const photo = itemImage(item.number);
  document.getElementById('employeeItemCard').innerHTML = `
    ${photo ? `<button type="button" class="ic-photo-wrap" id="icPhotoBtn" aria-label="تكبير صورة الصنف">
      <img class="ic-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(item.name)}" referrerpolicy="no-referrer" onerror="this.closest('.ic-photo-wrap').remove()">
      <span class="ic-zoom-hint" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg></span>
    </button>` : ''}
    ${qrOnly ? '' : `<div class="ic-num">${escapeHtml(item.number)}</div>`}
    <h3>${escapeHtml(item.name) || '—'}</h3>
    <div class="ic-price">${formatPrice(item.priceRetail)}</div>
    <div class="stat-grid">
      ${isAdminContext ? `<div class="stat wide"><span class="k">سعر الجملة</span><span class="v big">${formatPrice(item.priceWholesale)}</span></div>` : ''}
      ${qrOnly ? '' : `<div class="stat"><span class="k">الشركة المصنعة</span><span class="v">${escapeHtml(item.company) || '—'}</span></div>
      <div class="stat"><span class="k">بلد الصنع</span><span class="v">${escapeHtml(item.country) || '—'}</span></div>
      ${item.color ? `<div class="stat"><span class="k">اللون</span><span class="v">${escapeHtml(item.color)}</span></div>` : ''}`}
      ${showQty ? `<div class="stat wide"><span class="k">الكمية الإجمالية (كل الفروع)</span><span class="v big">${formatNum(item.totalQty)}</span></div>` : ''}
      ${currentViewerRole === "customer" ? `<div class="stat wide ${item.totalQty > 0 ? 'avail-in' : 'avail-out'}"><span class="k">التوفر</span><span class="v big">${item.totalQty > 0 ? '✓ متوفر' : '✕ غير متوفر'}</span></div>` : ''}
    </div>
    ${showQty ? `
    <div class="section-label">الكمية حسب الفرع</div>
    <div class="stat-grid branch-grid">
      ${branchCells}
    </div>
    ` : ''}
  `;

  // زر المشاركة يظهر للموظف فقط (يُلغى للإدارة العامة وللزبون)
  document.getElementById('employeeShareRow').style.display = currentViewerRole === "employee" ? "flex" : "none";
  // صفحة الزبون: زر "اطلب عبر واتساب" يفتح محادثة مع رقم الشركة ومعه بيانات الصنف جاهزة
  const orderRow = document.getElementById('customerOrderRow');
  if (orderRow) {
    orderRow.style.display = currentViewerRole === "customer" ? "flex" : "none";
    const msg = "السلام عليكم، أريد الاستفسار عن هذا الصنف:\n" + buildShareText(item);
    document.getElementById('customerOrderBtn').href = "https://wa.me/" + ORDER_WHATSAPP + "?text=" + encodeURIComponent(msg);
  }
  afterItemDetailRender_(item);

  const purchaseInfo = document.getElementById('adminPurchaseInfo');
  const priceChangeRow = document.getElementById('adminPriceChangeRow');
  const priceChangeForm = document.getElementById('priceChangeForm');
  if(isAdminContext){
    if(!secureLoaded && !secureError && !secureFetching) loadSecureItems();
    purchaseInfo.style.display = "block";
    purchaseInfo.innerHTML = `
      <div class="section-label">بيانات الشراء (إدارية)</div>
      ${(secureError && !SECURE_MAP) ? `<div class="section-label" role="alert">تعذّر تحميل بيانات الشراء الآن — تحقق من الإنترنت أو حاول لاحقًا</div>` : ''}
      ${(!secureLoaded && !secureError) ? `<div class="section-label">جارِ تحميل بيانات الشراء…</div>` : ''}
      <div class="stat-grid">
        <div class="stat"><span class="k">آخر سعر شراء</span><span class="v">${item.lastPurchasePrice ? formatNum(item.lastPurchasePrice) : '—'}</span></div>
        <div class="stat"><span class="k">العملة</span><span class="v">${escapeHtml(item.purchaseCurrency) || '—'}</span></div>
        <div class="stat"><span class="k">سعر الصرف</span><span class="v">${item.exchangeRate ? formatNum(item.exchangeRate) : '—'}</span></div>
        <div class="stat"><span class="k">تاريخ آخر شراء</span><span class="v">${escapeHtml(item.lastPurchaseDate) || '—'}</span></div>
      </div>
    `;
    priceChangeRow.style.display = "flex";
  } else {
    purchaseInfo.style.display = "none";
    purchaseInfo.innerHTML = "";
    priceChangeRow.style.display = "none";
  }
  priceChangeForm.style.display = "none"; // نصفّر النموذج كل ما نفتح صنف جديد

  goEmployeeStep("detail");
}

// ---------------------------------------------------------------
// الإدارة العامة — نظرة عامة (إحصائيات للقراءة فقط، بدون أي تعديل على البيانات)
// ---------------------------------------------------------------
function renderAdminOverview(){
  const body = document.getElementById('adminOverviewBody');
  if(!body) return;
  if(!itemsLoaded || !ITEMS.length){
    body.innerHTML = `<div class="empty-note"><span class="spinner"></span> جارِ تحميل بيانات الأصناف…</div>`;
    return;
  }

  const total = ITEMS.length;
  const outOfStock = ITEMS.filter(it => it.totalQty <= 0).length;
  const inStock = total - outOfStock;

  // عدد الفروع/المخازن وعدد الأصناف الناقصة (كمية صفر) بكل فرع
  const branchNames = Object.keys(ITEMS[0] ? ITEMS[0].branches : {});
  const branchRows = branchNames.map(name => {
    const zeroCount = ITEMS.filter(it => (it.branches[name] || 0) <= 0).length;
    return `<div class="stat"><span class="k">${escapeHtml(name)}</span><span class="v">${zeroCount} صنف ناقص</span></div>`;
  }).join('');

  const lastUpdatedText = itemsLastLoadedAt
    ? itemsLastLoadedAt.toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' })
    : 'غير معروف (بيانات محفوظة محليًا)';

  // تنبيه تكرار رقم الصنف: نفس "رقم الصنف" مستخدم لأكثر من صف في الشيت
  // (عادة نتيجة نسخ صف كقالب عند إضافة صنف جديد دون تعديل الرقم)
  const numberGroups = {};
  ITEMS.forEach(it => {
    const key = (it.number || '').toString().trim();
    if(!key) return;
    (numberGroups[key] = numberGroups[key] || []).push(it);
  });
  const dupNumbers = Object.keys(numberGroups).filter(k => numberGroups[k].length > 1);

  const dupBlock = dupNumbers.length ? `
    <div class="section-label" style="color:var(--warn);">⚠ تنبيه: أرقام أصناف مكرّرة (${dupNumbers.length})</div>
    <div class="empty-note" style="text-align:center;background:var(--steel-200);border:1px dashed var(--warn);border-radius:10px;padding:10px 12px;margin-bottom:12px;color:var(--steel-900);">
      نفس رقم الصنف مستخدم لأكثر من صنف في الشيت — غالبًا خطأ إدخال (نسخ صف كقالب دون تعديل الرقم). يفضّل تصحيحه مباشرة في الشيت.
    </div>
    <div class="dup-list" style="margin-bottom:18px;">
      ${dupNumbers.map(num => `
        <div style="font-size:11.5px; color:var(--steel-500); font-weight:600; margin:10px 0 6px;">رقم الصنف ${escapeHtml(num)} — ${numberGroups[num].length} أصناف</div>
        ${numberGroups[num].map(it => `
          <button class="item-row" data-num="${escapeHtml(it.number)}" style="margin-bottom:6px;">
            <div class="ir-body">
              <div class="ir-top">
                <span class="num-badge">${escapeHtml(it.number)}</span>
                <span class="item-name">${escapeHtml(it.name) || '—'}</span>
                <span class="item-price">${formatPrice(it.priceRetail)}</span>
              </div>
              <div class="ir-bottom">
                <span class="ir-sub">${[it.company, it.country, it.color].filter(Boolean).map(escapeHtml).join(' · ')}</span>
              </div>
            </div>
          </button>
        `).join('')}
      `).join('')}
    </div>
  ` : '';

  body.innerHTML = `
    <div class="sync-note" style="margin-bottom:14px;">
      <div class="sync-dot ${itemsFetching ? '' : 'on'}" id="itemsSyncDot"></div>
      <span>آخر تحديث للبيانات: ${lastUpdatedText}</span>
    </div>
    <button class="list-btn" id="syncItemsNowBtn" type="button" style="margin-bottom:18px;">
      <div class="list-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
      </div>
      <div class="list-text"><strong>مزامنة الآن</strong><span id="syncItemsNowStatus">جلب آخر نسخة من الشيت مباشرة</span></div>
    </button>
    ${dupBlock}
    <div class="stat-grid">
      <div class="stat"><span class="k">إجمالي عدد الأصناف</span><span class="v big">${total}</span></div>
      <div class="stat"><span class="k">أصناف متوفرة</span><span class="v big">${inStock}</span></div>
      <div class="stat wide"><span class="k">أصناف غير متوفرة في كل الفروع</span><span class="v big">${outOfStock}</span></div>
    </div>
    <div class="section-label">الأصناف الناقصة حسب الفرع</div>
    <div class="stat-grid branch-grid">
      ${branchRows || '<div class="empty-note">لا توجد بيانات فروع</div>'}
    </div>
  `;

  const syncBtn = document.getElementById('syncItemsNowBtn');
  if(syncBtn){
    syncBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('syncItemsNowStatus');
      if(statusEl) statusEl.textContent = "جارِ التحديث…";
      syncBtn.disabled = true;
      secureFetchedAt = 0; // المزامنة اليدوية تجلب بيانات الشراء من جديد أيضًا
      loadItems(true);
      setTimeout(() => { renderAdminOverview(); }, 1500); // نعيد الرسم بعد مهلة قصيرة لتحديث الحالة والوقت
    });
  }
  body.querySelectorAll('.dup-list .item-row').forEach(row => {
    row.addEventListener('click', () => openItemDetail(row.dataset.num));
  });
}

// ---------------------------------------------------------------
// الإدارة العامة — كشف رأس المال
// القيمة تُحسب من: آخر سعر شراء × سعر الصرف المسجّل وقت الشراء × الكمية الإجمالية
// (لا يوجد أي تعديل على بيانات الشيت — عرض وحساب فقط)
// ---------------------------------------------------------------
function renderCapitalReport(){
  const body = document.getElementById('adminCapitalBody');
  if(!body) return;
  if(!itemsLoaded || !ITEMS.length){
    body.innerHTML = `<div class="empty-note"><span class="spinner"></span> جارِ تحميل بيانات الأصناف…</div>`;
    return;
  }

  let totalLYD = 0;
  let missingPriceCount = 0;
  const byCurrency = {}; // { "دولار": { count, valueLYD } }

  ITEMS.forEach(it => {
    if(!it.lastPurchasePrice || it.lastPurchasePrice <= 0){
      missingPriceCount++;
      return;
    }
    const currency = it.purchaseCurrency || "غير محدد";
    // لو الصنف مسجّل أصلاً بالدينار أو سعر الصرف فاضي/صفر، نعتبر معامل التحويل = 1
    const isLYD = /دينار|LYD|ل\.د|د\.ل/i.test(currency);
    const rate = it.exchangeRate > 0 ? it.exchangeRate : 1;
    const effectiveRate = isLYD ? 1 : rate;
    const valueLYD = it.lastPurchasePrice * effectiveRate * it.totalQty;

    totalLYD += valueLYD;
    if(!byCurrency[currency]) byCurrency[currency] = { count: 0, valueLYD: 0 };
    byCurrency[currency].count += 1;
    byCurrency[currency].valueLYD += valueLYD;
  });

  const totalUSD = SETTINGS.usdRate > 0 ? totalLYD / SETTINGS.usdRate : null;

  const currencyRows = Object.keys(byCurrency).map(cur => {
    const c = byCurrency[cur];
    return `<div class="stat"><span class="k">${escapeHtml(cur)} (${c.count} صنف)</span><span class="v">${formatNum(c.valueLYD)} ${CURRENCY}</span></div>`;
  }).join('');

  body.innerHTML = `
    <div class="stat-grid">
      <div class="stat wide"><span class="k">إجمالي رأس المال بالدينار</span><span class="v big">${formatNum(totalLYD)} ${CURRENCY}</span></div>
      <div class="stat wide"><span class="k">إجمالي رأس المال بالدولار</span><span class="v big">${totalUSD !== null ? formatNum(totalUSD) + ' $' : '— أدخل سعر الصرف أعلاه —'}</span></div>
    </div>
    <div class="section-label">التفصيل حسب عملة الشراء الأصلية</div>
    <div class="stat-grid branch-grid">
      ${currencyRows || '<div class="empty-note">لا توجد بيانات شراء كافية</div>'}
    </div>
    ${missingPriceCount ? `<div class="empty-note" style="margin-top:10px;">تنبيه: ${missingPriceCount} صنف بدون سعر شراء مسجّل — غير محسوبين ضمن رأس المال أعلاه</div>` : ''}
  `;
}

// رقم واتساب الشركة اللي توصله طلبات الزبائن من صفحة الصنف (0914575500)
const ORDER_WHATSAPP = "218914575500";

function buildShareText(item){
  const lines = [
    `*${item.name || ''}*`,
    `رقم الصنف: ${item.number}`,
  ];
  if(item.company) lines.push(`الشركة المصنعة: ${item.company}`);
  if(item.country) lines.push(`بلد الصنع: ${item.country}`);
  if(item.color) lines.push(`اللون: ${item.color}`);
  lines.push(`سعر القطاعي: ${formatPrice(item.priceRetail)}`);
  return lines.join('\n');
}

// إذا كان الصنف غير متوفر في كل الفروع/المخازن (الكمية الإجمالية صفر)، نحذّر قبل المشاركة
async function confirmShareIfOutOfStock(item){
  if(item && item.totalQty <= 0){
    return await showConfirm('هذا الصنف غير متوفر في جميع الفروع أو المخازن. هل تريد الاستمرار؟', { title:"تنبيه توفر" });
  }
  return true;
}

document.getElementById('shareWhatsappBtn')?.addEventListener('click', async ()=>{
  if(!currentItem) return;
  if(!(await confirmShareIfOutOfStock(currentItem))) return;
  const text = encodeURIComponent(buildShareText(currentItem));
  window.open(`https://wa.me/?text=${text}`, '_blank');
});

// زر «مشاركة» الأصلي للهاتف: يظهر فقط إن وُجد العنصر في الصفحة (موجود في staff.html، وليس في index.html)
// الحراسة مهمة: أي null هنا يوقف app.js كله على الهواتف التي تدعم navigator.share (Android Chrome)
try {
  const moreBtn = document.getElementById('shareMoreBtn');
  if(navigator.share && moreBtn){
    moreBtn.style.display = "flex";
    moreBtn.addEventListener('click', async ()=>{
      if(!currentItem) return;
      if(!(await confirmShareIfOutOfStock(currentItem))) return;
      navigator.share({ text: buildShareText(currentItem) }).catch(()=>{});
    });
  }
} catch(e){ console.warn('تعذّر تفعيل زر المشاركة', e); }

// =====================================================================
// قائمة تغيير الأسعار (الإدارة العامة) — تُخزّن محليًا بالمتصفح (localStorage)
// وتبقى محفوظة حتى بعد تحديث الصفحة، إلى أن يتم مسحها يدويًا
// =====================================================================
const PRICE_CART_KEY = "jadu_price_change_cart_v1";

function loadPriceCart(){
  try {
    const raw = localStorage.getItem(PRICE_CART_KEY);
    if(!raw) return { items: [], shared: false };
    const parsed = JSON.parse(raw);
    return { items: Array.isArray(parsed.items) ? parsed.items : [], shared: !!parsed.shared };
  } catch(e){
    return { items: [], shared: false };
  }
}
function savePriceCart(){
  try { localStorage.setItem(PRICE_CART_KEY, JSON.stringify(priceCart)); } catch(e){}
}

let priceCart = loadPriceCart();

function updatePriceCartBadge(){
  const badge = document.getElementById('priceCartBadge');
  if(!badge) return;
  const count = priceCart.items.length;
  badge.textContent = String(count);
  badge.style.display = count > 0 ? "inline-block" : "none";
}

// إضافة تغيير سعر لصنف إلى القائمة — يتعامل مع حالة "قائمة سابقة تم إرسالها"
async function addPriceChangeToCart(item, newRetail, newWholesale){
  if(priceCart.items.length && priceCart.shared){
    const addToOld = await showConfirm(
      "عندك قائمة سابقة تم إرسالها من قبل ولسا موجودة.\n" +
      "اضغط \"إضافة للقائمة\" لإضافة هذا التغيير لها، أو \"إلغاء\" لبدء قائمة جديدة (سيتم حذف القديمة).",
      { title:"قائمة سابقة موجودة", okText:"إضافة للقائمة" }
    );
    if(!addToOld){
      priceCart = { items: [], shared: false };
    } else {
      priceCart.shared = false;
    }
  }

  const entry = {
    number: item.number,
    name: item.name,
    oldRetail: item.priceRetail,
    oldWholesale: item.priceWholesale,
    newRetail: newRetail,
    newWholesale: newWholesale,
  };
  const idx = priceCart.items.findIndex(x => x.number === item.number);
  if(idx >= 0) priceCart.items[idx] = entry;
  else priceCart.items.push(entry);

  savePriceCart();
  updatePriceCartBadge();
}

function removeFromPriceCart(number){
  priceCart.items = priceCart.items.filter(x => x.number !== number);
  savePriceCart();
  updatePriceCartBadge();
  renderPriceCart();
}

function buildPriceCartShareText(){
  const lines = ["*قائمة تغيير أسعار*", "———————————"];
  priceCart.items.forEach((e, i) => {
    lines.push(`${i + 1}) رقم: ${e.number} — ${e.name || ''}`);
    if(e.newRetail !== null && e.newRetail !== undefined){
      lines.push(`   قطاعي: ${formatPrice(e.oldRetail)} ← ${formatNum(e.newRetail)}`);
    }
    if(e.newWholesale !== null && e.newWholesale !== undefined){
      lines.push(`   جملة: ${formatPrice(e.oldWholesale)} ← ${formatNum(e.newWholesale)}`);
    }
  });
  lines.push("———————————");
  lines.push(`عدد الأصناف: ${priceCart.items.length}`);
  return lines.join('\n');
}

function renderPriceCart(){
  const body = document.getElementById('priceCartBody');
  if(!body) return;
  if(!priceCart.items.length){
    body.innerHTML = `<div class="empty-note">لا توجد تغييرات مضافة بعد</div>`;
    return;
  }
  body.innerHTML = priceCart.items.map(e => `
    <div class="item-row" style="cursor:default;">
      <div class="ir-top">
        <span class="num-badge">${escapeHtml(e.number)}</span>
        <span class="item-name">${escapeHtml(e.name) || '—'}</span>
        <button class="cart-remove-btn" data-remove="${escapeHtml(e.number)}" aria-label="حذف من القائمة" title="حذف من القائمة">✕</button>
      </div>
      <div class="ir-bottom" style="flex-direction:column; align-items:flex-start; gap:4px;">
        ${e.newRetail !== null && e.newRetail !== undefined ? `<span class="ir-sub">قطاعي: ${formatPrice(e.oldRetail)} ← ${formatNum(e.newRetail)} ${CURRENCY}</span>` : ''}
        ${e.newWholesale !== null && e.newWholesale !== undefined ? `<span class="ir-sub">جملة: ${formatPrice(e.oldWholesale)} ← ${formatNum(e.newWholesale)} ${CURRENCY}</span>` : ''}
      </div>
    </div>
  `).join('');
  body.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=> removeFromPriceCart(btn.dataset.remove));
  });
}

// ===== سجل دائم لتغيير الأسعار (Firestore: price_log) =====
// كل قائمة تُرسل (واتساب أو مشاركة) تُحفظ كمستند واحد: التاريخ + المرسِل + الأصناف.
// القراءة والإضافة للإدارة فقط، ولا يمكن تعديل أو حذف السجل (حسب قواعد الأمان).
function logPriceCartToFirestore_(){
  if(!firebaseReady || !db || !priceCart.items.length) return;
  const user = auth && auth.currentUser;
  if(!user || !isAdminEmail(user.email)) return;
  const items = priceCart.items.map(e => ({
    number: String(e.number || ''), name: String(e.name || ''),
    oldRetail: Number(e.oldRetail) || 0, oldWholesale: Number(e.oldWholesale) || 0,
    newRetail: (e.newRetail === null || e.newRetail === undefined) ? null : Number(e.newRetail),
    newWholesale: (e.newWholesale === null || e.newWholesale === undefined) ? null : Number(e.newWholesale)
  }));
  db.collection('price_log').add({
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    by: String(user.email).toLowerCase(),
    count: items.length,
    items
  }).catch(err => console.warn("تعذّر حفظ القائمة في سجل الأسعار", err));
}

function renderPriceLog(){
  const body = document.getElementById('priceLogBody');
  if(!body) return;
  body.innerHTML = `<div class="empty-note"><span class="spinner"></span> جارِ التحميل…</div>`;
  if(!firebaseReady || !db){ body.innerHTML = `<div class="empty-note">تعذّر الاتصال بقاعدة البيانات</div>`; return; }
  db.collection('price_log').orderBy('createdAt', 'desc').limit(30).get().then(snap => {
    if(snap.empty){ body.innerHTML = `<div class="empty-note">لا يوجد سجل بعد — يُحفظ تلقائيًا عند مشاركة قائمة تغيير الأسعار</div>`; return; }
    body.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      const when = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString('ar-LY', { dateStyle:'medium', timeStyle:'short' }) : '—';
      const rows = (d.items || []).map(e => `
        <div class="ir-sub"><span class="num-badge">${escapeHtml(e.number)}</span> ${escapeHtml(e.name) || ''}</div>
        ${e.newRetail !== null && e.newRetail !== undefined ? `<div class="ir-sub">قطاعي: ${formatPrice(e.oldRetail)} ← ${formatNum(e.newRetail)} ${CURRENCY}</div>` : ''}
        ${e.newWholesale !== null && e.newWholesale !== undefined ? `<div class="ir-sub">جملة: ${formatPrice(e.oldWholesale)} ← ${formatNum(e.newWholesale)} ${CURRENCY}</div>` : ''}
      `).join('');
      return `
        <div class="item-row price-log-entry">
          <div class="ir-top">
            <span class="item-name">${escapeHtml(when)}</span>
            <span class="ir-sub">${escapeHtml(d.count || (d.items || []).length)} صنف</span>
          </div>
          <div class="ir-sub">${escapeHtml(d.by || '')}</div>
          <div class="price-log-items">${rows}</div>
        </div>`;
    }).join('');
  }).catch(err => {
    console.warn("تعذّر تحميل سجل الأسعار", err);
    body.innerHTML = `<div class="empty-note">تعذّر تحميل السجل — ${err && err.code === 'permission-denied' ? 'قاعدة الأمان لم تُضف بعد في Firebase' : 'تحقق من الإنترنت'}</div>`;
  });
}

document.getElementById('adminPriceLogBtn')?.addEventListener('click', ()=>{
  showView("admin-pricelog");
  renderPriceLog();
});

async function afterPriceCartShared(){
  logPriceCartToFirestore_();
  const clear = await showConfirm("هل تريد مسح القائمة الآن؟", { title:"مسح القائمة" });
  if(clear){
    priceCart = { items: [], shared: false };
  } else {
    priceCart.shared = true;
  }
  savePriceCart();
  updatePriceCartBadge();
  renderPriceCart();
}

document.getElementById('adminPriceListBtn')?.addEventListener('click', ()=>{
  showView("admin-pricelist");
  renderPriceCart();
});

document.getElementById('shareCartWhatsappBtn')?.addEventListener('click', async ()=>{
  if(!priceCart.items.length){ await showAlert("القائمة فارغة — أضف تغييرات أولًا"); return; }
  const text = encodeURIComponent(buildPriceCartShareText());
  window.open(`https://wa.me/?text=${text}`, '_blank');
  afterPriceCartShared();
});

// زر مشاركة قائمة الأسعار: موجود في staff.html فقط. على index.html لا يوجد، فنتخطاه بلا خطأ
try {
  const cartMoreBtn = document.getElementById('shareCartMoreBtn');
  if(navigator.share && cartMoreBtn){
    cartMoreBtn.style.display = "flex";
    cartMoreBtn.addEventListener('click', async ()=>{
      if(!priceCart.items.length){ await showAlert("القائمة فارغة — أضف تغييرات أولًا"); return; }
      navigator.share({ text: buildPriceCartShareText() }).then(afterPriceCartShared).catch(()=>{});
    });
  }
} catch(e){ console.warn('تعذّر تفعيل زر مشاركة القائمة', e); }

// فتح/إغلاق نموذج تغيير السعر بشاشة تفاصيل الصنف
document.getElementById('openPriceChangeBtn')?.addEventListener('click', ()=>{
  const form = document.getElementById('priceChangeForm');
  const isOpen = form.style.display !== "none";
  form.style.display = isOpen ? "none" : "block";
  if(!isOpen && currentItem){
    document.getElementById('pcfItemNum').textContent = currentItem.number;
    document.getElementById('pcfOldRetail').textContent = formatPrice(currentItem.priceRetail);
    document.getElementById('pcfOldWholesale').textContent = formatPrice(currentItem.priceWholesale);
    document.getElementById('pcfNewRetail').value = "";
    document.getElementById('pcfNewWholesale').value = "";
    document.getElementById('pcfMsg').textContent = "";
    document.getElementById('pcfMsg').className = "msg";
  }
});

document.getElementById('pcfAddBtn')?.addEventListener('click', async ()=>{
  const msg = document.getElementById('pcfMsg');
  const rRaw = document.getElementById('pcfNewRetail').value.trim();
  const wRaw = document.getElementById('pcfNewWholesale').value.trim();
  const newRetail = rRaw ? parseFloat(rRaw) : null;
  const newWholesale = wRaw ? parseFloat(wRaw) : null;

  if((rRaw && (isNaN(newRetail) || newRetail < 0)) || (wRaw && (isNaN(newWholesale) || newWholesale < 0))){
    msg.textContent = "أدخل أرقامًا صحيحة";
    msg.className = "msg err";
    return;
  }
  if(newRetail === null && newWholesale === null){
    msg.textContent = "أدخل سعرًا واحدًا على الأقل";
    msg.className = "msg err";
    return;
  }
  if(!currentItem) return;

  await addPriceChangeToCart(currentItem, newRetail, newWholesale);
  msg.textContent = "تمت الإضافة إلى قائمة تغيير الأسعار";
  msg.className = "msg ok";
  document.getElementById('pcfNewRetail').value = "";
  document.getElementById('pcfNewWholesale').value = "";
});

updatePriceCartBadge();

// =====================================================================
// مسح الكود بالكاميرا عبر مكتبة ZXing (+ BarcodeDetector المدمج إن وُجد)، بإطار مسح مربع
// تُستخدم بنفس الزر في الواجهات الثلاثة (موظف / زبون / إدارة عامة) لأنها كلها
// تعرض نفس شاشة البحث (#view-employee)
// =====================================================================
// الافتراضي QR فقط: أسرع وأدق (محلّل واحد لكل إطار، ولا قراءات خاطئة من باركود 1D).
// زر #camModeBtn يضيف الباركود 1D القديم (Code128, EAN-13/8, UPC-A/E, Code39, ITF)
let camMode1D = false;
const camOverlay = document.getElementById('camOverlay');
const camVideo = document.getElementById('camVideo');
const camZoomCanvas = document.getElementById('camZoomCanvas');
const camFrame = document.getElementById('camFrame');
const camHint = document.getElementById('camHint');
let zxingReader = null;
let camDetector = null;
let camDetectTimer = null;
let camScanning = false;
// يمنع استدعاء handleScanResult مرتين لو حركين الكشف (ZXing + BarcodeDetector) لقوا نتيجة بنفس اللحظة تقريبًا
let scanResultHandled = false;

// تُبنى عند فتح الكاميرا فقط — لو مكتبة ZXing ما تحمّلت، ما تتعطل باقي الصفحة
function camFormatsZxing_(){
  const F = ZXing.BarcodeFormat;
  return camMode1D ? [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF]
    : [F.QR_CODE];
}
function camFormatsNative_(){
  return camMode1D ? ['qr_code','code_128','code_39','ean_13','ean_8','upc_a','upc_e','itf'] : ['qr_code'];
}

// قارئ ZXing الأساسي (بلا كاميرا خاصة به): يفك الرمز من الصورة المقصوصة من المربع فقط
function getZxingReader(){
  if(!zxingReader){
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, camFormatsZxing_());
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    zxingReader = new ZXing.MultiFormatReader();
    zxingReader.setHints(hints);
  }
  return zxingReader;
}

// المقروء: رابط جادو فيه item=الرقم (ملصقات QR) = 'link'، أو رابط آخر = 'foreign'،
// أو نص مجرد (رقم صنف / شفرة نوع / باركود) = 'code'
function parseScan_(raw){
  const t = String(raw == null ? '' : raw).trim();
  if(/^https?:\/\//i.test(t)){
    try {
      const u = new URL(t);
      const v = (u.searchParams.get('item') || '').trim();
      if(v && (u.host === JADU_SITE_HOST || u.host === location.host)) return { kind: 'link', value: v };
    } catch(e){}
    return { kind: 'foreign', value: t };
  }
  return { kind: 'code', value: t };
}
// رابط جادو: برقم الصنف فقط. النص المجرد: رقم الصنف أولًا، ثم شفرة النوع إن لم يوجد رقم مطابق.
// (أرقام كثيرة تطابق «شفرة النوع» لصنف آخر، فالبحث بالحقلين معًا كان يعطي «كود مكرر»)
function matchScan_(scan){
  if(scan.kind === 'foreign') return [];
  const byNumber = ITEMS.filter(it => it.number === scan.value);
  if(byNumber.length || scan.kind === 'link') return byNumber;
  return ITEMS.filter(it => it.typeCode === scan.value);
}
function handleScanResult(raw){
  if(scanResultHandled) return; // نتيجة ثانية من المحرك الآخر بعد ما عالجنا نتيجة سابقة — نتجاهلها
  const scan = parseScan_(raw), text = scan.value;
  scanResultHandled = true;
  closeCamera();
  // نجمع كل الأصناف المطابقة (مو أول واحد بس) لاكتشاف حالة تكرار نفس الكود بأكثر من صنف
  const matches = matchScan_(scan);
  // رمز غريب: رابط ليس لصنف من جادو، أو نص غير رقمي لا يطابق شيئًا. لا نفتحه ولا نعرض محتواه
  if(scan.kind === 'foreign' || (!matches.length && scan.kind === 'code' && !/^\d+$/.test(text))){
    showConfirm("هذا الرمز لا يخص أي صنف في جادو.", { title:"ليس صنفا من جادو", okText:"مسح مرة أخرى", cancelText:"حسنًا" })
      .then(scanAgain => { if(scanAgain) openCamera(true); });
    return;
  }
  if(matches.length === 1){
    // من رابط جادو: الزبون يرى الصفحة المختصرة نفسها التي تفتحها كاميرا الهاتف (opts.qr يؤثر على الزبون فقط)
    openItemDetail(matches[0].number, { qr: scan.kind === 'link' });
  } else if(matches.length > 1){
    // نفس الكود مسجّل بالخطأ بأكثر من صنف — نعرض القائمة ليختار المستخدم الصنف الصحيح بنفسه
    const searchInput = document.getElementById('employeeSearchInput');
    if(searchInput){ searchInput.value = text; renderResults(); }
    showAlert(`تم العثور على ${matches.length} أصناف بنفس الكود "${text}" — اختر الصنف الصحيح من القائمة أدناه`, { title:"كود مكرر بأكثر من صنف" });
  } else {
    // لا يوجد تطابق تام — نعبّئ مربع البحث بالكود المقروء فورًا، فتظهر أقرب الأصناف تطابقًا
    // تلقائيًا (نفس محرك البحث الذكي)، ويقدر المستخدم يشوف ويعدّل لو كان خطأ بسيط بالقراءة
    const searchInput = document.getElementById('employeeSearchInput');
    if(searchInput){ searchInput.value = text; renderResults(); }
    showConfirm("ما فيه صنف مطابق تمامًا لهذا الكود: " + text + "\nأقرب النتائج معروضة بالقائمة تحت.", { title:"لم يُعثر على تطابق تام", okText:"مسح مرة أخرى", cancelText:"حسنًا" })
      .then(scanAgain => { if(scanAgain) openCamera(true); });
  }
}

// منطقة القراءة الوحيدة = المربع المعروض (#camFrame) مقصوصًا من الفيديو.
// المحركان يقرآن الصورة المقصوصة نفسها: BarcodeDetector المدمج (إن وُجد ويدعم QR) ثم ZXing
// (جافاسكربت بحتة، تعمل على كل الأجهزة). لا يُقرأ أي رمز خارج المربع.
let camVideoTrack = null;

// زوم الكاميرا: يبدأ دائمًا على 1×، وزرا 1×/2× يظهران فقط إن كان مدى الكاميرا يتسع لضعف 1×.
// بعض الكاميرات تقيس الزوم بوحدات أخرى (مثل 100–500)، فنعتبر «1×» = القيمة 1 محصورة داخل المدى
const camZoomBox = document.getElementById('camZoom');
let camZoomBase = 1;
function markZoom_(factor){
  camZoomBox?.querySelectorAll('[data-camzoom]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.camzoom) === factor)));
}
async function setCamZoom_(factor){
  const track = camVideoTrack;
  if(!track) return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: camZoomBase * factor }] });
    if(track === camVideoTrack) markZoom_(factor);
    return true;
  } catch(e){ return false; }
}
async function setupZoom_(track){
  try {
    const range = track.getCapabilities ? track.getCapabilities().zoom : null;
    if(!range) return;
    camZoomBase = Math.min(range.max, Math.max(range.min, 1));
    if(await setCamZoom_(1) && track === camVideoTrack && range.max >= camZoomBase * 2 && camZoomBox) camZoomBox.hidden = false;
  } catch(e){ /* الزوم غير مدعوم — لا أزرار */ }
}
camZoomBox?.addEventListener('click', e => { const b = e.target.closest('[data-camzoom]'); if(b) setCamZoom_(Number(b.dataset.camzoom)); });

// التبديل بين QR فقط و QR + الباركود 1D، والكاميرا تبقى تعمل
const camModeBtn = document.getElementById('camModeBtn');
function updateModeUi_(){
  camHint.textContent = camMode1D ? "ضع الباركود داخل المربع الأحمر" : "ضع رمز QR داخل المربع الأحمر";
  if(camModeBtn){
    camModeBtn.textContent = camMode1D ? "العودة إلى QR فقط" : "قراءة باركود 1D";
    camModeBtn.setAttribute('aria-pressed', String(camMode1D));
  }
}
// يعيد بناء المحرك المدمج للصيغ الحالية، ويتجاهل النتيجة إن تغيّر الوضع أو أُغلقت الكاميرا أثناء الانتظار
async function refreshDetector_(){
  const session = camSession, mode = camMode1D;
  camDetector = null;
  const detector = await makeNativeDetector_();
  if(session === camSession && mode === camMode1D) camDetector = detector;
}
camModeBtn?.addEventListener('click', () => {
  camMode1D = !camMode1D;
  zxingReader = null;          // يُبنى من جديد بالصيغ الجديدة في المحاولة التالية
  updateModeUi_();
  refreshDetector_();
});

// يرسم ما تحت المربع المعروض بالضبط في camZoomCanvas ويرجعه (null قبل جاهزية الفيديو).
// الفيديو معروض بنسبة أبعاده الأصلية (width:100%، ارتفاع تلقائي)، فالتحويل من بكسلات الشاشة
// إلى بكسلات الفيديو خطي بنفس النسبة على المحورين: المربع على الشاشة = مربع في الفيديو.
function cropScanSquare_(){
  if(camVideo.readyState < 2 || !camVideo.videoWidth || !camFrame) return null;
  const v = camVideo.getBoundingClientRect(), f = camFrame.getBoundingClientRect();
  if(!v.width || !v.height) return null;
  const kx = camVideo.videoWidth / v.width, ky = camVideo.videoHeight / v.height;
  // حدود المربع داخل الفيديو (مع قصّ أي جزء يخرج عن الفيديو)
  const x0 = Math.max(0, (f.left - v.left) * kx), y0 = Math.max(0, (f.top - v.top) * ky);
  const x1 = Math.min(camVideo.videoWidth, (f.right - v.left) * kx), y1 = Math.min(camVideo.videoHeight, (f.bottom - v.top) * ky);
  const sw = x1 - x0, sh = y1 - y0;
  if(sw < 20 || sh < 20) return null;
  // أثناء تدوير الهاتف قد تتأخر أبعاد الفيديو عن أبعاد العنصر لإطار أو اثنين، فتختلف النسبتان
  // ويخرج القصّ غير مربع — نتخطى هذا الإطار فقط (القياس يُعاد كل إطار، فالتدوير لا يفسد القصّ بعده)
  if(Math.abs(kx - ky) / Math.max(kx, ky) > 0.02) return null;
  // تكبير معتدل يعطي الرمز الصغير تفاصيل أوضح دون إبطاء الفحص
  const k = Math.min(1024, Math.max(Math.max(sw, sh) * 1.6, 640)) / Math.max(sw, sh);
  camZoomCanvas.width = Math.round(sw * k);
  camZoomCanvas.height = Math.round(sh * k);
  const ctx = camZoomCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(camVideo, x0, y0, sw, sh, 0, 0, camZoomCanvas.width, camZoomCanvas.height);
  return camZoomCanvas;
}

// إضاءة الصورة المقصوصة لـ ZXing نحسبها بأنفسنا من getImageData.
// لا نستخدم HTMLCanvasElementLuminanceSource: في ZXing 0.20 تعطي صورة معكوسة في كل استدعاء ثانٍ
// (مقيس في اختبار بلا واجهة: مجموع الإضاءة يتبدّل 5050000/7700000 فالقراءة 0101…، و reset() لا يغيّر شيئًا).
let camLumBuf = null;
function zxingLuminance_(img){
  const w = img.width, h = img.height;
  const d = img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  if(!camLumBuf || camLumBuf.length !== w * h) camLumBuf = new Uint8ClampedArray(w * h);
  for(let i = 0, j = 0; i < d.length; i += 4, j++) camLumBuf[j] = (d[i] * 306 + d[i + 1] * 601 + d[i + 2] * 117) >> 10;
  return new ZXing.RGBLuminanceSource(camLumBuf, w, h);
}

// محاولة قراءة واحدة من المربع: BarcodeDetector أولًا (أسرع إن وُجد)، ثم ZXing على الصورة نفسها
async function decodeScanSquare_(){
  const img = cropScanSquare_();
  if(!img) return '';
  if(camDetector){
    try {
      const found = await camDetector.detect(img);
      const t = found && found.length ? String(found[0].rawValue || '').trim() : '';
      if(t) return t;
    } catch(e){ /* نكمل بـ ZXing */ }
  }
  try {
    const res = getZxingReader().decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(zxingLuminance_(img))));
    return res ? String(res.getText() || '').trim() : '';
  } catch(e){ return ''; } // NotFoundException = لا رمز في المربع
}

function startScanLoop_(){
  camScanning = true;
  const tick = async () => {
    if(!camScanning || scanResultHandled) return;
    const text = await decodeScanSquare_();
    if(text){ handleScanResult(text); return; }
    if(camScanning && !scanResultHandled) camDetectTimer = setTimeout(tick, 120);
  };
  tick();
}

async function makeNativeDetector_(){
  if(typeof BarcodeDetector === 'undefined') return null;
  try {
    let formats = camFormatsNative_();
    if(typeof BarcodeDetector.getSupportedFormats === 'function'){
      const supported = await BarcodeDetector.getSupportedFormats();
      formats = formats.filter(f => supported.includes(f));
      if(!formats.length) return null; // المحرك المدمج لا يدعم QR على هذا الجهاز — ZXing وحده
    }
    return new BarcodeDetector({ formats });
  } catch(e){ return null; }
}

// keepMode: «مسح مرة أخرى» يبقي الوضع الحالي، وزر المسح يبدأ دائمًا بوضع QR
async function openCamera(keepMode){
  if(keepMode !== true) camMode1D = false;
  zxingReader = null;
  updateModeUi_();
  if(camZoomBox) camZoomBox.hidden = true;
  camOverlay.classList.add('open');
  openFocusTrap(camOverlay);
  scanResultHandled = false;
  // دقة أعلى + تركيز تلقائي مستمر: تفاصيل أوضح داخل المربع المقصوص
  const constraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: "continuous" }]
    }
  };
  if(typeof ZXing === 'undefined'){
    camHint.textContent = "تعذّر تحميل قارئ الباركود — تحقق من الإنترنت وأعد فتح الصفحة";
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    camHint.textContent = "هذا المتصفح لا يسمح بالكاميرا هنا — افتح الموقع من رابطه https في Chrome أو Safari";
    return;
  }
  const session = ++camSession;
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // أُغلقت الكاميرا (أو فُتحت من جديد) أثناء انتظار الإذن: نوقف هذا البث فورًا
    if(session !== camSession || !camOverlay.classList.contains('open')){ stream.getTracks().forEach(t => t.stop()); return; }
    camVideo.setAttribute('playsinline', ''); camVideo.muted = true;   // iOS: داخل الصفحة لا بملء الشاشة
    camVideo.srcObject = stream;
    await camVideo.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    if(track){ camVideoTrack = track; setupZoom_(track); }
    await refreshDetector_();
    if(session !== camSession) return;
    startScanLoop_();
  } catch(e){
    if(session === camSession) camHint.textContent = camErrorText_(e);
  }
}
// رسالة واضحة بدل شاشة سوداء عند فشل فتح الكاميرا
function camErrorText_(e){
  const n = (e && e.name) || '';
  if(n === 'NotAllowedError' || n === 'SecurityError') return "لم يُسمح للموقع باستخدام الكاميرا. اسمح بالكاميرا من إعدادات الموقع في المتصفح (رمز القفل بجانب الرابط) ثم أعد فتح الماسح.";
  if(n === 'NotFoundError' || n === 'OverconstrainedError') return "لم يُعثر على كاميرا في هذا الجهاز.";
  if(n === 'NotReadableError' || n === 'AbortError') return "الكاميرا مشغولة بتطبيق آخر — أغلقه ثم أعد فتح الماسح.";
  return "تعذّر فتح الكاميرا — أغلق الماسح وحاول مرة أخرى.";
}
let camSession = 0;
// الصفحة خرجت من الواجهة (تبديل تطبيق، قفل الشاشة): نغلق الماسح ونطفئ الكاميرا
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden' && camOverlay && camOverlay.classList.contains('open')) closeCamera(); });
// إغلاق الماسح يطفئ الكاميرا فعليًا: stop لكل track (يختفي مؤشر الكاميرا في الهاتف)
function closeCamera(){
  camSession++;                       // أي طلب كاميرا ما زال ينتظر الإذن يُلغى عند وصوله
  camOverlay.classList.remove('open');
  closeFocusTrap();
  camScanning = false;
  if(camDetectTimer){ clearTimeout(camDetectTimer); camDetectTimer = null; }
  if(camVideo.srcObject){ try{ camVideo.srcObject.getTracks().forEach(t => t.stop()); }catch(e){} }
  camVideoTrack = null;
  camDetector = null;
  camVideo.srcObject = null;
}
document.getElementById('employeeScanBtn')?.addEventListener('click', () => openCamera());
document.getElementById('camCloseBtn')?.addEventListener('click', closeCamera);

// ربط كل النوافذ المنبثقة بزر الرجوع
registerBackLayer(document.getElementById('dlgOverlay'), () => closeDialog(false));
registerBackLayer(document.getElementById('loginOverlay'), () => document.getElementById('loginCancel')?.click());
registerBackLayer(document.getElementById('staffLoginOverlay'), () => closeStaffLogin());
registerBackLayer(document.getElementById('camOverlay'), () => closeCamera());

// ---------------------------------------------------------------
initFirebase();

// تحديث دوري لبيانات الأصناف كل 5 دقائق (يشتغل بالخلفية طالما الصفحة مفتوحة)
setInterval(() => { if(itemsLoaded) loadItems(true); loadPhotoIndex(); }, 5 * 60 * 1000);

// تسجيل Service Worker لدعم التثبيت كتطبيق والعمل بدون إنترنت
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('تعذّر تسجيل Service Worker', e));
  });
}



// عارض الصورة بملء الشاشة: تكبير/تصغير بالأزرار، ضغطتين للتكبير، إصبعين للتكبير، وسحب للتحريك
(function(){
  const box = document.getElementById('lightbox'), img = document.getElementById('lbImg');
  let s = 1, x = 0, y = 0, lastFocus = null;
  const pts = new Map(); let startDist = 0, startScale = 1, dragStart = null, lastTap = 0;
  const MIN = 1, MAX = 5;
  function apply(){ img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; }
  function setScale(n){ s = Math.min(MAX, Math.max(MIN, n)); if(s === 1){ x = 0; y = 0; } apply(); }
  window.openLightbox = function(src, alt){
    lastFocus = document.activeElement;
    img.src = src; img.alt = alt || ''; s = 1; x = 0; y = 0; apply();
    box.hidden = false; document.body.style.overflow = 'hidden';
    document.getElementById('lbClose').focus();
  };
  function close(){ box.hidden = true; document.body.style.overflow = ''; img.removeAttribute('src'); if(lastFocus) lastFocus.focus(); }
  document.getElementById('lbClose').addEventListener('click', close);
  registerBackLayer(box, close, () => !box.hidden);
  document.getElementById('lbIn').addEventListener('click', () => setScale(s * 1.5));
  document.getElementById('lbOut').addEventListener('click', () => setScale(s / 1.5));
  document.getElementById('lbReset').addEventListener('click', () => setScale(1));
  document.addEventListener('keydown', e => { if(!box.hidden && e.key === 'Escape') close(); });
  box.addEventListener('wheel', e => { e.preventDefault(); setScale(s * (e.deltaY < 0 ? 1.15 : 1/1.15)); }, { passive:false });
  img.addEventListener('pointerdown', e => {
    img.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pts.size === 2){ const [a,b] = [...pts.values()]; startDist = Math.hypot(a.x-b.x, a.y-b.y); startScale = s; dragStart = null; }
    else { dragStart = { px:e.clientX, py:e.clientY, x, y };
      const now = Date.now(); if(now - lastTap < 300){ setScale(s > 1 ? 1 : 2.5); dragStart = null; } lastTap = now; }
    img.classList.add('dragging');
  });
  img.addEventListener('pointermove', e => {
    if(!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pts.size === 2 && startDist){ const [a,b] = [...pts.values()]; setScale(startScale * Math.hypot(a.x-b.x, a.y-b.y) / startDist); }
    else if(dragStart && s > 1){ x = dragStart.x + (e.clientX - dragStart.px); y = dragStart.y + (e.clientY - dragStart.py); apply(); }
  });
  function up(e){ pts.delete(e.pointerId); if(pts.size < 2) startDist = 0; if(!pts.size){ dragStart = null; img.classList.remove('dragging'); } }
  img.addEventListener('pointerup', up); img.addEventListener('pointercancel', up);
  box.addEventListener('click', e => { if(e.target === box) close(); });
  document.addEventListener('click', e => {
    const btn = e.target.closest('#icPhotoBtn'); if(!btn) return;
    const im = btn.querySelector('img'); if(im) openLightbox(im.src, im.alt);
  });
})();

// =====================================================================
// البقاء في نفس الشاشة بعد تحديث الصفحة
// =====================================================================
// نحفظ الشاشة الحالية (ومعها التصنيف ونص البحث والصنف المفتوح) في sessionStorage،
// وعند تحديث الصفحة نعيد فتحها بدل الرجوع للواجهة الرئيسية. sessionStorage يخص
// هذا التبويب فقط ويُمسح بإغلاقه. الشاشات المحمية لا تُسترجع إلا بصلاحيتها:
// الموظف = دخل بحسابه (أو جهاز معتمد) في هذا التبويب، الإدارة = دخول Firebase ما زال قائمًا.
(function(){
  const KEY = 'jadu_nav_v1', EMP_OK = 'jadu_emp_ok';
  const OVERLAYS = ['photo-upload', 'photo-approvals', 'share-cart'];
  // شاشات الإدارة الفرعية -> الزر الذي يفتحها من قائمة الإدارة
  const ADMIN_BTN = {
    'admin-overview': '#adminOverviewBtn', 'admin-capital': '#adminCapitalBtn',
    'admin-pricelist': '#adminPriceListBtn', 'admin-pricelog': '#adminPriceLogBtn',
    'admin-photos': '#adminPhotosBtn',
    'att-admin': '#adminAttBtn', 'admin-qr': '#adminQrBtn'
  };
  const ss = {
    get(k){ try { return JSON.parse(sessionStorage.getItem(k)); } catch(e){ return null; } },
    set(k, v){ try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  };
  let restoring = false, lastBase = ss.get(KEY);

  function activeView(){ const v = document.querySelector('.view.active'); return v ? v.id.replace(/^view-/, '') : 'gate'; }
  function snapshot(){
    if (restoring) return;
    const view = activeView();
    if (view === 'gate') { ss.set(KEY, null); ss.set(EMP_OK, null); lastBase = null; return; }
    const input = document.getElementById('employeeSearchInput');
    const base = {
      view, step: employeeStep, role: currentViewerRole, entry: employeeEntryPoint,
      cat: CATEGORY_GROUPS.findIndex(g => g.values === activeCategoryValues),
      q: input ? input.value : '', item: currentItem ? currentItem.number : null, qr: !!currentDetailQr,
      y: Math.round(window.scrollY || 0)
    };
    if (OVERLAYS.includes(view)) {
      if (!lastBase || OVERLAYS.includes(lastBase.view)) return;
      ss.set(KEY, Object.assign({}, lastBase, { overlay: view }));
      return;
    }
    // شاشات أعمق من التي نعرف كيف نفتحها (أقسام الحضور الداخلية...) تُحفظ بأقرب شاشة أب
    if (/^att-/.test(view) && view !== 'att-admin' && view !== 'att-emp') base.view = 'att-admin';   // شاشات الحضور الإدارية الداخلية
    if (view === 'att-emp') base.role = 'employee';
    lastBase = base; ss.set(KEY, base);
  }
  ['pagehide', 'beforeunload'].forEach(ev => window.addEventListener(ev, snapshot));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') snapshot(); });
  window.addEventListener('popstate', () => setTimeout(snapshot, 0));
  document.querySelectorAll('.view').forEach(v => new MutationObserver(() => setTimeout(snapshot, 0)).observe(v, { attributes: true, attributeFilter: ['class'] }));

  function adminReady(){
    return new Promise(res => {
      if (typeof auth === 'undefined' || !auth) return res(false);
      let done = false;
      const finish = ok => { if (!done) { done = true; res(ok); } };
      const off = auth.onAuthStateChanged(u => { finish(!!(u && isAdminEmail(u.email))); try { off(); } catch(e){} });
      setTimeout(() => finish(!!(auth.currentUser && isAdminEmail(auth.currentUser.email))), 5000);
    });
  }
  const click = sel => { const b = document.querySelector(sel); if (b) b.click(); return !!b; };

  async function restore(){
    if (DEEP_LINK_ITEM) return; // الرابط المباشر له الأولوية على الشاشة المحفوظة (يعالجه الكود في آخر الملف)
    const s = ss.get(KEY);
    if (!s || !s.view || s.view === 'gate') return;
    const isAdminView = s.view === 'admin' || !!ADMIN_BTN[s.view] || (s.view === 'employee' && s.entry === 'admin');
    if (isAdminView) {
      if (IS_CUSTOMER_PAGE || !(await adminReady())) return;
    } else if ((s.view === 'employee' || s.view === 'att-emp') && s.role === 'employee') {
      if (IS_CUSTOMER_PAGE || !ss.get(EMP_OK)) return;
    } else if (!(s.view === 'employee' && s.role === 'customer')) {
      return; // شاشة لا نعرف كيف نسترجعها بأمان — نبقى في الرئيسية
    }
    if (activeView() !== 'gate') return; // المستخدم تحرّك بنفسه أثناء الانتظار

    restoring = true;
    try {
      if (s.view === 'att-emp') {
        // حضور الموظف: نرجع لقسم الموظف ثم نفتح شاشة الحضور (تجلب آخر بيانات من الخادم، فيظهر أي اعتماد من الإدارة)
        currentViewerRole = 'employee'; employeeEntryPoint = 'gate'; activeCategoryValues = null;
        showView('employee'); try { loadItems(); } catch(e){} goEmployeeStep('category');
        if (window.JaduAttendance) window.JaduAttendance.openEmployeeView();
      } else if (s.view === 'employee') {
        if (s.entry === 'admin') showView('admin');
        currentViewerRole = s.role; employeeEntryPoint = s.entry;
        activeCategoryValues = s.cat >= 0 ? CATEGORY_GROUPS[s.cat].values : null;
        showView('employee'); try { loadItems(); } catch(e){} goEmployeeStep('category');
        if (s.step === 'search' || s.step === 'detail') {
          document.getElementById('employeeSearchInput').value = s.q || '';
          goEmployeeStep('search'); renderResults();
          if (s.step === 'detail' && s.item && ITEMS.some(it => it.number === s.item)) openItemDetail(s.item, { qr: !!s.qr });
        }
      } else {
        showView('admin');
        if (s.view !== 'admin') click(ADMIN_BTN[s.view]);
      }
    } finally { restoring = false; }

    lastBase = Object.assign({}, s); delete lastBase.overlay;
    if (s.overlay === 'share-cart') click('#shareCartOpen');
    else if (s.overlay && window.JADU_PU) {
      const role = await window.JADU_PU.ready;
      if (role !== 'none' && activeView() === lastBase.view) {
        if (s.overlay === 'photo-upload') window.JADU_PU.openUpload();
        else if (s.overlay === 'photo-approvals' && role === 'admin') window.JADU_PU.openApprovals();
      }
    }
    if (!s.overlay && s.y) requestAnimationFrame(() => setTimeout(() => window.scrollTo(0, s.y), 60));
    snapshot();
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(restore, 0));
})();

// =====================================================================
// الرابط المباشر للصنف (?item=رقم)
// - هاتف معتمد في ورقة «الأجهزة» (Apps Script)، أو دخول الإدارة بالإيميل: شاشة الموظف على الصنف مباشرة بلا PIN
// - غير ذلك: شاشة الزبون على الصنف
// - بعد الفتح يُنظَّف الرابط بـ history.replaceState فلا يعيد التحديث فتحه
// =====================================================================
// تشخيص الرابط المباشر: كل خطوة تُسجَّل في sessionStorage (تبقى عبر التحويلات بين index و staff)
// ?debug=1 يعرض لوحة بالخطوات على الشاشة، ويمرّر debug=1 مع كل تحويل. بدونه يبقى التسجيل صامتًا.
const DL_DEBUG = LINK_PARAMS.get('debug') === '1';
const DL_TRACE_KEY = 'jadu_dl_trace';
function dlTrace(){
  try { return JSON.parse(sessionStorage.getItem(DL_TRACE_KEY) || '[]'); } catch(e){ return []; }
}
function dlLog(step, data){
  try {
    const arr = dlTrace();
    arr.push({ t: new Date().toISOString().slice(11, 19), page: IS_CUSTOMER_PAGE ? 'index' : 'staff', step, data: data == null ? '' : String(data).slice(0, 300) });
    sessionStorage.setItem(DL_TRACE_KEY, JSON.stringify(arr.slice(-80)));
  } catch(e){}
  if(DL_DEBUG) dlRenderPanel();
}
function dlRenderPanel(){
  let p = document.getElementById('dlDebugPanel');
  if(!p){
    p = document.createElement('div'); p.id = 'dlDebugPanel';
    p.setAttribute('dir', 'ltr');
    p.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;background:#111;color:#9f9;font:11px/1.4 monospace;padding:6px 8px;z-index:99999;white-space:pre-wrap;word-break:break-all;opacity:.95';
    document.body.appendChild(p);
  }
  p.textContent = 'DEEPLINK TRACE (debug=1)\n' + dlTrace().map(e => e.t + ' [' + e.page + '] ' + e.step + (e.data ? ' :: ' + e.data : '')).join('\n');
}
// الرابط الجديد (بدون from) يبدأ سجلًا نظيفًا
if(DEEP_LINK_ITEM && !LINK_PARAMS.get('from')){ try { sessionStorage.removeItem(DL_TRACE_KEY); } catch(e){} }
// وسم التحويلات: يحمل item و debug معه، ويعرف الصفحة التي حوّلت منها
function dlHref(page, extra){
  let h = page + '?item=' + encodeURIComponent(DEEP_LINK_ITEM) + '&from=' + (IS_CUSTOMER_PAGE ? 'index' : 'staff');
  if(DL_DEBUG) h += '&debug=1';
  return h + (extra || '');
}

(function deepLink(){
  if(!DEEP_LINK_ITEM) return;
  const num = DEEP_LINK_ITEM;
  let veil = null;
  // مراقبة: أي عودة للشاشة الرئيسية أثناء فتح الصنف تُسجَّل مع مصدرها (سبب «يختفي الصنف ويظهر الرئيسية»)
  let dlWatch = false;
  const _showView = showView;
  showView = function(id){
    if(dlWatch && id === 'gate') dlLog('showView(gate)', (new Error().stack || '').split('\n').slice(2, 5).map(s => s.trim()).join(' | '));
    return _showView(id);
  };
  const _applyNavState = applyNavState;
  applyNavState = function(state){
    if(dlWatch && (!state || state.view === 'gate')) dlLog('popstate->gate', JSON.stringify(state || null));
    return _applyNavState(state);
  };
  function showVeil(){
    veil = document.createElement('div'); veil.id = 'deepLinkVeil'; veil.setAttribute('role', 'status');
    veil.innerHTML = '<span class="spinner"></span> جارِ فتح الصنف…';
    document.body.appendChild(veil);
  }
  function hideVeil(){ if(veil){ veil.remove(); veil = null; } }
  function cleanUrl(){
    try {
      const u = new URL(location.href);
      u.searchParams.delete('item'); u.searchParams.delete('as'); u.searchParams.delete('from');
      if(!DL_DEBUG) u.searchParams.delete('debug'); // debug يبقى ظاهرًا مع التشخيص فقط
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch(e){}
  }
  // أثر دخول إدارة سابق على هذا المتصفح (للتحويل السريع فقط — صفحة الموظف تتحقق فعليًا بنفسها)
  function adminHint(){
    // المفتاح الذي نكتبه بأنفسنا عند دخول الإدارة (مضمون، لا يعتمد على صيغة مفاتيح Firebase الداخلية)
    try {
      const hint = localStorage.getItem(ADMIN_HINT_KEY);
      if(hint && isAdminEmail(hint)){ dlLog('adminHint', 'jadu_admin_hint=' + hint); return true; }
    } catch(e){}
    try {
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.indexOf('firebase:authUser:') === 0){
          const v = JSON.parse(localStorage.getItem(k) || 'null');
          if(v && isAdminEmail(v.email)) return true;
        }
      }
    } catch(e){}
    return false;
  }
  async function deviceApproved(){
    let id = '';
    try { id = localStorage.getItem('jadu_att_device') || ''; } catch(e){}
    if(id.length < 8) return false;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(DEEPLINK_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'device_check', deviceId: id }), signal: ctl.signal });
      const b = await res.json();
      return !!(b && b.ok && b.data && b.data.ok);
    } catch(e){ return false; } finally { clearTimeout(t); }
  }
  function adminAuthed(){
    return new Promise(resolve => {
      if(typeof auth === 'undefined' || !auth){ dlLog('adminAuthed: no auth SDK on this page'); return resolve(false); }
      if(auth.currentUser) return resolve(isAdminEmail(auth.currentUser.email)); // جاهز فورًا، لا ننتظر الـcallback
      let done = false;
      const fin = ok => { if(!done){ done = true; resolve(ok); } };
      const off = auth.onAuthStateChanged(u => { fin(!!(u && isAdminEmail(u.email))); try { off(); } catch(e){} });
      setTimeout(() => fin(!!(auth.currentUser && isAdminEmail(auth.currentUser.email))), 5000);
    });
  }
  async function openAs(role){
    currentViewerRole = role; employeeEntryPoint = 'gate'; activeCategoryValues = null;
    showView('employee'); loadItems();
    const t0 = Date.now(); let found = null;
    // ننتظر تحميل البيانات: الصنف قد يكون جديدًا وغير موجود بالنسخة المحفوظة، فلا نحكم بعدم وجوده قبل انتهاء الجلب
    while(Date.now() - t0 < 20000){
      found = ITEMS.find(it => String(it.number) === num) || null;
      if(found || !itemsFetching) break;
      await new Promise(r => setTimeout(r, 120));
    }
    if(!found) found = ITEMS.find(it => String(it.number) === num) || null;
    dlLog('openAs(' + role + '): items=' + ITEMS.length + ' found=' + !!found + ' waited=' + (Date.now() - t0) + 'ms');
    const input = document.getElementById('employeeSearchInput'); if(input) input.value = '';
    goEmployeeStep('search'); renderResults();
    hideVeil();
    if(found) openItemDetail(found.number, { qr: true });
    else if(!ITEMS.length) showAlert('تعذّر تحميل بيانات الأصناف الآن. تأكد من الإنترنت وحاول مرة أخرى.', { title: 'تعذّر فتح الصنف' });
    else showAlert('الصنف رقم ' + num + ' غير موجود. يمكنك البحث عنه من هنا.', { title: 'الصنف غير موجود' });
    dlLog('openAs done: detailShown=' + !!(found && currentItem && currentItem.number === found.number) + ' view=' + ((document.querySelector('.view.active') || {}).id || 'none'));
    cleanUrl();
  }
  async function run(){
    dlWatch = true;
    dlLog('start', 'page=' + (IS_CUSTOMER_PAGE ? 'index' : 'staff') + ' item=' + num + ' from=' + (LINK_PARAMS.get('from') || '-') + ' as=' + (LINK_PARAMS.get('as') || '-'));
    showVeil();
    try {
      if(IS_CUSTOMER_PAGE){
        if(DEEP_LINK_FORCE_CUSTOMER){ dlLog('index: forced customer (as=customer)'); }
        else {
          const hint = adminHint();
          const dev = hint ? false : await deviceApproved();
          dlLog('index: admin=' + hint + ' device=' + dev);
          if(hint || dev){
            dlLog('index->staff');
            location.replace(dlHref('staff.html')); return;
          }
        }
        await openAs('customer');
      } else {
        // صفحة الموظف: بيانات الموظف (الكميات، رفع الصور، السلة) تشترط دائمًا حساب Firebase (مدير أو حكيم/أنس).
        // الهاتف المعتمد في ورقة «الأجهزة» وحده لا يكفي: يرى الصنف كزبون، وتُفتح فوقه نافذة دخول الموظف.
        const adm = await adminAuthed();
        // adminAuthed انتظر استقرار حالة الدخول، فحساب الموظف (إن وُجد) جاهز الآن
        const stf = adm ? false : staffSignedIn();
        const dev = (adm || stf) ? false : await deviceApproved();
        dlLog('staff: admin=' + adm + ' staff=' + stf + ' device=' + dev + ' authUser=' + ((auth && auth.currentUser && auth.currentUser.email) || 'none'));
        const asEmployee = async () => {
          if (staffSignedIn()) setEmpVia('account');
          try { sessionStorage.setItem('jadu_emp_ok', '1'); } catch(e){}
          await openAs('employee');
        };
        if (adm || stf) {
          await asEmployee();
        } else if (dev) {
          // هاتف معتمد بلا حساب: الصنف فورًا بعرض الزبون (متوفر/غير متوفر + القطاعي)، ونافذة الدخول فوقه.
          // نجاح الدخول يعيد فتح الصنف نفسه بعرض الموظف؛ «رجوع» يُبقيه على عرض الزبون.
          dlLog('staff: approved device, no account -> customer view + staff login');
          await openAs('customer');
          if (openStaffLogin()) staffLoginThen = () => { asEmployee(); };
        } else {
          dlLog('staff->index (as=customer)');
          location.replace(dlHref('index.html', '&as=customer')); return;
        }
      }
    } catch(e){ dlLog('ERROR', (e && (e.message || e)) || 'unknown'); console.warn('تعذّر فتح الرابط المباشر', e); hideVeil(); cleanUrl(); }
    // بعد انتهاء الفتح: مراقبة قصيرة أخيرة لأي عودة للرئيسية ثم إيقافها
    setTimeout(() => { dlWatch = false; dlLog('done'); }, 4000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
