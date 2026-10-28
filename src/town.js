// Village de San Calma : maisons explorables (portes ouvertes, fenêtres vitrées, intérieurs meublés),
// mobilier urbain, parc et parking.
import * as THREE from 'three';
import * as A from './assets.js';
import * as M from './models.js';
import { Bucket, wallPieces } from './geom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOTS, PARKS, PARKING, heightAt } from './map.js';
import { mulberry32 } from './noise.js';

const WALL_STYLES = {
  stucco: { wall: 'white_stucco', roof: 'clay_roof_tiles_02', tint: 0xfff6ea },
  brick: { wall: 'red_brick_03', roof: 'grey_roof_tiles', tint: 0xffffff },
  beige: { wall: 'beige_wall_001', roof: 'clay_roof_tiles_02', tint: 0xf3e2c8 },
  yellow: { wall: 'yellow_plaster', roof: 'grey_roof_tiles', tint: 0xffffff },
};
const FLOORS = ['laminate_floor_02', 'herringbone_parquet', 'floor_tiles_06'];

export const HOUSES = [];  // pour le jeu : intérieurs (coffres), portes, etc.

export async function createTown(engine, world, game) {
  const scene = engine.scene;
  const town = new THREE.Group();
  town.name = 'village';
  scene.add(town);

  // ---- matériaux partagés ----
  const ext = {};
  for (const [k, s] of Object.entries(WALL_STYLES)) {
    ext[k] = await A.pbr(s.wall, { color: s.tint });
    ext[k + '_roof'] = await A.pbr(s.roof);
  }
  const interior = (await A.pbr('painted_plaster_wall', { color: 0xfffaf2 })).clone();
  interior.envMapIntensity = 1.25;
  interior.emissive = new THREE.Color(0x2a2620); // lumière renvoyée par les pièces (éclairage indirect simulé)
  const floors = [];
  for (const f of FLOORS) { const m = (await A.pbr(f)).clone(); m.envMapIntensity = 0.8; floors.push(m); }
  const wood = await A.pbr('rough_wood', { color: 0x8a6a4c });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa9c4cc, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.28, envMapIntensity: 1.6, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false });
  const roofUnder = new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 0.9 });

  const Y0 = 0.35, H = 3.0, T = 0.24;

  // Toute la géométrie des maisons est fusionnée par matériau (quelques appels de rendu
  // pour tout le village) et le mobilier est instancié sur GPU.
  const merged = new Map();
  const put = (key, mat, geo, matrix, cast = true) => {
    geo.applyMatrix4(matrix);
    if (!merged.has(key)) merged.set(key, { mat, geos: [], cast });
    merged.get(key).geos.push(geo);
  };
  const instances = new Map();
  const inst = (id, x, y, z, rot, scale = 1) => {
    if (!instances.has(id)) instances.set(id, []);
    instances.get(id).push({ x, y, z, rot, scale });
  };
  const slab = (topBucketTs, sx, sy, sz) => {
    const top = new Bucket(topBucketTs), und = new Bucket(1);
    Bucket.box({ py: top, px: und, nx: und, ny: und, pz: und, nz: und }, -sx / 2, -sy / 2, -sz / 2, sx / 2, sy / 2, sz / 2);
    return { top: top.geometry(), und: und.geometry() };
  };
  const M4 = (x, y, z, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1));

  for (const lot of LOTS) {
    const rnd = mulberry32(lot.seed * 977);
    const w = 11 + Math.round(rnd() * 4) / 2, d = 9 + Math.round(rnd() * 3) / 2;
    const style = WALL_STYLES[lot.style];
    const ground = heightAt(lot.x, lot.z);
    const HM = new THREE.Matrix4().compose(new THREE.Vector3(lot.x, ground, lot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.rot), new THREE.Vector3(1, 1, 1));

    const bExt = new Bucket(2.5), bInt = new Bucket(2.5), bFloor = new Bucket(2), bTrim = new Bucket(1), bGlass = new Bucket(1), bWood = new Bucket(1.2);
    const colliders = [];   // [cx, cz, hx, hz, y0, y1, walkable]

    const px = w * 0.1;                     // cloison salon / chambre
    const livC = (-w / 2 + px) / 2, bedC = (px + w / 2) / 2;
    const doorX = livC + 0.9;
    const WIN = (c) => ({ u0: c - 0.75, u1: c + 0.75, v0: 1.0, v1: 2.35, win: true });
    const DOOR = (c) => ({ u0: c - 0.6, u1: c + 0.6, v0: 0, v1: 2.25, door: true });

    // Mur générique. axis 'x' : mur parallèle à X à la position z ; 'z' : parallèle à Z à la position x.
    const wall = (axis, pos, start, L, openings, outSign, kind = 'ext') => {
      for (const p of wallPieces(L, H, openings)) {
        const atStart = p.u0 <= 0.001, atEnd = p.u1 >= L - 0.001;
        const yb = p.v0 === 0 ? (kind === 'ext' ? -0.45 : Y0) : Y0 + p.v0, yt = Y0 + p.v1;
        const outer = kind === 'ext' ? bExt : bInt;
        const side = (end) => (kind === 'ext' && end ? bExt : bInt);
        if (axis === 'x') {
          const x0 = start + p.u0, x1 = start + p.u1;
          const z0 = outSign > 0 ? pos - T : pos, z1 = outSign > 0 ? pos : pos + T;
          const zz0 = kind === 'part' ? pos - 0.06 : z0, zz1 = kind === 'part' ? pos + 0.06 : z1;
          Bucket.box({
            pz: outSign > 0 ? outer : bInt, nz: outSign > 0 ? bInt : outer,
            px: side(atEnd), nx: side(atStart), py: p.v1 >= H ? null : bInt, ny: p.v0 > 0 ? bInt : null,
          }, x0, yb, zz0, x1, yt, zz1);
          if (p.v0 < 1.9) colliders.push([(x0 + x1) / 2, (zz0 + zz1) / 2, (x1 - x0) / 2, (zz1 - zz0) / 2 + 0.02, yb, yt]);
        } else {
          const z0 = start + p.u0, z1 = start + p.u1;
          const x0 = outSign > 0 ? pos - T : pos, x1 = outSign > 0 ? pos : pos + T;
          const xx0 = kind === 'part' ? pos - 0.06 : x0, xx1 = kind === 'part' ? pos + 0.06 : x1;
          Bucket.box({
            px: outSign > 0 ? outer : bInt, nx: outSign > 0 ? bInt : outer,
            pz: side(atEnd), nz: side(atStart), py: p.v1 >= H ? null : bInt, ny: p.v0 > 0 ? bInt : null,
          }, xx0, yb, z0, xx1, yt, z1);
          if (p.v0 < 1.9) colliders.push([(xx0 + xx1) / 2, (z0 + z1) / 2, (xx1 - xx0) / 2 + 0.02, (z1 - z0) / 2, yb, yt]);
        }
      }
      // fenêtres (cadre + vitre) et chambranles de porte
      for (const o of openings) {
        const c = (o.u0 + o.u1) / 2, ww = o.u1 - o.u0, hh = o.v1 - o.v0, cy = Y0 + (o.v0 + o.v1) / 2;
        const mid = kind === 'part' ? pos : pos - outSign * T / 2;
        const put = (du, dv, su, sv, depth, bucket) => {
          if (axis === 'x') Bucket.box(allOf(bucket), start + c + du - su / 2, cy + dv - sv / 2, mid - depth / 2, start + c + du + su / 2, cy + dv + sv / 2, mid + depth / 2);
          else Bucket.box(allOf(bucket), mid - depth / 2, cy + dv - sv / 2, start + c + du - su / 2, mid + depth / 2, cy + dv + sv / 2, start + c + du + su / 2);
        };
        const fr = 0.07;
        if (o.win) {
          put(0, hh / 2 - fr / 2, ww, fr, 0.12, bTrim); put(0, -hh / 2 + fr / 2, ww, fr, 0.12, bTrim);
          put(-ww / 2 + fr / 2, 0, fr, hh, 0.12, bTrim); put(ww / 2 - fr / 2, 0, fr, hh, 0.12, bTrim);
          put(0, 0.12, 0.05, hh, 0.06, bTrim); put(0, 0.2, ww, 0.05, 0.06, bTrim);
          put(0, -hh / 2 - 0.04, ww + 0.2, 0.06, T + 0.14, bTrim); // appui
          put(0, 0, ww - 0.05, hh - 0.05, 0.02, bGlass);
          // vitre infranchissable
          if (axis === 'x') colliders.push([start + c, mid, ww / 2, 0.08, Y0 + o.v0, Y0 + o.v1]);
          else colliders.push([mid, start + c, 0.08, ww / 2, Y0 + o.v0, Y0 + o.v1]);
        } else if (o.door) {
          const tw = kind === 'part' ? 0.16 : T + 0.04;
          put(-ww / 2 + 0.04, 0, 0.08, hh, tw, bTrim); put(ww / 2 - 0.04, 0, 0.08, hh, tw, bTrim);
          put(0, hh / 2 - 0.04, ww, 0.08, tw, bTrim);
        }
      }
    };
    const allOf = (b) => ({ px: b, nx: b, py: b, ny: b, pz: b, nz: b });

    // façade (vers la rue, +z local), arrière, côtés, cloison
    wall('x', d / 2, -w / 2, w, [DOOR(doorX + w / 2), WIN(livC - 1.7 + w / 2), WIN(bedC + w / 2)], +1);
    wall('x', -d / 2, -w / 2, w, [WIN(livC + w / 2), WIN(bedC + w / 2)], -1);
    wall('z', -w / 2, -d / 2 + T, d - 2 * T, [WIN((d - 2 * T) / 2)], -1);
    wall('z', w / 2, -d / 2 + T, d - 2 * T, [WIN((d - 2 * T) / 2)], +1);
    wall('z', px, -d / 2 + T, d - 2 * T, [DOOR(d - 2 * T - 1.4)], 0, 'part');

    // dalle + sol
    Bucket.box({ py: bFloor, px: bExt, nx: bExt, pz: bExt, nz: bExt }, -w / 2, -0.45, -d / 2, w / 2, Y0, d / 2);
    colliders.push([0, 0, w / 2, d / 2, -0.45, Y0, true]);
    // marche devant la porte
    Bucket.box({ py: bTrim, px: bTrim, nx: bTrim, pz: bTrim, nz: bTrim }, doorX - 0.9, -0.3, d / 2, doorX + 0.9, Y0 / 2, d / 2 + 0.7);
    colliders.push([doorX, d / 2 + 0.35, 0.9, 0.35, -0.3, Y0 / 2, true]);
    // plafond
    bInt.quad([-w / 2, Y0 + H, -d / 2], [w / 2, Y0 + H, -d / 2], [w / 2, Y0 + H, d / 2], [-w / 2, Y0 + H, d / 2], [0, -1, 0]);
    // pignons
    const rh = d * 0.3, ridge = Y0 + H + rh;
    bExt.tri([-w / 2, Y0 + H, -d / 2], [-w / 2, Y0 + H, d / 2], [-w / 2, ridge, 0], [-1, 0, 0]);
    bExt.tri([w / 2, Y0 + H, d / 2], [w / 2, Y0 + H, -d / 2], [w / 2, ridge, 0], [1, 0, 0]);

    // porte ouverte en bois
    Bucket.box(allOf(bWood), doorX - 0.55, Y0, d / 2 - T - 1.0, doorX - 0.5, Y0 + 2.2, d / 2 - T);

    const add = (key, b, mat, cast = true) => { if (!b.empty) put(key, mat, b.geometry(), HM, cast); };
    add('ext_' + lot.style, bExt, ext[lot.style]);
    add('int', bInt, interior);
    const fi = Math.floor(rnd() * floors.length);
    add('floor' + fi, bFloor, floors[fi], false);
    add('trim', bTrim, trim);
    add('wood', bWood, wood);
    add('glass', bGlass, glass, false);

    // toit à deux pans
    const o = 0.55, slope = rh / (d / 2);
    const ze = d / 2 + o, ye = Y0 + H - o * slope;
    const len = Math.hypot(ze, ridge - ye), ang = Math.atan2(ridge - ye, ze);
    for (const s of [1, -1]) {
      const sl = slab(2.2, w + 2 * o, 0.16, len);
      const mm = HM.clone().multiply(M4(0, (ye + ridge) / 2 + 0.1, s * ze / 2, s * ang));
      put('roof_' + lot.style, ext[lot.style + '_roof'], sl.top, mm);
      put('under', roofUnder, sl.und, mm);
    }
    const cap = slab(1, w + 2 * o, 0.18, 0.36);
    put('under', roofUnder, cap.top, HM.clone().multiply(M4(0, ridge + 0.17, 0)));
    put('under', roofUnder, cap.und, HM.clone().multiply(M4(0, ridge + 0.17, 0)));
    // cheminée
    const ch = new Bucket(2.5);
    Bucket.box(allOf(ch), -0.35, -1.1, -0.35, 0.35, 1.1, 0.35);
    put('ext_' + lot.style, ext[lot.style], ch.geometry(), HM.clone().multiply(M4(w / 2 - 1.6, ridge - 0.5, -d / 4)));

    // ---- mobilier ----
    const furn = [];
    const cr = Math.cos(lot.rot), sr = Math.sin(lot.rot);
    const toWorld = (x, z) => [lot.x + x * cr + z * sr, lot.z - x * sr + z * cr];
    const inner = (id, x, z, rot, scale = 1, y = Y0) => {
      const [wx, wz] = toWorld(x, z);
      inst(id, wx, ground + y, wz, lot.rot + rot, scale);
      furn.push({ id, x, z, rot, scale });
    };
    const wl = -w / 2 + T, wb = -d / 2 + T;
    inner('sofa_02', wl + 0.45, 0.3, Math.PI / 2);
    inner('CoffeeTable_01', wl + 1.75, 0.3, Math.PI / 2, 0.8);
    inner('ArmChair_01', livC + 0.4, wb + 0.7, -0.4);
    inner('wooden_bookshelf_worn', livC - 1.2, wb + 0.32, 0);
    inner('Television_01', px - 0.45, 0.2, -Math.PI / 2, 1.1, Y0 + 0.77);
    inner('ClassicNightstand_01', px - 0.36, 0.2, -Math.PI / 2, 1.1);
    inner('potted_plant_04', wl + 0.3, d / 2 - T - 0.35, 0, 3);
    inner('GothicBed_01', bedC, wb + 1.08, 0);
    inner('ClassicNightstand_01', bedC + 1.15, wb + 0.25, 0);
    inner('painted_wooden_chair_02', bedC + 0.9, d / 2 - T - 1.2, Math.PI * 0.85);
    for (const f of furn) {
      const s = await M.size(f.id);
      const hx = s.x * f.scale / 2, hz = s.z * f.scale / 2;
      const c = Math.cos(f.rot), sn = Math.sin(f.rot);
      // boîte englobante alignée sur la maison
      const ax = Math.abs(hx * c) + Math.abs(hz * sn), az = Math.abs(hx * sn) + Math.abs(hz * c);
      if (s.y * f.scale > 0.3) colliders.push([f.x, f.z, ax * 0.9, az * 0.9, Y0, Y0 + s.y * f.scale, f.id === 'GothicBed_01' || f.id === 'CoffeeTable_01' || f.id === 'sofa_02']);
    }

    // colliders -> monde
    for (const [cx, cz, hx, hz, y0, y1, walk] of colliders) {
      world.addBox(lot.x + cx * cr + cz * sr, lot.z - cx * sr + cz * cr, hx, hz, lot.rot, ground + y0, ground + y1, walk ? { walkable: true } : {});
    }
    HOUSES.push({
      lot, w, d, ground, floorY: ground + Y0, toWorld,
      spots: [toWorld(bedC - 0.2, d / 2 - T - 0.9), toWorld(livC - 0.5, -0.6)], // emplacements de coffres / butin
      door: toWorld(doorX, d / 2 + 1.2),
    });
  }

  // ---- mobilier urbain ----
  const lampSpots = [];
  for (let a = -78; a <= 78; a += 26) {
    if (Math.abs(a) < 12) continue;
    lampSpots.push([a, 7.4, Math.PI], [a + 13, -7.4, 0], [7.4, a, -Math.PI / 2], [-7.4, a + 13, Math.PI / 2]);
  }
  for (const [x, z, r] of lampSpots) {
    if (Math.abs(x) > 82 || Math.abs(z) > 82 || (Math.abs(x) < 10 && Math.abs(z) < 10)) continue;
    inst('street_lamp_01', x, 4.41, z, r, 1.45);
    world.addCircle(x, z, 0.2, 4.4, 10);
  }
  const misc = [
    ['fire_hydrant', 21, 6.6, 0], ['fire_hydrant', -45, -6.6, Math.PI], ['fire_hydrant', 6.6, -40, 0], ['fire_hydrant', -6.6, 61, 0],
    ['metal_trash_can', 33, 7.2, 0], ['metal_trash_can', -62, -7.2, Math.PI], ['metal_trash_can', 7.2, 26, Math.PI / 2], ['metal_trash_can', -7.2, -66, -Math.PI / 2],
  ];
  for (const [id, x, z, r] of misc) {
    inst(id, x, 4.41, z, r);
    world.addCircle(x, z, 0.45, 4.4, 5.3);
  }
  // parc : tables de pique-nique, barils, caisses
  for (const p of PARKS) {
    const y = heightAt(p.x, p.z);
    inst('wooden_picnic_table', p.x - 2, y, p.z + 1, p.rot + 0.3);
    inst('wooden_picnic_table', p.x + 3, y, p.z - 2, p.rot - 0.2);
    world.addBox(p.x - 2, p.z + 1, 1.1, 1.5, p.rot + 0.3, y, y + 0.75);
    world.addBox(p.x + 3, p.z - 2, 1.1, 1.5, p.rot - 0.2, y, y + 0.75);
  }
  // chantier près du parking
  {
    const p = PARKING, y = heightAt(p.x, p.z);
    for (let i = 0; i < 4; i++) {
      const x = p.x - 6 + i * 1.6, z = p.z + 7;
      inst('concrete_road_barrier_02', x, y, z, 0);
      world.addBox(x, z, 0.78, 0.25, 0, y, y + 1.1);
    }
    for (const [dx, dz, id] of [[6, -6, 'Barrel_01'], [6.7, -5.2, 'Barrel_01'], [5.8, -4.3, 'wooden_crate_01'], [-6, -6, 'wooden_crate_01']]) {
      inst(id, p.x + dx, y, p.z + dz, dx);
      world.addCircle(p.x + dx, p.z + dz, 0.4, y, y + 0.9);
    }
  }
  for (const { mat, geos, cast } of merged.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    town.add(mesh);
  }
  const INTERIOR = ['sofa_02', 'CoffeeTable_01', 'ArmChair_01', 'wooden_bookshelf_worn', 'Television_01', 'ClassicNightstand_01', 'potted_plant_04', 'GothicBed_01', 'painted_wooden_chair_02'];
  for (const [id, list] of instances) {
    const meshes = await M.instanced(id, list, town);
    if (INTERIOR.includes(id)) for (const m of meshes) { m.material.envMapIntensity = 0.85; m.castShadow = false; }
  }
  return town;
}
