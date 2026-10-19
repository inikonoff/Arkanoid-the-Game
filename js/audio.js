// Синтезированный звук и процедурная музыка — без аудиофайлов.
import { settings } from './settings.js';

const SCALES = {
  desert: [0, 1, 4, 5, 7, 8, 10], jungle: [0, 2, 4, 7, 9], arctic: [0, 2, 3, 7, 8], volcano: [0, 1, 3, 5, 6, 8, 10],
  ocean: [0, 2, 3, 5, 7, 9, 10], city: [0, 3, 5, 6, 7, 10], orbit: [0, 2, 4, 6, 7, 11], void: [0, 1, 5, 6, 10],
};
const ROOTS = { desert: 45, jungle: 48, arctic: 50, volcano: 40, ocean: 43, city: 47, orbit: 52, void: 38 };

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.step = 0;
    this.loc = 'desert';
    this.intensity = 0.5;
    this.lastHit = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    this.ctx = c;
    this.master = c.createGain();
    this.sfx = c.createGain();
    this.music = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.sfx.connect(this.master); this.music.connect(this.master);
    this.master.connect(comp); comp.connect(c.destination);
    // общий шумовой буфер
    const len = c.sampleRate * 1.5;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // реверб из шума
    this.verb = c.createConvolver();
    const ir = c.createBuffer(2, c.sampleRate * 2, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3);
    }
    this.verb.buffer = ir;
    const vg = c.createGain(); vg.gain.value = 0.25;
    this.verb.connect(vg); vg.connect(this.master);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.masterVol;
    this.sfx.gain.value = settings.sfxVol;
    this.music.gain.value = settings.musicVol * 0.55;
  }

  env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, { slide = 0, delay = 0, dest, verb = false } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    this.env(g, t, 0.005, dur, vol);
    o.connect(g); g.connect(dest || this.sfx);
    if (verb) g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, vol, { freq = 1200, q = 1, type = 'lowpass', slide = 0.2, delay = 0, dest } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.004, dur, vol);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); g.connect(this.verb);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ——— SFX ———
  paddle(off = 0) { this.tone(220 + off * 60, 0.12, 'triangle', 0.35, { slide: 0.6 }); this.noiseBurst(0.05, 0.15, { freq: 3000 }); }
  wall() { this.tone(520, 0.05, 'square', 0.06, { slide: 0.8 }); }
  brick(hp, combo = 0) {
    const now = performance.now();
    if (now - this.lastHit < 25) return;
    this.lastHit = now;
    const sc = SCALES[this.loc] || SCALES.desert;
    const n = sc[combo % sc.length] + 12 * Math.floor(combo / sc.length % 3);
    const f = 440 * Math.pow(2, (n + (ROOTS[this.loc] || 45) - 45) / 12);
    this.tone(f, 0.18, 'triangle', 0.22, { verb: true });
    this.tone(f * 2, 0.08, 'sine', 0.08);
  }
  metal() { this.tone(1400, 0.25, 'square', 0.06, { slide: 0.98 }); this.tone(2100, 0.2, 'sine', 0.08); }
  glass() { for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 3000, 0.12, 'sine', 0.06, { delay: i * 0.02 }); this.noiseBurst(0.18, 0.12, { freq: 8000, type: 'highpass', slide: 1 }); }
  explosion(p = 1) {
    this.noiseBurst(0.9 * p, 0.6, { freq: 1800, slide: 0.05 });
    this.tone(90, 0.6, 'sine', 0.5, { slide: 0.3 });
  }
  thunder() { this.noiseBurst(1.6, 0.6, { freq: 600, slide: 0.1 }); this.noiseBurst(0.15, 0.4, { freq: 6000, type: 'highpass', slide: 1 }); }
  geyser() { this.noiseBurst(1.4, 0.3, { freq: 900, type: 'bandpass', q: 0.7, slide: 1.8 }); }
  power(good = true) {
    const base = good ? 523 : 330;
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * Math.pow(2, (good ? s : -s) / 12), 0.12, 'square', 0.08, { delay: i * 0.05 }));
  }
  laser() { this.tone(1600, 0.09, 'sawtooth', 0.05, { slide: 0.25 }); }
  lose() { [0, -3, -7, -12].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), 0.25, 'triangle', 0.25, { delay: i * 0.12 })); }
  launch() { this.tone(330, 0.15, 'triangle', 0.25, { slide: 2 }); }
  portal() { this.tone(300, 0.4, 'sine', 0.2, { slide: 4, verb: true }); }
  star() { [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.3, 'sine', 0.12, { delay: i * 0.06, verb: true })); }
  clear() { [0, 4, 7, 11, 14, 19].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.4, 'triangle', 0.18, { delay: i * 0.08, verb: true })); }
  bossHit() { this.tone(110, 0.2, 'sawtooth', 0.25, { slide: 0.5 }); this.noiseBurst(0.15, 0.25, { freq: 2500 }); }
  bossRoar() { this.tone(55, 1.2, 'sawtooth', 0.3, { slide: 1.5 }); this.tone(58, 1.2, 'sawtooth', 0.3, { slide: 1.4 }); this.noiseBurst(1, 0.2, { freq: 400, slide: 2 }); }
  bossShot() { this.tone(700, 0.15, 'square', 0.06, { slide: 0.4 }); }
  click() { this.tone(1200, 0.03, 'square', 0.04); }
  ui() { this.tone(880, 0.06, 'triangle', 0.08); }

  // ——— Музыка: простой секвенсор под локацию ———
  setLocation(id) { this.loc = id; }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  schedule() {
    if (!this.ctx || !this.musicOn || settings.musicVol <= 0) return;
    const bpm = { desert: 96, jungle: 104, arctic: 84, volcano: 118, ocean: 78, city: 124, orbit: 92, void: 72 }[this.loc] || 96;
    const spb = 60 / bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += spb;
      this.step++;
    }
  }

  playStep(s, t) {
    const sc = SCALES[this.loc] || SCALES.desert, root = ROOTS[this.loc] || 45;
    const m = this.music, c = this.ctx;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const bar = Math.floor(s / 16) % 4;
    const prog = [0, 3, 4, 2][bar];
    const chordRoot = root + sc[prog % sc.length];
    const play = (freq, dur, type, vol, filt = 0) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (filt) {
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
        o.connect(f); f.connect(g);
      } else o.connect(g);
      g.connect(m);
      o.start(t); o.stop(t + dur + 0.05);
    };
    // бас
    if (s % 4 === 0 || (this.intensity > 0.6 && s % 4 === 3)) play(midi(chordRoot - 12), 0.28, 'sawtooth', 0.12, 380);
    // пэд раз в такт
    if (s % 16 === 0) {
      [0, 2, 4].forEach((k) => play(midi(root + sc[(prog + k) % sc.length] + 12), 2.4, 'triangle', 0.035, 1800));
    }
    // арпеджио
    if (s % 2 === 0) {
      const idx = (s / 2 + bar * 3) % sc.length;
      const n = root + 24 + sc[(prog + idx) % sc.length];
      if ((s * 7919) % 5 !== 0) play(midi(n), 0.16, 'square', 0.022, 2600);
    }
    // перкуссия шумом
    if (s % 8 === 4) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.connect(f); f.connect(g); g.connect(m); src.start(t, Math.random()); src.stop(t + 0.15);
    }
    if (s % 8 === 0) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(m); o.start(t); o.stop(t + 0.25);
    }
    if (this.intensity > 0.5 && s % 2 === 1) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(f); f.connect(g); g.connect(m); src.start(t, Math.random()); src.stop(t + 0.06);
    }
  }
}

export function vibrate(ms) {
  if (vibrate.enabled && settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
}
vibrate.enabled = false;
