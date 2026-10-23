/* Togie Valley - anim_tools.js (Stage 15D D1/D2): hand-held props for the clip system. Game.AnimTools.
 *  - Tool models on hero.attach.handR, built lazily per (name, tier): hoe, can, pouch, sack, bread/fish/crop/bowl (food from the item icon).
 *    Tiers 0..3 = Cơ bản / Đồng / Bạc / Vàng look different in the hand (colours, grip wrap, collar, gem, finial).
 *  - Ink swoosh ribbon (one dynamic mesh, camera-facing taper) for the hoe arc.
 *  - Billboard emote marks ("!" and "z") from pooled meshes.
 * Everything is a merged vertex-colour mesh with the shared outline helper, uniform scale only (squash/stretch lives in the pose).
 * Depends on THREE, Render, Models, Player.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.Player) { console.error('[anim_tools] missing dependencies'); return; }
  var R = G.Render, M = G.Models, P = G.Player;
  var AT = G.AnimTools = { tipLocal: { hoe: [0, -0.6, 0.06], can: [0, -0.04, 0.2] } };

  var _e = new THREE.Euler();
  function pt(g, c, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    var m = new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(_e),
      new THREE.Vector3(sx || 1, sy === undefined ? (sx || 1) : sy, sz === undefined ? (sx || 1) : sz));
    return { geo: g, color: c, matrix: m };
  }
  var SPH = new THREE.SphereGeometry(1, 8, 6), CONE = new THREE.ConeGeometry(1, 1, 7), CYL = new THREE.CylinderGeometry(1, 1, 1, 8), BOX = new THREE.BoxGeometry(1, 1, 1);
  function col(c, fb) { var t = new THREE.Color(fb || 0xcccccc); try { if (c !== undefined && c !== null) t.set(c); } catch (e) {} return t; }
  function shade(c, k) { return c.clone().multiplyScalar(k); }
  function lift(c, k) { return c.clone().lerp(new THREE.Color(0xffffff), k); }

  /* ------------------------------------------------------------ tier palettes (match Icons TIER_COL: basic, copper, silver, gold) */
  var TIER = [
    { metal: 0x9aa4ad, edge: 0xc9d0d6, wood: 0x9a6b3f, trim: 0x8c5a34, body: 0x6aa8d8, rim: 0x8cc4ec, deep: 0x4f87b5 },
    { metal: 0xc87f4a, edge: 0xf0b27a, wood: 0x8c5a34, trim: 0xc87f4a, body: 0xd98a52, rim: 0xf0b27a, deep: 0xa8643a },
    { metal: 0xcfd8e2, edge: 0xffffff, wood: 0x6b4a33, trim: 0xb8c4d0, body: 0xc8d2de, rim: 0xf4f8fc, deep: 0x9aa8b8 },
    { metal: 0xf0c040, edge: 0xfff0a0, wood: 0x7a4a2b, trim: 0xf0c040, body: 0xf2c74a, rim: 0xfff0a0, deep: 0xc99a2a }
  ];

  function mesh(list) {
    var m = new THREE.Mesh(M.mergeParts(list), M.material('prop')); R.addOutline(m, true); m.visible = false; m.raycast = function () {};
    P.hero.attach.handR.add(m);
    return m;
  }
  function buildHoe(t) {
    var T = TIER[t], l = [];
    l.push(pt(CYL, T.wood, 0, -0.2, 0, 0, 0, 0, 0.017, 0.7, 0.017));                      // handle
    if (t >= 1) l.push(pt(CYL, T.trim, 0, -0.02, 0, 0, 0, 0, 0.024, 0.1, 0.024));         // grip wrap
    l.push(pt(CYL, T.trim, 0, -0.52, 0, 0, 0, 0, 0.027, 0.05, 0.027));                    // socket collar
    l.push(pt(BOX, T.metal, 0, -0.585, 0.06, 0.5, 0, 0, 0.115, 0.016, 0.13));             // blade, edge tilted into the soil
    l.push(pt(BOX, T.edge, 0, -0.6, 0.115, 0.5, 0, 0, 0.115, 0.012, 0.02));               // bright cutting edge
    if (t >= 2) l.push(pt(BOX, T.edge, 0, -0.575, 0.05, 0.5, 0, 0, 0.02, 0.018, 0.1));    // centre rib
    if (t >= 3) { l.push(pt(SPH, 0xff7aa8, 0, -0.5, 0.03, 0, 0, 0, 0.022), pt(SPH, T.metal, 0, 0.16, 0, 0, 0, 0, 0.03)); }
    return mesh(l);
  }
  function buildCan(t) {
    var T = TIER[t], l = [];
    l.push(pt(CYL, T.body, 0, -0.1, 0.02, 0, 0, 0, 0.085, 0.11, 0.085));                  // body
    l.push(pt(CYL, T.rim, 0, -0.04, 0.02, 0, 0, 0, 0.09, 0.014, 0.09));                   // top rim
    l.push(pt(CYL, T.deep, 0, -0.155, 0.02, 0, 0, 0, 0.088, 0.012, 0.088));               // bottom band
    l.push(pt(BOX, T.deep, 0, -0.085, -0.075, 0, 0, 0, 0.018, 0.1, 0.03));                // rear handle post
    l.push(pt(BOX, T.deep, 0, -0.03, -0.045, 0, 0, 0, 0.018, 0.018, 0.08));               // handle top bar
    l.push(pt(CYL, T.deep, 0, -0.065, 0.14, 1.18, 0, 0, 0.022, 0.15, 0.022));             // spout
    l.push(pt(CYL, T.rim, 0, -0.04, 0.205, 1.18, 0, 0, 0.038, 0.014, 0.038));             // rose
    if (t >= 2) l.push(pt(BOX, T.rim, 0, -0.1, 0.105, 0, 0, 0, 0.05, 0.05, 0.01));        // plate
    if (t >= 3) l.push(pt(SPH, 0xff7aa8, 0, -0.1, 0.112, 0, 0, 0, 0.016));
    return mesh(l);
  }
  function buildPouch(c) {
    var base = col(c, 0xd9b27a), l = [];
    l.push(pt(SPH, base, 0, -0.07, 0, 0, 0, 0, 0.07, 0.075, 0.07), pt(CONE, 0x8c5a34, 0, 0.0, 0, 0, 0, 0, 0.04, 0.05, 0.04), pt(CYL, 0xe8d8b0, 0, -0.02, 0, 0, 0, 0, 0.045, 0.012, 0.045));
    l.push(pt(SPH, lift(base, 0.5), 0.03, -0.1, 0.05, 0, 0, 0, 0.016));
    return mesh(l);
  }
  function buildSack(c) {
    var base = col(c, 0xc9a06a), l = [];
    l.push(pt(BOX, base, 0, -0.08, 0, 0, 0, 0, 0.11, 0.14, 0.07), pt(BOX, shade(base, 0.8), 0, -0.145, 0, 0, 0, 0, 0.112, 0.02, 0.072), pt(BOX, 0x5f9e55, 0, -0.05, 0.036, 0, 0, 0, 0.115, 0.04, 0.01));
    l.push(pt(SPH, 0xe8d8b0, 0, -0.005, 0, 0, 0, 0, 0.042, 0.03, 0.04));
    return mesh(l);
  }
  function buildFood(tpl, c1, c2) {
    var a = col(c1, 0xe0a85a), b = col(c2, 0xf2c680), l = [];
    if (tpl === 'bowl') {
      l.push(pt(SPH, a, 0, -0.07, 0.02, 0, 0, 0, 0.085, 0.05, 0.085), pt(CYL, b, 0, -0.045, 0.02, 0, 0, 0, 0.075, 0.012, 0.075), pt(CYL, 0xe8d8b0, 0, -0.1, 0.02, 0, 0, 0, 0.045, 0.014, 0.045));
      l.push(pt(CYL, 0xc9b48a, 0.05, -0.02, 0.0, 0, 0, 0.6, 0.008, 0.12, 0.008));               // spoon
    } else if (tpl === 'fish') {
      l.push(pt(SPH, a, 0, -0.05, 0.02, 0, 0, 0, 0.11, 0.05, 0.04), pt(CONE, b, -0.12, -0.05, 0.02, 0, 0, -1.57, 0.05, 0.07, 0.012), pt(SPH, 0xffffff, 0.07, -0.04, 0.05, 0, 0, 0, 0.014));
    } else if (tpl === 'bread') {
      l.push(pt(SPH, a, 0, -0.05, 0.02, 0, 0, 0, 0.09, 0.05, 0.06), pt(SPH, b, 0, -0.03, 0.02, 0, 0, 0, 0.06, 0.03, 0.04), pt(BOX, 0xfff4d6, 0.075, -0.05, 0.02, 0, 0, 0, 0.018, 0.045, 0.05));
    } else {
      l.push(pt(SPH, a, 0, -0.06, 0.02, 0, 0, 0, 0.065, 0.065, 0.065), pt(SPH, b, 0.02, -0.04, 0.05, 0, 0, 0, 0.026), pt(CONE, 0x5f9e55, 0, -0.0, 0.02, 0, 0, 0, 0.025, 0.04, 0.025));
    }
    return mesh(l);
  }
  var cache = {};
  /** Tool mesh (hidden until the clip shows it). name: hoe | can | pouch | sack | food; tier 0..3; def = item def (sack/food colours). */
  AT.tool = function (name, tier, def) {
    tier = Math.max(0, Math.min(3, tier | 0));
    var ic = def && def.icon, key = name + (name === 'hoe' || name === 'can' ? '_' + tier : '_' + (def ? def.id : '')), m = cache[key];
    if (m) return m;
    if (name === 'hoe') m = buildHoe(tier);
    else if (name === 'can') m = buildCan(tier);
    else if (name === 'pouch') m = buildPouch(ic && ic.c2 ? ic.c2 : undefined);
    else if (name === 'sack') m = buildSack(ic && ic.c1 ? ic.c1 : undefined);
    else m = buildFood(ic ? ic.tpl : 'bread', ic ? ic.c1 : undefined, ic ? ic.c2 : undefined);
    m.name = 'tool_' + key;
    return (cache[key] = m);
  };
  AT.hideAll = function () { for (var k in cache) cache[k].visible = false; };

  /* ------------------------------------------------------------ swoosh ribbon */
  var NT = 14;
  function Trail(color, width, life) {
    var geo = new THREE.BufferGeometry(), pos = new Float32Array(NT * 2 * 3), idx = [], i;
    for (i = 0; i < NT - 1; i++) { idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setIndex(idx);
    this.pos = pos; this.geo = geo; this.w = width; this.life = life;
    this.mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 4; this.mesh.raycast = function () {};
    this.px = new Float32Array(NT); this.py = new Float32Array(NT); this.pz = new Float32Array(NT); this.age = new Float32Array(NT);
    this.n = 0; this.on = false; R.scene.add(this.mesh);
    if (G.Scenes && G.Scenes.outdoorOnly) G.Scenes.outdoorOnly(this.mesh);
  }
  var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3(), _f = new THREE.Vector3();
  Trail.prototype.add = function (x, y, z) {
    var i;
    for (i = NT - 1; i > 0; i--) { this.px[i] = this.px[i - 1]; this.py[i] = this.py[i - 1]; this.pz[i] = this.pz[i - 1]; this.age[i] = this.age[i - 1]; }
    this.px[0] = x; this.py[0] = y; this.pz[0] = z; this.age[0] = 0; if (this.n < NT) this.n++;
  };
  Trail.prototype.update = function (dt) {
    var i, n = 0, k, w, cam = R.camera;
    for (i = 0; i < this.n; i++) { this.age[i] += dt; if (this.age[i] < this.life) n = i + 1; }
    this.n = n;
    if (n < 2) { this.mesh.visible = false; return; }
    cam.getWorldDirection(_f);
    for (i = 0; i < n; i++) {
      k = i < n - 1 ? i : i - 1;
      _a.set(this.px[k], this.py[k], this.pz[k]); _b.set(this.px[k + 1], this.py[k + 1], this.pz[k + 1]);
      _s.subVectors(_a, _b).cross(_f); if (_s.lengthSq() < 1e-8) _s.set(0, 1, 0); _s.normalize();
      w = this.w * (1 - this.age[i] / this.life) * (1 - i / (n + 1));
      this.pos[i * 6] = this.px[i] + _s.x * w; this.pos[i * 6 + 1] = this.py[i] + _s.y * w; this.pos[i * 6 + 2] = this.pz[i] + _s.z * w;
      this.pos[i * 6 + 3] = this.px[i] - _s.x * w; this.pos[i * 6 + 4] = this.py[i] - _s.y * w; this.pos[i * 6 + 5] = this.pz[i] - _s.z * w;
    }
    for (i = n; i < NT; i++) { this.pos[i * 6] = this.pos[i * 6 + 3] = this.pos[(n - 1) * 6]; this.pos[i * 6 + 1] = this.pos[i * 6 + 4] = this.pos[(n - 1) * 6 + 1]; this.pos[i * 6 + 2] = this.pos[i * 6 + 5] = this.pos[(n - 1) * 6 + 2]; }
    this.geo.attributes.position.needsUpdate = true; this.mesh.visible = true;
  };
  Trail.prototype.clear = function () { this.n = 0; this.mesh.visible = false; };
  AT.trail = function (color, width, life) { return new Trail(color, width, life); };

  /* ------------------------------------------------------------ emote marks ("!" and "z"), pooled billboards */
  function shapeBang() {
    var s = new THREE.Shape(); s.moveTo(-0.09, 0.5); s.lineTo(0.09, 0.5); s.lineTo(0.06, 0.13); s.lineTo(-0.06, 0.13); s.closePath();
    return [new THREE.ShapeGeometry(s), new THREE.CircleGeometry(0.09, 10)];
  }
  function shapeZ() {
    var s = new THREE.Shape(); s.moveTo(-0.2, 0.2); s.lineTo(0.2, 0.2); s.lineTo(0.2, 0.12); s.lineTo(-0.1, -0.12); s.lineTo(0.2, -0.12); s.lineTo(0.2, -0.2); s.lineTo(-0.2, -0.2); s.lineTo(-0.2, -0.12); s.lineTo(0.1, 0.12); s.lineTo(-0.2, 0.12); s.closePath();
    return [new THREE.ShapeGeometry(s)];
  }
  function mergeShapes(list) {
    var i, g, pos, out = [];
    for (i = 0; i < list.length; i++) {
      g = list[i].toNonIndexed ? list[i].toNonIndexed() : list[i]; pos = g.attributes.position;
      for (var j = 0; j < pos.count; j++) out.push(pos.getX(j), pos.getY(j), 0);
    }
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); return geo;
  }
  var emotes = [], ei = 0;
  function makeEmote(geo, c) {
    var inkM = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x5b3a29, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    var fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    var g = new THREE.Group(); inkM.scale.setScalar(1.28); inkM.position.z = -0.001; g.add(inkM); g.add(fill);
    g.visible = false; g.renderOrder = 8; inkM.renderOrder = 8; fill.renderOrder = 9; g.userData = { t: 9, life: 1, kind: '', x: 0, y: 0, z: 0, s: 1, ink: inkM, fill: fill };
    R.scene.add(g); g.raycast = function () {};
    return g;
  }
  var bangGeo = null, zGeo = null, NE = 4;
  AT.emote = function (kind, x, y, z, life, size) {
    if (!bangGeo) { bangGeo = mergeShapes(shapeBang()); zGeo = mergeShapes(shapeZ()); for (var i = 0; i < NE; i++) emotes.push(makeEmote(bangGeo, 0xffd24a)); }
    var g = emotes[ei], d = g.userData; ei = (ei + 1) % NE;
    d.kind = kind; d.t = 0; d.life = life || 0.9; d.x = x; d.y = y; d.z = z; d.s = size || 1;
    var geo = kind === 'z' ? zGeo : bangGeo, c = kind === 'z' ? 0xbfe3ff : 0xffd24a;
    d.ink.geometry = geo; d.fill.geometry = geo; d.fill.material.color.setHex(c); g.visible = true;
    return g;
  };
  var _q = new THREE.Quaternion();
  AT.update = function (dt) {
    var i, g, d, u, k;
    for (i = 0; i < emotes.length; i++) {
      g = emotes[i]; d = g.userData; if (!g.visible) continue;
      d.t += dt; u = d.t / d.life; if (u >= 1) { g.visible = false; continue; }
      k = d.s * (u < 0.18 ? (u / 0.18) * 1.25 : u < 0.3 ? 1.25 - 0.25 * ((u - 0.18) / 0.12) : 1) * (u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1);
      g.position.set(d.x, d.y + (d.kind === 'z' ? u * 0.35 : Math.min(u * 4, 1) * 0.06), d.z);
      g.quaternion.copy(R.camera.quaternion); g.scale.setScalar(Math.max(0.01, k));
      if (d.kind === 'z') g.rotateZ(Math.sin(d.t * 3) * 0.2);
    }
  };
})();
