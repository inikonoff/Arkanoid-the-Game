// Режим «Клаустрофобия»: стена блоков непрерывно надвигается на ракетку.
// Узкое поле, адаптивная скорость наезда, босс по дистанции; после победы — взрыв всего экрана
// с бонусами, поле расширяется, локация меняется. Стали нет, самые крепкие блоки — 3 удара.
import * as THREE from 'three';
import { glow } from './mat.js';
import { LOCATIONS } from './locations.js';
import { profile, saveProfile } from './settings.js';
import { Boss } from './boss.js';

export const CL_START_COLS = 7;
const CL_MAX_COLS = 19;
const CELL_D = 0.75;
const FIRST_BOSS = 75;   // метров до первого босса
const BOSS_STEP = 170;   // и далее

export class Claustro {
  constructor(game) {
    this.g = game;
    this.dist = 0;
    this.cols = CL_START_COLS;
    this.locIdx = game.level.location || 0;
    this.bossN = 0;
    this.nextBoss = FIRST_BOSS;
    this.rowAcc = 0;
    this.rowN = 0;
    this.prev = [];
    this.breath = 0;
    this.burst = [];
    this.widenT = 0;
    this.speed = 0;
    this.deadZ = game.field.paddleZ - 2.2;
    this.buildDeadline();
    // стартовое заполнение: несколько рядов уже на поле
    for (let i = 0; i < 7; i++) {
      this.spawnRow(this.g.field.zTop + CELL_D * (0.5 + 6 - i));
    }
  }

  buildDeadline() {
    const g = this.g, f = g.field;
    if (this.line) { g.scene.remove(this.line); this.line.geometry.dispose(); this.line.material.dispose(); }
    this.line = new THREE.Mesh(new THREE.BoxGeometry(f.W, 0.05, 0.14), glow('#ff3b2f', 1.6, { transparent: true, opacity: 0.85 }));
    this.line.position.set(0, 0.03, this.deadZ);
    g.scene.add(this.line);
  }

  // Новый ряд блоков у верхнего края
  spawnRow(z) {
    const g = this.g, f = g.field;
    const zz = z ?? f.zTop + CELL_D * 0.5 + this.rowAcc;
    this.rowN++;
    const d = this.dist;
    // передышки: после босса и изредка — пустые ряды
    if (this.breath > 0) { this.breath--; if (Math.random() < 0.75) { this.prev = []; return; } }
    else if (Math.random() < 0.07) { this.prev = []; return; }
    let density = Math.min(0.8, 0.38 + d * 0.0008);
    if (g.boss) density *= 0.4;
    const row = [];
    for (let c = 0; c < this.cols; c++) {
      const x = f.ox + (c + 0.5) * 1.5;
      const keep = this.prev[c] ? Math.random() < 0.6 : Math.random() < density * 0.7;
      row[c] = keep;
      if (!keep) continue;
      // не спавним поверх шара
      if (g.balls.some((b) => Math.abs(b.x - x) < 1 && Math.abs(b.z - zz) < 0.7)) continue;
      g.spawnBrickAt(this.pickType(d), x, zz, this.rowN);
    }
    this.prev = row;
  }

  pickType(d) {
    const r = Math.random();
    let acc = 0;
    const T = [
      ['X', 0.05], ['G', 0.06], ['?', 0.035], ['$', 0.025],
      ['T', d > 50 ? 0.03 : 0], ['A', d > 120 ? 0.04 : 0],
      ['3', Math.min(0.22, 0.03 + d * 0.0005)], ['2', Math.min(0.32, 0.12 + d * 0.0006)],
    ];
    for (const [ch, p] of T) { acc += p; if (r < acc) return ch; }
    return '1';
  }

  update(dt) {
    const g = this.g, f = g.field;
    this.processBurst(dt);
    if (this.widenT > 0) { this.widenT -= dt; if (this.widenT <= 0) this.widen(); }
    if (g.state !== 'play' && g.state !== 'ready') return;
    // самый близкий к ракетке блок
    let front = -Infinity;
    for (const b of g.brickList) if (b.alive) front = Math.max(front, b.z + Math.min(b.rad || 0.4, 1.2));
    const gap = front === -Infinity ? 99 : this.deadZ - front;
    // адаптивная скорость: далеко — быстрее, близко к линии — медленнее; база растёт с дистанцией
    const base = Math.min(1.3, 0.36 + this.dist * 0.0012);
    // у самой линии стена почти замирает — даёт шанс отбиться, но не останавливается совсем
    let k = gap > 10 ? 2.6 : gap > 7 ? 1.6 : gap < 1.5 ? 0.12 : gap < 3 ? 0.3 : gap < 5 ? 0.6 : 1;
    if (g.boss) k *= 0.7;
    if (g.state === 'ready') k *= 0.25;
    if (this.burst.length || this.widenT > 0 || g.effects.stop > 0) k = 0;
    this.speed = base * k;
    const dz = this.speed * dt;
    if (dz > 0) {
      this.dist += dz;
      const W = g.world;
      for (const b of g.brickList) {
        if (!b.alive) continue;
        b.z += dz; b.homeZ += dz;
        if (W.tipping.has(b)) b.pivZ += dz;
        W.rehash(b);
        W.moved.add(b);
      }
      this.rowAcc += dz;
      while (this.rowAcc >= CELL_D) { this.rowAcc -= CELL_D; this.spawnRow(); }
    }
    // прорыв за красную линию
    if (front > this.deadZ && !g.won) this.breach();
    // линия пульсирует, когда стена близко
    const danger = Math.max(0, Math.min(1, (5 - gap) / 5));
    this.line.material.color.setRGB(1.6 + danger * 2 * (0.5 + 0.5 * Math.sin(g.time * 12)), 0.36, 0.28);
    // босс по дистанции
    if (!g.boss && !this.burst.length && this.widenT <= 0 && this.dist >= this.nextBoss) this.spawnBoss();
  }

  breach() {
    const g = this.g;
    g.fx.shake(0.8);
    g.audio.explosion(1.5);
    g.ui.flash(0.35);
    // ударная волна сносит ближние ряды без очков
    for (const b of g.brickList) {
      if (!b.alive || b.z < this.deadZ - 5) continue;
      g.fx.shatter(b.x, b.z, b.color, 'std');
      b.alive = false; g.world.remove(b); g.writeBrick(b); g.remaining--;
      g.freeBrick(b);
    }
    g.fx.ring(0, this.deadZ, g.field.W * 0.7, '#ff3b2f', 0.5);
    if (profile.cheats?.immortal) { g.ui.toast('ПРОРЫВ ОТРАЖЁН', 'good'); return; }
    g.run.lives--;
    g.lostBall = true;
    if (g.run.lives <= 0) {
      g.state = 'over';
      g.later(() => g.app.onGameOver(g.result()), 900);
    } else g.ui.toast(`ПРОРЫВ! ОСТАЛОСЬ ${g.run.lives}`, 'bad');
  }

  spawnBoss() {
    const g = this.g;
    const type = LOCATIONS[this.locIdx].boss;
    g.boss = new Boss(g, type, this.bossN + 1);
    // здесь у игрока автопушка и снабжение — боссу нужен запас здоровья
    g.boss.maxHp = g.boss.hp = Math.round(g.boss.maxHp * 2.2);
    g.supplyT = 6;
    g.bossMarks = [0.8, 0.6, 0.4, 0.2];
    g.audio.bossRoar();
    g.audio.intensity = 0.9;
    g.fx.shake(0.5);
    g.ui.toast(`⚠ ${g.boss.name}`, 'boss');
  }

  // Босс повержен: всё на экране взрывается, сыплются бонусы, поле расширяется
  onBossDead(boss) {
    const g = this.g;
    g.addScore(10000, boss.x, boss.z);
    g.giveLife('+1 ЖИЗНЬ ЗА БОССА');
    profile.bossesDefeated++;
    saveProfile();
    g.boss = null;
    g.audio.intensity = 0.5;
    this.bossN++;
    this.nextBoss = this.dist + BOSS_STEP + this.bossN * 25;
    const alive = g.brickList.filter((b) => b.alive);
    alive.sort((a, b) => Math.hypot(a.x - boss.x, a.z - boss.z) - Math.hypot(b.x - boss.x, b.z - boss.z));
    let t = 0.25;
    this.burst = alive.map((b) => ({ b, t: (t += 0.035) }));
    this.burstT = 0;
    this.widenT = t + 0.9;
    g.slowmo = 1.2;
  }

  processBurst(dt) {
    if (!this.burst.length) return;
    const g = this.g;
    this.burstT += dt;
    let n = 0;
    while (this.burst.length && this.burst[0].t <= this.burstT) {
      const { b } = this.burst.shift();
      if (!b.alive) continue;
      g.destroyBrick(b, {});
      if (Math.random() < 0.3 && g.powerups.length < 8) g.spawnPowerup(b.x, b.z, Math.random() < 0.3 ? 'cell' : undefined);
      if (++n % 3 === 0) g.fx.explode(b.x, b.z, 0.45, b.color);
    }
  }

  widen() {
    const g = this.g;
    const wider = this.cols < CL_MAX_COLS;
    this.cols = Math.min(CL_MAX_COLS, this.cols + 2);
    this.locIdx = (this.locIdx + 1) % LOCATIONS.length;
    g.rebuildStage(this.cols, this.locIdx);
    this.buildDeadline();
    this.prev = [];
    this.breath = 6;
    const loc = LOCATIONS[this.locIdx];
    g.ui.toast(wider ? `ПОЛЕ ШИРЕ · ${loc.tag}` : loc.tag, 'good');
  }

  dispose() {
    if (this.line) { this.g.scene?.remove(this.line); this.line.geometry.dispose(); this.line.material.dispose(); }
  }
}
