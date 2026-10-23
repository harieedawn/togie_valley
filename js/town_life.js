/* Togie Valley - town_life.js (Stage 15E2): dressing + life for the other town areas (shop, workshop, farmhouse, alleys). Game.TownLife.
 * Called by Town.build() after the fish stall: TownLife.build(Town). Adds into Town.group (hidden indoors with the rest of the town):
 *  - one static merged mesh: flower planters on the awning posts, door mats, flower pots, barrel/crate/sack stacks, rain barrel, window frames (shop + workshop
 *    side walls), bunting + laundry poles/ropes, flower clumps / stones / tufts that break the tile grid;
 *  - swinging hanging signs (shop coin, workshop gear) on the existing iron arms (js/detail_town.js no longer draws the static board);
 *  - evening lights: window panes + lantern halos fade in from ~17:00 (more gloom in rain), one transparent mesh each;
 *  - cloth (bunting flags + laundry) animated on the CPU in one merged double-sided mesh (~60 vertices, no allocation);
 *  - chimney smoke on the workshop and the fish-hut stove pipe (one InstancedMesh; the farmhouse smoke stays in js/ambient.js).
 * Frame hook priority 10.6, distance + Quality gated (sway for cloth/signs, particle for smoke). Added draw calls: static 2, signs 4, glows 2, cloth 1, smoke 1 = 10.
 * Solid props register their tile with World.setBlocked (see LAYOUT, verified by tools/check.js section 15).
 * Depends on THREE, Render, Models, World, Town.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World) { console.error('[town_life] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, U = G.util;
  var TL = G.TownLife = { group: null, layout: null, stats: null };

  /* Pure layout data (world units). tools/check.js parses this block against the map:
   * solid rects must sit on one grass/sand tile listed in `blocked` (not footprint, marker, path, pier or water), flat rects must avoid path/pier/water tiles,
   * nothing may overlap, and no solid may cover a stand tile in front of a counter or the house door. */
  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    blocked: [[32, 16], [32, 14], [39, 16], [39, 14], [11, 11], [4, 13], [7, 13]],
    solid: {
      barrelsW: [32.12, 16.15, 32.88, 16.85], cratesW: [32.15, 14.15, 32.85, 14.85],
      cratesGap: [39.15, 16.15, 39.85, 16.85], barrelGap: [39.15, 14.15, 39.85, 14.85],
      rainBarrel: [11.15, 11.15, 11.85, 11.85], poleL: [4.85, 13.45, 4.95, 13.55], poleR: [7.45, 13.45, 7.55, 13.55]
    },
    flat: {
      matShop: [35.2, 17.15, 35.8, 17.45], matWork: [41.2, 17.15, 41.8, 17.45],
      plShopL: [33.28, 17.61, 33.82, 17.83], plShopR: [38.18, 17.61, 38.72, 17.83], plWorkL: [40.28, 17.61, 40.82, 17.83], plWorkR: [42.18, 17.61, 42.72, 17.83],
      potL: [8.2, 12.98, 8.5, 13.28], potR: [10.5, 12.98, 10.8, 13.28]
    }
  };
  /*LAYOUT-END*/
  TL.layout = LAYOUT;

  var C = { wood: 0xc98b4f, dark: 0x8c5a34, dark2: 0x6b4a32, cream: 0xfff1d0, iron: 0x5a4a52, iron2: 0x8a8590, rope: 0x6b5a50, clay: 0xd9825b, soil: 0x6b4a32,
    green: 0x5fb86a, green2: 0x7fcf7a, mat: 0xb9714f, mat2: 0xe8b45a, tin: 0xc4c8cd, sack: 0xe6d3a8 };
  var PETAL = [0xff9bb3, 0xffd166, 0xffffff, 0xb79cf2, 0xff8f6b];
  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), SPH = new THREE.SphereGeometry(0.5, 8, 6),
    CONE = new THREE.ConeGeometry(0.5, 1, 5), ICO = new THREE.IcosahedronGeometry(0.5, 0), TOR = new THREE.TorusGeometry(0.5, 0.12, 6, 14);
  var rnd = U.rng(1521);

  function bx(L, w, h, d, c, x, y, z, rx, ry, rz) { L.push(Mo.part(BOX, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [w, h, d])); }
  function cy(L, r, h, c, x, y, z, rx, ry, rz) { L.push(Mo.part(CYL, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [r * 2, h, r * 2])); }
  function sp(L, r, c, x, y, z, sy) { L.push(Mo.part(SPH, c, [x, y, z], [0, 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function cn(L, r, h, c, x, y, z, rx, rz) { L.push(Mo.part(CONE, c, [x, y, z], [rx || 0, 0, rz || 0], [r * 2, h, r * 2])); }
  function ic(L, r, c, x, y, z, sy, ry) { L.push(Mo.part(ICO, c, [x, y, z], [0, ry || 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }

  /* ---------------- small prop recipes ---------------- */
  function flowers(L, x, y, z, w, n) {
    for (var i = 0; i < n; i++) {
      var fx = x - w / 2 + (i + 0.5) * w / n + (rnd() - 0.5) * 0.04, fz = z + (rnd() - 0.5) * 0.06, h = 0.07 + rnd() * 0.07;
      cn(L, 0.04, 0.12, C.green, fx, y + 0.05, fz, 0, (rnd() - 0.5) * 0.5);
      ic(L, 0.05 + rnd() * 0.02, PETAL[Math.floor(rnd() * PETAL.length)], fx, y + 0.08 + h, fz, 0.8, rnd() * 3);
    }
  }
  function planter(L, x, z) {
    bx(L, 0.54, 0.2, 0.22, C.wood, x, 0.1, z); bx(L, 0.58, 0.04, 0.26, C.dark, x, 0.21, z);
    bx(L, 0.5, 0.03, 0.18, C.soil, x, 0.235, z);
    flowers(L, x, 0.24, z, 0.46, 5);
  }
  function pot(L, x, z) {
    cy(L, 0.1, 0.16, C.clay, x, 0.08, z); cy(L, 0.12, 0.04, C.clay, x, 0.18, z); cy(L, 0.09, 0.02, C.soil, x, 0.2, z);
    flowers(L, x, 0.2, z, 0.14, 2);
  }
  function mat(L, x, z, c1, c2) { bx(L, 0.6, 0.025, 0.3, c1, x, 0.032, z); bx(L, 0.5, 0.03, 0.2, c2, x, 0.036, z); }
  function barrel(L, x, z, h, c) {
    cy(L, 0.27, h, c, x, h / 2, z); cy(L, 0.285, 0.04, C.iron, x, h * 0.22, z); cy(L, 0.285, 0.04, C.iron, x, h * 0.78, z);
    cy(L, 0.25, 0.03, C.dark2, x, h + 0.005, z);
  }
  function crate(L, x, y, z, s, ry, c) {
    bx(L, s, s, s, c, x, y + s / 2, z, 0, ry, 0);
    bx(L, s + 0.03, 0.05, s * 0.82, C.dark, x, y + s * 0.2, z, 0, ry, 0); bx(L, s + 0.03, 0.05, s * 0.82, C.dark, x, y + s * 0.8, z, 0, ry, 0);
    bx(L, s * 0.82, 0.05, s + 0.03, C.dark, x, y + s * 0.5, z, 0, ry, 0);
  }
  function sack(L, x, z, c, s) { sp(L, 0.17 * s, c, x, 0.15 * s, z, 1.1); cn(L, 0.06 * s, 0.1 * s, c, x, 0.32 * s, z); bx(L, 0.1 * s, 0.03, 0.1 * s, C.rope, x, 0.29 * s, z); }
  function bucket(L, x, z) { cy(L, 0.13, 0.2, C.tin, x, 0.1, z); cy(L, 0.115, 0.02, 0x5ec4d6, x, 0.19, z); bx(L, 0.28, 0.025, 0.025, C.iron, x, 0.27, z); }
  function windowFrame(L, x, y, z, ax) {   // ax 0: faces +-x wall (frame thin in x), 1: faces z
    var s = ax ? [0.5, 0.5, 0.05] : [0.05, 0.5, 0.5], px = ax ? 0 : 1;
    L.push(Mo.part(BOX, 0x9fd3e6, [x, y, z], [0, 0, 0], s));
    L.push(Mo.part(BOX, C.dark2, [x, y + 0.27, z], [0, 0, 0], ax ? [0.6, 0.06, 0.1] : [0.1, 0.06, 0.6]));
    L.push(Mo.part(BOX, C.dark2, [x, y - 0.27, z], [0, 0, 0], ax ? [0.64, 0.06, 0.14] : [0.14, 0.06, 0.64]));
    L.push(Mo.part(BOX, C.dark2, [x, y, z], [0, 0, 0], ax ? [0.03, 0.52, 0.07] : [0.07, 0.52, 0.03]));
    L.push(Mo.part(BOX, C.dark2, [x, y, z], [0, 0, 0], ax ? [0.52, 0.03, 0.07] : [0.07, 0.03, 0.52]));
    return px;
  }
  function rope(L, x0, y0, z0, x1, y1, z1, sag) {
    var n = 8, i, u, v, ax, ay, az, bx_, by_, bz_;
    for (i = 0; i < n; i++) {
      u = i / n; v = (i + 1) / n;
      ax = x0 + (x1 - x0) * u; ay = y0 + (y1 - y0) * u - sag * 4 * u * (1 - u); az = z0 + (z1 - z0) * u;
      bx_ = x0 + (x1 - x0) * v; by_ = y0 + (y1 - y0) * v - sag * 4 * v * (1 - v); bz_ = z0 + (z1 - z0) * v;
      var dx = bx_ - ax, dy = by_ - ay, dz = bz_ - az, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      L.push(Mo.part(CYL, C.rope, [(ax + bx_) / 2, (ay + by_) / 2, (az + bz_) / 2], [0, Math.atan2(dz, -dx), Math.acos(Math.max(-1, Math.min(1, dy / len)))], [0.025, len, 0.025]));
    }
  }
  function pole(L, x, z, h) { cy(L, 0.04, h, C.dark, x, h / 2, z); cy(L, 0.07, 0.04, C.dark2, x, h + 0.02, z); }

  /* ---------------- tiny cloth system (CPU, merged, double-sided) ---------------- */
  var cloth = { pos: [], col: [], base: null, w: null, nx: null, nz: null, geo: null, mesh: null, arr: null, n: 0 };
  function cv(x, y, z, c, w, nx, nz) {   // push one vertex
    cloth.pos.push(x, y, z); cloth.col.push(c.r, c.g, c.b); cloth.w.push(w); cloth.nx.push(nx); cloth.nz.push(nz);
  }
  function lineAt(a, b, sag, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u]; }
  /* hang n pennants along a rope */
  function bunting(a, b, sag, n, cols) {
    var dx = b[0] - a[0], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / len, nz = dx / len, i, u, p0, p1, c, hw = 0.5 / (n + 1) * 0.8;
    for (i = 0; i < n; i++) {
      u = (i + 1) / (n + 1); p0 = lineAt(a, b, sag, u - hw); p1 = lineAt(a, b, sag, u + hw); c = new THREE.Color(cols[i % cols.length]);
      cv(p0[0], p0[1] - 0.01, p0[2], c, 0, nx, nz); cv(p1[0], p1[1] - 0.01, p1[2], c, 0, nx, nz);
      cv((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.23, (p0[2] + p1[2]) / 2, c, 1, nx, nz);
    }
  }
  /* hang laundry pieces [centerU, width, height, color, kind] along a rope; kind 's' = shirt (sleeves) */
  function laundry(a, b, sag, items) {
    var dx = b[0] - a[0], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / len, nz = dx / len, k, it, p0, p1, c, uw, h, y0;
    function quad(q0, q1, drop0, drop1, col) {
      cv(q0[0], q0[1] - drop0, q0[2], col, drop0 > 0.01 ? 1 : 0, nx, nz); cv(q1[0], q1[1] - drop0, q1[2], col, drop0 > 0.01 ? 1 : 0, nx, nz); cv(q1[0], q1[1] - drop1, q1[2], col, 1, nx, nz);
      cv(q0[0], q0[1] - drop0, q0[2], col, drop0 > 0.01 ? 1 : 0, nx, nz); cv(q1[0], q1[1] - drop1, q1[2], col, 1, nx, nz); cv(q0[0], q0[1] - drop1, q0[2], col, 1, nx, nz);
    }
    for (k = 0; k < items.length; k++) {
      it = items[k]; uw = it[1] / len / 2; h = it[2]; c = new THREE.Color(it[3]);
      p0 = lineAt(a, b, sag, it[0] - uw); p1 = lineAt(a, b, sag, it[0] + uw);
      if (it[4] === 's') {   // shirt: body + two sleeves hanging slightly outward
        var q0 = lineAt(a, b, sag, it[0] - uw * 0.62), q1 = lineAt(a, b, sag, it[0] + uw * 0.62);
        quad(q0, q1, 0, h, c);
        quad(p0, q0, 0, h * 0.42, c); quad(q1, p1, 0, h * 0.42, c);
      } else quad(p0, p1, 0, h, c);
    }
  }

  /* ---------------- builders ---------------- */
  var S = { ready: false, tx: 40, tz: 15.5, hx: 9.5, hz: 11.5 };
  function tt(x, z) { return W.tileType(x + 0.5, z + 0.5); }
  function bbox(type) {
    var b = null, x, z;
    for (z = 0; z < W.H; z++) for (x = 0; x < W.W; x++) {
      if (tt(x, z) !== type) continue;
      if (!b) b = { x0: x, z0: z, x1: x, z1: z }; else { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z); }
    }
    return b;
  }
  function inLayout(x, z) {
    var i; for (i = 0; i < LAYOUT.blocked.length; i++) if (LAYOUT.blocked[i][0] === x && LAYOUT.blocked[i][1] === z) return true;
    return false;
  }
  function buildStatic() {
    var L = [], k, r;
    // awning-post planters + door mats
    r = LAYOUT.flat;
    ['plShopL', 'plShopR', 'plWorkL', 'plWorkR'].forEach(function (n) { planter(L, (r[n][0] + r[n][2]) / 2, (r[n][1] + r[n][3]) / 2); });
    mat(L, 35.5, 17.3, C.mat, C.mat2); mat(L, 41.5, 17.3, 0x6b7b8c, 0xc4c8cd);
    pot(L, 8.35, 13.13); pot(L, 10.65, 13.13);
    // west strip: barrels + crates + sacks
    barrel(L, 32.38, 16.4, 0.7, C.wood); barrel(L, 32.66, 16.68, 0.62, C.dark); cy(L, 0.24, 0.04, 0x5ec4d6, 32.38, 0.66, 16.4);
    crate(L, 32.4, 0, 14.4, 0.5, 0.2, C.wood); crate(L, 32.55, 0.5, 14.5, 0.38, -0.3, 0xd9a35f); sack(L, 32.7, 14.72, C.sack, 0.9);
    // gap between shop and workshop: crate stack + barrel with bucket
    crate(L, 39.4, 0, 16.4, 0.5, 0.1, C.dark); crate(L, 39.62, 0, 16.65, 0.4, -0.2, C.wood); crate(L, 39.5, 0.5, 16.5, 0.36, 0.4, 0xd9a35f);
    barrel(L, 39.42, 14.42, 0.74, 0xb97f4a); bucket(L, 39.7, 14.7); sack(L, 39.72, 14.25, C.cream, 0.8);
    // rain barrel by the farmhouse bin
    barrel(L, 11.5, 11.5, 0.76, C.wood); cy(L, 0.235, 0.03, 0x5ec4d6, 11.5, 0.76, 11.5); bx(L, 0.05, 0.05, 0.16, C.iron, 11.5, 0.5, 11.2);
    // window frames on the shop west wall and the workshop east wall (panes glow at dusk, see glows)
    windowFrame(L, 32.96, 1.4, 14.0, 0); windowFrame(L, 43.04, 1.4, 14.0, 0);
    bx(L, 0.18, 0.06, 0.62, C.dark2, 32.93, 1.1, 14.0); bx(L, 0.18, 0.06, 0.62, C.dark2, 43.07, 1.1, 14.0);
    // bunting ropes + poles, laundry poles + line
    pole(L, 32.3, 17.62, 1.95); rope(L, 32.3, 1.95, 17.62, 33.1, 1.9, 17.5, 0.05);
    rope(L, 42.93, 1.9, 17.5, 44.08, 1.93, 17.2, 0.1);
    pole(L, 4.9, 13.5, 1.85); pole(L, 7.5, 13.5, 1.85); rope(L, 4.9, 1.82, 13.5, 7.5, 1.82, 13.5, 0.1);
    bx(L, 0.4, 0.2, 0.3, C.wood, 6.2, 0.1, 14.1, 0, 0.3, 0); bx(L, 0.36, 0.05, 0.26, 0xff9bb3, 6.2, 0.21, 14.1, 0, 0.3, 0);   // laundry basket
    // clutter that breaks the tile grid around the town (seeded; never on blocked / non-grass tiles, the plaza row or stand tiles)
    var x, z, q, n = 0, px, pz, t0, kind;
    for (z = 10; z <= 22 && n < 40; z++) for (x = 30; x <= 47 && n < 40; x++) {
      if (z >= 17 && z <= 19) continue;
      t0 = tt(x, z); if ((t0 !== 'grass' && t0 !== 'sand') || W.isBlocked(x, z) || inLayout(x, z)) continue;
      if (rnd() > 0.2) continue;
      px = x + 0.18 + rnd() * 0.64; pz = z + 0.18 + rnd() * 0.64; kind = rnd(); n++;
      if (kind < 0.42 && t0 === 'grass') {   // flower clump
        var m = 2 + Math.floor(rnd() * 3), cc = PETAL[Math.floor(rnd() * PETAL.length)];
        for (q = 0; q < m; q++) {
          var fx = px + (rnd() - 0.5) * 0.28, fz = pz + (rnd() - 0.5) * 0.28;
          cn(L, 0.025, 0.2, C.green, fx, 0.1, fz, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3); ic(L, 0.055 + rnd() * 0.02, q ? cc : 0xffd166, fx, 0.21 + rnd() * 0.04, fz, 0.8, rnd() * 3);
        }
      } else if (kind < 0.75) {   // stone cluster
        var s0 = 0.1 + rnd() * 0.08;
        ic(L, s0, 0xa9aeb5, px, s0 * 0.35, pz, 0.6, rnd() * 3); ic(L, s0 * 0.6, 0x9a9fa6, px + s0 * 1.1, s0 * 0.2, pz + s0 * 0.4, 0.6, rnd() * 3);
        if (rnd() < 0.5) ic(L, s0 * 0.4, 0xc4c8cd, px - s0 * 0.7, s0 * 0.14, pz + s0 * 0.8, 0.6, rnd() * 3);
      } else {   // grass tuft
        for (q = 0; q < 4; q++) { var a = q * 1.6 + rnd(); cn(L, 0.03, 0.2 + rnd() * 0.12, q % 2 ? 0x6fbf5c : 0x86d06a, px + Math.cos(a) * 0.04, 0.12, pz + Math.sin(a) * 0.04, Math.sin(a) * 0.3, -Math.cos(a) * 0.3); }
      }
    }
    TL.stats.clutter = n;
    return Mo.mergeParts(L);
  }

  /* swinging sign: iron chains + board + emblem; pivot at the top (arm) */
  function buildSign(c1, c2, gear) {
    var L = [], i;
    bx(L, 0.02, 0.2, 0.02, C.iron, -0.14, -0.1, 0); bx(L, 0.02, 0.2, 0.02, C.iron, 0.14, -0.1, 0);
    bx(L, 0.4, 0.3, 0.05, c1, 0, -0.34, 0); bx(L, 0.44, 0.03, 0.07, C.dark2, 0, -0.19, 0); bx(L, 0.44, 0.03, 0.07, C.dark2, 0, -0.49, 0);
    if (gear) {
      L.push(Mo.part(TOR, c2, [0, -0.34, 0.04], [0, 0, 0], [0.2, 0.2, 0.2]));
      for (i = 0; i < 6; i++) bx(L, 0.05, 0.05, 0.04, c2, Math.cos(i * 1.047) * 0.115, -0.34 + Math.sin(i * 1.047) * 0.115, 0.04, 0, 0, i * 1.047);
    } else {
      cy(L, 0.1, 0.04, 0xffd166, 0, -0.34, 0.04, Math.PI / 2, 0, 0); cy(L, 0.065, 0.045, c2, 0, -0.34, 0.045, Math.PI / 2, 0, 0);
    }
    var m = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); R.addOutline(m, true); return m;
  }

  var win = { mesh: null, halo: null, mats: null, g: 0 }, sg = [], smoke = null, sm = [], qSway = 1, qPart = 1, t = 0, smDummy = null;
  var M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), QI = new THREE.Quaternion(), V1 = new THREE.Vector3(1, 1, 1);

  function buildGlows(houses) {
    var P = [], H = [], i, plane = new THREE.PlaneGeometry(1, 1), g, m;
    function addPane(x, y, z, ry, w, h) {
      g = plane.clone(); g.scale(w, h, 1); g.rotateY(ry); g.translate(x, y, z); P.push(g);
    }
    addPane(32.925, 1.4, 14.0, -Math.PI / 2, 0.44, 0.44); addPane(43.075, 1.4, 14.0, Math.PI / 2, 0.44, 0.44);
    if (houses) { addPane(S.hx - 0.85, 1.1, S.hz + 1.378, 0, 0.46, 0.39); addPane(S.hx + 0.85, 1.1, S.hz + 1.378, 0, 0.46, 0.39); }
    function mergeG(list) {
      var pos = [], uv = [], j, a;
      list.forEach(function (gg) { gg = gg.toNonIndexed(); a = gg.attributes.position.array; for (j = 0; j < a.length; j++) pos.push(a[j]); gg.dispose(); });
      var o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return o;
    }
    win.mesh = new THREE.Mesh(mergeG(P), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    win.mesh.name = 'townlife_windows'; win.mesh.visible = false; win.mesh.frustumCulled = false; TL.group.add(win.mesh);
    // lantern halos (positions match js/detail_town.js awning lanterns)
    var sb = bbox('shop'), wb = bbox('workshop'), cm = W.getMarkers('shopCounter'), az1 = (cm.length ? cm[0].tz : 16) + 1.6, ico = new THREE.IcosahedronGeometry(0.26, 0);
    function halo(x, y, z) { g = ico.clone(); g.translate(x, y, z); H.push(g); }
    if (sb) { halo(sb.x0 + 0.5, 1.27, az1 - 0.2); halo(sb.x1 + 1 - 0.5, 1.27, az1 - 0.2); }
    if (wb) { halo(wb.x0 + 0.5, 1.27, az1 - 0.2); halo(wb.x1 + 1 - 0.5, 1.27, az1 - 0.2); }
    if (H.length) {
      win.halo = new THREE.Mesh(mergeG(H), new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0, depthWrite: false }));
      win.halo.name = 'townlife_halos'; win.halo.visible = false; win.halo.frustumCulled = false; TL.group.add(win.halo);
    }
  }

  function buildCloth() {
    var j, i;
    cloth.w = []; cloth.nx = []; cloth.nz = [];
    bunting([32.3, 1.95, 17.62], [33.1, 1.9, 17.5], 0.05, 3, [0xff9bb3, 0xffd166, 0x4fb3c8]);
    bunting([42.93, 1.9, 17.5], [44.08, 1.93, 17.2], 0.1, 5, [0xe8715d, 0xfff1d0, 0x4fb3c8, 0xffd166, 0xff9bb3]);
    laundry([4.9, 1.82, 13.5], [7.5, 1.82, 13.5], 0.1, [[0.14, 0.34, 0.5, 0xfff1d0, 'b'], [0.36, 0.34, 0.42, 0x4f8fd6, 's'], [0.58, 0.3, 0.46, 0xff9bb3, 'b'], [0.8, 0.18, 0.3, 0xffd166, 'b']]);
    cloth.n = cloth.pos.length / 3;
    cloth.base = new Float32Array(cloth.pos); cloth.arr = new Float32Array(cloth.pos);
    cloth.geo = new THREE.BufferGeometry();
    cloth.geo.setAttribute('position', new THREE.BufferAttribute(cloth.arr, 3)); cloth.geo.setAttribute('color', new THREE.Float32BufferAttribute(cloth.col, 3));
    cloth.mesh = new THREE.Mesh(cloth.geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    cloth.mesh.name = 'townlife_cloth'; cloth.mesh.frustumCulled = false; TL.group.add(cloth.mesh);
  }

  function buildSmoke() {
    var em = [[42.4, 3.3, 13.4, 4], [46.5, 3.3, 14.4, 3]], i, k, n = 0;
    em.forEach(function (e) { for (k = 0; k < e[3]; k++) sm.push({ x: e[0], y: e[1], z: e[2], ph: k / e[3] + rnd() * 0.08, sp: 0.15 + rnd() * 0.05 }); });
    smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0xf1ede2, transparent: true, opacity: 0.8, depthWrite: false }), sm.length);
    smoke.name = 'townlife_smoke'; smoke.frustumCulled = false; TL.group.add(smoke);
  }

  /* ---------------- frame ---------------- */
  function darkness() {   // 0 day .. 1 evening/night lights
    var h = G.Time && typeof G.Time.hour === 'number' ? G.Time.hour : 12, g = Math.max(0, Math.min(1, (h - 17) / 1.5));
    if (G.Time && (G.Time.weather === 'rain' || G.Time.weather === 'storm') && g < 0.4) g = 0.4;
    return g;
  }
  function onFrame(dt) {
    var P = G.Player && G.Player.pos, dx, dz, i, a, k, q, gust, w0, wt, o, vi, ph, u, sc;
    if (!S.ready || !P) return;
    if (dt > 0.1) dt = 0.1;
    // lights (cheap: only touches opacity when the value moves)
    var tg = darkness(); win.g += (tg - win.g) * (1 - Math.exp(-2.2 * dt)); if (Math.abs(win.g - tg) < 0.004) win.g = tg;
    if (win.mesh) { win.mesh.visible = win.g > 0.01; win.mesh.material.opacity = 0.92 * win.g; }
    if (win.halo) { win.halo.visible = win.g > 0.01; win.halo.material.opacity = 0.3 * win.g * (0.94 + 0.06 * Math.sin(t * 7.1)); }
    dx = P.x - S.tx; dz = P.z - S.tz; var nearT = dx * dx + dz * dz < 28 * 28; dx = P.x - S.hx; dz = P.z - S.hz; var nearH = dx * dx + dz * dz < 22 * 22;
    if (!nearT && !nearH) return;
    t += dt; q = G.Quality && G.Quality.def ? G.Quality.def() : null; qSway = q ? q.sway : 1; qPart = q ? q.particle : 1;
    gust = G.Time && (G.Time.weather === 'rain' || G.Time.weather === 'storm') ? 1.8 : 1;
    // swinging signs
    for (i = 0; i < sg.length; i++) {
      o = sg[i]; o.m.rotation.x = (Math.sin(t * 1.6 + o.ph) * 0.1 + Math.sin(t * 2.7 + o.ph * 2) * 0.03) * qSway * gust;
      o.m.rotation.z = Math.sin(t * 1.2 + o.ph + 1) * 0.025 * qSway * gust;
    }
    // cloth: bottom vertices swing sideways with a travelling wave, tops stay on the rope
    if (qSway > 0) {
      for (i = 0; i < cloth.n; i++) {
        vi = i * 3; w0 = cloth.w[i]; if (w0 < 0.01) continue;
        wt = Math.sin(t * 2.3 + cloth.base[vi] * 1.7 + cloth.base[vi + 2] * 1.3) * 0.045 + Math.sin(t * 4.1 + i) * 0.012;
        wt *= qSway * gust * w0;
        cloth.arr[vi] = cloth.base[vi] + cloth.nx[i] * wt; cloth.arr[vi + 1] = cloth.base[vi + 1] + Math.abs(wt) * -0.4 * 0.5; cloth.arr[vi + 2] = cloth.base[vi + 2] + cloth.nz[i] * wt;
      }
      cloth.geo.attributes.position.needsUpdate = true;
    }
    // chimney smoke
    smoke.visible = qPart >= 0.55 && nearT;
    if (smoke.visible) {
      for (i = 0; i < sm.length; i++) {
        o = sm[i]; k = (t * o.sp + o.ph) % 1; sc = k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1; sc *= 0.5 + k * 1.1;
        M4.compose(V3.set(o.x + k * 0.9 + Math.sin(k * 6 + i) * 0.07, o.y + k * 1.5, o.z), QI, V1.set(sc, sc, sc)); smoke.setMatrixAt(i, M4);
      }
      smoke.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---------------- build ---------------- */
  TL.build = function (T) {
    if (S.ready || !T || !T.group) return;
    TL.stats = { clutter: 0 };
    TL.group = new THREE.Group(); TL.group.name = 'townlife'; T.group.add(TL.group);
    var dh = G.Decor && G.Decor.house, sb = bbox('shop'), wb = bbox('workshop'), cm = W.getMarkers('shopCounter'), az1 = (cm.length ? cm[0].tz : 16) + 1.6, m, sw;
    if (dh) { S.hx = dh.position.x; S.hz = dh.position.z; }
    LAYOUT.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    m = new THREE.Mesh(buildStatic(), Mo.material('prop')); m.name = 'townlife_static'; R.addOutline(m, true); TL.group.add(m);
    // swinging signs: pivot = tip of the iron arm placed by detail_town.awning() (sx = x0 + w + 0.05, hanging chain at sx + 0.22)
    function sign(bb, c1, c2, gear, ph) {
      if (!bb) return;
      sw = buildSign(c1, c2, gear); sw.position.set(bb.x1 + 1 + 0.05 + 0.22, 1.78, az1 - 0.1); sw.name = 'townlife_sign'; TL.group.add(sw); sg.push({ m: sw, ph: ph });
    }
    sign(sb, 0xffd166, 0xff9bb3, false, 0.4); sign(wb, 0x8a8590, 0x5a4a52, true, 2.1);
    buildGlows(!!dh); buildCloth(); buildSmoke();
    S.tx = (sb ? sb.x0 : 34) + 6; S.tz = 15.5; S.ready = true;
    TL.stats.draws = 2 + sg.length * 2 + 2 + 1 + 1;
    G.Loop.onFrame(onFrame, 10.6);
  };
})();
