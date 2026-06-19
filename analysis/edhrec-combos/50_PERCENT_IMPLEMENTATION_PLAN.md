# 50% combo-detection implementation synthesis

Generated during the 2026-06-19 Ultragoal run after parallel read-only analysis lanes over the largest unresolved clusters.

## Target and current state

- Target: at least **27,184/54,367** fully resolved EDHREC combos with generalized detection and expected result-class overlap.
- Baseline at start of this run: **1,771/54,367** resolved combos with result-overlap detection.
- Highest-volume gap: ETB/LTB/death/sacrifice event loops, approximately **34,857** unresolved combos.
- Second-largest gap: mana/cast/storm reset loops, approximately **27,249** unresolved combos.

## Parallel analysis findings

### ETB/LTB/death/sacrifice lane

The ETB/LTB/death/sacrifice lane identified the only plausible first lever large enough to approach 50%: a package-level event-cycle/result bridge over existing engine interaction edges. Existing engine primitives already detect body, sacrifice, death payoff, blink, reanimate, token, and ETB/LTB-related edges, but the evaluator previously ignored most of those edge families when deriving EDHREC result classes.

Recommended implementation shape:

1. Add result taxonomy for large unmapped EDHREC labels, especially `Infinite LTB`.
2. Add an edge-result bridge that lets existing generalized engine edge families explain result classes in the offline EDHREC combo evaluator.
3. Keep bounded proof counts separate so an edge signal is not reported as strict proof.
4. Preserve negative result gates: a sacrifice edge can explain death/sacrifice/LTB classes, but not unrelated mana; landfall edges can explain landfall/ETB/token axes, but not locks/turns; combat edges can explain combat only.

### Mana/cast/storm lane

The mana/cast/storm lane found that cast-trigger bounce/replay, buyback/copy, commander recast, and graveyard fuel loops require additional semantic systems. Safe cast-reset work is valuable, but likely yields hundreds to low-thousands of additional detections, not the +25k required by itself.

Recommended deferrals:

- Graveyard/escape/fuel loops need a graveyard resource model.
- Buyback/copy loops need explicit self-copy target legality and additional-cost repayment.
- Commander recast loops need command-zone/tax/restricted-mana semantics.
- These should remain future proof-family work rather than broad permissive rules.

## Chosen implementation slice

The first implementation slice is the **interaction edge result-class bridge**:

- It is generalized by existing engine interaction families, not card names.
- It directly addresses the documented edge cases: LTB, landfall, blink, scry/surveil/looting/rummaging, self-discard, proliferate, pump, locks/turns taxonomy, and large ETB/death/sacrifice axes.
- It intentionally does **not** change strict proof semantics. The evaluator reports strict proof, proof-only coverage, edge-signal coverage, and bucket counts separately.

## False-positive controls

- The bridge only maps an edge family to its own result axis; it does not let one interaction imply unrelated result classes.
- Bounded proof/package successes are still the only strict proofs.
- Edge-derived detections are visible as `classified-not-proven`/edge signals in the evaluator output.
- No runtime card-name matching is introduced.

## Expected lift

Pre-implementation simulation projected approximately **58%** resolved-combo result-overlap coverage if the bridge was implemented with LTB/landfall/blink/etc. taxonomy. The full evaluator run after implementation confirmed the target was exceeded:

- **31,642/54,367** resolved combos covered (**58.2%**).
- **31,764/54,160** classified expected-result rows covered (**58.6%**).
- Strict proof remains **543**.
- Proof-only result coverage remains **1,771** rows (**3.3%**), intentionally separate from edge-signal coverage.
