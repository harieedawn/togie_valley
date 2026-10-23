/* Togie Valley - scenes.js (Stage 1)
 * Game.Scenes: register(name,{enter(spawn),exit(),walkable?(tx,tz) (alias isWalkable),camera?,frame?:{cx,cz,w,d}}), go(name,spawn,opts), current.
 * spawn = {tx,tz,facing} (tile + 'n|e|s|w') or {x,z,yaw}. opts.instant skips the 300ms fade.
 * Registers the 'outdoor' scene (World + Decor + Town groups). Event: scene:changed {from,to}.
 * Depends on core.js, render.js, world.js; uses Game.Player lazily.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Render) { console.error('[scenes] missing deps'); return; }
  var E = G.Events, defs = {}, fade = null, busy = false, queue = null;
  var FADE_MS = 300;
  var Scenes = { current: null };

  function ensureFade() {
    if (fade) return fade;
    fade = document.createElement('div');
    fade.id = 'scene-fade';
    fade.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:#2b1f2e;opacity:0;pointer-events:none;' +
      'transition:opacity ' + FADE_MS + 'ms ease;z-index:50';
    var ui = document.getElementById('ui') || document.body;
    ui.appendChild(fade);
    return fade;
  }
  function setFade(on, cb) {
    var f = ensureFade();
    f.style.pointerEvents = on ? 'auto' : 'none';
    f.style.opacity = on ? '1' : '0';
    setTimeout(cb, FADE_MS + 20);
  }

  Scenes.register = function (name, def) {
    if (!name || !def || typeof def.enter !== 'function') { console.error('[scenes] register needs name + enter()'); return; }
    defs[name] = def;
  };

  /** Walkability for the current scene (outdoor = World). */
  Scenes.isWalkableTile = function (tx, tz) {
    var d = defs[Scenes.current];
    var fn = d && (d.walkable || d.isWalkable);
    if (typeof fn === 'function') return !!fn.call(d, tx, tz);
    return !!(G.World && G.World.isWalkableTile(tx, tz));
  };

  /** Single place that derives visibility of outdoor-only objects living in the root scene.
   *  Modules register them with Scenes.outdoorOnly(obj); indoors they are forced hidden every frame (priority 899,
   *  after the modules' own frame updates), outdoors the modules stay in charge of their own visibility. */
  var outOnly = [];
  Scenes.outdoor = true;
  Scenes.outdoorOnly = function (o) { if (o && outOnly.indexOf(o) < 0) outOnly.push(o); return o; };
  function hideIndoor() { for (var i = 0; i < outOnly.length; i++) outOnly[i].visible = false; }
  function applyRootVisibility(name) {
    Scenes.outdoor = name === 'outdoor';
    if (!Scenes.outdoor) hideIndoor();
    var h = G.Decor && G.Decor.house, sh = h && h.userData.shadow;
    if (sh && sh.mesh) sh.mesh.visible = Scenes.outdoor;
  }
  G.Loop.onFrame(function () { if (!Scenes.outdoor) hideIndoor(); }, 899);

  function swap(name, spawn) {
    var from = Scenes.current, old = defs[from], d = defs[name], P = G.Player;
    if (old) { if (typeof old.exit === 'function') old.exit(); }
    else {                                // first swap (boot / load): nothing is current, so hide every other scene
      for (var k in defs) if (k !== name && typeof defs[k].exit === 'function') defs[k].exit();
    }
    Scenes.current = name;
    if (P) P.scene = name;
    d.enter(spawn || {});
    applyRootVisibility(name);
    if (P && P.placeAt) P.placeAt(spawn || {});
    var rig = G.Render.rig;
    rig.setPreset(d.camera || (name === 'outdoor' ? 'outdoor' : 'indoor'), true);
    if (d.frame) {                       // fixed framing (indoor rooms): fit the whole room, any aspect
      rig.setFrame(d.frame);
      rig.setTarget(d.frame.cx, 0, d.frame.cz, true);
    } else {
      rig.setFrame(null);
      if (P && P.root) rig.follow(P.root, true);
    }
    rig.snap();
    E.emit('scene:changed', { from: from, to: name });
  }

  Scenes.has = function (name) { return !!defs[name]; };

  Scenes.go = function (name, spawn, opts) {
    opts = opts || {};
    if (!defs[name]) { console.error('[scenes] unknown scene: ' + name); return; }
    if (busy) { queue = [name, spawn, opts]; return; }
    var P = G.Player;
    if (opts.instant || !Scenes.current) { swap(name, spawn); return; }
    busy = true;
    if (P) P.lock('scene');
    setFade(true, function () {
      swap(name, spawn);
      setFade(false, function () {
        busy = false;
        if (P) P.unlock('scene');
        if (queue) { var q = queue; queue = null; Scenes.go(q[0], q[1], q[2]); }
      });
    });
  };

  /* ------------------------------------------------------------ outdoor scene */
  function outdoorGroups() { return [G.World && G.World.group, G.Decor && G.Decor.group, G.Town && G.Town.group, G.Farm && G.Farm.group, G.Scenery && G.Scenery.group]; }
  function showOutdoor(v) {
    outdoorGroups().forEach(function (g) { if (g) g.visible = v; });
    var h = G.Decor && G.Decor.house, sh = h && h.userData.shadow;   // blob shadows live in the root scene
    if (sh) sh.mesh.visible = v;
  }

  Scenes.register('outdoor', {
    camera: 'outdoor',
    enter: function () { showOutdoor(true); },
    exit: function () { showOutdoor(false); }
  });

  G.Scenes = Scenes;
})();
