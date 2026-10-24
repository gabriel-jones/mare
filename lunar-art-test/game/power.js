/**
 * Power beyond solar, batteries and the reactor. Pure and serializable, like the rest of the sim.
 *
 * Fuel cells burn tank propellant back into power once the batteries run down. They return less than
 * electrolysis spent making it, so propellant is a lossy night store, never a free source.
 * Thermal stores are batteries whose size is the regolith packed into them (rovers and belts deliver it).
 * An RTG gives a little, forever. A goo bioreactor gives a lot while it is fed black goo; starve a live
 * culture and it breaches like a vat (goo.js runs it).
 */
export const FUELCELL = Object.freeze({ power: 6, yield: 4, reserve: .1 });
export const THERMAL = Object.freeze({ cap: 40, perLoad: 12 });
export const RTG_POWER = 2;
export const BIO = Object.freeze({ power: 12, burn: 40, cap: 6, starveAfter: 30 });

export function ensurePower(b) {
  if (!b.built) return b;
  if (b.type === 'fuelcell') b.on ??= false;
  if (b.type === 'thermal') b.inv ??= { regolith: 0 };
  if (b.type === 'bioreactor') { b.fed ??= false; b.stock ??= 0; b.burn ??= 0; b.starve ??= 0; }
  return b;
}

/** Steady generation from RTGs and fed bioreactors, in kW. */
export function steadyGeneration(state) {
  let kw = 0;
  for (const b of state.buildings) {
    if (!b.built) continue;
    if (b.type === 'rtg') kw += RTG_POWER;
    if (b.type === 'bioreactor' && b.fed && b.stock > 0) kw += BIO.power;
  }
  return kw;
}
export const thermalCapacity = state => state.buildings.reduce((kj, b) => kj + (b.built && b.type === 'thermal' ? (b.inv?.regolith ?? 0) * THERMAL.perLoad : 0), 0);
export const fuelCells = state => state.buildings.filter(b => b.built && b.type === 'fuelcell');
const propellant = state => state.buildings.filter(b => b.built && b.type === 'tank');
export const fuelBurning = state => fuelCells(state).some(b => b.on);

/**
 * Fuel cells cover what the grid is short once the batteries are down to their reserve, and keep at it
 * until the other sources could also carry the electrolysers, so the two never fight. Returns kW added.
 */
export function stepFuelCells(state, dt, { generation, demand, stored, capacity }) {
  const cells = fuelCells(state);
  if (!cells.length) return 0;
  const fuel = propellant(state).reduce((s, t) => s + (t.fuel ?? 0), 0);
  const electrolysers = state.buildings.filter(b => b.built && b.type === 'electrolyser').length * 3;
  let on = cells.some(b => b.on);
  if (dt > 0) {
    if (!on && demand > generation && stored <= capacity * FUELCELL.reserve) on = true;
    if (on && (generation >= demand + electrolysers || fuel <= 0)) on = false;
    for (const b of cells) b.on = on;
  }
  if (!on || dt <= 0) return 0;
  const kw = Math.max(0, Math.min(cells.length * FUELCELL.power, demand - generation, fuel * FUELCELL.yield / dt));
  let burn = kw * dt / FUELCELL.yield;
  for (const t of propellant(state).sort((p, q) => q.fuel - p.fuel)) {
    const n = Math.min(t.fuel, burn); t.fuel -= n; burn -= n;
    if (burn <= 0) break;
  }
  return kw;
}