// Capture d'écran du jeu en local (Chromium headless, rendu logiciel SwiftShader).
// Usage : node tests/shot.mjs "<query>" sortie.png [frames] [w] [h]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.NODE_PATH + '/playwright')); }
import path from 'node:path';
const [query = '', out = 'tests/screenshots/shot.png', frames = '3', w = '960', h = '540'] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('file://' + path.join(root, 'JOUER.html') + (query ? '?' + query : ''));
const t0 = Date.now();
try {
  await page.waitForFunction(n => (window.__frames || 0) >= n || /Erreur/.test(document.getElementById('boot-msg')?.textContent || ''), +frames, { timeout: 240000, polling: 500 });
} catch (e) { logs.push('TIMEOUT waiting frames'); }
if (process.env.EVAL) {
  console.log('EVAL', await page.evaluate(process.env.EVAL));
  const f0 = await page.evaluate(() => window.__frames);
  await page.waitForFunction(n => window.__frames >= n, f0 + +(process.env.AFTER || 4), { timeout: 400000, polling: 300 });
}
await page.evaluate(() => { window.__stop = true; });
await new Promise(r => setTimeout(r, 1500));
console.log(logs.filter(l => !l.includes('GPU stall')).slice(0, 40).join('\n'));
await page.screenshot({ path: out, timeout: 400000 });
console.log('temps', ((Date.now() - t0) / 1000).toFixed(1), 's');
await browser.close();
