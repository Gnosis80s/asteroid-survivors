// Integrates position/rotation for everything with transform+motion, applies
// screen wrapping and pickup drag, and decays transient timers (flash,
// spawn-shield, invulnerability).

import { CONFIG } from '../config.js';
import { wrapX, wrapY } from '../engine/math.js';

export function updateMovement(game, dt) {
  const world = game.world;
  const wrapEnabled = game.settings ? game.settings.wrap !== false : true;

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
    if (m.wrap) {
      if (wrapEnabled) {
        t.x = wrapX(t.x, CONFIG.WIDTH);
        t.y = wrapY(t.y, CONFIG.HEIGHT);
      } else {
        if (t.x < 0) { t.x = 0; m.vx = Math.abs(m.vx); }
        else if (t.x > CONFIG.WIDTH) { t.x = CONFIG.WIDTH; m.vx = -Math.abs(m.vx); }
        if (t.y < 0) { t.y = 0; m.vy = Math.abs(m.vy); }
        else if (t.y > CONFIG.HEIGHT) { t.y = CONFIG.HEIGHT; m.vy = -Math.abs(m.vy); }
      }
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
