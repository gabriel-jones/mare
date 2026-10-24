// Who comes for you: one ladder of alien kinds (crawler.js KINDS, and the centipede) for the raids and the caves alike.

/**
 * Each kind joins at threat level `from` with `first` of them, gains one every `every` levels up to `most`, and stops
 * coming on its own after `until` (by then the big ones bring their own brood). Level 1 is the first raid and the top of
 * the caves; raids climb a level a wave, the caves a few levels a zone.
 */
export const LADDER = Object.freeze({
  brood: Object.freeze({ from: 1, first: 2, every: 2, most: 4, until: 6 }),
  crawler: Object.freeze({ from: 1, first: 1, every: 3, most: 4, until: 12 }),
  drone: Object.freeze({ from: 3, first: 1, every: 2, most: 4 }),
  brute: Object.freeze({ from: 5, first: 1, every: 3, most: 2 }),
  centipede: Object.freeze({ from: 7, first: 1, every: 5, most: 2 }),
  matron: Object.freeze({ from: 10, first: 1, every: 4, most: 2 }),
});
/** Biggest first. */
export const ROSTER_KINDS = Object.freeze(['matron', 'centipede', 'brute', 'drone', 'crawler', 'brood']);

/** How many of each kind come at threat `level`. */
export function roster(level) {
  return Object.fromEntries(ROSTER_KINDS.map(k => {
    const r = LADDER[k];
    return [k, level >= r.from && level <= (r.until ?? Infinity) ? Math.min(r.most, r.first + Math.floor((level - r.from) / r.every)) : 0];
  }));
}
export const rosterCount = r => ROSTER_KINDS.reduce((n, k) => n + (r[k] ?? 0), 0);

/** Each cave zone as a threat level: the upper caves match the early raids, the deepest a late one. */
export const CAVE_LEVELS = Object.freeze([2, 6, 11]);
/**
 * What hunts a cave zone besides the nests' own crawlers: the zone's level on the ladder, halved for the close quarters
 * (rounded up, so every kind on the ladder at that level still shows).
 */
export function caveRoster(zone) {
  const r = roster(CAVE_LEVELS[zone] ?? CAVE_LEVELS.at(-1));
  return Object.fromEntries(ROSTER_KINDS.map(k => [k, k === 'crawler' ? 0 : Math.ceil(r[k] / 2)]));
}
