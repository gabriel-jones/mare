# Frontier asset library, revision 2

Inventory icons: `inventory/256/` contains the 14 transparent Blender-rendered carried-item
images used by the hotbar. Masters, an editable `inventory-library.blend`, and a manifest
live in `inventory/`; the complete review board is `../art-direction/inventory-icons.png`.
Rebuild with `../blender/build_inventory_icons.py` and `../blender/preview_inventory_icons.py`.
The same source meshes are exported to `inventory/items.glb` by
`../blender/export_inventory_models.py`. All 14 carried items and the two bulk belt
resources share normalized ground origins; `../item-models.js` provides shared
templates and material-part instancing for belts, cargo and world pickups.

Authored in Blender, exported as self-contained GLB assets. Blender sources and reproducible scripts are included; no external textures or generated meshes are required.

Art direction: graphic lunar industrialism. Strong functional silhouettes, selective beveled edges, warm ivory shells, graphite mechanisms, oxide-orange service accents, dark blue photovoltaics/glazing, and restrained warm illumination. Smooth pressure equipment contrasts with angular protection and terrain.

| Asset | Triangles | Material primitives |
| --- | ---: | ---: |
| Astronaut including hidden construction tool | 5,416 | 11 |
| Starship | 2,736 | 4 |
| Launchpad | 900 | 7 |
| Habitat | 1,584 | 10 |
| Solar array | 684 | 5 |
| Battery | 880 | 5 |
| Hopper (revised for Phase B output collar) | 756 | 4 |
| Mining rover | 1,638 | 15 |
| Regolith processor | 2,396 | 5 |
| Conveyor belt | 378 | 4 |
| Storage crate | 572 | 5 |
| Conveyor corner | 418 | 4 |
| Modular habitat kit (15 pieces) | 1,108 | — |
| Grow bed (with Plants node) | 304 | 6 |
| Galley (with MealTray node) | 308 | 8 |
| Water recycler | 424 | 6 |

The astronaut has one skin,15 bones, and five animation clips: Idle, Walk, Run, Jump, Build. Blender may append a numeric suffix to action names when preserving earlier scenes; runtime resolves the base clip name. Static geometry merges by material; habitat Roof remains independently hideable. The construction tool is hidden outside the Build state.

World convention: authored Z-up in Blender, exported Y-up in glTF; front -Y becomes game +Z. Ground-level origin is centered on each asset. Footprints match the existing two-metre grid. Starship is a deliberately compressed gameplay representation, not an engineering-scale vehicle.

Sources:
- `astronaut-v2.blend`: current rig/character scene, authored clips, studio camera.
- `industrial-library.blend`: industrial asset display scene and materials.
- `../blender/build_player.py`: suit modeling, binding, animation, export and portrait render.
- `../blender/build_industrial.py`: model library construction and export.

Preview `/game/art-lab.html` to inspect models and animation clips in Three.js. `/game/` integrates them into the colony, with acceleration/deceleration, wrapped facing interpolation, fixed-step render interpolation, Shift running, and cross-faded animation states.

These remain a first playable art pass. There is no terrain-adaptive foot IK, character combat animation, facial animation, production LOD set, or populated-colony performance certification yet. All animations are in place; the controller owns translation and jump height.

Lunar plains kit: `rock-a.glb` (398 triangles), `rock-b.glb` (408), `rock-c.glb` (368), `cave-mouth.glb` (1,352, separate ArchRoof). Vertex-painted, beveled Blender meshes authored against `../art-direction/lunar-voxel-plains-concept.png`. Source: `lunar-plains-kit.blend` with the reference image packed; authoring script: `../blender/build_lunar_plains.py`. The runtime normalizes rock geometry to match deterministic collision radii and instances the variants.

Production kit (Phase B): `rover.glb`, `processor.glb`, `conveyor.glb`, `storage.glb` and the revised `hopper.glb`. The rover keeps separate named nodes (`Wheel_LF/RF/LB/RB`, `Drill`, `Cargo`) that the runtime spins, digs and fills; everything else merges by material. Source: `production-library.blend` (preview `production-library.png`); script: `../blender/build_production.py`, which builds in a temporary scene and removes it so an open Blender file is left untouched.

Modular habitat kit (`habitat-kit.glb`): Floor, Wall, Window, Airlock, AirlockDoor, Corner, Roof, RoofEdge, RoofCorner, RoofModule, Cabinet, and for Phase C GlassWall, GlassRoof, GlassRoofEdge (greenhouse) and AirlockFloor, each a named node authored at the origin on the two-metre grid. Walls are one-metre segments centred on grid lines with the exterior facing game +Z; floor, roof and roof-edge tiles have no side bevels so neighbouring modules meet without seams. The runtime places pieces per joined room and merges them by material; the two airlock door leaves stay separate and slide open as the player approaches. `conveyor-corner.glb` is the quarter-turn belt (enters from +X, leaves toward +Z; mirrored at runtime for left turns). Source: `modular-library.blend` (preview `modular-library.png`); script `../blender/build_modular.py`, which builds in a temporary scene and leaves the open file untouched. Blender may suffix a piece name that collides with an object in the open file (`Roof.002`); the runtime matches base names. The single-module `habitat.glb` remains for the art lab. Greenhouse glass uses the material "Lunar • greenhouse glazing", which the runtime renders translucent by name.

Expedition kit (Phase D): `lander.glb` (748 triangles), the tilted derelict robotic lander with gold foil, gouged and pried-open panels and a broken dish, whose `Core` node the runtime hides once salvaged; and `melter.glb` (1,000 triangles), the 1×2 ice melter facing game +Z, whose `Heater` node glows while melting. Source: `expedition-library.blend` (preview `expedition-library.png`); script: `../blender/build_expedition.py`, which builds in a temporary scene and removes it.

Room fittings (`growbed.glb`, `galley.glb`, `recycler.glb`) fill one grid square, stand on the floor deck at the origin and face game +Z. The grow bed's `Plants` node scales with growth; the galley's `MealTray` node shows when a meal is ready. Built by the same `../blender/build_modular.py`.

Status parts: `blender/status_parts.py` (exec'd by each build script) adds the `Lamp` bulb, battery `Cell1`–`Cell5` and `Level` gauges as separate nodes so the game can drive them. `build_industrial.py` builds in a temporary scene and leaves the open Blender file alone; set `ONLY` to export a subset.
