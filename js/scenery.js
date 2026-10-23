/* Togie Valley - scenery.js (Stage 10.5 Part 3): everything around/inside the bigger map that is pure decoration.
 * Game.Scenery.build() once (after Town.build): scenery ring (hills + water skirt + treeline beyond the map), grove / orchard / meadow
 * decor from Game.SceneryLayout, bridge rails, static props, reeds + lily pads. Also sets Render.rig.bounds while outdoors.
 * Depends on THREE, Render, Models, World, Decor (instanced/layout), Props, WorldMap, SceneryLayout.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.Decor || !G.Props || !G.WorldMap || !G.SceneryLayout) { console.error('[scenery] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, D = G.Decor, Props = G.Props, WM = G.WorldMap, SL = G.SceneryLayout;
  var S = { group: null, stats: null, MARGIN: 3, RING: 72 };
  var MW = WM.W, MH = WM.H;

  function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  /* ------------------------------------------------------------ prototypes (cached colored geometries) */
  var P = Mo.part, M = Mo.mergeParts, protos = {};
  function box(w, h, d, c, x, y, z, ry) { return P(new THREE.BoxGeometry(w, h, d), c, [x, y, z], [0, ry || 0, 0]); }
  function cyl(rt, rb, h, c, x, y, z, seg, rot) { return P(new THREE.CylinderGeometry(rt, rb, h, seg || 8), c, [x, y, z], rot || [0, 0, 0]); }
  function ico(r, det, c, x, y, z, sy) { return P(new THREE.IcosahedronGeometry(r, det), c, [x, y, z], [0, 0, 0], [1, sy || 1, 1]); }
  var BUILD = {
    round: function () { return [cyl(0.12, 0.17, 0.7, 0x8c5a34, 0, 0.35, 0, 6), ico(0.62, 1, 0x7fcf7a, 0, 1.2, 0, 0.9), ico(0.4, 0, 0x5fb86a, 0.3, 1.62, 0.1, 0.9), ico(0.36, 0, 0x7fcf7a, -0.3, 1.5, -0.15, 0.9)]; },
    pine: function () {
      return [cyl(0.1, 0.15, 0.5, 0x8c5a34, 0, 0.25, 0, 6), P(new THREE.ConeGeometry(0.66, 0.9, 8), 0x4f9d6a, [0, 0.85, 0]),
        P(new THREE.ConeGeometry(0.52, 0.8, 8), 0x5fb078, [0, 1.4, 0]), P(new THREE.ConeGeometry(0.36, 0.7, 8), 0x6dc088, [0, 1.9, 0])];
    },
    lbush: function () { return [ico(0.4, 1, 0x5fb86a, 0, 0.3, 0, 0.8), ico(0.28, 0, 0x7fcf7a, 0.3, 0.22, 0.1, 0.8), ico(0.26, 0, 0x7fcf7a, -0.28, 0.2, -0.08, 0.8)]; },
    wild: function () {
      var cs = [0xff9bb3, 0xffd166, 0xfff1d0, 0xb9a6ff, 0xff9bb3], L = [P(new THREE.ConeGeometry(0.2, 0.16, 5), 0x6fb35a, [0, 0.08, 0])], i, a;
      for (i = 0; i < 5; i++) { a = i * 1.257 + 0.4; L.push(P(new THREE.OctahedronGeometry(0.075, 0), cs[i], [Math.cos(a) * 0.22, 0.17 + (i % 2) * 0.05, Math.sin(a) * 0.22])); }
      return L;
    },
    rock2: function () { return [ico(0.36, 0, 0xa9aeb5, 0, 0.18, 0, 0.7), ico(0.22, 0, 0xc4c8cd, 0.32, 0.1, 0.12, 0.7)]; },
    table: function () { return [box(1.1, 0.08, 0.7, 0xc98b4f, 0, 0.66, 0), box(0.08, 0.62, 0.08, 0x8c5a34, -0.46, 0.31, -0.26), box(0.08, 0.62, 0.08, 0x8c5a34, 0.46, 0.31, -0.26),
      box(0.08, 0.62, 0.08, 0x8c5a34, -0.46, 0.31, 0.26), box(0.08, 0.62, 0.08, 0x8c5a34, 0.46, 0.31, 0.26), box(0.3, 0.1, 0.3, 0xff9bb3, 0.1, 0.75, 0)]; },
    log: function () { return [cyl(0.17, 0.17, 1.0, 0xb97f4a, 0, 0.17, 0, 8, [0, 0, Math.PI / 2]), cyl(0.12, 0.12, 1.02, 0xe0b987, 0, 0.17, 0, 6, [0, 0, Math.PI / 2])]; },
    hay: function () { return [cyl(0.38, 0.38, 0.5, 0xe6c35c, 0, 0.25, 0, 10), cyl(0.39, 0.39, 0.06, 0xc9a23f, 0, 0.15, 0, 10), cyl(0.39, 0.39, 0.06, 0xc9a23f, 0, 0.35, 0, 10)]; },
    hive: function () { return [box(0.12, 0.25, 0.12, 0x8c5a34, -0.2, 0.12, -0.2), box(0.12, 0.25, 0.12, 0x8c5a34, 0.2, 0.12, 0.2), box(0.5, 0.26, 0.5, 0xfff1d0, 0, 0.38, 0), box(0.5, 0.22, 0.5, 0xffd166, 0, 0.62, 0), box(0.62, 0.07, 0.62, 0xe8715d, 0, 0.78, 0)]; },
    crate: function () { return [box(0.6, 0.5, 0.6, 0xc98b4f, 0, 0.25, 0), box(0.63, 0.08, 0.63, 0x8c5a34, 0, 0.1, 0), box(0.63, 0.08, 0.63, 0x8c5a34, 0, 0.42, 0)]; },
    firepit: function () {
      var L = [cyl(0.3, 0.3, 0.06, 0x3b3037, 0, 0.03, 0, 10)], i, a;
      for (i = 0; i < 8; i++) { a = i * 0.785; L.push(ico(0.13, 0, i % 2 ? 0xa9aeb5 : 0xc4c8cd, Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4, 0.8)); }
      L.push(cyl(0.05, 0.05, 0.6, 0x8c5a34, 0, 0.12, 0, 6, [0, 0, 1.2]), cyl(0.05, 0.05, 0.6, 0x8c5a34, 0, 0.14, 0, 6, [0, 0, -0.5]));
      return L;
    },
    woodpile: function () {
      var L = [], i, j;
      for (j = 0; j < 3; j++) for (i = 0; i < 3 - j; i++) L.push(cyl(0.11, 0.11, 0.9, (i + j) % 2 ? 0xb97f4a : 0xa56e3e, -0.22 + i * 0.22 + j * 0.11, 0.11 + j * 0.19, 0, 7, [Math.PI / 2, 0, 0]));
      return L;
    },
    stump: function () { return [cyl(0.22, 0.27, 0.3, 0xb97f4a, 0, 0.15, 0, 8), cyl(0.2, 0.2, 0.03, 0xe0b987, 0, 0.3, 0, 8)]; }
  };
  function proto(name) {
    if (protos[name]) return protos[name];
    if (BUILD[name]) return (protos[name] = M(BUILD[name]()));
    return (protos[name] = Props.geometry(name));   // lamp, bench, barrel, sign
  }


  /* ------------------------------------------------------------ Stage 10.7 tree species
   * Each species is one merged geometry with attribute aTree = (canopy tint mask, trunk-shift weight, fruit mask) so Decor's tree shader
   * can apply per-instance canopy tint, trunk height shift (trunk top + canopy move up/down), seasonal canopy colour and fruit hue.
   * Authored at the nominal height in SceneryLayout.SPECIES (uniform instance scale only). */
  function treeGeo(trunkTop, groups) {
    var pos = [], nor = [], col = [], at = [], kinds = { trunk: 0, wood: 1, canopy: 2, fruit: 3 }, k, g, i, y;
    for (k in groups) {
      if (!groups[k].length) continue;
      g = M(groups[k]);
      var pa = g.attributes.position, na = g.attributes.normal, ca = g.attributes.color;
      for (i = 0; i < pa.count; i++) {
        y = pa.getY(i);
        pos.push(pa.getX(i), y, pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i)); col.push(ca.getX(i), ca.getY(i), ca.getZ(i));
        if (k === 'trunk') at.push(0, Math.max(0, Math.min(1, y / trunkTop)), 0);
        else if (k === 'wood') at.push(0, 1, 0);
        else if (k === 'fruit') at.push(0, 1, 1);
        else at.push(1, 1, 0);
      }
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('aTree', new THREE.Float32BufferAttribute(at, 3));
    R.addSmoothNormals(out); out.computeBoundingSphere();
    return out;
  }
  var BARK = 0x8c5a34, BARK2 = 0x7a4f2e;
  var TREES = {
    oak: function () {   // big multi-lobed crown on a thick trunk with two limbs
      return treeGeo(1.35, {
        trunk: [cyl(0.17, 0.27, 1.35, BARK, 0, 0.675, 0, 7)],
        wood: [cyl(0.06, 0.1, 0.8, BARK2, 0.32, 1.5, 0.05, 5, [0, 0, -0.75]), cyl(0.06, 0.1, 0.8, BARK2, -0.3, 1.55, -0.1, 5, [0, 0, 0.75])],
        canopy: [ico(1.0, 1, 0x6fbf68, 0, 2.15, 0, 0.82), ico(0.78, 1, 0x5fb86a, 0.85, 1.95, 0.35, 0.85), ico(0.8, 1, 0x78c870, -0.8, 2.0, -0.3, 0.85),
          ico(0.7, 1, 0x68bd66, 0.15, 2.1, -0.85, 0.85), ico(0.5, 0, 0x7fcf7a, -0.25, 2.15, 0.85, 0.85), ico(0.62, 0, 0x8bd882, 0.15, 2.75, 0.1, 0.9), ico(0.45, 0, 0x58a860, -0.45, 1.65, 0.7, 0.8)]
      });
    },
    pine: function () {  // tiered conifer
      var c = [0x3f8f5f, 0x4a9a66, 0x56a672, 0x62b27e, 0x6dc088, 0x78cc92], r = [1.0, 0.86, 0.72, 0.58, 0.42, 0.22], h = [0.8, 0.78, 0.75, 0.72, 0.68, 0.6], y = [1.15, 1.55, 1.95, 2.35, 2.75, 3.05], L = [], i;
      for (i = 0; i < 6; i++) L.push(P(new THREE.ConeGeometry(r[i], h[i], 8), c[i], [0, y[i], 0], [0, i * 0.5, 0]));
      return treeGeo(0.9, { trunk: [cyl(0.1, 0.17, 0.95, BARK, 0, 0.475, 0, 6)], canopy: L });
    },
    birch: function () { // slender, marked white trunk
      var T = [cyl(0.075, 0.115, 2.1, 0xf1ede2, 0, 1.05, 0, 6)], i, ys = [0.35, 0.8, 1.2, 1.65];
      for (i = 0; i < ys.length; i++) T.push(cyl(0.085, 0.12 - i * 0.012, 0.05, 0x4a3f48, 0, ys[i], 0, 6));
      T.push(box(0.05, 0.16, 0.03, 0x4a3f48, 0.08, 0.55, 0.05), box(0.05, 0.12, 0.03, 0x4a3f48, -0.07, 1.0, -0.05, 0.6), box(0.05, 0.14, 0.03, 0x4a3f48, 0.06, 1.45, -0.04, 1.2), box(0.05, 0.1, 0.03, 0x4a3f48, -0.06, 1.85, 0.05, 2.0));
      return treeGeo(2.1, { trunk: T, canopy: [ico(0.55, 1, 0xb5df6f, 0, 2.5, 0, 1.15), ico(0.4, 0, 0xcdeb85, 0.3, 2.95, 0.05, 1.1), ico(0.38, 0, 0xa8d86b, -0.3, 2.8, -0.1, 1.1), ico(0.34, 0, 0xc5e67d, 0.05, 3.15, 0.05, 1), ico(0.4, 0, 0xb0dc70, 0, 2.2, 0.3, 1)] });
    },
    fruit: function () { // round, dense, short trunk, colored fruits
      var F = [], i, a, rr, fy;
      for (i = 0; i < 12; i++) { a = i * 2.4; rr = 0.9 + ((i * 7) % 3) * 0.12; fy = 1.45 + (i % 4) * 0.2; F.push(ico(0.1, 0, i % 3 ? 0xe8453c : 0xf05a4a, Math.cos(a) * rr, fy, Math.sin(a) * rr)); }
      return treeGeo(1.0, {
        trunk: [cyl(0.19, 0.28, 1.0, BARK, 0, 0.5, 0, 7)],
        wood: [cyl(0.07, 0.11, 0.6, BARK2, 0.2, 1.15, 0, 5, [0, 0, -0.6])],
        canopy: [ico(0.95, 1, 0x6fc46f, 0, 1.75, 0, 0.88), ico(0.7, 1, 0x5fb86a, 0.7, 1.6, 0.3, 0.9), ico(0.7, 1, 0x78cc74, -0.65, 1.65, -0.3, 0.9), ico(0.6, 0, 0x68be68, 0.1, 2.25, -0.2, 0.9), ico(0.5, 0, 0x7fcf7a, -0.1, 1.55, 0.7, 0.9)],
        fruit: F
      });
    },
    willow: function () { // low dome with hanging curtain strands
      var C = [ico(1.1, 1, 0x9fd36a, 0, 2.3, 0, 0.62), ico(0.8, 1, 0xa9db72, 0.7, 2.05, 0.2, 0.6), ico(0.8, 1, 0x95cc66, -0.7, 2.1, -0.3, 0.6)], i, a, rr, len;
      for (i = 0; i < 14; i++) {
        a = i * 0.449; rr = 0.95 + ((i * 5) % 3) * 0.17; len = 1.1 + ((i * 7) % 4) * 0.18;
        C.push(P(new THREE.ConeGeometry(0.17, len, 5), i % 2 ? 0xb6e07a : 0xa0d070, [Math.cos(a) * rr, 2.2 - len / 2, Math.sin(a) * rr], [Math.PI, 0, 0]));
      }
      return treeGeo(1.1, {
        trunk: [cyl(0.2, 0.3, 1.1, BARK2, 0, 0.55, 0, 7)],
        wood: [cyl(0.1, 0.16, 0.9, BARK2, 0.2, 1.4, 0, 6, [0, 0, -0.45]), cyl(0.09, 0.15, 0.9, BARK2, -0.2, 1.45, 0.05, 6, [0, 0, 0.4])],
        canopy: C
      });
    }
  };
  var TREE_SEASONAL = { oak: 0.9, pine: 0.25, birch: 0.9, fruit: 0.8, willow: 0.6 };
  var bloom = { value: 0 }, bloomOn = false;   // spring blossom on fruit trees (smoothed in a frame callback)

  /* ------------------------------------------------------------ static merger */
  function Merger() { this.p = []; this.n = []; this.c = []; }
  Merger.prototype.add = function (geo, x, y, z, ry, s) {
    var pa = geo.attributes.position, na = geo.attributes.normal, ca = geo.attributes.color, cs = Math.cos(ry || 0), sn = Math.sin(ry || 0), k = s || 1, i, px, py, pz, nx, nz;
    for (i = 0; i < pa.count; i++) {
      px = pa.getX(i) * k; py = pa.getY(i) * k; pz = pa.getZ(i) * k;
      this.p.push(px * cs + pz * sn + x, py + y, -px * sn + pz * cs + z);
      nx = na.getX(i); nz = na.getZ(i);
      this.n.push(nx * cs + nz * sn, na.getY(i), -nx * sn + nz * cs);
      this.c.push(ca.getX(i), ca.getY(i), ca.getZ(i));
    }
  };
  Merger.prototype.addBox = function (w, h, d, c, x, y, z, ry) { var g = M([box(w, h, d, c, 0, 0, 0)]); this.add(g, x, y, z, ry || 0, 1); g.dispose(); };
  Merger.prototype.geometry = function () {
    if (!this.p.length) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    R.addSmoothNormals(g); g.computeBoundingSphere();
    return g;
  };
  function staticMesh(g, mat, name, outline) {
    var m = new THREE.Mesh(g, mat);
    m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); m.raycast = function () {};
    if (outline) R.addOutline(m, false);
    return m;
  }

  /* ------------------------------------------------------------ scenery ring (hills, skirt, treeline) */
  function dRect(x, z) { var dx = Math.max(-x, 0, x - MW), dz = Math.max(-z, 0, z - MH); return Math.sqrt(dx * dx + dz * dz); }
  function vn(x, z) { return SL.vnoise(x, z); }
  function hillH(x, z) {
    var d = dRect(x, z), n = vn(x * 0.07, z * 0.07) * 0.7 + vn(x * 0.17 + 9, z * 0.17) * 0.3;
    return sm(6, 30, d) * 8 * (0.25 + 0.75 * n) + sm(3, 12, d) * 0.5 * (vn(x * 0.3, z * 0.3) - 0.5);
  }
  function rowAt(tx, tz) { tx = Math.max(0, Math.min(MW - 1, tx)); tz = Math.max(0, Math.min(MH - 1, tz)); return WM.rows[tz].charAt(tx); }
  var cG = new THREE.Color(0x9bd36a), cH = new THREE.Color(0x68b86c), cF = new THREE.Color(0x86bfa0), _c = new THREE.Color(), _e = new THREE.Color();
  function ringColor(x, z, h, edgeHex) {
    var d = dRect(x, z);
    _c.copy(cG).lerp(cH, sm(0, 5, h)).lerp(cF, sm(10, 60, d) * 0.45);
    var j = (hash(Math.floor(x * 2), Math.floor(z * 2)) - 0.5) * 0.05; _c.r += j; _c.g += j; _c.b += j;
    if (edgeHex) { _e.setHex(edgeHex); _c.lerp(_e, 1 - sm(0.4, 3.2, d)); }   // blend the border tile colour outward, then grass
    return _c;
  }
  function buildRing(grp) {
    var pos = [], nor = [], col = [], DS = [0, 3, 6, 9, 13, 18, 24, 31, 39, 48, 58, RING()];
    function RING() { return S.RING; }
    function vtx(x, z, edgeHex) { var h = hillH(x, z); return { x: x, y: h, z: z, c: ringColor(x, z, h, edgeHex).clone() }; }
    function tri(a, b, c) {
      var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (ny < 0) { var t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
      [a, b, c].forEach(function (v) { pos.push(v.x, v.y, v.z); nor.push(nx, ny, nz); col.push(v.c.r, v.c.g, v.c.b); });
    }
    function quad(f, u0, u1, v0, v1, edgeHex) {   // f(u,v) -> [x,z]
      var p00 = f(u0, v0), p01 = f(u0, v1), p11 = f(u1, v1), p10 = f(u1, v0);
      var a = vtx(p00[0], p00[1], edgeHex), b = vtx(p01[0], p01[1], edgeHex), c = vtx(p11[0], p11[1], edgeHex), d = vtx(p10[0], p10[1], edgeHex);
      tri(a, b, c); tri(a, c, d);
    }
    function edgeOf(ch) { return ch === ',' ? 0xf5e6ae : (ch === '=' || ch === 'o') ? 0xe6c48f : 0; }
    var sides = [
      { n: MW, f: function (u, v) { return [u, -v]; }, at: function (i) { return rowAt(i, 0); } },
      { n: MW, f: function (u, v) { return [u, MH + v]; }, at: function (i) { return rowAt(i, MH - 1); } },
      { n: MH, f: function (u, v) { return [-v, u]; }, at: function (i) { return rowAt(0, i); } },
      { n: MH, f: function (u, v) { return [MW + v, u]; }, at: function (i) { return rowAt(MW - 1, i); } }
    ], i, k;
    sides.forEach(function (sd) {
      for (i = 0; i < sd.n; i++) {
        var ch = sd.at(i); if (ch === '~') continue;           // lake side: the water skirt shows instead
        for (k = 0; k < DS.length - 1; k++) quad(sd.f, i, i + 1, DS[k], DS[k + 1], edgeOf(ch));
      }
    });
    var corners = [[0, 0, -1, -1], [MW - 1, 0, 1, -1], [0, MH - 1, -1, 1], [MW - 1, MH - 1, 1, 1]], R2 = S.RING, st = 6, a, b;
    corners.forEach(function (cn) {
      if (rowAt(cn[0], cn[1]) === '~') return;
      var ox = cn[2] > 0 ? MW : 0, oz = cn[3] > 0 ? MH : 0;
      for (a = 0; a < R2; a += st) for (b = 0; b < R2; b += st) {
        var x0 = ox + cn[2] * a, x1 = ox + cn[2] * (a + st), z0 = oz + cn[3] * b, z1 = oz + cn[3] * (b + st);
        var A = vtx(x0, z0), B = vtx(x0, z1), C2 = vtx(x1, z1), D2 = vtx(x1, z0);
        tri(A, B, C2); tri(A, C2, D2);
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    var m = staticMesh(g, Mo.material('ground'), 'scenery_ring', false);
    grp.add(m);

    // water skirt: four flat rects around the map at lake level; the lake shader reads colour.r = 1 (deep)
    var wp = [], wc = [], Q = 400, rects = [[-Q, -Q, 0, MH + Q], [MW, -Q, MW + Q, MH + Q], [0, -Q, MW, 0], [0, MH, MW, MH + Q]];
    rects.forEach(function (r) {
      var q = [r[0], r[1], r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[3], r[2], r[1]];
      for (var j = 0; j < 12; j += 2) { wp.push(q[j], -0.13, q[j + 1]); wc.push(0.7, 0, 0); }   // 0.7 = mid-deep: continues the lake colour instead of a hard abyss seam (Stage 14B)
    });
    var wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    wg.computeBoundingSphere();
    if (W.waterMat) grp.add(staticMesh(wg, W.waterMat, 'scenery_skirt', false));

    // far treeline (Stage 14B): scenery_far.js builds it with the near-tree toon shader, palette and species (see there)
    var far = G.SceneryFar ? G.SceneryFar.build({ SL: SL, MW: MW, MH: MH, dRect: dRect, hillH: hillH, rowAt: rowAt, vn: vn, sm: sm, treeGeo: treeGeo, P: P, M: M, cyl: cyl, ico: ico }) : { count: 0, tris: 0 };
    return { ring: pos.length / 9, far: far.count, farTris: far.tris };
  }

  /* ------------------------------------------------------------ build */
  function reedGeo() {
    var L = [], i;
    for (i = 0; i < 4; i++) { var a = i * 1.7, x = Math.cos(a) * 0.1, z = Math.sin(a) * 0.1, h = 0.55 + (i % 3) * 0.12; L.push(cyl(0.015, 0.02, h, i % 2 ? 0x6f9b4a : 0x8fb85a, x, h / 2 - 0.1, z, 4)); }
    L.push(cyl(0.035, 0.035, 0.16, 0x8c5a34, 0.02, 0.6, 0.0, 5));
    return M(L);
  }
  function lilyGeo() { return M([cyl(0.24, 0.24, 0.02, 0x5fb86a, 0, 0, 0, 8), P(new THREE.OctahedronGeometry(0.07, 0), 0xff9bb3, [0.04, 0.05, 0.02])]); }

  S.build = function () {
    if (S.group) return S.group;
    var grp = S.group = new THREE.Group(); grp.name = 'scenery';
    R.scene.add(grp);
    var info = buildRing(grp), blocked = {}, lay, i;
    if (D.layout) { D.layout.solids.forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; }); (D.layout.bushTiles || []).forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; }); }   // bush tiles stay occupied for placement only, never in W.setBlocked
    if (D.layout) SL.styleScatter(D.layout.trees, WM.rows);   // Decor's scatter trees get species / size class / tint here (shared with tools/check.js)
    lay = SL.build({ rows: WM.rows, features: WM.features, seed: 777, avoid: D.layout ? D.layout.trees : [], blocked: function (x, z) { return !!blocked[x + ',' + z]; } });
    lay.solids.forEach(function (c) { W.setBlocked(c[0], c[1], true); });

    // near trees: one instanced fill + outline pair per species (5 pairs)
    var bySp = { oak: [], pine: [], birch: [], fruit: [], willow: [] }, all = (D.layout ? D.layout.trees : []).concat(lay.trees), sp;
    all.forEach(function (t) { (bySp[t.k] || bySp.oak).push(t); });
    for (sp in bySp) {
      if (!bySp[sp].length) continue;
      if (!protos[sp]) protos[sp] = TREES[sp]();
      D.instanced(protos[sp], bySp[sp], 0.5, false, { tree: true, fade: 0.8, seasonal: TREE_SEASONAL[sp], bloom: sp === 'fruit' ? bloom : undefined, chunk: 45, group: 'trees' });   // Stage 14B: spatial chunks
    }
    G.Loop.onFrame(function (dt) {
      bloomOn = R.getSeason && R.getSeason() === 'spring';
      bloom.value += ((bloomOn ? 0.85 : 0) - bloom.value) * (1 - Math.exp(-2 * dt));
    }, 12);
    D.instanced(proto('lbush'), lay.bushes, 0.6, false, { fade: 0.25, chunk: 45, group: 'bushes' });
    D.instanced(proto('wild'), lay.flowers, 1.4, true, { chunk: 24, group: 'flowers' });

    // static outlined props: rocks, props, bridge rails
    var st = new Merger(), fl = new Merger();
    lay.rocks.forEach(function (r) { st.add(proto('rock2'), r.x, 0, r.z, r.ry, r.s); });
    lay.props.forEach(function (p) {
      var onPier = W.tileType(p.x, p.z) === 'pier';
      st.add(proto(p.name), p.x, onPier ? 0.1 : 0, p.z, p.ry, p.s);
    });
    var b = WM.features.bridge, x0 = b[0] - 1, x1 = b[1] + 2, len = x1 - x0, DY = 0.1, rz = [18.06, 19.94], k;
    rz.forEach(function (z) {
      st.addBox(len, 0.07, 0.07, 0xc98b4f, (x0 + x1) / 2, DY + 0.58, z);
      st.addBox(len, 0.06, 0.06, 0xc98b4f, (x0 + x1) / 2, DY + 0.3, z);
      for (k = 0; k <= len; k++) st.addBox(0.1, 0.64, 0.1, 0x8c5a34, x0 + Math.min(k, len - 0.08) + 0.04, DY + 0.32, z);
    });
    var sg = st.geometry();
    if (sg) grp.add(staticMesh(sg, Mo.material('prop'), 'scenery_props', true));

    // flat decals without outline: reeds + lily pads
    var rg = reedGeo(), lg = lilyGeo();
    lay.reeds.forEach(function (r) { fl.add(rg, r.x, -0.1, r.z, r.ry, r.s); });
    lay.lilies.forEach(function (l) { fl.add(lg, l.x, -0.105, l.z, l.ry, l.s); });
    var fg = fl.geometry();
    if (fg) grp.add(staticMesh(fg, Mo.material('flat'), 'scenery_flat', false));

    S.layout = lay;
    S.stats = { ringTris: info.ring, farTrees: info.far, farTris: info.farTris, trees: lay.trees.length, bushes: lay.bushes.length, flowers: lay.flowers.length, rocks: lay.rocks.length, props: lay.props.length, reeds: lay.reeds.length, lilies: lay.lilies.length };

    // camera target stays inside the map + margin while outdoors
    function applyBounds(scene) { R.rig.bounds = scene === 'outdoor' ? { x0: -S.MARGIN, x1: MW + S.MARGIN, z0: -S.MARGIN, z1: MH + S.MARGIN } : null; }
    G.Events.on('scene:changed', function (e) { applyBounds(e && e.to); });
    applyBounds('outdoor');
    return grp;
  };

  G.Scenery = S;
})();
