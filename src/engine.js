// Rendu : WebGL2, ombres douces, tonemapping neutre, bloom, occlusion ambiante, étalonnage couleur.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { setMaxAnisotropy } from './assets.js';

export const QUALITY = {
  basse: { pixelRatio: 0.75, shadow: 2048, ao: false, bloom: false, grass: 0.35, msaa: 0, drawDist: 600 },
  moyenne: { pixelRatio: 1, shadow: 2048, ao: false, bloom: true, grass: 0.65, msaa: 4, drawDist: 900 },
  haute: { pixelRatio: 1.25, shadow: 4096, ao: true, bloom: true, grass: 1, msaa: 4, drawDist: 1400 },
  ultra: { pixelRatio: 2, shadow: 4096, ao: true, bloom: true, grass: 1.35, msaa: 4, drawDist: 2000 },
};

// Étalonnage final « cinéma » : contraste doux, saturation, vignette légère.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.28 }, uSat: { value: 1.1 }, uContrast: { value: 1.06 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast, uFlash; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      vec2 q = vUv - 0.5;
      c *= 1.0 - uVignette * dot(q, q) * 2.2;
      c = mix(c, vec3(0.75, 0.05, 0.05), uFlash);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class Engine {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    r.domElement.id = 'game';
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
    this.clock = new THREE.Clock();
    this.qualityName = 'haute';
    this.q = QUALITY.haute;
    addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    this.qualityName = name;
    this.q = QUALITY[name];
    this.buildComposer();
    this.resize();
    this.onQuality?.(this.q);
  }

  buildComposer() {
    const r = this.renderer, q = this.q;
    if (this.composer) this.composer.dispose();
    r.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
      ao.blendIntensity = 0.85;
      this.composer.addPass(ao);
    }
    if (q.bloom) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.18, 0.5, 0.92));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer?.setSize(innerWidth, innerHeight);
  }

  render() {
    this.composer.render();
  }
}
