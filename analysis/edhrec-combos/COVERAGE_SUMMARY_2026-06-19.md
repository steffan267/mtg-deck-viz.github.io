# EDHREC combo coverage summary — 2026-06-19

This summary records the ultragoal coverage work against the full EDHREC combo corpus. The governing constraints remain: **no card-name hard-coding**, no generic edge inflation, and no claiming result axes unless a generalized text-derived family/proof supports them.

Source command for the current numbers:

```sh
node ./analysis/edhrec-combos/evaluate-edhrec-combos.js
```

Current evaluation artifact: `analysis/edhrec-combos/edhrec-combo-evaluation.json`, generated at `2026-06-19T22:08:32.209Z`.

## Metric definitions

- **Local resolution**: all cards in the EDHREC combo row resolve against the local card index.
- **Strict proved bucket**: bounded proof/package logic proved the loop from generalized text-derived facts.
- **Proof-status `proven`**: strict proof-search status only; this can differ slightly from the bucket because product proof packages also count in the bucket.
- **Expected result-class coverage**: an EDHREC row has at least one mapped expected result class and at least one overlapping generalized model/result class.
- **Resolved-combo result coverage**: a locally resolved EDHREC row has at least one overlapping generalized model/result class.
- **Proof-only expected coverage**: expected result-class coverage from strict proof/package deltas only; generic interaction edges are excluded.
- **Combo-family detected**: any generalized combo/interaction family signal was detected, independent of strict proof.

## Before/current table

| Stage | Strict proved bucket | Proof-status `proven` | Expected result-class coverage | Resolved-combo result coverage | Proof-only expected coverage | Combo-family detected | Unmapped EDHREC labels |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline before G001 | 543 | not recorded | 31,764 / 54,160 (58.6%) | 31,642 / 54,367 (58.2%) | 1,771 / 54,160 (3.3%) | 65.5% | 5,104 combos / 5,760 labels |
| After G005/G006 hardening snapshot | 572 | 564 | 31,781 / 54,161 (58.7%) | 31,659 / 54,367 (58.2%) | 1,800 / 54,161 (3.3%) | 65.6% | 4,385 combos / 4,916 labels |
| Current after G007 safe fanout additions | 649 | 641 | 31,857 / 54,161 (58.8%) | not separately printed; see JSON | 1,878 / 54,161 (3.5%) | 65.7% | 4,385 combos / 4,916 labels |
| Current after G008 strict-proof pinger-lock addition | 667 | 659 | 31,875 / 54,161 (58.9%) | not separately printed; see JSON | 1,896 / 54,161 (3.5%) | 65.8% | 4,385 combos / 4,916 labels |

## Current evaluator snapshot

| Metric | Current value |
| --- | ---: |
| Detailed combos evaluated | 54,710 |
| Fully resolved locally | 54,367 (99.4%) |
| Missing-card rows | 343 |
| Strict proved bucket | 667 (1.2%) |
| Proof-status `proven` | 659 |
| `classified-not-proven` bucket | 20,441 |
| `generic-edge-only` bucket | 3,062 |
| `missed` bucket | 12,577 |
| `bounded-out` bucket | 17,620 |
| Proof-status `not-repeatable` | 2,063 |
| Proof-status `no-proof` | 34,347 |
| Proof-status `bounded-out` | 17,641 |
| Expected result-class coverage | 31,875 / 54,161 (58.9%) |
| Proof-only expected coverage | 1,896 / 54,161 (3.5%) |
| Combo-family detected | 65.8% |

## G007 generalized additions

G007 added only safe, generalized mechanics with regression fixtures:

- `counter-token→etb-counter-loop`
- `delayed-mill-equalizer-finite-mill`
- `minus-counter-death→token-loop`
- `lifegain-counter-token-etb-loop`

The high-impact lifegain/counter/token family is guarded by dynamic self-name/self-creature recognition, creature-token production, non-once-per-turn creature-ETB lifegain, and counter-target legality. Runtime and evaluator logic still do not match specific card names.


## G008 strict-proof addition

G008 added one further safe strict-proof family:

- `death-untap-deathtouch-pinger-lock`

This family is text/capability-derived only: a free tap-only creature pinger, death-trigger untap, and deathtouch must be assembled on the same legal source, either intrinsically on one creature carrier or granted together to an equipped creature. It explicitly rejects mana-costed pingers, once-per-turn death-untap effects, and split intrinsic roles across different creatures. The full corpus run detected 18 rows for this family, moving strict proved bucket coverage from 649 to 667 and proof-only expected coverage from 1,878 to 1,896 rows.

## Reconciled blocker partition for remaining expected misses

The current evaluator reconciles every expected-class miss into exactly one blocker bucket: `22,286 / 22,286`.

| Blocker | Expected misses |
| --- | ---: |
| `no-current-signal` | 12,402 |
| `proof-size-bound` | 4,409 |
| `generic-edge-no-result-class` | 3,016 |
| `semantic-system-needed-classified` | 2,231 |
| `missing-card-data` | 221 |
| `proved-result-axis-mismatch` | 7 |

Top missed classes remain concentrated in systems not modeled by the current engine: variable board-count mana, landfall/land-token loops, stack recursion, escape/graveyard fuel, combat sequencing, lock/turn structure, broad copy/tutor outcomes, and >3-card packages.

## Durable artifacts

- Current machine-readable run: `analysis/edhrec-combos/edhrec-combo-evaluation.json`
- Current report: `analysis/edhrec-combos/edhrec-combo-evaluation.md`
- 100% detection audit: `analysis/edhrec-combos/100_PERCENT_COVERAGE_AUDIT.md`
- Strict proof audit: `analysis/edhrec-combos/STRICT_PROOF_COVERAGE_AUDIT.md`
- G008 strict-proof blockers: `analysis/edhrec-combos/G008_STRICT_PROOF_BLOCKERS.md`
- Fanout review and resolved edge cases: `analysis/edhrec-combos/FANOUT_REVIEW.md`
- Combined engine contract: `src/INTERACTION_ENGINE.md`
