/* Togie Valley - dsp.js (Stage 11.5A): pure JS DSP, no Web Audio. Runs in the browser (Game.Dsp) and in Node (module.exports).
 * 44100 Hz, Float32Array, stereo = [L, R]. Freq/cutoff args accept a number or a per-sample Float32Array.
 */
(function (root) {
  'use strict';
  var SR = 44100, TAU = Math.PI * 2, D = { SR: SR };
  function at(v, i) { return typeof v === 'number' ? v : v[i]; }
  D.len = function (sec) { return Math.max(1, Math.round(sec * SR)); };
  D.buf = function (sec) { return new Float32Array(D.len(sec)); };
  D.db = function (x) { return Math.pow(10, x / 20); };

  /* seeded rng (mulberry32) with helpers */
  D.rng = function (seed) {
    var a = seed >>> 0;
    var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = function (lo, hi) { return lo + (hi - lo) * f(); };
    f.jit = function (v, pct) { return v * (1 + (f() * 2 - 1) * pct); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    return f;
  };

  /* noise: kind white | pink | brown */
  D.noise = function (sec, r, kind) {
    var n = D.len(sec), o = new Float32Array(n), i, w, b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (i = 0; i < n; i++) {
      w = r() * 2 - 1;
      if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; o[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25; }
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; o[i] = last * 3.5; }
      else o[i] = w;
    }
    return o;
  };

  /* oscillators: sine | tri | saw | square (polyBLEP); f = Hz number or curve */
  function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
  D.osc = function (type, f, n, ph0) {
    var o = new Float32Array(n), ph = ph0 || 0, i, dt, v;
    for (i = 0; i < n; i++) {
      dt = at(f, i) / SR;
      if (type === 'tri') v = 4 * Math.abs(ph - 0.5) - 1;
      else if (type === 'saw') v = 2 * ph - 1 - blep(ph, dt);
      else if (type === 'square') v = (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep((ph + 0.5) % 1, dt);
      else v = Math.sin(TAU * ph);
      o[i] = v; ph += dt; if (ph >= 1) ph -= 1;
    }
    return o;
  };
  D.fm = function (n, fc, ratio, idx) {   // idx: number or curve (radians)
    var o = new Float32Array(n), pc = 0, pm = 0, i, f;
    for (i = 0; i < n; i++) { f = at(fc, i); o[i] = Math.sin(TAU * pc + at(idx, i) * Math.sin(TAU * pm)); pc += f / SR; pm += f * ratio / SR; }
    return o;
  };
  D.glide = function (f0, f1, n) { var o = new Float32Array(n), i, k = n > 1 ? n - 1 : 1; for (i = 0; i < n; i++) o[i] = f0 * Math.pow(f1 / f0, i / k); return o; };

  /* envelopes: T = time to -60 dB (s) */
  D.ad = function (n, a, T) {
    var o = new Float32Array(n), na = Math.max(1, Math.round(a * SR)), k = 6.9078 / (T * SR), i;
    for (i = 0; i < n; i++) o[i] = i < na ? i / na : Math.exp(-(i - na) * k);
    return o;
  };
  D.adsr = function (n, a, d, s, rel) {
    var o = new Float32Array(n), na = Math.round(a * SR), nd = Math.round(d * SR), nr = Math.round(rel * SR), i, v;
    for (i = 0; i < n; i++) {
      if (i < na) v = i / na; else if (i < na + nd) v = 1 - (1 - s) * (i - na) / nd; else v = s;
      if (i > n - nr) v *= (n - i) / nr;
      o[i] = v;
    }
    return o;
  };
  D.curve = function (n, pts) {   // pts [[t sec, v], ...] linear
    var o = new Float32Array(n), j = 0, i, t, p, q;
    for (i = 0; i < n; i++) {
      t = i / SR; while (j < pts.length - 2 && t > pts[j + 1][0]) j++;
      p = pts[j]; q = pts[j + 1]; o[i] = t >= q[0] ? q[1] : t <= p[0] ? p[1] : p[1] + (q[1] - p[1]) * (t - p[0]) / (q[0] - p[0]);
    }
    return o;
  };
  D.mul = function (x, y) { var n = Math.min(x.length, y.length), i; for (i = 0; i < n; i++) x[i] *= y[i]; return x; };
  D.scale = function (x, g) { for (var i = 0; i < x.length; i++) x[i] *= g; return x; };

  /* biquad filter: type lp hp bp notch peak; fc number or curve (coefs refreshed every 8 samples); q; gainDb for peak */
  D.filter = function (x, type, fc, q, gainDb) {
    var n = x.length, o = new Float32Array(n), x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, i, w, c, s, al, a0, f, A = Math.pow(10, (gainDb || 0) / 40), v;
    q = q || 0.707;
    for (i = 0; i < n; i++) {
      if ((i & 7) === 0) {
        f = Math.min(Math.max(at(fc, i), 20), SR * 0.45); w = TAU * f / SR; c = Math.cos(w); s = Math.sin(w); al = s / (2 * q);
        if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
        else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
        else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
        else if (type === 'notch') { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
        else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
        b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
      }
      v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; o[i] = v;
    }
    return o;
  };

  /* mini reverb (4 combs + 2 allpass); returns n + tail samples */
  D.reverb = function (x, wet, t60) {
    var n = x.length + Math.round(SR * (t60 || 0.3)), o = new Float32Array(n), acc = new Float32Array(n), i, j, d, g, buf, k, v, damp, DL = [1103, 1427, 1789, 2111];
    for (j = 0; j < 4; j++) {
      d = DL[j]; g = Math.pow(0.001, d / (SR * (t60 || 0.3))); buf = new Float32Array(d); k = 0; damp = 0;
      for (i = 0; i < n; i++) { v = buf[k]; damp = damp * 0.4 + v * 0.6; buf[k] = (i < x.length ? x[i] : 0) + damp * g; acc[i] += v * 0.25; k = (k + 1) % d; }
    }
    [[347, 0.7], [113, 0.7]].forEach(function (ap) {
      var b = new Float32Array(ap[0]), p = 0, y, z;
      for (var q = 0; q < n; q++) { z = b[p]; y = -ap[1] * acc[q] + z; b[p] = acc[q] + ap[1] * y; acc[q] = y; p = (p + 1) % ap[0]; }
    });
    for (i = 0; i < n; i++) o[i] = (i < x.length ? x[i] : 0) + acc[i] * wet;
    return o;
  };
  D.softclip = function (x, drive) { var d = drive || 1, nrm = Math.tanh(d), i; for (i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * d) / nrm; return x; };

  /* mono -> stereo, constant power; p in -1..1 */
  D.pan = function (x, p) { var a = (p + 1) * Math.PI / 4, l = Math.cos(a), r = Math.sin(a), L = new Float32Array(x.length), R = new Float32Array(x.length), i; for (i = 0; i < x.length; i++) { L[i] = x[i] * l; R[i] = x[i] * r; } return [L, R]; };

  /* mix(sec, [[buf mono|stereo, atSec, gain], ...]) -> mono, or stereo if any part is stereo */
  D.mix = function (sec, parts) {
    var n = D.len(sec), st = parts.some(function (p) { return Array.isArray(p[0]); }), L = new Float32Array(n), R = st ? new Float32Array(n) : null;
    parts.forEach(function (p) {
      var b = p[0], o = Math.round((p[1] || 0) * SR), g = p[2] === undefined ? 1 : p[2], bl = Array.isArray(b) ? b[0] : b, br = Array.isArray(b) ? b[1] : b, i, m = Math.min(bl.length, n - o);
      for (i = 0; i < m; i++) { L[o + i] += bl[i] * g; if (st) R[o + i] += br[i] * g; }
    });
    return st ? [L, R] : L;
  };

  D.peak = function (x) { var ch = Array.isArray(x) ? x : [x], p = 0, i, c, v; for (c = 0; c < ch.length; c++) for (i = 0; i < ch[c].length; i++) { v = Math.abs(ch[c][i]); if (v > p) p = v; } return p; };
  D.normalize = function (x, peakDb) { var p = D.peak(x), g = p > 1e-9 ? D.db(peakDb) / p : 0, ch = Array.isArray(x) ? x : [x]; ch.forEach(function (c) { D.scale(c, g); }); return x; };
  D.fade = function (x, ms) {   // edge fades (in place)
    (Array.isArray(x) ? x : [x]).forEach(function (c) { var m = Math.min(Math.round(ms * SR / 1000), c.length >> 1), i; for (i = 0; i < m; i++) { c[i] *= i / m; c[c.length - 1 - i] *= i / m; } });
    return x;
  };

  /* convenience voices */
  D.tone = function (type, f0, f1, dur, att, T) {   // glide + AD envelope
    var n = D.len(dur), f = f1 && f1 !== f0 ? D.glide(f0, f1, n) : f0;
    return D.mul(D.osc(type, f, n), D.ad(n, att, T));
  };
  D.puff = function (r, dur, type, fc0, fc1, q, att, T, kind) {   // filtered noise burst, optional cutoff sweep
    var n = D.len(dur), x = D.noise(dur, r, kind || 'white'), f = fc1 && fc1 !== fc0 ? D.glide(fc0, fc1, n) : fc0;
    return D.mul(D.filter(x, type, f, q), D.ad(n, att, T));
  };
  D.bell = function (f, dur, T) {   // two-partial bell + faint inharmonic partial
    var n = D.len(dur);
    return D.mix(dur, [[D.mul(D.osc('sine', f, n), D.ad(n, 0.003, T)), 0, 1], [D.mul(D.osc('sine', f * 2.41, n), D.ad(n, 0.003, T * 0.45)), 0, 0.3], [D.mul(D.osc('sine', f * 3.1, n), D.ad(n, 0.003, T * 0.25)), 0, 0.1]]);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = D;
  else if (root && root.Game) root.Game.Dsp = D; else if (root) root.TogieDsp = D;
})(typeof window !== 'undefined' ? window : this);
