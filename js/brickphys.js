// Физика кирпичей: твёрдые тела на плоскости пола (x, z, угол a).
// Масса, момент инерции, кулоново трение о пол, столкновения OBB–OBB, стенки поля,
// «сон» неподвижных тел и равномерная сетка для широкой фазы.

export const BRICK_W = 1.38, BRICK_D = 0.6, BRICK_H = 0.62;
const HW = BRICK_W / 2, HD = BRICK_D / 2;
const RAD = Math.hypot(HW, HD); // радиус описанной окружности
const CELL = 1.6;
const FRICTION = 9;      // ускорение трения скольжения, ед/с²
const ANG_FRICTION = 34; // угловое трение, рад/с²
const SLEEP_V = 0.06, SLEEP_W = 0.08, SLEEP_T = 0.35;
const RESTITUTION = 0.25;

let UID = 0;
const MASS = { std: 3, metal: 7, glass: 2, glow: 3 };

// Точки углов в локальных координатах
const CORNERS = [[HW, HD], [-HW, HD], [-HW, -HD], [HW, -HD]];
// Точки для контакта блок–блок: чуть утопленные углы + середины рёбер (ловят соосные грани)
const PROBES = [
  [HW * 0.96, HD * 0.96], [-HW * 0.96, HD * 0.96], [-HW * 0.96, -HD * 0.96], [HW * 0.96, -HD * 0.96],
  [0, HD], [0, -HD], [HW * 0.5, HD], [-HW * 0.5, HD], [HW * 0.5, -HD], [-HW * 0.5, -HD], [HW, 0], [-HW, 0],
];

export class BrickWorld {
  constructor(bounds) {
    this.b = bounds; // { minX, maxX, minZ, maxZ }
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / CELL) + 2;
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL) + 2;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.awake = new Set();
    this.moved = new Set(); // тела, чьи матрицы нужно обновить в рендере
    this.tmp = [];
    this.tmp2 = [];
    this.stamp = 0;
  }

  cellOf(x, z) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.b.minX) / CELL) + 1));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.b.minZ) / CELL) + 1));
    return cz * this.cols + cx;
  }

  add(b) {
    b.uid = ++UID;
    b.a = b.a || 0;
    b.vx = 0; b.vz = 0; b.w = 0;
    b.homeX = b.x; b.homeZ = b.z;
    const m = b.steel ? 0 : MASS[b.cat] * (1 + (Math.min(b.maxHp, 5) - 1) * 0.15);
    b.mass = m;
    b.inv = m ? 1 / m : 0;
    b.invI = m ? 1 / (m * (BRICK_W * BRICK_W + BRICK_D * BRICK_D) / 12) : 0;
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
  }

  // Вернуть тело на исходное место (регенерация)
  respawn(b) {
    this.remove(b);
    b.x = b.homeX; b.z = b.homeZ; b.a = 0; b.vx = b.vz = b.w = 0; b.asleep = true;
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

  // Живые тела, центры которых ближе r (+радиус кирпича) к точке. Результат — переиспользуемый массив.
  query(x, z, r, out = this.tmp) {
    out.length = 0;
    const s = ++this.stamp;
    const R = r + RAD;
    const x0 = Math.max(0, Math.floor((x - R - this.b.minX) / CELL) + 1), x1 = Math.min(this.cols - 1, Math.floor((x + R - this.b.minX) / CELL) + 1);
    const z0 = Math.max(0, Math.floor((z - R - this.b.minZ) / CELL) + 1), z1 = Math.min(this.rows - 1, Math.floor((z + R - this.b.minZ) / CELL) + 1);
    const R2 = R * R;
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const cell = this.cells[cz * this.cols + cx];
      for (let k = 0; k < cell.length; k++) {
        const b = cell[k];
        if (b._q === s || !b.alive) continue;
        b._q = s;
        const dx = b.x - x, dz = b.z - z;
        if (dx * dx + dz * dz <= R2) out.push(b);
      }
    }
    return out;
  }

  // Точка внутри кирпича?
  inside(b, x, z, pad = 0) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return Math.abs(lx) <= HW + pad && Math.abs(lz) <= HD + pad;
  }

  brickAt(x, z, pad = 0) {
    const list = this.query(x, z, 0.05 + pad, this.tmp2);
    for (const b of list) if (this.inside(b, x, z, pad)) return b;
    return null;
  }

  // Контакт окружности с повёрнутым прямоугольником. Нормаль — из кирпича к окружности.
  circle(b, cx, cz, r, out) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const dx = cx - b.x, dz = cz - b.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const qx = Math.max(-HW, Math.min(HW, lx)), qz = Math.max(-HD, Math.min(HD, lz));
    let nx = lx - qx, nz = lz - qz;
    const d2 = nx * nx + nz * nz;
    if (d2 >= r * r) return false;
    let pen;
    if (d2 < 1e-10) {
      const px = HW - Math.abs(lx), pz = HD - Math.abs(lz);
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

  // Импульс в точке (px, pz)
  impulse(b, jx, jz, px, pz) {
    if (!b.inv) return;
    b.vx += jx * b.inv;
    b.vz += jz * b.inv;
    const rx = px - b.x, rz = pz - b.z;
    b.w += (rx * jz - rz * jx) * b.invI;
    this.wake(b);
  }

  // Удар шара: возвращает величину импульса
  hitByBall(b, ballMass, rvx, rvz, nx, nz, px, pz) {
    if (!b.inv) return 0;
    const rx = px - b.x, rz = pz - b.z;
    // скорость точки кирпича
    const vpx = b.vx - b.w * rz, vpz = b.vz + b.w * rx;
    const vn = (rvx - vpx) * nx + (rvz - vpz) * nz; // относительная нормальная скорость (<0 — сближение)
    if (vn >= 0) return 0;
    const cn = rx * nz - rz * nx;
    const j = -(1 + RESTITUTION) * vn / (1 / ballMass + b.inv + cn * cn * b.invI);
    this.impulse(b, -j * nx, -j * nz, px, pz);
    return j;
  }

  // Радиальный толчок (взрывы, ударные волны)
  blast(x, z, radius, strength) {
    const list = this.query(x, z, radius);
    for (const b of list) {
      if (!b.inv) continue;
      const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz) || 0.01;
      if (d > radius) continue;
      const k = strength * (1 - d / radius) * b.mass;
      // точка приложения чуть смещена — блоки закручиваются
      const ox = (Math.random() - 0.5) * 0.8, oz = (Math.random() - 0.5) * 0.3;
      this.impulse(b, (dx / d) * k, (dz / d) * k, b.x + ox, b.z + oz);
    }
  }

  // Толчок кинематическим кругом (босс, его орбитали): без урона, просто расталкивает
  pushCircle(cx, cz, r, vx, vz) {
    const list = this.query(cx, cz, r);
    const o = this._o || (this._o = {});
    for (const b of list) {
      if (!b.inv) continue;
      if (!this.circle(b, cx, cz, r, o)) continue;
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
    if (!this.awake.size) return;
    const B = this.b;
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
      const near = this.query(a.x, a.z, RAD, this.tmp2);
      for (const c of near) {
        if (c === a || !c.alive) continue;
        if (!c.asleep && c.uid < a.uid) continue; // пару двух бодрствующих обрабатываем один раз
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
    for (const [lx, lz] of CORNERS) {
      const px = b.x + lx * c - lz * s, pz = b.z + lx * s + lz * c;
      let nx = 0, nz = 0, pen = 0;
      if (px < B.minX) { nx = 1; pen = B.minX - px; }
      else if (px > B.maxX) { nx = -1; pen = px - B.maxX; }
      else if (pz < B.minZ) { nz = 1; pen = B.minZ - pz; }
      else if (pz > B.maxZ) { nz = -1; pen = pz - B.maxZ; }
      else continue;
      b.x += nx * pen; b.z += nz * pen;
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

  // Самый глубокий угол прямоугольника P внутри прямоугольника Q
  deepest(P, Q, out) {
    const cp = Math.cos(P.a), sp = Math.sin(P.a), cq = Math.cos(Q.a), sq = Math.sin(Q.a);
    let best = 0;
    for (const [lx, lz] of PROBES) {
      const wx = P.x + lx * cp - lz * sp, wz = P.z + lx * sp + lz * cp;
      const dx = wx - Q.x, dz = wz - Q.z;
      const qx = dx * cq + dz * sq, qz = -dx * sq + dz * cq;
      const px = HW - Math.abs(qx), pz = HD - Math.abs(qz);
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
    const h1 = this.deepest(A, C, o1); // угол A внутри C, нормаль из C к A
    const h2 = this.deepest(C, A, o2); // угол C внутри A, нормаль из A к C
    if (!h1 && !h2) return;
    let nx, nz, pen, px, pz;
    if (h1 && (!h2 || o1.pen >= o2.pen)) { nx = o1.nx; nz = o1.nz; pen = o1.pen; px = o1.px; pz = o1.pz; }
    else { nx = -o2.nx; nz = -o2.nz; pen = o2.pen; px = o2.px; pz = o2.pz; }
    // n направлена от C к A
    const ia = A.inv, ic = C.inv, sum = ia + ic;
    if (!sum) return;
    let rax = px - A.x, raz = pz - A.z, rcx = px - C.x, rcz = pz - C.z;
    let vax = A.vx - A.w * raz, vaz = A.vz + A.w * rax;
    let vcx = C.vx - C.w * rcz, vcz = C.vz + C.w * rcx;
    let vn = (vax - vcx) * nx + (vaz - vcz) * nz;
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
