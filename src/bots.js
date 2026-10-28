// Bots : explorent l'île, ramassent du butin, fuient la tempête et se battent entre eux et contre toi.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { heightAt, WATER } from './map.js';

const NAMES = ['Lucas', 'Inès', 'Hugo', 'Chloé', 'Nathan', 'Léa', 'Malik', 'Jade', 'Enzo', 'Sarah', 'Yanis', 'Manon', 'Théo', 'Camille', 'Rayan', 'Zoé', 'Adam', 'Lina'];

export class Bot extends Actor {
  constructor(game, skin, idx) {
    super(game, skin, NAMES[idx % NAMES.length]);
    this.target = null;
    this.wp = null;
    this.think = Math.random();
    this.stuck = 0;
    this.lastPos = new THREE.Vector3();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.skill = 0.45 + Math.random() * 0.4;
    this.reaction = 0;
    this.mag = 12; this.reserve = 24;
    this.lod = 0;
  }

  onAttacked(by) { if (by && by.alive && by !== this) { this.target = by; this.reaction = Math.min(this.reaction, 0.15); } }
  onNoise(by) { if (!this.target && by.alive && Math.random() < 0.5) this.wp = by.pos.clone(); }

  canSee(a) {
    const e = this.eye, t = a.eye;
    const d = t.clone().sub(e);
    const L = d.length();
    if (L > 70) return false;
    d.divideScalar(L);
    const hit = this.game.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, L);
    return !hit;
  }

  pickWaypoint() {
    const s = this.game.storm;
    const r = Math.max(8, s.next.r * 0.8);
    for (let i = 0; i < 20; i++) {
      // les bots aiment fouiller les maisons
      let x, z;
      if (Math.random() < 0.35 && this.game.houses.length) {
        const h = this.game.houses[Math.floor(Math.random() * this.game.houses.length)];
        [x, z] = h.door;
      } else {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        x = s.next.x + Math.cos(a) * d; z = s.next.z + Math.sin(a) * d;
      }
      if (heightAt(x, z) > WATER + 0.5 && Math.hypot(x - s.next.x, z - s.next.z) < s.next.r) { this.wp = new THREE.Vector3(x, 0, z); return; }
    }
    this.wp = new THREE.Vector3(s.next.x, 0, s.next.z);
  }

  update(dt) {
    const game = this.game;
    this.updateTimers(dt);
    if (!this.alive) { this.char.update(dt * (this.lod ? 0.5 : 1)); return; }
    const camD = game.camera.position.distanceTo(this.pos);
    this.lod = camD > 140 ? 2 : camD > 60 ? 1 : 0;

    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.35 + Math.random() * 0.3;
      // cible : ennemi visible le plus proche
      let best = null, bd = 55 * (0.7 + this.skill * 0.5);
      for (const a of game.actors) {
        if (a === this || !a.alive) continue;
        const d = a.pos.distanceTo(this.pos);
        if (d < bd && this.canSee(a)) { bd = d; best = a; }
      }
      if (best && best !== this.target) { this.target = best; this.reaction = 0.5 + (1 - this.skill) * 0.6; }
      if (this.target && (!this.target.alive || this.target.pos.distanceTo(this.pos) > 75)) this.target = null;
      // tempête : priorité absolue
      const s = game.storm;
      if (Math.hypot(this.pos.x - s.cur.x, this.pos.z - s.cur.z) > s.cur.r - 4 || !this.wp) this.pickWaypoint();
      // coincé ?
      if (this.lastPos.distanceTo(this.pos) < 0.4) { this.stuck++; if (this.stuck > 3) { this.pickWaypoint(); this.strafe *= -1; this.stuck = 0; this.jumpReq = true; } }
      else this.stuck = 0;
      this.lastPos.copy(this.pos);
      if (this.mag === 0 && !this.target) this.startReload();
    }

    let wx = 0, wz = 0, speed = 0, aiming = false;
    if (this.target && this.target.alive) {
      const t = this.target;
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      this.faceTowards(Math.atan2(dx, dz), dt, 8);
      aiming = true;
      // garder une distance de combat et se déplacer latéralement
      const ideal = 14 + this.skill * 8;
      const fwd = d > ideal + 4 ? 1 : d < ideal - 6 ? -0.7 : 0;
      wx = dx / d * fwd + (-dz / d) * this.strafe * 0.8;
      wz = dz / d * fwd + (dx / d) * this.strafe * 0.8;
      speed = 3.4;
      if (Math.random() < dt * 0.4) this.strafe *= -1;
      this.reaction -= dt;
      if (this.reaction <= 0 && this.mag > 0 && this.canSeeCached(t, dt)) {
        if (this.tryShoot()) {
          // précision : dépend de la distance, du mouvement de la cible et du niveau du bot
          const moving = Math.hypot(t.vel.x, t.vel.z) > 2 ? 0.7 : 1;
          const p = Math.max(0.08, Math.min(0.75, (0.95 - d * 0.017) * this.skill * moving));
          const aim = t.eye.clone();
          aim.y -= 0.35 + Math.random() * 0.4;
          if (Math.random() > p) {
            aim.x += (Math.random() - 0.5) * 2.2; aim.y += (Math.random() - 0.5) * 1.6; aim.z += (Math.random() - 0.5) * 2.2;
          }
          game.combat.fire(this, aim);
          this.cooldown = 0.45 + Math.random() * 0.5 + (1 - this.skill) * 0.4;
        }
      } else if (this.mag === 0) this.startReload();
    } else if (this.wp) {
      const dx = this.wp.x - this.pos.x, dz = this.wp.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.5) { this.wp = null; }
      else {
        wx = dx / d; wz = dz / d;
        const s = game.storm;
        const outside = Math.hypot(this.pos.x - s.cur.x, this.pos.z - s.cur.z) > s.cur.r - 10;
        speed = outside || d > 60 ? 7.2 : 4.4;
        // évitement simple : si bloqué, contourner
        if (this.blocked) { const tx = wx; wx = wx * 0.3 - wz * this.strafe; wz = wz * 0.3 + tx * this.strafe; }
        this.faceTowards(Math.atan2(wx, wz), dt, 6);
      }
    }
    const jump = this.jumpReq; this.jumpReq = false;
    this.move(dt, wx, wz, speed, jump);
    this.aiming = aiming;
    if (this.lod < 2 || Math.random() < 0.3) this.animate(dt, Math.hypot(this.vel.x, this.vel.z), aiming);
    this.sync();
    // animation : moins souvent quand le bot est loin
    this.animAcc = (this.animAcc || 0) + dt;
    const every = this.lod === 0 ? 0 : this.lod === 1 ? 1 / 30 : 1 / 12;
    if (this.animAcc >= every) { this.char.update(this.animAcc); this.animAcc = 0; }
  }

  canSeeCached(t, dt) {
    this.seeT = (this.seeT || 0) - dt;
    if (this.seeT <= 0) { this.seeT = 0.25; this.seeV = this.canSee(t); }
    return this.seeV;
  }
}
