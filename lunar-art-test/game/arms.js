import * as inv from './inventory.js';
import { ITEM_INFO } from './defs.js';
import { techDone } from './space.js';

/**
 * The player's weapons. Each is an inventory item; the one held is the selected weapon slot, or the last one picked.
 * Guns load `rounds` from the pack into their magazine; the flamethrower burns its tank down while the trigger is held
 * and refills it from a fuel cell. `state.player.arms` keeps what is loaded in each weapon and is saved; cooldowns and
 * reloads are not.
 */
export const WEAPONS = Object.freeze({
  pistol: { ammo: 'rounds', magazine: 6, damage: 12, range: 16, cooldown: .28, reload: 1.4, tolerance: .22 },
  rifle: { ammo: 'rounds', magazine: 12, damage: 22, range: 26, cooldown: .13, reload: 2.1, tolerance: .16 },
  // The tank holds one fuel cell and burns `burn` a second. Flames reach `range` in a cone of half-angle `cone`.
  flamethrower: { ammo: 'fuel', magazine: 100, burn: 14, damage: 55, range: 5.5, cone: .38, reload: 1.8, stream: true },
});
export const isWeapon = item => !!WEAPONS[item];
/** Armory recipes: what each costs from the pack and how many it makes. */
export const ARMORY = Object.freeze({
  rounds: { input: { metal: 2 }, makes: 8 },
  fuel: { input: { goo: 1, metal: 1 }, makes: 3 },
  pistol: { input: { metal: 12, silicon: 4 }, makes: 1 },
  rifle: { input: { metal: 28, silicon: 8, titanium: 6 }, makes: 1, tech: 'rifle' },
  flamethrower: { input: { metal: 26, titanium: 10, goo: 2 }, makes: 1, tech: 'flamethrower' },
});
export const armoryKnown = (state, id) => !ARMORY[id].tech || techDone(state, ARMORY[id].tech);

export function armsOf(state) {
  const p = state.player;
  p.arms ??= { held: 'pistol', loaded: {} };
  for (const w of Object.keys(WEAPONS)) p.arms.loaded[w] ??= w === 'pistol' ? WEAPONS.pistol.magazine : 0;
  p.arms.cooldown ??= 0; p.arms.reloading ??= 0;
  return p.arms;
}
/** The weapon in hand, or null with none in the pack. Falls back to any weapon carried when the last one is gone. */
export function heldWeapon(state) {
  const a = armsOf(state);
  if (inv.count(state.inventory, a.held) > 0) return a.held;
  const other = Object.keys(WEAPONS).find(w => inv.count(state.inventory, w) > 0);
  if (other) { a.held = other; a.reloading = 0; }
  return other ?? null;
}
/** Take up a carried weapon. A reload in progress is abandoned. */
export function holdWeapon(state, item) {
  if (!isWeapon(item) || !inv.count(state.inventory, item)) return false;
  const a = armsOf(state); if (a.held !== item) { a.held = item; a.reloading = 0; a.cooldown = Math.max(a.cooldown, .25); }
  return true;
}
export const reserveOf = (state, weapon) => inv.count(state.inventory, WEAPONS[weapon].ammo);

export function reload(state) {
  const w = heldWeapon(state); if (!w) return { ok: false, reason: 'No weapon. Craft one at an armory.' };
  const a = armsOf(state), spec = WEAPONS[w];
  if (a.reloading || a.loaded[w] >= spec.magazine) return { ok: false, reason: '' };
  if (!reserveOf(state, w)) return { ok: false, reason: spec.ammo === 'fuel' ? 'No fuel cells. Refine some from goo at an armory.' : 'No rounds left. Craft more at an armory.' };
  a.reloading = spec.reload; return { ok: true, reason: 'Reloading…' };
}
/** Cooldown and reloads. A finished reload fills the magazine from the pack, or the tank from one fuel cell. */
export function stepArms(state, dt) {
  const a = armsOf(state), w = heldWeapon(state);
  a.cooldown = Math.max(0, a.cooldown - dt);
  if (!(a.reloading > 0) || !w) return;
  if ((a.reloading -= dt) > 0) return;
  a.reloading = 0;
  const spec = WEAPONS[w];
  if (spec.ammo === 'fuel') { if (inv.remove(state.inventory, 'fuel', 1)) a.loaded[w] = spec.magazine; return; }
  const n = Math.min(spec.magazine - a.loaded[w], reserveOf(state, w));
  if (n > 0) { inv.remove(state.inventory, spec.ammo, n); a.loaded[w] += n; }
}
/** Spend a round if the held gun is ready. Empty, it starts a reload instead. */
export function pullTrigger(state) {
  const w = heldWeapon(state); if (!w) return { ok: false, reason: 'No weapon. Craft one at an armory.' };
  const a = armsOf(state), spec = WEAPONS[w];
  if (spec.stream) return { ok: false, weapon: w };
  if (a.cooldown > 0 || a.reloading) return { ok: false, weapon: w, reason: a.reloading ? 'Reloading…' : '' };
  if (!a.loaded[w]) { const r = reload(state); return { ok: false, weapon: w, reason: r.reason }; }
  a.loaded[w]--; a.cooldown = spec.cooldown;
  if (!a.loaded[w]) reload(state);
  return { ok: true, weapon: w, spec };
}
/** Burn the flamethrower's tank for one step. True while it is spraying. */
export function burnTank(state, dt) {
  const w = heldWeapon(state), a = armsOf(state);
  if (w !== 'flamethrower' || a.reloading || a.cooldown > 0) return false;
  if (a.loaded[w] <= 0) { reload(state); return false; }
  a.loaded[w] = Math.max(0, a.loaded[w] - WEAPONS[w].burn * dt);
  if (!a.loaded[w]) reload(state);
  return true;
}

/** Craft at an armory bench from the pack. */
export function craft(state, id) {
  const r = ARMORY[id]; if (!r) return { ok: false, reason: 'Unknown recipe.' };
  if (!armoryKnown(state, id)) return { ok: false, reason: 'Research it first (T).' };
  const missing = Object.entries(r.input).filter(([item, n]) => inv.count(state.inventory, item) < n);
  if (missing.length) return { ok: false, reason: `Needs ${missing.map(([item, n]) => `${n} ${ITEM_INFO[item].name.toLowerCase()}`).join(', ')}.` };
  if (inv.room(state.inventory, id) < r.makes) return { ok: false, reason: 'No room in your inventory.' };
  for (const [item, n] of Object.entries(r.input)) inv.remove(state.inventory, item, n);
  inv.add(state.inventory, id, r.makes);
  return { ok: true, reason: `Crafted ${r.makes > 1 ? `${r.makes} ` : ''}${ITEM_INFO[id].name.toLowerCase()}.` };
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
/**
 * Loaded magazines survive a reload. Saves from before weapons were items carried a pistol and a round counter; they
 * get the pistol and their rounds in the pack.
 */
export function restoreArms(state, raw) {
  const a = armsOf(state);
  if (raw.arms == null) {
    if (!inv.count(state.inventory, 'pistol')) inv.add(state.inventory, 'pistol', 1);
    inv.add(state.inventory, 'rounds', raw.gun?.reserve ?? 12);
    if (Number.isInteger(raw.gun?.mag)) a.loaded.pistol = Math.min(WEAPONS.pistol.magazine, Math.max(0, raw.gun.mag));
    return;
  }
  if (typeof raw.arms !== 'object' || !isWeapon(raw.arms.held) || !raw.arms.loaded || typeof raw.arms.loaded !== 'object') throw new Error('Invalid weapons.');
  a.held = raw.arms.held;
  for (const [w, n] of Object.entries(raw.arms.loaded)) {
    if (!isWeapon(w) || !finite(n) || n < 0 || n > WEAPONS[w].magazine) throw new Error('Invalid weapons.');
    a.loaded[w] = n;
  }
}
