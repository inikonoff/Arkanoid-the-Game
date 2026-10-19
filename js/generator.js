// Процедурный генератор уровней: от классики до гигантских и безумных.
import { LOCATIONS } from './locations.js';

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

export const GEN_MODES = [
  { id: 'classic', name: 'Классика', desc: 'Ровные ряды, как в 1986-м.' },
  { id: 'pattern', name: 'Узоры', desc: 'Фигуры: сердца, спирали, захватчики.' },
  { id: 'fortress', name: 'Крепость', desc: 'Стальные стены и золотое ядро.' },
  { id: 'maze', name: 'Лабиринт', desc: 'Сталь коридорами, шар в западне.' },
  { id: 'chaos', name: 'Хаос', desc: 'Шумовые кластеры и цепные взрывы.' },
  { id: 'giant', name: 'Гигант', desc: 'Лоскутное одеяло из сотен кирпичей.' },
  { id: 'insane', name: 'Безумие', desc: 'Три шара, порталы, регенерация, скорость.' },
];

export const GEN_SIZES = [
  { id: 's', name: 'S', cols: 10, rows: 6 },
  { id: 'm', name: 'M', cols: 12, rows: 9 },
  { id: 'l', name: 'L', cols: 16, rows: 13 },
  { id: 'xl', name: 'XL', cols: 24, rows: 18 },
  { id: 'xxl', name: 'XXL', cols: 34, rows: 26 },
  { id: 'mega', name: 'MEGA', cols: 48, rows: 36 },
];

export const SYMMETRY = ['none', 'mirror', 'quad', 'radial'];

const ADJ = ['Кислотный', 'Гранитный', 'Ржавый', 'Звёздный', 'Глухой', 'Искристый', 'Кривой', 'Пульсирующий',
  'Хрустальный', 'Шальной', 'Тихий', 'Магнитный', 'Рваный', 'Бетонный', 'Карминовый', 'Квантовый'];
const NOUN = ['Лабиринт', 'Бастион', 'Улей', 'Каскад', 'Разлом', 'Орнамент', 'Монолит', 'Вихрь', 'Узел',
  'Купол', 'Маяк', 'Реактор', 'Циферблат', 'Шторм', 'Каньон', 'Сад'];

const INVADERS = [
  ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
  ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXX..XX..XXX', 'XXXXXXXXXXXX', '...XX..XX...', '..XX.XX.XX..', 'XX........XX'],
  ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '..X..X..', '.X.XX.X.', 'X.X..X.X'],
];

const SHAPES = {
  diamond: (u, v) => Math.abs(u) + Math.abs(v) < 0.95,
  rings: (u, v) => { const d = Math.hypot(u, v); return d < 1 && Math.floor(d * 4) % 2 === 0; },
  heart: (u, v) => { const x = u * 1.25, y = -v * 1.25 + 0.25; const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y < 0; },
  waves: (u, v) => Math.abs(v - Math.sin(u * 5) * 0.35) < 0.28 || Math.abs(v + 0.6 - Math.sin(u * 5 + 2) * 0.25) < 0.15,
  checker: (u, v, c, r) => (c + r) % 2 === 0,
  spiral: (u, v) => { const a = Math.atan2(v, u), d = Math.hypot(u, v); return d < 1 && ((a / (Math.PI * 2) + d * 1.6) % 0.5 + 0.5) % 0.5 < 0.26; },
  cross: (u, v) => Math.abs(u) < 0.25 || Math.abs(v) < 0.25,
  x: (u, v) => Math.abs(Math.abs(u) - Math.abs(v)) < 0.22,
  eye: (u, v) => { const d = Math.hypot(u, v * 1.8); return d < 1 && (d > 0.75 || Math.hypot(u, v) < 0.3); },
};

function makeGrid(cols, rows, ch = '.') {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ch));
}

function hpForRow(r, rows, diff) {
  const t = 1 - r / Math.max(1, rows - 1);
  const v = t * (1 + diff * 2.2);
  return v > 1.8 ? '3' : v > 0.9 ? '2' : '1';
}

function fillClassic(g, R, diff, dens) {
  const rows = g.length, cols = g[0].length;
  const gapEvery = R.int(3, 6);
  for (let r = 0; r < rows; r++) {
    if (r % gapEvery === gapEvery - 1 && R.chance(0.6)) continue;
    for (let c = 0; c < cols; c++) {
      if (R.chance(dens * 0.15 + 0.85)) g[r][c] = hpForRow(r, rows, diff);
    }
  }
  if (diff > 0.55) {
    const sr = R.int(1, rows - 2);
    for (let c = 0; c < cols; c += R.int(2, 3)) g[sr][c] = '#';
  }
}

function fillPattern(g, R, diff, dens) {
  const rows = g.length, cols = g[0].length;
  const kind = R.pick([...Object.keys(SHAPES), 'invader', 'invader']);
  if (kind === 'invader') {
    const inv = R.pick(INVADERS);
    const ih = inv.length, iw = inv[0].length;
    const sc = Math.max(1, Math.min(Math.floor(cols / iw), Math.floor(rows / ih)));
    const ox = Math.floor((cols - iw * sc) / 2), oy = Math.floor((rows - ih * sc) / 2);
    for (let r = 0; r < ih * sc; r++) for (let c = 0; c < iw * sc; c++) {
      const y = oy + r, x = ox + c;
      if (y < 0 || x < 0 || y >= rows || x >= cols) continue;
      if (inv[Math.floor(r / sc)][Math.floor(c / sc)] === 'X') g[y][x] = hpForRow(r, ih * sc, diff);
    }
    return kind;
  }
  const fn = SHAPES[kind];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = ((c + 0.5) / cols) * 2 - 1, v = ((r + 0.5) / rows) * 2 - 1;
    if (fn(u, v, c, r)) g[r][c] = hpForRow(Math.round(Math.hypot(u, v) * rows * 0.5), rows, diff);
    else if (R.chance(dens * 0.12)) g[r][c] = 'G';
  }
  return kind;
}

function fillFortress(g, R, diff) {
  const rows = g.length, cols = g[0].length;
  const layers = Math.max(2, Math.min(Math.floor(Math.min(rows, cols) / 2), 2 + Math.floor(diff * 4)));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = Math.min(r, c, rows - 1 - r, cols - 1 - c);
    if (d >= layers) g[r][c] = R.chance(0.35) ? 'X' : '$';
    else if (d === 0) g[r][c] = '#';
    else if (d === 1) g[r][c] = diff > 0.4 ? 'A' : '3';
    else g[r][c] = hpForRow(d, layers, diff);
  }
  // ворота в стальной стене
  const gates = 2 + Math.floor(cols / 8);
  for (let i = 0; i < gates; i++) {
    const c = R.int(1, cols - 2);
    g[rows - 1][c] = '.';
    if (R.chance(0.5)) g[0][c] = '.';
  }
  for (let i = 0; i < Math.floor(rows / 4); i++) {
    g[R.int(1, rows - 2)][0] = '.';
    g[R.int(1, rows - 2)][cols - 1] = '.';
  }
}

function fillMaze(g, R, diff, dens) {
  const rows = g.length, cols = g[0].length;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g[r][c] = (r % 2 === 0 || c % 2 === 0) ? '#' : '.';
  const mw = Math.floor((cols - 1) / 2), mh = Math.floor((rows - 1) / 2);
  if (mw < 1 || mh < 1) return;
  const seen = new Set();
  const stack = [[0, 0]];
  seen.add(0);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < mw && ny < mh && !seen.has(ny * mw + nx));
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = R.pick(nb);
    g[1 + y * 2 + dy][1 + x * 2 + dx] = '.';
    seen.add(ny * mw + nx);
    stack.push([nx, ny]);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (g[r][c] === '.') g[r][c] = R.chance(0.55 + dens * 0.4) ? hpForRow(r, rows, diff) : '.';
    else if (g[r][c] === '#' && R.chance(0.55 - diff * 0.35)) g[r][c] = R.chance(0.2) ? 'X' : (diff > 0.5 ? 'A' : '3');
  }
  for (let c = 0; c < cols; c++) if (g[rows - 1][c] === '#' && R.chance(0.6)) g[rows - 1][c] = '1';
}

function noise2(R) {
  const sz = 16, tab = Array.from({ length: sz * sz }, () => R());
  const at = (x, y) => tab[((y % sz + sz) % sz) * sz + ((x % sz + sz) % sz)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fillChaos(g, R, diff, dens) {
  const rows = g.length, cols = g[0].length;
  const n = noise2(R), n2 = noise2(R);
  const f = 0.22 + R() * 0.2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = n(c * f, r * f), w = n2(c * f * 1.7 + 9, r * f * 1.7);
    if (v < 0.62 - dens * 0.45) continue;
    if (w > 0.82) g[r][c] = 'X';
    else if (w > 0.74) g[r][c] = 'G';
    else if (w < 0.12 && diff > 0.3) g[r][c] = '#';
    else if (w < 0.2) g[r][c] = 'A';
    else if (w < 0.26) g[r][c] = '$';
    else g[r][c] = String(1 + Math.floor(v * 3 * (0.5 + diff)) % 3);
  }
}

function fillGiant(g, R, diff, dens) {
  const rows = g.length, cols = g[0].length;
  const bw = R.int(7, 11), bh = R.int(5, 8);
  const fills = [fillClassic, fillPattern, fillFortress, fillChaos, fillPattern];
  for (let by = 0; by < rows; by += bh + 1) {
    for (let bx = 0; bx < cols; bx += bw + 1) {
      const w = Math.min(bw, cols - bx), h = Math.min(bh, rows - by);
      if (w < 3 || h < 3) continue;
      const sub = makeGrid(w, h);
      R.pick(fills)(sub, R, diff, dens);
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) g[by + r][bx + c] = sub[r][c];
    }
  }
}

function applySymmetry(g, sym) {
  const rows = g.length, cols = g[0].length;
  if (sym === 'mirror' || sym === 'quad') {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols / 2; c++) g[r][cols - 1 - c] = g[r][c];
  }
  if (sym === 'quad') {
    for (let r = 0; r < rows / 2; r++) for (let c = 0; c < cols; c++) g[rows - 1 - r][c] = g[r][c];
  }
  if (sym === 'radial') {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const rr = rows - 1 - r, cc = cols - 1 - c;
      if (r * cols + c > rr * cols + cc) g[r][c] = g[rr][cc];
    }
  }
}

function sprinkle(g, R, diff, mode) {
  const rows = g.length, cols = g[0].length;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (/[123]/.test(g[r][c])) cells.push([r, c]);
  const take = (n, ch) => {
    for (let i = 0; i < n && cells.length; i++) {
      const [r, c] = cells.splice(Math.floor(R() * cells.length), 1)[0];
      g[r][c] = ch;
    }
  };
  const total = cells.length;
  const crazy = mode === 'insane' || mode === 'chaos';
  take(Math.max(1, Math.round(total * 0.05)), '?');
  take(Math.round(total * (0.02 + diff * 0.04 + (crazy ? 0.06 : 0))), 'X');
  take(Math.round(total * (crazy ? 0.05 : 0.015) * (0.5 + diff)), 'I');
  take(Math.round(total * (crazy ? 0.06 : 0.02) * diff), 'R');
  if (R.chance(0.7)) take(1, 'S');
  const portals = mode === 'insane' ? 2 : (R.chance(0.25) ? 1 : 0);
  take(portals * 2, 'P');
}

export function generateLevel(opts = {}) {
  const o = {
    seed: opts.seed ?? Math.floor(Math.random() * 1e9).toString(36),
    mode: opts.mode ?? 'classic',
    size: opts.size ?? 'm',
    density: opts.density ?? 0.7,
    difficulty: opts.difficulty ?? 0.5,
    symmetry: opts.symmetry ?? 'mirror',
    location: opts.location ?? -1,
    boss: !!opts.boss,
  };
  const R = rng(`${o.seed}|${o.mode}|${o.size}|${o.density}|${o.difficulty}|${o.symmetry}`);
  const sz = GEN_SIZES.find((s) => s.id === o.size) || GEN_SIZES[1];
  let cols = sz.cols, rows = sz.rows;
  if (o.mode === 'giant' && sz.cols < 24) { cols = 24; rows = 18; }
  const g = makeGrid(cols, rows);
  let shape = '';
  switch (o.mode) {
    case 'pattern': shape = fillPattern(g, R, o.difficulty, o.density); break;
    case 'fortress': fillFortress(g, R, o.difficulty); break;
    case 'maze': fillMaze(g, R, o.difficulty, o.density); break;
    case 'chaos': case 'insane': fillChaos(g, R, o.difficulty, o.density); break;
    case 'giant': fillGiant(g, R, o.difficulty, o.density); break;
    default: fillClassic(g, R, o.difficulty, o.density);
  }
  const sym = o.mode === 'insane' && o.symmetry === 'none' ? 'radial' : o.symmetry;
  applySymmetry(g, sym);
  sprinkle(g, R, o.difficulty, o.mode);
  // гарантия: есть что разбивать
  let breakable = 0;
  for (const row of g) for (const ch of row) if (ch !== '.' && ch !== '#') breakable++;
  if (breakable < 4) for (let c = 0; c < cols; c++) g[rows - 1][c] = '1';
  // боссу нужно место сверху
  let grid = g.map((row) => row.join(''));
  if (o.boss) grid = [...Array(5).fill('.'.repeat(cols)), ...grid.slice(Math.max(0, rows - Math.max(3, Math.floor(rows * 0.4))))];

  const loc = o.location >= 0 ? o.location : R.int(0, LOCATIONS.length - 1);
  const name = `${R.pick(ADJ)} ${R.pick(NOUN)}`;
  return {
    name, grid, location: loc, generated: true, seed: o.seed, opts: o, shape,
    boss: o.boss ? LOCATIONS[loc].boss : null,
    mods: o.mode === 'insane' ? { speedMul: 1.2, startBalls: 3 } : { speedMul: 0.9 + o.difficulty * 0.25 },
  };
}

// Короткий код уровня, чтобы делиться
export function encodeOpts(o) {
  const m = GEN_MODES.findIndex((x) => x.id === o.mode);
  const s = GEN_SIZES.findIndex((x) => x.id === o.size);
  const y = SYMMETRY.indexOf(o.symmetry);
  const loc = o.location < 0 ? 'r' : String(o.location);
  return `${m}${s}${Math.round(o.density * 9)}${Math.round(o.difficulty * 9)}${y}${loc}${o.boss ? 'b' : ''}-${o.seed}`.toUpperCase();
}

export function decodeOpts(code) {
  const m = /^(\d)(\d)(\d)(\d)(\d)([0-9R])(B?)-(.+)$/i.exec(String(code).trim());
  if (!m) return null;
  return {
    mode: GEN_MODES[+m[1]]?.id || 'classic',
    size: GEN_SIZES[+m[2]]?.id || 'm',
    density: +m[3] / 9,
    difficulty: +m[4] / 9,
    symmetry: SYMMETRY[+m[5]] || 'none',
    location: m[6].toLowerCase() === 'r' ? -1 : +m[6],
    boss: !!m[7],
    seed: m[8].toLowerCase(),
  };
}

// Бесконечный режим после кампании
export function endlessLevel(index) {
  const R = rng('endless' + index);
  const tier = Math.floor(index / 3);
  const isBoss = index % 3 === 2;
  const modes = ['classic', 'pattern', 'fortress', 'maze', 'chaos', 'pattern', 'insane'];
  return generateLevel({
    seed: 'e' + index,
    mode: R.pick(modes),
    size: R.pick(tier > 4 ? ['m', 'l', 'xl'] : ['m', 'm', 'l']),
    density: 0.5 + R() * 0.5,
    difficulty: Math.min(1, 0.45 + tier * 0.06),
    symmetry: R.pick(SYMMETRY),
    location: tier % LOCATIONS.length,
    boss: isBoss,
  });
}
