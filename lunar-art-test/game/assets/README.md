# Frontier asset library, revision 2

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
| Hopper | 624 | 4 |
| Work light | 220 | 4 |

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
