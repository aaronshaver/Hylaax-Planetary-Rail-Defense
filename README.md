# Planetary Rail Defense

Train tower defense game

Play it here: https://aaronshaver.github.io/Hylaax-Planetary-Rail-Defense

## Development

The browser loads the game in this order:

- `core.js` — constants, hex geometry, and shared helpers
- `terrain.js` — deterministic terrain generation
- `world.js` — world state, selection, sound, and map access
- `rail.js` — Track construction, routing, and schedules
- `trains.js` — Train control, logistics, repair, and construction
- `enemies.js` — Hives, Creeps, navigation, and combat
- `simulation.js` — fixed-step updates and performance counters
- `rendering.js` — canvas rendering and render caches
- `interface.js` — selection panels, HUD updates, and formatting
- `game.js` — test API, event wiring, and application bootstrap

Run the complete multi-file test suite with `npm test`. Each production module has a corresponding `*.test.js` file; shared DOM and canvas mocks live in `harness.js`.
