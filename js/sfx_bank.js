/* Togie Valley - sfx_bank.js (Stage 11.5A): sound recipes built on dsp.js. Browser: Game.SfxBank; Node: module.exports.
 * Recipe {id, group, peak dBFS, variants, sets[{k,...params}], make(r, p, D) -> mono|stereo, maxDur?, sparkle?, wet?, cd?}.
 * Bank.render(id, setKey, variant) -> mono Float32Array | [L, R], cozy-filtered (HP 80 Hz, LP 8.5 kHz), normalized to the recipe peak, 2 ms edge fades.
 * Groups: ui -10, tool -8, fish -8, foot -20, fan -6. 11.5B/11.5C add fishing / footstep / ambient families on the same engine.
 */
(function (root) {
  'use strict';
  var D = typeof module !== 'undefined' && module.exports ? require('./dsp.js') : (root.Game && root.Game.Dsp);
  if (!D) { if (typeof console !== 'undefined') console.error('[sfx_bank] Dsp missing'); return; }
  var T = D.tone, P = D.puff, M = D.mix, B = D.bell, SR = D.SR;
  var PEAK = { ui: -10, tool: -8, fish: -8, foot: -20, fan: -6, animal: -20 }, ORDER = { ui: 0, foot: 1, tool: 2, fish: 3, fan: 4, animal: 5 };
  var RMS = { ui: -24, tool: -22, fish: -20, foot: -33, fan: -20, animal: -36 };
  var Bank = { recipes: {}, ids: [], alias: {} };

  function def(id, group, variants, sets, make, x) {
    var rc = { id: id, group: group, peak: PEAK[group], variants: variants, sets: sets || [{ k: '' }], make: make };
    if (x) for (var k in x) rc[k] = x[k];
    Bank.recipes[id] = rc; Bank.ids.push(id);
  }
  function jp(r, v) { return r.jit(v, 0.04); }   // pitch +-4%
  function jf(r, v) { return r.jit(v, 0.1); }    // filter +-10%
  function nm(x, db) { return D.normalize(x, db); }
  function mar(f, dur, t60) { return M(dur, [[T('sine', f, 0, dur, 0.003, t60), 0, 1], [T('sine', f * 4, 0, 0.06, 0.003, 0.04), 0, 0.22]]); }
  function box(f, dur, t60) { return M(dur, [[T('sine', f, 0, dur, 0.003, t60), 0, 1], [T('sine', f * 3, 0, dur, 0.003, t60 * 0.35), 0, 0.22], [T('sine', f * 2, 0, dur, 0.003, t60 * 0.5), 0, 0.1]]); }
  function warm(f, dur, t60) { return M(dur, [[T('sine', f, 0, dur, 0.004, t60), 0, 1], [T('sine', f * 2, 0, dur, 0.004, t60 * 0.6), 0, 0.3]]); }
  function am(r, sec, fc) { var x = D.filter(D.noise(sec, r, 'white'), 'lp', fc, 0.7), p = D.peak(x) || 1, i; for (i = 0; i < x.length; i++) x[i] = 0.6 + 0.4 * (x[i] / p); return x; }
  function sets(key, arr) { return arr.map(function (v) { var o = { k: String(v) }; o[key] = v; return o; }); }

  /* ---------------------------------------------------------------- UI and feedback */
  def('tap', 'ui', 3, 0, function (r) { return M(0.04, [[T('sine', jp(r, 1100), 0, 0.04, 0.003, 0.03), 0, 1], [P(r, 0.012, 'bp', jf(r, 3000), 0, 1, 0.002, 0.008), 0, 0.25]]); });
  def('pop', 'ui', 3, 0, function (r) { return T('sine', jp(r, 420), jp(r, 880), 0.09, 0.004, 0.07); });
  def('blip', 'ui', 4, 0, function (r) { return M(0.07, [[T('sine', jp(r, 1000), 0, 0.07, 0.004, 0.05), 0, 1], [T('sine', jp(r, 2000), 0, 0.05, 0.004, 0.025), 0, 0.2]]); });
  def('panelOpen', 'ui', 2, 0, function (r) { return M(0.17, [[P(r, 0.16, 'lp', jf(r, 900), 0, 0.7, 0.07, 0.1, 'pink'), 0, 1], [T('sine', 300, 420, 0.14, 0.02, 0.1), 0, 0.5]]); });
  def('panelClose', 'ui', 2, 0, function (r) { return M(0.15, [[P(r, 0.14, 'lp', jf(r, 800), 0, 0.7, 0.03, 0.09, 'pink'), 0, 1], [T('sine', 420, 300, 0.12, 0.01, 0.08), 0, 0.5]]); });
  def('tab', 'ui', 2, 0, function (r) { return mar(jp(r, 784), 0.25, 0.18); });
  def('slot', 'ui', 2, sets('f', [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (c) { return Math.round(700 * Math.pow(2, c / 9)); })), function (r, p) { return M(0.04, [[T('sine', jp(r, p.f), 0, 0.04, 0.003, 0.025), 0, 1], [P(r, 0.008, 'bp', 2500, 0, 1, 0.002, 0.005), 0, 0.2]]); });
  def('itemGet', 'ui', 2, 0, function (r) { return M(0.45, [[mar(jp(r, 784), 0.3, 0.25), 0, 1], [mar(jp(r, 1046), 0.35, 0.3), 0.09, 1]]); }, { wet: 0.1 });
  def('itemSwap', 'ui', 2, 0, function (r) { return M(0.2, [[P(r, 0.1, 'bp', jf(r, 1100), 0, 0.6, 0.02, 0.07), 0, 1], [P(r, 0.1, 'bp', jf(r, 1500), 0, 0.6, 0.02, 0.07), 0.06, 0.8]]); });
  def('toast', 'ui', 2, 0, function (r) { return B(jp(r, 1319), 0.5, 0.45); }, { wet: 0.12 });
  def('confirm', 'ui', 2, 0, function (r) { return M(0.45, [[mar(jp(r, 659), 0.25, 0.2), 0, 1], [mar(jp(r, 988), 0.35, 0.28), 0.09, 1]]); });
  def('nope', 'ui', 2, 0, function (r) { function bump(t) { return M(0.06, [[T('sine', jp(r, 200), 150, 0.06, 0.004, 0.05), 0, 1], [T('sine', 400, 300, 0.05, 0.004, 0.03), 0, 0.3]]); } return M(0.15, [[bump(), 0, 1], [bump(), 0.08, 0.9]]); });

  /* ---------------------------------------------------------------- money and progression */
  def('coin', 'ui', 3, 0, function (r) { return M(0.25, [[T('sine', jp(r, 1568), 0, 0.25, 0.002, 0.22), 0, 1], [T('sine', jp(r, 2093), 0, 0.25, 0.002, 0.22), 0, 0.7], [T('sine', 1568 * 3.1, 0, 0.15, 0.002, 0.1), 0, 0.2], [P(r, 0.03, 'bp', 6000, 0, 4, 0.002, 0.02), 0, 0.06]]); }, { wet: 0.1 });
  def('coinCount', 'ui', 2, sets('f', [0, 1, 2, 3, 4, 5].map(function (s) { return Math.round(900 * Math.pow(1.1225, s)); })), function (r, p) { return M(0.04, [[T('sine', jp(r, p.f), 0, 0.04, 0.003, 0.025), 0, 1], [P(r, 0.006, 'bp', 3500, 0, 1, 0.002, 0.004), 0, 0.2]]); });
  def('purchase', 'ui', 2, 0, function (r) { var parts = [[T('sine', jp(r, 1760), 0, 0.4, 0.003, 0.35), 0, 1]], i; for (i = 0; i < 4; i++) parts.push([T('sine', r.pick([1568, 1976, 2349, 2637]), 0, 0.22, 0.003, 0.18), 0.08 + i * 0.06, 0.5]); return M(0.55, parts); }, { wet: 0.1 });
  def('sell', 'ui', 2, 0, function (r) { return M(0.5, [[T('sine', jp(r, 170), 90, 0.1, 0.004, 0.07), 0, 1], [P(r, 0.08, 'lp', 700, 0, 0.7, 0.003, 0.06, 'pink'), 0, 0.5], [T('sine', 2093, 0, 0.2, 0.003, 0.18), 0.09, 0.5], [T('sine', 2637, 0, 0.2, 0.003, 0.18), 0.15, 0.5], [T('sine', 3136, 0, 0.2, 0.003, 0.18), 0.21, 0.4]]); });
  def('levelUp', 'fan', 2, 0, function (r) {
    var notes = [523.25, 659.25, 783.99, 1046.5], pans = [-0.3, -0.1, 0.1, 0.3], parts = [];
    notes.forEach(function (f, i) {
      var dur = i === 3 ? 0.9 : 0.6, n = D.len(dur), idx = new Float32Array(n), k;
      for (k = 0; k < n; k++) idx[k] = 2 * Math.exp(-k / (SR * 0.15));
      parts.push([D.pan(D.mul(D.fm(n, f, 2, idx), D.ad(n, 0.003, dur)), pans[i]), i * 0.13, 1]);
    });
    parts.push([P(r, 0.7, 'bp', 2500, 5000, 1.2, 0.2, 0.5), 0.35, 0.12]);
    return M(1.4, parts);
  }, { maxDur: 1.8, wet: 0.15 });
  def('goal', 'fan', 2, 0, function (r) { return M(1.3, [[D.pan(warm(523.25, 0.7, 0.6), -0.2), 0, 1], [D.pan(warm(659.25, 0.7, 0.6), 0), 0.16, 1], [D.pan(warm(783.99, 0.9, 0.8), 0.2), 0.32, 1], [D.pan(T('sine', 2637, 0, 0.25, 0.003, 0.2), -0.4), 0.5, 0.25], [D.pan(T('sine', 3136, 0, 0.25, 0.003, 0.2), 0.4), 0.58, 0.25]]); }, { maxDur: 2.5, wet: 0.15 });
  def('pageTurn', 'ui', 3, 0, function (r) {
    var parts = [[P(r, 0.18, 'bp', jf(r, 2200), 0, 0.6, 0.06, 0.12), 0, 1]], i;
    for (i = 0; i < 4; i++) parts.push([P(r, 0.006, 'bp', jf(r, 3500), 0, 2, 0.002, 0.004), r.range(0.02, 0.15), 0.35]);
    return M(0.2, parts);
  });

  /* ---------------------------------------------------------------- farming (param tier / class / crisp) */
  def('till', 'tool', 3, sets('t', [1, 2, 3, 4]), function (r, p) {
    var t = p.t, x = D.filter(D.filter(D.noise(0.1, r, 'pink'), 'bp', jf(r, 800 * (1 + 0.12 * t)), 1), 'lp', 2500, 0.7), gate = new Float32Array(x.length), i, k, s, parts;
    for (i = 0; i < gate.length; i++) gate[i] = 0.3;
    for (k = 0; k < 6; k++) { s = Math.floor(r() * 0.09 * SR); for (i = s; i < s + 132 && i < gate.length; i++) gate[i] = 1; }   // 3 ms grains
    x = nm(D.mul(D.mul(x, gate), D.ad(x.length, 0.004, 0.07)), -6);
    parts = [[T('sine', jp(r, 115 - 7 * t), 70 - 4 * t, 0.13, 0.004, 0.1), 0, 0.5 + 0.12 * t], [x, 0, 0.6 + 0.1 * t]];
    for (k = 0; k < 2 + (r() < 0.5 ? 1 : 0); k++) parts.push([P(r, 0.01, 'hp', 2000, 0, 1, 0.002, 0.006), r.range(0.02, 0.1), 0.06]);
    return M(0.14, parts);
  });
  def('water', 'tool', 3, 0, function (r) {
    var n = D.len(0.6), x = D.mul(D.filter(D.noise(0.6, r, 'white'), 'bp', jf(r, 2200), 0.9), am(r, 0.6, 14)), parts, i;
    x = D.mul(nm(x, -6), D.curve(n, [[0, 0], [0.03, 1], [0.4, 0.8], [0.6, 0]]));
    parts = [[x, 0, 1]];
    for (i = 0; i < 6; i++) parts.push([T('sine', r.range(1200, 2400), 0, 0.02, 0.002, 0.014), r.range(0.05, 0.5), 0.45]);
    return M(0.6, parts);
  });
  def('refill', 'tool', 2, 0, function (r) {
    var parts = [], i, n = D.len(0.5), tr = D.mul(nm(D.mul(D.filter(D.noise(0.5, r, 'white'), 'bp', 2000, 0.9), am(r, 0.5, 16)), -6), D.ad(n, 0.04, 0.45));
    for (i = 0; i < 4; i++) parts.push([T('sine', jp(r, 700 - 80 * i), (700 - 80 * i) * 0.6, 0.05, 0.004, 0.04), i * 0.07, 0.8]);
    parts.push([tr, 0.05, 0.35]);
    return M(0.55, parts);
  });
  def('plant', 'tool', 3, 0, function (r) { return M(0.2, [[T('sine', jp(r, 160), 120, 0.06, 0.004, 0.05), 0, 1], [P(r, 0.08, 'bp', jf(r, 1200), 0, 0.7, 0.004, 0.05), 0, 0.5], [P(r, 0.015, 'bp', 3500, 0, 2, 0.002, 0.01), 0.09, 0.3], [P(r, 0.015, 'bp', 3800, 0, 2, 0.002, 0.01), 0.13, 0.25]]); });
  def('fertilize', 'tool', 3, 0, function (r) { var parts = [], i; for (i = 0; i < 30; i++) parts.push([P(r, 0.005, 'bp', r.range(2000, 4500), 0, 1.5, 0.002, 0.003), 0.45 * Math.pow(r(), 2), r.range(0.3, 1)]); return M(0.5, parts); });
  def('harvest', 'tool', 3, [{ k: 'leaf', c: 'leaf' }, { k: 'fruit', c: 'fruit' }, { k: 'root', c: 'root' }], function (r, p) {
    var ps = p.c === 'leaf' ? 0.8 : p.c === 'fruit' ? 1.15 : 0.6, parts = [[P(r, 0.04, 'bp', 2500 * ps, 0, 0.8, 0.002, 0.025), 0, 0.6], [T('sine', jp(r, 520 * ps), 780 * ps, 0.09, 0.004, 0.07), 0.01, 1]];
    if (p.c === 'root') parts.push([T('sine', 130, 80, 0.12, 0.004, 0.09), 0, 1.1], [P(r, 0.08, 'bp', 1800, 0, 1, 0.003, 0.05), 0.02, 0.6]);
    else parts.push([P(r, 0.15, 'hp', 3000, 0, 0.7, 0.01, 0.1), 0.03, p.c === 'leaf' ? 0.35 : 0.18], [T('sine', 420 * ps, 900 * ps, 0.07, 0.003, 0.05), 0.09, 0.5]);
    return M(0.25, parts);
  });
  def('clear', 'tool', 2, 0, function (r) { var parts = [[T('sine', 120, 90, 0.08, 0.004, 0.06), 0, 0.3]], i; for (i = 0; i < 5; i++) parts.push([P(r, 0.02, 'bp', jf(r, 1500), 0, 1, 0.003, 0.012), r.range(0, 0.12), 0.7]); return M(0.2, parts); });
  def('sprinkler', 'tool', 2, 0, function (r) { return M(0.95, [[P(r, 0.01, 'bp', 2800, 0, 2, 0.002, 0.006), 0.01, 0.8], [P(r, 0.01, 'bp', 2600, 0, 2, 0.002, 0.006), 0.11, 0.8], [nm(P(r, 0.8, 'bp', 3000, 0, 0.6, 0.05, 0.6, 'pink'), -8), 0.15, 0.6]]); });
  def('eat', 'tool', 2, [{ k: 'crisp', f: 2200, g: 4 }, { k: 'soft', f: 1400, g: 0 }], function (r, p) {
    function crunch() { var parts = [[P(r, 0.05, 'bp', jf(r, p.f), 0, 1.2, p.g ? 0.002 : 0.006, 0.03), 0, 1]], i; for (i = 0; i < p.g; i++) parts.push([P(r, 0.004, 'bp', 3000, 0, 1.5, 0.002, 0.002), r.range(0, 0.05), 0.5]); return M(0.06, parts); }
    return M(0.35, [[crunch(), 0, 1], [crunch(), 0.1, 0.9], [T('sine', 200, 120, 0.1, 0.01, 0.07), 0.22, 0.5]]);
  });
  def('sparkle', 'ui', 2, 0, function (r) { return M(0.5, [[D.pan(T('sine', jp(r, 2100), 0, 0.3, 0.003, 0.25), -0.5), 0, 1], [D.pan(T('sine', jp(r, 3150), 0, 0.3, 0.003, 0.25), 0), 0.08, 0.8], [D.pan(T('sine', jp(r, 4200), 0, 0.3, 0.003, 0.25), 0.5), 0.16, 0.6]]); }, { sparkle: true, wet: 0.12 });

  /* ---------------------------------------------------------------- house, shop, progression */
  function creak(r, f0, f1, dur) { var n = D.len(dur); return nm(D.mul(D.filter(D.noise(dur, r, 'white'), 'bp', D.glide(f0, f1, n), 8), D.curve(n, [[0, 0], [0.08, 1], [dur - 0.08, 0.8], [dur, 0]])), -6); }
  function thud(r) { return M(0.1, [[T('sine', jp(r, 90), 60, 0.1, 0.004, 0.08), 0, 1], [P(r, 0.08, 'lp', 400, 0, 0.7, 0.003, 0.05, 'pink'), 0, 0.5]]); }
  function tick(r, t, g) { return [P(r, 0.008, 'bp', jf(r, 2500), 0, 2, 0.002, 0.005), t, g]; }
  def('door', 'tool', 3, [{ k: 'open', o: 1 }, { k: 'close', o: 0 }], function (r, p) {
    return p.o ? M(0.7, [tick(r, 0, 0.7), tick(r, 0.045, 0.6), [creak(r, 300, 500, 0.35), 0.09, 0.5], [thud(r), 0.4, 0.9]])
      : M(0.55, [[creak(r, 500, 300, 0.25), 0, 0.5], [thud(r), 0.25, 0.9], tick(r, 0.27, 0.6), tick(r, 0.32, 0.5)]);
  }, { wet: 0.1 });
  def('chest', 'tool', 2, 0, function (r) { return M(0.8, [[creak(r, 250, 450, 0.3), 0, 0.5], [T('sine', 100, 70, 0.12, 0.004, 0.09), 0.28, 1], [T('sine', 2093, 0, 0.25, 0.003, 0.2), 0.33, 0.4], [T('sine', 2637, 0, 0.25, 0.003, 0.2), 0.4, 0.35]]); }, { wet: 0.12 });
  def('shopBell', 'ui', 2, 0, function (r) { return M(0.7, [[T('sine', jp(r, 2637), 0, 0.7, 0.003, 0.55), 0, 1], [T('sine', jp(r, 3520), 0, 0.7, 0.003, 0.45), 0, 0.6]]); }, { wet: 0.12 });
  def('sleep', 'tool', 1, 0, function (r) {
    var notes = [659.25, 783.99, 1046.5, 783.99], parts = notes.map(function (f, i) { return [box(f, 1.1, 0.9), i * 0.5, 1]; });
    return D.mul(M(2.45, parts), D.curve(D.len(2.45), [[0, 1], [1.6, 1], [2.45, 0]]));
  }, { maxDur: 2.5, wet: 0.2 });
  def('morning', 'tool', 2, 0, function (r) { return M(0.95, [[T('sine', jp(r, 3000), 4200, 0.09, 0.01, 0.07), 0, 0.5], [T('sine', jp(r, 3300), 4500, 0.09, 0.01, 0.07), 0.13, 0.45], [B(1175, 0.6, 0.45), 0.3, 1]]); }, { wet: 0.1 });
  def('daySummary', 'fan', 2, 0, function (r) { return M(0.95, [392, 523.25, 659.25, 783.99].map(function (f, i) { return [warm(f, i === 3 ? 0.6 : 0.4, i === 3 ? 0.5 : 0.35), i * 0.1, 1]; })); }, { wet: 0.12 });
  def('cook', 'tool', 2, 0, function (r) {
    var n = D.len(0.5), x = D.filter(D.noise(0.5, r, 'white'), 'bp', 3000, 0.7), i, b, v = 1;
    for (i = 0; i < n; i++) { if (i % 90 === 0) v = 0.35 + 0.65 * r(); x[i] *= v; }
    return M(0.55, [[nm(D.mul(x, D.ad(n, 0.03, 0.4)), -6), 0, 0.6], [T('sine', 2400, 0, 0.15, 0.002, 0.1), 0.05, 0.4], [T('sine', 3700, 0, 0.08, 0.002, 0.05), 0.05, 0.2]]);
  });
  def('ready', 'ui', 2, 0, function (r) { return B(jp(r, 1976), 0.6, 0.5); }, { wet: 0.12 });
  def('notebookEntry', 'ui', 2, 0, function (r) { return M(0.5, [[T('sine', 2093, 0, 0.22, 0.003, 0.2), 0, 0.6], [T('sine', 2637, 0, 0.22, 0.003, 0.2), 0.07, 0.5], [T('sine', 3136, 0, 0.22, 0.003, 0.2), 0.14, 0.4], [P(r, 0.1, 'bp', 2000, 0, 0.6, 0.01, 0.07), 0.12, 0.4]]); }, { wet: 0.1 });

  /* ---------------------------------------------------------------- footsteps (11.5B): 4 variants per surface, quiet (-22..-18 dBFS) */
  function foot(id, peak, fn, x) { def(id, 'foot', 4, 0, fn, x); Bank.recipes[id].peak = peak; }
  function knock(r, fs, dur, t60, g) { return M(dur, fs.map(function (f, i) { return [T('sine', jp(r, f), 0, dur, 0.003, t60 * (1 - 0.2 * i)), 0, g[i]]; })); }
  var FC = { cd: 0.09 };
  /* Stage 15A-2 (A5): soft leafy rustle, 6 variants: 3-6 band-passed noise grains (1.8-5 kHz, 20-60 ms), faint 300-700 Hz brushing body,
     rare stem-snap tick, everything low-passed at the top so it sits behind footsteps. Sfx bus, 0.3 s cooldown, peak -17 dBFS. */
  def('rustle', 'foot', 6, 0, function (r) {
    var dur = 0.3, parts = [], k = 3 + Math.floor(r() * 4), t = 0.01, i, gd, top, body;
    for (i = 0; i < k; i++) {
      gd = r.range(0.02, 0.06);
      parts.push([P(r, gd, 'bp', r.range(1800, 5000), r.range(1800, 4200), 0.9, gd * 0.3, gd * 0.55, 'pink'), t, r.range(0.45, 1)]);
      t += r.range(0.025, 0.06);
    }
    body = P(r, t + 0.06, 'bp', r.range(300, 700), r.range(300, 600), 0.8, 0.05, 0.12, 'pink');
    parts.push([body, 0, 0.35]);
    if (r() < 0.3) parts.push([P(r, 0.006, 'bp', r.range(1800, 2600), 0, 2, 0.001, 0.004), r.range(0.05, t), 0.3]);
    top = M(Math.min(0.42, t + 0.12), parts);
    return D.filter(top, 'lp', 4200, 0.7);
  }, { cd: 0.3 });
  Bank.recipes.rustle.peak = -17;
  foot('stepGrass', -20, function (r) { return M(0.08, [[P(r, 0.07, 'bp', jf(r, 2300), 0, 0.5, 0.008, 0.045), 0, 1], [T('sine', jp(r, 120), 90, 0.03, 0.004, 0.025), 0, 0.6]]); }, FC);
  foot('stepPath', -19, function (r) { var parts = [[P(r, 0.05, 'bp', jf(r, 1800), 0, 1, 0.003, 0.03), 0, 1]], i; for (i = 0; i < 3; i++) parts.push([P(r, 0.005, 'bp', jf(r, 2500), 0, 1.5, 0.002, 0.003), r.range(0, 0.05), 0.5]); return M(0.07, parts); }, FC);
  foot('stepSand', -22, function (r) { return M(0.1, [[P(r, 0.09, 'lp', jf(r, 1300), 0, 0.7, 0.015, 0.06, 'pink'), 0, 1], [T('sine', jp(r, 100), 80, 0.04, 0.005, 0.03), 0, 0.35]]); }, FC);
  foot('stepStone', -18, function (r) { return M(0.07, [[T('sine', jp(r, 900), 0, 0.012, 0.002, 0.008), 0, 0.5], [T('sine', jp(r, 150), 95, 0.05, 0.003, 0.04), 0, 0.8], [P(r, 0.012, 'bp', jf(r, 2800), 0, 1.5, 0.002, 0.007), 0, 0.3]]); }, FC);
  foot('stepWood', -19, function (r) { return M(0.1, [[knock(r, [180, 260, 410], 0.1, 0.08, [1, 0.7, 0.5]), 0, 1], [P(r, 0.01, 'bp', 2000, 0, 1.5, 0.002, 0.006), 0, 0.2]]); }, FC);
  foot('stepCreak', -19, function (r) { return M(0.32, [[knock(r, [180, 260, 410], 0.1, 0.08, [1, 0.7, 0.5]), 0, 1], [creak(r, 320, 480, 0.22), 0.05, 0.28]]); }, { cd: 0.09, maxDur: 0.5 });
  foot('stepRoom', -20, function (r) { return M(0.12, [[knock(r, [140, 220, 330], 0.12, 0.1, [1, 0.6, 0.4]), 0, 1], [P(r, 0.05, 'lp', 900, 0, 0.7, 0.01, 0.03, 'pink'), 0, 0.2]]); }, FC);
  foot('stepSnow', -21, function (r) { var parts = [[T('sine', jp(r, 110), 80, 0.04, 0.005, 0.03), 0, 0.3]], i; for (i = 0; i < 9; i++) parts.push([P(r, 0.012, 'bp', r.range(2400, 4000), 0, 1.2, 0.002, 0.008), r.range(0.005, 0.09), r.range(0.4, 1)]); return M(0.11, parts); }, FC);

  /* ---------------------------------------------------------------- fishing (11.5B) */
  def('cast', 'fish', 3, 0, function (r) { return M(0.3, [[nm(P(r, 0.25, 'bp', jf(r, 600), 2200, 1, 0.05, 0.2), -6), 0, 1], [T('sine', jp(r, 900), 300, 0.1, 0.004, 0.07), 0.02, 0.35], [T('sine', 2800, 0, 0.2, 0.01, 0.15), 0.05, 0.06]]); });
  def('plop', 'fish', 3, 0, function (r) { return M(0.16, [[T('sine', jp(r, 380), 180, 0.09, 0.004, 0.07), 0, 1], [T('sine', jp(r, 700), 1100, 0.04, 0.003, 0.03), 0.04, 0.4], [P(r, 0.12, 'bp', jf(r, 1500), 700, 0.9, 0.004, 0.08), 0, 0.5]]); }, { wet: 0.08 });
  function splash(r, dur, th, dr, g) {
    var parts = [[nm(P(r, dur, 'bp', jf(r, 1500), 650, 0.9, 0.004, dur * 0.7), -6), 0, 0.8 * g], [T('sine', jp(r, th), th * 0.5, dur * 0.3, 0.004, dur * 0.22), 0, 1], [T('sine', 700, 1100, 0.04, 0.003, 0.03), 0.04, 0.35]], i;
    for (i = 0; i < dr; i++) parts.push([T('sine', r.range(1000, 2200), 0, 0.02, 0.002, 0.014), r.range(0.06, dur * 0.9), 0.22]);
    return M(dur + 0.04, parts);
  }
  def('splashS', 'fish', 3, 0, function (r) { return splash(r, 0.25, 260, 2, 0.7); }, { wet: 0.08 });
  def('splashM', 'fish', 3, 0, function (r) { return splash(r, 0.45, 180, 5, 0.9); }, { wet: 0.1 });
  def('splashL', 'fish', 3, 0, function (r) { return splash(r, 0.8, 120, 9, 1); }, { wet: 0.12 });
  def('charge', 'fish', 2, 0, function (r) { return M(0.09, [[T('sine', jp(r, 620), 700, 0.09, 0.006, 0.06), 0, 1], [T('sine', 1240, 0, 0.06, 0.006, 0.03), 0, 0.15]]); }, { cd: 0.05 });
  def('bite', 'fish', 3, 0, function (r) { return M(0.4, [[T('sine', jp(r, 500), 900, 0.07, 0.004, 0.05), 0, 1], [T('sine', jp(r, 500), 900, 0.07, 0.004, 0.05), 0.1, 1], [T('sine', 700, 560, 0.18, 0.004, 0.12), 0.2, 0.22], [P(r, 0.01, 'bp', 2400, 0, 2, 0.002, 0.006), 0.2, 0.15]]); });
  def('hook', 'fish', 2, 0, function (r) { return M(0.25, [[P(r, 0.012, 'bp', 3000, 0, 1.5, 0.002, 0.008), 0, 0.8], [T('sine', jp(r, 1200), 400, 0.05, 0.003, 0.035), 0, 0.6], [nm(P(r, 0.12, 'bp', 800, 3000, 1.2, 0.01, 0.08), -6), 0.04, 0.6]]); });
  def('reelTick', 'fish', 4, 0, function (r) { return P(r, 0.016, 'bp', jf(r, 2100), 0, 2.5, 0.003, 0.005); }, { cd: 0.03, peak: -12 });
  def('tension', 'fish', 3, [{ k: '0', f: 260 }, { k: '1', f: 340 }, { k: '2', f: 430 }], function (r, p) { return M(0.4, [[creak(r, jp(r, p.f), p.f * 1.2, 0.35), 0, 1], [creak(r, p.f * 1.5, p.f * 1.7, 0.3), 0.04, 0.4]]); }, { cd: 0.2 });
  var NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
  function fanfare(r, notes, gap, ring, sparkle) {
    var parts = [], tot = notes.length * gap + ring;
    notes.forEach(function (f, i) { parts.push([D.pan(B(f, ring, ring * 0.7), -0.3 + 0.6 * i / Math.max(1, notes.length - 1)), i * gap, 1]); });
    if (sparkle) [2637, 3136, 3520].forEach(function (f, i) { parts.push([D.pan(T('sine', f, 0, 0.3, 0.003, 0.25), i - 1 ? 0.4 : -0.4), notes.length * gap + 0.02 * i, 0.22]); });
    return [M(tot + 0.2, parts), tot + 0.2];
  }
  def('catch', 'fan', 1, sets('t', [1, 2, 3, 4, 5]), function (r, p) {
    var t = p.t, o;
    if (t === 5) {   // legendary: melody + pad swell, 2.5 s
      var mel = [523.25, 659.25, 783.99, 659.25, 1046.5, 1318.5, 1046.5, 1568], parts = [], n = D.len(2.4);
      mel.forEach(function (f, i) { parts.push([D.pan(B(f, 0.8, 0.55), -0.4 + 0.8 * i / 7), i * 0.16, 1]); });
      [261.63, 329.63, 392.0].forEach(function (f, i) { parts.push([D.mul(D.osc('sine', f, n), D.curve(n, [[0, 0], [1.1, 0.55], [1.7, 0.45], [2.4, 0]])), 0.05 * i, 0.45]); });
      [2637, 3136, 3520, 4186].forEach(function (f, i) { parts.push([D.pan(T('sine', f, 0, 0.3, 0.003, 0.25), i % 2 ? 0.5 : -0.5), 1.3 + i * 0.09, 0.2]); });
      return M(2.4, parts);
    }
    o = fanfare(r, NOTES.slice(0, t < 4 ? t + 2 : 6).slice(t === 1 ? 0 : 0, t === 1 ? 3 : t === 2 ? 4 : t === 3 ? 5 : 6), t < 3 ? 0.1 : 0.09, t < 3 ? 0.5 : 0.65, t >= 3);
    return o[0];
  }, { wet: 0.12, maxDur: 2.5 });
  def('escape', 'fish', 2, 0, function (r) { return M(0.4, [[nm(P(r, 0.3, 'bp', 1600, 450, 1, 0.02, 0.2), -6), 0, 0.55], [T('sine', 500, 180, 0.25, 0.01, 0.2), 0, 0.35], [P(r, 0.02, 'bp', 1800, 0, 2, 0.003, 0.012), 0.2, 0.3], [P(r, 0.02, 'bp', 1500, 0, 2, 0.003, 0.012), 0.27, 0.2]]); });
  def('junk', 'fish', 2, 0, function (r) {
    var n = D.len(0.35), f = new Float32Array(n), i, t;
    for (i = 0; i < n; i++) { t = i / SR; f[i] = 170 + 150 * Math.exp(-t / 0.1) * (1 + 0.25 * Math.sin(2 * Math.PI * 16 * t)); }
    return M(0.4, [[D.mul(D.osc('sine', f, n), D.ad(n, 0.005, 0.2)), 0, 1], [thud(r), 0.18, 0.7]]);
  });
  def('sit', 'tool', 3, 0, function (r) { return M(0.25, [[P(r, 0.12, 'bp', jf(r, 1000), 0, 0.5, 0.02, 0.08), 0, 0.8], [T('sine', 120, 70, 0.12, 0.004, 0.09), 0, 0.5], [creak(r, 260, 200, 0.14), 0.08, 0.25]]); });
  def('stand', 'tool', 3, 0, function (r) { return M(0.25, [[P(r, 0.1, 'bp', jf(r, 1300), 0, 0.5, 0.01, 0.07), 0, 0.7], [creak(r, 200, 280, 0.14), 0, 0.3], [T('sine', 110, 80, 0.08, 0.004, 0.06), 0.12, 0.35]]); });

  /* ---------------------------------------------------------------- dialogue blips (11.5B): base 330 Hz, pitch by playbackRate */
  def('talk', 'ui', 4, 0, function (r) { var d = r.range(0.048, 0.068), fr = r.range(2.2, 2.8); return M(d, [[T('sine', jp(r, 330), 0, d, 0.006, d * 0.5), 0, 1], [T('tri', 330 * fr, 0, d, 0.006, d * 0.4), 0, 0.28]]); }, { cd: 0.05 });

  /* ---------------------------------------------------------------- ambient one-shots (11.5C): group animal, played by audio.js with pan + distance gain */
  function chirp(r, f0, f1, dur, vib, g) {
    var n = D.len(dur), f = D.glide(f0, f1, n), f2 = new Float32Array(n), i, ph = r() * 6.28;
    for (i = 0; i < n; i++) { var m = 1 + (vib || 0.02) * Math.sin(ph + i / SR * 6.28 * 38); f[i] *= m; f2[i] = f[i] * 2; }
    var env = D.ad(n, 0.008, dur * 0.45);
    return M(dur, [[D.mul(D.osc('sine', f, n), env), 0, 1], [D.mul(D.osc('sine', f2, n), D.ad(n, 0.008, dur * 0.3)), 0, 0.18 * (g || 1)]]);
  }
  def('bird', 'animal', 2, sets('sp', [1, 2, 3, 4]), function (r, p) {
    var q = jp(r, 1), parts = [], i;
    if (p.sp === 1) { parts = [[chirp(r, 3500 * q, 2800 * q, 0.1, 0.02), 0, 1], [chirp(r, 3300 * q, 2600 * q, 0.1, 0.02), 0.16, 0.85]]; return M(0.4, parts); }
    if (p.sp === 2) { for (i = 0; i < 6; i++) parts.push([chirp(r, (i % 2 ? 3300 : 2800) * q, (i % 2 ? 2900 : 3400) * q, 0.05, 0.01), i * 0.075, 0.9 - i * 0.07]); return M(0.55, parts); }
    if (p.sp === 3) { [0, 0.34, 0.62].forEach(function (t, k) { parts.push([T('sine', 520 * q, 470 * q, k === 2 ? 0.45 : 0.28, 0.05, 0.2), t, k === 2 ? 0.9 : 1]); parts.push([T('sine', 1040 * q, 940 * q, 0.25, 0.05, 0.12), t, 0.14]); }); return M(1.1, parts); }
    for (i = 0; i < 3; i++) parts.push([chirp(r, 2400 * q, 3300 * q, 0.1, 0.015), i * 0.26, 1 - i * 0.12], [chirp(r, 3300 * q, 2700 * q, 0.08, 0.015), i * 0.26 + 0.1, 0.8 - i * 0.1]);
    return M(0.85, parts);
  }, { wet: 0.15, sparkle: true, cd: 0.2 });
  def('frog', 'animal', 2, 0, function (r) { var q = jp(r, 1); return M(0.5, [0, 1, 2].map(function (i) { return [M(0.1, [[T('sine', 430 * q, 330 * q, 0.1, 0.012, 0.07), 0, 1], [P(r, 0.1, 'bp', 700, 0, 2, 0.01, 0.06), 0, 0.15]]), i * 0.11, 1 - i * 0.12]; })); }, { wet: 0.15, cd: 0.2 });
  def('owl', 'animal', 2, 0, function (r) { var q = jp(r, 1); return M(1.1, [[T('sine', 370 * q, 340 * q, 0.34, 0.07, 0.22), 0, 1], [T('sine', 740 * q, 680 * q, 0.3, 0.07, 0.1), 0, 0.12], [T('sine', 355 * q, 310 * q, 0.55, 0.08, 0.38), 0.5, 0.9]]); }, { wet: 0.25, cd: 0.5 });
  def('cricket', 'animal', 2, 0, function (r) {
    var q = jp(r, 1), parts = [], g, k;
    for (g = 0; g < 4; g++) for (k = 0; k < 3; k++) parts.push([T('sine', 3900 * q, 0, 0.03, 0.004, 0.02), g * 0.24 + k * 0.045, 0.7 + 0.3 * r()]);
    return M(1, parts);
  }, { sparkle: true, cd: 0.3 });
  def('bee', 'animal', 2, 0, function (r) {
    var n = D.len(0.9), f = new Float32Array(n), i, base = jp(r, 190);
    for (i = 0; i < n; i++) f[i] = base * (1 + 0.04 * Math.sin(i / SR * 6.28 * 9));
    var f2 = f.map(function (v) { return v * 2; }), env = D.curve(n, [[0, 0], [0.25, 1], [0.6, 0.9], [0.9, 0]]);
    return D.mul(M(0.9, [[D.osc('sine', f, n), 0, 1], [D.osc('tri', f2, n), 0, 0.35], [D.filter(D.noise(0.9, r, 'pink'), 'bp', 620, 2), 0, 0.5]]), env);
  }, { cd: 0.5 });
  def('flutter', 'animal', 2, 0, function (r) {
    var n = D.len(0.35), x = D.filter(D.noise(0.35, r, 'pink'), 'bp', jf(r, 1300), 0.8), i;
    for (i = 0; i < n; i++) x[i] *= 0.55 + 0.45 * Math.sin(i / SR * 6.28 * 24);
    return D.mul(x, D.ad(n, 0.05, 0.18));
  }, { cd: 0.3 });
  def('leaf', 'animal', 2, 0, function (r) { var n = D.len(1), x = D.filter(D.noise(1, r, 'pink'), 'bp', D.glide(1400, 2400, n), 0.6); return D.mul(x, D.curve(n, [[0, 0], [0.35, 1], [0.6, 0.7], [1, 0]])); }, { cd: 0.5 });
  def('lap', 'animal', 3, 0, function (r) {
    var n = D.len(0.9), x = D.filter(D.noise(0.9, r, 'pink'), 'lp', jf(r, 900), 0.7);
    return M(0.9, [[D.mul(x, D.curve(n, [[0, 0], [0.3, 1], [0.55, 0.3], [0.75, 0.7], [0.9, 0]])), 0, 1], [T('sine', 600, 950, 0.03, 0.004, 0.02), 0.62, 0.12]]);
  }, { cd: 0.5, wet: 0.1 });
  def('chime', 'animal', 3, 0, function (r) {
    var sc = [1568, 1760, 2093, 2349], t = 0, parts = [], i;
    for (i = 0; i < 3; i++) { parts.push([B(sc[Math.floor(r() * 4)] * jp(r, 1), 0.7, 0.45), t, 0.9 - i * 0.2]); t += 0.12 + r() * 0.2; }
    return M(1.15, parts);
  }, { sparkle: true, wet: 0.15, cd: 0.5 });
  def('clockTick', 'animal', 2, 0, function (r) { var f = jp(r, 1500); return M(0.04, [[T('sine', f, 0, 0.03, 0.002, 0.012), 0, 1], [P(r, 0.01, 'bp', 2600, 0, 2, 0.002, 0.005), 0, 0.3]]); }, { cd: 0.5 });

  Bank.alias = { levelup: ['levelUp'], splash: ['splashM'], step: ['stepGrass'], stepWood: ['stepWood'], stepStone: ['stepStone'] };

  /* ---------------------------------------------------------------- render + job list */
  function hash(s) { var h = 2166136261, i; for (i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  Bank.find = function (id, k) { var rc = Bank.recipes[id]; if (!rc) return null; for (var i = 0; i < rc.sets.length; i++) if (rc.sets[i].k === (k || '')) return rc.sets[i]; return rc.sets[0]; };
  Bank.resolve = function (name, k) { var a = Bank.alias[name], id = a ? a[0] : name; if (!Bank.recipes[id]) return null; return { id: id, k: k || (a && a[1]) || Bank.recipes[id].sets[0].k }; };
  Bank.render = function (id, k, v) {
    var rc = Bank.recipes[id], p = Bank.find(id, k), r = D.rng(hash(id + ':' + p.k) + (v || 0) * 7919), x = rc.make(r, p, D), ch = Array.isArray(x) ? x : [x], out = ch.map(function (c) { return D.filter(D.filter(c, 'hp', 80, 0.707), 'lp', 8500, 0.707); });
    out = out.length > 1 ? out : out[0];
    D.normalize(out, rc.peak);
    var cap = RMS[rc.group], sq = 0, m0 = Array.isArray(out) ? out[0] : out, i, rm;   // mix pass: sustained sounds must not out-shout the peaky ones
    for (i = 0; i < m0.length; i++) sq += m0[i] * m0[i];
    rm = 10 * Math.log10(sq / m0.length + 1e-12);
    if (cap !== undefined && rm > cap) D.normalize(out, rc.peak - (rm - cap));
    D.fade(out, 2);
    return out;
  };
  Bank.jobs = function (quick) {
    var list = [];
    Bank.ids.forEach(function (id) { var rc = Bank.recipes[id], v, s; for (s = 0; s < rc.sets.length; s++) for (v = 0; v < (quick ? 1 : rc.variants); v++) list.push({ id: id, k: rc.sets[s].k, v: v, group: rc.group }); });
    return list.sort(function (a, b) { return ORDER[a.group] - ORDER[b.group]; });   // stable enough: ui, footsteps, tools, rest
  };
  Bank.order = ORDER;

  if (typeof module !== 'undefined' && module.exports) module.exports = Bank;
  else if (root && root.Game) root.Game.SfxBank = Bank;
})(typeof window !== 'undefined' ? window : this);
