'use strict';
// Headless smoke simulation for js/critters.js (Stage 15F2b): stubs THREE/Game, runs the wander AI for simulated minutes in
// day / rain / night and reports positions. Shared by tools/check.js section 18.
var path = require('path'), fs = require('fs'), vm = require('vm');
module.exports = function (root) {
  var WMap = require(path.join(root, 'js/world_map.js')), rows = WMap.rows, H = rows.length, Wd = rows[0].length;
  var base = { '.': 'grass', '=': 'path', t: 'soil', l: 'locked', '~': 'water', p: 'pier', B: 'grass', s: 'pier', ',': 'sand', o: 'stone' };
  function type(x, z) { var tx = Math.floor(x), tz = Math.floor(z); if (tx < 0 || tz < 0 || tx >= Wd || tz >= H) return null; var c = rows[tz].charAt(tx); return base[c] || 'building'; }
  var blocked = {};
  function Obj() { this.position = { x: 0, y: 0, z: 0, set: function (a, b, c) { this.x = a; this.y = b; this.z = c; } }; this.rotation = { x: 0, y: 0, z: 0, order: '', set: function (a, b, c) { this.x = a; this.y = b; this.z = c; } }; this.children = []; this.visible = true; }
  Obj.prototype.add = function (c) { this.children.push(c); };
  var meshes = 0, T = {
    Group: Obj, Mesh: function () { Obj.call(this); meshes++; },
    InstancedMesh: function (g, m, n) { Obj.call(this); meshes++; this.count = n; this.material = m; this.instanceMatrix = { setUsage: function () {}, needsUpdate: false }; this.setMatrixAt = function (i, m4) { if (!isFinite(m4.e[12] + m4.e[13] + m4.e[14])) throw new Error('NaN bee matrix'); }; },
    BoxGeometry: function () {}, CylinderGeometry: function () {}, SphereGeometry: function () {}, ConeGeometry: function () {},
    IcosahedronGeometry: function () { this.applyMatrix4 = function () {}; this.toNonIndexed = function () { return this; }; this.attributes = { position: { count: 6, getZ: function (i) { return i * 0.02 - 0.05; }, array: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1] } }; },
    BufferGeometry: function () { this.setAttribute = function () {}; },
    Float32BufferAttribute: function () {},
    Matrix4: function () { this.e = new Array(16).fill(0); this.makeScale = function () { return this; }; this.compose = function (p) { this.e[12] = p.x; this.e[13] = p.y; this.e[14] = p.z; return this; }; },
    Quaternion: function () { this.setFromEuler = function () { return this; }; }, Euler: function () { this.set = function () { return this; }; },
    Vector3: function () { this.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; }; },
    Color: function () { this.r = 1; this.g = 1; this.b = 1; this.set = function () { return this; }; this.copy = function () { return this; }; this.add = function () { return this; }; },
    MeshBasicMaterial: function () { this.color = new T.Color(); }, DynamicDrawUsage: 1, DoubleSide: 2
  };
  var state = { hour: 12, weather: 'sun', season: 'summer' }, frames = [], tier = 0, density = 1;
  var player = { pos: { x: 29, z: 14 } };
  var U = { rng: function (s) { return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    lerpAngle: function (a, b, t) { var d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; }, damp: function (c, t, l, dt) { return c + (t - c) * (1 - Math.exp(-l * dt)); } };
  var G = { util: U, Render: { addOutline: function () { meshes++; }, uniforms: { uAmbient: { value: new T.Color() }, uLightColor: { value: new T.Color() } } },
    Models: { part: function () { return {}; }, mergeParts: function (p) { return { n: p.length }; }, material: function () { return {}; } },
    World: { tileType: type, isWalkableTile: function (x, z) { var c = type(x + 0.5, z + 0.5); return !!c && c !== 'water' && c !== 'building' && !blocked[x + ',' + z]; }, setBlocked: function (x, z, b) { blocked[x + ',' + z] = b; } },
    Scenery: { group: new Obj() }, Loop: { onFrame: function (fn) { frames.push(fn); } }, Player: player, Scenes: { current: 'outdoor' },
    Time: state, Weather: { rain: 0, snow: 0 }, Quality: { level: function () { return tier; } }, Perf: { density: { critter: 1 } } };
  var ctx = { window: { Game: G }, THREE: T, console: console, Math: Math, Array: Array };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/critters.js'), 'utf8'), ctx);
  var CR = G.Critters; if (!CR) return { err: 'Game.Critters missing' };
  CR.build();
  var upd = frames[0], out = { errors: [], draws: meshes }, i, c;
  function run(sec, dt, label, px, pz) {
    var bad = 0, mv = {}, steps = Math.round(sec / dt), k, g = CR.group, wet = 0;
    player.pos.x = px; player.pos.z = pz;
    for (k = 0; k < steps; k++) {
      upd(dt);
      g.children.forEach(function (m) {
        if (!m.visible || !/^(chicken|duck)/.test(m.name || '')) return;
        var p = m.position, isDuck = /^duck/.test(m.name), tp = type(p.x, p.z);
        var key = m.name; mv[key] = mv[key] || { x0: p.x, z0: p.z, d: 0 }; mv[key].d = Math.max(mv[key].d, Math.hypot(p.x - mv[key].x0, p.z - mv[key].z0));
        if (!isFinite(p.x + p.y + p.z + m.rotation.x + m.rotation.y + m.rotation.z)) { bad++; return; }
        if (isDuck ? tp !== 'water' : (tp !== 'grass' && tp !== 'path' && tp !== 'sand')) bad++;
      });
    }
    out[label] = bad; out[label + 'Move'] = Object.keys(mv).map(function (k) { return +mv[k].d.toFixed(1); }); return bad;
  }
  // name meshes so the walker can tell them apart: the stubs record nothing, so read names from the critters group order
  CR.group.children.forEach(function (m, idx) { /* names set by critters.js via m.name */ });
  state.hour = 12; state.weather = 'sun'; run(120, 1 / 60, 'dayBad', 29, 14);
  out.dayStats = CR.stats();
  G.Weather.rain = 1; run(60, 1 / 60, 'rainBad', 29, 14); G.Weather.rain = 0;
  state.hour = 22; run(30, 1 / 30, 'nightBad', 29, 14); out.nightStats = CR.stats();
  state.hour = 12; player.pos.x = 6.5; player.pos.z = 15.5; run(20, 1 / 60, 'fleeBad', 6.5, 15.5);   // player standing on the chickens
  tier = 3; upd(1 / 60); out.tier3Visible = CR.group.visible; tier = 2; upd(1 / 30); out.tier2Visible = CR.group.visible;
  tier = 1; G.Perf.density.critter = 0.8; state.hour = 12; run(2, 1 / 60, 'tier1Bad', 29, 14); out.tier1Stats = CR.stats();
  out.blockedHive = !!blocked[CR.layout.hive.tx + ',' + CR.layout.hive.tz]; out.layout = CR.layout;
  return out;
};
