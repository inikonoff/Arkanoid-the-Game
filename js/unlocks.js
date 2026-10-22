// Дозированное открытие бонусов по прогрессу кампании.
// Дошёл до уровня — бонус открыт навсегда во всех режимах.
import { profile, saveProfile } from './settings.js';

// индекс уровня кампании (с нуля), на котором открывается бонус
export const UNLOCK_AT = {
  expand: 0, multi: 0, shrink: 0,
  laser: 1,
  shield: 2,
  slow: 3, fast: 3,
  catch: 4,
  life: 5,
  fire: 6,
  mega: 8,
  gravity: 9,
  cell: 11,
};
export const CHAINS_AT = 12; // сборки «3 одинаковых → супер»

// в «Клаустрофобии» узкий старт без этого слишком жёсткий
const CLAUSTRO_ALWAYS = ['laser', 'shield'];

export function reachOf(run) {
  const cur = run && run.mode === 'campaign' ? run.levelIndex || 0 : 0;
  return Math.max(profile.maxLevel || 0, cur);
}

export function allowedSet(run, level) {
  const reach = reachOf(run);
  const set = new Set(Object.keys(UNLOCK_AT).filter((k) => UNLOCK_AT[k] <= reach));
  if (level?.claustro) CLAUSTRO_ALWAYS.forEach((k) => set.add(k));
  return set;
}

export function chainsAllowed(run) { return reachOf(run) >= CHAINS_AT; }

// что впервые открывается на этом уровне кампании (и ещё не показывалось)
export function newUnlocksFor(levelIndex) {
  profile.seenUnlocks ||= [];
  const items = Object.keys(UNLOCK_AT).filter((k) => UNLOCK_AT[k] === levelIndex && UNLOCK_AT[k] > 0 && !profile.seenUnlocks.includes(k));
  if (levelIndex === CHAINS_AT && !profile.seenUnlocks.includes('chains')) items.push('chains');
  return items;
}

export function markSeen(items) {
  profile.seenUnlocks ||= [];
  for (const k of items) if (!profile.seenUnlocks.includes(k)) profile.seenUnlocks.push(k);
  saveProfile();
}
