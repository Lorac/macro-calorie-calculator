# Hall/Forbes weight-trajectory design

Replace the single instantaneous "≈ ±X/week" figure in the energy-balance
panel with a multi-week/month weight trajectory computed from the Hall dynamic
energy-balance model (Hall KD et al., *Lancet* 2011; 378:826-37), rendered as an
inline SVG curve that bends toward a plateau.

## Why

The static 7700 kcal/kg rule assumes a fixed calorie deficit yields linear,
unbounded weight loss. Real loss decelerates: as mass drops, maintenance energy
(TDEE) drops with it, so a fixed intake converges to a plateau. The Hall model
captures this by tracking fat/lean compartments, adaptive thermogenesis, and the
early glycogen/water transient. See the source critique in
`docs/` references (Thomas 2013; Hall & Chow response).

## Scope

- **In:** a new `hall.js` pure module; a milestone **table** (1 mo / 3 mo / 6 mo
  / 1 yr / plateau) in the balance panel; one `hall.test.js`.
- **Out:** the goal-card's `≈ ±X/week` hint (`app.js:196`) stays on the static
  estimate - it is a quick "this slider ≈ this rate" affordance and the model's
  day-0 slope agrees with it anyway.
- An SVG curve was prototyped first but dropped: auto-scaling made near-flat
  (maintenance) trajectories look dramatic, and a table shows every checkpoint at
  once without a horizon control.

## Model (all constants converted from the paper's kJ/MJ to kcal)

Simulated by forward Euler, `dt = 1 day`, out to the selected horizon.

### Constants
| Symbol | Value (kcal units) | Meaning |
|---|---|---|
| ρ_F | 9440 kcal/kg | energy density of fat |
| ρ_L | 1816 kcal/kg | energy density of lean (FFM) |
| ρ_G | 4206 kcal/kg | energy density of glycogen |
| γ_F | 3.107 kcal/kg/day | RMR coefficient, fat |
| γ_L | 21.99 kcal/kg/day | RMR coefficient, lean |
| η_F | 179.3 kcal/kg | fat-synthesis inefficiency |
| η_L | 229.4 kcal/kg | lean-synthesis inefficiency |
| β_TEF | 0.10 | thermic effect of food |
| β_AT | 0.14 | adaptive-thermogenesis magnitude |
| τ_AT | 14 days | adaptive-thermogenesis time constant |
| C | 2.00 kg | Forbes parameter, `= 10.4·ρ_L/ρ_F` |
| G0 | 0.5 kg | baseline glycogen; water = 2.7·glycogen |

### Initialisation
- Initial fat mass from Jackson regression (eq 4), by sex:
  - men: `F0 = BW/100 · (0.14·age + 37.31·ln(BW/H²) − 103.94)`
  - women: `F0 = BW/100 · (0.14·age + 39.96·ln(BW/H²) − 102.01)` (H in metres)
- `L0 = BW0 − F0` (baseline glycogen/water/ECF lumped into L0; only their
  *deviations* from baseline move body weight).

### Calibration anchor
The model's day-0 maintenance is pinned to the TDEE the app already shows, so no
second, disagreeing "maintenance" number appears:
- `RMR` = existing `bmrMifflin`; `PAL` = existing activity multiplier.
- `TDEE0 = RMR · PAL`.
- `δ = ((1 − β_TEF)·PAL − 1)·RMR/BW0` (eq 8).
- `K = TDEE0 − γ_F·F0 − γ_L·L0 − δ·BW0` (baseline EE = TDEE0 with all dynamic
  terms zero).
- `ΔEI = EI − TDEE0`, where `EI` = actual planned macro calories.

### Carb / sodium inputs
- `CI` = planned carb kcal (from the macros the user composes).
- Baseline carb intake `CI_b = (CI/EI)·TDEE0` — assumes the pre-diet baseline was
  weight-stable at the *same macro ratio*. Uses only data we have; the glycogen
  phase is a second-order early transient. (`ponytail:` comment marks this.)
- Dietary sodium change assumed 0 (not tracked; matches the NIH Body Weight
  Planner default). Zeroes the ΔNa term of the ECF equation.

### Per-day step
```
p    = C/(C + F)                                   # Forbes partition
dG   = (CI − k_G·G²)/ρ_G ,  k_G = CI_b/G0²         # eq 1
AT  += (β_AT·ΔEI − AT)/τ_AT                        # eq 7
TEF  = β_TEF·ΔEI                                   # eq 6
e   += (−3000·e − 4000·(1 − CI/CI_b))/3220         # eq 2, ΔNa=0, ECF deviation
z    = p·η_L/ρ_L + (1−p)·η_F/ρ_F
EE   = (K + γ_F·F + γ_L·L + δ·BW + TEF + AT + (EI − ρ_G·dG)·z) / (1 + z)   # eq 9
dF   = (1−p)·(EI − EE − ρ_G·dG)/ρ_F                # eq 3
dL   =    p ·(EI − EE − ρ_G·dG)/ρ_L                # eq 3
F += dF; L += dL; G += dG
BW = L + F + 3.7·(G − G0) + e
```

## Files touched
- **`hall.js`** (new): `simulateWeightTrajectory({sex, weight_kg, height_cm, age,
  activityKey, intakeKcal, carbKcal}, days) → [{day, weightKg}]`. Pure, no DOM.
- **`calc.js`**: `energyProfile` additionally returns `weight_kg`, `height_cm`
  so the caller has metric body params.
- **`app.js`** `renderBalance` → `renderTrajectory`: simulate 1095 days from
  `calc(state)` intake + `bmr` body params, index the milestone days, fill the
  table body.
- **`index.html`** balance panel: a `<table>` (When / Weight / Change).
- **`style.css`**: table styling; loss/gain deltas use the existing
  `--protein` / `--fat` vars.

## Rendering
Simulate once to 1095 days (≈plateau; the model's characteristic time is ~1 yr,
plateau ~3 yr). The trajectory array is indexed by day, so milestone rows read
`traj[30]`, `traj[91]`, `traj[182]`, `traj[365]`, `traj[1095]`. Each row shows
the projected weight and signed change from today, the change coloured blue
(loss) / red (gain) / dimmed (flat). The plateau row is emphasised. Intake is the
user's actual macro calories, not floored at BMR - if they compose an extreme
deficit the table honestly projects an extreme (and clinically implausible)
asymptote, since the model assumes that intake is held forever.

## Self-check (`test/hall.test.js`, `node --test`)
1. Zero imbalance (intake = TDEE) → flat line (start ≈ end within ε).
2. Sustained deficit → deceleration: |Δweight| in the final week < |Δweight| in
   week 1, and the curve is monotone.
3. Day-0 slope ≈ the old 7700 kcal/kg rule within ~15% (sanity vs. static rule).
