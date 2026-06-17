# Interaction rulesbuilder maintenance guide

This document is the maintenance contract for the MTG interaction/rulesbuilder
engine. The goal is sophisticated detection without turning the runtime into an
unbounded rules simulator.

## Architecture layers

1. **Classifier / semantic IR** — `interaction-model.js` parses card text into
   produce/consume events, capabilities, zones, types, evidence snippets, and a
   lazy non-enumerable `ir` wrapper. Existing graph output stays stable.
2. **Resource/event indexes** — `interaction-indexes.js` builds deterministic
   event, capability, modifier, resource, and win-condition indexes. Candidate
   APIs surface pairs/triples/closures without O(n³) scans.
3. **Hypergraph candidates** — `interaction-hypergraph.js` represents AND-shaped
   packages as proof-carrying hyperedges. Pair edges are UI summaries; the
   hyperedge remains the source of truth for three-card packages.
4. **Bounded proof search** — `interaction-proof-search.js` proves compact
   packages over abstract resources/events with hard card/depth/branch caps and
   explicit near-miss rejections.
5. **Family library** — `combo-family-library.js` is the declarative registry
   for supported combo archetypes, fixtures, disqualifiers, repeatability rules,
   and UI explanations.
6. **Product proof packages** — `interaction-proof-packages.js` converts proven
   packages into compact JSON-safe UI payloads.
7. **Audit/validation** — scripts under `scripts/` and `analysis/` lock baseline
   behavior, report validation metrics, and check performance/maintenance
   budgets.

## Ontology and facts

The ontology is intentionally typed and small:

- `event.produces` / `event.consumes`: observable game events such as `mana`,
  `draw`, `tokens`, `death`, `lifegain`, `lifeloss`, `cast`, and zone movement.
- `capability`: card-local predicates such as `is-repeatable-blink`,
  `etb-untaps-land:N`, `is-token-doubler`, `is-sac-outlet`,
  `is-empty-library-win-payoff`, or `is-self-top-draw-artifact`.
- `zone.reference`: explicit reads/writes to Hand, Graveyard, Exile, Library, or
  opponents.
- `modifier`: static/replacement effects such as token doublers, trigger
  doublers, and scoped cost reducers.
- `combo.loop`, `amplified.event`, `triggered.payoff`, and related hypergraph
  outputs describe derived package results, not raw card text.

Keep facts evidence-backed. If a new predicate cannot cite card text or a stable
derived reason, keep it out of runtime and put it into an audit report instead.

## Adding or changing a combo family

Use this checklist for every new family or meaningful behavior change:

- [ ] Add or refine classifier capability/event facts in `interaction-model.js`.
- [ ] Add indexed surfaces in `interaction-indexes.js` only if candidate search
      needs them.
- [ ] Add a hyperedge template in `interaction-hypergraph.js` for AND-shaped
      packages.
- [ ] Add or update bounded proof logic in `interaction-proof-search.js`; include
      a positive proof and at least one explainable negative/near-miss rejection.
- [ ] Add a declarative entry in `combo-family-library.js` with required facts,
      optional accelerants, disqualifiers, repeatability, payoff criteria,
      positive examples, negative fixtures, known false positives, and a stable
      UI explanation.
- [ ] Add validation cases in `analysis/interaction-validation/corpus.json` and
      regenerate the report with `npm run validate:interactions`.
- [ ] Add/adjust unit tests near the changed layer plus a product-level test if
      the UI payload changes.
- [ ] If proof package shape changes, update the schema source of truth in
      `interaction-proof-packages.js`, the browser payload adapter, web graph
      types, proof drawer, and hardening checks together.
- [ ] Run `npm run baseline:interaction:check`, `npm run validate:interactions:check`,
      `npm test`, `npm run check`, and `git diff --check`.

## Runtime vs audit-only boundaries

Runtime-safe code:

- `interaction-model.js`, `interaction-indexes.js`, `interaction-hypergraph.js`,
  `interaction-proof-search.js`, and `interaction-proof-packages.js`.
- CLI/static graph builders opt into `interactionProofs` for product payloads.
  Browser imports keep proof generation off the initial graph-build path and must
  not import the Node/CommonJS proof engine directly. The browser may only
  materialize packages from an already-present payload or an explicitly injected
  browser-safe builder.
- The proof package schema is versioned by
  `PROOF_PACKAGE_SCHEMA_VERSION`/`PROOF_PACKAGE_SCHEMA_FIELDS` in
  `interaction-proof-packages.js`. Treat that file as the schema source of truth;
  schema changes must move through the adapter/types/UI in one change.
- Runtime proof search must stay bounded to direct, two-card, and three-card
  packages. Do not add open-ended stack simulation, turn simulation, or global
  deck search to the browser path.

Audit-only code:

- `scripts/audit-interaction-baseline.js`
- `scripts/audit-interaction-index-performance.js`
- `scripts/report-interaction-validation.js`
- `scripts/check-interaction-hardening.js`
- `analysis/**` reports and corpora

Audit scripts may read large local corpora and produce reports; runtime code must
prefer compact derived facts and bounded candidate generation.

## Budgets and QA gates

Hardening budgets enforced by `scripts/check-interaction-hardening.js`:

- Validation recall must stay at or above `0.80`.
- Sampled precision must stay at or above `0.90`.
- Unexplained positive rate must stay at or below `0.15`.
- The deterministic validation report keeps measured runtime out of the artifact
  and declares a runtime budget of at most `250ms`.
- Product proof payloads are capped at `24` packages per deck and `50KB` for the
  representative payload fixture.
- Evidence snippets in runtime proof payloads are capped at `240` characters.
- Browser graph imports must keep proof generation explicitly opt-in so import
  latency does not grow silently as families expand, and web files must not
  directly import `interaction-proof-packages.js`.
- Proof payloads must carry the current schema version and all required schema
  fields.
- The only currently allowed missed validation combo is
  `known-gap-library-exile-win`.

Baseline/validation QA:

```bash
npm run baseline:interaction:check
npm run validate:interactions:check
npm run hardening:interactions
npm test
npm run check
git diff --check
```

Performance spot check:

```bash
npm run audit:interaction-index-performance
```

The latest local index audit covered 30,930 Commander candidates with bounded
candidate closures in sub-millisecond time after index construction.

## Behavior notes

- Three-card packages should not be represented as misleading pairwise combo
  cliques. Pair summaries may highlight participating cards, but the hyperedge
  and proof package are the source of truth.
- Token doublers often mention creating tokens but are modifiers first. Choose a
  separate token source when proving token-source/modifier/payoff packages.
- Ordinary bodies are not infinite aristocrat fodder. A sacrifice package is not
  repeatable unless the body is replenished by the package.
- One-shot blink plus ETB untap is a near miss, not a loop.
- Library-exile plus empty-library win is tracked as a known validation gap until
  the proof search can reason about library size thresholds.
- UI proof packages are explanatory. They should surface confidence,
  assumptions, limits, and sequence rather than claim full comprehensive MTG
  rules simulation.
