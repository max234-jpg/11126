// Cascades du massif : nappes d'eau animées (trajectoire de chute réelle), brume au pied,
// écume dans le bassin, grondement qui augmente quand on s'approche.
import * as THREE from 'three';
import { FALLS, MASSIF, massifToWorld, heightAt } from './map.js';
import { GLSL_NOISE } from './terrain.js';

const FALL_VS = `
  #include <fog_pars_vertex>
  attribute vec2 aFall; // x = travers (0..1), y = distance parcourue (m)
  varying vec2 vF; varying float vS; varying vec3 vW;
  uniform float uLen;
  void main(){
    vF = aFall; vS = aFall.y / uLen;
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FALL_FS = `
  #include <fog_pars_fragment>
  uniform float uTime, uSpeed, uSeed, uWidth;
  varying vec2 vF; varying float vS; varying vec3 vW;
  ${GLSL_NOISE}
  void main(){
    float t = uTime * uSpeed;
    // filets d'eau étirés qui descendent, plus quelques paquets d'écume
    float streak = fbm2(vec2(vF.x * 14.0 * uWidth + uSeed, vF.y * 0.22 - t * 2.4));
    float fine = vnoise(vec2(vF.x * 60.0 * uWidth, vF.y * 0.9 - t * 3.4));
    float clumps = fbm2(vec2(vF.x * 4.0 * uWidth + uSeed * 3.0, vF.y * 0.5 - t * 1.7));
    float a = 0.38 + 0.45 * streak + 0.25 * fine;
    float edge = smoothstep(0.0, 0.16, vF.x) * smoothstep(1.0, 0.84, vF.x);
    a *= edge * smoothstep(0.25, 0.55, clumps + 0.35 - abs(vF.x - 0.5) * 0.5);
    a *= smoothstep(0.0, 0.03, vS);
    vec3 col = mix(vec3(0.55, 0.66, 0.68), vec3(0.96, 0.98, 1.0), clamp(streak * 0.9 + fine * 0.4, 0.0, 1.0));
    // le pied de la chute devient de l'écume blanche
    col = mix(col, vec3(1.0), smoothstep(0.75, 1.0, vS) * 0.7);
    a = mix(a, max(a, 0.75 * edge), smoothstep(0.82, 1.0, vS));
    gl_FragColor = vec4(col * 1.05, clamp(a, 0.0, 0.95));
    #include <fog_fragment>
  }`;

const FOAM_FS = `
  uniform float uTime; varying vec2 vUv;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    float ring = sin(r * 18.0 - uTime * 4.0) * 0.5 + 0.5;
    float n = fbm2(p * 9.0 + vec2(uTime * 0.6, -uTime * 0.4));
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * (0.35 + 0.5 * n) * (0.6 + 0.4 * ring);
    gl_FragColor = vec4(vec3(0.95), a * 0.85);
  }`;

function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// u de la paroi à une hauteur donnée (pour faire jaillir la cascade juste devant la roche)
function cliffU(v, y) {
  for (let u = -3; u < 8; u += 0.05) {
    const [x, z] = massifToWorld(u, v);
    if (heightAt(x, z) <= y) return u;
  }
  return 0;
}

export function createWaterfalls(engine, audio) {
  const group = new THREE.Group();
  group.name = 'cascades';
  const uniforms = [];
  const mists = [];
  const impacts = [];
  const mistTex = softTexture();
  const D = MASSIF.dir, L = MASSIF.lat;

  for (const [fi, f] of FALLS.entries()) {
    const u0 = Math.max(cliffU(f.v - f.width / 2, f.top - 0.3), cliffU(f.v, f.top - 0.3), cliffU(f.v + f.width / 2, f.top - 0.3)) + 0.5;
    const drop = f.top - f.bottom + 0.4;
    const reach = 1.6 * Math.sqrt(2 * drop / 9.81) * (f.width > 3 ? 1.1 : 0.8); // vitesse de sortie x temps de chute
    for (let layer = 0; layer < 2; layer++) {
      const ROWS = 56, COLS = 10;
      const pos = [], fall = [], idx = [];
      let len = 0, prev = null;
      for (let r = 0; r <= ROWS; r++) {
        const s = r / ROWS;
        const y = f.top - drop * s;
        const u = u0 + reach * Math.sqrt(s) + layer * 0.18;
        const w = f.width * (1 + 0.55 * s) * (layer ? 0.85 : 1);
        const [cx, cz] = massifToWorld(u, f.v);
        if (prev) len += Math.hypot(cx - prev[0], y - prev[1], cz - prev[2]);
        prev = [cx, y, cz];
        for (let c = 0; c <= COLS; c++) {
          const k = c / COLS, lat = (k - 0.5) * w;
          const bulge = 0.25 * (1 - (2 * k - 1) ** 2) * (1 - s * 0.5);
          pos.push(cx + L.x * lat + D.x * bulge, y, cz + L.z * lat + D.z * bulge);
          fall.push(k, len);
        }
      }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const a = r * (COLS + 1) + c, b = a + COLS + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const un = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uSpeed: { value: layer ? 1.25 : 1 }, uSeed: { value: fi * 3.1 + layer * 7.7 },
        uWidth: { value: f.width / 4 }, uLen: { value: len },
      }]);
      const m = new THREE.ShaderMaterial({ uniforms: un, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 3;
      group.add(mesh);
      uniforms.push(un);
    }
    // point d'impact : écume et brume
    const [ix, iz] = massifToWorld(u0 + reach, f.v);
    impacts.push({ x: ix, z: iz, y: f.bottom, big: f.width > 3 });
    const foamU = { uTime: { value: 0 } };
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(f.width * 2.2, f.width * 2.2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: foamU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: FOAM_FS,
    }));
    foam.position.set(ix, f.bottom + 0.04, iz);
    foam.renderOrder = 4;
    group.add(foam);
    uniforms.push(foamU);
    const n = f.width > 3 ? 26 : 8;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0xf2f6f8, transparent: true, depthWrite: false, opacity: 0 }));
      sp.renderOrder = 5;
      group.add(sp);
      mists.push({ sp, x: ix, z: iz, y: f.bottom, w: f.width, life: Math.random(), speed: 0.25 + Math.random() * 0.2, ang: Math.random() * 6.28 });
    }
  }
  engine.scene.add(group);
  const roar = audio.waterfall ? audio.waterfall() : null;

  return {
    group, impacts,
    update(t, dt, cam) {
      for (const u of uniforms) u.uTime.value = t;
      for (const m of mists) {
        m.life += dt * m.speed;
        if (m.life > 1) { m.life -= 1; m.ang = Math.random() * 6.28; }
        const k = m.life;
        const r = m.w * (0.3 + k * 1.1);
        m.sp.position.set(m.x + Math.cos(m.ang) * r, m.y + 0.5 + k * m.w * 1.4, m.z + Math.sin(m.ang) * r);
        m.sp.scale.setScalar(m.w * (1.2 + k * 2.6));
        m.sp.material.opacity = Math.sin(k * Math.PI) * 0.32;
      }
      if (roar && cam) {
        let d = 1e9;
        for (const i of impacts) d = Math.min(d, Math.hypot(cam.x - i.x, cam.y - i.y, cam.z - i.z) * (i.big ? 1 : 2));
        roar.set(d);
      }
    },
  };
}
