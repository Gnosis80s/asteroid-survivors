// Passive upgrade cards. Each applies a per-level effect to the derived
// player stats in state.js (recomputeStats). `apply` mutates a stats object.

export const PASSIVES = [
  {
    id: 'damage', name: 'DAMAGE', glyph: 'damage', rarity: 'common',
    desc: '+15% weapon damage per level',
    apply: (s, lvl) => { s.damageMult += 0.15 * lvl; },
  },
  {
    id: 'fireRate', name: 'FIRE RATE', glyph: 'fireRate', rarity: 'common',
    desc: '+10% attack speed per level',
    apply: (s, lvl) => { s.fireRateMult += 0.10 * lvl; },
  },
  {
    id: 'thrustPower', name: 'THRUST POWER', glyph: 'thrustPower', rarity: 'common',
    desc: '+14% thrust and max speed per level',
    apply: (s, lvl) => { s.moveSpeedMult += 0.14 * lvl; },
  },
  {
    id: 'projectileSpeed', name: 'PROJECTILE SPEED', glyph: 'projectileSpeed', rarity: 'common',
    desc: '+12% projectile speed per level',
    apply: (s, lvl) => { s.projectileSpeedMult += 0.12 * lvl; },
  },
  {
    id: 'area', name: 'BLAST AREA', glyph: 'area', rarity: 'rare',
    desc: '+15% area & radius per level',
    apply: (s, lvl) => { s.areaMult += 0.15 * lvl; },
  },
  {
    id: 'maxHp', name: 'REINFORCED HULL', glyph: 'maxHp', rarity: 'common',
    desc: '+20 max hull per level',
    apply: (s, lvl) => { s.maxHp += 20 * lvl; },
  },
  {
    id: 'armor', name: 'ARMOR PLATING', glyph: 'armor', rarity: 'rare',
    desc: '-1 damage taken per hit, per level',
    apply: (s, lvl) => { s.armor += 1 * lvl; },
  },
  {
    id: 'pickupRange', name: 'MAGNET COIL', glyph: 'pickupRange', rarity: 'rare',
    desc: '+25% pickup range per level',
    apply: (s, lvl) => { s.pickupRange += 0.25 * lvl; },
  },
  {
    id: 'luck', name: 'FORTUNE', glyph: 'luck', rarity: 'epic',
    desc: '+10% luck (rarer cards, better drops) per level',
    apply: (s, lvl) => { s.luck += 0.10 * lvl; },
  },
  {
    id: 'critChance', name: 'CRITICAL CORE', glyph: 'critChance', rarity: 'epic',
    desc: '+5% critical chance (2.5x damage) per level',
    apply: (s, lvl) => { s.critChance += 0.05 * lvl; },
  },
  {
    id: 'reverseThrust', name: 'RETRO THRUST', glyph: 'reverseThrust', rarity: 'common',
    desc: 'Unlocks reverse thrust, stronger per level',
    apply: (s, lvl) => { s.reverseMult += 0.35 + (lvl - 1) * 0.12; },
  },
  {
    id: 'splitCore', name: 'SPLIT CORE', glyph: 'splitCore', rarity: 'epic',
    desc: '+1 projectile to every weapon per level',
    apply: (s, lvl) => { s.amount += lvl; },
  },
  {
    id: 'naniteRepair', name: 'NANITE REPAIR', glyph: 'naniteRepair', rarity: 'rare',
    desc: '+0.6 hull regen per second, per level',
    apply: (s, lvl) => { s.regen += 0.6 * lvl; },
  },
];

export const PASSIVE_MAP = Object.fromEntries(PASSIVES.map((p) => [p.id, p]));
