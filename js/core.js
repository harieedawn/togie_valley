/* Togie Valley - core.js
 * Game namespace, Config, util, event bus, display (resize/DPR/dynamic resolution), fixed-timestep loop.
 * Depends on: nothing. Must load first.
 */
(function () {
  'use strict';

  var Game = window.Game = window.Game || {};
  Game.VERSION = '0.1.0';

  /* ------------------------------------------------------------------ Config */
  var Config = Game.Config = {
    tile: 1, // world units per grid tile (x/z plane, y up)

    loop: { fixedStep: 1 / 60, maxFrameDelta: 0.25, maxSubSteps: 5 },

    display: { maxDpr: 2, minPixelRatio: 0.6 },

    // Dynamic resolution scaler (multiplies the pixel ratio).
    scaler: {
      enabled: true,
      targetFps: 60,
      lowRatio: 0.82,   // fps < target * lowRatio  -> scale down
      highRatio: 0.95,  // fps >= target * highRatio for upAfterWindows -> scale up
      interval: 1.0,    // seconds per measurement window
      warmupWindows: 2,
      minScale: 0.5,
      maxScale: 1.0,
      stepDown: 0.1,
      stepUp: 0.05,
      upAfterWindows: 4,
      holdAfterDownWindows: 6
    },

    render: {
      antialias: true,
      bands: [0.12, 0.52],        // n.l thresholds: shade | mid | lit
      halftoneCell: 4.5,          // CSS px per halftone cell (multiplied by pixel ratio)
      halftoneStrength: 0.9,      // 0..1 darkness of dots in shade band
      outlineWidth: 2.8,          // CSS px
      outlineWobble: 1.0,         // CSS px jitter
      wobbleFps: 8,
      grain: 0.07,                // paper grain alpha
      grainSize: 1.0,             // CSS px
      vignette: 0.38,
      fogNear: 22,
      fogFar: 70,
      inkColor: 0x2b1f33,
      shadowColor: 0x1c1633,
      shadowOpacity: 0.32,
      vignetteColor: 0x1a1226
    },

    camera: {
      near: 0.5,
      far: 150,
      followLambda: 6,
      yawLambda: 7,
      presetLambda: 4,
      zoomLambda: 8,
      portraitBoost: 0.55,        // distance *= (1/aspect)^boost when aspect < 1
      zoomMin: 0.6,
      zoomMax: 1.6,
      presets: {                  // pitch in degrees
        outdoor: { distance: 14, pitch: 52, fov: 34, lookHeight: 0.5 },
        indoor: { distance: 8.5, pitch: 58, fov: 36, lookHeight: 0.6 }
      }
    }
  };

  /* -------------------------------------------------------------------- util */
  var util = Game.util = {
    clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    damp: function (cur, target, lambda, dt) { return cur + (target - cur) * (1 - Math.exp(-lambda * dt)); },
    smoothstep: function (e0, e1, x) {
      var t = (x - e0) / (e1 - e0);
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      return t * t * (3 - 2 * t);
    },
    wrapAngle: function (a) {
      var t = Math.PI * 2;
      a = (a + Math.PI) % t;
      if (a < 0) a += t;
      return a - Math.PI;
    },
    lerpAngle: function (a, b, t) { return a + util.wrapAngle(b - a) * t; },
    // Seeded PRNG (mulberry32) -> function returning [0,1)
    rng: function (seed) {
      var s = seed >>> 0;
      return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    tileOf: function (v) { return Math.floor(v / Config.tile); },          // world coord -> tile index
    tileCenter: function (i) { return (i + 0.5) * Config.tile; }           // tile index -> world coord of center
  };

  /* ------------------------------------------------------------------ Events */
  var Events = Game.Events = (function () {
    var map = Object.create(null);

    function removeEntry(name, entry) {
      var l = map[name];
      if (!l) return;
      var i = l.indexOf(entry);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) delete map[name];
    }

    function add(name, fn, ctx, once) {
      var entry = { fn: fn, ctx: ctx, once: once };
      (map[name] || (map[name] = [])).push(entry);
      return function () { removeEntry(name, entry); };
    }

    return {
      on: function (name, fn, ctx) { return add(name, fn, ctx, false); },
      once: function (name, fn, ctx) { return add(name, fn, ctx, true); },
      off: function (name, fn, ctx) {
        var l = map[name];
        if (!l) return;
        if (!fn) { delete map[name]; return; }
        for (var i = l.length - 1; i >= 0; i--) {
          if (l[i].fn === fn && (ctx === undefined || l[i].ctx === ctx)) l.splice(i, 1);
        }
        if (!l.length) delete map[name];
      },
      // emit(name, payload). Handlers get (payload, name). '*' handlers receive every event.
      emit: function (name, data) {
        var lists = [map[name], map['*']];
        for (var k = 0; k < 2; k++) {
          var l = lists[k];
          if (!l) continue;
          l = l.slice();
          for (var i = 0; i < l.length; i++) {
            var h = l[i];
            if (h.once) removeEntry(k === 0 ? name : '*', h);
            try { h.fn.call(h.ctx, data, name); } catch (err) { console.error('[events] handler error for "' + name + '"', err); }
          }
        }
      }
    };
  })();

  /* ----------------------------------------------------------------- Display */
  var sc = Config.scaler;
  var scState = { acc: 0, frames: 0, warm: 0, low: 0, high: 0, hold: 0, settle: 0 };
  var resizeTimer = 0;

  var Display = Game.Display = {
    canvas: null,
    width: 1,           // CSS px
    height: 1,
    aspect: 1,
    dpr: 1,             // device pixel ratio
    scale: 1,           // dynamic resolution scale (minScale..maxScale)
    pixelRatio: 1,      // effective renderer pixel ratio = clamp(min(dpr,maxDpr) * scale)
    scaler: { enabled: sc.enabled, targetFps: sc.targetFps, fps: 0 },

    // Measure the canvas; does NOT emit. Render.init reads the values afterwards.
    init: function (canvas) {
      Display.canvas = canvas;
      Display.scaler.enabled = sc.enabled;
      Display.scaler.targetFps = sc.targetFps;
      measure(false, 'init');
      window.addEventListener('resize', schedule);
      window.addEventListener('orientationchange', schedule);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
      return Display;
    },

    info: function (reason) {
      return {
        width: Display.width, height: Display.height, aspect: Display.aspect, dpr: Display.dpr,
        scale: Display.scale, pixelRatio: Display.pixelRatio, reason: reason || 'info'
      };
    },

    refresh: function (reason) { measure(true, reason || 'refresh'); },

    setScale: function (s, reason) {
      s = util.clamp(Math.round(s * 20) / 20, sc.minScale, sc.maxScale);
      if (s === Display.scale) return;
      Display.scale = s;
      scState.acc = 0; scState.frames = 0; scState.settle = 1;
      measure(true, reason || 'scale');
    },

    setTargetFps: function (n) { Display.scaler.targetFps = n; },

    // Called by the loop once per rendered frame with real (clamped) dt.
    sample: function (dt) {
      var s = Display.scaler;
      if (!s.enabled || dt <= 0) return;
      scState.acc += dt;
      scState.frames++;
      if (scState.acc < sc.interval) return;
      var fps = scState.frames / scState.acc;
      scState.acc = 0; scState.frames = 0;
      s.fps = fps;
      if (scState.settle > 0) { scState.settle--; return; }
      if (scState.warm < sc.warmupWindows) { scState.warm++; return; }
      if (fps < s.targetFps * sc.lowRatio) {
        scState.low++; scState.high = 0;
        scState.hold = sc.holdAfterDownWindows;
        Display.setScale(Display.scale - sc.stepDown, 'scaler-down');
      } else if (fps >= s.targetFps * sc.highRatio) {
        scState.low = 0;
        if (scState.hold > 0) { scState.hold--; return; }
        scState.high++;
        if (scState.high >= sc.upAfterWindows && Display.scale < sc.maxScale) {
          scState.high = 0;
          Display.setScale(Display.scale + sc.stepUp, 'scaler-up');
        }
      } else {
        scState.low = 0; scState.high = 0;
        if (scState.hold > 0) scState.hold--;
      }
    }
  };

  function measure(emit, reason) {
    var c = Display.canvas;
    var w = Math.max(1, (c && c.clientWidth) || window.innerWidth || 1);
    var h = Math.max(1, (c && c.clientHeight) || window.innerHeight || 1);
    var dpr = window.devicePixelRatio || 1;
    var cfg = Config.display;
    var pr = util.clamp(Math.min(dpr, cfg.maxDpr) * Display.scale, cfg.minPixelRatio, cfg.maxDpr);
    var changed = (w !== Display.width) || (h !== Display.height) || Math.abs(pr - Display.pixelRatio) > 1e-4;
    Display.width = w; Display.height = h; Display.aspect = w / h;
    Display.dpr = dpr; Display.pixelRatio = pr;
    if (emit && changed) Events.emit('display:resize', Display.info(reason));
  }

  function schedule() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { measure(true, 'resize'); }, 60);
  }

  /* -------------------------------------------------------------------- Loop */
  function FnList() { this.items = []; this.snap = []; this.seq = 0; }
  FnList.prototype.add = function (fn, priority) {
    var e = { fn: fn, p: priority || 0, n: this.seq++ };
    var self = this;
    this.items.push(e);
    this.items.sort(function (a, b) { return (a.p - b.p) || (a.n - b.n); });
    this.snap = this.items.slice();
    return function () {
      var i = self.items.indexOf(e);
      if (i >= 0) { self.items.splice(i, 1); self.snap = self.items.slice(); }
    };
  };
  FnList.prototype.run = function (a, b, c) {
    var s = this.snap;
    for (var i = 0; i < s.length; i++) {
      try { s[i].fn(a, b, c); } catch (err) { console.error('[loop] callback error', err); }
    }
  };

  var updaters = new FnList();
  var frameFns = new FnList();
  var reasons = Object.create(null);
  var reasonCount = 0;
  var raf = 0, last = 0, acc = 0;

  var Loop = Game.Loop = {
    step: Config.loop.fixedStep,
    timeScale: 1,
    simTime: 0,      // seconds of simulated time (fixed steps)
    realTime: 0,     // seconds of running (unpaused) frame time
    frame: 0,
    alpha: 0,        // interpolation factor of the last frame (0..1)
    fps: 60,         // smoothed
    running: false,
    paused: false,

    // fn(dt) at fixed step; lower priority runs first (default 0). Returns remover.
    onUpdate: function (fn, priority) { return updaters.add(fn, priority); },
    // fn(frameDt, alpha, realTime) once per rendered frame. Returns remover.
    onFrame: function (fn, priority) { return frameFns.add(fn, priority); },

    start: function () {
      if (Loop.running) return;
      Loop.running = true;
      Loop.step = Config.loop.fixedStep;
      last = performance.now();
      acc = 0;
      if (!Loop.paused) raf = requestAnimationFrame(tick);
    },

    stop: function () {
      Loop.running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },

    pause: function (reason) {
      reason = reason || 'manual';
      if (!reasons[reason]) { reasons[reason] = true; reasonCount++; }
      if (!Loop.paused) {
        Loop.paused = true;
        cancelAnimationFrame(raf);
        raf = 0;
        Events.emit('loop:pause', { reason: reason });
      }
    },

    resume: function (reason) {
      reason = reason || 'manual';
      if (reasons[reason]) { delete reasons[reason]; reasonCount--; }
      if (Loop.paused && reasonCount === 0) {
        Loop.paused = false;
        last = performance.now();
        acc = 0;
        if (Loop.running) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
        Events.emit('loop:resume', { reason: reason });
      }
    }
  };

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (Loop.paused) return;
    var lc = Config.loop;
    var dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > lc.maxFrameDelta) dt = lc.maxFrameDelta;

    Loop.frame++;
    Loop.realTime += dt;
    if (dt > 0) Loop.fps += (1 / dt - Loop.fps) * 0.05;
    Display.sample(dt);

    var step = Loop.step;
    acc += dt * Loop.timeScale;
    var n = 0;
    while (acc >= step && n < lc.maxSubSteps) {
      updaters.run(step);
      acc -= step;
      Loop.simTime += step;
      n++;
    }
    if (acc >= step) acc = 0; // drop backlog after a long hitch
    Loop.alpha = acc / step;
    frameFns.run(dt, Loop.alpha, Loop.realTime);
  }

  // Pause when the tab is hidden.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) Loop.pause('hidden'); else Loop.resume('hidden');
  });
  if (document.hidden) Loop.pause('hidden');
})();

/* Stage 10.5: shared Vietnamese labels (player-facing text is Vietnamese, written directly in source). */
Game.VI = {
  season: { spring: 'Mùa xuân', summer: 'Mùa hạ', autumn: 'Mùa thu', winter: 'Mùa đông' },
  seasonLow: { spring: 'mùa xuân', summer: 'mùa hạ', autumn: 'mùa thu', winter: 'mùa đông' },
  weather: { sun: 'Nắng', rain: 'Mưa', snow: 'Tuyết' },
  quality: ['Thường', 'Bạc', 'Vàng']
};
