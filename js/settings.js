// Настройки графики/звука/управления + профиль игрока. Всё хранится в localStorage.

const KEY_SETTINGS = 'kinetic.settings.v1';
const KEY_PROFILE = 'kinetic.profile.v1';

export const PRESETS = {
  ultra: {
    renderScale: 1, pixelRatioCap: 2, shadows: 3, materials: 'pbr', bloom: true, bloomStrength: 0.85,
    bloomRes: 0.5, aa: 'max', debris: 1, particles: 1, weatherFx: 1, envDetail: 2, dynLights: true,
    trail: 1, physicsRate: 240, fpsCap: 0,
  },
  high: {
    renderScale: 1, pixelRatioCap: 2, shadows: 2, materials: 'pbr', bloom: true, bloomStrength: 0.75,
    bloomRes: 0.5, aa: 'max', debris: 0.7, particles: 0.8, weatherFx: 0.8, envDetail: 2, dynLights: true,
    trail: 0.8, physicsRate: 120, fpsCap: 0,
  },
  medium: {
    renderScale: 0.85, pixelRatioCap: 1.5, shadows: 1, materials: 'pbr', bloom: true, bloomStrength: 0.6,
    bloomRes: 0.35, aa: 'fxaa', debris: 0.45, particles: 0.55, weatherFx: 0.55, envDetail: 1, dynLights: true,
    trail: 0.5, physicsRate: 120, fpsCap: 60,
  },
  low: {
    renderScale: 0.7, pixelRatioCap: 1, shadows: 0, materials: 'simple', bloom: false, bloomStrength: 0.5,
    bloomRes: 0.25, aa: 'fxaa', debris: 0.25, particles: 0.3, weatherFx: 0.3, envDetail: 1, dynLights: false,
    trail: 0.3, physicsRate: 120, fpsCap: 60,
  },
  potato: {
    renderScale: 0.5, pixelRatioCap: 1, shadows: 0, materials: 'simple', bloom: false, bloomStrength: 0.5,
    bloomRes: 0.25, aa: 'off', debris: 0.08, particles: 0.12, weatherFx: 0.12, envDetail: 0, dynLights: false,
    trail: 0, physicsRate: 60, fpsCap: 60,
  },
};

export const DEFAULTS = {
  preset: 'auto',
  ...PRESETS.high,
  adaptive: true,
  adaptiveTarget: 55,
  shake: 0.8,
  flashes: true,
  showFps: false,
  masterVol: 0.8,
  sfxVol: 0.9,
  musicVol: 0.45,
  haptics: true,
  touchMode: 'relative',
  sensitivity: 1.15,
};

// Какие ключи требуют пересборки сцены / перезапуска рендерера.
export const REBUILD_KEYS = new Set(['shadows', 'materials', 'envDetail', 'debris', 'particles', 'weatherFx', 'dynLights']);
export const RESTART_KEYS = new Set();

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch (e) { /* приватный режим и т.п. */ }
  return { ...fallback };
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

// Грубая оценка производительности устройства для пресета «Авто».
export function detectPreset() {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || (mobile ? 3 : 8);
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch (e) { /* ignore */ }
  // PowerVR GE8xxx (Helio G25/G35/P35 — Honor X6, Redmi 9A…), Mali-4xx/T/G31/G51/G52 MC1, старые Adreno
  const weakGpu = /Mali-4|Mali-T|Mali-G3\d|Mali-G51|Mali-G52 MC1|Adreno \(TM\) [2-5]\d\d|Adreno \(TM\) 6[01]\d|PowerVR SGX|PowerVR Rogue GE|PowerVR Rogue G6|GE8\d{3}|Intel\(R\) HD Graphics [2-5]|SwiftShader|llvmpipe/i.test(gpu);
  const midGpu = /Mali-G52|Mali-G57 MC[1-2]|Adreno \(TM\) 6[1-2]\d|PowerVR Rogue GM|PowerVR B-Series/i.test(gpu);
  if (weakGpu || mem <= 2 || cores <= 2) return 'potato';
  if (mobile && midGpu) return 'low';
  if (mobile) {
    if (mem <= 4 || cores <= 4) return 'low';
    return 'medium';
  }
  if (mem <= 4 || cores <= 4) return 'medium';
  if (/RTX|RX [67]\d\d\d|Apple M[2-9]/i.test(gpu)) return 'ultra';
  return 'high';
}

export const settings = load(KEY_SETTINGS, DEFAULTS);
// миграция: раньше «Картошка» была ограничена 30 FPS
if (!settings._v2) {
  if (settings.preset === 'potato' && settings.fpsCap === 30) settings.fpsCap = 60;
  settings._v2 = true;
  save(KEY_SETTINGS, settings);
}
// миграция: булево antialias → режим сглаживания
if ('antialias' in settings) {
  settings.aa = settings.antialias ? 'max' : (settings.preset === 'potato' ? 'off' : 'fxaa');
  delete settings.antialias;
  save(KEY_SETTINGS, settings);
}
if (settings.preset === 'auto' && !settings._autoApplied) {
  Object.assign(settings, PRESETS[detectPreset()], { _autoApplied: true });
  save(KEY_SETTINGS, settings);
}

const listeners = new Set();
export function onSettingsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setSetting(key, value, silent = false) {
  settings[key] = value;
  if (key !== 'preset' && key in PRESETS.high) settings.preset = 'custom';
  save(KEY_SETTINGS, settings);
  if (!silent) listeners.forEach((fn) => fn([key]));
}

export function applyPreset(name) {
  const p = name === 'auto' ? PRESETS[detectPreset()] : PRESETS[name];
  if (!p) return;
  Object.assign(settings, p, { preset: name });
  save(KEY_SETTINGS, settings);
  listeners.forEach((fn) => fn(Object.keys(p)));
}

export function resetSettings() {
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, DEFAULTS, PRESETS[detectPreset()], { _autoApplied: true });
  save(KEY_SETTINGS, settings);
  listeners.forEach((fn) => fn(Object.keys(DEFAULTS)));
}

// ——— Профиль ———
export const profile = load(KEY_PROFILE, {
  maxLevel: 0,          // индекс последнего открытого уровня кампании
  bestScore: 0,
  stars: [],            // id уровней, где найден секретный кристалл
  bossesDefeated: 0,
  chaosUnlocked: false,
  chaosMode: false,
  skin: 0,
  plays: 0,
  saved: null,          // сохранённый забег {level, score, lives}
});

export function saveProfile() { save(KEY_PROFILE, profile); }
