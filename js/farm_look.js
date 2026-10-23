/* Togie Valley - farm_look.js (Stage 15E/F1): field dressing around the farm. Game.FarmLook.
 * build() once after Decor/Town (called from main.js); rebuild() whenever Decor.refreshFences() runs (plot unlock).
 * One static merged mesh (+ thin outline) inside Decor.group (hidden indoors): two plot signs with crop emblems, a low wooden lip along the soil's grass edge,
 * seeded fence variety (post caps, braces, ribbons, vine tufts) laid over the instanced fence, border flowers / clover / pebbles outside the fence ring.
 * Added draw calls: 2. Soil mound variants, per-plant jitter and the ripe glint live in js/farm_fx.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.Decor) { console.error('[farm_look] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, FL = G.FarmLook = { mesh: null, layout: null, stats: {} };

  /* Pure layout data: sign tiles (blocked, grass, off the paths). tools/check.js section 16 verifies them against the map + reachability of the soil. */
  /*LAYOUT-BEGIN*/
  var LAYOUT = { signs: [[12, 14], [27, 14]], lip: [12.93, 11, 13, 17] };
  /*LAYOUT-END*/
  FL.layout = LAYOUT;

  var C = { wood: 0xc98b4f, dark: 0x8c5a34, dark2: 0x6b4a32, green: 0x5fb86a, rope: 0xd8c28a };
  var PETAL = [0xff9bb3, 0xffd166, 0xffffff, 0xb79cf2, 0xff8f6b];
  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8), SPH = new THREE.SphereGeometry(0.5, 8, 6), CONE = new THREE.ConeGeometry(0.5, 1, 5), ICO = new THREE.IcosahedronGeometry(0.5, 0);
  function hh(x, z, i) { var v = Math.sin(x * 127.1 + z * 311.7 + i * 74.7) * 43758.5453; return v - Math.floor(v); }
  function bx(L, w, h, d, c, x, y, z, ry, rx, rz) { L.push(Mo.part(BOX, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [w, h, d])); }
  function cy(L, r, h, c, x, y, z) { L.push(Mo.part(CYL, c, [x, y, z], [0, 0, 0], [r * 2, h, r * 2])); }
  function sp(L, r, c, x, y, z, sy) { L.push(Mo.part(SPH, c, [x, y, z], [0, 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function cn(L, r, h, c, x, y, z, rz) { L.push(Mo.part(CONE, c, [x, y, z], [0, 0, rz || 0], [r * 2, h, r * 2])); }
  function ic(L, r, c, x, y, z, sy, ry) { L.push(Mo.part(ICO, c, [x, y, z], [0, ry || 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function tt(x, z) { return W.tileType(x + 0.5, z + 0.5); }
  function okTile(x, z) { var t = tt(x, z); return (t === 'grass' || t === 'sand') && !W.isBlocked(x, z); }

  function flowerClump(L, x, z, seed) {
    var n = 2 + Math.floor(hh(x, z, seed) * 3), c = PETAL[Math.floor(hh(x, z, seed + 1) * PETAL.length)], q, fx, fz;
    for (q = 0; q < n; q++) {
      fx = x + (hh(x, z, seed + 2 + q) - 0.5) * 0.3; fz = z + (hh(x, z, seed + 9 + q) - 0.5) * 0.3;
      cn(L, 0.025, 0.2, C.green, fx, 0.1, fz, (hh(fx, fz, 3) - 0.5) * 0.4);
      ic(L, 0.055 + hh(fx, fz, 4) * 0.02, q ? c : 0xffd166, fx, 0.21 + hh(fx, fz, 5) * 0.04, fz, 0.8, hh(fx, fz, 6) * 3);
    }
    cn(L, 0.05, 0.14, 0x6fbf5c, x + 0.1, 0.07, z - 0.08); cn(L, 0.045, 0.12, 0x86d06a, x - 0.09, 0.06, z + 0.06);
  }
  function sign(L, tx, tz, emblem) {
    var x = tx + 0.5, z = tz + 0.5;
    cy(L, 0.04, 0.8, C.dark, x - 0.2, 0.4, z); cy(L, 0.04, 0.8, C.dark, x + 0.2, 0.4, z);
    bx(L, 0.62, 0.32, 0.05, C.wood, x, 0.66, z); bx(L, 0.66, 0.04, 0.07, C.dark2, x, 0.83, z); bx(L, 0.66, 0.04, 0.07, C.dark2, x, 0.49, z);
    if (emblem === 0) { cn(L, 0.07, 0.2, 0xff9b50, x, 0.66, z + 0.04, Math.PI); cn(L, 0.02, 0.07, C.green, x - 0.02, 0.8, z + 0.04); cn(L, 0.02, 0.07, C.green, x + 0.03, 0.8, z + 0.04, 0.4); }
    else { sp(L, 0.075, 0xffd166, x - 0.1, 0.64, z + 0.04, 0.9); sp(L, 0.06, 0xff9bb3, x + 0.1, 0.68, z + 0.04, 0.9); cn(L, 0.02, 0.1, C.green, x, 0.6, z + 0.04); }
    for (var i = 0; i < 3; i++) ic(L, 0.05, 0xb9b0a4, x - 0.3 + i * 0.3 + (i === 1 ? 0.2 : 0), 0.04, z + 0.2, 0.6, i * 2);   // pebbles at the foot
  }
  function build() {
    var L = [], x, z, n = 0, i;
    LAYOUT.signs.forEach(function (s, k) { sign(L, s[0], s[1], k); W.setBlocked(s[0], s[1], true); });
    // low wooden lip along the soil's grass edge (x = 13 border, z 11..16)
    var lp = LAYOUT.lip, lz;
    for (lz = lp[1]; lz < lp[3]; lz++) {
      bx(L, 0.09, 0.07, 0.9, C.dark, lp[0], 0.035, lz + 0.5); bx(L, 0.05, 0.1, 0.07, C.dark2, lp[0], 0.05, lz + 0.05); bx(L, 0.05, 0.1, 0.07, C.dark2, lp[0], 0.05, lz + 0.95);
    }
    // fence variety + border flowers (same boundary walk as Decor.fenceList)
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]], d, fx, fz, ry, side, r, ox, oz, ex, ez, a, px, pz;
    for (z = 0; z < W.H; z++) for (x = 0; x < W.W; x++) {
      if (tt(x, z) !== 'locked') continue;
      for (i = 0; i < 4; i++) {
        d = dirs[i]; if (tt(x + d[0], z + d[1]) === 'locked') continue;
        fx = x + 0.5 + d[0] * 0.5; fz = z + 0.5 + d[1] * 0.5; ry = d[0] ? Math.PI / 2 : 0; side = d[1] || d[0];
        r = hh(fx, fz, 11);
        function loc(lx, lz2) { return [fx + lx * Math.cos(ry) + lz2 * Math.sin(ry), fz - lx * Math.sin(ry) + lz2 * Math.cos(ry)]; }
        if (r < 0.2) { a = loc(r < 0.1 ? -0.45 : 0.45, 0); sp(L, 0.075, C.wood, a[0], 0.6, a[1], 0.9); }                       // round post cap
        else if (r < 0.32) { a = loc(0, 0.04 * side); bx(L, 1.0, 0.05, 0.05, C.wood, a[0], 0.32, a[1], ry + 0, 0, hh(fx, fz, 12) < 0.5 ? 0.42 : -0.42); }   // diagonal brace
        else if (r < 0.42) { a = loc(0.45, 0.07 * side); bx(L, 0.05, 0.16, 0.012, [0xe8715d, 0xffd166, 0x4fb3c8][Math.floor(hh(fx, fz, 13) * 3)], a[0], 0.58, a[1], ry); bx(L, 0.04, 0.04, 0.04, C.rope, a[0], 0.65, a[1], ry); }   // ribbon
        else if (r < 0.52) { a = loc(-0.3 + hh(fx, fz, 14) * 0.6, 0.2 * side); cn(L, 0.05, 0.3, 0x6fbf5c, a[0], 0.15, a[1]); sp(L, 0.05, PETAL[Math.floor(hh(fx, fz, 15) * 5)], a[0], 0.32, a[1], 0.8); cn(L, 0.045, 0.24, 0x86d06a, a[0] + 0.07, 0.12, a[1]); }   // vine tuft
        ox = x + d[0]; oz = z + d[1];
        if (okTile(ox, oz) && hh(ox, oz, i) < 0.5 && !(ox === 12 && oz >= 11 && oz <= 16)) {
          px = ox + 0.2 + hh(ox, oz, 21) * 0.6; pz = oz + 0.2 + hh(ox, oz, 22) * 0.6; n++;
          if (hh(ox, oz, 23) < 0.7) flowerClump(L, px, pz, 30); else { ic(L, 0.1, 0xa9aeb5, px, 0.035, pz, 0.6, 1); ic(L, 0.06, 0x9a9fa6, px + 0.13, 0.02, pz + 0.04, 0.6, 2); }
        }
      }
    }
    // clover / flowers on the grass strip beside the soil lip (x = 12), around the sign
    for (lz = lp[1]; lz < lp[3]; lz++) {
      if (!okTile(12, lz) || hh(12, lz, 40) < 0.35) continue;
      flowerClump(L, 12.15 + hh(12, lz, 41) * 0.45, lz + 0.2 + hh(12, lz, 42) * 0.6, 50); n++;
    }
    FL.stats.flowers = n;
    return Mo.mergeParts(L);
  }
  FL.rebuild = function () {
    if (FL.mesh) { FL.mesh.parent.remove(FL.mesh); FL.mesh.geometry.dispose(); FL.mesh = null; }
    var m = new THREE.Mesh(build(), Mo.material('prop')); m.name = 'farm_look'; R.addOutline(m, true);
    G.Decor.group.add(m); FL.mesh = m;
  };
  FL.build = function () {
    if (FL.built) return; FL.built = true;
    var old = G.Decor.refreshFences;
    G.Decor.refreshFences = function () { if (old) old.apply(G.Decor, arguments); FL.rebuild(); };
    FL.rebuild();
  };
})();
