// Test automatique : ouvre la page du jeu (celle de l'application) en file:// dans Chromium headless, lance une partie
// et simule le jeu image par image (sans rendu) pour vérifier la logique.
// Usage : node tests/smoke.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require((process.env.NODE_PATH || '/usr/local/lib/node_modules') + '/playwright')); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
// simule le pont de l'application Mac (window.webkit.messageHandlers.jeu)
await page.addInitScript(() => {
  window.__appMessages = [];
  window.webkit = { messageHandlers: { jeu: { postMessage: (m) => window.__appMessages.push(m) } } };
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('file://' + path.join(root, 'Battle Royale.app/Contents/Resources/jeu/index.html') + '?q=basse');
await page.waitForFunction(() => window.__game && window.__game.state === 'menu' || /Erreur/.test(document.getElementById('boot-msg')?.textContent || ''), null, { timeout: 300000 });
await page.evaluate(() => { window.__stop = true; });

const results = await page.evaluate(() => {
  const g = window.__game;
  const out = {};
  const ok = (name, cond, info = '') => { out[name] = (cond ? 'OK ' : 'ÉCHEC ') + info; };
  const run = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { g.frame(dt); } };
  // hasard reproductible : le test donne toujours le même résultat
  let seed = 12345;
  Math.random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  g.startMatch(new URLSearchParams('bots=15'));
  ok('partie lancée', g.state === 'playing' && g.actors.length === 16, `${g.actors.length} joueurs`);

  // marche vers l'avant
  const p = g.player;
  const start = p.pos.clone();
  g.input.keys.add('KeyW');
  run(60);
  g.input.keys.delete('KeyW');
  ok('déplacement', p.pos.distanceTo(start) > 3, `${p.pos.distanceTo(start).toFixed(1)} m en 2 s, anim=${p.char.current}`);

  // saut
  g.input.pressed.add('Space'); g.frame(1 / 30);
  run(5);
  const air = !p.onGround;
  run(40);
  ok('saut', air && p.onGround, 'retombe au sol');

  // coffre : on se place devant un coffre et on appuie sur E
  const c = g.loot.chests.find((c) => !c.open);
  p.setPosition(c.x + 1.0, c.z); p.pos.y = c.y; run(2);
  const coins0 = g.save.coins;
  g.input.pressed.add('KeyE'); g.frame(1 / 30); run(30);
  ok('coffre', c.open && g.save.coins > coins0, `+${g.save.coins - coins0} pièces, ${g.loot.items.length} objets au sol`);

  // voiture : monter, accélérer, descendre
  const car = g.vehicles.cars[0];
  p.setPosition(car.pos.x + 2.2, car.pos.z); run(2);
  g.input.pressed.add('KeyE'); g.frame(1 / 30);
  const inCar = p.inCar === car;
  const c0 = car.pos.clone();
  g.input.keys.add('KeyW'); run(90); g.input.keys.delete('KeyW');
  const moved = car.pos.distanceTo(c0);
  g.input.pressed.add('KeyE'); g.frame(1 / 30);
  ok('voiture', inCar && moved > 8 && !p.inCar, `${moved.toFixed(1)} m parcourus, ${(Math.abs(car.speed) * 3.6).toFixed(0)} km/h à la sortie`);

  // nage : téléportation dans le lagon
  let wx = 0, wz = 0;
  for (let a = 0; a < 6.28; a += 0.1) { const x = Math.cos(a) * 245, z = Math.sin(a) * 245; if (g.world.groundAt(x, z) < -2) { wx = x; wz = z; break; } }
  p.setPosition(wx, wz); p.pos.y = 0; run(30);
  g.input.keys.add('KeyW'); run(20); g.input.keys.delete('KeyW');
  p.root.updateMatrixWorld(true);
  const headY = p.char.bones.Head.getWorldPosition(p.pos.clone()).y;
  ok('nage', p.swimming && p.char.current.startsWith('swim') && headY > -0.25, `anim=${p.char.current}, tête à ${headY.toFixed(2)} m du niveau de l'eau, racine ${p.pos.y.toFixed(2)} actions ${Object.entries(p.char.actions).filter(([k, a]) => a.isRunning()).map(([k, a]) => k + ':' + a.getEffectiveWeight().toFixed(2)).join(',')}`);

  // tir : un bot devant le joueur
  p.setPosition(0, 40); p.health = 100; run(2);
  const b = g.bots[0];
  b.setPosition(0, 30); b.health = 100; b.alive = true;
  p.yaw = Math.PI; p.camYaw = 0; p.camPitch = -0.06;
  run(2);
  const hp0 = b.health;
  b.update = () => {}; // le bot reste immobile pendant le test de tir
  for (let i = 0; i < 40; i++) { g.input.buttons = 1 | 4; g.frame(1 / 30); }
  delete b.update;
  g.input.buttons = 0;
  ok('tir', b.health < hp0 || !b.alive, `santé du bot ${hp0} -> ${Math.max(0, b.health).toFixed(0)}, munitions ${p.mag}/${p.reserve}` + (b.health < hp0 ? '' : ` [joueur ${p.pos.toArray().map((v) => v.toFixed(1))} cam ${g.camera.position.toArray().map((v) => v.toFixed(1))} bot ${b.pos.toArray().map((v) => v.toFixed(1))} voitures ${g.vehicles.cars.map((c) => c.pos.x.toFixed(0) + ',' + c.pos.z.toFixed(0)).join(' ')}]`));

  // application Mac : capture de la souris par l'app et caméra pilotée par ses déplacements
  {
    if (g.state !== 'playing') g.resume();
    g.input.lock();
    const yaw0 = p.camYaw;
    window.__nativeMouse(120, 0); g.frame(1 / 30);
    const turned = Math.abs(p.camYaw - yaw0) > 0.05;
    window.__nativeUnlocked(); g.frame(1 / 30);
    const paused = g.state === 'paused';
    g.resume();
    ok('app Mac (souris)', turned && paused && window.__appMessages.includes('lock') && document.querySelector('[data-act=quitapp]'),
      `messages ${window.__appMessages.join(',')}, rotation ${turned}, pause à la perte du focus ${paused}`);
  }

  // danse
  g.input.pressed.add('KeyB'); g.frame(1 / 30); run(10);
  ok('danse', p.char.current === 'dance');
  g.input.pressed.add('KeyB'); g.frame(1 / 30);

  // simulation longue : les bots se battent, la tempête se referme
  p.health = 1e9; // le joueur est invincible pour observer la partie
  const r0 = g.storm.cur.r;
  run(30 * 160);
  const alive = g.actors.filter((a) => a.alive).length;
  ok('tempête', g.storm.cur.r < r0, `rayon ${r0} -> ${g.storm.cur.r.toFixed(0)} m (phase ${g.storm.phase})`);
  ok('bots actifs', alive < 16, `${alive} survivants après 160 s`);
  const nan = g.actors.some((a) => !isFinite(a.pos.x) || !isFinite(a.pos.y));
  ok('positions valides', !nan);
  return out;
});
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(20), v);
if (errors.length) console.log('Erreurs JS :\n' + errors.slice(0, 10).join('\n'));
const failed = Object.values(results).some((v) => v.startsWith('ÉCHEC')) || errors.length > 0;
await browser.close();
process.exit(failed ? 1 : 0);
