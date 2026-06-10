// Pure, framework-free macro/calorie math. Importable in browser and Node.

export const ENERGY = { protein: 4, carb: 4, fat: 9 }; // kcal per gram
export const MAX = { protein: 900, carb: 1000, fat: 500, calories: 12_000 }; // slider maxes
export const DEFAULT_STATE = { protein_g: 150, carb_g: 200, fat_g: 60 };

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

// Coerce any value to a non-negative finite number; invalid/negative -> 0.
export function sanitizeGrams(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

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
    for (const m of others) out[gk(m)] = sanitizeGrams(state[gk(m)]) * factor;
  }
  return gramState(out);
}

function resolveCalories(state, pins, value) {
  const out = {
    protein_g: sanitizeGrams(state.protein_g),
    carb_g: sanitizeGrams(state.carb_g),
    fat_g: sanitizeGrams(state.fat_g),
  };
  const T = sanitizeGrams(value);
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
    for (const m of unpinned) out[gk(m)] = sanitizeGrams(state[gk(m)]) * factor;
  }
  return gramState(out);
}

// Resolve a single user change into a new valid grams state, honoring pins.
// control is 'protein' | 'carb' | 'fat' | 'calories'.
export function resolve(state, pins, control, value) {
  if (control === 'calories') return resolveCalories(state, pins, value);
  return resolveMacro(state, pins, control, value);
}

// Back-compat: scale all macros to a target with no pins.
export function scaleToCalories(state, targetCalories) {
  return resolve(
    state,
    { protein: false, carb: false, fat: false, calories: false },
    'calories',
    targetCalories,
  );
}
