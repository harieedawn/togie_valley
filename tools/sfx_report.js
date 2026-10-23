#!/usr/bin/env node
/* Togie Valley - tools/sfx_report.js (Stage 11.5A). No dependencies. Usage: node tools/sfx_report.js [--quick] [--wav <dir>] [--quiet]
 * Bakes every sound + variant (quick: variant 0 only) and prints duration, peak, RMS, DC, edge steps and spectral centroid.
 * Exit 1 on: peak > -1 dBFS, silent, edge discontinuity, duration over the limit, NaN/Infinity, centroid > 5 kHz (non-sparkle).
 */
'use strict';
var fs = require('fs'), path = require('path');
var D = require(path.join(__dirname, '../js/dsp.js')), Bank = require(path.join(__dirname, '../js/sfx_bank.js'));
var args = process.argv.slice(2), quick = args.indexOf('--quick') >= 0, quiet = args.indexOf('--quiet') >= 0, wi = args.indexOf('--wav'), wavDir = wi >= 0 ? args[wi + 1] : null;
var SR = D.SR, EDGE = Math.round(0.002 * SR);

function fft(re, im) {
  var n = re.length, i, j = 0, k, m, t, wr, wi2, ur, ui, a, b;
  for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (m = 2; m <= n; m <<= 1) {
    var ang = -2 * Math.PI / m, wmr = Math.cos(ang), wmi = Math.sin(ang);
    for (k = 0; k < n; k += m) { wr = 1; wi2 = 0; for (j = 0; j < m / 2; j++) { a = k + j; b = a + m / 2; ur = re[b] * wr - im[b] * wi2; ui = re[b] * wi2 + im[b] * wr; re[b] = re[a] - ur; im[b] = im[a] - ui; re[a] += ur; im[a] += ui; t = wr * wmr - wi2 * wmi; wi2 = wr * wmi + wi2 * wmr; wr = t; } }
  }
}
function centroid(x) {
  var n = 1; while (n < x.length) n <<= 1;
  var re = new Float64Array(n), im = new Float64Array(n), i, num = 0, den = 0, mag;
  for (i = 0; i < x.length; i++) re[i] = x[i];
  fft(re, im);
  for (i = 1; i < n / 2; i++) { mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]); num += mag * i * SR / n; den += mag; }
  return den > 0 ? num / den : 0;
}
function dbf(v) { return v > 1e-9 ? 20 * Math.log10(v) : -99; }
function wav(file, ch) {
  var n = ch[0].length, nc = ch.length, b = Buffer.alloc(44 + n * nc * 2), i, c;
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * nc * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(nc, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * nc * 2, 28); b.writeUInt16LE(nc * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * nc * 2, 40);
  for (i = 0; i < n; i++) for (c = 0; c < nc; c++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[c][i])) * 32767), 44 + (i * nc + c) * 2);
  fs.writeFileSync(file, b);
}

var jobs = Bank.jobs(quick), bad = 0, bytes = 0, rows = [], grp = {};
if (wavDir) fs.mkdirSync(wavDir, { recursive: true });
jobs.forEach(function (j) {
  var rc = Bank.recipes[j.id], x = Bank.render(j.id, j.k, j.v), ch = Array.isArray(x) ? x : [x], m = ch[0], n = m.length, i, c, sum = 0, sq = 0, flags = [], dc, edge = 0, step = 0, cen, limit = rc.maxDur || 1.2, name = j.id + (j.k ? '/' + j.k : '') + '#' + j.v;
  for (c = 0; c < ch.length; c++) for (i = 0; i < n; i++) { var v = ch[c][i]; if (!isFinite(v)) { flags.push('NaN'); c = 9; break; } }
  if (flags.length) { bad++; rows.push(name + '  NaN/Infinity'); return; }
  for (i = 0; i < n; i++) { sum += m[i]; sq += m[i] * m[i]; }
  dc = sum / n; edge = Math.max(Math.abs(m[0]), Math.abs(m[n - 1]));
  for (i = 1; i < EDGE; i++) step = Math.max(step, Math.abs(m[i] - m[i - 1]), Math.abs(m[n - i] - m[n - i - 1]));
  cen = centroid(m);
  var pk = D.peak(x), dur = n / SR;
  if (dbf(pk) > -1) flags.push('PEAK'); if (dbf(pk) < -60) flags.push('SILENT'); if (edge > 0.003 || step > 0.15) flags.push('EDGE'); if (dur > limit) flags.push('LONG'); if (cen > 5000 && !rc.sparkle) flags.push('BRIGHT');
  if (Math.abs(dc) > 0.01) flags.push('DC');
  if (flags.length) bad++;
  bytes += n * ch.length * 4;
  var g = grp[rc.group] || (grp[rc.group] = { n: 0, sum: 0, lo: 0, hi: -99 }), rdb = dbf(Math.sqrt(sq / n)); g.n++; g.sum += rdb; g.lo = Math.min(g.lo, rdb); g.hi = Math.max(g.hi, rdb);
  rows.push([name.padEnd(24), (dur * 1000).toFixed(0).padStart(5) + 'ms', dbf(pk).toFixed(1).padStart(6), dbf(Math.sqrt(sq / n)).toFixed(1).padStart(6), dc.toExponential(1).padStart(8), dbf(edge).toFixed(0).padStart(5), cen.toFixed(0).padStart(6) + 'Hz', flags.join(',')].join(' '));
  if (wavDir) wav(path.join(wavDir, name.replace(/[\/#]/g, '_') + '.wav'), ch);
});
if (!quiet || bad) { console.log('name                       dur   peak    rms       dc  edge centroid flags'); rows.forEach(function (r) { if (!quiet || /[A-Z]{3,}\s*$/.test(r)) console.log(r); }); }
// mix pass: per-group loudness spread + worst-case stack (1 fanfare, 2 ui, 2 tool/fish, 1 footstep) at bus gain 0.8, master 1.1, before the compressor
var stack = (D.db(-6) + 2 * D.db(-10) + 2 * D.db(-8) + D.db(-20)) * 0.8 * 1.1, sdb = dbf(stack);
if (!quiet) { Object.keys(grp).forEach(function (k) { var g = grp[k]; console.log('group ' + k.padEnd(7) + ' n=' + String(g.n).padStart(3) + '  mean RMS ' + (g.sum / g.n).toFixed(1) + '  spread ' + (g.hi - g.lo).toFixed(1) + ' dB'); }); console.log('worst-case stack ' + sdb.toFixed(1) + ' dBFS pre-compressor (limit +6)'); }
if (sdb > 6) { bad++; console.log('STACK too hot: ' + sdb.toFixed(1) + ' dBFS'); }
console.log('sfx: ' + jobs.length + ' sounds, ' + (bytes / 1048576).toFixed(1) + ' MB, ' + bad + ' flagged' + (quick ? ' (quick)' : ''));
process.exit(bad ? 1 : 0);
