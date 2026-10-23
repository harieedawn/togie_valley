/* Togie Valley - menus.js (Stage 15C C2)
 * Premium title screen (parallax SVG hills, drifting clouds/leaves, inked logo, big buttons with slot summary) and the pause menu tile grid.
 * API: Game.Menus { buildTitle(titleEl, close), openPause(), summary(meta) }. panels.js delegates: showTitle -> buildTitle, ui:menu -> openPause.
 * Depends on: ui.js, icons.js, saveslots.js, panels.js (UI.openMenu). Loads after tutorial.js. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.Icons || !G.SaveSlots) { console.error('[menus] missing deps'); return; }
  var UI = G.UI, E = G.Events, Icons = G.Icons, SS = G.SaveSlots, INK = '#5b3a29';

  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function btn(html, parent, fn, cls) { var b = el('button', 'tv-btn ' + (cls || ''), parent, html); b.addEventListener('click', function () { UI.sfx('tap'); fn(); }); return b; }
  function ico(n, px) { return Icons.has && !Icons.has(n) ? '' : Icons.ui(n, px); }
  function dur(sec) { var m = Math.floor(sec / 60); return m >= 60 ? Math.floor(m / 60) + ' giờ ' + (m % 60) + ' phút' : m + ' phút'; }
  function summary(m) { return m ? m.season + ' · Ngày ' + m.day + ' · ' + m.money + 'g · ' + dur(m.playTimeSec) : ''; }

  /* ------------------------------------------------ procedural art */
  function hill(fill, path, stroke) { return '<svg class="mn-hill" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true"><path d="' + path + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>'; }
  var CLOUD = '<svg viewBox="0 0 120 50" aria-hidden="true"><path d="M14 44Q2 44 4 32Q6 22 18 24Q20 8 38 10Q48 0 62 8Q76 2 86 14Q104 12 106 28Q118 30 114 40Q112 46 100 44Z" fill="#fff" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/></svg>';
  var SUN = '<svg viewBox="0 0 64 64" aria-hidden="true" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"><g fill="none"><path d="M32 3v7M32 54v7M3 32h7M54 32h7M12 12l5 5M47 47l5 5M52 12l-5 5M17 47l-5 5"/></g><circle cx="32" cy="32" r="14" fill="#ffd76a"/><circle cx="27" cy="27" r="4" fill="#fff" stroke="none"/></svg>';
  function leaf(c) { return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14Q1 3 14 2Q15 13 2 14Z" fill="' + c + '" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 13L11 5" stroke="' + INK + '" stroke-width="1.4" fill="none"/></svg>'; }
  var HOUSE = '<svg viewBox="0 0 84 76" aria-hidden="true" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"><rect x="62" y="6" width="9" height="20" fill="#d9b48a"/><rect x="10" y="32" width="64" height="40" rx="3" fill="#fff1d0"/><path d="M4 36L42 8L80 36Z" fill="#f0806a"/><rect x="34" y="46" width="16" height="26" rx="3" fill="#b57a42"/><rect x="16" y="42" width="12" height="12" rx="2" fill="#a9dcf2"/><rect x="56" y="42" width="12" height="12" rx="2" fill="#a9dcf2"/></svg>';
  function tree(c) { return '<svg viewBox="0 0 50 70" aria-hidden="true" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"><rect x="21" y="40" width="8" height="26" rx="2" fill="#b57a42"/><circle cx="25" cy="26" r="20" fill="' + c + '"/><circle cx="18" cy="20" r="5" fill="#fff" stroke="none" opacity=".35"/></svg>'; }

  function decorate(root) {
    var d = el('div', 'tv-deco', root), i, p;
    d.setAttribute('aria-hidden', 'true');
    el('div', 'mn-sun', d, SUN);
    [[8, 150, 100, 0], [30, 110, 70, -35], [16, 90, 60, -62], [44, 130, 84, -18]].forEach(function (c) { p = el('div', 'mn-cloud', d, CLOUD); p.style.setProperty('--y', c[0] + '%'); p.style.setProperty('--d', c[1] + 's'); p.style.setProperty('--w', c[2] + 'px'); p.style.setProperty('--dl', c[3] + 's'); });
    p = el('div', 'mn-lay mn-l1', d, hill('#b5dcc0', 'M0 100V46Q50 12 110 32T240 22Q320 4 400 38V100Z', '#7a9b86'));
    p = el('div', 'mn-lay mn-l2', d, hill('#8ccf63', 'M0 100V52Q60 22 130 36T250 30Q330 18 400 46V100Z', INK));
    [['16%', 46, tree('#6fbf5a')], ['58%', 84, HOUSE], ['88%', 40, tree('#86cc5f')]].forEach(function (t) { var q = el('div', 'mn-prop', p, t[2]); q.style.setProperty('--x', t[0]); q.style.setProperty('--w', t[1] + 'px'); });
    el('div', 'mn-lay mn-l3', d, hill('#a4d977', 'M0 100V40Q70 12 150 30T300 26Q360 20 400 34V100Z', INK));
    for (i = 0; i < 8; i++) {
      p = el('div', 'mn-leaf', d, leaf(['#86cc5f', '#ffc54d', '#f8a794'][i % 3]));
      p.style.left = ((8 + i * 12) % 96) + '%'; p.style.animationDuration = (9 + (i * 7) % 6) + 's'; p.style.animationDelay = '-' + ((i * 5) % 12) + 's';
    }
  }

  /* ------------------------------------------------ title screen */
  function bestSlot() {
    var best = null;
    SS.list().forEach(function (s) { if (!s.meta) return; if (!best || (s.active && !best.active) || (!!s.active === !!best.active && s.meta.savedAt > best.meta.savedAt)) best = s; });
    return best;
  }
  function buildTitle(root, close) {
    root.classList.add('mn');
    var offs = [];
    function sync() { root.classList.toggle('still', !!(G.Quality && G.Quality.level && G.Quality.level() >= 2)); }
    sync(); offs.push(E.on('quality:changed', sync));
    offs.push(E.on('ui:closed', function () { if (!UI.panelOpen) root.classList.remove('under'); }));
    function done() { offs.forEach(function (o) { o(); }); close(); }
    decorate(root);
    el('h1', 'mn-logo', root, '<span class="mn-wheat">' + Icons.item({ tpl: 'wheat' }, 64) + '</span><span class="w1">Togie</span><span class="w2">Valley</span>').setAttribute('aria-label', 'Togie Valley');
    el('p', 'mn-tag', root, 'Một nông trại nhỏ ấm cúng đang chờ bạn.');
    var main = el('div', 'mn-main', root), best = bestSlot();
    if (best) btn('<span class="mn-l">' + ico('play', 28) + ' Tiếp tục</span><span class="mn-sum"><b>' + best.name + '</b><br>' + summary(best.meta) + '</span>', main, function () { SS.select(best.index); done(); }, 'mn-btn mn-continue');
    btn(ico('sprout', 26) + ' Game mới', main, pick, (best ? 'alt ' : '') + 'mn-btn' + (best ? '' : ' mn-continue'));
    var row = el('div', 'mn-row', main);
    btn(ico('gear', 26) + ' Cài đặt', row, function () { root.classList.add('under'); UI.openMenu('set'); }, 'alt mn-btn');
    btn(ico('guide', 26) + ' Hướng dẫn', row, function () { if (G.Tutorial) G.Tutorial.open(); }, 'alt mn-btn');
    function pick() {   // slot list (empty slot = new game, with naming); the existing SaveSlots UI does the work
      root.classList.add('picking');
      var head = el('div', 'mn-pickhead', root, 'Chọn nông trại'), back;
      SS.buildTitle(root, done);
      var list = root.querySelector('.sv-list');
      back = btn('Quay lại', root, function () {
        [head, list, back].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
        root.classList.remove('picking');
      }, 'alt mn-back');
    }
  }

  /* ------------------------------------------------ pause menu */
  function bagFull() { var c = G.Inventory && G.Inventory.container, i; if (!c) return false; for (i = 0; i < c.size; i++) if (!c.get(i)) return false; return true; }
  function tab(name) { return function () { UI.closePanel(); UI.openMenu(name); }; }
  function openPause() {
    if (UI.panelOpen) return;
    var p = el('div', 'tv-wide mn-pause'), T = G.Time, S = G.State, Gl = G.Goals, grid, tiles;
    el('h2', null, p, 'Menu');
    var act = SS.activeIndex(), nm = act ? SS.name(act) : 'Nông trại';
    el('p', 'mn-farm', p, nm + ' · ' + (G.VI && G.VI.season ? G.VI.season[T.season] : T.season) + ' · Ngày ' + T.dayOfSeason() + ' · ' + Math.floor(S.money) + 'g');
    grid = el('div', 'mn-grid', p);
    tiles = [
      ['bag', 'Túi đồ', tab('bag'), bagFull() ? 'Đầy' : null],
      ['star', 'Kỹ năng', tab('skills')],
      ['notebook', 'Sổ tay', function () { if (G.Notebook && G.Notebook.openTab) G.Notebook.openTab('crops'); tab('book')(); }],
      ['check', 'Mục tiêu', function () { if (G.Notebook && G.Notebook.openTab) G.Notebook.openTab('goals'); tab('book')(); }, Gl ? Gl.doneCount(false) + '/' + (Gl.list.length - 1) : null, 'ok'],
      ['gear', 'Cài đặt', tab('set')],
      ['guide', 'Hướng dẫn', function () { UI.closePanel(); if (G.Tutorial) G.Tutorial.open(); }, G.Tutorial && !G.Tutorial.isDone() ? 'Mới' : null],
      ['arrow-down', 'Lưu', function () { G.Save.now(); UI.toast('Đã lưu game!', 'check'); }],
      ['rotate-left', 'Về menu', function () {
        UI.confirm({ title: 'Về màn hình chính?', text: 'Game sẽ được lưu trước khi thoát.', yes: 'Về menu', no: 'Chơi tiếp' }, function (ok) { if (ok) SS.backToTitle(); });
      }, null, null, 'warn']
    ];
    if (G.Dev && G.Dev.isOn()) tiles.splice(5, 0, ['gear', 'Công cụ dev', function () { UI.closePanel(); G.Dev.openPanel(); }]);
    tiles.forEach(function (t) {
      var b = el('button', 'mn-tile' + (t[5] ? ' ' + t[5] : ''), grid, ico(t[0], 44) + '<span>' + t[1] + '</span>');
      if (t[3]) el('i', 'mn-badge' + (t[4] ? ' ' + t[4] : ''), b, t[3]);
      b.addEventListener('click', function () { UI.sfx('tap'); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} t[2](); });
    });
    var row = el('div', 'tv-row', p); btn('Tiếp tục chơi', row, function () { UI.closePanel(); });
    UI.openPanel(p);
  }

  G.Menus = { buildTitle: buildTitle, openPause: openPause, summary: summary };
})();
