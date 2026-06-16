// Headless UI tests: load the REAL index.html + style.css + app.js into happy-dom
// and assert on the rendered DOM. This covers the wiring the pure calc.js tests
// can't: id integrity, render output, the cross-card balance hook, unit
// conversion, the protein-apply button, and the metric/imperial height toggle
// (a CSS-cascade regression that happy-dom's getComputedStyle does model).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Window } from 'happy-dom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'style.css'), 'utf8');

// Strip the doctype/<html> wrappers and the module <script> (we import app.js
// ourselves; we don't want happy-dom to also run it).
const bodyHtml = html
  .replace(/<!DOCTYPE[^>]*>/i, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<script type="module"[^>]*><\/script>/gi, '');

let bust = 0;

// Build a fresh window from the real page, seed localStorage, wire the bare
// globals app.js reads, then cache-bust-import app.js so its wire()/wireBmr()
// runs against THIS DOM. Returns { win, doc }.
async function load(storage = {}) {
  const win = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  doc.documentElement.innerHTML = bodyHtml;

  const style = doc.createElement('style');
  style.textContent = css; // so getComputedStyle reflects the real cascade
  doc.head.appendChild(style);

  win.localStorage.clear();
  for (const [k, v] of Object.entries(storage)) {
    win.localStorage.setItem(k, JSON.stringify(v));
  }

  globalThis.window = win;
  globalThis.document = doc;
  globalThis.localStorage = win.localStorage;
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.removeEventListener = win.removeEventListener.bind(win);

  await import(`../app.js?t=${bust++}`);
  return { win, doc };
}

const $ = (doc, id) => doc.getElementById(id);
const display = (win, doc, id) => win.getComputedStyle($(doc, id)).display;
const fire = (win, elm, type) => elm.dispatchEvent(new win.Event(type, { bubbles: true }));

const READY_BMR = {
  sex: 'male', units: 'metric', activity: 'moderate', goal: 'maintain',
  age: 30, weight: 80, height_cm: 180, height_ft: '', height_in: '',
  proteinPerKg: '', cutKcal: '250', bulkKcal: '250',
};

test('default render populates the macro card from DEFAULT_STATE', async () => {
  const { doc } = await load();
  assert.equal($(doc, 'total-kcal').textContent, '1,940'); // 150*4 + 200*4 + 60*9
  assert.equal($(doc, 'protein-kcal').textContent, '600');
  assert.equal($(doc, 'protein-grams').value, '150');
});

test('height metric/imperial toggle controls computed display (guards the [hidden] cascade)', async () => {
  const { win, doc } = await load();
  // Metric default: cm shown, ft/in hidden.
  assert.notEqual(display(win, doc, 'height-metric'), 'none');
  assert.equal(display(win, doc, 'height-imperial'), 'none');
  // Switch to imperial: cm hidden, ft/in shown.
  $(doc, 'units-imperial').click();
  assert.equal(display(win, doc, 'height-metric'), 'none');
  assert.notEqual(display(win, doc, 'height-imperial'), 'none');
});

test('energy balance reacts to a macro change via the cross-card hook', async () => {
  const { win, doc } = await load({ 'macro-calc-bmr': READY_BMR });
  assert.notEqual($(doc, 'balance-out').textContent, '—'); // bmr ready -> computed
  const before = $(doc, 'balance-delta').textContent;

  const slider = $(doc, 'protein-slider');
  slider.value = '300';
  fire(win, slider, 'input'); // intake rises -> balance must move

  assert.notEqual($(doc, 'balance-delta').textContent, before);
});

test('switching units converts and refills the weight/height inputs', async () => {
  const { win, doc } = await load({ 'macro-calc-bmr': READY_BMR });
  $(doc, 'units-imperial').click();
  assert.ok(Math.abs(Number($(doc, 'bmr-weight').value) - 176.4) < 0.2); // 80kg -> ~176.4lb
  assert.equal(Number($(doc, 'bmr-height-ft').value), 5); // 180cm -> 5ft 10.9in
});

test('protein-apply sets the protein macro from g/kg * body weight', async () => {
  const { win, doc } = await load({ 'macro-calc-bmr': { ...READY_BMR, proteinPerKg: 1.8 } });
  const btn = $(doc, 'protein-apply');
  assert.equal(btn.disabled, false);
  btn.click();
  assert.equal($(doc, 'protein-grams').value, '144'); // 1.8 * 80
});

test('protein target switches to g/lb in imperial and stays equivalent', async () => {
  const { doc } = await load({ 'macro-calc-bmr': { ...READY_BMR, proteinPerKg: 1.8 } });
  assert.match($(doc, 'protein-unit').textContent, /g\/kg/);

  $(doc, 'units-imperial').click(); // 1.8 g/kg -> ~0.82 g/lb, 80kg -> ~176.4lb
  assert.match($(doc, 'protein-unit').textContent, /g\/lb/);
  assert.ok(Math.abs(Number($(doc, 'protein-per-kg').value) - 0.82) < 0.02);

  $(doc, 'protein-apply').click(); // grams preserved across the unit switch
  assert.ok(Math.abs(Number($(doc, 'protein-grams').value) - 144) <= 2);
});

test('cut & bulk are offset-driven: slider shows and target = TDEE ∓ offset', async () => {
  const { doc } = await load({ 'macro-calc-bmr': { ...READY_BMR, goal: 'bulk', bulkKcal: '250' } });
  // BMR 1780 × 1.55 = 2759 TDEE; +250 surplus = 3009
  assert.equal($(doc, 'offset-field').hidden, false);
  assert.match($(doc, 'offset-label').textContent, /surplus/i);
  const bulkTarget = Number($(doc, 'target-value').textContent.replace(/[^0-9]/g, ''));
  assert.ok(Math.abs(bulkTarget - 3009) <= 2, `bulk target ~3009, got ${bulkTarget}`);

  $(doc, 'goal-maintain').click(); // maintain hides the slider, target = TDEE
  assert.equal($(doc, 'offset-field').hidden, true);
  const maintainTarget = Number($(doc, 'target-value').textContent.replace(/[^0-9]/g, ''));
  assert.ok(Math.abs(maintainTarget - 2759) <= 2, `maintain target ~2759, got ${maintainTarget}`);

  $(doc, 'goal-cut').click(); // cut subtracts the offset (cutKcal 250) -> 2509
  assert.equal($(doc, 'offset-field').hidden, false);
  assert.match($(doc, 'offset-label').textContent, /deficit/i);
  const cutTarget = Number($(doc, 'target-value').textContent.replace(/[^0-9]/g, ''));
  assert.ok(Math.abs(cutTarget - 2509) <= 2, `cut target ~2509, got ${cutTarget}`);
});
