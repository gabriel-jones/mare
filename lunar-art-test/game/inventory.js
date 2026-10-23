import { ITEM_INFO } from './defs.js';

/** Ten fixed carry slots. Each slot is null or { item, count } with count up to the item's stack size. */
export const SLOT_COUNT = 10;
export const createInventory = (contents = {}, size = SLOT_COUNT) => { const slots = Array(size).fill(null); for (const [item, n] of Object.entries(contents)) add(slots, item, n); return slots; };
export const count = (slots, item) => slots.reduce((s, slot) => s + (slot?.item === item ? slot.count : 0), 0);
/** How many of `item` would fit. */
export function room(slots, item) {
  const stack = ITEM_INFO[item]?.stack ?? 0;
  return slots.reduce((s, slot) => s + (!slot ? stack : slot.item === item ? stack - slot.count : 0), 0);
}
/** Adds up to `n`, topping up existing stacks first. Returns how many did not fit. */
export function add(slots, item, n) {
  const stack = ITEM_INFO[item]?.stack ?? 0;
  if (!stack) return n;
  for (const slot of slots) if (n > 0 && slot?.item === item && slot.count < stack) { const k = Math.min(n, stack - slot.count); slot.count += k; n -= k; }
  for (let i = 0; i < slots.length && n > 0; i++) if (!slots[i]) { const k = Math.min(n, stack); slots[i] = { item, count: k }; n -= k; }
  return n;
}
/** Removes `n` if available (smallest stacks last-in first), returning false and changing nothing otherwise. */
export function remove(slots, item, n) {
  if (count(slots, item) < n) return false;
  for (let i = slots.length - 1; i >= 0 && n > 0; i--) {
    const slot = slots[i]; if (slot?.item !== item) continue;
    const k = Math.min(n, slot.count); slot.count -= k; n -= k;
    if (!slot.count) slots[i] = null;
  }
  return true;
}
export const canAfford = (slots, cost) => Object.entries(cost).every(([item, n]) => count(slots, item) >= n);
/** Whether a refund of `cost` would fit alongside what is carried. */
export function canFit(slots, goods) {
  const copy = slots.map(s => s && { ...s });
  return Object.entries(goods).every(([item, n]) => add(copy, item, n) === 0);
}
export function restore(raw, size = SLOT_COUNT) {
  if (!Array.isArray(raw) || raw.length !== size) throw new Error('Invalid inventory.');
  return raw.map(slot => {
    if (slot == null) return null;
    const info = ITEM_INFO[slot.item];
    if (!info || !Number.isInteger(slot.count) || slot.count < 1 || slot.count > info.stack) throw new Error('Invalid inventory.');
    return { item: slot.item, count: slot.count };
  });
}
