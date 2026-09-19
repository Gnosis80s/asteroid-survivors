// Fires owned weapons on cooldown and drives all secondary weapon behavior:
// orbital positioning, missile homing, beam damage, mine arming/detonation,
// and projectile lifetime.

import { WEAPON_MAP } from '../data/weapons.js';
import { damageEnemy, spawnExplosion } from '../combat.js';
import { angleDiff, dist2, TAU } from '../engine/math.js';

function nearestEnemy(world, x, y) {
  let best = -1;
  let bestD = Infinity;
  for (const id of world.query('enemy', 'transform')) {
    const t = world.get(id, 'transform');
    const d = dist2(x, y, t.x, t.y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function explodeMine(game, id) {
  const world = game.world;
  const mine = world.get(id, 'mine');
  const t = world.get(id, 'transform');
  if (!mine || !t || mine.dead) return;
  mine.dead = true;

  for (const eid of world.query('enemy', 'transform')) {
    const et = world.get(eid, 'transform');
    if (dist2(t.x, t.y, et.x, et.y) <= mine.radius * mine.radius) {
      damageEnemy(game, eid, mine.damage);
    }
  }
  spawnExplosion(game, t.x, t.y, 'mine', 22, 260, 4, 0.5);
  game.audio?.explosion?.();

  if (mine.chain) {
    const others = world.query('mine', 'transform').filter((o) => o !== id);
    for (const oid of others) {
      const ot = world.get(oid, 'transform');
      if (dist2(t.x, t.y, ot.x, ot.y) <= (mine.radius * 1.7) ** 2) explodeMine(game, oid);
    }
  }
  world.destroy(id);
}

export function updateWeapons(game, dt) {
  const world = game.world;
  const ship = world.get(game.playerId, 'transform');
  if (!ship) return;
  const ctx = { game, world, stats: game.stats, x: ship.x, y: ship.y, rot: ship.rot, time: game.time };

  // Fire owned weapons.
  for (const [wid, lvl] of game.build.weapons) {
    const def = WEAPON_MAP[wid];
    if (!def) continue;
    const st = game.weaponState.get(wid);
    if (!st) continue;
    st.cd -= dt;
    if (st.cd <= 0) {
      def.fire(ctx, lvl);
      st.cd = def.baseCooldown / game.stats.fireRateMult;
      if (def.fireSound) game.audio?.[def.fireSound]?.();
    }
  }

  // Position orbitals relative to the ship, and keep their radius/damage in
  // sync with current stats (so passives apply without a re-level).
  for (const oid of game.orbitalIds) {
    const ot = world.get(oid, 'transform');
    const o = world.get(oid, 'orbital');
    if (!ot || !o) continue;
    o.radius = o.baseRadius * game.stats.areaMult;
    o.damage = o.baseDamage * (1 + (o.level - 1) * 0.28) * game.stats.damageMult;
    const a = game.time * o.angularSpeed * o.dir + (o.index / o.count) * TAU;
    ot.x = ship.x + Math.cos(a) * o.radius;
    ot.y = ship.y + Math.sin(a) * o.radius;
    ot.rot = a;
  }

  // Homing steering.
  for (const id of world.query('homing', 'transform', 'motion')) {
    const h = world.get(id, 'homing');
    const t = world.get(id, 'transform');
    const m = world.get(id, 'motion');
    if (h.targetId < 0 || !world.get(h.targetId, 'enemy')) {
      h.targetId = nearestEnemy(world, t.x, t.y);
    }
    const et = world.get(h.targetId, 'transform');
    if (et) {
      const desired = Math.atan2(et.y - t.y, et.x - t.x);
      const d = angleDiff(t.rot, desired);
      const maxTurn = h.turnRate * dt;
      t.rot += Math.max(-maxTurn, Math.min(maxTurn, d));
      m.vx = Math.cos(t.rot) * h.speed;
      m.vy = Math.sin(t.rot) * h.speed;
    }
  }

  // Plasma aura: continuous contact damage around the ship.
  if (game.aura) {
    const r2 = game.aura.radius * game.aura.radius;
    for (const eid of world.query('enemy', 'transform')) {
      const e = world.get(eid, 'enemy');
      if (e.auraCooldown > 0) continue;
      const et = world.get(eid, 'transform');
      if (dist2(ship.x, ship.y, et.x, et.y) <= r2) {
        e.auraCooldown = 0.5;
        damageEnemy(game, eid, game.aura.damage);
      }
    }
  }

  // Beams: sweep + piercing damage against overlapping enemies.
  for (const id of world.query('beam', 'transform')) {
    const b = world.get(id, 'beam');
    const t = world.get(id, 'transform');
    b.ttl -= dt;
    if (b.sweep) t.rot += b.sweep * dt;
    for (const eid of world.query('enemy', 'transform')) {
      if (b.hitSet.has(eid)) continue;
      const et = world.get(eid, 'transform');
      const ec = world.get(eid, 'collider');
      const r = ec ? ec.radius : 0;
      const dx = et.x - t.x, dy = et.y - t.y;
      const proj = dx * Math.cos(t.rot) + dy * Math.sin(t.rot);
      if (proj < 0 || proj > b.length) continue;
      const perp = Math.abs(-dx * Math.sin(t.rot) + dy * Math.cos(t.rot));
      if (perp <= b.width / 2 + r) {
        b.hitSet.add(eid);
        damageEnemy(game, eid, b.damage);
      }
    }
    if (b.ttl <= 0) world.destroy(id);
  }

  // Mines.
  for (const id of world.query('mine', 'transform')) {
    const mine = world.get(id, 'mine');
    const t = world.get(id, 'transform');
    if (!mine.armed && game.time >= mine.armedAt) {
      mine.armed = true;
      game.audio?.mineArm?.();
    }
    mine.life -= dt;
    if (mine.life <= 0) {
      world.destroy(id);
      continue;
    }
    if (mine.armed) {
      let triggered = false;
      for (const eid of world.query('enemy', 'transform')) {
        const et = world.get(eid, 'transform');
        if (dist2(t.x, t.y, et.x, et.y) <= mine.radius * mine.radius) {
          triggered = true;
          break;
        }
      }
      if (triggered) explodeMine(game, id);
    }
  }

  // Projectile lifetime.
  for (const id of world.query('bullet')) {
    const b = world.get(id, 'bullet');
    b.ttl -= dt;
    if (b.ttl <= 0) world.destroy(id);
  }

  // Chain-lightning bolt lifetime.
  for (const id of world.query('bolt')) {
    const b = world.get(id, 'bolt');
    b.ttl -= dt;
    if (b.ttl <= 0) world.destroy(id);
  }
}
