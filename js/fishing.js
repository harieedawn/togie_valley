/* Togie Valley - fishing.js (Stage 9): Game.Fishing - pier seat fishing logic.
 * State machine: off -> idle -> charge -> cast -> wait -> bite -> reel -> result -> idle.
 * Depends on: data_fish.js, state.js, time.js, player.js, interact.js, world.js, ui.js, save.js, render.js
 * Public: Fishing.state, seat, rodInfo(), baitId, pickCatch(zone), zoneFor(v), qualityFor(lvl,perfect), records, totals,
 *   cancel(), stats(). Events: fish:sat, fish:cast {zone,v}, fish:bite {id}, fish:caught {id,n,q,first,size,perfect},
 *   fish:escaped {id,reason}, fish:junk {id}, fish:stopped. Save key: fishing.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.FishData || !G.Player || !G.World || !G.State || !G.Inventory || !G.Time || !G.UI || !G.Save || !G.Render || !G.Icons) {
    console.error('[fishing] missing deps (data_fish.js, player, world, state, time, ui, save, render, icons)'); return;
  }
  var E = G.Events, P = G.Player, W = G.World, S = G.State, Inv = G.Inventory, T = G.Time, UI = G.UI, Items = G.Items, FD = G.FishData, Icons = G.Icons;

  var F = G.Fishing = {
    state: 'off', seat: null, baitId: null, records: {}, totals: { casts: 0, catches: 0, junk: 0, escapes: 0, perfect: 0 }, flags: { h: {} }
  };
  var ZONES = ['s', 'm', 'd'], ZONE_NAME = { s: 'Nước nông', m: 'Nước vừa', d: 'Nước sâu' };
  var CHARGE_SEC = 1.3, CAST_SEC = 0.55;

  var held = false, btnDown = false, charge = 0, chargeT = 0, castT = 0, waitT = 0, biteT = 0, biteWin = 0, resT = 0;
  var target = null, from = null, plan = null, rod = null, usedBait = null, paused = false, locked = false;
  var R = null;   // reel state
  var bobT = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function wr(tag) { return G.Net.rand(tag, F.totals.casts); }   // Stage 14A: gameplay rolls derive from Time.seed + day (+ cast count)
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function toast(m, i) { UI.toast(m, i); }
  function hint(id, msg, icon) { if (F.flags.h[id]) return; F.flags.h[id] = 1; toast(msg, icon || 'star'); G.Save.request(); }

  /* ------------------------------------------------------------------ rules */
  F.zoneFor = function (v) { return v < 0.34 ? 's' : v < 0.67 ? 'm' : 'd'; };
  // 8 seats: north row seat1-4, south row seat5-8; each row runs shallow -> deep, so use the position inside the row
  function seatShift(idx) { return 0.3 * (((clamp(idx, 1, 8) - 1) % 4)) / 3; }

  function bestRod() {
    var sel = Inv.selected(), best = null, i, s, r;
    if (sel && FD.isRod(sel.id)) return { id: sel.id, tier: sel.tier || 0, info: FD.rodInfo(sel.id) };
    for (i = 0; i < Inv.size; i++) {
      s = Inv.get(i);
      if (s && FD.isRod(s.id)) {
        r = FD.rodOrder.indexOf(s.id);
        if (!best || r > best.rank) best = { id: s.id, tier: s.tier || 0, info: FD.rodInfo(s.id), rank: r };
      }
    }
    return best;
  }
  F.rodInfo = function () { return bestRod(); };

  function baitOptions() {
    var out = [], i, id;
    for (i = 0; i < FD.baits.length; i++) { id = FD.baits[i]; if (Inv.count(id) > 0) out.push(id); }
    return out;
  }
  function currentBait(r) {
    if (!r || !r.info.bait) return null;
    var sel = Inv.selected();
    if (sel && Items.get(sel.id) && Items.get(sel.id).cat === 'bait') F.baitId = sel.id;
    if (F.baitId && Inv.count(F.baitId) <= 0) F.baitId = null;
    return F.baitId;
  }

  /* Weighted pick of what bites. -> {kind:'fish'|'junk', def} */
  F.pickCatch = function (zone, baitId, wk, opt) {
    opt = opt || {};   // Stage 16 D2: {hot: bool (ignore zone), prefer: [ids] x6 weight, junk: p, plain: bool (normal tier only)}
    wk = wk === undefined ? 0.5 : clamp(wk, 0, 1);   // wait factor 0 (short) .. 1 (very long)
    var season = T.season, hour = T.hour, wx = T.weather, lvl = S.level('fishing');
    var dawnDusk = (hour < 8.5) || (hour >= 18 && hour < 20.5);
    var bt = baitId ? Items.get(baitId) : null, bk = bt ? bt.bait : null;
    var list = [], total = 0, i, d, w;
    for (i = 0; i < FD.species.length; i++) {
      d = FD.species[i];
      if ((!opt.hot && d.zones.indexOf(zone) < 0) || d.seasons.indexOf(season) < 0 || d.lvl > lvl) continue;
      if (hour < d.h[0] || hour >= d.h[1]) continue;
      if (d.weather && d.weather.indexOf(wx) < 0) continue;
      if (opt.plain && d.tier && d.tier !== 'normal') continue;
      w = 12 - d.diff * 1.5;
      if (opt.prefer && opt.prefer.indexOf(d.id) >= 0) w *= 6;
      if (d.legend) w *= 0.15;
      w *= rarityMul(d, wk);
      if (w <= 0.001) continue;
      if (bk) w *= (d.bait === bk ? 3 : 0.7);
      if (d.lk.indexOf('r') >= 0 && wx === 'rain') w *= 1.8;
      if (d.lk.indexOf('d') >= 0 && dawnDusk) w *= 1.8;
      if (season === 'winter') w *= (d.lk.indexOf('c') >= 0 ? 1.6 : 0.6);
      list.push({ d: d, w: w }); total += w;
    }
    if (!list.length || wr('fish.junk') < (opt.junk !== undefined ? opt.junk : (bk ? 0.1 : 0.14))) return { kind: 'junk', def: pickJunk() };
    var r = wr('fish.pick') * total;
    for (i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) return { kind: 'fish', def: list[i].d }; }
    return { kind: 'fish', def: list[list.length - 1].d };
  };
  // Wait-driven rarity: rare species only appear after longer waits, commons dominate short ones.
  var GATE = [0, 0, 0.08, 0.28, 0.48, 0.64];
  function rarityMul(d, k) {
    var g = d.legend ? 0.8 : GATE[clamp(d.diff, 1, 5)];
    if (g <= 0 && d.diff <= 1) return 1.7 - 1.3 * k;
    if (d.diff <= 2 && !d.legend) return (1.5 - 1.1 * k) * clamp((k - g) / 0.15 + 0.35, 0, 1);
    var f = clamp((k - g) / 0.22, 0, 1);
    f = f * f * (3 - 2 * f);
    return f * (0.7 + 1.6 * k + (k > 0.85 ? 1 : 0));
  }
  function pickJunk() {
    var j = FD.junk, r = wr('fish.junkpick') * 3.7, i;
    for (i = 0; i < j.length; i++) { r -= (j[i].id === 'plastic_bag' ? 0.7 : 1); if (r <= 0) return j[i]; }
    return j[0];
  }

  F.qualityFor = function (lvl, perfect, wk) {
    wk = wk === undefined ? 0.5 : clamp(wk, 0, 1);
    var g = clamp((0.02 + 0.02 * lvl + (perfect ? 0.12 : 0) + (G.Cooking ? G.Cooking.bonus('fish') : 0)) * (0.5 + 1.0 * wk), 0, 0.55), s = clamp(g * 2, 0, 0.6), r = wr('fish.quality');
    return r < g ? 'gold' : r < g + s ? 'silver' : 'normal';
  };

  /* Skewed roll first: ~3-40 s, most rolls short-medium, long waits rare. Returns the base roll (0..1) and the real wait. */
  var waitK = 0.2;
  function waitSeconds(hasBait) {
    var u = wr('fish.wait');
    waitK = clamp(Math.pow(u, 2.4), 0, 1);
    var t = 3 + 37 * waitK;
    if (hasBait) t *= 0.75;
    if (T.weather === 'rain') t *= 0.85;
    if (T.season === 'winter') t *= 1.25;
    if (G.Cooking) t *= G.Cooking.mul('fish');
    return clamp(t, 2.5, 48);
  }

  function xpFor(def, perfect) {
    var x = 6 + (def.diff || 1) * 5 + def.price / 14;
    return Math.round(x * (perfect ? 1.25 : 1));
  }

  /* ------------------------------------------------------------------ DOM */
  var root = UI.hud && UI.hud.root;
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  if (!root) { console.error('[fishing] UI.hud missing'); return; }

  var hud = el('div', 'tv-fishhud tv-card', root); hud.style.display = 'none';
  var hRow = el('div', 'row', hud), hRod = el('div', 'rod', hRow), hBait = el('button', 'tv-btn alt bait', hRow), hStand = el('button', 'tv-btn alt stand', hRow), hPull = el('button', 'tv-btn pull', hRow);
  var hMsg = el('div', 'msg', hud);
  var hMeter = el('div', 'meter', hud), bands = [el('div', 'band s', hMeter), el('div', 'band m', hMeter), el('div', 'band d', hMeter)], needle = el('div', 'needle', hMeter);
  hMeter.style.display = 'none';
  hPull.textContent = 'Thu cần'; hPull.setAttribute('aria-label', 'Thu cần'); hPull.style.display = 'none';
  hStand.textContent = 'Đứng dậy'; hStand.setAttribute('aria-label', 'Đứng dậy');

  var catcher = el('div', 'tv-fishcatch', root); catcher.style.display = 'none';
  var bang = el('div', 'tv-bang', root); bang.textContent = '!'; bang.style.display = 'none';
  var reel = el('div', 'tv-reel tv-card', root); reel.style.display = 'none';
  var rTrack = el('div', 'track', reel), rZone = el('div', 'zone', rTrack), rFish = el('div', 'fishico', rTrack);
  var rProg = el('div', 'prog', reel), rFill = el('div', 'fill', rProg), rHint = el('div', 'hint', reel);
  var resCard = el('div', 'tv-fishres tv-card', root); resCard.style.display = 'none';

  function setMsg(t) { hMsg.textContent = t; }
  function refreshHud() {
    if (F.state === 'off') { hud.style.display = 'none'; return; }
    hud.style.display = '';
    var r = bestRod();
    view.rodId = r ? r.id : null;
    hRod.innerHTML = r ? Icons.item(r.id, 34, r.tier) + '<span>' + Items.get(r.id).name + '</span>' : '<span>Chưa có cần</span>';
    var b = r ? currentBait(r) : null;
    if (r && r.info.bait) {
      hBait.style.display = '';
      hBait.innerHTML = b ? Icons.item(b, 26) + '<span>x' + Inv.count(b) + '</span>' : '<span>Hết mồi</span>';
    } else hBait.style.display = 'none';
  }
  hBait.addEventListener('click', function (ev) {
    ev.stopPropagation(); UI.sfx('tap');
    var r = bestRod(); if (!r || !r.info.bait) return;
    var opts = baitOptions(); opts.unshift(null);
    var i = opts.indexOf(F.baitId); F.baitId = opts[(i + 1) % opts.length];
    var n = F.baitId ? Items.get(F.baitId) : null;
    toast(n ? n.name + ': ' + n.tip : 'Chưa có mồi. Cá sẽ cắn chậm hơn.', 'star');
    refreshHud(); G.Save.request();
  });
  hStand.addEventListener('click', function () { UI.sfx('tap'); if (P.sitting) P.standUp(); else F.cancel(); });

  /* Stage 14A: Fishing.reelIn() - pull the line in from charge/cast/wait/bite/reel; no penalty, no escape count, bait refunded, stays seated. */
  var PULLABLE = { charge: 1, cast: 1, wait: 1, bite: 1, reel: 1 };
  F.reelIn = function () {
    if (!PULLABLE[F.state]) return false;
    if (usedBait) { Inv.add(usedBait, 1); usedBait = null; }
    btnDown = false; bang.style.display = 'none'; bob.visible = false; line.visible = false;
    toIdle('Đã thu cần. Thả lại khi bạn muốn!');
    UI.sfx('tap'); E.emit('fish:reeledIn', {});
    return true;
  };
  hPull.addEventListener('click', function (ev) { ev.stopPropagation(); F.reelIn(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && PULLABLE[F.state] && !UI.panelOpen && F.reelIn()) e.stopPropagation(); }, true);
  G.Loop.onFrame(function () { var show = !!PULLABLE[F.state], d = show ? '' : 'none'; if (hPull.style.display !== d) hPull.style.display = d; }, 21);

  /* ------------------------------------------------------------------ bobber (placeholder mesh) */
  var bob = new THREE.Group(); bob.visible = false;
  (function () {
    var m1 = new THREE.MeshBasicMaterial({ color: 0xf0675a }), m2 = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var a = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m1), b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m2);
    b.position.y = -0.09; bob.add(a); bob.add(b);
    G.Render.scene.add(bob);
  })();
  var lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x5b3a29 }));
  line.frustumCulled = false; line.visible = false; G.Render.scene.add(line);

  function rodTip(out) {
    var d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[P.facing] || [0, -1];
    out.x = P.pos.x + d[0] * 0.55; out.y = 0.85; out.z = P.pos.z + d[1] * 0.55; return out;
  }
  var tip = { x: 0, y: 0, z: 0 };
  function placeLine() {
    var p = lineGeo.attributes.position;
    rodTip(tip);
    p.setXYZ(0, tip.x, tip.y, tip.z); p.setXYZ(1, bob.position.x, bob.position.y, bob.position.z); p.needsUpdate = true;
  }
  G.Loop.onFrame(function (dt) {
    view.nib = (F.state === 'wait' && waitT < 3) ? 1 - waitT / 3 : 0;
    view.R = R; view.plan = plan; view.waitT = waitT; view.state = F.state; view.charge = charge; view.castK = clamp(castT / CAST_SEC, 0, 1);
    if (F.state === 'off' || !target) { bob.visible = false; line.visible = false; bang.style.display = 'none'; view.bobOn = false; return; }
    bobT += dt;
    var st = F.state;
    if (st === 'cast') {
      var k = clamp(castT / CAST_SEC, 0, 1);
      rodTip(tip);
      bob.position.set(tip.x + (target.x - tip.x) * k, tip.y + (0.02 - tip.y) * k + Math.sin(Math.PI * k) * 1.4, tip.z + (target.z - tip.z) * k);
      bob.visible = true;
    } else if (st === 'wait' || st === 'bite' || st === 'reel') {
      var dip = 0, sx = 0;
      if (st === 'wait' && view.nib > 0) dip = -0.03 * view.nib * Math.abs(Math.sin(bobT * 9));
      if (st === 'bite') dip = -0.08 * Math.abs(Math.sin(bobT * 20));
      else if (st === 'reel') { dip = -0.04 * Math.abs(Math.sin(bobT * 14)); sx = Math.sin(bobT * 9) * 0.08; }
      bob.position.set(target.x + sx, 0.02 + Math.sin(bobT * 3) * 0.015 + dip, target.z);
      bob.visible = true;
    } else if (st === 'charge' || st === 'idle' || st === 'result') { bob.visible = false; }
    line.visible = bob.visible;
    if (bob.visible) placeLine();
    view.bobOn = bob.visible;
    if (F.fx) { bob.visible = false; line.visible = false; }   // FishingFx draws the real bobber + line
    if (st === 'bite') {
      var sp = G.Render.worldToScreen(bob.position, tipScreen);
      bang.style.display = sp.visible ? '' : 'none';
      bang.style.transform = 'translate(' + Math.round(sp.x) + 'px,' + Math.round(sp.y - 56) + 'px) translate(-50%,-50%)';
    } else bang.style.display = 'none';
    if (st === 'reel') drawReel();
  }, 20);
  var tipScreen = { x: 0, y: 0, visible: true };
  // Read-only view for Stage 10 visuals (FishingFx): persistent object, refreshed every frame (priority 20).
  var view = F.view = { bobPos: bob.position, bobOn: false, R: null, plan: null, charge: 0, castK: 0, rodId: null, nib: 0 };

  /* ------------------------------------------------------------------ session */
  function lockTime() { if (!paused) { paused = true; T.pause('fishing'); } if (!locked) { locked = true; P.lock('fishing'); } }
  function unlockTime() { if (paused) { paused = false; T.resume('fishing'); } if (locked) { locked = false; P.unlock('fishing'); } }

  function showCatcher(on) { catcher.style.display = 'none'; }
  function toIdle(msg) {
    F.state = 'idle'; target = null; plan = null; R = null; held = false;
    showCatcher(false); reel.style.display = 'none'; hMeter.style.display = 'none'; unlockTime();
    setMsg(msg || 'Giữ nút vàng hoặc chạm giữ màn hình để lấy đà, thả ra để quăng câu.');
    refreshHud();
  }
  function start(seat) {
    F.seat = seat; F.state = 'idle'; bobT = 0;
    G.Input.suspend = true;
    toIdle();
    var r = bestRod();
    if (!r) setMsg('Bạn cần một cần câu trong túi đồ.');
    E.emit('fish:sat', { id: seat.id });
    if (!F.flags.h.sit) hint('sit', 'Cá cắn ở các độ sâu khác nhau. Ghế càng xa trên cầu tàu thì càng tới nước sâu.', 'star');
  }
  F.cancel = function () {
    if (F.state === 'off') return;
    F.state = 'off'; target = null; plan = null; R = null; held = false; btnDown = false;
    showCatcher(false); reel.style.display = 'none'; hMeter.style.display = 'none'; hud.style.display = 'none';
    resCard.style.display = 'none'; bang.style.display = 'none'; bob.visible = false; line.visible = false;
    unlockTime(); scrId = null; G.Input.suspend = false;
    F.seat = null;
    E.emit('fish:stopped', {});
  };

  E.on('interact:seat', function (e) {
    if (P.sitting || (G.Seat && G.Seat.busy()) || G.Scenes.current !== 'outdoor') return;
    var id = e && e.id, list = W.listInteractables('seat'), seat = null, i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) seat = list[i];
    if (!seat) return;
    var idx = parseInt(String(seat.id).replace('seat', ''), 10) || 1;
    var dz = seat.facing === 's' ? 1 : -1, maxD = 0;
    while (W.tileType(seat.tile.tx + 0.5, seat.tile.tz + dz * (maxD + 1) + 0.5) === 'water') maxD++;
    var info = { id: seat.id, tx: seat.tile.tx, tz: seat.tile.tz, idx: idx, dz: dz, maxD: Math.max(1, Math.min(maxD, 10)) };
    if (G.Seat && G.Seat.sit) {   // Stage 16 D3: walk, turn, sit-down clip, then the session starts
      G.Seat.sit({ tx: seat.tile.tx, tz: seat.tile.tz, facing: seat.facing, onSeated: function () { if (P.sitting && F.state === 'off') start(info); } });
      return;
    }
    P.sitAt(seat.tile.tx, seat.tile.tz); start(info);
  });
  E.on('player:stood', function () { F.cancel(); });
  E.on('scene:changed', function () { F.cancel(); });
  E.on('day:ended', function () { if (F.state !== 'off') { F.cancel(); if (P.sitting) P.standUp(); } });

  /* ------------------------------------------------------------------ input */
  var LAND_GRACE = 0.6, BITE_BASE = 1.8, landT = 0, scrId = null;
  function canAct() { return F.state !== 'off'; }
  function onDown() {
    if (!canAct()) return;
    var st = F.state;
    if (st === 'idle') startCharge();
    else if (st === 'bite') hook();
    else if (st === 'wait') { if (landT < LAND_GRACE) return; toIdle('Kéo dây lên rồi. Thả lại nào!'); UI.sfx('tap'); }   // reel in early: no penalty, no escape count
    else if (st === 'reel') held = true;
  }
  function onUp() {
    held = false;
    if (F.state === 'charge') release();
  }
  function isHudTarget(t) {
    return !!(t && t.closest && t.closest('button, .tv-btn, .tv-slot, #tv-hotbar, .tv-card, #tv-layer, .tv-fishhud'));
  }
  UI.hud.action.addEventListener('pointerdown', function () { btnDown = true; onDown(); });
  window.addEventListener('pointerup', function (ev) {
    if (btnDown) { btnDown = false; onUp(); }
    if (scrId !== null && ev.pointerId === scrId) { scrId = null; onUp(); }
  });
  window.addEventListener('pointercancel', function (ev) {
    if (btnDown) { btnDown = false; onUp(); }
    if (scrId !== null && ev.pointerId === scrId) { scrId = null; onUp(); }
  });
  // Whole-screen tap/hold while fishing (capture phase so nothing upstream can swallow it).
  window.addEventListener('pointerdown', function (ev) {
    if (F.state === 'off' || scrId !== null) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (isHudTarget(ev.target) || (UI.hud.action && UI.hud.action.contains(ev.target))) return;
    scrId = ev.pointerId; onDown();
  }, true);
  window.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && F.state !== 'off') { e.preventDefault(); onDown(); } });
  window.addEventListener('keyup', function (e) { if ((e.key === ' ' || e.key === 'Enter') && F.state !== 'off') onUp(); });

  E.on('input:tap', function (e) {
    if (true) return;
    var tile = G.Render.screenToTile(e.x, e.y, 0);
    if (!tile || W.tileType(tile.tx + 0.5, tile.tz + 0.5) !== 'water') return;
    var d = F.seat.dz * (tile.tz - F.seat.tz);
    if (d < 1) return;
    var f = F.seat.maxD > 1 ? clamp((d - 1) / (F.seat.maxD - 1), 0, 1) : 0;
    doCast(f, clamp(tile.tx - F.seat.tx, -2, 2));
  });

  function startCharge() {
    var r = bestRod();
    if (!r) { toast('Bạn cần một cần câu. Xem lại túi đồ nhé.', 'bag'); return; }
    if (!S.canWork()) { E.emit('state:exhausted', {}); return; }
    F.state = 'charge'; chargeT = 0; charge = 0; held = true;
    hMeter.style.display = '';
    layoutBands();
    setMsg('Thả ra để quăng câu!');
  }
  function layoutBands() {
    var sh = seatShift(F.seat.idx), b1 = clamp((0.34 - sh) / 0.7, 0, 1), b2 = clamp((0.67 - sh) / 0.7, 0, 1);
    bands[0].style.width = (b1 * 100) + '%'; bands[1].style.width = ((b2 - b1) * 100) + '%'; bands[2].style.width = ((1 - b2) * 100) + '%';
  }
  function release() {
    hMeter.style.display = 'none';
    doCast(Math.max(0.03, charge), 0);
  }

  function doCast(f, lateral) {
    var r = bestRod();
    if (!r) { toIdle(); return; }
    if (!S.useEnergy(Items.energyCost(r.id, r.tier) || 2)) { toIdle(); return; }
    rod = r;
    var v = clamp(f * 0.7 + seatShift(F.seat.idx), 0, 1), zone = F.zoneFor(v), sk = F.seat;
    var dist = Math.max(1, Math.round(1 + f * (sk.maxD - 1)));
    var tx = sk.tx + (lateral || 0), tz = sk.tz + sk.dz * dist;
    if (W.tileType(tx + 0.5, tz + 0.5) !== 'water') tx = sk.tx;
    target = { x: tx + 0.5, y: 0.02, z: tz + 0.5, zone: zone, v: v };
    var b = currentBait(r), hasBait = false;
    if (b && Inv.remove(b, 1)) { hasBait = true; usedBait = b; } else usedBait = null;
    waitT = waitSeconds(hasBait);
    var li = G.FishLife ? G.FishLife.probe(target.x, target.z) : { hot: -1, near: false, species: [] }, po;
    if (li.hot >= 0) po = { hot: true, prefer: li.species, junk: 0.03 };
    else if (li.near) po = { junk: 0.2 };
    else po = { junk: 0.7, plain: true };
    if (li.hot >= 0) waitT *= 0.7;
    view.waitTot = waitT;
    plan = F.pickCatch(zone, hasBait ? b : null, waitK, po);
    plan.k = waitK;
    plan.lose = plan.kind === 'fish' && (li.hot >= 0 ? wr('fish.lose') < 0.15 : li.near ? wr('fish.lose') < 0.4 : false);
    plan.hot = li.hot >= 0; plan.seen = li.hot >= 0 || li.near;
    castT = 0; F.state = 'cast'; F.totals.casts++;
    P.playAction('cast', { duration: CAST_SEC });
    UI.sfx('cast'); setMsg(ZONE_NAME[zone] + '. Đang chờ cá cắn...');
    E.emit('fish:cast', { zone: zone, v: v, bait: usedBait });
    hint('wait', 'Kiên nhẫn đợi lâu, cá càng ngon!', 'star');
    if (T.weather === 'rain') hint('rain', 'Mưa khuấy nước nên cá nổi lên kiếm ăn và cắn câu sớm hơn.');
    else if (T.season === 'winter') hint('cold', 'Nước lạnh làm cá chậm lại. Chờ lâu hơn, nhưng có loài lại mê cái lạnh.');
    else if (T.hour >= 20) hint('night', 'Câu đêm nè! Cá trê, lươn và cá tinca thức dậy khi trời tối.');
    else if (T.hour < 8.5 || (T.hour >= 18 && T.hour < 20.5)) hint('dawn', 'Bình minh và hoàng hôn là giờ vàng: nhiều loài cá kiếm ăn khi ánh sáng yếu.');
    refreshHud();
    G.Save.request();
  }

  function hook() {
    if (F.state !== 'bite') return;
    UI.sfx('hook');
    startReel();
  }

  /* ------------------------------------------------------------------ reel minigame */
  function startReel() {
    var def = plan.def, isJunk = plan.kind === 'junk', diff = isJunk ? 1 : def.diff;
    F.state = 'reel'; held = btnDown || scrId !== null || held;
    var bh = rod.info.bar;
    R = {
      def: def, junk: isJunk, diff: diff, beh: isJunk ? 'smooth' : def.beh, bh: bh,
      bp: 0.1, bv: 0, fp: 0.5, ft: 0.5, tt: 0, mode: 'smooth', mt: 0, prog: 0.3, out: 0, time: 0, jump: 0
    };
    lockTime(); showCatcher(true);
    reel.style.display = '';
    rFish.innerHTML = Icons.item(def.id ? Items.get(def.id) : def, 36);
    rZone.style.height = '0px';
    rHint.textContent = 'Giữ để lên, thả ra để xuống';
    setMsg('Giữ cá trong thanh xanh nhé!');
    hMeter.style.display = 'none';
  }
  function pickTarget(r) {
    var b = r.mode;
    if (b === 'sinker') return Math.random() < 0.3 ? 0.04 : Math.pow(Math.random(), 2) * 0.7;
    if (b === 'floater') return Math.random() < 0.3 ? 0.96 : 1 - Math.pow(Math.random(), 2) * 0.7;
    return Math.random();
  }
  function stepReel(dt) {
    var r = R, sp = 0.22 + 0.1 * r.diff, rate;
    r.time += dt;
    if (r.beh === 'mixed') { r.mt -= dt; if (r.mt <= 0) { r.mode = Math.random() < 0.5 ? 'smooth' : 'dart'; r.mt = rnd(2, 4); } }
    else r.mode = r.beh;
    r.tt -= dt;
    if (r.tt <= 0) {
      r.ft = pickTarget(r);
      r.tt = r.mode === 'dart' ? rnd(0.35, 0.9) : r.mode === 'smooth' ? rnd(1.1, 2.2) : rnd(0.8, 1.6);
    }
    var mv = r.mode === 'dart' ? sp * 2.4 : r.mode === 'sinker' || r.mode === 'floater' ? sp * 1.3 : sp;
    var dd = r.ft - r.fp, step = mv * dt;
    r.fp += Math.abs(dd) <= step ? dd : (dd > 0 ? step : -step);
    r.fp = clamp(r.fp, 0.03, 0.97);
    // bar physics: hold = rise, release = fall
    r.bv += (held ? 2.9 : -2.3) * dt;
    r.bv = clamp(r.bv * (1 - 1.2 * dt), -1.4, 1.2);
    r.bp += r.bv * dt;
    if (r.bp < 0) { r.bp = 0; r.bv = r.bv < -0.4 ? -r.bv * 0.3 : 0; }
    if (r.bp > 1 - r.bh) { r.bp = 1 - r.bh; r.bv = 0; }
    var inside = r.fp >= r.bp - 0.02 && r.fp <= r.bp + r.bh + 0.02;
    if (inside) { rate = 0.22 - 0.012 * r.diff; r.prog += rate * dt; }
    else { rate = 0.12 + 0.02 * r.diff; r.prog -= rate * dt; r.out += dt; }
    r.inside = inside;
    r.prog = Math.min(1, r.prog);
    if (r.prog >= 1) endReel(true);
    else if (r.prog <= 0 || r.time > 60) endReel(false);
  }
  var trackH = 0;
  function drawReel() {
    if (!R) return;
    trackH = rTrack.clientHeight || trackH || 300;
    var H = trackH, bh = R.bh * H, y = (1 - R.bp - R.bh) * H;
    rZone.style.height = bh + 'px';
    rZone.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
    rZone.className = 'zone' + (R.inside ? ' on' : '');
    rFish.style.transform = 'translateY(' + ((1 - R.fp) * (H - 36)).toFixed(1) + 'px)';
    rFill.style.transform = 'scaleY(' + clamp(R.prog, 0, 1).toFixed(3) + ')';
  }

  function endReel(ok) {
    var r = R, def = plan.def, perfect = r.out < 0.5;
    R = null; showCatcher(false); reel.style.display = 'none'; held = false;
    unlockTime();
    if (!ok) {
      F.totals.escapes++;
      toast(plan.kind === 'junk' ? 'Nó tuột khỏi lưỡi câu mất rồi.' : 'Cá chạy mất rồi! Thử lại nhé.', 'warn');
      E.emit('fish:escaped', { id: def.id, reason: 'reel' });
      toIdle('Cá chạy mất rồi. Thả lại nào!');
      return;
    }
    if (plan.kind === 'junk') return finishJunk(def);
    finishFish(def, perfect);
  }
  function finishJunk(def) {
    F.totals.junk++;
    if (!Inv.canAdd(def.id, 1, 'normal')) { toast('Túi đồ đầy! Bạn thả ' + def.name + ' đi.', 'bag'); toIdle(); return; }
    Inv.add(def.id, 1, 'normal');
    S.addXp('fishing', 1);
    E.emit('fish:junk', { id: def.id });
    showResult(def, 'normal', null, false, false, 'Đồ bỏ đi');
    if (def.id === 'plastic_bag') toast(def.tip, 'star');
    G.Save.request();
  }
  function finishFish(def, perfect) {
    var lvl = S.level('fishing'), q = F.qualityFor(lvl, perfect, plan && plan.k);
    if (!Inv.canAdd(def.id, 1, q)) { toast('Túi đồ đầy! ' + def.name + ' bơi mất rồi.', 'bag'); toIdle(); return; }
    var size = Math.round((12 + 3.2 * Math.sqrt(def.price)) * rnd(0.75, 1.25) * (0.85 + 0.35 * (plan && plan.k || 0)));
    Inv.add(def.id, 1, q);
    var rec = F.records[def.id], first = !rec, best = false;
    if (!rec) rec = F.records[def.id] = { n: 0, max: 0, q: 0 };
    rec.n++; if (size > rec.max) { rec.max = size; best = !first; }
    rec.q = Math.max(rec.q, Items.QUALITIES.indexOf(q));
    F.totals.catches++; if (perfect) F.totals.perfect++;
    S.addXp('fishing', xpFor(def, perfect));
    buzz(20);
    E.emit('fish:caught', { id: def.id, n: 1, q: q, first: first, size: size, perfect: perfect, by: G.Net.playerId });
    var it = Items.get(def.id);
    if (first && it) toast('Loài cá mới! ' + it.tip, 'notebook');
    showResult(def, q, size, first, best, perfect ? 'Hoàn hảo!' : '');
    G.Save.request();
  }

  function showResult(def, q, size, first, best, tag) {
    F.state = 'result'; resT = 1.8; target = null;
    var it = Items.get(def.id) || def;
    resCard.innerHTML = '<div class="ic">' + Icons.item(it, 64) + '</div><div class="nm">' + it.name + '</div>' +
      '<div class="sub">' + (size ? size + ' cm' : '') + (q !== 'normal' ? ' ' + (q === 'gold' ? 'vàng' : 'bạc') : '') + '</div>' +
      (first ? '<div class="tag">Mới!</div>' : best ? '<div class="tag">Kỷ lục kích cỡ!</div>' : tag ? '<div class="tag">' + tag + '</div>' : '');
    resCard.style.display = '';
    resCard.classList.remove('pop'); void resCard.offsetWidth; resCard.classList.add('pop');
    setMsg('Tuyệt! Quăng câu lại khi bạn muốn.');
  }

  /* ------------------------------------------------------------------ simulation */
  G.Loop.onUpdate(function (dt) {
    var st = F.state;
    if (st === 'off') return;
    if (st === 'charge') {
      chargeT += dt;
      var ph = (chargeT / CHARGE_SEC) % 2;
      charge = ph < 1 ? ph : 2 - ph;
      needle.style.left = (charge * 100).toFixed(1) + '%';
      if (!held && !btnDown && scrId === null) release();   // safety: release missed
    } else if (st === 'cast') {
      castT += dt;
      if (castT >= CAST_SEC) { F.state = 'wait'; landT = 0; UI.sfx('plop'); }
    } else if (st === 'wait') {
      waitT -= dt; landT += dt;
      if (waitT <= 0 && plan.lose) {
        E.emit('fish:lost', { id: plan.def.id });
        toIdle('Cá chê mồi rồi bơi đi. Thả lại nào!');
      } else if (waitT <= 0) {
        F.state = 'bite'; biteT = 0; biteWin = BITE_BASE + rod.info.win;
        setMsg('Cá cắn câu! Chạm ngay!');
        buzz([40, 30, 60]); UI.sfx('bite');
        E.emit('fish:bite', { id: plan.def.id });
      }
    } else if (st === 'bite') {
      biteT += dt;
      if (biteT >= biteWin) {
        F.totals.escapes++;
        toast('Chậm quá, cá chạy mất rồi!', 'warn');
        E.emit('fish:escaped', { id: plan.def.id, reason: 'slow' });
        toIdle('Cá chạy mất rồi. Thả lại nào!');
      }
    } else if (st === 'reel') {
      stepReel(dt);
    } else if (st === 'result') {
      resT -= dt;
      if (resT <= 0) { resCard.style.display = 'none'; toIdle(); }
    }
  }, 5);

  /* ------------------------------------------------------------------ save */
  F.stats = function () { return { records: F.records, totals: F.totals }; };
  G.Save.register('fishing', {
    save: function () { return { records: F.records, totals: F.totals, flags: F.flags, bait: F.baitId }; },
    load: function (o) {
      o = o || {};
      F.cancel();
      F.records = o.records || {}; F.flags = o.flags || { h: {} }; if (!F.flags.h) F.flags.h = {};
      F.totals = o.totals || { casts: 0, catches: 0, junk: 0, escapes: 0, perfect: 0 };
      F.baitId = o.bait && Items.get(o.bait) ? o.bait : null;
    },
    reset: function () {
      F.cancel();
      F.records = {}; F.flags = { h: {} }; F.totals = { casts: 0, catches: 0, junk: 0, escapes: 0, perfect: 0 }; F.baitId = null;
    }
  }, 'player');
})();
