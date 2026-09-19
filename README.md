# Asteroid Survivors

A 2D arcade roguelite that fuses the vector-graphics movement and physics of
the classic **Asteroids** with the auto-battler progression of
**Vampire Survivors**. Pilot a tiny ship through an endless asteroid field,
auto-firing as you go, collecting experience gems and choosing upgrade cards
until you survive the final boss.

Everything is rendered with line primitives and procedural glow on a pure
black field — no sprites, no textures, no assets.

## Running

The game uses ES modules, so it must be served over HTTP (opening
`index.html` directly via `file://` will be blocked by the browser).

```bash
npm run serve          # python3 -m http.server 8000
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
cards: `←` `→` (or `↑` `↓`) to select, `Enter` to choose, `R` to reroll,
`B` to banish, `ESC` to skip.

## Gameplay

- **Newtonian flight** — thrust, rotate, and brake in a wrap-around arena.
- **Auto-battler weapons** — six base weapons, each with a level-5 cap and an
  **evolution** (weapon at Lv5 + matching passive = a golden evolution card).
- **Passives** — thirteen stat passives, including reverse thrust, projectile
  count, HP regen, luck, and armor.
- **Enemies** — asteroids (small/medium/large/elite), homing crystal shards,
  saucers, and the **Warden** sub-boss every 2.5 minutes.
- **Bosses** — the Colossus (5:00), Mothership (10:00), and Singularity
  (15:00). Survive the Singularity to win.
- **Pickups** — XP gems, hearts, the blue **Vacuum** orb (pulls in all gems),
  and **Salvage Pods** (reward crates dropped by elites, the Warden, and
  bosses) that grant free upgrade cards, evolutions, and credits.
- **Meta progression** — earn credits each run, then spend them on permanent
  upgrades and unlockable ships (Voyager, Dart, Titan). Upgrades can be sold
  back.

## Architecture

```
src/
  engine/     math, input, ECS, spatial hash, renderer, audio
  data/       weapons, passives, enemies, glyphs (all data-driven)
  systems/    gameplay + UI systems
  combat.js   shared entity spawning + damage/health logic
  state.js    run lifecycle, derived stats, upgrade-card generation
  save.js     localStorage meta-progression
  main.js     boot + fixed-timestep game loop
```

The game uses a lightweight hand-rolled **Entity-Component-System**: entities
are integer IDs, components are plain data maps, and systems run in a fixed
order each tick. Adding a new weapon or enemy is mostly a matter of adding a
row to a data table (plus a small behavior function).

## Tests

```bash
node test/smoke.mjs      # headless logic smoke test
node test/bossGate.mjs   # boss spawn-gating test
```

`test/headless.html` runs the full render path in a browser for verification.
