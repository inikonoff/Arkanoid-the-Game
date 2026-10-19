// Боссы: процедурные модели, фазы, атаки, щиты-орбитали.
import * as THREE from 'three';
import { mat, glow } from './mat.js';
import { settings } from './settings.js';

export const BOSSES = {
  scarab: { name: 'СКАРАБЕЙ-КОЛОСС', hp: 22, r: 1.9, sweep: 0.45, attack: 'spread', every: 2.6, summon: true, orbiters: 0 },
  hydra: { name: 'ТОТЕМ-ГИДРА', hp: 20, r: 1.6, sweep: 0.3, attack: 'aimed', every: 2.0, orbiters: 3, orbitR: 3.3, orbitSpeed: 0.7, orbHp: 5 },
  wyrm: { name: 'КРИО-ЗМЕЙ', hp: 26, r: 1.8, sweep: 0.4, attack: 'beam', every: 4.2, orbiters: 6, orbitR: 3.1, orbitSpeed: 1.3 },
  magma: { name: 'МАГМА-ЯДРО', hp: 30, r: 1.7, sweep: 0.25, attack: 'rain', every: 3.2, orbiters: 8, orbitR: 2.7, orbitSpeed: 0.55 },
  kraken: { name: 'КРАКЕН БЕЗДНЫ', hp: 30, r: 1.9, sweep: 0.35, attack: 'ink', every: 3.0, orbiters: 4, orbitR: 3.4, orbitSpeed: 0.9, wobble: true },
  mech: { name: 'МЕХ-СТРАЖ', hp: 34, r: 1.8, sweep: 0.7, attack: 'burst', every: 2.4, orbiters: 0, summon: true },
  mothership: { name: 'МАТЕРИНСКИЙ КОРАБЛЬ', hp: 36, r: 2.3, sweep: 0.5, attack: 'spread', every: 2.2, orbiters: 0, teleport: true, summon: true },
  singularity: { name: 'СИНГУЛЯРНОСТЬ', hp: 42, r: 1.6, sweep: 0.3, attack: 'all', every: 2.0, orbiters: 10, orbitR: 3.4, orbitSpeed: 1.0, gravity: true, teleport: true },
};

// ——— Модели ———
function buildModel(type, r, mats) {
  const g = new THREE.Group();
  const anim = [];
  const M = (p) => { const m = mat(p); mats.push(m); return m; };
  const shadow = settings.shadows >= 2;
  const add = (parent, mesh) => { mesh.castShadow = shadow; parent.add(mesh); return mesh; };
  switch (type) {
    case 'scarab': {
      const shell = M({ color: '#2b2116', metalness: 0.9, roughness: 0.25 });
      const gold = M({ color: '#d4a24c', metalness: 1, roughness: 0.3 });
      const body = add(g, new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), shell));
      body.scale.set(r, r * 0.55, r * 1.2); body.position.y = r * 0.55;
      const seam = add(g, new THREE.Mesh(new THREE.BoxGeometry(0.08, r * 0.62, r * 2.3), gold));
      seam.position.y = r * 0.6;
      const head = add(g, new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 20, 14), gold));
      head.position.set(0, r * 0.45, r * 1.15);
      const horn = add(g, new THREE.Mesh(new THREE.ConeGeometry(r * 0.15, r * 0.9, 8), gold));
      horn.position.set(0, r * 0.85, r * 1.35); horn.rotation.x = 0.6;
      const eyeM = glow('#ff7a2f', 2.2);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 8, 6), eyeM);
        e.position.set(s * r * 0.22, r * 0.55, r * 1.5); g.add(e);
      }
      const legs = [];
      for (let i = 0; i < 6; i++) {
        const s = i < 3 ? -1 : 1, k = i % 3;
        const leg = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, r * 1.2, 6), gold));
        leg.position.set(s * r * 0.9, r * 0.3, (k - 1) * r * 0.7);
        leg.rotation.z = s * 1.0;
        legs.push(leg);
      }
      anim.push((t) => legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 8 + i * 2) * 0.4; }));
      break;
    }
    case 'hydra': {
      const stone = M({ color: '#5d6b4a', roughness: 0.85 });
      const moss = M({ color: '#2f5a2a', roughness: 0.9 });
      for (let i = 0; i < 3; i++) {
        const b = add(g, new THREE.Mesh(new THREE.BoxGeometry(r * 1.4 - i * 0.2, r * 0.7, r * 1.4 - i * 0.2), i % 2 ? moss : stone));
        b.position.y = r * 0.35 + i * r * 0.72;
        b.rotation.y = i * 0.3;
      }
      const eyeM = glow('#b6f03c', 2.4);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(r * 0.25, r * 0.12, 0.05), eyeM);
        e.position.set(s * r * 0.3, r * 1.85, r * 0.62); g.add(e);
      }
      break;
    }
    case 'wyrm': {
      const ice = M({ color: '#9fd8f5', metalness: 0.2, roughness: 0.1, emissive: '#1a5a8a', emissiveIntensity: 0.5, transparent: true, opacity: 0.92 });
      const coil = add(g, new THREE.Mesh(new THREE.TorusKnotGeometry(r * 0.75, r * 0.22, 96, 12, 2, 3), ice));
      coil.position.y = r * 0.9;
      coil.rotation.x = Math.PI / 2;
      const head = add(g, new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, r * 1.1, 6), ice));
      head.position.set(0, r * 1.4, r * 0.9); head.rotation.x = Math.PI / 2;
      const eyeM = glow('#5fd0ff', 2.5);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), eyeM);
        e.position.set(s * r * 0.18, r * 1.55, r * 1.1); g.add(e);
      }
      anim.push((t) => { coil.rotation.z = t * 0.6; });
      break;
    }
    case 'magma': {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.85, 2), glow('#ff6a1a', 2.6));
      core.position.y = r;
      g.add(core);
      const crust = M({ color: '#1a100c', roughness: 0.9, flatShading: true });
      const shell = add(g, new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), crust));
      shell.position.y = r;
      shell.material = crust;
      // «трещины» — скрываем часть граней шеллом через wireframe-оверлей
      const cracks = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.01, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(2.5), wireframe: true }));
      cracks.position.y = r;
      g.add(cracks);
      anim.push((t, boss) => {
        const s = 1 + Math.sin(t * 4) * 0.04;
        core.scale.setScalar(s * (1.05 + (1 - boss.hp / boss.maxHp) * 0.25));
        shell.rotation.y = cracks.rotation.y = t * 0.3;
        shell.visible = boss.hp / boss.maxHp > 0.33;
      });
      break;
    }
    case 'kraken': {
      const skin = M({ color: '#7a2a4a', roughness: 0.5, metalness: 0.1, emissive: '#2a0612', emissiveIntensity: 0.6 });
      const mantle = add(g, new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), skin));
      mantle.scale.set(1, 1.15, 0.9); mantle.position.y = r * 1.05;
      const cap = add(g, new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, r * 1.2, 20), skin));
      cap.position.set(0, r * 2.2, -r * 0.3); cap.rotation.x = -0.4;
      const eyeM = glow('#ffd166', 2.5);
      const pupil = new THREE.MeshBasicMaterial({ color: '#000' });
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 12, 10), eyeM);
        e.position.set(s * r * 0.45, r * 1.1, r * 0.72); g.add(e);
        const p = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, r * 0.28, 0.02), pupil);
        p.position.set(s * r * 0.45, r * 1.1, r * 0.95); g.add(p);
      }
      anim.push((t) => { mantle.scale.y = 1.15 + Math.sin(t * 2) * 0.06; });
      break;
    }
    case 'mech': {
      const armor = M({ color: '#2d2f38', metalness: 0.9, roughness: 0.35 });
      const trim = M({ color: '#ff2e63', metalness: 0.5, roughness: 0.4, emissive: '#ff2e63', emissiveIntensity: 0.4 });
      const torso = add(g, new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 1.0, r * 1.1), armor));
      torso.position.y = r * 1.3;
      const head = add(g, new THREE.Mesh(new THREE.BoxGeometry(r * 0.7, r * 0.45, r * 0.6), armor));
      head.position.set(0, r * 2.0, r * 0.1);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(r * 0.55, r * 0.1, 0.05), glow('#20e3b2', 2.6));
      visor.position.set(0, r * 2.02, r * 0.42); g.add(visor);
      const guns = [];
      for (const s of [-1, 1]) {
        const sh = add(g, new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.5, r * 0.6), trim));
        sh.position.set(s * r * 1.05, r * 1.6, 0);
        const gun = add(g, new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.12, r * 1.2, 8), armor));
        gun.rotation.x = Math.PI / 2; gun.position.set(s * r * 1.05, r * 1.6, r * 0.7);
        guns.push(gun);
        const leg = add(g, new THREE.Mesh(new THREE.BoxGeometry(r * 0.35, r * 1.0, r * 0.4), armor));
        leg.position.set(s * r * 0.5, r * 0.45, 0);
      }
      anim.push((t, boss) => { g.rotation.y = Math.sin(t * 1.3) * 0.15; guns.forEach((q, i) => { q.position.z = r * 0.7 - (boss.recoil || 0) * 0.3 * (i + 1) / 2; }); });
      break;
    }
    case 'mothership': {
      const hull = M({ color: '#b7bcc8', metalness: 0.95, roughness: 0.25 });
      const disc = add(g, new THREE.Mesh(new THREE.SphereGeometry(r, 40, 16), hull));
      disc.scale.set(1.2, 0.28, 1.2); disc.position.y = r * 0.9;
      const dome = add(g, new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        M({ color: '#ff006e', metalness: 0.1, roughness: 0.05, emissive: '#ff006e', emissiveIntensity: 0.8, transparent: true, opacity: 0.85 })));
      dome.position.y = r * 1.1;
      const ringG = new THREE.Group();
      const lightM = glow('#ffbe0b', 2.5);
      for (let i = 0; i < 16; i++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(r * 0.07, 6, 4), lightM);
        const a = (i / 16) * Math.PI * 2;
        l.position.set(Math.cos(a) * r * 1.15, 0, Math.sin(a) * r * 1.15);
        ringG.add(l);
      }
      ringG.position.y = r * 0.9;
      g.add(ringG);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, r * 1.6, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: '#ffbe0b', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = r * 0.1;
      g.add(beam);
      anim.push((t) => { ringG.rotation.y = t * 1.5; disc.rotation.y = -t * 0.2; });
      break;
    }
    case 'singularity': {
      const hole = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 32, 20), new THREE.MeshBasicMaterial({ color: '#000000' }));
      hole.position.y = r;
      g.add(hole);
      const rings = [];
      const cols = ['#7cffb2', '#c77dff', '#ff5d8f'];
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (1.05 + i * 0.25), r * 0.05, 8, 64), glow(cols[i], 2.4));
        ring.position.y = r;
        g.add(ring);
        rings.push(ring);
      }
      const disk = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r * 2.3, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2b8').multiplyScalar(1.5), transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      disk.rotation.x = -Math.PI / 2 + 0.25;
      disk.position.y = r;
      g.add(disk);
      anim.push((t) => {
        rings.forEach((q, i) => { q.rotation.x = t * (0.6 + i * 0.3); q.rotation.y = t * (0.4 - i * 0.2); });
        disk.rotation.z = t;
      });
      break;
    }
  }
  return { group: g, anim };
}

function orbiterMesh(type, r) {
  switch (type) {
    case 'hydra': {
      const grp = new THREE.Group();
      const skin = mat({ color: '#3e8a35', roughness: 0.6 });
      const h = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), skin);
      h.scale.set(1, 0.85, 1.3);
      const snout = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 1.2, 8), skin);
      snout.rotation.x = Math.PI / 2; snout.position.z = r * 1.1;
      const e = glow('#ff5d5d', 2.4);
      for (const s of [-1, 1]) { const q = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 6, 4), e); q.position.set(s * r * 0.45, r * 0.4, r * 0.7); grp.add(q); }
      grp.add(h, snout);
      return grp;
    }
    case 'wyrm': return new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat({ color: '#cdeeff', roughness: 0.05, metalness: 0.3, emissive: '#2a7ab0', emissiveIntensity: 0.6 }));
    case 'magma': return new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat({ color: '#2a1a14', roughness: 0.9, flatShading: true, emissive: '#ff3a0a', emissiveIntensity: 0.25 }));
    case 'kraken': {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.6, r * 2.2, 4, 10), mat({ color: '#8f3a5c', roughness: 0.5, emissive: '#2a0612', emissiveIntensity: 0.5 }));
      m.rotation.x = Math.PI / 2;
      const g = new THREE.Group(); g.add(m); return g;
    }
    default: return new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat({ color: '#e0d4ff', roughness: 0.1, metalness: 0.7, emissive: '#7cffb2', emissiveIntensity: 0.35, flatShading: true }));
  }
}

const PROJ_GEO = new THREE.SphereGeometry(0.28, 10, 8);
const PROJ_MAT = {
  bolt: glow('#ff5a3a', 2.4), seed: glow('#b6f03c', 2.2), lava: glow('#ff8a2a', 2.8), ink: glow('#c77dff', 2.2),
};

export class Boss {
  constructor(game, type, tier = 0) {
    const cfg = BOSSES[type] || BOSSES.scarab;
    this.game = game;
    this.type = type;
    this.cfg = cfg;
    this.name = cfg.name;
    this.maxHp = Math.round(cfg.hp * (1 + tier * 0.12));
    this.hp = this.maxHp;
    this.r = cfg.r;
    const f = game.field;
    this.range = Math.max(0, f.W / 2 - this.r - 1.2);
    this.x = 0;
    this.z = f.zTop + 3.4;
    this.t = 0;
    this.phase = 0;
    this.attackT = 2.5;
    this.alive = true;
    this.dying = 0;
    this.flashT = 0;
    this.visible = 1;
    this.teleT = 7;
    this.mats = [];
    const { group, anim } = buildModel(type, this.r, this.mats);
    this.group = group;
    this.anim = anim;
    game.scene.add(group);
    this.orbiters = [];
    for (let i = 0; i < (cfg.orbiters || 0); i++) {
      const orR = type === 'hydra' ? 0.7 : type === 'kraken' ? 0.5 : 0.55;
      const mesh = orbiterMesh(type, orR);
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = settings.shadows >= 2; });
      game.scene.add(mesh);
      this.orbiters.push({ a: (i / cfg.orbiters) * Math.PI * 2, r: orR, x: 0, z: 0, mesh, hp: cfg.orbHp || Infinity, alive: true, cd: 0 });
    }
    this.projectiles = [];
    this.beam = null;
    this.hitCd = new Map();
    this.speedK = 1;
  }

  get ratio() { return this.hp / this.maxHp; }

  update(dt) {
    const g = this.game, f = g.field;
    this.t += dt;
    if (this.dying > 0) return this.updateDeath(dt);
    // фазы
    const ph = this.ratio < 0.33 ? 2 : this.ratio < 0.66 ? 1 : 0;
    if (ph !== this.phase) {
      this.phase = ph;
      this.speedK = 1 + ph * 0.3;
      g.audio.bossRoar();
      g.fx.shake(0.4);
      g.ui.toast(ph === 2 ? 'ЯРОСТЬ' : 'ФАЗА II', 'boss');
      if (this.cfg.summon) g.spawnBossBricks(6 + ph * 4);
    }
    // движение
    this.x = Math.sin(this.t * this.cfg.sweep * this.speedK) * this.range;
    if (this.cfg.teleport) {
      this.teleT -= dt;
      if (this.teleT < 0.6 && this.teleT > 0) this.visible = Math.max(0, this.teleT / 0.6);
      if (this.teleT <= 0) {
        this.t = Math.random() * 100;
        this.teleT = 6 + Math.random() * 3;
        g.fx.sparksAt(this.x, 1, this.z, '#ffffff', 30, 6);
        g.audio.portal();
      }
      if (this.teleT > 5.4) this.visible = Math.min(1, (6.5 - this.teleT) / 0.6);
      else if (this.teleT >= 0.6) this.visible = 1;
    }
    this.group.position.set(this.x, Math.sin(this.t * 2) * 0.15, this.z);
    this.group.scale.setScalar(0.2 + 0.8 * this.visible);
    for (const a of this.anim) a(this.t, this);
    // вспышка урона
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.12);
      for (const m of this.mats) if (m.emissive) { m.userData.base ??= m.emissive.clone(); m.emissive.copy(m.userData.base).lerp(new THREE.Color(1, 1, 1), k); }
    }
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 4);
    // орбитали
    const oc = this.cfg;
    this.orbiters.forEach((o, i) => {
      if (!o.alive) return;
      o.a += dt * oc.orbitSpeed * this.speedK * (this.type === 'kraken' ? (i % 2 ? 1 : -1) : 1);
      let rr = oc.orbitR;
      if (oc.wobble) rr += Math.sin(this.t * 2 + i) * 0.9;
      o.x = this.x + Math.cos(o.a) * rr;
      o.z = this.z + Math.sin(o.a) * rr * 0.75;
      o.mesh.position.set(o.x, 0.7, o.z);
      o.mesh.rotation.y = -o.a + Math.PI / 2;
      if (this.type !== 'hydra' && this.type !== 'kraken') o.mesh.rotation.x += dt;
      o.cd = Math.max(0, o.cd - dt);
    });
    // атаки
    this.attackT -= dt * this.speedK;
    if (this.attackT <= 0 && this.visible > 0.9 && g.state === 'play') {
      this.attack();
      this.attackT = this.cfg.every * (1 - this.phase * 0.12) * (0.8 + Math.random() * 0.4);
    }
    this.updateBeam(dt);
    this.updateProjectiles(dt);
    for (const [k, v] of this.hitCd) { if (v - dt <= 0) this.hitCd.delete(k); else this.hitCd.set(k, v - dt); }
  }

  attack() {
    const g = this.game;
    let kind = this.cfg.attack;
    if (kind === 'all') kind = ['spread', 'aimed', 'rain', 'beam'][Math.floor(Math.random() * 4)];
    const px = g.paddle.x, pz = g.paddle.z;
    const shoot = (x, z, vx, vz, k = 'bolt') => this.projectiles.push(this.makeProj(x, z, vx, vz, k));
    const sp = 7 + this.phase * 1.5;
    switch (kind) {
      case 'spread': {
        const n = 3 + this.phase;
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.28;
          shoot(this.x, this.z + this.r, Math.sin(a) * sp, Math.cos(a) * sp);
        }
        break;
      }
      case 'aimed': {
        const heads = this.orbiters.filter((o) => o.alive && o.hp !== Infinity);
        const srcs = heads.length ? heads : [{ x: this.x, z: this.z + this.r }];
        for (const s of srcs) {
          const dx = px - s.x, dz = pz - s.z, d = Math.hypot(dx, dz);
          shoot(s.x, s.z, (dx / d) * sp, (dz / d) * sp, this.type === 'hydra' ? 'seed' : 'bolt');
        }
        break;
      }
      case 'burst': {
        this.recoil = 1;
        for (let i = 0; i < 3 + this.phase; i++) {
          setTimeout(() => {
            if (!this.alive || this.dying) return;
            for (const s of [-1, 1]) {
              const sx = this.x + s * this.r * 1.05, sz = this.z + this.r;
              const dx = g.paddle.x - sx, dz = g.paddle.z - sz, d = Math.hypot(dx, dz);
              shoot(sx, sz, (dx / d) * sp * 1.2, (dz / d) * sp * 1.2);
            }
            g.audio.bossShot();
          }, i * 160);
        }
        break;
      }
      case 'rain': {
        const f = g.field;
        for (let i = 0; i < 4 + this.phase * 2; i++) {
          const x = (Math.random() - 0.5) * (f.W - 2);
          shoot(x, this.z + 1, 0, 4.5 + Math.random() * 2, 'lava');
        }
        break;
      }
      case 'ink': {
        const dx = px - this.x, dz = pz - this.z, d = Math.hypot(dx, dz);
        shoot(this.x, this.z + this.r, (dx / d) * sp, (dz / d) * sp, 'ink');
        if (Math.random() < 0.5 + this.phase * 0.2) g.ui.ink();
        break;
      }
      case 'beam': {
        this.startBeam();
        break;
      }
    }
    g.audio.bossShot();
  }

  makeProj(x, z, vx, vz, kind) {
    const mesh = new THREE.Mesh(PROJ_GEO, PROJ_MAT[kind] || PROJ_MAT.bolt);
    mesh.position.set(x, 0.6, z);
    this.game.scene.add(mesh);
    return { x, z, vx, vz, kind, mesh, life: 6 };
  }

  startBeam() {
    const g = this.game;
    const len = g.paddle.z - this.z + 1;
    const geo = new THREE.BoxGeometry(0.5, 0.1, len);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#5fd0ff').multiplyScalar(2.5), transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beamX = g.paddle.x;
    m.position.set(this.beamX, 0.3, this.z + len / 2);
    g.scene.add(m);
    this.beam = { m, t: 0 };
  }

  updateBeam(dt) {
    if (!this.beam) return;
    const b = this.beam, g = this.game;
    b.t += dt;
    if (b.t < 0.9) {
      b.m.material.opacity = 0.1 + Math.sin(b.t * 30) * 0.08;
      b.m.scale.x = 0.4;
    } else if (b.t < 1.4) {
      b.m.material.opacity = 0.9;
      b.m.scale.x = 1.6;
      if (!b.hit && Math.abs(g.paddle.x - this.beamX) < g.paddle.halfW + 0.4) {
        b.hit = true;
        g.paddleHit('freeze');
      }
      if (Math.random() < 0.5) g.fx.sparksAt(this.beamX, 0.4, g.paddle.z - 0.5, '#bfefff', 4, 3);
    } else {
      g.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose();
      this.beam = null;
    }
  }

  updateProjectiles(dt) {
    const g = this.game, p = g.paddle, f = g.field;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      q.x += q.vx * dt; q.z += q.vz * dt; q.life -= dt;
      q.mesh.position.set(q.x, 0.6, q.z);
      q.mesh.rotation.y += dt * 5;
      if (Math.random() < 0.6 * settings.particles) g.fx.sparks.emit(q.x, 0.6, q.z, 0, 0.5, 0, q.mesh.material.color, 0.35, 0.25, { grow: -0.5 });
      let dead = q.life <= 0 || q.z > f.zBottom + 2 || Math.abs(q.x) > f.W / 2 + 1;
      if (!dead && g.shield > 0 && q.z > f.shieldZ - 0.2) {
        dead = true;
        g.fx.sparksAt(q.x, 0.4, q.z, '#9fe8ff', 12, 4);
      } else if (!dead && Math.abs(q.z - p.z) < 0.55 && Math.abs(q.x - p.x) < p.halfW + 0.2) {
        dead = true;
        g.paddleHit(q.kind);
      }
      if (dead) {
        g.scene.remove(q.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // Столкновение шара с боссом и его орбиталями. Возвращает true при контакте.
  collide(ball) {
    if (this.dying || this.visible < 0.5) return false;
    let hit = false;
    for (const o of this.orbiters) {
      if (!o.alive) continue;
      if (this.circle(ball, o.x, o.z, o.r + 0.15)) {
        hit = true;
        if (o.hp !== Infinity && o.cd <= 0) {
          o.hp -= ball.fire ? 2 : 1;
          o.cd = 0.15;
          this.game.fx.sparksAt(o.x, 0.7, o.z, '#ffd27a', 14, 5);
          this.game.audio.bossHit();
          if (o.hp <= 0) {
            o.alive = false;
            this.game.scene.remove(o.mesh);
            this.game.fx.explode(o.x, o.z, 0.8, '#3e8a35');
            this.game.audio.explosion(0.8);
            this.damage(3, o.x, o.z);
          }
        } else {
          this.game.audio.metal();
          this.game.fx.sparksAt(ball.x, 0.5, ball.z, '#e8f4ff', 6, 3);
        }
      }
    }
    if (this.circle(ball, this.x, this.z, this.r)) {
      hit = true;
      const key = ball.id;
      if (!this.hitCd.has(key)) {
        this.hitCd.set(key, 0.12);
        // у гидры тело неуязвимо, пока живы головы
        const shielded = this.type === 'hydra' && this.orbiters.some((o) => o.alive);
        if (shielded) { this.game.audio.metal(); this.game.ui.toast('СНАЧАЛА ГОЛОВЫ', 'boss'); }
        else this.damage(ball.mega ? 4 : ball.fire ? 2 : 1, ball.x, ball.z);
        if (ball.mega) { this.game.megaBlast(ball.x, ball.z); }
      }
    }
    return hit;
  }

  circle(ball, cx, cz, r) {
    const dx = ball.x - cx, dz = ball.z - cz;
    const R = r + ball.r, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
    ball.x = cx + nx * (R + 0.01);
    ball.z = cz + nz * (R + 0.01);
    const vn = ball.vx * nx + ball.vz * nz;
    if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vz -= 2 * vn * nz; }
    return true;
  }

  damage(n, x, z) {
    const g = this.game;
    this.hp = Math.max(0, this.hp - n);
    this.flashT = 0.12;
    g.fx.sparksAt(x, 0.8, z, '#ffffff', 18, 6);
    g.fx.debris.spawn(x, 0.8, z, '#888', g.fx.debrisAmount(6), { speed: 5, up: 5, size: 0.18 });
    g.fx.shake(0.12);
    g.audio.bossHit();
    g.addScore(250, x, z);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dying = 2.4;
    this.game.onBossDying(this);
    for (const q of this.projectiles) this.game.scene.remove(q.mesh);
    this.projectiles.length = 0;
  }

  updateDeath(dt) {
    const g = this.game;
    this.dying -= dt;
    this.group.position.x = this.x + (Math.random() - 0.5) * 0.3;
    this.group.rotation.z = (Math.random() - 0.5) * 0.15;
    if (Math.random() < dt * 9) {
      const ex = this.x + (Math.random() - 0.5) * this.r * 2.2, ez = this.z + (Math.random() - 0.5) * this.r * 2;
      g.fx.explode(ex, ez, 0.6, '#555');
      g.audio.explosion(0.5);
    }
    if (this.dying <= 0) {
      g.fx.explode(this.x, this.z, 2.4, '#777');
      for (let i = 0; i < 4; i++) g.fx.debris.spawn(this.x, 1.2, this.z, ['#444', '#888', '#c9a', '#fff'][i], g.fx.debrisAmount(40), { speed: 14, up: 12, size: 0.35, life: 6, sx: 3, sz: 3 });
      g.audio.explosion(2);
      this.alive = false;
      this.dispose();
      g.onBossDead(this);
    }
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.group);
    for (const o of this.orbiters) s.remove(o.mesh);
    for (const q of this.projectiles) s.remove(q.mesh);
    if (this.beam) s.remove(this.beam.m);
    this.projectiles.length = 0;
  }
}
