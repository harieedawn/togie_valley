#!/usr/bin/env node
/* Togie Valley - tools/build_www.js (Stage 14C). Copies the game into www/ for Capacitor and makes it offline-capable:
 * downloads three.min.js r128 and the Baloo 2 font files into www/vendor and rewrites www/index.html to use them.
 * Needs network + Node 18+ (global fetch). Usage: node tools/build_www.js */
'use strict';
var fs = require('fs'), path = require('path');
var root = path.resolve(__dirname, '..'), www = path.join(root, 'www');
var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
var FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap';
var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach(function (e) {
    if (e.name === '.gitkeep' || /\.md$/i.test(e.name)) return;
    var s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  });
}
async function get(url, headers) {
  var r = await fetch(url, { headers: headers || {} });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return r;
}

async function main() {
  rmrf(www); fs.mkdirSync(www, { recursive: true });
  ['index.html', 'manifest.webmanifest'].forEach(function (f) { fs.copyFileSync(path.join(root, f), path.join(www, f)); });
  ['js', 'css', 'fonts', 'icons', 'music'].forEach(function (d) { if (fs.existsSync(path.join(root, d))) copyDir(path.join(root, d), path.join(www, d)); });
  var mp3 = fs.existsSync(path.join(www, 'music')) ? fs.readdirSync(path.join(www, 'music')).filter(function (f) { return /\.mp3$/i.test(f); }).length : 0;
  console.log('copied game files; ' + mp3 + ' mp3 in music/');

  var vendor = path.join(www, 'vendor'), fontDir = path.join(vendor, 'fonts');
  fs.mkdirSync(fontDir, { recursive: true });
  fs.writeFileSync(path.join(vendor, 'three.min.js'), Buffer.from(await (await get(THREE_URL)).arrayBuffer()));

  var css = await (await get(FONT_CSS_URL, { 'User-Agent': UA })).text(), n = 0, jobs = [];
  css = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, function (m, u) {
    var name = 'baloo2-' + (n++) + (/\.woff2(\?|$)/.test(u) ? '.woff2' : '.woff');
    jobs.push(get(u).then(function (r) { return r.arrayBuffer(); }).then(function (b) { fs.writeFileSync(path.join(fontDir, name), Buffer.from(b)); }));
    return 'url(fonts/' + name + ')';
  });
  if (!n) throw new Error('no font files found in Google Fonts CSS');
  await Promise.all(jobs);
  fs.writeFileSync(path.join(vendor, 'baloo2.css'), css);

  var htmlPath = path.join(www, 'index.html'), html = fs.readFileSync(htmlPath, 'utf8'), before = html;
  html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js"><\/script>/, '<script src="vendor/three.min.js"></script>');
  html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="vendor/baloo2.css">');
  html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, '');
  if (html === before || /cdnjs\.cloudflare\.com|fonts\.googleapis\.com/.test(html)) throw new Error('index.html rewrite failed (external links remain)');
  fs.writeFileSync(htmlPath, html);
  console.log('www ready: three.min.js + ' + n + ' font file(s) in www/vendor');
}
main().catch(function (e) { console.error('build_www FAILED: ' + e.message); process.exit(1); });
