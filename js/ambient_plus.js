/* Togie Valley - ambient_plus.js (Stage 15F2b): extra living ambience on top of ambient.js (which keeps its butterflies, birds, petals, smoke, fish).
 * Fireflies at night around the shore + shrine tree (spring-autumn, dry), dragonflies by the water on summer/autumn days, a few butterflies that
 * rest on flowers (hive / shrine / field border), koi that jump on the lake with ripple rings (busier at dawn/dusk and in drizzle, none in winter),
 * rain puddles on paths/grass with ripples (grow while it rains, dry slowly, frozen away by snow), seasonal ground litter (petals / leaves / red leaves)
 * and an occasional wind gust that carries a few leaves past the player. Every effect is ONE InstancedMesh draw call (MeshBasic, light-tinted),
 * pooled, distance gated, no per-frame allocations, 30 Hz on tiers >= 2.
 * Quality: fireflies/dragonflies/butterflies/fish scale with critter density and are OFF on tier 3 (Siêu nhẹ); puddles + litter scale with
 * particle density (tier 3 keeps a few); gust leaves only on tiers 0-1.
 * API: Game.AmbientPlus {build(), group, enabled, layout, stats()}. Added draw calls: 9. Frame priority 12.2.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.World || !G.Scenery || !G.Loop || !G.Player || !G.Time || !G.WorldMap) { console.error('[ambient_plus] missing deps'); return; }
  var R = G.Render, W = G.World, U = G.util, AP = G.AmbientPlus = { group: null, enabled: true }, PI = Math.PI, TAU = PI * 2;

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    nf: 16, nd: 4, nb: 4, nj: 2, np: 24, nr: 10, nl: 44, ng: 10,
    litter: [[6.5, 18.5, 3.2], [11.4, 14, 2.6], [28.2, 14, 2.6], [31.5, 11.5, 3]],
    perch: [[6, 19.6], [12.4, 11.6], [11.3, 16.2], [28.2, 12.2], [28.2, 16.2], [10, 22.4], [8.6, 21.2]]
  };
  /*LAYOUT-END*/
  AP.layout = LAYOUT;

  var rnd = U.rng(80808), Pl = G.Player, tint = new THREE.Color(1, 1, 1);
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
  var M = {}, built = false, t = 0, acc = 0, wet = 0, lastWet = -1, lastPick = -9, lastSeason = '', gustT = 18, gustK = -1;
  var ax = [], az = [];                       // shore anchors (land next to water)
  var ff = [], dr = [], bf = [], fish = [], rings = [], pud = [], rip = [], lit = [], gl = [];
  var sel = [], selD = [], nsel = 0, spots = [], gustDir = 0;
  var rows = G.WorldMap.rows, MH = rows.length, MW = rows[0].length;

  function season() { var s = G.Time.season; return typeof s === 'number' ? ['spring', 'summer', 'autumn', 'winter'][s] : s; }
  function rainAmt() { return G.Weather ? G.Weather.rain || 0 : (G.Time.weather === 'rain' ? 1 : 0); }
  function snowAmt() { return G.Weather ? G.Weather.snow || 0 : (G.Time.weather === 'snow' ? 1 : 0); }
  function tier() { return G.Quality && G.Quality.level ? G.Quality.level() : 0; }
  function dens(k) { return G.Perf && G.Perf.density ? G.Perf.density[k] : 1; }
  function ss(a, b, x) { return U.smoothstep(a, b, x); }
  function typ(x, z) { return W.tileType(x, z); }
  function waterOK(x, z, m) { return typ(x, z) === 'water' && typ(x + m, z) === 'water' && typ(x - m, z) === 'water' && typ(x, z + m) === 'water' && typ(x, z - m) === 'water'; }
  function hash(a, b) { var s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

  function geo(tris, cols) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    if (cols) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  function inst(g, n, name, mat) {
    var m = new THREE.InstancedMesh(g, mat || new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), n);
    m.name = name; m.frustumCulled = false; m.raycast = function () {}; m.count = 0; m.visible = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (var i = 0; i < n; i++) m.setColorAt(i, C.set(0xffffff));
    AP.group.add(m);
    return m;
  }
  function setCols(m, list) { for (var i = 0; i < m.instanceColor.count; i++) m.setColorAt(i, C.set(list[i % list.length])); m.instanceColor.needsUpdate = true; }
  function put(m, i, x, y, z, ry, sx, sy, sz, rz) {
    E.set(0, ry, rz || 0, 'YXZ'); Q.setFromEuler(E);
    M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)); m.setMatrixAt(i, M4);
  }
  function lightTint() {
    var u = R.uniforms; tint.copy(u.uAmbient.value).add(u.uLightColor.value);
    tint.r = Math.min(1, tint.r); tint.g = Math.min(1, tint.g); tint.b = Math.min(1, tint.b);
  }
  function pickAnchor(o, px, pz, r0, r1) {   // fills o.ax/o.az with a shore anchor 'r0..r1' tiles from the player
    var i, k, d;
    for (i = 0; i < 10; i++) {
      k = Math.floor(rnd() * ax.length); d = Math.abs(ax[k] - px) + Math.abs(az[k] - pz);
      if (d >= r0 && d <= r1) { o.ax = ax[k]; o.az = az[k]; return true; }
    }
    return false;
  }

  /* ------------------------------------------------------------ geometry */
  function dragonGeo() {
    var p = [], c = [], i, L = 0.17, w = 0.014;
    function quad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, col) {
      p.push(x0, y0, z0, x1, y1, z1, x2, y2, z2, x0, y0, z0, x2, y2, z2, x3, y3, z3);
      for (var j = 0; j < 6; j++) c.push(col[0], col[1], col[2]);
    }
    quad(-w, 0, -L * 1.4, w, 0, -L * 1.4, w, 0, L * 0.6, -w, 0, L * 0.6, [1, 1, 1]);     // long body (flat ribbon)
    quad(0, -w, -L * 1.4, 0, w, -L * 1.4, 0, w, L * 0.6, 0, -w, L * 0.6, [0.85, 0.85, 0.85]);
    for (i = -1; i <= 1; i += 2) {   // two wing pairs
      quad(0, 0.004, L * 0.25, i * 0.2, 0.01, L * 0.35, i * 0.19, 0.01, L * 0.12, 0, 0.004, L * 0.1, [0.93, 0.97, 1]);
      quad(0, 0.004, L * 0.05, i * 0.19, 0.01, L * 0.12, i * 0.17, 0.01, -L * 0.1, 0, 0.004, -L * 0.1, [0.9, 0.95, 1]);
    }
    return geo(p, c);
  }
  function fishGeo() {
    var body = new THREE.IcosahedronGeometry(0.1, 0), i, pa, pb, pos = [], col = [];
    body.applyMatrix4(new THREE.Matrix4().makeScale(0.6, 0.85, 1.8));
    var tail = new THREE.ConeGeometry(0.07, 0.15, 4).toNonIndexed(); tail.applyMatrix4(new THREE.Matrix4().makeRotationX(PI / 2).setPosition(0, 0, -0.22));
    body = body.toNonIndexed(); pa = body.attributes.position.array; pb = tail.attributes.position.array;
    for (i = 0; i < pa.length; i += 3) { pos.push(pa[i], pa[i + 1], pa[i + 2]); col.push(1, 1, 1); }
    for (i = 0; i < pb.length; i += 3) { pos.push(pb[i], pb[i + 1], pb[i + 2]); col.push(0.82, 0.82, 0.82); }
    return geo(pos, col);
  }

  /* ------------------------------------------------------------ fireflies */
  function updFireflies(dt, k, calm, px, pz) {
    var n = k > 0.02 && calm ? Math.ceil(LAYOUT.nf * dens('critter')) : 0, m = M.ff, i, o, x, z, y, b;
    m.visible = n > 0; m.count = n;
    if (!n) return;
    for (i = 0; i < n; i++) {
      o = ff[i];
      if (o.far || Math.abs(o.ax - px) + Math.abs(o.az - pz) > 24) { if (pickAnchor(o, px, pz, 3, 15)) o.far = false; else { put(m, i, 0, -9, 0, 0, 0, 0, 0); continue; } }
      x = o.ax + Math.sin(t * o.w1 + o.p1) * o.r; z = o.az + Math.sin(t * o.w2 + o.p2) * o.r;
      y = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * o.w3 + o.p1));
      b = Math.sin(t * o.bw + o.p2);
      put(m, i, x, y, z, 0, k * (0.2 + 0.8 * (b > 0 ? b : 0)), k * (0.2 + 0.8 * (b > 0 ? b : 0)), k * (0.2 + 0.8 * (b > 0 ? b : 0)));
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ dragonflies */
  function updDragons(dt, on, px, pz) {
    var n = on ? Math.ceil(LAYOUT.nd * dens('critter')) : 0, m = M.dr, i, o, e, k, hd, y;
    m.visible = n > 0; m.count = n;
    if (!n) return;
    for (i = 0; i < n; i++) {
      o = dr[i];
      if (o.far || Math.abs(o.ax - px) + Math.abs(o.az - pz) > 26) {
        if (pickAnchor(o, px, pz, 4, 16)) { o.far = false; o.x = o.ax; o.z = o.az; o.y = 0.6; o.st = 0; o.tm = 0.5 + rnd(); } else { put(m, i, 0, -9, 0, 0, 0, 0, 0); continue; }
      }
      o.tm -= dt;
      if (o.st === 0) {   // hover
        if (o.tm <= 0) {
          o.sx = o.x; o.sz = o.z; o.sy = o.y; o.tx = o.ax + (rnd() - 0.5) * 5.2; o.tz = o.az + (rnd() - 0.5) * 5.2; o.ty = 0.45 + rnd() * 0.55;
          o.st = 1; o.dur = 0.35 + rnd() * 0.3; o.tm = o.dur; o.hd = Math.atan2(o.tx - o.sx, o.tz - o.sz);
        }
      } else {
        k = 1 - o.tm / o.dur; k = k < 0 ? 0 : k > 1 ? 1 : k; e = k * k * (3 - 2 * k);
        o.x = o.sx + (o.tx - o.sx) * e; o.z = o.sz + (o.tz - o.sz) * e; o.y = o.sy + (o.ty - o.sy) * e;
        if (o.tm <= 0) { o.st = 0; o.tm = 0.8 + rnd() * 1.8; }
      }
      y = o.y + Math.sin(t * 7 + i) * 0.02;
      put(m, i, o.x, y, o.z, o.hd, 0.45 + 0.55 * Math.abs(Math.sin(t * 52 + i * 3)), 1, 1, o.st ? -0.12 : 0);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ butterflies resting on flowers */
  function updPerched(dt, on, px, pz) {
    var n = on ? Math.ceil(LAYOUT.nb * dens('critter')) : 0, m = M.bf, i, o, k, e, x, y, z, fl, near = 0;
    m.visible = n > 0; m.count = n;
    if (!n) return;
    for (i = 0; i < n; i++) {
      o = bf[i]; o.tm -= dt;
      if (o.st === 0) {   // rest, wings slowly open and close
        if (o.tm <= 0) { o.st = 1; o.dur = 1.8 + rnd() * 1.6; o.tm = o.dur; o.from = o.at; o.at = (o.at + 1 + Math.floor(rnd() * (spots.length - 1))) % spots.length; }
        fl = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 2));
        put(m, i, spots[o.at][0], 0.24, spots[o.at][1], o.hd, fl, 1, 1);
      } else {
        k = 1 - o.tm / o.dur; k = k < 0 ? 0 : k > 1 ? 1 : k; e = k * k * (3 - 2 * k);
        x = spots[o.from][0] + (spots[o.at][0] - spots[o.from][0]) * e + Math.sin(k * 14 + i) * 0.18;
        z = spots[o.from][1] + (spots[o.at][1] - spots[o.from][1]) * e + Math.cos(k * 11 + i) * 0.18;
        y = 0.24 + Math.sin(PI * k) * 0.55 + Math.sin(t * 5 + i) * 0.05;
        o.hd = Math.atan2(spots[o.at][0] - spots[o.from][0], spots[o.at][1] - spots[o.from][1]);
        put(m, i, x, y, z, o.hd, 0.25 + 0.75 * Math.abs(Math.sin(t * 13 + i)), 1, 1);
        if (o.tm <= 0) { o.st = 0; o.tm = 2 + rnd() * 4; }
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ jumping koi + ripple rings */
  function ring(x, z) {
    for (var i = 0; i < rings.length; i++) if (rings[i].k >= 1) { rings[i].k = 0; rings[i].x = x; rings[i].z = z; return; }
  }
  function updFish(dt, on, rainy, px, pz, hr) {
    var nj = on ? (tier() >= 2 ? 1 : LAYOUT.nj) : 0, i, o, k, a, d, x, z, h, busy, any = false, r;
    M.fish.visible = nj > 0; M.fish.count = nj;
    for (i = 0; i < nj; i++) {
      o = fish[i];
      if (o.k >= 0) {   // airborne
        o.k += dt / 0.9; k = o.k;
        if (k >= 1) {
          o.k = -1; put(M.fish, i, 0, -9, 0, 0, 0, 0, 0); ring(o.x + o.dx, o.z + o.dz);
          if (G.FishingFx && G.FishingFx.splash) G.FishingFx.splash(o.x + o.dx, o.z + o.dz, 5, 0.4);
          if (G.Audio && G.Audio.playAt) G.Audio.playAt('splashS', o.x + o.dx, o.z + o.dz, { vol: 0.45, pitch: 0.95 + rnd() * 0.2 });
          busy = (hr < 8.2 || (hr > 17 && hr < 19.5)) ? 0.45 : 1;
          o.cd = (11 + rnd() * 12) * busy * (rainy ? 0.6 : 1);
        } else {
          E.set(-Math.cos(PI * k) * 0.9, o.hd, 0, 'YXZ'); Q.setFromEuler(E);
          M4.compose(V.set(o.x + o.dx * k, -0.1 + 0.8 * Math.sin(PI * k), o.z + o.dz * k), Q, S.set(1, 1, 1)); M.fish.setMatrixAt(i, M4);
          any = true;
        }
      } else if ((o.cd -= dt) < 0) {
        o.cd = 2;
        for (a = 0; a < 14; a++) {
          r = rnd() * TAU; d = 3 + rnd() * 10; x = px + Math.cos(r) * d; z = pz + Math.sin(r) * d;
          if (!waterOK(x, z, 1.2)) continue;
          h = rnd() * TAU; o.hd = h; o.x = x; o.z = z; o.dx = Math.sin(h) * 1; o.dz = Math.cos(h) * 1; o.k = 0;
          M.fish.setColorAt(i, C.set([0xff9b50, 0xfff1d0, 0xb8d4e6, 0xf2c04a][Math.floor(rnd() * 4)])); M.fish.instanceColor.needsUpdate = true;
          ring(x, z); if (G.Audio && G.Audio.playAt) G.Audio.playAt('splashS', x, z, { vol: 0.3, pitch: 1.15 });
          break;
        }
      }
    }
    if (nj) M.fish.instanceMatrix.needsUpdate = true;
    // ripple rings (also finish after the fish are gone)
    var live = 0;
    for (i = 0; i < rings.length; i++) {
      o = rings[i];
      if (o.k < 1) {
        o.k += dt / 1.2; live++;
        if (o.k >= 1) put(M.rg, i, 0, -9, 0, 0, 0, 0, 0);
        else { k = o.k; d = (0.25 + 1.9 * (1 - (1 - k) * (1 - k))) * (1 - k * k * k); put(M.rg, i, o.x, -0.095, o.z, 0, d, 1, d); }
      } else put(M.rg, i, 0, -9, 0, 0, 0, 0, 0);
    }
    M.rg.visible = live > 0; M.rg.count = rings.length; if (live) M.rg.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ puddles */
  function updPuddles(dt, px, pz) {
    var rn = rainAmt(), sn = snowAmt(), m = M.pu, n, i, j, o, d, c, k, s, cyc, want;
    if (sn > 0.1) wet = Math.max(0, wet - dt / 18);
    else if (rn > 0.15) wet = Math.min(1, wet + rn * dt / 25);
    else wet = Math.max(0, wet - dt / 150);
    if (wet < 0.02) { m.visible = false; M.pr.visible = false; lastWet = -1; return; }
    n = Math.min(LAYOUT.np, Math.ceil(LAYOUT.np * dens('particle')));
    if (t - lastPick > 0.6 || lastWet < 0) {   // keep the n nearest candidates
      lastPick = t; nsel = 0;
      for (i = 0; i < pud.length; i++) {
        d = (pud[i].x - px) * (pud[i].x - px) + (pud[i].z - pz) * (pud[i].z - pz);
        if (d > 576) continue;
        j = nsel < n ? nsel++ : (d < selD[n - 1] ? n - 1 : -1);
        if (j < 0) continue;
        while (j > 0 && selD[j - 1] > d) { sel[j] = sel[j - 1]; selD[j] = selD[j - 1]; j--; }
        sel[j] = i; selD[j] = d;
      }
      lastWet = -2;
    }
    lightTint(); m.material.color.copy(tint); M.pr.material.color.copy(tint);
    m.visible = nsel > 0; m.count = nsel;
    if (Math.abs(wet - lastWet) > 0.01) {
      lastWet = wet; k = Math.sqrt(wet);
      for (i = 0; i < nsel; i++) { o = pud[sel[i]]; put(m, i, o.x, 0.035, o.z, o.ry, o.sx * k, 1, o.sz * k); }
      m.instanceMatrix.needsUpdate = true;
    }
    want = rn > 0.3 ? Math.min(LAYOUT.nr, nsel) : 0;
    M.pr.visible = want > 0; M.pr.count = want;
    for (i = 0; i < want; i++) {
      o = pud[sel[i]]; c = t * 0.85 + i * 0.37; cyc = Math.floor(c); k = c - cyc;
      s = o.sx * Math.sqrt(wet) * (0.15 + 0.5 * k) * (k < 0.92 ? 1 : 0.0001);
      put(M.pr, i, o.x + (hash(cyc, i) - 0.5) * o.sx * 0.45, 0.045, o.z + (hash(i, cyc) - 0.5) * o.sz * 0.45, 0, s, 1, s);
    }
    if (want) M.pr.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ seasonal litter + wind gust */
  var LEAF_COL = { spring: [0xffb3c6, 0xffffff, 0xffd1dc], summer: [0x8cc85f, 0xa8d86b], autumn: [0xe8915d, 0xd9473f, 0xffd166, 0xc98b4f], winter: [0xffffff] };
  function updLitter(se, px, pz) {
    var n = se === 'winter' || snowAmt() > 0.2 ? 0 : Math.ceil(LAYOUT.nl * dens('particle') * (se === 'summer' ? 0.4 : 1)), m = M.lt;
    m.visible = n > 0; m.count = n;
    if (n && se !== lastSeason) { lastSeason = se; setCols(m, LEAF_COL[se]); }
  }
  function updGust(dt, se, calm, px, pz) {
    var m = M.gl, n, i, o, k, a, s;
    if (tier() >= 2 || !calm || (se !== 'autumn' && se !== 'spring')) { m.visible = false; gustK = -1; return; }
    n = Math.ceil(LAYOUT.ng * dens('particle'));
    if (gustK < 0) {
      if ((gustT -= dt) > 0) { m.visible = false; return; }
      gustT = 22 + rnd() * 25; gustK = 0; gustDir = rnd() * TAU;
      for (i = 0; i < gl.length; i++) { gl[i].off = rnd() * 0.9; gl[i].sx = (rnd() - 0.5) * 9; gl[i].sz = (rnd() - 0.5) * 7; gl[i].y = 0.5 + rnd() * 1.2; gl[i].sp = rnd() * TAU; }
      setCols(m, LEAF_COL[se]);
    }
    gustK += dt / 6.5;
    if (gustK >= 1) { gustK = -1; m.visible = false; return; }
    m.visible = true; m.count = n;
    var ux = Math.sin(gustDir), uz = Math.cos(gustDir);
    for (i = 0; i < n; i++) {
      o = gl[i]; k = gustK - o.off * 0.2; if (k < 0) k = 0;
      a = (k * 2 - 1) * 8;   // travels from -8 to +8 tiles along the wind
      s = Math.sin(k * 9 + o.sp);
      put(m, i, px + o.sx + ux * a + -uz * s * 0.7, o.y + k * 0.4 + Math.sin(k * 14 + o.sp) * 0.25, pz + o.sz + uz * a + ux * s * 0.7, k * 12 + o.sp, 1, 1, 1, Math.sin(k * 16 + o.sp) * 1.1);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ frame */
  function update(dt) {
    var tr, px, pz, hr, se, day, calm, k, rainy, a;
    if (!AP.group) return;
    if (!AP.enabled || G.Scenes.current !== 'outdoor') { AP.group.visible = false; return; }
    AP.group.visible = true; tr = tier();
    acc += dt;
    if (tr >= 2 && acc < 1 / 30) return;
    dt = Math.min(acc, 0.1); acc = 0; t += dt;
    px = Pl.pos.x; pz = Pl.pos.z; hr = G.Time.hour; se = season();
    rainy = rainAmt() > 0.2; calm = !rainy && snowAmt() < 0.1;
    day = hr >= 6.8 && hr < 18.2 && calm;
    lightTint();
    M.lt.material.color.copy(tint); M.gl.material.color.copy(tint); M.dr.material.color.copy(tint); M.bf.material.color.copy(tint); M.fish.material.color.copy(tint); M.rg.material.color.copy(tint);
    // night amount for fireflies: fades in at dusk, out at dawn
    k = hr >= 12 ? ss(19.3, 20.2, hr) : 1 - ss(5, 6, hr);
    var crit = tr < 3 && se !== 'winter';
    updFireflies(dt, crit ? k : 0, calm, px, pz);
    updDragons(dt, crit && day && (se === 'summer' || se === 'autumn'), px, pz);
    updPerched(dt, crit && day && se !== 'winter', px, pz);
    updFish(dt, crit && se !== 'winter', rainy, px, pz, hr);
    updPuddles(dt, px, pz);
    updLitter(se, px, pz);
    updGust(dt, se, calm, px, pz);
  }

  AP.stats = function () {
    return { fireflies: M.ff ? M.ff.count : 0, dragonflies: M.dr ? M.dr.count : 0, butterflies: M.bf ? M.bf.count : 0, fish: M.fish ? M.fish.count : 0,
      puddles: M.pu ? M.pu.count : 0, litter: M.lt ? M.lt.count : 0, wet: wet, anchors: ax.length, draws: 9 };
  };

  /* ------------------------------------------------------------ build */
  function flatOK(x, z) { var tp = typ(x, z); return tp === 'grass' || tp === 'path' || tp === 'sand'; }
  AP.build = function () {
    var i, j, x, z, tx, tz, tp, a, d, o, L = LAYOUT, c, mat;
    if (built) return AP.group;
    built = true;
    AP.group = new THREE.Group(); AP.group.name = 'ambient_plus'; G.Scenery.group.add(AP.group);
    // shore anchors: grass/sand tiles with water on a 4-neighbour, plus the shrine tree
    for (tz = 0; tz < MH; tz++) for (tx = 0; tx < MW; tx++) {
      tp = typ(tx + 0.5, tz + 0.5);
      if ((tp === 'grass' || tp === 'sand') && (typ(tx + 1.5, tz + 0.5) === 'water' || typ(tx - 0.5, tz + 0.5) === 'water' || typ(tx + 0.5, tz + 1.5) === 'water' || typ(tx + 0.5, tz - 0.5) === 'water')) { ax.push(tx + 0.5); az.push(tz + 0.5); }
    }
    for (i = 0; i < 3; i++) { ax.push(6.5 + (i - 1) * 1.2); az.push(18.5); }
    // geometry + instanced meshes
    M.ff = inst(new THREE.IcosahedronGeometry(0.05, 0), L.nf, 'ap_fireflies', new THREE.MeshBasicMaterial({ color: 0xf3e684, fog: false })); M.ff.visible = false;
    M.dr = inst(dragonGeo(), L.nd, 'ap_dragonflies', new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false })); setCols(M.dr, [0x4f9fd6, 0x4fc1b0, 0xe8604d, 0x7fc15f]);
    var wing = [0, 0, -0.04, 0.16, 0, -0.12, 0.14, 0, 0.05, 0, 0, -0.04, 0.14, 0, 0.05, 0.03, 0, 0.1], bw = [];
    for (i = 0; i < wing.length; i += 3) bw.push(wing[i], wing[i + 1], wing[i + 2]);
    for (i = 0; i < wing.length; i += 3) bw.push(-wing[i], wing[i + 1], wing[i + 2]);
    M.bf = inst(geo(bw), L.nb, 'ap_butterflies'); setCols(M.bf, [0xffd166, 0xc9a7ff, 0xff9bb3, 0x9fd3e6]);
    M.fish = inst(fishGeo(), L.nj, 'ap_fish', new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    var rg = new THREE.RingGeometry(0.22, 0.3, 18); rg.rotateX(-PI / 2);
    M.rg = inst(rg, 6, 'ap_rings', new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false }));
    var pc = new THREE.CircleGeometry(0.5, 14); pc.rotateX(-PI / 2);
    mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.58, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.pu = inst(pc, L.np, 'ap_puddles', mat); setCols(M.pu, [0x86b9d4]);
    var pr = new THREE.RingGeometry(0.38, 0.5, 14); pr.rotateX(-PI / 2);
    M.pr = inst(pr, L.nr, 'ap_puddle_ripples', new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    var leaf = [0, 0, -0.07, 0.045, 0, 0, 0, 0, 0.07, 0, 0, -0.07, 0, 0, 0.07, -0.045, 0, 0];
    M.lt = inst(geo(leaf), L.nl, 'ap_litter'); M.gl = inst(geo(leaf), L.ng, 'ap_gust_leaves');
    M.lt.material.polygonOffset = true; M.lt.material.polygonOffsetFactor = -2; M.lt.material.polygonOffsetUnits = -2;
    // states
    for (i = 0; i < L.nf; i++) ff.push({ ax: 0, az: 0, far: true, r: 0.8 + rnd() * 1.4, w1: 0.4 + rnd() * 0.5, w2: 0.35 + rnd() * 0.5, w3: 0.6 + rnd() * 0.8, bw: 1.6 + rnd() * 1.6, p1: rnd() * TAU, p2: rnd() * TAU });
    for (i = 0; i < L.nd; i++) dr.push({ ax: 0, az: 0, far: true, x: 0, y: 0.6, z: 0, sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, st: 0, tm: rnd() * 2, dur: 0.4, hd: rnd() * TAU });
    for (i = 0; i < L.perch.length; i++) if (flatOK(L.perch[i][0], L.perch[i][1])) spots.push(L.perch[i]);
    if (spots.length < 2) spots.push([8, 20], [9, 21]);
    for (i = 0; i < L.nb; i++) bf.push({ at: i % spots.length, from: 0, st: 0, tm: rnd() * 4, dur: 2, hd: rnd() * TAU });
    for (i = 0; i < L.nj; i++) fish.push({ k: -1, cd: 3 + rnd() * 6, x: 0, z: 0, dx: 0, dz: 0, hd: 0 });
    for (i = 0; i < 6; i++) rings.push({ k: 1, x: 0, z: 0 });
    for (i = 0; i < L.ng; i++) gl.push({ off: 0, sx: 0, sz: 0, y: 1, sp: 0 });
    // puddle candidates: paths, grass beside paths, a little sand
    for (tz = 0; tz < MH && pud.length < 160; tz++) for (tx = 0; tx < MW && pud.length < 160; tx++) {
      tp = typ(tx + 0.5, tz + 0.5); c = false;
      if (tp === 'path') c = rnd() < 0.1;
      else if (tp === 'grass' && (typ(tx + 1.5, tz + 0.5) === 'path' || typ(tx - 0.5, tz + 0.5) === 'path' || typ(tx + 0.5, tz + 1.5) === 'path' || typ(tx + 0.5, tz - 0.5) === 'path')) c = rnd() < 0.06;
      else if (tp === 'sand') c = rnd() < 0.02;
      if (!c) continue;
      d = 0.5 + rnd() * 0.6;
      o = { x: tx + 0.25 + rnd() * 0.5, z: tz + 0.25 + rnd() * 0.5, sx: d, sz: d * (0.6 + rnd() * 0.3), ry: rnd() * PI };
      if (flatOK(o.x, o.z)) pud.push(o);
    }
    for (i = 0; i < L.np; i++) { sel.push(0); selD.push(0); }
    // static litter (interleaved over the anchors so thinning stays uniform)
    for (i = 0; i < L.nl; i++) {
      a = L.litter[i % L.litter.length]; x = a[0]; z = a[1];
      for (j = 0; j < 10; j++) {
        d = rnd() * TAU; o = 0.3 + Math.sqrt(rnd()) * a[2];
        x = a[0] + Math.cos(d) * o; z = a[1] + Math.sin(d) * o;
        if (flatOK(x, z) && W.isWalkableTile(Math.floor(x), Math.floor(z))) break;
        x = a[0]; z = a[1];
      }
      put(M.lt, i, x, 0.03, z, rnd() * TAU, 0.8 + rnd() * 0.6, 1, 0.8 + rnd() * 0.6, (rnd() - 0.5) * 0.3);
    }
    M.lt.instanceMatrix.needsUpdate = true;
    G.Loop.onFrame(update, 12.2);
    return AP.group;
  };
})();
