/* Togie Valley - audio.js (Stage 11.5A engine). Sounds are baked from js/sfx_bank.js (dsp.js) into AudioBuffers after the first gesture.
 * Game.Audio: `volume`, `muted`, `ready`, `names`, `setVolume(v)`, `setMuted(b)`, `play(name, delay|opts{vol,pitch,pan,delay,wet,variant,set})`,
 * `playAt(name, x, z, opts)`, `setBusVolume(bus, v)`, `getBusVolume(bus)` (buses: master sfx ui ambience music), `unlock()`.
 * Graph: voice -> gain -> [pan] -> ui|sfx bus -> master -> compressor -> ceiling -> out; reverb send (outdoor / room IR by scene).
 * Settings: localStorage `togie-valley/audio` (device level). Stage 11.5C: zone/time/weather ambience (native nodes + baked one-shots, group animal -> ambience bus)
 * and the random music player (music/ folder, streamed through HTMLAudioElement -> music bus).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Loop || !G.Time || !G.Player || !G.Scenes || !G.Dsp || !G.SfxBank) { console.error('[audio] missing deps'); return; }
  var E = G.Events, Bank = G.SfxBank, Dsp = G.Dsp, KEY = 'togie-valley/audio';
  var Au = { volume: 1, muted: false, ready: false, names: [] }, BASE = { sfx: 0.8, ui: 0.8, ambience: 0.5, music: 0.28 }, bv = { sfx: 1, ui: 1, ambience: 1, music: 1 };
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, buses = {}, duck = null, revIn = null, revO = null, revI = null, indoorLP = null, noiseBuf = null;
  var bufs = {}, jobs = null, jobI = 0, voices = [], lastPlay = {}, lastVar = {}, duckUntil = 0, dirty = true;
  var chargeT = 0, tickT = 0, tensT = 0, talkT = 0, lastStep = 0, stepN = 0, selIdx = 0, harvCls = 'leaf', _right = null;
  var LEGACY = ['tap', 'pop', 'blip', 'coin', 'till', 'water', 'plant', 'fertilize', 'harvest', 'splash', 'cast', 'bite', 'door', 'step', 'stepWood', 'stepStone', 'eat', 'sit', 'escape', 'junk', 'catch', 'levelup', 'morning', 'nope'];
  Au.names = LEGACY.concat(Bank.ids.filter(function (id) { return LEGACY.indexOf(id) < 0; }));

  /* ------------------------------------------------------------- settings */
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && sv.v === 2) { if (typeof sv.volume === 'number') Au.volume = Math.max(0, Math.min(1, sv.volume)); Au.muted = !!sv.muted; for (var bk in bv) if (sv.bus && typeof sv.bus[bk] === 'number') bv[bk] = Math.max(0, Math.min(1, sv.bus[bk])); } } catch (e) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify({ v: 2, volume: Au.volume, muted: Au.muted, bus: bv })); } catch (e) {} }
  function applyVolume(now) { if (!master) return; var g = Au.muted ? 0 : Au.volume * Au.volume * 1.1; if (now) master.gain.value = g; else master.gain.setTargetAtTime(g, ctx.currentTime, 0.05); }
  Au.setVolume = function (v) { Au.volume = Math.max(0, Math.min(1, +v || 0)); applyVolume(); persist(); };
  Au.setMuted = function (b) { Au.muted = !!b; applyVolume(); persist(); };
  Au.setBusVolume = function (bus, v) {
    v = Math.max(0, Math.min(1, +v || 0));
    if (bus === 'master') { Au.setVolume(v); return; }
    if (!(bus in bv)) return;
    bv[bus] = v; if (buses[bus]) buses[bus].gain.setTargetAtTime(BASE[bus] * v, ctx.currentTime, 0.05); persist();
  };
  Au.getBusVolume = function (bus) { return bus === 'master' ? Au.volume : (bv[bus] === undefined ? 1 : bv[bus]); };

  /* ------------------------------------------------------------- graph + baking */
  function ir(sec, damp, seed) {   // built at ctx.sampleRate (ConvolverNode requires it); Dsp noise index-scaled
    var r = Dsp.rng(seed), sr = ctx.sampleRate, n = Math.max(1, Math.round(sec * sr)), b = ctx.createBuffer(2, n, sr), c, i, x, k = 6.9 / (sec * sr), m, ratio = Dsp.SR / sr;
    for (c = 0; c < 2; c++) {
      x = Dsp.filter(Dsp.noise(sec, r, 'white'), 'lp', damp, 0.7); m = x.length;
      var d = b.getChannelData(c); for (i = 0; i < n; i++) d[i] = x[Math.min(m - 1, Math.floor(i * ratio))] * Math.exp(-i * k);
    }
    return b;
  }
  function build() {
    if (ctx || !AC) return;
    try { ctx = new AC(); } catch (e) { console.error('[audio] no WebAudio'); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    var comp = ctx.createDynamicsCompressor(), ceil = ctx.createGain(), k;
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2; ceil.gain.value = 0.891;   // -1 dBFS ceiling
    master = ctx.createGain(); master.connect(comp); comp.connect(ceil); ceil.connect(ctx.destination);
    for (k in BASE) { buses[k] = ctx.createGain(); buses[k].gain.value = BASE[k] * bv[k]; }
    buses.sfx.connect(master); buses.ui.connect(master);
    indoorLP = ctx.createBiquadFilter(); indoorLP.type = 'lowpass'; indoorLP.frequency.value = 18000; buses.ambience.connect(indoorLP); indoorLP.connect(master);
    duck = ctx.createGain(); duck.connect(buses.music); buses.music.connect(master);
    revIn = ctx.createGain(); revO = ctx.createGain(); revI = ctx.createGain(); revI.gain.value = 0;
    var co = ctx.createConvolver(), ci = ctx.createConvolver();
    try {
      co.buffer = ir(0.25, 2200, 11); ci.buffer = ir(0.5, 3500, 12);
      revIn.connect(co); co.connect(revO); revO.connect(master); revIn.connect(ci); ci.connect(revI); revI.connect(master);
    } catch (e) { console.error('[audio] reverb', e); }
    try { makeNoise(); initAmbience(); } catch (e) { console.error('[audio] ambience', e); }
    try { applyVolume(true); dirty = true; } catch (e) { console.error('[audio] volume', e); }
    try { jobs = Bank.jobs(false); jobI = 0; setTimeout(slice, 30); } catch (e) { console.error('[audio] bake jobs', e); }
    try { Music.init(); } catch (e) { console.error('[audio] music', e); }
  }
  function toBuf(x) { var ch = Array.isArray(x) ? x : [x], b = ctx.createBuffer(ch.length, ch[0].length, Dsp.SR), c; for (c = 0; c < ch.length; c++) b.copyToChannel(ch[c], c); return b; }
  function bake(id, k, v) { var key = id + '|' + k, l = bufs[key] || (bufs[key] = []); if (!l[v]) l[v] = toBuf(Bank.render(id, k, v)); return l[v]; }
  function slice() {   // time-sliced baking: <= 8 ms per slice; order ui, footsteps, tools, rest
    var t0 = performance.now();
    while (jobI < jobs.length && performance.now() - t0 < 8) { var j = jobs[jobI++]; try { bake(j.id, j.k, j.v); } catch (e) { console.error('[audio] bake', j.id, e); } }
    if (jobI < jobs.length) setTimeout(slice, 4);
  }

  /* ------------------------------------------------------------- playback */
  function drop(vc) { var i = voices.indexOf(vc); if (i >= 0) voices.splice(i, 1); try { vc.out.disconnect(); if (vc.snd) vc.snd.disconnect(); } catch (e) {} }
  Au.play = function (name, o) {
    if (typeof o === 'number') o = { delay: o };
    o = o || {};
    if (!ctx || !Au.ready || Au.muted) return;
    var rs = Bank.resolve(name, o.set); if (!rs) return;
    var rc = Bank.recipes[rs.id], now = ctx.currentTime, key = rs.id + '|' + rs.k, v, i, cd = rc.cd === undefined ? 0.04 : rc.cd, pri = rc.group === 'fan' ? 3 : rc.group === 'ui' ? 2 : rc.group === 'animal' ? 0 : 1;
    if (now - (lastPlay[name] || -1) < cd) return;
    if (o.variant !== undefined) v = o.variant % rc.variants;
    else { v = Math.floor(Math.random() * rc.variants); if (rc.variants > 1 && v === lastVar[key]) v = (v + 1) % rc.variants; }
    for (i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) drop(voices[i]);
    if (voices.length >= 24) {   // steal the oldest lowest-priority voice
      var s = null; voices.forEach(function (vc) { if (!s || vc.pri < s.pri || (vc.pri === s.pri && vc.t < s.t)) s = vc; });
      if (s.pri > pri) return;
      try { s.src.stop(); } catch (e) {} drop(s);
    }
    var buf; try { buf = bake(rs.id, rs.k, v); } catch (e) { console.error('[audio] bake', name, e); return; }
    lastPlay[name] = now; lastVar[key] = v;
    var src = ctx.createBufferSource(), g = ctx.createGain(), out = g, snd = null, vc, wet = (o.wet === undefined ? (rc.wet || 0) : o.wet) * (G.Scenes.current !== 'outdoor' ? 1.3 : 0.8), at = now + (o.delay || 0);
    src.buffer = buf; if (o.pitch) src.playbackRate.value = o.pitch;
    g.gain.value = o.vol === undefined ? 1 : o.vol; src.connect(g);
    if (o.pan && ctx.createStereoPanner) { var pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(pn); out = pn; }
    out.connect(rc.group === 'ui' ? buses.ui : rc.group === 'animal' ? buses.ambience : buses.sfx);
    if (wet > 0) { snd = ctx.createGain(); snd.gain.value = wet; out.connect(snd); snd.connect(revIn); }
    vc = { src: src, out: out, snd: snd, t: at, pri: pri, end: at + buf.duration / (o.pitch || 1) + 0.05 };
    voices.push(vc); src.onended = function () { drop(vc); };
    src.start(at);
    if (rc.group === 'fan') duckUntil = Math.max(duckUntil, at + 2);   // music -4 dB for 2 s
  };
  Au.playAt = function (name, x, z, o) {
    var P = G.Player.pos, dx = x - P.x, dz = z - P.z, d = Math.sqrt(dx * dx + dz * dz), rig = G.Render && G.Render.rig, op = {}, k;
    if (d > 40) return;
    if (!_right && window.THREE) _right = new window.THREE.Vector3();
    if (rig && _right) rig.getRight(_right);
    for (k in (o || {})) op[k] = o[k];
    op.pan = _right ? Math.max(-0.8, Math.min(0.8, (dx * _right.x + dz * _right.z) / 8)) : 0;
    op.vol = (o && o.vol !== undefined ? o.vol : 1) / (1 + d * 0.12);
    Au.play(name, op);
  };

  /* ------------------------------------------------------------- context lifecycle */
  Au.unlock = function () {
    if (!AC) return;
    build(); if (!ctx) return;
    if (ctx.state === 'suspended' && !document.hidden) { var p = ctx.resume(); if (p && p.then) p.then(function () { Au.ready = ctx.state === 'running'; }, function () {}); }
    Au.ready = ctx.state === 'running';
    Music.retry();
  };
  ['pointerdown', 'touchend', 'mousedown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, Au.unlock, { passive: true, capture: true }); });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); Au.ready = false; Music.hide(true); } else { Au.unlock(); Music.hide(false); }
  });

  /* ------------------------------------------------------------- event hooks */
  E.on('ui:sfx', function (p) { if (p && p.name) Au.play(p.name); });
  E.on('ui:opened', function () { Au.play('panelOpen'); });
  E.on('ui:closed', function () { Au.play('panelClose'); });
  E.on('ui:slotUse', function (p) { Au.play('slot', { set: String(((p && p.index) || 0) % 9) }); });
  E.on('inventory:changed', function (p) { if (p && typeof p.selected === 'number') selIdx = p.selected; });
  function toolTier() { var s = G.Inventory && G.Inventory.get(selIdx); return Math.max(1, Math.min(4, ((s && s.tier) || 0) + 1)); }
  // Tool sounds are fired by the clip system at the exact impact frame (anim:impact {name, stage}); see js/anim_clips.js
  var SND = { till: 'hit', water: 'pour', plant: 'hit', fertilize: 'hit', harvest: 'hit', eat: 'hit' };
  E.on('anim:impact', function (p) {
    if (!p || SND[p.name] !== p.stage) return;
    var o = {};
    if (p.name === 'till') o.set = String(toolTier()); else if (p.name === 'harvest') o.set = harvCls; else if (p.name === 'eat') o.set = 'crisp';
    Au.play(p.name, o);
  });
  E.on('crop:harvested', function (p) {
    var it = p && G.Items && G.Items.get(p.id), c = it && it.cls;
    harvCls = c === 'root' ? 'root' : (c === 'fruit' || c === 'flower' || c === 'legume') ? 'fruit' : 'leaf';
    if (p && p.first) Au.play('notebookEntry', 0.9);
  });
  E.on('crop:cleared', function () { Au.play('clear', 0.3); });
  E.on('player:sat', function () { Au.play('sit'); });
  E.on('player:stood', function () { Au.play('stand'); });

  /* footsteps: emitted by char_anim at the animation's foot contacts: player:step {surface, speed, foot} */
  var SURF = { grass: 'stepGrass', path: 'stepPath', sand: 'stepSand', stone: 'stepStone', wood: 'stepWood', room: 'stepRoom', snow: 'stepSnow' };
  E.on('player:step', function (p) {
    var sp = (p && p.speed) || 2, name = SURF[p && p.surface] || 'stepGrass', now = performance.now();
    if (name === 'stepWood' && Math.random() < 0.05) name = 'stepCreak';   // rare plank creak
    Au.play(name, { vol: Math.max(0.55, Math.min(1.2, 0.5 + sp * 0.13)), pitch: (p && p.foot ? 1.03 : 0.97) * (1 + (sp - 2) * 0.012) });
  });

  E.on('player:bush', function () { Au.play('rustle', { vol: 0.8 + Math.random() * 0.4, pitch: 0.96 + Math.random() * 0.08 }); });   // Stage 14A

  /* dialogue blips: dialog:char {voice, text, pos}; at most 14/s, silent on spaces + punctuation, pentatonic pitch, '?' rises */
  var BASEV = { shop: 330, fish: 250, smith: 210 }, PENT = [-3, 0, 2, 4, -3, 2, 0], pentI = 0;
  E.on('dialog:char', function (p) {
    if (!p || !p.text) return;
    var ch = p.text.charAt(p.pos - 1), now = performance.now(), k, st, rise = 0, rest, q;
    if (!ch || /[\s.,!?;:\-\u2013\u2014\u2026'"()]/.test(ch)) return;
    if (now - talkT < 72) return;
    talkT = now;
    pentI = (pentI + 1 + Math.floor(Math.random() * 3)) % PENT.length; st = PENT[pentI];
    rest = p.text.slice(p.pos); q = rest.search(/[.!?]/);
    if (q >= 0 && q <= 4 && rest.charAt(q) === '?') rise = 3 + (4 - q);
    Au.play('talk', { vol: 0.55, pitch: ((BASEV[p.voice] || 290) / 330) * Math.pow(2, (st + rise) / 12) });
  });
  E.on('scene:changed', function (p) { Au.play('door', { set: p && p.to === 'outdoor' ? 'close' : 'open' }); dirty = true; });
  E.on('shop:transaction', function (p) { var k = p && p.kind; Au.play(k === 'upgrade' ? 'ready' : 'purchase', k === 'upgrade' ? 0.1 : 0); });
  E.on('item:eaten', function () { Au.play('eat', { set: 'soft', delay: 0.05 }); });
  E.on('skill:levelUp', function () { Au.play('levelUp', 0.3); });
  E.on('goal:done', function () { Au.play('goal', 0.2); });
  E.on('cook:done', function () { Au.play('ready', 0.2); });
  E.on('day:started', function () { Au.play('morning', 0.5); Au.play('daySummary', 1.6); dirty = true; });
  E.on('day:ended', function () { Au.play('sleep'); });
  function tierOf(id) { var d = G.FishData && G.FishData.get && G.FishData.get(id); if (!d) return 1; return d.legendary ? 5 : d.diff >= 5 ? 4 : d.diff >= 4 ? 3 : d.diff >= 3 ? 2 : 1; }
  E.on('fish:caught', function (p) {
    var b = G.Fishing && G.Fishing.view && G.Fishing.view.bobPos, sz = (p && p.size) || 20;
    if (b) Au.playAt(sz < 25 ? 'splashS' : sz < 45 ? 'splashM' : 'splashL', b.x, b.z, { vol: 0.9 });
    Au.play('catch', { set: String(tierOf(p && p.id)), delay: 0.2 });
  });
  E.on('fish:escaped', function () { Au.play('escape'); });
  E.on('fish:junk', function () { Au.play('junk'); });
  E.on('state:exhausted', function () { Au.play('nope'); });
  E.on('interact:shop', function () { Au.play('shopBell'); });
  E.on('interact:workshop', function () { Au.play('shopBell'); });

  /* fishing loops: charge tone follows power, reel ticks 14-20 Hz scaled by progress, tension creak rises with tension */
  function fishFrame(dt) {
    var F = G.Fishing, st = F && F.state, V = F && F.view, R = V && V.R, pr, ten, lv;
    if (st === 'charge') { chargeT -= dt; if (chargeT <= 0) { chargeT = 0.11; Au.play('charge', { vol: 0.6, pitch: 0.8 + Math.min(1, V.charge || 0) }); } } else chargeT = 0;
    if (st === 'reel' && R) {
      pr = Math.max(0, Math.min(1, R.prog));
      tickT -= dt;
      if (tickT <= 0) { tickT = 1 / (14 + 6 * pr); Au.play('reelTick', { vol: R.inside ? 0.7 : 0.4 }); }
      ten = R.inside ? 0.15 * (1 - pr) : Math.min(1, 0.45 + (R.out || 0) * 0.05 + (1 - pr) * 0.4);
      tensT -= dt;
      if (ten > 0.4 && tensT <= 0) { lv = ten > 0.8 ? 2 : ten > 0.6 ? 1 : 0; tensT = 0.7 - 0.3 * ten; Au.play('tension', { set: String(lv), vol: 0.3 + 0.5 * ten }); }
    } else { tickT = 0; tensT = 0; }
  }

  /* ------------------------------------------------------------- ambience (11.5C) */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function season() { var s = G.Time.season; return typeof s === 'number' ? ['spring', 'summer', 'autumn', 'winter'][s] : s; }
  function makeNoise() {   // 4 s looped pink-ish noise, seam cross-faded
    var sr = ctx.sampleRate, n = sr * 4, k = Math.floor(sr * 0.1), t = new Float32Array(n), i, w, b0 = 0, b1 = 0, b2 = 0, d, a;
    for (i = 0; i < n; i++) { w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; t[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    noiseBuf = ctx.createBuffer(1, n - k, sr); d = noiseBuf.getChannelData(0);
    for (i = 0; i < n - k; i++) d[i] = t[i];
    for (i = 0; i < k; i++) { a = i / k; d[i] = t[i] * a + t[n - k + i] * (1 - a); }
  }
  function layer(type, fc, q, lfoHz, depth, onFreq) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), am = ctx.createGain(), g = ctx.createGain(), o, lg;
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = fc; f.Q.value = q; g.gain.value = 0; am.gain.value = 1;
    s.connect(f); f.connect(am); am.connect(g); g.connect(buses.ambience); s.start(0, Math.random() * 3);
    if (lfoHz) { o = ctx.createOscillator(); lg = ctx.createGain(); o.frequency.value = lfoHz; lg.gain.value = depth; o.connect(lg); lg.connect(onFreq ? f.frequency : am.gain); o.start(); }
    return { g: g, f: f };
  }
  var L = null, zoneName = 'farm', zoneT = 0, ambT = 0, townPts = null, one = null;
  function initAmbience() {
    L = {
      breeze: layer('lowpass', 480, 0.8, 0.07, 160, true),
      leaves: layer('bandpass', 2800, 0.5, 0.17, 0.5),
      lap: layer('lowpass', 700, 0.7, 0.23, 0.45),
      patter: layer('bandpass', 2600, 0.4, 6.5, 0.18),
      hiss: layer('bandpass', 6000, 0.3, 0.2, 0.2),
      roof: layer('lowpass', 900, 0.6, 3.1, 0.25),
      cicada: layer('bandpass', 4800, 9, 27, 0.5),
      winter: layer('lowpass', 380, 0.9, 0.05, 120, true)
    };
    function ev(min, max, cond, fire, t0) { return { min: min, max: max, cond: cond, fire: fire, t: t0 }; }
    var Z = function () { return zoneName; };
    one = [
      ev(8, 20, function (c) { return c.out && c.day && !c.wet && !c.winter; }, function (c) { bird(c, 1); }, 4),
      ev(10, 25, function (c) { return c.out && c.day && !c.wet && !c.winter; }, function (c) { bird(c, 2); }, 9),
      ev(8, 20, function (c) { return Z() === 'lake' && c.night && !c.snow && !c.winter; }, function () { oneShot('frog'); }, 6),
      ev(14, 25, function (c) { return c.out && c.night && !c.wet && !c.snow; }, function () { oneShot('owl'); }, 12),
      ev(3, 8, function (c) { return c.out && (c.eve || c.night) && !c.wet && !c.winter; }, function () { oneShot('cricket'); }, 3),
      ev(9, 25, function (c) { return c.out && c.day && !c.wet && !c.winter && Z() !== 'lake'; }, function () { oneShot('bee'); }, 8),
      ev(8, 20, function (c) { return Z() === 'lake' && c.day && !c.wet && !c.winter; }, function () { oneShot('flutter'); }, 7),
      ev(8, 25, function (c) { return c.out && !c.snow; }, function () { oneShot('leaf'); }, 10),
      ev(8, 15, function (c) { return Z() === 'lake'; }, function () { oneShot('lap'); }, 5),
      ev(10, 25, function (c) { return Z() === 'town' && c.out && !c.wet; }, function () { oneShot('chime'); }, 8),
      ev(1, 1, function (c) { return !c.out; }, function () { oneShot('clockTick', 0.55); }, 1)
    ];
  }
  function oneShot(name, vol, set) { Au.play(name, { set: set, pan: rnd(-0.75, 0.75), vol: (vol || 1) * rnd(0.45, 1), pitch: rnd(0.97, 1.03) }); }
  function bird(c, n) {   // dawn chorus = several calls close together; forest = fuller birdsong
    var cnt = c.dawn ? 3 : (zoneName === 'forest' ? 2 : 1), i;
    for (i = 0; i < cnt; i++) Au.play('bird', { set: String(1 + Math.floor(Math.random() * 4)), pan: rnd(-0.8, 0.8), vol: rnd(0.4, 1), pitch: rnd(0.96, 1.04), delay: i * rnd(0.5, 1.6) });
  }
  function featRect(f, x, z) { return f && x >= f[0] - 3 && x <= f[0] + f[2] + 3 && z >= f[1] - 3 && z <= f[1] + f[3] + 3; }
  function detectZone() {
    var P = G.Player.pos, W = G.World, WM = G.WorldMap, x = P.x, z = P.z, dx, dz, t, water = 0, soil = 0, i, F, m;
    if (!W || !W.tileType) return 'farm';
    for (dz = -4; dz <= 4; dz += 2) for (dx = -4; dx <= 4; dx += 2) { t = W.tileType(x + dx, z + dz); if (t === 'water') water++; else if (t === 'soil' || t === 'locked') soil++; }
    if (W.tileType(x, z) === 'pier' || water >= 4) return 'lake';
    F = WM && WM.features;
    if (F) { if (featRect(F.grove, x, z)) return 'forest'; for (i = 0; F.forests && i < F.forests.length; i++) if (featRect(F.forests[i], x, z)) return 'forest'; }
    if (soil >= 1) return 'farm';
    if (!townPts) { townPts = []; ['shopkeeper', 'fishmonger'].forEach(function (k) { (W.getMarkers ? W.getMarkers(k) : []).forEach(function (q) { townPts.push(q); }); }); }
    for (i = 0; i < townPts.length; i++) { m = townPts[i]; if (Math.abs(m.tx + 0.5 - x) < 12 && Math.abs(m.tz + 0.5 - z) < 12) return 'town'; }
    return 'farm';
  }
  function ambFrame(dt, now, c) {
    zoneT -= dt;
    if (zoneT <= 0) { zoneT = 0.5; zoneName = c.out ? detectZone() : 'farm'; }
    var zn = zoneName, tc = 0.5, lake = zn === 'lake' ? 1 : 0, fo = zn === 'forest' ? 1 : 0, tw = zn === 'town' ? 1 : 0, se = season(), v;
    ambT -= dt;
    v = c.out ? (c.snow ? 0.12 : (c.winter ? 0.05 : 0.2 - 0.05 * lake) * (fo ? 1.2 : 1) * (tw ? 0.85 : 1)) : 0.015;
    L.breeze.g.gain.setTargetAtTime(v, now, tc);
    L.winter.g.gain.setTargetAtTime(c.out && (c.snow || c.winter) ? (c.snow ? 0.2 : 0.16) : 0, now, tc);
    L.leaves.g.gain.setTargetAtTime(c.out && !c.snow && !c.winter ? (fo ? 0.1 : 0.025) * (se === 'autumn' ? 1.4 : 1) : 0, now, tc);
    L.lap.g.gain.setTargetAtTime(lake && c.out ? 0.16 : 0, now, tc);
    L.patter.g.gain.setTargetAtTime(c.rain ? (c.out ? 0.18 : 0.1) : 0, now, tc);
    L.hiss.g.gain.setTargetAtTime(c.rain ? (c.out ? 0.09 : 0.05) : 0, now, tc);
    L.roof.g.gain.setTargetAtTime(c.rain && !c.out ? 0.16 : 0, now, tc);
    L.cicada.g.gain.setTargetAtTime(c.out && se === 'summer' && c.day && !c.rain ? (lake ? 0.025 : 0.05) : 0, now, tc);
    one.forEach(function (e) {
      e.t -= dt;
      if (e.t > 0) return;
      e.t = e.min === e.max ? e.min : rnd(e.min, e.max);
      if (!Au.muted && e.cond(c)) e.fire(c);
    });
  }

  /* ------------------------------------------------------------- music player (11.5C): music/NN.mp3 or music/playlist.json, random bag shuffle, streamed */
  var Music = (function () {
    var M = { list: [], bag: [], last: -1, el: null, node: null, gain: null, pre: null, preIdx: -1, timer: 0, state: 'idle', fails: 0, stuck: 0, lastT: -1, fading: false, started: false, discovering: false, pendingPlay: false };
    function url(n) { return /^(https?:)?\//.test(n) ? n : 'music/' + n; }
    function pad(i) { return (i < 10 ? '0' : '') + i; }
    function probe(i) {
      if (i > 99) return done();
      var name = pad(i) + '.mp3';
      fetch(url(name), { method: 'HEAD' }).then(function (r) { if (r.ok) { M.list.push(name); probe(i + 1); } else done(); }, done);
    }
    function discover() {
      if (M.discovering || M.started) return; M.discovering = true;
      try {
        fetch('music/playlist.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          if (j && Array.isArray(j) && j.length) { M.list = j.filter(function (n) { return typeof n === 'string'; }).slice(0, 99); done(); } else probe(1);
        }, function () { probe(1); });
      } catch (e) { done(); }
    }
    function done() { M.discovering = false; M.started = true; if (M.list.length) schedule(rnd(2, 4)); }
    function schedule(sec) { clearTimeout(M.timer); M.state = 'wait'; M.timer = setTimeout(startTrack, sec * 1000); }
    function pickNext() {
      var n = M.list.length, i, j, t;
      if (!M.bag.length) {
        for (i = 0; i < n; i++) M.bag.push(i);
        for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = M.bag[i]; M.bag[i] = M.bag[j]; M.bag[j] = t; }
        if (n > 1 && M.bag[M.bag.length - 1] === M.last) { t = M.bag[0]; M.bag[0] = M.bag[M.bag.length - 1]; M.bag[M.bag.length - 1] = t; }   // pop() takes the end: never repeat across bags
      }
      return M.bag.pop();
    }
    function prep(idx) { var a = new Audio(); a.preload = 'metadata'; a.src = url(M.list[idx]); return a; }
    function cleanup() {
      if (M.el) { try { M.el.pause(); M.el.removeAttribute('src'); M.el.load(); } catch (e) {} }
      try { if (M.node) M.node.disconnect(); if (M.gain) M.gain.disconnect(); } catch (e) {}
      M.el = M.node = M.gain = null; M.fading = false; M.stuck = 0; M.lastT = -1;
    }
    function skip(delay) { cleanup(); M.state = 'wait'; M.fails++; if (M.fails > M.list.length * 2 + 2) { M.state = 'idle'; return; } schedule(delay === undefined ? 1 : delay); }
    function startTrack() {
      if (!ctx || !M.list.length) return;
      var idx = M.preIdx >= 0 ? M.preIdx : pickNext(), el = M.pre && M.preIdx === idx ? M.pre : prep(idx), t = ctx.currentTime, p;
      M.last = idx; M.pre = null; M.preIdx = -1; cleanup();
      M.el = el; el.preload = 'auto';
      try { M.node = ctx.createMediaElementSource(el); M.gain = ctx.createGain(); M.gain.gain.setValueAtTime(0, t); M.gain.gain.linearRampToValueAtTime(1, t + 3); M.node.connect(M.gain); M.gain.connect(duck); }
      catch (e) { console.error('[audio] music graph', e); skip(); return; }
      el.onended = function () { cleanup(); M.state = 'wait'; schedule(rnd(4, 10)); };
      el.onerror = function () { if (M.el === el) skip(); };
      M.state = 'play';
      p = el.play();
      if (p && p.catch) p.catch(function () { if (M.el === el) { M.pendingPlay = true; } });
      if (M.list.length > 1) { M.preIdx = pickNext(); M.pre = prep(M.preIdx); }   // preload only the next track's metadata
    }
    M.init = function () { if (!M.started) discover(); };
    M.retry = function () { if (M.pendingPlay && M.el && !document.hidden) { M.pendingPlay = false; var p = M.el.play(); if (p && p.catch) p.catch(function () { M.pendingPlay = true; }); } };
    M.hide = function (h) { if (!M.el) return; if (h) { try { M.el.pause(); } catch (e) {} } else if (M.state === 'play') { var p = M.el.play(); if (p && p.catch) p.catch(function () { M.pendingPlay = true; }); } };
    M.frame = function (dt) {
      var el = M.el, rem;
      if (!el || M.state !== 'play' || document.hidden || el.paused || ctx.state !== 'running') return;
      if (el.currentTime === M.lastT) { M.stuck += dt; if (M.stuck > 8) { skip(); return; } } else { M.stuck = 0; M.lastT = el.currentTime; M.fails = 0; }
      rem = el.duration - el.currentTime;
      if (!M.fading && isFinite(rem) && rem <= 3.05 && el.duration > 7) { M.fading = true; var t = ctx.currentTime; M.gain.gain.cancelScheduledValues(t); M.gain.gain.setValueAtTime(M.gain.gain.value, t); M.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.1, rem)); }
    };
    return M;
  })();
  Au.music = Music;

  /* ------------------------------------------------------------- frame: reverb scene, ducking, fishing loops, ambience, music */
  function frame(dt) {
    if (!ctx || !Au.ready || !L) return;
    var now = ctx.currentTime, indoors = G.Scenes.current !== 'outdoor', wx = G.Time.weather, hr = G.Time.hour % 24, se = season();
    var c = { out: !indoors, rain: wx === 'rain', snow: wx === 'snow', wet: wx === 'rain' || wx === 'snow', winter: se === 'winter', night: hr >= 19.5 || hr < 5.5, eve: hr >= 17.5 && hr < 19.5, dawn: hr >= 5.5 && hr < 8, day: hr >= 5.5 && hr < 17.5 };
    if (dirty) { dirty = false; revO.gain.setTargetAtTime(indoors ? 0 : 1, now, 0.2); revI.gain.setTargetAtTime(indoors ? 1 : 0, now, 0.2); }
    duck.gain.setTargetAtTime((now < duckUntil ? 0.63 : 1) * (indoors ? 0.85 : 1), now, 0.15);
    fishFrame(dt);
    indoorLP.frequency.setTargetAtTime(indoors ? 650 : 18000, now, 0.25);
    ambFrame(dt, now, c);
    Music.frame(dt);
  }
  G.Loop.onFrame(frame, 13);
  G.Audio = Au;
})();
