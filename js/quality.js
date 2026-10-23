/* Togie Valley - quality.js (Stage 13 + 14B): PWA registration, quality tiers, context-loss recovery.
 * Tiers (Stage 14B, level 0..3): 0 Cao, 1 Vua, 2 Thap, 3 Sieu nhe (table in TIERS: pixel-ratio cap, halftone, grain/vignette pass, sky pass, outline width + wobble rate,
 * fps cap, flower / particle / critter density, sway, far scenery density). Last auto tier kept in togie-valley/quality (device-level, not in save slots);
 * the user's choice (auto | 0..3) is kept in togie-valley/gfx. The governor in perf.js moves the tier in auto mode only. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Config || !G.Display || !G.Events || !G.Render) { console.error('[quality] missing dependencies'); return; }
  var Config = G.Config, Display = G.Display, Events = G.Events;
  var KEY = 'togie-valley/quality', GFX = 'togie-valley/gfx', level = 0, base = null;
  var TIERS = [
    { name: 'Cao',      pr: 0,    halftone: 1, grain: 1,   overlay: 1, sky: 1, outline: 1,    wobble: 0, fps: 60, flower: 1,    particle: 1,    critter: 1,    sway: 1,   far: 1,    flowerOutline: 1 },
    { name: 'Vừa',      pr: 1.5,  halftone: 0, grain: 0.6, overlay: 1, sky: 1, outline: 0.85, wobble: 6, fps: 60, flower: 0.8,  particle: 0.8,  critter: 0.8,  sway: 1,   far: 0.85, flowerOutline: 1 },
    { name: 'Thấp',     pr: 1.25, halftone: 0, grain: 0,   overlay: 0, sky: 1, outline: 0.7,  wobble: 4, fps: 45, flower: 0.55, particle: 0.55, critter: 0.5,  sway: 0.5, far: 0.6,  flowerOutline: 0 },
    { name: 'Siêu nhẹ', pr: 1,    halftone: 0, grain: 0,   overlay: 0, sky: 0, outline: 0.6,  wobble: 2, fps: 30, flower: 0.3,  particle: 0.3,  critter: 0.25, sway: 0,   far: 0.35, flowerOutline: 0 }
  ];
  function clampT(n) { n = n | 0; return n < 0 ? 0 : n > 3 ? 3 : n; }
  function readGfx() { try { var v = localStorage.getItem(GFX); return v === null || v === 'auto' ? 'auto' : String(clampT(parseInt(v, 10) || 0)); } catch (e) { return 'auto'; } }
  function writeGfx(v) { try { localStorage.setItem(GFX, String(v)); } catch (e) { /* ignore */ } }
  var mode = readGfx();

  function readLs() { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; } }
  function writeLs(v) { try { localStorage.setItem(KEY, String(v)); } catch (e) { /* ignore */ } }
  function refresh(reason) { Display.refresh(reason); Events.emit('display:resize', Display.info(reason)); }

  function apply(n, silent) {
    var r = Config.render, T;
    n = clampT(n); T = TIERS[n];
    if (!base) base = { h: r.halftoneStrength, o: r.outlineWidth, g: r.grain, d: Config.display.maxDpr, w: r.wobbleFps };
    level = n;
    r.halftoneStrength = base.h * T.halftone;
    r.outlineWidth = base.o * T.outline;
    r.grain = base.g * T.grain;
    r.wobbleFps = T.wobble || base.w;
    Config.display.maxDpr = T.pr ? Math.min(base.d, T.pr) : base.d;
    if (G.Perf) G.Perf.onTier(n, T);
    if (!silent) { writeLs(n); refresh('quality'); }
    Events.emit('quality:changed', { level: n, tier: T.name });
  }

  /* WebGL context loss: the loop is paused by render.js; on restore make sure sizes/uniforms are re-applied. */
  Events.on('render:contextrestored', function () { refresh('contextrestored'); });

  /* Starting tier: manual choice, else the device profile (weak phones never start at tier 0) combined with the last auto tier. */
  apply(mode === 'auto' ? (G.Perf ? G.Perf.startTier() : readLs()) : parseInt(mode, 10), true);

  G.Quality = {
    tiers: TIERS,
    level: function () { return level; },
    set: function (n) { apply(clampT(n)); },
    def: function (n) { return TIERS[clampT(n === undefined ? level : n)]; },
    mode: function () { return mode; },
    /* m = 'auto' | 0..3 (device-level setting; auto lets the governor in perf.js move the tier) */
    setMode: function (m) {
      mode = m === 'auto' ? 'auto' : String(clampT(parseInt(m, 10) || 0));
      writeGfx(mode);
      if (mode === 'auto') { var t = G.Perf ? G.Perf.profile.tier : 0; writeLs(t); apply(t); if (G.Perf) G.Perf.resetGovernor(4); }
      else apply(parseInt(mode, 10));
      Display.setScale(Config.scaler.maxScale, 'quality-reset');
      Events.emit('quality:mode', { mode: mode });
    }
  };

  /* PWA: register the service worker (https or localhost only). Stage 14C: skipped inside the Capacitor app (everything is bundled). */
  if (!window.Capacitor && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.error('[pwa] sw failed', e); }); });
  }
})();
