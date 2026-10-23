/* Togie Valley - fish_stall.js (Stage 15E1): the fish stall ("SẠP CÁ") dressing + life. Game.FishStall.
 * Called by Town.build() after the hut + fishmonger exist: FishStall.build(Town). Adds into Town.group:
 *  - one static merged mesh (awning stripes, posts, ice crate, basket, buckets, tray, scale, lantern, floats, price-board frame),
 *  - display fish (ice crate / tray / basket / bucket) rebuilt from the species the player recently put in the fish crate,
 *  - swaying hanging fish under the awning, fluttering awning fringe, a bucket fish that flops, a price blackboard (canvas, Vietnamese),
 *  - a seagull (perch / hop / fly off / return), dripping water, flies (quality gated), seller reactions (interact:fishstall + idle arranging).
 * All animation runs in one Loop.onFrame (priority 10.5, after the NPC idle update at 10), no per-frame allocation, distance + quality gated.
 * Meshes added: 2 static + 2 fringe + 2 display + 2 hang + 2 flop + 1 board + 1 drops + 1 flies (+2 gull body, +4 wings while it flies) <= 15 calls.
 * Depends on THREE, Render, Models, World, Town, FishModels.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.FishModels) { console.error('[fish_stall] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, FM = G.FishModels, E = G.Events, U = G.util;
  var FS = G.FishStall = { group: null, ids: [], layout: null };

  /* Pure layout data (world units; fish stall footprint = tiles 44..46 x 14..16). tools/check.js parses this block and verifies it against the map:
   * every rect must lie inside the stall footprint (blocked tiles) minus the seller tile and the counter tile; the player stands at the tile below the counter. */
  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    inside: {
      iceCrate: [44.15, 16.2, 44.85, 16.64], basket: [44.2, 16.66, 44.5, 16.96], floats: [44.2, 16.03, 44.8, 16.17],
      bucketA: [46.18, 16.22, 46.58, 16.62], bucketB: [46.58, 16.54, 46.9, 16.86],
      postBackL: [44.03, 16.33, 44.13, 16.43], postBackR: [46.87, 16.33, 46.97, 16.43],
      counterTray: [44.98, 16.25, 45.62, 16.65], counterScale: [45.75, 16.48, 45.89, 16.62]
    },
    outside: { postFrontL: [44.03, 17.15, 44.13, 17.25], postFrontR: [46.87, 17.15, 46.97, 17.25], board: [44.13, 17.12, 44.97, 17.16], hang: [45.97, 17.12, 46.83, 17.16] }
  };
  /*LAYOUT-END*/
  FS.layout = LAYOUT;

  var C = { wood: 0xc98b4f, dark: 0x8c5a34, cream: 0xfff1d0, teal: 0x4fb3c8, red: 0xd9473f, white: 0xffffff, ice: 0xdff3fb, ice2: 0xbfe6f4, iron: 0x5a4a52, iron2: 0x8a8590,
    water: 0x7fd3e6, tan: 0xd8c28a, yellow: 0xffd166, board: 0x2f4a3f, blue: 0x4f8fd6, tin: 0xe8715d };
  var DEFAULT_IDS = ['carp', 'snakehead', 'perch', 'tilapia', 'tra', 'koi', 'catfish', 'eel'];
  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), SPH = new THREE.SphereGeometry(0.5, 8, 6), CONE = new THREE.ConeGeometry(0.5, 1, 5);
  var rnd = U.rng(1507);

  function bx(L, w, h, d, c, x, y, z, rx, ry, rz) { L.push(Mo.part(BOX, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [w, h, d])); }
  function cy(L, r, h, c, x, y, z, rx, ry, rz) { L.push(Mo.part(CYL, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [r * 2, h, r * 2])); }
  function sp(L, r, c, x, y, z, sx, sy, sz) { L.push(Mo.part(SPH, c, [x, y, z], null, [r * 2 * (sx || 1), r * 2 * (sy || 1), r * 2 * (sz || 1)])); }
  function prop(parts, name, thin) { var m = new THREE.Mesh(Mo.mergeParts(parts), Mo.material('prop')); m.name = name; R.addOutline(m, !!thin); return m; }
  function setGeo(m, g) { m.geometry.dispose(); m.geometry = g; for (var i = 0; i < m.children.length; i++) if (m.children[i].name === 'outline') m.children[i].geometry = g; }
  function ssd(e0, e1, x) { return U.smoothstep(e0, e1, x); }

  /* ---------------- state ---------------- */
  var S = { ready: false, cx: 0, cz: 0, x0: 0, x1: 0, cm: null, npc: null };
  var display = null, hang = null, hangMesh = null, board = null, boardCv = null, boardTex = null, flop = null, fringe = null, gull = null, drops = null, flies = null;
  var t = 0, qSway = 1, qPart = 1, qCrit = 1, near = false;

  /* ---------------- species pick (recent crate fish first) ---------------- */
  function pickIds() {
    var out = FS.ids.slice(0, 8), i;
    for (i = 0; i < DEFAULT_IDS.length && out.length < 8; i++) if (out.indexOf(DEFAULT_IDS[i]) < 0) out.push(DEFAULT_IDS[i]);
    return out;
  }
  function lenFor(id, k, lo, hi) { return Math.max(lo, Math.min(hi, FM.defaultLen(id) * k)); }

  /* ---------------- display fish (ice crate, tray, basket, bucket B) ---------------- */
  function buildDisplayParts() {
    var ids = pickIds(), L = [], r = U.rng(40 + FS.ids.length * 7), cz = S.cm.tz + 0.5, i, id, len, p;
    function add(id2, o) { p = FM.parts(id2, o); for (var k = 0; k < p.length; k++) L.push(p[k]); }
    // ice crate: 4 fish half buried in ice (crate rect 44.15..44.85 x 16.2..16.7, ice surface y .38)
    for (i = 0; i < 4; i++) {
      id = ids[i]; len = lenFor(id, 0.8, 0.26, 0.34);
      add(id, { len: len, x: 44.32 + (i % 2) * 0.36 + (r() - 0.5) * 0.05, y: 0.41 + r() * 0.01, z: 16.3 + Math.floor(i / 2) * 0.22 + (r() - 0.5) * 0.04,
        ry: (r() - 0.5) * 1.3 + (i % 2 ? 0.2 : Math.PI - 0.2), rz: (r() - 0.5) * 0.25, rx: (r() - 0.5) * 0.3 });
    }
    // tray on the counter: three fish side by side
    for (i = 0; i < 3; i++) {
      id = ids[(i + 4) % 8]; len = lenFor(id, 0.5, 0.2, 0.28);
      add(id, { len: len, x: 45.3 + (r() - 0.5) * 0.06, y: 0.955, z: cz - 0.15 + i * 0.15, ry: (r() - 0.5) * 0.5 + (i % 2 ? Math.PI : 0), rx: 0, rz: 0 });
    }
    // basket: two fish head down, tails up (basket center 44.35, 16.89)
    for (i = 0; i < 2; i++) {
      id = ids[(i + 2) % 8]; len = lenFor(id, 0.62, 0.22, 0.3);
      add(id, { len: len, x: 44.3 + i * 0.11, y: 0.29 + i * 0.03, z: 16.8 + (r() - 0.5) * 0.04, rz: -Math.PI / 2 + (r() - 0.5) * 0.4, ry: (r() - 0.5) * 0.5 });
    }
    // bucket B: two small fish tails up
    for (i = 0; i < 2; i++) {
      id = ids[(i + 6) % 8]; len = lenFor(id, 0.45, 0.18, 0.24);
      add(id, { len: len, x: 46.7 + i * 0.07, y: 0.27 + i * 0.02, z: 16.7 + (r() - 0.5) * 0.06, rz: -Math.PI / 2 + (r() - 0.5) * 0.35, ry: i * 1.2 });
    }
    return L;
  }
  function buildHangParts() {
    var ids = pickIds(), L = [], i, id, len, r = U.rng(90 + FS.ids.length * 3), xs = [-0.27, 0.0, 0.27], p, k;
    bx(L, 0.86, 0.025, 0.025, C.tan, 0, 0, 0);                                    // rope
    for (i = 0; i < 3; i++) {
      id = ids[(i + 3) % 8]; len = lenFor(id, 0.8, 0.28, 0.4);
      bx(L, 0.012, 0.07, 0.012, C.tan, xs[i], -0.04, 0);                           // string
      p = FM.parts(id, { len: len, x: xs[i] + (r() - 0.5) * 0.02, y: -0.07 - len * 0.5, z: 0, rz: Math.PI / 2 + (r() - 0.5) * 0.12, ry: (r() - 0.5) * 0.5 });
      for (k = 0; k < p.length; k++) L.push(p[k]);
    }
    return L;
  }
  function rebuildFish() {
    if (!S.ready) return;
    var g;
    if (display) setGeo(display, Mo.mergeParts(buildDisplayParts()));
    if (hangMesh) setGeo(hangMesh, Mo.mergeParts(buildHangParts()));
    paintBoard();
    g = FS.ids.join(',');
    E.emit('fishstall:display', { ids: FS.ids.slice(0, 4), key: g });
  }

  /* ---------------- price blackboard (canvas, Vietnamese) ---------------- */
  var FONT = '"Baloo 2","Google Sans",sans-serif';
  function fitText(c, text, maxW, fs, wt) {
    do { c.font = wt + ' ' + fs + 'px ' + FONT; fs -= 1; } while (fs > 9 && c.measureText(text).width > maxW);
  }
  function paintBoard() {
    if (!boardCv) return;
    var c = boardCv.getContext('2d'), ids = pickIds(), i, d, y;
    c.fillStyle = '#2f4a3f'; c.fillRect(0, 0, 192, 96);
    c.strokeStyle = '#e8d9b0'; c.lineWidth = 3; c.strokeRect(3, 3, 186, 90);
    c.textBaseline = 'middle';
    c.fillStyle = '#ffd166'; c.textAlign = 'center'; fitText(c, 'CÁ TƯƠI HÔM NAY', 170, 18, 800); c.fillText('CÁ TƯƠI HÔM NAY', 96, 17);
    for (i = 0; i < 3; i++) {
      d = G.FishData && G.FishData.get && G.FishData.get(ids[i]); if (!d) continue;
      y = 40 + i * 21;
      c.fillStyle = '#fff1d0'; c.textAlign = 'left'; fitText(c, d.name, 118, 15, 700); c.fillText(d.name, 12, y);
      c.fillStyle = '#ffb3c1'; c.textAlign = 'right'; fitText(c, d.price + 'g', 50, 15, 800); c.fillText(d.price + 'g', 180, y);
    }
    if (boardTex) boardTex.needsUpdate = true;
  }

  /* ---------------- static stall mesh ---------------- */
  function buildStatic() {
    var L = [], x0 = S.x0, x1 = S.x1, w = x1 - x0, cx = (x0 + x1) / 2, cz = S.cm.tz + 0.5, i, a, y;
    // striped awning over the counter front: back edge z 16.35 / y 2.12, front edge z 17.3 / y 1.88
    var az0 = cz - 0.15, az1 = cz + 0.8, y0 = 2.12, y1 = 1.88, tilt = Math.atan((y0 - y1) / (az1 - az0)), len = (az1 - az0) / Math.cos(tilt);
    for (i = 0; i < w * 2; i++) bx(L, 0.5, 0.06, len, i % 2 ? C.cream : C.teal, x0 + 0.25 + i * 0.5, (y0 + y1) / 2, (az0 + az1) / 2, tilt);
    bx(L, w + 0.06, 0.07, 0.07, C.dark, cx, y1 - 0.01, az1);                      // front rim beam
    bx(L, w + 0.06, 0.07, 0.07, C.dark, cx, y0 - 0.01, az0);                      // back rim beam
    // posts (rects match LAYOUT)
    cy(L, 0.05, 2.12, C.dark, 44.08, 1.06, 16.38); cy(L, 0.05, 2.12, C.dark, 46.92, 1.06, 16.38);
    cy(L, 0.05, 1.88, C.dark, 44.08, 0.94, 17.2); cy(L, 0.05, 1.88, C.dark, 46.92, 0.94, 17.2);
    // ice crate (slatted, open top, ice cubes)
    bx(L, 0.7, 0.05, 0.44, C.dark, 44.5, 0.03, 16.42);
    bx(L, 0.7, 0.36, 0.04, C.wood, 44.5, 0.2, 16.22); bx(L, 0.7, 0.36, 0.04, C.wood, 44.5, 0.2, 16.62);
    bx(L, 0.04, 0.36, 0.44, C.dark, 44.17, 0.2, 16.42); bx(L, 0.04, 0.36, 0.44, C.dark, 44.83, 0.2, 16.42);
    bx(L, 0.62, 0.02, 0.04, C.dark, 44.5, 0.14, 16.63); bx(L, 0.62, 0.02, 0.04, C.dark, 44.5, 0.3, 16.63);
    bx(L, 0.62, 0.05, 0.4, C.ice, 44.5, 0.36, 16.42);                              // ice bed
    for (i = 0; i < 7; i++) bx(L, 0.07 + rnd() * 0.05, 0.06, 0.07 + rnd() * 0.05, i % 2 ? C.ice : C.ice2, 44.27 + (i % 4) * 0.15 + (rnd() - 0.5) * 0.04, 0.41, 16.28 + Math.floor(i / 4) * 0.28 + (rnd() - 0.5) * 0.05, rnd() * 0.5, rnd() * 3, rnd() * 0.5);
    bx(L, 0.18, 0.1, 0.03, C.white, 44.5, 0.2, 16.645);                             // crate label
    // woven basket with fish tails (fish are in the display mesh)
    cy(L, 0.14, 0.2, 0xc9a45a, 44.35, 0.1, 16.81); cy(L, 0.15, 0.025, C.dark, 44.35, 0.2, 16.81); cy(L, 0.12, 0.015, 0x8e7230, 44.35, 0.14, 16.81);
    // floats and coiled rope near the crate
    sp(L, 0.07, C.red, 44.3, 0.07, 16.1); sp(L, 0.05, C.white, 44.3, 0.15, 16.1); sp(L, 0.065, C.yellow, 44.62, 0.065, 16.1); cy(L, 0.1, 0.05, C.tan, 44.74, 0.025, 16.1);
    // buckets: A (flopping fish) and B
    cy(L, 0.2, 0.34, C.blue, 46.38, 0.17, 16.42); cy(L, 0.21, 0.03, 0x3f6fb0, 46.38, 0.33, 16.42); cy(L, 0.17, 0.02, C.water, 46.38, 0.31, 16.42); cy(L, 0.205, 0.03, 0x3f6fb0, 46.38, 0.02, 16.42);
    cy(L, 0.16, 0.28, C.tin, 46.74, 0.14, 16.7); cy(L, 0.17, 0.03, 0xc0554a, 46.74, 0.27, 16.7); cy(L, 0.13, 0.02, C.water, 46.74, 0.25, 16.7);
    // counter: tray with ice, steelyard scale
    bx(L, 0.64, 0.05, 0.4, C.dark, 45.3, 0.885, cz - 0.05); bx(L, 0.6, 0.03, 0.36, C.ice, 45.3, 0.92, cz - 0.05);
    for (i = 0; i < 4; i++) bx(L, 0.06, 0.05, 0.06, C.ice2, 45.12 + i * 0.12, 0.945, cz - 0.17 + (i % 2) * 0.22, 0, rnd() * 3, 0);
    cy(L, 0.07, 0.03, C.iron, 45.82, 0.865, cz + 0.05); cy(L, 0.015, 0.34, C.iron2, 45.82, 1.04, cz + 0.05);
    bx(L, 0.3, 0.02, 0.02, C.iron2, 45.82, 1.2, cz + 0.05, 0, 0, 0.12); cy(L, 0.07, 0.015, C.iron2, 45.68, 1.02, cz + 0.05); cy(L, 0.04, 0.05, C.red, 45.97, 1.12, cz + 0.05);
    // hanging lantern under the back right of the awning
    bx(L, 0.012, 0.16, 0.012, C.iron, 46.78, 1.98, 16.4);
    bx(L, 0.15, 0.03, 0.15, C.iron, 46.78, 1.88, 16.4); bx(L, 0.12, 0.14, 0.12, C.yellow, 46.78, 1.79, 16.4); bx(L, 0.15, 0.03, 0.15, C.iron, 46.78, 1.7, 16.4);
    // price board frame + strings
    bx(L, 0.84, 0.44, 0.03, C.dark, 44.55, 1.62, 17.12);
    bx(L, 0.01, 0.07, 0.01, C.tan, 44.3, 1.87, 17.12); bx(L, 0.01, 0.07, 0.01, C.tan, 44.8, 1.87, 17.12);
    return L;
  }

  /* ---------------- awning fringe (scallops, flutter) ---------------- */
  function buildFringe() {
    var L = [], x0 = S.x0, w = S.x1 - S.x0, cx = (S.x0 + S.x1) / 2, i;
    for (i = 0; i < w * 2; i++) {
      L.push(Mo.part(SPH, i % 2 ? C.cream : C.teal, [x0 + 0.25 + i * 0.5 - cx, -0.05, 0], null, [0.5, 0.2, 0.05]));
    }
    var m = prop(L, 'fishstall_fringe', true);
    var g = new THREE.Group(); g.position.set(cx, 1.84, 17.3); g.add(m);
    return g;
  }

  /* ---------------- bucket A flopper ---------------- */
  var fl = { next: 4, u: -1, base: 0 };
  function buildFlop() {
    var m = FM.mesh('carp', { len: 0.3 }), g = new THREE.Group();
    g.add(m); g.position.set(46.38, 0.4, 16.42); g.rotation.set(0.15, 0.6, 0.55);
    return g;
  }

  /* ---------------- seagull ---------------- */
  var gl = { st: 'perch', tm: 6, hop: -1, u: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, dur: 3.2, yaw: 0, px: 0, py: 0, pz: 0, ry: 0 };
  function buildGull() {
    var L = [], g = new THREE.Group(), wings = [], i, s, wl = [];
    sp(L, 0.12, C.white, 0, 0.12, 0, 1.45, 0.85, 0.8); sp(L, 0.07, C.white, 0.16, 0.22, 0, 1, 1, 1);
    L.push(Mo.part(CONE, 0xff9b3a, [0.25, 0.21, 0], [0, 0, -Math.PI / 2], [0.045, 0.1, 0.045]));
    L.push(Mo.part(CONE, 0xb9c0c8, [-0.2, 0.13, 0], [0, 0, Math.PI / 2 - 0.25], [0.1, 0.16, 0.05]));
    for (s = -1; s <= 1; s += 2) {
      sp(L, 0.1, 0xb9c0c8, -0.03, 0.14, s * 0.075, 1.3, 0.5, 0.25);
      sp(L, 0.018, 0x2b2024, 0.2, 0.235, s * 0.05); cy(L, 0.008, 0.1, 0xff9b3a, 0.0, 0.05, s * 0.04);
    }
    var body = prop(L, 'gull_body', true); g.add(body);
    var wg = Mo.mergeParts([Mo.part(SPH, 0xf2f5f7, [0, 0, 0.17], null, [0.2, 0.035, 0.38]), Mo.part(SPH, 0x6a7580, [0, 0, 0.34], null, [0.15, 0.03, 0.14])]);
    for (i = 0; i < 2; i++) {
      var piv = new THREE.Group(), wm = new THREE.Mesh(wg, Mo.material('prop')); R.addOutline(wm, true);
      piv.position.set(0, 0.17, i ? 0.06 : -0.06); piv.rotation.y = i ? Math.PI : 0; piv.visible = false; piv.add(wm); g.add(piv); wl.push(piv);
    }
    g.userData.wings = wl; g.userData.body = body;
    return g;
  }
  function gullPose() { gull.position.set(gl.px, gl.py, gl.pz); gull.rotation.y = gl.ry; }
  function gullFlight(dt) {
    var u = Math.min(1, gl.u / gl.dur), e = ssd(0, 1, u), wl = gull.userData.wings, f = Math.sin(t * 18) * 0.7, bump = Math.sin(Math.PI * u) * 1.6;
    gl.u += dt;
    gl.px = U.lerp(gl.ax, gl.bx, e); gl.pz = U.lerp(gl.az, gl.bz, e); gl.py = U.lerp(gl.ay, gl.by, e) + bump;
    gl.ry = -Math.atan2(gl.bz - gl.az, gl.bx - gl.ax);
    wl[0].rotation.x = -0.15 - f * Math.min(1, 1.3 - e * 0.5); wl[1].rotation.x = 0.15 + f * Math.min(1, 1.3 - e * 0.5);
    gull.rotation.z = Math.sin(t * 9) * 0.06; gullPose();
    return u >= 1;
  }
  function gullSetWings(v) { gull.userData.wings[0].visible = v; gull.userData.wings[1].visible = v; }
  function updateGull(dt) {
    var wl = gull.userData.wings, ph = S.perch;
    if (qCrit < 0.5) { gull.visible = false; return; }
    if (gl.st === 'perch') {
      gull.visible = true; gl.tm -= dt;
      if (gl.hop >= 0) {
        gl.hop += dt; var hu = gl.hop / 0.35;
        if (hu >= 1) { gl.hop = -1; gl.py = ph.y; gl.ry += gl.dyaw; } else gl.py = ph.y + Math.sin(Math.PI * hu) * 0.1;
      } else if (Math.random() < dt * 0.35) { gl.hop = 0; gl.dyaw = (Math.random() - 0.5) * 1.2; }
      gl.px = ph.x; gl.pz = ph.z; gull.rotation.z = 0; gullPose();
      if (gl.tm <= 0) {
        gl.st = 'out'; gl.u = 0; gl.dur = 3.4; gl.ax = ph.x; gl.ay = ph.y; gl.az = ph.z; gl.bx = ph.x + 11 + Math.random() * 3; gl.by = ph.y + 2.5; gl.bz = ph.z - 3 - Math.random() * 3; gullSetWings(true);
      }
    } else if (gl.st === 'out') {
      if (gullFlight(dt)) { gl.st = 'away'; gl.tm = 5 + Math.random() * 6; gull.visible = false; gullSetWings(false); }
    } else if (gl.st === 'away') {
      gl.tm -= dt;
      if (gl.tm <= 0) { gl.st = 'back'; gl.u = 0; gl.dur = 3.6; gl.ax = ph.x + 12; gl.ay = ph.y + 3; gl.az = ph.z - 4; gl.bx = ph.x; gl.by = ph.y; gl.bz = ph.z; gull.visible = true; gullSetWings(true); }
    } else {
      if (gullFlight(dt)) { gl.st = 'perch'; gl.tm = 12 + Math.random() * 10; gl.ry = 0.5; gullSetWings(false); gull.rotation.z = 0; gl.hop = -1; }
    }
  }

  /* ---------------- drops (drips + splash) and flies ---------------- */
  var M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), QI = new THREE.Quaternion(), V1 = new THREE.Vector3(1, 1, 1), V0 = new THREE.Vector3(0, -99, 0);
  var sd = { t0: 0, t1: 0.55, burst: -1 };
  var DRIP = [[44.62, 0.2, 16.67, 0.0], [45.18, 0.86, 16.99, 0.0]];
  function setDrop(i, x, y, z, s) { M4.compose(V3.set(x, y, z), QI, V1.set(s, s, s)); drops.setMatrixAt(i, M4); }
  function hideDrop(i) { M4.compose(V0, QI, V1); drops.setMatrixAt(i, M4); }
  function updateDrops(dt) {
    var i, u, d, k, bt;
    for (i = 0; i < 2; i++) {
      d = DRIP[i]; u = ((t * (0.9 + i * 0.17) + i * 0.47) % 1.25) / 0.55;     // fall for 0.55s, then rest
      if (u < 1 && qPart >= 0.55) setDrop(i, d[0], d[1] - (d[1] - 0.03) * u * u, d[2], 0.8 + 0.2 * u); else hideDrop(i);
    }
    if (sd.burst >= 0) {
      sd.burst += dt; bt = sd.burst / 0.6;
      for (k = 0; k < 4; k++) {
        if (bt >= 1 || qPart < 0.55) hideDrop(2 + k);
        else setDrop(2 + k, 46.38 + Math.cos(k * 1.57 + 0.6) * 0.16 * bt, 0.4 + Math.sin(Math.PI * bt) * 0.28 - bt * 0.1, 16.42 + Math.sin(k * 1.57 + 0.6) * 0.16 * bt, 1 - bt * 0.4);
      }
      if (bt >= 1) sd.burst = -1;
    } else for (k = 2; k < 6; k++) hideDrop(k);
    drops.instanceMatrix.needsUpdate = true;
  }
  function updateFlies() {
    var on = qPart >= 0.8, i, a;
    flies.visible = on; if (!on) return;
    for (i = 0; i < 3; i++) {
      a = t * (2.1 + i * 0.7) + i * 2.1;
      M4.compose(V3.set(45.3 + Math.sin(a) * 0.3 + Math.sin(a * 2.7) * 0.06, 1.12 + Math.sin(a * 1.6 + i) * 0.1, S.cm.tz + 0.5 - 0.05 + Math.cos(a * 1.3) * 0.2), QI, V1);
      flies.setMatrixAt(i, M4);
    }
    flies.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- seller reactions ---------------- */
  var sr = { react: -1, arr: -1, next: 7 };
  function env(x, dur) { return Math.max(0, Math.min(1, Math.min(x, dur - x) * 4)); }
  function updateSeller(dt) {
    var j = S.npc.joints, e;
    if (sr.react >= 0) {
      sr.react += dt; e = env(sr.react, 1.9);
      j.shoulderL.rotation.x += -2.3 * e; j.shoulderL.rotation.z += Math.sin(sr.react * 10) * 0.3 * e;
      j.head.rotation.x += Math.sin(sr.react * 6) * 0.12 * e; j.head.rotation.z += 0.12 * e;
      if (sr.react > 1.9) sr.react = -1;
    }
    if (sr.arr >= 0) {
      sr.arr += dt; e = env(sr.arr, 2.6);
      j.spine.rotation.x += 0.2 * e; j.head.rotation.x += 0.16 * e;
      j.shoulderL.rotation.x += (-0.8 + Math.sin(sr.arr * 5) * 0.12) * e; j.shoulderR.rotation.x += (-0.9 + Math.sin(sr.arr * 5 + 1.6) * 0.12) * e;
      if (sr.arr > 2.6) { sr.arr = -1; sr.next = 9 + Math.random() * 7; }
    } else { sr.next -= dt; if (sr.next <= 0 && sr.react < 0) sr.arr = 0; }
  }

  /* ---------------- frame ---------------- */
  function onFrame(dt) {
    var P = G.Player && G.Player.pos, dx, dz, q;
    if (!S.ready || !P) return;
    dx = P.x - S.cx; dz = P.z - S.cz; near = dx * dx + dz * dz < 26 * 26;
    if (!near) return;
    if (dt > 0.1) dt = 0.1;
    t += dt; q = G.Quality && G.Quality.def ? G.Quality.def() : null;
    qSway = q ? q.sway : 1; qPart = q ? q.particle : 1; qCrit = q ? q.critter : 1;
    // sway of the hanging fish + awning fringe flutter
    hang.rotation.z = Math.sin(t * 1.35) * 0.05 * qSway + Math.sin(t * 2.3 + 1.1) * 0.015 * qSway;
    hang.rotation.x = Math.sin(t * 0.95 + 0.6) * 0.035 * qSway;
    fringe.rotation.x = (Math.sin(t * 2.2) * 0.06 + Math.sin(t * 3.7 + 0.8) * 0.025) * qSway;
    fringe.rotation.z = Math.sin(t * 1.4 + 0.4) * 0.012 * qSway;
    // bucket fish flop
    if (fl.u < 0) {
      fl.next -= dt; flop.rotation.z = 0.55 + Math.sin(t * 1.6) * 0.03;
      if (fl.next <= 0) { fl.u = 0; }
    } else {
      fl.u += dt / 0.7; var u = Math.min(1, fl.u);
      flop.position.y = 0.4 + Math.sin(Math.PI * u) * 0.26; flop.rotation.z = 0.55 + Math.sin(u * Math.PI * 2) * 1.2; flop.rotation.y = 0.6 + u * 2.4 * (u < 1 ? 1 : 0);
      if (u >= 1) { fl.u = -1; fl.next = 6 + Math.random() * 6; flop.position.y = 0.4; flop.rotation.y = 0.6; sd.burst = 0; E.emit('fishstall:flop', { x: 46.38, z: 16.42 }); }
    }
    updateGull(dt); updateDrops(dt); updateFlies(); updateSeller(dt);
  }

  /* ---------------- build ---------------- */
  FS.build = function (T) {
    if (S.ready || !T || !T.group) return;
    var cm = W.getMarkers('fishStall')[0], x, z, b = null;
    for (z = 0; z < W.H; z++) for (x = 0; x < W.W; x++) {
      if (W.tileType(x + 0.5, z + 0.5) !== 'stall') continue;
      if (!b) b = { x0: x, x1: x }; else { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); }
    }
    if (!cm || !b || !T.npcs || !T.npcs.fishmonger) return;
    S.cm = cm; S.x0 = b.x0; S.x1 = b.x1 + 1; S.cx = (S.x0 + S.x1) / 2; S.cz = cm.tz + 0.5; S.npc = T.npcs.fishmonger.h;
    S.perch = { x: S.cx, y: 2.96, z: 14.55 };
    FS.group = new THREE.Group(); FS.group.name = 'fishstall'; T.group.add(FS.group);
    FS.group.add(prop(buildStatic(), 'fishstall_static'));
    display = prop(buildDisplayParts(), 'fishstall_display', true); FS.group.add(display);
    hang = new THREE.Group(); hang.position.set(46.4, 1.83, 17.14);
    hangMesh = prop(buildHangParts(), 'fishstall_hang', true); hang.add(hangMesh); FS.group.add(hang);
    fringe = buildFringe(); FS.group.add(fringe);
    boardCv = document.createElement('canvas'); boardCv.width = 192; boardCv.height = 96;
    paintBoard(); boardTex = new THREE.CanvasTexture(boardCv);
    board = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.38), new THREE.MeshBasicMaterial({ map: boardTex }));
    board.position.set(44.55, 1.62, 17.14); board.name = 'fishstall_board'; FS.group.add(board);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintBoard);
    flop = buildFlop(); FS.group.add(flop);
    gull = buildGull(); gull.position.set(S.perch.x, S.perch.y, S.perch.z); gl.px = S.perch.x; gl.py = S.perch.y; gl.pz = S.perch.z; gl.ry = 0.5; FS.group.add(gull);
    drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 5, 4), new THREE.MeshBasicMaterial({ color: 0x8fdcf0 }), 6);
    drops.frustumCulled = false; drops.name = 'fishstall_drops'; FS.group.add(drops);
    flies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 4, 3), new THREE.MeshBasicMaterial({ color: 0x2b2024 }), 3);
    flies.frustumCulled = false; flies.name = 'fishstall_flies'; FS.group.add(flies);
    S.ready = true;
    // recent fish: species put into the fish crate (what the player is selling) go to the front of the display
    var Eco = G.Economy;
    function sync() {
      var c = Eco && Eco.crate, i, s, add = [], k;
      if (!c) return;
      for (i = 0; i < c.size; i++) { s = c.get(i); if (s && add.indexOf(s.id) < 0) add.push(s.id); }
      k = add.join('|');
      if (k === sync.k) return; sync.k = k;
      FS.ids = add.concat(FS.ids.filter(function (id) { return add.indexOf(id) < 0; })).slice(0, 8);
      rebuildFish();
    }
    sync.k = null;
    if (Eco && Eco.crate && Eco.crate.onChange) Eco.crate.onChange(sync);
    sync();
    E.on('interact:fishstall', function () { sr.react = 0; sr.arr = -1; });
    G.Loop.onFrame(onFrame, 10.5);
  };
})();
