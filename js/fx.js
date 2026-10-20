// Эффекты: физические обломки (rigid-body-lite), частицы, ударные волны, вспышки, тряска камеры.
import * as THREE from 'three';
import { settings } from './settings.js';
import { mat } from './mat.js';
import { dotTexture, smokeTexture } from './textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ——— Обломки: инстансовые осколки с гравитацией, отскоками, трением и вращением ———
export class Debris {
  constructor(scene, capacity) {
    this.cap = Math.max(16, capacity | 0);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, mat({ color: '#ffffff', roughness: 0.45, metalness: 0.15 }), this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = settings.shadows >= 2;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < this.cap; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    scene.add(this.mesh);
    const n = this.cap;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.r = new Float32Array(n * 3); this.w = new Float32Array(n * 3);
    this.sz = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.sleep = new Uint8Array(n);
    this.next = 0;
    this.alive = 0;
    this.color = new THREE.Color();
  }

  spawn(x, y, z, color, count, o = {}) {
    const speed = o.speed ?? 6, up = o.up ?? 5, size = o.size ?? 0.22, life = o.life ?? 3.5;
    const sx = o.sx ?? 1, sz = o.sz ?? 0.5;
    count = Math.min(count, this.cap);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      const i3 = i * 3;
      this.p[i3] = x + (Math.random() - 0.5) * sx; this.p[i3 + 1] = y + Math.random() * 0.4; this.p[i3 + 2] = z + (Math.random() - 0.5) * sz;
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.9);
      this.v[i3] = Math.cos(a) * s + (o.vx ?? 0); this.v[i3 + 1] = up * (0.4 + Math.random()); this.v[i3 + 2] = Math.sin(a) * s + (o.vz ?? 0);
      this.r[i3] = Math.random() * 6; this.r[i3 + 1] = Math.random() * 6; this.r[i3 + 2] = Math.random() * 6;
      this.w[i3] = (Math.random() - 0.5) * 22; this.w[i3 + 1] = (Math.random() - 0.5) * 22; this.w[i3 + 2] = (Math.random() - 0.5) * 22;
      const base = size * (0.5 + Math.random());
      this.sz[i3] = base * (0.6 + Math.random() * 0.9); this.sz[i3 + 1] = base * (0.4 + Math.random() * 0.6); this.sz[i3 + 2] = base * (0.6 + Math.random() * 0.9);
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
      this.sleep[i] = 0;
      this.color.set(color);
      const j = 0.75 + Math.random() * 0.35;
      this.color.multiplyScalar(j);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  // Радиальный импульс (взрыв) — разбрасывает лежащие и летящие осколки
  impulse(x, z, radius, strength) {
    const r2 = radius * radius;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      const dx = this.p[i3] - x, dz = this.p[i3 + 2] - z, d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) + 0.001, f = strength * (1 - d / radius);
      this.v[i3] += (dx / d) * f; this.v[i3 + 2] += (dz / d) * f; this.v[i3 + 1] += f * 0.8;
      this.w[i3] += (Math.random() - 0.5) * f * 4; this.w[i3 + 2] += (Math.random() - 0.5) * f * 4;
      this.sleep[i] = 0;
    }
  }

  update(dt, field, solidTop) {
    const g = field.gravity ?? 22, hw = field.W / 2, zTop = field.zTop, floorEnd = field.zBottom + 3.5;
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      const i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.mesh.setMatrixAt(i, ZERO); continue; }
      const hy = this.sz[i3 + 1] * 0.5;
      if (!this.sleep[i]) {
        this.v[i3 + 1] -= g * dt;
        if (field.windX) this.v[i3] += field.windX * dt * 0.6;
        let x = this.p[i3] + this.v[i3] * dt, y = this.p[i3 + 1] + this.v[i3 + 1] * dt, z = this.p[i3 + 2] + this.v[i3 + 2] * dt;
        const onField = Math.abs(x) < hw && z > zTop && z < floorEnd;
        let floor = onField ? 0 : -0.7;
        if (onField && solidTop) {
          const top = solidTop(x, z);
          if (top > 0 && this.p[i3 + 1] - hy >= top - 0.15) floor = top;
          else if (top > 0 && y - hy < top) { // врезался в бок кирпича
            this.v[i3] *= -0.4; this.v[i3 + 2] *= -0.4;
            x = this.p[i3]; z = this.p[i3 + 2];
          }
        }
        // стены рамки
        if (y < 0.9 && Math.abs(x) > hw - 0.05 && Math.abs(this.p[i3]) <= hw - 0.05) { this.v[i3] *= -0.5; x = this.p[i3]; }
        if (y < 0.9 && z < zTop + 0.05 && this.p[i3 + 2] >= zTop + 0.05 && Math.abs(x) < hw) { this.v[i3 + 2] *= -0.5; z = this.p[i3 + 2]; }
        if (y - hy < floor) {
          y = floor + hy;
          if (this.v[i3 + 1] < -1.2) {
            this.v[i3 + 1] *= -0.32;
            this.w[i3] *= 0.55; this.w[i3 + 1] *= 0.55; this.w[i3 + 2] *= 0.55;
          } else this.v[i3 + 1] = 0;
          this.v[i3] *= 0.78; this.v[i3 + 2] *= 0.78;
          if (Math.abs(this.v[i3]) + Math.abs(this.v[i3 + 1]) + Math.abs(this.v[i3 + 2]) < 0.25) {
            this.sleep[i] = 1;
            // укладываем плашмя
            this.r[i3] = Math.round(this.r[i3] / (Math.PI / 2)) * (Math.PI / 2);
            this.r[i3 + 2] = Math.round(this.r[i3 + 2] / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
        this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
        this.r[i3] += this.w[i3] * dt; this.r[i3 + 1] += this.w[i3 + 1] * dt; this.r[i3 + 2] += this.w[i3 + 2] * dt;
      } else if (solidTop) {
        // проснуться, если опора исчезла
        const top = solidTop(this.p[i3], this.p[i3 + 2]);
        if (this.p[i3 + 1] - hy > Math.max(0, top) + 0.05) this.sleep[i] = 0;
      }
      const fade = Math.min(1, this.life[i] / 0.6);
      _p.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
      _e.set(this.r[i3], this.r[i3 + 1], this.r[i3 + 2]);
      _q.setFromEuler(_e);
      _s.set(this.sz[i3] * fade, this.sz[i3 + 1] * fade, this.sz[i3 + 2] * fade);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    if (any || this._wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this._wasAny = any;
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.cap; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ——— Частицы на GPU-точках ———
const P_VERT = /* glsl */`
attribute float size; attribute vec4 pcolor;
uniform float scale;
varying vec4 vColor;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const P_FRAG = /* glsl */`
uniform sampler2D map;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(scene, capacity, { texture, additive = true } = {}) {
    this.cap = Math.max(8, capacity | 0);
    const n = this.cap;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.base = new Float32Array(n); this.grow = new Float32Array(n);
    this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    this.rgb = new Float32Array(n * 3); this.alpha0 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: texture }, scale: { value: 400 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
    this.next = 0;
    this.geo = g;
  }

  emit(x, y, z, vx, vy, vz, color, size, life, o = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.rgb[i3] = color.r; this.rgb[i3 + 1] = color.g; this.rgb[i3 + 2] = color.b;
    this.alpha0[i] = o.alpha ?? 1;
    this.life[i] = this.max[i] = life;
    this.base[i] = size; this.grow[i] = o.grow ?? 0;
    this.drag[i] = o.drag ?? 1.5; this.grav[i] = o.gravity ?? 0;
  }

  update(dt, viewportH) {
    this.mat.uniforms.scale.value = viewportH * 0.9;
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      const i3 = i * 3, i4 = i * 4;
      if (this.life[i] <= 0) { if (this.col[i4 + 3] !== 0) { this.col[i4 + 3] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      any = true;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k; this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt; this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      this.col[i4] = this.rgb[i3]; this.col[i4 + 1] = this.rgb[i3 + 1]; this.col[i4 + 2] = this.rgb[i3 + 2];
      this.col[i4 + 3] = this.alpha0[i] * Math.min(1, t * 2.2);
      this.size[i] = this.base[i] * (1 + this.grow[i] * (1 - t));
    }
    // нет живых частиц — не гоняем буферы в GPU
    if (!any && !this.wasAny) return;
    this.wasAny = any;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

// ——— Менеджер эффектов ———
export class FX {
  constructor(scene) {
    this.scene = scene;
    const q = settings.particles;
    this.debris = new Debris(scene, 60 + 1400 * settings.debris);
    this.sparks = new Particles(scene, 80 + 1600 * q, { texture: dotTexture(), additive: true });
    this.smoke = new Particles(scene, 20 + 300 * q, { texture: smokeTexture(), additive: false });
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.rings.push({ m, t: 0, max: 0, r: 0 });
    }
    this.lights = [];
    if (settings.dynLights) {
      for (let i = 0; i < 2; i++) {
        const l = new THREE.PointLight('#ffaa55', 0, 16, 2);
        l.position.set(0, -50, 0);
        scene.add(l);
        this.lights.push({ l, t: 0, max: 1, peak: 0 });
      }
    }
    this.lightIdx = 0;
    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    this.tmpColor = new THREE.Color();
    this.time = 0;
  }

  amount(n) { return Math.max(0, Math.round(n * settings.particles)); }
  debrisAmount(n) { return Math.max(settings.debris > 0 ? 1 : 0, Math.round(n * settings.debris)); }

  shake(v) { this.trauma = Math.min(1, this.trauma + v * settings.shake); }

  ring(x, z, radius, color, dur = 0.5) {
    const r = this.rings.find((q) => q.t <= 0) || this.rings[0];
    r.m.material.color.set(color).multiplyScalar(2);
    r.m.position.set(x, 0.12, z);
    r.t = r.max = dur; r.r = radius;
    r.m.visible = true;
  }

  flash(x, y, z, color, intensity = 40, dur = 0.35) {
    if (!this.lights.length) return;
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.color.set(color);
    L.l.position.set(x, y, z);
    L.t = L.max = dur; L.peak = intensity;
  }

  sparksAt(x, y, z, color, n, speed = 6, o = {}) {
    const c = this.tmpColor.set(color);
    const cnt = this.amount(n);
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.sparks.emit(x, y, z, Math.cos(a) * s, (o.up ?? 3) * (0.3 + Math.random()), Math.sin(a) * s,
        c, (o.size ?? 0.18) * (0.6 + Math.random() * 0.8), (o.life ?? 0.5) * (0.5 + Math.random()), { drag: 2.5, gravity: o.gravity ?? 9 });
    }
  }

  // Удар по кирпичу без разрушения
  chip(x, z, color, nx = 0, nz = 0) {
    this.debris.spawn(x, 0.4, z, color, this.debrisAmount(3), { speed: 3, up: 3, size: 0.12, life: 1.6, vx: nx * 3, vz: nz * 3 });
    this.sparksAt(x, 0.4, z, '#fff3d6', 6, 4, { size: 0.12, life: 0.3 });
  }

  // Разрушение кирпича
  shatter(x, z, color, kind = 'std', dirX = 0, dirZ = 0) {
    const glass = kind === 'glass';
    const n = glass ? 26 : kind === 'metal' ? 14 : 18;
    this.debris.spawn(x, 0.35, z, color, this.debrisAmount(n), {
      speed: glass ? 6 : 4.5, up: glass ? 6 : 5, size: glass ? 0.14 : 0.24, life: glass ? 2.2 : 3.6,
      sx: 1.2, sz: 0.5, vx: dirX * 2.5, vz: dirZ * 2.5,
    });
    this.sparksAt(x, 0.4, z, color, glass ? 18 : 10, 5, { size: 0.16, life: 0.45 });
    const c = this.tmpColor.set(color).lerp(new THREE.Color('#888'), 0.6);
    for (let i = 0; i < this.amount(3); i++) {
      this.smoke.emit(x + (Math.random() - 0.5), 0.4, z, (Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5),
        c, 1.4, 0.9 + Math.random() * 0.5, { grow: 1.5, drag: 1.2, alpha: 0.35 });
    }
  }

  // Взрыв: огненный шар, обломки, ударная волна, вспышка, тряска
  explode(x, z, power = 1, color = '#ff7a2f') {
    const fire = [new THREE.Color('#fff3c4'), new THREE.Color('#ffb347'), new THREE.Color('#ff5a1f'), new THREE.Color('#c0261a')];
    const n = this.amount(60 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, el = Math.random() * 1.2, s = (3 + Math.random() * 9) * power;
      const col = fire[Math.floor(Math.random() * fire.length)];
      this.sparks.emit(x, 0.5, z, Math.cos(a) * s * Math.cos(el), Math.sin(el) * s * 0.9 + 2, Math.sin(a) * s * Math.cos(el),
        col, (0.35 + Math.random() * 0.6) * power, 0.35 + Math.random() * 0.5, { drag: 4, gravity: -2, grow: 0.8 });
    }
    const dark = new THREE.Color('#2a2420');
    for (let i = 0; i < this.amount(10 * power); i++) {
      this.smoke.emit(x + (Math.random() - 0.5) * 1.5, 0.6, z + (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3,
        dark, 2 * power, 1.4 + Math.random(), { grow: 2.5, drag: 1.4, alpha: 0.55 });
    }
    this.debris.spawn(x, 0.4, z, color, this.debrisAmount(22 * power), { speed: 9 * power, up: 8 * power, size: 0.22, life: 4, sx: 1.2, sz: 1.2 });
    this.debris.spawn(x, 0.4, z, '#2b2622', this.debrisAmount(10 * power), { speed: 7 * power, up: 9, size: 0.16, life: 3 });
    this.debris.impulse(x, z, 5 * power, 14 * power);
    this.ring(x, z, 4.5 * power, '#ffb070', 0.45);
    this.flash(x, 2.5, z, '#ff9a4a', 60 * power, 0.4);
    this.shake(0.35 * power);
  }

  update(dt, viewportH) {
    this.time += dt;
    this.sparks.update(dt, viewportH);
    this.smoke.update(dt, viewportH);
    for (const r of this.rings) {
      if (r.t <= 0) continue;
      r.t -= dt;
      const k = 1 - Math.max(0, r.t) / r.max;
      const s = 0.3 + r.r * (1 - (1 - k) * (1 - k));
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = (1 - k) * 0.9;
      if (r.t <= 0) r.m.visible = false;
    }
    for (const L of this.lights) {
      if (L.t <= 0) { L.l.intensity = 0; continue; }
      L.t -= dt;
      L.l.intensity = L.peak * Math.max(0, L.t / L.max) ** 2;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma, t = this.time * 40;
    this.shakeOffset.set(Math.sin(t * 1.3) * s * 0.9, Math.sin(t * 1.7 + 1) * s * 0.6, Math.sin(t * 1.1 + 2) * s * 0.9);
  }

  clear() {
    this.debris.clear(); this.sparks.clear(); this.smoke.clear();
    this.trauma = 0;
  }
}
