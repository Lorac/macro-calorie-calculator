# Pinning + Calorie Slider — Design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Builds on:** [2026-06-10-macro-calorie-calculator-design.md](./2026-06-10-macro-calorie-calculator-design.md)

## Purpose

Let the user control the macro/calorie ratio by **pinning**: lock 1 or 2 macros
and/or lock total calories, then adjust the rest and watch the unpinned values
trade off to keep every pin satisfied. Also make **total calories draggable via
a slider** (it is currently a number input only).

## Mental Model

A pin = "locked, won't move." When the user changes any unpinned control, only
the *unpinned* values shift to keep all pins satisfied. A pinned control is
**disabled** (greyed) — you set a value, lock it, then tweak the rest. To change
a pinned value, unpin it first.

## UI Changes

- **Calorie row** gains a range slider (min 0, max 12,000, step 1) beside its
  existing number input — same slider+input pattern as the macro rows. 12,000 ≈
  the all-macros-maxed total (~12,100 kcal). The number input may still exceed.
- **Each of the 4 rows** (protein, carbs, fat, calories) gains a **lock toggle
  button** showing 🔓 (unlocked) / 🔒 (locked).
- A locked row's slider and number input are `disabled`. The lock button stays
  clickable (to unlock).
- A lock button that *cannot* currently be turned on (would over-constrain — see
  rules) is itself `disabled` and visually muted.

## Pin Feasibility Rules

Grams `{P, C, F}` carry 3 degrees of freedom. Define:

```
constraintCount(pins) = (#pinned macros) + (pins.calories ? 1 : 0)
```

Turning a pin **on** is allowed only if the resulting `constraintCount ≤ 2`.
This guarantees at least one macro is always free to move.

- Allowed end states: pin 1 macro · pin 2 macros · pin calories · pin calories + 1 macro.
- Disallowed (blocked at the toggle): calories + 2 macros, or all 3 macros.
- At `constraintCount == 2`, every not-yet-pinned lock is disabled.

Unpinning is always allowed.

## State

- Source of truth stays grams: `state = { protein_g, carb_g, fat_g }`.
- New separate, persisted booleans: `pins = { protein, carb, fat, calories }`.
- Both `state` and `pins` are saved to / restored from localStorage.

## Resolve Logic (pure)

A single pure function does all constraint solving:

```
resolve(state, pins, control, value) -> new { protein_g, carb_g, fat_g }
```

Energy: protein 4, carb 4, fat 9 kcal/g. All output grams are rounded to whole
numbers (consistent with the grams-integer model; exact calorie hits are
approximate at whole-gram resolution).

### control is a macro M

- `newVal = sanitizeGrams(value)`.
- **If `pins.calories` is false:** return `state` with `M` set to `newVal`
  (other macros untouched; calories recompute downstream). This is today's
  behavior.
- **If `pins.calories` is true:** keep total calories fixed at
  `K = calc(state).calories`.
  - `others` = macros ≠ M that are **not** pinned.
  - `fixedCal` = summed calories of macros ≠ M that **are** pinned.
  - `targetOthersCal = K - energy[M]·newVal - fixedCal`.
  - If `targetOthersCal < 0` (M pushed too high): clamp
    `newVal = max(0, (K - fixedCal) / energy[M])` and set every `other` to 0.
  - Else if current summed calories of `others` is 0: split `targetOthersCal`
    evenly across `others` (`grams = (targetOthersCal/others.length)/energy[m]`).
  - Else: scale each `other` by `factor = targetOthersCal / currentOthersCal`
    (preserves the ratio between the others — *proportional compensation*).
  - Guard: if `others` is empty (cannot happen in a feasible pin state), return
    `state` unchanged.

### control is 'calories'

(UI disables this when calories is pinned; the function still guards.)

- `T = sanitizeGrams(value)`.
- `pinnedMacros` keep their grams; `fixedCal` = their summed calories.
- `unpinned` macros must sum to `targetUnpinnedCal = T - fixedCal`.
  - If `targetUnpinnedCal <= 0`: set all `unpinned` macros to 0 (target clamps to
    the pinned-calorie floor).
  - Else if current summed calories of `unpinned` is 0: even split across them.
  - Else: scale each `unpinned` by `factor = targetUnpinnedCal / currentUnpinnedCal`.

`scaleToCalories(state, T)` becomes a thin wrapper:
`resolve(state, {protein:false,carb:false,fat:false,calories:false}, 'calories', T)`
— preserving its existing tests (no pins → scales all three proportionally;
target 0 → all zero; current 0 → even split).

## Data Flow

```
toggle lock ──► if canPin / unlocking: flip pins[control] ──► save ──► render
move unpinned macro/calorie ──► resolve(state, pins, control, value)
                              ──► replace state ──► save ──► render
render ──► calc(state) ──► write sliders, inputs, kcal, %, summary bar,
          lock button states (active/disabled), and disabled attrs on
          pinned rows + over-constrained locks
```

## Edge Cases

- **Negative / NaN inputs:** `sanitizeGrams` clamps to ≥ 0 / 0.
- **Compensation drives an `other` below 0:** that macro clamps at 0; remaining
  required reduction shifts to the other unpinned macro via the proportional
  rescale (the clamp falls out of `targetOthersCal < 0` and even/factor paths).
- **Calorie target below pinned floor:** unpinned macros clamp to 0.
- **Dragging a free macro under calories+1-macro pin:** deterministic — the one
  remaining unpinned macro absorbs the entire change (single-element `others`).
- **Corrupt / missing localStorage pins:** fall back to all-false.

## Testing

`resolve` (pure, `node:test`, no DOM):
- macro change, calories unpinned → only that macro changes.
- macro change, calories pinned, no macro pinned → others compensate
  proportionally, total preserved.
- macro change, calories + 1 macro pinned → single free macro absorbs (inverse).
- macro pushed past the pinned-calorie budget → clamps, others hit 0.
- calories change with one macro pinned → only unpinned macros scale; pinned
  stays.
- calorie target below pinned floor → unpinned macros 0.
- `scaleToCalories` wrapper still satisfies its original three tests.

`canPin(pins, control)` (pure):
- returns false when turning it on would make `constraintCount > 2`; true
  otherwise; unpinning always permitted.

DOM wiring (lock buttons, disabled states, calorie slider) verified manually in
the browser, consistent with the original app's verification approach.

## Out of Scope (unchanged)

TDEE/BMR, alcohol/fiber, presets, accounts, ads/analytics.
