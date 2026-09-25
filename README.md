# Asteroid Survivors

A 2D arcade roguelite that fuses the vector-graphics movement and physics of
the classic **Asteroids** with the auto-battler progression of
**Vampire Survivors**. Pilot a tiny ship through an asteroid field, auto-firing
as you go, hunting down enemy beacons, collecting experience gems and choosing
upgrade cards until you kill the final boss.

Everything is drawn with line and circle primitives plus procedural glow and
bloom on a pure black field, with a CRT pass on top — no image files, no sprite
sheets, no audio files, no dependencies.

## Running

The game uses ES modules, so it must be served over HTTP (opening
`index.html` directly via `file://` will be blocked by the browser).

```bash
npm run serve          # python3 serve.py (sends no-store so browsers don't cache stale ES modules)
# or
npx serve
# or
python3 -m http.server 8000
```

Then open **http://localhost:8000**.

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Thrust |
| `S` / `↓` | Reverse thrust (requires the Retro Thrust card) |
| `A` `D` / `←` `→` | Rotate |
| `Space` | Dash (brief invulnerability) |
| `P` | Pause |
| `M` | Mute |
| `T` | Debug HUD |
| `ESC` | Quit run (with confirmation) |

Your ship **fires automatically**. On level-up the game pauses and offers three
cards: `←` `→` (or `↑` `↓`) to select, `Enter` or `1` `2` `3` (or click) to
choose, `R` to reroll, `B` to banish, `ESC` to skip. Each run starts with two
rerolls, shared between rerolling and banishing.

## Gameplay

- **Newtonian flight** — thrust, rotate, and dash through a bounded 3200×1800
  arena. The camera follows you, and enemies that drift too far away despawn.
- **Beacon contract** — the main objective. Destroy the enemy beacon before its
  30-second timer runs out; five beacons per cycle, then the contract repeats
  forever. Each kill pays credits plus a high-value red gem. Let one time out
  and a wave of ships inbound, growing with every miss. Live beacons shoot back.
- **Auto-battler weapons** — nine base weapons, each capped at level 5, with
  **seven evolutions** (Lv5 weapon + its matching passive) and **four unions**
  (any two maxed weapons). Six weapon and six passive slots.
- **Passives** — fifteen stat passives, including reverse thrust, projectile
  count, hull regen, luck, and armor.
- **Enemies** — asteroids (small/medium/large/elite), homing crystal shards,
  saucer scouts and gunners, and the **Warden** sub-boss every 2.5 minutes.
- **Bosses** — **The Hive** (5:00), **Mothership** (10:00), and **Singularity**
  (15:00). Asteroid waves pause while a boss is alive. Kill the Singularity to
  win.
- **Pickups** — green XP gems, high-value red gems (every 25th gem drop and
  every beacon), hearts, the blue **Vacuum** orb (pulls in every gem), and
  **Salvage Pods**/crates (dropped by elites, the Warden, and bosses) that grant
  free upgrade cards, evolutions, and credits.
- **Meta progression** — earn credits each run, then spend them on permanent
  upgrades and unlockable ships (Voyager, Dart, Titan). Upgrades can be sold
  back. Best time, level, and credits are tracked across runs.
- **Options** — toggle the minimap or reset all progress from the main menu.

## Architecture

```
src/
  engine/     math, input, ECS, spatial hash, renderer, audio
  data/       weapons, passives, enemies, glyphs (all data-driven)
  systems/    camera, movement, playerControl, weaponSystem, enemyAI,
              collision, objectives, pickups, particles, waveDirector,
              leveling, render, ui
  combat.js   shared entity spawning + damage/health logic
  state.js    run lifecycle, derived stats, upgrade-card generation
  save.js     localStorage meta-progression
  main.js     boot + fixed-timestep game loop
```

Zero dependencies and no build step: plain ES modules, one `<script>`, and the
Canvas 2D API. Audio is synthesized with WebAudio at runtime.

The game uses a lightweight hand-rolled **Entity-Component-System**: entities
are integer IDs, components are plain data maps, and systems run in a fixed
order each tick. Adding a new weapon or enemy is mostly a matter of adding a
row to a data table (plus a small behavior function).

## Tests

```bash
node test/smoke.mjs       # headless logic smoke test
node test/bossGate.mjs    # boss spawn-gating test
node test/regressions.mjs # regression tests for fixed bugs
node test/world.mjs       # bounded-world/camera/objective tests
npm run test             # all of the above
```

`test/headless.html` runs the full render path in a browser for verification.
