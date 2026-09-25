// Circle-collision resolution via spatial-hash broad phase. Handles:
// player bullets/missiles -> targets, orbitals -> targets, enemy bullets ->
// player, and enemy contact -> player.

import { SpatialHash } from '../engine/spatialHash.js';
import { damageTarget, damagePlayer, spawnMicro, spawnExplosion } from '../combat.js';
import { dist2 } from '../engine/math.js';

export function updateCollision(game, dt) {
  const world = game.world;
  const hash = new SpatialHash(72);

  const playerBullets = [];
  const enemyBullets = [];
  const orbitals = [];

  for (const id of world.query('collider', 'transform')) {
    const c = world.get(id, 'collider');
    const t = world.get(id, 'transform');
    hash.insert(id, t.x, t.y, c.radius);
    if (world.has(id, 'bullet')) playerBullets.push(id);
    else if (world.has(id, 'enemyBullet')) enemyBullets.push(id);
    else if (world.has(id, 'orbital')) orbitals.push(id);
  }

  const querySet = new Set();

  // Player projectiles -> enemies, objectives, and enemy projectiles.
  for (const bid of playerBullets) {
    const bt = world.get(bid, 'transform');
    const bc = world.get(bid, 'collider');
    const b = world.get(bid, 'bullet');
    if (!bt || !bc || !b) continue;
    hash.query(bt.x, bt.y, bc.radius, querySet);
    for (const eid of querySet) {
      if (eid === bid) continue;
      const et = world.get(eid, 'transform');
      const ec = world.get(eid, 'collider');
      if (!et || !ec) continue;
      if (dist2(bt.x, bt.y, et.x, et.y) > (bc.radius + ec.radius) ** 2) continue;

      const isEnemy = world.has(eid, 'enemy');
      const isObjective = world.has(eid, 'objective');
      const isBullet = world.has(eid, 'enemyBullet');
      if (!isEnemy && !isObjective && !isBullet) continue;

      if (isEnemy || isObjective) {
        if (b.hitIds) {
          if (b.hitIds.has(eid)) continue;
        } else {
          b.hitIds = new Set();
        }
        b.hitIds.add(eid);
        damageTarget(game, eid, b.damage);
        if (b.split) {
          for (let i = 0; i < b.split.count; i++) {
            const base = Math.atan2(et.y - bt.y, et.x - bt.x);
            spawnMicro(game, {
              x: bt.x, y: bt.y, angle: base + (Math.random() - 0.5) * 1.4,
              speed: 380, damage: b.damage * 0.5, homing: b.split.homing,
            });
          }
        }
      } else {
        spawnExplosion(game, et.x, et.y, 'enemyBullet', 5, 120, 2, 0.28);
        world.destroy(eid);
      }

      if (b.pierce > 0) {
        b.pierce--;
        continue; // keep scanning for fresh targets this frame
      }
      world.destroy(bid);
      break;
    }
  }

  // Orbitals -> targets (contact, rate-limited).
  for (const oid of orbitals) {
    const ot = world.get(oid, 'transform');
    const oc = world.get(oid, 'collider');
    hash.query(ot.x, ot.y, oc.radius, querySet);
    for (const eid of querySet) {
      if (!world.has(eid, 'enemy') && !world.has(eid, 'objective')) continue;
      const e = world.get(eid, 'enemy') || world.get(eid, 'objective');
      if (e.orbCooldown > 0) continue;
      const et = world.get(eid, 'transform');
      const ec = world.get(eid, 'collider');
      if (dist2(ot.x, ot.y, et.x, et.y) > (oc.radius + ec.radius) ** 2) continue;
      damageTarget(game, eid, world.get(oid, 'orbital').damage);
      e.orbCooldown = 0.4;
    }
  }

  const pt = world.get(game.playerId, 'transform');
  const pc = world.get(game.playerId, 'collider');
  if (!pt || !pc) return;

  // Enemy bullets -> player.
  for (const ebid of enemyBullets) {
    const bt = world.get(ebid, 'transform');
    if (!bt) continue;
    if (dist2(bt.x, bt.y, pt.x, pt.y) <= (pc.radius + 3) ** 2) {
      damagePlayer(game, world.get(ebid, 'enemyBullet').damage);
      world.destroy(ebid);
    }
  }

  // Enemy contact -> player.
  hash.query(pt.x, pt.y, pc.radius, querySet);
  for (const eid of querySet) {
    if (!world.has(eid, 'enemy')) continue;
    const et = world.get(eid, 'transform');
    const ec = world.get(eid, 'collider');
    if (dist2(pt.x, pt.y, et.x, et.y) <= (pc.radius + ec.radius) ** 2) {
      damagePlayer(game, world.get(eid, 'enemy').contactDamage);
    }
  }
}
