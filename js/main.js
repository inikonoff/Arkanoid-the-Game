// Точка входа: цикл, сценарии (кампания, бесконечный, генератор, бонус), демо в меню, PWA.
import { settings, onSettingsChange, profile, saveProfile } from './settings.js';
import { Renderer } from './renderer.js';
import { Audio, vibrate } from './audio.js';
import { UI, fmt } from './ui.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { CAMPAIGN } from './levels.js';
import { generateLevel, endlessLevel } from './generator.js';
import { LOCATIONS } from './locations.js';

const bootFill = document.getElementById('boot-fill');
const bootText = document.getElementById('boot-text');
const progress = (k, t) => { bootFill.style.width = k * 100 + '%'; if (t) bootText.textContent = t; };

const CHAOS_MODS = [
  { key: 'speed', v: 1.22, label: 'ТУРБО' },
  { key: 'ball', v: 1.7, label: 'ГИГАНТСКИЙ ШАР' },
  { key: 'paddle', v: 0.72, label: 'КОРОТКАЯ РАКЕТКА' },
  { key: 'mirror', v: true, label: 'ЗЕРКАЛЬНОЕ УПРАВЛЕНИЕ' },
  { key: 'explosive', v: true, label: 'ВСЁ ВЗРЫВАЕТСЯ' },
];

class App {
  constructor() {
    progress(0.1, 'РЕНДЕРЕР');
    this.renderer = new Renderer(document.getElementById('stage'));
    progress(0.35, 'ЗВУК');
    this.audio = new Audio();
    this.ui = new UI(this);
    this.game = new Game(this);
    this.input = new Input(document.getElementById('stage'), this);
    this.mode = 'menu';
    this.paused = false;
    this.run = null;
    this.needsRebuild = false;
    onSettingsChange((keys) => {
      this.renderer.applySettings(keys);
      this.audio.applyVolumes();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'play' && !this.paused) this.pause();
        this.audio.ctx?.suspend();
      } else if (this.audio.ctx && settings.masterVol > 0) this.audio.ctx.resume();
    });
    progress(0.6, 'СЦЕНА');
  }

  // ——— Демо в главном меню ———
  startDemo() {
    this.mode = 'menu';
    this.paused = false;
    const pool = CAMPAIGN.filter((l) => !l.boss);
    const lv = Math.random() < 0.7
      ? pool[Math.floor(Math.random() * pool.length)]
      : generateLevel({ mode: ['pattern', 'chaos', 'fortress', 'classic'][Math.floor(Math.random() * 4)], size: 'm' });
    this.run = { demo: true, mode: 'demo', score: 0, lives: 99, levelIndex: 3 };
    this.ui.setHud(false);
    this.game.load(lv, this.run);
    this.game.autoplay = true;
    vibrate.enabled = false;
    this.demoTime = 0;
    this.needsRebuild = false;
  }

  chaosMods() {
    if (!profile.chaosMode) return {};
    const picks = CHAOS_MODS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    const mods = {};
    picks.forEach((m) => { mods[m.key] = m.v; });
    setTimeout(() => this.ui.toast('ХАОС: ' + picks.map((p) => p.label).join(' + '), 'secret'), 2300);
    return mods;
  }

  startLevel(level) {
    this.mode = 'play';
    this.paused = false;
    this.currentLevel = level;
    this.levelStart = { score: this.run.score, lives: this.run.lives };
    this.run.chaos = this.chaosMods();
    this.ui.hideAll();
    this.ui.setHud(true);
    this.audio.unlock();
    this.game.load(level, this.run);
    this.game.autoplay = false;
    vibrate.enabled = true;
    this.audio.startMusic();
    this.needsRebuild = false;
    profile.plays++;
    saveProfile();
  }

  newGame() {
    profile.saved = null;
    saveProfile();
    this.playCampaign(0);
  }

  continueGame() {
    const s = profile.saved;
    if (!s) return this.newGame();
    if (s.mode === 'endless') this.playEndless(s.levelIndex, s);
    else this.playCampaign(s.levelIndex, s);
  }

  playCampaign(i, carry) {
    if (i >= CAMPAIGN.length) return this.playEndless(0, carry);
    this.run = { mode: 'campaign', levelIndex: i, score: carry?.score || 0, lives: carry?.lives || 3 };
    this.startLevel(CAMPAIGN[i]);
  }

  playEndless(i = 0, carry) {
    this.run = { mode: 'endless', levelIndex: i, score: carry?.score || 0, lives: carry?.lives || 3 };
    const lv = endlessLevel(i);
    lv.id = 'e' + i;
    lv.name = `∞ ${String(i + 1).padStart(2, '0')} · ${lv.name}`;
    this.startLevel(lv);
  }

  playCustom(level) {
    this.customLevel = level;
    this.run = { mode: 'custom', levelIndex: Math.round(level.opts.difficulty * 18), score: 0, lives: 3 };
    this.startLevel(level);
  }

  // ——— События игры ———
  onLevelClear(res) {
    if (this.run.demo) { this.startDemo(); return; }
    const lv = this.currentLevel;
    const perfect = res.perfect ? 5000 : 0;
    const bonus = res.timeBonus + perfect + (res.boss ? 0 : 0);
    const before = res.score;
    this.run.score += bonus;
    if (this.run.mode === 'campaign' && !lv.bonus) {
      profile.maxLevel = Math.max(profile.maxLevel, Math.min(CAMPAIGN.length - 1, this.run.levelIndex + 1));
    }
    profile.bestScore = Math.max(profile.bestScore, this.run.score);
    if (this.run.mode === 'campaign' || this.run.mode === 'endless') {
      profile.saved = { mode: this.run.mode, levelIndex: this.run.levelIndex + 1, score: this.run.score, lives: this.run.lives };
      if (this.run.mode === 'campaign' && this.run.levelIndex + 1 >= CAMPAIGN.length) profile.saved = { mode: 'endless', levelIndex: 0, score: this.run.score, lives: this.run.lives };
    }
    saveProfile();
    const rows = [
      { k: 'ОЧКИ ЗА УРОВЕНЬ', v: before - this.levelStart.score },
      { k: 'КИРПИЧЕЙ', v: res.bricks },
      { k: 'МАКС. КОМБО', v: res.maxCombo },
      { k: 'ВРЕМЯ', v: `${Math.floor(res.time / 60)}:${String(Math.floor(res.time % 60)).padStart(2, '0')}`, raw: true },
      { k: 'БОНУС ЗА ВРЕМЯ', v: res.timeBonus },
    ];
    if (perfect) rows.push({ k: 'БЕЗ ПОТЕРЬ', v: perfect });
    if (res.star) rows.push({ k: 'СЕКРЕТНЫЙ КРИСТАЛЛ', v: '◆ НАЙДЕН', raw: true, cls: 'secret' });
    rows.push({ k: 'ИТОГО', v: this.run.score, cls: 'total' });
    let kicker = lv.boss ? 'БОСС ПОВЕРЖЕН' : 'УРОВЕНЬ ПРОЙДЕН';
    if (lv.bonus) kicker = 'БОНУС ЗАВЕРШЁН';
    if (this.run.mode === 'campaign' && this.run.levelIndex === CAMPAIGN.length - 1) kicker = 'КАМПАНИЯ ПРОЙДЕНА · ДАЛЕЕ — БЕСКОНЕЧНОСТЬ';
    this.mode = 'result';
    this.ui.setHud(false);
    this.ui.showResult(lv, res, rows, kicker);
  }

  nextLevel() {
    const r = this.run;
    const carry = { score: r.score, lives: r.lives };
    if (r.mode === 'campaign') this.playCampaign(r.levelIndex + 1, carry);
    else if (r.mode === 'endless') this.playEndless(r.levelIndex + 1, carry);
    else {
      const o = { ...this.customLevel.opts, seed: this.customLevel.opts.seed + 'x' };
      this.ui.genOpts.seed = o.seed;
      const lv = generateLevel(o);
      this.customLevel = lv;
      this.run = { ...r, ...carry };
      this.startLevel(lv);
    }
  }

  onGameOver(res) {
    if (this.run.demo) { this.startDemo(); return; }
    const best = this.run.score > profile.bestScore;
    profile.bestScore = Math.max(profile.bestScore, this.run.score);
    if (this.run.mode === 'campaign' || this.run.mode === 'endless') profile.saved = null;
    saveProfile();
    this.mode = 'result';
    this.ui.setHud(false);
    this.ui.showGameOver([
      { k: 'СЧЁТ', v: fmt(this.run.score), cls: 'total' },
      { k: 'РЕКОРД', v: best ? 'НОВЫЙ!' : fmt(profile.bestScore) },
      { k: 'УРОВЕНЬ', v: this.currentLevel.name },
      { k: 'КИРПИЧЕЙ', v: res.bricks },
    ]);
  }

  retry() {
    const r = this.run;
    if (r.mode === 'custom') return this.playCustom(this.customLevel);
    if (r.mode === 'endless') return this.playEndless(r.levelIndex);
    if (this.currentLevel.bonus) return this.playCampaign(r.levelIndex);
    this.playCampaign(r.levelIndex);
  }

  onSecretWarp(res) {
    const r = this.run;
    if (r.mode === 'campaign') profile.maxLevel = Math.max(profile.maxLevel, Math.min(CAMPAIGN.length - 1, r.levelIndex + 1));
    saveProfile();
    this.ui.flash(0.8);
    const loc = this.currentLevel.location;
    const lv = generateLevel({ seed: 'gold' + r.levelIndex, mode: 'pattern', size: 'l', density: 0.9, difficulty: 0.25, symmetry: 'mirror', location: loc });
    lv.grid = lv.grid.map((row) => row.replace(/[123]/g, (c) => (Math.random() < 0.45 ? '$' : Math.random() < 0.15 ? '?' : Math.random() < 0.1 ? 'X' : c)).replace(/[#RIP]/g, '1'));
    lv.bonus = true;
    lv.name = 'Золотая жила';
    lv.id = null;
    lv.mods = { speedMul: 0.95 };
    setTimeout(() => {
      this.run.lives = Math.max(this.run.lives, res.lives);
      this.startLevel(lv);
      this.ui.toast('БОНУС-УРОВЕНЬ · 35 СЕКУНД', 'secret');
    }, 600);
  }

  // ——— Пауза / меню ———
  pause() {
    if (this.mode !== 'play' || this.paused) return;
    this.paused = true;
    this.ui.setHud(false);
    this.ui.showPause(this.currentLevel);
    this.audio.stopMusic();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.ui.hideAll();
    this.ui.stack = ['menu'];
    this.ui.setHud(true);
    this.ui.resetHud();
    this.audio.startMusic();
    if (this.needsRebuild) this.ui.toast('ГРАФИКА ОБНОВИТСЯ НА СЛЕДУЮЩЕМ УРОВНЕ', 'good');
  }

  restart() {
    this.run.score = this.levelStart.score;
    this.run.lives = Math.max(this.levelStart.lives, 1);
    this.startLevel(this.currentLevel);
  }

  quitToMenu() {
    if (this.mode === 'play' && (this.run.mode === 'campaign' || this.run.mode === 'endless') && !this.currentLevel.bonus) {
      profile.saved = { mode: this.run.mode, levelIndex: this.run.levelIndex, score: this.levelStart.score, lives: this.levelStart.lives };
      saveProfile();
    }
    this.audio.stopMusic();
    this.startDemo();
    this.ui.show('menu');
  }

  onBack(prev) {
    if (prev === 'menu' && this.needsRebuild && this.mode === 'menu') this.startDemo();
    if (prev === 'pause') this.ui.setHud(false);
  }

  markRebuild() { this.needsRebuild = true; }

  unlockChaos() {
    if (profile.chaosUnlocked) return;
    profile.chaosUnlocked = true;
    saveProfile();
    this.audio.unlock();
    this.audio.star();
    this.ui.toast('РЕЖИМ ХАОСА ОТКРЫТ', 'secret');
    if (this.mode === 'menu') this.ui.buildMenu();
  }

  // ——— Цикл ———
  loop() {
    let last = performance.now();
    let pausedRender = 0;
    let fpsAcc = 0, fpsN = 0, fpsT = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      const cap = settings.fpsCap;
      if (cap && now - last < 1000 / cap - 1.5) return;
      const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
      last = now;
      if (document.hidden) return;
      if (this.paused) {
        if (now - pausedRender < 250) return;
        pausedRender = now;
      } else {
        this.input.update(dt);
        this.game.update(dt);
        if (this.mode === 'menu') {
          this.demoTime += dt;
          if (this.demoTime > 75) this.startDemo();
        }
      }
      this.renderer.render();
      if (!this.paused) this.renderer.adapt(now, dt);
      fpsAcc += dt; fpsN++;
      if (now - fpsT > 500) { this.ui.fps(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; fpsT = now; }
    };
    requestAnimationFrame(frame);
  }
}

async function boot() {
  try {
    // ждём шрифты (не дольше 1.2 c), чтобы подписи бонусов рисовались правильным шрифтом
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]);
    const app = new App();
    window.__kinetic = app;
    progress(0.8, 'ЛОКАЦИЯ');
    app.startDemo();
    app.ui.show('menu');
    app.loop();
    progress(1, 'ГОТОВО');
    setTimeout(() => document.getElementById('boot').classList.add('done'), 250);
    setTimeout(() => document.getElementById('boot').remove(), 900);
  } catch (err) {
    console.error(err);
    bootText.textContent = 'ОШИБКА: ' + (err.message || err);
    bootText.style.color = '#ff4d5e';
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // новая версия игры: как только свежий service worker взял управление — перезагружаемся один раз
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
  }
}

boot();
export { LOCATIONS };
