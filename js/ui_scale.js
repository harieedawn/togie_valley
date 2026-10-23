/* Togie Valley - ui_scale.js (Stage 14C): device-level "Cỡ giao diện" (Auto / Nhỏ / Vừa / Lớn).
 * Scales #ui with transform: scale(var(--ui-scale)); #ui is enlarged by 1/scale so it still fills the viewport.
 * Sets --ui-scale, --uvw, --uvh (1vw / 1vh in scaled px) on #ui. Stored in localStorage togie-valley/uiscale (not in the save). */
(function () {
  'use strict';
  var G = window.Game, root = document.getElementById('ui');
  if (!G || !root) { console.error('[ui_scale] missing deps'); return; }
  var KEY = 'togie-valley/uiscale', US = G.UiScale = {};
  var OPTIONS = [['auto', 'Tự động'], ['s', 'Nhỏ'], ['m', 'Vừa'], ['l', 'Lớn']];
  var FIXED = { s: 0.8, m: 1.0, l: 1.2 };
  var mode = 'auto';
  try { var v = localStorage.getItem(KEY); if (v && (v === 'auto' || FIXED[v])) mode = v; } catch (e) { /* ignore */ }

  var ZOOM = !!(window.CSS && CSS.supports && CSS.supports('zoom', '0.8'));
  function viewport() {
    var vv = window.visualViewport;
    return { w: Math.round((vv && vv.width) || window.innerWidth), h: Math.round((vv && vv.height) || window.innerHeight) };
  }
  US.scale = function () {
    if (FIXED[mode]) return FIXED[mode];
    var vp = viewport();
    return Math.min(vp.w, vp.h) <= 500 ? 0.8 : 1.0;
  };
  US.mode = function () { return mode; };
  US.apply = function () {
    var s = US.scale(), vp = viewport(), st = root.style;
    st.setProperty('--ui-scale', String(s));
    st.setProperty('--uvw', (vp.w / s / 100) + 'px');
    st.setProperty('--uvh', (vp.h / s / 100) + 'px');
    st.width = (vp.w / s) + 'px'; st.height = (vp.h / s) + 'px';
    /* Stage 15A-2 (A3): a fractional transform scale rasterised borders/inset shadows/radii at sub-pixel sizes (notched corners).
       Use CSS zoom (layout-level, crisp borders) where supported, transform only as a fallback. */
    if (ZOOM) { st.transform = 'none'; st.transformOrigin = ''; st.zoom = s === 1 ? '' : String(s); }
    else { st.zoom = ''; st.transformOrigin = '0 0'; st.transform = s === 1 ? 'none' : 'scale(' + s + ')'; }
    if (G.Events) G.Events.emit('ui:scaled', { scale: s, mode: mode });
  };
  US.setMode = function (m) {
    if (m !== 'auto' && !FIXED[m]) return;
    mode = m;
    try { localStorage.setItem(KEY, m); } catch (e) { /* ignore */ }
    US.apply();
  };
  US.renderRow = function (body, el) {
    el('div', 'tv-sub', body, (G.Icons && G.Icons.has && G.Icons.has('gear') ? G.Icons.ui('gear', 20) + ' ' : '') + 'Cỡ giao diện');
    var wrap = el('div', 'tv-uis', body), buttons = [];
    function paint() {
      buttons.forEach(function (b, i) { b.className = 'tv-btn' + (OPTIONS[i][0] === mode ? '' : ' alt'); });
    }
    OPTIONS.forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, o[1]);
      b.addEventListener('click', function () {
        US.setMode(o[0]); paint();
        if (G.UI && G.UI.toast) G.UI.toast('Cỡ giao diện: ' + o[1], 'check');
      });
      buttons.push(b);
    });
    paint();
  };
  var t = 0;
  function later() { clearTimeout(t); t = setTimeout(US.apply, 60); }
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', later);
  US.apply();
})();
