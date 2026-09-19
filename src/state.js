// Game state management: run lifecycle, derived stats, build/level logic, and
// upgrade-card offer generation. Keeps the state machine callbacks (onDeath,
// onVictory, etc.) attached so combat.js can signal without circular imports.

import { CONFIG } from './config.js';
import { World } from './engine/ecs.js';
import { WEAPONS, WEAPON_MAP } from './data/weapons.js';
import { PASSIVES, PASSIVE_MAP } from './data/passives.js';
import { weightedPick } from './engine/math.js';

const EVOLVED_IDS = new Set(WEAPONS.filter((w) => w.evolve).map((w) => w.evolve.into));

export function xpForLevel(level) {
  return Math.floor(CONFIG.xp.base + level * CONFIG.xp.linear + level * level * CONFIG.xp.quadratic);
}

export function createGame() {
  return {
    world: new World(),
    state: 'menu',
    char: null,
    playerId: -1,
    hp: 100,
    stats: null,
    build: { weapons: new Map(), passives: new Map(), banished: new Set(), evolved: new Set() },
    weaponState: new Map(),
    orbitalIds: [], orbitalSpec: null,
    xp: 0, xpNeeded: 0, level: 1,
    score: 0, goldEarned: 0,
    time: 0,
    invuln: 0, dashCooldown: 0,
    rerolls: 2,
    shake: 0,
    reviveUsed: false,
    bossAlive: -1,
    cardQueue: 0,
    cardMode: null,
    meta: null,
    gold: 0,
    save: null,
    input: null,
    audio: null,
    quitConfirm: false,
    quitSel: 0,
    quitArmed: false,
    gemStreak: 0,
    evoFlash: 0,
    newBest: null,
    runCredits: 0,
    optionsSel: 0,
    confirmReset: false,
    onDeath: null, onVictory: null, onBossKilled: null, onRevive: null, onChest: null, onQuit: null,
  };
}

export function recomputeStats(game) {
  const c = game.char;
  const s = {
    damageMult: c.damageMult,
    fireRateMult: 1,
    projectileSpeedMult: 1,
    areaMult: 1,
    moveSpeedMult: 1,
    maxHp: c.hp,
    armor: 0,
    pickupRange: 1,
    luck: 0,
    critChance: 0.05,
    critMult: 2.5,
    goldMult: 1,
    reverseMult: 0,
    amount: 0,
    regen: 0,
    xpMult: 1,
    curse: 0,
  };
  const m = game.meta;
  s.damageMult += (m.baseDamage || 0) * 0.05;
  s.maxHp += (m.baseHP || 0) * 15;
  s.luck += (m.luck || 0) * 0.05;
  s.goldMult += (m.bonusGold || 0) * 0.10;

  for (const [pid, lvl] of game.build.passives) {
    const p = PASSIVE_MAP[pid];
    if (p) p.apply(s, lvl);
  }

  game.stats = s;
  game.shipMaxSpeed = c.maxSpeed * s.moveSpeedMult;
  game.shipThrust = c.thrust * s.moveSpeedMult;
}

function giveWeapon(game, id) {
  game.build.weapons.set(id, 1);
  game.weaponState.set(id, { cd: 0 });
}

export function startRun(game) {
  const w = game.world;
  w.clear();
  game.build.weapons.clear();
  game.build.passives.clear();
  game.build.banished.clear();
  game.build.evolved.clear();
  game.weaponState.clear();
  game.orbitalIds = [];
  game.orbitalSpec = null;
  game.xp = 0;
  game.level = 1;
  game.xpNeeded = xpForLevel(1);
  game.score = 0;
  game.goldEarned = 0;
  game.time = 0;
  game.invuln = 0;
  game.dashCooldown = 0;
  game.rerolls = 2;
  game.reviveUsed = false;
  game.cardQueue = 0;
  game.cardMode = null;
  game.bossAlive = -1;
  game.shake = 0;
  game.banner = null;
  game.wd = null;
  game.aura = null;
  game.gemStreak = 0;
  game.evoFlash = 0;
  game.newBest = null;
  game.runCredits = 0;

  recomputeStats(game);
  game.hp = game.stats.maxHp;

  // Player ship.
  const pid = w.create();
  w.add(pid, 'transform', { x: CONFIG.WIDTH / 2, y: CONFIG.HEIGHT / 2, rot: -Math.PI / 2 });
  w.add(pid, 'motion', { vx: 0, vy: 0, vrot: 0, wrap: true });
  w.add(pid, 'collider', { radius: CONFIG.player.radius });
  w.add(pid, 'player', {});
  w.add(pid, 'render', { type: 'ship', color: game.char.color, size: CONFIG.player.radius, glow: 1 });
  game.playerId = pid;

  giveWeapon(game, game.char.starter);

  // Extra starting weapons from meta progression.
  const extras = game.meta.startWeapon || 0;
  const pool = WEAPONS.filter((x) => !EVOLVED_IDS.has(x.id) && x.id !== game.char.starter);
  const chosen = [];
  while (chosen.length < extras && chosen.length < pool.length) {
    const cand = pool[Math.floor(Math.random() * pool.length)];
    if (!chosen.includes(cand.id)) chosen.push(cand.id);
  }
  for (const id of chosen) giveWeapon(game, id);

  game.state = 'playing';
}

// ---------------- upgrade cards ----------------

function card(type, def, level) {
  return {
    kind: type, id: def.id, name: def.name, glyph: def.glyph,
    rarity: def.rarity, desc: def.desc, level, maxLevel: def.maxLevel || 5, type,
  };
}

function buildCardPool(game) {
  const cards = [];
  for (const wdef of WEAPONS) {
    if (EVOLVED_IDS.has(wdef.id) || game.build.evolved.has(wdef.id)) continue;
    if (game.build.banished.has(wdef.id)) continue;
    const lvl = game.build.weapons.get(wdef.id) || 0;
    if (lvl === 0 && game.build.weapons.size >= CONFIG.slots.weapons) continue;
    if (lvl < 5) cards.push(card('weapon', wdef, lvl));
  }
  for (const pdef of PASSIVES) {
    if (game.build.banished.has(pdef.id)) continue;
    const lvl = game.build.passives.get(pdef.id) || 0;
    if (lvl === 0 && game.build.passives.size >= CONFIG.slots.passives) continue;
    if (lvl < (pdef.maxLevel || 5)) cards.push(card('passive', pdef, lvl));
  }
  for (const [wid, lvl] of game.build.weapons) {
    const wdef = WEAPON_MAP[wid];
    if (lvl >= 5 && wdef.evolve && game.build.passives.has(wdef.evolve.passive)) {
      const into = WEAPON_MAP[wdef.evolve.into];
      cards.push({
        kind: 'evolution', id: into.id, from: wid, name: into.name, glyph: into.glyph,
        rarity: 'legendary', desc: `${wdef.name} + ${PASSIVE_MAP[wdef.evolve.passive].name}`, level: 0, maxLevel: 5, type: 'weapon',
      });
    }
  }
  return cards;
}

const RARITY_WEIGHT = { common: 10, rare: 4, epic: 1.8, legendary: 0.7 };

export function generateOffers(game, kind) {
  let pool = buildCardPool(game);
  if (kind === 'chest') pool = pool.filter((c) => c.rarity !== 'common');

  const luck = game.stats.luck;
  const weighted = pool.map((c) => {
    let weight = RARITY_WEIGHT[c.rarity] ?? 4;
    if (c.rarity !== 'common') weight *= 1 + luck * 2.5;
    return [c, weight];
  });

  const offers = [];
  const used = new Set();
  let guard = 0;
  while (offers.length < 3 && weighted.length > 0 && guard++ < 40) {
    const c = weightedPick(weighted);
    const key = c.kind + ':' + c.id;
    if (used.has(key)) continue;
    used.add(key);
    offers.push(c);
    // remove to avoid resampling the same card
    const idx = weighted.findIndex(([x]) => x === c);
    if (idx >= 0) weighted.splice(idx, 1);
  }
  return offers;
}

export function applyCard(game, card) {
  if (card.kind === 'weapon') {
    game.build.weapons.set(card.id, (game.build.weapons.get(card.id) || 0) + 1);
    if (!game.weaponState.has(card.id)) game.weaponState.set(card.id, { cd: 0 });
    const lvl = game.build.weapons.get(card.id);
    if (lvl === 3 || lvl === 5) game.audio?.breakpoint?.();
  } else if (card.kind === 'passive') {
    game.build.passives.set(card.id, (game.build.passives.get(card.id) || 0) + 1);
  } else if (card.kind === 'evolution') {
    game.build.weapons.delete(card.from);
    game.weaponState.delete(card.from);
    game.build.evolved.add(card.id);
    giveWeapon(game, card.id);
    for (const oid of game.orbitalIds) game.world.destroy(oid);
    game.orbitalIds = [];
    game.orbitalSpec = null;
    game.banner = { text: `WEAPON EVOLVED: ${card.name}`, ttl: 2.5 };
    game.evoFlash = 1;
    game.audio?.evolution?.();
  }
  recomputeStats(game);
  if (game.stats.maxHp > game.hp && card.kind === 'passive' && card.id === 'maxHp') {
    game.hp += 20;
  }
}

// ---------------- treasure chest rewards ----------------

function rollChestTier(luck) {
  const five = Math.min(0.25, 0.12 * (1 + luck));
  const three = Math.min(0.55, 0.38 * (1 + luck));
  const r = Math.random();
  if (r < five) return 5;
  if (r < five + three) return 3;
  return 1;
}

function findEvolvable(game) {
  for (const [wid, lvl] of game.build.weapons) {
    const def = WEAPON_MAP[wid];
    if (!def || !def.evolve) continue;
    if (lvl < 5) continue;
    if (!game.build.passives.has(def.evolve.passive)) continue;
    if (game.build.weapons.has(def.evolve.into)) continue;
    return def;
  }
  return null;
}

function randomOwnedUpgrade(game) {
  const pool = [];
  for (const [wid, lvl] of game.build.weapons) {
    if (lvl < 5) {
      const def = WEAPON_MAP[wid];
      pool.push({ kind: 'weapon', id: wid, name: def.name, glyph: def.glyph, rarity: def.rarity, level: lvl, maxLevel: 5, type: 'weapon' });
    }
  }
  for (const [pid, lvl] of game.build.passives) {
    const def = PASSIVE_MAP[pid];
    if (lvl < (def.maxLevel || 5)) {
      pool.push({ kind: 'passive', id: pid, name: def.name, glyph: def.glyph, rarity: def.rarity, level: lvl, maxLevel: def.maxLevel || 5, type: 'passive' });
    }
  }
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generateChestRewards(game) {
  const silver = game.time >= 600;
  const tier = rollChestTier(game.stats.luck);
  const rewards = [];

  const evolvable = silver ? findEvolvable(game) : null;
  if (evolvable) {
    const into = WEAPON_MAP[evolvable.evolve.into];
    rewards.push({
      kind: 'evolution', id: into.id, from: evolvable.id,
      name: into.name, glyph: into.glyph, rarity: 'legendary',
      desc: into.desc, level: 0, maxLevel: 5, type: 'weapon',
    });
  }

  const upgrades = tier - (evolvable ? 1 : 0);
  for (let i = 0; i < upgrades; i++) {
    const u = randomOwnedUpgrade(game);
    if (u) rewards.push(u);
  }

  const gold = [0, 50, 150, 300][tier] || 50;
  return { rewards, gold, tier, silver };
}
