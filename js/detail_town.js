/* Togie Valley - detail_town.js (Stage 10.5 Part 4): buildings + props detail.
 * Game.DetailTown.build() once (after Scenery.build, DetailTerrain.build). Meshes go into Scenery.group (hidden indoors).
 * House: shutters, flower boxes, steps, eave/roof bands, chimney cap. Shop/workshop: scalloped awning, hanging sign, lanterns; workshop: grindstone,
 * water tub; fish hut: wall net, buoys, drying rack with fish, net pile. Props: scarecrow (blocks tile 12,17), signposts, mushrooms, rock clusters,
 * extra stumps, swaying tall-grass tufts + cattails (Decor.instanced). Added draw calls: buildings 2 + small props 2 + tufts 1 + cattails 1 = 6.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.DetailKit || !G.World || !G.Scenery || !G.Decor) { console.error('[detail_town] missing deps'); return; }
  var K = G.DetailKit, W = G.World, Mo = G.Models, WM = G.WorldMap, MW = WM.W, MH = WM.H, hash = K.hash, box = K.box, cyl = K.cyl, ico = K.ico, cone = K.cone;
  var T = { group: null }, DEG = Math.PI / 180;
  function tt(x, z) { return W.tileType(x + 0.5, z + 0.5); }
  function farm(x, z) { return x > 10 && x < 29 && z > 5 && z < 20; }
  function bbox(type) {
    var b = null, x, z;
    for (z = 0; z < MH; z++) for (x = 0; x < MW; x++) {
      if (tt(x, z) !== type) continue;
      if (!b) b = { x0: x, z0: z, x1: x, z1: z }; else { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z); }
    }
    return b;
  }

  function houseExtras(m, hx, hz) {
    var p = [], wood = 0x7a4a2b, sl = 0.37, i, s;
    [-0.85, 0.85].forEach(function (wx, k) {
      var sc = k ? 0x4f8fd6 : 0x5fb86a;
      p.push(box(0.13, 0.5, 0.05, sc, wx - sl, 1.1, 1.36), box(0.13, 0.5, 0.05, sc, wx + sl, 1.1, 1.36));
      p.push(box(0.66, 0.13, 0.2, 0x8c5a34, wx, 0.76, 1.42));
      for (i = 0; i < 4; i++) p.push(ico(0.065, 0, [0xff9bb3, 0xffd166, 0xffffff, 0xff9bb3][i], wx - 0.24 + i * 0.16, 0.89, 1.42 + (i % 2) * 0.03), cone(0.05, 0.1, 0x5fb86a, wx - 0.24 + i * 0.16, 0.84, 1.45, 4));
    });
    p.push(box(1.2, 0.07, 0.3, 0xb9b0a4, 0, 0.035, 1.78), box(0.95, 0.07, 0.24, 0xcfc7bb, 0, 0.1, 1.64));   // steps
    // eave trim (wood) + mid-roof bands (tilted to the 40-degree roof slope)
    p.push(box(3.2, 0.09, 0.1, wood, 0, 1.7, 1.56), box(3.2, 0.09, 0.1, wood, 0, 1.7, -1.56), box(0.1, 0.09, 3.2, wood, 1.56, 1.7, 0), box(0.1, 0.09, 3.2, wood, -1.56, 1.7, 0));
    var a = 39.9 * DEG, hs = 0.8, by = 2.36;
    p.push(box(1.7, 0.05, 0.13, 0xe8b45a, 0, by, hs + 0.03, [a, 0, 0]), box(1.7, 0.05, 0.13, 0xe8b45a, 0, by, -hs - 0.03, [-a, 0, 0]),
      box(0.13, 0.05, 1.7, 0xe8b45a, hs + 0.03, by, 0, [0, 0, -a]), box(0.13, 0.05, 1.7, 0xe8b45a, -hs - 0.03, by, 0, [0, 0, a]));
    p.push(box(0.52, 0.07, 0.52, 0x6b5a50, 0.7, 3.06, -0.5), box(0.12, 0.18, 0.12, 0x6b5a50, 0.7, 3.14, -0.5));   // chimney cap
    m.parts(p, hx, 0, hz, 0, 1);
  }

  function awning(m, x0, w, az1, c1, c2, hang) {
    var i, p = [], y = 1.84;
    for (i = 0; i < w; i++) p.push(cyl(0.5, 0.5, 0.06, i % 2 ? c2 : c1, x0 + i + 0.5, y, az1, 14, [Math.PI / 2, 0, 0], [1, 1, 0.55]));
    m.parts(p, 0, 0, 0, 0, 1);
    var lan = K.M([box(0.14, 0.17, 0.14, 0xffd98a, 0, 0, 0), box(0.18, 0.04, 0.18, 0x5a3a22, 0, 0.11, 0), cone(0.09, 0.08, 0x5a3a22, 0, 0.17, 0, 4), box(0.02, 0.25, 0.02, 0x5a3a22, 0, 0.3, 0)]);
    m.add(lan, x0 + 0.5, 1.25, az1 - 0.2, 0, 1); m.add(lan, x0 + w - 0.5, 1.25, az1 - 0.2, 0, 1);
    // hanging sign on an iron arm at the right post
    var sx = x0 + w + 0.05, sg = [box(0.55, 0.05, 0.05, 0x5a4a52, sx + 0.2, 1.78, az1 - 0.1)];   // arm only; the swinging board hangs from js/town_life.js
    m.parts(sg, 0, 0, 0, 0, 1);
  }

  function workshopExtras(m, bb) {
    var cx = bb.x0 + 0.5, z = bb.z1 + 0.5;
    m.parts([box(0.5, 0.06, 0.34, 0x5a4a52, 0, 0.03, 0), box(0.06, 0.34, 0.06, 0x8c5a34, -0.2, 0.2, 0), box(0.06, 0.34, 0.06, 0x8c5a34, 0.2, 0.2, 0),
      cyl(0.22, 0.22, 0.09, 0xb9b0a4, 0, 0.4, 0, 14, [0, 0, Math.PI / 2]), box(0.05, 0.05, 0.3, 0xc98b4f, 0.28, 0.4, 0.06)], cx, 0, z, 0, 1);
    var tx = bb.x1 + 0.5;
    m.parts([cyl(0.2, 0.17, 0.3, 0xc98b4f, 0, 0.15, 0, 10), cyl(0.18, 0.18, 0.03, 0x5ec4d6, 0, 0.3, 0, 10), box(0.4, 0.04, 0.04, 0x5a4a52, 0, 0.2, 0.19)], tx, 0, z, 0, 1);
  }

  function fishHutExtras(m, bb) {
    var i, j, p = [], z0 = bb.z0, x0 = bb.x0;
    for (i = 0; i < 5; i++) p.push(box(0.025, 0.8, 0.025, 0xd8c28a, x0 - 0.03, 1.35, z0 + 0.15 + i * 0.17));   // wall net
    for (j = 0; j < 5; j++) p.push(box(0.025, 0.025, 0.85, 0xd8c28a, x0 - 0.03, 0.98 + j * 0.2, z0 + 0.5));
    [0xd9473f, 0xffffff, 0xd9473f].forEach(function (c, k) { p.push(ico(0.1, 0, c, x0 - 0.1, 1.9, z0 + 0.25 + k * 0.3)); });   // buoys
    m.parts(p, 0, 0, 0, 0, 1);
    // drying rack + fish moved to js/fish_stall.js (Stage 15E1)
    var buoy = [ico(0.17, 1, 0xd9473f, 0, 0.17, 0), ico(0.1, 0, 0xffffff, 0, 0.3, 0.06), ico(0.3, 1, 0xd8c28a, 0.4, 0.06, 0.1, [1, 0.25, 0.8])];
    m.parts(buoy, bb.x1 + 0.5, 0, bb.z1 + 0.5, 0, 1);
  }

  function scarecrow(m) {
    var p = [cyl(0.04, 0.05, 1.5, 0x8c5a34, 0, 0.75, 0, 6), box(0.9, 0.06, 0.06, 0x8c5a34, 0, 1.15, 0), box(0.34, 0.4, 0.2, 0xe8715d, 0, 1.05, 0), box(0.1, 0.16, 0.08, 0xffd166, 0.08, 0.96, 0.11),
      ico(0.17, 1, 0xe6c35c, 0, 1.45, 0, [1, 1.05, 1]), box(0.06, 0.02, 0.02, 0x3a2a22, -0.05, 1.47, 0.16), box(0.06, 0.02, 0.02, 0x3a2a22, 0.05, 1.47, 0.16),
      cyl(0.34, 0.34, 0.04, 0xc9a23f, 0, 1.6, 0, 10), cyl(0.18, 0.2, 0.2, 0xe6c35c, 0, 1.72, 0, 10), box(0.2, 0.05, 0.02, 0xe8715d, 0, 1.64, 0.18),
      ico(0.08, 0, 0xe6c35c, -0.5, 1.1, 0), ico(0.08, 0, 0xe6c35c, 0.5, 1.1, 0), cone(0.05, 0.22, 0xe6c35c, -0.2, 0.82, 0.02, 4, [Math.PI, 0, 0.3]), cone(0.05, 0.22, 0xe6c35c, 0.2, 0.82, 0.02, 4, [Math.PI, 0, -0.3]),
      cyl(0.26, 0.3, 0.1, 0x8a5a3b, 0, 0.05, 0, 8)];
    m.parts(p, 12.5, 0, 17.5, 0.4, 1);
    W.setBlocked(12, 17, true);
  }

  function signpost() { return K.M([cyl(0.05, 0.06, 1.05, 0x8c5a34, 0, 0.52, 0, 6), box(0.62, 0.17, 0.05, 0xc98b4f, 0.14, 0.92, 0.07, [0, 0.12, 0]), box(0.2, 0.17, 0.05, 0xc98b4f, 0.46, 0.92, 0.075, [0, 0.12, 0.0], null), box(0.55, 0.15, 0.05, 0xb97f4a, -0.1, 0.7, -0.07, [0, Math.PI - 0.1, 0]), cone(0.07, 0.12, 0x8c5a34, 0, 1.08, 0, 6)]); }
  function mushroom() { return K.M([cyl(0.025, 0.03, 0.09, 0xf3e2c0, 0, 0.045, 0, 5), ico(0.06, 0, 0xe8715d, 0, 0.1, 0, [1, 0.6, 1]), ico(0.012, 0, 0xffffff, 0.02, 0.145, 0.02)]); }
  function stump() { return K.M([cyl(0.2, 0.25, 0.26, 0xb97f4a, 0, 0.13, 0, 8), cyl(0.18, 0.18, 0.03, 0xe0b987, 0, 0.26, 0, 8)]); }
  function rockSm(c) { return K.M([ico(0.16, 0, c, 0, 0.07, 0, [1, 0.6, 1]), ico(0.08, 0, 0xc4c8cd, 0.14, 0.03, 0.07, [1, 0.6, 1])]); }
  function tuftGeo() {
    var p = [], i; for (i = 0; i < 6; i++) { var a = i * 1.05, h = 0.3 + (i % 3) * 0.1; p.push(cone(0.035, h, i % 2 ? 0x6fbf5c : 0x86d06a, Math.cos(a) * 0.05, h / 2, Math.sin(a) * 0.05, 3, [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25])); }
    return K.M(p);
  }
  function cattailGeo() {
    var p = [cyl(0.015, 0.02, 0.9, 0x6fa84f, 0, 0.45, 0, 4), cyl(0.04, 0.04, 0.16, 0x8c5a34, 0, 0.88, 0, 5), cone(0.012, 0.1, 0x6fa84f, 0, 1.0, 0, 3),
      cyl(0.012, 0.018, 0.7, 0x7bb85a, 0.1, 0.35, 0.05, 4, [0, 0, -0.2]), cyl(0.012, 0.018, 0.55, 0x6fa84f, -0.09, 0.28, -0.04, 4, [0, 0, 0.25])];
    return K.M(p);
  }

  T.build = function () {
    if (T.group) return T.group;
    var grp = T.group = G.Scenery.group, B = new K.Merger(), S = new K.Merger(), lay = G.Scenery.layout, x, z, i, r;
    // house
    var dh = G.Decor.house; if (dh) houseExtras(B, dh.position.x, dh.position.z);
    // shops
    var sb = bbox('shop'), wb = bbox('workshop'), fb = bbox('stall'), cm = W.getMarkers('shopCounter'), cz = cm.length ? cm[0].tz : 0;
    var az1 = cz + 1.6;
    if (sb) awning(B, sb.x0, sb.x1 - sb.x0 + 1, az1, 0xe8715d, 0xfff1d0, [0xffd166, 0xff9bb3]);
    if (wb) { awning(B, wb.x0, wb.x1 - wb.x0 + 1, az1, 0x5a4a52, 0xc98b4f, [0x8a8590, 0x5a4a52]); workshopExtras(B, wb); }
    if (fb) fishHutExtras(B, fb);
    scarecrow(B);

    // small props
    var sp = signpost(), mu = mushroom(), st = stump(), rk = [rockSm(0xa9aeb5), rockSm(0x9a9fa6)];
    (WM.features.goals || []).forEach(function (g, gi) {
      if (gi % 2) return;
      var best = null, dx, dz;
      for (dz = -2; dz <= 2 && !best; dz++) for (dx = -2; dx <= 2 && !best; dx++) {
        var tx = Math.round(g[0]) + dx, tz = Math.round(g[1]) + dz;
        if (tt(tx, tz) !== 'grass' || W.isBlocked(tx, tz) || farm(tx, tz)) continue;
        var nb = [tt(tx + 1, tz), tt(tx - 1, tz), tt(tx, tz + 1), tt(tx, tz - 1)];
        if (nb.indexOf('path') >= 0 || nb.indexOf('stone') >= 0) best = [tx, tz];
      }
      if (best) S.add(sp, best[0] + 0.5, 0, best[1] + 0.5, hash(gi, 5) * 3, 1);
    });
    if (lay) {
      lay.trees.forEach(function (t, i2) {
        r = hash(Math.floor(t.x * 5), Math.floor(t.z * 5));
        if (r < 0.1) { for (i = 0; i < 3; i++) S.add(mu, t.x + 0.45 + i * 0.1, 0, t.z + 0.4 - i * 0.12, i, 0.9 + i * 0.2); }
        else if (r < 0.16) S.add(st, t.x - 0.6, 0, t.z + 0.3, r * 20, 1);
      });
      lay.rocks.forEach(function (rc, i2) { S.add(rk[i2 % 2], rc.x + 0.45, 0, rc.z - 0.2, i2, 1); S.add(rk[(i2 + 1) % 2], rc.x - 0.3, 0, rc.z + 0.4, i2 * 2, 0.8); });
    }
    var bg = B.geometry(), sg = S.geometry();
    if (bg) grp.add(K.mesh(bg, Mo.material('prop'), 'detail_buildings', true, false));
    if (sg) grp.add(K.mesh(sg, Mo.material('prop'), 'detail_small', true, true));

    // swaying tall-grass tufts + cattails (instanced, no outline)
    var tufts = [], cats = [], dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (z = 0; z < MH; z++) for (x = 0; x < MW; x++) {
      var t0 = tt(x, z); if (t0 !== 'grass' && t0 !== 'sand') continue;
      r = hash(x * 3 + 1, z * 5 + 2);
      if (t0 === 'grass' && !farm(x, z) && K.noise(x * 0.3, z * 0.3 + 70) > 0.5 && r < 0.2 && !W.isBlocked(x, z)) tufts.push({ x: x + 0.2 + hash(x, z + 1) * 0.6, z: z + 0.2 + hash(x + 1, z) * 0.6, ry: r * 40, s: 0.8 + hash(z, x) * 0.7 });
      for (i = 0; i < 4; i++) if (tt(x + dirs[i][0], z + dirs[i][1]) === 'water') {
        if (r < 0.5) cats.push({ x: x + 0.5 + dirs[i][0] * 0.38 + (hash(x, z + 3) - 0.5) * 0.3, z: z + 0.5 + dirs[i][1] * 0.38 + (hash(x + 3, z) - 0.5) * 0.3, ry: r * 20, s: 0.8 + hash(x, z) * 0.6 });
        break;
      }
    }
    G.Decor.instanced(tuftGeo(), tufts, 1.2, true);
    G.Decor.instanced(cattailGeo(), cats, 1.0, true);
    T.stats = { tufts: tufts.length, cattails: cats.length };
    return grp;
  };
  G.DetailTown = T;
})();
