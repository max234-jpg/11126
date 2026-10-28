// Données de l'île : relief, routes, parcelles du village, types de sol.
import { makeNoise, smoothstep, lerp, clamp } from './noise.js';

export const HALF = 320;            // l'univers va de -320 à +320 m
export const N = 641;               // une valeur de hauteur par mètre
export const WATER = 0;             // niveau de la mer
export const TOWN = { x: 0, z: 0, r: 88, h: 4.2 };
const MOUNTAIN = { x: 140, z: -125 };

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
  const dm = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
  land += 40 * Math.exp(-(dm * dm) / (68 * 68)) * (0.65 + 0.5 * nz.ridged(x * 0.012, z * 0.012, 4));
  const dw = Math.hypot(x + 120, z + 95);
  land += 14 * Math.exp(-(dw * dw) / (55 * 55));
  const dt = Math.hypot(x - TOWN.x, z - TOWN.z);
  land = lerp(land, TOWN.h, smoothstep(TOWN.r + 30, TOWN.r, dt));
  // côte : plage douce puis fond marin
  if (d > 1.0) return Math.max(-14, -2.6 - (d - 1) * 55);
  if (d > 0.9) return lerp(1.1, -2.6, (d - 0.9) / 0.1);
  return lerp(1.1, land, smoothstep(0.9, 0.76, d));
}

// ---------------- Routes ----------------
function ringPoint(a) {
  const r = 0.64 * islandRadius(a);
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
  for (const l of [...LOTS, ...PARKS, PARKING]) {
    if (Math.abs(x - l.x) < 9 + pad && Math.abs(z - l.z) < 9 + pad) return true;
  }
  return false;
}
