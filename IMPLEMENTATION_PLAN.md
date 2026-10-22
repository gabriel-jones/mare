# Implementation plan

Phase A implemented: solo playable foundation — isometric WASD, seeded terrain, grid blueprints, material spending, manual construction, solar/battery lighting, enterable fixed-footprint habitat, save/load.

Acceptance: move and jump, place/rotate/cancel valid footprints, reject invalid/overlapping placements, hold E to construct in range, observe night lights and battery accounting, reload saved world. Keep art viewer intact.

Local play: http://127.0.0.1:8765/game/. Controls: WASD, Space,1–5 select structure, R rotate, click place, Escape dismiss selection, E hold to build within5m; Delete cancels/refunds a pointed unfinished blueprint. Scroll zooms. Save/Load are browser-local; autosave every20s. Time×12 accelerates power/daylight, not movement.

Verification:12 pure simulation/controller tests pass. Browser placement/resource spending, proximity construction, objective progress, battery capacity, power generation/demand, night readability, habitat roof hiding, and save/reload verified. No multiplayer or full colony-load benchmarks yet.

Next: B mining/production; C richer rooms/food/life support; D crater mission and caves; E satellite launch/research; F co-op (command boundaries start in A, integration after B); G alien retaliation; H outposts/scale/Mars.

Current prototype day length and recipes are temporary tuning values. Realistic fuel carbon source remains unresolved. Phase A excludes orbital/launch gameplay to keep first integration bounded; that arrives with E.
