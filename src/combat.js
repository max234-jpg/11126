// Tir : balles instantanées (hitscan), traçantes, éclairs de bouche, impacts, dégâts et tirs à la tête.
import * as THREE from 'three';
import { RADIUS, HEIGHT } from './actor.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.fx = [];
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.flashMat = new THREE.SpriteMaterial({ map: this.flashTexture(), color: 0xffd28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.dustMat = new THREE.SpriteMaterial({ map: this.flashTexture(true), color: 0xb9a98c, transparent: true, depthWrite: false, opacity: 0.8 });
    this.bloodMat = new THREE.SpriteMaterial({ map: this.flashTexture(true), color: 0x8a0f0f, transparent: true, depthWrite: false, opacity: 0.9 });
  }

  flashTexture(soft = false) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft ? 0.5 : 0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Rayon contre les acteurs (cylindres verticaux)
  rayActors(o, d, max, shooter) {
    let best = max, hit = null, head = false;
    for (const a of this.game.actors) {
      if (a === shooter || !a.alive) continue;
      const fx = o.x - a.pos.x, fz = o.z - a.pos.z;
      const A = d.x * d.x + d.z * d.z, B = 2 * (fx * d.x + fz * d.z), C = fx * fx + fz * fz - (RADIUS + 0.06) ** 2;
      const disc = B * B - 4 * A * C;
      if (disc < 0 || A < 1e-8) continue;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0 || t > best) continue;
      const y = o.y + d.y * t - a.pos.y;
      const h = a.swimming ? 0.7 : HEIGHT;
      const y0 = a.swimming ? 0.6 : 0;
      if (y < y0 || y > y0 + h) continue;
      best = t; hit = a; head = !a.swimming && y > 1.5;
    }
    return hit ? { dist: best, actor: hit, head } : null;
  }

  trace(o, d, max, shooter) {
    const w = this.game.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, max, shooter.inCar?.collider);
    const a = this.rayActors(o, d, w ? w.dist : max, shooter);
    if (a) return { dist: a.dist, actor: a.actor, head: a.head };
    if (w) return { dist: w.dist, obj: w.obj };
    return null;
  }

  // Le joueur vise au centre de l'écran : on trouve le point visé puis on tire depuis le canon.
  fireFromCamera(p) {
    const cam = this.game.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    // dispersion : faible en visée, plus forte en mouvement
    const spread = (p.aiming ? 0.004 : 0.02) + Math.hypot(p.vel.x, p.vel.z) * 0.0025;
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const camHit = this.trace(cam.position, dir, 300, p);
    const target = v1.copy(cam.position).addScaledVector(dir, camHit ? camHit.dist : 300);
    this.fire(p, target);
  }

  // tir d'un acteur vers un point
  fire(shooter, target) {
    const m = shooter.muzzle();
    const d = v2.copy(target).sub(m);
    const max = d.length() + 0.5;
    d.normalize();
    const hit = this.trace(m, d, Math.min(300, max + 50), shooter);
    const end = m.clone().addScaledVector(d, hit ? hit.dist : 120);
    this.tracer(m, end);
    this.flash(m);
    const dist = this.game.camera.position.distanceTo(m);
    this.game.audio.gunshot(dist);
    if (hit?.actor) {
      const dmg = (hit.head ? 46 : 22) * (shooter.isPlayer ? 1 : 0.8);
      const killed = hit.actor.damage(dmg, shooter, hit.head);
      this.puff(end, this.bloodMat, 0.35);
      if (shooter.isPlayer) { this.game.audio.hitmarker(); this.game.ui.hitmarker(hit.head, killed); }
      if (hit.actor.isPlayer) { this.game.ui.damageFlash(); this.game.audio.hurt(); }
      // le bot touché réagit vers le tireur
      hit.actor.onAttacked?.(shooter);
    } else if (hit) {
      this.puff(end, this.dustMat, 0.5);
    }
    // les bots proches entendent le coup de feu
    for (const b of this.game.bots) if (b.alive && b !== shooter && b.pos.distanceTo(m) < 60) b.onNoise?.(shooter);
  }

  tracer(a, b) {
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    m.position.copy(a);
    m.lookAt(b);
    m.scale.set(1, 1, a.distanceTo(b));
    this.game.scene.add(m);
    this.fx.push({ o: m, life: 0.06, total: 0.06 });
  }

  flash(p) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.copy(p); s.scale.setScalar(0.45);
    this.game.scene.add(s);
    this.fx.push({ o: s, life: 0.05, total: 0.05 });
  }

  puff(p, mat, size) {
    const s = new THREE.Sprite(mat.clone());
    s.position.copy(p); s.scale.setScalar(size * 0.4);
    this.game.scene.add(s);
    this.fx.push({ o: s, life: 0.5, total: 0.5, grow: size, fade: true });
  }

  update(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.grow) { f.o.scale.setScalar(f.grow * (1.4 - f.life / f.total)); f.o.position.y += dt * 0.3; }
      if (f.fade) f.o.material.opacity = Math.max(0, f.life / f.total) * 0.8;
      if (f.life <= 0) {
        this.game.scene.remove(f.o);
        if (f.fade) f.o.material.dispose();
        this.fx.splice(i, 1);
      }
    }
  }
}
