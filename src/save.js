// Persistent meta-progression (gold, unlocked characters, permanent upgrades)
// backed by localStorage. Gracefully degrades if storage is unavailable.

const KEY = 'asteroidSurvivors.save.v1';

const DEFAULT_META = {
  baseDamage: 0, baseHP: 0, bonusGold: 0, luck: 0, startWeapon: 0, revive: 0,
};

export function defaultSave() {
  return {
    gold: 0,
    unlocked: ['voyager'],
    meta: { ...DEFAULT_META },
    bestTime: 0,
    bestLevel: 0,
    bestCredits: 0,
    runs: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return {
      gold: parsed.gold ?? 0,
      unlocked: parsed.unlocked ?? ['voyager'],
      meta: { ...DEFAULT_META, ...(parsed.meta || {}) },
      bestTime: parsed.bestTime ?? 0,
      bestLevel: parsed.bestLevel ?? 0,
      bestCredits: parsed.bestCredits ?? 0,
      runs: parsed.runs ?? 0,
    };
  } catch {
    return defaultSave();
  }
}

export function persistSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

// ---- Settings (separate from progress, so reset-progress doesn't touch it) ----

const SETTINGS_KEY = 'asteroidSurvivors.settings.v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { wrap: true };
    return { wrap: true, ...JSON.parse(raw) };
  } catch {
    return { wrap: true };
  }
}

export function persistSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* non-fatal */
  }
}
