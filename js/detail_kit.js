/* Togie Valley - detail_kit.js (Stage 10.5 Part 4): shared helpers for the detail modules (no scene objects of its own).
 * Game.DetailKit: P/M (Models.part/mergeParts), box/cyl/ico/cone part builders, Merger (static geometry baker), mesh(), hash, noise.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models) { console.error('[detail_kit] missing deps'); return; }
  var R = G.Render, Mo = G.Models, P = Mo.part, K = { P: P, M: Mo.mergeParts };
  K.box = function (w, h, d, c, x, y, z, r, s) { return P(new THREE.BoxGeometry(w, h, d), c, [x || 0, y || 0, z || 0], r, s); };
  K.cyl = function (rt, rb, h, c, x, y, z, seg, r, s) { return P(new THREE.CylinderGeometry(rt, rb, h, seg || 8), c, [x || 0, y || 0, z || 0], r, s); };
  K.ico = function (rad, det, c, x, y, z, s) { return P(new THREE.IcosahedronGeometry(rad, det), c, [x || 0, y || 0, z || 0], null, s); };
  K.cone = function (rad, h, c, x, y, z, seg, r) { return P(new THREE.ConeGeometry(rad, h, seg || 6), c, [x || 0, y || 0, z || 0], r); };
  K.hash = function (a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  K.noise = function (x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz), h = K.hash;
    var a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  var _col = new THREE.Color();
  /* Merger: bake geometries (with ry + uniform scale) or raw quads into one vertex-colored geometry */
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
  Merger.prototype.parts = function (parts, x, y, z, ry, s) { var g = K.M(parts); this.add(g, x, y, z, ry, s); g.dispose(); };
  Merger.prototype.quad = function (x0, z0, x1, z1, y, hex) {   // flat up-facing rect
    _col.set(hex);
    var q = [x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0], i;
    for (i = 0; i < 12; i += 2) { this.p.push(q[i], y, q[i + 1]); this.n.push(0, 1, 0); this.c.push(_col.r, _col.g, _col.b); }
  };
  Merger.prototype.geometry = function () {
    if (!this.p.length) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    R.addSmoothNormals(g); g.computeBoundingSphere();
    return g;
  };
  K.Merger = Merger;
  K.mesh = function (g, mat, name, outline, thin) {
    var m = new THREE.Mesh(g, mat);
    m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); m.raycast = function () {};
    if (outline) R.addOutline(m, !!thin);
    return m;
  };
  G.DetailKit = K;
})();
