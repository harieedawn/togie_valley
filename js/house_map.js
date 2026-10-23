/* Togie Valley - house_map.js (Stage 5 fix): interior collision data for the 'house' scene.
 * Plain data + tiny helpers, readable by the browser (Game.HouseMap) and by node (module.exports).
 * Legend: . floor  r rug (walkable)  D door tile (walkable)  B bed  C chest  K counter  O stove  T table  P plant (blocked).
 * Local tile (ix,iz): ix = column, iz = row. Spot entry = [ix, iz, standIx, standIz, facing].
 */
(function (root) {
  'use strict';
  var rows = [
    'B..KO.C',
    'B......',
    '.rrr...',
    '.rrrTT.',
    '..r....',
    '...D..P'
  ];
  var WALK = { '.': 1, 'r': 1, 'D': 1 };
  var Map = {
    rows: rows,
    width: rows[0].length,
    depth: rows.length,
    at: function (ix, iz) { return (iz >= 0 && iz < rows.length && ix >= 0 && ix < rows[iz].length) ? rows[iz].charAt(ix) : ' '; },
    isWalkable: function (ix, iz) { return !!WALK[Map.at(ix, iz)]; },
    spots: {
      bed: [[0, 0, 1, 0, 'w'], [0, 1, 1, 1, 'w']],
      chest: [[6, 0, 6, 1, 'n']],
      kitchen: [[3, 0, 3, 1, 'n'], [4, 0, 4, 1, 'n']],
      door: [[3, 5, 3, 5, 's'], [3, 6, 3, 5, 's']]
    },
    // spawns: [ix, iz, facing]; always free floor, facing into the room
    spawns: { wake: [1, 2, 'e'], bed: [1, 1, 'e'], door: [3, 4, 'n'] }
  };
  if (root.Game) root.Game.HouseMap = Map;
  if (typeof module !== 'undefined' && module.exports) module.exports = Map;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
