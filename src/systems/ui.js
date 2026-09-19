// Screen-space UI: HUD, upgrade cards, main menu (character select + meta
// shop), and end screens. Drawn with the same vector primitives as the world.

import { CONFIG } from '../config.js';
import { startRun, applyCard, generateOffers } from '../state.js';
import { resolveCard, closeChest } from './leveling.js';
import { persistSave, defaultSave, persistSettings } from '../save.js';
import { drawGlyph } from '../data/glyphs.js';
import { WEAPON_MAP } from '../data/weapons.js';
import { PASSIVE_MAP } from '../data/passives.js';
import { clamp } from '../engine/math.js';

const RARITY_COLOR = { common: 'ui', rare: 'playerBullet', epic: 'orbital', legendary: 'boss' };

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function mouse(game) {
  const v = game.view || { scale: 1, ox: 0, oy: 0 };
  return [(game.input.mouse.x - v.ox) / v.scale, (game.input.mouse.y - v.oy) / v.scale];
}

function inRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function strokeRect(r, x, y, w, h, style) {
  r.polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], style);
}

function drawPips(r, x, y, level, max, color = 'ui') {
  const size = 10, gap = 5;
  for (let i = 0; i < max; i++) {
    const px = x + i * (size + gap);
    r.polygon([[px, y], [px + size, y], [px + size, y + size], [px, y + size]], {
      color: i < level ? color : 'uiDim', width: 1, fill: i < level,
    });
  }
}

// Sell-button region for a permanent-upgrade row.
function metaSellRect(rect) {
  return { x: rect.x + rect.w - 104, y: rect.y + 6, w: 96, h: rect.h - 12 };
}

// ---------------- HUD ----------------

export function renderHUD(game, r) {
  const W = CONFIG.WIDTH;
  const stats = game.stats;
  if (!stats) return;

  const hpW = 220, hpH = 14, hpx = 16, hpy = 16;
  const frac = clamp(game.hp / stats.maxHp, 0, 1);
  strokeRect(r, hpx, hpy, hpW, hpH, { color: 'uiDim', width: 1 });
  if (frac > 0) r.rect(hpx + 1, hpy + 1, (hpW - 2) * frac, hpH - 2, { color: 'heart', alpha: 0.9 });
  r.text(`${Math.ceil(game.hp)}/${stats.maxHp}`, hpx + hpW / 2, hpy + hpH / 2, { size: 11, color: 'white', align: 'center' });

  r.text(formatTime(game.time), W / 2, 26, { size: 28, color: 'ui', align: 'center' });

  let wy = 24;
  for (const [wid, lvl] of game.build.weapons) {
    const def = WEAPON_MAP[wid];
    if (!def) continue;
    drawGlyph(r, def.glyph, W - 54, wy, 11, 'ui');
    r.text(String(lvl), W - 24, wy, { size: 13, color: 'playerBullet', align: 'right' });
    wy += 26;
  }
  wy += 6;
  r.text(`W ${game.build.weapons.size}/${CONFIG.slots.weapons}  P ${game.build.passives.size}/${CONFIG.slots.passives}`, W - 24, wy, { size: 11, color: 'uiDim', align: 'right' });

  const xpW = 360, xpH = 8, xpx = W / 2 - xpW / 2, xpy = CONFIG.HEIGHT - 20;
  strokeRect(r, xpx, xpy, xpW, xpH, { color: 'uiDim', width: 1 });
  r.rect(xpx + 1, xpy + 1, (xpW - 2) * clamp(game.xp / game.xpNeeded, 0, 1), xpH - 2, { color: 'gem', alpha: 0.8 });
  r.text(`LV ${game.level}`, xpx - 12, xpy + xpH / 2, { size: 12, color: 'ui', align: 'right' });

  const ready = game.dashCooldown <= 0;
  r.text('DASH', 16, CONFIG.HEIGHT - 20, { size: 11, color: ready ? 'playerBullet' : 'uiDim', align: 'left' });
  strokeRect(r, 56, CONFIG.HEIGHT - 26, 60, 10, { color: 'uiDim', width: 1 });
  r.rect(57, CONFIG.HEIGHT - 25, 58 * (1 - clamp(game.dashCooldown / CONFIG.player.dashCooldown, 0, 1)), 8, { color: 'playerBullet', alpha: 0.8 });

  if (game.bossAlive >= 0) {
    const e = game.world.get(game.bossAlive, 'enemy');
    if (e) {
      const bw = 420, bx = W / 2 - bw / 2, by = 40;
      r.text(e.type.replace(/_/g, ' ').toUpperCase(), W / 2, by + 8, { size: 12, color: 'boss', align: 'center' });
      strokeRect(r, bx, by + 14, bw, 8, { color: 'uiDim', width: 1 });
      r.rect(bx + 1, by + 15, (bw - 2) * clamp(e.hp / e.maxHp, 0, 1), 6, { color: 'boss', alpha: 0.9 });
    }
  }

  if (game.banner && game.banner.ttl > 0) {
    const a = clamp(game.banner.ttl, 0, 1);
    r.text(game.banner.text, W / 2, CONFIG.HEIGHT * 0.3, { size: 34, color: 'boss', alpha: a, align: 'center' });
  }
}

// ---------------- Upgrade cards ----------------

function cardLayout() {
  const cw = 280, ch = 360, gap = 26;
  const total = cw * 3 + gap * 2;
  const x0 = CONFIG.WIDTH / 2 - total / 2;
  const y0 = CONFIG.HEIGHT / 2 - ch / 2;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (cw + gap), y: y0, w: cw, h: ch }));
}

function drawCard(r, card, rect, selected, hover) {
  const color = RARITY_COLOR[card.rarity] || 'ui';
  const lift = selected ? -10 : 0;
  const x = rect.x, y = rect.y + lift, w = rect.w, h = rect.h;

  r.rect(x, y, w, h, { color: 'bg', alpha: 0.85 });
  const borderColor = selected ? color : hover ? color : 'uiDim';
  const borderWidth = selected ? 3 : 2;
  strokeRect(r, x, y, w, h, { color: borderColor, width: borderWidth, glow: (selected || hover) && card.rarity !== 'common' ? 1 : 0 });
  if (selected && card.rarity !== 'common') {
    strokeRect(r, x + 4, y + 4, w - 8, h - 8, { color: color, width: 1, alpha: 0.4 });
  }

  drawGlyph(r, card.glyph, x + w / 2, y + 70, 40, color);

  if (card.kind === 'evolution' || card.kind === 'union') r.text(card.kind.toUpperCase(), x + w / 2, y + 118, { size: 12, color: 'boss', align: 'center' });
  r.text(card.name, x + w / 2, y + 142, { size: 20, color: 'white', align: 'center' });

  r.text(card.rarity.toUpperCase(), x + w / 2, y + 168, { size: 11, color, align: 'center' });

  drawPips(r, x + w / 2 - 35, y + 182, card.level, card.maxLevel, color);

  const desc = wrapText(card.desc, 24);
  desc.forEach((line, i) => {
    r.text(line, x + w / 2, y + 206 + i * 18, { size: 13, color: 'ui', align: 'center' });
  });

  if (card.text && card.kind !== 'evolution') {
    const lvl = card.level;
    if (lvl === 0) {
      r.text(`GAIN  ${card.text(1)}`, x + w / 2, y + 250, { size: 12, color: 'gem', align: 'center' });
    } else {
      r.text(`NOW  ${card.text(lvl)}`, x + w / 2, y + 250, { size: 12, color: 'ui', align: 'center' });
      if (lvl < card.maxLevel) {
        r.text(`NEXT  ${card.text(lvl + 1)}`, x + w / 2, y + 268, { size: 12, color: 'gem', align: 'center' });
      }
    }
  }

  if (card.level === 0 && card.kind !== 'evolution') {
    r.text('NEW', x + w / 2, y + h - 20, { size: 14, color: 'gem', align: 'center' });
  }
}

function wrapText(str, maxLen) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxLen) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function renderCardScreen(game, r) {
  r.rect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT, { color: 'bg', alpha: 0.62 });
  const title = game.cardMode.kind === 'chest' ? 'SUPPLY CHEST' : 'LEVEL UP';
  r.text(title, CONFIG.WIDTH / 2, 70, { size: 40, color: 'white', align: 'center' });

  const rects = cardLayout();
  const hover = hoverIndex(game, rects);
  game.cardMode.offers.forEach((card, i) => {
    drawCard(r, card, rects[i], i === game.cardMode.index, i === hover);
  });

  const hint = `← → ↑ ↓ select   ENTER choose   R reroll (${game.rerolls})   B banish (${game.rerolls})   ESC skip`;
  r.text(hint, CONFIG.WIDTH / 2, CONFIG.HEIGHT - 34, { size: 14, color: 'uiDim', align: 'center' });
}

function hoverIndex(game, rects) {
  const [mx, my] = mouse(game);
  for (let i = 0; i < rects.length; i++) if (inRect(mx, my, rects[i])) return i;
  return -1;
}

export function updateCardScreen(game, dt) {
  const input = game.input;
  const cm = game.cardMode;
  if (!cm) return;
  const n = cm.offers.length;
  if (n === 0) { resolveCard(game); return; }

  let moved = false;
  if (input.justPressed('ArrowLeft') || input.justPressed('ArrowUp') || input.justPressed('KeyA') || input.justPressed('KeyW')) {
    cm.index = (cm.index - 1 + n) % n;
    moved = true;
  }
  if (input.justPressed('ArrowRight') || input.justPressed('ArrowDown') || input.justPressed('KeyD') || input.justPressed('KeyS')) {
    cm.index = (cm.index + 1) % n;
    moved = true;
  }
  if (moved) game.audio?.select?.();

  // Mouse only drives selection when it is actively moving, so a cursor
  // resting mid-screen can never fight keyboard navigation.
  const rects = cardLayout();
  const h = hoverIndex(game, rects);
  if (!moved && input.mouse.moved && h >= 0) cm.index = h;

  const keys = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];
  for (let i = 0; i < 3; i++) {
    if (input.justPressed(keys[i]) || input.justPressed(keys[i + 3])) {
      if (cm.offers[i]) choose(game, cm.offers[i]);
      return;
    }
  }

  if (input.mouse.pressed && h >= 0) {
    if (cm.offers[h]) choose(game, cm.offers[h]);
    return;
  }
  if (input.justPressed('Enter')) {
    if (cm.offers[cm.index]) choose(game, cm.offers[cm.index]);
    return;
  }

  if (input.justPressed('KeyR') && game.rerolls > 0) {
    game.rerolls--;
    cm.offers = generateOffers(game, cm.kind);
    game.audio?.select?.();
    return;
  }
  if (input.justPressed('KeyB') && game.rerolls > 0) {
    const card = cm.offers[cm.index];
    if (card && card.kind !== 'evolution') {
      game.build.banished.add(card.id);
      game.rerolls--;
      cm.offers = generateOffers(game, cm.kind);
      game.audio?.select?.();
    }
    return;
  }
  if (input.justPressed('Escape')) {
    resolveCard(game);
  }
}

function choose(game, card) {
  applyCard(game, card);
  game.audio?.select?.();
  resolveCard(game);
}

// ---------------- Main menu ----------------

function menuLayout() {
  const chars = CONFIG.characters.map((c, i) => ({ id: c.id, rect: { x: 56, y: 96 + i * 138, w: 470, h: 120 } }));
  const metas = CONFIG.meta.upgrades.map((m, i) => ({ id: m.id, rect: { x: 640, y: 96 + i * 54, w: 584, h: 44 } }));
  const start = { x: 640, y: 96 + CONFIG.meta.upgrades.length * 54 + 16, w: 584, h: 60 };
  const options = { x: 24, y: 22, w: 110, h: 32 };
  return { chars, metas, start, options };
}

export function renderMenu(game, r) {
  const W = CONFIG.WIDTH;
  r.text('ASTEROID SURVIVORS', W / 2, 44, { size: 40, color: 'white', align: 'center' });
  r.text(`CREDITS  ${game.gold}`, W - 24, 30, { size: 18, color: 'chest', align: 'right' });

  const layout = menuLayout();
  const [mx, my] = mouse(game);

  const ob = layout.options;
  const oHover = inRect(mx, my, ob);
  strokeRect(r, ob.x, ob.y, ob.w, ob.h, { color: oHover ? 'ui' : 'uiDim', width: 1 });
  r.text('OPTIONS', ob.x + ob.w / 2, ob.y + ob.h / 2, { size: 14, color: oHover ? 'white' : 'ui', align: 'center' });

  for (let i = 0; i < layout.chars.length; i++) {
    const c = CONFIG.characters[i];
    const rect = layout.chars[i].rect;
    const unlocked = game.save.unlocked.includes(c.id);
    const selected = game.selectedCharId === c.id;
    const hover = inRect(mx, my, rect);
    const color = selected ? c.color : unlocked ? 'ui' : 'uiDim';
    strokeRect(r, rect.x, rect.y, rect.w, rect.h, { color: selected ? c.color : hover ? 'ui' : 'uiDim', width: selected ? 3 : 1, glow: selected ? 1 : 0 });
    r.text(c.name.toUpperCase(), rect.x + 20, rect.y + 26, { size: 20, color, align: 'left' });
    r.text(c.desc, rect.x + 20, rect.y + 54, { size: 12, color: 'ui', align: 'left' });
    r.text(`HP ${c.hp}   SPEED ${c.maxSpeed}`, rect.x + 20, rect.y + 76, { size: 11, color: 'uiDim', align: 'left' });
    r.text(unlocked ? (selected ? 'SELECTED' : 'CLICK TO SELECT') : `UNLOCK  ${c.cost}C`, rect.x + 20, rect.y + 100, { size: 12, color: unlocked ? 'playerBullet' : 'chest', align: 'left' });
  }

  r.text('PERMANENT UPGRADES', 640, 84, { size: 14, color: 'ui', align: 'left' });
  for (let i = 0; i < layout.metas.length; i++) {
    const m = CONFIG.meta.upgrades[i];
    const rect = layout.metas[i].rect;
    const lvl = game.save.meta[m.id] || 0;
    const maxed = lvl >= m.max;
    const cost = Math.floor(m.cost * Math.pow(m.costGrowth, lvl));
    const afford = game.gold >= cost;
    const hover = inRect(mx, my, rect);
    strokeRect(r, rect.x, rect.y, rect.w, rect.h, { color: hover && !maxed && afford ? 'ui' : 'uiDim', width: 1 });
    r.text(m.name, rect.x + 16, rect.y + rect.h / 2, { size: 14, color: 'ui', align: 'left' });
    drawPips(r, rect.x + 200, rect.y + 17, lvl, m.max, 'playerBullet');
    r.text(maxed ? 'MAX' : `${cost}C`, rect.x + rect.w - 118, rect.y + rect.h / 2, { size: 13, color: maxed ? 'uiDim' : afford ? 'chest' : 'uiDim', align: 'right' });

    if (lvl > 0) {
      const srect = metaSellRect(rect);
      const refund = Math.floor(m.cost * Math.pow(m.costGrowth, lvl - 1));
      const shover = inRect(mx, my, srect);
      strokeRect(r, srect.x, srect.y, srect.w, srect.h, { color: shover ? 'heart' : 'uiDim', width: shover ? 2 : 1 });
      r.text(`SELL +${refund}C`, srect.x + srect.w / 2, srect.y + srect.h / 2, { size: 12, color: shover ? 'heart' : 'ui', align: 'center' });
    }
  }

  const srect = layout.start;
  const shover = inRect(mx, my, srect);
  strokeRect(r, srect.x, srect.y, srect.w, srect.h, { color: shover ? 'playerBullet' : 'ui', width: 3, glow: shover ? 1 : 0 });
  r.text('LAUNCH  (ENTER)', srect.x + srect.w / 2, srect.y + srect.h / 2, { size: 22, color: 'white', align: 'center' });

  // Prominent run stats, centered beneath the shop panels.
  const sy = 556;
  r.line(W / 2 - 380, sy - 54, W / 2 + 380, sy - 54, { color: 'uiDim', width: 1, alpha: 0.5 });
  const stats = [
    ['BEST RUN', formatTime(game.save.bestTime), 'playerBullet'],
    ['MAX LEVEL', String(game.save.bestLevel), 'ui'],
    ['RUNS', String(game.save.runs), 'chest'],
  ];
  stats.forEach(([label, value, color], i) => {
    const cx = W / 2 + (i - 1) * 240;
    r.text(label, cx, sy - 18, { size: 13, color: 'uiDim', align: 'center' });
    r.text(value, cx, sy + 16, { size: 36, color, align: 'center' });
  });

  r.text('W/↑ thrust · S/↓ reverse · A D rotate · Space dash · P pause · ESC quit · M mute', W / 2, CONFIG.HEIGHT - 20, { size: 12, color: 'uiDim', align: 'center' });
}

export function updateMenu(game, dt) {
  const input = game.input;
  const layout = menuLayout();
  const [mx, my] = mouse(game);

  if (input.mouse.pressed && inRect(mx, my, layout.options)) {
    game.state = 'options';
    game.optionsSel = 0;
    game.confirmReset = false;
    game.audio?.select?.();
    return;
  }

  for (let i = 0; i < layout.chars.length; i++) {
    const c = CONFIG.characters[i];
    const rect = layout.chars[i].rect;
    if (input.mouse.pressed && inRect(mx, my, rect)) {
      if (game.save.unlocked.includes(c.id)) {
        game.selectedCharId = c.id;
        game.audio?.select?.();
      } else if (game.gold >= c.cost) {
        game.gold -= c.cost;
        game.save.gold = game.gold;
        game.save.unlocked.push(c.id);
        game.selectedCharId = c.id;
        persistSave(game.save);
        game.audio?.levelup?.();
      }
    }
  }

  for (let i = 0; i < layout.metas.length; i++) {
    const m = CONFIG.meta.upgrades[i];
    const rect = layout.metas[i].rect;
    const lvl = game.save.meta[m.id] || 0;
    const sellRect = metaSellRect(rect);

    // Sell button (refund the last level purchased).
    if (input.mouse.pressed && lvl > 0 && inRect(mx, my, sellRect)) {
      const refund = Math.floor(m.cost * Math.pow(m.costGrowth, lvl - 1));
      game.gold += refund;
      game.save.gold = game.gold;
      game.save.meta[m.id] = lvl - 1;
      persistSave(game.save);
      game.audio?.select?.();
      continue;
    }

    // Buy (click the row, excluding the sell button).
    if (input.mouse.pressed && lvl < m.max && inRect(mx, my, rect) && !inRect(mx, my, sellRect)) {
      const cost = Math.floor(m.cost * Math.pow(m.costGrowth, lvl));
      if (game.gold >= cost) {
        game.gold -= cost;
        game.save.gold = game.gold;
        game.save.meta[m.id] = lvl + 1;
        persistSave(game.save);
        game.audio?.select?.();
      }
    }
  }

  if (input.justPressed('Enter') || (input.mouse.pressed && inRect(mx, my, layout.start))) {
    launch(game);
  }
}

function launch(game) {
  const c = CONFIG.characters.find((x) => x.id === game.selectedCharId) || CONFIG.characters[0];
  game.char = c;
  game.meta = game.save.meta;
  startRun(game);
  game.audio?.select?.();
}

// ---------------- End screens ----------------

export function renderEnd(game, r) {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  r.rect(0, 0, W, H, { color: 'bg', alpha: 0.7 });
  const win = game.state === 'victory';
  r.text(win ? 'VICTORY' : 'GAME OVER', W / 2, H / 2 - 150, { size: 60, color: win ? 'boss' : 'heart', align: 'center' });

  const nb = game.newBest || {};
  const rows = [
    ['TIME', formatTime(game.time), nb.time],
    ['LEVEL', String(game.level), nb.level],
    ['CREDITS', `+${game.runCredits}`, nb.credits],
    ['SCORE', String(game.score), false],
  ];
  let y = H / 2 - 70;
  for (const [label, value, isBest] of rows) {
    r.text(label, W / 2 - 130, y, { size: 16, color: 'uiDim', align: 'right' });
    r.text(value, W / 2 - 100, y, { size: 20, color: 'white', align: 'left' });
    if (isBest) r.text('NEW BEST', W / 2 + 120, y, { size: 14, color: 'boss', align: 'left' });
    y += 34;
  }

  r.text('ENTER to return to menu', W / 2, H / 2 + 110, { size: 16, color: 'uiDim', align: 'center' });
}

export function updateEnd(game, dt) {
  if (game.input.justPressed('Enter')) {
    game.state = 'menu';
    game.bossAlive = -1;
    game.world.clear();
  }
}

// ---------------- Treasure chest reveal ----------------

const CHEST_CARD_W = 180, CHEST_CARD_H = 210, CHEST_GAP = 14;

function chestCardRects(n) {
  if (n <= 0) return [];
  const total = n * CHEST_CARD_W + (n - 1) * CHEST_GAP;
  const x0 = CONFIG.WIDTH / 2 - total / 2;
  const y0 = CONFIG.HEIGHT / 2 - CHEST_CARD_H / 2 + 20;
  const rects = [];
  for (let i = 0; i < n; i++) rects.push({ x: x0 + i * (CHEST_CARD_W + CHEST_GAP), y: y0, w: CHEST_CARD_W, h: CHEST_CARD_H });
  return rects;
}

function drawPod(r, cx, cy, s, shake, open) {
  const x = cx + (Math.random() - 0.5) * shake;
  const y = cy + (Math.random() - 0.5) * shake;
  const hex = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    hex.push([x + Math.cos(a) * s, y + Math.sin(a) * s]);
  }
  r.polygon(hex, { color: 'chest', width: 2, glow: 1 });
  const inner = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    inner.push([x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6]);
  }
  r.polygon(inner, { color: 'chest', width: 1, alpha: 0.5 });
  if (open) {
    r.circle(x, y, s * 0.28, { color: 'chest', width: 1, fill: true, glow: 1 });
  } else {
    r.circle(x, y, s * 0.18, { color: 'chest', width: 1, fill: true });
  }
}

function drawRewardCard(r, card, rect) {
  const color = RARITY_COLOR[card.rarity] || 'ui';
  r.rect(rect.x, rect.y, rect.w, rect.h, { color: 'bg', alpha: 0.85 });
  strokeRect(r, rect.x, rect.y, rect.w, rect.h, { color, width: 2, glow: card.rarity === 'legendary' ? 1 : 0 });
  drawGlyph(r, card.glyph, rect.x + rect.w / 2, rect.y + 62, 34, color);
  r.text(card.name, rect.x + rect.w / 2, rect.y + 118, { size: 15, color: 'white', align: 'center' });
  if (card.kind === 'evolution') {
    r.text('EVOLVED', rect.x + rect.w / 2, rect.y + 148, { size: 13, color: 'boss', align: 'center' });
  } else if (card.kind === 'union') {
    r.text('UNION', rect.x + rect.w / 2, rect.y + 148, { size: 13, color: 'boss', align: 'center' });
  } else {
    r.text(`LV ${card.level} → ${card.level + 1}`, rect.x + rect.w / 2, rect.y + 148, { size: 13, color: 'gem', align: 'center' });
  }
}

function spawnChestBurst(cs) {
  const cx = CONFIG.WIDTH / 2, cy = CONFIG.HEIGHT / 2 - 20;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 220;
    cs.burst.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8, maxLife: 0.8, size: 1 + Math.random() * 3, color: 'chest' });
  }
}

export function renderChest(game, r) {
  const cs = game.chestState;
  if (!cs) return;
  const cx = CONFIG.WIDTH / 2, cy = CONFIG.HEIGHT / 2;
  r.rect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT, { color: 'bg', alpha: 0.55 });
  const title = cs.tier >= 5 ? 'RELIC VAULT' : cs.tier >= 3 ? 'SALVAGE CRATE' : 'SALVAGE POD';
  r.text(title, cx, 60, { size: 34, color: 'chest', align: 'center' });

  if (cs.phase === 'open') {
    const shake = 2 + cs.t * 14;
    drawPod(r, cx, cy - 20, 60, shake, false);
    r.circle(cx, cy - 20, 50 + cs.t * 130, { color: 'chest', width: 2, alpha: Math.min(0.5, cs.t * 0.55) });
  } else if (cs.phase === 'reveal') {
    drawPod(r, cx, cy - 150, 28, 0, true);
    const rects = chestCardRects(cs.rewards.length);
    for (let i = 0; i < cs.index; i++) drawRewardCard(r, cs.rewards[i], rects[i]);
  } else {
    drawPod(r, cx, cy - 150, 28, 0, true);
    const rects = chestCardRects(cs.rewards.length);
    for (let i = 0; i < cs.rewards.length; i++) drawRewardCard(r, cs.rewards[i], rects[i]);
    r.text(`CREDITS +${cs.gold}`, cx, cy + 150, { size: 22, color: 'chest', align: 'center' });
    r.text('ENTER to continue', cx, cy + 190, { size: 14, color: 'uiDim', align: 'center' });
  }

  for (const p of cs.burst) {
    r.circle(p.x, p.y, p.size, { color: p.color, width: 1, fill: true, alpha: Math.max(0, p.life / p.maxLife) });
  }
}

export function updateChest(game, dt) {
  const cs = game.chestState;
  if (!cs) return;
  cs.t += dt;

  for (const p of cs.burst) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }

  if (cs.phase === 'open') {
    if (cs.t >= 1.25) {
      spawnChestBurst(cs);
      game.audio?.explosion?.();
      cs.phase = 'reveal';
      cs.t = 0;
      cs.index = 0;
    }
  } else if (cs.phase === 'reveal') {
    if (cs.index < cs.rewards.length && cs.t >= cs.index * 0.5) {
      applyCard(game, cs.rewards[cs.index]);
      game.audio?.select?.();
      cs.index++;
    }
    if (cs.index >= cs.rewards.length && cs.t >= cs.rewards.length * 0.5 + 0.4) {
      cs.phase = 'done';
      cs.t = 0;
    }
  }

  const input = game.input;
  if (input.justPressed('Enter') || input.justPressed('Escape') || input.mouse.pressed) {
    if (cs.phase === 'done') {
      closeChest(game);
    } else {
      while (cs.index < cs.rewards.length) {
        applyCard(game, cs.rewards[cs.index]);
        cs.index++;
      }
      cs.phase = 'done';
      cs.t = 0;
    }
  }
}

// ---------------- Quit confirmation ----------------

function drawButton(r, rect, label, selected, hover) {
  strokeRect(r, rect.x, rect.y, rect.w, rect.h, {
    color: selected ? 'playerBullet' : hover ? 'ui' : 'uiDim',
    width: selected ? 3 : 1, glow: selected ? 1 : 0,
  });
  r.text(label, rect.x + rect.w / 2, rect.y + rect.h / 2, { size: 18, color: selected ? 'white' : 'ui', align: 'center' });
}

function quitButtons() {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  const bw = 80, bh = 44, gap = 24;
  const x = W / 2 - bw - gap / 2, y = H / 2 - 20;
  return { yes: { x, y, w: bw, h: bh }, no: { x: x + bw + gap, y, w: bw, h: bh } };
}

export function renderQuitConfirm(game, r) {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  r.rect(0, 0, W, H, { color: 'bg', alpha: 0.6 });
  r.text('QUIT GAME?', W / 2, H / 2 - 70, { size: 34, color: 'white', align: 'center' });
  const { yes, no } = quitButtons();
  const [mx, my] = mouse(game);
  drawButton(r, yes, 'YES', game.quitSel === 0, inRect(mx, my, yes));
  drawButton(r, no, 'NO', game.quitSel === 1, inRect(mx, my, no));
  r.text('← → select · ENTER confirm · ESC cancel', W / 2, H / 2 + 60, { size: 12, color: 'uiDim', align: 'center' });
}

export function updateQuitConfirm(game, dt) {
  const input = game.input;
  const { yes, no } = quitButtons();
  const [mx, my] = mouse(game);

  if (input.justPressed('ArrowLeft') || input.justPressed('ArrowRight') || input.justPressed('KeyA') || input.justPressed('KeyD')) {
    game.quitSel = game.quitSel === 0 ? 1 : 0;
    game.audio?.select?.();
  }
  if (input.mouse.moved) {
    if (inRect(mx, my, yes)) game.quitSel = 0;
    else if (inRect(mx, my, no)) game.quitSel = 1;
  }

  const isYes = input.justPressed('KeyY')
    || (input.justPressed('Enter') && game.quitSel === 0)
    || (input.mouse.pressed && inRect(mx, my, yes));
  const isNo = input.justPressed('KeyN')
    || (input.justPressed('Enter') && game.quitSel === 1)
    || (input.mouse.pressed && inRect(mx, my, no));

  if (isYes) {
    game.quitConfirm = false;
    game.onQuit?.();
    return;
  }
  if (isNo || input.justPressed('Escape')) {
    game.quitConfirm = false;
    game.quitSel = 0;
  }
}

// ---------------- Options menu ----------------

function optionsButtons() {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  return [
    { x: W / 2 - 200, y: H / 2 - 76, w: 400, h: 50 },
    { x: W / 2 - 200, y: H / 2 - 16, w: 400, h: 50 },
    { x: W / 2 - 200, y: H / 2 + 44, w: 400, h: 50 },
  ];
}

function confirmButtons() {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  const bw = 90, bh = 44, gap = 20;
  const x = W / 2 - bw - gap / 2;
  return [
    { x, y: H / 2 + 10, w: bw, h: bh },
    { x: x + bw + gap, y: H / 2 + 10, w: bw, h: bh },
  ];
}

function doReset(game) {
  const fresh = defaultSave();
  game.save = fresh;
  game.gold = 0;
  game.selectedCharId = 'voyager';
  game.meta = fresh.meta;
  persistSave(fresh);
}

export function renderOptions(game, r) {
  const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  r.rect(0, 0, W, H, { color: 'bg', alpha: 0.9 });
  r.text('OPTIONS', W / 2, 70, { size: 40, color: 'white', align: 'center' });
  const [mx, my] = mouse(game);

  if (game.confirmReset) {
    r.text('Reset ALL progress?', W / 2, H / 2 - 70, { size: 28, color: 'heart', align: 'center' });
    r.text('This clears credits, upgrades and unlocked ships.', W / 2, H / 2 - 38, { size: 13, color: 'ui', align: 'center' });
    const btns = confirmButtons();
    drawButton(r, btns[0], 'YES', game.optionsSel === 0, inRect(mx, my, btns[0]));
    drawButton(r, btns[1], 'NO', game.optionsSel === 1, inRect(mx, my, btns[1]));
  } else {
    r.text(`Credits ${game.gold}  ·  Runs ${game.save.runs}  ·  Best ${formatTime(game.save.bestTime)}`, W / 2, H / 2 - 130, { size: 13, color: 'uiDim', align: 'center' });
    const btns = optionsButtons();
    const wrapOn = game.settings.wrap !== false;
    drawButton(r, btns[0], `SCREEN WRAP: ${wrapOn ? 'ON' : 'OFF'}`, game.optionsSel === 0, inRect(mx, my, btns[0]));
    drawButton(r, btns[1], 'RESET PROGRESS', game.optionsSel === 1, inRect(mx, my, btns[1]));
    drawButton(r, btns[2], 'BACK', game.optionsSel === 2, inRect(mx, my, btns[2]));
  }
  r.text('← → select · ENTER confirm · ESC back', W / 2, H - 30, { size: 12, color: 'uiDim', align: 'center' });
}

export function updateOptions(game, dt) {
  const input = game.input;
  const [mx, my] = mouse(game);
  const btns = game.confirmReset ? confirmButtons() : optionsButtons();

  if (input.justPressed('Escape')) {
    if (game.confirmReset) game.confirmReset = false;
    else game.state = 'menu';
    game.optionsSel = 0;
    game.audio?.select?.();
    return;
  }

  if (input.justPressed('ArrowLeft') || input.justPressed('ArrowRight') || input.justPressed('ArrowUp') || input.justPressed('ArrowDown') || input.justPressed('KeyA') || input.justPressed('KeyD')) {
    game.optionsSel = (game.optionsSel + 1) % btns.length;
    game.audio?.select?.();
  }
  if (input.mouse.moved) {
    for (let i = 0; i < btns.length; i++) {
      if (inRect(mx, my, btns[i])) game.optionsSel = i;
    }
  }

  let chosen = -1;
  if (input.mouse.pressed) {
    for (let i = 0; i < btns.length; i++) {
      if (inRect(mx, my, btns[i])) { chosen = i; break; }
    }
  } else if (input.justPressed('Enter')) {
    chosen = game.optionsSel;
  }
  if (chosen < 0) return;

  if (!game.confirmReset) {
    if (chosen === 0) {
      game.settings.wrap = game.settings.wrap === false;
      persistSettings(game.settings);
      game.audio?.select?.();
      return;
    }
    if (chosen === 1) game.confirmReset = true;
    else game.state = 'menu';
  } else {
    if (chosen === 0) doReset(game);
    game.confirmReset = false;
  }
  game.optionsSel = 0;
  game.audio?.select?.();
}

// ---------------- Dispatch ----------------

export function render(game, r) {
  switch (game.state) {
    case 'menu': renderMenu(game, r); break;
    case 'options': renderOptions(game, r); break;
    case 'playing':
      renderHUD(game, r);
      if (game.quitConfirm) renderQuitConfirm(game, r);
      break;
    case 'levelup': renderHUD(game, r); renderCardScreen(game, r); break;
    case 'chest': renderChest(game, r); break;
    case 'gameover':
    case 'victory': renderEnd(game, r); break;
  }
}

export function update(game, dt) {
  switch (game.state) {
    case 'menu': updateMenu(game, dt); break;
    case 'options': updateOptions(game, dt); break;
    case 'levelup': updateCardScreen(game, dt); break;
    case 'chest': updateChest(game, dt); break;
    case 'gameover':
    case 'victory': updateEnd(game, dt); break;
  }
}
