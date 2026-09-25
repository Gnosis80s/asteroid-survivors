// Verifies that asteroid spawning is suppressed while the Colossus boss is
// alive, and resumes once it is killed. Run with: node test/bossGate.mjs

import { CONFIG } from '../src/config.js';
import { createGame, startRun } from '../src/state.js';
import { defaultSave } from '../src/save.js';
import { spawnEnemy, killEnemy } from '../src/combat.js';
import { updateWaveDirector } from '../src/systems/waveDirector.js';
import { updateEnemyAI } from '../src/systems/enemyAI.js';
import { updateMovement } from '../src/systems/movement.js';

const game = createGame();
game.input = { isDown: () => false, justPressed: () => false, mouse: { x: 0, y: 0, pressed: false } };
game.meta = defaultSave().meta;
game.char = CONFIG.characters[0];
game.onBossKilled = (type) => { game.bossAlive = -1; };
game.onVictory = () => {};
game.onChest = () => {};
startRun(game);

let fails = 0;
const check = (cond, msg) => {
  console.log((cond ? 'ok - ' : 'FAIL - ') + msg);
  if (!cond) fails++;
};

// Advance to the 5:00 mark so the Colossus spawns.
game.time = 300;
updateWaveDirector(game, CONFIG.FIXED_DT);
const bossId = game.bossAlive;
const boss = game.world.get(bossId, 'enemy');
const bossRender = game.world.get(bossId, 'render');
check(bossId >= 0, 'first boss spawned');
check(!!boss && boss.name === 'The Hive', 'first boss is the Hive alien ship');
check(!!bossRender && bossRender.type === 'alienShip', 'first boss uses the alien ship render type');
check(!!game.banner && game.banner.alert === true, 'first boss announcement uses alert layout');
for (let i = 0; i < 100; i++) {
  updateMovement(game, CONFIG.FIXED_DT);
  updateEnemyAI(game, CONFIG.FIXED_DT);
}
check(game.world.count('enemyBullet') > 0, 'Hive fires a distinct enemy pattern');
const atSpawn = game.world.count('enemy');

// Simulate ~30 director ticks (many seconds) while the boss is alive.
for (let i = 0; i < 300; i++) updateWaveDirector(game, CONFIG.FIXED_DT);
check(game.world.count('enemy') === atSpawn, `no asteroids spawned while boss alive (${atSpawn} enemies)`);

// Kill the boss; spawning should resume.
killEnemy(game, bossId);
check(game.shake >= 20 && game.hitStop >= 0.12, 'boss death uses the shared impact');
const afterKill = game.world.count('enemy');
const resumed = [];
for (let i = 0; i < 200; i++) {
  updateWaveDirector(game, CONFIG.FIXED_DT);
  resumed.push(game.world.count('enemy'));
}
check(resumed.some((c) => c > afterKill), 'spawning resumed after boss killed');

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
