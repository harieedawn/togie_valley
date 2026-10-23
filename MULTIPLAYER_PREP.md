# Multiplayer prep (Stage 14A) - light seams, NO networking yet
Solo play is unchanged. These are the hooks a future co-op stage plugs into.

## Seams
- `Game.Net` (js/net.js): `{mode:'solo', isHost:true, playerId:'p1'}`. A real transport later replaces mode/isHost/playerId.
- `Game.Players` (js/net.js): `local()` (= `Game.Player`), `localId()`, `get(id)`, `list()`, `add(id,obj)`, `remove(id)`.
- Events `by`: `soil:tilled`, `soil:watered`, `crop:planted`, `crop:harvested`, `crop:cleared`,
  `shop:transaction`, `fish:caught` carry `by` = `Net.playerId` (who caused the change).
- `Game.Save.register(key, def, scope)`: scope `'world'` (shared: time, farm, house, economy) or
  `'player'` (per person: state, inventory, camera, scenes, player, goals, notebook, cooking, fishing).
  Metadata only (`Save.scopeOf(key)`, `Save.keys(scope)`); the saved JSON is identical to before.
- `Net.rand(tag, salt)`: seeded float from `Time.seed + Time.day + tag + salt`. Weather (`Time.weatherFor`)
  already works this way. Fishing catch/junk/quality/bite-wait and harvest quality use it.
- Save slots (js/saveslots.js) keep one farm per slot, so shared devices do not overwrite each other.

## Rule for future code
1. Anything that changes the shared world (farm, shop, economy, time) must go through a function that emits
   one event with `by`; never mutate world state from rendering or UI code.
2. Gameplay randomness (outcomes, prices, spawns, weather) uses `Net.rand` or `util.rng(Time.seed + day ...)`.
   `Math.random` is for cosmetics only (particles, sway, ambience, NPC idle, reel-bar motion).
3. New saver: pass the scope. World data = host authoritative; player data = owned by its player.
4. Look players up via `Players`, never assume a single `Game.Player` in new systems.
5. Do not add networking, timers or sockets outside js/net.js.

## Known gaps (later stage)
- Many modules still read `Game.Player` / `Game.State` directly (single-player inventory, money, energy).
- Day change, sleep and the pause-on-panel clock are local; they need a host rule.
- Town NPC wandering and reel minigame motion use `Math.random` on purpose (cosmetic/local).
