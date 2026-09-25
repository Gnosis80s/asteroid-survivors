// Regression tests for specific fixed bugs. Each section names the bug it
// guards against. Run with: node test/regressions.mjs

import { CONFIG } from '../src/config.js';
import {
  createGame, startRun, applyCard, generateOffers, generateChestRewards,
} from '../src/state.js';
import { defaultSave } from '../src/save.js';
import {
  spawnEnemy, spawnMine, spawnPlayerBullet, killEnemy, clearNearbyEnemies,
} from '../src/combat.js';
import { WEAPON_MAP } from '../src/data/weapons.js';
import { ENEMIES } from '../src/data/enemies.js';
import { updateWeapons } from '../src/systems/weaponSystem.js';
import { updateCollision } from '../src/systems/collision.js';
import { updateWaveDirector, findLiveBossId } from '../src/systems/waveDirector.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ok -', msg);
  else { console.error('  FAIL -', msg); failures++; }
}

function freshGame() {
  const game = createGame();
  game.input = { isDown: () => false, justPressed: () => false, mouse: { x: 0, y: 0, pressed: false } };
  game.meta = defaultSave().meta;
  game.char = CONFIG.characters[0];
  startRun(game);
  return game;
}

function weaponCard(id) {
  const def = WEAPON_MAP[id];
  return { kind: 'weapon', id, name: def.name, glyph: def.glyph, rarity: def.rarity, desc: def.desc, level: 0, maxLevel: 5, type: 'weapon' };
}

// ---- Bug: chest gold table was indexed [0,50,150,300][tier] with tier ----
// ---- 1/3/5, so the best chest paid 50 and the mid chest paid 300.      ----
console.log('chest gold scales with tier');
{
  const game = freshGame();
  game.time = 0; // pre-10:00, so no evolution/union headline interferes
  const realRandom = Math.random;
  try {
    Math.random = () => 0.05; // r < 0.12 -> 5-item chest
    assert(generateChestRewards(game).gold === 300, 'tier-5 chest pays 300 gold');
    Math.random = () => 0.3; // r < 0.50 -> 3-item chest
    assert(generateChestRewards(game).gold === 150, 'tier-3 chest pays 150 gold');
    Math.random = () => 0.9; // -> 1-item chest
    assert(generateChestRewards(game).gold === 50, 'tier-1 chest pays 50 gold');
  } finally {
    Math.random = realRandom;
  }
}

// ---- Bug: minefield chain detonation destroyed mines while the outer ----
// ---- loop iterated them -> TypeError on `mine.armed`.                 ----
console.log('chain mines detonate without crashing');
{
  const game = freshGame();
  spawnMine(game, { x: 500, y: 400, damage: 10, radius: 80, armTime: 0, chain: true });
  spawnMine(game, { x: 560, y: 400, damage: 10, radius: 80, armTime: 0, chain: true });
  spawnEnemy(game, 'asteroid_small', 530, 400);
  let threw = false;
  try {
    updateWeapons(game, CONFIG.FIXED_DT);
  } catch (e) {
    threw = true;
    console.error('     ', e.message);
  }
  assert(!threw, 'overlapping chain mines trigger in one tick without throwing');
  assert(game.world.count('mine') === 0, 'both chain mines consumed by the cascade');
}

// ---- Bug: revive's clearNearbyEnemies destroyed bosses too; culling the ----
// ---- Singularity that way skipped onBossKilled and made victory impossible.
console.log('revive never removes bosses');
{
  const game = freshGame();
  let victory = false;
  // Mirror the main.js wiring.
  game.onBossKilled = (type) => {
    game.bossAlive = findLiveBossId(game);
    if (type === 'boss_singularity') victory = true;
  };
  const pt = game.world.get(game.playerId, 'transform');
  const bossId = spawnEnemy(game, 'boss_singularity', pt.x + 50, pt.y);
  const rockId = spawnEnemy(game, 'asteroid_small', pt.x - 30, pt.y);
  clearNearbyEnemies(game);
  assert(!!game.world.get(bossId, 'enemy'), 'singularity survives the revive cull');
  assert(!game.world.get(rockId, 'enemy'), 'nearby asteroid is cleared on revive');
  const bt = game.world.get(bossId, 'transform');
  const d = Math.hypot(bt.x - pt.x, bt.y - pt.y);
  assert(d >= 260, `boss shoved outside the safe zone (${Math.round(d)}px)`);

  // And the boss can still be killed normally afterwards -> win stays reachable.
  killEnemy(game, bossId);
  assert(victory, 'killing the singularity after a revive still wins the run');
}

// ---- Bug: orbital spec only encoded orb count, so Orbital Shields L2/L4 ----
// ---- never rebuilt and kept L1 damage (weaponSystem sync reads o.level).
console.log('orbital shields scale every level');
{
  const game = freshGame();
  applyCard(game, weaponCard('orbitalShields'));
  updateWeapons(game, CONFIG.FIXED_DT); // fires at level 1
  assert(game.orbitalIds.length === 2, 'level 1 spawns 2 orbs');
  assert(game.world.get(game.orbitalIds[0], 'orbital').level === 1, 'orbs start at level 1');

  applyCard(game, weaponCard('orbitalShields')); // -> level 2
  game.weaponState.get('orbitalShields').cd = 0; // force an immediate refire
  updateWeapons(game, CONFIG.FIXED_DT);
  const orb = game.world.get(game.orbitalIds[0], 'orbital');
  assert(orb.level === 2, 'orbs rebuilt when the weapon levels up');
  const expected = 11 * 1.28 * game.stats.damageMult;
  assert(Math.abs(orb.damage - expected) < 1e-6, `orb damage scales at level 2 (${orb.damage.toFixed(2)})`);
}

console.log('elite asteroids are tougher and rarely drop salvage');
{
  const def = ENEMIES.asteroid_elite;
  const game = freshGame();
  const id = spawnEnemy(game, 'asteroid_elite', 900, 300);
  const enemy = game.world.get(id, 'enemy');
  assert(def.hp >= 600, 'elite asteroid has substantially more health');
  assert(def.contactDamage >= 170, 'elite asteroid deals substantially more contact damage');
  assert(def.chestChance <= 0.05, 'elite asteroid salvage drop chance is low');
  assert(enemy.hp === Math.round(def.hp), 'elite asteroid uses its strengthened health pool');
}

// ---- Bug: piercing bullets had no per-enemy hit memory and re-hit the ----
// ---- same large enemy every frame they overlapped (up to ~14x damage).
console.log('piercing bullets hit each enemy once');
{
  const game = freshGame();
  const eliteId = spawnEnemy(game, 'asteroid_elite', 900, 300);
  const hp0 = game.world.get(eliteId, 'enemy').hp;
  spawnPlayerBullet(game, {
    x: 900, y: 300, angle: 0, speed: 0, damage: 26,
    radius: 4, lifetime: 5, color: 'blaster', pierce: 8,
  });
  const realRandom = Math.random;
  try {
    Math.random = () => 0.99; // no crits
    updateCollision(game, CONFIG.FIXED_DT);
    const hp1 = game.world.get(eliteId, 'enemy').hp;
    assert(hp1 === hp0 - 26, `piercing bullet hits once (${hp0} -> ${hp1})`);
    assert(game.world.count('bullet') === 1, 'piercing bullet survives the hit');
    updateCollision(game, CONFIG.FIXED_DT);
    const hp2 = game.world.get(eliteId, 'enemy').hp;
    assert(hp2 === hp1, 'no re-hit while still overlapping the same enemy');
  } finally {
    Math.random = realRandom;
  }
}

// ---- Bug: banishing a union card spent the banish but buildCardPool and ----
// ---- findUnionable never checked the banished set, so it kept appearing.
console.log('banishing a union works');
{
  const game = freshGame();
  game.build.weapons.set('machineGun', 5);
  game.build.weapons.set('spreadShot', 5);
  let offers = generateOffers(game, 'levelup');
  assert(offers.some((c) => c.kind === 'union' && c.id === 'hailstorm'), 'union offered when both bases are maxed');

  game.build.banished.add('hailstorm');
  offers = generateOffers(game, 'levelup');
  assert(!offers.some((c) => c.id === 'hailstorm'), 'banished union leaves the level-up pool');

  game.time = 600; // chests can headline unions from 10:00 on
  const chest = generateChestRewards(game);
  assert(!chest.rewards.some((c) => c.id === 'hailstorm'), 'banished union never headlines a chest');
}

// ---- Bug: bossAlive tracked only the newest boss; killing either of two ----
// ---- overlapping bosses cleared it and resumed spawns mid-boss-fight.
console.log('overlapping bosses keep spawns suppressed');
{
  const game = freshGame();
  game.onBossKilled = (type) => {
    game.bossAlive = findLiveBossId(game);
    if (type === 'boss_singularity') game.onVictory?.();
  };
  const colossus = spawnEnemy(game, 'boss_colossus', 100, 100);
  const mothership = spawnEnemy(game, 'boss_mothership', 1100, 600);
  game.bossAlive = mothership; // newest spawn owns the HUD bar (as in waveDirector)

  killEnemy(game, colossus);
  assert(game.bossAlive === mothership, 'boss bar retargets the remaining boss');

  const before = game.world.count('enemy');
  for (let i = 0; i < 300; i++) updateWaveDirector(game, CONFIG.FIXED_DT);
  assert(game.world.count('enemy') === before, 'asteroid spawns stay suppressed while a second boss lives');

  killEnemy(game, mothership);
  assert(game.bossAlive === -1, 'boss bar clears once the last boss dies');
}

// ---- Bug: input.endFrame() ran once per rendered frame; with several ----
// ---- fixed ticks per frame a keypress was processed multiple times, ----
// ---- and with zero ticks it was dropped entirely (144 Hz displays).  ----
console.log('edge input survives until a tick consumes it');
{
  const handlers = {};
  globalThis.window = {
    addEventListener: (ev, fn) => { (handlers[ev] ??= []).push(fn); },
  };
  const { Input } = await import('../src/engine/input.js');
  const input = new Input();
  const keydown = (code) => handlers.keydown.forEach((fn) => fn({ code, key: code, preventDefault() {} }));
  const keyup = (code) => handlers.keyup.forEach((fn) => fn({ code, key: code }));

  keydown('KeyP');
  assert(input.justPressed('KeyP'), 'keypress registers as an edge');
  input.endFrame(); // first tick in a frame consumes it
  assert(!input.justPressed('KeyP'), 'second tick in the same frame does not see it again');
  keyup('KeyP');

  keydown('KeyP');
  // A render frame with zero ticks must not clear the pending press.
  assert(input.justPressed('KeyP'), 'press persists until a tick consumes it');
  input.endFrame();
  assert(!input.justPressed('KeyP'), 'press is consumed by the next tick');
  keyup('KeyP');
  delete globalThis.window;
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
