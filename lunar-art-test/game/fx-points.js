import * as THREE from 'three';

/**
 * A pool of soft round particles: sparks and flame (`additive`), dust and smoke (soft, normal blending). Sizes are in
 * metres; `pixels.value` is how many screen pixels a metre spans under the orthographic camera, kept up to date by the
 * owner. Returns {emit(x, y, z, vx, vy, vz, life, scale), update(dt, gravity, drag, floorAt), dispose()}.
 */
export function pointCloud(root, pixels, n, { additive, color, size, grow = 0 }) {
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), life = new Float32Array(n), max = new Float32Array(n), alpha = new Float32Array(n), scale = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1)); geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uPixels: pixels },
    vertexShader: 'uniform float uSize;uniform float uPixels;attribute float aAlpha;attribute float aScale;varying float vA;void main(){vA=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=max(1.5,uSize*aScale*uPixels);}',
    fragmentShader: `uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,${additive ? '.05' : '.2'},d)*vA;if(a<.01)discard;gl_FragColor=vec4(uColor${additive ? '*(1.+.8*(1.-d*2.))' : ''},a);}`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; root.add(points);
  let next = 0;
  return {
    material: mat,
    emit(x, y, z, vx, vy, vz, t, s = 1) { const k = next; next = (next + 1) % n; pos.set([x, y, z], k * 3); vel.set([vx, vy, vz], k * 3); life[k] = max[k] = t; scale[k] = s; },
    update(dt, gravity, drag, floorAt) {
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt; const o = i * 3, k = life[i] / max[i];
        vel[o + 1] -= gravity * dt; const d = Math.exp(-drag * dt); vel[o] *= d; vel[o + 1] *= d; vel[o + 2] *= d;
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        if (floorAt) { const f = floorAt(pos[o], pos[o + 2]); if (pos[o + 1] < f) { pos[o + 1] = f; vel[o + 1] *= -.3; vel[o] *= .5; vel[o + 2] *= .5; } }
        scale[i] *= 1 + grow * dt;
        alpha[i] = Math.min(1, k * 3) * Math.min(1, (1 - k) * 8 + (grow ? 0 : 1));
      }
      geo.attributes.position.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aScale.needsUpdate = true;
    },
    dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
