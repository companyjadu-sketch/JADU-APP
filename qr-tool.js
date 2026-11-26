// مولّد QR لأصناف جادو — للأدمن فقط (يُفتح من قائمة الإدارة العامة).
// كل QR يحمل الرابط https://companyjadu-sketch.github.io/JADU-APP/?item=<رقم الصنف>
// المخرجات: صور PNG (واحدة أو ZIP، تصحيح Q) + ملصقات طباعة 58×38 مم (تصحيح M، QR + رقم الصنف فقط).
// قائمة الطباعة = الأصناف المختارة بالتصفية (نوع/استبعاد بالكلمات/متوفر في مخزن) + الأرقام المكتوبة يدويًا.
(function(){
  // ===== ثوابت ملصق Xprinter XP-237B (58×38 مم، Landscape) — ثابتة، لا تُغيَّر =====
  const LABEL_W_MM = 58;            // عرض الورقة
  const LABEL_H_MM = 38;            // ارتفاع الورقة
  // إزاحة أمان 2 مم — نتيجة قياس على طباعة فعلية بطابعة Xprinter XP-237B (2026-11-24):
  // سحب الطابعة للورق تفاوت نحو 3 مم بين ملصق وآخر فالتصق الـQR بحافة الملصق، فيُزاح كل المحتوى 2 مم.
  // جُرّبت على الطابعة ونجحت. المواضع الأساسية بدونها: QR 3–32، الرقم 34.5–46.
  const PRINT_SHIFT_MM = 2;
  const SAFE_X_MIN_MM = 3 + PRINT_SHIFT_MM;   // بداية المساحة الآمنة للطباعة عرضًا (5)
  const SAFE_X_MAX_MM = 46 + PRINT_SHIFT_MM;  // نهاية المساحة الآمنة للطباعة عرضًا (48)
  const QR_X_MIN_MM = 3 + PRINT_SHIFT_MM;     // حافة الـQR اليسرى (5)
  const QR_X_MAX_MM = 32 + PRINT_SHIFT_MM;    // أقصى حافة يمنى للـQR (34)
  // حجم الـQR لا يُكتب ثابتًا: يُحسب = عدد الوحدات × QR_DOTS_PER_MODULE × (25.4 / PRINTER_DPI).
  // رابط الصنف ينتج QR من 33 وحدة (الإصدار 4، تصحيح M) => 33 × 7 × 0.1251 ≈ 28.9 مم (من x=QR_X_MIN_MM حتى +28.9).
  // لا يمكن 28.4 مم مع 7 نقاط لكل وحدة؛ وعدد صحيح من النقاط يُبقي حواف الـQR حادة على الطابعة.
  const QR_DOTS_PER_MODULE = 7;     // نقاط طابعة لكل وحدة QR
  const PRINTER_DPI = 203;          // دقة الطابعة
  const NUM_X_MIN_MM = 34.5 + PRINT_SHIFT_MM; // بداية منطقة الرقم العمودي (36.5)
  const NUM_X_MAX_MM = 46 + PRINT_SHIFT_MM;   // نهاية منطقة الرقم العمودي (48)
  const NUM_Y_MIN_MM = 0;           // منطقة الرقم بالارتفاع كاملًا
  const NUM_Y_MAX_MM = 38;
  if (QR_X_MIN_MM < SAFE_X_MIN_MM || NUM_X_MAX_MM > SAFE_X_MAX_MM) console.warn('qr-tool: منطقة الملصق خارج المساحة الآمنة للطباعة');

  const BASE = 'https://companyjadu-sketch.github.io/JADU-APP/?item=';
  const MAX_ALL = 3500;
  const $ = id => document.getElementById(id);
  let current = []; // [{ number, name }]

  function isAdminNow(){
    return typeof auth !== 'undefined' && auth && auth.currentUser && typeof isAdminEmail === 'function' && isAdminEmail(auth.currentUser.email);
  }
  window.qrLinkFor = n => BASE + encodeURIComponent(String(n).trim());

  // QR على canvas بحجم px تقريبًا (مع هامش أبيض 4 خلايا حسب المواصفة)
  function qrCanvas(text, px){
    const qr = qrcode(0, 'Q'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), quiet = 4, cell = Math.max(2, Math.floor(px / (n + quiet * 2)));
    const size = (n + quiet * 2) * cell, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
    return c;
  }
  window.qrCanvasFor = qrCanvas;

  // =====================================================================
  // التصفية + قائمة الطباعة
  // =====================================================================
  const MAX_COPIES = 99, CONFIRM_OVER = 200;
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();   // يقصّ الفراغات الزائدة («معدات » = «معدات»)
  const typeOf = it => norm(it.category) || 'بدون تصنيف';                    // it.category = عمود «التصنيف الرئيسي» (بالاسم)
  // للبحث في الأسماء (الاستبعاد): لا يفرّق بين أ/إ/آ/ا ولا ة/ه ولا ى/ي ولا حالة الحروف اللاتينية
  const searchKey = s => norm(s).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  // اسم مخزن بصيغة موحّدة للمقارنة: ة/ه آخر الكلمة («مصراتة» = عمود «كمية مصراته»)، والفراغات حول الشرطة
  const storeKey = s => norm(s).replace(/\s*-\s*/g, '-').replace(/ة(?=$|[\s-])/g, 'ه');

  // ⚠ كل منطق «متوفر في المخزن» هنا فقط.
  // المصدر الحالي: أعمدة الشيت التي تبدأ بـ «كمية » (item.branches) — متوفر إذا كانت الكمية > 0.
  // لاحقًا سيصبح المصدر عمود «متوفر/غير متوفر»: يُعدَّل جسم هذه الدالة وحده.
  function isAvailableIn(item, store){
    const want = storeKey(store), b = (item && item.branches) || {};
    for (const k of Object.keys(b)) if (storeKey(k) === want) return (Number(b[k]) || 0) > 0;
    return false;
  }

  const selectedTypes = new Set();
  const rowState = new Map();          // رقم الصنف -> { on, copies } (يبقى عند تغيير التصفية)
  let selRows = [];                    // [{ number, name }] نتيجة التصفية + اليدوي، مرتبة رقميًا
  let excludedCount = 0;               // عدد ما استبعدته الكلمات من نتيجة التصفية
  let focusNum = null;                 // الصنف المعروض ملصقه في المعاينة
  const st = n => { if (!rowState.has(n)) rowState.set(n, { on: true, copies: 1 }); return rowState.get(n); };
  const clampCopies = v => Math.min(MAX_COPIES, Math.max(1, Math.floor(Number(v)) || 1));

  const excludeWords = () => ($('qrExclude').value || '').split(/[,،]/).map(searchKey).filter(Boolean);
  function filterItems(){
    excludedCount = 0;
    if (!selectedTypes.size) return [];
    const words = excludeWords(), store = $('qrStockSel').value;
    return ITEMS.filter(it => {
      if (!selectedTypes.has(typeOf(it)) || (store && !isAvailableIn(it, store))) return false;
      if (words.some(w => searchKey(it.name).includes(w))) { excludedCount++; return false; }
      return true;
    });
  }

  function rebuildSel(){
    const seen = new Set(); selRows = [];
    const add = it => { const n = String(it.number).trim(); if (!n || seen.has(n)) return; seen.add(n); selRows.push({ number: n, name: it.name }); };
    filterItems().forEach(add);
    current.forEach(add);              // الأرقام اليدوية تُضاف كما هي (بلا تصفية)
    selRows.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));
    if (!selRows.some(r => r.number === focusNum))
      focusNum = selRows.length ? (selRows.find(r => r.number.length === 4) || selRows[0]).number : null;
    $('qrExNote').textContent = excludeWords().length ? 'استبعدت الكلمات ' + excludedCount + ' صنف' : '';
    renderSel();
  }

  function selTotals(){
    let items = 0, labels = 0;
    selRows.forEach(r => { const s = st(r.number); if (s.on) { items++; labels += s.copies; } });
    return { items, labels };
  }
  function updateCount(){
    const t = selTotals();
    $('qrSelCount').textContent = t.items + ' صنف — ' + t.labels + ' ملصق';
    $('qrSelSub').textContent = selRows.length > t.items ? 'ألغيت يدويًا: ' + (selRows.length - t.items) : '';
    $('qrPrintSelBtn').disabled = !t.labels;
  }

  // معاينة ملصق الصنف المختار (بنفس دالة الطباعة)
  function renderLabelPreview(){
    const box = $('qrLabelPreview');
    $('qrLabelNum').textContent = focusNum ? '(الصنف ' + focusNum + ')' : '';
    if (!focusNum) { box.innerHTML = '<div class="qrf-empty">اختر أصنافًا لرؤية شكل الملصق.</div>'; return; }
    box.innerHTML = labelSvg(focusNum);
    $('qrSelList').querySelectorAll('.qrf-row').forEach(r => r.classList.toggle('focus', r.dataset.n === focusNum));
  }

  function renderSel(){
    const list = $('qrSelList');
    if (!selRows.length) {
      list.innerHTML = '<div class="qrf-empty">لا أصناف — اختر نوعًا أو اكتب أرقامًا ثم اضغط توليد.</div>';
      updateCount(); renderLabelPreview(); return;
    }
    const frag = document.createDocumentFragment();
    selRows.forEach(r => {
      const s = st(r.number);
      const row = document.createElement('div'); row.className = 'qrf-row'; row.dataset.n = r.number;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'qrf-on'; cb.checked = s.on;
      cb.setAttribute('aria-label', 'طباعة الصنف ' + r.number);
      const nu = document.createElement('span'); nu.className = 'qrf-num'; nu.textContent = r.number;
      const nm = document.createElement('span'); nm.className = 'qrf-name'; nm.textContent = r.name || '—';
      const cp = document.createElement('input'); cp.type = 'number'; cp.className = 'qrf-copies';
      cp.min = '1'; cp.max = String(MAX_COPIES); cp.step = '1'; cp.inputMode = 'numeric'; cp.value = String(s.copies);
      cp.setAttribute('aria-label', 'عدد النسخ للصنف ' + r.number);
      nm.title = r.name || '';
      const step = document.createElement('span'); step.className = 'qrf-step';
      const btn = (d, label) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.step = String(d);
        b.textContent = d > 0 ? '+' : '−'; b.setAttribute('aria-label', label + ' للصنف ' + r.number); return b;
      };
      step.append(btn(-1, 'إنقاص النسخ'), cp, btn(1, 'زيادة النسخ'));
      row.append(cb, nu, nm, step); frag.appendChild(row);
    });
    list.replaceChildren(frag);
    updateCount();
    renderLabelPreview();
  }

  // قائمة المخازن من أعمدة الشيت نفسها، مع عدد الأصناف المتوفرة في كل مخزن
  function renderStores(){
    const sel = $('qrStockSel'), keep = sel.value;
    const names = Object.keys((ITEMS[0] && ITEMS[0].branches) || {});
    sel.replaceChildren(new Option('بلا تصفية حسب المخزن', ''), ...names.map(k =>
      new Option('متوفر في: ' + k.replace('مصراته', 'مصراتة') + ' (' + ITEMS.filter(it => isAvailableIn(it, k)).length + ')', k)));
    sel.value = names.includes(keep) ? keep : '';
  }

  function renderTypes(){
    const box = $('qrTypeList'); if (!box) return;
    if (!itemsLoaded || !ITEMS.length) { box.innerHTML = '<div class="qrf-empty">جارِ تحميل الأنواع…</div>'; return; }
    const counts = new Map();
    ITEMS.forEach(it => { const t = typeOf(it); counts.set(t, (counts.get(t) || 0) + 1); });
    const q = norm($('qrTypeSearch').value);
    const types = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')).filter(([t]) => !q || t.includes(q));
    if (!types.length) { box.innerHTML = '<div class="qrf-empty">لا نوع مطابق للبحث</div>'; return; }
    box.replaceChildren(...types.map(([t, c]) => {
      const lab = document.createElement('label'); lab.className = 'qrf-check';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = t; cb.checked = selectedTypes.has(t);
      const cnt = document.createElement('span'); cnt.className = 'qrf-sub'; cnt.textContent = '(' + c + ')';
      lab.append(cb, ' ' + t + ' ', cnt);
      return lab;
    }));
  }

  // يبني الأنواع بعد اكتمال تحميل الأصناف (قد يتأخر التحميل عند فتح الشاشة)
  let waitTimer = null;
  function whenItemsReady(cb){
    if (itemsLoaded && ITEMS.length) { cb(); return; }
    clearInterval(waitTimer); let tries = 0;
    waitTimer = setInterval(() => {
      if (itemsLoaded && ITEMS.length) { clearInterval(waitTimer); cb(); }
      else if (++tries > 120) clearInterval(waitTimer);
    }, 300);
  }

  // =====================================================================
  // الملصق المطبوع 58×38 مم: QR يسار (تصحيح M) + رقم الصنف يمين عموديًا بطول الـQR
  // وحدات SVG بالمليمتر؛ كل المقاسات من الثوابت في أعلى الملف.
  // =====================================================================
  const LABEL_W = LABEL_W_MM, LABEL_H = LABEL_H_MM;
  const MM_PER_INCH = 25.4, DOT = MM_PER_INCH / PRINTER_DPI;
  const DIGIT_ADVANCE_EM = 0.6;     // عرض الرقم الواحد تقريبًا (Arial Black) بوحدة حجم الخط
  const CAP_HEIGHT_EM = 0.78;       // ارتفاع الأرقام بوحدة حجم الخط (المقاس فعليًا من PDF ≈ 0.75، مع هامش أمان)
  const DIGIT_CENTER_EM = 0.355;    // مركز الأرقام فوق خط الأساس (مقاس فعليًا من PDF)
  const f4 = v => (Math.round(v * 10000) / 10000).toString();
  function labelSvg(number){
    const num = String(number).trim();
    const qr = qrcode(0, 'M'); qr.addData(qrLinkFor(num)); qr.make();
    const n = qr.getModuleCount();
    let dots = QR_DOTS_PER_MODULE;
    while (dots > 1 && QR_X_MIN_MM + dots * DOT * n > QR_X_MAX_MM) dots--;   // لا يتجاوز حافة الـQR اليمنى أبدًا
    const m = dots * DOT, size = m * n;
    const x0 = QR_X_MIN_MM;
    const y0 = (LABEL_H - size) / 2;                                   // توسيط عمودي
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        let e = c; while (e + 1 < n && qr.isDark(r, e + 1)) e++;
        d += 'M' + f4(x0 + c * m) + ' ' + f4(y0 + r * m) + 'h' + f4((e - c + 1) * m) + 'v' + f4(m) + 'h-' + f4((e - c + 1) * m) + 'z';
        c = e;
      }
    }
    // منطقة الرقم العمودي: NUM_X_MIN..NUM_X_MAX عرضًا، والارتفاع كاملًا
    const colW = NUM_X_MAX_MM - NUM_X_MIN_MM, cx = (NUM_X_MIN_MM + NUM_X_MAX_MM) / 2, cy = (NUM_Y_MIN_MM + NUM_Y_MAX_MM) / 2;
    const digits = Math.max(1, num.length);
    // حجم الخط: ارتفاع الأرقام لا يتجاوز عرض المنطقة، ويتكيّف مع عدد الأرقام (3 إلى 5)؛ textLength = ارتفاع الـQR
    const fs = Math.min(colW / CAP_HEIGHT_EM, size / (digits * DIGIT_ADVANCE_EM));
    const safe = num.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + LABEL_W + 'mm" height="' + LABEL_H + 'mm" viewBox="0 0 ' + LABEL_W + ' ' + LABEL_H + '">'
      + '<rect width="' + LABEL_W + '" height="' + LABEL_H + '" fill="#fff"/>'
      + '<path d="' + d + '" fill="#000" shape-rendering="crispEdges"/>'
      + '<text transform="translate(' + f4(cx) + ' ' + f4(cy) + ') rotate(-90)" x="0" y="' + f4(fs * DIGIT_CENTER_EM) + '" text-anchor="middle"'
      + ' font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="' + f4(fs) + '"'
      // التمديد لطول الـQR من 3 خانات فما فوق فقط: خانة أو خانتان تتشوهان بالتمطيط
      + (digits >= 3 ? ' textLength="' + f4(size) + '" lengthAdjust="spacingAndGlyphs"' : '') + ' fill="#000">' + safe + '</text>'
      + '</svg>';
  }

  // 5 ملصقات تجريبية: خانة واحدة، 4 خانات، ثم خانتان و3 خانات و4 خانات
  function testNumbers(){
    const all = ITEMS.map(it => String(it.number).trim()).filter(n => /^\d+$/.test(n)).sort((a, b) => a - b);
    const of = len => all.filter(n => n.length === len);
    const four = of(4), three = of(3);
    const picks = [of(1)[0], four[four.length - 1], of(2)[0], three.includes('146') ? '146' : three[0], four[0]];
    return [...new Set(picks.filter(Boolean))];
  }

  // يبني منطقة الطباعة: ملصق لكل نسخة، وكسر صفحة بعد كل ملصق (CSS)
  function buildPrintArea(list){
    let area = $('qrPrintArea');
    if (!area) { area = document.createElement('div'); area.id = 'qrPrintArea'; document.body.appendChild(area); }
    const cache = new Map(); let html = '';
    list.forEach(r => {
      if (!cache.has(r.number)) cache.set(r.number, '<div class="qr-label58">' + labelSvg(r.number) + '</div>');
      for (let i = 0; i < r.copies; i++) html += cache.get(r.number);
    });
    area.innerHTML = html;
    return area.childElementCount;
  }
  window.JADU_QR = { isAvailableIn, labelSvg, buildPrintArea, testNumbers };   // للاختبار المحلي فقط

  // نص الإدخال -> أرقام: فواصل/أسطر/فراغات، مجال 100-110، أو "الكل"
  function parseInput(text){
    const t = String(text || '').trim();
    if (!t) return { nums: [], all: false };
    if (/^(all|الكل)$/i.test(t)) return { nums: [], all: true };
    const out = [];
    t.split(/[\s,،;]+/).filter(Boolean).forEach(tok => {
      const m = tok.match(/^(\d+)-(\d+)$/);
      if (m && Number(m[2]) - Number(m[1]) <= 500 && Number(m[2]) >= Number(m[1])) { for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(String(i)); }
      else out.push(tok);
    });
    return { nums: [...new Set(out)], all: false };
  }

  function resolveItems(spec){
    const byNum = new Map(ITEMS.map(it => [String(it.number), it]));
    if (spec.all) return { found: ITEMS.slice(0, MAX_ALL).map(it => ({ number: it.number, name: it.name })), missing: [] };
    const found = [], missing = [];
    spec.nums.forEach(n => { const it = byNum.get(n); if (it) found.push({ number: it.number, name: it.name }); else missing.push(n); });
    return { found, missing };
  }

  function download(blob, name){
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const canvasBlob = c => new Promise(res => c.toBlob(res, 'image/png'));

  function setMsg(t, cls){ const m = $('qrMsg'); m.textContent = t || ''; m.className = 'msg' + (cls ? ' ' + cls : ''); }

  function renderPreview(){
    const grid = $('qrPreview'); grid.innerHTML = '';
    current.slice(0, 60).forEach(it => {
      const card = document.createElement('div'); card.className = 'qr-card';
      const c = qrCanvas(qrLinkFor(it.number), 260); c.className = 'qr-img';
      const nm = document.createElement('div'); nm.className = 'qr-name'; nm.textContent = it.name || '—';
      const nu = document.createElement('div'); nu.className = 'qr-num'; nu.textContent = it.number;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qr-dl'; b.textContent = 'تنزيل PNG';
      b.onclick = async () => download(await canvasBlob(qrCanvas(qrLinkFor(it.number), 800)), 'QR-' + it.number + '.png');
      card.append(c, nm, nu, b); grid.appendChild(card);
    });
    $('qrActions').hidden = !current.length;
    if (!current.length) return;
    $('qrZipBtn').textContent = current.length > 1 ? 'تنزيل الكل (ZIP) — ' + current.length : 'تنزيل PNG';
  }

  function generate(){
    if (!isAdminNow()) { setMsg('هذه الأداة للأدمن فقط', 'err'); return; }
    if (!itemsLoaded || !ITEMS.length) { setMsg('جارِ تحميل بيانات الأصناف… حاول بعد لحظات', 'err'); loadItems(); return; }
    const spec = parseInput($('qrInput').value);
    if (!spec.all && !spec.nums.length) { setMsg('اكتب رقم صنف أو أكثر (مثال: 146 أو 100-110 أو الكل)', 'err'); return; }
    const r = resolveItems(spec);
    current = r.found;
    renderPreview();
    let m = r.found.length + ' ملصق جاهز';
    if (spec.all && ITEMS.length > MAX_ALL) m += ' (الحد الأقصى ' + MAX_ALL + ')';
    if (r.missing.length) m += ' — أرقام غير موجودة: ' + r.missing.slice(0, 15).join('، ') + (r.missing.length > 15 ? '…' : '');
    if (current.length > 60) m += ' — المعاينة تعرض أول 60 فقط، والتنزيل والطباعة يشملان الكل';
    setMsg(m, r.missing.length ? 'err' : 'ok');
    rebuildSel();
  }

  async function downloadAll(){
    if (!current.length) return;
    if (current.length === 1) { download(await canvasBlob(qrCanvas(qrLinkFor(current[0].number), 800)), 'QR-' + current[0].number + '.png'); return; }
    if (typeof JSZip === 'undefined') { setMsg('مكتبة الضغط لم تُحمَّل — تحقق من الإنترنت', 'err'); return; }
    setMsg('جارِ تجهيز الملف…');
    const zip = new JSZip();
    for (let i = 0; i < current.length; i++) {
      zip.file('QR-' + current[i].number + '.png', await canvasBlob(qrCanvas(qrLinkFor(current[i].number), 800)));
      if (i % 25 === 24) await new Promise(r => setTimeout(r, 0));
    }
    download(await zip.generateAsync({ type: 'blob' }), 'jadu-qr-' + current.length + '.zip');
    setMsg('تم التنزيل', 'ok');
  }

  // ملصقات للطباعة (58×38 مم): كل المحدَّد في قائمة الطباعة بعدد نسخه — حد معاينة الشاشة (60) لا يقيّدها.
  // تُبنى في عنصر مخفي ثم نستدعي الطباعة، وCSS الطباعة يخفي كل الصفحة عداه.
  async function printLabels(){
    if (!isAdminNow()) { setMsg('هذه الأداة للأدمن فقط', 'err'); return; }
    const list = selRows.filter(r => st(r.number).on).map(r => ({ number: r.number, copies: st(r.number).copies }));
    const total = list.reduce((a, r) => a + r.copies, 0);
    if (!total) { setMsg('لا ملصقات محددة للطباعة', 'err'); return; }
    if (total > CONFIRM_OVER) {
      const ok = await showConfirm('سيتم طباعة ' + total + ' ملصق (' + list.length + ' صنف). هل تريد المتابعة؟',
        { title: 'طباعة عدد كبير من الملصقات', okText: 'نعم، اطبع' });
      if (!ok) return;
    }
    sendToPrinter(list);
  }

  // دفعة تجريبية قبل الدفعة الكاملة: لا تغيّر الاختيار ولا عدد النسخ
  function printTest(){
    if (!isAdminNow()) { setTestMsg('هذه الأداة للأدمن فقط'); return; }
    if (!itemsLoaded || !ITEMS.length) { setTestMsg('جارِ تحميل بيانات الأصناف… حاول بعد لحظات'); return; }
    const nums = testNumbers();
    setTestMsg('الملصقات التجريبية: ' + nums.join('، '));
    sendToPrinter(nums.map(n => ({ number: n, copies: 1 })));
  }
  const setTestMsg = t => { $('qrTestMsg').textContent = t; };

  function sendToPrinter(list){
    buildPrintArea(list);
    document.body.classList.add('printing-qr');
    const done = () => { document.body.classList.remove('printing-qr'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 150);
  }

  // تفريغ الشاشة (عند الخروج، أو إذا ظهرت لغير الإدارة)
  function wipe(){
    current = []; selRows = []; focusNum = null; excludedCount = 0;
    selectedTypes.clear(); rowState.clear(); clearInterval(waitTimer);
    ['qrInput', 'qrExclude', 'qrTypeSearch'].forEach(id => { $(id).value = ''; });
    ['qrTypeList', 'qrSelList', 'qrLabelPreview', 'qrPreview'].forEach(id => { $(id).textContent = ''; });
    ['qrMsg', 'qrTestMsg', 'qrExNote', 'qrLabelNum', 'qrSelSub', 'qrSelCount'].forEach(id => { $(id).textContent = ''; });
    $('qrStockSel').value = ''; $('qrActions').hidden = true; $('qrPrintSelBtn').disabled = true;
    $('qrPrintArea')?.remove();
  }
  // زر «رجوع/التالي» بالمتصفح يعيد الشاشات بلا فحص حساب (applyNavState)، فنحرس هذه الشاشة هنا
  function guardView(){
    const view = $('view-admin-qr');
    if (!view) return;
    new MutationObserver(() => {
      if (view.classList.contains('active') && !isAdminNow()) { wipe(); showView('gate'); }
    }).observe(view, { attributes: true, attributeFilter: ['class'] });
    if (typeof auth !== 'undefined' && auth) auth.onAuthStateChanged(() => { if (!isAdminNow()) wipe(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('adminQrBtn')?.addEventListener('click', () => {
      if (!isAdminNow()) return;
      showView('admin-qr'); loadItems();
      whenItemsReady(() => { renderTypes(); renderStores(); rebuildSel(); });
    });
    guardView();
    $('qrGenBtn')?.addEventListener('click', generate);
    $('qrZipBtn')?.addEventListener('click', downloadAll);
    $('qrPrintSelBtn')?.addEventListener('click', printLabels);
    $('qrTestBtn')?.addEventListener('click', printTest);
    // الأرقام اليدوية تدخل القائمة بمجرد مغادرة الحقل (ومسحه يزيلها)
    $('qrInput')?.addEventListener('change', () => {
      if ($('qrInput').value.trim()) generate();
      else { current = []; renderPreview(); setMsg(''); rebuildSel(); }
    });

    // التصفية: أي تغيير يعيد بناء قائمة الطباعة
    $('qrTypeSearch')?.addEventListener('input', renderTypes);
    $('qrTypeList')?.addEventListener('change', e => {
      const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
      cb.checked ? selectedTypes.add(cb.value) : selectedTypes.delete(cb.value);
      rebuildSel();
    });
    let exTimer = null;
    $('qrExclude')?.addEventListener('input', () => { clearTimeout(exTimer); exTimer = setTimeout(rebuildSel, 250); });
    $('qrStockSel')?.addEventListener('change', rebuildSel);

    // قائمة الطباعة: استبعاد صنف + عدد النسخ (1–99)
    const list = $('qrSelList');
    list?.addEventListener('change', e => {
      const row = e.target.closest('.qrf-row'); if (!row) return;
      const s = st(row.dataset.n);
      if (e.target.classList.contains('qrf-on')) s.on = e.target.checked;
      if (e.target.classList.contains('qrf-copies')) { s.copies = clampCopies(e.target.value); e.target.value = String(s.copies); }
      updateCount();
    });
    list?.addEventListener('input', e => {
      if (!e.target.classList.contains('qrf-copies')) return;
      const row = e.target.closest('.qrf-row'); if (!row) return;
      if (Number(e.target.value) > MAX_COPIES) e.target.value = String(MAX_COPIES);
      if (e.target.value !== '') st(row.dataset.n).copies = clampCopies(e.target.value);
      updateCount();
    });
    list?.addEventListener('click', e => {
      const row = e.target.closest('.qrf-row'); if (!row) return;
      const b = e.target.closest('button[data-step]');
      if (b) {
        const s = st(row.dataset.n);
        s.copies = clampCopies(s.copies + Number(b.dataset.step));
        row.querySelector('.qrf-copies').value = String(s.copies);
        updateCount();
      } else if (!e.target.closest('input')) { focusNum = row.dataset.n; renderLabelPreview(); }
    });
    const setAll = on => { selRows.forEach(r => { st(r.number).on = on; }); list.querySelectorAll('.qrf-on').forEach(cb => { cb.checked = on; }); updateCount(); };
    $('qrSelAll')?.addEventListener('click', () => setAll(true));
    $('qrSelNone')?.addEventListener('click', () => setAll(false));
    $('qrInput')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } });
  });
})();
