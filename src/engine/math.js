// Small, allocation-light math helpers shared across the game.

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Smallest signed angle from a to b.
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function vecFromAngle(a, mag = 1) {
  return [Math.cos(a) * mag, Math.sin(a) * mag];
}

export function wrap(value, max) {
  return ((value % max) + max) % max;
}

// Position wrap helper (screen edges).
export function wrapX(x, w) { return wrap(x, w); }
export function wrapY(y, h) { return wrap(y, h); }

// Regular polygon vertices (for ships, gems, saucers).
export function regularPolygon(sides, radius, rot = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

// Irregular polygon for asteroids: a jittered circle that reads as a rock.
export function irregularPolygon(seedRadius, jag = 0.32, minVerts = 8, maxVerts = 12) {
  const n = randInt(minVerts, maxVerts);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = seedRadius * (1 + rand(-jag, jag));
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

// Weighted random selection. `items` is [item, weight][]; returns item.
export function weightedPick(items) {
  let total = 0;
  for (const [, w] of items) total += w;
  let roll = Math.random() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}
