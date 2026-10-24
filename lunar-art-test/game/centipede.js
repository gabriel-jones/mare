// Centipede movement, no rendering. The head steers; every segment follows the exact path the head took (its trail),
// so when the head dives into the ground the body pours in after it, and when it bursts out the body uncoils from the
// same hole. `y` is the head's height relative to its walking height: below -1 it is underground.

export const CENTIPEDE = Object.freeze({
  hp: 420, speed: 3.4, turn: 2.8, weave: .45,
  depth: 2.4, dive: 38 * Math.PI / 180, diveSpeed: 4.2, underSpeed: 9, riseSpeed: 6.5, rear: 2.1, rearTime: .8, slam: 7,
  pop: [6, 12], step: .08,
  // On the hunt: it rears over prey within `strikeRange` and comes down on it, lunging up to `lunge` metres; prey
  // further than `burrowFrom` (or out of its way) it goes under for, and bursts up `beside` metres from it.
  strikeRange: 3.4, strikeEvery: 3.6, lunge: 3.6, slamRadius: 1.5, slamDamage: 20, erupt: 14, eruptRadius: 1.7,
  burrowFrom: 9, burrowEvery: [6, 10], beside: [1.2, 2.2], part: 1.1,
});
/** The look the game uses: the lab's needle centipede, freakier than the lab's default. */
export const SHAPE = Object.freeze({ style: 'needle', segments: 18, spacing: .55, gait: 'scuttle', freak: 1.1 });
const between = (rng, [a, b]) => a + (b - a) * rng();

/**
 * `gait`: 'ripple' glides, 'scuttle' freezes and darts, 'lurch' moves in sudden surges. `under`: it starts dug in,
 * tunnelling toward `popAt`.
 */
export function createCentipede(x, z, { segments = 20, spacing = .5, gait = 'scuttle', facing = 0, under = false, popAt = null } = {}) {
  const y = under ? -CENTIPEDE.depth : 0;
  const c = { kind: 'centipede', size: 1, x, y, z, facing, state: under ? 'under' : 'crawl', t: 0, goal: null, speed: 0, pace: 1, segments, spacing, gait, trail: [], hp: CENTIPEDE.hp, go: true, goT: 0, surge: 0, popAt, body: [] };
  const back = { x: -Math.sin(facing), z: -Math.cos(facing) };
  for (let d = 0; d <= segments * spacing + 2; d += CENTIPEDE.step) c.trail.push({ x: x + back.x * d, y, z: z + back.z * d });
  if (under && !popAt) c.popAt = { x, z };
  parts(c);
  return c;
}

/** The point `s` metres back along the body from the head. */
export function along(c, s, out = { x: 0, y: 0, z: 0 }) {
  let left = s, a = c;
  for (let i = 0; i < c.trail.length; i++) {
    const b = c.trail[i], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (d >= left && d > 1e-6) { const k = left / d; out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k; return out; }
    left -= d; a = b;
  }
  out.x = a.x; out.y = a.y; out.z = a.z; return out;
}
const tail = c => along(c, c.segments * c.spacing);
/** The body above ground, every `part` metres from head to tail: where a shot or a blade can find it. */
function parts(c) {
  const out = [], p = { x: 0, y: 0, z: 0 };
  for (let s = 0; s <= c.segments * c.spacing; s += CENTIPEDE.part) { along(c, s, p); if (p.y > -.5) out.push({ x: p.x, z: p.z }); }
  c.body = out;
}

function record(c) {
  const h = c.trail[0];
  if (Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z) >= CENTIPEDE.step) c.trail.unshift({ x: c.x, y: c.y, z: c.z });
  // Keep just enough trail for the whole body, and a little more.
  let length = 0;
  for (let i = 1; i < c.trail.length; i++) {
    const a = c.trail[i - 1], b = c.trail[i];
    length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (length > c.segments * c.spacing + 3) { c.trail.length = i + 1; break; }
  }
}
function steer(c, to, dt, rate = CENTIPEDE.turn) {
  let d = to - c.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
  c.facing += Math.max(-rate * dt, Math.min(rate * dt, d));
}
function forward(c, distance) { c.x += Math.sin(c.facing) * distance; c.z += Math.cos(c.facing) * distance; }
function enter(c, state) { c.state = state; c.t = 0; }

/** Dig in where it stands and come up at `to` ({x, z}). Ignored unless it is crawling. */
export function burrow(c, to) {
  if (c.state !== 'crawl') return false;
  c.popAt = { x: to.x, z: to.z }; enter(c, 'dive'); return true;
}
/** Rear up over its prey, then slam down on it. */
export function rear(c) {
  if (c.state !== 'crawl') return false;
  enter(c, 'rise'); c.rising = 'strike'; return true;
}
/** A spot `pop` metres away to come up at, around `near` if given. */
export function popSpot(c, near = null, rng = Math.random) {
  const a = rng() * Math.PI * 2, r = near ? 2 + rng() * 3 : CENTIPEDE.pop[0] + rng() * (CENTIPEDE.pop[1] - CENTIPEDE.pop[0]), o = near ?? c;
  return { x: o.x + Math.sin(a) * r, z: o.z + Math.cos(a) * r };
}

/**
 * Advance it `dt` seconds. `env.goal` ({x, z}) is where it heads while crawling; `env.rng` its randomness;
 * `env.open(x, z)`, if given, whether the head can go there above ground (underground it digs through anything).
 * Returns events: dive {x, z} as it breaks the ground going in, surface {x, z} as it bursts out, slam {x, z}.
 */
export function stepCentipede(c, dt, env = {}) {
  const events = [], rng = env.rng ?? Math.random, C = CENTIPEDE, open = env.open ?? (() => true);
  c.t += dt;
  const goal = env.goal ?? c.goal, toGoal = goal ? Math.atan2(goal.x - c.x, goal.z - c.z) : c.facing;
  const ahead = d => open(c.x + Math.sin(c.facing) * d, c.z + Math.cos(c.facing) * d);
  switch (c.state) {
    case 'dead':
      // Whatever it was doing, it drops where it is.
      c.speed = 0; if (c.y > 0) c.y = Math.max(0, c.y - 6 * dt);
      break;
    case 'crawl': {
      // Gaits: a steady glide, or stop-start like the crawler, or long holds broken by sudden surges.
      c.goT -= dt;
      if (c.goT <= 0) {
        if (c.gait === 'scuttle') { c.go = !c.go; c.goT = c.go ? .25 + rng() * .5 : .08 + rng() * .3; }
        else if (c.gait === 'lurch') { c.surge = rng() < .35 ? 1 : 0; c.goT = c.surge ? .3 + rng() * .3 : .5 + rng() * 1.1; }
        else c.goT = 1;
      }
      const gait = c.gait === 'scuttle' ? (c.go ? 1.35 : .05) : c.gait === 'lurch' ? (c.surge ? 2.1 : .35) : 1;
      const weave = Math.sin(c.t * 2.1 + c.trail.length * .01) * C.weave;
      const want = goal && Math.hypot(goal.x - c.x, goal.z - c.z) > .5 ? C.speed * c.pace * gait : 0;
      c.speed += (want - c.speed) * Math.min(1, dt * (c.gait === 'ripple' ? 4 : 14));
      // Up against rock or a wall it feels its way round, and counts how long it has been stuck.
      const blocked = !ahead(.6);
      steer(c, toGoal + (blocked ? 1.4 * (c.side ??= rng() < .5 ? -1 : 1) : weave), dt, C.turn * (blocked ? 2.5 : c.gait === 'lurch' && c.surge ? 1.8 : 1));
      if (ahead(.6)) { forward(c, c.speed * dt); c.stuck = Math.max(0, (c.stuck ?? 0) - dt); }
      else { c.speed *= .5; c.stuck = (c.stuck ?? 0) + dt; if (c.stuck > 2.5) c.side = -c.side; }
      c.y += (0 - c.y) * Math.min(1, dt * 6);
      break;
    }
    case 'dive': {
      // Head down into the ground at a steep angle; the trail carries the body in after it.
      const v = C.diveSpeed * c.pace;
      steer(c, Math.atan2(c.popAt.x - c.x, c.popAt.z - c.z), dt, 1.2);
      forward(c, v * Math.cos(C.dive) * dt); c.y -= v * Math.sin(C.dive) * dt; c.speed = v;
      if (c.t < dt * 1.5) events.push({ type: 'dive', x: c.x + Math.sin(c.facing) * 1.2, z: c.z + Math.cos(c.facing) * 1.2 });
      if (c.y <= -C.depth) { c.y = -C.depth; enter(c, 'under'); }
      break;
    }
    case 'under': {
      // Tunnelling to the spot; it circles under it until the tail is in.
      const dx = c.popAt.x - c.x, dz = c.popAt.z - c.z, d = Math.hypot(dx, dz), v = C.underSpeed * c.pace;
      steer(c, d > 1.5 ? Math.atan2(dx, dz) : c.facing + 1.6, dt, 4);
      forward(c, v * dt); c.speed = v;
      if (d < 1.6 && tail(c).y < -1.2) { enter(c, 'rise'); c.rising = 'surface'; c.broke = false; }
      break;
    }
    case 'rise': {
      // Straight up out of the ground (or off it, to strike), slowing as it reaches full height.
      const v = C.riseSpeed * c.pace * Math.max(.25, 1 - Math.max(0, c.y) / C.rear);
      if (goal) steer(c, toGoal, dt, 2);
      c.y += v * dt; forward(c, .5 * dt); c.speed = v;
      if (c.rising === 'surface' && !c.broke && c.y > -.9) { c.broke = true; events.push({ type: 'surface', x: c.x, z: c.z }); }
      if (c.y >= C.rear) { c.y = C.rear; enter(c, 'rear'); }
      break;
    }
    case 'rear':
      // Swaying over its prey, then it comes down hard.
      if (goal) steer(c, toGoal, dt, 3);
      c.speed = 0;
      if (c.t >= C.rearTime) {
        // It comes down on where its prey stands now, if that is within a lunge; otherwise just ahead.
        const reach = goal ? Math.hypot(goal.x - c.x, goal.z - c.z) - .2 : 1;
        enter(c, 'slam'); c.reach = Math.max(.4, Math.min(C.lunge, reach));
      }
      break;
    case 'slam': {
      if (ahead(.5)) forward(c, (c.reach ?? 1) * C.slam / C.rear * dt);
      c.y -= C.slam * dt; c.speed = C.slam;
      if (c.y <= 0) { c.y = 0; enter(c, 'crawl'); events.push({ type: 'slam', x: c.x, z: c.z }); }
      break;
    }
  }
  record(c); parts(c);
  return events;
}

/** A spot `beside` metres from `near` that it can come up at, or null if there is none. */
function popNear(near, open, rng) {
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2, r = between(rng, CENTIPEDE.beside), at = { x: near.x + Math.sin(a) * r, z: near.z + Math.cos(a) * r };
    if (!open || open(at.x, at.z)) return at;
  }
  return null;
}
/**
 * A centipede on the hunt. `env`: {prey: {x, z, invulnerable} or null, goal: {x, z} to head for without prey, open,
 * rng}. It closes on its prey, rears over it and comes down on it; prey far off, or out of its way round rock, it goes
 * under for, tracking it through the ground, and bursts up beside it. Returns stepCentipede's events, and strike
 * {damage, x, z} for each blow that lands on the prey.
 */
export function huntCentipede(c, dt, env = {}) {
  const C = CENTIPEDE, rng = env.rng ?? Math.random, prey = env.prey ?? null, open = env.open ?? null, events = [];
  c.strikeCool = Math.max(0, (c.strikeCool ?? 0) - dt);
  c.burrowCool = (c.burrowCool ?? between(rng, C.burrowEvery) * .5) - dt;
  // Held in an arc's current it convulses where it is.
  if (c.shocked > 0 && c.state === 'crawl') { c.speed = 0; return events; }
  const target = prey ?? env.goal ?? null;
  let goal = target;
  if (c.state === 'crawl' && target) {
    const d = Math.hypot(target.x - c.x, target.z - c.z);
    if (prey && d < C.strikeRange && c.strikeCool <= 0) { rear(c); c.strikeCool = C.strikeEvery; }
    else if ((d > C.burrowFrom && c.burrowCool <= 0) || (c.stuck ?? 0) > 1.5) {
      const spot = popNear(target, open, rng);
      if (spot) { burrow(c, spot); c.burrowCool = between(rng, C.burrowEvery); c.stuck = 0; c.offset = { x: spot.x - target.x, z: spot.z - target.z }; }
    }
    // Between strikes it circles its prey close in, out of reach of a blade.
    else if (prey && d < 4.5) { const a = Math.atan2(c.x - prey.x, c.z - prey.z) + .9; goal = { x: prey.x + Math.sin(a) * 3.6, z: prey.z + Math.cos(a) * 3.6 }; }
  }
  // Under the ground it follows its prey, to come up beside wherever it has got to; the last few metres it commits,
  // so a dash or a roll as the ground cracks open toward you carries you clear.
  if ((c.state === 'under' || c.state === 'dive') && target && c.offset && Math.hypot(c.popAt.x - c.x, c.popAt.z - c.z) > 4) {
    const at = { x: target.x + c.offset.x, z: target.z + c.offset.z };
    if (!open || open(at.x, at.z)) c.popAt = at;
  }
  for (const e of stepCentipede(c, dt, { goal, rng, open })) {
    events.push(e);
    if (e.type === 'surface') c.strikeCool = C.strikeEvery;
    const blow = e.type === 'surface' ? [C.erupt, C.eruptRadius] : e.type === 'slam' ? [C.slamDamage, C.slamRadius] : null;
    if (blow && prey && !prey.invulnerable && Math.hypot(prey.x - e.x, prey.z - e.z) < blow[1]) events.push({ type: 'strike', damage: blow[0], x: e.x, z: e.z, how: e.type });
  }
  if (c.state === 'crawl' && c.t < dt * 1.5) c.offset = null;
  return events;
}

/** A saved centipede comes back stretched out straight behind its head, wherever it was. */
export function restoreCentipede(raw) {
  const c = createCentipede(raw.x, raw.z, { ...SHAPE, facing: Number.isFinite(raw.facing) ? raw.facing : 0 });
  c.hp = Math.min(raw.hp, CENTIPEDE.hp);
  return c;
}
