import { BRANCHES, RESEARCH_PER_SATELLITE, TECHS, hasSchematic, missingFor, techDone } from './space.js';

/** Depth in its branch: one more than its deepest prerequisite. */
const depth = id => Math.max(-1, ...(TECHS[id].requires ?? []).map(depth)) + 1;
const ICON_URL = id => new URL(`./assets/research/${id}.png`, import.meta.url).href;
const COL = 190, ROW = 150, PAD = 24;

/**
 * The research tree, full screen: one band per branch, each tech a card with its render (assets/research/), joined to
 * what it needs. Click a card to research it. Points come from satellites in orbit and finds studied at the xeno lab.
 */
export function createResearchView(callbacks = {}) {
  const root = document.createElement('section');
  root.className = 'research-view'; root.hidden = true; root.setAttribute('aria-label', 'Research');
  // Lay the tree out once: x from depth, y from order within each depth of the branch.
  const place = {}, bands = [];
  let top = 0;
  for (const [branch, title] of Object.entries(BRANCHES)) {
    const ids = Object.keys(TECHS).filter(id => TECHS[id].branch === branch), rows = {};
    for (const id of ids) { const d = depth(id); rows[d] ??= 0; place[id] = { x: PAD + d * COL, y: top + 34 + rows[d]++ * ROW }; }
    const height = 34 + Math.max(1, ...Object.values(rows)) * ROW;
    bands.push({ title, top, height }); top += height + 14;
  }
  const width = PAD * 2 + Math.max(...Object.values(place).map(p => p.x)) + COL, height = top;
  const links = Object.entries(TECHS).flatMap(([id, t]) => (t.requires ?? []).map(r => ({ from: r, to: id })));
  const path = ({ from, to }) => { const a = place[from], b = place[to], x0 = a.x + 158, y0 = a.y + 62, x1 = b.x, y1 = b.y + 62, m = (x0 + x1) / 2; return `M${x0} ${y0}C${m} ${y0} ${m} ${y1} ${x1} ${y1}`; };
  root.innerHTML = `<header class="research-head"><div><small>Colony research</small><h2>Research</h2></div>
      <div class="research-stats"><span>Points <strong data-research="bank">0</strong></span><span>Rate <strong data-research="rate">0</strong><small>pts / min</small></span></div>
      <button type="button" class="research-close" data-research-action="close" aria-label="Close research" title="Close (T)">×</button></header>
    <div class="research-scroll"><div class="research-tree" style="width:${width}px;height:${height}px">
      ${bands.map(b => `<div class="research-band" style="top:${b.top}px;height:${b.height}px"><h3>${b.title}</h3></div>`).join('')}
      <svg class="research-links" width="${width}" height="${height}" aria-hidden="true">${links.map(l => `<path data-link="${l.from}>${l.to}" d="${path(l)}"/>`).join('')}</svg>
      ${Object.entries(TECHS).map(([id, t]) => `<button type="button" class="research-node" data-tech="${id}" style="left:${place[id].x}px;top:${place[id].y}px">
        <img src="${ICON_URL(id)}" alt="" draggable="false" onerror="this.style.visibility='hidden'"><strong>${t.name}</strong><small></small><span class="research-bar"><i></i></span></button>`).join('')}
    </div></div>
    <p class="research-foot">Points come from satellites in orbit and finds studied at the xeno lab.</p>`;
  document.body.append(root);
  const nodes = Object.fromEntries([...root.querySelectorAll('[data-tech]')].map(el => [el.dataset.tech, el]));
  const field = name => root.querySelector(`[data-research="${name}"]`);
  let key = '';
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.researchAction === 'close') api.close();
    else if (b.dataset.tech) callbacks.onResearch?.(b.dataset.tech);
    b.blur();
  });
  const stateOf = (state, id) => techDone(state, id) ? 'done' : state.research.selected === id ? 'active' : !hasSchematic(state, id) ? 'hidden' : missingFor(state, id).length ? 'locked' : 'open';
  const api = {
    get open() { return !root.hidden; },
    show() { root.hidden = false; document.body.dataset.research = 'open'; key = ''; },
    close() { if (root.hidden) return; root.hidden = true; delete document.body.dataset.research; callbacks.onClose?.(); },
    toggle() { root.hidden ? api.show() : api.close(); },
    update(state) {
      if (root.hidden) return;
      const r = state.research;
      field('bank').textContent = Math.floor(r.bank);
      field('rate').textContent = (state.satellites * RESEARCH_PER_SATELLITE).toFixed(1);
      const next = JSON.stringify([r.selected, r.done, state.blueprints ?? []]);
      if (next !== key) {
        key = next;
        for (const [id, el] of Object.entries(nodes)) {
          const s = stateOf(state, id), t = TECHS[id];
          el.dataset.state = s; el.disabled = s === 'done' || s === 'hidden' || s === 'locked';
          el.querySelector('small').textContent = s === 'done' ? 'Researched' : s === 'hidden' ? 'Needs a schematic from deep in the caves' : s === 'locked' ? `Needs ${missingFor(state, id).map(m => TECHS[m].name).join(', ')}` : t.description;
          el.title = t.description;
        }
        for (const p of root.querySelectorAll('[data-link]')) { const [from, to] = p.dataset.link.split('>'); p.dataset.state = techDone(state, to) ? 'done' : techDone(state, from) ? 'open' : 'locked'; }
      }
      for (const [id, el] of Object.entries(nodes)) {
        const done = techDone(state, id), progress = done ? 1 : Math.min(1, (r.progress[id] ?? 0) / TECHS[id].cost);
        el.querySelector('.research-bar i').style.transform = `scaleX(${progress})`;
        el.querySelector('.research-bar').dataset.label = done ? '' : `${Math.floor(r.progress[id] ?? 0)} / ${TECHS[id].cost}`;
      }
    },
    dispose() { root.remove(); },
  };
  return api;
}
