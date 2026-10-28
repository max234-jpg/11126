// Chargement / duplication des modèles 3D Poly Haven, instanciation GPU pour les objets répétés.
import * as THREE from 'three';
import * as A from './assets.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const cache = new Map();

export async function model(id) {
  if (!cache.has(id)) {
    cache.set(id, A.gltf('model/' + id).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) if (m.map) m.map.anisotropy = A.maxAnisotropy;
        }
      });
      g.scene.updateMatrixWorld(true);
      g.box = new THREE.Box3().setFromObject(g.scene);
      return g;
    }));
  }
  return cache.get(id);
}

// Copie d'un modèle posée au sol (le bas du modèle à y)
export async function place(id, parent, x, y, z, rotY = 0, scale = 1, opts = {}) {
  const g = await model(id);
  const o = g.scene.clone(true);
  o.scale.setScalar(scale);
  o.rotation.y = rotY;
  o.position.set(x, y - g.box.min.y * scale, z);
  if (opts.envMapIntensity !== undefined) {
    o.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.envMapIntensity = opts.envMapIntensity;
      }
    });
  }
  parent.add(o);
  return o;
}

// Taille (x, y, z) d'un modèle en mètres
export async function size(id) {
  const g = await model(id);
  return g.box.getSize(new THREE.Vector3());
}

// Instanciation : une InstancedMesh par maillage du modèle. transforms = [{x,y,z,rot,scale}]
export async function instanced(id, transforms, parent, { shadows = true, filter = null } = {}) {
  const g = await model(id);
  const meshes = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  g.scene.traverse((o) => {
    if (!o.isMesh || (filter && !filter(o))) return;
    const local = o.matrixWorld.clone();
    const im = new THREE.InstancedMesh(o.geometry, o.material, transforms.length);
    transforms.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot || 0);
      s.setScalar(t.scale || 1);
      p.set(t.x, t.y - g.box.min.y * (t.scale || 1), t.z);
      m4.compose(p, q, s).multiply(local);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    parent.add(im);
    meshes.push(im);
  });
  return meshes;
}

// Variantes d'un modèle multi-objets (ex. rock_moss_set_01 contient 6 rochers) :
// chaque maillage est recentré en XZ et devient une variante instanciable.
export async function parts(id) {
  const g = await model(id);
  const out = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = toFloat(o.geometry);
    geo.applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox();
    const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -b.min.y, -c.z);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    out.push({ name: o.name, geometry: geo, material: o.material, size: geo.boundingBox.getSize(new THREE.Vector3()) });
  });
  return out;
}

// Instancie une liste de variantes : transforms = [{x,y,z,rot,scale,v}] (v = index de variante)
export function instanceParts(variants, transforms, parent, { shadows = true, tilt = 0 } = {}) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const meshes = [];
  variants.forEach((v, vi) => {
    const list = transforms.filter((t) => t.v % variants.length === vi);
    if (!list.length) return;
    const im = new THREE.InstancedMesh(v.geometry, v.material, list.length);
    list.forEach((t, i) => {
      e.set((t.tx || 0) * tilt, t.rot || 0, (t.tz || 0) * tilt);
      q.setFromEuler(e);
      if (Array.isArray(t.scale)) s.set(...t.scale); else s.setScalar(t.scale || 1);
      p.set(t.x, t.y, t.z);
      im.setMatrixAt(i, m4.compose(p, q, s));
    });
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    parent.add(im);
    meshes.push(im);
  });
  return meshes;
}

// Les maillages quantifiés (int16 normalisés) ne supportent pas d'être transformés : conversion en float.
export function toFloat(src) {
  const geo = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) { geo.setAttribute(name, a.clone()); continue; }
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent ? a.getComponent(i, k) : [a.getX(i), a.getY(i), a.getZ(i), a.getW(i)][k];
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) geo.setIndex(src.index.clone());
  return geo;
}

// Fusionne tous les maillages d'un sous-arbre par matériau (moins d'appels de rendu).
// Les géométries sont exprimées dans le repère de `relativeTo`.
export function mergeByMaterial(root, relativeTo, skip = () => false) {
  root.updateWorldMatrix(true, true);
  relativeTo.updateWorldMatrix(true, false);
  const inv = relativeTo.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || skip(o)) return;
    let hidden = false;
    for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    const g = toFloat(o.geometry);
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); }
    g.applyMatrix4(inv.clone().multiply(o.matrixWorld));
    const m = o.material;
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of groups) {
    const mesh = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos, false), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
