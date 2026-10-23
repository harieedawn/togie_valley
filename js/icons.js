/* Togie Valley - icons.js (Stage 4.5A): Game.Icons, procedural "cozy ink sticker" SVG icons.
 * Game.Icons.item(idOrDef, px, tier?) and Game.Icons.ui(name, px) return cached inline SVG strings.
 * Style: 64x64 viewBox, one ink outline (#5b3a29, 3.5), flat 3 tones (base / light top-left / dark bottom-right) + glint.
 * Depends on: core.js (Game). Game.Items is only read lazily when an item id string is passed.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) { console.error('[icons] core.js missing'); return; }

  var INK = '#5b3a29', SW = 3.5;
  var PAL = {
    red: '#f0675a', orange: '#ffa04d', yellow: '#ffd23f', green: '#79c75a', leaf: '#6fc062', teal: '#5cc7b0',
    blue: '#6bb6ee', purple: '#a47be0', pink: '#ff8fb5', brown: '#b9835a', cream: '#fff1d0', white: '#f7f1e6',
    gray: '#b7b0a6', wood: '#c48a54'
  };
  var TIER_COL = ['#a8927f', '#e58a4a', '#dfe8f0', '#ffcf3e']; // Basic, Copper, Silver, Gold

  /* ------------------------------------------------------------ colour helpers */
  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function c2h(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    return '#' + c2h(x[0] + (y[0] - x[0]) * t) + c2h(x[1] + (y[1] - x[1]) * t) + c2h(x[2] + (y[2] - x[2]) * t);
  }
  function lite(c) { return mix(c, '#fff8e0', 0.5); }
  function dark(c) { return mix(c, '#5a2a3c', 0.3); }
  function col(c, def) {
    if (!c) return def;
    if (PAL[c]) return PAL[c];
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? c : def;
  }
  function hash(s) { s = String(s); var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return '#' + c2h(f(p, q, h + 1 / 3) * 255) + c2h(f(p, q, h) * 255) + c2h(f(p, q, h - 1 / 3) * 255);
  }
  function hashColor(id, salt) { var h = hash(id + (salt || '')); return hsl2hex(h % 360, 0.62, 0.68); }
  function r(n) { return Math.round(n * 10) / 10; }

  /* ------------------------------------------------------------ svg primitives */
  var ctx = { id: 'i', n: 0, rot: 0, sc: 1 };

  function E(cx, cy, rx, ry) { return 'M' + r(cx - rx) + ' ' + r(cy) + 'a' + r(rx) + ' ' + r(ry) + ' 0 1 0 ' + r(2 * rx) + ' 0a' + r(rx) + ' ' + r(ry) + ' 0 1 0 ' + r(-2 * rx) + ' 0Z'; }
  function RR(x, y, w, h, q) {
    q = Math.min(q, w / 2, h / 2);
    return 'M' + (x + q) + ' ' + y + 'H' + (x + w - q) + 'A' + q + ' ' + q + ' 0 0 1 ' + (x + w) + ' ' + (y + q) + 'V' + (y + h - q) +
      'A' + q + ' ' + q + ' 0 0 1 ' + (x + w - q) + ' ' + (y + h) + 'H' + (x + q) + 'A' + q + ' ' + q + ' 0 0 1 ' + x + ' ' + (y + h - q) +
      'V' + (y + q) + 'A' + q + ' ' + q + ' 0 0 1 ' + (x + q) + ' ' + y + 'Z';
  }
  /* chubby leaf / petal / grain from p1 to p2, w = full width */
  function LF(x1, y1, x2, y2, w) {
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / l * w, ny = dx / l * w;
    return 'M' + r(x1) + ' ' + r(y1) + 'Q' + r(mx + nx) + ' ' + r(my + ny) + ' ' + r(x2) + ' ' + r(y2) + 'Q' + r(mx - nx) + ' ' + r(my - ny) + ' ' + r(x1) + ' ' + r(y1) + 'Z';
  }
  function star(cx, cy, R, q, n, rot) {
    var d = '', a0 = (rot === undefined ? -90 : rot) * Math.PI / 180;
    for (var i = 0; i < n * 2; i++) {
      var rad = i % 2 ? q : R, a = a0 + i * Math.PI / n;
      d += (i ? 'L' : 'M') + r(cx + Math.cos(a) * rad) + ' ' + r(cy + Math.sin(a) * rad);
    }
    return d + 'Z';
  }
  function tear(x, y) { return 'M' + x + ' ' + (y - 7) + 'Q' + (x + 6) + ' ' + (y + 1) + ' ' + x + ' ' + (y + 5) + 'Q' + (x - 6) + ' ' + (y + 1) + ' ' + x + ' ' + (y - 7) + 'Z'; }

  /* grouped transform; keeps the light direction and stroke width constant inside */
  function rotg(deg, cx, cy, fn, sc, tx, ty) {
    var pr = ctx.rot, ps = ctx.sc;
    sc = sc || 1;
    ctx.rot = pr + deg; ctx.sc = ps * sc;
    var tf = 'translate(' + (tx === undefined ? cx : tx) + ' ' + (ty === undefined ? cy : ty) + ') rotate(' + deg + ') scale(' + sc + ') translate(' + (-cx) + ' ' + (-cy) + ')';
    var s = '<g transform="' + tf + '">' + fn() + '</g>';
    ctx.rot = pr; ctx.sc = ps;
    return s;
  }
  function ln(d, c, w, op, extra) {
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + r(w / ctx.sc) + '" stroke-linecap="round" stroke-linejoin="round"' +
      (op !== undefined && op !== null ? ' opacity="' + op + '"' : '') + (extra || '') + '/>';
  }
  /* outlined stroke (stem, tube); vis = visible fill width */
  function tube(d, vis, c) { return ln(d, INK, vis + SW, null) + ln(d, c, vis, null); }
  function dot(x, y, rad, c) { return '<circle cx="' + r(x) + '" cy="' + r(y) + '" r="' + r(rad) + '" fill="' + c + '"/>'; }
  function glint(x, y, k) {
    k = k || 1;
    return '<ellipse cx="' + r(x) + '" cy="' + r(y) + '" rx="' + r(1.7 * k) + '" ry="' + r(3 * k) + '" transform="rotate(35 ' + r(x) + ' ' + r(y) + ')" fill="#fff"/>' + dot(x + 3.2 * k, y + 4.6 * k, 0.95 * k, '#fff');
  }
  /* The core sticker shape: fill, dark crescent bottom-right, light highlight top-left, optional glint, ink outline.
   * o: {b:[x,y,w,h] auto highlight bbox, hl:[cx,cy,rx,ry,rot]|false, g:[x,y]|true, glintK, over:svg, sh:false, off:n, sw:n, dk:colour, lt:colour} */
  function body(d, c, o) {
    o = o || {};
    var id = ctx.id + (ctx.n++), s = '', off = o.off === undefined ? 4 : o.off;
    var a = -ctx.rot * Math.PI / 180, vx = -off, vy = -off;
    var dx = vx * Math.cos(a) - vy * Math.sin(a), dy = vx * Math.sin(a) + vy * Math.cos(a);
    s += '<path d="' + d + '" fill="' + c + '" fill-rule="evenodd"/>';
    if (o.sh !== false) {
      s += '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="-20" y="-20" width="104" height="104"><rect x="-20" y="-20" width="104" height="104" fill="#fff"/>' +
        '<path d="' + d + '" transform="translate(' + r(dx) + ' ' + r(dy) + ')" fill="#000" fill-rule="evenodd"/></mask>' +
        '<path d="' + d + '" fill="' + (o.dk || dark(c)) + '" fill-rule="evenodd" mask="url(#' + id + ')"/>';
    }
    var hl = o.hl, b = o.b;
    if (!hl && hl !== false && b) hl = [b[0] + b[2] * 0.31, b[1] + b[3] * 0.27, b[2] * 0.15, Math.max(1.6, b[3] * 0.09), -38];
    if (hl) s += '<ellipse cx="' + r(hl[0]) + '" cy="' + r(hl[1]) + '" rx="' + r(hl[2]) + '" ry="' + r(hl[3]) + '" transform="rotate(' + (hl[4] || 0) + ' ' + r(hl[0]) + ' ' + r(hl[1]) + ')" fill="' + (o.lt || lite(c)) + '"/>';
    if (o.over) s += o.over;
    if (o.g) {
      var g = o.g === true && hl ? [hl[0] - hl[2] * 0.2, hl[1] - hl[3] * 0.1] : o.g;
      if (g && g.length) s += glint(g[0], g[1], o.gk || 1);
    }
    s += '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="' + r((o.sw || SW) / ctx.sc) + '" stroke-linejoin="round" stroke-linecap="round" fill-rule="evenodd"/>';
    return s;
  }
  function rect(x, y, w, h, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>'; }

  /* ------------------------------------------------------------ item templates */
  var T = {};
  function tpl(name, defaults, shadowRx, fn) { T[name] = { d: defaults, sh: shadowRx, f: fn }; }

  /* ---- tools ---- */
  tpl('hoe', ['#c9945a', '#a9bdd0', null], 15, function (p) {
    return rotg(32, 32, 32, function () {
      return body(RR(28.5, 4, 7, 42, 3.5), p.c1, { hl: [31, 20, 1.5, 9, 0] }) +
        body(RR(26, 21, 12, 9, 4), p.tc, { sw: 3, hl: false, off: 2.5 }) +
        body('M12 46L27 44V38H37V44L52 46Q57 47 55 52L53 56Q52 58 49 58H15Q12 58 11 56L9 52Q7 47 12 46Z', p.c2, { b: [8, 38, 48, 20], g: true });
    }, 0.86, 32, 31);
  });
  tpl('can', ['#6bb6ee', '#f2c76c', null], 20, function (p) {
    var s = '';
    s += tube('M18 31C4 26 4 52 18 47', 4, p.c2);
    s += tube('M36 46Q47 42 53 28', 5, p.c1);
    s += rotg(35, 54, 24, function () { return body(E(54, 24, 5.5, 7.5), p.c2, { off: 2.5, sw: 3, hl: false }) + ln('M50.5 22H57.5', INK, 1.8, 0.7) + ln('M50.5 26H57.5', INK, 1.8, 0.7); });
    s += body(RR(14, 26, 26, 28, 8), p.c1, {
      b: [14, 26, 26, 28], g: true,
      over: rect(14, 38, 26, 7, p.tc) + ln('M14 38H40M14 45H40', INK, 2.4, 0.9)
    });
    s += body(E(27, 26.5, 10, 3.8), mix(p.c1, '#2a2f55', 0.5), { sh: false, hl: false, sw: 3 });
    return s;
  });
  tpl('rod', ['#b9d46a', '#e8b878', null], 17, function (p) {
    var s = rotg(42, 32, 32, function () {
      return body(RR(28.5, 6, 7, 52, 3.5), p.c1, { hl: [31, 22, 1.3, 9, 0] }) +
        ln('M28.5 19H35.5M28.5 31H35.5', INK, 2, 0.55) +
        body(RR(27, 38, 10, 20, 5), p.c2, { hl: [30, 46, 1.4, 5, 0], sw: 3 }) +
        body(E(43, 45, 6, 6), p.tc, { off: 2.5, sw: 3, hl: false }) + ln('M43 45H48', INK, 2.2) + dot(48.5, 45, 1.6, INK);
    });
    s += ln('M49.4 12.7Q60 18 56 34.8', INK, 2);
    s += body(E(56, 40, 5.2, 5.2), '#ff6b5e', { off: 2.5, sw: 3, hl: false, over: '<path d="M50.8 40A5.2 5.2 0 0 0 61.2 40Z" fill="#fff8ea"/>' });
    return s;
  });

  /* ---- seed packet (v: round | long | leaf) ---- */
  tpl('seed', ['#ff8d6b', '#fff1d0', '#79c75a'], 17, function (p) {
    var v = p.v || 'round', m = '';
    if (v === 'long') {
      m = body('M32 31Q38 32 36 40Q34 48 32 52Q30 48 28 40Q26 32 32 31Z', p.c1, { off: 2.5, sw: 2.4, hl: false }) +
        body(LF(32, 32, 25, 24, 7), p.c3, { off: 2, sw: 2.4, hl: false }) + body(LF(32, 32, 39, 24, 7), p.c3, { off: 2, sw: 2.4, hl: false });
    } else if (v === 'leaf') {
      m = body(LF(32, 50, 22, 32, 10), p.c3, { off: 2, sw: 2.4, hl: false }) + body(LF(32, 50, 42, 32, 10), p.c3, { off: 2, sw: 2.4, hl: false }) +
        body(LF(32, 50, 32, 28, 10), mix(p.c3, p.c1, 0.45), { off: 2, sw: 2.4, hl: false });
    } else {
      m = body(LF(32, 35, 23, 27, 7), p.c3, { off: 2, sw: 2.4, hl: false }) + body(LF(32, 35, 41, 27, 7), p.c3, { off: 2, sw: 2.4, hl: false }) +
        body(E(32, 42, 7.5, 7.5), p.c1, { off: 2.5, sw: 2.4, b: [24.5, 34.5, 15, 15], g: true, gk: 0.6 });
    }
    return rotg(-7, 32, 34, function () {
      return body('M15 12H49Q50 12 50.2 13L52 54Q52 58 48 58H16Q12 58 12 54L13.8 13Q14 12 15 12Z', p.c2, { hl: [19, 30, 1.5, 9, 0] }) +
        body(RR(12.5, 7, 39, 13, 4.5), p.c1, { b: [12.5, 7, 39, 13], hl: false }) +
        body(E(32, 38.5, 13, 13.5), '#fffaf0', { sh: false, hl: false, sw: 2.4 }) + m;
    });
  });

  /* ---- crops ---- */
  tpl('leafy', ['#79c75a', '#b6e07a', null], 19, function (p) {
    return body('M9 38C5 24 17 19 21 22C22 11 42 11 43 22C47 19 59 24 55 38C54 53 40 56 32 56C24 56 10 53 9 38Z', p.c1, { b: [7, 12, 50, 44], g: true }) +
      ln('M17 43Q19 35 23 30', dark(p.c1), 2.2, 0.8) + ln('M47 43Q45 35 41 30', dark(p.c1), 2.2, 0.8) +
      body(E(32, 38, 13.5, 14.5), p.c2, { b: [18.5, 23.5, 27, 29], hl: false, sw: 3 }) + ln('M32 26Q27.5 38 32 50', dark(p.c2), 2.2, 0.85);
  });
  tpl('longroot', ['#ffa04d', '#6fc062', null], 15, function (p) {
    return rotg(14, 32, 34, function () {
      return body(LF(32, 25, 21, 6, 11), p.c2, { sw: 3, hl: false, off: 2.5 }) + body(LF(32, 25, 43, 7, 11), p.c2, { sw: 3, hl: false, off: 2.5 }) +
        body(LF(32, 25, 32, 4, 11), lite(p.c2), { sw: 3, hl: false, off: 2.5 }) +
        body('M32 20C45 19 46 32 42 40C39 48 35 54 32 58C29 54 25 48 22 40C18 32 19 19 32 20Z', p.c1, { b: [19, 19, 27, 39], g: true }) +
        ln('M25 30H30M34 37H39M26 43H30', dark(p.c1), 2.2, 0.8);
    });
  });
  tpl('roundroot', ['#d84a6e', '#6fc062', null], 18, function (p) {
    var cap = p.c3 ? '<path d="M14.1 36A19 16 0 0 1 49.9 36Q32 30 14.1 36Z" fill="' + p.c3 + '"/>' : '';
    return body(LF(32, 27, 20, 8, 10), p.c2, { sw: 3, hl: false, off: 2.5 }) + body(LF(32, 27, 44, 8, 10), p.c2, { sw: 3, hl: false, off: 2.5 }) +
      body(LF(32, 27, 32, 5, 10), lite(p.c2), { sw: 3, hl: false, off: 2.5 }) +
      tube('M32 52Q33 58 39 60', 2.2, dark(p.c1)) +
      body(E(32, 38, 19, 16), p.c1, { b: [13, 22, 38, 32], g: true, over: cap }) + ln('M25 45Q32 49.5 39 45', dark(p.c1), 2.2, 0.8);
  });
  tpl('tuber', ['#d9a86c', '#b98152', null], 20, function (p) {
    return rotg(-8, 32, 36, function () {
      return body('M9 35C7 21 22 16 33 17C46 16 58 25 56 38C54 51 42 56 30 55C18 55 10 48 9 35Z', p.c1, {
        b: [7, 16, 50, 40], g: true,
        over: '<ellipse cx="42" cy="28" rx="3.2" ry="2.2" fill="' + p.c2 + '" opacity=".8"/><ellipse cx="22" cy="45" rx="3.4" ry="2.2" fill="' + p.c2 + '" opacity=".8"/><ellipse cx="46" cy="44" rx="2.6" ry="2" fill="' + p.c2 + '" opacity=".8"/>' +
          ln('M20 33q2.5-3 5.5 0M34 39q2.5-3 5.5 0', dark(p.c2), 2.3, 0.9)
      });
    });
  });
  tpl('fruit', ['#f0675a', '#6fc062', '#8a6a3a'], 19, function (p) {
    return body('M32 21C41 13 57 19 56 37C55 51 43 57 32 54C21 57 9 51 8 37C7 19 23 13 32 21Z', p.c1, { b: [8, 15, 48, 42], g: true }) +
      tube('M32 22Q32 14 37 9', 2.6, p.c3) +
      body(LF(32, 22, 18, 24, 8), p.c2, { sw: 3, hl: false, off: 2 }) + body(LF(32, 22, 46, 24, 8), p.c2, { sw: 3, hl: false, off: 2 }) +
      body(LF(32, 22, 23, 32, 7.5), p.c2, { sw: 3, hl: false, off: 2 }) + body(LF(32, 22, 41, 32, 7.5), p.c2, { sw: 3, hl: false, off: 2 });
  });
  tpl('longfruit', ['#a47be0', '#6fc062', null], 15, function (p) {
    var v = p.v || 'taper', b, cap;
    if (v === 'capsule') {
      b = body('M23 16Q23 10 32 10Q41 10 41 16V46Q41 56 32 56Q23 56 23 46Z', p.c1, { b: [23, 10, 18, 46], g: true, over: ln('M28.5 20V48', dark(p.c1), 2.2, 0.45) + dot(36, 26, 1.4, lite(p.c1)) + dot(35, 38, 1.4, lite(p.c1)) });
      cap = body(RR(26, 6, 12, 8, 3.5), p.c2, { sw: 3, hl: false, off: 2 });
    } else {
      b = body('M26 13Q26 9 31 9H33Q38 9 38 13L39 23C50 29 50 50 38 56Q32 59 26 56C14 50 14 29 25 23Z', p.c1, { b: [14, 9, 36, 50], g: true });
      cap = body(LF(32, 14, 22, 26, 9), p.c2, { sw: 3, hl: false, off: 2 }) + body(LF(32, 14, 42, 26, 9), p.c2, { sw: 3, hl: false, off: 2 }) +
        body(RR(25.5, 5, 13, 10, 4), p.c2, { sw: 3, hl: false, off: 2 });
    }
    return rotg(28, 32, 33, function () { return b + cap; });
  });
  tpl('gourd', ['#ffa04d', '#8a6a3a', '#6fc062'], 21, function (p) {
    if (p.v === 'bottle') {
      return body(RR(28, 4, 8, 9, 3), p.c2, { sw: 3, hl: false, off: 2 }) +
        body('M25 14Q25 10 32 10Q39 10 39 14V24Q39 28 43 31C56 37 56 55 42 57Q32 60 22 57C8 55 8 37 21 31Q25 28 25 24Z', p.c1, { b: [10, 10, 44, 48], g: true }) +
        ln('M32 14V50', dark(p.c1), 2.2, 0.35);
    }
    return body(RR(28.5, 10, 7.5, 13, 3), p.c2, { sw: 3, hl: false, off: 2 }) +
      tube('M35 17Q46 8 50 16Q51 22 46 21', 2, p.c3) +
      body(E(18.5, 38, 11, 17), p.c1, { b: [7.5, 21, 22, 34], hl: false, off: 3 }) + body(E(45.5, 38, 11, 17), p.c1, { hl: false, off: 3 }) +
      body(E(32, 38, 12.5, 19), p.c1, { b: [19.5, 19, 25, 38], g: true }) +
      body(LF(30, 21, 16, 12, 9), p.c3, { sw: 3, hl: false, off: 2 });
  });
  tpl('berry', ['#f0675a', '#6fc062', '#ffe27a'], 19, function (p) {
    if (p.v === 'cluster') {
      function bb(cx, cy) { return body(E(cx, cy, 13, 13), p.c1, { b: [cx - 13, cy - 13, 26, 26], g: true, over: '<path d="' + star(cx, cy - 2, 4.4, 2.1, 5) + '" fill="' + dark(p.c1) + '" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/>' }); }
      return bb(21, 43) + bb(43, 43) + bb(32, 25) + body(LF(34, 14, 50, 8, 9), p.c2, { sw: 3, hl: false, off: 2 });
    }
    var seeds = [[22, 28], [32, 26], [42, 28], [27, 36], [37, 36], [32, 45], [20, 35], [44, 35]], sd = '';
    for (var i = 0; i < seeds.length; i++) sd += '<ellipse cx="' + seeds[i][0] + '" cy="' + seeds[i][1] + '" rx="1.4" ry="2.1" fill="' + p.c3 + '"/>';
    return body('M32 56C20 49 10 39 10 29C10 19 20 17 32 21C44 17 54 19 54 29C54 39 44 49 32 56Z', p.c1, { b: [10, 17, 44, 39], over: sd, g: true }) +
      tube('M32 20Q32 13 36 8', 2.4, p.c2) +
      body(LF(32, 20, 16, 19, 8), p.c2, { sw: 3, hl: false, off: 2 }) + body(LF(32, 20, 48, 19, 8), p.c2, { sw: 3, hl: false, off: 2 }) +
      body(LF(32, 20, 22, 27, 7), p.c2, { sw: 3, hl: false, off: 2 }) + body(LF(32, 20, 42, 27, 7), p.c2, { sw: 3, hl: false, off: 2 });
  });
  tpl('pod', ['#6fbf5b', '#bfe68a', null], 21, function (p) {
    return rotg(-12, 32, 36, function () {
      return tube('M56 33Q62 31 61 25', 2, p.c1) +
        body(E(19, 30, 7, 7), p.c2, { b: [12, 23, 14, 14], g: true, gk: 0.7, sw: 3, off: 3 }) +
        body(E(32, 28, 7.5, 7.5), p.c2, { b: [24.5, 20.5, 15, 15], hl: false, sw: 3, off: 3 }) +
        body(E(45, 30, 7, 7), p.c2, { hl: false, sw: 3, off: 3 }) +
        body('M6 34Q6 46 18 47H46Q58 46 58 34Q58 30 54 30H10Q6 30 6 34Z', p.c1, { hl: [18, 40, 5, 1.6, -5], over: ln('M10 32H54', lite(p.c1), 2.4, 0.9) });
    });
  });
  tpl('corn', ['#ffd84a', '#79c75a', null], 15, function (p) {
    var k = '', i;
    for (i = 0; i < 4; i++) k += '<path d="M23.5 ' + (17 + i * 7) + 'H40.5" stroke="' + dark(p.c1) + '" stroke-width="1.6" opacity=".5" fill="none"/>';
    k += '<path d="M28.5 15V45M32 12V45M35.5 15V45" stroke="' + dark(p.c1) + '" stroke-width="1.6" opacity=".5" fill="none"/>';
    return rotg(14, 32, 34, function () {
      return body(RR(23, 6, 18, 42, 9), p.c1, { b: [23, 6, 18, 42], over: k, hl: [27.5, 20, 1.6, 8, 0] }) +
        body(LF(32, 58, 15, 24, 15), p.c2, { sw: 3, hl: false }) + body(LF(32, 58, 49, 24, 15), p.c2, { sw: 3, hl: false }) +
        body(LF(32, 58, 32, 28, 13), lite(p.c2), { sw: 3, hl: false });
    });
  });
  tpl('wheat', ['#e8bd5a', '#a9c260', null], 14, function (p) {
    var s = tube('M32 58V24', 3, p.c2) + body(LF(32, 58, 17, 46, 9), p.c2, { sw: 3, hl: false, off: 2 }), y;
    var ys = [45, 36, 27];
    for (var i = 0; i < ys.length; i++) {
      y = ys[i];
      s += body(LF(32, y + 3, 20.5, y - 8, 8.5), p.c1, { sw: 3, hl: false, off: 2.4 }) + body(LF(32, y + 3, 43.5, y - 8, 8.5), p.c1, { sw: 3, hl: false, off: 2.4 });
    }
    s += body(LF(32, 30, 32, 5, 9), p.c1, { sw: 3, hl: [30.2, 14, 1.2, 4.5, 0], off: 2.4, g: false });
    return rotg(10, 32, 34, function () { return s; });
  });
  tpl('flower', ['#ff8fb5', '#ffd23f', '#6fc062'], 15, function (p) {
    var n = Math.max(3, Math.min(10, p.n | 0 || 5)), s = '', i;
    s += tube('M32 44Q31 52 33 58', 2.6, p.c3) + body(LF(32, 53, 18, 44, 9), p.c3, { sw: 3, hl: false, off: 2 }) + body(LF(32, 51, 46, 42, 9), p.c3, { sw: 3, hl: false, off: 2 });
    for (i = 0; i < n; i++) (function (a) {
      s += rotg(a, 32, 24, function () { return body(E(32, 13, n > 6 ? 5.6 : 7, 9.5), p.c1, { b: [25, 3.5, 14, 19], hl: i === 0 ? null : false, off: 3, sw: 3 }); });
    })(360 / n * i);
    s += body(E(32, 24, 7.5, 7.5), p.c2, { b: [24.5, 16.5, 15, 15], g: true, gk: 0.7, over: dot(29.5, 26, 0.9, dark(p.c2)) + dot(34, 27, 0.9, dark(p.c2)) + dot(33, 22, 0.9, dark(p.c2)), hl: false, sw: 3 });
    return s;
  });
  tpl('bulb', ['#f4d28a', '#6fc062', null], 18, function (p) {
    return tube('M32 12Q31 6 35 2.5', 2.6, p.c2) +
      body('M32 10C34 20 50 26 52 40C54 52 44 58 32 58C20 58 10 52 12 40C14 26 30 20 32 10Z', p.c1, {
        b: [11, 10, 42, 48], g: true, over: ln('M32 17Q21 34 25 54', dark(p.c1), 2.2, 0.75) + ln('M32 17Q43 34 39 54', dark(p.c1), 2.2, 0.75)
      });
  });
  tpl('grape', ['#a47be0', '#6fc062', '#8a6a3a'], 18, function (p) {
    function g(cx, cy, first) { return body(E(cx, cy, 9.6, 9.6), p.c1, { b: [cx - 9.6, cy - 9.6, 19.2, 19.2], g: first, gk: 0.8, off: 3.4, sw: 3.2 }); }
    return tube('M32 18Q31 10 34 5', 2.4, p.c3) + body(LF(33, 10, 50, 5, 9), p.c2, { sw: 3, hl: false, off: 2 }) +
      g(32, 44) + g(26, 33) + g(38, 33) + g(20, 22) + g(32, 22) + g(44, 22, false) + '';
  });

  /* ---- fish (v: slim | round | flat) ---- */
  function fishShape(p, o) {
    var cx = o.cx, cy = o.cy, rx = o.rx, ry = o.ry, tx = cx + rx - 2, s = '', ex, ey;
    s += body('M' + tx + ' ' + cy + 'L' + (tx + o.tl) + ' ' + (cy - o.th) + 'Q' + (tx + o.tl - 5) + ' ' + cy + ' ' + (tx + o.tl) + ' ' + (cy + o.th) + 'Z', p.c3, { sw: 3, hl: false, off: 2.5 });
    if (o.fin) {
      s += body('M' + r(cx - rx * 0.35) + ' ' + (cy - ry + 3) + 'Q' + r(cx + rx * 0.1) + ' ' + (cy - ry - o.fin) + ' ' + r(cx + rx * 0.5) + ' ' + (cy - ry + 3) + 'Z', p.c3, { sw: 3, hl: false, off: 2 });
      s += body('M' + (cx - 2) + ' ' + (cy + ry - 3) + 'Q' + (cx + 4) + ' ' + r(cy + ry + o.fin * 0.8) + ' ' + r(cx + rx * 0.35) + ' ' + (cy + ry - 3) + 'Z', p.c3, { sw: 3, hl: false, off: 2 });
    }
    var belly = 'M' + (cx - rx) + ' ' + cy + 'Q' + cx + ' ' + r(cy + ry * 0.35) + ' ' + (cx + rx) + ' ' + cy + 'A' + rx + ' ' + ry + ' 0 0 1 ' + (cx - rx) + ' ' + cy + 'Z';
    s += body(E(cx, cy, rx, ry), p.c1, { b: [cx - rx, cy - ry, rx * 2, ry * 2], g: true, over: '<path d="' + belly + '" fill="' + p.c2 + '"/>' + (o.spots || '') });
    ex = cx - rx * 0.5; ey = cy - ry * 0.2;
    s += ln('M' + r(cx - rx * 0.25) + ' ' + r(cy - ry * 0.55) + 'Q' + r(cx - rx * 0.05) + ' ' + cy + ' ' + r(cx - rx * 0.25) + ' ' + r(cy + ry * 0.55), dark(p.c1), 2.2, 0.8);
    s += '<circle cx="' + r(ex) + '" cy="' + r(ey) + '" r="3.5" fill="#fff" stroke="' + INK + '" stroke-width="2"/>' + dot(ex - 0.4, ey + 0.2, 1.8, INK) + dot(ex + 0.6, ey - 0.8, 0.7, '#fff');
    s += ln('M' + r(cx - rx + 1) + ' ' + r(cy + ry * 0.2) + 'q2.2 1.4 4.4 0', INK, 1.8);
    return s;
  }
  /* ---- Stage 16 D1: species fish art (spec-driven side view: gradient body, belly highlight, scales, fins, eye shine) ---- */
  var FISH_SP = {
    perch: { x0: 6, sn: 3, ht: 13, hb: 12, xp: 25, xb: 26, x1: 45, pd: 5, tl: ['round', 12, 9], dor: [{ a: 15, b: 42, h: 8 }], anl: { a: 30, b: 43, h: 6 }, pel: 23, pat: 'bands', bands: [19, 25, 31, 37], gx: 15, eye: [12, 29, 3.4], mo: 4, ll: 1, scale: 1 },
    sarat: { x0: 7, sn: 2, ht: 15, hb: 15, xp: 27, xb: 27, x1: 46, pd: 5, tl: ['round', 11, 9], dor: [{ a: 20, b: 44, h: 6 }], anl: { a: 26, b: 44, h: 6 }, pel: 24, pat: 'diag', bands: [20, 27, 34, 41], gx: 16, eye: [13, 28, 3.4], mo: 3.6, scale: 1 },
    linh: { x0: 5, sn: 1, ht: 7.5, hb: 7, xp: 24, xb: 26, x1: 47, pd: 3.2, tl: ['fork', 13, 11], dor: [{ a: 25, b: 34, h: 6 }], anl: { a: 34, b: 44, h: 3.5 }, pel: 28, pat: 'stripe', gx: 13, eye: [10, 31, 3.2], mo: 3 },
    keo: { x0: 5, sn: 1, ht: 8, hb: 7, xp: 22, xb: 24, x1: 46, pd: 3.6, tl: ['round', 11, 8], dor: [{ a: 16, b: 28, h: 7 }, { a: 31, b: 44, h: 6 }], anl: { a: 32, b: 44, h: 4 }, pel: 20, pat: 'mottle', spots: [[22, 29, 2], [28, 31, 1.8], [34, 29, 2.2], [40, 31, 1.6], [26, 27, 1.5]], gx: 13, eye: [11, 29, 3.3], mo: 3 },
    thatlat: { x0: 6, sn: 3, ht: 13, hb: 8, xp: 20, xb: 24, x1: 50, pd: 3.4, tl: ['round', 7, 5], dor: [{ a: 16, b: 24, h: 4 }], anl: { a: 26, b: 51, h: 8 }, pel: 18, pat: 'mottle', spots: [[26, 29, 2.6], [33, 31, 2.4], [40, 31.5, 2.2], [22, 35, 1.8]], gx: 15, eye: [12, 28.5, 3.4], mo: 3.5 },
    catfish: { x0: 5, sn: 3, ht: 9, hb: 8, xp: 20, xb: 20, x1: 46, pd: 4.5, tl: ['round', 12, 8], dor: [{ a: 22, b: 44, h: 5 }], anl: { a: 24, b: 44, h: 5 }, pel: 24, pat: '', gx: 15, eye: [12, 29, 3], mo: 5, ll: 1, bar: ['M6 33Q1 31 2 26', 'M7 36Q1 38 2 44', 'M9 37Q5 42 7 47'] },
    carp: { x0: 6, sn: 3, ht: 14, hb: 12, xp: 24, xb: 26, x1: 45, pd: 5.5, tl: ['fork', 14, 11], dor: [{ a: 16, b: 38, h: 7 }], anl: { a: 34, b: 43, h: 6 }, pel: 26, pat: '', scale: 2, gx: 15, eye: [12, 29, 3.2], mo: 3, bar: ['M6 35Q2 38 3.6 42', 'M8 36Q5 40 7 43'] },
    tilapia: { x0: 6, sn: 2, ht: 15, hb: 12, xp: 25, xb: 27, x1: 45, pd: 5.5, tl: ['trunc', 12, 10], dor: [{ a: 14, b: 44, h: 8, n: 6 }], anl: { a: 34, b: 44, h: 6 }, pel: 26, pat: '', scale: 1, gx: 15, eye: [12, 28, 3.4], mo: 3.6 },
    snakehead: { x0: 4, sn: 1, ht: 9, hb: 8.5, xp: 16, xb: 18, x1: 47, pd: 6, tl: ['round', 11, 8.5], dor: [{ a: 14, b: 45, h: 5 }], anl: { a: 26, b: 45, h: 5 }, pel: 20, pat: 'blotch', spots: [[22, 28, 3.2, 2.4], [30, 30, 3.5, 2.6], [38, 29, 3.2, 2.4], [45, 31, 2.6, 2.2]], gx: 14, eye: [10, 29, 3], mo: 5.5, scale: 1 },
    eel: { path: 'M6 37C7 31 13 29 19 32C26 36 31 38 38 33C44 28 51 27 59 30C52 31 46 32 41 37C34 43 27 42 21 39C14 36 10 42 6 41C4 40 4 38 6 37Z', fin: 'M13 30C18 29 22 31 26 34C30 37 34 36 38 33C44 28 51 27 59 30C51 24.5 44 25.5 38 30.5C34 34 30 34 26 31C22 28 18 27 13 28Z', x0: 5, sn: 4, gx: 13, eye: [10, 35, 2.9], mo: 3, hlp: 'M12 33C18 33 24 36 30 37', pat: 'spots', spots: [[22, 34.5, 1.2], [30, 37, 1.2], [38, 34.5, 1.1]], cust: 1 },
    tra: { x0: 4, sn: 2, ht: 10, hb: 9.5, xp: 20, xb: 22, x1: 46, pd: 4, tl: ['fork', 14, 12], dor: [{ a: 20, b: 30, h: 10 }, { a: 39, b: 44, h: 3.5, n: 0 }], anl: { a: 28, b: 44, h: 6 }, pel: 24, pat: '', gx: 14, eye: [11, 29.5, 3.3], mo: 3.6, ll: 1, bar: ['M5 36Q0 36 1 41', 'M6 37Q2 40 4 45'] },
    bongtuong: { x0: 4, sn: 3, ht: 12, hb: 11, xp: 15, xb: 17, x1: 46, pd: 5, tl: ['round', 11, 8.5], dor: [{ a: 20, b: 30, h: 7 }, { a: 33, b: 44, h: 6 }], anl: { a: 34, b: 45, h: 4 }, pel: 18, pat: 'mottle', spots: [[20, 29, 2.6], [27, 31, 2.4], [34, 28, 2.6], [41, 31, 2.2], [24, 36, 2], [31, 36, 1.8], [38, 35, 2]], gx: 13, eye: [11, 27.5, 3.6], mo: 6 },
    lang: { x0: 4, sn: 3, ht: 10, hb: 9, xp: 18, xb: 20, x1: 46, pd: 4.2, tl: ['fork', 13, 11], dor: [{ a: 20, b: 28, h: 9 }, { a: 38, b: 44, h: 3.5, n: 0 }], anl: { a: 30, b: 43, h: 5 }, pel: 25, pat: 'spots', spots: [[22, 28, 1.6], [27, 27, 1.5], [32, 28, 1.6], [37, 29, 1.5], [25, 31, 1.4], [30, 32, 1.4], [35, 32.5, 1.4], [40, 31, 1.3]], gx: 13, eye: [10.5, 29, 3.2], mo: 4, ll: 1, bar: ['M5 35Q0 36 1 42', 'M6 36Q2 41 4 46', 'M5 32Q1 29 2 24'] },
    koi: { x0: 5, sn: 2, ht: 12, hb: 11, xp: 24, xb: 26, x1: 45, pd: 5, tl: ['fork', 14, 11], dor: [{ a: 20, b: 38, h: 6 }], anl: { a: 34, b: 43, h: 5 }, pel: 25, pat: 'patch', pt: [[22, 26, 7, 5, 0], [36, 29, 6, 4.5, 0], [14, 28, 3, 2.6, 1]], gx: 15, eye: [12, 28.5, 3.4], mo: 3, scale: 1, fw: 1, bar: ['M6 34Q2 36 3 40'] }
  };
  function fishArt(p, s) {
    var cy = 33, c1 = p.c1, c2 = p.c2, c3 = p.c3, fc = s.fw ? mix(c3, '#ffffff', 0.55) : c3, id = 'fg' + hash(p.sp + c1 + c2), x0 = s.x0, x1 = s.x1, ht = s.ht, hb = s.hb, xp = s.xp, xb = s.xb, pd = s.pd, sn = s.sn || 0;
    var out = '', i, j, k, bp, t, tx, tp = s.tl, d, e, sz, xx, yy, n;
    function top(x) { var u; if (x <= xp) { u = Math.max(0, (x - x0) / (xp - x0)); return cy - ht * Math.sin(u * 1.5708) * 0.95 - 1; } u = Math.min(1, (x - xp) / (x1 - xp)); return cy - (ht + (pd - ht) * u * u * (3 - 2 * u)); }
    function bot(x) { var u; if (x <= xb) { u = Math.max(0, (x - x0) / (xb - x0)); return cy + sn + (hb - sn) * Math.sin(u * 1.5708); } u = Math.min(1, (x - xb) / (x1 - xb)); return cy + hb + (pd - hb) * u * u * (3 - 2 * u); }
    function fin(ax, ay, bx, by, cx, cyy, nr, col, sw) {
      var f = '<path d="M' + r(ax) + ' ' + r(ay) + 'Q' + r(bx) + ' ' + r(by) + ' ' + r(cx) + ' ' + r(cyy) + 'Z" fill="' + col + '" stroke="' + INK + '" stroke-width="' + (sw || 2.4) + '" stroke-linejoin="round"/>', q, u, bxx, byy, qx, qy;
      for (q = 1; q <= nr; q++) {
        u = q / (nr + 1); bxx = ax + (cx - ax) * u; byy = ay + (cyy - ay) * u;
        qx = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * bx + u * u * cx; qy = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * by + u * u * cyy;
        f += ln('M' + r(bxx) + ' ' + r(byy) + 'L' + r(qx) + ' ' + r(qy), dark(col), 1, 0.5);
      }
      return f;
    }
    if (s.cust) { bp = s.path; out += '<path d="' + s.fin + '" fill="' + fc + '" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/>'; }
    else {
      tx = x1 + tp[1]; d = tp[2];
      bp = 'M' + x0 + ' ' + (cy + sn) + 'C' + (x0 + 1) + ' ' + r(cy - ht * 0.6) + ' ' + r(xp - 10) + ' ' + (cy - ht) + ' ' + xp + ' ' + (cy - ht) + 'C' + r((xp + x1) / 2 + 3) + ' ' + (cy - ht) + ' ' + (x1 - 7) + ' ' + r(cy - pd - 0.5) + ' ' + x1 + ' ' + (cy - pd) +
        'L' + x1 + ' ' + (cy + pd) + 'C' + (x1 - 7) + ' ' + r(cy + pd + 0.5) + ' ' + r((xb + x1) / 2) + ' ' + (cy + hb) + ' ' + xb + ' ' + (cy + hb) + 'C' + r(xb - 11) + ' ' + (cy + hb) + ' ' + (x0 + 1) + ' ' + r(cy + sn + hb * 0.5) + ' ' + x0 + ' ' + (cy + sn) + 'Z';
      if (tp[0] === 'fork') t = 'M' + (x1 - 2) + ' ' + r(cy - pd) + 'Q' + r(x1 + tp[1] * 0.5) + ' ' + r(cy - d * 0.6) + ' ' + tx + ' ' + (cy - d) + 'Q' + r(tx - tp[1] * 0.3) + ' ' + cy + ' ' + tx + ' ' + (cy + d) + 'Q' + r(x1 + tp[1] * 0.5) + ' ' + r(cy + d * 0.6) + ' ' + (x1 - 2) + ' ' + r(cy + pd) + 'Z';
      else if (tp[0] === 'trunc') t = 'M' + (x1 - 2) + ' ' + r(cy - pd) + 'Q' + r(x1 + tp[1] * 0.5) + ' ' + r(cy - d * 0.7) + ' ' + tx + ' ' + (cy - d) + 'L' + tx + ' ' + (cy + d) + 'Q' + r(x1 + tp[1] * 0.5) + ' ' + r(cy + d * 0.7) + ' ' + (x1 - 2) + ' ' + r(cy + pd) + 'Z';
      else t = 'M' + (x1 - 2) + ' ' + r(cy - pd) + 'C' + r(x1 + tp[1] * 0.4) + ' ' + r(cy - d) + ' ' + tx + ' ' + r(cy - d * 0.7) + ' ' + tx + ' ' + cy + 'C' + tx + ' ' + r(cy + d * 0.7) + ' ' + r(x1 + tp[1] * 0.4) + ' ' + r(cy + d) + ' ' + (x1 - 2) + ' ' + r(cy + pd) + 'Z';
      out += '<path d="' + t + '" fill="' + fc + '" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>';
      for (k = -1; k <= 1; k += 2) out += ln('M' + (x1 + 2) + ' ' + cy + 'L' + r(tx - 2) + ' ' + r(cy + k * d * 0.55), dark(fc), 1, 0.5);
      for (i = 0; i < s.dor.length; i++) { e = s.dor[i]; xx = (e.a + e.b) / 2; out += fin(e.a, top(e.a) + 3, xx, top(xx) - e.h * 2, e.b, top(e.b) + 3, e.n === undefined ? 3 : e.n, fc); }
      e = s.anl; xx = (e.a + e.b) / 2; out += fin(e.a, bot(e.a) - 3, xx, bot(xx) + e.h * 2, e.b, bot(e.b) - 3, 3, fc);
      out += fin(s.pel - 4, bot(s.pel) - 2, s.pel - 5, bot(s.pel) + 12, s.pel + 3, bot(s.pel) - 1, 2, fc, 2.2);
    }
    /* body: vertical gradient (dark back -> body -> pale belly) + clip for the overlays */
    out += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix(c1, '#2a1a20', 0.22) + '"/><stop offset="0.45" stop-color="' + c1 + '"/><stop offset="0.8" stop-color="' + mix(c1, c2, 0.6) + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient><clipPath id="' + id + 'c"><path d="' + bp + '"/></clipPath></defs>';
    out += '<path d="' + bp + '" fill="url(#' + id + ')" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/><g clip-path="url(#' + id + 'c)">';
    if (s.cust) out += ln(s.hlp, '#ffffff', 2.4, 0.35);
    else {
      out += '<ellipse cx="' + r((x0 + x1) / 2 + 2) + '" cy="' + r(cy + hb * 0.62) + '" rx="' + r((x1 - x0) * 0.36) + '" ry="' + r(hb * 0.3) + '" fill="#fff" opacity="0.3"/>';
      out += '<ellipse cx="' + r(xp) + '" cy="' + r(cy - ht * 0.72) + '" rx="' + r((x1 - x0) * 0.28) + '" ry="1.8" fill="#fff" opacity="0.22"/>';
      if (s.scale) {
        sz = s.scale === 2 ? 6.5 : 4.6;
        for (j = 0; j < 3; j++) for (xx = s.gx + 4 + (j % 2) * sz * 0.5; xx < x1 - 2; xx += sz) out += ln('M' + r(xx) + ' ' + r(cy - ht * 0.5 + j * sz * 0.95) + 'q' + r(sz * 0.45) + ' ' + r(sz * 0.55) + ' 0 ' + r(sz * 1.1), dark(c1), 1, 0.3);
      }
      if (s.ll) out += ln('M' + (s.gx + 2) + ' ' + (cy - 1) + 'Q' + r((s.gx + x1) / 2) + ' ' + (cy - 2.5) + ' ' + x1 + ' ' + cy, dark(c1), 1.1, 0.45);
    }
    n = s.pat;
    if (n === 'bands') for (i = 0; i < s.bands.length; i++) out += ln('M' + s.bands[i] + ' ' + (cy - ht - 1) + 'Q' + (s.bands[i] + 2.4) + ' ' + cy + ' ' + s.bands[i] + ' ' + (cy + hb + 1), c3, 2.8, 0.55);
    else if (n === 'diag') for (i = 0; i < s.bands.length; i++) out += ln('M' + s.bands[i] + ' ' + (cy - ht - 1) + 'L' + (s.bands[i] + 9) + ' ' + (cy + hb + 1), c3, 2.4, 0.5);
    else if (n === 'stripe') out += ln('M' + s.gx + ' ' + (cy - 0.5) + 'L' + x1 + ' ' + (cy - 0.5), '#ffffff', 2.4, 0.6);
    else if (n === 'spots' || n === 'mottle') for (i = 0; i < s.spots.length; i++) e = s.spots[i], out += '<circle cx="' + e[0] + '" cy="' + e[1] + '" r="' + e[2] + '" fill="' + c3 + '" opacity="' + (n === 'spots' ? 0.8 : 0.6) + '"/>';
    else if (n === 'blotch') for (i = 0; i < s.spots.length; i++) e = s.spots[i], out += '<ellipse cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] + '" ry="' + e[3] + '" fill="' + c3 + '" opacity="0.55"/>';
    else if (n === 'patch') for (i = 0; i < s.pt.length; i++) e = s.pt[i], out += '<ellipse cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] + '" ry="' + e[3] + '" fill="' + (e[4] ? '#3a3036' : c3) + '" opacity="0.92"/>';
    out += '</g>';
    if (!s.cust) {
      yy = cy + hb * 0.25;
      out += fin(s.gx + 1.5, yy, s.gx + 10, yy + 1, s.gx + 8, yy + hb * 0.6, 2, fc, 1.9);
    }
    out += ln('M' + s.gx + ' ' + r(cy - (s.cust ? 3 : ht * 0.6)) + 'Q' + (s.gx - 3) + ' ' + (cy + (s.cust ? 2 : 0)) + ' ' + s.gx + ' ' + r(cy + (s.cust ? 6 : hb * 0.65)), dark(c1), 2, 0.8);
    if (s.bar) for (i = 0; i < s.bar.length; i++) out += ln(s.bar[i], INK, 1.7);
    e = s.eye;
    out += '<circle cx="' + e[0] + '" cy="' + e[1] + '" r="' + e[2] + '" fill="#fff" stroke="' + INK + '" stroke-width="2"/>' + dot(e[0] - 0.3, e[1] + 0.3, r(e[2] * 0.58), INK) + dot(e[0] + 0.8, e[1] - 0.9, r(e[2] * 0.24), '#fff');
    out += ln('M' + (x0 + 0.5) + ' ' + r(cy + sn + 1.2) + 'q' + r(s.mo * 0.4) + ' ' + r(s.mo * 0.45) + ' ' + s.mo + ' 0.2', INK, 1.7);
    return out;
  }
  tpl('fish', ['#7fb8e8', '#f3f6fa', '#4f8fc8'], 22, function (p) {
    if (p.sp && FISH_SP[p.sp]) return fishArt(p, FISH_SP[p.sp]);
    var v = p.v || 'slim';
    if (v === 'round') return fishShape(p, { cx: 28, cy: 33, rx: 19, ry: 17, tl: 13, th: 10, fin: 8, spots: ln('M33 19Q38 33 33 47', dark(p.c1), 2.4, 0.5) });
    if (v === 'flat') {
      var s = body(E(30, 33, 26.5, 18.5), p.c3, { sw: 3, hl: false, off: 3 }) +
        body('M51 33L61 25Q57.5 33 61 41Z', p.c3, { sw: 3, hl: false, off: 2 }) +
        body(E(30, 33, 22, 15), p.c1, { b: [8, 18, 44, 30], g: true, over: ln('M16 36Q30 41 46 33', dark(p.c1), 2.2, 0.55) + dot(34, 29, 1.7, p.c3) + dot(41, 33.5, 1.6, p.c3) + dot(27, 38.5, 1.5, p.c3) });
      var eyes = [[15, 30], [23, 26]];
      for (var i = 0; i < 2; i++) s += '<circle cx="' + eyes[i][0] + '" cy="' + eyes[i][1] + '" r="3.8" fill="#fff" stroke="' + INK + '" stroke-width="2"/>' + dot(eyes[i][0] - 0.3, eyes[i][1] + 0.3, 1.9, INK) + dot(eyes[i][0] + 0.7, eyes[i][1] - 0.8, 0.7, '#fff');
      return s + ln('M10.5 39q3 2 6 0', INK, 1.8);
    }
    return fishShape(p, { cx: 29, cy: 33, rx: 21, ry: 10.5, tl: 12, th: 9, fin: 7, spots: dot(30, 28, 1.7, p.c3) + dot(37, 29.5, 1.7, p.c3) + dot(44, 31, 1.5, p.c3) });
  });

  /* ---- junk ---- */
  tpl('boot', ['#7fb3a3', '#a9d1c4', '#6b7078'], 22, function (p) {
    return body('M17 11Q17 6 22 6H35Q40 6 40 11V32Q40 37 46 39Q58 42 58 50Q58 56 52 56H21Q14 56 14 50Z', p.c1, {
      b: [14, 6, 44, 50], g: true,
      over: '<path d="M14 47H58V50Q58 56 52 56H21Q14 56 14 50Z" fill="' + p.c3 + '"/>' + ln('M14 47H58', INK, 2.4, 0.9) +
        rect(22, 26, 10, 9, p.c2) + ln('M22 26h10v9h-10z', dark(p.c1), 1.6, 0.9) + ln('M24 28.5h6M24 32.5h6', dark(p.c1), 1.4, 0.7, ' stroke-dasharray="1.5 2"')
    }) + body(RR(15, 6, 27, 9, 3.5), p.c2, { sw: 3, hl: false, off: 2 }) + body(LF(41, 14, 52, 24, 7), '#79b86a', { sw: 2.6, hl: false, off: 2 });
  });
  tpl('driftwood', ['#c9a27a', '#e3c9a4', null], 22, function (p) {
    return rotg(25, 35, 36, function () { return body(RR(30, 6, 10, 32, 5), p.c1, { sw: 3, hl: [33, 20, 1.2, 7, 0], off: 3 }); }) +
      rotg(-16, 32, 38, function () {
        return body(RR(5, 31, 52, 15, 7.5), p.c1, {
          hl: [30, 35, 12, 1.6, 0], b: [5, 31, 52, 15], g: true,
          over: ln('M20 40H29M38 42H47', dark(p.c1), 2.2, 0.75) + '<ellipse cx="45" cy="37" rx="2.8" ry="2" fill="' + dark(p.c1) + '" opacity=".7"/>'
        }) + body(E(9.5, 38.5, 3.8, 7), p.c2, { sh: false, hl: false, sw: 2.6 }) +
          '<ellipse cx="9.5" cy="38.5" rx="1.5" ry="3.4" fill="none" stroke="' + dark(p.c1) + '" stroke-width="1.4"/>';
      });
  });
  tpl('bag', ['#dff1f7', '#7fc4e0', null], 18, function (p) {
    return tube('M21 24C16 6 30 5 31 24', 2.6, p.c1) + tube('M33 24C34 5 49 7 43 23', 2.6, p.c1) +
      body('M17 22C11 36 12 50 14 53C28 60 44 60 50 53C52 50 53 36 47 22C40 26 24 26 17 22Z', p.c1, {
        b: [12, 22, 40, 36], g: true, dk: mix(p.c1, '#7aa9c4', 0.55),
        over: ln('M22 34Q26 40 22 49M32 33Q35 43 31 54M42 33Q40 42 43 50', INK, 2, 0.35) + '<circle cx="32" cy="44" r="4.4" fill="none" stroke="' + p.c2 + '" stroke-width="2.4"/>'
      });
  });

  /* ---- fertilizer sack (c1 sack, c2 label colour) ---- */
  tpl('sack', ['#e9d7a8', '#79c75a', '#d65f4f'], 19, function (p) {
    return body('M19 18L22 8Q26 5 32 8Q38 5 42 8L45 18Z', p.c1, { sw: 3, hl: false, off: 2.5 }) +
      body('M17 17C10 28 11 46 13 51Q14 57 21 57H43Q50 57 51 51C53 46 54 28 47 17Z', p.c1, { b: [11, 17, 42, 40], hl: [19, 30, 1.8, 8, 12] }) +
      body(RR(19, 13, 26, 6, 3), p.c3, { sw: 3, hl: false, off: 2 }) +
      body(RR(20, 27, 24, 23, 5), p.c2, { sw: 3, off: 3, b: [20, 27, 24, 23], hl: false, over:
        '<path d="' + LF(32, 45, 24, 35, 8.5) + '" fill="#fffaf0" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="' + LF(32, 45, 41, 35, 8.5) + '" fill="#fffaf0" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' + ln('M32 46.5V38', INK, 2.2) });
  });

  /* ---- bait (v: worm | dough | minnow) ---- */
  tpl('bait', ['#ff9fae', '#f6e3b8', null], 20, function (p) {
    var v = p.v || 'worm';
    if (v === 'minnow') return fishShape({ c1: p.c1b || '#bcd5e6', c2: '#f4f7fa', c3: '#8fb1cc' }, { cx: 30, cy: 33, rx: 17, ry: 8.5, tl: 11, th: 8, fin: 5.5, spots: '' });
    if (v === 'dough') {
      return tube('M45 12V31Q45 39 38 39', 2.4, '#b3bcc6') +
        body('M12 40C10 24 26 16 38 20C52 22 56 38 50 48C44 58 20 58 12 40Z', p.c2, {
          b: [10, 18, 46, 40], g: true,
          over: '<ellipse cx="26" cy="35" rx="3.6" ry="2.6" fill="' + dark(p.c2) + '" opacity=".45"/><ellipse cx="39" cy="31" rx="3" ry="2.3" fill="' + dark(p.c2) + '" opacity=".45"/><ellipse cx="36" cy="45" rx="3.2" ry="2.3" fill="' + dark(p.c2) + '" opacity=".45"/>'
        });
    }
    var path = 'M15 49C13 36 28 42 30 31C32 20 44 20 46 32';
    return body(E(32, 50, 21, 7), '#a8744c', { sw: 3, hl: false, off: 3 }) +
      ln(path, INK, 9 + SW) + ln(path, p.c1, 9) + ln(path, dark(p.c1), 9, 0.4, ' stroke-dasharray="1.3 6.2" stroke-linecap="butt"') +
      '<path d="' + path + '" transform="translate(-1.6 -1.8)" fill="none" stroke="' + lite(p.c1) + '" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>' +
      dot(44, 30.5, 1.4, INK) + dot(48, 30.5, 1.4, INK) + ln('M44.6 34q1.4 1.2 2.8 0', INK, 1.3);
  });

  /* ---- food / key / money ---- */
  tpl('bread', ['#e0a458', '#f6d9a0', null], 21, function (p) {
    var sl = '', cuts = [[18, 36, 26, 23], [28, 37, 36, 24], [38, 37, 46, 27]];
    for (var i = 0; i < cuts.length; i++) sl += '<path d="' + LF(cuts[i][0], cuts[i][1], cuts[i][2], cuts[i][3], 6.5) + '" fill="' + p.c2 + '" stroke="' + dark(p.c1) + '" stroke-width="1.6" stroke-linejoin="round"/>';
    return body('M8 40C5 22 22 15 32 16C42 15 59 22 56 40C57 52 51 55 44 55H20C13 55 7 52 8 40Z', p.c1, {
      b: [6, 16, 51, 39], g: true,
      over: '<path d="M8 43Q32 49 56 43C57 52 51 55 44 55H20C13 55 7 52 8 43Z" fill="' + mix(p.c1, '#8a4a2a', 0.28) + '"/>' + sl
    });
  });
  tpl('bowl', ['#8ec5e8', '#ffe9b8', '#ff8f6b'], 23, function (p) {
    var tx = '<ellipse cx="22" cy="24" rx="2.4" ry="1.7" fill="#fff" opacity=".8"/><ellipse cx="32" cy="20" rx="2.4" ry="1.7" fill="#fff" opacity=".8"/><ellipse cx="45" cy="26" rx="2.4" ry="1.7" fill="#fff" opacity=".8"/>';
    return ln('M24 12Q19 8 24 4M34 11Q29 7 34 3', INK, 2.4, 0.3) +
      body('M12 32C12 20 22 14 32 14C42 14 52 20 52 32Z', p.c2, { b: [12, 14, 40, 18], g: true, over: tx }) +
      body(E(40, 22, 4.2, 4.2), p.c3, { sw: 2.4, off: 2, hl: false }) +
      body('M7 31H57C57 47 47 56 32 56C17 56 7 47 7 31Z', p.c1, { b: [7, 31, 50, 25], over: ln('M15 45Q32 52 49 45', '#fff8e0', 2.6, 0.7) }) +
      body(RR(5, 28, 54, 7, 3.5), lite(p.c1), { sw: 3, hl: false, off: 2 });
  });
  tpl('notebook', ['#b88ae0', '#ffd23f', '#ff8f6b'], 19, function (p) {
    return rotg(-6, 32, 34, function () {
      return body(RR(17, 12, 35, 47, 4), '#fff6e0', { sw: 3, hl: false, off: 3 }) +
        body(RR(13, 8, 36, 48, 5), p.c1, {
          b: [13, 8, 36, 48], g: true,
          over: '<path d="M18 8H21V56H18Q13 56 13 51V13Q13 8 18 8Z" fill="' + dark(p.c1) + '"/>' + rect(40, 8, 4, 48, p.c3) + ln('M40 8V56M44 8V56', INK, 1.6, 0.7)
        }) +
        body(RR(24, 16, 14, 16, 3.5), '#fff6e0', { sh: false, hl: false, sw: 2.4, over: '<path d="' + star(31, 24.5, 5.2, 2.4, 5) + '" fill="' + p.c2 + '" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/>' });
    });
  });
  tpl('coin', ['#ffd23f', null, null], 18, function (p) {
    var edge = mix(p.c1, '#7a3d2c', 0.38);
    return body(E(32, 37, 22, 21), edge, { sh: false, hl: false }) +
      body(E(32, 32, 22, 21), p.c1, {
        b: [10, 11, 44, 42], hl: [20, 19, 6, 2.4, -38], g: [18, 18.5],
        over: '<ellipse cx="32" cy="32" rx="15.5" ry="14.5" fill="none" stroke="' + dark(p.c1) + '" stroke-width="2.4"/>' +
          '<path d="' + star(32, 32.5, 8, 3.8, 5) + '" fill="' + lite(p.c1) + '" stroke="' + dark(p.c1) + '" stroke-width="1.8" stroke-linejoin="round"/>'
      });
  });

  /* ---------------------------------------------------------------- shape aliases + fallback */
  var SHAPE = {
    leafy: 'leafy', leaf: 'leafy', head: 'leafy', long: 'longroot', root: 'longroot', longroot: 'longroot', round: 'roundroot', roundroot: 'roundroot',
    tuber: 'tuber', fruit: 'fruit', round_fruit: 'fruit', longfruit: 'longfruit', long_fruit: 'longfruit', gourd: 'gourd', squash: 'gourd', berry: 'berry',
    pod: 'pod', bean: 'pod', corn: 'corn', wheat: 'wheat', grain: 'wheat', flower: 'flower', bulb: 'bulb', grape: 'grape', vine: 'grape'
  };
  var CROP_TPLS = ['leafy', 'longroot', 'roundroot', 'tuber', 'fruit', 'longfruit', 'gourd', 'berry', 'pod', 'bulb'];

  function fallbackSpec(def) {
    var id = String(def.id || def.name || 'x'), c1 = hashColor(id), c2 = hashColor(id, 'b'), h = hash(id);
    var shape = String(def.shape || def['class'] || '').toLowerCase(), t;
    switch (def.cat) {
      case 'tool': return { tpl: /can|water/.test(id) ? 'can' : /rod|pole|fish/.test(id) ? 'rod' : 'hoe', c1: c1, c2: '#a9bdd0' };
      case 'seed': return { tpl: 'seed', c1: c1, c3: '#79c75a', v: shape === 'long' ? 'long' : shape === 'leafy' ? 'leaf' : 'round' };
      case 'crop':
        t = SHAPE[shape] || CROP_TPLS[h % CROP_TPLS.length];
        return { tpl: t, c1: c1, c2: t === 'flower' ? '#ffd23f' : '#6fc062', c3: t === 'flower' ? '#6fc062' : undefined, n: 5 };
      case 'fish':
        return { tpl: 'fish', v: /slim|round|flat/.test(shape) ? shape : ['slim', 'round', 'flat'][h % 3], c1: c1, c2: '#f3f6fa', c3: mix(c1, '#2f5f9a', 0.4) };
      case 'fertilizer': return { tpl: 'sack', c1: '#e9d7a8', c2: c1 };
      case 'bait': return { tpl: 'bait', v: /worm|dough|minnow/.test(shape) ? shape : /worm/.test(id) ? 'worm' : /minnow/.test(id) ? 'minnow' : 'dough', c1: '#ff9fae', c2: '#f6e3b8' };
      case 'food': return { tpl: 'bowl', c1: c1, c2: c2, c3: '#ff8f6b' };
      case 'key': return { tpl: 'notebook', c1: c1, c2: '#ffd23f' };
      default:
        t = /boot/.test(shape + id) ? 'boot' : /wood|stick|branch/.test(shape + id) ? 'driftwood' : /bag|plastic/.test(shape + id) ? 'bag' : ['boot', 'driftwood', 'bag'][h % 3];
        return { tpl: t };
    }
  }

  /* ---------------------------------------------------------------- build */
  var cache = Object.create(null);
  function wrap(inner, px, shadowRx) {
    px = px || 36;
    return '<svg class="tvi" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false" style="overflow:visible">' +
      (shadowRx ? '<ellipse cx="32" cy="58" rx="' + shadowRx + '" ry="3.4" fill="' + INK + '" opacity=".16"/>' : '') + inner + '</svg>';
  }
  function begin(key) { ctx.id = 'i' + hash(key).toString(36) + '_'; ctx.n = 0; ctx.rot = 0; ctx.sc = 1; }

  function buildItem(spec, tier, px, noShadow) {
    var t = T[spec.tpl];
    if (!t) { spec = fallbackSpec({ cat: 'junk', id: spec.tpl || 'x' }); t = T[spec.tpl]; }
    var key = 'item|' + [spec.tpl, spec.c1, spec.c2, spec.c3, spec.v, spec.n, tier, px, noShadow ? 1 : 0].join('|');
    if (cache[key]) return cache[key];
    var p = {
      c1: col(spec.c1, t.d[0] || '#ffd23f'), c2: col(spec.c2, t.d[1] || '#ffffff'), c3: col(spec.c3, t.d[2] || undefined),
      v: spec.v, n: spec.n, tc: TIER_COL[Math.max(0, Math.min(3, tier | 0))]
    };
    begin(key);
    cache[key] = wrap(t.f(p), px, noShadow ? 0 : t.sh);
    return cache[key];
  }

  /* ---------------------------------------------------------------- UI icons */
  var U = {};
  function uic(name, fn) { U[name] = fn; }

  uic('clock', function (c) {
    var s = body(E(32, 32, 25, 25), c || '#ffc859', { b: [7, 7, 50, 50], g: true });
    s += body(E(32, 32, 17.5, 17.5), '#fff8e8', { sh: false, hl: false, sw: 2.6 });
    s += dot(32, 18.5, 1.5, INK) + dot(32, 45.5, 1.5, INK) + dot(18.5, 32, 1.5, INK) + dot(45.5, 32, 1.5, INK);
    s += ln('M32 32V22', INK, 4) + ln('M32 32L40 37', INK, 4) + dot(32, 32, 2.6, INK);
    return s;
  });
  uic('coin', function (c) { return T.coin.f({ c1: col(c, '#ffd23f') }); });
  uic('energy', function (c) {
    return body('M38 4L14 36H28L24 60L50 26H36L44 4Z', c || '#ffd93d', { hl: [30, 14, 2, 6, 25], g: [25, 24], off: 3.5 });
  });
  function sunShape(c, face) {
    var s = '', i;
    for (i = 0; i < 8; i++) s += rotg(i * 45, 32, 32, function () { return body(RR(28.5, 3.5, 7, 12, 3.5), lite(c), { sw: 3, hl: false, off: 2, sh: false }); });
    s += body(E(32, 32, 15.5, 15.5), c, { b: [16.5, 16.5, 31, 31], g: true, gk: 0.8 });
    if (face) s += dot(27, 33, 1.6, INK) + dot(37, 33, 1.6, INK) + ln('M29.5 38Q32 40.5 34.5 38', INK, 1.8) + dot(24, 37, 2, '#ff9a8a') + dot(40, 37, 2, '#ff9a8a');
    return s;
  }
  uic('sun', function (c) { return sunShape(c || '#ffc83d', true); });
  var CLOUD = 'M18 46C8 46 6 32 16 30C16 20 28 16 34 22C40 14 54 20 50 32C60 34 58 46 48 46Z';
  function cloud(dy) { return '<g transform="translate(0 ' + dy + ')">' + body(CLOUD, '#f2f8fc', { b: [6, 16, 54, 30], g: true, dk: '#b7d2e6', lt: '#ffffff', off: 3.5 }) + '</g>'; }
  uic('cloud', function () { return cloud(4); });
  uic('rain', function () {
    var s = cloud(-6), d = [[19, 55], [32, 57], [45, 55]];
    for (var i = 0; i < d.length; i++) s += '<path d="' + tear(d[i][0], d[i][1]) + '" fill="#6bb6ee" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>';
    return s;
  });
  uic('snow', function () {
    var s = cloud(-6), d = [[19, 54], [32, 58], [45, 54]];
    for (var i = 0; i < d.length; i++) s += '<circle cx="' + d[i][0] + '" cy="' + d[i][1] + '" r="3.6" fill="#fff" stroke="' + INK + '" stroke-width="2.6"/>';
    return s;
  });
  uic('sprout', function () {
    return body(E(32, 53, 19, 6.5), '#b98a5e', { sw: 3, hl: false, off: 3 }) + tube('M32 53V30', 3.2, '#79c75a') +
      body(LF(32, 38, 11, 20, 15), '#8bd36b', { b: [11, 20, 21, 18], g: true, gk: 0.7, off: 3 }) + body(LF(32, 31, 54, 12, 15), '#79c75a', { hl: false, off: 3 });
  });
  uic('maple', function (c) {
    c = c || '#f08a4b';
    return body('M32 5L37 16L46 11L44 25L57 22L50 34L56 43L41 42L41 51L34 49L32 60L30 49L23 51L23 42L8 43L14 34L7 22L20 25L18 11L27 16Z', c, {
      hl: [24, 24, 2.2, 7, 30], g: [22, 20], off: 3.5, over: ln('M32 49V16M32 38L44 26M32 38L20 26', dark(c), 2, 0.7)
    });
  });
  uic('snowflake', function (c) {
    var d = '', a, k, ex, ey;
    function pt(deg, rad) { var q = deg * Math.PI / 180; return r(32 + Math.cos(q) * rad) + ' ' + r(32 + Math.sin(q) * rad); }
    for (k = 0; k < 6; k++) {
      a = k * 60 - 90;
      d += 'M32 32L' + pt(a, 25) + 'M' + pt(a, 15) + 'L' + pt(a - 40, 22) + 'M' + pt(a, 15) + 'L' + pt(a + 40, 22);
    }
    return ln(d, INK, 7.2) + ln(d, c || '#8fd3f4', 3.6) + body(E(32, 32, 5.5, 5.5), '#e9f8ff', { sw: 3, hl: false, off: 2 });
  });
  uic('menu', function (c) {
    return body(RR(8, 10, 48, 11, 5.5), c || '#ffcf6b', { hl: [18, 14, 5, 1.2, 0], off: 2.5 }) + body(RR(8, 26.5, 48, 11, 5.5), c || '#ffcf6b', { hl: [18, 30.5, 5, 1.2, 0], off: 2.5 }) +
      body(RR(8, 43, 48, 11, 5.5), c || '#ffcf6b', { hl: [18, 47, 5, 1.2, 0], off: 2.5 });
  });
  uic('dots', function (c) {
    return body(E(14, 32, 6.5, 6.5), c || '#ffcf6b', { hl: false, off: 2.5 }) + body(E(32, 32, 6.5, 6.5), c || '#ffcf6b', { hl: false, off: 2.5 }) +
      body(E(50, 32, 6.5, 6.5), c || '#ffcf6b', { hl: false, off: 2.5 });
  });
  uic('close', function (c) {
    return body('M32 22L46 8L56 18L42 32L56 46L46 56L32 42L18 56L8 46L22 32L8 18L18 8Z', c || '#ff7d6b', { hl: [18, 15, 2, 5, 45], off: 3, g: [16, 13] });
  });
  function rotArrow(c) {
    c = c || '#ff9f5a';
    return tube('M17.3 42.5A17 17 0 1 1 46.7 42.5', 5.5, c) +
      body('M53.6 46.5L42.2 50.3L39.8 38.5Z', c, { sw: 3, sh: false, hl: false, off: 2 });
  }
  uic('rotate-right', function (c) { return rotArrow(c); });
  uic('rotate-left', function (c) { return '<g transform="translate(64 0) scale(-1 1)">' + rotArrow(c) + '</g>'; });
  uic('hand', function (c) {
    c = c || '#ffd0a3';
    var f = [[14, 22, 9.5, 24], [23, 13, 9.5, 31], [32, 10, 9.5, 34], [41, 17, 9.5, 27]], s = '', i;
    s += rotg(-38, 16, 50, function () { return body(RR(8, 30, 10, 24, 5), c, { sw: 3, hl: false, off: 3 }); });
    for (i = 0; i < f.length; i++) s += body(RR(f[i][0], f[i][1], f[i][2], f[i][3], 4.75), c, { sw: 3, hl: false, off: 3 });
    s += body(RR(13.5, 34, 38, 23, 11), c, { b: [13.5, 34, 38, 23], g: true, gk: 0.8, sw: 3.2 });
    return s;
  });
  uic('guide', function (c) {   // signpost with two arrow boards (Hướng dẫn)
    c = c || '#e9b878';
    return '<ellipse cx="32" cy="58" rx="17" ry="3.8" fill="#5b3a29" opacity="0.18"/>' +
      body(RR(28, 8, 8, 50, 3.5), '#b57a42', { sw: 3, hl: [31, 22, 1.4, 6, 0], off: 2.5 }) +
      body('M12 12H42L50 20L42 28H12Q9 28 9 25V15Q9 12 12 12Z', c, { b: [9, 12, 41, 16], g: [17, 17], gk: 0.8 }) +
      body('M52 32H22L14 40L22 48H52Q55 48 55 45V35Q55 32 52 32Z', mix(c, '#8ccf63', 0.55), { b: [14, 32, 41, 16], g: [46, 37], gk: 0.8 }) +
      body(E(32, 8, 4.6, 4.6), '#ffd23f', { sw: 2.8, hl: false, sh: false });
  });
  uic('bag', function (c) {
    c = c || '#ffa94d';
    return tube('M25 19Q25 7 32 7Q39 7 39 19', 3, dark(c)) +
      body(RR(12, 17, 40, 41, 13), c, { b: [12, 17, 40, 41], g: true }) +
      body(RR(12, 17, 40, 20, 10), mix(c, '#e8742e', 0.5), { sw: 3, hl: false, off: 3 }) +
      body(RR(19, 41, 26, 13, 6), lite(c), { sw: 3, hl: false, off: 2.5 }) + body(RR(28, 32, 8, 7, 2.4), '#ffe27a', { sw: 2.6, hl: false, sh: false });
  });
  uic('star', function (c) { return body(star(32, 34, 27, 13.5, 5), c || '#ffd23f', { hl: [25, 24, 2.4, 7, 35], g: [23, 20], off: 4 }); });
  uic('gear', function (c) {
    c = c || '#aebfd1';
    var s = '', i;
    for (i = 0; i < 8; i++) s += rotg(i * 45, 32, 32, function () { return body(RR(27, 4, 10, 15, 3), c, { sw: 3, hl: false, off: 2.5, sh: false }); });
    return s + body(E(32, 32, 19.5, 19.5) + E(32, 32, 7.5, 7.5), c, { b: [12.5, 12.5, 39, 39], g: true, hl: [22, 21, 5, 1.8, -38] });
  });
  uic('notebook', function () { return T.notebook.f({ c1: '#b88ae0', c2: '#ffd23f', c3: '#ff8f6b' }); });
  uic('sort', function (c) {
    return body(RR(4, 11, 31, 10, 5), c || '#8fc7ff', { hl: false, off: 2.5 }) + body(RR(4, 27, 23, 10, 5), c || '#8fc7ff', { hl: false, off: 2.5 }) +
      body(RR(4, 43, 15, 10, 5), c || '#8fc7ff', { hl: false, off: 2.5 }) +
      body('M47 9H55V34H61L51 52L41 34H47Z', '#ffb347', { hl: [48.5, 18, 1.2, 5, 0], off: 3 });
  });
  uic('check', function (c) { return body('M7 33L15 25L26 36L49 12L57 20L26 52Z', c || '#6fcf6a', { hl: [47, 20, 2, 5, 40], g: [45, 17], off: 3.5 }); });
  uic('lock', function (c) {
    return tube('M22 29V22Q22 8 32 8Q42 8 42 22V29', 4.5, '#b9c4d0') +
      body(RR(12, 27, 40, 30, 9), c || '#ffc24d', { b: [12, 27, 40, 30], g: true }) +
      '<circle cx="32" cy="40" r="4" fill="' + INK + '"/>' + '<path d="' + RR(30.2, 41, 3.6, 9, 1.8) + '" fill="' + INK + '"/>';
  });
  uic('plus', function (c) { return body('M24 8H40V24H56V40H40V56H24V40H8V24H24Z', c || '#7ad36a', { hl: [32, 14, 5, 1.6, 0], g: [29, 14], off: 3.5 }); });
  uic('minus', function (c) { return body(RR(7, 22, 50, 20, 10), c || '#ff8b7a', { hl: [20, 28, 6, 1.6, 0], off: 3.5 }); });
  uic('arrow-down', function (c) { return body('M24 8H40V30H54L32 56L10 30H24Z', c || '#ffb347', { hl: [28, 18, 1.6, 7, 0], off: 3.5, g: [27, 14] }); });
  uic('warn', function () {
    return body('M32 6L58 54H6Z', '#ffd23f', { hl: [24, 38, 2, 7, 28], off: 3.5, sw: 3.6 }) + ln('M32 23V37', INK, 5) + dot(32, 46, 3, INK);
  });
  uic('no', function () { return body(E(32, 32, 25, 25), '#ff7d6b', { b: [7, 7, 50, 50], g: true }) + ln('M20 20L44 44', '#fff8ea', 7.5); });
  uic('box', function () {
    return body(RR(9, 23, 46, 34, 6), '#d9a066', { b: [9, 23, 46, 34], over: ln('M32 24V56', INK, 2.2, 0.5) }) +
      body(RR(6, 13, 52, 14, 5), '#e8b57a', { sw: 3.2, hl: [16, 17, 5, 1.4, 0], off: 3 });
  });
  uic('volume', function (c) {
    return body('M7 24H19L33 12V52L19 40H7Z', c || '#ffcf6b', { hl: [26, 22, 1.6, 6, 30], off: 3 }) + tube('M42 23Q50 32 42 41', 2.4, '#8fc7ff') + tube('M48 14Q62 32 48 50', 2.4, '#8fc7ff');
  });
  uic('play', function (c) { return body('M16 8L56 32L16 56Z', c || '#6fcf6a', { hl: [24, 22, 1.6, 6, -30], off: 3.5, g: [22, 18] }); });

  var ALIAS = {
    spring: 'sprout', summer: 'sun', autumn: 'maple', fall: 'maple', winter: 'snowflake', rotl: 'rotate-left', rotr: 'rotate-right',
    arrow_down: 'arrow-down', arrowdown: 'arrow-down', book: 'notebook', skills: 'star', settings: 'gear', backpack: 'bag', hamburger: 'menu', x: 'close', ok: 'check'
  };

  /* ---------------------------------------------------------------- public API */
  var Icons = G.Icons = {
    templates: Object.keys(T),
    uiNames: Object.keys(U).concat(Object.keys(ALIAS)),
    /* item(idOrDef, px=36, tier=0): idOrDef = item id string, item def, or an icon spec {tpl,c1,c2,c3,v,n} */
    item: function (idOrDef, px, tier) {
      var def = typeof idOrDef === 'string' ? (G.Items ? G.Items.get(idOrDef) : null) : idOrDef;
      if (!def) return Icons.ui('box', px);
      var spec = def.tpl ? def : (def.icon && typeof def.icon === 'object' && def.icon.tpl ? def.icon : null);
      if (!spec || !T[spec.tpl]) {
        spec = fallbackSpec(def.tpl ? { cat: 'junk', id: def.tpl } : def);
        if (def.icon && typeof def.icon === 'object') { // keep explicit colours even when the template is unknown
          if (def.icon.c1) spec.c1 = def.icon.c1; if (def.icon.c2) spec.c2 = def.icon.c2; if (def.icon.c3) spec.c3 = def.icon.c3;
        }
      }
      return buildItem(spec, spec.tpl === 'hoe' || spec.tpl === 'can' || spec.tpl === 'rod' ? (tier | 0) : 0, px || 36);
    },
    /* ui(name, px=24, colour?) */
    ui: function (name, px, color) {
      var n = ALIAS[name] || name, f = U[n];
      if (!f) { console.warn('[icons] unknown ui icon: ' + name); f = U.box; n = 'box'; }
      var key = 'ui|' + n + '|' + (color || '') + '|' + (px || 24);
      if (cache[key]) return cache[key];
      begin(key);
      cache[key] = wrap(f(color ? col(color) : undefined), px || 24, 0);
      return cache[key];
    },
    has: function (name) { return !!(U[ALIAS[name] || name]); },
    hasTemplate: function (name) { return !!T[name]; }
  };
})();
