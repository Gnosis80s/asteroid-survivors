// Weapon definitions: base stats, level scaling, evolution links, and the
// fire() behavior invoked by the weapon system. `ctx` = { game, world, stats,
// x, y, rot, time }. All damage/radius/speed already account for player stats.

import {
  spawnPlayerBullet, spawnMissile, spawnBeam, spawnMine, spawnOrbital,
  damageEnemy, spawnBolt,
} from '../combat.js';

const dmg = (base, level) => base * (1 + (level - 1) * 0.28);
const shots = (base, level) => base + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);

// Nearest enemy within maxDist of (x,y), skipping any in `exclude`.
function nearestInRange(world, x, y, maxDist, exclude) {
  let best = -1;
  let bestD = maxDist * maxDist;
  for (const id of world.query('enemy', 'transform')) {
    if (exclude && exclude.has(id)) continue;
    const t = world.get(id, 'transform');
    const d = (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y);
    if (d <= bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export const WEAPONS = [
  {
    id: 'machineGun', name: 'MACHINE GUN', glyph: 'machineGun', rarity: 'common',
    tags: ['kinetic'], desc: 'Rapid forward shots',
    baseCooldown: 0.16,
    evolve: { passive: 'fireRate', into: 'gatling' },
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 1 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + amt;
      for (let i = 0; i < n; i++) {
        spawnPlayerBullet(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (Math.random() - 0.5) * 0.06,
          speed: 560 * ctx.stats.projectileSpeedMult,
          damage: dmg(8, level) * ctx.stats.damageMult,
          radius: 2.5, lifetime: 1.1, color: 'playerBullet', pierce: 0,
        });
      }
    },
  },
  {
    id: 'gatling', name: 'GATLING', glyph: 'gatling', rarity: 'legendary',
    tags: ['kinetic'], desc: 'Piercing hypersonic rounds',
    baseCooldown: 0.11,
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 1 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + amt;
      for (let i = 0; i < n; i++) {
        spawnPlayerBullet(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (Math.random() - 0.5) * 0.05,
          speed: 640 * ctx.stats.projectileSpeedMult,
          damage: dmg(9, level) * ctx.stats.damageMult,
          radius: 2.5, lifetime: 1.2, color: 'playerBullet', pierce: 1,
        });
      }
    },
  },
  {
    id: 'blaster', name: 'BLASTER', glyph: 'blaster', rarity: 'common',
    tags: ['kinetic'], desc: 'Heavy piercing shot',
    baseCooldown: 0.9,
    evolve: { passive: 'projectileSpeed', into: 'railgun' },
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 1 + amt;
      const pierce = 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        spawnPlayerBullet(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (Math.random() - 0.5) * 0.03,
          speed: 720 * ctx.stats.projectileSpeedMult,
          damage: dmg(26, level) * ctx.stats.damageMult,
          radius: 4, lifetime: 1.0, color: 'blaster', shape: 'teardrop', pierce,
        });
      }
    },
  },
  {
    id: 'railgun', name: 'RAIL GUN', glyph: 'railgun', rarity: 'legendary',
    tags: ['kinetic'], desc: 'Hypersonic full-pierce rail',
    baseCooldown: 0.75,
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 1 + amt;
      const pierce = 8 + (level >= 3 ? 2 : 0) + (level >= 5 ? 4 : 0);
      for (let i = 0; i < n; i++) {
        spawnPlayerBullet(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (Math.random() - 0.5) * 0.02,
          speed: 820 * ctx.stats.projectileSpeedMult,
          damage: dmg(32, level) * ctx.stats.damageMult,
          radius: 4, lifetime: 1.1, color: 'blaster', shape: 'teardrop', pierce,
        });
      }
    },
  },
  {
    id: 'spreadShot', name: 'SPREAD SHOT', glyph: 'spreadShot', rarity: 'common',
    tags: ['kinetic'], desc: 'Wide arc of projectiles',
    baseCooldown: 0.55,
    evolve: { passive: 'damage', into: 'vulcanFan' },
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 3 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + amt;
      const arc = 0.85;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        spawnPlayerBullet(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (t - 0.5) * arc,
          speed: 470 * ctx.stats.projectileSpeedMult,
          damage: dmg(7, level) * ctx.stats.damageMult,
          radius: 2.5, lifetime: 1.0, color: 'playerBullet', pierce: 0,
        });
      }
    },
  },
  {
    id: 'vulcanFan', name: 'VULCAN FAN', glyph: 'vulcanFan', rarity: 'legendary',
    tags: ['kinetic'], desc: 'Splitting 5-way barrage',
    baseCooldown: 0.5,
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 5 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + amt;
      const arc = 1.1;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        spawnPlayerBullet(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (t - 0.5) * arc,
          speed: 490 * ctx.stats.projectileSpeedMult,
          damage: dmg(6, level) * ctx.stats.damageMult,
          radius: 2.5, lifetime: 1.0, color: 'playerBullet', pierce: 0,
          split: { count: 2, homing: false },
        });
      }
    },
  },
  {
    id: 'orbitalShields', name: 'ORBITAL SHIELDS', glyph: 'orbitalShields', rarity: 'rare',
    tags: ['orbital'], desc: 'Rocks that orbit and shred',
    baseCooldown: 0.25,
    evolve: { passive: 'maxHp', into: 'titanRings' },
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const count = 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + amt;
      const spec = `orbital:${count}`;
      if (ctx.game.orbitalSpec !== spec) {
        ctx.game.orbitalSpec = spec;
        for (const id of ctx.game.orbitalIds) ctx.world.destroy(id);
        ctx.game.orbitalIds = [];
        for (let i = 0; i < count; i++) {
          ctx.game.orbitalIds.push(spawnOrbital(ctx.game, {
            x: ctx.x, y: ctx.y, index: i, count,
            radius: 46 * ctx.stats.areaMult,
            angularSpeed: 1.7, dir: 1,
            damage: dmg(11, level) * ctx.stats.damageMult,
            baseRadius: 46, baseDamage: 11, level,
          }));
        }
      }
    },
  },
  {
    id: 'titanRings', name: 'TITAN RINGS', glyph: 'titanRings', rarity: 'legendary',
    tags: ['orbital'], desc: 'Counter-rotating spike rings',
    baseCooldown: 0.25,
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const count = 6 + (level - 1) * 2 + amt;
      const spec = `titan:${count}`;
      if (ctx.game.orbitalSpec !== spec) {
        ctx.game.orbitalSpec = spec;
        for (const id of ctx.game.orbitalIds) ctx.world.destroy(id);
        ctx.game.orbitalIds = [];
        const half = count / 2;
        for (let i = 0; i < count; i++) {
          const ring = i < half ? 0 : 1;
          ctx.game.orbitalIds.push(spawnOrbital(ctx.game, {
            x: ctx.x, y: ctx.y, index: i % half, count: half,
            radius: (52 + ring * 8) * ctx.stats.areaMult,
            angularSpeed: 1.9, dir: ring === 0 ? 1 : -1,
            damage: dmg(13, level) * ctx.stats.damageMult,
            baseRadius: 52 + ring * 8, baseDamage: 13, level,
          }));
        }
      }
    },
  },
  {
    id: 'homingMissiles', name: 'HOMING MISSILES', glyph: 'homingMissiles', rarity: 'rare',
    tags: ['explosive'], desc: 'Missiles that seek targets',
    baseCooldown: 0.9,
    fireSound: 'missile',
    evolve: { passive: 'pickupRange', into: 'swarm' },
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 1 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + amt;
      for (let i = 0; i < n; i++) {
        spawnMissile(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (Math.random() - 0.5) * 0.8,
          speed: 300 * ctx.stats.projectileSpeedMult,
          damage: dmg(16, level) * ctx.stats.damageMult,
          radius: 3.5, lifetime: 2.6, color: 'playerBullet',
        });
      }
    },
  },
  {
    id: 'swarm', name: 'SWARM', glyph: 'swarm', rarity: 'legendary',
    tags: ['explosive'], desc: 'Missiles that fragment on impact',
    baseCooldown: 0.8,
    fireSound: 'missile',
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + amt;
      for (let i = 0; i < n; i++) {
        spawnMissile(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (Math.random() - 0.5) * 0.9,
          speed: 310 * ctx.stats.projectileSpeedMult,
          damage: dmg(13, level) * ctx.stats.damageMult,
          radius: 3.5, lifetime: 2.6, color: 'playerBullet',
          split: { count: 3, homing: true },
        });
      }
    },
  },
  {
    id: 'laserBeam', name: 'LASER BEAM', glyph: 'laserBeam', rarity: 'epic',
    tags: ['beam'], desc: 'Periodic piercing beam',
    baseCooldown: 1.4,
    evolve: { passive: 'thrustPower', into: 'doomRay' },
    fire(ctx, level) {
      const beams = 1 + (ctx.stats.amount || 0);
      const spread = 0.14;
      for (let i = 0; i < beams; i++) {
        const off = beams === 1 ? 0 : (i / (beams - 1) - 0.5) * spread;
        spawnBeam(ctx.game, {
          x: ctx.x, y: ctx.y, rot: ctx.rot + off,
          damage: dmg(20, level) * ctx.stats.damageMult,
          width: 16 * ctx.stats.areaMult,
          length: 560 * ctx.stats.areaMult,
          ttl: 0.28, sweep: 0, color: 'beam',
        });
      }
    },
  },
  {
    id: 'doomRay', name: 'DOOM RAY', glyph: 'doomRay', rarity: 'legendary',
    tags: ['beam'], desc: 'A sweeping ray of annihilation',
    baseCooldown: 1.6,
    fire(ctx, level) {
      const beams = 1 + (ctx.stats.amount || 0);
      const spread = 0.16;
      for (let i = 0; i < beams; i++) {
        const off = beams === 1 ? 0 : (i / (beams - 1) - 0.5) * spread;
        spawnBeam(ctx.game, {
          x: ctx.x, y: ctx.y, rot: ctx.rot + off,
          damage: dmg(22, level) * ctx.stats.damageMult,
          width: 24 * ctx.stats.areaMult,
          length: 760 * ctx.stats.areaMult,
          ttl: 1.0, sweep: 1.4, color: 'beam',
        });
      }
    },
  },
  {
    id: 'mineLayer', name: 'MINE LAYER', glyph: 'mineLayer', rarity: 'epic',
    tags: ['explosive'], desc: 'Drops mines behind you',
    baseCooldown: 1.6,
    evolve: { passive: 'area', into: 'minefield' },
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      for (let i = 0; i <= amt; i++) {
        const jitter = (Math.random() - 0.5) * 22;
        const off = (i - amt / 2) * 0.45;
        spawnMine(ctx.game, {
          x: ctx.x - Math.cos(ctx.rot + off) * 34, y: ctx.y - Math.sin(ctx.rot + off) * 34,
          damage: dmg(42, level) * ctx.stats.damageMult,
          radius: 70 * ctx.stats.areaMult, armTime: 0.8, chain: false,
        });
      }
    },
  },
  {
    id: 'minefield', name: 'MINEFIELD', glyph: 'minefield', rarity: 'legendary',
    tags: ['explosive'], desc: 'Chain-detonating minefield',
    baseCooldown: 1.4,
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      for (let i = 0; i <= amt; i++) {
        const off = (i - amt / 2) * 0.45;
        spawnMine(ctx.game, {
          x: ctx.x - Math.cos(ctx.rot + off) * 38, y: ctx.y - Math.sin(ctx.rot + off) * 38,
          damage: dmg(46, level) * ctx.stats.damageMult,
          radius: 92 * ctx.stats.areaMult, armTime: 0.6, chain: true,
        });
      }
    },
  },
  {
    id: 'plasmaAura', name: 'PLASMA AURA', glyph: 'plasmaAura', rarity: 'rare',
    tags: ['aura'], desc: 'Constant damage field around the ship',
    baseCooldown: 0.25,
    fire(ctx, level) {
      ctx.game.aura = {
        radius: 78 * ctx.stats.areaMult,
        damage: dmg(10, level) * ctx.stats.damageMult,
      };
    },
  },
  {
    id: 'arcCoil', name: 'ARC COIL', glyph: 'arcCoil', rarity: 'epic',
    tags: ['chain'], desc: 'Chain lightning between enemies',
    baseCooldown: 0.9,
    fire(ctx, level) {
      const world = ctx.world;
      const game = ctx.game;
      const acquire = 400 + 20 * level;
      const chainRange = 170;
      const chains = 3 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
      const boltDamage = dmg(14, level) * ctx.stats.damageMult;
      const hit = new Set();

      let cur = nearestInRange(world, ctx.x, ctx.y, acquire, hit);
      if (cur < 0) return;

      let fx = ctx.x, fy = ctx.y;
      for (let jump = 0; jump < chains && cur >= 0; jump++) {
        hit.add(cur);
        const t = world.get(cur, 'transform');
        damageEnemy(game, cur, boltDamage);
        spawnBolt(game, { x1: fx, y1: fy, x2: t.x, y2: t.y, ttl: 0.16 });
        fx = t.x;
        fy = t.y;
        cur = nearestInRange(world, fx, fy, chainRange, hit);
      }
      game.audio?.laser?.();
    },
  },
  {
    id: 'hailstorm', name: 'HAILSTORM', glyph: 'hailstorm', rarity: 'legendary',
    tags: ['kinetic'], desc: 'Rapid wide barrage',
    unionFrom: ['machineGun', 'spreadShot'],
    baseCooldown: 0.3,
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 4 + (level >= 3 ? 2 : 0) + (level >= 5 ? 2 : 0) + amt;
      const arc = 1.1;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        spawnPlayerBullet(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (t - 0.5) * arc,
          speed: 520 * ctx.stats.projectileSpeedMult,
          damage: dmg(8, level) * ctx.stats.damageMult,
          radius: 2.5, lifetime: 1.0, color: 'playerBullet', pierce: 0,
        });
      }
    },
  },
  {
    id: 'annihilator', name: 'ANNIHILATOR', glyph: 'annihilator', rarity: 'legendary',
    tags: ['kinetic', 'beam'], desc: 'Heavy slug plus piercing beam',
    unionFrom: ['blaster', 'laserBeam'],
    baseCooldown: 1.0,
    fire(ctx, level) {
      spawnPlayerBullet(ctx.game, {
        x: ctx.x, y: ctx.y, angle: ctx.rot,
        speed: 820 * ctx.stats.projectileSpeedMult,
        damage: dmg(30, level) * ctx.stats.damageMult,
        radius: 4, lifetime: 1.1, color: 'blaster', shape: 'teardrop', pierce: 10,
      });
      spawnBeam(ctx.game, {
        x: ctx.x, y: ctx.y, rot: ctx.rot,
        damage: dmg(20, level) * ctx.stats.damageMult,
        width: 18 * ctx.stats.areaMult,
        length: 600 * ctx.stats.areaMult,
        ttl: 0.3, sweep: 0, color: 'beam',
      });
    },
  },
  {
    id: 'clusterBomber', name: 'CLUSTER BOMBER', glyph: 'clusterBomber', rarity: 'legendary',
    tags: ['explosive'], desc: 'Homing missiles plus mines',
    unionFrom: ['homingMissiles', 'mineLayer'],
    baseCooldown: 1.1,
    fire(ctx, level) {
      const amt = ctx.stats.amount || 0;
      const n = 1 + (level >= 3 ? 1 : 0) + amt;
      for (let i = 0; i < n; i++) {
        spawnMissile(ctx.game, {
          x: ctx.x, y: ctx.y, angle: ctx.rot + (Math.random() - 0.5) * 0.8,
          speed: 320 * ctx.stats.projectileSpeedMult,
          damage: dmg(16, level) * ctx.stats.damageMult,
          radius: 3.5, lifetime: 2.6, color: 'playerBullet',
        });
      }
      spawnMine(ctx.game, {
        x: ctx.x - Math.cos(ctx.rot) * 34, y: ctx.y - Math.sin(ctx.rot) * 34,
        damage: dmg(40, level) * ctx.stats.damageMult,
        radius: 70 * ctx.stats.areaMult, armTime: 0.8, chain: false,
      });
    },
  },
  {
    id: 'teslaLance', name: 'TESLA LANCE', glyph: 'teslaLance', rarity: 'legendary',
    tags: ['beam', 'chain'], desc: 'Piercing beam plus chain lightning',
    unionFrom: ['arcCoil', 'laserBeam'],
    baseCooldown: 1.0,
    fire(ctx, level) {
      const world = ctx.world;
      const game = ctx.game;
      spawnBeam(ctx.game, {
        x: ctx.x, y: ctx.y, rot: ctx.rot,
        damage: dmg(18, level) * ctx.stats.damageMult,
        width: 16 * ctx.stats.areaMult,
        length: 560 * ctx.stats.areaMult,
        ttl: 0.3, sweep: 0, color: 'beam',
      });
      const acquire = 420;
      const chainRange = 170;
      const chains = 3 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
      const boltDamage = dmg(12, level) * ctx.stats.damageMult;
      const hit = new Set();
      let cur = nearestInRange(world, ctx.x, ctx.y, acquire, hit);
      if (cur >= 0) {
        let fx = ctx.x, fy = ctx.y;
        for (let jump = 0; jump < chains && cur >= 0; jump++) {
          hit.add(cur);
          const t = world.get(cur, 'transform');
          damageEnemy(game, cur, boltDamage);
          spawnBolt(game, { x1: fx, y1: fy, x2: t.x, y2: t.y, ttl: 0.16 });
          fx = t.x;
          fy = t.y;
          cur = nearestInRange(world, fx, fy, chainRange, hit);
        }
      }
      game.audio?.laser?.();
    },
  },
];

export const WEAPON_MAP = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

const WEAPON_TEXT = {
  machineGun: (l) => `${shots(1, l)} shots · ${Math.round(dmg(8, l))} dmg each`,
  gatling: (l) => `${shots(1, l)} shots · ${Math.round(dmg(9, l))} dmg · pierces 1`,
  blaster: (l) => `1 shot · ${Math.round(dmg(26, l))} dmg · pierces ${2 + (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0)}`,
  railgun: (l) => `1 shot · ${Math.round(dmg(32, l))} dmg · full pierce`,
  spreadShot: (l) => `${shots(3, l)} shots · ${Math.round(dmg(7, l))} dmg each`,
  vulcanFan: (l) => `${shots(5, l)} shots · ${Math.round(dmg(6, l))} dmg · split on hit`,
  orbitalShields: (l) => `${shots(2, l)} orbs · ${Math.round(dmg(11, l))} dmg contact`,
  titanRings: (l) => `${6 + (l - 1) * 2} orbs · ${Math.round(dmg(13, l))} dmg contact`,
  homingMissiles: (l) => `${shots(1, l)} missiles · ${Math.round(dmg(16, l))} dmg each`,
  swarm: (l) => `${shots(2, l)} missiles · ${Math.round(dmg(13, l))} dmg · fragments`,
  laserBeam: (l) => `piercing beam · ${Math.round(dmg(20, l))} dmg`,
  doomRay: (l) => `sweeping beam · ${Math.round(dmg(22, l))} dmg`,
  mineLayer: (l) => `mine · ${Math.round(dmg(42, l))} dmg`,
  minefield: (l) => `mine · ${Math.round(dmg(46, l))} dmg · chain`,
  plasmaAura: (l) => `aura · ${Math.round(dmg(10, l))} dmg / tick`,
  arcCoil: (l) => `${3 + (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0)} chains · ${Math.round(dmg(14, l))} dmg`,
  hailstorm: (l) => `${4 + (l >= 3 ? 2 : 0) + (l >= 5 ? 2 : 0)} bullets · ${Math.round(dmg(8, l))} dmg each`,
  annihilator: (l) => `beam + ${Math.round(dmg(30, l))} dmg slug`,
  clusterBomber: (l) => `${1 + (l >= 3 ? 1 : 0)} missiles + mine · ${Math.round(dmg(16, l))} dmg`,
  teslaLance: (l) => `beam + ${3 + (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0)} chain lightning`,
};

export function weaponText(id) {
  return WEAPON_TEXT[id] || null;
}
