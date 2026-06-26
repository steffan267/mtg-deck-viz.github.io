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

## Evidence levels: graph, result overlap, strict proof

The EDHREC combo corpus is useful because it forces the engine to keep three
evidence levels separate:

1. **Graph interaction** — a real mechanical relationship between cards in a
   deck graph. This can be a weak synergy, a combo-critical pair, or one piece
   of a larger package. It is allowed in runtime UI when text-derived facts
   justify the edge.
2. **Evaluator result overlap** — the offline EDHREC evaluator maps known combo
   result labels and model families onto coarse result classes. This is a recall
   metric for corpus analysis, not a proof. The evaluator may say a known combo
   has a model signal for `infinite-etb` or `combat` while still reporting
   `proofStatus: no-proof`.
3. **Strict proof** — `interaction-proof-search.js` can explain repeatability,
   target legality, costs/resources, and positive deltas inside a bounded
   package. Only this level should be described as “proved”.

Do not collapse these levels. A high EDHREC result-overlap score is not license
to mark rows as proved, and a graph edge must not infer unrelated result axes.
When adding a family, decide explicitly which levels it supports:

- runtime graph family only;
- evaluator-only result bridge;
- bounded proof package;
- or a combination, with tests for each level.

## Combined combo-corpus and interaction-graph policy

EDHREC combo analysis and ordinary deck interaction detection now share the same
semantic facts, but they have different jobs:

- **The graph engine starts from local card text.** It should surface real
  mechanical relationships in arbitrary decks even when no known combo row is
  present. Its output is evidence for “these cards interact,” not evidence that
  the full package is repeatable or winning.
- **The combo evaluator starts from known EDHREC rows.** It may use graph-family
  evidence to measure recall against expected result axes, but those mappings are
  axis-specific. A sacrifice edge can explain sacrifice/death/LTB classes; it
  must not imply mana, cards, turns, or wins without a family/proof that produces
  those classes.
- **Strict proof is the promotion path.** A recurring pattern graduates from
  graph/evaluator signal to proof only after the proof layer can account for
  source assembly, target legality, repeatability, costs, throttles, resources,
  and result deltas/classes. Promotion must add positive and negative tests in
  the classifier, proof search, proof package, and EDHREC evaluator layers when
  applicable.
- **Blockers are product input, not hidden assumptions.** `no-current-signal`,
  `generic-edge-no-result-class`, `semantic-system-needed-classified`, and
  `proof-size-bound` rows should guide future semantic subsystem work. Do not
  reduce those buckets by assuming board state, extra cards, card names, or
  unmodeled resource loops.

This policy is the combined learning from the combo coverage work and the normal
interaction graph: share facts and indexes, but keep recall metrics, graph UI
signals, product proof packages, and strict proof claims separately validated.

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

## EDHREC-derived proof-family learnings

The current combo corpus work established these reusable constraints:

- **Target legality is part of the proof, not a UI detail.** Creature-copy loops
  must prove creature/nonlegendary scope, ETB blink must prove target scope, and
  face-aware cards must source all required facts from compatible faces.
- **Scopes matter for reciprocal triggers.** Draw/damage feedback only proves
  when the damage-to-draw text can apply to the draw-triggered damage source
  (`source-you-control`, enchanted/equipped creature, or paired-creature
  grants). A separate card that says only “this creature deals damage” is not a
  legal scope for another card's damage source.
- **Cost reducers are resources.** Self-untap mana loops may use generalized
  activated-ability cost reductions only when the reducer applies to the
  self-untapping permanent and the effective cost is below output, including
  minimum-cost clauses.
- **Proof-package seeds are product behavior.** If `provePackage()` learns a new
  family, `interaction-proof-packages.js` must seed the same bounded candidate
  shape so static/UI `interactionProofs` do not lag the proof engine.
- **Routing-slip search belongs in the understanding layer first.** The first
  bounded obligation-stack prototype resolves recursive-body sacrifice loops
  where a free creature-sacrifice outlet creates the death event, a death-mana
  payoff pays the recursive body cost, and the recursive body restores the
  starting state. This keeps generalized multi-step search behind the same
  package-local proof bridge before promoting broader graph behavior.
- **Speed is part of proof, but not proof by itself.** Mana acceleration,
  repeated casting, storm count, deck thinning/filtering, and tutoring all tune
  how quickly a deck reaches or sustains its plan. The proof layer may use those
  signals when they close a local loop, such as escape fuel supplied by repeated
  storm-mill casts. The evaluator must not give full result-class credit to
  partial pair edges unless a complete family or strict proof accounts for the
  missing mana, fuel, tutor, or card-flow roles.
- **Fresh-token combat/turn loops need freshness and axis guards.** Hasty
  copy-token loops are only a proof when the token is created before attacker
  declaration, survives copy/legend restrictions on the same compatible face,
  has an unused fresh-token attack or connect trigger, and the copy source
  resets for the next iteration.
- Extra-combat variants may project only `combat`, `infinite-etb`, and
  `infinite-tokens`.
- Extra-turn variants may project only `infinite-turns`; they reject
  cannot-attack-extra-turns, optional payment/fodder, tapped-and-attacking,
  random, first-combat-only, non-player-damage, and legend-unsafe cases.
- **Counter-threshold extra-turn loops need explicit seeded states.** Charge-
  or counter-threshold turn engines are only proof-safe when the package names
  the threshold, states the established seed/threshold counters at loop entry,
  and uses package-local zero-mana doubler or proliferate support. Threshold-
  only loops stay `infinite-turns` only; they must not leak `infinite-counters`
  unless a separate proof establishes real positive counter growth.
- **Optional self-copy spells can be proof-safe when the payoff is specific.**
  A targeted spell that lets the target copy it is not a win by itself; it
  becomes a proved drain loop only with a payoff that triggers on copying
  instant/sorcery spells and has a drain/lifegain result.
- **Creature-lock proofs need source assembly and throttling guards.** A
  death-untapping deathtouch pinger is proof-safe only when the free tap-only
  ping, death-trigger untap, and deathtouch apply to the same assembled creature
  source. `{T}` is not a mana cost for this purpose, but any real mana/payment
  cost or once-per-turn death-untap throttle makes the package audit-only unless
  a future proof also proves the missing resource/timing loop.
- **Hidden board state remains audit-only.** Variable creature counts, external
  tribal support, graveyard fuel, land drops, stack recursion, and combat damage
  distribution must not be assumed from EDHREC rows unless the listed cards or a
  future state model prove them.

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
- [ ] Add candidate seeds in `interaction-proof-packages.js` for every proof
      family that should be visible in product `interactionProofs`; prove/search
      support alone is not enough.
- [ ] If the family is used by the EDHREC evaluator, update
      `analysis/edhrec-combos/evaluate-edhrec-combos.js` while preserving the
      separation between proof-only classes and broader result-overlap signals.
- [ ] Add validation cases in `analysis/interaction-validation/corpus.json` and
      regenerate the report with `npm run validate:interactions`.
- [ ] Add/adjust unit tests near the changed layer plus a product-level test if
      the UI payload changes.
- [ ] Add corpus/evaluator tests for positive and negative EDHREC-style fixtures
      when a family affects combo coverage.
- [ ] If proof package shape changes, update the schema source of truth in
      `interaction-proof-packages.js`, the browser payload adapter, web graph
      types, proof drawer, and hardening checks together.
- [ ] Run `npm run baseline:interaction:check`, `npm run validate:interactions:check`,
      `npm test`, `npm run check`, and `git diff --check`.

## Runtime vs audit-only boundaries

Runtime-safe code:

- `card-faces.js` and `face-classification.js` normalize physical-card faces,
  preserve per-face provenance, and reject mutually exclusive same-card facts
  when a proof needs them at the same time.
- `interaction-model.js`, `interaction-indexes.js`, `interaction-hypergraph.js`,
  `interaction-proof-search.js`, and `interaction-proof-packages.js` consume
  those face-aware facts through bounded capability/event indexes and proof
  gates.
- CLI/static graph builders opt into `interactionProofs` for product payloads.
  Browser imports keep proof generation off the initial graph-build path and must
  not import the Node/CommonJS proof engine directly. The browser may only
  materialize packages from an already-present payload or an explicitly injected
  browser-safe builder.
- Copy-target, ETB-blink target, and recursive precondition legality gates must
  use face-compatible capability facts when a card has mutually exclusive faces.
  The runtime policy lives in `interaction-model.js` as `faceCompatibleCaps()`,
  `canEtbBlinkTarget()`, and `recursiveBodyPreconditionSatisfiedByPair()`;
  proof/evaluator layers should call those helpers rather than reimplementing
  aggregate type checks. Aggregate type/text is display and backward-compatibility
  data, not sufficient proof evidence by itself.
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

Current EDHREC audit reports live under `analysis/edhrec-combos/`:

- `100_PERCENT_COVERAGE_AUDIT.md` records why result-overlap detection cannot be
  honestly forced to 100% without misleading taxonomy.
- `STRICT_PROOF_COVERAGE_AUDIT.md` records the current strict-proof ceiling and
  the semantic systems needed before proof coverage can materially approach
  100%.
- `FANOUT_REVIEW.md` records the G005 parallel review findings and the resolved
  product-path/safety gaps.
- `G008_STRICT_PROOF_BLOCKERS.md` records the latest strict-proof blocker
  partition after the death-untap deathtouch pinger-lock addition.

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
- There are no currently allowed missed validation combos; new known misses must
  be documented as edge cases and either fixed or explicitly added to the
  hardening allow-list with a removal plan.

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
- Library-exile plus empty-library win is a finite win package, not a loop; keep
  it proof-backed with explicit threshold assumptions.
- Target-restricted copy loops must prove the copied permanent is legal
  (creature, nonlegendary, or other encoded scope) before becoming
  combo-critical.
- Recursive-body loops must prove local recursion preconditions such as
  "another creature" rather than assuming external board state.
- UI proof packages are explanatory. They should surface confidence,
  assumptions, limits, and sequence rather than claim full comprehensive MTG
  rules simulation.
