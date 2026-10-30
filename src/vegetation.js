// Végétation : arbres procéduraux (ez-tree), palmiers, rochers et buissons photo-scannés.
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import * as A from './assets.js';
import * as M from './models.js';
import { heightAt, normalAt, roadDist, inTown, nearLot, islandRadius, waterLevelAt, HALF } from './map.js';
import { makeNoise, mulberry32, smoothstep } from './noise.js';

const windUniforms = { uTime: { value: 0 } };

// Vent : balancement selon la hauteur dans l'arbre et la position de l'instance
function addWind(mat, strength, heightScale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(0.0, position.y) * ${heightScale.toFixed(4)};
          float ph = ip.x * 0.37 + ip.z * 0.23;
          float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7 + position.x) * 0.25;
          transformed.x += sway * hgt * hgt * ${strength.toFixed(4)};
          transformed.z += cos(uTime * 1.1 + ph) * hgt * hgt * ${(strength * 0.6).toFixed(4)};
        }`);
    // feuillage : normales non retournées sur la face arrière (éclairage doux, translucide)
    if (mat.side === THREE.DoubleSide) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    }
  };
  mat.customProgramCacheKey = () => 'wind' + strength + heightScale + mat.side;
}

async function makeTreeVariants() {
  const presets = [['Oak Medium', 11, 101], ['Oak Large', 14, 202], ['Ash Medium', 12, 303], ['Oak Small', 9, 404], ['Pine Medium', 13, 505], ['Ash Large', 15, 606]];
  const variants = [];
  for (const [name, height, seed] of presets) {
    const t = new Tree();
    t.loadPreset(name);
    t.options.seed = seed;
    // version allégée pour le temps réel : moins de sections, feuilles moins nombreuses mais plus grandes
    const br = t.options.branch;
    for (const k of Object.keys(br.sections)) br.sections[k] = Math.max(2, Math.round(br.sections[k] * 0.5));
    for (const k of Object.keys(br.segments)) br.segments[k] = Math.max(3, Math.round(br.segments[k] * 0.75));
    t.options.leaves.count = Math.max(1, Math.round(t.options.leaves.count * 0.4));
    t.options.leaves.size *= 1.45;
    t.generate();
    const bg = t.branchesMesh.geometry, lg = t.leavesMesh.geometry;
    bg.computeBoundingBox();
    const h = bg.boundingBox.max.y;
    const s = height / h;
    bg.scale(s, s, s); lg.scale(s, s, s);
    // normales du feuillage orientées vers l'extérieur de la couronne : éclairage volumique
    lg.computeBoundingBox();
    const c = lg.boundingBox.getCenter(new THREE.Vector3());
    const pos = lg.attributes.position, nor = lg.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i) - c.x, (pos.getY(i) - c.y) * 0.7 + 0.3 * height, pos.getZ(i) - c.z).normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
    }
    const bm = t.branchesMesh.material, lm = t.leavesMesh.material;
    const bark = new THREE.MeshStandardMaterial({ map: bm.map, normalMap: bm.normalMap, aoMap: bm.aoMap, roughnessMap: bm.roughnessMap, color: bm.color, roughness: 1 });
    const leaves = new THREE.MeshStandardMaterial({
      map: lm.map, color: lm.color.clone().multiplyScalar(0.92), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85,
      emissive: 0x0d1a05, envMapIntensity: 0.8,
    });
    addWind(leaves, 0.0016, 1);
    addWind(bark, 0.0005, 1);
    console.info(name, (bg.index.count / 3) | 0, 'tri branches', (lg.index.count / 3) | 0, 'tri feuilles');
    variants.push({ name, bark, leaves, bg, lg, height, trunkR: 0.35 * (height / 12), pine: name.startsWith('Pine') });
  }
  return variants;
}

// Texture de palme dessinée (rachis + folioles)
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 1024);
  const rnd = mulberry32(5);
  for (let i = 0; i < 120; i++) {
    const t = i / 120, y = 30 + t * 980;
    const len = 118 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.95) + 10;
    for (const side of [-1, 1]) {
      const g = 90 + rnd() * 50, r = 40 + rnd() * 30;
      x.strokeStyle = `rgb(${r},${g},${30 + rnd() * 20})`;
      x.lineWidth = 5 + rnd() * 3;
      x.beginPath();
      x.moveTo(128, y);
      x.quadraticCurveTo(128 + side * len * 0.5, y + 10, 128 + side * len, y + 30 + len * 0.25);
      x.stroke();
    }
  }
  x.strokeStyle = '#5d6b2c'; x.lineWidth = 9;
  x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 1024); x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = A.maxAnisotropy;
  return tex;
}

function palmGeometry(seed) {
  const rnd = mulberry32(seed);
  const H = 7 + rnd() * 3, lean = 1 + rnd() * 1.6, R0 = 0.24, R1 = 0.16;
  const trunk = { p: [], n: [], uv: [], i: [] };
  const SEGS = 18, RAD = 9;
  const pt = (t) => new THREE.Vector3(lean * t * t, H * t, 0);
  for (let s = 0; s <= SEGS; s++) {
    const t = s / SEGS, c = pt(t), r = THREE.MathUtils.lerp(R0, R1, t) * (1 + 0.08 * Math.sin(t * 60));
    for (let k = 0; k <= RAD; k++) {
      const a = (k / RAD) * Math.PI * 2;
      trunk.p.push(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      trunk.n.push(Math.cos(a), 0.1, Math.sin(a));
      trunk.uv.push(k / RAD, t * H / 1.2);
    }
  }
  for (let s = 0; s < SEGS; s++) for (let k = 0; k < RAD; k++) {
    const a = s * (RAD + 1) + k, b = a + RAD + 1;
    trunk.i.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const top = pt(1);
  const fr = { p: [], n: [], uv: [], i: [] };
  const NF = 13;
  for (let f = 0; f < NF; f++) {
    const ang = (f / NF) * Math.PI * 2 + rnd() * 0.3;
    const L = 3.4 + rnd() * 1.2, up = 0.9 - rnd() * 1.4;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = fr.p.length / 3;
    const SEG = 10;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const c = top.clone().addScaledVector(dir, t * L);
      c.y += up * t * 1.6 - 2.4 * t * t;
      const wdt = 0.7 * Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.05;
      for (const k of [-1, 0, 1]) {
        const v = c.clone().addScaledVector(side, k * wdt);
        v.y -= Math.abs(k) * 0.12 * wdt; // pli en V
        fr.p.push(v.x, v.y, v.z);
        fr.n.push(0, 1, 0);
        fr.uv.push(0.5 + k * 0.5, 1 - t);
      }
    }
    for (let s = 0; s < SEG; s++) for (let k = 0; k < 2; k++) {
      const a = base + s * 3 + k, b = a + 3;
      fr.i.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const mk = (d) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setIndex(d.i);
    return g;
  };
  const fg = mk(fr);
  fg.computeVertexNormals();
  return { trunk: mk(trunk), fronds: fg, H };
}

export async function createVegetation(engine, world) {
  const scene = engine.scene;
  const group = new THREE.Group();
  group.name = 'végétation';
  scene.add(group);
  const rnd = mulberry32(2024);
  const nz = makeNoise(99);

  // ---------- placement ----------
  const trees = [], palms = [], rocks = [], bushes = [], ferns = [], stumps = [], boulders = [];
  const STEP = 5.5;
  for (let z = -HALF + 10; z < HALF - 10; z += STEP) for (let x = -HALF + 10; x < HALF - 10; x += STEP) {
    const px = x + (rnd() - 0.5) * STEP * 0.9, pz = z + (rnd() - 0.5) * STEP * 0.9;
    const h = heightAt(px, pz);
    if (h < 0.6) continue;
    const lake = waterLevelAt(px, pz);
    if (lake > 0 && h < lake + 0.8) continue; // pas d'arbres dans les lacs
    const n = normalAt(px, pz);
    const rd = roadDist(px, pz);
    const town = inTown(px, pz, 4) || nearLot(px, pz, 3);
    const forest = nz.fbm(px * 0.011, pz * 0.011, 3);
    const d = Math.hypot(px, pz) / islandRadius(Math.atan2(pz, px));
    const r = rnd();
    if (h > 1.2 && h < 3.4 && d > 0.8 && rd > 2.5 && !town) {
      if (r < 0.16) palms.push({ x: px, z: pz, y: h - 0.1, rot: rnd() * 6.28, scale: 0.85 + rnd() * 0.35, v: Math.floor(rnd() * 4) });
      else if (r < 0.2) rocks.push({ x: px, z: pz, y: h - 0.15, rot: rnd() * 6.28, scale: 0.6 + rnd() * 0.8, v: Math.floor(rnd() * 6) });
      continue;
    }
    if (h < 2.5 || rd < 3 || town) continue;
    if (n[1] < 0.78) {
      // pas de rochers suspendus sur les parois quasi verticales
      if (n[1] > 0.6 && r < 0.32) rocks.push({ x: px, z: pz, y: h - 0.25, rot: rnd() * 6.28, scale: 0.8 + rnd() * 1.6, v: Math.floor(rnd() * 6) });
      continue;
    }
    const pTree = forest > 0.12 ? 0.3 : forest > -0.05 ? 0.07 : 0.02;
    if (r < pTree) {
      trees.push({ x: px, z: pz, y: h - 0.2, rot: rnd() * 6.28, scale: 0.75 + rnd() * 0.45, v: Math.floor(rnd() * 6), tx: rnd() - 0.5, tz: rnd() - 0.5 });
      if (rnd() < 0.5) ferns.push({ x: px + (rnd() - 0.5) * 4, z: pz + (rnd() - 0.5) * 4, y: h - 0.05, rot: rnd() * 6.28, scale: 1.4 + rnd() * 0.8, v: Math.floor(rnd() * 4) });
    } else if (r < pTree + 0.06) {
      bushes.push({ x: px, z: pz, y: h - 0.05, rot: rnd() * 6.28, scale: 2.2 + rnd() * 2.2, v: Math.floor(rnd() * 5) });
    } else if (r < pTree + 0.075) {
      boulders.push({ x: px, z: pz, y: h - 0.3, rot: rnd() * 6.28, scale: 0.8 + rnd() * 1.2, v: 0 });
    } else if (r < pTree + 0.08 && forest > 0) {
      stumps.push({ x: px, z: pz, y: h - 0.1, rot: rnd() * 6.28, scale: 0.8 + rnd() * 0.4, v: 0 });
    }
  }
  // palmiers d'alignement sur les pelouses du village
  for (let a = -71; a <= 71; a += 26) {
    if (Math.abs(a) < 14) continue;
    for (const [x, z] of [[a, 9.6], [a + 13, -9.6], [9.6, a], [-9.6, a + 13]]) {
      if (Math.abs(x) > 80 || Math.abs(z) > 80 || nearLot(x, z, -2)) continue;
      palms.push({ x, z, y: heightAt(x, z) - 0.1, rot: rnd() * 6.28, scale: 1, v: Math.floor(rnd() * 4) });
    }
  }

  // ---------- arbres ----------
  const variants = await makeTreeVariants();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let tris = 0;
  // instances regroupées par tuiles de 128 m : le frustum culling (caméra et ombres) reste efficace
  const chunked = (list) => {
    const m = new Map();
    for (const t of list) {
      const k = Math.floor(t.x / 160) + ',' + Math.floor(t.z / 160);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return [...m.values()];
  };
  variants.forEach((v, vi) => {
    for (const list of chunked(trees.filter((t) => t.v === vi))) {
      const bi = new THREE.InstancedMesh(v.bg, v.bark, list.length);
      const li = new THREE.InstancedMesh(v.lg, v.leaves, list.length);
      list.forEach((t, i) => {
        e.set(t.tx * 0.06, t.rot, t.tz * 0.06); q.setFromEuler(e); s.setScalar(t.scale); p.set(t.x, t.y, t.z);
        m4.compose(p, q, s);
        bi.setMatrixAt(i, m4); li.setMatrixAt(i, m4);
        world.addCircle(t.x, t.z, v.trunkR * t.scale, t.y, t.y + v.height * t.scale, { kind: 'tree' });
      });
      for (const im of [bi, li]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); }
      tris += (v.bg.index.count + v.lg.index.count) / 3 * list.length;
    }
  });

  // ---------- palmiers ----------
  const bark = await A.pbr('palm_tree_bark', { repeat: [1, 1] });
  const palmBark = bark.clone(); addWind(palmBark, 0.0004, 1);
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, color: 0xd8e6b0, emissive: 0x0b1404 });
  addWind(frondMat, 0.0013, 1);
  for (let k = 0; k < 4; k++) {
    const pg = palmGeometry(11 + k * 7);
    for (const list of chunked(palms.filter((t) => t.v === k))) {
    const ti = new THREE.InstancedMesh(pg.trunk, palmBark, list.length);
    const fi = new THREE.InstancedMesh(pg.fronds, frondMat, list.length);
    list.forEach((t, i) => {
      e.set(0, t.rot, 0); q.setFromEuler(e); s.setScalar(t.scale); p.set(t.x, t.y, t.z);
      m4.compose(p, q, s); ti.setMatrixAt(i, m4); fi.setMatrixAt(i, m4);
      world.addCircle(t.x, t.z, 0.28, t.y, t.y + pg.H, { kind: 'tree' });
    });
    for (const im of [ti, fi]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); }
    }
  }

  // ---------- rochers, buissons, fougères ----------
  const rockParts = await M.parts('rock_moss_set_01');
  M.instanceParts(rockParts, rocks, group);
  for (const r of rocks) {
    const v = rockParts[r.v % rockParts.length];
    const rad = Math.max(v.size.x, v.size.z) * r.scale * 0.42;
    world.addCircle(r.x, r.z, rad, r.y, r.y + v.size.y * r.scale, { kind: 'rock', walkable: rad > 1.2 });
  }
  // gros blocs : mêmes rochers moussus, à plus grande échelle
  for (const b of boulders) { b.v = Math.floor(Math.random() * 6); b.scale *= 1.6; }
  M.instanceParts(rockParts, boulders, group);
  for (const b of boulders) {
    const v = rockParts[b.v % rockParts.length];
    world.addCircle(b.x, b.z, Math.max(v.size.x, v.size.z) * b.scale * 0.42, b.y, b.y + v.size.y * b.scale, { kind: 'rock' });
  }
  const bushParts = [...(await M.parts('shrub_03')), ...(await M.parts('shrub_04'))];
  for (const v of bushParts) v.material.side = THREE.DoubleSide;
  M.instanceParts(bushParts, bushes, group, { shadows: true });
  const fernParts = await M.parts('fern_02');
  M.instanceParts(fernParts, ferns, group, { shadows: false });
  const stumpParts = await M.parts('tree_stump_01');
  M.instanceParts(stumpParts, stumps, group);
  for (const t of stumps) world.addCircle(t.x, t.z, 0.6 * t.scale, t.y, t.y + 0.5 * t.scale, { kind: 'rock' });

  console.info(`Végétation : ${trees.length} arbres (${(tris / 1e6).toFixed(1)} M triangles), ${palms.length} palmiers, ${rocks.length} rochers, ${bushes.length} buissons`);
  return {
    group,
    update(t) { windUniforms.uTime.value = t; },
  };
}
