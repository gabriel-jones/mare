import { DEFS } from './sim.js';
import { ITEM_INFO } from './defs.js';
import { count } from './inventory.js';
import { hunger, galleyRecipe } from './life.js';
import { BUFFS, CROPS, RECIPES, cropsFor, isGrower, recipeKnown } from './farm.js';
import { infested } from './goo.js';
import { ARMORY, WEAPONS, armoryKnown } from './arms.js';
import { TECHS } from './space.js';
import { robotStatus, lampLevel } from './building-status.js';
import { areaKind, remainingRegolith, MAX_MINING_AREAS } from './production.js';
import { available, canPay, crates, ledger, usedSlots, CRATE_SLOTS } from './storage.js';
import { tagOf } from './defs.js';

const ICONS = {
  solar: '<path d="M4 4h16l2 13H2L4 4Zm8 0v13M3 10h18M8 17l-1 4m9-4 1 4M6 21h12"/>',
  battery: '<path d="M9 3h6v3H9zM6 6h12v16H6zM13 9l-3 5h4l-3 5"/>',
  hopper: '<path d="M3 4h18l-5 10v6l-8 2v-8L3 4Zm2 5h14"/>',
  habitat: '<path d="m3 9 9-6 9 6v12H3V9Zm6 12v-8h6v8M3 9h18"/>',
  greenhouse: '<path d="M3 21V10l9-6 9 6v11Zm0-6h18M9 7v14m6-14v14"/>',
  airlock: '<path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M3 21h18M12 3v18"/><path d="m8 12-2 0m10 0 2 0"/>',
  growbed: '<path d="M3 15h18l-2 6H5ZM12 15V8m0 3c-3 0-4-2-4-4 3 0 4 2 4 4Zm0-2c0-3 2-4 4-4 0 3-2 4-4 4Z"/>',
  galley: '<path d="M3 11h18v10H3ZM3 15h18M8 7c0-2 2-2 2-4m4 4c0-2 2-2 2-4"/>',
  hydrorack: '<path d="M5 3v18M19 3v18M5 8h14M5 14h14M5 20h14"/><path d="M9 8c0-2 1-3 2-3m3 3c0-2 1-3 2-3M9 14c0-2 1-3 2-3m3 3c0-2 1-3 2-3"/>',
  verticalfarm: '<path d="M7 2h10v20H7ZM7 7h10M7 12h10M7 17h10"/><path d="M10 7V5m4 2V5m-4 7v-2m4 2v-2m-4 7v-2m4 2v-2"/>',
  mushroomtray: '<path d="M3 18h18v3H3Z"/><path d="M5 14a3 3 0 0 1 6 0Zm2 0v4m6-6a4 4 0 0 1 8 0Zm4 0v6"/>',
  armory: '<path d="M3 20h18M5 20v-7h14v7"/><path d="M4 9h11l2-2h3v3h-3l-2 2H4Z"/><path d="M7 11v2"/>',
  goovat: '<path d="M6 6h12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z"/><path d="M5 3h14v3H5ZM6 13c2-1.5 4 1.5 6 0s4-1.5 6 0"/><circle cx="10" cy="17" r=".6"/><circle cx="14" cy="16" r=".6"/>',
  mill: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6m0 4v6M4 12h6m4 0h6"/>',
  recycler: '<path d="M12 3s5 6 5 9.5a5 5 0 0 1-10 0C7 9 12 3 12 3Z"/><path d="m9 13 2 2 4-4"/>',
  conveyor: '<path d="M3 15h18M3 19h18M7 15v4m5-4v4m5-4v4"/><path d="m9 6 3 3-3 3m4-6 3 3-3 3"/>',
  processor: '<path d="M3 21V11h6l3-3h4v13Zm13-13V3h4v18M7 15h2m2 0h2"/><circle cx="18" cy="13" r="1"/>',
  storage: '<path d="M4 8 12 4l8 4v8l-8 4-8-4Z"/><path d="m4 8 8 4 8-4M12 12v8"/>',
  melter: '<path d="M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8H8a4 4 0 0 1-4-4Z"/><path d="M9 8v8m6-8v8M12 19v2M7 3l2 2 2-2"/>',
  fabricator: '<path d="M3 21V9h18v12ZM7 9V5h4v4m-4 5h10v4H7Z"/><path d="M15 3v6"/>',
  assembler: '<path d="M3 21V8l9-5 9 5v13Z"/><path d="M9 21v-6h6v6M8 10h8"/>',
  electrolyser: '<path d="M6 21V8a3 3 0 0 1 6 0v13M14 21V11a2.5 2.5 0 0 1 5 0v10M3 21h18"/><path d="M9 12v3m7-1v2"/>',
  tank: '<circle cx="8" cy="12" r="5"/><circle cx="17" cy="13" r="4"/><path d="M3 21h18M8 17v4m9-4v4"/>',
  dock: '<path d="M4 21V7h16v14M4 7l2-3h12l2 3"/><path d="M9 15h6v3H9ZM12 10v5"/>',
  roverbay: '<path d="M3 21V9l9-5 9 5v12"/><path d="M6 21v-4h12v4M8 17v-2l2-2h4l2 2v2"/>',
  xenolab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/><circle cx="12" cy="18" r="1"/>',
  reactor: '<circle cx="12" cy="12" r="3"/><path d="m12 3 2 4h-4Zm7.8 13.5-4.4-.4 2.2-3.9ZM4.2 16.5l2.2-3.9 2.2 3.9Z"/><circle cx="12" cy="12" r="9"/>',
  mine: '<path d="M4 4h16v16H4z" stroke-dasharray="3 2"/><path d="m8 15 3-5 2 2 1.5-2L17 15Z"/>',
  dismantle: '<path d="M5 19 15 9m-1-4 5 5-2 2-5-5Z"/><path d="m4 4 4 4M8 4 4 8"/>',
};
const ITEM_ICON_URLS = Object.freeze(Object.fromEntries(Object.keys(ITEM_INFO).map(item =>
  [item, new URL(`./assets/inventory/256/${item}.png`, import.meta.url).href])));
const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
const TOOLS = {
  ...DEFS,
  mine: { name: 'Mining zone', key: 'm', description: 'Mark a 7 × 7 zone for rovers to dig (up to four). Regolith goes to the nearest hopper, ice straight into a melter. Assign rovers in Robots (G).' },
  dismantle: { name: 'Dismantle', key: 'z', description: 'Click or drag over structures and blueprints to take them down. Materials are returned.' },
};
// Palette sections, in menu order.
const GROUPS = [['Power & industry', ['solar', 'battery', 'hopper', 'conveyor', 'processor', 'melter', 'storage']], ['Rooms', ['habitat', 'greenhouse', 'airlock']], ['Fittings', ['growbed', 'hydrorack', 'verticalfarm', 'mushroomtray', 'galley', 'mill', 'armory', 'recycler']], ['Space', ['fabricator', 'assembler', 'electrolyser', 'tank', 'dock', 'roverbay']], ['Deep', ['xenolab', 'reactor', 'goovat']], ['Tools', ['mine', 'dismantle']]];
const svg = (paths, width = 1.5) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const costText = def => def.cost ? Object.entries(def.cost).map(([item, n]) => `${n} ${ITEM_INFO[item]?.name.toLowerCase() ?? item}`).join(', ') : 'Free';
const slotKey = i => String((i + 1) % 10);
const RESEARCH_ICON = '<path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7.5 15h9"/>';
const ORBIT_ICON = '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/><circle cx="20" cy="8" r="1.2"/>';
const STOCK_ICON = '<path d="M3 9 12 4l9 5v11H3Z"/><path d="M7 20v-6h10v6M7 17h10"/>';
const ROVER_ICON = '<path d="M3 15h18v-4l-3-4H9l-2 4H3zM7 11h11M12 7V4h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>';

export function createUI(root, callbacks = {}) {
  root.classList.add('game-ui');
  const buildIcon = svg('<path d="m14 4 6 6-3 3-2-2-8 9-3-3 9-8-2-2 3-3Z"/>', 1.6);
  root.innerHTML = `
    <div class="resource-bar" aria-label="Colony resources">
      <span title="Oxygen reserve: fills rooms; vented from regolith processing"><i class="resource-dot oxygen"></i><span>O₂</span><strong data-value="oxygen">0</strong></span>
      <span title="Water reserve: grow beds drink it; recyclers reclaim it"><i class="resource-dot water"></i><span>Water</span><strong data-value="water">0</strong></span>
      <span class="power-resource" title="Power generation / demand">⚡<strong data-value="power">0</strong><small>kW</small></span>
      <span title="Battery charge"><span class="battery-symbol"></span><strong data-value="battery">0 / 0</strong><small>kJ</small></span>
      <span class="health-resource" title="Suit integrity. Vents and toxic pools wear it down; it recovers on the surface. At zero you black out."><span>Suit</span><span class="health-meter"><i></i></span><strong data-value="health">100%</strong></span>
      <span class="food-resource" title="How fed you are. Hungry below 35%: slower walking and building."><span>Food</span><span class="food-meter"><i></i></span><strong data-value="food">100%</strong></span>
    </div>
    <div class="buffs" aria-label="Meal effects"></div>
    <section class="objective" aria-label="Ship AI" aria-live="polite">
      <header><span class="objective-source">Ship AI</span><small class="objective-step"></small></header>
      <p class="objective-message"></p>
      <div class="objective-task"><i></i><strong></strong><small class="objective-distance"></small></div>
    </section>
    <div class="hotbar" role="toolbar" aria-label="Inventory">
      ${Array.from({ length: 10 }, (_, i) => `<button type="button" class="slot" data-slot="${i}" aria-pressed="false"><kbd>${slotKey(i)}</kbd><span class="slot-icon"></span><strong></strong></button>`).join('')}
    </div>
    <div class="construction">
      <div class="station" aria-label="Station" hidden></div>
      <div class="context-hint" hidden></div>
      <div id="build-menu" class="build-menu" aria-label="Construction" hidden>
        ${GROUPS.map(([title, types]) => `<h3>${title}</h3>${types.map(type => { const def = TOOLS[type]; return `<button type="button" class="build-item" data-build="${type}" aria-pressed="false" title="${def.description}${def.cost ? ` · ${costText(def)}` : ''}">${svg(ICONS[type] || ICONS.habitat)}<span>${def.name}</span><kbd>${def.key?.toUpperCase() ?? ''}</kbd></button>`; }).join('')}`).join('')}
      </div>
      <div class="robots-panel" aria-label="Robots" hidden></div>
      <button type="button" class="build-toggle" data-action="build" aria-expanded="false" aria-controls="build-menu">${buildIcon}<span>Build</span><kbd>B</kbd></button>
      <button type="button" class="build-toggle robots-toggle" data-action="robots" aria-expanded="false" aria-label="Robots" title="Robots (G)">${svg(ROVER_ICON, 1.6)}<kbd>G</kbd></button>
      <button type="button" class="build-toggle robots-toggle stock-toggle" data-action="stock" aria-expanded="false" aria-label="Base stock" title="Base stock (I)">${svg(STOCK_ICON, 1.6)}<kbd>I</kbd></button>
      <button type="button" class="build-toggle robots-toggle orbit-toggle" data-action="orbit" aria-label="Orbit" title="Orbit (O)">${svg(ORBIT_ICON, 1.6)}<kbd>O</kbd><b class="orbit-badge" hidden></b></button>
      <button type="button" class="build-toggle robots-toggle research-toggle" data-action="research" aria-label="Research" title="Research (T)">${svg(RESEARCH_ICON, 1.6)}<kbd>T</kbd><b class="research-badge" hidden></b></button>
      <div class="selection-tools" hidden>
        <span class="selected-name"></span>
        <small class="selected-reason"></small>
        <button type="button" data-action="rotate" aria-label="Rotate" title="Rotate (R)">↻</button>
        <button type="button" data-action="cancel" aria-label="Cancel" title="Cancel (Esc)">×</button>
      </div>
    </div>
    <section class="store-panel" aria-label="Storage" hidden>
      <div class="crate-side">
        <header><strong class="crate-title"></strong><small class="crate-fill"></small></header>
        <div class="crate-slots">${Array.from({ length: CRATE_SLOTS }, (_, i) => `<button type="button" class="slot crate-slot" data-crate-slot="${i}"><span class="slot-icon"></span><strong></strong></button>`).join('')}</div>
        <p class="crate-help">Drag stacks between any slots · click to move straight across · <kbd>Shift</kbd> moves half</p>
        <div class="crate-actions"><button type="button" data-action="store-all" title="Everything except weapons, ammo, flares and food">Store all</button><button type="button" data-action="take-all">Take all</button><button type="button" data-action="close-store" aria-label="Close" title="Close (Esc)">×</button></div>
      </div>
      <div class="ledger-side">
        <header><strong>Base stock</strong><small class="ledger-summary"></small><button type="button" class="ledger-close" data-action="close-store" aria-label="Close" title="Close (Esc)">×</button></header>
        <div class="ledger-rows"></div>
        <p class="ledger-flow">Every crate counts as one store. Building, crafting and cooking use your pockets first, then crate stock while you're within 30 m of a crate. Haulers carry crate stock to fabricators, assemblers and the Starship; belts and haulers drop surplus in the nearest crate with room.</p>
      </div>
    </section>
    <div class="notification" role="status" aria-live="polite" hidden></div>`;
  const fields = Object.fromEntries([...root.querySelectorAll('[data-value]')].map(el => [el.dataset.value, el]));
  const menu = root.querySelector('.build-menu'), toggle = root.querySelector('.build-toggle'), tools = root.querySelector('.selection-tools'), label = root.querySelector('.selected-name'), reasonLabel = root.querySelector('.selected-reason'), notice = root.querySelector('.notification'), hint = root.querySelector('.context-hint');
  const rotateButton = root.querySelector('[data-action=rotate]'), foodMeter = root.querySelector('.food-meter i'), food = root.querySelector('.food-resource'), healthMeter = root.querySelector('.health-meter i'), health = root.querySelector('.health-resource');
  const items = [...root.querySelectorAll('[data-build]')], slots = [...root.querySelectorAll('[data-slot]')];
  const panel = root.querySelector('.objective'), panelMessage = panel.querySelector('.objective-message'), panelTask = panel.querySelector('.objective-task strong'), panelStep = panel.querySelector('.objective-step'), panelDistance = panel.querySelector('.objective-distance');
  let noticeTimer, hintKey = '', objectiveKey = '', aiNote = null, freshTimer;
  const robotsPanel = root.querySelector('.robots-panel'), robotsToggle = root.querySelector('.robots-toggle');
  const setRobots = open => { robotsPanel.hidden = !open; robotsToggle.setAttribute('aria-expanded', String(open)); if (open) { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); robotsKey = ''; robotsAt = 0; if (storeOpen) setStore(false); } };
  const setOpen = open => { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) { setRobots(false); if (storeOpen) setStore(false); } };
  let robotsKey = '', robotsAt = 0, stationKey = '', buffsKey = '';
  const store = root.querySelector('.store-panel'), crateSlots = [...root.querySelectorAll('[data-crate-slot]')], stockToggle = root.querySelector('.stock-toggle');
  let storeOpen = false, crateId = null, ledgerKey = '', ledgerAt = 0;
  const setStore = (open, id = null) => {
    storeOpen = open; crateId = open ? id : null; store.hidden = !open; store.classList.toggle('with-crate', crateId != null);
    root.classList.toggle('crate-open', crateId != null); stockToggle.setAttribute('aria-expanded', String(open && crateId == null)); ledgerKey = ''; ledgerAt = 0;
    if (open) { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); setRobots(false); }
  };
  const fillSlot = (el, slot) => {
    const k = slot ? `${slot.item}:${slot.count}` : '';
    if (el.dataset.content === k) return;
    el.dataset.content = k; el.classList.toggle('empty', !slot);
    el.querySelector('.slot-icon').innerHTML = slot ? `<img src="${ITEM_ICON_URLS[slot.item]}" width="256" height="256" alt="" aria-hidden="true" draggable="false">` : '';
    el.querySelector('strong').textContent = slot && slot.count > 1 ? slot.count : '';
    el.title = slot ? `${ITEM_INFO[slot.item].name} × ${slot.count}` : 'Empty';
  };
  const place = list => list.map(({ tag, n, role }) => `<span>${tag}${role ? ` ${role === 'input' ? 'in' : 'out'}` : ''} <b>${number(n)}</b></span>`).join('');
  function renderStore(state) {
    const crate = crateId != null ? state.buildings.find(b => b.id === crateId && b.built && b.slots) : null;
    if (crateId != null && !crate) { setStore(false); return; }
    if (crate) {
      store.querySelector('.crate-title').textContent = `${tagOf(crate)} · Storage crate`;
      store.querySelector('.crate-fill').textContent = `${usedSlots(crate)} / ${CRATE_SLOTS} slots`;
      crateSlots.forEach((el, i) => fillSlot(el, crate.slots[i]));
    }
    const now = performance.now(); if (now - ledgerAt < 250) return; ledgerAt = now;
    const rows = ledger(state), all = crates(state), used = all.reduce((s, b) => s + usedSlots(b), 0);
    const key = JSON.stringify(rows) + used + all.length;
    if (key === ledgerKey) return; ledgerKey = key;
    store.querySelector('.ledger-summary').textContent = all.length ? `${all.length} crate${all.length > 1 ? 's' : ''} · ${used} / ${all.length * CRATE_SLOTS} slots` : 'No crates yet';
    store.querySelector('.ledger-rows').innerHTML = rows.length ? rows.map(r => {
      const moving = [r.belts && `<span>belts <b>${r.belts}</b></span>`, ...r.robots.map(m => `<span>${m.kind === 'hauler' ? 'Hauler' : 'Rover'} ${m.id} <b>${m.n}</b>${m.to ? ` → ${m.to}` : ''}</span>`)].filter(Boolean).join('');
      return `<div class="ledger-row" data-item="${r.item}">${icon(r.item)}<div><header><strong>${ITEM_INFO[r.item].name}</strong>${r.stored ? `<b title="Held in crates">${number(r.stored)}<small>stored</small></b>` : '<b class="none">none stored</b>'}</header>
        <p class="ledger-where">${place(r.crates)}${r.pockets ? `<span class="pockets">pockets <b>${number(r.pockets)}</b></span>` : ''}</p>
        ${r.machines.length ? `<p class="ledger-machines" title="Held inside machines">${place(r.machines)}</p>` : ''}${moving ? `<p class="ledger-moving" title="On the move">${moving}</p>` : ''}</div></div>`;
    }).join('') : '<p class="robots-empty">Nothing stored yet.</p>';
  }
  const station = root.querySelector('.station'), buffs = root.querySelector('.buffs');
  const icon = item => `<img src="${ITEM_ICON_URLS[item]}" alt="" aria-hidden="true" draggable="false">`;
  const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  // Rebuilt only when the choice or what the player can afford changes, so a hovered chip stays put.
  function renderStation(state, b) {
    if (!b) { if (!station.hidden) { station.hidden = true; stationKey = ''; } return; }
    let key, html;
    if (isGrower(b)) {
      const crops = cropsFor(state, b.type);
      key = `${b.id}|${b.crop}|${crops}|${b.grow >= 1}`;
      if (key === stationKey) return;
      html = `<header><strong>${DEFS[b.type].name}</strong><small>${b.grow >= 1 ? 'Ripe: harvest with E' : crops.length > 1 ? 'Choose a crop · replanting loses growth' : 'Research unlocks more crops'}</small></header>
        <div class="station-options">${crops.map(id => { const c = CROPS[id]; return `<button type="button" data-crop="${id}" data-station="${b.id}" aria-pressed="${id === b.crop}" title="${c.name}: ${c.yield} every ${c.time}s · water ${c.water}${c.power ? ` · ${c.power} kW` : ' · no power'}">${icon(id)}<span>${c.name}</span><small>${c.time}s · ${c.yield}×</small></button>`; }).join('')}</div>`;
    } else if (b.type === 'armory') {
      const recipes = Object.keys(ARMORY), known = id => armoryKnown(state, id);
      const has = id => canPay(state, ARMORY[id].input);
      key = `${b.id}|${recipes.map(id => `${id}${known(id)}${has(id)}`)}`;
      if (key === stationKey) return;
      html = `<header><strong>Armory</strong><small>Click to craft from your pack and base storage</small></header>
        <div class="station-options">${recipes.map(id => { const r = ARMORY[id], inputs = Object.entries(r.input); return `<button type="button" data-make="${id}" data-station="${b.id}" class="${!known(id) ? 'locked' : has(id) ? '' : 'missing'}" ${known(id) ? '' : 'disabled'} title="${ITEM_INFO[id].name}${r.makes > 1 ? ` ×${r.makes}` : ''}: ${inputs.map(([item, n]) => `${n} ${ITEM_INFO[item].name.toLowerCase()}`).join(' + ')}${known(id) ? '' : ` · research ${TECHS[r.tech].name} first`}">${icon(id)}<span>${ITEM_INFO[id].name}${r.makes > 1 ? ` ×${r.makes}` : ''}</span><small class="station-inputs">${inputs.map(([item, n]) => `${n > 1 ? `<b>${n}</b>` : ''}${icon(item)}`).join('')}</small><em>${known(id) ? (WEAPONS[id] ? 'Weapon' : 'Ammo') : 'Needs research'}</em></button>`; }).join('')}</div>`;
    } else {
      const dishes = Object.keys(RECIPES).filter(id => recipeKnown(state, id));
      const has = id => canPay(state, RECIPES[id].input);
      const next = galleyRecipe(state, b);
      key = `${b.id}|${b.recipe}|${dishes.map(id => `${id}${has(id)}`)}|${next}`;
      if (key === stationKey) return;
      const effect = id => { const buff = RECIPES[id].buff; return id === 'medkit' ? 'Heals suit' : buff ? (Object.keys(buff).length === Object.keys(BUFFS).length ? 'All four effects' : Object.keys(buff).map(k => BUFFS[k].name).join(' · ')) : 'Filling'; };
      html = `<header><strong>Galley</strong><small>${next ? `E cooks ${ITEM_INFO[next].name.toLowerCase()}` : b.recipe ? `Missing ingredients for ${ITEM_INFO[b.recipe].name.toLowerCase()}` : 'No ingredients for any dish'}</small></header>
        <div class="station-options"><button type="button" class="station-auto" data-recipe="" data-station="${b.id}" aria-pressed="${!b.recipe}" title="Cook the best dish you have ingredients for">${svg('<path d="M4 12a8 8 0 0 1 14-5m2 5a8 8 0 0 1-14 5"/><path d="M18 3v4h-4M6 21v-4h4"/>', 1.6)}<span>Auto</span><small>Best dish</small></button>
        ${dishes.map(id => `<button type="button" data-recipe="${id}" data-station="${b.id}" aria-pressed="${id === b.recipe}" class="${has(id) ? '' : 'missing'}" title="${ITEM_INFO[id].name}: ${Object.entries(RECIPES[id].input).map(([item, n]) => `${n} ${ITEM_INFO[item].name.toLowerCase()}`).join(' + ')} · ${effect(id)}">${icon(id)}<span>${ITEM_INFO[id].name}</span><small class="station-inputs">${Object.entries(RECIPES[id].input).map(([item, n]) => `${n > 1 ? `<b>${n}</b>` : ''}${icon(item)}`).join('')}</small><em>${effect(id)}</em></button>`).join('')}</div>`;
    }
    stationKey = key; station.innerHTML = html; station.hidden = false;
  }
  function renderBuffs(state) {
    const active = Object.entries(state.player.buffs ?? {}).filter(([, t]) => t > 0);
    const key = active.map(([id, t]) => `${id}${Math.ceil(t)}`).join();
    if (key === buffsKey) return;
    buffsKey = key;
    buffs.innerHTML = active.map(([id, t]) => `<span class="buff" data-buff="${id}" title="${BUFFS[id].name}"><i></i>${BUFFS[id].name}<small>${clock(t)}</small></span>`).join('');
  }
  // Rows are rebuilt only when rovers or zones come and go, so an open zone picker is never torn down mid-choice.
  function renderRobots(state) {
    const areas = state.miningAreas ?? [], key = state.robots.map(r => r.id).join() + '|' + areas.map(a => a.id).join();
    const miners = state.robots.filter(r => r.kind === 'miner'), haulers = state.robots.filter(r => r.kind === 'hauler');
    if (key !== robotsKey) {
      robotsKey = key;
      robotsPanel.innerHTML = `${haulers.length ? `<h3>Haulers</h3>${haulers.map(r => `<div class="robot-row" data-robot="${r.id}"><i class="robot-dot"></i><div><strong>Hauler ${r.id}</strong><small data-field="status"></small></div></div>`).join('')}` : ''}<h3>Rovers</h3>${miners.map(r => `<div class="robot-row" data-robot="${r.id}"><i class="robot-dot"></i><div><strong>Rover ${r.id}</strong><small data-field="status"></small></div><select data-assign="${r.id}" aria-label="Rover ${r.id} zone"><option value="">Auto</option>${areas.map(a => `<option value="${a.id}">Zone ${a.id}</option>`).join('')}</select></div>`).join('')}
        <h3>Mining zones</h3>${areas.map(a => `<div class="zone-row" data-zone="${a.id}"><span class="zone-tag">${a.id}</span><div><strong>Zone ${a.id}</strong><small data-field="zone"></small></div><button type="button" data-remove-zone="${a.id}" aria-label="Remove zone ${a.id}" title="Remove zone">×</button></div>`).join('') || '<p class="robots-empty">No zones yet. Rovers wait until you mark one.</p>'}
        <button type="button" class="zone-add" data-build="mine" ${areas.length >= MAX_MINING_AREAS ? 'disabled' : ''}>Mark a zone<kbd>M</kbd></button>`;
    }
    for (const r of state.robots) {
      const row = robotsPanel.querySelector(`[data-robot="${r.id}"]`), status = robotStatus(r, state);
      row.dataset.level = lampLevel(status);
      row.querySelector('[data-field=status]').textContent = `${status?.text ?? 'Ready'} · ${Math.round(r.charge * 100)}%${r.cargo >= 1 ? ` · ${Math.floor(r.cargo)} ${r.load ?? 'regolith'}` : ''}`;
      const select = row.querySelector('select'); if (select && document.activeElement !== select) select.value = String(r.area ?? '');
    }
    for (const a of areas) {
      const kind = areaKind(state, a.id), left = Math.round(remainingRegolith(state, a.id)), crew = state.robots.filter(r => r.area === a.id).length;
      robotsPanel.querySelector(`[data-zone="${a.id}"] [data-field=zone]`).textContent = kind && left ? `${kind === 'ice' ? 'Ice' : 'Regolith'} · ${left} left${crew ? ` · ${crew} assigned` : ''}` : 'Exhausted';
    }
  }
  // Dragging a stack: hotbar and crate slots are both sources and targets. A drop on empty panel
  // space sends it to the first free slot on that side; a short press stays a click.
  let drag = null, swallowClick = false;
  const slotRef = el => el?.dataset.slot != null ? { crate: false, i: Number(el.dataset.slot) } : el?.dataset.crateSlot != null && crateId != null ? { crate: true, i: Number(el.dataset.crateSlot) } : null;
  const dropRef = (x, y) => {
    const el = document.elementFromPoint(x, y), slot = el?.closest('[data-slot],[data-crate-slot]');
    if (slot) return slotRef(slot);
    if (el?.closest('.hotbar')) return { crate: false, i: null };
    if (crateId != null && el?.closest('.crate-side')) return { crate: true, i: null };
    return null;
  };
  const onDown = event => {
    if (event.button !== 0) return;
    const el = event.target.closest('[data-slot],[data-crate-slot]'), from = slotRef(el);
    if (!from || el.classList.contains('empty')) return;
    drag = { from, el, x: event.clientX, y: event.clientY, half: event.shiftKey, ghost: null, id: event.pointerId };
  };
  const onMove = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.ghost = document.createElement('div'); drag.ghost.className = 'slot-ghost';
      const count = Number(drag.el.querySelector('strong').textContent || 1), n = drag.half ? Math.ceil(count / 2) : count;
      drag.ghost.innerHTML = `${drag.el.querySelector('.slot-icon').innerHTML}${n > 1 ? `<strong>${n}</strong>` : ''}`;
      root.append(drag.ghost); drag.el.classList.add('dragging'); root.classList.add('slot-dragging');
    }
    drag.ghost.style.transform = `translate(${event.clientX - 24}px,${event.clientY - 24}px)`;
    root.querySelectorAll('.drop-target').forEach(e => e.classList.remove('drop-target'));
    document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slot],[data-crate-slot]')?.classList.add('drop-target');
  };
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.ghost) return;
    d.ghost.remove(); d.el.classList.remove('dragging'); root.classList.remove('slot-dragging');
    root.querySelectorAll('.drop-target').forEach(e => e.classList.remove('drop-target'));
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    const to = event.type === 'pointerup' ? dropRef(event.clientX, event.clientY) : null;
    if (to) callbacks.onMoveSlot?.({ crate: crateId, from: d.from, to, half: d.half || event.shiftKey });
  };
  root.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  const onClick = event => {
    if (swallowClick) { event.stopPropagation(); return; }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.station) { const id = Number(button.dataset.station); callbacks.onStation?.(button.dataset.make ? { id, make: button.dataset.make } : button.dataset.crop ? { id, crop: button.dataset.crop } : { id, recipe: button.dataset.recipe || null }); stationKey = ''; button.blur(); return; }
    if (button.dataset.crateSlot != null) { callbacks.onTake?.(crateId, Number(button.dataset.crateSlot), event.shiftKey); button.blur(); return; }
    if (button.dataset.slot && crateId != null) { callbacks.onStore?.(crateId, Number(button.dataset.slot), event.shiftKey); button.blur(); return; }
    if (button.dataset.action === 'store-all') { callbacks.onStoreAll?.(crateId); button.blur(); return; }
    if (button.dataset.action === 'take-all') { callbacks.onTakeAll?.(crateId); button.blur(); return; }
    if (button.dataset.action === 'close-store') { setStore(false); callbacks.onCloseStore?.(); button.blur(); return; }
    if (button.dataset.action === 'stock') { setStore(!(storeOpen && crateId == null)); button.blur(); return; }
    if (button.dataset.build) { callbacks.onSelect?.(button.dataset.build); setOpen(false); setRobots(false); }
    else if (button.dataset.removeZone) callbacks.onRemoveZone?.(Number(button.dataset.removeZone));
    else if (button.dataset.action === 'robots') setRobots(robotsPanel.hidden);
    else if (button.dataset.action === 'orbit') callbacks.onOrbit?.();
    else if (button.dataset.action === 'research') callbacks.onResearch?.();
    else if (button.dataset.slot) callbacks.onSlot?.(Number(button.dataset.slot));
    else if (button.dataset.action === 'build') setOpen(menu.hidden);
    else if (button.dataset.action === 'rotate') callbacks.onRotate?.();
    else if (button.dataset.action === 'cancel') { callbacks.onCancel?.(); setOpen(false); }
    button.blur();
  };
  const onKey = event => { if (event.key === 'Escape') { setOpen(false); setRobots(false); setStore(false); } };
  const onChange = event => { const id = event.target.dataset?.assign; if (id) { callbacks.onAssign?.(Number(id), event.target.value ? Number(event.target.value) : null); event.target.blur(); } };
  root.addEventListener('click', onClick); root.addEventListener('change', onChange); window.addEventListener('keydown', onKey);
  return {
    toggleMenu() { setOpen(menu.hidden); },
    toggleRobots() { setRobots(robotsPanel.hidden); },
    toggleStock() { setStore(!(storeOpen && crateId == null)); },
    openCrate(id) { setStore(true, id); },
    closeStore() { setStore(false); },
    get crateId() { return crateId; },
    update(state, view = {}) {
      const selected = view.selectedType || null;
      root.querySelector('.construction').dataset.underground = String(state.player.cave != null);
      const now = performance.now();
      if (!robotsPanel.hidden && now - robotsAt > 250) { robotsAt = now; renderRobots(state); }
      if (storeOpen) renderStore(state);
      const badge = root.querySelector('.orbit-badge'), sats = state.satellites ?? 0;
      if (badge.textContent !== String(sats)) { badge.textContent = String(sats); badge.hidden = !sats; }
      // Points waiting with nothing being researched.
      const idle = !state.research?.selected && (state.research?.bank ?? 0) >= 1;
      root.querySelector('.research-badge').hidden = !idle;
      fields.oxygen.textContent = number(state.reserves?.oxygen);
      fields.water.textContent = number(state.reserves?.water);
      fields.power.textContent = `${number(state.power.generation)} / ${number(state.power.demand)}`;
      fields.power.parentElement.classList.toggle('insufficient', state.power.powered === false);
      fields.battery.textContent = `${number(state.power.stored)} / ${number(state.power.capacity)}`;
      const satiety = state.player.satiety ?? 100, status = hunger(satiety);
      fields.food.textContent = status.label ?? `${Math.round(satiety)}%`;
      foodMeter.style.transform = `scaleX(${satiety / 100})`;
      food.dataset.tone = satiety <= 0 ? 'starving' : status.label ? 'hungry' : 'fed';
      const suit = state.player.health ?? 100;
      fields.health.textContent = `${Math.ceil(suit)}%`; healthMeter.style.transform = `scaleX(${suit / 100})`;
      health.dataset.tone = suit < 30 ? 'critical' : suit < 70 ? 'worn' : 'sound';
      slots.forEach((el, i) => {
        const slot = state.inventory[i], active = i === view.selectedSlot, k = slot ? `${slot.item}:${slot.count}` : '';
        el.classList.toggle('selected', active); el.setAttribute('aria-pressed', String(active));
        if (el.dataset.content === k) return;
        el.dataset.content = k; el.classList.toggle('empty', !slot);
        el.querySelector('.slot-icon').innerHTML = slot ? `<img src="${ITEM_ICON_URLS[slot.item]}" width="256" height="256" alt="" aria-hidden="true" draggable="false">` : '';
        el.querySelector('strong').textContent = slot && slot.count > 1 ? slot.count : '';
        el.dataset.item = slot?.item ?? '';
        el.title = slot ? `${ITEM_INFO[slot.item].name} × ${slot.count}${ITEM_INFO[slot.item].food ? ' · F to eat' : ''}` : 'Empty';
        el.setAttribute('aria-label', `Slot ${slotKey(i)}: ${el.title}`);
      });
      tools.hidden = !selected; label.textContent = selected ? TOOLS[selected].name : '';
      rotateButton.hidden = selected === 'mine' || selected === 'dismantle' || !!TOOLS[selected]?.paint;
      const invalid = selected && view.placementReason && !/^(Click|Drag)|release to place/.test(view.placementReason);
      reasonLabel.textContent = invalid ? view.placementReason : ''; reasonLabel.hidden = !invalid;
      renderStation(state, selected ? null : view.station);
      renderBuffs(state);
      const held = state.inventory[view.foodSlot ?? view.selectedSlot], edible = ITEM_INFO[held?.item]?.food && satiety < 100;
      const lines = [];
      if (view.missionUse) lines.push(`<kbd>E</kbd> ${view.missionUse.verb}${view.missionUse.hold && view.missionUse.progress > 0 ? ` <span class="hint-progress"><i style="transform:scaleX(${view.missionUse.progress})"></i></span>` : ''}`);
      else if (view.use && !view.nearbyBuilding) lines.push(`<kbd>E</kbd> ${view.use.verb}`);
      if (state.player.cave != null || infested(state) || view.night) {
        const flares = count(state.inventory, 'flare');
        if (flares) lines.push(`<kbd>Q</kbd> Throw flare · ${flares}`);
        else if (available(state, 'metal') >= 2) lines.push('<kbd>X</kbd> Make 3 flares · 2 metal');
      }
      if (edible && (status.label || satiety < 70)) lines.push(`<kbd>F</kbd> Eat ${RECIPES[held.item] ? ITEM_INFO[held.item].name.toLowerCase() : `raw ${ITEM_INFO[held.item].name.toLowerCase()}`}`);
      const next = lines.join('<span class="hint-gap"></span>');
      if (next !== hintKey) { hintKey = next; hint.innerHTML = next; hint.hidden = !next; }
      for (const item of items) {
        const active = item.dataset.build === selected; item.setAttribute('aria-pressed', String(active)); item.classList.toggle('selected', active);
        const def = TOOLS[item.dataset.build]; item.classList.toggle('unaffordable', !canPay(state, def.cost ?? {}));
        const locked = view.locked?.[item.dataset.build];
        if (item.classList.contains('locked') !== !!locked) {
          item.classList.toggle('locked', !!locked);
          item.querySelector('kbd').innerHTML = locked ? svg(LOCK, 1.8) : def.key?.toUpperCase() ?? '';
          item.title = locked ?? `${def.description}${def.cost ? ` · ${costText(def)}` : ''}`;
        }
      }
      const goal = view.objective;
      panel.hidden = !goal || state.player.cave != null;
      if (goal) {
        const key = `${goal.step}`;
        if (key !== objectiveKey) {
          const first = !objectiveKey; objectiveKey = key;
          if (!first) { panel.classList.add('fresh'); clearTimeout(freshTimer); freshTimer = setTimeout(() => panel.classList.remove('fresh'), 4000); }
        }
        const note = aiNote && aiNote.until > performance.now() ? aiNote.text : null;
        panelMessage.textContent = note ?? goal.message;
        panel.classList.toggle('aside', !!note);
        panelTask.textContent = goal.done ? 'All objectives complete' : goal.objective;
        panel.classList.toggle('complete', !!goal.done);
        panelStep.textContent = goal.done ? '' : `${goal.step + 1} / ${goal.count}`;
        panelDistance.textContent = goal.distance != null && goal.distance > 6 ? `${goal.distance} m` : '';
      }
    },
    /** A passing remark from the ship AI, shown over the current objective for a while. */
    say(text) { aiNote = { text, until: performance.now() + 14000 }; panel.classList.add('fresh'); clearTimeout(freshTimer); freshTimer = setTimeout(() => panel.classList.remove('fresh'), 4000); },
    notify(message) { clearTimeout(noticeTimer); notice.textContent = message; notice.hidden = false; noticeTimer = setTimeout(() => { notice.hidden = true; }, 2600); },
    dispose() { clearTimeout(noticeTimer); clearTimeout(freshTimer); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); window.removeEventListener('keydown', onKey); root.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', endDrag); window.removeEventListener('pointercancel', endDrag); drag?.ghost?.remove(); root.replaceChildren(); root.classList.remove('game-ui'); },
  };
}
