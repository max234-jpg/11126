// Données de l'île : relief, routes, parcelles du village, types de sol.
import { makeNoise, smoothstep, lerp, clamp } from './noise.js';

export const HALF = 320;            // l'univers va de -320 à +320 m
export const N = 641;               // une valeur de hauteur par mètre
export const WATER = 0;             // niveau de la mer
export const TOWN = { x: 0, z: 0, r: 88, h: 4.2 };

// ---------------- Massif du nord-est : plateau, lac d'altitude, falaise et cascades ----------------
const M_ANGLE = -0.73;
const M_DIR = { x: -Math.cos(M_ANGLE), z: -Math.sin(M_ANGLE) };   // de la falaise vers le centre de l'île
const M_LAT = { x: -M_DIR.z, z: M_DIR.x };
const M_C = { x: Math.cos(M_ANGLE) * 142, z: Math.sin(M_ANGLE) * 142 }; // pied du sommet de la falaise
export const MASSIF = { c: M_C, dir: M_DIR, lat: M_LAT, angle: M_ANGLE };
// repère local (u vers l'île, v latéral) -> monde
export function massifToWorld(u, v) { return [M_C.x + M_DIR.x * u + M_LAT.x * v, M_C.z + M_DIR.z * u + M_LAT.z * v]; }
export const LAKES = [
  { name: 'Lac du Belvédère', u: -17, v: 0, ru: 15, rv: 13, level: 56 },
  { name: 'Bassin des Cascades', u: 14, v: 0, ru: 12, rv: 22, level: 9.5 },
].map((l) => { const [x, z] = massifToWorld(l.u, l.v); return { ...l, x, z }; });
export const FALLS = [
  { u: 0.2, v: 0, top: 55.7, bottom: 9.5, width: 8.5 },
  { u: 1.2, v: -15, top: 40, bottom: 9.5, width: 3.2 },
  { u: 1.0, v: 13, top: 47, bottom: 9.5, width: 2.2 },
];

function massifShape(x, z, land) {
  const dx = x - M_C.x, dz = z - M_C.z;
  const u = dx * M_DIR.x + dz * M_DIR.z, v = dx * M_LAT.x + dz * M_LAT.z, av = Math.abs(v);
  if (u > 80 || u < -130 || av > 130) return null;
  const rid = nz.ridged(x * 0.016, z * 0.016, 5), rid2 = nz2.ridged(x * 0.03 + 4, z * 0.03, 4);
  // corps de la montagne et sommets (crêtes en bruit « ridged »)
  const su = u < -28 ? 40 : 54;
  const env = Math.exp(-((u + 28) ** 2) / (su * su) - (v * v) / (52 * 52));
  const body = env * (74 * (0.7 + 0.42 * rid) + 8 * rid2);
  const peaks = 112 * Math.exp(-((u + 47) ** 2) / (27 * 27) - ((v - 9) ** 2) / (38 * 38)) * (0.66 + 0.5 * rid);
  let top = Math.max(body, peaks);
  // corniche du lac d'altitude
  const eS = ((u + 15) / 24) ** 2 + (v / 27) ** 2;
  if (eS < 1) {
    const shelf = Math.max(57 + 1.2 * nz2.fbm(x * 0.05, z * 0.05, 2), peaks * smoothstep(0.55, 1.0, eS));
    top = lerp(top, shelf, smoothstep(1.0, 0.78, eS));
  }
  const eL = ((u + 17) / 15) ** 2 + (v / 13) ** 2;
  if (eL < 1) top = 52 + 4.6 * Math.pow(eL, 0.7);
  if (u > -4 && u < 1.5 && av < 3.6) top = Math.min(top, 55.3 + av * 0.12); // échancrure de la grande cascade
  // loin du massif (top faible) on garde le relief d'origine, mer comprise
  let S = lerp(land, Math.max(land, top), smoothstep(1, 8, top));
  // gorge des cascades : falaise verticale puis bassin
  if (u > -1) {
    const eP = ((u - 14) / 12) ** 2 + (v / 22) ** 2;
    const foot = eP < 1 ? 5 + 5.6 * eP : lerp(10.6, land, smoothstep(26, 46, u)); // la gorge s'ouvre vers l'île
    // ligne de falaise irrégulière (avancées et renfoncements), droite seulement sous la grande cascade
    const calm = (1 - Math.exp(-(((v + 15) / 4.5) ** 2))) * (1 - Math.exp(-(((v - 13) / 4) ** 2))); // paroi lisse derrière les petites cascades
    const jag = (3.2 * nz.noise(v * 0.07, 1.7) + 1.1 * nz2.noise(v * 0.27, 3.3)) * smoothstep(3, 10, av) * calm;
    const uc = u - jag, wdt = 4.5 + 2.5 * (0.5 + 0.5 * nz2.noise(v * 0.11, 9.1));
    const front = lerp(top, foot, smoothstep(0, wdt, uc));
    const cw = (1 - smoothstep(22, 34, av)) * (1 - smoothstep(44, 60, u));
    S = lerp(S, front, cw);
  }
  return { S, w: 1 };
}

// niveau de l'eau à un endroit (mer, lac d'altitude ou bassin)
export function waterLevelAt(x, z) {
  for (const l of LAKES) {
    const dx = x - l.x, dz = z - l.z;
    const u = dx * M_DIR.x + dz * M_DIR.z, v = dx * M_LAT.x + dz * M_LAT.z;
    if ((u / (l.ru + 2)) ** 2 + (v / (l.rv + 2)) ** 2 < 1) return l.level;
  }
  return WATER;
}

const nz = makeNoise(7);
const nz2 = makeNoise(31);

export function islandRadius(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return 222 + 24 * nz.noise(c * 1.4 + 3, s * 1.4) + 11 * nz.noise(c * 4 + 9, s * 4);
}

function baseHeight(x, z) {
  const ang = Math.atan2(z, x);
  const d = Math.hypot(x, z) / islandRadius(ang);
  let land = Math.max(2.7, 5.6 + 4.2 * nz.fbm(x * 0.006, z * 0.006, 4)) + 1.2 * nz2.fbm(x * 0.03, z * 0.03, 3) + 0.6;
  const dw = Math.hypot(x + 120, z + 95);
  land += 14 * Math.exp(-(dw * dw) / (55 * 55));
  const dt = Math.hypot(x - TOWN.x, z - TOWN.z);
  land = lerp(land, TOWN.h, smoothstep(TOWN.r + 30, TOWN.r, dt));
  // côte : plage douce puis fond marin
  let h;
  if (d > 1.0) h = Math.max(-14, -2.6 - (d - 1) * 55);
  else if (d > 0.9) h = lerp(1.1, -2.6, (d - 0.9) / 0.1);
  else h = lerp(1.1, land, smoothstep(0.9, 0.76, d));
  // le massif s'ajoute au relief côtier : il plonge naturellement dans la mer
  const m = massifShape(x, z, h);
  return m ? lerp(h, m.S, m.w) : h;
}

// ---------------- Routes ----------------
function ringPoint(a) {
  // le boulevard contourne le massif par l'intérieur
  let da = a - M_ANGLE; da = Math.atan2(Math.sin(da), Math.cos(da));
  const r = 0.64 * islandRadius(a) * (1 - 0.34 * Math.exp(-((da / 0.42) ** 2)));
  return [Math.cos(a) * r, Math.sin(a) * r];
}
const RING_N = 64;
const ring = [];
for (let i = 0; i <= RING_N; i++) ring.push(ringPoint((i / RING_N) * Math.PI * 2));
const east = ringPoint(0), west = ringPoint(Math.PI), south = ringPoint(Math.PI / 2), north = ringPoint(-Math.PI / 2);

function densify(pts, step = 2) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// lissage Chaikin pour des courbes réalistes
function chaikin(pts, it = 3, closed = false) {
  let p = pts;
  for (let k = 0; k < it; k++) {
    const o = closed ? [] : [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      o.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]);
    }
    if (closed) o.push(o[0]); else o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}

export const ROADS = [
  { name: 'Boulevard côtier', width: 8, closed: true, pts: densify(chaikin(ring, 3, true)), town: false },
  { name: 'Grand-Rue', width: 10, pts: densify([west, [-60, 0], [60, 0], east]), town: true },
  { name: 'Avenue du Port', width: 10, pts: densify([north, [0, -60], [0, 60], south]), town: true },
];

// élévation des routes : relief de base lissé le long du tracé
for (const r of ROADS) {
  const raw = r.pts.map(([x, z]) => Math.max(1.9, baseHeight(x, z)));
  const win = 14;
  r.elev = raw.map((_, i) => {
    let s = 0, c = 0;
    for (let k = -win; k <= win; k++) {
      let j = i + k;
      if (r.closed) j = (j + raw.length) % raw.length; else if (j < 0 || j >= raw.length) continue;
      s += raw[j]; c++;
    }
    return s / c;
  });
}

// ---------------- Village ----------------
// Parcelles : maisons explorables alignées sur les deux rues principales.
export const LOTS = [];
{
  const styles = ['stucco', 'brick', 'beige', 'yellow'];
  let k = 0;
  for (const along of [-72, -52, -30, 30, 52, 72]) {
    for (const side of [-1, 1]) {
      // le long de la Grand-Rue (axe X) — façade vers la rue
      LOTS.push({ x: along, z: side * 16.5, rot: side > 0 ? Math.PI : 0, style: styles[k++ % 4], seed: k });
      // le long de l'Avenue du Port (axe Z)
      LOTS.push({ x: side * 16.5, z: along, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, style: styles[k++ % 4], seed: k });
    }
  }
}
// quelques parcelles deviennent un parc / un parking pour aérer le village
export const PARKS = [LOTS.splice(5, 1)[0], LOTS.splice(13, 1)[0]];
export const PARKING = LOTS.splice(18, 1)[0];
// centre-ville : les parcelles les plus proches du carrefour deviennent des immeubles avec boutiques
export const BUILDING_LOTS = [];
for (let i = LOTS.length - 1; i >= 0; i--) {
  if (Math.abs(LOTS[i].x) === 30 || Math.abs(LOTS[i].z) === 30) BUILDING_LOTS.push(LOTS.splice(i, 1)[0]);
}
// tours d'habitation derrière les rues principales (silhouette de la ville)
export const TOWERS = [
  { x: 47, z: 47, floors: 11, seed: 1 }, { x: -47, z: 47, floors: 9, seed: 2 },
  { x: -47, z: -47, floors: 10, seed: 3 }, { x: 47, z: -47, floors: 8, seed: 4 },
];

// ---------------- Grille de hauteurs ----------------
export const H = new Float32Array(N * N);      // hauteur finale
export const ROAD_D = new Float32Array(N * N); // distance au bord de route le plus proche (m, <0 = sur la route)
const ROAD_E = new Float32Array(N * N);

{
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    H[j * N + i] = baseHeight(i - HALF, j - HALF);
  }
  ROAD_D.fill(1e9);
  const dist = new Float32Array(N * N).fill(1e9);
  for (const r of ROADS) {
    const hw = r.width / 2, reach = hw + 9;
    for (let s = 0; s < r.pts.length - 1; s++) {
      const [ax, az] = r.pts[s], [bx, bz] = r.pts[s + 1];
      const ea = r.elev[s], eb = r.elev[s + 1];
      const minI = Math.max(0, Math.floor(Math.min(ax, bx) - reach + HALF)), maxI = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + reach + HALF));
      const minJ = Math.max(0, Math.floor(Math.min(az, bz) - reach + HALF)), maxJ = Math.min(N - 1, Math.ceil(Math.max(az, bz) + reach + HALF));
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
        const px = i - HALF, pz = j - HALF;
        const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
        const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
        const k = j * N + i;
        if (d < dist[k]) { dist[k] = d; ROAD_E[k] = lerp(ea, eb, t); ROAD_D[k] = d - hw; }
      }
    }
  }
  for (let k = 0; k < N * N; k++) {
    if (ROAD_D[k] > 9) continue;
    const w = smoothstep(9, 1.2, ROAD_D[k]);
    H[k] = lerp(H[k], ROAD_E[k] - 0.06, w);
  }
}

export function heightAt(x, z) {
  const fx = clamp(x + HALF, 0, N - 1.001), fz = clamp(z + HALF, 0, N - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k = j * N + i;
  const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function roadDist(x, z) {
  const i = clamp(Math.round(x + HALF), 0, N - 1), j = clamp(Math.round(z + HALF), 0, N - 1);
  return ROAD_D[j * N + i];
}

export function normalAt(x, z) {
  const e = 1;
  const nx = heightAt(x - e, z) - heightAt(x + e, z);
  const nz_ = heightAt(x, z - e) - heightAt(x, z + e);
  const l = Math.hypot(nx, 2 * e, nz_);
  return [nx / l, (2 * e) / l, nz_ / l];
}

// zone de village (trottoirs, pas de végétation)
export function inTown(x, z, pad = 0) {
  return Math.abs(x) < 82 + pad && Math.abs(z) < 82 + pad && (Math.abs(x) < 26 + pad || Math.abs(z) < 26 + pad);
}

export function nearLot(x, z, pad = 0) {
  for (const l of [...LOTS, ...PARKS, PARKING, ...BUILDING_LOTS]) {
    if (Math.abs(x - l.x) < 10 + pad && Math.abs(z - l.z) < 10 + pad) return true;
  }
  for (const t of TOWERS) if (Math.abs(x - t.x) < 11 + pad && Math.abs(z - t.z) < 11 + pad) return true;
  return false;
}
