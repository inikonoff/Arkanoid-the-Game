// Рендерер: WebGL, пост-обработка, адаптивное разрешение, подгонка камеры под поле.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { settings } from './settings.js';

export class Renderer {
  constructor(container) {
    this.container = container;
    this.dynScale = 1;
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900);
    this.camBase = { pos: new THREE.Vector3(0, 30, 20), target: new THREE.Vector3() };
    this.scene = null;
    this.fpsSamples = [];
    this.lastAdapt = 0;
    this.create();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  create() {
    const r = new THREE.WebGLRenderer({
      antialias: settings.antialias && !settings.bloom,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.domElement.id = 'gl';
    this.container.appendChild(r.domElement);
    this.gl = r;
    const pm = new THREE.PMREMGenerator(r);
    this.envMap = pm.fromScene(new RoomEnvironment(r), 0.04).texture;
    pm.dispose();
    this.applyShadowSettings();
    this.resize();
  }

  applyShadowSettings() {
    const s = settings.shadows;
    this.gl.shadowMap.enabled = s > 0;
    this.gl.shadowMap.type = s >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.gl.shadowMap.needsUpdate = true;
  }

  buildComposer() {
    if (this.composer) { this.composer.passes.forEach((p) => p.dispose?.()); this.composer.dispose(); this.composer.renderTarget1.dispose(); }
    this.composer = null;
    if (!settings.bloom || !this.scene) return;
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    const isGL2 = this.gl.capabilities.isWebGL2;
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: settings.antialias && isGL2 ? 4 : 0,
    });
    const c = new EffectComposer(this.gl, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), settings.bloomStrength, 0.45, 1.0);
    const origSet = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => {
      const k = Math.max(0.2, settings.bloomRes * 2);
      origSet(Math.max(32, Math.round(w * k)), Math.max(32, Math.round(h * k)));
    };
    c.addPass(bloom);
    c.addPass(new OutputPass());
    this.bloom = bloom;
    this.composer = c;
    this.resize();
  }

  setScene(scene) {
    this.scene = scene;
    if (scene && settings.materials === 'pbr') scene.environment = this.envMap;
    this.buildComposer();
    // компилируем шейдеры заранее, чтобы не было фризов при первом появлении объектов
    if (scene) { try { this.gl.compile(scene, this.camera); } catch (e) { /* ignore */ } }
  }

  pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap);
    return Math.max(0.3, dpr * settings.renderScale * this.dynScale);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    const pr = this.pixelRatio();
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, true);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.fieldBounds) this.fitCamera(this.fieldBounds);
  }

  // Подбирает дистанцию и наклон камеры, чтобы поле влезало в любой экран (портрет/альбом).
  fitCamera(b) {
    this.fieldBounds = b;
    const cam = this.camera;
    const aspect = this.width / this.height;
    const pitch = THREE.MathUtils.degToRad(aspect < 0.8 ? 72 : aspect < 1.3 ? 64 : 56);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const pts = [
      new THREE.Vector3(b.minX, 0, b.minZ), new THREE.Vector3(b.maxX, 0, b.minZ),
      new THREE.Vector3(b.minX, 0, b.maxZ), new THREE.Vector3(b.maxX, 0, b.maxZ),
      new THREE.Vector3(b.minX, 1.2, b.minZ), new THREE.Vector3(b.maxX, 1.2, b.minZ),
    ];
    const top = aspect < 0.8 ? 0.8 : 0.84, bottom = aspect < 0.8 ? -0.9 : -0.94, side = 0.97;
    const tgt = new THREE.Vector3(0, 0, (b.minZ + b.maxZ) / 2);
    const v = new THREE.Vector3();
    const test = (dist) => {
      cam.position.copy(tgt).addScaledVector(dir, dist);
      cam.lookAt(tgt);
      cam.updateMatrixWorld();
      let minY = 9, maxY = -9, maxX = 0;
      for (const p of pts) {
        v.copy(p).project(cam);
        if (v.z > 1) return { ok: false };
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); maxX = Math.max(maxX, Math.abs(v.x));
      }
      return { ok: maxX <= side && maxY <= top && minY >= bottom, minY, maxY };
    };
    for (let iter = 0; iter < 6; iter++) {
      let lo = 3, hi = 600;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (test(mid).ok) hi = mid; else lo = mid;
      }
      const res = test(hi);
      // центрируем вертикально внутри допустимого окна
      const want = (top + bottom) / 2, have = (res.maxY + res.minY) / 2;
      const span = Math.abs(b.maxZ - b.minZ);
      tgt.z -= (have - want) * span * 0.45;
      this.camBase.dist = hi;
    }
    test(this.camBase.dist);
    this.camBase.pos.copy(cam.position);
    this.camBase.target.copy(tgt);
  }

  applySettings(keys) {
    const k = new Set(keys);
    if (k.has('shadows')) this.applyShadowSettings();
    if (k.has('bloom') || k.has('antialias') || k.has('bloomRes')) this.buildComposer();
    if (k.has('bloomStrength') && this.bloom) this.bloom.strength = settings.bloomStrength;
    if (k.has('renderScale') || k.has('pixelRatioCap') || k.has('bloomRes')) { this.dynScale = 1; this.resize(); }
    if (k.has('materials') && this.scene) this.scene.environment = settings.materials === 'pbr' ? this.envMap : null;
  }

  // Адаптивное разрешение: понижаем при просадке FPS, возвращаем при запасе.
  adapt(now, dt) {
    this.fpsAcc = (this.fpsAcc || 0) + dt;
    this.fpsN = (this.fpsN || 0) + 1;
    if (now - this.lastAdapt < 1000) return;
    this.lastAdapt = now;
    if (!this.fpsN) return;
    this.fps = this.fpsN / this.fpsAcc;
    this.fpsAcc = 0; this.fpsN = 0;
    if (!settings.adaptive) { if (this.dynScale !== 1) { this.dynScale = 1; this.resize(); } return; }
    // смена разрешения пересоздаёт буферы — делаем это редко и с гистерезисом
    const cap = settings.fpsCap || 240;
    const target = Math.min(settings.adaptiveTarget, cap - 4);
    this.lowRuns = this.fps < target - 5 ? (this.lowRuns || 0) + 1 : 0;
    this.highRuns = this.fps > target + 4 ? (this.highRuns || 0) + 1 : 0;
    if (now - (this.lastResize || 0) < 3000) return;
    if (this.lowRuns >= 2 && this.dynScale > 0.5) {
      this.dynScale = Math.max(0.5, this.dynScale - 0.15);
      this.lastResize = now; this.lowRuns = 0; this.highRuns = 0;
      this.dropped = now;
      this.resize();
    } else if (this.highRuns >= 4 && this.dynScale < 1 && now - (this.dropped || 0) > 10000) {
      this.dynScale = Math.min(1, this.dynScale + 0.1);
      this.lastResize = now; this.highRuns = 0;
      this.resize();
    }
  }

  render() {
    if (!this.scene) return;
    if (this.composer) this.composer.render();
    else this.gl.render(this.scene, this.camera);
  }
}
