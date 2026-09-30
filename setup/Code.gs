/**
 * مزامنة بيانات جادو
 * ------------------------------------------------------------
 * يشتغل داخل الشيت الأصلي، ويسوي شيئين كل 5 دقائق:
 *  1) ينسخ الأعمدة العامة بس (بدون أسعار الشراء والجملة) لملف شيت منفصل
 *     "جادو — البيانات العامة" — وهذا الملف هو اللي ينشر للتطبيق.
 *  2) يرفع بيانات الشراء وسعر الجملة لقاعدة Firestore المحمية
 *     (ما يقراها إلا إيميلات الإدارة بعد تسجيل الدخول).
 *
 * الاستخدام: من القائمة "جادو" بالشيت ← "تشغيل الإعداد (مرة وحدة)".
 */

const FIREBASE_PROJECT = 'jadu-app-90418';
const SOURCE_SHEET_NAME = '';     // فارغ = أول ورقة بالملف
const QTY_PREFIX = 'كمية ';

// أعمدة تظهر للجميع (الزبون والموظف). أي عمود يبدأ بـ "كمية " يُضاف تلقائيًا.
// أي عمود جديد غير مذكور هنا يبقى مخفي افتراضيًا (للأمان).
const PUBLIC_COLS = [
  'رقم الصنف', 'اسم الصنف', 'سعر القطاعي', 'الشركة المصنعة', 'بلد الصنع',
  'اللون', 'شفرة النوع', 'التصنيف الرئيسي'
];

// أعمدة سرية — للإدارة فقط (تروح لقاعدة البيانات المحمية)
const PRIVATE_COLS = {
  'سعر الجملة': 'w',
  'آخر سعر شراء': 'p',
  'العملة': 'c',
  'سعر الصرف': 'r',
  'تاريخ آخر شراء': 'd'
};

const PUBLIC_FILE_NAME = 'جادو — البيانات العامة (للتطبيق)';
const CHUNK_SIZE = 3000; // عدد الأصناف بكل مستند بقاعدة البيانات

// ------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('جادو')
    .addItem('تشغيل الإعداد (مرة وحدة)', 'setup')
    .addItem('مزامنة الآن', 'syncNow')
    .addItem('رابط ملف البيانات العامة', 'showPublicLink')
    .addToUi();
}

function setup() {
  const pub = getOrCreatePublicFile_();
  PropertiesService.getScriptProperties().deleteProperty('pubHash');
  PropertiesService.getScriptProperties().deleteProperty('privHash');
  const result = syncAll();

  // مؤقت تلقائي كل 5 دقائق (نحذف أي مؤقت قديم عشان ما يتكرر)
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncAll')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(5).create();

  const msg =
    'تم الإعداد بنجاح ✅\n\n' +
    'عدد الأصناف: ' + result.count + '\n' +
    'المزامنة التلقائية: كل 5 دقائق\n\n' +
    'ملف البيانات العامة:\n' + pub.getUrl();
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function syncNow() {
  PropertiesService.getScriptProperties().deleteProperty('pubHash');
  PropertiesService.getScriptProperties().deleteProperty('privHash');
  const r = syncAll();
  const msg = 'تمت المزامنة ✅ — عدد الأصناف: ' + r.count;
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function showPublicLink() {
  const url = getOrCreatePublicFile_().getUrl();
  Logger.log(url);
  try { SpreadsheetApp.getUi().alert('ملف البيانات العامة:\n' + url); } catch (e) {}
}

// ------------------------------------------------------------
function syncAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { count: 0 };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet() ||
               SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('sourceId'));
    PropertiesService.getScriptProperties().setProperty('sourceId', ss.getId());
    const sh = SOURCE_SHEET_NAME ? ss.getSheetByName(SOURCE_SHEET_NAME) : ss.getSheets()[0];
    const range = sh.getDataRange();
    const raw = range.getValues();
    const disp = range.getDisplayValues();
    if (raw.length < 1) return { count: 0 };

    const headers = raw[0].map(h => String(h).trim());
    const cell = (r, c) => (raw[r][c] instanceof Date) ? disp[r][c] : raw[r][c];

    // ---------- 1) البيانات العامة ----------
    const pubIdx = [];
    headers.forEach((h, i) => {
      if (PUBLIC_COLS.indexOf(h) !== -1 || h.indexOf(QTY_PREFIX) === 0) pubIdx.push(i);
    });
    const numIdx = headers.indexOf('رقم الصنف');
    if (numIdx === -1) throw new Error('ما لقيت عمود "رقم الصنف" بالشيت');

    const pubRows = [pubIdx.map(i => headers[i])];
    for (let r = 1; r < raw.length; r++) {
      if (String(raw[r][numIdx]).trim() === '') continue;
      pubRows.push(pubIdx.map(i => cell(r, i)));
    }
    writePublicIfChanged_(pubRows);

    // ---------- 2) البيانات السرية ----------
    const privIdx = {};
    headers.forEach((h, i) => { if (PRIVATE_COLS[h]) privIdx[PRIVATE_COLS[h]] = i; });
    const items = {};
    for (let r = 1; r < raw.length; r++) {
      const num = String(raw[r][numIdx]).trim();
      if (!num) continue;
      const rec = {};
      Object.keys(privIdx).forEach(k => {
        const v = cell(r, privIdx[k]);
        if (v !== '' && v !== null) rec[k] = v;
      });
      items[num] = rec;
    }
    writePrivateIfChanged_(items);

    return { count: pubRows.length - 1 };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
function getOrCreatePublicFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('publicId');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  const f = SpreadsheetApp.create(PUBLIC_FILE_NAME);
  props.setProperty('publicId', f.getId());
  return f;
}

function hash_(obj) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(obj), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function writePublicIfChanged_(rows) {
  const props = PropertiesService.getScriptProperties();
  const h = hash_(rows);
  if (props.getProperty('pubHash') === h) return;
  const sheet = getOrCreatePublicFile_().getSheets()[0];
  sheet.clearContents();
  const cols = rows[0].length;
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
  if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  sheet.getRange(1, 1, rows.length, cols).setValues(rows);
  SpreadsheetApp.flush();
  props.setProperty('pubHash', h);
}

function writePrivateIfChanged_(items) {
  const props = PropertiesService.getScriptProperties();
  const h = hash_(items);
  if (props.getProperty('privHash') === h) return;

  const keys = Object.keys(items);
  const chunks = Math.max(1, Math.ceil(keys.length / CHUNK_SIZE));
  const now = new Date().toISOString();
  for (let c = 0; c < chunks; c++) {
    const part = {};
    keys.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE).forEach(k => part[k] = items[k]);
    firestorePatch_('private/purchase_' + c, {
      data: { stringValue: JSON.stringify(part) },
      updatedAt: { timestampValue: now }
    });
  }
  firestorePatch_('private/meta', {
    chunks: { integerValue: String(chunks) },
    count: { integerValue: String(keys.length) },
    updatedAt: { timestampValue: now }
  });
  props.setProperty('privHash', h);
}

function firestorePatch_(path, fields) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT +
              '/databases/(default)/documents/' + path;
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'x-goog-user-project': FIREBASE_PROJECT
    },
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Firestore ' + code + ': ' + res.getContentText().slice(0, 500));
  }
}
