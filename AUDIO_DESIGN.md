# Togie Valley - AUDIO_DESIGN.md
Audio bible for Stages 11.5A / 11.5B / 11.5C. It replaces DESIGN.md §11 (which becomes a one-line pointer to this file). Read §1-§8 fully, then only your stage in §9. The current js/audio.js sounds poor and is rewritten; keep its public API names working (§2).

## §1 Goals
Cozy, warm, soft: a "wood, paper, cloth, soil, water" palette. Every action has a tactile sound that is accurate to what is on screen (surface, tool tier, crop class, fish rarity). Nothing harsh, shrill or fatiguing over hours of play on phone speakers and earbuds. Phone speakers have almost no bass under about 200 Hz, so put each sound's character between 200 Hz and 6 kHz and add low thumps only as a minor layer.
You cannot hear audio in your sandbox. Build strictly to the numbers in this file, and prove it with tools/sfx_report.js (§8).

## §2 Architecture
- `js/dsp.js`: pure JS, no Web Audio, runs in browser and Node. 44100 Hz, Float32Array, stereo = [L, R]. Provides: seeded rng; noise (white / pink / brown); oscillators (sine, triangle, saw, square, band-limited or filtered) with frequency curves; biquad filters (LP, HP, BP, notch, peak) with optional per-sample cutoff curve; envelopes (AD, ADSR, exponential decay, custom curve); FM operator; pitch glide; comb / allpass mini-reverb; soft clipper; mix with gains and offsets; mono-to-stereo pan; normalize-to-peak; 2 ms edge fades.
- `js/sfx_bank.js`: recipes `{ id, group, variants, make(rng, p, dsp) -> mono|stereo }`. Params (tier, rarity, surface, class, pitch) let one recipe cover a family. Variants differ by seed: pitch +-4%, filter +-10%, timing jitter, grain pattern.
- `js/audio.js` (rewrite): keeps `volume, muted, setVolume, setMuted, play(name, delay), unlock, ready, names` and every existing sound name (tap pop blip coin till water plant fertilize harvest splash cast bite door step stepWood stepStone eat sit escape junk catch levelup morning nope) so `UI.sfx()` and `ui:sfx` keep working. Adds `play(name, opts{vol,pitch,pan,delay,wet,variant})`, `playAt(name, x, z, opts)` (stereo pan from camera-relative position + distance attenuation), `setBusVolume(bus, v)`, `getBusVolume(bus)`. Buses: master, sfx, ui, ambience, music. Settings persist in localStorage key `togie-valley/audio` (device-level, not part of the game save), with try/catch.
- Baking: bake every variant into an AudioBuffer after the first user gesture, time-sliced (each slice <= 8 ms via setTimeout), priority order: ui, footsteps, tools, rest. A sound requested before it is baked is skipped or baked on demand (<= 30 ms). Memory <= 25 MB (mono for most; stereo only for sparkles/fanfares). Variants: 3-4 for frequent sounds, 1-2 for rare ones.
- Graph: voice -> gain/pan -> group bus -> master -> DynamicsCompressor (threshold -14 dB, ratio 3, attack 5 ms, release 200 ms) -> destination. Reverb send with two generated impulse responses: outdoor (0.25 s, very damped) and indoor room (0.5 s); wet level follows the current scene.
- Voices: max 24; per-sound cooldown (default 40 ms, footsteps 90 ms); the same variant never plays twice in a row; steal the oldest low-priority voice.
- Platform: set `navigator.audioSession.type = 'playback'` when available (iOS plays even in silent mode). Create/resume the context on the first pointerdown/touchend/keydown; suspend when the tab is hidden, resume on return. No per-frame allocations, no ScriptProcessor.

## §3 Mix targets (peak dBFS before bus gain)
UI -10; farm tools -8; fishing -8; footsteps -22 to -18; fanfares / level-up -6; one-shot animals -20; ambience beds -32 to -26 combined. Master ceiling -1 dBFS. Cozy filtering: low-pass most sounds at 7-9 kHz, high-pass at 80 Hz, attack >= 2 ms, no unfiltered square or saw above 1 kHz. Max length 1.2 s except fanfares (<= 2.5 s), jingles and loops.

## §4 Sound inventory (design notes, adapt as needed to hit §3)
UI and feedback (11.5A)
- tap: wooden tick = sine 1.1 kHz 25 ms + 5 ms noise click at 3 kHz. pop: sine 420 -> 880 Hz in 60 ms, sharp envelope. blip: short soft sine ping.
- panelOpen: soft whoomp = low-passed noise swell 120 ms + sine 300 -> 420 Hz. panelClose: the same with falling pitch. tab: marimba-like single note. slot select: tiny wooden tick with pitch by column.
- itemGet: cute two-note rise (bell/marimba). itemSwap: soft cloth shuffle. toast: gentle chime. confirm: two-note rise. nope: two soft low bumps (sine 200 -> 150 Hz, 60 ms, 80 ms apart), never a buzzer.
- coin: two-partial bell (1568 Hz and 2093 Hz plus a 3.1x inharmonic partial, 220 ms exponential decay) + faint metal ting. coinCount: tick whose pitch rises per step. purchase: bright ding + coin cascade. sell: wooden crate thunk + coin sparkle.
- levelUp (<= 1.8 s): C5-E5-G5-C6 arpeggio, bell timbre (FM ratio 2, decaying index) + noise shimmer sweep. goal: warm three-note fanfare + sparkle. pageTurn: HP noise swish 180 ms with crinkle grains.
Farming (11.5A)
- till: three layers: sine thump 110 -> 70 Hz (120 ms); pink noise through BP 800 Hz Q1 + LP 2.5 kHz with random 3 ms grains (90 ms crunch); 2-3 stone ticks (HP 2 kHz, -24 dB). Higher tier = heavier body, wider noise.
- water: BP noise 1.5-3.2 kHz with slow random AM (bubbling) + 4-8 droplet pings (sine 1.2-2.4 kHz, 20 ms), 0.6 s, fade out. refill: bucket glug (sine blips falling) + water trickle.
- plant: soft pat (160 Hz 60 ms + 1.2 kHz noise 80 ms) + 2 seed rattles. fertilize: granular sprinkle (many 5 ms noise grains, decaying density).
- harvest: pluck (noise burst + sine 520 -> 780 Hz in 80 ms) + leafy rustle (HP 3 kHz, 150 ms) + pop; param `class`: leaf = lower and rustlier, fruit/flower = higher and brighter, root = earthy thud + crunch.
- clear (wilted crop): dry crumble. sprinkler: tick-tick + 0.8 s hiss. eat: two crunches (BP 2.2 kHz 50 ms, 4 micro grains) + swallow (sine 200 -> 120 Hz, 100 ms); param crisp/soft. sparkle (generic): 3 soft sines in 2.1-4.2 kHz, staggered 80 ms.
House, shop, progression (11.5A)
- door: latch (two ticks) + creak (noise through resonant BP sweeping 300 -> 500 Hz, 350 ms) + soft thud; open and close variants. chest: lid creak + thump + 2 sparkle pings. shopBell: cute two-partial bell (2637 Hz and 3520 Hz, 700 ms decay).
- sleep: 4-note music-box (E5 G5 C6 G5) 2.5 s with fade. morning: two bird chirps + soft chime. daySummary: short warm jingle. cook: sizzle + pot clink; ready: little bell. notebookEntry: soft sparkle + page flick.
Fishing (11.5B)
- cast: whoosh (BP noise sweep 600 -> 2200 Hz, 250 ms) + rod whip (sine 900 -> 300 Hz, 100 ms) + faint line zing. plop: sine 380 -> 180 Hz (90 ms) + bubble sine 700 -> 1100 Hz (40 ms) + splash noise BP 1.5 kHz (120 ms). charge: rising soft tone tied to power.
- bite: two quick bloops (sine 500 -> 900 Hz glide, 70 ms each) + slight tension twang. hook: snap + zip. reelTick: 2 ms clicks through BP 2.2 kHz, played by code at 14-20 Hz scaled by reel progress; tension: soft creak that rises with tension.
- splashS/M/L by fish size; catch fanfares tier 1-5 by rarity (common: 3 rising bell notes; uncommon: +1 note; rare: 5 notes + sparkle; legendary: 2.5 s melody with pad swell); escape: slack line + soft down-whoosh; junk: friendly boing/clunk; stand/sit: cloth rustle + wood creak.
Movement (11.5B)
- Footsteps by surface, alternating feet, quiet, 3-4 variants each: grass = HP noise 1-4 kHz swish (70 ms) + soft thump 120 Hz (30 ms); path/dirt = dry crunch (BP 1.8 kHz, 3 micro grains); sand = low-passed hush; stone = tick (sine 900 Hz 10 ms) + low knock; wood pier / bridge = hollow knock (modes 180 / 260 / 410 Hz, 80 ms decay) with a rare plank creak; indoor wood = warmer knock; snow = grainy crunch (2.5-6 kHz). Volume scales with speed; run and sprint are louder and faster. Sync to the animation's foot contacts: find where char_anim.js spawns dust on footfalls and emit `player:step {surface, speed, foot}` from there instead of timing by speed.
Dialogue blips (11.5B)
- Animal-Crossing-style babble: for every visible character of the typewriter text, play a 45-70 ms two-formant blip (sine + triangle); base pitch per speaker (shopkeeper 330 Hz, fishmonger 250 Hz); pitch drawn from a pentatonic set +-3 semitones; question marks rise; silent on spaces and punctuation; at most 14 blips/s. Hook into the UI dialog typewriter.
Ambient one-shots (11.5C)
- Bird calls (4 species, FM chirps), frog ribbit, owl hoot, cricket chirp, bee buzz, wing flutter, leaf rustle gust, water lap. All baked with the same engine, played with playAt and stereo pan.

## §5 Ambience (11.5C)
Native Web Audio nodes (looped noise buffers + filters + slow LFOs, few nodes) plus sparse baked one-shots. Zone by player tile with smooth cross-fades (setTargetAtTime, 1.5 s): farm = light breeze + occasional bee; town = soft breeze + faint wind chime; forest grove = fuller birdsong + leaf rustle; lake / pier = water lap + dragonfly flutter, frogs at night (spring and summer); indoors = muffled low-pass, soft clock tick, rain on roof when raining. Time of day: dawn chorus, calm noon, summer cicada hum, evening crickets, night owl + crickets. Weather: rain in 2 layers (near patter + far hiss, roof-muffled indoors); snow = quiet, soft wind; winter = low wind. One-shots are scheduled randomly (8-25 s apart per type) with stereo pan and distance gain.

## §6 Music player (11.5C)
- Folder `music/` at the project root. Files are numbered `01.mp3`, `02.mp3`, ... (two digits, up to 99). Discovery: try `music/playlist.json` (array of file names; takes priority), else probe `music/01.mp3`, `02.mp3`, ... with HEAD requests until the first 404 (also stop at 99). If nothing is found, play no music (silence); the old procedural melody is deleted; ambience and sfx continue.
- Random only, no track picker and no skip button: bag shuffle (every track once before any repeats; never the same track twice in a row across bags). Start after the first gesture, 2-4 s after load. Each track fades in 3 s and out over its last 3 s, then a 4-10 s random pause before the next. Streaming through HTMLAudioElement(s) -> MediaElementSource -> music bus (do not decode whole files into memory; preload only the next track's metadata). On an error or a stalled track, skip to the next. Pause when the tab is hidden, resume on return.
- Ducking: music -4 dB for 2 s during fanfares, level-up and the day summary; no ducking for ordinary sfx. Indoors music is 15% quieter.
- Do not precache music in the Stage 13 service worker; optionally runtime-cache tracks as they play, with a cap of 40 MB. Write `music/README.txt` in Vietnamese: use MP3, 128 kbps (or 96), 44.1 kHz, 20-30 tracks, names 01.mp3 ... and normalized loudness; do not add copyrighted songs you do not have the right to publish.

## §7 Settings UI (11.5C)
Settings tab (panels.js): four sliders - Tổng âm lượng, Nhạc nền, Hiệu ứng, Âm thanh môi trường - plus a mute toggle; changes apply live and persist. A short sample sound plays when the sfx slider is released. All text Vietnamese.

## §8 Tools and QA (you cannot hear: measure)
- `tools/sfx_report.js` (Node, no deps; loads dsp.js + sfx_bank.js): bakes every sound and variant and prints a table with duration, peak dBFS, RMS dBFS, DC offset, start / end discontinuity (first and last 2 ms must be near zero) and spectral centroid. Exit 1 on: peak above -1 dBFS, silent sound, discontinuity, duration over the §3 limit, NaN/Infinity, or centroid above 5 kHz for non-sparkle sounds. Fix every flagged sound. `--wav <dir>` exports WAV files.
- `sfx_lab.html` in the project root (not loaded by the game): every sound with its variants as buttons, a master volume slider, a "play all" sequence, peak / RMS shown per sound, a footstep surface tester, and a fishing-fanfare tier tester. The user opens it in a browser to audition and report which sounds feel wrong.
- tools/check.js must keep passing; extend it to run the sfx report in quick mode (one variant each).

## §9 Stage scopes
- **11.5A Engine + core sounds:** dsp.js, sfx_bank.js (UI, farming, house, shop, progression groups), audio.js rewrite with all buses/baking/voices/reverb, wiring every existing event hook (player:action, scene:changed, shop:transaction, skill:levelUp, day:started, goals, notebook, cooking, UI panels, toasts, coin counters), tools/sfx_report.js, sfx_lab.html, DESIGN.md §11 pointer, CONTRACT.md. Settings keeps its single slider mapped to master.
- **11.5B Fishing + movement + dialogue:** the fishing, footstep and dialogue-blip groups; the `player:step` hook; fishing events (cast, plop, bite, hook, reel ticks, tension, catch tiers, escape, junk) and positional jumping-fish splashes from ambient.js; a mix pass over the whole bank (level balance, no clipping when sounds stack, reverb send per scene); extend lab and report.
- **11.5C Ambience + music + settings:** §5, §6, §7, music/README.txt, an empty `music/` folder with a .gitkeep, Stage 13 notes in DESIGN.md, CONTRACT.md.
