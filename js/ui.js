/* Togie Valley - ui.js (Stage 3): Game.UI kit + HUD. Depends on: core, input, player, items, state, time, save. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.State || !G.Inventory || !G.Time || !G.Player || !G.Items || !G.Icons) { console.error('[ui] dependencies missing (icons.js must load before ui.js)'); return; }
  var E = G.Events, Icons = G.Icons, root = document.getElementById('ui');
  if (!root) { console.error('[ui] #ui missing'); return; }

  function el(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  function press(btn, fn) { // squash + haptic + click
    btn.addEventListener('click', function (ev) { buzz(); UI.sfx('tap'); fn(ev); });
  }

  var layer = el('div', null, root); layer.id = 'tv-layer';
  var hud = el('div', null, root); hud.id = 'tv-hud';
  var toastBox = el('div', null, layer); toastBox.id = 'tv-toasts';

  var UI = G.UI = { hud: {}, panelOpen: false };

  /* ---------------------------------------------------------- sfx hook */
  UI.sfx = function (name) { E.emit('ui:sfx', { name: name }); };

  /* ---------------------------------------------------------- toasts */
  var toastQ = [], toastBusy = false;
  UI.toast = function (msg, icon) { toastQ.push({ msg: msg, icon: icon }); UI.sfx('toast'); if (!toastBusy) nextToast(); };
  function nextToast() {
    var t = toastQ.shift();
    if (!t) { toastBusy = false; return; }
    toastBusy = true;
    var d = el('div', 'tv-card tv-toast', toastBox, (t.icon && Icons.has(t.icon) ? '<span class="ico">' + Icons.ui(t.icon, 22) + '</span>' : '') + '<span class="msg">' + esc(t.msg) + '</span>');
    setTimeout(function () { d.classList.add('out'); }, 2200);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2500);
    setTimeout(nextToast, 450);
  }

  /* ---------------------------------------------------------- panel / modal stack */
  var stack = [];
  function syncModal() {
    var open = stack.length > 0;
    if (open === UI.panelOpen) return;
    UI.panelOpen = open;
    if (open) { G.Time.pause('ui'); G.Player.lock('ui'); }
    else { G.Time.resume('ui'); G.Player.unlock('ui'); }
    hud.style.visibility = ''; // HUD stays visible under panels
    E.emit(open ? 'ui:opened' : 'ui:closed', {});
  }
  function pushLayer(node, opts) {
    opts = opts || {};
    var scrim = el('div', 'tv-scrim', layer);
    if (opts.bottom) scrim.style.alignItems = 'flex-end';
    scrim.appendChild(node);
    var entry = { scrim: scrim, node: node, onClose: opts.onClose, dismiss: opts.dismiss !== false };
    scrim.addEventListener('pointerdown', function (ev) { if (ev.target === scrim && entry.dismiss) UI.closePanel(); });
    stack.push(entry);
    syncModal();
    UI.sfx('pop');
    return entry;
  }
  /* openPanel(el|id, opts): shows a node (or element id) inside a paper card. Returns the panel element. */
  UI.openPanel = function (target, opts) {
    var node = typeof target === 'string' ? document.getElementById(target) : target;
    if (!node) { console.error('[ui] openPanel: target not found'); return null; }
    node.classList.add('tv-card', 'tv-panel');
    pushLayer(node, opts);
    return node;
  };
  UI.closePanel = function () {
    var e = stack.pop();
    if (!e) return false;
    if (e.scrim.parentNode) e.scrim.parentNode.removeChild(e.scrim);
    syncModal();
    if (e.onClose) try { e.onClose(); } catch (err) { console.error(err); }
    return true;
  };
  UI.closeAll = function () { while (UI.closePanel()) {} };

  /* ---------------------------------------------------------- dialog (NPC box, typewriter) */
  var dlg = null;
  /* dialog({name, lines:[str]|text, speed (ms/char), onDone}) */
  UI.dialog = function (opts) {
    opts = opts || {};
    var lines = opts.lines || (opts.text ? [opts.text] : []);
    if (!lines.length) return;
    if (dlg) closeDialog(true);
    var box = el('div', 'tv-card tv-dialog', layer);
    if (opts.name) el('div', 'name', box, esc(opts.name));
    var scr = el('div', 'tv-dialog-scroll', box), txt = el('div', 'text', scr), more = el('div', 'more', box, Icons.ui('arrow-down', 20));
    var i = 0, pos = 0, timer = null, speed = opts.speed || 28, full = '';
    function start() {
      full = String(lines[i]); pos = 0; txt.textContent = ''; more.style.visibility = 'hidden';
      clearInterval(timer);
      timer = setInterval(function () {
        pos++; txt.textContent = full.slice(0, pos); scr.scrollTop = scr.scrollHeight;
        E.emit('dialog:char', { voice: opts.voice || opts.name, text: full, pos: pos });
        if (pos >= full.length) { clearInterval(timer); timer = null; more.style.visibility = 'visible'; }
      }, speed);
    }
    function advance() {
      if (timer) { clearInterval(timer); timer = null; txt.textContent = full; more.style.visibility = 'visible'; return; }
      i++;
      if (i >= lines.length) closeDialog(false); else { start(); UI.sfx('tap'); }
    }
    function closeDialog(silent) {
      clearInterval(timer);
      if (box.parentNode) box.parentNode.removeChild(box);
      var d = dlg; dlg = null; E.emit('dialog:close', {});
      G.Time.resume('dialog'); G.Player.unlock('dialog');
      if (!silent && d && d.onDone) d.onDone();
    }
    box.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); advance(); });
    dlg = { close: closeDialog, onDone: opts.onDone };
    G.Time.pause('dialog'); G.Player.lock('dialog');
    E.emit('dialog:open', { voice: opts.voice || opts.name });
    start();
    return dlg;
  };

  /* confirm({title, text, yes, no}, cb(bool)) */
  UI.confirm = function (opts, cb) {
    opts = opts || {};
    var p = el('div', 'tv-card tv-panel tv-confirm');
    el(p.nodeType ? 'h2' : 'h2', null, p, esc(opts.title || 'Bạn chắc chứ?'));
    if (opts.text) el('div', null, p, esc(opts.text));
    var row = el('div', 'tv-row', p), done = false;
    var no = el('button', 'tv-btn alt', row, esc(opts.no || 'Hủy')), yes = el('button', 'tv-btn', row, esc(opts.yes || 'Đồng ý'));
    function fin(v) { if (done) return; done = true; UI.closePanel(); if (cb) cb(v); }
    press(no, function () { fin(false); }); press(yes, function () { fin(true); });
    pushLayer(p, { dismiss: false });
  };

  /* ---------------------------------------------------------- HUD */
  var clock = el('div', 'tv-card tv-hud-chip', hud); clock.id = 'tv-clock';
  var wx = el('div', null, clock); wx.id = 'tv-wx';
  var ct = el('div', null, clock);
  var tEl = el('div', 'time', ct), dEl = el('div', 'sub', ct);
  var right = el('div', null, hud); right.id = 'tv-right';
  var moneyEl = el('div', 'tv-card tv-hud-chip', right); moneyEl.id = 'tv-money';
  var enEl = el('div', 'tv-card tv-hud-chip', right); enEl.id = 'tv-energy';
  el('span', 'ico', enEl, Icons.ui('energy', 22));
  var enBar = el('div', 'bar', enEl), enFill = el('div', 'fill', enBar), enNum = el('b', 'num', enEl);
  var menuBtn = el('button', 'tv-btn alt', hud, Icons.ui('menu', 30)); menuBtn.id = 'tv-menu'; menuBtn.setAttribute('aria-label', 'Danh mục');
  var rot = el('div', null, hud); rot.id = 'tv-rot';
  var rotL = el('button', 'tv-btn alt', rot, Icons.ui('rotate-left', 30)), rotR = el('button', 'tv-btn alt', rot, Icons.ui('rotate-right', 30));
  var action = el('button', null, hud, '<span class="ico"></span><span class="lbl"></span>'); action.className = 'tone-use no-target'; action.id = 'tv-action'; action.setAttribute('aria-label', 'Hành động');
  var hotbar = el('div', 'tv-card', hud); hotbar.id = 'tv-hotbar';
  UI.hud = { root: hud, clock: clock, money: moneyEl, energy: enEl, hotbar: hotbar, action: action, menu: menuBtn, rotL: rotL, rotR: rotR };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function updClock() {
    var T = G.Time;
    tEl.textContent = T.clock();
    dEl.innerHTML = Icons.ui(T.season, 16) + ' ' + esc(G.VI.season[T.season] + ' · Ngày ' + T.dayOfSeason() + ' · Năm ' + T.year());
    wx.innerHTML = Icons.ui(T.weather === 'rain' || T.weather === 'snow' ? T.weather : 'sun', 30);
  }

  /* money count-up */
  var shown = G.State.money, target = shown, raf = 0;
  function renderMoney() { moneyEl.innerHTML = Icons.ui('coin', 24) + ' ' + Math.round(shown) + ' g'; }
  function tickMoney() {
    raf = 0;
    var d = target - shown;
    if (Math.abs(d) < 1) shown = target; else shown += d * 0.18 + (d > 0 ? 0.5 : -0.5);
    renderMoney();
    if (shown !== target) raf = requestAnimationFrame(tickMoney);
  }
  function setMoney(v, instant) {
    var changed = v !== target;
    target = v;
    if (instant) { shown = v; renderMoney(); }
    else {
      if (changed) { moneyEl.classList.remove('pop'); void moneyEl.offsetWidth; moneyEl.classList.add('pop'); }
      if (!raf) raf = requestAnimationFrame(tickMoney);
    }
  }
  function updEnergy() {
    var S = G.State, pct = Math.max(0, Math.min(100, S.energy / S.maxEnergy * 100));
    enFill.style.transform = 'scaleX(' + (pct / 100) + ')';
    enNum.textContent = Math.round(S.energy) + '/' + S.maxEnergy;
    enEl.classList.toggle('low', pct <= 20);
  }

  /* hotbar */
  var slotEls = [], prevId = [], prevN = [];
  for (var s = 0; s < G.Inventory.HOTBAR; s++) (function (i) {
    var b = el('button', 'tv-slot', hotbar); b.setAttribute('aria-label', 'Ô ' + (i + 1));
    b.addEventListener('click', function () {
      buzz(); UI.sfx('tap');
      if (G.Inventory.selectedIndex() === i) {
        var it = G.Inventory.selected(); // tap selected slot twice = use (food etc.)
        if (it) E.emit('ui:slotUse', { index: i, id: it.id });
      } else G.Inventory.select(i);
    });
    slotEls.push(b);
  })(s);
  /* last hotbar cell: opens the backpack in one tap (not an item slot, not part of the 6 data columns) */
  var moreSlot = el('button', 'tv-slot tv-slot-more', hotbar, Icons.ui('dots', 36));
  moreSlot.setAttribute('aria-label', 'Ba lô'); moreSlot.title = 'Ba lô (I)';
  moreSlot.addEventListener('click', function () { buzz(); UI.sfx('tap'); E.emit('ui:backpack', {}); });
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    if (e.key === 'i' || e.key === 'I' || e.key === 'b' || e.key === 'B') E.emit('ui:backpack', {});
  });
  function updHotbar() {
    var inv = G.Inventory, sel = inv.selectedIndex();
    for (var i = 0; i < slotEls.length; i++) {
      var b = slotEls[i], slot = inv.get(i), def = slot && G.Items.get(slot.id);
      var had = prevId[i] !== undefined;
      var arrived = had && slot && (prevId[i] !== slot.id || slot.n > prevN[i]);
      var cntPop = had && slot && slot.n > 1 && prevId[i] === slot.id && slot.n !== prevN[i];
      prevId[i] = slot ? slot.id : null; prevN[i] = slot ? slot.n : 0;
      b.className = 'tv-slot' + (def ? ' cat-' + def.cat : '') + (i === sel ? ' sel' : '') + (arrived ? ' bump' : '');
      b.dataset.tier = slot && slot.tier ? slot.tier : 0;
      b.innerHTML = '<span class="key">' + (i + 1) + '</span>' + (def ? Icons.item(def, 40, slot.tier) : '') +
        (slot && slot.n > 1 ? '<span class="cnt' + (cntPop ? ' pop' : '') + '">' + slot.n + '</span>' : '');
      b.title = def ? def.name : '';
    }
  }


  /* ---------------------------------------------------------- contextual action button (Stage 10.5)
   * UI.setActionHint({icon,label,tone,target}) : icon = key of UI.actionIcons | item id | Icons.ui name (default 'hand' mitten);
   * label = tiny Vietnamese text; tone 'farm'|'fish'|'use'; target false dims the button. UI.setActionHint(null) clears the hint.
   * A hint is kept for 600 ms unless refreshed; with no hint the button falls back to the selected item. */
  UI.actionIcons = UI.actionIcons || {};
  var actIco = action.querySelector('.ico'), actLbl = action.querySelector('.lbl'), actKey = '', actAt = -1e9;
  var CAT_HINT = { fertilizer: ['bag', 'Bón', 'farm'], seed: [null, 'Gieo', 'farm'], food: [null, 'Ăn', 'use'], crop: [null, 'Ăn', 'use'], fish: [null, 'Ăn', 'use'], bait: [null, 'Mồi', 'fish'] };
  var ITEM_HINT = { hoe: ['Cuốc', 'farm'], watering_can: ['Tưới', 'farm'], bamboo_pole: ['Câu', 'fish'], fiber_rod: ['Câu', 'fish'], carbon_rod: ['Câu', 'fish'], master_rod: ['Câu', 'fish'] };
  function iconHtml(icon) {
    if (UI.actionIcons[icon]) return UI.actionIcons[icon];
    if (G.Items.get(icon)) return Icons.item(icon, 44);
    return UI.actionIcons.hand || Icons.ui('hand', 44);
  }
  function paintAction(icon, label, tone, target) {
    var key = icon + '|' + label + '|' + tone + '|' + (target ? 1 : 0);
    if (key === actKey) return;
    var swap = actKey.split('|').slice(0, 2).join('|') !== key.split('|').slice(0, 2).join('|');
    actKey = key;
    actIco.innerHTML = iconHtml(icon); actLbl.textContent = label || '';
    action.className = 'tone-' + (tone || 'use') + (target ? ' has-target' : ' no-target');
    action.setAttribute('aria-label', label || 'Hành động');
    if (swap) { action.classList.add('swap'); setTimeout(function () { action.classList.remove('swap'); }, 240); }
  }
  UI.setActionHint = function (h) {
    if (!h) { actAt = -1e9; return; }
    actAt = performance.now();
    paintAction(h.icon || 'hand', h.label || '', h.tone || 'use', h.target !== false);
  };
  function actionFallback() {
    var s = G.Inventory.selected(), d = s && G.Items.get(s.id), x;
    if (!d) return paintAction('hand', 'Dùng', 'use', false);
    x = ITEM_HINT[d.id];
    if (x) return paintAction(d.id, x[0], x[1], false);
    x = CAT_HINT[d.cat];
    if (x) return paintAction(x[0] || d.id, x[1], x[2], false);
    paintAction(d.id, 'Dùng', 'use', false);
  }
  setInterval(function () { if (performance.now() - actAt > 600) actionFallback(); }, 150);
  actionFallback();

  /* action button: hold repeats */
  var holdT = 0, repT = 0;
  function fire() { E.emit('input:action', { source: 'button' }); }
  function stopHold() { clearTimeout(holdT); clearInterval(repT); holdT = repT = 0; action.classList.remove('down'); }
  action.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); ev.stopPropagation();
    try { action.setPointerCapture(ev.pointerId); } catch (e) {}
    action.classList.add('down'); buzz(); fire();
    holdT = setTimeout(function () { repT = setInterval(fire, 260); }, 350);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { action.addEventListener(n, stopHold); });
  action.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  press(rotL, function () { G.Camera.rotateStep(-1); });
  press(rotR, function () { G.Camera.rotateStep(1); });
  press(menuBtn, function () { E.emit('ui:menu', {}); });

  /* ---------------------------------------------------------- wiring */
  E.on('time:minuteStep', updClock); E.on('time:hourChanged', updClock); E.on('time:set', updClock);
  E.on('day:started', updClock); E.on('season:changed', updClock);
  E.on('state:changed', function (p) {
    if (!p || p.key === 'money' || p.key === 'all') setMoney(G.State.money, p && p.key === 'all');
    if (!p || p.key === 'energy' || p.key === 'all') updEnergy();
  });
  E.on('inventory:changed', updHotbar);
  E.on('save:loaded', refresh); E.on('save:reset', refresh);
  E.on('state:exhausted', function () { UI.toast('Mệt quá! Ăn chút gì để lấy lại sức nhé.', 'energy'); });
  E.on('skill:levelUp', function (p) { UI.toast((p.skill === 'farming' ? 'Làm nông' : 'Câu cá') + ' lên cấp ' + p.level + '!', 'star'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') UI.closePanel(); });

  function refresh() { prevId.length = 0; prevN.length = 0; updClock(); setMoney(G.State.money, true); updEnergy(); updHotbar(); }
  refresh();
})();
