/* Togie Valley - farm_fx.js (Stage 7): farming visuals. Game.FarmFx.
 * Instanced swaying crops (8 shape families x sprout/grown/ripe), soil mounds with animated wetting, sprinklers, particles
 * (dirt, water, leaves, sparkles), floating "+n" that flies to the hotbar, tool models + action animations on Player.playAction.
 * Replaces Farm's placeholder meshes (Farm.fx flag). Depends on THREE, Render, Models, Farm, Crops, Player, Inventory, Icons, UI.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.Farm || !G.Crops || !G.Player || !G.Inventory || !G.Icons || !G.UI || !G.Loop) { console.error('[farm_fx] missing dependencies'); return; }
  var R = G.Render, M = G.Models, F = G.Farm, Crops = G.Crops, P = G.Player, E = G.Events, Inv = G.Inventory, U = R.uniforms;
  var FX = { group: null };
  F.fx = true; G.FarmFx = FX;

  /* ------------------------------------------------------------ shared temps + helpers */
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
  var cA = new THREE.Color(), PALE = new THREE.Color(0xe6dc8a), BROWN = new THREE.Color(0x7b5a3a), SOIL_D = new THREE.Color(0x8c5a38), SOIL_W = new THREE.Color(0x4a2c1c);
  var timeU = { value: 0 }, clockT = 0, CAP = 170;
  function cm(x, y, z, rx, ry, rz, s) { _e.set(rx, ry, rz, 'YXZ'); _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(s, s, s)); }
  function pop(t) { if (t >= 1) return 1; if (t <= 0) return 0; t -= 1; return 1 + 2.7 * t * t * t + 1.7 * t * t; }
  function ss(t) { return t * t * (3 - 2 * t); }
  function ky(u, a) {
    if (u <= a[0]) return a[1];
    for (var i = 2; i < a.length; i += 2) if (u <= a[i]) return a[i - 1] + (a[i + 1] - a[i - 1]) * ss((u - a[i - 2]) / (a[i] - a[i - 2]));
    return a[a.length - 1];
  }
  function pt(g, c, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    var m = new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(_e),
      new THREE.Vector3(sx || 1, sy === undefined ? (sx || 1) : sy, sz === undefined ? (sx || 1) : sz));
    return { geo: g, color: c, matrix: m };
  }

  // Stage 15D D4: crop jiggle slots (x, z, age, amp) and the player brush slot (x, z, 0, amp), driven by js/world_react.js
  var jigU = { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, brU = { value: new THREE.Vector4() };
  FX.jig = jigU; FX.brush = brU;
  /* ------------------------------------------------------------ instanced material (decor-style sway + per-instance tint) */
  var VERT = [
    'attribute vec3 smoothNormal; attribute vec3 iCol; uniform float uTime, uSway, uW; uniform vec4 uJ[3]; uniform vec4 uBr;',
    'varying vec3 vN, vC, vP;',
    'void main(){',
    ' vec3 p = position;',
    '#ifdef OUTLINE',
    ' p += smoothNormal * uW;',
    '#endif',
    ' vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);',
    ' float k = uSway * max(position.y, 0.0);',
    ' w.x += sin(uTime * 1.6 + w.x * 0.7 + w.z * 0.5) * 0.06 * k;',
    ' w.z += cos(uTime * 1.3 + w.z * 0.6 + w.x * 0.4) * 0.04 * k;',
    ' for (int i = 0; i < 3; i++) { vec4 j = uJ[i]; if (j.w > 0.001) { vec2 dj = w.xz - j.xy; float rj = length(dj); w.xz += dj / (rj + 0.2) * (j.w * k * exp(-rj * 1.7) * exp(-j.z * 3.4) * sin(j.z * 24.0 - rj * 4.0) * 0.5); } }',
    ' if (uBr.w > 0.001) { vec2 db = w.xz - uBr.xy; float rb = length(db); w.xz += db / (rb + 0.1) * (uBr.w * k * smoothstep(1.0, 0.15, rb) * 0.5); }',
    ' vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vC = color * iCol; vP = w.xyz;',
    ' gl_Position = projectionMatrix * viewMatrix * w;',
    '}'].join('\n');
  var FRAG = [
    'uniform vec3 uLightDir, uLightColor, uAmbient, uFogColor, uInkColor; uniform vec2 uBands, uFogRange;',
    'varying vec3 vN, vC, vP;',
    'void main(){',
    ' vec3 col = uInkColor;',
    '#ifndef OUTLINE',
    ' float d = dot(normalize(vN), normalize(uLightDir));',
    ' float b = d > uBands.y ? 1.0 : (d > uBands.x ? 0.55 : 0.0);',
    ' col = vC * min(uAmbient + uLightColor * b, vec3(1.15));',
    '#endif',
    ' float f = smoothstep(uFogRange.x, uFogRange.y, length(vP - cameraPosition));',
    ' gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);',
    '}'].join('\n');
  function mat(sway, ol, w) {
    var u = { uTime: timeU, uSway: { value: sway }, uW: { value: w }, uJ: jigU, uBr: brU };
    ['uLightDir', 'uLightColor', 'uAmbient', 'uFogColor', 'uInkColor', 'uBands', 'uFogRange'].forEach(function (n) { u[n] = U[n]; });
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true,
      side: ol ? THREE.BackSide : THREE.FrontSide, defines: ol ? { OUTLINE: 1 } : {} });
  }
  // Instanced pair (fill + optional outline sharing the instance buffer). o.n = instances written this layout.
  function IM(name, geo, sway, ow) {
    var o = { geo: geo, n: 0, col: new Float32Array(CAP * 3), out: null };
    geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(o.col, 3).setUsage(THREE.DynamicDrawUsage));
    o.fill = new THREE.InstancedMesh(geo, mat(sway, false, 0), CAP);
    o.fill.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    o.fill.name = name; o.fill.frustumCulled = false; o.fill.raycast = function () {}; o.fill.count = 0; o.fill.visible = false;
    FX.group.add(o.fill);
    if (ow) {
      o.out = new THREE.InstancedMesh(geo, mat(sway, true, ow), CAP);
      o.out.instanceMatrix = o.fill.instanceMatrix;
      o.out.name = 'outline'; o.out.frustumCulled = false; o.out.raycast = function () {}; o.out.count = 0; o.out.visible = false;
      FX.group.add(o.out);
    }
    return o;
  }
  function put(o, col) {
    if (o.n >= CAP) return;
    o.fill.setMatrixAt(o.n, _m);
    var i = o.n * 3; o.col[i] = col.r; o.col[i + 1] = col.g; o.col[i + 2] = col.b; o.n++;
  }
  function flush(o) {
    o.fill.count = o.n; o.fill.visible = o.n > 0;
    if (o.out) { o.out.count = o.n; o.out.visible = o.n > 0; }
    o.fill.instanceMatrix.needsUpdate = true; o.geo.attributes.iCol.needsUpdate = true; o.n = 0;
  }

  /* ------------------------------------------------------------ crop geometry families (white vertex colors, tinted per instance) */
  var SPH = new THREE.SphereGeometry(1, 7, 5), CONE = new THREE.ConeGeometry(1, 1, 6), CYL = new THREE.CylinderGeometry(1, 1, 1, 6), BOX = new THREE.BoxGeometry(1, 1, 1);
  var W1 = 0xffffff, W2 = 0xdcdcdc, W3 = 0xbdbdbd, TAU = 6.2832;
  function ring(list, n, fn) { for (var i = 0; i < n; i++) list.push(fn(i, i / n * TAU)); }
  function family(name) {
    var b = [], f = [], sn = Math.sin, cs = Math.cos;
    switch (name) {
      case 'rosette':
        ring(b, 7, function (i, a) { return pt(SPH, i % 2 ? W1 : W2, sn(a) * 0.12, 0.1 + 0.04 * (i % 2), cs(a) * 0.12, -0.55, a, 0, 0.075, 0.03, 0.16); });
        f.push(pt(SPH, W1, 0, 0.17, 0, 0, 0, 0, 0.12, 0.1, 0.12)); break;
      case 'stalk':
        [-1, 0, 1].forEach(function (d) { b.push(pt(CYL, W2, d * 0.07, 0.25, 0, 0, 0, -d * 0.1, 0.018, 0.5, 0.018)); });
        ring(b, 4, function (i, a) { return pt(SPH, W1, sn(a) * 0.07, 0.14 + i * 0.08, cs(a) * 0.07, -0.6, a, 0, 0.04, 0.02, 0.1); });
        ring(f, 6, function (i, a) { return pt(SPH, W1, sn(a) * 0.07, 0.3 + 0.04 * (i % 3), cs(a) * 0.05, 0.2, a, 0, 0.03, 0.03, 0.08); }); break;
      case 'vine':
        b.push(pt(SPH, W1, 0, 0.16, 0, 0, 0, 0, 0.15, 0.13, 0.15), pt(SPH, W2, 0.1, 0.2, 0.05, 0, 0, 0, 0.1), pt(SPH, W2, -0.09, 0.22, -0.04, 0, 0, 0, 0.1), pt(SPH, W1, -0.02, 0.3, 0.04, 0, 0, 0, 0.09));
        ring(f, 7, function (i, a) { return pt(SPH, W1, sn(a) * 0.16, 0.14 + 0.05 * (i % 3), cs(a) * 0.16, 0, 0, 0, 0.045); }); break;
      case 'root':
        ring(b, 5, function (i, a) { return pt(CONE, i % 2 ? W1 : W2, sn(a) * 0.06, 0.17, cs(a) * 0.06, 0.35, a, 0, 0.05, 0.3, 0.05); });
        f.push(pt(SPH, W1, 0, 0.04, 0, 0, 0, 0, 0.1, 0.07, 0.1)); break;
      case 'bush':
        b.push(pt(CYL, W3, 0, 0.15, 0, 0, 0, 0, 0.02, 0.3, 0.02));
        ring(b, 6, function (i, a) { return pt(SPH, i % 2 ? W1 : W2, sn(a) * 0.09, 0.2 + 0.05 * (i % 3), cs(a) * 0.09, -0.9, a, 0, 0.07, 0.03, 0.14); });
        ring(f, 4, function (i, a) { return pt(SPH, W1, sn(a) * 0.1, 0.2 + 0.04 * (i % 2), cs(a) * 0.1, 0, 0, 0, 0.065); }); break;
      case 'flower':
        b.push(pt(CYL, W3, 0, 0.2, 0, 0, 0, 0, 0.014, 0.4, 0.014), pt(SPH, W1, 0, 0.42, 0, 0, 0, 0, 0.035),
          pt(SPH, W1, 0.05, 0.08, 0, -0.6, 1.57, 0, 0.04, 0.02, 0.1), pt(SPH, W2, -0.05, 0.08, 0, -0.6, -1.57, 0, 0.04, 0.02, 0.1));
        ring(f, 6, function (i, a) { return pt(SPH, W1, sn(a) * 0.07, 0.45, cs(a) * 0.07, 0, a, 0, 0.045, 0.02, 0.09); });
        f.push(pt(SPH, 0x806040, 0, 0.46, 0, 0, 0, 0, 0.05)); break;
      case 'tall':
        b.push(pt(CYL, W2, 0, 0.42, 0, 0, 0, 0, 0.035, 0.85, 0.035));
        ring(b, 5, function (i, a) { return pt(SPH, i % 2 ? W1 : W2, sn(a * 2.4) * 0.1, 0.25 + 0.12 * i, cs(a * 2.4) * 0.1, -0.5, a * 2.4, 0, 0.05, 0.02, 0.2); });
        f.push(pt(SPH, W1, 0.06, 0.5, 0.02, 0, 0, -0.2, 0.045, 0.1, 0.045), pt(SPH, W1, -0.06, 0.42, -0.02, 0, 0, 0.2, 0.045, 0.1, 0.045)); break;
      default: // ground
        ring(b, 5, function (i, a) { return pt(SPH, i % 2 ? W1 : W2, sn(a) * 0.2, 0.05, cs(a) * 0.2, -0.15, a, 0, 0.1, 0.025, 0.17); });
        f.push(pt(SPH, W1, 0, 0.16, 0, 0, 0, 0, 0.2, 0.17, 0.2), pt(CONE, W3, 0, 0.35, 0, 0, 0, 0, 0.035, 0.07, 0.035));
    }
    return { body: M.mergeParts(b), fruit: M.mergeParts(f) };
  }
  var FAM = { leafy: 'rosette', pod: 'stalk', wheat: 'stalk', berry: 'vine', grape: 'vine', longroot: 'root', tuber: 'root', bulb: 'root', roundroot: 'root',
    fruit: 'bush', longfruit: 'bush', flower: 'flower', corn: 'tall', gourd: 'ground' };
  var FAMS = ['rosette', 'stalk', 'vine', 'root', 'bush', 'flower', 'tall', 'ground'];
  var fm = {}, sprout, soil, spr, prt, glint, soilV = [];

  var cc = {};
  function green(c) { return c.g > c.r * 1.05 && c.g > c.b * 1.1; }
  function cinfo(id) {
    if (cc[id]) return cc[id];
    var d = Crops.get(id), a = new THREE.Color(d.c1), b = new THREE.Color(d.c2), leaf, prod = a;
    if (d.shape !== 'flower' && green(b)) leaf = b; else if (d.shape !== 'flower' && green(a)) { leaf = a; prod = b; } else leaf = new THREE.Color(0x79c75a);
    return (cc[id] = { leaf: leaf, prod: prod, fam: FAM[d.shape] || 'bush', d: d });
  }

  /* ------------------------------------------------------------ state + layout */
  var st = {}, recs = [], crs = [], sps = [], first = true, spray = 0, sprayPending = false, lastH0 = 0;
  function rebuild() {
    recs.length = 0; crs.length = 0; sps.length = 0;
    F.eachTile(function (ts) {
      var k = ts.tz * 64 + ts.tx, s = st[k], c = ts.c, ci;
      if (!s) s = st[k] = { wet: ts.w ? 1 : 0, born: first ? 9 : 0, cid: '', cage: 9, rage: 9, ripe: 0 };
      recs.push({ k: k, tx: ts.tx, tz: ts.tz, w: ts.w });
      if (c) {
        ci = cinfo(c.id);
        if (s.cid !== c.id) { s.cid = c.id; s.cage = first ? 9 : 0; s.ripe = 0; }
        if (c.ripe && !s.ripe) s.rage = first ? 9 : 0;
        s.ripe = c.ripe ? 1 : 0;
        crs.push({ k: k, tx: ts.tx, tz: ts.tz, ci: ci, p: c.ripe ? 1 : Math.min(1, c.g / ci.d.days), ripe: !!c.ripe, wilt: !!c.wilt,
          lean: ((k * 13) % 7 - 3) * 0.014, hungry: ts[ci.d.primary] < 25, dry: !ts.w && !c.ripe && !c.wilt, ry: (k * 2.399) % TAU, sv: 0.92 + ((k * 7) % 10) / 60 });
      } else s.cid = '';
    });
    F.eachSprinkler(function (q) { sps.push(q); });
    first = false; busy = true;
  }
  var busy = true;
  function layout(dt) {
    var i, r, s, o, n, sc, nb = false, sw = spray > 0, hh, ls, gy;
    for (i = 0; i < recs.length; i++) {
      r = recs[i]; s = st[r.k]; n = r.w ? 1 : 0; hh = ((r.k * 2654435761) >>> 0) / 4294967296;
      if (s.wet !== n) { s.wet += (n > s.wet ? 1 : -1) * Math.min(Math.abs(n - s.wet), dt * 2.2); nb = true; }
      if (s.born < 0.4) { s.born += dt; nb = true; }
      cm(r.tx + 0.5, 0, r.tz + 0.5, 0, hh * 7.3 % 1 > 0.5 ? Math.PI : 0, 0, 0.001 + pop(s.born / 0.3));   // F1: 3 mound variants, mirrored, tint jitter
      cA.copy(SOIL_D).lerp(SOIL_W, s.wet).multiplyScalar(0.93 + (hh * 13.7 % 1) * 0.14); put(soilV[Math.floor(hh * 3)], cA);
    }
    for (i = 0; i < crs.length; i++) {
      r = crs[i]; s = st[r.k];
      if (s.cage < 0.5) { s.cage += dt; nb = true; }
      if (s.rage < 0.5) { s.rage += dt; nb = true; }
      sc = r.sv * pop(s.cage / 0.4);
      cA.copy(r.ci.leaf);
      if (r.wilt) cA.copy(BROWN); else if (r.hungry) cA.lerp(PALE, 0.65);
      cA.offsetHSL(0, 0, ((r.k * 5) % 9 - 4) * 0.006);   // F1: per-plant leaf tint jitter
      ls = r.lean;
      if (r.p < 0.3 && !r.ripe) { cm(r.tx + 0.5, 0.02, r.tz + 0.5, (r.dry ? 0.3 : 0) + ls, r.ry, -ls, sc * (0.7 + r.p * 1.5)); put(sprout, cA); continue; }
      o = fm[r.ci.fam];
      cm(r.tx + 0.5, 0.02, r.tz + 0.5, (r.wilt ? 0.55 : (r.dry ? 0.3 : 0)) + ls, r.ry, (r.wilt ? 0.4 : (r.dry ? 0.12 : 0)) - ls * 0.7, sc * (r.wilt ? 0.85 : 0.45 + 0.55 * r.p));
      put(o.body, cA);
      if (r.ripe && !r.wilt) {
        cm(r.tx + 0.5, 0.02, r.tz + 0.5, 0, r.ry, 0, r.sv * pop(s.rage / 0.35));
        put(o.fruit, r.ci.prod);
        gy = GLY[r.ci.fam] || 0.6; cm(r.tx + 0.5, gy + Math.sin(r.k) * 0.04, r.tz + 0.5, 0, r.ry, 0, 1); put(glint, cA.set(0xffffff));   // F1: ready-to-harvest glint
      }
    }
    for (i = 0; i < sps.length; i++) {
      cm(sps[i].tx + 0.5, 0, sps[i].tz + 0.5, 0, sw ? clockT * 8 : 0, 0, 1);
      put(spr, sps[i].tier === 2 ? cA.set(0xd9b45a) : cA.set(0x8a98a8));
    }
    soilV.forEach(flush); flush(glint); flush(sprout); flush(spr);
    FAMS.forEach(function (f) { flush(fm[f].body); flush(fm[f].fruit); });
    busy = nb || sw;
  }

  /* F1: three tilled-soil looks (base slab, lighter ridges, darker furrow strips, clods, pebble); tinted per tile in layout() */
  var GLY = { tall: 1.2, stalk: 0.95, vine: 0.8, bush: 0.62, root: 0.5, rosette: 0.5, flower: 0.65, ground: 0.45 };
  function soilGeo(v) {
    var L = [pt(BOX, 0xdbdbdb, 0, 0.02, 0, 0, 0, 0, 0.92, 0.04, 0.92)], zs = v === 1 ? [-0.33, -0.11, 0.11, 0.33] : [-0.3, 0, 0.3], i, rr = v === 1 ? 0.08 : 0.11;
    zs.forEach(function (z, k) {
      L.push(pt(CYL, W1, v === 2 ? (k - 1) * 0.02 : 0, 0.045, z, 0, v === 2 ? (k - 1) * 0.07 : 0, 1.5708, rr, v === 1 ? 0.84 : (v === 2 ? 0.74 + k * 0.04 : 0.8), rr));
      if (k) L.push(pt(BOX, 0xa8a8a8, 0, 0.043, (z + zs[k - 1]) / 2, 0, 0, 0, 0.8, 0.012, 0.05));
    });
    if (v === 1) { L.push(pt(SPH, W2, -0.3, 0.08, 0.38, 0, 0.5, 0, 0.05, 0.03, 0.045)); L.push(pt(SPH, W3, 0.34, 0.075, -0.2, 0, 1, 0, 0.04, 0.03, 0.04)); }
    if (v === 2) {
      L.push(pt(SPH, W2, 0.3, 0.08, 0.42, 0, 0.2, 0, 0.055, 0.035, 0.05)); L.push(pt(SPH, W3, -0.38, 0.075, -0.1, 0, 0.9, 0, 0.04, 0.028, 0.045));
      L.push(pt(SPH, W2, 0.05, 0.075, -0.42, 0, 0.4, 0, 0.045, 0.03, 0.04)); L.push(pt(SPH, 0xf2f2f2, -0.1, 0.07, 0.2, 0, 0.1, 0, 0.032, 0.024, 0.03));
    }
    return M.mergeParts(L);
  }

  /* ------------------------------------------------------------ particles */
  var NP = 160, parts = [], pi = 0, TET = null;
  function free() {
    for (var i = 0; i < NP; i++) { pi = (pi + 1) % NP; if (!parts[pi].on) return parts[pi]; }
    return null;
  }
  function spawn(x, y, z, vx, vy, vz, c, size, g, life) {
    if (G.Perf && G.Perf.density.particle < 1 && Math.random() > G.Perf.density.particle) return;   // Stage 14B tier density
    var p = free(); if (!p) return;
    p.on = 1; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = size; p.g = g; p.l = p.m = life; p.sp = (Math.random() - 0.5) * 12; p.c.set(c);
  }
  function burst(x, y, z, n, c, sp, up, size, g, life) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.6);
      spawn(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, Math.cos(a) * v, up * (0.6 + Math.random() * 0.8), Math.sin(a) * v, c, size * (0.7 + Math.random() * 0.6), g, life * (0.7 + Math.random() * 0.5));
    }
  }
  function dirt(tx, tz, n) { burst(tx + 0.5, 0.08, tz + 0.5, n || 6, Math.random() < 0.5 ? 0x7a4a2b : 0x5a3520, 0.9, 1.7, 0.05, 7, 0.55); }
  function drops(tx, tz) {
    var i;
    for (i = 0; i < 4; i++) spawn(tx + 0.2 + Math.random() * 0.6, 0.75 + Math.random() * 0.2, tz + 0.2 + Math.random() * 0.6, 0, -0.5, 0, 0x6ec6ff, 0.035, 6, 0.32);
    burst(tx + 0.5, 0.06, tz + 0.5, 3, 0x9fdcff, 0.5, 1.1, 0.03, 7, 0.3);
  }
  function stepParts(dt) {
    var i, p, n = 0, t;
    for (i = 0; i < NP; i++) {
      p = parts[i]; if (!p.on) continue;
      p.l -= dt; if (p.l <= 0) { p.on = 0; continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03 && p.vy < 0) { p.y = 0.03; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; }
      t = p.m - p.l;
      cm(p.x, p.y, p.z, p.sp * t, p.sp * t * 0.7, 0, p.s * Math.min(1, p.l / (p.m * 0.4)));
      put(prt, p.c); n++;
    }
    if (n || prt.fill.count) flush(prt); else prt.n = 0;
  }

  /* ------------------------------------------------------------ floating "+n" that flies to the hotbar */
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function chip(id, n, x, z) {
    var sc = R.worldToScreen(_v.set(x, 0.6, z)); if (!sc || !sc.visible || !document.body.animate) return;
    var d = document.createElement('div'), i, tgt = G.UI.hud && G.UI.hud.menu, sl = Inv.container.slots, r, tx, ty, sx = sc.x - 20, sy = sc.y - 16;
    d.className = 'tv-fly'; d.innerHTML = G.Icons.item(id, 30) + '<b>+' + n + '</b>';
    for (i = 0; i < Inv.HOTBAR; i++) if (sl[i] && sl[i].id === id && G.UI.hud.hotbar.children[i]) { tgt = G.UI.hud.hotbar.children[i]; break; }
    document.body.appendChild(d);
    r = tgt ? tgt.getBoundingClientRect() : { left: sx, top: sy - 80, width: 0, height: 0 };
    tx = r.left + r.width / 2 - 20; ty = r.top + r.height / 2 - 16;
    var a = d.animate(calm ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }] : [
      { transform: 'translate(' + sx + 'px,' + sy + 'px) scale(.4)', opacity: 0, offset: 0 },
      { transform: 'translate(' + sx + 'px,' + (sy - 46) + 'px) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(' + sx + 'px,' + (sy - 52) + 'px) scale(1)', opacity: 1, offset: 0.42 },
      { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.45)', opacity: 0.25, offset: 1 }], { duration: calm ? 600 : 950, easing: 'ease-in-out' });
    a.onfinish = function () { if (d.parentNode) d.parentNode.removeChild(d); };
  }
  (function css() {
    var s = document.createElement('style');
    s.textContent = '.tv-fly{position:fixed;left:0;top:0;z-index:9;pointer-events:none;display:flex;align-items:center;gap:2px;font:800 18px var(--font-d,sans-serif);color:#fff;-webkit-text-stroke:4px var(--line,#5b3a29);paint-order:stroke fill;will-change:transform,opacity}.tv-fly .tvi{width:30px;height:30px}';
    document.head.appendChild(s);
  })();

  /* ------------------------------------------------------------ action hooks (clip system: js/anim_clips.js drives the poses) */
  // Effects queued by farm events wait for the clip's impact stage ('hit' / 'pop'); with no clip running they play on the next frame.
  var pend = [], pendS = [], qt = [], qf = [], well = null, wellT = 9, hold = false, lastHarvest = null;
  function later(t, fn) { qt.push(t); qf.push(fn); }
  function queue(stage, fn) { pend.push(fn); pendS.push(stage); }
  function clipOn() { return !!(G.AnimClips && G.AnimClips.active()); }
  FX.stage = function (stage) {
    var i, fn;
    for (i = 0; i < pend.length; i++) if (pendS[i] === stage) { fn = pend[i]; pend.splice(i, 1); pendS.splice(i, 1); i--; fn(); }
    if (stage === 'hit' && hold) { hold = false; rebuild(); }
  };
  FX.fx = { dirt: dirt, drops: drops, burst: burst, spawn: spawn, chip: chip };
  FX.onImpact = function (name, stage, info) {
    if (name === 'water' && stage === 'hit' && !F.tileAt(info.tx, info.tz)) { burst(info.tx + 0.5, 0.45, info.tz + 0.5, 12, 0x6ec6ff, 0.9, 2.4, 0.04, 8, 0.6); wellT = 0; }
    else if (name === 'till' && stage === 'hit') { burst(info.tx + 0.5, 0.1, info.tz + 0.5, 4, 0x6b4226, 1.3, 2.2, 0.075, 8, 0.6); }
    else if (name === 'fertilize' && stage === 'hit') burst(info.tx + 0.5, 0.5, info.tz + 0.5, 9, 0xc9a06a, 0.7, 0.8, 0.035, 6, 0.5);
    else if (name === 'plant' && stage === 'pat') dirt(info.tx, info.tz, 3);
  };
  var heldC = {};
  function bake(geo, c) {
    var g = geo.clone(), a = g.attributes.color, i;
    for (i = 0; i < a.count; i++) a.setXYZ(i, a.getX(i) * c.r, a.getY(i) * c.g, a.getZ(i) * c.b);
    return g;
  }
  /** Mesh of the crop held up after a harvest (family fruit + body tinted like the real crop), hidden, uniform scale. */
  function cat(gs) {
    var geo = new THREE.BufferGeometry(), names = ['position', 'normal', 'color', 'smoothNormal'], n = 0, i, j, k, arr, off;
    for (i = 0; i < gs.length; i++) n += gs[i].attributes.position.count;
    names.forEach(function (nm) {
      if (!gs[0].attributes[nm]) return;
      arr = new Float32Array(n * 3); off = 0;
      for (j = 0; j < gs.length; j++) { arr.set(gs[j].attributes[nm].array, off); off += gs[j].attributes[nm].array.length; }
      geo.setAttribute(nm, new THREE.BufferAttribute(arr, 3));
    });
    geo.computeBoundingSphere(); return geo;
  }
  FX.heldMesh = function (id) {
    if (heldC[id]) return heldC[id];
    var ci = cinfo(id), f = family(ci.fam), m = new THREE.Mesh(cat([bake(f.body, ci.leaf), bake(f.fruit, ci.prod)]), M.material('prop'));
    R.addOutline(m, true); m.visible = false; m.raycast = function () {};
    return (heldC[id] = m);
  };
  FX.lastHarvest = function () { return lastHarvest && clockT - lastHarvest.t < 0.4 ? lastHarvest.id : null; };

  /* ------------------------------------------------------------ farm events -> effects (queued, then timed to the tool impact) */
  E.on('soil:tilled', function (e) { queue('hit', function () { dirt(e.tx, e.tz, 8); }); });
  E.on('crop:planted', function (e) { queue('hit', function () { dirt(e.tx, e.tz, 5); }); });
  E.on('soil:watered', function (e) { queue('hit', function () { drops(e.tx, e.tz); }); });
  E.on('crop:cleared', function (e) { queue('hit', function () { dirt(e.tx, e.tz, 5); burst(e.tx + 0.5, 0.25, e.tz + 0.5, 6, 0x7b5a3a, 1, 2, 0.045, 5, 0.6); }); });
  E.on('crop:harvested', function (e) {
    var ci = cinfo(e.id);
    lastHarvest = { id: e.id, t: clockT };
    queue('hit', function () {
      burst(e.tx + 0.5, 0.3, e.tz + 0.5, 7, ci.leaf, 1.1, 2.4, 0.05, 6, 0.7);
      burst(e.tx + 0.5, 0.4, e.tz + 0.5, 5, 0xfff1a8, 0.9, 3, 0.04, 5, 0.6);
    });
    queue('pop', function () { chip(e.id, e.n, e.tx + 0.5, e.tz + 0.5); });
  });
  E.on('farm:changed', function () { hold = true; });
  E.on('save:loaded', function () { st = {}; first = true; });
  E.on('save:reset', function () { st = {}; first = true; });
  E.on('day:started', function () { sprayPending = sps.length > 0; });
  E.on('scene:changed', function (e) { if (e.to === 'outdoor' && sprayPending) { sprayPending = false; spray = 2.6; busy = true; } });

  /* ------------------------------------------------------------ build + frame loop */
  FX.build = function () {
    if (FX.group) return FX.group;
    if (!F.group) { console.error('[farm_fx] Farm.build() must run first'); return null; }
    FX.group = F.group;
    var i, f, g;
    soilV = [0, 1, 2].map(function (v) { return IM('soil_mounds' + v, soilGeo(v), 0, 0); });
    glint = IM('ripe_glint', M.mergeParts([pt(new THREE.OctahedronGeometry(1, 0), 0xfff3b0, 0, 0, 0, 0, 0, 0, 0.035, 0.06, 0.035)]), 8, 0);
    sprout = IM('crop_sprout', M.mergeParts([pt(CYL, W3, 0, 0.04, 0, 0, 0, 0, 0.012, 0.08, 0.012), pt(SPH, W1, 0.04, 0.09, 0, -0.5, 1.57, 0, 0.035, 0.015, 0.08), pt(SPH, W2, -0.04, 0.09, 0, -0.5, -1.57, 0, 0.035, 0.015, 0.08)]), 1.3, 0.012);
    for (i = 0; i < FAMS.length; i++) {
      g = family(FAMS[i]);
      fm[FAMS[i]] = { body: IM('crop_' + FAMS[i], g.body, 1.3, 0.016), fruit: IM('fruit_' + FAMS[i], g.fruit, 1.3, 0.014) };
    }
    spr = IM('sprinklers', M.mergeParts([pt(CYL, W2, 0, 0.05, 0, 0, 0, 0, 0.08, 0.1, 0.08), pt(CYL, W1, 0, 0.17, 0, 0, 0, 0, 0.03, 0.14, 0.03), pt(CYL, W1, 0, 0.27, 0, 0, 0, 0, 0.07, 0.04, 0.07),
      pt(BOX, W3, 0.08, 0.27, 0, 0, 0, 0, 0.06, 0.02, 0.02), pt(BOX, W3, -0.08, 0.27, 0, 0, 0, 0, 0.06, 0.02, 0.02)]), 0, 0.012);
    TET = new THREE.OctahedronGeometry(1, 0);
    prt = IM('farm_particles', M.mergeParts([pt(TET, W1, 0, 0, 0, 0, 0, 0, 1)]), 0, 0);
    for (i = 0; i < NP; i++) parts.push({ on: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.04, g: 6, l: 0, m: 1, sp: 0, c: new THREE.Color() });
    well = FX.group.getObjectByName('well');
    rebuild();
    G.Loop.onFrame(function (dt) {
      clockT += dt; timeU.value += dt;
      if (!FX.group.visible) return;
      var i;
      if (!clipOn()) { if (pend.length) { var pf = pend.slice(); pend.length = 0; pendS.length = 0; for (i = 0; i < pf.length; i++) pf[i](); } if (hold) { hold = false; rebuild(); } }
      for (i = qt.length - 1; i >= 0; i--) { qt[i] -= dt; if (qt[i] <= 0) { f = qf[i]; qt.splice(i, 1); qf.splice(i, 1); f(); } }
      if (spray > 0) {
        spray -= dt;
        for (i = 0; i < sps.length; i++) { var a = clockT * 5 + i * 1.57; spawn(sps[i].tx + 0.5, 0.3, sps[i].tz + 0.5, Math.cos(a) * 1.5, 2.3, Math.sin(a) * 1.5, 0x6ec6ff, 0.03, 9, 0.55); }
      }
      if (wellT < 0.4 && well) { wellT += dt; well.scale.setScalar(1 + 0.06 * Math.sin(wellT / 0.4 * 3.1416)); if (wellT >= 0.4) well.scale.setScalar(1); }
      if (busy) layout(dt);
      stepParts(dt);
    }, 101);
    return FX.group;
  };
})();
