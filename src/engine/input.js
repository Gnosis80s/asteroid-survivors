// Keyboard + pointer input with per-frame "just pressed" edge detection.

const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' ', 'Tab',
]);

export class Input {
  constructor() {
    this.down = new Set();      // keys held this frame
    this.pressed = new Set();   // keys newly pressed this frame
    this.mouse = { x: 0, y: 0, down: false, pressed: false, moved: false };
    this._mousePrev = false;

    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.key) || e.code === 'Space') e.preventDefault();
      const code = e.code || e.key;
      if (!e.repeat && !this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      // Also track raw key for letter lookups.
      this.down.add(e.key.toLowerCase());
    });

    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code || e.key);
      this.down.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.down.clear();
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved = true;
    });
    window.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      if (e.button === 0) this.mouse.pressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
  }

  // Call once per frame at the end of the update.
  endFrame() {
    this.pressed.clear();
    this._mousePrev = this.mouse.down;
    this.mouse.pressed = false;
    this.mouse.moved = false;
  }

  isDown(key) {
    return this.down.has(key) || this.down.has(key.toLowerCase?.() ?? key);
  }

  justPressed(key) {
    return this.pressed.has(key) || this.pressed.has(key.toLowerCase?.() ?? key);
  }
}
