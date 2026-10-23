/* Togie Valley - anim_clips.js (Stage 15D D0/D1): the clip engine. Game.AnimClips.
 * Wraps Player.playAction: every name resolves through Game.AnimData (unknown -> 'interact'); the hero stops, eases to face the target (~0.12 s),
 * then a data-driven clip plays (anticipation -> strike/impact -> follow-through -> settle). Never cancelled by residual speed: only by
 * AnimClips.abort() (scene change, day end, load/reset) or, after the release point, by the player walking away (soft blend-out).
 * The impact fires exactly at the hit frame: effects (FarmFx stages), sound (event anim:impact), hit-stop (pose clock only), camera nudge.
 * One buffered next action (Interact) replays at release; a clip that starts during another's follow-through crossfades from its pose.
 * Frame priority 100.4 (pose, before CharAnim 100.5 adds locomotion/idle deltas and hat/bun springs) and 100.9 (tools, effects, events).
 * No per-frame allocations (scratch objects, preallocated arrays).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.AnimData || !G.Player || !G.Loop || !G.Render || !G.Models) { console.error('[anim_clips] missing dependencies'); return; }
  var D = G.AnimData, P = G.Player, E = G.Events, R = G.Render, AT = G.AnimTools, FXm = G.FarmFx, CA = G.CharAnim;
  var C = G.AnimClips = { chain: false }, KEYS = D.KEYS, NK = KEYS.length, NCH = D.CH.length, I = D.index, hero = P.hero, J = hero.joints;
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var YAW = { n: Math.PI, e: Math.PI / 2, s: 0, w: -Math.PI / 2 };

  var cur = null, out = D.newOut(), carry = new Float32Array(NCH), fin = new Float32Array(NCH), carryK = 0, evq = [], evn = 0, lastEnd = 0, clock = 0;
  var stopT = 0, stopS = 1, nY = 0, nV = 0, bufFn = null, hipsZ = 0, rootDirty = false, sway = 0, prevArm = 0, prevSpine = 0, prevSpV = 0, cr = { bob: 0, hipZ: 0, leg: 0 };
  var toolMesh = null, heldMesh = null, trail = AT ? AT.trail(0x5b3a29, 0.05, 0.16) : null, _v = new THREE.Vector3(), _w = new THREE.Vector3(), tip = new THREE.Vector3();
  var ft = { tx: 0, tz: 0 };

  function ss(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function wrap(a) { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; }
  function inv() { return G.Inventory && G.Inventory.selected ? G.Inventory.selected() : null; }

  C.active = function () { return cur ? cur.d.name : null; };
  C.busy = function () { return !!(cur && cur.d.lock && !cur.released); };
  C.hitDone = function () { return !cur || cur.hitDone; };
  C.has = function (n) { return D.has(n); };
  C.u = function () { return cur ? Math.max(0, cur.t) / cur.d.dur : 0; };
  /** Keep ONE next action while a locking clip plays; it replays when the clip releases the player. */
  C.buffer = function (fn) { if (!C.busy()) return false; bufFn = fn; return true; };

  function toolFor(d, opts) {
    if (!d.tool || !AT) return null;
    var s = inv(), it = G.Items, def = null, tier = s ? (s.tier || 0) : 0;
    if (d.tool === 'hoe' || d.tool === 'can') return AT.tool(d.tool, tier);
    if (d.tool === 'bread') { def = opts.item && it ? it.get(opts.item) : null; return AT.tool('food', 0, def || { id: 'bread', icon: { tpl: 'bread' } }); }
    def = s && it ? it.get(s.id) : null;
    return AT.tool(d.tool, 0, def);
  }

  function release() {
    if (!cur || cur.released) return;
    cur.released = true; P.yawLambda = 9;
    P.unlock('clip');
    var cb = cur.cb; cur.cb = null;
    if (cb) try { cb(); } catch (e) { console.error(e); }
    if (bufFn && !P.isLocked()) { var f = bufFn; bufFn = null; C.chain = true; try { f(); } catch (e2) { console.error(e2); } C.chain = false; }
    bufFn = null;
  }
  function endClip(natural) {
    if (!cur) return;
    release();
    if (!natural) { for (var i = 0; i < NCH; i++) carry[i] = fin[i]; carryK = 1; }
    if (toolMesh) toolMesh.visible = false;
    if (heldMesh) heldMesh.visible = false;
    if (hipsZ) { J.hips.position.z = 0; hipsZ = 0; }
    lastEnd = clock; cur = null;
  }
  C.abort = function () { if (cur) { release(); endClip(true); } bufFn = null; };

  var prev = P.playAction;
  P.playAction = function (name, opts, cb) {
    opts = opts || {};
    var key = name === 'eat' && opts.drink && D.has('drink') ? 'drink' : name, d = D.get(key);
    if (d.driven) { prev.call(P, name, { duration: opts.duration || 0.35 }, cb); return; }
    var replaced = !!cur;
    if (cur) { release(); for (var i = 0; i < NCH; i++) carry[i] = fin[i]; carryK = 1; if (toolMesh) toolMesh.visible = false; if (heldMesh) heldMesh.visible = false; cur = null; }
    else if (clock - lastEnd < 0.25) carryK = 0.0;
    if (d.lock) { P.stop(); P.speed = 0; }
    prev.call(P, name, { manual: true }, null);
    if (d.lock) P.lock('clip');
    var dy = Math.abs(wrap((YAW[P.facing] || 0) - hero.root.rotation.y)), lead = Math.max(0.04, Math.min(0.14, 0.04 + 0.05 * dy / 1.5708));
    if (d.lock) P.yawLambda = 26;
    P.frontTile(ft);
    cur = { d: d, t: d.lock ? -lead : 0, cb: cb || null, released: false, hitDone: false, speed: C.chain ? 1.15 : 1, exit: 0, tier: (inv() && inv().tier) || 0, tx: ft.tx, tz: ft.tz, opts: opts, pour: 0, trailOn: false, loop: 0 };
    toolMesh = toolFor(d, opts); heldMesh = null;
    if (d.name === 'harvest' && FXm && FXm.heldMesh) { var hid = FXm.lastHarvest(); if (hid) { heldMesh = FXm.heldMesh(hid); if (heldMesh.parent !== hero.attach.handR) { hero.attach.handR.add(heldMesh); heldMesh.position.set(0.17, 0.0, 0.05); } } }
    if (trail) trail.clear();
    E.emit('anim:start', { name: d.name });
  };

  /* ------------------------------------------------------------------ pose layer (frame priority 100.4) */
  G.Loop.onFrame(function (dt) {
    dt = Math.min(dt, 1 / 20); clock += dt;
    var i, k, d, u, env, b, c, pose = hero.anim.pose, step, yawx, ex;
    if (!cur) {
      if (carryK > 0.001) carryK *= Math.exp(-9 * dt); else carryK = 0;
      if (hipsZ) { J.hips.position.z = 0; hipsZ = 0; }
      if (carryK <= 0) return;
    }
    d = cur ? cur.d : null;
    if (cur) {
      if (cur.t < 0) { cur.t += dt; if (cur.t >= 0) P.yawLambda = 9; }
      else {
        var sc = stopT > 0 ? stopS : 1; stopT -= dt;
        cur.t += dt * sc * cur.speed;
      }
      u = Math.max(0, cur.t) / d.dur;
      if (cur.t > d.dur + 1.5) { endClip(true); return; }
      // soft exit: after the release the player may walk away; the clip blends out instead of popping
      if (cur.released && (P.speed > 0.35 || P.stickActive())) cur.exit = Math.min(1, cur.exit + dt / 0.16); else if (cur.released && cur.exit > 0) cur.exit = Math.max(0, cur.exit - dt / 0.3);
      if (cur.exit >= 1 || u >= 1) { endClip(true); return; }
      D.sampleU(d, u, out);
      // events crossed this frame
      if (cur.t >= 0) {
        for (i = 0; i < d.ev.length; i++) {
          ex = d.ev[i];
          if (u >= ex[0] && !(cur.fired & (1 << i))) {
            cur.fired = (cur.fired || 0) | (1 << i);
            if (evn < 8) evq[evn++] = ex[1];
            if (ex[1] === 'hit') {
              cur.hitDone = true;
              if (d.hitStop) { stopT = d.hitStop[0]; stopS = d.hitStop[1]; }
              if (d.nudge && !calm) nV = -d.nudge * 14;
            }
          }
        }
        if (!cur.released && u >= d.release) release();
      }
      var inT = d.blendIn, ot = d.blendOut, te = Math.max(0, cur.t);
      env = ss(te / inT) * (1 - ss((te - (d.dur - ot)) / ot)) * (1 - ss(cur.exit));
      if (cur.t < 0) env = 0;
    } else { for (i = 0; i < NCH; i++) out.has[i] = 0; env = 0; }

    // blend into the pose (carry = crossfade from the previous clip's last output)
    for (i = 0; i < NCH; i++) {
      b = i < NK ? pose[KEYS[i]] : 0;
      if (carryK > 0) b += (carry[i] - b) * carryK;
      c = out.has[i] ? b + (out.v[i] - b) * env : b;
      fin[i] = c;
      if (i < NK) pose[KEYS[i]] = c;
    }
    // crouch: bob + legs + hips back (feet stay planted)
    D.crouch(fin[I.crouch], cr);
    pose.bob += cr.bob; pose.legLX += cr.leg + fin[I.stag]; pose.legRX += cr.leg - fin[I.stag];
    J.hips.position.z = cr.hipZ; hipsZ = cr.hipZ;
    step = fin[I.step]; yawx = fin[I.yaw];
    if (step || yawx) {
      var yw = hero.root.rotation.y;
      hero.root.position.x += Math.sin(yw) * step; hero.root.position.z += Math.cos(yw) * step; hero.root.rotation.y += yawx;
    }
    // overlapping action: the hat and bun lag behind the spine / head
    var spV = (pose.spineRX - prevSpine) / dt; prevSpine = pose.spineRX;
    if (CA && CA.kick) { var acc = Math.max(-60, Math.min(60, spV - prevSpV)); CA.kick(-0.012 * acc * dt * 60, 0.0, -0.03 * acc * dt * 60, 0); }
    prevSpV = spV;
    if (!cur && carryK <= 0.001) carryK = 0;
  }, 100.4);

  /* ------------------------------------------------------------------ tools, effects, events (frame priority 100.9) */
  var DIRV = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  function fire(name, stage) {
    var info = { name: name, stage: stage, tx: cur ? cur.tx : 0, tz: cur ? cur.tz : 0, tier: cur ? cur.tier : 0 };
    E.emit('anim:impact', info);
    if (FXm && FXm.stage) { FXm.stage(stage === 'hit' || stage === 'pop' ? stage : '~'); if (FXm.onImpact) FXm.onImpact(name, stage, info); }
    if (!FXm || !FXm.fx) return;
    var fx = FXm.fx, tx = info.tx + 0.5, tz = info.tz + 0.5, h;
    if (name === 'plant' && stage === 'hit') {          // toss the seed: it arcs from the hand to the tile centre
      hero.attach.handR.getWorldPosition(_v);
      fx.spawn(_v.x, _v.y, _v.z, (tx - _v.x) / 0.3, 1.2, (tz - _v.z) / 0.3, 0xe8c98a, 0.035, 6, 0.3);
      fx.spawn(_v.x, _v.y, _v.z, (tx - _v.x) / 0.32, 1.4, (tz - _v.z) / 0.32, 0xc9a06a, 0.03, 6, 0.32);
    } else if (name === 'harvest' && stage === 'sparkle') {
      hero.attach.handR.getWorldPosition(_v);
      fx.burst(_v.x + 0.1, _v.y + 0.2, _v.z, 8, 0xfff1a8, 0.8, 2.2, 0.045, 5, 0.7);
    } else if (name === 'fertilize' && (stage === 'hit' || stage === 'flick')) {
      hero.attach.handR.getWorldPosition(_v);
      for (h = 0; h < 7; h++) fx.spawn(_v.x, _v.y, _v.z, (tx - _v.x) / 0.35 + (Math.random() - 0.5) * 0.8, 1.3 + Math.random(), (tz - _v.z) / 0.35 + (Math.random() - 0.5) * 0.8, 0xc9a06a, 0.03, 6, 0.4);
    } else if (name === 'eat' && (stage === 'hit' || stage === 'chew')) {
      hero.joints.head.getWorldPosition(_v); var dv = DIRV[P.facing] || DIRV.s;
      fx.burst(_v.x + dv[0] * 0.22, _v.y + 0.12, _v.z + dv[1] * 0.22, stage === 'hit' ? 5 : 3, 0xf2c680, 0.5, 1.2, 0.025, 6, 0.4);
    } else if (name === 'water' && stage === 'shake') {
      cur.shake = 1;
    }
  }

  G.Loop.onFrame(function (dt) {
    dt = Math.min(dt, 1 / 20);
    var i, d, u, tl = toolMesh, tS, armV;
    // camera thump spring
    if (nY || nV) { nV += (-220 * nY - 17 * nV) * dt; nY += nV * dt; if (Math.abs(nY) < 1e-4 && Math.abs(nV) < 1e-3) { nY = 0; nV = 0; } }
    if (R.rig) { if (!R.rig.nudge) R.rig.nudge = { y: 0 }; R.rig.nudge.y = nY; }
    if (cur) {
      d = cur.d; u = Math.max(0, cur.t) / d.dur;
      hero.root.updateMatrixWorld(true);
      if (tl) {
        tS = fin[I.tS]; tl.visible = tS > 0.02 && cur.t >= -0.02;
        if (tl.visible) {
          armV = (hero.anim.pose.armRX - prevArm) / Math.max(dt, 0.001);
          sway += (Math.max(-0.5, Math.min(0.5, -armV * 0.012)) - sway) * (1 - Math.exp(-13 * dt));
          tl.scale.setScalar(Math.max(0.01, tS));
          tl.rotation.x = (d.upright ? hero.anim.pose.armRX - hero.anim.pose.spineRX + fin[I.tilt] : 0) + sway;
        }
        prevArm = hero.anim.pose.armRX;
      }
      if (heldMesh) {
        var hs = fin[I.hold]; heldMesh.visible = hs > 0.02;
        if (heldMesh.visible) { heldMesh.scale.setScalar(Math.max(0.01, hs) * 1.7); heldMesh.rotation.x = hero.anim.pose.armRX - hero.anim.pose.spineRX; }
      }
      // hoe swoosh: ink ribbon along the blade during the strike
      if (d.name === 'till' && trail && tl && tl.visible) {
        if (u > 0.25 && u < 0.5 && !calm) { _w.set(AT.tipLocal.hoe[0], AT.tipLocal.hoe[1], AT.tipLocal.hoe[2]); tl.localToWorld(tip.copy(_w)); trail.add(tip.x, tip.y, tip.z); }
      }
      // water stream from the spout toward the target tile; last drops shaken off at the end
      if (d.name === 'water' && FXm && FXm.fx && tl && tl.visible) {
        var pouring = (u > 0.30 && u < 0.78) || (cur.shake && u < 0.92 && u >= 0.8);
        if (pouring && (cur.pour += dt) > (u < 0.78 ? 0.03 : 0.07)) {
          cur.pour = 0; _w.set(AT.tipLocal.can[0], AT.tipLocal.can[1], AT.tipLocal.can[2]); tl.localToWorld(tip.copy(_w));
          var T = 0.38, tx = cur.tx + 0.5 + (Math.random() - 0.5) * 0.3, tz = cur.tz + 0.5 + (Math.random() - 0.5) * 0.3;
          FXm.fx.spawn(tip.x, tip.y, tip.z, (tx - tip.x) / T, -(tip.y - 0.03) / T + 0.5 * 6 * T, (tz - tip.z) / T, 0x6ec6ff, 0.032, 6, T);
        }
      }
      for (i = 0; i < evn; i++) fire(d.name, evq[i]);
      evn = 0;
    }
    if (trail) trail.update(dt);
    if (AT) AT.update(dt);
  }, 100.9);

  /* ------------------------------------------------------------------ aborts (explicit only) */
  ['scene:changed', 'day:ended', 'save:loaded', 'save:reset'].forEach(function (n) { E.on(n, function () { C.abort(); }); });
})();
