// =====================================================================
// الحضور والانصراف — واجهة الموظف والإدارة العامة (صفحة staff.html)
// ---------------------------------------------------------------------
// السجلات تُحفظ في ملف جوجل شيت عبر Google Apps Script (apps-script/).
// إذا كان ATT_API_URL فارغًا يشتغل القسم بوضع تجريبي ببيانات وهمية
// داخل المتصفح فقط — مفيد للمعاينة قبل ربط الشيت.
// =====================================================================
(function(){
"use strict";

const ATT_API_URL = "";   // رابط تطبيق الويب من Apps Script (ينتهي بـ /exec)
const ATT_SHEET_URL = ""; // رابط ملف جوجل شيت (لزر "فتح الشيت" عند الإدارة)
const DEMO = !ATT_API_URL;
const LS_EMP = "jadu_att_emp";
const LS_LOG_SEEN = "jadu_att_log_seen";

const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const pad = n => (n < 10 ? "0" : "") + n;
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const firstName = n => String(n || "").split(" ")[0];
const shortDate = s => { const p = s.split("-"); return attDayName(s) + " " + Number(p[2]) + "/" + Number(p[1]); };
const fmtDays = n => { n = Math.round(n * 100) / 100; return n === 0 ? "0" : n === 0.5 ? "نصف" : String(n); };

// "حضور 10:30 ص · وقت التسجيل الفعلي 10:45 ص (فرق 15 د)"
function timePair(label, chosen, real){
  if (!chosen) return label + ": —";
  const d = attTimeDiff(chosen, real);
  return label + " " + attFmt12(chosen) + (real && d > 0 ? " · وقت التسجيل الفعلي " + attFmt12(real) + " (فرق " + d + " د)" : "");
}

const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  rules: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  sheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>'
};

// =====================================================================
// الاتصال بالخادم (أو الخادم التجريبي)
// =====================================================================
async function call(action, data){
  data = Object.assign({ action }, data || {});
  if (action.indexOf("admin_") === 0) {
    const u = (typeof auth !== "undefined" && auth) ? auth.currentUser : null;
    if (DEMO) data.adminEmail = (u && u.email) || "islam.aljhani@gmail.com";
    else {
      if (!u) throw new Error("لازم تسجيل دخول الإدارة");
      data.idToken = await u.getIdToken();
    }
  }
  if (action.indexOf("emp_") === 0) {
    const me = getMe();
    if (data.empId === undefined) data.empId = me && me.id;
  }
  if (DEMO) {
    await new Promise(r => setTimeout(r, 180));
    const fn = Mock[action];
    if (!fn) throw new Error("طلب غير معروف");
    return JSON.parse(JSON.stringify(fn(JSON.parse(JSON.stringify(data)))));
  }
  let res;
  try {
    res = await fetch(ATT_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) });
  } catch (e) { throw new Error("لا يوجد اتصال بالإنترنت"); }
  const body = await res.json().catch(() => ({ ok: false, error: "رد غير مفهوم من الخادم" }));
  if (!body.ok) throw new Error(body.error || "حدث خطأ");
  return body.data;
}

function getMe(){ try { return JSON.parse(localStorage.getItem(LS_EMP) || "null"); } catch (e) { return null; } }
function setMe(v){ try { v ? localStorage.setItem(LS_EMP, JSON.stringify(v)) : localStorage.removeItem(LS_EMP); } catch (e) {} }

// =====================================================================
// تحديد الموقع
// =====================================================================
function getLocation(){
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}

// =====================================================================
// بناء الشاشات وإضافتها للصفحة
// =====================================================================
const app = $(".app");
function addView(id, title, bodyId){
  const v = document.createElement("div");
  v.className = "view"; v.id = "view-" + id;
  v.innerHTML = `<div class="back-row"><button class="back-btn att-back" aria-label="رجوع">${ICON.back}</button><h2>${esc(title)}</h2></div>
    ${DEMO ? '<div class="att-demo">وضع تجريبي — بيانات وهمية للمعاينة فقط، لا شيء يُحفظ</div>' : ""}
    <div id="${bodyId}"></div>`;
  app.appendChild(v);
  v.querySelector(".att-back").addEventListener("click", () => history.back());
  return v;
}
addView("att-emp", "الحضور والانصراف", "attEmpBody");
addView("att-admin", "الحضور والانصراف", "attAdminBody");
addView("att-rules", "قواعد الدوام والخصم", "attRulesBody");
addView("att-log", "سجل التعديلات", "attLogBody");
addView("att-staff", "الموظفون", "attStaffBody");
addView("att-person", "سجل الموظف", "attPersonBody");

const overlay = document.createElement("div");
overlay.className = "att-overlay"; overlay.id = "attOverlay";
overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true");
overlay.innerHTML = '<div class="att-sheet" id="attSheet"></div>';
document.body.appendChild(overlay);
overlay.addEventListener("click", e => { if (e.target === overlay) closeSheet(); });
function openSheet(html){
  $("#attSheet").innerHTML = html;
  overlay.classList.add("open");
  if (typeof openFocusTrap === "function") openFocusTrap(overlay);
}
function closeSheet(){
  if (!overlay.classList.contains("open")) return;
  overlay.classList.remove("open");
  if (typeof closeFocusTrap === "function") closeFocusTrap();
}
function alertMsg(msg, title){
  if (typeof showAlert === "function") return showAlert(msg, { title: title || "تنبيه" });
  alert(msg);
}

// بطاقة الحضور أعلى شاشة الموظف
const empCard = document.createElement("button");
empCard.type = "button"; empCard.className = "att-card"; empCard.id = "attEmpCard";
empCard.innerHTML = `<span class="ic">${ICON.clock}</span><span class="tx"><strong>الحضور والانصراف</strong><span id="attEmpCardSub">سجّل حضورك وشاهد سجلك</span></span>${ICON.chev}`;
const catScreen = $("#employeeCategoryScreen");
if (catScreen) catScreen.insertBefore(empCard, catScreen.firstChild);
empCard.addEventListener("click", () => openEmployeeView());

// زر الحضور في قائمة الإدارة العامة
const adminList = $("#view-admin .list");
if (adminList) {
  const label = document.createElement("div");
  label.className = "section-label"; label.style.marginTop = "18px"; label.textContent = "الموظفون";
  const list = document.createElement("div"); list.className = "list";
  list.innerHTML = `<button class="list-btn" id="adminAttBtn">
      <div class="list-icon">${ICON.clock}</div>
      <div class="list-text"><strong>الحضور والانصراف <span class="list-badge" id="attPendingBadge" style="display:none;">0</span></strong><span>الحضور اليومي، الموافقات، التقرير الشهري والقواعد</span></div>${ICON.chev}</button>`;
  adminList.after(label); label.after(list);
  $("#adminAttBtn").addEventListener("click", () => { showView("att-admin"); loadAdmin(); });
}

// =====================================================================
// الموظف
// =====================================================================
let CONFIG = null;     // { employees, rules, now }
let MY = null;         // آخر رد emp_status
async function loadConfig(){
  if (!CONFIG) CONFIG = await call("config");
  return CONFIG;
}

// نافذة "من أنت؟" — مرة واحدة على كل جهاز
function askIdentity(){
  return new Promise(async resolve => {
    let cfg;
    try { cfg = await loadConfig(); } catch (e) { alertMsg(e.message); return resolve(null); }
    openSheet(`<h2>من أنت؟</h2><p>اختر اسمك مرة واحدة على هذا الهاتف، وبعدها يعرفك الموقع تلقائيًا كل يوم.</p>
      <div class="att-field"><label for="attWho">الاسم</label><select id="attWho">${cfg.employees.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("")}</select></div>
      <div class="msg" id="attWhoMsg"></div>
      <div class="att-btns"><button class="att-btn main" id="attWhoOk">متابعة</button><button class="att-btn" id="attWhoCancel">لاحقًا</button></div>`);
    $("#attWhoCancel").onclick = () => { closeSheet(); resolve(null); };
    $("#attWhoOk").onclick = async () => {
      const id = $("#attWho").value, msg = $("#attWhoMsg");
      msg.innerHTML = '<span class="spinner"></span> جارِ التحميل…'; msg.className = "msg";
      try {
        const st = await call("emp_status", { empId: id });
        setMe({ id, name: st.emp.name });
        MY = st; updateEmpCard(); closeSheet(); resolve(st);
      } catch (e) { msg.textContent = e.message; msg.className = "msg err"; }
    };
  });
}

async function refreshMe(){
  const me = getMe();
  if (!me) return null;
  try { MY = await call("emp_status"); updateEmpCard(); return MY; }
  catch (e) {
    if (/غير موجود|موقوف/.test(e.message)) setMe(null);
    throw e;
  }
}

function updateEmpCard(){
  const sub = $("#attEmpCardSub"); if (!sub || !MY) return;
  const t = MY.today;
  if (!t || (!t.inTime && !t.inStatus)) sub.textContent = firstName(MY.emp.name) + " — لم تسجّل حضورك اليوم";
  else if (t.inStatus && !t.inTime) sub.textContent = firstName(MY.emp.name) + " — " + t.inStatus;
  else if (!t.outTime) sub.textContent = firstName(MY.emp.name) + " — حضور " + attFmt12(t.inTime) + (t.inStatus === ATT_STATUS.PENDING ? " (بانتظار الموافقة)" : "");
  else sub.textContent = firstName(MY.emp.name) + " — حضور " + attFmt12(t.inTime) + " · انصراف " + attFmt12(t.outTime);
}

// يُستدعى عند دخول الموظف للتطبيق: يعرض إشعار الحضور أو الانصراف إذا حان وقته
const SNOOZE_KEY = "jadu_att_snooze";
async function onEmployeeEnter(){
  try {
    const cfg = await loadConfig();
    const rules = attMergeRules(cfg.rules);
    const today = todayStr(), now = attToMin(nowHM());
    if (!attIsWorkday(today, rules)) { if (getMe()) refreshMe().catch(() => {}); return; }
    const snooze = Number(sessionStorage.getItem(SNOOZE_KEY) || 0);
    if (Date.now() < snooze) { if (getMe()) refreshMe().catch(() => {}); return; }
    if (now < attToMin(rules.prompt_from)) { if (getMe()) refreshMe().catch(() => {}); return; }
    let st = getMe() ? await refreshMe() : await askIdentity();
    if (!st) return;
    const t = st.today;
    if (!t || (!t.inTime && !t.inStatus)) openCheckIn();
    else if (t.inTime && !t.outTime && now >= attToMin(rules.work_end)) openCheckOut();
  } catch (e) { console.warn("الحضور:", e); }
}
// أثناء فتح التطبيق: تذكير بالانصراف عند نهاية الدوام
setInterval(() => {
  if (!MY || !CONFIG || overlay.classList.contains("open")) return;
  const active = $(".view.active");
  if (!active || !/view-(employee|att-emp)/.test(active.id)) return;
  const rules = attMergeRules(CONFIG.rules), t = MY.today;
  if (t && t.inTime && !t.outTime && nowHM() === rules.work_end && !sessionStorage.getItem("jadu_att_out_reminded_" + todayStr())) {
    sessionStorage.setItem("jadu_att_out_reminded_" + todayStr(), "1");
    openCheckOut();
  }
}, 30000);

// نافذة تسجيل الحضور / الانصراف
function openCheckIn(){ openPunch("in"); }
function openCheckOut(){ openPunch("out"); }
function openPunch(kind){
  const rules = attMergeRules((MY && MY.rules) || (CONFIG && CONFIG.rules));
  const name = firstName(MY && MY.emp.name);
  const isIn = kind === "in";
  const opener = isIn && attOpenerFor(todayStr(), rules) === (MY && MY.emp.name);
  const afterClose = !isIn && attToMin(nowHM()) > attToMin(rules.work_end);
  const hour = new Date().getHours();
  const greet = isIn ? (hour < 12 ? "صباح الخير يا " : "أهلًا يا ") + name : "مساء الخير يا " + name;
  openSheet(`<h2>${esc(greet)}</h2>
    <p>${isIn ? "هل تريد تسجيل حضورك الآن؟" : "هل تريد تسجيل انصرافك الآن؟"}</p>
    <div class="att-field"><label for="attTime">${isIn ? "وقت الحضور" : "وقت الانصراف"}</label>
      <input type="time" id="attTime" value="${nowHM()}">
      <div class="att-hint">الوقت الحالي مكتوب تلقائيًا، ويمكنك تعديله. وقت التسجيل الفعلي يُحفظ معه ويظهر للإدارة.</div></div>
    ${isIn ? `<label class="att-check"><input type="checkbox" id="attAllow" ${opener ? "disabled" : ""}><span>استخدام السماح الشهري (حتى ${rules.allowance_max} دقيقة)
      <small>${opener ? "لا يُطبَّق اليوم لأنك مسؤول فتح المحل" : "بشرط أنك أبلغت المسؤول مسبقًا، ومرة واحدة في الشهر"}</small></span></label>` : ""}
    ${afterClose ? `<label class="att-check"><input type="checkbox" id="attStay"><span>بقيت بعد الإغلاق لخدمة زبون أو عمل فعلي
      <small>تُحتسب لك نقاط بعد موافقة الإدارة</small></span></label>` : ""}
    <div class="att-field"><label for="attNote">ملاحظة (اختياري)</label><input type="text" id="attNote" maxlength="200" placeholder="${isIn ? "مثال: أبلغت المسؤول بالتأخير" : "مثال: زبون حتى 8:20"}"></div>
    <div class="att-loc wait" id="attLoc">${ICON.pin}<span>جارِ تحديد موقعك…</span></div>
    <div class="msg" id="attPunchMsg"></div>
    <div class="att-btns"><button class="att-btn main" id="attPunchOk">${isIn ? "تسجيل الحضور" : "تسجيل الانصراف"}</button><button class="att-btn" id="attPunchLater">لاحقًا</button></div>`);
  let loc, locDone = false;
  const locPromise = getLocation().then(l => {
    loc = l; locDone = true;
    const el = $("#attLoc"); if (!el) return l;
    if (!l) { el.className = "att-loc bad"; el.lastElementChild.textContent = "لم يُسمح بتحديد الموقع — سيُسجَّل بانتظار موافقة الإدارة"; }
    else {
      const d = attDistance(l.lat, l.lng, rules.shop_lat, rules.shop_lng);
      const inside = d <= rules.radius_m;
      el.className = "att-loc " + (inside ? "ok" : "bad");
      el.lastElementChild.textContent = inside ? `أنت داخل نطاق المحل (${d} م)` : `أنت خارج نطاق المحل (${d} م) — سيُسجَّل بانتظار موافقة الإدارة`;
    }
    return l;
  });
  $("#attPunchLater").onclick = () => { sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + 30 * 60000)); closeSheet(); };
  $("#attPunchOk").onclick = async () => {
    const btn = $("#attPunchOk"), msg = $("#attPunchMsg");
    const time = $("#attTime").value;
    if (!/^\d{2}:\d{2}$/.test(time)) { msg.textContent = "اختر الوقت"; msg.className = "msg err"; return; }
    btn.disabled = true;
    msg.innerHTML = '<span class="spinner"></span> ' + (locDone ? "جارِ التسجيل…" : "ننتظر تحديد الموقع…"); msg.className = "msg";
    await locPromise;
    const payload = { time, note: $("#attNote").value };
    if (loc) { payload.lat = loc.lat; payload.lng = loc.lng; payload.acc = loc.acc; }
    if (isIn) payload.allowance = !!($("#attAllow") && $("#attAllow").checked);
    else payload.stay = !!($("#attStay") && $("#attStay").checked);
    try {
      const r = await call(isIn ? "emp_checkin" : "emp_checkout", payload);
      showPunchResult(kind, r);
      refreshMe().then(() => { if ($("#view-att-emp").classList.contains("active")) renderEmployee(); }).catch(() => {});
    } catch (e) { msg.textContent = e.message; msg.className = "msg err"; btn.disabled = false; }
  };
}

function showPunchResult(kind, r){
  const word = kind === "in" ? "حضورك" : "انصرافك";
  let html;
  if (r.status === ATT_STATUS.PENDING) {
    const outside = r.reasons.some(x => /خارج النطاق|الموقع/.test(x));
    html = `<div class="att-alert warn"><b>بانتظار موافقة الإدارة</b>
      ${outside ? `تم تسجيل ${word} خارج نطاق الشركة${r.distance !== null && r.distance !== undefined ? " (" + r.distance + " م)" : ""}.` : `تم تسجيل ${word}.`}
      يجب التواصل مع الإدارة فورًا للموافقة عليه في نفس اليوم.</div>
      <p style="font-size:12px;color:var(--steel-500);margin:0 0 14px;">السبب: ${esc(r.reasons.join("، "))}</p>`;
  } else {
    html = `<div class="att-alert ok"><b>تم تسجيل ${word}</b>الساعة ${esc(attFmt12(r.time))} — داخل نطاق المحل.</div>`;
  }
  openSheet(html + '<div class="att-btns"><button class="att-btn main" id="attResOk">حسنًا</button></div>');
  $("#attResOk").onclick = closeSheet;
}

async function openEmployeeView(){
  showView("att-emp");
  const body = $("#attEmpBody");
  if (!getMe()) {
    body.innerHTML = '<div class="att-empty">اختر اسمك أولًا</div>';
    const st = await askIdentity();
    if (!st) { body.innerHTML = '<div class="att-empty">لم يتم اختيار الموظف</div><div class="att-btns"><button class="att-btn main" id="attPickAgain">اختيار الموظف</button></div>';
      $("#attPickAgain").onclick = openEmployeeView; return; }
  } else body.innerHTML = '<div class="att-empty"><span class="spinner"></span> جارِ التحميل…</div>';
  try { await loadConfig(); await refreshMe(); renderEmployee(); }
  catch (e) { body.innerHTML = `<div class="att-empty">${esc(e.message)}</div>`; }
}

function catPill(r){
  if (r.inStatus === ATT_STATUS.PENDING || r.outStatus === ATT_STATUS.PENDING || r.pending) return '<span class="att-pill info">بانتظار الموافقة</span>';
  if (r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.REJECTED) return `<span class="att-pill bad">${esc(r.cat || "غياب")}</span>`;
  if (r.inStatus === ATT_STATUS.ABSENT_EXCUSED) return '<span class="att-pill mute">غياب بعذر</span>';
  if (r.cat === "منتظم") return '<span class="att-pill ok">منتظم</span>';
  if (r.cat === "سماح شهري" || r.cat === "عذر طارئ") return `<span class="att-pill mute">${esc(r.cat)}</span>`;
  if (!r.cat) return "";
  return `<span class="att-pill ${r.deduct > 0 ? "bad" : "warn"}">${esc(r.cat)}</span>`;
}

function renderEmployee(){
  const body = $("#attEmpBody"); if (!MY) return;
  const rules = attMergeRules(MY.rules);
  const s = MY.summary || { deduct: 0, points: 0, t2: 0, t3: 0, t4: 0, pending: 0 };
  const t = MY.today;
  const workday = attIsWorkday(todayStr(), rules);
  let todayHtml;
  if (!workday) todayHtml = '<div class="att-empty" style="padding:6px">اليوم عطلة</div>';
  else if (!t || (!t.inTime && !t.inStatus)) todayHtml = `<p style="margin:0;font-size:13px;color:var(--steel-500)">لم تسجّل حضورك اليوم بعد.</p><div class="att-btns"><button class="att-btn main" id="attDoIn">تسجيل الحضور</button></div>`;
  else if (!t.inTime) todayHtml = `<p style="margin:0;font-size:13px">${catPill(t)}</p>`;
  else todayHtml = `<div class="att-row" style="border:none;padding:0"><div class="l"><b>حضور ${esc(attFmt12(t.inTime))}${t.outTime ? " · انصراف " + esc(attFmt12(t.outTime)) : ""}</b>
      ${t.pending ? `<small>${esc(t.pending)}</small>` : ""}</div><div class="r">${catPill(t)}</div></div>
      ${!t.outTime ? '<div class="att-btns"><button class="att-btn main" id="attDoOut">تسجيل الانصراف</button></div>' : ""}`;
  const rows = MY.records.slice().reverse().map(r => `
    <div class="att-row"><div class="l"><b>${esc(shortDate(r.date))}</b>
      <small>${r.inTime ? `<span class="times">${esc(attFmt12(r.inTime))}${r.outTime ? " – " + esc(attFmt12(r.outTime)) : ""}</span>` : ""}
      ${r.inDiff ? " · سُجّل فعليًا " + esc(attFmt12(r.inReal)) : ""}${r.lateMin ? " · تأخير " + r.lateMin + " د" : ""}${r.deduct ? " · خصم " + fmtDays(r.deduct) + " يوم" : ""}${r.points ? " · +" + r.points + " نقطة" : ""}</small>
      ${r.pending ? `<small style="color:#9DB8FF">${esc(r.pending)}</small>` : ""}
      ${r.inTime ? `<button class="att-link" data-edit="${esc(r.id)}">طلب تعديل الوقت</button>` : ""}</div>
      <div class="r">${catPill(r)}</div></div>`).join("");
  body.innerHTML = `
    <div class="att-row" style="border:none;padding:0 0 12px"><div class="l"><b style="font-size:15px">${esc(MY.emp.name)}</b><small>${esc(attMonthTitle(MY.month))}</small></div>
      <div class="r"><button class="att-link" id="attNotMe">لست ${esc(firstName(MY.emp.name))}؟</button></div></div>
    <div class="att-box"><h3>اليوم <span class="sub">${esc(shortDate(todayStr()))}</span></h3>${todayHtml}</div>
    <div class="att-stats">
      <div class="att-stat"><span class="k">خصم الشهر</span><span class="v">${fmtDays(s.deduct)} <small>يوم</small></span></div>
      <div class="att-stat"><span class="k">النقاط</span><span class="v">${s.points}</span></div>
      <div class="att-stat"><span class="k">مرات التأخير</span><span class="v">${s.t2 + s.t3 + s.t4}</span></div>
      <div class="att-stat"><span class="k">بانتظار الموافقة</span><span class="v">${s.pending}</span></div>
    </div>
    <div class="att-box"><h3>سجل الشهر</h3>${rows || '<div class="att-empty">لا توجد سجلات بعد</div>'}</div>`;
  $("#attDoIn") && ($("#attDoIn").onclick = openCheckIn);
  $("#attDoOut") && ($("#attDoOut").onclick = openCheckOut);
  $("#attNotMe").onclick = async () => {
    setMe(null); MY = null; $("#attEmpCardSub").textContent = "سجّل حضورك وشاهد سجلك";
    openEmployeeView();
  };
  body.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEditRequest(MY.records.find(r => r.id === b.dataset.edit)));
}

function openEditRequest(r){
  openSheet(`<h2>طلب تعديل الوقت</h2><p>${esc(shortDate(r.date))} — يبقى الوقت الحالي حتى توافق الإدارة على التعديل.</p>
    <div class="att-field"><label for="attEdField">ماذا تريد أن تعدّل؟</label><select id="attEdField"><option value="in">وقت الحضور (${esc(attFmt12(r.inTime))})</option>${r.outTime ? `<option value="out">وقت الانصراف (${esc(attFmt12(r.outTime))})</option>` : ""}</select></div>
    <div class="att-field"><label for="attEdTime">الوقت الصحيح</label><input type="time" id="attEdTime" value="${esc(r.inTime)}"></div>
    <div class="att-field"><label for="attEdWhy">السبب</label><input type="text" id="attEdWhy" maxlength="200" placeholder="مثال: نسيت التسجيل عند وصولي"></div>
    <div class="msg" id="attEdMsg"></div>
    <div class="att-btns"><button class="att-btn main" id="attEdOk">إرسال للإدارة</button><button class="att-btn" id="attEdCancel">إلغاء</button></div>`);
  $("#attEdField").onchange = () => { $("#attEdTime").value = $("#attEdField").value === "in" ? r.inTime : r.outTime; };
  $("#attEdCancel").onclick = closeSheet;
  $("#attEdOk").onclick = async () => {
    const msg = $("#attEdMsg");
    if (!$("#attEdWhy").value.trim()) { msg.textContent = "اكتب سبب التعديل"; msg.className = "msg err"; return; }
    try {
      await call("emp_edit", { id: r.id, date: r.date, field: $("#attEdField").value, time: $("#attEdTime").value, reason: $("#attEdWhy").value });
      closeSheet(); await refreshMe(); renderEmployee();
      alertMsg("تم إرسال طلب التعديل للإدارة. تواصل معهم للموافقة عليه.", "تم الإرسال");
    } catch (e) { msg.textContent = e.message; msg.className = "msg err"; }
  };
}

// مراقبة دخول الموظف لشاشة الأصناف (بعد إدخال الرمز المشترك)
const empView = $("#view-employee");
let empWasActive = false;
if (empView) new MutationObserver(() => {
  const active = empView.classList.contains("active");
  if (active && !empWasActive && typeof currentViewerRole !== "undefined" && currentViewerRole === "employee") {
    empCard.style.display = "";
    onEmployeeEnter();
  }
  if (active && typeof currentViewerRole !== "undefined" && currentViewerRole !== "employee") empCard.style.display = "none";
  empWasActive = active;
}).observe(empView, { attributes: true, attributeFilter: ["class"] });

// =====================================================================
// الإدارة العامة
// =====================================================================
let ADM = null;
const adminView = $("#view-admin");
if (adminView) new MutationObserver(() => { if (adminView.classList.contains("active")) refreshAdminBadge(); })
  .observe(adminView, { attributes: true, attributeFilter: ["class"] });

function pendingItems(records){
  const out = [];
  records.forEach(r => {
    if (r.inStatus === ATT_STATUS.PENDING || r.outStatus === ATT_STATUS.PENDING || r.pending) out.push({ r, kind: "pending" });
    if (r.inStatus === ATT_STATUS.ABSENT && /سُجّل تلقائيًا/.test(r.note || "")) out.push({ r, kind: "absent" });
    if (/^طلب نقاط/.test(r.stay || "")) out.push({ r, kind: "stay" });
  });
  return out;
}
async function refreshAdminBadge(){
  try {
    const d = await call("admin_month", {});
    const n = pendingItems(d.records).length, b = $("#attPendingBadge");
    if (b) { b.textContent = n; b.style.display = n ? "" : "none"; }
  } catch (e) {}
}

async function loadAdmin(month){
  const body = $("#attAdminBody");
  body.innerHTML = '<div class="att-empty"><span class="spinner"></span> جارِ تحميل البيانات…</div>';
  try { ADM = await call("admin_month", { month: month || (ADM && ADM.month) }); renderAdmin(); }
  catch (e) { body.innerHTML = `<div class="att-empty">${esc(e.message)}</div>`; }
}

function renderAdmin(){
  const body = $("#attAdminBody"), d = ADM, rules = attMergeRules(d.rules);
  const months = d.months.indexOf(d.month) === -1 ? [d.month].concat(d.months) : d.months;
  const pend = pendingItems(d.records);
  const b = $("#attPendingBadge"); if (b && d.month === d.now.date.slice(0, 7)) { b.textContent = pend.length; b.style.display = pend.length ? "" : "none"; }
  const pendHtml = pend.map(({ r, kind }) => {
    let title, sub, btns;
    if (kind === "absent") { title = `${r.emp} — غائب`; sub = shortDate(r.date) + " · لم يسجّل حضوره"; btns = `<button class="att-btn" data-dec="absent_excused" data-id="${r.id}">بعذر</button><button class="att-btn bad" data-dec="absent" data-id="${r.id}">بدون عذر</button>`; }
    else if (kind === "stay") { title = `${r.emp} — بقاء بعد الإغلاق`; sub = shortDate(r.date) + " · انصراف " + attFmt12(r.outTime) + " · " + String(r.stay).replace(/^طلب نقاط: /, "") + (r.note ? " · " + r.note : ""); btns = `<button class="att-btn ok" data-dec="stay_points" data-id="${r.id}">منح ${rules.points_per_stay} نقطة</button><button class="att-btn" data-dec="stay_no" data-id="${r.id}">رفض</button>`; }
    else { title = `${r.emp} — ${r.inStatus === ATT_STATUS.PENDING ? "حضور " + attFmt12(r.inTime) : r.outStatus === ATT_STATUS.PENDING && !/تعديل/.test(r.pending) ? "انصراف " + attFmt12(r.outTime) : "طلب تعديل"}`;
      sub = shortDate(r.date) + (r.opener ? " · مسؤول الفتح" : "") + " · " + timePair("حضور", r.inTime, r.inReal)
        + (r.outTime ? " · " + timePair("انصراف", r.outTime, r.outReal) : "") + " · " + (r.pending || "") + (r.note ? " · " + r.note : "");
      btns = `<button class="att-btn ok" data-dec="approve" data-id="${r.id}">موافقة</button><button class="att-btn bad" data-dec="reject" data-id="${r.id}">رفض</button><button class="att-btn" data-dec="excuse" data-id="${r.id}">عذر طارئ</button>`; }
    return `<div class="att-row" style="display:block"><div class="l"><b>${esc(title)}</b><small>${esc(sub)}</small></div><div class="att-btns">${btns}</div></div>`;
  }).join("");

  const sums = Object.values(d.summary).sort((a, b) => b.points - a.points || a.deduct - b.deduct);
  const sumHtml = sums.map(s => `<div class="att-sum" data-person="${esc(s.emp)}" role="button" tabindex="0"><div class="top"><b>${esc(s.emp)}</b><span class="att-pill ${/متميز/.test(s.rating) ? "ok" : /ملاحظات/.test(s.rating) ? "warn" : "mute"}">${esc(s.rating)}</span></div>
    <div class="nums"><span><b>${s.present}</b>أيام حضور</span><span><b>${fmtDays(s.deduct)}</b>أيام خصم</span><span><b>${s.points}</b>نقاط</span>
      <span><b>${s.t2 + s.t3 + s.t4}</b>تأخيرات</span><span><b>${s.absent}</b>غياب</span><span><b>${s.lateMin}</b>دقائق تأخير</span></div>
    ${s.diffAlert ? `<div class="att-alert warn" style="margin:10px 0 0;padding:10px;font-size:12.5px">${esc(s.diffAlert)}</div>` : ""}
    <div class="att-more">عرض السجل الكامل ‹</div></div>`).join("");
  const alerts = sums.filter(s => s.diffAlert);
  const alertHtml = alerts.length ? `<div class="att-box" style="border-color:rgba(255,184,0,.45)"><h3>ملاحظات للتفحص <span class="att-pill warn">${alerts.length}</span></h3>
    ${alerts.map(s => `<div class="att-row" style="display:block"><div class="l"><b>${esc(s.emp)}</b><small>${esc(s.diffAlert)}</small>
      ${s.diffs.map(x => `<small>• ${esc(shortDate(x.date))}: ${esc(x.inDiff >= x.outDiff ? timePair("حضور", x.inTime, x.inReal) : timePair("انصراف", x.outTime, x.outReal))}</small>`).join("")}</div></div>`).join("")}</div>` : "";

  let unread = 0;
  try { unread = Number(localStorage.getItem(LS_LOG_SEEN + "_n") || 0); } catch (e) {}
  body.innerHTML = `
    <select class="att-month" id="attMonthSel" aria-label="الشهر">${months.map(m => `<option value="${m}" ${m === d.month ? "selected" : ""}>${esc(attMonthTitle(m))}</option>`).join("")}</select>
    ${alertHtml}
    <div class="att-box"><h3>بانتظار الموافقة <span class="att-pill ${pend.length ? "info" : "mute"}">${pend.length}</span></h3>${pendHtml || '<div class="att-empty" style="padding:6px">لا توجد طلبات معلّقة</div>'}</div>
    <div class="att-box"><h3>الحضور اليومي <span class="sub">اضغط على أي يوم للتفاصيل</span></h3>${heatGrid(d, rules)}</div>
    <div class="att-box att-chart"><h3>دقائق التأخير خلال الشهر</h3>${lateChart(d, rules)}</div>
    <div class="att-box"><h3>ملخص الشهر <span class="sub">اضغط على الموظف لكل التفاصيل</span></h3>${sumHtml || '<div class="att-empty">لا توجد سجلات لهذا الشهر</div>'}</div>
    <div class="list">
      <button class="list-btn" id="attGoRules"><div class="list-icon">${ICON.rules}</div><div class="list-text"><strong>قواعد الدوام والخصم</strong><span>أوقات الدوام، النطاق، الخصومات، مسؤول الفتح</span></div>${ICON.chev}</button>
      <button class="list-btn" id="attGoStaff"><div class="list-icon">${ICON.users}</div><div class="list-text"><strong>الموظفون</strong><span>إضافة موظف أو إيقافه</span></div>${ICON.chev}</button>
      <button class="list-btn" id="attGoLog"><div class="list-icon">${ICON.log}</div><div class="list-text"><strong>سجل التعديلات <span class="list-badge" id="attLogBadge" style="display:none">0</span></strong><span>من عدّل ماذا ومتى من حسابات الإدارة</span></div>${ICON.chev}</button>
      ${ATT_SHEET_URL ? `<a class="list-btn" href="${esc(ATT_SHEET_URL)}" target="_blank" rel="noopener" style="text-decoration:none"><div class="list-icon">${ICON.sheet}</div><div class="list-text"><strong>فتح ملف جوجل شيت</strong><span>كل الأشهر في ملف واحد</span></div>${ICON.chev}</a>` : ""}
    </div>`;
  $("#attMonthSel").onchange = e => loadAdmin(e.target.value);
  body.querySelectorAll("[data-person]").forEach(el => {
    const go = () => openPerson(el.dataset.person);
    el.onclick = go; el.onkeydown = e => { if (e.key === "Enter") go(); };
  });
  body.querySelectorAll("[data-dec]").forEach(btn => btn.onclick = () => decide(btn.dataset.id, btn.dataset.dec));
  body.querySelectorAll("td.c[data-id]").forEach(td => td.onclick = () => openRecordAdmin(td.dataset.id));
  body.querySelectorAll("td.c[data-new]").forEach(td => td.onclick = () => openRecordAdmin(null, td.dataset.emp, td.dataset.new));
  $("#attGoRules").onclick = () => { showView("att-rules"); renderRules(); };
  $("#attGoStaff").onclick = () => { showView("att-staff"); renderStaff(); };
  $("#attGoLog").onclick = () => { showView("att-log"); renderLog(); };
  refreshLogBadge();
}

async function reloadAfterChange(){
  if ($("#view-att-person").classList.contains("active")) { ADM = await call("admin_month", { month: ADM.month }); renderPerson(); }
  else loadAdmin();
}
async function decide(id, decision, note){
  const r = ADM.records.find(x => x.id === id);
  const labels = { approve: "الموافقة على", reject: "رفض", excuse: "اعتماد عذر طارئ لـ", absent_excused: "تسجيل غياب بعذر لـ",
                   absent: "تسجيل غياب بدون عذر لـ", stay_points: "منح نقاط البقاء لـ", stay_no: "رفض نقاط البقاء لـ" };
  if (typeof showConfirm === "function" && !(await showConfirm(`${labels[decision]} ${r.emp} — ${shortDate(r.date)}؟\nسيُسجَّل القرار باسمك في سجل التعديلات.`, { title: "تأكيد", okText: "نعم" }))) return;
  try { await call("admin_decide", { month: ADM.month, id, decision, note }); closeSheet(); await reloadAfterChange(); }
  catch (e) { alertMsg(e.message); }
}

// جدول الأيام الملوّن: صف لكل موظف، عمود لكل يوم
function heatGrid(d, rules){
  const [y, m] = d.month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const today = d.now.date;
  const emps = d.employees.filter(e => e.active || d.records.some(r => r.emp === e.name)).map(e => e.name);
  const byKey = {}; d.records.forEach(r => { byKey[r.emp + "|" + r.date] = r; });
  let head = '<tr><th class="name">اليوم</th>';
  for (let i = 1; i <= days; i++) head += `<th>${i}</th>`;
  head += "</tr>";
  const rows = emps.map(name => {
    let tr = `<tr><td class="name" data-person="${esc(name)}" style="cursor:pointer;text-decoration:underline dotted">${esc(firstName(name))}</td>`;
    for (let i = 1; i <= days; i++) {
      const ds = d.month + "-" + pad(i), r = byKey[name + "|" + ds];
      if (!attIsWorkday(ds, rules)) { tr += `<td class="c off" title="عطلة">ع</td>`; continue; }
      if (!r) { tr += ds <= today ? `<td class="c none" data-new="${ds}" data-emp="${esc(name)}" style="cursor:pointer" title="لا يوجد سجل"></td>` : '<td class="c none"></td>'; continue; }
      let cls, txt;
      if (r.inStatus === ATT_STATUS.PENDING || r.outStatus === ATT_STATUS.PENDING || r.pending) { cls = "pend"; txt = r.lateMin ? r.lateMin : "؟"; }
      else if (r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.REJECTED) { cls = "bad"; txt = "غ"; }
      else if (r.inStatus === ATT_STATUS.ABSENT_EXCUSED) { cls = "ex"; txt = "غ"; }
      else if (r.cat === "سماح شهري" || r.cat === "عذر طارئ") { cls = "ex"; txt = r.lateMin || "✓"; }
      else if (r.deduct > 0) { cls = "bad"; txt = r.lateMin; }
      else if (r.lateMin > rules.grace_min) { cls = "t2"; txt = r.lateMin; }
      else { cls = "ok"; txt = r.lateMin ? r.lateMin : "✓"; }
      tr += `<td class="c ${cls}${r.bigDiff ? " diff" : ""}" data-id="${esc(r.id)}" title="${esc((r.cat || "") + (r.bigDiff ? " — الوقت المختار يختلف عن وقت التسجيل الفعلي" : ""))}">${txt}</td>`;
    }
    return tr + "</tr>";
  }).join("");
  return `<div class="att-heat-wrap"><table class="att-heat">${head}${rows}</table></div>
    <div class="att-legend"><span><i style="background:rgba(111,207,142,.5)"></i>منتظم (الرقم = دقائق التأخير)</span><span><i style="background:rgba(255,184,0,.55)"></i>تأخير بدون خصم</span>
      <span><i style="background:rgba(255,107,94,.6)"></i>خصم أو غياب (غ)</span><span><i style="background:rgba(120,160,255,.55)"></i>بانتظار الموافقة</span><span><i style="background:var(--steel-200)"></i>سماح، عذر، أو غياب بعذر</span><span>ع = عطلة</span><span><i style="background:transparent;box-shadow:inset 0 0 0 2px #FF8A80"></i>وقت مختار يختلف عن وقت التسجيل الفعلي</span></div>`;
}

// مخطط دقائق التأخير: المحور الأفقي أيام الشهر، والعمودي دقائق التأخير
const SERIES_COLORS = ["#4FC3F7", "#FFB74D", "#CE93D8", "#81C784", "#F06292", "#FFF176"];
function lateChart(d, rules, only){
  const [y, m] = d.month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const emps = only ? [only] : [...new Set(d.records.map(r => r.emp))];
  if (!emps.length) return '<div class="att-empty">لا توجد بيانات</div>';
  const W = 340, H = 236, L = 44, R = 10, T = 14, B = 46;
  const maxLate = Math.max(30, ...d.records.map(r => r.lateMin || 0));
  const step = maxLate > 60 ? 30 : 15;
  const yMax = Math.ceil(maxLate / step) * step;
  const x = day => L + (day - 1) * (W - L - R) / Math.max(1, days - 1);
  const yy = v => T + (H - T - B) * (1 - v / yMax);
  let g = "";
  for (let v = 0; v <= yMax; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy(v)}" y2="${yy(v)}"/><text class="num" x="${L - 6}" y="${yy(v) + 3}" text-anchor="end">${v}</text>`;
  [1, 5, 10, 15, 20, 25, days].forEach(dd => { if (dd <= days) g += `<text class="num" x="${x(dd)}" y="${H - B + 14}" text-anchor="middle">${dd}</text>`; });
  // خط حد التأخير المسموح
  g += `<line x1="${L}" x2="${W - R}" y1="${yy(rules.grace_min)}" y2="${yy(rules.grace_min)}" stroke="#FFC94D" stroke-dasharray="5 4" stroke-width="1.2"/>
        <text class="lim" x="${W - R - 2}" y="${yy(rules.grace_min) - 5}" text-anchor="end">حد التأخير المسموح: ${rules.grace_min} دقيقة</text>`;
  let lines = "", legend = "";
  const allEmps = [...new Set(d.records.map(r => r.emp))];
  emps.forEach(name => {
    const col = SERIES_COLORS[Math.max(0, allEmps.indexOf(name)) % SERIES_COLORS.length];
    const pts = d.records.filter(r => r.emp === name && r.lateMin !== null && r.lateMin !== undefined)
      .map(r => ({ day: Number(r.date.slice(8)), v: r.lateMin })).sort((a, b) => a.day - b.day);
    if (pts.length > 1) lines += `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${pts.map(p => x(p.day) + "," + yy(p.v)).join(" ")}"/>`;
    pts.forEach(p => { lines += `<circle cx="${x(p.day)}" cy="${yy(p.v)}" r="3.2" fill="${col}"><title>${esc(name)} — يوم ${p.day}: ${p.v} دقيقة</title></circle>`; });
    legend += `<span><i style="background:${col};border-radius:50%"></i>${esc(name)}</span>`;
  });
  const axes = `<line class="ax" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="ax" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>
    <text class="title" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">المحور الأفقي: أيام الشهر (1 – ${days})</text>
    <text class="title" transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">المحور العمودي: دقائق التأخير (بالدقيقة)</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" direction="ltr" style="direction:ltr" role="img" aria-label="مخطط دقائق التأخير لكل موظف حسب أيام الشهر">${g}${axes}${lines}</svg>
    <div class="att-legend">${legend}</div>
    <div class="att-hint">كل نقطة = يوم حضر فيه الموظف، وارتفاعها = كم دقيقة تأخر بعد ${esc(attFmt12(rules.work_start))}. أيام الغياب والعطلة لا تظهر على الخط.</div>`;
}

// =====================================================================
// سجل موظف واحد — كل التفاصيل للإدارة
// =====================================================================
let PERSON = null;
function openPerson(name){
  PERSON = name;
  showView("att-person");
  renderPerson();
}
function renderPerson(){
  const body = $("#attPersonBody"), d = ADM, name = PERSON;
  if (!d || !name) { body.innerHTML = '<div class="att-empty">افتح الحضور والانصراف أولًا</div>'; return; }
  const rules = attMergeRules(d.rules);
  const s = d.summary[name] || { present: 0, onTime: 0, t2: 0, t3: 0, t4: 0, allowance: 0, excuse: 0, absent: 0, absentExcused: 0, pending: 0, deduct: 0, points: 0, lateMin: 0, diffs: [], diffCount: 0, diffAlert: "", rating: "لا توجد سجلات" };
  const recs = d.records.filter(r => r.emp === name).sort((a, b) => a.date < b.date ? 1 : -1);
  const avgLate = s.present ? Math.round(s.lateMin / s.present) : 0;
  const stays = recs.filter(r => r.stay || (r.outTime && attToMin(r.outTime) - attToMin(rules.work_end) >= 10));
  const openerDays = recs.filter(r => r.opener);
  const openerLate = openerDays.filter(r => (r.lateMin || 0) > rules.grace_min).length;
  const outside = recs.filter(r => (r.inDist !== "" && r.inDist !== undefined && Number(r.inDist) > rules.radius_m) || (r.outDist !== "" && r.outDist !== undefined && Number(r.outDist) > rules.radius_m)).length;
  const deductRows = recs.filter(r => r.deduct > 0);
  const row = r => {
    const isAbs = attIsAbsent(r) && !r.inTime;
    const bits = [];
    if (!isAbs) {
      bits.push(timePair("حضور", r.inTime, r.inReal));
      bits.push(r.outTime ? timePair("انصراف", r.outTime, r.outReal) : "لم يسجّل انصرافه");
      if (r.inDist !== "" && r.inDist !== undefined) bits.push("المسافة " + r.inDist + " م");
      if (r.lateMin) bits.push("تأخير " + r.lateMin + " د");
    }
    if (r.deduct) bits.push("خصم " + fmtDays(r.deduct) + " يوم");
    if (r.points) bits.push("+" + r.points + " نقطة");
    if (r.opener) bits.push("مسؤول الفتح");
    return `<div class="att-row${r.bigDiff ? " att-row-diff" : ""}" data-id="${esc(r.id)}" style="cursor:pointer"><div class="l"><b>${esc(shortDate(r.date))}</b>
      <small>${esc(bits.join(" · "))}</small>
      ${r.flags && r.flags.length ? `<small style="color:#FFC94D">${esc(r.flags.join("، "))}</small>` : ""}
      ${r.pending ? `<small style="color:#9DB8FF">${esc(r.pending)}</small>` : ""}
      ${r.stay ? `<small style="color:#A6E8BC">${esc(r.stay)}</small>` : ""}
      ${r.note ? `<small>ملاحظة: ${esc(r.note)}</small>` : ""}</div>
      <div class="r">${catPill(r)}</div></div>`;
  };
  body.innerHTML = `
    <div class="att-row" style="border:none;padding:0 0 12px"><div class="l"><b style="font-size:16px">${esc(name)}</b><small>${esc(attMonthTitle(d.month))}</small></div>
      <div class="r"><span class="att-pill ${/متميز/.test(s.rating) ? "ok" : /ملاحظات/.test(s.rating) ? "warn" : "mute"}">${esc(s.rating)}</span></div></div>
    ${s.diffAlert ? `<div class="att-alert warn"><b>ملاحظة للإدارة</b>${esc(s.diffAlert)}
      ${s.diffs.map(x => `<br>• ${esc(shortDate(x.date))}: ${esc(x.inDiff >= x.outDiff ? timePair("حضور", x.inTime, x.inReal) : timePair("انصراف", x.outTime, x.outReal))}`).join("")}</div>` : ""}
    <div class="att-stats">
      <div class="att-stat"><span class="k">أيام الحضور</span><span class="v">${s.present}</span></div>
      <div class="att-stat"><span class="k">مجموع الخصم</span><span class="v">${fmtDays(s.deduct)} <small>يوم</small></span></div>
      <div class="att-stat"><span class="k">النقاط</span><span class="v">${s.points}</span></div>
      <div class="att-stat"><span class="k">متوسط التأخير</span><span class="v">${avgLate} <small>دقيقة</small></span></div>
    </div>
    <div class="att-box"><h3>تفصيل الشهر</h3>
      <div class="att-kv">
        <span>منتظم (حتى ${rules.grace_min} د)</span><b>${s.onTime}</b>
        <span>تأخير ${rules.grace_min + 1}–${rules.t2_max} د</span><b>${s.t2} <small>(المسموح ${rules.t2_free})</small></b>
        <span>تأخير ${rules.t2_max + 1}–${rules.t3_max} د</span><b>${s.t3}</b>
        <span>تأخير أكثر من ساعة</span><b>${s.t4}</b>
        <span>سماح شهري مستخدم</span><b>${s.allowance} <small>من ${rules.allowance_per_month}</small></b>
        <span>عذر طارئ</span><b>${s.excuse}</b>
        <span>غياب بدون عذر</span><b>${s.absent}</b>
        <span>غياب بعذر</span><b>${s.absentExcused}</b>
        <span>أيام مسؤول الفتح</span><b>${openerDays.length}${openerLate ? ` <small style="color:var(--warn)">(تأخر ${openerLate})</small>` : ""}</b>
        <span>بقاء بعد الإغلاق (10 د أو أكثر)</span><b>${stays.length}</b>
        <span>تسجيل خارج النطاق</span><b>${outside}</b>
        <span>فرق بين الوقت المختار والفعلي</span><b>${s.diffCount}</b>
        <span>مجموع دقائق التأخير</span><b>${s.lateMin}</b>
        <span>بانتظار الموافقة</span><b>${s.pending}</b>
      </div></div>
    ${deductRows.length ? `<div class="att-box"><h3>سبب الخصومات</h3>${deductRows.map(r => `<div class="att-row"><div class="l"><b>${esc(shortDate(r.date))}</b><small>${esc(r.cat)}${r.flags && r.flags.length ? " · " + esc(r.flags.join("، ")) : ""}</small></div><div class="r"><span class="att-pill bad">${fmtDays(r.deduct)} يوم</span></div></div>`).join("")}</div>` : ""}
    <div class="att-box att-chart"><h3>دقائق التأخير خلال الشهر</h3>${lateChart(d, rules, name)}</div>
    <div class="att-box"><h3>السجل الكامل <span class="sub">اضغط على أي يوم للتعديل</span></h3>${recs.map(row).join("") || '<div class="att-empty">لا توجد سجلات</div>'}</div>`;
  body.querySelectorAll(".att-row[data-id]").forEach(el => el.onclick = () => openRecordAdmin(el.dataset.id));
}

// تفاصيل سجل واحد للإدارة (من الضغط على خانة اليوم)
function openRecordAdmin(id, empName, dateStr){
  const r = id ? ADM.records.find(x => x.id === id) : null;
  if (!r) {
    openSheet(`<h2>${esc(empName)}</h2><p>${esc(shortDate(dateStr))} — لا يوجد سجل لهذا اليوم. سيُسجَّل الغياب تلقائيًا بعد نهاية الدوام، ويمكنك تحديد إن كان بعذر من قائمة الموافقات.</p>
      <div class="att-btns"><button class="att-btn" id="attRecClose">إغلاق</button></div>`);
    $("#attRecClose").onclick = closeSheet; return;
  }
  const isAbs = r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.ABSENT_EXCUSED;
  openSheet(`<h2>${esc(r.emp)}</h2><p>${esc(shortDate(r.date))} — ${catPill(r)}</p>
    <div class="att-box" style="margin-bottom:12px;font-size:13px;line-height:1.9">
      ${isAbs ? `الحالة: ${esc(r.inStatus)}` : `<b>${esc(timePair("حضور", r.inTime, r.inReal))}</b> · ${esc(r.inStatus)}${r.inDist !== "" && r.inDist !== undefined ? ` · ${esc(r.inDist)} م` : ""}<br>
      ${r.outTime ? `<b>${esc(timePair("انصراف", r.outTime, r.outReal))}</b> · ${esc(r.outStatus)}${r.outDist !== "" && r.outDist !== undefined ? ` · ${esc(r.outDist)} م` : ""}` : "انصراف: —"}<br>
      التأخير: ${r.lateMin || 0} دقيقة · الخصم: ${fmtDays(r.deduct)} يوم`}
      ${r.flags && r.flags.length ? `<br><span style="color:#FFC94D">${esc(r.flags.join("، "))}</span>` : ""}
      ${r.pending ? `<br><span style="color:#9DB8FF">${esc(r.pending)}</span>` : ""}
      ${r.note ? `<br>ملاحظة: ${esc(r.note)}` : ""}</div>
    ${!isAbs ? `<label class="att-check"><input type="checkbox" id="attRecOpener" ${r.opener ? "checked" : ""}><span>مسؤول فتح المحل هذا اليوم</span></label>
    <label class="att-check"><input type="checkbox" id="attRecExcuse" ${r.excuse ? "checked" : ""}><span>ظرف طارئ معتمد (بدون خصم)</span></label>
    <label class="att-check"><input type="checkbox" id="attRecAllow" ${r.allowance ? "checked" : ""}><span>سماح شهري</span></label>` : ""}
    <div class="att-grid2"><div class="att-field"><label for="attRecPts">النقاط</label><input type="number" id="attRecPts" min="0" step="1" value="${Number(r.points) || 0}"></div>
      ${isAbs ? `<div class="att-field"><label for="attRecAbs">الغياب</label><select id="attRecAbs"><option value="absent" ${r.inStatus === ATT_STATUS.ABSENT ? "selected" : ""}>بدون عذر</option><option value="absent_excused" ${r.inStatus === ATT_STATUS.ABSENT_EXCUSED ? "selected" : ""}>بعذر</option></select></div>` : "<div></div>"}</div>
    <div class="att-field"><label for="attRecNote">ملاحظة الإدارة</label><input type="text" id="attRecNote" maxlength="300" value="${esc(r.note || "")}"></div>
    <div class="msg" id="attRecMsg"></div>
    <div class="att-btns"><button class="att-btn main" id="attRecSave">حفظ</button><button class="att-btn" id="attRecClose">إغلاق</button></div>`);
  $("#attRecClose").onclick = closeSheet;
  $("#attRecSave").onclick = async () => {
    const fields = { points: Number($("#attRecPts").value) || 0, note: $("#attRecNote").value };
    if (!isAbs) { fields.opener = $("#attRecOpener").checked; fields.excuse = $("#attRecExcuse").checked; fields.allowance = $("#attRecAllow").checked; }
    try {
      await call("admin_update", { month: ADM.month, id: r.id, fields });
      if (isAbs && $("#attRecAbs").value !== (r.inStatus === ATT_STATUS.ABSENT ? "absent" : "absent_excused"))
        await call("admin_decide", { month: ADM.month, id: r.id, decision: $("#attRecAbs").value });
      closeSheet(); await reloadAfterChange();
    } catch (e) { $("#attRecMsg").textContent = e.message; $("#attRecMsg").className = "msg err"; }
  };
}

// ---------------- القواعد ----------------
function renderRules(){
  const body = $("#attRulesBody");
  if (!ADM) { body.innerHTML = '<div class="att-empty">افتح الحضور والانصراف أولًا</div>'; return; }
  const r = attMergeRules(ADM.rules), emps = ADM.employees.filter(e => e.active).map(e => e.name);
  const num = (k, step) => `<div class="att-field"><label for="r_${k}">${esc(ATT_RULE_LABELS[k])}</label><input type="number" id="r_${k}" step="${step || 1}" value="${esc(r[k])}"></div>`;
  const time = k => `<div class="att-field"><label for="r_${k}">${esc(ATT_RULE_LABELS[k])}</label><input type="time" id="r_${k}" value="${esc(r[k])}"></div>`;
  const wd = String(r.workdays).split(",");
  const dayOrder = [6, 0, 1, 2, 3, 4, 5];
  body.innerHTML = `
    <div class="att-box"><div class="att-sec">الدوام</div>
      <div class="att-grid2">${time("work_start")}${time("work_end")}</div>${time("prompt_from")}
      <div class="att-field"><label>أيام العمل</label><div class="att-days">${dayOrder.map(i => `<label><input type="checkbox" data-wd="${i}" ${wd.indexOf(String(i)) !== -1 ? "checked" : ""}>${ATT_DAY_NAMES[i]}</label>`).join("")}</div></div>
    </div>
    <div class="att-box"><div class="att-sec">التأخير والخصم (بالأيام)</div>
      ${num("grace_min")}
      <div class="att-grid2">${num("t2_max")}${num("t2_free")}</div>${num("t2_deduct", 0.5)}
      <div class="att-grid2">${num("t3_max")}${num("t3_deduct", 0.5)}</div>
      <div class="att-grid2">${num("t4_deduct", 0.5)}${num("opener_extra", 0.5)}</div>
      ${num("absence_deduct", 0.5)}
    </div>
    <div class="att-box"><div class="att-sec">السماح الشهري والنقاط</div>
      <div class="att-grid2">${num("allowance_max")}${num("allowance_per_month")}</div>${num("points_per_stay")}
    </div>
    <div class="att-box"><div class="att-sec">تنبيه فرق الوقت</div>
      <div class="att-grid2">${num("diff_min")}${num("diff_count")}</div>
      <div class="att-hint">إذا اختار الموظف وقتًا يختلف عن وقت التسجيل الفعلي بهذا الفرق أو أكثر، وتكرر ذلك بالعدد المحدد في الشهر، تظهر ملاحظة للإدارة لتفحصها.</div>
    </div>
    <div class="att-box"><div class="att-sec">مسؤول فتح المحل</div>
      ${[6, 0, 1, 2, 3, 4].map(i => `<div class="att-field"><label for="r_opener_${i}">${ATT_DAY_NAMES[i]}</label><select id="r_opener_${i}"><option value="">— لا أحد —</option>${emps.map(n => `<option ${r["opener_" + i] === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`).join("")}
    </div>
    <div class="att-box"><div class="att-sec">موقع المحل</div>
      ${num("radius_m", 10)}<div class="att-grid2">${num("shop_lat", "any")}${num("shop_lng", "any")}</div>
      <div class="att-hint">الإحداثيات الحالية: شركة جادو، شارع جامع السيدة عائشة، بنغازي.</div>
    </div>
    <div class="att-field"><label for="r_note">سبب التعديل (يظهر في السجل)</label><input type="text" id="r_note" maxlength="200" placeholder="مثال: حسب اللائحة الجديدة"></div>
    <div class="msg" id="attRulesMsg"></div>
    <button class="primary-btn" id="attRulesSave">حفظ التعديلات</button>
    <div class="att-hint" style="text-align:center">كل تعديل يُسجَّل باسم من قام به، ويصل إشعار بالبريد لباقي حسابات الإدارة.</div>`;
  $("#attRulesSave").onclick = async () => {
    const next = {};
    Object.keys(ATT_DEFAULT_RULES).forEach(k => { const el = $("#r_" + k); if (el) next[k] = el.value.trim(); });
    next.workdays = [...body.querySelectorAll("[data-wd]")].filter(c => c.checked).map(c => c.dataset.wd).join(",");
    const msg = $("#attRulesMsg");
    if (!next.workdays) { msg.textContent = "اختر يوم عمل واحد على الأقل"; msg.className = "msg err"; return; }
    const changed = Object.keys(next).filter(k => String(next[k]) !== String(r[k]));
    if (!changed.length) { msg.textContent = "لا توجد تغييرات"; msg.className = "msg"; return; }
    const list = changed.map(k => "• " + ATT_RULE_LABELS[k] + ": " + r[k] + " ← " + next[k]).join("\n");
    if (typeof showConfirm === "function" && !(await showConfirm("سيتم تطبيق التعديلات التالية:\n" + list, { title: "تأكيد تعديل القواعد", okText: "حفظ" }))) return;
    try {
      const res = await call("admin_rules_save", { rules: next, note: $("#r_note").value });
      CONFIG = null;
      await loadAdmin();
      showView("att-rules"); renderRules();
      $("#attRulesMsg").textContent = `تم حفظ ${res.changed} تعديل وتسجيله في سجل التعديلات`; $("#attRulesMsg").className = "msg ok";
    } catch (e) { msg.textContent = e.message; msg.className = "msg err"; }
  };
}

// ---------------- سجل التعديلات ----------------
async function refreshLogBadge(){
  try {
    const log = await call("admin_log", {});
    const seen = localStorage.getItem(LS_LOG_SEEN) || "";
    const me = ((typeof auth !== "undefined" && auth && auth.currentUser && auth.currentUser.email) || "").toLowerCase();
    const n = log.filter(x => x.at > seen && String(x.by).toLowerCase() !== me).length;
    const b = $("#attLogBadge"); if (b) { b.textContent = n; b.style.display = n ? "" : "none"; }
  } catch (e) {}
}
async function renderLog(){
  const body = $("#attLogBody");
  body.innerHTML = '<div class="att-empty"><span class="spinner"></span> جارِ التحميل…</div>';
  try {
    const log = await call("admin_log", {});
    const seen = localStorage.getItem(LS_LOG_SEEN) || "";
    const me = ((typeof auth !== "undefined" && auth && auth.currentUser && auth.currentUser.email) || "").toLowerCase();
    body.innerHTML = `<div class="att-box">${log.length ? log.map(x => `<div class="att-log-item">
        <div class="h"><b>${esc(x.by)}</b><span>${esc(x.at)}</span></div>
        <div class="t">${esc(x.type)}${x.at > seen && String(x.by).toLowerCase() !== me ? ' <span class="att-pill info">جديد</span>' : ""}</div>
        <div class="d">${esc(x.old)}${x.val ? " ← " + esc(x.val) : ""}${x.note ? "<br>السبب: " + esc(x.note) : ""}</div></div>`).join("") : '<div class="att-empty">لا توجد تعديلات بعد</div>'}</div>`;
    if (log.length) try { localStorage.setItem(LS_LOG_SEEN, log[0].at); } catch (e) {}
  } catch (e) { body.innerHTML = `<div class="att-empty">${esc(e.message)}</div>`; }
}

// ---------------- الموظفون ----------------
function renderStaff(){
  const body = $("#attStaffBody");
  if (!ADM) { body.innerHTML = '<div class="att-empty">افتح الحضور والانصراف أولًا</div>'; return; }
  const row = e => `<div class="att-emp-row" data-id="${esc(e.id || "")}"><input type="text" class="nm" value="${esc(e.name || "")}" placeholder="اسم الموظف">
    <label><input type="checkbox" class="ac" ${e.active !== false ? "checked" : ""}>نشط</label></div>`;
  body.innerHTML = `<div class="att-box"><div class="att-hint" style="margin:0 0 12px">الأسماء تظهر للموظفين في قائمة "من أنت؟". الموظف الموقوف لا يظهر ولا يقدر يسجّل.</div>
      <div id="attEmpRows">${ADM.employees.map(row).join("")}</div>
      <button class="att-btn" id="attEmpAdd" style="width:100%">+ إضافة موظف</button></div>
    <div class="msg" id="attStaffMsg"></div><button class="primary-btn" id="attStaffSave">حفظ</button>`;
  $("#attEmpAdd").onclick = () => $("#attEmpRows").insertAdjacentHTML("beforeend", row({}));
  $("#attStaffSave").onclick = async () => {
    const list = [...body.querySelectorAll(".att-emp-row")].map(el => ({ id: el.dataset.id, name: el.querySelector(".nm").value.trim(),
      active: el.querySelector(".ac").checked })).filter(x => x.name);
    const msg = $("#attStaffMsg");
    try { await call("admin_employees_save", { employees: list }); CONFIG = null; await loadAdmin(); showView("att-staff"); renderStaff();
      $("#attStaffMsg").textContent = "تم الحفظ"; $("#attStaffMsg").className = "msg ok"; }
    catch (e) { msg.textContent = e.message; msg.className = "msg err"; }
  };
}

// =====================================================================
// الخادم التجريبي — يحاكي كود جوجل شيت داخل المتصفح (للمعاينة فقط)
// =====================================================================
const Mock = (function(){
  if (!DEMO) return {};
  const S = ATT_STATUS;
  const db = {
    employees: [{ id: 1, name: "إسلام الجهاني", active: true }, { id: 2, name: "حكيم سحيم", active: true }, { id: 3, name: "أنس الترهوني", active: true }],
    rules: attMergeRules({ opener_6: "أنس الترهوني", opener_0: "حكيم سحيم", opener_1: "إسلام الجهاني", opener_2: "إسلام الجهاني", opener_3: "حكيم سحيم", opener_4: "أنس الترهوني" }),
    records: [], log: []
  };
  let seq = 1;
  const nid = () => "d" + (seq++);
  const now = () => ({ date: todayStr(), time: nowHM(), day: attDayName(todayStr()) });
  // بيانات وهمية للأيام الماضية من الشهر الحالي
  (function seed(){
    const t = todayStr(), mk = t.slice(0, 7);
    const plan = {
      "إسلام الجهاني": [[-5, 1], [0], [-2], [10, 1], [3], [0], [12, 1], [-1], [5], [0]],
      "حكيم سحيم": [[10], [25], [18], [28], ["abs"], [5], [35], [20], [0], [16]],
      "أنس الترهوني": [[5], [40], [25, 0, "allow"], [75, 0, "excuse"], [0], [8], ["absx"], [14], [65], [2]]
    };
    let idx = 0;
    for (let day = 1; day < Number(t.slice(8)); day++) {
      const ds = mk + "-" + pad(day);
      if (!attIsWorkday(ds, db.rules)) continue;
      Object.keys(plan).forEach(emp => {
        const p = plan[emp][idx % plan[emp].length];
        const rec = { id: nid(), date: ds, day: attDayName(ds), emp, opener: attOpenerFor(ds, db.rules) === emp, points: p[1] || 0, note: "" };
        if (p[0] === "abs") { rec.inStatus = S.ABSENT; }
        else if (p[0] === "absx") { rec.inStatus = S.ABSENT_EXCUSED; rec.note = "مرض — أبلغ الإدارة"; }
        else {
          rec.inTime = attFromMin(600 + p[0]); rec.inReal = rec.inTime; rec.inDist = 8 + (day * 7) % 30; rec.inStatus = S.OK;
          const out = p[1] ? 1215 : 1200 + (day % 3);
          rec.outTime = attFromMin(out); rec.outReal = rec.outTime; rec.outDist = 10 + day % 20; rec.outStatus = S.OK;
          if (p[1]) rec.note = "خدمة زبون بعد الإغلاق";
          if (p[2] === "allow") { rec.allowance = true; rec.note = "أبلغ المسؤول مسبقًا"; }
          if (p[2] === "excuse") { rec.excuse = true; rec.note = "حادث طريق"; }
        }
        db.records.push(rec);
      });
      idx++;
    }
    // حكيم: مرتان اختار فيهما وقتًا أبكر من وقت تسجيله الفعلي (وافقت عليهما الإدارة سابقًا)
    db.records.filter(r => r.emp === "حكيم سحيم" && r.inTime).slice(1, 3).forEach((r, i) => {
      r.inReal = r.inTime; r.inTime = attFromMin(attToMin(r.inTime) - (i ? 20 : 15)); r.note = "عدّل الوقت — وافقت الإدارة";
    });
    // آخر يوم عمل قبل اليوم: طلب نقاط بقاء معلّق من إسلام + طلب تعديل من حكيم
    const prev = db.records.filter(r => r.date < t && r.inTime).map(r => r.date).sort().pop();
    if (prev) {
      const a = db.records.find(r => r.date === prev && r.emp === "إسلام الجهاني");
      if (a) { a.outTime = "20:25"; a.outReal = "20:25"; a.stay = "طلب نقاط: بقي 25 دقيقة لخدمة زبون"; a.note = "زبون مطعم يستلم طلبية"; }
      const h = db.records.find(r => r.date === prev && r.emp === "حكيم سحيم" && r.inTime);
      if (h) { h.pending = "تعديل الحضور إلى 10:05 — السبب: وصلت مبكرًا ونسيت التسجيل"; h.inStatus = S.PENDING; }
    }
    // اليوم: إسلام سجّل حضوره من خارج النطاق
    if (attIsWorkday(t, db.rules)) db.records.push({ id: nid(), date: t, day: attDayName(t), emp: "إسلام الجهاني", inTime: "10:02", inReal: "10:20", inDist: 340,
      inStatus: S.PENDING, opener: attOpenerFor(t, db.rules) === "إسلام الجهاني", pending: "حضور: خارج النطاق (340 م)", points: 0 });
    const ago = h => { const d = new Date(Date.now() - h * 3600000); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
    db.log.push({ at: ago(120), by: "abdofakroun20@gmail.com", type: "تعديل قاعدة", old: "خصم الفئة الثالثة (يوم): 1", val: "0.5", note: "حسب اللائحة الجديدة" });
    db.log.push({ at: ago(70), by: "no3y.fakroun20@gmail.com", type: "غياب بعذر", old: "أنس الترهوني — حضور — (غائب بدون عذر)", val: "غائب بعذر", note: "" });
    db.log.push({ at: ago(26), by: "abdofakroun20@gmail.com", type: "منح نقاط بقاء", old: "إسلام الجهاني", val: "النقاط: 1 ← 2", note: "" });
    db.log.push({ at: ago(3), by: "no3y.fakroun20@gmail.com", type: "تعديل قاعدة", old: "النطاق المسموح (متر): 80", val: "100", note: "دقة GPS داخل المحل" });
  })();

  const emp = req => {
    const e = db.employees.find(x => String(x.id) === String(req.empId) && x.active);
    if (!e) throw new Error("الموظف غير موجود أو موقوف — اختر اسمك من جديد");
    return e;
  };
  const month = mk => db.records.filter(r => r.date.slice(0, 7) === mk);
  const log = (by, type, old, val, note) => db.log.push({ at: todayStr() + " " + nowHM(), by, type, old, val, note: note || "" });
  const dist = req => typeof req.lat === "number" ? attDistance(req.lat, req.lng, db.rules.shop_lat, db.rules.shop_lng) : null;
  const pub = () => ({ work_start: db.rules.work_start, work_end: db.rules.work_end, prompt_from: db.rules.prompt_from, workdays: db.rules.workdays,
    radius_m: db.rules.radius_m, shop_lat: db.rules.shop_lat, shop_lng: db.rules.shop_lng, allowance_max: db.rules.allowance_max, grace_min: db.rules.grace_min,
    opener_6: db.rules.opener_6, opener_0: db.rules.opener_0, opener_1: db.rules.opener_1, opener_2: db.rules.opener_2, opener_3: db.rules.opener_3, opener_4: db.rules.opener_4 });
  const months = () => [...new Set(db.records.map(r => r.date.slice(0, 7)))].sort().reverse();
  const tt = (v, real) => (v || "—") + (real && real !== v ? " [سُجّل فعليًا " + real + "]" : "");
  const desc = r => "حضور " + tt(r.inTime, r.inReal) + " (" + (r.inStatus || "—") + ")" + (r.outTime ? "، انصراف " + tt(r.outTime, r.outReal) + " (" + r.outStatus + ")" : "");

  return {
    config: () => ({ employees: db.employees.filter(e => e.active).map(e => ({ id: e.id, name: e.name })), rules: pub(), now: now() }),
    emp_status: req => {
      const e = emp(req), n = now(), mk = req.month || n.date.slice(0, 7);
      const res = attComputeMonth(month(mk).filter(r => r.emp === e.name), db.rules);
      return { emp: { id: e.id, name: e.name }, now: n, rules: pub(), today: res.records.find(r => r.date === n.date) || null,
               records: res.records, summary: res.summary[e.name] || null, month: mk };
    },
    emp_checkin: req => {
      const e = emp(req), n = now();
      let rec = db.records.find(r => r.emp === e.name && r.date === n.date);
      if (rec && rec.inTime) throw new Error("تم تسجيل حضورك اليوم من قبل");
      const t = req.time || n.time, d = dist(req), dec = attDecideStatus({ distance: d, requested: t, real: n.time }, db.rules);
      if (!rec) { rec = { id: nid(), date: n.date, day: n.day, emp: e.name, points: 0 }; db.records.push(rec); }
      Object.assign(rec, { inTime: t, inReal: n.time, inDist: d === null ? "" : d, inStatus: dec.status, opener: attOpenerFor(n.date, db.rules) === e.name,
        allowance: !!req.allowance, pending: dec.reasons.length ? "حضور: " + dec.reasons.join("، ") : "", note: req.note || "" });
      return { status: dec.status, reasons: dec.reasons, distance: d, time: t };
    },
    emp_checkout: req => {
      const e = emp(req), n = now();
      const rec = db.records.find(r => r.emp === e.name && r.date === n.date);
      if (!rec || !rec.inTime) throw new Error("لم يُسجَّل حضورك اليوم بعد");
      if (rec.outTime) throw new Error("تم تسجيل انصرافك اليوم من قبل");
      const t = req.time || n.time, d = dist(req), dec = attDecideStatus({ distance: d, requested: t, real: n.time }, db.rules);
      const after = attToMin(t) - attToMin(db.rules.work_end);
      Object.assign(rec, { outTime: t, outReal: n.time, outDist: d === null ? "" : d, outStatus: dec.status,
        stay: req.stay && after > 0 ? "طلب نقاط: بقي " + after + " دقيقة لخدمة زبون" : "" });
      if (dec.reasons.length) rec.pending = (rec.pending ? rec.pending + " | " : "") + "انصراف: " + dec.reasons.join("، ");
      if (req.note) rec.note = rec.note ? rec.note + " | " + req.note : req.note;
      return { status: dec.status, reasons: dec.reasons, distance: d, time: t };
    },
    emp_edit: req => {
      const e = emp(req), rec = db.records.find(r => r.id === req.id && r.emp === e.name);
      if (!rec) throw new Error("السجل غير موجود");
      const lbl = req.field === "out" ? "الانصراف" : "الحضور";
      const tag = "تعديل " + lbl + " إلى " + req.time + " — السبب: " + req.reason;
      rec.pending = rec.pending ? rec.pending + " | " + tag : tag;
      rec[(req.field === "out" ? "out" : "in") + "Status"] = S.PENDING;
      return { status: S.PENDING };
    },
    admin_month: req => {
      const n = now(), mk = req.month || n.date.slice(0, 7), res = attComputeMonth(month(mk), db.rules);
      return { month: mk, records: res.records, summary: res.summary, rules: db.rules, now: n, months: months(),
               employees: db.employees.map(e => ({ id: e.id, name: e.name, active: e.active })) };
    },
    admin_decide: req => {
      const rec = db.records.find(r => r.id === req.id); if (!rec) throw new Error("السجل غير موجود");
      const before = desc(rec), d = req.decision;
      if (d === "approve" || d === "excuse") {
        String(rec.pending || "").split(" | ").forEach(p => { const m = p.match(/تعديل (الحضور|الانصراف) إلى (\d{2}:\d{2})/); if (m) rec[m[1] === "الحضور" ? "inTime" : "outTime"] = m[2]; });
        if (rec.inTime) rec.inStatus = S.OK; if (rec.outTime) rec.outStatus = S.OK;
        if (d === "excuse") rec.excuse = true; rec.pending = "";
      } else if (d === "reject") {
        const editOnly = /^(تعديل [^|]+)( \| تعديل [^|]+)*$/.test(rec.pending || "");
        if (editOnly) { rec.inStatus = S.OK; if (rec.outTime) rec.outStatus = S.OK; }
        else { if (rec.inStatus === S.PENDING) rec.inStatus = S.REJECTED; if (rec.outStatus === S.PENDING) rec.outStatus = S.REJECTED; }
        rec.pending = "";
      } else if (d === "absent_excused" || d === "absent") { rec.inStatus = d === "absent" ? S.ABSENT : S.ABSENT_EXCUSED; rec.note = String(rec.note || "").replace("سُجّل تلقائيًا", "راجعته الإدارة"); }
      else if (d === "stay_points") { rec.points = (Number(rec.points) || 0) + db.rules.points_per_stay; rec.stay = "تمت الموافقة على النقاط"; }
      else if (d === "stay_no") rec.stay = "رُفض طلب النقاط";
      const labels = { approve: "موافقة", reject: "رفض", excuse: "موافقة كعذر طارئ", absent_excused: "غياب بعذر", absent: "غياب بدون عذر", stay_points: "منح نقاط بقاء", stay_no: "رفض نقاط بقاء" };
      log(req.adminEmail, labels[d], rec.emp + " — " + rec.date + ": " + before, desc(rec), req.note);
      return { ok: true };
    },
    admin_update: req => {
      const rec = db.records.find(r => r.id === req.id); if (!rec) throw new Error("السجل غير موجود");
      const f = req.fields || {}, ch = [];
      const L = { opener: "مسؤول الفتح", excuse: "عذر طارئ", allowance: "سماح شهري" };
      ["opener", "excuse", "allowance"].forEach(k => { if (k in f && !!f[k] !== !!rec[k]) { ch.push(L[k] + ": " + (rec[k] ? "نعم" : "لا") + " ← " + (f[k] ? "نعم" : "لا")); rec[k] = !!f[k]; } });
      if ("points" in f && Number(f.points) !== (Number(rec.points) || 0)) { ch.push("النقاط: " + (Number(rec.points) || 0) + " ← " + f.points); rec.points = Number(f.points); }
      if ("note" in f && f.note !== (rec.note || "")) { ch.push("ملاحظة: " + f.note); rec.note = f.note; }
      if (ch.length) log(req.adminEmail, "تعديل سجل", rec.emp + " — " + rec.date, ch.join("، "));
      return { ok: true };
    },
    admin_rules_save: req => {
      const ch = [];
      Object.keys(req.rules || {}).forEach(k => { if (k in ATT_DEFAULT_RULES && String(db.rules[k]) !== String(req.rules[k])) { ch.push(k); log(req.adminEmail, "تعديل قاعدة", ATT_RULE_LABELS[k] + ": " + db.rules[k], req.rules[k], req.note); } });
      db.rules = attMergeRules(Object.assign({}, db.rules, req.rules));
      return { changed: ch.length };
    },
    admin_log: () => db.log.slice().reverse(),
    admin_employees_save: req => {
      (req.employees || []).forEach(e => {
        const ex = db.employees.find(x => String(x.id) === String(e.id));
        if (ex) {
          if (ex.name !== e.name) { log(req.adminEmail, "تعديل موظف", ex.name, e.name); ex.name = e.name; }
          if (ex.active !== e.active) { ex.active = e.active; log(req.adminEmail, e.active ? "تفعيل موظف" : "إيقاف موظف", e.name, ""); }
        } else {
          db.employees.push({ id: db.employees.length + 1, name: e.name, active: true });
          log(req.adminEmail, "إضافة موظف", "", e.name);
        }
      });
      return { ok: true };
    }
  };
})();

// للمعاينة والاختبار
window.JaduAttendance = { openPerson, openEmployeeView, openCheckIn, openCheckOut, loadAdmin, renderRules, renderLog, renderStaff, onEmployeeEnter, setMe, DEMO };
})();
