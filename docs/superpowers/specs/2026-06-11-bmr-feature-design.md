# BMR / TDEE Feature — Design

**Date:** 2026-06-11
**Status:** Approved (design questions answered: scope, formula, integration, units all confirmed)

## Goal

Add a Basal Metabolic Rate estimator to the macro ⇄ calorie calculator. It turns a
few body stats into a resting calorie burn (BMR), a maintenance estimate (TDEE),
and a goal-adjusted **daily calorie target** that can flow into the existing
calorie row so the macro sliders solve to it.

## Scope

BMR → TDEE → goal-adjusted target. Optional, additive; does not change existing
macro behaviour.

## Inputs

| Input    | Values                                                            |
|----------|------------------------------------------------------------------|
| Sex      | male / female (Mifflin-St Jeor constant differs)                  |
| Age      | years                                                             |
| Weight   | kg (metric) or lb (imperial)                                      |
| Height   | cm (metric) or ft + in (imperial)                                |
| Units    | metric ⇄ imperial toggle; **metric is the internal source of truth** |
| Activity | sedentary 1.2 / light 1.375 / moderate 1.55 / active 1.725 / very active 1.9 |
| Goal     | cut ×0.80 / maintain ×1.00 / bulk ×1.15                           |

## Math (pure, in `calc.js`, covered by `node --test`)

- `sanitizeNumber(value)` — generalised non-negative finite coercion (the existing
  `sanitizeGrams` becomes a thin alias to keep back-compat).
- `ACTIVITY` and `GOAL` constant maps.
- `bmrMifflin({ sex, weight_kg, height_cm, age })`
  → `10*kg + 6.25*cm − 5*age + (sex === 'female' ? −161 : 5)`, floored at 0.
- `tdee(bmr, activityKey)` → `bmr * ACTIVITY[key]`.
- `applyGoal(tdee, goalKey)` → `tdee * GOAL[key]`.
- Unit converters: `lbToKg`, `kgToLb`, `ftInToCm`, `cmToFtIn`.

Resting BMR uses the male constant by default when sex is unrecognised.

## UI

A third `.label` card after the macro card, same brutalist nutrition-label styling.
Rows for sex, age, weight, height (with unit-aware suffixes), an activity
`<select>`, and three goal buttons. Output block shows three stacked numbers:
**BMR (resting)**, **TDEE (maintenance)**, **Daily target** (goal-adjusted).

A **"Use as calorie target →"** button calls
`resolve(state, pins, 'calories', target)` and re-renders the macro card. Disabled
until inputs produce a finite BMR.

Invalid/empty inputs render as `—` rather than a number; the target button is
disabled in that state.

## Persistence

New `macro-calc-bmr` localStorage key holding `{ sex, age, weight, height_ft,
height_in, units, activity, goal }` (raw input values in the user's chosen units),
loaded/saved with the same debounce + `pagehide` pattern as macro state.

## Out of scope (YAGNI)

Katch-McArdle / body-fat input, Harris-Benedict alternative, weekly weight-change
projections, custom activity multipliers.
