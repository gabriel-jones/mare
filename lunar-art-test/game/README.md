# Playable foundation

Serve the parent `lunar-art-test/` directory: `python3 -m http.server 8765 --bind 127.0.0.1`, then open http://127.0.0.1:8765/game/.

Dependencies are installed in the parent directory (`npm install` there). Original art study remains at `/`.

## Play

- WASD: screen-relative movement with brisk acceleration and stopping. Shift: run. Space: lunar-gravity jump. Scroll: zoom.
- Click a build card or press1–5. R rotates the footprint. Click ground to place; Escape dismisses placement.
- Walk within5m and hold E to construct. Step outside solid machine footprints before finishing.
- Point at an unfinished blueprint and press Delete to refund it.
- Build solar, battery, habitat and hopper to complete the starter checklist. Add work lights for night.
- Walk into the habitat to reveal its interior.
- Save/Load and20-second autosave use browser storage. New colony requires inline confirmation. No server-side save or co-op yet.
- Time×12 speeds the day/night and power simulation for testing; normal cycle is240seconds. Recipes and timings are provisional.

## Development

`npm test` in this folder runs simulation/controller tests with Node's built-in runner. Shared interfaces are in `CONTRACT.md`. Rendering is separate from JSON simulation state. `main.js` handles input and integration; `sim.js` handles construction/power/saves; `controller.js` handles movement/collision; `world.js` handles Three.js presentation; `ui.js` and `game.css` handle HUD.

Blender-authored models and the rigged astronaut are in `assets/`; the character uses Idle, Walk, Run, Jump, and Build clips with blended transitions. Model studio: http://127.0.0.1:8765/game/art-lab.html. Scripts live in `blender/`. Repeated structures have merged static geometry by material.

Current limits: fixed2×2 habitat, shared electrical grid, starter inventory only. No mining, factories, full room painting, food, quests, combat, multiplayer, launch or orbital-view gameplay yet. Those are subsequent implementation phases, described in the root planning documents.

Terrain: `terrain.js` owns deterministic basin height, craters, cave landmarks and boulders; `terrain-view.js` renders the surface. New construction rejects slopes over 0.2 gradient, foundation height differences over 0.38 m and intersecting large rocks. Movement blocks slopes above 0.65 and solid boulders. Cave mouths now lead to explorable procedural passages; alien behavior is not implemented yet. Legacy saves bypass new terrain placement validation to preserve colonies.

Caves: `caves.js` generates connected seeded networks and headlamp line of sight; `cave-view.js` renders discovered floors and walls with instancing; `cave-space.js` and `travel.js` preserve world position, facing and screen movement across entrance thresholds. The terrain shader fades the roof along the same camera view rather than switching scenes or zoom. `player.cave` and `exploredCaves` are optional, backward-compatible save fields. Run speed is always 6.5 m/s.
