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
  ABSENT: "غائب بدون عذر", ABSENT_EXCUSED: "غائب بعذر"
};

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
      allowance: 0, excuse: 0, absent: 0, absentExcused: 0, pending: 0, deduct: 0, points: 0, lateMin: 0, lostMin: 0,
      workedMin: 0, reqMin: 0, shortDays: 0, openDays: 0, closeDays: 0, diffs: [] });
    if (r.bigDiff) s.diffs.push({ date: r.date, inTime: r.inTime, inReal: r.inReal, inDiff: r.inDiff, outTime: r.outTime, outReal: r.outReal, outDiff: r.outDiff });
    if (r.inStatus === ATT_STATUS.PENDING || r.outStatus === ATT_STATUS.PENDING || r.pending) s.pending++;
    s.deduct += r.deduct || 0;
    s.points += Number(r.points) || 0;
    if (r.inStatus === ATT_STATUS.ABSENT || r.inStatus === ATT_STATUS.REJECTED) { s.absent++; return; }
    if (r.inStatus === ATT_STATUS.ABSENT_EXCUSED) { s.absentExcused++; return; }
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
  attDecideStatus: attDecideStatus, attDistance: attDistance, attHoursFor: attHoursFor, attTimeDiff: attTimeDiff, attMergeRules: attMergeRules, attToMin: attToMin
};
