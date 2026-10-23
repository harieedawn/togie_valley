/* Togie Valley - seat.js (Stage 16 D3): Game.Seat - wooden fishing stools/chairs, reusable sit routine, pier + shore dressing.
 * API: Seat.sit({tx,tz,facing,onSeated,onFail}) walks to the tile, turns toward `facing`, plays the sit clip, calls onSeated().
 *      Seat.stand() plays the stand clip (Player.standUp). Seat.busy() true while walking/turning/sitting down. Seat.cancel().
 *      Seat.layout(seats, tileType, facingOf) pure + node-readable -> {items, stats}; Seat.build(Town) adds 2 draw calls.
 * Any bench/seat can call Seat.sit; the clips 'sit'/'stand' (anim_data.js) are fired by Player.sitAt/standUp events. */
(function () {
  'use strict';
  var G = window.Game = window.Game || {};
  var S = G.Seat = G.Seat || {};
  var DY = 0.1, SEAT_TOP = 0.2, BACK = 0.3;
  var FV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  var COL = { wood: 0xc98b4f, dark: 0x8c5a34, light: 0xdfae72, rope: 0xd8c08a, iron: 0x5a4a52, cream: 0xfff1d0, red: 0xe8715d, blue: 0x6fa8dc, green: 0x7fcf7a, yellow: 0xffd166, warm: 0xffd27a };
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  /* ---- stool / chair variants (local space: front = +z, seat top at SEAT_TOP above deck) ---- */
  function stool(P, v, r) {
    var h = SEAT_TOP, j = 0.9 + r * 0.2, c = r > 0.5 ? COL.wood : COL.light, i, a;
    if (v === 0) {            // round three-leg stool
      P.cyl(0.2 * j, 0.2 * j, 0.05, c, 0, h - 0.025, 0, 12);
      for (i = 0; i < 3; i++) { a = i * 2.094 + 0.5; P.box(0.05, h - 0.04, 0.05, COL.dark, Math.sin(a) * 0.13, (h - 0.04) / 2, Math.cos(a) * 0.13); }
    } else if (v === 1) {     // square stool with a cross brace
      P.box(0.38 * j, 0.05, 0.38 * j, c, 0, h - 0.025, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { P.box(0.05, h - 0.05, 0.05, COL.dark, q[0] * 0.15 * j, (h - 0.05) / 2, q[1] * 0.15 * j); });
      P.box(0.3 * j, 0.03, 0.03, COL.dark, 0, 0.09, 0);
    } else if (v === 2) {     // chair with backrest
      P.box(0.4, 0.05, 0.38, c, 0, h - 0.025, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { P.box(0.05, h - 0.05, 0.05, COL.dark, q[0] * 0.16, (h - 0.05) / 2, q[1] * 0.15); });
      P.box(0.05, 0.3, 0.05, COL.dark, -0.16, h + 0.15, -0.17); P.box(0.05, 0.3, 0.05, COL.dark, 0.16, h + 0.15, -0.17);
      P.box(0.38, 0.07, 0.04, c, 0, h + 0.2, -0.17); P.box(0.38, 0.05, 0.04, c, 0, h + 0.1, -0.17);
    } else if (v === 3) {     // log stump seat
      P.cyl(0.21 * j, 0.24 * j, h - 0.02, COL.dark, 0, (h - 0.02) / 2, 0, 10);
      P.cyl(0.19 * j, 0.19 * j, 0.03, COL.light, 0, h - 0.015, 0, 10);
    } else if (v === 4) {     // stool with a soft red cushion
      P.cyl(0.2, 0.2, 0.04, c, 0, h - 0.1, 0, 12); P.cyl(0.2, 0.2, 0.04, c, 0, 0.07, 0, 12);
      P.cyl(0.04, 0.04, h - 0.12, COL.dark, 0, 0.14, 0, 8); P.cyl(0.18, 0.18, 0.07, COL.red, 0, h - 0.04, 0, 12);
    } else {                  // low plank bench (two legs)
      P.box(0.46, 0.05, 0.3, c, 0, h - 0.025, 0);
      P.box(0.05, h - 0.05, 0.26, COL.dark, -0.19, (h - 0.05) / 2, 0); P.box(0.05, h - 0.05, 0.26, COL.dark, 0.19, (h - 0.05) / 2, 0);
    }
  }

  /* ---- small dressing props (local space, footprint radius <= 0.16) ---- */
  var PROPS = {
    bucket: function (P) {
      P.cyl(0.12, 0.09, 0.2, COL.blue, 0, 0.1, 0, 10); P.cyl(0.095, 0.095, 0.02, 0x3b6fb0, 0, 0.19, 0, 10);
      P.box(0.22, 0.015, 0.015, COL.iron, 0, 0.27, 0); P.sph(0.03, COL.red, 0.04, 0.2, 0.03);
    },
    basket: function (P) {
      P.cyl(0.15, 0.12, 0.14, COL.light, 0, 0.07, 0, 10); P.cyl(0.13, 0.13, 0.02, COL.dark, 0, 0.145, 0, 10);
      P.box(0.12, 0.03, 0.05, 0xa9c4d8, 0.02, 0.15, 0.02); P.box(0.05, 0.03, 0.03, 0xa9c4d8, 0.09, 0.15, -0.04);
    },
    rope: function (P) {
      P.torus(0.12, 0.035, COL.rope, 0, 0.04, 0); P.torus(0.1, 0.035, COL.rope, 0, 0.09, 0); P.cyl(0.07, 0.07, 0.07, COL.rope, 0, 0.05, 0, 8);
    },
    lantern: function (P) {
      P.cyl(0.03, 0.04, 0.8, COL.dark, 0, 0.4, 0, 8); P.box(0.2, 0.025, 0.025, COL.dark, 0.07, 0.78, 0);
      P.box(0.12, 0.14, 0.12, COL.warm, 0.15, 0.66, 0); P.box(0.15, 0.03, 0.15, COL.iron, 0.15, 0.75, 0); P.box(0.15, 0.03, 0.15, COL.iron, 0.15, 0.585, 0);
    },
    sign: function (P) {       // post only; the Vietnamese board is a separate plane (see build)
      P.cyl(0.03, 0.04, 0.75, COL.dark, 0, 0.375, 0, 8); P.box(0.42, 0.2, 0.03, COL.light, 0, 0.62, 0.03);
    },
    crates: function (P) {     // stack of crates (blocks its tile)
      P.box(0.4, 0.28, 0.4, COL.wood, -0.18, 0.14, -0.14); P.box(0.4, 0.28, 0.4, COL.light, 0.2, 0.14, -0.1);
      P.box(0.36, 0.28, 0.36, COL.light, 0.02, 0.14, 0.26); P.box(0.34, 0.26, 0.34, COL.wood, 0, 0.41, -0.02);
      P.box(0.42, 0.03, 0.05, COL.dark, 0, 0.56, -0.02);
    }
  };
  var CYCLE = ['bucket', 'basket', 'rope', 'lantern', 'sign', 'basket', 'bucket', 'lantern'];

  /* Pure layout. seats: [{tx,tz}], tileType(tx,tz) -> string, facingOf(seat) -> 'n'|'s'|'e'|'w'.
   * Item: {kind, ox, oz, ry, v, r, tile:{tx,tz}, block}. All prims are described by recorders so a node test can bound them. */
  S.layout = function (seats, tileType, facingOf) {
    var items = [], used = {}, rows = {}, n = 0;
    seats.forEach(function (s) { used[s.tx + ',' + s.tz] = 1; (rows[s.tz] = rows[s.tz] || []).push(s); });
    seats.forEach(function (s, i) {
      var f = facingOf(s) || 'n', fv = FV[f];
      items.push({ kind: 'stool', v: Math.floor(hash(s.tx, s.tz) * 6 + i) % 6, r: hash(s.tz, s.tx), ox: s.tx + 0.5, oz: s.tz + 0.5, ry: Math.atan2(fv[0], fv[1]), tile: { tx: s.tx, tz: s.tz }, block: false });
    });
    Object.keys(rows).forEach(function (z) {
      var row = rows[z].slice().sort(function (a, b) { return a.tx - b.tx; }), f = facingOf(row[0]) || 'n', bv = [-FV[f][0], -FV[f][1]], cand = [], k;
      row.forEach(function (s) { cand.push(s.tx - 1, s.tx + 1); });
      cand = cand.filter(function (x, i) { return cand.indexOf(x) === i && !used[x + ',' + z] && tileType(x, +z) === 'pier'; }).sort(function (a, b) { return a - b; });
      cand.forEach(function (x) {
        var kind = CYCLE[n % CYCLE.length]; n++;
        items.push({ kind: kind, v: 0, r: hash(x, +z), ox: x + 0.5 + bv[0] * BACK, oz: +z + 0.5 + bv[1] * BACK, ry: Math.atan2(bv[0], bv[1]) + (hash(x, +z) - 0.5) * 0.5, tile: { tx: x, tz: +z }, block: false, back: bv });
      });
    });
    return { items: items };
  };

  /* Recorder: collects prims in item-local space; bounds() returns world AABB after the item's Y rotation (ry rounded for bounds only by exact math). */
  function recorder() {
    var R = { prims: [] };
    R.box = function (w, h, d, c, x, y, z) { R.prims.push({ t: 'box', w: w, h: h, d: d, c: c, x: x, y: y, z: z }); };
    R.cyl = function (rt, rb, h, c, x, y, z, seg) { R.prims.push({ t: 'cyl', rt: rt, rb: rb, h: h, c: c, x: x, y: y, z: z, seg: seg || 10 }); };
    R.sph = function (r, c, x, y, z) { R.prims.push({ t: 'sph', r: r, c: c, x: x, y: y, z: z }); };
    R.torus = function (r, tube, c, x, y, z) { R.prims.push({ t: 'tor', r: r, tube: tube, c: c, x: x, y: y, z: z }); };
    return R;
  }
  function primExt(p) {   // local half extents on x/z and y range
    if (p.t === 'box') return { hx: p.w / 2, hz: p.d / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 };
    if (p.t === 'cyl') { var r = Math.max(p.rt, p.rb); return { hx: r, hz: r, y0: p.y - p.h / 2, y1: p.y + p.h / 2 }; }
    if (p.t === 'sph') return { hx: p.r, hz: p.r, y0: p.y - p.r, y1: p.y + p.r };
    return { hx: p.r + p.tube, hz: p.r + p.tube, y0: p.y - p.tube, y1: p.y + p.tube };
  }
  S.itemPrims = function (it) {
    var R = recorder();
    if (it.kind === 'stool') stool(R, it.v, it.r); else PROPS[it.kind](R);
    return R.prims;
  };
  S.bounds = function (it) {   // world AABB {x0,x1,z0,z1,y0,y1}
    var c = Math.cos(it.ry), s = Math.sin(it.ry), b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 };
    S.itemPrims(it).forEach(function (p) {
      var e = primExt(p), ex = Math.abs(c) * e.hx + Math.abs(s) * e.hz, ez = Math.abs(s) * e.hx + Math.abs(c) * e.hz;
      var wx = it.ox + p.x * c + p.z * s, wz = it.oz - p.x * s + p.z * c;
      b.x0 = Math.min(b.x0, wx - ex); b.x1 = Math.max(b.x1, wx + ex); b.z0 = Math.min(b.z0, wz - ez); b.z1 = Math.max(b.z1, wz + ez);
      b.y0 = Math.min(b.y0, e.y0); b.y1 = Math.max(b.y1, e.y1);
    });
    return b;
  };
  S.crateItem = function (tx, tz) { return { kind: 'crates', v: 0, r: 0.5, ox: tx + 0.5, oz: tz + 0.5, ry: (hash(tx, tz) - 0.5) * 0.4, tile: { tx: tx, tz: tz }, block: true }; };

  if (typeof window === 'undefined' || !window.THREE) return;   // node: layout/bounds only
  var P = G.Player, E = G.Events, W = G.World, R = G.Render, Mo = G.Models;

  /* ---------------------------------------------------------- sit routine */
  var pend = null;
  S.busy = function () { return !!pend; };
  S.cancel = function () { pend = null; };
  S.stand = function () { pend = null; if (P.sitting) P.standUp(); };
  /** o: {tx,tz,facing,onSeated,onFail}. Walks to the tile, turns, sits down (clip 'sit'), then onSeated(). */
  S.sit = function (o) {
    if (!o || P.sitting || pend) return false;
    var me = { o: o, ph: 'walk', t: 0 }, c = { x: o.tx + 0.5, z: o.tz + 0.5 };
    pend = me;
    function turn() { if (pend !== me) return; me.ph = 'turn'; me.t = 0; P.speed = 0; if (o.facing) P.face(o.facing); }
    if (Math.abs(P.pos.x - c.x) < 0.3 && Math.abs(P.pos.z - c.z) < 0.3) turn();
    else if (!P.walkTo(o.tx, o.tz, turn, function () { if (pend === me) { pend = null; if (o.onFail) o.onFail(); } })) { pend = null; return false; }
    return true;
  };
  G.Loop.onFrame(function (dt) {
    var me = pend; if (!me) return;
    if (me.ph === 'turn') {
      me.t += dt;
      if (P.speed > 0.2 || Math.abs(P.pos.x - (me.o.tx + 0.5)) > 0.45 || Math.abs(P.pos.z - (me.o.tz + 0.5)) > 0.45) { pend = null; return; }   // player walked away
      if (me.t >= 0.3) { P.sitAt(me.o.tx, me.o.tz); me.ph = 'sit'; me.t = 0; }
    } else if (me.ph === 'sit') {
      me.t += dt;
      if (!P.sitting) { pend = null; return; }
      if (me.t >= 0.5) { pend = null; if (me.o.onSeated) me.o.onSeated(); }
    }
  }, 40);
  E.on('scene:changed', function () { pend = null; });

  /* seated idle: slow head look-around on top of the breathing CharAnim already adds (applied last, additive) */
  var lt = 0, look = 0, lookGoal = 0, lookNext = 2;
  G.Loop.onFrame(function (dt) {
    var h = P.hero, j = h && h.joints && h.joints.head, st = G.Fishing && G.Fishing.state;
    if (!j) return;
    if (!P.sitting || (st && st !== 'idle' && st !== 'wait') || (G.AnimClips && G.AnimClips.busy())) { look *= Math.max(0, 1 - dt * 6); lookGoal = 0; return; }
    lt += dt; lookNext -= dt;
    if (lookNext <= 0) { lookGoal = (Math.random() - 0.5) * 0.7; lookNext = 2.5 + Math.random() * 3.5; }
    look += (lookGoal - look) * (1 - Math.exp(-2.2 * dt));
    j.rotation.y += look + Math.sin(lt * 0.5) * 0.04;
    j.rotation.x += Math.sin(lt * 0.35 + 1) * 0.02;
  }, 102.5);

  /* ---------------------------------------------------------- building */
  function geomOf(p) {
    var g;
    if (p.t === 'box') g = new THREE.BoxGeometry(p.w, p.h, p.d);
    else if (p.t === 'cyl') g = new THREE.CylinderGeometry(p.rt, p.rb, p.h, p.seg);
    else if (p.t === 'sph') g = new THREE.SphereGeometry(p.r, 8, 6);
    else { g = new THREE.TorusGeometry(p.r, p.tube, 6, 12); g.rotateX(Math.PI / 2); }
    return g;
  }
  function merge(list) {   // list of {g, c}
    var pos = [], nor = [], col = [], k, q, g, a, b, cc = new THREE.Color();
    list.forEach(function (e) {
      g = e.g.index ? e.g.toNonIndexed() : e.g; a = g.attributes.position.array; b = g.attributes.normal.array; cc.setHex(e.c);
      for (k = 0; k < a.length; k += 3) { pos.push(a[k], a[k + 1], a[k + 2]); nor.push(b[k], b[k + 1], b[k + 2]); col.push(cc.r, cc.g, cc.b); }
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }
  function boardTexture(text) {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
    function paint() {
      var c = cv.getContext('2d'), fs = 30;
      c.fillStyle = '#dfae72'; c.fillRect(0, 0, 128, 48); c.strokeStyle = '#8c5a34'; c.lineWidth = 5; c.strokeRect(2.5, 2.5, 123, 43);
      c.fillStyle = '#2b2024'; c.textAlign = 'center'; c.textBaseline = 'middle';
      do { c.font = '800 ' + fs + 'px "Baloo 2","Google Sans",sans-serif'; fs -= 2; } while (fs > 10 && c.measureText(text).width > 108);
      c.fillText(text, 64, 27);
    }
    paint(); var tex = new THREE.CanvasTexture(cv);
    if (document.fonts && document.fonts.load) document.fonts.load('800 24px "Baloo 2"', text).then(function () { paint(); tex.needsUpdate = true; }, function () {});
    return tex;
  }

  function reachable(seats, from) {   // BFS over walkable tiles: every seat must stay reachable from `from`
    var seen = {}, q = [[from.tx, from.tz]], i, d = [[1, 0], [-1, 0], [0, 1], [0, -1]], left = seats.length, c, k, nx, nz;
    seen[from.tx + ',' + from.tz] = 1;
    for (i = 0; i < q.length; i++) {
      c = q[i]; for (k = 0; k < seats.length; k++) if (seats[k].tx === c[0] && seats[k].tz === c[1]) left--;
      for (k = 0; k < 4; k++) { nx = c[0] + d[k][0]; nz = c[1] + d[k][1]; if (!seen[nx + ',' + nz] && W.isWalkableTile(nx, nz)) { seen[nx + ',' + nz] = 1; q.push([nx, nz]); } }
    }
    return left <= 0;
  }

  S.stats = { items: 0, draws: 0, crates: null };
  S.build = function (T) {
    if (S.group) return S.group;
    var seats = W.getMarkers('seat'); if (!seats.length) return null;
    var faceMap = {}; W.listInteractables('seat').forEach(function (it) { faceMap[it.tile.tx + ',' + it.tile.tz] = it.facing; });
    var tt = function (x, z) { return W.tileType(x + 0.5, z + 0.5); };
    var lay = S.layout(seats, tt, function (s) { return faceMap[s.tx + ',' + s.tz]; }), items = lay.items;

    // shore crates: free sand/grass tile touching water near the pier, away from paths, markers and interactables
    var cx = 0, cz = 0, cand = [], x, z, dx, dz, open, ia = W.listInteractables(), door = W.getMarkers('door')[0];
    seats.forEach(function (s) { cx += s.tx; cz += s.tz; }); cx /= seats.length; cz /= seats.length;
    for (z = Math.floor(cz) - 9; z <= cz + 9; z++) for (x = Math.floor(cx) - 14; x <= cx + 14; x++) {
      var ty = tt(x, z); if (ty !== 'grass' && ty !== 'sand') continue;
      if (tt(x + 1, z) !== 'water' && tt(x - 1, z) !== 'water' && tt(x, z + 1) !== 'water' && tt(x, z - 1) !== 'water') continue;
      open = 0; for (dz = -1; dz <= 1; dz++) for (dx = -1; dx <= 1; dx++) if (W.isWalkableTile(x + dx, z + dz)) open++;
      if (open < 7) continue;
      var bad = false; ia.forEach(function (it) { if (Math.abs(it.tile.tx - x) + Math.abs(it.tile.tz - z) < 3) bad = true; });
      items.forEach(function (it) { if (Math.abs(it.tile.tx - x) + Math.abs(it.tile.tz - z) < 2) bad = true; });
      if (bad) continue;
      cand.push({ x: x, z: z, d: Math.abs(x - cx) + Math.abs(z - cz) });
    }
    cand.sort(function (a, b) { return a.d - b.d; });
    var start = door ? { tx: door.tx, tz: door.tz + 1 } : P.tile();
    for (var i = 0; i < cand.length && i < 12; i++) {
      W.setBlocked(cand[i].x, cand[i].z, true);
      if (reachable(seats, start)) { items.push(S.crateItem(cand[i].x, cand[i].z)); S.stats.crates = cand[i]; break; }
      W.setBlocked(cand[i].x, cand[i].z, false);
    }

    var list = [], boards = [], grp = new THREE.Group(); grp.name = 'seat_dressing';
    items.forEach(function (it) {
      S.itemPrims(it).forEach(function (p) {
        var g = geomOf(p); g.translate(p.x, p.y, p.z); g.rotateY(it.ry); g.translate(it.ox, DY, it.oz); list.push({ g: g, c: p.c });
      });
      if (it.kind === 'sign') boards.push(it);
    });
    var mesh = new THREE.Mesh(merge(list), Mo.material('prop')); mesh.name = 'seat_props';
    R.addSmoothNormals(mesh.geometry); R.addOutline(mesh, false); grp.add(mesh); S.stats.draws = 1;
    if (boards.length) {   // one shared texture, one plane per sign (same material = no extra state change)
      var mat = new THREE.MeshBasicMaterial({ map: boardTexture('Chỗ câu cá') }), texts = ['Chỗ câu cá', 'Câu vui nhé!', 'Cẩn thận nước sâu'];
      boards.forEach(function (it, i) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.16), i ? new THREE.MeshBasicMaterial({ map: boardTexture(texts[i % 3]) }) : mat);
        var s = Math.sin(it.ry), c = Math.cos(it.ry);
        m.position.set(it.ox + 0.0465 * s, DY + 0.62, it.oz + 0.0465 * c); m.rotation.y = it.ry; m.name = 'seat_sign'; grp.add(m); S.stats.draws++;
      });
    }
    S.group = grp; S.items = items; S.stats.items = items.length; T.group.add(grp);
    return grp;
  };
})();
