/* Togie Valley - errors.js (Stage 1)
 * Global error catcher: small dismissable on-screen panel (message, file:line, Copy button).
 * Loaded right after three.js; depends on nothing. Exposes window.TogieErrors (not on Game: it loads before core.js).
 */
(function () {
  'use strict';
  var panel = null, list = null, entries = [], MAX = 6;

  function ensure() {
    if (panel) return true;
    if (!document.body) return false;
    panel = document.createElement('div');
    panel.id = 'error-panel';
    panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);max-height:40%;' +
      'z-index:99999;background:#fff1d0;color:#5a3a22;border:3px solid #8c5a34;border-radius:14px;box-shadow:0 4px 0 rgba(90,58,34,.35);' +
      'font:12px/1.35 ui-rounded,Nunito,system-ui,sans-serif;padding:8px 10px;display:none;pointer-events:auto;touch-action:auto;' +
      '-webkit-user-select:text;user-select:text';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
    var title = document.createElement('b');
    title.textContent = 'Something went wrong';
    title.style.flex = '1';
    bar.appendChild(title);
    bar.appendChild(button('Copy', copyAll));
    bar.appendChild(button('Close', function () { panel.style.display = 'none'; entries.length = 0; list.textContent = ''; }));
    list = document.createElement('div');
    list.style.cssText = 'overflow:auto;max-height:calc(40vh - 52px);white-space:pre-wrap;word-break:break-word';
    panel.appendChild(bar);
    panel.appendChild(list);
    document.body.appendChild(panel);
    return true;
  }

  function button(label, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'min-width:56px;min-height:36px;border:3px solid #8c5a34;border-radius:12px;background:#ffd166;color:#5a3a22;font:700 13px ui-rounded,system-ui,sans-serif;touch-action:manipulation';
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); });
    return b;
  }

  function copyAll(btn) {
    var text = entries.join('\n\n');
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1200); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    } catch (e) { /* fall through */ }
    fallback();
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-999px;top:0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        done();
      } catch (e) { /* ignore */ }
    }
  }

  function report(msg, src, line, col, err) {
    var where = src ? String(src).split('/').slice(-2).join('/') + ':' + (line || 0) + (col ? ':' + col : '') : '';
    var text = String(msg) + (where ? '\n  at ' + where : '');
    if (err && err.stack && !where) text += '\n' + String(err.stack).split('\n').slice(0, 3).join('\n');
    if (entries.length && entries[entries.length - 1] === text) return;
    entries.push(text);
    if (entries.length > MAX) entries.shift();
    if (!ensure()) { document.addEventListener('DOMContentLoaded', function () { report(msg, src, line, col, err); }); return; }
    list.textContent = entries.join('\n\n');
    panel.style.display = 'block';
  }

  var prevOnError = window.onerror;
  window.onerror = function (msg, src, line, col, err) {
    report(msg, src, line, col, err);
    return typeof prevOnError === 'function' ? prevOnError.apply(this, arguments) : false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    report('Unhandled promise: ' + (r && r.message ? r.message : String(r)), '', 0, 0, r);
  });

  window.TogieErrors = { report: function (msg) { report(msg, '', 0, 0, null); } };
})();
