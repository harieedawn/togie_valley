/* Togie Valley - items.js (Stage 2)
 * Game.Items: define(def), get(id), all(cat?). Base items only; later stages define their own in their own files.
 * Depends on: core.js
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events) { console.error('[items] core.js missing'); return; }

  var defs = Object.create(null), order = [];
  var CATS = ['tool', 'seed', 'crop', 'fish', 'fertilizer', 'bait', 'food', 'key', 'junk'];
  var STACK = 99;

  var Items = G.Items = {
    CATEGORIES: CATS,
    TIERS: ['Cơ bản', 'Đồng', 'Bạc', 'Vàng'],
    QUALITIES: ['normal', 'silver', 'gold'],
    QUALITY_MULT: { normal: 1, silver: 1.25, gold: 1.5 },

    /* def: {id,name,cat,icon,tip,price,stack?,...}. Redefining an id replaces it. Returns the stored def. */
    define: function (def) {
      if (!def || !def.id) { console.error('[items] define: id required'); return null; }
      if (CATS.indexOf(def.cat) < 0) { console.error('[items] bad category for ' + def.id + ': ' + def.cat); return null; }
      var d = {};
      for (var k in def) d[k] = def[k];
      if (d.stack === undefined) d.stack = (d.cat === 'tool' || d.cat === 'key') ? 1 : STACK;
      if (d.price === undefined) d.price = 0;
      if (typeof d.icon === 'string') console.warn('[items] legacy string icon ignored (use icon:{tpl,c1,c2}): ' + d.id);
      if (d.tip && d.tip.length > 90) console.warn('[items] tip longer than 90 chars: ' + d.id);
      if (!defs[d.id]) order.push(d.id);
      defs[d.id] = d;
      return d;
    },
    get: function (id) { return defs[id] || null; },
    all: function (cat) {
      var out = [];
      for (var i = 0; i < order.length; i++) { var d = defs[order[i]]; if (!cat || d.cat === cat) out.push(d); }
      return out;
    },
    /* Sell value of one unit at a quality. */
    price: function (id, q) {
      var d = defs[id];
      return d ? Math.round(d.price * (Items.QUALITY_MULT[q || 'normal'] || 1)) : 0;
    },
    /* Energy per use of a tool at a tier: base x 0.85^tier. */
    energyCost: function (id, tier) {
      var d = defs[id];
      return d && d.energy ? Math.round(d.energy * Math.pow(0.85, tier || 0) * 100) / 100 : 0;
    }
  };

  /* ---- base items (Stage 2) ---- */
  var AREAS = ['1x1', '1x3 line ahead', '3x3', '3x5 ahead'];
  Items.define({
    id: 'hoe', name: 'Cuốc', cat: 'tool', icon: { tpl: 'hoe', c1: '#c9945a', c2: '#a9bdd0' }, energy: 2, areas: AREAS, price: 0,
    tip: 'Xới đất cho tơi để rễ lan rộng và nước thấm vào dễ hơn.'
  });
  Items.define({
    id: 'watering_can', name: 'Bình tưới', cat: 'tool', icon: { tpl: 'can', c1: '#6bb6ee', c2: '#f2c76c' }, energy: 1, areas: AREAS,
    capacities: [40, 55, 70, 85], price: 0,
    tip: 'Cây uống nước bằng rễ, nên hãy tưới vào đất chứ không phải lên lá.'
  });
  Items.define({
    id: 'bamboo_pole', name: 'Cần câu tre', cat: 'tool', icon: { tpl: 'rod', c1: '#b9d46a', c2: '#e8b878' }, energy: 2, price: 0,
    tip: 'Kiên nhẫn là một phần của câu cá: nước lặng thì cá cắn nhiều hơn.'
  });
  Items.define({
    id: 'compost', name: 'Phân ủ', cat: 'fertilizer', icon: { tpl: 'sack', c1: '#b98a5e', c2: '#79c75a' }, price: 20, nutrient: 'npk',
    tip: 'Phân ủ làm từ lá mục và rác bếp: thức ăn từ từ cho đất, lại có cả đàn giun vui vẻ.'
  });
  Items.define({
    id: 'leaf_feed', name: 'Phân lá xanh', cat: 'fertilizer', icon: { tpl: 'sack', c1: '#e9d7a8', c2: '#79c75a' }, price: 40, nutrient: 'n',
    tip: 'Đạm (N) nuôi lá xanh tươi tốt.'
  });
  Items.define({
    id: 'bloom_feed', name: 'Phân nở hoa', cat: 'fertilizer', icon: { tpl: 'sack', c1: '#e9d7a8', c2: '#ff8fb5' }, price: 40, nutrient: 'p',
    tip: 'Lân (P) giúp hoa, quả và rễ non khỏe mạnh.'
  });
  Items.define({
    id: 'root_feed', name: 'Phân củ rễ', cat: 'fertilizer', icon: { tpl: 'sack', c1: '#e9d7a8', c2: '#ffa04d' }, price: 40, nutrient: 'k',
    tip: 'Kali (K) giúp cây chịu hạn và ít bệnh.'
  });
  Items.define({
    id: 'bread', name: 'Bánh mì', cat: 'food', icon: { tpl: 'bread', c1: '#e0a458', c2: '#f6d9a0' }, price: 15, buyPrice: 30, energy: 25,
    tip: 'Bánh mì nướng từ bột mì; men tạo những bọt khí nhỏ làm bánh xốp mềm.'
  });
  Items.define({
    id: 'notebook', name: 'Sổ tay nhà nông', cat: 'key', icon: { tpl: 'notebook', c1: '#b88ae0', c2: '#ffd23f' }, price: 0,
    tip: 'Ghi lại điều bạn học được. Nhà nông giỏi nào cũng có sổ tay!'
  });
})();
