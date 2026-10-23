/* Togie Valley - anim_data.js (Stage 15D D1): pure animation data + sampler (no THREE, no DOM, node-readable).
 * Game.AnimData: the clip registry (every Player.playAction name resolves here, unknown names fall back to 'interact'),
 * easing curves and the keyframe sampler used by js/anim_clips.js and tools/anim_sample.js.
 *
 * A clip is time-normalised (u = 0..1 of `dur` seconds) with named phases (anticipation -> strike/impact -> follow-through -> settle),
 * keyframes per channel [u, value, ease] (the ease shapes the segment that ENDS at this key), optional oscillation layers,
 * events (the first 'hit' is the impact: effects, sound, soil change, hit-stop and camera nudge fire exactly there),
 * `release` (u where the caller's callback fires and the player is free again; follow-through keeps playing after it).
 * Pose channels = Models.Anim.KEYS (radians, X swing positive = forward, armLZ/armRZ positive = outward, bob in world units).
 * Extra channels: step (root offset forward, units), yaw (extra body yaw), crouch (0..1 -> bob + legs + hips back), stag (leg stagger),
 * tilt (tool tilt relative to upright), tS (tool scale 0..1), hold (held-prop scale 0..1).
 * Ease codes: l linear, s smoothstep, ic ease-in cubic (strikes), oc ease-out cubic, ioc in-out cubic, ob out-back (overshoot),
 * ib in-back (anticipation pull), oe damped spring, ob2 strong overshoot.
 */
(function (root) {
  'use strict';
  var AD = {};
  AD.KEYS = ['bob', 'hipsRY', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'headRX', 'headRY', 'headRZ', 'armLX', 'armLZ', 'armRX', 'armRZ', 'legLX', 'legRX'];
  AD.EXTRA = ['step', 'yaw', 'crouch', 'stag', 'tilt', 'tS', 'hold'];
  AD.CH = AD.KEYS.concat(AD.EXTRA);
  AD.LEG = 0.24;
  var CHI = {}; AD.CH.forEach(function (k, i) { CHI[k] = i; });
  AD.index = CHI;

  /* ------------------------------------------------------------------ easing */
  var C1 = 1.70158, C3 = C1 + 1, C12 = 2.6, C32 = C12 + 1;
  var EASE = {
    l: function (t) { return t; },
    s: function (t) { return t * t * (3 - 2 * t); },
    ic: function (t) { return t * t * t; },
    oc: function (t) { var a = 1 - t; return 1 - a * a * a; },
    ioc: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    ob: function (t) { var a = t - 1; return 1 + C3 * a * a * a + C1 * a * a; },
    ob2: function (t) { var a = t - 1; return 1 + C32 * a * a * a + C12 * a * a; },
    ib: function (t) { return C3 * t * t * t - C1 * t * t; },
    oe: function (t) { return t >= 1 ? 1 : 1 - Math.exp(-5.5 * t) * Math.cos(t * 9.4) * (1 - t * 0.004); }
  };
  AD.ease = EASE;
  function easeOf(code) { return EASE[code] || EASE.s; }

  /* ------------------------------------------------------------------ compile / sample */
  var clips = {}, order = [];
  function compile(name, s) {
    var d = {
      name: name, dur: s.dur, hit: s.hit === undefined ? -1 : s.hit, release: s.release === undefined ? 1 : s.release,
      lock: s.lock === undefined ? 1 : s.lock, tool: s.tool || null, driven: s.driven || null, upright: s.upright === undefined ? 1 : s.upright,
      hitStop: s.hitStop || null, nudge: s.nudge || 0, blendIn: s.blendIn === undefined ? 0.08 : s.blendIn, blendOut: s.blendOut === undefined ? 0.22 : s.blendOut,
      phases: s.phases || [], ev: (s.ev || []).slice().sort(function (a, b) { return a[0] - b[0]; }), osc: s.osc || [], probes: s.probes || [],
      free: s.free || 0, ch: [], note: s.note || ''
    };
    var k, a, i, n;
    for (k in (s.ch || {})) {
      if (CHI[k] === undefined) throw new Error('anim_data: unknown channel ' + k + ' in clip ' + name);
      a = s.ch[k]; n = a.length;
      var u = new Float32Array(n), v = new Float32Array(n), e = new Array(n);
      for (i = 0; i < n; i++) { u[i] = a[i][0]; v[i] = a[i][1]; e[i] = easeOf(a[i][2]); if (i && u[i] < u[i - 1]) throw new Error('anim_data: keys out of order ' + name + '.' + k); }
      d.ch.push({ i: CHI[k], k: k, n: n, u: u, v: v, e: e });
    }
    d.oscC = d.osc.map(function (o) {
      if (CHI[o[0]] === undefined) throw new Error('anim_data: unknown osc channel ' + o[0]);
      return { i: CHI[o[0]], amp: o[1], f: o[2], u0: o[3], u1: o[4], ph: o[5] || 0 };
    });
    clips[name] = d; order.push(name);
    return d;
  }
  AD.define = compile;
  AD.names = function () { return order.slice(); };
  AD.has = function (name) { return !!clips[name]; };
  AD.get = function (name) { return clips[name] || clips.interact; };
  AD.newOut = function () { return { v: new Float32Array(AD.CH.length), has: new Uint8Array(AD.CH.length) }; };

  /** Sample clip `d` at normalised time u (0..1) into out.v / out.has (has = channel is driven by the clip). Allocation free. */
  AD.sampleU = function (d, u, out) {
    var c, j, a, i, t, v, n, o, w, env;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    for (i = 0; i < out.has.length; i++) { out.has[i] = 0; out.v[i] = 0; }
    for (c = 0; c < d.ch.length; c++) {
      a = d.ch[c]; n = a.n;
      if (u <= a.u[0]) v = a.v[0];
      else if (u >= a.u[n - 1]) v = a.v[n - 1];
      else {
        for (j = 1; j < n && u > a.u[j]; j++) {}
        t = (u - a.u[j - 1]) / ((a.u[j] - a.u[j - 1]) || 1e-6);
        v = a.v[j - 1] + (a.v[j] - a.v[j - 1]) * a.e[j](t);
      }
      out.v[a.i] = v; out.has[a.i] = 1;
    }
    for (c = 0; c < d.oscC.length; c++) {
      o = d.oscC[c];
      if (u <= o.u0 || u >= o.u1) continue;
      w = (u - o.u0) / (o.u1 - o.u0); env = Math.min(1, w / 0.18, (1 - w) / 0.18); env = env * env * (3 - 2 * env);
      out.v[o.i] += o.amp * env * Math.sin(6.2831853 * o.f * (u - o.u0) * d.dur + o.ph);
      out.has[o.i] = 1;
    }
    return out;
  };
  AD.sample = function (d, t, out) { return AD.sampleU(d, t / d.dur, out); };
  AD.phaseAt = function (d, u) {
    var r = '', i;
    for (i = 0; i < d.phases.length; i++) if (u >= d.phases[i][1]) r = d.phases[i][0];
    return r;
  };
  /** crouch -> {bob, hipZ, leg}: feet stay planted while hips drop and move back. */
  AD.crouch = function (c, out) {
    var th = c * 1.0;
    out.bob = -AD.LEG * (1 - Math.cos(th)); out.hipZ = -AD.LEG * Math.sin(th) * 0.9; out.leg = th;
    return out;
  };

  /* ================================================================== CLIPS ==================================================================
   * Contact poses were solved with the forward-kinematics probes of tools/anim_sample.js (hand / tool tip reach the tile in front of the hero:
   * tile centre = 1.0 ahead, the near edge = 0.5; `step` lunges the body forward so short arms still reach).
   * `probes` = [u, 'tool'|'hand', local offset, expected [x,y,z] (character space, step added), tolerance, label]; tools/check.js asserts them.
   */

  // Generic fallback: lean in, tap/press with the right hand, retract.
  compile('interact', {
    dur: 0.8, hit: 0.38, release: 0.62, lock: 1, tool: null,
    phases: [['anticipation', 0], ['impact', 0.38], ['follow', 0.46], ['settle', 0.62]],
    ch: {
      armRX: [[0, 0.1], [0.2, 0.55, 'oc'], [0.38, 1.35, 's'], [0.5, 1.2, 'oc'], [0.78, 0.25, 's'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.38, 0.12], [1, 0.1]],
      armLX: [[0, 0], [0.3, -0.15, 's'], [0.46, 0.1, 'oc'], [1, 0, 's']],
      spineRX: [[0, 0], [0.2, -0.05, 's'], [0.38, 0.2, 's'], [0.55, 0.1, 'oc'], [1, 0, 's']],
      headRX: [[0, 0], [0.38, 0.1, 's'], [1, 0, 's']],
      step: [[0, 0], [0.38, 0.06, 's'], [1, 0, 's']]
    },
    ev: [[0.38, 'hit']]
  });

  // ---- TILL: wind-up overhead (anticipation), hoe arc (strike), dig-in + hit-stop (impact), lever back (follow), recover (settle)
  compile('till', {
    dur: 1.0, hit: 0.37, release: 0.62, lock: 1, tool: 'hoe', upright: 0, hitStop: [0.055, 0.04], nudge: 0.016, blendIn: 0.07,
    phases: [['anticipation', 0], ['strike', 0.27], ['impact', 0.37], ['follow', 0.46], ['settle', 0.62]],
    ch: {
      armRX: [[0, 0.05], [0.12, 1.3, 'oc'], [0.24, 3.0, 'oc'], [0.27, 3.06, 'l'], [0.37, 1.54, 's'], [0.45, 1.4, 'oc'], [0.62, 0.7, 'ioc'], [1, 0.05, 's']],
      armRZ: [[0, 0.1], [0.27, -0.1, 's'], [0.37, -0.25, 's'], [0.62, -0.1, 's'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.12, 1.1, 'oc'], [0.24, 2.5, 'oc'], [0.27, 2.55, 'l'], [0.37, 1.0, 's'], [0.5, 0.2, 'oc'], [1, 0, 's']],
      armLZ: [[0, 0.1], [0.27, 0.35, 's'], [0.37, 0.6, 's'], [0.7, 0.2, 's'], [1, 0.1, 's']],
      spineRX: [[0, 0], [0.12, -0.08, 's'], [0.24, -0.26, 'oc'], [0.27, -0.28, 'l'], [0.37, 0.6, 's'], [0.5, 0.52, 'oc'], [0.7, 0.2, 's'], [1, 0, 's']],
      spineRY: [[0, 0], [0.27, 0.12, 's'], [0.37, -0.1, 's'], [0.7, 0, 's']],
      headRX: [[0, 0], [0.27, -0.12, 's'], [0.37, 0.14, 's'], [0.62, 0.05, 's'], [1, 0, 's']],
      crouch: [[0, 0], [0.12, 0.08, 's'], [0.27, 0, 's'], [0.37, 0.2, 's'], [0.55, 0.16, 'oc'], [1, 0, 's']],
      bob: [[0, 0], [0.24, 0.025, 'oc'], [0.37, -0.01, 's'], [0.5, 0, 'oc'], [1, 0, 's']],
      step: [[0, 0], [0.2, -0.05, 's'], [0.27, -0.06, 'l'], [0.37, 0.2, 's'], [0.55, 0.17, 'oc'], [1, 0, 's']],
      tS: [[0, 0], [0.08, 1, 'ob'], [0.9, 1, 'l'], [1, 0, 's']]
    },
    ev: [[0.37, 'hit']],
    probes: [[0.37, 'tool', [0, -0.6, 0.06], [0, 0.03, 0.95], 0.2, 'hoe blade reaches the tile in front']]
  });

  // ---- WATER: lean + lift the can (anticipation), tilt (pour starts), stream lands (impact), shake the last drops (follow), lower (settle)
  compile('water', {
    dur: 1.4, hit: 0.44, release: 0.95, lock: 1, tool: 'can', hitStop: null, nudge: 0, blendIn: 0.09,
    phases: [['anticipation', 0], ['pour', 0.30], ['impact', 0.44], ['follow', 0.78], ['settle', 0.95]],
    ch: {
      armRX: [[0, 0.1], [0.18, 1.25, 'oc'], [0.30, 1.55, 'oc'], [0.78, 1.5, 'l'], [0.9, 1.3, 'oc'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.2, -0.1, 's'], [0.78, -0.12, 'l'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.2, -0.3, 's'], [0.5, -0.1, 's'], [1, 0, 's']],
      armLZ: [[0, 0.1], [0.2, 0.5, 's'], [0.8, 0.45, 'l'], [1, 0.1, 's']],
      spineRX: [[0, 0], [0.18, 0.12, 'oc'], [0.3, 0.3, 'oc'], [0.78, 0.3, 'l'], [1, 0, 's']],
      headRX: [[0, 0], [0.3, 0.24, 's'], [0.8, 0.22, 'l'], [1, 0, 's']],
      crouch: [[0, 0], [0.3, 0.15, 'oc'], [0.8, 0.15, 'l'], [1, 0, 's']],
      step: [[0, 0], [0.3, 0.1, 'oc'], [0.8, 0.1, 'l'], [1, 0, 's']],
      tilt: [[0, 0], [0.18, 0.05, 's'], [0.30, 0.1, 's'], [0.42, 0.95, 'ob'], [0.78, 1.05, 'l'], [0.86, 0.1, 'oc'], [1, 0, 's']],
      tS: [[0, 0], [0.09, 1, 'ob'], [0.92, 1, 'l'], [1, 0, 's']]
    },
    osc: [['tilt', 0.14, 9, 0.80, 0.93], ['armRX', 0.05, 9, 0.80, 0.93]],
    ev: [[0.30, 'pour'], [0.44, 'hit'], [0.8, 'shake']],
    probes: [[0.44, 'tool', [0, -0.04, 0.2], [0, 0.3, 0.55], 0.3, 'spout over the tile']]
  });

  // ---- PLANT: crouch down, toss the seed (impact), pat the soil twice (secondary hits), rise with a little overshoot
  compile('plant', {
    dur: 1.1, hit: 0.45, release: 0.82, lock: 1, tool: 'pouch', hitStop: null, nudge: 0.004, blendIn: 0.08,
    phases: [['anticipation', 0], ['reach', 0.25], ['impact', 0.45], ['pat', 0.56], ['settle', 0.8]],
    ch: {
      crouch: [[0, 0], [0.25, 0.6, 'oc'], [0.76, 0.6, 'l'], [0.9, -0.03, 'ioc'], [0.97, 0, 's'], [1, 0, 's']],
      spineRX: [[0, 0], [0.25, 0.9, 'oc'], [0.76, 0.9, 'l'], [0.9, -0.05, 'ioc'], [1, 0, 's']],
      headRX: [[0, 0], [0.25, -0.25, 's'], [0.76, -0.25, 'l'], [0.9, -0.06, 'ioc'], [1, 0, 's']],
      armRX: [[0, 0.1], [0.2, 1.5, 'oc'], [0.3, 2.05, 'oc'], [0.42, 2.0, 'ib'], [0.45, 2.3, 's'], [0.52, 2.05, 'oc'], [0.56, 2.25, 'oc'], [0.62, 2.06, 'ic'], [0.67, 2.25, 'oc'], [0.72, 2.06, 'ic'], [0.78, 2.2, 'oc'], [0.9, 0.3, 's'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.4, -0.05, 's'], [0.9, 0.1, 's']],
      armLX: [[0, 0], [0.25, 0.5, 'oc'], [0.48, 0.55, 'l'], [0.56, 2.25, 'oc'], [0.62, 2.06, 'ic'], [0.67, 2.25, 'oc'], [0.72, 2.06, 'ic'], [0.78, 2.2, 'oc'], [0.9, 0.2, 's'], [1, 0, 's']],
      armLZ: [[0, 0.1], [0.25, 0.7, 'oc'], [0.48, 0.6, 's'], [0.56, 0.15, 's'], [0.9, 0.1, 's']],
      step: [[0, 0], [0.25, 0.3, 'oc'], [0.78, 0.3, 'l'], [1, 0, 's']],
      bob: [[0, 0], [0.9, 0, 'l'], [0.95, 0.025, 'oc'], [1, 0, 's']],
      tS: [[0, 0], [0.1, 1, 'ob'], [0.5, 1, 'l'], [0.58, 0, 's']]
    },
    ev: [[0.45, 'hit'], [0.62, 'pat'], [0.72, 'pat']],
    probes: [[0.45, 'hand', [0, 0, 0], [-0.15, 0.3, 0.6], 0.25, 'hand over the soil when the seed is tossed']]
  });

  // ---- FERTILIZE: scoop, two sowing flicks (first one is the impact), body twist follows the arm
  compile('fertilize', {
    dur: 1.0, hit: 0.35, release: 0.75, lock: 1, tool: 'sack', hitStop: null, blendIn: 0.08,
    phases: [['anticipation', 0], ['sprinkle', 0.28], ['impact', 0.35], ['follow', 0.5], ['settle', 0.72]],
    ch: {
      armRX: [[0, 0.1], [0.15, 0.55, 'oc'], [0.28, 0.2, 'ib'], [0.35, 1.5, 's'], [0.43, 1.2, 'oc'], [0.5, 0.45, 's'], [0.56, 1.45, 's'], [0.66, 1.1, 'oc'], [0.88, 0.2, 's'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.28, 0.5, 's'], [0.35, -0.3, 's'], [0.5, 0.45, 's'], [0.56, -0.25, 's'], [0.88, 0.1, 's'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.3, -0.25, 's'], [0.6, 0.1, 's'], [1, 0, 's']],
      armLZ: [[0, 0.1], [0.3, 0.45, 's'], [0.9, 0.12, 's'], [1, 0.1, 's']],
      spineRX: [[0, 0], [0.15, 0.15, 'oc'], [0.28, 0.08, 's'], [0.35, 0.26, 's'], [0.6, 0.24, 's'], [1, 0, 's']],
      spineRY: [[0, 0], [0.28, -0.25, 's'], [0.35, 0.22, 's'], [0.5, -0.2, 's'], [0.56, 0.2, 's'], [0.85, 0, 's']],
      headRX: [[0, 0], [0.35, 0.2, 's'], [0.9, 0.15, 's'], [1, 0, 's']],
      crouch: [[0, 0], [0.15, 0.2, 'oc'], [0.6, 0.2, 'l'], [1, 0, 's']],
      step: [[0, 0], [0.35, 0.12, 'oc'], [0.75, 0.12, 'l'], [1, 0, 's']],
      tS: [[0, 0], [0.08, 1, 'ob'], [0.92, 1, 'l'], [1, 0, 's']]
    },
    ev: [[0.35, 'hit'], [0.56, 'flick']],
    probes: [[0.35, 'hand', [0, 0, 0], [-0.15, 0.4, 0.4], 0.25, 'hand flicks over the soil']]
  });

  // ---- HARVEST: crouch + grip, tug (effort), crop pops out (impact), lift and hold up with sparkles, pop into the hotbar, happy settle
  compile('harvest', {
    dur: 1.3, hit: 0.37, release: 0.86, lock: 1, tool: null, hitStop: [0.045, 0.05], nudge: 0.008, blendIn: 0.08,
    phases: [['anticipation', 0], ['tug', 0.2], ['impact', 0.37], ['lift', 0.4], ['hold', 0.6], ['pop', 0.84], ['settle', 0.9]],
    ch: {
      crouch: [[0, 0], [0.18, 0.55, 'oc'], [0.31, 0.6, 's'], [0.37, 0.4, 's'], [0.55, 0.05, 'oc'], [0.9, 0, 's'], [1, 0, 's']],
      spineRX: [[0, 0], [0.18, 0.9, 'oc'], [0.31, 0.95, 's'], [0.37, -0.12, 's'], [0.46, -0.1, 'oc'], [0.6, -0.12, 's'], [0.86, -0.06, 's'], [1, 0, 's']],
      headRX: [[0, 0], [0.18, -0.25, 's'], [0.31, -0.2, 's'], [0.37, -0.2, 's'], [0.6, -0.12, 's'], [0.86, -0.06, 's'], [1, 0, 's']],
      armRX: [[0, 0.1], [0.16, 1.95, 'oc'], [0.31, 2.0, 's'], [0.37, 1.2, 's'], [0.45, 2.3, 'oc'], [0.58, 2.65, 'ob'], [0.84, 2.65, 'l'], [0.9, 1.2, 's'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.16, 1.95, 'oc'], [0.31, 2.0, 's'], [0.37, 1.2, 's'], [0.45, 2.3, 'oc'], [0.58, 2.65, 'ob'], [0.84, 2.65, 'l'], [0.9, 1.2, 's'], [1, 0, 's']],
      armRZ: [[0, 0.1], [0.16, -0.12, 's'], [0.37, -0.2, 's'], [0.58, -0.3, 's'], [0.84, -0.3, 'l'], [1, 0.1, 's']],
      armLZ: [[0, 0.1], [0.16, -0.12, 's'], [0.37, -0.2, 's'], [0.58, -0.3, 's'], [0.84, -0.3, 'l'], [1, 0.1, 's']],
      bob: [[0, 0], [0.37, 0, 'l'], [0.43, 0.05, 'oc'], [0.55, 0.02, 's'], [0.84, 0.02, 'l'], [0.9, 0.07, 's'], [0.98, 0, 's'], [1, 0, 's']],
      step: [[0, 0], [0.18, 0.3, 'oc'], [0.31, 0.3, 'l'], [0.37, 0.18, 's'], [0.6, 0, 's'], [1, 0, 's']],
      hold: [[0, 0], [0.37, 0, 'l'], [0.45, 1, 'ob2'], [0.84, 1, 'l'], [0.9, 0, 's']]
    },
    osc: [['spineRX', 0.04, 11, 0.2, 0.33], ['bob', 0.006, 11, 0.2, 0.33], ['armRX', 0.07, 11, 0.2, 0.33], ['armLX', 0.07, 11, 0.2, 0.33]],
    ev: [[0.37, 'hit'], [0.6, 'sparkle'], [0.84, 'pop']],
    probes: [[0.31, 'hand', [0, 0, 0], [-0.15, 0.3, 0.6], 0.25, 'hands grip the crop base']]
  });

  // ---- EAT: lift food to the mouth, first bite (impact), chew (cheeks = head bob), swallow, happy bounce
  compile('eat', {
    dur: 1.25, hit: 0.3, release: 0.84, lock: 1, tool: 'bread', hitStop: [0.03, 0.2], blendIn: 0.09,
    phases: [['anticipation', 0], ['impact', 0.3], ['chew', 0.38], ['swallow', 0.72], ['bounce', 0.84], ['settle', 0.95]],
    ch: {
      armRX: [[0, 0.1], [0.14, 1.2, 'oc'], [0.3, 2.35, 'oc'], [0.72, 2.3, 'l'], [0.84, 1.0, 'oc'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.3, -0.5, 's'], [0.75, -0.45, 'l'], [1, 0.1, 's']],
      armLZ: [[0, 0.1], [0.3, 0.35, 's'], [1, 0.1, 's']],
      spineRX: [[0, 0], [0.3, 0.1, 's'], [0.72, 0.06, 's'], [0.9, -0.06, 'oc'], [1, 0, 's']],
      headRX: [[0, 0], [0.22, -0.06, 's'], [0.3, 0.16, 's'], [0.72, 0.08, 's'], [0.86, -0.2, 'ob'], [1, 0, 's']],
      bob: [[0, 0], [0.84, 0, 'l'], [0.9, 0.07, 'oc'], [0.97, 0, 'ic'], [1.0, 0, 's']],
      tS: [[0, 0], [0.1, 1, 'ob'], [0.3, 1, 'l'], [0.38, 0.7, 's'], [0.5, 0.45, 's'], [0.62, 0.2, 's'], [0.72, 0, 's']]
    },
    osc: [['headRX', 0.06, 5.5, 0.4, 0.72], ['headRZ', 0.05, 2.75, 0.4, 0.72], ['spineRX', 0.012, 5.5, 0.4, 0.72]],
    ev: [[0.3, 'hit'], [0.46, 'chew'], [0.6, 'chew'], [0.72, 'swallow']],
    probes: [[0.3, 'tool', [0, -0.05, 0.02], [-0.07, 0.62, 0.22], 0.4, 'bread meets the mouth']]
  });

  // ---- PICKUP: bend, grab, stand up holding it for a beat
  compile('pickup', {
    dur: 0.95, hit: 0.36, release: 0.66, lock: 1, tool: null, nudge: 0.003,
    phases: [['anticipation', 0], ['grab', 0.36], ['lift', 0.45], ['settle', 0.66]],
    ch: {
      crouch: [[0, 0], [0.3, 0.6, 'oc'], [0.4, 0.6, 'l'], [0.66, 0, 'ioc'], [1, 0, 's']],
      spineRX: [[0, 0], [0.3, 0.9, 'oc'], [0.4, 0.9, 'l'], [0.62, -0.05, 'ioc'], [1, 0, 's']],
      headRX: [[0, 0], [0.3, -0.25, 's'], [0.4, -0.25, 'l'], [0.62, -0.12, 's'], [1, 0, 's']],
      armRX: [[0, 0.1], [0.26, 2.06, 'oc'], [0.4, 2.06, 'l'], [0.58, 1.3, 'oc'], [0.8, 1.2, 's'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.26, 0.5, 'oc'], [0.4, 0.5, 'l'], [1, 0, 's']],
      armLZ: [[0, 0.1], [0.3, 0.6, 'oc'], [0.6, 0.3, 's'], [1, 0.1, 's']],
      step: [[0, 0], [0.3, 0.3, 'oc'], [0.4, 0.3, 'l'], [0.66, 0, 's']]
    },
    ev: [[0.36, 'hit']],
    probes: [[0.36, 'hand', [0, 0, 0], [-0.15, 0.3, 0.6], 0.25, 'hand reaches the ground item']]
  });

  // ---- CHEST: lean in, hands on the lid, lid opens (impact), peek, step back
  compile('chest', {
    dur: 0.95, hit: 0.4, release: 0.5, lock: 1, tool: null, nudge: 0.004,
    phases: [['anticipation', 0], ['lid', 0.3], ['impact', 0.4], ['peek', 0.5], ['settle', 0.75]],
    ch: {
      spineRX: [[0, 0], [0.22, 0.12, 'oc'], [0.4, 0.5, 's'], [0.55, 0.42, 'oc'], [0.9, 0, 's']],
      headRX: [[0, 0], [0.3, 0.12, 's'], [0.4, 0.1, 'oc'], [0.9, 0, 's']],
      armRX: [[0, 0.1], [0.28, 1.2, 'oc'], [0.4, 1.9, 's'], [0.55, 1.55, 'oc'], [0.9, 0.1, 's']],
      armLX: [[0, 0], [0.28, 1.2, 'oc'], [0.4, 1.9, 's'], [0.55, 1.55, 'oc'], [0.9, 0, 's']],
      armRZ: [[0, 0.1], [0.4, -0.1, 's'], [0.9, 0.1, 's']],
      armLZ: [[0, 0.1], [0.4, -0.1, 's'], [0.9, 0.1, 's']],
      crouch: [[0, 0], [0.4, 0.22, 's'], [0.6, 0.12, 'oc'], [0.95, 0, 's']],
      step: [[0, 0], [0.4, 0.22, 'oc'], [0.9, 0, 's']]
    },
    ev: [[0.4, 'hit']],
    probes: [[0.4, 'hand', [0, 0, 0], [-0.15, 0.4, 0.5], 0.25, 'hands on the lid']]
  });

  // ---- SIT / STAND (pier seat transitions; end pose of sit = Player's seated pose: bob -0.2, legs 1.45, arms 0.35)
  compile('sit', {
    dur: 0.6, hit: 0.5, release: 0.01, lock: 0, free: 1, blendIn: 0.01, blendOut: 0.12,
    phases: [['anticipation', 0], ['drop', 0.25], ['impact', 0.5], ['settle', 0.7]],
    ch: {
      bob: [[0, 0], [0.15, -0.04, 's'], [0.5, -0.23, 's'], [0.7, -0.2, 'oc'], [1, -0.2, 'l']],
      legLX: [[0, 0], [0.15, 0.2, 's'], [0.55, 1.55, 'oc'], [0.75, 1.45, 's'], [1, 1.45, 'l']],
      legRX: [[0, 0], [0.2, 0.15, 's'], [0.6, 1.55, 'oc'], [0.8, 1.45, 's'], [1, 1.45, 'l']],
      armLX: [[0, 0], [0.15, -0.2, 's'], [0.6, 0.5, 'oc'], [0.8, 0.35, 's'], [1, 0.35, 'l']],
      armRX: [[0, 0], [0.15, -0.2, 's'], [0.6, 0.5, 'oc'], [0.8, 0.35, 's'], [1, 0.35, 'l']],
      spineRX: [[0, 0], [0.15, 0.15, 's'], [0.55, 0.1, 's'], [1, 0, 's']]
    },
    ev: [[0.5, 'hit']]
  });
  compile('stand', {
    dur: 0.6, hit: 0.45, release: 0.01, lock: 0, free: 1, blendIn: 0.01, blendOut: 0.18,
    phases: [['anticipation', 0], ['rise', 0.3], ['impact', 0.45], ['settle', 0.7]],
    ch: {
      bob: [[0, -0.2], [0.2, -0.2, 'l'], [0.45, -0.05, 's'], [0.6, 0.03, 'oc'], [1, 0, 's']],
      legLX: [[0, 1.45], [0.2, 1.45, 'l'], [0.5, 0.1, 'oc'], [1, 0, 's']],
      legRX: [[0, 1.45], [0.2, 1.45, 'l'], [0.55, 0.1, 'oc'], [1, 0, 's']],
      armLX: [[0, 0.35], [0.3, 0.6, 's'], [0.65, 0.1, 's'], [1, 0, 's']],
      armRX: [[0, 0.35], [0.3, 0.6, 's'], [0.65, 0.1, 's'], [1, 0, 's']],
      spineRX: [[0, 0], [0.25, 0.3, 's'], [0.55, -0.05, 'oc'], [1, 0, 's']]
    },
    ev: [[0.45, 'hit']]
  });

  // ---- SLEEP: big yawn + stretch (anticipation), nod off (droop), z marks; WAKE: groggy, stretch, rub eye, happy hop
  compile('sleep', {
    dur: 1.3, hit: -1, release: 0.8, lock: 1, free: 1, blendIn: 0.1, blendOut: 0.05,
    phases: [['yawn', 0], ['stretch', 0.15], ['droop', 0.55], ['asleep', 0.8]],
    ch: {
      armRX: [[0, 0.1], [0.25, 2.9, 'oc'], [0.5, 2.8, 's'], [0.65, 0.3, 's'], [1, 0.3, 's']],
      armLX: [[0, 0], [0.25, 2.9, 'oc'], [0.5, 2.8, 's'], [0.65, 0.3, 's'], [1, 0.3, 's']],
      armRZ: [[0, 0.1], [0.25, 0.3, 's'], [0.65, 0.12, 's'], [1, 0.12, 's']],
      armLZ: [[0, 0.1], [0.25, 0.3, 's'], [0.65, 0.12, 's'], [1, 0.12, 's']],
      spineRX: [[0, 0], [0.25, -0.18, 'oc'], [0.5, -0.15, 's'], [0.8, 0.3, 'ioc'], [1, 0.34, 's']],
      headRX: [[0, 0], [0.25, -0.4, 'oc'], [0.5, -0.35, 's'], [0.72, 0.5, 'ioc'], [0.8, 0.35, 'oc'], [1, 0.5, 's']],
      headRZ: [[0, 0], [0.8, 0, 'l'], [1, 0.18, 's']],
      crouch: [[0, 0], [0.5, 0, 'l'], [0.85, 0.28, 'ioc'], [1, 0.3, 's']],
      bob: [[0, 0], [0.25, 0.03, 'oc'], [0.5, 0.03, 's'], [0.7, 0, 's']]
    },
    ev: [[0.2, 'yawn'], [0.62, 'zz'], [0.85, 'zz']]
  });
  compile('wake', {
    dur: 1.5, hit: 0.5, release: 0.62, lock: 0, free: 1, blendIn: 0.01, blendOut: 0.2,
    phases: [['groggy', 0], ['stretch', 0.3], ['impact', 0.5], ['rub', 0.62], ['hop', 0.8]],
    ch: {
      headRX: [[0, 0.5], [0.12, 0.45, 's'], [0.28, 0.1, 'oc'], [0.45, -0.3, 's'], [0.6, 0.1, 's'], [1, 0, 's']],
      spineRX: [[0, 0.34], [0.12, 0.3, 's'], [0.3, 0.05, 'oc'], [0.5, -0.22, 's'], [0.66, 0.05, 's'], [1, 0, 's']],
      crouch: [[0, 0.3], [0.12, 0.28, 's'], [0.3, 0, 'oc'], [1, 0, 's']],
      armRX: [[0, 0.3], [0.3, 0.3, 'l'], [0.5, 2.9, 'oc'], [0.62, 2.8, 'l'], [0.7, 2.3, 's'], [0.8, 2.3, 'l'], [0.9, 0.2, 's'], [1, 0.1, 's']],
      armLX: [[0, 0.3], [0.3, 0.3, 'l'], [0.5, 2.9, 'oc'], [0.62, 2.8, 'l'], [0.72, 0.3, 's'], [1, 0, 's']],
      armRZ: [[0, 0.12], [0.5, 0.3, 's'], [0.7, -0.45, 's'], [0.8, -0.45, 'l'], [0.9, 0.1, 's']],
      headRZ: [[0, 0.18], [0.12, 0.12, 's'], [0.3, 0, 's']],
      bob: [[0, 0], [0.8, 0, 'l'], [0.86, 0.08, 'oc'], [0.96, 0, 'ic'], [1, 0, 's']]
    },
    osc: [['spineRY', 0.04, 1.5, 0, 0.35], ['headRX', 0.03, 7, 0.7, 0.8]],
    ev: [[0.5, 'hit']]
  });

  // ---- BUY: hold out the coins, bow, happy bounce.  SELL: swing back, underhand toss into the bin.
  compile('buy', {
    dur: 0.9, hit: 0.35, release: 0.6, lock: 1, blendIn: 0.08,
    phases: [['anticipation', 0], ['handover', 0.35], ['follow', 0.45], ['settle', 0.62]],
    ch: {
      armRX: [[0, 0.1], [0.15, 0.7, 'oc'], [0.35, 1.6, 's'], [0.5, 1.5, 'oc'], [0.75, 0.3, 's'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.35, -0.1, 's'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.35, 0.6, 's'], [0.75, 0.1, 's'], [1, 0, 's']],
      spineRX: [[0, 0], [0.15, -0.05, 's'], [0.35, 0.18, 's'], [0.55, 0.1, 's'], [0.75, -0.04, 'ob'], [1, 0, 's']],
      headRX: [[0, 0], [0.35, 0.15, 's'], [0.55, -0.1, 'oc'], [1, 0, 's']],
      bob: [[0, 0], [0.62, 0, 'l'], [0.7, 0.05, 'oc'], [0.82, 0, 'ic'], [1, 0, 's']],
      step: [[0, 0], [0.35, 0.1, 'oc'], [0.8, 0, 's']]
    },
    ev: [[0.35, 'hit']]
  });
  compile('sell', {
    dur: 1.0, hit: 0.4, release: 0.62, lock: 1, blendIn: 0.08,
    phases: [['anticipation', 0], ['swing', 0.28], ['impact', 0.4], ['follow', 0.5], ['settle', 0.65]],
    ch: {
      armRX: [[0, 0.1], [0.28, -0.7, 'oc'], [0.4, 1.55, 's'], [0.52, 1.7, 'oc'], [0.8, 0.3, 's'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.28, -0.4, 'oc'], [0.4, 1.2, 's'], [0.55, 1.2, 'oc'], [0.8, 0.1, 's'], [1, 0, 's']],
      armLZ: [[0, 0.1], [0.4, 0.3, 's'], [1, 0.1, 's']],
      spineRX: [[0, 0], [0.28, -0.12, 'oc'], [0.4, 0.3, 's'], [0.6, 0.2, 'oc'], [1, 0, 's']],
      crouch: [[0, 0], [0.28, 0.1, 's'], [0.4, 0.22, 's'], [0.7, 0, 's']],
      step: [[0, 0], [0.4, 0.15, 's'], [0.8, 0, 's']],
      headRX: [[0, 0], [0.4, 0.1, 's'], [1, 0, 's']]
    },
    ev: [[0.4, 'hit']]
  });

  // ---- COOK: stir (circular arm + head bob) then a "ta-da" lift
  compile('cook', {
    dur: 1.6, hit: -1, release: 1.0, lock: 0, blendIn: 0.1,
    phases: [['reach', 0], ['stir', 0.2], ['chop', 0.5], ['tada', 0.65]],
    ch: {
      armRX: [[0, 0.1], [0.12, 1.2, 'oc'], [0.62, 1.2, 'l'], [0.72, 2.7, 'oc'], [0.88, 2.7, 'l'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.12, -0.2, 's'], [0.62, -0.2, 'l'], [0.72, 0.4, 's'], [0.88, 0.4, 'l'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.12, 0.9, 'oc'], [0.62, 0.9, 'l'], [0.72, 2.7, 'oc'], [0.88, 2.7, 'l'], [1, 0, 's']],
      armLZ: [[0, 0.1], [0.12, 0.2, 's'], [0.72, 0.4, 's'], [1, 0.1, 's']],
      spineRX: [[0, 0], [0.12, 0.2, 'oc'], [0.62, 0.2, 'l'], [0.72, -0.1, 's'], [1, 0, 's']],
      headRX: [[0, 0], [0.12, 0.2, 's'], [0.62, 0.2, 'l'], [0.72, -0.15, 's'], [1, 0, 's']],
      bob: [[0, 0], [0.7, 0, 'l'], [0.76, 0.06, 'oc'], [0.86, 0, 'ic'], [1, 0, 's']]
    },
    osc: [['armRX', 0.14, 3.3, 0.14, 0.6], ['armRZ', 0.2, 3.3, 0.14, 0.6, 1.57], ['headRX', 0.05, 6.6, 0.14, 0.6], ['bob', 0.008, 6.6, 0.14, 0.6]],
    ev: [[0.22, 'stir'], [0.4, 'stir'], [0.7, 'done']]
  });

  // ---- LEVEL-UP: crouch, jump with tuck + arms up (impact at takeoff), squash on landing; seated variant cheers on the pier
  compile('levelup', {
    dur: 1.3, hit: 0.34, release: 0.9, lock: 0, blendIn: 0.07,
    phases: [['anticipation', 0], ['jump', 0.3], ['impact', 0.34], ['land', 0.62], ['settle', 0.75]],
    ch: {
      crouch: [[0, 0], [0.22, 0.55, 's'], [0.34, 0, 's'], [0.58, 0, 'l'], [0.66, 0.5, 's'], [0.78, 0, 'ob'], [1, 0, 's']],
      bob: [[0, 0], [0.34, 0, 'l'], [0.48, 0.24, 's'], [0.62, 0.02, 's'], [0.66, 0, 'l'], [1, 0, 's']],
      armRX: [[0, 0.1], [0.22, -0.5, 'oc'], [0.4, 2.9, 's'], [0.62, 2.9, 'l'], [0.75, 2.5, 's'], [0.9, 0.3, 's'], [1, 0.1, 's']],
      armLX: [[0, 0], [0.22, -0.5, 'oc'], [0.4, 2.9, 's'], [0.62, 2.9, 'l'], [0.75, 2.5, 's'], [0.9, 0.3, 's'], [1, 0, 's']],
      armRZ: [[0, 0.1], [0.4, 0.5, 's'], [0.75, 0.5, 'l'], [1, 0.1, 's']],
      armLZ: [[0, 0.1], [0.4, 0.5, 's'], [0.75, 0.5, 'l'], [1, 0.1, 's']],
      legLX: [[0, 0], [0.4, 0, 'l'], [0.5, 0.6, 's'], [0.6, 0, 's'], [1, 0, 's']],
      legRX: [[0, 0], [0.4, 0, 'l'], [0.5, -0.4, 's'], [0.6, 0, 's'], [1, 0, 's']],
      spineRX: [[0, 0], [0.22, 0.25, 's'], [0.45, -0.18, 's'], [0.66, 0.15, 's'], [0.9, 0, 's']],
      headRX: [[0, 0], [0.45, -0.3, 's'], [0.7, -0.15, 's'], [1, 0, 's']]
    },
    ev: [[0.34, 'hit'], [0.64, 'land']]
  });
  compile('levelup_seated', {
    dur: 1.1, hit: 0.3, release: 0.7, lock: 0, free: 1, blendIn: 0.07,
    phases: [['anticipation', 0], ['cheer', 0.3], ['settle', 0.7]],
    ch: {
      armRX: [[0, 0.35], [0.2, -0.2, 'oc'], [0.4, 2.8, 's'], [0.75, 2.8, 'l'], [1, 0.35, 's']],
      armLX: [[0, 0.35], [0.2, -0.2, 'oc'], [0.4, 2.8, 's'], [0.75, 2.8, 'l'], [1, 0.35, 's']],
      armRZ: [[0, 0.1], [0.4, 0.45, 's'], [0.75, 0.45, 'l'], [1, 0.1, 's']],
      armLZ: [[0, 0.1], [0.4, 0.45, 's'], [0.75, 0.45, 'l'], [1, 0.1, 's']],
      spineRX: [[0, 0], [0.2, 0.15, 's'], [0.4, -0.2, 's'], [0.75, -0.12, 's'], [1, 0, 's']],
      headRX: [[0, 0], [0.4, -0.3, 's'], [1, 0, 's']]
    },
    osc: [['spineRX', 0.05, 5, 0.45, 0.78]],
    ev: [[0.3, 'hit']]
  });

  // ---- DRINK (soups, tea): raise the bowl, tilt it, sip (impact), "ahh" bounce
  compile('drink', {
    dur: 1.3, hit: 0.38, release: 0.88, lock: 1, tool: 'bread', hitStop: [0.03, 0.2], blendIn: 0.09,
    phases: [['anticipation', 0], ['sip', 0.38], ['gulp', 0.5], ['ahh', 0.82], ['settle', 0.95]],
    ch: {
      armRX: [[0, 0.1], [0.15, 1.2, 'oc'], [0.32, 2.3, 'oc'], [0.72, 2.3, 'l'], [0.86, 1.0, 'oc'], [1, 0.1, 's']],
      armRZ: [[0, 0.1], [0.32, -0.5, 's'], [0.75, -0.45, 'l'], [1, 0.1, 's']],
      armLZ: [[0, 0.1], [0.3, 0.3, 's'], [1, 0.1, 's']],
      tilt: [[0, 0], [0.3, 0.05, 's'], [0.42, 0.75, 'oc'], [0.72, 0.75, 'l'], [0.82, 0, 's']],
      headRX: [[0, 0], [0.32, -0.05, 's'], [0.42, -0.35, 'oc'], [0.72, -0.35, 'l'], [0.86, -0.2, 'ob'], [1, 0, 's']],
      spineRX: [[0, 0], [0.4, -0.08, 's'], [0.72, -0.08, 'l'], [0.9, -0.06, 'oc'], [1, 0, 's']],
      bob: [[0, 0], [0.84, 0, 'l'], [0.9, 0.07, 'oc'], [0.97, 0, 'ic'], [1, 0, 's']],
      tS: [[0, 0], [0.1, 1, 'ob'], [0.8, 1, 'l'], [0.9, 0, 's']]
    },
    osc: [['headRX', 0.03, 3, 0.5, 0.72]],
    ev: [[0.38, 'hit'], [0.55, 'gulp'], [0.66, 'gulp']]
  });

  // ---- SHAKE (after rain; idle extra): quick whole-body wiggle, arms out
  compile('shake', {
    dur: 0.9, hit: -1, release: 0.01, lock: 0, blendIn: 0.08,
    phases: [['shake', 0], ['settle', 0.7]],
    ch: { armLZ: [[0, 0.1], [0.15, 0.5, 's'], [0.75, 0.5, 'l'], [1, 0.1, 's']], armRZ: [[0, 0.1], [0.15, 0.5, 's'], [0.75, 0.5, 'l'], [1, 0.1, 's']], crouch: [[0, 0], [0.1, 0.15, 's'], [0.75, 0.15, 'l'], [1, 0, 's']] },
    osc: [['hipsRY', 0.3, 8, 0.05, 0.8], ['spineRY', -0.2, 8, 0.05, 0.8], ['headRY', 0.25, 8, 0.05, 0.8, 1], ['spineRZ', 0.08, 8, 0.05, 0.8, 1.5]],
    ev: [[0.2, 'drops']]
  });

  // ---- Fishing clips are driven by js/fishing_fx.js (pose layer at 102); registered so every name resolves
  ['wait', 'bite', 'reel', 'catch', 'lose'].forEach(function (n) { compile(n, { dur: 0.7, release: 0.01, lock: 0, driven: 'fishing', blendIn: 0.01, blendOut: 0.01, note: 'pose driven by js/fishing_fx.js' }); });

  // ---- CAST: driven by Fishing/FishingFx (pose layer at frame priority 102); the registry entry keeps the name resolvable
  compile('cast', { dur: 0.7, release: 0.01, lock: 0, driven: 'fishing', blendIn: 0.01, blendOut: 0.01, note: 'pose is driven by js/fishing_fx.js' });

  // ---- NPC clips (Stage 15D D4): ADDITIVE deltas on top of an NPC's idle pose, played by js/npc_react.js (no hero engine involved).
  // All start and end at 0 so they blend in and out without pops. Arm channels use the pose convention (armRX positive = raise forward).
  function npcClip(name, dur, ch, osc, note) { return compile(name, { dur: dur, release: 1, lock: 0, blendIn: 0.05, blendOut: 0.1, ch: ch, osc: osc || [], note: note || 'npc additive' }); }
  npcClip('npc_wave', 1.7, {                    // greeting: raise the right hand, wave, small nod and lean
    armRX: [[0, 0], [0.2, 2.35, 'ob'], [0.78, 2.35, 'l'], [1, 0, 'ioc']], armRZ: [[0, 0], [0.2, 0.45, 's'], [0.78, 0.45, 'l'], [1, 0, 's']],
    headRZ: [[0, 0], [0.25, 0.1, 's'], [0.75, 0.1, 'l'], [1, 0, 's']], headRX: [[0, 0], [0.12, -0.1, 's'], [0.3, 0.05, 's'], [1, 0, 's']],
    spineRZ: [[0, 0], [0.25, -0.05, 's'], [0.75, -0.05, 'l'], [1, 0, 's']]
  }, [['armRZ', 0.3, 3.2, 0.24, 0.8]]);
  npcClip('npc_talk_a', 0.95, {                 // talk phrase A: right hand opens out, head dips on the stress, settles
    armRX: [[0, 0], [0.25, 0.85, 'oc'], [0.55, 0.65, 's'], [1, 0, 'ioc']], armRZ: [[0, 0], [0.25, 0.35, 's'], [1, 0, 's']],
    headRX: [[0, 0], [0.22, 0.08, 'oc'], [0.4, -0.04, 's'], [1, 0, 's']], headRZ: [[0, 0], [0.3, 0.06, 's'], [1, 0, 's']], spineRX: [[0, 0], [0.25, 0.03, 's'], [1, 0, 's']]
  });
  npcClip('npc_talk_b', 1.15, {                 // talk phrase B: left hand beats twice, head tilts the other way
    armLX: [[0, 0], [0.22, 0.75, 'oc'], [0.4, 0.5, 's'], [0.55, 0.8, 'oc'], [1, 0, 'ioc']], armLZ: [[0, 0], [0.25, 0.3, 's'], [1, 0, 's']],
    headRX: [[0, 0], [0.22, 0.07, 'oc'], [0.55, 0.07, 'oc'], [1, 0, 's']], headRZ: [[0, 0], [0.3, -0.07, 's'], [1, 0, 's']], spineRY: [[0, 0], [0.3, 0.05, 's'], [1, 0, 's']]
  });
  npcClip('npc_shift', 2.4, {                   // weight shift: hips sway to one side, shoulders counter, small breath out
    hipsRZ: [[0, 0], [0.35, 0.05, 'ioc'], [0.65, 0.05, 'l'], [1, 0, 'ioc']], spineRZ: [[0, 0], [0.35, -0.04, 'ioc'], [0.65, -0.04, 'l'], [1, 0, 'ioc']],
    bob: [[0, 0], [0.35, -0.006, 's'], [0.65, -0.006, 'l'], [1, 0, 's']], headRZ: [[0, 0], [0.4, 0.04, 's'], [1, 0, 's']]
  });
  npcClip('npc_glance', 2.6, {                  // glance to one side, then up at the sky, back
    headRY: [[0, 0], [0.22, 0.6, 'ioc'], [0.45, 0.6, 'l'], [0.6, -0.25, 'ioc'], [0.75, -0.25, 'l'], [1, 0, 'ioc']],
    headRX: [[0, 0], [0.5, 0, 'l'], [0.62, -0.22, 'oc'], [0.75, -0.22, 'l'], [1, 0, 'ioc']], spineRY: [[0, 0], [0.25, 0.12, 's'], [0.45, 0.12, 'l'], [1, 0, 'ioc']]
  });
  npcClip('npc_scratch', 2.0, {                 // scratch the back of the head with the right hand
    armRX: [[0, 0], [0.25, 2.75, 'oc'], [0.8, 2.75, 'l'], [1, 0, 'ioc']], armRZ: [[0, 0], [0.25, 0.5, 's'], [0.8, 0.5, 'l'], [1, 0, 's']],
    headRX: [[0, 0], [0.3, -0.06, 's'], [0.8, -0.06, 'l'], [1, 0, 's']], headRZ: [[0, 0], [0.3, 0.1, 's'], [0.8, 0.1, 'l'], [1, 0, 's']]
  }, [['armRZ', 0.12, 4.5, 0.3, 0.8], ['headRZ', 0.03, 4.5, 0.3, 0.8, 1]]);
  AD.NPC_CLIPS = ['npc_wave', 'npc_talk_a', 'npc_talk_b', 'npc_shift', 'npc_glance', 'npc_scratch'];

  if (typeof module !== 'undefined' && module.exports) module.exports = AD;
  if (root && root.Game) root.Game.AnimData = AD; else if (root) { root.Game = root.Game || {}; root.Game.AnimData = AD; }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
