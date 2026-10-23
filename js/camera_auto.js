/* Togie Valley - camera_auto.js (Stage 15B, B2)
 * Game.CameraAuto: device-level "Camera" setting: `manual` (Thủ công, old behaviour) | `auto` (Tự xoay theo hướng đi) + sensitivity low|mid|high.
 * Stored in the shared controls store (Game.Joystick.store keys `cam`, `sens`, localStorage togie-valley/controls).
 * Auto mode: after ~0.5 s of consistent movement it eases Rig.yawTarget so the camera sits behind the walking direction
 * (SmoothDamp-style critically damped follow with an angular speed cap). Dead zone 25 degrees, quick back-and-forth ignored.
 * Never rotates while standing still, locked (dialogs, panels, fishing, sleeping, cutscenes), sitting or indoors.
 * Manual twist / Q / E / rotate buttons pause it for 3 s. With the joystick the heading is the stick direction in world space,
 * latched per stick direction so a held stick cannot make the camera spin forever.
 * Depends on render.js (Rig), player.js, scenes.js, joystick.js (store). Loads after joystick.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Render.rig || !G.Player || !G.Loop || !G.Scenes || !G.Joystick || !G.Events) { console.error('[camera_auto] missing deps'); return; }
  var E = G.Events, P = G.Player, rig = G.Render.rig, U = G.util, J = G.Joystick;
  var MODES = [['manual', 'Thủ công'], ['auto', 'Tự xoay theo hướng đi']];
  var SENS = [['low', 'Nhẹ'], ['mid', 'Vừa'], ['high', 'Nhanh']];
  // need = seconds of consistent heading, smooth = SmoothDamp time (s), max = angular speed cap (rad/s)
  var TUNE = { low: { need: 0.8, smooth: 0.9, max: 0.45 }, mid: { need: 0.5, smooth: 0.65, max: 0.8 }, high: { need: 0.3, smooth: 0.45, max: 1.3 } };
  var DEAD = 25 * Math.PI / 180, STOP = 4 * Math.PI / 180, SAME = Math.cos(30 * Math.PI / 180), MIN_SPEED = 0.6, PAUSE = 3, STICK_MIN = 0.3;

  var cam = J.store('cam') === 'auto' ? 'auto' : 'manual';
  var sens = TUNE[J.store('sens')] ? J.store('sens') : 'mid';

  var CA = G.CameraAuto = {};
  CA.mode = function () { return cam; };
  CA.sensitivity = function () { return sens; };
  CA.setMode = function (m) {
    if (m !== 'manual' && m !== 'auto') return;
    cam = m; J.store('cam', m); reset();
    E.emit('controls:changed', { key: 'cam', value: m });
  };
  CA.setSensitivity = function (s) {
    if (!TUNE[s]) return;
    sens = s; J.store('sens', s);
    E.emit('controls:changed', { key: 'sens', value: s });
  };
  /** True while auto mode currently wants to / is allowed to rotate (debug + tests). */
  CA.rotating = function () { return rotating; };

  /* ------------------------------------------------------------ state */
  var pauseT = 0;                    // seconds left of the manual-input pause
  var lx = 0, lz = 0, havePos = false;
  var rx = 0, rz = 0, streak = 0;    // reference heading (unit) and seconds it has stayed consistent
  var rotating = false, av = 0, desired = 0;
  var stickAng = 0, stickLatched = false, stickWas = false;
  var _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = { x: 0, y: 0, mag: 0 };

  function reset() { streak = 0; rotating = false; av = 0; stickLatched = false; havePos = false; }
  function manualTouch() { pauseT = PAUSE; reset(); }
  E.on('input:rotate', manualTouch);
  E.on('input:rotateStep', manualTouch);
  if (G.Camera) {   // on-screen rotate buttons call Camera.rotateStep / rotateBy directly
    var rs = G.Camera.rotateStep, rb = G.Camera.rotateBy;
    G.Camera.rotateStep = function (d) { manualTouch(); return rs.call(G.Camera, d); };
    G.Camera.rotateBy = function (d) { manualTouch(); return rb.call(G.Camera, d); };
  }
  E.on('scene:changed', function () { reset(); });

  function blocked() { return !G.Scenes.outdoor || P.isLocked() || P.sitting || (G.UI && G.UI.panelOpen) || G.Input.suspend; }

  /** SmoothDamp on a relative angle: current = 0, goal = diff. Returns the step to add to yawTarget. */
  function damp(diff, smooth, maxSpeed, dt) {
    var om = 2 / smooth, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    var maxChange = maxSpeed * smooth, change = -diff;
    change = change > maxChange ? maxChange : change < -maxChange ? -maxChange : change;
    var goal = -change, tmp = (av + om * change) * dt;
    av = (av - om * tmp) * e;
    var out = goal + (change + tmp) * e;
    if ((diff > 0) === (out > diff)) { out = diff; av = 0; }   // never overshoot the goal
    return out;
  }
  function yawOf(hx, hz) { return Math.atan2(-hx, -hz); }   // camera yaw whose forward vector equals (hx, hz)

  G.Loop.onUpdate(function (dt) {
    var px = P.pos.x, pz = P.pos.z;
    if (cam !== 'auto') { havePos = false; return; }
    if (pauseT > 0) { pauseT -= dt; lx = px; lz = pz; havePos = true; return; }
    if (blocked()) { reset(); lx = px; lz = pz; havePos = true; return; }
    var T = TUNE[sens], ok = false, hx = 0, hz = 0;

    if (P.stickActive()) {
      J.vector(_v);
      if (_v.mag >= STICK_MIN) {
        var sa = Math.atan2(_v.x, _v.y);   // stick angle in screen terms (0 = up, + = right)
        if (!stickLatched || Math.abs(U.wrapAngle(sa - stickAng)) > DEAD) {   // new stick direction: latch its world heading once
          rig.getForward(_f); rig.getRight(_r);
          hx = _r.x * _v.x + _f.x * _v.y; hz = _r.z * _v.x + _f.z * _v.y;
          var hl = Math.sqrt(hx * hx + hz * hz) || 1;
          rx = hx / hl; rz = hz / hl; stickAng = sa; stickLatched = true; streak = 0; rotating = false; av = 0;
        }
        streak += dt; ok = true; stickWas = true;
      }
    } else {
      stickLatched = false; stickWas = false;
      var vx = (px - lx) / dt, vz = (pz - lz) / dt, sp = Math.sqrt(vx * vx + vz * vz);
      if (havePos && sp >= MIN_SPEED) {
        hx = vx / sp; hz = vz / sp;
        if (streak > 0 && hx * rx + hz * rz >= SAME) {
          streak += dt;
          rx += (hx - rx) * 0.05; rz += (hz - rz) * 0.05;
          var rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
        } else { rx = hx; rz = hz; streak = dt; rotating = false; }   // turned or just started: begin a new streak
        ok = true;
      }
    }
    lx = px; lz = pz; havePos = true;

    if (!ok) {   // standing still / stick idle: stop rotating gently (velocity decays, no snap)
      streak = 0; rotating = false;
      if (av) { rig.yawTarget += av * dt; av *= Math.exp(-8 * dt); if (Math.abs(av) < 1e-3) av = 0; }
      return;
    }
    if (streak < T.need) return;

    var diff = U.wrapAngle(yawOf(rx, rz) - rig.yawTarget);
    if (!rotating) { if (Math.abs(diff) > DEAD) rotating = true; else return; }
    else if (Math.abs(diff) < STOP) { rotating = false; av = 0; return; }
    rig.yawTarget += damp(diff, T.smooth, T.max, dt);
  });

  /* ---------------------------------------------------------- settings UI */
  CA.renderRow = function (body, el) {
    var has = G.Icons && G.Icons.has && G.Icons.has('gear');
    el('div', 'tv-sub', body, (has ? G.Icons.ui('gear', 20) + ' ' : '') + 'Camera');
    var wrap = el('div', 'tv-uis', body), desc = el('div', 'tv-ctl-desc', body), extra = el('div', 'tv-ctl-extra', body), bm = [];
    function paint() {
      bm.forEach(function (b, i) { b.className = 'tv-btn' + (MODES[i][0] === cam ? '' : ' alt'); });
      desc.textContent = cam === 'auto' ? 'Camera tự xoay ra sau lưng khi bạn đi một hướng đủ lâu. Xoay tay sẽ tạm dừng chế độ này vài giây.' : 'Bạn tự xoay camera bằng hai ngón tay, nút xoay hoặc phím Q/E.';
      extra.innerHTML = '';
      if (cam !== 'auto') return;
      el('div', 'tv-sub', extra, 'Độ nhạy khi tự xoay');
      var w = el('div', 'tv-uis', extra), bs = [];
      SENS.forEach(function (o) {
        var b = el('button', 'tv-btn alt', w, o[1]);
        b.addEventListener('click', function () { CA.setSensitivity(o[0]); bs.forEach(function (x, i) { x.className = 'tv-btn' + (SENS[i][0] === sens ? '' : ' alt'); }); });
        bs.push(b);
      });
      bs.forEach(function (x, i) { x.className = 'tv-btn' + (SENS[i][0] === sens ? '' : ' alt'); });
    }
    MODES.forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, o[1]);
      b.addEventListener('click', function () {
        CA.setMode(o[0]); paint();
        if (G.UI && G.UI.toast) G.UI.toast('Camera: ' + o[1], 'check');
      });
      bm.push(b);
    });
    paint();
  };
})();
