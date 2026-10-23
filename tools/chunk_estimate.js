#!/usr/bin/env node
/* Togie Valley - tools/chunk_estimate.js (Stage 14B): estimates draw calls of the chunked instanced groups (fill + outline per non-empty chunk)
 * for a camera window sliding over the map (portrait / landscape ground footprints). Same layout inputs as tools/check.js. Usage: node tools/chunk_estimate.js */
'use strict';
var path = require('path'), root = path.resolve(__dirname, '..');
var WMap = require(path.join(root, 'js/world_map.js')), rows = WMap.rows, H = rows.length, W = rows[0].length;
var Layout = require(path.join(root, 'js/layout.js')), SLay = require(path.join(root, 'js/scenery_layout.js'));
var base = { '.': 'grass', '=': 'path', t: 'soil', l: 'locked', '~': 'water', p: 'pier', B: 'grass', s: 'pier', ',': 'sand', o: 'stone' };
function ch(x, z) { return x < 0 || z < 0 || x >= W || z >= H ? null : rows[z].charAt(x); }
function type(x, z) { var c = ch(x, z); return c ? (base[c] || 'building') : null; }
var marks = {}, names = { D: 'door', B: 'bin', C: 'shopCounter', K: 'workshopCounter', M: 'fishStall', s: 'seat' }, x, z;
for (z = 0; z < H; z++) for (x = 0; x < W; x++) { var n = names[ch(x, z)]; if (n) (marks[n] = marks[n] || []).push({ tx: x, tz: z }); }
var lay = Layout.scatter({ W: W, H: H, seed: 1234, type: type, markers: function (k) { return marks[k] || []; }, isFarm: function (a, b) { return a > 11 && a < 28 && b > 6 && b < 19; } });
var occ = {}; lay.solids.concat(lay.bushTiles).forEach(function (c) { occ[c[0] + ',' + c[1]] = 1; });
SLay.styleScatter(lay.trees, rows);
var sc = SLay.build({ rows: rows, features: WMap.features, seed: 777, avoid: lay.trees, blocked: function (a, b) { return !!occ[a + ',' + b]; } });
var SIZES = { trees: +process.argv[2] || 45, bushes: +process.argv[3] || 45, flowers: +process.argv[4] || 45, wild: +process.argv[5] || 24 };   // chunk sizes in tiles (must match Decor/Scenery opts.chunk)
var MIN_CHUNK = +process.argv[6] || 100;   // groups with fewer instances stay one mesh (must match Chunks.MIN)
var groups = {};   // name -> {size, outline, items}
function add(name, size, outline, list, kf) { var g = groups[name] = groups[name] || { size: size, outline: outline, items: [] }; list.forEach(function (o) { g.items.push({ x: o.x, z: o.z, k: kf ? kf(o) : '' }); }); }
var all = lay.trees.concat(sc.trees);
['oak', 'pine', 'birch', 'fruit', 'willow'].forEach(function (sp) { add('trees:' + sp, SIZES.trees, true, all.filter(function (t) { return (t.k || 'oak') === sp || (sp === 'oak' && !/pine|birch|fruit|willow/.test(t.k || '')); })); });
add('bush', SIZES.bushes, true, lay.bushes); add('lbush', SIZES.bushes, true, sc.bushes); add('flowers', SIZES.flowers, true, lay.flowers); add('wild', SIZES.wild, false, sc.flowers);
var chunks = [], total = 0;
Object.keys(groups).forEach(function (nm) {
  var g = groups[nm], cells = {}; if (g.items.length < MIN_CHUNK) g.size = 1e6;
  g.items.forEach(function (o) { var k = Math.floor(o.x / g.size) + ',' + Math.floor(o.z / g.size); var c = cells[k] = cells[k] || { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; c.x0 = Math.min(c.x0, o.x); c.x1 = Math.max(c.x1, o.x); c.z0 = Math.min(c.z0, o.z); c.z1 = Math.max(c.z1, o.z); });
  Object.keys(cells).forEach(function (k) { var c = cells[k]; chunks.push({ g: nm, calls: g.outline ? 2 : 1, x0: c.x0 - 3, x1: c.x1 + 3, z0: c.z0 - 3, z1: c.z1 + 3 }); total += g.outline ? 2 : 1; });
  console.log(nm + ': ' + g.items.length + ' instances in ' + Object.keys(cells).length + ' chunks');
});
console.log('all chunks drawn at once (no culling): ' + total + ' calls (old unchunked: ' + Object.keys(groups).length * 2 + ' calls)');
function worst(w, h) {
  var best = 0, bx = 0, bz = 0, ox, oz;
  for (oz = -h / 2; oz < H - h / 2; oz += 2) for (ox = -w / 2; ox < W - w / 2; ox += 2) {
    var c = 0; chunks.forEach(function (k) { if (k.x1 >= ox && k.x0 <= ox + w && k.z1 >= oz && k.z0 <= oz + h) c += k.calls; });
    if (c > best) { best = c; bx = ox; bz = oz; }
  }
  return best;
}
console.log('worst window 22x34 tiles (portrait): ' + worst(22, 34) + ' calls; 36x22 (landscape): ' + worst(36, 22) + ' calls; 14x14: ' + worst(14, 14) + ' calls');
