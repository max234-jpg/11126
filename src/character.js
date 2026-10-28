// Personnages humains riggés (Quaternius, CC0) animés avec la Universal Animation Library,
// habillés de vrais tissus scannés (jean, coton, cuir) peints sur les zones du corps.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as A from './assets.js';
import * as M from './models.js';
import { mergeByMaterial } from './models.js';
import { makeNoise } from './noise.js';

export const SKINS = [
  { id: 'eclaireur', nom: 'Éclaireur', prix: 0, body: 'Male', hair: 'Hair_SimpleParted', hairColor: 0x3a2617,
    shirt: { fabric: 'cotton_jersey', color: '#ece8e0' }, sleeves: false, pants: { fabric: 'denim_fabric', color: '#ffffff' }, shoes: '#2b2b2b' },
  { id: 'aventuriere', nom: 'Aventurière', prix: 0, body: 'Female', hair: 'Hair_Long', hairColor: 0x2a1a10,
    shirt: { fabric: 'jersey_melange', color: '#b8433a' }, sleeves: false, pants: { fabric: 'denim_fabric', color: '#9aa4b5' }, shoes: '#f0ece4' },
  { id: 'ranger', nom: 'Ranger', prix: 0, body: 'Male', hair: 'Hair_Buzzed', hairColor: 0x1a120c, beard: true,
    shirt: { fabric: 'cotton_jersey', color: '#556b3a' }, sleeves: true, pants: { fabric: 'jersey_melange', color: '#9c8a64' }, shoes: '#4a3524' },
  { id: 'commando', nom: 'Commando', prix: 50, body: 'Male', hair: 'Hair_Buzzed', hairColor: 0x111111,
    shirt: { fabric: 'camo', color: '#ffffff' }, sleeves: true, pants: { fabric: 'camo', color: '#d8d8d8' }, shoes: '#1d1d1d' },
  { id: 'ombre', nom: 'Ombre', prix: 100, body: 'Female', hair: 'Hair_Buns', hairColor: 0x0d0d0d,
    shirt: { fabric: 'fabric_leather_01', color: '#3a3a3a' }, sleeves: true, pants: { fabric: 'denim_fabric', color: '#3c3c44' }, shoes: '#111111' },
  { id: 'glacier', nom: 'Glacier', prix: 125, body: 'Male', hair: 'Hair_SimpleParted', hairColor: 0xd8c39a,
    shirt: { fabric: 'jersey_melange', color: '#d8eef5' }, sleeves: true, pants: { fabric: 'cotton_jersey', color: '#e9edf0' }, shoes: '#9fd3e6' },
  { id: 'neon', nom: 'Néon', prix: 150, body: 'Female', hair: 'Hair_Long', hairColor: 0x5a1a6a,
    shirt: { fabric: 'cotton_jersey', color: '#d02be0' }, sleeves: false, pants: { fabric: 'fabric_leather_01', color: '#2a2a2a' }, shoes: '#39ff88' },
  { id: 'motard', nom: 'Motard', prix: 200, body: 'Male', hair: 'Hair_SimpleParted', hairColor: 0x1f1510, beard: true,
    shirt: { fabric: 'fabric_leather_01', color: '#8a5a36' }, sleeves: true, pants: { fabric: 'denim_fabric', color: '#5d6a80' }, shoes: '#2c1d12' },
];

const CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop',
  jumpStart: 'Jump_Start', fall: 'Jump_Loop', land: 'Jump_Land',
  swim: 'Swim_Fwd_Loop', swimIdle: 'Swim_Idle_Loop', dance: 'Dance_Loop', drive: 'Driving_Loop',
  death: 'Death01', hit: 'Hit_Chest', crouch: 'Crouch_Idle_Loop', crouchWalk: 'Crouch_Fwd_Loop',
  interact: 'Interact', roll: 'Roll', pistolIdle: 'Pistol_Idle_Loop',
};
const UPPER = /^(spine|neck|Head|clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/;

let shared = null;

export async function loadCharacters() {
  if (shared) return shared;
  const [male, female, anims, pistol] = await Promise.all([A.gltf('char/Male'), A.gltf('char/Female'), A.gltf('anims'), M.model('service_pistol')]);
  const hairs = {};
  for (const h of ['Hair_SimpleParted', 'Hair_Beard', 'Hair_Long', 'Hair_Buns', 'Hair_Buzzed']) hairs[h] = await A.gltf('hair/' + h);
  const bodies = { Male: male, Female: female };
  // hauteur du bassin pour adapter les translations de l'animation à chaque morphologie
  const pelvisY = (scene) => { let y = 1; scene.traverse((o) => { if (o.name === 'pelvis') y = o.position.length(); }); return y; };
  const animPelvis = pelvisY(anims.scene);
  const clips = {};
  for (const [who, g] of Object.entries(bodies)) {
    const ratio = pelvisY(g.scene) / animPelvis;
    clips[who] = {};
    for (const [key, name] of Object.entries(CLIPS)) {
      const src = anims.animations.find((a) => a.name === name);
      if (!src) continue;
      const tracks = [];
      for (const t of src.tracks) {
        if (t.name.endsWith('.quaternion')) tracks.push(t);
        else if (t.name === 'pelvis.position') {
          const c = t.clone();
          for (let i = 0; i < c.values.length; i++) c.values[i] *= ratio;
          tracks.push(c);
        }
      }
      clips[who][key] = new THREE.AnimationClip(key, src.duration, tracks);
      if (['pistolIdle'].includes(key)) {
        clips[who][key + 'Upper'] = new THREE.AnimationClip(key + 'Upper', src.duration, tracks.filter((t) => UPPER.test(t.name)));
      }
    }
    for (const [key, name] of [['aim', 'Pistol_Aim_Neutral'], ['shoot', 'Pistol_Shoot'], ['reload', 'Pistol_Reload']]) {
      const src = anims.animations.find((a) => a.name === name);
      clips[who][key] = new THREE.AnimationClip(key, src.duration, src.tracks.filter((t) => t.name.endsWith('.quaternion') && UPPER.test(t.name)));
    }
  }
  // textures de base pour composer les tenues
  const tex = {};
  for (const who of ['Male', 'Female']) {
    tex[who] = { skin: await A.pixels(`char/${who}/skin`, 1024), nor: await A.pixels(`char/${who}/nor`, 1024), mask: await A.pixels(`char/${who}/mask`, 1024) };
  }
  for (const f of ['denim_fabric', 'cotton_jersey', 'jersey_melange', 'fabric_leather_01']) {
    tex[f] = { diff: await A.pixels(f + '/diff', 512), nor: await A.pixels(f + '/nor', 512) };
  }
  // pistolet : une seule variante visible, fusionnée en un objet
  pistol.scene.traverse((o) => { if (/_b$|bullet|magazine_empty/.test(o.name)) o.visible = false; });
  const gunMesh = mergeByMaterial(pistol.scene, pistol.scene);
  shared = { bodies, clips, hairs, tex, pistol, gunMesh };
  return shared;
}

// ---------- composition des tenues ----------
const outfitCache = new Map();
const camoNoise = makeNoise(77);

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

function composeOutfit(skin) {
  if (outfitCache.has(skin.id)) return outfitCache.get(skin.id);
  const S = 1024, T = shared.tex, base = T[skin.body];
  const col = new Uint8ClampedArray(S * S * 4), nor = new Uint8ClampedArray(S * S * 4), rough = new Uint8ClampedArray(S * S * 4);
  const parts = {
    1: skin.shirt, 2: skin.sleeves ? skin.shirt : null, 3: skin.pants,
    4: { fabric: 'fabric_leather_01', color: skin.shoes },
  };
  const tint = {}, tile = { 1: 9, 2: 9, 3: 8, 4: 6 };
  for (const k of [1, 2, 3, 4]) if (parts[k]) tint[k] = hexToRgb(parts[k].color);
  // motif camouflage précalculé
  let camo = null;
  if (skin.shirt.fabric === 'camo' || skin.pants.fabric === 'camo') {
    camo = new Uint8Array(512 * 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const n = camoNoise.fbm(x / 70, y / 70, 3) + 0.3 * camoNoise.noise(x / 18, y / 18);
      camo[y * 512 + x] = n < -0.15 ? 0 : n < 0.1 ? 1 : n < 0.3 ? 2 : 3;
    }
  }
  const CAMO = [[0.2, 0.22, 0.14], [0.36, 0.38, 0.24], [0.5, 0.46, 0.32], [0.14, 0.13, 0.1]];
  const jersey = T.cotton_jersey;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const reg = Math.round(base.mask[i] / 50);
    const p = parts[reg];
    if (!p) {
      col[i] = base.skin[i]; col[i + 1] = base.skin[i + 1]; col[i + 2] = base.skin[i + 2];
      nor[i] = base.nor[i]; nor[i + 1] = base.nor[i + 1]; nor[i + 2] = base.nor[i + 2];
      rough[i + 1] = 135; // peau légèrement satinée
    } else {
      const t = tile[reg];
      const fx = ((x * t) >> 1) & 511, fy = ((y * t) >> 1) & 511, fi = (fy * 512 + fx) * 4;
      const shade = 0.78 + 0.32 * (base.skin[i] / 210);
      let r, g, b, fab;
      if (p.fabric === 'camo') {
        const c = CAMO[camo[fy * 512 + fx]];
        const grain = jersey.diff[fi] / 255 * 0.5 + 0.6;
        r = c[0] * grain; g = c[1] * grain; b = c[2] * grain; fab = jersey;
      } else {
        fab = T[p.fabric];
        r = fab.diff[fi] / 255; g = fab.diff[fi + 1] / 255; b = fab.diff[fi + 2] / 255;
        if (p.fabric !== 'denim_fabric' || p.color !== '#ffffff') {
          // teinture : on garde la texture du tissu (luminance) et on applique la couleur
          const l = (r * 0.3 + g * 0.59 + b * 0.11);
          const k = p.fabric === 'denim_fabric' ? 1.5 : p.fabric === 'fabric_leather_01' ? 1.9 : 1.25;
          r = tint[reg][0] * l * k; g = tint[reg][1] * l * k; b = tint[reg][2] * l * k;
        }
      }
      col[i] = r * shade * 255; col[i + 1] = g * shade * 255; col[i + 2] = b * shade * 255;
      nor[i] = fab.nor[fi]; nor[i + 1] = fab.nor[fi + 1]; nor[i + 2] = fab.nor[fi + 2];
      rough[i + 1] = p.fabric === 'fabric_leather_01' ? 120 : 235;
    }
    col[i + 3] = nor[i + 3] = rough[i + 3] = 255;
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false; // les pixels du canvas sont déjà dans l'ordre glTF (origine en haut)
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = A.maxAnisotropy;
    t.needsUpdate = true;
    return t;
  };
  const out = { map: mk(col, true), normalMap: mk(nor, false), roughnessMap: mk(rough, false) };
  outfitCache.set(skin.id, out);
  return out;
}

export class Character {
  constructor(skin) {
    this.root = new THREE.Group();
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.setSkin(skin);
  }

  setSkin(skin) {
    this.skin = skin;
    if (this.model) { this.root.remove(this.model); this.mixer.stopAllAction(); }
    const body = shared.bodies[skin.body];
    const m = SkeletonUtils.clone(body.scene);
    const bones = {};
    m.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (/Superhero/i.test(o.material.name)) {
          const t = composeOutfit(skin);
          o.material.map = t.map; o.material.normalMap = t.normalMap;
          o.material.roughnessMap = t.roughnessMap; o.material.metalnessMap = null; o.material.metalness = 0; o.material.roughness = 1;
          o.material.envMapIntensity = 0.75;
          this.bodyMat = o.material;
          this.bodyMesh = o;
        }
      }
    });
    this.bones = bones;
    // cheveux / barbe : maillages riggés sur l'os de la tête, rattachés au squelette du personnage
    const addHair = (id) => {
      const h = SkeletonUtils.clone(shared.hairs[id].scene);
      const found = [];
      h.traverse((o) => { if (o.isSkinnedMesh) found.push(o); });
      found.forEach((o) => {
        {
          const sk = o.skeleton;
          const mapped = sk.bones.map((b) => bones[b.name] || b);
          o.bind(new THREE.Skeleton(mapped, sk.boneInverses), o.bindMatrix);
          o.material = o.material.clone();
          o.material.color.setHex(skin.hairColor);
          o.material.alphaTest = 0.4;
          o.castShadow = true; o.frustumCulled = false;
          (this.bodyMesh?.parent || m).add(o);
        }
      });
    };
    addHair(skin.hair);
    if (skin.beard) addHair('Hair_Beard');
    // pistolet dans la main droite
    const gun = shared.gunMesh.clone(true);
    gun.scale.setScalar(1.0);
    gun.rotation.set(0, Math.PI / 2, Math.PI / 2);
    gun.position.set(-0.02, 0.1, 0.03);
    bones.hand_r?.add(gun);
    this.gun = gun;
    this.model = m;
    this.root.add(m);
    this.mixer = new THREE.AnimationMixer(m);
    this.actions = {};
    for (const [k, clip] of Object.entries(shared.clips[skin.body])) {
      const a = this.mixer.clipAction(clip);
      if (['jumpStart', 'land', 'death', 'hit', 'interact', 'roll', 'shoot', 'reload'].includes(k)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[k] = a;
    }
    // les gestes ponctuels du haut du corps s'estompent une fois terminés
    this.mixer.addEventListener('finished', (e) => {
      const n = e.action.getClip().name;
      if (['hit', 'interact', 'shoot', 'reload'].includes(n)) e.action.fadeOut(0.2);
    });
    this.current = null;
    this.upper = null;
    this.play('idle', 0);
  }

  play(name, fade = 0.2, speed = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = speed;
    if (this.current === name) return;
    const prev = this.actions[this.current];
    a.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) prev.crossFadeTo(a, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  // couche haut du corps (visée / tir / rechargement) par-dessus la locomotion
  setUpper(name, fade = 0.12) {
    if (this.upper === name) return;
    const prev = this.upper && this.actions[this.upper];
    if (prev) prev.fadeOut(fade);
    this.upper = name;
    if (name) {
      const a = this.actions[name];
      a.reset().setEffectiveWeight(8).fadeIn(fade).play();
    }
  }

  oneShotUpper(name) {
    const a = this.actions[name];
    if (!a) return;
    a.reset().setEffectiveWeight(12).play();
  }

  update(dt) { this.mixer.update(dt); }
}
