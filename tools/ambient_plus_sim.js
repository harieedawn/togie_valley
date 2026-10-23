'use strict';
// Headless smoke simulation for js/ambient_plus.js (Stage 15F2b): stubs THREE/Game, steps the frame function through day / night / rain / snow /
// seasons / quality tiers and records instance counts + matrix sanity. Shared by tools/check.js section 19.
var path = require('path'), fs = require('fs'), vm = require('vm');
module.exports = function (root) {
  var WMap = require(path.join(root, 'js/world_map.js')), rows = WMap.rows, H = rows.length, Wd = rows[0].length;
  var base = { '.': 'grass', '=': 'path', t: 'soil', l: 'locked', '~': 'water', p: 'pier', B: 'grass', s: 'pier', ',': 'sand', o: 'stone' };
  function type(x, z) { var tx = Math.floor(x), tz = Math.floor(z); if (tx < 0 || tz < 0 || tx >= Wd || tz >= H) return null; return base[rows[tz].charAt(tx)] || 'building'; }
  var bad = [], rec = {}, drawn = 0;
  function Obj() { this.children = []; this.visible = true; }
  Obj.prototype.add = function (c) { this.children.push(c); };
  var T = {
    Group: Obj,
    InstancedMesh: function (g, m, n) {
      Obj.call(this); drawn++; this.count = n; this.material = m; this.name = ''; var self = this;
      this.instanceMatrix = { setUsage: function () {}, needsUpdate: false }; this.instanceColor = { count: n, needsUpdate: false };
      this.setColorAt = function () {}; this.mats = [];
      this.setMatrixAt = function (i, m4) { var e = m4.e; if (!isFinite(e[12] + e[13] + e[14] + e[0] + e[5] + e[10])) bad.push(self.name + ' NaN matrix'); self.mats[i] = { x: e[12], y: e[13], z: e[14], sx: m4.sx, sy: m4.sy }; };
    },
    BufferGeometry: function () { this.setAttribute = function () {}; this.rotateX = function () {}; },
    Float32BufferAttribute: function () {},
    IcosahedronGeometry: function () { this.applyMatrix4 = function () {}; this.toNonIndexed = function () { return this; }; this.attributes = { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }; },
    ConeGeometry: function () { this.applyMatrix4 = function () {}; this.toNonIndexed = function () { return this; }; this.attributes = { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }; },
    RingGeometry: function () { this.rotateX = function () {}; }, CircleGeometry: function () { this.rotateX = function () {}; },
    Matrix4: function () { this.e = new Array(16).fill(0); this.makeScale = function () { return this; }; this.makeRotationX = function () { return this; }; this.setPosition = function () { return this; };
      this.compose = function (p, q, s) { this.e[12] = p.x; this.e[13] = p.y; this.e[14] = p.z; this.e[0] = s.x; this.e[5] = s.y; this.e[10] = s.z; this.sx = s.x; this.sy = s.y; return this; }; },
    Quaternion: function () { this.setFromEuler = function () { return this; }; }, Euler: function () { this.set = function () { return this; }; },
    Vector3: function () { this.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; }; },
    Color: function () { this.r = 1; this.g = 1; this.b = 1; this.set = function () { return this; }; this.copy = function () { return this; }; this.add = function () { return this; }; },
    MeshBasicMaterial: function (o) { this.color = new T.Color(); for (var k in o) if (k !== 'color') this[k] = o[k]; },
    DynamicDrawUsage: 1, DoubleSide: 2
  };
  var frames = [], state = { hour: 12, weather: 'sun', season: 'summer' }, tier = 0, dens = { particle: 1, critter: 1 }, player = { pos: { x: 46, z: 12 } }, wx = { rain: 0, snow: 0 };
  var U = { rng: function (s) { return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    smoothstep: function (a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); } };
  var G = { util: U, Render: { uniforms: { uAmbient: { value: new T.Color() }, uLightColor: { value: new T.Color() } } },
    World: { tileType: type, isWalkableTile: function (x, z) { var c = type(x + 0.5, z + 0.5); return !!c && c !== 'water' && c !== 'building'; } },
    Scenery: { group: new Obj() }, Loop: { onFrame: function (fn) { frames.push(fn); } }, Player: player, Scenes: { current: 'outdoor' }, Time: state,
    WorldMap: { rows: rows }, Weather: wx, Quality: { level: function () { return tier; } }, Perf: { density: dens } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/ambient_plus.js'), 'utf8'), { window: { Game: G }, THREE: T, console: console, Math: Math, Array: Array });
  var AP = G.AmbientPlus; if (!AP) return { err: 'Game.AmbientPlus missing' };
  AP.build(); var upd = frames[0], out = { draws: drawn, bad: bad, anchors: AP.stats().anchors }, g = AP.group, byName = {};
  g.children.forEach(function (m) { byName[m.name] = m; });
  function run(sec, dt, f) { var n = Math.round(sec / dt), i; for (i = 0; i < n; i++) { upd(dt); if (f) f(); } }
  function set(h, se, r, s, tr) { state.hour = h; state.season = se; wx.rain = r; wx.snow = s; tier = tr; dens.particle = [1, 0.8, 0.55, 0.3][tr]; dens.critter = [1, 0.8, 0.5, 0.25][tr]; }
  // 1. summer day by the lake, 3 simulated minutes: dragonflies, resting butterflies, koi jumps with rings
  set(12, 'summer', 0, 0, 0);
  var jumps = 0, offWater = 0, maxFishY = -9, ringSeen = 0, dragonY = [9, -9], flying = false;
  run(180, 1 / 60, function () {
    var f = byName.ap_fish, k, m, r = byName.ap_rings;
    for (k = 0; k < f.count; k++) { m = f.mats[k]; if (m && m.y > -0.2 && m.y < 5) { if (m.y > maxFishY) maxFishY = m.y; if (type(m.x, m.z) !== 'water') offWater++; if (m.y > 0.5 && !flying) { jumps++; flying = true; } if (m.y < 0) flying = false; } }
    if (r.visible) ringSeen++;
    var d = byName.ap_dragonflies; for (k = 0; k < d.count; k++) { m = d.mats[k]; if (m && m.y > -5) { dragonY[0] = Math.min(dragonY[0], m.y); dragonY[1] = Math.max(dragonY[1], m.y); } }
  });
  out.day = AP.stats(); out.jumps = jumps; out.offWater = offWater; out.maxFishY = +maxFishY.toFixed(2); out.ringSeen = ringSeen; out.dragonY = dragonY;
  out.fireflyAtNoon = byName.ap_fireflies.count;
  // 2. summer night: fireflies, no dragonflies / butterflies
  set(22, 'summer', 0, 0, 0); run(20, 1 / 60); out.night = AP.stats();
  var ffs = byName.ap_fireflies.mats.filter(function (m, i) { return i < byName.ap_fireflies.count && m && m.sx > 0.01; }).length; out.fireflyGlowing = ffs;
  // 3. rain builds puddles + ripples, drying afterwards, snow clears them
  set(12, 'spring', 1, 0, 0); run(60, 1 / 30); out.rain = AP.stats(); out.ripples = byName.ap_puddle_ripples.count; out.puddleVisible = byName.ap_puddles.visible;
  set(12, 'spring', 0, 0, 0); run(30, 1 / 30); out.wetAfter30 = +AP.stats().wet.toFixed(2); run(200, 1 / 15); out.wetAfterDry = +AP.stats().wet.toFixed(2);
  set(12, 'spring', 1, 0, 0); run(40, 1 / 30); set(12, 'winter', 0, 1, 0); run(25, 1 / 30); out.wetAfterSnow = +AP.stats().wet.toFixed(2);
  // 4. seasons: winter hides all, autumn litter + gust
  set(12, 'winter', 0, 0, 0); run(5, 1 / 30); out.winter = AP.stats();
  set(12, 'autumn', 0, 0, 0); var gust = 0; run(120, 1 / 30, function () { if (byName.ap_gust_leaves.visible) gust++; }); out.autumn = AP.stats(); out.gustFrames = gust;
  set(12, 'summer', 0, 0, 0); run(2, 1 / 30); out.summerLitter = AP.stats().litter;
  // 5. tiers: 3 = creatures off; 2 = one koi; gust off on tier >= 2
  set(22, 'summer', 0, 0, 3); run(5, 1 / 30); out.t3night = AP.stats(); set(12, 'summer', 1, 0, 3); run(40, 1 / 30); out.t3rain = AP.stats();
  set(12, 'autumn', 0, 0, 2); gust = 0; run(60, 1 / 30, function () { if (byName.ap_gust_leaves.visible) gust++; }); out.t2gust = gust; out.t2 = AP.stats();
  set(12, 'summer', 0, 0, 1); run(5, 1 / 30); out.t1 = AP.stats();
  Scenes_indoor(); function Scenes_indoor() { G.Scenes.current = 'house'; upd(1 / 60); out.indoorVisible = g.visible; G.Scenes.current = 'outdoor'; }
  return out;
};
