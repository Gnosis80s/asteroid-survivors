// Boot + main loop. Fixed-timestep simulation decoupled from rendering,
// a clean state machine, and global key handling (pause/mute/debug).

import { CONFIG } from './config.js';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { createGame } from './state.js';
import { loadSave, persistSave } from './save.js';

import { updatePlayerControl } from './systems/playerControl.js';
import { updateMovement } from './systems/movement.js';
import { updateWeapons } from './systems/weaponSystem.js';
import { updateEnemyAI } from './systems/enemyAI.js';
import { updateCollision } from './systems/collision.js';
import { updatePickups } from './systems/pickup.js';
import { updateParticles } from './systems/particles.js';
import { updateWaveDirector } from './systems/waveDirector.js';
import { updateLeveling, openChest } from './systems/leveling.js';
import { renderWorld } from './systems/render.js';
import * as ui from './systems/ui.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, CONFIG.WIDTH, CONFIG.HEIGHT);
const input = new Input();
const audio = new Audio();
const save = loadSave();
const game = createGame();

game.input = input;
game.audio = audio;
game.save = save;
game.meta = save.meta;
game.gold = save.gold;
game.selectedCharId = save.unlocked[0] || 'voyager';
game.paused = false;
game.debug = false;

function resize() {
  canvas.width = CONFIG.WIDTH;
  canvas.height = CONFIG.HEIGHT;
  const scale = Math.min(window.innerWidth / CONFIG.WIDTH, window.innerHeight / CONFIG.HEIGHT);
  const cw = CONFIG.WIDTH * scale;
  const ch = CONFIG.HEIGHT * scale;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  game.view = { scale, ox: (window.innerWidth - cw) / 2, oy: (window.innerHeight - ch) / 2 };
}
window.addEventListener('resize', resize);
resize();

function clearNearbyEnemies(g) {
  const pt = g.world.get(g.playerId, 'transform');
  if (!pt) return;
  for (const id of g.world.query('enemy', 'transform')) {
    const t = g.world.get(id, 'transform');
    const dx = t.x - pt.x, dy = t.y - pt.y;
    if (dx * dx + dy * dy < 260 * 260) g.world.destroy(id);
  }
  g.banner = { text: 'REVIVED', ttl: 2 };
}

function finishRun(win) {
  const gold = Math.floor(game.goldEarned * game.stats.goldMult);
  game.gold += gold;
  game.save.gold = game.gold;
  game.save.runs += 1;
  game.save.bestTime = Math.max(game.save.bestTime, Math.floor(game.time));
  game.save.bestLevel = Math.max(game.save.bestLevel, game.level);
  persistSave(game.save);
  game.state = win ? 'victory' : 'gameover';
  game.bossAlive = -1;
  audio[win ? 'victory' : 'gameover']?.();
}

// Abandon the run and return to the menu, keeping any gold earned.
function quitToMenu() {
  const gold = Math.floor(game.goldEarned * game.stats.goldMult);
  game.gold += gold;
  game.save.gold = game.gold;
  game.save.bestTime = Math.max(game.save.bestTime, Math.floor(game.time));
  game.save.bestLevel = Math.max(game.save.bestLevel, game.level);
  persistSave(game.save);
  game.state = 'menu';
  game.paused = false;
  game.bossAlive = -1;
  game.banner = null;
  game.world.clear();
  audio.setThrust(false);
}

game.onDeath = () => finishRun(false);
game.onVictory = () => finishRun(true);
game.onBossKilled = (type) => {
  game.bossAlive = -1;
  if (type === 'boss_singularity') game.onVictory();
};
game.onRevive = () => clearNearbyEnemies(game);
game.onChest = () => openChest(game);
game.onQuit = () => quitToMenu();

function update(dt) {
  game.shake = Math.max(0, game.shake - dt * 26);
  if (game.banner) {
    game.banner.ttl -= dt;
    if (game.banner.ttl <= 0) game.banner = null;
  }

  if (input.justPressed('KeyM')) audio.toggleMute();
  if (input.justPressed('KeyP') && game.state === 'playing' && !game.quitConfirm) game.paused = !game.paused;
  if (input.justPressed('KeyT') && game.state === 'playing') game.debug = !game.debug;
  if (input.justPressed('Escape') && game.state === 'playing' && !game.quitConfirm) {
    game.quitConfirm = true;
    game.quitSel = 0;
    game.quitArmed = true;
  }

  switch (game.state) {
    case 'playing':
      if (game.quitConfirm) {
        if (!game.quitArmed) ui.updateQuitConfirm(game, dt);
        game.quitArmed = false;
        break;
      }
      if (game.paused) break;
      updatePlayerControl(game, dt);
      updateMovement(game, dt);
      updateWeapons(game, dt);
      updateEnemyAI(game, dt);
      updateCollision(game, dt);
      updatePickups(game, dt);
      updateParticles(game, dt);
      updateWaveDirector(game, dt);
      updateLeveling(game, dt);
      break;
    default:
      ui.update(game, dt);
      break;
  }

  // Silence the engine sound whenever we're not actively flying.
  if (game.state !== 'playing' || game.paused || game.quitConfirm) audio.setThrust(false);
}

function render() {
  renderWorld(game, renderer);
  ui.render(game, renderer);

  if (game.debug && game.state === 'playing') {
    renderer.text(
      `fps ${fps}  enemies ${game.world.count('enemy')}  entities ${game.world.nextId}  xp ${Math.floor(game.xp)}/${game.xpNeeded}`,
      8, CONFIG.HEIGHT - 40, { size: 11, color: 'gem', align: 'left' }
    );
  }
  if (game.paused && game.state === 'playing') {
    renderer.rect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT, { color: 'bg', alpha: 0.4 });
    renderer.text('PAUSED', CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, { size: 40, color: 'white', align: 'center' });
  }

  renderer.postProcess();
}

let fps = 60;
let fpsAcc = 0, fpsCount = 0;
let last = performance.now();
let acc = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, CONFIG.MAX_FRAME_DT);
  acc += dt;

  while (acc >= CONFIG.FIXED_DT) {
    update(CONFIG.FIXED_DT);
    acc -= CONFIG.FIXED_DT;
  }

  fpsAcc += dt;
  fpsCount++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsCount / fpsAcc);
    fpsAcc = 0;
    fpsCount = 0;
  }

  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
