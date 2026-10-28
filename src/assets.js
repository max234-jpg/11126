// Accès aux ressources empaquetées (jeu/assets/*.js) : textures, modèles glTF, HDRI.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const store = window.__ASSETS__ || {};
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

export function has(name) {
  return !!store[name];
}

function bytes(name) {
  const e = store[name];
  if (!e) throw new Error('Ressource manquante : ' + name);
  if (!e.bytes) {
    const bin = atob(e.b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    e.bytes = u;
    e.b64 = null; // libère la chaîne base64
  }
  return e.bytes;
}

const urlCache = new Map();
export function url(name) {
  if (!urlCache.has(name)) {
    urlCache.set(name, URL.createObjectURL(new Blob([bytes(name)], { type: store[name].mime })));
  }
  return urlCache.get(name);
}

const imageCache = new Map();
export function image(name) {
  if (!imageCache.has(name)) {
    imageCache.set(name, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible : ' + name));
      img.src = url(name);
    }));
  }
  return imageCache.get(name);
}

export let maxAnisotropy = 8;
export function setMaxAnisotropy(v) { maxAnisotropy = v; }

export async function texture(name, { srgb = false, repeat = null, anisotropy = true } = {}) {
  const tex = new THREE.Texture(await image(name));
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  if (anisotropy) tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

// Pixels RGBA d'une image redimensionnée (pour les tableaux de textures et la composition des tenues)
export async function pixels(name, size) {
  const img = await image(name);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

export async function gltf(name) {
  const data = bytes(name);
  return gltfLoader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}

export function hdr(name) {
  const data = bytes(name);
  // demi-flottants : filtrables partout en WebGL 2 (Safari compris)
  const loader = new RGBELoader().setDataType(THREE.HalfFloatType);
  const parsed = loader.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  const tex = new THREE.DataTexture(parsed.data, parsed.width, parsed.height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.flipY = true;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const lum = (i) => THREE.DataUtils.fromHalfFloat(parsed.data[i]) * 0.2126 + THREE.DataUtils.fromHalfFloat(parsed.data[i + 1]) * 0.7152 + THREE.DataUtils.fromHalfFloat(parsed.data[i + 2]) * 0.0722;
  return { texture: tex, lum, width: parsed.width, height: parsed.height };
}

// Matériau PBR standard à partir d'un jeu de textures Poly Haven / ambientCG (diff, nor, arm)
const pbrCache = new Map();
export async function pbr(id, { repeat = [1, 1], color = 0xffffff, normalScale = 1, envMapIntensity = 1, side = THREE.FrontSide } = {}) {
  const key = id + repeat.join(',') + color + normalScale + envMapIntensity + side;
  if (pbrCache.has(key)) return pbrCache.get(key);
  const [map, normalMap, arm] = await Promise.all([
    texture(id + '/diff', { srgb: true, repeat }),
    texture(id + '/nor', { repeat }),
    has(id + '/arm') ? texture(id + '/arm', { repeat }) : null,
  ]);
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap, color, envMapIntensity, side,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness: 1, metalness: arm ? 1 : 0,
  });
  if (arm) { mat.roughnessMap = arm; mat.metalnessMap = arm; mat.aoMap = arm; mat.aoMapIntensity = 0.8; }
  else mat.roughness = 0.9;
  pbrCache.set(key, mat);
  return mat;
}
