/* Togie Valley - state.js (Stage 2)
 * Game.Containers (generic slot container), Game.Inventory (backpack), Game.State (money, energy, skills).
 * Depends on: core.js, items.js. No visuals.
 * Slot = {id, n, q, tier} or null. q: 'normal'|'silver'|'gold'. tier only matters for tools (0..3).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Items) { console.error('[state] core.js/items.js missing'); return; }
  var Events = G.Events, Items = G.Items;

  function same(s, id, q, tier) { return s && s.id === id && s.q === q && (s.tier || 0) === (tier || 0); }

  /* ------------------------------------------------------------- Containers */
  /* Container: slots[], size, add/remove/count/canAdd/get/set/move/resize/clear/serialize/load, onChange(fn). */
  function Container(size) {
    this.size = size;
    this.slots = [];
    for (var i = 0; i < size; i++) this.slots.push(null);
    this._cb = [];
  }
  var CP = Container.prototype;
  CP.onChange = function (fn) { this._cb.push(fn); };
  CP._changed = function () { for (var i = 0; i < this._cb.length; i++) this._cb[i](this); };
  CP.get = function (i) { return this.slots[i] || null; };
  CP.set = function (i, slot) { if (i < 0 || i >= this.size) return; this.slots[i] = slot || null; this._changed(); };
  CP._room = function (id, q, tier) {
    var d = Items.get(id), max = d ? d.stack : 99, room = 0;
    for (var i = 0; i < this.size; i++) {
      var s = this.slots[i];
      if (!s) room += max; else if (same(s, id, q, tier)) room += Math.max(0, max - s.n);
    }
    return room;
  };
  CP.canAdd = function (id, n, q, tier) {
    if (!Items.get(id)) return false;
    return this._room(id, q || 'normal', tier || 0) >= (n === undefined ? 1 : n);
  };
  /* Returns the number actually added (may be < n if full). */
  CP.add = function (id, n, q, tier) {
    var d = Items.get(id);
    if (!d) { console.error('[state] add: unknown item ' + id); return 0; }
    n = n === undefined ? 1 : Math.floor(n); q = q || 'normal'; tier = tier || 0;
    var left = n, i, s;
    for (i = 0; i < this.size && left > 0; i++) {
      s = this.slots[i];
      if (same(s, id, q, tier) && s.n < d.stack) { var t = Math.min(left, d.stack - s.n); s.n += t; left -= t; }
    }
    for (i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) { var t2 = Math.min(left, d.stack); this.slots[i] = { id: id, n: t2, q: q, tier: tier }; left -= t2; }
    }
    if (left !== n) this._changed();
    return n - left;
  };
  /* q undefined = any quality (lowest first). All-or-nothing: returns true if removed. */
  CP.remove = function (id, n, q) {
    n = n === undefined ? 1 : Math.floor(n);
    if (this.count(id, q) < n) return false;
    var qs = q ? [q] : Items.QUALITIES, left = n;
    for (var k = 0; k < qs.length && left > 0; k++) {
      for (var i = this.size - 1; i >= 0 && left > 0; i--) {
        var s = this.slots[i];
        if (s && s.id === id && s.q === qs[k]) {
          var t = Math.min(left, s.n); s.n -= t; left -= t;
          if (s.n <= 0) this.slots[i] = null;
        }
      }
    }
    this._changed();
    return true;
  };
  CP.removeAt = function (i, n) {
    var s = this.slots[i];
    if (!s) return false;
    n = n === undefined ? s.n : n;
    if (n > s.n) return false;
    s.n -= n; if (s.n <= 0) this.slots[i] = null;
    this._changed();
    return true;
  };
  CP.count = function (id, q) {
    var c = 0;
    for (var i = 0; i < this.size; i++) { var s = this.slots[i]; if (s && s.id === id && (!q || s.q === q)) c += s.n; }
    return c;
  };
  CP.isEmpty = function () { for (var i = 0; i < this.size; i++) if (this.slots[i]) return false; return true; };
  /* Drag/move a -> b: merge when stackable, otherwise swap. */
  CP.move = function (a, b) {
    if (a === b || a < 0 || b < 0 || a >= this.size || b >= this.size) return false;
    var sa = this.slots[a], sb = this.slots[b];
    if (!sa) return false;
    if (sb && same(sb, sa.id, sa.q, sa.tier)) {
      var max = Items.get(sa.id).stack, t = Math.min(sa.n, max - sb.n);
      if (t > 0) { sb.n += t; sa.n -= t; if (sa.n <= 0) this.slots[a] = null; this._changed(); return true; }
    }
    this.slots[a] = sb; this.slots[b] = sa;
    this._changed();
    return true;
  };
  /* Grow (or shrink if the removed tail is empty). Returns bool. */
  CP.resize = function (n) {
    var i;
    if (n < this.size) { for (i = n; i < this.size; i++) if (this.slots[i]) return false; this.slots.length = n; }
    else for (i = this.size; i < n; i++) this.slots.push(null);
    this.size = n; this._changed();
    return true;
  };
  CP.clear = function () { for (var i = 0; i < this.size; i++) this.slots[i] = null; this._changed(); };
  CP.serialize = function () {
    return { size: this.size, slots: this.slots.map(function (s) { return s ? { id: s.id, n: s.n, q: s.q, tier: s.tier || 0 } : null; }) };
  };
  CP.load = function (o) {
    var size = o && o.size ? o.size : this.size;
    this.size = size; this.slots = [];
    for (var i = 0; i < size; i++) {
      var s = o && o.slots ? o.slots[i] : null;
      this.slots.push(s && Items.get(s.id) ? { id: s.id, n: s.n, q: s.q || 'normal', tier: s.tier || 0 } : null);
    }
    this._changed();
  };

  G.Containers = { create: function (n) { return new Container(n); }, Container: Container };

  /* -------------------------------------------------------------- Inventory */
  var START_SLOTS = 12, COLS = 6;
  var inv = new Container(START_SLOTS);
  var selIndex = 0;

  function invChanged() { Events.emit('inventory:changed', { selected: selIndex }); }
  inv.onChange(invChanged);

  var Inventory = G.Inventory = {
    COLS: COLS, HOTBAR: COLS, container: inv,
    get slots() { return inv.slots; },
    get size() { return inv.size; },
    add: function (id, n, q, tier) { return inv.add(id, n, q, tier); },
    remove: function (id, n, q) { return inv.remove(id, n, q); },
    removeAt: function (i, n) { return inv.removeAt(i, n); },
    count: function (id, q) { return inv.count(id, q); },
    canAdd: function (id, n, q, tier) { return inv.canAdd(id, n, q, tier); },
    get: function (i) { return inv.get(i); },
    move: function (a, b) { return inv.move(a, b); },
    resize: function (n) { return inv.resize(n); },
    /* Hotbar = slots 0..5. select(i) accepts 0..size-1 but the UI only uses the hotbar. */
    selectedIndex: function () { return selIndex; },
    selected: function () { return inv.get(selIndex); },
    select: function (i) {
      if (i < 0 || i >= inv.size) return false;
      selIndex = i;
      invChanged();
      return true;
    },
    reset: function () {
      selIndex = 0; inv.size = START_SLOTS; inv.slots = [];
      for (var i = 0; i < START_SLOTS; i++) inv.slots.push(null);
      inv.add('hoe', 1); inv.add('watering_can', 1); inv.add('bamboo_pole', 1);
      selIndex = 0; invChanged();
    },
    save: function () { var o = inv.serialize(); o.selected = selIndex; return o; },
    load: function (o) {
      inv.load(o || { size: START_SLOTS, slots: [] });
      selIndex = o && o.selected >= 0 && o.selected < inv.size ? o.selected : 0;
      invChanged();
    }
  };

  /* ------------------------------------------------------------------ State */
  var THRESHOLDS = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
  var SKILLS = ['farming', 'fishing'];
  var START_MONEY = 500, MAX_ENERGY = 100;

  function levelFor(xp) {
    var lv = 1;
    for (var i = 0; i < THRESHOLDS.length - 1; i++) if (xp >= THRESHOLDS[i]) lv = i + 2;
    return Math.min(10, lv);
  }

  var State = G.State = {
    money: START_MONEY,
    energy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    xp: { farming: 0, fishing: 0 },
    XP_THRESHOLDS: THRESHOLDS,

    addMoney: function (n) {
      n = Math.round(n);
      if (!n) return State.money;
      State.money = Math.max(0, State.money + n);
      Events.emit('state:changed', { key: 'money', value: State.money, delta: n });
      return State.money;
    },
    /* Returns false (and changes nothing) if not enough money. */
    spendMoney: function (n) {
      n = Math.round(n);
      if (n < 0 || State.money < n) return false;
      State.money -= n;
      Events.emit('state:changed', { key: 'money', value: State.money, delta: -n });
      return true;
    },
    setEnergy: function (v) {
      v = G.util.clamp(Math.round(v), 0, State.maxEnergy);
      if (v === State.energy) return;
      var d = v - State.energy;
      State.energy = v;
      Events.emit('state:changed', { key: 'energy', value: v, delta: d });
    },
    restoreEnergy: function (n) { State.setEnergy(State.energy + n); },
    /* At 0 energy returns false and emits state:exhausted (UI shows the "eat something" toast). */
    useEnergy: function (n) {
      n = n || 0;
      if (n <= 0) return true;
      if (State.energy <= 0) { Events.emit('state:exhausted', {}); return false; }
      State.setEnergy(State.energy - n);
      return true;
    },
    canWork: function () { return State.energy > 0; },
    addXp: function (skill, n) {
      if (SKILLS.indexOf(skill) < 0) { console.error('[state] unknown skill ' + skill); return; }
      var before = levelFor(State.xp[skill]);
      State.xp[skill] += Math.max(0, Math.round(n));
      var after = levelFor(State.xp[skill]);
      Events.emit('state:changed', { key: 'xp', skill: skill, value: State.xp[skill], delta: n });
      if (after > before) Events.emit('skill:levelUp', { skill: skill, level: after });
    },
    level: function (skill) { return levelFor(State.xp[skill] || 0); },
    /* {level, xp, into, need}: progress toward the next level (need = 0 at max). */
    progress: function (skill) {
      var xp = State.xp[skill] || 0, lv = levelFor(xp);
      if (lv >= 10) return { level: lv, xp: xp, into: 0, need: 0 };
      var lo = lv === 1 ? 0 : THRESHOLDS[lv - 2], hi = THRESHOLDS[lv - 1];
      return { level: lv, xp: xp, into: xp - lo, need: hi - lo };
    },
    reset: function () {
      State.money = START_MONEY; State.energy = MAX_ENERGY; State.xp = { farming: 0, fishing: 0 };
      Events.emit('state:changed', { key: 'all' });
    },
    save: function () { return { money: State.money, energy: State.energy, xp: { farming: State.xp.farming, fishing: State.xp.fishing } }; },
    load: function (o) {
      o = o || {};
      State.money = typeof o.money === 'number' ? o.money : START_MONEY;
      State.energy = typeof o.energy === 'number' ? G.util.clamp(o.energy, 0, MAX_ENERGY) : MAX_ENERGY;
      State.xp = { farming: (o.xp && o.xp.farming) || 0, fishing: (o.xp && o.xp.fishing) || 0 };
      Events.emit('state:changed', { key: 'all' });
    }
  };
})();
