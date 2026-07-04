// Pure, framework-free macro/calorie math. Importable in browser and Node.

export const ENERGY = { protein: 4, carb: 4, fat: 9 }; // kcal per gram
export const MAX = { protein: 900, carb: 1000, fat: 500, calories: 12_000 }; // slider maxes
export const DEFAULT_STATE = { protein_g: 150, carb_g: 200, fat_g: 60 };

const MACRO_KEYS = ['protein', 'carb', 'fat'];

// --- BMR / TDEE -------------------------------------------------------------

// Activity multipliers applied to BMR to estimate maintenance calories (TDEE).
export const ACTIVITY = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Unit conversions (metric is the internal source of truth).
export function lbToKg(lb) {
  return sanitizeNumber(lb) * 0.45359237;
}
export function kgToLb(kg) {
  return sanitizeNumber(kg) / 0.45359237;
}
export function ftInToCm(ft, inch) {
  return (sanitizeNumber(ft) * 12 + sanitizeNumber(inch)) * 2.54;
}
export function cmToFtIn(cm) {
  const totalIn = sanitizeNumber(cm) / 2.54;
  const ft = Math.floor(totalIn / 12);
  return { ft, inch: totalIn - ft * 12 };
}

// Mifflin-St Jeor basal metabolic rate (kcal/day), floored at 0. Female uses the
// −161 constant; any other sex value uses the male +5 constant.
export function bmrMifflin({ sex, weight_kg, height_cm, age }) {
  const kg = sanitizeNumber(weight_kg);
  const cm = sanitizeNumber(height_cm);
  const yr = sanitizeNumber(age);
  const constant = sex === 'female' ? -161 : 5;
  return Math.max(0, 10 * kg + 6.25 * cm - 5 * yr + constant);
}

// Maintenance calories = BMR × activity multiplier (unknown key → sedentary).
export function tdee(bmr, activityKey) {
  return sanitizeNumber(bmr) * (ACTIVITY[activityKey] ?? ACTIVITY.sedentary);
}

// Goal-adjusted daily target from a direct calorie offset: cut subtracts the
// offset, bulk adds it, maintain ignores it. A cut never prescribes below BMR
// (resting needs), so the result is floored there. Unknown goal → maintain.
export function goalTarget(tdeeValue, bmrValue, goalKey, offsetKcal) {
  const t = sanitizeNumber(tdeeValue);
  const offset = sanitizeNumber(offsetKcal);
  if (goalKey === 'cut') return Math.max(sanitizeNumber(bmrValue), t - offset);
  if (goalKey === 'bulk') return t + offset;
  return t;
}

// --- Physical activity + energy balance -------------------------------------

// Grams of protein implied by a g-per-kg-bodyweight target and a body weight.
// e.g. 1.8 g/kg at 80 kg → 144 g. Inputs sanitized to non-negative.
export function proteinFromBodyweight(gPerKg, weight_kg) {
  return sanitizeNumber(gPerKg) * sanitizeNumber(weight_kg);
}

// Energy in one kg / one lb of body mass (classic ~7700 / ~3500 kcal rules).
export const KCAL_PER_KG = 7700;
export const KCAL_PER_LB = 3500;

// Project a daily energy balance (intake − expenditure, signed) to a weekly
// weight change in the chosen units. Positive = surplus/gain, negative =
// deficit/loss. Non-finite input → 0.
export function weeklyWeightChange(dailyBalanceKcal, units) {
  const n = Number(dailyBalanceKcal);
  if (!Number.isFinite(n)) return 0;
  const perUnit = units === 'imperial' ? KCAL_PER_LB : KCAL_PER_KG;
  return (n * 7) / perUnit;
}

// Everything the calculator derives from the raw estimator state (units-aware):
// metric body stats -> BMR -> TDEE -> goal target -> implied weekly change.
// `ready` is false until weight, height, and age are all entered; the numeric
// outputs are 0 until then. `offset` (the active cut/bulk kcal) is always
// reported so the UI can show the slider before the stats are complete.
export function energyProfile(s) {
  const offset = sanitizeNumber(s.goal === 'cut' ? s.cutKcal : s.bulkKcal);
  const imperial = s.units === 'imperial';
  const weight_kg = imperial ? lbToKg(s.weight) : sanitizeNumber(s.weight);
  const height_cm = imperial ? ftInToCm(s.height_ft, s.height_in) : sanitizeNumber(s.height_cm);
  const ready = weight_kg > 0 && height_cm > 0 && sanitizeNumber(s.age) > 0;
  if (!ready) return { ready, offset, bmr: 0, tdee: 0, target: 0, weeklyChange: 0 };

  const bmr = bmrMifflin({ sex: s.sex, weight_kg, height_cm, age: s.age });
  const t = tdee(bmr, s.activity);
  const target = goalTarget(t, bmr, s.goal, offset);
  return { ready, offset, bmr, tdee: t, target, weeklyChange: weeklyWeightChange(target - t, s.units) };
}

// Number of binding constraints implied by the pins (pins has exactly the four
// boolean keys protein/carb/fat/calories, so counting the true ones is enough).
export function constraintCount(pins) {
  return Object.values(pins).filter(Boolean).length;
}

// Whether `control`'s lock can be toggled: turning ON needs constraintCount <= 2;
// turning OFF (already pinned) is always allowed.
export function canPin(pins, control) {
  if (pins[control]) return true;
  return constraintCount({ ...pins, [control]: true }) <= 2;
}

// Coerce any value to a non-negative finite number; invalid/negative -> 0.
export function sanitizeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

// Derive calories, per-macro kcal, and percentage split from grams.
export function calc(state) {
  const protein_g = sanitizeNumber(state.protein_g);
  const carb_g = sanitizeNumber(state.carb_g);
  const fat_g = sanitizeNumber(state.fat_g);

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

function gk(m) {
  return `${m}_g`;
}

// Grams are kept as an EXACT (unrounded) source of truth. Rounding the source
// of truth makes chained scaling path-dependent (non-deterministic) and stops
// calc(state) from hitting a dragged calorie target. The UI rounds for display.
function gramState(s) {
  return { protein_g: s.protein_g, carb_g: s.carb_g, fat_g: s.fat_g };
}

function macroCal(state, m) {
  return ENERGY[m] * sanitizeNumber(state[gk(m)]);
}

function sanitizeState(s) {
  return {
    protein_g: sanitizeNumber(s.protein_g),
    carb_g: sanitizeNumber(s.carb_g),
    fat_g: sanitizeNumber(s.fat_g),
  };
}

function resolveMacro(state, pins, M, value) {
  const out = sanitizeState(state);
  const newVal = sanitizeNumber(value);

  if (!pins.calories) {
    out[gk(M)] = newVal;
    return gramState(out);
  }

  const K = calc(state).calories;
  const others = MACRO_KEYS.filter((m) => m !== M && !pins[m]);
  if (others.length === 0) return gramState(out); // infeasible; leave as-is

  const fixedCal = MACRO_KEYS.filter((m) => m !== M && pins[m]).reduce(
    (s, m) => s + macroCal(state, m),
    0,
  );

  let mVal = newVal;
  const targetOthersCal = K - ENERGY[M] * mVal - fixedCal;

  if (targetOthersCal < 0) {
    mVal = Math.max(0, (K - fixedCal) / ENERGY[M]);
    out[gk(M)] = mVal;
    for (const m of others) out[gk(m)] = 0;
    return gramState(out);
  }

  out[gk(M)] = mVal;
  const currentOthersCal = others.reduce((s, m) => s + macroCal(state, m), 0);
  if (currentOthersCal === 0) {
    const each = targetOthersCal / others.length;
    for (const m of others) out[gk(m)] = each / ENERGY[m];
  } else {
    const factor = targetOthersCal / currentOthersCal;
    for (const m of others) out[gk(m)] = sanitizeNumber(state[gk(m)]) * factor;
  }
  return gramState(out);
}

function resolveCalories(state, pins, value) {
  const out = sanitizeState(state);
  const T = sanitizeNumber(value);
  const unpinned = MACRO_KEYS.filter((m) => !pins[m]);
  if (unpinned.length === 0) return gramState(out);

  const fixedCal = MACRO_KEYS.filter((m) => pins[m]).reduce(
    (s, m) => s + macroCal(state, m),
    0,
  );
  const targetUnpinnedCal = T - fixedCal;

  if (targetUnpinnedCal <= 0) {
    for (const m of unpinned) out[gk(m)] = 0;
    return gramState(out);
  }

  const currentUnpinnedCal = unpinned.reduce((s, m) => s + macroCal(state, m), 0);
  if (currentUnpinnedCal === 0) {
    const each = targetUnpinnedCal / unpinned.length;
    for (const m of unpinned) out[gk(m)] = each / ENERGY[m];
  } else {
    const factor = targetUnpinnedCal / currentUnpinnedCal;
    for (const m of unpinned) out[gk(m)] = sanitizeNumber(state[gk(m)]) * factor;
  }
  return gramState(out);
}

// Resolve a single user change into a new valid grams state, honoring pins.
// control is 'protein' | 'carb' | 'fat' | 'calories'.
export function resolve(state, pins, control, value) {
  if (control === 'calories') return resolveCalories(state, pins, value);
  return resolveMacro(state, pins, control, value);
}
