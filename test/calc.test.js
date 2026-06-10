import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeGrams,
  ENERGY,
  MAX,
  DEFAULT_STATE,
  calc,
  scaleToCalories,
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
  assert.deepEqual(MAX, { protein: 900, carb: 1000, fat: 500 });
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
