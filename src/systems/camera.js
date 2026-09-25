// Camera follows the player through the larger world, clamped so the viewport
// never shows space outside the world bounds.

import { CONFIG } from '../config.js';

export function updateCamera(game, dt) {
  const t = game.world.get(game.playerId, 'transform');
  if (!t) return;

  const maxX = CONFIG.world.width - CONFIG.WIDTH;
  const maxY = CONFIG.world.height - CONFIG.HEIGHT;
  const targetX = Math.max(0, Math.min(maxX, t.x - CONFIG.WIDTH / 2));
  const targetY = Math.max(0, Math.min(maxY, t.y - CONFIG.HEIGHT / 2));

  // Smooth follow; instant-settle at the start of a run (camera is centered).
  const k = Math.min(1, CONFIG.camera.smooth * dt);
  game.camera.x += (targetX - game.camera.x) * k;
  game.camera.y += (targetY - game.camera.y) * k;
}