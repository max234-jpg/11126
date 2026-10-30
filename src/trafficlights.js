// Feux tricolores du carrefour central : potences au-dessus des voies, feux sur poteau
// et feux piétons. Cycle réel : vert 11 s, orange 3 s, rouge intégral 1,5 s, puis l'autre axe.
import * as THREE from 'three';

const CYCLE = [
  { ew: 'green', ns: 'red', t: 11 },
  { ew: 'amber', ns: 'red', t: 3 },
  { ew: 'red', ns: 'red', t: 1.5 },
  { ew: 'red', ns: 'green', t: 11 },
  { ew: 'red', ns: 'amber', t: 3 },
  { ew: 'red', ns: 'red', t: 1.5 },
];
const TOTAL = CYCLE.reduce((a, c) => a + c.t, 0);

function pedTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#fff';
  const rr = (a, b, w, h) => x.fillRect(a, b, w, h); // rectangles simples : compatible Safari 15
  if (kind === 'stop') { // main levée
    rr(42, 52, 46, 52);
    for (let i = 0; i < 4; i++) rr(42 + i * 12, 22 + (i % 3 ? 0 : 6), 9, 40);
    rr(28, 62, 15, 30);
  } else { // bonhomme qui marche
    x.beginPath(); x.arc(66, 22, 11, 0, Math.PI * 2); x.fill();
    x.lineCap = 'round'; x.strokeStyle = '#fff'; x.lineWidth = 15;
    const seg = (a, b, c2, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); };
    seg(64, 40, 58, 74); seg(58, 74, 42, 112); seg(58, 74, 78, 110); seg(62, 46, 40, 66); seg(62, 46, 86, 62);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createTrafficLights(engine, world, y0 = 4.41) {
  const group = new THREE.Group();
  group.name = 'feux';
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b3033, metalness: 0.7, roughness: 0.45 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x1b2420, metalness: 0.3, roughness: 0.6 });
  const COLORS = { red: 0xff2a1a, amber: 0xffa21a, green: 0x1aff6a };
  // un matériau par axe et par couleur : on règle seulement leur intensité lumineuse
  const lens = {};
  for (const axis of ['ew', 'ns']) {
    lens[axis] = {};
    for (const [k, c] of Object.entries(COLORS)) {
      lens[axis][k] = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 0.04, roughness: 0.2, metalness: 0 });
    }
  }
  const ped = {};
  for (const axis of ['ew', 'ns']) {
    ped[axis] = {
      stop: new THREE.MeshStandardMaterial({ color: 0x080808, emissive: 0xff5a1a, emissiveMap: pedTexture('stop'), emissiveIntensity: 0.05 }),
      walk: new THREE.MeshStandardMaterial({ color: 0x080808, emissive: 0xffffff, emissiveMap: pedTexture('walk'), emissiveIntensity: 0.05 }),
    };
  }

  const lensGeo = new THREE.CircleGeometry(0.115, 24);
  const visorGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.22, 16, 1, true, -Math.PI / 2, Math.PI);
  const headGeo = new THREE.BoxGeometry(0.36, 1.02, 0.26);

  // tête de feu tricolore, face avant vers +Z local
  const head = (axis) => {
    const h = new THREE.Group();
    const box = new THREE.Mesh(headGeo, housing);
    box.castShadow = true;
    h.add(box);
    ['red', 'amber', 'green'].forEach((c, i) => {
      const l = new THREE.Mesh(lensGeo, lens[axis][c]);
      l.position.set(0, 0.32 - i * 0.32, 0.131);
      h.add(l);
      const v = new THREE.Mesh(visorGeo, housing);
      v.rotation.x = Math.PI / 2;
      v.position.set(0, 0.32 - i * 0.32 + 0.02, 0.24);
      h.add(v);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.25, 0.02), housing);
    plate.position.z = -0.14;
    h.add(plate);
    return h;
  };
  const pedHead = (axis) => {
    const h = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.66, 0.2), housing);
    box.castShadow = true;
    h.add(box);
    const sq = new THREE.PlaneGeometry(0.26, 0.26);
    const a = new THREE.Mesh(sq, ped[axis].stop); a.position.set(0, 0.15, 0.101); h.add(a);
    const b = new THREE.Mesh(sq, ped[axis].walk); b.position.set(0, -0.15, 0.101); h.add(b);
    return h;
  };

  // [poteau x, z], direction de la potence, orientation de la tête (vers les voitures qui arrivent), axe
  const POLES = [
    { x: 7.2, z: -7.2, arm: [0, 1], face: Math.PI / 2, axis: 'ew' },
    { x: -7.2, z: 7.2, arm: [0, -1], face: -Math.PI / 2, axis: 'ew' },
    { x: -7.2, z: -7.2, arm: [1, 0], face: Math.PI, axis: 'ns' },
    { x: 7.2, z: 7.2, arm: [-1, 0], face: 0, axis: 'ns' },
  ];
  for (const p of POLES) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 6.2, 12), metal);
    pole.position.set(p.x, y0 + 3.1, p.z);
    pole.castShadow = true;
    group.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.35, 12), metal);
    base.position.set(p.x, y0 + 0.17, p.z);
    group.add(base);
    world.addCircle(p.x, p.z, 0.2, y0, y0 + 6.2);
    // potence au-dessus des voies
    const L = 6.2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, L, 10), metal);
    arm.rotation.set(p.arm[1] ? Math.PI / 2 : 0, 0, p.arm[0] ? Math.PI / 2 : 0);
    arm.position.set(p.x + p.arm[0] * L / 2, y0 + 5.9, p.z + p.arm[1] * L / 2);
    arm.castShadow = true;
    group.add(arm);
    for (const d of [3.6, 5.8]) {
      const h = head(p.axis);
      h.position.set(p.x + p.arm[0] * d, y0 + 5.2, p.z + p.arm[1] * d);
      h.rotation.y = p.face;
      group.add(h);
    }
    // feu sur le poteau, à hauteur des yeux
    const hp = head(p.axis);
    hp.scale.setScalar(0.8);
    hp.position.set(p.x, y0 + 3.2, p.z);
    hp.rotation.y = p.face;
    hp.translateZ(0.25);
    group.add(hp);
    // feu piéton : face au trottoir d'en face, vert quand la circulation parallèle passe
    const pedAxis = p.axis === 'ew' ? 'ns' : 'ew';
    const ph = pedHead(pedAxis);
    ph.position.set(p.x, y0 + 2.4, p.z);
    ph.rotation.y = Math.atan2(p.arm[0], p.arm[1]);
    ph.translateZ(0.2);
    group.add(ph);
  }
  engine.scene.add(group);

  let t = 0;
  const ON = 5.5, OFF = 0.04;
  return {
    group,
    update(dt) {
      t = (t + dt) % TOTAL;
      let acc = 0, phase = CYCLE[0];
      for (const c of CYCLE) { if (t < acc + c.t) { phase = c; break; } acc += c.t; }
      for (const axis of ['ew', 'ns']) {
        const state = phase[axis];
        for (const c of ['red', 'amber', 'green']) lens[axis][c].emissiveIntensity = c === state ? ON : OFF;
        // piétons : vert seulement quand leur axe est au vert, rouge clignotant pendant l'orange
        const walk = state === 'green';
        const blink = state === 'amber' && Math.floor(t * 2) % 2 === 0;
        ped[axis].walk.emissiveIntensity = walk ? 3.5 : 0.05;
        ped[axis].stop.emissiveIntensity = walk ? 0.05 : blink ? 0.4 : 3.5;
      }
    },
  };
}
