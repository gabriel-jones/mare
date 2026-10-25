import { DEFS } from './sim.js';
import { ITEM_INFO } from './defs.js';
import { count } from './inventory.js';
import { hunger, bedOf, readyCount, stationJobs, STATIONS, jobName } from './life.js';
import { BUFFS, CROPS, RECIPES, cropsFor, isGrower } from './farm.js';
import { infested } from './goo.js';
import { ARMORY, WEAPONS } from './arms.js';
import { TECHS, ROBOT_LIMIT, ROBOT_TYPE, ROBOT_NAME, robotCap, techDone } from './space.js';
import { robotStatus, lampLevel } from './building-status.js';
import { areaKind, remainingRegolith, MAX_MINING_AREAS } from './production.js';
import { available, canPay, crates, ledger, usedSlots, CRATE_SLOTS } from './storage.js';
import { tagOf } from './defs.js';

const UI_ART = new URL('./assets/ui/', import.meta.url).href;
const art = path => `${UI_ART}${path}.png`;
const pic = (path, cls = '') => `<img class="${cls}" src="${art(path)}" alt="" aria-hidden="true" draggable="false">`;
const ITEM_ICON_URLS = Object.freeze(Object.fromEntries(Object.keys(ITEM_INFO).map(item =>
  [item, new URL(`./assets/inventory/256/${item}.png`, import.meta.url).href])));
const TOOLS = {
  ...DEFS,
  mine: { name: 'Mining zone', key: 'm', description: 'Mark a 7 × 7 zone for rovers to dig (up to four). Regolith goes to the nearest hopper, ice straight into a melter. Assign rovers in Robots (G).' },
  dismantle: { name: 'Dismantle', key: 'z', description: 'Click or drag over structures and blueprints to take them down. Materials are returned.' },
};
// Palette sections, in menu order.
const GROUPS = [['Power & industry', ['solar', 'battery', 'rtg', 'fuelcell', 'thermal', 'hopper', 'conveyor', 'processor', 'melter', 'storage']], ['Rooms', ['habitat', 'greenhouse', 'airlock']], ['Fittings', ['growbed', 'hydrorack', 'verticalfarm', 'mushroomtray', 'galley', 'mill', 'armory', 'recycler']], ['Space', ['fabricator', 'assembler', 'electrolyser', 'tank']], ['Robots', ['hauler', 'rover', 'dock', 'roverbay', 'chargepad', 'foundry']], ['Deep', ['xenolab', 'reactor', 'goovat', 'bioreactor']], ['Defence', ['turret', 'fence']], ['Mars', ['drill', 'furnace']], ['Tools', ['mine', 'dismantle']]];
const svg = (paths, width = 1.5) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const costText = def => def.cost ? Object.entries(def.cost).map(([item, n]) => `${n} ${ITEM_INFO[item]?.name.toLowerCase() ?? item}`).join(', ') : 'Free';
const slotKey = i => String((i + 1) % 10);
// What each work order shows: the building it asks for, or the item at the heart of it.
const ORDER_ART = { power: 'build/solar', shelter: 'build/habitat', mining: 'build/hopper', crater: 'core', salvage: 'core', repair: 'core',
  refine: 'build/processor', ice: 'ice', fabricate: 'build/fabricator', hauler: 'build/dock', assemble: 'satellite', fuel: 'build/tank',
  launch: 'satellite', research: 'build/roverbay', caves: 'titanium', xenolab: 'build/xenolab', schematic: 'artifact', reactor: 'build/reactor' };
const orderArt = id => { const a = ORDER_ART[id] ?? 'build/reactor'; return a.includes('/') ? art(a) : ITEM_ICON_URLS[a]; };
const PLATES = 5, TYPE_MS = 22, LINGER_MS = 9000;

export function createUI(root, callbacks = {}) {
  root.classList.add('game-ui');
  root.innerHTML = `
    <div class="hud-top">
    <div class="resource-bar" aria-label="Colony resources">
      <span class="readout" title="Oxygen reserve: fills rooms; vented from regolith processing">${pic('icons/oxygen', 'readout-art')}<span class="lcd"><strong data-value="oxygen">0</strong></span></span>
      <span class="readout" title="Water reserve: grow beds drink it; recyclers reclaim it">${pic('icons/water', 'readout-art')}<span class="lcd"><strong data-value="water">0</strong></span></span>
      <span class="readout power-resource" title="Power generation / demand">${pic('icons/power', 'readout-art')}<span class="lcd"><strong data-value="power">0</strong><small>kW</small></span></span>
      <span class="readout" title="Battery charge">${pic('icons/battery', 'readout-art')}<span class="lcd"><strong data-value="battery">0 / 0</strong><small>kJ</small></span></span>
    </div>
    <div class="vitals" aria-label="Suit and food">
      <span class="readout health-resource" title="Suit integrity. Vents and toxic pools wear it down; it recovers on the surface. At zero you black out.">${pic('icons/suit', 'readout-art')}<span class="plates">${'<i data-state="whole"></i>'.repeat(PLATES)}</span><strong data-value="health">100%</strong></span>
      <span class="readout food-resource" title="How fed you are. Hungry below 35%: slower walking and building.">${pic('icons/food', 'readout-art')}<span class="tube"><i></i></span><strong data-value="food">100%</strong></span>
    </div>
    </div>
    <div class="buffs" aria-label="Meal effects"></div>
    <section class="objective" aria-label="Ship AI" aria-live="polite">
      <div class="work-order">
        <img class="order-art" alt="" aria-hidden="true" draggable="false">
        <div class="order-body">
          <small class="order-label">Objective</small>
          <strong class="objective-task"></strong>
          <span class="pips"></span>
        </div>
        <small class="objective-distance"></small>
      </div>
      <div class="comms">
        <button type="button" class="comms-unit" data-action="replay" title="Ship AI · replay message">${pic('icons/comms')}</button>
        <p class="objective-message"></p>
      </div>
    </section>
    <div class="hotbar" role="toolbar" aria-label="Inventory">
      ${Array.from({ length: 10 }, (_, i) => `<button type="button" class="slot" data-slot="${i}" aria-pressed="false"><kbd>${slotKey(i)}</kbd><span class="slot-icon"></span><strong></strong></button>`).join('')}
    </div>
    <div class="construction">
      <div class="station" aria-label="Station" hidden></div>
      <div class="context-hint" hidden></div>
      <div class="blueprint-tip" role="tooltip" hidden></div>
      <div id="build-menu" class="build-menu" aria-label="Construction" hidden>
        ${GROUPS.map(([title, types]) => `<h3>${title}</h3>${types.map(type => { const def = TOOLS[type]; return `<button type="button" class="build-item" data-build="${type}" aria-pressed="false" title="${def.description}${def.cost ? ` · ${costText(def)}` : ''}">${pic(`build/${type}`, 'build-art')}<span>${def.name}</span><kbd>${def.key?.toUpperCase() ?? ''}</kbd></button>`; }).join('')}`).join('')}
      </div>
      <div class="robots-panel" aria-label="Robots" hidden></div>
      <button type="button" class="build-toggle" data-action="build" aria-label="Build" title="Build (B)" aria-expanded="false" aria-controls="build-menu">${pic('icons/build', 'key-art')}<kbd>B</kbd></button>
      <button type="button" class="build-toggle robots-toggle" data-action="robots" aria-expanded="false" aria-label="Robots" title="Robots (G)">${pic('icons/robots', 'key-art')}<kbd>G</kbd></button>
      <button type="button" class="build-toggle robots-toggle stock-toggle" data-action="stock" aria-expanded="false" aria-label="Base stock" title="Base stock (I)">${pic('icons/stock', 'key-art')}<kbd>I</kbd></button>
      <button type="button" class="build-toggle robots-toggle orbit-toggle" data-action="orbit" aria-label="Orbit" title="Orbit (O)">${pic('icons/orbit', 'key-art')}<kbd>O</kbd></button>
      <button type="button" class="build-toggle robots-toggle research-toggle" data-action="research" aria-label="Research" title="Research (T)">${pic('icons/research', 'key-art')}<kbd>T</kbd><b class="research-badge" hidden></b></button>
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
        <header title="Every crate counts as one store. Building, crafting and cooking use your pockets first, then crate stock while you're within 30 m of a crate. Haulers carry crate stock to fabricators, assemblers and the Starship; belts and haulers drop surplus in the nearest crate with room."><strong>Base stock</strong><span class="lcd ledger-summary"></span><button type="button" class="ledger-close" data-action="close-store" aria-label="Close" title="Close (Esc)">×</button></header>
        <div class="stock-grid"></div>
        <div class="stock-detail" hidden></div>
      </div>
    </section>
    <div class="notification" role="status" aria-live="polite" hidden></div>`;
  const fields = Object.fromEntries([...root.querySelectorAll('[data-value]')].map(el => [el.dataset.value, el]));
  const menu = root.querySelector('.build-menu'), toggle = root.querySelector('.build-toggle'), tools = root.querySelector('.selection-tools'), label = root.querySelector('.selected-name'), reasonLabel = root.querySelector('.selected-reason'), blueprintTip = root.querySelector('.blueprint-tip'), notice = root.querySelector('.notification'), hint = root.querySelector('.context-hint'); let tipKey = '', tipSize = { w: 0, h: 0 }, tipAt = { x: 0, y: 0 };
  // Follows the pointer from its own move events; measured only when its contents change.
  function placeTip(x = tipAt.x, y = tipAt.y) {
    tipAt = { x, y };
    if (blueprintTip.hidden) return;
    const { w, h } = tipSize, left = x + 20 + w > innerWidth - 8 ? x - 14 - w : x + 20, top = y + 20 + h > innerHeight - 8 ? y - 14 - h : y + 20;
    blueprintTip.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  }
  const rotateButton = root.querySelector('[data-action=rotate]'), foodMeter = root.querySelector('.tube i'), food = root.querySelector('.food-resource'), plates = [...root.querySelectorAll('.plates i')], health = root.querySelector('.health-resource');
  const items = [...root.querySelectorAll('[data-build]')], slots = [...root.querySelectorAll('[data-slot]')];
  const panel = root.querySelector('.objective'), panelMessage = panel.querySelector('.objective-message'), panelTask = panel.querySelector('.objective-task'), panelDistance = panel.querySelector('.objective-distance'), orderImage = panel.querySelector('.order-art'), pips = panel.querySelector('.pips');
  let spoken = { text: '', at: 0, shown: -1 }, orderId = null, pipsKey = '';
  const speak = text => { spoken = { text, at: performance.now(), shown: -1 }; };
  let noticeTimer, hintKey = '', objectiveKey = '', aiNote = null, freshTimer;
  const robotsPanel = root.querySelector('.robots-panel'), robotsToggle = root.querySelector('.robots-toggle');
  const setRobots = open => { robotsPanel.hidden = !open; robotsToggle.setAttribute('aria-expanded', String(open)); if (open) { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); robotsKey = ''; robotsAt = 0; if (storeOpen) setStore(false); } };
  const setOpen = open => { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) { setRobots(false); if (storeOpen) setStore(false); } };
  let robotsKey = '', robotsAt = 0, stationKey = '', buffsKey = '', menuKey = '';
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
    store.querySelector('.ledger-summary').innerHTML = all.length ? `${used}<small>/${all.length * CRATE_SLOTS}</small>` : '–';
    store.querySelector('.ledger-summary').title = `${all.length} crate${all.length === 1 ? '' : 's'} · slots used`;
    ledgerRows = new Map(rows.map(r => [r.item, r]));
    store.querySelector('.stock-grid').innerHTML = rows.length ? rows.map(r => `<button type="button" class="stock-tile${r.stored || r.pockets ? '' : ' pockets-only'}${r.item === stockFocus ? ' focus' : ''}" data-stock="${r.item}" aria-label="${ITEM_INFO[r.item].name}">${icon(r.item)}<span class="lcd">${number(r.stored + r.pockets + r.machines.reduce((n, m) => n + m.n, 0) + r.belts + r.robots.reduce((n, m) => n + m.n, 0))}</span>${r.belts || r.robots.length ? '<i class="stock-moving"></i>' : ''}</button>`).join('') : `<p class="stock-empty">${svg('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>', 1.4)}</p>`;
    renderStockDetail();
  }
  // Where the hovered item is: crates, pockets, inside machines, and on the move.
  let ledgerRows = new Map(), stockFocus = null;
  function renderStockDetail() {
    const detail = store.querySelector('.stock-detail'), r = ledgerRows.get(stockFocus);
    if (!r) { detail.hidden = true; return; }
    const chip = (label, n, cls = '') => `<span class="${cls}">${label}<b>${number(n)}</b></span>`;
    const moving = [r.belts && chip(svg('<path d="M3 9h18M3 15h18M7 9l-2 6M13 9l-2 6M19 9l-2 6"/>', 1.4), r.belts, 'moving'), ...r.robots.map(m => chip(`${m.kind === 'hauler' ? 'H' : m.kind === 'android' ? 'A' : 'R'}${m.id}`, m.n, 'moving'))];
    detail.innerHTML = `<strong>${ITEM_INFO[r.item].name}</strong><div>${[...r.crates.map(c => chip(c.tag, c.n, 'crate')), r.pockets && chip(svg('<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>', 1.4), r.pockets, 'pockets'), ...r.machines.map(m => chip(m.tag, m.n, 'machine')), ...moving].filter(Boolean).join('')}</div>`;
    detail.hidden = false;
  }
  store.addEventListener('pointerover', event => { const tile = event.target.closest('[data-stock]'); const next = tile?.dataset.stock ?? (event.target.closest('.stock-detail') ? stockFocus : null); if (next === stockFocus) return; stockFocus = next; store.querySelectorAll('.stock-tile.focus').forEach(t => t.classList.toggle('focus', t.dataset.stock === stockFocus)); tile?.classList.add('focus'); renderStockDetail(); });
  store.addEventListener('pointerleave', () => { stockFocus = null; store.querySelectorAll('.stock-tile.focus').forEach(t => t.classList.remove('focus')); renderStockDetail(); });
  const station = root.querySelector('.station'), buffs = root.querySelector('.buffs');
  const icon = item => `<img src="${ITEM_ICON_URLS[item]}" alt="" aria-hidden="true" draggable="false">`;
  const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  // Rebuilt only when the choice, the queue or what the player can afford changes, so a hovered chip stays put.
  function renderStation(state, b) {
    if (!b) { if (!station.hidden) { station.hidden = true; stationKey = ''; } return; }
    station.style.setProperty('--work', b.work ?? 0);
    const close = `<button type="button" class="station-close" data-station="${b.id}" data-close="1" aria-label="Close">${svg('<path d="M6 6l12 12M18 6 6 18"/>', 1.8)}</button>`;
    let key, html;
    if (isGrower(b)) {
      const crops = cropsFor(state, b.type), bed = bedOf(state, b), ripe = bed.filter(o => o.grow >= 1).length;
      const planted = new Set(bed.map(o => o.crop)), grow = Math.floor(Math.min(...bed.map(o => o.grow)) * 100);
      key = `${b.id}|${bed.map(o => o.id)}|${[...planted]}|${crops}|${ripe}|${ripe ? '' : Math.floor(grow / 5)}`;
      if (key === stationKey) return;
      const name = bed.length > 1 ? `${DEFS[b.type].name} · ${bed.length} plots` : DEFS[b.type].name;
      const note = ripe ? `${ripe === bed.length ? 'Ripe' : `${ripe} of ${bed.length} ripe`}: harvest with E` : `${planted.size > 1 ? 'Mixed' : CROPS[b.crop].name} · ${grow}% grown${crops.length > 1 ? ' · replanting loses growth' : ''}`;
      html = `<header><strong>${name}</strong><small>${note}</small>${close}</header>
        <div class="station-options">${crops.map(id => { const c = CROPS[id]; return `<button type="button" data-crop="${id}" data-station="${b.id}" aria-pressed="${planted.size === 1 && planted.has(id)}" title="${c.name}: ${c.yield} per plot every ${c.time}s · water ${c.water}${c.power ? ` · ${c.power} kW` : ' · no power'}">${icon(id)}<span>${c.name}</span><small>${c.time}s · ${c.yield}×</small></button>`; }).join('')}</div>`;
    } else {
      const st = STATIONS[b.type], jobs = stationJobs(b), ready = readyCount(b);
      const ids = st.recipes.filter(id => b.type === 'armory' || st.known(state, id)), known = id => st.known(state, id), has = id => canPay(state, st.input(id));
      const stocked = !st.robots && (techDone(state, 'androids') || state.robots.some(r => r.kind === 'android')) ? ids.filter(known) : [];
      key = `${b.id}|${ids.map(id => `${id}${known(id)}${has(id)}`)}|${jobs}|${ready}|${stocked.map(id => b.targets?.[id] ?? 0)}`;
      if (key === stationKey) return;
      const label = id => `${jobName(id)}${st.makes(id) > 1 ? ` ×${st.makes(id)}` : ''}`, art = id => st.robots ? pic(`build/${ROBOT_TYPE[id]}`) : icon(id);
      const effect = id => {
        if (b.type === 'armory') return known(id) ? (WEAPONS[id] ? 'Weapon' : 'Ammo') : 'Needs research';
        if (b.type === 'mill') return 'Ground';
        if (st.robots) return `${state.robots.filter(r => r.kind === id).length} / ${robotCap(state, id)}`;
        const buff = RECIPES[id].buff;
        return id === 'medkit' ? 'Heals suit' : buff ? (Object.keys(buff).length === Object.keys(BUFFS).length ? 'All four effects' : Object.keys(buff).map(k => BUFFS[k].name).join(' · ')) : 'Filling';
      };
      const note = jobs.length ? `${st.verb} ${jobName(jobs[0]).toLowerCase()}${jobs.length > 1 ? ` · ${jobs.length - 1} queued` : ''}${jobs.length >= st.queue ? ' · queue full' : ''}`
        : ready ? 'Your pack is full: press E to collect' : ids.length ? `Click to make · ${st.time}s each` : 'Research crops to grind';
      html = `<header><strong>${DEFS[b.type].name}</strong><small>${note}</small>${close}</header>
        <div class="station-options">${ids.map(id => {
          const inputs = Object.entries(st.input(id)), queued = jobs.filter(j => j === id).length;
          return `<button type="button" data-make="${id}" data-station="${b.id}" class="${!known(id) ? 'locked' : has(id) ? '' : 'missing'}${jobs[0] === id ? ' working' : ''}" ${known(id) ? '' : 'disabled'} title="${label(id)}: ${inputs.map(([item, n]) => `${n} ${ITEM_INFO[item].name.toLowerCase()}`).join(' + ')}${known(id) ? '' : ` · research ${TECHS[ARMORY[id]?.tech]?.name ?? 'it'} first`}">${art(id)}<span>${label(id)}</span><small class="station-inputs">${inputs.map(([item, n]) => `${n > 1 ? `<b>${n}</b>` : ''}${icon(item)}`).join('')}</small><em>${effect(id)}</em>${queued ? `<b class="station-count">${queued}</b>` : ''}${jobs[0] === id ? '<i class="station-progress"></i>' : ''}</button>`;
        }).join('')}</div>${stocked.length ? `<div class="station-targets" title="Androids order more whenever the colony holds fewer than this. Shift-click for 5."><small>Android stock</small>${stocked.map(id => { const n = b.targets?.[id] ?? 0; return `<span class="${n ? 'set' : ''}">${icon(id)}<button type="button" data-station="${b.id}" data-target="${id}" data-delta="-1" aria-label="Less ${jobName(id)}" ${n ? '' : 'disabled'}>−</button><b class="lcd">${n}</b><button type="button" data-station="${b.id}" data-target="${id}" data-delta="1" aria-label="More ${jobName(id)}">+</button></span>`; }).join('')}</div>` : ''}`;
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
  // Bays are rebuilt only when robots, zones or limits change, so a hovered chip stays put; lamps, charge and cargo update in place.
  const HUMANOID_BAYS = 3;
  const humanoid = svg('<circle cx="12" cy="5" r="2.6"/><path d="M8.5 9.5h7l1 6h-2l-.5 6.5h-4L9.5 15.5h-2z"/>', 1.4);
  let robotsState = null;
  // One bay per charging pad: androids in theirs, free pads waiting on the foundry, and a slot to lay another pad.
  const humanoids = (state, list, bay) => {
    const cap = robotCap(state, 'android'), free = Math.max(0, cap - list.length);
    const pads = Array.from({ length: free }, () => `<div class="bay spare idle" title="A free charging pad: queue an android at the foundry">${humanoid}</div>`).join('');
    return `<section class="fleet humanoids"><header><b>Androids</b><span class="lcd">${list.length}<small>/${cap}</small></span></header><div class="bays">${list.map(r => bay(r, 'A')).join('')}${pads}<button type="button" class="bay spare" data-build="chargepad" title="Lay another charging pad">${svg('<path d="M12 6v12M6 12h12"/>', 1.6)}</button></div></section>`;
  };
  function renderRobots(state) {
    robotsState = state;
    const areas = state.miningAreas ?? [], miners = state.robots.filter(r => r.kind === 'miner'), haulers = state.robots.filter(r => r.kind === 'hauler');
    const androids = state.robots.filter(r => r.kind === 'android'), unlocked = techDone(state, 'androids');
    const key = `${state.robots.map(r => r.id)}|${areas.map(a => a.id)}|${areas.length >= MAX_MINING_AREAS}|${unlocked}|${robotCap(state, 'android')}`;
    if (key !== robotsKey) {
      robotsKey = key;
      const bay = (r, tag) => `<div class="bay" data-robot="${r.id}"><kbd>${tag}${r.id}</kbd><i class="bay-lamp"></i>${pic(`build/${ROBOT_TYPE[r.kind]}`, 'bay-art')}<span class="bay-cargo"></span><i class="bay-charge"><i></i></i>${r.kind === 'miner' ? `<button type="button" class="bay-zone" data-cycle="${r.id}" title="Mining zone: click to change"></button>` : ''}</div>`;
      const spare = (kind, n) => Array.from({ length: Math.max(0, n) }, () => `<button type="button" class="bay spare" data-build="${ROBOT_TYPE[kind]}" title="Build a ${ROBOT_NAME[kind].toLowerCase()}">${svg('<path d="M12 6v12M6 12h12"/>', 1.6)}</button>`).join('');
      const fleet = (kind, list, tag) => `<section class="fleet"><header><b>${ROBOT_NAME[kind]}s</b><span class="lcd">${list.length}<small>/${ROBOT_LIMIT[kind]}</small></span></header><div class="bays">${list.map(r => bay(r, tag)).join('')}${spare(kind, ROBOT_LIMIT[kind] - list.length)}</div></section>`;
      robotsPanel.innerHTML = `${fleet('hauler', haulers, 'H')}${fleet('miner', miners, 'R')}
        ${androids.length || unlocked ? humanoids(state, androids, bay) : `<section class="fleet humanoids" title="Research Androids to build them"><header><b>Androids</b><span class="lcd">–</span></header><div class="bays">${Array.from({ length: HUMANOID_BAYS }, () => `<div class="bay reserved">${humanoid}</div>`).join('')}</div></section>`}
        <section class="fleet"><header><b>Zones</b><span class="lcd">${areas.length}<small>/${MAX_MINING_AREAS}</small></span></header><div class="zones">${areas.map(a => `<div class="zone" data-zone="${a.id}"><span class="zone-tag">${a.id}</span><span class="zone-kind"></span><span class="lcd" data-field="left"></span><button type="button" data-remove-zone="${a.id}" aria-label="Remove zone ${a.id}" title="Remove zone">${svg('<path d="M7 7l10 10M17 7 7 17"/>', 1.8)}</button></div>`).join('')}<button type="button" class="zone spare" data-build="mine" ${areas.length >= MAX_MINING_AREAS ? 'disabled' : ''} title="Mark a mining zone (M)">${svg('<path d="M12 6v12M6 12h12"/>', 1.6)}<kbd>M</kbd></button></div></section>`;
    }
    for (const r of state.robots) {
      const el = robotsPanel.querySelector(`[data-robot="${r.id}"]`), status = robotStatus(r, state);
      if (!el) continue;
      el.dataset.level = lampLevel(status);
      el.title = `${ROBOT_NAME[r.kind]} ${r.id} · ${status?.text ?? 'Ready'} · ${Math.round(r.charge * 100)}%`;
      el.querySelector('.bay-charge i').style.width = `${Math.round(r.charge * 100)}%`;
      if (r.kind === 'android') {
        const carry = r.down ? '' : r.carry ? `${icon(r.carry.item)}<b>${r.carry.n}</b>` : r.weapon ? icon(r.weapon) : '';
        const box = el.querySelector('.bay-cargo'); if (box.dataset.k !== carry) { box.dataset.k = carry; box.innerHTML = carry; }
        continue;
      }
      const cargo = r.cargo >= 1 ? `${ITEM_ICON_URLS[r.load ?? 'regolith'] ? icon(r.load ?? 'regolith') : ''}<b>${Math.floor(r.cargo)}</b>` : '';
      const box = el.querySelector('.bay-cargo'); if (box.dataset.k !== cargo) { box.dataset.k = cargo; box.innerHTML = cargo; }
      const zone = el.querySelector('.bay-zone'); if (zone) zone.textContent = r.area != null ? String(r.area) : 'A';
    }
    for (const a of areas) {
      const el = robotsPanel.querySelector(`[data-zone="${a.id}"]`), kind = areaKind(state, a.id), left = Math.round(remainingRegolith(state, a.id));
      const k = `${kind}|${left}`; if (el.dataset.k === k) continue; el.dataset.k = k;
      el.classList.toggle('exhausted', !left);
      el.querySelector('.zone-kind').innerHTML = kind ? icon(kind === 'ice' ? 'ice' : 'regolith') : '';
      el.querySelector('[data-field=left]').textContent = left ? number(left) : '0';
      el.title = `Zone ${a.id} · ${kind && left ? `${kind === 'ice' ? 'ice' : 'regolith'}, ${left} left` : 'exhausted'} · ${state.robots.filter(r => r.area === a.id).length} rovers assigned`;
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
    if (button.dataset.station) { const id = Number(button.dataset.station); callbacks.onStation?.(button.dataset.close ? { id, close: true } : button.dataset.target ? { id, target: { item: button.dataset.target, delta: Number(button.dataset.delta) * (event.shiftKey ? 5 : 1) } } : button.dataset.make ? { id, make: button.dataset.make } : { id, crop: button.dataset.crop }); stationKey = ''; button.blur(); return; }
    if (button.dataset.crateSlot != null) { callbacks.onTake?.(crateId, Number(button.dataset.crateSlot), event.shiftKey); button.blur(); return; }
    if (button.dataset.slot && crateId != null) { callbacks.onStore?.(crateId, Number(button.dataset.slot), event.shiftKey); button.blur(); return; }
    if (button.dataset.action === 'store-all') { callbacks.onStoreAll?.(crateId); button.blur(); return; }
    if (button.dataset.action === 'take-all') { callbacks.onTakeAll?.(crateId); button.blur(); return; }
    if (button.dataset.action === 'close-store') { setStore(false); callbacks.onCloseStore?.(); button.blur(); return; }
    if (button.dataset.action === 'stock') { setStore(!(storeOpen && crateId == null)); button.blur(); return; }
    if (button.dataset.build) { callbacks.onSelect?.(button.dataset.build); setOpen(false); setRobots(false); }
    else if (button.dataset.removeZone) callbacks.onRemoveZone?.(Number(button.dataset.removeZone));
    else if (button.dataset.cycle && robotsState) {
      const r = robotsState.robots.find(o => o.id === Number(button.dataset.cycle)), options = [null, ...(robotsState.miningAreas ?? []).map(a => a.id)];
      if (r) callbacks.onAssign?.(r.id, options[(options.indexOf(r.area ?? null) + 1) % options.length]);
      button.blur();
    }
    else if (button.dataset.action === 'robots') setRobots(robotsPanel.hidden);
    else if (button.dataset.action === 'orbit') callbacks.onOrbit?.();
    else if (button.dataset.action === 'replay') speak(spoken.text);
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
    robotsOpen: () => !robotsPanel.hidden,
    storeOpen: () => storeOpen,
    toggleStock() { setStore(!(storeOpen && crateId == null)); },
    openCrate(id) { setStore(true, id); },
    closeStore() { setStore(false); },
    get crateId() { return crateId; },
    moveTip: placeTip,
    update(state, view = {}) {
      const selected = view.selectedType || null;
      root.querySelector('.construction').dataset.underground = String(state.player.cave != null);
      const now = performance.now();
      if (!robotsPanel.hidden && now - robotsAt > 250) { robotsAt = now; renderRobots(state); }
      if (storeOpen) renderStore(state);
      // Unspent research points ride on the research button.
      const badge = root.querySelector('.research-badge'), points = Math.floor(state.research?.bank ?? 0);
      if (badge.textContent !== String(points)) { badge.textContent = String(points); badge.hidden = !points; }
      fields.oxygen.textContent = number(state.reserves?.oxygen);
      fields.water.textContent = number(state.reserves?.water);
      fields.power.textContent = `${number(state.power.generation)} / ${number(state.power.demand)}`;
      fields.power.closest('.readout').classList.toggle('insufficient', state.power.powered === false);
      fields.battery.textContent = `${number(state.power.stored)} / ${number(state.power.capacity)}`;
      const satiety = state.player.satiety ?? 100, status = hunger(satiety);
      fields.food.textContent = status.label ?? `${Math.round(satiety)}%`;
      // The paste window spans 11%–89% of the tube render.
      foodMeter.style.clipPath = `inset(0 ${(88.9 - Math.max(0, Math.min(100, satiety)) * .778).toFixed(1)}% 0 0)`;
      food.dataset.tone = satiety <= 0 ? 'starving' : status.label ? 'hungry' : 'fed';
      const suit = state.player.health ?? 100;
      fields.health.textContent = `${Math.ceil(suit)}%`;
      plates.forEach((el, i) => { const share = 100 / PLATES, state = suit >= (i + 1) * share - .01 ? 'whole' : suit > i * share ? 'cracked' : 'empty'; if (el.dataset.state !== state) el.dataset.state = state; });
      health.dataset.tone = suit < 30 ? 'critical' : suit < 70 ? 'worn' : 'sound';
      slots.forEach((el, i) => {
        const slot = state.inventory[i], active = i === view.selectedSlot, k = slot ? `${slot.item}:${slot.count}` : '';
        el.classList.toggle('selected', active); el.setAttribute('aria-pressed', String(active));
        if (el.dataset.content === k) return;
        el.dataset.content = k; el.classList.toggle('empty', !slot);
        el.querySelector('.slot-icon').innerHTML = slot ? `<img src="${ITEM_ICON_URLS[slot.item]}" width="256" height="256" alt="" aria-hidden="true" draggable="false">` : '';
        el.querySelector('strong').textContent = slot && slot.count > 1 ? slot.count : '';
        el.dataset.item = slot?.item ?? '';
        el.title = slot ? `${ITEM_INFO[slot.item].name} × ${slot.count}${ITEM_INFO[slot.item].food ? ' · click to eat' : slot.item === 'flare' ? ' · click to throw' : ''}` : 'Empty';
        el.setAttribute('aria-label', `Slot ${slotKey(i)}: ${el.title}`);
      });
      tools.hidden = !selected; label.textContent = selected ? TOOLS[selected].name : '';
      rotateButton.hidden = selected === 'mine' || selected === 'dismantle' || !!TOOLS[selected]?.paint;
      const invalid = selected && view.placementReason && !/^(Click|Drag)|release to place/.test(view.placementReason);
      reasonLabel.textContent = invalid ? view.placementReason : ''; reasonLabel.hidden = !invalid;
      const tip = view.blueprintTip;
      blueprintTip.hidden = !tip;
      if (tip) {
        const key = JSON.stringify([tip.id, Math.floor(tip.progress * 100), tip.items]);
        if (key !== tipKey) {
          tipKey = key;
          const name = item => ITEM_INFO[item]?.name ?? item, short = tip.items.filter(i => i.short), away = short.some(i => i.have + i.away >= i.owed);
          const rows = tip.items.map(i => `<li class="${i.owed === 0 ? 'done' : i.short ? 'short' : 'ok'}"><img src="${ITEM_ICON_URLS[i.item]}" alt="" aria-hidden="true" draggable="false"><span>${name(i.item)}</span><b>${i.owed === 0 ? 'Supplied' : `${number(i.owed)} more`}</b><small>${i.owed === 0 ? '' : `${number(i.have)} on hand${i.away ? ` · ${number(i.away)} in crates out of range` : ''}`}</small></li>`).join('');
          const foot = short.length ? `Missing ${short.map(i => name(i.item).toLowerCase()).join(', ')}${away ? '. Carry it from the crates, or build within their range.' : '.'}` : 'Hold <kbd>E</kbd> within 5 m to build.';
          blueprintTip.innerHTML = `<header><strong>${DEFS[tip.type].name}</strong><span>${tip.wreck ? 'Wrecked' : 'Blueprint'} · ${Math.floor(tip.progress * 100)}%</span></header><ul>${rows}</ul><p class="${short.length ? 'missing' : ''}">${foot}</p>`;
          tipSize = { w: blueprintTip.offsetWidth, h: blueprintTip.offsetHeight };
          placeTip();
        }
      } else tipKey = '';
      renderStation(state, selected ? null : view.station);
      renderBuffs(state);
      const inHand = state.inventory[view.selectedSlot], held = state.inventory[view.foodSlot ?? view.selectedSlot], edible = ITEM_INFO[held?.item]?.food && satiety < 100;
      // Items are used by clicking with them in hand; the hint names the slot key when they're elsewhere.
      const use = (item, verb) => inHand?.item === item ? `<kbd>Click</kbd> ${verb}` : `<kbd>${slotKey(state.inventory.findIndex(s => s?.item === item))}</kbd> ${verb}`;
      const lines = [];
      if (view.missionUse) lines.push(`<kbd>E</kbd> ${view.missionUse.verb}${view.missionUse.hold && view.missionUse.progress > 0 ? ` <span class="hint-progress"><i style="transform:scaleX(${view.missionUse.progress})"></i></span>` : ''}`);
      else if (view.use && !view.nearbyBuilding) lines.push(`<kbd>E</kbd> ${view.use.verb}`);
      if (state.player.cave != null || infested(state) || view.night) {
        const flares = count(state.inventory, 'flare');
        if (flares) lines.push(`${use('flare', 'Throw flare')} · ${flares}`);
        else if (available(state, 'metal') >= 2) lines.push('<kbd>X</kbd> Make 3 flares · 2 metal');
      }
      if (edible && (status.label || satiety < 70)) lines.push(`${use(held.item, 'Eat')} ${RECIPES[held.item] ? ITEM_INFO[held.item].name.toLowerCase() : `raw ${ITEM_INFO[held.item].name.toLowerCase()}`}`);
      const next = lines.join('<span class="hint-gap"></span>');
      if (next !== hintKey) { hintKey = next; hint.innerHTML = next; hint.hidden = !next; }
      for (const item of items) {
        const active = item.dataset.build === selected; item.setAttribute('aria-pressed', String(active)); item.classList.toggle('selected', active);
        const def = TOOLS[item.dataset.build]; item.classList.toggle('unaffordable', !canPay(state, def.cost ?? {}));
        // Technology stays out of the menu until it is unlocked.
        const locked = !!view.locked?.[item.dataset.build];
        if (item.hidden !== locked) { item.hidden = locked; menuKey = ''; }
      }
      if (!menuKey) { menuKey = 'shown'; for (const h of menu.querySelectorAll('h3')) { let n = h.nextElementSibling, any = false; while (n && n.tagName !== 'H3') { any ||= !n.hidden; n = n.nextElementSibling; } h.hidden = !any; } }
      const goal = view.objective;
      panel.hidden = !goal || state.player.cave != null;
      if (goal) {
        const key = `${goal.step}`;
        if (key !== objectiveKey) {
          const first = !objectiveKey; objectiveKey = key;
          if (!first) { panel.classList.add('fresh'); clearTimeout(freshTimer); freshTimer = setTimeout(() => panel.classList.remove('fresh'), 4000); }
        }
        const note = aiNote && aiNote.until > performance.now() ? aiNote.text : null, message = note ?? goal.message;
        // The ship AI's line types out under the comms unit, lingers, then tucks away until the next one.
        if (message !== spoken.text) speak(message);
        const elapsed = performance.now() - spoken.at, shown = Math.min(spoken.text.length, Math.floor(elapsed / TYPE_MS));
        if (shown !== spoken.shown) { spoken.shown = shown; panelMessage.textContent = spoken.text.slice(0, shown); }
        panel.classList.toggle('tucked', elapsed > spoken.text.length * TYPE_MS + LINGER_MS);
        panel.classList.toggle('aside', !!note);
        const id = goal.done ? 'done' : goal.id;
        if (id !== orderId) { orderId = id; orderImage.src = orderArt(id); }
        panelTask.textContent = goal.done ? 'All objectives complete' : goal.objective;
        panel.classList.toggle('complete', !!goal.done);
        const [have, need] = goal.done ? [1, 1] : goal.parts ?? [0, 1], pk = `${have}/${need}`;
        if (pk !== pipsKey) { pipsKey = pk; pips.innerHTML = Array.from({ length: need }, (_, i) => `<i${i < have ? ' class="on"' : ''}></i>`).join(''); pips.title = need > 1 ? `${have} of ${need}` : ''; }
        panelDistance.textContent = goal.distance != null && goal.distance > 6 ? `${goal.distance} m` : '';
      }
    },
    /** A passing remark from the ship AI, shown over the current objective for a while. */
    say(text) { aiNote = { text, until: performance.now() + 14000 }; panel.classList.add('fresh'); clearTimeout(freshTimer); freshTimer = setTimeout(() => panel.classList.remove('fresh'), 4000); },
    notify(message) { clearTimeout(noticeTimer); notice.textContent = message; notice.hidden = false; noticeTimer = setTimeout(() => { notice.hidden = true; }, 2600); },
    dispose() { clearTimeout(noticeTimer); clearTimeout(freshTimer); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); window.removeEventListener('keydown', onKey); root.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', endDrag); window.removeEventListener('pointercancel', endDrag); drag?.ghost?.remove(); root.replaceChildren(); root.classList.remove('game-ui'); },
  };
}
