import { calc, resolve, canPin, sanitizeGrams, DEFAULT_STATE, MAX } from './calc.js';

const STATE_KEY = 'macro-calc-state';
const PINS_KEY = 'macro-calc-pins';
const MACROS = ['protein', 'carb', 'fat'];
const CONTROLS = ['protein', 'carb', 'fat', 'calories'];
const NO_PINS = { protein: false, carb: false, fat: false, calories: false };
const el = (id) => document.getElementById(id);

let state = loadState();
let pins = loadPins();

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const p = JSON.parse(raw);
    return {
      protein_g: sanitizeGrams(p.protein_g),
      carb_g: sanitizeGrams(p.carb_g),
      fat_g: sanitizeGrams(p.fat_g),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function loadPins() {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (!raw) return { ...NO_PINS };
    const p = JSON.parse(raw);
    const loaded = {
      protein: !!p.protein,
      carb: !!p.carb,
      fat: !!p.fat,
      calories: !!p.calories,
    };
    const count =
      (loaded.protein ? 1 : 0) +
      (loaded.carb ? 1 : 0) +
      (loaded.fat ? 1 : 0) +
      (loaded.calories ? 1 : 0);
    return count <= 2 ? loaded : { ...NO_PINS };
  } catch {
    return { ...NO_PINS };
  }
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function savePins() {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    /* ignore */
  }
}

function inputFor(control) {
  return control === 'calories' ? el('calories') : el(`${control}-grams`);
}

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
    el(`${m}-kcal`).textContent = Math.round(kcal[m]);
    el(`${m}-percent`).textContent = percent[m].toFixed(1);
    el(`bar-${m}`).style.width = `${percent[m]}%`;
  }
  el('calories-slider').value = Math.min(calories, MAX.calories);
  el('calories').value = Math.round(calories);
  el('total-kcal').textContent = Math.round(calories);
  renderLocks();
}

function changeControl(control, value) {
  state = resolve(state, pins, control, value);
  saveState();
  render();
}

function toggleLock(control) {
  if (pins[control]) {
    pins[control] = false;
  } else if (canPin(pins, control)) {
    pins[control] = true;
  } else {
    return;
  }
  savePins();
  render();
}

function wire() {
  for (const m of MACROS) {
    el(`${m}-slider`).addEventListener('input', (e) => changeControl(m, e.target.value));
    el(`${m}-grams`).addEventListener('input', (e) => changeControl(m, e.target.value));
  }
  el('calories-slider').addEventListener('input', (e) => changeControl('calories', e.target.value));
  el('calories').addEventListener('change', (e) => changeControl('calories', e.target.value));
  for (const c of CONTROLS) {
    el(`${c}-lock`).addEventListener('click', () => toggleLock(c));
  }
  render();
}

wire();
