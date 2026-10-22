// Интерфейс: меню, экраны, HUD, настройки, генератор, всплывашки.
import { settings, setSetting, applyPreset, resetSettings, profile, saveProfile, REBUILD_KEYS, RESTART_KEYS } from './settings.js';
import { LOCATIONS, WEATHER_INFO } from './locations.js';
import { CAMPAIGN } from './levels.js';
import { GEN_MODES, GEN_SIZES, SYMMETRY, generateLevel, encodeOpts, decodeOpts } from './generator.js';
import { POWERUPS, BOOSTERS, BOOST_MAX } from './game.js';
import { cheats, enterCode, TOGGLE_LABELS } from './cheats.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const SET_SCHEMA = [
  {
    id: 'gfx', label: 'ГРАФИКА', items: [
      { key: 'preset', type: 'seg', label: 'Пресет качества', wide: true, options: [['auto', 'АВТО'], ['ultra', 'УЛЬТРА'], ['high', 'ВЫСОКО'], ['medium', 'СРЕДНЕ'], ['low', 'НИЗКО'], ['potato', 'КАРТОШКА']], hint: '«Картошка» — для самых слабых телефонов: низкое разрешение, без теней, пост-эффектов и реверба.' },
      { key: 'renderScale', type: 'range', perf: 'more', label: 'Разрешение рендера', min: 0.4, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%', hint: 'Главный рычаг FPS. 70% почти незаметно на телефоне.' },
      { key: 'pixelRatioCap', type: 'seg', perf: ['Больше — чётче', 'меньше — быстрее'], label: 'Предел плотности пикселей', options: [[1, '1×'], [1.5, '1.5×'], [2, '2×'], [3, '3×']], hint: 'Ограничивает Retina/AMOLED-экраны, которые рисуют в 3× больше пикселей.' },
      { key: 'fpsCap', type: 'seg', fps: 1, perf: ['Выше — плавнее', 'ниже — меньше нагрев и расход батареи'], label: 'Ограничение FPS', options: [[30, '30'], [45, '45'], [60, '60'], [90, '90'], [120, '120'], [0, '∞']], hint: 'Выше частоты экрана FPS не поднимется — такие варианты скрыты.' },
      { key: 'adaptive', type: 'toggle', perf: ['Вкл — стабильнее FPS', 'выкл — постоянная чёткость'], label: 'Адаптивное разрешение', hint: 'Автоматически снижает разрешение при просадках FPS.' },
      { key: 'adaptiveTarget', type: 'seg', perf: ['Выше — плавнее', 'ниже — чётче'], label: 'Целевой FPS адаптации', options: [[30, '30'], [45, '45'], [55, '55'], [60, '60']] },
      { key: 'shadows', type: 'seg', perf: 'more', label: 'Тени', req: 1, options: [[0, 'ВЫКЛ'], [1, '512'], [2, '1024'], [3, '2048']], hint: 'Размер карты теней. Тяжело для мобильных GPU.' },
      { key: 'materials', type: 'seg', perf: ['PBR — красивее', 'Простые — быстрее'], label: 'Материалы', req: 1, options: [['pbr', 'PBR + ОТРАЖЕНИЯ'], ['simple', 'ПРОСТЫЕ']], hint: 'Простые — Ламберт без карт окружения, в 2–3 раза дешевле.' },
      { key: 'bloom', type: 'toggle', perf: 'on', label: 'Свечение (bloom)', hint: 'Пост-эффект свечения неона, огня и лазеров.' },
      { key: 'bloomStrength', type: 'range', perf: ['Только вид', 'на скорость не влияет'], label: 'Сила свечения', min: 0, max: 1.5, step: 0.05, f: (v) => v.toFixed(2) },
      { key: 'bloomRes', type: 'range', perf: ['Больше — чётче свечение', 'меньше — быстрее'], label: 'Разрешение свечения', min: 0.2, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%', hint: 'Меньше — дешевле и мягче.' },
      { key: 'aa', type: 'seg', perf: ['Сильнее — глаже края', 'слабее — быстрее'], label: 'Сглаживание', options: [['off', 'ВЫКЛ'], ['fxaa', 'FXAA'], ['msaa', 'MSAA 4×'], ['max', 'MSAA + FXAA']], hint: 'FXAA — почти бесплатный фильтр для слабых телефонов. MSAA — честное сглаживание геометрии, дороже. Применяется сразу.' },
      { key: 'debris', type: 'range', perf: 'more', label: 'Количество обломков', req: 1, min: 0, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%', hint: 'Физические осколки кирпичей и боссов.' },
      { key: 'particles', type: 'range', perf: 'more', label: 'Частицы (искры, дым, огонь)', req: 1, min: 0, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%' },
      { key: 'weatherFx', type: 'range', perf: 'more', label: 'Плотность погоды', req: 1, min: 0, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%', hint: 'Только визуал — физика погоды работает всегда.' },
      { key: 'envDetail', type: 'seg', perf: 'more', label: 'Детали окружения', req: 1, options: [[0, 'ВЫКЛ'], [1, 'МАЛО'], [2, 'МНОГО']], hint: 'Деревья, здания, астероиды вокруг поля.' },
      { key: 'dynLights', type: 'toggle', perf: 'on', label: 'Динамический свет взрывов', req: 1 },
      { key: 'trail', type: 'range', perf: ['Почти бесплатно', 'можно оставить'], label: 'Шлейф шара', min: 0, max: 1, step: 0.1, f: (v) => (v ? Math.round(v * 100) + '%' : 'ВЫКЛ') },
      { key: 'physicsRate', type: 'seg', perf: ['Выше — точнее отскоки', 'ниже — меньше нагрузка на процессор'], label: 'Частота физики', options: [[60, '60 Гц'], [120, '120 Гц'], [240, '240 Гц']], hint: 'Выше — точнее столкновения, но дороже для CPU.' },
      { key: 'showFps', type: 'toggle', label: 'Показывать FPS' },
    ],
  },
  {
    id: 'audio', label: 'ЗВУК', items: [
      { key: 'masterVol', type: 'range', label: 'Общая громкость', min: 0, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%' },
      { key: 'sfxVol', type: 'range', label: 'Эффекты', min: 0, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%' },
      { key: 'musicVol', type: 'range', label: 'Музыка', min: 0, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%' },
    ],
  },
  {
    id: 'ctl', label: 'УПРАВЛЕНИЕ', items: [
      { key: 'touchMode', type: 'seg', label: 'Сенсорное управление', options: [['relative', 'ОТНОСИТЕЛЬНОЕ'], ['absolute', 'ПОД ПАЛЬЦЕМ']], hint: 'Относительное: тяни в любом месте экрана — палец не закрывает ракетку.' },
      { key: 'sensitivity', type: 'range', label: 'Чувствительность', min: 0.5, max: 2.5, step: 0.05, f: (v) => v.toFixed(2) + '×' },
      { key: 'haptics', type: 'toggle', label: 'Вибрация' },
    ],
  },
  {
    id: 'comfort', label: 'КОМФОРТ', items: [
      { key: 'shake', type: 'range', label: 'Тряска камеры', min: 0, max: 1, step: 0.05, f: (v) => Math.round(v * 100) + '%' },
      { key: 'flashes', type: 'toggle', label: 'Яркие вспышки молний', hint: 'Отключите при светочувствительности.' },
    ],
  },
];

export class UI {
  constructor(app) {
    this.app = app;
    this.stack = ['menu'];
    this.hudCache = {};
    this.popPool = [];
    this.genOpts = { seed: Math.floor(Math.random() * 1e8).toString(36), mode: 'pattern', size: 'm', density: 0.7, difficulty: 0.5, symmetry: 'mirror', location: -1, boss: false };
    this.setTab = 'gfx';
    this.logoTaps = 0;
    this.bind();
    this.buildHelp();
  }

  // ——— навигация ———
  show(id, push = true) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    if (push && this.stack[this.stack.length - 1] !== id) this.stack.push(id);
    if (id === 'menu') { this.stack = ['menu']; this.buildMenu(); }
    if (id === 'levels') this.buildLevels();
    if (id === 'generator') this.buildGenerator();
    if (id === 'settings') this.buildSettings();
    if (id === 'backdoor') this.buildBackdoor();
    if (id === 'pause') $('#pause [data-act="skip"]').classList.toggle('hidden', !cheats.tourist);
    this.app.audio.ui();
  }

  hideAll() { document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active')); }

  back() {
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1] || 'menu';
    if (prev === 'pause' || prev === 'menu') this.show(prev, false);
    else this.show(prev, false);
    this.app.onBack?.(prev);
  }

  current() { return this.stack[this.stack.length - 1]; }

  bind() {
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => this.back()));
    $('#btn-pause').addEventListener('click', (e) => { e.stopPropagation(); this.app.pause(); });
    $('#btn-pause').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('#pause').addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'resume') this.app.resume();
      if (a === 'restart') this.app.restart();
      if (a === 'settings') this.show('settings');
      if (a === 'backdoor') this.show('backdoor');
      if (a === 'skip') this.app.skipLevel();
      if (a === 'quit') this.app.quitToMenu();
    });
    $('#result').addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'next') this.app.nextLevel();
      if (a === 'menu') this.app.quitToMenu();
    });
    $('#gameover').addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'retry') this.app.retry();
      if (a === 'menu') this.app.quitToMenu();
    });
    $('#logo').addEventListener('click', () => {
      if (++this.logoTaps >= 7 && !profile.chaosUnlocked) this.app.unlockChaos();
    });
    $('#set-reset').addEventListener('click', () => { resetSettings(); this.buildSettings(); });
    window.addEventListener('online', () => { $('#net-state').textContent = 'ONLINE'; });
    window.addEventListener('offline', () => { $('#net-state').textContent = 'OFFLINE'; });
    if (!navigator.onLine) $('#net-state').textContent = 'OFFLINE';
  }

  // ——— Меню ———
  buildMenu() {
    const list = $('#menu-list');
    list.innerHTML = '';
    const saved = profile.saved;
    const items = [];
    if (saved) {
      const lv = saved.mode === 'endless' ? null : CAMPAIGN[saved.levelIndex];
      const loc = LOCATIONS[(lv ? lv.location : Math.floor(saved.levelIndex / 3)) % LOCATIONS.length];
      items.push({ lbl: 'Продолжить', meta: `LV ${String(saved.levelIndex + 1).padStart(2, '0')} · ${loc.tag}`, act: () => this.app.continueGame(), primary: true });
    }
    items.push({ lbl: 'Новая игра', meta: '24 УРОВНЯ', act: () => this.app.newGame(), primary: !saved });
    items.push({ lbl: 'Локации', meta: `${Math.min(CAMPAIGN.length, profile.maxLevel + 1)}/${CAMPAIGN.length}`, act: () => this.show('levels') });
    items.push({ lbl: 'Генератор', meta: '∞ УРОВНЕЙ', act: () => this.show('generator') });
    items.push({ lbl: 'Бесконечный', meta: 'ВЫЖИВАНИЕ', act: () => this.app.playEndless() });
    items.push({ lbl: 'Клаустрофобия', meta: profile.bestDist ? `РЕКОРД ${profile.bestDist} М` : 'НАТИСК', act: () => this.app.playClaustro() });
    if (profile.chaosUnlocked) items.push({ lbl: 'Режим хаоса', meta: `<b>${profile.chaosMode ? 'ВКЛ' : 'ВЫКЛ'}</b>`, toggle: true, act: () => { profile.chaosMode = !profile.chaosMode; saveProfile(); this.buildMenu(); } });
    const nOn = Object.keys(TOGGLE_LABELS).filter((k) => cheats[k]).length;
    items.push({ lbl: 'Чёрный ход', meta: nOn ? `<b>${nOn} АКТИВНО</b>` : 'ДЛЯ СЛАБАКОВ', toggle: nOn > 0, act: () => this.show('backdoor') });
    items.push({ lbl: 'Настройки', meta: ({ auto: 'АВТО', ultra: 'УЛЬТРА', high: 'ВЫСОКО', medium: 'СРЕДНЕ', low: 'НИЗКО', potato: 'КАРТОШКА', custom: 'СВОЁ' })[settings.preset] || 'СВОЁ', act: () => this.show('settings') });
    items.push({ lbl: 'Как играть', meta: 'МАНУАЛ', act: () => this.show('help') });
    items.forEach((it, i) => {
      const b = el('button', 'menu-item' + (it.primary ? ' primary' : '') + (it.toggle ? ' opt' : ''),
        `<span class="idx">${String(i + 1).padStart(2, '0')}</span><span class="lbl">${it.lbl}</span><span class="meta">${it.meta}</span>`);
      b.addEventListener('click', () => { this.app.audio.unlock(); it.act(); });
      list.appendChild(b);
    });
    const stars = profile.stars.length, totalStars = CAMPAIGN.filter((l) => l.grid.some((r) => r.includes('S'))).length;
    $('#menu-stats').innerHTML = `<span>РЕКОРД</span><b>${fmt(profile.bestScore)}</b>${(profile.bestCheat || 0) > profile.bestScore ? `<span>РЕКОРД*</span><b>${fmt(profile.bestCheat)}</b>` : ''}<span>КРИСТАЛЛЫ</span><b>${stars}/${totalStars}</b><span>БОССЫ</span><b>${profile.bossesDefeated}</b>`;
  }

  // ——— Локации ———
  buildLevels() {
    const g = $('#loc-grid');
    g.innerHTML = '';
    $('#levels-meta').textContent = `ОТКРЫТО ${Math.min(CAMPAIGN.length, profile.maxLevel + 1)}/${CAMPAIGN.length}`;
    LOCATIONS.forEach((loc, li) => {
      const first = li * 3;
      const locked = first > profile.maxLevel;
      const card = el('div', 'loc-card' + (locked ? ' locked' : ''));
      card.style.setProperty('--c', loc.accent);
      card.innerHTML = `
        <div class="lc-top"><span>${String(li + 1).padStart(2, '0')} / ${loc.code}</span><span>${WEATHER_INFO[loc.weather].label}</span></div>
        <div class="lc-name">${loc.tag}</div>
        <div class="lc-sub">${loc.name} — ${loc.desc}</div>
        <div class="swatch">${loc.bricks.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`;
      const row = el('div', 'lv-row');
      for (let k = 0; k < 3; k++) {
        const idx = first + k, lv = CAMPAIGN[idx];
        const b = el('button', 'lv-btn' + (lv.boss ? ' boss' : ''), `${String(idx + 1).padStart(2, '0')}<small>${lv.boss ? 'БОСС' : 'УРОВЕНЬ'}</small>${profile.stars.includes(lv.id) ? '<span class="star">◆</span>' : ''}`);
        b.disabled = idx > profile.maxLevel;
        b.title = lv.name;
        b.addEventListener('click', () => { this.app.audio.unlock(); this.app.playCampaign(idx); });
        row.appendChild(b);
      }
      card.appendChild(row);
      g.appendChild(card);
    });
  }

  // ——— Генератор ———
  buildGenerator() {
    const f = $('#gen-form');
    f.innerHTML = '';
    const o = this.genOpts;
    const group = (label, valueHtml, body) => {
      const w = el('div');
      w.appendChild(el('div', 'field-l', `<span>${label}</span><b>${valueHtml || ''}</b>`));
      w.appendChild(body);
      f.appendChild(w);
      return w;
    };
    const chips = (opts, cur, on) => {
      const c = el('div', 'chips');
      opts.forEach(([v, l]) => {
        const b = el('button', 'chipbtn' + (v === cur ? ' on' : ''), l);
        b.addEventListener('click', () => { on(v); this.app.audio.click(); this.buildGenerator(); });
        c.appendChild(b);
      });
      return c;
    };
    const modeW = group('РЕЖИМ', '', chips(GEN_MODES.map((m) => [m.id, m.name.toUpperCase()]), o.mode, (v) => { o.mode = v; }));
    modeW.appendChild(el('div', 'mode-desc', GEN_MODES.find((m) => m.id === o.mode).desc));
    group('РАЗМЕР', '', chips(GEN_SIZES.map((s) => [s.id, `${s.name} <span class="dim">${s.cols}×${s.rows}</span>`]), o.size, (v) => { o.size = v; }));
    const slider = (label, key) => {
      const r = el('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.05; r.value = o[key];
      r.style.setProperty('--p', o[key] * 100 + '%');
      const w = group(label, Math.round(o[key] * 100) + '%', r);
      r.addEventListener('input', () => {
        o[key] = +r.value;
        r.style.setProperty('--p', o[key] * 100 + '%');
        w.querySelector('b').textContent = Math.round(o[key] * 100) + '%';
        this.drawPreview();
      });
    };
    slider('ПЛОТНОСТЬ', 'density');
    slider('СЛОЖНОСТЬ', 'difficulty');
    group('СИММЕТРИЯ', '', chips(SYMMETRY.map((s) => [s, { none: 'НЕТ', mirror: 'ЗЕРКАЛО', quad: 'КВАДРО', radial: 'РАДИАЛ' }[s]]), o.symmetry, (v) => { o.symmetry = v; }));
    group('ЛОКАЦИЯ', '', chips([[-1, 'СЛУЧАЙНО'], ...LOCATIONS.map((l, i) => [i, l.tag])], o.location, (v) => { o.location = v; }));
    group('БОСС', '', chips([[false, 'БЕЗ БОССА'], [true, 'С БОССОМ']], o.boss, (v) => { o.boss = v; }));
    const seedRow = el('div', 'seed-row');
    const inp = el('input'); inp.className = 'mono'; inp.value = o.seed; inp.maxLength = 16; inp.spellcheck = false;
    inp.addEventListener('input', () => { o.seed = inp.value.toLowerCase().replace(/[^a-z0-9]/g, '') || 'kinetic'; this.drawPreview(); });
    const dice = el('button', 'dice', '⚄');
    dice.addEventListener('click', () => { o.seed = Math.floor(Math.random() * 1e8).toString(36); inp.value = o.seed; this.app.audio.click(); this.drawPreview(); });
    seedRow.append(inp, dice);
    group('СИД', '', seedRow);
    $('#gen-play').onclick = () => { this.app.audio.unlock(); this.app.playCustom(generateLevel(o)); };
    $('#gen-copy').onclick = async () => {
      const code = $('#gen-code').value;
      try { await navigator.clipboard.writeText(code); this.toast('КОД СКОПИРОВАН', 'good'); } catch (e) { $('#gen-code').select(); }
    };
    $('#gen-load').onclick = () => {
      const d = decodeOpts($('#gen-code').value);
      if (!d) { this.toast('НЕВЕРНЫЙ КОД', 'bad'); return; }
      Object.assign(o, d);
      this.buildGenerator();
    };
    $('#gen-code').onkeydown = (e) => { if (e.key === 'Enter') $('#gen-load').click(); };
    this.drawPreview();
  }

  drawPreview() {
    const lv = generateLevel(this.genOpts);
    this.previewLevel = lv;
    const cv = $('#gen-canvas'), g = cv.getContext('2d');
    const loc = LOCATIONS[lv.location];
    const W = cv.width, H = cv.height;
    g.fillStyle = '#070707'; g.fillRect(0, 0, W, H);
    // фон-сетка
    g.strokeStyle = 'rgba(236,232,223,0.06)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y < H; y += 20) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
    const rows = lv.grid.length, cols = Math.max(...lv.grid.map((r) => r.length));
    const totalRows = rows + Math.max(6, rows * 0.6);
    const cw = Math.min((W - 24) / cols, (H - 30) / totalRows * 2);
    const ch = cw / 2;
    const ox = (W - cols * cw) / 2, oy = 12;
    const special = { A: '#8d99ae', '#': '#3a3d45', $: '#e2b44c', X: '#ff3d1f', G: 'rgba(191,233,255,0.6)', '?': '#ffffff', S: 'rgba(224,195,255,0.35)', I: 'rgba(255,255,255,0.18)', R: '#7cff9b', P: '#c77dff', T: '#d9c9a3' };
    let count = 0;
    lv.grid.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const k = row[c];
        if (k === '.') continue;
        count++;
        g.fillStyle = special[k] || loc.bricks[r % loc.bricks.length];
        if (/[123]/.test(k)) g.globalAlpha = 0.55 + 0.15 * +k;
        g.fillRect(ox + c * cw + 0.5, oy + r * ch + 0.5, Math.max(1, cw - 1.5), Math.max(1, ch - 1.5));
        g.globalAlpha = 1;
      }
    });
    if (lv.boss) {
      g.strokeStyle = '#ff4d5e'; g.lineWidth = 2;
      g.beginPath(); g.arc(W / 2, oy + ch * 2.5, Math.max(8, cw * 1.6), 0, Math.PI * 2); g.stroke();
    }
    // ракетка
    g.fillStyle = loc.accent;
    const py = Math.min(H - 14, oy + totalRows * ch);
    g.fillRect(W / 2 - cw * 1.2, py, cw * 2.4, Math.max(3, ch * 0.6));
    $('#gen-meta').innerHTML = `<span>${lv.name.toUpperCase()}</span><span>${cols}×${rows} · ${count} БЛОКОВ · ${loc.tag}</span>`;
    $('#gen-code').value = encodeOpts(this.genOpts);
  }

  // ——— Настройки ———
  buildSettings() {
    const tabs = $('#set-tabs'), body = $('#set-body');
    tabs.innerHTML = '';
    SET_SCHEMA.forEach((t) => {
      const b = el('button', 'tab' + (t.id === this.setTab ? ' on' : ''), t.label);
      b.addEventListener('click', () => { this.setTab = t.id; this.buildSettings(); });
      tabs.appendChild(b);
    });
    body.innerHTML = '';
    const tab = SET_SCHEMA.find((t) => t.id === this.setTab);
    for (const it of tab.items) body.appendChild(this.settingRow(it));
  }

  settingRow(it) {
    const row = el('div', 'set-row' + (it.type === 'toggle' ? ' inline' : '') + (it.wide ? ' wide' : ''));
    const mark = it.req ? ' <span class="req">*</span>' : it.restart ? ' <span class="req">↻</span>' : '';
    const val = it.type === 'range' ? `<span class="v">${it.f(settings[it.key])}</span>` : '';
    const PERF = { more: ['Больше — красивее', 'меньше — быстрее'], on: ['Вкл — красивее', 'выкл — быстрее'] };
    const pf = typeof it.perf === 'string' ? PERF[it.perf] : it.perf;
    const perf = pf ? `<div class="sr-perf"><b>▲</b> ${pf[0]} <i>/</i> <b>▼</b> ${pf[1]}</div>` : '';
    const left = el('div', '', `<div class="sr-l">${it.label}${mark}${val}</div>${perf}${it.hint ? `<div class="sr-h">${it.hint}</div>` : ''}`);
    row.appendChild(left);
    const commit = (v) => {
      if (it.key === 'preset') applyPreset(v); else setSetting(it.key, v);
      this.app.audio.click();
      if (RESTART_KEYS.has(it.key)) this.toast('ПРИМЕНИТСЯ ПОСЛЕ ПЕРЕЗАПУСКА', 'good');
      else if (REBUILD_KEYS.has(it.key) || it.key === 'preset') this.app.markRebuild();
    };
    if (it.type === 'range') {
      const r = el('input'); r.type = 'range'; r.min = it.min; r.max = it.max; r.step = it.step; r.value = settings[it.key];
      const pct = () => ((settings[it.key] - it.min) / (it.max - it.min)) * 100 + '%';
      r.style.setProperty('--p', pct());
      r.addEventListener('input', () => {
        setSetting(it.key, +r.value);
        r.style.setProperty('--p', pct());
        row.querySelector('.v').textContent = it.f(+r.value);
      });
      r.addEventListener('change', () => { if (REBUILD_KEYS.has(it.key)) this.app.markRebuild(); });
      row.appendChild(r);
    } else if (it.type === 'toggle') {
      const t = el('button', 'toggle' + (settings[it.key] ? ' on' : ''));
      t.setAttribute('aria-label', it.label);
      t.addEventListener('click', () => { commit(!settings[it.key]); t.classList.toggle('on', settings[it.key]); });
      row.appendChild(t);
    } else if (it.type === 'seg') {
      const s = el('div', 'seg-ctl');
      let opts = it.options;
      if (it.fps) {
        // варианты выше частоты экрана бессмысленны — браузер всё равно не даст больше
        const hz = this.app.renderer.refreshHz || 60;
        opts = opts.filter(([v]) => v === 0 || v <= hz + 5);
      }
      opts.forEach(([v, l]) => {
        const b = el('button', String(settings[it.key]) === String(v) ? 'on' : '', l);
        b.addEventListener('click', () => { commit(v); this.buildSettings(); });
        s.appendChild(b);
      });
      row.appendChild(s);
    }
    return row;
  }

  // ——— Чёрный ход ———
  buildBackdoor() {
    const log = $('#bd-log');
    if (!log.childElementCount) this.termLine('KINETIC SECURE SHELL v1.4 · ВВЕДИТЕ КОД ДОСТУПА', 'dim');
    const form = $('#bd-form'), inp = $('#bd-input');
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (!v) return;
      this.termLine('> ' + v.toUpperCase(), 'cmd');
      const res = enterCode(this.app, v);
      inp.value = '';
      if (!res) { this.termLine('ОТМЕНЕНО', 'dim'); return; }
      if (res.ok) {
        this.termLine('ДОСТУП РАЗРЕШЁН', 'ok');
        this.termLine(res.text, 'ok');
        this.app.audio.star();
        this.app.audio.unlock();
      } else {
        this.termLine(res.text, 'bad');
        this.app.audio.lose();
        const t = $('.term'); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
      }
      this.renderCheatToggles();
    };
    this.renderCheatToggles();
    setTimeout(() => { if (matchMedia('(hover: hover)').matches) inp.focus(); }, 50);
  }

  termLine(text, cls = '') {
    const log = $('#bd-log');
    const d = el('div', 'tl ' + cls);
    d.textContent = text;
    log.appendChild(d);
    while (log.childElementCount > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  // Активные режимы — можно выключить касанием
  renderCheatToggles() {
    const box = $('#bd-active');
    const on = Object.keys(TOGGLE_LABELS).filter((k) => cheats[k]);
    const pend = [cheats.pendingArsenal && 'АРСЕНАЛ ждёт новой игры', cheats.pendingCat && 'КОШКА ждёт новой игры'].filter(Boolean);
    box.innerHTML = on.length || pend.length ? '<div class="mono dim ta-h">АКТИВНЫЕ РЕЖИМЫ · КОСНИСЬ, ЧТОБЫ ВЫКЛЮЧИТЬ</div>' : '';
    for (const k of on) {
      const b = el('button', 'chipbtn on', TOGGLE_LABELS[k] + ' ✕');
      b.addEventListener('click', () => { cheats[k] = false; saveProfile(); this.termLine(`${TOGGLE_LABELS[k]}: ВЫКЛ`, 'dim'); this.renderCheatToggles(); });
      box.appendChild(b);
    }
    for (const t of pend) box.appendChild(el('span', 'chipbtn', t));
  }

  // ——— Справка ———
  buildHelp() {
    const b = $('#help-body');
    const pu = Object.entries(POWERUPS).map(([, p]) => `<li><i class="sw" style="background:${p.color}"></i><span><span class="tag">${p.label}</span>${{
      ШИРЕ: 'Шире ракетка (до 2 уровней).', '×3': 'Каждый шар делится на три.', ЛАЗЕР: 'Автоматические лазерные пушки.', МАГНИТ: 'Шар прилипает, отпусти касанием.',
      'МЕДЛ.': 'Замедляет шары.', ОГОНЬ: 'Шар прожигает кирпичи насквозь.', ЩИТ: 'Барьер внизу на 3 отскока.', БОМБА: '3 заряда: следующий удар — мегавзрыв.',
      '+1': 'Дополнительная жизнь.', УЖЕ: 'Ловушка: ракетка уже.', 'БЫСТР.': 'Ловушка: шары быстрее.', ЗАРЯД: '+1 заряд случайного бустера.',
    }[p.label] || ''}</span></li>`).join('');
    const bricks = [
      ['#e8562a', 'Обычный — 1–3 удара, цвет темнеет с уроном.'], ['#8d99ae', 'Броня — 5 ударов.'], ['#3a3d45', 'Сталь — неразрушима, даже огнём.'],
      ['#e2b44c', 'Золото — 500 очков.'], ['#ff3d1f', 'Взрывчатка — цепные реакции.'], ['#bfe9ff', 'Стекло — рассыпается на сотни осколков.'],
      ['#ffffff', 'Радужный — гарантированный бонус.'], ['#7cff9b', 'Регенерирующий — отрастает через 9 с.'], ['#c77dff', 'Портал — телепортирует шар в парный.'], ['#d9c9a3', 'Башня — высокая колонна: сильный удар опрокидывает её, падая, она бьёт всё под собой и валит соседние башни (домино).'],
    ];
    b.innerHTML = `
      <div class="help-card"><h3>УПРАВЛЕНИЕ</h3><ul>
        <li><span class="tag">☝</span><span>Тяни пальцем в любом месте экрана — ракетка повторяет движение. Касание — запуск шара.</span></li>
        <li><span class="tag">⌨</span><span>← → / A D — движение, ПРОБЕЛ — запуск, ESC / P — пауза. Мышь — ракетка под курсором.</span></li>
        <li><span class="tag">∠</span><span>Угол отскока зависит от точки удара о ракетку и её скорости — подрезай!</span></li>
      </ul></div>
      <div class="help-card"><h3>КИРПИЧИ</h3><ul>${bricks.map(([c, t]) => `<li><i class="sw" style="background:${c}"></i><span>${t}</span></li>`).join('')}</ul></div>
      <div class="help-card"><h3>БОНУСЫ</h3><ul>${pu}</ul></div>
      <div class="help-card"><h3>БУСТЕРЫ</h3><ul>${Object.values(BOOSTERS).map((B) => `<li><i class="sw" style="background:${B.color}"></i><span><span class="tag">${B.key}</span><b>${B.label}</b> — ${B.desc}, ${B.dur} с.</span></li>`).join('')}
        <li><span class="tag">+</span><span>Кнопки справа или клавиши 1–4. В начале забега — по одному заряду, максимум ${BOOST_MAX}. Новые заряды: капсула «ЗАРЯД», каждая новая фаза босса.</span></li></ul></div>
      <div class="help-card"><h3>КЛАУСТРОФОБИЯ</h3><p>Стена блоков непрерывно надвигается на ракетку — не дай ей пересечь красную линию (прорыв стоит жизни). Поле узкое, на ракетке слабая автопушка. Каждые ~200 м — босс: он висит на месте, а блоки едут мимо. Победа взрывает весь экран бонусами, поле становится шире, локация меняется. Стали нет, самые крепкие блоки — 3 удара. Счёт — в метрах.</p></div>
      <div class="help-card"><h3>ЖИЗНИ И СНАБЖЕНИЕ</h3><p>+1 жизнь за каждого побеждённого босса и за каждые 30 000 очков (максимум 7). В бою с боссом оружие сбрасывается сверху каждые 11–16 секунд, даже когда поле пустое, а каждые 20% здоровья босса из него выпадает капсула.</p></div>
      <div class="help-card"><h3>ПОГОДА И ФИЗИКА</h3><ul>
        ${LOCATIONS.map((l) => `<li><i class="sw" style="background:${l.accent}"></i><span><b>${l.tag}</b> — ${l.desc}</span></li>`).join('')}
      </ul></div>
      <div class="help-card"><h3>БОССЫ</h3><p>Каждый третий уровень — босс со щитами, фазами и своими атаками. Попадания по ракетке оглушают её, лучи замораживают, чернила кракена закрывают обзор. В ярости босс призывает подкрепление.</p></div>
      <div class="help-card"><h3>СЕКРЕТЫ</h3><p>В некоторых уровнях спрятаны невидимые кирпичи с кристаллами — их выдают редкие искры. Поймай кристалл ракеткой, и откроются варп-врата в бонус-уровень. Говорят, логотип скрывает ещё кое-что… А для тех, кому совсем тяжело, в меню есть «Чёрный ход».</p></div>`;
  }

  // ——— HUD ———
  setHud(on) { $('#hud').classList.toggle('hidden', !on); if (on) this.buildBoosters(); }

  buildBoosters() {
    const box = $('#h-boost');
    if (box.childElementCount) return;
    for (const [id, B] of Object.entries(BOOSTERS)) {
      const b = el('button', 'boost', `<span class="bi">${B.icon}</span><span class="bl">${B.label}</span><span class="bn mono">0</span><span class="bk mono">${B.key}</span><i></i>`);
      b.dataset.id = id;
      b.style.setProperty('--c', B.color);
      b.title = B.desc;
      // pointerdown, чтобы срабатывало мгновенно и не считалось касанием поля
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.app.audio.unlock(); this.app.game.activateBooster(id); });
      box.appendChild(b);
    }
  }

  boosterGained(id) {
    const b = document.querySelector(`.boost[data-id="${id}"]`);
    if (!b) return;
    b.classList.remove('gain'); void b.offsetWidth; b.classList.add('gain');
  }

  hud(game) {
    if (game.run.demo) return;
    const c = this.hudCache;
    const set = (k, v, fn) => { if (c[k] !== v) { c[k] = v; fn(v); } };
    set('score', game.run.score, (v) => { $('#h-score').textContent = fmt(v); });
    set('lives', game.run.lives, (v) => {
      $('#h-lives').innerHTML = Array.from({ length: Math.max(3, Math.min(9, v)) }, (_, i) => `<i class="${i < v ? '' : 'off'}"></i>`).join('');
    });
    set('weather', game.weather.hud, (v) => { $('#h-weather').textContent = `${WEATHER_INFO[game.weather.type]?.label || ''} · ${v}`; });
    const mul = 1 + Math.min(12, Math.floor(game.combo / 4)) * 0.25;
    set('combo', mul, (v) => { const e = $('#h-combo'); e.classList.toggle('hidden', v <= 1); e.textContent = `КОМБО ×${v.toFixed(2)}`; });
    set('timer', game.bonusTimer > 0 ? Math.ceil(game.bonusTimer) : 0, (v) => { const e = $('#h-timer'); e.classList.toggle('hidden', !v); e.textContent = `БОНУС · ${v} С`; });
    const ch = Object.keys(TOGGLE_LABELS).filter((k) => cheats[k] && k !== 'tourist').map((k) => TOGGLE_LABELS[k]).join(' · ');
    set('cheats', ch, (v) => { const e = $('#h-cheats'); e.classList.toggle('hidden', !v); e.textContent = v; });
    if (game.claustro) {
      const cl = game.claustro;
      set('dist', Math.floor(cl.dist), (v) => {
        $('#h-level').textContent = game.boss ? `${v} м · БОСС` : `${v} м · босс ${Math.max(0, Math.ceil(cl.nextBoss - cl.dist))} м`;
      });
    }
    const ready = game.balls.some((b) => b.stuck) && (game.state === 'ready' || game.state === 'play') && !game.catchT;
    set('hint', ready, (v) => $('#h-hint').classList.toggle('hidden', !v));
    const boss = game.boss;
    set('boss', !!(boss && boss.alive), (v) => $('#h-boss').classList.toggle('hidden', !v));
    if (boss && boss.alive) {
      set('bossName', boss.name, (v) => { $('#h-boss-name').textContent = v; });
      set('bossHp', Math.ceil(boss.ratio * 100), (v) => { $('#h-boss-hp').textContent = v + '%'; $('#h-boss-fill').style.transform = `scaleX(${boss.ratio})`; });
    }
    // бустеры: заряды и активность
    const boost = game.run.boost;
    if (boost) {
      const bkey = Object.keys(BOOSTERS).map((k) => `${boost[k] || 0}${game.effects[k === 'sticky' ? 'catch' : k] > 0 ? 'a' : ''}`).join();
      if (c.boostKey !== bkey) {
        c.boostKey = bkey;
        document.querySelectorAll('.boost').forEach((b) => {
          const id = b.dataset.id, n = boost[id] || 0;
          const active = game.effects[id === 'sticky' ? 'catch' : id] > 0;
          b.querySelector('.bn').textContent = n;
          b.classList.toggle('empty', n <= 0 && !active);
          b.classList.toggle('active', active);
        });
      }
      document.querySelectorAll('.boost.active').forEach((b) => {
        const id = b.dataset.id, t = game.effects[id === 'sticky' ? 'catch' : id];
        b.querySelector('i').style.transform = `scaleX(${Math.max(0, Math.min(1, t / BOOSTERS[id].dur))})`;
      });
    }
    // эффекты (раз в 6 кадров — меньше аллокаций и работы с DOM)
    if ((c.effTick = (c.effTick || 0) + 1) % 6 !== 0) return;
    const effs = [];
    for (const [k, t] of Object.entries(game.effects)) if (t > 0 && POWERUPS[k]?.dur) effs.push([k, t]);
    if (game.shield > 0) effs.push(['shield', game.effects.shield || 1, `ЩИТ ×${game.shield}`]);
    if (game.megaCharges > 0) effs.push(['mega', 1, `БОМБА ×${game.megaCharges}`]);
    const key = effs.map((e) => e[0] + (e[2] || '')).join();
    const box = $('#h-effects');
    if (c.effKey !== key) {
      c.effKey = key;
      box.innerHTML = effs.map(([k, , label]) => `<span class="eff${POWERUPS[k].good ? '' : ' bad'}" data-k="${k}" style="--c:${POWERUPS[k].color}">${label || POWERUPS[k].label}<i></i></span>`).join('');
    }
    box.querySelectorAll('.eff').forEach((e) => {
      const k = e.dataset.k, d = POWERUPS[k].dur;
      const t = game.effects[k] || 0;
      e.querySelector('i').style.transform = `scaleX(${d ? Math.max(0, t / d) : 1})`;
    });
  }

  resetHud() { this.hudCache = {}; }

  levelIntro(level, loc, boss) {
    document.documentElement.style.setProperty('--loc', loc.accent);
    $('#h-loc').textContent = `${loc.code} · ${loc.tag}`;
    $('#h-level').textContent = level.name;
    this.resetHud();
    if (this.app.run?.demo) return;
    const n = this.app.run.levelIndex;
    $('#i-code').textContent = level.claustro ? 'РЕЖИМ · КЛАУСТРОФОБИЯ' : level.bonus ? 'БОНУС-УРОВЕНЬ' : level.generated && this.app.run.mode === 'custom' ? `СИД ${String(level.seed).toUpperCase()}` : `LV ${String(n + 1).padStart(2, '0')} / ${loc.code}`;
    $('#i-loc').textContent = loc.tag;
    $('#i-name').textContent = level.name;
    $('#i-weather').textContent = WEATHER_INFO[loc.weather].label;
    $('#i-desc').textContent = loc.desc;
    $('#i-boss').classList.toggle('hidden', !boss);
    if (boss) $('#i-boss').textContent = `⚠ ${boss.name}`;
    const card = $('#intro');
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
  }

  toast(text, kind = '') {
    const box = $('#toasts');
    while (box.children.length > 2) box.firstChild.remove();
    const t = el('div', 'toast ' + kind, text);
    box.appendChild(t);
    setTimeout(() => t.remove(), 1700);
  }

  popup(game, x, z, pts, mul) {
    if (game.run.demo) return;
    const box = $('#popups');
    let e = this.popPool.find((p) => !p._busy);
    if (!e) {
      if (this.popPool.length > 14) return;
      e = el('div', 'pop');
      box.appendChild(e);
      this.popPool.push(e);
    }
    e._busy = true;
    const s = game.project(x, 0.8, z);
    e.innerHTML = `+${fmt(pts)}${mul ? `<b>×${mul.toFixed(2)}</b>` : ''}`;
    e.style.transition = 'none';
    e.style.opacity = '1';
    e.style.transform = `translate(${s.x - 20}px, ${s.y - 10}px)`;
    requestAnimationFrame(() => {
      e.style.transition = 'transform 0.8s cubic-bezier(.2,.8,.2,1), opacity 0.8s ease-in';
      e.style.transform = `translate(${s.x - 20}px, ${s.y - 50}px)`;
      e.style.opacity = '0';
    });
    setTimeout(() => { e._busy = false; }, 850);
  }

  ink() {
    const i = $('#ink');
    i.style.background = i.style.background; // перерисовать
    i.classList.add('on');
    clearTimeout(this.inkT);
    this.inkT = setTimeout(() => i.classList.remove('on'), 2600);
  }

  flash(v) {
    const f = $('#flash');
    f.style.display = 'block';
    f.style.transition = 'none'; f.style.opacity = String(v);
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.4s'; f.style.opacity = '0'; });
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => { f.style.display = 'none'; }, 450);
  }

  fps(v) {
    const on = settings.showFps;
    $('#fps').classList.toggle('hidden', !on);
    const txt = `${Math.round(v)} FPS`;
    if (on) $('#fps').textContent = txt + ` · ${Math.round(this.app.renderer.pixelRatio() * 100) / 100}x`;
    if (this.current() === 'settings') $('#set-fps').textContent = `${txt} · ${this.app.renderer.info()}`;
  }

  // ——— Модальные ———
  showPause(level) {
    $('#pause-title').textContent = level?.name || 'Пауза';
    this.show('pause');
  }

  showResult(level, res, rows, kicker = 'УРОВЕНЬ ПРОЙДЕН') {
    $('#res-kicker').textContent = kicker;
    $('#res-title').textContent = level.name;
    const box = $('#res-rows');
    box.innerHTML = rows.map((r) => `<div class="res-row${r.cls ? ' ' + r.cls : ''}"><span>${r.k}</span><span class="mono" data-v="${r.v}">${r.raw ? r.v : '0'}</span></div>`).join('');
    this.show('result');
    // анимированный счётчик
    const els = [...box.querySelectorAll('[data-v]')].filter((e, i) => !rows[i].raw);
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      els.forEach((x) => { x.textContent = fmt(+x.dataset.v * e); });
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  showGameOver(rows) {
    $('#go-rows').innerHTML = rows.map((r) => `<div class="res-row${r.cls ? ' ' + r.cls : ''}"><span>${r.k}</span><span class="mono">${r.v}</span></div>`).join('');
    this.show('gameover');
  }
}

export { fmt };
