# Macro ⇄ Calorie Calculator

Free, ad-free, zero-dependency calculator. Drag sliders (protein / carbs / fat)
or type grams; total calories and the percentage split update live. Editing the
total-calorie field scales all macros to hit that target.

Energy constants: protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g.

Slider maxes are sized to cover the most extreme documented elite-strongman
intake: protein 900 g, carbs 1000 g, fat 500 g. Number inputs may exceed them.

## Run locally

Modules are loaded over HTTP, so serve the folder rather than opening the file
directly:

    python3 -m http.server 8000   # then open http://localhost:8000

## Test

Requires Node 18+. No dependencies to install.

    npm test   # runs node --test on test/calc.test.js

## Deploy (GitHub Pages)

The app is plain static files at the repo root, so Pages can serve it directly.

1. Push to GitHub.
2. Repo → Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`.
