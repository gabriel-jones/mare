import { CELL_SIZE, DEFS, ITEM_INFO, dims, tagOf } from './defs.js';
import * as inv from './inventory.js';

/** Every finished crate holds its own slots, but together they are one base stock: building, crafting
 * and cooking inside the base draw from pockets first and then from any crate. */
export const CRATE_SLOTS = DEFS.storage.slots;
/** Metres from the nearest crate within which the base stock can be spent and refunds land in it. */
export const BASE_REACH = 30;

export const crates = state => state.buildings.filter(b => b.type === 'storage' && b.built && b.slots);
export const emptyCrate = () => Array(CRATE_SLOTS).fill(null);
export const crateCentre = b => { const { w, d } = dims(b.type, b.rotation); return { x: (b.x + (w - 1) / 2) * CELL_SIZE, z: (b.z + (d - 1) / 2) * CELL_SIZE }; };
export const crateDistance = (state, b) => { const c = crateCentre(b); return Math.hypot(c.x - state.player.x, c.z - state.player.z); };
/** Whether the player stands close enough to the base for its stock to count. */
export const inReach = state => state.player.cave == null && crates(state).some(b => crateDistance(state, b) <= BASE_REACH);

export const baseCount = (state, item) => crates(state).reduce((s, b) => s + inv.count(b.slots, item), 0);
export const baseRoom = (state, item) => crates(state).reduce((s, b) => s + inv.room(b.slots, item), 0);
export const usedSlots = b => b.slots.filter(Boolean).length;

/** Crates to fill, best first: `prefer`, then crates already holding `item`, then the emptiest. */
function fillOrder(state, item, prefer, except) {
  const list = crates(state).filter(b => b !== except);
  const rank = b => (b === prefer ? 0 : inv.count(b.slots, item) ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b) || usedSlots(a) - usedSlots(b) || a.id - b.id);
}
/** Puts up to `n` into base storage. Returns how many did not fit. */
export function stash(state, item, n, prefer = null, except = null) {
  for (const b of fillOrder(state, item, prefer, except)) { if (n <= 0) break; n = inv.add(b.slots, item, n); }
  return n;
}
/** Takes up to `n` out of base storage, emptying the fullest-of-that-item crates last. Returns how many were taken. */
export function draw(state, item, n, prefer = null) {
  let taken = 0;
  const list = crates(state).filter(b => inv.count(b.slots, item)).sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : inv.count(a.slots, item) - inv.count(b.slots, item)));
  for (const b of list) { const k = Math.min(n - taken, inv.count(b.slots, item)); if (k > 0) { inv.remove(b.slots, item, k); taken += k; } }
  return taken;
}

/** What the player can spend right now: pockets, plus the base stock when at the base. */
export const available = (state, item) => inv.count(state.inventory, item) + (inReach(state) ? baseCount(state, item) : 0);
export const canPay = (state, cost) => Object.entries(cost).every(([item, n]) => available(state, item) >= n);
export const missing = (state, cost) => Object.entries(cost).filter(([item, n]) => available(state, item) < n);
/** Spends `cost` from pockets first, then the base stock. Changes nothing and returns false if it can't be paid. */
export function pay(state, cost) {
  if (!canPay(state, cost)) return false;
  for (const [item, n] of Object.entries(cost)) {
    const own = Math.min(n, inv.count(state.inventory, item));
    inv.remove(state.inventory, item, own);
    if (n > own) draw(state, item, n - own);
  }
  return true;
}
/** Whether `goods` would fit in pockets plus, at the base, the crates (optionally leaving one out). */
export function canReceive(state, goods, except = null) {
  const pockets = state.inventory.map(s => s && { ...s }), reach = inReach(state);
  const spare = reach ? crates(state).filter(b => b !== except).map(b => b.slots.map(s => s && { ...s })) : [];
  return Object.entries(goods).every(([item, n]) => { n = inv.add(pockets, item, n); for (const slots of spare) n = inv.add(slots, item, n); return n === 0; });
}
/** Gives `goods` to pockets first, overflowing into base storage at the base. Returns how many were lost. */
export function receive(state, goods, except = null) {
  const reach = inReach(state);
  let lost = 0;
  for (const [item, n] of Object.entries(goods)) { const left = inv.add(state.inventory, item, n); lost += reach && left ? stash(state, item, left, null, except) : left; }
  return lost;
}

/** Moves a pocket slot's stack (or `n` of it) into base storage, filling `crate` first. */
export function storeSlot(state, index, crate, n = Infinity) {
  const slot = state.inventory[index];
  if (!slot) return { ok: false, reason: 'That slot is empty.' };
  const item = slot.item, want = Math.min(n, slot.count), left = stash(state, item, want, crate);
  const moved = want - left;
  if (!moved) return { ok: false, reason: 'Base storage is full. Build another crate.' };
  slot.count -= moved; if (!slot.count) state.inventory[index] = null;
  return { ok: true, reason: `Stored ${moved} ${ITEM_INFO[item].name.toLowerCase()}${left ? '; storage is full' : ''}.`, moved };
}
/** Moves a crate slot's stack (or `n` of it) into pockets. */
export function takeSlot(state, crate, index, n = Infinity) {
  const slot = crate.slots[index];
  if (!slot) return { ok: false, reason: 'That slot is empty.' };
  const item = slot.item, want = Math.min(n, slot.count), left = inv.add(state.inventory, item, want), moved = want - left;
  if (!moved) return { ok: false, reason: 'No room in your pockets.' };
  slot.count -= moved; if (!slot.count) crate.slots[index] = null;
  return { ok: true, reason: `Took ${moved} ${ITEM_INFO[item].name.toLowerCase()}.`, moved };
}
/** Moves a stack (or half) between any two slots of pockets and `crate`. `to.i` null drops it into
 * whichever slots on that side take it. `from`/`to` are `{ crate: bool, i }`. */
export function moveStack(state, crate, from, to, half = false) {
  const side = s => (s.crate ? crate?.slots : state.inventory), a = side(from), b = side(to);
  if (!a || !b) return { ok: false, reason: 'Open a crate first.' };
  const slot = a[from.i];
  if (!slot) return { ok: false, reason: 'That slot is empty.' };
  if (a === b && (to.i == null || to.i === from.i)) return { ok: true, moved: 0, reason: '' };
  const item = slot.item, n = half ? Math.ceil(slot.count / 2) : slot.count, target = to.i == null ? null : b[to.i];
  let moved;
  if (to.i == null) { moved = n - inv.add(b, item, n); slot.count -= moved; if (!slot.count) a[from.i] = null; }
  else moved = inv.moveSlot(a, from.i, b, to.i, n);
  if (!moved) return { ok: false, reason: target && target.item !== item ? 'Only a whole stack can swap places.' : target ? 'That stack is full.' : to.crate ? 'This crate is full.' : 'No room in your pockets.' };
  return { ok: true, moved, reason: `Moved ${moved} ${ITEM_INFO[item].name.toLowerCase()}.` };
}
/** Stores everything carried except weapons, ammunition, flares and food. */
export const KEEP = item => ['pistol', 'smg', 'katana', 'rifle', 'flamethrower', 'rounds', 'fuel', 'flare', 'medkit'].includes(item) || !!ITEM_INFO[item]?.food;
export function storeAll(state, crate) {
  let moved = 0, full = false;
  state.inventory.forEach((slot, i) => { if (slot && !KEEP(slot.item)) { const r = storeSlot(state, i, crate); moved += r.moved ?? 0; if (!r.ok || state.inventory[i]) full = true; } });
  if (!moved) return { ok: false, reason: full ? 'Base storage is full. Build another crate.' : 'Nothing to store: weapons, ammo, flares and food stay with you.' };
  return { ok: true, reason: `Stored ${moved} item${moved > 1 ? 's' : ''}${full ? '; storage is full' : ''}. Weapons, ammo, flares and food stay with you.` };
}

/** Where every item in the colony is: crates, pockets, machines, belts and robots. */
export function ledger(state) {
  const rows = new Map(), row = item => { if (!rows.has(item)) rows.set(item, { item, total: 0, stored: 0, pockets: 0, crates: [], machines: [], belts: 0, robots: [] }); return rows.get(item); };
  for (const b of crates(state)) {
    const here = {};
    for (const s of b.slots) if (s) here[s.item] = (here[s.item] ?? 0) + s.count;
    for (const [item, n] of Object.entries(here)) { const r = row(item); r.crates.push({ id: b.id, tag: tagOf(b), n }); r.stored += n; }
  }
  for (const s of state.inventory) if (s) row(s.item).pockets += s.count;
  for (const b of state.buildings) {
    if (!b.built || b.type === 'storage') continue;
    for (const [field, role] of [['inv', 'input'], ['out', 'output'], ['ready', 'output']]) {
      for (const [item, raw] of Object.entries(b[field] ?? {})) { const n = Math.floor(raw); if (n >= 1 && ITEM_INFO[item]) row(item).machines.push({ id: b.id, tag: tagOf(b), name: DEFS[b.type].name, n, role }); }
    }
    for (const it of b.items ?? []) if (ITEM_INFO[it.type]) row(it.type).belts += 1;
  }
  for (const r of state.robots ?? []) {
    const n = Math.floor(r.cargo ?? 0), item = r.kind === 'hauler' ? r.load : r.load ?? 'regolith';
    if (n < 1 || !item) continue;
    const to = r.job?.to === 'ship' ? 'Starship' : state.buildings.find(b => b.id === (r.job?.to ?? r.target?.id));
    row(item).robots.push({ id: r.id, kind: r.kind, n, to: typeof to === 'string' ? to : to ? tagOf(to) : null });
  }
  for (const r of rows.values()) r.total = r.stored + r.pockets + r.machines.reduce((s, m) => s + m.n, 0) + r.belts + r.robots.reduce((s, m) => s + m.n, 0);
  const order = Object.keys(ITEM_INFO);
  return [...rows.values()].sort((a, b) => order.indexOf(a.item) - order.indexOf(b.item));
}
