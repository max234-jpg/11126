// Routes asphaltées avec marquage au sol, trottoirs et passages piétons du village.
import * as THREE from 'three';
import * as A from './assets.js';
import { ROADS } from './map.js';
import { Bucket, allFaces } from './geom.js';

// pas de marquage au milieu des carrefours
function markAt(x, z, road) {
  if (Math.hypot(x, z) < 11) return false;
  for (const o of ROADS) {
    if (o === road) continue;
    for (let i = 0; i < o.pts.length; i += 2) {
      const [px, pz] = o.pts[i];
      if (Math.abs(px - x) < o.width / 2 + 1.5 && Math.abs(pz - z) < o.width / 2 + 1.5 && Math.hypot(px - x, pz - z) < o.width / 2 + 1.5) return false;
    }
  }
  return true;
}

export async function createRoads(engine, world) {
  const asphalt = (await A.pbr('asphalt_02')).clone();
  asphalt.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoad; varying vec3 vRoadUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoadUv = aRoad;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoadUv;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // x = position latérale (m depuis le centre), y = distance (m), z = largeur
          float lat = vRoadUv.x, along = vRoadUv.y, hw = abs(vRoadUv.z) * 0.5; float mark = step(0.0, vRoadUv.z);
          float aa = fwidth(lat) * 1.2;
          float center = (1.0 - smoothstep(0.07, 0.07 + aa, abs(lat))) * step(0.5, fract(along / 6.0));
          float edge = 1.0 - smoothstep(0.07, 0.07 + aa, abs(abs(lat) - (hw - 0.45)));
          float paint = max(center, edge) * mark;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.8, 0.72), paint * 0.92);
          paintMask = paint;
        }`)
      .replace('void main() {', 'float paintMask = 0.0;\nvoid main() {')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, paintMask);');
  };
  asphalt.color.setRGB(0.78, 0.78, 0.8);

  // Une bande de route par tracé ; décalage de polygone pour éviter le scintillement aux carrefours
  ROADS.forEach((r, ri) => {
    const hw = r.width / 2;
    const P = [], UV = [], RD = [], IDX = [];
    let along = 0;
    const n = r.pts.length;
    for (let i = 0; i < n; i++) {
      const [x, z] = r.pts[i];
      const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (i > 0) along += Math.hypot(x - r.pts[i - 1][0], z - r.pts[i - 1][1]);
      const y = r.elev[i] + 0.05 + ri * 0.004;
      // bande en 4 colonnes pour garder une surface lisse
      for (let k = 0; k <= 4; k++) {
        const s = -hw + (k / 4) * r.width;
        P.push(x - tz * s, y, z + tx * s);
        UV.push((x - tz * s) / 6, (z + tx * s) / 6);
        RD.push(s, along, markAt(x, z, r) ? r.width : -r.width);
      }
      if (i > 0) for (let k = 0; k < 4; k++) {
        const a0 = (i - 1) * 5 + k, b0 = i * 5 + k;
        IDX.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('aRoad', new THREE.Float32BufferAttribute(RD, 3));
    g.setIndex(IDX);
    g.computeVertexNormals();
    const mat = asphalt.clone();
    mat.onBeforeCompile = asphalt.onBeforeCompile;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1 - ri;
    mat.polygonOffsetUnits = -2 - ri * 2;
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = r.name;
    engine.scene.add(mesh);
  });

  // Trottoirs du village (bordure de 15 cm) le long des deux rues principales
  const pave = await A.pbr('concrete_pavement', { repeat: [1, 1] });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xb9b5ab, roughness: 0.85 });
  const top = new Bucket(2.5), side = new Bucket(1);
  const y0 = 4.2 + 0.05, y1 = y0 + 0.16;
  const add = (x0, z0, x1, z1) => {
    Bucket.box({ py: top, px: side, nx: side, pz: side, nz: side }, x0, y0 - 0.2, z0, x1, y1, z1);
    world.addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, y0 - 0.2, y1, { walkable: true, noRay: true });
  };
  for (const s of [-1, 1]) {
    for (const [a, b] of [[-84, -8], [8, 84]]) {
      add(a, s > 0 ? 5 : -8, b, s > 0 ? 8 : -5);   // Grand-Rue
      add(s > 0 ? 5 : -8, a, s > 0 ? 8 : -5, b);   // Avenue du Port
    }
  }
  const sw = new THREE.Mesh(top.geometry(), pave);
  sw.receiveShadow = true;
  const curb = new THREE.Mesh(side.geometry(), curbMat);
  curb.receiveShadow = true;
  engine.scene.add(sw, curb);

  // Passages piétons au carrefour central
  const zebra = new Bucket(1);
  const zy = 4.2 + 0.075;
  for (const [cx, cz, alongX] of [[0, 7.5, true], [0, -7.5, true], [7.5, 0, false], [-7.5, 0, false]]) {
    for (let k = -4; k <= 4; k++) {
      const o = k * 1.0;
      const [x0, z0, x1, z1] = alongX ? [cx + o - 0.25, cz - 1.6, cx + o + 0.25, cz + 1.6] : [cx - 1.6, cz + o - 0.25, cx + 1.6, cz + o + 0.25];
      zebra.quad([x0, zy, z1], [x1, zy, z1], [x1, zy, z0], [x0, zy, z0], [0, 1, 0]);
    }
  }
  const zebraMat = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8 });
  const zm = new THREE.Mesh(zebra.geometry(), zebraMat);
  zm.receiveShadow = true;
  engine.scene.add(zm);
}
