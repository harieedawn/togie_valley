/* Togie Valley - render.js
 * Toon ShaderMaterial factory, inverted-hull ink outline (8 fps wobble), screen-space 45deg halftone
 * (shade band + sky), paper grain + vignette overlay, time-of-day / season tints, blob shadows, camera rig.
 * Depends on: THREE r128, core.js.
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || !window.Game || !window.Game.Loop) {
    console.error('[render] THREE or core.js missing');
    return;
  }

  var Game = window.Game, Config = Game.Config, Events = Game.Events, util = Game.util, Display = Game.Display, Loop = Game.Loop;
  var cfg = Config.render, cc = Config.camera;

  var Render = Game.Render = {};
  var renderer = null, canvas = null;

  var scene = new THREE.Scene();
  var skyScene = new THREE.Scene();
  var overlayScene = new THREE.Scene();
  var screenCam = new THREE.Camera();
  var camera = new THREE.PerspectiveCamera(34, 1, cc.near, cc.far);

  Render.scene = scene;
  Render.skyScene = skyScene;
  Render.overlayScene = overlayScene;
  Render.camera = camera;
  Render.time = 0; // seconds of rendered (unpaused) time

  /* ---------------------------------------------------------------- uniforms */
  // Shared uniform objects: every material references these same {value} objects.
  var U = Render.uniforms = {
    uLightDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },   // direction TOWARD the light (world)
    uLightColor: { value: new THREE.Color(0.42, 0.38, 0.26) },
    uAmbient: { value: new THREE.Color(0.62, 0.66, 0.76) },
    uFogColor: { value: new THREE.Color(0xd8f0f8) },
    uFogRange: { value: new THREE.Vector2(cfg.fogNear, cfg.fogFar) },
    uBands: { value: new THREE.Vector2(cfg.bands[0], cfg.bands[1]) },
    uHalftone: { value: new THREE.Vector2(cfg.halftoneCell * 2, cfg.halftoneStrength) }, // x = cell (device px), y = strength
    uSeasonTint: { value: new THREE.Color(1, 1, 1) },
    uSeasonHue: { value: new THREE.Color(1, 1, 1) },
    uSeasonAmt: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },                      // drawing buffer px
    uTick: { value: 0 },                                                  // outline wobble tick (8 fps)
    uOutline: { value: new THREE.Vector2(cfg.outlineWidth * 2, cfg.outlineWobble * 2) }, // device px: width, wobble
    uInkColor: { value: new THREE.Color(cfg.inkColor) },
    uSkyTop: { value: new THREE.Color(0x58aef0) },
    uSkyHorizon: { value: new THREE.Color(0xd8f0f8) },
    uShadowColor: { value: new THREE.Color(cfg.shadowColor) },
    uOverlay: { value: new THREE.Vector3(cfg.grain, 2, cfg.vignette) },   // grain alpha, grain cell px, vignette alpha
    uVigColor: { value: new THREE.Color(cfg.vignetteColor) },
    // Stage 10.7 see-through fade: camera + hero head (world), x = cylinder radius, y = smoothed strength 0..1
    uFadeCam: { value: new THREE.Vector3() },
    uFadeHero: { value: new THREE.Vector3(0, 1, 0) },
    uFadeP: { value: new THREE.Vector2(0.9, 0) }
  };

  /* ----------------------------------------------------------------- shaders */
  function src(lines) { return lines.join('\n'); }

  var HASH12 = src([
    'float hash12(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}'
  ]);

  // Stage 10.7: see-through fade chunks, shared by the toon/outline shaders and by custom instanced shaders (Decor).
  // Fragments nearer to the camera than the hero and inside a soft cylinder around the camera->hero ray get a
  // screen-space halftone discard (about 46 % holes at full strength, soft edge). Per-material uFadeM = (on, minY).
  var FADE_VS_PARS = 'varying vec3 vFadeW;';
  var FADE_FS = src([
    'uniform vec3 uFadeCam;',
    'uniform vec3 uFadeHero;',
    'uniform vec2 uFadeP;',
    'uniform vec2 uFadeM;',
    'varying vec3 vFadeW;',
    'void fadeDiscard() {',
    '  if (uFadeM.x < 0.5 || uFadeP.y < 0.01) return;',
    '  vec3 ab = uFadeHero - uFadeCam;',
    '  float L = length(ab);',
    '  vec3 dir = ab / max(L, 0.001);',
    '  vec3 rel = vFadeW - uFadeCam;',
    '  float t = dot(rel, dir);',
    '  float nearK = (1.0 - smoothstep(L - 1.6, L - 0.7, t)) * step(0.0, t);',
    '  if (nearK <= 0.0) return;',
    '  float d = length(rel - dir * t);',
    '  float inK = 1.0 - smoothstep(uFadeP.x * 0.5, uFadeP.x, d);',
    '  float hK = smoothstep(uFadeM.y - 0.15, uFadeM.y + 0.15, vFadeW.y);',
    '  float a = nearK * inK * hK * uFadeP.y;',
    '  if (a <= 0.01) return;',
    '  vec2 cuv = fract(mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678) * (gl_FragCoord.xy / 7.0)) - 0.5;',
    '  if (length(cuv) < sqrt(a * 0.46 / 3.14159265)) discard;',
    '}'
  ]);
  Render.fade = {
    target: null, headY: 0.95, radius: 0.9, enabled: true,
    vsPars: FADE_VS_PARS, fs: FADE_FS,
    uniforms: function (on, minY) { return { uFadeCam: U.uFadeCam, uFadeHero: U.uFadeHero, uFadeP: U.uFadeP, uFadeM: { value: new THREE.Vector2(on ? 1 : 0, minY === undefined ? 0.8 : minY) } }; }
  };

  var TOON_VS = src([
    'varying vec3 vNormalW;',
    'varying vec3 vColorV;',
    'varying float vFogDepth;',
    FADE_VS_PARS,
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vFadeW = wp.xyz;',
    '  vNormalW = (modelMatrix * vec4(normal, 0.0)).xyz;',
    '#ifdef USE_COLOR',
    '  vColorV = color;',
    '#else',
    '  vColorV = vec3(1.0);',
    '#endif',
    '  vec4 mv = viewMatrix * wp;',
    '  vFogDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ]);

  var TOON_FS = src([
    'uniform vec3 uLightDir;',
    'uniform vec3 uLightColor;',
    'uniform vec3 uAmbient;',
    'uniform vec3 uFogColor;',
    'uniform vec2 uFogRange;',
    'uniform vec2 uBands;',
    'uniform vec2 uHalftone;',
    'uniform vec3 uSeasonTint;',
    'uniform vec3 uSeasonHue;',
    'uniform float uSeasonAmt;',
    'uniform vec3 uColor;',
    'uniform float uSeasonal;',
    'uniform float uDots;',
    'varying vec3 vNormalW;',
    'varying vec3 vColorV;',
    'varying float vFogDepth;',
    '#define BAND_SOFT 0.02',
    'const mat2 ROT45 = mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678);',
    'const vec3 HT_TINT = vec3(0.62, 0.58, 0.80);',
    FADE_FS,
    'void main() {',
    '  fadeDiscard();',
    '  vec3 n = normalize(vNormalW);',
    '  float ndl = dot(n, uLightDir);',
    '  float b0 = smoothstep(uBands.x - BAND_SOFT, uBands.x + BAND_SOFT, ndl);',
    '  float b1 = smoothstep(uBands.y - BAND_SOFT, uBands.y + BAND_SOFT, ndl);',
    '  vec3 base = vColorV * uColor;',
    '  float lum = dot(base, vec3(0.299, 0.587, 0.114));',
    '  vec3 seasonal = mix(base * uSeasonTint, vec3(lum) * uSeasonHue, uSeasonAmt);',
    '  base = mix(base, seasonal, uSeasonal);',
    '  vec3 light = uAmbient + uLightColor * (0.5 * (b0 + b1));',
    '  vec3 col = base * light;',
    // screen-space halftone, rotated 45 degrees, only inside the shade band
    '  float cell = max(uHalftone.x, 2.0);',
    '  vec2 cuv = fract(ROT45 * (gl_FragCoord.xy / cell)) - 0.5;',
    '  float depth = clamp((uBands.x - ndl) / (uBands.x + 1.0), 0.0, 1.0);',
    '  float cover = mix(0.2, 0.8, depth);',
    '  float radius = 0.7071 * sqrt(cover);',
    '  float aa = 1.0 / cell;',
    '  float dotMask = 1.0 - smoothstep(radius - aa, radius + aa, length(cuv));',
    '  col = mix(col, col * HT_TINT, dotMask * (1.0 - b0) * uHalftone.y * uDots);',
    '  float fogF = smoothstep(uFogRange.x, uFogRange.y, vFogDepth);',
    '  col = mix(col, uFogColor, fogF);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ]);

  var OUTLINE_VS = src([
    'attribute vec3 smoothNormal;',
    'uniform vec2 uResolution;',
    'uniform vec2 uOutline;',
    'uniform float uTick;',
    'uniform float uWidthMul;',
    'varying float vFogDepth;',
    FADE_VS_PARS,
    'float hash13(vec3 p3) {',
    '  p3 = fract(p3 * 0.1031);',
    '  p3 += dot(p3, p3.zyx + 31.32);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vFadeW = wp.xyz;',
    '  vec4 clip = projectionMatrix * (viewMatrix * wp);',
    '  vec3 nw = (modelMatrix * vec4(smoothNormal, 0.0)).xyz;',
    '  vec3 nv = (viewMatrix * vec4(nw, 0.0)).xyz;',
    '  vec2 d = (projectionMatrix * vec4(nv, 0.0)).xy * uResolution;',
    '  float len = length(d);',
    '  d = len > 0.00001 ? d / len : vec2(0.0);',
    '  float w = uOutline.x * uWidthMul * (0.75 + 0.5 * hash13(position * 7.1 + vec3(uTick * 0.53)));',
    '  vec2 j = vec2(hash13(position * 13.7 + vec3(uTick * 0.37)), hash13(position.zxy * 9.3 + vec3(uTick * 0.61))) - 0.5;',
    '  vec2 px = d * w + j * uOutline.y * 2.0;',
    '  clip.xy += px * (2.0 / uResolution) * clip.w;',
    '  vFogDepth = clip.w;',
    '  gl_Position = clip;',
    '}'
  ]);

  var OUTLINE_FS = src([
    'uniform vec3 uInkColor;',
    'uniform vec3 uFogColor;',
    'uniform vec2 uFogRange;',
    'varying float vFogDepth;',
    FADE_FS,
    'void main() {',
    '  fadeDiscard();',
    '  float f = smoothstep(uFogRange.x, uFogRange.y, vFogDepth);',
    '  gl_FragColor = vec4(mix(uInkColor, uFogColor, f * 0.85), 1.0);',
    '}'
  ]);

  var SCREEN_VS = src([
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ]);

  var SKY_FS = src([
    'uniform vec3 uSkyTop;',
    'uniform vec3 uSkyHorizon;',
    'uniform vec2 uHalftone;',
    'varying vec2 vUv;',
    'const mat2 ROT45 = mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678);',
    'void main() {',
    '  float t = clamp(vUv.y, 0.0, 1.0);',
    '  vec3 base = mix(uSkyHorizon, mix(uSkyHorizon, uSkyTop, 0.35), t);',
    '  float cell = max(uHalftone.x * 1.8, 4.0);',
    '  vec2 cuv = fract(ROT45 * (gl_FragCoord.xy / cell)) - 0.5;',
    '  float cover = smoothstep(0.2, 0.95, t);',
    '  float radius = 0.82 * sqrt(cover);',
    '  float aa = 1.0 / cell;',
    '  float dotMask = (1.0 - smoothstep(radius - aa, radius + aa, length(cuv))) * step(0.02, cover);',
    '  gl_FragColor = vec4(mix(base, uSkyTop, dotMask), 1.0);',
    '}'
  ]);

  var OVERLAY_FS = src([
    'uniform vec3 uOverlay;',
    'uniform vec3 uVigColor;',
    'varying vec2 vUv;',
    HASH12,
    'void main() {',
    '  vec2 cell = floor(gl_FragCoord.xy / max(uOverlay.y, 1.0));',
    '  float n = mix(hash12(cell), hash12(floor(cell * 0.37) + 17.0), 0.35);',
    '  float aG = abs(n - 0.5) * 2.0 * uOverlay.x;',
    '  vec3 cG = mix(vec3(0.15, 0.10, 0.20), vec3(1.0, 0.97, 0.90), step(0.5, n));',
    '  float v = length((vUv - 0.5) * 2.0);',
    '  float aV = smoothstep(0.55, 1.45, v) * uOverlay.z;',
    '  float a = aG + aV * (1.0 - aG);',
    '  vec3 rgb = (cG * aG + uVigColor * aV * (1.0 - aG)) / max(a, 0.0001);',
    '  gl_FragColor = vec4(rgb, a);',
    '}'
  ]);

  var SHADOW_VS = src([
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ]);

  var SHADOW_FS = src([
    'uniform vec3 uColor;',
    'uniform float uOpacity;',
    'varying vec2 vUv;',
    'void main() {',
    '  float d = length(vUv - 0.5) * 2.0;',
    '  float a = 1.0 - smoothstep(0.6, 1.0, d);',
    '  gl_FragColor = vec4(uColor, a * uOpacity);',
    '}'
  ]);

  /* --------------------------------------------------------------- materials */
  // opts: color (multiplier, default white), seasonal 0..1 (how much season tint applies), halftone (false = no dots), side
  Render.toonMaterial = function (opts) {
    opts = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uLightDir: U.uLightDir, uLightColor: U.uLightColor, uAmbient: U.uAmbient,
        uFogColor: U.uFogColor, uFogRange: U.uFogRange, uBands: U.uBands, uHalftone: U.uHalftone,
        uSeasonTint: U.uSeasonTint, uSeasonHue: U.uSeasonHue, uSeasonAmt: U.uSeasonAmt,
        uColor: { value: new THREE.Color(opts.color !== undefined ? opts.color : 0xffffff) },
        uSeasonal: { value: opts.seasonal || 0 },
        uDots: { value: opts.halftone === false ? 0 : 1 },
        uFadeCam: U.uFadeCam, uFadeHero: U.uFadeHero, uFadeP: U.uFadeP,
        uFadeM: { value: new THREE.Vector2(opts.fade ? 1 : 0, opts.fadeMinY !== undefined ? opts.fadeMinY : 0.8) }   // see-through: opts.fade, fragments below fadeMinY stay solid
      },
      vertexShader: TOON_VS,
      fragmentShader: TOON_FS,
      vertexColors: true,
      side: opts.side !== undefined ? opts.side : THREE.FrontSide
    });
  };

  Render.outlineMaterial = function (widthMul, fade, fadeMinY) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: U.uResolution, uOutline: U.uOutline, uTick: U.uTick, uInkColor: U.uInkColor,
        uFogColor: U.uFogColor, uFogRange: U.uFogRange, uWidthMul: { value: widthMul || 1 },
        uFadeCam: U.uFadeCam, uFadeHero: U.uFadeHero, uFadeP: U.uFadeP,
        uFadeM: { value: new THREE.Vector2(fade ? 1 : 0, fadeMinY !== undefined ? fadeMinY : 0.8) }
      },
      vertexShader: OUTLINE_VS,
      fragmentShader: OUTLINE_FS,
      side: THREE.BackSide
    });
  };

  var outlineMats = {};
  function sharedOutline(thin, fade) {
    var k = (thin ? 'thin' : 'normal') + (fade ? '_fade' : '');
    return outlineMats[k] || (outlineMats[k] = Render.outlineMaterial(thin ? 0.6 : 1, fade));
  }
  /** Same material with the see-through fade switched off (shares every other uniform). Cached on the source material. */
  Render.noFadeMaterial = function (m) {
    if (!m || !m.uniforms || !m.uniforms.uFadeM || m.uniforms.uFadeM.value.x < 0.5) return m;
    if (m.userData.noFadeTwin) return m.userData.noFadeTwin;
    var u = {}, k;
    for (k in m.uniforms) u[k] = m.uniforms[k];
    u.uFadeM = { value: new THREE.Vector2(0, m.uniforms.uFadeM.value.y) };
    var t = new THREE.ShaderMaterial({ uniforms: u, vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, vertexColors: m.vertexColors, side: m.side, defines: m.defines });
    t.userData.noFadeTwin = t;
    return (m.userData.noFadeTwin = t);
  };
  /** Applies mesh.userData.noFade (opt-out) to every mesh + its ink outline in the scene: swaps in the no-fade twin material. */
  Render.refreshFade = function () {
    scene.traverse(function (o) {
      if (!o.isMesh) return;
      var off = o.userData.noFade || (o.name === 'outline' && o.parent && o.parent.userData.noFade);
      if (off && o.material && o.material.uniforms && o.material.uniforms.uFadeM && o.material.uniforms.uFadeM.value.x > 0.5) o.material = Render.noFadeMaterial(o.material);
    });
  };

  /* ---------------------------------------------------------------- geometry */
  var _c = new THREE.Color();
  function resolveColor(c, x, y, z) {
    if (typeof c === 'function') c = c(x, y, z);
    if (c && c.isColor) return c;
    return _c.set(c);
  }

  // Adds/replaces the vertex color attribute. color: hex | THREE.Color | function(x,y,z)->hex|Color
  Render.colorize = function (geo, color) {
    var p = geo.attributes.position;
    var arr = new Float32Array(p.count * 3);
    for (var i = 0; i < p.count; i++) {
      var c = resolveColor(color, p.getX(i), p.getY(i), p.getZ(i));
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  // Adds attribute 'smoothNormal': angle-weighted normals welded by position, so hulls of hard-edged meshes have no cracks.
  Render.addSmoothNormals = function (geo) {
    var pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index;
    var count = pos.count, tris = (idx ? idx.count : count) / 3;
    var keys = new Array(count), sums = Object.create(null), i, k;
    for (i = 0; i < count; i++) {
      k = Math.round(pos.getX(i) * 1000) + '_' + Math.round(pos.getY(i) * 1000) + '_' + Math.round(pos.getZ(i) * 1000);
      keys[i] = k;
      if (!sums[k]) sums[k] = [0, 0, 0];
    }
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    var e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
    var v = [a, b, c], ids = [0, 0, 0];
    for (var t = 0; t < tris; t++) {
      for (i = 0; i < 3; i++) {
        ids[i] = idx ? idx.getX(t * 3 + i) : t * 3 + i;
        v[i].fromBufferAttribute(pos, ids[i]);
      }
      e1.subVectors(b, a); e2.subVectors(c, a);
      fn.crossVectors(e1, e2);
      if (fn.lengthSq() < 1e-14) continue;
      fn.normalize();
      for (i = 0; i < 3; i++) {
        var p0 = v[i], p1 = v[(i + 1) % 3], p2 = v[(i + 2) % 3];
        e1.subVectors(p1, p0).normalize();
        e2.subVectors(p2, p0).normalize();
        var ang = Math.acos(util.clamp(e1.dot(e2), -1, 1));
        var s = sums[keys[ids[i]]];
        s[0] += fn.x * ang; s[1] += fn.y * ang; s[2] += fn.z * ang;
      }
    }
    var out = new Float32Array(count * 3);
    for (i = 0; i < count; i++) {
      var q = sums[keys[i]];
      var l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]);
      if (l > 1e-6) {
        out[i * 3] = q[0] / l; out[i * 3 + 1] = q[1] / l; out[i * 3 + 2] = q[2] / l;
      } else if (nor) {
        out[i * 3] = nor.getX(i); out[i * 3 + 1] = nor.getY(i); out[i * 3 + 2] = nor.getZ(i);
      } else {
        out[i * 3 + 1] = 1;
      }
    }
    geo.setAttribute('smoothNormal', new THREE.BufferAttribute(out, 3));
    return geo;
  };

  // Adds an inverted-hull outline as a child of mesh (shares geometry). thin = 60% width.
  Render.addOutline = function (mesh, thin) {
    if (!mesh.geometry.attributes.smoothNormal) Render.addSmoothNormals(mesh.geometry);
    var mu = mesh.material && mesh.material.uniforms, fd = !!(mu && mu.uFadeM && mu.uFadeM.value.x > 0.5);   // outline fades with its fill
    var hull = new THREE.Mesh(mesh.geometry, sharedOutline(!!thin, fd));
    hull.name = 'outline';
    hull.raycast = function () {};
    hull.matrixAutoUpdate = false;
    hull.updateMatrix();
    mesh.add(hull);
    mesh.userData.outline = hull;
    return hull;
  };

  /* ------------------------------------------------------------ blob shadows */
  var shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  var shadows = [];
  var _v = new THREE.Vector3();

  // target: Object3D to follow (x/z, and height above groundY). radius in world units (radiusZ optional, elliptical).
  Render.addBlobShadow = function (target, radius, opacity, radiusZ) {
    var mat = new THREE.ShaderMaterial({
      uniforms: { uColor: U.uShadowColor, uOpacity: { value: 0 } },
      vertexShader: SHADOW_VS,
      fragmentShader: SHADOW_FS,
      transparent: true,
      depthWrite: false
    });
    var mesh = new THREE.Mesh(shadowGeo, mat);
    mesh.name = 'blobShadow';
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    mesh.raycast = function () {};
    scene.add(mesh);
    var s = {
      target: target, mesh: mesh, rx: radius, rz: radiusZ || radius,
      opacity: opacity !== undefined ? opacity : cfg.shadowOpacity, groundY: 0,
      remove: function () {
        var i = shadows.indexOf(s);
        if (i >= 0) shadows.splice(i, 1);
        scene.remove(mesh);
        mat.dispose();
      }
    };
    shadows.push(s);
    return s;
  };

  function updateShadows() {
    for (var i = 0; i < shadows.length; i++) {
      var s = shadows[i];
      s.target.getWorldPosition(_v);
      var h = Math.max(0, _v.y - s.groundY);
      var f = 1 / (1 + h * 0.35);
      s.mesh.position.set(_v.x, s.groundY + 0.03, _v.z);
      s.mesh.scale.set(s.rx * 2 * f, 1, s.rz * 2 * f);
      s.mesh.material.uniforms.uOpacity.value = s.opacity / (1 + h * 0.6);
    }
  }

  /* -------------------------------------------------------------- camera rig */
  function presetOf(name) {
    var p = cc.presets[name] || cc.presets.outdoor;
    return { distance: p.distance, pitch: p.pitch * Math.PI / 180, fov: p.fov, lookHeight: p.lookHeight };
  }

  var Rig = Render.rig = {
    focus: new THREE.Vector3(),     // smoothed focus point (ground)
    target: new THREE.Vector3(),    // desired focus point
    yaw: 0,                         // current yaw (rad, unbounded)
    yawTarget: 0,
    zoom: 1,
    zoomTarget: 1,
    presetName: 'outdoor',
    params: presetOf('outdoor'),    // smoothed distance / pitch / fov / lookHeight
    goal: presetOf('outdoor'),
    _follow: null,
    frame: null                     // optional {cx,cz,w,d}: distance auto-fits this ground rect (indoor rooms)
  };
  Rig.setFrame = function (f) { Rig.frame = f || null; };

  Rig._pull = function () {
    if (!Rig._follow) return;
    Rig._follow.getWorldPosition(_v);
    Rig.target.copy(_v);
  };

  Rig.follow = function (obj3d, snap) {
    Rig._follow = obj3d || null;
    if (obj3d && snap) { Rig._pull(); Rig.focus.copy(Rig.target); }
  };
  Rig.unfollow = function () { Rig._follow = null; };
  Rig.setTarget = function (x, y, z, snap) {
    Rig._follow = null;
    Rig.target.set(x, y || 0, z);
    if (snap) Rig.focus.copy(Rig.target);
  };
  Rig.setYaw = function (r, snap) { Rig.yawTarget = r; if (snap) Rig.yaw = r; };
  Rig.rotateBy = function (d) { Rig.yawTarget += d; };
  // Rotate to the next/previous 90 degree step (dir = +1 / -1).
  Rig.rotateStep = function (dir) {
    var q = Math.PI / 2;
    Rig.yawTarget = (Math.round(Rig.yawTarget / q) + (dir || 1)) * q;
  };
  Rig.getYaw = function () { return Rig.yaw; };
  Rig.getYawTarget = function () { return Rig.yawTarget; };
  // Ground-projected screen-up direction (camera forward) and screen-right, from current yaw.
  Rig.getForward = function (out) { out = out || new THREE.Vector3(); return out.set(-Math.sin(Rig.yaw), 0, -Math.cos(Rig.yaw)); };
  Rig.getRight = function (out) { out = out || new THREE.Vector3(); return out.set(Math.cos(Rig.yaw), 0, -Math.sin(Rig.yaw)); };
  Rig.setPreset = function (name, snap) {
    Rig.presetName = cc.presets[name] ? name : 'outdoor';
    Rig.goal = presetOf(Rig.presetName);
    if (snap) { Rig.params = presetOf(Rig.presetName); }
  };
  Rig.setZoom = function (z, snap) {
    Rig.zoomTarget = util.clamp(z, cc.zoomMin, cc.zoomMax);
    if (snap) Rig.zoom = Rig.zoomTarget;
  };
  Rig.snap = function () {
    Rig._pull();
    Rig.focus.copy(Rig.target);
    Rig.yaw = Rig.yawTarget;
    Rig.zoom = Rig.zoomTarget;
    Rig.params = { distance: Rig.goal.distance, pitch: Rig.goal.pitch, fov: Rig.goal.fov, lookHeight: Rig.goal.lookHeight };
    Rig._place();
  };

  Rig._place = function () {
    var p = Rig.params;
    var aspect = camera.aspect || 1;
    var boost = aspect < 1 ? Math.pow(1 / aspect, cc.portraitBoost) : 1;
    var d = p.distance * Rig.zoom * boost;
    var cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    if (Rig.frame) {                 // fit the whole room (worst case over yaw) for the current aspect and fov
      var tv = Math.tan(p.fov * Math.PI / 360), th = tv * aspect, ext = Math.max(Rig.frame.w, Rig.frame.d);
      var needX = (ext + 1.2) / 2 / th, needY = (ext * sp + 2.2 * cp + 1.2) / 2 / tv;
      d = Math.max(needX, needY) * 1.08 * Rig.zoom;
    }
    if (Math.abs(camera.fov - p.fov) > 0.01) { camera.fov = p.fov; camera.updateProjectionMatrix(); }
    camera.position.set(
      Rig.focus.x + Math.sin(Rig.yaw) * cp * d,
      Rig.focus.y + p.lookHeight + sp * d,
      Rig.focus.z + Math.cos(Rig.yaw) * cp * d
    );
    var nj = Rig.nudge ? Rig.nudge.y : 0;   // Stage 15D: tiny camera thump on heavy hits
    camera.position.y += nj;
    camera.lookAt(Rig.focus.x, Rig.focus.y + p.lookHeight + nj, Rig.focus.z);
    camera.updateMatrixWorld();
  };

  Rig.update = function (dt) {
    Rig._pull();
    if (Rig.bounds) {   // Stage 10.5: outdoor camera target stays inside the map + margin (set by Game.Scenery)
      var bd = Rig.bounds;
      Rig.target.x = Math.max(bd.x0, Math.min(bd.x1, Rig.target.x));
      Rig.target.z = Math.max(bd.z0, Math.min(bd.z1, Rig.target.z));
    }
    var kf = 1 - Math.exp(-cc.followLambda * dt);
    Rig.focus.x += (Rig.target.x - Rig.focus.x) * kf;
    Rig.focus.y += (Rig.target.y - Rig.focus.y) * kf;
    Rig.focus.z += (Rig.target.z - Rig.focus.z) * kf;
    Rig.yaw += (Rig.yawTarget - Rig.yaw) * (1 - Math.exp(-cc.yawLambda * dt));
    if (Math.abs(Rig.yawTarget - Rig.yaw) < 1e-4) Rig.yaw = Rig.yawTarget;
    var kp = 1 - Math.exp(-cc.presetLambda * dt);
    var p = Rig.params, g = Rig.goal;
    p.distance += (g.distance - p.distance) * kp;
    p.pitch += (g.pitch - p.pitch) * kp;
    p.fov += (g.fov - p.fov) * kp;
    p.lookHeight += (g.lookHeight - p.lookHeight) * kp;
    Rig.zoom += (Rig.zoomTarget - Rig.zoom) * (1 - Math.exp(-cc.zoomLambda * dt));
    Rig._place();
  };

  /* ------------------------------------------------- screen <-> world helpers */
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var _p = new THREE.Vector3();

  // Client (CSS px) coords -> point on plane y = groundY. Returns Vector3 (out or new) or null if the ray misses.
  Render.screenToGround = function (clientX, clientY, groundY, out) {
    var rect = (canvas || document.body).getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    var ray = raycaster.ray;
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    var t = ((groundY || 0) - ray.origin.y) / ray.direction.y;
    if (t <= 0) return null;
    out = out || new THREE.Vector3();
    return out.copy(ray.direction).multiplyScalar(t).add(ray.origin);
  };

  // Same, but returns {tx, tz, x, z, cx, cz}: tile indices, hit point, tile center. Null on miss.
  Render.screenToTile = function (clientX, clientY, groundY) {
    var p = Render.screenToGround(clientX, clientY, groundY || 0, _p);
    if (!p) return null;
    var tx = util.tileOf(p.x), tz = util.tileOf(p.z);
    return { tx: tx, tz: tz, x: p.x, z: p.z, cx: util.tileCenter(tx), cz: util.tileCenter(tz) };
  };

  // World Vector3 -> {x, y, visible} in client (CSS px) coordinates.
  Render.worldToScreen = function (v3, out) {
    var rect = (canvas || document.body).getBoundingClientRect();
    camera.updateMatrixWorld();
    _p.copy(v3).project(camera);
    out = out || {};
    out.x = rect.left + (_p.x * 0.5 + 0.5) * rect.width;
    out.y = rect.top + (-_p.y * 0.5 + 0.5) * rect.height;
    out.visible = _p.z > -1 && _p.z < 1;
    return out;
  };

  /* ------------------------------------------------------------ time of day */
  function K(h, top, hor, amb, lit) {
    return {
      h: h, top: new THREE.Color(top), hor: new THREE.Color(hor),
      amb: new THREE.Color(amb[0], amb[1], amb[2]), lit: new THREE.Color(lit[0], lit[1], lit[2])
    };
  }
  var KEYS = [
    K(0, 0x0b1030, 0x1d2750, [0.20, 0.24, 0.42], [0.10, 0.14, 0.28]),
    K(5, 0x1b2252, 0x5a4a78, [0.26, 0.28, 0.46], [0.16, 0.16, 0.30]),
    K(6.5, 0x5b7fc0, 0xf2a77a, [0.50, 0.50, 0.64], [0.50, 0.36, 0.24]),
    K(9, 0x6fb4ee, 0xcfe8f2, [0.60, 0.64, 0.74], [0.44, 0.38, 0.26]),
    K(12, 0x58aef0, 0xd8f0f8, [0.62, 0.66, 0.76], [0.42, 0.38, 0.26]),
    K(16, 0x62a8e6, 0xf4e6c4, [0.60, 0.62, 0.72], [0.44, 0.36, 0.22]),
    K(18.5, 0x6a6aae, 0xf08a64, [0.52, 0.46, 0.58], [0.52, 0.34, 0.20]),
    K(20, 0x242a5e, 0x6a4f86, [0.28, 0.30, 0.50], [0.16, 0.16, 0.32]),
    K(24, 0x0b1030, 0x1d2750, [0.20, 0.24, 0.42], [0.10, 0.14, 0.28])
  ];
  var state = { hour: 9, season: 'spring' };

  // t = hour of day, 0..24 (wraps). Updates sky, fog, ambient, light color and light direction.
  Render.setTimeOfDay = function (t) {
    var h = ((t % 24) + 24) % 24;
    state.hour = h;
    var i = 0;
    while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
    var a = KEYS[i], b = KEYS[i + 1];
    var f = util.smoothstep(a.h, b.h, h);
    U.uSkyTop.value.lerpColors(a.top, b.top, f);
    U.uSkyHorizon.value.lerpColors(a.hor, b.hor, f);
    U.uFogColor.value.copy(U.uSkyHorizon.value);
    U.uAmbient.value.lerpColors(a.amb, b.amb, f);
    U.uLightColor.value.lerpColors(a.lit, b.lit, f);
    // sun arc 06..18, moon arc 18..06 (never below the horizon for shading purposes)
    var hh = (h - 6 + 24) % 24;
    var ang = (hh % 12) / 12 * Math.PI;
    // sun/moon swap at 06 and 18 would flip x from +0.9 to -0.9: fade x through 0 around the swap so the direction is continuous
    var dSwap = Math.min(hh % 12, 12 - (hh % 12));
    var xw = util.smoothstep(0, 1.5, dSwap);
    U.uLightDir.value.set(-Math.cos(ang) * 0.9 * xw, Math.sin(ang) * 0.8 + 0.35, 0.45).normalize();
  };
  Render.getTimeOfDay = function () { return state.hour; };

  /* ------------------------------------------------------------------ season */
  var SEASONS = {
    spring: { tint: [1.00, 1.04, 0.98], hue: [1.00, 1.00, 1.00], amt: 0.0 },
    summer: { tint: [1.05, 1.03, 0.92], hue: [1.00, 1.00, 1.00], amt: 0.0 },
    autumn: { tint: [1.05, 0.97, 0.88], hue: [1.55, 0.95, 0.42], amt: 0.6 },
    winter: { tint: [0.96, 0.99, 1.06], hue: [1.18, 1.24, 1.34], amt: 0.55 }
  };
  var SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
  var seasonGoal = {
    tint: new THREE.Color(1, 1, 1), hue: new THREE.Color(1, 1, 1), amt: 0
  };

  // s = 'spring'|'summer'|'autumn'|'winter' or index 0..3. instant=false -> smooth transition (in Render.update).
  Render.setSeason = function (s, instant) {
    var name = typeof s === 'number' ? SEASON_ORDER[((s % 4) + 4) % 4] : s;
    var def = SEASONS[name];
    if (!def) return;
    state.season = name;
    seasonGoal.tint.setRGB(def.tint[0], def.tint[1], def.tint[2]);
    seasonGoal.hue.setRGB(def.hue[0], def.hue[1], def.hue[2]);
    seasonGoal.amt = def.amt;
    if (instant) {
      U.uSeasonTint.value.copy(seasonGoal.tint);
      U.uSeasonHue.value.copy(seasonGoal.hue);
      U.uSeasonAmt.value = seasonGoal.amt;
    }
  };
  Render.getSeason = function () { return state.season; };
  Render.seasons = SEASON_ORDER;

  /* ---------------------------------------------------------- init / resize */
  function applyResolution() {
    var pr = Display.pixelRatio;
    U.uResolution.value.set(Math.floor(Display.width * pr), Math.floor(Display.height * pr));
    U.uHalftone.value.x = cfg.halftoneCell * pr;
    U.uHalftone.value.y = cfg.halftoneStrength;
    U.uOutline.value.set(cfg.outlineWidth * pr, cfg.outlineWobble * pr);
    U.uOverlay.value.set(cfg.grain, Math.max(1, cfg.grainSize * pr), cfg.vignette);
  }

  function onResize(info) {
    if (!renderer) return;
    renderer.setPixelRatio(info.pixelRatio);
    renderer.setSize(info.width, info.height, false);
    camera.aspect = info.width / info.height;
    camera.updateProjectionMatrix();
    applyResolution();
  }

  Render.init = function (cv) {
    canvas = cv || document.getElementById('game');
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: cfg.antialias, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance'
    });
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.setClearColor(0x000000, 1);
    Render.renderer = renderer;

    // sky (full-screen quad, drawn first, no depth)
    var skyMat = new THREE.ShaderMaterial({
      uniforms: { uSkyTop: U.uSkyTop, uSkyHorizon: U.uSkyHorizon, uHalftone: U.uHalftone },
      vertexShader: SCREEN_VS, fragmentShader: SKY_FS, depthTest: false, depthWrite: false
    });
    var sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
    sky.frustumCulled = false;
    skyScene.add(sky);

    // paper grain + vignette (full-screen alpha overlay, drawn last)
    var ovMat = new THREE.ShaderMaterial({
      uniforms: { uOverlay: U.uOverlay, uVigColor: U.uVigColor },
      vertexShader: SCREEN_VS, fragmentShader: OVERLAY_FS, transparent: true, depthTest: false, depthWrite: false
    });
    var ov = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ovMat);
    ov.frustumCulled = false;
    overlayScene.add(ov);

    Events.on('display:resize', onResize);
    onResize(Display.info('init'));
    Rig.snap();

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      Loop.pause('contextlost');
      Events.emit('render:contextlost', {});
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      Loop.resume('contextlost');
      Events.emit('render:contextrestored', {});
    }, false);

    Loop.onFrame(function (dt) { Render.update(dt); }, 900);
    Loop.onFrame(function () { Render.draw(); }, 1000);
    return Render;
  };

  // Per-frame: wobble tick, season blend, camera rig, blob shadows.
  Render.update = function (dt) {
    Render.time += dt;
    U.uTick.value = Math.floor(Render.time * cfg.wobbleFps) % 997;
    var k = 1 - Math.exp(-2 * dt);
    U.uSeasonTint.value.lerp(seasonGoal.tint, k);
    U.uSeasonHue.value.lerp(seasonGoal.hue, k);
    U.uSeasonAmt.value += (seasonGoal.amt - U.uSeasonAmt.value) * k;
    Rig.update(dt);
    updateShadows();
    // see-through fade: camera + hero head, smoothed global strength
    var F = Render.fade, ft = F.target, fs = U.uFadeP.value;
    U.uFadeCam.value.copy(camera.position);
    if (ft) U.uFadeHero.value.set(ft.position.x, ft.position.y + F.headY, ft.position.z);
    fs.x = F.radius;
    fs.y += ((ft && F.enabled ? 1 : 0) - fs.y) * (1 - Math.exp(-8 * dt));
    if ((fadeScanT -= dt) <= 0) { fadeScanT = 2; Render.refreshFade(); }
  };
  var fadeScanT = 0;

  // sky -> world -> grain/vignette overlay
  // Stage 14B: Render.pass = {sky, overlay, gate(), after(now)}: perf.js drops the full-screen passes on low tiers, caps the frame rate and times drawn frames.
  Render.pass = { sky: true, overlay: true, gate: null, after: null };
  Render.draw = function () {
    if (!renderer) return;
    var ps = Render.pass;
    if (ps.gate && !ps.gate()) return;
    renderer.info.reset();
    if (!ps.sky) renderer.setClearColor(U.uSkyHorizon.value, 1);
    renderer.clear();
    if (ps.sky) renderer.render(skyScene, screenCam);
    renderer.render(scene, camera);
    if (ps.overlay) renderer.render(overlayScene, screenCam);
    if (ps.after) ps.after(performance.now());
  };

  Render.stats = function () {
    var i = renderer ? renderer.info.render : { calls: 0, triangles: 0 };
    return { calls: i.calls, triangles: i.triangles, pixelRatio: Display.pixelRatio };
  };

  // defaults so uniforms are valid before init
  Render.setTimeOfDay(state.hour);
  Render.setSeason('spring', true);
})();
