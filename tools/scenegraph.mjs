import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const pr=(n,d)=>{ const m=n.getMesh(); console.log(' '.repeat(d*2)+n.getName()+(m?` [mesh ${m.getName()} ${m.listPrimitives().map(p=>p.getMaterial()?.getName()).join('|')}]`:'')+' t='+n.getTranslation().map(v=>v.toFixed(2))+' s='+n.getScale().map(v=>v.toFixed(2))); n.listChildren().forEach(c=>pr(c,d+1)); };
for (const s of doc.getRoot().listScenes()) s.listChildren().forEach(n=>pr(n,0));
