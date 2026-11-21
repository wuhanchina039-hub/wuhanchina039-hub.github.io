/* 分享：复制链接、系统分享、微信二维码、生成分享图。
   页面上带 data-share-open 的按钮打开面板，data-share-copy 的按钮直接复制。
   二维码库 qrcode.js 用到时才加载；在微信里打开时不显示二维码，改为提示右上角转发。
   复制、提示、二维码、折行这几样工具放在 window.siteShare 里，读者笔记（notes.js）画分享卡片时也用。 */
(function () {
  var panel = document.getElementById('share-panel');
  if (!panel) return;
  var d = panel.dataset;
  var overlay = document.querySelector('.share-overlay');
  var inWeChat = /MicroMessenger/i.test(navigator.userAgent);
  var opener = null;

  /* ---------- 提示：面板开着时写在面板里，关着时用页面底部的小提示 ---------- */
  var status = panel.querySelector('[data-share-status]');
  var toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);
  function say(msg) {
    var out = panel.hidden ? toast : status;
    out.textContent = msg;
    out.classList.add('is-shown');
    clearTimeout(out._t);
    out._t = setTimeout(function () { out.classList.remove('is-shown'); out.textContent = ''; }, 2600);
  }

  /* ---------- 打开与关闭 ---------- */
  function open(trigger) {
    panel.hidden = false;
    if (overlay) overlay.hidden = false;
    opener = trigger || null;
    if (opener) opener.setAttribute('aria-expanded', 'true');
    showWeChat();
    panel.querySelector('.share-close').focus();
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    if (overlay) overlay.hidden = true;
    if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
    opener = null;
  }
  document.querySelectorAll('[data-share-open]').forEach(function (b) {
    b.setAttribute('aria-controls', 'share-panel');
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      if (panel.hidden) open(b); else close();
    });
  });
  document.querySelectorAll('[data-share-close]').forEach(function (b) { b.addEventListener('click', close); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  /* ---------- 复制链接：复制“标题 + 网址”，粘贴到微信里就能发 ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { if (document.execCommand('copy')) resolve(); else reject(); } catch (err) { reject(err); }
      document.body.removeChild(ta);
    });
  }
  document.querySelectorAll('[data-share-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      copyText(d.shareTitle + '\n' + d.shareUrl).then(
        function () { say('已复制标题和链接，可以粘贴给朋友了'); },
        function () { say('没能复制，请长按地址栏复制链接'); }
      );
    });
  });

  /* ---------- 系统分享（手机浏览器里有；微信里用右上角） ---------- */
  var nativeBtn = panel.querySelector('[data-share-native]');
  if (nativeBtn && navigator.share && !inWeChat) {
    nativeBtn.hidden = false;
    nativeBtn.addEventListener('click', function () {
      navigator.share({ title: d.shareTitle, text: d.shareDesc, url: d.shareUrl }).catch(function () {});
    });
  }

  /* ---------- 二维码 ---------- */
  function withQR(cb) {
    if (window.qrcode) { cb(); return; }
    var s = document.createElement('script');
    s.src = d.qrSrc;
    s.onload = cb;
    s.onerror = function () { say('二维码没有加载出来，请稍后再试'); };
    document.head.appendChild(s);
  }
  function makeQR(url) {
    var q = window.qrcode(0, 'M');
    q.addData(url || d.shareUrl);
    q.make();
    return q;
  }
  function showWeChat() {
    var box = panel.querySelector('[data-share-qr]');
    var tip = panel.querySelector('[data-share-tip]');
    if (inWeChat) {
      box.hidden = true;
      tip.textContent = '点右上角 ··· ，选“发送给朋友”或“分享到朋友圈”';
      return;
    }
    if (box.firstChild) return;
    withQR(function () { box.innerHTML = makeQR().createSvgTag({ cellSize: 4, margin: 2, scalable: true }); });
  }

  /* ---------- 分享图：标题、摘要、作者和二维码画在一张竖图上 ---------- */
  var SERIF = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", serif';
  var SANS = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  var NO_LINE_START = '，。、；：？！）》」』”’…';

  /* 按宽度折行：中文逐字断开，连续的英文和数字当一个词；标点不放在行首；超出行数时末尾加省略号 */
  function wrap(ctx, text, width, maxLines) {
    var tokens = text.match(/[A-Za-z0-9.,'’\-]+|\s+|./g) || [];
    var lines = [], line = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!line && /^\s+$/.test(t)) continue;
      if (ctx.measureText(line + t).width > width && line && NO_LINE_START.indexOf(t) < 0) {
        lines.push(line.replace(/\s+$/, ''));
        line = /^\s+$/.test(t) ? '' : t;
      } else {
        line += t;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }

  function drawPoster() {
    var W = 1080, H = 1440, PAD = 96;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var color = d.shareColor || '#2A2420';

    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, 220);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 36px ' + SANS;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(d.shareFrom || d.shareAuthor, PAD, 132);

    var y = 340;
    ctx.fillStyle = '#2A2420';
    ctx.font = '700 72px ' + SERIF;
    wrap(ctx, d.shareTitle, W - PAD * 2, 3).forEach(function (l) { ctx.fillText(l, PAD, y); y += 100; });
    ctx.fillStyle = color;
    ctx.fillRect(PAD, y - 40, 80, 6);

    y += 50;
    ctx.fillStyle = '#4A4038';
    ctx.font = '400 38px ' + SERIF;
    wrap(ctx, d.shareDesc, W - PAD * 2, 7).forEach(function (l) { ctx.fillText(l, PAD, y); y += 70; });

    var footY = H - 330;
    ctx.fillStyle = '#E3DCCF';
    ctx.fillRect(PAD, footY, W - PAD * 2, 2);
    ctx.fillStyle = '#2A2420';
    ctx.font = '700 46px ' + SERIF;
    ctx.fillText(d.shareAuthor, PAD, footY + 110);
    ctx.fillStyle = '#6B6259';
    ctx.font = '400 28px ' + SANS;
    ctx.fillText('长按识别二维码，阅读全文', PAD, footY + 170);
    ctx.font = '400 24px ' + SANS;
    ctx.fillText(d.shareUrl.replace(/^https?:\/\//, '').split('/')[0], PAD, footY + 220);   // 只写网站域名，完整地址在二维码里

    var q = makeQR(), n = q.getModuleCount(), size = 220, cell = size / n;
    var qx = W - PAD - size, qy = footY + 40;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qx - 12, qy - 12, size + 24, size + 24);
    ctx.fillStyle = '#2A2420';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (q.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
    return canvas.toDataURL('image/png');
  }

  function showPoster(url, msg) {
    var out = panel.querySelector('[data-share-poster-out]');
    out.querySelector('[data-share-poster-img]').src = url;
    var save = out.querySelector('[data-share-poster-save]');
    save.href = url;
    save.setAttribute('download', d.shareTitle + '.png');
    out.hidden = false;
    panel.querySelector('[data-share-wechat]').hidden = true;
    say(msg);
  }
  var posterBtn = panel.querySelector('[data-share-poster]');
  if (posterBtn) posterBtn.addEventListener('click', function () {
    /* 做好的分享图（首页的网站卡片）直接显示；其他页面现画一张 */
    if (d.sharePosterSrc) { showPoster(d.sharePosterSrc, '分享图已打开'); return; }
    withQR(function () { showPoster(drawPoster(), '分享图已生成'); });
  });

  window.siteShare = { say: say, copyText: copyText, withQR: withQR, makeQR: makeQR, wrap: wrap, inWeChat: inWeChat, SERIF: SERIF, SANS: SANS };
})();
