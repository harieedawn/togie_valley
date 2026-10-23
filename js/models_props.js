/* Togie Valley - models_props.js (Stage 2B)
 * Game.Props: chunky prop builders. Depends on THREE, Game.Render, Game.Models.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models) { console.error('[props] missing deps'); return; }

  var P = {}, cache = {};
  var C = { wood: 0xc98b4f, dark: 0x8c5a34, roof: 0xe8715d, cream: 0xfff1d0, leaf: 0x7fcf7a, leaf2: 0x5fb86a,
    rock: 0xa9aeb5, rock2: 0xc4c8cd, pink: 0xff9bb3, yellow: 0xffd166, brick: 0xb96a52, iron: 0x5a4a52, grass: 0x6fb35a };

  /* ---- shared shape helpers: each pushes a baked, colored part into list L ---- */
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
  function add(L, geo, color, x, y, z, ry, sx, sy, sz) {
    E.set(0, ry || 0, 0);
    M4.compose(V.set(x || 0, y || 0, z || 0), Q.setFromEuler(E), S.set(sx || 1, sy || 1, sz || sx || 1));
    geo.applyMatrix4(M4);
    L.push({ geo: geo.toNonIndexed(), color: new THREE.Color(color) });
  }
  function box(L, w, h, d, c, x, y, z, ry) { add(L, new THREE.BoxGeometry(w, h, d), c, x, y, z, ry); }
  function cyl(L, rt, rb, h, c, x, y, z, seg) { add(L, new THREE.CylinderGeometry(rt, rb, h, seg || 10), c, x, y, z); }
  function cone(L, r, h, c, x, y, z, seg) { add(L, new THREE.ConeGeometry(r, h, seg || 10), c, x, y, z); }
  function sph(L, r, c, x, y, z, sy) { add(L, new THREE.SphereGeometry(r, 10, 8), c, x, y, z, 0, 1, sy || 1, 1); }

  function merge(L) {
    var pos = [], nor = [], col = [], i, j, g, p, n;
    for (i = 0; i < L.length; i++) {
      g = L[i].geo; p = g.attributes.position.array; n = g.attributes.normal.array;
      for (j = 0; j < p.length; j++) { pos.push(p[j]); nor.push(n[j]); }
      for (j = 0; j < p.length / 3; j++) col.push(L[i].color.r, L[i].color.g, L[i].color.b);
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    G.Render.addSmoothNormals(out);
    return out;
  }

  /* ---- builders: base at y=0, footprint about 1 tile ---- */
  var B = {
    tree: function (L) {
      cyl(L, 0.14, 0.2, 0.8, C.dark, 0, 0.4, 0, 8);
      sph(L, 0.62, C.leaf, 0, 1.25, 0, 0.9);
      sph(L, 0.42, C.leaf2, 0.3, 1.7, 0.1, 0.9);
      sph(L, 0.36, C.leaf, -0.3, 1.55, -0.15, 0.9);
    },
    bush: function (L) {
      sph(L, 0.4, C.leaf2, 0, 0.3, 0, 0.8);
      sph(L, 0.28, C.leaf, 0.3, 0.22, 0.1, 0.8);
      sph(L, 0.26, C.leaf, -0.28, 0.2, -0.08, 0.8);
    },
    flowers: function (L) {
      var i, a, x, z, cs = [C.pink, C.yellow, C.cream, C.pink, C.yellow];
      cyl(L, 0.42, 0.45, 0.05, C.leaf2, 0, 0.025, 0, 9);
      for (i = 0; i < 5; i++) {
        a = i * 1.257 + 0.4; x = Math.cos(a) * 0.22; z = Math.sin(a) * 0.22;
        cyl(L, 0.02, 0.02, 0.2, C.leaf, x, 0.15, z, 5);
        sph(L, 0.08, cs[i], x, 0.3, z);
      }
    },
    rock: function (L) { sph(L, 0.36, C.rock, 0, 0.2, 0, 0.7); sph(L, 0.22, C.rock2, 0.32, 0.12, 0.12, 0.7); },
    lamp: function (L) {
      cyl(L, 0.08, 0.1, 0.12, C.iron, 0, 0.06, 0, 8);
      cyl(L, 0.05, 0.05, 1.6, C.iron, 0, 0.9, 0, 8);
      box(L, 0.26, 0.28, 0.26, C.cream, 0, 1.78, 0);
      cone(L, 0.26, 0.2, C.roof, 0, 2.02, 0, 4);
    },
    bench: function (L) {
      box(L, 1, 0.08, 0.36, C.wood, 0, 0.4, 0);
      box(L, 1, 0.3, 0.06, C.wood, 0, 0.7, -0.16);
      box(L, 0.08, 0.4, 0.3, C.dark, -0.4, 0.2, 0);
      box(L, 0.08, 0.4, 0.3, C.dark, 0.4, 0.2, 0);
    },
    barrel: function (L) {
      cyl(L, 0.27, 0.27, 0.6, C.wood, 0, 0.3, 0, 12);
      cyl(L, 0.29, 0.29, 0.06, C.dark, 0, 0.15, 0, 12);
      cyl(L, 0.29, 0.29, 0.06, C.dark, 0, 0.45, 0, 12);
    },
    sign: function (L) {
      cyl(L, 0.05, 0.05, 1, C.dark, 0, 0.5, 0, 6);
      box(L, 0.8, 0.4, 0.07, C.cream, 0, 1.05, 0);
      box(L, 0.6, 0.08, 0.08, C.yellow, 0, 1.05, 0.01);
    },
    bin: function (L) {
      box(L, 0.8, 0.5, 0.6, C.wood, 0, 0.25, 0);
      box(L, 0.5, 0.06, 0.06, C.yellow, 0, 0.3, 0.31);   // lid is a hinged mesh in js/world_react.js
    },
    mailbox: function (L) {
      box(L, 0.09, 0.7, 0.09, C.dark, 0, 0.35, 0);
      box(L, 0.32, 0.26, 0.46, C.roof, 0, 0.8, 0);
      box(L, 0.04, 0.2, 0.08, C.yellow, 0.19, 0.9, 0);
    },
    fence: function (L) {
      box(L, 0.1, 0.55, 0.1, C.dark, -0.45, 0.275, 0);
      box(L, 0.1, 0.55, 0.1, C.dark, 0.45, 0.275, 0);
      box(L, 1, 0.08, 0.05, C.wood, 0, 0.22, 0);
      box(L, 1, 0.08, 0.05, C.wood, 0, 0.42, 0);
    },
    farmhouse: function (L) { // door + chimney for a 3x3 house (door at +z face, wall z=1.5 assumed)
      box(L, 0.7, 1.2, 0.1, C.dark, 0, 0.6, 1.52);
      sph(L, 0.05, C.yellow, 0.22, 0.6, 1.6);
      box(L, 0.95, 0.08, 0.35, C.rock2, 0, 0.04, 1.7);
      box(L, 0.4, 0.9, 0.4, C.brick, 0.8, 2.4, -0.4);
      box(L, 0.52, 0.1, 0.52, C.iron, 0.8, 2.9, -0.4);
    }
  };

  /** Merged, vertex-colored geometry for a prop (cached, shared; do not dispose). */
  P.geometry = function (name) {
    if (!B[name]) throw new Error('Unknown prop: ' + name);
    if (!cache[name]) { var L = []; B[name](L); cache[name] = merge(L); }
    return cache[name];
  };

  /** Mesh with toon 'prop' material + ink outline. */
  P.make = function (name) {
    var m = new THREE.Mesh(P.geometry(name), G.Models.material('prop'));
    m.name = 'prop_' + name;
    G.Render.addOutline(m, name === 'fence' || name === 'flowers');
    return m;
  };

  P.names = Object.keys(B);
  G.Props = P;
})();
