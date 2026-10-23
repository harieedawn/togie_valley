/* Togie Valley - net.js (Stage 14A, multiplayer prep; NO networking).
 * Game.Net {mode:'solo', isHost:true, playerId:'p1'}; Net.rand(tag, salt) -> seeded float in [0,1) derived from Time.seed + Time.day + tag + salt.
 * Game.Players: local() -> Game.Player, get(id), list(), localId(). Remote players would be added with add(id, obj) later.
 * Load after time.js (rand reads Game.Time lazily at call time). See MULTIPLAYER_PREP.md.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.util) { console.error('[net] core.js missing'); return; }

  var Net = G.Net = { mode: 'solo', isHost: true, playerId: 'p1' };

  /* Gameplay randomness that must agree between peers: one persistent stream per tag, keyed by (Time.seed, day, tag, salt). */
  var streams = {};
  Net.rand = function (tag, salt) {
    var T = G.Time, seed = (T && T.seed) || 1, day = (T && T.day) || 1, key = seed + '|' + day + '|' + (salt || 0), s = streams[tag];
    if (!s || s.key !== key) {
      var h = 2166136261, str = key + '|' + tag, i;
      for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      s = streams[tag] = { key: key, f: G.util.rng(h >>> 0) };
    }
    return s.f();
  };

  var extra = {};
  G.Players = {
    local: function () { return G.Player; },
    localId: function () { return Net.playerId; },
    get: function (id) { return id === Net.playerId ? G.Player : (extra[id] || null); },
    list: function () { var a = [{ id: Net.playerId, player: G.Player, local: true }]; for (var k in extra) a.push({ id: k, player: extra[k], local: false }); return a; },
    add: function (id, obj) { if (id !== Net.playerId) extra[id] = obj; },
    remove: function (id) { delete extra[id]; }
  };
})();
