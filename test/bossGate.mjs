// Verifies that asteroid spawning is suppressed while the Colossus boss is
// alive, and resumes once it is killed. Run with: node test/bossGate.mjs

import { CONFIG } from '../src/config.js';
import { createGame, startRun } from '../src/state.js';
import { defaultSave } from '../src/save.js';
import { spawnEnemy, killEnemy } from '../src/combat.js';
import { updateWaveDirector } from '../src/systems/waveDirector.js';

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
check(bossId >= 0, 'colossus spawned');
const atSpawn = game.world.count('enemy');

// Simulate ~30 director ticks (many seconds) while the boss is alive.
for (let i = 0; i < 300; i++) updateWaveDirector(game, CONFIG.FIXED_DT);
check(game.world.count('enemy') === atSpawn, `no asteroids spawned while boss alive (${atSpawn} enemies)`);

// Kill the boss; spawning should resume.
killEnemy(game, bossId);
const afterKill = game.world.count('enemy');
const resumed = [];
for (let i = 0; i < 200; i++) {
  updateWaveDirector(game, CONFIG.FIXED_DT);
  resumed.push(game.world.count('enemy'));
}
check(resumed.some((c) => c > afterKill), 'spawning resumed after boss killed');

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
