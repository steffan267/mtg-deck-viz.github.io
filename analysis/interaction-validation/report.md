# Interaction validation report

Schema: `interaction-validation-report.v1`

## Summary

- caseCount: 11
- positiveCount: 7
- negativeCount: 4
- truePositives: 6
- falseNegatives: 1
- falsePositives: 0
- recall: 0.857
- twoCardRecall: 0.667
- threeCardRecall: 1
- sampledPrecision: 1
- falsePositiveHubRate: 0
- unexplainedRate: 0.091
- averageProofConfidence: 0.75

Runtime is measured by the CLI and intentionally kept out of checked artifacts.

## Source coverage

- `commander-spellbook-seeds` (combo-database-seed, local-fixtures): 4 cases
- `known-combo-seeds` (known-combo-deck-seed, local-fixtures): 3 cases
- `negative-near-misses` (negative-corpus, local-fixtures): 4 cases
- `precon-sample-100` (precon-sample, checked-in-summary): 100 decks; 1 combo decks
- `moxfield-bracket-464` (moxfield-bracket-sample, checked-in-summary): 464 decks; 0 failed decks
- `casual-synergy-audit-96` (casual-synergy-audit, checked-in-summary): 96 evaluations

## Cases

- PASS `known-combo-aristocrats-token`: expected proven (aristocrats-body-outlet-payoff); actual proven (aristocrats-body-outlet-payoff)
- PASS `known-combo-token-modifier-payoff`: expected proven (token-source-modifier-payoff); actual proven (token-source-modifier-payoff)
- FAIL `known-gap-library-exile-win`: expected proven (library-exile-empty-library-win); actual no-proof
- PASS `negative-one-shot-blink`: expected not-proven; actual not-repeatable
- PASS `negative-reducer-scope-rock`: expected not-proven; actual no-proof
- PASS `negative-token-reminder-overreach`: expected not-proven; actual no-proof
- PASS `negative-unreplenished-aristocrats`: expected not-proven; actual not-repeatable
- PASS `spellbook-seed-artifact-top-loop`: expected proven (artifact-top-cost-reduction-loop); actual proven (artifact-top-cost-reduction-loop)
- PASS `spellbook-seed-deadeye-drake`: expected proven (blink-etb-land-untap-loop); actual proven (blink-etb-land-untap-loop)
- PASS `spellbook-seed-lifegain-lifeloss`: expected proven (lifegain-lifeloss-loop); actual proven (lifegain-lifeloss-loop)
- PASS `spellbook-seed-self-untap-mana`: expected proven (self-untap-mana-loop); actual proven (self-untap-mana-loop)

## Manual audit queues

- Missed combos: known-gap-library-exile-win
- False positives: none
- Low-confidence proofs: none
- Suspicious hubs: sample-xantcha:draw=42, sample-xantcha:ramp→sink=42
