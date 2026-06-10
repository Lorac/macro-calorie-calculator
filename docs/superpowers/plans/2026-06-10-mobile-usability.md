# Mobile Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the macro⇄calorie calculator comfortably usable on a phone — finger-sized tap targets, legible text, no overflow — without disturbing the desktop layout.

**Architecture:** CSS-only changes to `style.css`. Layout reflow stays width-based (`max-width: 520px`); touch ergonomics (slider thumbs, tap-target sizes) go in a `@media (pointer: coarse)` block so desktop stays compact. No JS, markup, or calculation changes.

**Tech Stack:** Vanilla HTML/CSS/JS, no build. Verification via short-lived headless Brave screenshots (per `browser-verify-sandbox-quirk` memory).

---

### Task 1: Baseline screenshots (before)

**Files:**
- Temp only (no commit)

- [ ] **Step 1: Capture current state at phone widths**

Run from project root (serve + screenshot in one call so the server isn't killed across calls):

```bash
cd /home/maximer/devel/calorie && python3 -m http.server 8765 & \
sleep 1 && \
brave --headless --no-sandbox --disable-gpu --window-size=360,780 --screenshot=/tmp/before-360.png http://localhost:8765/index.html && \
brave --headless --no-sandbox --disable-gpu --window-size=414,896 --screenshot=/tmp/before-414.png http://localhost:8765/index.html ; \
kill %1
```

Expected: two PNGs written. View them to note current cramped targets/text. (Brave binary is `/usr/bin/brave`.)

---

### Task 2: Slider thumbs + track sized for touch

**Files:**
- Modify: `style.css` (the `input[type="range"]` rule, line ~74)

- [ ] **Step 1: Replace the bare range rule with custom-styled track + thumb**

Replace:

```css
input[type="range"] { width: 100%; accent-color: var(--accent); }
```

with:

```css
input[type="range"] {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: var(--panel);
}
input[type="range"]::-moz-range-track {
  height: 6px;
  border-radius: 3px;
  background: var(--panel);
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  margin-top: -7px; /* center 20px thumb on 6px track */
  border-radius: 50%;
  background: var(--accent);
  border: none;
}
input[type="range"]::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
}
input[type="range"]:disabled { cursor: not-allowed; }
input[type="range"]:disabled::-webkit-slider-thumb { background: var(--muted); }
input[type="range"]:disabled::-moz-range-thumb { background: var(--muted); }
```

- [ ] **Step 2: Commit**

```bash
git add style.css && git commit -m "style: custom range slider for visible, grabbable thumb"
```

---

### Task 3: Touch tap-target sizes via pointer: coarse

**Files:**
- Modify: `style.css` (append a new media block)

- [ ] **Step 1: Append a touch/narrow-width block**

Add at the end of `style.css`. The combined query fires on narrow screens **or** any coarse-pointer (touch) device, so phones get large targets regardless of reported width — and the rules are visible at 360/414px screenshots:

```css
/* Phones / touch: enlarge tap targets and slider thumb */
@media (max-width: 520px), (pointer: coarse) {
  .lock {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 1.3rem;
  }
  input[type="number"] {
    min-height: 44px;
    font-size: 1rem; /* >=16px: prevents iOS zoom-on-focus */
  }
  input[type="range"] { height: 32px; } /* tall hit area */
  input[type="range"]::-webkit-slider-thumb { width: 28px; height: 28px; margin-top: -11px; }
  input[type="range"]::-moz-range-thumb { width: 28px; height: 28px; }
  .readout { font-size: 0.95rem; }
  .row-calories .readout { font-size: 0.9rem; }
  .bar-legend { font-size: 0.95rem; }
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css && git commit -m "style: 44px touch targets and larger text on coarse pointers"
```

---

### Task 4: Narrow-width layout polish (no overflow, reclaim space)

**Files:**
- Modify: `style.css` (the `@media (max-width: 520px)` block, line ~115, and `body` padding)

- [ ] **Step 1: Reduce body padding on small screens**

Inside the existing `@media (max-width: 520px)` block, add a `body` rule and tighten the row gap. The block currently only restyles `.row`. Update it to:

```css
@media (max-width: 520px) {
  body { padding: 1rem; }
  .row {
    grid-template-columns: 44px 1fr auto;
    grid-template-areas:
      "lock label readout"
      "slider slider slider"
      "number number unit";
    gap: 0.5rem 0.75rem;
  }
  .row .lock { grid-area: lock; }
  .row label { grid-area: label; }
  .row .readout { grid-area: readout; }
  .row input[type="range"] { grid-area: slider; }
  .row input[type="number"] { grid-area: number; }
  .row .unit { grid-area: unit; align-self: center; }
}
```

(Changes from current: `body { padding: 1rem }`, first column `2rem`→`44px` to fit the touch lock, explicit row/column `gap`, and `unit` vertical centering.)

- [ ] **Step 2: Commit**

```bash
git add style.css && git commit -m "style: tighten mobile layout, reclaim width, fit touch lock"
```

---

### Task 5: Verify (after) and confirm no regressions

**Files:**
- Temp only (no commit)

- [ ] **Step 1: Re-run the math test suite (should be untouched)**

Run: `cd /home/maximer/devel/calorie && node --test`
Expected: all tests PASS.

- [ ] **Step 2: After-screenshots at phone widths**

```bash
cd /home/maximer/devel/calorie && python3 -m http.server 8765 & \
sleep 1 && \
brave --headless --no-sandbox --disable-gpu --window-size=360,780 --screenshot=/tmp/after-360.png http://localhost:8765/index.html && \
brave --headless --no-sandbox --disable-gpu --window-size=414,896 --screenshot=/tmp/after-414.png http://localhost:8765/index.html ; \
kill %1
```

- [ ] **Step 3: Confirm acceptance criteria by viewing the screenshots**

Check, comparing to `/tmp/before-*.png`:
- No horizontal overflow at 360px (content fits within the viewport).
- Lock buttons are visibly large enough to tap; slider thumbs are clearly visible/grabbable.
- Readouts and legend are legible (not tiny).
- Desktop layout unchanged (optional: screenshot at `--window-size=900,700` and confirm rows are still single-line).

- [ ] **Step 4: Send the after-screenshots to the user for sign-off**

Use SendUserFile with `/tmp/after-360.png` and `/tmp/after-414.png`.

---

## Notes
- The Task 3 block uses `@media (max-width: 520px), (pointer: coarse)` so its enlargements render at the 360/414px screenshot widths (headless Brave reports a *fine* pointer, so a coarse-only query would be invisible to verification). Real touch devices still get the larger targets even above 520px.
- Slider thumb styling (Task 2) is unconditional and shows at all widths; layout (Task 4) shows at narrow widths. Together with Task 3 every change is screenshot-verifiable.
