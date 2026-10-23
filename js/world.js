/* Togie Valley - world.js (Stage 2A): ASCII terrain, collision, markers, interactables.
 * Depends on: THREE r128, core.js, render.js. No props/NPCs here.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.util) { console.error('[world] missing dependencies'); return; }
  var R = G.Render, U = G.util, cfg = G.Config;

  /* Legend: . grass  = path  t farm soil (core 8x6)  l locked plot (fenced, 14x10 total)  ~ water  p pier planks
   * H house  S shop  W workshop  F fish stall (footprints, blocked)
   * markers: D door  B bin  C shop counter  K workshop counter  M fish stall counter  s pier seat  n shopkeeper  m fishmonger */
  var MAP = G.WorldMap && G.WorldMap.rows;   // Stage 10.5: 90x60 map lives in world_map.js
  if (!MAP) { console.error('[world] missing Game.WorldMap'); return; }
  var W = MAP[0].length, H = MAP.length;

  // char -> [base tile type, marker name]; markers other than seats are blocked
  var CH = {
    '.': ['grass'], '=': ['path'], 't': ['soil'], 'l': ['locked'], '~': ['water'], 'p': ['pier'],
    'H': ['house'], 'S': ['shop'], 'W': ['workshop'], 'F': ['stall'],
    'D': ['house', 'door'], 'B': ['grass', 'bin'], 'C': ['shop', 'shopCounter'], 'K': ['workshop', 'workshopCounter'],
    ',': ['sand'], 'o': ['stone'],
    'M': ['stall', 'fishStall'], 's': ['pier', 'seat'], 'n': ['shop', 'shopkeeper'], 'm': ['stall', 'fishmonger']
  };
  // rank decides which side of a border gets the ink line (higher rank side); h = surface height
  var TY = {
    water: { rank: 0, h: -0.12 }, grass: { rank: 1, h: 0 }, house: { rank: 1, h: 0 },
    path: { rank: 2, h: 0 }, shop: { rank: 2, h: 0 }, workshop: { rank: 2, h: 0 }, stall: { rank: 2, h: 0 },
    sand: { rank: 1, h: 0 }, stone: { rank: 2, h: 0 }, soil: { rank: 3, h: 0 }, locked: { rank: 4, h: 0 }, pier: { rank: 5, h: 0.1 }
  };
  var WALKT = { grass: 1, path: 1, soil: 1, pier: 1, sand: 1, stone: 1 };
  var DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  var T = new Array(W * H), walk = new Uint8Array(W * H), blk = new Uint8Array(W * H), mk = new Uint8Array(W * H), markers = {}, IA = [], built = false;
  (function parse() {
    for (var z = 0; z < H; z++) for (var x = 0; x < W; x++) {
      var d = CH[MAP[z].charAt(x)] || CH['.'], i = z * W + x;
      T[i] = d[0];
      walk[i] = WALKT[d[0]] && (!d[1] || d[1] === 'seat') ? 1 : 0;
      mk[i] = d[1] && d[1] !== 'seat' ? 1 : 0;
      if (d[1]) (markers[d[1]] = markers[d[1]] || []).push({ tx: x, tz: z });
    }
  })();

  /* ---------------------------------------------------------- mesh helpers */
  function newB() { return { p: [], n: [], c: [] }; }
  function vert(b, x, y, z, nx, ny, nz, c) {
    b.p.push(x, y, z); b.n.push(nx, ny, nz);
    if (c) b.c.push(c.r, c.g, c.b);
  }
  function rect(b, x0, z0, x1, z1, y, c) {
    var q = [x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0];
    for (var i = 0; i < 12; i += 2) vert(b, q[i], y, q[i + 1], 0, 1, 0, c);
  }
  /* water quad with per-vertex shore distance (0 shore .. 1 deep) in the colour attribute (r) */
  var DEPTH = null;
  function depthGrid() {
    var w1 = W + 1, h1 = H + 1, d = new Float32Array(w1 * h1), q = [], i, x, z, big = 99;
    for (i = 0; i < d.length; i++) d[i] = big;
    for (z = 0; z <= H; z++) for (x = 0; x <= W; x++) {
      var land = false;
      for (var dz = -1; dz <= 0 && !land; dz++) for (var dx = -1; dx <= 0; dx++) {
        var tx = x + dx, tz = z + dz;
        if (tx >= 0 && tz >= 0 && tx < W && tz < H && T[tz * W + tx] !== 'water') { land = true; break; }
      }
      if (land) { d[z * w1 + x] = 0; q.push(z * w1 + x); }
    }
    for (i = 0; i < q.length; i++) {
      var c = q[i], cx = c % w1, cz = (c - cx) / w1, nd = d[c] + 1;
      if (nd > 6) continue;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) {
        var nx = cx + v[0], nz = cz + v[1];
        if (nx < 0 || nz < 0 || nx > W || nz > H || d[nz * w1 + nx] <= nd) return;
        d[nz * w1 + nx] = nd; q.push(nz * w1 + nx);
      });
    }
    for (i = 0; i < d.length; i++) d[i] = Math.min(1, d[i] / 6);
    return d;
  }
  function wrect(b, x0, z0, x1, z1, y) {
    var w1 = W + 1, q = [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]];
    for (var i = 0; i < 6; i++) vert(b, q[i][0], y, q[i][1], 0, 1, 0, { r: DEPTH[q[i][1] * w1 + q[i][0]], g: 0, b: 0 });
  }
  function wall(b, x0, z0, x1, z1, yt, yb, nx, nz, c) {
    var dx = x1 - x0, dz = z1 - z0, ok = (-dz * nx + dx * nz) > 0;
    var A = [x0, yb, z0], B = [x1, yb, z1], C = [x1, yt, z1], D = [x0, yt, z0];
    var o = ok ? [A, B, C, A, C, D] : [A, C, B, A, D, C];
    for (var i = 0; i < 6; i++) vert(b, o[i][0], o[i][1], o[i][2], nx, 0, nz, c);
  }
  function geo(b) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    if (b.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    g.computeBoundingSphere();
    return g;
  }
  function mesh(b, mat, name) {
    var m = new THREE.Mesh(geo(b), mat);
    m.name = name; m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }
  function gh(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function gn(x, z) {   // value noise 0..1 (soft grass patches)
    var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = gh(xi, zi), b = gh(xi + 1, zi), c = gh(xi, zi + 1), d = gh(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function grassHex(x, z, r) { var n = gn(x * 0.22, z * 0.22) * 0.65 + gn(x * 0.7 + 9, z * 0.7) * 0.35; return n < 0.36 ? 0x8cc85f : n > 0.62 ? 0xa9dc78 : (r < 0.15 ? 0x92cc63 : 0x9bd36a); }
  var PL = [0xc98b4f, 0xbd7f45, 0xd49a5c, 0xb87642, 0xcf9254];
  function planks(b, x, z, y, r) {   // 4 narrow planks per tile (tone varies) separated by dark seams
    for (var i = 0; i < 4; i++) {
      var px = x + i * 0.25, c = C(PL[Math.floor(gh(x * 4 + i, z) * 5)]);
      rect(b, px, z, px + 0.225, z + 1, y, c); rect(b, px + 0.225, z, px + 0.25, z + 1, y, C(0x7a4a2b));
    }
  }
  var colCache = {};
  function C(hex) { return colCache[hex] || (colCache[hex] = new THREE.Color(hex)); }

  function waterMaterial() {
    var U2 = R.uniforms;
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uLite: { value: 0 }, uWater: { value: C(0x5ec4d6) }, uDeep: { value: C(0x3f9fc4) }, uFoam: { value: C(0xb4ecf4) }, uShallow: { value: C(0x8fdde0) }, uAbyss: { value: C(0x2f86b3) },
        uAmbient: U2.uAmbient, uLightColor: U2.uLightColor, uFogColor: U2.uFogColor, uFogRange: U2.uFogRange
      },
      vertexShader: 'attribute vec3 color; varying vec3 vW; varying float vD; varying float vK;\nvoid main(){ vK = color.r; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: [
        'uniform float uTime, uLite; uniform vec3 uWater, uDeep, uFoam, uShallow, uAbyss, uAmbient, uLightColor, uFogColor; uniform vec2 uFogRange;',
        'varying vec3 vW; varying float vD; varying float vK;',
        'void main(){',
        '  vec2 p = vW.xz; float t = uTime;',
        '  vec2 fd = vec2(0.92, 0.39);                         // flow direction (xz)',
        '  float along = dot(p, fd), across = p.y*fd.x - p.x*fd.y;',
        '  float wob = sin(along*0.6 - t*0.45 + across*0.8);   // shared domain warp',
        '  // smooth depth gradient: shallow -> mid -> deep -> abyss',
        '  vec3 c = mix(uShallow, uWater, smoothstep(0.0, 0.35, vK));',
        '  c = mix(c, uDeep, smoothstep(0.3, 0.7, vK) * 0.7);',
        '  c = mix(c, uAbyss, smoothstep(0.6, 1.0, vK));',
        '  // thin soft ridge lines drifting downstream',
        '  float r1 = pow(1.0 - abs(sin(across*2.1 + wob*1.3 + along*0.35 - t*0.6)), 10.0);',
        '  c = mix(c, uFoam, r1 * 0.2 * smoothstep(0.08, 0.4, vK));',
        '  vec3 sky = vec3(1.0, 0.98, 0.9);',
        '  if (uLite < 0.5) {',
        '    float r2 = pow(1.0 - abs(sin(across*3.4 - wob*1.1 + along*0.5 - t*0.85)), 14.0);',
        '    c = mix(c, uFoam, r2 * 0.14 * smoothstep(0.08, 0.4, vK));',
        '    // long soft sun/sky streaks along the flow, stronger toward the horizon',
        '    vec3 vdir = normalize(cameraPosition - vW);',
        '    float hz = pow(1.0 - clamp(vdir.y, 0.0, 1.0), 1.5);',
        '    float st = smoothstep(0.55, 0.97, sin(across*2.6 + wob*1.5)) * smoothstep(-0.1, 0.8, sin(along*0.33 - t*0.3 + 1.7));',
        '    c = mix(c, sky, st * (0.18 + 0.5*hz) * smoothstep(0.15, 0.5, vK));',
        '  }',
        '  // soft wobbling shoreline foam band + a faint drifting second line',
        '  float edge = 0.15 + 0.05*sin(p.x*2.3 + p.y*1.9 + t*1.3);',
        '  float band = (1.0 - smoothstep(0.0, edge, vK)) * (0.7 + 0.3*sin(p.x*3.0 + p.y*2.6 + t*1.2));',
        '  c = mix(c, uFoam, band * 0.85);',
        '  if (uLite < 0.5) {',
        '    float e2 = edge + 0.09 + 0.03*wob; float d2 = (vK - e2) / 0.022;',
        '    c = mix(c, uFoam, exp(-d2*d2) * 0.35 * smoothstep(0.0, 0.1, vK));',
        '  }',
        '  c *= uAmbient + uLightColor;',
        '  c = mix(c, uFogColor, smoothstep(uFogRange.x, uFogRange.y, vD));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
  }

  /* ----------------------------------------------------------------- build */
  var World = { W: W, H: H, group: null, meshes: {} };

  function generate() {
    var rng = U.rng(5), bg = newB(), bd = newB(), bp = newB(), bw = newB(), bb = newB(), bi = newB();
    var names = ['n', 'e', 's', 'w'], x, z, k;
    DEPTH = depthGrid();
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      var t = T[z * W + x], ty = TY[t], h = ty.h, r = rng();
      if (t === 'water') wrect(bw, x, z, x + 1, z + 1, h);
      else if (t === 'pier') planks(bp, x, z, h, r);
      else if (t === 'grass' || t === 'house') rect(bg, x, z, x + 1, z + 1, h, C(grassHex(x, z, r)));
      else rect(bd, x, z, x + 1, z + 1, h, C(t === 'path' ? (r < 0.2 ? 0xdfbb84 : 0xe6c48f) : t === 'sand' ? (r < 0.25 ? 0xf0dc9a : 0xf5e6ae) : t === 'stone' ? (((x + z) % 2) ? 0xc9c2b4 : 0xd6cfc1) : t === 'soil' ? 0x8a5a3b :
        t === 'locked' ? (r < 0.25 ? 0xc08555 : 0xc98f5a) : 0xd9b485));
      if (t === 'water') continue;
      for (k = 0; k < 4; k++) {
        var dv = DIRS[names[k]], nx = x + dv[0], nz = z + dv[1];
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        var nt = TY[T[nz * W + nx]];
        var x0 = x + (k === 1 ? 1 : 0), z0 = z + (k === 2 ? 1 : 0), x1 = k === 0 || k === 2 ? x0 + 1 : x0, z1 = k === 1 || k === 3 ? z0 + 1 : z0;
        if (nt.h < h - 0.001) wall(bb, x0, z0, x1, z1, h, nt.h, dv[0], dv[1], C(t === 'pier' ? 0x8c5a34 : t === 'sand' ? 0xd2b878 : t === 'stone' ? 0xa8a193 : 0xc98f5a));
        if (ty.rank > nt.rank) {   // ink line inset inside this tile along the border
          var w = 0.06, y = h + 0.012;
          rect(bi, k === 3 ? x : x0 - (k === 1 ? w : 0), k === 0 ? z : z0 - (k === 2 ? w : 0),
            k === 1 ? x + 1 : (k === 3 ? x + w : x1), k === 2 ? z + 1 : (k === 0 ? z + w : z1), y);
        }
      }
    }
    return { grass: bg, ground: bd, pier: bp, bank: bb, water: bw, ink: bi };
  }

  World.build = function () {
    if (built) return World.group;
    built = true;
    var k, B = generate();
    var tm = function (s) { return R.toonMaterial({ color: 0xffffff, seasonal: s }); };
    var ink = new THREE.MeshBasicMaterial({ color: cfg.render.inkColor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var wm = waterMaterial(), grp = new THREE.Group();
    grp.name = 'world';
    var ms = { grass: mesh(B.grass, tm(1), 'grass'), ground: mesh(B.ground, tm(0), 'ground'), pier: mesh(B.pier, tm(0), 'pier'),
      bank: mesh(B.bank, tm(0), 'bank'), water: mesh(B.water, wm, 'water'), ink: mesh(B.ink, ink, 'ink') };
    for (k in ms) { grp.add(ms[k]); ms[k].raycast = function () {}; }
    World.meshes = ms; World.group = grp; World.waterMat = wm;
    R.scene.add(grp);
    function setLite() { wm.uniforms.uLite.value = G.Quality && G.Quality.level() >= 2 ? 1 : 0; }
    setLite(); G.Events.on('quality:changed', setLite);   // Thap / Sieu nhe use the cheaper water
    G.Loop.onFrame(function (dt) { wm.uniforms.uTime.value += dt; });
    registerMarkers();
    return grp;
  };

  /* ------------------------------------------------------------------- API */
  function idx(tx, tz) { return tx < 0 || tz < 0 || tx >= W || tz >= H ? -1 : tz * W + tx; }
  World.tileType = function (x, z) { var i = idx(U.tileOf(x), U.tileOf(z)); return i < 0 ? null : T[i]; };
  World.isWalkableTile = function (tx, tz) { var i = idx(tx, tz); return i >= 0 && walk[i] === 1 && !blk[i]; };
  World.isWalkable = function (x, z) { return World.isWalkableTile(U.tileOf(x), U.tileOf(z)); };
  World.getMarkers = function (name) { return (markers[name] || []).map(function (m) { return { tx: m.tx, tz: m.tz }; }); };

  /* ---- Stage 6: dynamic tiles ---- */
  // Locked-plot expansions (inclusive rects x0,z0,x1,z1), unlocked by permits (Stage 8).
  var PLOTS = [[21, 11, 26, 16], [13, 8, 20, 10], [13, 17, 26, 17], [21, 8, 26, 10]], plotOn = [false, false, false, false];
  World.PLOTS = PLOTS;
  World.rebake = function () {
    if (!built) return;
    var B = generate(), k;
    for (k in B) { var m = World.meshes[k], g = geo(B[k]); m.geometry.dispose(); m.geometry = g; }
  };
  /* Change a tile type (rebuilds the ground meshes unless defer is true; then call World.rebake()). */
  World.setTile = function (tx, tz, type, defer) {
    var i = idx(tx, tz);
    if (i < 0 || !TY[type]) return false;
    T[i] = type;
    walk[i] = WALKT[type] && !mk[i] ? 1 : 0;
    if (!defer) World.rebake();
    return true;
  };
  /* Extra collision on a walkable tile (props). */
  World.setBlocked = function (tx, tz, blocked) { var i = idx(tx, tz); if (i >= 0) blk[i] = blocked ? 1 : 0; };
  World.isBlocked = function (tx, tz) { var i = idx(tx, tz); return i >= 0 && blk[i] === 1; };
  World.isPlotUnlocked = function (n) { return !!plotOn[n - 1]; };
  World.unlockedPlots = function () { var o = []; plotOn.forEach(function (v, i) { if (v) o.push(i + 1); }); return o; };
  /* Set exactly which plots (1..4) are unlocked (used by load/new game). */
  World.setPlots = function (list) {
    var changed = false;
    PLOTS.forEach(function (r, n) {
      var want = list.indexOf(n + 1) >= 0;
      if (want === plotOn[n]) return;
      plotOn[n] = want; changed = true;
      for (var z = r[1]; z <= r[3]; z++) for (var x = r[0]; x <= r[2]; x++) World.setTile(x, z, want ? 'soil' : 'locked', true);
    });
    if (changed) { World.rebake(); G.Events.emit('world:plotsChanged', { plots: World.unlockedPlots() }); }
    return changed;
  };
  World.unlockPlot = function (n) {
    if (!PLOTS[n - 1] || plotOn[n - 1]) return false;
    var l = World.unlockedPlots(); l.push(n);
    return World.setPlots(l);
  };

  World.registerInteractable = function (d) {
    if (!d || !d.id || !d.tile) { console.error('[world] interactable needs id and tile'); return null; }
    var f = d.facing || 'n', dv = DIRS[f] || DIRS.n;
    var o = { id: d.id, type: d.type || 'misc', tile: { tx: d.tile.tx, tz: d.tile.tz }, facing: f, hint: d.hint || '',
      stand: d.stand ? { tx: d.stand.tx, tz: d.stand.tz } : { tx: d.tile.tx - dv[0], tz: d.tile.tz - dv[1] } };
    for (var i = 0; i < IA.length; i++) if (IA[i].id === o.id) { IA[i] = o; return o; }
    IA.push(o);
    return o;
  };
  World.listInteractables = function (type) { return IA.filter(function (a) { return !type || a.type === type; }); };

  function registerMarkers() {
    var one = [['door', 'door', 'Vào nhà'], ['bin', 'bin', 'Thùng bán đồ'], ['shopCounter', 'shop', 'Cửa hàng'],
      ['workshopCounter', 'workshop', 'Nâng cấp dụng cụ'], ['fishStall', 'fishstall', 'Bán cá']];
    one.forEach(function (m) {
      World.getMarkers(m[0]).forEach(function (t, i) {
        World.registerInteractable({ id: m[1] + (i ? i : ''), type: m[1], tile: t, facing: 'n', hint: m[2] });
      });
    });
    World.getMarkers('seat').forEach(function (t, i) {   // player sits on the seat tile, facing the water
      World.registerInteractable({ id: 'seat' + (i + 1), type: 'seat', tile: t, facing: t.tz < 18 ? 'n' : 's', stand: t, hint: 'Ngồi câu cá' });
    });
  }

  G.World = World;
})();
