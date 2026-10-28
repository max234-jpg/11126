// Télécharge toutes les ressources sources (licences CC0 / CC-BY) dans assets_src/.
// Usage : node tools/fetch_assets.mjs
// Les fichiers déjà présents ne sont pas retéléchargés.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { POLYHAVEN_TEXTURES, POLYHAVEN_MODELS, AMBIENTCG_TEXTURES, HDRI } from './asset_list.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets_src');
fs.mkdirSync(SRC, { recursive: true });

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log('  ↓', path.relative(ROOT, dest));
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

async function phFiles(id) {
  const res = await fetch('https://api.polyhaven.com/files/' + id);
  if (!res.ok) throw new Error('Poly Haven: ' + id);
  return res.json();
}

async function polyhavenTexture(id, res) {
  const files = await phFiles(id);
  const maps = { diff: 'Diffuse', nor: 'nor_gl', arm: 'arm' };
  for (const [short, key] of Object.entries(maps)) {
    const entry = files[key]?.[res]?.jpg;
    if (!entry) throw new Error(`${id}: carte ${key} ${res} absente`);
    await download(entry.url, path.join(SRC, 'textures', id, `${short}.jpg`));
  }
}

async function polyhavenModel(id, res) {
  const files = await phFiles(id);
  const g = files.gltf?.[res]?.gltf;
  if (!g) throw new Error(`${id}: glTF ${res} absent`);
  const dir = path.join(SRC, 'models', id);
  await download(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include)) await download(f.url, path.join(dir, rel));
}

async function ambientcgTexture(id) {
  const dir = path.join(SRC, 'textures', id);
  if (fs.existsSync(path.join(dir, 'diff.jpg'))) return;
  const zip = path.join(SRC, 'tmp', id + '.zip');
  await download(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip);
  const tmp = path.join(SRC, 'tmp', id);
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
  fs.mkdirSync(dir, { recursive: true });
  const f = s => path.join(tmp, `${id}_1K-JPG_${s}.jpg`);
  fs.copyFileSync(f('Color'), path.join(dir, 'diff.jpg'));
  fs.copyFileSync(f('NormalGL'), path.join(dir, 'nor.jpg'));
  fs.copyFileSync(f('Roughness'), path.join(dir, 'rough.jpg'));
  if (fs.existsSync(f('AmbientOcclusion'))) fs.copyFileSync(f('AmbientOcclusion'), path.join(dir, 'ao.jpg'));
  console.log('  ↓', id);
}

// itch.io : téléchargement « gratuit » officiel des packs Quaternius (CC0).
async function itchPack(slug, dest) {
  if (fs.existsSync(dest)) return;
  const jar = {};
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const keep = res => {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      jar[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return res;
  };
  const page = await (keep(await fetch(`https://quaternius.itch.io/${slug}`, { headers: { cookie: cookie() } }))).text();
  const csrf = page.match(/csrf_token" value="([^"]+)"/)[1];
  const r1 = await (keep(await fetch(`https://quaternius.itch.io/${slug}/download_url`, {
    method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' },
    body: 'csrf_token=' + encodeURIComponent(csrf),
  }))).json();
  const dlPage = await (keep(await fetch(r1.url, { headers: { cookie: cookie() } }))).text();
  const uploadId = dlPage.match(/data-upload_id="(\d+)"/)[1];
  const csrf2 = dlPage.match(/csrf_token" value="([^"]+)"/)[1];
  const key = r1.url.split('/download/')[1];
  const r2 = await (keep(await fetch(`https://quaternius.itch.io/${slug}/file/${uploadId}?source=game_download&key=${key}`, {
    method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' },
    body: 'csrf_token=' + encodeURIComponent(csrf2),
  }))).json();
  await download(r2.url, dest);
}

console.log('Textures Poly Haven…');
for (const [id, res] of Object.entries(POLYHAVEN_TEXTURES)) await polyhavenTexture(id, res);
console.log('Textures ambientCG…');
for (const id of AMBIENTCG_TEXTURES) await ambientcgTexture(id);
console.log('Modèles Poly Haven…');
for (const [id, cfg] of Object.entries(POLYHAVEN_MODELS)) await polyhavenModel(id, cfg.res || '1k');
console.log('HDRI…');
{
  const files = await phFiles(HDRI);
  await download(files.hdri['1k'].hdr.url, path.join(SRC, 'hdri', 'sky_1k.hdr'));
  await download(files.tonemapped.url, path.join(SRC, 'hdri', 'sky_tonemapped.jpg'));
}
console.log('Normales d\'eau (three.js, MIT)…');
await download('https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/waternormals.jpg', path.join(SRC, 'textures', 'waternormals.jpg'));
console.log('Voiture (Khronos CarConcept, CC-BY 4.0)…');
await download('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb',
  path.join(SRC, 'car', 'CarConcept.glb'));
console.log('Personnages + animations Quaternius (CC0)…');
for (const [slug, name] of [['universal-animation-library', 'ual'], ['universal-base-characters', 'ubc']]) {
  const zip = path.join(SRC, 'tmp', name + '.zip');
  const out = path.join(SRC, name);
  if (!fs.existsSync(out)) {
    await itchPack(slug, zip);
    fs.mkdirSync(out, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zip, '-d', out]);
  }
}
console.log('Terminé.');
