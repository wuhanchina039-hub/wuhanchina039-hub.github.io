/* 章节阅读页的交互：目录抽屉、阅读设置（字号 / 字体 / 背景）、阅读进度、
   手机底部工具栏（往下读时收起，点一下正文显示或收起）、键盘 ← → 翻章。
   设置保存在读者自己的浏览器里。 */
(function () {
  var root = document.documentElement;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) {
      try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {}
    }
  };

  /* ---------- 阅读设置 ---------- */
  var SCALES = [0.85, 0.92, 1, 1.1, 1.2, 1.32];
  var scaleOut = document.querySelector('[data-scale-value]');
  var scale = parseFloat(store.get('reader-size'));
  if (SCALES.indexOf(scale) < 0) scale = 1;

  function applyScale() {
    root.style.setProperty('--reader-scale', scale);
    if (scaleOut) scaleOut.textContent = Math.round(scale * 100) + '%';
    store.set('reader-size', scale === 1 ? '' : String(scale));
  }
  function setPressed(attr, value) {
    document.querySelectorAll('[' + attr + ']').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value));
    });
  }
  function applyChoice(dataKey, attr, storeKey, value) {
    if (value) root.dataset[dataKey] = value; else delete root.dataset[dataKey];
    store.set(storeKey, value);
    setPressed(attr, value);
  }

  document.querySelectorAll('[data-scale]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = SCALES.indexOf(scale) + parseInt(b.getAttribute('data-scale'), 10);
      scale = SCALES[Math.max(0, Math.min(SCALES.length - 1, i))];
      applyScale();
    });
  });
  document.querySelectorAll('[data-font-set]').forEach(function (b) {
    b.addEventListener('click', function () { applyChoice('font', 'data-font-set', 'reader-font', b.getAttribute('data-font-set')); });
  });
  document.querySelectorAll('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () { applyChoice('theme', 'data-theme-set', 'reader-theme', b.getAttribute('data-theme-set')); });
  });
  applyScale();
  setPressed('data-font-set', root.dataset.font || '');
  setPressed('data-theme-set', root.dataset.theme || '');

  /* ---------- 目录抽屉与设置面板 ---------- */
  var overlay = document.querySelector('.reader-overlay');
  var openPanel = null, opener = null;

  function close() {
    if (!openPanel) return;
    openPanel.hidden = true;
    if (overlay) overlay.hidden = true;
    if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
    openPanel = opener = null;
  }
  function open(panel, trigger) {
    close();
    panel.hidden = false;
    openPanel = panel; opener = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    if (panel.classList.contains('reader-drawer')) {
      if (overlay) overlay.hidden = false;
      var current = panel.querySelector('[aria-current="page"]');
      if (current) current.scrollIntoView({ block: 'center' });
      var closeBtn = panel.querySelector('.drawer-close');
      if (closeBtn) closeBtn.focus();
    }
  }
  document.querySelectorAll('[data-open]').forEach(function (t) {
    t.addEventListener('click', function (e) {
      var panel = document.getElementById(t.getAttribute('data-open'));
      if (!panel) return;            // 没有对应面板时按普通链接打开目录页
      e.preventDefault();
      if (openPanel === panel) close(); else open(panel, t);
    });
  });
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
  document.addEventListener('click', function (e) {
    // 点设置面板以外的地方，关闭设置面板
    if (openPanel && openPanel.classList.contains('reader-panel') &&
        !openPanel.contains(e.target) && !(opener && opener.contains(e.target))) close();
  });

  /* ---------- 回到顶部 ---------- */
  var topLink = document.querySelector('[data-top]');
  if (topLink) topLink.addEventListener('click', function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------- 阅读进度；手机上读过标题后显示章节名，底部栏往下读时收起 ---------- */
  var bar = document.querySelector('.reader-progress span');
  var percent = document.querySelector('.reader-percent');
  var running = document.querySelector('.reader-running');
  var title = document.querySelector('.chapter-head h1');
  var tools = document.querySelector('.reader-tools');
  var lastY = window.scrollY, ticking = false;
  function onScroll() {
    var y = window.scrollY;
    var max = root.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, y / max) : 1;
    if (bar) bar.style.width = (p * 100) + '%';
    if (percent) percent.textContent = Math.round(p * 100) + '%';
    if (running && title) running.classList.toggle('is-shown', title.getBoundingClientRect().bottom < 0);
    if (tools && !openPanel) {
      if (p > 0.97 || y < lastY - 6) tools.classList.remove('is-hidden');   // 读到章末或往回翻时显示
      else if (y > lastY + 6 && y > 160) tools.classList.add('is-hidden');
    }
    lastY = y; ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- 手机：点一下正文，显示或收起底部工具栏 ---------- */
  var narrow = window.matchMedia('(max-width: 999px)');
  var card = document.querySelector('.reader-card');
  if (card && tools) card.addEventListener('click', function (e) {
    if (!narrow.matches || openPanel) return;
    if (e.target.closest('a, button, input, select, textarea, label')) return;
    if (window.getSelection && String(window.getSelection())) return;   // 正在选字时不切换
    tools.classList.toggle('is-hidden');
  });

  /* ---------- 键盘：← 上一章，→ 下一章，Esc 关闭面板 ---------- */
  var prev = document.querySelector('a[rel="prev"]');
  var next = document.querySelector('a[rel="next"]');
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); return; }
    if (openPanel || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft' && prev) window.location.href = prev.href;
    if (e.key === 'ArrowRight' && next) window.location.href = next.href;
  });
})();
