// Headless smoke test: drives the full gameplay systems without a browser to
// verify the core loop (spawn -> fire -> collide -> kill -> level) is sound.
// Run with: node test/smoke.mjs

import { CONFIG } from '../src/config.js';
import { createGame, startRun, applyCard, generateOffers } from '../src/state.js';
import { defaultSave } from '../src/save.js';
import { spawnEnemy } from '../src/combat.js';
import { WEAPON_MAP } from '../src/data/weapons.js';

import { updatePlayerControl } from '../src/systems/playerControl.js';
import { updateMovement } from '../src/systems/movement.js';
import { updateWeapons } from '../src/systems/weaponSystem.js';
import { updateEnemyAI } from '../src/systems/enemyAI.js';
import { updateCollision } from '../src/systems/collision.js';
import { updatePickups } from '../src/systems/pickup.js';
import { updateParticles } from '../src/systems/particles.js';
import { updateWaveDirector } from '../src/systems/waveDirector.js';
import { updateLeveling } from '../src/systems/leveling.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ok -', msg);
  else { console.error('  FAIL -', msg); failures++; }
}

const game = createGame();
game.input = { isDown: () => false, justPressed: () => false, mouse: { x: 0, y: 0, pressed: false } };
game.meta = defaultSave().meta;
game.char = CONFIG.characters[0];
game.selectedCharId = 'voyager';

startRun(game);

// 1. Player exists with stats.
assert(game.playerId >= 0, 'player spawned');
assert(game.stats.maxHp === 100, 'character base hp = 100');
assert(game.build.weapons.has('machineGun'), 'starter weapon granted');

// 2. Weapon firing creates projectiles.
const ctx = { game, world: game.world, stats: game.stats, x: 100, y: 100, rot: 0, time: 0 };
const before = game.world.count('bullet');
WEAPON_MAP.machineGun.fire(ctx, 1);
assert(game.world.count('bullet') === before + 1, 'machine gun fires a bullet');

// 3. Enemies spawn via director ticks.
const steps = Math.floor(4 / CONFIG.FIXED_DT);
for (let i = 0; i < steps; i++) updateWaveDirector(game, CONFIG.FIXED_DT);
assert(game.world.count('enemy') > 0, `enemies spawned (${game.world.count('enemy')})`);

// 4. Full simulation step runs without throwing across many frames.
for (let i = 0; i < 600; i++) {
  updatePlayerControl(game, CONFIG.FIXED_DT);
  updateMovement(game, CONFIG.FIXED_DT);
  updateWeapons(game, CONFIG.FIXED_DT);
  updateEnemyAI(game, CONFIG.FIXED_DT);
  updateCollision(game, CONFIG.FIXED_DT);
  updatePickups(game, CONFIG.FIXED_DT);
  updateParticles(game, CONFIG.FIXED_DT);
  updateLeveling(game, CONFIG.FIXED_DT);
}
console.log('  ok - 600 frames simulated without exception');
console.log(`      enemies=${game.world.count('enemy')} bullets=${game.world.count('bullet')} level=${game.level}`);

// 5. Offer generation returns 3 distinct cards.
const offers = generateOffers(game, 'levelup');
assert(offers.length === 3, 'level-up offers 3 cards');
assert(new Set(offers.map((o) => o.id)).size === 3, 'offers are distinct');

// 6. applyCard levels a passive and recomputes stats.
const oldDmg = game.stats.damageMult;
applyCard(game, { kind: 'passive', id: 'damage', name: 'DAMAGE', glyph: 'damage', rarity: 'common', desc: '', level: 0, maxLevel: 5, type: 'passive' });
assert((game.build.passives.get('damage') || 0) === 1, 'damage passive applied to build');
assert(game.stats.damageMult > oldDmg, 'stats recomputed after apply');

// 7. killEnemy splits an asteroid and drops a gem.
const enemyId = spawnEnemy(game, 'asteroid_medium', 400, 400);
const medCount = game.world.count('enemy');
import { killEnemy } from '../src/combat.js';
killEnemy(game, enemyId);
assert(game.world.count('enemy') === medCount + 1, 'medium asteroid splits into 2 smalls');

const smallId = spawnEnemy(game, 'asteroid_small', 500, 500);
const gemBefore = game.world.count('pickup');
killEnemy(game, smallId);
assert(game.world.count('pickup') >= gemBefore + 1, 'gem dropped on death');

// 8. Evolved weapon data links are consistent.
for (const w of Object.values(WEAPON_MAP)) {
  if (w.evolve) assert(WEAPON_MAP[w.evolve.into], `evolution target exists: ${w.evolve.into}`);
}

// 8b. New weapons/passives: aura, arc coil, split core.
const ctx2 = { game, world: game.world, stats: game.stats, x: 300, y: 300, rot: 0, time: game.time };
WEAPON_MAP.plasmaAura.fire(ctx2, 1);
assert(game.aura && game.aura.radius > 0, 'plasma aura activates');

const bulletsBefore = game.world.count('bullet');
applyCard(game, { kind: 'passive', id: 'splitCore', name: 'SPLIT CORE', glyph: 'splitCore', rarity: 'rare', desc: '', level: 0, maxLevel: 5, type: 'passive' });
const ctx3 = { game, world: game.world, stats: game.stats, x: 300, y: 300, rot: 0, time: game.time };
WEAPON_MAP.machineGun.fire(ctx3, 1);
assert(game.world.count('bullet') === bulletsBefore + 2, 'split core adds +1 projectile');

spawnEnemy(game, 'asteroid_small', 320, 300);
WEAPON_MAP.arcCoil.fire(ctx3, 1);
assert(game.world.count('bolt') > 0, 'arc coil chains bolts');

// 9. Boss spawns at the 5:00 mark, and a fresh run resets the director.
game.time = 300;
updateWaveDirector(game, CONFIG.FIXED_DT);
const hasBoss = [...game.world.query('enemy')].some((id) => game.world.get(id, 'enemy').tier === 4);
assert(hasBoss, 'boss spawned at 5:00');
startRun(game);
assert(!game.wd && game.time === 0, 'wave director + clock reset on new run');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
