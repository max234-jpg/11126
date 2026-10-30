// Inventaire de la scène : nombre d'objets dessinés et de triangles par groupe.
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require((process.env.NODE_PATH || '/usr/local/lib/node_modules') + '/playwright')); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('file://' + path.join(root, 'Battle Royale.app/Contents/Resources/jeu/index.html') + '?q=basse');
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
const r = await page.evaluate(() => {
  window.__stop = true;
  const g = window.__game;
  g.startMatch(new URLSearchParams('bots=15'));
  const out = {};
  for (const top of g.scene.children) {
    let calls = 0, tris = 0;
    top.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
      const geo = o.geometry;
      const t = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const n = o.isInstancedMesh ? o.count : (geo.isInstancedBufferGeometry ? geo.instanceCount : 1);
      const groups = Array.isArray(o.material) ? Math.max(1, geo.groups.length) : 1;
      calls += groups; tris += t * n;
    });
    const k = (top.name || top.type) + (top.isSkinnedMesh ? '' : '');
    out[k] = out[k] || { n: 0, calls: 0, tris: 0 };
    out[k].n++; out[k].calls += calls; out[k].tris += tris;
  }
  const veg = {};
  g.scene.getObjectByName('végétation').children.forEach((o) => {
    const t = o.geometry.index.count / 3;
    const k = (o.material.map?.image?.src || o.material.name || 'mat').slice(-20) + ' ' + Math.round(t);
    veg[k] = (veg[k] || 0) + t * o.count;
  });
  out.__veg = veg;
  return out;
});
console.log(Object.entries(r.__veg).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' -> ' + (v / 1e6).toFixed(2) + 'M').join('\n'));
delete r.__veg;
const rows = Object.entries(r).sort((a, b) => b[1].tris - a[1].tris);
for (const [k, v] of rows) console.log(k.padEnd(24), String(v.n).padStart(4), 'objets', String(v.calls).padStart(5), 'appels', (v.tris / 1e6).toFixed(2).padStart(7), 'M tri');
await browser.close();
