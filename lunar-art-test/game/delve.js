import { caveLayout } from './caves.js';
import { ITEM_INFO } from './defs.js';
import * as inv from './inventory.js';

/** What the player finds underground and carries back by hand. Pure, like the rest of the sim. */
export const LOOT_REACH = 2.1;
export const LOOT_ITEM = Object.freeze({ ore: 'titanium', crystal: 'rareearth', artifact: 'artifact', heart: 'heart' });
const VERBS = { ore: 'Chip out the titanium seam', crystal: 'Harvest the rare-earth crystal', artifact: 'Take the artifact', blueprint: 'Take the etched schematic', heart: 'Lift the heart' };

export const SCHEMATIC = "An etched crystal schematic: a reactor that rings a rare-earth lattice like a bell and draws power from it. Our physics says that can't work. Research it (T) and we'll find out.";
export const HEART = "That's what they were guarding. It hums at the same frequency as the crystals, and the same as whatever keeps showing up on the crater rim. Take it to a xeno lab. Carefully.";

export const zoneKey = (id, zone = 0) => zone ? `${id}:${zone}` : `${id}`;
const takenIn = (state, key) => state.caveLoot?.[key] ?? [];

/** Unclaimed finds in the player's current zone, nearest first. */
export function nearestLoot(state) {
  const p = state.player;
  if (p.cave == null) return null;
  const zone = p.zone ?? 0, taken = new Set(takenIn(state, zoneKey(p.cave, zone)));
  let best = null, distance = LOOT_REACH;
  for (const l of caveLayout(state.seed, p.cave, zone).loot) {
    if (taken.has(l.key)) continue;
    const d = Math.hypot(l.x * 2 + l.dx * .8 - p.x, l.z * 2 + l.dz * .8 - p.z);
    if (d < distance) { best = l; distance = d; }
  }
  return best;
}
/** The hint for E underground, or null. */
export function lootAction(state) {
  const l = nearestLoot(state);
  if (!l) return null;
  const item = LOOT_ITEM[l.kind], amount = l.amount ?? 1;
  return { verb: item ? `${VERBS[l.kind]} · ${amount} ${ITEM_INFO[item].name.toLowerCase()}` : VERBS[l.kind], loot: l };
}
/** Takes the nearest find. `say` carries what the ship AI makes of it. */
export function takeLoot(state) {
  const l = nearestLoot(state);
  if (!l) return { ok: false, reason: 'Nothing here.' };
  const item = LOOT_ITEM[l.kind], amount = l.amount ?? 1;
  if (item && inv.room(state.inventory, item) < amount) return { ok: false, reason: `No room to carry ${amount} ${ITEM_INFO[item].name.toLowerCase()}.` };
  const p = state.player, key = zoneKey(p.cave, p.zone ?? 0);
  state.caveLoot ??= {};
  (state.caveLoot[key] ??= []).push(l.key);
  if (item) {
    inv.add(state.inventory, item, amount);
    return { ok: true, reason: `${ITEM_INFO[item].name} +${amount}`, say: l.kind === 'heart' ? HEART : null };
  }
  state.blueprints ??= [];
  if (!state.blueprints.includes('reactor')) { state.blueprints.push('reactor'); return { ok: true, reason: 'Schematic found: Resonance reactor.', say: SCHEMATIC }; }
  return { ok: true, reason: 'Another copy of the reactor schematic. We already have it.' };
}

/** Validates the saved record of what has been taken; unknown entries (old glyph tablets among them) are dropped rather than failing the load. */
export function restoreDelve(state, raw) {
  if (raw.caveLoot && typeof raw.caveLoot === 'object' && !Array.isArray(raw.caveLoot)) {
    state.caveLoot = {};
    for (const [key, list] of Object.entries(raw.caveLoot)) {
      if (!/^[0-2](:[12])?$/.test(key) || !Array.isArray(list)) continue;
      const [id, zone = 0] = key.split(':').map(Number), known = new Set(caveLayout(state.seed, id, zone).loot.map(l => l.key));
      state.caveLoot[key] = [...new Set(list.filter(k => known.has(k)))];
    }
  }
  if (raw.blueprints != null) { if (!Array.isArray(raw.blueprints) || raw.blueprints.some(b => b !== 'reactor')) throw new Error('Invalid blueprints.'); state.blueprints = [...new Set(raw.blueprints)]; }
}
