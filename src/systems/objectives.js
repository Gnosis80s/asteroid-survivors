import { CONFIG } from '../config.js';
import { rand, dist, angleTo } from '../engine/math.js';
import { randomOffscreenPos, spawnEnemy, spawnGem, spawnParticle, spawnExplosion, spawnEnemyBullet } from '../combat.js';

function shuffledCells(count) {
  const width = CONFIG.world.width;
  const height = CONFIG.world.height;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * width / height)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cells = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({ column, row });
    }
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return { cells: cells.slice(0, count), columns, rows };
}

function pointInCell(cell, columns, rows, spawnMinGap, spawnMinFromPlayer, playerT) {
  const padding = 80;
  const width = CONFIG.world.width - padding * 2;
  const height = CONFIG.world.height - padding * 2;
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const centerX = padding + (cell.column + 0.5) * cellWidth;
  const centerY = padding + (cell.row + 0.5) * cellHeight;
  const centerSpacing = Math.min(cellWidth, cellHeight);
  let jitter = Math.min(cellWidth * 0.25, cellHeight * 0.25);

  if (spawnMinGap <= centerSpacing) {
    jitter = Math.min(jitter, (centerSpacing - spawnMinGap) / 2);
  } else {
    jitter = 0;
  }

  if (playerT) {
    jitter = Math.min(jitter, dist(centerX, centerY, playerT.x, playerT.y) - spawnMinFromPlayer);
  }

  jitter = Math.max(0, jitter);
  const angle = rand(0, Math.PI * 2);
  const radius = jitter * Math.sqrt(Math.random());
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

function beginCycle(game) {
  const { spawnMinGap, spawnMinFromPlayer } = CONFIG.objective;
  const playerT = game.world.get(game.playerId, 'transform');
  const { cells, columns, rows } = shuffledCells(game.objective.count);
  const positions = cells.map((cell) => pointInCell(cell, columns, rows, spawnMinGap, spawnMinFromPlayer, playerT));

  game.objective.parts = positions.map((position, index) => ({
    id: -1,
    x: position.x,
    y: position.y,
    destroyed: false,
    missed: false,
    index,
  }));
  game.objective.liveIndex = 0;
  game.objective.nextBeaconDelay = 0;
  game.objective.nextBeaconDelayTotal = 0;
  spawnLive(game);
}

export function initObjective(game) {
  game.objective = {
    parts: [],
    count: CONFIG.objective.count,
    timer: CONFIG.objective.timer,
    nextBeaconDelay: 0,
    nextBeaconDelayTotal: 0,
    found: 0,
    misses: 0,
    liveIndex: 0,
  };
  beginCycle(game);
}

function spawnLive(game) {
  const objective = game.objective;
  const part = objective.parts[objective.liveIndex];
  if (!part) return;

  const id = game.world.create();
  game.world.add(id, 'transform', { x: part.x, y: part.y, rot: 0 });
  game.world.add(id, 'collider', { radius: CONFIG.objective.hitRadius });
  game.world.add(id, 'render', { type: 'objective', color: 'chest', size: 12, glow: 2 });
  game.world.add(id, 'objective', {
    index: part.index, hp: CONFIG.objective.hp, maxHp: CONFIG.objective.hp,
    auraCooldown: 0, orbCooldown: 0, fireTimer: CONFIG.objective.fireWarmup,
  });
  part.id = id;
  objective.timer = CONFIG.objective.timer;
}

function fireAtPlayer(game, t) {
  const playerT = game.world.get(game.playerId, 'transform');
  if (!playerT) return;
  const base = angleTo(t.x, t.y, playerT.x, playerT.y);
  const count = CONFIG.objective.fireBurst;
  for (let i = 0; i < count; i++) {
    const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * CONFIG.objective.fireSpread;
    const a = base + spread;
    spawnEnemyBullet(game, {
      x: t.x, y: t.y,
      vx: Math.cos(a) * CONFIG.objective.fireSpeed,
      vy: Math.sin(a) * CONFIG.objective.fireSpeed,
      damage: CONFIG.objective.fireDamage, radius: 4, ttl: 5,
    });
  }
  game.audio?.laser?.();
}

function advanceBeacon(game) {
  game.objective.nextBeaconDelay = 0;
  game.objective.nextBeaconDelayTotal = 0;
  game.objective.liveIndex += 1;
  if (game.objective.liveIndex >= game.objective.parts.length) beginCycle(game);
  else spawnLive(game);
}

function spawnMissWave(game) {
  const objective = game.objective;
  const count = Math.min(
    CONFIG.objective.missWaveMax,
    CONFIG.objective.missWaveBase + (objective.misses - 1) * CONFIG.objective.missWaveGrowth,
  );

  for (let i = 0; i < count; i++) {
    const type = objective.misses >= 2 && i % 3 === 0 ? 'saucer_gunner' : 'saucer_scout';
    const [x, y] = randomOffscreenPos(game);
    spawnEnemy(game, type, x, y);
  }
}

function destroyBeacon(game, part) {
  game.world.destroy(part.id);
  part.destroyed = true;
  part.id = -1;
  game.objective.found += 1;
  const remaining = Math.max(0, game.objective.timer);
  game.objective.nextBeaconDelay = CONFIG.objective.postDestroyDelay + remaining;
  game.objective.nextBeaconDelayTotal = game.objective.nextBeaconDelay;
  game.objective.timer = 0;
  spawnExplosion(game, part.x, part.y, 'chest', 18, 240, 3, 0.6);
  game.audio?.explosion?.();
  spawnGem(game, part.x, part.y, CONFIG.pickup.bigGemValue, true);
  destroyReward(game, part.x, part.y);
}

function missBeacon(game, part) {
  game.world.destroy(part.id);
  part.missed = true;
  part.id = -1;
  game.objective.misses += 1;
  spawnMissWave(game);
  game.banner = { text: 'BEACON MISSED: SHIPS INBOUND', ttl: 2.5, alert: true };
  game.audio?.bossWarning?.();
  advanceBeacon(game);
}

export function updateObjective(game, dt) {
  const objective = game.objective;
  if (!objective) return;

  if (objective.nextBeaconDelay > 0) {
    objective.nextBeaconDelay = Math.max(0, objective.nextBeaconDelay - dt);
    if (objective.nextBeaconDelay <= 0) advanceBeacon(game);
    return;
  }

  const part = objective.parts[objective.liveIndex];
  if (!part) return;
  const live = game.world.get(part.id, 'objective');
  if (!live) return;
  if (live.hp <= 0) {
    destroyBeacon(game, part);
    return;
  }

  const t = game.world.get(part.id, 'transform');
  if (t) {
    live.fireTimer = (live.fireTimer ?? CONFIG.objective.fireWarmup) - dt;
    if (live.fireTimer <= 0) {
      live.fireTimer += CONFIG.objective.fireInterval;
      fireAtPlayer(game, t);
    }
  }

  objective.timer = Math.max(0, objective.timer - dt);
  if (objective.timer <= 0) missBeacon(game, part);
}

function destroyReward(game, x, y) {
  game.goldEarned += 25;
  game.shake = Math.max(game.shake || 0, 20);
  game.hitStop = Math.max(game.hitStop || 0, 0.12);
  // Brief gold burst marker so the destruction reads at a glance.
  for (let i = 0; i < 6; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(40, 160); spawnParticle(game, {
      x, y, angle: a, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2,
      life: 0.4, size: 2.5, color: 'chest', glow: 1, shape: 'dot',
    });
  }
}
