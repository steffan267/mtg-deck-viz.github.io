# Generalized graph/state-solver plan for combo detection — 2026-06-22

This document records the intended architectural path for moving combo detection
from a primarily family-authored proof system toward a more generalized,
solver-first system.

It is written as a handoff artifact for a future `$ultragoal` run.

## Why this plan exists

The current combo engine already has strong generalized foundations:

- text-derived semantic facts in `src/interaction-model.js`;
- deterministic indexes in `src/interaction-indexes.js`;
- AND-shaped package modeling in `src/interaction-hypergraph.js`;
- bounded legality/repeatability proof infrastructure in
  `src/interaction-proof-search.js`.

However, strict combo detection is still primarily promoted by curated,
family-specific proof functions and declarative family entries. This is better
than card-name hardcoding, but it still keeps combo recognition largely
family-first rather than solver-first.

The target direction is:

> classifier/index/hypergraph facts feed a generic typed state/resource solver;
> curated families become mostly labels, reporting contracts, and conservative
> proof/result-class envelopes instead of the main detection mechanism.

## Non-negotiable safety contract

- Runtime and evaluator logic must never hard-code card names to infer combos or
  interactions.
- Graph interaction, evaluator result-overlap, and strict proof remain separate
  evidence levels.
- Generic graph edges must not be promoted to combo result classes unless the
  system proves repeatability, legality, payment/resource closure, and claimed
  positive deltas.
- Solver work must stay bounded and deterministic in runtime paths.
- Browser/runtime paths must not regress into unbounded deck-wide simulation.
- Every semantic broadening must add positive and negative regression tests.
- If a shape cannot yet be modeled honestly, it stays unresolved/human-review
  rather than being counted as covered.

## Architectural thesis

A plain pairwise card graph is not sufficient.

The generalized target is a **typed state/resource hypergraph solver** with:

1. **Card-local semantic facts**
   - events produced/consumed;
   - capabilities;
   - modifiers;
   - zone access;
   - targeting/face constraints;
   - activation/cast/payment facts.

2. **Composable transitions**
   - each relevant card action becomes a bounded abstract transition;
   - transitions consume and produce typed resources/events/state predicates.

3. **Package-local state model**
   - mana profiles;
   - cards cast / returned / recurred;
   - tap/untap state;
   - ETB/LTB/death/cast counts;
   - token counts and token types;
   - counter thresholds and seeded counters;
   - turn/combat freshness when needed;
   - legality predicates (target scope, same-face compatibility, legend safety,
     timing bucket).

4. **Generic cycle/closure search**
   - search for a package-local cycle that returns to an equivalent abstract
     state with at least one positive or sustaining delta;
   - prove no illegal hidden assumptions were used.

5. **Family labeling as a downstream layer**
   - once a cycle is found, label it with one or more stable family/result
     contracts for UI/reporting/regression purposes.

## Primary objective

Shift the center of gravity of combo detection from:

- `proveX(cards)` family dispatch

toward:

- generic transition assembly,
- generic cycle search,
- generic resource/state closure proof,
- then family/result labeling.

## Explicit non-goals

- Not a full MTG rules engine.
- Not open-ended stack simulation.
- Not unrestricted whole-deck search in browser/runtime paths.
- Not replacing all family contracts immediately.
- Not loosening proof semantics just to raise EDHREC coverage metrics.

## Current architecture assessment

### Already generalized enough to reuse

These are existing strengths and should become solver inputs, not be replaced:

1. `src/interaction-model.js`
   - semantic event/capability extraction;
   - subject-aware interactions;
   - face-aware legality helpers.

2. `src/interaction-indexes.js`
   - deterministic candidate/index surfaces.

3. `src/interaction-hypergraph.js`
   - correct representation of AND-shaped multi-card packages.

4. `src/semantic-proof-utils.js`
   - mana/cost/resource helper substrate.

5. `src/interaction-proof-search.js`
   - bounded proof/result packaging discipline;
   - legality and rejection expectations.

### Still family-first / hand-authored

These are the main architectural pressure points:

1. `src/interaction-proof-search.js`
   - strict proof currently dispatches across many explicit `proveX(...)`
     functions.

2. `src/interaction-hypergraph.js`
   - several multi-card package builders are still archetype-shaped.

3. `src/combo-family-library.js`
   - family definitions are useful, but currently function as an upstream design
     driver rather than a downstream labeling/reporting contract.

4. `src/combo-detection/strategies.ts`
   - useful as an experiment harness, but currently too shallow/simple to be the
     main solver.

## Implementation strategy

The migration should be incremental and evaluator-gated.

### Phase 0 — Freeze terminology and proof boundaries

Goal: agree on the abstraction contract before more family work expands the
surface area.

Deliverables:

- document the canonical abstract state vocabulary;
- document transition types and resource/state dimensions;
- define what counts as:
  - sustaining loop,
  - positive loop,
  - threshold loop,
  - lock,
  - finite finisher package,
  - unresolved dependency on hidden board state.

Validation gate:

- written design note aligned with `src/INTERACTION_ENGINE.md` and current proof
  terminology.

### Phase 1 — Introduce a first-class transition IR

Goal: represent cards as bounded abstract transitions, not only facts and
families.

Deliverables:

- a typed transition schema for:
  - activated abilities,
  - cast/recast actions,
  - ETB/LTB/death trigger conversions,
  - token-production/replacement conversions,
  - extra-combat/extra-turn/reset actions,
  - counter-threshold actions,
  - bounce/blink/replay/reset actions;
- transition provenance back to source card text/faces;
- explicit legality predicates attached to transitions.

Validation gate:

- transition extraction tests for representative existing proved families;
- no regression in current interaction graph output.

### Phase 2 — Build a generic bounded state model

Goal: define the minimum abstract state needed for deterministic loop proofs.

Minimum state dimensions:

- mana profile by color/any/colorless;
- cast count / spell-count trigger budget;
- ETB/LTB/death/sacrifice counts;
- token counts by relevant subtype/class;
- tap/untap availability;
- counter counts / threshold seed states;
- zone-local replay availability (graveyard/exile/top/hand/battlefield);
- combat/turn freshness flags only where required;
- legality/attachment constraints;
- same-card/face compatibility constraints.

Validation gate:

- state-model docs and unit tests for state normalization/equivalence;
- explicit proof that existing families can be projected into this state model
  without loss of needed legality information.

### Phase 3 — Implement generic cycle search

Goal: detect repeatable package-local closure without family-specific proof code
being the primary driver.

Approach:

- start with bounded package sizes already accepted by runtime (`<= 3` cards);
- construct package-local transition graphs/hypergraphs;
- search for closed walks/cycles returning to an equivalent abstract state;
- require one of:
  - positive net delta,
  - threshold-preserving repeatability,
  - lock-state preservation against opponents.

Search constraints:

- keep branch/depth caps;
- deterministic ordering;
- package-local resources only unless an explicit seed/precondition is recorded;
- explicit rejection reasons when closure fails.

Validation gate:

- generic solver reproduces a selected baseline set of existing proved families
  without calling their bespoke `proveX(...)` logic for the success path.

### Phase 4 — Migrate easiest families to solver-first proofs

Goal: replace low-ambiguity family proof code first.

Priority migration order:

1. self-untap mana loops;
2. blink + ETB untap loops;
3. reciprocal trigger feedback loops
   - lifegain/lifeloss
   - draw/damage;
4. recursive body + mana sacrifice loops;
5. token replacement / sacrifice / mana loops;
6. simple threshold extra-turn loops.

Why this order:

- strongest existing abstractions;
- relatively small state surfaces;
- clear regression fixtures already exist;
- lower dependence on hidden combat/timing state.

Validation gate:

- for each migrated family:
  - solver-first proof succeeds;
  - family label/result classes still match expected contracts;
  - negative fixtures still reject;
  - evaluator coverage does not regress.

### Phase 5 — Reclassify family library as a downstream contract

Goal: make `combo-family-library.js` describe and constrain outputs rather than
serve as the main discovery mechanism.

Deliverables:

- each family becomes a reporting contract with:
  - accepted proof signatures,
  - allowed result classes,
  - disqualifier expectations,
  - UI explanation,
  - regression fixtures;
- family assignment happens after solver proof shape is known.

Validation gate:

- family metadata still powers evaluator/result mapping and UI explanations;
- discovery no longer depends on role-matching alone for migrated families.

### Phase 6 — Expand solver coverage to hard subsystems

Goal: only after the core solver works on easier loops, extend into harder state
systems.

Hard subsystem order:

1. cast/bounce/replay mana loops;
2. graveyard fuel / escape / recast loops;
3. landfall / self-bounce / land-token loops;
4. copy/buyback/stack-object loops;
5. extra-combat / extra-turn timing loops;
6. lock systems;
7. four-plus-card audit-only solver experiments.

Important rule:

- harder families should not be migrated until their needed state dimensions are
  explicit in the generic solver contract.

## Regression and benchmarking plan

Every phase must run against three evidence layers separately:

1. **Interaction graph layer**
   - direct mechanical links still appear/disappear only when justified.

2. **Strict proof layer**
   - proven/not-repeatable/no-proof semantics remain conservative.

3. **EDHREC evaluator layer**
   - result-overlap coverage may improve, but never by collapsing proof and
     graph evidence.

Required checks after each meaningful solver change:

- targeted unit tests for the changed subsystem;
- existing no-card-name-hardcoding checks;
- combo strategy/typecheck checks where applicable;
- interaction validation/baseline checks;
- full EDHREC evaluator rerun for milestone phases;
- benchmark comparison against current bounded proof runtime.

Benchmark metrics to track:

- proof runtime per package;
- full evaluator wall time;
- proof count;
- proof-only coverage;
- all-signal result coverage;
- false-positive regressions from negative fixtures;
- percentage of existing proved families reproduced by solver-first path.

## Definition of success

This path is successful when all of the following are true:

1. a generic solver proves a meaningful subset of current families without
   bespoke per-family proof code being the discovery mechanism;
2. migrated families retain or improve correctness on positive and negative
   fixtures;
3. family metadata becomes primarily descriptive/reporting-oriented;
4. EDHREC coverage improves without loosening evidence semantics;
5. runtime bounds and TypeScript/contracts remain clean;
6. unresolved hard cases are documented explicitly instead of patched with
   hidden assumptions.

## First ultragoal slice to run

Recommended first execution slice:

1. write the transition IR contract;
2. write the abstract state contract;
3. implement a bounded generic cycle solver prototype for:
   - self-untap mana loops,
   - blink + ETB untap loops,
   - reciprocal two-card trigger loops;
4. run parity tests against current bespoke proof functions for those families;
5. document gaps before expanding to more complex families.

## Stop / fallback conditions

Stop and document instead of forcing coverage when:

- a required state dimension is still implicit or ambiguous;
- the generic solver begins to rely on family-specific hidden assumptions;
- runtime bounds materially regress without acceptable pruning;
- a supposed generic migration still requires bespoke exceptions to stay safe.

In those cases, record the blocker as:

- missing semantic primitive,
- missing state dimension,
- unacceptable performance cost,
- or unresolved legality/timing ambiguity.

## Suggested ultragoal handoff wording

Use this as the next-task intent if helpful:

> Continue combo detection on the generalized graph/state-solver path described
> in `analysis/edhrec-combos/GENERALIZED_GRAPH_SOLVER_PLAN_2026-06-22.md`.
> Prioritize solver-first architecture over adding more family-specific proof
> functions. Preserve strict proof semantics, no card-name hardcoding,
> regression coverage, runtime bounds, and TypeScript/contracts.

## 2026-06-24 continuation directive

This continuation broadens the plan from combo resolution alone to the engine's
entire understanding layer. The transition IR and state/resource model should be
usable as a shared semantic substrate for:

- interaction graph explanations;
- strict combo proof and rejection evidence;
- EDHREC evaluator evidence mapping;
- UI/debug reporting of why cards interact;
- future non-combo understanding such as locks, finite packages, zone access,
  replacement effects, and unresolved/human-review explanations.

Implementation must therefore avoid building a narrow "combo-only" shortcut.
The first slice should introduce reusable contracts and runtime surfaces that
make the engine better at explaining card-local actions, package-local state,
resource flow, legality constraints, and why a package is proven, rejected, or
left unresolved.

## 2026-06-24 first-slice implementation notes

This run introduced a first shared understanding surface rather than a complete
solver migration. The new surface is intentionally exposed as package-level
understanding evidence so graph, proof, evaluator, and UI/debug layers can reuse
one vocabulary without collapsing their evidence semantics.

Implemented first slice:

- canonical domain constants for transition kinds, evidence kinds, solver
  outcomes, state dimensions, and legality predicates;
- TypeScript contracts for semantic transitions, package state, legality
  requirements, solver evidence, and package-understanding models;
- bounded package-local runtime extraction for:
  - self-untap mana loops;
  - repeatable blink plus ETB land untap loops;
  - lifegain/lifeloss reciprocal trigger loops;
  - draw/damage reciprocal trigger loops;
- strict proof-search integration that prefers proven generic understanding
  evidence for those migrated shapes while preserving existing bespoke proofs as
  compatibility/parity fallback;
- regressions that assert the new understanding model is emitted while existing
  strict proof behavior remains conservative.

Known gaps before expanding:

1. **State normalization is still shallow.** The first state model records the
   bounded package, dimensions, zones, and legality constraints, but it does not
   yet perform full equivalence-class normalization for tap/untap, cast count,
   graveyard/exile fuel, token subtype inventory, counter seed state, or
   turn/combat freshness.
2. **Transition extraction is capability-driven.** It reuses existing semantic
   caps rather than parsing every relevant action into first-class transitions.
   This is the correct first step, but later phases should move more capability
   families into explicit transition records with source face/snippet
   provenance.
3. **Legality predicates are evidence annotations, not a full legality engine.**
   The current solver records package-local, repeatability, target, payment, and
   face/scope requirements, but harder systems need explicit target sets,
   same-object constraints, attachment state, legend/face safety, and timing
   buckets.
4. **Solver-first coverage is deliberately narrow.** Only low-ambiguity loops are
   promoted from generic evidence today. Cast/bounce/replay, graveyard fuel,
   landfall, copy/buyback, extra-combat/turn timing, locks, and four-plus-card
   packages remain future work until their state dimensions are explicit.
5. **Family metadata is not fully downstream yet.** Migrated families now have a
   solver-first evidence path, but `combo-family-library.js` still functions as
   an important reporting and regression contract and should be reclassified
   incrementally rather than removed.
6. **Unresolved/human-review output is minimal.** The package model has an
   `unresolved` channel, but future work should populate it with structured
   blocker categories such as missing semantic primitive, missing state
   dimension, unacceptable performance cost, or unresolved legality/timing
   ambiguity.

Expansion rule: do not migrate a harder family unless the package-understanding
model can explain the resource/state closure, legality requirements, and
positive/sustaining deltas without family-specific hidden assumptions.
