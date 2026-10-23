# POLISH_PLAN.md - Togie Valley, Stage 15 series (15A-15G)

Spec for the polish/extension stages. Each worker chat does exactly ONE stage section below plus the global rules. Player-facing text: Vietnamese. Code/comments: English. Source of truth for APIs stays CONTRACT.md. Update CONTRACT.md every stage (new APIs, events, save/localStorage keys, status line, progress lines).

## G. Global rules (every stage)

- Vietnamese labels quoted in this file (e.g. "Kieu dieu khien", "Cham de di") are written without diacritics only to save space. In the game always use full, correct Vietnamese with diacritics (e.g. "Kiểu điều khiển", "Chạm để đi") and natural wording.

- Quality bar: real craft, never lazy. Every new prop/animation must be detailed, cute, cozy and readable on a phone. No copy-pasted look: vary instances with seeded rng (size, rotation, tint, small shape differences). No emoji; icons via Game.Icons. No English UI strings.
- Visual language: inked-comic cel shading (3 toon bands), vertex colors, outlines via the existing outline helper (R.addOutline), cozy pastel palette, no neon/glow, uniform scale only on toon meshes (do squash/stretch through pose offsets and position, not non-uniform scale).
- Performance is a hard requirement: draw calls <= 150, no shadow maps, no per-frame allocations (no `new` Vector3/Color/arrays inside update loops; reuse scratch objects), merge static geometry, InstancedMesh or merged buffers for repeats, share materials, distance-gate and visibility-gate animated extras, pool particles. Every new effect must respect Game.Quality tiers (full on Cao/Tu dong-high, reduced on Vua, minimal or off on Thap/Sieu nhe). Never make the Cao look worse than today.
- The worker sandbox cannot render the 3D scene or play audio. Keep 3D changes conservative and self-checked: build geometry from existing helpers (detail_kit.js, models.js, models_props.js, decor.js), keep new meshes within the map's solid-prop registry and the BFS reachability check (tools/check.js), and give audio as measurable numbers. DOM/CSS can be screenshotted with Python Playwright + Chromium: at most 3 viewed screenshots and one fix pass.
- New features go in new files (register them in index.html, sw.js cache list, tools/check.js script list, CONTRACT.md). Old files get small str_replace patches. Open sources only via grep -n / sed -n ranges.
- Extend `node tools/check.js` when a stage adds something checkable (e.g. clip registry coverage, new SFX, prop reachability). It must end with 0 errors.
- Checkpoint rule for multi-part stages: after each part run check.js, zip the whole project, present_files, and write the CONTRACT line `Stage 15X progress: Part N done`. A later Continue prompt resumes from that line.
- Usage saving: file-first, no preamble/recap/praise/offers, one pass, targeted patches, no web search, final reply max 3 lines in Vietnamese.

---

## STAGE 15A - Bug fixes and quick wins

### A1. River look (js/world.js, waterMaterial fragment shader)
Verified cause of the "dots": the `gl` term (`step(0.93, sin*sin)` white specks) plus hard `step(2.45,w)` foam blobs and hard `step(0.9,w)` patches read as scattered dots. Remove every hard-step speckle. Rebuild the water to look realistic yet still in the inked-cozy style, in the same single ShaderMaterial (no extra draw calls):
- smooth depth gradient from shallow (vK low) to deep, keep existing uniforms and fog/ambient handling;
- 2-3 layers of slow flowing caustic/ridge lines (abs(sin) ridges or cheap value-noise, thin and soft, low alpha) drifting in a consistent flow direction;
- long soft highlight streaks stretched along the flow direction (sun/sky reflection), slightly stronger toward the horizon (view-dependent), never dots;
- soft animated shoreline foam band with a wobbling edge (continuous, smoothstep edges, no stipple), plus faint foam trails around pier posts if cheap;
- toon feel allowed via 2-3 tones blended with smoothstep, not hard dotted steps.
Budget: at most ~12 sin/noise evaluations per fragment; Thap/Sieu nhe tiers use a cheaper variant (gradient + one ridge layer + foam rim). Also grep js/fishing_fx.js, js/ambient.js, js/scenery.js for white dot particles or sprites placed on water and remove or replace them (ripple rings are fine).

### A2. Dialogue box + NPC speech (css/ui.css, css/uiscale.css, js/ui.js, NPC callers)
Verified cause: css/uiscale.css line `#ui .tv-dialog { max-height...; overflow-y: auto; }` clips the absolutely positioned `.name` tab (top:-19px) and the tail, and shows a scrollbar. Fix: the outer `.tv-dialog` keeps `overflow: visible`; move scrolling to an inner wrapper around `.text` with its own max-height; the name tab, tail and "more" arrow must never be clipped at any UI scale (Nho/Vua/Lon), portrait or landscape, long text included. Keep the typewriter and Dialog blips working.
Then find every UI.dialog / NPC line source (grep "UI.dialog", "lines:", town/shop/house/goals/fishing tutorials) and rewrite all NPC lines in natural, warm, everyday Vietnamese as real villagers would speak: short sentences, light particles (nhe, nha, ne, a, day, thoi, nghen - used sparingly and correctly, with proper diacritics), natural forms of address, no machine-translated phrasing, no stiff textbook tone. Give each NPC a distinct voice (e.g. cheerful shopkeeper, laid-back fish seller, gruff-but-kind blacksmith/workshop keeper), 3-5 rotating variants for greetings and repeated situations, and lines that react to season, weather, time of day and the player's progress when data is available. Keep the educational hints correct (N-P-K, watering, bait).

### A3. Small UI scale bug (css/uiscale.css, js/ui_scale.js, css/ui.css)
Screenshot of Settings at "Nho" (scale 0.8) shows broken button/card corners (notched/cut corners) and the panel bottom edge looking cut. Cause is not yet verified: suspect `#ui` transform scale(0.8) combined with sub-pixel borders, inset box-shadows, pseudo-elements or `overflow` clipping on `.tv-btn`/`.tv-panel`. Reproduce with Playwright at viewport ~ 392x850 and DPR 2.75 for scale 0.8 and 1.0, find the cause, fix it so Nho/Vua/Lon/Tu dong all look identical in quality, and check every panel (settings, backpack, shop, notebook, save slots, title). Prefer layout via CSS variables or `zoom`-free rem sizing over fractional transforms if that is what fixes it; keep tap targets >= 40 px effective.

### A4. Fishing wait time and rarity (js/fishing.js: waitSeconds, pickCatch, plan at cast)
Currently `waitSeconds` = 2 + rand*6 s (2-8 s), and the catch plan is picked before the wait independent of its length. New rule: roll the wait first with a skewed random distribution (about 3-40 real seconds; most rolls short-medium, long waits rare), then derive the catch from it:
- short wait: common and small fish, quality weighted to normal;
- longer wait: rarity weights, size and quality chance scale up smoothly (rare/legendary species only become possible after a long wait, probability grows with wait); a very long wait gives the best fish;
- keep rod, bait, weather, season, zone, time-of-day, level and Cooking modifiers, but apply them as multipliers on the wait or weights, never breaking the rule above;
- the player gets no countdown (surprise), but the bobber animation may hint (stronger nibbles shortly before bite); add one short Vietnamese tip to the Farmer's Notebook and first-time hint: "Kien nhan doi lau, ca cang ngon" (with correct diacritics);
- reeling in early keeps the existing no-penalty rule.
Also verify unverified item: seatShift(idx) must support all 8 seats (north row seat1-4, south row seat5-8); derive the shift from each seat's water distance if it still clamps to 1-4.

### A5. Bush rustle sound (js/bush_fx.js -> audio, js/sfx_bank.js, js/dsp.js)
Current sound is poor. Redesign as a soft leafy rustle: 3-6 short grains of band-passed noise (about 1.8-5 kHz, quick 20-60 ms envelopes, random spacing), a faint low-mid brushing body (~300-700 Hz), tiny stem-snap tick occasionally, no harsh sustained hiss or high-frequency whine; low-pass the top so it sits behind footsteps. At least 5 variants, pitch/density scaled by walk vs run, rate-limited so continuous walking through bushes is not spammy, routed on the SFX bus. Verify with tools/sfx_report.js (no clipping, peak <= -6 dBFS, no DC, duration 0.15-0.45 s).

### A6. Inventory slot in the hotbar (js/ui.js / panels.js hotbar, css)
Add a Minecraft-style last slot "..." (three-dot icon via Game.Icons, new icon if missing) at the end of the hotbar that opens the backpack panel in one tap; also keyboard shortcut I/E-free key (do not clash with camera Q/E; use I or B). It is not a usable item slot (not counted in the 6 columns data), must wrap correctly with the existing narrow-portrait hotbar wrapping, and keep the hamburger menu button unchanged.

### A7. App icon (new tools/gen_icon.py, icons/, manifest.webmanifest, index.html, Capacitor/Android assets)
Existing icons are tiny flat PNGs and icon-maskable-512 is identical to icon-512 (no safe zone). Design one cute inked-comic icon with PIL (no network): rounded-friendly full-bleed square background (soft sky-to-meadow gradient with halftone corner), the straw-hat farmer silhouette or hat + sprout in the game's style with thick dark-brown ink outline and 3-band shading, readable at 48 px. Generate from one master at 1024 px with supersampling: icon-512, icon-192, apple-touch-icon (180, no transparency), maskable-512 (content inside the central 80% safe zone, full-bleed background), favicon 32/48, plus the Android adaptive foreground/background and legacy mipmap sizes if tools/android_patch.js / capacitor.config.json expect them. All variants must come from the same art so PWA and APK match. Update manifest, index.html links, sw.js cache list, BUILD_APK.md. View the master and one small size once to verify.

---

## STAGE 15B - Controls and camera

### B1. Virtual joystick (new js/joystick.js, css/joystick.css, hook into js/input.js and Player)
Read CONTRACT.md Player and Input sections first. Requirements:
- Setting "Kieu dieu khien" in Settings, device-level (localStorage like UiScale, not in the save): `Cham de di` (current tap/hold/tap-rhythm behaviour, unchanged), `Can troi` (floating joystick), `Can co dinh` (fixed joystick). Default on touch devices: Can troi; on desktop: Cham de di (WASD/arrows also move). Extra settings: size (Nho/Vua/Lon), opacity, and for fixed mode left/right handed side.
- Floating: a touch that starts on empty screen area in the left ~60% (not on HUD/panels) and either moves > 10 px or is held > 180 ms spawns the joystick base at the touch point; a quick short tap stays a normal tap (interact with NPC/chest/ground target as today). Fixed: base at the bottom corner, safe-area aware, above the hotbar and clear of the action button and fishing HUD.
- Analog movement: dead zone ~0.12, smooth response curve; direction is relative to camera yaw (Rig.getForward/getRight) and keeps working while the camera rotates; magnitude blends walk -> run -> sprint thresholds (reuse existing speeds, no new teleporting); smooth acceleration/deceleration (lerp velocity, no snapping); full tile collision with sliding along walls and the solid-prop registry; no A* path while the stick is held; releasing the stick stops with a short ease.
- Looks: inked paper-card style matching the UI (soft wood-brown ring, cream thumb knob with ink outline, subtle fade-in/out and tiny scale pop), no emoji. Multi-touch safe: two-finger twist/pinch camera gestures and the action button still work while the stick is held. Disabled during dialogs, panels, fishing minigame, and cutscenes (respect Player.lock).
- Performance: touch handling without allocations, transform-only DOM updates, one rAF-coupled update.
Expose Game.Joystick API in CONTRACT.md. Add the setting to the Settings panel with Vietnamese labels and short descriptions.

### B2. Camera modes (new js/camera_auto.js; uses Rig in render.js)
Merge of "auto rotate" and "follow heading". Setting "Camera" (device-level + persisted): `Thu cong` (current manual behaviour) and `Tu xoay theo huong di`; plus sensitivity Nhe/Vua/Nhanh for auto mode.
Auto mode behaviour: after the player has moved in a roughly consistent direction for ~0.5 s, ease Rig.yawTarget so the camera sits behind the walking direction (character walks toward the screen top); ignore turns smaller than ~25 degrees (dead zone) and quick back-and-forth; smooth with a critically damped follow (low lambda, max angular speed cap), no snapping, no motion sickness; never rotate while the player is standing still, fishing, in dialogs/panels, indoors (house room framing stays fixed), or sleeping; manual twist/Q/E input pauses auto for ~3 s then it resumes gently. With the joystick active, base the heading on stick direction in world space. Keep the existing 90-degree step and twist gestures working in manual mode. Save the camera mode in the same device-level store.

---

## STAGE 15C - Tutorial and menus (DOM/CSS, screenshot-checkable)

### C1. First-time tutorial (new js/tutorial.js, css/tutorial.css)
Only for a brand-new save (flag persisted via Game.Save.register under its own key; existing saves are not forced; a "Huong dan" button in Settings and the pause menu replays it anytime). After the new-game intro, show a paper-card carousel (5-6 pages, swipe or Tiep/Quay lai buttons, page dots, "Bo qua" always visible), each page with a hand-drawn-style animated SVG illustration made procedurally (no external assets, no emoji) and 1-2 short friendly Vietnamese lines:
1. Move: joystick/tap illustration (shows both modes) + "doi kieu dieu khien trong Cai dat".
2. Camera: twist gesture + auto-follow option.
3. Farm loop: cuoc dat -> tuoi nuoc -> gieo hat -> thu hoach as a 4-step animated strip; N-P-K tip in one line.
4. Fishing: pier seat, cast, reel bar (animated green zone), "doi lau ca ngon".
5. Selling and money: shipping bin / fish crate pay next morning; shop and workshop upgrades.
6. Notebook, hotbar "..." inventory, sleep to save the day.
Then contextual one-shot hints (small bubble with arrow, shown once each) the first time the player: stands near soil, holds seeds, sits at a pier seat, hits the bite, first night. Reuse Goals/Notebook where sensible; do not duplicate their text. All hints remember what was shown (save key). Keep the game paused while the carousel is open.

### C2. Menus
Redesign the title screen and the pause/main menu to look premium and cozy while staying in the paper-card inked style: title screen with layered parallax hill/sky SVG, drifting leaves/clouds (CSS transform-only animation, paused on Thap/Sieu nhe), inked logo "Togie Valley" in Baloo 2 with outline and a small bounce, big clear buttons (Tiep tuc with a slot summary: day/season/gold/playtime, Game moi, Cai dat, Huong dan); pause menu as an icon-tile grid (Ba lo, So tay, Muc tieu, Cai dat, Luu, Ve menu) with Game.Icons and badges, clean spacing at every UI scale and orientation. Check with Playwright (<= 3 screenshots).

---

## STAGE 15D - Character and tool animation (top priority)

### D0. Verified findings (js/farm_fx.js, js/farm.js, js/player.js)
- farm_fx.js `animate(dt)` aborts the action pose when `P.speed > 0.3` (`if (u >= 1 || P.speed > 0.3) { ... act = null }`), so any action that starts while the player still has residual speed (tap-walk, joystick, A* arrival) loses its animation: this is the "sometimes animated, sometimes not" bug.
- Only actions with keys in `K` (till, water, plant, fertilize, harvest, eat) get a pose; other `P.playAction` names (e.g. 'cast', any action used by fishing/cooking/shop/chest/sleep) have no clip.
- farm.js `act()` ignores taps while `acting` (no input buffer), and playAction in player.js is a stub wrapped by farm_fx.
Fix first: the player must stop and turn to face the target (ease the facing over ~0.12 s) before an action clip starts; the clip is never cancelled by residual speed, only by an explicit abort (damage-free game: only by panel/scene change or sleep); one buffered next action allowed; every name passed to P.playAction must resolve to a clip through a clip registry with a generic "interact" fallback; extend tools/check.js to list every playAction name against the registry (error if missing).

### D1. Clip system (new js/anim_clips.js; keep Models.Anim pose keys)
Data-driven clips with named phases (anticipation -> strike/impact -> follow-through -> settle), easing curves (easeOutBack, easeInOutCubic), an impact callback that fires exactly at the hit frame (effects, sound, soil change sync to it), 40-60 ms hit-stop feel at impact via time-scale of the pose only, tiny camera nudge on heavy hits (till), and blending in/out with locomotion (no pops). No per-frame allocations.

### D2. Action list (each must be polished, distinct and readable)
till (wind-up overhead, hoe arc with thin ink swoosh, dirt chunks, recover); water (lean, tilt can, arc stream, soil darkens with fade, can shakes last drops); plant (crouch, toss seed, pat soil); fertilize (sprinkle arc); harvest (pull with effort, hold up crop with sparkle for 0.4 s, crop pops into hotbar); pickup/open chest (lean + lid); eat/drink (bite, chew cheeks, happy bounce); cast (wind-up, whip, line arc, bobber plop); fishing wait (idle sway, rod-tip tremble); bite (startled hop with "!" mark, rod snap up); reel (lean back, rod bends with tension, feet dig dust); catch (hold fish overhead with the actual species model scaled by size, sparkle ring, proud bounce; rare fish bigger fanfare); lose fish (shrug/slump); sit/stand on pier seat (transitions); sleep/wake; buy/sell (hand over coins); cook (stir/chop); level-up (jump + sparkle); shake-off after rain optional. Tool tiers (Basic/Copper/Silver/Gold) look different in the hand (color, small details), tools sway with a one-pole lag (overlapping action), hat brim and hair lag a few frames behind the head.

### D3. Locomotion and idle
Distinct walk, run, sprint cycles (stride, arm swing, lean into acceleration, body-turn lag), smooth start/stop, analog speed blending ready for the joystick (B1), dust puffs on dirt/sand and tiny splash on shallow water (quality-gated), idle breathing + blink + random idle extras after ~6 s (look around, stretch, adjust hat, hum), crops/NPCs react to the player nearby (see D4).

### D4. NPC and world reactions
NPC idle loops (breathing, blink, small gestures), head look-at toward the player within ~4 tiles, wave when the player approaches, talk animation (head bob + hand gesture) during dialogue synced to blips; crops jiggle when watered/harvested/walked next to; chest/bin lids animate; doors open smoothly.

---

## STAGE 15E - Fish stall, town buildings, living world

### E1. Fish stall ("SAP CA") and fish models
Current look: fish are flat boxes/cones, the crate fish are two flat blobs, nothing moves. Rebuild:
- one shared fish mesh builder (check js/fishing_fx.js for an existing species look and reuse it): tapered ellipsoid body, tail fin, dorsal and pectoral fins, eye, belly/back two-tone via vertex colors, outline; 6-8 species variants by color/shape/size; use them everywhere (hanging fish, crate, display, caught-fish pose in D2);
- stall: striped scalloped awning with gentle cloth flutter, drying rack with fish on a line that sways, ice crate with ice cubes and fish, weighing scale hook, price blackboard (canvas-drawn Vietnamese text, small texture), buckets with fish that occasionally flop and splash, nets and floats, hanging lantern; the displayed fish change with what the player recently sold;
- life: seller NPC arranges fish, waves, blinks; a cat watching the fish (tail flick), a seagull that perches, hops and occasionally flies off and back (instanced/cheap), dripping water, a few flies/sparkles quality-gated.

### E2. Other town areas
Audit the town (workshop, shop, bin, doors, paths) as seen in screenshots: they look sparse. Give every building doorstep props, hanging signs that swing, flower boxes, barrels/crates with variety, window frames with warm light at dusk, chimney smoke (cheap particles), lanterns that turn on at evening, laundry or bunting lines with cloth sway, worn path edges, small stones/plants breaking the tile grid. Place props with the solid-prop registry and keep BFS reachability green.

---

## STAGE 15F - Farm and map richness

### F1. Farm field quality
Tilled soil with furrow shading variation, clods, wet-darkening transition, crop stages with more detailed per-crop silhouettes and gentle wind sway done in a vertex shader or cheap batched update (no per-crop JS cost), plot signs, small fence variety, border flowers.

### F2. Meaningful map additions (visual lore seeds; no quest system now)
Landmarks that make the valley feel inhabited: working windmill (rotating blades), stone well with bucket, scarecrow, compost bin, watering trough/barrel, tool shed, beehives with a few bees (instanced), 3-4 wandering chickens (instanced, simple state machine), ducks swimming on the lake, an old mossy shrine tree with hanging ribbons and a notice board near the town (Vietnamese texts, hints of a past), hammock, picnic blanket, mailbox, stepping stones, campfire spot with sparks, fireflies at night near water, dragonflies/butterflies by day, fish jumping occasionally, lily pads that sway, seasonal leaves/blossoms, rain puddles with ripples. Fill empty map areas without clutter: clusters with breathing room, readable silhouettes, respect solids/reachability, add decorative-only objects as non-solid where appropriate.

### F3. Small details everywhere
Grass tuft variety, pebbles, mushroom clusters, footprints on sand that fade, fence post variation, signposts, bridges rails, dock details (coiled rope, buckets), indoor house details. All instanced/merged and quality-gated.

---

## STAGE 15G - Performance and smoothness (no visual regression)

- Measure first: add an in-game perf overlay toggle (extend perf_ui.js) showing FPS, frame ms, draw calls and triangles from renderer.info, and a static report tools/perf_budget.js (draw-call estimate per scene/chunk, geometry counts, per-frame allocation scan for `new THREE.` and array literals inside update/animate functions, materials count, listener leaks); wire it into check.js (error if estimated draw calls > 150).
- Optimize without changing the look on Cao: merge static meshes per chunk, InstancedMesh for repeated props, share materials/geometries, dispose properly on scene swap, distance- and frustum-gate animated extras and particles, update HUD DOM only when values change, throttle low-priority systems (ambient, weather, NPC look-at) to 15-30 Hz, cap and pool particles, cap audio voices and node creation, debounce autosave, pause rendering and audio when the page is hidden, cap devicePixelRatio per quality tier with Cao keeping today's sharpness, make the Auto tier adapt using sampled frame times with hysteresis (no flapping).
- Visual parity checklist (must hold): same outline thickness, same toon bands, same palette, same halftone, same view distance on Cao; only Vua/Thap/Sieu nhe may reduce features, each reduction listed in CONTRACT.md.
- Deliver a short Vietnamese summary of measured before/after estimates and which items still need a real-phone test.
