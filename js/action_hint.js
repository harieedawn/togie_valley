/* Togie Valley - action_hint.js (Stage 10.5): icons + automatic context hints for the Action button (#tv-action).
 * Fills UI.actionIcons (mitten hand, door, chest, bed, talk, harvest) and calls UI.setActionHint every ~120 ms from the
 * fishing state / Interact.resolve() of the facing tile. No 3D, no draw calls. Depends on ui.js, interact.js, state.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.UI.setActionHint || !G.Interact || !G.Player || !G.Inventory) { console.error('[action_hint] missing deps'); return; }
  var UI = G.UI, P = G.Player, I = G.Interact, Inv = G.Inventory, Items = G.Items, INK = '#5b3a29';
  function svg(inner) { return '<svg class="tvi" viewBox="0 0 64 64" width="44" height="44" fill="none" stroke="' + INK + '" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round">' + inner + '</svg>'; }
  UI.actionIcons = {
    // chunky mitten: big rounded palm, separate thumb, thick ink, cheek-blush highlight
    hand: svg('<path d="M20 30Q8 28 9 20Q11 13 19 17L26 26" fill="#ffd0a3"/><path d="M19 26Q19 8 32 8Q45 8 45 26L47 40Q47 56 32 56Q17 56 18 40Z" fill="#ffd9b0"/><path d="M26 20Q32 16 38 20" stroke="#fff6e6" stroke-width="3.4"/><path d="M24 41H40" stroke="#e7a26f" stroke-width="3.4"/>'),
    door: svg('<path d="M14 58V14Q14 8 20 8H44Q50 8 50 14V58Z" fill="#c98a52"/><path d="M21 16H43V58H21Z" fill="#e8b878"/><circle cx="38" cy="38" r="3" fill="#ffd23f"/>'),
    chest: svg('<path d="M9 28Q9 12 32 12Q55 12 55 28Z" fill="#c98a52"/><rect x="9" y="28" width="46" height="26" rx="4" fill="#e0a458"/><rect x="27" y="26" width="10" height="12" rx="3" fill="#ffd23f"/>'),
    bed: svg('<rect x="8" y="30" width="48" height="16" rx="4" fill="#e8715d"/><rect x="8" y="18" width="14" height="28" rx="4" fill="#c98a52"/><rect x="24" y="22" width="14" height="9" rx="4" fill="#fff4d9"/><path d="M8 46V54M56 46V54"/>'),
    talk: svg('<path d="M10 14Q10 8 16 8H48Q54 8 54 14V36Q54 42 48 42H30L18 54V42H16Q10 42 10 36Z" fill="#fff4d9"/><circle cx="23" cy="25" r="2.6" fill="' + INK + '" stroke="none"/><circle cx="32" cy="25" r="2.6" fill="' + INK + '" stroke="none"/><circle cx="41" cy="25" r="2.6" fill="' + INK + '" stroke="none"/>'),
    harvest: svg('<path d="M14 26H50L47 54Q47 58 43 58H21Q17 58 17 54Z" fill="#e0a458"/><path d="M20 26Q22 8 32 8Q42 8 44 26" /><path d="M22 36H42M23 46H41" stroke="#b57a42" stroke-width="3.2"/>')
  };

  var SPOT = { bed: ['bed', 'Ngủ', 'use'], chest: ['chest', 'Mở', 'use'], kitchen: ['hand', 'Mở', 'use'], door: ['door', 'Ra ngoài', 'use'] };
  var TYPE = { door: ['door', 'Vào', 'use'], bin: ['chest', 'Mở', 'use'], shop: ['talk', 'Nói chuyện', 'use'], workshop: ['talk', 'Nói chuyện', 'use'], fishstall: ['talk', 'Nói chuyện', 'use'], seat: ['bamboo_pole', 'Câu', 'fish'] };
  function farmHint(t) {
    var s = Inv.selected(), id = s && s.id;
    switch (t.kind) {
      case 'till': return { icon: 'hoe', label: 'Cuốc', tone: 'farm' };
      case 'pour': return { icon: 'watering_can', label: 'Tưới', tone: 'farm' };
      case 'refill': case 'well': return { icon: 'watering_can', label: 'Múc nước', tone: 'farm' };
      case 'plant': return { icon: id, label: 'Gieo', tone: 'farm' };
      case 'harvest': return { icon: 'harvest', label: 'Thu hoạch', tone: 'farm' };
      case 'fert': return { icon: id, label: 'Bón', tone: 'farm' };
      case 'sprinkler': return { icon: id, label: 'Đặt', tone: 'farm' };
      default: return null;   // hint/locked: nothing useful to do
    }
  }
  function fishHint() {
    var F = G.Fishing, st = F && F.state;
    if (!st || st === 'off') return null;
    var rod = F.view && F.view.rodId || 'bamboo_pole';
    if (st === 'idle') return { icon: rod, label: 'Quăng', tone: 'fish' };
    if (st === 'charge') return { icon: rod, label: 'Thả ra', tone: 'fish' };
    if (st === 'bite') return { icon: rod, label: 'Giật!', tone: 'fish' };
    if (st === 'reel') return { icon: rod, label: 'Kéo', tone: 'fish' };
    if (st === 'wait') return { icon: rod, label: 'Thu dây', tone: 'fish' };
    return { icon: rod, label: 'Câu', tone: 'fish', target: false };
  }
  function resolveHint() {
    if (P.isLocked() && !(G.Fishing && G.Fishing.state !== 'off')) return null;
    var h = fishHint();
    if (h) return h;
    var f = P.frontTile(), res = I.resolve(f.tx, f.tz);
    if (!res) { var t = P.tile(); res = I.resolve(t.tx, t.tz); }
    if (!res) return null;
    var id = res.handler.id, tg = res.target, x;
    if (id === 'farm') return farmHint(tg);
    if (id === 'house-spots') { x = SPOT[tg.spot]; return x ? { icon: x[0], label: x[1], tone: x[2] } : null; }
    x = TYPE[tg && tg.type];
    return x ? { icon: x[0], label: x[1], tone: x[2] } : null;
  }
  var acc = 0;
  G.Loop.onFrame(function (dt) {
    acc += dt; if (acc < 0.12) return; acc = 0;
    var h = null;
    try { h = resolveHint(); } catch (e) { h = null; }
    if (h) UI.setActionHint(h);   // no hint -> ui.js falls back to the selected item
  }, 30);
})();
