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
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
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

  get locked() { return document.pointerLockElement === this.canvas; }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* Safari ancien */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

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
