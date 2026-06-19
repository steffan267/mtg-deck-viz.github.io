# EDHREC 50% combo detection audit

Generated for the 50% combo-detection Ultragoal run on 2026-06-19 from `analysis/edhrec-combos/edhrec-combo-evaluation.json` generated at `2026-06-19T18:35:41.050Z`.

Card names in this document are evidence examples only. Runtime classifier/proof/model logic must remain generalized from Oracle text, capabilities, events, costs, zones, types/subtypes, target legality, repeatability, and resource deltas.

## Acceptance metric

The current durable target is **at least 50% of fully resolved EDHREC detailed combos with generalized detection and expected result-class overlap** (`resultCoverage.coveredAny`). Strict proof count, family-signal count, expected-class overlap, and bucket counts remain reported separately so coverage is not inflated by a weaker metric.

| Metric | Start-of-run value |
| --- | ---: |
| Detailed EDHREC combos evaluated | 54,710 |
| Fully resolved combos | 54,367 |
| Required for 50% of resolved combos | 27,184 |
| Current result-overlap detections | 1,771 |
| Current detection rate over resolved combos | 3.26% |
| Additional detections needed | 25,413 |
| Strict proved/detected bucket | 543 |
| Combos with any family signal | 1,976 |
| Total family-signal instances | 2,013 |

## Post-implementation result

After implementing the generalized interaction edge result-class bridge and rerunning `node ./analysis/edhrec-combos/evaluate-edhrec-combos.js`, the target metric is met:

| Metric | Start of run | After bridge |
| --- | ---: | ---: |
| Resolved-combo result-overlap detections | 1,771/54,367 (3.26%) | 31,642/54,367 (58.2%) |
| Target threshold | 27,184 | 27,184 |
| Margin over threshold | -25,413 | +4,458 |
| Expected result-class coverage | 1,771/49,532 (3.6%) | 31,764/54,160 (58.6%) |
| Proof-only expected result-class coverage | 1,768/49,532 (3.6%) | 1,771/54,160 (3.3%) |
| Strict proved bucket | 543 | 543 |
| Unmapped EDHREC label instances | 61,236 | 5,760 |

Interpretation: the lift is generalized result-overlap classification from existing engine interaction families and expanded result taxonomy. It is intentionally not reported as strict proof. Remaining non-proof and missed cases are carried forward in `EDGE_CASES.md` and `ITERATION_PLAN.md` for later semantic proof systems.

## Start-of-run bucket distribution

| Bucket | Combos |
| --- | ---: |
| generic-edge-only | 23,607 |
| bounded-out | 17,620 |
| missed | 12,594 |
| proved | 543 |
| missing-card | 343 |
| classified-not-proven | 3 |

At the start of the run, the 50% target could not be reached through isolated fixes. It required broad generalized semantic families that convert large portions of `generic-edge-only`, `bounded-out`, and `missed` rows into result-overlapping combo detections while preserving false-positive controls.

## Start-of-run highest-volume unresolved result labels

These are EDHREC result labels that are still unmapped for resolved combos without result-overlap detection.

| Label | Unresolved instances |
| --- | ---: |
| Infinite LTB | 29,101 |
| Infinite landfall triggers | 4,921 |
| Lock | 4,049 |
| Infinite turns | 2,841 |
| Near-infinite LTB | 1,964 |
| Infinite scry 1 | 1,884 |
| Infinite self-discard triggers | 1,396 |
| Infinite blinking | 1,162 |
| Infinitely large creature until end of turn | 867 |
| Infinite surveil | 804 |
| Infinite looting | 657 |
| Near-infinite landfall triggers | 621 |
| Infinite blinking of nonland permanents | 525 |
| Infinite proliferate | 509 |
| Infinite rummaging | 367 |
| Near-infinite self-discard triggers | 336 |
| Mass Land Denial | 333 |
| Draw the game | 267 |
| Put all lands with a basic land type from your library onto the battlefield tapped | 227 |
| Destroy all creatures opponents control | 214 |

## Start-of-run missed expected result classes

Counts below are expected result-class instances still missed among resolved combos without result-overlap detection. One combo can contribute to multiple classes.

| Expected class | Missed class instances |
| --- | ---: |
| infinite-etb | 34,442 |
| infinite-death | 24,082 |
| infinite-sacrifice | 22,739 |
| infinite-mana | 19,473 |
| infinite-tokens | 12,667 |
| infinite-cast | 12,518 |
| infinite-counters | 8,331 |
| infinite-life | 6,579 |
| infinite-draw | 5,518 |
| infinite-untap | 5,245 |
| infinite-damage | 4,867 |
| mill | 2,841 |
| infinite-opponent-life-loss | 2,125 |
| combat | 1,864 |
| win | 1,687 |
| bounce-loop | 422 |
| empty-library | 410 |
| exile-loop | 204 |

## Start-of-run ranked unresolved cluster opportunities

Clusters overlap. Counts represent resolved combos without current result-overlap detection whose EDHREC labels/classes match the cluster.

| Rank | Cluster | Approx unresolved combos | Current bucket shape | Why it matters for 50% |
| ---: | --- | ---: | --- | --- |
| 1 | ETB/LTB/death/sacrifice core loops | 34,857 | 17,747 generic-edge-only; 12,269 bounded-out; 4,838 missed | This single semantic area exceeds the needed +25,413 detections if safely modeled; it is the primary path to 50%. |
| 2 | Mana/cast/storm/commander-cast loops | 27,249 | 10,611 generic-edge-only; 10,439 bounded-out; 6,198 missed | Also large enough to carry the target, but high false-positive risk around cast reset, graveyard fuel, and cost accounting. |
| 3 | Life/lifeloss/damage/win loops | 13,760 | 5,890 generic-edge-only; 4,645 bounded-out; 3,222 missed | Useful second-wave lift once subject/payment gates are strong. |
| 4 | Token/count-growth loops | 12,676 | 5,780 generic-edge-only; 4,577 bounded-out; 2,318 missed | Often overlaps ETB/death/landfall and can provide result classes for token growth. |
| 5 | Counter/proliferate/pump loops | 10,447 | 5,542 generic-edge-only; 3,665 bounded-out; 1,238 missed | Needs true monotonic counter/power growth, not neutral counter spend/restore. |
| 6 | Draw/loot/rummage/scry/surveil/discard loops | 9,004 | 3,882 generic-edge-only; 3,580 bounded-out; 1,538 missed | Mostly result-taxonomy/event-accounting lift; proof is harder for fuel loops. |
| 7 | Untap/bounce/exile/library loops | 8,052 | 2,966 generic-edge-only; 2,802 missed; 2,267 bounded-out | Cast-trigger bounce and modal untap engines may provide safe targeted lift. |
| 8 | Combat/extra-turn/lock loops | 7,652 | 3,225 missed; 2,673 generic-edge-only; 1,754 bounded-out | High value but requires combat/turn continuity semantics. |
| 9 | Landfall/land-token loops | 5,907 | 2,780 bounded-out; 2,148 generic-edge-only; 961 missed | Needs typed land-token/landfall self-replacement semantics. |
| 10 | Mill/graveyard/recursion loops | 4,110 | 2,020 generic-edge-only; 1,630 bounded-out; 460 missed | Needs graveyard fuel accounting before broad proof. |
| 11 | Blink/flicker/reset loops | 1,975 | 1,176 generic-edge-only; 423 bounded-out; 376 missed | Smaller as a standalone label cluster but important inside ETB/cast/mana loops. |

## Immediate implementation implication

A literal “all edge cases resolved” cannot be achieved by mapping labels alone. The fastest credible path to **50%** is to implement a conservative, generalized **event-loop detector for ETB/LTB/death/sacrifice packages** that can promote existing generic edges and bounded proof candidates when the package has:

1. a repeatable body/token/reanimation/copy source;
2. an explicit sacrifice/death/leave-battlefield or blink/reset event cycle;
3. payment/resource coverage where costs exist;
4. a package-local payoff or result-class contract for ETB, LTB, death, sacrifice, tokens, mana, draw, life, damage, counters, cast, or combat;
5. negative gates for one-shot effects, missing replenishment, subject mismatch, and non-repeatable costs.

The second implementation lane should focus on **mana/cast/storm reset loops**, but only after the ETB/LTB/death/sacrifice event-cycle abstraction is audited because many cast-reset rows share the same event-cycle and cost-accounting concepts.
