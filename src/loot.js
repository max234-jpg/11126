// Coffres (s'ouvrent vraiment : couvercle animé) et objets ramassables (trousses de soin, munitions).
import * as THREE from 'three';
import * as M from './models.js';
import { mergeByMaterial } from './models.js';
import { heightAt } from './map.js';

export class Loot {
  constructor(game) {
    this.game = game;
    this.chests = [];
    this.items = [];
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  }

  async init(houses) {
    const spots = [];
    for (const h of houses) {
      // un coffre par maison, à l'intérieur
      const [x, z] = h.spots[Math.random() < 0.5 ? 0 : 1];
      spots.push({ x, z, y: h.floorY, rot: h.lot.rot });
    }
    // et quelques coffres dans la nature
    const outdoor = [[120, 60], [-140, 40], [60, -150], [-60, 160], [150, -40], [-100, -130], [95, 130], [-175, -20], [10, 120], [-30, -110]];
    for (const [x, z] of outdoor) spots.push({ x, z, y: this.game.world.groundAt(x, z), rot: Math.random() * 6 });
    const g = await M.model('treasure_chest');
    // coffre fusionné (corps) + couvercle séparé pour l'animation
    const lid0 = g.scene.getObjectByName('treasure_chest_lid');
    const proto = new THREE.Group();
    proto.add(mergeByMaterial(g.scene, g.scene, (o) => o === lid0));
    const lidPivot = new THREE.Group();
    lidPivot.name = 'treasure_chest_lid';
    lidPivot.position.copy(lid0.position);
    lidPivot.add(mergeByMaterial(lid0, lid0));
    proto.add(lidPivot);
    for (const s of spots) {
      const o = proto.clone(true);
      o.position.set(s.x, s.y, s.z);
      o.rotation.y = s.rot;
      o.scale.setScalar(1.1);
      let lid = null;
      o.traverse((c) => { if (c.name === 'treasure_chest_lid') lid = c; });
      this.game.scene.add(o);
      const light = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32).rotateX(-Math.PI / 2), this.glowMat);
      light.position.set(s.x, s.y + 0.03, s.z);
      this.game.scene.add(light);
      this.game.world.addBox(s.x, s.z, 0.53, 0.29, s.rot, s.y, s.y + 0.65);
      this.chests.push({ o, lid, lidRot0: lid ? lid.rotation.x : 0, open: false, anim: 0, x: s.x, z: s.z, y: s.y, light });
    }
  }

  async spawnItem(kind, x, y, z) {
    const id = kind === 'soin' ? 'medical_box' : 'ammo_box';
    const g = await M.model(id);
    const o = g.scene.clone(true);
    o.scale.setScalar(kind === 'soin' ? 1.0 : 1.8);
    const holder = new THREE.Group();
    holder.add(o);
    holder.position.set(x, y + 0.35, z);
    this.game.scene.add(holder);
    this.items.push({ kind, o: holder, x, z, y, t: Math.random() * 6 });
  }

  nearestChest(p, max = 2.2) {
    let best = null, bd = max;
    for (const c of this.chests) {
      if (c.open) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd && Math.abs(c.y - p.y) < 1.5) { bd = d; best = c; }
    }
    return best;
  }

  open(c, actor) {
    c.open = true;
    this.game.scene.remove(c.light);
    const coins = 25 + Math.floor(Math.random() * 40);
    if (actor.isPlayer) {
      this.game.addCoins(coins);
      this.game.audio.chime();
      this.game.ui.toast(`🧰 Coffre ouvert : +${coins} pièces`);
    }
    // butin éjecté devant le coffre
    const r = Math.random();
    const dx = Math.sin(c.o.rotation.y) * 1.1, dz = Math.cos(c.o.rotation.y) * 1.1;
    this.spawnItem(r < 0.55 ? 'munitions' : 'soin', c.x + dx, c.y, c.z + dz);
    if (r > 0.7) this.spawnItem('munitions', c.x + dx * 0.6 + 0.5, c.y, c.z + dz * 0.6);
  }

  update(dt) {
    for (const c of this.chests) {
      if (c.open && c.anim < 1 && c.lid) {
        c.anim = Math.min(1, c.anim + dt * 2.2);
        c.lid.rotation.x = c.lidRot0 - 1.9 * (1 - Math.pow(1 - c.anim, 3));
      }
      if (!c.open) c.light.material.opacity = 0.25 + Math.sin(performance.now() / 300) * 0.1;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.o.rotation.y += dt * 1.5;
      it.o.position.y = it.y + 0.35 + Math.sin(it.t * 2.5) * 0.08;
      for (const a of this.game.actors) {
        if (!a.alive || a.inCar) continue;
        if (Math.hypot(a.pos.x - it.x, a.pos.z - it.z) < 1.1 && Math.abs(a.pos.y - it.y) < 1.6) {
          if (it.kind === 'soin') {
            if (a.isPlayer) { this.game.medkits++; this.game.ui.toast('🩹 Trousse de soin ramassée (H pour l’utiliser)'); }
            else a.health = Math.min(100, a.health + 40);
          } else {
            a.reserve += 18;
            if (a.isPlayer) this.game.ui.toast('🔫 +18 munitions');
          }
          if (a.isPlayer) this.game.audio.chime([880, 1320]);
          this.game.scene.remove(it.o);
          this.items.splice(i, 1);
          break;
        }
      }
    }
  }

  // un bot cherche un coffre proche à ouvrir
  botTryOpen(bot) {
    const c = this.nearestChest(bot.pos, 2.5);
    if (c) this.open(c, bot);
  }

  dropAt(actor) {
    const { x, z } = actor.pos;
    const y = Math.max(heightAt(x, z), actor.pos.y);
    this.spawnItem('munitions', x + 0.6, y, z);
    if (Math.random() < 0.5) this.spawnItem('soin', x - 0.6, y, z + 0.3);
  }
}
