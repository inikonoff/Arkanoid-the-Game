// Процедурные canvas-текстуры (никаких внешних ассетов — всё работает офлайн).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Простой value-noise для текстур
function makeNoise(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = sm(x - Math.floor(x)), yf = sm(y - Math.floor(y));
    const a = p[p[X] + Y] / 255, b = p[p[X + 1] + Y] / 255, c = p[p[X] + Y + 1] / 255, d = p[p[X + 1] + Y + 1] / 255;
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

export function fbm(noise, x, y, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += noise(x * f, y * f) * a; f *= 2; a *= 0.5; }
  return v;
}

export const noise = makeNoise(7);

export function floorTexture(accent) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  // тонкая техно-сетка
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.07)';
  g.lineWidth = 1;
  for (let i = 0; i <= 512; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  // крестики на пересечениях
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x <= 512; x += 128) for (let y = 0; y <= 512; y += 128) {
    g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
  }
  const t = tex(c, 1);
  return t;
}

export function floorEmissive(accent) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = accent;
  g.globalAlpha = 0.55;
  g.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 64) for (let y = 0; y <= 256; y += 64) {
    g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x, y - 5); g.lineTo(x, y + 5); g.stroke();
  }
  return tex(c, 1);
}

const GROUND_CACHE = new Map();

export function groundTexture(kind, colors) {
  const key = kind + colors.join();
  if (GROUND_CACHE.has(key)) return GROUND_CACHE.get(key);
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const n2 = makeNoise(kind.length * 31);
  const A = new THREE.Color(colors[0]), B = new THREE.Color(colors[1]);
  const tmp = new THREE.Color();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let t;
    switch (kind) {
      case 'sand': t = 0.35 + 0.25 * Math.sin((u * 8 + fbm(n2, u * 6, v * 6) * 2.5) * Math.PI * 2) + fbm(n2, u * 40, v * 40, 2) * 0.25; break;
      case 'grass': t = fbm(n2, u * 16, v * 16) * 0.8 + (n2(u * 120, v * 120) > 0.7 ? 0.3 : 0); break;
      case 'snow': t = 0.15 + fbm(n2, u * 10, v * 10) * 0.4 + (n2(u * 200, v * 200) > 0.93 ? 0.5 : 0); break;
      case 'basalt': { const f = fbm(n2, u * 6, v * 6); const d = Math.abs(f - 0.5); t = d < 0.012 ? 1 - d / 0.012 * 0.5 : f * 0.18; break; }
      case 'seabed': t = fbm(n2, u * 12, v * 12) * 0.7 + 0.25 * Math.sin((u + fbm(n2, u * 4, v * 4)) * 40) * 0.5; break;
      case 'asphalt': t = fbm(n2, u * 50, v * 50, 2) * 0.5 + ((Math.abs(u * 4 % 1 - 0.5) < 0.008) ? 0.8 : 0); break;
      default: t = fbm(n2, u * 10, v * 10);
    }
    t = Math.max(0, Math.min(1, t));
    tmp.copy(A).lerp(B, t);
    const i = (y * S + x) * 4;
    img.data[i] = tmp.r * 255; img.data[i + 1] = tmp.g * 255; img.data[i + 2] = tmp.b * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, 24);
  t.userData.keep = true;
  GROUND_CACHE.set(key, t);
  return t;
}

export function windowTexture(lit) {
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#07070b';
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
    if (Math.random() < 0.42) {
      g.fillStyle = Math.random() < 0.15 ? lit[1] : lit[0];
      g.globalAlpha = 0.5 + Math.random() * 0.5;
      g.fillRect(x, y, 5, 4);
    }
  }
  g.globalAlpha = 1;
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function dotTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function smokeTexture() {
  const [c, g] = canvas(128, 128);
  const n2 = makeNoise(99);
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = x / 64 - 1, dy = y / 64 - 1, d = Math.hypot(dx, dy);
    const a = Math.max(0, 1 - d) * (0.55 + fbm(n2, x / 22, y / 22) * 0.6);
    const i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.min(255, a * a * 255 * 1.4);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// Иконка бонуса на капсуле
export function powerupLabel(text, bg, fg) {
  const [c, g] = canvas(256, 64);
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 2, 64);
  g.fillStyle = fg;
  g.font = '700 40px "Archivo", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let k = 0; k < 2; k++) g.fillText(text, 64 + k * 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.userData.keep = true;
  return t;
}
