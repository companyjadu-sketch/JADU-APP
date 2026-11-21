// مولّد QR لأصناف جادو — للأدمن فقط (يُفتح من قائمة الإدارة العامة).
// كل QR يحمل الرابط https://companyjadu-sketch.github.io/JADU-APP/?item=<رقم الصنف>
// المخرجات: صور PNG (واحدة أو ZIP) + صفحة ملصقات للطباعة (QR + اسم الصنف + رقمه).
(function(){
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

  // ملصقات للطباعة: تُبنى في عنصر مخفي ثم نستدعي الطباعة، وCSS الطباعة يخفي كل الصفحة عداه
  function printLabels(){
    if (!current.length) return;
    let area = $('qrPrintArea');
    if (!area) { area = document.createElement('div'); area.id = 'qrPrintArea'; document.body.appendChild(area); }
    area.innerHTML = '';
    current.forEach(it => {
      const lab = document.createElement('div'); lab.className = 'qr-label';
      const c = qrCanvas(qrLinkFor(it.number), 420);
      const img = document.createElement('img'); img.src = c.toDataURL('image/png'); img.alt = '';
      const nm = document.createElement('div'); nm.className = 'ql-name'; nm.textContent = it.name || '—';
      const nu = document.createElement('div'); nu.className = 'ql-num'; nu.textContent = it.number;
      lab.append(img, nm, nu); area.appendChild(lab);
    });
    document.body.classList.add('printing-qr');
    const done = () => { document.body.classList.remove('printing-qr'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 150);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('adminQrBtn')?.addEventListener('click', () => {
      if (!isAdminNow()) return;
      showView('admin-qr'); loadItems();
      if (!$('qrInput').value) $('qrInput').value = '146';
    });
    $('qrGenBtn')?.addEventListener('click', generate);
    $('qrZipBtn')?.addEventListener('click', downloadAll);
    $('qrPrintBtn')?.addEventListener('click', printLabels);
    $('qrInput')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } });
  });
})();
