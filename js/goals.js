/* Togie Valley - goals.js (Stage 12): Game.Goals, 14 event-driven goals + a final celebration goal.
 * Game.Goals: list [{id,name,desc,icon,need,reward,cur(),done}], check(), progress(id) -> {cur,need,done}, doneCount(), allDone(), prog (counters), celebrate().
 * Events: goal:done {id}, goals:celebrated. Save key 'goals' {done, prog, celebrated}.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.State || !G.Inventory || !G.UI || !G.Time || !G.Day || !G.Save) { console.error('[goals] dependencies missing'); return; }
  var E = G.Events, S = G.State, Inv = G.Inventory, UI = G.UI, Icons = G.Icons, T = G.Time;
  var Gl = { list: [], done: {}, celebrated: false };
  function fresh() { return { shipped: 0, harvests: 0, cooked: 0, upgrades: 0, permits: 0, peak: 0, seasons: {}, weathers: {} }; }
  Gl.prog = fresh();
  var inEnd = false;

  function count(o) { var n = 0, k; for (k in o) if (o[k]) n++; return n; }
  function species() {
    var F = G.Fishing, FD = G.FishData, n = 0, k;
    if (!F || !FD) return 0;
    for (k in F.records) if (FD.isFish(k)) n++;
    return n;
  }
  function def(id, name, desc, icon, need, cur, reward) { Gl.list.push({ id: id, name: name, desc: desc, icon: icon, need: need, cur: cur, reward: reward }); }
  var P = function () { return Gl.prog; };
  def('ship5', 'Lô hàng đầu tiên', 'Giao 5 nông sản vào thùng bán đồ.', 'box', 5, function () { return P().shipped; }, { money: 100 });
  def('harvest15', 'Bàn tay xanh', 'Thu hoạch 15 lần.', 'sprout', 15, function () { return P().harvests; }, { items: [['compost', 5]] });
  def('rain', 'Ngày mưa đầu tiên', 'Đón một ngày mưa trong thung lũng.', 'rain', 1, function () { return P().weathers.rain ? 1 : 0; }, { money: 80 });
  def('snow', 'Tuyết rơi rồi', 'Ngắm một ngày có tuyết.', 'snowflake', 1, function () { return P().weathers.snow ? 1 : 0; }, { money: 120 });
  def('seasons', 'Một vòng bốn mùa', 'Trải qua đủ xuân, hạ, thu, đông.', 'maple', 4, function () { return count(P().seasons); }, { money: 400 });
  def('species5', 'Nhà sưu tập cá', 'Câu được 5 loài cá khác nhau.', 'star', 5, species, { items: [['worm_bait', 10]] });
  def('catch20', 'Cần thủ chăm chỉ', 'Câu được 20 con cá.', 'star', 20, function () { return G.Fishing ? G.Fishing.totals.catches : 0; }, { money: 250 });
  def('upgrade', 'Dụng cụ xịn hơn', 'Nâng cấp một dụng cụ ở Xưởng.', 'gear', 1, function () { return P().upgrades; }, { money: 150 });
  def('permit', 'Mở rộng đất', 'Mua một giấy phép mở rộng ruộng.', 'lock', 1, function () { return P().permits; }, { items: [['leaf_feed', 3]] });
  def('cook1', 'Bếp lên lửa', 'Nấu món ăn đầu tiên.', 'hand', 1, function () { return P().cooked; }, { items: [['bread', 3]] });
  def('cook8', 'Đầu bếp nhí', 'Nấu 8 món ăn.', 'hand', 8, function () { return P().cooked; }, { money: 300 });
  def('farmLv3', 'Nông dân chính hiệu', 'Đạt Làm nông cấp 3.', 'sprout', 3, function () { return Math.min(3, S.level('farming')); }, { money: 200 });
  def('fishLv3', 'Bạn của loài cá', 'Đạt Câu cá cấp 3.', 'star', 3, function () { return Math.min(3, S.level('fishing')); }, { items: [['dough_bait', 10]] });
  def('money1500', 'Hũ vàng đầy', 'Có 1500g trong túi.', 'coin', 1500, function () { return Math.min(1500, P().peak); }, { items: [['rice_ball', 3]] });
  def('final', 'Chủ nhân Thung lũng Togie', 'Hoàn thành mọi mục tiêu.', 'star', 14, function () { return Gl.doneCount(false); }, { money: 1000 });

  Gl.get = function (id) { var i; for (i = 0; i < Gl.list.length; i++) if (Gl.list[i].id === id) return Gl.list[i]; return null; };
  Gl.progress = function (id) {
    var g = Gl.get(id);
    if (!g) return { cur: 0, need: 1, done: false };
    return { cur: Math.min(g.need, g.cur()), need: g.need, done: !!Gl.done[id] };
  };
  Gl.doneCount = function (withFinal) {
    var n = 0, i;
    for (i = 0; i < Gl.list.length; i++) if (Gl.done[Gl.list[i].id] && (withFinal !== false || Gl.list[i].id !== 'final')) n++;
    return n;
  };
  Gl.allDone = function () { return !!Gl.done.final; };

  function give(reward) {
    var parts = [];
    if (reward.money) { S.addMoney(reward.money); parts.push('+' + reward.money + 'g'); }
    (reward.items || []).forEach(function (it) {
      var d = G.Items.get(it[0]), add = Inv.add(it[0], it[1], 'normal');
      if (add < it[1] && G.House && G.House.chest) G.House.chest.add(it[0], it[1] - add, 'normal');
      parts.push(it[1] + ' ' + (d ? d.name : it[0]));
    });
    return parts.join(', ');
  }
  function complete(g) {
    Gl.done[g.id] = true;
    var txt = give(g.reward);
    UI.toast('Mục tiêu xong: ' + g.name + '! ' + txt, 'star'); UI.sfx('levelup');
    if (inEnd && G.House) G.House.addSummaryLine('Mục tiêu xong: ' + g.name + ' (' + txt + ')', 'star');
    E.emit('goal:done', { id: g.id });
    G.Save.request();
  }
  var checking = false;
  Gl.check = function () {
    var i, g, again = true, guard = 0;
    if (checking) return;
    checking = true;
    if (S.money > Gl.prog.peak) Gl.prog.peak = S.money;
    while (again && guard++ < 4) {
      again = false;
      for (i = 0; i < Gl.list.length; i++) {
        g = Gl.list[i];
        if (!Gl.done[g.id] && g.cur() >= g.need) { complete(g); again = true; }
      }
    }
    checking = false;
    if (Gl.done.final && !Gl.celebrated) { Gl.celebrated = true; setTimeout(Gl.celebrate, 900); }
  };

  /* ------------------------------------------------------------- celebration */
  Gl.celebrate = function () {
    var box = document.createElement('div'), i, c, cols = ['#ff7a8a', '#ffd23f', '#79c75a', '#6aa8ff', '#c78ae0', '#ffa04d'];
    box.className = 'tv-celebrate';
    box.innerHTML = '<div class="burst"></div><div class="big">' + Icons.ui('star', 72) + '</div><h2>Chúc mừng, nhà nông!</h2>' +
      '<p>Bạn đã hoàn thành mọi mục tiêu. Thung lũng Togie giờ là mái nhà ấm áp của bạn, và vụ mùa nào cũng sẽ vui!</p>';
    for (i = 0; i < 28; i++) {
      c = document.createElement('i');
      c.style.left = (3 + (i * 37) % 94) + '%'; c.style.background = cols[i % cols.length];
      c.style.animationDelay = ((i % 7) * 0.18) + 's'; c.style.animationDuration = (2.4 + (i % 5) * 0.4) + 's';
      box.querySelector('.burst').appendChild(c);
    }
    var b = document.createElement('button'); b.className = 'tv-btn'; b.textContent = 'Tiếp tục chơi';
    box.appendChild(b);
    UI.openPanel(box, { dismiss: true });
    UI.sfx('levelup');
    E.emit('goals:celebrated', {});
  };

  /* ------------------------------------------------------------- events */
  function seen() {
    Gl.prog.seasons[T.season] = 1;
    if (T.weather) Gl.prog.weathers[T.weather] = 1;
  }
  E.on('crop:harvested', function () { Gl.prog.harvests++; Gl.check(); });
  E.on('fish:caught', function () { Gl.check(); });
  E.on('cook:done', function () { Gl.prog.cooked++; Gl.check(); });
  E.on('skill:levelUp', function () { Gl.check(); });
  E.on('state:changed', function (p) { if (p && p.key === 'money' && p.delta > 0) Gl.check(); });
  E.on('shop:transaction', function (p) {
    if (p.kind === 'upgrade') Gl.prog.upgrades++;
    if (p.kind === 'permit') Gl.prog.permits++;
    Gl.check();
  });
  E.on('day:started', function () { seen(); Gl.check(); });
  G.Day.onEnd(19, function () {
    var eco = G.Economy, i, s, d;
    inEnd = true;
    if (eco && eco.bin) {
      for (i = 0; i < eco.bin.size; i++) { s = eco.bin.get(i); d = s && G.Items.get(s.id); if (d && d.cat === 'crop') Gl.prog.shipped += s.n; }
    }
    seen(); Gl.check();
    inEnd = false;
  });
  E.on('save:loaded', function () { seen(); Gl.check(); });
  E.on('save:reset', function () { seen(); });

  G.Save.register('goals', {
    save: function () { return { done: Gl.done, prog: Gl.prog, celebrated: Gl.celebrated }; },
    load: function (o) {
      var k, base = fresh();
      o = o || {};
      Gl.done = o.done || {}; Gl.celebrated = !!o.celebrated;
      for (k in base) if (o.prog && o.prog[k] !== undefined) base[k] = o.prog[k];
      Gl.prog = base;
    },
    reset: function () { Gl.done = {}; Gl.celebrated = false; Gl.prog = fresh(); }
  }, 'player');
  G.Goals = Gl;
})();
