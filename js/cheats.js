// «Чёрный ход» — секретные коды для читеров и слабаков.
import { profile, saveProfile } from './settings.js';
import { CAMPAIGN } from './levels.js';
import { BOOSTERS, BOOST_MAX } from './game.js';

profile.cheats ||= {};
profile.cheatsOwned ||= []; // коды, полученные трофеями за боссов
// ВСЕДВЕРИ убран в v1.8.1 — выбор локаций и так есть
profile.cheatsOwned = profile.cheatsOwned.filter((c) => c !== 'ВСЕДВЕРИ');
export const cheats = profile.cheats;

// Переключатели, которые влияют на игру (рекорд с ними помечается звёздочкой)
const GAMEPLAY_TOGGLES = ['immortal', 'turtle', 'adrenaline'];
export const TOGGLE_LABELS = {
  immortal: '∞ БЕССМЕРТИЕ', turtle: 'ЧЕРЕПАХА', adrenaline: 'АДРЕНАЛИН', confetti: 'КОНФЕТТИ', tourist: 'ТУРИСТ',
};

export function gameplayCheatsOn() { return GAMEPLAY_TOGGLES.some((k) => cheats[k]); }

// Нормализация ввода: регистр, ё, пробелы и знаки не важны
function norm(s) {
  return String(s).toUpperCase().replace(/Ё/g, 'Е').replace(/[^A-ZА-Я0-9]/g, '');
}

const CODES = [
  {
    names: ['БЕССМЕРТИЕ', 'BESSMERTIE'],
    reward: true,
    desc: 'Постоянное поле снизу — шары не теряются (вкл/выкл)',
    toggle: 'immortal',
    text: (on) => (on ? 'Снизу постоянное поле — шары не теряются.' : 'Шары снова можно потерять.'),
  },
  {
    names: ['АРСЕНАЛ', 'ARSENAL'],
    reward: true,
    desc: 'Все бустеры заряжены до максимума',
    run(app) {
      const full = Object.fromEntries(Object.keys(BOOSTERS).map((k) => [k, BOOST_MAX]));
      if (app.mode === 'play' && app.run) { app.run.boost = full; app.run.cheated = true; return 'Все бустеры заряжены до максимума.'; }
      cheats.pendingArsenal = true;
      return 'Все бустеры будут заряжены в следующей игре.';
    },
  },
  {
    names: ['КОШКА', 'KOSHKA'],
    reward: true,
    desc: '9 жизней, как у кошки',
    run(app) {
      if (app.mode === 'play' && app.run) { app.run.lives = 9; app.run.cheated = true; return '9 жизней, как у кошки.'; }
      cheats.pendingCat = true;
      return 'В следующей игре будет 9 жизней.';
    },
  },
  {
    names: ['ТУРИСТ', 'TURIST', 'TOURIST'],
    reward: true,
    desc: 'Пропуск уровня из паузы (вкл/выкл)',
    toggle: 'tourist',
    text: (on) => (on ? 'В паузе появилась кнопка «Пропустить уровень».' : 'Пропуск уровней выключен.'),
  },
  {
    names: ['ЧЕРЕПАХА', 'CHEREPAHA'],
    reward: true,
    desc: 'Шар на 30% медленнее (вкл/выкл)',
    toggle: 'turtle',
    exclusive: 'adrenaline',
    text: (on) => (on ? 'Шар на 30% медленнее.' : 'Обычная скорость шара.'),
  },
  {
    names: ['АДРЕНАЛИН', 'ADRENALIN', 'ADRENALINE'],
    reward: true,
    desc: 'Быстрый шар, 1 жизнь, очки ×2 (вкл/выкл)',
    toggle: 'adrenaline',
    exclusive: 'turtle',
    text: (on) => (on ? 'Шар быстрее, одна жизнь в новой игре, очки ×2.' : 'Хардкор выключен.'),
  },
  {
    names: ['КОНФЕТТИ', 'KONFETTI', 'CONFETTI'],
    reward: true,
    desc: 'Фейерверк из каждого блока (вкл/выкл)',
    toggle: 'confetti',
    text: (on) => (on ? 'Каждый блок взрывается фейерверком.' : 'Фейерверки выключены.'),
  },
  {
    names: ['БОСС', 'BOSS'],
    reward: true,
    desc: 'Телепорт к случайному открытому боссу',
    run(app) {
      const open = CAMPAIGN.filter((l) => l.boss && l.index <= profile.maxLevel);
      const pool = open.length ? open : [CAMPAIGN.find((l) => l.boss)];
      const lv = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(() => app.playCampaign(lv.index), 700);
      return `Телепорт к боссу: ${lv.name}.`;
    },
  },
  {
    names: ['ЗАБЫТЬ', 'ZABYT', 'ZABIT'],
    run(app) {
      if (!window.confirm('Стереть весь прогресс: уровни, рекорды, кристаллы, сохранение? Настройки останутся.')) return null;
      Object.assign(profile, { maxLevel: 0, bestScore: 0, bestCheat: 0, stars: [], bossesDefeated: 0, chaosUnlocked: false, chaosMode: false, saved: null, plays: 0 });
      for (const k of Object.keys(cheats)) delete cheats[k];
      profile.cheatsOwned = [];
      saveProfile();
      return 'Прогресс стёрт. Чистый лист.';
    },
  },
  {
    names: ['ХАОС', 'HAOS', 'CHAOS', 'KHAOS'],
    reward: true,
    desc: 'Открывает режим хаоса',
    run(app) {
      if (profile.chaosUnlocked) return 'Режим хаоса уже открыт — он в главном меню.';
      app.unlockChaos();
      return 'Режим хаоса открыт — он в главном меню.';
    },
  },
];

// Возвращает { ok, text } или null (действие отменено)
export function enterCode(app, input) {
  const code = norm(input);
  if (!code) return { ok: false, text: '' };
  const c = CODES.find((x) => x.names.includes(code));
  if (!c) return { ok: false, text: 'ДОСТУП ЗАПРЕЩЁН' };
  if (c.reward && !profile.cheatsOwned.includes(c.names[0])) return { ok: false, text: 'КОД ЗАБЛОКИРОВАН · ЗАСЛУЖИ ЕГО ТРОФЕЕМ ЗА БОССА' };
  let text;
  if (c.toggle) {
    const on = !cheats[c.toggle];
    cheats[c.toggle] = on;
    if (on && c.exclusive) cheats[c.exclusive] = false;
    if (on && GAMEPLAY_TOGGLES.includes(c.toggle) && app.run && app.mode === 'play') app.run.cheated = true;
    text = `${TOGGLE_LABELS[c.toggle]}: ${on ? 'ВКЛ' : 'ВЫКЛ'} — ${c.text(on)}`;
  } else {
    text = c.run(app);
    if (text === null) return null;
  }
  saveProfile();
  return { ok: true, text };
}

// Одноразовые коды, которые ждут начала новой игры
export function applyPending(run) {
  let used = false;
  if (cheats.pendingArsenal) { run.boost = Object.fromEntries(Object.keys(BOOSTERS).map((k) => [k, BOOST_MAX])); delete cheats.pendingArsenal; used = true; }
  if (cheats.pendingCat) { run.lives = 9; delete cheats.pendingCat; used = true; }
  if (used) { run.cheated = true; saveProfile(); }
}

// ——— Трофеи за боссов: выбор одного кода из трёх ещё не полученных ———
export function rewardOptions(n = 3) {
  const pool = CODES.filter((c) => c.reward && !profile.cheatsOwned.includes(c.names[0]));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n).map((c) => ({ id: c.names[0], desc: c.desc }));
}

export function grantCode(id) {
  if (!profile.cheatsOwned.includes(id)) profile.cheatsOwned.push(id);
  saveProfile();
}

export function ownedCodes() {
  return CODES.filter((c) => c.reward && profile.cheatsOwned.includes(c.names[0])).map((c) => ({ id: c.names[0], desc: c.desc }));
}

export const TOTAL_CODES = CODES.filter((c) => c.reward).length;
