// Супер-способности: сборки «3 одинаковых бонуса → супер» и супер-версии бустеров (при 3 зарядах).
import * as THREE from 'three';
import { glow } from './mat.js';
import { BOOSTERS, BOOST_MAX, POWERUPS } from './game.js';
import { vibrate } from './audio.js';

export const CHAIN_WINDOW = 20; // секунд на сборку
export const CHAIN_NEED = 3;

// бонус → супер-версия
export const CHAINS = {
  laser: 'rail', fire: 'inferno', multi: 'swarm', shield: 'dome', expand: 'titan',
  mega: 'nuke', catch: 'gravitron', slow: 'stop', cell: 'recharge',
};

// длительные супер-эффекты (таймеры живут в game.effects)
export const SUPER_FX = {
  rail: { label: 'РЕЛЬСОТРОН', color: '#ff4060', dur: 8 },
  inferno: { label: 'ИНФЕРНО', color: '#ff7a1a', dur: 10 },
  swarm: { label: 'РОЙ', color: '#ff5a1f', dur: 15 },
  dome: { label: 'КУПОЛ', color: '#ffd166', dur: 20 },
  titan: { label: 'ТИТАН', color: '#3c8dff', dur: 6 },
  gravitron: { label: 'ГРАВИТРОН', color: '#20c997', dur: 12 },
  stop: { label: 'СТОП-КАДР', color: '#8ecae6', dur: 3 },
  minigun: { label: 'МИНИГУН', color: '#ffb02e', dur: 8 },
  armor2: { label: 'ДВОЙНАЯ БРОНЯ', color: '#ffd166', dur: 15 },
  aim: { label: 'ПРИЦЕЛ', color: '#20c997', dur: 15 },
};
const ONE_SHOT = { nuke: 'ЯДЕРКА', recharge: 'ПЕРЕЗАРЯДКА' };

// бустер при полном запасе → супер-версия
export const BOOST_SUPER = { field: 'dome', gun: 'minigun', armor: 'armor2', sticky: 'aim' };
export const BOOST_SUPER_LABEL = { field: 'КУПОЛ', gun: 'МИНИГУН', armor: 'ДВ.БРОНЯ', sticky: 'ПРИЦЕЛ' };

export function superEffects() {
  return Object.fromEntries(Object.keys(SUPER_FX).map((k) => [k, 0]));
}

const _c = new THREE.Color();

const SuperMixin = {
  // ——— Сборки ———
  chainCollect(type) {
    if (type === 'shrink' || type === 'fast') {
      // ловушка сбрасывает все незавершённые сборки
      if (Object.values(this.chains).some((c) => c.n > 0)) this.ui.toast('СБОРКИ СБРОШЕНЫ', 'bad');
      this.chains = {};
      return;
    }
    const sup = CHAINS[type];
    if (!sup || !this.chainsOn) return;
    const c = (this.chains[type] ||= { n: 0, t: 0 });
    if (this.time - c.t > CHAIN_WINDOW) c.n = 0;
    c.n++;
    c.t = this.time;
    if (c.n >= CHAIN_NEED) {
      c.n = 0;
      this.triggerSuper(sup);
    }
  },

  // активные сборки для HUD: [[тип, n, осталось секунд]]
  chainState() {
    const out = [];
    for (const [k, c] of Object.entries(this.chains)) {
      const left = CHAIN_WINDOW - (this.time - c.t);
      if (c.n > 0 && left > 0) out.push([k, c.n, left]);
    }
    return out;
  },

  triggerSuper(id) {
    const fx = SUPER_FX[id];
    if (fx) this.effects[id] = Math.max(this.effects[id] || 0, fx.dur);
    const label = fx ? fx.label : ONE_SHOT[id];
    const color = fx ? fx.color : id === 'nuke' ? '#ff2e88' : '#d9c2ff';
    switch (id) {
      case 'inferno':
        this.effects.fire = Math.max(this.effects.fire, fx.dur);
        for (const b of this.balls) { b.fire = true; if (!b.mega) b.mesh.material = this.fireMat; }
        break;
      case 'swarm': {
        // до 12 шаров + спутники вокруг ракетки
        let guard = 0;
        while (this.balls.length < 12 && guard++ < 12) {
          const src = this.balls.find((b) => !b.stuck) || this.balls[0];
          if (!src) break;
          if (src.stuck) { src.stuck = false; src.vx = 0; src.vz = -this.speedTarget(); if (this.state === 'ready') this.state = 'play'; }
          const nb = this.newBall(false, src);
          if (nb) nb.fire = src.fire;
        }
        break;
      }
      case 'dome': this.shieldMesh.visible = true; break;
      case 'nuke': this.nuke(); break;
      case 'recharge':
        for (const k of Object.keys(BOOSTERS)) this.run.boost[k] = Math.min(BOOST_MAX, (this.run.boost[k] || 0) + 1);
        break;
      case 'minigun': this.minigunCd = 0; break;
      case 'armor2': this.effects.armor = Math.max(this.effects.armor, fx.dur); break;
      case 'aim': this.effects.catch = Math.max(this.effects.catch, fx.dur); break;
      case 'rail': this.railCd = 0; break;
    }
    this.ui.toast(`СУПЕР · ${label}`, 'secret');
    this.audio.star();
    this.audio.power(true);
    vibrate([20, 40, 20, 40, 60]);
    this.fx.shake(0.3);
    this.fx.ring(this.paddle.x, this.paddle.z, 4.5, color, 0.6);
    this.fx.sparksAt(this.paddle.x, 0.6, this.paddle.z, color, 50, 7, { size: 0.24, life: 0.8 });
  },

  // Ядерка: волна на весь экран
  nuke() {
    const f = this.field;
    const cz = (f.zTop + f.brickBottom) / 2;
    this.ui.flash(0.7);
    this.fx.shake(1);
    this.audio.explosion(2.5);
    this.fx.explode(0, cz, 2.6, '#ff2e88');
    this.fx.ring(0, cz, f.W * 1.2, '#ff2e88', 0.8);
    for (const b of this.brickList.slice()) if (b.alive) this.damageBrick(b, 2, { nx: Math.sign(b.x), nz: -1 });
    this.world.blast(0, cz, f.W * 1.5, 4);
    const B = this.boss;
    if (B && B.alive && !B.dying) B.damage(B.maxHp * 0.1, B.x, B.z);
  },

  // ——— Инферно: горящие блоки поджигают соседей ———
  igniteAround(b) {
    const gen = b._burnGen ?? 0;
    b._burnGen = undefined;
    if (!(this.effects.inferno > 0) || gen >= 1) return;
    const near = this.world.query(b.x, b.z, 1.7).slice();
    for (const o of near) {
      if (!o.alive || o.steel || o._burnGen !== undefined || Math.random() < 0.5) continue;
      o._burnGen = gen + 1;
      this.burnQ.push({ b: o, t: 0.28 + Math.random() * 0.18 });
    }
  },

  // ——— Рой: спутники-отбойники вокруг ракетки ———
  satelliteCollide(ball) {
    for (const s of this.sats) {
      const dx = ball.x - s.x, dz = ball.z - s.z, R = ball.r + 0.36;
      if (dx * dx + dz * dz > R * R || ball.vz <= 0) continue;
      const sp = Math.hypot(ball.vx, ball.vz);
      ball.vz = -Math.abs(ball.vz);
      ball.vx += dx * 3;
      const ns = Math.hypot(ball.vx, ball.vz);
      ball.vx *= sp / ns; ball.vz *= sp / ns;
      ball.z = s.z - R;
      this.fx.sparksAt(s.x, 0.4, s.z, '#ff5a1f', 8, 3);
      this.audio.paddle(0);
    }
  },

  // ——— Гравитрон: шар летит вверх и слегка доворачивает к ближайшему блоку ———
  steerBall(ball, h) {
    if (ball.vz >= 0) return;
    const near = this.world.query(ball.x, ball.z, 7, this.world.tmp3);
    let best = null, bd = 1e9;
    for (const o of near) {
      if (!o.alive || o.steel || o.z > ball.z) continue;
      const d = (o.x - ball.x) ** 2 + (o.z - ball.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    const cur = Math.atan2(ball.vz, ball.vx), want = Math.atan2(best.z - ball.z, best.x - ball.x);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const a = cur + Math.max(-1.8 * h, Math.min(1.8 * h, d));
    const sp = Math.hypot(ball.vx, ball.vz);
    ball.vx = Math.cos(a) * sp; ball.vz = Math.sin(a) * sp;
  },

  // ——— Обновление всех супер-эффектов (каждый кадр) ———
  updateSupers(dt) {
    const p = this.paddle, f = this.field, e = this.effects;
    // рельсотрон: луч пробивает всю колонну
    if (e.rail > 0 && this.state === 'play') {
      this.railCd = (this.railCd || 0) - dt;
      if (this.railCd <= 0) { this.railCd = 0.45; this.fireRail(p.x); }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t -= dt;
      b.m.material.opacity = Math.max(0, b.t / 0.22);
      b.m.scale.x = 0.4 + b.t * 3;
      if (b.t <= 0) { this.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); this.beams.splice(i, 1); }
    }
    // инферно
    for (let i = this.burnQ.length - 1; i >= 0; i--) {
      const q = this.burnQ[i];
      q.t -= dt;
      if (q.t > 0) continue;
      this.burnQ.splice(i, 1);
      if (!q.b.alive) continue;
      this.fx.sparksAt(q.b.x, 0.6, q.b.z, '#ff7a1a', 14, 3, { up: 4, gravity: -3, size: 0.25, life: 0.6 });
      this.damageBrick(q.b, 1, {});
      if (q.b.alive) q.b._burnGen = undefined;
    }
    // рой: спутники
    if (e.swarm > 0) {
      if (!this.sats.length) {
        for (let k = 0; k < 2; k++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), glow('#ff5a1f', 2.4));
          this.scene.add(m);
          this.sats.push({ m, x: p.x, z: p.z, a: k * Math.PI });
        }
      }
      for (const s of this.sats) {
        s.a += dt * 3.2;
        s.x = p.x + Math.cos(s.a) * (p.halfW + 0.7);
        s.z = p.z - 1.0 + Math.sin(s.a) * 0.45;
        s.m.position.set(s.x, 0.45, s.z);
      }
    } else if (this.sats.length) {
      for (const s of this.sats) { this.scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); }
      this.sats = [];
    }
    // прицел для липучки
    this.updateAim();
    document.body.classList.toggle('frozen', e.stop > 0);
  },

  fireRail(x) {
    const f = this.field, p = this.paddle;
    const z0 = p.z - 0.5, len = z0 - f.zTop;
    const hit = new Set();
    for (let z = z0; z > f.zTop; z -= 0.3) {
      const b = this.world.brickAt(x, z, 0.12);
      if (b && !hit.has(b)) hit.add(b);
    }
    for (const b of hit) { this.world.impulse(b, 0, -1.2, x, b.z); this.damageBrick(b, 1, { nx: 0, nz: -1 }); }
    const B = this.boss;
    if (B && B.alive && !B.dying && Math.abs(B.x - x) < B.r) B.damage(0.8, x, B.z + B.r);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, len),
      new THREE.MeshBasicMaterial({ color: _c.set('#ff4060').multiplyScalar(3), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, 0.5, z0 - len / 2);
    this.scene.add(m);
    this.beams.push({ m, t: 0.22 });
    this.audio.laser();
    this.fx.shake(0.06);
  },

  updateAim() {
    const stuck = this.effects.aim > 0 && this.balls.find((b) => b.stuck);
    if (!stuck) { if (this.aimLine) this.aimLine.visible = false; return; }
    if (!this.aimLine) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
      this.aimLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: _c.set('#20c997').multiplyScalar(2), dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.9 }));
      this.aimLine.frustumCulled = false;
      this.scene.add(this.aimLine);
    }
    const f = this.field, p = this.paddle, b = stuck;
    const a = Math.max(-0.6, Math.min(0.6, b.stuckOff / p.halfW));
    let x = b.x, z = b.z, vx = Math.sin(a), vz = -Math.cos(a);
    const pos = this.aimLine.geometry.attributes.position;
    let n = 0, bounces = 0;
    pos.setXYZ(n++, x, 0.35, z);
    for (let i = 0; i < 158; i++) {
      x += vx * 0.3; z += vz * 0.3;
      if (x < -f.W / 2 + b.r) { x = -f.W / 2 + b.r; vx = Math.abs(vx); bounces++; pos.setXYZ(n++, x, 0.35, z); }
      if (x > f.W / 2 - b.r) { x = f.W / 2 - b.r; vx = -Math.abs(vx); bounces++; pos.setXYZ(n++, x, 0.35, z); }
      if (z < f.zTop + b.r || bounces > 3 || this.world.brickAt(x, z, b.r * 0.6)) break;
    }
    pos.setXYZ(n++, x, 0.35, z);
    this.aimLine.geometry.setDrawRange(0, n);
    pos.needsUpdate = true;
    this.aimLine.computeLineDistances();
    this.aimLine.visible = true;
  },

  disposeSupers() {
    for (const s of this.sats || []) this.scene?.remove(s.m);
    this.sats = [];
    this.beams = [];
    this.burnQ = [];
    this.aimLine = null;
    document.body.classList.remove('frozen');
  },
};

export function installSupers(Game) { Object.assign(Game.prototype, SuperMixin); }
export { POWERUPS };
