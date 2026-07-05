import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeNumber,
  ENERGY,
  MAX,
  DEFAULT_STATE,
  ACTIVITY,
  calc,
  energyProfile,
  constraintCount,
  canPin,
  resolve,
  bmrMifflin,
  tdee,
  goalTarget,
  lbToKg,
  kgToLb,
  ftInToCm,
  cmToFtIn,
  weeklyWeightChange,
  proteinFromBodyweight,
  KCAL_PER_KG,
  KCAL_PER_LB,
  fatAdequacy,
} from '../calc.js';

test('fatAdequacy flags low dietary fat against the 20/25% thresholds', () => {
  assert.equal(fatAdequacy(2000, 30), 'none');     // default plate is healthy
  assert.equal(fatAdequacy(2000, 25), 'none');     // 25% is the top of caution
  assert.equal(fatAdequacy(2000, 24), 'low');      // caution band
  assert.equal(fatAdequacy(2000, 20), 'low');      // 20% is still caution
  assert.equal(fatAdequacy(2000, 19), 'very-low'); // below AMDR floor
  assert.equal(fatAdequacy(0, 0), 'none');         // empty plate never warns
});

test('sanitizeNumber coerces invalid input to 0 and passes valid numbers', () => {
  assert.equal(sanitizeNumber(-5), 0);
  assert.equal(sanitizeNumber('abc'), 0);
  assert.equal(sanitizeNumber(NaN), 0);
  assert.equal(sanitizeNumber(null), 0);
  assert.equal(sanitizeNumber('150'), 150);
  assert.equal(sanitizeNumber(150), 150);
});

test('bmrMifflin matches the Mifflin-St Jeor formula for male and female', () => {
  // Male, 80kg, 180cm, 30y: 10*80 + 6.25*180 − 5*30 + 5 = 1780
  assert.equal(bmrMifflin({ sex: 'male', weight_kg: 80, height_cm: 180, age: 30 }), 1780);
  // Female, 60kg, 165cm, 30y: 10*60 + 6.25*165 − 5*30 − 161 = 1320.25
  assert.equal(bmrMifflin({ sex: 'female', weight_kg: 60, height_cm: 165, age: 30 }), 1320.25);
});

test('bmrMifflin defaults to the male constant for an unknown sex and floors at 0', () => {
  assert.equal(
    bmrMifflin({ sex: 'other', weight_kg: 80, height_cm: 180, age: 30 }),
    bmrMifflin({ sex: 'male', weight_kg: 80, height_cm: 180, age: 30 }),
  );
  assert.equal(bmrMifflin({ sex: 'male', weight_kg: 0, height_cm: 0, age: 200 }), 0);
});

test('tdee multiplies BMR by the activity factor, unknown key -> sedentary', () => {
  assert.equal(tdee(2000, 'moderate'), 2000 * ACTIVITY.moderate);
  assert.equal(tdee(2000, 'nonsense'), 2000 * ACTIVITY.sedentary);
});

test('goalTarget applies a kcal offset: cut subtracts, bulk adds, maintain ignores', () => {
  assert.equal(goalTarget(2500, 1500, 'cut', 250), 2250); // TDEE − offset
  assert.equal(goalTarget(2500, 1500, 'bulk', 250), 2750); // TDEE + offset
  assert.equal(goalTarget(2500, 1500, 'maintain', 250), 2500); // offset ignored
  assert.equal(goalTarget(2500, 1500, 'nonsense', 250), 2500); // unknown -> maintain
});

test('goalTarget floors a cut at BMR (never prescribes below resting needs)', () => {
  // TDEE 2000, BMR 1600, a 600 deficit would land at 1400 -> clamped to 1600
  assert.equal(goalTarget(2000, 1600, 'cut', 600), 1600);
  // a modest deficit that stays above BMR is untouched
  assert.equal(goalTarget(2000, 1600, 'cut', 200), 1800);
});

test('weeklyWeightChange projects a daily balance over a week, signed', () => {
  // 1100 kcal/day deficit over a week = 7700 kcal = 1 kg loss
  assert.ok(approx(weeklyWeightChange(-1100, 'metric'), -1));
  assert.ok(approx(weeklyWeightChange(-1100, 'metric') * KCAL_PER_KG, -7700));
  // 500 kcal/day surplus in imperial: 500*7/3500 = 1 lb gain
  assert.ok(approx(weeklyWeightChange(500, 'imperial'), 1));
  assert.ok(approx(weeklyWeightChange(500, 'imperial') * KCAL_PER_LB, 3500));
  assert.equal(weeklyWeightChange(NaN, 'metric'), 0);
});

test('proteinFromBodyweight multiplies g/kg target by body weight', () => {
  assert.equal(proteinFromBodyweight(1.8, 80), 144);
  assert.equal(proteinFromBodyweight(2, 75), 150);
  assert.equal(proteinFromBodyweight('abc', 80), 0); // invalid ratio -> 0
  assert.equal(proteinFromBodyweight(2, -10), 0); // invalid weight -> 0
});

test('unit conversions round-trip metric <-> imperial', () => {
  assert.ok(approx(kgToLb(lbToKg(154)), 154));
  assert.ok(approx(lbToKg(220), 99.7903214));
  assert.ok(approx(ftInToCm(5, 11), 180.34));
  const { ft, inch } = cmToFtIn(180.34);
  assert.equal(ft, 5);
  assert.ok(approx(inch, 11));
});

test('energy constants, slider ranges, and default state are correct', () => {
  assert.deepEqual(ENERGY, { protein: 4, carb: 4, fat: 9 });
  assert.deepEqual(MAX, { protein: 900, carb: 1000, fat: 500, calories: 12000 });
  assert.deepEqual(DEFAULT_STATE, { protein_g: 150, carb_g: 200, fat_g: 600 / 9 });
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

test('resolve with no pins scales macros proportionally, preserving the split', () => {
  const scaled = resolve({ protein_g: 100, carb_g: 100, fat_g: 100 }, NONE, 'calories', 3400);
  assert.deepEqual(scaled, { protein_g: 200, carb_g: 200, fat_g: 200 });
});

test('resolve uses an even energy split when current calories are 0', () => {
  // target 3600 -> 1200 kcal each macro
  const scaled = resolve({ protein_g: 0, carb_g: 0, fat_g: 0 }, NONE, 'calories', 3600);
  assert.ok(approx(calc(scaled).calories, 3600));
  assert.ok(approx(4 * scaled.protein_g, 1200));
  assert.ok(approx(4 * scaled.carb_g, 1200));
  assert.ok(approx(9 * scaled.fat_g, 1200));
});

test('resolve with calorie target 0 zeroes all macros', () => {
  const scaled = resolve({ protein_g: 50, carb_g: 60, fat_g: 20 }, NONE, 'calories', 0);
  assert.deepEqual(scaled, { protein_g: 0, carb_g: 0, fat_g: 0 });
});

test('resolve sanitizes an invalid calorie target to 0', () => {
  const scaled = resolve({ protein_g: 50, carb_g: 60, fat_g: 20 }, NONE, 'calories', 'abc');
  assert.deepEqual(scaled, { protein_g: 0, carb_g: 0, fat_g: 0 });
});

const METRIC_PROFILE = {
  sex: 'male', units: 'metric', activity: 'moderate', goal: 'maintain',
  age: 30, weight: 80, height_cm: 180, height_ft: '', height_in: '',
  cutKcal: '250', bulkKcal: '250',
};

test('energyProfile derives BMR, TDEE, target, and weekly change from raw state', () => {
  const p = energyProfile(METRIC_PROFILE);
  assert.equal(p.ready, true);
  assert.equal(p.bmr, 1780); // Mifflin male 80kg/180cm/30y
  assert.equal(p.tdee, 1780 * ACTIVITY.moderate);
  assert.equal(p.target, p.tdee); // maintain
  assert.equal(p.weeklyChange, 0);

  const cut = energyProfile({ ...METRIC_PROFILE, goal: 'cut' });
  assert.equal(cut.offset, 250);
  assert.equal(cut.target, cut.tdee - 250);
  assert.ok(approx(cut.weeklyChange, (-250 * 7) / KCAL_PER_KG));
});

test('energyProfile converts imperial inputs and reports lb/week', () => {
  const p = energyProfile({
    ...METRIC_PROFILE, units: 'imperial', goal: 'bulk',
    weight: 176.4, height_cm: '', height_ft: 5, height_in: 10.9,
  });
  assert.equal(p.ready, true);
  assert.ok(approx(p.bmr, 1780, 1)); // same body as the metric case
  assert.ok(approx(p.weeklyChange, (250 * 7) / KCAL_PER_LB));
});

test('energyProfile is not ready until weight, height, and age are entered', () => {
  const p = energyProfile({ ...METRIC_PROFILE, age: '', goal: 'cut' });
  assert.equal(p.ready, false);
  assert.deepEqual(
    { offset: p.offset, bmr: p.bmr, tdee: p.tdee, target: p.target, weeklyChange: p.weeklyChange },
    { offset: 250, bmr: 0, tdee: 0, target: 0, weeklyChange: 0 },
  );
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
