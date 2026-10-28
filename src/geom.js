// Petit constructeur de géométrie : boîtes et quadrilatères avec UV en mètres (textures à l'échelle réelle).
import * as THREE from 'three';

export class Bucket {
  constructor(texSize = 2) {
    this.p = []; this.n = []; this.uv = []; this.i = [];
    this.texSize = texSize;
  }

  // quad p0..p3 (sens anti-horaire vu depuis la normale), UV planaires selon l'axe dominant
  quad(p0, p1, p2, p3, n, uvs = null) {
    const base = this.p.length / 3;
    const ts = this.texSize;
    for (const [k, v] of [p0, p1, p2, p3].entries()) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(n[0], n[1], n[2]);
      if (uvs) this.uv.push(uvs[k][0], uvs[k][1]);
      else {
        const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
        if (ay >= ax && ay >= az) this.uv.push(v[0] / ts, v[2] / ts);
        else if (ax >= az) this.uv.push(v[2] / ts * -Math.sign(n[0]), v[1] / ts);
        else this.uv.push(v[0] / ts * Math.sign(n[2]), v[1] / ts);
      }
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(p0, p1, p2, n) {
    const base = this.p.length / 3;
    const ts = this.texSize;
    for (const v of [p0, p1, p2]) {
      this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]);
      const ax = Math.abs(n[0]), az = Math.abs(n[2]);
      this.uv.push(ax > az ? v[2] / ts : v[0] / ts, v[1] / ts);
    }
    this.i.push(base, base + 1, base + 2);
  }

  // Boîte alignée : faces = { px, nx, py, ny, pz, nz } -> bucket (ou null pour omettre)
  static box(faces, x0, y0, z0, x1, y1, z1) {
    const f = (b, ...a) => b && b.quad(...a);
    f(faces.px, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    f(faces.nx, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    f(faces.py, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    f(faces.ny, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    f(faces.pz, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    f(faces.nz, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    return g;
  }

  get empty() { return this.i.length === 0; }
}

// Boîte avec un seul matériau
export function allFaces(b) { return { px: b, nx: b, py: b, ny: b, pz: b, nz: b }; }

// Découpe un mur de longueur L et hauteur H en rectangles pleins autour des ouvertures.
// openings : [{ u0, u1, v0, v1 }] (en mètres le long du mur / en hauteur)
export function wallPieces(L, H, openings) {
  const ops = [...openings].sort((a, b) => a.u0 - b.u0);
  const out = [];
  let u = 0;
  for (const o of ops) {
    if (o.u0 > u) out.push({ u0: u, u1: o.u0, v0: 0, v1: H });
    if (o.v0 > 0) out.push({ u0: o.u0, u1: o.u1, v0: 0, v1: o.v0 });
    if (o.v1 < H) out.push({ u0: o.u0, u1: o.u1, v0: o.v1, v1: H });
    u = o.u1;
  }
  if (u < L) out.push({ u0: u, u1: L, v0: 0, v1: H });
  return out;
}
