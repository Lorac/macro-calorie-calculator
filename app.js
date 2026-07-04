import {
  calc, resolve, canPin, constraintCount, sanitizeNumber, DEFAULT_STATE, MAX,
  energyProfile, kgToLb, lbToKg, ftInToCm, cmToFtIn,
  weeklyWeightChange, proteinFromBodyweight,
} from './calc.js';

const STATE_KEY = 'macro-calc-state';
const PINS_KEY = 'macro-calc-pins';
const MACROS = ['protein', 'carb', 'fat'];
const CONTROLS = [...MACROS, 'calories'];
const NO_PINS = { protein: false, carb: false, fat: false, calories: false };
const kcalFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const el = (id) => document.getElementById(id);

// The energy-balance panel depends on both cards. render() (macro card) calls
// this hook; the BMR section swaps in the real renderBalance once its state
// exists. No-op until then so the initial wire()/render() can't hit a TDZ.
let renderBalanceHook = () => {};

// Parse a persisted JSON value through its sanitizer; any parse/storage error
// sanitizes null (-> the store's default).
function loadJson(key, sanitize) {
  try {
    return sanitize(JSON.parse(localStorage.getItem(key) ?? 'null'));
  } catch {
    return sanitize(null);
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage errors (private mode, quota) */
  }
}

// Debounced saves with a shared flush: mobile tabs are often killed straight
// from hidden without pagehide, so every store flushes on BOTH signals or the
// last ~200ms of edits can be lost.
const flushers = [];
function saverFor(key, get) {
  let timer = 0;
  flushers.push(() => { clearTimeout(timer); save(key, get()); });
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => save(key, get()), 200);
  };
}
function flushAll() { for (const f of flushers) f(); }
addEventListener('pagehide', flushAll);
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll();
});

let state = loadJson(STATE_KEY, (p) => (p ? {
  protein_g: sanitizeNumber(p.protein_g),
  carb_g: sanitizeNumber(p.carb_g),
  fat_g: sanitizeNumber(p.fat_g),
} : structuredClone(DEFAULT_STATE)));

let pins = loadJson(PINS_KEY, (p) => {
  if (!p) return structuredClone(NO_PINS);
  const loaded = {
    protein: Boolean(p.protein),
    carb: Boolean(p.carb),
    fat: Boolean(p.fat),
    calories: Boolean(p.calories),
  };
  return constraintCount(loaded) <= 2 ? loaded : structuredClone(NO_PINS);
});

const saveStateSoon = saverFor(STATE_KEY, () => state);

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
    const slider = el(`${m}-slider`);
    const capped = Math.min(grams, MAX[m]);
    slider.value = capped;
    slider.style.setProperty('--val', (capped / MAX[m]) * 100); // fills the coloured track
    el(`${m}-grams`).value = Math.round(grams);
    el(`${m}-kcal`).textContent = kcalFmt.format(kcal[m]);
    el(`${m}-percent`).textContent = percent[m].toFixed(1);
    el(`bar-${m}`).style.width = `${percent[m]}%`;
  }
  const calSlider = el('calories-slider');
  const cappedCal = Math.min(calories, MAX.calories);
  calSlider.value = cappedCal;
  calSlider.style.setProperty('--val', (cappedCal / MAX.calories) * 100);
  el('calories').value = Math.round(calories);
  el('total-kcal').textContent = kcalFmt.format(calories);
  renderLocks();
  renderBalanceHook(); // keep the deficit/surplus panel in sync with intake
}

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

// --- BMR / TDEE estimator ---------------------------------------------------

const BMR_KEY = 'macro-calc-bmr';
const DEFAULT_BMR = {
  sex: 'male', units: 'metric', activity: 'moderate', goal: 'maintain',
  age: '', weight: '', height_cm: '', height_ft: '', height_in: '',
  proteinPerKg: '', cutKcal: '250', bulkKcal: '250',
};

let bmr = loadJson(BMR_KEY, (p) => ((p && typeof p === 'object')
  ? { ...structuredClone(DEFAULT_BMR), ...p }
  : structuredClone(DEFAULT_BMR)));

const saveBmrSoon = saverFor(BMR_KEY, () => bmr);

let currentTarget = 0;

function renderBmr() {
  // Unit tabs + labels.
  el('units-metric').setAttribute('aria-pressed', String(bmr.units === 'metric'));
  el('units-imperial').setAttribute('aria-pressed', String(bmr.units === 'imperial'));
  el('weight-unit').textContent = bmr.units === 'imperial' ? 'lb' : 'kg';
  el('height-metric').hidden = bmr.units === 'imperial';
  el('height-imperial').hidden = bmr.units !== 'imperial';

  // Segmented controls.
  el('sex-male').setAttribute('aria-pressed', String(bmr.sex === 'male'));
  el('sex-female').setAttribute('aria-pressed', String(bmr.sex === 'female'));
  for (const g of ['cut', 'maintain', 'bulk']) {
    el(`goal-${g}`).setAttribute('aria-pressed', String(bmr.goal === g));
  }
  el('bmr-activity').value = bmr.activity;

  // Cut & bulk are offset-driven: reveal the kcal slider and label it per goal.
  const massUnit = bmr.units === 'imperial' ? 'lb' : 'kg';
  const profile = energyProfile(bmr);
  const offset = profile.offset;
  el('offset-field').hidden = bmr.goal === 'maintain';
  el('offset-label').textContent = bmr.goal === 'cut' ? 'Daily deficit' : 'Daily surplus';
  const slider = el('goal-offset');
  slider.value = offset;
  slider.style.setProperty('--val', offset / (slider.max || 1000) * 100);
  slider.style.setProperty('--c', bmr.goal === 'cut' ? 'var(--protein)' : 'var(--fat)');
  el('offset-val').textContent = `${bmr.goal === 'cut' ? '−' : '+'}${kcalFmt.format(offset)} kcal`;
  el('goal-note').textContent = bmr.goal === 'maintain'
    ? 'maintain'
    : `${bmr.goal === 'cut' ? '−' : '+'}${kcalFmt.format(offset)} kcal/day`;

  // Outputs.
  if (profile.ready) {
    currentTarget = Math.round(profile.target);
    el('bmr-value').textContent = kcalFmt.format(profile.bmr);
    el('tdee-value').textContent = kcalFmt.format(profile.tdee);
    el('target-value').textContent = kcalFmt.format(currentTarget);
    // Weekly weight change implied by the actual (BMR-floored) target vs TDEE.
    el('offset-rate').textContent = bmr.goal === 'maintain'
      ? ''
      : `≈ ${profile.weeklyChange >= 0 ? '+' : '−'}${Math.abs(profile.weeklyChange).toFixed(2)} ${massUnit}/week`;
    el('use-target').disabled = false;
  } else {
    el('offset-rate').textContent = '';
    currentTarget = 0;
    el('bmr-value').textContent = '—';
    el('tdee-value').textContent = '—';
    el('target-value').textContent = '—';
    el('use-target').disabled = true;
  }

  renderProteinApply();
  renderBalance();
}

// Grams of protein the entered target implies. The ratio is per the selected
// unit (g/kg in metric, g/lb in imperial), so it multiplies the raw entered
// weight in that same unit.
function proteinTargetGrams() {
  return proteinFromBodyweight(bmr.proteinPerKg, bmr.weight);
}

function renderProteinApply() {
  const imperial = bmr.units === 'imperial';
  el('protein-unit').textContent = imperial ? 'g/lb body wt' : 'g/kg body wt';
  el('protein-per-kg').placeholder = imperial ? 'e.g. 0.8' : 'e.g. 1.8';

  const grams = proteinTargetGrams();
  el('protein-apply').disabled = !(grams > 0);
  if (sanitizeNumber(bmr.proteinPerKg) <= 0) {
    el('protein-bw-hint').textContent = 'optional · sets protein';
  } else if (sanitizeNumber(bmr.weight) <= 0) {
    el('protein-bw-hint').textContent = 'enter weight above';
  } else {
    el('protein-bw-hint').textContent = `→ ${Math.round(grams)} g protein`;
  }
}

// Deficit/surplus: macro calories in vs TDEE out, plus weekly change.
function renderBalance() {
  const intake = calc(state).calories;
  const section = el('balance');
  section.classList.remove('balance--deficit', 'balance--surplus');
  el('balance-in').textContent = kcalFmt.format(intake);

  const profile = energyProfile(bmr);
  if (!profile.ready) {
    el('balance-out').textContent = '—';
    el('balance-verdict').textContent = 'Enter your stats above';
    el('balance-delta').textContent = '—';
    el('balance-weight').textContent = '';
    return;
  }

  el('balance-out').textContent = kcalFmt.format(profile.tdee);

  const balance = intake - profile.tdee; // positive = surplus, negative = deficit
  const absKcal = Math.round(Math.abs(balance));
  const unit = bmr.units === 'imperial' ? 'lb' : 'kg';

  if (absKcal < 1) {
    el('balance-verdict').textContent = 'Maintenance';
    el('balance-delta').textContent = '±0 kcal';
    el('balance-weight').textContent = 'weight stable';
    return;
  }

  const deficit = balance < 0;
  const weekly = Math.abs(weeklyWeightChange(balance, bmr.units));
  section.classList.add(deficit ? 'balance--deficit' : 'balance--surplus');
  el('balance-verdict').textContent = deficit ? 'Deficit · losing' : 'Surplus · gaining';
  el('balance-delta').textContent = `${deficit ? '−' : '+'}${kcalFmt.format(absKcal)} kcal`;
  el('balance-weight').textContent = `≈ ${deficit ? '−' : '+'}${weekly.toFixed(2)} ${unit}/week`;
}

// Write the field inputs from state (used on load + unit switches).
function fillBmrInputs() {
  el('bmr-age').value = bmr.age;
  el('bmr-weight').value = bmr.weight;
  el('bmr-height-cm').value = bmr.height_cm;
  el('bmr-height-ft').value = bmr.height_ft;
  el('bmr-height-in').value = bmr.height_in;
  el('protein-per-kg').value = bmr.proteinPerKg;
}

function setBmr(key, value) {
  bmr[key] = value;
  saveBmrSoon();
  renderBmr();
}

// Switch units, converting the current entered values so the body stays the same.
function setUnits(units) {
  if (units === bmr.units) return;
  if (units === 'imperial') {
    bmr.weight = bmr.weight === '' ? '' : round1(kgToLb(bmr.weight));
    if (bmr.height_cm !== '') {
      const { ft, inch } = cmToFtIn(bmr.height_cm);
      bmr.height_ft = ft;
      bmr.height_in = round1(inch);
    }
    // g/kg -> g/lb (same scalar as kg->lb weight) so the implied grams hold.
    bmr.proteinPerKg = ratioConv(bmr.proteinPerKg, LB_PER_KG);
  } else {
    bmr.weight = bmr.weight === '' ? '' : round1(lbToKg(bmr.weight));
    if (bmr.height_ft !== '' || bmr.height_in !== '') {
      bmr.height_cm = round1(ftInToCm(bmr.height_ft, bmr.height_in));
    }
    bmr.proteinPerKg = ratioConv(bmr.proteinPerKg, 1 / LB_PER_KG); // g/lb -> g/kg
  }
  bmr.units = units;
  fillBmrInputs();
  saveBmrSoon();
  renderBmr();
}

const round1 = (n) => Math.round(sanitizeNumber(n) * 10) / 10;
const LB_PER_KG = 0.45359237;
// Convert a per-bodyweight ratio (e.g. g/kg) by `factor`, preserving '' (blank)
// and rounding to 2 dp. Used so g/kg <-> g/lb keeps the implied total grams.
const ratioConv = (v, factor) => (v === '' ? '' : Math.round(sanitizeNumber(v) * factor * 100) / 100);

function wireBmr() {
  el('units-metric').addEventListener('click', () => setUnits('metric'));
  el('units-imperial').addEventListener('click', () => setUnits('imperial'));
  el('sex-male').addEventListener('click', () => setBmr('sex', 'male'));
  el('sex-female').addEventListener('click', () => setBmr('sex', 'female'));
  for (const g of ['cut', 'maintain', 'bulk']) {
    el(`goal-${g}`).addEventListener('click', () => setBmr('goal', g));
  }
  el('bmr-activity').addEventListener('change', (e) => setBmr('activity', e.target.value));
  el('bmr-age').addEventListener('input', (e) => setBmr('age', e.target.value));
  el('bmr-weight').addEventListener('input', (e) => setBmr('weight', e.target.value));
  el('bmr-height-cm').addEventListener('input', (e) => setBmr('height_cm', e.target.value));
  el('bmr-height-ft').addEventListener('input', (e) => setBmr('height_ft', e.target.value));
  el('bmr-height-in').addEventListener('input', (e) => setBmr('height_in', e.target.value));
  el('use-target').addEventListener('click', () => {
    if (currentTarget > 0) changeControl('calories', currentTarget);
  });
  el('protein-per-kg').addEventListener('input', (e) => setBmr('proteinPerKg', e.target.value));
  el('goal-offset').addEventListener('input', (e) => {
    setBmr(bmr.goal === 'cut' ? 'cutKcal' : 'bulkKcal', e.target.value);
  });
  el('protein-apply').addEventListener('click', () => {
    const grams = proteinTargetGrams();
    if (grams > 0) changeControl('protein', grams); // moves the protein slider up top
  });
  renderBalanceHook = renderBalance; // now the macro card's render() updates the balance
  fillBmrInputs();
  renderBmr();
}

wireBmr();

// Offline support (globalThis: node tests import this module without a navigator).
globalThis.navigator?.serviceWorker?.register('sw.js')?.catch(() => {
  /* e.g. file:// — the app works without it */
});
