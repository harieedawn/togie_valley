/* Togie Valley - data_fish.js (Stage 9): fish species, junk, rods, bait. Load after data_shop.js (redefines fiber_rod + baits).
 * Game.FishData: species[], junk[], rods{}, rodOrder[], baits[], get(id), isFish(id), isRod(id), rodInfo(id)
 * Species fields: id,name,price,tier(normal|silver|gold),zones('s'|'m'|'d' chars),seasons[],h:[from,to] (clock 6..26),weather(null|['rain'..]),
 *   diff 1-5, beh mixed|smooth|dart|sinker|floater, bait (preferred), lvl (min fishing level), lk (rain 'r', dawn/dusk 'd', cold 'c'), legend
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Items) { console.error('[data_fish] items.js missing'); return; }
  var Items = G.Items;
  var SP = 'spring', SU = 'summer', AU = 'autumn', WI = 'winter', ALL = [SP, SU, AU, WI];
  var DAY = [6, 26];

  /* id, name, price, tier, zones, seasons, hours, weather, diff, beh, bait, lvl, lk, v, c1, c2, c3, tip. tier: normal | silver | gold (fixed per species) */
  var RAW = [
    ['sarat', 'Cá sặc rằn', 30, 'normal', 's', ALL, DAY, null, 1, 'smooth', 'dough', 1, '', 'flat', '#d9b45a', '#f6e8b0', '#7a5a2a', 'Cá sặc rằn có vằn chéo như áo rằn ri, thích ao ruộng nước nông. Người miền Tây hay phơi khô hoặc làm mắm.'],
    ['linh', 'Cá linh', 35, 'normal', 'sm', [SU, AU], [6, 18], null, 1, 'smooth', 'dough', 1, 'd', 'slim', '#cfdde8', '#f7fbff', '#7f9db4', 'Cá linh theo con nước nổi về miền Tây mỗi mùa lũ. Nhỏ xíu nhưng nấu canh chua thì hết ý.'],
    ['keo', 'Cá kèo', 45, 'normal', 's', [SP, SU, AU], [6, 12], null, 1, 'dart', 'worm', 1, 'd', 'slim', '#b9a67a', '#efe6c8', '#7a6a44', 'Cá kèo ưa bãi bùn ven sông, nước rút là nhảy lách tách. Kho tiêu ăn với cơm nóng rất đưa cơm.'],
    ['perch', 'Cá rô đồng', 40, 'normal', 's', [SP, SU, AU], DAY, null, 1, 'smooth', 'worm', 1, 'r', 'round', '#8fa65a', '#ecdc8a', '#55702f', 'Cá rô đồng biết bò ngược mưa lên ruộng, vì thế mưa xuống là chúng nổi đầu. Kho tộ hay nướng trui đều ngon.'],
    ['tilapia', 'Cá diêu hồng', 75, 'normal', 'sm', ALL, [7, 19], null, 2, 'mixed', 'dough', 1, '', 'round', '#f08a7a', '#fff0e8', '#d4574c', 'Cá diêu hồng đỏ hồng như đang ngượng, nuôi bè khắp miền Tây. Hấp gừng ăn thơm lắm.'],
    ['catfish', 'Cá trê', 60, 'normal', 'md', [SU, AU], [18, 26], null, 2, 'sinker', 'worm', 2, 'r', 'slim', '#6f6a58', '#d8cdb4', '#4a4636', 'Cá trê chui bùn, râu dài như đang dò đường. Đêm mưa chúng hoạt động mạnh nhất.'],
    ['thatlat', 'Cá thác lác', 55, 'normal', 'sm', ALL, DAY, null, 2, 'smooth', 'worm', 2, '', 'flat', '#9aa8a0', '#e6ece4', '#5f6e66', 'Cá thác lác có dải vây dài như lụa. Thịt dai ngọt, làm chả cá thác lác nổi tiếng.'],
    ['carp', 'Cá chép', 70, 'normal', 'm', [SP, SU, AU], [6, 22], null, 2, 'mixed', 'dough', 2, '', 'round', '#c98a4a', '#f0d09a', '#8a5a28', 'Cá chép nếm vị bằng râu quanh miệng. Ngày ông Công ông Táo, người ta thả cá chép để tiễn ông về trời.'],
    ['snakehead', 'Cá lóc', 150, 'silver', 'm', ALL, [6, 22], null, 3, 'dart', 'minnow', 3, 'd', 'slim', '#6a6a4a', '#d6cfa0', '#3e3e28', 'Cá lóc đồng nằm phục rồi phóng nhanh như tên. Nướng trui chấm mắm me là nhất.'],
    ['eel', 'Lươn đồng', 140, 'silver', 'sm', [SU, AU], [18, 26], null, 3, 'dart', 'worm', 3, 'r', 'slim', '#a88a3a', '#efe0a0', '#6a5420', 'Lươn chui hang bùn, đêm mưa mới thò ra. Lươn um chuối đậu là món quen của miền Tây.'],
    ['tra', 'Cá tra', 170, 'silver', 'd', [SU, AU], DAY, null, 3, 'sinker', 'dough', 4, '', 'slim', '#9aa8b4', '#eef2f4', '#5f6e7c', 'Cá tra nuôi nhiều ở Cần Thơ, An Giang. Thịt trắng, ít xương, đi khắp thế giới.'],
    ['bongtuong', 'Cá bống tượng', 380, 'gold', 'md', [SP, SU, AU], [18, 26], null, 4, 'sinker', 'worm', 5, 'r', 'round', '#8a6a48', '#d8c4a0', '#4a3a28', 'Cá bống tượng nằm im trong hang, đầu to mắt tròn trông rất hiền. Kho tộ là món đắt khách.'],
    ['lang', 'Cá lăng', 450, 'gold', 'd', [SU, AU], [19, 26], null, 5, 'mixed', 'minnow', 7, 'r', 'slim', '#d8a23a', '#f6e6a8', '#7a5a1a', 'Cá lăng sống ở khúc sông sâu, thân vàng đốm đen. Người ta xem là cá quý của dòng Mê Kông.'],
    ['koi', 'Cá koi', 550, 'gold', 'm', [SP, SU], [8, 18], ['sun'], 4, 'smooth', 'dough', 6, '', 'round', '#fff3e4', '#fffaf0', '#ee5a2a', 'Koi là cá chép được lai tạo về màu sắc, nhiều nơi xem là biểu tượng may mắn và hay nuôi trong hồ cảnh.']
  ];

  /* Stage 16 D1: removed Stage 9 ids -> closest new species (applied to every save section, idempotent). */
  var LEGACY = {
    stickleback: 'sarat', sunfish: 'tilapia', bluegill: 'tilapia', roach: 'linh', crucian: 'sarat', rudd: 'linh', smelt: 'linh', goldfish: 'koi',
    whitefish: 'thatlat', bream: 'thatlat', tench: 'catfish', trout: 'snakehead', grayling: 'keo', rainbow: 'tilapia', mirror: 'carp',
    zander: 'snakehead', pike: 'snakehead', burbot: 'tra', goldtench: 'koi', sturgeon: 'lang', moonscale: 'lang'
  };
  function mergeRec(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
    if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return a === undefined ? b : a;
    for (var k in b) a[k] = k === 'n' ? (a.n || 0) + (b.n || 0) : mergeRec(a[k], b[k]);
    return a;
  }
  function walk(o, dep) {
    var k, v, i;
    if (!o || typeof o !== 'object' || dep > 9) return;
    if (Array.isArray(o)) { for (i = 0; i < o.length; i++) { if (typeof o[i] === 'string' && LEGACY[o[i]]) o[i] = LEGACY[o[i]]; else walk(o[i], dep + 1); } return; }
    for (k in LEGACY) if (Object.prototype.hasOwnProperty.call(o, k)) { o[LEGACY[k]] = mergeRec(o[LEGACY[k]], o[k]); delete o[k]; }
    for (k in o) { v = o[k]; if (k === 'id' && typeof v === 'string' && LEGACY[v]) o[k] = LEGACY[v]; else walk(v, dep + 1); }
  }

  var species = [], byId = Object.create(null);
  RAW.forEach(function (r) {
    var d = {
      id: r[0], name: r[1], price: r[2], tier: r[3], zones: r[4], seasons: r[5], h: r[6], weather: r[7], diff: r[8], beh: r[9], bait: r[10],
      lvl: r[11], lk: r[12], legend: false
    };
    species.push(d); byId[d.id] = d;
    Items.define({
      id: d.id, name: d.name, cat: 'fish', price: d.price, tier: d.tier, icon: { tpl: 'fish', v: r[13], sp: d.id, c1: r[14], c2: r[15], c3: r[16] }, tip: r[17],
      fish: 1, zones: d.zones, seasons: d.seasons, hours: d.h, weather: d.weather, diff: d.diff, beh: d.beh, bait: d.bait, minLvl: d.lvl, legendary: false
    });
  });

  var junk = [
    { id: 'old_boot', name: 'Chiếc ủng cũ', price: 1, icon: { tpl: 'boot', c1: '#8a6a4a', c2: '#c9a070' }, tip: 'Ai làm rơi ủng rồi! Bỏ vào thùng để tái chế nhé.' },
    { id: 'driftwood', name: 'Gỗ trôi', price: 3, icon: { tpl: 'driftwood', c1: '#c9a070', c2: '#a8804a' }, tip: 'Gỗ trôi là nhà và bóng mát cho những sinh vật nhỏ dưới nước.' },
    { id: 'soggy_news', name: 'Tờ báo ướt', price: 2, icon: { tpl: 'bag', c1: '#e8e0d0', c2: '#9aa0a8' }, tip: 'Tin cũ rồi! Giấy tan trong nước, nhưng mực thì không tốt cho cá.' },
    { id: 'plastic_bag', name: 'Túi ni lông', price: 5, icon: { tpl: 'bag', c1: '#bfe3f0', c2: '#ffffff' }, tip: 'Giữ hồ sạch nhé: ni lông không tự mất đi và cá có thể nuốt phải.' }
  ];
  junk.forEach(function (j) { Items.define({ id: j.id, name: j.name, cat: 'junk', price: j.price, icon: j.icon, tip: j.tip, junk: 1 }); });

  /* Rods: bar = catch bar height (fraction of the track), win = extra bite window seconds, bait = has a bait slot. */
  var rods = {
    bamboo_pole: { lvl: 1, bar: 0.24, win: 0, bait: false },
    fiber_rod: { lvl: 2, bar: 0.28, win: 0, bait: true },
    carbon_rod: { lvl: 6, bar: 0.36, win: 0.4, bait: true },
    master_rod: { lvl: 9, bar: 0.42, win: 0.6, bait: true }
  };
  var rodOrder = ['bamboo_pole', 'fiber_rod', 'carbon_rod', 'master_rod'];

  var bam = Items.get('bamboo_pole');
  if (bam) { bam.rod = rods.bamboo_pole; bam.tip = bam.tip || 'Kiên nhẫn cũng là một phần của câu cá.'; }
  Items.define({
    id: 'fiber_rod', name: 'Cần câu sợi thủy tinh', cat: 'tool', icon: { tpl: 'rod', c1: '#6bb6ee', c2: '#f2c76c' }, energy: 2, buyPrice: 900, rod: rods.fiber_rod,
    tip: 'Sợi thủy tinh uốn cong mà không gãy, lại có chỗ gắn mồi để chọn loài cá.'
  });
  Items.define({
    id: 'carbon_rod', name: 'Cần câu carbon', cat: 'tool', icon: { tpl: 'rod', c1: '#4a5560', c2: '#9fd3ee' }, energy: 2, buyPrice: 2500, rod: rods.carbon_rod,
    tip: 'Sợi carbon nhẹ và cứng, bạn cảm nhận từng cú rỉa mồi và có thêm thời gian phản ứng.'
  });
  Items.define({
    id: 'master_rod', name: 'Cần câu bậc thầy', cat: 'tool', icon: { tpl: 'rod', c1: '#ffc54d', c2: '#a47be0' }, energy: 2, buyPrice: 6000, rod: rods.master_rod,
    tip: 'Cần thủ bậc thầy đọc được dòng nước: thanh bắt cá rộng nhất và thời gian cá cắn lâu nhất.'
  });

  /* Baits (redefine the Stage 8 ones with the design prices; Minnow is new). */
  Items.define({ id: 'worm_bait', name: 'Mồi giun', cat: 'bait', icon: { tpl: 'bait', c1: '#e8715d', c2: '#c9945a', v: 'worm' }, price: 3, buyPrice: 5, bait: 'worm',
    tip: 'Giun ngoe nguẩy thu hút cá ăn đáy như cá vền, cá tinca và cá trê.' });
  Items.define({ id: 'dough_bait', name: 'Mồi bột', cat: 'bait', icon: { tpl: 'bait', c1: '#f6d9a0', c2: '#e0a458', v: 'dough' }, price: 7, buyPrice: 15, bait: 'dough',
    tip: 'Bột mềm có mùi rất nồng trong nước. Cá chép và cá vàng mê lắm.' });
  Items.define({ id: 'minnow_bait', name: 'Mồi cá nhỏ', cat: 'bait', icon: { tpl: 'bait', c1: '#bcd5e6', c2: '#f4f7fa', v: 'minnow' }, price: 10, buyPrice: 20, bait: 'minnow',
    tip: 'Cá săn mồi như cá chó, cá rô và cá hồi thích ăn cá nhỏ, nên mồi này rất hấp dẫn.' });

  G.FishData = {
    species: species, legacy: LEGACY, migrateSave: function (o) { walk(o, 0); return o; }, junk: junk, rods: rods, rodOrder: rodOrder, baits: ['worm_bait', 'dough_bait', 'minnow_bait'],
    get: function (id) { return byId[id] || null; },
    isFish: function (id) { return !!byId[id]; },
    isRod: function (id) { return !!rods[id]; },
    rodInfo: function (id) { return rods[id] || null; }
  };
})();
