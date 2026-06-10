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
