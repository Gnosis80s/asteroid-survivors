// XP -> level transitions, queuing multiple level-ups, and opening the
// card-selection screen (level-up vs. elite chest).

import { xpForLevel, generateOffers, generateChestRewards } from '../state.js';

export function updateLeveling(game, dt) {
  while (game.xp >= game.xpNeeded && game.state === 'playing') {
    game.xp -= game.xpNeeded;
    game.level++;
    game.xpNeeded = xpForLevel(game.level);
    game.cardQueue++;
  }
  if (game.cardQueue > 0 && !game.cardMode && game.state === 'playing') {
    openLevelUp(game);
  }
}

export function openLevelUp(game) {
  game.cardQueue--;
  const offers = generateOffers(game, 'levelup');
  if (offers.length === 0) {
    if (game.cardQueue > 0) return openLevelUp(game);
    game.state = 'playing';
    return;
  }
  game.cardMode = { offers, index: 0, kind: 'levelup' };
  game.state = 'levelup';
  game.audio?.levelup?.();
}

export function openChest(game) {
  const { rewards, gold, tier } = generateChestRewards(game);
  game.goldEarned += gold;
  game.chestState = {
    rewards, gold, tier,
    phase: 'open', t: 0, index: 0, burst: [],
  };
  game.state = 'chest';
  game.audio?.chestOpen?.();
}

export function closeChest(game) {
  game.chestState = null;
  game.state = 'playing';
}

export function resolveCard(game) {
  game.cardMode = null;
  if (game.cardQueue > 0) {
    openLevelUp(game);
  } else {
    game.state = 'playing';
  }
}
