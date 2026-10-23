import { techDone } from './space.js';

/**
 * Food: what grows where, the mill, the galley's recipes and what meals do for you. Data and pure helpers; the
 * machines that use them run in life.js. Provisional tuning.
 *
 * A crop grows in one kind of grower. `time` is seconds to ripen, `water` is drawn when a crop is planted, `power`
 * is kW while growing, `yield` is how many it gives. `tech` gates it behind research.
 */
export const CROPS = Object.freeze({
  crop: { name: 'Potatoes', grower: 'growbed', time: 90, water: 1, power: 0.4, yield: 3 },
  greens: { name: 'Greens', grower: 'growbed', time: 45, water: 1, power: 0.4, yield: 3 },
  soy: { name: 'Soybeans', grower: 'hydrorack', time: 150, water: 2, power: 0.5, yield: 4, tech: 'soy' },
  tomato: { name: 'Tomatoes', grower: 'hydrorack', time: 110, water: 2, power: 0.5, yield: 3, tech: 'tomato' },
  // Grown in water, not soil: thirsty, but no grow lights.
  algae: { name: 'Algae', grower: 'hydrorack', time: 40, water: 4, power: 0, yield: 4, tech: 'algae' },
  wheat: { name: 'Wheat', grower: 'verticalfarm', time: 160, water: 3, power: 0.8, yield: 8, tech: 'wheat' },
  // In the dark of a habitat room, on nothing but damp.
  mushroom: { name: 'Mushrooms', grower: 'mushroomtray', time: 80, water: 1, power: 0, yield: 3, tech: 'mycology' },
});
export const GROWERS = Object.freeze(['growbed', 'hydrorack', 'verticalfarm', 'mushroomtray']);
export const isGrower = b => GROWERS.includes(b?.type);
/** The crops a grower of this type can be planted with now, in menu order. */
export const cropsFor = (state, type) => Object.keys(CROPS).filter(id => CROPS[id].grower === type && (!CROPS[id].tech || techDone(state, CROPS[id].tech)));
export const defaultCrop = type => Object.keys(CROPS).find(id => CROPS[id].grower === type);

/** The mill grinds one item at a time into one of its product. */
export const MILL = Object.freeze({ time: 4, power: 1, cap: 6, makes: Object.freeze({ wheat: 'flour', soy: 'protein' }) });

/**
 * Galley recipes, by the dish they make. `buff` is seconds of each effect. Left on auto, the galley cooks the first
 * of AUTO it has the ingredients for; medkits are only made when chosen, so they never eat the salad tomatoes.
 */
export const RECIPES = Object.freeze({
  meal: { input: { crop: 2 } },
  salad: { input: { greens: 1, tomato: 1 }, buff: { regen: 300 } },
  bread: { input: { flour: 2 }, buff: { calm: 300 } },
  stew: { input: { protein: 1, crop: 1 }, buff: { stamina: 300 } },
  broth: { input: { mushroom: 1, greens: 1 }, buff: { sight: 300 } },
  algaecake: { input: { algae: 1, flour: 1 }, buff: { calm: 180 } },
  pizza: { input: { flour: 1, tomato: 1, mushroom: 1 }, buff: { regen: 90, calm: 90, stamina: 90, sight: 90 } },
  medkit: { input: { tomato: 2 }, tech: 'medicine' },
});
export const AUTO = Object.freeze(['pizza', 'stew', 'salad', 'broth', 'bread', 'algaecake', 'meal']);
export const GALLEY = Object.freeze({ time: 6, power: 1.5, queue: 2, ready: 3 });
export const recipeUnlocked = (state, id) => !RECIPES[id].tech || techDone(state, RECIPES[id].tech);

/**
 * Meal effects. They all run at once; eating the same effect again adds its time, up to `BUFF_CAP` seconds.
 * regen: suit health per second · calm: hunger drains at this fraction · stamina: run speed · sight: headlamp reach.
 */
export const BUFFS = Object.freeze({
  regen: { name: 'Mending', heal: 1.5 },
  calm: { name: 'Sated', drain: 0.5 },
  stamina: { name: 'Vigour', speed: 1.15 },
  sight: { name: 'Night eyes', reach: 1.3 },
});
export const BUFF_CAP = 900;
export const buffed = (player, id) => (player?.buffs?.[id] ?? 0) > 0;
export function addBuffs(player, buff) {
  if (!buff) return;
  player.buffs ??= {};
  for (const [id, t] of Object.entries(buff)) player.buffs[id] = Math.min(BUFF_CAP, (player.buffs[id] ?? 0) + t);
}
export function stepBuffs(player, dt) {
  for (const id of Object.keys(player.buffs ?? {})) if ((player.buffs[id] -= dt) <= 0) delete player.buffs[id];
}
export function restoreBuffs(state, raw) {
  const b = raw.player?.buffs;
  if (b == null) return;
  if (typeof b !== 'object' || Array.isArray(b)) throw new Error('Invalid player.');
  state.player.buffs = {};
  for (const [id, t] of Object.entries(b)) if (BUFFS[id] && typeof t === 'number' && t > 0 && t <= BUFF_CAP) state.player.buffs[id] = t;
}
