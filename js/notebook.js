/* Togie Valley - notebook.js (Stage 12): Farmer's Notebook UI (menu tab 'book').
 * Game.Notebook: render(body) (called by panels.js), found {crops,fish,soil}, isFound(kind,id), counts(). Sections: Mục tiêu, Cây trồng, Cá, Đất (N-P-K), Thời tiết & Mùa.
 * Entries unlock on first harvest / first catch (events) and on first sight of a season / weather. Save key 'notebook' {crops, soil}.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Items || !G.UI || !G.Icons || !G.Goals) { console.error('[notebook] dependencies missing'); return; }
  var E = G.Events, Items = G.Items, Icons = G.Icons, Gl = G.Goals, NB = { found: { crops: {}, soil: {} } }, tab = 'goals';

  var SOIL = [
    ['n', 'Đạm (N)', 'Đạm giúp lá xanh tốt. Rau lá như cải xoăn, súp lơ rất cần đạm.', 'Cây lá, lúa mì, ngô'],
    ['p', 'Lân (P)', 'Lân nuôi hoa và quả. Cà chua, dâu tây, hoa cần nhiều lân.', 'Cây quả, hoa, đậu'],
    ['k', 'Kali (K)', 'Kali làm củ và rễ chắc, giúp cây chịu hạn và ít bệnh.', 'Cây củ và rễ']
  ];
  var CLS = { leaf: 'n', grain: 'n', fruit: 'p', flower: 'p', legume: 'p', root: 'k' };
  var SEASONS = [
    ['spring', 'Xuân', 'Đất ấm dần, hoa nở và nhiều hạt giống ra đời. Mưa xuân tưới giúp bạn.'],
    ['summer', 'Hạ', 'Nắng dài, cây lớn nhanh nhưng khát nước. Nhớ tưới đều tay!'],
    ['autumn', 'Thu', 'Mùa gặt! Nhiều loại quả chín và lá vàng rơi khắp thung lũng.'],
    ['winter', 'Đông', 'Trời lạnh, đa số cây ngủ đông. Chỉ rau chịu lạnh mới lớn được.']
  ];
  var WEATHER = [
    ['sun', 'Trời nắng', 'Nắng giúp cây quang hợp, nhưng đất khô nhanh nên cần tưới.'],
    ['rain', 'Trời mưa', 'Mưa tưới giúp tất cả cây trồng. Nghỉ tay một buổi nhé!'],
    ['snow', 'Tuyết rơi', 'Tuyết phủ trắng thung lũng. Nước hồ lạnh khiến cá cắn câu khác đi.']
  ];

  function el(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function cropFound(id) { return !!NB.found.crops[id] || !!(G.Farm && G.Farm.found && G.Farm.found(id)); }
  function fishFound(id) { return !!(G.Fishing && G.Fishing.records[id]); }
  NB.isFound = function (kind, id) {
    if (kind === 'crop') return cropFound(id);
    if (kind === 'fish') return fishFound(id);
    if (kind === 'soil') return !!NB.found.soil[id];
    if (kind === 'season') return !!Gl.prog.seasons[id];
    if (kind === 'weather') return !!Gl.prog.weathers[id];
    return false;
  };
  NB.counts = function () {
    var c = { crop: [0, 0], fish: [0, 0] };
    (G.Crops ? G.Crops.list : []).forEach(function (x) { c.crop[1]++; if (cropFound(x.id)) c.crop[0]++; });
    (G.FishData ? G.FishData.species : []).forEach(function (x) { c.fish[1]++; if (fishFound(x.id)) c.fish[0]++; });
    return c;
  };

  E.on('crop:harvested', function (p) {
    var cd = G.Crops && G.Crops.get(p.id), s;
    NB.found.crops[p.id] = 1;
    if (cd) { s = CLS[cd.cls]; if (s) NB.found.soil[s] = 1; }
  });

  function entry(parent, ic, name, tip, ok, sub) {
    var r = el('div', 'nb-ent' + (ok ? '' : ' locked'), parent);
    el('div', 'ic', r, ok ? ic : Icons.ui('lock', 30));
    el('div', 'tx', r, '<b>' + (ok ? name : '???') + '</b>' + (sub && ok ? '<small>' + sub + '</small>' : '') + '<span>' + (ok ? tip : 'Chưa khám phá. Hãy tiếp tục trải nghiệm nhé!') + '</span>');
  }
  var SECTIONS = [
    ['goals', 'Mục tiêu', 'star'], ['crops', 'Cây trồng', 'sprout'], ['fish', 'Cá', null], ['soil', 'Đất', 'box'], ['sky', 'Trời & Mùa', 'sun']
  ];
  function secGoals(b) {
    var n = Gl.doneCount(false);
    el('div', 'tv-sub', b, Icons.ui('star', 20) + ' Đã xong ' + n + '/14 mục tiêu');
    Gl.list.forEach(function (g) {
      var p = Gl.progress(g.id), r = el('div', 'nb-goal' + (p.done ? ' done' : ''), b);
      el('div', 'ic', r, Icons.ui(p.done ? 'check' : g.icon, 28));
      el('div', 'tx', r, '<b>' + g.name + '</b><span>' + g.desc + '</span><div class="tv-bar"><i style="width:' + Math.round(100 * p.cur / p.need) + '%;transform:none;animation:none"></i></div>' +
        '<small>' + (p.done ? 'Đã hoàn thành' : p.cur + '/' + p.need) + '</small>');
    });
  }
  function secCrops(b) {
    var c = NB.counts().crop;
    el('div', 'tv-sub', b, 'Cây trồng đã gặp: ' + c[0] + '/' + c[1]);
    G.Crops.list.forEach(function (x) { var ok = cropFound(x.id); entry(b, Icons.item(x.id, 40), x.name, x.tip, ok); });
  }
  function secFish(b) {
    var c = NB.counts().fish, fi = { tpl: 'fish' };
    el('div', 'tv-sub', b, 'Loài cá đã câu: ' + c[0] + '/' + c[1]);
    el('div', 'tv-tip', b, 'Kiên nhẫn đợi lâu, cá càng ngon! Chờ càng lâu thì cá càng lớn, càng hiếm.');
    G.FishData.species.forEach(function (x) {
      var ok = fishFound(x.id), it = Items.get(x.id), rec = G.Fishing.records[x.id];
      entry(b, Icons.item(x.id, 40), it ? it.name : x.name, it ? it.tip : '', ok, rec ? 'Câu được ' + rec.n + ' lần' : '');
    });
  }
  function secSoil(b) {
    el('div', 'tv-sub', b, 'Đất và dinh dưỡng N-P-K');
    el('div', 'tv-tip', b, 'Mỗi ô đất có Đạm (N), Lân (P), Kali (K). Cây hút chất chính của nó, nên hãy bón phân và luân canh nhé!');
    SOIL.forEach(function (s) { entry(b, Icons.ui('sprout', 36), s[1], s[2] + ' Hợp với: ' + s[3] + '.', !!NB.found.soil[s[0]]); });
  }
  function secSky(b) {
    el('div', 'tv-sub', b, 'Mùa trong năm');
    SEASONS.forEach(function (s) { entry(b, Icons.ui(s[0], 36), s[1], s[2], NB.isFound('season', s[0])); });
    el('div', 'tv-sub', b, 'Thời tiết');
    WEATHER.forEach(function (s) { entry(b, Icons.ui(s[0], 36), s[1], s[2], NB.isFound('weather', s[0])); });
  }
  var FNS = { goals: secGoals, crops: secCrops, fish: secFish, soil: secSoil, sky: secSky };

  NB.openTab = function (t) { if (FNS[t]) tab = t; };   // Stage 15C: pause menu tiles pick the section
  NB.render = function (body) {
    var wrap = el('div', 'tv-nb', body), bar = el('div', 'nb-tabs', wrap), content = el('div', 'nb-body', wrap);
    function show(t) {
      tab = t; content.innerHTML = '';
      Array.prototype.forEach.call(bar.children, function (c) { c.classList.toggle('on', c.getAttribute('data-t') === t); });
      FNS[t](content);
    }
    SECTIONS.forEach(function (s) {
      var b = el('button', 'tv-btn alt', bar, (s[2] ? Icons.ui(s[2], 18) : Icons.item({ tpl: 'fish', c1: '#6bb6ee', c2: '#f3e6a0' }, 18)) + ' ' + s[1]);
      b.setAttribute('data-t', s[0]);
      b.addEventListener('click', function () { G.UI.sfx('tap'); show(s[0]); });
    });
    show(tab);
  };

  G.Save.register('notebook', {
    save: function () { return { crops: NB.found.crops, soil: NB.found.soil }; },
    load: function (o) { o = o || {}; NB.found = { crops: o.crops || {}, soil: o.soil || {} }; },
    reset: function () { NB.found = { crops: {}, soil: {} }; }
  }, 'player');
  G.Notebook = NB;
})();
