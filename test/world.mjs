import { CONFIG } from '../src/config.js';
import { createGame, startRun } from '../src/state.js';
import { defaultSave } from '../src/save.js';
import { spawnEnemy, randomOffscreenPos, spawnPlayerBullet, killEnemy } from '../src/combat.js';
import { updateMovement } from '../src/systems/movement.js';
import { updateCamera } from '../src/systems/camera.js';
import { updateCollision } from '../src/systems/collision.js';
import { updateObjective } from '../src/systems/objectives.js';
import { renderHUD } from '../src/systems/ui.js';
import { updateWaveDirector } from '../src/systems/waveDirector.js';
import { renderWorld } from '../src/systems/render.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ok -', msg);
  else { console.error('  FAIL -', msg); failures++; }
}

const DT = CONFIG.FIXED_DT;

function shootActiveBeacon(game, damage) {
  const part = game.objective.parts[game.objective.liveIndex];
  const id = part.id;
  spawnPlayerBullet(game, {
    x: part.x, y: part.y, angle: 0, speed: 0, damage,
    radius: 4, lifetime: 1, color: 'playerBullet', pierce: 0,
  });
  updateCollision(game, DT);
  return { part, id };
}

function freshGame() {
  const game = createGame();
  game.input = { isDown: () => false, justPressed: () => false, mouse: { x: 0, y: 0, pressed: false } };
  game.meta = defaultSave().meta;
  game.char = CONFIG.characters[0];
  game.selectedCharId = 'voyager';
  startRun(game);
  return game;
}

const HW = CONFIG.world.width, HH = CONFIG.world.height;

console.log('beacon positions cover the world without clustering');
{
  const realRandom = Math.random;
  const layouts = new Set();
  try {
    for (const randomValue of [0, 0.999999]) {
      Math.random = () => randomValue;
      const game = freshGame();
      const parts = game.objective.parts;
      const pt = game.world.get(game.playerId, 'transform');
      let minPairDistance = Infinity;

      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          minPairDistance = Math.min(minPairDistance, Math.hypot(parts[i].x - parts[j].x, parts[i].y - parts[j].y));
        }
      }

      const columns = new Set(parts.map((p) => Math.min(2, Math.floor((p.x / HW) * 3))));
      const rows = new Set(parts.map((p) => Math.min(1, Math.floor((p.y / HH) * 2))));
      assert(parts.length === CONFIG.objective.count, `random edge ${randomValue} still places every pod`);
      assert(parts.every((p) => p.x >= 0 && p.x <= HW && p.y >= 0 && p.y <= HH), `random edge ${randomValue} keeps pods in bounds`);
      assert(parts.every((p) => Math.hypot(p.x - pt.x, p.y - pt.y) >= CONFIG.objective.spawnMinFromPlayer), `random edge ${randomValue} keeps pods away from spawn`);
      assert(minPairDistance >= CONFIG.objective.spawnMinGap, `random edge ${randomValue} prevents clustering`);
      assert(columns.size === 3 && rows.size === 2, `random edge ${randomValue} covers every map region`);
      layouts.add(parts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|'));
    }
  } finally {
    Math.random = realRandom;
  }
  assert(layouts.size === 2, 'pod layouts change between randomized runs');
}

// ---- Camera: starts centered on the player, follows smoothly, clamps ------
console.log('camera follows player and clamps to world bounds');
{
  const game = freshGame();
  const cam = game.camera;
  assert(cam.x === HW / 2 - CONFIG.WIDTH / 2 && cam.y === HH / 2 - CONFIG.HEIGHT / 2, 'camera starts centered on spawn');
  assert(cam.x >= 0 && cam.y >= 0 && cam.x <= HW - CONFIG.WIDTH && cam.y <= HH - CONFIG.HEIGHT, 'initial camera inside world');

  // Player pinned near each world corner -> camera must clamp to the corner.
  const pt = game.world.get(game.playerId, 'transform');
  for (const [x, y] of [[5, 5], [HW - 5, HH - 5], [0, HH - 5], [HW - 5, 0]]) {
    pt.x = x; pt.y = y;
    for (let i = 0; i < 120; i++) updateCamera(game, DT);
    assert(game.camera.x >= 0 && game.camera.x <= HW - CONFIG.WIDTH, `camera x clamped after player at (${x},${y})`);
    assert(game.camera.y >= 0 && game.camera.y <= HH - CONFIG.HEIGHT, `camera y clamped after player at (${x},${y})`);
  }

  // Player near the middle -> camera recenters on them.
  pt.x = HW / 2; pt.y = HH / 2;
  for (let i = 0; i < 240; i++) updateCamera(game, DT);
  assert(Math.abs(game.camera.x - (HW / 2 - CONFIG.WIDTH / 2)) < 1, 'camera recenters on mid-world player');
}

// ---- Spawning: offscreen spawns are always inside the world ---------------
console.log('offscreen spawns stay inside the world');
{
  const game = freshGame();
  const cam = game.camera;
  for (let i = 0; i < 200; i++) {
    const [x, y] = randomOffscreenPos(game);
    assert(x >= 0 && x <= HW && y >= 0 && y <= HH, `spawn (${x.toFixed(1)},${y.toFixed(1)}) in world bounds`);
  }
  // A corner camera must still produce in-world points.
  let [x, y] = randomOffscreenPos(game);
  assert(x >= 0 && x <= HW && y >= 0 && y <= HH, 'corner-camera spawn in-bounds');
  const ok = (() => { for (let i = 0; i < 200; i++) { [x, y] = randomOffscreenPos(game); if (x < 0 || x > HW || y < 0 || y > HH) return false; } return true; })();
  assert(ok, '200 spawns all in-bounds');
}

console.log('beacon cycle: destroying every beacon starts another cycle');
{
  const game = freshGame();
  game.stats.critChance = 0;
  const objective = game.objective;
  const firstCycle = [...objective.parts];
  const initialBuildSize = game.build.weapons.size;
  const initialGold = game.goldEarned;

  assert(objective.parts.length === CONFIG.objective.count, `beacon cycle contains ${CONFIG.objective.count} beacons`);
  assert(objective.timer === CONFIG.objective.timer, 'beacon timer starts at configured value');
  assert(game.world.count('objective') === 1, 'only the current beacon exists in the world');

  let guard = 0;
  while (objective.found < CONFIG.objective.count && guard++ < CONFIG.objective.count + 1) {
    shootActiveBeacon(game, CONFIG.objective.hp);
    updateObjective(game, DT);
    if (objective.nextBeaconDelay > 0) updateObjective(game, objective.nextBeaconDelay + DT);
  }
  if (objective.nextBeaconDelay > 0) updateObjective(game, objective.nextBeaconDelay + DT);

  assert(firstCycle.every((part) => part.destroyed), 'every beacon in the completed cycle is destroyed');
  assert(objective.found === CONFIG.objective.count, 'all five beacons are counted as found');
  assert(objective.parts.every((part) => !part.destroyed && !part.missed), 'a fresh beacon cycle starts automatically');
  assert(objective.liveIndex === 0, 'the fresh cycle starts with its first beacon');
  assert(objective.timer === CONFIG.objective.timer, 'destroying a beacon resets the countdown');
  assert(game.world.count('objective') === 1, 'exactly one replacement beacon is active');
  assert(game.state === 'playing', 'destroying every beacon does not win or end the run');
  assert(game.cardMode === null && game.build.weapons.size === initialBuildSize, 'beacons never open upgrade cards');
  assert(game.goldEarned === initialGold + CONFIG.objective.count * 25, 'beacons award credits only');
}

console.log('beacon destruction: contact alone does not destroy the target');
{
  const game = freshGame();
  const objective = game.objective;
  const part = objective.parts[0];
  const playerT = game.world.get(game.playerId, 'transform');
  const hp = game.world.get(part.id, 'objective').hp;
  playerT.x = part.x;
  playerT.y = part.y;
  updateObjective(game, DT);
  assert(game.world.get(part.id, 'objective')?.hp === hp, 'flying into a beacon does not destroy it');
  assert(!part.destroyed && objective.found === 0 && objective.misses === 0, 'contact does not advance the beacon cycle');
}

console.log('beacon destruction: bullets damage the target before destruction');
{
  const game = freshGame();
  game.stats.critChance = 0;
  const objective = game.objective;
  const first = shootActiveBeacon(game, CONFIG.objective.hp * 0.25);
  const damaged = game.world.get(first.id, 'objective');
  const goldBefore = game.goldEarned;
  const enemiesBefore = game.world.count('enemy');
  const pickupsBefore = game.world.count('pickup');
  assert(damaged && damaged.hp === CONFIG.objective.hp * 0.75, 'a nonlethal hit reduces beacon health');
  assert(!first.part.destroyed && objective.found === 0 && objective.misses === 0, 'a nonlethal hit does not advance the cycle');
  assert(game.goldEarned === goldBefore && game.world.count('enemy') === enemiesBefore, 'a nonlethal hit does not reward or spawn ships');

  objective.timer = 12;
  const expectedDelay = CONFIG.objective.postDestroyDelay + objective.timer;
  const lethal = shootActiveBeacon(game, CONFIG.objective.hp);
  assert(game.world.get(lethal.id, 'objective')?.hp <= 0, 'a lethal hit destroys beacon health');
  updateObjective(game, DT);
  assert(lethal.part.destroyed && objective.found === 1, 'destroying a beacon advances the cycle');
  assert(objective.misses === 0 && game.world.count('enemy') === enemiesBefore, 'destroying a beacon does not spawn enemy ships');
  assert(game.goldEarned === goldBefore + 25, 'destroying a beacon awards its reward');
  assert(game.shake >= 20 && game.hitStop >= 0.12, 'destroying a beacon uses the boss death impact');
  assert(objective.nextBeaconDelay === expectedDelay, 'the next beacon waits 15 seconds plus the remaining timer');
  assert(objective.timer === 0 && game.world.count('objective') === 0, 'the next beacon does not appear immediately');
  assert(game.world.count('pickup') === pickupsBefore + 1, 'destroying a beacon drops a pickup');
  const beaconGemId = game.world.query('pickup').find((id) => game.world.get(id, 'pickup')?.kind === 'gem');
  const beaconGem = beaconGemId != null ? game.world.get(beaconGemId, 'pickup') : null;
  const beaconGemRender = beaconGemId != null ? game.world.get(beaconGemId, 'render') : null;
  assert(beaconGem && beaconGem.big && beaconGem.value === CONFIG.pickup.bigGemValue && beaconGemRender?.color === 'bigGem', 'beacon destruction drops a high-value red gem');
  const delayBeforeWait = objective.nextBeaconDelay;
  updateObjective(game, delayBeforeWait - DT);
  assert(objective.nextBeaconDelay > 0 && game.world.count('objective') === 0, 'the next beacon remains hidden during the delay');
  updateObjective(game, objective.nextBeaconDelay);
  assert(objective.nextBeaconDelay === 0 && game.world.count('objective') === 1, 'the next beacon appears after the delay');
  assert(objective.timer === CONFIG.objective.timer, 'the next beacon starts with a fresh timer');
}

console.log('beacons shoot at the player');
{
  const game = freshGame();
  const objective = game.objective;
  const part = objective.parts[objective.liveIndex];
  const live = game.world.get(part.id, 'objective');
  const playerT = game.world.get(game.playerId, 'transform');
  playerT.x = part.x + 400;
  playerT.y = part.y;

  const bulletsBefore = game.world.count('enemyBullet');
  updateObjective(game, CONFIG.objective.fireWarmup - DT);
  assert(game.world.count('enemyBullet') === bulletsBefore, 'a beacon holds fire during warmup');
  assert(live.fireTimer > 0, 'the beacon keeps a positive fire timer while idle');

  updateObjective(game, DT);
  const shots = game.world.query('enemyBullet')
    .map((id) => ({ shot: game.world.get(id, 'enemyBullet'), motion: game.world.get(id, 'motion') }));
  assert(shots.length === bulletsBefore + CONFIG.objective.fireBurst, 'a beacon fires a burst once its timer elapses');
  assert(shots.every(({ shot }) => shot.damage === CONFIG.objective.fireDamage), 'beacon shots use the configured damage');

  const aimed = Math.atan2(playerT.y - part.y, playerT.x - part.x);
  const offAim = shots.every(({ motion }) => {
    const angle = Math.atan2(motion.vy, motion.vx);
    const delta = Math.atan2(Math.sin(angle - aimed), Math.cos(angle - aimed));
    return Math.abs(delta) <= CONFIG.objective.fireSpread / 2 + 0.01;
  });
  assert(offAim, 'beacon shots are aimed at the player within the burst spread');
  assert(live.fireTimer > 0 && live.fireTimer <= CONFIG.objective.fireInterval, 'firing resets the beacon fire timer');

  const bulletsBeforeReload = game.world.count('enemyBullet');
  updateObjective(game, CONFIG.objective.fireInterval);
  assert(game.world.count('enemyBullet') === bulletsBeforeReload + CONFIG.objective.fireBurst, 'a beacon repeats its burst on schedule');
}

console.log('enemy saucers drop green gems when killed');
{
  const game = freshGame();
  const scout = spawnEnemy(game, 'saucer_scout', HW / 2 - 40, HH / 2);
  const gunner = spawnEnemy(game, 'saucer_gunner', HW / 2 + 40, HH / 2);
  killEnemy(game, scout);
  killEnemy(game, gunner);
  const gems = game.world.query('pickup')
    .map((id) => ({ pickup: game.world.get(id, 'pickup'), render: game.world.get(id, 'render') }))
    .filter(({ pickup }) => pickup?.kind === 'gem');
  assert(gems.length === 2, 'each enemy saucer drops a gem');
  assert(gems.every(({ pickup, render }) => !pickup.big && render?.color === 'gem'), 'saucer drops are green gems');
}

console.log('saucer rendering uses circular bodies');
{
  const game = freshGame();
  const id = spawnEnemy(game, 'saucer_scout', HW / 2, HH / 2);
  const enemyTransform = game.world.get(id, 'transform');
  const enemyRender = game.world.get(id, 'render');
  const calls = [];
  const renderer = {
    setShake() {}, setCamera() {}, begin() {}, screen() {},
    circle: (...args) => calls.push({ method: 'circle', args }),
    line: (...args) => calls.push({ method: 'line', args }),
    polygon: (...args) => calls.push({ method: 'polygon', args }),
    rect: (...args) => calls.push({ method: 'rect', args }),
    polyline: (...args) => calls.push({ method: 'polyline', args }),
  };
  renderWorld(game, renderer);
  const body = calls.find((call) => call.method === 'circle'
    && call.args[0] === enemyTransform.x
    && call.args[1] === enemyTransform.y
    && call.args[2] === enemyRender.size);
  assert(!!body, 'saucer body is rendered with a circle primitive');
}

console.log('beacon miss: timer expiry spawns enemy ships only');
{
  const game = freshGame();
  const objective = game.objective;
  const missed = objective.parts[0];
  const missedPosition = { x: missed.x, y: missed.y };
  objective.timer = 0.01;
  updateObjective(game, 0.02);

  const enemies = game.world.query('enemy').map((id) => game.world.get(id, 'enemy'));
  const active = objective.parts[objective.liveIndex];
  assert(objective.misses === 1, 'a timed-out beacon records a miss');
  assert(game.banner?.alert === true, 'missed-beacon announcement uses alert layout');
  assert(enemies.length === CONFIG.objective.missWaveBase, 'a miss spawns the configured ship wave');
  assert(enemies.every((enemy) => enemy.type === 'saucer_scout' || enemy.type === 'saucer_gunner'), 'miss wave contains only enemy ships');
  assert(enemies.every((enemy) => !enemy.type.startsWith('asteroid_')), 'miss wave contains no asteroids');
  assert(missed.missed, 'timed-out beacon is marked missed');
  assert(active && (active.x !== missedPosition.x || active.y !== missedPosition.y), 'the next beacon relocates');
  assert(objective.timer === CONFIG.objective.timer, 'a miss resets the beacon countdown');
  assert(game.state === 'playing', 'missing a beacon does not end the run');
  assert(game.world.count('objective') === 1, 'missed beacon is removed and one replacement is active');
}

console.log('beacon misses: repeated timeouts increase ship pressure');
{
  const game = freshGame();
  for (let i = 0; i < 3; i++) {
    game.objective.timer = 0;
    updateObjective(game, DT);
  }

  const enemies = game.world.query('enemy').map((id) => game.world.get(id, 'enemy'));
  const expected = CONFIG.objective.missWaveBase * 3 + CONFIG.objective.missWaveGrowth * 3;
  assert(game.objective.misses === 3, 'each timeout increments the miss counter');
  assert(enemies.length === expected, 'each miss adds more enemy ships');
  assert(enemies.some((enemy) => enemy.type === 'saucer_gunner'), 'later alert waves add gunner ships');
  assert(enemies.every((enemy) => !enemy.type.startsWith('asteroid_')), 'repeated alert waves still contain no asteroids');
}

console.log('beacon HUD: clear find target timer bar');
{
  const game = freshGame();
  const calls = [];
  const renderer = {};
  for (const method of ['circle', 'line', 'polygon', 'rect', 'text']) {
    renderer[method] = (...args) => calls.push({ method, args });
  }

  renderHUD(game, renderer);
  const label = calls.find((call) => call.method === 'text' && call.args[0].startsWith('FIND AND DESTROY ENEMY BEACON'));
  const bar = calls.find((call) => call.method === 'rect' && call.args[2] === 440 && call.args[3] === 12);
  assert(!!label, 'HUD displays FIND AND DESTROY ENEMY BEACON');
  assert(!!label && label.args[0].includes(`${CONFIG.objective.timer}s`), 'HUD label includes the countdown');
  assert(!!bar, 'HUD displays a dedicated beacon timer bar');
  const activePart = game.objective.parts[game.objective.liveIndex];
  game.world.destroy(activePart.id);
  activePart.id = -1;
  activePart.destroyed = true;
  game.objective.nextBeaconDelay = 27;
  game.objective.nextBeaconDelayTotal = 27;
  calls.length = 0;
  renderHUD(game, renderer);
  const waitingLabel = calls.find((call) => call.method === 'text' && call.args[0].startsWith('NEXT ENEMY BEACON IN'));
  const waitingBar = calls.find((call) => call.method === 'rect' && call.args[2] === 440 && call.args[3] === 12);
  assert(!waitingLabel, 'HUD hides the next-beacon countdown while no beacon is active');
  assert(!waitingBar, 'HUD hides the beacon timer bar while no beacon is active');
}

console.log('alert announcements are smaller and higher');
{
  const game = freshGame();
  const calls = [];
  const renderer = {};
  for (const method of ['circle', 'line', 'polygon', 'rect', 'text']) {
    renderer[method] = (...args) => calls.push({ method, args });
  }
  game.banner = { text: 'BEACON MISSED: SHIPS INBOUND', ttl: 2, alert: true };
  renderHUD(game, renderer);
  const alert = calls.find((call) => call.method === 'text' && call.args[0] === game.banner.text);
  assert(!!alert && alert.args[2] < CONFIG.HEIGHT * 0.3, 'alert announcement is higher on screen');
  assert(!!alert && alert.args[3].size < 34, 'alert announcement uses smaller text');

  calls.length = 0;
  game.banner = { text: 'WEAPON EVOLVED: TEST', ttl: 2 };
  renderHUD(game, renderer);
  const normal = calls.find((call) => call.method === 'text' && call.args[0] === game.banner.text);
  assert(!!normal && normal.args[2] === CONFIG.HEIGHT * 0.3 && normal.args[3].size === 34, 'non-alert announcements retain their layout');
}

console.log('objective resets on a fresh run');
{
  const game = freshGame();
  game.objective.found = 12;
  game.objective.misses = 4;
  const before = game.objective.parts.length;
  startRun(game);
  assert(game.objective && game.objective.parts.length === before, 'new run creates a fresh beacon cycle');
  assert(game.objective.timer === CONFIG.objective.timer, 'new run resets the beacon timer');
  assert(game.objective.found === 0 && game.objective.misses === 0, 'new run resets beacon counters');
  assert(game.camera && game.camera.x === HW / 2 - CONFIG.WIDTH / 2, 'new run resets the camera');
}


console.log('far enemies despawn; bosses survive');
{
  const game = freshGame();
  const mid = spawnEnemy(game, 'asteroid_medium', HW / 2, HH / 2 + CONFIG.despawnRadius + 200);
  const boss = spawnEnemy(game, 'boss_colossus', HW / 2, HH / 2 + CONFIG.despawnRadius + 400);
  updateWaveDirector(game, DT);
  const enemyCulled = game.world.query('enemy');
  const stillHasMid = [...enemyCulled].some((id) => id === mid);
  const stillHasBoss = [...enemyCulled].some((id) => id === boss);
  assert(!stillHasMid, 'regular enemy beyond despawnRadius is culled');
  assert(stillHasBoss, 'boss beyond despawnRadius survives');
}

// ---- Movement: player clamps, enemies bounce ------------------------------
console.log('movement respects world edges');
{
  const game = freshGame();
  const pt = game.world.get(game.playerId, 'transform');
  const mot = game.world.get(game.playerId, 'motion');
  pt.x = -20; pt.y = HH + 30; mot.vx = -40; mot.vy = 40;
  updateMovement(game, DT);
  assert(pt.x === 0, 'player clamps at left world edge');
  assert(pt.y === HH, 'player clamps at bottom world edge');
  pt.x = HW + 20; mot.vx = 50;
  updateMovement(game, DT);
  assert(pt.x === HW, 'player clamps at right world edge');

  const e = spawnEnemy(game, 'asteroid_small', 5, 5);
  const et = game.world.get(e, 'transform');
  const em = game.world.get(e, 'motion');
  et.x = -5; em.vx = -100; em.vy = 0;
  updateMovement(game, DT);
  assert(et.x >= 0 && em.vx >= 0, 'enemy bounces off left world edge');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);