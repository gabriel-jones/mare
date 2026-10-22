import * as THREE from 'three';
import { surfaceHeightAt as heightAt, missionSite, iceAt } from './terrain.js';
import { REGOLITH_PER_CELL } from './production.js';
import { objective } from './mission.js';

// Presentation for the crater mission: the derelict lander, the tracks around it, the crater's
// ice, the objective waypoint and the watcher on the rim.
export function createExpeditionView(scene, models) {
  const root = new THREE.Group(); scene.add(root);
  const geometries = [], materials = [];
  const own = (list, item) => { list.push(item); return item; };
  const site = missionSite(), dummy = new THREE.Object3D();
  let seed = null;

  // Lander, tilted where it came down. The core node hides once salvaged.
  let lander = null, core = null;
  const template = models.get('lander');
  if (template) {
    lander = template.clone(true);
    lander.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } if (o.name.replace(/\.?\d{3}$/, '') === 'Core') core = o; });
    lander.rotation.y = site.lander.angle; root.add(lander);
  }
  const coreLight = new THREE.PointLight('#7fdcff', 0, 6, 2); root.add(coreLight);

  // Three-toed prints, not boots: a trail from the lander up and over the east rim.
  const toeGeo = own(geometries, new THREE.PlaneGeometry(.07, .5)); toeGeo.rotateX(-Math.PI / 2); toeGeo.translate(0, 0, -.25);
  const printMat = own(materials, new THREE.MeshBasicMaterial({ color: '#1d1b20', transparent: true, opacity: .55, depthWrite: false }));
  const route = [[site.lander.x + 2, site.lander.z + 1.2], [site.lander.x + 4.5, site.lander.z - 1.5], [site.x + 5, site.z - 4], [site.x + 9, site.z - 2], [site.x + site.radius + 4, site.z + 2]];
  const prints = [];
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, az] = route[i], [bx, bz] = route[i + 1], length = Math.hypot(bx - ax, bz - az), heading = Math.atan2(bx - ax, bz - az);
    for (let d = 0; d < length; d += 1.15) {
      const t = d / length, side = prints.length % 2 ? .28 : -.28;
      prints.push({ x: ax + (bx - ax) * t + Math.cos(heading) * side, z: az + (bz - az) * t - Math.sin(heading) * side, heading });
    }
  }
  const toes = new THREE.InstancedMesh(toeGeo, printMat, prints.length * 3); toes.renderOrder = 2; root.add(toes);

  // Ice: pale patches on the shadowed floor that shrink as the rover digs them out.
  const iceMat = own(materials, new THREE.MeshStandardMaterial({ color: '#8ea9ba', roughness: .42, metalness: .1, emissive: '#2b5a75', emissiveIntensity: .16, polygonOffset: true, polygonOffsetFactor: -3 }));
  const iceCells = [];
  for (let x = Math.floor((site.x - site.radius) / 2); x <= Math.ceil((site.x + site.radius) / 2); x++) for (let z = Math.floor((site.z - site.radius) / 2); z <= Math.ceil((site.z + site.radius) / 2); z++) if (iceAt(x, z)) iceCells.push({ x, z, key: `${x},${z}` });
  const iceGeo = own(geometries, new THREE.CylinderGeometry(.5, .56, .07, 7));
  const ice = new THREE.InstancedMesh(iceGeo, iceMat, iceCells.length); ice.receiveShadow = true; root.add(ice);
  let iceKey = '';

  // Waypoint: a tall beam over the objective and a chevron at the player's feet pointing to it.
  const beamMat = own(materials, new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beam = new THREE.Mesh(own(geometries, new THREE.CylinderGeometry(.45, .45, 40, 18, 1, true)), beamMat); root.add(beam);
  const ringMat = own(materials, new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(own(geometries, new THREE.RingGeometry(1.3, 1.5, 40)), ringMat); ring.rotation.x = -Math.PI / 2; root.add(ring);
  const chevronShape = new THREE.Shape(); chevronShape.moveTo(-.45, -.3); chevronShape.lineTo(0, .4); chevronShape.lineTo(.45, -.3); chevronShape.lineTo(0, -.08); chevronShape.closePath();
  const chevronGeo = own(geometries, new THREE.ShapeGeometry(chevronShape)); chevronGeo.rotateX(-Math.PI / 2); chevronGeo.rotateY(Math.PI);
  const chevron = new THREE.Mesh(chevronGeo, own(materials, new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: .85, depthWrite: false, depthTest: false, side: THREE.DoubleSide })));
  chevron.renderOrder = 4; root.add(chevron);

  // The watcher: tall, thin and dark, with long arms. Fades in and out; never moves.
  const shade = own(materials, new THREE.MeshStandardMaterial({ color: '#060708', roughness: .95, transparent: true, opacity: 0 }));
  const glint = own(materials, new THREE.MeshBasicMaterial({ color: '#d9e4cf', transparent: true, opacity: 0 }));
  const figure = new THREE.Group(); figure.visible = false; root.add(figure);
  const limb = (r, length, x, y, z, rx = 0, rz = 0, mat = shade) => { const m = new THREE.Mesh(own(geometries, new THREE.CapsuleGeometry(r, length, 3, 6)), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); figure.add(m); return m; };
  limb(.17, .95, 0, 1.75, -.05, .18);
  const head = limb(.13, .22, 0, 2.5, .12, .5); head.scale.set(.9, 1, 1.25);
  limb(.05, 1.25, -.3, 1.35, .05, -.12, .09); limb(.05, 1.25, .3, 1.35, .05, -.12, -.09);
  limb(.045, .35, -.34, .58, .14, .5, .1); limb(.045, .35, .34, .58, .14, .5, -.1);
  limb(.07, .62, -.12, .78, -.02, -.25); limb(.07, .62, .12, .78, -.02, -.25);
  limb(.06, .55, -.12, .26, .05, .35); limb(.06, .55, .12, .26, .05, .35);
  for (const x of [-.05, .05]) { const eye = new THREE.Mesh(own(geometries, new THREE.SphereGeometry(.018, 6, 4)), glint); eye.position.set(x, 2.52, .27); figure.add(eye); }

  function place(state) {
    seed = state.seed;
    if (lander) lander.position.set(site.lander.x, heightAt(seed, site.lander.x, site.lander.z) - .05, site.lander.z);
    coreLight.position.set(site.lander.x + Math.sin(site.lander.angle) * .2, heightAt(seed, site.lander.x, site.lander.z) + 1.4, site.lander.z + 1.2);
    prints.forEach((p, i) => {
      for (let k = 0; k < 3; k++) {
        dummy.position.set(p.x, heightAt(seed, p.x, p.z) + .03, p.z); dummy.rotation.set(0, p.heading + (k - 1) * .42, 0); dummy.scale.set(1, 1, k === 1 ? 1.15 : .85);
        dummy.updateMatrix(); toes.setMatrixAt(i * 3 + k, dummy.matrix);
      }
    });
    toes.instanceMatrix.needsUpdate = true;
  }
  function updateIce(state) {
    const key = iceCells.map(c => Math.round(state.mined?.[c.key] ?? 0)).join(',');
    if (key === iceKey) return; iceKey = key;
    iceCells.forEach((c, i) => {
      const left = 1 - Math.min(1, (state.mined?.[c.key] ?? 0) / REGOLITH_PER_CELL), size = left > 0 ? .45 + 1.05 * left : 0;
      const h = Math.abs(Math.sin(c.x * 12.9898 + c.z * 78.233) * 43758.5453) % 1, ox = (h - .5) * .5, oz = ((h * 7.3) % 1 - .5) * .5;
      dummy.position.set(c.x * 2 + ox, heightAt(seed, c.x * 2 + ox, c.z * 2 + oz) + .02, c.z * 2 + oz); dummy.rotation.set(0, h * 6.28, 0); dummy.scale.set(size * (.8 + h * .4), 1, size * (1.2 - h * .4));
      dummy.updateMatrix(); ice.setMatrixAt(i, dummy.matrix);
    });
    ice.instanceMatrix.needsUpdate = true;
  }
  let time = 0;
  function update(state, dt, watcher) {
    time += dt;
    if (seed !== state.seed) { place(state); iceKey = ''; }
    updateIce(state);
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
    const f = surface ? watcher?.figure : null;
    figure.visible = !!f && f.fade > 0;
    if (figure.visible) {
      figure.position.set(f.x, heightAt(seed, f.x, f.z), f.z); figure.rotation.y = f.facing;
      shade.opacity = .95 * f.fade; glint.opacity = .85 * f.fade;
      shade.transparent = f.fade < 1;
    }
  }
  return {
    update,
    dispose() { scene.remove(root); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
