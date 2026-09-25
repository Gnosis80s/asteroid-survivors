// Boot + main loop. Fixed-timestep simulation decoupled from rendering,
// a clean state machine, and global key handling (pause/mute/debug).

import { CONFIG } from './config.js';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { createGame } from './state.js';
import { loadSave, persistSave, loadSettings } from './save.js';
import { clearNearbyEnemies } from './combat.js';

import { updatePlayerControl } from './systems/playerControl.js';
import { updateMovement } from './systems/movement.js';
import { updateWeapons } from './systems/weaponSystem.js';
import { updateEnemyAI } from './systems/enemyAI.js';
import { updateCollision } from './systems/collision.js';
import { updatePickups } from './systems/pickup.js';
import { updateParticles } from './systems/particles.js';
import { updateWaveDirector, findLiveBossId } from './systems/waveDirector.js';
import { updateLeveling, openChest } from './systems/leveling.js';
import { updateCamera } from './systems/camera.js';
import { updateObjective } from './systems/objectives.js';
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
game.settings = loadSettings();
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

function finishRun(win) {
  const gold = Math.floor(game.goldEarned * game.stats.goldMult);
  game.gold += gold;
  game.save.gold = game.gold;
  game.save.runs += 1;

  const time = Math.floor(game.time);
  game.newBest = {
    time: time > game.save.bestTime,
    level: game.level > game.save.bestLevel,
    credits: gold > game.save.bestCredits,
  };
  game.save.bestTime = Math.max(game.save.bestTime, time);
  game.save.bestLevel = Math.max(game.save.bestLevel, game.level);
  game.save.bestCredits = Math.max(game.save.bestCredits, gold);
  game.runCredits = gold;

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
  // Point the HUD boss bar at any remaining live boss (boss timers can
  // overlap when the player is slow to kill the previous one).
  game.bossAlive = findLiveBossId(game);
  if (type === 'boss_singularity') game.onVictory();
};
game.onRevive = () => {
  clearNearbyEnemies(game);
  game.banner = { text: 'REVIVED', ttl: 2 };
};
game.onChest = () => openChest(game);
game.onQuit = () => quitToMenu();

function update(dt) {
  // Hit-stop: brief freeze for big kills.
  if (game.hitStop > 0) {
    game.hitStop -= dt;
    return;
  }
  game.shake = Math.max(0, game.shake - dt * 26);
  game.evoFlash = Math.max(0, game.evoFlash - dt * 2.5);
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
      updateCamera(game, dt);
      updateWeapons(game, dt);
      updateEnemyAI(game, dt);
      updateCollision(game, dt);
      updatePickups(game, dt);
      updateParticles(game, dt);
      updateWaveDirector(game, dt);
      updateLeveling(game, dt);
      updateObjective(game, dt);
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

  if (game.evoFlash > 0) renderer.flash('boss', game.evoFlash * 0.4);

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
    // Consume edge-triggered input per tick: multiple ticks in one frame must
    // not see the same keypress twice (pause would toggle itself back off),
    // and frames with zero ticks must not drop presses (144 Hz displays).
    input.endFrame();
  }

  fpsAcc += dt;
  fpsCount++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsCount / fpsAcc);
    fpsAcc = 0;
    fpsCount = 0;
  }

  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
