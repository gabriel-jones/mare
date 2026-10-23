# Inventory icon study 01

Four review samples matching the game's graphic lunar industrial art direction.
These are proposed inventory images; the game's existing UI has not been switched over.

| Item ID | Image | Design |
| --- | --- | --- |
| `metal` | `metal.png` | Two tapered, beveled silver ingots |
| `crop` | `crop.png` | Two elongated russet potatoes with subtle shallow eyes |
| `chip` | `chip.png` | Green substrate, gold contacts, ivory carrier and dark blue package |
| `artifact` | `artifact.png` | Split mineral octahedron with an ember-orange core, matching cave relic colors |

All four are original Blender meshes rendered with a shared orthographic viewing direction
and three-light studio setup. Framing fits each mesh's projected silhouette consistently.
No image generation, external assets, texture downloads, or paid services were used.

- Masters: 512 × 512 RGBA PNGs with transparent backgrounds.
- Game-size exports: `256/`, 256 × 256 RGBA PNGs.
- Editable library: `inventory-study.blend`, with one complete scene per item.
- Review board: `../../art-direction/inventory-study.png`, with 50 px and 40 px slot previews.
- Models and rendering: `../../blender/build_inventory_study.py`.
- Review board and scaled exports: `../../blender/preview_inventory_study.py` (Pillow required).

To rebuild, run Blender in the background with `--python` pointing at the build script,
then run the preview script with a Python environment containing Pillow. The Blender script
uses an absolute project root near its beginning; update it if relocating the project.
