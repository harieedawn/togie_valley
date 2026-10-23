/* Togie Valley - main.js (Stage 1 boot)
 * Boots display + renderer, builds the outdoor world, enters the 'outdoor' scene in front of the house door.
 * Later stages hook in via Game.Events (game:ready) and add their own modules before this file.
 */
(function () {
  'use strict';

  var ui = document.getElementById('ui');

  function fail(msg) {
    console.error('[main] ' + msg);
    if (ui) {
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:0;right:0;top:40%;text-align:center;color:#fff;font:16px ui-rounded,system-ui,sans-serif;padding:0 24px';
      d.textContent = msg;
      ui.appendChild(d);
    }
  }

  if (typeof THREE === 'undefined') { fail('Không tải được Three.js (hãy kiểm tra kết nối mạng).'); return; }
  var G = window.Game;
  if (!G || !G.Render || !G.Models || !G.World || !G.Town || !G.Decor || !G.Input || !G.Scenes || !G.Player || !G.Interact || !G.Items || !G.State || !G.Inventory || !G.Containers || !G.Time || !G.Day || !G.Save) {
    fail('Không tải được mã trò chơi.');
    return;
  }

  var canvas = document.getElementById('game');
  try {
    G.Display.init(canvas);
    G.Render.init(canvas);
  } catch (err) {
    fail('Thiết bị hoặc trình duyệt này không hỗ trợ WebGL.');
    console.error(err);
    return;
  }

  G.Input.init(canvas);
  G.World.build();
  G.Decor.build();
  G.Town.build();
  if (G.Scenery) G.Scenery.build();
  if (G.DetailTerrain) G.DetailTerrain.build();   // Stage 10.5 Part 4: ground/pier/water decor, building + prop detail, ambient life
  if (G.DetailTown) G.DetailTown.build();
  if (G.FarmLook) G.FarmLook.build();   // Stage 15F1: plot signs, fence variety, border flowers
  if (G.Landmarks) G.Landmarks.build();   // Stage 15F2a: windmill, shed, shrine tree, notice board, compost, trough
  if (G.DetailExtra) G.DetailExtra.build();   // Stage 15F3: edge skirt, tufts, pebbles, rocks, mushrooms
  if (G.Critters) G.Critters.build();   // Stage 15F2b: chickens, ducks, beehive + bees
  if (G.Ambient) G.Ambient.build();
  if (G.AmbientPlus) G.AmbientPlus.build();   // Stage 15F2b: fireflies, dragonflies, koi jumps, puddles, seasonal litter
  if (G.Weather) G.Weather.build();   // Stage 11: rain / snow / ripples + weather dim   // Stage 10.5 Part 3: scenery ring, grove, meadow, bridge, props
  if (G.Farm) G.Farm.build();
  if (G.FarmFx) G.FarmFx.build();   // Stage 7   // Stage 6: well, tile overlays, crop markers

  // New game start: the tile in front of the house door, facing the door.
  function newSpawn() {
    if (G.House && G.Scenes.has('house')) return G.House.wakeSpawn();   // Stage 5: wake up in the house
    var door = G.World.listInteractables('door')[0];
    return door ? { tx: door.stand.tx, tz: door.stand.tz, facing: door.facing } : { tx: 9, tz: 13, facing: 'n' };
  }

  // Savers (Stage 2). Scene/player/camera are applied together on save:loaded / save:reset.
  var pending = null;
  G.Save.register('time', G.Time, 'world');
  G.Save.register('state', G.State, 'player');
  G.Save.register('inventory', G.Inventory, 'player');
  G.Save.register('camera', {
    save: function () { var c = G.Camera.getState(); return { yawStep: c.yawStep, zoom: c.zoom }; },
    load: function (o) { G.Camera.setState({ yawStep: (o && o.yawStep) || 0, zoom: (o && o.zoom) || 1 }); },
    reset: function () { G.Camera.setState({ yawStep: 0, zoom: 1 }); }
  }, 'player');
  G.Save.register('scenes', {
    save: function () { return { current: G.Scenes.current }; },
    load: function (o) { pending = pending || {}; pending.scene = o && o.current; },
    reset: function () { pending = { scene: G.Scenes.has('house') ? 'house' : 'outdoor', spawn: newSpawn() }; }
  }, 'player');
  G.Save.register('player', {
    save: function () { var P = G.Player; return { x: P.pos.x, z: P.pos.z, facing: P.facing }; },
    load: function (o) { pending = pending || {}; pending.pos = o; },
    reset: function () { pending = pending || {}; pending.spawn = newSpawn(); }
  }, 'player');

  function applyPending() {
    var p = pending || {}; pending = null;
    var scene = p.scene || 'outdoor', spawn = p.spawn;
    if (!spawn && p.pos && typeof p.pos.x === 'number') spawn = { x: p.pos.x, z: p.pos.z, facing: p.pos.facing || 's' };
    if (!spawn || !G.Scenes.has(scene)) { scene = 'outdoor'; spawn = spawn && G.Scenes.has(p.scene || 'outdoor') ? spawn : newSpawn(); }
    G.Player.stop();
    G.Scenes.go(scene, spawn, { instant: true });
  }
  G.Events.on('save:loaded', applyPending);
  G.Events.on('save:reset', applyPending);

  G.Camera.setState({ yawStep: 0, zoom: 1 });
  if (G.SaveSlots) G.SaveSlots.init();   // Stage 14A: pick the active slot key (migrates the v1 save) before loading
  if (!G.Save.load()) G.Save.newGame(true);   // fresh storage: no save is written before the title screen choice

  G.debug = {
    give: function (id, n) { return G.Inventory.add(id, n === undefined ? 1 : n); },
    setTime: function (h) { G.Time.setHour(h); },
    skipDay: function () { return G.Day.sleep(); },
    addMoney: function (n) { return G.State.addMoney(n); }
  };

  G.Loop.start();
  G.Events.emit('game:ready', { stage: 13 });
})();
