# Mobile Usability — Design

**Date:** 2026-06-10
**Status:** Approved (Approach A)

## Problem

The calculator has a `@media (max-width: 520px)` block that reflows each row, but
on a real phone it's hard to use: tap targets (lock buttons, slider thumbs,
number inputs) are too small for a finger, some text is too small, and spacing
can feel cramped/overflow at narrow widths (360–430px).

## Goal

Make the app genuinely usable on a phone — comfortable touch targets, legible
text, no overflow — without disturbing the working desktop layout. CSS-only
where possible; no calculation/logic changes.

## Approach

**A — Targeted touch + type polish on the existing layout.** Keep the row-reflow
grid; fix what makes it unusable. Chosen over a card redesign (B) or full
rewrite (C) per YAGNI: the layout is fundamentally fine, only its touch
ergonomics are not.

## Changes (style.css; markup only if a tap target needs a wrapper)

### Tap targets
- **Lock buttons:** min `44×44px` hit area, glyph centered (currently ~20px
  emoji with 0.2rem padding). Use `min-width`/`min-height` + flex centering so
  the visual size stays modest while the touch area is large.
- **Slider thumbs:** custom-style `::-webkit-slider-thumb` and
  `::-moz-range-thumb` to ~28px on a taller track, keeping the accent color.
  This replaces the bare `accent-color` thumb (renders ~16px, too small to drag).
- **Number inputs:** ensure ~44px height on touch via padding/min-height.

### Text / iOS zoom
- Keep number inputs at ≥16px font (already `1rem`) to avoid iOS
  zoom-on-focus.
- Bump small readouts (`.readout` 0.85rem, `.row-calories .readout` 0.8rem,
  `.bar-legend` 0.85rem) up slightly for legibility on small screens.

### Layout / overflow
- Keep the `520px` layout breakpoint. Verify no overflow at ~360px.
- Reduce `body` padding on small screens (1.5rem → ~1rem) to reclaim width.
- Tighten reflowed grid gaps so the slider gets full width and the
  number/unit row reads cleanly.

### Targeting strategy
- Width-based breakpoint for **layout** (as today).
- `@media (pointer: coarse)` for **thumb/tap-target sizing**, so desktop stays
  compact regardless of window width.

## Out of scope
- No JS or calculation changes. No markup-logic changes (a non-semantic wrapper
  for a tap target is acceptable if required).
- No card redesign, no theme/color changes.

## Verification
- Screenshot at 360px and 414px viewports with the headless-brave harness
  (short-lived `brave --headless --screenshot`, per the sandbox quirk).
- Confirm: lock/slider/number targets are finger-sized, no horizontal overflow,
  readouts legible. Existing `node --test` suite still passes (should be
  untouched, but run it).
