// Tempête : un mur d'énergie qui se referme par phases sur une zone sûre aléatoire.
import * as THREE from 'three';

const PHASES = [
  { wait: 50, shrink: 40, r: 150, dps: 1 },
  { wait: 40, shrink: 35, r: 85, dps: 2 },
  { wait: 35, shrink: 30, r: 45, dps: 4 },
  { wait: 30, shrink: 25, r: 20, dps: 7 },
  { wait: 25, shrink: 20, r: 6, dps: 12 },
  { wait: 20, shrink: 20, r: 0, dps: 20 },
];

export class Storm {
  constructor(game) {
    this.game = game;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float uTime; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 220.0, vW.y * 0.06);
          float s = n(p + vec2(0.0, -uTime * 0.6)) * 0.6 + n(p * 2.3 + vec2(uTime * 0.3, -uTime * 1.1)) * 0.4;
          float streak = smoothstep(0.55, 1.0, n(vec2(vUv.x * 900.0, vW.y * 0.01 - uTime * 0.8)));
          vec3 col = mix(vec3(0.28, 0.08, 0.55), vec3(0.65, 0.35, 1.0), s) + streak * vec3(0.5, 0.4, 0.9);
          float a = 0.14 + 0.2 * s + streak * 0.18;
          a *= smoothstep(400.0, 120.0, vW.y);
          float dc = length(cameraPosition.xz - vW.xz);
          a *= smoothstep(150.0, 25.0, dc);
          gl_FragColor = vec4(col * 1.6, a);
        }`,
    });
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 500, 128, 1, true), mat);
    this.wall.position.y = 230;
    this.wall.renderOrder = 5;
    this.mat = mat;
    game.scene.add(this.wall);
    this.reset();
  }

  reset() {
    this.phase = -1;
    this.t = 0;
    this.cur = { x: 0, z: 0, r: 290 };
    this.prev = { ...this.cur };
    this.next = { x: 0, z: 0, r: 290 };
    this.dps = 0.5;
    this.state = 'wait';
    this.advance();
    this.wall.scale.set(this.cur.r, 1, this.cur.r);
  }

  advance() {
    this.phase++;
    const p = PHASES[Math.min(this.phase, PHASES.length - 1)];
    this.prev = { ...this.cur };
    // nouveau centre : à l'intérieur de la zone actuelle, de préférence sur la terre ferme
    const free = Math.max(0, this.cur.r - p.r);
    let x = this.cur.x, z = this.cur.z;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * free * (this.phase === 0 ? 0.3 : 0.8);
      const nx = this.cur.x + Math.cos(a) * d, nz = this.cur.z + Math.sin(a) * d;
      if (Math.hypot(nx, nz) < 150) { x = nx; z = nz; break; }
    }
    this.next = { x, z, r: p.r };
    this.phaseCfg = p;
    this.state = 'wait';
    this.t = p.wait;
  }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    this.t -= dt;
    if (this.state === 'wait' && this.t <= 0) {
      this.state = 'shrink'; this.t = this.phaseCfg.shrink; this.dur = this.phaseCfg.shrink;
      this.game.ui.toast('🌪️ La tempête se referme !');
    } else if (this.state === 'shrink') {
      const k = 1 - Math.max(0, this.t) / this.dur;
      this.cur.x = THREE.MathUtils.lerp(this.prev.x, this.next.x, k);
      this.cur.z = THREE.MathUtils.lerp(this.prev.z, this.next.z, k);
      this.cur.r = THREE.MathUtils.lerp(this.prev.r, this.next.r, k);
      this.dps = this.phaseCfg.dps;
      if (this.t <= 0 && this.phase < PHASES.length - 1) this.advance();
    }
    this.wall.position.x = this.cur.x;
    this.wall.position.z = this.cur.z;
    this.wall.scale.set(Math.max(0.5, this.cur.r), 1, Math.max(0.5, this.cur.r));
    // le mur n'est dessiné que lorsqu'on s'en approche
    const cam = this.game.camera.position;
    this.wall.visible = this.game.state !== 'menu' && Math.abs(Math.hypot(cam.x - this.cur.x, cam.z - this.cur.z) - this.cur.r) < 150;
  }

  outside(p) { return Math.hypot(p.x - this.cur.x, p.z - this.cur.z) > this.cur.r; }

  label() {
    const s = Math.max(0, Math.ceil(this.t));
    const mm = String(Math.floor(s / 60)).padStart(1, '0'), ss = String(s % 60).padStart(2, '0');
    return this.state === 'wait' ? `Fermeture dans ${mm}:${ss}` : `La zone se réduit ${mm}:${ss}`;
  }
}
