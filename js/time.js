/* Togie Valley - time.js (Stage 2)
 * Game.Time (clock 06:00 -> 26:00), Game.Day (end/start hooks, sleep, weather roll, seasons).
 * Drives Render.setTimeOfDay / setSeason. No visuals. Depends on: core.js, state.js, render.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Loop || !G.State || !G.Render) { console.error('[time] dependencies missing'); return; }
  var Events = G.Events, State = G.State, util = G.util;

  var DAY_START = 6, DAY_END = 26, LATE = 24;
  var HOURS_PER_REAL_SEC = 1 / 24;      // 10 game-min = 4.0 real s
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var DAYS_PER_SEASON = 14;
  var RAIN = { spring: 0.25, summer: 0.15, autumn: 0.25, winter: 0 };
  var SNOW_WINTER = 0.35;

  var pauses = Object.create(null), pauseCount = 0;
  var lastStep = 0, lastHour = 0;

  var Time = G.Time = {
    day: 1,
    hour: DAY_START,        // float 6..26
    season: 'spring',
    weather: 'sun',         // today: 'sun' | 'rain' | 'snow'
    tomorrow: 'sun',        // rolled at bedtime
    seed: 1,
    DAY_START: DAY_START, DAY_END: DAY_END, SEASONS: SEASONS, DAYS_PER_SEASON: DAYS_PER_SEASON,

    /* Reason-counted: the clock freezes while any reason is active (UI panels use 'ui'). */
    pause: function (reason) {
      reason = reason || 'manual';
      if (!pauses[reason]) { pauses[reason] = true; pauseCount++; }
    },
    resume: function (reason) {
      reason = reason || 'manual';
      if (pauses[reason]) { delete pauses[reason]; pauseCount--; }
    },
    isPaused: function () { return pauseCount > 0; },

    seasonOf: function (day) { return SEASONS[Math.floor((day - 1) / DAYS_PER_SEASON) % 4]; },
    dayOfSeason: function (day) { return ((day || Time.day) - 1) % DAYS_PER_SEASON + 1; },
    year: function (day) { return Math.floor(((day || Time.day) - 1) / (DAYS_PER_SEASON * 4)) + 1; },
    /* Render hour 0..24 */
    wrapped: function () { return Time.hour % 24; },
    minutes: function () { return Math.floor((Time.hour % 1) * 60); },
    /* '06:00', '25:30' shows as '01:30' style 12h-free label: HH:MM with hour wrapped. */
    clock: function (h) {
      h = h === undefined ? Time.hour : h;
      var hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60 / 10) * 10;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    },
    /* Seeded, deterministic weather for a given day. Days 1-2 always sunny. */
    weatherFor: function (day) {
      if (day <= 2) return 'sun';
      var season = Time.seasonOf(day);
      var r = util.rng((Time.seed * 7919 + day * 104729) >>> 0)();
      if (season === 'winter') return r < SNOW_WINTER ? 'snow' : 'sun';
      return r < RAIN[season] ? 'rain' : 'sun';
    },
    /* Set the clock (6..26). Emits steps/hours crossed only via the normal tick; debug use. */
    setHour: function (h) {
      Time.hour = util.clamp(h, DAY_START, DAY_END - 0.001);
      lastStep = Math.floor(Time.hour * 6); lastHour = Math.floor(Time.hour);
      G.Render.setTimeOfDay(Time.wrapped());
      Events.emit('time:set', { hour: Time.hour });
    },

    reset: function () {
      Time.seed = (Math.random() * 4294967295) >>> 0;
      Time.day = 1; Time.season = 'spring'; Time.weather = 'sun'; Time.tomorrow = 'sun';
      Time.hour = DAY_START; Time.setHour(DAY_START);
      G.Render.setSeason(Time.season, true);
    },
    save: function () { return { day: Time.day, hour: Time.hour, weather: Time.weather, tomorrow: Time.tomorrow, seed: Time.seed }; },
    load: function (o) {
      o = o || {};
      Time.seed = typeof o.seed === 'number' ? o.seed : 1;
      Time.day = o.day > 0 ? Math.floor(o.day) : 1;
      Time.season = Time.seasonOf(Time.day);
      Time.weather = o.weather || 'sun';
      Time.tomorrow = o.tomorrow || Time.weatherFor(Time.day + 1);
      Time.setHour(typeof o.hour === 'number' ? o.hour : DAY_START);
      G.Render.setSeason(Time.season, true);
    }
  };

  /* -------------------------------------------------------------------- Day */
  var endHooks = [], startHooks = [], seq = 0, sleeping = false;

  function addHook(list, p, fn) {
    if (typeof p === 'function') { fn = p; p = 0; }
    var e = { p: p || 0, fn: fn, n: seq++ };
    list.push(e);
    list.sort(function (a, b) { return (a.p - b.p) || (a.n - b.n); });
    return function () { var i = list.indexOf(e); if (i >= 0) list.splice(i, 1); };
  }
  function runHooks(list, arg) {
    var l = list.slice();
    for (var i = 0; i < l.length; i++) {
      try { l[i].fn(arg); } catch (err) { console.error('[day] hook error', err); }
    }
  }

  var Day = G.Day = {
    /* fn({day, mode, hour}) at bedtime, low priority first. mode: 'full' | 'late' | 'passout'. */
    onEnd: function (priority, fn) { return addHook(endHooks, priority, fn); },
    /* fn({day, season, weather}) after the new day is set up, low priority first. */
    onStart: function (priority, fn) { return addHook(startHooks, priority, fn); },

    /* mode optional: derived from the clock (before 24:00 full, 24-26 late, >= 26 pass-out). */
    sleep: function (mode) {
      if (sleeping) return false;
      sleeping = true;
      var h = Time.hour;
      mode = mode || (h >= DAY_END ? 'passout' : (h >= LATE ? 'late' : 'full'));
      var info = { day: Time.day, mode: mode, hour: h, lostMoney: 0 };
      if (mode === 'passout') info.lostMoney = Math.min(500, Math.floor(State.money * 0.1));
      runHooks(endHooks, info);
      Events.emit('day:ended', info);

      if (info.lostMoney) State.addMoney(-info.lostMoney);
      State.setEnergy(State.maxEnergy * (mode === 'full' ? 1 : (mode === 'late' ? 0.75 : 0.5)));

      var oldSeason = Time.season;
      Time.day += 1;
      Time.season = Time.seasonOf(Time.day);
      Time.weather = Time.tomorrow;
      Time.tomorrow = Time.weatherFor(Time.day + 1);
      Time.setHour(DAY_START);
      if (Time.season !== oldSeason) {
        G.Render.setSeason(Time.season);
        Events.emit('season:changed', { season: Time.season, from: oldSeason, day: Time.day });
      }
      var start = { day: Time.day, season: Time.season, weather: Time.weather, mode: mode, lostMoney: info.lostMoney };
      runHooks(startHooks, start);
      Events.emit('day:started', start);
      sleeping = false;
      return true;
    }
  };

  /* ------------------------------------------------------------------- loop */
  G.Loop.onUpdate(function (dt) {
    if (pauseCount > 0 || sleeping) return;
    Time.hour += dt * HOURS_PER_REAL_SEC;
    var step = Math.floor(Time.hour * 6), hr = Math.floor(Time.hour);
    // Continuous sky: re-evaluate the keyframes every fixed step, not only per 10 game minutes.
    G.Render.setTimeOfDay(Time.wrapped());
    if (step !== lastStep) {
      lastStep = step;
      Events.emit('time:minuteStep', { hour: Time.hour });
      if (hr !== lastHour) { lastHour = hr; Events.emit('time:hourChanged', { hour: hr }); }
    }
    if (Time.hour >= DAY_END) Day.sleep('passout');
  }, -50);
})();
