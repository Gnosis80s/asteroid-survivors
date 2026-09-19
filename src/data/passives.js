// Passive upgrade cards. Each applies a per-level effect to the derived
// player stats in state.js (recomputeStats). `apply` mutates a stats object,
// and `text(level)` returns a human-readable summary of the effect at that
// level (used on the upgrade cards).

export const PASSIVES = [
  {
    id: 'damage', name: 'DAMAGE', glyph: 'damage', rarity: 'common',
    desc: '+10% weapon damage per level',
    text: (l) => `+${10 * l}% damage`,
    apply: (s, lvl) => { s.damageMult += 0.10 * lvl; },
  },
  {
    id: 'fireRate', name: 'FIRE RATE', glyph: 'fireRate', rarity: 'common',
    desc: '+10% attack speed per level',
    text: (l) => `+${10 * l}% attack speed`,
    apply: (s, lvl) => { s.fireRateMult += 0.10 * lvl; },
  },
  {
    id: 'thrustPower', name: 'THRUST POWER', glyph: 'thrustPower', rarity: 'common',
    desc: '+10% thrust and max speed per level',
    text: (l) => `+${10 * l}% thrust & speed`,
    apply: (s, lvl) => { s.moveSpeedMult += 0.10 * lvl; },
  },
  {
    id: 'projectileSpeed', name: 'PROJECTILE SPEED', glyph: 'projectileSpeed', rarity: 'common',
    desc: '+10% projectile speed per level',
    text: (l) => `+${10 * l}% projectile speed`,
    apply: (s, lvl) => { s.projectileSpeedMult += 0.10 * lvl; },
  },
  {
    id: 'area', name: 'BLAST AREA', glyph: 'area', rarity: 'rare',
    desc: '+10% area & radius per level',
    text: (l) => `+${10 * l}% area & radius`,
    apply: (s, lvl) => { s.areaMult += 0.10 * lvl; },
  },
  {
    id: 'maxHp', name: 'REINFORCED HULL', glyph: 'maxHp', rarity: 'common',
    desc: '+20 max hull per level',
    text: (l) => `+${20 * l} max hull`,
    apply: (s, lvl) => { s.maxHp += 20 * lvl; },
  },
  {
    id: 'armor', name: 'ARMOR PLATING', glyph: 'armor', rarity: 'rare',
    desc: '-1 damage taken per hit, per level',
    text: (l) => `-${l} damage taken`,
    apply: (s, lvl) => { s.armor += 1 * lvl; },
  },
  {
    id: 'pickupRange', name: 'MAGNET COIL', glyph: 'pickupRange', rarity: 'rare',
    desc: '+25% pickup range per level',
    text: (l) => `+${25 * l}% pickup range`,
    apply: (s, lvl) => { s.pickupRange += 0.25 * lvl; },
  },
  {
    id: 'luck', name: 'FORTUNE', glyph: 'luck', rarity: 'epic',
    desc: '+10% luck (rarer cards, better drops) per level',
    text: (l) => `+${10 * l}% luck`,
    apply: (s, lvl) => { s.luck += 0.10 * lvl; },
  },
  {
    id: 'critChance', name: 'CRITICAL CORE', glyph: 'critChance', rarity: 'epic',
    desc: '+5% critical chance (2.5x damage) per level',
    text: (l) => `+${5 * l}% crit chance`,
    apply: (s, lvl) => { s.critChance += 0.05 * lvl; },
  },
  {
    id: 'reverseThrust', name: 'RETRO THRUST', glyph: 'reverseThrust', rarity: 'common',
    desc: 'Unlocks reverse thrust, stronger per level',
    text: (l) => l === 1 ? 'Unlocks reverse (35% power)' : `${Math.round((0.35 + (l - 1) * 0.12) * 100)}% reverse power`,
    apply: (s, lvl) => { s.reverseMult += 0.35 + (lvl - 1) * 0.12; },
  },
  {
    id: 'splitCore', name: 'SPLIT CORE', glyph: 'splitCore', rarity: 'epic', maxLevel: 2,
    desc: '+1 projectile to every weapon per level',
    text: (l) => `+${l} projectile to all weapons`,
    apply: (s, lvl) => { s.amount += lvl; },
  },
  {
    id: 'naniteRepair', name: 'NANITE REPAIR', glyph: 'naniteRepair', rarity: 'rare',
    desc: '+0.3 hull regen per second, per level',
    text: (l) => `+${(0.3 * l).toFixed(1)} hull/sec`,
    apply: (s, lvl) => { s.regen += 0.3 * lvl; },
  },
  {
    id: 'xpGain', name: 'VETERAN INSTINCT', glyph: 'xpGain', rarity: 'rare',
    desc: '+8% experience gained per level',
    text: (l) => `+${8 * l}% XP gained`,
    apply: (s, lvl) => { s.xpMult += 0.08 * lvl; },
  },
  {
    id: 'curse', name: 'AGGRO BEACON', glyph: 'curse', rarity: 'rare',
    desc: 'More & stronger enemies, +10% XP per level',
    text: (l) => `+${10 * l}% curse, +${10 * l}% XP`,
    apply: (s, lvl) => { s.curse += 0.10 * lvl; s.xpMult += 0.10 * lvl; },
  },
];

export const PASSIVE_MAP = Object.fromEntries(PASSIVES.map((p) => [p.id, p]));
