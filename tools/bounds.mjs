import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const id of process.argv.slice(2)) {
  const doc = await io.read(`assets_src/models/${id}/${id}.gltf`);
  const b = getBounds(doc.getRoot().listScenes()[0]);
  console.log(id.padEnd(28), 'size', b.max.map((v,i)=>(v-b.min[i]).toFixed(2)).join(' x '), ' min', b.min.map(v=>v.toFixed(2)).join(','));
}
