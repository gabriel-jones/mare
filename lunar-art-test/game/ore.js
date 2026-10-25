import { CELL_SIZE, footprint } from './defs.js';
import { DEPOSIT, terrainData } from './terrain.js';
import { available, canReceive, pay, receive } from './storage.js';

/**
 * Martian ore. A mining drill stands on a deposit and bores out its ore while the grid is up and an android is at the
 * controls; the ore piles up inside until a belt leading from its output carries it off or an android hauls it away.
 * Each deposit holds a finite amount (`state.drilled[deposit id]` is what has been taken).
 *
 * A furnace smelts ore into bars, two ore a bar, and every few melts its slag gives up a little silicon. Switched to
 * plate (E), it rolls iron bars into building metal instead, since Mars has no regolith to refine.
 *
 * Saved per building: drill `out`, `work`; furnace `inv`, `out`, `work`, `mode`, `slag`. Who is at a drill is runtime only.
 */
export const ORE = Object.freeze({
  drill: Object.freeze({ time: 3.2, power: 2.5, cap: 24, haul: 8 }),
  furnace: Object.freeze({ time: 7, input: 2, power: 3, stock: 24, cap: 16, slag: 3, plateTime: 4, plate: 4 }),
  /** How long an android's hand on the controls keeps a drill turning. */
  crew: .6,
});
/** What a drill brings up from each kind of deposit. */
export const ORE_OF = Object.freeze({ iron: 'ironore', titanium: 'titanium', gold: 'goldore', ice: 'ice' });
/** What each ore smelts into. */
export const BAR_OF = Object.freeze({ ironore: 'ironbar', titanium: 'titaniumbar', goldore: 'goldbar' });
export const ORES = Object.freeze(Object.keys(BAR_OF));
const FURNACE_OUT = Object.freeze([...Object.values(BAR_OF), 'metal', 'silicon']);
export const MODES = Object.freeze({ bars: 'Smelting bars', plate: 'Rolling metal plate' });

const centre = b => { const f = footprint(b.type, b.x, b.z, b.rotation); return { x: f.reduce((s, c) => s + c.x, 0) / f.length * CELL_SIZE, z: f.reduce((s, c) => s + c.z, 0) / f.length * CELL_SIZE }; };
/** The deposit a drill stands on, or null. */
export function drillDeposit(state, b) {
  const c = centre(b);
  return terrainData(state.seed).deposits.find(d => Math.hypot(c.x - d.x, c.z - d.z) <= d.radius) ?? null;
}
/** Ore left in deposit `d`. */
export const depositLeft = (state, d) => Math.max(0, d.amount - (state.drilled?.[d.id] ?? 0));
/** Why a drill can't stand at this footprint, or null. Every square of it must be over the deposit. */
export function drillReason(state, cells) {
  const deposits = terrainData(state.seed).deposits;
  const d = deposits.find(d => cells.every(c => Math.hypot(c.x * CELL_SIZE - d.x, c.z * CELL_SIZE - d.z) <= d.radius + .4));
  if (!d) return deposits.length ? 'A drill must stand right on a mineral deposit.' : 'Nothing to drill here.';
  if (depositLeft(state, d) < 1) return `This ${DEPOSIT[d.kind].name.toLowerCase()} deposit is worked out.`;
  return null;
}
export const drillOre = (state, b) => { const d = drillDeposit(state, b); return d ? ORE_OF[d.kind] : null; };

export function ensureOre(b) {
  if (!b.built) return b;
  if (b.type === 'drill') { b.out ??= 0; b.work ??= 0; }
  if (b.type === 'furnace') {
    b.inv ??= {}; for (const item of [...ORES, 'ironbar']) b.inv[item] ??= 0;
    b.out ??= {}; for (const item of FURNACE_OUT) b.out[item] ??= 0;
    b.work ??= 0; b.mode ??= 'bars'; b.slag ??= 0;
  }
  return b;
}
const total = o => Object.values(o ?? {}).reduce((s, n) => s + n, 0);
/** Whether drill `b` has work: ore left under it and room inside. */
export const drillWants = (state, b) => b.type === 'drill' && b.built && b.out < ORE.drill.cap && !!drillDeposit(state, b) && depositLeft(state, drillDeposit(state, b)) >= 1;
export const crewed = (state, b) => b.crewed != null && state.time - b.crewed < ORE.crew;
const drillRunning = (state, b) => drillWants(state, b) && crewed(state, b);
/** What furnace `b` would make next, or null. */
function smelting(b) {
  if (total(b.out) >= ORE.furnace.cap) return null;
  if (b.mode === 'plate') return b.inv.ironbar >= 1 ? { input: { ironbar: 1 }, output: { metal: ORE.furnace.plate }, time: ORE.furnace.plateTime } : null;
  const ore = ORES.filter(o => b.inv[o] >= ORE.furnace.input).sort((p, q) => b.inv[q] - b.inv[p])[0];
  return ore ? { input: { [ore]: ORE.furnace.input }, output: { [BAR_OF[ore]]: 1 }, time: ORE.furnace.time } : null;
}
export const furnaceReady = b => b.type === 'furnace' && b.built && !!smelting(b);
/** How many more of `item` furnace `b` will take. Ore is always welcome; iron bars only when rolling plate. */
export function furnaceRoom(b, item) {
  if (b.type !== 'furnace' || !b.built) return 0;
  if (ORES.includes(item)) return ORE.furnace.stock - b.inv[item];
  if (item === 'ironbar' && b.mode === 'plate') return ORE.furnace.stock - b.inv.ironbar;
  return 0;
}
/** A belt hands one item to a furnace. */
export function furnaceAccept(b, item) {
  if (furnaceRoom(b, item) < 1) return false;
  b.inv[item] += 1;
  return true;
}
export const oreDemand = state => state.buildings.reduce((kw, b) => kw + (b.type === 'drill' && drillRunning(state, b) ? ORE.drill.power : furnaceReady(b) ? ORE.furnace.power : 0), 0);

/**
 * One building's step, from the production loop. `push(take)` offers one item at a time to the belts at its outputs.
 */
export function stepOre(state, b, dt, powered, push) {
  if (b.type === 'drill') {
    if (powered && drillRunning(state, b)) {
      b.work = Math.min(1, b.work + dt / ORE.drill.time);
      if (b.work >= 1) {
        const d = drillDeposit(state, b);
        b.work = 0; b.out += 1;
        state.drilled ??= {}; state.drilled[d.id] = (state.drilled[d.id] ?? 0) + 1;
      }
    }
    const item = drillOre(state, b);
    push(() => b.out >= 1 && item ? (b.out--, item) : null);
  }
  if (b.type === 'furnace') {
    const job = smelting(b);
    if (job && powered) {
      b.work = Math.min(1, b.work + dt / job.time);
      if (b.work >= 1) {
        b.work = 0;
        for (const [item, n] of Object.entries(job.input)) b.inv[item] -= n;
        for (const [item, n] of Object.entries(job.output)) b.out[item] += n;
        if (b.mode !== 'plate' && ++b.slag >= ORE.furnace.slag) { b.slag = 0; b.out.silicon += 1; }
      }
    } else if (!job) b.work = 0;
    push(() => { const item = FURNACE_OUT.find(i => b.out[i] > 0); if (item) b.out[item]--; return item ?? null; });
  }
}

const oreName = { ironore: 'iron ore', titanium: 'titanium ore', goldore: 'gold ore', ironbar: 'iron bars', titaniumbar: 'titanium bars', goldbar: 'gold bars', metal: 'metal', silicon: 'silicon', ice: 'ice' };
const listOf = o => Object.entries(o).filter(([, n]) => n > 0).map(([i, n]) => `${n} ${oreName[i]}`).join(', ');
/** What E does at a drill or furnace, or null: take what's made, else load ore, else switch a furnace's mode. */
export function oreAction(state, b) {
  if (!b.built) return null;
  if (b.type === 'drill') return b.out >= 1 ? { verb: `Take ${b.out} ${oreName[drillOre(state, b)]}` } : null;
  if (b.type !== 'furnace') return null;
  if (total(b.out) >= 1) return { verb: `Take ${listOf(b.out)}` };
  const load = loadable(state, b);
  if (Object.keys(load).length) return { verb: `Load ${listOf(load)}` };
  return { verb: `Switch to ${b.mode === 'plate' ? 'smelting bars' : 'rolling metal plate'}` };
}
function loadable(state, b) {
  const out = {};
  for (const item of [...ORES, 'ironbar']) { const n = Math.min(furnaceRoom(b, item), available(state, item)); if (n >= 1) out[item] = n; }
  return out;
}
export function useOre(state, b) {
  if (!b.built) return { ok: false, reason: 'Finish building it first.' };
  if (b.type === 'drill') {
    if (b.out < 1) return { ok: false, reason: 'Nothing drilled yet.' };
    const item = drillOre(state, b), n = b.out;
    if (!canReceive(state, { [item]: n })) return { ok: false, reason: 'No room for the ore.' };
    receive(state, { [item]: n }); b.out = 0;
    return { ok: true, reason: `Took ${n} ${oreName[item]}.` };
  }
  if (total(b.out) >= 1) {
    const taken = Object.fromEntries(Object.entries(b.out).filter(([, n]) => n > 0));
    if (!canReceive(state, taken)) return { ok: false, reason: 'No room for what the furnace made.' };
    receive(state, taken);
    for (const item of FURNACE_OUT) b.out[item] = 0;
    return { ok: true, reason: `Took ${listOf(taken)}.` };
  }
  const load = loadable(state, b);
  if (Object.keys(load).length) {
    if (!pay(state, load)) return { ok: false, reason: 'Nothing to load.' };
    for (const [item, n] of Object.entries(load)) b.inv[item] += n;
    return { ok: true, reason: `Loaded ${listOf(load)} into the furnace.` };
  }
  b.mode = b.mode === 'plate' ? 'bars' : 'plate'; b.work = 0;
  return { ok: true, reason: `Furnace: ${MODES[b.mode].toLowerCase()}.` };
}
/** What a dismantled drill or furnace hands back. */
export function oreContents(state, b) {
  if (b.type === 'drill') { const item = drillOre(state, b); return item && b.out ? { [item]: b.out } : {}; }
  if (b.type === 'furnace') { const o = {}; for (const s of [b.inv, b.out]) for (const [i, n] of Object.entries(s ?? {})) if (n > 0) o[i] = (o[i] ?? 0) + n; return o; }
  return {};
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
const amount = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
/** Validated drill or furnace fields for a restored building, or throws. */
export function restoreOre(b, raw) {
  const bad = () => { throw new Error('Invalid drill or furnace state.'); };
  if (b.type === 'drill') {
    if (raw.out != null) { if (!amount(raw.out, ORE.drill.cap)) bad(); b.out = raw.out; }
    if (raw.work != null) { if (!finite(raw.work) || raw.work < 0 || raw.work > 1) bad(); b.work = raw.work; }
  }
  if (b.type === 'furnace') {
    if (raw.mode != null) { if (!MODES[raw.mode]) bad(); b.mode = raw.mode; }
    if (raw.inv != null) { b.inv = {}; for (const item of [...ORES, 'ironbar']) { const n = raw.inv[item] ?? 0; if (!amount(n, ORE.furnace.stock)) bad(); b.inv[item] = n; } }
    if (raw.out != null) { b.out = {}; for (const item of FURNACE_OUT) { const n = raw.out[item] ?? 0; if (!amount(n, ORE.furnace.cap + ORE.furnace.plate)) bad(); b.out[item] = n; } }
    if (raw.work != null) { if (!finite(raw.work) || raw.work < 0 || raw.work > 1) bad(); b.work = raw.work; }
    if (raw.slag != null) { if (!amount(raw.slag, ORE.furnace.slag)) bad(); b.slag = raw.slag; }
  }
  return b;
}
