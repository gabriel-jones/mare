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
const GROUPS = [['Power & industry', ['solar', 'battery', 'hopper', 'conveyor', 'processor', 'melter', 'storage']], ['Rooms', ['habitat', 'greenhouse', 'airlock']], ['Fittings', ['growbed', 'hydrorack', 'verticalfarm', 'mushroomtray', 'galley', 'mill', 'armory', 'recycler']], ['Space', ['fabricator', 'assembler', 'electrolyser', 'tank', 'dock', 'roverbay']], ['Deep', ['xenolab', 'reactor', 'goovat']], ['Tools', ['mine', 'dismantle']]];
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
    <div class="resource-bar" aria-label="Colony resources">
      <span class="readout" title="Oxygen reserve: fills rooms; vented from regolith processing">${pic('icons/oxygen', 'readout-art')}<span class="lcd"><small>O₂</small><strong data-value="oxygen">0</strong></span></span>
      <span class="readout" title="Water reserve: grow beds drink it; recyclers reclaim it">${pic('icons/water', 'readout-art')}<span class="lcd"><small>H₂O</small><strong data-value="water">0</strong></span></span>
      <span class="readout power-resource" title="Power generation / demand">${pic('icons/power', 'readout-art')}<span class="lcd"><strong data-value="power">0</strong><small>kW</small></span></span>
      <span class="readout" title="Battery charge">${pic('icons/battery', 'readout-art')}<span class="lcd"><strong data-value="battery">0 / 0</strong><small>kJ</small></span></span>
      <span class="readout health-resource" title="Suit integrity. Vents and toxic pools wear it down; it recovers on the surface. At zero you black out.">${pic('icons/suit', 'readout-art')}<span class="plates">${'<i data-state="whole"></i>'.repeat(PLATES)}</span><strong data-value="health">100%</strong></span>
      <span class="readout food-resource" title="How fed you are. Hungry below 35%: slower walking and building.">${pic('icons/food', 'readout-art')}<span class="tube"><i></i></span><strong data-value="food">100%</strong></span>
    </div>
    <div class="buffs" aria-label="Meal effects"></div>
    <section class="objective" aria-label="Ship AI" aria-live="polite">
      <div class="comms">
        <button type="button" class="comms-unit" data-action="replay" title="Ship AI · replay message">${pic('icons/comms')}</button>
        <p class="objective-message"></p>
      </div>
      <div class="work-order">
        <img class="order-art" alt="" aria-hidden="true" draggable="false">
        <div class="order-body">
          <small class="order-head"><span>Work order</span><span class="objective-step"></span></small>
          <strong class="objective-task"></strong>
          <span class="order-foot"><span class="pips"></span><small class="objective-distance"></small></span>
        </div>
      </div>
    </section>
    <div class="hotbar" role="toolbar" aria-label="Inventory">
      ${Array.from({ length: 10 }, (_, i) => `<button type="button" class="slot" data-slot="${i}" aria-pressed="false"><kbd>${slotKey(i)}</kbd><span class="slot-icon"></span><strong></strong></button>`).join('')}
    </div>
    <div class="construction">
      <div class="station" aria-label="Station" hidden></div>
      <div class="context-hint" hidden></div>
      <div id="build-menu" class="build-menu" aria-label="Construction" hidden>
        ${GROUPS.map(([title, types]) => `<h3>${title}</h3>${types.map(type => { const def = TOOLS[type]; return `<button type="button" class="build-item" data-build="${type}" aria-pressed="false" title="${def.description}${def.cost ? ` · ${costText(def)}` : ''}">${pic(`build/${type}`, 'build-art')}<span>${def.name}</span><kbd>${def.key?.toUpperCase() ?? ''}</kbd></button>`; }).join('')}`).join('')}
      </div>
      <div class="robots-panel" aria-label="Robots" hidden></div>
      <button type="button" class="build-toggle" data-action="build" aria-expanded="false" aria-controls="build-menu">${pic('icons/build', 'key-art')}<span>Build</span><kbd>B</kbd></button>
      <button type="button" class="build-toggle robots-toggle" data-action="robots" aria-expanded="false" aria-label="Robots" title="Robots (G)">${pic('icons/robots', 'key-art')}<kbd>G</kbd></button>
      <button type="button" class="build-toggle robots-toggle stock-toggle" data-action="stock" aria-expanded="false" aria-label="Base stock" title="Base stock (I)">${pic('icons/stock', 'key-art')}<kbd>I</kbd></button>
      <button type="button" class="build-toggle robots-toggle orbit-toggle" data-action="orbit" aria-label="Orbit" title="Orbit (O)">${pic('icons/orbit', 'key-art')}<kbd>O</kbd><b class="orbit-badge" hidden></b></button>
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
        <header><strong>Base stock</strong><small class="ledger-summary"></small><button type="button" class="ledger-close" data-action="close-store" aria-label="Close" title="Close (Esc)">×</button></header>
        <div class="ledger-rows"></div>
        <p class="ledger-flow">Every crate counts as one store. Building, crafting and cooking use your pockets first, then crate stock while you're within 30 m of a crate. Haulers carry crate stock to fabricators, assemblers and the Starship; belts and haulers drop surplus in the nearest crate with room.</p>
      </div>
    </section>
    <div class="notification" role="status" aria-live="polite" hidden></div>`;
  const fields = Object.fromEntries([...root.querySelectorAll('[data-value]')].map(el => [el.dataset.value, el]));
  const menu = root.querySelector('.build-menu'), toggle = root.querySelector('.build-toggle'), tools = root.querySelector('.selection-tools'), label = root.querySelector('.selected-name'), reasonLabel = root.querySelector('.selected-reason'), notice = root.querySelector('.notification'), hint = root.querySelector('.context-hint');
  const rotateButton = root.querySelector('[data-action=rotate]'), foodMeter = root.querySelector('.tube i'), food = root.querySelector('.food-resource'), plates = [...root.querySelectorAll('.plates i')], health = root.querySelector('.health-resource');
  const items = [...root.querySelectorAll('[data-build]')], slots = [...root.querySelectorAll('[data-slot]')];
  const panel = root.querySelector('.objective'), panelMessage = panel.querySelector('.objective-message'), panelTask = panel.querySelector('.objective-task'), panelStep = panel.querySelector('.objective-step'), panelDistance = panel.querySelector('.objective-distance'), orderImage = panel.querySelector('.order-art'), pips = panel.querySelector('.pips');
  let spoken = { text: '', at: 0, shown: -1 }, orderId = null, pipsKey = '';
  const speak = text => { spoken = { text, at: performance.now(), shown: -1 }; };
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
          item.querySelector('kbd').innerHTML = locked ? pic('icons/lock') : def.key?.toUpperCase() ?? '';
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
        panelStep.textContent = goal.done ? '' : `${goal.step + 1} / ${goal.count}`;
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
