// =====================================================================
// سلة المشاركة (للموظف) — يُحمَّل بعد app.js ويعتمد على دواله ومتغيراته:
// ITEMS, itemImage, UPLOADED_PHOTOS, loadFullPhoto_, showView, showConfirm,
// escapeHtml, formatPrice, currentViewerRole, currentItem
//
// - زر "أضف للمشاركة" على كل صنف (في نتائج البحث وفي صفحة الصنف)
// - شريط أسفل الشاشة بعدد الأصناف وزر "عرض السلة"
// - صفحة السلة: عرض/حذف/تفريغ/مشاركة
// - "مشاركة السلة": صور مجمّعة (6 أصناف في الصورة الواحدة) تُرسل بضغطة واحدة
// - "مشاركة كصورة" للصنف المنفرد: الصورة الأصلية كاملة وتحتها شريط أبيض بالبيانات
// - على الكمبيوتر: تنزيل الصور بدل المشاركة
// السلة تُحفظ محليًا بالمتصفح (localStorage) مثل قائمة تغيير الأسعار.
// =====================================================================
(function(){
  'use strict';
  if(!document.getElementById('view-share-cart')) return;   // الصفحة لا تحتوي السلة (صفحة الزبون)

  const CART_KEY = 'jadu_share_cart_v1';
  const PER_IMAGE = 6;                      // عدد الأصناف في الصورة المجمّعة الواحدة
  const FONT = "'Tajawal', sans-serif";
  const RED = '#E10A1E', INK = '#141312', MUTED = '#7A7468', RULE = '#E7E3DA';

  let cart = [];
  try { cart = (JSON.parse(localStorage.getItem(CART_KEY) || '[]') || []).map(n => String(n).trim()).filter(Boolean); } catch(e){ cart = []; }

  const $ = id => document.getElementById(id);
  const enabled = () => currentViewerRole === 'employee';
  const inCart = n => cart.indexOf(String(n).trim()) !== -1;
  const findItem = n => ITEMS.find(it => String(it.number).trim() === n);
  const cartItems = () => cart.map(findItem).filter(Boolean);

  function saveCart(){
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){}
    prepared = null;
    updateBar();
  }
  function toggle(n){
    n = String(n).trim(); if(!n) return;
    if(inCart(n)) cart = cart.filter(x => x !== n); else cart.push(n);
    saveCart();
    syncToggles();
  }

  // ---------- أزرار الإضافة ----------
  const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function decorateRows(){
    const wrap = $('employeeResults'); if(!wrap) return;
    wrap.querySelectorAll('.item-row').forEach(row => {
      const old = row.querySelector('.sc-add'); if(old) old.remove();
      row.classList.toggle('with-add', enabled());
      if(!enabled()) return;
      const s = document.createElement('span');
      s.className = 'sc-add'; s.setAttribute('role', 'button'); s.tabIndex = 0; s.dataset.num = row.dataset.num;
      row.appendChild(s);
    });
    syncToggles();
  }
  function syncToggles(){
    document.querySelectorAll('.sc-add').forEach(s => {
      const on = inCart(s.dataset.num);
      s.classList.toggle('on', on);
      s.innerHTML = on ? ICON_CHECK : ICON_PLUS;
      s.setAttribute('aria-label', on ? 'إزالة من سلة المشاركة' : 'أضف للمشاركة');
      s.title = on ? 'إزالة من سلة المشاركة' : 'أضف للمشاركة';
    });
    const b = $('shareCartToggleBtn');
    if(b && currentItem){
      const on = inCart(currentItem.number);
      b.classList.toggle('on', on);
      b.querySelector('span').textContent = on ? '✓ في سلة المشاركة' : 'أضف للمشاركة';
    }
  }
  // النقر على زر الإضافة داخل صف الصنف لا يفتح صفحة الصنف
  function onAddActivate(e){
    const s = e.target.closest && e.target.closest('.sc-add'); if(!s) return;
    if(e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); e.stopPropagation();
    toggle(s.dataset.num);
  }
  document.addEventListener('click', onAddActivate, true);
  document.addEventListener('keydown', onAddActivate, true);

  // ---------- الشريط السفلي ----------
  function updateBar(){
    const bar = $('shareCartBar'); if(!bar) return;
    const onEmployee = $('view-employee').classList.contains('active');
    const show = onEmployee && enabled() && cart.length > 0;
    bar.hidden = !show;
    $('shareCartCount').textContent = String(cart.length);
    const pb = $('photoBasketBar');
    const stacked = show && pb && !pb.hidden;          // شريط سلة الصور ظاهر أيضًا: نرصّهما فوق بعض
    bar.style.bottom = stacked ? pb.offsetHeight + 'px' : '0';
    bar.classList.toggle('stacked', !!stacked);
    document.body.classList.toggle('has-share-bar', show);
  }

  // ---------- تحميل الصور ----------
  function loadImg(src){
    return new Promise(resolve => {
      if(!src) return resolve(null);
      const img = new Image(); let done = false;
      const finish = v => { if(!done){ done = true; resolve(v); } };
      if(!/^data:/i.test(src)){ img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; }
      img.onload = () => finish(img); img.onerror = () => finish(null);
      setTimeout(() => finish(null), 15000);
      img.src = src;
    });
  }
  // ترجع الصورة جاهزة للرسم، أو null إذا لا توجد صورة أو مصدرها يمنع التحميل (CORS)
  async function itemPhoto(item){
    const n = String(item.number).trim();
    if(UPLOADED_PHOTOS[n]){
      let full = ''; try { full = await loadFullPhoto_(n); } catch(e){}
      return loadImg(full || UPLOADED_PHOTOS[n].t);
    }
    let src = itemImage(n); if(!src) return null;
    try {
      const u = new URL(src, location.href);
      // الصور الخارجية مخزّنة عند المتصفح بنسخة "معتمة" لا تصلح للرسم؛ هذا الوسم يجلب نسخة صالحة
      if(u.origin !== location.origin){ u.searchParams.set('jshare', '1'); src = u.href; }
    } catch(e){}
    return loadImg(src);
  }
  function fontsReady(){
    if(!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['900 58px', '700 44px', '500 34px'].map(f => document.fonts.load(`${f} ${FONT}`, 'ابج 123'))).catch(() => {});
  }
  function wrapLines(ctx, text, maxW, maxLines){
    const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
    for(const w of words){
      const t = cur ? cur + ' ' + w : w;
      if(ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if(cur) lines.push(cur);
    if(lines.length > maxLines){
      let last = lines.slice(maxLines - 1).join(' ');
      while(last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines.length = maxLines - 1; lines.push(last + '…');
    }
    return lines;
  }
  function toFile(canvas, name){
    return new Promise((resolve, reject) => canvas.toBlob(b => {
      if(!b) return reject(new Error('toBlob'));
      let f; try { f = new File([b], name, { type: 'image/jpeg' }); } catch(e){ f = b; f.name = name; }
      resolve(f);
    }, 'image/jpeg', 0.92));
  }

  // ---------- صورة الصنف المنفرد: الصورة كاملة + شريط أبيض بالبيانات ----------
  // سطر الشركة المصنعة · بلد الصنع (يكتب الموجود فقط، وفارغ إذا لا يوجد أي منهما)
  const subText = item => [item.company, item.country].map(v => String(v == null ? '' : v).trim()).filter(Boolean).join(' · ');
  function drawStrip(ctx, item, W, y, dry){
    const PAD = 56, NAME = 58, LH = 78, top = 44, rowGap = 34, rowH = 84, bottom = 46;
    ctx.direction = 'rtl'; ctx.textBaseline = 'alphabetic';
    ctx.font = `900 ${NAME}px ${FONT}`;
    const lines = wrapLines(ctx, item.name || '—', W - PAD * 2, 3);
    const sub = subText(item), SUB_FS = 32, subH = sub ? 46 : 0;
    const H = top + lines.length * LH + subH + rowGap + rowH + bottom;
    if(dry) return H;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, y, W, H);
    ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.font = `900 ${NAME}px ${FONT}`;
    lines.forEach((ln, i) => ctx.fillText(ln, W - PAD, y + top + NAME + i * LH - 6));
    if(sub){
      ctx.font = `500 ${SUB_FS}px ${FONT}`; ctx.fillStyle = MUTED; ctx.textAlign = 'right';
      ctx.fillText(wrapLines(ctx, sub, W - PAD * 2, 1)[0], W - PAD, y + top + lines.length * LH + 16);
    }
    const ry = y + top + lines.length * LH + subH + rowGap;
    ctx.fillStyle = RULE; ctx.fillRect(PAD, ry - rowGap / 2, W - PAD * 2, 2);
    const base = ry + 60, label = 'رقم الصنف';
    ctx.textAlign = 'right'; ctx.font = `500 34px ${FONT}`; ctx.fillStyle = MUTED;
    ctx.fillText(label, W - PAD, base);
    const lw = ctx.measureText(label).width;
    ctx.font = `700 44px ${FONT}`; ctx.fillStyle = INK;
    ctx.fillText(String(item.number), W - PAD - lw - 18, base);
    ctx.textAlign = 'left'; ctx.font = `900 64px ${FONT}`; ctx.fillStyle = RED;
    ctx.fillText(formatPrice(item.priceRetail), PAD, base + 4);
    return H;
  }
  async function buildSingle(item){
    const [img] = await Promise.all([itemPhoto(item), fontsReady()]);
    const W = 1080, c = document.createElement('canvas'), ctx = c.getContext('2d');
    c.width = W;
    const stripH = drawStrip(ctx, item, W, 0, true);
    if(img){
      const imgH = Math.round(img.height * (W / img.width));     // الصورة كاملة بدون قص
      c.height = imgH + stripH;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, c.height);
      ctx.drawImage(img, 0, 0, W, imgH);
      drawStrip(ctx, item, W, imgH, false);
    } else {                                                     // بدون صورة: بطاقة بيانات فقط
      const bar = 14;
      c.height = bar + stripH;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, c.height);
      ctx.fillStyle = RED; ctx.fillRect(0, 0, W, bar);
      drawStrip(ctx, item, W, bar, false);
    }
    return toFile(c, `jadu-${String(item.number).replace(/[^\w-]/g, '_')}.jpg`);
  }

  // ---------- الصورة المجمّعة: شبكة عمودين، كل خانة = صورة الصنف + بياناته ----------
  async function buildCollage(items, fileName){
    const [imgs] = await Promise.all([Promise.all(items.map(itemPhoto)), fontsReady()]);
    const W = 1080, COLS = 2, GAP = 2, CW = (W - GAP * (COLS - 1)) / COLS;
    const PAD = 28, BOX = CW - PAD * 2, TEXT_H = 196 + (items.some(subText) ? 32 : 0), CH = PAD + BOX + TEXT_H;
    const rows = Math.ceil(items.length / COLS);
    const c = document.createElement('canvas'); c.width = W; c.height = rows * CH + (rows - 1) * GAP;
    const ctx = c.getContext('2d');
    ctx.fillStyle = RULE; ctx.fillRect(0, 0, W, c.height);
    if(items.length % COLS){                                      // خانة أخيرة فارغة عند العدد الفردي: بيضاء
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, (rows - 1) * (CH + GAP), CW, CH);
    }
    items.forEach((item, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = W - (col + 1) * CW - col * GAP;                   // الترتيب من اليمين لليسار
      const y = row * (CH + GAP);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, CW, CH);
      const bx = x + PAD, by = y + PAD, img = imgs[i];
      ctx.direction = 'rtl'; ctx.textBaseline = 'alphabetic';
      if(img){
        const r = Math.min(BOX / img.width, BOX / img.height), w = img.width * r, h = img.height * r;
        ctx.drawImage(img, bx + (BOX - w) / 2, by + (BOX - h) / 2, w, h);   // كاملة بدون قص
      } else {
        ctx.fillStyle = '#F4F2EC'; ctx.fillRect(bx, by, BOX, BOX);
        ctx.textAlign = 'center'; ctx.fillStyle = '#B5AE9F'; ctx.font = `500 30px ${FONT}`;
        ctx.fillText('بدون صورة', bx + BOX / 2, by + BOX / 2 + 10);
      }
      const tx = x + CW - PAD, ty = by + BOX + 24;
      ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.font = `900 34px ${FONT}`;
      const nameLines = wrapLines(ctx, item.name || '—', BOX, 2);
      nameLines.forEach((ln, k) => ctx.fillText(ln, tx, ty + 34 + k * 46));
      const sub = subText(item);
      if(sub){
        ctx.font = `500 24px ${FONT}`; ctx.fillStyle = MUTED; ctx.textAlign = 'right';
        ctx.fillText(wrapLines(ctx, sub, BOX, 1)[0], tx, ty + 34 + (nameLines.length - 1) * 46 + 38);
      }
      const base = y + CH - 30, label = 'رقم الصنف';
      ctx.font = `500 22px ${FONT}`; ctx.fillStyle = MUTED; ctx.fillText(label, tx, base);
      const lw = ctx.measureText(label).width;
      ctx.font = `700 28px ${FONT}`; ctx.fillStyle = INK; ctx.fillText(String(item.number), tx - lw - 12, base);
      ctx.textAlign = 'left'; ctx.font = `900 38px ${FONT}`; ctx.fillStyle = RED;
      ctx.fillText(formatPrice(item.priceRetail), x + PAD, base + 2);
    });
    return toFile(c, fileName);
  }

  // ---------- تجهيز صور السلة مسبقًا (حتى تفتح المشاركة فورًا عند الضغط) ----------
  let prepared = null;      // { sig, files }
  let preparing = null;     // { sig, promise }
  const cartSig = () => cartItems().map(it => `${it.number}:${it.priceRetail}:${it.name}:${it.company || ''}:${it.country || ''}:${(UPLOADED_PHOTOS[String(it.number).trim()] || {}).at || ''}`).join('|');
  function prepareCart(){
    const sig = cartSig();
    if(prepared && prepared.sig === sig) return Promise.resolve(prepared.files);
    if(preparing && preparing.sig === sig) return preparing.promise;
    const items = cartItems(), chunks = [];
    for(let i = 0; i < items.length; i += PER_IMAGE) chunks.push(items.slice(i, i + PER_IMAGE));
    const promise = (async () => {
      const files = [];
      for(let i = 0; i < chunks.length; i++) files.push(await buildCollage(chunks[i], chunks.length > 1 ? `jadu-share-${i + 1}.jpg` : 'jadu-share.jpg'));
      if(cartSig() === sig) prepared = { sig, files };
      return files;
    })();
    preparing = { sig, promise };
    promise.catch(() => {}).then(() => { if(preparing && preparing.sig === sig) preparing = null; });
    return promise;
  }

  // ---------- المشاركة أو التنزيل ----------
  const IS_MOBILE = (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean')
    ? navigator.userAgentData.mobile
    : (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  function canShareFiles(files){
    try { return IS_MOBILE && !!navigator.canShare && navigator.canShare({ files }); } catch(e){ return false; }
  }
  function downloadFiles(files){
    files.forEach((f, i) => setTimeout(() => {
      const url = URL.createObjectURL(f), a = document.createElement('a');
      a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, i * 400));
  }
  // ترجع: shared | cancelled | retry | downloaded
  async function deliver(files){
    if(canShareFiles(files)){
      try { await navigator.share({ files }); return 'shared'; }
      catch(e){
        if(e && e.name === 'AbortError') return 'cancelled';
        if(e && e.name === 'NotAllowedError') return 'retry';     // انتهت مهلة الضغطة أثناء التجهيز
      }
    }
    downloadFiles(files);
    return 'downloaded';
  }
  function setMsg(el, text, kind){ if(!el) return; el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }
  function resultText(r, count){
    if(r === 'shared') return ['✓ تمت المشاركة', 'ok'];
    if(r === 'downloaded') return [count > 1 ? `✓ تم تنزيل ${count} صور` : '✓ تم تنزيل الصورة', 'ok'];
    if(r === 'retry') return ['الصور جاهزة — اضغط الزر مرة أخرى للمشاركة', ''];
    return ['', ''];
  }

  // ---------- صفحة السلة ----------
  function renderCart(){
    const body = $('shareCartBody'); if(!body) return;
    const items = cartItems();
    const shareBtn = $('shareCartSendBtn'), clearBtn = $('shareCartClearBtn');
    shareBtn.disabled = !items.length; clearBtn.hidden = !cart.length;
    shareBtn.querySelector('span').textContent = IS_MOBILE ? 'مشاركة السلة' : 'تنزيل صور السلة';
    if(!cart.length){
      body.innerHTML = '<div class="empty-note">السلة فارغة — اضغط "أضف للمشاركة" على أي صنف</div>';
      $('shareCartInfo').textContent = ''; return;
    }
    if(!items.length){
      body.innerHTML = '<div class="empty-note"><span class="spinner"></span> جارِ تحميل بيانات الأصناف…</div>';
      $('shareCartInfo').textContent = ''; return;
    }
    const pics = Math.ceil(items.length / PER_IMAGE);
    $('shareCartInfo').textContent = `${items.length} صنف — ${pics === 1 ? 'صورة واحدة' : pics + ' صور'} (${PER_IMAGE} أصناف في الصورة)`;
    body.innerHTML = items.map(it => {
      const src = itemImage(it.number);
      return `<div class="sc-row">
        <span class="ir-thumb">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
        <div class="sc-body">
          <div class="sc-name">${escapeHtml(it.name) || '—'}</div>
          <div class="sc-meta"><span class="sc-num">${escapeHtml(it.number)}</span><span class="sc-price">${formatPrice(it.priceRetail)}</span>${it.totalQty > 0 ? '' : '<span class="sc-out">غير متوفر</span>'}</div>
        </div>
        <button type="button" class="sc-rm" data-rm="${escapeHtml(it.number)}" aria-label="حذف ${escapeHtml(it.name)} من السلة">✕</button>
      </div>`;
    }).join('');
    prepareCart().catch(() => {});
  }
  function openCart(){ setMsg($('shareCartMsg'), ''); showView('share-cart'); renderCart(); }

  $('shareCartOpen').addEventListener('click', openCart);
  $('shareCartBody').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if(!b) return;
    cart = cart.filter(n => n !== String(b.dataset.rm).trim());
    saveCart(); syncToggles(); setMsg($('shareCartMsg'), ''); renderCart();
  });
  $('shareCartClearBtn').addEventListener('click', async () => {
    if(!cart.length) return;
    if(!await showConfirm(`تفريغ سلة المشاركة (${cart.length} صنف)؟`, { title: 'تفريغ السلة', okText: 'تفريغ' })) return;
    cart = []; saveCart(); syncToggles(); setMsg($('shareCartMsg'), ''); renderCart();
  });
  $('shareCartSendBtn').addEventListener('click', async () => {
    const btn = $('shareCartSendBtn'), msg = $('shareCartMsg');
    if(!cartItems().length) return;
    let files;
    if(prepared && prepared.sig === cartSig()) files = prepared.files;
    else {
      btn.disabled = true; setMsg(msg, 'جارِ تجهيز الصور…');
      try { files = await prepareCart(); }
      catch(e){ btn.disabled = false; setMsg(msg, 'تعذّر تجهيز الصور — حاول مرة أخرى', 'error'); return; }
      btn.disabled = false;
    }
    const r = await deliver(files);
    const [t, k] = resultText(r, files.length); setMsg(msg, t, k);
  });

  // ---------- الصنف المنفرد ----------
  let single = null;        // { key, promise }
  function singleKey(item){ const n = String(item.number).trim(); return `${n}:${item.priceRetail}:${item.name}:${item.company || ''}:${item.country || ''}:${(UPLOADED_PHOTOS[n] || {}).at || ''}`; }
  function prepareSingle(item){
    const key = singleKey(item);
    if(single && single.key === key) return single.promise;
    const promise = buildSingle(item);
    single = { key, promise };
    promise.catch(() => { if(single && single.key === key) single = null; });
    return promise;
  }
  $('shareCartToggleBtn').addEventListener('click', () => { if(currentItem) toggle(currentItem.number); });
  $('shareImageBtn').addEventListener('click', async () => {
    const item = currentItem, msg = $('shareImageMsg'); if(!item) return;
    if(!(await confirmShareIfOutOfStock(item))) return;
    setMsg(msg, 'جارِ تجهيز الصورة…');
    let file;
    try { file = await prepareSingle(item); }
    catch(e){ setMsg(msg, 'تعذّر تجهيز الصورة — حاول مرة أخرى', 'error'); return; }
    const r = await deliver([file]);
    const [t, k] = resultText(r, 1); setMsg(msg, t, k);
  });
  $('shareImageBtn').querySelector('span').textContent = IS_MOBILE ? 'مشاركة كصورة' : 'تنزيل كصورة';

  // ---------- الربط مع دوال app.js الحالية (بدون تعديلها) ----------
  const _renderResults = window.renderResults;
  window.renderResults = function(){
    const r = _renderResults.apply(this, arguments);
    try { decorateRows(); if($('view-share-cart').classList.contains('active')) renderCart(); } catch(e){ console.warn(e); }
    return r;
  };
  const _afterDetail = window.afterItemDetailRender_;
  window.afterItemDetailRender_ = function(item){
    const r = _afterDetail.apply(this, arguments);
    try {
      $('employeeShareImgRow').style.display = enabled() ? 'flex' : 'none';
      setMsg($('shareImageMsg'), '');
      syncToggles();
      if(enabled()) prepareSingle(item).catch(() => {});     // تجهيز مسبق حتى تفتح المشاركة فورًا
    } catch(e){ console.warn(e); }
    return r;
  };
  const _updateBasketBar = window.updateBasketBar;
  window.updateBasketBar = function(){
    const r = _updateBasketBar.apply(this, arguments);
    try { updateBar(); } catch(e){}
    return r;
  };
  window.addEventListener('popstate', () => setTimeout(() => {
    try { updateBar(); if($('view-share-cart').classList.contains('active')) renderCart(); } catch(e){}
  }, 0));

  try { decorateRows(); } catch(e){}
  updateBar();
})();
