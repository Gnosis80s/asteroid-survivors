// Enemy behaviors, gated by the off-screen arrival grace so nothing attacks
// the instant it spawns. Also manages enemy-bullet lifetime.

import { CONFIG } from '../config.js';
import { spawnEnemyBullet, spawnEnemy } from '../combat.js';
import { angleTo, TAU, rand, dist2 } from '../engine/math.js';

function fireAimed(game, x, y, speed, count = 1, spread = 0.1) {
  const ship = game.world.get(game.playerId, 'transform');
  if (!ship) return;
  const base = angleTo(x, y, ship.x, ship.y);
  for (let i = 0; i < count; i++) {
    const a = base + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spread);
    spawnEnemyBullet(game, {
      x, y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      damage: 12, radius: 4,
    });
  }
}

function fireRing(game, x, y, count, speed, offset = 0) {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    spawnEnemyBullet(game, {
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      damage: 14, radius: 4,
    });
  }
}

function updateBoss(game, id, e, t, m, dt, ship) {
  const st = e.state;
  st.phaseTimer = (st.phaseTimer ?? 0) - dt;

  if (e.ai === 'boss_alien') {
    const targetAngle = angleTo(t.x, t.y, ship.x, ship.y);
    const currentAngle = Math.atan2(m.vy, m.vx);
    let delta = targetAngle - currentAngle;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    const turn = Math.max(-1.2 * dt, Math.min(1.2 * dt, delta));
    const speed = Math.hypot(m.vx, m.vy);
    const nextAngle = currentAngle + turn;
    m.vx = Math.cos(nextAngle) * speed;
    m.vy = Math.sin(nextAngle) * speed;

    st.aimTimer = (st.aimTimer ?? 0) - dt;
    st.ringTimer = (st.ringTimer ?? 0) - dt;
    st.spawnTimer = (st.spawnTimer ?? 5) - dt;
    if (st.aimTimer <= 0) {
      st.aimTimer = 1.8;
      fireAimed(game, t.x, t.y, 210, 3, 0.34);
      game.audio?.laser?.();
    }
    if (st.ringTimer <= 0) {
      st.ringTimer = 3.8;
      st.ringOffset = (st.ringOffset ?? 0) + 0.35;
      fireRing(game, t.x, t.y, 10, 180, st.ringOffset);
      game.audio?.laser?.();
    }
    if (st.spawnTimer <= 0) {
      st.spawnTimer = 7;
      if (game.world.count('enemy') < CONFIG.waves.maxEnemies) {
        for (let i = 0; i < 2; i++) {
          const a = rand(0, TAU);
          spawnEnemy(game, 'saucer_scout', t.x + Math.cos(a) * 120, t.y + Math.sin(a) * 120);
        }
      }
    }
  } else if (e.ai === 'boss_mothership') {
    if (st.phaseTimer <= 0) {
      st.phaseTimer = 2.8;
      fireRing(game, t.x, t.y, 12, 170, rand(0, TAU));
      game.audio?.laser?.();
    }
    // Spawn escorts periodically.
    st.spawnTimer = (st.spawnTimer ?? 0) - dt;
    if (st.spawnTimer <= 0) {
      st.spawnTimer = 6;
      if (game.world.count('enemy') < CONFIG.waves.maxEnemies) {
        const a = rand(0, TAU);
        spawnEnemy(game, 'saucer_scout', t.x + Math.cos(a) * 120, t.y + Math.sin(a) * 120);
      }
    }
  } else if (e.ai === 'boss_singularity') {
    // Gentle gravity pull on the player.
    const shipM = game.world.get(game.playerId, 'motion');
    if (shipM) {
      const dx = t.x - ship.x, dy = t.y - ship.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = 220;
      shipM.vx += (dx / d) * pull * dt;
      shipM.vy += (dy / d) * pull * dt;
    }
    st.fireAcc = (st.fireAcc ?? 0) + dt;
    if (st.fireAcc >= 0.16) {
      st.fireAcc -= 0.16;
      st.spiralAngle = (st.spiralAngle ?? 0) + 0.55;
      spawnEnemyBullet(game, {
        x: t.x, y: t.y,
        vx: Math.cos(st.spiralAngle) * 200, vy: Math.sin(st.spiralAngle) * 200,
        damage: 14, radius: 4,
      });
    }
  }
}

export function updateEnemyAI(game, dt) {
  const world = game.world;
  const ship = world.get(game.playerId, 'transform');
  if (!ship) return;

  for (const id of world.query('enemy', 'transform', 'motion')) {
    const e = world.get(id, 'enemy');
    const t = world.get(id, 'transform');
    const m = world.get(id, 'motion');
    if (e.orbCooldown > 0) e.orbCooldown -= dt;
    if (e.auraCooldown > 0) e.auraCooldown -= dt;

    // Arrival grace: nothing acts while shield is up.
    const shielded = world.has(id, 'spawnShield');

    switch (e.ai) {
      case 'drift':
        break;

      case 'shard': {
        const a = angleTo(t.x, t.y, ship.x, ship.y);
        const cur = Math.atan2(m.vy, m.vx);
        let d = a - cur;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        const turn = 2.4 * dt;
        const na = cur + Math.max(-turn, Math.min(turn, d));
        const sp = Math.hypot(m.vx, m.vy);
        m.vx = Math.cos(na) * sp;
        m.vy = Math.sin(na) * sp;
        break;
      }

      case 'saucer_scout':
      case 'saucer_gunner':
      case 'boss_warden': {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && !shielded) {
          const burst = e.ai === 'saucer_scout' ? 1 : 3;
          fireAimed(game, t.x, t.y, e.ai === 'saucer_scout' ? 240 : 215, burst, 0.24);
          game.audio?.laser?.();
          e.fireTimer = e.ai === 'saucer_scout' ? 2.6 : e.ai === 'boss_warden' ? 1.6 : 2.0;
        }
        break;
      }

      default:
        if (e.tier === 4 && !shielded) updateBoss(game, id, e, t, m, dt, ship);
        break;
    }
  }

  // Enemy bullet lifetime.
  for (const id of world.query('enemyBullet')) {
    const b = world.get(id, 'enemyBullet');
    b.ttl -= dt;
    if (b.ttl <= 0) world.destroy(id);
  }
}
