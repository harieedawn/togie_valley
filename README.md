# Togie Valley

Cozy 3D mobile farming game: farm, fish, cook and learn real-world tips. Plain JavaScript + Three.js r128 (CDN); no build step. Game text is Vietnamese.

## Run locally
```
python3 -m http.server 8080
```
Open http://localhost:8080 (the service worker works on localhost and https only).

## Deploy to GitHub Pages
1. Create a repository and push the contents of this folder to the `main` branch (index.html at the repo root).
2. Settings -> Pages -> Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/` once online; the service worker caches the game, three.js and fonts.
4. On a phone: Chrome "Add to Home screen" / "Install app"; Safari Share -> "Add to Home Screen".
5. After an update, bump `VERSION` in `sw.js` so old caches are dropped.

## Offline
Everything except music works offline after the first load. Music: put `NN.mp3` files in `music/` (see `music/README.txt`); tracks are cached as they play (max 40 MB).

## Quality
Auto fallback: the dynamic scaler lowers resolution first, then `Game.Quality` removes halftone/outline weight and grain (`Game.Quality.set(0..2)` to override; saved in `togie-valley/quality`).

## Checks
`node tools/check.js` must report 0 errors and 0 warnings.
