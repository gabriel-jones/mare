// Which world a colony stands on. The planet is part of the seed: a Martian colony's seed is its lunar home's plus
// MARS_OFFSET, so everything seeded (ground, caves, deposits) is its own, and every pure function handed a seed knows
// where it is.
export const MARS_OFFSET = 2 ** 30;
export const PLANETS = Object.freeze({
  moon: Object.freeze({ name: 'the Moon', title: 'Moon', gravity: 1.62 }),
  mars: Object.freeze({ name: 'Mars', title: 'Mars', gravity: 3.71 }),
});
export const planetOf = seed => seed >= MARS_OFFSET ? 'mars' : 'moon';
export const homeSeed = seed => seed >= MARS_OFFSET ? seed - MARS_OFFSET : seed;
/** The seed of the colony on `planet` that belongs with the one seeded `seed`. */
export const seedOn = (seed, planet) => homeSeed(seed) + (planet === 'mars' ? MARS_OFFSET : 0);
export const onMars = state => planetOf(state.seed) === 'mars';
export const gravityOf = seed => PLANETS[planetOf(seed)].gravity;
