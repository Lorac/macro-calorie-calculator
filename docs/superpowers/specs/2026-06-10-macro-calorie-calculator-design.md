# Macro ⇄ Calorie Calculator — Design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)

## Purpose

A free, ad-free, dead-simple web calculator that converts between macronutrient
grams and calories in real time. Drag sliders (or type) for protein, carbs, and
fat; see total calories and the percentage split update live. Editing the total
calorie figure scales the macros proportionally, covering the "calories → macros"
direction as well.

## Goals & Non-Goals

**Goals**
- Live, two-way feel via a single grams-primary state model.
- Zero ads, zero tracking, zero runtime dependencies.
- Deployable as static files (GitHub Pages).
- Usable on mobile and desktop; accessible (labels + keyboard).
- Values persist across reloads.

**Non-Goals (YAGNI)**
- TDEE / BMR / calorie-goal estimation.
- Alcohol (7 kcal/g) or fiber adjustments.
- Diet presets (explicitly dropped).
- Accounts, backend, analytics, ads.

## Stack & Deployment

- **Files:** `index.html`, `style.css`, `app.js`. No build step, no framework,
  no npm dependencies. Opens by double-clicking `index.html`.
- **Hosting:** Git repo pushed to GitHub, served via GitHub Pages.

## The Math (single source of truth)

Energy constants:
- Protein = 4 kcal/g
- Carbs   = 4 kcal/g
- Fat     = 9 kcal/g

Authoritative state is grams only:

```
state = { protein_g, carb_g, fat_g }
```

Everything else is **derived**, never stored:

```
kcal_protein = 4 * protein_g
kcal_carb    = 4 * carb_g
kcal_fat     = 9 * fat_g
calories     = kcal_protein + kcal_carb + kcal_fat

percent_x    = calories > 0 ? (kcal_x / calories) * 100 : 0
```

## Interaction Model (grams-primary, all live)

Three macro rows, one each for protein / carbs / fat. Each row has:
- A `<label>` naming the macro.
- A **range slider** and a **number input**, bound to the same gram value
  (drag or type; the two stay in sync).
- A live readout of that macro's kcal and % of total.

A **total-calories field** (number input):
- Editing it scales all three macros **proportionally** to hit the new total
  (preserving the current percentage split).
- If current calories are 0 (nothing entered yet), editing the total falls back
  to an even split by energy: 1/3 of calories to each of protein, carb, fat,
  then converted to grams via their kcal/g constants.

A **summary bar**:
- Total kcal (large, prominent).
- A stacked horizontal bar showing P / C / F percentage segments, each labeled.

### Slider ranges

Maxes are sized to cover the most extreme documented elite-strongman intake
(Eddie Hall's World's Strongest Man peak). Number inputs may exceed these.

| Macro   | Slider min | Slider max | Step | Basis                                   |
|---------|-----------|-----------|------|-----------------------------------------|
| Protein | 0 g       | 900 g     | 1 g  | Hall carnivore peak (800–900 g)         |
| Carbs   | 0 g       | 1000 g    | 1 g  | Hall "more than a kilo of carbs"        |
| Fat     | 0 g       | 500 g     | 1 g  | Hall peak fat intake                    |

At all sliders maxed ≈ 11,700 kcal — strongman territory.

## Architecture (`app.js`)

Single update path: events mutate `state`, then `render()` redraws from `state`.
No two-way data binding tangle.

1. **`calc(state)` — pure function.**
   Input `{ protein_g, carb_g, fat_g }`. Returns
   `{ calories, kcal: {protein, carb, fat}, percent: {protein, carb, fat} }`.
   No DOM access — independently testable.

2. **`scaleToCalories(state, targetCalories)` — pure function.**
   Returns a new `state` whose macros are scaled proportionally to hit
   `targetCalories`, with the 0-calorie even-split fallback described above.

3. **`render(state)`** — writes derived values into the DOM (slider positions,
   number inputs, per-row kcal/%, summary bar). One direction only: state → UI.

4. **Event handlers** — slider `input`, number `input`, and calorie-field
   `input`/`change` events update `state` (calorie field via `scaleToCalories`),
   then call `render()`.

5. **Persistence** — on each state change, save `state` to `localStorage`; on
   load, restore it (falling back to a sensible default if absent/invalid).

## Data Flow

```
user drags slider / types grams ──► update state.<macro>_g ──► render()
user types total calories ──► scaleToCalories() ──► replace state ──► render()
render() ──► calc(state) ──► write sliders, inputs, kcal, %, summary bar
state change ──► localStorage.setItem
page load ──► localStorage.getItem ──► state (or default) ──► render()
```

## Edge Cases

- **Calories = 0:** all percentages render as 0%; summary bar empty. Calorie
  field uses even-split fallback.
- **Non-numeric / negative input:** clamp to ≥ 0; ignore NaN (treat as 0).
- **Number input above slider max:** allowed; slider pins at its max while the
  number input shows the true value.
- **Corrupt localStorage:** fall back to default state.
- **Rounding:** grams stored as integers (step 1); kcal and % displayed rounded
  (kcal to whole numbers, % to one decimal) but computed from exact values.

## Accessibility & Responsive

- Every control has an associated `<label>`; sliders have `aria` value text.
- Sliders keyboard-operable (native range behavior).
- Layout reflows to a single column on narrow screens.

## Testing

Pure functions (`calc`, `scaleToCalories`) are the test targets — runnable in a
plain HTML test page or any JS test runner without DOM mocking:
- `calc`: known gram inputs → expected calories and percentages
  (e.g. 100p/100c/100f → 1700 kcal; %: 23.5 / 23.5 / 52.9).
- `scaleToCalories`: scaling preserves the percentage split; 0-calorie input
  produces the even-energy-split fallback; target 0 → all zero.
- Edge cases: negatives clamped, NaN → 0.

## Default State

`{ protein_g: 150, carb_g: 200, fat_g: 60 }` (≈ 1940 kcal, ~31/41/28 split) —
a reasonable, non-empty starting point so the UI is meaningful on first load.
