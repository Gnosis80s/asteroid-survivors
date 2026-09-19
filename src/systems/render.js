// World rendering: draws every entity through the vector renderer, enforcing
// the readability rules (color hierarchy, glow budget, focus falloff, wrap
// ghosting) defined in the design doc.

import { CONFIG } from '../config.js';
import { TAU } from '../engine/math.js';

let stars = null;
function starfield() {
  if (stars) return stars;
  stars = [];
  for (let i = 0; i < CONFIG.render.starCount; i++) {
    stars.push({
      x: Math.random() * CONFIG.WIDTH,
      y: Math.random() * CONFIG.HEIGHT,
      s: Math.random() < 0.8 ? 1 : 2,
      a: Math.random() * 0.5 + 0.1,
    });
  }
  return stars;
}

function drawStarfield(r) {
  for (const st of starfield()) {
    r.circle(st.x, st.y, st.s, { color: 'playerDim', alpha: st.a, width: 1 });
  }
}

function drawWrapped(x, y, pad, fn) {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  fn(x, y);
  if (x < pad) fn(x + W, y);
  else if (x > W - pad) fn(x - W, y);
  if (y < pad) fn(x, y + H);
  else if (y > H - pad) fn(x, y - H);
  if ((x < pad || x > W - pad) && (y < pad || y > H - pad)) {
    fn(x + (x < pad ? W : -W), y + (y < pad ? H : -H));
  }
}

function rotPoints(points, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const out = [];
  for (const [x, y] of points) {
    out.push([x * c - y * s, x * s + y * c]);
  }
  return out;
}

function drawShip(r, game, t, render) {
  const size = render.size;
  const pts = rotPoints([
    [size * 1.35, 0],
    [-size, -size * 0.95],
    [-size * 0.55, 0],
    [-size, size * 0.95],
  ], t.rot).map(([x, y]) => [x + t.x, y + t.y]);

  let alpha = 1;
  if (game.invuln > 0) alpha = Math.sin(game.time * 40) > 0 ? 0.35 : 0.9;

  drawWrapped(t.x, t.y, size, (x, y) => {
    const off = pts.map(([px, py]) => [px + (x - t.x), py + (y - t.y)]);
    r.polygon(off, { color: render.color, width: 2, fill: true, alpha, glow: 1 });
  });
}

function drawAsteroid(r, t, render, alpha) {
  const pts = rotPoints(render.points, t.rot).map(([x, y]) => [x + t.x, y + t.y]);
  const style = { color: render.color, width: 2, alpha, glow: render.glow || 0 };
  drawWrapped(t.x, t.y, render.size, (x, y) => {
    const off = pts.map(([px, py]) => [px + (x - t.x), py + (y - t.y)]);
    r.polygon(off, style);
  });
}

function drawSaucer(r, t, render, alpha, enemyType) {
  const size = render.size;
  const color = render.color;
  const glow = render.glow || 0;

  const ellipse = (rx, ry) => {
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
    return pts;
  };

  const body = ellipse(size, size * 0.42);
  const cockpit = ellipse(size * 0.5, size * 0.21);

  drawWrapped(t.x, t.y, size, (x, y) => {
    const L = (lx, ly) => {
      const c = Math.cos(t.rot), s = Math.sin(t.rot);
      return [x + lx * c - ly * s, y + lx * s + ly * c];
    };
    const LP = (pts) => rotPoints(pts, t.rot).map(([px, py]) => [px + x, py + y]);

    // Body + cockpit.
    r.polygon(LP(body), { color, width: 2, alpha, glow });
    r.polygon(LP(cockpit), { color, width: 1.5, alpha: alpha * 0.9 });

    if (enemyType === 'saucer_gunner' || enemyType === 'boss_warden') {
      // Forward cannon + muzzle.
      const a = L(size * 0.25, 0);
      const b = L(size * 1.3, 0);
      r.line(a[0], a[1], b[0], b[1], { color, width: 2, alpha });
      r.circle(b[0], b[1], 1.5, { color, width: 1, alpha });
    }

    if (enemyType === 'saucer_gunner') {
      // Side wing guns.
      const l1 = L(-size * 0.1, -size * 0.42);
      const l2 = L(-size * 0.1, -size * 0.92);
      const r1 = L(-size * 0.1, size * 0.42);
      const r2 = L(-size * 0.1, size * 0.92);
      r.line(l1[0], l1[1], l2[0], l2[1], { color, width: 2, alpha });
      r.line(r1[0], r1[1], r2[0], r2[1], { color, width: 2, alpha });
    }

    if (enemyType === 'boss_warden') {
      // Inner ring + turret emplacements.
      r.polygon(LP(ellipse(size * 0.68, size * 0.28)), { color, width: 1.5, alpha: alpha * 0.7 });
      for (const a of [-2.4, -0.8, 0.8, 2.4]) {
        const tp = L(Math.cos(a) * size * 0.85, Math.sin(a) * size * 0.42 * 0.85);
        r.circle(tp[0], tp[1], 2.2, { color, width: 1.5, alpha });
      }
    }
  });
}

function drawShard(r, t, render, alpha) {
  const pts = rotPoints([[0, -render.size], [render.size * 0.7, render.size * 0.7], [-render.size * 0.7, render.size * 0.7]], t.rot)
    .map(([x, y]) => [x + t.x, y + t.y]);
  r.polygon(pts, { color: render.color, width: 2, fill: true, alpha, glow: render.glow || 0 });
}

function drawBolt(r, b, alpha) {
  const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const n = 5;
  const pts = [[b.x1, b.y1]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const j = (Math.random() - 0.5) * 14;
    pts.push([b.x1 + dx * t + nx * j, b.y1 + dy * t + ny * j]);
  }
  pts.push([b.x2, b.y2]);
  r.polyline(pts, { color: 'playerBullet', width: 2, alpha, glow: 1 });
}

export function renderWorld(game, r) {
  const world = game.world;
  const pt = world.get(game.playerId, 'transform');
  const shake = game.shake || 0;
  r.setShake((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  r.begin();
  drawStarfield(r);

  const focus = CONFIG.render.focusFalloffRadius;
  const playerX = pt ? pt.x : CONFIG.WIDTH / 2;
  const playerY = pt ? pt.y : CONFIG.HEIGHT / 2;

  // Beams first (under everything): thin bright core + glowing halo.
  for (const id of world.query('beam', 'transform')) {
    const b = world.get(id, 'beam');
    const t = world.get(id, 'transform');
    const x2 = t.x + Math.cos(t.rot) * b.length;
    const y2 = t.y + Math.sin(t.rot) * b.length;
    r.line(t.x, t.y, x2, y2, { color: b.color, width: b.width * 0.45, alpha: 0.35, glow: 3 });
    r.line(t.x, t.y, x2, y2, { color: 'white', width: 2.5, alpha: 0.9 });
  }

  // Mines.
  for (const id of world.query('mine', 'transform')) {
    const m = world.get(id, 'mine');
    const t = world.get(id, 'transform');
    const pulse = m.armed ? 0.6 + Math.sin(game.time * 12) * 0.4 : 0.4;
    r.circle(t.x, t.y, m.armed ? 8 : 6, { color: 'mine', width: 2, alpha: pulse, glow: m.armed ? 1 : 0 });
    r.circle(t.x, t.y, 2, { color: 'mine', width: 1, fill: true, alpha: pulse });
  }

  // Pickups.
  for (const id of world.query('pickup', 'transform')) {
    const p = world.get(id, 'pickup');
    const t = world.get(id, 'transform');
    const rd = world.get(id, 'render');
    const s = rd.size;
    if (p.kind === 'gem') {
      const pts = rotPoints([[0, -s], [s, 0], [0, s], [-s, 0]], t.rot)
        .map(([x, y]) => [x + t.x, y + t.y]);
      r.polygon(pts, { color: rd.color, width: 1.5, alpha: 0.95, glow: rd.glow });
    } else if (p.kind === 'heart') {
      r.circle(t.x, t.y, s, { color: 'heart', width: 2, fill: true, alpha: 0.95, glow: 1 });
    } else if (p.kind === 'magnet') {
      r.circle(t.x, t.y, s, { color: 'vacuum', width: 2, alpha: 0.95, glow: 2 });
      r.circle(t.x, t.y, s * 0.45, { color: 'white', width: 1, alpha: 0.8 });
    } else {
      const hex = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t.rot;
        hex.push([t.x + Math.cos(a) * s, t.y + Math.sin(a) * s]);
      }
      r.polygon(hex, { color: 'chest', width: 2, fill: true, alpha: 0.95, glow: 2 });
      r.circle(t.x, t.y, s * 0.28, { color: 'chest', width: 1, fill: true, alpha: 0.85 });
    }
  }

  // Enemies (asteroids, saucers, shards, bosses) with focus falloff.
  for (const id of world.query('enemy', 'transform')) {
    const t = world.get(id, 'transform');
    const render = world.get(id, 'render');
    const enemy = world.get(id, 'enemy');
    const dx = t.x - playerX, dy = t.y - playerY;
    const d = Math.hypot(dx, dy);
    let alpha = 1;
    if (d > focus) alpha = Math.max(0.3, 1 - (d - focus) / 900);
    if (render.type === 'asteroid' || render.type === 'boss') drawAsteroid(r, t, render, alpha);
    else if (render.type === 'saucer') drawSaucer(r, t, render, alpha, enemy.type);
    else if (render.type === 'shard') drawShard(r, t, render, alpha);
  }

  // Orbitals.
  for (const id of world.query('orbital', 'transform')) {
    const t = world.get(id, 'transform');
    const o = world.get(id, 'orbital');
    r.circle(t.x, t.y, 7, { color: 'orbital', width: 2, alpha: 0.9, glow: 1 });
    r.circle(t.x, t.y, 2, { color: 'orbital', width: 1, fill: true, alpha: 0.9 });
  }

  // Plasma aura field (faint ring around the ship).
  if (game.aura && pt) {
    const pulse = 1 + Math.sin(game.time * 6) * 0.04;
    r.circle(pt.x, pt.y, game.aura.radius * pulse, { color: 'orbital', width: 2, alpha: 0.28 });
  }

  // Player bullets (homing missiles render as little darts, blaster shots
  // as orange teardrops).
  for (const id of world.query('bullet', 'transform')) {
    const t = world.get(id, 'transform');
    const rd = world.get(id, 'render');
    const s = rd.size;
    if (world.has(id, 'homing')) {
      const d = s;
      const local = [
        [d * 2.2, 0], [d * 0.1, d * 0.5], [-d * 0.9, d * 0.5], [-d * 1.6, d * 1.0],
        [-d * 1.3, 0], [-d * 1.6, -d * 1.0], [-d * 0.9, -d * 0.5], [d * 0.1, -d * 0.5],
      ];
      const pts = rotPoints(local, t.rot).map(([x, y]) => [x + t.x, y + t.y]);
      r.polygon(pts, { color: rd.color, width: 1.5, fill: true, alpha: 1, glow: 1 });
    } else if (rd.shape === 'teardrop') {
      const local = [
        [s * 1.7, 0], [s * 0.5, s * 0.9], [-s * 0.4, s * 1.0], [-s * 1.0, s * 0.55],
        [-s * 1.15, 0], [-s * 1.0, -s * 0.55], [-s * 0.4, -s * 1.0], [s * 0.5, -s * 0.9],
      ];
      const pts = rotPoints(local, t.rot).map(([x, y]) => [x + t.x, y + t.y]);
      r.polygon(pts, { color: rd.color, width: 1, fill: true, alpha: 1, glow: 1 });
    } else {
      r.circle(t.x, t.y, s, { color: rd.color, width: 1, fill: true, alpha: 1 });
    }
  }

  // Chain-lightning bolts.
  for (const id of world.query('bolt')) {
    const b = world.get(id, 'bolt');
    drawBolt(r, b, Math.max(0, b.ttl / 0.16));
  }

  // Enemy bullets — always brightest, drawn on top.
  for (const id of world.query('enemyBullet', 'transform')) {
    const t = world.get(id, 'transform');
    const s = world.get(id, 'render').size;
    r.circle(t.x, t.y, s + 3, { color: 'enemyBullet', width: 2, alpha: 0.5, glow: 2 });
    r.circle(t.x, t.y, s, { color: 'enemyBullet', width: 1, fill: true, alpha: 1 });
  }

  // Player ship on top of everything.
  if (pt) {
    const render = world.get(game.playerId, 'render');
    drawShip(r, game, pt, render);
  }

  // Particles last.
  for (const id of world.query('particle', 'transform')) {
    const p = world.get(id, 'particle');
    const t = world.get(id, 'transform');
    const a = Math.max(0, p.life / p.maxLife);
    if (p.shape === 'ring') {
      r.circle(t.x, t.y, p.size, { color: p.color, width: 2, alpha: a, glow: 0 });
    } else {
      r.circle(t.x, t.y, p.size, { color: p.color, width: 1, fill: true, alpha: a });
    }
  }

  // Hit flashes on top of particles.
  for (const id of world.query('flash')) {
    const f = world.get(id, 'flash');
    const t = world.get(id, 'transform');
    const c = world.get(id, 'collider');
    if (t && c) r.circle(t.x, t.y, c.radius, { color: f.color, width: 2, alpha: 0.7, fill: true });
  }
}
