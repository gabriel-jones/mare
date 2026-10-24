// Pointer art. Fixed cursors are 32px SVG images, drawn with a dark keyline so they read on bright regolith and in
// black caves alike, and set through CSS so they never lag the mouse. Weapons get a live reticle instead.
const AMBER = '#edbd79', RED = '#ff6a55', SUIT = '#f2efe6', INK = '#0b0f14';

// Shapes drawn twice: once fat in ink for the outline, then in colour on top, so overlapping parts merge cleanly.
const filled = (shapes, fill, w = 3) => `<g fill="${INK}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
const lined = (shapes, colour, w = 2, ink = true) => `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${ink ? `<g stroke="${INK}" stroke-width="${w + 2.6}">${shapes}</g>` : ''}<g stroke="${colour}" stroke-width="${w}">${shapes}</g></g>`;

const brackets = '<path d="M7 12V7h5M20 7h5v5M25 20v5h-5M12 25H7v-5"/>';
const fingers = '<rect x="9" y="8.5" width="3.6" height="10" rx="1.8"/><rect x="12.7" y="6" width="3.6" height="12" rx="1.8"/><rect x="16.4" y="6.5" width="3.6" height="12" rx="1.8"/><rect x="20.1" y="9" width="3.4" height="10" rx="1.7"/>';
const palm = '<rect x="9" y="14" width="14.5" height="12.5" rx="4.5"/>';

export const CURSOR_ART = {
  // The everyday pointer: a pale arrow, its tip touched with amber.
  explore: { at: [5, 4], fallback: 'default', svg: filled('<path d="M5 4v20l5.2-4.6 3.6 7.6 3.4-1.6-3.6-7.4H21z"/>', SUIT) + filled('<path d="M5 4v6.4L10.3 8z"/>', AMBER, 0) },
  // A blueprint landing on a cell: corner brackets and a centre pin.
  build: { at: [16, 16], fallback: 'crosshair', svg: lined(brackets, AMBER) + filled('<circle cx="16" cy="16" r="1.7"/>', AMBER, 2.4) },
  blocked: { at: [16, 16], fallback: 'not-allowed', svg: lined(brackets, RED) + lined('<path d="M13 13l6 6M19 13l-6 6"/>', RED, 2.2) },
  // Allowed, but past every crate's logistics area: the brackets broken open, a crate struck through inside.
  far: { at: [16, 16], fallback: 'crosshair', svg: lined('<path d="M7 11V7h4M21 7h4v4M25 21v4h-4M11 25H7v-4"/>', AMBER) + lined('<rect x="12" y="12.5" width="8" height="7" rx="1"/><path d="M12 15.5h8"/>', SUIT, 1.6) + lined('<path d="M10.5 22 21.5 10"/>', RED, 1.8) },
  // Over a blueprint, or while building one: a mallet, struck at the head.
  construct: { at: [21, 8], fallback: 'pointer', svg: lined('<path d="M18.5 12.5 6 25"/>', SUIT, 3.2) + filled('<rect x="14" y="4.5" width="14" height="6.5" rx="1.4" transform="rotate(45 21 7.75)"/>', AMBER, 2.6) },
  // A pry bar, claw first.
  dismantle: { at: [4, 4], fallback: 'crosshair', svg: lined('<path d="M7 7 23.5 23.5q2.4 2.6-.2 4.6"/>', RED, 3) + lined('<path d="M8.5 8.5 3.5 6.5M8.5 8.5 6.5 3.5"/>', RED, 2.2) },
  // Staking a claim: the flag's foot is the point.
  mine: { at: [7, 28], fallback: 'crosshair', svg: filled('<path d="M8 5.5 25 10 8 14.5z"/>', AMBER, 2.6) + lined('<path d="M7 28V4.5"/>', SUIT, 2) },
  // Suit gloves for the pack and crates: open to pick up, closed while carrying.
  grab: { at: [16, 14], fallback: 'grab', svg: filled(fingers + palm + '<rect x="4.8" y="15.5" width="3.6" height="9" rx="1.8" transform="rotate(-32 6.6 20)"/>', SUIT) + lined('<path d="M10 25.5h12"/>', AMBER, 2) },
  grabbing: { at: [16, 14], fallback: 'grabbing', svg: filled('<rect x="8.5" y="10" width="15.5" height="16" rx="5"/><circle cx="10.9" cy="11.4" r="2.3"/><circle cx="14.6" cy="10.6" r="2.3"/><circle cx="18.3" cy="10.6" r="2.3"/><circle cx="21.8" cy="11.4" r="2.2"/>', SUIT) + lined('<path d="M12.7 12.4v3M16.4 12v3M20 12.4v3"/>', '#b9b4a8', .9, false) + lined('<path d="M10 25.5h12"/>', AMBER, 2) },
};

const url = svg => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${svg}</svg>`)}")`;
export const cursorCSS = name => { const c = CURSOR_ART[name]; return `${url(c.svg)} ${c.at[0]} ${c.at[1]}, ${c.fallback}`; };

/** Adds the cursor rules once. The game canvas picks one through `data-cursor`; `none` hands over to the reticle. */
export function installCursors() {
  if (document.getElementById('game-cursors')) return;
  const style = document.createElement('style'); style.id = 'game-cursors';
  style.textContent = ['explore', 'build', 'blocked', 'far', 'construct', 'dismantle', 'mine'].map(n => `#game[data-cursor=${n}]{cursor:${cursorCSS(n)}}`).join('\n')
    + `\n#game[data-cursor=none]{cursor:none}`
    + `\n.game-ui .slot:has(.slot-icon img){cursor:${cursorCSS('grab')}}`
    + `\n.game-ui.slot-dragging,.game-ui.slot-dragging *{cursor:${cursorCSS('grabbing')}!important}`;
  document.head.append(style);
}

const NS = 'http://www.w3.org/2000/svg', R = 22;
const arc = (a0, a1) => {
  const p = a => `${(Math.sin(a) * R).toFixed(2)} ${(-Math.cos(a) * R).toFixed(2)}`;
  return `M${p(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
};

/**
 * The weapon reticle, following the mouse. Guns: four ticks that kick open on every shot and settle back, the
 * magazine as segments round the rim, and a sweep while reloading. Flamethrower: a ring that flares while spraying,
 * with the tank as an arc. It dims when the aim is past the weapon's reach.
 */
export function createReticle(parent = document.body) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('class', 'reticle'); el.setAttribute('viewBox', '-40 -40 80 80'); el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<g class="ammo"></g><path class="reload" d="${arc(0, Math.PI * 2 - .001)}" pathLength="1"/>
    <g class="ticks">${[0, 90, 180, 270].map(a => `<g transform="rotate(${a})"><line class="under"/><line class="tick"/></g>`).join('')}</g>
    <circle class="flame-under" r="13"/><circle class="flame" r="13"/><circle class="dot-under" r="2.4"/><circle class="dot" r="1.5"/>`;
  parent.append(el);
  const ammo = el.querySelector('.ammo'), reloadArc = el.querySelector('.reload'), lines = [...el.querySelectorAll('.ticks line')];
  let weapon = null, segments = [], tank = null, kick = 0, lastLoaded = null, gap = -1, x = -100, y = -100, shown = false, lastFuel = -1;

  function build(w, magazine) {
    weapon = w; segments = []; tank = null; lastFuel = -1; ammo.textContent = '';
    if (w === 'flamethrower') {
      ammo.innerHTML = `<path class="seg rim" d="${arc(0, Math.PI * 2 - .001)}"/><path class="seg on"/>`; tank = ammo.lastChild;
      return;
    }
    const step = Math.PI * 2 / magazine, pad = Math.min(.09, step * .22);
    for (let i = 0; i < magazine; i++) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'seg'); p.setAttribute('d', arc(i * step + pad, (i + 1) * step - pad));
      ammo.append(p); segments.push(p);
    }
  }
  const move = (cx, cy) => { x = cx; y = cy; if (shown) el.style.transform = `translate(${x - 40}px,${y - 40}px)`; };
  /** `s` is null to hide, or { weapon, magazine, loaded, reload (0..1, null when not reloading), far, spraying }. */
  function update(s, dt) {
    el.classList.toggle('shown', !!s);
    if (!s) { shown = false; return; }
    if (!shown) { shown = true; move(x, y); }
    if (s.weapon !== weapon) { build(s.weapon, s.magazine); lastLoaded = s.loaded; kick = 0; }
    const flame = s.weapon === 'flamethrower';
    if (!flame && s.loaded < lastLoaded) kick = Math.min(1.6, kick + (s.weapon === 'rifle' ? .55 : .9));
    lastLoaded = s.loaded; kick *= Math.exp(-dt * 7);
    el.classList.toggle('flamer', flame); el.classList.toggle('far', !!s.far); el.classList.toggle('spraying', !!s.spraying);
    el.classList.toggle('reloading', s.reload != null); el.classList.toggle('empty', !s.loaded && s.reload == null);
    if (s.reload != null) reloadArc.style.strokeDasharray = `${s.reload.toFixed(3)} 1`;
    if (flame) {
      const f = Math.round(s.loaded / s.magazine * 200) / 200;
      if (f !== lastFuel) { lastFuel = f; tank.setAttribute('d', f > 0 ? arc(0, Math.max(.02, f * Math.PI * 2 - .001)) : ''); }
      return;
    }
    segments.forEach((p, i) => p.classList.toggle('on', i < s.loaded));
    const g = Math.round(((s.weapon === 'rifle' ? 5 : 6.5) + kick * 9) * 4) / 4;
    if (g === gap) return; gap = g;
    for (let i = 0; i < lines.length; i++) { lines[i].setAttribute('y1', -g); lines[i].setAttribute('y2', -g - 6.5); }
  }
  return { move, update, dispose: () => el.remove() };
}
