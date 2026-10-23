/* Togie Valley - critters.js (Stage 15F2b): wandering chickens (west of the farmhouse), ducks paddling on the lake near the town,
 * a beehive with a few bees. Chickens/ducks are tiny pools of merged toon meshes (+ thin outline), bees are ONE instanced draw call.
 * Simple state machines (idle / peck / walk / flee, duck: swim / dip / preen), distance gated, 30 Hz logic on tiers >= 2.
 * Time/weather aware: asleep (squat / tucked) at night, huddled near home in rain or snow, bees only on dry daytime hours outside winter.
 * Quality: counts = ceil(N * Quality critter density), everything OFF on tier 3 (Siêu nhẹ). The hive is one solid tile.
 * API: Game.Critters {build(), group, enabled, layout, stats()}. Added draw calls: <= 15 (chickens 3x2, ducks 3x2, hive 2, bees 1).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.Scenery || !G.Loop || !G.Player) { console.error('[critters] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, U = G.util, CR = G.Critters = { group: null, enabled: true }, PI = Math.PI, TAU = PI * 2;

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    chickens: { hx: 6.5, hz: 15.5, r: 3, n: 3 },
    ducks: { hx: 51.5, hz: 12.5, r: 3.6, n: 3 },
    hive: { tx: 10, tz: 21, bees: 6 }
  };
  /*LAYOUT-END*/
  CR.layout = LAYOUT;

  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8), SPH = new THREE.SphereGeometry(0.5, 8, 6),
    CONE = new THREE.ConeGeometry(0.5, 1, 6);
  var rnd = U.rng(51515), Pl = G.Player, tint = new THREE.Color(1, 1, 1);
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
  var chickens = [], ducks = [], bees = [], beeMesh = null, built = false, acc = 0, t = 0, hive = null;
  var GRASSY = { grass: 1, path: 1, sand: 1 };

  function P(geo, c, p, r, s) { return Mo.part(geo, c, p, r, s); }
  function night() { var h = G.Time.hour; return h >= 19.8 || h < 6; }
  function rain() { return G.Weather ? Math.max(G.Weather.rain || 0, G.Weather.snow || 0) : 0; }
  function season() { var s = G.Time.season; return typeof s === 'number' ? ['spring', 'summer', 'autumn', 'winter'][s] : s; }
  function tier() { return G.Quality && G.Quality.level ? G.Quality.level() : 0; }
  function density() { return G.Perf && G.Perf.density ? G.Perf.density.critter : 1; }
  function okG(x, z) { return !!GRASSY[W.tileType(x, z)] && W.isWalkableTile(Math.floor(x), Math.floor(z)); }
  function okW(x, z) {
    return W.tileType(x, z) === 'water' && W.tileType(x + 0.7, z) === 'water' && W.tileType(x - 0.7, z) === 'water' &&
      W.tileType(x, z + 0.7) === 'water' && W.tileType(x, z - 0.7) === 'water';
  }

  /* ------------------------------------------------------------ models */
  var CHICK_LOOKS = [
    { body: 0xfff3dc, wing: 0xe9d6b2, tail: 0xd9c49a },
    { body: 0xc98b4f, wing: 0xa56a38, tail: 0x6b4a32 },
    { body: 0xe8b86a, wing: 0xc9893f, tail: 0x8c5a34 }
  ];
  function chickenParts(c) {
    var L = [], o = 0xf2a93b, red = 0xe0524b, ink = 0x3a2a28;
    L.push(P(SPH, c.body, [0, 0.23, 0], [0, 0, 0], [0.34, 0.3, 0.42]));
    L.push(P(SPH, c.body, [0, 0.28, 0.11], [0, 0, 0], [0.28, 0.28, 0.3]));
    L.push(P(SPH, c.wing, [0.165, 0.25, -0.03], [0, 0, -0.18], [0.08, 0.2, 0.3]));
    L.push(P(SPH, c.wing, [-0.165, 0.25, -0.03], [0, 0, 0.18], [0.08, 0.2, 0.3]));
    L.push(P(CONE, c.tail, [0, 0.38, -0.25], [-0.9, 0, 0], [0.13, 0.28, 0.13]));
    L.push(P(CONE, c.tail, [0.07, 0.35, -0.23], [-0.75, 0, -0.4], [0.1, 0.22, 0.1]));
    L.push(P(CONE, c.tail, [-0.07, 0.35, -0.23], [-0.75, 0, 0.4], [0.1, 0.22, 0.1]));
    L.push(P(SPH, c.body, [0, 0.44, 0.17], [0, 0, 0], [0.2, 0.2, 0.2]));
    L.push(P(CONE, o, [0, 0.42, 0.285], [PI / 2, 0, 0], [0.07, 0.1, 0.07]));
    L.push(P(SPH, red, [0, 0.545, 0.155], [0, 0, 0], [0.06, 0.07, 0.11]));
    L.push(P(SPH, red, [0, 0.355, 0.255], [0, 0, 0], [0.045, 0.07, 0.045]));
    L.push(P(SPH, ink, [0.078, 0.465, 0.235], [0, 0, 0], [0.04, 0.04, 0.04]));
    L.push(P(SPH, ink, [-0.078, 0.465, 0.235], [0, 0, 0], [0.04, 0.04, 0.04]));
    L.push(P(CYL, o, [0.07, 0.09, 0.03], [0, 0, 0], [0.032, 0.18, 0.032]));
    L.push(P(CYL, o, [-0.07, 0.09, 0.03], [0, 0, 0], [0.032, 0.18, 0.032]));
    L.push(P(BOX, o, [0.07, 0.012, 0.07], [0, 0, 0], [0.08, 0.024, 0.13]));
    L.push(P(BOX, o, [-0.07, 0.012, 0.07], [0, 0, 0], [0.08, 0.024, 0.13]));
    return L;
  }
  var DUCK_LOOKS = [
    { body: 0xb08a5e, wing: 0x8c6a45, head: 0x4f9a73, bill: 0xf2c04a, ring: 0xffffff },
    { body: 0xfff6e4, wing: 0xe9dcc0, head: 0xfff6e4, bill: 0xf29a3b, ring: 0 },
    { body: 0xf4d56a, wing: 0xe0b848, head: 0xf4d56a, bill: 0xf29a3b, ring: 0 }
  ];
  function duckParts(c) {
    var L = [], ink = 0x3a2a28;
    L.push(P(SPH, c.body, [0, 0.1, 0], [0, 0, 0], [0.36, 0.28, 0.5]));
    L.push(P(CONE, c.body, [0, 0.2, -0.27], [-1.1, 0, 0], [0.12, 0.17, 0.12]));
    L.push(P(SPH, c.wing, [0.17, 0.16, -0.04], [0, 0, -0.2], [0.07, 0.17, 0.33]));
    L.push(P(SPH, c.wing, [-0.17, 0.16, -0.04], [0, 0, 0.2], [0.07, 0.17, 0.33]));
    L.push(P(SPH, c.head, [0, 0.3, 0.19], [0.25, 0, 0], [0.15, 0.22, 0.15]));
    if (c.ring) L.push(P(SPH, c.ring, [0, 0.265, 0.185], [0, 0, 0], [0.16, 0.045, 0.16]));
    L.push(P(SPH, c.head, [0, 0.41, 0.235], [0, 0, 0], [0.21, 0.2, 0.21]));
    L.push(P(BOX, c.bill, [0, 0.385, 0.37], [0.12, 0, 0], [0.12, 0.04, 0.13]));
    L.push(P(SPH, c.bill, [0, 0.38, 0.435], [0, 0, 0], [0.1, 0.04, 0.06]));
    L.push(P(SPH, ink, [0.082, 0.435, 0.3], [0, 0, 0], [0.04, 0.04, 0.04]));
    L.push(P(SPH, ink, [-0.082, 0.435, 0.3], [0, 0, 0], [0.04, 0.04, 0.04]));
    return L;
  }
  function mkMesh(parts, name) {
    var m = new THREE.Mesh(Mo.mergeParts(parts), Mo.material('prop'));
    m.name = name; m.rotation.order = 'YXZ'; m.visible = false; m.raycast = function () {}; R.addOutline(m, true);
    CR.group.add(m);
    return m;
  }

  function hiveParts() {
    var L = [], X = LAYOUT.hive.tx + 0.5, Z = LAYOUT.hive.tz + 0.5, wood = 0xc98b4f, dark = 0x8c5a34, yel = 0xf2d27a, yel2 = 0xe3b95a, i, a;
    function bx(w, h, d, c, x, y, z, ry) { L.push(P(BOX, c, [x + X, y, z + Z], [0, ry || 0, 0], [w, h, d])); }
    for (i = 0; i < 4; i++) bx(0.07, 0.34, 0.07, dark, (i % 2 ? 0.26 : -0.26), 0.17, (i < 2 ? 0.2 : -0.2));
    bx(0.7, 0.06, 0.55, wood, 0, 0.36, 0);
    bx(0.56, 0.2, 0.44, yel, 0, 0.5, 0); bx(0.6, 0.03, 0.48, yel2, 0, 0.61, 0);
    bx(0.56, 0.2, 0.44, yel, 0, 0.72, 0); bx(0.6, 0.03, 0.48, yel2, 0, 0.83, 0);
    bx(0.56, 0.16, 0.44, yel, 0, 0.93, 0);
    L.push(P(BOX, 0xc65a45, [X, 1.04, Z], [0.0, 0, 0], [0.74, 0.07, 0.6]));
    L.push(P(BOX, 0xd9825b, [X, 1.1, Z], [0, 0, 0], [0.5, 0.06, 0.42]));
    bx(0.2, 0.05, 0.03, 0x3a2a28, 0, 0.42, 0.235);   // entrance slit
    bx(0.3, 0.025, 0.08, wood, 0, 0.39, 0.3);       // landing board
    var FL = [0xff9bb3, 0xffffff, 0xffd166, 0xb79cf2, 0xff9bb3];
    for (i = 0; i < 5; i++) {
      a = i * 1.3 + 0.4;
      L.push(P(CYL, 0x5aa86a, [X + Math.cos(a) * 0.62, 0.1, Z + Math.sin(a) * 0.62 + 0.05], [0, 0, 0], [0.025, 0.2, 0.025]));
      L.push(P(SPH, FL[i], [X + Math.cos(a) * 0.62, 0.22, Z + Math.sin(a) * 0.62 + 0.05], [0, 0, 0], [0.13, 0.1, 0.13]));
    }
    return L;
  }

  function beeGeo() {
    var g = new THREE.IcosahedronGeometry(0.04, 0), pos = g.attributes.position, n = pos.count, col = [], i, y, z, c = new THREE.Color(), arr = [];
    g.applyMatrix4(new THREE.Matrix4().makeScale(0.9, 0.9, 1.5));
    g = g.toNonIndexed(); pos = g.attributes.position;
    for (i = 0; i < pos.count; i++) {
      z = pos.getZ(i); c.set(Math.floor((z + 0.07) / 0.035) % 2 === 0 ? 0xf2c03a : 0x3a2a28);
      col.push(c.r, c.g, c.b);
    }
    var wing = [0.03, 0.03, 0, 0.12, 0.07, -0.03, 0.12, 0.06, 0.04, -0.03, 0.03, 0, -0.12, 0.07, 0.03, -0.12, 0.06, -0.04];
    for (i = 0; i < wing.length; i += 3) col.push(0.92, 0.97, 1);
    var p = Array.prototype.slice.call(pos.array); for (i = 0; i < wing.length; i++) p.push(wing[i]);
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }

  /* ------------------------------------------------------------ chickens */
  function pickChickTarget(c, rr) {
    var H = LAYOUT.chickens, i, a, d, x, z;
    for (i = 0; i < 6; i++) {
      a = rnd() * TAU; d = 0.6 + rnd() * rr; x = H.hx + Math.cos(a) * d; z = H.hz + Math.sin(a) * d;
      if (okG(x, z) && okG((x + c.x) / 2, (z + c.z) / 2)) { c.tx = x; c.tz = z; return true; }
    }
    return false;
  }
  function stepTo(c, sp, dt, ok) {
    var dx = c.tx - c.x, dz = c.tz - c.z, d = Math.sqrt(dx * dx + dz * dz), st, nx, nz;
    if (d < 0.1) return true;
    st = Math.min(d, sp * dt); nx = c.x + dx / d * st; nz = c.z + dz / d * st;
    if (!ok(nx, nz)) return true;
    c.x = nx; c.z = nz; c.ry = U.lerpAngle(c.ry, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
    return false;
  }
  function chickenAI(c, dt, mode) {   // mode 0 normal, 1 huddle (rain/snow), 2 asleep
    var dx = Pl.pos.x - c.x, dz = Pl.pos.z - c.z, d2 = dx * dx + dz * dz, pit = 0, yy = 0, roll = 0, r, k, dd;
    c.tm -= dt; c.t += dt;
    c.sleep = mode === 2 ? Math.min(1, c.sleep + dt * 2) : Math.max(0, c.sleep - dt * 3);
    if (mode !== 2 && c.st !== 'flee' && d2 < 1.7) {   // the player came too close: hop away
      dd = Math.sqrt(d2) + 0.001; c.tx = c.x - dx / dd * 2.2; c.tz = c.z - dz / dd * 2.2;
      if (!okG(c.tx, c.tz)) { if (!pickChickTarget(c, 3)) { c.tx = c.x; c.tz = c.z; } }
      c.st = 'flee'; c.tm = 0.9;
    }
    if (mode === 2) c.st = 'idle';
    if (c.st === 'idle') {
      if (c.tm <= 0 && mode !== 2) {
        r = rnd();
        if (mode === 1) { if (r < 0.3 && pickChickTarget(c, 1.1)) { c.st = 'walk'; } else { c.tm = 1.5 + rnd() * 2.5; c.ry += (rnd() - 0.5) * 1.2; } }
        else if (r < 0.55) { c.st = 'peck'; c.tm = 1.3 + rnd() * 1.4; }
        else if (r < 0.82 && pickChickTarget(c, LAYOUT.chickens.r)) { c.st = 'walk'; c.tm = 6; }
        else { c.tm = 0.8 + rnd() * 1.6; c.ry += (rnd() - 0.5) * 1.8; }
      }
      roll = Math.sin(c.t * 1.7 + c.ph) * 0.02;
    } else if (c.st === 'peck') {
      k = Math.sin(c.t * 7 + c.ph); pit = k > 0.2 ? (k - 0.2) * 0.9 : 0;
      if (c.tm <= 0) { c.st = 'idle'; c.tm = 0.6 + rnd() * 1.2; }
    } else if (c.st === 'walk') {
      if (stepTo(c, 0.7, dt, okG) || c.tm <= 0) { c.st = 'idle'; c.tm = 0.8 + rnd() * 1.6; }
      k = Math.sin(c.t * 9 + c.ph); yy = Math.abs(k) * 0.03; pit = k * 0.06;
    } else {   // flee
      if (stepTo(c, 2.4, dt, okG) || c.tm <= 0) { c.st = 'idle'; c.tm = 0.8; }
      k = Math.sin(c.t * 18 + c.ph); yy = Math.abs(k) * 0.08; pit = -0.15; roll = k * 0.12;
    }
    c.mesh.position.set(c.x, yy - c.sleep * 0.1, c.z);
    c.mesh.rotation.set(pit + c.sleep * 0.08, c.ry, roll);
  }

  /* ------------------------------------------------------------ ducks */
  function pickDuckTarget(c, away) {
    var H = LAYOUT.ducks, i, a, d, x, z, dx, dz, dd;
    if (away) {
      dx = c.x - Pl.pos.x; dz = c.z - Pl.pos.z; dd = Math.sqrt(dx * dx + dz * dz) + 0.001;
      x = c.x + dx / dd * 2.4; z = c.z + dz / dd * 2.4;
      if (okW(x, z)) { c.tx = x; c.tz = z; return true; }
    }
    for (i = 0; i < 8; i++) {
      a = rnd() * TAU; d = 0.8 + rnd() * H.r; x = H.hx + Math.cos(a) * d; z = H.hz + Math.sin(a) * d;
      if (okW(x, z) && okW((x + c.x) / 2, (z + c.z) / 2)) { c.tx = x; c.tz = z; return true; }
    }
    return false;
  }
  function duckAI(c, dt, mode) {
    var dx = Pl.pos.x - c.x, dz = Pl.pos.z - c.z, d2 = dx * dx + dz * dz, pit = 0, roll = 0, r, k, y0 = -0.12 + 0.045;
    c.tm -= dt; c.t += dt;
    c.sleep = mode === 2 ? Math.min(1, c.sleep + dt * 1.5) : Math.max(0, c.sleep - dt * 2);
    if (mode !== 2 && c.st !== 'swim' && d2 < 7 && pickDuckTarget(c, true)) { c.st = 'swim'; c.tm = 4; c.fast = 1; }
    if (mode === 2) c.st = 'idle';
    if (c.st === 'idle') {
      if (c.tm <= 0 && mode !== 2) {
        r = rnd(); c.fast = 0;
        if (r < 0.4 && pickDuckTarget(c, false)) { c.st = 'swim'; c.tm = 12; }
        else if (r < 0.65) { c.st = 'dip'; c.dur = 1.3 + rnd() * 0.5; c.tm = c.dur; }
        else if (r < 0.8) { c.st = 'preen'; c.tm = 1 + rnd() * 0.7; }
        else c.tm = 1.2 + rnd() * 2.2;
      }
    } else if (c.st === 'swim') {
      if (stepTo(c, c.fast ? 0.95 : 0.42, dt, okW) || c.tm <= 0) { c.st = 'idle'; c.tm = 0.8 + rnd() * 2; c.fast = 0; }
      roll = Math.sin(c.t * 2.2 + c.ph) * 0.05; pit = c.fast ? -0.08 : 0;
    } else if (c.st === 'dip') {
      pit = 1.15 * Math.sin(PI * Math.min(1, Math.max(0, 1 - c.tm / c.dur)));
      if (c.tm <= 0) { c.st = 'idle'; c.tm = 1 + rnd() * 2; }
    } else {   // preen: little wiggle
      roll = Math.sin(c.t * 14) * 0.2; pit = -0.1;
      if (c.tm <= 0) { c.st = 'idle'; c.tm = 1 + rnd() * 2; }
    }
    c.mesh.position.set(c.x, y0 + Math.sin(c.t * 1.9 + c.ph) * 0.012 - c.sleep * 0.02, c.z);
    c.mesh.rotation.set(pit + c.sleep * 0.4, c.ry, roll);
  }

  /* ------------------------------------------------------------ bees */
  var FLOWERS = [];
  function updateBees(dt, dayOk) {
    var H = LAYOUT.hive, hx = H.tx + 0.5, hz = H.tz + 0.5, n = dayOk ? Math.min(bees.length, Math.ceil(H.bees * density())) : 0, i, o, x, y, z, vx, vz, f, a;
    beeMesh.visible = n > 0; beeMesh.count = n;
    if (!n) return;
    tint.copy(G.Render.uniforms.uAmbient.value).add(G.Render.uniforms.uLightColor.value);
    tint.r = Math.min(1, tint.r); tint.g = Math.min(1, tint.g); tint.b = Math.min(1, tint.b);
    beeMesh.material.color.copy(tint);
    for (i = 0; i < n; i++) {
      o = bees[i]; o.tm -= dt;
      if (o.tm <= 0) {
        if (o.out) { o.out = false; o.tm = 5 + rnd() * 8; }
        else { o.out = true; o.tm = 3 + rnd() * 2.5; a = FLOWERS[Math.floor(rnd() * FLOWERS.length)]; o.fx = a[0]; o.fz = a[1]; }
      }
      f = U.damp(o.k, o.out ? 1 : 0, 1.6, dt); o.k = f;
      o.cx = hx + (o.fx - hx) * f; o.cz = hz + (o.fz - hz) * f;
      x = o.cx + Math.sin(t * o.w1 + o.p1) * o.r; z = o.cz + Math.sin(t * o.w2 + o.p2) * o.r * 0.8;
      y = (0.75 + (0.28 - 0.5) * f) + Math.sin(t * o.w3 + o.p1) * 0.12;
      if (y < 0.3) y = 0.3 + Math.sin(t * 7 + i) * 0.03;
      vx = Math.cos(t * o.w1 + o.p1) * o.w1 * o.r; vz = Math.cos(t * o.w2 + o.p2) * o.w2 * o.r * 0.8;
      E.set(0, Math.atan2(vx, vz), 0, 'YXZ'); Q.setFromEuler(E);
      M4.compose(V.set(x, y, z), Q, S.set(0.55 + 0.45 * Math.abs(Math.sin(t * 38 + i * 2)), 1, 1)); beeMesh.setMatrixAt(i, M4);
    }
    beeMesh.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ frame */
  function update(dt) {
    var tr, indoors, far, h = LAYOUT.chickens, d = LAYOUT.ducks, hv = LAYOUT.hive, px, pz, i, n, mode, dayOk, c;
    if (!CR.group) return;
    indoors = G.Scenes.current !== 'outdoor';
    px = Pl.pos.x; pz = Pl.pos.z; tr = tier();
    if (!CR.enabled || indoors || tr >= 3) { CR.group.visible = false; return; }
    CR.group.visible = true;
    acc += dt;
    if (tr >= 2 && acc < 1 / 30) return;
    dt = Math.min(acc, 0.1); acc = 0; t += dt;
    mode = night() ? 2 : rain() > 0.3 ? 1 : 0;
    n = Math.ceil(LAYOUT.chickens.n * density());
    far = Math.abs(h.hx - px) + Math.abs(h.hz - pz) > 46;
    for (i = 0; i < chickens.length; i++) {
      c = chickens[i]; c.mesh.visible = !far && i < n;
      if (c.mesh.visible) chickenAI(c, dt, mode);
    }
    n = Math.ceil(LAYOUT.ducks.n * density());
    far = Math.abs(d.hx - px) + Math.abs(d.hz - pz) > 46;
    for (i = 0; i < ducks.length; i++) {
      c = ducks[i]; c.mesh.visible = !far && i < n;
      if (c.mesh.visible) duckAI(c, dt, mode);
    }
    dayOk = !night() && G.Time.hour >= 6.5 && G.Time.hour < 18.5 && rain() < 0.2 && season() !== 'winter' && Math.abs(hv.tx - px) + Math.abs(hv.tz - pz) < 40;
    updateBees(dt, dayOk);
    if (hive) hive.visible = Math.abs(hv.tx - px) + Math.abs(hv.tz - pz) < 70;
  }

  CR.stats = function () {
    var a = 0, b = 0, i;
    for (i = 0; i < chickens.length; i++) if (chickens[i].mesh.visible) a++;
    for (i = 0; i < ducks.length; i++) if (ducks[i].mesh.visible) b++;
    return { chickens: a, ducks: b, bees: beeMesh ? beeMesh.count : 0, draws: 15 };
  };

  /* ------------------------------------------------------------ build */
  CR.build = function () {
    var i, c, H = LAYOUT, o, a, x, z;
    if (built) return CR.group;
    built = true;
    CR.group = new THREE.Group(); CR.group.name = 'critters'; G.Scenery.group.add(CR.group);
    for (i = 0; i < H.chickens.n; i++) {
      o = { mesh: mkMesh(chickenParts(CHICK_LOOKS[i % 3]), 'chicken' + i), x: H.chickens.hx, z: H.chickens.hz, ry: rnd() * TAU, tx: 0, tz: 0, st: 'idle', tm: rnd() * 2, t: 0, ph: rnd() * TAU, sleep: 0 };
      for (a = 0; a < 8; a++) { x = H.chickens.hx + (rnd() - 0.5) * 3; z = H.chickens.hz + (rnd() - 0.5) * 3; if (okG(x, z)) { o.x = x; o.z = z; break; } }
      chickens.push(o);
    }
    for (i = 0; i < H.ducks.n; i++) {
      o = { mesh: mkMesh(duckParts(DUCK_LOOKS[i % 3]), 'duck' + i), x: H.ducks.hx, z: H.ducks.hz, ry: rnd() * TAU, tx: 0, tz: 0, st: 'idle', tm: rnd() * 2, t: 0, ph: rnd() * TAU, sleep: 0, fast: 0, dur: 1.4 };
      for (a = 0; a < 10; a++) { x = H.ducks.hx + (rnd() - 0.5) * 4; z = H.ducks.hz + (rnd() - 0.5) * 4; if (okW(x, z)) { o.x = x; o.z = z; break; } }
      ducks.push(o);
    }
    W.setBlocked(H.hive.tx, H.hive.tz, true);
    hive = new THREE.Mesh(Mo.mergeParts(hiveParts()), Mo.material('prop')); hive.name = 'beehive'; hive.raycast = function () {};
    R.addOutline(hive, true); CR.group.add(hive);
    for (a = 0; a < 14; a++) {   // flower spots the bees visit: grass tiles around the hive
      x = H.hive.tx + 0.5 + (rnd() - 0.5) * 9; z = H.hive.tz + 0.5 + (rnd() - 0.5) * 9;
      if (okG(x, z)) FLOWERS.push([x, z]);
    }
    if (!FLOWERS.length) FLOWERS.push([H.hive.tx + 1.5, H.hive.tz + 1.5]);
    beeMesh = new THREE.InstancedMesh(beeGeo(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }), H.hive.bees);
    beeMesh.name = 'bees'; beeMesh.frustumCulled = false; beeMesh.raycast = function () {}; beeMesh.count = 0; beeMesh.visible = false;
    beeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); CR.group.add(beeMesh);
    for (i = 0; i < H.hive.bees; i++) bees.push({ r: 0.35 + rnd() * 0.5, w1: 0.9 + rnd() * 0.8, w2: 1.2 + rnd() * 0.9, w3: 1.5 + rnd(), p1: rnd() * TAU, p2: rnd() * TAU, tm: rnd() * 8, out: false, k: 0, cx: 0, cz: 0, fx: 0, fz: 0 });
    G.Loop.onFrame(update, 10.8);
    return CR.group;
  };
})();
