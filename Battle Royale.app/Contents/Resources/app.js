// Battle Royale — application Mac.
// Ouvre une vraie fenêtre macOS contenant le moteur WebKit du système (celui de Safari)
// et y charge le jeu (Resources/jeu/index.html). Aucun navigateur, aucune installation.
// La souris est capturée nativement pendant la partie (curseur caché et figé, comme dans un jeu PC).
ObjC.import('Cocoa');
ObjC.import('WebKit');
ObjC.import('CoreGraphics');

var app, win, web, handler, delegate, monitor, timer;   // références globales : jamais libérées
var locked = false, accX = 0, accY = 0;

function run(argv) {
  var res = argv[0];
  try {
    start(res);
  } catch (e) {
    fallback(res, e);
  }
}

function start(res) {
  app = $.NSApplication.sharedApplication;
  app.setActivationPolicy(0); // NSApplicationActivationPolicyRegular
  $.NSProcessInfo.processInfo.processName = 'Battle Royale';
  var icon = $.NSImage.alloc.initWithContentsOfFile(res + '/icone.icns');
  if (icon && !icon.isNil()) app.applicationIconImage = icon;

  // ----- menus : Plein écran (⌘F) et Quitter (⌘Q) -----
  var mainMenu = $.NSMenu.alloc.init;
  var appItem = $.NSMenuItem.alloc.init;
  mainMenu.addItem(appItem);
  var appMenu = $.NSMenu.alloc.initWithTitle('Battle Royale');
  appMenu.addItemWithTitleActionKeyEquivalent('Plein écran', 'toggleFullScreen:', 'f');
  appMenu.addItem($.NSMenuItem.separatorItem);
  appMenu.addItemWithTitleActionKeyEquivalent('Masquer Battle Royale', 'hide:', 'h');
  appMenu.addItemWithTitleActionKeyEquivalent('Quitter Battle Royale', 'terminate:', 'q');
  appItem.submenu = appMenu;
  app.mainMenu = mainMenu;

  // ----- délégués Objective-C -----
  ObjC.registerSubclass({
    name: 'BRMessageHandler',
    superclass: 'NSObject',
    protocols: ['WKScriptMessageHandler'],
    methods: {
      'userContentController:didReceiveScriptMessage:': {
        types: ['void', ['id', 'id']],
        implementation: function (ucc, message) {
          var body = ObjC.unwrap(message.body);
          if (body === 'lock') lockMouse();
          else if (body === 'unlock') unlockMouse(false);
          else if (body === 'quit') $.NSApp.terminate(null);
          else if (body === 'fullscreen') win.toggleFullScreen(null);
        },
      },
    },
  });
  ObjC.registerSubclass({
    name: 'BRAppDelegate',
    superclass: 'NSObject',
    protocols: ['NSApplicationDelegate'],
    methods: {
      'applicationShouldTerminateAfterLastWindowClosed:': {
        types: ['bool', ['id']],
        implementation: function () { return true; },
      },
      'applicationDidResignActive:': {
        types: ['void', ['id']],
        implementation: function () { unlockMouse(true); },
      },
      'applicationWillTerminate:': {
        types: ['void', ['id']],
        implementation: function () { unlockMouse(false); },
      },
    },
  });
  delegate = $.BRAppDelegate.alloc.init;
  app.delegate = delegate;
  handler = $.BRMessageHandler.alloc.init;

  // ----- fenêtre -----
  var vis = $.NSScreen.mainScreen.visibleFrame;
  var w = Math.min(1680, Math.round(vis.size.width * 0.92));
  var h = Math.min(1050, Math.round(vis.size.height * 0.92));
  var rect = $.NSMakeRect(0, 0, w, h);
  var mask = 1 | 2 | 4 | 8; // titre, fermer, réduire, redimensionner
  win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(rect, mask, 2, false); // NSBackingStoreBuffered
  win.title = 'Battle Royale — Île de San Calma';
  win.releasedWhenClosed = false;
  win.acceptsMouseMovedEvents = true;
  win.backgroundColor = $.NSColor.blackColor;
  win.collectionBehavior = 1 << 7; // NSWindowCollectionBehaviorFullScreenPrimary
  win.minSize = { width: 960, height: 600 };

  // ----- moteur WebKit -----
  var conf = $.WKWebViewConfiguration.alloc.init;
  var setPref = function (obj, key) {
    try { obj.setValueForKey($.NSNumber.numberWithBool(true), key); } catch (e) { /* réglage absent sur cette version de macOS */ }
  };
  setPref(conf.preferences, 'allowFileAccessFromFileURLs');
  setPref(conf.preferences, 'developerExtrasEnabled');
  setPref(conf, 'allowUniversalAccessFromFileURLs');
  try { conf.mediaTypesRequiringUserActionForPlayback = 0; } catch (e) { /* macOS ancien */ }
  conf.userContentController.addScriptMessageHandlerName(handler, 'jeu');
  web = $.WKWebView.alloc.initWithFrameConfiguration(rect, conf);
  web.autoresizingMask = 2 | 16; // largeur et hauteur suivent la fenêtre
  win.contentView = web;
  var page = $.NSURL.fileURLWithPath(res + '/jeu/index.html');
  web.loadFileURLAllowingReadAccessToURL(page, $.NSURL.fileURLWithPath(res + '/jeu'));

  // ----- souris : déplacements relatifs transmis au jeu pendant la capture -----
  var MOUSE_MOVES = (1 << 5) | (1 << 6) | (1 << 7) | (1 << 27); // déplacé, glissé gauche/droit/autre
  monitor = $.NSEvent.addLocalMonitorForEventsMatchingMaskHandler(MOUSE_MOVES, function (ev) {
    if (locked) { accX += ev.deltaX; accY += ev.deltaY; }
    return ev;
  });
  timer = $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(1 / 120, true, function () {
    if (accX !== 0 || accY !== 0) {
      var js = 'window.__nativeMouse && window.__nativeMouse(' + accX.toFixed(2) + ',' + accY.toFixed(2) + ')';
      accX = 0; accY = 0;
      web.evaluateJavaScriptCompletionHandler(js, null);
    }
  });

  win.center;
  win.makeKeyAndOrderFront(null);
  win.makeFirstResponder(web);
  app.activateIgnoringOtherApps(true);
  app.run;
}

// Curseur caché et figé au centre de la fenêtre : la caméra suit les mouvements de la souris
function lockMouse() {
  if (locked) return;
  locked = true;
  try {
    var f = win.frame;
    var mainH = $.NSScreen.screens.objectAtIndex(0).frame.size.height;
    $.CGWarpMouseCursorPosition({ x: f.origin.x + f.size.width / 2, y: mainH - (f.origin.y + f.size.height / 2) });
  } catch (e) { /* centrage facultatif */ }
  $.CGAssociateMouseAndMouseCursorPosition(false);
  $.NSCursor.hide;
}

function unlockMouse(tellGame) {
  if (!locked) return;
  locked = false;
  $.CGAssociateMouseAndMouseCursorPosition(true);
  $.NSCursor.unhide;
  if (tellGame && web) web.evaluateJavaScriptCompletionHandler('window.__nativeUnlocked && window.__nativeUnlocked()', null);
}

// Si la fenêtre native ne peut pas s'ouvrir, le jeu s'ouvre dans le navigateur par défaut
function fallback(res, err) {
  var sa = Application.currentApplication();
  sa.includeStandardAdditions = true;
  try {
    sa.doShellScript('open ' + quoted(res + '/jeu/index.html'));
  } catch (e) {
    sa.displayDialog('Battle Royale n’a pas pu démarrer : ' + err, { buttons: ['OK'], withIcon: 'stop' });
  }
}

function quoted(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
