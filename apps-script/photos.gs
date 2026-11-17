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

// ينشر مجموعة صور في commit واحد (Git Data API): كل الملفات الجديدة + تعديل item-images.js معًا،
// فيُعاد بناء GitHub Pages مرة واحدة فقط.
// entries = [{ itemNos: [..], bytes }] — الصورة الواحدة تُحفظ مرة واحدة ويشير إليها كل أصنافها (بلا نسخ للملف).
// اسم الملف: images/أول-صنف.jpg؛ لكن إن كان هذا الملف مستخدمًا لصنف آخر خارج هذه الصورة
// (صورة مشتركة سابقة) نستعمل اسمًا جديدًا حتى لا يتغيّر شكل الصنف الآخر.
// يرجع { رقم الصنف: "images/....jpg?v=..." }
function publishImages_(entries, who){
  // الصنف الذي تظهر له صورتان في الدفعة: آخر واحدة تفوز؛ والصورة التي خسرت كل أصنافها تُحذف
  var owner = {};
  entries.forEach(function(e, i){ e.itemNos.forEach(function(n){ owner[n] = i; }); });
  var keep = [];
  entries.forEach(function(e, i){
    var mine = e.itemNos.filter(function(n){ return owner[n] === i; });
    if (mine.length) keep.push({ itemNos: mine, bytes: e.bytes });
  });
  if (!keep.length) return {};
  var cfg = ghCfg_(), stamp = Utilities.formatDate(new Date(), TZ, "yyyyMMddHHmmss");
  // 1) الصور كـ blobs (طلبات متوازية)
  var blobSha = UrlFetchApp.fetchAll(keep.map(function(e){
    return ghOpt_(cfg, "POST", "/git/blobs", { content: Utilities.base64Encode(e.bytes), encoding: "base64" });
  })).map(function(r){
    var j = ghParse_(r);
    if (j.code !== 201) throw ghFail_(j);
    return j.json.sha;
  });
  var all = [];
  keep.forEach(function(e){ all = all.concat(e.itemNos); });
  var msg = "إضافة " + keep.length + " صورة (" + all.length + " صنف) — " + who + "\n\nالأصناف: " + all.slice(0, 60).join("، ") + (all.length > 60 ? " …" : "");
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
  var paths = {};
  for (var i = 0; i < rows.length; i += 100) {
    var chunk = rows.slice(i, i + 100);
    var p = publishImages_(chunk.map(function(r){ return { itemNos: r.itemNos, bytes: DriveApp.getFileById(r.fileId).getBlob().getBytes() }; }), who);
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

function pendingRows_(){ return photoRows_().filter(function(x){ return x.status === PH_PENDING; }); }

// عدد الصور المنتظرة (للجرس)
API.img_pending_count = function(req){
  photoAdmin_(req);
  return { count: pendingRows_().length };
};
API.img_pending_list = function(req){
  photoAdmin_(req);
  return { items: pendingRows_().slice(-300).map(function(x){ return { id: x.id, itemNos: x.itemNos, itemNames: String(x.itemName || "").split(" | "), by: x.by, at: x.at }; }) };
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
