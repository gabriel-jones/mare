import { DEFS } from './sim.js';

const ICONS = {
  solar: '<path d="M4 4h16l2 13H2L4 4Zm8 0v13M3 10h18M8 17l-1 4m9-4 1 4M6 21h12"/>',
  battery: '<path d="M9 3h6v3H9zM6 6h12v16H6zM13 9l-3 5h4l-3 5"/>',
  hopper: '<path d="M3 4h18l-5 10v6l-8 2v-8L3 4Zm2 5h14"/>',
  habitat: '<path d="m3 9 9-6 9 6v12H3V9Zm6 12v-8h6v8M3 9h18"/>',
  lamp: '<path d="M12 10v12M6 22h12M8 10h8l-1-5H9l-1 5ZM12 1v1M3 6l2 1m14 0 2-1M5 13l2-2m10 0 2 2"/>',
  conveyor: '<path d="M3 15h18M3 19h18M7 15v4m5-4v4m5-4v4"/><path d="m9 6 3 3-3 3m4-6 3 3-3 3"/>',
  processor: '<path d="M3 21V11h6l3-3h4v13Zm13-13V3h4v18M7 15h2m2 0h2"/><circle cx="18" cy="13" r="1"/>',
  storage: '<path d="M4 8 12 4l8 4v8l-8 4-8-4Z"/><path d="m4 8 8 4 8-4M12 12v8"/>',
  mine: '<path d="M4 4h16v16H4z" stroke-dasharray="3 2"/><path d="m8 15 3-5 2 2 1.5-2L17 15Z"/>',
};
const TOOLS = { ...Object.fromEntries(Object.entries(DEFS).map(([type, def]) => [type, def])), mine: { name: 'Mining area', description: 'Choose a 7 × 7 patch for the rover to excavate. It unloads at the nearest hopper.' } };
const svg = (type) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[type] || ICONS.habitat}</svg>`;
const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const costText = def => def.cost ? Object.entries(def.cost).map(([item, n]) => `${n} ${item}`).join(', ') : 'Free';

export function createUI(root, callbacks = {}) {
  root.classList.add('game-ui');
  const buildIcon='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m14 4 6 6-3 3-2-2-8 9-3-3 9-8-2-2 3-3Z"/></svg>';
  root.innerHTML = `
    <div class="resource-bar" aria-label="Colony resources">
      <span title="Metal"><i class="resource-dot metal"></i><span>Metal</span><strong data-value="metal">0</strong></span>
      <span title="Silicon"><i class="resource-dot silicon"></i><span>Silicon</span><strong data-value="silicon">0</strong></span>
      <span title="Oxygen reserve, vented from regolith processing"><i class="resource-dot oxygen"></i><span>O₂</span><strong data-value="oxygen">0</strong></span>
      <span class="power-resource" title="Power generation / demand">⚡<strong data-value="power">0</strong><small>kW</small></span>
      <span title="Battery charge"><span class="battery-symbol"></span><strong data-value="battery">0 / 0</strong><small>kJ</small></span>
    </div>
    <div class="construction">
      <div class="context-hint" hidden></div>
      <div id="build-menu" class="build-menu" aria-label="Construction" hidden>
        ${Object.entries(TOOLS).map(([type,def])=>`<button type="button" class="build-item" data-build="${type}" aria-pressed="false" title="${def.description} · ${costText(def)}">${svg(type)}<span>${def.name}</span></button>`).join('')}
      </div>
      <button type="button" class="build-toggle" data-action="build" aria-expanded="false" aria-controls="build-menu">${buildIcon}<span>Build</span></button>
      <div class="selection-tools" hidden>
        <span class="selected-name"></span>
        <small class="selected-reason"></small>
        <button type="button" data-action="rotate" aria-label="Rotate" title="Rotate">↻</button>
        <button type="button" data-action="cancel" aria-label="Cancel" title="Cancel">×</button>
      </div>
    </div>
    <div class="notification" role="status" aria-live="polite" hidden></div>`;
  const fields=Object.fromEntries([...root.querySelectorAll('[data-value]')].map(el=>[el.dataset.value,el]));
  const menu=root.querySelector('.build-menu'),toggle=root.querySelector('.build-toggle'),tools=root.querySelector('.selection-tools'),label=root.querySelector('.selected-name'),reasonLabel=root.querySelector('.selected-reason'),notice=root.querySelector('.notification'),hint=root.querySelector('.context-hint');
  const rotateButton=root.querySelector('[data-action=rotate]');
  const items=[...root.querySelectorAll('[data-build]')];
  let selected=null,noticeTimer;
  const setOpen=open=>{menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
  const onClick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.build){callbacks.onSelect?.(button.dataset.build);setOpen(false);}
    else if(button.dataset.action==='build')setOpen(menu.hidden);
    else if(button.dataset.action==='rotate')callbacks.onRotate?.();
    else if(button.dataset.action==='cancel'){callbacks.onCancel?.();setOpen(false);}
    button.blur();
  };
  const onKey=event=>{if(event.key==='Escape')setOpen(false);};
  root.addEventListener('click',onClick);window.addEventListener('keydown',onKey);
  return {
    update(state,view={}){
      selected=view.selectedType||null;
      root.querySelector('.construction').hidden=state.player.cave!=null;
      fields.metal.textContent=number(state.inventory.metal);fields.silicon.textContent=number(state.inventory.silicon);
      fields.oxygen.textContent=number(state.reserves?.oxygen);
      fields.power.textContent=`${number(state.power.generation)} / ${number(state.power.demand)}`;
      fields.power.parentElement.classList.toggle('insufficient',state.power.powered===false);
      fields.battery.textContent=`${number(state.power.stored)} / ${number(state.power.capacity)}`;
      tools.hidden=!selected;label.textContent=selected?TOOLS[selected].name:'';
      rotateButton.hidden=selected==='mine';
      const invalid=selected&&view.placementReason&&!/^(Click|Drag)/.test(view.placementReason);
      reasonLabel.textContent=invalid?view.placementReason:'';reasonLabel.hidden=!invalid;
      const crate=view.nearbyStorage,goods=crate?(crate.inv.metal||0)+(crate.inv.silicon||0):0;
      hint.hidden=!goods||!!view.nearbyBuilding;if(goods)hint.innerHTML=`<kbd>E</kbd> Collect ${crate.inv.metal} metal · ${crate.inv.silicon} silicon`;
      for(const item of items){const active=item.dataset.build===selected;item.setAttribute('aria-pressed',String(active));item.classList.toggle('selected',active);const def=TOOLS[item.dataset.build];item.classList.toggle('unaffordable',Object.entries(def.cost??{}).some(([key,cost])=>state.inventory[key]<cost));}
    },
    notify(message){clearTimeout(noticeTimer);notice.textContent=message;notice.hidden=false;noticeTimer=setTimeout(()=>{notice.hidden=true;},2600);},
    dispose(){clearTimeout(noticeTimer);root.removeEventListener('click',onClick);window.removeEventListener('keydown',onKey);root.replaceChildren();root.classList.remove('game-ui');}
  };
}
