/* Togie Valley - perf.js (Stage 14B): device profile, starting tier, frame-rate gate, quality governor, battery / idle caps.
 * Game.Perf:
 *   profile        {dpr, screenW, screenH, cores, mem, renderer, vendor, maxTex, weak, tier, why[]} measured once at load (before the first frame)
 *   tierFor(profile) -> 0..3 (weak GPUs never start at 0), startTier() -> max(profile tier, last auto tier stored by Quality)
 *   density        {flower, particle, critter, far} 0..1, set per tier (read by decor chunks, ambient, weather, farm_fx, scenery_far)
 *   cap            effective fps cap without idle (tier cap, 30 on low battery); drawCap includes the ~20 fps idle mode
 *   indoors, idle, batteryLow, fps, medianFps, frameMs, state ('stable'|'slow'|'idle'|'settling')
 *   onTier(level, def)   called by Game.Quality when a tier is applied
 *   snapshot()     plain object for the debug overlay (perf_ui.js)
 * Frame gate: Render.pass.gate decides per rAF whether a frame is drawn (accumulator, so 45 fps on 60 Hz draws 3 of 4 frames);
 * Render.pass.after(now) records the drawn-frame interval. Display.sample is fed with drawn-frame intervals only (so the existing
 * dynamic-resolution scaler measures real fps against the tier cap). Governor: per-second fps, median of the last 8 seconds;
 * the scaler lowers the pixel ratio first, then a tier; after 5 min a sustained slowdown (thermal) drops a tier at once;
 * upward probe at most once per 3 min after 60 s stable (backs off after a failed probe). Manual graphics modes disable the governor.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Config || !G.Display || !G.Events || !G.Loop || !G.Render || !G.Render.pass) { console.error('[perf] missing dependencies'); return; }
  var Config = G.Config, Display = G.Display, Events = G.Events, Loop = G.Loop, Render = G.Render;
  var P = G.Perf = {
    profile: null, density: { flower: 1, particle: 1, critter: 1, far: 1 }, cap: 60, drawCap: 60,
    indoors: false, idle: false, batteryLow: false, battery: null, fps: 0, medianFps: 0, frameMs: 0, state: 'settling',
    level: 0, tierDef: null, log: [], probes: 0, drops: 0, calls: 0, trim: 0
  };

  /* ------------------------------------------------------------ device profile */
  var WEAK_RE = /mali-?4\d\d|mali-?t6\d\d|mali-?t7\d\d|adreno[^0-9]{0,8}[345]\d\d\b|powervr|sgx|vivante|videocore|tegra/i;
  var SOFT_RE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft/i;

  function readGpu() {
    var out = { renderer: '', vendor: '', maxTex: 0 };
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return out;
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      out.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      out.vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) || '');
      out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0;
      var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    } catch (e) { /* profile stays partial */ }
    return out;
  }

  P.tierFor = function (p) {
    var t = 0, why = [];
    function up(n, w) { if (n > t) t = n; why.push(w); }
    if (SOFT_RE.test(p.renderer)) { p.weak = true; up(3, 'software renderer'); }
    else if (WEAK_RE.test(p.renderer)) { p.weak = true; up(2, 'weak GPU'); }
    if (p.maxTex && p.maxTex <= 2048) up(3, 'maxTexture<=2048'); else if (p.maxTex && p.maxTex <= 4096) up(2, 'maxTexture<=4096');
    if (p.mem && p.mem <= 1) up(3, 'RAM<=1GB'); else if (p.mem && p.mem <= 2) up(2, 'RAM<=2GB');
    if (p.cores && p.cores <= 2) up(2, 'cores<=2'); else if (p.cores && p.cores <= 4) up(1, 'cores<=4');
    if (p.weak && p.screenW * p.screenH * p.dpr * p.dpr > 2000000) up(3, 'weak GPU + many pixels');
    p.why = why;
    return Math.max(0, Math.min(3, t));
  };

  (function measure() {
    var gpu = readGpu(), nav = navigator, sw = (window.screen && screen.width) || window.innerWidth || 360, sh = (window.screen && screen.height) || window.innerHeight || 640;
    var p = P.profile = {
      dpr: window.devicePixelRatio || 1, screenW: sw, screenH: sh, cores: nav.hardwareConcurrency || 0, mem: nav.deviceMemory || 0,
      renderer: gpu.renderer, vendor: gpu.vendor, maxTex: gpu.maxTex, weak: false, tier: 0, why: []
    };
    p.tier = P.tierFor(p);
  })();

  var LS_Q = 'togie-valley/quality';
  P.startTier = function () {
    var saved = 0; try { saved = parseInt(localStorage.getItem(LS_Q), 10) || 0; } catch (e) { /* ignore */ }
    return Math.max(P.profile.tier, Math.max(0, Math.min(3, saved)));
  };

  /* ------------------------------------------------------------ tier application hook (called by Quality) */
  function recomputeCap() {
    var base = P.tierDef ? P.tierDef.fps : 60;
    P.cap = P.batteryLow ? Math.min(base, 30) : base;
    P.drawCap = P.idle ? Math.min(P.cap, 20) : P.cap;
    Display.setTargetFps(P.cap);
  }
  P.applySway = function (k) {
    var D = G.Decor, a = D && D.sway, i;
    if (!a) return;
    for (i = 0; i < a.length; i++) a[i].value = (a[i].base || 0) * k;
  };
  P.onTier = function (level, def) {
    P.level = level; P.tierDef = def;
    P.density.flower = def.flower; P.density.particle = def.particle; P.density.critter = def.critter; P.density.far = def.far;
    P.applySway(def.sway);
    if (G.Chunks) { G.Chunks.setDensity('flowers', def.flower); G.Chunks.setOutlines('flowers', def.flowerOutline && P.trim < 1); }
    if (G.SceneryFar) { G.SceneryFar.setDensity(def.far); G.SceneryFar.setOutlines(P.trim < 2); }
    Render.pass.sky = !!def.sky; Render.pass.overlay = !!def.overlay;
    recomputeCap();
  };

  /* ------------------------------------------------------------ battery */
  try {
    if (navigator.getBattery) navigator.getBattery().then(function (b) {
      function upd() { P.battery = { level: b.level, charging: b.charging }; var low = !b.charging && b.level < 0.2; if (low !== P.batteryLow) { P.batteryLow = low; recomputeCap(); } }
      b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); upd();
    }).catch(function () { /* no battery info */ });
  } catch (e) { /* ignore */ }

  /* ------------------------------------------------------------ frame gate (called by Render.draw every rAF) */
  var lastGate = 0, acc = 1, capSynced = false;
  function fishingBusy() { var F = G.Fishing; return !!(F && F.state && F.state !== 'off' && F.state !== 'idle'); }
  function gate() {
    var now = performance.now(), dt = now - lastGate, idle;
    lastGate = now;
    if (!capSynced) { capSynced = true; recomputeCap(); }   // Display.init (main.js) resets the scaler target after quality.js ran
    if (dt > 250) dt = 250;
    P.indoors = !!(G.Scenes && G.Scenes.current !== 'outdoor');
    idle = !!(G.UI && G.UI.panelOpen) && !!G.Player && G.Player.speed < 0.05 && !fishingBusy();
    if (idle !== P.idle) { P.idle = idle; recomputeCap(); resetWindow(3); }
    acc += dt * P.drawCap / 1000;
    if (acc < 0.85) return false;
    acc -= 1; if (acc > 1) acc = 0.5;
    return true;
  }

  /* ------------------------------------------------------------ governor */
  var RING = 8, secs = [], ringN = 0, winFrames = 0, winTime = 0, lastDraw = 0, settle = 4;
  var ms = new Float32Array(64), msN = 0, sorted = new Float32Array(64), tmp = new Float32Array(RING);
  var slowSec = 0, goodSec = 0, sinceChange = 0, lastProbe = -999, probing = null, probeFails = 0;
  for (var si = 0; si < RING; si++) secs.push(0);

  function resetWindow(settleSec) { winFrames = 0; winTime = 0; ringN = 0; slowSec = 0; goodSec = 0; settle = settleSec || 3; lastDraw = 0; }
  P.resetGovernor = resetWindow;
  Events.on('loop:resume', function () { resetWindow(3); });
  Events.on('scene:changed', function () { resetWindow(4); });
  Events.on('display:resize', function (i) { if (i && (i.reason === 'resize' || i.reason === 'quality' || i.reason === 'quality-reset')) resetWindow(3); });

  function median8() {
    var n = Math.min(ringN, RING), i;
    if (n < 5) return 0;
    for (i = 0; i < n; i++) tmp[i] = secs[i];
    var a = tmp.subarray(0, n); a.sort();
    return a[n >> 1];
  }
  function logTier(why, level) { P.log.push(Math.round(Loop.realTime) + 's ' + why + ' -> tier ' + level); if (P.log.length > 12) P.log.shift(); }
  function shift(dir, why) {
    var Q = G.Quality, n = Q ? Q.level() + dir : -1;
    if (!Q || n < 0 || n > 3) return false;
    Q.set(n);
    Display.setScale(Config.scaler.maxScale, 'quality-reset');
    sinceChange = 0; resetWindow(4);
    if (dir > 0) P.drops++; else P.probes++;
    logTier(why, n);
    Events.emit('perf:tier', { level: n, reason: why });
    return true;
  }
  /* Draw-call guard (budget 150): if a frame stays above it, trim cheap ink outlines (flowers first, then the far treeline hulls). */
  var over = 0;
  function guardCalls() {
    var info = Render.renderer && Render.renderer.info && Render.renderer.info.render, calls = info ? info.calls : 0;
    P.calls = calls;
    if (calls > 150) { if (++over >= 3 && P.trim < 2) { P.trim++; over = 0; P.onTier(P.level, P.tierDef); logTier('draw calls ' + calls + ' > 150, trim ' + P.trim, P.level); } } else over = 0;
  }
  function evaluate() {
    guardCalls();
    var fps = winFrames * 1000 / Math.max(1, winTime), med, cap = P.cap, auto = G.Quality && G.Quality.mode() === 'auto';
    winFrames = 0; winTime = 0;
    P.fps = fps;
    secs[ringN % RING] = fps; ringN++;
    sinceChange += 1;
    if (Loop.paused) { P.state = 'idle'; return; }
    if (P.idle) { P.state = 'idle'; return; }
    if (settle > 0) { settle--; P.state = 'settling'; return; }
    med = median8(); P.medianFps = med;
    if (!med) { P.state = 'settling'; return; }
    var slow = med < cap * 0.80, good = med >= cap * 0.93;
    if (slow) { slowSec++; goodSec = 0; P.state = 'slow'; }
    else if (good) { goodSec++; slowSec = 0; P.state = 'stable'; }
    else { P.state = 'stable'; }
    if (!auto) return;
    var floored = Display.scale <= Config.scaler.minScale + 0.001;
    if (probing) {
      if (slowSec >= 3) { probing = null; probeFails++; shift(+1, 'probe failed'); return; }
      if (Loop.realTime > probing) { probing = null; probeFails = 0; }
    }
    if (slow && sinceChange >= 15) {
      if (slowSec >= 6 && floored) { shift(+1, 'slow, pixel ratio at floor'); return; }
      if (Loop.realTime >= 300 && slowSec >= 15 && sinceChange >= 60) { shift(+1, 'sustained slowdown (thermal)'); return; }
    }
    if (good && goodSec >= 60 && !P.indoors && !probing && G.Quality.level() > P.profile.tier &&
        Display.scale >= Config.scaler.maxScale - 0.001 && Loop.realTime - lastProbe >= 180 * (1 + Math.min(probeFails, 4))) {
      lastProbe = Loop.realTime; goodSec = 0;
      if (shift(-1, 'upward probe')) probing = Loop.realTime + 25;
    }
  }

  var origSample = Display.sample;
  Display.sample = function () { /* rAF intervals are ignored: the scaler is fed drawn-frame intervals in afterDraw */ };

  function afterDraw(now) {
    var dt = lastDraw ? now - lastDraw : 0;
    lastDraw = now;
    if (dt <= 0 || dt > 500) { winFrames = 0; winTime = 0; return; }
    ms[msN++ & 63] = dt;
    winFrames++; winTime += dt;
    if (!P.idle) origSample.call(Display, dt / 1000);
    if (winTime >= 1000) evaluate();
  }

  Render.pass.gate = gate;
  Render.pass.after = afterDraw;

  /* median of the last 64 drawn-frame intervals (ms), recomputed on demand by the overlay */
  P.frameMedian = function () {
    var n = Math.min(msN, 64), i;
    if (!n) return 0;
    for (i = 0; i < n; i++) sorted[i] = ms[i];
    var a = sorted.subarray(0, n); a.sort();
    return a[n >> 1];
  };

  P.snapshot = function () {
    var st = Render.stats ? Render.stats() : { calls: 0, triangles: 0, pixelRatio: 0 }, pr = P.profile, Q = G.Quality, C = G.Chunks ? G.Chunks.stats() : null;
    return {
      fps: Math.round(P.fps * 10) / 10, medianFps: Math.round(P.medianFps * 10) / 10, frameMs: Math.round(P.frameMedian() * 10) / 10, state: P.state,
      calls: st.calls, triangles: st.triangles, pixelRatio: Math.round(st.pixelRatio * 100) / 100, scale: Display.scale,
      tier: Q ? Q.level() : P.level, tierName: P.tierDef ? P.tierDef.name : '', mode: Q ? Q.mode() : 'auto', cap: P.cap, drawCap: P.drawCap,
      idle: P.idle, indoors: P.indoors, battery: P.battery, drops: P.drops, probes: P.probes, log: P.log.slice(),
      chunks: C, density: P.density,
      device: { dpr: pr.dpr, screen: pr.screenW + 'x' + pr.screenH, cores: pr.cores, mem: pr.mem, renderer: pr.renderer, vendor: pr.vendor, maxTex: pr.maxTex, weak: pr.weak, profileTier: pr.tier, why: pr.why },
      canvas: Display.width + 'x' + Display.height
    };
  };
})();
