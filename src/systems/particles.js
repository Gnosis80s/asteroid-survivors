// Particle life/progress. Particles are capped at spawn time by the combat
// helpers via the world's particle budget check in render (oldest die first).

import { CONFIG } from '../config.js';

export function updateParticles(game, dt) {
  const world = game.world;
  for (const id of world.query('particle', 'transform')) {
    const p = world.get(id, 'particle');
    const t = world.get(id, 'transform');
    p.life -= dt;
    if (p.life <= 0) {
      world.destroy(id);
      continue;
    }
    if (p.drag) {
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f;
      p.vy *= f;
    }
    t.x += p.vx * dt;
    t.y += p.vy * dt;
    t.rot += dt * 5;
  }

  // Global particle budget: if over cap, cull oldest.
  const ids = world.query('particle');
  if (ids.length > CONFIG.render.particleCap) {
    ids.sort((a, b) => world.get(a, 'particle').life - world.get(b, 'particle').life);
    for (let i = 0; i < ids.length - CONFIG.render.particleCap; i++) {
      world.destroy(ids[i]);
    }
  }
}
