/* Togie Valley - service worker (Stage 13). Cache-first; runtime-caches CDN three.js + Google Fonts.
 * music/ is never precached; tracks are cached on first play (cap 40 MB, oldest evicted). */
'use strict';
var VERSION = 'tv-v12';
var CORE = VERSION + '-core', RUNTIME = VERSION + '-rt', MUSIC = VERSION + '-music';
var MUSIC_CAP = 40 * 1024 * 1024;
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'fonts/gsans-vf.woff',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'icons/favicon-32.png', 'icons/favicon-48.png'];
var CDN = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CORE).then(function (c) {
    var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap';
    var fonts = fetch(FONT_CSS).then(function (r) { var cp = r.clone(); return c.put(FONT_CSS, cp).then(function () { return r.text(); }); }).then(function (css) {
      var urls = css.match(/https:\/\/fonts\.gstatic\.com[^)'" ]+/g) || [];
      return Promise.all(urls.map(function (u) { return fetch(u).then(function (r) { return c.put(u, r); }).catch(function () {}); }));
    }).catch(function () {});
    var local = fetch('index.html').then(function (r) { return r.text(); }).then(function (html) {
      var re = /(?:src|href)="((?:js|css|fonts)\/[^"]+)"/g, m, list = [];
      while ((m = re.exec(html))) list.push(m[1]);
      return Promise.all(list.map(function (u) { return c.add(u).catch(function () {}); }));
    }).catch(function () {});
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }).concat([fonts, local]))
      .then(function () { return Promise.all(CDN.map(function (u) { return fetch(u, { mode: 'no-cors' }).then(function (r) { return c.put(u, r); }).catch(function () {}); })); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trimMusic() {
  return caches.open(MUSIC).then(function (c) {
    return c.keys().then(function (reqs) {
      return Promise.all(reqs.map(function (r) { return c.match(r).then(function (res) { return res.clone().blob().then(function (b) { return { r: r, n: b.size }; }); }); }))
        .then(function (items) {
          var total = items.reduce(function (a, i) { return a + i.n; }, 0), k = 0;
          var p = Promise.resolve();
          while (total > MUSIC_CAP && k < items.length) { (function (it) { p = p.then(function () { return c.delete(it.r); }); })(items[k]); total -= items[k].n; k++; }
          return p;
        });
    });
  });
}

function store(cacheName, req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    var copy = res.clone();
    caches.open(cacheName).then(function (c) { return c.put(req, copy); }).catch(function () {});
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var same = url.origin === self.location.origin;
  var isMusic = same && /\/music\/[^/]+\.(mp3|ogg|m4a|wav)$/i.test(url.pathname);

  if (req.headers.has('range')) return;          // audio streaming ranges: let the network handle them
  if (isMusic) {
    e.respondWith(caches.open(MUSIC).then(function (c) {
      return c.match(req.url).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res.ok && res.status === 200) { c.put(req.url, res.clone()).then(trimMusic).catch(function () {}); }
          return res;
        });
      });
    }));
    return;
  }
  if (same && /\/music\/playlist\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(function (r) { return store(RUNTIME, req, r); }).catch(function () { return caches.match(req).then(function (h) { return h || new Response('', { status: 404 }); }); }));
    return;
  }
  var cdn = url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!same && !cdn) return;
  e.respondWith(caches.match(req, { ignoreSearch: same && req.mode === 'navigate' }).then(function (hit) {
    if (hit) {
      if (same) fetch(req).then(function (r) { store(CORE, req, r); }).catch(function () {}); // refresh in background
      return hit;
    }
    return fetch(req).then(function (res) { return store(same ? CORE : RUNTIME, req, res); }).catch(function () {
      if (req.mode === 'navigate') return caches.match('index.html');
      return new Response('', { status: 404 });
    });
  }));
});
