import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateWeightTrajectory } from '../hall.js';
import { bmrMifflin, tdee, KCAL_PER_KG } from '../calc.js';

// A weight-stable 80 kg male: TDEE = maintenance intake.
const BODY = { sex: 'male', weight_kg: 80, height_cm: 180, age: 30, activityKey: 'moderate' };
const TDEE = tdee(bmrMifflin(BODY), BODY.activityKey);

test('eating at maintenance holds weight roughly flat', () => {
  const t = simulateWeightTrajectory({ ...BODY, intakeKcal: TDEE, carbKcal: TDEE * 0.4 }, 182);
  assert.equal(t[0].weightKg, 80);
  assert.ok(Math.abs(t.at(-1).weightKg - 80) < 0.5, `drifted to ${t.at(-1).weightKg}`);
});

test('a sustained deficit loses weight but decelerates toward a plateau', () => {
  const intake = TDEE - 500;
  const t = simulateWeightTrajectory({ ...BODY, intakeKcal: intake, carbKcal: intake * 0.4 }, 182);
  assert.ok(t.at(-1).weightKg < t[0].weightKg, 'should lose weight');

  // Monotonic loss.
  for (let i = 1; i < t.length; i++) {
    assert.ok(t[i].weightKg <= t[i - 1].weightKg + 1e-6, `non-monotone at day ${t[i].day}`);
  }

  // Deceleration: the last week loses less than the first week.
  const week1 = t[0].weightKg - t[7].weightKg;
  const lastWk = t.at(-8).weightKg - t.at(-1).weightKg;
  assert.ok(lastWk < week1, `expected slowing: week1=${week1} last=${lastWk}`);
});

test('day-0 rate is in the ballpark of the static 7700 kcal/kg rule', () => {
  const intake = TDEE - 500;
  const t = simulateWeightTrajectory({ ...BODY, intakeKcal: intake, carbKcal: intake * 0.4 }, 14);
  // Model loss over week 2 (past the glycogen/water transient), per day.
  const modelPerDay = (t[7].weightKg - t[14].weightKg) / 7;
  const staticPerDay = 500 / KCAL_PER_KG; // 7700 rule
  const ratio = modelPerDay / staticPerDay;
  assert.ok(ratio > 0.6 && ratio < 1.25, `model/static ratio ${ratio.toFixed(2)} out of range`);
});

test('non-viable inputs return an empty trajectory', () => {
  assert.deepEqual(simulateWeightTrajectory({ ...BODY, weight_kg: 0, intakeKcal: 2000 }, 90), []);
  assert.deepEqual(simulateWeightTrajectory({ ...BODY, intakeKcal: 0 }, 90), []);
});
