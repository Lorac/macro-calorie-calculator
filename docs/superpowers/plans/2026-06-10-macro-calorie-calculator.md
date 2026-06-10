# Macro ⇄ Calorie Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, ad-free, zero-dependency static web app that converts between macronutrient grams and calories live, with grams-primary sliders.

**Architecture:** Pure math lives in `calc.js` (importable in browser *and* Node, so it can be unit-tested with the built-in `node --test` runner — no npm installs). `app.js` is an ES module that imports `calc.js`, owns the `{protein_g, carb_g, fat_g}` state, and follows a single state→UI render path. DOM wiring is verified manually in the browser (jsdom would add a dependency we're avoiding). No build step.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), Node's built-in test runner, GitHub Pages.

---

## File Structure

- `index.html` — markup: 3 macro rows (slider + number input + kcal/% readout), total-calories field, summary bar. Loads `style.css` and `app.js`.
- `style.css` — responsive layout, single-column on narrow screens.
- `calc.js` — pure functions + constants: `ENERGY`, `MAX`, `DEFAULT_STATE`, `sanitizeGrams`, `calc`, `scaleToCalories`. No DOM access.
- `app.js` — ES module: state, `render()`, event wiring, localStorage. Imports `calc.js`.
- `test/calc.test.js` — `node:test` unit tests for `calc.js`.
- `package.json` — zero dependencies; `"type": "module"` + `test` script.
- `README.md` — usage + GitHub Pages deploy notes.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repo**

Run:
```bash
cd /home/maximer/devel/calorie
git init
```
Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "macro-calorie-calculator",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Free, ad-free macro <-> calorie calculator. Static, zero runtime dependencies.",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
```

- [ ] **Step 4: Verify the test runner is reachable (no tests yet)**

Run: `node --test`
Expected: exits reporting `tests 0` (or "no test files found") — confirms Node's runner works. Node 18+ required.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold zero-dependency project"
```

---

## Task 2: `calc.js` constants + `sanitizeGrams`

**Files:**
- Create: `calc.js`
- Test: `test/calc.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/calc.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeGrams, ENERGY, MAX, DEFAULT_STATE } from '../calc.js';

test('sanitizeGrams coerces invalid input to 0 and passes valid numbers', () => {
  assert.equal(sanitizeGrams(-5), 0);
  assert.equal(sanitizeGrams('abc'), 0);
  assert.equal(sanitizeGrams(NaN), 0);
  assert.equal(sanitizeGrams(null), 0);
  assert.equal(sanitizeGrams('150'), 150);
  assert.equal(sanitizeGrams(150), 150);
});

test('energy constants, slider ranges, and default state are correct', () => {
  assert.deepEqual(ENERGY, { protein: 4, carb: 4, fat: 9 });
  assert.deepEqual(MAX, { protein: 900, carb: 1000, fat: 500 });
  assert.deepEqual(DEFAULT_STATE, { protein_g: 150, carb_g: 200, fat_g: 60 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '.../calc.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `calc.js`:
```js
// Pure, framework-free macro/calorie math. Importable in browser and Node.

export const ENERGY = { protein: 4, carb: 4, fat: 9 }; // kcal per gram
export const MAX = { protein: 900, carb: 1000, fat: 500 }; // slider maxes (g)
export const DEFAULT_STATE = { protein_g: 150, carb_g: 200, fat_g: 60 };

// Coerce any value to a non-negative finite number; invalid/negative -> 0.
export function sanitizeGrams(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add calc.js test/calc.test.js
git commit -m "feat: add energy constants and gram sanitization"
```

---

## Task 3: `calc.js` — `calc()` derivation

**Files:**
- Modify: `calc.js`
- Test: `test/calc.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/calc.test.js`:
```js
import { calc } from '../calc.js';

test('calc derives calories, per-macro kcal, and percentage split', () => {
  const r = calc({ protein_g: 100, carb_g: 100, fat_g: 100 });
  assert.equal(r.calories, 1700);
  assert.deepEqual(r.kcal, { protein: 400, carb: 400, fat: 900 });
  assert.equal(r.percent.protein.toFixed(1), '23.5');
  assert.equal(r.percent.carb.toFixed(1), '23.5');
  assert.equal(r.percent.fat.toFixed(1), '52.9');
});

test('calc returns 0 percentages when calories are 0', () => {
  const r = calc({ protein_g: 0, carb_g: 0, fat_g: 0 });
  assert.equal(r.calories, 0);
  assert.deepEqual(r.percent, { protein: 0, carb: 0, fat: 0 });
});

test('calc sanitizes negative/invalid grams before computing', () => {
  const r = calc({ protein_g: -10, carb_g: 'x', fat_g: 10 });
  assert.equal(r.calories, 90); // only fat 10g * 9
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `calc is not a function` / export missing.

- [ ] **Step 3: Write minimal implementation**

Append to `calc.js`:
```js
// Derive calories, per-macro kcal, and percentage split from grams.
export function calc(state) {
  const protein_g = sanitizeGrams(state.protein_g);
  const carb_g = sanitizeGrams(state.carb_g);
  const fat_g = sanitizeGrams(state.fat_g);

  const kcal = {
    protein: protein_g * ENERGY.protein,
    carb: carb_g * ENERGY.carb,
    fat: fat_g * ENERGY.fat,
  };
  const calories = kcal.protein + kcal.carb + kcal.fat;
  const pct = (k) => (calories > 0 ? (k / calories) * 100 : 0);

  return {
    calories,
    kcal,
    percent: {
      protein: pct(kcal.protein),
      carb: pct(kcal.carb),
      fat: pct(kcal.fat),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all calc tests green).

- [ ] **Step 5: Commit**

```bash
git add calc.js test/calc.test.js
git commit -m "feat: derive calories and macro percentages from grams"
```

---

## Task 4: `calc.js` — `scaleToCalories()`

**Files:**
- Modify: `calc.js`
- Test: `test/calc.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/calc.test.js`:
```js
import { scaleToCalories } from '../calc.js';

test('scaleToCalories scales macros proportionally, preserving the split', () => {
  const scaled = scaleToCalories({ protein_g: 100, carb_g: 100, fat_g: 100 }, 3400);
  assert.deepEqual(scaled, { protein_g: 200, carb_g: 200, fat_g: 200 });
});

test('scaleToCalories uses an even energy split when current calories are 0', () => {
  // target 3600 -> 1200 kcal each -> 300g protein, 300g carb, 133g fat (rounded)
  const scaled = scaleToCalories({ protein_g: 0, carb_g: 0, fat_g: 0 }, 3600);
  assert.deepEqual(scaled, { protein_g: 300, carb_g: 300, fat_g: 133 });
});

test('scaleToCalories with target 0 zeroes all macros', () => {
  const scaled = scaleToCalories({ protein_g: 50, carb_g: 60, fat_g: 20 }, 0);
  assert.deepEqual(scaled, { protein_g: 0, carb_g: 0, fat_g: 0 });
});

test('scaleToCalories sanitizes an invalid target to 0', () => {
  const scaled = scaleToCalories({ protein_g: 50, carb_g: 60, fat_g: 20 }, 'abc');
  assert.deepEqual(scaled, { protein_g: 0, carb_g: 0, fat_g: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `scaleToCalories is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `calc.js`:
```js
// Return a NEW state scaled proportionally to hit targetCalories.
// Grams are rounded to whole numbers (the app is grams-integer).
// When current calories are 0, fall back to an even energy split.
export function scaleToCalories(state, targetCalories) {
  const target = sanitizeGrams(targetCalories);
  if (target === 0) {
    return { protein_g: 0, carb_g: 0, fat_g: 0 };
  }

  const current = calc(state).calories;
  if (current === 0) {
    const each = target / 3; // kcal per macro
    return {
      protein_g: Math.round(each / ENERGY.protein),
      carb_g: Math.round(each / ENERGY.carb),
      fat_g: Math.round(each / ENERGY.fat),
    };
  }

  const factor = target / current;
  return {
    protein_g: Math.round(sanitizeGrams(state.protein_g) * factor),
    carb_g: Math.round(sanitizeGrams(state.carb_g) * factor),
    fat_g: Math.round(sanitizeGrams(state.fat_g) * factor),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add calc.js test/calc.test.js
git commit -m "feat: scale macros to a target calorie total"
```

---

## Task 5: `index.html` markup

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Macro ⇄ Calorie Calculator</title>
  <meta name="description" content="Free, ad-free macro and calorie calculator." />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="app">
    <h1>Macro ⇄ Calorie Calculator</h1>
    <p class="tagline">Drag a slider or type grams. Calories and the split update live.</p>

    <section class="macros">
      <!-- Protein -->
      <div class="macro-row">
        <label for="protein-grams">Protein</label>
        <input type="range" id="protein-slider" min="0" max="900" step="1" aria-label="Protein grams slider" />
        <input type="number" id="protein-grams" min="0" step="1" inputmode="numeric" />
        <span class="unit">g</span>
        <span class="readout"><span id="protein-kcal">0</span> kcal · <span id="protein-percent">0</span>%</span>
      </div>

      <!-- Carbs -->
      <div class="macro-row">
        <label for="carb-grams">Carbs</label>
        <input type="range" id="carb-slider" min="0" max="1000" step="1" aria-label="Carbs grams slider" />
        <input type="number" id="carb-grams" min="0" step="1" inputmode="numeric" />
        <span class="unit">g</span>
        <span class="readout"><span id="carb-kcal">0</span> kcal · <span id="carb-percent">0</span>%</span>
      </div>

      <!-- Fat -->
      <div class="macro-row">
        <label for="fat-grams">Fat</label>
        <input type="range" id="fat-slider" min="0" max="500" step="1" aria-label="Fat grams slider" />
        <input type="number" id="fat-grams" min="0" step="1" inputmode="numeric" />
        <span class="unit">g</span>
        <span class="readout"><span id="fat-kcal">0</span> kcal · <span id="fat-percent">0</span>%</span>
      </div>
    </section>

    <section class="totals">
      <label for="calories">Total calories</label>
      <input type="number" id="calories" min="0" step="1" inputmode="numeric" />
      <span class="hint">Editing this scales all macros to hit the target.</span>
    </section>

    <section class="summary" aria-live="polite">
      <div class="total-kcal"><span id="total-kcal">0</span> kcal</div>
      <div class="bar" role="img" aria-label="Macro percentage split">
        <div class="bar-seg bar-protein" id="bar-protein"></div>
        <div class="bar-seg bar-carb" id="bar-carb"></div>
        <div class="bar-seg bar-fat" id="bar-fat"></div>
      </div>
      <div class="bar-legend">
        <span class="key key-protein">Protein</span>
        <span class="key key-carb">Carbs</span>
        <span class="key key-fat">Fat</span>
      </div>
    </section>
  </main>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Open in a browser to confirm it renders (unstyled, no JS behavior yet)**

Run: `xdg-open index.html` (or open the file manually).
Expected: the three rows, calorie field, and summary appear. Controls do nothing yet — that's expected.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add calculator markup"
```

---

## Task 6: `style.css`

**Files:**
- Create: `style.css`

- [ ] **Step 1: Create `style.css`**

```css
:root {
  --bg: #0f1115;
  --panel: #1a1d24;
  --text: #e7e9ee;
  --muted: #9aa1ad;
  --protein: #4f9dff;
  --carb: #ffce54;
  --fat: #ff6b6b;
  --accent: #4f9dff;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  display: flex;
  justify-content: center;
  padding: 1.5rem;
}

.app {
  width: 100%;
  max-width: 640px;
}

h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
.tagline { color: var(--muted); margin: 0 0 1.5rem; }

.macro-row {
  display: grid;
  grid-template-columns: 70px 1fr 80px auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid #2a2e37;
}

.macro-row label { font-weight: 600; }
.macro-row .unit { color: var(--muted); }
.macro-row .readout { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }

input[type="number"] {
  background: var(--panel);
  border: 1px solid #2a2e37;
  color: var(--text);
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  width: 100%;
  font-size: 1rem;
}

input[type="range"] { width: 100%; accent-color: var(--accent); }

.totals {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 1.25rem 0;
}
.totals label { font-weight: 600; }
.totals input { max-width: 140px; }
.totals .hint { color: var(--muted); font-size: 0.85rem; }

.summary { margin-top: 1rem; }
.total-kcal { font-size: 2rem; font-weight: 700; margin-bottom: 0.6rem; }

.bar {
  display: flex;
  height: 22px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--panel);
}
.bar-seg { height: 100%; transition: width 0.08s linear; }
.bar-protein { background: var(--protein); }
.bar-carb { background: var(--carb); }
.bar-fat { background: var(--fat); }

.bar-legend { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted); }
.key::before {
  content: "";
  display: inline-block;
  width: 0.7rem; height: 0.7rem;
  border-radius: 2px;
  margin-right: 0.35rem;
  vertical-align: middle;
}
.key-protein::before { background: var(--protein); }
.key-carb::before { background: var(--carb); }
.key-fat::before { background: var(--fat); }

@media (max-width: 520px) {
  .macro-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "label readout"
      "slider slider"
      "number unit";
  }
  .macro-row label { grid-area: label; }
  .macro-row .readout { grid-area: readout; }
  .macro-row input[type="range"] { grid-area: slider; }
  .macro-row input[type="number"] { grid-area: number; }
  .macro-row .unit { grid-area: unit; }
}
```

- [ ] **Step 2: Reload `index.html` to confirm styling applies**

Expected: dark themed layout, aligned rows, a flat summary bar. Resize narrow → rows reflow to stacked layout.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: style calculator with responsive layout"
```

---

## Task 7: `app.js` — state, render, events, persistence

**Files:**
- Create: `app.js`

- [ ] **Step 1: Create `app.js`**

```js
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
```

- [ ] **Step 2: Manual verification in the browser**

Reload `index.html` and confirm each:
- [ ] On load, defaults show: Protein 150 / Carbs 200 / Fat 60, total **1940 kcal**, split ≈ 31 / 41 / 28%.
- [ ] Dragging a slider updates that row's grams, kcal, %, the total, and the bar — live.
- [ ] Typing in a macro's number field updates everything; typing a value above the slider max (e.g. protein 1200) pins the slider at max but keeps 1200 in the field and in the total.
- [ ] Typing a new **Total calories** value and pressing Enter/blur scales all three macros proportionally (split stays roughly the same).
- [ ] Setting all macros to 0 shows 0 kcal, 0% each, empty bar; then setting Total calories to e.g. 3600 produces a roughly even 33/33/33 split.
- [ ] Reload the page — values persist (localStorage).
- [ ] Resize to a narrow width — layout reflows to stacked rows and remains usable.

- [ ] **Step 3: Run unit tests to confirm nothing regressed**

Run: `node --test`
Expected: PASS (all calc tests still green).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: wire live state, render, and persistence"
```

---

## Task 8: README + GitHub Pages deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Macro ⇄ Calorie Calculator

Free, ad-free, zero-dependency calculator. Drag sliders (protein / carbs / fat)
or type grams; total calories and the percentage split update live. Editing the
total-calorie field scales all macros to hit that target.

Energy constants: protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g.

## Run locally

Open `index.html` in a browser. No build step, no install.

## Test

Requires Node 18+. No dependencies to install.

    npm test   # runs node --test on test/calc.test.js

## Deploy (GitHub Pages)

The app is plain static files at the repo root, so Pages can serve it directly.

1. Push to GitHub.
2. Repo → Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README and deploy instructions"
```

- [ ] **Step 3: Create the GitHub repo and push**

Run (requires `gh` authenticated; otherwise create the repo in the web UI and `git remote add origin ...` manually):
```bash
gh repo create macro-calorie-calculator --public --source=. --remote=origin --push
```
Expected: repo created and `main` pushed.

- [ ] **Step 4: Enable GitHub Pages**

Run:
```bash
gh api -X POST repos/{owner}/macro-calorie-calculator/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```
Expected: HTTP 201 with the Pages URL. (Or enable via Settings → Pages in the web UI.)

- [ ] **Step 5: Verify the deployed site**

Open `https://<user>.github.io/macro-calorie-calculator/` (allow ~1 min for first build).
Expected: the calculator loads and works exactly as it did locally.

---

## Self-Review Notes

- **Spec coverage:** math constants & derivation (Tasks 2–3), proportional calorie scaling + 0-cal fallback (Task 4), grams-primary sliders + number inputs + live readouts (Tasks 5–7), summary bar (Tasks 5–7), slider ranges 900/1000/500 (Task 5 markup + Task 2 `MAX`), localStorage persistence (Task 7), responsive + labels/aria (Tasks 5–6), default state 150/200/60 (Task 2), static files + GitHub Pages (Task 8). Non-goals (presets, TDEE, alcohol/fiber, accounts, ads) are absent by construction.
- **Type consistency:** `calc` returns `{calories, kcal:{protein,carb,fat}, percent:{protein,carb,fat}}` and is consumed identically in `app.js render()`. `scaleToCalories(state, target)` returns a `{protein_g, carb_g, fat_g}` state, assigned to `state` in `setCalories`. Element id scheme `${m}-slider/-grams/-kcal/-percent` and `bar-${m}` matches `index.html` exactly. `MAX[m]` keys (`protein/carb/fat`) match the `MACROS` array.
- **Placeholder scan:** none — every code step contains complete code.
