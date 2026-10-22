import { DEFS } from './sim.js';
import { ITEM_INFO } from './defs.js';
import { count } from './inventory.js';
import { hunger } from './life.js';

const ICONS = {
  solar: '<path d="M4 4h16l2 13H2L4 4Zm8 0v13M3 10h18M8 17l-1 4m9-4 1 4M6 21h12"/>',
  battery: '<path d="M9 3h6v3H9zM6 6h12v16H6zM13 9l-3 5h4l-3 5"/>',
  hopper: '<path d="M3 4h18l-5 10v6l-8 2v-8L3 4Zm2 5h14"/>',
  habitat: '<path d="m3 9 9-6 9 6v12H3V9Zm6 12v-8h6v8M3 9h18"/>',
  greenhouse: '<path d="M3 21V10l9-6 9 6v11Zm0-6h18M9 7v14m6-14v14"/>',
  airlock: '<path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M3 21h18M12 3v18"/><path d="m8 12-2 0m10 0 2 0"/>',
  growbed: '<path d="M3 15h18l-2 6H5ZM12 15V8m0 3c-3 0-4-2-4-4 3 0 4 2 4 4Zm0-2c0-3 2-4 4-4 0 3-2 4-4 4Z"/>',
  galley: '<path d="M3 11h18v10H3ZM3 15h18M8 7c0-2 2-2 2-4m4 4c0-2 2-2 2-4"/>',
  recycler: '<path d="M12 3s5 6 5 9.5a5 5 0 0 1-10 0C7 9 12 3 12 3Z"/><path d="m9 13 2 2 4-4"/>',
  lamp: '<path d="M12 10v12M6 22h12M8 10h8l-1-5H9l-1 5ZM12 1v1M3 6l2 1m14 0 2-1M5 13l2-2m10 0 2 2"/>',
  conveyor: '<path d="M3 15h18M3 19h18M7 15v4m5-4v4m5-4v4"/><path d="m9 6 3 3-3 3m4-6 3 3-3 3"/>',
  processor: '<path d="M3 21V11h6l3-3h4v13Zm13-13V3h4v18M7 15h2m2 0h2"/><circle cx="18" cy="13" r="1"/>',
  storage: '<path d="M4 8 12 4l8 4v8l-8 4-8-4Z"/><path d="m4 8 8 4 8-4M12 12v8"/>',
  melter: '<path d="M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8H8a4 4 0 0 1-4-4Z"/><path d="M9 8v8m6-8v8M12 19v2M7 3l2 2 2-2"/>',
  mine: '<path d="M4 4h16v16H4z" stroke-dasharray="3 2"/><path d="m8 15 3-5 2 2 1.5-2L17 15Z"/>',
  dismantle: '<path d="M5 19 15 9m-1-4 5 5-2 2-5-5Z"/><path d="m4 4 4 4M8 4 4 8"/>',
};
const ITEM_ICONS = {
  metal: '<path d="M3 15 8 9h13l-5 6Z"/><path d="M3 15v3h13l5-6V9M16 15v3"/>',
  silicon: '<path d="m12 3 8 5v8l-8 5-8-5V8Z"/><path d="m4 8 8 5 8-5M12 13v8"/>',
  crop: '<path d="M7 11c0-4 3-7 6-7s5 3 5 6c0 5-3 10-7 10-3 0-4-3-4-9Z"/><path d="M11 9h.01M14 13h.01M10 15h.01"/>',
  meal: '<path d="M3 12h18a9 9 0 0 1-18 0Z"/><path d="M9 8c0-2 2-2 2-4m3 4c0-2 2-2 2-4"/>',
  core: '<path d="M7 4h10v16H7Z"/><path d="M10 8h4v8h-4ZM4 7h3m-3 5h3m-3 5h3m10-10h3m-3 5h3m-3 5h3"/>',
};
const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
const TOOLS = {
  ...DEFS,
  mine: { name: 'Mining area', key: 'm', description: 'Choose a 7 × 7 patch for the rover to excavate. It unloads at the nearest hopper.' },
  dismantle: { name: 'Dismantle', key: 'z', description: 'Click or drag over structures and blueprints to take them down. Materials are returned.' },
};
// Palette sections, in menu order.
const GROUPS = [['Power & industry', ['solar', 'battery', 'lamp', 'hopper', 'conveyor', 'processor', 'melter', 'storage']], ['Rooms', ['habitat', 'greenhouse', 'airlock']], ['Fittings', ['growbed', 'galley', 'recycler']], ['Tools', ['mine', 'dismantle']]];
const svg = (paths, width = 1.5) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const costText = def => def.cost ? Object.entries(def.cost).map(([item, n]) => `${n} ${item}`).join(', ') : 'Free';
const slotKey = i => String((i + 1) % 10);

export function createUI(root, callbacks = {}) {
  root.classList.add('game-ui');
  const buildIcon = svg('<path d="m14 4 6 6-3 3-2-2-8 9-3-3 9-8-2-2 3-3Z"/>', 1.6);
  root.innerHTML = `
    <div class="resource-bar" aria-label="Colony resources">
      <span title="Oxygen reserve: fills rooms; vented from regolith processing"><i class="resource-dot oxygen"></i><span>O₂</span><strong data-value="oxygen">0</strong></span>
      <span title="Water reserve: grow beds drink it; recyclers reclaim it"><i class="resource-dot water"></i><span>Water</span><strong data-value="water">0</strong></span>
      <span class="power-resource" title="Power generation / demand">⚡<strong data-value="power">0</strong><small>kW</small></span>
      <span title="Battery charge"><span class="battery-symbol"></span><strong data-value="battery">0 / 0</strong><small>kJ</small></span>
      <span class="food-resource" title="How fed you are. Hungry below 35%: slower walking and building."><span>Food</span><span class="food-meter"><i></i></span><strong data-value="food">100%</strong></span>
    </div>
    <section class="objective" aria-label="Ship AI" aria-live="polite">
      <header><span class="objective-source">Ship AI</span><small class="objective-step"></small></header>
      <p class="objective-message"></p>
      <div class="objective-task"><i></i><strong></strong><small class="objective-distance"></small></div>
    </section>
    <div class="hotbar" role="toolbar" aria-label="Inventory">
      ${Array.from({ length: 10 }, (_, i) => `<button type="button" class="slot" data-slot="${i}" aria-pressed="false"><kbd>${slotKey(i)}</kbd><span class="slot-icon"></span><strong></strong></button>`).join('')}
    </div>
    <div class="construction">
      <div class="context-hint" hidden></div>
      <div id="build-menu" class="build-menu" aria-label="Construction" hidden>
        ${GROUPS.map(([title, types]) => `<h3>${title}</h3>${types.map(type => { const def = TOOLS[type]; return `<button type="button" class="build-item" data-build="${type}" aria-pressed="false" title="${def.description}${def.cost ? ` · ${costText(def)}` : ''}">${svg(ICONS[type] || ICONS.habitat)}<span>${def.name}</span><kbd>${def.key.toUpperCase()}</kbd></button>`; }).join('')}`).join('')}
      </div>
      <button type="button" class="build-toggle" data-action="build" aria-expanded="false" aria-controls="build-menu">${buildIcon}<span>Build</span></button>
      <div class="selection-tools" hidden>
        <span class="selected-name"></span>
        <small class="selected-reason"></small>
        <button type="button" data-action="rotate" aria-label="Rotate" title="Rotate (R)">↻</button>
        <button type="button" data-action="cancel" aria-label="Cancel" title="Cancel (Esc)">×</button>
      </div>
    </div>
    <div class="notification" role="status" aria-live="polite" hidden></div>`;
  const fields = Object.fromEntries([...root.querySelectorAll('[data-value]')].map(el => [el.dataset.value, el]));
  const menu = root.querySelector('.build-menu'), toggle = root.querySelector('.build-toggle'), tools = root.querySelector('.selection-tools'), label = root.querySelector('.selected-name'), reasonLabel = root.querySelector('.selected-reason'), notice = root.querySelector('.notification'), hint = root.querySelector('.context-hint');
  const rotateButton = root.querySelector('[data-action=rotate]'), foodMeter = root.querySelector('.food-meter i'), food = root.querySelector('.food-resource');
  const items = [...root.querySelectorAll('[data-build]')], slots = [...root.querySelectorAll('[data-slot]')];
  const panel = root.querySelector('.objective'), panelMessage = panel.querySelector('.objective-message'), panelTask = panel.querySelector('.objective-task strong'), panelStep = panel.querySelector('.objective-step'), panelDistance = panel.querySelector('.objective-distance');
  let noticeTimer, hintKey = '', objectiveKey = '', aiNote = null, freshTimer;
  const setOpen = open => { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
  const onClick = event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.build) { callbacks.onSelect?.(button.dataset.build); setOpen(false); }
    else if (button.dataset.slot) callbacks.onSlot?.(Number(button.dataset.slot));
    else if (button.dataset.action === 'build') setOpen(menu.hidden);
    else if (button.dataset.action === 'rotate') callbacks.onRotate?.();
    else if (button.dataset.action === 'cancel') { callbacks.onCancel?.(); setOpen(false); }
    button.blur();
  };
  const onKey = event => { if (event.key === 'Escape') setOpen(false); };
  root.addEventListener('click', onClick); window.addEventListener('keydown', onKey);
  return {
    update(state, view = {}) {
      const selected = view.selectedType || null;
      root.querySelector('.construction').hidden = state.player.cave != null;
      fields.oxygen.textContent = number(state.reserves?.oxygen);
      fields.water.textContent = number(state.reserves?.water);
      fields.power.textContent = `${number(state.power.generation)} / ${number(state.power.demand)}`;
      fields.power.parentElement.classList.toggle('insufficient', state.power.powered === false);
      fields.battery.textContent = `${number(state.power.stored)} / ${number(state.power.capacity)}`;
      const satiety = state.player.satiety ?? 100, status = hunger(satiety);
      fields.food.textContent = status.label ?? `${Math.round(satiety)}%`;
      foodMeter.style.transform = `scaleX(${satiety / 100})`;
      food.dataset.tone = satiety <= 0 ? 'starving' : status.label ? 'hungry' : 'fed';
      slots.forEach((el, i) => {
        const slot = state.inventory[i], active = i === view.selectedSlot, k = slot ? `${slot.item}:${slot.count}` : '';
        el.classList.toggle('selected', active); el.setAttribute('aria-pressed', String(active));
        if (el.dataset.content === k) return;
        el.dataset.content = k; el.classList.toggle('empty', !slot);
        el.querySelector('.slot-icon').innerHTML = slot ? svg(ITEM_ICONS[slot.item]) : '';
        el.querySelector('strong').textContent = slot && slot.count > 1 ? slot.count : '';
        el.dataset.item = slot?.item ?? '';
        el.title = slot ? `${ITEM_INFO[slot.item].name} × ${slot.count}${ITEM_INFO[slot.item].food ? ' · F to eat' : ''}` : 'Empty';
        el.setAttribute('aria-label', `Slot ${slotKey(i)}: ${el.title}`);
      });
      tools.hidden = !selected; label.textContent = selected ? TOOLS[selected].name : '';
      rotateButton.hidden = selected === 'mine' || selected === 'dismantle' || !!TOOLS[selected]?.paint;
      const invalid = selected && view.placementReason && !/^(Click|Drag)|release to place/.test(view.placementReason);
      reasonLabel.textContent = invalid ? view.placementReason : ''; reasonLabel.hidden = !invalid;
      const held = state.inventory[view.foodSlot ?? view.selectedSlot], edible = ITEM_INFO[held?.item]?.food && satiety < 100;
      const lines = [];
      if (view.missionUse) lines.push(`<kbd>E</kbd> ${view.missionUse.verb}${view.missionUse.hold && view.missionUse.progress > 0 ? ` <span class="hint-progress"><i style="transform:scaleX(${view.missionUse.progress})"></i></span>` : ''}`);
      else if (view.use && !view.nearbyBuilding) lines.push(`<kbd>E</kbd> ${view.use.verb}`);
      if (edible && (status.label || satiety < 70)) lines.push(`<kbd>F</kbd> Eat ${held.item === 'meal' ? 'meal' : 'raw potato'}`);
      const next = lines.join('<span class="hint-gap"></span>');
      if (next !== hintKey) { hintKey = next; hint.innerHTML = next; hint.hidden = !next; }
      for (const item of items) {
        const active = item.dataset.build === selected; item.setAttribute('aria-pressed', String(active)); item.classList.toggle('selected', active);
        const def = TOOLS[item.dataset.build]; item.classList.toggle('unaffordable', Object.entries(def.cost ?? {}).some(([key, cost]) => count(state.inventory, key) < cost));
        const locked = view.locked?.[item.dataset.build];
        if (item.classList.contains('locked') !== !!locked) {
          item.classList.toggle('locked', !!locked);
          item.querySelector('kbd').innerHTML = locked ? svg(LOCK, 1.8) : def.key.toUpperCase();
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
    dispose() { clearTimeout(noticeTimer); clearTimeout(freshTimer); root.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); root.replaceChildren(); root.classList.remove('game-ui'); },
  };
}
