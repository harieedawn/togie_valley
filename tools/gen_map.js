#!/usr/bin/env node
/* Togie Valley - tools/gen_map.js (Stage 10.5 Part 3): one-shot generator for js/world_map.js (90x60).
 * Input: tools/map_stage10.txt (the original 56x36 map, every tile keeps its coordinates). Extension only to the EAST and SOUTH.
 * Run `node tools/gen_map.js` to regenerate; after that js/world_map.js is the source of truth and may be hand-edited
 * (this generator is only kept for reference). Extra legend vs world.js: `,` sand (walkable)  `o` stone path (walkable).
 * Also writes tools/map_preview.png if python3+PIL exist (not required).
 */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var root = path.resolve(__dirname, '..');
var W = 90, H = 60;
var src = fs.readFileSync(path.join(root, 'tools/map_stage10.txt'), 'utf8').split('\n').filter(Boolean);
var g = [], x, z;
for (z = 0; z < H; z++) { g.push([]); for (x = 0; x < W; x++) g[z].push(z < src.length && x < src[0].length ? src[z].charAt(x) : '.'); }
function get(x, z) { return x < 0 || z < 0 || x >= W || z >= H ? null : g[z][x]; }
function set(x, z, c) { if (x >= 0 && z >= 0 && x < W && z < H) g[z][x] = c; }
function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
var ORIG_WATER = {};
for (z = 0; z < src.length; z++) for (x = 0; x < src[0].length; x++) if (src[z].charAt(x) === '~') ORIG_WATER[x + ',' + z] = 1;

/* ---- lake: union of wobbly ellipses (tile centres), never west of x=47 except the original water ---- */
function blob(cx, cz, rx, rz, px, pz, seed) {
  var dx = (px - cx) / rx, dz = (pz - cz) / rz, d = Math.sqrt(dx * dx + dz * dz), th = Math.atan2(dz, dx);
  var r = 1 + 0.12 * Math.sin(3 * th + seed) + 0.08 * Math.sin(5 * th + seed * 2.1) + 0.05 * Math.sin(8 * th + seed * 0.7) + (vnoise(px * 0.45, pz * 0.45) - 0.5) * 0.14;
  return d < r;
}
var LAKE = [[67, 19, 22, 13.5, 1.1], [79, 31, 9, 8, 2.0], [74, 9, 10, 5.5, 0.5], [57, 7, 7, 4.5, 1.7], [55, 31, 7, 5.5, 2.6], [87, 20, 6, 8, 0.9]];
function isLake(tx, tz) {
  if (tx < 47 || tz < 3) return false;   // keep a land corridor along the north edge (z0-2)
  var px = tx + 0.5, pz = tz + 0.5;
  for (var i = 0; i < LAKE.length; i++) if (blob(LAKE[i][0], LAKE[i][1], LAKE[i][2], LAKE[i][3], px, pz, LAKE[i][4])) return true;
  return false;
}
for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (get(x, z) === '.' && isLake(x, z)) set(x, z, '~');
// island (sand, unreachable) north of the pier line, away from the seat columns
for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
  var di = Math.hypot(x + 0.5 - 78, z + 0.5 - 13.5);
  if (get(x, z) === '~' && di < 2.6 + (vnoise(x * 0.7, z * 0.7) - 0.5) * 1.2) set(x, z, ',');
}

/* ---- stream (2-3 tiles wide) from the north edge to the lake; bridge on the main path, stone ford further down ---- */
var STREAM = [[30, -2], [31, 4], [30, 9], [30.5, 14], [30.5, 17.5], [30.5, 19.5], [32, 23], [36, 27], [41, 29.5], [47, 31], [52, 31.5]];
var streamTiles = {};
for (var s = 0; s < STREAM.length - 1; s++) {
  var A = STREAM[s], B = STREAM[s + 1], len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.ceil(len / 0.2), k;
  for (k = 0; k <= n; k++) {
    var t = k / n, px2 = A[0] + (B[0] - A[0]) * t + Math.sin(t * 6 + s) * 0.25, pz2 = A[1] + (B[1] - A[1]) * t;
    for (z = Math.floor(pz2) - 2; z <= Math.floor(pz2) + 2; z++) for (x = Math.floor(px2) - 2; x <= Math.floor(px2) + 2; x++)
      if (Math.hypot(x + 0.5 - px2, z + 0.5 - pz2) < 1.05) streamTiles[x + ',' + z] = 1;
  }
}
var bx0 = 99, bx1 = -1;
Object.keys(streamTiles).forEach(function (kk) {
  var p = kk.split(','), tx = +p[0], tz = +p[1], c = get(tx, tz);
  if (c === '.' || c === '~') set(tx, tz, '~');
  else if (c === '=' && (tz === 18 || tz === 19)) { set(tx, tz, 'p'); bx0 = Math.min(bx0, tx); bx1 = Math.max(bx1, tx); }
  else if (c) throw new Error('stream hits ' + c + ' at ' + kk);
});
// bridge: stream tiles in rows 18-19 + one plank tile on each bank
[18, 19].forEach(function (zz) { for (x = bx0 - 1; x <= bx1 + 1; x++) if (get(x, zz) === '=' || get(x, zz) === '~' || get(x, zz) === 'p') set(x, zz, 'p'); });
// stone ford (2 columns) across the lower stream
var FORD = [38, 39];
FORD.forEach(function (fx) { for (z = 20; z < 40; z++) if (get(fx, z) === '~' && streamTiles[fx + ',' + z]) set(fx, z, 'o'); });

/* ---- pier: walkway x55-67 on z18-19 and an end platform x68-72 z16-21 (same pattern as the old x50-54 platform) ---- */
for (x = 55; x <= 67; x++) { set(x, 18, 'p'); set(x, 19, 'p'); }
var plat = ['pspsp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'pspsp'];
for (z = 0; z < 6; z++) for (x = 0; x < 5; x++) set(68 + x, 16 + z, plat[z].charAt(x));
// guarantee deep water all around the new pier (a clear moat of water 1 tile beyond the platform + walkway)
for (z = 12; z <= 26; z++) for (x = 55; x <= 75; x++) if (get(x, z) === '.' || get(x, z) === ',') set(x, z, '~');
// limit the southward cast from the platform seats (seat z21): a sandbar at z31-32 keeps max cast about 9 tiles
for (z = 31; z <= 32; z++) for (x = 66; x <= 73; x++) if (get(x, z) === '~') set(x, z, ',');

/* ---- sand shore: grass within 1-3 tiles of lake water (stream: patchy 1 tile) ---- */
var dist = [];
for (z = 0; z < H; z++) { dist.push([]); for (x = 0; x < W; x++) dist[z].push(99); }
var q = [];
for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (g[z][x] === '~') { dist[z][x] = 0; q.push([x, z]); }
while (q.length) {
  var c0 = q.shift(), dd = dist[c0[1]][c0[0]];
  [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(function (d) {
    var nx = c0[0] + d[0], nz = c0[1] + d[1];
    if (nx < 0 || nz < 0 || nx >= W || nz >= H || dist[nz][nx] <= dd + 1 || dd >= 4) return;
    dist[nz][nx] = dd + 1; q.push([nx, nz]);
  });
}
function nearStream(tx, tz) { for (var j = -3; j <= 3; j++) for (var i = -3; i <= 3; i++) if (streamTiles[(tx + i) + ',' + (tz + j)]) return true; return false; }
for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
  if (g[z][x] !== '.') continue;
  var dl = dist[z][x], wide = 1 + (vnoise(x * 0.35 + 3, z * 0.35) > 0.62 ? 2 : (vnoise(x * 0.5, z * 0.5 + 9) > 0.35 ? 1 : 0));
  if (nearStream(x, z) && x < 47) { if (dl <= 1 && vnoise(x * 0.8, z * 0.8) > 0.55) set(x, z, ','); continue; }
  if (dl <= wide) set(x, z, ',');
}

/* ---- stone path branches (axis-aligned runs; only over grass/sand; stop at water) ---- */
function put(tx, tz) { var c = get(tx, tz); if (c === '.' || c === ',') set(tx, tz, 'o'); }
function run(x0, z0, x1, z1) {
  var dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0), cx = x0, cz = z0;
  for (;;) { if (get(cx, cz) === '~' || get(cx, cz) === null) return; put(cx, cz); if (cx === x1 && cz === z1) return; cx += dx; cz += dz; }
}
function plaza(cx, cz, r) { for (var j = -r; j <= r; j++) for (var i = -r; i <= r; i++) if (i * i + j * j <= r * r + 0.5) put(cx + i, cz + j); }
run(8, 15, 3, 15); run(3, 15, 3, 5); plaza(3, 4, 2); run(3, 4, 21, 4); plaza(23, 4, 1);               // B1 west meadow trail
run(16, 20, 16, 40); run(16, 30, 5, 30); plaza(4, 30, 1); plaza(16, 44, 3);                           // B2 picnic + grove
run(19, 44, 30, 44); plaza(31, 44, 1); run(13, 44, 7, 44); plaza(6, 44, 1);                           // B2 grove trails
run(44, 20, 44, 28); run(44, 28, 49, 28); plaza(50, 28, 1);                                           // B3 south beach
run(43, 17, 43, 6); run(43, 6, 52, 6); plaza(53, 6, 1);                                               // B4 north shore

var rows = g.map(function (r) { return r.join(''); });
// sanity: every original non-grass tile is unchanged except tiles that the new features deliberately replace
var changed = 0;
for (z = 0; z < src.length; z++) for (x = 0; x < src[0].length; x++) {
  var o = src[z].charAt(x), nw = rows[z].charAt(x);
  if (o !== nw && o !== '.') { changed++; if (!((o === '=' || o === '~') && nw === 'p')) throw new Error('original tile changed ' + o + '->' + nw + ' at ' + x + ',' + z); }
}

var features = {
  meadows: [[12, 4, 13, 3.8], [38, 6, 6, 3.6], [62, 48, 12, 6], [41, 38, 6, 4], [8, 52, 6, 4]],   // cx,cz,rx,rz (flower meadows)
  grove: [20, 48, 14, 8], clearing: [16, 44, 3.6], orchard: [1, 21, 6, 34],                        // ellipse / ellipse / x0,z0,x1,z1
  forests: [[82, 5, 7, 3], [82, 53, 7, 4], [50, 50, 8, 6]],
  picnic: [4, 30], campfire: [16, 44], beach: [50, 28], northBeach: [53, 6], lookout: [23, 4], plazaW: [3, 4], bridge: [bx0, bx1],
  goals: [[3, 4], [23, 4], [4, 30], [16, 44], [31, 44], [6, 44], [50, 28], [53, 6], [bx0 - 2, 18], [bx1 + 2, 18], [37, 28], [41, 28]]
};
var out = '/* Togie Valley - world_map.js (Stage 10.5 Part 3): 90x60 outdoor map. Source of truth for terrain (hand-editable).\n' +
  ' * Node-readable (tools/check.js) and browser (Game.WorldMap). Extended from the 56x36 map only to the EAST and SOUTH: all old coordinates are unchanged.\n' +
  ' * Legend: . grass  = path  t soil  l locked plot  ~ water  p pier/bridge planks  , sand  o stone path  H/S/W/F footprints  D B C K M s n m markers (see world.js).\n' +
  ' * `features` = scenery hints (read by scenery_layout.js): ellipses are [cx,cz,rx,rz] in tiles.\n */\n' +
  '(function (root) {\n  \'use strict\';\n  var rows = [\n' + rows.map(function (r) { return "    '" + r + "'"; }).join(',\n') + '\n  ];\n' +
  '  var M = { W: ' + W + ', H: ' + H + ', rows: rows, features: ' + JSON.stringify(features) + ' };\n' +
  '  if (typeof module !== \'undefined\' && module.exports) module.exports = M;\n  if (root.Game) root.Game.WorldMap = M;\n})(typeof window !== \'undefined\' ? window : this);\n';
fs.writeFileSync(path.join(root, 'js/world_map.js'), out);
console.log('world_map.js written ' + W + 'x' + H + ', bridge x' + bx0 + '..' + bx1);

// optional preview
try {
  var pal = { '.': '#9bd36a', '=': '#e6c48f', t: '#8a5a3b', l: '#c98f5a', '~': '#4fb0cf', p: '#bd7f45', ',': '#f0e0a0', o: '#b9b2a6', H: '#e8715d', S: '#f2a65a', W: '#8f7bd0', F: '#5aa0c0' };
  var lines = ['P3', W * 8 + ' ' + H * 8, '255'];
  var buf = [];
  for (z = 0; z < H; z++) for (var yy = 0; yy < 8; yy++) { for (x = 0; x < W; x++) { var cc = pal[rows[z].charAt(x)] || '#ff00ff', rgb = [1, 3, 5].map(function (i) { return parseInt(cc.substr(i, 2), 16); }); for (var xx = 0; xx < 8; xx++) buf.push(rgb.join(' ')); } }
  var tmp = path.join(process.env.MAP_PREVIEW_DIR || path.join(root, 'tools'), 'map_preview.ppm');
  fs.writeFileSync(tmp, lines.join('\n') + '\n' + buf.join('\n') + '\n');
  cp.spawnSync('python3', ['-c', 'from PIL import Image;Image.open(r"' + tmp + '").save(r"' + tmp.replace('.ppm', '.png') + '")']);
  fs.unlinkSync(tmp);
} catch (e) { /* preview is optional */ }
