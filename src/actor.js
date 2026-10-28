// Acteur = joueur ou bot : physique (marche, course, saut, nage), santé, munitions, animations.
import * as THREE from 'three';
import { Character } from './character.js';
import { heightAt, WATER, HALF } from './map.js';

export const RADIUS = 0.36, HEIGHT = 1.8;
const SWIM_DEPTH = 1.3;   // profondeur d'eau à partir de laquelle on nage

export class Actor {
  constructor(game, skin, name, isPlayer = false) {
    this.game = game;
    this.name = name;
    this.isPlayer = isPlayer;
    this.char = new Character(skin);
    this.root = this.char.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;                 // orientation du corps
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.mag = 12; this.magSize = 12; this.reserve = 36;
    this.reloading = 0;
    this.cooldown = 0;
    this.onGround = true;
    this.swimming = false;
    this.inCar = null;
    this.dancing = false;
    this.aiming = false;
    this.kills = 0;
    this.lastHit = 0;
    this.stepTimer = 0;
    this.airTime = 0;
    this.landTimer = 0;
    game.scene.add(this.root);
  }

  setPosition(x, z) {
    this.pos.set(x, Math.max(heightAt(x, z), this.game.world.groundAt(x, z)), z);
    this.vel.set(0, 0, 0);
    this.sync();
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z); }

  // wish : direction monde (x,z) normalisée * intensité 0..1 ; speed m/s
  move(dt, wishX, wishZ, speed, jump) {
    const world = this.game.world;
    const ground = heightAt(this.pos.x, this.pos.z);
    const depth = WATER - ground;
    this.swimming = depth > SWIM_DEPTH && this.pos.y < WATER - SWIM_DEPTH + 0.6;
    if (this.swimming) {
      const target = WATER - SWIM_DEPTH;
      this.vel.y = 0;
      this.pos.y += (target - this.pos.y) * Math.min(1, dt * 4);
      speed = Math.min(speed, 4.2);
    }
    // accélération horizontale
    const accel = this.onGround || this.swimming ? 14 : 3;
    const tx = wishX * speed, tz = wishZ * speed;
    this.vel.x += (tx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, accel * dt);
    if (!this.swimming) {
      if (jump && this.onGround) {
        this.vel.y = 6.4; this.onGround = false;
        this.char.play('jumpStart', 0.08);
        this.jumpT = 0;
      }
      this.vel.y -= 22 * dt;
    }
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    const lim = HALF - 4;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    this.blocked = world.collide(this.pos, RADIUS, HEIGHT, 0.5, this.inCar?.collider);
    // sol (relief ou plancher)
    const g = world.groundAt(this.pos.x, this.pos.z, prevY);
    if (!this.swimming) {
      if (this.pos.y <= g) {
        if (!this.onGround && this.airTime > 0.45) { this.landTimer = 0.25; }
        this.pos.y = g; this.vel.y = Math.max(0, this.vel.y); this.onGround = true; this.airTime = 0;
      } else if (this.onGround && this.vel.y <= 0 && this.pos.y - g < 0.45) {
        this.pos.y = g; this.vel.y = 0; // descente d'escaliers / pentes
      } else {
        this.onGround = false; this.airTime += dt;
      }
    } else {
      this.onGround = false; this.airTime = 0;
    }
  }

  // choisit l'animation selon l'état
  animate(dt, speed2d, aiming) {
    const c = this.char;
    this.landTimer -= dt;
    if (!this.alive) return;
    if (this.inCar) { c.play('drive', 0.2); c.setUpper(null); return; }
    if (this.dancing) { c.play('dance', 0.3); c.setUpper(null); return; }
    if (this.swimming) c.play(speed2d > 0.5 ? 'swim' : 'swimIdle', 0.3);
    else if (!this.onGround && this.airTime > 0.12) c.play(this.vel.y > 2 && c.current === 'jumpStart' ? 'jumpStart' : 'fall', 0.2);
    else if (this.landTimer > 0 && speed2d < 1) c.play('land', 0.08);
    else if (speed2d < 0.4) c.play('idle', 0.25);
    else if (speed2d < 2.8) c.play('walk', 0.25, Math.max(0.6, speed2d / 1.7));
    else if (speed2d < 6.2) c.play('run', 0.25, speed2d / 4.6);
    else c.play('sprint', 0.25, speed2d / 7.2);
    c.setUpper(aiming && !this.swimming ? 'aim' : null);
    // bruits de pas
    if (this.onGround && speed2d > 1) {
      this.stepTimer -= dt * speed2d;
      if (this.stepTimer <= 0) {
        this.stepTimer = 1.6;
        const d = this.game.camera.position.distanceTo(this.pos);
        if (d < 25) this.game.audio.step(0.07 * (1 - d / 25) * (speed2d > 6 ? 1.4 : 1));
      }
    }
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  faceTowards(yaw, dt, rate = 12) {
    let d = yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, rate * dt);
  }

  damage(amount, from, head = false) {
    if (!this.alive) return false;
    if (this.armor > 0) { const a = Math.min(this.armor, amount * 0.6); this.armor -= a; amount -= a; }
    this.health -= amount;
    this.lastHit = performance.now();
    this.lastAttacker = from;
    if (this.health <= 0) { this.die(from); return true; }
    if (!this.dancing && !this.inCar) this.char.oneShotUpper('hit');
    return false;
  }

  die(from) {
    this.health = 0;
    this.alive = false;
    this.dancing = false;
    this.char.setUpper(null);
    this.char.play('death', 0.15);
    this.game.onDeath(this, from);
  }

  // muzzle : position du canon
  muzzle() {
    const g = this.char.gun;
    const v = new THREE.Vector3();
    if (g) { g.updateWorldMatrix(true, false); v.set(0.18, 0.06, 0).applyMatrix4(g.matrixWorld); }
    else v.copy(this.eye);
    return v;
  }

  // tir : retourne vrai si un coup est parti
  tryShoot() {
    if (!this.alive || this.reloading > 0 || this.cooldown > 0 || this.inCar || this.swimming) return false;
    if (this.mag <= 0) { this.startReload(); if (this.isPlayer) this.game.audio.click(500, 0.04, 0.2); return false; }
    this.mag--; this.cooldown = 0.24;
    this.char.oneShotUpper('shoot');
    return true;
  }

  startReload() {
    if (this.reloading > 0 || this.reserve <= 0 || this.mag === this.magSize) return;
    this.reloading = 1.7;
    this.char.oneShotUpper('reload');
    if (this.isPlayer) this.game.audio.reload();
  }

  updateTimers(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const n = Math.min(this.magSize - this.mag, this.reserve);
        this.mag += n; this.reserve -= n; this.reloading = 0;
      }
    }
  }
}
