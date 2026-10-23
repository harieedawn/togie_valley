/* Togie Valley - data_shop.js (Stage 8): economy items + shop catalog + NPC lines. Load after data_crops.js.
 * Game.ShopData: rows(tab, season), buyPrice(def), TOOL_UP, LINES, TABS
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Items || !G.Crops) { console.error('[data_shop] items.js / data_crops.js missing'); return; }
  var Items = G.Items;
  var COIN = { tpl: 'coin', c1: '#ffc54d', c2: '#d6922a' };

  function def(id, name, cat, icon, extra, tip) {
    var d = { id: id, name: name, cat: cat, icon: icon, tip: tip };
    for (var k in extra) d[k] = extra[k];
    Items.define(d);
  }
  def('rice_ball', 'Cơm nắm', 'food', { tpl: 'bowl', c1: '#e8715d', c2: '#fff4d9' }, { price: 20, buyPrice: 45, energy: 40 }, 'Lúa mọc trong ruộng ngập nước, giúp cỏ dại ít đi và rễ luôn ẩm.');
  def('veggie_soup', 'Canh rau củ', 'food', { tpl: 'bowl', c1: '#6bb6ee', c2: '#79c75a' }, { price: 40, buyPrice: 90, energy: 70 }, 'Hầm rau củ đưa vitamin vào nước canh, nên nhớ húp hết nhé!');
  def('sprinkler', 'Vòi phun nước', 'tool', { tpl: 'can', c1: '#9fd3ee', c2: '#a9bdd0' }, { stack: 20, sprinkler: 1, buyPrice: 300 }, 'Mỗi sáng tưới các ô xung quanh. Đặt lên một ô đất đã cuốc còn trống.');
  [400, 900, 1800, 3500].forEach(function (p, i) {
    def('permit_' + (i + 1), 'Giấy phép đất ' + ['I', 'II', 'III', 'IV'][i], 'key', COIN, { buyPrice: p }, 'Tờ giấy cho phép bạn canh tác thêm một mảnh thung lũng.');
  });
  def('pack_24', 'Ba lô lớn', 'key', { tpl: 'bag', c1: '#c9945a', c2: '#ffc54d' }, { buyPrice: 2000 }, 'Nhiều ngăn hơn thì đỡ đi lại. 24 ô.');
  def('pack_36', 'Ba lô khổng lồ', 'key', { tpl: 'bag', c1: '#79c75a', c2: '#ffc54d' }, { buyPrice: 6000 }, 'Còn nhiều ngăn hơn nữa. 36 ô.');
  def('worm_bait', 'Mồi giun', 'bait', { tpl: 'bait', c1: '#e8715d', c2: '#c9945a', v: 'worm' }, { price: 3, buyPrice: 8 }, 'Giun ngoe nguẩy, báo cho cá biết gần đây có món ngon.');
  def('dough_bait', 'Mồi bột', 'bait', { tpl: 'bait', c1: '#f6d9a0', c2: '#e0a458', v: 'dough' }, { price: 5, buyPrice: 12 }, 'Bột mềm có mùi nồng trong nước, cá ở xa cũng tìm thấy.');
  def('fiber_rod', 'Cần câu sợi thủy tinh', 'tool', { tpl: 'rod', c1: '#6bb6ee', c2: '#f2c76c' }, { energy: 2, buyPrice: 400 }, 'Sợi thủy tinh uốn cong mà không gãy, rất hữu ích khi cá lớn kéo.');

  function seedLvl(p) { return p <= 50 ? 1 : p <= 75 ? 2 : p <= 100 ? 3 : p <= 150 ? 4 : 5; }
  function buyPrice(d) { return d.buyPrice || d.price * 2; }
  function item(id, lvl, skill) { var d = Items.get(id); return { kind: 'item', id: id, price: buyPrice(d), lvl: lvl || 1, skill: skill || 'farming' }; }

  var PERMITS = [400, 900, 1800, 3500];
  var D = G.ShopData = {
    TABS: [['seeds', 'Hạt giống'], ['supplies', 'Vật tư'], ['food', 'Đồ ăn'], ['farm', 'Nông trại']],
    TOOL_UP: { ids: ['hoe', 'watering_can'], cost: [500, 1500, 4000], lvl: [2, 4, 7] },
    buyPrice: buyPrice,
    rows: function (tab, season) {
      var out = [];
      if (tab === 'seeds') {
        G.Crops.list.forEach(function (c) { var s = Items.get(c.seed); if (s && c.seasons.indexOf(season) >= 0) out.push(item(c.seed, seedLvl(c.seedPrice))); });
        out.sort(function (a, b) { return a.lvl - b.lvl || a.price - b.price; });
      } else if (tab === 'supplies') {
        ['compost', 'leaf_feed', 'bloom_feed', 'root_feed'].forEach(function (id) { out.push(item(id, 1)); });
        out.push(item('sprinkler', 3));
      } else if (tab === 'food') {
        out.push(item('bread', 1), item('rice_ball', 2), item('veggie_soup', 3));
      } else if (tab === 'farm') {
        PERMITS.forEach(function (p, i) { out.push({ kind: 'permit', id: 'permit_' + (i + 1), idx: i + 1, price: p, lvl: 1, skill: 'farming' }); });
        out.push({ kind: 'pack', id: 'pack_24', size: 24, price: 2000, lvl: 1, skill: 'farming' }, { kind: 'pack', id: 'pack_36', size: 36, price: 6000, lvl: 1, skill: 'farming' });
      } else if (tab === 'fish') {
        out.push(item('worm_bait', 1, 'fishing'), item('dough_bait', 1, 'fishing'), item('minnow_bait', 1, 'fishing'), item('fiber_rod', 2, 'fishing'), item('carbon_rod', 6, 'fishing'), item('master_rod', 9, 'fishing'));
      }
      return out;
    },
    LINES: {
      shop: {
        greet: ['Ô, bạn ghé chơi đó hả? Vào đi vào đi!', 'Chào buổi mới nha! Hôm nay bạn cần gì nào?', 'Ơ kìa, khách quen của tiệm đây rồi!', 'Vào xem hàng đi bạn, tiệm mới về đồ xinh lắm đó.'],
        spring: ['Xuân về rồi nè! Củ cải vàng với khoai tây có hàng đó, gieo sớm nha.', 'Mầm non nhú khắp nơi luôn. Nhớ tưới đều mỗi ngày nghen!', 'Đất xuân mềm lắm, gieo hạt xuống là cây mừng liền.'],
        summer: ['Nắng gắt quá trời! Tưới cây buổi sáng sớm nha, kẻo nắng hút hết nước.', 'Cây mùa hạ lớn nhanh lắm mà cũng khát nước lắm đó.', 'Hè rồi, nhớ uống nước với đội nón nha. Bạn cũng cần nghỉ chứ!'],
        autumn: ['Mùa thu hoạch tới rồi! Bí ngô với ngũ cốc nhìn mê ghê.', 'Gió mát, lá vàng thiệt đẹp. Trồng loại mau chín trước khi đông về nha.', 'Thu là mùa bội thu đó. Thùng bán đồ chắc đầy lắm nhỉ?'],
        winter: ['Hu, lạnh run luôn. Ngoài trời giờ khó trồng lắm, nghỉ ngơi lên kế hoạch đi nha.', 'Đông là lúc dành dụm cho xuân sau đó bạn.', 'Trời lạnh vậy, ăn bát súp nóng là hết sảy luôn!'],
        rain: ['Mưa rồi nè! Cây được uống nước miễn phí, bạn khỏi phải tưới đó.', 'Trời mưa, nghỉ tay chút đi. Ruộng có mưa lo rồi.', 'Mưa rả rích vậy, tiệm vắng khách mà tui vui ghê.'],
        snow: ['Tuyết rơi rồi! Giữ ấm nha, ăn món gì nóng nóng đi.', 'Ngoài kia tuyết trắng xóa luôn. Đừng đứng ngoài lâu kẻo cảm đó.'],
        night: ['Khuya rồi mà bạn còn thức hả? Nhớ ngủ sớm kẻo mai mệt nha.', 'Tối rồi, tui sắp đóng cửa. Bạn về nghỉ đi nè.'],
        dawn: ['Sớm vậy luôn! Bạn dậy sớm hơn cả gà nhà tui.', 'Sáng bảnh mắt đã ra đồng, giỏi quá trời.'],
        skilled: ['Nghe nói ruộng bạn lên xanh mướt hết rồi. Giỏi nha!', 'Tay nghề làm nông của bạn khá lắm rồi đó.'],
        tips: ['Phân bón có ba món chính: N cho lá, P cho quả, K cho củ rễ đó.', 'Luân canh giúp đất khỏe: đừng trồng mãi một loại cây nha.', 'Cây họ đậu trả đạm lại cho đất. Thông minh ghê hen!', 'Vòi phun nước đỡ tốn sức, mà sức thì quý lắm đó.', 'Bỏ nông sản vào thùng bán đồ cạnh nhà, sáng mai bạn nhận tiền liền.', 'Nông sản sao vàng bán được giá hơn. Đất khỏe thì cây mới ngon.']
      },
      fish: {
        greet: ['Ờ, tới đó hả. Ngồi chơi đi, không vội đâu.', 'Chào nha. Hôm nay sông hiền lắm.', 'À, người quen. Có cá khoe bác không đó?', 'Lại đây lại đây, uống miếng nước đã.'],
        spring: ['Xuân này cá đói sau mùa lạnh, thả câu là hợp lắm.', 'Nước sông mùa này trong với mát, cá thích lắm.', 'Xuân tới, cá nổi nhiều. Câu cái là có liền.'],
        summer: ['Nóng quá cá trốn vô bóng râm hết. Thử câu gần cọc cầu tàu coi.', 'Trưa nắng cá lặn sâu lắm, đợi chiều mát hẵng câu.', 'Hè hả? Ngồi chỗ có bóng cây mà câu, khỏi cháy da.'],
        autumn: ['Cá thu béo núc, câu về ăn đã đời luôn.', 'Lá rụng làm sóng gợn lăn tăn, cá khoái lắm đó.', 'Thu mát trời, ngồi câu cả ngày cũng không chán.'],
        winter: ['Nước lạnh cá lừ đừ, cắn câu ít lắm. Kiên nhẫn nghen.', 'Câu đông phải biết chờ. Mang theo đồ ăn vặt đi.', 'Lạnh vậy mà còn ra sông, bạn cũng gan ghê.'],
        rain: ['Mưa khuấy nước, cá nổi lên kiếm ăn đó. Ngày đẹp để câu luôn!', 'Mưa nhẹ là cá cắn nhiều. Khoác áo mưa rồi ra đi.', 'Nghe tiếng mưa trên mặt nước chưa? Cá nghe còn mê hơn.'],
        snow: ['Tuyết rơi sông yên ắng, mà cá vẫn còn đó nha.', 'Trời tuyết, ngồi im im thôi. Cá cũng đang ngủ gà ngủ gật.'],
        night: ['Khuya rồi mà còn câu hả? Mấy con cá lớn thích đêm lắm đó.', 'Đêm yên, nước phẳng. Bác thích giờ này nhất.'],
        dawn: ['Sáng sớm là giờ vàng của cá đó. Ra sớm là đúng bài.', 'Mới tờ mờ sáng mà bạn tới rồi. Giống bác hồi xưa ghê.'],
        skilled: ['Tay câu bạn lên nhiều rồi đó, bác nhìn là biết.', 'Câu giỏi vậy, bác phải nhờ bạn chỉ lại mới được.'],
        tips: ['Cá bỏ vô thùng nha, sáng mai bác trả tiền liền.', 'Mỗi loại mồi dụ một loại cá khác nhau đó.', 'Cá cần nước sạch, đừng xả rác xuống sông nghen.', 'Cần tốt kéo cá dễ hơn, mà kiên nhẫn vẫn là số một.', 'Trời mưa với lúc bình minh, hoàng hôn là cá hay cắn nhất.']
      },
      smith: {
        greet: ['Hừm. Có việc gì?', 'Tới rồi hả. Đưa đồ nghề đây coi.', 'Đừng đứng đó, vô đi. Lò đang nóng.', 'Ờ. Cuốc cùn hay bình méo? Đưa đây.'],
        spring: ['Xuân tới, đất mềm. Cuốc tốt là nửa mùa vụ đó.', 'Mùa này cuốc làm việc nhiều nhất. Để tôi mài cho bén.', 'Gieo hạt thì lo mà cuốc đất cho kỹ, đừng làm ẩu.'],
        summer: ['Nóng muốn chết, mà lò vẫn phải đỏ. Nghề mà.', 'Hè hả. Nhớ uống nước đi, đừng có cố quá.', 'Nắng thế này, cán cuốc gỗ dễ nứt. Coi chừng nghen.'],
        autumn: ['Thu rồi, đồ nghề nào cũng mòn sau cả mùa. Đem tôi sửa.', 'Gặt xong thì mang đồ tới. Tôi làm cho nó mới lại.', 'Gió thu thổi lò cháy ngon lắm. Làm việc đã tay.'],
        winter: ['Đông thì rảnh, đúng lúc nâng cấp đồ nghề đó.', 'Lạnh thế này, đứng cạnh lò là sướng nhất.', 'Mùa đông tôi rèn kỹ hơn. Có gì mang tới đi.'],
        rain: ['Mưa à. Ở đây khô ráo, vào đi.', 'Mưa vậy khỏi tưới. Tranh thủ nâng cấp đồ nghề đi.', 'Tiếng mưa trên mái tôn nghe cũng được.'],
        snow: ['Tuyết rồi. Lại gần lò mà sưởi đi, đừng ngại.', 'Lạnh cóng. Uống miếng trà nóng không? Thôi, chắc hết rồi.'],
        night: ['Khuya rồi còn mò tới. Ngủ đi, mai làm tiếp.', 'Giờ này người ta ngủ cả rồi, bạn ạ.'],
        dawn: ['Dậy sớm đó. Được, tôi thích người siêng năng.', 'Mặt trời chưa lên mà lò tôi lên rồi. Bạn cũng vậy hả.'],
        skilled: ['Tay cuốc của bạn có nghề rồi. Đồ tốt mới xứng với bạn.', 'Làm ruộng giỏi thì phải có đồ tốt. Để tôi lo.'],
        tips: ['Nâng cấp xong, hôm sau tới lấy. Rèn đồ thì không vội được.', 'Cuốc xịn cuốc được nhiều ô một lần, đỡ tốn sức lắm.', 'Bình tưới lớn chứa nhiều nước hơn, đỡ chạy ra giếng.', 'Đồ nghề tốt tốn ít sức hơn. Cứ tin tôi.', 'Muốn nâng cấp thì phải có tay nghề làm ruộng trước đã.']
      }
    }
  };
})();
