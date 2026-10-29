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

const VOLUME_KEY = 'mare.audio.volume';

/** Starts silent; the first key press or click unlocks Web Audio and fetches the clips. */
export function createAudio(base = './assets/audio/') {
  let ctx = null, master = null, outdoor = null, muffle = null, layers = null, breath = null, manifest = null;
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
  }

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
    get credits() { return manifest?.credits ?? []; },
  };
}
