# Togie Valley - DESIGN.md
Design bible + stage plan. Read §0-§12 fully, then ONLY your own stage (`sed -n '/^## STAGE N /,/^## STAGE N+1 /p' DESIGN.md`). CONTRACT.md is the truth for APIs that already exist; this file is the truth for intent and numbers. If they conflict, keep what exists and note the deviation in CONTRACT.md.

## §0 Workflow rules (every stage)
1. One stage = one fresh chat. Input: latest Togie_Valley.zip. Output: the WHOLE project re-zipped to /mnt/user-data/outputs/Togie_Valley.zip (same top folder "Togie Valley/") + present_files. Do only your stage; no extras, no refactors of finished stages.
2. Read DESIGN §0-§12 + own stage + CONTRACT.md. Open source files only as needed, via grep -n / sed -n ranges. Never cat render.js, models.js, core.js whole (the contract documents them).
3. New features = NEW module files, added to index.html in dependency order before main.js. Edit existing files only with small str_replace patches; never regenerate or reformat files you don't own.
4. Style: plain ES5-style IIFEs on window.Game (var/function; no ES modules, bundler, npm, build step). Three.js r128 API only. English identifiers/comments. Guard missing deps (console.error + early return).
5. Modules talk via Game.Events (`domain:event`), persist via Game.Save.register (after Stage 2), add no globals, no storage outside the `togie-valley/` prefix.
6. Update CONTRACT.md tersely: new API signatures, events, save keys, a Stage-log line, the Status line. It is read every stage, so keep it short.
7. Verify with `node tools/check.js` (created in Stage 1; before that use `node --check`). No browser, network, screenshots, test harnesses or web searches unless the stage says so.
8. Several modules in a stage -> after the first one works: zip + present_files (checkpoint); at the end zip + present again. Final reply: Vietnamese, max 3 lines (what works + one known risk).
9. Perf budget (mid-range phone): total draw calls <= 150, merge or instance anything repeated, no per-frame allocations, no shadow maps (blob shadows), no external assets (vertex colors, shaders, procedural geometry, procedural SVG icons, WebAudio synthesis).

10. Language (Stage 10.5): ALL player-facing text is Vietnamese with correct diacritics (warm, cute, friendly), written directly in source. No i18n layer. Code, identifiers and comments stay English. Never change ids, keys or save fields when rewording. Glossary: Cửa hàng, Xưởng, Sạp cá, Túi đồ, Rương, Cuốc, Bình tưới, Cần câu tre, Hạt giống, Phân bón, Mồi câu, Thùng bán đồ, Sổ tay. Currency stays "g". `Game.VI` (core.js) holds season/weather/quality labels. tools/check.js warns on English-looking UI literals.

## §1 Look & feel
Inked-comic toon renderer already exists (3 bands, wobbly ink outline, 45-degree halftone, grain). Palette: warm pastel, cozy, no neon, no glow, no bloom.
UI: chunky rounded "paper card" panels (cream #fff1d0, brown #8c5a34 3px borders, soft offset shadow), big touch targets (>= 48px), safe-area insets, portrait + landscape, no hover dependence. Buttons squash on press (scale .94) and spring back; panels pop in (150-250ms ease-out-back). Fonts (Stage 4.5B): body "Google Sans" variable (fonts/gsans-vf.woff, wght 400-700, OFL), display "Baloo 2" 600-800 from Google Fonts (titles, numbers, buttons, badges; falls back to Google Sans 700). All colours/radii/shadows/easing are tokens in css/ui.css `:root`; animate only transform/opacity; honor prefers-reduced-motion. Icons = procedural inline SVG from `Game.Icons` (Stage 4.5A, js/icons.js), style "cozy ink sticker": 64x64 viewBox, chubby kawaii shapes, one #5b3a29 ink outline (3.5), flat 3-tone fill + white glint, soft ground shadow, no gradients. Item defs pick a template with `icon:{tpl,c1,c2,c3?,v?,n?}`; UI glyphs via `Game.Icons.ui(name,px)`. Emoji are banned everywhere (tools/check.js warns). Light haptics via navigator.vibrate(8) where supported.
Characters: simple, cute, Play-Together-like. Animation is detailed and soft: anticipation + overshoot on tool swings, squash/stretch on landing/pop, idle breathing + blink, hair/hat bounce.

## §2 Time & calendar
- Day 06:00 -> 26:00 (02:00 forced pass-out). 10 game-min = 4.0 real s (about 8 real min per day). Clock freezes while any modal/panel/minigame is open; keeps running indoors.
- Season = 14 days (spring, summer, autumn, winter); year = 56 days. Day 1 and 2 are always sunny.
- Weather rolled at bedtime for tomorrow (seeded, saved): sun / rain (spring 25%, summer 15%, autumn 25%) / snow (winter 35%, else sun). Rain waters all crops. Weather is shown in the HUD and forecast in the morning summary.
- Energy max 100. Sleep before 24:00 = full; 24:00-26:00 = 75%; pass-out = 50% and lose 10% of money (max 500g). At 0 energy tools/casting are refused with a friendly toast (eat something).
- Money unit "g". Start money 500g.

## §3 Player & controls (touch-first, mouse equal)
- Short tap on ground: A* path (8-dir, no corner cutting) over World.isWalkableTile; no ground marker. Tap rhythm sets the speed (Stage 10.7): one tap not followed by another within 0.35 s = relaxed walk 2.0 u/s; two taps within 0.35 s (even on different spots) = run 3.6; three or more taps, each within 0.35 s of the previous = sprint 5.2 (stronger lean/bounce, bigger dust, no energy cost). The mode lasts for the current path, ends on arrival, and a new slow tap is a walk again. Same for taps on interactables.
- Press and hold (>180ms) on ground: continuous walk toward the finger's ground point, steering while dragged; release stops. Speed walk 2 -> run 3.6 u/s by distance to the finger (hold ignores tap rhythm).
- Tap on an interactable/crop/NPC/tile: walk to its stand tile, face it, act (see Interact registry). A big round Action button (bottom-right) uses the selected item / interacts with the facing tile; holding it repeats.
- Camera: tilted top-down follow, smooth. Rotate via two-finger twist, rotate buttons (90-degree smooth steps), Q/E. Pinch / wheel = zoom. Indoor/fishing presets tween.
- PC: mouse = touch; WASD/arrows also move.

## §4 Items & inventory
- Categories: tool, seed, crop, fish, fertilizer, bait, food, key, junk. Stack 99 (tools/keys 1). Quality normal/silver/gold = price x1 / x1.25 / x1.5, stacked separately.
- Backpack: 6 columns; 12 -> 24 -> 36 slots; hotbar = row 1 (6 slots). Tools can't be sold or dropped. Items carry `tip` (<= 90 chars, friendly real-world fact) and `icon:{tpl,c1,c2}` (templates: hoe can rod seed leafy longroot roundroot tuber fruit longfruit gourd berry pod corn wheat flower bulb grape fish boot driftwood bag sack bait bread bowl notebook coin; `v` variant, `n` petals; fallback by `cat`+`shape`).
- Tool tiers: Basic, Copper, Silver, Gold. Hoe/Watering Can area: 1 tile -> 1x3 line ahead -> 3x3 -> 3x5 ahead. Can capacity 40/55/70/85 (1 per tile). Energy per use: hoe 2, can 1, rod 2; x0.85 per tier above basic.
- New-game loadout: Hoe, Watering Can, Bamboo Pole in hotbar. Starter chest in the house: Parsnip Seeds x15, Potato Seeds x6, Compost x5, Bread x3, Farmer's Notebook (key item).
- Skills: Farming and Fishing, level 1-10, XP thresholds 100,380,770,1300,2150,3300,4800,6900,10000,15000. Farming XP per harvest = round(16*ln(0.018*price+1)); fishing XP per catch = scaled by price/difficulty. Levels gate shop items and upgrades.

## §5 Farming rules
- Core soil (8x6) is tillable from the start; locked plots (fenced, 14x10 total) unlock via permits (Stage 8). Tilled soil stays tilled. Planting needs tilled soil + a seed in the right season (wrong season -> friendly educational toast, no planting).
- Watering: tile `watered` flag, reset at sleep; rain sets all; sprinkler (Farming Lv3) waters 4 neighbors each morning (tier 2: 8). Refill the can at the farm well (a prop + interactable added in Stage 6, next to the farm on grass) or at any water edge.
- Growth: days to mature = max(2, ceil(StardewDays/2)); regrow = max(1, ceil(StardewRegrow/2)). A crop advances 1 day only if its tile was watered. "Hungry" crops (primary nutrient < 25) advance only every other day.
- Soil nutrients per tilled tile: n, p, k in 0..100, start 60. Crop class sets the primary nutrient: leaf -> N, fruit/flower -> P, root/tuber -> K. Legumes (beans, peas) add +15 N when harvested/cleared (real nitrogen fixing). Harvest drains primary -15 (regrowers -5 per pick), others -3.
- Fertilizers (apply to any tilled tile, even with a crop): Compost n,p,k +20 (20g), Leaf Feed N +50 (40g), Bloom Feed P +50 (40g), Root Feed K +50 (40g). Cap 100.
- Quality: gold chance = 0.02 + 0.02*farmLvl + (primary>=60 ? 0.1 : 0) + (primary>=85 ? 0.1 : 0); silver chance = 2x gold (clamped).
- Out-of-season crops wither at season change (brown); clear them with the hoe.
- Visual cues teach: pale/yellow leaves = hungry; droopy = dry (visual only); soil darker = watered.
- Crop catalog (about 38; prices and growth days from Stardew Valley as you know them; seed price = Stardew seed price). Spring: Parsnip, Green Bean*, Cauliflower, Potato, Kale, Garlic, Rhubarb, Strawberry*, Blue Jazz, Tulip. Summer: Melon, Tomato*, Blueberry*, Hot Pepper*, Wheat, Radish, Red Cabbage, Starfruit, Corn*, Poppy, Summer Spangle, Sunflower. Autumn: Pumpkin, Eggplant*, Yam, Cranberry*, Artichoke, Beet, Bok Choy, Amaranth, Grape*, Fairy Rose, Corn*, Sunflower, Wheat. Winter (cool-season, invented values): Spinach, Leek, Brussels Sprouts, Carrot, Powdermelon. (*=regrows.) Each crop: class (leaf/fruit/root/legume/flower/grain), seasons, visual `shape`, palette, `tip`. Seed shop level gate: seed price <=100 Lv1, <=250 Lv2, <=400 Lv4, higher Lv6-8.

## §6 Fishing rules
- Fishing spots = pier seats seat1..seat4 (existing markers, shallow -> deep). Sitting is the fishing stance.
- Flow: hold Action/tap water to charge a power meter, release to cast -> distance sets zone (shallow/mid/deep; seat position shifts the range). Wait 2-8s (bait shortens) -> bobber dips + "!" bubble + haptic -> tap within 0.9s (Carbon rod +0.4s) -> reel minigame: vertical bar, hold = rise, release = fall; fish icon moves by behavior (mixed/smooth/dart/sinker/floater, difficulty 1-5); progress meter fills/drains; success = catch (quality from level + perfect bonus), fail = escapes.
- About 26 freshwater species (price 30-900, zone, seasons, hours, weather, difficulty, behavior, preferred bait, min Lv, `tip`) incl. one legendary (Lv8, rare weather/season), plus 4 junk items (Old Boot, Driftwood, Soggy Newspaper, Plastic Bag; junk sells 1-5g, bag shows a "keep the lake clean" tip).
- Rods (sold by the fishmonger): Bamboo (start, no bait) -> Fiberglass (Lv2, 900g, bait slot) -> Carbon (Lv6, 2500g, bait + bigger catch bar) -> Master (Lv9, 6000g, bait + bar + longer bite window). Bait: Worm 5g (bottom feeders), Dough 15g (carp/goldfish types), Minnow 20g (predators). Rain, dawn/dusk and cold water change what bites (shown in tips).
- Casting costs 2 energy.

## §7 Economy
- No instant sales (Stardew rule): crops go into the shipping bin (B marker by the house), fish into the fish stall crate; both pay out at wake-up and appear in the morning summary.
- Shop (shopkeeper): season- and level-gated seeds, fertilizers, sprinkler (Lv3, 300g), food (Bread 30g +25 energy, Rice Ball, Veggie Soup...), backpack upgrades (24 slots 2000g, 36 slots 6000g), farm plot permits (4 expansions: 400/900/1800/3500g). Locked items show why ("Farming Lv 3").
- Workshop: Hoe/Can upgrades 500/1500/4000g, need Farming Lv 2/4/7; the tool is handed in and ready next morning (pick up at the counter / auto-mail).
- Fish stall (fishmonger): buys fish, sells rods and bait.
- Eating: select a food/crop/fish item and press Action (or tap selected slot twice): energy + sound + toast.

## §8 Education layer (light)
Every crop, fish, fertilizer, bait has a one-line friendly `tip` (<= 90 chars): shown in tooltips, unlocked in the Farmer's Notebook on first harvest/catch. Contextual hints appear once (first rain: rain waters crops; first hungry crop: which nutrient; first legume; first night fishing...). NPC chatter rotates real tips. Tone: warm, curious, never lecturing. Notebook sections: Crops, Fish, Soil (N-P-K), Weather & Seasons.

Language: all text shown to the player is Vietnamese (see §0 rule 10); ids, keys and save fields keep their English names.

## §9 Scenes & world
Outdoor map 56x36 (Game.World). Interiors are separate hidden Groups shown by Game.Scenes with a 300ms fade and the indoor camera preset. House interior ~7x6 tiles: bed, chest, kitchen counter + stove, table + lamp, rug, window, door. New game starts inside the house beside the bed; the chest pulses with a bouncing arrow until first opened.

## §10 Save
One JSON at `togie-valley/save/v1`, one section per module via Save.register. Autosave: every 20s, on visibilitychange(hidden)/pagehide, after sleep, after shop transactions. Atomic write (tmp key then swap) + one backup `togie-valley/save/v1.bak`; try navigator.storage.persist(). Restores exact scene, position, facing, time, selected slot. Transient states (fishing, minigame, open panels) reset to idle. Menu has Export/Import save code (base64 text) to move between devices. Title screen: Continue / New Game. Migrations keyed by `version`.

## §11 Audio
See AUDIO_DESIGN.md (Stages 11.5A/B/C); it replaces this section.

## §12 Cross-module agreements (implement these names exactly; document in CONTRACT.md)
- `Game.Player` (S1): `pos`, `scene`, `walkTo(tx,tz,onArrive,onFail)`, `face(dir)`, `lock(reason)/unlock(reason)`, `isLocked()`, `playAction(name,opts,cb)` (stub that calls cb after a short timer until Stage 7 adds real animations), `sitAt(tx,tz)/standUp()`.
- `Game.Interact` (S1): `register({id, priority, test(tx,tz,scene)->target|null, stand(target)->{tx,tz,facing}|null, run(target,done)})`, `resolve(tx,tz)`, `useFacing()`. Highest priority that returns a target wins. Default handler walks to World interactables and emits `interact:<type>` `{id}`.
- `Game.Scenes` (S1): `register(name,{enter(spawn),exit()})`, `go(name,spawn,opts)`, `current`; event `scene:changed`.
- `Game.Items` (S2): `define(def)`, `get(id)`, `all(cat?)`. Every stage defines its own items in its own data file.
- `Game.Inventory` / `Game.State` (S2): `add(id,n,q)`, `remove`, `count`, `canAdd`, `selected()`, `select(i)`, `move(a,b)`; `State.money`, `addMoney`, `spendMoney`, `energy`, `useEnergy(n)`, `addXp(skill,n)`, `level(skill)`; events `inventory:changed`, `state:changed`, `skill:levelUp`. `Game.Containers.create(n)` generic slot container (chest, bin, crate).
- `Game.Time` / `Game.Day` (S2): events `time:minuteStep` `{hour}`, `time:hourChanged`, `day:started` `{day,season,weather}`; `Day.onEnd(priority,fn)` (low first), `Day.onStart(priority,fn)`, `Day.sleep()`, `Time.pause(reason)/resume(reason)`; seasons event `season:changed`.
- `Game.Save` (S2): `register(key,{save(),load(obj),reset()})`, `request()`, `load()`, `newGame()`, `exportCode()`, `importCode(str)`.
- `Game.UI` (S3): `toast(msg,icon)`, `dialog(opts)`, `confirm(opts,cb)`, `openPanel(el|id)`/`closePanel()` (pauses Time), `openContainer(container,opts)` (S4), `hud` handles, `sfx(name)` -> emits `ui:sfx`.

## Stage roadmap (each is a separate fresh chat; one module family each)
1 Foundation | 2 Core state | 3 UI kit + HUD | 4 Panels | 4.5A Icons (done) | 5 House & sleep | 6 Farming logic | 7 Farming visuals | 8 Economy | 9 Fishing logic | 10 Fishing visuals | 11 Weather & audio | 12 Notebook, goals, cooking | 13 Release

## STAGE 1 Foundation
- Catch-up: document Game.Props, Game.Decor, Game.Town in CONTRACT.md (read their sources briefly; the contract is stale); add town.js to index.html and call Game.Town.build() in main.js; copy the uploaded DESIGN.md into the project root.
- `js/errors.js` (loaded right after three.js): window.onerror + unhandledrejection -> small dismissable on-screen panel with message, file:line and a Copy button.
- `tools/check.js` (Node, no deps): `node --check` every js file; verify every `<script src>` in index.html exists; heuristic scan listing `Game.<Name>.<member>` references whose Name is never assigned (`Game.Name =` / `G.Name =`) or whose member never appears as `member:`, `.member =` or `function member`. Print warnings only; exit code 1 on syntax errors or missing scripts.
- `js/input.js`, `js/player.js`, `js/interact.js`, `js/scenes.js` per §3 and §12. Player: hero from Models.character (straw hat), fixed-step movement with wall sliding, interpolated rendering per CONTRACT, stuck handling, camera follow with the outdoor preset, start on the tile in front of the house door. Scenes: register 'outdoor' wrapping the existing world; fade overlay div.
- Replace the main.js demo with the real boot (no circle script, no debug buttons).
- Done = tap-walk, hold-walk, rotate/zoom work; tapping door/shop/workshop/fish stall/seat walks there, faces it and emits `interact:<type>`.

## STAGE 2 Core state
- `js/items.js`, `js/state.js` (State, Inventory, Containers), `js/time.js` (Time, Day, weather roll, season, drives Render.setTimeOfDay/setSeason), `js/save.js`; no visuals.
- Define only the base items now: Hoe, Watering Can, Bamboo Pole (tier fields), Compost, Leaf/Bloom/Root Feed, Bread, Farmer's Notebook.
- Wire main.js: Save.load() or newGame(); register Player/Scenes/Camera/Time/State/Inventory as savers; autosave triggers per §10.
- `window.Game.debug`: `give(id,n)`, `setTime(h)`, `skipDay()`, `addMoney(n)`.
- Done = reload restores position, scene, time, inventory; day rollover with onEnd/onStart hooks works; export/import round-trips.

## STAGE 3 UI kit + HUD
- `css/ui.css`, `js/ui.js`. Panel/modal stack (pauses Time and locks Player), toast queue, NPC dialog box (typewriter, tap to advance), confirm, button squash styles.
- HUD: clock/date/season/weather chip (top-left), money with count-up (top-right), energy bar, hotbar (6 slots, selected pop, tier ring, stack count), Action button (hold repeats, emits `input:action`), rotate buttons, menu button.
- Done = HUD reacts to events from Time/State/Inventory; portrait and landscape both fit.

## STAGE 4 Panels
- Backpack panel (grid, tap-select + tap-swap/merge, long-press tooltip with tip, sort), Skills tab (levels/XP bars), Settings tab (volume placeholder, Export/Import code, New Game confirm), Notebook tab placeholder.
- `UI.openContainer(container,opts)` Minecraft-style: container grid on top, backpack below, tap moves whole stack, long-press moves one/half, Take All, fly-to-slot icon animation; filter + onChange options (used by chest, bin, crate).
- Title screen: Continue / New Game.
- Done = chest-style transfer works with any Containers instance (test with a debug container).

## STAGE 5 House & sleep
- 'house' scene: procedural interior per §9 (bed, chest, kitchen counter + stove stub, table + lamp, rug, window with time-of-day light, door). Outdoor door interactable <-> indoor door via Scenes.
- New game: wake in the house, short camera intro, chest pulses; chest is a Container with the starter loadout (§4); 3 chained hint toasts (take items -> select hoe -> go outside).
- Bed: confirm -> fade -> Day.sleep() -> morning summary panel (earnings lines supplied by Day hooks, weather forecast, "Did you know?" tip) -> wake in bed. 26:00 pass-out handled.
- Done = full loop: start, take items, leave, return, sleep, summary, next day.

## STAGE 6 Farming logic
- `js/data_crops.js` (catalog per §5, defines seed + crop items), `js/farm.js` (Game.Farm), well prop + interactable, `World.setTile/setBlocked` + `World.unlockPlot(n)` (rebuild the ground mesh).
- Interact handlers + Action button for: hoe (till), can (water, refill), seeds (plant), fertilizer, empty hand/any item on ripe crop (harvest), hoe on wilted crop (clear). Tool areas, energy, XP, quality, nutrients, legumes, season wither, rain, sprinkler logic, first-time educational hints.
- Day.onEnd priority 10: growth, wither, rain/sprinkler watering. Save section `farm`.
- Minimal visuals only: instanced flat tile overlays (tilled / watered) and a simple placeholder marker per crop (colored cone scaled by growth). Real visuals come in Stage 7.
- Every item def (seeds, crops) MUST set `icon:{tpl,c1,c2}`: seed -> `tpl:'seed'` (`c1` crop colour, `v` round|long|leaf); crops -> leafy/longroot/roundroot/tuber/fruit/longfruit/gourd/berry/pod/corn/wheat/flower/bulb/grape (`n` petals for flower). Add `shape` too for the cat fallback.
- Done = till, water, plant, sleep, grow, harvest, items land in inventory with correct quality; state survives reload.

## STAGE 7 Farming visuals
- Procedural crop models per `shape` (rosette, stalk, vine-bush, root-top, bush, flower, tall-corn, ground-fruit) x growth stages, vertex-colored, instanced with sway; ripe fruit colors; hungry = pale yellow, wilted = brown. Budget <= +40 draw calls (hide empty instanced meshes).
- Tilled-soil mounds, watered darkening animation, planting dirt puff, harvest pop (leaf/sparkle particles, toon-safe, no glow), floating "+1" icon that flies to the hotbar.
- Real tool animations through `Player.playAction('till'|'water'|'plant'|'harvest'|'eat')` with held tool model on attach.handR, anticipation/overshoot, water droplet arc; fertilizer sprinkle; sprinkler + well visuals.
- Done = every farming action has a cute animation and feedback.

## STAGE 8 Economy
- `js/data_shop.js`, `js/shop.js`: shop UI (quantity stepper, season/level gating with reasons), workshop upgrade UI (hand-in, ready next morning), shipping bin and fish stall crate (Containers + payout hooks), fish stall buy/sell, plot permits, backpack upgrades, sprinkler, food items + eating.
- NPC dialogue lines (season/weather aware, rotating tips); NPC idle animation hooks from Town if present.
- Morning payout lines feed the Stage 5 summary. Save section `economy`.
- Every item def (food, sprinkler, upgrade tokens, permits) MUST set `icon:{tpl,c1,c2}` (bread, bowl, sack, coin, notebook...); shop rows render `Game.Icons.item(def, px, tier)`, never emoji.
- Done = full money loop: ship -> sleep -> paid -> buy -> upgrade.

## STAGE 9 Fishing logic
- `js/data_fish.js` (species, junk, rods, bait items), `js/fishing.js` (Game.Fishing): seat interaction + sit, state machine idle -> charge -> cast -> wait -> bite -> reel -> result, minigame as a canvas/DOM overlay (portrait friendly), bait/rod/zone/time/weather/season rules, quality, XP, first-catch tip, record counters. Save section `fishing`. Placeholder bobber mesh only.
- Every item def MUST set `icon:{tpl,c1,c2}`: species `tpl:'fish'` + `v` slim|round|flat with c1/c2/c3 colours; junk boot/driftwood/bag; bait `tpl:'bait'` + `v` worm|dough|minnow; rods `tpl:'rod'` (tier ring via slot tier).
- Done = fish can be caught, shown in inventory, sold via Stage 8 crate; rules from §6 verifiable.

## STAGE 10 Fishing visuals
- Rod model on handR with bend, thin line with sag (one Line object), bobber bob + dip, water ring ripples, cast/catch splash particles, fish shadow circling near the bobber, catch celebration (fish held overhead, star confetti, toast), sitting + cast + reel animations, slight camera zoom-in while fishing.
- Done = fishing feels cute and readable on a phone.

## STAGE 11 Weather & audio
- Weather visuals: rain streaks, puddle ripples, darker tint, snow dots, falling leaves (autumn), petals (spring); all instanced, cheap, toon style.
- `js/audio.js` per §11 + `ui:sfx` and gameplay event hooks; Settings volume/mute wired and saved.
- Done = every action has a sound; rain/snow render with <= +10 draw calls.

## STAGE 12 Notebook, goals, cooking
- Farmer's Notebook UI (§8) fed by first-harvest/first-catch events and `tip` fields.
- `Game.Goals`: 12-15 event-driven goals (ship 5 crops, first rain, catch 5 species, upgrade a tool, all seasons seen...) with rewards + progress bars; final goal triggers a short cute celebration.
- Kitchen (stove in the house): 8-10 recipes unlocked by levels, using crops/fish; food items with energy + timed buff (walk speed, fishing, farming) shown as a HUD chip; each recipe carries a nutrition tip.
- Every recipe/food item def MUST set `icon:{tpl,c1,c2}` (bowl/bread/coin...); goal and notebook UI use `Game.Icons.ui(name,px)`, no emoji.
- Done = goals progress/reward correctly; cooking consumes and produces items; saved.

## STAGE 13 Release
- PWA: manifest.webmanifest, sw.js (cache-first for same-origin + runtime-cache the three.js CDN; it must also cache the Google Fonts CSS (fonts.googleapis.com) and the font files (fonts.gstatic.com) so Baloo 2 works offline; fonts/gsans-vf.woff is same-origin), icons generated with Python PIL (192/512/maskable/apple-touch), meta tags, orientation-friendly.
- Perf/robustness pass: audit draw calls and per-frame allocations, low-quality auto fallback (halftone/outline/pixelRatio), context-loss recovery, leak scan; run tools/check.js and fix every warning; verify save migration + corrupt-save fallback to .bak.
- README.md (English; GitHub Pages deploy steps) + QA.md (phone test checklist, 25 items max).
- Done = installable on a phone home screen, works offline after first load, zero check.js warnings.

## Stage 13 notes (from 11.5C)
- Service worker: do NOT precache `music/`; optionally runtime-cache tracks as they play (cache-first after first play, cap 40 MB, evict oldest). `music/playlist.json` and the HEAD probes of `music/NN.mp3` must work offline-tolerantly (a failed probe = end of list).
- Audio settings live in localStorage `togie-valley/audio`, outside the game save.
