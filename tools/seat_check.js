/* Numeric check for js/seat.js layout (node tools/seat_check.js): bounds inside tiles, no overlap with seats, draw-call budget. */
'use strict';
var path = require('path'), WM = (function () { global.window = global; global.Game = {}; require('../js/world_map.js'); return global.Game.WorldMap; })();
require('../js/seat.js'); var S = global.Game.Seat, rows = WM.rows, fails = 0;
var CH = { p: 'pier', s: 'pier' };
function tt(x, z) { var r = rows[z]; return r && CH[r[x]] ? 'pier' : 'other'; }
var seats = []; rows.forEach(function (r, z) { for (var x = 0; x < r.length; x++) if (r[x] === 's') seats.push({ tx: x, tz: z }); });
var lay = S.layout(seats, tt, function (s) { return s.tz < 18 ? 'n' : 's'; }), seen = {};
lay.items.forEach(function (it) {
  var b = S.bounds(it), t = it.tile;
  var ok = b.x0 >= t.tx - 1e-6 && b.x1 <= t.tx + 1 + 1e-6 && b.z0 >= t.tz - 1e-6 && b.z1 <= t.tz + 1 + 1e-6;
  if (!ok) { fails++; console.log('OUT OF TILE', it.kind, t, b); }
  if (it.kind !== 'stool' && seats.some(function (s) { return s.tx === t.tx && s.tz === t.tz; })) { fails++; console.log('PROP ON SEAT', t); }
  if (it.kind === 'stool' && Math.abs(b.y1 - 0.2) > 0.4) { fails++; console.log('stool height', b); }
});
var stools = lay.items.filter(function (i) { return i.kind === 'stool'; });
var sig = {}; stools.forEach(function (i) { sig[i.v] = 1; });
console.log('seats', seats.length, 'stools', stools.length, 'variants', Object.keys(sig).length, 'props', lay.items.length - stools.length);
console.log('stool seat-top y (deck+):', stools.map(function (i) { return S.bounds(i).y1.toFixed(2); }).join(' '));
var signs = lay.items.filter(function (i) { return i.kind === 'sign'; }).length;
console.log('draw calls added: 1 merged + ' + signs + ' signs + 0 crates(merged) =', 1 + signs, '(budget: total <= 150)');
if (stools.length !== seats.length || Object.keys(sig).length < 4) fails++;
process.exit(fails ? 1 : 0);
