# Implementation plan

Phase A implemented: solo playable foundation — isometric WASD, seeded terrain, grid blueprints, material spending, manual construction, solar/battery lighting, enterable fixed-footprint habitat, save/load.

Acceptance: move and jump, place/rotate/cancel valid footprints, reject invalid/overlapping placements, hold E to construct in range, observe night lights and battery accounting, reload saved world. Keep art viewer intact.

Phase B implemented: mining and production — the starting mining rover, designated mining areas with finite regolith, hoppers, conveyor belts with designated machine ports, a regolith processor (metal, silicon, oxygen), storage crates the player collects from, and dismantling.

Acceptance: designate a mining area; the rover paths around structures, digs, depletes cells, returns to the nearest hopper, unloads and recharges; the hopper feeds a belt only from its output port; belts keep spacing, chain, queue when blocked and refuse belts pointing back; the processor accepts regolith only at its input port, stops without power and when its output is blocked; refined goods reach a crate and E collects them; saves round-trip mid-production and version 1 colonies migrate with a starter rover.

Local play: http://127.0.0.1:8765/game/. Controls: WASD, Space, 1–9 select tools (9 is Mining area), R rotates in four directions, click places, drag lays a straight belt line, Escape dismisses selection, E held builds within 5m and pressed beside a crate collects; Delete or Backspace cancels a pointed blueprint or dismantles a pointed structure for a full refund. Scroll zooms. Autosave every 20s and on page exit. Time×12 accelerates power/daylight/production, not movement.

Verification: 39 automated simulation/controller/production/export checks pass. Browser-verified: rover mining and docking, mining-area overlay and excavation marks, belt item flow, processor refining and night power outage, crate collection, drag belt placement and construction, dismantle refund, port arrows on placement previews. No multiplayer or full colony-load benchmarks yet.

Next: C richer rooms/food/life support; D crater mission and caves (including the damaged Starship processor story beat — Phase B's processor is buildable without it for now); E satellite launch/research; F co-op (command boundaries start in A, integration after B); G alien retaliation; H outposts/scale/Mars.

Current prototype day length, recipes, belt speeds, rover capacity and storage sizes are temporary tuning values. Realistic fuel carbon source remains unresolved. Orbital/launch gameplay arrives with E.
