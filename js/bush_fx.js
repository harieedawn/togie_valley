/* Togie Valley - bush_fx.js (Stage 14A). Bushes are passable; stepping onto a bush tile emits player:bush {tx,tz}.
 * Game.BushFx: isBush(tx,tz), count(). Tile set comes from Decor.layout.bushTiles + Scenery.layout.bushTiles (outdoor only).
 * No meshes, no draw calls. Depends on: decor.js, scenery.js, player.js, audio.js (optional listener there).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Loop || !G.Player || !G.Scenes) { console.error('[bush_fx] missing deps'); return; }
  var set = null, last = '', lastT = 0, B = G.BushFx = {};

  function collect() {
    set = {};
    [G.Decor && G.Decor.layout, G.Scenery && G.Scenery.layout].forEach(function (l) {
      if (l && l.bushTiles) l.bushTiles.forEach(function (c) { set[c[0] + ',' + c[1]] = 1; });
    });
  }
  B.isBush = function (tx, tz) { if (!set) collect(); return !!set[tx + ',' + tz]; };
  B.count = function () { if (!set) collect(); return Object.keys(set).length; };

  G.Loop.onFrame(function () {
    if (G.Scenes.current !== 'outdoor') { last = ''; return; }
    var p = G.Player.pos, tx = Math.floor(p.x), tz = Math.floor(p.z), k = tx + ',' + tz;
    if (k === last) return;
    last = k;
    if (!B.isBush(tx, tz)) return;
    var now = performance.now();
    if (now - lastT < 300) return;   // throttle 0.3 s
    lastT = now;
    G.Events.emit('player:bush', { tx: tx, tz: tz });
  }, 50);
})();
