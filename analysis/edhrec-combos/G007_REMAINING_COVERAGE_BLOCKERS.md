# G007 remaining EDHREC coverage blockers

Generated for ultragoal story G007 after the full evaluator run at `2026-06-19T21:38:32.889Z`.

## Result

100% combo detection remains unsafe to claim. The engine reached:

- strict proved bucket: **649 / 54,710**;
- proof-status `proven`: **641**;
- expected result-class coverage: **31,857 / 54,161 (58.8%)**;
- proof-only expected coverage: **1,878 / 54,161 (3.5%)**;
- combo-family detected: **65.7%**.

G007 safely added generalized families for counter-token ETB-counter loops, same-turn delayed mill finishers, -1/-1 counter death-token loops, and lifegain/counter/token ETB loops. No runtime/evaluator card-name matching was introduced.

## Exhaustive blocker reconciliation

Every row with mapped EDHREC expected classes but no model overlap is assigned exactly one blocker:

| Blocker | Count | Meaning |
| --- | ---: | --- |
| `no-current-signal` | 12,406 | Current classifier/proof graph has no usable generalized family/edge signal. |
| `proof-size-bound` | 4,409 | Combo needs proof beyond the current bounded package limit or larger state model. |
| `generic-edge-no-result-class` | 3,030 | A graph edge exists, but mapping it to a combo result class would inflate coverage. |
| `semantic-system-needed-classified` | 2,231 | A family/edge signal exists, but strict proof/result-axis semantics are missing. |
| `missing-card-data` | 221 | At least one card in the combo row does not resolve locally. |
| `proved-result-axis-mismatch` | 7 | A strict proof exists, but its generalized result axis does not match EDHREC's labels. |
| **Total** | **22,304** | Matches `summary.expectedClassCoverage.missedAll`. |

Resolved-only blocker counts exclude `missing-card-data` and reconcile to **22,083**.

## Top blocker details

### `no-current-signal` — 12,406

Dominant missed classes: `infinite-etb` 4,776; `infinite-mana` 4,502; `infinite-ltb` 3,738; `infinite-cast` 2,605; `infinite-tokens` 2,305; `infinite-untap` 2,183.

Representative systems requiring new semantics:

- stack/bounce/replay loops;
- escape/graveyard fuel loops;
- landfall, land-token, and land-play loops;
- variable board-count mana loops;
- combat/connect/extra-combat sequencing.

### `proof-size-bound` — 4,409

Dominant missed classes: `infinite-etb` 1,936; `infinite-cast` 1,462; `infinite-ltb` 1,317; `infinite-mana` 1,270; `infinite-tokens` 1,223.

These rows are often 4+ card packages. Raising the cap alone is unsafe without better state pruning/resource accounting.

### `generic-edge-no-result-class` — 3,030

Dominant missed classes: `infinite-etb` 1,556; `infinite-mana` 1,196; `infinite-tokens` 1,099; `infinite-ltb` 816; `infinite-life` 793; `infinite-counters` 741.

These are deliberately not counted as covered: generic edges can show synergy but not repeatability/payment/target legality.

### `semantic-system-needed-classified` — 2,231

Dominant missed classes: `lock` 921; `infinite-turns` 776; `infinite-etb` 414; `infinite-ltb` 316; `infinite-mana` 279.

The classifier sees relevant structure, but proof needs missing systems such as turn locks, stack recursion, replacement/prevention effects, or combat phase sequencing.

### `missing-card-data` — 221 expected misses

These cannot be evaluated until the local card index resolves the missing card rows.

### `proved-result-axis-mismatch` — 7

These have strict proof evidence, but EDHREC labels ask for axes the proved family does not claim. The evaluator keeps these visible rather than broadening the family result classes.

## Safe next work candidates

The fanout review found no third broad safe class after the implemented G007 families. Remaining high-volume clusters require new semantic systems rather than more label mapping.

Prioritized future systems:

1. variable board-count mana with explicit threshold assumptions;
2. landfall/land-token/land-play resource model;
3. stack recursion and spell-copy/recast accounting;
4. escape/graveyard fuel accounting;
5. combat/connect/extra-combat sequencing;
6. lock/turn-prevention proof model;
7. larger-card-count proof search with pruning and regression snapshots.
