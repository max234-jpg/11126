// Ciel photographique (HDRI Poly Haven) : dôme haute définition + éclairage d'environnement + soleil.
import * as THREE from 'three';
import * as A from './assets.js';

export async function createSky(engine) {
  const { scene, renderer } = engine;
  const hdr = A.hdr('sky/hdr');

  // Direction du soleil = pixel le plus lumineux de l'HDRI
  let best = 0, bx = 0, by = 0;
  for (let y = 0; y < hdr.height / 2; y++) for (let x = 0; x < hdr.width; x++) {
    const l = hdr.lum((y * hdr.width + x) * 4);
    if (l > best) { best = l; bx = x; by = y; }
  }
  const u = (bx + 0.5) / hdr.width, v = 1 - (by + 0.5) / hdr.height;
  const phi = (u - 0.5) * Math.PI * 2, lat = (v - 0.5) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat)).normalize();
  // on garde un soleil assez haut pour de belles ombres
  if (sunDir.y < 0.45) { sunDir.y = 0.45; sunDir.normalize(); }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr.texture).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  hdr.texture.dispose();
  pmrem.dispose();

  // Dôme : photo du ciel en 4K, même projection équirectangulaire que l'éclairage
  const skyTex = await A.texture('sky/jpg', { srgb: true });
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.generateMipmaps = false;
  skyTex.minFilter = THREE.LinearFilter;
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { tSky: { value: skyTex }, uHorizon: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform sampler2D tSky; uniform vec3 uHorizon; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1., 1.)) * 0.31830989 + 0.5);
        vec3 c = texture2D(tSky, uv).rgb;
        // brume vers l'horizon et mer sous l'horizon
        float h = smoothstep(-0.02, 0.12, d.y);
        c = mix(uHorizon, c, h);
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2000, 64, 32), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  // Couleur d'horizon (moyenne de la bande d'horizon) pour la brume atmosphérique
  const img = await A.image('sky/jpg');
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 256, 128);
  const row = ctx.getImageData(0, 60, 256, 4).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < row.length; i += 4) { r += row[i]; g += row[i + 1]; b += row[i + 2]; }
  const n = row.length / 4;
  const horizon = new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  skyMat.uniforms.uHorizon.value.copy(horizon);
  scene.fog = new THREE.FogExp2(horizon.clone(), 0.0016);

  // Soleil
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 500;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x5a5a3a, 0.25);
  scene.add(hemi);

  function setShadowSize(s) {
    sun.shadow.mapSize.set(s, s);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }

  // l'ombre suit le joueur, alignée sur les texels pour éviter le scintillement
  const tmp = new THREE.Vector3();
  function follow(target) {
    const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
    tmp.copy(target);
    tmp.x = Math.round(tmp.x / texel) * texel;
    tmp.z = Math.round(tmp.z / texel) * texel;
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(sunDir, 220);
    dome.position.copy(engine.camera.position);
  }

  return { sun, sunDir, dome, horizon, skyTex, follow, setShadowSize, hemi };
}
