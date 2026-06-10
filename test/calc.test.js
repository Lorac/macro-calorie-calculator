import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeGrams,
  ENERGY,
  MAX,
  DEFAULT_STATE,
  calc,
  scaleToCalories,
  constraintCount,
  canPin,
  resolve,
} from '../calc.js';

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
  assert.deepEqual(MAX, { protein: 900, carb: 1000, fat: 500, calories: 12000 });
  assert.deepEqual(DEFAULT_STATE, { protein_g: 150, carb_g: 200, fat_g: 60 });
});

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

test('scaleToCalories scales macros proportionally, preserving the split', () => {
  const scaled = scaleToCalories({ protein_g: 100, carb_g: 100, fat_g: 100 }, 3400);
  assert.deepEqual(scaled, { protein_g: 200, carb_g: 200, fat_g: 200 });
});

test('scaleToCalories uses an even energy split when current calories are 0', () => {
  // target 3600 -> 1200 kcal each macro
  const scaled = scaleToCalories({ protein_g: 0, carb_g: 0, fat_g: 0 }, 3600);
  assert.ok(approx(calc(scaled).calories, 3600));
  assert.ok(approx(4 * scaled.protein_g, 1200));
  assert.ok(approx(4 * scaled.carb_g, 1200));
  assert.ok(approx(9 * scaled.fat_g, 1200));
});

test('scaleToCalories with target 0 zeroes all macros', () => {
  const scaled = scaleToCalories({ protein_g: 50, carb_g: 60, fat_g: 20 }, 0);
  assert.deepEqual(scaled, { protein_g: 0, carb_g: 0, fat_g: 0 });
});

test('scaleToCalories sanitizes an invalid target to 0', () => {
  const scaled = scaleToCalories({ protein_g: 50, carb_g: 60, fat_g: 20 }, 'abc');
  assert.deepEqual(scaled, { protein_g: 0, carb_g: 0, fat_g: 0 });
});

test('constraintCount counts pinned macros plus calories', () => {
  assert.equal(constraintCount({ protein: false, carb: false, fat: false, calories: false }), 0);
  assert.equal(constraintCount({ protein: true, carb: false, fat: false, calories: true }), 2);
  assert.equal(constraintCount({ protein: true, carb: true, fat: true, calories: false }), 3);
});

test('canPin allows turning on only while constraints stay <= 2, unpin always ok', () => {
  const none = { protein: false, carb: false, fat: false, calories: false };
  assert.equal(canPin(none, 'protein'), true);
  const two = { protein: true, carb: false, fat: false, calories: true };
  assert.equal(canPin(two, 'carb'), false); // would make 3
  assert.equal(canPin(two, 'protein'), true); // already pinned -> can unpin
  const twoMacros = { protein: true, carb: true, fat: false, calories: false };
  assert.equal(canPin(twoMacros, 'calories'), false);
  assert.equal(canPin(twoMacros, 'fat'), false);
});

const NONE = { protein: false, carb: false, fat: false, calories: false };
const approx = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test('resolve: macro change with calories unpinned just sets that macro', () => {
  const r = resolve({ protein_g: 150, carb_g: 200, fat_g: 60 }, NONE, 'protein', 100);
  assert.deepEqual(r, { protein_g: 100, carb_g: 200, fat_g: 60 });
});

test('resolve: macro change with calories pinned compensates others proportionally', () => {
  const pins = { protein: false, carb: false, fat: false, calories: true };
  const r = resolve({ protein_g: 100, carb_g: 200, fat_g: 100 }, pins, 'protein', 200);
  assert.equal(r.protein_g, 200); // the dragged macro lands exactly
  assert.ok(approx(calc(r).calories, 2100)); // total calories held
  assert.ok(approx(r.carb_g / r.fat_g, 2)); // original carb:fat = 200:100 preserved
});

test('resolve: calorie scaling is deterministic regardless of drag path', () => {
  const start = { protein_g: 150, carb_g: 200, fat_g: 60 };
  const direct = resolve(start, NONE, 'calories', 12000);
  let stepped = start;
  for (const t of [3000, 6000, 9000, 12000]) stepped = resolve(stepped, NONE, 'calories', t);
  assert.ok(approx(direct.protein_g, stepped.protein_g, 1e-6));
  assert.ok(approx(direct.carb_g, stepped.carb_g, 1e-6));
  assert.ok(approx(direct.fat_g, stepped.fat_g, 1e-6));
  assert.ok(approx(calc(direct).calories, 12000, 1e-6)); // hits the target exactly
});

test('resolve: calories + one macro pinned is a deterministic inverse', () => {
  const pins = { protein: false, carb: false, fat: true, calories: true };
  const r = resolve({ protein_g: 100, carb_g: 100, fat_g: 100 }, pins, 'protein', 150);
  assert.deepEqual(r, { protein_g: 150, carb_g: 50, fat_g: 100 });
});

test('resolve: macro pushed past the calorie budget clamps, others go to 0', () => {
  const pins = { protein: false, carb: false, fat: false, calories: true };
  const r = resolve({ protein_g: 100, carb_g: 100, fat_g: 100 }, pins, 'protein', 9999);
  assert.deepEqual(r, { protein_g: 425, carb_g: 0, fat_g: 0 });
});

test('resolve: calorie change scales only unpinned macros, pinned macro stays', () => {
  const pins = { protein: true, carb: false, fat: false, calories: false };
  const r = resolve({ protein_g: 100, carb_g: 200, fat_g: 100 }, pins, 'calories', 2400);
  assert.equal(r.protein_g, 100); // pinned macro untouched
  assert.ok(approx(calc(r).calories, 2400)); // hits the target exactly
  assert.ok(approx(r.carb_g / r.fat_g, 2)); // unpinned ratio preserved
});

test('resolve: calorie target below the pinned floor zeroes unpinned macros', () => {
  const pins = { protein: true, carb: false, fat: false, calories: false };
  const r = resolve({ protein_g: 100, carb_g: 100, fat_g: 100 }, pins, 'calories', 300);
  assert.deepEqual(r, { protein_g: 100, carb_g: 0, fat_g: 0 });
});
