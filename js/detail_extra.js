/* Togie Valley - detail_extra.js (Stage 15F3): small details everywhere.
 * Game.DetailExtra.build(): finished map edge (below-ground grass skirt + edge rocks / bushes / reeds / tufts, so no void is ever visible),
 * grass tuft variety (3 shapes, 5 greens), flower mini-clusters, pebble groups, rock variety, mushroom clusters, shells on sand.
 * Everything is seeded, non-blocking (small, ground level), built once as merged geometry. Draw calls added: 6
 * (props + outline, tufts, edge + outline, skirt). Tufts are hidden when Quality.flower < 0.55 (tiers Thấp / Siêu nhẹ).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.WorldMap || !G.Scenery) { console.error('[detail_extra] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, WM = G.WorldMap, U = G.util;
  var DX = G.DetailExtra = { group: null, stats: null };
  var MARGIN = 9, PI = Math.PI;
  var BOX = new THREE.BoxGeometry(1, 1, 1), SPH = new THREE.SphereGeometry(0.5, 7, 5), ICO = new THREE.IcosahedronGeometry(0.5, 0),
    CON5 = new THREE.ConeGeometry(0.5, 1, 5), CON4 = new THREE.ConeGeometry(0.5, 1, 4), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  var GREENS = [0x6fbf6a, 0x82c978, 0x5fae62, 0x93d27c, 0x7bbf5a], DRY = [0xb5c46a, 0xc9c27a], PETAL = [0xff9bb3, 0xffd166, 0xffffff, 0xb79cf2, 0xff8f6b, 0x8ecbff];
  var STONES = [0xb7b2a6, 0x9a958b, 0xc4bfb2, 0xa8a094], CAPS = [0xd9825b, 0xf2e6c8, 0xc26a4e, 0xe9b44c], SKIRT = [0x78b868, 0x82c06f, 0x70b062];

  function part(L, geo, c, x, y, z, sx, sy, sz, ry, rx, rz) { L.push(Mo.part(geo, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [sx, sy, sz])); }

  function tuft(L, r, x, y, z, big) {   // 3 shapes: spiky fan, round bush, flat wide tuft
    var s = (big ? 1.25 : 1) * (0.7 + r() * 0.6), c = GREENS[(r() * GREENS.length) | 0], k = r(), i, n, a;
    if (r() < 0.12) c = DRY[(r() * DRY.length) | 0];
    if (k < 0.45) { n = 3 + ((r() * 3) | 0); for (i = 0; i < n; i++) { a = i / n * PI * 2 + r(); part(L, CON4, c, x + Math.cos(a) * 0.04 * s, y + 0.07 * s, z + Math.sin(a) * 0.04 * s, 0.05 * s, 0.17 * s * (0.7 + r() * 0.6), 0.05 * s, r() * 3, Math.cos(a) * 0.35, Math.sin(a) * 0.35); } }
    else if (k < 0.75) { part(L, ICO, c, x, y + 0.05 * s, z, 0.22 * s, 0.15 * s, 0.22 * s, r() * 3); part(L, ICO, GREENS[(r() * GREENS.length) | 0], x + 0.06 * s, y + 0.1 * s, z - 0.03 * s, 0.13 * s, 0.12 * s, 0.13 * s, r() * 3); }
    else { for (i = 0; i < 4; i++) { a = i * PI / 2 + r() * 0.8; part(L, CON5, c, x + Math.cos(a) * 0.07 * s, y + 0.035 * s, z + Math.sin(a) * 0.07 * s, 0.09 * s, 0.1 * s, 0.09 * s, r() * 3, Math.cos(a) * 0.9, Math.sin(a) * 0.9); } }
  }
  function flowerBit(L, r, x, y, z) {
    var c = PETAL[(r() * PETAL.length) | 0], n = 2 + ((r() * 3) | 0), i, h;
    for (i = 0; i < n; i++) { h = 0.1 + r() * 0.08; part(L, CYL, 0x5aa86a, x + (r() - 0.5) * 0.22, y + h / 2, z + (r() - 0.5) * 0.22, 0.015, h, 0.015, 0); part(L, SPH, c, x + (r() - 0.5) * 0.22, y + h + 0.015, z + (r() - 0.5) * 0.22, 0.07, 0.05, 0.07, 0); }
  }
  function pebbles(L, r, x, y, z) {
    var n = 2 + ((r() * 4) | 0), i, s;
    for (i = 0; i < n; i++) { s = 0.06 + r() * 0.08; part(L, ICO, STONES[(r() * STONES.length) | 0], x + (r() - 0.5) * 0.4, y + s * 0.2, z + (r() - 0.5) * 0.4, s * 2, s * 1.1, s * 1.7, r() * 3); }
  }
  function rock(L, r, x, y, z, k) {   // 3 rock shapes: boulder, flat slab, stacked pair
    var s = 0.16 + r() * 0.16, c = STONES[(r() * STONES.length) | 0];
    if (k === 0) { part(L, ICO, c, x, y + s * 0.35, z, s * 2.2, s * 1.4, s * 1.9, r() * 3); part(L, ICO, 0x78b36a, x, y + s * 0.95, z, s * 1.3, s * 0.35, s * 1.1, r() * 3); }
    else if (k === 1) { part(L, ICO, c, x, y + s * 0.18, z, s * 3.0, s * 0.7, s * 2.2, r() * 3); }
    else { part(L, ICO, c, x, y + s * 0.3, z, s * 2.2, s * 1.2, s * 2, r() * 3); part(L, ICO, STONES[(r() * STONES.length) | 0], x + s * 0.3, y + s * 1.0, z - s * 0.2, s * 1.3, s * 0.9, s * 1.2, r() * 3); }
  }
  function mushrooms(L, r, x, y, z) {
    var n = 2 + ((r() * 3) | 0), i, s, px, pz, c = CAPS[(r() * CAPS.length) | 0];
    for (i = 0; i < n; i++) {
      s = 0.6 + r() * 0.7; px = x + (r() - 0.5) * 0.3; pz = z + (r() - 0.5) * 0.3;
      part(L, CYL, 0xf4ead2, px, y + 0.05 * s, pz, 0.05 * s, 0.1 * s, 0.05 * s, 0);
      part(L, SPH, c, px, y + 0.11 * s, pz, 0.15 * s, 0.09 * s, 0.15 * s, 0);
      if (c === 0xd9825b || c === 0xc26a4e) part(L, SPH, 0xfff6e0, px + 0.03 * s, y + 0.16 * s, pz, 0.04 * s, 0.02 * s, 0.04 * s, 0);
    }
  }
  function bush(L, r, x, y, z, s) {
    var c = GREENS[(r() * GREENS.length) | 0], i;
    for (i = 0; i < 3; i++) part(L, ICO, i ? GREENS[(r() * GREENS.length) | 0] : c, x + (r() - 0.5) * 0.4 * s, y + (0.2 + i * 0.06) * s, z + (r() - 0.5) * 0.4 * s, (0.7 - i * 0.1) * s, 0.55 * s, (0.7 - i * 0.1) * s, r() * 3);
  }
  function reed(L, r, x, y, z) {
    var n = 4 + ((r() * 3) | 0), i, h;
    for (i = 0; i < n; i++) { h = 0.5 + r() * 0.45; part(L, CON4, 0x8fae5a, x + (r() - 0.5) * 0.35, y + h / 2, z + (r() - 0.5) * 0.35, 0.05, h, 0.05, r() * 3, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25); }
    part(L, CYL, 0x8c5a34, x, y + 0.5, z, 0.07, 0.2, 0.07, 0);
  }

  function build() {
    var Wd = WM.W, Hd = WM.H, rows = WM.rows, rnd = U.rng(15031), group = new THREE.Group(), mat = Mo.material('prop');
    var props = [], tufts = [], edge = [], skirt = new THREE.BufferGeometry(), sp = [], sn = [], sc = [], tx, tz, ch, v, ext = (G.Landmarks && G.Landmarks.layout && G.Landmarks.layout.ext) || {}, cnt = { tufts: 0, flowers: 0, pebbles: 0, rocks: 0, mush: 0, edge: 0 };
    group.name = 'detail_extra';
    function cell(x, z) { return x < 0 || z < 0 || x >= Wd || z >= Hd ? ' ' : rows[z].charAt(x); }
    function inExt(x, z) { var k, e; for (k in ext) { e = ext[k]; if (x >= e[0] - 1 && x < e[2] + 1 && z >= e[1] - 1 && z < e[3] + 1) return true; } return false; }
    function farm(x, z) { return x > 10 && x < 29 && z > 5 && z < 20; }
    // 1) inner ground variety (grass tiles only, off the farm block, off blocked tiles, off landmarks)
    for (tz = 0; tz < Hd; tz++) for (tx = 0; tx < Wd; tx++) {
      ch = cell(tx, tz);
      if (ch === ',' && rnd() < 0.05) { pebbles(props, rnd, tx + 0.2 + rnd() * 0.6, 0.01, tz + 0.2 + rnd() * 0.6); cnt.pebbles++; continue; }
      if (ch !== '.' || farm(tx, tz) || inExt(tx, tz) || !W.isWalkableTile(tx, tz)) continue;
      var x0 = tx + 0.15 + rnd() * 0.7, z0 = tz + 0.15 + rnd() * 0.7, near = cell(tx + 1, tz) === '=' || cell(tx - 1, tz) === '=' || cell(tx, tz + 1) === '=' || cell(tx, tz - 1) === '=';
      v = rnd();
      if (v < 0.30) { tuft(tufts, rnd, x0, 0, z0, false); cnt.tufts++; if (rnd() < 0.5) tuft(tufts, rnd, x0 + (rnd() - 0.5) * 0.5, 0, z0 + (rnd() - 0.5) * 0.5, false); }
      else if (v < 0.37) { flowerBit(tufts, rnd, x0, 0, z0); cnt.flowers++; }
      else if (v < 0.405) { pebbles(props, rnd, x0, 0, z0); cnt.pebbles++; }
      else if (v < 0.425 && !near) { rock(props, rnd, x0, 0, z0, (rnd() * 3) | 0); cnt.rocks++; }
      else if (v < 0.437 && !near) { mushrooms(props, rnd, x0, 0, z0); cnt.mush++; }
    }
    // 2) map edge: below-ground grass skirt (so the void never shows) + dressing along the outer rim
    function skq(x0, z0, x1, z1, c) { var cc = new THREE.Color(c), q = [x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0], i; for (i = 0; i < 12; i += 2) { sp.push(q[i], -0.04, q[i + 1]); sn.push(0, 1, 0); sc.push(cc.r, cc.g, cc.b); } }
    for (tz = -MARGIN; tz < Hd + MARGIN; tz++) for (tx = -MARGIN; tx < Wd + MARGIN; tx++) {
      if (tx >= 0 && tz >= 0 && tx < Wd && tz < Hd) continue;
      skq(tx, tz, tx + 1, tz + 1, SKIRT[(rnd() * 3) | 0]);
      var d = Math.max(-tx, tx - Wd + 1, -tz, tz - Hd + 1);   // tiles outside the rim (1 = first ring)
      if (d > 5) continue;
      v = rnd();
      var ex = tx + 0.5 + (rnd() - 0.5) * 0.7, ez = tz + 0.5 + (rnd() - 0.5) * 0.7;
      if (v < 0.34) tuft(edge, rnd, ex, 0, ez, true);
      else if (v < 0.44) bush(edge, rnd, ex, 0, ez, 0.9 + rnd() * 0.7);
      else if (v < 0.52) rock(edge, rnd, ex, 0, ez, (rnd() * 3) | 0);
      else if (v < 0.56) flowerBit(edge, rnd, ex, 0, ez);
      else if (v < 0.58) reed(edge, rnd, ex, 0, ez);
      cnt.edge++;
    }
    skirt.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    skirt.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
    skirt.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    skirt.computeBoundingSphere();
    var mp = new THREE.Mesh(Mo.mergeParts(props), mat); mp.name = 'extra_props'; mp.raycast = function () {}; R.addOutline(mp, true); group.add(mp);
    var mt = new THREE.Mesh(Mo.mergeParts(tufts), mat); mt.name = 'extra_tufts'; mt.raycast = function () {}; group.add(mt);
    var me = new THREE.Mesh(Mo.mergeParts(edge), mat); me.name = 'extra_edge'; me.raycast = function () {}; R.addOutline(me, true); group.add(me);
    var ms = new THREE.Mesh(skirt, mat); ms.name = 'extra_skirt'; ms.raycast = function () {}; ms.frustumCulled = false; group.add(ms);
    [mp, mt, me, ms].forEach(function (m) { m.matrixAutoUpdate = false; m.updateMatrix(); });
    function gate() { var q = G.Quality && G.Quality.tiers ? G.Quality.tiers[G.Quality.level()] : null; mt.visible = !q || q.flower >= 0.55; }
    gate(); if (G.Events) G.Events.on('quality:changed', gate);
    // Edge mist: one merged 4-wall band outside the map rim (+1 draw call). Colored by the shared fog uniform (sky / time / weather), alpha fades with height.
    var MW = G.World.W, MH = G.World.H, MO = 6.5, MT = 6, mx0 = -MO, mx1 = MW + MO, mz0 = -MO, mz1 = MH + MO, mpos = [], mv = [], mq;
    mq = [[mx0, mz0, mx1, mz0], [mx1, mz0, mx1, mz1], [mx1, mz1, mx0, mz1], [mx0, mz1, mx0, mz0]];
    mq.forEach(function (e) {
      var b = mpos.length / 3;
      mpos.push(e[0], -1, e[1], e[2], -1, e[3], e[2], MT, e[3], e[0], MT, e[1]);
      mv.push(1, 1, 0, 0);
      mpos._i = (mpos._i || []); mpos._i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mpos, 3));
    mg.setAttribute('aA', new THREE.Float32BufferAttribute(mv, 1));
    mg.setIndex(mpos._i);
    var mm = new THREE.Mesh(mg, new THREE.ShaderMaterial({
      uniforms: { uFogColor: R.uniforms.uFogColor },
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uFogColor; varying float vA; void main(){ float a = smoothstep(0.0, 1.0, vA); gl_FragColor = vec4(uFogColor, a * 0.92); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    }));
    mm.name = 'edge_mist'; mm.frustumCulled = false; mm.raycast = function () {}; mm.renderOrder = 15; mm.matrixAutoUpdate = false;
    group.add(mm);
    function mistGate() { var q = G.Quality && G.Quality.tiers ? G.Quality.tiers[G.Quality.level()] : null; mm.visible = !q || G.Quality.level() <= 1; }
    mistGate(); if (G.Events) G.Events.on('quality:changed', mistGate);
    G.Scenery.group.add(group); DX.group = group; DX.stats = { counts: cnt, draws: 7 };
  }
  DX.build = build;
})();
