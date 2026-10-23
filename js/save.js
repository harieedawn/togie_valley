/* Togie Valley - save.js (Stage 2)
 * Game.Save: register(key,{save(),load(obj),reset()}), request(), now(), load(), newGame(), exportCode(), importCode(str).
 * One JSON at togie-valley/save/v1 with one section per module; atomic write (tmp -> swap) + one backup (.bak).
 * Depends on: core.js. No visuals.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Loop) { console.error('[save] core.js missing'); return; }
  var Events = G.Events;

  var PREFIX = 'togie-valley/', KEY = PREFIX + 'save/v1', TMP = KEY + '.tmp', BAK = KEY + '.bak';   // Stage 14A: Save.useKey() switches these to a slot key (js/saveslots.js)
  var VERSION = 1, AUTOSAVE_MS = 20000, DEBOUNCE_MS = 300;
  var savers = [], byKey = Object.create(null), timer = 0, baseSec = 0, started = Date.now();

  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function read(k) { var s = ls(); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  var armed = false;
  function write(k, v) { var s = ls(); try { if (s) { s.setItem(k, v); return true; } } catch (e) { console.error('[save] write failed', e); } return false; }
  function drop(k) { var s = ls(); try { if (s) s.removeItem(k); } catch (e) { /* ignore */ } }
  function playTime() { return Math.floor(baseSec + (Date.now() - started) / 1000); }

  function snapshot() {
    var sections = {};
    for (var i = 0; i < savers.length; i++) {
      try { sections[savers[i].key] = savers[i].def.save(); } catch (err) { console.error('[save] save error in "' + savers[i].key + '"', err); }
    }
    return { version: VERSION, savedAt: Date.now(), meta: { playTimeSec: playTime() }, sections: sections };
  }

  /* Migrations keyed by the version they upgrade FROM: Save.migrations[1] = function (obj) {... return obj} */
  var migrations = {};
  function migrate(obj) {
    if (!obj || typeof obj !== 'object' || typeof obj.version !== 'number' || !obj.sections) return null;
    while (obj.version < VERSION) {
      var m = migrations[obj.version];
      if (!m) return null;
      obj = m(obj) || obj; obj.version++;
    }
    return obj.version === VERSION ? obj : null;
  }

  function parse(text) { try { return migrate(JSON.parse(text)); } catch (e) { return null; } }

  function applyData(obj) {
    if (G.FishData && G.FishData.migrateSave) G.FishData.migrateSave(obj);   // Stage 16 D1: removed fish ids -> new species
    baseSec = (obj.meta && obj.meta.playTimeSec) || 0; started = Date.now();
    for (var i = 0; i < savers.length; i++) {
      var s = savers[i];
      try {
        if (obj.sections[s.key] !== undefined) s.def.load(obj.sections[s.key]); else s.def.reset();
      } catch (err) { console.error('[save] load error in "' + s.key + '"', err); }
    }
    Events.emit('save:loaded', { savedAt: obj.savedAt });
  }

  var Save = G.Save = {
    KEY: KEY, VERSION: VERSION, migrations: migrations,

    /* Stage 14A: point autosave/load at another key (null = no active save, writes are refused). */
    useKey: function (key) { clearTimeout(timer); timer = 0; if (key) { KEY = key; TMP = key + '.tmp'; BAK = key + '.bak'; } else { KEY = TMP = BAK = null; } Save.KEY = KEY; },
    io: { read: read, write: write, drop: drop },
    parse: parse,
    /* Text <-> export code helpers (no state change). decode returns the migrated save object or null. */
    encode: function (text) { try { return btoa(unescape(encodeURIComponent(text))); } catch (e) { return ''; } },
    decode: function (str) { try { return parse(decodeURIComponent(escape(atob(String(str).replace(/\s+/g, ''))))); } catch (e) { return null; } },
    scopeOf: function (key) { return byKey[key] ? byKey[key].scope : undefined; },
    keys: function (scope) { return savers.filter(function (s) { return !scope || s.scope === scope; }).map(function (s) { return s.key; }); },

    /* register(key, def, scope?) - scope 'world' (shared by all players) | 'player' (per player); metadata only, saved JSON is unchanged. */
    register: function (key, def, scope) {
      if (!def || typeof def.save !== 'function' || typeof def.load !== 'function') { console.error('[save] bad saver ' + key); return; }
      if (!def.reset) def.reset = function () {};
      if (byKey[key]) { byKey[key].def = def; if (scope) byKey[key].scope = scope; return; }
      var e = { key: key, def: def, scope: scope === 'player' ? 'player' : 'world' };
      byKey[key] = e; savers.push(e);
    },

    /* Write now. Atomic: tmp key first, previous save becomes .bak, then the main key is replaced. */
    now: function () {
      clearTimeout(timer); timer = 0;
      if (!KEY || !ls() || !armed) return false;   // nothing is written before a save was loaded or a game was started on purpose
      var text = JSON.stringify(snapshot());
      if (!write(TMP, text)) return false;
      var prev = read(KEY);
      if (prev && parse(prev)) write(BAK, prev);
      var ok = write(KEY, text);
      drop(TMP);
      if (ok) Events.emit('save:written', { bytes: text.length });
      return ok;
    },
    /* Debounced write (use after shop transactions, sleep, etc.). */
    request: function () {
      if (timer) return;
      timer = setTimeout(function () { timer = 0; Save.now(); }, DEBOUNCE_MS);
    },
    has: function () { return !!KEY && !!(parse(read(KEY) || '') || parse(read(BAK) || '')); },

    /* Load main save (fallback: backup). Returns true if something was restored. Emits save:loaded. */
    load: function () {
      if (!KEY) return false;
      var obj = parse(read(KEY) || '') || parse(read(BAK) || '');
      if (!obj) return false;
      applyData(obj); armed = true;
      return true;
    },
    /* Reset every registered module to defaults, then write the fresh save. Emits save:reset. */
    newGame: function (silent) {   // silent=true (boot on empty storage): reset in memory only, no write until the player starts a game
      armed = !silent;
      baseSec = 0; started = Date.now();
      for (var i = 0; i < savers.length; i++) {
        try { savers[i].def.reset(); } catch (err) { console.error('[save] reset error in "' + savers[i].key + '"', err); }
      }
      Events.emit('save:reset', {});
      if (!silent) Save.now();
    },

    exportCode: function () {
      var text = JSON.stringify(snapshot());
      try { return btoa(unescape(encodeURIComponent(text))); } catch (e) { console.error('[save] export failed', e); return ''; }
    },
    /* Returns true if the code was valid; it is applied immediately and saved. */
    importCode: function (str) {
      var obj = null;
      try { obj = parse(decodeURIComponent(escape(atob(String(str).replace(/\s+/g, ''))))); } catch (e) { obj = null; }
      if (!obj) return false;
      applyData(obj); armed = true;
      Save.now();
      return true;
    }
  };

  /* ---- autosave triggers (§10): every 20 s, tab hidden, pagehide; sleep/shop hooks below ---- */
  setInterval(function () { if (!G.Loop.paused) Save.request(); }, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', function () { if (document.hidden) Save.now(); });
  window.addEventListener('pagehide', function () { Save.now(); });
  Events.on('day:started', function () { Save.request(); });
  Events.on('shop:transaction', function () { Save.request(); });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
})();
