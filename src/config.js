// Central balance + presentation knobs. Everything here is tunable without
// touching engine code. The wave director, XP curve, and difficulty scalars
// all read from this file.

export const CONFIG = {
  WIDTH: 1280,
  HEIGHT: 720,

  // Fixed simulation timestep (seconds).
  FIXED_DT: 1 / 60,
  MAX_FRAME_DT: 0.1,

  // Run length in seconds. Bosses arrive at 5:00, 10:00, 15:00.
  RUN_LENGTH: 15 * 60,

  // ---- Functional palette. Color is always semantic (see design doc). ----
  colors: {
    bg: '#000000',
    player: '#22e6ff',      // cyan - the only solid filled shape
    playerBullet: '#00d5ff',
    playerDim: '#0a5a6b',
    enemy: '#e8e8e8',       // neutral white
    enemyBullet: '#ff4d7e', // magenta - danger, always brightest & filled
    hazard: '#ff4d7e',
    elite: '#ff9d2e',       // orange
    boss: '#ffd60a',        // gold
    gem: '#39ff88',         // green - reward
    heart: '#ff6b9a',
    chest: '#ffd60a',
    orbital: '#b46bff',     // violet - utility
    beam: '#b46bff',
    mine: '#ffb03a',
    ui: '#9fb8c8',
    uiDim: '#4a5a63',
    white: '#ffffff',
  },

  // ---- Player physics ----
  player: {
    radius: 13,
    maxSpeed: 320,
    thrustAccel: 520,
    brakeDecel: 520,
    drag: 1.8,                 // velocity damping (1/s) for responsive control
    angularSpeed: 4.2,          // rad/s
    dashSpeed: 640,
    dashCooldown: 2.5,
    dashInvuln: 0.45,
    invulnOnHit: 1.0,
    baseHP: 100,
  },

  // ---- XP / level curve ----
  xp: {
    base: 12,
    growth: 1.28,             // xpNeeded = floor(base * growth^(level-1) + level*2)
  },

  // ---- Pickups ----
  pickup: {
    gemValue: 4,
    gemRadius: 7,
    collectRadius: 22,
    baseMagnet: 90,           // base pickup range
    heartHeal: 40,
    heartChance: 0.005,
    magnetChance: 0.005,
  },

  // ---- Wave director ----
  waves: {
    spawnInterval: 0.9,       // seconds between director ticks
    maxEnemies: 130,          // hard cap for screen readability
    grace: 0.5,               // off-screen enemies can't attack for this long
    bossTimes: [300, 600, 900],
  },

  // ---- Global difficulty scalars (per second / per level) ----
  difficulty: {
    enemyHpPerLevel: 0.12,    // +12% enemy hp per player level
    enemySpeedPerSec: 0.4,    // gentle speed creep over a run
    baseSpawn: 0.4,           // enemies spawned per director tick at t=0
    spawnPerSec: 0.006,       // extra spawns added per second over a run
  },

  // ---- Rendering / readability ----
  render: {
    starCount: 90,
    focusFalloffRadius: 260,  // far asteroids fade beyond this radius from player
    particleCap: 600,
    glowPasses: 2,
  },

  // ---- Meta progression (persistent) ----
  meta: {
    upgrades: [
      { id: 'baseDamage',   name: 'Damage',        perLevel: 0.05, max: 10, cost: 750,  costGrowth: 1.15 },
      { id: 'baseHP',       name: 'Hull',          perLevel: 15,   max: 10, cost: 750,  costGrowth: 1.15 },
      { id: 'bonusGold',    name: 'Credit Yield',  perLevel: 0.10, max: 10, cost: 600,  costGrowth: 1.15 },
      { id: 'luck',         name: 'Luck',          perLevel: 0.05, max: 10, cost: 1000, costGrowth: 1.15 },
      { id: 'startWeapon',  name: 'Extra Weapon',  perLevel: 1,    max: 3,  cost: 4000, costGrowth: 1.15 },
      { id: 'revive',       name: 'Revive',        perLevel: 1,    max: 1,  cost: 7500, costGrowth: 1.15 },
    ],
  },

  // ---- Characters ----
  characters: [
    {
      id: 'voyager', name: 'Voyager', cost: 0,
      desc: 'Balanced hull and thrust. Starts with the Machine Gun.',
      hp: 100, maxSpeed: 320, thrust: 520, damageMult: 1.0,
      starter: 'machineGun', color: '#22e6ff',
    },
    {
      id: 'dart', name: 'Dart', cost: 600,
      desc: 'Fragile but blisteringly fast. Starts with Spread Shot.',
      hp: 70, maxSpeed: 420, thrust: 640, damageMult: 1.0,
      starter: 'spreadShot', color: '#39ff88',
    },
    {
      id: 'titan', name: 'Titan', cost: 1500,
      desc: 'Slow, armored behemoth. Starts with Orbital Shields.',
      hp: 170, maxSpeed: 260, thrust: 440, damageMult: 1.15,
      starter: 'orbitalShields', color: '#b46bff',
    },
  ],
};
