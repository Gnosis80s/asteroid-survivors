// World rendering: draws every entity through the vector renderer in world
// space. The renderer's camera transform makes the screen a moving viewport
// onto the larger bounded world; this module culls to the visible region and
// enforces the readability rules (color hierarchy, glow budget, focus
// falloff) defined in the design doc.

import { CONFIG } from '../config.js';
import { TAU } from '../engine/math.js';

// Stars are scattered across the whole world (density matches the old
// screen-space field), so it smoothly scrolls as the camera moves.
let stars = null;
function starfield() {
  if (stars) return stars;
  stars = [];
  const areaRatio = (CONFIG.world.width * CONFIG.world.height) / (CONFIG.WIDTH * CONFIG.HEIGHT);
  const count = Math.round(CONFIG.render.starCount * areaRatio);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * CONFIG.world.width,
      y: Math.random() * CONFIG.world.height,
      s: Math.random() < 0.8 ? 1 : 2,
      a: Math.random() * 0.5 + 0.1,
    });
  }
  return stars;
}

function drawStarfield(r, cam) {
  const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + CONFIG.WIDTH, vy1 = cam.y + CONFIG.HEIGHT;
  for (const st of starfield()) {
    if (st.x < vx0 || st.x > vx1 || st.y < vy0 || st.y > vy1) continue;
    r.circle(st.x, st.y, st.s, { color: 'playerDim', alpha: st.a, width: 1 });
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

  r.polygon(pts, { color: render.color, width: 2, fill: true, alpha, glow: 1 });
}

function drawAsteroid(r, t, render, alpha) {
  const pts = rotPoints(render.points, t.rot).map(([x, y]) => [x + t.x, y + t.y]);
  r.polygon(pts, { color: render.color, width: 2, alpha, glow: render.glow || 0 });
}

function drawAlienShip(r, game, t, render, alpha) {
  const size = render.size;
  const color = render.color;
  const glow = render.glow || 0;
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  const L = (lx, ly) => [t.x + lx * c - ly * s, t.y + lx * s + ly * c];
  const P = (pts) => rotPoints(pts, t.rot).map(([px, py]) => [px + t.x, py + t.y]);
  const pulse = 0.75 + Math.sin(game.time * 2.4) * 0.2;
  const hull = [
    [size * 1.15, 0],
    [size * 0.35, size * 0.7],
    [-size * 0.3, size * 0.88],
    [-size * 0.92, size * 0.48],
    [-size * 0.62, 0],
    [-size * 0.92, -size * 0.48],
    [-size * 0.3, -size * 0.88],
    [size * 0.35, -size * 0.7],
  ];

  r.polygon(P(hull), { color, width: 2.5, fill: true, alpha, glow });
  r.circle(t.x, t.y, size * 0.52, { color, width: 2, alpha: alpha * 0.95, glow });
  r.circle(t.x, t.y, size * 0.34, { color: 'white', width: 1.5, alpha: alpha * 0.85, glow: 1 });
  r.circle(t.x, t.y, size * 0.15, { color: 'enemyBullet', width: 1.5, fill: true, alpha: alpha * pulse, glow: 1 });

  for (const [lx, ly] of [[-size * 0.55, size * 0.55], [size * 0.55, size * 0.55], [-size * 0.55, -size * 0.55], [size * 0.55, -size * 0.55]]) {
    const p = L(lx, ly);
    r.circle(p[0], p[1], size * 0.12, { color, width: 1.5, alpha, glow: 1 });
  }

  const nose = L(size * 1.15, 0);
  const tip = L(size * 1.65, 0);
  r.line(nose[0], nose[1], tip[0], tip[1], { color, width: 2, alpha, glow: 1 });
  r.circle(tip[0], tip[1], 2.5, { color: 'enemyBullet', width: 1.5, alpha: alpha * pulse, fill: true, glow: 1 });

  for (let i = 0; i < 3; i++) {
    const a = game.time * 1.8 + (i / 3) * TAU;
    const p = L(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
    r.circle(p[0], p[1], 3, { color: 'enemyBullet', width: 1.5, alpha: alpha * pulse, glow: 1 });
  }
}

function drawSaucer(r, t, render, alpha, enemyType) {
  const size = render.size;
  const color = render.color;
  const glow = render.glow || 0;
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  const L = (lx, ly) => [t.x + lx * c - ly * s, t.y + lx * s + ly * c];

  r.circle(t.x, t.y, size, { color, width: 2, alpha, glow });
  r.circle(t.x, t.y, size * 0.5, { color, width: 1.5, alpha: alpha * 0.9 });

  if (enemyType === 'saucer_gunner' || enemyType === 'boss_warden') {
    const a = L(size * 0.25, 0);
    const b = L(size * 1.3, 0);
    r.line(a[0], a[1], b[0], b[1], { color, width: 2, alpha });
    r.circle(b[0], b[1], 1.5, { color, width: 1, alpha });
  }

  if (enemyType === 'saucer_gunner') {
    const l1 = L(-size * 0.1, -size * 0.55);
    const l2 = L(-size * 0.1, -size * 1.05);
    const r1 = L(-size * 0.1, size * 0.55);
    const r2 = L(-size * 0.1, size * 1.05);
    r.line(l1[0], l1[1], l2[0], l2[1], { color, width: 2, alpha });
    r.line(r1[0], r1[1], r2[0], r2[1], { color, width: 2, alpha });
  }

  if (enemyType === 'boss_warden') {
    r.circle(t.x, t.y, size * 0.68, { color, width: 1.5, alpha: alpha * 0.7 });
    for (const a of [-2.4, -0.8, 0.8, 2.4]) {
      const tp = L(Math.cos(a) * size * 0.85, Math.sin(a) * size * 0.85);
      r.circle(tp[0], tp[1], 2.2, { color, width: 1.5, alpha });
    }
  }
}

function drawShard(r, t, render, alpha) {
  const pts = rotPoints([[0, -render.size], [render.size * 0.7, render.size * 0.7], [-render.size * 0.7, render.size * 0.7]], t.rot)
    .map(([x, y]) => [x + t.x, y + t.y]);
  r.polygon(pts, { color: render.color, width: 2, fill: true, alpha, glow: render.glow || 0 });
}

function drawObjective(r, game, t, objective) {
  const pulse = 0.6 + Math.sin(game.time * 3) * 0.4;
  const size = 12;
  r.line(t.x, t.y - 56, t.x, t.y - 10, { color: 'chest', width: 2, alpha: 0.3 * pulse, glow: 2 });
  r.circle(t.x, t.y - 56, 3, { color: 'chest', width: 1, alpha: pulse, glow: 1 });
  const pts = rotPoints([[0, -size], [size, 0], [0, size], [-size, 0]], game.time * 1.5)
    .map(([x, y]) => [x + t.x, y + t.y]);
  r.polygon(pts, { color: 'chest', width: 2, fill: true, alpha: 0.95, glow: 2 });
  const fraction = Math.max(0, Math.min(1, objective.hp / objective.maxHp));
  const barW = 44, barH = 4, barX = t.x - barW / 2, barY = t.y + 20;
  r.rect(barX, barY, barW, barH, { color: 'bg', alpha: 0.9 });
  if (fraction > 0) r.rect(barX + 1, barY + 1, (barW - 2) * fraction, barH - 2, { color: 'chest', alpha: 0.95 });
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
  const cam = game.camera || { x: 0, y: 0 };
  const shake = game.shake || 0;
  r.setShake((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  r.setCamera(cam.x, cam.y);
  r.begin();
  drawStarfield(r, cam);

  // World boundary frame — visible only where the camera hugs a world edge.
  r.polygon([
    [0, 0],
    [CONFIG.world.width, 0],
    [CONFIG.world.width, CONFIG.world.height],
    [0, CONFIG.world.height],
  ], { color: 'uiDim', width: 2, alpha: 0.35 });

  const viewX0 = cam.x - 120, viewY0 = cam.y - 120;
  const viewX1 = cam.x + CONFIG.WIDTH + 120, viewY1 = cam.y + CONFIG.HEIGHT + 120;
  const visible = (x, y) => x >= viewX0 && x <= viewX1 && y >= viewY0 && y <= viewY1;

  const focus = CONFIG.render.focusFalloffRadius;
  const playerX = pt ? pt.x : cam.x + CONFIG.WIDTH / 2;
  const playerY = pt ? pt.y : cam.y + CONFIG.HEIGHT / 2;

  // Beams first (under everything): thin bright core + glowing halo.
  for (const id of world.query('beam', 'transform')) {
    const b = world.get(id, 'beam');
    const t = world.get(id, 'transform');
    if (!visible(t.x, t.y)) continue;
    const x2 = t.x + Math.cos(t.rot) * b.length;
    const y2 = t.y + Math.sin(t.rot) * b.length;
    r.line(t.x, t.y, x2, y2, { color: b.color, width: b.width * 0.45, alpha: 0.35, glow: 3 });
    r.line(t.x, t.y, x2, y2, { color: 'white', width: 2.5, alpha: 0.9 });
  }

  // Mines.
  for (const id of world.query('mine', 'transform')) {
    const m = world.get(id, 'mine');
    const t = world.get(id, 'transform');
    if (!visible(t.x, t.y)) continue;
    const pulse = m.armed ? 0.6 + Math.sin(game.time * 12) * 0.4 : 0.4;
    r.circle(t.x, t.y, m.armed ? 8 : 6, { color: 'mine', width: 2, alpha: pulse, glow: m.armed ? 1 : 0 });
    r.circle(t.x, t.y, 2, { color: 'mine', width: 1, fill: true, alpha: pulse });
  }

  // Pickups.
  for (const id of world.query('pickup', 'transform')) {
    const p = world.get(id, 'pickup');
    const t = world.get(id, 'transform');
    if (!visible(t.x, t.y)) continue;
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

  // Objective beacons (drawn above pickups).
  for (const id of world.query('objective', 'transform')) {
    const t = world.get(id, 'transform');
    const objective = world.get(id, 'objective');
    if (!visible(t.x, t.y)) continue;
    drawObjective(r, game, t, objective);
  }

  // Enemies (asteroids, saucers, shards, bosses) with focus falloff.
  for (const id of world.query('enemy', 'transform')) {
    const t = world.get(id, 'transform');
    if (!visible(t.x, t.y)) continue;
    const render = world.get(id, 'render');
    const enemy = world.get(id, 'enemy');
    const dx = t.x - playerX, dy = t.y - playerY;
    const d = Math.hypot(dx, dy);
    let alpha = 1;
    if (d > focus) alpha = Math.max(0.3, 1 - (d - focus) / 900);
    if (render.type === 'asteroid' || render.type === 'boss') drawAsteroid(r, t, render, alpha);
    else if (render.type === 'alienShip') drawAlienShip(r, game, t, render, alpha);
    else if (render.type === 'saucer') drawSaucer(r, t, render, alpha, enemy.type);
    else if (render.type === 'shard') drawShard(r, t, render, alpha);
  }

  // Orbitals.
  for (const id of world.query('orbital', 'transform')) {
    const t = world.get(id, 'transform');
    const o = world.get(id, 'orbital');
    if (!visible(t.x, t.y)) continue;
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
    if (!visible(t.x, t.y)) continue;
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
    if (!visible(t.x, t.y)) continue;
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
    if (!visible(t.x, t.y)) continue;
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

  // Restore screen space before any HUD/UI draws.
  r.screen();
}
