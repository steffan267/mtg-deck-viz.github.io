# G008 strict-proof blockers — 2026-06-19

Source: `analysis/edhrec-combos/edhrec-combo-evaluation.json`, generated at `2026-06-19T22:08:32.209Z` by:

```sh
node ./analysis/edhrec-combos/evaluate-edhrec-combos.js
```

## Result

G008 safely added `death-untap-deathtouch-pinger-lock` and detected 18 full-corpus rows after the final carrier-assembly review fix. The strict proved bucket increased from 649 to 667; proof-status `proven` increased from 641 to 659.

The family is generalized and text-derived. It requires:

- a free tap-only pinger that can damage creatures;
- death-trigger untap with no once-per-turn throttle;
- deathtouch on the same assembled source, intrinsically or through Equipment grants.

It rejects:

- pingers with mana/payment/sacrifice/discard/exile/remove costs;
- death-untap effects limited to once each turn;
- packages where the abilities cannot be assembled on a legal creature carrier.

## Remaining expected-class miss partition

The evaluator reconciles every remaining expected-class miss into exactly one blocker bucket: `22,286 / 22,286`.

| Blocker | Expected misses | Meaning |
| --- | ---: | --- |
| `no-current-signal` | 12,402 | No current generalized interaction/combo signal describes the row. |
| `proof-size-bound` | 4,409 | Row is outside current strict proof limits, usually >3 cards or branch/depth limits. |
| `generic-edge-no-result-class` | 3,016 | A generic graph edge exists, but it does not safely imply an EDHREC result class. |
| `semantic-system-needed-classified` | 2,231 | Existing signals classify the row, but strict proof needs a missing semantic subsystem. |
| `missing-card-data` | 221 | One or more combo cards are missing from the local Scryfall/card index. |
| `proved-result-axis-mismatch` | 7 | A strict proof exists but does not imply the expected EDHREC result axis. |

## Safe conclusion

The remaining gap is not safely reducible by broadening regexes. The largest blockers require new semantic systems: stack/spell recursion, escape and graveyard-fuel accounting, landfall/land-play resources, variable board-count mana, lock/turn structure, combat sequencing, and >3-card artifact recursion.
