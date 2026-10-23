/* Togie Valley - ambient.js (Stage 10.5 Part 4): cheap ambient life around the player (outdoors only).
 * Game.Ambient.build() once (after Scenery.build): butterflies (10), circling birds (5), drifting petals/leaves (36, by season), chimney smoke (5 puffs),
 * a jumping fish now and then (splash via FishingFx). All InstancedMesh + MeshBasicMaterial tinted by the day light; hidden (0 draw calls) at night,
 * in rain/snow, indoors. API: `enabled` (bool), `stats()` -> {butterflies,birds,petals,smoke,fish}. Frame priority 12. Added draw calls: 4 (+1 while the fish jumps).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.World || !G.Player || !G.Time || !G.Scenery || !G.Scenes) { console.error('[ambient] missing deps'); return; }
  var R = G.Render, W = G.World, U = G.util, A = { group: null, enabled: true }, NB = 10, NR = 5, NP = 36, NS = 5, TAU = Math.PI * 2;
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
  var rnd = U.rng(4242), bf = [], br = [], pt = [], sm = [], meshes = {}, tint = new THREE.Color(1, 1, 1), t = 0, lastSeason = '', fishT = 8, fish = null, fk = -1;

  function geo(tris, cols) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    if (cols) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  function inst(g, n, name, opaque) {
    var m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), n);
    m.name = name; m.frustumCulled = false; m.raycast = function () {}; m.count = 0; m.visible = false;
    for (var i = 0; i < n; i++) m.setColorAt(i, C.set(0xffffff));
    A.group.add(m);
    return m;
  }
  function setCols(m, list) { for (var i = 0; i < list.length; i++) m.setColorAt(i, C.set(list[i])); m.instanceColor.needsUpdate = true; }
  function put(m, i, x, y, z, ry, sx, sy, sz, rz) {
    E.set(0, ry, rz || 0, 'YXZ'); Q.setFromEuler(E);
    M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)); m.setMatrixAt(i, M4);
  }
  function season() { var s = G.Time.season; return typeof s === 'number' ? ['spring', 'summer', 'autumn', 'winter'][s] : s; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function groundNear(px, pz, r0, r1) {   // random walkable-ish grass/sand point at distance r0..r1 from (px,pz)
    for (var i = 0; i < 8; i++) {
      var a = rnd() * TAU, d = r0 + rnd() * (r1 - r0), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d, tp = W.tileType(x, z);
      if (tp === 'grass' || tp === 'sand') return [x, z];
    }
    return [px + 3, pz + 3];
  }

  A.build = function () {
    if (A.group) return A.group;
    A.group = new THREE.Group(); A.group.name = 'ambient'; G.Scenery.group.add(A.group);
    var wing = [0, 0, -0.04, 0.16, 0, -0.12, 0.14, 0, 0.05, 0, 0, -0.04, 0.14, 0, 0.05, 0.03, 0, 0.1], i, bw = [];
    for (i = 0; i < wing.length; i += 3) bw.push(wing[i], wing[i + 1], wing[i + 2]);
    for (i = 0; i < wing.length; i += 3) bw.push(-wing[i], wing[i + 1], wing[i + 2]);
    meshes.bf = inst(geo(bw), NB, 'amb_butterflies');
    setCols(meshes.bf, [0xffffff, 0xffd166, 0xff9bb3, 0x9fd3e6, 0xffffff, 0xffb36b, 0xc9a7ff, 0xffd166, 0xff9bb3, 0xffffff]);
    var bird = [0, 0, 0.2, 0.06, 0, -0.1, -0.06, 0, -0.1, 0, 0, 0.05, 0.34, 0.07, 0.1, 0.28, 0.05, -0.12, 0, 0, 0.05, -0.34, 0.07, 0.1, -0.28, 0.05, -0.12];
    meshes.br = inst(geo(bird), NR, 'amb_birds'); setCols(meshes.br, [0xfff1d0, 0x8a8590, 0x4f8fd6, 0xe8715d, 0x8a8590]);
    meshes.pt = inst(geo([0, 0, -0.07, 0.045, 0, 0, 0, 0, 0.07, 0, 0, -0.07, 0, 0, 0.07, -0.045, 0, 0]), NP, 'amb_petals');
    meshes.sm = inst(new THREE.IcosahedronGeometry(0.12, 0), NS, 'amb_smoke'); setCols(meshes.sm, [0xf1ede2, 0xf1ede2, 0xf1ede2, 0xf1ede2, 0xf1ede2]);
    for (i = 0; i < NB; i++) bf.push({ hx: 0, hz: 0, r: 1.2 + rnd() * 1.6, w1: 0.5 + rnd() * 0.5, w2: 0.4 + rnd() * 0.5, w3: 1 + rnd(), p1: rnd() * TAU, p2: rnd() * TAU, f: 9 + rnd() * 5, far: true });
    for (i = 0; i < NR; i++) br.push({ r: 6 + rnd() * 5, w: (0.35 + rnd() * 0.3) * (i % 2 ? 1 : -1), p: rnd() * TAU, h: 4.2 + rnd() * 2, f: 6 + rnd() * 3, cx: 0, cz: 0 });
    for (i = 0; i < NP; i++) pt.push({ x: rnd(), z: rnd(), y: rnd(), v: 0.3 + rnd() * 0.25, sw: rnd() * TAU, sp: rnd() * TAU, ci: i });
    for (i = 0; i < NS; i++) sm.push({ ph: i / NS });
    // fish (vertex-colored body + tail), shown only while jumping
    var body = new THREE.IcosahedronGeometry(0.1, 0); body.applyMatrix4(new THREE.Matrix4().makeScale(0.55, 0.8, 1.7));
    var tail = new THREE.ConeGeometry(0.07, 0.14, 4).toNonIndexed(); tail.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, -0.2));
    var pa = body.attributes.position.array, pb = tail.attributes.position.array, pos = [], col = [], c1 = new THREE.Color(0xb8d4e6), c2 = new THREE.Color(0xff9b50);
    for (i = 0; i < pa.length; i += 3) { pos.push(pa[i], pa[i + 1], pa[i + 2]); col.push(c1.r, c1.g, c1.b); }
    for (i = 0; i < pb.length; i += 3) { pos.push(pb[i], pb[i + 1], pb[i + 2]); col.push(c2.r, c2.g, c2.b); }
    fish = new THREE.Mesh(geo(pos, col), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    fish.name = 'amb_fish'; fish.visible = false; fish.frustumCulled = false; fish.raycast = function () {}; fish.rotation.order = 'YXZ';
    A.group.add(fish);
    G.Loop.onFrame(update, 12);
    return A.group;
  };

  function update(dt) {
    if (!A.enabled || !A.group) return;
    var indoors = G.Scenes.current !== 'outdoor', P = G.Player.pos, px = P.x, pz = P.z, hr = G.Time.hour, wx = G.Time.weather, se = season(), i, o, m;
    if (indoors) { A.group.visible = false; return; }
    A.group.visible = true; t += dt;
    var day = hr >= 6.3 && hr < 19.8, calm = wx !== 'rain' && wx !== 'snow';
    // light tint (ambient + sun, clamped)
    var u = R.uniforms; tint.copy(u.uAmbient.value).add(u.uLightColor.value);
    tint.r = Math.min(1, tint.r); tint.g = Math.min(1, tint.g); tint.b = Math.min(1, tint.b);
    for (m in meshes) meshes[m].material.color.copy(tint);
    if (fish) fish.material.color.copy(tint);

    // butterflies: spring/summer/autumn, daytime, no rain
    var cd = G.Perf ? G.Perf.density.critter : 1, pd = G.Perf ? G.Perf.density.particle : 1;   // Stage 14B tier density
    var nb = day && calm && se !== 'winter' ? Math.ceil(NB * cd) : 0;
    meshes.bf.visible = nb > 0; meshes.bf.count = nb;
    for (i = 0; i < nb; i++) {
      o = bf[i];
      if (o.far || Math.abs(o.hx - px) + Math.abs(o.hz - pz) > 22) { var g = groundNear(px, pz, 2, 11); o.hx = g[0]; o.hz = g[1]; o.far = false; }
      var x = o.hx + Math.sin(t * o.w1 + o.p1) * o.r, z = o.hz + Math.sin(t * o.w2 + o.p2) * o.r, y = 0.55 + 0.2 * Math.sin(t * o.w3 + o.p1);
      var vx = Math.cos(t * o.w1 + o.p1) * o.w1 * o.r, vz = Math.cos(t * o.w2 + o.p2) * o.w2 * o.r, fl = 0.25 + 0.75 * Math.abs(Math.sin(t * o.f + i));
      put(meshes.bf, i, x, y, z, Math.atan2(vx, vz), fl, 1, 1);
    }
    meshes.bf.instanceMatrix.needsUpdate = true;
    // birds circle high above the player
    var nr = day && calm && se !== 'winter' ? Math.ceil(NR * cd) : 0;
    meshes.br.visible = nr > 0; meshes.br.count = nr;
    for (i = 0; i < nr; i++) {
      o = br[i]; var a = o.p + t * o.w, bx = px + Math.cos(a) * o.r, bz = pz + Math.sin(a) * o.r, flap = 0.35 + 0.65 * Math.abs(Math.sin(t * o.f + i * 2));
      put(meshes.br, i, bx, o.h + Math.sin(t * 0.7 + i) * 0.3, bz, Math.atan2(-Math.sin(a) * o.w, Math.cos(a) * o.w), flap, 1, 1.2, Math.sin(t * o.f + i * 2) * 0.12);
    }
    meshes.br.instanceMatrix.needsUpdate = true;
    // petals (spring) / leaves (summer green, autumn warm); none in winter, rain or at night
    var np = day && calm && se !== 'winter' ? Math.ceil((se === 'summer' ? 12 : NP) * pd) : 0;
    meshes.pt.visible = np > 0; meshes.pt.count = np;
    if (se !== lastSeason && np) {
      lastSeason = se;
      setCols(meshes.pt, se === 'spring' ? [0xffb3c6, 0xffffff, 0xffd1dc] : se === 'summer' ? [0xa8d86b, 0x8cc85f] : [0xe8915d, 0xd9473f, 0xffd166, 0xc98b4f]);
    }
    var B = 15;
    for (i = 0; i < np; i++) {
      o = pt[i];
      var ox = ((o.x * B - px + t * 0.25) % B + B) % B - B / 2, oz = ((o.z * B - pz + t * 0.1) % B + B) % B - B / 2, oy = 5.5 - (((o.y * 5.5 + t * o.v) % 5.5 + 5.5) % 5.5);
      put(meshes.pt, i, px + ox + Math.sin(t + o.sw) * 0.4, oy, pz + oz, t * 1.5 + o.sp, 1, 1, 1, Math.sin(t * 2 + o.sw) * 0.8);
    }
    meshes.pt.instanceMatrix.needsUpdate = true;
    // chimney smoke
    var dh = G.Decor && G.Decor.house, ns = dh && Math.abs(dh.position.x - px) + Math.abs(dh.position.z - pz) < 30 ? NS : 0;
    meshes.sm.visible = ns > 0; meshes.sm.count = ns;
    for (i = 0; i < ns; i++) {
      o = sm[i]; var k = (t * 0.18 + o.ph) % 1, sc = k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
      put(meshes.sm, i, dh.position.x + 0.7 + k * 0.9 + Math.sin(k * 6 + i) * 0.08, 3.3 + k * 1.5, dh.position.z - 0.5, 0, sc * (0.5 + k * 1.1), sc * (0.5 + k * 1.1), sc * (0.5 + k * 1.1));
    }
    meshes.sm.instanceMatrix.needsUpdate = true;
    // jumping fish
    if (fk >= 0) {
      fk += dt / 0.8;
      if (fk >= 1) { fk = -1; fish.visible = false; if (G.FishingFx && G.FishingFx.splash) G.FishingFx.splash(fish.position.x, fish.position.z, 6, 0.5); if (G.Audio) G.Audio.playAt('splashS', fish.position.x, fish.position.z, { vol: 0.8 }); fishT = 7 + rnd() * 10; }
      else { fish.position.set(fish.userData.x + fish.userData.dx * fk, -0.05 + 0.85 * Math.sin(Math.PI * fk), fish.userData.z + fish.userData.dz * fk); fish.rotation.x = -Math.cos(Math.PI * fk) * 0.9; }
    } else if ((fishT -= dt) < 0 && se !== 'winter') {
      fishT = 3;
      for (i = 0; i < 16; i++) {
        var fa = rnd() * TAU, fd = 3 + rnd() * 8, fx = px + Math.cos(fa) * fd, fz = pz + Math.sin(fa) * fd;
        if (W.tileType(fx, fz) !== 'water' || W.tileType(fx + 1.5, fz) !== 'water' || W.tileType(fx, fz + 1.5) !== 'water') continue;
        var h = rnd() * TAU; fish.userData = { x: fx, z: fz, dx: Math.sin(h) * 0.9, dz: Math.cos(h) * 0.9 };
        fish.position.set(fx, -0.1, fz); fish.rotation.y = h; fish.visible = true; fk = 0; fishT = 7 + rnd() * 10;
        if (G.FishingFx && G.FishingFx.splash) G.FishingFx.splash(fx, fz, 5, 0.4);
        if (G.Audio) G.Audio.playAt('splashS', fx, fz, { vol: 0.5, pitch: 1.1 });
        break;
      }
    }
  }

  A.stats = function () { return { butterflies: meshes.bf ? meshes.bf.count : 0, birds: meshes.br ? meshes.br.count : 0, petals: meshes.pt ? meshes.pt.count : 0, smoke: meshes.sm ? meshes.sm.count : 0, fish: fk >= 0 }; };
  G.Ambient = A;
})();
