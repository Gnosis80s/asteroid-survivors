// Reads input and drives the player ship: rotation, thrust (Newtonian),
// retro-braking, and the dash burst. Also emits the thruster particle trail.

import { CONFIG } from '../config.js';
import { spawnParticle } from '../combat.js';

export function updatePlayerControl(game, dt) {
  const input = game.input;
  const t = game.world.get(game.playerId, 'transform');
  const m = game.world.get(game.playerId, 'motion');
  if (!t || !m) return;

  const ang = CONFIG.player.angularSpeed * dt;
  if (input.isDown('ArrowLeft') || input.isDown('KeyA')) t.rot -= ang;
  if (input.isDown('ArrowRight') || input.isDown('KeyD')) t.rot += ang;

  const thrusting = input.isDown('ArrowUp') || input.isDown('KeyW');
  if (thrusting) {
    m.vx += Math.cos(t.rot) * game.shipThrust * dt;
    m.vy += Math.sin(t.rot) * game.shipThrust * dt;
    if (Math.random() < 0.75) {
      spawnParticle(game, {
        x: t.x - Math.cos(t.rot) * 13, y: t.y - Math.sin(t.rot) * 13,
        angle: t.rot + Math.PI,
        vx: -Math.cos(t.rot) * 70 + (Math.random() - 0.5) * 30,
        vy: -Math.sin(t.rot) * 70 + (Math.random() - 0.5) * 30,
        life: 0.28, size: 2.4, color: 'player', glow: 1,
      });
    }
  }

  // Clamp to max speed.
  const sp = Math.hypot(m.vx, m.vy);
  const max = game.shipMaxSpeed;
  if (sp > max) {
    m.vx = (m.vx / sp) * max;
    m.vy = (m.vy / sp) * max;
  }

  // Reverse thrust (unlocked + improved by the Retro Thrust passive).
  const reverseMult = game.stats.reverseMult || 0;
  if ((input.isDown('ArrowDown') || input.isDown('KeyS')) && reverseMult > 0) {
    const accel = game.shipThrust * reverseMult;
    m.vx -= Math.cos(t.rot) * accel * dt;
    m.vy -= Math.sin(t.rot) * accel * dt;

    // Cap backward speed independently so reverse stays slower than forward.
    const back = -(m.vx * Math.cos(t.rot) + m.vy * Math.sin(t.rot));
    const revMax = game.shipMaxSpeed * reverseMult;
    if (back > revMax) {
      const excess = back - revMax;
      m.vx += Math.cos(t.rot) * excess;
      m.vy += Math.sin(t.rot) * excess;
    }

    if (Math.random() < 0.75) {
      spawnParticle(game, {
        x: t.x + Math.cos(t.rot) * 13, y: t.y + Math.sin(t.rot) * 13,
        angle: t.rot,
        vx: Math.cos(t.rot) * 50 + (Math.random() - 0.5) * 24,
        vy: Math.sin(t.rot) * 50 + (Math.random() - 0.5) * 24,
        life: 0.26, size: 2.2, color: 'player', glow: 1,
      });
    }
  }

  // Friction: damp momentum so the ship stops drifting quickly when you
  // release thrust, keeping control tight (tunable via player.drag).
  const drag = Math.max(0, 1 - CONFIG.player.drag * dt);
  m.vx *= drag;
  m.vy *= drag;

  // Dash.
  game.dashCooldown = Math.max(0, game.dashCooldown - dt);
  if (input.justPressed('Space') && game.dashCooldown <= 0) {
    game.dashCooldown = CONFIG.player.dashCooldown;
    game.invuln = Math.max(game.invuln, CONFIG.player.dashInvuln);
    m.vx = Math.cos(t.rot) * CONFIG.player.dashSpeed;
    m.vy = Math.sin(t.rot) * CONFIG.player.dashSpeed;
    for (let i = 0; i < 8; i++) {
      spawnParticle(game, {
        x: t.x, y: t.y, angle: t.rot + Math.PI,
        vx: -Math.cos(t.rot) * 140 + (Math.random() - 0.5) * 120,
        vy: -Math.sin(t.rot) * 140 + (Math.random() - 0.5) * 120,
        life: 0.4, size: 3, color: 'player', glow: 1,
      });
    }
  }

  // Engine sound: ramps up while thrusting, fades when drifting.
  game.audio?.setThrust?.(thrusting);
}
