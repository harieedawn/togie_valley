/* Togie Valley - fish_models.js (Stage 15E1): shared 3D fish builder. Game.FishModels.
 * 15 looks (perch, trout, carp, bream, pike, catfish, eel, koi, snake, goby, knife, tilapia, sprat, pangas, lang; Stage 16 D1 maps the 14 species), tapered two-tone ellipsoid body, tail / dorsal / pectoral
 * fins, eye, vertex colors only (toon material 'prop' + thin ink outline). Fish local frame: head +x, back +y, width z, length ~ 1 * len.
 * Uniform scale only (the fish is baked at a uniform size); species differences are baked proportions.
 * Used by: fish_stall.js (stall display), world_react.js (crate), fishing_fx.js (held catch).
 * Depends on THREE, Game.Render, Game.Models (Game.FishData is optional: ids map to a look + colors).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models) { console.error('[fish_models] missing deps'); return; }
  var R = G.Render, Mo = G.Models, FM = G.FishModels = {};

  /* proportions relative to total length 1: h body height, w body width, tail fin height, dors dorsal height, snout cone length,
   * barb barbel pairs, spots back spots, patch koi patches, bands dark vertical bands */
  var DEF = {
    perch:   { h: 0.27, w: 0.17, tail: 0.20, dors: 0.17, snout: 0,    barb: 0, spots: 0, patch: 0, bands: 3, len: 0.30 },
    trout:   { h: 0.21, w: 0.14, tail: 0.19, dors: 0.10, snout: 0.02, barb: 0, spots: 3, patch: 0, bands: 0, len: 0.38 },
    carp:    { h: 0.30, w: 0.19, tail: 0.21, dors: 0.14, snout: 0,    barb: 1, spots: 0, patch: 0, bands: 0, len: 0.42 },
    bream:   { h: 0.46, w: 0.13, tail: 0.17, dors: 0.20, snout: 0,    barb: 0, spots: 0, patch: 0, bands: 0, len: 0.32 },
    pike:    { h: 0.16, w: 0.13, tail: 0.17, dors: 0.10, snout: 0.12, barb: 0, spots: 4, patch: 0, bands: 0, len: 0.55 },
    catfish: { h: 0.19, w: 0.22, tail: 0.16, dors: 0.07, snout: 0,    barb: 2, spots: 0, patch: 0, bands: 0, len: 0.45 },
    eel:     { h: 0.075, w: 0.075, tail: 0.10, dors: 0.04, snout: 0,  barb: 0, spots: 0, patch: 0, bands: 0, len: 0.62 },
    koi:     { h: 0.29, w: 0.20, tail: 0.23, dors: 0.10, snout: 0,    barb: 0, spots: 0, patch: 3, bands: 0, len: 0.40 },
    snake:   { h: 0.17, w: 0.15, tail: 0.15, dors: 0.07, snout: 0.07, barb: 0, spots: 0, patch: 0, bands: 4, len: 0.52 },
    goby:    { h: 0.21, w: 0.20, tail: 0.14, dors: 0.12, snout: 0,    barb: 0, spots: 4, patch: 0, bands: 0, len: 0.30 },
    knife:   { h: 0.36, w: 0.13, tail: 0.09, dors: 0.06, snout: 0,    barb: 0, spots: 3, patch: 0, bands: 0, len: 0.42 },
    tilapia: { h: 0.38, w: 0.17, tail: 0.18, dors: 0.20, snout: 0,    barb: 0, spots: 0, patch: 0, bands: 0, len: 0.34 },
    sprat:   { h: 0.15, w: 0.11, tail: 0.20, dors: 0.09, snout: 0,    barb: 0, spots: 0, patch: 0, bands: 0, len: 0.26 },
    pangas:  { h: 0.20, w: 0.15, tail: 0.20, dors: 0.15, snout: 0,    barb: 1, spots: 0, patch: 0, bands: 0, len: 0.50 },
    lang:    { h: 0.22, w: 0.20, tail: 0.19, dors: 0.10, snout: 0,    barb: 2, spots: 5, patch: 0, bands: 0, len: 0.55 }
  };
  var LOOKS = FM.LOOKS = ['perch', 'trout', 'carp', 'bream', 'pike', 'catfish', 'eel', 'koi', 'snake', 'goby', 'knife', 'tilapia', 'sprat', 'pangas', 'lang'];
  var ID_LOOK = {
    sarat: 'bream', linh: 'sprat', keo: 'goby', perch: 'perch', tilapia: 'tilapia', catfish: 'catfish', thatlat: 'knife', carp: 'carp',
    snakehead: 'snake', eel: 'eel', tra: 'pangas', bongtuong: 'goby', lang: 'lang', koi: 'koi'
  };
  var V_LOOK = { slim: 'trout', round: 'carp', flat: 'bream' };
  var BODY_X = 0.43;            // body half length (x semi-axis)

  function lookOf(id) {
    if (DEF[id]) return id;
    if (ID_LOOK[id]) return ID_LOOK[id];
    var d = G.FishData && G.FishData.get && G.FishData.get(id), v = d && d.icon && d.icon.v;
    return V_LOOK[v] || 'trout';
  }
  function colorsOf(id) {
    var d = G.FishData && G.FishData.get && G.FishData.get(id), ic = d && d.icon, c = new THREE.Color();
    if (!ic || !ic.c1) return [0x9fb4c6, 0xe8eef2, 0x7a90a6];
    return [c.set(ic.c1).getHex(), c.set(ic.c2 || '#eeeeee').getHex(), c.set(ic.c3 || '#cccccc').getHex()];
  }
  FM.lookOf = lookOf; FM.colorsOf = colorsOf;

  /* ---- shared geometry (built once) ---- */
  var GEO = null;
  function taper(g) {                       // narrow the rear half: tapered ellipsoid
    var p = g.attributes.position, i, x, t, f;
    for (i = 0; i < p.count; i++) {
      x = p.getX(i) + 0.5; t = Math.min(1, Math.max(0, x / 0.6)); f = 0.32 + 0.68 * t * t * (3 - 2 * t);
      p.setY(i, p.getY(i) * f); p.setZ(i, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  }
  function geo() {
    if (GEO) return GEO;
    GEO = {
      top: taper(new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      bot: taper(new THREE.SphereGeometry(0.5, 10, 3, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44)),
      cone: new THREE.ConeGeometry(0.5, 1, 5), sph: new THREE.SphereGeometry(0.5, 7, 5)
    };
    return GEO;
  }
  function surf(def, x) {                   // body half height at x (for spots)
    var f = Math.sqrt(Math.max(0, 1 - (x / BODY_X) * (x / BODY_X))), t = Math.min(1, Math.max(0, (x / 0.86 + 0.5) / 0.6));
    return def.h * 0.5 * f * (0.32 + 0.68 * t * t * (3 - 2 * t));
  }

  var _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3();

  /* parts(idOrLook, o) -> Models.part list. o: len (total length, default per look), x,y,z, rx,ry,rz (placement), c1,c2,c3 (hex overrides) */
  FM.parts = function (id, o) {
    o = o || {};
    var look = lookOf(id), d = DEF[look], g = geo(), cs = colorsOf(id), c1 = o.c1 !== undefined ? o.c1 : cs[0], c2 = o.c2 !== undefined ? o.c2 : cs[1], c3 = o.c3 !== undefined ? o.c3 : cs[2];
    var k = (o.len || d.len) / 1.04, out = [], h = d.h, w = d.w, i, s, ex = 0.28, ef = Math.sqrt(1 - (ex / BODY_X) * (ex / BODY_X)), ez = w * 0.5 * ef - 0.004;
    function P(geom, c, p, r, sc) { out.push(Mo.part(geom, c, p, r, sc)); }
    P(g.top, c1, [0, 0, 0], null, [BODY_X * 2, h, w]);
    P(g.bot, c2, [0, 0, 0], null, [BODY_X * 2, h, w]);
    // tail (apex at the body, wide in y), dorsal, pectorals, belly fin
    P(g.cone, c3, [-0.40 - 0.12, 0, 0], [0, 0, -Math.PI / 2], [d.tail * 2.0, 0.24, 0.03]);
    P(g.cone, c3, [-0.03, surf(d, -0.03) + d.dors * 0.42, 0], [0, 0, 0.35], [0.24, d.dors, 0.03]);
    P(g.cone, c3, [-0.2, -surf(d, -0.2) - 0.02, 0], [0, 0, Math.PI - 0.3], [0.12, d.dors * 0.55, 0.025]);
    for (s = -1; s <= 1; s += 2) P(g.sph, c3, [0.15, -h * 0.12, s * w * 0.46], [0, s * 0.35, -0.25], [0.15, 0.03, 0.075]);
    // eyes
    for (s = -1; s <= 1; s += 2) {
      P(g.sph, 0xffffff, [ex, h * 0.13, s * ez], null, [0.065, 0.065, 0.065]);
      P(g.sph, 0x2b2024, [ex + 0.012, h * 0.13, s * (ez + 0.014)], null, [0.036, 0.036, 0.036]);
    }
    if (d.snout) P(g.cone, c1, [BODY_X + d.snout * 0.4, -h * 0.04, 0], [0, 0, -Math.PI / 2], [h * 0.62, d.snout * 1.2, w * 0.7]);
    for (i = 0; i < d.barb; i++) for (s = -1; s <= 1; s += 2)
      P(g.cone, c2, [BODY_X - 0.01 + 0.05, -h * 0.12 - i * 0.04, s * w * (0.22 + i * 0.08)], [0, s * (0.5 + i * 0.3), -Math.PI / 2], [0.022, 0.15 - i * 0.04, 0.022]);
    for (i = 0; i < d.spots; i++) {
      var sx = 0.22 - i * (0.5 / d.spots), sr = 0.03 + (i % 2) * 0.012;
      P(g.sph, c3, [sx, surf(d, sx) * 0.92, ((i % 2) ? 1 : -1) * w * 0.1], null, [sr * 2, sr * 1.5, sr * 2]);
    }
    for (i = 0; i < d.patch; i++) {
      var px = 0.2 - i * 0.22;
      P(g.sph, c3, [px, surf(d, px) * 0.86, (i % 2 ? 0.35 : -0.35) * w * 0.4], [0, i * 0.7, 0], [0.16 - i * 0.02, 0.06, 0.12]);
    }
    for (i = 0; i < d.bands; i++) {
      var bx = 0.12 - i * 0.16, bf = Math.sqrt(1 - (bx / BODY_X) * (bx / BODY_X)), bt = Math.min(1, Math.max(0, (bx / 0.86 + 0.5) / 0.6)), tp = 0.32 + 0.68 * bt * bt * (3 - 2 * bt);
      P(g.sph, c3, [bx, 0.012, 0], null, [0.045, h * bf * tp * 0.98, w * bf * tp * 0.98]);
    }
    // placement transform + uniform size
    _E.set(o.rx || 0, o.ry || 0, o.rz || 0, 'XYZ'); _Q.setFromEuler(_E); _P.set(o.x || 0, o.y || 0, o.z || 0); _S.set(k, k, k);
    _M.compose(_P, _Q, _S);
    for (i = 0; i < out.length; i++) out[i].matrix.premultiply(_M);
    return out;
  };
  FM.geometry = function (id, o) { return Mo.mergeParts(FM.parts(id, o)); };
  FM.mesh = function (id, o) {
    var m = new THREE.Mesh(FM.geometry(id, o), Mo.material('prop'));
    m.name = 'fish_' + lookOf(id); R.addOutline(m, true); return m;
  };
  /* extent(idOrLook, len) -> {front, back, halfH, halfW} half sizes in world units of the unrotated fish (head +x). For layout checks. */
  FM.extent = function (id, len) {
    var d = DEF[lookOf(id)], k = (len || d.len) / 1.04;
    return { front: (BODY_X + d.snout * 1.0) * k, back: 0.52 * k, halfH: (d.h * 0.5 + d.dors * 0.9) * k, halfW: Math.max(d.w * 0.5 + 0.03, 0.2) * k };
  };
  FM.defaultLen = function (id) { return DEF[lookOf(id)].len; };
})();
