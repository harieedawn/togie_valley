/* Togie Valley - player.js (Stage 1)
 * Game.Player: hero, tap A* walking, hold steering, keyboard, wall sliding, stuck handling, sit, action stub.
 * Game.Camera: rotate/zoom reactions to input events + follow state (save-ready getState/setState).
 * Depends on core.js, render.js, models.js, input.js, scenes.js (world.js through Scenes.isWalkableTile).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.Input || !G.Scenes || !G.Loop) { console.error('[player] missing deps'); return; }
  var E = G.Events, U = G.util, Scenes = G.Scenes, rig = G.Render.rig;

  var WALK = 2.0, RUN = 3.6, SPRINT = 5.2, TAP_RESET = 0.6, ACCEL = 10, RADIUS = 0.26, STUCK_T = 0.6;
  var DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  var YAW = { n: Math.PI, e: Math.PI / 2, s: 0, w: -Math.PI / 2 };

  var hero = G.Models.character({ hat: 'straw', hairStyle: 'bun' });
  G.Render.scene.add(hero.root);
  if (G.Render.fade) G.Render.fade.target = hero.root;   // see-through fade follows the hero (head height Render.fade.headY)

  var P = {
    root: hero.root, hero: hero, scene: 'outdoor',
    pos: { x: 0, z: 0 },
    facing: 's',
    speed: 0,
    sitting: false,
    moveMode: null           // tap-rhythm mode of the current path: 'walk' | 'run' | 'sprint' | null (distance-based)
  };
  var tapMode = 0, tapIdle = 0;   // 1 walk, 2 run, 3 sprint; tapIdle = seconds since the last tap
  var prev = { x: 0, z: 0 }, yaw = 0, yawGoal = 0, locks = {}, lockCount = 0;
  var path = null, pi = 0, onArrive = null, onFail = null;
  var holdPt = null, kbOn = false;
  var stuckT = 0, stuckX = 0, stuckZ = 0;
  var action = null, axis = { x: 0, y: 0 };
  var _f = new THREE.Vector3(), _r = new THREE.Vector3();
  // Virtual joystick (Stage 15B): analog input, screen space (x right, y up), mag 0..1 after dead zone
  var stick = { x: 0, y: 0, mag: 0, on: false };
  var sdx = 0, sdz = 0, sOn = false;   // smoothed world-space stick direction + "stick drove movement last tick"
  var STICK_ACCEL = 8, STICK_TURN = 12;

  function walkable(tx, tz) { return Scenes.isWalkableTile(tx, tz); }
  function dirName(vx, vz) { return Math.abs(vx) > Math.abs(vz) ? (vx > 0 ? 'e' : 'w') : (vz > 0 ? 's' : 'n'); }

  /* ------------------------------------------------------------------ A* */
  var MAXN = 4096;
  function astar(sx, sz, gx, gz) {
    if (!walkable(gx, gz)) return null;
    if (sx === gx && sz === gz) return [];
    var W = 4096, key = function (x, z) { return z * W + x; };   // stride > any scene tile index (interiors sit at 100+)
    var open = [], g = {}, f = {}, from = {}, closed = {}, n = 0, k0 = key(sx, sz);
    g[k0] = 0; f[k0] = h(sx, sz); open.push([sx, sz, k0]);
    function h(x, z) { var dx = Math.abs(x - gx), dz = Math.abs(z - gz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); }
    var N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (open.length && n++ < MAXN) {
      var bi = 0, i;
      for (i = 1; i < open.length; i++) if (f[open[i][2]] < f[open[bi][2]]) bi = i;
      var cur = open.splice(bi, 1)[0], cx = cur[0], cz = cur[1], ck = cur[2];
      if (cx === gx && cz === gz) {
        var out = [], k = ck;
        while (k !== k0) { out.push({ tx: k % W, tz: Math.floor(k / W) }); k = from[k]; }
        return out.reverse();
      }
      closed[ck] = true;
      for (i = 0; i < 8; i++) {
        var dx = N[i][0], dz = N[i][1], nx = cx + dx, nz = cz + dz, nk = key(nx, nz);
        if (closed[nk] || !walkable(nx, nz)) continue;
        if (dx && dz && (!walkable(cx + dx, cz) || !walkable(cx, cz + dz))) continue;   // no corner cutting
        var ng = g[ck] + (dx && dz ? 1.4142 : 1);
        if (g[nk] === undefined || ng < g[nk]) {
          g[nk] = ng; f[nk] = ng + h(nx, nz); from[nk] = ck;
          if (g[nk] === ng && !inOpen(open, nk)) open.push([nx, nz, nk]);
        }
      }
    }
    return null;
  }
  function inOpen(open, k) { for (var i = 0; i < open.length; i++) if (open[i][2] === k) return true; return false; }

  /* ------------------------------------------------------------ collision */
  function canStand(x, z) {
    var r = RADIUS, T = U.tileOf;
    return walkable(T(x - r), T(z - r)) && walkable(T(x + r), T(z - r)) && walkable(T(x - r), T(z + r)) && walkable(T(x + r), T(z + r));
  }
  /** Center of the nearest walkable tile (ring search) for unsticking / spawn fixing. */
  function nearestFree(x, z) {
    var cx = U.tileOf(x), cz = U.tileOf(z), r, i, j, best = null, bd = 1e9;
    for (r = 0; r <= 8 && !best; r++) {
      for (j = -r; j <= r; j++) for (i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r || !walkable(cx + i, cz + j)) continue;
        var d = (cx + i + 0.5 - x) * (cx + i + 0.5 - x) + (cz + j + 0.5 - z) * (cz + j + 0.5 - z);
        if (d < bd) { bd = d; best = { x: cx + i + 0.5, z: cz + j + 0.5 }; }
      }
    }
    return best;
  }
  function moveBy(dx, dz) {
    var p = P.pos, x = p.x + dx, z = p.z + dz;
    if (canStand(x, z)) { p.x = x; p.z = z; return; }
    if (canStand(x, p.z)) p.x = x;           // wall sliding
    else if (canStand(p.x, z)) p.z = z;
  }

  /* ------------------------------------------------------------- locking */
  P.lock = function (reason) {
    reason = reason || 'lock';
    if (!locks[reason]) { locks[reason] = 1; lockCount++; }
    P.stop();
    G.Input.cancel();
    stick.on = false; stick.mag = 0; sOn = false;
  };
  P.unlock = function (reason) {
    reason = reason || 'lock';
    if (locks[reason]) { delete locks[reason]; lockCount--; }
  };
  P.isLocked = function () { return lockCount > 0; };

  /* ------------------------------------------------------------- commands */
  function clearPath() { path = null; pi = 0; onArrive = null; onFail = null; stuckT = 0; }

  /** Cancel walking (path, hold). Pending walk callbacks are dropped silently. */
  P.stop = function () { clearPath(); holdPt = null; };

  /** Walk to a tile (A*, 8-dir). onArrive() on arrival, onFail(reason) when unreachable or stuck. */
  P.walkTo = function (tx, tz, arrive, fail) {
    if (P.isLocked()) { if (fail) fail('locked'); return false; }
    if (P.sitting) P.standUp();
    clearPath(); holdPt = null;
    var p = astar(U.tileOf(P.pos.x), U.tileOf(P.pos.z), tx, tz);
    if (!p) { if (fail) fail('unreachable'); return false; }
    if (!p.length) {   // already on the tile: settle to its center, then arrive
      path = [{ tx: tx, tz: tz }]; pi = 0;
    } else { path = p; pi = 0; }
    onArrive = arrive || null; onFail = fail || null;
    return true;
  };

  /** Analog stick (Game.Joystick feeds this): x right(+), y up(+) in screen terms, mag 0..1 (dead zone already removed). mag 0 = released. */
  P.setStick = function (x, y, mag) {
    stick.x = x; stick.y = y; stick.mag = mag > 0 ? mag : 0;
    stick.on = stick.mag > 0;
  };
  P.stickActive = function () { return stick.on; };

  /** Face a direction: 'n'|'e'|'s'|'w' or a vector {x,z}. */
  P.face = function (dir) {
    var n;
    if (typeof dir === 'string') n = DIRS[dir] ? dir : 's';
    else if (dir) n = dirName(dir.x || 0, dir.z || 0);
    else return;
    P.facing = n;
    yawGoal = YAW[n];
  };

  /** Teleport (used by Scenes): spawn = {tx,tz,facing} or {x,z,yaw}. */
  P.placeAt = function (s) {
    var x = s.x !== undefined ? s.x : (s.tx !== undefined ? s.tx + 0.5 : P.pos.x);
    var z = s.z !== undefined ? s.z : (s.tz !== undefined ? s.tz + 0.5 : P.pos.z);
    P.stop(); P.sitting = false;
    if (!canStand(x, z)) { var f = nearestFree(x, z); if (f) { x = f.x; z = f.z; } }   // never spawn inside furniture/walls
    P.pos.x = prev.x = x; P.pos.z = prev.z = z; P.speed = 0;
    if (s.facing) { P.face(s.facing); yaw = yawGoal; }
    else if (s.yaw !== undefined) { yaw = yawGoal = s.yaw; P.facing = dirName(Math.sin(s.yaw), Math.cos(s.yaw)); }
    hero.root.position.set(x, 0, z);
    hero.root.rotation.y = yaw;
  };

  /** Action animation stub (Stage 7 replaces the visuals): calls cb after opts.duration (default 0.35 s). */
  P.playAction = function (name, opts, cb) {
    action = { name: name, t: opts && opts.manual ? 1e9 : ((opts && opts.duration) || 0.35), cb: cb || null };   // manual: the clip system owns the timing
    E.emit('player:action', { name: name });
  };

  P.yawLambda = 9;   // facing ease rate (AnimClips raises it briefly to turn the hero toward the target before a clip)

  P.sitAt = function (tx, tz) {
    P.stop();
    P.pos.x = prev.x = tx + 0.5; P.pos.z = prev.z = tz + 0.5;
    P.sitting = true;
    E.emit('player:sat', { tx: tx, tz: tz });
  };
  P.standUp = function () {
    if (!P.sitting) return;
    P.sitting = false;
    E.emit('player:stood', {});
  };

  P.tile = function (out) { out = out || {}; out.tx = U.tileOf(P.pos.x); out.tz = U.tileOf(P.pos.z); return out; };

  /** Tile in front of the player. */
  P.frontTile = function (out) {
    var d = DIRS[P.facing]; out = out || {};
    out.tx = U.tileOf(P.pos.x) + d[0]; out.tz = U.tileOf(P.pos.z) + d[1];
    return out;
  };

  /* ---------------------------------------------------------------- input */
  function holdGround() {
    var g = G.Render.screenToGround(G.Input.x, G.Input.y, 0);
    if (g) holdPt = { x: g.x, z: g.z };
  }
  E.on('input:holdstart', function () {
    if (P.isLocked()) return;
    if (P.sitting) P.standUp();
    clearPath(); holdGround();
  });
  // Tap rhythm: 1 tap = walk, 2 quick taps = run, 3+ quick taps = sprint (Input supplies the streak count).
  E.on('input:tap', function (e) {
    if (P.isLocked()) return;
    tapMode = Math.min(3, Math.max(1, e.count || 1)); tapIdle = 0;
    P.moveMode = tapMode === 3 ? 'sprint' : tapMode === 2 ? 'run' : 'walk';
  });
  E.on('input:holdmove', function () { if (holdPt) holdGround(); });
  E.on('input:holdend', function () { holdPt = null; });

  /* ---------------------------------------------------------- simulation */
  function finishPath(ok, reason) {
    var a = onArrive, f = onFail;
    clearPath(); tapMode = 0; P.moveMode = null;   // arrival ends the rhythm mode
    if (ok) { if (a) a(); } else if (f) f(reason || 'stuck');
  }

  G.Loop.onUpdate(function (dt) {
    var p = P.pos, i, dx = 0, dz = 0, want = 0;
    prev.x = p.x; prev.z = p.z;

    tapIdle += dt;
    if (action) { action.t -= dt; if (action.t <= 0) { var cb = action.cb; action = null; if (cb) cb(); } }
    if (!path && tapMode && (tapIdle > TAP_RESET || holdPt)) { tapMode = 0; P.moveMode = null; }   // no path and no recent tap
    if (P.isLocked() || P.sitting) { P.speed = 0; return; }
    if (!canStand(p.x, p.z)) {                   // embedded in a blocked tile (old save, scene change): pop out
      var fr = nearestFree(p.x, p.z);
      if (fr) { p.x = prev.x = fr.x; p.z = prev.z = fr.z; clearPath(); }
    }

    // keyboard
    G.Input.axis(axis);
    if (axis.x || axis.y) {
      if (!kbOn) { kbOn = true; clearPath(); holdPt = null; }
      rig.getForward(_f); rig.getRight(_r);
      dx = _r.x * axis.x + _f.x * axis.y; dz = _r.z * axis.x + _f.z * axis.y;
      var l = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= l; dz /= l; want = RUN; tapMode = 0; P.moveMode = null;
    } else kbOn = false;

    if (!want && stick.on) {                     // analog stick: camera-relative, no A* path while held
      if (!sOn) { sOn = true; sdx = 0; sdz = 0; }
      clearPath(); holdPt = null; tapMode = 0; P.moveMode = null;
      rig.getForward(_f); rig.getRight(_r);
      var tx = _r.x * stick.x + _f.x * stick.y, tz = _r.z * stick.x + _f.z * stick.y;
      var tl = Math.sqrt(tx * tx + tz * tz) || 1;
      tx /= tl; tz /= tl;
      var kt = 1 - Math.exp(-STICK_TURN * dt);
      sdx += (tx - sdx) * kt; sdz += (tz - sdz) * kt;   // smooth the heading so quick flicks do not snap
      var sl = Math.sqrt(sdx * sdx + sdz * sdz);
      if (sl > 0.001) { dx = sdx / sl; dz = sdz / sl; } else { dx = tx; dz = tz; }
      var m = stick.mag;
      // magnitude -> existing speeds: creep -> walk (0..0.55), walk -> run (0.55..0.88), run -> sprint (0.88..1)
      want = m < 0.55 ? U.lerp(0.5, WALK, m / 0.55) : m < 0.88 ? U.lerp(WALK, RUN, (m - 0.55) / 0.33) : U.lerp(RUN, SPRINT, U.smoothstep(0.88, 1.0, m));
    } else if (sOn) {                            // released: keep the last heading while the speed eases out
      if (P.speed > 0.05) { var rl = Math.sqrt(sdx * sdx + sdz * sdz) || 1; dx = sdx / rl; dz = sdz / rl; } else { sOn = false; }
    }

    if (!want && !sOn && holdPt) {                       // continuous walk toward the finger
      var hx = holdPt.x - p.x, hz = holdPt.z - p.z, hd = Math.sqrt(hx * hx + hz * hz);
      if (hd > 0.18) {
        dx = hx / hd; dz = hz / hd;
        want = U.lerp(WALK, RUN, U.smoothstep(1.6, 4.0, hd));
        if (hd < 0.6) want *= hd / 0.6 + 0.2;
      }
    } else if (!want && !sOn && path) {          // tap path following
      var w = path[pi], wx = w.tx + 0.5 - p.x, wz = w.tz + 0.5 - p.z, wd = Math.sqrt(wx * wx + wz * wz);
      if (wd < 0.08) {
        pi++;
        if (pi >= path.length) { finishPath(true); }
      } else {
        dx = wx / wd; dz = wz / wd;
        var rem = wd; for (i = pi + 1; i < path.length; i++) rem += 1;
        want = tapMode === 3 ? SPRINT : tapMode === 2 ? RUN : tapMode === 1 ? WALK : U.lerp(WALK, RUN, U.smoothstep(3, 7, rem));
      }
    }

    if (want > 0 && P.speedMul) want *= P.speedMul;   // food buff (Stage 12)
    P.speed += (want - P.speed) * (1 - Math.exp(-(sOn ? STICK_ACCEL : ACCEL) * dt));
    if (want === 0 && P.speed < 0.05) P.speed = 0;

    if (P.speed > 0 && (dx || dz)) {
      var step = P.speed * dt;
      if (path && !holdPt && !kbOn && !sOn) {    // do not overshoot the waypoint
        var tw = path[pi]; if (tw) { var ex = tw.tx + 0.5 - p.x, ez = tw.tz + 0.5 - p.z, ed = Math.sqrt(ex * ex + ez * ez); if (step > ed) step = ed; }
      }
      moveBy(dx * step, dz * step);
      yawGoal = Math.atan2(dx, dz);
      P.facing = dirName(dx, dz);

      // stuck handling: wanted to move but barely got anywhere
      stuckT += dt;
      if (stuckT >= STUCK_T) {
        var mx = p.x - stuckX, mz = p.z - stuckZ;
        if (want > 1 && mx * mx + mz * mz < 0.1 * 0.1) {
          if (path) finishPath(false, 'stuck');
          P.speed = 0;
        }
        stuckT = 0; stuckX = p.x; stuckZ = p.z;
      }
    } else { stuckT = 0; stuckX = p.x; stuckZ = p.z; }
  });

  /* -------------------------------------------------------------- render */
  var sitT = 0;
  G.Loop.onFrame(function (dt, alpha) {
    var x = U.lerp(prev.x, P.pos.x, alpha), z = U.lerp(prev.z, P.pos.z, alpha);
    yaw = U.lerpAngle(yaw, yawGoal, 1 - Math.exp(-P.yawLambda * dt));
    hero.root.position.set(x, 0, z);
    hero.root.rotation.y = yaw;
    if (P.sitting) {
      sitT += dt;
      var Anim = G.Models.Anim, pose = hero.anim.pose;
      Anim.idle(pose, sitT);
      pose.legLX = 1.45; pose.legRX = 1.45; pose.bob = -0.2; pose.armLX = 0.35; pose.armRX = 0.35;
      Anim.apply(hero, pose);
    } else hero.update(dt, P.speed);
  }, 100);

  /* -------------------------------------------------------------- camera */
  var Cam = G.Camera = {};
  Cam.rotateStep = function (dir) { rig.rotateStep(dir || 1); };
  Cam.rotateBy = function (d) { rig.rotateBy(d); };
  Cam.zoomBy = function (factor) { rig.setZoom(rig.zoomTarget * factor); };
  Cam.setZoom = function (z, snap) { rig.setZoom(z, snap); };
  Cam.getState = function () { return { yawStep: Math.round(rig.getYawTarget() / (Math.PI / 2)), yaw: rig.getYawTarget(), zoom: rig.zoomTarget }; };
  Cam.setState = function (s) {
    if (!s) return;
    if (s.yaw !== undefined) rig.setYaw(s.yaw, true); else if (s.yawStep !== undefined) rig.setYaw(s.yawStep * Math.PI / 2, true);
    if (s.zoom !== undefined) rig.setZoom(s.zoom, true);
  };
  E.on('input:rotateStep', function (e) { Cam.rotateStep(e.dir); });
  E.on('input:rotate', function (e) { Cam.rotateBy(e.delta); });
  E.on('input:zoom', function (e) { Cam.zoomBy(e.factor); });

  G.Player = P;
})();
