// Spawns enemies against a threat budget and schedules the three bosses.
// Enemy count is capped for readability; difficulty scales with time/tier.

import { CONFIG } from '../config.js';
import { ENEMIES, TIER_TABLES } from '../data/enemies.js';
import { spawnEnemy, randomOffscreenPos } from '../combat.js';
import { weightedPick } from '../engine/math.js';

const BOSS_BY_TIME = {
  300: 'boss_colossus',
  600: 'boss_mothership',
  900: 'boss_singularity',
};

export function updateWaveDirector(game, dt) {
  game.time += dt;
  if (!game.wd) game.wd = { timer: 0, bossFired: {}, subbossNext: 150, spawnAccum: 0 };
  const wd = game.wd;

  cullFarFromPlayer(game);

  for (const t of CONFIG.waves.bossTimes) {
    if (!wd.bossFired[t] && game.time >= t) {
      wd.bossFired[t] = true;
      const [x, y] = randomOffscreenPos(game);
      const type = BOSS_BY_TIME[t];
      game.bossAlive = spawnEnemy(game, type, x, y);
      game.banner = { text: `⚠ ${ENEMIES[type].name.toUpperCase()} APPROACHES`, ttl: 3.5, alert: true };
      game.audio?.bossWarning?.();
    }
  }

  // Sub-boss (Warden) every 2.5 minutes; drops a salvage crate when killed.
  if (game.time >= wd.subbossNext) {
    wd.subbossNext += 150;
    if (!bossActive(game) && countType(game, 'boss_warden') === 0) {
      const [x, y] = randomOffscreenPos(game);
      spawnEnemy(game, 'boss_warden', x, y);
      game.banner = { text: '⚠ WARDEN INBOUND', ttl: 2.5, alert: true };
      game.audio?.bossWarning?.();
    }
  }

  wd.timer -= dt;
  if (wd.timer <= 0) {
    wd.timer = CONFIG.waves.spawnInterval;
    // While a boss is alive, normal asteroid spawning is suppressed so the
    // fight stays readable; the boss provides its own pressure.
    if (!bossActive(game)) spawnBatch(game);
  }
}

function countType(game, type) {
  let n = 0;
  for (const id of game.world.query('enemy')) {
    if (game.world.get(id, 'enemy').type === type) n++;
  }
  return n;
}

// Enemies that drift too far from the player are quietly despawned (except
// bosses), so a long flight through the world doesn't leave a wake of hidden
// enemies accumulating behind you.
function cullFarFromPlayer(game) {
  const pt = game.world.get(game.playerId, 'transform');
  if (!pt) return;
  const r2 = CONFIG.despawnRadius * CONFIG.despawnRadius;
  const doomed = [];
  for (const id of game.world.query('enemy')) {
    const e = game.world.get(id, 'enemy');
    if (!e || e.tier === 4) continue; // bosses roam the world until killed
    const t = game.world.get(id, 'transform');
    if (!t) continue;
    const dx = t.x - pt.x, dy = t.y - pt.y;
    if (dx * dx + dy * dy > r2) doomed.push(id);
  }
  for (const id of doomed) game.world.destroy(id);
}

// A boss is "active" while ANY tier-4 enemy lives, not just the one most
// recently spawned — boss timers can overlap when the player is slow to kill.
export function findLiveBossId(game) {
  for (const id of game.world.query('enemy')) {
    const e = game.world.get(id, 'enemy');
    if (e && e.tier === 4) return id;
  }
  return -1;
}

function bossActive(game) {
  return findLiveBossId(game) >= 0;
}

function spawnBatch(game) {
  const count = game.world.count('enemy');
  if (count >= CONFIG.waves.maxEnemies) return;

  const tier = game.time < 300 ? 1 : game.time < 600 ? 2 : 3;
  const table = TIER_TABLES[tier];

  // Fractional spawn accumulator for a smooth, gentle early-game ramp.
  const curse = game.stats ? (game.stats.curse || 0) : 0;
  const budget = (CONFIG.difficulty.baseSpawn + game.time * CONFIG.difficulty.spawnPerSec) * (1 + curse);
  game.wd.spawnAccum = (game.wd.spawnAccum || 0) + budget;
  let n = Math.floor(game.wd.spawnAccum);
  game.wd.spawnAccum -= n;
  n = Math.min(n, 6, CONFIG.waves.maxEnemies - count);

  for (let i = 0; i < n; i++) {
    const type = weightedPick(table);
    const [x, y] = randomOffscreenPos(game);
    spawnEnemy(game, type, x, y);
  }
}
