# Playable foundation

Serve the parent `lunar-art-test/` directory: `python3 -m http.server 8765 --bind 127.0.0.1`, then open http://127.0.0.1:8765/game/.

Dependencies are installed in the parent directory (`npm install` there). Original art study remains at `/`.

## Play

- WASD: screen-relative movement with brisk acceleration and stopping. Shift: run. Space: lunar-gravity jump. Scroll: zoom.
- Click a build card or press its letter (shown in the Build menu; press again to deselect). Number keys 1–9 and 0 select inventory slots; F eats. R rotates the footprint in four directions; ground arrows show machine ports (cyan in, amber out). Click ground to place. With the conveyor, drag a route: it follows the pointer around corners, backtracking trims it, and dragging over existing belts turns them to match (click one belt to point it the current way). Escape dismisses placement.
- Walk within5m and hold E to construct. Blueprints turn red while you stand where the finished structure would trap you. Belts are walkable.
- To take things down, choose Build → Tools → Dismantle (Z). Click a structure or blueprint, or drag across several, for a full refund. Fittings come off before the floor beneath them. The red highlight shows what will go; if something can't be removed yet, the reason is shown instead. Pressing Delete or Backspace while pointing at a structure also works.
- Production: build a hopper, then set a Mining area. The rover mines, unloads at the nearest hopper and recharges. Belt the hopper's output into a processor's input, and its output into a storage crate. Press E beside a crate to collect metal and silicon. Oxygen goes to the colony reserve.
- Rooms: drag to paint habitat (H) or greenhouse (G) squares; touching squares join into one building with solid walls. Add an airlock (Q) against the room, arrow facing out; it is the only way in. Inside, the whole building's roof lifts away. Rooms fill from the oxygen reserve and need power to stay pressurised.
- Food: put grow beds (T) in a greenhouse, then press E on a ripe bed to harvest potatoes. Load two into a galley (K) in a habitat with E, and take the meal with E. A water recycler (Y) tops up water. Eat with F when the Food meter runs low; hunger slows you but never kills.
- `?sandbox=1` plays a throwaway colony saved separately from your real one.
- Save/Load and 20-second autosave use browser storage. New colony requires inline confirmation. No server-side save or co-op yet.
- Time×12 speeds the day/night and power simulation for testing; normal cycle is240seconds. Recipes and timings are provisional.

## Development

`npm test` in this folder runs simulation/controller tests with Node's built-in runner. Shared interfaces are in `CONTRACT.md`. Rendering is separate from JSON simulation state. `main.js` handles input and integration; `sim.js` handles construction/power/saves; `controller.js` handles movement/collision; `world.js` handles Three.js presentation; `ui.js` and `game.css` handle HUD.

Blender-authored models and the rigged astronaut are in `assets/`; the character uses Idle, Walk, Run, Jump, and Build clips with blended transitions. Model studio: http://127.0.0.1:8765/game/art-lab.html. Scripts live in `blender/`. Repeated structures have merged static geometry by material.

Production: `defs.js` holds structure definitions, footprints and rotated ports; `production.js` steps the rover, belts, hoppers, processors and crates; `paths.js` is the rover's grid A*; `production-view.js` renders the rover, instanced belt items and the mining overlay. `production.test.mjs` covers the full loop. Production models are built by `blender/build_production.py`.

Rooms: `habitat.js` derives joined rooms, one-metre wall segments, airlocks, wall collision and the "would this shut the player in" check from painted room squares (shared by controller, simulation and rendering); `habitat-view.js` assembles each room from the Blender kit (`blender/build_modular.py`), merges it by material and draws each unfinished square on its own. Lamps and room ceilings share a fixed pool of six point lights, so placing them never recompiles shaders. Review page: `/game/art-direction/habitat-preview.html` (`?inside=1`, `?night=1`). `habitat.test.mjs` covers rooms, airlocks, fittings and collision.

Life support: `life.js` steps pressurisation, grow beds, the galley, the recycler and hunger, and handles eating and E interactions; `inventory.js` is the ten-slot carried inventory. Grow bed, galley and recycler models are built by the same Blender script; their `Plants` and `MealTray` nodes are animated at runtime. `life.test.mjs` covers the loop and the version 2 save migration.

Current limits: shared electrical grid, one mining rover, a single regolith recipe, water only from the starting reserve and recyclers. No quests, combat, multiplayer, launch or orbital-view gameplay yet. Those are subsequent implementation phases, described in the root planning documents.

Terrain: `terrain.js` owns deterministic basin height, craters, cave landmarks and boulders; `terrain-view.js` renders the surface. New construction rejects slopes over 0.2 gradient, foundation height differences over 0.38 m and intersecting large rocks. Movement blocks slopes above 0.65 and solid boulders. Cave mouths now lead to explorable procedural passages; alien behavior is not implemented yet. Legacy saves bypass new terrain placement validation to preserve colonies.

Caves: `caves.js` generates connected seeded networks and headlamp line of sight; `cave-view.js` renders discovered floors and walls with instancing; `cave-space.js` and `travel.js` preserve world position, facing and screen movement across entrance thresholds. The terrain shader fades the roof along the same camera view rather than switching scenes or zoom. `player.cave` and `exploredCaves` are optional, backward-compatible save fields. Run speed is always 6.5 m/s.

Current terrain direction: open, low-poly / voxel-inspired lunar plains. Four-metre shelves, beveled terrace boundaries, local impact craters and separate cave-bearing hills replace the enclosed crater. Concept references and exact generation prompts are in `art-direction/`. Blender source is `assets/lunar-plains-kit.blend`; authored rock variants are instanced in `terrain-view.js`. Terrain collision and entrance regression coverage remain in `sim.test.mjs`.
