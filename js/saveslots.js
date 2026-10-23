/* Togie Valley - saveslots.js (Stage 14A). Named save slots on top of Game.Save.
 * Game.SaveSlots: init() (call before the first Save.load), list(), activeIndex(), slotKey(i), meta(i), select(i), create(i,name),
 *   rename(i,name), remove(i), exportSlot(i), importSlot(i,code), backToTitle(), buildTitle(titleEl, close).
 * Keys: togie-valley/slots/index = {v:1, active:1..3|0, names:{1,2,3}}; togie-valley/save/slot{1..3} (+ .bak/.tmp via Game.Save.useKey).
 * Migration: togie-valley/save/v1 (+ .bak) is COPIED into slot 1 named "Nông trại của tôi"; the old key is left untouched.
 * Depends on: save.js; panels.js calls buildTitle on the title screen.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Save || !G.Events) { console.error('[saveslots] missing deps'); return; }
  var Save = G.Save, io = Save.io, IDX = 'togie-valley/slots/index', OLD = 'togie-valley/save/v1', N = 3, MAXLEN = 16;
  var SS = G.SaveSlots = {}, idx = null, SEASONS = ['Xuân', 'Hạ', 'Thu', 'Đông'];

  function slotKey(i) { return 'togie-valley/save/slot' + i; }
  function defName(i) { return 'Nông trại ' + i; }
  function cleanName(s, i) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAXLEN); return s || defName(i); }
  function saveIdx() { io.write(IDX, JSON.stringify(idx)); }
  function readIdx() {
    var o = null; try { o = JSON.parse(io.read(IDX) || 'null'); } catch (e) {}
    if (!o || o.v !== 1 || !o.names) return null;
    for (var i = 1; i <= N; i++) o.names[i] = cleanName(o.names[i], i);
    o.active = o.active >= 0 && o.active <= N ? o.active | 0 : 0;
    return o;
  }

  SS.slotKey = slotKey;
  SS.init = function () {
    if (idx) return;
    idx = readIdx();
    if (!idx) {
      idx = { v: 1, active: 1, names: {} };
      for (var i = 1; i <= N; i++) idx.names[i] = defName(i);
      var old = io.read(OLD), oldBak = io.read(OLD + '.bak');
      if (old || oldBak) {   // migrate the single legacy save into slot 1 (old key stays untouched)
        if (old) io.write(slotKey(1), old);
        if (oldBak) io.write(slotKey(1) + '.bak', oldBak);
        idx.names[1] = 'Nông trại của tôi';
      }
      saveIdx();
    }
    Save.useKey(idx.active ? slotKey(idx.active) : null);
  };
  SS.activeIndex = function () { SS.init(); return idx.active; };
  SS.name = function (i) { SS.init(); return idx.names[i]; };

  function slotObj(i) { var k = slotKey(i); return Save.parse(io.read(k) || '') || Save.parse(io.read(k + '.bak') || ''); }
  SS.meta = function (i) {   // null for an empty slot
    SS.init();
    var o = slotObj(i); if (!o) return null;
    var s = o.sections || {}, t = s.time || {}, st = s.state || {}, day = t.day > 0 ? Math.floor(t.day) : 1;
    return { name: idx.names[i], day: ((day - 1) % 14) + 1, season: SEASONS[Math.floor((day - 1) / 14) % 4], money: Math.floor(st.money || 0), playTimeSec: (o.meta && o.meta.playTimeSec) || 0, savedAt: o.savedAt || 0 };
  };
  SS.list = function () { var a = []; for (var i = 1; i <= N; i++) a.push({ index: i, name: SS.name(i), active: idx.active === i, meta: SS.meta(i) }); return a; };

  SS.rename = function (i, name) { SS.init(); idx.names[i] = cleanName(name, i); saveIdx(); };
  SS.select = function (i) {   // switch to slot i and load it (new game if empty); returns true if a save was loaded
    SS.init();
    if (idx.active === i && Save.has()) return true;
    Save.now();
    Save.useKey(slotKey(i)); idx.active = i; saveIdx();
    if (Save.load()) return true;
    Save.newGame(); return false;
  };
  SS.create = function (i, name) {   // fresh game in slot i (replaces whatever was there)
    SS.init(); Save.now();
    var k = slotKey(i); io.drop(k); io.drop(k + '.bak'); io.drop(k + '.tmp');
    idx.names[i] = cleanName(name, i); Save.useKey(k); idx.active = i; saveIdx(); Save.newGame();
  };
  SS.remove = function (i) {
    SS.init(); var k = slotKey(i);
    io.drop(k); io.drop(k + '.bak'); io.drop(k + '.tmp');
    idx.names[i] = defName(i);
    if (idx.active === i) { idx.active = 0; Save.useKey(null); }   // nothing active until the player picks a slot
    saveIdx();
  };
  SS.exportSlot = function (i) {
    SS.init(); if (idx.active === i && Save.has()) { Save.now(); }
    var o = slotObj(i); return o ? Save.encode(JSON.stringify(o)) : '';
  };
  SS.importSlot = function (i, code) {
    SS.init(); var o = Save.decode(code); if (!o) return false;
    if (idx.active === i) return Save.importCode(code);
    var k = slotKey(i); io.drop(k + '.bak'); return io.write(k, JSON.stringify(o));
  };
  SS.backToTitle = function () { Save.now(); location.reload(); };

  /* ---------------------------------------------------------------- title UI */
  function el(tag, cls, parent, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dur(sec) { var m = Math.floor(sec / 60); return m >= 60 ? Math.floor(m / 60) + 'g ' + pad(m % 60) + 'p' : m + ' phút'; }
  function when(ms) { if (!ms) return '—'; var d = new Date(ms); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function tap(b, fn, cls) { if (cls) b.className += ' ' + cls; b.addEventListener('click', function () { if (G.UI && G.UI.sfx) G.UI.sfx('tap'); fn(); }); return b; }
  function toast(m, ic) { if (G.UI && G.UI.toast) G.UI.toast(m, ic); }

  function modal(root, title, build) {   // small paper card over the title screen
    var wrap = el('div', 'sv-modal', root), card = el('div', 'tv-card sv-card', wrap);
    el('h2', null, card, esc(title));
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    build(card, close); return close;
  }
  function askName(root, title, init, cb) {
    modal(root, title, function (card, close) {
      var inp = el('input', 'sv-input', card); inp.type = 'text'; inp.maxLength = MAXLEN; inp.value = init; inp.setAttribute('aria-label', 'Tên nông trại');
      el('div', 'sv-hint', card, 'Tối đa ' + MAXLEN + ' ký tự');
      var row = el('div', 'tv-row', card);
      tap(el('button', 'tv-btn alt', row, 'Hủy'), close);
      tap(el('button', 'tv-btn', row, 'Lưu'), function () { var v = cleanName(inp.value, 1); close(); cb(inp.value.trim() ? v : null); });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
    });
  }
  function codeBox(root, title, text, importing, cb) {
    modal(root, title, function (card, close) {
      var ta = el('textarea', 'sv-ta', card); ta.value = text || ''; ta.setAttribute('placeholder', importing ? 'Dán mã lưu vào đây' : '');
      if (!importing) ta.readOnly = true;
      var row = el('div', 'tv-row', card);
      tap(el('button', 'tv-btn alt', row, 'Đóng'), close);
      if (importing) tap(el('button', 'tv-btn', row, 'Nhập'), function () { if (!ta.value.trim()) { toast('Hãy dán mã lưu trước nhé.', 'warn'); return; } cb(ta.value, close); });
      else tap(el('button', 'tv-btn', row, 'Sao chép'), function () { try { ta.select(); if (navigator.clipboard) navigator.clipboard.writeText(ta.value); } catch (e) {} toast('Mã lưu đã sẵn sàng để sao chép.', 'check'); });
    });
  }
  function ask(opts, yes) { if (G.UI && G.UI.confirm) G.UI.confirm(opts, function (ok) { if (ok) yes(); }); else yes(); }

  SS.buildTitle = function (root, close) {
    SS.init();
    var list = el('div', 'sv-list', root);
    function render() {
      list.innerHTML = '';
      SS.list().forEach(function (s) {
        var i = s.index, m = s.meta, card = el('div', 'sv-slot' + (s.active && m ? ' on' : '') + (m ? '' : ' empty'), list);
        el('div', 'sv-name', card, esc(s.name) + (s.active && m ? ' <span class="sv-tag">Đang chơi</span>' : ''));
        if (m) {
          el('div', 'sv-meta', card, m.season + ' · Ngày ' + m.day + ' · ' + m.money + 'g · ' + dur(m.playTimeSec));
          el('div', 'sv-sub', card, 'Chơi lần cuối: ' + when(m.savedAt));
        } else el('div', 'sv-meta', card, 'Ô trống');
        var main = el('div', 'sv-main', card);
        if (m) tap(el('button', 'tv-btn', main, s.active ? 'Tiếp tục' : 'Chơi'), function () { SS.select(i); close(); });
        else tap(el('button', 'tv-btn', main, 'Game mới'), function () { askName(root, 'Đặt tên nông trại', defName(i), function (v) { if (v) { SS.create(i, v); close(); } }); });
        var row = el('div', 'sv-row', card);
        tap(el('button', 'tv-btn alt', row, 'Đổi tên'), function () { askName(root, 'Đổi tên nông trại', s.name, function (v) { if (v) { SS.rename(i, v); render(); } }); });
        if (m) {
          tap(el('button', 'tv-btn alt', row, 'Xuất mã'), function () { codeBox(root, 'Mã lưu: ' + s.name, SS.exportSlot(i), false); });
          if (m) tap(el('button', 'tv-btn danger', row, 'Xóa'), function () { ask({ title: 'Xóa nông trại này?', text: '"' + s.name + '" sẽ mất vĩnh viễn.', yes: 'Xóa', no: 'Giữ lại' }, function () { SS.remove(i); render(); toast('Đã xóa.', 'check'); }); });
        }
        tap(el('button', 'tv-btn alt', row, 'Nhập mã'), function () {
          codeBox(root, 'Nhập mã vào "' + s.name + '"', '', true, function (code, closeBox) {
            function go() { if (SS.importSlot(i, code)) { closeBox(); toast('Đã nhập mã lưu!', 'check'); if (idx.active === i) close(); else render(); } else toast('Mã này có vẻ chưa đúng.', 'warn'); }
            if (m) ask({ title: 'Nhập mã lưu?', text: 'Nông trại "' + s.name + '" sẽ bị thay thế.', yes: 'Nhập', no: 'Hủy' }, go); else go();
          });
        });
      });
    }
    render();
  };
})();
