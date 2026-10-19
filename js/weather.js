// Погода: визуальные эффекты + влияние на физику шара и ракетки.
import * as THREE from 'three';
import { settings } from './settings.js';
import { dotTexture } from './textures.js';
import { glow } from './mat.js';

const DOT = dotTexture();

function pointsLayer(scene, count, color, size, opacity = 0.9, additive = false) {
  const pos = new Float32Array(count * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.PointsMaterial({
    color, size, map: DOT, transparent: true, opacity, depthWrite: false, sizeAttenuation: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return { p, pos, g, m, count };
}

export class Weather {
  constructor(scene, loc, field, game) {
    this.scene = scene;
    this.type = loc.weather;
    this.loc = loc;
    this.field = field;
    this.game = game;
    this.t = 0;
    this.windX = 0;
    this.windDir = Math.random() < 0.5 ? -1 : 1;
    this.speedMul = 1;
    this.paddleInertia = 0;
    this.objects = [];
    this.wells = [];
    this.bubbles = [];
    this.geysers = [];
    this.nextEvent = 4 + Math.random() * 3;
    this.gust = 0;
    this.gustT = 0;
    this.hud = '';
    this.flashLevel = 0;
    const area = Math.max(1, (field.W * (field.zBottom - field.zTop)) / (18 * 26));
    this.density = settings.weatherFx * Math.min(3, area);
    this.bx = field.W / 2 + 6;
    this.bz0 = field.zTop - 6; this.bz1 = field.zBottom + 6;
    this.build();
  }

  rndX() { return (Math.random() * 2 - 1) * this.bx; }
  rndZ() { return this.bz0 + Math.random() * (this.bz1 - this.bz0); }

  build() {
    const d = this.density;
    switch (this.type) {
      case 'sandstorm':
        this.layer = pointsLayer(this.scene, Math.round(1600 * d), '#e9c08a', 0.16, 0.75);
        this.seed(this.layer, 0, 6);
        this.speedMul = 1;
        break;
      case 'rain':
      case 'storm':
        this.buildRain(Math.round((this.type === 'storm' ? 1300 : 1100) * d));
        this.speedMul = this.type === 'rain' ? 0.92 : 1;
        this.paddleInertia = this.type === 'rain' ? 0.1 : 0.04;
        break;
      case 'blizzard':
        this.layer = pointsLayer(this.scene, Math.round(1500 * d), '#ffffff', 0.2, 0.9);
        this.seed(this.layer, 0, 18);
        this.speedMul = 0.96;
        this.paddleInertia = 0.22;
        break;
      case 'ash':
        this.layer = pointsLayer(this.scene, Math.round(700 * d), '#3a3330', 0.18, 0.8);
        this.embers = pointsLayer(this.scene, Math.round(380 * d), '#ff7a2a', 0.16, 1, true);
        this.embers.m.color.multiplyScalar(2.2);
        this.seed(this.layer, 0, 16);
        this.seed(this.embers, 0, 10);
        break;
      case 'underwater':
        this.layer = pointsLayer(this.scene, Math.round(500 * d), '#bff6ff', 0.14, 0.55, true);
        this.seed(this.layer, 0, 14);
        this.speedMul = 0.86;
        break;
      case 'space':
        this.layer = pointsLayer(this.scene, Math.round(300 * d), '#9fb4ff', 0.08, 0.7, true);
        this.seed(this.layer, 0, 10);
        this.buildWells();
        break;
      case 'void':
        this.layer = pointsLayer(this.scene, Math.round(400 * d), '#7cffb2', 0.12, 0.7, true);
        this.seed(this.layer, 0, 12);
        this.buildBubbles();
        break;
    }
    if (this.layer) this.objects.push(this.layer.p);
    if (this.embers) this.objects.push(this.embers.p);
  }

  seed(L, y0, y1) {
    for (let i = 0; i < L.count; i++) {
      L.pos[i * 3] = this.rndX(); L.pos[i * 3 + 1] = y0 + Math.random() * (y1 - y0); L.pos[i * 3 + 2] = this.rndZ();
    }
  }

  buildRain(n) {
    this.rainN = n;
    this.rainPos = new Float32Array(n * 6);
    this.rainSpd = new Float32Array(n);
    for (let i = 0; i < n; i++) this.resetDrop(i, Math.random() * 22);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ color: this.type === 'storm' ? '#9fb0d8' : '#cfe6ff', transparent: true, opacity: 0.38, depthWrite: false });
    this.rain = new THREE.LineSegments(g, m);
    this.rain.frustumCulled = false;
    this.rainGeo = g;
    this.scene.add(this.rain);
    this.objects.push(this.rain);
  }

  resetDrop(i, y = 22) {
    const x = this.rndX(), z = this.rndZ();
    const o = i * 6;
    this.rainPos[o] = x; this.rainPos[o + 1] = y; this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x; this.rainPos[o + 4] = y + 0.7; this.rainPos[o + 5] = z;
    this.rainSpd[i] = 22 + Math.random() * 10;
  }

  buildWells() {
    const f = this.field;
    const n = f.W > 30 ? 3 : f.W > 20 ? 2 : (Math.random() < 0.5 ? 1 : 2);
    const zMid = f.brickBottom + (f.paddleZ - f.brickBottom) * 0.42;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? (Math.random() - 0.5) * f.W * 0.4 : (-f.W / 2 + f.W * (i + 0.5) / n) + (Math.random() - 0.5) * 2;
      const z = zMid + (Math.random() - 0.5) * 2;
      const grp = new THREE.Group();
      grp.position.set(x, 0.05, z);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 12), new THREE.MeshBasicMaterial({ color: '#000000' }));
      core.position.y = 0.45;
      const disc = new THREE.Mesh(new THREE.RingGeometry(0.5, 2.2, 48, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb36b').multiplyScalar(1.6), transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2 + 0.15;
      disc.position.y = 0.45;
      const halo = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.7, 64), glow('#ffbe0b', 1.2, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      halo.rotation.x = -Math.PI / 2;
      grp.add(core, disc, halo);
      this.scene.add(grp);
      this.objects.push(grp);
      this.wells.push({ x, z, G: 15, grp, disc });
    }
  }

  buildBubbles() {
    const f = this.field;
    const n = f.W > 24 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const slow = i % 2 === 0;
      const r = 1.8 + Math.random() * 1.2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16),
        new THREE.MeshBasicMaterial({ color: slow ? '#5ad1ff' : '#ff5d8f', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.97, r, 64), glow(slow ? '#5ad1ff' : '#ff5d8f', 1.5, { transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      const grp = new THREE.Group();
      grp.add(m, ring);
      const b = {
        x: (Math.random() - 0.5) * f.W * 0.7, z: f.brickBottom + (f.paddleZ - f.brickBottom) * (0.2 + Math.random() * 0.5),
        r, k: slow ? 0.55 : 1.55, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 1, grp,
      };
      grp.position.set(b.x, 0.2, b.z);
      this.scene.add(grp);
      this.objects.push(grp);
      this.bubbles.push(b);
    }
  }

  // Силы на шар (вызывается на каждом шаге физики)
  force(ball, dt) {
    switch (this.type) {
      case 'sandstorm':
        ball.vx += this.windX * 0.75 * dt;
        break;
      case 'storm':
      case 'blizzard':
        ball.vx += this.windX * 0.55 * dt;
        break;
      case 'ash': {
        const n = Math.sin(this.t * 2.3 + ball.z * 0.7) * Math.cos(this.t * 1.7 + ball.x * 0.5);
        ball.vx += n * 3.2 * dt;
        for (const g of this.geysers) {
          if (g.state !== 'erupt') continue;
          const dx = ball.x - g.x, dz = ball.z - g.z, d = Math.hypot(dx, dz);
          if (d < g.r) {
            const k = (1 - d / g.r) * 60 * dt;
            ball.vx += (dx / (d + 0.01)) * k;
            ball.vz += (dz / (d + 0.01)) * k * 0.6;
            ball.hop = Math.max(ball.hop || 0, 1.6);
          }
        }
        break;
      }
      case 'underwater': {
        ball.vz -= 1.4 * dt; // всплытие к кирпичам
        ball.vx += Math.sin(ball.z * 0.32 + this.t * 0.6) * 2.4 * dt;
        break;
      }
      case 'space':
        for (const w of this.wells) {
          const dx = w.x - ball.x, dz = w.z - ball.z, d2 = dx * dx + dz * dz;
          const d = Math.sqrt(d2) + 0.001;
          const a = w.G / (d2 + 2.2);
          ball.vx += (dx / d) * a * dt * 6;
          ball.vz += (dz / d) * a * dt * 6;
        }
        break;
      case 'void':
        for (const g of this.game.bossGravity || []) {
          const dx = g.x - ball.x, dz = g.z - ball.z, d2 = dx * dx + dz * dz, d = Math.sqrt(d2) + 0.01;
          ball.vx += (dx / d) * (g.G / (d2 + 3)) * dt * 6;
          ball.vz += (dz / d) * (g.G / (d2 + 3)) * dt * 6;
        }
        break;
    }
  }

  // Множитель скорости времени для шара в точке (пузыри искажения)
  timeScaleAt(x, z) {
    for (const b of this.bubbles) {
      const dx = x - b.x, dz = z - b.z;
      if (dx * dx + dz * dz < b.r * b.r) return b.k;
    }
    return 1;
  }

  event() {
    const g = this.game;
    switch (this.type) {
      case 'storm': {
        const b = g.randomBrick(true);
        if (b) this.lightning(b.x, b.z, () => g.weatherStrike(b, 'lightning'));
        this.nextEvent = 5 + Math.random() * 6;
        break;
      }
      case 'ash': {
        const f = this.field;
        const x = (Math.random() - 0.5) * (f.W - 3);
        const z = f.brickBottom + 1.5 + Math.random() * Math.max(1, f.paddleZ - f.brickBottom - 5);
        this.spawnGeyser(x, z);
        if (Math.random() < 0.45) {
          const b = g.randomBrick(true);
          if (b) g.weatherStrike(b, 'bomb');
        }
        this.nextEvent = 3.5 + Math.random() * 3;
        break;
      }
      case 'space': {
        const b = g.randomBrick(true);
        if (b) this.meteor(b);
        this.nextEvent = 5 + Math.random() * 5;
        break;
      }
      case 'sandstorm':
        this.gustT = 2.2 + Math.random() * 1.5;
        this.windDir = Math.random() < 0.65 ? this.windDir : -this.windDir;
        this.nextEvent = 5 + Math.random() * 4;
        break;
      case 'rain':
        this.gustT = 4;
        this.nextEvent = 9 + Math.random() * 6;
        break;
      default:
        this.nextEvent = 9999;
    }
  }

  lightning(x, z, onHit) {
    const pts = [];
    let px = x + (Math.random() - 0.5) * 6, py = 30, pz = z - 8;
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const tx = px + (x - px) * k + (i < steps ? (Math.random() - 0.5) * 2 : 0);
      const tz = pz + (z - pz) * k + (i < steps ? (Math.random() - 0.5) * 1.5 : 0);
      pts.push(new THREE.Vector3(tx, py * (1 - k) + 0.4, tz));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const bolt = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color('#e8eeff').multiplyScalar(3), transparent: true }));
    this.scene.add(bolt);
    this.flashLevel = settings.flashes ? 1 : 0.25;
    this.game.fx.flash(x, 4, z, '#c8d6ff', 120, 0.25);
    this.game.audio?.thunder();
    let life = 0.28;
    this.temp = this.temp || [];
    this.temp.push({ obj: bolt, life, update: (o, dt) => { o.material.opacity = Math.max(0, o.material.opacity - dt * 3.5); } });
    onHit();
  }

  meteor(b) {
    const grp = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf7a').multiplyScalar(2) }));
    grp.add(rock);
    const from = new THREE.Vector3(b.x + (Math.random() < 0.5 ? -1 : 1) * 14, 16, b.z - 10);
    grp.position.copy(from);
    this.scene.add(grp);
    const to = new THREE.Vector3(b.x, 0.4, b.z);
    const dur = 0.9;
    let t = 0;
    this.temp = this.temp || [];
    this.temp.push({
      obj: grp, life: dur, update: (o, dt) => {
        t += dt;
        o.position.lerpVectors(from, to, Math.min(1, t / dur));
        this.game.fx.sparks.emit(o.position.x, o.position.y, o.position.z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5),
          new THREE.Color('#ffb15e'), 0.5, 0.5, { grow: 1, drag: 2 });
      },
      done: () => { if (b.alive) this.game.weatherStrike(b, 'meteor'); },
    });
  }

  spawnGeyser(x, z) {
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.3, 32), glow('#ff6a1a', 1.6, { transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(x, 0.03, z);
    this.scene.add(mark);
    this.geysers.push({ x, z, r: 1.4, t: 0, state: 'warn', mark });
  }

  update(dt) {
    this.t += dt;
    const f = this.field;
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) this.event();

    // ветер
    if (this.type === 'sandstorm') {
      this.gustT = Math.max(0, this.gustT - dt);
      const target = this.windDir * (1.6 + (this.gustT > 0 ? 4.2 : 0) + Math.sin(this.t * 0.7) * 0.6);
      this.windX += (target - this.windX) * Math.min(1, dt * 1.5);
      if (this.game.scene.fog && this.game.env?.baseFog) {
        const vis = this.gustT > 0 ? 0.55 : 1;
        const fog = this.game.scene.fog, base = this.game.env.baseFog;
        fog.far += (base.far * vis - fog.far) * dt;
        fog.near += (base.near * vis - fog.near) * dt;
      }
    } else if (this.type === 'storm') {
      this.windX = Math.sin(this.t * 0.4) * 2.5 + Math.sin(this.t * 1.3) * 1.2;
    } else if (this.type === 'blizzard') {
      this.windX = Math.sin(this.t * 0.25) * 2.2;
    } else if (this.type === 'rain') {
      this.gustT = Math.max(0, this.gustT - dt);
      this.speedMul = this.gustT > 0 ? 0.85 : 0.93;
      this.windX = Math.sin(this.t * 0.3) * 0.6;
    }
    f.windX = this.windX;

    // частицы
    const L = this.layer;
    if (L) {
      const P = L.pos;
      for (let i = 0; i < L.count; i++) {
        const o = i * 3;
        switch (this.type) {
          case 'sandstorm':
            P[o] += (this.windX * 4 + 3 * this.windDir) * dt * (0.6 + (i % 7) / 7);
            P[o + 1] += Math.sin(this.t * 3 + i) * dt * 0.5;
            P[o + 2] += Math.sin(this.t + i * 0.1) * dt;
            break;
          case 'blizzard':
            P[o] += (this.windX * 2.2 + Math.sin(this.t * 2 + i) * 0.6) * dt;
            P[o + 1] -= (2 + (i % 5) * 0.4) * dt;
            break;
          case 'ash':
            P[o] += Math.sin(this.t + i) * 0.4 * dt;
            P[o + 1] -= 0.9 * dt;
            break;
          case 'underwater':
            P[o + 1] += (1.2 + (i % 4) * 0.4) * dt;
            P[o] += Math.sin(this.t * 2 + i) * 0.3 * dt;
            break;
          case 'space':
            P[o + 2] += 2.5 * dt;
            break;
          case 'void':
            P[o + 1] += Math.sin(this.t * 0.8 + i) * 0.4 * dt;
            P[o] += Math.cos(this.t * 0.6 + i) * 0.4 * dt;
            break;
        }
        if (P[o] > this.bx) P[o] -= this.bx * 2;
        if (P[o] < -this.bx) P[o] += this.bx * 2;
        if (P[o + 1] < 0) P[o + 1] += 16;
        if (P[o + 1] > 16) P[o + 1] -= 16;
        if (P[o + 2] > this.bz1) P[o + 2] = this.bz0;
      }
      L.g.attributes.position.needsUpdate = true;
    }
    if (this.embers) {
      const P = this.embers.pos;
      for (let i = 0; i < this.embers.count; i++) {
        const o = i * 3;
        P[o + 1] += (1.2 + (i % 5) * 0.3) * dt;
        P[o] += Math.sin(this.t * 1.5 + i) * 0.6 * dt;
        if (P[o + 1] > 10) { P[o + 1] = 0; P[o] = this.rndX(); P[o + 2] = this.rndZ(); }
      }
      this.embers.g.attributes.position.needsUpdate = true;
    }
    if (this.rain) {
      const P = this.rainPos, wx = this.windX * 0.06;
      const heavy = this.gustT > 0 ? 1.3 : 1;
      for (let i = 0; i < this.rainN; i++) {
        const o = i * 6, s = this.rainSpd[i] * heavy * dt;
        P[o + 1] -= s; P[o + 4] -= s;
        P[o] += wx * s; P[o + 3] = P[o] - wx * 0.7 * 8;
        if (P[o + 1] < 0) {
          if (i % 9 === 0 && Math.abs(P[o]) < f.W / 2) {
            this.game.fx.sparks.emit(P[o], 0.05, P[o + 2], 0, 1.5, 0, this.splashColor || (this.splashColor = new THREE.Color('#9fc2e8')), 0.12, 0.2, { gravity: 8 });
          }
          this.resetDrop(i, 20 + Math.random() * 3);
        }
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }

    // колодцы
    for (const w of this.wells) w.disc.rotation.z += dt * 2.4;
    // пузыри
    for (const b of this.bubbles) {
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (Math.abs(b.x) > f.W / 2 - b.r) b.vx *= -1;
      if (b.z < f.brickBottom || b.z > f.paddleZ - 3) b.vz *= -1;
      b.grp.position.set(b.x, 0.2, b.z);
      b.grp.children[0].scale.setScalar(1 + Math.sin(this.t * 3) * 0.03);
    }
    // гейзеры
    for (let i = this.geysers.length - 1; i >= 0; i--) {
      const g = this.geysers[i];
      g.t += dt;
      if (g.state === 'warn') {
        g.mark.material.opacity = 0.3 + Math.sin(g.t * 20) * 0.3;
        if (Math.random() < 0.4) this.game.fx.smoke.emit(g.x, 0.1, g.z, 0, 1.2, 0, new THREE.Color('#5a4a40'), 0.8, 0.8, { grow: 1.5, alpha: 0.4 });
        if (g.t > 1.3) { g.state = 'erupt'; g.t = 0; this.game.audio?.geyser(); this.game.fx.shake(0.15); }
      } else if (g.state === 'erupt') {
        g.mark.material.opacity = 0.9;
        const c = this.fireCol || (this.fireCol = [new THREE.Color('#ffd27a'), new THREE.Color('#ff7a2a'), new THREE.Color('#ff3d14')]);
        for (let k = 0; k < Math.max(1, Math.round(6 * settings.particles)); k++) {
          this.game.fx.sparks.emit(g.x + (Math.random() - 0.5) * 0.8, 0.2, g.z + (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 1.5, 7 + Math.random() * 5, (Math.random() - 0.5) * 1.5,
            c[k % 3], 0.5 + Math.random() * 0.4, 0.7, { drag: 0.8, gravity: 6, grow: 0.6 });
        }
        if (g.t > 1.6) { g.state = 'done'; g.t = 0; }
      } else {
        g.mark.material.opacity -= dt;
        if (g.mark.material.opacity <= 0) {
          this.scene.remove(g.mark);
          g.mark.geometry.dispose(); g.mark.material.dispose();
          this.geysers.splice(i, 1);
        }
      }
    }
    // временные объекты (молнии, метеоры)
    if (this.temp) {
      for (let i = this.temp.length - 1; i >= 0; i--) {
        const o = this.temp[i];
        o.life -= dt;
        o.update?.(o.obj, dt);
        if (o.life <= 0) {
          o.done?.();
          this.scene.remove(o.obj);
          o.obj.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); });
          this.temp.splice(i, 1);
        }
      }
    }
    // вспышка молнии подсвечивает сцену
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - dt * 4);
      const env = this.game.env;
      if (env) env.hemi.intensity = env.hemiBase + this.flashLevel * 3;
    }

    // строка для HUD
    switch (this.type) {
      case 'sandstorm': case 'storm': case 'blizzard': {
        const v = this.windX;
        this.hud = `${v < 0 ? '←' : '→'} ${Math.abs(v).toFixed(1)} м/с`;
        break;
      }
      case 'rain': this.hud = this.gustT > 0 ? 'ЛИВЕНЬ ×1.3' : 'ДОЖДЬ'; break;
      case 'ash': this.hud = this.geysers.some((g) => g.state !== 'done') ? 'ГЕЙЗЕР!' : 'ТУРБУЛЕНТНОСТЬ'; break;
      case 'underwater': this.hud = 'ТЕЧЕНИЕ ↑'; break;
      case 'space': this.hud = `КОЛОДЦЫ ×${this.wells.length}`; break;
      case 'void': this.hud = 'ВРЕМЯ ±'; break;
    }
  }

  dispose() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose?.(); });
    }
    for (const g of this.geysers) this.scene.remove(g.mark);
    for (const o of this.temp || []) this.scene.remove(o.obj);
    this.field.windX = 0;
  }
}
