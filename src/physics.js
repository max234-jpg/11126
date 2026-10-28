// Monde de collisions simple et rapide : boîtes orientées (murs, meubles, voitures),
// cylindres (troncs, rochers), planchers praticables, relief.
import { heightAt } from './map.js';

const CELL = 12;

export class World {
  constructor() {
    this.cells = new Map();
    this.all = [];
    this.dynamic = new Set();
  }

  key(i, j) { return i * 73856093 ^ j * 19349663; }

  insert(o) {
    const r = o.bound;
    const i0 = Math.floor((o.x - r) / CELL), i1 = Math.floor((o.x + r) / CELL);
    const j0 = Math.floor((o.z - r) / CELL), j1 = Math.floor((o.z + r) / CELL);
    o.cells = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(o);
      o.cells.push(k);
    }
  }

  remove(o) {
    for (const k of o.cells || []) {
      const a = this.cells.get(k);
      const i = a.indexOf(o);
      if (i >= 0) a.splice(i, 1);
    }
    o.cells = [];
  }

  // Boîte orientée autour de l'axe Y. hx/hz = demi-dimensions, rot = angle (rad), y0..y1 = hauteur.
  addBox(x, z, hx, hz, rot, y0, y1, extra = {}) {
    const o = { type: 'box', x, z, hx, hz, rot, c: Math.cos(rot), s: Math.sin(rot), y0, y1, bound: Math.hypot(hx, hz), ...extra };
    this.insert(o); this.all.push(o);
    return o;
  }

  addCircle(x, z, r, y0, y1, extra = {}) {
    const o = { type: 'circle', x, z, r, y0, y1, bound: r, ...extra };
    this.insert(o); this.all.push(o);
    return o;
  }

  // Met à jour une boîte mobile (voiture)
  moveBox(o, x, z, rot, y0, y1) {
    this.remove(o);
    o.x = x; o.z = z; o.rot = rot; o.c = Math.cos(rot); o.s = Math.sin(rot); o.y0 = y0; o.y1 = y1;
    this.insert(o);
  }

  near(x, z, r = 2) {
    const out = new Set();
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.cells.get(this.key(i, j));
      if (a) for (const o of a) out.add(o);
    }
    return out;
  }

  // Hauteur du sol praticable sous (x,z) pour des pieds situés à y
  groundAt(x, z, y = 1e9, step = 0.55) {
    let g = heightAt(x, z);
    for (const o of this.near(x, z, 0.5)) {
      if (!o.walkable || o.y1 > y + step) continue;
      if (o.type === 'box') {
        const dx = x - o.x, dz = z - o.z;
        const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
        if (Math.abs(lx) <= o.hx && Math.abs(lz) <= o.hz && o.y1 > g) g = o.y1;
      } else if (Math.hypot(x - o.x, z - o.z) <= o.r && o.y1 > g) g = o.y1;
    }
    return g;
  }

  // Repousse un cylindre (rayon r, de y à y+h) hors des obstacles. Retourne true si collision.
  collide(p, r, h, step = 0.55, ignore = null) {
    let hit = false;
    for (const o of this.near(p.x, p.z, r + 1)) {
      if (o === ignore || o.ghost) continue;
      if (o.y1 <= p.y + step || o.y0 >= p.y + h) continue;
      if (o.type === 'circle') {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
        if (d < m && d > 1e-6) { p.x = o.x + dx / d * m; p.z = o.z + dz / d * m; hit = true; }
      } else {
        // coordonnées locales de la boîte (rotation inverse)
        const dx = p.x - o.x, dz = p.z - o.z;
        const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
        const cx = Math.max(-o.hx, Math.min(o.hx, lx)), cz = Math.max(-o.hz, Math.min(o.hz, lz));
        let ex = lx - cx, ez = lz - cz;
        let d = Math.hypot(ex, ez);
        let nx, nz;
        if (d < 1e-6) {
          // centre à l'intérieur : sortie par la face la plus proche
          const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
          if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; d = -px; } else { nx = 0; nz = Math.sign(lz) || 1; d = -pz; }
        } else { nx = ex / d; nz = ez / d; }
        if (d < r) {
          const push = r - d;
          const wx = nx * o.c + nz * o.s, wz = -nx * o.s + nz * o.c;
          p.x += wx * push; p.z += wz * push; hit = true;
          if (o.onHit) o.onHit();
        }
      }
    }
    return hit;
  }

  // Lancer de rayon contre les obstacles statiques et le relief.
  raycast(ox, oy, oz, dx, dy, dz, max, ignore = null) {
    let best = max, bestObj = null;
    const steps = Math.ceil(max / CELL) + 1;
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(max, s * CELL);
      for (const o of this.near(ox + dx * t, oz + dz * t, CELL * 0.75)) {
        if (seen.has(o) || o === ignore || o.noRay) continue;
        seen.add(o);
        const d = o.type === 'box' ? rayBox(o, ox, oy, oz, dx, dy, dz) : rayCyl(o, ox, oy, oz, dx, dy, dz);
        if (d !== null && d < best) { best = d; bestObj = o; }
      }
      if (t > best) break;
    }
    // relief : marche par pas de 0.5 m
    for (let t = 0.3; t < best; t += 0.5) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (y < heightAt(x, z)) { best = t; bestObj = { type: 'terrain' }; break; }
    }
    return bestObj ? { dist: best, obj: bestObj } : null;
  }
}

function rayBox(o, ox, oy, oz, dx, dy, dz) {
  const rx = ox - o.x, rz = oz - o.z;
  const lx = rx * o.c - rz * o.s, lz = rx * o.s + rz * o.c;
  const ldx = dx * o.c - dz * o.s, ldz = dx * o.s + dz * o.c;
  let tmin = -Infinity, tmax = Infinity;
  const slab = (p, d, a, b) => {
    if (Math.abs(d) < 1e-9) return p >= a && p <= b;
    let t1 = (a - p) / d, t2 = (b - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    return tmin <= tmax;
  };
  if (!slab(lx, ldx, -o.hx, o.hx) || !slab(oy, dy, o.y0, o.y1) || !slab(lz, ldz, -o.hz, o.hz)) return null;
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}

function rayCyl(o, ox, oy, oz, dx, dy, dz) {
  const fx = ox - o.x, fz = oz - o.z;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - o.r * o.r;
  if (a < 1e-9) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return c < 0 ? 0 : null;
  const y = oy + dy * t;
  return y >= o.y0 && y <= o.y1 ? t : null;
}
