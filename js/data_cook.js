/* Togie Valley - data_cook.js (Stage 12): dish items + Game.CookData (recipes). Load after fishing_fx.js, before cooking.js.
 * Recipe: {id (= dish item id), name, skill 'farming'|'fishing', lvl, ing:[{id|cat, n}], tip}
 * Item def gets `buff:{kind:'speed'|'farm'|'fish', hours, v, gold}` (speed: v = walk multiplier; fish: v = wait multiplier, gold = gold chance bonus; farm: gold = gold chance bonus).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Items) { console.error('[data_cook] items.js missing'); return; }
  var Items = G.Items;

  // id, name, tpl, c1, c2, energy, price, skill, lvl, ingredients, buff, tip (<= 90 chars)
  var ROWS = [
    ['baked_potato', 'Khoai tây nướng', 'bread', '#d9a25a', '#f6e2b0', 30, 60, 'farming', 1, [{ id: 'potato', n: 2 }],
      { kind: 'speed', hours: 3, v: 1.15 }, 'Khoai tây có nhiều tinh bột và kali: nguồn năng lượng bền cho buổi sáng.'],
    ['parsnip_stew', 'Súp củ cải vàng', 'bowl', '#f3e2b3', '#e0a458', 35, 90, 'farming', 1, [{ id: 'parsnip', n: 2 }, { id: 'garlic', n: 1 }],
      { kind: 'farm', hours: 3, gold: 0.08 }, 'Rau củ nấu mềm vẫn giữ chất xơ, giúp bạn no lâu hơn.'],
    ['bean_salad', 'Salad đậu cô ve', 'bowl', '#79c75a', '#f4f1df', 40, 110, 'farming', 2, [{ id: 'green_bean', n: 2 }, { id: 'kale', n: 1 }],
      { kind: 'speed', hours: 4, v: 1.15 }, 'Đậu giàu đạm thực vật, rau xanh bổ sung vitamin và chất xơ.'],
    ['fish_grill', 'Cá nướng', 'bread', '#e8a05a', '#ffd9a0', 40, 80, 'fishing', 1, [{ cat: 'fish', n: 1 }],
      { kind: 'fish', hours: 3, v: 0.75, gold: 0 }, 'Cá giàu đạm và omega-3, tốt cho trí não và tim mạch.'],
    ['tomato_soup', 'Súp cà chua', 'bowl', '#ff5a4a', '#ffd9a0', 45, 130, 'farming', 2, [{ id: 'tomato', n: 2 }, { id: 'garlic', n: 1 }],
      { kind: 'farm', hours: 3, gold: 0.1 }, 'Nấu chín giúp cà chua giải phóng nhiều lycopene hơn ăn sống.'],
    ['corn_cake', 'Bánh ngô', 'bread', '#ffd84a', '#f6e2b0', 50, 120, 'farming', 3, [{ id: 'corn', n: 2 }, { id: 'wheat', n: 1 }],
      { kind: 'speed', hours: 3, v: 1.2 }, 'Ngô và lúa mì cho tinh bột phức hợp, năng lượng đến từ từ.'],
    ['fish_stew', 'Cá hầm khoai', 'bowl', '#9ec9e8', '#e8c88a', 60, 160, 'fishing', 3, [{ cat: 'fish', n: 2 }, { id: 'potato', n: 1 }],
      { kind: 'fish', hours: 4, v: 0.65, gold: 0.05 }, 'Hầm chung cá và rau củ giúp bữa ăn đủ đạm, bột và vitamin.'],
    ['pepper_fish', 'Cá sốt ớt', 'bowl', '#ff5a3a', '#ffd9a0', 55, 150, 'fishing', 4, [{ id: 'hot_pepper', n: 1 }, { cat: 'fish', n: 1 }],
      { kind: 'fish', hours: 3, v: 0.75, gold: 0.1 }, 'Capsaicin trong ớt làm cơ thể ấm lên. Ăn vừa phải thôi nhé!'],
    ['berry_bowl', 'Tô quả mọng', 'bowl', '#ff5a6e', '#5a6ee0', 70, 220, 'farming', 5, [{ id: 'strawberry', n: 2 }, { id: 'blueberry', n: 1 }],
      { kind: 'farm', hours: 4, gold: 0.15 }, 'Quả mọng nhiều vitamin C và chất chống oxy hóa; ăn tươi là ngon nhất.'],
    ['harvest_feast', 'Bữa tiệc mùa gặt', 'bowl', '#e0a458', '#79c75a', 90, 320, 'farming', 6, [{ id: 'potato', n: 1 }, { id: 'corn', n: 1 }, { cat: 'fish', n: 1 }],
      { kind: 'speed', hours: 5, v: 1.25 }, 'Một bữa đủ nhóm chất: tinh bột, rau củ và đạm từ cá.']
  ];

  var recipes = [], byId = {};
  ROWS.forEach(function (r) {
    Items.define({ id: r[0], name: r[1], cat: 'food', icon: { tpl: r[2], c1: r[3], c2: r[4] }, price: r[6], energy: r[5], buff: r[10], tip: r[11] });
    var rec = { id: r[0], name: r[1], skill: r[7], lvl: r[8], ing: r[9], tip: r[11], energy: r[5], buff: r[10] };
    recipes.push(rec); byId[rec.id] = rec;
  });

  G.CookData = { recipes: recipes, get: function (id) { return byId[id] || null; } };
})();
