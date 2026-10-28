// Contrôle du joueur à la 3e personne (caméra épaule façon GTA), visée, tir, interactions.
import * as THREE from 'three';
import { Actor } from './actor.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

export class Player extends Actor {
  constructor(game, skin) {
    super(game, skin, 'Toi', true);
    this.camYaw = 0;
    this.camPitch = -0.12;
    this.camDist = 3.6;
    this.camPos = new THREE.Vector3();
    this.zoom = 0;
  }

  update(dt, input) {
    const game = this.game;
    this.updateTimers(dt);
    // souris : orientation caméra
    const sens = 0.0022 * input.sensitivity * (this.aiming ? 0.6 : 1);
    this.camYaw -= input.dx * sens;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch - input.dy * sens, -1.2, 0.85);

    if (!this.alive) { this.updateCamera(dt); return; }

    if (this.inCar) {
      this.inCar.drive(dt, input);
      // la caméra revient doucement derrière la voiture (comme GTA)
      if (Math.abs(input.dx) + Math.abs(input.dy) > 0) this.freeLook = 1.2;
      this.freeLook = (this.freeLook || 0) - dt;
      if (this.freeLook <= 0 && Math.abs(this.inCar.speed) > 2) {
        let d = this.inCar.yaw + Math.PI - this.camYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.camYaw += d * Math.min(1, dt * 2.5);
        this.camPitch += (-0.18 - this.camPitch) * Math.min(1, dt * 2);
      }
      this.pos.copy(this.inCar.seatPosition());
      this.yaw = this.inCar.yaw;
      this.animate(dt, 0, false);
      this.sync();
      if (input.hit('KeyE') || input.hit('KeyF')) game.vehicles.exit(this);
      this.updateCamera(dt);
      return;
    }

    const [ax, ay] = input.axis();
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
    let wx = fwdX * ay + rightX * ax, wz = fwdZ * ay + rightZ * ax;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
    this.aiming = input.mouse(2) && !this.swimming;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    if (len > 0 || input.hit('Space')) this.dancing = false;
    if (input.hit('KeyB') || input.hit('KeyG')) { this.dancing = !this.dancing; if (this.dancing) game.ui.toast('💃 Danse ! (B pour arrêter)'); }
    let speed = this.aiming ? 2.6 : sprint ? 7.6 : 4.6;
    if (input.down('KeyC') || input.down('ControlLeft')) speed = Math.min(speed, 1.6);
    this.move(dt, wx, wz, len > 0 ? speed : 0, input.hit('Space'));

    // orientation : vers la caméra quand on vise, sinon vers le déplacement
    if (this.aiming || (input.mouse(0) && !this.dancing)) this.faceTowards(this.camYaw + Math.PI, dt, 18);
    else if (len > 0) this.faceTowards(Math.atan2(wx, wz), dt, 10);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.animate(dt, sp, this.aiming || this.cooldown > 0.05);

    // tir
    if (input.mouse(0) && !this.dancing && !game.ui.menuOpen) {
      if (this.tryShoot()) game.combat.fireFromCamera(this);
    }
    if (input.hit('KeyR')) this.startReload();
    if (input.hit('KeyE') || input.hit('KeyF')) game.interact(this);
    if (input.hit('KeyH')) game.useMedkit(this);
    this.sync();
    this.updateCamera(dt);
  }

  // caméra au-dessus de l'épaule droite, avec collision contre murs et relief
  updateCamera(dt) {
    const cam = this.game.camera;
    const car = this.inCar;
    const targetDist = car ? 7.2 : this.aiming ? 1.7 : this.dancing ? 4.2 : 3.4;
    this.camDist += (targetDist - this.camDist) * Math.min(1, dt * 8);
    const shoulder = car ? 0 : this.aiming ? 0.62 : 0.5;
    const pivot = tmp.set(this.pos.x, this.pos.y + (car ? 1.9 : this.swimming ? 1.25 : 1.58), this.pos.z);
    const cp = Math.cos(this.camPitch), spch = Math.sin(this.camPitch);
    const dirX = -Math.sin(this.camYaw) * cp, dirY = spch, dirZ = -Math.cos(this.camYaw) * cp;
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    // côté épaule
    const sx = pivot.x + rx * shoulder, sz = pivot.z + rz * shoulder;
    let dist = this.camDist;
    const hit = this.game.world.raycast(sx, pivot.y, sz, -dirX, -dirY, -dirZ, dist + 0.3);
    if (hit) dist = Math.max(0.4, hit.dist - 0.3);
    cam.position.set(sx - dirX * dist, pivot.y - dirY * dist, sz - dirZ * dist);
    // ne jamais passer sous l'eau / le sol
    const g = this.game.world.groundAt(cam.position.x, cam.position.z) + 0.25;
    if (cam.position.y < g) cam.position.y = g;
    if (cam.position.y < 0.15 && !this.swimming) cam.position.y = Math.max(cam.position.y, 0.15);
    tmp2.set(cam.position.x + dirX * 10, cam.position.y + dirY * 10, cam.position.z + dirZ * 10);
    cam.lookAt(tmp2);
    const fov = this.aiming ? 50 : car ? 68 : 62;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
  }
}
