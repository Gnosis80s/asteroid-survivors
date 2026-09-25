// Combat & entity-spawning helpers. Centralizes entity creation so systems
// stay thin, and keeps health/death logic in one place. Communicates with
// the state machine via callbacks attached to `game` (onDeath, onVictory,
// onChest) to avoid circular imports.

import { CONFIG } from './config.js';
import { ENEMIES } from './data/enemies.js';
import { rand, randInt, vecFromAngle, angleTo, irregularPolygon, TAU, pick } from './engine/math.js';

// ---------- enemy spawning ----------

function hpScale(game) {
  return 1 + (game.level - 1) * CONFIG.difficulty.enemyHpPerLevel;
}

export function spawnEnemy(game, type, x, y) {
  const def = ENEMIES[type];
  if (!def) return -1;
  const w = game.world;
  const id = w.create();
  const [minS, maxS] = def.speed;
  const curse = game.stats ? (game.stats.curse || 0) : 0;
  const speed = rand(minS, maxS) * (1 + curse * 0.6);
  const angle = rand(0, TAU);
  const hp = Math.round(def.hp * hpScale(game) * (1 + curse));

  w.add(id, 'transform', { x, y, rot: rand(0, TAU) });
  w.add(id, 'motion', {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    vrot: rand(def.vrot[0], def.vrot[1]),
    bounce: true,
  });
  w.add(id, 'collider', { radius: def.radius });
  w.add(id, 'enemy', {
    type, name: def.name, tier: def.tier, hp, maxHp: hp,
    contactDamage: def.contactDamage, score: def.score, gold: def.gold,
    ai: def.ai, state: {}, fireTimer: 0, orbCooldown: 0,
  });
  w.add(id, 'spawnShield', { ttl: CONFIG.waves.grace });

  const render = {
    type: def.render, color: def.color, size: def.radius, glow: def.glow,
  };
  if (def.render === 'asteroid' || def.render === 'boss') {
    render.points = irregularPolygon(def.radius, 0.32, 9, 13);
  }
  w.add(id, 'render', render);

  return id;
}

export function randomOffscreenPos(game) {
  // Spawn just outside the camera's current viewport, clamped to the world.
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  const cam = game.camera || { x: 0, y: 0 };
  const m = 60;
  const side = randInt(0, 3);
  const clampX = (v) => Math.max(0, Math.min(CONFIG.world.width, v));
  const clampY = (v) => Math.max(0, Math.min(CONFIG.world.height, v));
  if (side === 0) return [clampX(rand(cam.x - m, cam.x + W + m)), clampY(cam.y - m)];
  if (side === 1) return [clampX(rand(cam.x - m, cam.x + W + m)), clampY(cam.y + H + m)];
  if (side === 2) return [clampX(cam.x - m), clampY(rand(cam.y - m, cam.y + H + m))];
  return [clampX(cam.x + W + m), clampY(rand(cam.y - m, cam.y + H + m))];
}

// ---------- projectiles ----------

export function spawnPlayerBullet(game, o) {
  const id = game.world.create();
  const [vx, vy] = vecFromAngle(o.angle, o.speed);
  game.world.add(id, 'transform', { x: o.x, y: o.y, rot: o.angle });
  game.world.add(id, 'motion', { vx, vy, vrot: 0, wrap: true });
  game.world.add(id, 'collider', { radius: o.radius });
  game.world.add(id, 'bullet', {
    damage: o.damage, pierce: o.pierce || 0, owner: 'player',
    kind: 'bullet', split: o.split || null, ttl: o.lifetime,
  });
  game.world.add(id, 'render', { type: 'bullet', color: o.color, size: o.radius, glow: 0, shape: o.shape || 'dot' });
  return id;
}

export function spawnMissile(game, o) {
  const id = game.world.create();
  const [vx, vy] = vecFromAngle(o.angle, o.speed);
  game.world.add(id, 'transform', { x: o.x, y: o.y, rot: o.angle });
  game.world.add(id, 'motion', { vx, vy, vrot: 0, wrap: true });
  game.world.add(id, 'collider', { radius: o.radius });
  game.world.add(id, 'bullet', {
    damage: o.damage, pierce: 0, owner: 'player', kind: 'missile',
    split: o.split || null, ttl: o.lifetime,
  });
  game.world.add(id, 'homing', { speed: o.speed, turnRate: 6, targetId: -1 });
  game.world.add(id, 'render', { type: 'missile', color: o.color, size: o.radius, glow: 1 });
  return id;
}

export function spawnMicro(game, { x, y, angle, speed, damage, homing }) {
  const id = game.world.create();
  const [vx, vy] = vecFromAngle(angle, speed);
  game.world.add(id, 'transform', { x, y, rot: angle });
  game.world.add(id, 'motion', { vx, vy, vrot: 0, wrap: true });
  game.world.add(id, 'collider', { radius: 2 });
  game.world.add(id, 'bullet', {
    damage, pierce: 0, owner: 'player', kind: 'micro', split: null, ttl: 0.8,
  });
  game.world.add(id, 'render', { type: 'bullet', color: 'playerBullet', size: 2, glow: 0 });
  if (homing) game.world.add(id, 'homing', { speed, turnRate: 8, targetId: -1 });
  return id;
}

export function spawnBeam(game, o) {
  const id = game.world.create();
  game.world.add(id, 'transform', { x: o.x, y: o.y, rot: o.rot });
  game.world.add(id, 'beam', {
    ttl: o.ttl, length: o.length, width: o.width, damage: o.damage,
    hitSet: new Set(), sweep: o.sweep,
  });
  game.world.add(id, 'render', { type: 'beam', color: o.color, size: o.length, glow: 1 });
  return id;
}

export function spawnMine(game, o) {
  const id = game.world.create();
  game.world.add(id, 'transform', { x: o.x, y: o.y, rot: rand(0, TAU) });
  game.world.add(id, 'mine', {
    armedAt: game.time + o.armTime, radius: o.radius, damage: o.damage,
    chain: o.chain, life: 12, armed: false,
  });
  game.world.add(id, 'render', { type: 'mine', color: 'mine', size: 6, glow: 0 });
  return id;
}

export function spawnOrbital(game, o) {
  const id = game.world.create();
  game.world.add(id, 'transform', { x: o.x, y: o.y, rot: 0 });
  game.world.add(id, 'collider', { radius: 7 });
  game.world.add(id, 'orbital', {
    index: o.index, count: o.count, radius: o.radius,
    angularSpeed: o.angularSpeed, dir: o.dir, damage: o.damage,
    baseRadius: o.baseRadius ?? o.radius, baseDamage: o.baseDamage ?? o.damage,
    level: o.level ?? 1,
  });
  game.world.add(id, 'render', { type: 'orbital', color: 'orbital', size: 7, glow: 1 });
  return id;
}

export function spawnEnemyBullet(game, o) {
  const id = game.world.create();
  game.world.add(id, 'transform', { x: o.x, y: o.y, rot: Math.atan2(o.vy, o.vx) });
  game.world.add(id, 'motion', { vx: o.vx, vy: o.vy, vrot: 0, wrap: true });
  game.world.add(id, 'collider', { radius: o.radius });
  game.world.add(id, 'enemyBullet', { damage: o.damage, ttl: o.ttl ?? 3.5 });
  game.world.add(id, 'render', { type: 'enemyBullet', color: 'enemyBullet', size: o.radius, glow: 2 });
  return id;
}

// Transient chain-lightning segment (visual only, no collider).
export function spawnBolt(game, o) {
  const id = game.world.create();
  game.world.add(id, 'transform', {
    x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2,
    rot: Math.atan2(o.y2 - o.y1, o.x2 - o.x1),
  });
  game.world.add(id, 'bolt', { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, ttl: o.ttl ?? 0.16 });
  game.world.add(id, 'render', { type: 'bolt', color: o.color ?? 'playerBullet', size: 2, glow: 1 });
  return id;
}

// ---------- pickups ----------

function spawnPickup(game, kind, x, y, value) {
  const id = game.world.create();
  const a = rand(0, TAU);
  const sp = rand(20, 60);
  game.world.add(id, 'transform', { x, y, rot: 0 });
  game.world.add(id, 'motion', { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vrot: 0, wrap: false, drag: 3 });
  game.world.add(id, 'pickup', { kind, value, magnet: false });
  const sizes = { gem: 6, heart: 8, chest: 12, magnet: 10 };
  const colors = { gem: 'gem', heart: 'heart', chest: 'chest', magnet: 'vacuum' };
  game.world.add(id, 'render', { type: kind, color: colors[kind], size: sizes[kind], glow: kind === 'chest' ? 2 : 1 });
  return id;
}

export function spawnGem(game, x, y, value, big = false) {
  const id = spawnPickup(game, 'gem', x, y, value);
  if (big) {
    game.world.get(id, 'pickup').big = true;
    const r = game.world.get(id, 'render');
    r.color = 'bigGem';
  }
  return id;
}

export const spawnHeart = (game, x, y) => spawnPickup(game, 'heart', x, y, 0);
export const spawnChest = (game, x, y) => spawnPickup(game, 'chest', x, y, 0);
export const spawnMagnet = (game, x, y) => spawnPickup(game, 'magnet', x, y, 0);

// Drop a gem; every gemCadence-th drop is a big red gem (Vampire Survivors).
function dropGem(game, x, y, value) {
  if (game.gemStreak >= CONFIG.pickup.gemCadence) {
    game.gemStreak = 0;
    spawnGem(game, x, y, CONFIG.pickup.bigGemValue, true);
  } else {
    game.gemStreak++;
    spawnGem(game, x, y, value);
  }
}

// ---------- particles ----------

export function spawnParticle(game, o) {
  const id = game.world.create();
  game.world.add(id, 'transform', { x: o.x, y: o.y, rot: o.angle ?? 0 });
  game.world.add(id, 'particle', {
    life: o.life, maxLife: o.life, vx: o.vx, vy: o.vy, drag: o.drag ?? 2,
    size: o.size ?? 2, color: o.color ?? 'white', glow: o.glow ?? 0,
    shape: o.shape ?? 'dot',
  });
  game.world.add(id, 'render', { type: 'particle', color: o.color ?? 'white', size: o.size ?? 2, glow: o.glow ?? 0 });
  return id;
}

export function spawnExplosion(game, x, y, color, count = 14, speed = 180, size = 2.5, life = 0.5) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const sp = rand(0.2, 1) * speed;
    spawnParticle(game, {
      x, y, angle: a, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(life * 0.5, life), size: rand(size * 0.6, size), color, glow: 1,
    });
  }
}

// ---------- combat ----------

export function damageEnemy(game, id, amount) {
  const enemy = game.world.get(id, 'enemy');
  if (!enemy) return;
  let final = amount;
  let crit = false;
  if (Math.random() < game.stats.critChance) {
    crit = true;
    final *= game.stats.critMult;
  }
  enemy.hp -= final;
  game.world.add(id, 'flash', { ttl: 0.08, color: crit ? 'boss' : 'white' });
  const t = game.world.get(id, 'transform');
  if (t) spawnParticle(game, { x: t.x, y: t.y, angle: 0, vx: 0, vy: 0, life: 0.12, size: 3, color: 'white', glow: 0 });
  if (enemy.hp <= 0) killEnemy(game, id);
}

export function damageObjective(game, id, amount) {
  const objective = game.world.get(id, 'objective');
  const part = game.objective?.parts[game.objective.liveIndex];
  if (!objective || objective.hp <= 0 || !part || part.id !== id) return;

  let final = amount;
  let crit = false;
  if (Math.random() < (game.stats?.critChance || 0)) {
    crit = true;
    final *= game.stats.critMult;
  }
  objective.hp -= final;
  game.world.add(id, 'flash', { ttl: 0.08, color: crit ? 'boss' : 'white' });
  const t = game.world.get(id, 'transform');
  if (t) spawnParticle(game, { x: t.x, y: t.y, angle: 0, vx: 0, vy: 0, life: 0.12, size: 3, color: 'white', glow: 0 });
}

export function damageTarget(game, id, amount) {
  if (game.world.has(id, 'enemy')) return damageEnemy(game, id, amount);
  if (game.world.has(id, 'objective')) return damageObjective(game, id, amount);
}

export function killEnemy(game, id) {
  const enemy = game.world.get(id, 'enemy');
  const t = game.world.get(id, 'transform');
  if (!enemy) return;
  const def = ENEMIES[enemy.type];
  const x = t.x, y = t.y;
  const isBoss = enemy.tier === 4 || enemy.type === 'boss_warden';

  spawnExplosion(game, x, y, def.color, isBoss ? 48 : 16, isBoss ? 340 : 200, isBoss ? 5 : 3, isBoss ? 0.9 : 0.6);
  if (isBoss) {
    game.shake = Math.max(game.shake || 0, 20);
    game.hitStop = Math.max(game.hitStop || 0, 0.12);
  }

  game.score += def.score;
  game.goldEarned += def.gold;

  if (def.split) {
    for (let i = 0; i < def.split.count; i++) {
      const a = rand(0, TAU);
      spawnEnemy(game, def.split.child, x + Math.cos(a) * def.radius, y + Math.sin(a) * def.radius);
    }
  } else {
    if (def.render === 'asteroid' || def.render === 'shard') {
      dropGem(game, x, y, CONFIG.pickup.gemValue);
      if (Math.random() < CONFIG.pickup.heartChance) spawnHeart(game, x, y);
    } else if (def.render === 'saucer') {
      spawnGem(game, x, y, CONFIG.pickup.gemValue);
      if (Math.random() < CONFIG.pickup.heartChance) spawnHeart(game, x, y);
    }
  }

  // Rare Vacuum drop (blue orb): pulls all on-screen XP gems to the player.
  if (Math.random() < CONFIG.pickup.magnetChance * (1 + game.stats.luck)) {
    spawnMagnet(game, x, y);
  }

  // Salvage pod drop (elites have a chance; sub-boss & main bosses always).
  if (def.chestChance && Math.random() < def.chestChance) spawnChest(game, x, y);

  // Destroy before the boss callback so "is any boss still alive?" scans
  // don't count the boss that was just killed.
  game.world.destroy(id);
  if (enemy.tier === 4) {
    game.onBossKilled?.(enemy.type);
  }
  game.audio?.explosion();
}

// Clear space around the player (used by revive). Regular enemies are
// destroyed; bosses are shoved outside the safe zone instead — deleting the
// Singularity would skip onBossKilled and make the run unwinnable.
export function clearNearbyEnemies(game, radius = 260) {
  const pt = game.world.get(game.playerId, 'transform');
  if (!pt) return;
  const r2 = radius * radius;
  for (const id of game.world.query('enemy', 'transform')) {
    const t = game.world.get(id, 'transform');
    const e = game.world.get(id, 'enemy');
    if (!t || !e) continue;
    const dx = t.x - pt.x, dy = t.y - pt.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r2) continue;
    if (e.tier === 4) {
      const d = Math.sqrt(d2) || 1;
      t.x = Math.max(40, Math.min(CONFIG.world.width - 40, pt.x + (dx / d) * (radius + 100)));
      t.y = Math.max(40, Math.min(CONFIG.world.height - 40, pt.y + (dy / d) * (radius + 100)));
    } else {
      game.world.destroy(id);
    }
  }
}

export function damagePlayer(game, amount) {
  if (game.invuln > 0 || game.state !== 'playing') return;
  const reduced = Math.max(1, amount - game.stats.armor);
  game.hp -= reduced;
  game.invuln = CONFIG.player.invulnOnHit;
  game.shake = 8;
  game.audio?.playerHit();

  if (game.hp <= 0) {
    if (!game.reviveUsed && game.meta.revive > 0) {
      game.reviveUsed = true;
      game.hp = Math.round(game.stats.maxHp * 0.5);
      game.invuln = 2.0;
      game.onRevive?.();
    } else {
      game.hp = 0;
      game.onDeath?.();
    }
  }
}

export function addXp(game, amount) {
  game.xp += amount * (game.stats ? (game.stats.xpMult || 1) : 1);
}

export function awardGold(game, amount) {
  game.goldEarned += amount;
}
