# Pinning + Calorie Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lock/pin toggles (1–2 macros and/or calories) plus a total-calories slider, with proportional compensation so unpinned values trade off to keep every pin satisfied.

**Architecture:** All constraint solving lives in a new pure `resolve(state, pins, control, value)` in `calc.js` alongside `canPin`/`constraintCount` (unit-tested with `node --test`). `scaleToCalories` becomes a thin wrapper over `resolve`. `app.js` gains a persisted `pins` object, lock buttons, disabled states, and the calorie slider, all flowing through `resolve` → `render`.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), Node built-in test runner, GitHub Pages.

---

## File Structure

- `calc.js` — add `MAX.calories`, `constraintCount`, `canPin`, `resolve`; rewrite `scaleToCalories` as a wrapper. Math only, no DOM.
- `test/calc.test.js` — add tests for `resolve` + `canPin`; update the `MAX` assertion.
- `index.html` — add a lock button to each macro row; add a Calories control row (slider + number input + lock).
- `style.css` — grid update for the lock column; `.lock` button styles; disabled styling.
- `app.js` — add `pins` state + persistence; route all control changes through `resolve`; render lock states + calorie slider.

---

## Task 1: `calc.js` — `MAX.calories`, `constraintCount`, `canPin`

**Files:**
- Modify: `calc.js`
- Test: `test/calc.test.js`

- [ ] **Step 1: Update the failing test**

In `test/calc.test.js`, change the `MAX` assertion inside the "energy constants" test to:
```js
  assert.deepEqual(MAX, { protein: 900, carb: 1000, fat: 500, calories: 12000 });
```

Append a new test:
```js
import { constraintCount, canPin } from '../calc.js';

test('constraintCount counts pinned macros plus calories', () => {
  assert.equal(constraintCount({ protein: false, carb: false, fat: false, calories: false }), 0);
  assert.equal(constraintCount({ protein: true, carb: false, fat: false, calories: true }), 2);
  assert.equal(constraintCount({ protein: true, carb: true, fat: true, calories: false }), 3);
});

test('canPin allows turning on only while constraints stay <= 2, unpin always ok', () => {
  const none = { protein: false, carb: false, fat: false, calories: false };
  assert.equal(canPin(none, 'protein'), true);
  const two = { protein: true, carb: false, fat: false, calories: true };
  assert.equal(canPin(two, 'carb'), false);   // would make 3
  assert.equal(canPin(two, 'protein'), true);  // already pinned -> can unpin
  const twoMacros = { protein: true, carb: true, fat: false, calories: false };
  assert.equal(canPin(twoMacros, 'calories'), false);
  assert.equal(canPin(twoMacros, 'fat'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `MAX` mismatch and `constraintCount is not a function`.

- [ ] **Step 3: Implement**

In `calc.js`, change the `MAX` line to:
```js
export const MAX = { protein: 900, carb: 1000, fat: 500, calories: 12000 }; // slider maxes
```

Add near the top (after `DEFAULT_STATE`):
```js
const MACRO_KEYS = ['protein', 'carb', 'fat'];

// Number of binding constraints implied by the pins.
export function constraintCount(pins) {
  let n = 0;
  for (const m of MACRO_KEYS) if (pins[m]) n++;
  if (pins.calories) n++;
  return n;
}

// Whether `control`'s lock can be toggled: turning ON needs constraintCount <= 2;
// turning OFF (already pinned) is always allowed.
export function canPin(pins, control) {
  if (pins[control]) return true;
  return constraintCount({ ...pins, [control]: true }) <= 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add calc.js test/calc.test.js
git commit -m "feat: add calorie slider max and pin feasibility helpers"
```

---

## Task 2: `calc.js` — `resolve()` + `scaleToCalories` wrapper

**Files:**
- Modify: `calc.js`
- Test: `test/calc.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/calc.test.js`:
```js
import { resolve } from '../calc.js';

const NONE = { protein: false, carb: false, fat: false, calories: false };

test('resolve: macro change with calories unpinned just sets that macro', () => {
  const r = resolve({ protein_g: 150, carb_g: 200, fat_g: 60 }, NONE, 'protein', 100);
  assert.deepEqual(r, { protein_g: 100, carb_g: 200, fat_g: 60 });
});

test('resolve: macro change with calories pinned compensates others proportionally', () => {
  // P100/C200/F100 = 2100 kcal; raise protein to 200, keep 2100.
  const pins = { protein: false, carb: false, fat: false, calories: true };
  const r = resolve({ protein_g: 100, carb_g: 200, fat_g: 100 }, pins, 'protein', 200);
  // others cal target = 2100 - 800 = 1300; factor 1300/1700; carb 200*f, fat 100*f
  assert.deepEqual(r, { protein_g: 200, carb_g: 153, fat_g: 76 });
});

test('resolve: calories + one macro pinned is a deterministic inverse', () => {
  // P100/C100/F100 = 1700; pin calories + fat; raise protein to 150.
  const pins = { protein: false, carb: false, fat: true, calories: true };
  const r = resolve({ protein_g: 100, carb_g: 100, fat_g: 100 }, pins, 'protein', 150);
  // carb cal target = 1700 - 600 - 900 = 200 -> 50g; fat fixed
  assert.deepEqual(r, { protein_g: 150, carb_g: 50, fat_g: 100 });
});

test('resolve: macro pushed past the calorie budget clamps, others go to 0', () => {
  const pins = { protein: false, carb: false, fat: false, calories: true };
  const r = resolve({ protein_g: 100, carb_g: 100, fat_g: 100 }, pins, 'protein', 9999);
  // budget 1700 -> protein max 1700/4 = 425
  assert.deepEqual(r, { protein_g: 425, carb_g: 0, fat_g: 0 });
});

test('resolve: calorie change scales only unpinned macros, pinned macro stays', () => {
  // pin protein (400 kcal floor); target 2400 -> unpinned target 2000
  const pins = { protein: true, carb: false, fat: false, calories: false };
  const r = resolve({ protein_g: 100, carb_g: 200, fat_g: 100 }, pins, 'calories', 2400);
  // unpinned current 1700; factor 2000/1700; carb 200*f, fat 100*f
  assert.deepEqual(r, { protein_g: 100, carb_g: 235, fat_g: 118 });
});

test('resolve: calorie target below the pinned floor zeroes unpinned macros', () => {
  const pins = { protein: true, carb: false, fat: false, calories: false };
  const r = resolve({ protein_g: 100, carb_g: 100, fat_g: 100 }, pins, 'calories', 300);
  assert.deepEqual(r, { protein_g: 100, carb_g: 0, fat_g: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `resolve is not a function`.

- [ ] **Step 3: Implement**

In `calc.js`, **replace** the existing `scaleToCalories` function with the following block:
```js
function gk(m) { return `${m}_g`; }

function roundState(s) {
  return {
    protein_g: Math.round(s.protein_g),
    carb_g: Math.round(s.carb_g),
    fat_g: Math.round(s.fat_g),
  };
}

function macroCal(state, m) {
  return ENERGY[m] * sanitizeGrams(state[gk(m)]);
}

function resolveMacro(state, pins, M, value) {
  const out = {
    protein_g: sanitizeGrams(state.protein_g),
    carb_g: sanitizeGrams(state.carb_g),
    fat_g: sanitizeGrams(state.fat_g),
  };
  const newVal = sanitizeGrams(value);

  if (!pins.calories) {
    out[gk(M)] = newVal;
    return roundState(out);
  }

  const K = calc(state).calories;
  const others = MACRO_KEYS.filter((m) => m !== M && !pins[m]);
  if (others.length === 0) return roundState(out); // infeasible; leave as-is

  const fixedCal = MACRO_KEYS
    .filter((m) => m !== M && pins[m])
    .reduce((s, m) => s + macroCal(state, m), 0);

  let mVal = newVal;
  let targetOthersCal = K - ENERGY[M] * mVal - fixedCal;

  if (targetOthersCal < 0) {
    mVal = Math.max(0, (K - fixedCal) / ENERGY[M]);
    out[gk(M)] = mVal;
    for (const m of others) out[gk(m)] = 0;
    return roundState(out);
  }

  out[gk(M)] = mVal;
  const currentOthersCal = others.reduce((s, m) => s + macroCal(state, m), 0);
  if (currentOthersCal === 0) {
    const each = targetOthersCal / others.length;
    for (const m of others) out[gk(m)] = each / ENERGY[m];
  } else {
    const factor = targetOthersCal / currentOthersCal;
    for (const m of others) out[gk(m)] = sanitizeGrams(state[gk(m)]) * factor;
  }
  return roundState(out);
}

function resolveCalories(state, pins, value) {
  const out = {
    protein_g: sanitizeGrams(state.protein_g),
    carb_g: sanitizeGrams(state.carb_g),
    fat_g: sanitizeGrams(state.fat_g),
  };
  const T = sanitizeGrams(value);
  const unpinned = MACRO_KEYS.filter((m) => !pins[m]);
  if (unpinned.length === 0) return roundState(out);

  const fixedCal = MACRO_KEYS
    .filter((m) => pins[m])
    .reduce((s, m) => s + macroCal(state, m), 0);
  const targetUnpinnedCal = T - fixedCal;

  if (targetUnpinnedCal <= 0) {
    for (const m of unpinned) out[gk(m)] = 0;
    return roundState(out);
  }

  const currentUnpinnedCal = unpinned.reduce((s, m) => s + macroCal(state, m), 0);
  if (currentUnpinnedCal === 0) {
    const each = targetUnpinnedCal / unpinned.length;
    for (const m of unpinned) out[gk(m)] = each / ENERGY[m];
  } else {
    const factor = targetUnpinnedCal / currentUnpinnedCal;
    for (const m of unpinned) out[gk(m)] = sanitizeGrams(state[gk(m)]) * factor;
  }
  return roundState(out);
}

// Resolve a single user change into a new valid grams state, honoring pins.
// control is 'protein' | 'carb' | 'fat' | 'calories'.
export function resolve(state, pins, control, value) {
  if (control === 'calories') return resolveCalories(state, pins, value);
  return resolveMacro(state, pins, control, value);
}

// Back-compat: scaling all macros to a target with no pins.
export function scaleToCalories(state, targetCalories) {
  return resolve(
    state,
    { protein: false, carb: false, fat: false, calories: false },
    'calories',
    targetCalories,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS — new `resolve` tests AND the three original `scaleToCalories` tests stay green.

- [ ] **Step 5: Commit**

```bash
git add calc.js test/calc.test.js
git commit -m "feat: pin-aware constraint solver (resolve)"
```

---

## Task 3: `index.html` — lock buttons + calorie control row

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the `<main>` body**

Replace everything from `<section class="macros">` through the end of `<section class="totals">` (i.e. the macros section and the old totals section) with:
```html
    <section class="controls">
      <!-- Protein -->
      <div class="row">
        <button class="lock" id="protein-lock" type="button" aria-pressed="false" aria-label="Lock protein">🔓</button>
        <label for="protein-grams">Protein</label>
        <input type="range" id="protein-slider" min="0" max="900" step="1" aria-label="Protein grams slider" />
        <input type="number" id="protein-grams" min="0" step="1" inputmode="numeric" />
        <span class="unit">g</span>
        <span class="readout"><span id="protein-kcal">0</span> kcal · <span id="protein-percent">0</span>%</span>
      </div>

      <!-- Carbs -->
      <div class="row">
        <button class="lock" id="carb-lock" type="button" aria-pressed="false" aria-label="Lock carbs">🔓</button>
        <label for="carb-grams">Carbs</label>
        <input type="range" id="carb-slider" min="0" max="1000" step="1" aria-label="Carbs grams slider" />
        <input type="number" id="carb-grams" min="0" step="1" inputmode="numeric" />
        <span class="unit">g</span>
        <span class="readout"><span id="carb-kcal">0</span> kcal · <span id="carb-percent">0</span>%</span>
      </div>

      <!-- Fat -->
      <div class="row">
        <button class="lock" id="fat-lock" type="button" aria-pressed="false" aria-label="Lock fat">🔓</button>
        <label for="fat-grams">Fat</label>
        <input type="range" id="fat-slider" min="0" max="500" step="1" aria-label="Fat grams slider" />
        <input type="number" id="fat-grams" min="0" step="1" inputmode="numeric" />
        <span class="unit">g</span>
        <span class="readout"><span id="fat-kcal">0</span> kcal · <span id="fat-percent">0</span>%</span>
      </div>

      <!-- Calories -->
      <div class="row row-calories">
        <button class="lock" id="calories-lock" type="button" aria-pressed="false" aria-label="Lock calories">🔓</button>
        <label for="calories">Calories</label>
        <input type="range" id="calories-slider" min="0" max="12000" step="1" aria-label="Total calories slider" />
        <input type="number" id="calories" min="0" step="1" inputmode="numeric" />
        <span class="unit">kcal</span>
        <span class="readout">scales unpinned</span>
      </div>
    </section>
```

The `<section class="summary">` block stays unchanged. Update the tagline paragraph text to:
```html
    <p class="tagline">Drag a slider or type. Lock 🔒 any rows you want held fixed.</p>
```

- [ ] **Step 2: Reload to confirm the new row + lock buttons render (no behavior yet)**

Run: `xdg-open index.html` (controls won't work until app.js is updated).
Expected: four rows each with a 🔓 button; calories row has a slider.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add lock buttons and calorie control row"
```

---

## Task 4: `style.css` — lock column + button + disabled states

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Replace the `.macro-row` rule and its responsive block**

Replace the `.macro-row { ... }` rule (and the three `.macro-row label/.unit/.readout` rules) with:
```css
.row {
  display: grid;
  grid-template-columns: 2rem 70px 1fr 80px auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid #2a2e37;
}

.row label { font-weight: 600; }
.row .unit { color: var(--muted); }
.row .readout { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
.row-calories { margin-top: 0.5rem; border-top: 1px solid #2a2e37; }
.row-calories .readout { font-size: 0.8rem; }

.lock {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.2rem;
  border-radius: 6px;
  opacity: 0.85;
}
.lock:hover { background: var(--panel); opacity: 1; }
.lock[aria-pressed="true"] { opacity: 1; }
.lock:disabled { opacity: 0.25; cursor: not-allowed; }

input:disabled { opacity: 0.45; cursor: not-allowed; }
```

In the `@media (max-width: 520px)` block, replace the `.macro-row` selectors with `.row` equivalents:
```css
@media (max-width: 520px) {
  .row {
    grid-template-columns: 2rem 1fr auto;
    grid-template-areas:
      "lock label readout"
      "slider slider slider"
      "number number unit";
  }
  .row .lock { grid-area: lock; }
  .row label { grid-area: label; }
  .row .readout { grid-area: readout; }
  .row input[type="range"] { grid-area: slider; }
  .row input[type="number"] { grid-area: number; }
  .row .unit { grid-area: unit; }
}
```

- [ ] **Step 2: Reload to confirm styling**

Expected: lock button sits left of each label; rows aligned; narrow width reflows cleanly.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: style lock column and disabled controls"
```

---

## Task 5: `app.js` — pins state, resolve routing, lock + calorie-slider wiring

**Files:**
- Modify: `app.js` (full rewrite)

- [ ] **Step 1: Replace `app.js` entirely**

```js
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
      (loaded.protein ? 1 : 0) + (loaded.carb ? 1 : 0) + (loaded.fat ? 1 : 0) + (loaded.calories ? 1 : 0);
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
```

- [ ] **Step 2: Run unit tests (no regressions in core)**

Run: `node --test`
Expected: PASS (all calc/resolve/canPin tests).

- [ ] **Step 3: Manual verification in the browser**

Serve and open (`python3 -m http.server 8000`), then confirm:
- [ ] Defaults load (150/200/60, 1940 kcal); calorie slider sits at ~1940.
- [ ] Dragging the calorie slider scales all three macros proportionally (live).
- [ ] Lock calories 🔒 → its slider+input disable; dragging protein now drops carbs+fat proportionally, total stays put.
- [ ] Lock calories + fat → dragging protein moves only carbs (inverse), fat unchanged; the carb & protein-not... the remaining unpinned macro responds. Carb/other unpinned lock greys out (2-constraint cap).
- [ ] With 2 macros locked, the calories lock greys out.
- [ ] Unlock everything → back to free grams-primary behavior.
- [ ] Reload → state AND lock positions persist.
- [ ] Narrow width reflows cleanly.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: wire pins, lock toggles, and calorie slider through resolve"
```

---

## Task 6: Deploy

**Files:** none (push existing).

- [ ] **Step 1: Push**

```bash
git push
```
Expected: GitHub Pages rebuilds automatically.

- [ ] **Step 2: Verify live**

Poll `https://lorac.github.io/macro-calorie-calculator/` until 200, then headless-render and confirm the calorie slider + lock buttons are present and the page computes values.

---

## Self-Review Notes

- **Spec coverage:** calorie slider (Task 3 markup, Task 5 wiring, `MAX.calories` Task 1); lock toggles on 4 rows (Tasks 3–5); pinned = disabled (Task 5 `renderLocks`); feasibility ≤2 via `canPin`/`constraintCount` (Task 1) enforced in `toggleLock` + lock disabling (Task 5); proportional compensation, deterministic inverse, clamp-past-budget, calorie-floor, even-split fallback (Task 2 `resolve` + tests); `pins` persisted with corrupt-guard (Task 5 `loadPins`); `scaleToCalories` wrapper keeps old tests (Task 2).
- **Type consistency:** `resolve(state, pins, control, value)` returns `{protein_g, carb_g, fat_g}`, assigned to `state` in `changeControl`. `canPin(pins, control)` boolean used in `renderLocks`/`toggleLock`. Element ids: `${m}-slider/-grams/-kcal/-percent`, `bar-${m}`, `${c}-lock`, `calories-slider`, `calories`, `total-kcal` — all present in Task 3 markup. `MAX.calories` referenced in Task 5 render.
- **Placeholder scan:** none — every code step is complete.
