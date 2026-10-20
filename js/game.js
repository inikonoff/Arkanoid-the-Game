// Ядро игры: поле, кирпичи, шары, ракетка, бонусы, лазеры, физика столкновений, взрывы.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { settings, profile, saveProfile } from './settings.js';
import { LOCATIONS } from './locations.js';
import { Environment } from './environment.js';
import { Weather } from './weather.js';
import { FX } from './fx.js';
import { Boss, BOSSES } from './boss.js';
import { mat, glow } from './mat.js';
import { powerupLabel } from './textures.js';
import { vibrate } from './audio.js';
import { BrickWorld, TOWER_B, TOWER_H } from './brickphys.js';

export const CELL_W = 1.5;
export const CELL_D = 0.75;
const BRICK_W = 1.38, BRICK_D = 0.6, BRICK_H = 0.62;
const BALL_R = 0.3;
const PADDLE_HALF = 1.7, PADDLE_D = 0.3;
const MAX_BALLS = 24;
const BALL_MASS = 0.75;

export const POWERUPS = {
  expand: { label: 'ШИРЕ', color: '#3c8dff', good: true, w: 14, dur: 20 },
  multi: { label: '×3', color: '#ff5a1f', good: true, w: 12 },
  laser: { label: 'ЛАЗЕР', color: '#e5383b', good: true, w: 9, dur: 14 },
  catch: { label: 'МАГНИТ', color: '#20c997', good: true, w: 8, dur: 18 },
  slow: { label: 'МЕДЛ.', color: '#8ecae6', good: true, w: 9, dur: 14 },
  fire: { label: 'ОГОНЬ', color: '#ff8c00', good: true, w: 6, dur: 9 },
  shield: { label: 'ЩИТ', color: '#a8dadc', good: true, w: 8, dur: 20 },
  mega: { label: 'БОМБА', color: '#b5179e', good: true, w: 5 },
  life: { label: '+1', color: '#f6d55c', good: true, w: 3 },
  shrink: { label: 'УЖЕ', color: '#6c757d', good: false, w: 7, dur: 12 },
  fast: { label: 'БЫСТР.', color: '#c9184a', good: false, w: 6, dur: 10 },
};

const TYPE = {
  '1': { hp: 1, cat: 'std' }, '2': { hp: 2, cat: 'std' }, '3': { hp: 3, cat: 'std' },
  A: { hp: 5, cat: 'metal', color: '#8d99ae' },
  '#': { hp: Infinity, cat: 'metal', color: '#3a3d45', steel: true },
  $: { hp: 2, cat: 'metal', color: '#e2b44c', gold: true },
  X: { hp: 1, cat: 'glow', color: '#ff3d1f', explosive: true },
  G: { hp: 1, cat: 'glass', color: '#bfe9ff' },
  '?': { hp: 1, cat: 'glow', color: '#ffffff', bonus: true },
  S: { hp: 1, cat: 'glass', color: '#e0c3ff', hidden: true, secret: true },
  I: { hp: 2, cat: 'std', hidden: true },
  R: { hp: 1, cat: 'std', regen: true },
  T: { hp: 4, cat: 'tower', tower: true },
};

const _o = new THREE.Object3D();
_o.rotation.order = 'YXZ';
const _ct = {}, _cb = {};
const _v = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

let GEO_CACHE = null;
function geos() {
  const key = settings.materials + settings.envDetail;
  if (GEO_CACHE && GEO_CACHE.key === key) return GEO_CACHE;
  const rounded = settings.envDetail > 0;
  GEO_CACHE = {
    key,
    brick: rounded ? new RoundedBoxGeometry(BRICK_W, BRICK_H, BRICK_D, 2, 0.09) : new THREE.BoxGeometry(BRICK_W, BRICK_H, BRICK_D),
    tower: rounded ? new RoundedBoxGeometry(TOWER_B, TOWER_H, TOWER_B, 2, 0.07) : new THREE.BoxGeometry(TOWER_B, TOWER_H, TOWER_B),
    ball: new THREE.SphereGeometry(1, 24, 16),
    laser: new THREE.BoxGeometry(0.08, 0.08, 0.7),
  };
  return GEO_CACHE;
}

const LABELS = {};
function label(type) {
  if (!LABELS[type]) {
    const p = POWERUPS[type];
    LABELS[type] = powerupLabel(p.label, p.color, p.good ? '#0b0b0a' : '#ffffff');
  }
  return LABELS[type];
}

export class Game {
  constructor(app) {
    this.app = app;
    this.audio = app.audio;
    this.ui = app.ui;
    this.renderer = app.renderer;
    this.state = 'idle';
    this.time = 0;
    this.timeScale = 1;
    this.ballSeq = 0;
  }

  // ———————————————————————— Загрузка уровня ————————————————————————
  load(level, run) {
    this.dispose();
    this.loadId = (this.loadId || 0) + 1;
    this.level = level;
    this.run = run;
    this.loc = LOCATIONS[level.location % LOCATIONS.length];
    this.audio.setLocation(this.loc.id);
    const scene = new THREE.Scene();
    this.scene = scene;
    this.time = 0;
    this.levelTime = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.bricksBroken = 0;
    this.lostBall = false;
    this.starFound = false;
    this.warp = null;
    this.boss = null;
    this.chaos = run.chaos || {};
    this.expandLevel = 0;
    this.acc = 0;
    this.catchT = 0;

    // сетка
    let grid = level.grid.slice();
    if (level.boss) grid = ['', '', ...grid];
    const cols = Math.max(...grid.map((r) => r.length));
    const rows = grid.length;
    const W = Math.max(10, cols) * CELL_W;
    const brickArea = rows * CELL_D;
    const gap = Math.max(11.5, W * 0.62, brickArea * 0.8);
    const depth = 1.0 + brickArea + gap + 1.5;
    const zTop = -depth / 2;
    const scale = Math.max(1, Math.sqrt(W / 18));
    const f = this.field = {
      W, cols, rows, zTop, brickTop: zTop + 1.0, brickBottom: zTop + 1.0 + brickArea,
      paddleZ: zTop + 1.0 + brickArea + gap, zBottom: zTop + depth, ox: -cols * CELL_W / 2, scale,
      windX: 0, gravity: 22,
    };
    f.shieldZ = f.paddleZ + 0.9;

    this.env = new Environment(scene, this.loc, f);
    this.fx = new FX(scene);
    this.weather = new Weather(scene, this.loc, f, this);

    this.buildBricks(grid);
    this.buildPaddle();
    this.balls = [];
    this.powerups = [];
    this.lasers = [];
    this.pickups = [];
    this.effects = { expand: 0, shrink: 0, laser: 0, catch: 0, slow: 0, fire: 0, fast: 0 };
    this.shield = 0;
    this.megaCharges = 0;
    this.buildShield();
    this.laserCd = 0;
    this.ballMat = mat({ color: '#f4f1ea', roughness: 0.2, metalness: 0.4, emissive: '#fff4e0', emissiveIntensity: 0.6 });
    this.fireMat = glow('#ff8c2a', 2.4);
    this.megaMat = glow('#ff2e88', 2.6);

    if (level.boss) {
      const tier = run.mode === 'endless' ? 8 + Math.floor((run.levelIndex || 0) / 3) : Math.floor((run.levelIndex || 0) / 3);
      this.boss = new Boss(this, level.boss, tier);
    }

    // скорость шара растёт с уровнем
    const li = run.levelIndex || 0;
    this.baseSpeed = Math.min(19, 12.5 + li * 0.28) * (level.mods?.speedMul || 1) * (this.chaos.speed || 1) * scale;
    this.renderer.fitCamera({ minX: -W / 2 - 0.6, maxX: W / 2 + 0.6, minZ: f.zTop - 0.5, maxZ: f.zBottom + 0.3 });
    // прогрев шейдера капсулы бонуса (иначе компиляция при первом выпадении)
    const warm = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ map: label('expand') }));
    warm.position.set(0, -60, 0);
    scene.add(warm);
    this.renderer.setScene(scene);
    this.camT = 0;
    this.introT = 1.6;
    this.state = 'intro';
    this.bonusTimer = level.bonus ? 35 : 0;
    this.newBall(true);
    if (level.mods?.startBalls > 1) this.pendingMulti = level.mods.startBalls - 1;
    this.ui.levelIntro(level, this.loc, this.boss);
    this.audio.intensity = level.boss ? 0.9 : 0.5;
  }

  buildBricks(grid) {
    const f = this.field, pal = this.loc.bricks;
    this.brickList = [];
    this.portals = [];
    const counts = { std: 40, metal: 4, glass: 4, glow: 4, tower: 0 };
    const portalCells = [];
    grid.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        let ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        if (ch === 'P') { portalCells.push([c, r]); continue; }
        if (!TYPE[ch]) ch = '1';
        if (this.chaos.explosive && /[123]/.test(ch) && Math.random() < 0.15) ch = 'X';
        const t = TYPE[ch];
        const b = {
          i: r * f.cols + c, c, r, ch, x: f.ox + (c + 0.5) * CELL_W, z: f.brickTop + (r + 0.5) * CELL_D,
          hp: t.hp, maxHp: t.hp, cat: t.cat, steel: !!t.steel, explosive: !!t.explosive, bonus: !!t.bonus,
          secret: !!t.secret, hidden: !!t.hidden, regen: !!t.regen, gold: !!t.gold, tower: !!t.tower, alive: true,
          color: new THREE.Color(t.color || (t.regen ? '#7cff9b' : pal[(r + (ch === 'I' ? 2 : 0)) % pal.length])),
          wy: 0, wvy: 0, wrx: 0, wvrx: 0, wrz: 0, wvrz: 0, appear: 1, regenT: 0,
        };
        b.base = b.color.clone();
        this.brickList.push(b);
        counts[b.cat]++;
      }
    });
    // порталы парами
    for (let k = 0; k + 1 < portalCells.length; k += 2) {
      const a = portalCells[k], bb = portalCells[k + 1];
      const pa = this.makePortal(a[0], a[1], '#7cffb2'), pb = this.makePortal(bb[0], bb[1], '#c77dff');
      pa.pair = pb; pb.pair = pa;
    }
    const G = geos();
    const mats = {
      std: mat({ color: '#ffffff', roughness: 0.38, metalness: 0.08 }),
      metal: mat({ color: '#ffffff', roughness: 0.22, metalness: 0.95 }),
      glass: mat({ color: '#ffffff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, emissive: '#223344', emissiveIntensity: 0.4 }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.7, 1.7) }),
      tower: mat({ color: '#ffffff', roughness: 0.5, metalness: 0.15 }),
    };
    this.glowMat = mats.glow;
    this.brickMeshes = {};
    this.catCount = { std: 0, metal: 0, glass: 0, glow: 0, tower: 0 };
    for (const cat of Object.keys(mats)) {
      if (!counts[cat]) { mats[cat].dispose(); continue; }
      const m = new THREE.InstancedMesh(cat === 'tower' ? G.tower : G.brick, mats[cat], counts[cat]);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = settings.shadows > 0 && cat !== 'glass';
      m.receiveShadow = settings.shadows >= 2;
      m.frustumCulled = false;
      for (let i = 0; i < counts[cat]; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, new THREE.Color(1, 1, 1)); }
      this.scene.add(m);
      this.brickMeshes[cat] = m;
    }
    const f2 = this.field;
    this.world = new BrickWorld({ minX: -f2.W / 2, maxX: f2.W / 2, minZ: f2.zTop, maxZ: f2.paddleZ - 3 });
    for (const b of this.brickList) this.world.add(b);
    for (const b of this.brickList) this.assignInstance(b);
    this.wobbling = new Set();
    this.explosionQueue = [];
    this.remaining = this.brickList.filter((b) => !b.steel).length;
    this.totalBreakable = this.remaining;
  }

  assignInstance(b) {
    b.inst = this.catCount[b.cat]++;
    this.brickMeshes[b.cat].setColorAt(b.inst, this.brickColor(b));
    this.writeBrick(b);
  }

  brickColor(b) {
    if (b.steel || b.maxHp === 1) return b.color;
    const k = 0.5 + 0.5 * (b.hp / b.maxHp);
    return _c.copy(b.base).multiplyScalar(k);
  }

  writeBrick(b) {
    const m = this.brickMeshes[b.cat];
    if (!b.alive || (b.hidden && !b.revealed)) { m.setMatrixAt(b.inst, ZERO); m.instanceMatrix.needsUpdate = true; return; }
    const s = b.appear;
    if (b.tower) {
      this.writeTower(b, m, s);
    } else {
      _o.position.set(b.x, BRICK_H / 2 + b.wy, b.z);
      _o.rotation.set(b.wrx, -b.a, b.wrz);
      _o.scale.set(s, s, s);
      _o.updateMatrix();
      m.setMatrixAt(b.inst, _o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  // Башня: стоит, качается вокруг ребра основания (3D-наклон) или лежит бревном
  writeTower(b, m, s) {
    if (b.fallen) {
      _o.position.set(b.x, TOWER_B / 2 + b.wy * 0.3, b.z);
      _o.rotation.set(b.wrx * 0.3, -b.a, -Math.PI / 2);
      _o.scale.set(s, s, s);
      _o.updateMatrix();
      m.setMatrixAt(b.inst, _o.matrix);
      return;
    }
    _qYaw.setFromAxisAngle(_up, -b.a);
    if (b.tilt > 0) {
      _axis.set(b.tdz, 0, -b.tdx);
      _qTilt.setFromAxisAngle(_axis, b.tilt);
      _qYaw.premultiply(_qTilt);
      _v.set(-b.tdx * b.tbd, TOWER_H / 2, -b.tdz * b.tbd).applyQuaternion(_qTilt);
      _v.x += b.pivX; _v.z += b.pivZ;
    } else {
      // лёгкое покачивание от ударов (визуал)
      _qTilt.setFromEuler(_e.set(b.wrx * 0.35, 0, b.wrz * 0.35));
      _qYaw.premultiply(_qTilt);
      _v.set(b.x, TOWER_H / 2 + b.wy * 0.3, b.z);
    }
    _s3.set(s, s, s);
    _m4.compose(_v, _qYaw, _s3);
    m.setMatrixAt(b.inst, _m4);
  }

  // Башни, упавшие за кадр: удар по тому, что под ними, пыль, домино
  onTowersLanded() {
    const L = this.world.landed;
    this.world.landed = [];
    for (const e of L) {
      const b = e.b;
      if (!b.alive) continue;
      this.towersFallen = (this.towersFallen || 0) + 1;
      // звено цепочки: башню повалила другая упавшая башня
      const n = b.chain || 1;
      if (n >= 2) this.ui.toast(`ДОМИНО ×${n}`, 'good');
      this.addScore(150 * n, b.x, b.z);
      this.audio.thud?.();
      this.fx.shake(0.18);
      vibrate(25);
      // пыль вдоль бревна
      const dust = _c.set(this.loc.floor || '#555').lerp(_c2.set('#9a948a'), 0.7);
      for (let i = 0; i < this.fx.amount(10); i++) {
        const t = (Math.random() - 0.5) * TOWER_H;
        this.fx.smoke.emit(b.x + e.dx * t, 0.2, b.z + e.dz * t, (Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2,
          dust, 1.1, 0.9 + Math.random() * 0.6, { grow: 1.6, drag: 1.6, alpha: 0.4 });
      }
      this.fx.debris.spawn(b.x, 0.3, b.z, b.color, this.fx.debrisAmount(8), { speed: 3, up: 3, size: 0.14, life: 2, sx: TOWER_H, sz: 0.5 });
      this.pushNeighbors(b.x, b.z, 2.6, 1.4);
      // сама башня трескается от падения, придавленное — получает урон
      this.damageBrick(b, 1, { nx: e.dx, nz: e.dz });
      for (const o of e.hits) {
        if (!o.alive || (o.tower && !o.fallen)) continue;
        this.damageBrick(o, 2, { nx: e.dx, nz: e.dz });
      }
      this.checkClear();
    }
  }

  makePortal(c, r, color) {
    const f = this.field;
    const x = f.ox + (c + 0.5) * CELL_W, z = f.brickTop + (r + 0.5) * CELL_D;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 32), glow(color, 2.4));
    ring.rotation.x = -Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    g.add(ring, disc);
    g.position.set(x, 0.35, z);
    this.scene.add(g);
    const p = { x, z, g, ring, color };
    this.portals.push(p);
    return p;
  }

  buildPaddle() {
    const f = this.field;
    const g = new THREE.Group();
    const bodyMat = mat({ color: '#6f6c66', roughness: 0.3, metalness: 0.9 });
    const capMat = mat({ color: this.loc.accent, roughness: 0.35, metalness: 0.5, emissive: this.loc.accent, emissiveIntensity: 0.35 });
    const stripMat = glow(this.loc.accent, 1.6);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(PADDLE_D, PADDLE_D, 1, 20), bodyMat);
    body.rotation.z = Math.PI / 2;
    const capL = new THREE.Mesh(new THREE.SphereGeometry(PADDLE_D * 1.08, 16, 12), capMat);
    const capR = capL.clone();
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.06), stripMat);
    strip.position.set(0, 0.02, -PADDLE_D * 0.95);
    const gunGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.5, 8);
    gunGeo.rotateX(Math.PI / 2);
    const gunL = new THREE.Mesh(gunGeo, glow('#ff4a3a', 2));
    const gunR = gunL.clone();
    [body, capL, capR].forEach((m) => { m.castShadow = settings.shadows > 0; });
    g.add(body, capL, capR, strip, gunL, gunR);
    g.position.set(0, PADDLE_D + 0.02, f.paddleZ);
    this.scene.add(g);
    const scale = f.scale;
    this.paddle = {
      x: 0, vx: 0, z: f.paddleZ, target: 0, halfW: PADDLE_HALF * scale * (this.chaos.paddle || 1), baseHalf: PADDLE_HALF * scale * (this.chaos.paddle || 1),
      g, body, capL, capR, strip, gunL, gunR, stripMat, stun: 0, freeze: 0, flash: 0, squash: 0,
    };
    this.layoutPaddle();
  }

  layoutPaddle() {
    const p = this.paddle;
    const inner = Math.max(0.2, p.halfW - PADDLE_D);
    p.body.scale.set(1, inner * 2, 1);
    p.capL.position.x = -inner; p.capR.position.x = inner;
    p.strip.scale.x = inner * 2;
    p.gunL.position.set(-inner, 0.25, -0.1); p.gunR.position.set(inner, 0.25, -0.1);
    const laser = this.effects?.laser > 0;
    p.gunL.visible = p.gunR.visible = laser;
  }

  buildShield() {
    const f = this.field;
    const m = new THREE.Mesh(new THREE.BoxGeometry(f.W, 0.12, 0.12), glow('#9fe8ff', 2.2, { transparent: true, opacity: 0.8 }));
    m.position.set(0, 0.25, f.shieldZ);
    m.visible = false;
    this.scene.add(m);
    this.shieldMesh = m;
  }

  // ———————————————————————— Шары ————————————————————————
  newBall(stuck = false, from = null) {
    if (this.balls.length >= MAX_BALLS) return null;
    const r = BALL_R * Math.pow(this.field.scale, 0.5) * (this.chaos.ball || 1);
    const mesh = new THREE.Mesh(geos().ball, this.ballMat);
    mesh.scale.setScalar(r);
    mesh.castShadow = settings.shadows > 0;
    this.scene.add(mesh);
    const b = {
      id: ++this.ballSeq, x: this.paddle.x, z: this.paddle.z - PADDLE_D - r, vx: 0, vz: -1, r, mesh,
      stuck, stuckOff: (Math.random() - 0.5) * 0.6, hop: 0, y: r, portalCd: 0, fire: false, mega: false,
    };
    if (from) {
      b.x = from.x; b.z = from.z; b.stuck = false;
      const a = Math.atan2(from.vx, -from.vz) + (Math.random() - 0.5) * 1.2;
      const s = this.speedTarget();
      b.vx = Math.sin(a) * s; b.vz = -Math.cos(a) * s;
    }
    this.balls.push(b);
    return b;
  }

  speedTarget() {
    let s = this.baseSpeed * Math.min(1.22, 1 + this.levelTime / 300);
    if (this.effects.slow > 0) s *= 0.68;
    if (this.effects.fast > 0) s *= 1.3;
    return s * this.weather.speedMul;
  }

  launch() {
    if (this.state === 'intro') return;
    let any = false;
    for (const b of this.balls) {
      if (!b.stuck) continue;
      b.stuck = false;
      any = true;
      const s = this.speedTarget();
      const a = THREE.MathUtils.clamp(b.stuckOff / this.paddle.halfW, -0.6, 0.6) + (Math.random() - 0.5) * 0.15;
      b.vx = Math.sin(a) * s; b.vz = -Math.cos(a) * s;
    }
    if (any) {
      this.audio.launch();
      if (this.state === 'ready') this.state = 'play';
      if (this.pendingMulti) { this.multiball(this.pendingMulti); this.pendingMulti = 0; }
    }
  }

  removeBall(b) {
    this.scene.remove(b.mesh);
    this.balls.splice(this.balls.indexOf(b), 1);
  }

  multiball(n = 2) {
    const src = this.balls.filter((b) => !b.stuck);
    const base = src.length ? src : this.balls;
    if (!base.length) return;
    const list = base.slice(0, 6);
    for (const s of list) for (let i = 0; i < n; i++) {
      if (s.stuck) { s.stuck = false; const sp = this.speedTarget(); s.vx = 0; s.vz = -sp; }
      const nb = this.newBall(false, s);
      if (nb) { nb.fire = s.fire; }
    }
  }

  // ———————————————————————— Ввод ————————————————————————
  setPaddleTarget(x) { this.paddle.target = this.chaos.mirror ? -x : x; }
  movePaddleBy(dx) { this.paddle.target += this.chaos.mirror ? -dx : dx; this.clampTarget(); }
  clampTarget() {
    const lim = this.field.W / 2 - this.paddle.halfW;
    this.paddle.target = THREE.MathUtils.clamp(this.paddle.target, -lim, lim);
  }

  // ———————————————————————— Цикл ————————————————————————
  update(dt) {
    if (!this.scene) return;
    this.time += dt;
    // замедление времени
    if (this.slowmo > 0) { this.slowmo -= dt; this.timeScale += (0.25 - this.timeScale) * Math.min(1, dt * 10); }
    else this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 3);
    const sdt = dt * this.timeScale;

    if (this.state === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) this.state = 'ready';
    }
    if (this.state === 'play' || this.state === 'ready') this.levelTime += sdt;

    this.updatePaddle(sdt);
    if (this.state === 'play' || this.state === 'ready' || this.state === 'intro') {
      // фиксированный шаг физики
      const h = 1 / settings.physicsRate;
      this.acc = Math.min((this.acc || 0) + sdt, 0.1);
      let steps = 0;
      while (this.acc >= h && steps < 24) {
        this.physicsStep(h);
        this.acc -= h;
        steps++;
      }
      this.updateTimers(sdt);
      this.updatePowerups(sdt);
      this.updateLasers(sdt);
    }
    if (this.boss && this.boss.alive) {
      this.boss.update(sdt);
      this.bossPush(sdt);
    }
    // обновляем матрицы сдвинутых кирпичей
    if (this.world.moved.size) {
      for (const b of this.world.moved) if (!this.wobbling.has(b)) this.writeBrick(b);
      this.world.moved.clear();
    }
    if (this.world.landed.length) this.onTowersLanded();
    this.weather.update(sdt);
    this.updateExplosions(sdt);
    this.updateBricks(sdt);
    this.updateBallVisuals(sdt);
    this.updatePortals(sdt);
    this.fx.debris.update(sdt, this.field, this.solidTop);
    this.fx.update(sdt, this.renderer.height * this.renderer.gl.getPixelRatio());
    this.env.update(this.time, dt);
    this.updateCamera(dt);
    if (this.bonusTimer > 0 && this.state === 'play') {
      this.bonusTimer -= sdt;
      if (this.bonusTimer <= 0) this.levelClear();
    }
    this.ui.hud(this);
  }

  updatePaddle(dt) {
    const p = this.paddle;
    if (this.autoplay) this.autopilot(dt);
    this.clampTarget();
    p.stun = Math.max(0, p.stun - dt);
    p.freeze = Math.max(0, p.freeze - dt);
    const inertia = Math.max(this.weather.paddleInertia, p.freeze > 0 ? 0.35 : 0);
    const desired = p.stun > 0 ? 0 : (p.target - p.x) * 22;
    const resp = THREE.MathUtils.lerp(70, 3.5, Math.min(1, inertia / 0.35));
    p.vx += (desired - p.vx) * Math.min(1, resp * dt);
    const maxV = p.freeze > 0 ? 9 : 60;
    p.vx = THREE.MathUtils.clamp(p.vx, -maxV, maxV);
    p.x += p.vx * dt;
    const lim = this.field.W / 2 - p.halfW;
    if (p.x < -lim) { p.x = -lim; p.vx = 0; }
    if (p.x > lim) { p.x = lim; p.vx = 0; }
    // ширина
    let target = p.baseHalf * (1 + Math.min(2, this.expandLevel || 0) * 0.35) * (this.effects.shrink > 0 ? 0.65 : 1);
    p.halfW += (target - p.halfW) * Math.min(1, dt * 8);
    this.layoutPaddle();
    p.squash = Math.max(0, p.squash - dt * 5);
    p.g.position.set(p.x, PADDLE_D + 0.02 - p.squash * 0.08, p.z);
    p.g.rotation.z = -p.vx * 0.004;
    p.g.scale.set(1 + p.squash * 0.06, 1 - p.squash * 0.15, 1);
    p.flash = Math.max(0, p.flash - dt);
    const magnet = this.effects.catch > 0;
    const base = p.freeze > 0 ? '#9fe8ff' : magnet ? '#20c997' : this.loc.accent;
    p.stripMat.color.set(base).multiplyScalar(1.6 + (p.flash > 0 ? Math.sin(this.time * 60) * 1.5 : 0));
  }

  // ИИ для демо в главном меню
  autopilot(dt) {
    const p = this.paddle, f = this.field, hw = f.W / 2;
    let best = null;
    for (const b of this.balls) if (!b.stuck && b.vz > 0 && (!best || b.z > best.z)) best = b;
    if (best) {
      let x = best.x + best.vx * ((p.z - best.z) / best.vz);
      const span = (hw - best.r) * 2;
      x = ((x + hw - best.r) % (span * 2) + span * 2) % (span * 2);
      if (x > span) x = span * 2 - x;
      x -= hw - best.r;
      this.aiOff ??= 0;
      if (Math.random() < dt * 0.6) this.aiOff = (Math.random() - 0.5) * p.halfW * 1.4;
      p.target = x + this.aiOff;
    } else if (this.balls[0]) p.target = this.balls[0].x * 0.6;
    if (this.balls.some((b) => b.stuck) && this.state !== 'intro') {
      this.aiLaunch = (this.aiLaunch || 0) + dt;
      if (this.aiLaunch > 0.9) { this.aiLaunch = 0; this.launch(); }
    }
  }

  physicsStep(h) {
    const f = this.field, p = this.paddle;
    this.world.step(h);
    const target = this.speedTarget();
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.portalCd = Math.max(0, b.portalCd - h);
      if (b.stuck) {
        b.x = p.x + b.stuckOff;
        b.z = p.z - PADDLE_D - b.r;
        continue;
      }
      this.weather.force(b, h);
      if (this.boss?.cfg.gravity && this.boss.alive && !this.boss.dying) {
        const dx = this.boss.x - b.x, dz = this.boss.z - b.z, d2 = dx * dx + dz * dz, d = Math.sqrt(d2) + 0.01;
        const a = 22 / (d2 + 4);
        b.vx += (dx / d) * a * h * 6; b.vz += (dz / d) * a * h * 6;
      }
      // регулировка скорости: силы меняют направление, но не убивают темп
      let s = Math.hypot(b.vx, b.vz) || 1;
      let ns = s + (target - s) * Math.min(1, h * 1.2);
      ns = THREE.MathUtils.clamp(ns, target * 0.6, target * 1.6);
      b.vx *= ns / s; b.vz *= ns / s;
      // не даём шару лететь почти горизонтально
      const minVz = ns * 0.24;
      if (Math.abs(b.vz) < minVz) {
        b.vz = (b.vz < 0 ? -1 : 1) * minVz;
        b.vx = Math.sign(b.vx || 1) * Math.sqrt(Math.max(0, ns * ns - minVz * minVz));
      }
      const ts = this.weather.timeScaleAt(b.x, b.z);
      b.x += b.vx * h * ts;
      b.z += b.vz * h * ts;

      // стены
      const hw = f.W / 2;
      if (b.x < -hw + b.r) { b.x = -hw + b.r; b.vx = Math.abs(b.vx); this.wallHit(b); }
      else if (b.x > hw - b.r) { b.x = hw - b.r; b.vx = -Math.abs(b.vx); this.wallHit(b); }
      if (b.z < f.zTop + b.r) { b.z = f.zTop + b.r; b.vz = Math.abs(b.vz); this.wallHit(b); }
      // щит
      if (this.shield > 0 && b.vz > 0 && b.z > f.shieldZ - b.r && b.z < f.shieldZ + 0.4) {
        b.z = f.shieldZ - b.r; b.vz = -Math.abs(b.vz);
        this.fx.sparksAt(b.x, 0.3, b.z, '#9fe8ff', 10, 4);
        this.audio.metal();
        this.shield--;
        this.shieldMesh.visible = this.shield > 0;
      }
      // ракетка
      if (b.vz > 0 && b.z + b.r > p.z - PADDLE_D && b.z - b.r < p.z + PADDLE_D * 0.5 && Math.abs(b.x - p.x) < p.halfW + b.r * 0.6) {
        this.paddleBounce(b);
      }
      // потеря
      if (b.z > f.zBottom + 1.5) {
        this.loseBall(b);
        continue;
      }
      this.collideBricks(b);
      if (this.boss && this.boss.alive) this.boss.collide(b);
      if (this.warp && Math.hypot(b.x - this.warp.x, b.z - this.warp.z) < 0.7 + b.r) { this.enterWarp(); return; }
      if (this.portals.length && b.portalCd <= 0) {
        for (const pt of this.portals) {
          if (Math.hypot(b.x - pt.x, b.z - pt.z) < 0.4 + b.r * 0.5) {
            const o = pt.pair, s2 = Math.hypot(b.vx, b.vz);
            b.x = o.x + (b.vx / s2) * 0.75; b.z = o.z + (b.vz / s2) * 0.75;
            b.portalCd = 0.5;
            this.fx.sparksAt(pt.x, 0.4, pt.z, pt.color, 14, 4);
            this.fx.sparksAt(o.x, 0.4, o.z, o.color, 14, 4);
            this.fx.ring(o.x, o.z, 1.2, o.color, 0.3);
            this.audio.portal();
            break;
          }
        }
      }
    }
  }

  // Босс и его орбитали расталкивают кирпичи, не получая урона
  bossPush(dt) {
    const B = this.boss;
    if (B.dying || B.visible < 0.5 || dt <= 0) return;
    const W = this.world;
    const vx = (B.x - (B._px ?? B.x)) / dt, vz = (B.z - (B._pz ?? B.z)) / dt;
    B._px = B.x; B._pz = B.z;
    W.pushCircle(B.x, B.z, B.r + 0.1, vx, vz);
    for (const o of B.orbiters) {
      if (!o.alive) continue;
      const ovx = (o.x - (o._px ?? o.x)) / dt, ovz = (o.z - (o._pz ?? o.z)) / dt;
      o._px = o.x; o._pz = o.z;
      W.pushCircle(o.x, o.z, o.r + 0.1, ovx, ovz);
    }
  }

  wallHit(b) {
    if (this.time - (b.lastWall || 0) > 0.05) { this.audio.wall(); b.lastWall = this.time; }
  }

  paddleBounce(b) {
    const p = this.paddle;
    const off = THREE.MathUtils.clamp((b.x - p.x) / p.halfW, -1, 1);
    const a = off * THREE.MathUtils.degToRad(62);
    const s = Math.hypot(b.vx, b.vz);
    b.vx = Math.sin(a) * s + p.vx * 0.12;
    b.vz = -Math.cos(a) * s;
    const ns = Math.hypot(b.vx, b.vz);
    b.vx *= s / ns; b.vz *= s / ns;
    b.z = p.z - PADDLE_D - b.r;
    p.squash = 1;
    this.combo = 0;
    this.audio.paddle(off);
    vibrate(8);
    this.fx.sparksAt(b.x, 0.3, b.z, this.loc.accent, 8, 3, { size: 0.12, life: 0.3 });
    if (this.effects.catch > 0) {
      b.stuck = true;
      b.stuckOff = b.x - p.x;
      this.catchT = 2.5; // авто-запуск через 2.5 с
    }
    if (this.megaCharges > 0) { b.mega = true; b.mesh.material = this.megaMat; }
  }

  collideBricks(b) {
    const W = this.world;
    const list = W.query(b.x, b.z, b.r);
    if (!list.length) return;
    let best = null, bestPen = 0;
    for (const br of list) {
      if (W.circle(br, b.x, b.z, b.r + 0.03, _ct) && _ct.pen > bestPen) {
        bestPen = _ct.pen; best = br;
        _cb.nx = _ct.nx; _cb.nz = _ct.nz; _cb.px = _ct.px; _cb.pz = _ct.pz;
      }
    }
    if (!best) return;
    const bnx = _cb.nx, bnz = _cb.nz;
    const pierce = b.fire && !best.steel;
    const vx0 = b.vx, vz0 = b.vz;
    if (!pierce) {
      b.x += bnx * bestPen; b.z += bnz * bestPen;
      // отражение относительно скорости точки кирпича
      const rx = _cb.px - best.x, rz = _cb.pz - best.z;
      const vpx = best.vx - best.w * rz, vpz = best.vz + best.w * rx;
      const vn = (b.vx - vpx) * bnx + (b.vz - vpz) * bnz;
      if (vn < 0) { b.vx -= 2 * vn * bnx; b.vz -= 2 * vn * bnz; }
      // небольшая случайность против зацикливания
      const s = Math.hypot(b.vx, b.vz), a = Math.atan2(b.vz, b.vx) + (Math.random() - 0.5) * 0.03;
      b.vx = Math.cos(a) * s; b.vz = Math.sin(a) * s;
    }
    // импульс кирпичу: удар сбоку закручивает, по центру — отталкивает
    W.hitByBall(best, BALL_MASS, vx0, vz0, bnx, bnz, _cb.px, _cb.pz);
    // небольшой визуальный подскок
    best.wvy += 0.8; best.wvrx += -bnz * 1.5; best.wvrz += bnx * 1.5;
    this.wobbling.add(best);
    if (b.mega && !best.steel) {
      b.mega = false;
      b.mesh.material = b.fire ? this.fireMat : this.ballMat;
      this.megaCharges--;
      this.megaBlast(best.x, best.z);
      return;
    }
    this.damageBrick(best, pierce ? 99 : 1, { nx: -bnx, nz: -bnz, ball: b });
  }

  // ———————————————————————— Кирпичи ————————————————————————
  damageBrick(b, amount, src = {}) {
    if (!b.alive) return;
    if (b.hidden && !b.revealed) {
      b.revealed = true;
      b.appear = 0.2;
      this.fx.sparksAt(b.x, 0.5, b.z, b.secret ? '#e0c3ff' : '#ffffff', 16, 4);
      if (!b.secret) { b.hp -= 1; this.audio.glass(); this.writeBrick(b); return; }
    }
    if (b.steel) {
      this.audio.metal();
      this.fx.chip(b.x, b.z, '#9aa0aa', src.nx, src.nz);
      return;
    }
    b.hp -= amount;
    if (b.hp > 0) {
      this.brickMeshes[b.cat].setColorAt(b.inst, this.brickColor(b));
      this.brickMeshes[b.cat].instanceColor.needsUpdate = true;
      this.fx.chip(b.x, b.z, b.color, src.nx, src.nz);
      if (b.cat === 'metal') this.audio.metal(); else this.audio.brick(b.hp, this.combo);
      this.addScore(10, b.x, b.z, true);
      return;
    }
    this.destroyBrick(b, src);
  }

  destroyBrick(b, src = {}) {
    b.alive = false;
    this.world.remove(b);
    this.writeBrick(b);
    this.remaining--;
    this.bricksBroken++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const kind = b.cat === 'glass' ? 'glass' : b.cat === 'metal' ? 'metal' : 'std';
    this.fx.shatter(b.x, b.z, b.color, kind, src.nx || 0, src.nz || 0, b.tower && !b.fallen ? TOWER_H : b.h || BRICK_H, b.tower && b.fallen ? TOWER_H : 1.2);
    if (kind === 'glass') this.audio.glass(); else this.audio.brick(b.maxHp, this.combo);
    vibrate(kind === 'metal' ? 14 : 6);
    // волна по соседям: визуальный подскок + реальный толчок
    this.pushNeighbors(b.x, b.z, 2.2, 1.2);
    this.world.blast(b.x, b.z, 2.2, 1.1);
    let pts = 50 * Math.min(5, b.maxHp);
    if (b.gold) { pts = 500; this.fx.sparksAt(b.x, 0.6, b.z, '#ffd75e', 30, 6, { size: 0.22, life: 0.8 }); }
    if (b.secret) pts = 1000;
    this.addScore(pts, b.x, b.z);
    if (b.explosive) this.explosionQueue.push({ x: b.x, z: b.z, t: 0.08, power: 1 });
    if (b.secret) this.spawnPickup(b.x, b.z, 'star');
    else if (b.bonus) this.spawnPowerup(b.x, b.z);
    else if (Math.random() < (this.level.bonus ? 0.04 : 0.085)) this.spawnPowerup(b.x, b.z);
    if (b.regen) b.regenT = 9;
    this.checkClear();
  }

  pushNeighbors(x, z, radius, strength) {
    const list = this.world.query(x, z, radius);
    for (const br of list) {
      const dx = br.x - x, dz = br.z - z, d = Math.hypot(dx, dz);
      if (d > radius || d < 0.01) continue;
      const k = strength * (1 - d / radius);
      br.wvy += k * 2.2;
      br.wvrx += (dz / d) * k * 4;
      br.wvrz += -(dx / d) * k * 4;
      this.wobbling.add(br);
    }
  }

  updateBricks(dt) {
    // пружинная динамика воблинга
    for (const b of this.wobbling) {
      b.wvy += (-b.wy * 140 - b.wvy * 9) * dt;
      b.wvrx += (-b.wrx * 160 - b.wvrx * 10) * dt;
      b.wvrz += (-b.wrz * 160 - b.wvrz * 10) * dt;
      b.wy += b.wvy * dt; b.wrx += b.wvrx * dt; b.wrz += b.wvrz * dt;
      if (b.appear < 1) b.appear = Math.min(1, b.appear + dt * 4);
      this.writeBrick(b);
      if (b.appear >= 1 && Math.abs(b.wy) + Math.abs(b.wvy) + Math.abs(b.wrx) + Math.abs(b.wvrx) + Math.abs(b.wrz) + Math.abs(b.wvrz) < 0.004) {
        b.wy = b.wvy = b.wrx = b.wvrx = b.wrz = b.wvrz = 0;
        this.writeBrick(b);
        this.wobbling.delete(b);
      }
    }
    // пульс светящихся кирпичей
    const pulse = 1.5 + Math.sin(this.time * 5) * 0.35;
    this.glowMat.color.setRGB(pulse, pulse, pulse);
    // радуга бонус-кирпичей, регенерация, подсказки секретов
    let colorDirty = false;
    for (const b of this.brickList) {
      if (b.bonus && b.alive) {
        _c.setHSL((this.time * 0.25 + b.c * 0.05) % 1, 0.85, 0.6);
        this.brickMeshes.glow.setColorAt(b.inst, _c);
        colorDirty = true;
      }
      if (b.regen && !b.alive && b.regenT > 0 && this.state === 'play') {
        b.regenT -= dt;
        if (b.regenT <= 0) {
          const blocked = this.balls.some((q) => Math.abs(q.x - b.homeX) < BRICK_W && Math.abs(q.z - b.homeZ) < BRICK_D + q.r)
            || this.world.query(b.homeX, b.homeZ, 0.2).some((o) => o !== b && this.world.inside(o, b.homeX, b.homeZ, 0.4));
          if (blocked) b.regenT = 0.5;
          else {
            b.alive = true; b.hp = b.maxHp; b.appear = 0.05;
            this.world.respawn(b);
            this.remaining++;
            this.wobbling.add(b);
            this.fx.sparksAt(b.x, 0.4, b.z, '#7cff9b', 16, 3);
          }
        }
      }
      if (b.secret && b.alive && !b.revealed && Math.random() < dt * 0.25) {
        this.fx.sparks.emit(b.x + (Math.random() - 0.5), 0.6, b.z, 0, 0.6, 0, _c.set('#e0c3ff'), 0.15, 0.9, { drag: 1 });
      }
    }
    if (colorDirty) this.brickMeshes.glow.instanceColor.needsUpdate = true;
  }

  // верх твёрдого кирпича в точке (для укладки обломков)
  solidTop = (x, z) => {
    const b = this.world.brickAt(x, z);
    if (!b || (b.hidden && !b.revealed) || (b.tower && b.tilt > 0 && !b.fallen)) return 0;
    return b.h + b.wy * 0.3;
  };

  updateExplosions(dt) {
    const q = this.explosionQueue;
    for (let i = q.length - 1; i >= 0; i--) {
      const e = q[i];
      e.t -= dt;
      if (e.t > 0) continue;
      q.splice(i, 1);
      this.detonate(e.x, e.z, e.power);
    }
  }

  detonate(x, z, power = 1, radius = 1.95) {
    this.fx.explode(x, z, power, '#ff7a2f');
    this.audio.explosion(power);
    vibrate(30);
    const R = radius * power;
    const hits = this.world.query(x, z, R).slice();
    for (const b of hits) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, (b.z - z) * 1.25);
      if (d > R + 0.3) continue;
      if (b.steel) continue;
      if (b.hidden && !b.revealed) b.revealed = true;
      if (b.explosive) {
        // цепная реакция с задержкой — каскад
        b.hp = 0; b.alive = false; this.world.remove(b); this.writeBrick(b); this.remaining--; this.bricksBroken++; this.combo++;
        this.fx.shatter(b.x, b.z, b.color, 'std');
        this.addScore(100, b.x, b.z);
        this.explosionQueue.push({ x: b.x, z: b.z, t: 0.1 + Math.random() * 0.06, power: 1 });
        this.checkClear();
      } else {
        this.damageBrick(b, power >= 1.5 ? 99 : 3, { nx: Math.sign(b.x - x), nz: Math.sign(b.z - z) });
      }
    }
    // ударная волна расталкивает уцелевшие блоки
    this.world.blast(x, z, 5 * power, 5.5 * power);
    this.pushNeighbors(x, z, 5 * power, 2.5 * power);
    // ударная волна толкает шары
    for (const ball of this.balls) {
      if (ball.stuck) continue;
      const dx = ball.x - x, dz = ball.z - z, d = Math.hypot(dx, dz);
      if (d < 4 * power && d > 0.01) {
        const k = (1 - d / (4 * power)) * 9 * power;
        ball.vx += (dx / d) * k; ball.vz += (dz / d) * k;
        ball.hop = Math.max(ball.hop, 1.2 * power);
      }
    }
    if (this.boss && this.boss.alive && !this.boss.dying && Math.hypot(this.boss.x - x, this.boss.z - z) < this.boss.r + R) {
      this.boss.damage(power >= 1.5 ? 3 : 1, x, z);
    }
  }

  megaBlast(x, z) {
    this.detonate(x, z, 1.8, 2.2);
    this.slowmo = 0.25;
  }

  // Удар погоды по кирпичу (молния, метеор, вулканическая бомба)
  weatherStrike(b, kind) {
    if (!b.alive) return;
    if (kind === 'lightning') {
      this.fx.sparksAt(b.x, 0.8, b.z, '#d8e4ff', 40, 8, { size: 0.2 });
      this.fx.ring(b.x, b.z, 2.5, '#c8d6ff', 0.3);
      this.fx.shake(0.25);
      this.damageBrick(b, 99, {});
      this.pushNeighbors(b.x, b.z, 3, 2);
    } else {
      this.detonate(b.x, b.z, kind === 'meteor' ? 1 : 0.8, 1.6);
      if (b.alive) this.damageBrick(b, 99, {});
    }
  }

  randomBrick(destructibleOnly) {
    const list = this.brickList.filter((b) => b.alive && (!destructibleOnly || !b.steel));
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  spawnBossBricks(n) {
    const f = this.field;
    const free = [];
    for (let r = 2; r < Math.min(f.rows, 9); r++) for (let c = 0; c < f.cols; c++) {
      const x = f.ox + (c + 0.5) * CELL_W, z = f.brickTop + (r + 0.5) * CELL_D;
      if (this.world.brickAt(x, z, 0.35)) continue;
      if (this.boss && Math.hypot(x - this.boss.x, z - this.boss.z) < this.boss.r + 1.2) continue;
      free.push([c, r, x, z]);
    }
    for (let k = 0; k < n && free.length; k++) {
      const [c, r, x, z] = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      // переиспользуем мёртвый обычный кирпич, иначе берём свободный инстанс
      let b = this.brickList.find((q) => !q.alive && q.cat === 'std' && !q.regen && !q.special);
      if (b) {
        b.c = c; b.r = r; b.x = x; b.z = z; b.a = 0; b.ch = '1'; b.hp = b.maxHp = 1; b.hidden = false; b.secret = false;
        b.explosive = false; b.bonus = false; b.gold = false;
        b.color.set(this.loc.bricks[r % this.loc.bricks.length]); b.base.copy(b.color);
        this.brickMeshes.std.setColorAt(b.inst, b.color);
        this.brickMeshes.std.instanceColor.needsUpdate = true;
      } else {
        if (this.catCount.std >= this.brickMeshes.std.count) break;
        b = {
          i: -1, c, r, ch: '1', x, z, hp: 1, maxHp: 1, cat: 'std',
          color: new THREE.Color(this.loc.bricks[r % this.loc.bricks.length]),
          wy: 0, wvy: 0, wrx: 0, wvrx: 0, wrz: 0, wvrz: 0, appear: 0.05, regenT: 0,
        };
        b.base = b.color.clone();
        this.brickList.push(b);
        b.alive = true;
        this.world.add(b);
        this.assignInstance(b);
        this.brickMeshes.std.instanceColor.needsUpdate = true;
      }
      b.alive = true; b.appear = 0.05; b.regenT = 0;
      this.world.remove(b);
      this.world.add(b);
      this.remaining++;
      this.wobbling.add(b);
      this.fx.sparksAt(b.x, 0.5, b.z, '#ffffff', 10, 3);
    }
  }

  // ———————————————————————— Бонусы ————————————————————————
  spawnPowerup(x, z, type) {
    if (!type) {
      const pool = Object.entries(POWERUPS);
      let tot = pool.reduce((a, [, p]) => a + p.w, 0), r = Math.random() * tot;
      for (const [k, p] of pool) { r -= p.w; if (r <= 0) { type = k; break; } }
      type = type || 'expand';
    }
    const P = POWERUPS[type];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 20, 1, true), new THREE.MeshBasicMaterial({ map: label(type) }));
    body.rotation.z = Math.PI / 2;
    const capMat = glow(P.color, 1.6);
    const capGeo = new THREE.SphereGeometry(0.3, 12, 8);
    const c1 = new THREE.Mesh(capGeo, capMat); c1.position.x = -0.5;
    const c2 = new THREE.Mesh(capGeo, capMat); c2.position.x = 0.5;
    g.add(body, c1, c2);
    g.position.set(x, 0.5, z);
    this.scene.add(g);
    this.powerups.push({ type, x, z, vz: 4.2, g, body, t: 0 });
  }

  spawnPickup(x, z, type) {
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), glow('#e0c3ff', 2.6));
    g.position.set(x, 0.7, z);
    this.scene.add(g);
    this.pickups.push({ type, x, z, vz: 3.2, g });
    this.audio.star();
    this.ui.toast('СЕКРЕТНЫЙ КРИСТАЛЛ!', 'secret');
  }

  updatePowerups(dt) {
    const p = this.paddle, f = this.field;
    const catchIt = (o) => Math.abs(o.z - p.z) < 0.6 && Math.abs(o.x - p.x) < p.halfW + 0.5;
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const o = this.powerups[i];
      o.t += dt;
      o.z += o.vz * dt;
      o.x += (f.windX || 0) * 0.15 * dt;
      o.g.position.set(o.x, 0.5 + Math.sin(o.t * 6) * 0.06, o.z);
      o.body.rotation.y += dt * 4;
      if (catchIt(o)) {
        this.applyPowerup(o.type, o.x, o.z);
        this.scene.remove(o.g);
        this.powerups.splice(i, 1);
      } else if (o.z > f.zBottom + 2) {
        this.scene.remove(o.g);
        this.powerups.splice(i, 1);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const o = this.pickups[i];
      o.z += o.vz * dt;
      o.g.position.set(o.x, 0.7 + Math.sin(this.time * 4) * 0.15, o.z);
      o.g.rotation.y += dt * 3;
      if (Math.random() < 0.5) this.fx.sparks.emit(o.x, 0.7, o.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), _c.set('#e0c3ff'), 0.2, 0.6);
      if (catchIt(o)) {
        this.collectStar(o.x, o.z);
        this.scene.remove(o.g);
        this.pickups.splice(i, 1);
      } else if (o.z > f.zBottom + 2) {
        this.scene.remove(o.g);
        this.pickups.splice(i, 1);
      }
    }
  }

  collectStar(x, z) {
    this.starFound = true;
    this.audio.star();
    this.addScore(2500, x, z);
    const id = this.level.id;
    if (id && !profile.stars.includes(id)) { profile.stars.push(id); saveProfile(); }
    this.fx.sparksAt(x, 0.6, z, '#e0c3ff', 60, 8, { size: 0.25, life: 1 });
    if (!this.level.bonus) this.openWarp();
  }

  openWarp() {
    const f = this.field;
    // одни врата за раз: старые гаснут, новые открываются на новом месте
    if (this.warp) {
      this.fx.ring(this.warp.x, this.warp.z, 2, '#e0c3ff', 0.4);
      this.fx.sparksAt(this.warp.x, 0.4, this.warp.z, '#e0c3ff', 20, 4);
      this.scene.remove(this.warp.g);
      this.warp.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      this.warp = null;
    }
    // место для портала — свободная клетка в зоне кирпичей
    const free = [];
    for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) {
      if (!this.world.brickAt(f.ox + (c + 0.5) * CELL_W, f.brickTop + (r + 0.5) * CELL_D, 0.5)) free.push([c, r]);
    }
    let x = 0, z = f.brickBottom + 2;
    if (free.length) {
      const [c, r] = free[Math.floor(Math.random() * free.length)];
      x = f.ox + (c + 0.5) * CELL_W; z = f.brickTop + (r + 0.5) * CELL_D;
    }
    const g = new THREE.Group();
    const t1 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 10, 40), glow('#e0c3ff', 3));
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 10, 40), glow('#7cffb2', 3));
    t1.rotation.x = t2.rotation.x = -Math.PI / 2;
    g.add(t1, t2);
    g.position.set(x, 0.4, z);
    this.scene.add(g);
    this.warp = { x, z, g, t: 18, t1, t2 };
    this.ui.toast('ВАРП-ВРАТА ОТКРЫТЫ — ПОПАДИ ШАРОМ', 'secret');
  }

  enterWarp() {
    if (!this.warp) return;
    this.fx.ring(this.warp.x, this.warp.z, 4, '#e0c3ff', 0.6);
    this.audio.portal();
    this.scene.remove(this.warp.g);
    this.warp = null;
    this.state = 'warp';
    this.app.onSecretWarp(this.result());
  }

  applyPowerup(type, x, z) {
    const P = POWERUPS[type];
    this.audio.power(P.good);
    vibrate(P.good ? [10, 30, 10] : 40);
    this.fx.sparksAt(x, 0.5, z, P.color, 24, 5);
    this.fx.ring(this.paddle.x, this.paddle.z, 2.4, P.color, 0.35);
    this.ui.toast(P.label, P.good ? 'good' : 'bad');
    this.addScore(100, x, z);
    switch (type) {
      case 'expand': this.expandLevel = Math.min(2, (this.expandLevel || 0) + 1); this.effects.expand = P.dur; this.effects.shrink = 0; break;
      case 'shrink': this.effects.shrink = P.dur; this.expandLevel = 0; this.effects.expand = 0; break;
      case 'multi': this.multiball(2); break;
      case 'laser': this.effects.laser = P.dur; break;
      case 'catch': this.effects.catch = P.dur; break;
      case 'slow': this.effects.slow = P.dur; this.effects.fast = 0; break;
      case 'fast': this.effects.fast = P.dur; this.effects.slow = 0; break;
      case 'fire':
        this.effects.fire = P.dur;
        for (const b of this.balls) { b.fire = true; if (!b.mega) b.mesh.material = this.fireMat; }
        break;
      case 'shield': this.shield = 3; this.effects.shield = P.dur; this.shieldMesh.visible = true; break;
      case 'mega': this.megaCharges = Math.min(5, this.megaCharges + 3); for (const b of this.balls) { b.mega = true; b.mesh.material = this.megaMat; } break;
      case 'life': this.run.lives = Math.min(7, this.run.lives + 1); break;
    }
  }

  updateTimers(dt) {
    const e = this.effects;
    for (const k of Object.keys(e)) {
      if (e[k] <= 0) continue;
      e[k] -= dt;
      if (e[k] <= 0) {
        e[k] = 0;
        if (k === 'expand') this.expandLevel = 0;
        if (k === 'fire') for (const b of this.balls) { b.fire = false; if (!b.mega) b.mesh.material = this.ballMat; }
        if (k === 'shield') { this.shield = 0; this.shieldMesh.visible = false; }
      }
    }
    if (this.shieldMesh.visible) this.shieldMesh.material.opacity = 0.5 + Math.sin(this.time * 8) * 0.25;
    // авто-запуск после магнита
    if (this.catchT > 0 && this.balls.some((b) => b.stuck) && this.state === 'play') {
      this.catchT -= dt;
      if (this.catchT <= 0) this.launch();
    }
    if (this.warp) {
      this.warp.t -= dt;
      this.warp.t1.rotation.z += dt * 2; this.warp.t2.rotation.z -= dt * 3;
      this.warp.g.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);
      if (this.warp.t <= 0) { this.scene.remove(this.warp.g); this.warp = null; this.ui.toast('ВРАТА ЗАКРЫЛИСЬ', 'bad'); }
    }
  }

  updateLasers(dt) {
    const p = this.paddle, f = this.field;
    if (this.effects.laser > 0 && this.state === 'play') {
      this.laserCd -= dt;
      if (this.laserCd <= 0) {
        this.laserCd = 0.32;
        const inner = Math.max(0.2, p.halfW - PADDLE_D);
        for (const s of [-1, 1]) {
          const m = new THREE.Mesh(geos().laser, this.laserMat || (this.laserMat = glow('#ff5040', 3)));
          const x = p.x + s * inner;
          m.position.set(x, 0.55, p.z - 0.5);
          this.scene.add(m);
          this.lasers.push({ x, z: p.z - 0.5, m });
        }
        this.audio.laser();
      }
    }
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const L = this.lasers[i];
      L.z -= 30 * dt;
      L.m.position.z = L.z;
      let dead = L.z < f.zTop;
      if (!dead) {
        const b = this.world.brickAt(L.x, L.z, 0.05);
        if (b) {
          dead = true;
          this.world.impulse(b, 0, -0.9, L.x, L.z);
          this.world.tip(b, 0, -2.5, 1.2);
          this.damageBrick(b, 1, { nx: 0, nz: -1 });
        }
      }
      if (!dead && this.boss && this.boss.alive && !this.boss.dying && Math.hypot(L.x - this.boss.x, L.z - this.boss.z) < this.boss.r) {
        dead = true;
        if (!(this.boss.type === 'hydra' && this.boss.orbiters.some((o) => o.alive))) this.boss.damage(0.34, L.x, L.z);
      }
      if (dead) {
        this.fx.sparksAt(L.x, 0.5, L.z, '#ff8a70', 5, 3, { size: 0.1, life: 0.25 });
        this.scene.remove(L.m);
        this.lasers.splice(i, 1);
      }
    }
  }

  paddleHit(kind) {
    const p = this.paddle;
    this.fx.sparksAt(p.x, 0.5, p.z, kind === 'freeze' ? '#bfefff' : '#ff6a3a', 30, 6);
    this.fx.shake(0.3);
    vibrate(60);
    p.flash = 0.6;
    if (kind === 'freeze') { p.freeze = 1.6; this.ui.toast('ЗАМОРОЖЕНО', 'bad'); this.audio.glass(); return; }
    p.stun = 0.45;
    this.expandLevel = Math.max(0, (this.expandLevel || 0) - 1);
    if (kind === 'ink') this.ui.ink();
    this.audio.bossHit();
  }

  // ———————————————————————— Счёт и состояние ————————————————————————
  addScore(n, x, z, quiet = false) {
    const mul = 1 + Math.min(12, Math.floor(this.combo / 4)) * 0.25;
    const pts = Math.round(n * mul);
    this.run.score += pts;
    if (!quiet && x !== undefined && pts >= 50) this.ui.popup(this, x, z, pts, mul > 1 ? mul : 0);
  }

  loseBall(b) {
    this.removeBall(b);
    if (this.balls.length > 0 || this.state !== 'play') return;
    if (this.level.bonus) { this.newBall(true); this.state = 'ready'; return; }
    this.lostBall = true;
    this.run.lives--;
    this.audio.lose();
    vibrate([40, 40, 80]);
    this.fx.shake(0.5);
    this.combo = 0;
    for (const k of Object.keys(this.effects)) this.effects[k] = 0;
    this.expandLevel = 0;
    this.megaCharges = 0;
    this.shield = 0; this.shieldMesh.visible = false;
    if (this.run.lives <= 0) {
      this.state = 'over';
      this.later(() => this.app.onGameOver(this.result()), 900);
    } else {
      this.state = 'ready';
      this.ui.toast(`ШАР ПОТЕРЯН · ОСТАЛОСЬ ${this.run.lives}`, 'bad');
      this.newBall(true);
    }
  }

  checkClear() {
    if (this.state !== 'play' && this.state !== 'ready') return;
    const bossAlive = this.boss && this.boss.alive;
    if (this.remaining <= 0 && !bossAlive) this.levelClear();
  }

  onBossDying() {
    this.slowmo = 1.6;
    this.audio.bossRoar();
    this.ui.toast('КРИТИЧЕСКИЙ УРОН', 'boss');
  }

  onBossDead(boss) {
    this.addScore(10000, boss.x, boss.z);
    profile.bossesDefeated++;
    saveProfile();
    this.slowmo = 1.2;
    this.fx.shake(1);
    // разрушаем оставшиеся кирпичи эффектно
    let delay = 0.2;
    for (const b of this.brickList) {
      if (!b.alive || b.steel) continue;
      this.explosionQueue.push({ x: b.x, z: b.z, t: delay, power: 0.5 });
      delay += 0.04;
    }
    this.later(() => {
      for (const b of this.brickList) if (b.alive && !b.steel) { b.alive = false; this.writeBrick(b); }
      this.remaining = 0;
      this.levelClear();
    }, (delay + 0.8) * 1000);
  }

  // таймер, который не сработает, если уровень уже сменился
  later(fn, ms) {
    const id = this.loadId;
    setTimeout(() => { if (this.loadId === id && this.scene) fn(); }, ms);
  }

  levelClear() {
    if (this.state === 'clear' || this.state === 'over' || this.state === 'warp') return;
    this.state = 'clear';
    this.slowmo = Math.max(this.slowmo, 0.9);
    this.audio.clear();
    for (const b of this.balls) { b.stuck = false; }
    this.later(() => this.app.onLevelClear(this.result()), 1400);
  }

  result() {
    const timeBonus = this.level.bonus ? 0 : Math.max(0, Math.round((180 - this.levelTime) * 20));
    return {
      score: this.run.score, lives: this.run.lives, time: this.levelTime, bricks: this.bricksBroken,
      maxCombo: this.maxCombo, star: this.starFound, perfect: !this.lostBall, timeBonus,
      boss: !!this.level.boss,
    };
  }

  // ———————————————————————— Визуал ————————————————————————
  updateBallVisuals(dt) {
    const trail = settings.trail;
    for (const b of this.balls) {
      if (b.hop > 0 || b.y > b.r) {
        b.hopV = (b.hopV || 0);
        if (b.hop > 0) { b.hopV = Math.max(b.hopV, b.hop * 5); b.hop = 0; }
        b.hopV -= 30 * dt;
        b.y += b.hopV * dt;
        if (b.y < b.r) { b.y = b.r; b.hopV = 0; }
      }
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.rotation.x += b.vz * dt * 2; b.mesh.rotation.z -= b.vx * dt * 2;
      if (trail > 0 && !b.stuck) {
        const col = b.mega ? _c.set('#ff2e88') : b.fire ? _c.set('#ff8c2a') : _c.set(this.loc.accent);
        this.fx.sparks.emit(b.x, b.y, b.z, 0, 0, 0, col, b.r * 2.4, 0.08 + 0.25 * trail, { drag: 0, alpha: 0.7 });
        if (b.fire && Math.random() < 0.7) this.fx.sparks.emit(b.x, b.y, b.z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, _c.set('#ffb347'), 0.25, 0.4, { gravity: -2 });
      }
    }
  }

  updatePortals(dt) {
    for (const p of this.portals) { p.ring.rotation.z += dt * 2; p.g.position.y = 0.35 + Math.sin(this.time * 3 + p.x) * 0.05; }
  }

  updateCamera(dt) {
    const cam = this.renderer.camera, base = this.renderer.camBase;
    this.camT += dt;
    const k = Math.min(1, this.camT / 1.6), e = 1 - Math.pow(1 - k, 3);
    _v.copy(base.pos);
    // пролёт при старте уровня
    if (e < 1) {
      _v.y += (1 - e) * 25;
      _v.z += (1 - e) * 18;
      _v.x += (1 - e) * 10;
    }
    _v.x += this.paddle.x * 0.05;
    _v.add(this.fx.shakeOffset);
    cam.position.copy(_v);
    _tgt.copy(base.target);
    _tgt.x += this.paddle.x * 0.03;
    cam.lookAt(_tgt);
  }

  project(x, y, z) {
    _v.set(x, y, z).project(this.renderer.camera);
    return { x: (_v.x * 0.5 + 0.5) * this.renderer.width, y: (-_v.y * 0.5 + 0.5) * this.renderer.height };
  }

  dispose() {
    if (!this.scene) return;
    this.weather?.dispose();
    this.env?.dispose();
    this.boss?.dispose();
    this.scene.traverse((o) => {
      if (o.geometry && o.geometry !== GEO_CACHE?.brick && o.geometry !== GEO_CACHE?.tower && o.geometry !== GEO_CACHE?.ball && o.geometry !== GEO_CACHE?.laser) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          for (const k of ['map', 'emissiveMap']) if (m[k] && !m[k].userData.keep) m[k].dispose();
          if (m.uniforms?.map?.value && !m.uniforms.map.value.userData.keep) m.uniforms.map.value.dispose();
          m.dispose();
        });
      }
    });
    if (this.brickMeshes) Object.values(this.brickMeshes).forEach((m) => m.dispose());
    this.scene = null;
    this.renderer.setScene(null);
  }
}

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _qYaw = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _tgt = new THREE.Vector3();
export { BOSSES };
