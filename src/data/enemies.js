// Enemy archetypes. `points` (asteroid polygons) are generated at spawn time
// since they are randomized; everything else is static data.

export const ENEMIES = {
  asteroid_small: {
    id: 'asteroid_small', name: 'Asteroid', tier: 1, hp: 14, radius: 14,
    speed: [70, 120], vrot: [-1.5, 1.5], contactDamage: 18, score: 10, gold: 1,
    ai: 'drift', color: 'enemy', render: 'asteroid', glow: 0, split: null,
  },
  asteroid_medium: {
    id: 'asteroid_medium', name: 'Asteroid', tier: 1, hp: 44, radius: 26,
    speed: [40, 85], vrot: [-0.9, 0.9], contactDamage: 28, score: 25, gold: 2,
    ai: 'drift', color: 'enemy', render: 'asteroid', glow: 0,
    split: { count: 2, child: 'asteroid_small' },
  },
  asteroid_large: {
    id: 'asteroid_large', name: 'Large Asteroid', tier: 2, hp: 100, radius: 44,
    speed: [22, 55], vrot: [-0.5, 0.5], contactDamage: 45, score: 60, gold: 4,
    ai: 'drift', color: 'enemy', render: 'asteroid', glow: 0,
    split: { count: 2, child: 'asteroid_medium' },
  },
  asteroid_elite: {
    id: 'asteroid_elite', name: 'Elite Asteroid', tier: 3, hp: 320, radius: 52,
    speed: [18, 30], vrot: [-0.4, 0.4], contactDamage: 60, score: 220, gold: 16,
    ai: 'drift', color: 'elite', render: 'asteroid', glow: 1,
    split: { count: 3, child: 'asteroid_medium' }, chestChance: 0.25,
  },
  shard: {
    id: 'shard', name: 'Crystal Shard', tier: 2, hp: 12, radius: 8,
    speed: [150, 200], vrot: [0, 0], contactDamage: 12, score: 15, gold: 1,
    ai: 'shard', color: 'hazard', render: 'shard', glow: 1, split: null,
  },
  saucer_scout: {
    id: 'saucer_scout', name: 'Saucer Scout', tier: 2, hp: 50, radius: 16,
    speed: [70, 90], vrot: [0, 0], contactDamage: 25, score: 40, gold: 3,
    ai: 'saucer_scout', color: 'enemy', render: 'saucer', glow: 0, split: null,
  },
  saucer_gunner: {
    id: 'saucer_gunner', name: 'Saucer Gunner', tier: 3, hp: 90, radius: 18,
    speed: [55, 75], vrot: [0, 0], contactDamage: 30, score: 80, gold: 6,
    ai: 'saucer_gunner', color: 'elite', render: 'saucer', glow: 1, split: null,
  },
  boss_warden: {
    id: 'boss_warden', name: 'Warden', tier: 3, hp: 750, radius: 36,
    speed: [28, 42], vrot: [0, 0], contactDamage: 40, score: 300, gold: 40,
    ai: 'saucer_gunner', color: 'elite', render: 'saucer', glow: 2, split: null,
    chestChance: 1,
  },
  boss_colossus: {
    id: 'boss_colossus', name: 'The Colossus', tier: 4, hp: 1500, radius: 90,
    speed: [14, 20], vrot: [-0.2, 0.2], contactDamage: 70, score: 1500, gold: 200,
    ai: 'boss_colossus', color: 'boss', render: 'boss', glow: 2, split: null,
    chestChance: 1,
  },
  boss_mothership: {
    id: 'boss_mothership', name: 'Mothership', tier: 4, hp: 2400, radius: 72,
    speed: [20, 28], vrot: [0, 0], contactDamage: 70, score: 2500, gold: 350,
    ai: 'boss_mothership', color: 'boss', render: 'saucer', glow: 2, split: null,
    chestChance: 1,
  },
  boss_singularity: {
    id: 'boss_singularity', name: 'Singularity', tier: 4, hp: 3600, radius: 60,
    speed: [24, 32], vrot: [0, 0], contactDamage: 80, score: 4000, gold: 600,
    ai: 'boss_singularity', color: 'boss', render: 'boss', glow: 2, split: null,
    chestChance: 1,
  },
};

// Weighted spawn tables per wave tier. Weights grow/decay with time inside
// the wave director, but this provides the base shape.
export const TIER_TABLES = {
  1: [
    ['asteroid_small', 10],
    ['asteroid_medium', 6],
    ['asteroid_large', 1],
  ],
  2: [
    ['asteroid_small', 8],
    ['asteroid_medium', 8],
    ['asteroid_large', 5],
    ['shard', 4],
    ['saucer_scout', 2],
  ],
  3: [
    ['asteroid_small', 6],
    ['asteroid_medium', 7],
    ['asteroid_large', 6],
    ['asteroid_elite', 3],
    ['shard', 5],
    ['saucer_scout', 3],
    ['saucer_gunner', 2],
  ],
};
