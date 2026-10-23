/* Togie Valley - decor.js (Stage 2B)
 * Game.Decor.build(): instanced trees/bushes/flowers (swaying) + fences + single props from world markers.
 * Depends on THREE, Game.Render, Game.World, Game.Props.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.World || !G.Props) { console.error('[decor] missing deps'); return; }
  var R = G.Render, W = G.World, Props = G.Props, U = R.uniforms;
  var D = { group: null }, timeU = { value: 0 };

  var FD = R.fade;   // Stage 10.7 see-through chunks (render.js)
  var VERT = [
    'attribute vec3 smoothNormal; uniform float uTime, uSway, uW;',
    'varying vec3 vN, vC, vP;',
    FD ? FD.vsPars : '',
    '#ifdef TREE',
    'attribute vec3 aTree; attribute vec4 iTint; attribute vec3 iFruit; varying float vMask; varying vec3 vTint;',
    '#endif',
    'void main(){',
    ' vec3 p = position;',
    '#ifdef TREE',
    ' p.y += iTint.w * aTree.y;',                       // per-instance trunk height: trunk top + canopy ride up/down
    ' vec3 cc = mix(color, color * iTint.rgb, aTree.x);', // canopy tint
    ' cc = mix(cc, cc * iFruit, aTree.z);',               // fruit hue
    ' vMask = aTree.x; vTint = iTint.rgb;',
    '#else',
    ' vec3 cc = color;',
    '#endif',
    '#ifdef OUTLINE',
    ' p += smoothNormal * uW;',
    '#endif',
    ' vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);',
    ' float k = uSway * max(position.y, 0.0);',
    ' w.x += sin(uTime * 1.6 + w.x * 0.7 + w.z * 0.5) * 0.06 * k;',
    ' w.z += cos(uTime * 1.3 + w.z * 0.6 + w.x * 0.4) * 0.04 * k;',
    ' vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vC = cc; vP = w.xyz;',
    FD ? ' vFadeW = w.xyz;' : '',
    ' gl_Position = projectionMatrix * viewMatrix * w;',
    '}'].join('\n');
  var FRAG = [
    'uniform vec3 uLightDir, uLightColor, uAmbient, uFogColor, uInkColor; uniform vec2 uBands, uFogRange;',
    'varying vec3 vN, vC, vP;',
    FD ? FD.fs : '',
    '#ifdef TREE',
    'uniform vec3 uSeasonTint, uSeasonHue; uniform float uSeasonAmt, uSeasonal, uBloom; varying float vMask; varying vec3 vTint;',
    '#endif',
    'void main(){',
    FD ? ' fadeDiscard();' : '',
    ' vec3 col = uInkColor;',
    '#ifndef OUTLINE',
    ' vec3 base = vC;',
    '#ifdef TREE',
    ' float lum = dot(base, vec3(0.299, 0.587, 0.114));',   // seasonal canopy: autumn warm, winter pale (shared season uniforms), spring blossom (fruit)
    ' vec3 sea = mix(base * uSeasonTint, vec3(lum) * uSeasonHue * mix(vec3(1.0), vTint, 0.7), uSeasonAmt);',
    ' base = mix(base, sea, uSeasonal * vMask);',
    ' base = mix(base, vec3(1.0, 0.78, 0.86) * (0.62 + 0.55 * lum), uBloom * vMask);',
    '#endif',
    ' float d = dot(normalize(vN), normalize(uLightDir));',
    ' float b = d > uBands.y ? 1.0 : (d > uBands.x ? 0.55 : 0.0);',
    ' col = base * min(uAmbient + uLightColor * b, vec3(1.15));',
    '#endif',
    ' float f = smoothstep(uFogRange.x, uFogRange.y, length(vP - cameraPosition));',
    ' gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);',
    '}'].join('\n');

  // opts: {fade: minY (see-through below this height stays solid; omit = no fade), tree: true (per-instance tint/shift, seasonal canopy), seasonal: 0..1, bloom: uniform object}
  function mat(sway, outline, opts) {
    opts = opts || {};
    var u = { uTime: timeU, uSway: { value: sway }, uW: { value: 0.04 } }, k, def = {};
    ['uLightDir', 'uLightColor', 'uAmbient', 'uFogColor', 'uInkColor', 'uBands', 'uFogRange'].forEach(function (n) { u[n] = U[n]; });
    if (outline) def.OUTLINE = 1;
    u.uSway.base = sway; (D.sway = D.sway || []).push(u.uSway);   // Stage 14B: perf.js scales sway per tier
    if (G.Perf && G.Perf.tierDef) u.uSway.value = sway * G.Perf.tierDef.sway;
    if (FD) { var fu = FD.uniforms(opts.fade !== undefined, opts.fade); for (k in fu) u[k] = fu[k]; }
    if (opts.tree) {
      def.TREE = 1;
      u.uSeasonTint = U.uSeasonTint; u.uSeasonHue = U.uSeasonHue; u.uSeasonAmt = U.uSeasonAmt;
      u.uSeasonal = { value: opts.seasonal === undefined ? 1 : opts.seasonal };
      u.uBloom = opts.bloom || { value: 0 };
    }
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true,
      side: outline ? THREE.BackSide : THREE.FrontSide, defines: def });
  }

  /** list = [{x,z,ry,s,y?,lx?,lz?,tint?:[r,g,b,shift],fruit?:[r,g,b]}] -> fill + outline InstancedMesh pair (outline shares the instance buffer).
   *  opts (see mat): tree mode needs geometry attribute aTree (Scenery adds it) and adds per-instance iTint/iFruit attributes. */
  function instanced(name, list, sway, noOutline, opts) {   // name = prop name or a BufferGeometry (Stage 10.5 scenery); list items may carry y
    var g = typeof name === 'string' ? Props.geometry(name) : name, n = list.length, i, o, m = new THREE.Matrix4(), q = new THREE.Quaternion(),
      e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), s = new THREE.Vector3();
    opts = opts || {};
    if (!n) return [];
    if (opts.chunk && G.Chunks && n > 1) return G.Chunks.instanced(D, name, list, sway, noOutline, opts);   // Stage 14B: spatial chunks (opts.chunk = tiles, opts.group)
    if (opts.tree) {
      var ta = new Float32Array(n * 4), fa = new Float32Array(n * 3);
      for (i = 0; i < n; i++) {
        o = list[i]; var t4 = o.tint || [1, 1, 1, 0], f3 = o.fruit || [1, 1, 1];
        ta[i * 4] = t4[0]; ta[i * 4 + 1] = t4[1]; ta[i * 4 + 2] = t4[2]; ta[i * 4 + 3] = t4[3];
        fa[i * 3] = f3[0]; fa[i * 3 + 1] = f3[1]; fa[i * 3 + 2] = f3[2];
      }
      g.setAttribute('iTint', new THREE.InstancedBufferAttribute(ta, 4));
      g.setAttribute('iFruit', new THREE.InstancedBufferAttribute(fa, 3));
    }
    var fill = new THREE.InstancedMesh(g, mat(sway, false, opts), n), out = noOutline ? null : new THREE.InstancedMesh(g, mat(sway, true, opts), n);
    for (i = 0; i < n; i++) {
      o = list[i];
      m.compose(p.set(o.x, o.y || 0, o.z), q.setFromEuler(e.set(o.lx || 0, o.ry || 0, o.lz || 0)), s.setScalar(o.s || 1));
      fill.setMatrixAt(i, m);
    }
    fill.frustumCulled = false; // base-geometry bounds would cull instances
    fill.name = 'inst_' + (typeof name === 'string' ? name : 'geo'); fill.raycast = function () {};
    D.group.add(fill);
    if (!out) return [fill];
    out.instanceMatrix = fill.instanceMatrix;
    out.frustumCulled = false; out.name = 'outline'; out.raycast = function () {};
    D.group.add(out);
    return [fill, out];
  }

  function single(name, x, z, ry) {
    var m = Props.make(name);
    m.position.set(x, 0, z); m.rotation.y = ry || 0;
    D.group.add(m);
    return m;
  }
  function grassAt(tx, tz) { return W.tileType(tx + 0.5, tz + 0.5) === 'grass'; }

  G.Events.on('world:plotsChanged', function () { if (D.refreshFences) D.refreshFences(); });

  D.build = function () {
    if (D.group) return D.group;
    D.group = new THREE.Group(); D.group.name = 'decor';
    var tx, tz, i, lay = G.Layout.scatter({
      W: W.W, H: W.H, seed: 1234, type: function (x, z) { return W.tileType(x + 0.5, z + 0.5); },
      markers: function (n) { return W.getMarkers(n); },
      isFarm: function (x, z) { return x > 11 && x < 28 && z > 6 && z < 19; }
    }), trees = lay.trees, bushes = lay.bushes, flowers = lay.flowers, fences = [];
    D.layout = lay; D.instanced = instanced;
    lay.solids.forEach(function (c) { W.setBlocked(c[0], c[1], true); });   // solid props block walking (flowers/crops stay passable)
    function fenceList() {
      var out = [], x, z;
      for (z = 0; z < W.H; z++) for (x = 0; x < W.W; x++) {
        if (W.tileType(x + 0.5, z + 0.5) !== 'locked') continue;
        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) {
          if (W.tileType(x + d[0] + 0.5, z + d[1] + 0.5) === 'locked') return;
          out.push({ x: x + 0.5 + d[0] * 0.5, z: z + 0.5 + d[1] * 0.5, ry: d[0] ? Math.PI / 2 : 0, s: 1 });
        });
      }
      return out;
    }
    D.refreshFences = function () {   // Stage 6: after plots (un)lock
      (D.fences || []).forEach(function (m) { D.group.remove(m); m.material.dispose(); });
      D.fences = instanced('fence', fenceList(), 0);
    };
    // scatter trees (D.layout.trees) are instanced by Game.Scenery (Stage 10.7: species, sizes, tints); no tree here
    instanced('bush', bushes, 0.6, false, { fade: 0.25, chunk: 45, group: 'bushes' });
    instanced('flowers', flowers, 1.5, false, { chunk: 45, group: 'flowers' });
    D.fences = instanced('fence', fenceList(), 0);

    lay.singles.forEach(function (o) { single(o.name, o.tx + 0.5, o.tz + 0.5, o.ry); });
    W.getMarkers('bin').forEach(function (m) { single('bin', m.tx + 0.5, m.tz + 0.5, 0); });
    // Farmhouse: Models.house() (walls, roof, door, step, windows, chimney) centered on the 'H' footprint, door faces +z
    // and sits on the 'D' marker column. Props.farmhouse is no longer placed (it overlapped the model's own door).
    var hx0 = 1e9, hx1 = -1, hz0 = 1e9, hz1 = -1;
    for (tz = 0; tz < W.H; tz++) for (tx = 0; tx < W.W; tx++) {
      if (W.tileType(tx + 0.5, tz + 0.5) !== 'house') continue;
      hx0 = Math.min(hx0, tx); hx1 = Math.max(hx1, tx); hz0 = Math.min(hz0, tz); hz1 = Math.max(hz1, tz);
    }
    if (hx1 >= 0 && G.Models && G.Models.house) {
      D.house = G.Models.house({ shadow: true });
      D.house.position.set((hx0 + hx1 + 1) / 2, 0, (hz0 + hz1 + 1) / 2);
      D.group.add(D.house);
    } else console.error('[decor] house footprint or Models.house missing');
    lay.rocks.forEach(function (o) { single('rock', o.x, o.z, o.ry); });
    R.scene.add(D.group);
    G.Loop.onFrame(function (dt) { timeU.value += dt; }, 0);
    return D.group;
  };

  G.Decor = D;
})();
