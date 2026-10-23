/* Togie Valley - data_crops.js (Stage 6)
 * Game.Crops: crop catalog (about 37 crops) + seed/crop item definitions. Load after house.js (it redefines parsnip/potato seeds).
 * Days follow DESIGN section 5: mature = max(2, ceil(StardewDays/2)), regrow = max(1, ceil(StardewRegrow/2)).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Items) { console.error('[crops] items.js missing'); return; }
  var Items = G.Items;

  var SEASONS = ['spring', 'summer', 'autumn', 'winter'], CODE = { sp: 'spring', su: 'summer', au: 'autumn', wi: 'winter' };
  // primary nutrient by class (legume feeds itself nitrogen, so its own need is phosphorus)
  var PRIMARY = { leaf: 'n', grain: 'n', fruit: 'p', flower: 'p', legume: 'p', root: 'k' };

  // [id, name, class, seasons, stardewDays, stardewRegrow, price, seedPrice, shape, c1, c2, extra, tip]
  var ROWS = [
    ['parsnip', 'Củ cải vàng', 'root', 'sp', 4, 0, 35, 20, 'longroot', '#f3e2b3', '#9acb6a', 0, 'Củ cải vàng ngọt hơn khi đất lạnh: cái lạnh khiến củ tích thêm đường.'],
    ['green_bean', 'Đậu cô ve', 'legume', 'sp', 10, 3, 40, 60, 'pod', '#79c75a', '#4f9a45', 0, 'Đậu hợp tác với vi khuẩn đất để bắt đạm từ không khí.'],
    ['cauliflower', 'Súp lơ', 'leaf', 'sp', 12, 0, 175, 80, 'leafy', '#f4f1df', '#8cc65a', 0, 'Một bông súp lơ là cả chùm nụ hoa nhỏ chưa kịp nở.'],
    ['potato', 'Khoai tây', 'root', 'sp', 6, 0, 80, 50, 'tuber', '#d9b27a', '#a9763f', 0, 'Khoai tây mọc từ củ có mắt chứ không phải từ hạt.'],
    ['kale', 'Cải xoăn', 'leaf', 'sp', 6, 0, 110, 70, 'leafy', '#4f9a5a', '#7fcf7a', 0, 'Cải xoăn yêu cái lạnh: sương giá biến bớt tinh bột thành đường.'],
    ['garlic', 'Tỏi', 'root', 'sp', 4, 0, 60, 40, 'bulb', '#f6efe0', '#cdbfa0', 0, 'Mỗi tép tỏi bạn trồng có thể mọc thành cả một củ mới.'],
    ['rhubarb', 'Đại hoàng', 'leaf', 'sp', 13, 0, 220, 100, 'leafy', '#e0566a', '#79c75a', 0, 'Chỉ cuống đại hoàng ăn được; lá to thì không an toàn đâu nhé.'],
    ['strawberry', 'Dâu tây', 'fruit', 'sp', 8, 4, 120, 100, 'berry', '#ff5a6e', '#79c75a', 0, 'Hạt nằm ở bên ngoài: mỗi chấm nhỏ là một quả bé xíu.'],
    ['blue_jazz', 'Hoa lam nhạc', 'flower', 'sp', 7, 0, 50, 30, 'flower', '#6aa8ff', '#ffe27a', 5, 'Hoa nuôi ong, ong nhiều thì vườn cho mùa bội thu.'],
    ['tulip', 'Hoa tulip', 'flower', 'sp', 6, 0, 30, 20, 'flower', '#ff7aa8', '#ffd166', 6, 'Tulip mọc từ củ cần một đợt lạnh mới chịu nở hoa.'],

    ['melon', 'Dưa lưới', 'fruit', 'su', 12, 0, 250, 80, 'gourd', '#9be07a', '#ff8a8a', 0, 'Dưa lưới chứa khoảng 90% nước, giải nhiệt mùa hạ tuyệt vời.'],
    ['tomato', 'Cà chua', 'fruit', 'su', 11, 4, 60, 50, 'fruit', '#ff5a4a', '#79c75a', 0, 'Cà chua là quả đúng nghĩa thực vật học: bên trong chứa hạt của cây.'],
    ['blueberry', 'Việt quất', 'fruit', 'su', 13, 4, 50, 80, 'berry', '#5a6ee0', '#8aa0ff', 3, 'Việt quất thích đất hơi chua, khác với đa số cây trong vườn.'],
    ['hot_pepper', 'Ớt cay', 'fruit', 'su', 5, 3, 40, 40, 'longfruit', '#ff5a3a', '#79c75a', 0, 'Chất capsaicin làm ớt cay; chim không thấy cay nên giúp phát tán hạt.'],
    ['wheat', 'Lúa mì', 'grain', 'su,au', 4, 0, 25, 10, 'wheat', '#e8c860', '#c9a23f', 0, 'Lúa mì là một loài cỏ! Hạt của nó được xay thành bột làm bánh mì.'],
    ['radish', 'Củ cải đỏ', 'root', 'su', 6, 0, 90, 40, 'roundroot', '#ff6a8a', '#f6efe0', 0, 'Củ cải đỏ nảy mầm chỉ trong vài ngày, hợp với người nôn nóng.'],
    ['red_cabbage', 'Bắp cải tím', 'leaf', 'su', 9, 0, 260, 100, 'leafy', '#a85ac0', '#d89ae0', 0, 'Nước bắp cải tím đổi màu theo độ chua, như một bài thử khoa học tự nhiên.'],
    ['starfruit', 'Khế', 'fruit', 'su', 13, 0, 750, 400, 'fruit', '#ffd23f', '#ff9f3f', 0, 'Cắt ngang quả khế sẽ được một ngôi sao năm cánh hoàn hảo.'],
    ['corn', 'Ngô', 'grain', 'su,au', 14, 4, 50, 150, 'corn', '#ffd84a', '#79c75a', 0, 'Mỗi sợi râu ngô nối với một hạt cần hạt phấn riêng của nó.'],
    ['poppy', 'Hoa anh túc', 'flower', 'su', 7, 0, 140, 100, 'flower', '#ff5a4a', '#3a2a2a', 4, 'Hạt hoa này ngủ trong đất cả chục năm, đất xới lên là lại nảy mầm.'],
    ['summer_spangle', 'Hoa hạ lấp lánh', 'flower', 'su', 8, 0, 90, 50, 'flower', '#ff9f5a', '#ffe27a', 8, 'Những đóa hoa to nở rộ gọi ong bướm từ rất xa.'],
    ['sunflower', 'Hướng dương', 'flower', 'su,au', 8, 0, 80, 200, 'flower', '#ffd23f', '#8c5a34', 10, 'Hướng dương non hướng theo mặt trời; cây lớn thì quay hẳn về phía đông.'],

    ['pumpkin', 'Bí ngô', 'fruit', 'au', 13, 0, 320, 100, 'gourd', '#ff9a3a', '#79c75a', 0, 'Bí ngô thật ra là quả mọng khổng lồ, dây bò dài cả mấy mét.'],
    ['eggplant', 'Cà tím', 'fruit', 'au', 5, 5, 60, 20, 'longfruit', '#7a4aa8', '#79c75a', 0, 'Cà tím là họ hàng của cà chua và khoai tây trong họ Cà.'],
    ['yam', 'Khoai mỡ', 'root', 'au', 10, 0, 160, 60, 'tuber', '#e0884a', '#a9582f', 0, 'Khoai mỡ cần mùa ấm dài để củ dưới đất kịp phình to.'],
    ['cranberry', 'Nam việt quất', 'fruit', 'au', 7, 5, 75, 240, 'berry', '#d83a4a', '#ff7a8a', 2, 'Quả có túi khí nhỏ nên nổi lềnh bềnh trên đầm lầy.'],
    ['artichoke', 'Atisô', 'leaf', 'au', 8, 0, 160, 30, 'leafy', '#8aa86a', '#b8cc8a', 0, 'Atisô là nụ hoa, được hái trước khi kịp nở.'],
    ['beet', 'Củ dền', 'root', 'au', 6, 0, 100, 20, 'roundroot', '#b0305a', '#79c75a', 0, 'Củ dền nhuộm mọi thứ thành màu hồng nhờ sắc tố betalain.'],
    ['bok_choy', 'Cải thìa', 'leaf', 'au', 4, 0, 80, 50, 'leafy', '#b8e07a', '#f6efe0', 0, 'Cải thìa lớn nhanh, thích trời mát và giòn suốt mùa thu.'],
    ['amaranth', 'Rau dền', 'leaf', 'au', 7, 0, 150, 70, 'leafy', '#c0305a', '#ff7aa0', 0, 'Lá và hạt rau dền đã là lương thực từ trước cả lúa mì.'],
    ['grape', 'Nho', 'fruit', 'au', 10, 3, 80, 60, 'grape', '#8a4ac0', '#b88ae0', 0, 'Dây nho leo bằng cách quấn những tua cuốn nhỏ quanh mọi thứ.'],
    ['fairy_rose', 'Hồng tiên', 'flower', 'au', 12, 0, 290, 200, 'flower', '#ff9ac8', '#ffd2e8', 7, 'Hoa hồng được lai tạo cho thơm lẫn đẹp; trời mát giữ cánh hoa tươi lâu.'],

    ['spinach', 'Rau bina', 'leaf', 'wi', 4, 0, 45, 25, 'leafy', '#3f8f4a', '#79c75a', 0, 'Rau bina rất khỏe: đêm lạnh làm lá ngọt và dày hơn.'],
    ['leek', 'Tỏi tây', 'leaf', 'wi', 6, 0, 90, 40, 'longroot', '#e8f2c0', '#4f9a5a', 0, 'Người ta vun đất quanh tỏi tây để thân luôn trắng và mềm.'],
    ['brussels_sprouts', 'Cải bi', 'leaf', 'wi', 9, 0, 150, 60, 'leafy', '#79c75a', '#4f9a45', 0, 'Cải bi là những cải bắp tí hon mọc xoắn ốc quanh thân cao.'],
    ['carrot', 'Cà rốt', 'root', 'wi', 5, 0, 70, 30, 'longroot', '#ff9a3a', '#79c75a', 0, 'Ngày xưa cà rốt có màu tím hoặc trắng; màu cam mới được lai tạo sau.'],
    ['powdermelon', 'Dưa phấn', 'fruit', 'wi', 12, 0, 230, 80, 'gourd', '#cfeaff', '#ffffff', 0, 'Dưa phấn khoác lớp sương trắng giúp chống chịu cái rét mùa đông.']
  ];

  var crops = {}, list = [], bySeed = {};
  ROWS.forEach(function (r) {
    var seasons = r[3].split(',').map(function (c) { return CODE[c]; });
    var extra = r[11], isFlower = r[8] === 'flower';
    var c = {
      id: r[0], name: r[1], cls: r[2], seasons: seasons, days: Math.max(2, Math.ceil(r[4] / 2)),
      regrow: r[5] ? Math.max(1, Math.ceil(r[5] / 2)) : 0, price: r[6], seedPrice: r[7], shape: r[8], c1: r[9], c2: r[10],
      yield: !isFlower && extra ? extra : 1, petals: isFlower ? extra : 0, tip: r[12], seed: r[0] + '_seeds', primary: PRIMARY[r[2]]
    };
    crops[c.id] = c; list.push(c); bySeed[c.seed] = c.id;

    var icon = { tpl: c.shape, c1: c.c1, c2: c.c2 };
    if (c.petals) icon.n = c.petals;
    Items.define({ id: c.id, name: c.name, cat: 'crop', shape: c.shape, cls: c.cls, icon: icon, price: c.price, crop: c.id, tip: c.tip });

    var v = /long|pod|wheat|corn/.test(c.shape) ? 'long' : (c.shape === 'leafy' ? 'leaf' : 'round');
    var when = seasons.length === 4 ? 'mọi mùa' : seasons.map(function (x) { return G.VI.seasonLow[x]; }).join(' hoặc ');
    var seedTip = 'Gieo vào ' + when + '. Chín sau ' + c.days + ' ngày được tưới' + (c.regrow ? ', sau đó mọc lại.' : '.');
    Items.define({
      id: c.seed, name: 'Hạt giống ' + c.name, cat: 'seed', shape: c.shape, icon: { tpl: 'seed', c1: c.c1, c2: c.c2, v: v },
      price: Math.floor(c.seedPrice / 2), buyPrice: c.seedPrice, crop: c.id, seasons: seasons, tip: seedTip
    });
  });

  G.Crops = {
    SEASONS: SEASONS,
    list: list,
    get: function (id) { return crops[id] || null; },
    cropOfSeed: function (seedId) { return bySeed[seedId] || null; },
    daysToMature: function (id) { return crops[id] ? crops[id].days : 0; },
    regrowDays: function (id) { return crops[id] ? crops[id].regrow : 0; },
    primary: function (id) { return crops[id] ? crops[id].primary : 'n'; },
    inSeason: function (id, season) { return !!crops[id] && crops[id].seasons.indexOf(season) >= 0; }
  };
})();
