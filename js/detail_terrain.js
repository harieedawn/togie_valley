/* Togie Valley - detail_terrain.js (Stage 10.5 Part 4): ground + pier + water decor.
 * Game.DetailTerrain.build() once (after Scenery.build): clover/flower patches, darker path edges + pebbles, cobbled plaza in front of
 * the shops, pier nails / rope / lanterns / crates / net piles, ripple rings around posts. Meshes go into Scenery.group (hidden indoors).
 * Added draw calls: 3 (flat decals 1, 3D bits + thin outline 2).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.DetailKit || !G.World || !G.WorldMap || !G.Scenery) { console.error('[detail_terrain] missing deps'); return; }
  var K = G.DetailKit, W = G.World, Mo = G.Models, WM = G.WorldMap, MW = WM.W, MH = WM.H, DY = 0.1, hash = K.hash;
  var T = { group: null };

  function tt(x, z) { return W.tileType(x + 0.5, z + 0.5); }
  function farm(x, z) { return x > 10 && x < 29 && z > 5 && z < 20; }

  T.build = function () {
    if (T.group) return T.group;
    var grp = T.group = G.Scenery.group, fl = new K.Merger(), bits = new K.Merger(), x, z, i, k, r, t;
    var seat = {}, E = {}, posts = {};
    W.getMarkers('seat').forEach(function (s) { seat[s.tx + ',' + s.tz] = 1; });

    // protos
    var pebble = K.M([K.ico(0.05, 0, 0xb9b1a4, 0, 0.02, 0, [1, 0.55, 1])]);
    var pebble2 = K.M([K.ico(0.04, 0, 0x9a9387, 0, 0.015, 0, [1, 0.5, 1.2])]);
    var crate = K.M([K.box(0.38, 0.34, 0.38, 0xc98b4f, 0, 0.17, 0), K.box(0.4, 0.06, 0.4, 0x8c5a34, 0, 0.06, 0), K.box(0.4, 0.06, 0.4, 0x8c5a34, 0, 0.29, 0)]);
    var lantern = K.M([K.box(0.14, 0.17, 0.14, 0xffd98a, 0, 0.09, 0), K.box(0.18, 0.04, 0.18, 0x5a3a22, 0, 0.2, 0), K.cone(0.1, 0.09, 0x5a3a22, 0, 0.26, 0, 4), K.box(0.18, 0.03, 0.18, 0x5a3a22, 0, 0, 0), K.box(0.02, 0.1, 0.02, 0x5a3a22, 0, 0.32, 0)]);
    var net = K.M([K.ico(0.3, 1, 0xd8c28a, 0, 0.05, 0, [1, 0.28, 0.8]), K.ico(0.16, 0, 0xc4ad72, 0.12, 0.1, 0.06, [1, 0.4, 1]), K.cyl(0.03, 0.03, 0.2, 0xd9473f, -0.2, 0.08, 0.1, 5, [0, 0, 1.4])]);
    var ropeX = K.M([K.box(1.02, 0.035, 0.035, 0xe6d3a0, -0.5, 0, 0, [0, 0, -0.09]), K.box(1.02, 0.035, 0.035, 0xe6d3a0, 0.5, 0, 0, [0, 0, 0.09])]);

    // ---- grass: clover + flower patches (flat decals) ----
    for (z = 0; z < MH; z++) for (x = 0; x < MW; x++) {
      if (tt(x, z) !== 'grass' || farm(x, z)) continue;
      r = hash(x * 7 + 3, z * 13 + 1);
      var n = K.noise(x * 0.35 + 40, z * 0.35);
      if (n > 0.62 && r < 0.55) {   // clover: 3 dark-green dots per leaf cluster
        for (k = 0; k < 3; k++) {
          var cx = x + 0.15 + hash(x + k * 5, z) * 0.7, cz = z + 0.15 + hash(x, z + k * 5) * 0.7;
          fl.quad(cx - 0.06, cz - 0.06, cx + 0.06, cz + 0.06, 0.018, 0x74b957);
          fl.quad(cx + 0.02, cz - 0.1, cx + 0.14, cz + 0.02, 0.018, 0x74b957);
          fl.quad(cx - 0.12, cz + 0.0, cx, cz + 0.12, 0.018, 0x66ab4d);
        }
      } else if (n < 0.3 && r < 0.4) {   // tiny flower patch
        var col = [0xffffff, 0xffd166, 0xff9bb3, 0xc9a7ff][Math.floor(hash(x, z * 3) * 4)];
        for (k = 0; k < 5; k++) {
          var fx = x + 0.1 + hash(x + k, z * 2) * 0.8, fz = z + 0.1 + hash(x * 2, z + k) * 0.8;
          fl.quad(fx - 0.035, fz - 0.035, fx + 0.035, fz + 0.035, 0.02, k % 2 ? col : 0xffe9a8);
        }
      }
    }

    // ---- path edges (darker strip) + pebbles ----
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (z = 0; z < MH; z++) for (x = 0; x < MW; x++) {
      t = tt(x, z); if (t !== 'path' && t !== 'stone') continue;
      var hex = t === 'path' ? 0xcfa56c : 0xa8a193;
      for (i = 0; i < 4; i++) {
        var nt = tt(x + dirs[i][0], z + dirs[i][1]); if (nt !== 'grass' && nt !== 'sand') continue;
        var w = 0.11, x0 = i === 3 ? x : i === 1 ? x + 1 - w : x, x1 = i === 3 ? x + w : i === 1 ? x + 1 : x + 1, z0 = i === 0 ? z : i === 2 ? z + 1 - w : z, z1 = i === 0 ? z + w : i === 2 ? z + 1 : z + 1;
        fl.quad(x0, z0, x1, z1, 0.016, hex);
        if (hash(x * 3 + i, z * 5) < 0.4) {
          var along = hash(x + i, z + 9), px = i % 2 ? (i === 1 ? x + 0.9 : x + 0.1) : x + along, pz = i % 2 ? z + along : (i === 0 ? z + 0.1 : z + 0.9);
          bits.add(hash(x, z + i) < 0.5 ? pebble : pebble2, px, 0, pz, hash(z, x + i) * 6, 1);
          if (hash(x + 4, z + i) < 0.5) bits.add(pebble2, px + 0.09, 0, pz + 0.06, 1, 1);
        }
      }
    }

    // ---- cobbled plaza in front of the shops ----
    var sb = W.getMarkers('shopCounter')[0], fb = W.getMarkers('fishStall')[0];
    if (sb && fb) {
      var pz0 = Math.max(sb.tz, fb.tz) + 1;
      for (x = sb.tx - 4; x <= fb.tx + 2; x++) {
        t = tt(x, pz0); if (!t || t === 'water' || t === 'pier') continue;
        fl.quad(x, pz0, x + 1, pz0 + 1, 0.02, 0x8f8473);
        for (i = 0; i < 4; i++) {
          var cx0 = x + (i % 2) * 0.5 + 0.04, cz0 = pz0 + Math.floor(i / 2) * 0.5 + 0.04;
          fl.quad(cx0, cz0, cx0 + 0.42, cz0 + 0.42, 0.026, [0xd6cfc1, 0xc9c2b4, 0xe0d9cb, 0xbfb8a8][Math.floor(hash(x * 4 + i, pz0) * 4)]);
        }
      }
    }

    // ---- pier: nails, posts' rope + lanterns, crates, net piles ----
    for (z = 0; z < MH; z++) for (x = 0; x < MW; x++) {
      if (tt(x, z) !== 'pier') continue;
      for (i = 0; i < 4; i++) {
        var d = dirs[i]; if (tt(x + d[0], z + d[1]) !== 'water') continue;
        var e = d[1] ? z + (d[1] > 0 ? 1 : 0) : x + (d[0] > 0 ? 1 : 0);
        if (d[1]) { E['h:' + x + ',' + e] = 1; posts[x + ',' + e] = posts[x + 1 + ',' + e] = 1; } else { E['v:' + e + ',' + z] = 1; posts[e + ',' + z] = posts[e + ',' + z + 1] = 1; }
      }
      for (i = 0; i < 4; i++) for (k = 0; k < 2; k++) fl.quad(x + i * 0.25 + 0.09, z + (k ? 0.9 : 0.06), x + i * 0.25 + 0.145, z + (k ? 0.945 : 0.115), DY + 0.013, 0x5a3a22);
    }
    var pk = Object.keys(posts), kx, kz;
    pk.forEach(function (key) {
      var p = key.split(','), px = +p[0], pz = +p[1];
      if ((px + pz) % 2) return;   // same filter as Town.pier posts
      if (E['h:' + px + ',' + pz] && E['h:' + (px + 1) + ',' + pz] && posts[(px + 2) + ',' + pz]) { bits.add(ropeX, px + 1, DY + 0.38, pz, 0, 1); }
      if (E['v:' + px + ',' + pz] && E['v:' + px + ',' + (pz + 1)] && posts[px + ',' + (pz + 2)]) bits.add(ropeX, px, DY + 0.38, pz + 1, Math.PI / 2, 1);
      if (hash(px * 3, pz * 7) < 0.4) bits.add(lantern, px, DY + 0.5, pz, 0, 1);
    });
    var ring = K.M([K.P(new THREE.RingGeometry(0.2, 0.26, 12), 0xd9f6fa, [0, 0, 0], [-Math.PI / 2, 0, 0])]);
    pk.forEach(function (key) {
      var p = key.split(','), px = +p[0], pz = +p[1];
      if ((px + pz) % 2) return;
      for (kx = -1; kx <= 1; kx += 2) for (kz = -1; kz <= 1; kz += 2) {
        if (tt(px + (kx < 0 ? -1 : 0), pz + (kz < 0 ? -1 : 0)) !== 'water') continue;
        fl.add(ring, px + kx * 0.12, -0.105, pz + kz * 0.12, 0, 1); kx = 2; break;
      }
    });
    // crates + net piles on pier tiles that touch the water edge (never on seats), pushed against the edge
    for (z = 0; z < MH; z++) for (x = 0; x < MW; x++) {
      if (tt(x, z) !== 'pier' || seat[x + ',' + z] || x < 40) continue;
      r = hash(x * 11, z * 17); if (r > 0.12) continue;
      for (i = 0; i < 4; i++) {
        var dd = dirs[i]; if (tt(x + dd[0], z + dd[1]) !== 'water') continue;
        var ox = x + 0.5 + dd[0] * 0.28, oz = z + 0.5 + dd[1] * 0.28;
        if (r < 0.06) { bits.add(crate, ox, DY, oz, hash(x, z) * 1.5, 1); if (r < 0.03) bits.add(crate, ox + 0.05, DY + 0.34, oz, 0.5, 0.8); }
        else bits.add(net, ox, DY, oz, hash(z, x) * 6, 1);
        break;
      }
    }

    var fg = fl.geometry(), bg = bits.geometry();
    if (fg) grp.add(K.mesh(fg, Mo.material('flat'), 'detail_decals', false));
    if (bg) grp.add(K.mesh(bg, Mo.material('prop'), 'detail_bits', true, true));
    return grp;
  };
  G.DetailTerrain = T;
})();
