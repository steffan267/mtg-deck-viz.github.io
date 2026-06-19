# EDHREC combo iteration plan

This pass targets the highest-impact missed/generic-edge combo shapes from the local EDHREC evaluation. Card names below are examples for human evidence only; implementation must remain generalized by text-derived capabilities, events, costs, repeatability, and resource deltas.

## Baseline before this iteration

- Detailed combos evaluated: 120
- Proven by bounded proof/package logic: 13/120 (10.8%)
- Unresolved records: 107
  - missed: 57
  - generic-edge-only: 46
  - bounded-out: 4
- Largest unresolved expected classes: infinite mana (38), ETB (35), cast/storm (32), tokens (30), draw (26), death/sacrifice (16 each).

## Selection criteria

1. Generalized mechanic appears across more than one EDHREC record or covers very high deck-count misses.
2. Existing model already has nearby facts/events, so implementation can remain incremental.
3. False-positive risk can be bounded with mechanical gates such as mana positivity, reciprocal triggers, repeatability, target scope, or zone/fuel accounting.
4. Every implemented family gets regression tests and is added to the hardening/validation surface.

## Ranked implementation opportunities

### 1. Bounce/cast-reset mana loops

Mechanic: a cast trigger returns a mana-positive nonland permanent to hand; replaying that permanent triggers the bounce engine again, producing mana/storm/cast loops.

Current gap: `bounce` and `cast` events exist, but there is no combo-critical family for cast-trigger bounce plus replayable mana source. This is the highest deck-count gap.

Representative evidence examples: Hullbreaker/Tidespout-style spell-bounce engines with cheap mana rocks.

Risks/gates:
- Require a cast-trigger bounce source, not generic bounce.
- Require a nonland permanent that taps for more mana than its mana value or cost proxy.
- Treat as a loop candidate with assumptions about recasting/payment, not as universal proof for any bounce spell.

### 2. Reciprocal draw/damage/mill/life feedback loops

Mechanic: one permanent converts event A to event B and another converts event B back to A, e.g. draw -> damage/life loss -> draw, or mill -> life loss -> mill.

Current gap: existing life-loop proof handles only lifegain/lifeloss reciprocity. Draw/damage and mill/lifeloss are currently generic edges or misses.

Risks/gates:
- Subject direction matters: opponent-draw payoffs are not the same as your draw engines.
- Distinguish true reciprocal loops from large finite kill packages; finite kill packages can be documented as outliers if not safely provable.

### 3. Recursive sacrifice/body-to-mana-or-token loops

Mechanic: a replenishable/recursive body plus a sacrifice outlet creates enough mana/token value to pay for or recreate the body, generating death/ETB/sacrifice/cast events.

Current gap: current aristocrats proof only treats creature-token-producing bodies as replenished. Recursive graveyard bodies and mana-refund loops remain generic-edge-only.

Risks/gates:
- Require explicit recursive body or replacement/reanimation source.
- Require a sac outlet that produces mana or a death payoff that produces recast resources.
- Do not treat arbitrary bodies as replenishable.

### 4. Top-of-library artifact recast variants

Mechanic: self-top draw artifact plus top-of-library artifact/colorless cast permission plus a scoped cost reducer or alternate payment/payoff.

Current gap: this family exists but misses several variants because cast-from-top and reducer detection are too narrow.

Risks/gates:
- Keep restricted to self-top artifact + cast-from-top permission + applicable cost/payment reduction.
- Do not infer top-cast loops from top-look-only effects.

### 5. Blink/copy ETB reset loops

Mechanic: two ETB blink/copy pieces reset each other and repeat ETB/LTB/token events.

Current gap: generic `etb→blink` exists, but mutual blink-reset is not promoted.

Risks/gates:
- One-shot blink is only repeatable if the loop returns the blinking permanent.
- Target restrictions matter (non-Angel, another permanent, nonlegendary copy).

### 6. Mana-threshold untap engines

Mechanic: a permanent with untap/draw/life modes plus a creature/permanent mana source that exceeds activation thresholds.

Current gap: one-card self-untap and ability-copy loops exist, but two-card threshold engines do not.

Risks/gates:
- Require explicit mana-produced threshold or conservative variable-mana marker.
- Avoid proving break-even engines as positive loops.

### Deferred/high-complexity outliers

- Graveyard escape/wheel loops need graveyard fuel accounting.
- Landfall self-replacement loops need land-token ETB and additional-land/drop accounting.
- Extra-combat treasure loops need combat damage amount assumptions.
- Lock/win-condition finite packages need non-loop game-state predicates.

## Proposed pass scope

Implement the safest high-yield subset first:
1. top-of-library artifact recast variants,
2. reciprocal draw/damage and mill/life feedback,
3. conservative recursive sacrifice loops,
4. conservative bounce/cast-reset mana loops,
5. mutual blink ETB reset where target restrictions are explicit enough.

Then rerun EDHREC evaluation, quantify the gain, and refresh outlier docs with unresolved/deferred categories.

## G002 reviewed implementation decision

Plan review rejected the initial five-family implementation as too broad for one precision-sensitive pass. This iteration will implement a narrower reviewed scope:

1. **Top-of-library artifact recast variants** — approved because the family already exists and needs capability broadening, not new speculative proof semantics.
2. **Draw ↔ damage reciprocal feedback loops** — approved as the first reciprocal feedback family with strict subject/direction gates.
3. **Recursive body + sacrifice outlet mana loop** — approved only in conservative form: explicit recursive/recastable body, explicit sacrifice outlet producing mana, and positive/basic cost accounting. Arbitrary bodies remain negative.

Explicitly deferred from implementation in this pass:

- Bounce/cast-reset mana loops: highest deck-count opportunity, but needs more target/recast/payment modeling before proof.
- Mill/lifeloss feedback: plausible but subject and finite-vs-loop semantics differ from draw/damage, so it should be separate.
- Mutual blink reset loops: useful but target legality/subtype restrictions require a focused pass.
- Landfall self-replacement, graveyard escape/wheel loops, extra-combat treasure loops, mana-threshold untap engines, and finite lock/win packages remain outliers.

Required implementation gates:

- no card-name branches in classifier/proof/model logic;
- family metadata in `src/combo-family-library.js`;
- capability extraction in `src/interaction-model.js` only where generalized text facts are clear;
- proof helpers in `src/interaction-proof-search.js` with explicit positive and negative paths;
- proof package seeding in `src/interaction-proof-packages.js` and indexes/hypergraph only when needed;
- validation corpus and direct unit tests for every new family/capability;
- refreshed EDHREC evaluation and outlier docs.

## G005 rerun outcome

After implementing the narrowed G002 scope and refreshing regression coverage, the offline EDHREC corpus rerun produced:

- Detailed combos evaluated: 120
- Local resolution: 120/120 (unchanged, all local)
- Proven by bounded proof/package logic: 21/120 (17.5%), up from 13/120 (10.8%)
- Combo-family detection: 17.5%, up from 10.8%
- Expected result-class coverage (all signals): 21/111 (18.9%), up from 13/111 (11.7%)
- Proof-only expected result-class coverage: 21/111 (18.9%); current signal coverage does not include unproven capability-only combo credit.
- Remaining buckets: 54 missed, 41 generic-edge-only, 4 bounded-out

Covered by this pass without card-name branches:

1. Top-of-library artifact recast variants, including artifact-plus-colorless top-cast wording and historic/choice artifact reducers.
2. Draw↔damage feedback loops, including aura-style damage-to-draw trigger segmentation and subject gates so opponent-draw punishers do not loop with your-draw effects.
3. Recursive creature body + mana sacrifice outlet loops, gated by package-local mana that covers total, colored, and colorless recursion costs.
4. Layered recursive body + colorless sacrifice outlet + death-mana payoff loops, where the death trigger supplies the colored/any mana required by recursion.

Tracked outliers were refreshed in `analysis/edhrec-combos/EDGE_CASES.md`. Remaining high-yield unresolved clusters are bounce/cast-reset loops, landfall token/mana loops, graveyard escape/fuel loops, mill/lifeloss reciprocal loops, token/sacrifice treasure engines, life-payment damage loops, mutual blink loops, big-mana threshold untap engines, and extra-combat treasure/equipment engines.

## G007 review-blocker resolution

The final review identified two precision blockers, now fixed and regression-tested without card-name branches:

1. Draw↔damage proofs now require the draw-trigger damage piece to react to **your** draws or **each player** drawing. Opponent-only draw punishers are recorded as non-repeatable near-misses.
2. Recursive sacrifice proofs now use package-local mana profiles instead of scalar mana. Colored and colorless recursion requirements must be paid by the sacrifice outlet or an explicit death-mana payoff in the same package; external mana bases are no longer assumed.
3. Raw-card and face-aware classification paths now pass `mana_cost` through to the shared classifier, so cast-from-graveyard recursive bodies preserve colored mana requirements in graph/proof-package flows as well as direct classifier tests.

## G008 generalized mechanic expansion outcome

This pass implemented the next reviewed high-safety subset from the outlier list, still with no card-name branches in classifier or proof logic:

1. **Colorless-mana amplifier + self-untapper** — `self-untap-mana-loop` now supports a static colorless amplifier when the tapped permanent produces colorless mana and the package has a positive mana delta.
2. **Mill ↔ life-loss feedback** — reciprocal mill/graveyard-drain and life-loss-to-mill triggers are proven only when both directions are present.
3. **Opponent mass-draw punisher threshold win** — finite, non-loop win proof for large opponent-draw effects plus opponent draw punishers; small opponent draws remain negative.
4. **Mill multiplier finite mill** — half-library mill plus a mill replacement/multiplier is treated as a finite threshold mill package; small fixed-count mill remains negative.
5. **Mutual ETB blink reset** — two ETB blink permanents prove repeated ETB/LTB only when each target scope can legally reset the other.
6. **Token replacement + sacrifice/death-mana loop** — creature-token replacement on a local creature-sacrifice outlet plus a death-mana payoff proves death/sacrifice/token repetition when package-local death mana pays the outlet activation.

Rerun result from `analysis/edhrec-combos/edhrec-combo-evaluation.md`:

- Detailed combos evaluated: 120
- Local resolution: 120/120
- Proven by bounded proof/package logic: 29/120 (24.2%), up from 21/120 (17.5%)
- Combo-family detection: 24.2%, up from 17.5%
- Expected result-class coverage (all signals): 27/111 (24.3%), up from 21/111 (18.9%)
- Proof-only expected result-class coverage: 27/111 (24.3%)
- Remaining buckets: 49 missed, 38 generic-edge-only, 4 bounded-out

Regression coverage added in:

- `test/interaction-model.test.js`
- `test/interaction-proof-search.test.js`
- `test/interaction-proof-packages.test.js`
- `test/combo-family-library.test.js`
- `test/edhrec-combo-evaluator.test.js`
- `analysis/interaction-validation/corpus.json`

Still deferred/outlier categories are unchanged in spirit but more sharply scoped: bounce/cast-reset, landfall self-replacement, graveyard escape/fuel, Food/Clue/Treasure subtype loops, life-payment loops, stack-copy/buyback loops, threshold untap engines, extra-combat engines, and body-fodder reanimation loops.
