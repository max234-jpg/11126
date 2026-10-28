import fs from 'node:fs';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8'); let b64; global.__A = (n, m, b) => { if (m.includes('gltf')) b64 = b; };
  eval(src);
  const doc = await io.readBinary(new Uint8Array(Buffer.from(b64, 'base64')));
  let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
  console.log(f.split('/').pop(), Math.round(t));
}
