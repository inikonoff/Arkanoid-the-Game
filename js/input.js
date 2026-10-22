// Ввод: тач (относительный/абсолютный), мышь, клавиатура, секретный код.
import * as THREE from 'three';
import { settings } from './settings.js';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

export class Input {
  constructor(el, app) {
    this.app = app;
    this.el = el;
    this.keys = new Set();
    this.ptr = null;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
    this.hit = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
    this.konami = [];
    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', () => { this.ptr = null; });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get game() { return this.app.game; }
  active() { return this.app.mode === 'play' && !this.app.paused && this.game?.scene; }

  worldX(e) {
    const r = this.app.renderer;
    this.ndc.set((e.clientX / r.width) * 2 - 1, -(e.clientY / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, r.camera);
    this.plane.constant = -0.3;
    return this.ray.ray.intersectPlane(this.plane, this.hit) ? this.hit.x : null;
  }

  worldPerPx() {
    const g = this.game, f = g.field;
    const a = g.project(-f.W / 2, 0.3, f.paddleZ), b = g.project(f.W / 2, 0.3, f.paddleZ);
    return f.W / Math.max(40, b.x - a.x);
  }

  down(e) {
    this.app.audio.unlock();
    if (!this.active()) return;
    this.ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t0: performance.now(), moved: 0, type: e.pointerType, k: this.worldPerPx() };
    if (e.pointerType === 'mouse' || settings.touchMode === 'absolute') {
      const x = this.worldX(e);
      if (x !== null) this.game.setPaddleTarget(x);
    }
  }

  move(e) {
    if (!this.active()) return;
    if (e.pointerType === 'mouse' && (!this.ptr || this.ptr.type === 'mouse')) {
      const x = this.worldX(e);
      if (x !== null) this.game.setPaddleTarget(x);
      return;
    }
    const p = this.ptr;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    p.x = e.clientX;
    p.moved += Math.abs(dx);
    if (settings.touchMode === 'absolute') {
      const x = this.worldX(e);
      if (x !== null) this.game.setPaddleTarget(x);
    } else {
      this.game.movePaddleBy(dx * p.k * settings.sensitivity);
    }
  }

  up(e) {
    const p = this.ptr;
    if (!p || p.id !== e.pointerId) return;
    this.ptr = null;
    if (!this.active()) return;
    const dt = performance.now() - p.t0;
    if (p.moved < 14 && dt < 400) this.game.launch();
  }

  key(e, down) {
    if (down) {
      this.konami.push(e.code);
      if (this.konami.length > KONAMI.length) this.konami.shift();
      if (this.konami.join() === KONAMI.join()) this.app.unlockChaos();
    }
    if (e.target && e.target.tagName === 'INPUT') return;
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
    if (!down) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.app.mode === 'play') { this.app.paused ? this.app.resume() : this.app.pause(); }
      else if (this.app.ui.current() !== 'menu') this.app.ui.back();
    }
    const bk = { Digit1: 'field', Digit2: 'gun', Digit3: 'armor', Digit4: 'sticky' }[e.code];
    if (bk && this.active()) { this.game.activateBooster(bk); e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (this.active()) { this.game.launch(); e.preventDefault(); }
    }
  }

  update(dt) {
    if (!this.active()) return;
    let d = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) d -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) d += 1;
    if (d) {
      const f = this.game.field;
      const sp = Math.max(18, f.W * 1.1) * (this.keys.has('ShiftLeft') ? 1.6 : 1);
      this.game.paddle.target = this.game.paddle.x + d * sp * 0.055;
      this.game.clampTarget();
    }
  }
}
