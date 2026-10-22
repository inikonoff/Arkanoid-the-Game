// «Чёрный ход» — секретные коды для читеров и слабаков.
import { profile, saveProfile } from './settings.js';
import { CAMPAIGN } from './levels.js';
import { BOOSTERS, BOOST_MAX } from './game.js';

profile.cheats ||= {};
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
    names: ['ВСЕДВЕРИ', 'VSEDVERI'],
    run(app) {
      profile.maxLevel = CAMPAIGN.length - 1;
      saveProfile();
      return 'Все 24 уровня кампании открыты.';
    },
  },
  {
    names: ['БЕССМЕРТИЕ', 'BESSMERTIE'],
    toggle: 'immortal',
    text: (on) => (on ? 'Снизу постоянное поле — шары не теряются.' : 'Шары снова можно потерять.'),
  },
  {
    names: ['АРСЕНАЛ', 'ARSENAL'],
    run(app) {
      const full = Object.fromEntries(Object.keys(BOOSTERS).map((k) => [k, BOOST_MAX]));
      if (app.mode === 'play' && app.run) { app.run.boost = full; app.run.cheated = true; return 'Все бустеры заряжены до максимума.'; }
      cheats.pendingArsenal = true;
      return 'Все бустеры будут заряжены в следующей игре.';
    },
  },
  {
    names: ['КОШКА', 'KOSHKA'],
    run(app) {
      if (app.mode === 'play' && app.run) { app.run.lives = 9; app.run.cheated = true; return '9 жизней, как у кошки.'; }
      cheats.pendingCat = true;
      return 'В следующей игре будет 9 жизней.';
    },
  },
  {
    names: ['ТУРИСТ', 'TURIST', 'TOURIST'],
    toggle: 'tourist',
    text: (on) => (on ? 'В паузе появилась кнопка «Пропустить уровень».' : 'Пропуск уровней выключен.'),
  },
  {
    names: ['ЧЕРЕПАХА', 'CHEREPAHA'],
    toggle: 'turtle',
    exclusive: 'adrenaline',
    text: (on) => (on ? 'Шар на 30% медленнее.' : 'Обычная скорость шара.'),
  },
  {
    names: ['АДРЕНАЛИН', 'ADRENALIN', 'ADRENALINE'],
    toggle: 'adrenaline',
    exclusive: 'turtle',
    text: (on) => (on ? 'Шар быстрее, одна жизнь в новой игре, очки ×2.' : 'Хардкор выключен.'),
  },
  {
    names: ['КОНФЕТТИ', 'KONFETTI', 'CONFETTI'],
    toggle: 'confetti',
    text: (on) => (on ? 'Каждый блок взрывается фейерверком.' : 'Фейерверки выключены.'),
  },
  {
    names: ['БОСС', 'BOSS'],
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
      saveProfile();
      return 'Прогресс стёрт. Чистый лист.';
    },
  },
  {
    names: ['ХАОС', 'HAOS', 'CHAOS', 'KHAOS'],
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
