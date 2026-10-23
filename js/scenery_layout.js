/* Togie Valley - scenery_layout.js (Stage 10.5 Part 3): pure decor layout for the 90x60 map, no THREE.
 * Browser: Game.SceneryLayout; node: module.exports (tools/check.js uses it for the reachability + emptiness checks).
 * build(o): o = {rows, features, blocked(tx,tz)->bool (solids already placed by Layout.scatter), seed, avoid:[{x,z,s,r?}] (existing trees for spacing)}
 *   -> {trees:[{x,z,ry,s,k:'oak'|'pine'|'birch'|'fruit'|'willow', sz:'sap'|'med'|'large'|'giant', lx,lz (lean), tint:[r,g,b,trunkShift], fruit:[r,g,b], r (canopy radius, tiles)}], bushes, flowers, rocks:[{x,z,ry,s}], reeds, lilies:[{x,z,ry,s}],
 *       props:[{name,x,z,ry,s?}], solids:[[tx,tz]]}
 * Solid things (trees, rocks, solid props) are in `solids`, bushes (passable) in `bushTiles`; flowers/reeds/lilies never block.
 */
(function (root) {
  'use strict';
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function inEllipse(e, x, z, grow) {   // soft-edged ellipse: returns 0..1 (1 = core)
    var dx = (x + 0.5 - e[0]) / e[2], dz = (z + 0.5 - e[1]) / e[3], d = Math.sqrt(dx * dx + dz * dz);
    d *= 1 + (vnoise(x * 0.4 + e[0], z * 0.4 + e[1]) - 0.5) * (grow || 0.35);
    return d >= 1 ? 0 : Math.min(1, (1 - d) * 2.2);
  }

  /* Stage 10.7 trees. HERO = hero height in world units (about 1.0, 1.17 with hat). Each species has a nominal model height h and canopy
   * radius cr (model units); an instance gets scale s = height / h, where height = HERO x a size-class factor:
   * sapling 1.1-1.6, medium 2.2-2.8, large 2.8-3.5, giant 3.8-4.4 (mature trees = medium/large/giant = 2.2-4.4x the hero). */
  var HERO = 1.0;
  var SPECIES = {
    oak:    { h: 3.2, cr: 1.5, tints: [[1, 1, 1], [0.92, 1.06, 0.82], [1.12, 1, 0.78], [0.82, 0.98, 0.92]], shift: [-0.12, 0.3] },
    pine:   { h: 3.3, cr: 0.95, tints: [[1, 1, 1], [0.85, 1, 0.92], [0.9, 1.05, 0.8], [0.78, 0.95, 1]], shift: [-0.1, 0.35] },
    birch:  { h: 3.3, cr: 0.8, tints: [[1, 1, 1], [1.1, 1.04, 0.8], [0.9, 1.05, 0.9], [1.15, 0.98, 0.7]], shift: [-0.25, 0.4] },
    fruit:  { h: 2.6, cr: 1.25, tints: [[1, 1, 1], [0.9, 1.04, 0.9], [1.08, 1, 0.85], [0.85, 1, 1]], shift: [-0.1, 0.2] },
    willow: { h: 3.0, cr: 1.35, tints: [[1, 1, 1], [0.95, 1.05, 0.8], [0.85, 1, 0.9], [1.05, 1, 0.7]], shift: [-0.1, 0.25] }
  };
  var FRUITS = [[1, 1, 1], [1.1, 2.4, 0.9], [0.55, 0.9, 2.2], [1.1, 3.0, 0.5]];   // apple red, orange, plum, pear yellow (multiplies the baked red fruit)
  var CLASSES = { sap: [1.2, 1.7], med: [2.5, 3.1], large: [3.2, 3.9], giant: [4.2, 4.9] };
  /** Sets size class, scale, lean, trunk shift, canopy tint (and fruit hue) on tree t of species kind. cls optional; r = rng. */
  function style(t, kind, r, cls) {
    var sp = SPECIES[kind] || SPECIES.oak, q = r(), c = cls || (q < 0.07 ? 'sap' : q < 0.47 ? 'med' : q < 0.93 ? 'large' : 'giant'), hr = CLASSES[c];
    t.k = kind; t.sz = c;
    t.s = HERO * (hr[0] + r() * (hr[1] - hr[0])) / sp.h;
    t.ry = r() * 6.2832;
    t.lx = (r() - 0.5) * 0.12; t.lz = (r() - 0.5) * 0.12;                       // slight lean (about +-3.5 degrees)
    var tn = sp.tints[Math.floor(r() * sp.tints.length)], sh = sp.shift;
    t.tint = [tn[0], tn[1], tn[2], sh[0] + r() * (sh[1] - sh[0])];              // canopy tint + trunk height shift (model units)
    if (kind === 'fruit') t.fruit = FRUITS[Math.floor(r() * FRUITS.length)];
    t.r = sp.cr * t.s;                                                          // canopy radius in tiles (for spacing only; never blocks)
    return t;
  }

  /** Styles the trees of Layout.scatter (Decor) once rows are known: species by hash (willow near water), then style(). Deterministic. */
  function styleScatter(trees, rows) {
    var r = rng(9091), i, t, q, kind;
    function wet(x, z) { for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) { var rw = rows[z + dz]; if (rw && rw.charAt(x + dx) === '~') return true; } return false; }
    for (i = 0; i < trees.length; i++) {
      t = trees[i]; q = r();
      kind = wet(Math.floor(t.x), Math.floor(t.z)) && r() < 0.5 ? 'willow' : q < 0.34 ? 'oak' : q < 0.62 ? 'pine' : q < 0.82 ? 'birch' : 'fruit';
      style(t, kind, r);
    }
    return trees;
  }

  function build(o) {
    var rows = o.rows, F = o.features, W = rows[0].length, H = rows.length, rnd = rng(o.seed || 777), x, z, i, j, k;
    var out = { trees: [], bushes: [], flowers: [], rocks: [], reeds: [], lilies: [], props: [], solids: [], bushTiles: [] }, trng = rng((o.seed || 777) + 4141), avoid = o.avoid || [];
    var occ = new Uint8Array(W * H), keep = new Uint8Array(W * H);
    function ch(a, b) { return a < 0 || b < 0 || a >= W || b >= H ? '' : rows[b].charAt(a); }
    function isFarm(a, b) { return a > 10 && a < 29 && b > 5 && b < 20; }
    // keep-out margins so decor never narrows walking corridors or crowds buildings
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      var c = ch(x, z), r = 0;
      if ('=op'.indexOf(c) >= 0) r = 1; else if ('tl'.indexOf(c) >= 0) r = 1; else if ('HSWFDBCKMnms'.indexOf(c) >= 0) r = 2;
      if (!r) continue;
      for (j = -r; j <= r; j++) for (i = -r; i <= r; i++) if (x + i >= 0 && z + j >= 0 && x + i < W && z + j < H) keep[(z + j) * W + x + i] = 1;
    }
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (isFarm(x, z)) keep[z * W + x] = 1;
    function free(a, b) { return ch(a, b) === '.' && !occ[b * W + a] && !keep[b * W + a] && !o.blocked(a, b); }
    function take(a, b) { occ[b * W + a] = 1; out.solids.push([a, b]); }
    function jit(a, b, s0, s1) { return { x: a + 0.5 + (rnd() - 0.5) * 0.5, z: b + 0.5 + (rnd() - 0.5) * 0.5, ry: rnd() * 6.28, s: s0 + rnd() * (s1 - s0) }; }
    // natural spacing: reject a tree whose canopy would crowd another (distance < 0.62 x sum of canopy radii, min 1.9 tiles)
    function spaced(x, z, rr) {
      var i2, tt, d2, lim;
      for (i2 = 0; i2 < out.trees.length; i2++) { tt = out.trees[i2]; lim = Math.max(1.9, 0.62 * (tt.r + rr)); d2 = (tt.x - x) * (tt.x - x) + (tt.z - z) * (tt.z - z); if (d2 < lim * lim) return false; }
      for (i2 = 0; i2 < avoid.length; i2++) { tt = avoid[i2]; lim = Math.max(1.9, 0.62 * ((tt.r || 1.5) + rr)); d2 = (tt.x - x) * (tt.x - x) + (tt.z - z) * (tt.z - z); if (d2 < lim * lim) return false; }
      return true;
    }
    function tree(a, b, kind, cls) {
      var t = { x: a + 0.5 + (rnd() - 0.5) * 0.5, z: b + 0.5 + (rnd() - 0.5) * 0.5 };
      style(t, kind, trng, cls);
      if (!spaced(t.x, t.z, t.r)) return false;
      out.trees.push(t); take(a, b); return true;
    }
    function bush(a, b) { out.bushes.push(jit(a, b, 0.8, 1.2)); occ[b * W + a] = 1; out.bushTiles.push([a, b]); }   // Stage 14A: passable, occupies the tile for spacing only
    function rock(a, b) { out.rocks.push(jit(a, b, 0.7, 1.3)); take(a, b); }
    function flower(a, b, n) { for (var q = 0; q < n; q++) { var f = jit(a, b, 0.8, 1.2); f.x = a + rnd(); f.z = b + rnd(); out.flowers.push(f); } }
    function prop(name, a, b, ry, solid, s) { out.props.push({ name: name, x: a + 0.5, z: b + 0.5, ry: ry || 0, s: s || 1 }); if (solid !== false) { if (!occ[b * W + a]) take(a, b); } }
    function nearWater(a, b, rad) { for (var jj = -rad; jj <= rad; jj++) for (var ii = -rad; ii <= rad; ii++) if (ch(a + ii, b + jj) === '~') return true; return false; }

    // 1. points of interest (placed first so random decor avoids them)
    var bx = F.bridge;
    [[bx[0] - 1, 17], [bx[1] + 1, 20]].forEach(function (t) { prop('lamp', t[0], t[1], 0); });
    [[50, 16], [54, 16], [50, 21], [54, 21], [68, 16], [72, 16], [68, 21], [72, 21]].forEach(function (t) { if (ch(t[0], t[1]) === 'p') prop('lamp', t[0], t[1], 0); });
    if (ch(70, 17) === 'p') prop('bench', 70, 17, Math.PI);
    if (ch(70, 20) === 'p') prop('crate', 70, 20, 0.2);
    if (ch(72, 19) === 'p') prop('barrel', 72, 19, 0);
    if (ch(56, 17) === '~') { /* walkway is 2 wide; no props on it */ }
    var pk = F.picnic;
    prop('table', pk[0], pk[1], 0); prop('bench', pk[0], pk[1] - 1, 0); prop('bench', pk[0], pk[1] + 1, Math.PI); prop('crate', pk[0] - 1, pk[1] + 1, 0.4, false);
    var cf = F.campfire;
    prop('firepit', cf[0], cf[1], 0); prop('log', cf[0] - 2, cf[1] - 1, 0.5); prop('log', cf[0] + 2, cf[1] - 1, -0.5); prop('log', cf[0], cf[1] + 3, 1.57);
    prop('lamp', cf[0] + 3, cf[1] + 2, 0); prop('lamp', cf[0] - 3, cf[1] + 2, 0);
    var lk = F.lookout; prop('bench', lk[0], lk[1] - 1, 0); prop('lamp', lk[0] + 1, lk[1] + 1, 0);
    var pw = F.plazaW; prop('sign', pw[0] + 1, pw[1] - 2, 0.3); prop('barrel', pw[0] - 1, pw[1] + 2, 0);
    [[17, 21, 0.2], [45, 21, -0.2], [8, 16, 0.4]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('sign', t[0], t[1], t[2]); });
    [[6, 10], [6, 11]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('woodpile', t[0], t[1], 0); });
    [[8, 25], [9, 25], [8, 26]].forEach(function (t, n) { if (ch(t[0], t[1]) === '.') prop('hay', t[0], t[1], n * 0.9); });
    [[7, 2], [9, 2], [10, 3]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('hive', t[0], t[1], 0.3); });
    [[6, 2], [11, 2]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('stump', t[0], t[1], 0); });
    // viewpoints at the ends of the lake trails
    [[6, -1], [28, 0]].forEach(function (t, n) {
      var bestx = -1; for (x = 0; x < W; x++) if (ch(x, t[0]) === 'o' && x > 40) bestx = x;
      if (bestx > 0) { prop('bench', bestx, t[0], Math.PI / 2); if (ch(bestx - 1, t[0] - 1) === '.' || ch(bestx - 1, t[0] - 1) === ',') prop('lamp', bestx - 1, t[0] - 1, 0); }
    });
    // flower beds around the plaza and the lookout
    [[F.plazaW[0], F.plazaW[1], 4], [F.lookout[0], F.lookout[1], 3], [F.picnic[0], F.picnic[1], 3], [F.campfire[0], F.campfire[1], 5]].forEach(function (p) {
      for (z = p[1] - p[2]; z <= p[1] + p[2]; z++) for (x = p[0] - p[2]; x <= p[0] + p[2]; x++)
        if (ch(x, z) === '.' && Math.hypot(x - p[0], z - p[1]) > 2.4 && rnd() < 0.45) flower(x, z, 1 + (rnd() < 0.5 ? 1 : 0));
    });

    // 2. orchard
    var od = F.orchard;
    for (z = od[1]; z <= od[3]; z++) for (x = od[0]; x <= od[2]; x++) if ((x + (Math.floor(z / 3) & 1)) % 3 === 1 && z % 3 === 0 && free(x, z)) tree(x, z, 'fruit', trng() < 0.8 ? 'med' : 'large');   // staggered orchard rows
    for (z = od[1]; z <= od[3]; z++) for (x = od[0]; x <= od[2]; x++) if (ch(x, z) === '.' && !occ[z * W + x] && rnd() < 0.18) flower(x, z, 1);

    // 3. grove + forests (+ clearing). Species by noise clumps: pine / oak / birch groves, willows near water.
    function speciesAt(a, b, pinePart) {
      var n1 = vnoise(a * 0.3, b * 0.3), n2 = vnoise(a * 0.22 + 40, b * 0.22);
      if (nearWater(a, b, 4) && trng() < 0.6) return 'willow';
      if (n1 < pinePart) return 'pine';
      return n2 < 0.3 ? 'birch' : n2 > 0.86 ? 'fruit' : 'oak';
    }
    function forest(e, dens, pinePart, clr) {
      for (z = Math.floor(e[1] - e[3]) - 1; z <= Math.ceil(e[1] + e[3]) + 1; z++) for (x = Math.floor(e[0] - e[2]) - 1; x <= Math.ceil(e[0] + e[2]) + 1; x++) {
        var m = inEllipse(e, x, z, 0.45); if (!m) continue;
        if (clr && Math.hypot(x + 0.5 - clr[0], z + 0.5 - clr[1]) < clr[2] + 1.2) continue;
        if (!free(x, z)) continue;
        var q = rnd();
        if (q < dens * (0.45 + 0.55 * m)) { if (!tree(x, z, speciesAt(x, z, pinePart))) { if (rnd() < 0.5) bush(x, z); } }
        else if (q < dens * 0.9 + 0.12) { if (rnd() < 0.5) bush(x, z); else flower(x, z, 1); }
        else if (q > 0.985) rock(x, z);
      }
    }
    forest(F.grove, 0.3, 0.5, F.clearing);
    F.forests.forEach(function (e) { forest(e, 0.28, 0.7); });

    // 4. flower meadows
    F.meadows.forEach(function (e) {
      for (z = Math.floor(e[1] - e[3]) - 1; z <= Math.ceil(e[1] + e[3]) + 1; z++) for (x = Math.floor(e[0] - e[2]) - 1; x <= Math.ceil(e[0] + e[2]) + 1; x++) {
        var m = inEllipse(e, x, z, 0.5); if (!m || ch(x, z) !== '.' || occ[z * W + x]) continue;
        var q = rnd();
        if (q < 0.04 && free(x, z)) bush(x, z);
        else if (q < 0.2 + 0.7 * m) flower(x, z, 1 + (rnd() < 0.55 * m ? 1 : 0) + (rnd() < 0.25 * m ? 1 : 0));
      }
    });

    // 5. general fill (so no big flat area stays empty): edge forest belt, sparse trees, bushes, rocks, flowers
    var nTrees = out.trees.length;
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      if (ch(x, z) !== '.' || occ[z * W + x] || isFarm(x, z)) continue;
      var edge = Math.min(x, z, W - 1 - x, H - 1 - z), q2 = rnd(), a2 = rnd(), freeNow = free(x, z);
      var wet = nearWater(x, z, 4);
      if (freeNow && nTrees < 200 && ((edge < 3 && q2 < 0.16) || (edge < 8 && q2 < 0.035) || q2 < 0.014)) { if (tree(x, z, speciesAt(x, z, 0.4))) nTrees++; }
      else if (freeNow && q2 < 0.09 && a2 < 0.6) bush(x, z);
      else if (freeNow && q2 < 0.085 && a2 > 0.93) rock(x, z);
      else if (q2 < (wet ? 0.3 : 0.22)) flower(x, z, 1 + (a2 < 0.3 ? 1 : 0));
    }
    // willows by the water (lake shore, stream): a few, spaced out
    var nW = 0;
    for (z = 0; z < H && nW < 14; z++) for (x = 0; x < W && nW < 14; x++) {
      if (ch(x, z) === '.' && free(x, z) && nearWater(x, z, 3) && trng() < 0.045 && tree(x, z, 'willow')) nW++;
    }
    // rocks along the stream banks
    for (z = 0; z < 36; z++) for (x = 20; x < 56; x++) if (free(x, z) && nearWater(x, z, 1) && x < 47 && rnd() < 0.07) rock(x, z);

    // 6. reeds on shore water tiles, lily pads in the shallows (never next to planks)
    var near = function (a, b, set, rad) { for (var jj = -rad; jj <= rad; jj++) for (var ii = -rad; ii <= rad; ii++) if (set.indexOf(ch(a + ii, b + jj)) >= 0) return true; return false; };
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      if (ch(x, z) !== '~' || near(x, z, 'pH', 2)) continue;
      var landDir = null, dd = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (k = 0; k < 4; k++) { var cc = ch(x + dd[k][0], z + dd[k][1]); if (cc === ',' || cc === '.' || cc === 'o') { landDir = dd[k]; break; } }
      if (landDir && rnd() < 0.34) { out.reeds.push({ x: x + 0.5 + landDir[0] * 0.3 + (rnd() - 0.5) * 0.3, z: z + 0.5 + landDir[1] * 0.3 + (rnd() - 0.5) * 0.3, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.6 }); }
      else if (!landDir && near(x, z, ',.', 3) && rnd() < 0.1 && x < 86) out.lilies.push({ x: x + 0.5 + (rnd() - 0.5) * 0.5, z: z + 0.5 + (rnd() - 0.5) * 0.5, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
    }
    // island: a lone tree and reeds
    var isl = []; for (z = 8; z < 20; z++) for (x = 72; x < 84; x++) if (ch(x, z) === ',') isl.push([x, z]);
    if (isl.length > 4) { var mid = isl[Math.floor(isl.length / 2)]; var t0 = { x: mid[0] + 0.5, z: mid[1] + 0.5 }; style(t0, 'willow', trng, 'large'); out.trees.push(t0); }
    return out;
  }

  var L = { build: build, vnoise: vnoise, rng: rng, style: style, styleScatter: styleScatter, SPECIES: SPECIES, CLASSES: CLASSES, HERO: HERO };
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  if (root.Game) root.Game.SceneryLayout = L;
})(typeof window !== 'undefined' ? window : this);
