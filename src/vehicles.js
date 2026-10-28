// Voitures conduisibles (modèle Khronos CarConcept, CC-BY 4.0) : physique arcade, suspension
// sur le relief, roues motrices et directrices, collisions, son du moteur.
import * as THREE from 'three';
import * as A from './assets.js';
import { WATER } from './map.js';

const PAINTS = [0x8f0f12, 0x1f3d7a, 0xd8d8d8, 0x111214, 0xc9a227, 0x2f6b3a];
const up = new THREE.Vector3(0, 1, 0);

let proto = null;
async function prototype() {
  if (proto) return proto;
  const g = await A.gltf('model/car');
  const scene = g.scene;
  scene.updateMatrixWorld(true);
  const wp = (n) => { const o = scene.getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
  const FL = wp('WheelFrontL'), FR = wp('WheelFrontR'), RL = wp('WheelRearL'), RR = wp('WheelRearR');
  const front = FL.clone().add(FR).multiplyScalar(0.5), rear = RL.clone().add(RR).multiplyScalar(0.5);
  const fwd = front.clone().sub(rear).normalize();
  const yaw0 = Math.atan2(fwd.x, fwd.z);
  // conteneur : avant de la voiture = +Z, centre entre les essieux, roues posées à y = 0
  const inner = new THREE.Group();
  inner.add(scene);
  scene.rotation.y = -yaw0;
  inner.updateMatrixWorld(true);
  const center = front.clone().add(rear).multiplyScalar(0.5).applyAxisAngle(up, -yaw0);
  const box = new THREE.Box3().setFromObject(scene);
  scene.position.set(-center.x, -box.min.y, -center.z);
  inner.updateMatrixWorld(true);
  const size = box.getSize(new THREE.Vector3());
  // matériaux : peinture recolorable, vitres sans transmission (coût réduit)
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.35; m.roughness = 0.05; m.depthWrite = false; }
      if (m.map) m.map.anisotropy = A.maxAnisotropy;
    });
  });
  const wheelBase = front.distanceTo(rear);
  proto = { inner, size, wheelBase, track: FL.distanceTo(FR) };
  return proto;
}

export class Car {
  constructor(game, p, x, z, yaw, paint) {
    this.game = game;
    this.root = new THREE.Group();
    const inner = p.inner.clone(true);
    this.root.add(inner);
    this.wheels = [];
    inner.traverse((o) => {
      if (/^Wheel(Front|Rear)(L|R)$/.test(o.name)) this.wheels.push({ o, front: o.name.includes('Front'), q0: o.quaternion.clone() });
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const nm = mats.map((m) => {
          if (/^Paint 1/.test(m.name || '')) { const c = m.clone(); c.color.setHex(paint); return c; }
          return m;
        });
        o.material = Array.isArray(o.material) ? nm : nm[0];
      }
    });
    this.root.updateMatrixWorld(true);
    // axe latéral (rotation des roues) exprimé dans le repère du parent de chaque roue
    for (const w of this.wheels) {
      const pq = w.o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
      w.axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rq).applyQuaternion(pq).normalize();
      w.upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(rq).applyQuaternion(pq).normalize();
    }
    this.halfL = p.size.z / 2; this.halfW = p.size.x / 2; this.height = p.size.y;
    this.wheelBase = p.wheelBase; this.track = p.track;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw; this.speed = 0; this.steer = 0; this.spin = 0;
    this.pitch = 0; this.roll = 0; this.vy = 0;
    this.driver = null;
    this.health = 100;
    game.scene.add(this.root);
    this.collider = game.world.addBox(x, z, this.halfW, this.halfL, yaw, 0, 1.4, { kind: 'car', car: this });
    this.settle(1);
  }

  groundUnder(lx, lz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const x = this.pos.x + lx * c + lz * s, z = this.pos.z - lx * s + lz * c;
    return this.game.world.groundAt(x, z, this.pos.y + 1.2, 1.2);
  }

  // hauteur, tangage et roulis selon le sol sous les 4 roues
  settle(dt) {
    const hb = this.wheelBase / 2, ht = this.track / 2;
    const fl = this.groundUnder(-ht, hb), fr = this.groundUnder(ht, hb), rl = this.groundUnder(-ht, -hb), rr = this.groundUnder(ht, -hb);
    const target = (fl + fr + rl + rr) / 4;
    const k = Math.min(1, dt * 12);
    if (this.pos.y > target + 0.05) { this.vy -= 20 * dt; this.pos.y = Math.max(target, this.pos.y + this.vy * dt); }
    else { this.pos.y += (target - this.pos.y) * k; this.vy = 0; }
    this.pitch += (Math.atan2((rl + rr) / 2 - (fl + fr) / 2, this.wheelBase) - this.pitch) * k;
    this.roll += (Math.atan2((fl + rl) / 2 - (fr + rr) / 2, this.track) - this.roll) * k;
  }

  drive(dt, input) {
    const [ax, ay] = input.axis();
    const brake = input.down('Space');
    const max = 34, accel = 9;
    if (this.underwater) { this.speed *= 0.9; }
    else if (ay > 0) this.speed += (this.speed < 0 ? accel * 2.5 : accel * (1 - this.speed / max)) * dt;
    else if (ay < 0) this.speed -= (this.speed > 0 ? accel * 2.2 : accel * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2.2 * dt);
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 18 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -9, max);
    const steerTarget = -ax * 0.55 / (1 + Math.abs(this.speed) * 0.04);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 6);
    this.integrate(dt, brake);
    // son
    if (this.engine) this.engine.set(Math.min(1, Math.abs(this.speed) / max), ay > 0 ? 1 : 0);
  }

  integrate(dt, handbrake = false) {
    const yawRate = (this.speed * Math.tan(this.steer)) / this.wheelBase * (handbrake ? 1.5 : 1);
    this.yaw += yawRate * dt;
    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    // collisions : 3 cercles le long de la voiture
    const world = this.game.world;
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x = nx; this.pos.z = nz;
    let hit = false;
    for (const t of [-0.6, 0, 0.6]) {
      const off = t * this.halfL * 1.1;
      const p = { x: this.pos.x + Math.sin(this.yaw) * off, y: this.pos.y + 0.3, z: this.pos.z + Math.cos(this.yaw) * off };
      const bx = p.x, bz = p.z;
      if (world.collide(p, this.halfW * 0.95, 1.1, 0.45, this.collider)) {
        hit = true;
        this.pos.x += p.x - bx; this.pos.z += p.z - bz;
      }
    }
    if (hit && Math.abs(this.speed) > 3) {
      if (Math.abs(this.speed) > 10 && this.driver?.isPlayer) this.game.ui.shake(0.4);
      this.speed *= -0.25;
    } else if (hit) this.speed *= 0.5;
    if (!isFinite(this.pos.x)) { this.pos.x = prevX; this.pos.z = prevZ; }
    // écraser quelqu'un : dégâts selon la vitesse
    if (Math.abs(this.speed) > 6) {
      for (const a of this.game.actors) {
        if (!a.alive || a.inCar) continue;
        const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z;
        const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < this.halfW + 0.3 && Math.abs(lz) < this.halfL + 0.3 && Math.abs(a.pos.y - this.pos.y) < 1.5) {
          a.damage(Math.abs(this.speed) * 4, this.driver);
          a.vel.x += Math.sin(this.yaw) * this.speed * 0.6; a.vel.z += Math.cos(this.yaw) * this.speed * 0.6; a.vel.y = 4;
          this.speed *= 0.8;
        }
      }
    }
    this.settle(dt);
    this.underwater = this.pos.y < WATER - 0.9;
    this.spin += this.speed * dt / 0.36;
    this.sync();
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, 0, 0);
    this.root.rotateY(this.yaw);
    this.root.rotateX(this.pitch);
    this.root.rotateZ(this.roll);
    const q = new THREE.Quaternion(), qs = new THREE.Quaternion();
    for (const w of this.wheels) {
      q.setFromAxisAngle(w.axis, this.spin);
      if (w.front) { qs.setFromAxisAngle(w.upAxis, this.steer); q.premultiply(qs); }
      w.o.quaternion.copy(q).multiply(w.q0);
    }
    this.game.world.moveBox(this.collider, this.pos.x, this.pos.z, this.yaw, this.pos.y, this.pos.y + 1.4);
  }

  seatPosition() {
    // siège conducteur (à gauche : +X local quand l'avant est +Z)
    const off = new THREE.Vector3(0.36, 0.12, -0.2).applyEuler(this.root.rotation);
    return this.pos.clone().add(off);
  }

  idle(dt) {
    if (Math.abs(this.speed) > 0.05) { this.speed *= Math.pow(0.4, dt); this.integrate(dt); }
  }
}

export class Vehicles {
  constructor(game) { this.game = game; this.cars = []; }

  async init() {
    const p = await prototype();
    const spots = [
      [3.4, 33, Math.PI], [-3.4, -44, 0], [40, -3.4, Math.PI / 2], [-58, 3.4, -Math.PI / 2],
      [140, 10, 0.2], [-60, 125, 1.2], [20, -140, 2.6],
    ];
    const P = this.game.parking;
    if (P) spots.push([P.x - 3, P.z, P.rot], [P.x + 3, P.z - 1, P.rot + 0.1]);
    spots.forEach(([x, z, yaw], i) => this.cars.push(new Car(this.game, p, x, z, yaw, PAINTS[i % PAINTS.length])));
  }

  nearest(p, max = 3.2) {
    let best = null, bd = max;
    for (const c of this.cars) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z) - c.halfW;
      if (d < bd && !c.driver) { bd = d; best = c; }
    }
    return best;
  }

  enter(actor, car) {
    car.driver = actor;
    actor.inCar = car;
    actor.dancing = false;
    actor.vel.set(0, 0, 0);
    car.collider.ghost = false;
    if (actor.isPlayer) { car.engine = this.game.audio.engine(); this.game.ui.toast('🚗 Z/W accélérer · S freiner · A/D tourner · Espace frein à main · E sortir'); }
  }

  exit(actor) {
    const car = actor.inCar;
    if (!car) return;
    car.driver = null;
    actor.inCar = null;
    car.engine?.stop(); car.engine = null;
    // sortie côté conducteur
    const side = new THREE.Vector3(car.halfW + 0.7, 0, 0).applyAxisAngle(up, car.yaw);
    actor.setPosition(car.pos.x + side.x, car.pos.z + side.z);
    actor.yaw = car.yaw;
  }

  update(dt) {
    for (const c of this.cars) if (!c.driver) c.idle(dt);
  }
}
