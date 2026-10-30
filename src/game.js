// Boucle de jeu et règles du Battle Royale.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { createSky } from './sky.js';
import { createTerrain, heightTexture } from './terrain.js';
import { createWater } from './water.js';
import { createRoads } from './roads.js';
import { createTown, HOUSES } from './town.js';
import { createVegetation } from './vegetation.js';
import { createGrass } from './grass.js';
import { World } from './physics.js';
import { LOTS, PARKING, BUILDING_LOTS, TOWERS, heightAt, islandRadius } from './map.js';
import { createBuildings } from './buildings.js';
import { loadCharacters, SKINS, Character } from './character.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Combat } from './combat.js';
import { Storm } from './storm.js';
import { Loot } from './loot.js';
import { Vehicles } from './vehicles.js';
import { createTrafficLights } from './trafficlights.js';
import { createWaterfalls } from './waterfall.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'br-san-calma-v1';
const BOTS = 15;

export class Game {
  constructor() {
    this.state = 'loading';
    this.save = { coins: 100, owned: ['eclaireur', 'aventuriere', 'ranger'], skin: 'eclaireur', quality: null, sens: 1, volume: 0.7 };
    try { Object.assign(this.save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* stockage indisponible */ }
    this.medkits = 0;
  }

  persist() {
    this.save.sens = this.input.sensitivity;
    this.save.volume = this.audio.volume;
    this.save.quality = this.engine.qualityName;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* navigation privée */ }
  }

  progress(msg, pct) {
    const m = document.getElementById('boot-msg'), b = document.getElementById('boot-bar');
    if (m) m.textContent = msg;
    if (b) b.style.width = (70 + pct * 30).toFixed(0) + '%';
    return new Promise((r) => setTimeout(r, 0));
  }

  async init() {
    const params = new URLSearchParams(location.search);
    this.engine = new Engine(document.body);
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;
    const isMac = /Mac/.test(navigator.platform || navigator.userAgent);
    this.engine.setQuality(params.get('q') || this.save.quality || (isMac ? 'haute' : 'moyenne'));
    this.input = new Input(this.engine.renderer.domElement);
    this.input.sensitivity = this.save.sens || 1;
    if (params.has('stats') || this.save.stats) this.engine.showStats(true);
    this.audio = new Audio();
    this.audio.volume = this.save.volume ?? 0.7;
    this.world = new World();

    await this.progress('Ciel et lumière…', 0.05);
    this.sky = await createSky(this.engine);
    this.sky.setShadowSize(this.engine.q.shadow);
    await this.progress('Relief et textures du sol…', 0.15);
    const terrain = await createTerrain(this.engine);
    const hTex = heightTexture();
    this.water = await createWater(this.engine, this.sky, hTex);
    this.falls = createWaterfalls(this.engine, this.audio);
    await this.progress('Routes et village…', 0.3);
    await createRoads(this.engine, this.world);
    await createTown(this.engine, this.world, this);
    this.houses = HOUSES;
    await createBuildings(this.engine, this.world, HOUSES);
    this.lights = createTrafficLights(this.engine, this.world);
    this.parking = PARKING;
    await this.progress('Forêts et rochers…', 0.5);
    this.veg = await createVegetation(this.engine, this.world);
    this.grass = createGrass(this.engine, hTex, [...HOUSES.map((h) => ({ x: h.lot.x, z: h.lot.z, h: 11, bare: h.bare })), ...BUILDING_LOTS.map((l) => ({ ...l, h: 9.5 })), ...TOWERS.map((t) => ({ ...t, h: 10 }))], terrain.diffArray);
    this.grass.setDensity(this.engine.q.grass);
    this.grass.setSun(this.sky.sunDir);
    this.engine.onQuality = (q) => { this.grass.setDensity(q.grass); this.sky.setShadowSize(q.shadow); };
    await this.progress('Personnages et animations…', 0.7);
    await loadCharacters();
    this.combat = new Combat(this);
    this.storm = new Storm(this);
    this.storm.wall.visible = false;
    this.loot = new Loot(this);
    await this.loot.init(HOUSES);
    await this.progress('Voitures…', 0.85);
    this.vehicles = new Vehicles(this);
    await this.vehicles.init();
    this.ui = new UI(this);
    this.actors = [];
    this.bots = [];
    this.player = null;
    this.menuCam = 0;
    this.time = 0;
    await this.progress('Compilation des shaders…', 0.95);
    // précompilation pour éviter les saccades au premier affichage
    this.camera.position.set(60, 40, 90); this.camera.lookAt(0, 4, 0);
    this.engine.renderer.compile(this.scene, this.camera);
    document.getElementById('boot').style.display = 'none';
    this.state = 'menu';
    this.ui.showMenu(true);
    this.menuPreview();
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pause();
      else if (e.code === 'Escape' && this.state === 'paused') this.resume();
      if (e.code === 'KeyM' && (this.state === 'playing')) { this.bigMap = !this.bigMap; this.ui.toggleMap(this.bigMap); }
      if (e.code === 'F3' || e.code === 'KeyP') { this.save.stats = !this.engine.stats; this.engine.showStats(this.save.stats); this.persist(); }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && !this.ended) this.pause();
    });
    if (params.has('auto')) this.startMatch(params);
    this.loop();
  }

  skin(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }

  // Aperçu 3D du personnage dans le menu (tenue équipée)
  menuPreview(celebrate = false) {
    const skin = this.skin(this.save.skin);
    if (!this.preview) { this.preview = new Character(skin); this.scene.add(this.preview.root); }
    else if (this.preview.skin.id !== skin.id) this.preview.setSkin(skin);
    const x = -26, z = -6.6;
    this.preview.root.position.set(x, this.world.groundAt(x, z, 10), z);
    this.preview.root.visible = true;
    this.preview.play(celebrate ? 'dance' : 'idle', 0.3);
    this.previewDance = celebrate ? 4 : 0;
  }

  equipSkin(id) {
    if (!this.save.owned.includes(id)) return;
    this.save.skin = id;
    this.persist();
    if (this.state === 'menu') this.menuPreview(true);
    this.ui.toast('👕 Tenue équipée : ' + this.skin(id).nom);
  }

  buySkin(id) {
    const s = this.skin(id);
    if (this.save.owned.includes(id)) return;
    if (this.save.coins < s.prix) { this.ui.toast('🪙 Pas assez de pièces'); return; }
    this.save.coins -= s.prix;
    this.save.owned.push(id);
    this.save.skin = id;
    this.persist();
    if (this.state === 'menu') this.menuPreview(true);
    this.audio.chime([523, 659, 784, 1046]);
    this.ui.toast('🛍️ Tenue achetée et équipée : ' + s.nom);
    this.ui.updateWallet();
  }

  addCoins(n) { this.save.coins += n; this.persist(); }

  setQuality(q) { this.engine.setQuality(q); this.save.qualityManual = true; this.persist(); }

  // Ajustement automatique : si le Mac n'atteint pas ~30 images/s, on baisse la qualité.
  autoQuality(raw) {
    if (this.state !== 'playing' || this.save.qualityManual || /[?&]q=/.test(location.search) || (this.qChecks || 0) >= 2 || window.__stop) return;
    this.fpsT = (this.fpsT || 0) + raw; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsT < 6) return;
    const fps = this.fpsN / this.fpsT;
    this.fpsT = 0; this.fpsN = 0;
    const order = ['basse', 'moyenne', 'haute', 'ultra'];
    const i = order.indexOf(this.engine.qualityName);
    if (fps < 30 && i > 0) {
      this.engine.setQuality(order[i - 1]);
      this.persist();
      this.ui.toast(`⚙️ Qualité ajustée automatiquement : ${order[i - 1]} (${fps.toFixed(0)} img/s)`);
      this.qChecks = (this.qChecks || 0) + 1;
    } else this.qChecks = 2;
  }

  clearMatch() {
    for (const a of this.actors) this.scene.remove(a.root);
    for (const c of this.vehicles.cars) { if (c.driver) this.vehicles.exit(c.driver); }
    this.actors = []; this.bots = []; this.player = null;
  }

  startMatch(params = new URLSearchParams()) {
    this.clearMatch();
    this.ended = false;
    this.medkits = 0;
    this.storm.reset();
    this.storm.wall.visible = true;
    this.ui.hideEnd();
    // le joueur commence au village, devant une maison
    const h = HOUSES[Math.floor(Math.random() * HOUSES.length)];
    this.player = new Player(this, this.skin(this.save.skin));
    // devant la porte, face à la rue (l'avant de la maison pointe vers +Z local)
    const fx = Math.sin(h.lot.rot), fz = Math.cos(h.lot.rot);
    this.player.setPosition(h.door[0] + fx * 3.5, h.door[1] + fz * 3.5);
    this.player.yaw = h.lot.rot; this.player.camYaw = h.lot.rot + Math.PI;
    if (params.has('px')) this.player.setPosition(+params.get('px'), +params.get('pz'));
    if (params.has('pyaw')) { this.player.yaw = +params.get('pyaw'); this.player.camYaw = this.player.yaw + Math.PI; }
    this.actors.push(this.player);
    const nBots = params.has('bots') ? +params.get('bots') : BOTS;
    for (let i = 0; i < nBots; i++) {
      const skin = SKINS[(i * 3 + 1) % SKINS.length];
      const b = new Bot(this, skin, i);
      // répartis sur toute l'île, sur la terre ferme
      for (let k = 0; k < 40; k++) {
        const a = (i / nBots) * Math.PI * 2 + Math.random() * 0.4, d = 60 + Math.random() * 110;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (heightAt(x, z) > 2.5 && d < islandRadius(a) * 0.85) { b.setPosition(x, z); break; }
      }
      if (params.has('botnear') && i === 0) b.setPosition(this.player.pos.x + 6, this.player.pos.z - 10);
      this.actors.push(b); this.bots.push(b);
    }
    this.state = 'playing';
    if (this.preview) this.preview.root.visible = false;
    this.ui.showMenu(false);
    this.ui.showPause(false);
    this.ui.menuOpen = false;
    this.input.enabled = true;
    this.input.lock();
    this.audio.start();
    this.ui.toast('🏝️ Bienvenue à San Calma ! Ouvre les coffres, survis à la tempête, sois le dernier debout.');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause(true);
    this.input.unlock();
  }

  resume() {
    this.state = 'playing';
    this.ui.showPause(false);
    this.input.lock();
  }

  toMenu() {
    this.clearMatch();
    this.ui.hideEnd();
    this.ui.showPause(false);
    this.state = 'menu';
    this.storm.wall.visible = false;
    this.ui.showMenu(true);
    this.menuPreview();
    this.input.unlock();
    this.input.enabled = false;
  }

  interact(p) {
    const car = this.vehicles.nearest(p.pos);
    const chest = this.loot.nearestChest(p.pos);
    if (chest && (!car || Math.hypot(chest.x - p.pos.x, chest.z - p.pos.z) < 1.6)) { this.loot.open(chest, p); p.char.oneShotUpper('interact'); return; }
    if (car) { this.vehicles.enter(p, car); return; }
  }

  useMedkit(p) {
    if (this.medkits <= 0) { this.ui.toast('Aucune trousse de soin'); return; }
    if (p.health >= 100) { this.ui.toast('Santé déjà au maximum'); return; }
    this.medkits--;
    p.health = Math.min(100, p.health + 50);
    this.audio.chime([523, 784]);
    this.ui.toast('🩹 +50 santé');
  }

  onDeath(victim, killer) {
    const alive = this.actors.filter((a) => a.alive).length;
    if (killer && killer !== victim) killer.kills++;
    const k = killer && killer !== victim ? killer.name : '🌪️ La tempête';
    this.ui.feed(`<b>${k}</b> a éliminé <b>${victim.name}</b>`);
    if (victim.inCar) this.vehicles.exit(victim);
    this.loot.dropAt(victim);
    if (killer?.isPlayer) { this.addCoins(50); this.ui.toast(`🎯 ${victim.name} éliminé ! +50 pièces`); }
    if (victim.isPlayer) {
      this.ended = true;
      setTimeout(() => {
        this.input.unlock();
        this.ui.showEnd('ÉLIMINÉ', `Classement : <b>#${alive + 1}</b> sur ${this.actors.length}<br>Éliminations : <b>${victim.kills}</b><br>Éliminé par ${k}`);
      }, 2200);
    } else if (alive === 1 && this.player.alive) {
      this.ended = true;
      this.addCoins(300);
      this.player.dancing = true;
      setTimeout(() => {
        this.input.unlock();
        this.ui.showEnd('🏆 VICTOIRE ROYALE !', `Tu es le dernier survivant de San Calma.<br>Éliminations : <b>${this.player.kills}</b> · +300 pièces`);
      }, 2500);
    }
  }

  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const raw = this.engine.clock.getDelta();
      const dt = Math.min(0.05, raw);
      this.time += dt;
      this.autoQuality(raw);
      this.frame(dt);
      window.__frames = (window.__frames || 0) + 1;
    };
    tick();
  }

  frame(dt) {
    const { input } = this;
    if (this.state === 'playing' || (this.state === 'paused' && false)) {
      this.player.update(dt, input);
      this.player.char.update(dt);
      for (const b of this.bots) b.update(dt);
      this.vehicles.update(dt);
      this.storm.update(dt);
      this.loot.update(dt);
      this.combat.update(dt);
      // dégâts de la tempête
      for (const a of this.actors) if (a.alive && this.storm.outside(a.pos)) {
        a.stormAcc = (a.stormAcc || 0) + dt * this.storm.dps;
        if (a.stormAcc >= 1) { const d = Math.floor(a.stormAcc); a.stormAcc -= d; if (a.damage(d, null) && a.isPlayer) this.audio.hurt(); }
      }
      // les bots ouvrent les coffres qu'ils croisent
      for (const b of this.bots) if (b.alive && Math.random() < dt) this.loot.botTryOpen(b);
      // invite d'interaction
      const p = this.player;
      let prompt = null;
      if (p.alive && !p.inCar) {
        if (this.loot.nearestChest(p.pos)) prompt = '<kbd>E</kbd> Ouvrir le coffre';
        else if (this.vehicles.nearest(p.pos)) prompt = '<kbd>E</kbd> Monter dans la voiture';
      } else if (p.inCar) prompt = '<kbd>E</kbd> Descendre';
      this.ui.prompt(prompt);
      this.ui.updateHud(this, dt);
      this.ui.drawMinimap(p, this.storm, p.camYaw);
      if (this.bigMap) this.ui.drawBigMap(p, this.storm);
      // secousse caméra
      if (this.ui.shakeAmt > 0) {
        this.ui.shakeAmt = Math.max(0, this.ui.shakeAmt - dt * 2);
        this.camera.position.x += (Math.random() - 0.5) * this.ui.shakeAmt * 0.2;
        this.camera.position.y += (Math.random() - 0.5) * this.ui.shakeAmt * 0.2;
      }
    } else if (this.state === 'menu') {
      // caméra de présentation autour du personnage (placé à droite de l'écran)
      this.menuCam += dt * 0.12;
      const c = this.preview.root.position, a = 0.9 + Math.sin(this.menuCam) * 0.55, R = 3.1;
      this.camera.position.set(c.x + Math.sin(a) * R, c.y + 1.5, c.z + Math.cos(a) * R);
      const rx = Math.cos(a), rz = -Math.sin(a), off = innerWidth > innerHeight ? 0.95 : 0;
      this.camera.lookAt(c.x - rx * off, c.y + 1.15, c.z - rz * off);
      this.preview.root.rotation.y = a;
      this.preview.update(dt);
      if (this.previewDance > 0) { this.previewDance -= dt; if (this.previewDance <= 0) this.preview.play('idle', 0.4); }
    }
    const focus = this.player && this.state !== 'menu' ? this.player.pos : this.camera.position;
    this.sky.follow(focus);
    this.water.update(this.time);
    this.lights.update(dt);
    this.falls.update(this.time, dt, this.camera.position);
    this.veg.update(this.time);
    this.grass.update(this.time, this.camera.position);
    input.endFrame();
    if (!window.__stop) this.engine.render();
  }
}
