/* Togie Valley - native.js (Stage 14C): Capacitor/Android helpers. Game.Native.back() is called by MainActivity (android_patch.js)
 * through evaluateJavascript when the Android back button is pressed: closes the top panel, else opens the in-game menu. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.Events) { console.error('[native] missing deps'); return; }
  var N = G.Native = { isNative: !!window.Capacitor };
  N.back = function () {
    if (G.UI.closePanel()) return 'panel';
    G.Events.emit('ui:menu', {});   // panels.js opens the menu only when no panel/title is showing
    return 'menu';
  };
  if (N.isNative) document.documentElement.className += ' tv-native';
})();
