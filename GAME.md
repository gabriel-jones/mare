# Lunar colony game — living design

Last updated: 2026-10-21

This document preserves the planning decisions from the project chat. Confirmed decisions are distinguished from proposed details and open questions. Update it as the design evolves. Working title only; no final game name yet.

## Premise and pillars

A solo or two-player 3D colony automation adventure, starting on the Moon. The human player lands aboard one SpaceX Starship with initial resources and one mining robot. Build an attractive industrial base, automate lunar material processing, explore dangerous places, manufacture AI research satellites, and eventually prepare a Starship to reach Mars and establish another base.

Inspirations: Factorio's production and automation, and RimWorld's grid construction and interiors. Human colonist management is not part of the current design: the only humans are the one or two player characters. Autonomous robots provide the workforce.

The intended experience combines:

- Designing production lines and replacing repetitive manual work with automation.
- Creative construction of a good-looking lunar base.
- Procedural discovery and combat with more substantial expeditions than simple resource scouting.
- A gradual tonal shift from an apparently empty Moon to horror during expeditions.
- Meaningful industrial milestones, especially launching the first AI satellite.

## Platform, camera, and art direction

- 3D browser game using Three.js, with models authored in Blender.
- Overhead isometric camera, WASD player movement, mouse construction.
- Movement is influenced by local gravity; exact mechanics are undecided.
- Selected art direction: graphic lunar frontier, based on concept image 3 in the chat.
- Low-poly forms should look deliberate and polished: strong silhouettes, selective bevels, restrained surface detail, and a mix of smooth manufactured curves and faceted terrain.
- Current art study explores an orange suit, ivory machinery, graphite mechanisms, a dark reflective visor, gray lunar terrain, and amber/cyan instrument accents.
- Final shader direction is undecided. The local preview compares standard PBR and stepped graphic lighting.

## Multiplayer and player roles

- Solo or two-player cooperative play.
- One shared colony, shared research and mission progress, separate player inventories.
- Either player can build or explore.
- The host can continue while their partner is away.
- No progression task should require both players to be present.
- Robots operate autonomously, choosing available jobs according to player-set priorities rather than requiring individual job assignments. Planned roles include mining, construction, and combat, with humanoid workers and drones among the desired robot types.
- Player actions include walking, building, repairing, and fighting.
- Players do not manually mine, but **can carry materials** in inventory and supply early construction themselves. This supersedes the earlier no-material-hauling decision. Later automated construction uses nearby network-connected storage and robot deliveries.
- The starting mining robot collects resources; it cannot build. The player must construct the first buildings and machines manually. Construction-capable robots are a later unlock.
- A gun and construction tool are separate equipment items.
- Robots should eventually be able to perform both construction/repair work and combat. Exact roles, unlocks, and controls remain to be defined.

## Arrival and first approximately 20 minutes

Confirmed opening direction:

1. Arrive on the Moon aboard a Starship, with starting supplies, food, and one mining robot. The landing site includes a rocket pad.
2. Set up the first mining robot, solar panels, and habitat. Teach the fundamental controls through hands-on construction and repair.
3. Once comfortable with those mechanics, receive a shipboard AI mission to investigate a nearby crater.
4. The Starship's regolith processor was damaged during landing. An old robotic lander in the crater has a compatible component.
5. Recover the component and repair the processor, enabling the first regolith processing line.
6. Establish basic production and introduce a growing bed in the first habitat through an early objective.

The first expedition is required. Its horror is unsettling evidence and a glimpse of movement, rather than a required fight.

Early manual work should teach a process and then be automated, rather than requiring the player to repeat it indefinitely. The mining robot takes over regolith collection; later robots take over construction and other routine work.

Proposed, not yet finalized:

- The supplied mining robot arrives folded or partly assembled, so deployment teaches construction without requiring a complete robot manufacturing chain first.
- A fallback should prevent loss of the mission component from permanently blocking progression. Its implementation is undecided.
- Exact objective order, timings, starting resource quantities, and recipes remain open.

## Terrain, exploration, and underground spaces

Approved terrain direction (2026-10-21): a rugged lunar crater basin with a broad, fairly level starter construction floor. Steep surrounding cliffs contain cave entrances that will become alien origins. Buildings cannot be placed on steep slopes, uneven foundations, or large rocks. Small dust and stones remain decorative. Underground expeditions and alien spawning are a later milestone.

Implemented terrain pass: deterministic height field shared by rendering, movement and placement; smooth regolith with fine procedural grain; shallow impact bowls; irregular rocky rim and three recessed cave-mouth landmarks. Player follows surface elevation, cliffs and boulders block walking, the construction grid follows the surface, and selection raycasts the actual ground. Existing saves remain loadable; new terrain checks apply to new blueprints. Starter movement is 4.3 m/s walking and 6.5 m/s running.


- Procedurally generated terrain with rocks, craters, hills, exploration, and fog of war.
- Procedural worlds need enough detail and variation to feel unique across runs.
- Exploration combines combat and discovery: caves, old satellites or other wreckage, salvage, alien sites, loot, and special artifacts are desired possibilities.
- A few early expedition discoveries unlock capabilities. Expeditions should not remain a mandatory gate at every production tier.
- Later expeditions should remain worthwhile for special artifacts and other interesting rewards.
- Alien encounters alone, without attacking or disturbing something, should not trigger raids.
- Players should be incentivized, and sometimes gated, to take artifacts or something valuable from alien sites. The scope and frequency of those gates are undecided.

Accepted underground presentation:

- Cave mouths lead to distinct underground maps.
- Walls that obscure the player fade out.
- Headlamps reveal a directional area; space beyond the light remains dark.

Not separately resolved: whether caves permanently preserve all changes, and whether players can install lights, cables, or defenses underground.

## Alien atmosphere and combat

- The Moon initially appears empty; evidence of another presence emerges gradually.
- Expeditions can become horror experiences: dark caves, a headlamp as the main light source, and shadowy movement at the edge of vision.
- Creatures should feel intelligent, sneaky, organic, and melee-oriented, rather than technological.
- Detailed creature design and behavior will be developed in a separate iteration.
- The player uses a separate gun for combat.
- Weapon types, ammunition, aiming, combat pacing, and damage systems are open.

## Construction and interiors

- Square-grid placement. Buildings and objects occupy a defined number of squares.
- Single-story construction.
- Players paint connected habitat squares to define a building footprint. For example, selecting four adjacent squares creates a building in that shape.
- The game automatically creates floors, exterior walls, and roof around the footprint.
- Adding adjacent compatible squares expands the building.
- The roof hides when a player enters, allowing interior furnishing and interaction.
- Greenhouse blocks follow the same footprint-based construction approach.
- Airlock blocks connect to the larger building shape.
- Players can enter habitats, greenhouses, and airlocks and place appropriate interior objects.
- Greenhouse growing requires enclosed, pressurized, powered rooms.
- Factories operate outdoors.
- Construction starts with blueprints requiring materials and work. Players perform construction early; robots automate it later.
- Players carry materials and build the first blueprints themselves. Later, robots physically deliver construction materials from eligible storage to blueprints; materials do not transfer instantly. The starting mining robot cannot build, and a starting delivery-capable robot is not required. Whether it has any hauling role beyond mined-resource collection remains undecided.

Automated construction material access is limited to nearby network-connected storage, rather than every storage container in the colony. Manual construction can use player-carried materials. A central hub supplies coverage within a radius; relay buildings expand coverage, and overlapping coverage connects storage into one network. Open construction rules include footprint limits, minimum room size, habitat/greenhouse connections, airlock operation, build range, delivery scheduling, expansion while occupied, and pressure after damage.

## Production and logistics

Intended initial chain:

`Mining robots -> regolith -> conveyor belts -> refinery/furnace -> usable resources -> manufacturing -> satellite components -> AI satellites -> launch -> research`

Desired capabilities and products:

- Mining robots that collect regolith.
- Conveyor belts transporting regolith and other items.
- Belts connect directly to designated machine input/output ports. Separate inserter arms are not required.
- Refineries/furnaces converting regolith into useful resource types.
- Manufacturing of satellite frames, solar panels, antennas, propulsion/engines, semiconductors/chips, and Starlink-style AI satellites.
- Rocket pads supporting Starship launches, including the initial landing pad.
- Additional robots and drones to support the growing factory.
- Remote mining outposts require their own power, storage hub, and robot support. Cargo drones transport resources between outposts and the main base. Range, cargo capacity, routes, and unlock timing remain open.

Scientific fidelity should be semi-realistic, with meaningful industrial steps but without simulating every detail. Initial regolith-processing outputs are **metals, silicon, and oxygen**, with more specialized materials unlocked later. Exact recipes, machine roles, inventories, throughput, power requirements, and byproducts have not been selected. These categories are gameplay abstractions; a detailed extraction chemistry model is not required.

No Earth shipments or resupply system for the current scope.

Satellite components are combined in a satellite assembly building. Robots transport completed satellites to the launch pad. Starship can carry multiple satellites per launch; payload capacity and loading rules remain open.

Starship fueling should be a substantial production chain. The accepted direction is discovering ice deposits, extracting water, and processing propellant through simplified recipes. The carbon source for methane and exact fuel chemistry/abstractions remain unresolved; water alone is not a complete methane feedstock.

## Power, food, and life support

- Solar panels are part of the opening setup.
- Lunar nights create a meaningful power-storage requirement, with batteries supplying the base when solar generation is unavailable. In-game day/night durations and starting reserves are undecided.
- Robots use rechargeable batteries and autonomously return to charging stations. Exact charge thresholds, charger capacity, and behavior if stranded are undecided.
- Food is required, with enough starting food to avoid an immediate emergency.
- Players consume food/meals from inventory.
- Hunger reduces player capability, such as movement and construction efficiency, but does not kill the player. Exact penalties and thresholds remain open.
- A growing bed in the first habitat is a desired early objective.
- Growing beds require water, oxygen, and electricity. A separate cooking appliance turns crops into meals; direct consumption of raw crops has not been decided.
- Additional seeds unlock through the tech tree.
- Players should not have to manage personal oxygen.
- The base needs oxygen/pressure for plants, and growing rooms need power.
- Player power needs, robot battery capacities, battery storage capacities, the magnitude of hunger penalties, water/oxygen production, crop recipes, and cooking recipes are still open design questions.

## Inventory, defeat, and recovery

- Fixed inventory slot count.
- Tools, weapons, food, salvage, and other carried equipment compete for the same inventory space; no separate tool-only capacity is currently planned.
- Player inventory also holds carried construction materials, competing with tools, food, weapons, and salvage under the fixed-slot system. Belts and robots eventually handle routine bulk logistics.
- A downed player can be revived by their teammate for a limited time. Approximately one minute was suggested; the exact duration is not finalized.
- If not revived, the player returns to the habitat and leaves their belongings in a recoverable backpack at the defeat location.
- Tools stay with the player so that recovery remains possible. Exact treatment of the gun, ammunition, and other equipped items needs clarification.
- Solo defeat uses the habitat recovery path; no teammate is required.
- Fallback behavior when no habitat or viable respawn point remains is undecided.

## Raids and retaliation

- Raids are retaliation for disturbing alien sites, rather than unavoidable consequences of simply encountering an alien.
- Taking artifacts or other valuable alien material should create temptation and consequential choices.
- Raids cannot be disabled in the intended game design.
- An antenna provides a warning period. Exact detection coverage and warning duration are open.
- Aliens can break everything, including machines, power infrastructure, and habitats.
- They may target players, food production, power, and recovered alien objects.
- Poor defenses can cause a major setback.
- Early attacks should be forgiving enough that the game does not become excessively brutal before players learn defenses.
- Exact triggers, escalation, targeting, repair costs, and recovery safeguards remain open.

## Missions, research, and progression

- Shipboard AI gives missions through a stream of generated objectives.
- The first crater expedition is a required progression mission.
- AI satellites generate research that contributes to tech-tree progress.
- Each deployed AI satellite adds research points per minute. Players select a technology to research, and later satellite generations provide more computing power. Exact rates, costs, and research queue rules remain open.
- The ship starts with the technology needed to build the first AI satellite. Satellite research unlocks technology beyond that starting set. The required crater mission still gates repair of the first processor; starting knowledge does not supply a working production chain.
- Launching the first working AI satellite is a major achievement.
- The first satellite is launched aboard the starting Starship, rather than a separately manufactured small rocket. For now the player manually initiates launch; it is not automatically dispatched when ready. Whether the player must board/pilot it, satellite deployment, and the ship's return remain to be designed.
- Launch is initiated at the pad terminal; the player does not pilot the flight. An orbital view shows Starships in orbit, and the player commands their return to base pads. This resolves the earlier open launch/return questions above.
- Starship carries starting water, and players can build water tanks.
- Day/night is a regular planning cycle supported by batteries. Night should be visually attractive, with base and object lights. Exact cycle length is not finalized.
- The mining rover roams a designated area, collects finite regolith, and unloads at a hopper. Areas deplete.
- Construction robots unlock after the first satellite as an early major research reward.
- Further milestones include surviving alien retaliation and preparing a Starship to travel to Mars and found the next base.
- Later planets are intended, but the Moon is the initial focus.

Proposed mission implementation, not yet confirmed:

- Authored mission types with procedural locations, parameters, and rewards.
- Objectives react to the colony's actual bottlenecks, discoveries, and needs, rather than issuing arbitrary construction chores.

Research questions still open:

- What is the exact starting technology set needed for the first satellite production chain?
- How are satellites assembled, loaded, launched, and deployed?
- What resources fuel the starting Starship's satellite launches, and does the ship autonomously return to its pad afterward?
- What are satellite research rates and generational upgrades, and will specialized research types exist beyond the initial generic points-per-minute system?
- How do satellite power, reliability, orbital conditions, and maintenance affect research, if at all?
- What technology costs and research queue rules apply to the selected-technology system?
- Which early technologies need expeditions, and which artifacts remain optional bonuses?

## Current prototype and performance direction

The current art study is in `lunar-art-test/`:

- `lunar-art-test.blend`: editable Blender scene with astronaut, drill, crater, terrain, and rocks.
- `lunar-art-test.glb`: combined scene export.
- `astronaut.glb` and `regolith-miner.glb`: individual model exports.
- `index.html` and `viewer.js`: local Three.js preview with PBR/Graphic comparison, camera presets, sunlight adjustment, and drill animation.
- `build_scene.py` and `export_assets.py`: Blender creation/export scripts.
- `README.md`: setup and art-test notes.

Measured exports:

| Asset | Triangles | Mesh nodes | Material primitives |
| --- | ---: | ---: | ---: |
| Astronaut | 6,320 | 42 | 42 |
| Regolith miner | 4,692 | 39 | 39 |
| Entire art test | 13,232 | 121 | 127 |

These are editable art-test assets, not an optimized colony renderer. The astronaut is unrigged. The separate mesh parts and rendering submissions need attention before multiplying machines across a large colony.

Proposed performance work, not yet implemented or validated:

- Merge static machine parts while leaving moving parts independent.
- Instance repeated machines, rocks, and other compatible assets.
- Provide simpler models at colony viewing distances.
- Benchmark 100, 500, and 1,000 machines, separating geometry, animation, and shadow costs.
- Reserve CPU time for simulation and pathfinding; choose budgets from measured target-hardware performance.

Provisional triangle targets discussed, not guarantees:

| Asset | Close view | Colony distance |
| --- | ---: | ---: |
| Player astronaut | 4,000–6,000 | 800–1,500 |
| Repeated worker robot | 1,000–2,000 | 200–500 |
| Small machine | 1,000–2,000 | 200–600 |

## Next planning round

Prioritize resolving the production and satellite loop before expanding the asset list:

1. Recipes connecting the confirmed initial outputs (metals, silicon, oxygen) to the first satellite.
2. Manual construction inventory costs, hub/relay ranges, network delivery scheduling, and construction-robot unlock timing.
3. Robot job priority categories, charging capacities, and task failure handling.
4. Water/oxygen supply, crop and cooking recipes, and the magnitude of nonlethal hunger penalties.
5. First-satellite assembly, Starship fueling/launch/return, and research payoff; starting technology already covers satellite construction.
6. Artifact rewards, retaliation triggers, and early recovery limits.
7. Target colony scale, target devices, and multiplayer hosting/saving behavior.

The user authorized implementation of Phase A after reviewing the implementation/agent plan. Continue design iteration alongside playable milestones; unresolved proposals remain unconfirmed.

## Playable foundation — Phase A

Local entry point: `lunar-art-test/game/index.html`, served at `/game/` by the existing local art-test server. The original art viewer remains at `/`.

Implemented: solo isometric movement and lunar-gravity jump, solid machinery collision, seeded terrain presentation, grid footprints, resource spending, blueprints, proximity construction, refunds for unfinished blueprints, solar power, batteries, night lighting, fixed-footprint enterable habitat with automatic roof hiding, opening construction checklist, local browser save/load and autosave.

Prototype tuning: four-minute day/night cycle, optional12× time, 180kJ battery, shared global electrical grid. Starting materials are in the player inventory. Mining, material transfer/storage networks, shape-painted rooms, life support, food, expeditions, combat, orbital view, satellite launches/research, and multiplayer are not implemented yet. The Starship is a visual landing-site landmark in this phase.

Separate modules own simulation, controller movement, world presentation, UI, and integration. Current simulation/control checks cover footprint validity, costs/refunds, proximity and construction safety, energy accounting, save validation, and collisions. Production-scale rendering budgets remain unvalidated.

### Visual and movement revision

User feedback: the unrigged character slid around and movement felt janky. The current game now uses a Blender-authored15-bone astronaut with Idle/Walk/Run/Jump/Build clips, an animated construction tool, and cross-faded states. Controller movement has brisk acceleration/deceleration, Shift running, smooth wrapped turns, and render interpolation between fixed simulation ticks. Construction faces the target blueprint.

The current Starship, launchpad, solar array, battery bank, hopper, habitat, and work light are Blender assets, replacing the original procedural model placeholders. Static parts merge by material, and habitat roof hiding remains supported. Authoring scripts and Blender sources are included in `lunar-art-test/game/blender/` and `assets/` respectively. `/game/art-lab.html` is an isolated model/animation inspection tool and does not change colony saves.

Style benchmark: graphic lunar industrialism—practical silhouettes, restrained bevel detail, ivory protective shells, graphite joints, burnt-orange markings, dark PV/glass, and warm base illumination. Animation is a first authored pass, without terrain foot IK or combat clips yet.16 automated simulation/controller/export checks pass; large-colony performance remains to be measured.

### HUD revision — 2026-10-21

The player stays centered in the camera, including terrain elevation. Default HUD contains only top-left resource/power counts and a bottom-left Build button. Build opens a compact vertical list of icons and building titles; selecting an item closes it and shows only the selected title plus rotate/cancel controls. Removed the brand/title, mission card, manual save/load/reset buttons, time/day/location indicators, recipe costs, hotkey badges and persistent instructions. Browser autosave remains active, including on page exit.

### Building status overlays — 2026-10-21

Compact world-anchored indicators show battery percentage with a charge bar, construction progress for blueprints, "No power" above active consumers during network outages, and "No sunlight" above solar arrays at night. Idle daytime lamps and passive hoppers do not produce false outage alerts. Close labels stack with leaders; off-screen labels are hidden. Storage is currently pooled across the power network, so battery indicators display the shared storage percentage rather than independent simulated charges.

### Crater, caves and movement revision — 2026-10-21

Movement now always uses 6.5 m/s running speed; Shift is no longer required. The basin radius is roughly 78 m (seed varies the rim), with a broad starter floor and a continuous 25–33 m cliff wall. Expanded surface travel and construction bounds; new terrain still rejects cliffs, boulders and uneven foundations. A radial mesh concentrates about 9,600 ground triangles on the rim instead of densely subdividing the entire world.

Three seeded cave networks now contain connected rooms, branching passages and loops. Cave collision and headlamp line of sight share a deterministic tile map. Visibility is limited by facing, distance and solid rock; explored cells persist in browser saves. Construction is unavailable underground. Creatures, combat, loot and sound design remain future work.

The initial separate cave view was rejected. Caves now render beneath their actual surface entrances, with the same isometric camera, zoom and character follow. Portal crossings preserve world position and facing. Roofs fade along the camera view over nearby explored passages, and near-facing cave walls cut down to keep the player visible. Outside terrain remains visible. No full-screen view switch or forced cave zoom.

Chosen art direction: painterly lunar frontier. The first material pass uses smooth terrain normals, broad warm/cool pigment-like variation, cool basalt walls, pale dust and restrained rock strata. This supersedes the explicitly faceted low-poly terrain direction. Further art refinement should preserve clear silhouettes and bounded geometry costs.

Cave entrance collision fix (2026-10-21): added a level, boulder-free approach joining each cave threshold to the basin floor. This repairs saves stranded on the steep surface immediately outside an exit. Regression coverage now walks through and back out of all three entrances across three seeds and multiple lateral offsets, and reproduces the reported trapped position. All 26 tests pass.
