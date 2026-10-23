/* Togie Valley - dev_tools.js (Stage 16B): hidden dev/showcase mode. Game.Dev.
 * API: isOn(), toggle() (toast), set(on), openPanel(), plus actions: addMoney(n), infMoney(on), infEnergy(on), maxLevel(), setHour(h),
 *   freezeTime(on), speedTime(mult), skipDay(), setSeason(s), setWeather(w), growAll(), give(id,n), unlockAll(), teleport(place), hideHud(on), perf().
 * The flag lives in localStorage ('togie_dev'), never in the save. Toggled from Settings by entering the secret word in "Mã lưu" + "Nhập mã".
 * Depends on: ui.js, state.js, time.js, farm.js (Farm.growAll), items.js. Loads before menus.js. */
(function (G) {
  'use strict';
  var UI = G.UI, E = G.Events, KEY = 'togie_dev';
  if (!UI || !E) { console.error('[dev] missing deps'); return; }
  var Dev = G.Dev = {}, on = false, inf = { money: false, energy: false }, frozen = false, frozenHour = 6, speed = 1, giveN = 1, spawn = null;
  var badge = null, restore = null, style = null;

  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function toast(t, ic) { try { UI.toast(t, ic || 'check'); } catch (e) {} }
  function tryDo(fn) { try { return fn(); } catch (err) { console.error('[dev]', err); toast('Có lỗi nhỏ, thử lại nhé.', 'warn'); } }
  function store(v) { try { if (v === undefined) return localStorage.getItem(KEY) === '1'; if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) {} return false; }

  /* ---------------------------------------------------------------- actions */
  Dev.addMoney = function (n) { G.State.addMoney(n); toast('+' + n + 'g', 'coin'); };
  Dev.infMoney = function (v) { inf.money = !!v; };
  Dev.infEnergy = function (v) { inf.energy = !!v; };
  Dev.maxLevel = function () {
    var S = G.State; Object.keys(S.xp).forEach(function (k) { S.addXp(k, 10000000); });
    toast('Đã lên cấp tối đa, mở hết kỹ năng!', 'star');
  };
  Dev.setHour = function (h) { G.Time.setHour(+h); frozenHour = G.Time.hour; };
  Dev.freezeTime = function (v) { frozen = !!v; frozenHour = G.Time.hour; };
  Dev.speedTime = function (m) { speed = Math.max(1, +m || 1); };
  Dev.skipDay = function () { UI.closePanel(); setTimeout(function () { tryDo(function () { G.Day.sleep('full'); }); }, 200); };
  Dev.setSeason = function (s) {
    var T = G.Time, d, from = T.season;
    if (s === from) return;
    for (d = T.day; d < T.day + 600; d++) if (T.seasonOf(d) === s) break;
    T.day = d; T.season = s; T.tomorrow = T.weatherFor(d + 1);
    G.Render.setSeason(s);
    E.emit('season:changed', { season: s, from: from, day: d });
    toast('Đã đổi mùa.', 'sprout');
  };
  Dev.setWeather = function (w) { var T = G.Time; T.weather = w; E.emit('time:set', { hour: T.hour }); E.emit('weather:changed', { weather: w }); toast('Đã đổi thời tiết.', 'check'); };
  Dev.growAll = function () { if (G.Farm.growAll) { var n = G.Farm.growAll(); toast('Cây đã chín: ' + n, 'sprout'); } };
  Dev.give = function (id, n) { var inv = G.Inventory || G.Inv; var left = inv.add(id, n || 1, 'normal'); toast('Đã nhận ' + (n || 1) + ' ' + (G.Items.get(id).name || id), 'bag'); return left; };
  Dev.teleport = function (place) {
    var P = G.Player, W = G.World, found = null, rx = { farm: /^$/, shop: /shop/i, workshop: /workshop/i, fishstall: /fish/i, pier: /pier|seat/i, house: /door|house|bed/i }[place];
    if (place === 'farm') { if (spawn) found = spawn; }
    else if (W && rx) {
      var src = W.interactables || W.interactable || {}, arr = Array.isArray(src) ? src : Object.keys(src).map(function (k) { return src[k]; });
      arr.some(function (it) { if (it && it.tile && rx.test(String(it.id || '') + ' ' + String(it.type || ''))) { found = { tx: it.tile.tx, tz: it.tile.tz, facing: it.facing }; return true; } return false; });
    }
    if (!found) { toast('Chưa tìm thấy chỗ này.', 'warn'); return; }
    UI.closePanel(); P.placeAt(found);
  };
  Dev.unlockAll = function () {
    var done = 0, items = allItems();
    items.forEach(function (d) {
      if (d.cat === 'fish') { E.emit('fish:caught', { id: d.id, n: 1, q: 'normal', first: true, size: 1, perfect: false, by: G.Net && G.Net.playerId }); done++; }
    });
    if (G.Crops && G.Crops.list) (G.Crops.list || []).forEach(function (c) { E.emit('crop:harvested', { id: c.id, n: 1, q: 'normal', by: G.Net && G.Net.playerId }); });
    if (G.Goals && G.Goals.check) G.Goals.check();
    toast('Đã mở khóa công thức, cá, sổ tay, mục tiêu.', 'star');
  };
  Dev.hideHud = function (v) {
    document.body.classList.toggle('dev-hidehud', !!v);
    if (restore) restore.style.display = v ? 'block' : 'none';
    if (badge) badge.style.display = v || !on ? 'none' : 'block';
  };
  Dev.perf = function () { if (G.PerfUI) G.PerfUI.toggle(); };

  function allItems() {
    var I = G.Items, out = [], seen = {};
    function add(d) { if (d && d.id && d.cat && !seen[d.id]) { seen[d.id] = 1; out.push(d); } }
    ['all', 'list', 'ids', 'defs'].forEach(function (k) {
      var v = I[k]; if (typeof v === 'function') { try { v = v.call(I); } catch (e) { v = null; } }
      if (Array.isArray(v)) v.forEach(function (x) { add(typeof x === 'string' ? I.get(x) : x); });
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (q) { add(v[q]); });
    });
    return out;
  }

  /* ---------------------------------------------------------------- loops */
  setInterval(function () {
    if (!on || !G.State || !G.Time) return;
    tryDo(function () {
      if (inf.money && G.State.money < 999999) G.State.addMoney(999999 - G.State.money);
      if (inf.energy && G.State.energy < G.State.maxEnergy) G.State.setEnergy(G.State.maxEnergy);
      if (frozen) { if (Math.abs(G.Time.hour - frozenHour) > 0.0005) G.Time.setHour(frozenHour); }
      else if (speed > 1) G.Time.setHour(G.Time.hour + 0.02 * (speed - 1));
    });
  }, 200);

  /* ---------------------------------------------------------------- badge + css */
  function ensureUi() {
    if (style) return;
    style = el('style', null, document.head,
      '#dev-badge{position:fixed;left:6px;top:calc(env(safe-area-inset-top,0px) + 6px);z-index:60;background:#d9534f;color:#fff;font:700 11px sans-serif;padding:2px 7px;border-radius:9px;pointer-events:none;opacity:.9}' +
      '#dev-restore{position:fixed;right:6px;bottom:calc(env(safe-area-inset-bottom,0px) + 6px);z-index:61;display:none;width:44px;height:44px;border-radius:22px;border:0;background:rgba(0,0,0,.35);color:#fff;font:700 12px sans-serif}' +
      'body.dev-hidehud #tv-hud,body.dev-hidehud [id*=joy],body.dev-hidehud [class*=joy]{display:none!important}' +
      '.dev-panel{max-height:calc(var(--uvh,1vh)*78);overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px}' +
      '.dev-panel h3{margin:14px 0 6px;font-size:16px}.dev-panel .tv-btn{min-height:52px;font-size:16px}' +
      '.dev-panel .dev-row{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.dev-panel .dev-row .tv-btn{flex:1 1 30%}' +
      '.dev-panel .on{outline:3px solid #6bbf59}.dev-panel input[type=range]{width:100%;height:40px}');
    badge = el('div', null, document.body, 'DEV'); badge.id = 'dev-badge'; badge.style.display = 'none';
    restore = el('button', null, document.body, 'HUD'); restore.id = 'dev-restore';
    restore.addEventListener('click', function () { Dev.hideHud(false); });
  }
  function apply() { ensureUi(); badge.style.display = on && !document.body.classList.contains('dev-hidehud') ? 'block' : 'none'; }

  Dev.isOn = function () { return on; };
  Dev.set = function (v) { on = !!v; store(on); if (!on) { inf.money = inf.energy = false; frozen = false; speed = 1; Dev.hideHud(false); } apply(); };
  Dev.toggle = function () { Dev.set(!on); toast(on ? 'Đã bật chế độ dev' : 'Đã tắt chế độ dev', 'gear'); return on; };

  /* ---------------------------------------------------------------- panel */
  Dev.openPanel = function () {
    if (!on || UI.panelOpen) return;
    var p = el('div', 'tv-wide dev-panel'), T = G.Time;
    el('h2', null, p, 'Công cụ dev');
    function row() { return el('div', 'dev-row', p); }
    function b(label, parent, fn, toggleKey) {
      var x = el('button', 'tv-btn alt', parent, label);
      x.addEventListener('click', function () { UI.sfx('tap'); tryDo(function () { fn(x); }); });
      return x;
    }
    function flag(label, parent, get, set) {
      var x = b(label, parent, function () { set(!get()); x.classList.toggle('on', get()); }); x.classList.toggle('on', get()); return x;
    }
    el('h3', null, p, 'Tiền và năng lượng'); var r = row();
    b('+1.000g', r, function () { Dev.addMoney(1000); }); b('+100.000g', r, function () { Dev.addMoney(100000); });
    r = row(); flag('Tiền vô hạn', r, function () { return inf.money; }, Dev.infMoney); flag('Năng lượng vô hạn', r, function () { return inf.energy; }, Dev.infEnergy);
    el('h3', null, p, 'Cấp độ'); r = row(); b('Cấp tối đa + mọi kỹ năng', r, Dev.maxLevel);
    el('h3', null, p, 'Thời gian'); var lab = el('div', null, p), sl = el('input', null, p); sl.type = 'range'; sl.min = 6; sl.max = 25.9; sl.step = 0.25; sl.value = T.hour;
    function fmt(h) { var hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return 'Giờ trong ngày: ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }
    lab.textContent = fmt(+sl.value); sl.addEventListener('input', function () { lab.textContent = fmt(+sl.value); tryDo(function () { Dev.setHour(+sl.value); }); });
    r = row(); flag('Đóng băng thời gian', r, function () { return frozen; }, Dev.freezeTime);
    [2, 5, 10].forEach(function (m) { var x = b('Nhanh x' + m, r, function () { Dev.speedTime(speed === m ? 1 : m); Array.prototype.forEach.call(r.querySelectorAll('.spd'), function (n) { n.classList.remove('on'); }); if (speed === m) x.classList.add('on'); }); x.classList.add('spd'); if (speed === m) x.classList.add('on'); });
    r = row(); b('Qua ngày mới', r, Dev.skipDay);
    el('h3', null, p, 'Mùa'); r = row();
    [['spring', 'Xuân'], ['summer', 'Hạ'], ['autumn', 'Thu'], ['winter', 'Đông']].forEach(function (s) { b(s[1], r, function () { Dev.setSeason(s[0]); }); });
    el('h3', null, p, 'Thời tiết'); r = row();
    [['sun', 'Nắng'], ['rain', 'Mưa'], ['snow', 'Tuyết']].forEach(function (s) { b(s[1], r, function () { Dev.setWeather(s[0]); }); });
    el('h3', null, p, 'Nông trại'); r = row(); b('Cây chín ngay', r, Dev.growAll);
    el('h3', null, p, 'Mở khóa'); r = row(); b('Mở khóa tất cả', r, Dev.unlockAll);
    el('h3', null, p, 'Dịch chuyển'); r = row();
    [['farm', 'Nông trại'], ['shop', 'Cửa hàng'], ['workshop', 'Xưởng'], ['fishstall', 'Quầy cá'], ['pier', 'Bến câu'], ['house', 'Nhà']].forEach(function (s) { b(s[1], r, function () { Dev.teleport(s[0]); }); });
    el('h3', null, p, 'Trình diễn'); r = row();
    b('Ẩn giao diện', r, function () { UI.closePanel(); Dev.hideHud(true); toast('Chạm nút HUD ở góc để hiện lại.', 'check'); });
    b('Bảng hiệu năng', r, Dev.perf);
    el('h3', null, p, 'Tặng đồ'); r = row();
    [1, 10, 99].forEach(function (n) { var x = b('Số lượng ' + n, r, function () { giveN = n; Array.prototype.forEach.call(r.children, function (c) { c.classList.remove('on'); }); x.classList.add('on'); }); if (n === giveN) x.classList.add('on'); });
    var cats = el('div', 'dev-row', p), list = el('div', 'dev-row', p), items = allItems(), cur = '';
    function show(cat) {
      list.innerHTML = ''; cur = cat;
      items.filter(function (d) { return d.cat === cat; }).forEach(function (d) {
        b(String(d.name || d.id), list, function () { Dev.give(d.id, giveN); });
      });
    }
    (G.Items.CATEGORIES || []).forEach(function (c) { b(String(G.VI && G.VI.cat && G.VI.cat[c] || c), cats, function () { show(c); }); });
    if (!items.length) el('div', null, list, 'Không đọc được danh sách vật phẩm.');
    var close = row(); b('Đóng', close, function () { UI.closePanel(); });
    UI.openPanel(p);
  };

  E.on('game:ready', function () { try { var P = G.Player; if (P && P.pos) spawn = { tx: G.util.tileOf(P.pos.x), tz: G.util.tileOf(P.pos.z), facing: 'down' }; } catch (e) {} });
  on = store(); apply();
})(window.Game);
