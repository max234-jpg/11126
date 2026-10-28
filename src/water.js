// Océan : couleur selon la profondeur réelle (lagon turquoise -> bleu profond), reflets du ciel,
// reflet du soleil, écume sur le rivage, vaguelettes animées.
import * as THREE from 'three';
import * as A from './assets.js';
import { HALF, N } from './map.js';
import { GLSL_NOISE } from './terrain.js';

export async function createWater(engine, sky, heightTex) {
  const nor = await A.texture('water/nor');
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      tNor: { value: null }, tSky: { value: null }, tH: { value: null },
      uSun: { value: new THREE.Vector3() },
      uHalf: { value: HALF }, uN: { value: N },
    }]),
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime, uHalf, uN; uniform sampler2D tNor, tSky, tH; uniform vec3 uSun;
      varying vec3 vW;
      ${GLSL_NOISE}
      vec3 skyLookup(vec3 d){
        d.y = max(d.y, 0.02);
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1., 1.)) * 0.31830989 + 0.5);
        return texture2D(tSky, uv).rgb;
      }
      void main(){
        vec2 huv = (vW.xz + uHalf + 0.5) / uN;
        float ground = texture2D(tH, huv).r;
        if (huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0) ground = -14.0;
        float depth = max(0.0, -ground);
        vec2 p = vW.xz;
        vec3 n1 = texture2D(tNor, p * 0.031 + vec2(uTime * 0.011, uTime * 0.007)).xzy * 2.0 - 1.0;
        vec3 n2 = texture2D(tNor, p * 0.083 - vec2(uTime * 0.017, -uTime * 0.013)).xzy * 2.0 - 1.0;
        vec3 n3 = texture2D(tNor, p * 0.007 + vec2(uTime * 0.003, 0.0)).xzy * 2.0 - 1.0;
        vec3 N = normalize(vec3(0.0, 1.0, 0.0) + vec3(n1.x + n2.x + n3.x * 1.5, 0.0, n1.z + n2.z + n3.z * 1.5) * 0.18);
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(80.0, 900.0, dist)));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 refl = skyLookup(R);
        vec3 shallow = vec3(0.07, 0.42, 0.42);
        vec3 deep = vec3(0.008, 0.07, 0.13);
        vec3 body = mix(shallow, deep, smoothstep(0.5, 11.0, depth));
        // lumière du soleil diffusée dans l'eau
        body *= 0.55 + 0.6 * max(uSun.y, 0.0);
        vec3 col = mix(body, refl, fres);
        float spec = pow(max(dot(R, uSun), 0.0), 900.0) * 30.0 + pow(max(dot(R, uSun), 0.0), 90.0) * 0.6;
        col += vec3(1.0, 0.93, 0.8) * spec;
        // écume du rivage, ondulant avec le temps
        float shore = 1.0 - smoothstep(0.0, 0.9, depth);
        float foamN = fbm2(p * 0.9 + vec2(uTime * 0.2, uTime * 0.13));
        float wave = 0.5 + 0.5 * sin(depth * 7.0 - uTime * 1.6 + foamN * 4.0);
        float foam = shore * smoothstep(0.45, 0.8, foamN * wave + shore * 0.4);
        col = mix(col, vec3(0.92, 0.95, 0.95), foam * 0.85);
        // transparence : on voit le sable dans le lagon
        float alpha = clamp(0.35 + depth * 0.32 + fres * 0.5, 0.0, 1.0);
        alpha = max(alpha, foam * 0.9);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.tNor.value = nor;
  mat.uniforms.tSky.value = sky.skyTex;
  mat.uniforms.tH.value = heightTex;
  mat.uniforms.uSun.value.copy(sky.sunDir);

  const geo = new THREE.PlaneGeometry(5000, 5000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.renderOrder = 2;
  mesh.name = 'eau';
  engine.scene.add(mesh);
  return {
    mesh,
    update(t) { mat.uniforms.uTime.value = t; },
  };
}
