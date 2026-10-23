/* Togie Valley - town.js (Stage 2C)
 * Game.Town.build(): shop stall, workshop, fish hut, pier dressing, NPCs (shopkeeper, fishmonger).
 * Structures are fitted to the world footprints (tileType shop/workshop/stall) and counter/NPC markers.
 * Depends on THREE, Game.Render, Game.Models, Game.World, Game.Props.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.Props) { console.error('[town] missing deps'); return; }
  var R = G.Render, W = G.World, Mo = G.Models, Props = G.Props;
  var T = { group: null, npcs: {}, deckY: 0.1 }, npcList = [];
  var C = { wood: 0xc98b4f, dark: 0x8c5a34, roof: 0xe8715d, cream: 0xfff1d0, yellow: 0xffd166, iron: 0x5a4a52, iron2: 0x8a8590,
    water: 0x5ec4d6, deep: 0x3f9fc4, green: 0x7fcf7a, pink: 0xff9bb3, white: 0xffffff, red: 0xd9473f, brick: 0xb96a52, blue: 0x4f8fd6 };
  var GOODS = [C.pink, C.yellow, C.green, C.blue, 0xff9b50];

  /* ---- shape helpers (baked, vertex-colored parts) ---- */
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
  function add(L, g, c, x, y, z, rx, ry, rz, sx, sy, sz) {
    E.set(rx || 0, ry || 0, rz || 0);
    M4.compose(V.set(x, y, z), Q.setFromEuler(E), S.set(sx || 1, sy || 1, sz || 1));
    g.applyMatrix4(M4);
    L.push({ g: g.toNonIndexed(), c: new THREE.Color(c) });
  }
  function box(L, w, h, d, c, x, y, z, rx, ry, rz) { add(L, new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz); }
  function cyl(L, r, h, c, x, y, z) { add(L, new THREE.CylinderGeometry(r, r, h, 10), c, x, y, z); }
  function sph(L, r, c, x, y, z, sy) { add(L, new THREE.SphereGeometry(r, 10, 8), c, x, y, z, 0, 0, 0, 1, sy || 1, 1); }
  function merge(L) {
    var pos = [], nor = [], col = [], i, j, p, n, g;
    for (i = 0; i < L.length; i++) {
      g = L[i].g; p = g.attributes.position.array; n = g.attributes.normal.array;
      for (j = 0; j < p.length; j++) { pos.push(p[j]); nor.push(n[j]); }
      for (j = 0; j < p.length / 3; j++) col.push(L[i].c.r, L[i].c.g, L[i].c.b);
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    R.addSmoothNormals(out);
    return out;
  }
  function emit(L, name) {
    var m = new THREE.Mesh(merge(L), Mo.material('prop'));
    m.name = name; R.addOutline(m, false); T.group.add(m);
  }
  var SIGN_FONT = '"Baloo 2","Google Sans",sans-serif';
  function paintSign(cv, text, bg) {
    var c = cv.getContext('2d'), fs = 34;
    c.fillStyle = bg; c.fillRect(0, 0, 128, 48);
    c.strokeStyle = '#2b2024'; c.lineWidth = 5; c.strokeRect(2.5, 2.5, 123, 43);
    c.fillStyle = '#2b2024'; c.textAlign = 'center'; c.textBaseline = 'middle';
    do { c.font = '800 ' + fs + 'px ' + SIGN_FONT; fs -= 2; } while (fs > 10 && c.measureText(text).width > 108);   // fit text to the board
    c.fillText(text, 64, 27);
  }
  function signPlane(text, bg, x, y, z, w, h) {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
    paintSign(cv, text, bg);
    var tex = new THREE.CanvasTexture(cv);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z); m.name = 'sign_' + text; T.group.add(m);
    function redraw() { paintSign(cv, text, bg); tex.needsUpdate = true; }
    if (document.fonts && document.fonts.load) {   // draw again once the fonts are ready (fallback font is used until then)
      Promise.all([document.fonts.load('800 30px "Baloo 2"', text), document.fonts.load('700 30px "Google Sans"', text)]).then(redraw, redraw);
      if (document.fonts.ready) document.fonts.ready.then(redraw);
    }
  }

  /* ---- tile bbox of a footprint type ---- */
  function bbox(type) {
    var b = null, x, z;
    for (z = 0; z < W.H; z++) for (x = 0; x < W.W; x++) {
      if (W.tileType(x + 0.5, z + 0.5) !== type) continue;
      if (!b) b = { x0: x, z0: z, x1: x, z1: z };
      else { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z); }
    }
    return b;
  }

  /* ---- stall/hut: back block + facade, counter in front, open front (+z). o = style ---- */
  function stall(type, counterName, npcName, o) {
    var bb = bbox(type); if (!bb) return;
    var L = [], cm = W.getMarkers(counterName), nm = W.getMarkers(npcName)[0], i, x, y, w = bb.x1 - bb.x0 + 1;
    var x0 = bb.x0, x1 = bb.x1 + 1, z0 = bb.z0, cx = (x0 + x1) / 2, cz = bb.z1, nz = nm ? nm.tz + 0.5 : bb.z1 - 0.5;
    for (i = 0; i < cm.length; i++) cz = i ? Math.min(cz, cm[i].tz) : cm[i].tz;
    var dep = Math.max(0.4, nz - 0.55 - z0), fz = z0 + dep, h = o.h;
    box(L, w + 0.1, 0.15, dep + 0.1, C.dark, cx, 0.075, z0 + dep / 2);
    box(L, w, h, dep, o.wall, cx, h / 2, z0 + dep / 2);
    // roof
    if (o.kind === 'hut') {
      var half = w / 2 + 0.25, rise = 0.9, len = Math.sqrt(half * half + rise * rise), ang = Math.atan2(rise, half), zc = z0 + dep / 2;
      box(L, len, 0.12, dep + 0.5, o.roof, cx - half / 2, h + rise / 2, zc, 0, 0, ang);
      box(L, len, 0.12, dep + 0.5, o.roof, cx + half / 2, h + rise / 2, zc, 0, 0, -ang);
      var r = w / Math.sqrt(3), sz = rise / (1.5 * r);
      add(L, new THREE.CylinderGeometry(r, r, 0.1, 3), o.wall, cx, h + r * sz / 2, fz, -Math.PI / 2, 0, 0, 1, 1, sz);
      add(L, new THREE.CylinderGeometry(r, r, 0.1, 3), o.wall, cx, h + r * sz / 2, z0 + 0.05, -Math.PI / 2, 0, 0, 1, 1, sz);
      cyl(L, 0.07, 0.6, C.iron2, x1 - 0.5, h + 0.9, z0 + 0.4);
    } else {
      box(L, w + 0.5, 0.14, dep + 0.5, o.roof, cx, h + 0.07, z0 + dep / 2);
      if (o.kind === 'work') box(L, 0.4, 0.8, 0.4, C.brick, x1 - 0.6, h + 0.5, z0 + 0.4);
      // striped awning in front of the counter, posts at the front corners
      var az0 = cz + 0.35, az1 = cz + 1.6, tilt = Math.atan(0.3 / (az1 - az0));
      for (i = 0; i < w; i++) box(L, 1, 0.07, (az1 - az0) / Math.cos(tilt), o.awn[i % 2], x0 + i + 0.5, 2.0, (az0 + az1) / 2, tilt);
      cyl(L, 0.06, 1.9, C.dark, x0 + 0.1, 0.95, az1 - 0.1);
      cyl(L, 0.06, 1.9, C.dark, x1 - 0.1, 0.95, az1 - 0.1);
    }
    // counter (one block per marker tile) + goods
    for (i = 0; i < cm.length; i++) {
      x = cm[i].tx + 0.5; y = cm[i].tz + 0.5;
      box(L, 1, 0.78, 0.8, C.wood, x, 0.39, y);
      box(L, 1.1, 0.08, 0.95, C.dark, x, 0.82, y);
      if (i) continue;
      if (o.kind === 'shop') { box(L, 0.28, 0.22, 0.28, C.pink, x - 0.25, 0.97, y); cyl(L, 0.1, 0.2, C.yellow, x + 0.25, 0.96, y); }
      // fish hut: counter goods come from js/fish_stall.js (shared fish models)
      if (o.kind === 'work') { // anvil
        box(L, 0.3, 0.14, 0.22, C.iron, x, 0.93, y); box(L, 0.18, 0.14, 0.16, C.iron, x, 1.05, y); box(L, 0.5, 0.12, 0.24, C.iron2, x, 1.18, y);
        add(L, new THREE.ConeGeometry(0.1, 0.25, 6), C.iron2, x + 0.37, 1.18, y, 0, 0, -Math.PI / 2);
      }
    }
    // facade details
    var fy = fz + 0.05;
    if (o.kind === 'shop') for (var row = 0; row < 2; row++) {
      box(L, w - 0.5, 0.07, 0.25, C.dark, cx, 0.85 + row * 0.45, fy + 0.1);
      for (i = 0; i < Math.floor((w - 0.6) / 0.4); i++) box(L, 0.22, 0.2, 0.2, GOODS[(i + row * 2) % 5], x0 + 0.5 + i * 0.4, 0.98 + row * 0.45, fy + 0.1);
    }
    if (o.kind === 'work') { // tool rack: board, hammer, pickaxe, hoe
      box(L, 1.8, 0.8, 0.08, C.dark, cx, 1.1, fy + 0.04);
      for (i = -1; i <= 1; i++) box(L, 0.06, 0.55, 0.06, C.wood, cx + i * 0.55, 1.08, fy + 0.12);
      box(L, 0.24, 0.13, 0.13, C.iron2, cx - 0.55, 1.4, fy + 0.12);
      box(L, 0.44, 0.08, 0.08, C.iron2, cx, 1.38, fy + 0.12);
      box(L, 0.24, 0.07, 0.08, C.iron2, cx + 0.62, 1.34, fy + 0.12);
    }
    if (o.kind === 'hut') {
      var dx = cx - w * 0.2, wx = cx + w * 0.22;
      box(L, 0.62, 1.2, 0.08, C.dark, dx, 0.7, fy + 0.04);
      sph(L, 0.04, C.yellow, dx + 0.2, 0.7, fy + 0.1);
      box(L, 0.8, 0.7, 0.08, C.yellow, wx, 1.1, fy + 0.04);
      box(L, 0.64, 0.54, 0.1, C.water, wx, 1.1, fy + 0.05);
      box(L, 0.05, 0.54, 0.12, C.yellow, wx, 1.1, fy + 0.05);
      add(L, new THREE.TorusGeometry(0.17, 0.06, 6, 14), C.red, dx, 0.95, fy + 0.12);  // life ring
      for (i = 0; i < 4; i++) box(L, 0.1, 0.1, 0.1, C.white, dx + Math.cos(i * 1.571 + 0.785) * 0.17, 0.95 + Math.sin(i * 1.571 + 0.785) * 0.17, fy + 0.12, 0, 0, i * 1.571 + 0.785);
      signPlane(o.sign, o.bg, cx, 1.68, fy + 0.03, 1.0, 0.4);
    } else signPlane(o.sign, o.bg, cx, 1.9, fy + 0.03, Math.min(1.6, w - 0.4), 0.5);
    emit(L, 'town_' + type);
  }

  /* ---- pier dressing: posts along water edges, seat cushions ---- */
  function pier() {
    var L = [], seen = {}, dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]], x, z, i, d, e, DY = T.deckY;
    function t(tx, tz) { return W.tileType(tx + 0.5, tz + 0.5); }
    function post(px, pz) {
      var k = px + ',' + pz; if (seen[k] || (px + pz) % 2) return; seen[k] = 1;
      cyl(L, 0.1, 0.8, C.dark, px, DY + 0.1, pz); sph(L, 0.12, C.wood, px, DY + 0.5, pz, 0.8);
    }
    for (z = 0; z < W.H; z++) for (x = 0; x < W.W; x++) {
      if (t(x, z) !== 'pier') continue;
      for (i = 0; i < 4; i++) {
        d = dirs[i]; if (t(x + d[0], z + d[1]) !== 'water') continue;
        if (!d[0]) { e = z + (d[1] > 0 ? 1 : 0); post(x, e); post(x + 1, e); }
        else { e = x + (d[0] > 0 ? 1 : 0); post(e, z); post(e, z + 1); }
      }
    }
    emit(L, 'town_pier');
    // props (bench, lamp, barrel) on free pier tiles near the seats / hut
    var seats = W.getMarkers('seat'), sk = {}, hb = bbox('stall');
    if (!seats.length) return;
    seats.forEach(function (s) { sk[s.tx + ',' + s.tz] = 1; });
    var sz = seats[0].tz, mn = 1e9, mx = -1e9;
    seats.forEach(function (s) { mn = Math.min(mn, s.tx); mx = Math.max(mx, s.tx); });
    function put(name, c, ry) {
      for (var k = 0; k < c.length; k++) {
        if (t(c[k][0], c[k][1]) !== 'pier' || sk[c[k][0] + ',' + c[k][1]]) continue;
        var m = Props.make(name); m.position.set(c[k][0] + 0.5, DY, c[k][1] + 0.5); m.rotation.y = ry || 0; T.group.add(m); W.setBlocked(c[k][0], c[k][1], true); return;
      }
    }
    put('bench', [[mx + 2, sz], [mn - 2, sz], [mx + 2, sz - 1], [mn - 2, sz - 1]], 0);
    put('lamp', [[mx + 3, sz], [mn - 3, sz], [mx + 2, sz - 1], [mn - 2, sz - 1]], 0);
    if (hb) put('barrel', [[hb.x1 + 1, hb.z1], [hb.x1 + 1, hb.z1 + 1], [hb.x0 - 1, hb.z1], [hb.x0 - 1, hb.z1 + 1]], 0);
  }

  /* ---- NPCs ---- */
  function npc(marker, toward, o, cap) {
    var m = W.getMarkers(marker)[0]; if (!m) return null;
    var h = Mo.character(o), best = null, bd = 1e9;
    h.root.position.set(m.tx + 0.5, 0, m.tz + 0.5);
    W.getMarkers(toward).forEach(function (c) {
      var d = Math.abs(c.tx - m.tx) + Math.abs(c.tz - m.tz); if (d < bd) { bd = d; best = c; }
    });
    if (best && bd) h.root.rotation.y = Math.atan2(best.tx - m.tx, best.tz - m.tz);
    if (cap) {
      var L = [];
      sph(L, 0.3, C.blue, 0, 0.02, 0, 0.55); box(L, 0.34, 0.04, 0.22, 0x3b6fb0, 0, -0.02, 0.28);
      var cm = new THREE.Mesh(merge(L), Mo.material('prop')); R.addOutline(cm, true); h.attach.hat.add(cm);
    }
    T.group.add(h.root);
    var n = { h: h, w: -1, next: 2 + Math.random() * 4 }; npcList.push(n); return n;
  }
  function updateNpcs(dt) {
    for (var i = 0; i < npcList.length; i++) {
      var n = npcList[i], j = n.h.joints.shoulderR, e = 0;
      n.h.update(dt, 0);
      if (n.w < 0) { n.next -= dt; if (n.next <= 0) n.w = 0; continue; }
      n.w += dt; e = Math.max(0, Math.min(1, Math.min(n.w, 1.6 - n.w) * 4));
      j.rotation.x = -2.5 * e; j.rotation.z = Math.sin(n.w * 12) * 0.3 * e;
      if (n.w > 1.6) { n.w = -1; n.next = 5 + Math.random() * 6; }
    }
  }

  T.build = function () {
    if (T.group) return T.group;
    T.group = new THREE.Group(); T.group.name = 'town';
    stall('shop', 'shopCounter', 'shopkeeper', { kind: 'shop', h: 2.3, wall: C.cream, roof: C.roof, awn: [C.roof, C.cream], sign: 'CỬA HÀNG', bg: '#ffd166' });
    stall('workshop', 'workshopCounter', 'shopkeeper', { kind: 'work', h: 2.3, wall: 0xd9b58a, roof: C.dark, awn: [C.iron, C.wood], sign: 'XƯỞNG', bg: '#c4c8cd' });
    stall('stall', 'fishStall', 'fishmonger', { kind: 'hut', h: 2.0, wall: C.cream, roof: C.roof, sign: 'SẠP CÁ', bg: '#ffd166' });
    pier();
    T.npcs.shopkeeper = npc('shopkeeper', 'shopCounter', { skin: 0xf5cfa5, hair: 0x6b4a32, shirt: 0x7fcf7a, pants: C.dark, belt: C.cream, hat: 'straw', hairStyle: 'short' });
    T.npcs.fishmonger = npc('fishmonger', 'fishStall', { skin: 0xd9a077, hair: 0x3a3a4a, shirt: C.blue, pants: 0x3f5a8a, boots: 0x2b2024, hairStyle: 'short' }, true);
    if (G.TownLife) G.TownLife.build(T);   // Stage 15E2: planters, stacks, bunting, signs, evening lights, smoke
    if (G.Seat && G.Seat.build) G.Seat.build(T);   // Stage 16 D3: fishing stools + pier/shore dressing
    if (G.FishStall) G.FishStall.build(T);   // Stage 15E1: stall dressing, display fish, life
    R.scene.add(T.group);
    G.Loop.onFrame(updateNpcs, 10);
    return T.group;
  };

  G.Town = T;
})();
