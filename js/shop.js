/* Togie Valley - shop.js (Stage 8): shop, workshop, fish stall, shipping bin + fish crate, payout, eating, NPC lines.
 * Game.Economy: bin, crate (Containers), pending (tool upgrades), value(container), eat(). Save section 'economy'.
 * Depends on: data_shop.js, ui.js, panels.js, house.js (summary lines, optional), farm.js (optional)
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.ShopData || !G.UI || !G.Inventory || !G.State || !G.Save || !G.Day || !G.Icons || !G.World || !G.Interact || !G.Player) { console.error('[shop] dependency missing'); return; }
  var E = G.Events, UI = G.UI, Items = G.Items, Inv = G.Inventory, S = G.State, Icons = G.Icons, D = G.ShopData, T = G.Time, P = G.Player;
  var Eco = G.Economy = { bin: G.Containers.create(24), crate: G.Containers.create(12), pending: [], tipIdx: 0 };

  function el(tag, cls, parent, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function line(text, icon) { if (G.House && G.House.addSummaryLine) G.House.addSummaryLine(text, icon); }
  function btn(label, parent, fn, cls) {
    var b = el('button', 'tv-btn' + (cls ? ' ' + cls : ''), parent, label);
    b.addEventListener('click', function () { UI.sfx('tap'); fn(b); });
    return b;
  }
  var COIN = Icons.ui('coin', 18);

  /* ------------------------------------------------------------- payout (bin + crate) */
  Eco.value = function (c) {
    var t = 0;
    for (var i = 0; i < c.size; i++) { var s = c.get(i); if (s) t += Items.price(s.id, s.q) * s.n; }
    return t;
  };
  function payout(c, label) {
    var groups = {}, order = [], total = 0, i, s;
    for (i = 0; i < c.size; i++) {
      s = c.get(i); if (!s) continue;
      var v = Items.price(s.id, s.q) * s.n;
      if (!groups[s.id]) { groups[s.id] = { n: 0, v: 0 }; order.push(s.id); }
      groups[s.id].n += s.n; groups[s.id].v += v; total += v;
    }
    if (!order.length) return;
    order.slice(0, 4).forEach(function (id) { line(Items.get(id).name + ' x' + groups[id].n + ': +' + groups[id].v + 'g', 'coin'); });
    if (order.length > 4) line('...và ' + (order.length - 4) + ' loại khác', 'box');
    line(label + ': +' + total + 'g', 'coin');
    S.addMoney(total); c.clear();
  }
  G.Day.onEnd(20, function () { payout(Eco.bin, 'Thùng bán đồ'); payout(Eco.crate, 'Thùng cá'); });

  /* ------------------------------------------------------------- workshop deliveries */
  function deliver(announce) {
    var keep = [], any = false;
    Eco.pending.forEach(function (p) {
      var d = Items.get(p.id);
      if (p.ready <= T.day && d && Inv.canAdd(p.id, 1, 'normal', p.tier)) {
        Inv.add(p.id, 1, 'normal', p.tier); any = true;
        if (announce) line('Xưởng: ' + d.name + ' của bạn đã xong (' + Items.TIERS[p.tier] + ')!', 'gear');
        else UI.toast('Đã nhận ' + d.name + ' (' + Items.TIERS[p.tier] + ')', 'gear');
      } else keep.push(p);
    });
    var waiting = keep.some(function (p) { return p.ready <= T.day; });
    if (announce && waiting) line('A tool is waiting at the workshop (backpack full).', 'box');
    Eco.pending = keep;
    return any;
  }
  G.Day.onStart(20, function () { deliver(true); });

  /* ------------------------------------------------------------- eating */
  var eating = false;
  function edible(d) { return d && (d.cat === 'food' || d.cat === 'crop' || d.cat === 'fish'); }
  function gain(d) { return d.energy || Math.min(30, Math.max(5, Math.round(d.price * 0.15))); }
  Eco.eat = function () {
    var s = Inv.selected(), d = s && Items.get(s.id);
    if (!edible(d) || eating || P.isLocked()) return false;
    if (S.energy >= S.maxEnergy) { UI.toast('Bạn chưa đói đâu nè.', 'energy'); return true; }
    var idx = Inv.selectedIndex(), g = gain(d);
    eating = true;
    P.playAction('eat', { duration: 0.8, item: d.id, drink: !!(d.icon && d.icon.tpl === 'bowl') }, function () {
      eating = false;
      var s2 = Inv.get(idx);
      if (!s2 || s2.id !== d.id) return;
      Inv.removeAt(idx, 1); S.restoreEnergy(g);
      UI.toast(d.name + ': +' + g + ' năng lượng', 'energy'); UI.sfx('pop');
      E.emit('item:eaten', { id: d.id, energy: g });
    });
    return true;
  };
  E.on('ui:slotUse', function () { Eco.eat(); });
  E.on('input:action', function () {
    var s = Inv.selected(), d = s && Items.get(s.id);
    if (!edible(d) || P.isLocked()) return;
    var f = P.frontTile(), t = P.tile();
    if (G.Interact.resolve(f.tx, f.tz) || G.Interact.resolve(t.tx, t.tz)) return;
    Eco.eat();
  });

  /* ------------------------------------------------------------- NPC dialogue */
  function npcLines(kind) {
    var L = D.LINES[kind], i = Eco.tipIdx++, out = [];
    function pick(arr, salt) { return arr[(i + (salt || 0)) % arr.length]; }
    out.push(pick(L.greet, 1));
    // weather beats season when it is raining or snowing
    if (T.weather !== 'sun' && L[T.weather]) out.push(pick(L[T.weather], 0));
    else out.push(pick(L[T.season] || L.spring, 0));
    // time of day and player progress (each only now and then)
    if (T.hour >= 21) out.push(pick(L.night, 0));
    else if (T.hour < 8 && i % 2 === 0) out.push(pick(L.dawn, 0));
    else if (L.skilled && i % 3 === 2 && S.level(kind === 'fish' ? 'fishing' : 'farming') >= 3) out.push(pick(L.skilled, 0));
    out.push(pick(L.tips, 2));
    return out;
  }
  function talk(kind, name, next) {
    UI.dialog({ name: name, voice: kind, lines: npcLines(kind), onDone: next });
    Save().request();
  }
  function Save() { return G.Save; }

  /* ------------------------------------------------------------- store rows */
  function lockReason(r) {
    if (S.level(r.skill) < r.lvl) return cap(r.skill) + ' Lv ' + r.lvl;
    if (r.kind === 'permit') { for (var j = 1; j < r.idx; j++) if (!G.World.isPlotUnlocked(j)) return 'Hãy mua giấy phép trước đó đã'; }
    if (r.kind === 'pack' && r.size === 36 && Inv.size < 24) return 'Cần ba lô 24 ô trước';
    return '';
  }
  function owned(r) {
    if (r.kind === 'permit') return G.World.isPlotUnlocked(r.idx);
    if (r.kind === 'pack') return Inv.size >= r.size;
    return false;
  }
  function buy(r, qty) {
    var total = r.price * qty;
    if (S.money < total) { UI.toast('Bạn chưa đủ vàng.', 'coin'); return false; }
    if (r.kind === 'item') {
      if (!Inv.canAdd(r.id, qty)) { UI.toast('Túi đồ đầy rồi!', 'box'); return false; }
      S.spendMoney(total); Inv.add(r.id, qty);
    } else if (r.kind === 'permit') { S.spendMoney(total); G.World.unlockPlot(r.idx); UI.toast('Mở khóa thêm một mảnh đất!', 'sprout'); }
    else { S.spendMoney(total); Inv.resize(r.size); UI.toast('Túi đồ: ' + r.size + ' ô!', 'bag'); }
    UI.sfx('pop');
    E.emit('shop:transaction', { kind: r.kind, id: r.id, n: qty, cost: total, by: G.Net.playerId });
    return true;
  }
  function rowEl(parent, d, tier, name, sub, locked) {
    var row = el('div', 'shop-row' + (locked ? ' lock' : ''), parent);
    el('div', 'ic', row, Icons.item(d, 44, tier || 0));
    var mid = el('div', 'mid', row);
    el('div', 'nm', mid).textContent = name;
    el('div', 'sub', mid).textContent = sub;
    return { row: row, act: el('div', 'act', row) };
  }
  function shopRow(parent, r, refresh) {
    var d = Items.get(r.id), own = owned(r), why = own ? '' : lockReason(r), qty = 1;
    var sub = own ? 'Đã có' : why ? 'Đang khóa: ' + why : (d.tip || '');
    var o = rowEl(parent, d, 0, d.name, sub, !!why || own);
    if (own || why) { if (why) o.act.innerHTML = Icons.ui('lock', 22); return; }
    var q = r.kind === 'item' && d.cat !== 'key' ? el('div', 'qty', o.act) : null, cnt;
    var b = btn('', o.act, function () { if (buy(r, qty)) refresh(); });
    function upd() { if (cnt) cnt.textContent = qty; b.innerHTML = COIN + (r.price * qty); b.disabled = S.money < r.price * qty; }
    if (q) {
      btn('-', q, function () { qty = Math.max(1, qty - 1); upd(); }, 'alt');
      cnt = el('span', null, q, '1');
      btn('+', q, function () { qty = Math.min(d.stack || 99, qty + 1); upd(); }, 'alt');
    }
    upd();
  }
  function openStore(title, tabs, rowsFor, extra) {
    var p = el('div', 'tv-wide tv-shop'), tab = tabs ? tabs[0][0] : '', h = el('h2', null, p), gold = el('span', 'gold', h);
    el('span', null, h).textContent = title; h.insertBefore(h.lastChild, gold);
    var tabsEl = tabs ? el('div', 'tv-tabs', p) : null, list = el('div', 'shop-list', p), tb = {};
    function render() {
      gold.innerHTML = COIN + S.money;
      if (tabsEl) tabs.forEach(function (t) { tb[t[0]].classList.toggle('on', t[0] === tab); });
      var keep = list.scrollTop; list.innerHTML = '';
      rowsFor(tab).forEach(function (r) { r.custom ? r.custom(list, render) : shopRow(list, r, render); });
      list.scrollTop = keep;
    }
    if (tabs) tabs.forEach(function (t) { tb[t[0]] = btn(t[1], tabsEl, function () { tab = t[0]; render(); }); });
    var row = el('div', 'tv-row', p);
    if (extra) extra(row);
    btn('Đóng', row, function () { UI.closePanel(); });
    var off = E.on('state:changed', function (e) { if (e && e.key === 'money') gold.innerHTML = COIN + S.money; });
    UI.openPanel(p, { onClose: function () { off(); G.Save.request(); } });
    render();
  }

  /* ------------------------------------------------------------- shipping bin / crate */
  function openBox(c, title, cat, note) {
    var tip;
    function upd() { tip.textContent = note + ' Giá trị hiện tại: ' + Eco.value(c) + 'g'; }
    var p = UI.openContainer(c, {
      title: title, onChange: function () { upd(); G.Save.request(); },
      filter: function (s) { var d = s && Items.get(s.id); return !!d && (d.cat === cat || (cat === 'fish' && d.cat === 'junk')); }
    });
    if (!p) return;
    var v0 = Eco.value(c), offc = E.on('ui:closed', function () { offc(); if (Eco.value(c) > v0) P.playAction('sell', {}); });
    tip = el('div', 'tv-tip'); p.insertBefore(tip, p.children[1]); upd();
  }
  G.Events.on('interact:bin', function () { openBox(Eco.bin, 'Thùng bán đồ', 'crop', 'Chỉ nhận nông sản. Nhận tiền khi bạn thức dậy.'); });

  /* ------------------------------------------------------------- shop / fish stall */
  E.on('interact:shop', function () {
    talk('shop', 'Cô chủ cửa hàng', function () {
      openStore('Cửa hàng', D.TABS, function (tab) { return D.rows(tab, T.season); });
    });
  });
  E.on('interact:fishstall', function () {
    talk('fish', 'Bác bán cá', function () {
      openStore('Sạp cá', null, function () { return D.rows('fish'); }, function (row) {
        btn('Thùng cá', row, function () { UI.closePanel(); openBox(Eco.crate, 'Thùng cá', 'fish', 'Cá và đồ nhặt được. Nhận tiền khi bạn thức dậy.'); }, 'alt');
      });
    });
  });

  /* ------------------------------------------------------------- workshop */
  function bestTool(id) {
    var best = -1, bt = -1;
    for (var i = 0; i < Inv.size; i++) { var s = Inv.get(i); if (s && s.id === id && (s.tier || 0) > bt) { best = i; bt = s.tier || 0; } }
    return best < 0 ? null : { i: best, tier: bt };
  }
  function upgradeRow(id) {
    return {
      custom: function (list, refresh) {
        var d = Items.get(id), U = D.TOOL_UP, b = bestTool(id), busy = Eco.pending.some(function (p) { return p.id === id; });
        var tier = b ? b.tier : 0, nx = tier + 1, sub, locked = true, o;
        if (busy) sub = 'Đang nâng cấp. Sáng mai là xong.';
        else if (!b) sub = 'Mang ' + d.name + ' đến đây để nâng cấp nhé.';
        else if (nx > 3) sub = 'Đã là hạng ' + Items.TIERS[3] + '. Cao nhất rồi!';
        else if (S.level('farming') < U.lvl[nx - 1]) sub = 'Đang khóa: Làm nông Cấp ' + U.lvl[nx - 1];
        else { sub = Items.TIERS[tier] + ' to ' + Items.TIERS[nx] + '. Ready tomorrow morning.'; locked = false; }
        o = rowEl(list, d, Math.min(3, nx), d.name, sub, locked);
        if (locked) { if (!busy && b && nx <= 3) o.act.innerHTML = Icons.ui('lock', 22); return; }
        btn(COIN + U.cost[nx - 1], o.act, function () {
          if (S.money < U.cost[nx - 1]) { UI.toast('Bạn chưa đủ vàng.', 'coin'); return; }
          var cur = bestTool(id);
          if (!cur || !S.spendMoney(U.cost[nx - 1])) return;
          Inv.removeAt(cur.i, 1);
          Eco.pending.push({ id: id, tier: nx, ready: T.day + 1 });
          UI.toast('Đã nhận đồ. Mai là xong nhé!', 'gear'); UI.sfx('pop');
          E.emit('shop:transaction', { kind: 'upgrade', id: id, n: 1, cost: U.cost[nx - 1], by: G.Net.playerId });
          refresh();
        });
      }
    };
  }
  E.on('interact:workshop', function () {
    var got = deliver(false);
    talk('smith', 'Thợ rèn', function () {
      openStore('Xưởng', null, function () { return D.TOOL_UP.ids.map(upgradeRow); });
    });
    if (got) { UI.sfx('pop'); P.playAction('pickup', {}); }
  });

  /* ------------------------------------------------------------- save */
  G.Save.register('economy', {
    save: function () { return { bin: Eco.bin.serialize(), crate: Eco.crate.serialize(), pending: Eco.pending, tip: Eco.tipIdx }; },
    load: function (o) {
      o = o || {};
      Eco.bin.load(o.bin || { size: 24, slots: [] }); Eco.crate.load(o.crate || { size: 12, slots: [] });
      Eco.pending = (o.pending || []).filter(function (p) { return p && Items.get(p.id); });
      Eco.tipIdx = o.tip || 0;
    },
    reset: function () { Eco.bin.clear(); Eco.crate.clear(); Eco.pending = []; Eco.tipIdx = 0; }
  }, 'world');
})();
