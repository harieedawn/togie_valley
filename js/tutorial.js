/* Togie Valley - tutorial.js (Stage 15C C1, art + layout rebuilt in Stage 16 A)
 * First-time tutorial carousel (5 hand-drawn inked-comic pages, animated inline SVG, mascot speech bubbles) + one-shot contextual hint bubbles.
 * API: Game.Tutorial { open(), close(), isOpen(), isDone(), hintSeen(id), resetHints(), renderRow(body, el, btn) }
 * Save key 'tutorial' (scope player): { done:0|1, seen:{soil,seeds,seat,bite,night} }. Event: tutorial:closed.
 * Depends on: ui.js, icons.js, save.js, time.js, player.js, scenes.js. Loads after camera_auto.js. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.Save || !G.Loop || !G.Player || !G.Time) { console.error('[tutorial] missing deps'); return; }
  var UI = G.UI, E = G.Events, Icons = G.Icons;
  var INK = '#5b3a29';
  var st = { done: false, seen: {} }, armed = false, pending = false, wait = 0, acc = 0;
  var root = null, hintEl = null, hintTimer = 0, want = {};

  function $(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function uiRoot() { return document.getElementById('ui') || document.body; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ------------------------------------------------ hand-drawn SVG kit (viewBox 320x200, ink outline, 3 flat tones + highlight) */
  var uid = 0, FONT = 'style="font-family:\'Baloo 2\',\'Google Sans\',sans-serif"';
  function hex(c) { return [1, 3, 5].map(function (i) { return parseInt(c.substr(i, 2), 16); }); }
  function shade(c, k) { var h = hex(c); return '#' + h.map(function (v) { v = Math.round(v * k); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rr(x, y, w, h, q) { q = Math.min(q, w / 2, h / 2); return 'M' + (x + q) + ' ' + y + 'H' + (x + w - q) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + q) + 'V' + (y + h - q) + 'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - q) + ' ' + (y + h) + 'H' + (x + q) + 'Q' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - q) + 'V' + (y + q) + 'Q' + x + ' ' + y + ' ' + (x + q) + ' ' + y + 'Z'; }
  function el(cx, cy, rx, ry) { return 'M' + (cx - rx) + ' ' + cy + 'a' + rx + ' ' + ry + ' 0 1 0 ' + 2 * rx + ' 0a' + rx + ' ' + ry + ' 0 1 0 ' + -2 * rx + ' 0Z'; }
  /* P: one inked shape = dark base, base-tone body shifted up-left (clipped), white highlight, outline */
  function P(d, c, o) {
    o = o || {};
    var id = 'tc' + (uid++), sw = o.sw || 3, k = o.k === undefined ? 3 : o.k, s;
    s = '<clipPath id="' + id + '"><path d="' + d + '"/></clipPath><path d="' + d + '" fill="' + shade(c, 0.8) + '"/>' +
      '<g clip-path="url(#' + id + ')"><path d="' + d + '" fill="' + c + '" transform="translate(' + -k + ' ' + -k + ')"/></g>';
    if (o.hi) s += '<ellipse cx="' + o.hi[0] + '" cy="' + o.hi[1] + '" rx="' + (o.hi[2] || 4) + '" ry="' + (o.hi[3] || 1.8) + '" transform="rotate(-35 ' + o.hi[0] + ' ' + o.hi[1] + ')" fill="#fff" stroke="none" opacity=".85"/>';
    return s + '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="' + sw + '"/>';
  }
  function T(x, y, s, size, fill, anchor) { return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" font-size="' + (size || 13) + '" font-weight="800" fill="' + (fill || INK) + '" stroke="none" ' + FONT + '>' + s + '</text>'; }
  function ln(d, w, c, extra) { return '<path d="' + d + '" fill="none" stroke="' + (c || INK) + '" stroke-width="' + (w || 3) + '"' + (extra || '') + '/>'; }
  /* S: framed scene. sky, hill and ground are flat bands; everything is clipped to the rounded frame */
  function S(inner, sky, hill, ground, hy) {
    var id = 'tf' + (uid++), h = hy || 128;
    return '<svg class="tu-svg" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" role="img" aria-hidden="true">' +
      '<clipPath id="' + id + '"><rect x="2" y="2" width="316" height="196" rx="20"/></clipPath><g clip-path="url(#' + id + ')">' +
      '<rect x="0" y="0" width="320" height="200" fill="' + sky + '" stroke="none"/>' +
      '<path d="M0 ' + (h - 18) + 'Q70 ' + (h - 46) + ' 140 ' + (h - 20) + 'T320 ' + (h - 24) + 'V200H0Z" fill="' + hill + '" stroke="none"/>' +
      '<path d="M0 ' + h + 'Q80 ' + (h - 14) + ' 160 ' + (h - 2) + 'T320 ' + (h - 6) + 'V200H0Z" fill="' + ground + '"/>' +
      '<path d="M0 ' + (h + 34) + 'Q90 ' + (h + 22) + ' 170 ' + (h + 32) + 'T320 ' + (h + 26) + 'V200H0Z" fill="' + shade(ground, 0.9) + '" stroke="none"/>' + inner + '</g>' +
      '<rect x="2" y="2" width="316" height="196" rx="20" fill="none"/></svg>';
  }
  function cloud(x, y, s) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="#fff" stroke="none"><ellipse rx="26" ry="9"/><circle cx="-9" cy="-8" r="10"/><circle cx="8" cy="-12" r="13"/><ellipse cx="6" cy="3" rx="18" ry="4" fill="#e4f1f8"/></g>'; }
  function flower(x, y, c) { return '<g transform="translate(' + x + ' ' + y + ')" stroke-width="2">' + ln('M0 0V9', 2, '#4a8f37') + '<circle cx="-3.5" cy="-1" r="3" fill="' + c + '"/><circle cx="3.5" cy="-1" r="3" fill="' + c + '"/><circle cy="-4.5" r="3" fill="' + c + '"/><circle cy="2" r="3" fill="' + c + '"/><circle r="2.2" fill="#ffd23f"/></g>'; }
  function tree(x, y, s) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' + P(rr(-5, -26, 10, 28, 3), '#b57a42') + P(el(0, -44, 26, 22), '#86cc5f', { hi: [-10, -52, 6, 2.5] }) + P(el(10, -34, 12, 10), '#a9e083', { sw: 0, k: 0 }) + '</g>'; }
  function hero(x, y, s, cls) {   // same cute farmer as in game: straw hat, coral shirt, blue overalls, blush cheeks
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><ellipse cy="1" rx="17" ry="4.5" fill="#5b3a29" opacity=".2" stroke="none"/><g class="an ' + (cls || '') + '">' +
      P(rr(-9, -15, 7, 15, 3), '#6b83c9', { sw: 2.6, k: 2 }) + P(rr(2, -15, 7, 15, 3), '#6b83c9', { sw: 2.6, k: 2 }) +
      P(rr(-12, -37, 24, 26, 10), '#f08a6b', { sw: 2.8, hi: [-5, -30, 3.5, 1.6] }) + P(rr(-8, -26, 16, 14, 5), '#6b83c9', { sw: 0, k: 1 }) +
      P(el(0, -47, 12, 11.5), '#ffd9b8', { sw: 2.8, k: 2.5 }) + P('M-20 -50Q0 -42 20 -50Q17 -58 0 -58Q-17 -58 -20 -50Z', '#f4cf6a', { sw: 2.8, k: 2 }) + P('M-10 -54a10 10 0 0 1 20 0Z', '#f4cf6a', { sw: 2.8, k: 2, hi: [-4, -59, 3, 1.4] }) +
      '<circle cx="-4.5" cy="-46" r="1.9" fill="' + INK + '" stroke="none"/><circle cx="4.5" cy="-46" r="1.9" fill="' + INK + '" stroke="none"/><ellipse cx="-8" cy="-42" rx="2.6" ry="1.7" fill="#ff9d9d" stroke="none"/><ellipse cx="8" cy="-42" rx="2.6" ry="1.7" fill="#ff9d9d" stroke="none"/>' +
      '<path d="M-2.5 -42.5Q0 -40.5 2.5 -42.5" fill="none" stroke-width="1.6"/></g></g>';
  }
  function finger() { return P(rr(-5.5, -22, 11, 24, 5.5), '#ffd9b8', { sw: 2.6, k: 2 }) + P('M-13 -26Q-14 -50 0 -52Q14 -50 13 -26Q9 -21 5.5 -26H-5.5Q-9 -21 -13 -26Z', '#ffd9b8', { sw: 2.6, k: 2, hi: [-6, -42, 3, 1.5] }); }
  function sparkle(x, y, s, d) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><g class="an a-twk" style="animation-delay:' + (d || 0) + 's"><path d="M0 -8Q1.5 -1.5 8 0Q1.5 1.5 0 8Q-1.5 1.5 -8 0Q-1.5 -1.5 0 -8Z" fill="#ffe27a" stroke-width="2"/></g></g>'; }
  function face() {   // mascot avatar for the speech bubble
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#bfe6ff" stroke-width="3.5"/>' +
      P(el(32, 38, 17, 16), '#ffd9b8', { sw: 3, k: 3 }) + P('M8 34Q32 22 56 34Q52 14 32 14Q12 14 8 34Z', '#f4cf6a', { sw: 3, k: 3, hi: [22, 21, 5, 2] }) +
      '<circle cx="25.5" cy="40" r="2.6" fill="' + INK + '" stroke="none"/><circle cx="38.5" cy="40" r="2.6" fill="' + INK + '" stroke="none"/><ellipse cx="20" cy="46" rx="3.8" ry="2.4" fill="#ff9d9d" stroke="none"/><ellipse cx="44" cy="46" rx="3.8" ry="2.4" fill="#ff9d9d" stroke="none"/><path d="M28 46Q32 50 36 46" fill="none" stroke-width="2.4"/></svg>';
  }

  function art1() {   // tap to walk: dotted path, ripple, tapping finger, farmer trots over
    return S(cloud(64, 38, 1) + cloud(250, 30, .8) + tree(284, 112, .9) + tree(34, 104, .7) +
      flower(120, 172, '#ff9db5') + flower(150, 180, '#fff') + flower(206, 176, '#ffb04d') + flower(92, 164, '#fff') +
      '<g class="an a-glow">' + ln('M74 160Q130 134 222 152', 4.5, '#fff8e0', ' stroke-dasharray="1 11"') + '</g>' +
      '<g transform="translate(226 154)"><ellipse class="an a-ring" rx="17" ry="6.5" fill="none" stroke="#fff" stroke-width="3.5"/><ellipse rx="9" ry="3.5" fill="#fff8e0" stroke-width="2.4"/></g>' +
      '<g transform="translate(226 126)"><g class="an a-tap">' + finger() + '</g></g>' +
      '<g transform="translate(62 0)"><g class="an a-go">' + hero(0, 160, .95, 'a-walk') + '</g></g>' + sparkle(262, 66, 1, .2) + sparkle(110, 80, .8, .9), '#cdeaf7', '#b5e08c', '#a4d977', 118);
  }
  function tile(i, lbl, inner) {   // one step card: numbered badge, picture area, label band that never touches the picture
    return '<g transform="translate(' + (9 + i * 77) + ' 16)"><g class="an a-hl" style="animation-delay:' + (i * 1.5) + 's"><path d="' + rr(0, 0, 68, 130, 14) + '" fill="#fff4d9"/><path d="' + rr(5, 5, 58, 82, 10) + '" fill="#d8efb0" stroke-width="2.2"/>' + inner +
      '<path d="' + rr(5, 94, 58, 26, 9) + '" fill="#ffe3a0" stroke-width="2.2"/>' + T(34, 112, lbl, 13) + '<circle cx="9" cy="9" r="9" fill="#ffc54d" stroke-width="2.4"/>' + T(9, 14, i + 1, 12) + '</g></g>';
  }
  function art2() {   // hoe swing / water drops / seed + sprout / harvest, in four sticker cards
    var soil = P(el(34, 78, 25, 7.5), '#a8744a', { sw: 2.4, k: 2 }), wet = P(el(34, 78, 25, 7.5), '#7a4d2c', { sw: 2.4, k: 2 });
    var a = soil + ln('M18 78h30', 2, '#6b4326') + '<g class="an a-hoe" style="transform-origin:50% 100%">' + P(rr(31, 22, 6, 54, 3), '#d09a5e', { sw: 2.4, k: 1.5 }) + P('M21 18H48L44 32H25Z', '#c5ccd6', { sw: 2.4, k: 2 }) + '</g>';
    var b = wet + '<g class="an a-can">' + P(rr(12, 26, 28, 22, 7), '#6bb6ee', { sw: 2.4, hi: [19, 32, 3.5, 1.6] }) + P('M40 33L56 22L58 29L42 42Z', '#6bb6ee', { sw: 2.4, k: 1.5 }) + '</g>';
    for (var d = 0; d < 3; d++) b += '<ellipse class="an a-drop" style="animation-delay:' + d * .3 + 's" cx="' + (52 + d * 4) + '" cy="46" rx="2.6" ry="3.6" fill="#6bb6ee" stroke-width="1.6"/>';
    var c = wet + '<ellipse class="an a-seed" cx="34" cy="24" rx="4" ry="6" fill="#ffc54d" stroke-width="2"/><g class="an a-sprout" style="transform-origin:50% 100%">' + ln('M34 76V54', 3, INK) + P('M34 60Q20 58 20 47Q33 47 34 60Z', '#86cc5f', { sw: 2.4, k: 2 }) + P('M34 55Q48 53 48 42Q35 42 34 55Z', '#a9e083', { sw: 2.4, k: 2 }) + '</g>';
    var h = soil + '<g class="an a-pop">' + P('M34 38Q20 36 22 22Q34 24 34 38ZM34 38Q48 36 46 22Q34 24 34 38Z', '#86cc5f', { sw: 2.4, k: 2 }) + P('M24 42Q34 37 44 42Q42 66 34 74Q26 66 24 42Z', '#ff9a4d', { sw: 2.4, hi: [30, 50, 3, 1.5] }) + '</g>' + sparkle(54, 24, .9, .3);
    return S(tile(0, 'Cuốc đất', a) + tile(1, 'Tưới nước', b) + tile(2, 'Gieo hạt', c) + tile(3, 'Thu hoạch', h) + sparkle(160, 176, 1, .5), '#cdeaf7', '#b5e08c', '#a4d977', 152);
  }
  function art3() {   // pier fishing: bobber dips, ripple, "!" pops, reel bar on the right
    var wave = '', i;
    for (i = 0; i < 5; i++) wave += ln('M' + (112 + i * 26) + ' ' + (140 + (i % 2) * 16) + 'q6 -5 12 0t12 0', 2.2, '#fff');
    return S(cloud(70, 34, 1) + cloud(200, 28, .7) + '<rect x="0" y="104" width="320" height="96" fill="#7cc4ea" stroke="none"/><path d="M0 104H320" stroke-width="2.4"/>' + wave +
      P(rr(-4, 94, 120, 14, 3), '#c58d54', { sw: 2.8, k: 2 }) + P(rr(12, 108, 9, 46, 2), '#a8744a', { sw: 2.6, k: 2 }) + P(rr(90, 108, 9, 46, 2), '#a8744a', { sw: 2.6, k: 2 }) +
      hero(52, 94, .95) + ln('M64 66L116 34', 4.5, '#b57a42') + ln('M116 34Q184 40 200 112', 1.8, INK) +
      '<ellipse class="an a-ripple" cx="200" cy="122" rx="16" ry="4.5" fill="none" stroke="#fff" stroke-width="2.5"/>' +
      '<g transform="translate(200 116)"><g class="an a-bob">' + P(el(0, 0, 8, 8), '#f0806a', { sw: 2.6, k: 2 }) + '<path d="M-8 0a8 8 0 0 0 16 0Z" fill="#fff" stroke-width="2.6"/></g></g>' +
      '<g transform="translate(200 76)"><g class="an a-excl"><circle r="13" fill="#fff4d9"/>' + T(0, 7, '!', 20, '#f0806a') + '</g></g>' +
      '<path d="' + rr(268, 14, 40, 172, 16) + '" fill="#fff4d9"/><g class="an a-zone">' + P(rr(274, 24, 28, 54, 10), '#86cc5f', { sw: 2.6 }) + '</g>' +
      '<g class="an a-fish">' + P('M280 51Q280 43 289 43Q298 45 298 51Q298 57 289 59Q280 59 280 51Z', '#ffb04d', { sw: 2.2, k: 2 }) + P('M281 51l-9-6v12z', '#ffb04d', { sw: 2.2, k: 1 }) + '</g>', '#cdeaf7', '#b5e08c', '#7cc4ea', 104);
  }
  function art4() {   // sell bin + fish crate -> night turns to morning -> coins
    var rays = '', i;
    for (i = 0; i < 8; i++) rays += '<path d="M0 -21V-27" transform="rotate(' + i * 45 + ')" stroke-width="2.6"/>';
    return S(cloud(150, 26, .7) +
      '<g transform="translate(14 62)">' + P(rr(2, 18, 64, 52, 6), '#c58d54', { hi: [12, 28, 4, 1.8] }) + ln('M24 18L22 70M44 18L46 70', 2.2) + P(rr(-2, 8, 72, 14, 5), '#dba768', { sw: 3 }) + P(el(26, 4, 11, 10), '#ff9a4d', { sw: 2.6, hi: [22, 1, 2.6, 1.3] }) + ln('M26 -6v-5', 2.4, '#4a8f37') + P('M48 8l8-24 8 24z', '#f08a3b', { sw: 2.6, k: 2 }) + '</g>' + T(48, 160, 'Thùng bán đồ', 11) +
      '<g transform="translate(98 70)">' + P(rr(0, 10, 66, 50, 6), '#c58d54', { hi: [10, 20, 4, 1.8] }) + ln('M0 28H66M0 44H66', 2.2) + P('M6 12Q6 0 22 0Q38 0 38 12Q22 18 6 12Z', '#6bb6ee', { sw: 2.6, k: 2 }) + P('M38 8Q40 -2 54 -1Q64 1 64 9Q50 15 38 8Z', '#ffb04d', { sw: 2.6, k: 2 }) + '</g>' + T(131, 160, 'Thùng cá', 11) +
      '<g class="an a-arrow">' + ln('M178 110H206M198 100l11 10-11 10', 4.5) + '</g>' +
      '<g transform="translate(262 50)"><g class="an a-moon">' + P('M-6 -20a21 21 0 1 0 21 23a17 17 0 0 1-21-23z', '#ffe9a8', { sw: 2.8 }) + '</g><g class="an a-sun">' + P(el(0, 0, 15, 15), '#ffc54d', { sw: 2.8, hi: [-5, -6, 4, 2] }) + rays + '</g></g>' +
      '<g transform="translate(262 128)">' + P(el(0, 16, 24, 8.5), '#e8a92f', { sw: 2.8, k: 1.5 }) + P(el(0, 9, 24, 8.5), '#ffc54d', { sw: 2.8, k: 1.5 }) + '<g class="an a-coin">' + P(el(0, 0, 24, 8.5), '#ffd96b', { sw: 2.8, k: 1.5, hi: [-12, -2, 5, 1.6] }) + T(0, 4, 'g', 12) + '</g></g>' + T(262, 178, 'Sáng mai nhận tiền', 11), '#ffe7c2', '#c8e6a0', '#a4d977', 128);
  }
  function mini(i, lbl, inner) {
    return '<g transform="translate(' + (10 + i * 104) + ' 16)"><path d="' + rr(0, 0, 96, 168, 16) + '" fill="#fff4d9"/><path d="' + rr(6, 6, 84, 116, 11) + '" fill="#' + ['e6dcfa', 'ffeab8', 'cfe6f7'][i] + '" stroke-width="2.2"/>' + inner + '<path d="' + rr(6, 130, 84, 30, 10) + '" fill="#ffe3a0" stroke-width="2.2"/>' + T(48, 151, lbl, 14) + '</g>';
  }
  function art5() {   // notebook / bag with hotbar / bed with Zzz
    var slots = '', grid = '', k;
    slots = '';
    for (k = 0; k < 4; k++) slots += P(rr(10 + k * 15, 22, 13, 13, 4), '#fbe6b6', { sw: 2.2, k: 1.5 });
    for (k = 0; k < 6; k++) grid += P(rr(16 + (k % 3) * 22, 66 + Math.floor(k / 3) * 22, 18, 18, 5), ['#f08a6b', '#86cc5f', '#ffc54d'][k % 3], { sw: 2.2, k: 1.5 });
    var book = '<g class="an a-book">' + P(rr(22, 28, 52, 70, 7), '#b88ae0', { hi: [32, 38, 4, 1.8] }) + P(rr(30, 28, 44, 70, 7), '#cfa9ee', { sw: 2.6 }) + P('M52 44l4 8.5 9 1.2-6.600 6.200 1.800 9-8.200-4.500-8.200 4.500 1.800-9-6.600-6.200 9-1.200Z', '#ffd23f', { sw: 2.2, k: 1.5 }) + '</g>';
    slots += P(rr(70, 22, 13, 13, 4), '#ffdc85', { sw: 2.2, k: 1.5 }) + '<circle cx="84" cy="29.5" r="1.6" fill="#5b3a29" stroke="none"/><circle cx="87.5" cy="29.5" r="1.6" fill="#5b3a29" stroke="none"/><circle cx="91" cy="29.5" r="1.6" fill="#5b3a29" stroke="none"/>';
    var bag = slots + '<g class="an a-glow"><path d="' + rr(67, 19, 19, 19, 6) + '" fill="none" stroke="#f0806a" stroke-width="3"/></g><g class="an a-grid">' + grid + '</g>';
    var bed = P(rr(14, 74, 68, 30, 7), '#c58d54', { sw: 2.8 }) + P(rr(14, 56, 68, 34, 10), '#f08a6b', { sw: 2.8, hi: [24, 64, 4, 1.8] }) + P(el(32, 62, 14, 8), '#fff4d9', { sw: 2.6, k: 2 }) + ln('M14 74H82', 2.2) +
      P('M70 14a13 13 0 1 0 13 16a10.500 10.500 0 0 1-13-16z', '#ffe9a8', { sw: 2.4, k: 1.5 }) + '<g class="an a-z">' + T(50, 48, 'Z', 17) + '</g><g class="an a-z" style="animation-delay:1.1s">' + T(64, 40, 'z', 12) + '</g>';
    return S(mini(0, 'Sổ tay', book) + mini(1, 'Túi đồ', bag) + mini(2, 'Đi ngủ', bed), '#e3dcf5', '#d4e8b4', '#a4d977', 150);
  }
  var PAGES = [
    { t: 'Đi dạo nào!', a: 'Chạm vào đất, mình sẽ tự chạy tới đó! Thích kéo tay hơn thì dùng cần điều khiển trên màn hình nhé.', b: 'Muốn đổi kiểu điều khiển? Mở Cài đặt nha.', art: art1 },
    { t: 'Làm nông vui lắm!', a: 'Cuốc đất, tưới nước, gieo hạt, rồi chờ cây lớn lên để thu hoạch thôi!', b: 'Phân bón: <u class="n">N</u> đạm nuôi cây lá, <u class="p">P</u> lân nuôi hoa quả, <u class="k">K</u> kali nuôi củ.', art: art2 },
    { t: 'Câu cá thư giãn', a: 'Ngồi vào ghế ở cầu tàu, giữ nút hành động rồi thả ra để quăng cần. Phao chìm là chạm ngay nha!', b: 'Giữ để thanh xanh bám theo chú cá. Đợi lâu, cá càng ngon!', art: art3 },
    { t: 'Bán nông sản', a: 'Bỏ nông sản vào thùng bán đồ, cá thì bỏ vào thùng ở sạp cá. Sáng mai tiền sẽ về túi bạn!', b: 'Dùng tiền mua hạt giống và nâng cấp dụng cụ ở Cửa hàng và Xưởng.', art: art4 },
    { t: 'Sổ tay và giấc ngủ', a: 'Sổ tay ghi lại những điều bạn học được. Nút ba chấm trên thanh nhanh sẽ mở Túi đồ.', b: 'Ngủ trên giường để lưu lại ngày và lấy lại sức nhé!', art: art5 }
  ];

  /* ------------------------------------------------ carousel */
  var idx = 0, tilt = null;
  function isOpen() { return !!root; }
  function open() {
    if (root) return;
    idx = 0;
    root = $('div', 'tu-root', uiRoot());
    var card = $('div', 'tv-card tu-card', root);
    if ((G.Quality && G.Quality.level && G.Quality.level() >= 2)) card.classList.add('still');
    var top = $('div', 'tu-top', card, '<span class="tu-ico">' + Icons.ui('guide', 34) + '</span><h2>Hướng dẫn</h2>');
    var skip = $('button', 'tv-btn alt tu-skip', top, 'Bỏ qua');
    var prog = $('div', 'tu-prog', card), segs = PAGES.map(function () { return $('i', null, prog); }), cnt = $('b', null, prog, '1/' + PAGES.length);
    var view = $('div', 'tu-view', card), track = $('div', 'tu-track', view), pages = [];
    PAGES.forEach(function (p) {
      var pg = $('div', 'tu-page', track);
      $('div', 'tu-art', pg, p.art());
      $('div', 'tu-txt', pg, '<div class="tu-face">' + face() + '</div><div class="tu-say"><h3>' + p.t + '</h3><p>' + p.a + '</p><p class="b">' + p.b + '</p></div>');
      pages.push(pg);
    });
    var nav = $('div', 'tu-nav', card), prev = $('button', 'tv-btn alt', nav, 'Quay lại'), next = $('button', 'tv-btn', nav, 'Tiếp');
    function show(i) {
      idx = clamp(i, 0, PAGES.length - 1);
      track.style.transform = 'translateX(' + (-idx * 100) + '%)';
      pages.forEach(function (p, k) { p.classList.toggle('on', k === idx); p.setAttribute('aria-hidden', k === idx ? 'false' : 'true'); });
      segs.forEach(function (d, k) { d.classList.toggle('on', k <= idx); d.classList.toggle('cur', k === idx); });
      cnt.textContent = (idx + 1) + '/' + PAGES.length;
      prev.disabled = idx === 0;
      next.textContent = idx === PAGES.length - 1 ? 'Bắt đầu chơi!' : 'Tiếp';
    }
    function go(d) { if (d > 0 && idx === PAGES.length - 1) { close(); return; } if (idx + d < 0) return; show(idx + d); UI.sfx('tap'); }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    skip.addEventListener('click', function () { close(); });
    var x0 = null;
    view.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
    view.addEventListener('pointerup', function (e) { if (x0 === null) return; var dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
    view.addEventListener('pointercancel', function () { x0 = null; });
    tilt = function (e) { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', tilt, true);
    G.Time.pause('tutorial'); G.Player.lock('tutorial');
    hideHint(true);
    show(0);
    UI.sfx('pop');
    requestAnimationFrame(function () { if (root) root.classList.add('in'); });
  }
  function close() {
    if (!root) return;
    var r = root; root = null;
    window.removeEventListener('keydown', tilt, true);
    r.classList.remove('in');
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 220);
    G.Time.resume('tutorial'); G.Player.unlock('tutorial');
    if (!st.done) { st.done = true; G.Save.request(); }
    pending = false;
    E.emit('tutorial:closed', {});
  }

  /* ------------------------------------------------ contextual hints */
  var HINTS = {
    soil: { a: 'hotbar', t: 'Chọn cuốc ở thanh nhanh, rồi chạm vào đất để cuốc luống nhé!' },
    seeds: { a: 'action', t: 'Gieo hạt lên đất đã cuốc và tưới nước. Nhớ chọn hạt đúng mùa nhé!' },
    seat: { a: 'action', t: 'Giữ nút hành động để nạp lực, thả ra để quăng cần.' },
    bite: { a: 'action', t: 'Phao chìm rồi! Chạm ngay!', life: 2600 },
    night: { a: 'clock', t: 'Trời tối rồi. Về nhà ngủ để lưu lại ngày và lấy lại sức nhé!' }
  };
  var ORDER = ['bite', 'seat', 'seeds', 'soil', 'night'];
  function hideHint(now) {
    clearTimeout(hintTimer);
    if (!hintEl) return;
    var h = hintEl; hintEl = null;
    h.classList.remove('in');
    if (now) { if (h.parentNode) h.parentNode.removeChild(h); } else setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 300);
  }
  function place() {
    var h = hintEl, a = h && UI.hud && UI.hud[HINTS[h.getAttribute('data-id')].a];
    if (!h || !a) return;
    var u = uiRoot(), ur = u.getBoundingClientRect(), k = (ur.width / (u.offsetWidth || 1)) || 1, ar = a.getBoundingClientRect();
    var W = u.offsetWidth, H = u.offsetHeight, bw = Math.min(250, W - 20), cx = (ar.left + ar.width / 2 - ur.left) / k;
    var top = (ar.top - ur.top) / k, bot = (ar.bottom - ur.top) / k, below = (top + bot) / 2 < H / 2, left = clamp(cx - bw / 2, 10, W - bw - 10);
    h.style.width = bw + 'px'; h.style.left = left + 'px';
    h.style.top = (below ? bot + 14 : top - h.offsetHeight - 14) + 'px';
    h.classList.toggle('below', below);
    h.firstChild.nextSibling.style.left = clamp(cx - left, 18, bw - 18) + 'px';
  }
  function showHint(id) {
    var d = HINTS[id];
    if (!d || st.seen[id] || hintEl || root) return false;
    st.seen[id] = 1; G.Save.request(); delete want[id];
    hintEl = $('div', 'tu-hint', uiRoot(), '<span>' + d.t + '</span><i></i>');
    hintEl.setAttribute('data-id', id);
    hintEl.addEventListener('pointerdown', function () { hideHint(); });
    place();
    requestAnimationFrame(function () { if (hintEl) hintEl.classList.add('in'); });
    UI.sfx('pop');
    hintTimer = setTimeout(function () { hideHint(); }, d.life || 7000);
    return true;
  }
  function blocked() { return !!(document.getElementById('tv-title') || UI.panelOpen || root); }
  function tick() {
    var P = G.Player, T = G.Time, sel, def, i;
    if (root || blocked()) { if (hintEl && root) hideHint(true); return; }
    if (pending) {
      if (G.Scenes.current === 'house' && !P.isLocked()) { if (++wait >= 3) { pending = false; open(); } } else wait = 0;
      return;
    }
    if (hintEl) { place(); return; }
    if (G.Scenes.outdoor && !P.isLocked()) {
      if (!st.seen.soil && P.pos.x > 11 && P.pos.x < 22 && P.pos.z > 9 && P.pos.z < 18) want.soil = 1;
      sel = G.Inventory.selected && G.Inventory.selected(); def = sel && G.Items.get(sel.id);
      if (!st.seen.seeds && def && def.cat === 'seed') want.seeds = 1;
    }
    if (!st.seen.night && !P.isLocked() && T.hour >= 20 && T.hour < 26) want.night = 1;
    for (i = 0; i < ORDER.length; i++) if (want[ORDER[i]] && showHint(ORDER[i])) return;
  }
  G.Loop.onFrame(function (dt) { acc += dt; if (acc < 0.4) return; acc = 0; tick(); }, 40);
  E.on('fish:sat', function () { if (!st.seen.seat) want.seat = 1; });
  E.on('fish:bite', function () { if (!st.seen.bite && !blocked()) showHint('bite'); });
  E.on('scene:changed', function () { hideHint(true); want = {}; });

  /* ------------------------------------------------ save + public API */
  G.Save.register('tutorial', {
    save: function () { return { done: st.done ? 1 : 0, seen: st.seen }; },
    load: function (o) { st.done = !!(o && o.done); st.seen = (o && o.seen) || {}; armed = false; pending = !st.done; wait = 0; want = {}; },
    reset: function () { st.done = false; st.seen = {}; armed = true; pending = true; wait = 0; want = {}; }
  }, 'player');
  E.on('save:loaded', function () {   // a save without a 'tutorial' section is an existing game: no forced tutorial, no hints
    if (!armed) return;
    armed = false; pending = false; st.done = true;
    ORDER.forEach(function (k) { st.seen[k] = 1; });
  });
  E.on('save:reset', function () { armed = false; pending = true; st.done = false; });

  G.Tutorial = {
    open: open, close: close, isOpen: isOpen, isDone: function () { return st.done; },
    hintSeen: function (id) { return !!st.seen[id]; },
    resetHints: function () { st.seen = {}; want = {}; G.Save.request(); },
    renderRow: function (body, el, btn) {
      el('div', 'tv-sub', body, Icons.ui('guide', 20) + ' Hướng dẫn');
      var row = el('div', 'tv-row', body);
      btn('Xem lại hướng dẫn', row, function () { open(); }, 'alt');
    }
  };
})();
