// Integrates position/rotation for everything with transform+motion and
// applies the bounded-world rules: the player is clamped to the world edges,
// enemies bounce off them (so they stay in the playable area), and everything
// else just drifts (projectiles/pickups die or despawn on their own timers).

import { CONFIG } from '../config.js';

export function updateMovement(game, dt) {
  const world = game.world;
  const W = CONFIG.world.width, H = CONFIG.world.height;

  for (const id of world.query('transform', 'motion')) {
    const t = world.get(id, 'transform');
    const m = world.get(id, 'motion');
    if (m.drag) {
      const f = Math.max(0, 1 - m.drag * dt);
      m.vx *= f;
      m.vy *= f;
    }
    t.x += m.vx * dt;
    t.y += m.vy * dt;
    t.rot += (m.vrot || 0) * dt;

    if (world.has(id, 'player')) {
      // The ship stops at the world boundary (bounded world, no wrap).
      if (t.x < 0) t.x = 0;
      else if (t.x > W) t.x = W;
      if (t.y < 0) t.y = 0;
      else if (t.y > H) t.y = H;
    } else if (m.bounce) {
      // Enemies bounce off the world edges instead of wrapping.
      if (t.x < 0) { t.x = 0; m.vx = Math.abs(m.vx); }
      else if (t.x > W) { t.x = W; m.vx = -Math.abs(m.vx); }
      if (t.y < 0) { t.y = 0; m.vy = Math.abs(m.vy); }
      else if (t.y > H) { t.y = H; m.vy = -Math.abs(m.vy); }
    }
  }

  // Decay hit flashes.
  for (const id of world.query('flash')) {
    const f = world.get(id, 'flash');
    f.ttl -= dt;
    if (f.ttl <= 0) world.remove(id, 'flash');
  }

  // Decay enemy arrival grace.
  for (const id of world.query('spawnShield')) {
    const s = world.get(id, 'spawnShield');
    s.ttl -= dt;
    if (s.ttl <= 0) world.remove(id, 'spawnShield');
  }

  if (game.invuln > 0) game.invuln -= dt;

  // Hull regeneration (Nanite Repair passive).
  if (game.stats && game.stats.regen > 0 && game.hp > 0 && game.hp < game.stats.maxHp) {
    game.hp = Math.min(game.stats.maxHp, game.hp + game.stats.regen * dt);
  }
}
