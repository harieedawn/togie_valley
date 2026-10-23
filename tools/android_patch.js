#!/usr/bin/env node
/* Togie Valley - tools/android_patch.js (Stage 14C). Run after `npx cap add android`; edits the generated android/ project:
 * sensor landscape, hardware acceleration, immersive fullscreen, keep screen on, media playback without gesture,
 * back button -> Game.Native.back() through evaluateJavascript, splash/window background #1d2750. Safe to run twice. */
'use strict';
var fs = require('fs'), path = require('path');
var app = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main');
function must(p) { if (!fs.existsSync(p)) { console.error('android_patch FAILED: missing ' + p + ' (did `npx cap add android` run?)'); process.exit(1); } return p; }

/* 1. manifest: landscape + hardware acceleration on the activity */
var mf = must(path.join(app, 'AndroidManifest.xml')), x = fs.readFileSync(mf, 'utf8');
if (!/sensorLandscape/.test(x)) {
  x = x.replace(/<activity\b/, '<activity android:screenOrientation="sensorLandscape" android:hardwareAccelerated="true"');
  if (!/sensorLandscape/.test(x)) { console.error('android_patch FAILED: <activity> not found in manifest'); process.exit(1); }
  fs.writeFileSync(mf, x);
}

/* 2. MainActivity.java: fullscreen, keep screen on, media autoplay, back button bridge */
var javaDir = must(path.join(app, 'java', 'com', 'togie', 'valley'));
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), [
  'package com.togie.valley;',
  '',
  'import android.os.Build;',
  'import android.os.Bundle;',
  'import android.view.WindowManager;',
  'import android.webkit.WebSettings;',
  'import android.webkit.WebView;',
  'import androidx.activity.OnBackPressedCallback;',
  'import androidx.core.view.WindowCompat;',
  'import androidx.core.view.WindowInsetsCompat;',
  'import androidx.core.view.WindowInsetsControllerCompat;',
  'import com.getcapacitor.BridgeActivity;',
  '',
  'public class MainActivity extends BridgeActivity {',
  '  @Override',
  '  public void onCreate(Bundle savedInstanceState) {',
  '    super.onCreate(savedInstanceState);',
  '    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
  '    if (Build.VERSION.SDK_INT >= 28) {',
  '      getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;',
  '    }',
  '    final WebView web = getBridge() != null ? getBridge().getWebView() : null;',
  '    if (web != null) {',
  '      WebSettings s = web.getSettings();',
  '      s.setMediaPlaybackRequiresUserGesture(false);',
  '    }',
  '    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {',
  '      @Override',
  '      public void handleOnBackPressed() {',
  '        if (web != null) web.evaluateJavascript("window.Game && Game.Native && Game.Native.back && Game.Native.back()", null);',
  '      }',
  '    });',
  '    hideSystemBars();',
  '  }',
  '',
  '  @Override',
  '  public void onWindowFocusChanged(boolean hasFocus) {',
  '    super.onWindowFocusChanged(hasFocus);',
  '    if (hasFocus) hideSystemBars();',
  '  }',
  '',
  '  private void hideSystemBars() {',
  '    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);',
  '    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());',
  '    if (c == null) return;',
  '    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);',
  '    c.hide(WindowInsetsCompat.Type.systemBars());',
  '  }',
  '}',
  ''
].join('\n'));

/* 3. splash + window background #1d2750 (best effort: warn instead of failing) */
var res = path.join(app, 'res');
try {
  fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
  fs.writeFileSync(path.join(res, 'drawable', 'togie_splash.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#1d2750"/></shape>\n');
  var st = path.join(res, 'values', 'styles.xml'), s = fs.readFileSync(st, 'utf8');
  s = s.replace(/@drawable\/splash\b/g, '@drawable/togie_splash');
  if (!/windowSplashScreenBackground/.test(s)) {
    s = s.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/, '$1\n        <item name="windowSplashScreenBackground">#1d2750</item>\n        <item name="android:windowBackground">@drawable/togie_splash</item>');
  }
  if (!/<style name="AppTheme\.NoActionBar"[^>]*>[^]*?<item name="android:windowBackground">/.test(s.split('</style>')[0] + s.split('</style>').filter(function (b) { return /name="AppTheme\.NoActionBar"/.test(b); })[0])) {
    s = s.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowBackground">@drawable/togie_splash</item>');
  }
  fs.writeFileSync(st, s);
} catch (e) { console.warn('android_patch warning (splash/background skipped): ' + e.message); }
/* 4. launcher icons from tools/gen_icon.py (icons/android/mipmap-*): legacy + round + adaptive foreground/background */
try {
  var iconSrc = path.resolve(__dirname, '..', 'icons', 'android');
  fs.readdirSync(iconSrc).forEach(function (d) {
    var dst = path.join(res, d); fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(path.join(iconSrc, d)).forEach(function (f) { fs.copyFileSync(path.join(iconSrc, d, f), path.join(dst, f)); });
  });
  var any = path.join(res, 'mipmap-anydpi-v26'); fs.mkdirSync(any, { recursive: true });
  var ad = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
  fs.writeFileSync(path.join(any, 'ic_launcher.xml'), ad); fs.writeFileSync(path.join(any, 'ic_launcher_round.xml'), ad);
} catch (e) { console.warn('android_patch warning (icons skipped): ' + e.message); }
console.log('android_patch: done');
