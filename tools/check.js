#!/usr/bin/env node
/* Togie Valley - tools/check.js (Stage 1). No dependencies. Usage: node tools/check.js
 * 1. node --check on every js file (js/ and tools/)         -> errors, exit 1
 * 2. every local <script src> in index.html exists           -> errors, exit 1
 * 4. emoji scan (\p{Extended_Pictographic}) in js/css/index.html/DESIGN.md -> warnings only
 * 3. heuristic: Game.<Name>.<member> references whose Name is never assigned (Game.Name = / G.Name =)
 *    or whose member never appears as `member:`, `.member =` or `function member` -> warnings only
 */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var root = path.resolve(__dirname, '..');
var errors = 0, warnings = 0;

function list(dir) {
  var d = path.join(root, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(function (f) { return /\.js$/.test(f); }).sort().map(function (f) { return path.join(dir, f); });
}
function err(msg) { errors++; console.log('ERROR   ' + msg); }
function warn(msg) { warnings++; console.log('warning ' + msg); }

// 1. syntax
var files = list('js').concat(list('tools'));
files.forEach(function (f) {
  var r = cp.spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
  if (r.status !== 0) err('syntax: ' + f + '\n' + String(r.stderr || '').split('\n').slice(0, 6).join('\n'));
});

// 2. index.html scripts
var html = '';
try { html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); } catch (e) { err('index.html not readable'); }
var re = /<script[^>]*\ssrc=["']([^"']+)["']/g, m, listed = {};
while ((m = re.exec(html))) {
  var src = m[1];
  if (/^(https?:)?\/\//.test(src)) continue;
  listed[path.normalize(src)] = true;
  if (!fs.existsSync(path.join(root, src.split('?')[0]))) err('missing script: ' + src);
}
list('js').forEach(function (f) {
  if (!listed[path.normalize(f)]) warn('js file not loaded by index.html: ' + f);
});

// 3. heuristic API scan
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');
}
var texts = {}, assigned = {}, members = {};
list('js').forEach(function (f) {
  var t = strip(fs.readFileSync(path.join(root, f), 'utf8'));
  texts[f] = t;
  var a, r1 = /\b(?:Game|G|window\.Game)\.([A-Za-z_]\w*)\s*=[^=]/g;
  while ((a = r1.exec(t))) assigned[a[1]] = true;
  var r2 = /\b([A-Za-z_$][\w$]*)\s*:/g, r3 = /\.([A-Za-z_$][\w$]*)\s*=[^=]/g, r4 = /function\s+([A-Za-z_$][\w$]*)/g;
  while ((a = r2.exec(t))) members[a[1]] = true;
  while ((a = r3.exec(t))) members[a[1]] = true;
  while ((a = r4.exec(t))) members[a[1]] = true;
});
var seen = {};
Object.keys(texts).forEach(function (f) {
  var r = /\b(?:Game|G)\.([A-Z]\w*)\.([A-Za-z_]\w*)/g, a;
  while ((a = r.exec(texts[f]))) {
    var name = a[1], mem = a[2], key = name + '.' + mem;
    if (seen[key]) continue;
    if (!assigned[name]) { seen[key] = 1; warn(f + ': Game.' + name + ' is never assigned (' + key + ')'); }
    else if (!members[mem]) { seen[key] = 1; warn(f + ': ' + key + ' is never defined'); }
  }
});

// 4. emoji scan (Stage 4.5A): item/UI art must come from Game.Icons, never emoji glyphs
var emojiRe = /[\p{Extended_Pictographic}\u25B6\u25BC\u2630\u27F2\u27F3]/u;
list('js').map(function (f) { return f; }).concat(['css/style.css', 'css/ui.css', 'css/panels.css', 'index.html', 'DESIGN.md']).forEach(function (f) {
  var fp = path.join(root, f);
  if (!fs.existsSync(fp)) return;
  fs.readFileSync(fp, 'utf8').split('\n').forEach(function (line, i) {
    var mm = emojiRe.exec(line.replace(/[\u00A9\u00AE\u2122]/g, ''));
    if (mm) warn('emoji glyph in ' + f + ':' + (i + 1) + ' (' + mm[0] + ') - use Game.Icons');
  });
});

// 5. reachability (Stage 10.5): BFS on the final outdoor map (terrain + solid props) from the door to every interactable stand tile
(function () {
  var WMap = require(path.join(root, 'js/world_map.js')), rows = WMap.rows;
  var H = rows.length, W = rows[0].length, Layout = require(path.join(root, 'js/layout.js'));
  var base = { '.': 'grass', '=': 'path', t: 'soil', l: 'locked', '~': 'water', p: 'pier', B: 'grass', s: 'pier', ',': 'sand', o: 'stone' };
  function ch(x, z) { return x < 0 || z < 0 || x >= W || z >= H ? null : rows[z].charAt(x); }
  function type(x, z) { var c = ch(x, z); return c ? (base[c] || 'building') : null; }
  var marks = {}, names = { D: 'door', B: 'bin', C: 'shopCounter', K: 'workshopCounter', M: 'fishStall', s: 'seat' };
  var x, z, blocked = {};
  for (z = 0; z < H; z++) for (x = 0; x < W; x++) { var n = names[ch(x, z)]; if (n) (marks[n] = marks[n] || []).push({ tx: x, tz: z }); }
  var lay = Layout.scatter({ W: W, H: H, seed: 1234, type: type, markers: function (k) { return marks[k] || []; }, isFarm: function (x2, z2) { return x2 > 11 && x2 < 28 && z2 > 6 && z2 < 19; } });
  lay.solids.forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; });
  var occupied = {}; lay.solids.concat(lay.bushTiles).forEach(function (c) { occupied[c[0] + ',' + c[1]] = 1; });   // placement occupancy (bushes included, but they do not block walking)
  var SLay = require(path.join(root, 'js/scenery_layout.js'));
  SLay.styleScatter(lay.trees, rows);   // same restyle + spacing inputs as Game.Scenery at runtime
  var sc = SLay.build({ rows: rows, features: WMap.features, seed: 777, avoid: lay.trees, blocked: function (a2, b2) { return !!occupied[a2 + ',' + b2]; } });
  sc.solids.forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; });
  if (fs.existsSync(path.join(root, 'tools/extra_solids.json'))) JSON.parse(fs.readFileSync(path.join(root, 'tools/extra_solids.json'), 'utf8')).forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; });
  function walk(x2, z2) { var t = type(x2, z2), c = ch(x2, z2); return (t === 'grass' || t === 'path' || t === 'soil' || t === 'pier' || t === 'sand' || t === 'stone') && !(c === 'B') && !blocked[x2 + ',' + z2]; }
  var door = (marks.door || [])[0];
  if (!door) { err('reach: no door marker'); return; }
  var start = [door.tx, door.tz + 1], seen = {}, q = [start], D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  seen[start.join(',')] = 1;
  while (q.length) {
    var c = q.shift();
    D8.forEach(function (d) {
      var nx = c[0] + d[0], nz = c[1] + d[1], k = nx + ',' + nz;
      if (seen[k] || !walk(nx, nz)) return;
      if (d[0] && d[1] && (!walk(c[0] + d[0], c[1]) || !walk(c[0], c[1] + d[1]))) return;   // no corner cutting
      seen[k] = 1; q.push([nx, nz]);
    });
  }
  var bad = 0;
  function need(label, tx, tz) { if (!seen[tx + ',' + tz]) { bad++; err('reach: ' + label + ' stand tile (' + tx + ',' + tz + ') is not reachable from the door'); } }
  ['door', 'bin', 'shopCounter', 'workshopCounter', 'fishStall'].forEach(function (k) { (marks[k] || []).forEach(function (m) { need(k, m.tx, m.tz + 1); }); });
  (marks.seat || []).forEach(function (m) { need('seat', m.tx, m.tz); });
  for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (ch(x, z) === 't') need('soil', x, z);
  need('well', 12, 15);
  (WMap.features.goals || []).forEach(function (g2) { if (walk(g2[0], g2[1])) need('scenery goal', g2[0], g2[1]); });
  for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (ch(x, z) === 'o' && !blocked[x + ',' + z]) need('stone path', x, z);
  // emptiness: every 6x6 block of open grass/sand outside the farm must carry decor (trees, bushes, rocks, flowers, props)
  var cnt = {}, empty = 0;
  [lay.trees, lay.bushes, lay.flowers, lay.rocks, sc.trees, sc.bushes, sc.flowers, sc.rocks, sc.props].forEach(function (l2) { l2.forEach(function (o2) { var k2 = Math.floor((o2.x !== undefined ? o2.x : o2.tx) / 6) + ',' + Math.floor((o2.z !== undefined ? o2.z : o2.tz) / 6); cnt[k2] = (cnt[k2] || 0) + 1; }); });
  for (var bz = 0; bz < H / 6; bz++) for (var bxx = 0; bxx < W / 6; bxx++) {
    var open = 0; for (z = bz * 6; z < bz * 6 + 6; z++) for (x = bxx * 6; x < bxx * 6 + 6; x++) { var c3 = ch(x, z); if (c3 === '.' && !(x > 10 && x < 29 && z > 5 && z < 20)) open++; }
    if (open >= 24 && (cnt[bxx + ',' + bz] || 0) < 6) { empty++; warn('empty area: block x' + bxx * 6 + ' z' + bz * 6 + ' has only ' + (cnt[bxx + ',' + bz] || 0) + ' decor items'); }
  }
  console.log('scenery: ' + sc.trees.length + ' trees, ' + sc.bushes.length + ' bushes, ' + sc.flowers.length + ' flowers, ' + sc.rocks.length + ' rocks, ' + sc.props.length + ' props, ' + sc.reeds.length + ' reeds, ' + sc.lilies.length + ' lilies; ' + empty + ' empty block(s)');
  console.log('reach: ' + (bad ? bad + ' unreachable target(s)' : 'all interactable stand tiles reachable') + ' (' + lay.solids.length + ' solid props)');
})();

// 6. English UI string heuristic (Stage 10.5): player-facing literals must be Vietnamese
(function () {
  var re = /\b(?:toast|dialog|setMsg|hint|confirm|setLabel|setAttribute\(\s*'aria-label'|textContent\s*=|title\s*=)\s*\(?[^'"\n]*['"]([^'"\n]{6,})['"]/g, words = /\b(the|you|your|to|and|is|are|it|a|an|of|for|with|get|got|not|now)\b/gi;
  list('js').forEach(function (f) {
    if (/icons\.js|errors\.js|layout\.js/.test(f)) return;
    fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach(function (line, i) {
      var m; re.lastIndex = 0;
      while ((m = re.exec(line))) { var hits = m[1].match(words); if (hits && hits.length >= 2 && !/[^\x00-\x7F]/.test(m[1])) warn('English UI string? ' + f + ':' + (i + 1) + ' "' + m[1].slice(0, 50) + '"'); }
    });
  });
})();

// 7. sfx report (Stage 11.5A): quick mode, one variant per sound
(function () {
  var r = cp.spawnSync(process.execPath, [path.join(root, 'tools/sfx_report.js'), '--quick', '--quiet'], { encoding: 'utf8' });
  var out = String(r.stdout || '').trim().split('\n');
  if (r.status !== 0) err('sfx report failed (run node tools/sfx_report.js)\n' + out.slice(0, 8).join('\n'));
  else console.log(out[out.length - 1]);
})();

// 8. icon presence (Stage 15A-3 A7): every icon referenced by manifest/index.html/sw.js exists and sizes match; gen_icon.py present
(function () {
  var zlib = null; function dim(f) { var b = fs.readFileSync(f); return b.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }
  if (!fs.existsSync(path.join(root, 'tools/gen_icon.py'))) err('tools/gen_icon.py missing');
  var want = { 'icon-master-1024.png': 1024, 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180, 'icon-maskable-512.png': 512, 'favicon-32.png': 32, 'favicon-48.png': 48 }, n = 0;
  Object.keys(want).forEach(function (k) {
    var f = path.join(root, 'icons', k); if (!fs.existsSync(f)) return err('icon missing: icons/' + k);
    var d = dim(f); if (!d || d[0] !== want[k] || d[1] !== want[k]) err('icon size wrong: icons/' + k + ' (want ' + want[k] + ')'); else n++;
  });
  var refs = []; try { JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8')).icons.forEach(function (i) { refs.push(i.src); }); } catch (e) { err('manifest icons unreadable'); }
  (fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/href="(icons\/[^"]+)"/g) || []).forEach(function (m) { refs.push(m.slice(6, -1)); });
  (fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/'icons\/[^']+'/g) || []).forEach(function (m) { refs.push(m.slice(1, -1)); });
  refs.forEach(function (r) { if (!fs.existsSync(path.join(root, r))) err('referenced icon missing: ' + r); });
  var dens = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'], an = 0;
  dens.forEach(function (k) { ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background'].forEach(function (b) { if (!fs.existsSync(path.join(root, 'icons/android/mipmap-' + k, b + '.png'))) err('android icon missing: ' + k + '/' + b); else an++; }); });
  console.log('icons: ' + n + '/' + Object.keys(want).length + ' web sizes ok, ' + an + '/20 android, ' + refs.length + ' refs');
})();

// 9. controls (Stage 15B): joystick wiring present, registered, and cached
(function () {
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  var idx = rd('index.html'), joy = rd('js/joystick.js'), pl = rd('js/player.js'), inp = rd('js/input.js'), pn = rd('js/panels.js'), n = 0;
  function need(ok, msg) { if (!ok) err('controls: ' + msg); else n++; }
  need(/css\/joystick\.css/.test(idx), 'css/joystick.css not linked');
  need(/js\/joystick\.js/.test(idx), 'js/joystick.js not loaded');
  need(/P\.setStick\s*=/.test(pl), 'Player.setStick missing');
  need(/Input\.claim\s*=/.test(inp) && /Input\.pointerCount\s*=/.test(inp), 'Input.claim/pointerCount missing');
  need(/Joystick\.renderRow/.test(pn), 'settings row not hooked in panels.js');
  need(/togie-valley\/controls/.test(joy), 'controls store key missing');
  ['tap', 'float', 'fixed'].forEach(function (m) { need(joy.indexOf("'" + m + "'") >= 0, 'mode ' + m + ' missing'); });
  var ca = rd('js/camera_auto.js');
  need(/js\/camera_auto\.js/.test(idx) && idx.indexOf('js/joystick.js') < idx.indexOf('js/camera_auto.js'), 'camera_auto.js not loaded after joystick.js');
  need(/CameraAuto\.renderRow/.test(pn), 'camera row not hooked in panels.js');
  need(/store\('cam'/.test(ca) && /store\('sens'/.test(ca), 'camera store keys missing');
  need(/yawTarget/.test(ca) && /scene:changed/.test(ca) && /panelOpen/.test(ca), 'camera_auto guards missing');
  console.log('controls: ' + n + ' checks ok');
})();

// 10. tutorial (Stage 15C C1): wiring, save key, pages
(function () {
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  var idx = rd('index.html'), tu = rd('js/tutorial.js'), pn = rd('js/panels.js'), n = 0;
  function need(ok, msg) { if (!ok) err('tutorial: ' + msg); else n++; }
  need(/css\/tutorial\.css/.test(idx) && /js\/tutorial\.js/.test(idx), 'not linked in index.html');
  need(/Save\.register\('tutorial'/.test(tu), 'save key missing');
  need(/Tutorial\.renderRow/.test(pn), 'settings button not hooked in panels.js');
  need((tu.match(/art: art\d/g) || []).length >= 5, 'fewer than 5 pages');
  need(!/\p{Extended_Pictographic}/u.test(tu), 'emoji in tutorial.js');
  console.log('tutorial: ' + n + ' checks ok');
})();

// 11. menus (Stage 15C C2): title + pause tile grid wiring
(function () {
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  var idx = rd('index.html'), mn = rd('js/menus.js'), pn = rd('js/panels.js'), n = 0;
  function need(ok, msg) { if (!ok) err('menus: ' + msg); else n++; }
  need(/css\/menus\.css/.test(idx) && /js\/menus\.js/.test(idx) && idx.indexOf('js/tutorial.js') < idx.indexOf('js/menus.js'), 'not linked after tutorial.js');
  need(/Menus\.buildTitle/.test(pn) && /Menus\.openPause/.test(pn), 'panels.js does not delegate to Menus');
  ['Túi đồ', 'Kỹ năng', 'Sổ tay', 'Mục tiêu', 'Cài đặt', 'Hướng dẫn', 'Lưu', 'Về menu'].forEach(function (t) { need(mn.indexOf("'" + t + "'") >= 0, 'tile ' + t + ' missing'); });
  need(/Notebook\.openTab/.test(mn) && /NB\.openTab/.test(rd('js/notebook.js')), 'goals tile hook missing');
  need(!/\p{Extended_Pictographic}/u.test(mn), 'emoji in menus.js');
  console.log('menus: ' + n + ' checks ok');
})();

// 12. animation clips (Stage 15D): registry coverage of every Player.playAction name, numeric pose sampling (NaN, pops, contact probes)
(function () {
  var AD = require(path.join(root, 'tools/anim_sample.js')), n = 0, used = {};
  list('js').forEach(function (f) {
    if (/anim_clips\.js/.test(f)) return;
    var t = fs.readFileSync(path.join(root, f), 'utf8'), r = /(?:playAction|\bact)\(\s*['"]([\w]+)['"]/g, a;
    while ((a = r.exec(t))) used[a[1]] = f;
  });
  Object.keys(used).forEach(function (nm) { if (!AD.has(nm)) err('anim: playAction(\'' + nm + '\') in ' + used[nm] + ' has no clip in js/anim_data.js'); else n++; });
  if (!AD.has('interact')) err('anim: fallback clip "interact" missing');
  var models = fs.readFileSync(path.join(root, 'js/models.js'), 'utf8'), km = /var KEYS = \[([^\]]+)\]/.exec(models);
  if (!km || km[1].replace(/[\s'\n]/g, '') !== AD.KEYS.join(',')) err('anim: AnimData.KEYS differ from Models.Anim.KEYS');
  var res = AD.checkAll(false);
  res.errors.forEach(function (e) { err('anim: ' + e); });
  var idx2 = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ['anim_data', 'anim_tools', 'anim_clips'].forEach(function (m) { if (idx2.indexOf('js/' + m + '.js') < 0) err('anim: ' + m + '.js not loaded by index.html'); });
  console.log('anim: ' + res.clips + ' clips sampled, ' + n + ' playAction names covered by the registry');
})();

// 13. NPC + world reactions (Stage 15D D4): npc_* clips exist and sample clean, every clip name used by npc_react.js resolves, wiring present
(function () {
  var AD = require(path.join(root, 'tools/anim_sample.js')), n = 0;
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  var nr = rd('js/npc_react.js'), wr = rd('js/world_react.js'), idx = rd('index.html'), ui = rd('js/ui.js'), fx = rd('js/farm_fx.js'), m;
  function need(ok, msg) { if (!ok) err('react: ' + msg); else n++; }
  need(Array.isArray(AD.NPC_CLIPS) && AD.NPC_CLIPS.length >= 6, 'AnimData.NPC_CLIPS missing');
  (AD.NPC_CLIPS || []).forEach(function (c) { need(AD.has(c), 'clip ' + c + ' not registered'); });
  var re = /['"](npc_\w+)['"]/g;
  while ((m = re.exec(nr))) need(AD.has(m[1]), 'npc_react.js uses unknown clip ' + m[1]);
  need(idx.indexOf('js/npc_react.js') > idx.indexOf('js/anim_actions.js') && idx.indexOf('js/world_react.js') > idx.indexOf('js/npc_react.js'), 'npc_react/world_react not linked after anim_actions.js');
  need(/dialog:open/.test(ui) && /dialog:close/.test(ui) && /dialog:open/.test(nr) && /dialog:char/.test(nr), 'dialog open/close/char hooks missing');
  need(/uJ\[3\]/.test(fx) && /FX\.jig/.test(fx) && /FX\.jig/.test(wr), 'crop jiggle uniforms not wired');
  need(/Quality/.test(nr) && /quality\(\)/.test(wr), 'Quality gating missing');
  need(/House\.chestMesh/.test(rd('js/house.js')), 'House.chestMesh not exposed');
  need(!/\p{Extended_Pictographic}/u.test(nr + wr), 'emoji in react files');
  console.log('react: ' + n + ' checks ok');
})();

// 14. Fish stall layout (Stage 15E1): props inside the stall footprint, off the seller + counter tiles, outside props off path tiles, no overlaps, wiring
(function () {
  var n = 0;
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  function need(ok, msg) { if (!ok) err('fishstall: ' + msg); else n++; }
  var src = rd('js/fish_stall.js'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src), L = null;
  try { L = new Function(mm[1] + '; return LAYOUT;')(); } catch (e) { err('fishstall: LAYOUT block not parseable'); return; }
  var win = { Game: {} }; global.window = win;
  try { delete require.cache[require.resolve(path.join(root, 'js/world_map.js'))]; require(path.join(root, 'js/world_map.js')); } catch (e) { err('fishstall: world_map.js not loadable'); return; }
  var rows = win.Game.WorldMap.rows, cm = null, nm = null, fp = [], x, z;
  for (z = 0; z < rows.length; z++) for (x = 0; x < rows[z].length; x++) {
    var ch = rows[z][x];
    if (ch === 'M') cm = { x: x, z: z }; if (ch === 'm') nm = { x: x, z: z };
    if (ch === 'F' || ch === 'M' || ch === 'm') fp.push(x + ',' + z);
  }
  need(cm && nm, 'counter/seller markers missing');
  function tileCh(tx, tz) { return (rows[tz] || '')[tx] || ' '; }
  function rects(o) { return Object.keys(o).map(function (k) { return { k: k, r: o[k] }; }); }
  function overlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
  var ins = rects(L.inside), outs = rects(L.outside), i, j, r;
  var seller = [nm.x + 0.2, nm.z + 0.2, nm.x + 0.8, nm.z + 0.8], counter = [cm.x - 0.05, cm.z + 0.03, cm.x + 1.05, cm.z + 0.98], stand = [cm.x, cm.z + 1, cm.x + 1, cm.z + 2];
  ins.forEach(function (o) {
    r = o.r;
    [[r[0], r[1]], [r[2] - 1e-6, r[1]], [r[0], r[3] - 1e-6], [r[2] - 1e-6, r[3] - 1e-6]].forEach(function (c) { need(fp.indexOf(Math.floor(c[0]) + ',' + Math.floor(c[1])) >= 0, o.k + ' corner leaves the stall footprint'); });
    if (o.k.indexOf('counter') !== 0) { need(!overlap(r, seller), o.k + ' overlaps the seller'); need(!overlap(r, counter), o.k + ' overlaps the counter block'); }
    need(!overlap(r, stand), o.k + ' overlaps the player standing tile');
  });
  outs.forEach(function (o) {
    r = o.r;
    [[r[0], r[1]], [r[2] - 1e-6, r[3] - 1e-6]].forEach(function (c) { var t = tileCh(Math.floor(c[0]), Math.floor(c[1])); need(t !== '=' && t !== 'p' && t !== '~' || o.k === 'board' || o.k === 'hang', o.k + ' on a path/pier/water tile'); });
    need(!overlap(r, stand) || o.k === 'board' || o.k === 'hang', o.k + ' overlaps the player standing tile');
  });
  var all = ins.concat(outs);
  for (i = 0; i < all.length; i++) for (j = i + 1; j < all.length; j++) if (all[i].k.indexOf('counter') !== 0 && all[j].k.indexOf('counter') !== 0) need(!overlap(all[i].r, all[j].r), all[i].k + ' overlaps ' + all[j].k);
  var idx = rd('index.html'), fm = rd('js/fish_models.js'), st = rd('js/town.js'), wr = rd('js/world_react.js'), fx = rd('js/fishing_fx.js');
  need(idx.indexOf('js/fish_models.js') > 0 && idx.indexOf('js/fish_stall.js') > idx.indexOf('js/fish_models.js') && idx.indexOf('js/fishing_fx.js') > idx.indexOf('js/fish_stall.js'), 'fish_models/fish_stall not linked in order');
  need(/FishStall\.build/.test(st) && /FishModels/.test(wr) && /FishModels/.test(fx), 'fish models/stall not wired into town/world_react/fishing_fx');
  need((fm.match(/^\s{4}\w+:\s+\{ h:/gm) || []).length === 15, 'FishModels must define 15 looks');
  need(!/\p{Extended_Pictographic}/u.test(src + fm), 'emoji in fish files');
  need(/Quality/.test(src) && /onFrame\(onFrame, 10\.5\)/.test(src), 'quality gating / frame hook missing');
  need(/CÁ TƯƠI HÔM NAY/.test(src), 'price board text missing');
  delete global.window;
  console.log('fishstall: ' + n + ' checks ok');
})();

// 15. Town life layout (Stage 15E2): solid props on blocked grass tiles, flat props off paths, no overlaps, BFS from the door, wiring
(function () {
  var n = 0;
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  function need(ok, msg) { if (!ok) err('townlife: ' + msg); else n++; }
  var src = rd('js/town_life.js'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src), L = null;
  try { L = new Function(mm[1] + '; return LAYOUT;')(); } catch (e) { err('townlife: LAYOUT block not parseable'); return; }
  var win = { Game: {} }; global.window = win;
  try { delete require.cache[require.resolve(path.join(root, 'js/world_map.js'))]; require(path.join(root, 'js/world_map.js')); } catch (e) { err('townlife: world_map.js not loadable'); return; }
  var rows = win.Game.WorldMap.rows, i, j, r;
  function ch(tx, tz) { return (rows[tz] || '')[tx] || ' '; }
  function overlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
  var stands = [], door = null, x, z;
  for (z = 0; z < rows.length; z++) for (x = 0; x < rows[z].length; x++) { var c = rows[z][x]; if (c === 'C' || c === 'K' || c === 'M') stands.push([x, z + 1]); if (c === 'D') door = [x, z + 1]; }
  var bl = {}; L.blocked.forEach(function (b) { bl[b[0] + ',' + b[1]] = 1; need(ch(b[0], b[1]) === '.' || ch(b[0], b[1]) === ',', 'blocked tile ' + b + ' is not grass/sand'); });
  var names = Object.keys(L.solid).concat(Object.keys(L.flat)), rects = {};
  Object.keys(L.solid).forEach(function (k) { rects[k] = L.solid[k]; r = rects[k];
    need(bl[Math.floor(r[0]) + ',' + Math.floor(r[1])] && bl[Math.floor(r[2] - 1e-6) + ',' + Math.floor(r[3] - 1e-6)], k + ' not on a blocked tile');
    stands.forEach(function (s) { need(!overlap(r, [s[0], s[1], s[0] + 1, s[1] + 1]), k + ' covers a stand tile'); }); });
  Object.keys(L.flat).forEach(function (k) { rects[k] = L.flat[k]; r = rects[k];
    [[r[0], r[1]], [r[2] - 1e-6, r[3] - 1e-6]].forEach(function (p) { var t = ch(Math.floor(p[0]), Math.floor(p[1])); need(t !== '=' && t !== 'p' && t !== '~' && t !== 'o', k + ' on path/pier/water'); }); });
  for (i = 0; i < names.length; i++) for (j = i + 1; j < names.length; j++) need(!overlap(rects[names[i]], rects[names[j]]), names[i] + ' overlaps ' + names[j]);
  // BFS from the door over walkable tiles minus blocked props: every stand tile + door must stay reachable
  var H = rows.length, Wd = rows[0].length, seen = {}, q = [door];
  function walk(tx, tz) { var t = ch(tx, tz); return tx >= 0 && tz >= 0 && tx < Wd && tz < H && '.=tlpo,sDBnm'.indexOf(t) >= 0 && !bl[tx + ',' + tz]; }
  seen[door[0] + ',' + door[1]] = 1;
  while (q.length) { var p = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var a = p[0] + d[0], b = p[1] + d[1], k = a + ',' + b; if (!seen[k] && walk(a, b)) { seen[k] = 1; q.push([a, b]); } }); }
  stands.forEach(function (s) { need(seen[s[0] + ',' + s[1]], 'stand tile ' + s + ' unreachable'); });
  var idx = rd('index.html'), st = rd('js/town.js'), dt = rd('js/detail_town.js');
  need(idx.indexOf('js/town_life.js') > idx.indexOf('js/fish_stall.js') && idx.indexOf('js/town_life.js') < idx.indexOf('js/main.js'), 'town_life.js not linked in order');
  need(/TownLife\.build/.test(st), 'TownLife not wired into town.js');
  need(!/hang\[0\], sx \+ 0\.22/.test(dt), 'static sign board still drawn in detail_town');
  need(/Quality/.test(src) && /onFrame\(onFrame, 10\.6\)/.test(src), 'quality gating / frame hook missing');
  need(!/\p{Extended_Pictographic}/u.test(src), 'emoji in town_life.js');
  delete global.window;
  console.log('townlife: ' + n + ' checks ok');
})();

// 16. Farm look (Stage 15F1): sign tiles + soil reachability, farm_fx variants, wiring
(function () {
  var n = 0;
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  function need(ok, msg) { if (!ok) err('farmlook: ' + msg); else n++; }
  var src = rd('js/farm_look.js'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src), L = null;
  try { L = new Function(mm[1] + '; return LAYOUT;')(); } catch (e) { err('farmlook: LAYOUT block not parseable'); return; }
  var win = { Game: {} }; global.window = win;
  try { delete require.cache[require.resolve(path.join(root, 'js/world_map.js'))]; require(path.join(root, 'js/world_map.js')); } catch (e) { err('farmlook: world_map.js not loadable'); return; }
  var rows = win.Game.WorldMap.rows, bl = {}, door = null, x, z;
  function ch(tx, tz) { return (rows[tz] || '')[tx] || ' '; }
  for (z = 0; z < rows.length; z++) for (x = 0; x < rows[z].length; x++) if (rows[z][x] === 'D') door = [x, z + 1];
  L.signs.forEach(function (s) { bl[s[0] + ',' + s[1]] = 1; need(ch(s[0], s[1]) === '.', 'sign tile ' + s + ' is not plain grass');
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var t = ch(s[0] + d[0], s[1] + d[1]); need(t !== '=' && t !== 'o', 'sign tile ' + s + ' touches a path'); }); });
  var seen = {}, q = [door]; seen[door[0] + ',' + door[1]] = 1;
  function walk(a, b) { var t = ch(a, b); return '.=tlo,sDBnm'.indexOf(t) >= 0 && !bl[a + ',' + b] && a >= 0 && b >= 0 && b < rows.length; }
  while (q.length) { var p = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var a = p[0] + d[0], b = p[1] + d[1]; if (!seen[a + ',' + b] && walk(a, b)) { seen[a + ',' + b] = 1; q.push([a, b]); } }); }
  for (z = 0; z < rows.length; z++) for (x = 0; x < rows[z].length; x++) if (rows[z][x] === 't') need(seen[x + ',' + z], 'soil tile (' + x + ',' + z + ') unreachable');
  var fx = rd('js/farm_fx.js'), idx = rd('index.html'), mn = rd('js/main.js');
  need(/soilV = \[0, 1, 2\]/.test(fx) && /ripe_glint/.test(fx), 'farm_fx soil variants / ripe glint missing');
  need(idx.indexOf('js/farm_look.js') > idx.indexOf('js/town_life.js') && idx.indexOf('js/farm_look.js') < idx.indexOf('js/main.js') && /FarmLook\.build/.test(mn), 'farm_look not linked/wired');
  need(!/\p{Extended_Pictographic}/u.test(src + fx), 'emoji in farm files');
  delete global.window;
  console.log('farmlook: ' + n + ' checks ok');
})();

// 17. Landmarks (Stage 15F2a): grass-only footprints, off paths/field/water/NPCs, no overlap with scenery or other layouts, reachability, wiring, draw budget
(function () {
  var n = 0;
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  function need(ok, msg) { if (!ok) err('landmarks: ' + msg); else n++; }
  function overlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
  var src = rd('js/landmarks.js'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src), L = null, i, j, k;
  try { L = new Function(mm[1] + '; return LAYOUT;')(); } catch (e) { err('landmarks: LAYOUT block not parseable'); return; }
  var S = require(path.join(root, 'tools/landmarks_scan.js'))(root), rows = S.rows;
  function tl(re, f) { var m = re.exec(rd(f)); try { return m ? new Function(m[1] + '; return LAYOUT;')() : null; } catch (e) { return null; } }
  var TLay = tl(/\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//, 'js/town_life.js'), FLay = tl(/\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//, 'js/farm_look.js');
  var ext = L.ext, names = Object.keys(ext), bl = {}, other = {}, stands = [];
  L.blocked.forEach(function (b) { bl[b[0] + ',' + b[1]] = 1; });
  // every visual footprint: only grass '.', and a 1-tile margin free of path/stone/water/pier/soil/buildings on the sides that matter (no touching the field)
  names.forEach(function (k2) {
    var r = ext[k2], x, z;
    for (z = r[1]; z < r[3]; z++) for (x = r[0]; x < r[2]; x++) need(S.ch(x, z) === '.', k2 + ' tile ' + x + ',' + z + ' is not grass');
    need(S.conflicts(r, 0.35) === 0, k2 + ' collides with scenery (trees/rocks/bushes/props/solids)');
    need(!(r[2] > 12 && r[0] < 28 && r[3] > 8 && r[1] < 18 && k2 !== 'shed'), k2 + ' inside the field block');
  });
  for (i = 0; i < names.length; i++) for (j = i + 1; j < names.length; j++) need(!overlap(ext[names[i]], ext[names[j]]), names[i] + ' overlaps ' + names[j]);
  if (TLay) { (TLay.blocked || []).forEach(function (b) { other[b[0] + ',' + b[1]] = 1; need(!bl[b[0] + ',' + b[1]], 'blocked tile ' + b + ' shared with TownLife'); }); }
  if (FLay) { (FLay.signs || []).forEach(function (b) { other[b[0] + ',' + b[1]] = 1; need(!bl[b[0] + ',' + b[1]], 'blocked tile ' + b + ' shared with FarmLook sign'); }); }
  other['12,14'] = 1; other['12,17'] = 1;   // well + scarecrow
  L.blocked.forEach(function (b) {
    var inside = false; names.forEach(function (k2) { var r = ext[k2]; if (b[0] >= r[0] && b[0] < r[2] && b[1] >= r[1] && b[1] < r[3]) inside = true; });
    need(inside, 'blocked tile ' + b + ' is outside every footprint'); need(!other[b[0] + ',' + b[1]], 'blocked tile ' + b + ' collides with another solid');
  });
  // NPC / marker tiles: nothing within 1 tile of a shop/workshop/fish stand marker or the door
  Object.keys(S.marks).forEach(function (mk) { S.marks[mk].forEach(function (m) { names.forEach(function (k2) { var r = ext[k2]; need(!overlap(r, [m.tx - 1, m.tz - 1, m.tx + 2, m.tz + 2]), k2 + ' is within 1 tile of marker ' + mk); }); }); });
  // paths: nothing blocked directly on a path/stone tile, and every interactable stand tile is walkable
  L.spots.forEach(function (s) { var sx = s[1], sz = s[2] + 1; stands.push([sx, sz]); need(S.ch(sx, sz) === '.' && !bl[sx + ',' + sz], s[0] + ' stand tile ' + sx + ',' + sz + ' not walkable'); need(bl[s[1] + ',' + s[2]], s[0] + ' tile not blocked'); });
  // BFS: blocking the landmark tiles must not cut any previously reachable walkable tile off from the door
  var Hh = rows.length, Ww = rows[0].length, walkCh = '.=tlpo,sDBnm', base = {}, x2, z2;
  S.solids.forEach(function (c) { base[c[0] + ',' + c[1]] = 1; }); for (k in other) base[k] = 1;
  var door = (S.marks.door || [])[0], start = door ? [door.tx, door.tz + 1] : null;
  function reach(extra) {
    var seen = {}, q = [start], p, d;
    function ok(tx, tz) { var c = S.ch(tx, tz); return walkCh.indexOf(c) >= 0 && c !== 'B' && !base[tx + ',' + tz] && !(extra && extra[tx + ',' + tz]); }
    seen[start.join(',')] = 1;
    while (q.length) { p = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) { var a = p[0] + dd[0], b = p[1] + dd[1], kk = a + ',' + b; if (!seen[kk] && ok(a, b)) { seen[kk] = 1; q.push([a, b]); } }); }
    return seen;
  }
  if (start) {
    var s0 = reach(null), s1 = reach(bl), lost = 0;
    for (z2 = 0; z2 < Hh; z2++) for (x2 = 0; x2 < Ww; x2++) { var kk2 = x2 + ',' + z2; if (s0[kk2] && !s1[kk2] && !bl[kk2]) lost++; }
    need(lost === 0, lost + ' walkable tile(s) cut off by landmark solids');
  } else err('landmarks: no door marker');
  // wiring + budget
  var idx = rd('index.html'), mn = rd('js/main.js');
  need(idx.indexOf('js/landmarks.js') > idx.indexOf('js/farm_look.js') && idx.indexOf('js/landmarks.js') < idx.indexOf('js/main.js') && /Landmarks\.build/.test(mn), 'landmarks.js not linked/wired');
  need(/onFrame\(onFrame, 10\.7\)/.test(src) && /Quality/.test(src), 'frame hook / quality gating missing');
  need(/draws: 5\b/.test(src), 'draw count stat missing');
  var meshes = (src.match(/new THREE\.Mesh\(/g) || []).length, outl = (src.match(/R\.addOutline\(/g) || []).length;
  need(meshes + outl <= 6, 'draw calls from landmarks exceed 6 (' + (meshes + outl) + ')');
  need(!/\p{Extended_Pictographic}/u.test(src), 'emoji in landmarks.js');
  need(/Bảng tin/.test(src) && /Cây cổ thụ/.test(src), 'Vietnamese texts missing');
  console.log('landmarks: ' + n + ' checks ok, 5 est. draw calls (budget <= 150 total unchanged: +5)');
})();

// 18. Critters (Stage 15F2b): headless wander simulation (valid tiles, no NaN, tier gating), layout free of scenery, hive reachability, wiring, draw budget
(function () {
  var n = 0;
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  function need(ok, msg) { if (!ok) err('critters: ' + msg); else n++; }
  var src = rd('js/critters.js'), idx = rd('index.html'), mn = rd('js/main.js'), o = null, S = require(path.join(root, 'tools/landmarks_scan.js'))(root);
  try { o = require(path.join(root, 'tools/critters_sim.js'))(root); } catch (e) { err('critters: sim crashed: ' + e.message); return; }
  need(!o.err, o.err || 'sim');
  need(o.dayBad === 0 && o.rainBad === 0 && o.nightBad === 0 && o.fleeBad === 0 && o.tier1Bad === 0, 'creature left its valid tiles or went NaN (' + [o.dayBad, o.rainBad, o.nightBad, o.fleeBad, o.tier1Bad] + ')');
  need(o.dayStats.chickens === 3 && o.dayStats.ducks === 3 && o.dayStats.bees === 6, 'day counts wrong ' + JSON.stringify(o.dayStats));
  need(o.nightStats.bees === 0, 'bees visible at night');
  need(o.nightBadMove.every(function (d) { return d < 0.01; }), 'creatures wander at night');
  need(o.dayBadMove.slice(0, 3).some(function (d) { return d > 0.5; }) && o.dayBadMove.slice(3, 6).some(function (d) { return d > 0.5; }), 'chickens or ducks never move');
  need(o.tier3Visible === false && o.tier2Visible === true, 'tier gating (off on Siêu nhẹ) wrong');
  need(o.blockedHive, 'hive tile not blocked');
  need(o.draws <= 15, 'draw calls ' + o.draws);
  var L = o.layout, H = L.hive, ch = L.chickens, du = L.ducks, i, j;
  need(!S.conflicts([H.tx, H.tz, H.tx + 1, H.tz + 1], 0.45), 'hive overlaps scenery');
  need(S.ch(H.tx, H.tz) === '.', 'hive not on grass');
  need(!S.conflicts([ch.hx - 0.5, ch.hz - 0.5, ch.hx + 0.5, ch.hz + 0.5], 0.2), 'chicken home overlaps scenery');
  var wet = 0; for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) if (S.ch(Math.floor(du.hx) + i, Math.floor(du.hz) + j) === '~') wet++;
  need(wet === 25, 'duck home is not open water (' + wet + '/25 water tiles)');
  // hive must not cut off any walkable tile
  var wk = '.=t,Bl', door = S.marks.door && S.marks.door[0];
  function bfs(block) {
    var seen = {}, q = [[door.tx, door.tz + 1]], c = 0;
    while (q.length) { var p = q.pop(), k = p[0] + ',' + p[1]; if (seen[k] || wk.indexOf(S.ch(p[0], p[1])) < 0 || (block && p[0] === H.tx && p[1] === H.tz)) continue; seen[k] = 1; c++; q.push([p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]); }
    return c;
  }
  if (door) need(bfs(false) - bfs(true) <= 1, 'hive cuts off walkable tiles'); else err('critters: no door marker');
  need(idx.indexOf('js/critters.js') > idx.indexOf('js/landmarks.js') && idx.indexOf('js/critters.js') < idx.indexOf('js/main.js') && /Critters\.build/.test(mn), 'critters.js not linked/wired');
  need(/Quality/.test(src) && /density/.test(src) && />= 3/.test(src), 'quality gating missing');
  need(!/\p{Extended_Pictographic}/u.test(src), 'emoji in critters.js');
  console.log('critters: ' + n + ' checks ok, ' + o.draws + ' est. draw calls (chickens 6, ducks 6, hive 2, bees 1)');
})();

// 19. Ambient plus (Stage 15F2b): headless simulation of fireflies / dragonflies / butterflies / koi / puddles / litter / gusts, tier gating, layout tiles, wiring, draw budget
(function () {
  var n = 0;
  function rd(f) { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  function need(ok, msg) { if (!ok) err('ambient_plus: ' + msg); else n++; }
  var src = rd('js/ambient_plus.js'), idx = rd('index.html'), mn = rd('js/main.js'), o = null, S = require(path.join(root, 'tools/landmarks_scan.js'))(root), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src), L = null;
  try { o = require(path.join(root, 'tools/ambient_plus_sim.js'))(root); } catch (e) { err('ambient_plus: sim crashed: ' + e.message); return; }
  try { L = new Function(mm[1] + '; return LAYOUT;')(); } catch (e) { err('ambient_plus: LAYOUT block not parseable'); return; }
  need(!o.err, o.err || 'sim');
  need(o.bad.length === 0, 'bad instance matrices: ' + o.bad.slice(0, 3).join('; '));
  need(o.anchors > 20, 'too few shore anchors (' + o.anchors + ')');
  need(o.day.dragonflies === 4 && o.day.butterflies === 4 && o.day.fish === 2 && o.fireflyAtNoon === 0, 'summer day counts wrong ' + JSON.stringify(o.day));
  need(o.dragonY[0] > 0.3 && o.dragonY[1] < 1.3, 'dragonfly height range ' + o.dragonY);
  need(o.jumps >= 2 && o.jumps <= 30 && o.offWater === 0 && o.maxFishY > 0.4 && o.ringSeen > 0, 'koi jumps wrong (jumps ' + o.jumps + ', off water ' + o.offWater + ')');
  need(o.night.fireflies === L.nf && o.fireflyGlowing > 0 && o.night.dragonflies === 0 && o.night.butterflies === 0, 'night counts wrong ' + JSON.stringify(o.night));
  need(o.rain.wet > 0.9 && o.puddleVisible && o.ripples > 0 && o.rain.fireflies === 0 && o.rain.dragonflies === 0, 'rain puddles/ripples wrong');
  need(o.wetAfter30 < 1 && o.wetAfter30 > 0.3 && o.wetAfterDry === 0 && o.wetAfterSnow === 0, 'puddles do not dry (' + [o.wetAfter30, o.wetAfterDry, o.wetAfterSnow] + ')');
  need(o.winter.litter === 0 && o.winter.fish === 0 && o.winter.dragonflies === 0, 'winter should hide litter and animals');
  need(o.autumn.litter === L.nl && o.gustFrames > 100 && o.summerLitter < L.nl, 'seasonal litter / gust wrong');
  need(o.t3night.fireflies === 0 && o.t3rain.dragonflies === 0 && o.t3rain.fish === 0 && o.t3rain.butterflies === 0, 'tier 3 must switch creatures off');
  need(o.t3rain.puddles > 0 && o.t3rain.puddles <= 8, 'tier 3 puddle thinning wrong');
  need(o.t2gust === 0 && o.t2.fish === 1 && o.t2.dragonflies < 4, 'tier 2 gating wrong');
  need(o.t1.dragonflies === 4 && o.t1.fish === 2, 'tier 1 gating wrong');
  need(o.indoorVisible === false, 'visible indoors');
  need(o.draws <= 9, 'draw calls ' + o.draws);
  var i, j, ok;
  L.perch.forEach(function (p) { n += 0; need('.=,'.indexOf(S.ch(Math.floor(p[0]), Math.floor(p[1]))) >= 0, 'perch spot ' + p + ' not on ground'); });
  L.litter.forEach(function (a) {
    var good = 0, tot = 0;
    for (i = -3; i <= 3; i++) for (j = -3; j <= 3; j++) { if (Math.hypot(i, j) > a[2]) continue; tot++; if ('.=,'.indexOf(S.ch(Math.floor(a[0]) + i, Math.floor(a[1]) + j)) >= 0) good++; }
    need(good >= 8, 'litter anchor ' + a + ' has too little open ground (' + good + '/' + tot + ')');
  });
  need(idx.indexOf('js/ambient_plus.js') > idx.indexOf('js/ambient.js') && idx.indexOf('js/ambient_plus.js') < idx.indexOf('js/main.js') && /AmbientPlus\.build/.test(mn), 'ambient_plus.js not linked/wired');
  need(/density/.test(src) && /tier\(\) >= 2/.test(src) && /tr < 3/.test(src), 'quality gating missing');
  need(!/\p{Extended_Pictographic}/u.test(src), 'emoji in ambient_plus.js');
  console.log('ambient_plus: ' + n + ' checks ok, ' + o.draws + ' est. draw calls (fireflies, dragonflies, butterflies, koi, rings, puddles, ripples, litter, gust)');
})();

// 18. DetailExtra (Stage 15F3): wiring, budget, edge skirt covers the margin, no emoji
(function () {
  var fs2 = require('fs'), p2 = require('path'), n = 0;
  function rd(f) { try { return fs2.readFileSync(p2.join(root, f), 'utf8'); } catch (e) { err('unreadable: ' + f); return ''; } }
  function need(ok, msg) { if (!ok) err('detail_extra: ' + msg); else n++; }
  var src = rd('js/detail_extra.js'), idx = rd('index.html'), mn = rd('js/main.js');
  need(idx.indexOf('js/detail_extra.js') > idx.indexOf('js/landmarks.js') && idx.indexOf('js/detail_extra.js') < idx.indexOf('js/main.js') && /DetailExtra\.build/.test(mn), 'not linked/wired');
  var meshes = (src.match(/new THREE\.Mesh\(/g) || []).length, outl = (src.match(/R\.addOutline\(/g) || []).length;
  need(meshes + outl <= 8, 'draw calls exceed 8 (' + (meshes + outl) + ')');
  need(/MARGIN = (\d+)/.test(src) && +/MARGIN = (\d+)/.exec(src)[1] >= 8, 'edge skirt margin < 8 tiles');
  need(/Quality/.test(src) && /quality:changed/.test(src), 'quality gating missing');
  need(!/\p{Extended_Pictographic}/u.test(src), 'emoji');
  var ow = /outlineWidth:\s*([\d.]+)/.exec(rd('js/core.js')); need(ow && +ow[1] >= 2.6, 'outline width too thin');
  console.log('detail_extra: ' + n + ' checks ok (+6 draw calls)');
})();

(function () {
  var r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'perf_budget.js')], { encoding: 'utf8' });
  if (r.status !== 0) err('perf_budget failed: ' + (r.stdout || '').split('\n').filter(function (l) { return /^ERROR/.test(l); }).join('; '));
  else console.log((r.stdout || '').trim().split('\n').pop());
  var pu = fs.readFileSync(path.join(root, 'js', 'perf_ui.js'), 'utf8');
  if (!/Bảng đo hiệu năng/.test(pu) || !/PU\.renderRow/.test(pu)) err('perf overlay settings toggle missing');
})();

console.log('check: ' + files.length + ' files, ' + errors + ' error(s), ' + warnings + ' warning(s)');
process.exit(errors ? 1 : 0);
