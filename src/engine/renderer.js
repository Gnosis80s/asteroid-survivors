// Vector-primitive renderer with additive glow and screen-shake support.
// Colors are palette keys resolved to hex; alpha + glow are applied per draw.

const PALETTE = {
  bg: '#000000', player: '#22e6ff', playerBullet: '#00d5ff', playerDim: '#0a5a6b',
  enemy: '#e8e8e8', enemyBullet: '#ff4d7e', hazard: '#ff4d7e', elite: '#ff9d2e',
  boss: '#ffd60a', gem: '#39ff88', heart: '#ff6b9a', chest: '#ffd60a',
  orbital: '#b46bff', beam: '#b46bff', mine: '#ffb03a', ui: '#9fb8c8',
  uiDim: '#4a5a63', white: '#ffffff', vacuum: '#4da6ff',
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export class Renderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = width;
    this.height = height;
    this.shakeX = 0;
    this.shakeY = 0;
    this._rgbCache = new Map();
  }

  _rgb(hex) {
    let c = this._rgbCache.get(hex);
    if (!c) {
      c = hexToRgb(hex);
      this._rgbCache.set(hex, c);
    }
    return c;
  }

  color(key, alpha = 1) {
    const hex = PALETTE[key] || key;
    const [r, g, b] = this._rgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  setShake(x, y) {
    this.shakeX = x;
    this.shakeY = y;
  }

  begin() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.translate(this.shakeX, this.shakeY);
  }

  // --- primitive helpers (all accept a style object) ---
  // style: { color, alpha=1, width=2, glow=0, fill=false }

  _style(style) {
    return {
      color: style.color || 'white',
      alpha: style.alpha ?? 1,
      width: style.width ?? 2,
      glow: style.glow ?? 0,
      fill: style.fill ?? false,
    };
  }

  polyline(points, style = {}) {
    if (points.length < 2) return;
    const s = this._style(style);
    const ctx = this.ctx;
    this._drawPath(points, false);
    ctx.strokeStyle = this.color(s.color, s.alpha);
    ctx.lineWidth = s.width;
    ctx.stroke();
    if (s.glow > 0) this._glow(points, false, s);
    if (s.fill) {
      ctx.fillStyle = this.color(s.color, s.alpha);
      ctx.fill();
    }
  }

  polygon(points, style = {}) {
    this.polyline([...points, points[0]], style);
  }

  circle(x, y, r, style = {}) {
    const s = this._style(style);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (s.fill) {
      ctx.fillStyle = this.color(s.color, s.alpha);
      ctx.fill();
    } else {
      ctx.strokeStyle = this.color(s.color, s.alpha);
      ctx.lineWidth = s.width;
      ctx.stroke();
    }
    if (s.glow > 0) this._glowCircle(x, y, r, s);
  }

  line(x1, y1, x2, y2, style = {}) {
    const s = this._style(style);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = this.color(s.color, s.alpha);
    ctx.lineWidth = s.width;
    ctx.stroke();
  }

  rect(x, y, w, h, style = {}) {
    const s = this._style(style);
    const ctx = this.ctx;
    ctx.fillStyle = this.color(s.color, s.alpha);
    ctx.fillRect(x, y, w, h);
  }

  text(str, x, y, { size = 14, color = 'ui', alpha = 1, align = 'left', font = 'monospace' } = {}) {
    const ctx = this.ctx;
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.color(color, alpha);
    ctx.fillText(str, x, y);
  }

  _drawPath(points, close) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (close) ctx.closePath();
  }

  // Cheap phosphor glow: re-stroke the path at increasing width/low alpha
  // using additive blending.
  _glow(points, close, s) {
    const ctx = this.ctx;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const passes = s.glow;
    for (let i = 1; i <= passes; i++) {
      this._drawPath(points, close);
      ctx.strokeStyle = this.color(s.color, s.alpha * 0.18 / i);
      ctx.lineWidth = s.width + i * (3 + s.width);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = prev;
  }

  _glowCircle(x, y, r, s) {
    const ctx = this.ctx;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= s.glow; i++) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = this.color(s.color, s.alpha * 0.18 / i);
      ctx.lineWidth = s.width + i * (2 + s.width);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = prev;
  }
}
