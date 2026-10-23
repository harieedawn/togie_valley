/* Togie Valley - landmarks.js (Stage 15F2a): valley landmarks. Windmill (rotating sails), tool shed, mossy shrine tree with
 * hanging ribbons, village notice board, compost bin, water trough. Static geometry is one merged mesh (+ outline); the sails are one
 * rotating mesh; ribbons + pinned notes are one CPU-animated double-sided cloth mesh. Solid tiles are registered with World.setBlocked.
 * Layout is a pure block verified by tools/check.js section 17 (grass only, off paths/field/water, no overlap with scenery, reachability).
 * Added draw calls: 5 (static 2, sails 2, cloth 1). Quality gating: cloth only when Quality.sway > 0, sails always (one transform).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.Decor || !G.Scenery) { console.error('[landmarks] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, U = G.util, E = G.Events;
  var LM = G.Landmarks = { group: null, layout: null, stats: null };

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    // visual extents [x0, z0, x1, z1] in tiles (used for overlap + scenery clearance checks)
    ext: { windmill: [36, 9, 39, 12], shed: [19, 6, 21, 8], shrine: [5, 17, 8, 20], compost: [10, 15, 11, 16], trough: [10, 17, 12, 18], board: [37, 20, 39, 21] },
    // solid tiles
    blocked: [[36, 9], [37, 9], [38, 9], [36, 10], [37, 10], [38, 10], [36, 11], [37, 11], [38, 11],
      [19, 6], [20, 6], [19, 7], [20, 7],
      [6, 18], [5, 19], [6, 19], [7, 19],
      [10, 15], [10, 17], [11, 17], [37, 20], [38, 20]],
    // [id, tx, tz, facing, hint]  (stand tile = tile minus facing vector, i.e. south of the tile for 'n')
    spots: [['noticeboard', 37, 20, 'n', 'Đọc bảng tin'], ['shrine', 6, 19, 'n', 'Ngắm cây cổ thụ']]
  };
  /*LAYOUT-END*/
  LM.layout = LAYOUT;

  var C = { wood: 0xc98b4f, wood2: 0xd9a066, dark: 0x8c5a34, dark2: 0x6b4a32, cream: 0xfff1d0, plaster: 0xf6e7c8, plaster2: 0xd9c49a, stone: 0xb7b2a6, stone2: 0x9a958b,
    iron: 0x5a4a52, iron2: 0x8a8590, red: 0xd9825b, red2: 0xc26a4e, red3: 0x9c4f3b, teal: 0x6fa6a8, teal2: 0x4f8789, pink: 0xff9bb3, glass: 0xaee3f0, water: 0x6cc6de,
    bark: 0x7a5a45, bark2: 0x65483a, moss: 0x78b36a, leaf: 0x5aa86a, leaf2: 0x7fc27c, leaf3: 0x4f9660, blossom: 0xffb3c7, tan: 0xcdb98a, shade: 0x5fa862, gold: 0xffd166,
    green: 0x5fb86a, hay: 0xe6c06a, soil: 0x5a3f2c, sack: 0xe6d3a8 };
  var PETAL = [0xff9bb3, 0xffd166, 0xffffff, 0xb79cf2, 0xff8f6b];
  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), SPH = new THREE.SphereGeometry(0.5, 8, 6),
    CONE = new THREE.ConeGeometry(0.5, 1, 5), CONE10 = new THREE.ConeGeometry(0.5, 1, 10), CONE4 = new THREE.ConeGeometry(0.5, 1, 4),
    ICO = new THREE.IcosahedronGeometry(0.5, 0), TRI = new THREE.CylinderGeometry(0.5, 0.5, 1, 3), TOR = new THREE.TorusGeometry(0.5, 0.035, 5, 18);
  var rnd = U.rng(15021), PI = Math.PI;
  var X = 0, Z = 0, tpCache = {};

  function bx(L, w, h, d, c, x, y, z, rx, ry, rz) { L.push(Mo.part(BOX, c, [x + X, y, z + Z], [rx || 0, ry || 0, rz || 0], [w, h, d])); }
  function cy(L, r, h, c, x, y, z, rx, ry, rz) { L.push(Mo.part(CYL, c, [x + X, y, z + Z], [rx || 0, ry || 0, rz || 0], [r * 2, h, r * 2])); }
  function sp(L, r, c, x, y, z, sy) { L.push(Mo.part(SPH, c, [x + X, y, z + Z], [0, 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function ic(L, r, c, x, y, z, sy, ry) { L.push(Mo.part(ICO, c, [x + X, y, z + Z], [0, ry || 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function cn(L, r, h, c, x, y, z, rx, rz, geo) { L.push(Mo.part(geo || CONE, c, [x + X, y, z + Z], [rx || 0, 0, rz || 0], [r * 2, h, r * 2])); }
  function tp(L, rt, rb, h, seg, c, x, y, z, rx, ry, rz) {   // tapered cylinder (rt top radius, rb bottom radius)
    var k = rt + '_' + rb + '_' + seg, g = tpCache[k] || (tpCache[k] = new THREE.CylinderGeometry(rt, rb, 1, seg));
    L.push(Mo.part(g, c, [x + X, y, z + Z], [rx || 0, ry || 0, rz || 0], [1, h, 1]));
  }
  function tri(L, w, h, d, c, x, baseY, z) {   // gable triangle: width w, height h, thickness d (faces +-z), base at baseY
    L.push(Mo.part(TRI, c, [x + X, baseY + h / 2, z + Z], [-PI / 2, 0, 0], [w / 0.866, d, 2 * h]));
  }
  function tor(L, r, c, x, y, z) { L.push(Mo.part(TOR, c, [x + X, y, z + Z], [PI / 2, 0, 0], [r * 2, r * 2, r * 2])); }
  function flowers(L, x, y, z, w, n) {
    var i;
    for (i = 0; i < n; i++) sp(L, 0.028 + rnd() * 0.02, PETAL[(i + ((rnd() * 5) | 0)) % 5], x + (rnd() - 0.5) * w, y + 0.03 + rnd() * 0.05, z + (rnd() - 0.5) * 0.05);
    ic(L, 0.07, C.green, x, y, z, 0.5);
  }
  function bucket(L, x, y, z) { cy(L, 0.13, 0.2, 0xc4c8cd, x, y + 0.1, z); cy(L, 0.115, 0.02, C.water, x, y + 0.19, z); bx(L, 0.28, 0.02, 0.02, C.iron, x, y + 0.23, z); }
  function pebble(L, x, z, r, c) { ic(L, r, c || C.stone, x, r * 0.35, z, 0.55, rnd() * 3); }

  /* ------------------------------------------------------------ windmill (center 37.5, 10.5) */
  function windmill(L) {
    var i, a, y;
    X = 37.5; Z = 10.5;
    cy(L, 1.4, 0.03, C.tan, 0, 0.015, 0.05);                                    // worn yard patch
    tp(L, 0.98, 1.12, 0.28, 10, C.stone, 0, 0.14, 0);                           // foundation ring
    for (i = 0; i < 9; i++) { a = i / 9 * PI * 2 + 0.3; pebble(L, Math.cos(a) * 1.18, Math.sin(a) * 1.18, 0.07 + rnd() * 0.05, i % 2 ? C.stone2 : C.stone); }
    tp(L, 0.62, 0.9, 1.95, 10, C.plaster, 0, 1.255, 0);                         // tower
    tp(L, 0.845, 0.855, 0.07, 10, C.plaster2, 0, 0.75, 0); tp(L, 0.735, 0.745, 0.07, 10, C.plaster2, 0, 1.5, 0);
    tp(L, 0.665, 0.675, 0.06, 10, C.plaster2, 0, 1.95, 0);
    bx(L, 0.5, 0.66, 0.05, C.stone, 0, 0.61, 0.81); cy(L, 0.25, 0.05, C.stone, 0, 0.94, 0.81, PI / 2);   // door frame
    bx(L, 0.4, 0.6, 0.08, C.dark, 0, 0.58, 0.84); cy(L, 0.2, 0.08, C.dark, 0, 0.88, 0.84, PI / 2);       // door
    bx(L, 0.02, 0.6, 0.09, C.dark2, -0.1, 0.58, 0.845); bx(L, 0.02, 0.6, 0.09, C.dark2, 0.1, 0.58, 0.845); sp(L, 0.025, C.gold, 0.13, 0.55, 0.9);
    bx(L, 0.7, 0.08, 0.3, C.stone, 0, 0.32, 1.0); bx(L, 0.5, 0.07, 0.24, C.stone2, 0, 0.385, 0.96);          // steps
    cy(L, 0.19, 0.05, C.dark, 0, 1.5, 0.71, PI / 2); cy(L, 0.14, 0.06, C.glass, 0, 1.5, 0.73, PI / 2);      // round window
    bx(L, 0.28, 0.03, 0.02, C.dark, 0, 1.5, 0.765); bx(L, 0.03, 0.28, 0.02, C.dark, 0, 1.5, 0.765);
    bx(L, 0.42, 0.1, 0.12, C.dark2, 0, 1.25, 0.78); flowers(L, -0.1, 1.31, 0.8, 0.28, 4); flowers(L, 0.12, 1.31, 0.8, 0.2, 3);
    for (i = -1; i <= 1; i += 2) bx(L, 0.05, 0.2, 0.08, C.glass, i * 0.7, 1.62, 0.12, 0, 0, 0);   // side slits
    tp(L, 0.86, 0.88, 0.08, 10, C.red3, 0, 2.27, 0);                             // eave
    cn(L, 0.82, 0.95, C.red, 0, 2.785, 0, 0, 0, CONE10);                          // roof
    tp(L, 0.575, 0.585, 0.04, 10, C.red2, 0, 2.61, 0); tp(L, 0.305, 0.315, 0.04, 10, C.red2, 0, 2.91, 0);
    sp(L, 0.07, C.cream, 0, 3.27, 0); cy(L, 0.02, 0.22, C.dark2, 0, 3.4, 0); bx(L, 0.16, 0.08, 0.015, C.pink, 0.09, 3.46, 0);   // finial + flag
    cy(L, 0.06, 0.42, C.dark2, 0, 2.25, 0.81, PI / 2); bx(L, 0.14, 0.14, 0.1, C.dark, 0, 2.25, 0.66);               // axle + bracket
    bx(L, 0.08, 0.5, 0.08, C.dark2, 0, 2.0, 0.64);
    // flour sacks + hay bale + tiny crate by the door
    sp(L, 0.17, C.sack, -0.82, 0.16, 1.28, 1.1); cn(L, 0.06, 0.1, C.sack, -0.82, 0.34, 1.28); bx(L, 0.1, 0.03, 0.1, C.red, -0.82, 0.31, 1.28);
    sp(L, 0.15, C.sack, -0.58, 0.14, 1.36, 1.1); cn(L, 0.055, 0.09, C.sack, -0.58, 0.3, 1.36);
    cy(L, 0.2, 0.4, C.hay, 1.0, 0.2, 1.22, 0, 0, PI / 2); cy(L, 0.205, 0.03, C.dark, 1.1, 0.2, 1.22, 0, 0, PI / 2); cy(L, 0.205, 0.03, C.dark, 0.9, 0.2, 1.22, 0, 0, PI / 2);
    bx(L, 0.26, 0.2, 0.26, C.wood, 1.25, 0.1, 0.92, 0, 0.3, 0); bx(L, 0.28, 0.03, 0.28, C.dark, 1.25, 0.215, 0.92, 0, 0.3, 0);
    for (i = 0; i < 5; i++) { a = rnd() * PI * 2; flowers(L, Math.cos(a) * 1.3, 0.02, Math.sin(a) * 1.3 + 0.1, 0.3, 3); }
  }
  /* sails: one mesh rotating around the hub (local origin = hub) */
  function sails() {
    var L = [], k, rot, s = Math.sin, c = Math.cos, cols = [C.pink, 0x7fc8d6, C.gold, 0xb79cf2];
    X = 0; Z = 0;
    function arm(w, h, d, col, ox, oy, oz) { var r = k * PI / 2; L.push(Mo.part(BOX, col, [ox * c(r) - oy * s(r), ox * s(r) + oy * c(r), oz], [0, 0, r], [w, h, d])); }
    for (k = 0; k < 4; k++) {
      rot = k * PI / 2;
      arm(0.075, 1.3, 0.06, 0xa8693a, 0, 0.72, 0);                                // main bar
      arm(0.22, 0.03, 0.04, 0xa8693a, 0.1, 0.4, 0.0); arm(0.22, 0.03, 0.04, 0xa8693a, 0.1, 0.7, 0.0); arm(0.22, 0.03, 0.04, 0xa8693a, 0.1, 1.0, 0.0);
      arm(0.34, 0.84, 0.025, C.cream, 0.21, 0.8, 0.03);                            // cloth sail
      arm(0.34, 0.09, 0.03, cols[k], 0.21, 0.55, 0.035); arm(0.34, 0.09, 0.03, cols[k], 0.21, 1.0, 0.035);
      arm(0.035, 0.84, 0.03, C.dark2, 0.38, 0.8, 0.035);
      L.push(Mo.part(SPH, C.dark2, [-1.38 * s(rot) * 0.95, 1.38 * c(rot) * 0.95, 0], [0, 0, 0], [0.1, 0.1, 0.1]));
    }
    L.push(Mo.part(SPH, 0xc65a45, [0, 0, 0.04], [0, 0, 0], [0.34, 0.34, 0.34]));   // hub
    L.push(Mo.part(CONE, C.gold, [0, 0, 0.2], [PI / 2, 0, 0], [0.18, 0.16, 0.18]));
    return Mo.mergeParts(L);
  }

  /* ------------------------------------------------------------ tool shed (center 20, 7) */
  function shed(L) {
    var i, rz;
    X = 20; Z = 7;
    bx(L, 2.0, 0.02, 1.6, C.tan, 0, 0.03, 0.3);                                  // dirt yard
    bx(L, 1.8, 0.1, 1.4, C.stone2, 0, 0.05, 0);
    bx(L, 1.7, 0.8, 1.3, 0xd09a62, 0, 0.5, 0);                                   // walls
    for (i = -3; i <= 3; i++) { bx(L, 0.014, 0.8, 0.01, C.dark, i * 0.22, 0.5, 0.655); bx(L, 0.014, 0.8, 0.01, C.dark, i * 0.22, 0.5, -0.655); }
    for (i = -2; i <= 2; i++) bx(L, 0.01, 0.8, 0.014, C.dark, 0.855, 0.5, i * 0.25);
    for (i = -1; i <= 1; i += 2) { bx(L, 0.1, 0.85, 0.1, C.dark2, i * 0.85, 0.52, 0.65); bx(L, 0.1, 0.85, 0.1, C.dark2, i * 0.85, 0.52, -0.65); }
    tri(L, 1.7, 0.52, 0.06, 0xe0ad72, 0, 0.9, 0.66); tri(L, 1.7, 0.52, 0.06, 0xd09a62, 0, 0.9, -0.66);      // gables
    for (i = -1; i <= 1; i += 2) {
      rz = i > 0 ? -0.55 : 0.55;
      bx(L, 1.12, 0.065, 1.55, C.teal, i * 0.47, 1.14, 0, 0, 0, rz);
      bx(L, 1.12, 0.03, 1.57, C.teal2, i * 0.45, 1.175, 0, 0, 0, rz);
    }
    bx(L, 0.11, 0.06, 1.58, C.teal2, 0, 1.43, 0);                                // ridge cap
    ic(L, 0.14, C.moss, 0.55, 1.1, 0.2, 0.3); ic(L, 0.1, C.moss, -0.6, 1.08, -0.3, 0.3);                       // roof moss
    bx(L, 0.68, 0.76, 0.03, C.dark2, -0.25, 0.48, 0.655);                        // door frame
    bx(L, 0.6, 0.7, 0.04, C.dark, -0.25, 0.47, 0.67);
    for (i = -1; i <= 1; i++) bx(L, 0.012, 0.7, 0.045, C.dark2, -0.25 + i * 0.15, 0.47, 0.675);
    bx(L, 0.6, 0.06, 0.05, C.dark2, -0.25, 0.3, 0.69); bx(L, 0.6, 0.06, 0.05, C.dark2, -0.25, 0.64, 0.69); bx(L, 0.74, 0.05, 0.05, C.dark2, -0.25, 0.47, 0.695, 0, 0, 0.8);
    bx(L, 0.07, 0.04, 0.03, C.iron, -0.5, 0.55, 0.7); bx(L, 0.07, 0.04, 0.03, C.iron, -0.5, 0.4, 0.7); sp(L, 0.03, C.gold, -0.02, 0.47, 0.72);
    bx(L, 0.36, 0.3, 0.03, C.dark2, 0.45, 0.6, 0.655); bx(L, 0.27, 0.21, 0.03, C.glass, 0.45, 0.6, 0.67);       // window
    bx(L, 0.27, 0.02, 0.03, C.dark2, 0.45, 0.6, 0.685); bx(L, 0.02, 0.21, 0.03, C.dark2, 0.45, 0.6, 0.685);
    bx(L, 0.11, 0.25, 0.03, C.teal, 0.22, 0.6, 0.675); bx(L, 0.11, 0.25, 0.03, C.teal, 0.68, 0.6, 0.675);
    bx(L, 0.42, 0.09, 0.12, C.dark2, 0.45, 0.42, 0.74); flowers(L, 0.36, 0.48, 0.76, 0.2, 3); flowers(L, 0.54, 0.48, 0.76, 0.2, 3);
    bx(L, 0.7, 0.05, 0.3, C.wood, -0.25, 0.07, 0.86);                           // step plank
    // tools leaning on the east wall: shovel, rake, pitchfork
    cy(L, 0.015, 1.1, C.dark, 0.93, 0.6, -0.4, 0, 0, -0.1); bx(L, 0.14, 0.2, 0.015, C.iron2, 0.99, 1.2, -0.4, 0, 0, -0.1);
    cy(L, 0.015, 1.1, C.dark, 0.93, 0.6, -0.12, 0, 0, -0.14); bx(L, 0.3, 0.025, 0.025, C.iron, 1.0, 1.15, -0.12, 0, 0, -0.14);
    for (i = -2; i <= 2; i++) bx(L, 0.012, 0.07, 0.012, C.iron, 1.0 + i * 0.002 + 0.0, 1.1, -0.12 + i * 0.065, 0, 0, -0.14);
    cy(L, 0.015, 1.1, C.dark, 0.93, 0.6, 0.16, 0, 0, -0.08); bx(L, 0.02, 0.1, 0.12, C.iron2, 0.97, 1.18, 0.16, 0, 0, -0.08);
    bucket(L, -0.82, 0, 0.92); bx(L, 0.3, 0.3, 0.3, C.wood, 0.78, 0.15, 0.95, 0, 0.2, 0); bx(L, 0.32, 0.03, 0.32, C.dark, 0.78, 0.31, 0.95, 0, 0.2, 0);
    ic(L, 0.07, C.red, 0.78, 0.37, 0.95, 0.9); cy(L, 0.015, 0.06, C.green, 0.78, 0.43, 0.95);
    for (i = 0; i < 4; i++) flowers(L, -1.05 + rnd() * 0.15, 0.02, -0.5 + i * 0.35, 0.2, 2);
  }

  /* ------------------------------------------------------------ shrine tree (trunk 6.5, 18.5) */
  var RIBBONS = [];   // filled by shrine(): [x, y, z, length, color]
  function shrine(L) {
    var i, a, r, cols = [0xe8715d, C.pink, C.gold, 0x7fc8d6, 0xffffff, 0xb79cf2];
    X = 6.5; Z = 18.5;
    cy(L, 1.35, 0.025, C.shade, 0, 0.012, 0.05); cy(L, 1.0, 0.02, C.moss, 0, 0.03, 0.0);                    // shade + moss
    for (i = 0; i < 16; i++) { a = rnd() * PI * 2; r = 0.5 + rnd() * 0.85; cy(L, 0.04 + rnd() * 0.03, 0.01, i % 3 ? C.blossom : C.leaf2, Math.cos(a) * r, 0.045, Math.sin(a) * r); }
    tp(L, 0.38, 0.52, 0.7, 8, C.bark, 0, 0.35, 0);
    tp(L, 0.3, 0.38, 0.6, 8, C.bark2, 0.05, 0.98, -0.02, 0, 0, -0.08);
    tp(L, 0.2, 0.3, 0.55, 8, C.bark, 0.12, 1.5, -0.05, 0, 0, -0.18);
    tp(L, 0.06, 0.12, 0.7, 6, C.bark, -0.4, 1.72, -0.02, 0, 0, 0.95); tp(L, 0.06, 0.11, 0.7, 6, C.bark2, 0.55, 1.78, 0.0, 0, 0, -1.0);
    tp(L, 0.05, 0.09, 0.55, 6, C.bark, 0.2, 1.85, 0.35, 0.8, 0, -0.2);
    for (i = 0; i < 6; i++) { a = i / 6 * PI * 2 + 0.4; ic(L, 0.15 + rnd() * 0.06, i % 2 ? C.bark : C.bark2, Math.cos(a) * 0.5, 0.09, Math.sin(a) * 0.5, 0.55, rnd() * 3); }
    sp(L, 0.12, 0x3b2a22, 0, 0.42, 0.47, 1.5); ic(L, 0.07, C.stone, -0.17, 0.3, 0.45, 0.6); ic(L, 0.06, C.stone, 0.17, 0.3, 0.46, 0.6);   // hollow
    ic(L, 0.13, C.moss, 0.38, 0.62, 0.22, 0.5); ic(L, 0.11, C.moss, -0.35, 0.78, -0.2, 0.5); ic(L, 0.12, C.moss, 0.0, 1.3, 0.3, 0.45);
    for (i = 0; i < 3; i++) { cy(L, 0.015, 0.07, C.cream, 0.55 + i * 0.09, 0.09, 0.15 + i * 0.12); cn(L, 0.05, 0.05, 0xe8715d, 0.55 + i * 0.09, 0.14, 0.15 + i * 0.12, 0, 0, CONE10); }
    ic(L, 0.85, C.leaf, 0, 2.35, 0, 0.8); ic(L, 0.6, C.leaf3, -0.75, 2.02, 0.1, 0.8); ic(L, 0.62, C.leaf, 0.78, 2.08, -0.1, 0.8);
    ic(L, 0.62, C.leaf2, 0.1, 2.88, -0.1, 0.8); ic(L, 0.5, C.leaf3, 0.0, 2.2, 0.62, 0.8); ic(L, 0.55, C.leaf2, -0.3, 2.62, -0.5, 0.8);
    ic(L, 0.4, C.leaf, 0.55, 2.55, 0.4, 0.8); ic(L, 0.35, C.leaf3, -0.95, 2.45, -0.3, 0.8);
    for (i = 0; i < 14; i++) { a = rnd() * PI * 2; r = 0.7 + rnd() * 0.4; ic(L, 0.07 + rnd() * 0.04, i % 4 ? C.blossom : 0xffffff, Math.cos(a) * r, 1.95 + rnd() * 1.1, Math.sin(a) * r, 0.8); }
    tor(L, 0.46, 0xe8d4a0, 0.06, 1.18, -0.03);                                    // sacred rope around the trunk
    for (i = 0; i < 5; i++) { a = 0.3 + i * 0.6; bx(L, 0.07, 0.14, 0.012, 0xffffff, (i - 2) * 0.17, 1.08, 0.43 - Math.abs(i - 2) * 0.05, 0, (i - 2) * 0.35); }
    // stone altar, offering bowl, lantern and two little stone guardians
    bx(L, 1.0, 0.12, 0.46, C.stone, 0, 0.06, 0.92); bx(L, 0.8, 0.07, 0.34, C.stone2, 0, 0.155, 0.92);
    cy(L, 0.12, 0.08, C.red2, 0, 0.23, 0.92); cy(L, 0.1, 0.02, 0xffe3b0, 0, 0.27, 0.92);
    sp(L, 0.025, C.gold, -0.04, 0.3, 0.9); sp(L, 0.025, C.gold, 0.03, 0.3, 0.94); ic(L, 0.04, 0xe8715d, 0.0, 0.31, 0.91, 0.9);
    bx(L, 0.2, 0.06, 0.2, C.stone, -0.95, 0.03, 0.85); cy(L, 0.05, 0.3, C.stone2, -0.95, 0.21, 0.85); bx(L, 0.18, 0.16, 0.18, C.stone, -0.95, 0.44, 0.85);
    bx(L, 0.1, 0.1, 0.19, 0xffd98a, -0.95, 0.44, 0.85); cn(L, 0.17, 0.14, C.stone2, -0.95, 0.59, 0.85, 0, 0, CONE4); sp(L, 0.03, C.stone, -0.95, 0.68, 0.85);
    sp(L, 0.12, C.stone, 0.95, 0.17, 0.85, 1.15); sp(L, 0.095, C.stone, 0.95, 0.36, 0.89, 1.0);   // guardian cat
    cn(L, 0.035, 0.07, C.stone, 0.89, 0.45, 0.89); cn(L, 0.035, 0.07, C.stone, 1.01, 0.45, 0.89); sp(L, 0.025, C.stone2, 0.95, 0.4, 0.97);
    sp(L, 0.05, C.stone, 0.82, 0.07, 0.78, 1.0); bx(L, 0.2, 0.04, 0.16, C.red, 0.95, 0.04, 0.85, 0, 0, 0);
    // ribbons hang from the branches (cloth mesh, see buildCloth)
    RIBBONS.length = 0;
    for (i = 0; i < 9; i++) { a = i / 9 * PI * 2 + rnd() * 0.4; r = 0.75 + rnd() * 0.3; RIBBONS.push([6.5 + Math.cos(a) * r, 1.95 + rnd() * 0.2, 18.5 + Math.sin(a) * r + 0.1, 0.5 + rnd() * 0.3, cols[i % cols.length], a]); }
  }

  /* ------------------------------------------------------------ notice board (center 38, 20.5) */
  function board(L) {
    var i;
    X = 38; Z = 20.5;
    bx(L, 1.9, 0.02, 0.8, C.tan, 0, 0.03, 0.15);
    for (i = -1; i <= 1; i += 2) { bx(L, 0.13, 1.4, 0.13, C.dark2, i * 0.8, 0.7, 0); bx(L, 0.2, 0.06, 0.2, C.stone2, i * 0.8, 0.03, 0); }
    bx(L, 1.55, 0.82, 0.07, C.wood2, 0, 1.0, 0);                                  // panel
    bx(L, 1.65, 0.06, 0.1, C.dark, 0, 1.43, 0.0); bx(L, 1.65, 0.06, 0.1, C.dark, 0, 0.59, 0.0);
    bx(L, 0.06, 0.82, 0.1, C.dark, -0.8, 1.0, 0.0); bx(L, 0.06, 0.82, 0.1, C.dark, 0.8, 1.0, 0.0);
    bx(L, 1.85, 0.07, 0.42, C.red, 0, 1.55, 0.04, 0.22, 0, 0); bx(L, 1.85, 0.03, 0.44, C.red2, 0, 1.51, 0.06, 0.22, 0, 0);       // little roof
    bx(L, 0.1, 0.1, 0.1, C.gold, 0, 1.63, -0.1); sp(L, 0.05, C.gold, 0, 1.66, -0.1);
    bx(L, 0.42, 0.52, 0.012, C.cream, -0.5, 1.03, 0.045); bx(L, 0.42, 0.08, 0.014, C.red, -0.5, 1.23, 0.048);      // notes
    for (i = 0; i < 4; i++) bx(L, 0.3, 0.018, 0.014, C.iron, -0.5, 1.07 - i * 0.07, 0.05);
    bx(L, 0.3, 0.38, 0.012, 0xffd9e0, 0.02, 1.1, 0.045, 0, 0, 0.04); for (i = 0; i < 3; i++) bx(L, 0.2, 0.016, 0.014, C.iron, 0.02, 1.15 - i * 0.07, 0.05, 0, 0, 0.04);
    bx(L, 0.34, 0.44, 0.012, 0xd9f0e8, 0.5, 0.97, 0.045, 0, 0, -0.03); bx(L, 0.34, 0.07, 0.014, 0x4fb3c8, 0.5, 1.15, 0.048, 0, 0, -0.03);
    for (i = 0; i < 3; i++) bx(L, 0.22, 0.016, 0.014, C.iron, 0.5, 1.0 - i * 0.07, 0.05, 0, 0, -0.03);
    sp(L, 0.025, 0xe8715d, -0.5, 1.25, 0.06); sp(L, 0.025, 0x4fb3c8, 0.02, 1.27, 0.06); sp(L, 0.025, C.gold, 0.5, 1.2, 0.06);
    bx(L, 0.06, 0.03, 0.12, C.iron, 0.8, 1.2, 0.1); cy(L, 0.07, 0.12, 0xffc866, 0.8, 1.08, 0.18); cn(L, 0.09, 0.07, C.iron, 0.8, 1.17, 0.18, 0, 0, CONE10);   // hanging lantern
    bx(L, 0.5, 0.14, 0.2, C.dark2, -0.8, 0.12, 0.25); flowers(L, -0.9, 0.2, 0.25, 0.3, 4); flowers(L, -0.7, 0.2, 0.25, 0.2, 3);
    ic(L, 0.14, C.stone, -0.25, 0.03, 0.62, 0.2); ic(L, 0.12, C.stone, 0.15, 0.03, 0.78, 0.2); ic(L, 0.13, C.stone, 0.5, 0.03, 0.6, 0.2);   // stepping stones
    for (i = 0; i < 4; i++) flowers(L, 0.9 + rnd() * 0.1, 0.02, 0.1 + i * 0.2, 0.18, 2);
  }

  /* ------------------------------------------------------------ compost bin (10.5, 15.5) + trough (11, 17.5) */
  function compost(L) {
    var i;
    X = 10.5; Z = 15.5;
    bx(L, 0.95, 0.02, 0.95, C.tan, 0, 0.03, 0.05);
    for (i = 0; i < 3; i++) {
      bx(L, 0.8, 0.14, 0.05, i % 2 ? C.wood : 0xb87a45, 0, 0.17 + i * 0.17, -0.38); bx(L, 0.05, 0.14, 0.8, i % 2 ? 0xb87a45 : C.wood, -0.38, 0.17 + i * 0.17, 0); bx(L, 0.05, 0.14, 0.8, i % 2 ? C.wood : 0xb87a45, 0.38, 0.17 + i * 0.17, 0);
    }
    bx(L, 0.8, 0.14, 0.05, C.wood, 0, 0.17, 0.38); bx(L, 0.8, 0.14, 0.05, 0xb87a45, 0, 0.34, 0.38);
    for (i = 0; i < 4; i++) bx(L, 0.08, 0.62, 0.08, C.dark2, (i % 2 ? 1 : -1) * 0.4, 0.31, (i < 2 ? 1 : -1) * 0.4);
    ic(L, 0.34, C.soil, 0, 0.42, -0.02, 0.6); ic(L, 0.2, 0x7a5236, 0.2, 0.52, 0.1, 0.6); ic(L, 0.12, C.leaf, -0.18, 0.56, 0.12, 0.5); ic(L, 0.1, 0xd9a066, -0.05, 0.6, -0.1, 0.5);
    bx(L, 0.14, 0.02, 0.05, C.gold, 0.1, 0.62, 0.18, 0.2, 0.7, 0.3); sp(L, 0.035, 0xe8715d, -0.22, 0.58, -0.12); sp(L, 0.025, 0xffffff, 0.22, 0.63, -0.1, 0.5);
    bx(L, 0.8, 0.05, 0.5, C.wood, 0, 0.62, -0.62, 0.75, 0, 0);                    // lid leaning on the back
    cy(L, 0.012, 0.8, C.dark, 0.5, 0.4, 0.5, 0, 0, -0.25); bx(L, 0.14, 0.02, 0.02, C.iron2, 0.6, 0.8, 0.5);               // pitchfork
    for (i = -1; i <= 1; i++) bx(L, 0.012, 0.07, 0.012, C.iron2, 0.6 + i * 0.05, 0.75, 0.5);
    for (i = 0; i < 3; i++) flowers(L, -0.5 + rnd() * 0.2, 0.02, 0.2 + i * 0.2, 0.2, 2);
  }
  function trough(L) {
    var i;
    X = 11; Z = 17.5;
    bx(L, 1.8, 0.02, 0.7, C.tan, 0, 0.03, 0.05);
    bx(L, 1.5, 0.05, 0.34, C.dark, 0, 0.28, 0); bx(L, 1.6, 0.26, 0.05, C.wood, 0, 0.4, -0.19); bx(L, 1.6, 0.26, 0.05, C.wood, 0, 0.4, 0.19);
    bx(L, 0.05, 0.26, 0.42, 0xb87a45, -0.775, 0.4, 0); bx(L, 0.05, 0.26, 0.42, 0xb87a45, 0.775, 0.4, 0);
    bx(L, 1.46, 0.012, 0.32, C.water, 0, 0.46, 0); bx(L, 0.5, 0.014, 0.1, 0xa8e2f0, -0.2, 0.465, 0.02);
    for (i = -1; i <= 1; i += 2) { bx(L, 0.08, 0.28, 0.08, C.dark2, i * 0.62, 0.14, -0.14); bx(L, 0.08, 0.28, 0.08, C.dark2, i * 0.62, 0.14, 0.14); bx(L, 0.05, 0.05, 0.36, C.dark2, i * 0.62, 0.12, 0); }
    cy(L, 0.07, 0.012, C.leaf2, 0.3, 0.472, 0.04); sp(L, 0.025, C.pink, 0.45, 0.48, -0.04, 0.5);
    cy(L, 0.012, 0.2, C.dark, -0.55, 0.62, 0.22, 0.0, 0, 0.5); sp(L, 0.04, C.iron2, -0.46, 0.72, 0.22, 0.8);               // ladle
    bucket(L, 0.95, 0, 0.42);
    for (i = 0; i < 3; i++) flowers(L, -0.9 + rnd() * 0.1, 0.02, -0.15 + i * 0.25, 0.2, 2);
  }

  /* ------------------------------------------------------------ cloth: ribbons + fluttering notes (CPU, one mesh) */
  var cloth = { pos: [], col: [], w: [], nx: [], nz: [], ph: [], base: null, arr: null, geo: null, mesh: null, n: 0 };
  function cv(x, y, z, c, w, nx, nz, ph) { cloth.pos.push(x, y, z); cloth.col.push(c.r, c.g, c.b); cloth.w.push(w); cloth.nx.push(nx); cloth.nz.push(nz); cloth.ph.push(ph); }
  function strip(x, y, z, len, hw, tx, tz, c, nx, nz, ph, S) {   // hanging strip, top at y, width along (tx,tz), swing along (nx,nz)
    var s, y0, y1, w0, w1, col = new THREE.Color(c), l0, l1;
    for (s = 0; s < S; s++) {
      y0 = y - len * s / S; y1 = y - len * (s + 1) / S; w0 = s / S; w1 = (s + 1) / S;
      l0 = hw * (1 - w0 * 0.35); l1 = hw * (1 - w1 * 0.35);
      cv(x - tx * l0, y0, z - tz * l0, col, w0, nx, nz, ph); cv(x + tx * l0, y0, z + tz * l0, col, w0, nx, nz, ph); cv(x - tx * l1, y1, z - tz * l1, col, w1, nx, nz, ph);
      cv(x + tx * l0, y0, z + tz * l0, col, w0, nx, nz, ph); cv(x + tx * l1, y1, z + tz * l1, col, w1, nx, nz, ph); cv(x - tx * l1, y1, z - tz * l1, col, w1, nx, nz, ph);
    }
  }
  function buildCloth() {
    var i, rb, tx, tz;
    for (i = 0; i < RIBBONS.length; i++) {
      rb = RIBBONS[i]; tx = -Math.sin(rb[5]); tz = Math.cos(rb[5]);
      strip(rb[0], rb[1], rb[2], rb[3], 0.045, tx, tz, rb[4], 0.92, 0.39, i * 1.7, 3);
      strip(rb[0], rb[1], rb[2], rb[3] * 0.6, 0.02, tx, tz, 0xffffff, 0.92, 0.39, i * 1.7 + 0.5, 2);   // thin tail
    }
    strip(38.5, 1.28, 20.55, 0.22, 0.09, 1, 0, 0xfff7e0, 0, 1, 0.4, 2);           // two notes pinned on the board, loose corners flutter
    strip(37.55, 1.2, 20.55, 0.2, 0.08, 1, 0, 0xffe6a8, 0, 1, 2.2, 2);
    cloth.n = cloth.pos.length / 3;
    cloth.base = new Float32Array(cloth.pos); cloth.arr = new Float32Array(cloth.pos);
    cloth.geo = new THREE.BufferGeometry();
    cloth.geo.setAttribute('position', new THREE.BufferAttribute(cloth.arr, 3)); cloth.geo.setAttribute('color', new THREE.Float32BufferAttribute(cloth.col, 3));
    cloth.mesh = new THREE.Mesh(cloth.geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    cloth.mesh.name = 'landmarks_cloth'; cloth.mesh.frustumCulled = false; LM.group.add(cloth.mesh);
  }

  /* ------------------------------------------------------------ animation frame (priority 10.7) */
  var S = { ready: false, wx: 37.5, wz: 11.5, sx: 6.5, sz: 18.5, bx: 38, bz: 20.5 }, blades = null, t = 0, noteIdx = 0;
  function onFrame(dt) {
    var P = G.Player && G.Player.pos, dx, dz, q, qSway, gust, sp2, i, vi, w0, wt;
    if (!S.ready || !P || !LM.group.parent || !LM.group.parent.visible) return;
    if (dt > 0.1) dt = 0.1;
    t += dt; gust = G.Time && (G.Time.weather === 'rain' || G.Time.weather === 'storm') ? 1.8 : 1;
    dx = P.x - S.wx; dz = P.z - S.wz;
    if (dx * dx + dz * dz < 1600) { sp2 = (0.5 + 0.14 * Math.sin(t * 0.37) + 0.05 * Math.sin(t * 1.3)) * gust; blades.rotation.z -= sp2 * dt; }
    q = G.Quality && G.Quality.def ? G.Quality.def() : null; qSway = q ? q.sway : 1;
    if (qSway <= 0) return;
    dx = P.x - S.sx; dz = P.z - S.sz; var nearS = dx * dx + dz * dz < 625;
    dx = P.x - S.bx; dz = P.z - S.bz; var nearB = dx * dx + dz * dz < 625;
    cloth.mesh.visible = nearS || nearB; if (!cloth.mesh.visible) return;
    for (i = 0; i < cloth.n; i++) {
      w0 = cloth.w[i]; vi = i * 3; if (w0 < 0.01) continue;
      wt = (Math.sin(t * 1.7 + cloth.ph[i] + cloth.base[vi] * 0.9) * 0.07 + Math.sin(t * 3.1 + cloth.ph[i] * 2) * 0.02) * w0 * qSway * gust;
      if (cloth.base[vi + 2] > 19.5) wt *= 0.45;   // board notes move less
      cloth.arr[vi] = cloth.base[vi] + cloth.nx[i] * wt; cloth.arr[vi + 1] = cloth.base[vi + 1] - Math.abs(wt) * 0.25 * w0; cloth.arr[vi + 2] = cloth.base[vi + 2] + cloth.nz[i] * wt;
    }
    cloth.geo.attributes.position.needsUpdate = true;
  }

  /* ------------------------------------------------------------ interactions (Vietnamese texts) */
  var NOTES = [
    ['Thông báo: Hội chợ thu hoạch năm nay dời sang cuối thu. Ai trồng được củ cải to nhất sẽ được treo tên lên bảng vàng!',
      'Nhắn nhủ: Nhờ ai đó mang giúp ít bột mì mới đến cối xay gió. Bánh mì cuối tuần sắp hết rồi.'],
    ['Tìm đồ: Ai thấy chiếc cần câu tre của ông Sáu rơi gần cầu tàu thì báo giúp nhé. Ông nhớ nó lắm.',
      'Mực đã nhòe: "Ngày xưa, mỗi mùa trăng tròn cả làng thắp đèn lồng bên hồ. Không biết ai còn nhớ bài hát ấy..."'],
    ['Nhắn nhủ: Cây cổ thụ phía tây đã đứng đó lâu hơn bất kỳ ai trong thung lũng. Nhớ buộc một dải lụa cầu bình an nhé.',
      'Tờ giấy cũ ghim ở góc: "Hạt giống tốt nhất luôn được cất ở nơi ấm nhất." Hình như là chữ của một người làm vườn lâu năm.']
  ];
  function onNotice() {
    if (!G.UI || !G.UI.dialog) return;
    var set = NOTES[noteIdx++ % NOTES.length];
    G.UI.dialog({ name: 'Bảng tin làng', lines: set });
  }
  function onShrine() {
    if (!G.UI || !G.UI.dialog) return;
    G.UI.dialog({ name: 'Cây cổ thụ', lines: ['Những dải lụa đã bạc màu theo năm tháng. Dưới gốc cây có một cái bát nhỏ đựng vài đồng xu cũ và quả táo còn tươi.',
      'Bạn lặng lẽ chắp tay. Gió khẽ lay những dải lụa, nghe như ai đó đang thì thầm ngày xưa.'] });
  }

  /* ------------------------------------------------------------ build */
  LM.build = function () {
    if (S.ready) return;
    var parent = G.Scenery.group || G.Decor.group, L = [], m;
    LM.group = new THREE.Group(); LM.group.name = 'landmarks'; parent.add(LM.group);
    LAYOUT.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    windmill(L); shed(L); shrine(L); board(L); compost(L); trough(L);
    m = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); m.name = 'landmarks_static'; R.addOutline(m, true); LM.group.add(m);
    blades = new THREE.Mesh(sails(), Mo.material('prop')); blades.name = 'landmarks_sails'; blades.position.set(37.5, 2.25, 11.5);
    R.addOutline(blades, true); LM.group.add(blades);
    buildCloth();
    LAYOUT.spots.forEach(function (s) { W.registerInteractable({ id: s[0], type: s[0], tile: { tx: s[1], tz: s[2] }, facing: s[3], hint: s[4] }); });
    E.on('interact:noticeboard', onNotice); E.on('interact:shrine', onShrine);
    LM.stats = { parts: L.length, ribbons: RIBBONS.length, draws: 5 };
    S.ready = true;
    G.Loop.onFrame(onFrame, 10.7);
  };
})();
