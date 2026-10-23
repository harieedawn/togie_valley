/* Togie Valley - input.js (Stage 1)
 * Game.Input: pointer + keyboard -> bus events. Touch and mouse are equal. Depends on core.js.
 * Events: input:tap {x,y,count} (count = streak of taps each within Config.input.rhythmMs of the previous; 1 = single) | input:holdstart/holdmove/holdend {x,y} | input:zoom {factor} (>1 = zoom out)
 *         input:rotate {delta} (rad, twist) | input:rotateStep {dir} | input:action {source}
 * Coordinates are client CSS px. Hold = finger/mouse down longer than Config.input.holdMs without a second finger.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Config) { console.error('[input] missing deps'); return; }
  var E = G.Events;
  var cfg = G.Config.input = G.Config.input || { holdMs: 180, tapSlop: 14, wheelZoom: 0.0012, rhythmMs: 350 };

  var Input = { holding: false, x: 0, y: 0, canvas: null, suspend: false, noHold: false };   // suspend: taps/holds are swallowed (fishing owns the pointer); pinch/twist still work
  var ptrs = {}, count = 0, one = null, multi = false, holdTimer = 0, last2 = null;
  var keys = {};
var tapStreak = 0, tapLast = -1e9;   // tap rhythm: taps each within cfg.rhythmMs of the previous one form a streak

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function pair() {
    var ids = Object.keys(ptrs);
    return ids.length >= 2 ? [ptrs[ids[0]], ptrs[ids[1]]] : null;
  }
  function endHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    if (Input.holding) { Input.holding = false; E.emit('input:holdend', { x: Input.x, y: Input.y }); }
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    count++;
    try { Input.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (count === 1) {
      multi = false;
      one = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
      Input.x = e.clientX; Input.y = e.clientY;
      holdTimer = setTimeout(function () {
        holdTimer = 0;
        if (count === 1 && !multi && !Input.suspend && !Input.noHold) { Input.holding = true; E.emit('input:holdstart', { x: Input.x, y: Input.y }); }
      }, cfg.holdMs);
    } else if (count === 2) {
      multi = true; one = null;
      endHold();
      var p = pair();
      last2 = { d: dist(p[0], p[1]), a: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) };
    }
  }

  function move(e) {
    var p = ptrs[e.pointerId];
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (count === 1 && one && one.id === e.pointerId) {
      Input.x = e.clientX; Input.y = e.clientY;
      if (!one.moved && Math.abs(p.x - one.x0) + Math.abs(p.y - one.y0) > cfg.tapSlop) one.moved = true;
      if (Input.holding) E.emit('input:holdmove', { x: Input.x, y: Input.y });
    } else if (count === 2 && last2) {
      var q = pair(), d = dist(q[0], q[1]), a = Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x);
      if (d > 8 && last2.d > 8) E.emit('input:zoom', { factor: last2.d / d });
      var da = G.util.wrapAngle(a - last2.a);
      if (da) E.emit('input:rotate', { delta: da });
      last2.d = d; last2.a = a;
    }
  }

  function up(e) {
    var p = ptrs[e.pointerId];
    if (!p) return;
    delete ptrs[e.pointerId];
    count = Math.max(0, count - 1);
    try { Input.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (one && one.id === e.pointerId) {
      var wasHold = Input.holding, moved = one.moved;
      var x = p.x, y = p.y;
      one = null;
      endHold();
      if (!wasHold && !moved && !multi && !Input.suspend && e.type === 'pointerup') {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        tapStreak = (now - tapLast <= (cfg.rhythmMs || 350)) ? tapStreak + 1 : 1; tapLast = now;
        E.emit('input:tap', { x: x, y: y, count: tapStreak });
      }
    }
    if (count < 2) last2 = null;
    if (count === 0) multi = false;
  }

  function wheel(e) {
    e.preventDefault();
    E.emit('input:zoom', { factor: Math.exp(e.deltaY * cfg.wheelZoom) });
  }

  function typing() {
    var a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  function keyName(e) {
    var k = e.key;
    if (!k) return '';
    return k.length === 1 ? k.toLowerCase() : k;
  }
  function keydown(e) {
    if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = keyName(e);
    if ('wasdWASD'.indexOf(k) >= 0 && k.length === 1 || k.indexOf('Arrow') === 0) { keys[k] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (k === 'q') E.emit('input:rotateStep', { dir: -1 });
    else if (k === 'e') E.emit('input:rotateStep', { dir: 1 });
    else if (k === ' ' || k === 'Enter') { e.preventDefault(); E.emit('input:action', { source: 'key' }); }
  }
  function keyup(e) { delete keys[keyName(e)]; }

  /** Keyboard move axis in screen terms: x = right(+), y = up(+); each -1..1 (not normalized). */
  Input.axis = function (out) {
    out = out || { x: 0, y: 0 };
    out.x = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
    out.y = (keys.w || keys.ArrowUp ? 1 : 0) - (keys.s || keys.ArrowDown ? 1 : 0);
    return out;
  };

  /** Number of pointers the tap/hold/twist logic is tracking right now. */
  Input.pointerCount = function () { return count; };
  /** Hand a pointer over to another owner (Game.Joystick): it stops producing tap/hold/twist and its capture is released. */
  Input.claim = function (id) {
    if (!ptrs[id]) return;
    delete ptrs[id];
    count = Math.max(0, count - 1);
    try { Input.canvas.releasePointerCapture(id); } catch (err) { /* ignore */ }
    if (one && one.id === id) one = null;
    endHold();
    if (count < 2) last2 = null;
    if (count === 0) multi = false;
  };

  /** Drop any hold in progress (used when the player gets locked). */
  Input.cancel = function () { endHold(); };

  Input.init = function (canvas) {
    Input.canvas = canvas;
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', function () { keys = {}; endHold(); });
  };

  G.Input = Input;
})();
