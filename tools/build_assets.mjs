// Convertit assets_src/ en paquets jeu/assets/*.js (base64) chargeables depuis file://
// (page chargée par l'application Mac, sans serveur web).
// Usage : node tools/build_assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, resample, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { POLYHAVEN_TEXTURES, POLYHAVEN_MODELS, AMBIENTCG_TEXTURES } from './asset_list.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets_src');
const OUT = path.join(ROOT, 'Battle Royale.app', 'Contents', 'Resources', 'jeu', 'assets');
const UBC = path.join(SRC, 'ubc', 'Universal Base Characters[Standard]');
const ONLY = process.argv[2]; // filtre optionnel (ex: "char")

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(OUT, { recursive: true });

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

// Un paquet = un fichier .js qui enregistre des ressources base64 auprès du chargeur.
function writePack(file, entries) {
  let js = '';
  let bytes = 0;
  for (const [name, mime, buf] of entries) {
    js += `__A(${JSON.stringify(name)},${JSON.stringify(mime)},"${buf.toString('base64')}");\n`;
    bytes += buf.length;
  }
  fs.writeFileSync(path.join(OUT, file), js);
  manifest[file] = js.length;
  console.log(`  ${file.padEnd(34)} ${(bytes / 1e6).toFixed(2)} Mo`);
}

const want = key => !ONLY || key.includes(ONLY);
const webp = (img, q = 82) => img.webp({ quality: q, effort: 5 }).toBuffer();

// ---------- Textures de matériaux ----------
async function materialPack(id, dir, { size = 1024, armFrom = null, onlyColor = false } = {}) {
  const entries = [];
  entries.push([`${id}/diff`, 'image/webp', await webp(sharp(path.join(dir, 'diff.jpg')).resize(size, size))]);
  entries.push([`${id}/nor`, 'image/webp', await webp(sharp(path.join(dir, 'nor.jpg')).resize(size, size), 90)]);
  if (!onlyColor) {
    let arm;
    if (armFrom === 'acg') {
      // R = occlusion, G = rugosité, B = métal (0)
      const half = size / 2;
      const ao = fs.existsSync(path.join(dir, 'ao.jpg'))
        ? await sharp(path.join(dir, 'ao.jpg')).resize(half, half).greyscale().raw().toBuffer()
        : Buffer.alloc(half * half, 255);
      const ro = await sharp(path.join(dir, 'rough.jpg')).resize(half, half).greyscale().raw().toBuffer();
      const px = Buffer.alloc(half * half * 3);
      for (let i = 0; i < half * half; i++) { px[i * 3] = ao[i]; px[i * 3 + 1] = ro[i]; px[i * 3 + 2] = 0; }
      arm = await webp(sharp(px, { raw: { width: half, height: half, channels: 3 } }), 85);
    } else {
      arm = await webp(sharp(path.join(dir, 'arm.jpg')).resize(size / 2, size / 2), 85);
    }
    entries.push([`${id}/arm`, 'image/webp', arm]);
  }
  writePack(`tex_${id}.js`, entries);
}

if (want('tex')) {
  console.log('Textures…');
  const fabrics = ['denim_fabric', 'cotton_jersey', 'jersey_melange', 'fabric_leather_01'];
  for (const id of Object.keys(POLYHAVEN_TEXTURES)) {
    const fabric = fabrics.includes(id);
    await materialPack(id, path.join(SRC, 'textures', id), { size: fabric ? 512 : 1024, onlyColor: fabric });
  }
  for (const id of AMBIENTCG_TEXTURES) await materialPack(id, path.join(SRC, 'textures', id), { armFrom: 'acg' });
}

// ---------- Ciel ----------
if (want('water')) {
  writePack('tex_water.js', [['water/nor', 'image/webp', await webp(sharp(path.join(SRC, 'textures', 'waternormals.jpg')).resize(512, 512), 90)]]);
}

if (want('sky')) {
  console.log('Ciel…');
  writePack('sky.js', [
    ['sky/hdr', 'application/octet-stream', fs.readFileSync(path.join(SRC, 'hdri', 'sky_1k.hdr'))],
    ['sky/jpg', 'image/jpeg', await sharp(path.join(SRC, 'hdri', 'sky_tonemapped.jpg')).resize(4096, 2048).jpeg({ quality: 84, mozjpeg: true }).toBuffer()],
  ]);
}

// ---------- Modèles glTF ----------
async function optimize(doc, { tex = 1024, ratio = 1, anim = false, error = 0.004 } = {}) {
  await doc.transform(
    dedup(),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: error <= 0.004 })] : []),
    ...(anim ? [resample()] : []),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  return Buffer.from(await io.writeBinary(doc));
}

if (want('model')) {
  console.log('Modèles Poly Haven…');
  for (const [id, cfg] of Object.entries(POLYHAVEN_MODELS)) {
    const doc = await io.read(path.join(SRC, 'models', id, `${id}.gltf`));
    writePack(`model_${id}.js`, [[`model/${id}`, 'model/gltf-binary', await optimize(doc, { tex: cfg.tex, ratio: cfg.simplify ?? 1, error: cfg.error ?? 0.004 })]]);
  }
}

if (want('car')) {
  console.log('Voiture…');
  const doc = await io.read(path.join(SRC, 'car', 'CarConcept.glb'));
  writePack('model_car.js', [['model/car', 'model/gltf-binary', await optimize(doc, { tex: 1024, ratio: 0.3, error: 0.01 })]]);
}

// ---------- Animations (squelette universel Quaternius) ----------
const CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land',
  'Swim_Fwd_Loop', 'Swim_Idle_Loop', 'Dance_Loop', 'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot',
  'Pistol_Reload', 'Death01', 'Hit_Chest', 'Driving_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Interact', 'Roll'];
if (want('anim')) {
  console.log('Animations…');
  const doc = await io.read(path.join(SRC, 'ual', 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb'));
  for (const a of doc.getRoot().listAnimations()) if (!CLIPS.includes(a.getName())) a.dispose();
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  writePack('anims.js', [['anims', 'model/gltf-binary', await optimize(doc, { anim: true })]]);
}

// ---------- Personnages + masques de vêtements ----------
// Les personnages de base sont en sous-vêtements : on calcule, à partir des poids de skinning,
// quelles zones de la texture correspondent au torse, aux bras, aux jambes et aux pieds.
// Le jeu peint ensuite de vrais tissus scannés (jean, coton, cuir) sur ces zones.
const REGION = { skin: 0, shirt: 1, sleeve: 2, pants: 3, shoes: 4 };
function boneRegion(name) {
  if (/^(foot|ball)/.test(name)) return REGION.shoes;
  if (/^(thigh|calf|pelvis|root)/.test(name)) return REGION.pants;
  if (/^(spine|clavicle|upperarm)/.test(name)) return REGION.shirt;
  if (/^lowerarm/.test(name)) return REGION.sleeve;
  return REGION.skin;
}

function clothingMask(doc, S) {
  const mask = new Uint8Array(S * S); // 0 = peau
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); const skin = node.getSkin();
    if (!mesh || !skin) continue;
    const joints = skin.listJoints().map(j => j.getName());
    for (const prim of mesh.listPrimitives()) {
      if (!/Superhero/i.test(prim.getMaterial()?.getName() || '')) continue;
      const uv = prim.getAttribute('TEXCOORD_0'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      const idx = prim.getIndices();
      const n = uv.getCount();
      // poids de chaque région par sommet, interpolés par pixel : frontières lisses (ourlets nets)
      const vW = new Float32Array(n * 5);
      const j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
      for (let v = 0; v < n; v++) {
        J.getElement(v, j4); W.getElement(v, w4);
        for (let k = 0; k < 4; k++) vW[v * 5 + boneRegion(joints[j4[k]])] += w4[k];
      }
      const a = [0, 0], b = [0, 0], c = [0, 0];
      for (let t = 0; t < idx.getCount(); t += 3) {
        const i0 = idx.getScalar(t), i1 = idx.getScalar(t + 1), i2 = idx.getScalar(t + 2);
        uv.getElement(i0, a); uv.getElement(i1, b); uv.getElement(i2, c);
        rasterTriW(mask, S, a[0] * S, a[1] * S, b[0] * S, b[1] * S, c[0] * S, c[1] * S, vW, i0, i1, i2);
      }
    }
  }
  // dilatation de quelques pixels pour couvrir les coutures d'UV
  for (let pass = 0; pass < 4; pass++) {
    const src = mask.slice();
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      if (src[i]) continue;
      const nb = src[i - 1] || src[i + 1] || src[i - S] || src[i + S];
      if (nb) mask[i] = nb;
    }
  }
  // Trous fermés (ex. nombril) : un pixel « peau » non relié au bord prend la région voisine.
  const seen = new Uint8Array(S * S); const stack = [];
  for (let i = 0; i < S; i++) stack.push(i, (S - 1) * S + i, i * S, i * S + S - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || mask[i]) continue;
    seen[i] = 1; const x = i % S, y = (i / S) | 0;
    if (x > 0) stack.push(i - 1); if (x < S - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - S); if (y < S - 1) stack.push(i + S);
  }
  for (let y = 0; y < S; y++) { let last = 0; for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (mask[i]) last = mask[i]; else if (!seen[i] && last) mask[i] = last;
  } }
  return mask;
}

function rasterTriW(buf, S, x0, y0, x1, y1, x2, y2, vW, i0, i1, i2) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(S - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(S - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
    const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
    let best = 0, bv = -1;
    for (let r = 0; r < 5; r++) {
      const v = vW[i0 * 5 + r] * w0 + vW[i1 * 5 + r] * w1 + vW[i2 * 5 + r] * w2;
      if (v > bv) { bv = v; best = r; }
    }
    buf[y * S + x] = best;
  }
}

function rasterTri(buf, S, x0, y0, x1, y1, x2, y2, val) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(S - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(S - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
    const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 >= -0.01 && w1 >= -0.01 && w2 >= -0.01) buf[y * S + x] = val;
  }
}

if (want('char')) {
  console.log('Personnages…');
  const dir = path.join(UBC, 'Base Characters', 'Godot - UE');
  // Le glTF référence des images "_png.png" absentes : on crée les copies attendues.
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.png') && !f.endsWith('_png.png')) {
      const alt = path.join(dir, f.replace('.png', '_png.png'));
      if (!fs.existsSync(alt)) fs.copyFileSync(path.join(dir, f), alt);
    }
  }
  for (const who of ['Male', 'Female']) {
    const doc = await io.read(path.join(dir, `Superhero_${who}_FullBody.gltf`));
    const S = 1024;
    const mask = clothingMask(doc, S);
    // Masque : région * 50 dans un PNG en niveaux de gris (lossless)
    const png = await sharp(Buffer.from(mask.map(v => v * 50)), { raw: { width: S, height: S, channels: 1 } }).png().toBuffer();
    // Textures peau originales (pour composer les tenues dans le jeu)
    const body = doc.getRoot().listMaterials().find(m => /Superhero/i.test(m.getName()));
    const baseImg = body.getBaseColorTexture().getImage();
    const norImg = body.getNormalTexture().getImage();
    const entries = [
      [`char/${who}/mask`, 'image/png', png],
      [`char/${who}/skin`, 'image/webp', await webp(sharp(Buffer.from(baseImg)).resize(S, S), 90)],
      [`char/${who}/nor`, 'image/webp', await webp(sharp(Buffer.from(norImg)).resize(S, S), 90)],
    ];
    entries.push([`char/${who}`, 'model/gltf-binary', await optimize(doc, { tex: 1024 })]);
    writePack(`char_${who}.js`, entries);
  }
  const hairDir = path.join(UBC, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)');
  const hairEntries = [];
  for (const h of ['Hair_SimpleParted', 'Hair_Beard', 'Hair_Long', 'Hair_Buns', 'Hair_Buzzed']) {
    const doc = await io.read(path.join(hairDir, `${h}.gltf`));
    hairEntries.push([`hair/${h}`, 'model/gltf-binary', await optimize(doc, { tex: 512 })]);
  }
  writePack('char_hair.js', hairEntries);
}

for (const f of Object.keys(manifest)) if (!fs.existsSync(path.join(OUT, f))) delete manifest[f];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
// Liste chargée par la page : ordre = ordre de chargement
const order = Object.keys(manifest).sort((a, b) => (a === 'sky.js' ? -1 : b === 'sky.js' ? 1 : a.localeCompare(b)));
fs.writeFileSync(path.join(OUT, 'manifest.js'),
  `window.__MANIFEST__=${JSON.stringify(order.map(f => [f, manifest[f]]))};\n`);
const total = Object.values(manifest).reduce((a, b) => a + b, 0);
console.log(`Total : ${(total / 1e6).toFixed(1)} Mo de paquets`);
