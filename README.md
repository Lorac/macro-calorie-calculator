# Macro ⇄ Calorie Calculator

Free, ad-free, zero-dependency calculator. Drag sliders (protein / carbs / fat)
or type grams; total calories and the percentage split update live. Editing the
total-calorie field scales all macros to hit that target.

Energy constants: protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g.

Slider maxes are sized to cover the most extreme documented elite-strongman
intake: protein 900 g, carbs 1000 g, fat 500 g. Number inputs may exceed them.

A small service worker (`sw.js`) caches the app so it keeps working offline
after the first visit; deploys reach users one page load later.

## Run locally

Modules are loaded over HTTP, so serve the folder rather than opening the file
directly:

    python3 -m http.server 8000   # then open http://localhost:8000

## Test

Requires Node 20+. The app itself has zero dependencies; the headless UI tests
use `happy-dom` (dev-only), so install once first:

    pnpm install
    pnpm test   # node --test on test/calc.test.js + test/ui.test.js

## Deploy (Cloudflare Pages)

The app is plain static files at the repo root, so Pages can serve it directly.

1. Push to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Connect to Git, pick this
   repo, branch `main`. Build command: empty. Deploy command: `npx wrangler deploy`.
   `wrangler.jsonc` serves the repo root as static assets; `.assetsignore` keeps
   the non-site files out.
3. Register `macros.fyi` and add it to Cloudflare as a zone (point the
   registrar's nameservers at the ones Cloudflare assigns).
4. Project → Custom domains → `macros.fyi`. It is an apex domain, so Cloudflare
   creates the proxied root record itself once the zone is active.
