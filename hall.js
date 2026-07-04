// Hall dynamic energy-balance model (Hall KD et al., Lancet 2011; 378:826-37).
// Simulates a multi-week/month body-weight trajectory that decelerates toward a
// plateau, unlike the static 7700 kcal/kg rule. Pure + framework-free.
// See docs/superpowers/specs/2026-07-03-hall-forbes-trajectory-design.md for the
// equation-by-equation derivation and the source appendix constants.

import { bmrMifflin, tdee, sanitizeNumber } from './calc.js';

// Paper constants, converted from kJ/MJ to kcal (1 kcal = 4.184 kJ).
const RHO_F = 9440;   // fat energy density, kcal/kg
const RHO_L = 1816;   // lean (FFM) energy density, kcal/kg
const RHO_G = 4206;   // glycogen energy density, kcal/kg
const GAMMA_F = 3.107;  // RMR regression coeff, fat (kcal/kg/day)
const GAMMA_L = 21.99;  // RMR regression coeff, lean (kcal/kg/day)
const ETA_F = 179.3;  // fat-synthesis inefficiency (kcal/kg)
const ETA_L = 229.4;  // lean-synthesis inefficiency (kcal/kg)
const BETA_TEF = 0.10;  // thermic effect of food
const BETA_AT = 0.14;   // adaptive-thermogenesis magnitude
const TAU_AT = 14;      // adaptive-thermogenesis time constant (days)
const C_FORBES = 10.4 * RHO_L / RHO_F; // Forbes partition parameter (kg) ~2.00
const G0 = 0.5;         // baseline glycogen (kg); water = 2.7 g / g glycogen

// Initial fat mass from the Jackson et al. regression (appendix eq 4).
// weight_kg, height_m, age in years.
function initialFatMass({ sex, weight_kg, height_m, age }) {
  const bmiLog = Math.log(weight_kg / (height_m * height_m));
  const c = sex === 'female' ? [39.96, 102.01] : [37.31, 103.94];
  const pctBody = 0.14 * age + c[0] * bmiLog - c[1];
  // Clamp to a physically sane 5..60% so degenerate inputs can't blow up L0.
  const pct = Math.min(60, Math.max(5, pctBody));
  return (weight_kg * pct) / 100;
}

// Simulate `days` of daily energy balance and return [{ day, weightKg }],
// including day 0 (the starting weight). intakeKcal is the planned daily intake;
// carbKcal is the carbohydrate share of it (drives the glycogen/water phase).
// Returns [] if inputs are not enough to define a body.
export function simulateWeightTrajectory(
  { sex, weight_kg, height_cm, age, activityKey, intakeKcal, carbKcal },
  days,
) {
  const BW0 = sanitizeNumber(weight_kg);
  const height_m = sanitizeNumber(height_cm) / 100;
  const yr = sanitizeNumber(age);
  const EI = sanitizeNumber(intakeKcal);
  const horizon = Math.max(1, Math.floor(sanitizeNumber(days)));
  if (BW0 <= 0 || height_m <= 0 || yr <= 0 || EI <= 0) return [];

  const rmr = bmrMifflin({ sex, weight_kg: BW0, height_cm, age: yr });
  const tdee0 = tdee(rmr, activityKey);
  if (tdee0 <= 0) return [];
  const pal = tdee0 / rmr;

  let F = initialFatMass({ sex, weight_kg: BW0, height_m, age: yr });
  let L = BW0 - F;

  const delta = ((1 - BETA_TEF) * pal - 1) * rmr / BW0; // eq 8
  const K = tdee0 - GAMMA_F * F - GAMMA_L * L - delta * BW0; // baseline EE = TDEE0
  const dEI = EI - tdee0; // drives TEF + adaptive thermogenesis

  // Carbohydrate / glycogen: assume the pre-diet baseline was weight-stable at
  // the same macro ratio, so baseline carb intake scales the current carb share
  // up to maintenance.
  // ponytail: CI_b from same-ratio baseline; refine only if we ever track the
  // user's real prior diet. Glycogen is a second-order early transient.
  const CI = sanitizeNumber(carbKcal);
  const CI_b = EI > 0 ? (CI / EI) * tdee0 : 0;
  const kG = CI_b > 0 ? CI_b / (G0 * G0) : 0;

  const TEF = BETA_TEF * dEI; // eq 6 (constant for a step diet change)
  let AT = 0;   // adaptive thermogenesis, relaxes to BETA_AT*dEI over TAU_AT
  let G = G0;   // glycogen mass
  let e = 0;    // extracellular-fluid deviation from baseline (kg)

  const out = [{ day: 0, weightKg: BW0 }];
  for (let day = 1; day <= horizon; day++) {
    const p = C_FORBES / (C_FORBES + F);               // Forbes partition
    const dG = kG > 0 ? (CI - kG * G * G) / RHO_G : 0;  // eq 1
    AT += (BETA_AT * dEI - AT) / TAU_AT;                // eq 7
    e += (-3000 * e - 4000 * (1 - (CI_b > 0 ? CI / CI_b : 1))) / 3220; // eq 2, dNa=0

    const BW = L + F + 3.7 * (G - G0) + e;
    const z = p * ETA_L / RHO_L + (1 - p) * ETA_F / RHO_F;
    const glycFlux = RHO_G * dG; // energy diverted into glycogen
    const EE = (K + GAMMA_F * F + GAMMA_L * L + delta * BW + TEF + AT
      + (EI - glycFlux) * z) / (1 + z);                 // eq 9
    const avail = EI - EE - glycFlux;
    F += (1 - p) * avail / RHO_F;                       // eq 3
    L += p * avail / RHO_L;                             // eq 3
    G += dG;
    if (F < 0) F = 0;

    out.push({ day, weightKg: L + F + 3.7 * (G - G0) + e });
  }
  return out;
}
