/* Togie Valley - models.js
 * Procedural models (vertex-colored, toon-shaded, outlined): chibi character rig + procedural animation,
 * ground patch, tree, cube house with roof, tile cursor.
 * Conventions: 1 tile = 1 unit, y up, characters face +z (character's left = +x).
 * Depends on: THREE r128, core.js, render.js.
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || !window.Game || !window.Game.Render) {
    console.error('[models] THREE or render.js missing');
    return;
  }

  var Game = window.Game, Render = Game.Render, util = Game.util;
  var Models = Game.Models = {};

  /* ----------------------------------------------------------------- helpers */
  var _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
  var _col = new THREE.Color();

  // part(geometry, color, position[x,y,z], rotation[rx,ry,rz], scale[sx,sy,sz]); color = hex | Color | fn(x,y,z)
  function part(geo, color, p, r, s) {
    var m = new THREE.Matrix4();
    _E.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0, 'XYZ');
    _Q.setFromEuler(_E);
    _P.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
    _S.set(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1);
    m.compose(_P, _Q, _S);
    return { geo: geo, color: color, matrix: m };
  }

  function colorAt(c, x, y, z) {
    if (typeof c === 'function') c = c(x, y, z);
    if (c && c.isColor) return c;
    return _col.set(c);
  }

  // Bake parts (transform + color) into one non-indexed BufferGeometry with position/normal/color/smoothNormal.
  function mergeParts(parts) {
    var pos = [], nor = [], col = [];
    for (var k = 0; k < parts.length; k++) {
      var pt = parts[k];
      var g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
      g.applyMatrix4(pt.matrix);
      var p = g.attributes.position, n = g.attributes.normal;
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        pos.push(x, y, z);
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        var c = colorAt(pt.color, x, y, z);
        col.push(c.r, c.g, c.b);
      }
      g.dispose();
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    Render.addSmoothNormals(geo);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
  Models.part = part;
  Models.mergeParts = mergeParts;

  var geoCache = Object.create(null);
  function cached(key, build) { return geoCache[key] || (geoCache[key] = build()); }

  // Shared materials (created lazily). Same-uniform sharing keeps draw state changes low.
  var mats = Object.create(null);
  function mat(name) {
    if (mats[name]) return mats[name];
    switch (name) {
      case 'char': mats[name] = Render.toonMaterial({ seasonal: 0.08 }); break;
      case 'prop': mats[name] = Render.toonMaterial({ seasonal: 0, fade: true }); break;          // Stage 10.7: see-through when between camera and hero
      case 'foliage': mats[name] = Render.toonMaterial({ seasonal: 0.85, fade: true }); break;
      case 'ground': mats[name] = Render.toonMaterial({ seasonal: 1 }); break;
      case 'flat': mats[name] = Render.toonMaterial({ seasonal: 0, halftone: false }); break;
      default: mats[name] = Render.toonMaterial({});
    }
    return mats[name];
  }
  Models.material = mat;

  function mix(a, b, t) { return _col.set(a).lerp(new THREE.Color(b), util.clamp(t, 0, 1)); }

  /* --------------------------------------------------------------- animation */
  var KEYS = ['bob', 'hipsRY', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'headRX', 'headRY', 'headRZ',
    'armLX', 'armLZ', 'armRX', 'armRZ', 'legLX', 'legRX'];
  // Pose values (radians; swing X values: positive = forward; armLZ/armRZ: positive = outward; bob in world units).

  var LEG = 0.24;        // leg length = hips height
  var TORSO_H = 0.28;

  var Anim = Models.Anim = {
    KEYS: KEYS,
    newPose: function () {
      var p = {};
      for (var i = 0; i < KEYS.length; i++) p[KEYS[i]] = 0;
      return p;
    },
    reset: function (p) { for (var i = 0; i < KEYS.length; i++) p[KEYS[i]] = 0; return p; },

    // t = time in seconds
    idle: function (p, t) {
      Anim.reset(p);
      var b = Math.sin(t * 2.0);
      p.bob = b * 0.006;
      p.spineRX = b * 0.015;
      p.headRX = -b * 0.012 + Math.sin(t * 0.6) * 0.02;
      p.headRY = Math.sin(t * 0.45) * 0.12;
      p.headRZ = Math.sin(t * 0.9) * 0.03;
      p.armLZ = 0.07 + b * 0.015;
      p.armRZ = 0.07 - b * 0.015;
      p.armLX = Math.sin(t * 1.3) * 0.03;
      p.armRX = -Math.sin(t * 1.3) * 0.03;
      return p;
    },

    // ph = walk phase (radians, one full cycle = two steps)
    walk: function (p, ph) {
      Anim.reset(p);
      var s = Math.sin(ph), c = Math.cos(ph), A = 0.55;
      p.legLX = s * A; p.legRX = -s * A;
      p.armLX = -s * 0.6; p.armRX = s * 0.6;
      p.armLZ = 0.10; p.armRZ = 0.10;
      p.bob = -LEG * (1 - Math.cos(A * Math.abs(s))) + 0.012;
      p.hipsRY = s * 0.10; p.spineRY = -s * 0.14;
      p.hipsRZ = c * 0.03; p.spineRZ = -c * 0.03;
      p.spineRX = 0.07; p.headRX = -0.05; p.headRY = s * 0.04;
      return p;
    },

    run: function (p, ph) {
      Anim.reset(p);
      var s = Math.sin(ph), c = Math.cos(ph), A = 0.9;
      p.legLX = s * A; p.legRX = -s * A;
      p.armLX = -s * 1.0; p.armRX = s * 1.0;
      p.armLZ = 0.25; p.armRZ = 0.25;
      p.bob = -LEG * (1 - Math.cos(0.85 * Math.abs(s))) * 0.8 + 0.05 * (1 - Math.abs(s));
      p.hipsRY = s * 0.18; p.spineRY = -s * 0.25;
      p.hipsRZ = c * 0.04; p.spineRZ = -c * 0.04;
      p.spineRX = 0.2; p.headRX = -0.15; p.headRY = s * 0.06;
      return p;
    },

    // out = sum(poses[i] * weights[i])
    blend: function (out, poses, weights) {
      for (var i = 0; i < KEYS.length; i++) {
        var k = KEYS[i], v = 0;
        for (var j = 0; j < poses.length; j++) v += poses[j][k] * weights[j];
        out[k] = v;
      }
      return out;
    },

    // Write a pose onto the character's joints.
    apply: function (ch, p) {
      var J = ch.joints;
      J.hips.position.y = LEG + p.bob;
      J.hips.rotation.set(0, p.hipsRY, p.hipsRZ);
      J.spine.rotation.set(p.spineRX, p.spineRY, p.spineRZ);
      J.head.rotation.set(p.headRX, p.headRY, p.headRZ);
      J.shoulderL.rotation.set(-p.armLX, 0, p.armLZ);
      J.shoulderR.rotation.set(-p.armRX, 0, -p.armRZ);
      J.hipL.rotation.set(-p.legLX, 0, 0);
      J.hipR.rotation.set(-p.legRX, 0, 0);
    },

    // Advance a character's animation. speed = ground speed in units/s (0 idle, ~2 walk, ~4+ run).
    update: function (ch, dt, speed) {
      var A = ch.anim;
      var runT = util.smoothstep(2.9, 3.7, speed);
      var walkT = util.smoothstep(0.15, 0.7, speed) * (1 - runT);
      var idleT = Math.max(0, 1 - walkT - runT);
      var k = 1 - Math.exp(-10 * dt);
      A.w[0] += (idleT - A.w[0]) * k;
      A.w[1] += (walkT - A.w[1]) * k;
      A.w[2] += (runT - A.w[2]) * k;
      A.t += dt;
      var cycle = util.lerp(1.15, 1.9, runT);            // distance per full cycle (two steps)
      A.phase += dt * (speed / cycle) * Math.PI * 2;
      Anim.idle(A.p0, A.t);
      Anim.walk(A.p1, A.phase);
      Anim.run(A.p2, A.phase);
      Anim.blend(A.pose, A.poses, A.w);
      Anim.apply(ch, A.pose);
    }
  };

  /* --------------------------------------------------------------- character */
  var CHAR_DEFAULTS = {
    skin: 0xf6cfa8, hair: 0x6b3f2a, shirt: 0x6fb6e8, pants: 0x4f6fa8, boots: 0x6b4a33,
    belt: 0x8a5a3a, eyes: 0x2b2233, hairStyle: 'bun', hat: null, scale: 1, shadow: true
  };

  function buildHead(o) {
    var parts = [];
    parts.push(part(new THREE.SphereGeometry(0.3, 18, 14), o.skin, [0, 0.25, 0], null, [1, 0.92, 1]));
    parts.push(part(new THREE.SphereGeometry(0.325, 18, 12, 0, Math.PI * 2, 0, 1.6), o.hair,
      [0, 0.265, -0.01], [-0.3, 0, 0], [1, 0.95, 1.02]));
    var side = new THREE.SphereGeometry(0.09, 10, 8);
    parts.push(part(side, o.hair, [0.27, 0.17, 0.02], null, [0.8, 1.3, 0.9]));
    parts.push(part(side, o.hair, [-0.27, 0.17, 0.02], null, [0.8, 1.3, 0.9]));
    return mergeParts(parts);
  }

  // Hair bun is a separate mesh (pivot at the back of the head) so CharAnim can swing it.
  function buildBun(o) {
    return mergeParts([part(new THREE.SphereGeometry(0.12, 12, 10), o.hair, [0, 0.05, -0.03])]);
  }

  function buildFace(o) {
    var parts = [];
    var eye = new THREE.SphereGeometry(1, 10, 8);
    var hl = 0xffffff;
    parts.push(part(eye, o.eyes, [0.105, 0.23, 0.275], null, [0.036, 0.054, 0.02]));
    parts.push(part(eye, o.eyes, [-0.105, 0.23, 0.275], null, [0.036, 0.054, 0.02]));
    parts.push(part(eye, hl, [0.113, 0.248, 0.289], null, [0.013, 0.015, 0.008]));
    parts.push(part(eye, hl, [-0.097, 0.248, 0.289], null, [0.013, 0.015, 0.008]));
    parts.push(part(eye, 0xf4a0a0, [0.18, 0.17, 0.225], null, [0.05, 0.03, 0.016]));
    parts.push(part(eye, 0xf4a0a0, [-0.18, 0.17, 0.225], null, [0.05, 0.03, 0.016]));
    parts.push(part(eye, 0x8a4a4a, [0, 0.155, 0.283], null, [0.022, 0.008, 0.01]));
    return mergeParts(parts);
  }

  function buildTorso(o) {
    var parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.15, 0.17, TORSO_H, 12, 1), o.shirt, [0, TORSO_H / 2, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.176, 0.176, 0.045, 12, 1), o.belt, [0, 0.04, 0]));
    parts.push(part(new THREE.BoxGeometry(0.2, 0.16, 0.04), o.pants, [0, 0.16, 0.155]));
    parts.push(part(new THREE.BoxGeometry(0.035, 0.2, 0.03), o.pants, [0.065, 0.2, 0.15]));
    parts.push(part(new THREE.BoxGeometry(0.035, 0.2, 0.03), o.pants, [-0.065, 0.2, 0.15]));
    return mergeParts(parts);
  }

  function buildLeg(o) {
    var parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.062, 0.06, LEG, 8, 1), o.pants, [0, -LEG / 2, 0]));
    parts.push(part(new THREE.BoxGeometry(0.13, 0.08, 0.19), o.boots, [0, -0.2, 0.03]));
    return mergeParts(parts);
  }

  function buildArm(o) {
    var parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.048, 0.044, 0.19, 8, 1), o.shirt, [0, -0.095, 0]));
    parts.push(part(new THREE.SphereGeometry(0.055, 10, 8), o.skin, [0, -0.215, 0]));
    return mergeParts(parts);
  }

  function buildHat() {
    var parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 20, 1), 0xe8c872, [0, 0.46, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.25, 0.29, 0.2, 16, 1), 0xe8c872, [0, 0.55, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.295, 0.295, 0.05, 16, 1), 0xc24d3b, [0, 0.485, 0]));
    return mergeParts(parts);
  }

  function addMesh(parent, geo, outline, thin) {
    var m = new THREE.Mesh(geo, mat('char'));
    if (outline) Render.addOutline(m, thin);
    parent.add(m);
    return m;
  }

  // opts: skin, hair, shirt, pants, boots, belt, eyes, hairStyle ('bun'|'short'), hat (null|'straw'), scale, shadow
  Models.character = function (opts) {
    var o = {}, k;
    for (k in CHAR_DEFAULTS) o[k] = (opts && opts[k] !== undefined) ? opts[k] : CHAR_DEFAULTS[k];
    var key = [o.skin, o.hair, o.shirt, o.pants, o.boots, o.belt, o.eyes, o.hairStyle].join('_');

    var root = new THREE.Group(); root.name = 'character';
    var hips = new THREE.Group(); hips.name = 'hips'; hips.position.y = LEG; root.add(hips);
    var spine = new THREE.Group(); spine.name = 'spine'; hips.add(spine);
    var head = new THREE.Group(); head.name = 'head'; head.position.y = TORSO_H; spine.add(head);
    var shoulderL = new THREE.Group(); shoulderL.name = 'shoulderL'; shoulderL.position.set(0.19, 0.24, 0); spine.add(shoulderL);
    var shoulderR = new THREE.Group(); shoulderR.name = 'shoulderR'; shoulderR.position.set(-0.19, 0.24, 0); spine.add(shoulderR);
    var hipL = new THREE.Group(); hipL.name = 'hipL'; hipL.position.set(0.09, 0, 0); hips.add(hipL);
    var hipR = new THREE.Group(); hipR.name = 'hipR'; hipR.position.set(-0.09, 0, 0); hips.add(hipR);

    var torso = addMesh(spine, cached('torso_' + key, function () { return buildTorso(o); }), true);
    var headMesh = addMesh(head, cached('head_' + key, function () { return buildHead(o); }), true);
    var face = addMesh(head, cached('face_' + key, function () { return buildFace(o); }), false);
    var armGeo = cached('arm_' + key, function () { return buildArm(o); });
    var legGeo = cached('leg_' + key, function () { return buildLeg(o); });
    var armL = addMesh(shoulderL, armGeo, true, true);
    var armR = addMesh(shoulderR, armGeo, true, true);
    var legL = addMesh(hipL, legGeo, true, true);
    var legR = addMesh(hipR, legGeo, true, true);

    var attach = {
      hat: new THREE.Group(), handL: new THREE.Group(), handR: new THREE.Group(), back: new THREE.Group()
    };
    attach.hat.name = 'attachHat'; head.add(attach.hat);
    attach.handL.name = 'attachHandL'; attach.handL.position.set(0, -0.215, 0); shoulderL.add(attach.handL);
    attach.handR.name = 'attachHandR'; attach.handR.position.set(0, -0.215, 0); shoulderR.add(attach.handR);
    attach.back.name = 'attachBack'; attach.back.position.set(0, 0.15, -0.18); spine.add(attach.back);

    var bunJoint = null;
    if (o.hairStyle === 'bun') {
      bunJoint = new THREE.Group(); bunJoint.name = 'bun'; bunJoint.position.set(0, 0.29, -0.22); head.add(bunJoint);
      addMesh(bunJoint, cached('bun_' + o.hair, function () { return buildBun(o); }), true, true);
    }
    var hat = null;
    if (o.hat) {
      hat = addMesh(attach.hat, cached('hat', buildHat), true);
    }

    root.scale.setScalar(o.scale);

    var ch = {
      root: root,
      joints: { root: root, hips: hips, spine: spine, head: head, shoulderL: shoulderL, shoulderR: shoulderR, hipL: hipL, hipR: hipR, bun: bunJoint },
      look: o,
      attach: attach,
      parts: { torso: torso, head: headMesh, face: face, armL: armL, armR: armR, legL: legL, legR: legR, hat: hat },
      shadow: null,
      anim: null,
      update: function (dt, speed) { Anim.update(ch, dt, speed || 0); },
      dispose: function () {
        if (ch.shadow) { ch.shadow.remove(); ch.shadow = null; }
        if (root.parent) root.parent.remove(root);
      }
    };
    var p0 = Anim.newPose(), p1 = Anim.newPose(), p2 = Anim.newPose();
    ch.anim = { t: 0, phase: 0, w: [1, 0, 0], p0: p0, p1: p1, p2: p2, poses: [p0, p1, p2], pose: Anim.newPose() };
    Anim.idle(ch.anim.pose, 0);
    Anim.apply(ch, ch.anim.pose);

    if (o.shadow) ch.shadow = Render.addBlobShadow(root, 0.3 * o.scale, 0.34);
    return ch;
  };

  /* ------------------------------------------------------------------ ground */
  var GRASS_A = 0x8bd067, GRASS_B = 0x9bd972;

  // Rectangular tile ground, w x d tiles centered on the origin (tile edges on integers), with a dirt skirt.
  // opts: seed, skirt (depth), colorFn(tx, tz, rng) -> hex|Color|null (null = grass).
  Models.groundPatch = function (w, d, opts) {
    opts = opts || {};
    var rng = util.rng(opts.seed || 1337);
    var depth = opts.skirt !== undefined ? opts.skirt : 0.7;
    var pos = [], nor = [], col = [], idx = [];
    var gA = new THREE.Color(GRASS_A), gB = new THREE.Color(GRASS_B), tmp = new THREE.Color();
    var ox = -Math.floor(w / 2), oz = -Math.floor(d / 2);

    function quad(ax, az, bx, bz, cx, cz, dx, dz, y, n, c0, c1) {
      // vertex order matches (TL, TR, BR, BL); c0 for first two, c1 for last two
      var base = pos.length / 3;
      pos.push(ax, y[0], az, bx, y[0], bz, cx, y[1], cz, dx, y[1], dz);
      for (var i = 0; i < 4; i++) nor.push(n[0], n[1], n[2]);
      col.push(c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }

    var i, j;
    for (j = 0; j < d; j++) {
      for (i = 0; i < w; i++) {
        var tx = ox + i, tz = oz + j;
        var cc = opts.colorFn ? opts.colorFn(tx, tz, rng) : null;
        if (cc === null || cc === undefined) tmp.copy(gA).lerp(gB, rng() * 0.6 + ((tx + tz) & 1) * 0.25);
        else tmp.set(cc);
        quad(tx, tz, tx + 1, tz, tx + 1, tz + 1, tx, tz + 1, [0, 0], [0, 1, 0], tmp, tmp);
      }
    }

    var X0 = ox, X1 = ox + w, Z0 = oz, Z1 = oz + d;
    var top = new THREE.Color(0x9a6b45), bot = new THREE.Color(0x5b3f2e);
    function side(p0x, p0z, p1x, p1z) {
      var tx = p1x - p0x, tz = p1z - p0z, l = Math.sqrt(tx * tx + tz * tz);
      tx /= l; tz /= l;
      quad(p0x, p0z, p1x, p1z, p1x, p1z, p0x, p0z, [0, -depth], [-tz, 0, tx], top, bot);
    }
    if (depth > 0) {
      side(X0, Z1, X1, Z1);   // +z
      side(X1, Z0, X0, Z0);   // -z
      side(X1, Z1, X1, Z0);   // +x
      side(X0, Z0, X0, Z1);   // -x
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, mat('ground'));
    mesh.name = 'groundPatch';
    mesh.userData.bounds = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    return mesh;
  };

  /* -------------------------------------------------------------------- tree */
  function buildTree(variant) {
    var trunk = 0x7b5238, parts = [];
    if (variant === 1) {
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.16, 0.7, 8, 1), trunk, [0, 0.35, 0]));
      var layers = [[0.85, 1.0, 0.95], [0.68, 0.95, 1.55], [0.5, 0.9, 2.1], [0.3, 0.8, 2.6]];
      var pine = function (x, y) { return mix(0x3f8a52, 0x6fb86a, (y - 0.6) / 2.4); };
      for (var i = 0; i < layers.length; i++) {
        parts.push(part(new THREE.ConeGeometry(layers[i][0], layers[i][1], 10, 1), pine, [0, layers[i][2], 0]));
      }
    } else {
      parts.push(part(new THREE.CylinderGeometry(0.12, 0.17, 0.95, 8, 1), trunk, [0, 0.47, 0]));
      var leaf = function (x, y) { return mix(0x4a9648, 0x93cf5c, (y - 0.9) / 1.7); };
      var blob = new THREE.SphereGeometry(1, 14, 10);
      parts.push(part(blob, leaf, [0, 1.55, 0], null, [0.8, 0.8, 0.8]));
      parts.push(part(blob, leaf, [-0.55, 1.25, 0.2], null, [0.55, 0.55, 0.55]));
      parts.push(part(blob, leaf, [0.5, 1.3, -0.25], null, [0.6, 0.6, 0.6]));
      parts.push(part(blob, leaf, [0.1, 2.05, 0.1], null, [0.5, 0.5, 0.5]));
    }
    return mergeParts(parts);
  }

  // opts: variant (0 round, 1 pine), scale, rotationY, shadow
  Models.tree = function (opts) {
    opts = opts || {};
    var v = opts.variant | 0;
    var mesh = new THREE.Mesh(cached('tree' + v, function () { return buildTree(v); }), mat('foliage'));
    mesh.name = 'tree';
    var s = opts.scale || 1;
    mesh.scale.setScalar(s);
    mesh.rotation.y = opts.rotationY || 0;
    Render.addOutline(mesh);
    if (opts.shadow !== false) mesh.userData.shadow = Render.addBlobShadow(mesh, (v === 1 ? 0.75 : 0.9) * s, 0.3);
    mesh.userData.dispose = function () {
      if (mesh.userData.shadow) { mesh.userData.shadow.remove(); mesh.userData.shadow = null; }
      if (mesh.parent) mesh.parent.remove(mesh);
    };
    return mesh;
  };

  /* ------------------------------------------------------------------- house */
  function buildHouse() {
    var parts = [];
    var stone = 0xb9b0a4, wall = 0xf3e2c0, roof = 0xc4573a, wood = 0x7a4a2b;
    parts.push(part(new THREE.BoxGeometry(2.74, 0.25, 2.74), stone, [0, 0.125, 0]));
    parts.push(part(new THREE.BoxGeometry(2.6, 1.45, 2.6), wall, [0, 0.975, 0]));
    var roofFn = function (x, y) { return mix(0xb44a30, 0xd4684a, (y - 1.7) / 1.3); };
    parts.push(part(new THREE.ConeGeometry(2.2, 1.3, 4, 1, true), roofFn, [0, 2.35, 0], [0, Math.PI / 4, 0]));
    parts.push(part(new THREE.BoxGeometry(0.55, 1.0, 0.1), 0x3a2a22, [0, 0.75, 1.33]));   // doorway; the leaf is hinged in js/world_react.js
    parts.push(part(new THREE.BoxGeometry(0.9, 0.08, 0.4), stone, [0, 0.04, 1.5]));
    parts.push(part(new THREE.BoxGeometry(0.62, 0.55, 0.06), wood, [0.85, 1.1, 1.31]));
    parts.push(part(new THREE.BoxGeometry(0.5, 0.43, 0.08), 0x9fd3e6, [0.85, 1.1, 1.33]));
    parts.push(part(new THREE.BoxGeometry(0.62, 0.55, 0.06), wood, [-0.85, 1.1, 1.31]));
    parts.push(part(new THREE.BoxGeometry(0.5, 0.43, 0.08), 0x9fd3e6, [-0.85, 1.1, 1.33]));
    parts.push(part(new THREE.BoxGeometry(0.38, 1.0, 0.38), 0x9a8a7a, [0.7, 2.55, -0.5]));
    return mergeParts(parts);
  }

  // 3x3-tile footprint centered on the mesh origin (place at x.5, z.5 to align to tiles). Door faces +z.
  Models.house = function (opts) {
    opts = opts || {};
    var mesh = new THREE.Mesh(cached('house', buildHouse), mat('prop'));
    mesh.name = 'house';
    Render.addOutline(mesh);
    if (opts.shadow !== false) mesh.userData.shadow = Render.addBlobShadow(mesh, 2.0, 0.28, 2.0);
    mesh.userData.dispose = function () {
      if (mesh.userData.shadow) { mesh.userData.shadow.remove(); mesh.userData.shadow = null; }
      if (mesh.parent) mesh.parent.remove(mesh);
    };
    return mesh;
  };

  /* ------------------------------------------------------------------ cursor */
  // Flat 1x1 tile highlight (no outline, no halftone). Place at tile center, y ~ 0.03.
  Models.tileCursor = function (color) {
    var geo = new THREE.BoxGeometry(0.92, 0.04, 0.92);
    Render.colorize(geo, color !== undefined ? color : 0xffe27a);
    var m = new THREE.Mesh(geo, mat('flat'));
    m.name = 'tileCursor';
    m.visible = false;
    return m;
  };
})();
