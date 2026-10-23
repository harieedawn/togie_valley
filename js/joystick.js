/* Togie Valley - joystick.js (Stage 15B, B1)
 * Game.Joystick: device-level "Kiểu điều khiển" (tap | float | fixed) + analog virtual stick feeding Game.Player.setStick.
 * Settings live in localStorage `togie-valley/controls` (outside the save). The same store also holds the camera mode (see camera_auto.js).
 * Floating: a touch in the left ~60% of the screen that moves > 10 px or is held > 180 ms spawns the base at the touch point.
 * Fixed: a base in the bottom corner. Both hand the pointer over from Game.Input via Input.claim, so tap/hold/twist/pinch stay untouched.
 * Depends on core.js, input.js, player.js. Loads after ui_scale.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Input || !G.Player || !G.Loop || !G.Events) { console.error('[joystick] missing deps'); return; }
  var E = G.Events, P = G.Player, In = G.Input;
  var KEY = 'togie-valley/controls';
  var MODES = [['tap', 'Chạm để đi'], ['float', 'Cần trôi'], ['fixed', 'Cần cố định']];
  var MODE_DESC = {
    tap: 'Chạm vào mặt đất để đi tới đó, nhấn giữ để đi theo ngón tay.',
    float: 'Chạm và kéo ở nửa trái màn hình, cần sẽ hiện ra ngay chỗ ngón tay.',
    fixed: 'Cần nằm cố định ở góc màn hình, kéo núm để di chuyển.'
  };
  var SIZES = [['s', 'Nhỏ', 96], ['m', 'Vừa', 120], ['l', 'Lớn', 148]];
  var DEAD = 0.12, SPAWN_MOVE = 10, SPAWN_HOLD = 180, FLOAT_ZONE = 0.6;

  /* ------------------------------------------------------------ store */
  var store = {};
  try { var raw = localStorage.getItem(KEY); if (raw) store = JSON.parse(raw) || {}; } catch (e) { store = {}; }
  if (typeof store !== 'object' || !store) store = {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }
  function coarse() {
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0 && 'ontouchstart' in window; } catch (e) { return false; }
  }
  function validMode(m) { return m === 'tap' || m === 'float' || m === 'fixed'; }
  var mode = validMode(store.mode) ? store.mode : (coarse() ? 'float' : 'tap');
  var size = (store.size === 's' || store.size === 'm' || store.size === 'l') ? store.size : 'm';
  var opacity = typeof store.opacity === 'number' ? Math.min(1, Math.max(0.3, store.opacity)) : 0.85;
  var hand = store.hand === 'right' ? 'right' : 'left';

  var J = G.Joystick = {};
  /** Shared device-level store (camera_auto.js uses it too). */
  J.store = function (key, val) {
    if (val === undefined) return store[key];
    store[key] = val; save(); return val;
  };
  J.mode = function () { return mode; };
  J.size = function () { return size; };
  J.opacity = function () { return opacity; };
  J.hand = function () { return hand; };
  J.active = function () { return !!act; };
  /** Current stick output (screen space, y up). */
  J.vector = function (out) { out = out || { x: 0, y: 0, mag: 0 }; out.x = vx; out.y = vy; out.mag = vm; return out; };

  /* -------------------------------------------------------------- DOM */
  var layer = document.createElement('div');
  layer.id = 'tv-joy'; layer.setAttribute('aria-hidden', 'true');
  var base = document.createElement('div'); base.className = 'tv-joy-base';
  var ring = document.createElement('div'); ring.className = 'tv-joy-ring';
  var knob = document.createElement('div'); knob.className = 'tv-joy-knob';
  ring.appendChild(knob); base.appendChild(ring); layer.appendChild(base);
  document.body.appendChild(layer);

  /* ------------------------------------------------------------ state */
  var act = null;                 // active touch: { id, cx, cy (base centre, client px), px, py (finger) }
  var pend = null;                // floating touch waiting to become a stick: { id, x0, y0, timer }
  var vx = 0, vy = 0, vm = 0;
  var R = 48, D = 120;            // travel radius and base diameter in client px
  var fixedC = { x: 0, y: 0 };    // fixed base centre (client px), refreshed on layout
  var shown = false, lastTx = -1, lastTy = -1, lastKx = 1e9, lastKy = 1e9;

  function uiScale() { return (G.UiScale && G.UiScale.scale) ? G.UiScale.scale() : 1; }
  function applyLook() {
    var d = 120, i; for (i = 0; i < SIZES.length; i++) if (SIZES[i][0] === size) d = SIZES[i][2];
    D = d; R = d * 0.5 * 0.78;
    var s = layer.style;
    s.setProperty('--jd', d + 'px'); s.setProperty('--jk', Math.round(d * 0.44) + 'px');
    s.setProperty('--jo', String(opacity)); s.setProperty('--js', String(uiScale()));
    layer.className = 'tv-joy-' + mode + ' tv-joy-h' + (hand === 'right' ? 'r' : 'l') + (shown ? ' show' : '');
    layer.id = 'tv-joy';
    In.noHold = mode !== 'tap';
    measureFixed();
  }
  function measureFixed() {
    if (mode !== 'fixed') return;
    var r = base.getBoundingClientRect();
    fixedC.x = r.left + r.width / 2; fixedC.y = r.top + r.height / 2;
  }
  function show(on) {
    if (on === shown) return;
    shown = on;
    layer.classList.toggle('show', on);
  }

  /* ------------------------------------------------------ pointer flow */
  function blocked() { return P.isLocked() || P.sitting || In.suspend || mode === 'tap'; }

  function begin(id, cx, cy, px, py) {
    act = { id: id, cx: cx, cy: cy, px: px, py: py };
    if (mode === 'float') { lastTx = -1; show(true); }
    E.emit('joystick:start', {});
  }
  function finish() {
    if (!act) return;
    act = null; vx = vy = vm = 0; lastKx = 1e9;
    P.setStick(0, 0, 0);
    knob.style.transform = 'translate3d(0,0,0)';
    if (mode === 'float') show(false);
    E.emit('joystick:end', {});
  }
  function cancelPending() { if (pend) { if (pend.timer) clearTimeout(pend.timer); pend = null; } }

  function promote(px, py) {
    if (!pend) return;
    var p = pend; cancelPending();
    if (act || blocked() || In.pointerCount() !== 1) return;
    In.claim(p.id);
    begin(p.id, p.x0, p.y0, px, py);
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (act || mode !== 'float' || blocked() || e.target !== In.canvas) return;
    if (In.pointerCount() !== 1 || e.clientX > window.innerWidth * FLOAT_ZONE) return;
    cancelPending();
    pend = { id: e.pointerId, x0: e.clientX, y0: e.clientY, timer: 0 };
    pend.timer = setTimeout(function () {
      if (pend) { pend.timer = 0; promote(pend.x0, pend.y0); }
    }, SPAWN_HOLD);
  }
  function onMove(e) {
    if (act && e.pointerId === act.id) { act.px = e.clientX; act.py = e.clientY; return; }
    if (pend && e.pointerId === pend.id) {
      var dx = e.clientX - pend.x0, dy = e.clientY - pend.y0;
      if (In.pointerCount() > 1) { cancelPending(); return; }
      if (dx * dx + dy * dy > SPAWN_MOVE * SPAWN_MOVE) promote(e.clientX, e.clientY);
    }
  }
  function onUp(e) {
    if (act && e.pointerId === act.id) { finish(); return; }
    if (pend && e.pointerId === pend.id) cancelPending();   // quick tap: Input already emitted a normal tap
  }
  function onFixedDown(e) {
    if (mode !== 'fixed' || act || blocked()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { base.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    measureFixed();
    begin(e.pointerId, fixedC.x, fixedC.y, e.clientX, e.clientY);
  }
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  base.addEventListener('pointerdown', onFixedDown);
  window.addEventListener('blur', function () { cancelPending(); finish(); });
  window.addEventListener('resize', function () { setTimeout(applyLook, 80); });
  window.addEventListener('orientationchange', function () { setTimeout(applyLook, 120); });
  E.on('ui:scaled', function () { applyLook(); });

  /* ----------------------------------------------------------- per frame */
  G.Loop.onFrame(function () {
    var vis = mode === 'fixed' && !blocked();
    if (mode === 'fixed') show(vis);
    else if (mode === 'float' && !act && shown) show(false);
    if (act && blocked()) { finish(); return; }
    if (!act) return;
    var ox = act.px - act.cx, oy = act.py - act.cy, len = Math.sqrt(ox * ox + oy * oy);
    if (mode === 'float' && len > R) {            // dragging past the rim pulls the base along (thumb never runs out of room)
      var ex = len - R, k = ex / len;
      act.cx += ox * k; act.cy += oy * k; ox = act.px - act.cx; oy = act.py - act.cy; len = R;
    }
    var n = Math.min(1, len / R), kx = ox, ky = oy;
    if (len > R) { kx = ox / len * R; ky = oy / len * R; }
    // dead zone + smooth response curve
    var m = n <= DEAD ? 0 : (n - DEAD) / (1 - DEAD);
    m = m * m * (3 - 2 * m) * 0.35 + m * 0.65;
    if (m > 0 && len > 0.001) { vx = ox / len; vy = -oy / len; vm = m; } else { vx = 0; vy = 0; vm = 0; }
    P.setStick(vx, vy, vm);
    if (mode === 'float' && (act.cx !== lastTx || act.cy !== lastTy)) {
      lastTx = act.cx; lastTy = act.cy;
      base.style.transform = 'translate3d(' + (act.cx - D / 2) + 'px,' + (act.cy - D / 2) + 'px,0)';
    }
    if (kx !== lastKx || ky !== lastKy) {
      lastKx = kx; lastKy = ky;
      knob.style.transform = 'translate3d(' + kx + 'px,' + ky + 'px,0)';
    }
  }, 110);

  /* ----------------------------------------------------------- setters */
  function changed(key, value) { E.emit('controls:changed', { key: key, value: value }); }
  J.setMode = function (m) {
    if (!validMode(m)) return;
    cancelPending(); finish();
    mode = m; store.mode = m; save();
    base.style.transform = '';
    applyLook(); changed('mode', m);
  };
  J.setSize = function (s) {
    if (s !== 's' && s !== 'm' && s !== 'l') return;
    size = s; store.size = s; save(); applyLook(); changed('size', s);
  };
  J.setOpacity = function (o) {
    opacity = Math.min(1, Math.max(0.3, +o || 0.85)); store.opacity = opacity; save(); applyLook(); changed('opacity', opacity);
  };
  J.setHand = function (h) {
    hand = h === 'right' ? 'right' : 'left'; store.hand = hand; save(); applyLook(); changed('hand', hand);
  };

  /* ---------------------------------------------------------- settings UI */
  J.renderRow = function (body, el) {
    var has = G.Icons && G.Icons.has && G.Icons.has('gear');
    el('div', 'tv-sub', body, (has ? G.Icons.ui('gear', 20) + ' ' : '') + 'Kiểu điều khiển');
    var wrap = el('div', 'tv-uis', body), desc = el('div', 'tv-ctl-desc', body);
    var extra = el('div', 'tv-ctl-extra', body);
    var bm = [];
    MODES.forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, o[1]);
      b.addEventListener('click', function () {
        J.setMode(o[0]); paint();
        if (G.UI && G.UI.toast) G.UI.toast('Kiểu điều khiển: ' + o[1], 'check');
      });
      bm.push(b);
    });
    function seg(label, opts, cur, set) {
      el('div', 'tv-sub', extra, label);
      var w = el('div', 'tv-uis', extra), bs = [];
      opts.forEach(function (o) {
        var b = el('button', 'tv-btn alt', w, o[1]);
        b.addEventListener('click', function () { set(o[0]); bs.forEach(function (x, i) { x.className = 'tv-btn' + (opts[i][0] === cur() ? '' : ' alt'); }); });
        bs.push(b);
      });
      bs.forEach(function (x, i) { x.className = 'tv-btn' + (opts[i][0] === cur() ? '' : ' alt'); });
    }
    function paint() {
      bm.forEach(function (b, i) { b.className = 'tv-btn' + (MODES[i][0] === mode ? '' : ' alt'); });
      desc.textContent = MODE_DESC[mode];
      extra.innerHTML = '';
      if (mode === 'tap') return;
      seg('Cỡ cần', SIZES, J.size, J.setSize);
      el('div', 'tv-sub', extra, 'Độ rõ của cần');
      var rng = el('input', null, extra); rng.type = 'range'; rng.min = '30'; rng.max = '100'; rng.value = String(Math.round(opacity * 100)); rng.style.width = '100%';
      rng.addEventListener('input', function () { J.setOpacity(rng.value / 100); });
      if (mode === 'fixed') seg('Vị trí cần', [['left', 'Góc trái'], ['right', 'Góc phải']], J.hand, J.setHand);
    }
    paint();
  };

  applyLook();
})();
