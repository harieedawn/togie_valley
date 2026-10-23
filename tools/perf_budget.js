#!/usr/bin/env node
/* Togie Valley - tools/perf_budget.js (Stage 15G). Static count of meshes/geometries/materials per module; exits 1 on budget overrun. */
'use strict';
var fs = require('fs'), path = require('path');
var root = path.resolve(__dirname, '..'), dir = path.join(root, 'js');
var BUDGET = { totalMeshes: 130, totalGeoms: 240, totalMats: 60, perModuleMeshes: 45, perFrameNew: 0 };
var RX = {
  mesh: /new THREE\.(Mesh|InstancedMesh|Points|LineSegments|Line|SkinnedMesh)\(/g,
  geom: /new THREE\.\w*Geometry\(/g,
  mat: /new THREE\.(\w*Material)\(/g,
  outline: /\bR\.addOutline\(/g
};
function cnt(s, rx) { return (s.match(rx) || []).length; }
var rows = [], tot = { mesh: 0, geom: 0, mat: 0 }, errors = 0, warns = 0;
fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) {
  var s = fs.readFileSync(path.join(dir, f), 'utf8');
  var r = { f: f, mesh: cnt(s, RX.mesh) + cnt(s, RX.outline), geom: cnt(s, RX.geom), mat: cnt(s, RX.mat), frameNew: 0 };
  // per-frame allocation scan: `new THREE.Vector/Color/...` inside functions named update/animate/tick/frame
  var re = /function\s+(update\w*|animate\w*|tick\w*|frame\w*|onFrame\w*)\s*\([^)]*\)\s*\{/g, m;
  while ((m = re.exec(s))) {
    var i = re.lastIndex, d = 1;
    while (i < s.length && d > 0) { var ch = s[i++]; if (ch === '{') d++; else if (ch === '}') d--; }
    var body = s.slice(re.lastIndex, i);
    r.frameNew += cnt(body, /new THREE\.(Vector[234]|Color|Quaternion|Matrix[34]|Euler|Box3|Sphere)\(/g);
  }
  tot.mesh += r.mesh; tot.geom += r.geom; tot.mat += r.mat;
  if (r.mesh || r.geom || r.mat || r.frameNew) rows.push(r);
});
rows.sort(function (a, b) { return b.mesh - a.mesh; });
rows.slice(0, 12).forEach(function (r) { console.log(('  ' + r.f + '                    ').slice(0, 24) + 'meshes ' + r.mesh + '  geoms ' + r.geom + '  mats ' + r.mat + '  frame-new ' + r.frameNew); });
rows.forEach(function (r) {
  if (r.mesh > BUDGET.perModuleMeshes && r.f !== 'models.js') { errors++; console.log('ERROR   ' + r.f + ' meshes ' + r.mesh + ' > ' + BUDGET.perModuleMeshes); }
  if (r.frameNew > BUDGET.perFrameNew) { warns++; console.log('warning ' + r.f + ': ' + r.frameNew + ' per-frame THREE allocation(s)'); }
});
if (tot.mesh > BUDGET.totalMeshes) { errors++; console.log('ERROR   total meshes ' + tot.mesh + ' > ' + BUDGET.totalMeshes); }
if (tot.geom > BUDGET.totalGeoms) { errors++; console.log('ERROR   total geometries ' + tot.geom + ' > ' + BUDGET.totalGeoms); }
if (tot.mat > BUDGET.totalMats) { errors++; console.log('ERROR   total materials ' + tot.mat + ' > ' + BUDGET.totalMats); }
console.log('perf_budget: meshes ' + tot.mesh + ', geometries ' + tot.geom + ', materials ' + tot.mat + ', ' + errors + ' error(s), ' + warns + ' warning(s)');
process.exit(errors ? 1 : 0);
