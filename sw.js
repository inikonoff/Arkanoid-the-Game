// Service worker: офлайн-кэш всех ресурсов игры + кэш шрифтов Google.
const VERSION = 'kinetic-v1.1.0';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/main.js', './js/settings.js', './js/renderer.js', './js/audio.js', './js/ui.js', './js/game.js',
  './js/input.js', './js/levels.js', './js/generator.js', './js/locations.js', './js/environment.js',
  './js/weather.js', './js/fx.js', './js/boss.js', './js/mat.js', './js/textures.js', './js/brickphys.js',
  './vendor/three/three.module.min.js',
  './vendor/three/addons/postprocessing/EffectComposer.js', './vendor/three/addons/postprocessing/RenderPass.js',
  './vendor/three/addons/postprocessing/UnrealBloomPass.js', './vendor/three/addons/postprocessing/OutputPass.js',
  './vendor/three/addons/postprocessing/ShaderPass.js', './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/postprocessing/MaskPass.js', './vendor/three/addons/environments/RoomEnvironment.js',
  './vendor/three/addons/geometries/RoundedBoxGeometry.js', './vendor/three/addons/shaders/CopyShader.js',
  './vendor/three/addons/shaders/LuminosityHighPassShader.js', './vendor/three/addons/shaders/OutputShader.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // шрифты: stale-while-revalidate
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(VERSION + '-fonts').then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }
  if (url.origin !== location.origin) return;
  // свои файлы: сначала кэш, затем сеть (с докэшированием)
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
