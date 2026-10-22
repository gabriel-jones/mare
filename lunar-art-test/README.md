# Lunar frontier — art test 01

Open `lunar-art-test.blend` for the editable models and lighting. The original Blender scene is retained separately. `build_scene.py` recreates the first pass in a new scene.

## Local Three.js preview

From this folder run `npm install`, then `python3 -m http.server 8765 --bind 127.0.0.1`. Open http://127.0.0.1:8765. The viewer uses the local pinned Three.js dependency, with no CDN requirement.

Compare Soft PBR and Graphic, change sun angle, orbit, zoom, and inspect the spinning auger. Graphic uses five-step toon lighting on matte surfaces, preserving PBR reflections on the visor and titanium. This comparison shader lives in the viewer; it is not baked into the GLB.

## Art rules

- Smooth low-resolution helmet and visor against angular pressure gear.
- Broad bevels for readable industrial edge highlights; small details clustered around functional parts.
- Orange belongs to the player and service accents. Ivory indicates protective shells; graphite indicates mechanisms and seals.
- Rough terrain and suit, satin ceramic, reflective visor and titanium. No texture maps required.
- Large terrain facets and three shared rock meshes, with a sculpted shallow crater.
- Art-test lighting deliberately fills shadows for gameplay readability. The preview's studio reflection is an art-direction aid, not a literal lunar environment.

## Files and limitations

- `lunar-art-test.blend`: editable study, dedicated scene, camera and lighting.
- `lunar-art-test.glb`: applied bevels, named hierarchy, shared materials and meshes, drill animation.
- `astronaut.glb` and `regolith-miner.glb`: individual models centered at ground-level origin for reuse. Run `export_assets.py` in the art-test scene to refresh exports and the render.
- `lunar-art-test.png`: Blender beauty render.
- Astronaut is an unrigged style model. Drill animation is a visual demonstration, not gameplay.
- Separate panels remain editable; these meshes and draw calls have not been merged or optimized for a populated factory. Test on target hardware before setting production budgets.
- Blender and Three.js lighting are intentionally comparable, not pixel-identical.

Suggested next iteration: decide on the helmet/body proportions and PBR versus graphic shadows before rigging or building the factory asset library.
