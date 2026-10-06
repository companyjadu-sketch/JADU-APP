// ===== كود الحضور والانصراف — شركة جادو — الصقه كاملًا في Code.gs (بدل القديم) =====

// =====================================================================
// محرك قواعد الحضور والانصراف — شركة جادو
// ---------------------------------------------------------------------
// دوال حسابية بحتة (بدون صفحة ولا شيت): نفس الملف يُستخدم في الموقع
// (للوضع التجريبي والمعاينة) وفي كود جوجل شيت (Apps Script) حتى تكون
// الحسابات واحدة في المكانين.
// =====================================================================

var ATT_DEFAULT_RULES = {
  work_start: "10:00",        // بداية الدوام
  work_end: "20:00",          // نهاية الدوام
  prompt_from: "09:00",       // من متى يظهر إشعار تسجيل الحضور
  workdays: "6,0,1,2,3,4",    // أيام العمل (6=السبت ... 4=الخميس) — الجمعة 5 عطلة
  shop_lat: 32.0570392,       // إحداثيات شركة جادو — بنغازي
  shop_lng: 20.1203526,
  radius_m: 100,              // النطاق المسموح بالمتر
  grace_min: 15,              // تأخير مسموح بدون خصم
  t2_max: 30,                 // نهاية فئة التأخير الثانية (16–30)
  t2_free: 2,                 // عدد المرات المسموحة شهريًا في فئة 16–30 قبل الخصم
  t2_deduct: 0.5,             // الخصم عن كل مرة بعد المسموح (يوم)
  t3_max: 60,                 // نهاية الفئة الثالثة (31–60)
  t3_deduct: 0.5,             // خصم الفئة الثالثة (يوم)
  t4_deduct: 1,               // خصم التأخير أكثر من ساعة (يوم)
  opener_extra: 0.5,          // خصم إضافي إذا تأخر مسؤول فتح المحل بعد المسموح (يوم)
  allowance_max: 30,          // السماح الشهري: حتى كم دقيقة
  allowance_per_month: 1,     // عدد مرات السماح في الشهر
  absence_deduct: 1,          // خصم الغياب بدون عذر (يوم)
  points_per_stay: 1,         // نقاط البقاء بعد الإغلاق لخدمة زبون
  diff_min: 10,               // فرق بين الوقت المختار ووقت التسجيل الفعلي يُعتبر ملحوظًا (دقيقة)
  diff_count: 2,              // عدد المرات في الشهر التي تُظهر ملاحظة للإدارة لتفحصها
  opener_6: "", opener_0: "", opener_1: "", opener_2: "", opener_3: "", opener_4: "" // مسؤول الفتح حسب اليوم
};

// وصف كل قاعدة (يظهر في صفحة القواعد وفي سجل التعديلات)
var ATT_RULE_LABELS = {
  work_start: "بداية الدوام", work_end: "نهاية الدوام", prompt_from: "بداية ظهور إشعار الحضور",
  workdays: "أيام العمل", shop_lat: "خط عرض المحل", shop_lng: "خط طول المحل", radius_m: "النطاق المسموح (متر)",
  grace_min: "التأخير المسموح بدون خصم (دقيقة)", t2_max: "نهاية فئة التأخير الثانية (دقيقة)",
  t2_free: "مرات الفئة الثانية المسموحة شهريًا", t2_deduct: "خصم الفئة الثانية بعد المسموح (يوم)",
  t3_max: "نهاية فئة التأخير الثالثة (دقيقة)", t3_deduct: "خصم الفئة الثالثة (يوم)",
  t4_deduct: "خصم التأخير أكثر من ساعة (يوم)", opener_extra: "خصم إضافي لمسؤول الفتح (يوم)",
  allowance_max: "السماح الشهري حتى (دقيقة)", allowance_per_month: "مرات السماح في الشهر",
  absence_deduct: "خصم الغياب بدون عذر (يوم)", points_per_stay: "نقاط البقاء بعد الإغلاق",
  diff_min: "فرق الوقت الملحوظ (دقيقة)", diff_count: "عدد الفروق في الشهر لإظهار ملاحظة",
  opener_6: "مسؤول الفتح — السبت", opener_0: "مسؤول الفتح — الأحد", opener_1: "مسؤول الفتح — الاثنين",
  opener_2: "مسؤول الفتح — الثلاثاء", opener_3: "مسؤول الفتح — الأربعاء", opener_4: "مسؤول الفتح — الخميس"
};

var ATT_DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
var ATT_MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

var ATT_STATUS = {
  OK: "معتمد", PENDING: "بانتظار الموافقة", REJECTED: "مرفوض",
  ABSENT: "غائب بدون عذر", ABSENT_EXCUSED: "غائب بعذر"
};

function attMergeRules(r){
  var out = {}, k;
  for (k in ATT_DEFAULT_RULES) out[k] = ATT_DEFAULT_RULES[k];
  if (r) for (k in r) if (r[k] !== "" && r[k] !== null && r[k] !== undefined) out[k] = r[k];
  ["shop_lat","shop_lng","radius_m","grace_min","t2_max","t2_free","t2_deduct","t3_max","t3_deduct",
   "t4_deduct","opener_extra","allowance_max","allowance_per_month","absence_deduct","points_per_stay","diff_min","diff_count"]
    .forEach(function(n){ out[n] = Number(out[n]); });
  return out;
}

// "10:05" -> 605
function attToMin(t){
  if (!t) return null;
  var m = String(t).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function attFromMin(n){
  var h = Math.floor(n / 60), m = n % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}
// عرض الوقت بنظام 12 ساعة: "20:15" -> "8:15 م"
function attFmt12(t){
  var n = attToMin(t); if (n === null) return "—";
  var h = Math.floor(n / 60), m = n % 60, ap = h >= 12 ? "م" : "ص";
  h = h % 12; if (h === 0) h = 12;
  return h + ":" + (m < 10 ? "0" : "") + m + " " + ap;
}

// الفرق بالدقائق بين الوقت الذي اختاره الموظف ووقت التسجيل الفعلي (0 إذا لا يوجد)
function attTimeDiff(chosen, real){
  var a = attToMin(chosen), b = attToMin(real);
  return a === null || b === null ? 0 : Math.abs(a - b);
}

// المسافة بالمتر بين نقطتين (Haversine)
function attDistance(lat1, lng1, lat2, lng2){
  var R = 6371000, toR = Math.PI / 180;
  var dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1*toR) * Math.cos(lat2*toR) * Math.sin(dLng/2) * Math.sin(dLng/2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function attIsWorkday(dateStr, rules){
  var d = attParseDate(dateStr);
  var days = String(rules.workdays).split(",").map(function(x){ return Number(x); });
  return days.indexOf(d.getDay()) !== -1;
}
function attParseDate(s){ var p = String(s).split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
function attDayName(dateStr){ return ATT_DAY_NAMES[attParseDate(dateStr).getDay()]; }
function attMonthKey(dateStr){ return String(dateStr).slice(0, 7); }               // "2026-10"
function attMonthTitle(key){ var p = key.split("-"); return ATT_MONTH_NAMES[Number(p[1]) - 1] + " " + p[0]; }
function attOpenerFor(dateStr, rules){ return rules["opener_" + attParseDate(dateStr).getDay()] || ""; }

function attIsAbsent(r){
  return r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.ABSENT_EXCUSED || r.inStatus === ATT_STATUS.REJECTED;
}

// ---------------------------------------------------------------------
// حساب التأخير والخصم لكل سجلات شهر واحد + ملخص كل موظف
// records: [{date, emp, inTime, inStatus, outTime, outStatus, opener, allowance, excuse, points, ...}]
// ---------------------------------------------------------------------
function attComputeMonth(records, rulesIn){
  var rules = attMergeRules(rulesIn);
  var start = attToMin(rules.work_start);
  var t2Count = {}, allowUsed = {};
  var sorted = records.slice().sort(function(a, b){
    return a.date < b.date ? -1 : a.date > b.date ? 1 : (attToMin(a.inTime) || 0) - (attToMin(b.inTime) || 0);
  });
  sorted.forEach(function(r){
    var emp = r.emp;
    r.lateMin = null; r.cat = ""; r.deduct = 0; r.flags = [];
    r.inDiff = attTimeDiff(r.inTime, r.inReal);
    r.outDiff = attTimeDiff(r.outTime, r.outReal);
    r.bigDiff = Math.max(r.inDiff, r.outDiff) >= rules.diff_min;
    if (r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.REJECTED) {
      r.cat = r.inStatus === ATT_STATUS.REJECTED ? "حضور مرفوض" : "غياب";
      r.deduct = rules.absence_deduct;
      return;
    }
    if (r.inStatus === ATT_STATUS.ABSENT_EXCUSED) { r.cat = "غياب بعذر"; return; }
    var inMin = attToMin(r.inTime);
    if (inMin === null) return;
    var late = Math.max(0, inMin - start);
    r.lateMin = late;
    if (r.excuse) { r.cat = "عذر طارئ"; return; }
    if (r.allowance && late > 0) {
      var used = allowUsed[emp] || 0;
      if (late <= rules.allowance_max && !r.opener && used < rules.allowance_per_month) {
        allowUsed[emp] = used + 1; r.cat = "سماح شهري"; return;
      }
      r.flags.push(r.opener ? "السماح لا يُطبَّق على مسؤول الفتح"
                 : used >= rules.allowance_per_month ? "السماح الشهري مستخدم من قبل"
                 : "التأخير أكثر من حد السماح");
    }
    if (late <= rules.grace_min) { r.cat = "منتظم"; }
    else if (late <= rules.t2_max) {
      t2Count[emp] = (t2Count[emp] || 0) + 1;
      r.cat = "تأخير " + (rules.grace_min + 1) + "–" + rules.t2_max;
      r.t2Index = t2Count[emp];
      if (t2Count[emp] > rules.t2_free) r.deduct += rules.t2_deduct;
    }
    else if (late <= rules.t3_max) { r.cat = "تأخير " + (rules.t2_max + 1) + "–" + rules.t3_max; r.deduct += rules.t3_deduct; }
    else { r.cat = "تأخير أكثر من ساعة"; r.deduct += rules.t4_deduct; }
    if (r.opener && late > rules.grace_min) { r.deduct += rules.opener_extra; r.flags.push("تأخر مسؤول فتح المحل"); }
  });

  var summary = {};
  sorted.forEach(function(r){
    var s = summary[r.emp] || (summary[r.emp] = { emp: r.emp, present: 0, onTime: 0, t2: 0, t3: 0, t4: 0,
      allowance: 0, excuse: 0, absent: 0, absentExcused: 0, pending: 0, deduct: 0, points: 0, lateMin: 0, diffs: [] });
    if (r.bigDiff) s.diffs.push({ date: r.date, inTime: r.inTime, inReal: r.inReal, inDiff: r.inDiff, outTime: r.outTime, outReal: r.outReal, outDiff: r.outDiff });
    if (r.inStatus === ATT_STATUS.PENDING || r.outStatus === ATT_STATUS.PENDING || r.pending) s.pending++;
    s.deduct += r.deduct || 0;
    s.points += Number(r.points) || 0;
    if (r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.REJECTED) { s.absent++; return; }
    if (r.inStatus === ATT_STATUS.ABSENT_EXCUSED) { s.absentExcused++; return; }
    if (r.lateMin === null) return;
    s.present++; s.lateMin += r.lateMin;
    if (r.cat === "منتظم") s.onTime++;
    else if (r.cat === "سماح شهري") s.allowance++;
    else if (r.cat === "عذر طارئ") s.excuse++;
    else if (r.cat.indexOf("أكثر من ساعة") !== -1) s.t4++;
    else if (r.t2Index) s.t2++;
    else s.t3++;
  });
  Object.keys(summary).forEach(function(k){
    var s = summary[k];
    s.diffCount = s.diffs.length;
    s.diffAlert = s.diffCount >= rules.diff_count
      ? "اختار وقتًا يختلف عن وقت التسجيل الفعلي بـ " + rules.diff_min + " دقائق أو أكثر " + (s.diffCount === 2 ? "مرتين" : s.diffCount + " مرات") + " هذا الشهر — يحتاج تفحص"
      : "";
    var repeatedLate = s.t2 > rules.t2_free || s.t3 > 0 || s.t4 > 0;
    var violations = s.absent > 0 || s.deduct > 0 || !!s.diffAlert;
    // تقييم حسب البند السادس من اللائحة
    if (s.points > 0 && !repeatedLate && !violations) s.rating = "متميز — أولوية في المكافآت";
    else if (s.points > 0) s.rating = "له نقاط — مع ملاحظات";
    else if (violations || repeatedLate) s.rating = "عليه ملاحظات";
    else s.rating = "منتظم";
  });
  return { records: sorted, summary: summary };
}

// يحدد حالة التسجيل الجديدة حسب المسافة فقط.
// تعديل الموظف للوقت لا يحتاج موافقة — يُحفظ الوقت الفعلي معه، وتكرار الفرق يظهر كملاحظة للإدارة
function attDecideStatus(opts, rules){
  // opts: {distance (رقم أو null إذا رُفض الموقع), requested, real}
  var reasons = [];
  if (opts.distance === null || opts.distance === undefined) reasons.push("لم يُسمح بتحديد الموقع");
  else if (opts.distance > rules.radius_m) reasons.push("خارج النطاق (" + opts.distance + " م)");
  return { status: reasons.length ? ATT_STATUS.PENDING : ATT_STATUS.OK, reasons: reasons,
           edited: attTimeDiff(opts.requested, opts.real) > 0 };
}

if (typeof module !== "undefined") module.exports = {
  ATT_DEFAULT_RULES: ATT_DEFAULT_RULES, ATT_STATUS: ATT_STATUS, attComputeMonth: attComputeMonth,
  attDecideStatus: attDecideStatus, attDistance: attDistance, attTimeDiff: attTimeDiff, attMergeRules: attMergeRules, attToMin: attToMin
};


// =====================================================================
// خادم الحضور والانصراف — Google Apps Script مربوط بملف جوجل شيت
// ---------------------------------------------------------------------
// ملف الشيت فيه:
//   • ورقة لكل شهر (مثل "أكتوبر 2026") تُنشأ تلقائيًا مع أول تسجيل فيه
//   • "الموظفون" — الأسماء ورموز الحضور
//   • "القواعد" — كل قواعد الدوام والخصم (تتعدّل من الموقع أو من هنا)
//   • "سجل التعديلات" — من عدّل ماذا ومتى (يكتبه النظام فقط)
// =====================================================================

var TZ = "Africa/Tripoli";
var FIREBASE_API_KEY = "AIzaSyBQ1xn1HKghA63Q4Qb0Yo40weBBi84l8Gk";
var ADMIN_EMAILS = ["abdofakroun20@gmail.com", "no3y.fakroun20@gmail.com", "islam.aljhani@gmail.com"];
var SH_EMP = "الموظفون", SH_RULES = "القواعد", SH_LOG = "سجل التعديلات", SH_DEV = "الأجهزة";
var DEV_OK = "معتمد", DEV_PENDING = "بانتظار الموافقة", DEV_REJECTED = "مرفوض", DEV_OLD = "ملغى";

// أعمدة ورقة الشهر — الترتيب ثابت
var COLS = ["id","التاريخ","اليوم","الموظف","وقت الحضور (اختاره الموظف)","وقت تسجيل الحضور الفعلي","مسافة الحضور (م)","حالة الحضور",
            "وقت الانصراف (اختاره الموظف)","وقت تسجيل الانصراف الفعلي","مسافة الانصراف (م)","حالة الانصراف","مسؤول الفتح","سماح شهري",
            "عذر طارئ","دقائق التأخير","الفئة","الخصم (يوم)","نقاط","بقاء بعد الإغلاق","طلب معلّق","ملاحظات"];
var KEYS = ["id","date","day","emp","inTime","inReal","inDist","inStatus","outTime","outReal","outDist","outStatus",
            "opener","allowance","excuse","lateMin","cat","deduct","points","stay","pending","note"];
var SUMMARY_COL = COLS.length + 2; // ملخص الشهر يُكتب يسار الجدول بعمودين فاضيين

// ---------------------------------------------------------------------
// نقطة الدخول — الموقع يرسل طلبات POST بنص JSON
// ---------------------------------------------------------------------
function doPost(e){
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var req = JSON.parse(e.postData.contents || "{}");
    var fn = API[req.action];
    if (!fn) throw new Error("طلب غير معروف");
    return json_({ ok: true, data: fn(req) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
function doGet(){ return json_({ ok: true, data: "خادم الحضور يعمل" }); }
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

var API = {
  config: function(){
    var rules = getRules_();
    return { employees: getEmployees_().filter(function(x){ return x.active; }).map(function(x){ return { id: x.id, name: x.name }; }),
             rules: publicRules_(rules), now: nowParts_() };
  },

  // ---------------- الموظف ----------------
  // ربط الهاتف باسم الموظف: أول مرة تُعتمد مباشرة، وأي تغيير بعدها يحتاج موافقة الإدارة
  emp_register: function(req){
    var deviceId = String(req.deviceId || "").slice(0, 64);
    if (deviceId.length < 8) throw new Error("معرّف الجهاز غير صالح");
    var emp = getEmployees_().filter(function(x){ return String(x.id) === String(req.empId) && x.active; })[0];
    if (!emp) throw new Error("الموظف غير موجود أو موقوف");
    var devs = getDevices_();
    var mine = devs.filter(function(d){ return d.deviceId === deviceId && d.status === DEV_OK; })[0];
    if (mine && String(mine.empId) === String(emp.id)) return { status: "approved", status_data: API.emp_status({ deviceId: deviceId }) };
    var nameTaken = devs.some(function(d){ return String(d.empId) === String(emp.id) && d.status === DEV_OK; });
    if (!mine && !nameTaken) {
      addDevice_(deviceId, emp, DEV_OK, "تسجيل أول مرة");
      return { status: "approved", status_data: API.emp_status({ deviceId: deviceId }) };
    }
    // طلب معلّق: إلغاء أي طلب معلّق سابق لنفس الهاتف ثم إضافة الجديد
    devs.filter(function(d){ return d.deviceId === deviceId && d.status === DEV_PENDING; })
        .forEach(function(d){ setDeviceStatus_(d.row, DEV_OLD, ""); });
    addDevice_(deviceId, emp, DEV_PENDING, mine ? "تغيير من " + mine.name : "الاسم مسجّل على هاتف آخر");
    return { status: "pending", current: mine ? mine.name : "", requested: emp.name };
  },

  emp_status: function(req){
    var emp = authEmployee_(req);
    var now = nowParts_(), rules = getRules_();
    var mk = req.month || now.date.slice(0, 7);
    var res = attComputeMonth(readMonth_(mk).filter(function(r){ return r.emp === emp.name; }), rules);
    var today = res.records.filter(function(r){ return r.date === now.date; })[0] || null;
    return { emp: { id: emp.id, name: emp.name }, now: now, rules: publicRules_(rules), today: today,
             records: res.records, summary: res.summary[emp.name] || null, month: mk };
  },

  emp_checkin: function(req){
    var emp = authEmployee_(req);
    var now = nowParts_(), rules = getRules_();
    var rows = readMonth_(now.date.slice(0, 7));
    var existing = rows.filter(function(r){ return r.emp === emp.name && r.date === now.date; })[0];
    if (existing && existing.inTime) throw new Error("تم تسجيل حضورك اليوم من قبل");
    var requested = validTime_(req.time) || now.time;
    var dist = locDistance_(req, rules);
    var d = attDecideStatus({ distance: dist, requested: requested, real: now.time }, rules);
    var rec = existing || { id: Utilities.getUuid().slice(0, 8), date: now.date, day: attDayName(now.date), emp: emp.name };
    rec.inTime = requested; rec.inReal = now.time; rec.inDist = dist === null ? "" : dist; rec.inStatus = d.status;
    rec.opener = attOpenerFor(now.date, rules) === emp.name;
    rec.allowance = !!req.allowance;
    rec.pending = d.reasons.length ? "حضور: " + d.reasons.join("، ") : "";
    rec.note = joinNote_(rec.note, req.note);
    writeRecord_(rec);
    recalcMonth_(now.date.slice(0, 7));
    return { status: d.status, reasons: d.reasons, distance: dist, time: requested };
  },

  emp_checkout: function(req){
    var emp = authEmployee_(req);
    var now = nowParts_(), rules = getRules_();
    var rows = readMonth_(now.date.slice(0, 7));
    var rec = rows.filter(function(r){ return r.emp === emp.name && r.date === now.date; })[0];
    if (!rec || !rec.inTime) throw new Error("لم يُسجَّل حضورك اليوم بعد");
    if (rec.outTime) throw new Error("تم تسجيل انصرافك اليوم من قبل");
    var requested = validTime_(req.time) || now.time;
    var dist = locDistance_(req, rules);
    var d = attDecideStatus({ distance: dist, requested: requested, real: now.time }, rules);
    rec.outTime = requested; rec.outReal = now.time; rec.outDist = dist === null ? "" : dist; rec.outStatus = d.status;
    var after = attToMin(requested) - attToMin(rules.work_end);
    rec.stay = req.stay && after > 0 ? "طلب نقاط: بقي " + after + " دقيقة لخدمة زبون" : "";
    var parts = []; if (rec.pending) parts.push(rec.pending);
    if (d.reasons.length) parts.push("انصراف: " + d.reasons.join("، "));
    rec.pending = parts.join(" | ");
    rec.note = joinNote_(rec.note, req.note);
    writeRecord_(rec);
    recalcMonth_(now.date.slice(0, 7));
    return { status: d.status, reasons: d.reasons, distance: dist, time: requested };
  },

  // طلب تعديل وقت سابق — يبقى الوقت الأصلي حتى توافق الإدارة
  emp_edit: function(req){
    var emp = authEmployee_(req);
    var t = validTime_(req.time); if (!t) throw new Error("الوقت غير صحيح");
    var reason = String(req.reason || "").slice(0, 200);
    if (!reason) throw new Error("اكتب سبب التعديل");
    var mk = String(req.date).slice(0, 7);
    var rec = readMonth_(mk).filter(function(r){ return r.id === req.id && r.emp === emp.name; })[0];
    if (!rec) throw new Error("السجل غير موجود");
    var field = req.field === "out" ? "out" : "in";
    var label = field === "in" ? "الحضور" : "الانصراف";
    var tag = "تعديل " + label + " إلى " + t + " — السبب: " + reason;
    rec.pending = rec.pending ? rec.pending + " | " + tag : tag;
    rec[field + "Status"] = ATT_STATUS.PENDING;
    writeRecord_(rec);
    recalcMonth_(mk);
    return { status: ATT_STATUS.PENDING };
  },

  // ---------------- الإدارة ----------------
  admin_month: function(req){
    authAdmin_(req);
    var mk = req.month || nowParts_().date.slice(0, 7);
    var rules = getRules_();
    var res = attComputeMonth(readMonth_(mk), rules);
    var devs = getDevices_();
    return { month: mk, records: res.records, summary: res.summary, rules: rules,
             employees: getEmployees_().map(function(x){ return { id: x.id, name: x.name, active: x.active }; }),
             months: listMonths_(), now: nowParts_(),
             deviceRequests: devs.filter(function(d){ return d.status === DEV_PENDING; }).map(function(d){
               var cur = devs.filter(function(x){ return x.deviceId === d.deviceId && x.status === DEV_OK; })[0];
               return { deviceId: d.deviceId, empId: d.empId, name: d.name, current: cur ? cur.name : "", reason: d.reason, at: d.at };
             }),
             log: readLog_(60) };
  },

  admin_device_decide: function(req){
    var who = authAdmin_(req);
    var devs = getDevices_();
    var d = devs.filter(function(x){ return x.deviceId === req.deviceId && String(x.empId) === String(req.empId) && x.status === DEV_PENDING; })[0];
    if (!d) throw new Error("الطلب غير موجود أو تمت معالجته");
    var cur = devs.filter(function(x){ return x.deviceId === d.deviceId && x.status === DEV_OK; })[0];
    if (req.decision === "approve") {
      devs.filter(function(x){ return x.deviceId === d.deviceId && x.status === DEV_OK; }).forEach(function(x){ setDeviceStatus_(x.row, DEV_OLD, who); });
      setDeviceStatus_(d.row, DEV_OK, who);
      log_(who, "موافقة على تغيير اسم الهاتف", cur ? cur.name : "هاتف جديد", d.name, d.reason);
    } else {
      setDeviceStatus_(d.row, DEV_REJECTED, who);
      log_(who, "رفض تغيير اسم الهاتف", cur ? cur.name : "هاتف جديد", d.name + " (مرفوض)", d.reason);
    }
    return { ok: true };
  },

  // قرار الإدارة على سجل: approve | reject | excuse | absent_excused | absent | stay_points | stay_no
  admin_decide: function(req){
    var who = authAdmin_(req);
    var mk = String(req.month);
    var rec = readMonth_(mk).filter(function(r){ return r.id === req.id; })[0];
    if (!rec) throw new Error("السجل غير موجود");
    var before = describe_(rec), rules = getRules_(), d = req.decision;
    if (d === "approve" || d === "excuse") {
      // تطبيق تعديلات الوقت المطلوبة (إن وجدت) ثم اعتماد السجل
      String(rec.pending || "").split(" | ").forEach(function(p){
        var m = p.match(/تعديل (الحضور|الانصراف) إلى (\d{2}:\d{2})/);
        if (m) { if (m[1] === "الحضور") rec.inTime = m[2]; else rec.outTime = m[2]; }
      });
      if (rec.inTime) rec.inStatus = ATT_STATUS.OK;
      if (rec.outTime) rec.outStatus = ATT_STATUS.OK;
      if (d === "excuse") rec.excuse = true;
      rec.pending = "";
    } else if (d === "reject") {
      // رفض الطلب المعلّق: لو كان تعديل وقت نرجع للوقت الأصلي، ولو كان تسجيلًا خارج النطاق يُرفض الحضور
      var editOnly = /^(تعديل [^|]+)( \| تعديل [^|]+)*$/.test(rec.pending || "");
      if (editOnly) { rec.inStatus = rec.inTime ? ATT_STATUS.OK : rec.inStatus; if (rec.outTime) rec.outStatus = ATT_STATUS.OK; }
      else { if (rec.inStatus === ATT_STATUS.PENDING) rec.inStatus = ATT_STATUS.REJECTED; if (rec.outStatus === ATT_STATUS.PENDING) rec.outStatus = ATT_STATUS.REJECTED; }
      rec.pending = "";
    } else if (d === "absent_excused") { rec.inStatus = ATT_STATUS.ABSENT_EXCUSED; rec.pending = ""; }
    else if (d === "absent") { rec.inStatus = ATT_STATUS.ABSENT; rec.pending = ""; }
    else if (d === "stay_points") { rec.points = (Number(rec.points) || 0) + rules.points_per_stay; rec.stay = "تمت الموافقة على النقاط"; }
    else if (d === "stay_no") { rec.stay = "رُفض طلب النقاط"; }
    else throw new Error("قرار غير معروف");
    writeRecord_(rec);
    recalcMonth_(mk);
    log_(who, decisionLabel_(d), rec.emp + " — " + rec.date + ": " + before, describe_(rec), req.note || "");
    return { ok: true };
  },

  // تعديل مباشر من الإدارة: مسؤول الفتح / العذر / النقاط / الملاحظة
  admin_update: function(req){
    var who = authAdmin_(req);
    var mk = String(req.month);
    var rec = readMonth_(mk).filter(function(r){ return r.id === req.id; })[0];
    if (!rec) throw new Error("السجل غير موجود");
    var f = req.fields || {}, changes = [];
    ["opener","excuse","allowance"].forEach(function(k){
      if (k in f && !!f[k] !== !!rec[k]) { changes.push(fieldLabel_(k) + ": " + yn_(rec[k]) + " ← " + yn_(f[k])); rec[k] = !!f[k]; }
    });
    if ("points" in f && Number(f.points) !== (Number(rec.points) || 0)) { changes.push("النقاط: " + (Number(rec.points) || 0) + " ← " + Number(f.points)); rec.points = Number(f.points); }
    if ("note" in f && String(f.note) !== String(rec.note || "")) { changes.push("ملاحظة: " + String(f.note)); rec.note = String(f.note).slice(0, 300); }
    if (!changes.length) return { ok: true };
    writeRecord_(rec);
    recalcMonth_(mk);
    log_(who, "تعديل سجل", rec.emp + " — " + rec.date, changes.join("، "), "");
    return { ok: true };
  },

  admin_rules_save: function(req){
    var who = authAdmin_(req);
    var old = getRules_(), next = req.rules || {}, changes = [];
    var sh = sheet_(SH_RULES), vals = sh.getDataRange().getValues();
    Object.keys(ATT_DEFAULT_RULES).forEach(function(k){
      if (!(k in next)) return;
      var nv = String(next[k]).trim();
      if (String(old[k]) === nv) return;
      changes.push({ k: k, o: String(old[k]), n: nv });
      for (var i = 1; i < vals.length; i++) if (vals[i][0] === k) { sh.getRange(i + 1, 2).setValue(nv); return; }
      sh.appendRow([k, nv, ATT_RULE_LABELS[k] || ""]);
    });
    if (!changes.length) return { changed: 0 };
    bust_();
    changes.forEach(function(c){ log_(who, "تعديل قاعدة", (ATT_RULE_LABELS[c.k] || c.k) + ": " + c.o, c.n, req.note || ""); });
    // كل الأشهر المفتوحة تُعاد حسبتها بالقواعد الجديدة؟ لا — فقط الشهر الحالي، حتى لا تتغير أشهر مقفلة
    recalcMonth_(nowParts_().date.slice(0, 7));
    notifyAdmins_(who, "تعديل قواعد الحضور", changes.map(function(c){
      return "• " + (ATT_RULE_LABELS[c.k] || c.k) + ": " + c.o + " ← " + c.n; }).join("\n"));
    return { changed: changes.length };
  },

  admin_log: function(req){
    authAdmin_(req);
    return readLog_(200);
  },

  admin_employees_save: function(req){
    var who = authAdmin_(req);
    var list = req.employees || [], sh = sheet_(SH_EMP), cur = getEmployees_();
    list.forEach(function(e){
      var name = String(e.name || "").trim(); if (!name) return;
      var ex = cur.filter(function(c){ return String(c.id) === String(e.id); })[0];
      if (ex) {
        var row = ex.row;
        if (ex.name !== name) { log_(who, "تعديل موظف", ex.name, name, ""); sh.getRange(row, 2).setValue(name); }
        if (!!e.active !== ex.active) { sh.getRange(row, 4).setValue(e.active ? "نشط" : "موقوف"); log_(who, e.active ? "تفعيل موظف" : "إيقاف موظف", name, "", ""); }
      } else {
        var id = cur.reduce(function(m, c){ return Math.max(m, Number(c.id) || 0); }, 0) + 1;
        sh.appendRow([id, name, "", "نشط"]);
        log_(who, "إضافة موظف", "", name, "");
      }
    });
    bust_();
    return { ok: true };
  }
};

// ---------------------------------------------------------------------
// التحقق من الهوية
// ---------------------------------------------------------------------
function authEmployee_(req){
  var dev = getDevices_().filter(function(d){ return d.deviceId === String(req.deviceId || "") && d.status === DEV_OK; })[0];
  if (!dev) throw new Error("هذا الهاتف غير مسجّل — اختر اسمك");
  var emp = getEmployees_().filter(function(x){ return String(x.id) === String(dev.empId) && x.active; })[0];
  if (!emp) throw new Error("الموظف موقوف — تواصل مع الإدارة");
  return emp;
}

// يتحقق من دخول الإدارة عبر Firebase (نفس حسابات الإدارة العامة بالموقع)
function authAdmin_(req){
  if (!req.idToken) throw new Error("لازم تسجيل دخول الإدارة");
  var cache = CacheService.getScriptCache();
  var ck = "tok_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, req.idToken)).slice(0, 40);
  var email = cache.get(ck);
  if (!email) {
    var res = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
      method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: req.idToken }), muteHttpExceptions: true });
    var body = JSON.parse(res.getContentText() || "{}");
    email = body.users && body.users[0] && String(body.users[0].email || "").toLowerCase();
    if (!email) throw new Error("انتهت جلسة الإدارة — سجّل دخولك من جديد");
    cache.put(ck, email, 300);
  }
  if (ADMIN_EMAILS.indexOf(email) === -1) throw new Error("هذا الحساب غير مسموح له");
  return email;
}

// ---------------------------------------------------------------------
// الشيت
// ---------------------------------------------------------------------
function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name){ var s = ss_().getSheetByName(name); if (!s) { setup(); s = ss_().getSheetByName(name); } return s; }

// ذاكرة مؤقتة لتسريع الرد: القراءة من الشيت مرة كل 5 دقائق أو عند أي تعديل
var MEMO_ = {};
function cached_(key, fn){
  if (MEMO_[key]) return MEMO_[key];
  var c = CacheService.getScriptCache(), hit = c.get(key);
  if (hit) { MEMO_[key] = JSON.parse(hit); return MEMO_[key]; }
  var v = fn(); MEMO_[key] = v;
  try { c.put(key, JSON.stringify(v), 300); } catch (e) {}
  return v;
}
function bust_(){ MEMO_ = {}; CacheService.getScriptCache().removeAll(["c_emp", "c_rules", "c_dev"]); }

function getEmployees_(){ return cached_("c_emp", readEmployees_); }
function readEmployees_(){
  var vals = sheet_(SH_EMP).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) if (vals[i][1])
    out.push({ row: i + 1, id: vals[i][0], name: String(vals[i][1]).trim(), pin: String(vals[i][2]).trim(), active: vals[i][3] !== "موقوف" });
  return out;
}
function getRules_(){
  return attMergeRules(cached_("c_rules", function(){
    var vals = sheet_(SH_RULES).getDataRange().getValues(), r = {};
    for (var i = 1; i < vals.length; i++) if (vals[i][0]) r[vals[i][0]] = vals[i][1] instanceof Date ? fmtTime_(vals[i][1]) : vals[i][1];
    return r;
  }));
}

// الأجهزة: كل هاتف مربوط باسم موظف
function getDevices_(){
  return cached_("c_dev", function(){
    var sh = sheet_(SH_DEV), last = sh.getLastRow();
    if (last < 2) return [];
    return sh.getRange(2, 1, last - 1, 7).getValues().map(function(r, i){
      return { row: i + 2, deviceId: String(r[0]), empId: r[1], name: r[2], status: r[3], reason: r[4], at: fmtDateTime_(r[5]), by: r[6] };
    }).filter(function(d){ return d.deviceId; });
  });
}
function addDevice_(deviceId, emp, status, reason){
  sheet_(SH_DEV).appendRow([deviceId, emp.id, emp.name, status, reason || "", new Date(), ""]);
  bust_();
}
function setDeviceStatus_(row, status, who){
  sheet_(SH_DEV).getRange(row, 4).setValue(status);
  if (who) sheet_(SH_DEV).getRange(row, 7).setValue(who);
  bust_();
}
function readLog_(n){
  var sh = sheet_(SH_LOG), last = sh.getLastRow();
  if (last < 2) return [];
  var from = Math.max(2, last - n + 1);
  return sh.getRange(from, 1, last - from + 1, 6).getValues().reverse().map(function(r){
    return { at: fmtDateTime_(r[0]), by: r[1], type: r[2], old: r[3], val: r[4], note: r[5] }; });
}
function publicRules_(r){
  return { work_start: r.work_start, work_end: r.work_end, prompt_from: r.prompt_from, workdays: r.workdays,
           radius_m: r.radius_m, shop_lat: r.shop_lat, shop_lng: r.shop_lng, allowance_max: r.allowance_max, grace_min: r.grace_min,
           opener_6: r.opener_6, opener_0: r.opener_0, opener_1: r.opener_1, opener_2: r.opener_2, opener_3: r.opener_3, opener_4: r.opener_4 };
}

function monthSheet_(mk, create){
  var title = attMonthTitle(mk), sh = ss_().getSheetByName(title);
  if (!sh && create) {
    sh = ss_().insertSheet(title, 0);
    sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight("bold").setBackground("#1F3A5F").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
    sh.hideColumns(1);
    sh.getRange("B:B").setNumberFormat("@");
    sh.getRange("E:F").setNumberFormat("@"); sh.getRange("I:J").setNumberFormat("@");
  }
  return sh;
}
function readMonth_(mk){
  var sh = monthSheet_(mk, false); if (!sh) return [];
  var last = sh.getLastRow(); if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, COLS.length).getValues().filter(function(r){ return r[0]; }).map(function(r){
    var o = {}; KEYS.forEach(function(k, i){ o[k] = r[i]; });
    o.date = o.date instanceof Date ? Utilities.formatDate(o.date, TZ, "yyyy-MM-dd") : String(o.date);
    ["inTime","inReal","outTime","outReal"].forEach(function(k){ o[k] = o[k] instanceof Date ? fmtTime_(o[k]) : String(o[k] || ""); });
    ["opener","allowance","excuse"].forEach(function(k){ o[k] = o[k] === true || o[k] === "نعم"; });
    o.points = Number(o.points) || 0;
    return o;
  });
}
function writeRecord_(rec){
  var mk = attMonthKey(rec.date), sh = monthSheet_(mk, true);
  var row = KEYS.map(function(k){
    var v = rec[k];
    if (k === "opener" || k === "allowance" || k === "excuse") return v ? "نعم" : "";
    return v === undefined || v === null ? "" : v;
  });
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function(r){ return r[0]; }) : [];
  var idx = ids.indexOf(rec.id);
  if (idx === -1) sh.appendRow(row); else sh.getRange(idx + 2, 1, 1, KEYS.length).setValues([row]);
}

// يعيد حساب التأخير والخصم لكل الشهر ويكتب الملخص بجانب الجدول
function recalcMonth_(mk){
  var sh = monthSheet_(mk, false); if (!sh) return;
  var res = attComputeMonth(readMonth_(mk), getRules_());
  var byId = {}; res.records.forEach(function(r){ byId[r.id] = r; });
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    var out = ids.map(function(r){ var x = byId[r[0]]; return x ? [x.lateMin === null ? "" : x.lateMin, x.cat, x.deduct] : ["", "", ""]; });
    sh.getRange(2, KEYS.indexOf("lateMin") + 1, out.length, 3).setValues(out);
    sh.getRange(2, 1, last - 1, COLS.length).sort([{ column: 2, ascending: true }, { column: 4, ascending: true }]);
  }
  // ملخص الشهر
  var head = ["الموظف","أيام الحضور","منتظم","تأخير 16–30","تأخير 31–60","أكثر من ساعة","سماح شهري","عذر طارئ","غياب","غياب بعذر","بانتظار الموافقة","مجموع الخصم (يوم)","النقاط","التقييم","فروق الوقت","ملاحظة للإدارة"];
  var rows = Object.keys(res.summary).map(function(k){
    var s = res.summary[k];
    return [s.emp, s.present, s.onTime, s.t2, s.t3, s.t4, s.allowance, s.excuse, s.absent, s.absentExcused, s.pending, s.deduct, s.points, s.rating, s.diffCount, s.diffAlert];
  });
  sh.getRange(1, SUMMARY_COL, Math.max(sh.getMaxRows(), 2), head.length).clearContent();
  sh.getRange(1, SUMMARY_COL, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#E10A1E").setFontColor("#FFFFFF");
  if (rows.length) sh.getRange(2, SUMMARY_COL, rows.length, head.length).setValues(rows);
}

function listMonths_(){
  var out = [];
  ss_().getSheets().forEach(function(s){
    var n = s.getName();
    for (var m = 0; m < 12; m++) if (n.indexOf(ATT_MONTH_NAMES[m] + " ") === 0) {
      var y = n.split(" ")[1]; out.push(y + "-" + (m < 9 ? "0" : "") + (m + 1));
    }
  });
  return out.sort().reverse();
}

function log_(who, type, oldVal, newVal, note){
  sheet_(SH_LOG).appendRow([new Date(), who, type, oldVal, newVal, note || ""]);
}
function notifyAdmins_(who, subject, body){
  try {
    var to = ADMIN_EMAILS.filter(function(e){ return e !== who; }).join(",");
    if (to) MailApp.sendEmail(to, "جادو — " + subject, who + " قام بالتعديلات التالية:\n\n" + body + "\n\nالتفاصيل في سجل التعديلات بالموقع.");
  } catch (e) { /* لو ما فيه صلاحية إرسال بريد، نكتفي بالسجل */ }
}

// ---------------------------------------------------------------------
// تسجيل الغياب تلقائيًا — يشتغل يوميًا (مشغّل زمني) بعد نهاية الدوام
// ---------------------------------------------------------------------
function markAbsences(){
  var now = nowParts_(), rules = getRules_();
  if (!attIsWorkday(now.date, rules)) return;
  var mk = now.date.slice(0, 7);
  var rows = readMonth_(mk).filter(function(r){ return r.date === now.date; });
  getEmployees_().filter(function(e){ return e.active; }).forEach(function(e){
    if (rows.some(function(r){ return r.emp === e.name; })) return;
    writeRecord_({ id: Utilities.getUuid().slice(0, 8), date: now.date, day: attDayName(now.date), emp: e.name,
                   inStatus: ATT_STATUS.ABSENT, opener: attOpenerFor(now.date, rules) === e.name, note: "سُجّل تلقائيًا" });
  });
  recalcMonth_(mk);
}

// ---------------------------------------------------------------------
// إعداد الملف لأول مرة — شغّل هذه الدالة مرة واحدة من محرر السكربت
// ---------------------------------------------------------------------
function setup(){
  var ss = ss_();
  if (!ss.getSheetByName(SH_EMP)) {
    var e = ss.insertSheet(SH_EMP); e.setRightToLeft(true);
    e.getRange(1, 1, 1, 4).setValues([["رقم","اسم الموظف","(غير مستخدم)","الحالة"]]).setFontWeight("bold");
    e.getRange(2, 1, 3, 4).setValues([[1,"إسلام الجهاني","","نشط"],[2,"حكيم سحيم","","نشط"],[3,"أنس الترهوني","","نشط"]]);
  }
  if (!ss.getSheetByName(SH_RULES)) {
    var r = ss.insertSheet(SH_RULES); r.setRightToLeft(true);
    r.getRange("B:B").setNumberFormat("@");
    var rows = [["المفتاح","القيمة","الوصف"]];
    Object.keys(ATT_DEFAULT_RULES).forEach(function(k){ rows.push([k, String(ATT_DEFAULT_RULES[k]), ATT_RULE_LABELS[k] || ""]); });
    r.getRange(1, 1, rows.length, 3).setValues(rows);
    r.getRange(1, 1, 1, 3).setFontWeight("bold");
  }
  if (!ss.getSheetByName(SH_DEV)) {
    var dv = ss.insertSheet(SH_DEV); dv.setRightToLeft(true);
    dv.getRange(1, 1, 1, 7).setValues([["معرّف الهاتف","رقم الموظف","اسم الموظف","الحالة","السبب","التاريخ","قرار من"]]).setFontWeight("bold");
    dv.getRange("A:A").setNumberFormat("@");
  }
  if (!ss.getSheetByName(SH_LOG)) {
    var l = ss.insertSheet(SH_LOG); l.setRightToLeft(true);
    l.getRange(1, 1, 1, 6).setValues([["التاريخ والوقت","من قام بالتعديل","نوع التعديل","القيمة القديمة","القيمة الجديدة","ملاحظة"]]).setFontWeight("bold");
  }
  // مشغّل يومي لتسجيل الغياب الساعة 9 مساءً بتوقيت ليبيا
  var has = ScriptApp.getProjectTriggers().some(function(t){ return t.getHandlerFunction() === "markAbsences"; });
  if (!has) ScriptApp.newTrigger("markAbsences").timeBased().atHour(21).everyDays(1).inTimezone(TZ).create();
}

// ---------------------------------------------------------------------
// أدوات مساعدة
// ---------------------------------------------------------------------
function nowParts_(){
  var d = new Date();
  return { date: Utilities.formatDate(d, TZ, "yyyy-MM-dd"), time: Utilities.formatDate(d, TZ, "HH:mm"), day: attDayName(Utilities.formatDate(d, TZ, "yyyy-MM-dd")) };
}
function fmtTime_(d){ return Utilities.formatDate(d, TZ, "HH:mm"); }
function fmtDateTime_(d){ return d instanceof Date ? Utilities.formatDate(d, TZ, "yyyy-MM-dd HH:mm") : String(d); }
function validTime_(t){ var m = String(t || "").match(/^(\d{1,2}):(\d{2})$/); if (!m || +m[1] > 23 || +m[2] > 59) return null; return (m[1].length < 2 ? "0" : "") + m[1] + ":" + m[2]; }
function locDistance_(req, rules){
  if (typeof req.lat !== "number" || typeof req.lng !== "number") return null;
  return attDistance(req.lat, req.lng, rules.shop_lat, rules.shop_lng);
}
function joinNote_(a, b){ b = String(b || "").trim().slice(0, 200); return !b ? (a || "") : (a ? a + " | " + b : b); }
function yn_(v){ return v ? "نعم" : "لا"; }
function fieldLabel_(k){ return { opener: "مسؤول الفتح", excuse: "عذر طارئ", allowance: "سماح شهري" }[k] || k; }
function describe_(r){
  var t = function(v, real){ return (v || "—") + (real && real !== v ? " [سُجّل فعليًا " + real + "]" : ""); };
  return "حضور " + t(r.inTime, r.inReal) + " (" + (r.inStatus || "—") + ")" + (r.outTime ? "، انصراف " + t(r.outTime, r.outReal) + " (" + r.outStatus + ")" : "");
}
function decisionLabel_(d){
  return { approve: "موافقة", reject: "رفض", excuse: "موافقة كعذر طارئ", absent_excused: "غياب بعذر",
           absent: "غياب بدون عذر", stay_points: "منح نقاط بقاء", stay_no: "رفض نقاط بقاء" }[d] || d;
}
