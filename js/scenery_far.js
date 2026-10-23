/* Togie Valley - scenery_far.js (Stage 14B): the far treeline of the scenery ring, restyled to match the near props.
 * Game.SceneryFar.build(ctx) is called by Scenery's buildRing (ctx = helpers from scenery.js). Returns {count, tris}. setDensity(d) thins it per tier.
 * Look: the same Decor tree shader as the near trees (3 toon bands, shared light/ambient/fog/season uniforms, seasonal canopy recolor), the same palette
 * (oak greens, pine greens, birch yellow-greens), three low-poly species (round, pine, poplar) with per-instance tint that drifts toward a cool haze with
 * distance from the map, darker underside (vertex colors) instead of flat colour, and sizes capped at 2.3-3.6 units (near large trees are 2.8-3.5, hero 1.0).
 * Only trees within OUTLINE_D of the map get the ink hull (outline mesh = same instance buffer with a smaller count: instances are ordered near-first).
 * Budget: ring triangles never rise above the old treeline estimate (count x 105 tris); the outline band shrinks until that holds. Draw calls 6 (was 2).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Decor) { console.error('[scenery_far] missing deps'); return; }
  var D = G.Decor, F = { meshes: [], count: 0, tris: 0, density: 1 };
  var OUTLINE_D = 6.5, OLD_TRIS_PER_TREE = 105, NOMINAL = { round: 2.5, pine: 2.8, poplar: 3.0 };
  var BARK = 0x8c5a34, BARK2 = 0x7a4f2e;
  var species = [], pendingDensity = 1;

  function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function build(ctx) {
    var SL = ctx.SL, P = ctx.P, M = ctx.M, MW = ctx.MW, MH = ctx.MH;
    function trunk(rt, rb, h, c, x, y, z) { return P(new THREE.CylinderGeometry(rt, rb, h, 5, 1, true), c, [x, y, z]); }
    function ico(r, c, x, y, z, sy) { return P(new THREE.IcosahedronGeometry(r, 0), c, [x, y, z], [0, 0, 0], [1, sy || 1, 1]); }
    function cone(r, h, c, y, ry) { return P(new THREE.ConeGeometry(r, h, 6), c, [0, y, 0], [0, ry || 0, 0]); }
    function dark(g) {   // darker underside / rim from vertex colours: no extra cost, avoids the flat look
      var pa = g.attributes.position, ca = g.attributes.color, i, y0 = 1e9, y1 = -1e9, f, y;
      for (i = 0; i < pa.count; i++) { y = pa.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
      for (i = 0; i < pa.count; i++) {
        f = 0.8 + 0.2 * sm(0.2, 0.9, (pa.getY(i) - y0) / Math.max(0.01, y1 - y0));
        ca.setXYZ(i, ca.getX(i) * f, ca.getY(i) * f, ca.getZ(i) * f);
      }
      return g;
    }
    var GEO = {
      round: function () {   // oak palette
        return dark(ctx.treeGeo(0.9, { trunk: [trunk(0.12, 0.2, 0.9, BARK, 0, 0.45, 0)],
          canopy: [ico(0.95, 0x6fbf68, 0, 1.65, 0, 0.88), ico(0.7, 0x5fb86a, 0.55, 1.45, 0.2, 0.9), ico(0.62, 0x78c870, -0.5, 1.5, -0.25, 0.9)] }));
      },
      pine: function () {    // pine palette, 3 tiers of 6 sides
        return dark(ctx.treeGeo(0.7, { trunk: [trunk(0.08, 0.14, 0.7, BARK, 0, 0.35, 0)],
          canopy: [cone(0.9, 1.0, 0x4a9a66, 1.2), cone(0.7, 0.9, 0x56a672, 1.85, 0.5), cone(0.45, 0.8, 0x62b27e, 2.4, 1)] }));
      },
      poplar: function () {  // birch palette, tall and slim
        return dark(ctx.treeGeo(1.0, { trunk: [trunk(0.07, 0.11, 1.0, 0xf1ede2, 0, 0.5, 0)],
          canopy: [ico(0.55, 0x9fd36a, 0, 1.9, 0, 1.7), ico(0.4, 0xb5df6f, 0.1, 2.6, 0.05, 1.3)] }));
      }
    };
    var SEASONAL = { round: 0.9, pine: 0.25, poplar: 0.9 };

    // placement: same grid / density rules as the old treeline, species + size + rotation + haze tint per tree
    var rr = SL.rng(4242), step = 2.2, gx, gz, x, z, d, p, it, sp, H, k, lists = { round: [], pine: [], poplar: [] };
    for (gz = -50; gz < MH + 50; gz += step) for (gx = -50; gx < MW + 50; gx += step) {
      x = gx + (rr() - 0.5) * 1.6; z = gz + (rr() - 0.5) * 1.6; d = ctx.dRect(x, z);
      if (d < 1.4 || d > 44) continue;
      if (ctx.rowAt(Math.floor(x), Math.floor(z)) === '~') continue;   // lake side: water skirt, no trees
      p = d < 10 ? 0.4 : 0.05;
      if (rr() > p * (0.6 + 0.8 * ctx.vn(x * 0.2, z * 0.2))) continue;
      sp = ctx.vn(x * 0.15 + 5, z * 0.15) < 0.55 ? 'pine' : (rr() < 0.22 ? 'poplar' : 'round');
      H = Math.min(3.6, Math.max(2.3, 2.3 + rr() * 1.1 + sm(0, 30, d) * 0.2));   // capped: never dwarfs the play area
      k = sm(2, 40, d);                                                              // 0 near the map .. 1 far: cool haze
      it = { x: x, y: ctx.hillH(x, z) - 0.05, z: z, ry: rr() * 6.283, s: H / NOMINAL[sp], lx: (rr() - 0.5) * 0.1, lz: (rr() - 0.5) * 0.1, d: d,
        tint: [1 - 0.16 * k + (rr() - 0.5) * 0.1, 1 - 0.03 * k + (rr() - 0.5) * 0.08, 1 + 0.07 * k + (rr() - 0.5) * 0.06, 0], sp: sp };
      lists[sp].push(it);
    }

    // order each species: near band (shuffled) then far band (shuffled); thinning by density keeps a uniform prefix of each band
    var total = 0, tris = 0, nOutlined = 0, name, lst, geo, near, far, ms, i, j, t, a;
    var shuf = SL.rng(99);
    function shuffle(arr) { for (j = arr.length - 1; j > 0; j--) { a = Math.floor(shuf() * (j + 1)); t = arr[j]; arr[j] = arr[a]; arr[a] = t; } return arr; }
    var oldTris = 0, newFill = 0;
    for (name in lists) { total += lists[name].length; }
    oldTris = total * OLD_TRIS_PER_TREE;
    var outD = OUTLINE_D;
    function trisFor(od) {   // estimated triangles for a given outline band
      var s = 0, nm, l, g, n, no, q;
      for (nm in lists) {
        l = lists[nm]; g = GEO.__tris[nm]; no = 0;
        for (q = 0; q < l.length; q++) if (l[q].d < od) no++;
        s += g * (l.length + no);
      }
      return s;
    }
    GEO.__tris = {};
    for (name in lists) { geo = GEO[name](); GEO.__tris[name] = geo.attributes.position.count / 3; species.push({ name: name, geo: geo }); }
    while (outD > 0 && trisFor(outD) > oldTris) outD -= 0.5;   // budget: ring triangles must not rise
    if (outD < 0) outD = 0;

    species.forEach(function (s) {
      lst = lists[s.name]; if (!lst.length) return;
      near = []; far = [];
      for (i = 0; i < lst.length; i++) (lst[i].d < outD ? near : far).push(lst[i]);
      shuffle(near); shuffle(far);
      var all = near.concat(far);
      ms = D.instanced(s.geo, all, 0.35, outD <= 0, { tree: true, seasonal: SEASONAL[s.name] });
      s.fill = ms[0]; s.out = ms[1] || null; s.near = near; s.far = far; s.all = all;
      F.meshes.push.apply(F.meshes, ms);
      s.fill.name = 'far_' + s.name; if (s.out) s.out.name = 'outline';
      if (s.out) s.out.count = near.length;
      tris += s.geo.attributes.position.count / 3 * (all.length + near.length);
      nOutlined += near.length;
    });
    F.count = total; F.tris = Math.round(tris); F.outlined = nOutlined; F.oldTris = oldTris; F.outlineBand = outD;
    if (pendingDensity < 1) F.setDensity(pendingDensity);
    return { count: total, tris: F.tris };
  }

  var M4 = null, Q = null, E = null, V = null, S3 = null;
  /* Thin the treeline for low tiers: rewrites the instance buffers (matrices + tint) with a uniform prefix of each band. */
  F.setDensity = function (d) {
    pendingDensity = d = Math.max(0, Math.min(1, d)); F.density = d;
    if (!species.length) return;
    if (!M4) { M4 = new THREE.Matrix4(); Q = new THREE.Quaternion(); E = new THREE.Euler(0, 0, 0, 'YXZ'); V = new THREE.Vector3(); S3 = new THREE.Vector3(); }
    var tris = 0, shown = 0;
    species.forEach(function (s) {
      if (!s.fill) return;
      var nn = Math.ceil(s.near.length * d), nf = Math.ceil(s.far.length * d), n = 0, i, o, list = [], ta = s.geo.attributes.iTint;
      for (i = 0; i < nn; i++) list.push(s.near[i]);
      for (i = 0; i < nf; i++) list.push(s.far[i]);
      for (i = 0; i < list.length; i++) {
        o = list[i];
        M4.compose(V.set(o.x, o.y, o.z), Q.setFromEuler(E.set(o.lx || 0, o.ry || 0, o.lz || 0)), S3.setScalar(o.s || 1));
        s.fill.setMatrixAt(i, M4);
        ta.setXYZW(i, o.tint[0], o.tint[1], o.tint[2], o.tint[3]);
        n++;
      }
      s.fill.count = n; s.fill.instanceMatrix.needsUpdate = true; ta.needsUpdate = true;
      if (s.out) { s.out.count = nn; s.out.visible = F.outlinesOn && d >= 0.5 && nn > 0; }
      tris += s.geo.attributes.position.count / 3 * (n + (s.out && s.out.visible ? nn : 0)); shown += n;
    });
    F.tris = Math.round(tris); F.shown = shown;
  };
  F.outlinesOn = true;
  F.setOutlines = function (on) {   // draw-call trim from perf.js
    F.outlinesOn = !!on;
    species.forEach(function (s) { if (s.out) s.out.visible = F.outlinesOn && F.density >= 0.5 && s.out.count > 0; });
  };
  F.build = build;
  F.stats = function () { return { trees: F.count, shown: F.shown === undefined ? F.count : F.shown, tris: F.tris, oldTris: F.oldTris, outlined: F.outlined, outlineBand: F.outlineBand, density: F.density }; };
  G.SceneryFar = F;
})();
