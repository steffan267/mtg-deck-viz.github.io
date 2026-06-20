# Unfinished EDHREC combo/interaction systems plan — 2026-06-20

This plan drives the new ultragoal run for resolving the remaining EDHREC combo/interaction blockers.

## Non-negotiable safety contract

- Runtime and evaluator logic must not hard-code card names to infer interactions or combos.
- Classifiers must derive interactions from card text, types, costs, capabilities, zones, and local card facts.
- Pairwise graph links, evaluator result-overlap detection, strict proof packages, and human-review/unresolved metrics remain separate evidence layers.
- Generic edges must not become combo result classes unless the semantics support repeatability, resource/payment accounting, target legality, and the claimed result axis.
- Every generalized change needs positive and negative regression tests.
- Unsafe or underspecified systems are recorded as residual human-review cases instead of being counted as covered.

## Subsystem implementation order

1. Fresh full-corpus baseline and blocker partition.
2. Shared semantic abstractions for resource/state proofs.
3. Stack/spell recursion plus cast/copy/recast and escape/graveyard fuel accounting.
4. Landfall, land-play, land-token, bounce/replay, and land-resource loops.
5. Variable board-count mana, tribal/creature-count thresholds, cost reduction, and scalable resources.
6. Lock/turn structure, extra turns, combat sequencing, damage distribution, replacement/prevention, and connect triggers.
7. Copy/tutor/search outcomes and larger four-plus-card artifact recursion proof packages.
8. Missing-card-data, proved-result-axis mismatches, and generic-edge-no-result-class handling.
9. Repeated full EDHREC evaluation, steering for newly discovered blockers, docs/test consolidation, and residual blocker reports.
10. Final cleaner, review, verification, commit, push, and CI/deploy gate.

## Stop condition

The run is complete only when all safe generalized subsystem work has been implemented and verified, remaining unsafe cases are explicitly documented, and the final quality gate is clean.

## Steering update after G013 split

The original lock/turn/combat umbrella story was too broad to audit as one safe implementation unit. It is now split into explicit stories while preserving the non-negotiable safety contract:

1. `G013`: strict combat-resource extra-combat and artifact-token extra-turn proof slice.
2. `G014`: Breath-of-Fury-style combat-damage aura reattachment, sacrifice/reset, and fresh carrier continuity.
3. `G015`: fresh-token attack-trigger extra-combat and extra-turn loops.
4. `G016`: counter-threshold/proliferate extra-turn loops.
5. `G017`: lock/prevention turn-structure systems.
6. `G019`: final reconciliation of the split G007 replacement set before broader residual/data/final-gate work.

This steering avoids claiming coverage from generic combat edges. Each replacement story must independently add generalized predicates, strict proof/result-axis mapping, positive and negative regressions, full evaluator evidence, and no-card-name-hardcoding validation.

## G014 implementation plan — combat-sacrifice Aura extra-combat loops

`G014` adds one narrow, strict-proof-only family:
`combat-sacrifice-aura→extra-combat-loop`.

### Scope

- In scope: Aura text where an enchanted/attached creature dealing combat
  damage to a player/opponent sacrifices that carrier, reattaches the Aura to
  another creature you control, untaps/resets creatures, and creates an
  additional combat phase.
- In scope: package-local fresh carrier continuity from deterministic
  beginning-of-combat creature-token sources that produce a hasty next carrier
  each combat. This story intentionally uses a single timing bucket:
  beginning-of-combat hasty-token sources only. Attack-trigger,
  tapped-and-attacking, and other carrier engines are deferred to
  `G015`.
- Out of scope for this story: generic “there is another creature” board-state
  assumptions, raw attach/Voltron synergy, generic attack-trigger token loops,
  three-card haste support, replacement/doubler amplification, and any mana,
  damage, win, or token-surplus result axis not proven locally.

### Capability contract

- Aura-side capability:
  - `is-combat-sacrifice-extra-combat-aura`
  - `combat-sacrifice-aura-requires-connect`
  - `combat-sacrifice-aura-sacrifices-carrier`
  - `combat-sacrifice-aura-reattaches`
  - `combat-sacrifice-aura-untaps-creatures`
  - `combat-sacrifice-aura-adds-combat`
- Carrier-source capability:
  - `is-fresh-attack-carrier-source`
  - `fresh-carrier-token-attacks`
  - `fresh-carrier-token-has-haste`
  - `fresh-carrier-continuity`
  - `fresh-carrier-repeatable-each-combat`
  - `fresh-carrier-legal-next-reattach-target`
  - `fresh-carrier-timing:beginning-of-combat`
  - optional count cap `fresh-carrier-tokens-created:N`

### Strict proof contract

The proof must require all of:

1. the Aura is an Aura/Equipment-like attachment predicate on the carrier;
2. a combat-damage-to-player/opponent trigger;
3. sacrifice/death/reset of the enchanted carrier as part of the loop;
4. Aura reattachment to another creature you control;
5. creature untap/reset and an additional combat;
6. a package-local deterministic fresh carrier source for the next iteration;
7. an explicit combat-damage connection precondition.
8. the next carrier is legal at combat-damage trigger resolution:
   the beginning-of-combat source creates a creature token before combat damage,
   that token has haste, the Aura reattaches to another creature you control,
   and the token remains available as the next carrier when the additional
   combat starts.
9. an explicit established-loop precondition: the Aura is already attached to a
   legal current carrier at loop entry, and the fresh carrier source remains
   distinct from the sacrificed carrier.

Allowed proof result axes are conservative: `combat`,
`infinite-sacrifice`, `infinite-ltb`, `infinite-death`, and
`infinite-untap`. The story must not claim `infinite-mana`,
`infinite-damage`, `infinite-tokens`, or win-game coverage.

### Evaluator guardrail

`combat-sacrifice-aura→extra-combat-loop` must not be added to the raw
`EDGE_RESULT_CLASS_MAP` and must not be counted from generic capability-only
families. EDHREC coverage for this family comes from strict proof/package
evidence and proof-delta result mapping only.

### Regression matrix

- Positive: combat-sacrifice extra-combat Aura + deterministic fresh
  beginning-of-combat attacker source proves the family and maps only the
  allowed axes.
- Negative: Aura without reattach, Aura without untap/reset, once-per-turn Aura,
  wrong-timing token source, conditional/random token source, fresh carrier
  source without hasty token text, first-combat-only source,
  tapped-and-attacking source, and package missing a fresh carrier
  are rejected or unproved.
- Layer coverage: classifier capability tests, proof-search positive/negative
  proofs, proof-package seeding/surfacing tests, evaluator raw-edge negative
  tests, proof-delta result-axis leak tests, full EDHREC evaluator smoke, and
  no-card-name-hardcoding validation.
- No-hardcode: runtime logic remains text/capability based; no card names are
  used to infer this family.

### G014 completion evidence

Implemented the strict-proof-only `combat-sacrifice-aura→extra-combat-loop`
slice with the single intended carrier timing bucket:
deterministic beginning-of-combat hasty fresh carrier sources from an
established-loop state. Attack-trigger and tapped-and-attacking
token engines remain deferred to `G015`.

Runtime changes:

- `src/interaction-model.js` now extracts generalized Aura-side combat damage,
  sacrifice, reattach, untap, and additional-combat capabilities, plus
  beginning-of-combat hasty fresh-carrier capabilities.
- `src/interaction-proof-search.js` proves the loop only when the package has
  the Aura, a local fresh carrier source, combat-damage connection, carrier
  sacrifice, legal reattach target at trigger resolution, hasty next-carrier
  continuity, explicit established-loop/current-carrier preconditions,
  untap/reset, and additional combat facts.
- `src/interaction-proof-packages.js` seeds only Aura/fresh-carrier candidate
  pairs.
- `src/combo-family-library.js` declares the family result axes as only
  `combat`, `infinite-death`, `infinite-ltb`, `infinite-sacrifice`, and
  `infinite-untap`.
- The evaluator intentionally has no raw edge result-class mapping for this
  family; coverage is counted only through strict proof deltas.

Regression coverage:

- Positive and negative classifier tests in `test/interaction-model.test.js`.
- Positive and negative strict proof tests in
  `test/interaction-proof-search.test.js`.
- Proof-package seeding and package-surface tests in
  `test/interaction-proof-packages.test.js`.
- Family metadata/result-axis tests in `test/combo-family-library.test.js`.
- Evaluator raw-edge negative, proof-delta leak, positive proof-only, and
  stale-carrier negative tests in `test/edhrec-combo-evaluator.test.js`.

Fresh validation after G014:

```sh
node test/interaction-model.test.js
node test/interaction-proof-search.test.js
node test/combo-family-library.test.js
node test/interaction-proof-packages.test.js
node test/edhrec-combo-evaluator.test.js
node ./scripts/check-no-combo-name-hardcoding.js
npm run test:combo-detection
npm run typecheck:combo-detection
npm run check
npm test
npm run build
node ./analysis/edhrec-combos/evaluate-edhrec-combos.js
git diff --check
```

Full evaluator after G014 (`2026-06-20T15:10:57.299Z`):

- detailed combos evaluated: **54,710**;
- local card resolution: **54,367 / 54,710**;
- strict proved bucket: **1,090**;
- proof-status `proven`: **1,082**;
- combo-family detected: **65.4%**;
- expected result-class coverage: **31,666 / 54,161 (58.5%)**;
- proof-only expected coverage: **2,306 / 54,161 (4.3%)**.

The strict family proved three real EDHREC rows:
`Breath of Fury + Legion Warboss`, `Breath of Fury + Goblin Rabblemaster`, and
`Breath of Fury + Harried Dronesmith`. Broader conditional commander,
attack-trigger, non-hasty, copy-token, and haste-support shapes remain later
stories rather than being counted through unsafe raw graph signals.

## G015 implementation plan — fresh-copy extra-combat loops

`G015` generalizes fresh hasty copy loops for extra-combat attackers while
keeping them strict-proof-only and card-name-agnostic.

### Scope

- In scope: deterministic hasty creature-copy sources that create a fresh
  nonlegendary or legend-safe token before that token must attack or connect,
  paired with attack-trigger or combat-damage-to-player extra-combat attackers.
- In scope: three copy timing/attachment buckets:
  - beginning-of-combat/precombat copy engines that create hasty creature
    tokens before attackers are declared;
  - repeatable activated hasty-copy engines that can be used in the
    pre-attack window and whose tap cost is reset by the extra-combat loop;
  - attached self-copy Auras that can create a hasty copy of the enchanted
    creature before attacks and are reset by the extra-combat loop.
- Out of scope: tapped-and-attacking copy engines, random or conditional copy
  counts, first-combat-only engines, restricted next-combat attacker clauses,
  non-player combat-damage triggers, raw damage/win claims, and attacker
  extra-turn loops that cannot prove the same per-turn repeatability.

### Families

This story hardens the existing family and adds three narrow families:

- `combat-copy-token→extra-combat-loop`:
  precombat hasty creature copy + attack-trigger extra-combat attacker.
- `hasty-copy→attack-extra-combat-loop`:
  activated or attached hasty copy + attack-trigger extra-combat attacker.
- `combat-copy-token→connect-extra-combat-loop`:
  precombat hasty creature copy + combat-damage-to-player extra-combat
  attacker.
- `hasty-copy→connect-extra-combat-loop`:
  activated or attached hasty copy + combat-damage-to-player extra-combat
  attacker.

All four families are proof-only for result coverage. They are deliberately not
raw edge-result mappings in the evaluator.

### Capability and proof contract

The proof must derive all required facts from card text, type lines, costs,
and local capabilities rather than card names. Depending on the copy bucket,
the package must prove:

1. the copy target is legal for the engine;
2. the copy is a creature token with haste;
3. the token is nonlegendary or otherwise legend-safe for the loop;
4. the token exists before attack declaration for attack-trigger and connect
   loops;
5. the copied extra-combat attacker has an unused per-token attack or
   combat-damage trigger at loop entry;
6. the fresh token can be declared as an attacker, so tapped-and-attacking
   tokens do not satisfy the contract;
7. the extra-combat trigger adds another combat and resets the relevant copy
   source when the source or enchanted creature tapped to make the copy;
8. connect-trigger families record an explicit `combat-damage-connects`
   precondition and require player/opponent combat damage text;
9. next-combat restrictions, once-only triggers, optional payment dependencies,
   random outcomes, first-combat-only text, and “can't attack during extra
   turns” text reject or defer the package.

Allowed proof result axes are conservative: `combat`, `infinite-etb`, and
`infinite-tokens` from proof deltas only. The story does not claim
`infinite-damage`, `win`, or `infinite-turns`.

### Evaluator guardrail

The previous capability-only evaluator path for
`combat-copy-token→extra-combat-loop` was removed. The old and new fresh-copy
combat families are not present in `EDGE_RESULT_CLASS_MAP`; EDHREC coverage
comes only from strict proof/package evidence and proof-delta result classes.

### Regression matrix

- Positive: precombat copy + attack-trigger extra combat; activated hasty copy
  + attack-trigger extra combat; attached self-copy Aura + attack-trigger extra
  combat; precombat copy + connect-trigger extra combat; activated/attached
  copy + connect-trigger extra combat.
- Negative: legendary targets, tapped-and-attacking tokens, restricted
  next-combat attackers, non-player combat damage, first-combat-only copy
  engines, sorcery-speed active copy windows that miss the loop timing,
  extra-turn attackers with “can't attack during extra turns”, and optional
  sacrifice/fodder-dependent extra-turn shapes.
- Layer coverage: classifier capability tests, strict proof-search tests,
  proof-package seeding/surfacing tests, family metadata/result-axis tests,
  evaluator raw-edge negative and proof-delta leak tests, full EDHREC evaluator
  smoke, TypeScript combo-detection typecheck, and no-card-name-hardcoding
  validation.

### G015 completion evidence

Implemented the strict fresh-copy extra-combat slice without adding runtime or
evaluator card-name matching.

Runtime changes:

- `src/interaction-model.js` now extracts precombat hasty creature-copy,
  activated hasty-copy, attached self-copy Aura, attack-trigger extra-combat,
  connect-trigger extra-combat, and blocker/defer capabilities.
- `src/interaction-proof-search.js` now proves the four strict families only
  when target legality, token haste, legend safety, timing, unused per-token
  trigger state, attacker declaration, source reset, and connect preconditions
  are satisfied.
- `src/interaction-proof-packages.js` seeds fresh-copy/extra-combat packages
  without broad card-name or generic-edge matching.
- `src/combo-family-library.js` declares the old and new fresh-copy combat
  family contracts, required facts, disqualifiers, and conservative proof-delta
  result axes.
- `analysis/edhrec-combos/evaluate-edhrec-combos.js` no longer counts the old
  combat-copy family through capability-only detection; all fresh-copy combat
  coverage is proof/package-derived.

Fresh validation after G015:

```sh
node test/interaction-model.test.js
node test/interaction-proof-search.test.js
node test/combo-family-library.test.js
node test/interaction-proof-packages.test.js
node test/edhrec-combo-evaluator.test.js
node ./scripts/check-no-combo-name-hardcoding.js
npm run test:combo-detection
npm run typecheck:combo-detection
node ./analysis/edhrec-combos/evaluate-edhrec-combos.js
```

Full evaluator after G015 (`2026-06-20T16:03:32.690Z`):

- detailed combos evaluated: **54,710**;
- local card resolution: **54,367 / 54,710**;
- strict proved bucket: **1,096**;
- proof-status `proven`: **1,088**;
- combo-family detected: **65.4%**;
- expected result-class coverage: **31,672 / 54,161 (58.5%)**;
- proof-only expected coverage: **2,312 / 54,161 (4.3%)**.

The strict fresh-copy extra-combat families prove eleven real EDHREC rows:

- `combat-copy-token→extra-combat-loop`:
  `Aurelia, the Warleader + Helm of the Host`,
  `Godo, Bandit Warlord + Helm of the Host`, and
  `Combat Celebrant + Helm of the Host`;
- `hasty-copy→attack-extra-combat-loop`:
  `Combat Celebrant + Kiki-Jiki, Mirror Breaker`,
  `Combat Celebrant + Splinter Twin`, and
  `Feldon of the Third Path + Combat Celebrant + Determined Iteration`;
- `combat-copy-token→connect-extra-combat-loop`:
  `Port Razer + Helm of the Host`,
  `Rionya, Fire Dancer + Port Razer`, and
  `Rionya, Fire Dancer + Bloodthirster`;
- `hasty-copy→connect-extra-combat-loop`:
  `Kiki-Jiki, Mirror Breaker + Port Razer` and
  `Port Razer + Splinter Twin`.

Attacker extra-turn rows remain intentionally unresolved until a later story can
prove turn-cycle repeatability with the same strictness. Medomai-style “can't
attack during extra turns” and Wanderwine-style optional sacrifice/fodder
dependencies are classified as blockers/deferred cases instead of being counted
through unsafe graph signals.
