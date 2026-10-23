/* Togie Valley - npc_react.js (Stage 15D D4): NPC reactions layered ADDITIVELY on Town NPCs (after Town.updateNpcs at 10 and CharAnim npcFrame at 11).
 * - head look-at toward the player within ~4 tiles (hysteresis 4.8), smoothed with a turn-speed limit, body follows 25 %, never when the player is behind
 * - wave (clip npc_wave) the first time the player comes near; re-armed when the player leaves (> 8 tiles)
 * - varied idle gestures (npc_shift / npc_glance / npc_scratch) on a per-NPC phase offset so NPCs never sync
 * - talk: while UI.dialog is open the nearest NPC faces the player; each dialogue blip ('dialog:char') kicks a head-bob spring and starts the
 *   next talk clip (npc_talk_a / npc_talk_b) when idle, so hand gestures follow the typewriter
 * - cost: ~one pass over 2 NPCs; NPCs farther than 10 tiles recompute at 5 Hz (the cached deltas are still added every frame, because
 *   Town.updateNpcs rewrites the base pose each frame). No allocation per frame.
 * Quality: tier 0-1 everything, tier 2 no idle gestures (look-at 20 Hz), tier 3 talk bob only. Clips live in anim_data.js (npc_*). */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Loop || !G.Events || !G.AnimData || !G.Town || !G.Player) { console.error('[npc_react] missing deps'); return; }
  var E = G.Events, AD = G.AnimData, P = G.Player, KEYS = AD.KEYS, NK = KEYS.length, IX = AD.index;
  var OUT = AD.newOut(), TAU = Math.PI * 2;
  var NEAR2 = 16, KEEP2 = 23, FAR2 = 100, BYE2 = 64, TALK2 = 64;
  var list = [], ready = false, now = 0, talkR = null, lastBlip = 0, talkFlip = 0;
  var GEST = ['npc_shift', 'npc_scratch', 'npc_glance', 'npc_shift'];
  var I = { bob: IX.bob, hipsRZ: IX.hipsRZ, sRX: IX.spineRX, sRY: IX.spineRY, sRZ: IX.spineRZ, hRX: IX.headRX, hRY: IX.headRY, hRZ: IX.headRZ,
    aLX: IX.armLX, aLZ: IX.armLZ, aRX: IX.armRX, aRZ: IX.armRZ };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function quality() { return G.Quality ? G.Quality.level() : 0; }

  function make(entry) {
    var r = { e: entry, root: entry.h.root, J: entry.h.joints, v: new Float32Array(NK), cn: null, def: null, ct: 0, acc: 0, d2: 1e9,
      lookOn: false, ly: 0, lx: 0, ls: 0, lw: 0, greeted: false, gt: rnd(3, 9), last: '', talking: false, hb: 0, hv: 0, hbT: 0 };
    r.shY = r.J.shoulderL.position.y;
    return r;
  }
  function play(r, name) {
    if (r.cn || !AD.has(name)) return false;
    r.cn = name; r.def = AD.get(name); r.ct = 0; return true;
  }

  function step(r, dt, dx, dz, q) {
    var v = r.v, i, d2 = r.d2, yaw, tgt, tgtS, tgtX, lim, k, dd;
    for (i = 0; i < NK; i++) v[i] = 0;
    dt = Math.min(dt, 0.25);

    // ---- look-at target (head leads, spine lags; behind the NPC -> neutral)
    if (q < 3) {
      r.lookOn = r.talking ? d2 < TALK2 : d2 < (r.lookOn ? KEEP2 : NEAR2);
      tgt = 0; tgtS = 0; tgtX = 0;
      if (r.lookOn) {
        yaw = wrap(Math.atan2(dx, dz) - r.root.rotation.y);
        if (Math.abs(yaw) < 2.0) {
          tgt = clamp(yaw * 0.75, -0.95, 0.95); tgtS = clamp(yaw * 0.25, -0.3, 0.3);
          tgtX = 0.34 / Math.max(1.2, Math.sqrt(d2));
        }
      }
      k = 1 - Math.exp(-6 * dt); dd = (tgt - r.ly) * k; lim = 2.8 * dt;
      r.ly += clamp(dd, -lim, lim);                                   // turn-speed limit: no snapping when the player circles around
      r.ls += (tgtS - r.ls) * (1 - Math.exp(-3.5 * dt));
      r.lx += (tgtX - r.lx) * (1 - Math.exp(-5 * dt));
      v[I.hRY] += r.ly; v[I.sRY] += r.ls; v[I.hRX] += r.lx;
    }

    // ---- greeting wave the first time the player comes near
    if (q < 3) {
      if (!r.greeted && d2 < NEAR2 && !r.talking && G.Scenes.current === 'outdoor' && !r.cn) {
        r.greeted = true;
        if (play(r, 'npc_wave')) { r.e.w = -1; r.e.next = Math.max(r.e.next || 0, 7); }   // Town's own random wave must not stack
      } else if (r.greeted && d2 > BYE2) r.greeted = false;
    }

    // ---- idle gestures on a per-NPC timer
    if (q < 2 && !r.cn && !r.talking) {
      r.gt -= dt;
      if (r.gt <= 0) {
        r.gt = rnd(5, 11);
        var theirs = r.e.fx && r.e.fx.sp !== null && r.e.fx.sp !== undefined, g = GEST[(Math.random() * GEST.length) | 0];
        if (!theirs && !(g === 'npc_glance' && r.lookOn) && g !== r.last && play(r, g)) r.last = g;
      }
    }

    // ---- talk gestures follow the dialogue blips
    if (r.talking && !r.cn && now - lastBlip < 0.18 && q < 3) { talkFlip ^= 1; play(r, talkFlip ? 'npc_talk_a' : 'npc_talk_b'); }

    // ---- clip layer
    if (r.cn) {
      r.ct += dt;
      if (r.ct >= r.def.dur) { r.cn = null; r.def = null; }
      else {
        AD.sampleU(r.def, r.ct / r.def.dur, OUT);
        for (i = 0; i < NK; i++) if (OUT.has[i]) v[i] += OUT.v[i];
      }
    }

    // ---- head-bob spring on dialogue blips
    if (r.hbT || r.hv || r.hb) {
      var h = Math.min(dt, 0.04);
      r.hv += (-190 * r.hb - 12 * r.hv) * h; r.hb += r.hv * h;
      if (Math.abs(r.hb) < 0.0005 && Math.abs(r.hv) < 0.002) { r.hb = 0; r.hv = 0; }
      v[I.hRX] += r.hb * 0.4; v[I.bob] += r.hb * 0.012;
    }
  }

  function apply(r) {
    var v = r.v, J = r.J;
    J.hips.position.y += v[I.bob];
    J.hips.rotation.z += v[I.hipsRZ];
    J.spine.rotation.x += v[I.sRX]; J.spine.rotation.y += v[I.sRY]; J.spine.rotation.z += v[I.sRZ];
    J.head.rotation.x += v[I.hRX]; J.head.rotation.y += v[I.hRY]; J.head.rotation.z += v[I.hRZ];
    J.shoulderL.rotation.x -= v[I.aLX]; J.shoulderL.rotation.z += v[I.aLZ];
    J.shoulderR.rotation.x -= v[I.aRX]; J.shoulderR.rotation.z -= v[I.aRZ];
  }

  function frame(dt) {
    var i, r, q, dx, dz, st;
    if (!ready) {
      var N = G.Town.npcs;
      if (!N || !N.shopkeeper || !N.shopkeeper.h) return;
      for (i in N) if (N[i] && N[i].h) list.push(make(N[i]));
      ready = true;
    }
    now += dt;
    if (G.Scenes.current !== 'outdoor') return;
    q = quality();
    for (i = 0; i < list.length; i++) {
      r = list[i];
      dx = P.pos.x - r.root.position.x; dz = P.pos.z - r.root.position.z; r.d2 = dx * dx + dz * dz;
      r.acc += dt;
      st = r.d2 > FAR2 ? 0.2 : (q === 2 ? 0.05 : 0);
      if (r.acc >= st) { step(r, r.acc, dx, dz, q); r.acc = 0; }
      apply(r);
    }
  }
  G.Loop.onFrame(frame, 11.5);

  /* ---- dialogue hooks: ui.js emits dialog:open / dialog:close, and dialog:char for every typed character (audio blips use the same event) */
  E.on('dialog:open', function () {
    var i, best = null, bd = TALK2, r, dx, dz, d;
    talkR = null;
    for (i = 0; i < list.length; i++) {
      r = list[i]; dx = P.pos.x - r.root.position.x; dz = P.pos.z - r.root.position.z; d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = r; }
    }
    if (best) { best.talking = true; best.greeted = true; talkR = best; }
  });
  E.on('dialog:close', function () { if (talkR) { talkR.talking = false; talkR = null; } });
  E.on('dialog:char', function (p) {
    var c;
    if (!talkR || !p || now - lastBlip < 0.07) return;
    c = p.text ? p.text.charAt(p.pos - 1) : '';
    if (c === ' ' || c === '' || c === '.' || c === ',' || c === '!' || c === '?' || c === '…') return;   // same silence rule as the audio blips
    lastBlip = now; talkR.hv += 1.7; talkR.hbT = 1;
  });
  E.on('scene:changed', function () { var i; for (i = 0; i < list.length; i++) { list[i].cn = null; list[i].def = null; list[i].talking = false; } talkR = null; });

  G.NpcReact = { list: function () { return list; }, play: function (idx, name) { return list[idx] ? play(list[idx], name) : false; } };
})();
