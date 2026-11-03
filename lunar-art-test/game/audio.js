/** Ambience: what the colony sounds like from inside the suit. Clips come from assets/audio (picked in
 * art-direction/sound-lab.html, installed by sound/install.py); soundMix turns the game's situation into a level
 * for each layer, and createAudio plays them through helmet and cave effects. */

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

export const LAYERS = ['day', 'dread', 'cave', 'skitter', 'habitat', 'mars'];
/** How each layer reaches the ear: outdoor sound is muffled by walls and rock. */
const ROUTE = { day: 'outdoor', mars: 'outdoor', dread: 'direct', cave: 'direct', skitter: 'cave3d', habitat: 'direct' };

/**
 * Levels (0..1) for every layer, grain densities, how open the outside is (1 = out on the surface) and the breathing
 * intensity target (0 calm, .5 exerted, 1 panic). Breathing is only heard underground.
 * `sun` is the sun's height (-1..1), `where` is 'surface' | 'habitat' | 'cave' | 'ship', `threat` (0..1) how close the
 * nearest creature is, `raid` whether one is on, `exert` (0..1) how long the player has been running, `hurt` (0..1) a
 * recent hit, `health` 0..100, `grabbed` whether a crawler has them.
 */
export function soundMix({ sun = 1, where = 'surface', mars = false, threat = 0, raid = false, exert = 0, hurt = 0, health = 100, grabbed = false }) {
  const day = smooth(-.05, .25, sun), night = 1 - day, raidLevel = raid ? 1 : 0;
  const level = Object.fromEntries(LAYERS.map(k => [k, 0]));
  let skitter = 1, open = 1;
  if (where === 'cave') {
    Object.assign(level, { cave: .9, skitter: .8 + .2 * threat, dread: .25 + .55 * threat });
    skitter = .5 + 2.5 * threat; open = 0;
  } else {
    level.day = (mars ? .55 : .85) * day * (1 - .7 * raidLevel);
    level.mars = mars ? 1 : 0;
    level.dread = clamp(.55 * night + .35 * raidLevel + .3 * threat);
    if (where === 'habitat' || where === 'ship') { level.habitat = where === 'ship' ? .7 : .9; open = 0; level.dread *= .45; }
  }
  const panic = Math.max(threat * .9, hurt, grabbed ? 1 : 0, health < 30 ? .7 : 0);
  const breath = Math.max(.5 * exert, panic > .05 ? .4 + .6 * panic : 0);
  return { level, density: { skitter }, open, breath, breathLevel: where === 'cave' ? 1 : 0 };
}

/** Effects that are your own body or kit: in vacuum they reach you only through the suit. */
const SELF = new Set(['step-ground', 'step-floor', 'land', 'roll', 'hurt', 'pistol', 'smg', 'rifle', 'flamer', 'rail-charge', 'rail', 'arc', 'swing', 'slash', 'reload', 'dry', 'parry', 'bite', 'build', 'dismantle']);
/** Relative level of each effect in the mix. */
const EFFECT_GAIN = { 'step-ground': .35, 'step-floor': .35, land: .6, roll: .5, hurt: .8, pistol: 1, smg: .9, rifle: 1, flamer: .7, 'rail-charge': .7,
  rail: 1, arc: .7, swing: .6, slash: .8, reload: .6, dry: .6, impact: .7, parry: .9, flare: .6, shriek: .9, lunge: .8, bite: .9, death: .8, hiss: .6,
  burst: .9, emerge: .7, build: .45, built: .7, place: .4, dismantle: .6, turret: .7, zap: .7, airlock: .6, dig: .5, hum: .35, launch: 1 };

/** How an effect reaches the ear. Out on the airless Moon your own actions come through the suit and everything else
 * only through the ground; habitats, caves, ships and Mars have air. The blueprint marker is a HUD sound. */
export function effectRoute(slot, where, mars = false) {
  if (where !== 'surface' || mars || slot === 'place') return 'air';
  return SELF.has(slot) ? 'suit' : 'ground';
}
/** Level for an effect `d` metres away: full within 3 m, fading out by 40 m. */
export const falloff = d => d <= 3 ? 1 : d >= 40 ? 0 : (1 / (1 + (d - 3) / 5)) * (1 - (d - 3) / 37);

const VOLUME_KEY = 'mare.audio.volume';

/** Starts silent; the first key press or click unlocks Web Audio and fetches the clips. */
export function createAudio(base = './assets/audio/') {
  let ctx = null, master = null, outdoor = null, muffle = null, layers = null, breath = null, manifest = null, effects = null, buses = null;
  let here = { where: 'surface', mars: false, x: 0, z: 0 };
  const voices = new Map(), loops = new Map();
  let volume = Number(localStorage.getItem(VOLUME_KEY) ?? .8);
  if (!(volume >= 0 && volume <= 1)) volume = .8;
  const biquad = (type, f, q = .7, g = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = g; return n; };

  function chain(kind) {
    const out = ctx.createGain();
    if (kind === 'outdoor') { out.connect(outdoor); return { input: out }; }
    out.connect(master);
    if (kind === 'helmet') {
      // Inside a helmet: no lows, boxy mids, a few milliseconds of visor reflection.
      const hp = biquad('highpass', 140), box = biquad('peaking', 1100, 1.2, 4), lp = biquad('lowpass', 7500), d = ctx.createDelay(.05), fb = ctx.createGain(), wet = ctx.createGain();
      d.delayTime.value = .007; fb.gain.value = .3; wet.gain.value = .35;
      hp.connect(box).connect(lp).connect(out); lp.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(out);
      return { input: hp };
    }
    if (kind === 'cave3d') {
      // Close rock walls: dense early reflections and a short tail.
      const input = ctx.createGain(), conv = ctx.createConvolver(), wet = ctx.createGain();
      const sr = ctx.sampleRate, len = sr * 1.1 | 0, ir = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / sr * 5.5) * .35;
        for (const [t, a] of [[.009, .7], [.014, .5], [.023, .45], [.031, .35], [.047, .3]]) d[(t * sr | 0) + ch * 41] += a;
      }
      conv.buffer = ir; wet.gain.value = .45;
      input.connect(out); input.connect(conv).connect(wet).connect(out);
      return { input, spatial: true };
    }
    return { input: out };
  }

  async function load(clip) {
    const buf = await ctx.decodeAudioData(await (await fetch(base + clip.file)).arrayBuffer());
    // AAC can decode with encoder priming silence in front; loop from the first real sample.
    const d = buf.getChannelData(0); let i = 0; while (i < Math.min(d.length, 8192) && Math.abs(d[i]) < 1e-6) i++;
    return { buf, start: i / buf.sampleRate, end: Math.min(buf.duration, i / buf.sampleRate + clip.duration) };
  }

  function loopLayer({ buf, start, end }, fx) {
    const g = ctx.createGain(), ch = chain(fx), src = ctx.createBufferSource();
    g.gain.value = 0; g.connect(ch.input);
    src.buffer = buf; src.loop = true; src.loopStart = start; src.loopEnd = end; src.connect(g);
    src.start(ctx.currentTime + .05, start);
    return { g, tick() {} };
  }

  /** Short slices of a recording at random intervals; in the cave they climb the walls around you. */
  function grainLayer({ buf, start, end }, fx, gap) {
    const g = ctx.createGain(), ch = chain(fx);
    g.gain.value = 0; g.connect(ch.input);
    let next = ctx.currentTime + .1;
    const layer = { g, density: 1, tick(now) {
      if (g.gain.value < .005 && next < now) { next = now + .2; return; }
      while (next < now + .4) {
        const span = end - start, len = span < 3 ? span : ch.spatial ? rand(1.5, Math.min(4, span)) : rand(.6, Math.min(2.6, span)), off = start + (span < 3 ? 0 : rand(0, span - len));
        const src = ctx.createBufferSource(), env = ctx.createGain(); src.buffer = buf;
        env.gain.setValueAtTime(0, next); env.gain.linearRampToValueAtTime(1, next + .012);
        env.gain.setValueAtTime(1, next + len - .03); env.gain.linearRampToValueAtTime(0, next + len);
        src.connect(env);
        if (ch.spatial) {
          const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.5;
          const a = rand(0, Math.PI * 2), r = rand(2, 6), da = rand(-.4, .4), y = rand(-1, 1);
          p.positionX.setValueAtTime(Math.sin(a) * r, next); p.positionZ.setValueAtTime(-Math.cos(a) * r, next); p.positionY.setValueAtTime(y, next);
          p.positionX.linearRampToValueAtTime(Math.sin(a + da) * r, next + len); p.positionZ.linearRampToValueAtTime(-Math.cos(a + da) * r, next + len);
          p.positionY.linearRampToValueAtTime(y + rand(1.5, 3), next + len);
          env.connect(p).connect(g);
        } else env.connect(g);
        src.start(next, off, len);
        next += len + rand(gap[0], gap[1]) / layer.density;
      }
    } };
    return layer;
  }

  async function boot() {
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    // Outside sound is heard through the suit; walls and rock muffle it to a low rumble.
    muffle = biquad('lowpass', 18000, .5); outdoor = ctx.createGain(); outdoor.connect(muffle).connect(master);
    manifest = await (await fetch(base + 'audio.json')).json();
    const c = manifest.clips, bufs = Object.fromEntries(await Promise.all(Object.keys(c).map(async k => [k, await load(c[k])])));
    layers = {};
    for (const k of LAYERS) {
      if (!c[k]) continue;
      const fx = ROUTE[k];
      layers[k] = c[k].loop ? loopLayer(bufs[k], fx) : grainLayer(bufs[k], fx, [1, 4]);
    }
    breath = ['calm', 'exerted', 'panic'].map(r => c[`breath.${r}`] && (c[`breath.${r}`].loop ? loopLayer(bufs[`breath.${r}`], 'helmet') : grainLayer(bufs[`breath.${r}`], 'helmet', [.25, .6])));
    buses = effectBuses();
    const sfx = await (await fetch(base + 'sfx.json')).json();
    effects = Object.fromEntries(await Promise.all(Object.entries(sfx.effects).map(async ([k, e]) => [k, { ...e, ...(await load(e)) }])));
  }

  function effectBuses() {
    const air = ctx.createGain(); air.connect(master);
    // Through the suit: the highs gone, the body thump up, a few milliseconds of helmet.
    const suit = biquad('highpass', 35), shelf = biquad('lowshelf', 160, .7, 6), lp = biquad('lowpass', 1500, .5), d = ctx.createDelay(.05), wet = ctx.createGain();
    d.delayTime.value = .006; wet.gain.value = .25;
    suit.connect(shelf).connect(lp).connect(master); lp.connect(d).connect(wet).connect(master);
    // No air to carry it: only what comes up through the regolith and your boots.
    const ground = biquad('lowpass', 260, .6), lp2 = biquad('lowpass', 260, .6), thump = biquad('lowshelf', 90, .7, 5), quiet = ctx.createGain();
    quiet.gain.value = .6; ground.connect(lp2).connect(thump).connect(quiet).connect(master);
    return { air, suit, ground };
  }
  const level = (slot, at) => (EFFECT_GAIN[slot] ?? 1) * (at ? falloff(Math.hypot(at.x - here.x, at.z - here.z)) : 1);

  let starting = null;
  function unlock() {
    if (!ctx) starting ??= boot().catch(e => { console.warn('Audio unavailable:', e); });
    else if (ctx.state === 'suspended') ctx.resume();
  }
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlock, { capture: true });

  let intensity = 0;
  const set = (gain, v, tc = .6) => gain.setTargetAtTime(v, ctx.currentTime, tc);
  return {
    get volume() { return volume; },
    setVolume(v) { volume = clamp(v); localStorage.setItem(VOLUME_KEY, String(volume)); if (master) set(master.gain, volume, .05); },
    /** Called every frame with the situation soundMix describes. */
    update(signals, dt) {
      if (!layers || ctx.state !== 'running') return;
      here = { where: signals.where ?? 'surface', mars: !!signals.mars, x: signals.x ?? 0, z: signals.z ?? 0 };
      const now = ctx.currentTime, mix = soundMix(signals);
      for (const [k, l] of Object.entries(layers)) {
        set(l.g.gain, mix.level[k], 1.2);
        if (k in mix.density) l.density = mix.density[k];
        l.tick(now);
      }
      set(muffle.frequency, mix.open ? 18000 : 380, .4);
      set(outdoor.gain, mix.open ? 1 : .35, .4);
      // Breathing eases toward its target: quick to panic, slow to calm down.
      intensity += (mix.breath - intensity) * clamp(dt * (mix.breath > intensity ? 2.5 : .35));
      const x = intensity, w = [clamp(1 - 2 * x), 1 - Math.abs(2 * x - 1), clamp(2 * x - 1)];
      breath.forEach((l, i) => { if (!l) return; set(l.g.gain, Math.sqrt(w[i]) * mix.breathLevel, .4); l.tick(now); });
    },
    /** One take of an effect, `at` a position in the player's space for distance; returns its source (stoppable) or null. */
    play(slot, { at = null, gain = 1 } = {}) {
      const e = effects?.[slot];
      if (!e || ctx.state !== 'running') return null;
      const v = level(slot, at) * gain, busy = voices.get(slot) ?? 0;
      if (v < .01 || busy >= 4) return null;
      const [a, b] = e.hits ? e.hits[Math.floor(Math.random() * e.hits.length)] : [0, e.duration];
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = e.buf; src.detune.value = rand(-100, 100); g.gain.value = v;
      src.connect(g).connect(buses[effectRoute(slot, here.where, here.mars)]);
      src.start(0, e.start + a, b - a);
      voices.set(slot, busy + 1); src.onended = () => { voices.set(slot, (voices.get(slot) ?? 1) - 1); g.disconnect(); };
      return src;
    },
    /** A looping effect held at `on` (0..1) every frame it should sound, e.g. a flamethrower while the trigger is down. */
    hold(slot, on, at = null) {
      const e = effects?.[slot];
      if (!e || ctx.state !== 'running') return;
      let l = loops.get(slot);
      if (!l && !on) return;
      if (!l) {
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = e.buf; src.loop = true; src.loopStart = e.start; src.loopEnd = e.end; g.gain.value = 0;
        src.connect(g); src.start(0, e.start); loops.set(slot, l = { g, route: null });
      }
      const route = effectRoute(slot, here.where, here.mars);
      if (route !== l.route) { l.g.disconnect(); l.g.connect(buses[route]); l.route = route; }
      set(l.g.gain, on * level(slot, at), on ? .04 : .12);
    },
    get credits() { return manifest?.credits ?? []; },
  };
}
