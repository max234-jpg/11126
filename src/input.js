// Clavier + souris (verrouillage du pointeur pour viser comme dans GTA).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // touches appuyées depuis la dernière frame
    this.dx = 0; this.dy = 0;
    this.buttons = 0;
    this.clicked = new Set();
    this.wheel = 0;
    this.enabled = false;
    this.sensitivity = 1;
    // Dans l'application Mac, la souris est capturée nativement (curseur figé, déplacements transmis par l'app)
    this.bridge = window.webkit?.messageHandlers?.jeu || null;
    this.nativeLocked = false;
    window.__nativeMouse = (dx, dy) => { if (this.nativeLocked) { this.dx += dx; this.dy += dy; } };
    window.__nativeUnlocked = () => this.setNativeLock(false, false);
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; if (this.nativeLocked) this.unlock(); });
    addEventListener('mousemove', (e) => {
      if (!this.locked || this.bridge) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) { this.lock(); return; }
      this.buttons |= 1 << e.button; this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  get locked() { return this.bridge ? this.nativeLocked : document.pointerLockElement === this.canvas; }

  setNativeLock(v, tellApp = true) {
    if (this.nativeLocked === v) return;
    this.nativeLocked = v;
    if (tellApp) try { this.bridge.postMessage(v ? 'lock' : 'unlock'); } catch (e) { /* app absente */ }
    document.dispatchEvent(new Event('pointerlockchange'));
  }

  lock() {
    if (this.bridge) return this.setNativeLock(true);
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* Safari ancien */ }
  }

  unlock() {
    if (this.bridge) return this.setNativeLock(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouse(b) { return (this.buttons & (1 << b)) !== 0; }
  click(b) { return this.clicked.has(b); }

  axis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('KeyZ') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('KeyQ') || this.down('ArrowLeft')) x -= 1;
    return [x, y];
  }

  endFrame() { this.pressed.clear(); this.clicked.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
