// Sons synthétisés en temps réel (Web Audio) : aucun fichier audio nécessaire.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
  }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // bruit blanc partagé
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ambience();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  src(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = loop;
    return s;
  }

  // ressac + vent, modulés lentement
  ambience() {
    const c = this.ctx;
    const surf = this.src(true), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.value = 0.05;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.09; lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    surf.connect(f); f.connect(g); g.connect(this.master);
    surf.start(); lfo.start();
    this.surfGain = g;
    const wind = this.src(true), wf = c.createBiquadFilter(), wg = c.createGain();
    wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.6; wg.gain.value = 0.015;
    wind.connect(wf); wf.connect(wg); wg.connect(this.master); wind.start(0, 0.7);
  }

  // distance en mètres -> volume
  att(dist) { return Math.max(0, 1 / (1 + dist * 0.06)); }

  gunshot(dist = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, v = this.att(dist);
    const n = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(dist > 40 ? 1200 : 5200, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.4);
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    og.gain.setValueAtTime(0.8 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.2);
  }

  click(freq = 1800, dur = 0.03, vol = 0.25) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.01);
  }

  reload() { this.click(900, 0.05, 0.2); setTimeout(() => this.click(1400, 0.04, 0.2), 700); setTimeout(() => this.click(700, 0.06, 0.25), 1250); }
  hitmarker() { this.click(2600, 0.04, 0.12); }
  hurt() { this.click(160, 0.12, 0.25); }

  chime(notes = [660, 880, 1320]) {
    if (!this.ctx) return;
    const c = this.ctx;
    notes.forEach((f, i) => {
      const t = c.currentTime + i * 0.09;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.55);
    });
  }

  step(vol = 0.08) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 200; f.Q.value = 1.2;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.1);
  }

  splash() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.4);
  }

  // grondement des cascades : bruit filtré dont le volume dépend de la distance
  waterfall() {
    let gain = null;
    return {
      set: (dist) => {
        if (!this.ctx) return;
        if (!gain) {
          const c = this.ctx, n = this.src(true), lp = c.createBiquadFilter(), hp = c.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 1400; hp.type = 'highpass'; hp.frequency.value = 120;
          gain = c.createGain(); gain.gain.value = 0;
          n.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(this.master); n.start(0, 0.3);
        }
        const v = dist > 220 ? 0 : 0.45 / (1 + dist * 0.045);
        gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
      },
    };
  }

  // moteur de voiture : renvoie un objet {set(rpm01, gas), stop()}
  engine() {
    if (!this.ctx) return { set() {}, stop() {} };
    const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square';
    f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0.0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    g.gain.setTargetAtTime(0.09, c.currentTime, 0.2);
    return {
      set(r, gas) {
        const t = c.currentTime;
        o1.frequency.setTargetAtTime(38 + r * 120, t, 0.05);
        o2.frequency.setTargetAtTime(19 + r * 60, t, 0.05);
        f.frequency.setTargetAtTime(350 + r * 1400 + gas * 400, t, 0.05);
      },
      stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.1); setTimeout(() => { o1.stop(); o2.stop(); }, 600); },
    };
  }
}
