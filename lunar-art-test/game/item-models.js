import * as THREE from 'three';

/** Longest dimension in metres; all exported items have a unit-size, ground-centred origin. */
export const BELT_ITEM_SIZES = Object.freeze({ regolith: .42, metal: .46, silicon: .42, ice: .42, frame: .5, wing: .7, chip: .4, satellite: .78 });

/** Flatten the GLB hierarchy once. Clones and instances then share these geometries and materials. */
export function createItemLibrary(source) {
  source.updateMatrixWorld(true);
  const templates = new Map(), geometries = new Set(), sourceGeometries = new Set(), materials = new Set();
  source.traverse(node => {
    if (!/^Item_[a-z]+$/.test(node.name)) return;
    const item = node.name.slice(5), template = new THREE.Group(); template.name = `Item_${item}`;
    template.userData.item = item;
    node.traverse(part => {
      if (!part.isMesh) return;
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
      geometries.add(geometry); sourceGeometries.add(part.geometry);
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
      const mesh = new THREE.Mesh(geometry, part.material); mesh.name = part.name;
      mesh.castShadow = mesh.receiveShadow = true; template.add(mesh);
    });
    templates.set(item, template);
  });
  for (const geometry of sourceGeometries) geometry.dispose();
  const library = {
    get(item) { return templates.get(item); },
    create(item, size = 1) {
      const template = templates.get(item); if (!template) return null;
      const root = template.clone(true); root.scale.setScalar(size); return root;
    },
    /** Each material part is one instanced draw, independent of the number of carried items. */
    batch(item, capacity, size = 1) {
      const template = templates.get(item); if (!template) return null;
      const root = new THREE.Group(), meshes = [], scale = new THREE.Matrix4().makeScale(size, size, size), matrix = new THREE.Matrix4();
      root.name = `Items_${item}`; root.userData.item = item;
      for (const part of template.children) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
        mesh.name = part.name; mesh.count = 0; mesh.frustumCulled = false;
        mesh.castShadow = mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        meshes.push(mesh); root.add(mesh);
      }
      return {
        root, meshes,
        set(index, transform) {
          if (index < 0 || index >= capacity) throw new RangeError(`Item batch capacity exceeded: ${item}`);
          matrix.copy(transform).multiply(scale);
          for (const mesh of meshes) mesh.setMatrixAt(index, matrix);
        },
        finish(count) {
          if (count < 0 || count > capacity) throw new RangeError(`Invalid item count: ${item}`);
          for (const mesh of meshes) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; }
          root.visible = count > 0;
        },
        dispose() { root.removeFromParent(); for (const mesh of meshes) mesh.dispose(); },
      };
    },
    /** Replace a built-in prop at its existing bounds, without altering the source building asset. */
    replace(root, target, item, size) {
      const replacement = library.create(item, size); if (!target || !replacement) return target;
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(target).applyMatrix4(root.matrixWorld.clone().invert());
      replacement.position.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2);
      replacement.quaternion.copy(target.quaternion); target.visible = false; root.add(replacement); return replacement;
    },
    dispose() { for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); },
  };
  return library;
}

export async function loadItemLibrary(loader) {
  try { const gltf = await loader.loadAsync(new URL('./assets/inventory/items.glb', import.meta.url).href); return createItemLibrary(gltf.scene); }
  catch (error) { console.error('Inventory item models failed to load', error); return null; }
}
