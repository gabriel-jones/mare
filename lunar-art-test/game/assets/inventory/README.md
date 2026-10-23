# Lunar inventory icons

The 14 carried items in `ITEM_INFO`, rendered from original editable Blender meshes.
The game's hotbar uses the transparent 256px exports in `256/`.

The same meshes are also real game props in `items.glb`: all 14 carried items plus
matching regolith and ice clusters for the logistics loop. `models.json` records
triangle and material-part counts. Each item is centred in X/Z, rests at Y=0 after
glTF export, and has a longest dimension of one metre; the game sets context-specific sizes.
Dense bevels are simplified for gameplay, with a maximum of 2,000 triangles per item.

The shared library in `../../item-models.js` supplies instanced conveyor parts,
actual rover/hauler loads, galley meals, ripe potatoes, the lander's removable core,
collectible cave resources/relics, deployed flares, and orbital satellites. Cave
items retain discovery, collection and custom underground lighting behavior.
The isolated review page is `../../art-direction/inventory-models.html`.

Art direction: beveled lunar industrial equipment, ivory/graphite shells, blue silicon,
green circuit substrate, gold contacts, russet potatoes, and distinct mineral silhouettes.
Alien artifacts use the game's ember-orange palette; rare earth is violet and the Heart
of the Deep is a fractured crimson mineral. The potatoes were revised after the first
study to use long, full-volume shapes and shallow eyes rather than pale discs with dots.

- `*.png`: 512 × 512 transparent RGBA masters.
- `256/*.png`: downsampled 256 × 256 transparent RGBA game assets.
- `inventory-library.blend`: complete editable scenes, one per item, each with its camera and lights.
- `manifest.json`: item IDs and display names, matching the carried inventory definitions.
- `../../art-direction/inventory-icons.png`: all items with real-size 50px and 40px slot previews.

Rebuild with Blender's `--background --python` and `../../blender/build_inventory_icons.py`.
It shares the approved study's geometry and studio helpers in `build_inventory_study.py`.
Then run `../../blender/preview_inventory_icons.py` in a Python environment with Pillow
to verify definition coverage, alpha, framing, and regenerate the smaller exports and board.
Run `../../blender/export_inventory_models.py` in Blender after rebuilding the icon
library to refresh `items.glb` and `models.json`; it copies the saved source geometry
into a temporary scene and leaves the currently open Blender scene intact.
The build scripts use an absolute project path near the top; update it if relocating.

The Blender build restores the previously active scene after rendering. Studio lighting,
orthographic angle, color management and image format are shared across every icon.
No external assets, image generation or paid services are used.
