/* Togie Valley - interact.js (Stage 1)
 * Game.Interact: handler registry + tap routing. register({id,priority,test(tx,tz,scene)->target|null,
 * stand(target)->{tx,tz,facing}|null, run(target,done)}), resolve(tx,tz), useFacing().
 * Highest priority returning a target (and a stand tile) wins. Default handler (priority -100) walks to World
 * interactables and emits interact:<type> {id}.
 * Depends on core.js, render.js, models.js, world.js, scenes.js, player.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Player || !G.Scenes || !G.World || !G.Models) { console.error('[interact] missing deps'); return; }
  var E = G.Events, P = G.Player, W = G.World, Scenes = G.Scenes;
  var I = {}, handlers = [], token = 0;

  I.register = function (h) {
    if (!h || !h.id || typeof h.test !== 'function') { console.error('[interact] register needs id + test()'); return; }
    h.priority = h.priority || 0;
    for (var i = 0; i < handlers.length; i++) if (handlers[i].id === h.id) { handlers.splice(i, 1); break; }
    handlers.push(h);
    handlers.sort(function (a, b) { return b.priority - a.priority; });
  };
  I.unregister = function (id) {
    for (var i = 0; i < handlers.length; i++) if (handlers[i].id === id) { handlers.splice(i, 1); return; }
  };

  /** -> {handler, target, stand:{tx,tz,facing}} or null. */
  I.resolve = function (tx, tz) {
    for (var i = 0; i < handlers.length; i++) {
      var h = handlers[i], t = h.test(tx, tz, Scenes.current);
      if (!t) continue;
      var st = typeof h.stand === 'function' ? h.stand(t) : { tx: tx, tz: tz, facing: P.facing };
      if (st) return { handler: h, target: t, stand: st };
    }
    return null;
  };

  function execute(res) {
    var my = ++token;
    P.walkTo(res.stand.tx, res.stand.tz, function () {
      if (my !== token) return;
      if (res.stand.facing) P.face(res.stand.facing);
      if (typeof res.handler.run === 'function') res.handler.run(res.target, function () {});
    }, function () { /* unreachable / stuck: stay quiet */ });
  }

  /** Action button: use the tile in front of the player (or the one underfoot, e.g. a seat). */
  I.useFacing = function () {
    if (P.isLocked()) return false;
    var f = P.frontTile(), res = I.resolve(f.tx, f.tz);
    if (!res) { var t = P.tile(); res = I.resolve(t.tx, t.tz); }
    if (!res) return false;
    if (res.stand.facing) P.face(res.stand.facing);
    if (typeof res.handler.run === 'function') res.handler.run(res.target, function () {});
    return true;
  };

  /* --------------------------------------------------- default (World) handler */
  var FOOT = { house: 'door', shop: 'shop', workshop: 'workshop', stall: 'fishstall' };
  I.register({
    id: 'world-default', priority: -100,
    test: function (tx, tz, scene) {
      if (scene !== 'outdoor') return null;
      var tt = W.tileType(tx + 0.5, tz + 0.5), list, i;
      if (FOOT[tt]) { list = W.listInteractables(FOOT[tt]); return list[0] || null; }
      list = W.listInteractables();
      for (i = 0; i < list.length; i++) if (list[i].tile.tx === tx && list[i].tile.tz === tz) return list[i];
      return null;
    },
    stand: function (a) { return { tx: a.stand.tx, tz: a.stand.tz, facing: a.facing }; },
    run: function (a, done) { E.emit('interact:' + a.type, { id: a.id }); done(); }
  });

  /* ---------------------------------------------------------------- tap routing */
  function handleTap(e) {
    if (P.isLocked()) return;
    var tile = G.Render.screenToTile(e.x, e.y, 0);
    if (!tile) return;
    var res = I.resolve(tile.tx, tile.tz);
    if (res) { execute(res); return; }
    token++;
    if (!Scenes.isWalkableTile(tile.tx, tile.tz)) return;
    P.walkTo(tile.tx, tile.tz);
  }
  I.handleTap = handleTap;
  // One buffered next action while a locking clip plays (Stage 15D D0): replayed the moment the clip releases the player.
  E.on('input:tap', function (e) {
    if (P.isLocked()) { if (G.AnimClips) G.AnimClips.buffer(function () { handleTap(e); }); return; }
    handleTap(e);
  });
  E.on('input:action', function () {
    if (P.isLocked()) { if (G.AnimClips) G.AnimClips.buffer(function () { I.useFacing(); }); return; }
    I.useFacing();
  });

  G.Interact = I;
})();
