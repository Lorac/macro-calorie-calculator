import { calc, scaleToCalories, sanitizeGrams, DEFAULT_STATE, MAX } from './calc.js';

const STORAGE_KEY = 'macro-calc-state';
const MACROS = ['protein', 'carb', 'fat'];
const el = (id) => document.getElementById(id);

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      protein_g: sanitizeGrams(parsed.protein_g),
      carb_g: sanitizeGrams(parsed.carb_g),
      fat_g: sanitizeGrams(parsed.fat_g),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage errors (private mode, quota) */
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
  el('total-kcal').textContent = Math.round(calories);
  el('calories').value = Math.round(calories);
}

function setGrams(macro, value) {
  state[`${macro}_g`] = sanitizeGrams(value);
  saveState();
  render();
}

function setCalories(value) {
  state = scaleToCalories(state, value);
  saveState();
  render();
}

function wire() {
  for (const m of MACROS) {
    el(`${m}-slider`).addEventListener('input', (e) => setGrams(m, e.target.value));
    el(`${m}-grams`).addEventListener('input', (e) => setGrams(m, e.target.value));
  }
  // 'change' (blur/enter) so we don't fight the user scaling mid-keystroke.
  el('calories').addEventListener('change', (e) => setCalories(e.target.value));
  render();
}

wire();
