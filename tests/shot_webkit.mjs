// Capture d'écran avec WebKit (le moteur de Safari) : l'image est lue directement dans le canvas.
// Usage : node tests/shot_webkit.mjs "<query>" sortie.png ["code JS exécuté avant la capture"] [largeur] [hauteur]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let webkit;
try { ({ webkit } = require('playwright')); } catch { ({ webkit } = require((process.env.NODE_PATH || '/usr/local/lib/node_modules') + '/playwright')); }

const [query = 'q=moyenne&auto&bots=4', out = 'tests/screenshots/webkit.png', code = '', w = '1280', h = '720'] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const b = await webkit.launch();
const page = await b.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
const t0 = Date.now();
await page.goto('file://' + path.join(root, 'JOUER.html') + '?' + query);
await page.waitForFunction(() => window.__game && ['playing', 'menu'].includes(window.__game.state) && window.__frames > 3, null, { timeout: 400000 });
const url = await page.evaluate(async (code) => {
  const g = window.__game;
  window.__stop = true;
  if (code) await (0, eval)(`(async (g, p) => { ${code} })`)(g, g.player);
  for (let i = 0; i < 4; i++) g.frame(1 / 30);
  g.engine.render();
  // HUD dessiné par-dessus le rendu 3D (si présent)
  return g.engine.renderer.domElement.toDataURL('image/png');
}, code);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(`capture ${out} en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await b.close();
