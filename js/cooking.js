/* Togie Valley - cooking.js (Stage 12): kitchen panel, cooking, timed food buffs + HUD chip.
 * Game.Cooking: open(), canCook(id), cook(id), buff (active {id,kind,until,v,gold} | null), mul(kind), bonus(kind), recipes.
 * Events: cook:done {id}, buff:changed {buff}. Save key 'cooking' {buff}. Buffs are cleared when a new day starts.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Items || !G.CookData || !G.Inventory || !G.State || !G.UI || !G.Icons || !G.Time) { console.error('[cooking] dependencies missing'); return; }
  var E = G.Events, Items = G.Items, Inv = G.Inventory, S = G.State, UI = G.UI, Icons = G.Icons, T = G.Time, D = G.CookData;
  var C = { buff: null, recipes: D.recipes };
  var KIND = { speed: 'Nhanh chân', farm: 'Tay nông giỏi', fish: 'Cá dễ cắn câu' };

  function el(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ------------------------------------------------------------- ingredients */
  function fishSlots() {
    var out = [], i, s, d;
    for (i = 0; i < Inv.size; i++) {
      s = Inv.get(i); d = s && Items.get(s.id);
      if (d && d.cat === 'fish') out.push({ i: i, p: d.price || 0 });
    }
    out.sort(function (a, b) { return a.p - b.p; });
    return out;
  }
  function have(ing) {
    if (ing.id) return Inv.count(ing.id);
    var n = 0, i, s;
    for (i = 0; i < Inv.size; i++) { s = Inv.get(i); if (s && Items.get(s.id) && Items.get(s.id).cat === ing.cat) n += s.n; }
    return n;
  }
  function ingName(ing) { return ing.id ? Items.get(ing.id).name : 'Cá bất kỳ'; }
  function ingIcon(ing, px) {
    return ing.id ? Icons.item(ing.id, px) : Icons.item({ tpl: 'fish', c1: '#6bb6ee', c2: '#f3e6a0' }, px);
  }
  function lockReason(r) { return S.level(r.skill) < r.lvl ? (r.skill === 'farming' ? 'Làm nông' : 'Câu cá') + ' Lv ' + r.lvl : ''; }
  C.canCook = function (id) {
    var r = D.get(id), i;
    if (!r || lockReason(r)) return false;
    for (i = 0; i < r.ing.length; i++) if (have(r.ing[i]) < r.ing[i].n) return false;
    return true;
  };
  C.cook = function (id) {
    var r = D.get(id), i, j, k, fs;
    if (!r) return false;
    if (lockReason(r)) { UI.toast('Cần ' + lockReason(r) + ' để nấu món này.', 'lock'); return false; }
    if (!C.canCook(id)) { UI.toast('Chưa đủ nguyên liệu rồi.', 'warn'); return false; }
    if (!Inv.canAdd(id, 1, 'normal')) { UI.toast('Túi đồ đầy mất rồi!', 'bag'); return false; }
    for (i = 0; i < r.ing.length; i++) {
      if (r.ing[i].id) Inv.remove(r.ing[i].id, r.ing[i].n);
      else for (j = 0; j < r.ing[i].n; j++) { fs = fishSlots(); if (fs.length) Inv.removeAt(fs[0].i, 1); }
    }
    k = Inv.add(id, 1, 'normal');
    UI.toast('Đã nấu xong ' + r.name + '!', 'star'); UI.sfx('pop');
    E.emit('cook:done', { id: id });
    return k > 0;
  };

  /* ------------------------------------------------------------- buffs */
  C.mul = function (kind) { return C.buff && C.buff.kind === kind && C.buff.v ? C.buff.v : 1; };
  C.bonus = function (kind) { return C.buff && C.buff.kind === kind && C.buff.gold ? C.buff.gold : 0; };
  function setBuff(b) {
    C.buff = b;
    if (G.Player) G.Player.speedMul = C.mul('speed');
    renderChip();
    E.emit('buff:changed', { buff: b });
  }
  function applyBuff(id) {
    var d = Items.get(id), b = d && d.buff;
    if (!b) return;
    setBuff({ id: id, kind: b.kind, until: Math.min(26, T.hour + b.hours), v: b.v || 0, gold: b.gold || 0 });
    UI.toast((KIND[b.kind] || 'Hiệu ứng') + ' trong ' + b.hours + ' giờ!', 'star');
  }
  E.on('item:eaten', function (p) { applyBuff(p.id); G.Save.request(); });
  E.on('time:minuteStep', function () { if (C.buff && T.hour >= C.buff.until) setBuff(null); else renderChip(); });
  E.on('day:started', function () { if (C.buff) setBuff(null); });

  var chip = null, right = UI.hud && UI.hud.energy && UI.hud.energy.parentNode;
  if (right) { chip = el('div', 'tv-card tv-hud-chip', right); chip.id = 'tv-buff'; chip.style.display = 'none'; }
  function renderChip() {
    var b = C.buff, left;
    if (!chip) return;
    if (!b) { chip.style.display = 'none'; return; }
    left = Math.max(1, Math.ceil(b.until - T.hour));
    chip.style.display = '';
    chip.innerHTML = '<span class="ico">' + Icons.item(b.id, 26) + '</span><span class="txt"><b>' + (KIND[b.kind] || '') + '</b><i>còn ' + left + ' giờ</i></span>';
  }

  /* ------------------------------------------------------------- kitchen panel */
  var panel = null;
  function render() {
    if (!panel) return;
    panel.innerHTML = '';
    el('h2', null, panel, Icons.ui('hand', 26) + ' Bếp nhà');
    el('div', 'tv-sub', panel, 'Chọn món để nấu. Ăn món ăn sẽ cho hiệu ứng trong vài giờ.');
    var list = el('div', 'tv-cook', panel);
    D.recipes.forEach(function (r) {
      var lock = lockReason(r), ok = C.canCook(r.id), row = el('div', 'rec' + (lock ? ' locked' : ''), list), b = r.buff, ings = '';
      r.ing.forEach(function (g) {
        var h = have(g);
        ings += '<span class="ing' + (h >= g.n ? ' ok' : '') + '">' + ingIcon(g, 22) + ingName(g) + ' ' + Math.min(h, 99) + '/' + g.n + '</span>';
      });
      el('div', 'ic', row, Icons.item(r.id, 48));
      el('div', 'info', row, '<b>' + r.name + '</b><div class="ings">' + ings + '</div><div class="eff">' + Icons.ui('energy', 16) + ' +' + r.energy + ' · ' +
        (KIND[b.kind] || '') + ' ' + b.hours + ' giờ</div><div class="nt">' + r.tip + '</div>');
      var act = el('div', 'act', row), bt;
      if (lock) act.innerHTML = Icons.ui('lock', 22) + '<small>' + lock + '</small>';
      else {
        bt = el('button', 'tv-btn' + (ok ? '' : ' alt'), act, 'Nấu');
        bt.addEventListener('click', function () { if (C.cook(r.id)) render(); else UI.sfx('tap'); });
      }
    });
  }
  C.open = function () {
    panel = el('div', 'tv-kitchen');
    render();
    UI.openPanel(panel, { onClose: function () { panel = null; } });
    return panel;
  };
  E.on('inventory:changed', function () { if (panel) render(); });

  /* ------------------------------------------------------------- save */
  G.Save.register('cooking', {
    save: function () { return { buff: C.buff }; },
    load: function (o) { setBuff(o && o.buff && Items.get(o.buff.id) && o.buff.until > T.hour ? o.buff : null); },
    reset: function () { setBuff(null); }
  }, 'player');
  G.Cooking = C;
})();
