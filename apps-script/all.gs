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
  shift_hours: 8,             // ساعات العمل اليومية لكل موظف (يمكن تغييرها لكل موظف في ورقة الموظفين)
  hours_tiers: 1              // 1 = نقص الساعات يُخصم بنفس فئات التأخير، 0 = ملاحظة فقط
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
  shift_hours: "ساعات العمل اليومية", hours_tiers: "خصم نقص الساعات (1 نعم، 0 ملاحظة فقط)"
};

var ATT_DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
var ATT_MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

var ATT_STATUS = {
  OK: "معتمد", PENDING: "بانتظار الموافقة", REJECTED: "مرفوض",
  ABSENT: "غائب بدون عذر", ABSENT_EXCUSED: "غائب بعذر", LEAVE: "عطلة",
  TRIP: "سفر عمل", CLOSED: "إغلاق الشركة"
};
// طلب بانتظار الموافقة بدون وقت حضور: "طلب عطلة …" أو "طلب سفر عمل …"
function attRequestKind(r){
  if (r.inStatus !== ATT_STATUS.PENDING || r.inTime) return "";
  var p = String(r.pending || "");
  return /^طلب عطلة/.test(p) ? "leave" : /^طلب سفر عمل/.test(p) ? "trip" : "";
}
function attIsLeaveRequest(r){ return attRequestKind(r) === "leave"; }
function attIsTripRequest(r){ return attRequestKind(r) === "trip"; }
// رقم طلب السفر (يجمع كل أيام الطلب الواحد): "طلب سفر عمل #ab12 …"
function attTripGroup(r){ var m = String(r.pending || "").match(/^طلب سفر عمل #(\w+)/); return m ? m[1] : ""; }

function attMergeRules(r){
  var out = {}, k;
  for (k in ATT_DEFAULT_RULES) out[k] = ATT_DEFAULT_RULES[k];
  if (r) for (k in r) if (r[k] !== "" && r[k] !== null && r[k] !== undefined) out[k] = r[k];
  ["shop_lat","shop_lng","radius_m","grace_min","t2_max","t2_free","t2_deduct","t3_max","t3_deduct",
   "t4_deduct","opener_extra","allowance_max","allowance_per_month","absence_deduct","points_per_stay","diff_min","diff_count","shift_hours","hours_tiers"]
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
// ساعات العمل المطلوبة لموظف (من ورقة الموظفين إن وُجدت، وإلا القاعدة العامة)
function attHoursFor(emp, rules){
  var h = rules.emp_hours && Number(rules.emp_hours[emp]);
  return h > 0 ? h : Number(rules.shift_hours) || 8;
}
function attFmtDur(min){
  if (min === null || min === undefined) return "—";
  var h = Math.floor(min / 60), m = min % 60;
  return h + ":" + (m < 10 ? "0" : "") + m;
}

function attIsAbsent(r){
  return r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.ABSENT_EXCUSED || r.inStatus === ATT_STATUS.REJECTED;
}

// ---------------------------------------------------------------------
// حساب الخصم لكل سجلات شهر واحد + ملخص كل موظف
// كل موظف يعمل عددًا محددًا من الساعات (8 افتراضيًا):
//   • من فتح المحل (opener): يُحسب تأخيره من بداية الدوام (10:00) بفئات اللائحة
//   • غيره: لا يُحسب عليه تأخير، بل يُحسب نقص ساعات عمله عن المطلوب بنفس الفئات
//   • من أغلق المحل (closer): يُلاحَظ إن أغلق قبل نهاية الدوام
// records: [{date, emp, inTime, inStatus, outTime, outStatus, opener, closer, allowance, excuse, points, ...}]
// ---------------------------------------------------------------------
function attComputeMonth(records, rulesIn){
  var rules = attMergeRules(rulesIn);
  var start = attToMin(rules.work_start), end = attToMin(rules.work_end);
  var t2Count = {}, allowUsed = {};
  var sorted = records.slice().sort(function(a, b){
    return a.date < b.date ? -1 : a.date > b.date ? 1 : (attToMin(a.inTime) || 0) - (attToMin(b.inTime) || 0);
  });
  sorted.forEach(function(r){
    var emp = r.emp;
    r.opener = !!r.opener; r.closer = !!r.closer;
    r.lateMin = null; r.workedMin = null; r.shortMin = null; r.lostMin = null; r.lostKind = "";
    r.reqMin = Math.round(attHoursFor(emp, rules) * 60);
    r.cat = ""; r.deduct = 0; r.flags = [];
    r.inDiff = attTimeDiff(r.inTime, r.inReal);
    r.outDiff = attTimeDiff(r.outTime, r.outReal);
    r.bigDiff = Math.max(r.inDiff, r.outDiff) >= rules.diff_min;
    if (r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.REJECTED) {
      r.cat = r.inStatus === ATT_STATUS.REJECTED ? "حضور مرفوض" : "غياب";
      r.deduct = rules.absence_deduct;
      return;
    }
    if (r.inStatus === ATT_STATUS.ABSENT_EXCUSED) { r.cat = "غياب بعذر"; return; }
    if (r.inStatus === ATT_STATUS.LEAVE) { r.cat = "عطلة"; return; }
    if (r.inStatus === ATT_STATUS.TRIP) { r.cat = "سفر عمل"; return; }
    if (r.inStatus === ATT_STATUS.CLOSED) { r.cat = "إغلاق الشركة"; return; }
    if (attIsLeaveRequest(r)) { r.cat = "طلب عطلة"; return; }
    if (attIsTripRequest(r)) { r.cat = "طلب سفر عمل"; return; }
    var inMin = attToMin(r.inTime), outMin = attToMin(r.outTime);
    if (inMin === null) return;
    if (outMin !== null) { r.workedMin = Math.max(0, outMin - inMin); r.shortMin = Math.max(0, r.reqMin - r.workedMin); }
    if (r.closer && outMin !== null && outMin < end) r.flags.push("أغلق المحل قبل الموعد بـ " + (end - outMin) + " دقيقة");
    if (r.opener) {
      r.lateMin = Math.max(0, inMin - start);
      r.lostMin = r.lateMin; r.lostKind = "تأخير";
      if (r.shortMin > rules.grace_min) r.flags.push("عمل " + attFmtDur(r.workedMin) + " من " + attFmtDur(r.reqMin) + " ساعات");
    } else {
      r.lateMin = 0;
      if (r.shortMin === null) { r.cat = "لم يسجّل انصرافه"; return; }
      r.lostMin = r.shortMin; r.lostKind = "نقص ساعات";
    }
    var lost = r.lostMin, kind = r.lostKind;
    if (r.excuse) { r.cat = "عذر طارئ"; return; }
    if (r.allowance && lost > 0) {
      var used = allowUsed[emp] || 0;
      if (lost <= rules.allowance_max && !r.opener && used < rules.allowance_per_month) {
        allowUsed[emp] = used + 1; r.cat = "سماح شهري"; return;
      }
      r.flags.push(r.opener ? "السماح لا يُطبَّق على من فتح المحل"
                 : used >= rules.allowance_per_month ? "السماح الشهري مستخدم من قبل"
                 : kind + " أكثر من حد السماح");
    }
    var apply = r.opener || Number(rules.hours_tiers) === 1;
    if (lost <= rules.grace_min) { r.cat = "منتظم"; }
    else if (lost <= rules.t2_max) {
      t2Count[emp] = (t2Count[emp] || 0) + 1;
      r.cat = kind + " " + (rules.grace_min + 1) + "–" + rules.t2_max;
      r.t2Index = t2Count[emp];
      if (apply && t2Count[emp] > rules.t2_free) r.deduct += rules.t2_deduct;
    }
    else if (lost <= rules.t3_max) { r.cat = kind + " " + (rules.t2_max + 1) + "–" + rules.t3_max; if (apply) r.deduct += rules.t3_deduct; }
    else { r.cat = kind + " أكثر من ساعة"; r.t4 = true; if (apply) r.deduct += rules.t4_deduct; }
    if (r.opener && lost > rules.grace_min) { r.deduct += rules.opener_extra; r.flags.push("تأخر فتح المحل"); }
  });

  // ملاحظات على مستوى اليوم: من فتح المحل ومن أغلقه
  var days = {};
  sorted.forEach(function(r){
    if (attIsAbsent(r) || !r.inTime) return;
    var d = days[r.date] || (days[r.date] = { date: r.date, openers: [], closers: [], present: 0, allOut: true });
    d.present++;
    if (r.opener) d.openers.push(r.emp);
    if (r.closer) d.closers.push(r.emp);
    if (!r.outTime) d.allOut = false;
  });
  var dayFlags = [];
  Object.keys(days).sort().forEach(function(k){
    var d = days[k], f = [];
    if (!d.openers.length) f.push("لم يسجّل أحد أنه فتح المحل");
    if (d.openers.length > 1) f.push("أكثر من موظف سجّل أنه فتح المحل: " + d.openers.join("، "));
    if (d.allOut && !d.closers.length) f.push("لم يسجّل أحد أنه أغلق المحل");
    if (d.closers.length > 1) f.push("أكثر من موظف سجّل أنه أغلق المحل: " + d.closers.join("، "));
    if (f.length) dayFlags.push({ date: k, flags: f });
  });

  var summary = {};
  sorted.forEach(function(r){
    var s = summary[r.emp] || (summary[r.emp] = { emp: r.emp, present: 0, onTime: 0, t2: 0, t3: 0, t4: 0,
      allowance: 0, excuse: 0, absent: 0, absentExcused: 0, leave: 0, leaveDates: [], leavePending: 0, trip: 0, tripDates: [], tripPending: 0, closed: 0, closedDates: [], pending: 0, deduct: 0, points: 0, lateMin: 0, lostMin: 0,
      workedMin: 0, reqMin: 0, shortDays: 0, openDays: 0, closeDays: 0, diffs: [] });
    if (r.bigDiff) s.diffs.push({ date: r.date, inTime: r.inTime, inReal: r.inReal, inDiff: r.inDiff, outTime: r.outTime, outReal: r.outReal, outDiff: r.outDiff });
    if (r.inStatus === ATT_STATUS.PENDING || r.outStatus === ATT_STATUS.PENDING || r.pending) s.pending++;
    s.deduct += r.deduct || 0;
    s.points += Number(r.points) || 0;
    if (r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.REJECTED) { s.absent++; return; }
    if (r.inStatus === ATT_STATUS.ABSENT_EXCUSED) { s.absentExcused++; return; }
    if (r.inStatus === ATT_STATUS.LEAVE) { s.leave++; s.leaveDates.push(r.date); return; }
    if (r.inStatus === ATT_STATUS.TRIP) { s.trip++; s.tripDates.push(r.date); return; }
    if (r.inStatus === ATT_STATUS.CLOSED) { s.closed++; s.closedDates.push(r.date); return; }
    if (attIsLeaveRequest(r)) { s.leavePending++; return; }
    if (attIsTripRequest(r)) { s.tripPending++; return; }
    if (!r.inTime) return;
    s.present++;
    if (r.opener) s.openDays++;
    if (r.closer) s.closeDays++;
    if (r.workedMin !== null) { s.workedMin += r.workedMin; s.reqMin += r.reqMin; if (r.shortMin > rules.grace_min) s.shortDays++; }
    if (r.opener) s.lateMin += r.lateMin || 0;
    s.lostMin += r.lostMin || 0;
    if (r.cat === "منتظم") s.onTime++;
    else if (r.cat === "سماح شهري") s.allowance++;
    else if (r.cat === "عذر طارئ") s.excuse++;
    else if (r.t4) s.t4++;
    else if (r.t2Index) s.t2++;
    else if (r.lostMin > rules.grace_min) s.t3++;
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
  return { records: sorted, summary: summary, dayFlags: dayFlags };
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
  attDecideStatus: attDecideStatus, attDistance: attDistance, attIsLeaveRequest: attIsLeaveRequest, attIsTripRequest: attIsTripRequest, attTripGroup: attTripGroup, attRequestKind: attRequestKind, attParseDate: attParseDate, attIsWorkday: attIsWorkday, attHoursFor: attHoursFor, attTimeDiff: attTimeDiff, attMergeRules: attMergeRules, attToMin: attToMin
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
// الأدوار: أدمن (يُحسب حضوره) / إدارة (لا يدخل في الحضور والغياب والخصومات ولا في أي تقرير) / موظف (يُحسب)
var ROLE_ADMIN = "أدمن", ROLE_MGMT = "إدارة", ROLE_STAFF = "موظف";
var ROLE_EDITORS = ["islam.aljhani@gmail.com"]; // وحده من يعدّل الأدوار (والتحقق هنا في الخادم وليس في الواجهة)
function normRole_(v){ v = String(v || "").trim(); return (v === ROLE_ADMIN || v === ROLE_MGMT) ? v : ROLE_STAFF; }
var DEV_OK = "معتمد", DEV_PENDING = "بانتظار الموافقة", DEV_REJECTED = "مرفوض", DEV_OLD = "ملغى";

// أعمدة ورقة الشهر — الترتيب ثابت
var COLS = ["id","التاريخ","اليوم","الموظف","وقت الحضور (اختاره الموظف)","وقت تسجيل الحضور الفعلي","مسافة الحضور (م)","حالة الحضور",
            "وقت الانصراف (اختاره الموظف)","وقت تسجيل الانصراف الفعلي","مسافة الانصراف (م)","حالة الانصراف","فتح المحل","سماح شهري",
            "عذر طارئ","دقائق التأخير (لمن فتح)","الفئة","الخصم (يوم)","نقاط","بقاء بعد الإغلاق","طلب معلّق","ملاحظات",
            "أغلق المحل","ساعات العمل","نقص الساعات (دقيقة)"];
var KEYS = ["id","date","day","emp","inTime","inReal","inDist","inStatus","outTime","outReal","outDist","outStatus",
            "opener","allowance","excuse","lateMin","cat","deduct","points","stay","pending","note",
            "closer","worked","shortMin"];
var BOOL_KEYS = ["opener","allowance","excuse","closer"];
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
    return json_({ ok: false, error: String(err && err.message || err), fatal: !!(err && err.fatal) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
function doGet(){ return json_({ ok: true, data: "خادم الحضور يعمل" }); }
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

var API = {
  // فحص خفيف للقراءة فقط: هل هذا الهاتف معتمد في ورقة «الأجهزة»؟ (يفتح به الرابط المباشر شاشة الموظف)
  // لا يرجع اسمًا ولا بيانات — فقط نعم/لا والدور. يشمل «الإدارة» لأنهم يستعملون الموقع وإن لم يخضعوا للحضور.
  device_check: function(req){
    var id = String(req.deviceId || "");
    if (id.length < 8) return { ok: false };
    var dev = getDevices_().filter(function(d){ return d.deviceId === id && d.status === DEV_OK; })[0];
    var emp = dev ? getEmployees_().filter(function(x){ return String(x.id) === String(dev.empId) && x.active; })[0] : null;
    return emp ? { ok: true, role: emp.role } : { ok: false };
  },

  config: function(){
    var rules = getRules_();
    var taken = getDevices_().filter(function(d){ return d.status === DEV_OK; }).map(function(d){ return String(d.empId); });
    return { employees: getEmployees_().filter(function(x){ return x.active && x.counted; }).map(function(x){
               return { id: x.id, name: x.name, taken: taken.indexOf(String(x.id)) !== -1 }; }),
             rules: publicRules_(rules), now: nowParts_() };
  },

  // ---------------- الموظف ----------------
  // ربط الهاتف باسم الموظف: أول مرة تُعتمد مباشرة، وأي تغيير بعدها يحتاج موافقة الإدارة
  emp_register: function(req){
    var deviceId = String(req.deviceId || "").slice(0, 64);
    if (deviceId.length < 8) throw new Error("معرّف الجهاز غير صالح");
    var emp = getEmployees_().filter(function(x){ return String(x.id) === String(req.empId) && x.active; })[0];
    if (!emp) throw new Error("الموظف غير موجود أو موقوف");
    if (!emp.counted) throw new Error("هذا الحساب لا يخضع للحضور");
    var devs = getDevices_();
    var mine = devs.filter(function(d){ return d.deviceId === deviceId && d.status === DEV_OK; })[0];
    if (mine && String(mine.empId) === String(emp.id)) return { status: "approved", status_data: API.emp_status({ deviceId: deviceId }) };
    var nameTaken = devs.some(function(d){ return String(d.empId) === String(emp.id) && d.status === DEV_OK; });
    if (!mine && !nameTaken) {
      addDevice_(deviceId, emp, DEV_OK, "تسجيل أول مرة");
      return { status: "approved", status_data: API.emp_status({ deviceId: deviceId }) };
    }
    // هاتف جديد واسم مسجّل على هاتف آخر: لا يُسمح — تُلغي الإدارة ربط الهاتف القديم أولًا
    if (!mine) throw new Error("هذا الاسم مسجّل على هاتف آخر. لا يمكن تسجيل هاتف جديد — راجع الإدارة.");
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
    var all = readMonth_(mk);
    var res = attComputeMonth(all.filter(function(r){ return r.emp === emp.name; }), rules);
    var today = res.records.filter(function(r){ return r.date === now.date; })[0] || null;
    var todays = all.filter(function(r){ return r.date === now.date; });
    return { emp: { id: emp.id, name: emp.name, hours: attHoursFor(emp.name, rules) }, now: now, rules: publicRules_(rules), today: today,
             openedBy: todays.filter(function(r){ return r.opener; }).map(function(r){ return r.emp; }),
             closedBy: todays.filter(function(r){ return r.closer; }).map(function(r){ return r.emp; }),
             records: res.records, summary: res.summary[emp.name] || null, month: mk };
  },

  emp_checkin: function(req){
    var emp = authEmployee_(req);
    var now = queuedNow_(req), rules = getRules_();
    var rows = readMonth_(now.date.slice(0, 7));
    var existing = rows.filter(function(r){ return r.emp === emp.name && r.date === now.date; })[0];
    if (existing && existing.inTime) throw new Error("تم تسجيل حضورك اليوم من قبل");
    var requested = validTime_(req.time) || now.time;
    var dist = locDistance_(req, rules);
    var d = attDecideStatus({ distance: dist, requested: requested, real: now.time }, rules);
    var rec = existing || { id: Utilities.getUuid().slice(0, 8), date: now.date, day: attDayName(now.date), emp: emp.name };
    rec.inTime = requested; rec.inReal = now.time; rec.inDist = dist === null ? "" : dist; rec.inStatus = d.status;
    rec.opener = !!req.opener;
    rec.allowance = !!req.allowance;
    rec.pending = d.reasons.length ? "حضور: " + d.reasons.join("، ") : "";
    rec.note = joinNote_(joinNote_(rec.note, req.note), now.lateNote);
    writeRecord_(rec);
    markDirty_(now.date.slice(0, 7));
    return { status: d.status, reasons: d.reasons, distance: dist, time: requested };
  },

  emp_checkout: function(req){
    var emp = authEmployee_(req);
    var now = queuedNow_(req), rules = getRules_();
    var rows = readMonth_(now.date.slice(0, 7));
    var rec = rows.filter(function(r){ return r.emp === emp.name && r.date === now.date; })[0];
    if (!rec || !rec.inTime) throw new Error("لم يُسجَّل حضورك اليوم بعد");
    if (rec.outTime) throw new Error("تم تسجيل انصرافك اليوم من قبل");
    var requested = validTime_(req.time) || now.time;
    var dist = locDistance_(req, rules);
    var d = attDecideStatus({ distance: dist, requested: requested, real: now.time }, rules);
    rec.outTime = requested; rec.outReal = now.time; rec.outDist = dist === null ? "" : dist; rec.outStatus = d.status;
    rec.closer = !!req.closer;
    var after = attToMin(requested) - attToMin(rules.work_end);
    rec.stay = req.stay && after > 0 ? "طلب نقاط: بقي " + after + " دقيقة لخدمة زبون" : "";
    var parts = []; if (rec.pending) parts.push(rec.pending);
    if (d.reasons.length) parts.push("انصراف: " + d.reasons.join("، "));
    rec.pending = parts.join(" | ");
    rec.note = joinNote_(joinNote_(rec.note, req.note), now.lateNote);
    writeRecord_(rec);
    markDirty_(now.date.slice(0, 7));
    return { status: d.status, reasons: d.reasons, distance: dist, time: requested };
  },

  // إضافة يوم سابق نسي الموظف تسجيله، أو طلب عطلة — كلاهما بانتظار موافقة الإدارة
  emp_add_day: function(req){
    var emp = authEmployee_(req), rules = getRules_(), now = nowParts_();
    var date = String(req.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("اختر التاريخ");
    var diffDays = Math.round((attParseDate(date) - attParseDate(now.date)) / 86400000);
    var kind = req.kind === "leave" ? "leave" : "work";
    if (kind === "work" && diffDays > 0) throw new Error("لا يمكن تسجيل حضور ليوم لم يأتِ بعد");
    if (diffDays < -45 || diffDays > 45) throw new Error("التاريخ بعيد جدًا");
    if (!attIsWorkday(date, rules)) throw new Error("هذا اليوم عطلة أسبوعية");
    var reason = String(req.reason || "").trim().slice(0, 200);
    if (!reason) throw new Error("اكتب السبب");
    var mk = attMonthKey(date);
    var rec = readMonth_(mk).filter(function(r){ return r.emp === emp.name && r.date === date; })[0];
    // انصراف فقط: الحضور مسجّل والموظف نسي الانصراف — يُضاف وقت الانصراف بانتظار موافقة الإدارة
    var part = req.part === "out" || req.part === "in" || req.part === "both" ? req.part : "";
    if (kind === "work" && part === "out") {
      if (diffDays >= 0) throw new Error("انصراف اليوم يُسجَّل من زر «تسجيل الانصراف»");
      if (!rec || !rec.inTime) throw new Error("لا يوجد حضور مسجّل لهذا اليوم — اختر «الحضور والانصراف»");
      if (rec.outTime) throw new Error("انصرافك مسجّل لهذا اليوم — استخدم «طلب تعديل الوقت» من السجل");
      var o = validTime_(req.outTime);
      if (!o) throw new Error("اختر وقت الانصراف");
      if (attToMin(o) <= attToMin(rec.inTime)) throw new Error("وقت الانصراف لازم يكون بعد وقت الحضور");
      rec.outTime = o; rec.outReal = ""; rec.outDist = ""; rec.outStatus = ATT_STATUS.PENDING; rec.closer = !!req.closer;
      var tag = "إضافة انصراف ليوم سابق (سُجّل يوم " + now.date + " " + now.time + ") — السبب: " + reason;
      rec.pending = rec.pending ? rec.pending + " | " + tag : tag;
      writeRecord_(rec);
      markDirty_(mk);
      return { status: ATT_STATUS.PENDING };
    }
    if (rec && rec.inTime) throw new Error(rec.outTime || !part ? "يوجد تسجيل لهذا اليوم — استخدم \"طلب تعديل الوقت\" من السجل" : "حضورك مسجّل لهذا اليوم — اختر «الانصراف فقط»");
    if (rec && rec.inStatus === ATT_STATUS.LEAVE) throw new Error("هذا اليوم مسجّل عطلة من قبل");
    if (rec && rec.inStatus === ATT_STATUS.TRIP) throw new Error("هذا اليوم مسجّل سفر عمل");
    if (rec && rec.inStatus === ATT_STATUS.CLOSED) throw new Error("الشركة مغلقة في هذا اليوم");
    rec = rec || { id: Utilities.getUuid().slice(0, 8), date: date, day: attDayName(date), emp: emp.name, points: 0 };
    if (kind === "leave") {
      rec.inStatus = ATT_STATUS.PENDING;
      rec.pending = "طلب عطلة — السبب: " + reason;
    } else {
      var tin = validTime_(req.inTime), tout = part === "in" ? null : validTime_(req.outTime);
      if (!tin) throw new Error("اختر وقت الحضور");
      if (part === "both" && !tout) throw new Error("اختر وقت الانصراف");
      if (tout && attToMin(tout) <= attToMin(tin)) throw new Error("وقت الانصراف لازم يكون بعد وقت الحضور");
      rec.inTime = tin; rec.inReal = ""; rec.inDist = ""; rec.inStatus = ATT_STATUS.PENDING;
      rec.outTime = tout || ""; rec.outReal = ""; rec.outDist = ""; rec.outStatus = tout ? ATT_STATUS.PENDING : "";
      rec.opener = !!req.opener; rec.closer = !!tout && !!req.closer;
      rec.pending = "إضافة يوم سابق (سُجّل يوم " + now.date + " " + now.time + ") — السبب: " + reason;
    }
    rec.note = joinNote_(rec.note && !/سُجّل تلقائيًا/.test(rec.note) ? rec.note : "", "");
    writeRecord_(rec);
    markDirty_(mk);
    return { status: ATT_STATUS.PENDING };
  },

  // طلب سفر عمل لفترة (من تاريخ إلى تاريخ) — بانتظار موافقة الإدارة، وكل أيام الطلب تُعتمد أو تُرفض معًا
  emp_trip: function(req){
    var emp = authEmployee_(req), rules = getRules_(), now = nowParts_();
    var reason = String(req.reason || "").trim().slice(0, 200);
    if (!reason) throw new Error("اكتب الوجهة أو سبب السفر");
    var days = rangeDays_(req.from, req.to, rules, now, -45, 90);
    var gid = Utilities.getUuid().slice(0, 4);
    var tag = "طلب سفر عمل #" + gid + " (" + req.from + " → " + req.to + ") — " + reason;
    var res = writeRange_(days, [emp], function(rec){
      if (rec.inTime || rec.inStatus === ATT_STATUS.LEAVE || rec.inStatus === ATT_STATUS.TRIP || rec.inStatus === ATT_STATUS.CLOSED) return false;
      rec.inStatus = ATT_STATUS.PENDING; rec.pending = tag; return true;
    });
    if (!res.done) throw new Error("لا توجد أيام عمل متاحة في هذه الفترة" + (res.skipped.length ? " (" + res.skipped.join("، ") + ")" : ""));
    return { status: ATT_STATUS.PENDING, days: res.done, skipped: res.skipped };
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
    // نفس الطلب مرسل من قبل (ضغطتين) — لا نكرره
    if (String(rec.pending || "").indexOf("تعديل " + label + " إلى " + t) !== -1) return { status: ATT_STATUS.PENDING };
    rec.pending = rec.pending ? rec.pending + " | " + tag : tag;
    rec[field + "Status"] = ATT_STATUS.PENDING;
    writeRecord_(rec);
    markDirty_(mk);
    return { status: ATT_STATUS.PENDING };
  },

  // ---------------- الإدارة ----------------
  admin_month: function(req){
    var who = authAdmin_(req);
    var mk = req.month || nowParts_().date.slice(0, 7);
    if (isDirty_(mk)) recalcMonth_(mk);
    var rules = getRules_();
    var res = attComputeMonth(readMonth_(mk), rules);
    var devs = getDevices_();
    // «الإدارة» خارج كل تقارير الحضور والغياب والخصومات حتى لو وُجدت لهم سجلات قديمة
    var mgmt = {};
    getEmployees_().forEach(function(x){ if (!x.counted) mgmt[x.name] = true; });
    var recs = res.records.filter(function(r){ return !mgmt[r.emp]; });
    var summ = {}; Object.keys(res.summary || {}).forEach(function(k){ if (!mgmt[k]) summ[k] = res.summary[k]; });
    return { month: mk, records: recs, summary: summ, rules: rules, canEditRoles: ROLE_EDITORS.indexOf(who) !== -1,
             employees: getEmployees_().map(function(x){
               return { id: x.id, name: x.name, hours: x.hours, active: x.active, role: x.role, counted: x.counted,
                        device: devs.some(function(d){ return String(d.empId) === String(x.id) && d.status === DEV_OK; }) }; }),
             dayFlags: res.dayFlags,
             months: listMonths_(), now: nowParts_(),
             deviceRequests: devs.filter(function(d){ return d.status === DEV_PENDING; }).map(function(d){
               var cur = devs.filter(function(x){ return x.deviceId === d.deviceId && x.status === DEV_OK; })[0];
               return { deviceId: d.deviceId, empId: d.empId, name: d.name, current: cur ? cur.name : "", reason: d.reason, at: d.at };
             }),
             log: readLog_(60) };
  },

  // إلغاء ربط هاتف الموظف (عند تغيير هاتفه) — بعدها يسجّل من هاتفه الجديد مباشرة
  admin_device_reset: function(req){
    var who = authAdmin_(req);
    var emp = getEmployees_().filter(function(x){ return String(x.id) === String(req.empId); })[0];
    if (!emp) throw new Error("الموظف غير موجود");
    var n = 0;
    getDevices_().filter(function(d){ return String(d.empId) === String(emp.id) && (d.status === DEV_OK || d.status === DEV_PENDING); })
      .forEach(function(d){ setDeviceStatus_(d.row, DEV_OLD, who); n++; });
    log_(who, "إلغاء ربط هاتف", emp.name, n ? "يمكنه التسجيل من هاتف جديد" : "لم يكن له هاتف مسجّل", "");
    return { ok: true };
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
    if (attIsTripRequest(rec) && (d === "approve" || d === "reject")) {
      var gid = attTripGroup(rec), txt = String(rec.pending), today = nowParts_().date;
      var rng = txt.match(/\((\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})\)/);
      var months = rng ? monthsBetween_(rng[1], rng[2]) : [mk];
      var why = txt.replace(/^طلب سفر عمل #\w+ /, ""), n = 0;
      months.forEach(function(m){
        var touched = false;
        readMonth_(m).forEach(function(x){
          if (x.emp !== rec.emp || !attIsTripRequest(x) || attTripGroup(x) !== gid) return;
          if (d === "approve") { x.inStatus = ATT_STATUS.TRIP; x.note = joinNote_(x.note, "سفر عمل " + why); }
          else { x.inStatus = attParseDate(x.date) < attParseDate(today) ? ATT_STATUS.ABSENT : ""; x.note = joinNote_(x.note, "رُفض طلب سفر العمل"); }
          x.pending = ""; writeRecord_(x); n++; touched = true;
        });
        if (touched) recalcMonth_(m);
      });
      log_(who, d === "approve" ? "موافقة على سفر عمل" : "رفض سفر عمل", rec.emp + " — " + n + " أيام", why, req.note || "");
      return { ok: true, days: n };
    }
    if (attIsLeaveRequest(rec) && (d === "approve" || d === "reject")) {
      var why = String(rec.pending).replace(/^طلب عطلة — /, "");
      if (d === "approve") { rec.inStatus = ATT_STATUS.LEAVE; rec.note = joinNote_(rec.note, "عطلة — " + why); }
      else { rec.inStatus = attParseDate(rec.date) < attParseDate(nowParts_().date) ? ATT_STATUS.ABSENT : ""; rec.note = joinNote_(rec.note, "رُفض طلب العطلة — " + why); }
      rec.pending = "";
      writeRecord_(rec);
      recalcMonth_(mk);
      log_(who, d === "approve" ? "موافقة على عطلة" : "رفض عطلة", rec.emp + " — " + rec.date, why, req.note || "");
      return { ok: true };
    }
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
      // رفض إضافة انصراف ليوم سابق: يرجع اليوم بلا انصراف كما كان
      if (/إضافة انصراف ليوم سابق/.test(rec.pending || "")) {
        rec.outTime = ""; rec.outReal = ""; rec.outDist = ""; rec.outStatus = ""; rec.closer = false;
        rec.note = joinNote_(rec.note, "رُفض طلب إضافة الانصراف");
      }
      var editOnly = /^(تعديل [^|]+)( \| تعديل [^|]+)*$/.test(rec.pending || "");
      if (editOnly) { rec.inStatus = rec.inTime ? ATT_STATUS.OK : rec.inStatus; if (rec.outTime) rec.outStatus = ATT_STATUS.OK; }
      else { if (rec.inStatus === ATT_STATUS.PENDING) rec.inStatus = ATT_STATUS.REJECTED; if (rec.outStatus === ATT_STATUS.PENDING) rec.outStatus = ATT_STATUS.REJECTED; }
      rec.pending = "";
    } else if (d === "absent_excused" || d === "absent") {
      // بعد قرار الإدارة يخرج اليوم من قائمة «بانتظار الموافقة» (كانت «بدون عذر» تبقيه فيها)
      rec.inStatus = d === "absent" ? ATT_STATUS.ABSENT : ATT_STATUS.ABSENT_EXCUSED; rec.pending = "";
      rec.note = String(rec.note || "").replace("سُجّل تلقائيًا", "راجعته الإدارة");
    }
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
    ["opener","closer","excuse","allowance"].forEach(function(k){
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

  // سفر عمل تضيفه الإدارة مباشرة لموظف (معتمد بدون طلب)
  admin_trip_add: function(req){
    var who = authAdmin_(req), rules = getRules_(), now = nowParts_();
    var emp = getEmployees_().filter(function(x){ return String(x.id) === String(req.empId); })[0];
    if (!emp) throw new Error("اختر الموظف");
    if (!emp.counted) throw new Error("هذا الحساب لا يخضع للحضور");
    var reason = String(req.reason || "").trim().slice(0, 200);
    if (!reason) throw new Error("اكتب الوجهة أو سبب السفر");
    var days = rangeDays_(req.from, req.to, rules, now, -60, 120);
    var res = writeRange_(days, [emp], function(rec){
      if (rec.inTime || rec.inStatus === ATT_STATUS.CLOSED) return false;
      rec.inStatus = ATT_STATUS.TRIP; rec.pending = ""; rec.note = joinNote_("", "سفر عمل (" + req.from + " → " + req.to + ") — " + reason + " — أضافته الإدارة");
      return true;
    });
    log_(who, "إضافة سفر عمل", emp.name + " — " + req.from + " → " + req.to, res.done + " أيام" + (res.skipped.length ? " (لم يُغيَّر: " + res.skipped.join("، ") + ")" : ""), reason);
    return { days: res.done, skipped: res.skipped };
  },

  // إغلاق الشركة لكل الموظفين لفترة (مناسبة أو ظرف) — لا يُحسب غيابًا ولا عطلة ولا خصمًا
  admin_closure: function(req){
    var who = authAdmin_(req), rules = getRules_(), now = nowParts_();
    var reason = String(req.reason || "").trim().slice(0, 200);
    if (!reason) throw new Error("اكتب سبب الإغلاق");
    var days = rangeDays_(req.from, req.to, rules, now, -60, 120);
    var emps = getEmployees_().filter(function(e){ return e.active && e.counted; });
    var res = writeRange_(days, emps, function(rec){
      if (rec.inTime) return false;
      rec.inStatus = ATT_STATUS.CLOSED; rec.pending = ""; rec.note = "إغلاق الشركة — " + reason;
      return true;
    });
    log_(who, "إغلاق الشركة", req.from + " → " + req.to + " (" + days.length + " أيام عمل)", reason, res.skipped.length ? "حضر فعلًا: " + res.skipped.join("، ") : "");
    notifyAdmins_(who, "إغلاق الشركة", "إغلاق الشركة من " + req.from + " إلى " + req.to + "\nالسبب: " + reason);
    return { days: days.length, skipped: res.skipped };
  },

  // إلغاء إغلاق الشركة (أو سفر عمل) ليوم أو فترة — تعود الأيام فارغة
  admin_closure_cancel: function(req){
    var who = authAdmin_(req), rules = getRules_(), now = nowParts_();
    var status = req.kind === "trip" ? ATT_STATUS.TRIP : ATT_STATUS.CLOSED;
    var days = rangeDays_(req.from, req.to || req.from, rules, now, -120, 365);
    var n = 0;
    monthsBetween_(days[0], days[days.length - 1]).forEach(function(m){
      var touched = false;
      readMonth_(m).forEach(function(x){
        if (days.indexOf(x.date) === -1 || x.inStatus !== status) return;
        if (req.emp && x.emp !== req.emp) return;
        x.inStatus = ""; x.note = joinNote_(x.note, "أُلغي " + status); writeRecord_(x); n++; touched = true;
      });
      if (touched) recalcMonth_(m);
    });
    log_(who, "إلغاء " + status, (req.emp ? req.emp + " — " : "") + req.from + (req.to && req.to !== req.from ? " → " + req.to : ""), n + " سجلات", "");
    return { changed: n };
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
    var canRoles = ROLE_EDITORS.indexOf(who) !== -1;
    // تحقق مسبق من كل التغييرات في الدور قبل أي كتابة، حتى لا يُحفظ نصف الطلب
    list.forEach(function(e){
      if (e.role === undefined || e.role === null || e.role === "") return;
      var r = String(e.role).trim();
      if (r !== ROLE_ADMIN && r !== ROLE_MGMT && r !== ROLE_STAFF) throw new Error("دور غير صالح");
      var old = cur.filter(function(c){ return String(c.id) === String(e.id); })[0];
      var oldRole = old ? old.role : ROLE_STAFF;
      if (r !== oldRole && !canRoles) throw new Error("تعديل الدور للأدمن فقط");
    });
    list.forEach(function(e){
      var name = String(e.name || "").trim(); if (!name) return;
      var ex = cur.filter(function(c){ return String(c.id) === String(e.id); })[0];
      var newRole = (e.role === undefined || e.role === null || e.role === "") ? null : String(e.role).trim();
      if (ex) {
        var row = ex.row;
        if (newRole && newRole !== ex.role) { sh.getRange(row, 5).setValue(newRole); log_(who, "تعديل الدور", name + ": " + ex.role, newRole, ""); }
        if (ex.name !== name) { log_(who, "تعديل موظف", ex.name, name, ""); sh.getRange(row, 2).setValue(name); }
        var nh = Number(e.hours) > 0 ? Number(e.hours) : "";
        if (String(nh) !== String(ex.hours)) { sh.getRange(row, 3).setValue(nh); log_(who, "تعديل ساعات العمل", name + ": " + (ex.hours || "الافتراضي"), nh || "الافتراضي", ""); }
        if (!!e.active !== ex.active) { sh.getRange(row, 4).setValue(e.active ? "نشط" : "موقوف"); log_(who, e.active ? "تفعيل موظف" : "إيقاف موظف", name, "", ""); }
      } else {
        var id = cur.reduce(function(m, c){ return Math.max(m, Number(c.id) || 0); }, 0) + 1;
        sh.appendRow([id, name, Number(e.hours) > 0 ? Number(e.hours) : "", "نشط", newRole || ROLE_STAFF]);
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
  if (!emp.counted) throw new Error("هذا الحساب لا يخضع للحضور");
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
    out.push({ row: i + 1, id: vals[i][0], name: String(vals[i][1]).trim(), hours: Number(vals[i][2]) || "", active: vals[i][3] !== "موقوف",
               role: normRole_(vals[i][4]), counted: normRole_(vals[i][4]) !== ROLE_MGMT });
  return out;
}
function getRules_(){
  var hours = {};
  getEmployees_().forEach(function(e){ if (Number(e.hours) > 0) hours[e.name] = Number(e.hours); });
  var r = attMergeRules(cached_("c_rules", function(){
    var vals = sheet_(SH_RULES).getDataRange().getValues(), r = {};
    for (var i = 1; i < vals.length; i++) if (vals[i][0]) r[vals[i][0]] = vals[i][1] instanceof Date ? fmtTime_(vals[i][1]) : vals[i][1];
    return r;
  }));
  r.emp_hours = hours;
  return r;
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
           shift_hours: r.shift_hours, emp_hours: r.emp_hours };
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
// ترقية ورقة شهر أُنشئت بالأعمدة القديمة (قبل إضافة ساعات العمل)
function ensureCols_(sh){
  var col = KEYS.indexOf("closer") + 1;
  if (sh.getRange(1, col).getValue() === COLS[col - 1]) return;
  sh.getRange(1, col, sh.getMaxRows(), 30).clearContent();
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight("bold").setBackground("#1F3A5F").setFontColor("#FFFFFF");
}
function readMonth_(mk){
  var sh = monthSheet_(mk, false); if (!sh) return [];
  ensureCols_(sh);
  var last = sh.getLastRow(); if (last < 2) return [];
  var rng = sh.getRange(2, 1, last - 1, COLS.length);
  var vals = rng.getValues(), disp = rng.getDisplayValues();
  var TIME_KEYS = ["inTime","inReal","outTime","outReal"];
  return vals.map(function(r, ri){
    if (!r[0]) return null;
    var o = {}; KEYS.forEach(function(k, i){ o[k] = r[i]; });
    o.date = o.date instanceof Date ? Utilities.formatDate(o.date, TZ, "yyyy-MM-dd") : String(o.date);
    // الأوقات تُقرأ كما تظهر في الخلية (حتى لو عدّلها أحد يدويًا في الشيت) لتجنب انحراف المنطقة الزمنية
    TIME_KEYS.forEach(function(k){ o[k] = validTime_(disp[ri][KEYS.indexOf(k)]) || ""; });
    BOOL_KEYS.forEach(function(k){ o[k] = o[k] === true || o[k] === "نعم"; });
    o.points = Number(o.points) || 0;
    return o;
  }).filter(function(o){ return o; });
}
function writeRecord_(rec){
  var mk = attMonthKey(rec.date), sh = monthSheet_(mk, true);
  var row = KEYS.map(function(k){
    var v = rec[k];
    if (BOOL_KEYS.indexOf(k) !== -1) return v ? "نعم" : "";
    if (v === undefined || v === null || v === "") return "";
    // التاريخ والأوقات تُكتب كنص (بعلامة ') حتى لا يحوّلها جوجل شيت إلى قيمة وقت تنحرف عند القراءة
    if (k === "date" || k === "inTime" || k === "inReal" || k === "outTime" || k === "outReal") return "'" + v;
    return v;
  });
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function(r){ return r[0]; }) : [];
  var idx = ids.indexOf(rec.id);
  var rowNum = idx === -1 ? sh.getLastRow() + 1 : idx + 2;
  sh.getRange(rowNum, 1, 1, KEYS.length).setValues([row]);
}

// يعيد حساب التأخير والخصم لكل الشهر ويكتب الملخص بجانب الجدول
function recalcMonth_(mk){
  PropertiesService.getScriptProperties().deleteProperty("dirty_" + mk);
  var sh = monthSheet_(mk, false); if (!sh) return;
  var res = attComputeMonth(readMonth_(mk), getRules_());
  var byId = {}; res.records.forEach(function(r){ byId[r.id] = r; });
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    var out = ids.map(function(r){ var x = byId[r[0]]; return x ? [x.opener && x.lateMin !== null ? x.lateMin : "", x.cat, x.deduct] : ["", "", ""]; });
    sh.getRange(2, KEYS.indexOf("lateMin") + 1, out.length, 3).setValues(out);
    var hrs = ids.map(function(r){ var x = byId[r[0]]; return x ? [x.workedMin === null ? "" : attFmtDur(x.workedMin), x.shortMin === null ? "" : x.shortMin] : ["", ""]; });
    sh.getRange(2, KEYS.indexOf("worked") + 1, hrs.length, 2).setNumberFormat("@").setValues(hrs);
    sh.getRange(2, 1, last - 1, COLS.length).sort([{ column: 2, ascending: true }, { column: 4, ascending: true }]);
  }
  // ملخص الشهر
  var head = ["الموظف","أيام الحضور","ساعات العمل","المطلوب","أيام فتح المحل","أيام الإغلاق","منتظم","16–30 د","31–60 د","أكثر من ساعة","سماح شهري","عذر طارئ","غياب","غياب بعذر","أيام العطل","سفر عمل","إغلاق الشركة","بانتظار الموافقة","مجموع الخصم (يوم)","النقاط","التقييم","فروق الوقت","ملاحظة للإدارة"];
  var rows = Object.keys(res.summary).map(function(k){
    var s = res.summary[k];
    return [s.emp, s.present, attFmtDur(s.workedMin), attFmtDur(s.reqMin), s.openDays, s.closeDays, s.onTime, s.t2, s.t3, s.t4, s.allowance, s.excuse, s.absent, s.absentExcused, s.leave, s.trip, s.closed, s.pending, s.deduct, s.points, s.rating, s.diffCount, s.diffAlert];
  });
  sh.getRange(1, SUMMARY_COL, Math.max(sh.getMaxRows(), 2), head.length + 4).clearContent();
  sh.getRange(1, SUMMARY_COL, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#E10A1E").setFontColor("#FFFFFF");
  if (rows.length) sh.getRange(2, SUMMARY_COL, rows.length, head.length).setNumberFormat("@").setValues(rows);
  // ملاحظات الأيام: من فتح المحل ومن أغلقه
  var fr = rows.length + 4;
  sh.getRange(fr, SUMMARY_COL, 1, 2).setValues([["التاريخ","ملاحظات اليوم"]]).setFontWeight("bold");
  if (res.dayFlags.length) sh.getRange(fr + 1, SUMMARY_COL, res.dayFlags.length, 2)
    .setValues(res.dayFlags.map(function(d){ return [d.date, d.flags.join(" | ")]; }));
}

// أيام العمل بين تاريخين (شاملة) مع التحقق من الحدود
function rangeDays_(from, to, rules, now, minOff, maxOff){
  from = String(from || ""); to = String(to || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("اختر تاريخ البداية والنهاية");
  var a = attParseDate(from), b = attParseDate(to), t = attParseDate(now.date);
  if (b < a) throw new Error("تاريخ النهاية قبل البداية");
  if ((b - a) / 86400000 > 45) throw new Error("الفترة طويلة جدًا (الحد 45 يومًا)");
  if ((a - t) / 86400000 < minOff || (b - t) / 86400000 > maxOff) throw new Error("التاريخ بعيد جدًا");
  var out = [];
  for (var d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    ds = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    if (attIsWorkday(ds, rules)) out.push(ds);
  }
  if (!out.length) throw new Error("لا توجد أيام عمل في هذه الفترة");
  return out;
}
function monthsBetween_(a, b){
  var out = [], m = attMonthKey(a), end = attMonthKey(b);
  while (m <= end) { out.push(m); var y = Number(m.slice(0, 4)), mo = Number(m.slice(5)) + 1; if (mo > 12) { mo = 1; y++; } m = y + "-" + (mo < 10 ? "0" : "") + mo; }
  return out;
}
// يكتب سجلًا لكل (يوم × موظف) عبر الأشهر؛ fn تعدّل السجل وترجع false لتخطيه
function writeRange_(days, emps, fn){
  var done = 0, skipped = [];
  monthsBetween_(days[0], days[days.length - 1]).forEach(function(m){
    var rows = readMonth_(m), touched = false;
    days.filter(function(d){ return attMonthKey(d) === m; }).forEach(function(ds){
      emps.forEach(function(e){
        var rec = rows.filter(function(r){ return r.emp === e.name && r.date === ds; })[0];
        var isNew = !rec;
        rec = rec || { id: Utilities.getUuid().slice(0, 8), date: ds, day: attDayName(ds), emp: e.name, points: 0 };
        if (!isNew && /سُجّل تلقائيًا/.test(rec.note || "")) rec.note = "";
        if (fn(rec) === false) { skipped.push((emps.length > 1 ? firstName_(e.name) + " " : "") + Number(ds.slice(8)) + "/" + Number(ds.slice(5, 7))); return; }
        writeRecord_(rec); done++; touched = true;
      });
    });
    if (touched) markDirty_(m);
  });
  return { done: done, skipped: skipped };
}
function firstName_(n){ return String(n).split(" ")[0]; }

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
  getEmployees_().filter(function(e){ return e.active && e.counted; }).forEach(function(e){
    if (rows.some(function(r){ return r.emp === e.name; })) return;
    writeRecord_({ id: Utilities.getUuid().slice(0, 8), date: now.date, day: attDayName(now.date), emp: e.name,
                   inStatus: ATT_STATUS.ABSENT, note: "سُجّل تلقائيًا" });
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
    e.getRange(1, 1, 1, 5).setValues([["رقم","اسم الموظف","ساعات العمل اليومية (فارغ = 8)","الحالة","الدور"]]).setFontWeight("bold");
    e.getRange(2, 1, 3, 5).setValues([[1,"إسلام الجهاني","","نشط",ROLE_ADMIN],[2,"حكيم سحيم","","نشط",ROLE_STAFF],[3,"أنس الترهوني","","نشط",ROLE_STAFF]]);
  }
  else ss.getSheetByName(SH_EMP).getRange(1, 3).setValue("ساعات العمل اليومية (فارغ = 8)");
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
  // تحديث ملخص الشهر في الشيت كل 10 دقائق (بدل حسابه مع كل تسجيل — أسرع للموظف)
  var has2 = ScriptApp.getProjectTriggers().some(function(t){ return t.getHandlerFunction() === "recalcDirty"; });
  if (!has2) ScriptApp.newTrigger("recalcDirty").timeBased().everyMinutes(10).create();
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
function validTime_(t){
  var s = String(t || "").trim().replace(/[٠-٩]/g, function(d){ return "٠١٢٣٤٥٦٧٨٩".indexOf(d); })
            .replace(/[۰-۹]/g, function(d){ return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); });
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|ص|م)?$/i);
  if (!m) return null;
  var h = +m[1], mi = +m[2], ap = (m[3] || "").toUpperCase();
  if (ap === "PM" || ap === "م") { if (h < 12) h += 12; } else if ((ap === "AM" || ap === "ص") && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi;
}

// حالة "تحتاج إعادة حساب" لكل شهر — الحساب الكامل يتم عند فتح الإدارة أو كل 10 دقائق
function markDirty_(mk){ PropertiesService.getScriptProperties().setProperty("dirty_" + mk, "1"); }
function isDirty_(mk){ return PropertiesService.getScriptProperties().getProperty("dirty_" + mk) === "1"; }
function recalcDirty(){
  var props = PropertiesService.getScriptProperties(), all = props.getProperties();
  Object.keys(all).forEach(function(k){
    if (k.indexOf("dirty_") !== 0 || all[k] !== "1") return;
    recalcMonth_(k.slice(6));
  });
}

// وقت التسجيل: وقت الخادم، إلا إذا أُرسل الطلب متأخرًا من هاتف بلا إنترنت (أكثر من 3 دقائق)
function queuedNow_(req){
  var now = nowParts_();
  var cd = String(req.clientDate || ""), ct = validTime_(req.clientTime);
  if (!ct || !/^\d{4}-\d{2}-\d{2}$/.test(cd)) return now;
  var y = new Date(Date.now() - 86400000), yest = Utilities.formatDate(y, TZ, "yyyy-MM-dd");
  if (cd !== now.date && cd !== yest) return now;
  var late = (cd === now.date ? attToMin(now.time) : attToMin(now.time) + 1440) - attToMin(ct);
  if (late < 3 || late > 1440) return now;
  return { date: cd, time: ct, day: attDayName(cd),
           lateNote: "سُجّل على الهاتف الساعة " + ct + " ووصل للخادم الساعة " + now.time + " (ضعف الإنترنت)" };
}
function locDistance_(req, rules){
  if (typeof req.lat !== "number" || typeof req.lng !== "number") return null;
  return attDistance(req.lat, req.lng, rules.shop_lat, rules.shop_lng);
}
function joinNote_(a, b){ b = String(b || "").trim().slice(0, 200); return !b ? (a || "") : (a ? a + " | " + b : b); }
function yn_(v){ return v ? "نعم" : "لا"; }
function fieldLabel_(k){ return { opener: "فتح المحل", closer: "أغلق المحل", excuse: "عذر طارئ", allowance: "سماح شهري" }[k] || k; }
function describe_(r){
  if (r.inStatus === ATT_STATUS.LEAVE || r.inStatus === ATT_STATUS.TRIP || r.inStatus === ATT_STATUS.CLOSED) return r.inStatus;
  var t = function(v, real){ return (v || "—") + (real && real !== v ? " [سُجّل فعليًا " + real + "]" : ""); };
  return "حضور " + t(r.inTime, r.inReal) + " (" + (r.inStatus || "—") + ")" + (r.outTime ? "، انصراف " + t(r.outTime, r.outReal) + " (" + r.outStatus + ")" : "");
}
function decisionLabel_(d){
  return { approve: "موافقة", reject: "رفض", excuse: "موافقة كعذر طارئ", absent_excused: "غياب بعذر",
           absent: "غياب بدون عذر", stay_points: "منح نقاط بقاء", stay_no: "رفض نقاط بقاء" }[d] || d;
}

// تشغيل يدوي مرة واحدة بعد نشر هذا الإصدار: يضيف عمود «الدور» ويضبط الأدوار الحالية
// (إسلام = أدمن، حكيم وأنس = موظف). أي شخص آخر بلا قيمة يُعتبر موظفًا. «الإدارة» تُضبط من صفحة الموظفين.
function migrateRoles(){
  var sh = sheet_(SH_EMP);
  if (!String(sh.getRange(1, 5).getValue() || "").trim()) sh.getRange(1, 5).setValue("الدور").setFontWeight("bold");
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (!vals[i][1] || String(vals[i][4] || "").trim()) continue;
    var n = String(vals[i][1]).trim();
    sh.getRange(i + 1, 5).setValue(/^إسلام/.test(n) ? ROLE_ADMIN : ROLE_STAFF);
  }
  bust_();
}

// =====================================================================
// رفع صور الأصناف — يُضاف إلى all.gs بعد server.gs (انظر build-all.js)
// ---------------------------------------------------------------------
// • الهوية تُتحقق هنا في الخادم وليس في الصفحة فقط:
//     - إدارة عامة: توكن Firebase صالح + إيميل ضمن ADMIN_EMAILS
//     - موظف: هاتف معتمد في ورقة «الأجهزة» (نظام الحضور) والموظف غير موقوف
//       (القائمة تُقرأ من الشيت، فأي موظف يُضاف لاحقًا يعمل تلقائيًا)
//     - أي هاتف آخر: مرفوض
// • الإدارة: الصورة تُنشر مباشرة إلى images/رقم-الصنف.jpg في GitHub
//   ويُحدَّث item-images.js ليظهر الصنف بصورته.
// • الموظف: الصورة تذهب لمجلد انتظار في Drive وتظهر في صفحة الموافقات للإدارة.
// • مفتاح GitHub يُقرأ من Script Properties فقط (GITHUB_TOKEN) ولا يُرسل
//   لأي صفحة ولا يُكتب في أي ملف.
//
// الإعدادات في Script Properties (إعدادات المشروع ← خصائص النص):
//   GITHUB_TOKEN   (إلزامي) مفتاح Fine-grained بصلاحية Contents: Read and write على المستودع فقط
//   GITHUB_REPO    (اختياري) الافتراضي companyjadu-sketch/JADU-APP
//   GITHUB_BRANCH  (اختياري) الافتراضي main
// =====================================================================

var SH_PHOTOS = "صور الأصناف";
var PH_COLS = ["id","رقم الصنف","اسم الصنف","من","الطريقة","وقت الرفع","ملف Drive","الحالة","قرار من","وقت القرار","ملاحظة"];
var PH_STAGED = "جاهزة للنشر";
var PH_PENDING = "بانتظار الموافقة", PH_APPROVED = "مقبولة", PH_REJECTED = "مرفوضة", PH_PUBLISHED = "نُشرت مباشرة";
var PH_MAX_BYTES = 1200000;
var PH_DEFAULT_REPO = "companyjadu-sketch/JADU-APP", PH_DEFAULT_BRANCH = "main";
var PH_FOLDER_NAME = "جادو — صور بانتظار الموافقة";
// طلب «ربط صورة موجودة»: لا ملف في Drive؛ عمود «ملف Drive» يحمل link:رقم-الصنف-المصدر
var PH_LINK = "link:";
// نفس رابط الشيت المنشور الذي يقرأه الموقع (للتأكد أن رقم الصنف موجود)
var PH_SHEET_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYJP_O-jmrABM6jSTcEGTq5WZAE1J5k-wO-deCQvnpM_5gHbZmuYR2PVR7cPSZoAQHXtk68dOzH65K/pub?gid=385150651&single=true&output=csv";

// خطأ لا فائدة من إعادة المحاولة عليه (الموقع يتوقف عن المحاولة ويعرض الرسالة)
function fatal_(msg){ var e = new Error(msg); e.fatal = true; return e; }

// ---------------------------------------------------------------------
// الهوية
// ---------------------------------------------------------------------
// يرجع { role: "admin" | "staff" | "none", name }  — لا يرمي خطأ للهاتف غير المسجّل
function photoWho_(req){
  if (req.idToken) {
    try { return { role: "admin", name: authAdmin_(req) }; } catch (e) { /* التوكن غير صالح: نجرب الهاتف */ }
  }
  var devId = String(req.deviceId || "");
  if (devId.length >= 8) {
    var dev = getDevices_().filter(function(d){ return d.deviceId === devId && d.status === DEV_OK; })[0];
    if (dev) {
      var emp = getEmployees_().filter(function(x){ return String(x.id) === String(dev.empId) && x.active; })[0];
      if (emp) return { role: "staff", name: emp.name };
    }
  }
  return { role: "none", name: "" };
}
function photoAdmin_(req){
  var w = photoWho_(req);
  if (w.role !== "admin") throw fatal_("هذه العملية للإدارة العامة فقط");
  return w.name;
}

// ---------------------------------------------------------------------
// التحقق من المدخلات
// ---------------------------------------------------------------------
function cleanItemNo_(v){
  var s = String(v == null ? "" : v).trim();
  if (!/^[A-Za-z0-9_\-]{1,30}$/.test(s)) throw fatal_("رقم الصنف غير صالح");
  return s;
}
function decodeJpeg_(b64){
  var s = String(b64 || "").replace(/^data:image\/\w+;base64,/, "");
  if (!s) throw fatal_("لا توجد صورة");
  var bytes;
  try { bytes = Utilities.base64Decode(s); } catch (e) { throw fatal_("صورة غير صالحة"); }
  if (bytes.length < 1000) throw fatal_("صورة غير صالحة");
  if (bytes.length > PH_MAX_BYTES) throw fatal_("حجم الصورة كبير بعد الضغط");
  // JPEG يبدأ بـ FF D8 FF (البايتات في Apps Script موقّعة)
  if (!(bytes[0] === -1 && bytes[1] === -40 && bytes[2] === -1)) throw fatal_("الصورة يجب أن تكون JPEG");
  return bytes;
}
// أرقام الأصناف من الشيت المنشور (للتأكد أن الرقم موجود). null = تعذّر التحقق فلا نمنع
function knownItems_(){
  var cache = CacheService.getScriptCache(), hit = cache.get("ph_items");
  if (hit) return JSON.parse(hit);
  try {
    var res = UrlFetchApp.fetch(PH_SHEET_CSV, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var rows = Utilities.parseCsv(res.getContentText());
    var col = rows[0].map(function(h){ return String(h).trim(); }).indexOf("رقم الصنف");
    if (col < 0) return null;
    var nums = [];
    for (var i = 1; i < rows.length; i++) { var n = String(rows[i][col] || "").trim(); if (n) nums.push(n); }
    if (!nums.length) return null;
    try { cache.put("ph_items", JSON.stringify(nums), 6 * 3600); } catch (e) {}
    return nums;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// سجل الصور (ورقة «صور الأصناف») + مجلد الانتظار في Drive
// ---------------------------------------------------------------------
function photoSheet_(){
  var sh = ss_().getSheetByName(SH_PHOTOS);
  if (!sh) {
    sh = ss_().insertSheet(SH_PHOTOS); sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, PH_COLS.length).setValues([PH_COLS]).setFontWeight("bold");
    sh.getRange("A:B").setNumberFormat("@");
    sh.setFrozenRows(1);
  }
  return sh;
}
function photoRows_(){
  var sh = photoSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, PH_COLS.length).getValues().map(function(r, i){
    return { row: i + 2, id: String(r[0]), itemNo: String(r[1]), itemNos: String(r[1]).split(",").filter(Boolean), itemName: r[2], by: r[3], how: r[4],
             at: r[5] instanceof Date ? fmtDateTime_(r[5]) : String(r[5]), fileId: r[6], status: r[7],
             from: String(r[6]).indexOf(PH_LINK) === 0 ? String(r[6]).slice(PH_LINK.length) : "" };
  }).filter(function(x){ return x.id; });
}
function photoAdd_(id, itemNo, itemName, by, how, status, fileId){
  photoSheet_().appendRow([id, itemNo, String(itemName || "").slice(0, 120), by, how, new Date(), fileId || "", status, "", "", ""]);
}
function photoDecide_(row, status, who){
  var sh = photoSheet_();
  sh.getRange(row, 8, 1, 3).setValues([[status, who, new Date()]]);
}
function pendingFolder_(){
  var props = PropertiesService.getScriptProperties(), id = props.getProperty("PENDING_FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.getFoldersByName(PH_FOLDER_NAME);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(PH_FOLDER_NAME);
  props.setProperty("PENDING_FOLDER_ID", f.getId());
  return f;
}

// ---------------------------------------------------------------------
// GitHub (المفتاح من Script Properties فقط)
// ---------------------------------------------------------------------
function ghCfg_(){
  var p = PropertiesService.getScriptProperties(), t = p.getProperty("GITHUB_TOKEN");
  if (!t) throw fatal_("مفتاح GitHub غير مضاف في Script Properties");
  return { token: t, repo: p.getProperty("GITHUB_REPO") || PH_DEFAULT_REPO, branch: p.getProperty("GITHUB_BRANCH") || PH_DEFAULT_BRANCH };
}
function ghOpt_(cfg, method, path, body){
  var opt = { url: "https://api.github.com/repos/" + cfg.repo + path, method: method, muteHttpExceptions: true, contentType: "application/json",
    headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "jadu-apps-script" } };
  if (body) opt.payload = JSON.stringify(body);
  return opt;
}
function ghParse_(res){
  var json = null;
  try { json = JSON.parse(res.getContentText()); } catch (e) {}
  return { code: res.getResponseCode(), json: json };
}
function gh_(cfg, method, path, body){
  var o = ghOpt_(cfg, method, path, body), url = o.url; delete o.url;
  return ghParse_(UrlFetchApp.fetch(url, o));
}
function ghFail_(r){
  if (r.code === 401 || r.code === 403) return fatal_("مفتاح GitHub غير صالح أو لا يملك صلاحية الكتابة على المستودع");
  return new Error("تعذّر الحفظ في GitHub (" + r.code + ")" + (r.json && r.json.message ? ": " + r.json.message : ""));
}

// يضيف/يعدّل سطر الصنف داخل قائمة ITEM_IMAGES فقط (دون لمس MODEL_IMAGES ولا TYPE_CODE_IMAGES)
function setItemImageEntry_(src, itemNo, value){
  var start = src.indexOf("const ITEM_IMAGES = {");
  if (start < 0) throw new Error("تعذّر إيجاد قائمة ITEM_IMAGES في item-images.js");
  var bodyStart = src.indexOf("{", start) + 1;
  var end = src.indexOf("\n};", bodyStart);
  if (end < 0) throw new Error("تعذّر إيجاد نهاية قائمة ITEM_IMAGES في item-images.js");
  var body = src.slice(bodyStart, end);
  var re = new RegExp('(^|\\n)([ \\t]*)"' + itemNo.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + '"[ \\t]*:[ \\t]*"[^"]*"');
  if (re.test(body)) body = body.replace(re, function(m, nl, ind){ return nl + ind + '"' + itemNo + '": "' + value + '"'; });
  else body = body.replace(/\s*$/, "") + '\n  "' + itemNo + '": "' + value + '",';
  return src.slice(0, bodyStart) + body + src.slice(end);
}

// خريطة الصور الحالية داخل ITEM_IMAGES: رقم الصنف ← المسار (بدون ?v=)
function itemImageRefs_(src){
  var start = src.indexOf("const ITEM_IMAGES = {"), out = {};
  if (start < 0) return out;
  var bodyStart = src.indexOf("{", start) + 1, end = src.indexOf("\n};", bodyStart);
  var body = src.slice(bodyStart, end < 0 ? src.length : end), re = /(?:^|\n)[ \t]*"([^"]+)"[ \t]*:[ \t]*"([^"?]*)(?:\?[^"]*)?"/g, m;
  while ((m = re.exec(body))) out[m[1]] = m[2];
  return out;
}

// القيمة الكاملة لصورة الصنف داخل ITEM_IMAGES (مع ?v=) أو "" إن لم توجد
function itemImageRaw_(src, itemNo){
  var start = src.indexOf("const ITEM_IMAGES = {");
  if (start < 0) return "";
  var bodyStart = src.indexOf("{", start) + 1, end = src.indexOf("\n};", bodyStart);
  var body = src.slice(bodyStart, end < 0 ? src.length : end);
  var m = new RegExp('(?:^|\\n)[ \\t]*"' + itemNo.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + '"[ \\t]*:[ \\t]*"([^"]*)"').exec(body);
  return m ? m[1] : "";
}

// ينشر مجموعة صور في commit واحد (Git Data API): كل الملفات الجديدة + تعديل item-images.js معًا،
// فيُعاد بناء GitHub Pages مرة واحدة فقط.
// entries = [{ itemNos: [..], bytes }] — الصورة الواحدة تُحفظ مرة واحدة ويشير إليها كل أصنافها (بلا نسخ للملف).
// اسم الملف: images/أول-صنف.jpg؛ لكن إن كان هذا الملف مستخدمًا لصنف آخر خارج هذه الصورة
// (صورة مشتركة سابقة) نستعمل اسمًا جديدًا حتى لا يتغيّر شكل الصنف الآخر.
// يرجع { رقم الصنف: "images/....jpg?v=..." }
// links = [{ from, to }]: ربط صنف بصورة صنف آخر موجودة (بلا ملف جديد) — في نفس الـ commit
function publishImages_(entries, who, links){
  links = links || [];
  // الصنف الذي تظهر له صورتان في الدفعة: آخر واحدة تفوز؛ والصورة التي خسرت كل أصنافها تُحذف
  var owner = {};
  entries.forEach(function(e, i){ e.itemNos.forEach(function(n){ owner[n] = i; }); });
  var keep = [];
  entries.forEach(function(e, i){
    var mine = e.itemNos.filter(function(n){ return owner[n] === i; });
    if (mine.length) keep.push({ itemNos: mine, bytes: e.bytes });
  });
  if (!keep.length && !links.length) return {};
  var cfg = ghCfg_(), stamp = Utilities.formatDate(new Date(), TZ, "yyyyMMddHHmmss");
  // 1) الصور كـ blobs (طلبات متوازية)
  var blobSha = !keep.length ? [] : UrlFetchApp.fetchAll(keep.map(function(e){
    return ghOpt_(cfg, "POST", "/git/blobs", { content: Utilities.base64Encode(e.bytes), encoding: "base64" });
  })).map(function(r){
    var j = ghParse_(r);
    if (j.code !== 201) throw ghFail_(j);
    return j.json.sha;
  });
  var all = [];
  keep.forEach(function(e){ all = all.concat(e.itemNos); });
  var msg = (keep.length ? "إضافة " + keep.length + " صورة (" + all.length + " صنف)" : "ربط " + links.length + " صنف بصور موجودة") + " — " + who +
    "\n\nالأصناف: " + all.concat(links.map(function(l){ return l.to + "←" + l.from; })).slice(0, 60).join("، ");
  for (var attempt = 0; attempt < 4; attempt++) {
    var ref = gh_(cfg, "GET", "/git/ref/heads/" + encodeURIComponent(cfg.branch));
    if (ref.code !== 200) throw ghFail_(ref);
    var head = ref.json.object.sha;
    var commit = gh_(cfg, "GET", "/git/commits/" + head);
    if (commit.code !== 200) throw ghFail_(commit);
    var cur = gh_(cfg, "GET", "/contents/item-images.js?ref=" + head);
    if (cur.code !== 200) throw ghFail_(cur);
    var js = Utilities.newBlob(Utilities.base64Decode(String(cur.json.content).replace(/\s/g, ""))).getDataAsString("UTF-8");
    var paths = {}, tree = [], used = {};
    keep.forEach(function(e, i){
      var file = "images/" + e.itemNos[0] + ".jpg", refs = itemImageRefs_(js), mineSet = {};
      e.itemNos.forEach(function(n){ mineSet[n] = true; });
      var shared = Object.keys(refs).some(function(k){ return refs[k] === file && !mineSet[k]; });
      if (shared || used[file]) file = "images/" + e.itemNos[0] + "-" + stamp + (i ? "-" + i : "") + ".jpg";
      used[file] = true;
      e.itemNos.forEach(function(n){ paths[n] = file + "?v=" + stamp; js = setItemImageEntry_(js, n, paths[n]); });
      tree.push({ path: file, mode: "100644", type: "blob", sha: blobSha[i] });
    });
    links.forEach(function(l){
      var v = paths[l.from] || itemImageRaw_(js, l.from);
      if (!v) throw fatal_("الصنف " + l.from + " لم تعد له صورة على الموقع — لا يمكن الربط");
      paths[l.to] = v; js = setItemImageEntry_(js, l.to, v);
    });
    var jsBlob = gh_(cfg, "POST", "/git/blobs", { content: js, encoding: "utf-8" });
    if (jsBlob.code !== 201) throw ghFail_(jsBlob);
    tree.push({ path: "item-images.js", mode: "100644", type: "blob", sha: jsBlob.json.sha });
    var t = gh_(cfg, "POST", "/git/trees", { base_tree: commit.json.tree.sha, tree: tree });
    if (t.code !== 201) throw ghFail_(t);
    var c = gh_(cfg, "POST", "/git/commits", { message: msg, tree: t.json.sha, parents: [head] });
    if (c.code !== 201) throw ghFail_(c);
    var up = gh_(cfg, "PATCH", "/git/refs/heads/" + encodeURIComponent(cfg.branch), { sha: c.json.sha, force: false });
    if (up.code === 200) return paths;
    if (up.code === 409 || up.code === 422) { Utilities.sleep(900 * (attempt + 1)); continue; }   // أحدٌ دفع commit للتو: نعيد على آخر نسخة
    throw ghFail_(up);
  }
  throw new Error("تعذّر النشر في GitHub بسبب تعارض متكرر — حاول مرة أخرى");
}

// ينشر صفوفًا من السجل (ملفاتها في Drive) على دفعات من 100 صورة، ويرجع مسارات الأصناف
function publishRows_(rows, who){
  var paths = {}, imgs = rows.filter(function(r){ return !r.from; });
  var links = rows.filter(function(r){ return r.from; }).map(function(r){ return { from: r.from, to: r.itemNos[0] }; });
  if (!imgs.length) return links.length ? publishImages_([], who, links) : paths;
  for (var i = 0; i < imgs.length; i += 100) {
    var chunk = imgs.slice(i, i + 100);
    var p = publishImages_(chunk.map(function(r){ return { itemNos: r.itemNos, bytes: DriveApp.getFileById(r.fileId).getBlob().getBytes() }; }), who, i ? [] : links);
    for (var k in p) paths[k] = p[k];
    chunk.forEach(function(r){ try { DriveApp.getFileById(r.fileId).setTrashed(true); } catch (e) {} });
  }
  return paths;
}

// ---------------------------------------------------------------------
// الواجهة البرمجية
// ---------------------------------------------------------------------
// من أنا؟ يستعملها الموقع ليقرر إظهار زر «إضافة صور» (والتحقق الحقيقي يتكرر في كل عملية)
API.img_whoami = function(req){
  var w = photoWho_(req);
  return { role: w.role, name: w.name };
};

// رفع صورة واحدة (الموقع يرفع واحدة واحدة). id يصنعه الموقع فإعادة المحاولة بعد انقطاع الإنترنت لا تكرّر الصورة
API.img_upload = function(req){
  var who = photoWho_(req);
  if (who.role === "none") throw fatal_("هذا الهاتف غير مسجّل كموظف — لا يمكنه رفع الصور");
  var id = String(req.id || "").replace(/[^\w\-]/g, "").slice(0, 40);
  if (id.length < 8) throw fatal_("معرّف الصورة غير صالح");
  // الصورة الواحدة قد تخص عدة أصناف (itemNos)؛ itemNo وحده يبقى مدعومًا
  var raw = req.itemNos && req.itemNos.length ? req.itemNos : [req.itemNo], itemNos = [];
  if (raw.length > 12) throw fatal_("أكثر من 12 صنفًا لصورة واحدة");
  raw.forEach(function(n){ n = cleanItemNo_(n); if (itemNos.indexOf(n) === -1) itemNos.push(n); });
  var known = knownItems_();
  if (known) itemNos.forEach(function(n){ if (known.indexOf(n) === -1) throw fatal_("رقم الصنف " + n + " غير موجود في الشيت"); });
  var again = photoRows_().filter(function(x){ return x.id === id; })[0];
  if (again) return { status: again.status === PH_PUBLISHED ? "published" : again.status === PH_STAGED ? "staged" : "pending", duplicate: true };
  var bytes = decodeJpeg_(req.data);
  var name = (req.itemNames && req.itemNames.length ? req.itemNames : [req.itemName || ""]).map(function(s){ return String(s).replace(/\|/g, " "); }).join(" | ");
  var no = itemNos.join(",");
  var file = pendingFolder_().createFile(Utilities.newBlob(bytes, "image/jpeg", itemNos[0] + "__" + id + ".jpg"));
  if (who.role === "admin") {
    // الإدارة: تُحفظ مؤقتًا ثم تُنشر كلها في commit واحد عند استدعاء img_publish (آخر الدفعة)
    photoAdd_(id, no, name, who.name, "إدارة", PH_STAGED, file.getId());
    return { status: "staged" };
  }
  photoAdd_(id, no, name, who.name, "موظف", PH_PENDING, file.getId());
  return { status: "pending" };
};

// نشر كل صور الإدارة المرفوعة (staged) في commit واحد. آمنة للتكرار: لو لا يوجد شيء ترجع count = 0
API.img_publish = function(req){
  var who = photoAdmin_(req);
  var rows = photoRows_().filter(function(x){ return x.status === PH_STAGED; });
  if (!rows.length) return { count: 0, paths: {} };
  var paths = publishRows_(rows, who);
  rows.forEach(function(r){ photoDecide_(r.row, PH_PUBLISHED, who); });
  return { count: rows.length, paths: paths };
};

// ربط صنف بصورة صنف آخر موجودة على الموقع (بدون رفع ولا نسخ الملف)
// الإدارة: يُنشر مباشرة. الموظف: يذهب لصفحة الموافقات مثل الصور.
API.img_link = function(req){
  var who = photoWho_(req);
  if (who.role === "none") throw fatal_("هذا الهاتف غير مسجّل كموظف — لا يمكنه ربط الصور");
  var from = cleanItemNo_(req.from), to = cleanItemNo_(req.to);
  if (from === to) throw fatal_("اختر صنفًا آخر غير نفس الصنف");
  var known = knownItems_();
  if (known) [from, to].forEach(function(n){ if (known.indexOf(n) === -1) throw fatal_("رقم الصنف " + n + " غير موجود في الشيت"); });
  var id = String(req.id || "").replace(/[^\w\-]/g, "").slice(0, 40);
  if (id.length < 8) throw fatal_("معرّف الطلب غير صالح");
  var again = photoRows_().filter(function(x){ return x.id === id; })[0];
  if (again) return { status: again.status === PH_PENDING ? "pending" : "published", duplicate: true };
  var name = String(req.toName || "").replace(/\|/g, " ");
  if (who.role === "admin") {
    var paths = publishImages_([], who.name + " (ربط صورة)", [{ from: from, to: to }]);
    photoAdd_(id, to, name, who.name, "ربط — إدارة", PH_PUBLISHED, PH_LINK + from);
    return { status: "published", path: paths[to] };
  }
  photoAdd_(id, to, name, who.name, "ربط — موظف", PH_PENDING, PH_LINK + from);
  return { status: "pending" };
};

function pendingRows_(){ return photoRows_().filter(function(x){ return x.status === PH_PENDING; }); }

// عدد الصور المنتظرة (للجرس)
API.img_pending_count = function(req){
  photoAdmin_(req);
  return { count: pendingRows_().length };
};
API.img_pending_list = function(req){
  photoAdmin_(req);
  return { items: pendingRows_().slice(-300).map(function(x){ return { id: x.id, itemNos: x.itemNos, itemNames: String(x.itemName || "").split(" | "), by: x.by, at: x.at, from: x.from }; }) };
};
// الصورة نفسها لمعاينتها في صفحة الموافقات
API.img_pending_get = function(req){
  photoAdmin_(req);
  var r = pendingRows_().filter(function(x){ return x.id === String(req.id); })[0];
  if (!r) throw fatal_("الصورة غير موجودة أو تمت معالجتها");
  if (r.from) throw fatal_("طلب ربط — الصورة موجودة على الموقع");
  return { data: Utilities.base64Encode(DriveApp.getFileById(r.fileId).getBlob().getBytes()) };
};
// قرار الإدارة: approve | reject
API.img_decide = function(req){
  var who = photoAdmin_(req);
  var r = pendingRows_().filter(function(x){ return x.id === String(req.id); })[0];
  if (!r) throw fatal_("الصورة غير موجودة أو تمت معالجتها");
  if (req.decision === "approve") {
    var paths = publishRows_([r], who + " (اعتمد صورة " + r.by + ")");
    photoDecide_(r.row, PH_APPROVED, who);
    return { status: "approved", path: paths[r.itemNos[0]], paths: paths };
  }
  if (req.decision === "reject") {
    photoDecide_(r.row, PH_REJECTED, who);
    try { DriveApp.getFileById(r.fileId).setTrashed(true); } catch (e) {}
    return { status: "rejected" };
  }
  throw fatal_("قرار غير معروف");
};

// قرار على عدة صور دفعة واحدة (قبول الكل): كل المقبول في commit واحد (100 صورة كحد أقصى للـ commit)
API.img_decide_batch = function(req){
  var who = photoAdmin_(req);
  var ids = (req.ids || []).map(String);
  var rows = pendingRows_().filter(function(x){ return ids.indexOf(x.id) !== -1; });
  if (!rows.length) return { done: [], paths: {} };
  if (req.decision === "approve") {
    var paths = publishRows_(rows, who + " (اعتمد صور موظفين)");
    rows.forEach(function(r){ photoDecide_(r.row, PH_APPROVED, who); });
    return { done: rows.map(function(r){ return r.id; }), paths: paths };
  }
  if (req.decision === "reject") {
    rows.forEach(function(r){ photoDecide_(r.row, PH_REJECTED, who); try { DriveApp.getFileById(r.fileId).setTrashed(true); } catch (e) {} });
    return { done: rows.map(function(r){ return r.id; }), paths: {} };
  }
  throw fatal_("قرار غير معروف");
};

// شغّلها مرة واحدة من محرر السكربت: تمنح صلاحية Drive وتنشئ الورقة والمجلد
function photosSetup(){
  photoSheet_(); pendingFolder_();
  ghCfg_();           // يتأكد أن GITHUB_TOKEN موجود
  UrlFetchApp.fetch("https://api.github.com/zen", { muteHttpExceptions: true });
}
