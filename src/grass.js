// Herbe haute animée : ~150 000 brins générés entièrement sur GPU autour de la caméra,
// posés sur le relief, absents des routes, plages, rochers et maisons.
import * as THREE from 'three';
import { HALF, N, H, ROAD_D, waterLevelAt } from './map.js';
import { makeNoise } from './noise.js';
import { GLSL_NOISE } from './terrain.js';

function densityTexture() {
  const d = new Uint8Array(N * N);
  const nz = makeNoise(4242);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i, x = i - HALF, z = j - HALF, h = H[k];
    if (h < 2.0 || ROAD_D[k] < 0.6) continue;
    if (h > 4 && h < 60 && waterLevelAt(x, z) > h - 0.4) continue;
    const gx = (H[k + 1] - H[k - 1]) / 2, gz = (H[k + N] - H[k - N]) / 2;
    const ny = 1 / Math.hypot(gx, 1, gz);
    if (ny < 0.8) continue;
    // trottoirs et maisons
    if ((Math.abs(z) < 9.2 && Math.abs(x) < 86) || (Math.abs(x) < 9.2 && Math.abs(z) < 86)) continue;
    let v = 0.55 + 0.45 * nz.fbm(x * 0.03, z * 0.03, 3);
    v *= Math.min(1, (h - 2.0) / 0.6) * Math.min(1, (ny - 0.8) / 0.08) * Math.min(1, (ROAD_D[k] - 0.6) / 1.5);
    d[k] = Math.max(0, Math.min(255, v * 255));
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { tex: t, data: d };
}

export function createGrass(engine, heightTex, lots, groundTex) {
  const { tex: dens, data } = densityTexture();
  // pas d'herbe dans l'emprise des maisons
  // (une parcelle peut fournir bare(x, z) pour ne dégager que son emprise exacte : jardins herbus)
  for (const l of lots) {
    const h = l.h || 7.5, r = Math.ceil(h);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const i = Math.round(l.x + dx + HALF), j = Math.round(l.z + dz + HALF);
      if (!l.bare || l.bare(i - HALF, j - HALF)) data[j * N + i] = 0;
    }
  }
  dens.needsUpdate = true;

  // brin : 4 segments, effilé
  const blade = new THREE.BufferGeometry();
  const P = [], I = [];
  const SEG = 4;
  for (let s = 0; s <= SEG; s++) {
    const t = s / SEG, w = 0.5 * (1 - t * 0.92);
    P.push(-w, t, 0, w, t, 0);
  }
  for (let s = 0; s < SEG; s++) { const a = s * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  blade.setIndex(I);
  const geo = new THREE.InstancedBufferGeometry().copy(blade);
  geo.instanceCount = 1;

  const uniforms = {
    uCenter: { value: new THREE.Vector3() }, uSpacing: { value: 0.17 }, uGrid: { value: 360 }, uRadius: { value: 30 },
    tH: { value: heightTex }, tD: { value: dens }, tG: { value: groundTex }, uHalf: { value: HALF }, uN: { value: N }, uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  };
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.75, color: 0xffffff });
  mat.userData.noAO = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uCenter; uniform float uSpacing, uGrid, uRadius, uHalf, uN, uTime;
        uniform sampler2D tH, tD;
        uniform highp sampler2DArray tG;
        varying float vY; varying float vShade; varying vec3 vGround; varying vec3 vGW;
        ${GLSL_NOISE}
        float heightAtW(vec2 w){
          vec2 g = clamp(w + uHalf, vec2(0.0), vec2(uN - 2.0)); vec2 f = fract(g); ivec2 i = ivec2(floor(g));
          float a = texelFetch(tH, i, 0).r, b = texelFetch(tH, i + ivec2(1,0), 0).r;
          float c = texelFetch(tH, i + ivec2(0,1), 0).r, d = texelFetch(tH, i + ivec2(1,1), 0).r;
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        vec3 bladeWorld; float bladeRot; float bladeH; vec2 bladeBend; float bladeDist;`)
      .replace('#include <beginnormal_vertex>', `
        {
          int id = gl_InstanceID; int G = int(uGrid);
          vec2 g = vec2(float(id % G), float(id / G));
          vec2 base = floor(uCenter.xz / uSpacing) * uSpacing;
          vec2 wp = base + (g - uGrid * 0.5) * uSpacing;
          vec2 cell = floor(wp / uSpacing + 0.5);
          float h1 = hash12(cell), h2 = hash12(cell + 17.13), h3 = hash12(cell * 1.7 + 3.1);
          wp += (vec2(h1, h2) - 0.5) * uSpacing * 1.6;
          float dens = texture2D(tD, (wp + uHalf + 0.5) / uN).r;
          float dist = length(wp - cameraPosition.xz);
          float fade = 1.0 - smoothstep(uRadius * 0.55, uRadius, dist);
          bladeDist = dist;
          bladeH = (0.2 + h3 * 0.32) * step(h3, dens * 1.15) * fade * smoothstep(0.05, 0.35, dens);
          bladeH *= h1 > 0.93 ? 1.7 : 1.0; // touffes plus hautes
          bladeRot = h2 * 6.2831;
          bladeWorld = vec3(wp.x, heightAtW(wp) - 0.02, wp.y);
          float wind = sin(uTime * 1.7 + wp.x * 0.35 + wp.y * 0.21) * 0.5 + sin(uTime * 3.1 + wp.x * 1.3) * 0.2 + (vnoise(wp * 0.15 + uTime * 0.4) - 0.5);
          bladeBend = vec2(0.22 + wind * 0.28, (h1 - 0.5) * 0.3);
          vShade = 0.65 + 0.35 * h1;
          // couleur de l'herbe du sol à cet endroit (texture photo) : les brins s'y fondent
          vGround = textureLod(tG, vec3(wp * 0.33, 0.0), 4.0).rgb;
          // plaques d'herbe plus sèche ou plus grasse
          float patchN = vnoise(wp * 0.07 + 11.0) * 0.7 + vnoise(wp * 0.31) * 0.3;
          vGround *= mix(vec3(1.18, 1.06, 0.72), vec3(0.86, 1.06, 0.86), smoothstep(0.3, 0.7, patchN));
        }
        // normale arrondie à travers la largeur du brin : volume et reflets doux
        vec3 nl = normalize(vec3(position.x * 1.6, 1.1, 0.7));
        vec3 objectNormal = vec3(nl.x * cos(bladeRot) - nl.z * sin(bladeRot), nl.y, nl.x * sin(bladeRot) + nl.z * cos(bladeRot));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(1.0, 0.0, 0.0);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed;
        {
          float y = position.y;
          vY = y;
          float c = cos(bladeRot), s = sin(bladeRot);
          float wdt = (0.03 + 0.018 * vShade) * (1.0 + bladeDist / 22.0); // plus larges au loin : tapis continu
          vec3 lp = vec3(position.x * wdt, y * bladeH, 0.0);
          lp.x += bladeBend.y * y * y * bladeH;
          lp.z += bladeBend.x * y * y * bladeH;
          transformed = vec3(lp.x * c - lp.z * s, lp.y, lp.x * s + lp.z * c) + bladeWorld;
          vGW = transformed;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vY; varying float vShade; varying vec3 vGround; varying vec3 vGW; uniform vec3 uSunDir;')
      .replace('#include <color_fragment>', `
        diffuseColor.rgb = vGround * mix(0.45, 1.25, vY) * (0.85 + 0.3 * vShade);`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <aomap_fragment>', `
        reflectedLight.indirectDiffuse *= mix(0.45, 1.0, vY);
        // translucidité : à contre-jour, le soleil traverse les brins (lueur dorée)
        {
          vec3 Vw = normalize(cameraPosition - vGW);
          float trans = pow(max(dot(-Vw, uSunDir), 0.0), 4.0) * vY * vY;
          reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.92, 0.7) * trans * 2.2;
        }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        // garde-fou : jamais de valeur invalide ni de reflet extrême (évite les halos du bloom)
        if (!(gl_FragColor.r >= 0.0) || !(gl_FragColor.g >= 0.0) || !(gl_FragColor.b >= 0.0)) gl_FragColor.rgb = vec3(0.05, 0.08, 0.02);
        gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(1.2));`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'herbe';
  engine.scene.add(mesh);

  return {
    mesh,
    setDensity(q) {
      const radius = 18 + 14 * q;
      const spacing = 0.15 / Math.sqrt(Math.max(0.2, q));
      const grid = Math.ceil((radius * 2) / spacing);
      uniforms.uRadius.value = radius;
      uniforms.uSpacing.value = spacing;
      uniforms.uGrid.value = grid;
      geo.instanceCount = grid * grid;
    },
    setSun(dir) { uniforms.uSunDir.value.copy(dir); },
    update(t, center) {
      uniforms.uTime.value = t;
      uniforms.uCenter.value.copy(center);
    },
  };
}
