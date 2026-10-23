/* Togie Valley - farm.js (Stage 6): farming logic. Game.Farm.
 * Till / water / plant / fertilize / harvest / clear, nutrients, growth at bedtime, rain + sprinklers, season wither,
 * quality + XP, well, hints, save section 'farm'. Minimal visuals: merged tile overlays + placeholder crop markers (Stage 7 replaces).
 * Depends on THREE, core, render, world, models, items, data_crops, state, time, save, player, interact, ui.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.World || !G.Models || !G.Items || !G.Crops || !G.Inventory || !G.State ||
    !G.Time || !G.Day || !G.Save || !G.Player || !G.Interact || !G.UI || !G.Scenes) { console.error('[farm] missing dependencies'); return; }
  var E = G.Events, R = G.Render, W = G.World, P = G.Player, Items = G.Items, Crops = G.Crops, Inv = G.Inventory, S = G.State,
    T = G.Time, UI = G.UI;

  var WELL = { tx: 12, tz: 14 };
  var DIR = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  var NUT = { n: 'đạm (N)', p: 'lân (P)', k: 'kali (K)' };
  var HUNGRY = 25;

  var tiles = {}, sprinklers = {}, flags = { h: {}, found: {} }, water = 40, dirty = true, acting = false;
  var Farm = { group: null, WELL: WELL };

  function key(tx, tz) { return tz * 64 + tx; }
  function tileAt(tx, tz) { return tiles[key(tx, tz)] || null; }
  function isSoil(tx, tz) { return W.tileType(tx + 0.5, tz + 0.5) === 'soil'; }
  function cl(v) { return v < 0 ? 0 : (v > 100 ? 100 : v); }
  function newTile(tx, tz) { return { tx: tx, tz: tz, w: 0, n: 60, p: 60, k: 60, c: null }; }
  function toast(msg, icon) { UI.toast(msg, icon || 'sprout'); }
  function hint(id, msg, icon) { if (flags.h[id]) return; flags.h[id] = 1; toast(msg, icon); G.Save.request(); }
  function changed() { dirty = true; G.Save.request(); }

  function toolTier(id) {
    var s = Inv.container.slots, i;
    for (i = 0; i < s.length; i++) if (s[i] && s[i].id === id) return s[i].tier || 0;
    return 0;
  }
  function waterCap() {
    var d = Items.get('watering_can');
    return (d && d.capacities && d.capacities[toolTier('watering_can')]) || 40;
  }

  /* --------------------------------------------------------------- area */
  function area(tx, tz, facing, tier) {
    var d = DIR[facing] || DIR.s, px = -d[1], pz = d[0], w = tier >= 2 ? 1 : 0, len = [1, 3, 3, 5][Math.max(0, Math.min(3, tier))], out = [], i, j;
    for (j = 0; j < len; j++) for (i = -w; i <= w; i++) out.push([tx + d[0] * j + px * i, tz + d[1] * j + pz * i]);
    return out;
  }
  function guessFacing(tx, tz) {
    var p = P.tile(), f = P.frontTile();
    if (f.tx === tx && f.tz === tz) return P.facing;
    var dx = tx - p.tx, dz = tz - p.tz;
    return Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 'e' : 'w') : (dz >= 0 ? 's' : 'n');
  }

  /* --------------------------------------------------------------- core ops (no energy, no animation) */
  function clearCrop(ts) {
    var c = ts.c;
    if (!c) return;
    var cd = Crops.get(c.id);
    if (cd && cd.cls === 'legume') ts.n = cl(ts.n + 15);
    ts.c = null;
    E.emit('crop:cleared', { id: c.id, tx: ts.tx, tz: ts.tz, by: G.Net.playerId });
  }
  Farm.till = function (tx, tz) {
    if (!isSoil(tx, tz)) return false;
    var ts = tileAt(tx, tz);
    if (ts) { if (ts.c && ts.c.wilt) { clearCrop(ts); changed(); return true; } return false; }
    tiles[key(tx, tz)] = newTile(tx, tz);
    E.emit('soil:tilled', { tx: tx, tz: tz, by: G.Net.playerId });
    changed();
    return true;
  };
  Farm.waterTile = function (tx, tz) {
    var ts = tileAt(tx, tz);
    if (!ts || ts.w) return false;
    ts.w = 1; changed();
    E.emit('soil:watered', { tx: tx, tz: tz, by: G.Net.playerId });
    return true;
  };
  Farm.plant = function (tx, tz, cropId) {
    var ts = tileAt(tx, tz), cd = Crops.get(cropId);
    if (!ts || ts.c || !cd) return false;
    ts.c = { id: cropId, g: 0, ripe: 0, wilt: 0, hs: 0 };
    changed();
    E.emit('crop:planted', { id: cropId, tx: tx, tz: tz, by: G.Net.playerId });
    return true;
  };
  Farm.addNutrient = function (tx, tz, which, amt) {
    var ts = tileAt(tx, tz);
    if (!ts) return false;
    var list = which === 'npk' ? ['n', 'p', 'k'] : [which];
    list.forEach(function (k) { ts[k] = cl(ts[k] + amt); });
    changed();
    return true;
  };
  Farm.found = function (id) { return !!flags.found[id]; };
  Farm.qualityChances = function (prim) {
    var g = Math.min(1, 0.02 + 0.02 * S.level('farming') + (prim >= 60 ? 0.1 : 0) + (prim >= 85 ? 0.1 : 0) + (G.Cooking ? G.Cooking.bonus('farm') : 0));
    return { gold: g, silver: Math.min(g * 2, 1 - g) };
  };
  function rollQuality(prim, tx, tz) {
    var q = Farm.qualityChances(prim), r = G.Net.rand('farm.quality', tx * 1000 + tz);
    return r < q.gold ? 'gold' : (r < q.gold + q.silver ? 'silver' : 'normal');
  }
  /* Harvest a ripe crop into the backpack. Returns {id,n,q} or null (not ripe / backpack full -> reason in Farm.lastFail). */
  Farm.harvestAt = function (tx, tz) {
    var ts = tileAt(tx, tz), c = ts && ts.c;
    Farm.lastFail = '';
    if (!c || !c.ripe || c.wilt) return null;
    var cd = Crops.get(c.id), prim = cd.primary, q = rollQuality(ts[prim], tx, tz);
    if (!Inv.canAdd(c.id, cd.yield, q)) { Farm.lastFail = 'full'; return null; }
    Inv.add(c.id, cd.yield, q);
    var drain = cd.regrow ? 5 : 15, k;
    ['n', 'p', 'k'].forEach(function (k2) { ts[k2] = cl(ts[k2] - (k2 === prim ? drain : 3)); });
    if (cd.cls === 'legume') ts.n = cl(ts.n + 15);
    if (cd.regrow) { c.ripe = 0; c.g = Math.max(0, cd.days - cd.regrow); c.hs = 0; } else ts.c = null;
    S.addXp('farming', Math.round(16 * Math.log(0.018 * cd.price + 1)));
    var first = !flags.found[c.id];
    flags.found[c.id] = 1;
    changed();
    E.emit('crop:harvested', { id: c.id, n: cd.yield, q: q, tx: tx, tz: tz, first: first, by: G.Net.playerId });
    if (first) toast(cd.name + ': ' + cd.tip, 'notebook');
    if (cd.cls === 'legume') hint('legume', 'Cây họ đậu cố định đạm: đậu để lại thêm N trong đất cho vụ sau.', 'sprout');
    return { id: c.id, n: cd.yield, q: q };
  };
  Farm.placeSprinkler = function (tx, tz, tier) {
    var ts = tileAt(tx, tz);
    if (!ts || ts.c || sprinklers[key(tx, tz)]) return false;
    sprinklers[key(tx, tz)] = { tx: tx, tz: tz, tier: tier === 2 ? 2 : 1 };
    changed();
    return true;
  };
  Farm.sprinklerCount = function () { return Object.keys(sprinklers).length; };

  /* --------------------------------------------------------------- queries */
  Farm.tileAt = function (tx, tz) { var t = tileAt(tx, tz); return t ? { tilled: true, watered: !!t.w, n: t.n, p: t.p, k: t.k, crop: t.c ? Farm.cropAt(tx, tz) : null } : null; };
  Farm.cropAt = function (tx, tz) {
    var t = tileAt(tx, tz), c = t && t.c;
    if (!c) return null;
    var cd = Crops.get(c.id);
    return { id: c.id, grown: c.g, days: cd.days, ripe: !!c.ripe, wilted: !!c.wilt, hungry: t[cd.primary] < HUNGRY, watered: !!t.w,
      progress: c.ripe ? 1 : Math.min(1, c.g / cd.days) };
  };
  Farm.eachTile = function (fn) { forEachTile(fn); };
  /* Dev: ripen every planted crop now; returns the count. */
  Farm.growAll = function () {
    var n = 0;
    forEachTile(function (t) { var cd = t.c && Crops.get(t.c.id); if (cd && !t.c.ripe) { t.c.g = cd.days; t.c.ripe = 1; t.c.wilt = 0; n++; } });
    if (n) changed();
    return n;
  };
  Farm.eachSprinkler = function (fn) { for (var k in sprinklers) fn(sprinklers[k]); };
  Farm.isTilled = function (tx, tz) { return !!tileAt(tx, tz); };
  Farm.waterLeft = function () { return water; };
  Farm.waterCap = waterCap;

  /* --------------------------------------------------------------- day cycle */
  function forEachTile(fn) { for (var k in tiles) fn(tiles[k]); }
  function applySprinklers() {
    for (var k in sprinklers) {
      var s = sprinklers[k], i, j;
      for (j = -1; j <= 1; j++) for (i = -1; i <= 1; i++) {
        if (!i && !j) continue;
        if (s.tier === 1 && i && j) continue;
        var ts = tileAt(s.tx + i, s.tz + j);
        if (ts) ts.w = 1;
      }
    }
  }
  function line(text, icon) { if (G.House && G.House.addSummaryLine) G.House.addSummaryLine(text, icon); }

  G.Day.onEnd(10, function () {
    var next = T.seasonOf(T.day + 1), rain = T.weather === 'rain', ripe = 0, wilted = 0, dry = 0, hungryCrop = null;
    if (rain) forEachTile(function (ts) { ts.w = 1; });
    applySprinklers();
    forEachTile(function (ts) {
      var c = ts.c;
      if (!c || c.wilt) return;
      var cd = Crops.get(c.id);
      if (ts[cd.primary] < HUNGRY && !hungryCrop) hungryCrop = cd;
      if (next !== T.season && !Crops.inSeason(c.id, next)) { c.wilt = 1; wilted++; return; }
      if (!c.ripe) {
        if (!ts.w) { dry++; return; }
        if (ts[cd.primary] < HUNGRY) { c.hs = c.hs ? 0 : 1; if (c.hs) return; } else c.hs = 0;
        c.g++;
        if (c.g >= cd.days) c.ripe = 1;
      }
      if (c.ripe) ripe++;
    });
    forEachTile(function (ts) { ts.w = 0; });
    if (ripe) line(ripe + ' cây đã chín, sẵn sàng thu hoạch.', 'sprout');
    if (dry) line(dry + ' cây bị khát nên không lớn. Nhớ tưới nhé!', 'rain');
    if (wilted) {
      line(wilted + ' cây héo vì trái mùa. Dọn chúng bằng cuốc nhé.', 'warn');
      if (!flags.h.wilt) { flags.h.wilt = 1; line('Mỗi loại cây chỉ lớn đúng mùa của nó: xem mẹo trên hạt giống trước khi gieo nhé.', 'sprout'); }
    }
    if (hungryCrop && !flags.h.hungry) {
      flags.h.hungry = 1;
      line('Lá nhợt nghĩa là đất đói. ' + hungryCrop.name + ' cần ' + NUT[hungryCrop.primary] + ': hãy bón phân cho ô đất.', 'sprout');
    }
    dirty = true;
  });

  G.Day.onStart(10, function (info) {
    if (info.weather === 'rain') {
      forEachTile(function (ts) { ts.w = 1; });
      if (!flags.h.rain) { flags.h.rain = 1; line('Hôm nay mưa tưới hết cây rồi. Khỏi cần bình tưới!', 'rain'); }
    }
    applySprinklers();
    dirty = true;
    G.Save.request();
  });

  /* --------------------------------------------------------------- actions (player-facing) */
  function tired() { toast('Bạn hết năng lượng rồi. Ăn chút gì để làm tiếp nhé!', 'energy'); }
  function act(name, dur) {
    if (acting) return;
    acting = true; P.lock('farm');
    var done = false;
    function fin() { if (done) return; done = true; acting = false; P.unlock('farm'); }
    var cd = G.AnimData ? G.AnimData.get(name).dur : dur;
    P.playAction(name, { duration: dur }, fin);
    setTimeout(fin, cd * 1000 + 900);
  }

  function runTill(t) {
    var sel = Inv.selected();
    if (!sel || sel.id !== 'hoe') return;
    if (!S.canWork()) { tired(); return; }
    var tier = sel.tier || 0, n = 0;
    area(t.tx, t.tz, P.facing, tier).forEach(function (a) { if (Farm.till(a[0], a[1])) n++; });
    if (!n) { toast('Chỗ này không cuốc được. Chỉ đất nông trại mới cuốc thôi.', 'warn'); return; }
    S.useEnergy(Items.energyCost('hoe', tier));
    act('till', 0.7); UI.sfx('pop');
    hint('till', 'Đất cuốc tơi xốp: rễ lan dễ và nước thấm ngay.', 'sprout');
  }
  function runPour(t) {
    var sel = Inv.selected();
    if (!sel || sel.id !== 'watering_can') return;
    if (water <= 0) { toast('Bình tưới hết nước. Múc đầy ở giếng hoặc bờ nước nhé.', 'rain'); return; }
    if (!S.canWork()) { tired(); return; }
    var tier = sel.tier || 0, n = 0, list = area(t.tx, t.tz, P.facing, tier), i, dry = 0;
    for (i = 0; i < list.length; i++) { var ts = tileAt(list[i][0], list[i][1]); if (ts && !ts.w) dry++; }
    if (!dry) { toast('Ô này tưới rồi.', 'rain'); return; }
    for (i = 0; i < list.length && water > 0; i++) if (Farm.waterTile(list[i][0], list[i][1])) { water--; n++; }
    S.useEnergy(Items.energyCost('watering_can', tier));
    act('water', 0.8); UI.sfx('pop');
    if (water <= 0) toast('Bình tưới cạn rồi. Múc đầy ở giếng hoặc bờ nước nhé.', 'rain');
    else if (water <= 5) toast('Bình tưới: còn ' + water + '.', 'rain');
    changed();
  }
  function runPlant(t) {
    var sel = Inv.selected(), d = sel && Items.get(sel.id), cd = d && Crops.get(d.crop);
    if (!cd || d.cat !== 'seed') return;
    var ts = tileAt(t.tx, t.tz);
    if (!ts || ts.c) return;
    if (!Crops.inSeason(cd.id, T.season)) {
      toast(cd.name + ' mọc vào ' + cd.seasons.map(function (x) { return G.VI.seasonLow[x]; }).join(' và ') + ', không phải ' + G.VI.seasonLow[T.season] + '. Đa số cây cần đúng nhiệt độ.', 'warn');
      return;
    }
    if (!Inv.remove(sel.id, 1, sel.q)) return;
    Farm.plant(t.tx, t.tz, cd.id);
    act('plant', 0.6); UI.sfx('pop');
    var nextOk = Crops.inSeason(cd.id, T.seasonOf(T.day + 14 - T.dayOfSeason() + 1));
    if (!nextOk && cd.days > 14 - T.dayOfSeason()) toast('Lưu ý: cây có thể không kịp chín trước khi hết mùa.', 'warn');
    if (cd.cls === 'legume') hint('legume', 'Cây họ đậu cố định đạm: đậu để lại thêm N trong đất cho vụ sau.', 'sprout');
  }
  function runFert(t) {
    var sel = Inv.selected(), d = sel && Items.get(sel.id), ts = tileAt(t.tx, t.tz);
    if (!d || !d.nutrient || !ts) return;
    var amt = d.nutrient === 'npk' ? 20 : 50, keys = d.nutrient === 'npk' ? ['n', 'p', 'k'] : [d.nutrient];
    if (keys.every(function (k) { return ts[k] >= 100; })) { toast('Đất này đã đầy dưỡng chất rồi.', 'check'); return; }
    if (!Inv.remove(sel.id, 1, sel.q)) return;
    Farm.addNutrient(t.tx, t.tz, d.nutrient, amt);
    act('fertilize', 0.6); UI.sfx('pop');
    toast(d.name + ': ' + (d.nutrient === 'npk' ? 'N, P và K' : NUT[d.nutrient]) + ' +' + amt + '.', 'sprout');
  }
  function runHarvest(t) {
    var r = Farm.harvestAt(t.tx, t.tz);
    if (!r) { if (Farm.lastFail === 'full') toast('Túi đồ đầy rồi.', 'bag'); return; }
    act('harvest', 0.6); UI.sfx('pop');
  }
  function runSprinkler(t) {
    var sel = Inv.selected(), d = sel && Items.get(sel.id);
    if (!d || !d.sprinkler) return;
    if (!Farm.placeSprinkler(t.tx, t.tz, d.sprinkler)) { toast('Vòi phun cần một ô đất đã cuốc còn trống.', 'warn'); return; }
    Inv.remove(sel.id, 1, sel.q);
    act('plant', 0.6); UI.sfx('pop');
    toast('Đã đặt vòi phun. Mỗi sáng nó tưới các ô xung quanh.', 'rain');
  }
  function refill(msg) {
    var cap = waterCap();
    if (water >= cap) { toast('Bình tưới đầy rồi.', 'rain'); return; }
    water = cap; UI.sfx('pop'); G.Save.request();
    toast(msg + ' (' + cap + '/' + cap + ')', 'rain');
    act('water', 0.8);
  }

  function run(t) {
    if (P.isLocked()) return;
    switch (t.kind) {
      case 'well':
        if (toolTier('watering_can') >= 0 && Inv.count('watering_can') > 0) refill('Đã múc đầy bình tưới');
        else toast('Giếng sâu đây. Nước ngầm được lọc qua nhiều lớp đất và đá.', 'rain');
        break;
      case 'refill': refill('Múc được ít nước rồi'); break;
      case 'locked': toast('Mảnh đất này đang khóa. Giấy phép đất bán ở cửa hàng nhé.', 'lock'); break;
      case 'harvest': runHarvest(t); break;
      case 'till': runTill(t); break;
      case 'pour': runPour(t); break;
      case 'plant': runPlant(t); break;
      case 'fert': runFert(t); break;
      case 'sprinkler': runSprinkler(t); break;
      case 'hint': toast(t.msg, 'sprout'); break;
    }
  }

  /* --------------------------------------------------------------- interact handler */
  function hoeUseful(tx, tz) {
    return area(tx, tz, guessFacing(tx, tz), (Inv.selected().tier || 0)).some(function (a) {
      if (!isSoil(a[0], a[1])) return false;
      var ts = tileAt(a[0], a[1]);
      return !ts || (ts.c && ts.c.wilt);
    });
  }
  function canUseful(tx, tz) {
    return area(tx, tz, guessFacing(tx, tz), (Inv.selected().tier || 0)).some(function (a) { var ts = tileAt(a[0], a[1]); return ts && !ts.w; });
  }
  function test(tx, tz, scene) {
    if (scene !== 'outdoor') return null;
    var sel = Inv.selected(), d = sel && Items.get(sel.id), cat = d ? d.cat : '', tt = W.tileType(tx + 0.5, tz + 0.5);
    if (tx === WELL.tx && tz === WELL.tz) return { kind: 'well', tx: tx, tz: tz };
    if (tt === 'water') return sel && sel.id === 'watering_can' ? { kind: 'refill', tx: tx, tz: tz } : null;
    if (tt === 'locked') return sel && (sel.id === 'hoe' || sel.id === 'watering_can' || cat === 'seed' || cat === 'fertilizer') ? { kind: 'locked', tx: tx, tz: tz } : null;
    if (tt !== 'soil') return null;
    var ts = tileAt(tx, tz), c = ts && ts.c;
    if (c && c.ripe && !c.wilt) return { kind: 'harvest', tx: tx, tz: tz };
    if (c && c.wilt) return sel && sel.id === 'hoe' ? { kind: 'till', tx: tx, tz: tz } : { kind: 'hint', tx: tx, tz: tz, msg: 'Cây này héo rồi. Dọn bằng Cuốc nhé.' };
    if (!sel) return null;
    if (sel.id === 'hoe') return hoeUseful(tx, tz) ? { kind: 'till', tx: tx, tz: tz } : null;
    if (sel.id === 'watering_can') return canUseful(tx, tz) ? { kind: 'pour', tx: tx, tz: tz } : null;
    if (cat === 'seed' && d.crop) return !ts ? { kind: 'hint', tx: tx, tz: tz, msg: 'Hãy cuốc đất bằng Cuốc trước khi gieo hạt.' } : (c ? null : { kind: 'plant', tx: tx, tz: tz });
    if (cat === 'fertilizer' && d.nutrient) return ts ? { kind: 'fert', tx: tx, tz: tz } : { kind: 'hint', tx: tx, tz: tz, msg: 'Cuốc đất trước đã: phân bón chỉ hợp với đất đã cuốc.' };
    if (d && d.sprinkler) return ts && !c && !sprinklers[key(tx, tz)] ? { kind: 'sprinkler', tx: tx, tz: tz } : { kind: 'hint', tx: tx, tz: tz, msg: 'Vòi phun cần một ô đất đã cuốc còn trống.' };
    return null;
  }
  function stand(t) {
    var p = P.tile();
    if (t.tx === p.tx && t.tz === p.tz) return { tx: p.tx, tz: p.tz, facing: P.facing };
    var best = null, bd = 1e9, f;
    for (f in DIR) {
      var sx = t.tx - DIR[f][0], sz = t.tz - DIR[f][1];
      if (!G.Scenes.isWalkableTile(sx, sz)) continue;
      var dist = Math.abs(sx - p.tx) + Math.abs(sz - p.tz) + (f === P.facing && !(sx === p.tx && sz === p.tz) ? 0 : 0.01);
      if (dist < bd) { bd = dist; best = { tx: sx, tz: sz, facing: f }; }
    }
    return best;
  }
  G.Interact.register({ id: 'farm', priority: 50, test: test, stand: stand, run: run });

  /* --------------------------------------------------------------- well prop */
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), EU = new THREE.Euler();
  function wellGeometry() {
    var L = [];
    function add(g, color, x, y, z, ry) {
      EU.set(0, ry || 0, 0); M4.compose(V.set(x, y, z), Q.setFromEuler(EU), S3.set(1, 1, 1)); g.applyMatrix4(M4);
      L.push({ g: g.toNonIndexed(), c: new THREE.Color(color) });
    }
    add(new THREE.CylinderGeometry(0.4, 0.42, 0.5, 12), 0xa9aeb5, 0, 0.25, 0);
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12), 0x3f9fc4, 0, 0.5, 0);
    add(new THREE.BoxGeometry(0.1, 0.9, 0.1), 0x8c5a34, -0.36, 0.95, 0);
    add(new THREE.BoxGeometry(0.1, 0.9, 0.1), 0x8c5a34, 0.36, 0.95, 0);
    add(new THREE.BoxGeometry(0.9, 0.08, 0.1), 0xc98b4f, 0, 1.3, 0);
    add(new THREE.BoxGeometry(1.0, 0.07, 0.8), 0xe8715d, 0, 1.42, 0);
    add(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 8), 0xc98b4f, 0, 0.88, 0);
    var pos = [], nor = [], col = [], i, j;
    L.forEach(function (o) {
      var p = o.g.attributes.position.array, n = o.g.attributes.normal.array;
      for (j = 0; j < p.length; j++) { pos.push(p[j]); nor.push(n[j]); }
      for (j = 0; j < p.length / 3; j++) col.push(o.c.r, o.c.g, o.c.b);
      o.g.dispose();
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    R.addSmoothNormals(g);
    return g;
  }

  /* --------------------------------------------------------------- minimal visuals (preallocated dynamic buffers) */
  function Dyn(max, mat, name) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.nor = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    var g = this.geo = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aN = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('normal', this.aN); g.setAttribute('color', this.aC);
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(28, 0, 18), 60);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = name; this.mesh.frustumCulled = false; this.mesh.raycast = function () {};
  }
  Dyn.prototype.reset = function () { this.n = 0; };
  Dyn.prototype.vert = function (x, y, z, nx, ny, nz, c) {
    var i = this.n * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z;
    this.nor[i] = nx; this.nor[i + 1] = ny; this.nor[i + 2] = nz;
    this.col[i] = c.r; this.col[i + 1] = c.g; this.col[i + 2] = c.b;
    this.n++;
  };
  Dyn.prototype.tri = function (a, b, c, nx, ny, nz, col) {
    if (this.n + 3 > this.max) return;
    this.vert(a[0], a[1], a[2], nx, ny, nz, col); this.vert(b[0], b[1], b[2], nx, ny, nz, col); this.vert(c[0], c[1], c[2], nx, ny, nz, col);
  };
  Dyn.prototype.quad = function (x0, z0, x1, z1, y, col) {
    this.tri([x0, y, z0], [x0, y, z1], [x1, y, z1], 0, 1, 0, col);
    this.tri([x0, y, z0], [x1, y, z1], [x1, y, z0], 0, 1, 0, col);
  };
  Dyn.prototype.flush = function () {
    this.aP.needsUpdate = this.aN.needsUpdate = this.aC.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  };

  var cache = {};
  function col(hex) { return cache[hex] || (cache[hex] = new THREE.Color(hex)); }
  var tmpC = new THREE.Color(), PALE = new THREE.Color(0xe6dc8a), BROWN = new THREE.Color(0x7b5a3a);
  var A = [0, 0, 0], B1 = [0, 0, 0], B2 = [0, 0, 0];

  // pyramid with `seg` sides, base at y0, apex height h
  function pyramid(d, cx, cz, y0, r, h, seg, c) {
    var i, a0, a1, nx, ny, nz, len;
    for (i = 0; i < seg; i++) {
      a0 = (i / seg) * 6.2832; a1 = ((i + 1) / seg) * 6.2832;
      A[0] = cx; A[1] = y0 + h; A[2] = cz;
      B1[0] = cx + Math.cos(a0) * r; B1[1] = y0; B1[2] = cz + Math.sin(a0) * r;
      B2[0] = cx + Math.cos(a1) * r; B2[1] = y0; B2[2] = cz + Math.sin(a1) * r;
      var am = (a0 + a1) / 2;
      nx = Math.cos(am) * h; nz = Math.sin(am) * h; ny = r; len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      d.tri(A, B2, B1, nx / len, ny / len, nz / len, c);
    }
  }
  function diamond(d, cx, cy, cz, r, c) {   // small octahedron (ripe marker)
    var i, a0, a1, top = [cx, cy + r * 1.3, cz], bot = [cx, cy - r * 1.3, cz], p0 = [0, cy, 0], p1 = [0, cy, 0];
    for (i = 0; i < 4; i++) {
      a0 = i * 1.5708; a1 = (i + 1) * 1.5708;
      p0[0] = cx + Math.cos(a0) * r; p0[2] = cz + Math.sin(a0) * r; p1[0] = cx + Math.cos(a1) * r; p1[2] = cz + Math.sin(a1) * r;
      var m = (a0 + a1) / 2, nx = Math.cos(m), nz = Math.sin(m);
      d.tri(top, p1, p0, nx, 0.7, nz, c);
      d.tri(bot, p0, p1, nx, -0.7, nz, c);
    }
  }

  var dTill, dWet, dCrop, visW = 0;
  function rebuild() {
    dirty = false;
    if (Farm.fx) { E.emit('farm:changed', {}); return; }   // Stage 7: farm_fx.js draws everything
    dTill.reset(); dWet.reset(); dCrop.reset();
    var k, ts, cx, cz, cd, c, p, h, r, base, prim;
    var cTill = col(0x6e4228), cWet = col(0x45291a);
    for (k in tiles) {
      ts = tiles[k]; cx = ts.tx + 0.5; cz = ts.tz + 0.5;
      dTill.quad(ts.tx + 0.04, ts.tz + 0.04, ts.tx + 0.96, ts.tz + 0.96, 0.022, cTill);
      if (ts.w) dWet.quad(ts.tx + 0.04, ts.tz + 0.04, ts.tx + 0.96, ts.tz + 0.96, 0.04, cWet);
      c = ts.c;
      if (!c) continue;
      cd = Crops.get(c.id);
      p = c.ripe ? 1 : Math.min(1, c.g / cd.days);
      prim = ts[cd.primary];
      tmpC.set(cd.c1);
      if (c.wilt) { tmpC.copy(BROWN); h = 0.14 + 0.2 * p; }
      else {
        h = 0.16 + 0.46 * p;
        if (prim < HUNGRY) tmpC.lerp(PALE, 0.6);
        else if (!c.ripe) tmpC.lerp(col(0x79c75a), 0.45);
      }
      r = 0.13 + 0.13 * p;
      pyramid(dCrop, cx, cz, 0.04, r, h, 6, tmpC);
      if (c.ripe && !c.wilt) diamond(dCrop, cx, 0.04 + h + 0.12, cz, 0.09, col(cd.c2 === '#ffffff' ? 0xcfeaff : cd.c2));
    }
    for (k in sprinklers) {
      var s = sprinklers[k];
      pyramid(dCrop, s.tx + 0.5, s.tz + 0.5, 0.04, 0.1, 0.22, 4, col(s.tier === 2 ? 0xd9b45a : 0x8a98a8));
    }
    dTill.flush(); dWet.flush(); dCrop.flush();
    E.emit('farm:changed', {});
  }

  Farm.build = function () {
    if (Farm.group) return Farm.group;
    var g = Farm.group = new THREE.Group(); g.name = 'farm';
    function mat() { return R.toonMaterial({ color: 0xffffff, seasonal: 0, halftone: false }); }
    dTill = new Dyn(1400, mat(), 'farm_tilled'); dWet = new Dyn(1400, mat(), 'farm_wet'); dCrop = new Dyn(9000, mat(), 'farm_crops');
    if (!Farm.fx) g.add(dTill.mesh, dWet.mesh, dCrop.mesh);
    // well: prop + collision + interactable
    var well = new THREE.Mesh(wellGeometry(), G.Models.material('prop'));
    well.name = 'well'; well.position.set(WELL.tx + 0.5, 0, WELL.tz + 0.5);
    R.addOutline(well, false);
    g.add(well);
    R.addBlobShadow(well, 0.6);
    W.setBlocked(WELL.tx, WELL.tz, true);
    W.registerInteractable({ id: 'well', type: 'well', tile: { tx: WELL.tx, tz: WELL.tz }, facing: 'n', hint: 'Múc nước' });
    R.scene.add(g);
    dirty = true;
    G.Loop.onFrame(function () { if (dirty) rebuild(); }, 20);
    E.on('scene:changed', function (e) { g.visible = e.to === 'outdoor'; });
    return g;
  };

  /* --------------------------------------------------------------- save */
  function reset() {
    tiles = {}; sprinklers = {}; flags = { h: {}, found: {} }; water = 40; acting = false;
    W.setPlots([]);
    dirty = true;
  }
  G.Save.register('farm', {
    save: function () {
      var t = [], s = [], k;
      for (k in tiles) { var x = tiles[k], c = x.c; t.push([x.tx, x.tz, x.w, x.n, x.p, x.k, c ? [c.id, c.g, c.ripe, c.wilt, c.hs] : 0]); }
      for (k in sprinklers) s.push([sprinklers[k].tx, sprinklers[k].tz, sprinklers[k].tier]);
      return { tiles: t, sprinklers: s, water: water, plots: W.unlockedPlots(), flags: flags };
    },
    load: function (o) {
      reset();
      if (!o) return;
      W.setPlots(o.plots || []);
      (o.tiles || []).forEach(function (a) {
        if (!isSoil(a[0], a[1])) return;
        var ts = newTile(a[0], a[1]);
        ts.w = a[2] ? 1 : 0; ts.n = a[3]; ts.p = a[4]; ts.k = a[5];
        if (a[6] && Crops.get(a[6][0])) ts.c = { id: a[6][0], g: a[6][1] | 0, ripe: a[6][2] ? 1 : 0, wilt: a[6][3] ? 1 : 0, hs: a[6][4] ? 1 : 0 };
        tiles[key(a[0], a[1])] = ts;
      });
      (o.sprinklers || []).forEach(function (a) { sprinklers[key(a[0], a[1])] = { tx: a[0], tz: a[1], tier: a[2] === 2 ? 2 : 1 }; });
      water = typeof o.water === 'number' ? Math.min(o.water, waterCap()) : waterCap();
      if (o.flags) { flags.h = o.flags.h || {}; flags.found = o.flags.found || {}; }
    },
    reset: reset
  }, 'world');

  G.Farm = Farm;
})();
