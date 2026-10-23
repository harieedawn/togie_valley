/* Togie Valley - panels.js (Stage 4): backpack/skills/settings/notebook tabs, UI.openContainer, title screen.
 * Depends on: ui, state, items, save, time, player. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.Inventory || !G.Items || !G.State || !G.Save || !G.Containers || !G.Icons) { console.error('[panels] dependencies missing'); return; }
  var UI = G.UI, Icons = G.Icons, E = G.Events, Inv = G.Inventory, Items = G.Items;
  var ui = document.getElementById('ui');

  function el(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  function btn(label, parent, fn, cls) {
    var b = el('button', 'tv-btn' + (cls ? ' ' + cls : ''), parent, label);
    b.addEventListener('click', function (ev) { buzz(); UI.sfx('tap'); fn(ev); });
    return b;
  }

  /* ------------------------------------------------ slot rendering + long press */
  function paintSlot(b, slot, extra) {
    var def = slot && Items.get(slot.id);
    var arrived = b._init && slot && (b._id !== slot.id || slot.n > b._n);
    var cntPop = b._init && slot && slot.n > 1 && b._id === slot.id && slot.n !== b._n;
    b._init = true; b._id = slot ? slot.id : null; b._n = slot ? slot.n : 0;
    b.className = 'tv-slot' + (def ? ' cat-' + def.cat : ' empty') + (extra || '') + (arrived ? ' bump' : '');
    b.dataset.tier = slot && slot.tier ? slot.tier : 0;
    b.innerHTML = (def ? Icons.item(def, 40, slot.tier) : '') + (slot && slot.n > 1 ? '<span class="cnt' + (cntPop ? ' pop' : '') + '">' + slot.n + '</span>' : '');
    b.title = def ? def.name : '';
  }
  function describe(slot) {
    var def = slot && Items.get(slot.id);
    if (!def) return '';
    var q = slot.q && slot.q !== 'normal' ? ' (' + (slot.q === 'gold' ? 'vàng' : 'bạc') + ')' : '';
    var t = slot.tier ? ' · ' + Items.TIERS[slot.tier] : '';
    return '<b>' + Icons.item(def, 20, slot.tier) + ' ' + esc(def.name) + esc(q) + esc(t) + '</b>' + esc(def.tip || '');
  }
  /* tap(ev) on short press, hold() after 420 ms (suppresses the tap) */
  function pressable(b, tap, hold) {
    var t = 0, fired = false;
    function clear() { clearTimeout(t); t = 0; }
    b.addEventListener('pointerdown', function () {
      fired = false; clear();
      if (hold) t = setTimeout(function () { t = 0; fired = true; buzz(); hold(); }, 420);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { b.addEventListener(n, clear); });
    b.addEventListener('click', function (ev) { if (fired) { fired = false; return; } buzz(); UI.sfx('tap'); tap(ev); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); if (hold) { fired = true; hold(); } });
  }

  function fly(fromEl, toEl, def) {
    if (!fromEl || !toEl || !def) return;
    var a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    var f = el('div', 'tv-fly', document.body, Icons.item(def, 28));
    f.style.left = (a.left + a.width / 2 - 14) + 'px'; f.style.top = (a.top + a.height / 2 - 14) + 'px';
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      f.style.transform = 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(.8)'; f.style.opacity = '.3';
    }); });
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 340);
  }

  /* ------------------------------------------------ grid view of a container */
  function Grid(container, parent, handlers) {
    var wrap = el('div', 'tv-grid', parent), cells = [], self = this;
    this.cells = cells; this.container = container; this.pick = -1;
    function build() {
      wrap.innerHTML = ''; cells.length = 0;
      for (var i = 0; i < container.size; i++) (function (i) {
        var b = el('button', 'tv-slot', wrap);
        pressable(b, function () { handlers.tap(i, b, self); }, handlers.hold ? function () { handlers.hold(i, b, self); } : null);
        cells.push(b);
      })(i);
    }
    this.render = function () {
      if (cells.length !== container.size) build();
      for (var i = 0; i < cells.length; i++) paintSlot(cells[i], container.get(i), i === self.pick ? ' pick' : '');
    };
    build(); this.render();
  }

  /* ------------------------------------------------ tabs */
  var tabsPanel = null, tabState = 'bag';
  function skillRow(parent, key, label) {
    var p = G.State.progress(key), row = el('div', 'tv-skill', parent);
    var pct = p.need > 0 ? Math.min(100, Math.round(p.into / p.need * 100)) : 100;
    el('b', null, row, label + ' · Cấp ' + p.level);
    el('small', null, row, p.need > 0 ? p.into + ' / ' + p.need + ' XP để lên cấp' : 'Cấp tối đa!');
    var bar = el('div', 'tv-bar', row); el('i', null, bar).style.width = pct + '%';
  }

  function renderBag(body) {
    var sel = -1, grid, tip = el('div', 'tv-tip', null, 'Chạm một món, rồi chạm ô khác để chuyển hoặc gộp. Giữ để xem thông tin.');
    var row = el('div', 'tv-row', null);
    function showTip(slot) { tip.innerHTML = slot ? describe(slot) : 'Ô trống.'; }
    grid = new Grid(Inv.container, body, {
      tap: function (i, b, g) {
        if (sel < 0) { if (Inv.get(i)) { sel = i; g.pick = i; showTip(Inv.get(i)); } }
        else {
          if (sel !== i) { Inv.move(sel, i); UI.sfx('pop'); }
          sel = -1; g.pick = -1; showTip(null);
        }
        g.render();
      },
      hold: function (i) { showTip(Inv.get(i)); }
    });
    body.appendChild(tip); body.appendChild(row);
    btn(Icons.ui('sort', 22) + ' Sắp xếp', row, function () { sortInventory(); sel = -1; grid.pick = -1; grid.render(); }, 'alt');
    var off = E.on('inventory:changed', function () { if (grid.cells.length && document.body.contains(grid.cells[0])) grid.render(); else off(); });
  }
  function sortInventory() {
    var inv = Inv.container, all = [], i, s;
    for (i = 0; i < inv.size; i++) { s = inv.get(i); if (s) all.push(s); }
    var cats = Items.CATEGORIES;
    all.sort(function (a, b) {
      var da = Items.get(a.id), db = Items.get(b.id);
      var c = cats.indexOf(da.cat) - cats.indexOf(db.cat);
      if (c) return c;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return Items.QUALITIES.indexOf(b.q) - Items.QUALITIES.indexOf(a.q);
    });
    var sel = Inv.selectedIndex(), keepId = Inv.get(sel);
    for (i = 0; i < inv.size; i++) inv.slots[i] = null;
    all.forEach(function (x) { inv.add(x.id, x.n, x.q, x.tier); });
    inv.set(0, inv.get(0)); // fire change once more
    if (keepId) Inv.select(0);
  }
  function renderSkills(body) {
    skillRow(body, 'farming', Icons.ui('sprout', 22) + ' Làm nông'); skillRow(body, 'fishing', Icons.item({ tpl: 'rod', c1: '#b9d46a', c2: '#e8b878' }, 22, 0, true) + ' Câu cá');
    el('div', 'tv-tip', body, 'Kỹ năng lớn lên khi bạn thu hoạch và câu cá. Cấp cao mở khóa đồ ở cửa hàng và nâng cấp.');
  }
  function renderNotebook(body) {
    if (G.Notebook) { G.Notebook.render(body); return; }
    el('div', 'tv-tip', body, '<b>' + Icons.ui('notebook', 22) + ' Sổ tay nhà nông</b>Sắp có rồi: ghi chú về cây trồng, cá, đất (N-P-K) và thời tiết sẽ được gom ở đây.');
  }
  function renderSettings(body) {
    var A = G.Audio;
    [['master', 'Tổng âm lượng', 'volume', null], ['music', 'Nhạc nền', 'volume', null], ['sfx', 'Hiệu ứng', 'volume', 'plant'], ['ambience', 'Âm thanh môi trường', 'volume', null]].forEach(function (d) {
      var row = el('div', null, body, '<div class="tv-sub">' + Icons.ui(d[2], 20) + ' ' + d[1] + '</div><input type="range" min="0" max="100" value="' + Math.round((A ? A.getBusVolume(d[0]) : 1) * 100) + '" style="width:100%">'), rng = row.querySelector('input');
      if (!A) { rng.disabled = true; return; }
      rng.addEventListener('input', function () { var v = rng.value / 100; A.setBusVolume(d[0], v); if (d[0] === 'sfx') A.setBusVolume('ui', v); });
      rng.addEventListener('change', function () { if (d[3]) A.play(d[3]); else if (d[0] === 'master') UI.sfx('pop'); });
    });
    var mrow = el('div', 'tv-row', body);
    var mb = btn(A && A.muted ? 'Bật âm thanh' : 'Tắt tiếng', mrow, function () {
      if (!A) return;
      A.setMuted(!A.muted); mb.textContent = A.muted ? 'Bật âm thanh' : 'Tắt tiếng'; if (!A.muted) UI.sfx('pop');
    }, 'alt');
    if (G.PerfUI) G.PerfUI.renderRow(body, el, btn);   // Stage 14B: Đồ họa
    if (G.UiScale) G.UiScale.renderRow(body, el, btn);   // Stage 14C: Cỡ giao diện
    if (G.Joystick) G.Joystick.renderRow(body, el, btn);   // Stage 15B: Kiểu điều khiển
    if (G.CameraAuto) G.CameraAuto.renderRow(body, el, btn);   // Stage 15B: Camera
    if (G.Tutorial) G.Tutorial.renderRow(body, el, btn);   // Stage 15C: Hướng dẫn
    el('div', 'tv-sub', body, 'Mã lưu');
    var ta = el('textarea', 'tv-ta', body); ta.setAttribute('placeholder', 'Dán mã lưu vào đây để nhập');
    var row = el('div', 'tv-row', body);
    btn('Xuất mã', row, function () {
      ta.value = G.Save.exportCode(); ta.select();
      try { if (navigator.clipboard) navigator.clipboard.writeText(ta.value); } catch (e) {}
      UI.toast('Mã lưu đã sẵn sàng để sao chép.', 'check');
    }, 'alt');
    btn('Nhập mã', row, function () {
      if (G.Dev && ta.value.trim() === 'toiladevbakhi') { G.Dev.toggle(); ta.value = ''; return; }   // Stage 16B: hidden dev switch, never a save code
      if (!ta.value.trim()) { UI.toast('Hãy dán mã lưu trước nhé.', 'warn'); return; }
      UI.confirm({ title: 'Nhập mã lưu?', text: 'Việc này sẽ thay thế game hiện tại của bạn.', yes: 'Nhập', no: 'Hủy' }, function (ok) {
        if (!ok) return;
        if (G.Save.importCode(ta.value)) { UI.closeAll(); UI.toast('Đã nhập mã lưu!', 'check'); }
        else UI.toast('Mã này có vẻ chưa đúng.', 'warn');
      });
    });
    var row2 = el('div', 'tv-row', body);
    if (G.SaveSlots) btn('Đổi nông trại', row2, function () { G.SaveSlots.backToTitle(); }, 'alt');
    btn('Game mới', row2, function () {
      UI.confirm({ title: 'Bắt đầu game mới?', text: 'Tiến trình hiện tại sẽ bị xóa.', yes: 'Game mới', no: 'Chơi tiếp' }, function (ok) {
        if (ok) { UI.closeAll(); G.Save.newGame(); UI.toast('Khởi đầu mới nào!', 'sprout'); }
      });
    }, 'danger');
  }

  var TABS = [['bag', Icons.ui('bag', 22) + ' Túi đồ', renderBag], ['skills', Icons.ui('star', 22) + ' Kỹ năng', renderSkills], ['book', Icons.ui('notebook', 22) + ' Sổ tay', renderNotebook], ['set', Icons.ui('gear', 22) + ' Cài đặt', renderSettings]];
  function showTab(name) {
    if (!tabsPanel) return;
    tabState = name;
    tabsPanel.innerHTML = '';
    var tabs = el('div', 'tv-tabs', tabsPanel), body = el('div', null, tabsPanel);
    TABS.forEach(function (t) {
      var b = btn(t[1], tabs, function () { showTab(t[0]); }, 'alt');
      if (t[0] === name) b.classList.add('on');
    });
    TABS.forEach(function (t) { if (t[0] === name) t[2](body); });
    var row = el('div', 'tv-row', tabsPanel); btn('Đóng', row, function () { UI.closePanel(); });
  }
  UI.openMenu = function (tab) {
    if (tabsPanel) { showTab(tab || tabState); return; }
    tabsPanel = el('div', 'tv-wide');
    UI.openPanel(tabsPanel, { onClose: function () { tabsPanel = null; } });
    showTab(tab || 'bag');
  };
  UI.openBackpack = function () { UI.openMenu('bag'); };
  E.on('ui:backpack', function () { if (titleEl || G.Player.isLocked()) return; if (tabsPanel) UI.closePanel(); else if (!UI.panelOpen) UI.openMenu('bag'); });
  E.on('ui:menu', function () { if (!UI.panelOpen && !titleEl) { if (G.Menus) G.Menus.openPause(); else UI.openMenu(); } });   // Stage 15C: tile grid

  /* ------------------------------------------------ openContainer(container, opts) */
  /* opts: {title, filter(slot)->bool, onChange(container), onClose} */
  UI.openContainer = function (container, opts) {
    opts = opts || {};
    if (!container || !container.get) { console.error('[panels] openContainer: bad container'); return null; }
    var p = el('div', 'tv-wide tv-chest');
    el('h2', null, p, esc(opts.title || 'Rương'));
    var tip = el('div', 'tv-tip', null, 'Chạm = chuyển cả chồng · Giữ = chuyển một (hoặc nửa) · Giữ ô để xem thông tin.');
    function accepts(slot) { return !opts.filter || opts.filter(slot); }
    function changed() { if (opts.onChange) try { opts.onChange(container); } catch (e) { console.error(e); } }
    function transfer(from, to, i, mode, srcEl, toGrid) {
      var s = from.get(i);
      if (!s) return;
      if (to === container && !accepts(s)) { UI.toast('Món này không bỏ vào đây được.', 'no'); return; }
      var def = Items.get(s.id), n = s.n;
      if (mode === 'one') n = 1; else if (mode === 'half') n = Math.max(1, Math.floor(s.n / 2));
      if (def && def.cat === 'tool' && to !== Inv.container && to === container) { UI.toast('Dụng cụ phải mang theo bên mình nhé.', 'lock'); return; }
      var added = to.add(s.id, n, s.q, s.tier);
      if (added <= 0) { UI.toast('Hết chỗ rồi!', 'box'); return; }
      from.removeAt(i, added);
      var tgt = toGrid.cells[0];
      for (var k = 0; k < toGrid.cells.length; k++) { var ts = to.get(k); if (ts && ts.id === s.id) { tgt = toGrid.cells[k]; break; } }
      fly(srcEl, tgt, def);
      UI.sfx('pop'); changed();
    }
    var cg, bg;
    el('div', 'tv-sub', p, 'Rương');
    cg = new Grid(container, p, {
      tap: function (i, b) { transfer(container, Inv.container, i, 'all', b, bg); },
      hold: function (i, b) { var s = container.get(i); tip.innerHTML = describe(s); transfer(container, Inv.container, i, s && s.n > 4 ? 'half' : 'one', b, bg); }
    });
    var row = el('div', 'tv-row', p);
    btn('Lấy hết', row, function () {
      var moved = 0;
      for (var i = 0; i < container.size; i++) {
        var s = container.get(i); if (!s) continue;
        var a = Inv.container.add(s.id, s.n, s.q, s.tier);
        if (a > 0) { fly(cg.cells[i], bg.cells[0], Items.get(s.id)); container.removeAt(i, a); moved += a; }
      }
      if (moved) { UI.sfx('pop'); changed(); } else UI.toast(container.isEmpty() ? 'Không còn gì để lấy.' : 'Hết chỗ rồi!', 'box');
    }, 'alt');
    el('div', 'tv-sub', p, 'Túi đồ');
    bg = new Grid(Inv.container, p, {
      tap: function (i, b) { transfer(Inv.container, container, i, 'all', b, cg); },
      hold: function (i, b) { var s = Inv.get(i); tip.innerHTML = describe(s); transfer(Inv.container, container, i, s && s.n > 4 ? 'half' : 'one', b, cg); }
    });
    p.appendChild(tip);
    var row2 = el('div', 'tv-row', p); btn('Đóng', row2, function () { UI.closePanel(); });
    var offs = [E.on('inventory:changed', function () { bg.render(); })];
    container.onChange(function () { if (document.body.contains(p)) cg.render(); });
    UI.openPanel(p, { onClose: function () { offs.forEach(function (o) { o(); }); if (opts.onClose) opts.onClose(); } });
    return p;
  };

  /* ------------------------------------------------ title screen */
  var titleEl = null;
  function closeTitle() {
    if (!titleEl) return;
    if (titleEl.parentNode) titleEl.parentNode.removeChild(titleEl);
    titleEl = null;
    G.Time.resume('title'); G.Player.unlock('title');
  }
  function decorateTitle(parent) { // drifting clouds, hills, falling leaves (pure CSS animation)
    var d = el('div', 'tv-deco', parent), i, f;
    d.setAttribute('aria-hidden', 'true');
    for (i = 1; i <= 4; i++) el('i', 'tv-cloud c' + i, d);
    el('i', 'tv-hill hill-a', d); el('i', 'tv-hill hill-b', d);
    for (i = 0; i < 9; i++) {
      f = el('i', 'tv-leaf l' + (i % 3 + 1), d);
      f.style.left = ((6 + i * 11) % 96) + '%';
      f.style.animationDuration = (9 + (i * 7) % 6) + 's';
      f.style.animationDelay = '-' + ((i * 5) % 12) + 's';
    }
  }
  function showTitle() {
    if (!ui || titleEl) return;
    titleEl = el('div', null, ui); titleEl.id = 'tv-title';
    if (G.Menus) { G.Time.pause('title'); G.Player.lock('title'); G.Menus.buildTitle(titleEl, closeTitle); return; }   // Stage 15C
    decorateTitle(titleEl);
    el('h1', null, titleEl, '<span class="logo-ico">' + Icons.item({ tpl: 'wheat' }, 64) + '</span><span class="w1">Togie</span><span class="w2">Valley</span>').setAttribute('aria-label', 'Togie Valley');
    el('p', null, titleEl, 'Một nông trại nhỏ ấm cúng đang chờ bạn.');
    G.Time.pause('title'); G.Player.lock('title');
    if (G.SaveSlots) { G.SaveSlots.buildTitle(titleEl, closeTitle); return; }   // Stage 14A: slot list replaces Continue / New game
    if (G.Save.has()) btn(Icons.ui('play', 22) + ' Tiếp tục', titleEl, function () { closeTitle(); });
    btn(Icons.ui('sprout', 22) + ' Game mới', titleEl, function () {
      function go() { closeTitle(); G.Save.newGame(); }
      if (G.Save.has()) UI.confirm({ title: 'Bắt đầu game mới?', text: 'Dữ liệu đã lưu sẽ bị thay thế.', yes: 'Game mới', no: 'Quay lại' }, function (ok) { if (ok) go(); });
      else go();
    }, 'alt');
  }
  // main.js loads after this file and emits game:ready after boot.
  E.once('game:ready', showTitle);

  /* debug helper: chest-style transfer with any container */
  UI.openDebugContainer = function () {
    var c = G.Containers.create(12);
    c.add('compost', 20); c.add('bread', 5); c.add('leaf_feed', 8);
    return UI.openContainer(c, { title: 'Rương thử nghiệm' });
  };
})();
