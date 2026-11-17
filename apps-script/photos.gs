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
var PH_PENDING = "بانتظار الموافقة", PH_APPROVED = "مقبولة", PH_REJECTED = "مرفوضة", PH_PUBLISHED = "نُشرت مباشرة";
var PH_MAX_BYTES = 1200000;
var PH_DEFAULT_REPO = "companyjadu-sketch/JADU-APP", PH_DEFAULT_BRANCH = "main";
var PH_FOLDER_NAME = "جادو — صور بانتظار الموافقة";
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
    return { row: i + 2, id: String(r[0]), itemNo: String(r[1]), itemName: r[2], by: r[3], how: r[4],
             at: r[5] instanceof Date ? fmtDateTime_(r[5]) : String(r[5]), fileId: r[6], status: r[7] };
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
function gh_(cfg, method, path, body){
  var opt = { method: method, muteHttpExceptions: true, contentType: "application/json",
    headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "jadu-apps-script" } };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch("https://api.github.com/repos/" + cfg.repo + path, opt), json = null;
  try { json = JSON.parse(res.getContentText()); } catch (e) {}
  return { code: res.getResponseCode(), json: json };
}
function ghFail_(r){
  if (r.code === 401 || r.code === 403) return fatal_("مفتاح GitHub غير صالح أو لا يملك صلاحية الكتابة على المستودع");
  return new Error("تعذّر الحفظ في GitHub (" + r.code + ")" + (r.json && r.json.message ? ": " + r.json.message : ""));
}
// يقرأ ملفًا ثم يكتب نسخة جديدة منه؛ makeContent يستقبل المحتوى الحالي (أو null) ويرجع base64 الجديد (أو null = بلا تغيير)
function ghUpdateFile_(cfg, path, message, makeContent){
  var url = "/contents/" + encodeURI(path);
  for (var i = 0; i < 4; i++) {
    var cur = gh_(cfg, "GET", url + "?ref=" + encodeURIComponent(cfg.branch));
    if (cur.code !== 200 && cur.code !== 404) throw ghFail_(cur);
    var exists = cur.code === 200;
    var text = exists && cur.json.content ? Utilities.newBlob(Utilities.base64Decode(String(cur.json.content).replace(/\s/g, ""))).getDataAsString("UTF-8") : null;
    var next = makeContent(text);
    if (next === null) return;
    var body = { message: message, content: next, branch: cfg.branch };
    if (exists) body.sha = cur.json.sha;
    var put = gh_(cfg, "PUT", url, body);
    if (put.code === 200 || put.code === 201) return;
    if (put.code === 409 || put.code === 422) { Utilities.sleep(800 * (i + 1)); continue; }   // تعارض: أحدٌ عدّل الملف للتو
    throw ghFail_(put);
  }
  throw new Error("تعذّر الحفظ في GitHub بسبب تعارض متكرر — حاول مرة أخرى");
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

// ينشر الصورة: images/رقم.jpg ثم يربطها في item-images.js (رقم إصدار في الرابط حتى لا يبقى المتصفح على الصورة القديمة)
function publishImage_(itemNo, bytes, who){
  var cfg = ghCfg_(), path = "images/" + itemNo + ".jpg";
  var b64 = Utilities.base64Encode(bytes);
  ghUpdateFile_(cfg, path, "صورة الصنف " + itemNo + " — " + who, function(){ return b64; });
  var value = path + "?v=" + Utilities.formatDate(new Date(), TZ, "yyyyMMddHHmmss");
  ghUpdateFile_(cfg, "item-images.js", "ربط صورة الصنف " + itemNo, function(text){
    if (text === null) throw new Error("ملف item-images.js غير موجود في المستودع");
    var out = setItemImageEntry_(text, itemNo, value);
    return out === text ? null : Utilities.base64Encode(out, Utilities.Charset.UTF_8);
  });
  return { path: value };
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
  var itemNo = cleanItemNo_(req.itemNo);
  var known = knownItems_();
  if (known && known.indexOf(itemNo) === -1) throw fatal_("رقم الصنف " + itemNo + " غير موجود في الشيت");
  var again = photoRows_().filter(function(x){ return x.id === id; })[0];
  if (again) return { status: again.status === PH_PUBLISHED ? "published" : "pending", duplicate: true };
  var bytes = decodeJpeg_(req.data), name = String(req.itemName || "");
  if (who.role === "admin") {
    var pub = publishImage_(itemNo, bytes, who.name);
    photoAdd_(id, itemNo, name, who.name, "إدارة", PH_PUBLISHED, "");
    return { status: "published", path: pub.path };
  }
  var file = pendingFolder_().createFile(Utilities.newBlob(bytes, "image/jpeg", itemNo + "__" + id + ".jpg"));
  photoAdd_(id, itemNo, name, who.name, "موظف", PH_PENDING, file.getId());
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
  return { items: pendingRows_().slice(-300).map(function(x){ return { id: x.id, itemNo: x.itemNo, itemName: x.itemName, by: x.by, at: x.at }; }) };
};
// الصورة نفسها لمعاينتها في صفحة الموافقات
API.img_pending_get = function(req){
  photoAdmin_(req);
  var r = pendingRows_().filter(function(x){ return x.id === String(req.id); })[0];
  if (!r) throw fatal_("الصورة غير موجودة أو تمت معالجتها");
  return { data: Utilities.base64Encode(DriveApp.getFileById(r.fileId).getBlob().getBytes()) };
};
// قرار الإدارة: approve | reject
API.img_decide = function(req){
  var who = photoAdmin_(req);
  var r = pendingRows_().filter(function(x){ return x.id === String(req.id); })[0];
  if (!r) throw fatal_("الصورة غير موجودة أو تمت معالجتها");
  var file = DriveApp.getFileById(r.fileId);
  if (req.decision === "approve") {
    var pub = publishImage_(r.itemNo, file.getBlob().getBytes(), "اعتمدها " + who + " (من " + r.by + ")");
    photoDecide_(r.row, PH_APPROVED, who);
    file.setTrashed(true);
    return { status: "approved", path: pub.path };
  }
  if (req.decision === "reject") {
    photoDecide_(r.row, PH_REJECTED, who);
    file.setTrashed(true);
    return { status: "rejected" };
  }
  throw fatal_("قرار غير معروف");
};

// شغّلها مرة واحدة من محرر السكربت: تمنح صلاحية Drive وتنشئ الورقة والمجلد
function photosSetup(){
  photoSheet_(); pendingFolder_();
  ghCfg_();           // يتأكد أن GITHUB_TOKEN موجود
  UrlFetchApp.fetch("https://api.github.com/zen", { muteHttpExceptions: true });
}
