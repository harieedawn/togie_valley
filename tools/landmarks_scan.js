'use strict';
// Shared by tools/check.js section 17 and manual probing: replicates the runtime scatter + scenery layout, returns occupancy.
var path = require('path'), fs = require('fs');
module.exports = function (root) {
  var WMap = require(path.join(root, 'js/world_map.js')), rows = WMap.rows, H = rows.length, W = rows[0].length;
  var Layout = require(path.join(root, 'js/layout.js')), SLay = require(path.join(root, 'js/scenery_layout.js'));
  var base = { '.': 'grass', '=': 'path', t: 'soil', l: 'locked', '~': 'water', p: 'pier', B: 'grass', s: 'pier', ',': 'sand', o: 'stone' };
  function ch(x, z) { return x < 0 || z < 0 || x >= W || z >= H ? ' ' : rows[z].charAt(x); }
  function type(x, z) { var c = ch(x, z); return c === ' ' ? null : (base[c] || 'building'); }
  var marks = {}, names = { D: 'door', B: 'bin', C: 'shopCounter', K: 'workshopCounter', M: 'fishStall', s: 'seat' }, x, z;
  for (z = 0; z < H; z++) for (x = 0; x < W; x++) { var n = names[ch(x, z)]; if (n) (marks[n] = marks[n] || []).push({ tx: x, tz: z }); }
  var lay = Layout.scatter({ W: W, H: H, seed: 1234, type: type, markers: function (k) { return marks[k] || []; }, isFarm: function (a, b) { return a > 11 && a < 28 && b > 6 && b < 19; } });
  var occ = {}; lay.solids.concat(lay.bushTiles).forEach(function (c) { occ[c[0] + ',' + c[1]] = 1; });
  SLay.styleScatter(lay.trees, rows);
  var sc = SLay.build({ rows: rows, features: WMap.features, seed: 777, avoid: lay.trees, blocked: function (a, b) { return !!occ[a + ',' + b]; } });
  var pts = [];
  [lay.trees, lay.bushes, lay.rocks, sc.trees, sc.bushes, sc.rocks, sc.props].forEach(function (l, i) { l.forEach(function (o) { pts.push({ x: o.x !== undefined ? o.x : o.tx + 0.5, z: o.z !== undefined ? o.z : o.tz + 0.5, k: i }); }); });
  var solids = lay.solids.concat(sc.solids);
  // flat decor (flowers) may sit anywhere; only hard items count
  return { rows: rows, W: W, H: H, ch: ch, pts: pts, solids: solids, marks: marks,
    conflicts: function (r, pad) { var c = 0; pad = pad || 0.55; pts.forEach(function (p) { if (p.x > r[0] - pad && p.x < r[2] + pad && p.z > r[1] - pad && p.z < r[3] + pad) c++; });
      solids.forEach(function (s) { if (s[0] + 1 > r[0] && s[0] < r[2] && s[1] + 1 > r[1] && s[1] < r[3]) c++; }); return c; } };
};
if (require.main === module) {
  var S = module.exports(path.join(__dirname, '..'));
  var want = { windmill: [3, 3, 36, 9], shed: [2, 2, 19, 6], shrine: [3, 3, 5, 15], board: [2, 1, 37, 20.5], compost: [1, 1, 10, 15.5], trough: [2, 1, 10, 17] };
  Object.keys(want).forEach(function (k) {
    var w = want[k], best = [];
    for (var z = 0; z < S.H; z++) for (var x = 0; x < S.W; x++) {
      var ok = true, i, j; for (j = 0; j < w[1] + 0 && ok; j++) for (i = 0; i < w[0]; i++) { if (S.ch(x + i, z + j) !== '.') { ok = false; break; } }
      if (!ok) continue;
      // keep a 1-tile ring free of path/water/buildings
      for (j = -1; j <= w[1] && ok; j++) for (i = -1; i <= w[0]; i++) { var c = S.ch(x + i, z + j); if ('lt=op~HSWFDCKMBs'.indexOf(c) >= 0 && (i < 0 || j < 0 || i >= w[0] || j >= w[1]) && (i === -1 || j === -1 || i === w[0] || j === w[1]) && false) ok = false; }
      if (!ok) continue;
      if (S.conflicts([x, z, x + w[0], z + w[1]], 0.35)) continue;
      best.push([x, z, Math.hypot(x - w[2], z - w[3])]);
    }
    best.sort(function (a, b) { return a[2] - b[2]; });
    console.log(k, JSON.stringify(best.slice(0, 5).map(function (b) { return [b[0], b[1], +b[2].toFixed(1)]; })));
  });
}
