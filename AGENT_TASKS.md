# Agent coordination

Shared contract: `lunar-art-test/game/CONTRACT.md`.

- Orchestrator: contracts, main.js/index.html, movement, persistence integration, QA.
- Simulation agent: sim.js, simulation tests.
- World agent: world.js, terrain, models, lighting, placement visualization.
- UI agent: ui.js, game.css, HUD/build palette.

Agents own disjoint files. Changes to contracts must be communicated before integration. Work is local; no deployment or multiplayer claims in Phase A.

Phase A integrated. Simulation agent delivered12 passing checks and reviewed integration, catching construction self-trapping; fixed by rejecting machine construction while overlapping footprint. World agent delivered presentation and night-readability refinements. UI agent delivered HUD, construction palette, checklist and storage controls. Orchestrator integrated input/persistence and verified browser interactions. Further rounds should use fresh bounded assignments.

Visual revision integrated: locomotion agent owned controller/main integration and tests. Industrial-assets agent authored a bounded Blender script without touching the live scene. Orchestrator owned live Blender execution, character rigging/animation, export corrections, model integration, studio, and visual QA.16 checks pass including GLB skin, animation, export-isolation and geometry-budget checks.

Phase B (mining/production) implemented in a single Cursor agent session after handoff from Codex. New modules: `defs.js` (definitions, footprints, rotated ports), `production.js` (rover, belts, machines), `paths.js` (rover A*), `production-view.js` (rover, belt items, mining overlay), `production.test.mjs`. Blender kit: `blender/build_production.py`, built in a temporary scene so the open Blender file is left untouched.
