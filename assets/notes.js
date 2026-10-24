/* 读者笔记：长按（或用鼠标）选中正文里的一句话，可以划线、写想法、复制、生成分享卡片。
   笔记只存在读者自己的浏览器里（localStorage，每本书一份：marks-书的代号），网站收不到，别人也看不到；
   想让朋友看到，就生成卡片发出去，卡片上的二维码直接打开原文那一段（网址末尾 #p-段落序号）。
   阅读页：正文里显示划线，目录抽屉里多一栏“笔记”；书页：列出这本书的全部笔记。
   画卡片、二维码、复制和提示用 share.js 里的 window.siteShare。 */
(function () {
  var ui = document.getElementById('notes-ui');
  var S = window.siteShare;
  if (!ui || !S) return;
  var KEY = 'marks-' + ui.dataset.book;
  var BOOK = ui.dataset.bookTitle;
  var IS_COLUMN = ui.dataset.kind === 'column';
  var AUTHOR = ui.dataset.author;
  var COLOR = ui.dataset.color || '#2A2420';
  var SITE = ui.dataset.site.replace(/\/$/, '');
  var HOW = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? '长按选中' : '用鼠标选中';   // 手机上长按，电脑上拖选

  /* ---------- 存取 ---------- */
  function load() {
    try { var a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { S.say('没能保存：这个浏览器不允许网站存数据（可能开了无痕模式）'); return false; }
  }
  function find(id) { return load().filter(function (m) { return m.id === id; })[0] || null; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function linkOf(m) { return SITE + m.url + '#p-' + m.p; }
  function sourceOf(m) { return IS_COLUMN ? AUTHOR + '《' + m.chapter + '》（' + BOOK + '）' : AUTHOR + '《' + BOOK + '》' + m.chapter; }
  function textOf(m) {
    return '「' + m.quote + '」\n' + (m.note ? '我的想法：' + m.note + '\n' : '') + '——' + sourceOf(m) + '\n' + linkOf(m);
  }

  function add(draft, note) {
    var list = load();
    var m = { id: newId(), url: draft.url, chapter: draft.chapter, p: draft.p, s: draft.s, e: draft.e, raw: draft.raw, quote: draft.quote, note: note || '', t: Date.now() };
    list.push(m);
    if (!save(list)) return null;
    changed();
    return m;
  }
  function update(id, note) {
    var list = load(), m = null;
    list.forEach(function (x) { if (x.id === id) { x.note = note; x.u = Date.now(); m = x; } });
    if (m && save(list)) changed();
    return m;
  }
  function remove(id) {
    if (save(load().filter(function (m) { return m.id !== id; }))) changed();
  }

  /* ---------- 弹窗：写想法、分享卡片 ---------- */
  var overlay = ui.querySelector('[data-notes-close].share-overlay');
  var sheet = ui.querySelector('[data-note-sheet]');
  var cardPanel = ui.querySelector('[data-note-card]');
  var openDialog = null, lastFocus = null;
  function openD(d) {
    closeD();
    lastFocus = document.activeElement;
    d.hidden = false; overlay.hidden = false; openDialog = d;
  }
  function closeD() {
    if (!openDialog) return;
    openDialog.hidden = true; overlay.hidden = true; openDialog = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  ui.querySelectorAll('[data-notes-close]').forEach(function (b) { b.addEventListener('click', closeD); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeD(); });

  var editing = null;
  var quoteEl = sheet.querySelector('[data-sheet-quote]');
  var ta = sheet.querySelector('textarea');
  var delBtn = sheet.querySelector('[data-sheet-del]');
  function openSheet(m) {
    editing = m;
    quoteEl.textContent = m.quote;
    ta.value = m.note || '';
    delBtn.hidden = !m.id;
    openD(sheet);
    ta.focus();
  }
  function saveSheet(quiet) {
    var note = ta.value.replace(/\s+$/, '');
    var m = editing.id ? update(editing.id, note) : add(editing, note);
    if (!m) return null;
    closeD();
    if (!quiet) S.say(note ? '想法已保存，只有你自己看得到' : '已划线');
    return m;
  }
  sheet.querySelector('[data-sheet-save]').addEventListener('click', function () { saveSheet(false); });
  sheet.querySelector('[data-sheet-card]').addEventListener('click', function () {
    var m = saveSheet(true);   // 接着打开卡片，不再弹“已保存”的提示
    if (m) showCard(m);
  });
  delBtn.addEventListener('click', function () {
    if (!editing || !editing.id) return;
    remove(editing.id);
    closeD();
    S.say('已删除这条笔记');
  });

  /* 分享卡片：上面一条书的颜色写书名和章名，中间是原文和想法，下面是作者、网站和二维码 */
  function noteLines(ctx, note, width, max) {
    var lines = [];
    note.split(/\n+/).forEach(function (part) { if (part.trim()) lines = lines.concat(S.wrap(ctx, part.trim(), width, max)); });
    if (lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].replace(/…?$/, '…'); }
    return lines;
  }
  function drawCard(m) {
    var W = 1080, PAD = 96, TEXT_W = W - PAD * 2;
    var meas = document.createElement('canvas').getContext('2d');
    meas.font = '500 52px ' + S.SERIF;
    var qLines = S.wrap(meas, m.quote, TEXT_W, m.note ? 8 : 12);
    meas.font = '400 40px ' + S.SERIF;
    var nLines = m.note ? noteLines(meas, m.note, TEXT_W, 8) : [];
    var quoteTop = 430;
    var bodyEnd = quoteTop + qLines.length * 88 + (nLines.length ? 150 + nLines.length * 68 : 0);
    var H = Math.max(1080, bodyEnd + 400);

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLOR;
    ctx.fillRect(0, 0, W, 210);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 44px ' + S.SERIF;
    ctx.fillText(IS_COLUMN ? BOOK : '《' + BOOK + '》', PAD, 104);
    ctx.globalAlpha = .88;
    ctx.font = '400 32px ' + S.SANS;
    S.wrap(ctx, m.chapter, TEXT_W, 1).forEach(function (l) { ctx.fillText(l, PAD, 160); });
    ctx.globalAlpha = 1;

    ctx.fillStyle = COLOR;
    ctx.globalAlpha = .35;
    ctx.font = '700 200px ' + S.SERIF;
    ctx.fillText('“', PAD - 14, 400);
    ctx.globalAlpha = 1;

    var y = quoteTop;
    ctx.fillStyle = '#2A2420';
    ctx.font = '500 52px ' + S.SERIF;
    qLines.forEach(function (l) { ctx.fillText(l, PAD, y); y += 88; });

    if (nLines.length) {
      y += 30;
      ctx.fillStyle = COLOR;
      ctx.fillRect(PAD, y, 64, 6);
      ctx.fillStyle = '#6B6259';
      ctx.font = '500 30px ' + S.SANS;
      ctx.fillText('我的想法', PAD, y + 62);
      y += 130;
      ctx.fillStyle = '#4A4038';
      ctx.font = '400 40px ' + S.SERIF;
      nLines.forEach(function (l) { ctx.fillText(l, PAD, y); y += 68; });
    }

    var footY = H - 330;
    ctx.fillStyle = '#E3DCCF';
    ctx.fillRect(PAD, footY, TEXT_W, 2);
    ctx.fillStyle = '#2A2420';
    ctx.font = '700 46px ' + S.SERIF;
    ctx.fillText(AUTHOR, PAD, footY + 110);
    ctx.fillStyle = '#6B6259';
    ctx.font = '400 28px ' + S.SANS;
    ctx.fillText('长按识别二维码，读这一段', PAD, footY + 170);
    ctx.font = '400 24px ' + S.SANS;
    ctx.fillText(SITE.replace(/^https?:\/\//, ''), PAD, footY + 220);

    var q = S.makeQR(linkOf(m)), n = q.getModuleCount(), size = 220, cell = size / n;
    var qx = W - PAD - size, qy = footY + 40;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qx - 12, qy - 12, size + 24, size + 24);
    ctx.fillStyle = '#2A2420';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (q.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
    return canvas.toDataURL('image/png');
  }
  var cardMark = null;
  var cardSave = cardPanel.querySelector('[data-card-save]');
  if (S.inWeChat) cardSave.hidden = true;   // 微信里不能下载，长按图片保存
  function showCard(m) {
    S.withQR(function () {
      var url = drawCard(m);
      cardMark = m;
      cardPanel.querySelector('[data-card-img]').src = url;
      cardSave.href = url;
      cardSave.setAttribute('download', (m.chapter || BOOK) + '-想法卡片.png');
      openD(cardPanel);
      cardPanel.querySelector('.share-close').focus();
    });
  }
  cardPanel.querySelector('[data-card-copy]').addEventListener('click', function () { copyMark(cardMark); });
  function copyMark(m) {
    if (!m) return;
    S.copyText(textOf(m)).then(
      function () { S.say('已复制原文、出处和链接'); },
      function () { S.say('没能复制，请稍后再试'); }
    );
  }

  /* ---------- 笔记列表（阅读页目录抽屉里、书页上） ---------- */
  function fmtDate(t) { var d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function listHTML(list) {
    if (!list.length) return '<p class="notes-empty">还没有笔记。读的时候' + HOW + '一句话，就能划线、写想法，还能生成卡片发给朋友。</p>';
    var groups = {}, order = [];
    list.forEach(function (m) {
      if (!groups[m.url]) { groups[m.url] = []; order.push(m.url); }
      groups[m.url].push(m);
    });
    order.sort();
    var html = order.map(function (url) {
      var items = groups[url].sort(function (a, b) { return a.p - b.p || a.s - b.s; });
      return '<section class="notes-group"><h3>' + esc(items[0].chapter) + '</h3>' + items.map(function (m) {
        return '<article class="note-item" data-id="' + esc(m.id) + '">' +
          '<blockquote class="note-item-quote">' + esc(m.quote) + '</blockquote>' +
          (m.note ? '<p class="note-item-text">' + esc(m.note) + '</p>' : '') +
          '<div class="note-item-foot"><time>' + fmtDate(m.u || m.t) + '</time><span class="note-item-acts">' +
          '<a href="' + esc(m.url + '#p-' + m.p) + '" data-go>原文</a>' +
          '<button type="button" data-act="edit">' + (m.note ? '改想法' : '写想法') + '</button>' +
          '<button type="button" data-act="card">分享</button>' +
          '<button type="button" data-act="del">删除</button></span></div></article>';
      }).join('') + '</section>';
    }).join('');
    return html + '<div class="notes-foot"><button type="button" class="btn ghost" data-notes-copy>复制全部笔记</button>' +
      '<p>笔记只保存在这台设备的浏览器里，换手机或清理浏览器数据后会丢失；想留着，可以先复制下来。</p></div>';
  }
  function renderLists() {
    var list = load();
    document.querySelectorAll('[data-notes-list]').forEach(function (host) {
      host.innerHTML = listHTML(list);
      var section = host.closest('[data-notes-section]');
      if (section) section.hidden = !list.length;
    });
    document.querySelectorAll('[data-notes-count]').forEach(function (el) { el.textContent = list.length ? list.length : ''; });
  }
  document.addEventListener('click', function (e) {
    var host = e.target.closest('[data-notes-list]');
    if (!host) return;
    if (e.target.closest('[data-notes-copy]')) {
      var all = load();
      var text = (IS_COLUMN ? BOOK : '《' + BOOK + '》') + ' · 我的笔记\n\n' + all.map(textOf).join('\n\n');
      S.copyText(text).then(function () { S.say('已复制 ' + all.length + ' 条笔记'); }, function () { S.say('没能复制，请稍后再试'); });
      return;
    }
    var item = e.target.closest('.note-item');
    if (!item) return;
    var m = find(item.getAttribute('data-id'));
    if (!m) return;
    var go = e.target.closest('[data-go]');
    if (go && reader && m.url === location.pathname) {
      e.preventDefault();
      var closeBtn = document.querySelector('.reader-drawer .drawer-close');
      if (closeBtn) closeBtn.click();
      reader.flash(m.p);
      return;
    }
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'edit') openSheet(m);
    else if (a === 'card') showCard(m);
    else if (a === 'del' && window.confirm('删除这条笔记？')) { remove(m.id); S.say('已删除这条笔记'); }
  });

  /* ---------- 阅读页：正文里的划线、选中文字后的菜单 ---------- */
  var reader = null;
  var card = document.querySelector('.reader-card');
  var prose = card && card.querySelector('.prose');
  if (prose) reader = initReader();

  function initReader() {
    var here = location.pathname;
    var nameEl = document.querySelector('.running-name');
    var chapter = (nameEl ? nameEl.textContent : document.title).trim();
    /* 可以划线的段落：正文段落、引文、列表项、小标题；出处列表不算 */
    var blocks = [].slice.call(prose.querySelectorAll(':scope > p, :scope > blockquote, :scope > ul:not(.sources) > li, :scope > ol:not(.sources) > li, :scope > h2, :scope > h3'));
    var orig = blocks.map(function (b, i) { b.setAttribute('data-p', i + 1); return b.innerHTML; });

    /* 找到这条划线在哪一段；作者改过原文、位置变了，就在全章里按原文找 */
    function locate(m) {
      var b = blocks[m.p - 1];
      if (b && b.textContent.slice(m.s, m.e) === m.raw) return m.p - 1;
      for (var i = 0; i < blocks.length; i++) {
        var k = blocks[i].textContent.indexOf(m.raw);
        if (k >= 0) { m.p = i + 1; m.s = k; m.e = k + m.raw.length; return i; }
      }
      return -1;
    }
    function wrapMark(b, m) {
      var walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, null, false), nodes = [], node, pos = 0, last = null;
      while ((node = walker.nextNode())) nodes.push(node);
      nodes.forEach(function (t) {
        var start = pos, len = t.data.length;
        pos += len;
        var a = Math.max(m.s, start) - start, z = Math.min(m.e, start + len) - start;
        if (a >= z) return;
        var piece = t;
        if (z < len) piece.splitText(z);
        if (a > 0) piece = piece.splitText(a);
        var mark = document.createElement('mark');
        mark.className = 'hl';
        mark.setAttribute('data-id', m.id);
        piece.parentNode.insertBefore(mark, piece);
        mark.appendChild(piece);
        last = mark;
      });
      if (last && m.note) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hl-note';
        btn.setAttribute('data-id', m.id);
        btn.setAttribute('aria-label', '看这条想法');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>';
        last.parentNode.insertBefore(btn, last.nextSibling);
      }
    }
    function render() {
      var list = load(), moved = false, byBlock = {};
      list.forEach(function (m) {
        if (m.url !== here) return;
        var before = m.p + ':' + m.s;
        var i = locate(m);
        if (m.p + ':' + m.s !== before) moved = true;
        if (i >= 0) (byBlock[i] = byBlock[i] || []).push(m);
      });
      if (moved) save(list);
      blocks.forEach(function (b, i) {
        var marks = byBlock[i];
        if (!marks && !b._marked) return;
        b.innerHTML = orig[i];
        b._marked = !!marks;
        if (marks) marks.sort(function (x, y) { return x.s - y.s; }).forEach(function (m) { wrapMark(b, m); });
      });
    }

    /* 选中文字 → 记下是哪一段、从第几个字到第几个字；跨段时只取第一段 */
    function readSelection() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      var r = sel.getRangeAt(0);
      var startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
      var b = startEl.closest && startEl.closest('[data-p]');
      if (!b || !prose.contains(b)) return null;
      var range = r.cloneRange();
      if (!b.contains(range.endContainer)) range.setEnd(b, b.childNodes.length);
      var pre = document.createRange();
      pre.setStart(b, 0);
      pre.setEnd(range.startContainer, range.startOffset);
      var s = pre.toString().length, raw = range.toString();
      var lead = raw.length - raw.replace(/^\s+/, '').length;
      raw = raw.trim();
      if (!raw) return null;
      var frag = range.cloneContents();
      [].forEach.call(frag.querySelectorAll('.ref, .hl-note'), function (x) { x.parentNode.removeChild(x); });   // 引用角标不进卡片
      var quote = frag.textContent.replace(/\s+/g, ' ').trim() || raw;
      return { url: here, chapter: chapter, p: +b.getAttribute('data-p'), s: s + lead, e: s + lead + raw.length, raw: raw, quote: quote, rect: range.getBoundingClientRect() };
    }

    var menu = document.createElement('div');
    menu.className = 'note-menu';
    menu.setAttribute('role', 'toolbar');
    menu.setAttribute('aria-label', '划线和想法');
    menu.hidden = true;
    document.body.appendChild(menu);
    var pending = null, pressing = false;
    function showMenu(rect, items) {
      menu.innerHTML = items.map(function (it) { return '<button type="button" data-act="' + it[0] + '">' + it[1] + '</button>'; }).join('');
      menu.hidden = false;
      var mw = menu.offsetWidth, mh = menu.offsetHeight;
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var top = rect.bottom + 14;                       // 放在选中文字下面，避开手机系统自带的“复制”菜单
      if (top + mh > vh - 84) top = rect.top - mh - 14;
      top = Math.max(8, Math.min(top, vh - mh - 8));
      var left = Math.max(8, Math.min(rect.left + rect.width / 2 - mw / 2, vw - mw - 8));
      menu.style.top = top + 'px';
      menu.style.left = left + 'px';
    }
    function hideMenu() { menu.hidden = true; pending = null; }
    function clearSel() { var sel = window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); }

    var timer;
    document.addEventListener('selectionchange', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (pressing || openDialog) return;
        var cur = readSelection();
        if (cur) { pending = cur; showMenu(cur.rect, [['mark', '划线'], ['note', '写想法'], ['card', '分享'], ['copy', '复制']]); }
        else if (pending && !pending.id) hideMenu();
      }, 250);
    });
    ['mousedown', 'touchstart'].forEach(function (ev) {
      menu.addEventListener(ev, function (e) {
        pressing = true;
        if (ev === 'mousedown') e.preventDefault();       // 电脑上点菜单时不让选中的文字消失
      }, { passive: ev !== 'mousedown' });
    });
    menu.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      setTimeout(function () { pressing = false; }, 300);
      if (!btn || !pending) return;
      var act = btn.getAttribute('data-act'), cur = pending;
      var saved = cur.id ? find(cur.id) : null, target = saved || cur;
      hideMenu();
      if (act !== 'copy') clearSel();
      if (act === 'mark') { if (add(cur, '')) { clearSel(); S.say('已划线，可以在“目录 › 我的笔记”里找到'); } }
      else if (act === 'note') openSheet(target);
      else if (act === 'card') showCard(target);
      else if (act === 'copy') { copyMark(target); clearSel(); }
      else if (act === 'del') { remove(cur.id); S.say('已删除这条划线'); }
    });
    prose.addEventListener('click', function (e) {
      var t = e.target.closest('.hl-note, mark.hl');
      if (!t || String(window.getSelection())) return;
      var m = find(t.getAttribute('data-id'));
      if (!m) return;
      if (t.classList.contains('hl-note')) { openSheet(m); return; }
      pending = { id: m.id };
      showMenu(t.getBoundingClientRect(), [['note', m.note ? '看想法' : '写想法'], ['card', '分享'], ['copy', '复制'], ['del', '删除划线']]);
    });
    document.addEventListener('click', function (e) {
      if (menu.hidden || menu.contains(e.target) || e.target.closest('mark.hl')) return;
      if (!String(window.getSelection())) hideMenu();
    });
    window.addEventListener('scroll', function () {
      if (menu.hidden || !pending) return;
      if (pending.id) { hideMenu(); return; }
      var cur = readSelection();
      if (cur) showMenu(cur.rect, [['mark', '划线'], ['note', '写想法'], ['card', '分享'], ['copy', '复制']]);
    }, { passive: true });

    /* 打开带 #p-段落序号 的链接（分享卡片上的二维码）：滚到那一段，并闪一下 */
    function flash(p) {
      var b = blocks[p - 1];
      if (!b) return;
      b.scrollIntoView({ block: 'center' });
      b.classList.remove('p-flash');
      void b.offsetWidth;
      b.classList.add('p-flash');
    }
    var hash = /^#p-(\d+)$/.exec(location.hash);
    if (hash) setTimeout(function () { flash(+hash[1]); }, 80);

    /* 目录抽屉：目录 / 笔记 两栏 */
    var tabs = document.querySelectorAll('[data-drawer-tab]');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var name = t.getAttribute('data-drawer-tab');
        tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); });
        document.querySelectorAll('[data-drawer-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-drawer-pane') !== name; });
      });
    });

    /* 第一次打开阅读页时提示一次怎么用 */
    var seen = null;
    try { seen = localStorage.getItem('notes-hint'); } catch (e) {}
    if (!seen) setTimeout(function () {
      var hint = document.createElement('div');
      hint.className = 'note-hint';
      hint.setAttribute('role', 'status');
      hint.innerHTML = '<span>小提示：' + HOW + '一句话，可以划线、写想法，还能生成卡片发给朋友。</span><button type="button" aria-label="知道了">×</button>';
      document.body.appendChild(hint);
      function done() { if (hint.parentNode) hint.parentNode.removeChild(hint); }
      hint.querySelector('button').addEventListener('click', done);
      setTimeout(done, 8000);
      try { localStorage.setItem('notes-hint', '1'); } catch (e) {}
    }, 1500);

    render();
    return { render: render, flash: flash };
  }

  function changed() {
    if (reader) reader.render();
    renderLists();
  }
  renderLists();
})();
