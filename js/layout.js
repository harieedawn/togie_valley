/* Togie Valley - layout.js (Stage 10.5): pure decor layout + solid-prop registry data, no THREE.
 * Readable by the browser (Game.Layout) and by node (module.exports, used by tools/check.js).
 * scatter(o): o = {W,H,seed,type(tx,tz)->tile type,markers(name)->[{tx,tz}],isFarm(tx,tz)->bool}
 *   -> {trees,bushes,flowers,rocks:[{x,z,ry,s}], singles:[{name,tx,tz,ry}], solids:[[tx,tz]]}
 * Solid props (trees, rocks, singles) are listed in `solids`; bushes are passable and listed in `bushTiles`; flowers/grass are never solid.
 */
(function (root) {
  'use strict';
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var SINGLES = [   // [marker, prop, dx, dz, ry]
    ['door', 'mailbox', -2, 1, 0.3], ['door', 'lamp', 3, 1, 0], ['shopCounter', 'sign', -1, 1, 0],
    ['shopCounter', 'bench', 2, 2, 0], ['fishStall', 'barrel', 1, 1, 0], ['workshopCounter', 'barrel', 1, 1, 0]
  ];
  function scatter(o) {
    var W = o.W, H = o.H, rnd = rng(o.seed || 1234), tx, tz, i, j, a, r, near = [], out = { trees: [], bushes: [], flowers: [], rocks: [], singles: [], solids: [], bushTiles: [] };
    function grass(x, z) { return o.type(x, z) === 'grass'; }
    ['door', 'shopCounter', 'workshopCounter', 'fishStall', 'bin'].forEach(function (n) { o.markers(n).forEach(function (m) { near.push(m); }); });
    function clear(x, z, d) { for (var k = 0; k < near.length; k++) if (Math.abs(near[k].tx - x) < d && Math.abs(near[k].tz - z) < d) return false; return true; }
    function jit(x, z, list, sMin, sMax, solid) {
      list.push({ x: x + 0.5 + (rnd() - 0.5) * 0.5, z: z + 0.5 + (rnd() - 0.5) * 0.5, ry: rnd() * 6.28, s: sMin + rnd() * (sMax - sMin) });
      if (solid) out.solids.push([x, z]);
    }
    function treeRoom(x, z) { for (var q = 0; q < out.trees.length; q++) { var t = out.trees[q], dx = t.x - x - 0.5, dz = t.z - z - 0.5; if (dx * dx + dz * dz < 3.2 * 3.2) return false; } return true; }   // natural spacing
    for (tz = 0; tz < H; tz++) for (tx = 0; tx < W; tx++) {
      if (!grass(tx, tz)) continue;
      r = rnd(); a = rnd();
      var edge = tx < 2 || tz < 2 || tx > W - 3 || tz > H - 3, farm = o.isFarm(tx, tz);
      if (farm || !clear(tx, tz, 4)) { if (!farm && r < 0.03 && clear(tx, tz, 2)) jit(tx, tz, out.flowers, 0.9, 1.1); continue; }
      var open = true;
      for (j = -1; j <= 1 && open; j++) for (i = -1; i <= 1; i++) if (!grass(tx + i, tz + j)) { open = false; break; }
      if (out.trees.length < 70 && ((edge && r < 0.2) || (open && r < 0.025)) && treeRoom(tx, tz)) jit(tx, tz, out.trees, 0.85, 1.25, true);   // Stage 10.7: fewer, bigger trees (Scenery styles them)
      else if (out.bushes.length < 60 && r < 0.1 && a < 0.5) { jit(tx, tz, out.bushes, 0.8, 1.2, false); out.bushTiles.push([tx, tz]); }   // Stage 14A: bushes are passable (not in solids)
      else if (out.flowers.length < 80 && r < 0.16) jit(tx, tz, out.flowers, 0.9, 1.1);
    }
    SINGLES.forEach(function (s) {
      var m = o.markers(s[0])[0];
      if (m && grass(m.tx + s[2], m.tz + s[3])) { out.singles.push({ name: s[1], tx: m.tx + s[2], tz: m.tz + s[3], ry: s[4] }); out.solids.push([m.tx + s[2], m.tz + s[3]]); }
    });
    for (i = 0; i < 6; i++) {
      tx = 2 + Math.floor(rnd() * (W - 4)); tz = 2 + Math.floor(rnd() * (H - 4));
      if (grass(tx, tz) && clear(tx, tz, 4) && !o.isFarm(tx, tz)) { out.rocks.push({ x: tx + 0.5, z: tz + 0.5, ry: rnd() * 6.28, s: 1 }); out.solids.push([tx, tz]); }
    }
    return out;
  }
  var L = { scatter: scatter, SINGLES: SINGLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  if (root.Game) root.Game.Layout = L;
})(typeof window !== 'undefined' ? window : this);
