# Physical Activity + Energy Balance (Deficit/Surplus) — Design

**Date:** 2026-06-11
**Status:** Approved (design questions answered: MET picker, single entry, live macro intake, weekly projection)

## Goal

Two chained additions to the Calorie Target Estimator card:

1. **Physical activity** — estimate calories burned by a specific exercise, on top
   of the baseline TDEE (which already reflects general lifestyle activity).
2. **Deficit vs surplus** — compare calories eaten (the macro card's live total)
   against calories burned (TDEE + exercise) and show the daily deficit/surplus
   plus projected weekly weight change.

## Physical activity

- `MET` constant map of common activities (walk/run/cycle/swim/weights/HIIT/yoga/hike).
- `exerciseKcal(metKey, weight_kg, minutes)` → `MET × kg × (minutes/60)`; unknown
  key → 0. Reuses the weight already entered for BMR.
- UI: an activity `<select>` + minutes input in the input grid, with a live
  "+N kcal" burn readout.

## Energy balance (deficit/surplus)

- **Intake** = `calc(state).calories` (the macro card's live total).
- **Expenditure** = `tdee(bmr, activity) + exerciseKcal(...)`. Uses raw TDEE, not
  the goal-adjusted target — balance reflects actual energy flux, the goal is only
  a suggested target.
- **Balance** = intake − expenditure. Negative = deficit (loss), positive =
  surplus (gain).
- `KCAL_PER_KG = 7700`, `KCAL_PER_LB = 3500`.
- `weeklyWeightChange(dailyBalanceKcal, units)` → `balance × 7 / perUnit`, signed.
  Honors the metric/imperial toggle. Non-finite input → 0.
- UI: a bordered "Energy balance" subsection showing eaten vs burned, the
  deficit/surplus magnitude + label, and projected ± weekly weight change.

## Protein from body weight (optional)

- `proteinFromBodyweight(gPerKg, weight_kg)` → `gPerKg × weight_kg` (sanitised).
- UI: an optional "Protein target" g/kg input in the estimator card. A "Set →"
  button (enabled only when it yields > 0 g) calls `changeControl('protein', grams)`,
  moving the protein slider in the macro card. The ratio is always per kg; the
  body weight may be entered in kg or lb (converted to kg internally). A live hint
  shows the computed grams.

## Cross-card sync

The balance depends on both cards, so the macro card's `render()` must refresh
the balance too. A module-level `renderBalanceHook` (no-op until the BMR section
initialises) is called at the end of `render()`; the BMR section assigns the real
`renderBalance` to it after `bmr` state exists. This avoids a temporal-dead-zone
reference from `render()` (which runs during initial `wire()`, before `let bmr`
is initialised).

## Persistence

Extend the existing `macro-calc-bmr` state with `exercise` (MET key) and
`exerciseMin`. No new storage key.

## Edge cases

- Exercise burn is 0 when no activity selected or minutes empty/invalid.
- Balance shows `—` until BMR inputs are ready (weight/height/age present).
- Exercise burn still displays even before full BMR readiness as long as weight
  is entered, since it only needs weight + minutes.

## Out of scope (YAGNI)

Multiple logged sessions, custom MET entry, calorie-adjusting the goal target from
the balance, heart-rate / step integrations.
