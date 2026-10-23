/* Togie Valley - perf_ui.js (Stage 14B): "Đồ họa" settings row (Game.PerfUI.renderRow, called by panels.js renderSettings) and the hidden debug overlay
 * (?perf=1 in the URL, or 5 quick taps on the HUD clock). Overlay: fps, draw calls, triangles, pixel ratio, tier, chunks, device profile + Copy button. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Perf || !G.Quality || !G.UI) { console.error('[perf_ui] missing deps'); return; }
  var Q = G.Quality, UI = G.UI, PU = G.PerfUI = {};

  var OPTIONS = [
    ['auto', 'Tự động', 'Máy tự chọn mức mượt nhất cho thiết bị của bạn.'],
    ['0', 'Cao', 'Đẹp nhất: đủ chấm nét, hạt giấy, hoa lá. Hợp máy khỏe.'],
    ['1', 'Vừa', 'Bỏ chấm nét, bớt hoa lá. Vừa đẹp vừa mượt.'],
    ['2', 'Thấp', 'Bỏ hạt giấy, nét viền mảnh, cây cỏ thưa. Cho máy yếu.'],
    ['3', 'Siêu nhẹ', 'Tối đa 30 khung hình, bỏ bầu trời và hoa lá bay. Tiết kiệm pin nhất.']
  ];

  PU.renderRow = function (body, el, btn) {
    var pb = el('button', 'tv-btn alt', body, '<b></b><small>Hiện FPS, lệnh vẽ, tam giác, sinh vật và hạt trên màn hình.</small>');
    function paintPerf() { pb.querySelector('b').textContent = 'Bảng đo hiệu năng: ' + (PU.visible() ? 'Bật' : 'Tắt'); pb.className = 'tv-btn' + (PU.visible() ? '' : ' alt'); }
    pb.addEventListener('click', function () { PU.toggle(); paintPerf(); });
    paintPerf();
    el('div', 'tv-sub', body, (G.Icons.has && G.Icons.has('gear') ? G.Icons.ui('gear', 20) + ' ' : '') + 'Đồ họa');
    var wrap = el('div', 'tv-gfx', body), buttons = [];
    function paint() {
      var m = Q.mode();
      buttons.forEach(function (b, i) {
        var on = OPTIONS[i][0] === m;
        b.className = 'tv-btn' + (on ? '' : ' alt');
        var s = b.querySelector('small');
        s.textContent = OPTIONS[i][2] + (OPTIONS[i][0] === 'auto' && on ? ' Đang dùng: ' + Q.def().name + '.' : '');
      });
    }
    OPTIONS.forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, '<b>' + o[1] + '</b><small></small>');
      b.addEventListener('click', function () {
        Q.setMode(o[0]); paint();
        UI.toast('Đồ họa: ' + o[1] + (o[0] === 'auto' ? ' (' + Q.def().name + ')' : ''), 'check');
      });
      buttons.push(b);
    });
    paint();
  };

  /* ------------------------------------------------------------ debug overlay */
  var box = null, pre = null, timer = 0;
  function text() {
    var s = G.Perf.snapshot(), d = s.device, c = s.chunks || { chunks: 0, visible: 0 }, n = [];
    var cr = G.Critters && G.Critters.stats ? G.Critters.stats() : {}, am = G.Ambient && G.Ambient.stats ? G.Ambient.stats() : {};
    var ap = G.AmbientPlus && G.AmbientPlus.stats ? G.AmbientPlus.stats() : {}, wx = G.Weather && G.Weather.stats ? G.Weather.stats() : {};
    var creatures = (cr.chickens || 0) + (cr.ducks || 0) + (cr.bees || 0) + (am.butterflies || 0) + (am.birds || 0) + (ap.fireflies || 0) + (ap.dragonflies || 0) + (ap.butterflies || 0) + (ap.fish || 0);
    var particles = (am.petals || 0) + (am.smoke || 0) + (ap.litter || 0) + (wx.rain > 0.01 ? wx.drops || 0 : 0) + (wx.snow > 0.01 ? wx.flakes || 0 : 0);
    n.push('Khung hình/giây: ' + s.fps + ' (trung vị ' + s.medianFps + ')');
    n.push('Thời gian khung: ' + s.frameMs + ' ms');
    n.push('Lệnh vẽ: ' + s.calls + '  Tam giác: ' + s.triangles);
    n.push('Sinh vật hoạt động: ' + creatures + '  Hạt: ' + particles);
    n.push('Mức đồ họa: ' + s.tierName + ' (' + s.mode + ')  Tỉ lệ điểm ảnh: ' + s.pixelRatio);
    n.push('Khối bản đồ: ' + c.visible + '/' + c.chunks);
    n.push('Thiết bị: ' + d.screen + ', ' + d.cores + ' lõi, ' + d.mem + 'GB');
    return n.join('\n');
  }
  function show() {
    if (box) return;
    var root = (UI.hud && UI.hud.root && UI.hud.root.parentNode) || document.getElementById('ui') || document.body;
    box = document.createElement('div'); box.id = 'tv-perf';
    pre = document.createElement('pre'); box.appendChild(pre);
    var row = document.createElement('div'); row.className = 'row'; box.appendChild(row);
    var cp = document.createElement('button'); cp.textContent = 'Sao chép'; row.appendChild(cp);
    var cl = document.createElement('button'); cl.textContent = 'Đóng'; row.appendChild(cl);
    cp.addEventListener('click', function () {
      var t = text() + '\n\n' + JSON.stringify(G.Perf.snapshot());
      try { if (navigator.clipboard) navigator.clipboard.writeText(t); else throw 0; } catch (e) { var ta = document.createElement('textarea'); ta.value = t; box.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } box.removeChild(ta); }
      UI.toast('Đã sao chép số liệu.', 'check');
    });
    cl.addEventListener('click', hide);
    root.appendChild(box);
    timer = setInterval(function () { if (!document.hidden) pre.textContent = text(); }, 500);
    pre.textContent = text();
  }
  function hide() { if (!box) return; clearInterval(timer); box.parentNode.removeChild(box); box = pre = null; }
  PU.toggle = function () { if (box) hide(); else show(); };
  PU.visible = function () { return !!box; };

  var taps = 0, lastTap = 0, clock = UI.hud && UI.hud.clock;
  if (clock) clock.addEventListener('click', function () {
    var now = performance.now();
    taps = now - lastTap < 700 ? taps + 1 : 1; lastTap = now;
    if (taps >= 5) { taps = 0; PU.toggle(); }
  });
  try { if (/[?&]perf=1\b/.test(location.search)) { G.Events.on('game:ready', show); } } catch (e) { /* ignore */ }
})();
