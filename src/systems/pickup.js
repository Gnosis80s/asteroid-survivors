// Gem/heart/chest magnetism and collection. Pickup range scales with the
// Magnet Coil passive and character/meta bonuses.

import { CONFIG } from '../config.js';
import { addXp } from '../combat.js';
import { dist, angleTo } from '../engine/math.js';

export function updatePickups(game, dt) {
  const world = game.world;
  const pt = world.get(game.playerId, 'transform');
  if (!pt) return;

  const range = CONFIG.pickup.baseMagnet * game.stats.pickupRange;

  for (const id of world.query('pickup', 'transform', 'motion')) {
    const p = world.get(id, 'pickup');
    const t = world.get(id, 'transform');
    const m = world.get(id, 'motion');
    const d = dist(pt.x, pt.y, t.x, t.y);

    if (!p.magnet && p.kind !== 'chest' && d < range) {
      p.magnet = true;
      m.drag = 0;
    }
    if (p.magnet) {
      const a = angleTo(t.x, t.y, pt.x, pt.y);
      const sp = 680;
      m.vx = Math.cos(a) * sp;
      m.vy = Math.sin(a) * sp;
    }
    if (d < CONFIG.pickup.collectRadius) {
      collect(game, id, p);
    }
  }
}

function collect(game, id, p) {
  const world = game.world;
  if (p.kind === 'gem') {
    addXp(game, p.value);
    game.audio?.pickup?.();
  } else if (p.kind === 'heart') {
    game.hp = Math.min(game.stats.maxHp, game.hp + CONFIG.pickup.heartHeal);
    game.audio?.pickup?.();
  } else if (p.kind === 'chest') {
    game.onChest?.();
  } else if (p.kind === 'magnet') {
    // Super magnet: pull every on-screen XP gem toward the player.
    for (const gid of world.query('pickup', 'motion')) {
      const gp = world.get(gid, 'pickup');
      if (gp.kind === 'gem' && !gp.magnet) {
        gp.magnet = true;
        world.get(gid, 'motion').drag = 0;
      }
    }
    game.audio?.pickup?.();
  }
  world.destroy(id);
}
