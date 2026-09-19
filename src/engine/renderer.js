// Vector-primitive renderer with additive glow and screen-shake support.
// Colors are palette keys resolved to hex; alpha + glow are applied per draw.

const PALETTE = {
  bg: '#000000', player: '#22e6ff', playerBullet: '#00d5ff', playerDim: '#0a5a6b',
  enemy: '#e8e8e8', enemyBullet: '#ff4d7e', hazard: '#ff4d7e', elite: '#ff9d2e',
  boss: '#ffd60a', gem: '#39ff88', heart: '#ff6b9a', chest: '#ffd60a',
  orbital: '#b46bff', beam: '#b46bff', mine: '#ffb03a', ui: '#9fb8c8',
  uiDim: '#4a5a63', white: '#ffffff', vacuum: '#4da6ff', bigGem: '#ff3b30',
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
    this._bloom = null;
    this._bloomCtx = null;
    this._scan = null;
    this._vignette = null;
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

  // Full-screen flash overlay (ignores shake/transform).
  flash(color, alpha) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.color(color, alpha);
    ctx.fillRect(0, 0, this.width, this.height);
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

  // Post-process the finished frame with CRT effects: phosphor bloom,
  // contrast/saturation punch, scanlines, and a vignette. Call once per
  // frame after all drawing.
  postProcess() {
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this._filterOk === undefined) this._filterOk = typeof ctx.filter === 'string';

    ctx.save();

    if (this._filterOk) {
      // Phosphor bloom: a wide soft halo plus a tight bright core.
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(16px)';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.canvas, 0, 0);
      ctx.filter = 'blur(5px)';
      ctx.globalAlpha = 0.4;
      ctx.drawImage(this.canvas, 0, 0);
      ctx.filter = 'none';

      // Vivid phosphor: punch up contrast and saturation.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.filter = 'contrast(1.07) saturate(1.35) brightness(1.03)';
      ctx.drawImage(this.canvas, 0, 0);
      ctx.filter = 'none';
    } else {
      // Fallback bloom: downsample + additive upsample.
      const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
      if (!this._bloom) {
        this._bloom = document.createElement('canvas');
        this._bloom.width = bw;
        this._bloom.height = bh;
        this._bloomCtx = this._bloom.getContext('2d');
      }
      this._bloomCtx.clearRect(0, 0, bw, bh);
      this._bloomCtx.drawImage(this.canvas, 0, 0, bw, bh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this._bloom, 0, 0, w, h);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(this._bloom, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Scanlines (subtle).
    if (!this._scan) {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 3;
      const cc = c.getContext('2d');
      cc.fillStyle = 'rgba(0,0,0,0.07)';
      cc.fillRect(0, 0, 1, 1);
      this._scan = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = this._scan;
    ctx.fillRect(0, 0, w, h);

    // Vignette.
    if (!this._vignette) {
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.92);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.58)');
      this._vignette = g;
    }
    ctx.fillStyle = this._vignette;
    ctx.fillRect(0, 0, w, h);
  }
}
