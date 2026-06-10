import { calc, resolve, canPin, sanitizeGrams, DEFAULT_STATE, MAX } from './calc.js';

const STATE_KEY = 'macro-calc-state';
const PINS_KEY = 'macro-calc-pins';
const MACROS = ['protein', 'carb', 'fat'];
const CONTROLS = [...MACROS, 'calories'];
const NO_PINS = { protein: false, carb: false, fat: false, calories: false };
const kcalFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const el = (id) => document.getElementById(id);

let state = loadState();
let pins = loadPins();

function loadState() {
  try {
    const p = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (!p) return structuredClone(DEFAULT_STATE);
    return {
      protein_g: sanitizeGrams(p.protein_g),
      carb_g: sanitizeGrams(p.carb_g),
      fat_g: sanitizeGrams(p.fat_g),
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function loadPins() {
  try {
    const p = JSON.parse(localStorage.getItem(PINS_KEY) ?? 'null');
    if (!p) return structuredClone(NO_PINS);
    const loaded = {
      protein: Boolean(p.protein),
      carb: Boolean(p.carb),
      fat: Boolean(p.fat),
      calories: Boolean(p.calories),
    };
    const count = Object.values(loaded).filter(Boolean).length;
    return count <= 2 ? loaded : structuredClone(NO_PINS);
  } catch {
    return structuredClone(NO_PINS);
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage errors (private mode, quota) */
  }
}

const inputFor = (control) => (control === 'calories' ? el('calories') : el(`${control}-grams`));

function renderLocks() {
  for (const c of CONTROLS) {
    const pinned = pins[c];
    const btn = el(`${c}-lock`);
    btn.textContent = pinned ? '🔒' : '🔓';
    btn.setAttribute('aria-pressed', String(pinned));
    btn.disabled = !canPin(pins, c); // false only when unpinned & would over-constrain
    el(`${c}-slider`).disabled = pinned;
    inputFor(c).disabled = pinned;
  }
}

function render() {
  const { calories, kcal, percent } = calc(state);
  for (const m of MACROS) {
    const grams = state[`${m}_g`];
    el(`${m}-slider`).value = Math.min(grams, MAX[m]);
    el(`${m}-grams`).value = Math.round(grams);
    el(`${m}-kcal`).textContent = kcalFmt.format(kcal[m]);
    el(`${m}-percent`).textContent = percent[m].toFixed(1);
    el(`bar-${m}`).style.width = `${percent[m]}%`;
  }
  el('calories-slider').value = Math.min(calories, MAX.calories);
  el('calories').value = Math.round(calories);
  el('total-kcal').textContent = kcalFmt.format(calories);
  renderLocks();
}

let stateSaveTimer = 0;
function saveStateSoon() {
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(() => save(STATE_KEY, state), 200);
}
// Persist the latest state if the page is hidden/closed before the debounce fires.
addEventListener('pagehide', () => { clearTimeout(stateSaveTimer); save(STATE_KEY, state); });
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { clearTimeout(stateSaveTimer); save(STATE_KEY, state); }
});

function changeControl(control, value) {
  state = resolve(state, pins, control, value);
  saveStateSoon();
  render();
}

function toggleLock(control) {
  if (pins[control]) pins[control] = false;
  else if (canPin(pins, control)) pins[control] = true;
  else return;
  save(PINS_KEY, pins);
  render();
}

function wire() {
  for (const m of MACROS) {
    el(`${m}-slider`).addEventListener('input', (e) => changeControl(m, e.target.value));
    el(`${m}-grams`).addEventListener('input', (e) => changeControl(m, e.target.value));
  }
  el('calories-slider').addEventListener('input', (e) => changeControl('calories', e.target.value));
  el('calories').addEventListener('change', (e) => changeControl('calories', e.target.value));
  for (const c of CONTROLS) el(`${c}-lock`).addEventListener('click', () => toggleLock(c));
  render();
}

wire();
