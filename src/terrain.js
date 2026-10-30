// Terrain : maillage de l'île + matériau PBR multi-couches (herbe, terre, sable, roche)
// mélangées selon l'altitude, la pente et la proximité des routes, avec anti-répétition.
import * as THREE from 'three';
import * as A from './assets.js';
import { H, N, HALF, ROAD_D } from './map.js';

const LAYERS = ['Grass004', 'Ground037', 'coast_sand_01', 'mossy_rock'];

async function textureArray(suffix, size, srgb) {
  const data = new Uint8Array(size * size * 4 * LAYERS.length);
  for (let i = 0; i < LAYERS.length; i++) {
    data.set(await A.pixels(`${LAYERS[i]}/${suffix}`, size), i * size * size * 4);
  }
  const tex = new THREE.DataArrayTexture(data, size, size, LAYERS.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = A.maxAnisotropy;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // les canvas ont l'origine en haut : on garde l'orientation telle quelle (texture tuilée)
  tex.needsUpdate = true;
  return tex;
}

// Hauteurs dans une texture flottante : utilisée par l'eau et l'herbe
export function heightTexture() {
  const t = new THREE.DataTexture(H, N, N, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export const GLSL_NOISE = /* glsl */`
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
    return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
  float fbm2(vec2 p){ return vnoise(p)*.5 + vnoise(p*2.03)*.3 + vnoise(p*4.1)*.2; }
`;

export async function createTerrain(engine) {
  const [diff, nor, arm] = await Promise.all([
    textureArray('diff', 1024, true), textureArray('nor', 1024, false), textureArray('arm', 512, false),
  ]);

  // Maillage : 2 m entre sommets autour du centre, suffisamment fin pour les talus
  const SEG = 640, SIZE = HALF * 2; // 1 m entre sommets : falaises nettes
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const road = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const gi = Math.round(x + HALF), gj = Math.round(z + HALF);
    const k = Math.min(N - 1, Math.max(0, gj)) * N + Math.min(N - 1, Math.max(0, gi));
    pos.setY(i, sampleH(x, z));
    road[i] = Math.min(20, ROAD_D[k]);
  }
  geo.setAttribute('aRoad', new THREE.BufferAttribute(road, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0xffffff });
  mat.defines = { DBG: +(new URLSearchParams(location.search).get('dbg') || 0) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tDiff = { value: diff };
    sh.uniforms.tNor = { value: nor };
    sh.uniforms.tArm = { value: arm };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRoad; varying float vRoad; varying vec3 vWPos; varying vec3 vWNor;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRoad = aRoad; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNor = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray tDiff, tNor, tArm;
        varying float vRoad; varying vec3 vWPos; varying vec3 vWNor;
        ${GLSL_NOISE}
        vec4 W; vec3 splatN; vec3 splatArm; vec3 rockN;
        // échantillonnage anti-répétition : deux échelles + rotation
        vec4 sampleL(sampler2DArray t, vec2 uv, float l){
          vec4 a = texture(t, vec3(uv, l));
          vec2 uv2 = mat2(0.8,-0.6,0.6,0.8) * uv * 0.37 + 0.23;
          vec4 b = texture(t, vec3(uv2, l));
          return mix(a, b, 0.35);
        }`)
      .replace('#include <map_fragment>', `
        float slope = 1.0 - normalize(vWNor).y;
        float n1 = fbm2(vWPos.xz * 0.045);
        float n2 = fbm2(vWPos.xz * 0.21 + 7.0);
        float wSand = 1.0 - smoothstep(1.25, 2.0, vWPos.y + (n1 - 0.5) * 1.2);
        float wRock = smoothstep(0.24, 0.42, slope + (n2 - 0.5) * 0.12) + smoothstep(68.0, 92.0, vWPos.y + n1 * 10.0);
        wRock = clamp(wRock, 0.0, 1.0);
        float wDirt = smoothstep(0.74, 0.92, n1 + n2 * 0.25) * 0.75 + (1.0 - smoothstep(0.3, 3.5, vRoad + n2 * 1.5));
        wDirt = clamp(wDirt, 0.0, 1.0);
        W = vec4(1.0, 0.0, 0.0, 0.0);
        W = mix(W, vec4(0,1,0,0), wDirt);
        W = mix(W, vec4(0,0,1,0), wSand);
        W = mix(W, vec4(0,0,0,1), wRock);
        vec2 uv = vWPos.xz;
        vec2 sc = vec2(0.33, 0.25);
        vec3 col = vec3(0.0); splatN = vec3(0.0); splatArm = vec3(0.0);
        float scales[4] = float[4](0.33, 0.28, 0.2, 0.09);
        for (int i = 0; i < 3; i++) {
          vec2 tuv = uv * scales[i];
          col += sampleL(tDiff, tuv, float(i)).rgb * W[i] * (i == 1 ? 0.82 : 1.0);
          splatN += (sampleL(tNor, tuv, float(i)).xyz * 2.0 - 1.0) * W[i];
          splatArm += sampleL(tArm, tuv, float(i)).rgb * W[i];
        }
        // roche : projection sur les 3 axes (pas d'étirement sur les falaises verticales)
        {
          vec3 Nn = normalize(vWNor);
          vec3 bw = pow(abs(Nn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 p = vWPos * 0.12;
          vec2 uvX = p.zy, uvY = p.xz, uvZ = p.xy;
          col += (texture(tDiff, vec3(uvX, 3.0)).rgb * bw.x + texture(tDiff, vec3(uvY, 3.0)).rgb * bw.y + texture(tDiff, vec3(uvZ, 3.0)).rgb * bw.z) * W.a;
          splatArm += (texture(tArm, vec3(uvX, 3.0)).rgb * bw.x + texture(tArm, vec3(uvY, 3.0)).rgb * bw.y + texture(tArm, vec3(uvZ, 3.0)).rgb * bw.z) * W.a;
          vec3 tX = texture(tNor, vec3(uvX, 3.0)).xyz * 2.0 - 1.0;
          vec3 tY = texture(tNor, vec3(uvY, 3.0)).xyz * 2.0 - 1.0;
          vec3 tZ = texture(tNor, vec3(uvZ, 3.0)).xyz * 2.0 - 1.0;
          tX = vec3(tX.xy * 1.3 + Nn.zy, abs(Nn.x));
          tY = vec3(tY.xy * 1.3 + Nn.xz, abs(Nn.y));
          tZ = vec3(tZ.xy * 1.3 + Nn.xy, abs(Nn.z));
          rockN = normalize(tX.zyx * bw.x + tY.xzy * bw.y + tZ.xyz * bw.z);
        }
        // variation de teinte à grande échelle (herbe plus sèche / plus verte)
        float macro = fbm2(vWPos.xz * 0.008);
        col *= mix(vec3(1.08, 1.0, 0.82), vec3(0.88, 1.04, 0.9), macro) * (0.9 + 0.2 * n2);
        diffuseColor.rgb *= col;
        #if DBG == 1
        diffuseColor.rgb = vec3(0.5);
        #elif DBG == 2
        diffuseColor.rgb = W.rgb;
        #endif`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(splatArm.g * 1.05, mix(0.35, 0.65, W.a), 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
      .replace('#include <normal_fragment_maps>', `{
          vec3 Nw = normalize(vWNor);
          vec3 T = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
          vec3 B = normalize(cross(Nw, T));
          vec3 tn = normalize(splatN + vec3(0.0, 0.0, 0.001));
          tn.xy *= 1.2;
          vec3 nw = normalize(T * tn.x - B * tn.y + Nw * tn.z);
          nw = normalize(mix(nw, rockN, W.a));
          #if DBG != 1
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
          #endif
        }`)
      .replace('#include <aomap_fragment>', `{
          float ao = mix(1.0, splatArm.r, 0.9);
          reflectedLight.indirectDiffuse *= ao;
          reflectedLight.indirectSpecular *= ao;
        }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  engine.scene.add(mesh);

  // Plancher marin lointain : prolonge le fond au-delà de la grille
  const far = new THREE.Mesh(new THREE.RingGeometry(HALF * 0.98, 2400, 64, 1), new THREE.MeshStandardMaterial({ color: 0x8d8467, roughness: 1 }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -14;
  engine.scene.add(far);

  return { mesh, diffArray: diff };
}

function sampleH(x, z) {
  const fx = Math.min(N - 1.001, Math.max(0, x + HALF)), fz = Math.min(N - 1.001, Math.max(0, z + HALF));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
  return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N] * (1 - u) + H[k + N + 1] * u) * v;
}
