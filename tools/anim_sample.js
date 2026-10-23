#!/usr/bin/env node
/* Togie Valley - tools/anim_sample.js (Stage 15D): numeric pose sampling of every clip in js/anim_data.js (no rendering).
 * Usage: node tools/anim_sample.js            -> summary + errors (also used by tools/check.js through require)
 *        node tools/anim_sample.js till       -> key poses of one clip at its phase boundaries (+ FK probes)
 *        node tools/anim_sample.js --all      -> key poses of every clip
 * Checks per clip: no NaN/Infinity at 60 fps, per-frame jumps (pops) under a limit, start/end return to the neutral pose
 * (so the blend in/out boundaries do not pop), hit/release/event ordering, and forward-kinematics contact probes
 * (hand / tool tip reach the targets in character space; rig dims copied from js/models.js).
 */
'use strict';
var path = require('path'), AD = require(path.join(__dirname, '../js/anim_data.js'));
var LEG = AD.LEG;

/* ---------------------------------------------------------------- forward kinematics of the hero rig (Euler XYZ like THREE) */
function mul(a, b) { var o = [0, 0, 0, 0, 0, 0, 0, 0, 0], i, j, k; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) { var s = 0; for (k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j]; o[i * 3 + j] = s; } return o; }
function Rx(t) { var c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function Ry(t) { var c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function Rz(t) { var c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
function eul(x, y, z) { return mul(Rx(x), mul(Ry(y), Rz(z))); }
function ap(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
/** pose = {key: value} incl. crouch/step/tilt; returns hand world position + frame for the given side. */
function fk(p, side) {
  var g = function (k) { return p[k] || 0; }, c = AD.crouch(g('crouch'), {});
  var hips = [0, LEG + g('bob') + c.bob, c.hipZ], Mh = eul(0, g('hipsRY'), g('hipsRZ')), Sp = eul(g('spineRX'), g('spineRY'), g('spineRZ')), Ms = mul(Mh, Sp);
  var shL = side === 'L' ? [0.19, 0.24, 0] : [-0.19, 0.24, 0];
  var sh = add(hips, ap(Mh, ap(Sp, shL)));
  var Ma = side === 'L' ? mul(Ms, eul(-g('armLX'), 0, g('armLZ'))) : mul(Ms, eul(-g('armRX'), 0, -g('armRZ')));
  var hand = add(sh, ap(Ma, [0, -0.215, 0]));
  var up = g('armRX') - g('spineRX');   // upright compensation for held props (tool.rotation.x = armRX - spineRX + tilt)
  var Mt = mul(Ma, Rx(up + g('tilt')));
  return { sh: sh, hand: hand, Ma: Ma, Mt: Mt, head: add(hips, ap(Ms, [0, 0.28 + 0.15, 0.1])), hips: hips };
}
AD.fk = fk;

/* ---------------------------------------------------------------- sampling helpers */
var out = AD.newOut();
function poseAt(d, u) {
  AD.sampleU(d, u, out);
  var p = {}, i; for (i = 0; i < AD.CH.length; i++) p[AD.CH[i]] = out.has[i] ? out.v[i] : null;
  return p;
}
function num(v) { return v === null ? '  .  ' : (v >= 0 ? ' ' : '') + v.toFixed(2); }
var NEUTRAL = { armLZ: 0.1, armRZ: 0.1 };

function checkClip(d, verbose) {
  var errs = [], warns = [], FPS = 60, N = Math.round(d.dur * FPS), i, k, prev = null, maxJ = {}, cur = {};
  if (!(d.dur > 0.2 && d.dur < 4)) errs.push('duration ' + d.dur);
  if (d.hit >= 0 && !(d.hit > 0.05 && (d.hit < d.release + 0.001 || !d.lock) && d.hit < 1)) errs.push('hit not before release');
  if (!(d.release > 0 && d.release <= 1)) errs.push('release out of range');
  d.ev.forEach(function (e) { if (e[0] < 0 || e[0] > 1) errs.push('event ' + e[1] + ' outside 0..1'); });
  if (d.hit >= 0 && !d.ev.some(function (e) { return e[1] === 'hit' && Math.abs(e[0] - d.hit) < 1e-6; })) errs.push('no "hit" event at u=' + d.hit);
  for (i = 0; i <= N; i++) {
    var u = i / N, p = poseAt(d, u);
    for (k in p) {
      if (p[k] === null) continue;
      if (!isFinite(p[k])) errs.push('NaN/Inf in ' + k + ' at u=' + u.toFixed(3));
      if (prev && prev[k] !== null) {
        var j = Math.abs(p[k] - prev[k]);
        if (j > (maxJ[k] || 0)) maxJ[k] = j;
      }
    }
    prev = p;
  }
  var LIM = { bob: 0.05, step: 0.09, crouch: 0.2, tS: 1.01, hold: 1.01, tilt: 0.45, stag: 0.2 };
  Object.keys(maxJ).forEach(function (k2) {
    var lim = LIM[k2] !== undefined ? LIM[k2] : 0.8;   // radians per frame at 60 fps (48 rad/s)
    if (maxJ[k2] > lim) errs.push('pop: ' + k2 + ' jumps ' + maxJ[k2].toFixed(2) + ' in one frame');
  });
  if (!d.driven && !d.free) {
    var s0 = poseAt(d, 0), s1 = poseAt(d, 1);
    ['armLX', 'armRX', 'spineRX', 'headRX', 'crouch', 'bob', 'step', 'hold', 'tS', 'tilt', 'spineRY', 'armRZ', 'armLZ'].forEach(function (k2) {
      var n0 = NEUTRAL[k2] !== undefined ? NEUTRAL[k2] : 0;
      if (s1[k2] !== null && Math.abs(s1[k2] - n0) > 0.12) errs.push('end pose of ' + k2 + ' = ' + s1[k2].toFixed(2) + ' (not neutral: pop at blend-out)');
      if (s0[k2] !== null && Math.abs(s0[k2] - n0) > 0.2) errs.push('start pose of ' + k2 + ' = ' + s0[k2].toFixed(2) + ' (pop at blend-in)');
    });
  }
  var probes = [];
  d.probes.forEach(function (pr) {
    var p = poseAt(d, pr[0]), f = fk(p, 'R'), pos, l = pr[2], w = pr[3];
    if (pr[1] === 'tool') pos = add(f.hand, ap(d.upright ? f.Mt : f.Ma, l)); else pos = add(f.hand, ap(f.Ma, l));
    pos = [pos[0], pos[1], pos[2] + (p.step || 0)];
    var dist = Math.sqrt(Math.pow(pos[0] - w[0], 2) + Math.pow(pos[1] - w[1], 2) + Math.pow(pos[2] - w[2], 2));
    probes.push({ label: pr[5], pos: pos, want: w, dist: dist, tol: pr[4], u: pr[0] });
    if (!(dist <= pr[4])) errs.push('probe "' + pr[5] + '" off by ' + dist.toFixed(2) + ' (tol ' + pr[4] + '): got ' + pos.map(function (v) { return v.toFixed(2); }).join(',') + ' want ' + w.join(','));
  });
  return { errs: errs, warns: warns, maxJ: maxJ, probes: probes };
}

function printClip(d) {
  var cols = ['armRX', 'armRZ', 'armLX', 'armLZ', 'spineRX', 'spineRY', 'headRX', 'bob', 'crouch', 'step', 'tilt', 'tS', 'hold'];
  console.log('\n== ' + d.name + ' dur ' + d.dur + 's hit ' + d.hit + ' release ' + d.release + (d.hitStop ? ' hitStop ' + d.hitStop.join('/') : '') + (d.tool ? ' tool ' + d.tool : ''));
  console.log('   u    phase        ' + cols.map(function (c) { return (c + '     ').slice(0, 6); }).join(' '));
  var us = {}; d.phases.forEach(function (p) { us[p[1]] = p[0]; }); d.ev.forEach(function (e) { us[e[0]] = (us[e[0]] || '') + '*' + e[1]; }); us[1] = 'end';
  Object.keys(us).map(Number).sort(function (a, b) { return a - b; }).forEach(function (u) {
    var p = poseAt(d, u);
    console.log('  ' + u.toFixed(2) + '  ' + (us[u] + '            ').slice(0, 12) + ' ' + cols.map(function (c) { return num(p[c]); }).join(' '));
  });
}

AD.checkAll = function (verbose) {
  var total = 0, bad = [];
  AD.names().forEach(function (n) {
    var d = AD.get(n), r = checkClip(d);
    total++;
    r.errs.forEach(function (e) { bad.push(n + ': ' + e); });
    if (verbose) { printClip(d); r.probes.forEach(function (p) { console.log('   probe u=' + p.u + ' ' + p.label + ': ' + p.pos.map(function (v) { return v.toFixed(2); }).join(',') + ' (want ' + p.want.join(',') + ', off ' + p.dist.toFixed(2) + ')'); }); }
  });
  return { clips: total, errors: bad };
};
module.exports = AD;

if (require.main === module) {
  var arg = process.argv[2], res;
  if (arg && arg !== '--all') {
    if (!AD.has(arg)) { console.log('no clip ' + arg); process.exit(1); }
    var d = AD.get(arg), r = checkClip(d); printClip(d);
    r.probes.forEach(function (p) { console.log('   probe u=' + p.u + ' ' + p.label + ': ' + p.pos.map(function (v) { return v.toFixed(2); }).join(',') + ' (want ' + p.want.join(',') + ', off ' + p.dist.toFixed(2) + ')'); });
    console.log('   max per-frame jumps: ' + Object.keys(r.maxJ).map(function (k) { return k + ' ' + r.maxJ[k].toFixed(2); }).join(', '));
    r.errs.forEach(function (e) { console.log('ERROR ' + e); });
    process.exit(r.errs.length ? 1 : 0);
  }
  res = AD.checkAll(arg === '--all');
  console.log('anim_sample: ' + res.clips + ' clips');
  res.errors.forEach(function (e) { console.log('ERROR ' + e); });
  process.exit(res.errors.length ? 1 : 0);
}
