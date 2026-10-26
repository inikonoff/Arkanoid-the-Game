// Физика кирпичей — гибрид.
// Все блоки: твёрдые тела на плоскости пола (x, z, угол a) — масса, момент инерции, кулоново трение,
// столкновения OBB–OBB, стенки поля, «сон», равномерная сетка для широкой фазы.
// Высокие башни: дополнительно настоящее 3D-опрокидывание вокруг нижнего ребра
// (перевёрнутый маятник: гравитация против устойчивости основания). Упавшая башня становится «бревном».

export const BRICK_W = 1.38, BRICK_D = 0.6, BRICK_H = 0.62;
export const TOWER_B = 0.6, TOWER_H = 2.3;
const HW = BRICK_W / 2, HD = BRICK_D / 2;
const CELL = 1.6;
const FRICTION = 9;      // ускорение трения скольжения, ед/с²
const ANG_FRICTION = 34; // угловое трение, рад/с²
const SLEEP_V = 0.06, SLEEP_W = 0.08, SLEEP_T = 0.35;
const RESTITUTION = 0.25;
const GRAVITY = 20;      // для опрокидывания (в единицах поля)
const HALF_PI = Math.PI / 2;

let UID = 0;
const MASS = { std: 3, metal: 7, glass: 2, glow: 3, tower: 3.4 };
// Масса по типу блока: лёгкие отлетают далеко, тяжёлые едва сдвигаются
export const MASS_BY_TYPE = {
  G: 1.1,   // стекло — пушинка
  '?': 1.6, // бонусный — лёгкий
  S: 1.5, I: 2.4, R: 2.2,
  '1': 2.2, '2': 3.4, '3': 4.8, // чем прочнее, тем тяжелее
  X: 2.6,   // взрывчатка
  T: 3.4,   // башня
  A: 7.5,   // броня — тяжёлая
  $: 10,    // золото — самое тяжёлое
};

// Множители полуразмеров: углы и точки-щупы контакта (утопленные углы + середины рёбер)
const CORNERS = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const PROBES = [
  [0.96, 0.96], [-0.96, 0.96], [-0.96, -0.96], [0.96, -0.96],
  [0, 1], [0, -1], [0.5, 1], [-0.5, 1], [0.5, -1], [-0.5, -1], [1, 0], [-1, 0],
  [0.25, 1], [-0.25, 1], [0.25, -1], [-0.25, -1], [0.75, 1], [-0.75, 1], [0.75, -1], [-0.75, -1],
];

export class BrickWorld {
  constructor(bounds) {
    this.b = bounds; // { minX, maxX, minZ, maxZ }
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / CELL) + 2;
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL) + 2;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.awake = new Set();
    this.tipping = new Set();
    this.moved = new Set(); // тела, чьи матрицы нужно обновить в рендере
    this.landed = [];       // упавшие за шаг башни (обрабатывает игра)
    this.tmp = [];
    this.tmp2 = [];
    this.tmp3 = [];
    this.stamp = 0;
    this.maxRad = Math.hypot(HW, HD);
  }

  cellOf(x, z) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.b.minX) / CELL) + 1));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.b.minZ) / CELL) + 1));
    return cz * this.cols + cx;
  }

  setDims(b, hw, hd) {
    b.hw = hw; b.hd = hd;
    b.rad = Math.hypot(hw, hd);
    this.maxRad = Math.max(this.maxRad, b.rad);
    b.invI = b.mass ? 1 / (b.mass * (4 * hw * hw + 4 * hd * hd) / 12) : 0;
  }

  add(b) {
    b.uid = ++UID;
    b.a = b.a || 0;
    b.vx = 0; b.vz = 0; b.w = 0;
    b.homeX = b.x; b.homeZ = b.z;
    let m = b.steel ? 0 : (MASS_BY_TYPE[b.ch] ?? MASS[b.cat]);
    // блоки свободной раскладки: масса пропорциональна площади
    if (m && !b.tower && b.sw) m *= Math.max(0.35, (b.sw * (b.sd || BRICK_D)) / (BRICK_W * BRICK_D));
    b.mass = m;
    b.inv = m ? 1 / m : 0;
    if (b.tower) {
      b.h = TOWER_H;
      b.tilt = 0; b.tiltV = 0; b.fallen = false;
      this.setDims(b, TOWER_B / 2, TOWER_B / 2);
    } else {
      b.h = BRICK_H;
      this.setDims(b, (b.sw || BRICK_W) / 2, (b.sd || BRICK_D) / 2);
    }
    b.sleepT = 0;
    b.asleep = true;
    b.cell = this.cellOf(b.x, b.z);
    this.cells[b.cell].push(b);
    b._q = 0;
  }

  remove(b) {
    const c = this.cells[b.cell];
    const i = c.indexOf(b);
    if (i >= 0) { c[i] = c[c.length - 1]; c.pop(); }
    this.awake.delete(b);
    this.tipping.delete(b);
  }

  // Вернуть тело на исходное место (регенерация)
  respawn(b) {
    this.remove(b);
    b.x = b.homeX; b.z = b.homeZ; b.a = 0; b.vx = b.vz = b.w = 0; b.asleep = true;
    if (b.tower) { b.tilt = 0; b.tiltV = 0; b.fallen = false; b.h = TOWER_H; b.inv = 1 / b.mass; this.setDims(b, TOWER_B / 2, TOWER_B / 2); }
    b.cell = this.cellOf(b.x, b.z);
    this.cells[b.cell].push(b);
    this.moved.add(b);
  }

  rehash(b) {
    const c = this.cellOf(b.x, b.z);
    if (c === b.cell) return;
    const old = this.cells[b.cell];
    const i = old.indexOf(b);
    if (i >= 0) { old[i] = old[old.length - 1]; old.pop(); }
    b.cell = c;
    this.cells[c].push(b);
  }

  wake(b) {
    if (!b.inv || !b.alive) return;
    b.asleep = false;
    b.sleepT = 0;
    this.awake.add(b);
  }

  // Живые тела, которые могут касаться круга (x, z, r). Результат — переиспользуемый массив.
  query(x, z, r, out = this.tmp) {
    out.length = 0;
    const s = ++this.stamp;
    const R = r + this.maxRad;
    const x0 = Math.max(0, Math.floor((x - R - this.b.minX) / CELL) + 1), x1 = Math.min(this.cols - 1, Math.floor((x + R - this.b.minX) / CELL) + 1);
    const z0 = Math.max(0, Math.floor((z - R - this.b.minZ) / CELL) + 1), z1 = Math.min(this.rows - 1, Math.floor((z + R - this.b.minZ) / CELL) + 1);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const cell = this.cells[cz * this.cols + cx];
      for (let k = 0; k < cell.length; k++) {
        const b = cell[k];
        if (b._q === s || !b.alive) continue;
        b._q = s;
        const dx = b.x - x, dz = b.z - z, rr = r + b.rad;
        if (dx * dx + dz * dz <= rr * rr) out.push(b);
      }
    }
    return out;
  }

  // Точка внутри кирпича?
  inside(b, x, z, pad = 0) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return Math.abs(lx) <= b.hw + pad && Math.abs(lz) <= b.hd + pad;
  }

  brickAt(x, z, pad = 0) {
    const list = this.query(x, z, 0.05 + pad, this.tmp2);
    for (const b of list) if (this.inside(b, x, z, pad)) return b;
    return null;
  }

  // Контакт окружности с повёрнутым прямоугольником. Нормаль — из кирпича к окружности.
  circle(b, cx, cz, r, out) {
    const HWb = b.hw, HDb = b.hd;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const dx = cx - b.x, dz = cz - b.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const qx = Math.max(-HWb, Math.min(HWb, lx)), qz = Math.max(-HDb, Math.min(HDb, lz));
    let nx = lx - qx, nz = lz - qz;
    const d2 = nx * nx + nz * nz;
    if (d2 >= r * r) return false;
    let pen;
    if (d2 < 1e-10) {
      const px = HWb - Math.abs(lx), pz = HDb - Math.abs(lz);
      if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + r; }
      else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + r; }
    } else {
      const d = Math.sqrt(d2);
      nx /= d; nz /= d; pen = r - d;
    }
    out.nx = nx * c - nz * s;
    out.nz = nx * s + nz * c;
    out.pen = pen;
    out.px = b.x + qx * c - qz * s; // точка контакта на кирпиче (мир)
    out.pz = b.z + qx * s + qz * c;
    return true;
  }

  // Отрыв блока от вращающегося кольца: становится свободным телом со скоростью кольца
  detach(b) {
    if (!b.ringAttached) return;
    b.ringAttached = false;
    b.inv = b.inv0; b.invI = b.invI0;
    this.wake(b);
  }

  // Импульс в точке (px, pz)
  impulse(b, jx, jz, px, pz) {
    this.detach(b);
    if (!b.inv) return;
    b.vx += jx * b.inv;
    b.vz += jz * b.inv;
    const rx = px - b.x, rz = pz - b.z;
    b.w += (rx * jz - rz * jx) * b.invI;
    this.wake(b);
  }

  // Удар шара: возвращает величину импульса
  hitByBall(b, ballMass, rvx, rvz, nx, nz, px, pz) {
    this.detach(b);
    const rx = px - b.x, rz = pz - b.z;
    const vpx = b.vx - b.w * rz, vpz = b.vz + b.w * rx;
    const vn = (rvx - vpx) * nx + (rvz - vpz) * nz; // относительная нормальная скорость (<0 — сближение)
    if (vn >= 0) return 0;
    if (b.tower && !b.fallen) {
      // башня: часть импульса раскачивает её вокруг ребра основания
      const mInv = 1 / (b.mass || 3.4);
      const j = -(1 + RESTITUTION) * vn / (1 / ballMass + mInv);
      this.tip(b, -j * nx, -j * nz, 0.75);
      if (!b.inv) return j;
      const cn = rx * nz - rz * nx;
      const js = -(1 + RESTITUTION) * vn / (1 / ballMass + b.inv + cn * cn * b.invI) * 0.5;
      this.impulse(b, -js * nx, -js * nz, px, pz);
      return j;
    }
    if (!b.inv) return 0;
    const cn = rx * nz - rz * nx;
    const j = -(1 + RESTITUTION) * vn / (1 / ballMass + b.inv + cn * cn * b.invI);
    this.impulse(b, -j * nx, -j * nz, px, pz);
    return j;
  }

  // ——— Опрокидывание башен ———
  // Импульс (jx, jz), приложенный на высоте hEff: добавляет угловую скорость вокруг ребра основания.
  tip(b, jx, jz, hEff) {
    if (!b.tower || b.fallen || b.steel || !b.alive) return;
    if (!this.tipping.has(b) && b.tilt === 0) {
      // ребро опрокидывания — грань основания, лучше всего смотрящая по направлению толчка
      const c = Math.cos(b.a), s = Math.sin(b.a);
      const ax = jx * c + jz * s, az = -jx * s + jz * c;
      if (Math.abs(ax) >= Math.abs(az)) { const g = Math.sign(ax) || 1; b.tdx = c * g; b.tdz = s * g; }
      else { const g = Math.sign(az) || 1; b.tdx = -s * g; b.tdz = c * g; }
      b.tbd = TOWER_B / 2;
    }
    const jd = jx * b.tdx + jz * b.tdz;
    if (b.tilt === 0 && jd <= 0) return;
    const H = b.h, bd = b.tbd;
    const k2 = (H * H + 4 * bd * bd) / 3; // I/m относительно ребра
    b.tiltV += (jd * hEff) / (b.mass * k2);
    if (!this.tipping.has(b)) {
      this.tipping.add(b);
      this.awake.delete(b);
      b.vx = b.vz = b.w = 0;
      b.inv = 0; b.invI = 0; // пока качается — кинематическое тело
      b.pivX = b.x + b.tdx * bd; b.pivZ = b.z + b.tdz * bd;
    }
  }

  stepTipping(h) {
    for (const b of this.tipping) {
      if (!b.alive) { this.tipping.delete(b); continue; }
      const H = b.h, bd = b.tbd;
      const R = Math.hypot(H / 2, bd);
      const a0 = Math.atan2(bd, H / 2);
      const k2 = (H * H + 4 * bd * bd) / 3;
      const acc = (GRAVITY * R / k2) * Math.sin(b.tilt - a0) - 0.25 * b.tiltV;
      b.tiltV += acc * h;
      b.tilt += b.tiltV * h;
      this.moved.add(b);
      if (b.tilt <= 0) {
        if (b.tiltV < -0.35) { b.tilt = 0; b.tiltV = -b.tiltV * 0.25; } // стукнулась основанием и качнулась обратно
        else { this.standUp(b); }
      } else if (b.tilt >= HALF_PI) {
        this.land(b);
      }
    }
  }

  standUp(b) {
    b.tilt = 0; b.tiltV = 0; b.chain = 1;
    this.tipping.delete(b);
    b.inv = 1 / b.mass;
    this.setDims(b, TOWER_B / 2, TOWER_B / 2);
  }

  // Башня легла: становится длинным бревном на полу
  land(b) {
    const v = b.tiltV;
    this.tipping.delete(b);
    b.tilt = HALF_PI; b.tiltV = 0; b.fallen = true;
    const H = b.h, bd = b.tbd;
    b.x = b.pivX + b.tdx * H / 2;
    b.z = b.pivZ + b.tdz * H / 2;
    b.a = Math.atan2(b.tdz, b.tdx);
    b.h = TOWER_B;
    b.inv = 1 / b.mass;
    this.setDims(b, H / 2, bd);
    // инерция падения: бревно проскальзывает вперёд
    const sp = Math.min(4, v * H * 0.18);
    b.vx = b.tdx * sp; b.vz = b.tdz * sp;
    this.walls(b);
    this.rehash(b);
    this.wake(b);
    this.moved.add(b);
    // удар по тому, на что упали: стоящие башни валятся дальше (домино), остальное отбрасывает
    const hits = [];
    for (const o of this.query(b.x, b.z, 0.1, this.tmp3)) {
      if (o === b) continue;
      const c1 = this._lc || (this._lc = {});
      if (!this.deepest(o, b, c1) && !this.deepest(b, o, c1)) continue;
      hits.push(o);
      if (o.tower && !o.fallen) { o.chain = Math.max(o.chain || 1, (b.chain || 1) + 1); this.tip(o, b.tdx * 9, b.tdz * 9, 1.6); }
      else if (o.inv) {
        const sx = (o.x - b.x) * -b.tdz + (o.z - b.z) * b.tdx >= 0 ? 1 : -1; // в сторону от оси бревна
        this.impulse(o, (b.tdx * 0.6 - b.tdz * sx) * 6, (b.tdz * 0.6 + b.tdx * sx) * 6, o.x, o.z);
      }
    }
    this.landed.push({ b, hits, x: b.x, z: b.z, dx: b.tdx, dz: b.tdz });
  }

  // Радиальный толчок (взрывы, ударные волны)
  blast(x, z, radius, strength) {
    const list = this.query(x, z, radius).slice();
    for (const b of list) {
      const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > radius) continue;
      this.detach(b);
      if (b.tower && !b.fallen) this.tip(b, (dx / d) * strength * 2.2 * (1 - d / radius) * b.mass, (dz / d) * strength * 2.2 * (1 - d / radius) * b.mass, 1.2);
      if (!b.inv) continue;
      const k = strength * (1 - d / radius) * b.mass;
      // точка приложения чуть смещена — блоки закручиваются
      const ox = (Math.random() - 0.5) * 0.8, oz = (Math.random() - 0.5) * 0.3;
      this.impulse(b, (dx / d) * k, (dz / d) * k, b.x + ox, b.z + oz);
    }
  }

  // Толчок кинематическим кругом (босс, его орбитали): без урона, просто расталкивает и валит башни
  pushCircle(cx, cz, r, vx, vz) {
    const list = this.query(cx, cz, r);
    const o = this._o || (this._o = {});
    for (const b of list) {
      if (!this.circle(b, cx, cz, r, o)) continue;
      if (b.tower && !b.fallen) this.tip(b, -o.nx * 6, -o.nz * 6, 1.4);
      if (!b.inv) continue;
      // нормаль из кирпича к кругу → кирпич двигаем в обратную сторону
      b.x -= o.nx * o.pen; b.z -= o.nz * o.pen;
      const rx = o.px - b.x, rz = o.pz - b.z;
      const vpx = b.vx - b.w * rz, vpz = b.vz + b.w * rx;
      const vn = (vx - vpx) * -o.nx + (vz - vpz) * -o.nz; // скорость круга в сторону кирпича
      const j = Math.max(0.8, vn * 1.3) / (b.inv + (rx * -o.nz - rz * -o.nx) ** 2 * b.invI);
      this.impulse(b, -o.nx * j, -o.nz * j, o.px, o.pz);
      this.rehash(b);
      this.moved.add(b);
    }
  }

  step(h) {
    if (this.tipping.size) this.stepTipping(h);
    if (!this.awake.size) return;
    // интегрирование + трение + стенки
    for (const b of this.awake) {
      if (!b.alive) { this.awake.delete(b); continue; }
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const ns = Math.max(0, sp - FRICTION * h);
        b.vx *= ns / sp; b.vz *= ns / sp;
      }
      const aw = Math.abs(b.w);
      if (aw > 0) b.w *= Math.max(0, aw - ANG_FRICTION * h) / aw;
      b.x += b.vx * h; b.z += b.vz * h; b.a += b.w * h;
      this.walls(b);
    }
    // столкновения бодрствующих с соседями
    for (const a of this.awake) {
      const near = this.query(a.x, a.z, a.rad, this.tmp2);
      for (const c of near) {
        if (c === a || !c.alive) continue;
        if (!c.asleep && this.awake.has(c) && c.uid < a.uid) continue; // пару двух бодрствующих обрабатываем один раз
        this.collide(a, c);
      }
    }
    // сон и переразбиение
    for (const b of this.awake) {
      this.rehash(b);
      this.moved.add(b);
      if (Math.abs(b.vx) < SLEEP_V && Math.abs(b.vz) < SLEEP_V && Math.abs(b.w) < SLEEP_W) {
        b.sleepT += h;
        if (b.sleepT > SLEEP_T) { b.vx = b.vz = b.w = 0; b.asleep = true; this.awake.delete(b); }
      } else b.sleepT = 0;
    }
  }

  walls(b) {
    const B = this.b;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    for (const [mx, mz] of CORNERS) {
      const lx = mx * b.hw, lz = mz * b.hd;
      const px = b.x + lx * c - lz * s, pz = b.z + lx * s + lz * c;
      let nx = 0, nz = 0, pen = 0;
      if (px < B.minX) { nx = 1; pen = B.minX - px; }
      else if (px > B.maxX) { nx = -1; pen = px - B.maxX; }
      else if (pz < B.minZ) { nz = 1; pen = B.minZ - pz; }
      else if (pz > B.maxZ) { nz = -1; pen = pz - B.maxZ; }
      else continue;
      b.x += nx * pen; b.z += nz * pen;
      if (!b.inv) continue;
      const rx = px - b.x, rz = pz - b.z;
      const vpx = b.vx - b.w * rz, vpz = b.vz + b.w * rx;
      const vn = vpx * nx + vpz * nz;
      if (vn < 0) {
        const cn = rx * nz - rz * nx;
        const j = -(1 + RESTITUTION) * vn / (b.inv + cn * cn * b.invI);
        b.vx += j * nx * b.inv; b.vz += j * nz * b.inv; b.w += cn * j * b.invI;
      }
    }
  }

  // Самая глубокая точка-щуп прямоугольника P внутри прямоугольника Q
  deepest(P, Q, out) {
    const cp = Math.cos(P.a), sp = Math.sin(P.a), cq = Math.cos(Q.a), sq = Math.sin(Q.a);
    const n = P.hw > 0.5 ? PROBES.length : 12; // длинным телам — больше щупов вдоль рёбер
    let best = 0;
    for (let i = 0; i < n; i++) {
      const lx = PROBES[i][0] * P.hw, lz = PROBES[i][1] * P.hd;
      const wx = P.x + lx * cp - lz * sp, wz = P.z + lx * sp + lz * cp;
      const dx = wx - Q.x, dz = wz - Q.z;
      const qx = dx * cq + dz * sq, qz = -dx * sq + dz * cq;
      const px = Q.hw - Math.abs(qx), pz = Q.hd - Math.abs(qz);
      if (px <= 0 || pz <= 0) continue;
      let nx, nz, pen;
      if (px < pz) { nx = Math.sign(qx); nz = 0; pen = px; } else { nx = 0; nz = Math.sign(qz); pen = pz; }
      if (pen > best) {
        best = pen;
        out.pen = pen; out.px = wx; out.pz = wz;
        out.nx = nx * cq - nz * sq; out.nz = nx * sq + nz * cq; // наружу из Q
      }
    }
    return best > 0;
  }

  collide(A, C) {
    const o1 = this._c1 || (this._c1 = {}), o2 = this._c2 || (this._c2 = {});
    const h1 = this.deepest(A, C, o1); // точка A внутри C, нормаль из C к A
    const h2 = this.deepest(C, A, o2); // точка C внутри A, нормаль из A к C
    if (!h1 && !h2) return;
    let nx, nz, pen, px, pz;
    if (h1 && (!h2 || o1.pen >= o2.pen)) { nx = o1.nx; nz = o1.nz; pen = o1.pen; px = o1.px; pz = o1.pz; }
    else { nx = -o2.nx; nz = -o2.nz; pen = o2.pen; px = o2.px; pz = o2.pz; }
    // n направлена от C к A
    const ia = A.inv, ic = C.inv, sum = ia + ic;
    let rax = px - A.x, raz = pz - A.z, rcx = px - C.x, rcz = pz - C.z;
    let vax = A.vx - A.w * raz, vaz = A.vz + A.w * rax;
    let vcx = C.vx - C.w * rcz, vcz = C.vz + C.w * rcx;
    let vn = (vax - vcx) * nx + (vaz - vcz) * nz;
    // блок, въехавший в стоящую башню, раскачивает её
    if (vn < -0.5) {
      if (C.tower && !C.fallen) this.tip(C, -nx * -vn * A.mass * 0.9, -nz * -vn * A.mass * 0.9, A.h * 0.6);
      if (A.tower && !A.fallen) this.tip(A, nx * -vn * C.mass * 0.9, nz * -vn * C.mass * 0.9, C.h * 0.6);
    }
    if (!sum) return;
    // покоящийся контакт в пределах допуска — не трогаем, чтобы стопка могла уснуть
    if (pen < 0.012 && vn > -0.15) return;
    if (C.asleep && ic) this.wake(C);
    const corr = Math.max(0, pen - 0.005) * 0.8 / sum;
    A.x += nx * corr * ia; A.z += nz * corr * ia;
    C.x -= nx * corr * ic; C.z -= nz * corr * ic;
    if (vn >= 0) return;
    const ca = rax * nz - raz * nx, cc = rcx * nz - rcz * nx;
    const j = -(1 + RESTITUTION) * vn / (sum + ca * ca * A.invI + cc * cc * C.invI);
    A.vx += j * nx * ia; A.vz += j * nz * ia; A.w += ca * j * A.invI;
    C.vx -= j * nx * ic; C.vz -= j * nz * ic; C.w -= cc * j * C.invI;
    // трение в контакте гасит проскальзывание
    const tx = -nz, tz = nx;
    const vt = (vax - vcx) * tx + (vaz - vcz) * tz;
    const jt = Math.max(-0.4 * j, Math.min(0.4 * j, -vt / (sum + 1e-6) * 0.5));
    A.vx += jt * tx * ia; A.vz += jt * tz * ia;
    C.vx -= jt * tx * ic; C.vz -= jt * tz * ic;
  }
}
