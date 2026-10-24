import * as THREE from 'three';
import { surfaceHeightAt as heightAt, missionSite } from './terrain.js';
import { objective } from './mission.js';
import { encounterTrail } from './encounter.js';
import { createInfestationMaterials } from './infestation.js';

// Presentation for the crater mission: the derelict lander (clawed open and webbed in silk), the trail the
// crawler left from it to the caves, and the objective waypoint.
export function createExpeditionView(scene, models, itemModels = null) {
  const root = new THREE.Group(); scene.add(root);
  const geometries = [], materials = [];
  const own = (list, item) => { list.push(item); return item; };
  const site = missionSite(), dummy = new THREE.Object3D();
  const kit = createInfestationMaterials();
  let seed = null;

  // Lander, tilted where it came down. The core node hides once salvaged.
  let lander = null, core = null;
  const template = models.get('lander');
  if (template) {
    lander = template.clone(true);
    lander.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      if (o.name.replace(/\.?\d{3}$/, '') === 'Core') core = o;
      // The webbing is the caves' own silk and torn gauze.
      if (o.isMesh && /silk|gauze/i.test(o.material?.name ?? '')) { o.material = /gauze/i.test(o.material.name) ? kit.byRole.Gauze : kit.byRole.Silk; o.castShadow = false; o.renderOrder = 2; }
    });
    if (core && itemModels) core = itemModels.replace(lander, core, 'core', .56);
    lander.rotation.y = site.lander.angle; root.add(lander);
  }
  const coreLight = new THREE.PointLight('#7fdcff', 0, 6, 2); root.add(coreLight);

  // The crawler's trail from the lander to the caves: leg-tip pocks either side of its line, and a thread of silk
  // dragged along behind it. Laid out per seed in place().
  const pockGeo = own(geometries, new THREE.CircleGeometry(.07, 6)); pockGeo.rotateX(-Math.PI / 2);
  const pockMat = own(materials, new THREE.MeshBasicMaterial({ color: '#141216', transparent: true, opacity: .6, depthWrite: false }));
  const POCKS = 900, pocks = new THREE.InstancedMesh(pockGeo, pockMat, POCKS); pocks.renderOrder = 2; pocks.count = 0; root.add(pocks);
  let thread = null;
  function layTrail() {
    const trail = encounterTrail(seed), rand = (i, k) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
    let n = 0;
    const along = [];
    for (let i = 0; i < trail.length - 1; i++) {
      const [ax, az] = trail[i], [bx, bz] = trail[i + 1], len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let d = 0; d < len; d += .34) along.push([ax + ux * d, az + uz * d, ux, uz]);
    }
    along.forEach(([x, z, ux, uz], i) => {
      // Eight legs: the tips land in a loose band either side, the outer pairs widest.
      for (const side of [-1, 1]) {
        if (n >= POCKS || rand(i, side) < .25) continue;
        const spread = side * (.45 + rand(i, side + 3) * .5), fwd = (rand(i, side + 5) - .5) * .3;
        const px = x - uz * spread + ux * fwd, pz = z + ux * spread + uz * fwd, size = .7 + rand(i, side + 7) * .6;
        dummy.position.set(px, heightAt(seed, px, pz) + .03, pz); dummy.rotation.set(0, rand(i, 9) * 6.28, 0); dummy.scale.set(size, 1, size * (1.2 + rand(i, 11) * .6));
        dummy.updateMatrix(); pocks.setMatrixAt(n++, dummy.matrix);
      }
    });
    pocks.count = n; pocks.instanceMatrix.needsUpdate = true;
    if (thread) { root.remove(thread); thread.geometry.dispose(); }
    const pts = along.filter((_, i) => i % 3 === 0).map(([x, z, ux, uz], i) => { const w = Math.sin(i * .9) * .18; return new THREE.Vector3(x - uz * w, heightAt(seed, x - uz * w, z + ux * w) + .04, z + ux * w); });
    thread = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, .022, 4), kit.byRole.Silk); thread.renderOrder = 2; root.add(thread);
  }

  // Waypoint: a tall beam over the objective and a chevron at the player's feet pointing to it.
  const beamMat = own(materials, new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beam = new THREE.Mesh(own(geometries, new THREE.CylinderGeometry(.45, .45, 40, 18, 1, true)), beamMat); root.add(beam);
  const ringMat = own(materials, new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(own(geometries, new THREE.RingGeometry(1.3, 1.5, 40)), ringMat); ring.rotation.x = -Math.PI / 2; root.add(ring);
  const chevronShape = new THREE.Shape(); chevronShape.moveTo(-.45, -.3); chevronShape.lineTo(0, .4); chevronShape.lineTo(.45, -.3); chevronShape.lineTo(0, -.08); chevronShape.closePath();
  const chevronGeo = own(geometries, new THREE.ShapeGeometry(chevronShape)); chevronGeo.rotateX(-Math.PI / 2); chevronGeo.rotateY(Math.PI);
  const chevron = new THREE.Mesh(chevronGeo, own(materials, new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: .85, depthWrite: false, depthTest: false, side: THREE.DoubleSide })));
  chevron.renderOrder = 4; root.add(chevron);

  function place(state) {
    seed = state.seed;
    if (lander) lander.position.set(site.lander.x, heightAt(seed, site.lander.x, site.lander.z) - .05, site.lander.z);
    coreLight.position.set(site.lander.x + Math.sin(site.lander.angle) * .2, heightAt(seed, site.lander.x, site.lander.z) + 1.4, site.lander.z + 1.2);
    layTrail();
  }
  let time = 0;
  function update(state, dt) {
    time += dt;
    if (seed !== state.seed) place(state);
    const salvaged = (state.mission?.salvage ?? 0) >= 1;
    if (core) core.visible = !salvaged;
    coreLight.intensity = salvaged ? 0 : 2 + Math.sin(time * 2.3) * .6;
    const surface = state.player.cave == null, target = surface ? objective(state).target : null;
    beam.visible = ring.visible = !!target;
    if (target) {
      const y = heightAt(seed, target.x, target.z);
      beam.position.set(target.x, y + 20, target.z); ring.position.set(target.x, y + .08, target.z);
      ring.scale.setScalar(1 + (time % 1.6) * .35); ringMat.opacity = .7 * (1 - (time % 1.6) / 1.6);
    }
    const dx = target ? target.x - state.player.x : 0, dz = target ? target.z - state.player.z : 0, far = Math.hypot(dx, dz);
    chevron.visible = !!target && far > 9;
    if (chevron.visible) {
      const heading = Math.atan2(dx, dz), x = state.player.x + Math.sin(heading) * 1.9, z = state.player.z + Math.cos(heading) * 1.9;
      chevron.position.set(x, heightAt(seed, x, z) + .15, z); chevron.rotation.y = heading;
    }
  }
  return {
    update,
    dispose() { scene.remove(root); thread?.geometry.dispose(); kit.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
