/* Togie Valley - world_react.js (Stage 15D D4): the world answers the player.
 * - Crops: the instanced crop shader (farm_fx.js VERT) carries 3 "jiggle" slots uJ[i] = (x, z, age, amp) and one "brush" slot uBr = (x, z, 0, amp).
 *   Watering / harvesting fills a slot at the clip's impact (a damped ring wobble spreading from the tile), walking past pushes crops away
 *   (smooth falloff). All math runs on the GPU: idle cost = 3 uniform branches in the shader and one `if` in JS; no per-crop JS.
 * - Lids: house chest, shipping bin(s) and a fish crate by the fishmonger get hinged lids that swing open (spring with a little overshoot)
 *   while their container panel is open and close afterwards (UI.openContainer is wrapped; ui:closed closes).
 * - Farmhouse door: a hinged leaf swings open when the player is within ~1.8 tiles (and right after coming out of the house), closes when away.
 * Quality: tier 0 full, 1 weaker jiggle/brush, 2-3 no crop jiggle/brush; tier 3 lids/door snap instead of swinging. All springs sleep at rest. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Loop || !G.Events || !G.Render || !G.Models || !G.Player) { console.error('[world_react] missing deps'); return; }
  var E = G.Events, R = G.Render, M = G.Models, P = G.Player, FX = G.FarmFx, F = G.Farm;
  var BOX = new THREE.BoxGeometry(1, 1, 1);

  function quality() { return G.Quality ? G.Quality.level() : 0; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function bx(w, h, d, c, x, y, z) { return M.part(BOX, c, [x, y, z], null, [w, h, d]); }
  function mesh(parts) { var m = new THREE.Mesh(M.mergeParts(parts), M.material('prop')); R.addOutline(m); return m; }

  /* ------------------------------------------------------------------ crop jiggle + brush */
  var jig = null, br = null, jAge = [9, 9, 9], jNext = 0, brAmp = 0;
  function jiggle(tx, tz, amp) {
    var q = quality();
    if (!jig || q >= 2) return;
    var n = jNext; jNext = (jNext + 1) % 3;
    jig[n].set(tx + 0.5, tz + 0.5, 0, amp * (q === 1 ? 0.7 : 1)); jAge[n] = 0;
  }
  E.on('anim:impact', function (p) {
    if (!p || p.stage !== 'hit' || p.tx === undefined) return;
    if (p.name === 'water' && F && F.tileAt && F.tileAt(p.tx, p.tz) && F.tileAt(p.tx, p.tz).crop) jiggle(p.tx, p.tz, 1);
    else if (p.name === 'harvest') jiggle(p.tx, p.tz, 1.25);
    else if (p.name === 'plant') jiggle(p.tx, p.tz, 0.5);
  });
  function stepCrops(dt) {
    var i, s, q = quality(), sp, tgt;
    if (!jig) { if (FX && FX.jig) { jig = FX.jig.value; br = FX.brush.value; } else return; }
    for (i = 0; i < 3; i++) {
      s = jig[i];
      if (s.w <= 0) continue;
      jAge[i] += dt; s.z = jAge[i];
      if (jAge[i] > 1.5 || q >= 2) { s.w = 0; jAge[i] = 9; }
    }
    sp = P.speed || 0;
    tgt = q >= 2 || G.Scenes.current !== 'outdoor' ? 0 : clamp((sp - 0.4) / 2.2, 0, 1) * (q === 1 ? 0.6 : 1);
    if (tgt > 0 || brAmp > 0.002) {
      brAmp += (tgt - brAmp) * (1 - Math.exp(-9 * dt));
      if (brAmp < 0.002 && tgt === 0) brAmp = 0;
      br.set(P.pos.x, P.pos.z, 0, brAmp);
    }
  }

  /* ------------------------------------------------------------------ hinged things (lids, door) */
  var hinges = [], _wp = new THREE.Vector3();
  function Hinge(pivot, axis, max, k, c) { this.p = pivot; this.axis = axis; this.max = max; this.k = k; this.c = c; this.t = 0; this.x = 0; this.v = 0; this.cont = null; }
  function addHinge(pivot, axis, max, k, c) { var h = new Hinge(pivot, axis, max, k, c); hinges.push(h); return h; }
  function stepHinges(dt) {
    var i, h, n, hh, snap = quality() >= 3;
    for (i = 0; i < hinges.length; i++) {
      h = hinges[i];
      if (!snap && Math.abs(h.x - h.t) < 0.0008 && Math.abs(h.v) < 0.002) continue;
      if (snap) { h.x = h.t; h.v = 0; }
      else { hh = Math.min(dt, 0.03); h.v += (h.k * (h.t - h.x) - h.c * h.v) * hh; h.x += h.v * hh; if (Math.abs(h.x - h.t) < 0.0008 && Math.abs(h.v) < 0.002) { h.x = h.t; h.v = 0; } }
      h.p.rotation[h.axis] = h.max * clamp(h.x, -0.12, 1.12);
    }
  }

  /* chest / bin / crate lids */
  var inDoor = null, lids = [], lidInit = false, wrapped = false;
  function lid(host, kind, cont, w, h, d, color, hx, hy, hz) {
    var piv = new THREE.Group(), m = mesh([bx(w, h, d, color, 0, h / 2, d / 2)]);
    piv.position.set(hx, hy, hz); piv.add(m); host.add(piv);
    var hg = addHinge(piv, 'x', -1.75, 90, 10.5); hg.cont = cont; hg.kind = kind; hg.host = host;
    lids.push(hg); return hg;
  }
  var SPH = new THREE.SphereGeometry(1, 8, 6);
  var CRATE_FISH = ['snakehead', 'carp', 'perch'];
  function fishP(id, x, y, z, ry) { return G.FishModels ? G.FishModels.parts(CRATE_FISH[id], { len: 0.27, x: x, y: y, z: z, ry: ry }) : []; }
  function crate(x, z, ry) {
    var g = new THREE.Group(), body = mesh([bx(0.7, 0.34, 0.46, 0xc98b4f, 0, 0.17, 0), bx(0.72, 0.05, 0.48, 0x8c5a34, 0, 0.05, 0), bx(0.72, 0.05, 0.48, 0x8c5a34, 0, 0.31, 0),
      bx(0.06, 0.34, 0.5, 0x8c5a34, -0.3, 0.17, 0), bx(0.06, 0.34, 0.5, 0x8c5a34, 0.3, 0.17, 0), bx(0.3, 0.12, 0.04, 0xf2f2e6, 0, 0.17, 0.235), bx(0.16, 0.05, 0.045, 0x6aa9d6, 0, 0.17, 0.24), bx(0.1, 0.05, 0.1, 0xdff3fb, -0.22, 0.365, 0.12), bx(0.1, 0.05, 0.1, 0xdff3fb, 0.2, 0.365, -0.14),
      ].concat(fishP(0, -0.08, 0.4, 0.04, 0.2), fishP(1, 0.1, 0.4, -0.08, -0.15 + Math.PI), fishP(2, -0.02, 0.4, -0.15, 0.1)));
    g.add(body); g.position.set(x, 0, z); g.rotation.y = ry;
    return g;
  }
  function initLids() {
    var T = G.Town, D = G.Decor, H = G.House, Eco = G.Economy, fm, root, a, i, c;
    if (!D || !D.group || !T || !T.group || !T.npcs || !T.npcs.fishmonger || !Eco) return;
    for (i = 0; i < D.group.children.length; i++) {
      c = D.group.children[i];
      if (c.name === 'prop_bin') lid(c, 'bin', Eco.bin, 0.9, 0.08, 0.7, 0x8c5a34, 0, 0.5, -0.35);
    }
    fm = T.npcs.fishmonger; root = fm.h.root; a = root.rotation.y;
    c = crate(root.position.x + 0.95 * Math.cos(a) - 0.1 * Math.sin(a), root.position.z - 0.95 * Math.sin(a) - 0.1 * Math.cos(a), a);
    T.group.add(c);
    lid(c, 'crate', Eco.crate, 0.74, 0.06, 0.5, 0x8c5a34, 0, 0.34, -0.25);
    if (H && H.chestMesh) lid(H.chestMesh, 'chest', H.chest, 0.88, 0.16, 0.6, 0x8c5a34, 0, 0.36, -0.3);
    if (H && H.chestMesh && H.chestMesh.parent && H.depth) {
      var ip = new THREE.Group(); ip.position.set(3.07, 0, H.depth + 0.15);
      ip.add(mesh([bx(0.86, 1.8, 0.06, 0x9a6a3f, 0.43, 0.9, 0), bx(0.66, 1.4, 0.068, 0xb98350, 0.43, 0.9, 0), bx(0.06, 0.06, 0.08, 0xffd166, 0.76, 0.9, 0)]));
      H.chestMesh.parent.add(ip); inDoor = addHinge(ip, 'y', -1.9, 70, 9.5); inDoor.t = 1; inDoor.x = 1;
    }
    lidInit = true;
  }
  function wrapOpen() {
    var UI = G.UI, base;
    if (wrapped || !UI || !UI.openContainer) return;
    base = UI.openContainer; wrapped = true;
    UI.openContainer = function (cont) {
      var p = base.apply(this, arguments), i, h, best = null, bd = 1e9, wp = _wp;
      if (!p) return p;
      for (i = 0; i < lids.length; i++) {
        h = lids[i];
        if (h.cont !== cont) continue;
        if (h.kind === 'bin') { h.host.getWorldPosition(wp); var d = (wp.x - P.pos.x) * (wp.x - P.pos.x) + (wp.z - P.pos.z) * (wp.z - P.pos.z); if (d < bd) { bd = d; best = h; } }
        else h.t = 1;
      }
      if (best) best.t = 1;
      return p;
    };
    E.on('ui:closed', function () { for (var j = 0; j < lids.length; j++) lids[j].t = 0; });
  }

  /* farmhouse door: hinged leaf over the dark doorway (models.js buildHouse draws the doorway) */
  var door = null, doorHx = 0, doorHz = 0, doorTried = false, doorKick = 0;
  function initDoor() {
    var D = G.Decor, hs, piv, leaf, knob;
    if (!D || !D.house) return;
    hs = D.house;
    piv = new THREE.Group(); piv.position.set(-0.275, 0.75, 1.385);
    leaf = mesh([bx(0.55, 1.0, 0.05, 0x9a6a3f, 0.275, 0, 0), bx(0.4, 0.78, 0.058, 0xb98350, 0.275, 0, 0), bx(0.06, 0.06, 0.07, 0xffd166, 0.45, -0.02, 0)]);
    piv.add(leaf); hs.add(piv);
    door = addHinge(piv, 'y', -1.9, 70, 9.5);
    doorHx = hs.position.x; doorHz = hs.position.z + 1.9;
  }
  E.on('scene:changed', function (e) { if (e && e.to === 'house' && inDoor) { inDoor.x = 0; inDoor.v = 0; inDoor.t = 1; }
    if (e && e.to === 'outdoor' && door) { door.x = 0.9; door.t = 1; doorKick = 1.2; } });
  function stepDoor(dt) {
    var dx, dz;
    if (!door) return;
    if (doorKick > 0) { doorKick -= dt; return; }
    dx = P.pos.x - doorHx; dz = P.pos.z - doorHz;
    door.t = G.Scenes.current === 'outdoor' && dx * dx + dz * dz < 3.3 ? 1 : 0;
  }

  G.Loop.onFrame(function (dt) {
    if (!lidInit) initLids();
    if (!wrapped) wrapOpen();
    if (!door && !doorTried) { initDoor(); doorTried = !!door; }
    dt = Math.min(dt, 0.1);
    stepCrops(dt); stepDoor(dt); stepHinges(dt);
  }, 101.5);

  G.WorldReact = { jiggle: jiggle, hinges: function () { return hinges; } };
})();
