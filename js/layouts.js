// Свободные раскладки блоков (не по сетке): кирпичная кладка с перевязкой, кольца, стопки-башни.
// Координаты элементов — в мировых единицах от левого края зоны блоков (x) и от её верха (z).
export const CELL_W = 1.5, CELL_D = 0.75;
const BW = 1.38, BD = 0.6;
const GAP = 0.1;

export const LAYOUT_TYPES = ['masonry', 'rings', 'stacks'];

function hpRow(r, rows, diff) {
  const t = 1 - r / Math.max(1, rows - 1);
  const v = t * (1 + diff * 2);
  return v > 1.7 ? '3' : v > 0.85 ? '2' : '1';
}

function special(R, diff, ch) {
  const r = R();
  if (r < 0.04) return 'X';
  if (r < 0.07) return '?';
  if (r < 0.09) return 'G';
  if (r < 0.1 + diff * 0.03) return '$';
  return ch;
}

// ——— Кирпичная кладка ———
// bond: running — ложковая (полкирпича смещение), english — ряды ложков и тычков, rubble — дикая кладка
function masonry(spec, R) {
  const cols = spec.cols || 12, rows = spec.rows || 8, diff = spec.diff ?? 0.5;
  const W = cols * CELL_W, L = 0.7; // половина стандартного кирпича
  const bond = spec.bond || 'running';
  const free = [];
  let prevJoints = [];
  for (let r = 0; r < rows; r++) {
    const z = (r + 0.5) * CELL_D;
    const joints = [];
    let x = GAP / 2;
    const lengths = [];
    if (bond === 'running') {
      if (r % 2) lengths.push(L);
      while (lengths.reduce((a, b) => a + b, 0) < W) lengths.push(2 * L);
    } else if (bond === 'english') {
      if (r % 2) { lengths.push(L / 2 + L / 4); while (lengths.reduce((a, b) => a + b, 0) < W) lengths.push(L); }
      else while (lengths.reduce((a, b) => a + b, 0) < W) lengths.push(2 * L);
    } else {
      // дикая: разная длина, швы не совпадают со швами нижнего ряда (перевязка)
      let acc = 0;
      while (acc < W) {
        let len = L, ok = false;
        for (let t = 0; t < 8 && !ok; t++) {
          len = L * [1, 2, 2, 3, 3, 4][Math.floor(R() * 6)];
          const j = acc + len;
          ok = j >= W - 0.2 || prevJoints.every((p) => Math.abs(p - j) > 0.3);
        }
        lengths.push(len);
        acc += len;
      }
    }
    for (let i = 0; i < lengths.length; i++) {
      let len = lengths[i];
      if (x + len > W) len = W - x + GAP / 2;
      if (len < L * 0.6) { // слишком короткий обрезок — удлиняем предыдущий
        const prev = free[free.length - 1];
        if (prev && prev.z === z) { prev.w += len; prev.x += len / 2; }
        break;
      }
      const ch = r === 0 && R() < 0.2 ? 'A' : special(R, diff, hpRow(r, rows, diff));
      free.push({ x: x + len / 2 - GAP / 2, z, a: 0, w: len - GAP, d: BD, ch });
      x += len;
      joints.push(x);
      if (x >= W) break;
    }
    prevJoints = joints;
  }
  return { cols, rows, free, rings: [] };
}

// ——— Кольца ———
// pattern: target — сплошные кольца, flower — с регулярными просветами, spiral — разрыв уходит по спирали,
// gear — внешнее кольцо с «зубцами». rotate — скорость вращения (0 — статично).
function rings(spec, R) {
  const cols = spec.cols || 12, diff = spec.diff ?? 0.5;
  const W = cols * CELL_W;
  const n = spec.rings || 3;
  const gapR = 1.25;
  const maxR = Math.min(W / 2 - 0.7, 1.4 + n * gapR);
  const rows = Math.ceil((maxR * 2 + 1.2) / CELL_D);
  const cx = W / 2, cz = rows * CELL_D / 2;
  const free = [], ringsOut = [];
  const pattern = spec.pattern || 'target';
  for (let i = 0; i < n; i++) {
    const r = 1.5 + i * gapR;
    if (r > maxR) break;
    const w = Math.min(1.3, 0.75 + r * 0.12);
    const count = Math.max(6, Math.floor((Math.PI * 2 * r) / (w + 0.16)));
    const omega = spec.rotate ? (i % 2 ? -1 : 1) * spec.rotate * (1 - i * 0.12) : 0;
    ringsOut.push({ cx, cz, r, omega });
    const ch = ['3', '2', '2', '1', '1', '1'][i] || '1';
    for (let k = 0; k < count; k++) {
      if (pattern === 'flower' && k % 4 === 3) continue;
      if (pattern === 'spiral' && (k + i * 2) % count < Math.max(1, Math.floor(count / 7))) continue;
      const th = (k / count) * Math.PI * 2 + i * 0.4;
      free.push({ x: cx + Math.cos(th) * r, z: cz + Math.sin(th) * r, a: th + Math.PI / 2, w, d: 0.5, ch: special(R, diff, ch), ring: ringsOut.length - 1, theta: th });
      if (pattern === 'gear' && i === n - 1 && k % 3 === 0) {
        free.push({ x: cx + Math.cos(th) * (r + 0.6), z: cz + Math.sin(th) * (r + 0.6), a: th, w: 0.55, d: 0.45, ch: 'A', ring: ringsOut.length - 1, theta: th, rOff: 0.6 });
      }
    }
  }
  // ядро
  free.push({ x: cx, z: cz, a: Math.PI / 4, w: 0.85, d: 0.85, ch: '$' });
  for (let k = 0; k < 4; k++) {
    const th = k * Math.PI / 2;
    free.push({ x: cx + Math.cos(th) * 0.85, z: cz + Math.sin(th) * 0.85, a: th, w: 0.32, d: 0.32, ch: k % 2 ? 'X' : '?' });
  }
  return { cols, rows, free, rings: ringsOut };
}

// ——— Стопки: башни в высоту, оседают по блоку ———
// shape: pyramid — ступенчатая пирамида, skyline — город из столбов, castle — стены с угловыми башнями, wall — ровная стена
function stacks(spec, R) {
  const cols = spec.cols || 12, rows = spec.rows || 6, diff = spec.diff ?? 0.5;
  const maxS = spec.max || 4;
  const shape = spec.shape || 'pyramid';
  const free = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let h = 0;
    const u = (c + 0.5) / cols * 2 - 1, v = (r + 0.5) / rows;
    if (shape === 'pyramid') h = Math.round(maxS * (1 - Math.abs(u)) * (0.6 + 0.4 * (1 - v))) ;
    else if (shape === 'skyline') h = R() < 0.8 ? 1 + Math.floor(R() * maxS) : 0;
    else if (shape === 'castle') {
      const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      const corner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
      const gate = r === rows - 1 && Math.abs(c - (cols - 1) / 2) < 1;
      h = gate ? 0 : corner ? maxS : edge ? 2 : (R() < 0.35 ? 1 : 0);
    } else h = 2 + (r === 0 ? maxS - 2 : 0);
    h = Math.max(0, Math.min(maxS, h));
    if (!h) continue;
    const ch = special(R, diff * 0.5, hpRow(r, rows, diff * 0.6));
    free.push({ x: (c + 0.5) * CELL_W, z: (r + 0.5) * CELL_D, a: 0, w: BW, d: BD, ch: ch === '$' ? '2' : ch, stack: h });
  }
  return { cols, rows, free, rings: [] };
}

export function buildLayout(spec, R) {
  if (spec.type === 'masonry') return masonry(spec, R);
  if (spec.type === 'rings') return rings(spec, R);
  return stacks(spec, R);
}
