# GitHub Pages capability comparison against `main`

Baseline: `main:src/template.html`, `main:src/build-web.js`, `main:src/README.md`.
Candidate: Vue/Vite app under `src/web/` plus `src/build-web.js`.

## Deployment/build contract

| Capability on `main` | Current support | Evidence / note |
| --- | --- | --- |
| Static Pages artifact | Supported | `npm run build-web` writes `docs/index.html`, `docs/bootstrap-data.json`, `docs/.nojekyll`, and the worker asset. |
| Root `index.html` duplicate | Intentionally removed | Repository cleanup made `docs/` the sole Pages artifact; root generated files are ignored/removed. |
| Strict TypeScript with build | Supported | `npm run build` and `npm run build-web` both run `npm run typecheck`; typecheck covers Vue app and `vite.config.ts`. |
| Build-time Moxfield proxy | Supported | `src/build-web.js` injects `window.__MOXFIELD_PROXY__`; JSON-bootstrap-only proxy is also read at import time. |
| Static candidate/recommendation seed data | Supported | `src/build-web.js` writes `bootstrap-data.json`; `src/web/services/bootstrap.ts` loads it. |

## Runtime capability matrix

| Capability on `main` | Current support | Evidence / note |
| --- | --- | --- |
| Default sample deck loads | Supported | `writeBootstrap()` emits `Sample deck — Xantcha`; static build smoke covers it. |
| Canvas graph: drag, pan, zoom, hover/select | Supported | `src/web/services/graphRenderer.ts`; app smoke covers detail selection and renderer lifecycle indirectly. |
| Reset, relayout, freeze, hide isolated | Supported | `src/web/App.vue` toolbar controls and `GraphCanvas` renderer facade. |
| Gravity modes | Supported | `src/web/services/graphLayoutStrategies.ts` preserves links+power, links/size=power, and power-weighted links modes. |
| Role filtering | Supported | `RoleLegend.vue` toggles `roleVisibility` consumed by `GraphRenderer`. |
| Tooltip and selected-card detail | Supported | Vue tooltip/detail restores role, event summary, family chips, pills, and interaction-web links. |
| Deck tabs add/switch/remove | Supported | `DeckTabs.vue`; close now preserves the logical active deck when closing earlier tabs. |
| Compare modal | Supported with richer parity | Uses `metricsToCompareRows()` for win summary, bracket, win tuning, Game Changers, cohesion, self-sufficiency, structure, and island counts. |
| File import and drag/drop | Supported | `ImportControls.vue`, `FileDeckImporter`, and drop overlay. |
| Pasted decklist import | Supported plus improvement | `ImportControls.vue` adds explicit paste-list import. |
| Moxfield URL import | Supported | Direct API first, configured proxy fallback, clear no-proxy degradation. |
| Recommendations drawer | Supported | Worker-backed recommendation provider; drawer refreshes when the active deck changes while open. |
| Help/onboarding | Supported | Help modal restores user-facing map/add/layout/recommendation guidance. |
| Loading/drop affordances | Supported | Full-screen loading and drop overlays match the previous graph-side affordances. |
| Styling parity | Mostly matched | Dark panel theme, red accent buttons/tabs, fixed right drawer, legacy modal chrome, input styling, bottom hint, and capped role scroll restored. |

## Intentional differences

- `docs/` is now the only GitHub Pages deploy artifact. `main` also wrote root `index.html` and root `.nojekyll`; those root files are generated duplicates and were removed to keep source vs generated outputs separate.
- Candidate/bootstrap data is a cacheable static JSON asset instead of a large inline script payload. The built HTML still inlines JS/CSS assets for static hosting and points to `./bootstrap-data.json`.
- The Vue implementation keeps shared scoring/classification logic in JS modules for CLI/browser parity while adding strict TypeScript at the web-app and config boundaries.

## Validation coverage

- `test/build-contract.test.js` prevents `build` / `build-web` from bypassing strict typecheck.
- `test/web/import-proxy.test.ts` covers bootstrap-updated Moxfield proxy wiring.
- `test/web/app-smoke.test.ts` covers sample render, detail, import/drop/paste, compare, help, and recommendations drawer.
- `test/web/build-web-static-site.test.js` covers the static Pages artifact contract.
- `test/web/pure-adapters.test.mjs` covers pure decklist, graph model, and layout adapter behavior.
