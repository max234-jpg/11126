// Immeubles du centre-ville et tours : façades percées de vraies fenêtres en retrait,
// bandeaux d'étage, balcons, corniches, toits équipés, boutiques au rez-de-chaussée
// (vitrines, enseignes, stores, intérieur visible et accessible).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as A from './assets.js';
import { Bucket, wallPieces } from './geom.js';
import { BUILDING_LOTS, TOWERS, heightAt } from './map.js';
import { mulberry32 } from './noise.js';

const SHOPS = [
  ['BOULANGERIE', '#7a1f1f'], ['PHARMACIE', '#11724a'], ['CAFÉ DU PORT', '#2b2b2b'], ['SUPÉRETTE', '#1d4f8a'],
  ['PIZZERIA', '#b23a1c'], ['BANQUE', '#0f2f4f'], ['LIBRAIRIE', '#5a3b1e'], ['FLEURISTE', '#3b6b2a'],
];

function signTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 128);
  x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 6; x.strokeRect(8, 8, 1008, 112);
  x.fillStyle = '#fff7e6';
  x.font = '800 78px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = A.maxAnisotropy;
  return t;
}

function awningTexture(color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#efe9dc' : color; x.fillRect(i * 32, 0, 32, 64); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export async function createBuildings(engine, world, houses) {
  const group = new THREE.Group();
  group.name = 'immeubles';
  const facades = [
    await A.pbr('concrete_wall_008', { color: 0xe8e2d8 }),
    await A.pbr('brick_wall_09'),
    await A.pbr('rectangular_facade_tiles', { color: 0xd9d4cc }),
    await A.pbr('plastered_wall_02', { color: 0xf0d9b8 }),
  ];
  const trim = await A.pbr('concrete_wall_008', { color: 0xf4f1ea });
  const roofMat = await A.pbr('concrete_pavement');
  const shutterMat = await A.pbr('painted_metal_shutter', { color: 0x9aa3a8 });
  const shopFloor = await A.pbr('floor_tiles_06');
  const shopWall = (await A.pbr('painted_plaster_wall', { color: 0xfffaf2 })).clone();
  shopWall.emissive = new THREE.Color(0x2a2620);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a33, metalness: 0.9, roughness: 0.06, envMapIntensity: 1.6 });
  const shopGlass = new THREE.MeshPhysicalMaterial({ color: 0xbcd0d8, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.22, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2e3236, metalness: 0.6, roughness: 0.4 });
  const railGlass = new THREE.MeshPhysicalMaterial({ color: 0x8fb3c0, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const acMat = new THREE.MeshStandardMaterial({ color: 0xb9bcbd, metalness: 0.5, roughness: 0.5 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.6 });
  const goodsMats = [0xc9473a, 0x3f7fbf, 0xe0b23c, 0x4c9a5a, 0xe8e4da].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));

  const merged = new Map();
  const put = (key, mat, geo, m, cast = true) => {
    if (!geo.index || geo.index.count === 0) return;
    geo.applyMatrix4(m);
    if (!merged.has(key)) merged.set(key, { mat, geos: [], cast });
    merged.get(key).geos.push(geo);
  };
  const extra = []; // objets non fusionnés (enseignes, stores)

  const build = ({ x, z, rot, W, D, floors, seed, shop }) => {
    const rnd = mulberry32(seed * 7919);
    const fi = Math.floor(rnd() * facades.length);
    const fac = facades[fi];
    const ground = Math.min(heightAt(x - W / 2, z), heightAt(x + W / 2, z), heightAt(x, z - D / 2), heightAt(x, z + D / 2), heightAt(x, z));
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, ground, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const toWorld = (lx, lz) => [x + lx * cr + lz * sr, z - lx * sr + lz * cr];
    const GH = shop ? 4.4 : 4.0, FH = 3.2, T = 0.32;
    const topY = GH + (floors - 1) * FH;
    const bF = new Bucket(2.6), bTrim = new Bucket(2), bGlass = new Bucket(1), bFrame = new Bucket(1), bShopGlass = new Bucket(1);
    const bRoof = new Bucket(3), bShutter = new Bucket(2.2), bShopFloor = new Bucket(1.6), bShopWall = new Bucket(2.4), bShelf = new Bucket(1), bRail = new Bucket(1), bAC = new Bucket(1);
    const colliders = [];
    const all = (b) => ({ px: b, nx: b, py: b, ny: b, pz: b, nz: b });
    const balconies = rnd() < 0.6;

    // façade : side = 0 avant (+z), 1 arrière, 2 gauche (-x), 3 droite (+x)
    const facade = (side, y0, h, openings, glassMat = bGlass) => {
      const front = side < 2, L = front ? W : D - 2 * T;
      const start = front ? -W / 2 : -D / 2 + T;
      const out = side === 0 || side === 3 ? 1 : -1;
      const pos = side === 0 ? D / 2 : side === 1 ? -D / 2 : side === 2 ? -W / 2 : W / 2;
      for (const p of wallPieces(L, h, openings)) {
        const a = start + p.u0, b = start + p.u1, yb = y0 + p.v0 - (p.v0 === 0 && y0 === 0 ? 0.6 : 0), yt = y0 + p.v1;
        if (front) {
          const z0 = out > 0 ? pos - T : pos, z1 = out > 0 ? pos : pos + T;
          Bucket.box(all(bF), a, yb, z0, b, yt, z1);
          if (y0 === 0 && p.v0 < 2) colliders.push([(a + b) / 2, (z0 + z1) / 2, (b - a) / 2, T / 2, 0, yt]);
        } else {
          const x0 = out > 0 ? pos - T : pos, x1 = out > 0 ? pos : pos + T;
          Bucket.box(all(bF), x0, yb, a, x1, yt, b);
        }
      }
      for (const o of openings) {
        const c = start + (o.u0 + o.u1) / 2, ww = o.u1 - o.u0, hh = o.v1 - o.v0, cy = y0 + (o.v0 + o.v1) / 2;
        const inset = o.shop ? 0.08 : 0.2;
        const depthPos = pos - out * inset;
        const put2 = (b, du, dv, su, sv, depth, dz = 0) => {
          const zc = depthPos + out * dz;
          if (front) Bucket.box(all(b), c + du - su / 2, cy + dv - sv / 2, zc - depth / 2, c + du + su / 2, cy + dv + sv / 2, zc + depth / 2);
          else Bucket.box(all(b), zc - depth / 2, cy + dv - sv / 2, c + du - su / 2, zc + depth / 2, cy + dv + sv / 2, c + du + su / 2);
        };
        if (o.door) continue;
        put2(o.shop ? bShopGlass : glassMat, 0, 0, ww, hh, 0.03);
        // menuiseries
        put2(bFrame, 0, hh / 2 - 0.03, ww, 0.06, 0.08); put2(bFrame, 0, -hh / 2 + 0.03, ww, 0.06, 0.08);
        put2(bFrame, -ww / 2 + 0.03, 0, 0.06, hh, 0.08); put2(bFrame, ww / 2 - 0.03, 0, 0.06, hh, 0.08);
        if (!o.shop) {
          put2(bFrame, 0, 0, 0.05, hh, 0.06);
          put2(bTrim, 0, -hh / 2 - 0.06, ww + 0.2, 0.08, 0.14, inset + 0.04); // appui
        } else if (front) {
          colliders.push([c, depthPos, ww / 2, 0.1, y0 + o.v0, y0 + o.v1]);
        }
      }
    };

    // ---- rez-de-chaussée ----
    if (shop) {
      // vitrine + porte au milieu, rideau métallique relevé au-dessus
      const door = { u0: W / 2 - 0.9, u1: W / 2 + 0.9, v0: 0, v1: 2.6, door: true };
      facade(0, 0, GH, [{ u0: 0.8, u1: W / 2 - 1.1, v0: 0.5, v1: 3.1, shop: true }, door, { u0: W / 2 + 1.1, u1: W - 0.8, v0: 0.5, v1: 3.1, shop: true }]);
      Bucket.box(all(bShutter), -W / 2 + 0.7, 3.15, D / 2 - 0.05, W / 2 - 0.7, 3.65, D / 2 + 0.05);
      const sideWins = (L) => [{ u0: L / 2 - 0.8, u1: L / 2 + 0.8, v0: 1.2, v1: 2.7 }];
      facade(1, 0, GH, sideWins(W));
      facade(2, 0, GH, sideWins(D - 2 * T));
      facade(3, 0, GH, sideWins(D - 2 * T));
      // intérieur de la boutique (profondeur 6 m)
      const SD = 6, zb = D / 2 - T - SD;
      Bucket.box({ py: bShopFloor }, -W / 2 + T, -0.6, zb, W / 2 - T, 0.12, D / 2 - T);
      Bucket.box({ pz: bShopWall }, -W / 2 + T, 0, zb - 0.2, W / 2 - T, GH, zb);
      Bucket.box({ ny: bShopWall }, -W / 2 + T, GH - 0.4, zb, W / 2 - T, GH - 0.2, D / 2 - T);
      Bucket.box({ px: bShopWall }, -W / 2, 0, zb, -W / 2 + T, GH, D / 2 - T);
      Bucket.box({ nx: bShopWall }, W / 2 - T, 0, zb, W / 2, GH, D / 2 - T);
      colliders.push([0, (zb - D / 2) / 2, W / 2, (zb + D / 2) / 2, 0, topY + 1]); // partie arrière pleine
      colliders.push([0, D / 2 - T - SD / 2, W / 2, SD / 2 + T, -0.6, 0.12, true]); // sol praticable
      colliders.push([-W / 2 + T / 2, 0, T / 2, D / 2, 0, GH], [W / 2 - T / 2, 0, T / 2, D / 2, 0, GH]); // murs latéraux
      // rayonnages, comptoir et produits
      for (let i = 0; i < 3; i++) {
        const sx = -W / 2 + 1.6 + i * ((W - 3.2) / 2);
        Bucket.box(all(bShelf), sx - 0.9, 0.12, zb + 0.05, sx + 0.9, 2.0, zb + 0.5);
        colliders.push([sx, zb + 0.28, 0.9, 0.25, 0, 2]);
        for (let k = 0; k < 3; k++) {
          const g = new Bucket(1);
          Bucket.box(all(g), sx - 0.8, 0.5 + k * 0.5, zb + 0.08, sx + 0.8, 0.75 + k * 0.5, zb + 0.45);
          put('goods' + ((i + k + seed) % goodsMats.length), goodsMats[(i + k + seed) % goodsMats.length], g.geometry(), M);
        }
      }
      Bucket.box(all(bShelf), W / 2 - 3.2, 0.12, D / 2 - T - 2.6, W / 2 - 1.2, 1.05, D / 2 - T - 2.0);
      colliders.push([W / 2 - 2.2, D / 2 - T - 2.3, 1.0, 0.3, 0, 1.05]);
      // enseigne et store rayé
      const [name, color] = SHOPS[seed % SHOPS.length];
      const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(W - 2, 8.5), 0.75, 0.1), [frame, frame, frame, frame,
        new THREE.MeshStandardMaterial({ map: signTexture(name, color), emissive: 0xffffff, emissiveMap: signTexture(name, color), emissiveIntensity: 0.25, roughness: 0.5 }), frame]);
      sign.position.set(0, 3.95, D / 2 + 0.06);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(W - 1.6, 0.06, 1.5), new THREE.MeshStandardMaterial({ map: awningTexture(color), roughness: 0.9, side: THREE.DoubleSide }));
      awn.material.map.repeat.set((W - 1.6) / 2, 1);
      awn.position.set(0, 3.25, D / 2 + 0.72);
      awn.rotation.x = 0.28;
      for (const o of [sign, awn]) { o.castShadow = true; o.receiveShadow = true; o.applyMatrix4(M); extra.push(o); }
      const [wx, wz] = toWorld(-W / 4, D / 2 - T - 3.2);
      const [dx, dz] = toWorld(0, D / 2 + 1.4);
      houses.push({ lot: { rot }, w: W, d: D, ground, floorY: ground + 0.12, toWorld, spots: [[wx, wz], [wx, wz]], door: [dx, dz], shop: name });
    } else {
      // hall vitré des tours
      const lobby = (L) => {
        const n = Math.max(2, Math.floor(L / 3.2)), step = L / n, list = [];
        for (let i = 0; i < n; i++) list.push({ u0: i * step + 0.3, u1: (i + 1) * step - 0.3, v0: 0.3, v1: 3.4, shop: true });
        return list;
      };
      facade(0, 0, GH, lobby(W)); facade(1, 0, GH, lobby(W)); facade(2, 0, GH, lobby(D - 2 * T)); facade(3, 0, GH, lobby(D - 2 * T));
      Bucket.box({ py: bShopFloor }, -W / 2 + T, -0.6, -D / 2 + T, W / 2 - T, 0.12, D / 2 - T);
      Bucket.box({ ny: bShopWall }, -W / 2 + T, GH - 0.4, -D / 2 + T, W / 2 - T, GH - 0.2, D / 2 - T);
      Bucket.box(all(bShopWall), -2, 0, -2, 2, GH, 2); // noyau des ascenseurs
      colliders.push([0, 0, W / 2, D / 2, 0, topY + 1]);
    }
    // ---- étages ----
    const winsFor = (L) => {
      const n = Math.max(1, Math.floor((L - 0.8) / 2.7)), step = L / n, list = [];
      for (let i = 0; i < n; i++) { const c = (i + 0.5) * step; list.push({ u0: c - 0.75, u1: c + 0.75, v0: 0.85, v1: 2.55 }); }
      return list;
    };
    for (let f = 1; f < floors; f++) {
      const y0 = GH + (f - 1) * FH;
      facade(0, y0, FH, winsFor(W)); facade(1, y0, FH, winsFor(W));
      facade(2, y0, FH, winsFor(D - 2 * T)); facade(3, y0, FH, winsFor(D - 2 * T));
      // bandeau d'étage
      Bucket.box(all(bTrim), -W / 2 - 0.08, y0 - 0.12, -D / 2 - 0.08, W / 2 + 0.08, y0 + 0.12, D / 2 + 0.08);
      // balcons en façade (un sur deux)
      if (balconies) {
        for (const [i, o] of winsFor(W).entries()) {
          if ((i + f) % 2) continue;
          const c = -W / 2 + (o.u0 + o.u1) / 2;
          Bucket.box(all(bTrim), c - 1.05, y0 - 0.02, D / 2, c + 1.05, y0 + 0.16, D / 2 + 1.2);
          Bucket.box(all(bRail), c - 1.0, y0 + 0.16, D / 2 + 1.15, c + 1.0, y0 + 1.1, D / 2 + 1.18);
          Bucket.box(all(bFrame), c - 1.05, y0 + 1.08, D / 2 + 1.12, c + 1.05, y0 + 1.14, D / 2 + 1.2);
        }
      }
    }
    // ---- corniche, acrotère, toit ----
    Bucket.box(all(bTrim), -W / 2 - 0.3, topY, -D / 2 - 0.3, W / 2 + 0.3, topY + 0.45, D / 2 + 0.3);
    for (const [a, b, c, d] of [[-W / 2, -D / 2, W / 2, -D / 2 + 0.25], [-W / 2, D / 2 - 0.25, W / 2, D / 2], [-W / 2, -D / 2, -W / 2 + 0.25, D / 2], [W / 2 - 0.25, -D / 2, W / 2, D / 2]]) {
      Bucket.box(all(bF), a, topY + 0.45, b, c, topY + 1.3, d);
    }
    Bucket.box({ py: bRoof }, -W / 2 + 0.25, topY, -D / 2 + 0.25, W / 2 - 0.25, topY + 0.5, D / 2 - 0.25);
    Bucket.box(all(bF), -2.5, topY + 0.5, -D / 2 + 1, 0.5, topY + 3.2, -D / 2 + 3.6); // local technique
    for (let k = 0; k < 3; k++) {
      const ax = W / 2 - 2 - k * 1.6, az = rnd() * (D - 4) - D / 2 + 2;
      Bucket.box(all(bAC), ax - 0.6, topY + 0.5, az - 0.45, ax + 0.6, topY + 1.4, az + 0.45);
    }
    put('fac' + fi, fac, bF.geometry(), M);
    put('trim', trim, bTrim.geometry(), M);
    put('glass', glass, bGlass.geometry(), M, false);
    put('frame', frame, bFrame.geometry(), M);
    put('shopglass', shopGlass, bShopGlass.geometry(), M, false);
    put('roof', roofMat, bRoof.geometry(), M);
    put('shutter', shutterMat, bShutter.geometry(), M);
    put('shopfloor', shopFloor, bShopFloor.geometry(), M, false);
    put('shopwall', shopWall, bShopWall.geometry(), M);
    put('shelf', shelfMat, bShelf.geometry(), M);
    put('rail', railGlass, bRail.geometry(), M, false);
    put('ac', acMat, bAC.geometry(), M);
    for (const [cx, cz, hx, hz, y0, y1, walk] of colliders) {
      const [wx, wz] = toWorld(cx, cz);
      world.addBox(wx, wz, hx, hz, rot, ground + y0, ground + y1, walk ? { walkable: true } : {});
    }
  };

  BUILDING_LOTS.forEach((l, i) => {
    // façade sur le trottoir (à 11 m de l'axe de la rue), comme les maisons
    const back = -1.0;
    const [cx, cz] = [l.x + back * Math.sin(l.rot), l.z + back * Math.cos(l.rot)];
    build({ x: cx, z: cz, rot: l.rot, W: 15, D: 11.5, floors: 4 + (i % 3), seed: i + 1, shop: true });
  });
  for (const t of TOWERS) build({ x: t.x, z: t.z, rot: t.z > 0 ? Math.PI : 0, W: 17, D: 16, floors: t.floors, seed: 20 + t.seed, shop: false });

  for (const { mat, geos, cast } of merged.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const o of extra) group.add(o);
  engine.scene.add(group);
  return group;
}
