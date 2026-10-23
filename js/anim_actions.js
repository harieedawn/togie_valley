/* Togie Valley - anim_actions.js (Stage 15D Part 2): wires the non-farm clips to the game and spawns their impact effects.
 * sit/stand (player:sat/stood), sleep/wake (house.js calls Player.playAction), buy (shop:transaction), sell (bin/crate closed with more value),
 * cook (cook:done), level-up (skill:levelUp, queued behind any running clip; seated variant on the pier), shake-off after rain (CharAnim idle),
 * plus emote marks and sparkle/coin bursts on anim:impact. Depends on AnimClips, AnimTools, FarmFx (particles), CharAnim.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.AnimClips || !G.Player || !G.Events || !G.Loop) { console.error('[anim_actions] missing dependencies'); return; }
  var P = G.Player, E = G.Events, C = G.AnimClips, AT = G.AnimTools, FX = G.FarmFx, hero = P.hero;
  var _v = new THREE.Vector3(), lvPending = 0, DIRV = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  function head(out) { hero.joints.head.getWorldPosition(out); return out; }
  function fx() { return FX && FX.fx; }

  /* ---- seat transitions (no lock: the fishing module locks while seated) */
  E.on('player:sat', function () { P.playAction('sit', {}); });
  E.on('player:stood', function () { P.playAction('stand', {}); });

  /* ---- shopping */
  E.on('shop:transaction', function (e) { if (e && e.kind !== 'upgrade' && !C.active()) P.playAction('buy', {}); });

  /* ---- cooking: the kitchen panel stays open; the hero stirs behind it */
  E.on('cook:done', function () { P.playAction('cook', {}); });

  /* ---- level-up waits for the running clip, then jumps (or cheers when seated) */
  E.on('skill:levelUp', function () { lvPending = 1; });
  G.Loop.onFrame(function () {
    if (!lvPending || C.active()) return;
    lvPending = 0; P.playAction(P.sitting ? 'levelup_seated' : 'levelup', {});
  }, 101.5);

  /* ---- impact effects */
  E.on('anim:impact', function (e) {
    var f = fx(), d, i;
    if (!e) return;
    if (e.name === 'sleep' && AT && (e.stage === 'zz')) { head(_v); AT.emote('z', _v.x + 0.18, _v.y + 0.35, _v.z, 1.3, 0.55); }
    else if (e.name === 'wake' && e.stage === 'hit' && f) { head(_v); f.burst(_v.x, _v.y + 0.15, _v.z, 6, 0xfff1a8, 0.9, 2.2, 0.04, 5, 0.6); }
    else if (e.name === 'buy' && e.stage === 'hit' && f) {
      d = DIRV[P.facing] || DIRV.s; hero.attach.handR.getWorldPosition(_v);
      for (i = 0; i < 4; i++) f.spawn(_v.x, _v.y, _v.z, d[0] * (1 + Math.random()) , 1.6 + Math.random(), d[1] * (1 + Math.random()), 0xf5c542, 0.04, 6, 0.5);
    } else if (e.name === 'sell' && e.stage === 'hit' && f) {
      d = DIRV[P.facing] || DIRV.s; hero.attach.handR.getWorldPosition(_v);
      for (i = 0; i < 5; i++) f.spawn(_v.x, _v.y, _v.z, d[0] * (1.4 + Math.random()), 2 + Math.random(), d[1] * (1.4 + Math.random()), i % 2 ? 0xf5c542 : 0xffffff, 0.04, 7, 0.55);
    } else if ((e.name === 'levelup' || e.name === 'levelup_seated') && f) {
      head(_v);
      if (e.stage === 'hit') { f.burst(P.pos.x, _v.y - 0.3, P.pos.z, 14, 0xfff1a8, 1.5, 3.2, 0.05, 6, 0.9); if (G.FishingFx) G.FishingFx.confetti(P.pos.x, _v.y + 0.2, P.pos.z, 14); }
      else if (e.stage === 'land') f.burst(P.pos.x, 0.05, P.pos.z, 6, 0xf6e8c8, 1.1, 0.8, 0.05, 6, 0.5);
    } else if (e.name === 'cook' && f && (e.stage === 'stir' || e.stage === 'done')) {
      d = DIRV[P.facing] || DIRV.s; hero.attach.handR.getWorldPosition(_v);
      f.burst(_v.x + d[0] * 0.2, _v.y + 0.1, _v.z + d[1] * 0.2, e.stage === 'done' ? 8 : 3, e.stage === 'done' ? 0xfff1a8 : 0xf4f4f4, 0.4, 1.2, 0.035, 3, 0.6);
    } else if (e.name === 'shake' && f && e.stage === 'drops') { head(_v); f.burst(_v.x, _v.y - 0.2, _v.z, 10, 0x9fdcff, 1.4, 1.2, 0.03, 8, 0.5); }
    else if (e.name === 'drink' && f && e.stage === 'gulp') { head(_v); d = DIRV[P.facing] || DIRV.s; f.burst(_v.x + d[0] * 0.2, _v.y + 0.1, _v.z + d[1] * 0.2, 2, 0x9fdcff, 0.3, 0.8, 0.025, 6, 0.4); }
  });
})();
