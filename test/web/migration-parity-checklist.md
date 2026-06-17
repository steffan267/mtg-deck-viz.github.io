# Vue 3 + TypeScript Migration Parity Checklist

Scope owner: lane 6 (tests, parity, verification). Source plan: `.omx/plans/vue3-typescript-script-setup-migration-plan.md`.

## Build and static-site parity

- [ ] `npm run build-web` or the lane-1 replacement emits a deployable static artifact.
- [ ] Publication path is explicit: preserve both `index.html` and `docs/index.html`, or document and wire the replacement `dist`/Pages artifact flow.
- [ ] Root `.nojekyll` and artifact `.nojekyll` are emitted or otherwise covered by deployment config.
- [ ] The sample deck loads by default with `active: 0`.
- [ ] Build-time/static runtime config preserves `MOXFIELD_PROXY` for live Moxfield import.
- [ ] Candidate index/recommendation seed data is available to the browser without a network round trip.

Current executable coverage:
- `test/web/build-web-static-site.test.js` smoke-checks the Vite/build-web static artifact contract without changing `package.json`.
- `test/web/pure-adapters.test.mjs` unit-checks currently extracted pure `src/web` decklist, graph model, and layout strategy adapters using Node 24 native TypeScript loading.

## Pure adapter / view-model unit-test targets

Add these as soon as lane 1/implementation lanes extract the corresponding modules under `src/web/`:

- [ ] `services/config` parses bootstrap payload, candidate index, and proxy config from injected/static sources.
- [ ] `services/deckImport` normalizes file, pasted text, browser Scryfall resolution, and Moxfield responses into one `DeckImportResult` shape.
- [ ] `services/deckState` adds, switches, removes, and compares deck tabs without mutating caller-owned graph objects.
- [ ] `presenters/scoreSections` converts raw metrics into stable score-section view models: win tuning, cohesion, self-sufficiency, Game Changers, engine/combo indicators, roles, ranks, and signal bars.
- [ ] `presenters/graphControls` maps layout/gravity control state to renderer commands without DOM access.
- [ ] `services/recommendations` adapts worker messages into pending/progress/ready/error states and ignores stale worker responses by request key.

Unit-test constraints:
- Prefer Node/Vitest unit tests for pure functions and injected fakes.
- Do not test Vue internals or canvas pixels in adapter tests; assert view-model contracts and commands.
- Keep one behavior per test name.

## Browser/component smoke strategy

When Vue/Vite test tooling is integrated by lane 1:

- [ ] Mount/app smoke: generated site renders app shell, graph canvas, score sidebar, import controls, deck tabs container, compare button, help trigger, and recommendations drawer trigger.
- [ ] Interaction smoke: load default graph -> import a small deck fixture -> two tabs appear -> compare modal opens -> recommendations drawer opens and reaches ready/empty state.
- [ ] Canvas lifecycle smoke: graph component creates renderer on mount, handles resize/freeze/reset/layout commands, and stops animation/listeners on unmount.
- [ ] Static artifact smoke: build output contains app assets, bootstrap payload/config, and GitHub Pages markers/base path.

Suggested future tooling (requires lane-1 package/build integration):
- Vitest + Vue Test Utils for pure/view-model/component tests.
- Playwright or equivalent for one browser-level static-site smoke against the built artifact.
- `vue-tsc --noEmit` included in `npm run check`.

## Runtime behavior parity matrix

- [ ] Default sample deck and metrics render.
- [ ] Canvas drag, pan, zoom, resize, freeze, reset, re-layout, hide-isolated, and gravity modes work.
- [ ] Sidebar preserves win tuning, cohesion, self-sufficiency, Game Changers, engine/combos, signal bars, roles, and ranks.
- [ ] Deck tabs support add/switch/remove and preserve active deck selection.
- [ ] Compare modal opens only when useful and shows multi-deck rows.
- [ ] Help overlay opens/closes and remains keyboard accessible.
- [ ] Card detail/tooltip surfaces preserve current graph selection behavior.
- [ ] File import and drag/drop import work with parse/build failures surfaced to users.
- [ ] Browser Scryfall resolution remains available for imported decklists.
- [ ] Moxfield import works via direct/proxy source fallback and degrades with a clear no-proxy message.
- [ ] Recommendation drawer uses off-main-thread scoring or an equivalent non-blocking adapter.

## Lane-integration blockers to report upward

- Package scripts currently do not include `test/web/build-web-static-site.test.js`; lane 1 should decide whether to add it to `npm test`, a new `npm run test:web`, or the migrated Vitest suite.
- More pure adapter/view-model tests are blocked until implementation lanes extract the remaining `src/web` modules and lane 1 wires an official TS/Vitest runner.
- Browser e2e smoke is blocked until Vite/static serving and browser-test dependencies are intentionally added.
