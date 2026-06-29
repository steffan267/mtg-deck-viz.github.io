# Interaction validation report

Schema: `interaction-validation-report.v1`

## Summary

- caseCount: 46
- positiveCount: 24
- negativeCount: 22
- truePositives: 24
- falseNegatives: 0
- falsePositives: 0
- recall: 1
- twoCardRecall: 1
- threeCardRecall: 1
- sampledPrecision: 1
- falsePositiveHubRate: 0
- unexplainedRate: 0
- averageProofConfidence: 0.75

Runtime is measured by the CLI and intentionally kept out of checked artifacts.

## Source coverage

- `commander-spellbook-seeds` (combo-database-seed, local-fixtures): 4 cases
- `known-combo-seeds` (known-combo-deck-seed, local-fixtures): 20 cases
- `negative-near-misses` (negative-corpus, local-fixtures): 22 cases
- `precon-sample-100` (precon-sample, checked-in-summary): 100 decks; 1 combo decks
- `moxfield-bracket-464` (moxfield-bracket-sample, checked-in-summary): 464 decks; 0 failed decks
- `casual-synergy-audit-96` (casual-synergy-audit, checked-in-summary): 96 evaluations

## Cases

- PASS `known-combo-any-type-amplified-self-untap`: expected proven (self-untap-mana-loop); actual proven (self-untap-mana-loop)
- PASS `known-combo-aristocrats-token`: expected proven (aristocrats-body-outlet-payoff); actual proven (aristocrats-body-outlet-payoff)
- PASS `known-combo-artifact-top-loop-flexible-caster`: expected proven (artifact-top-cost-reduction-loop); actual proven (artifact-top-cost-reduction-loop)
- PASS `known-combo-colorless-amplified-self-untap`: expected proven (self-untap-mana-loop); actual proven (self-untap-mana-loop)
- PASS `known-combo-draw-damage-feedback`: expected proven (draw-damage-feedback-loop); actual proven (draw-damage-feedback-loop)
- PASS `known-combo-fixed-lifegain-lifeloss`: expected proven (lifegain-lifeloss-loop); actual proven (lifegain-lifeloss-loop)
- PASS `known-combo-hasty-copy-etb-untap`: expected proven (hasty-copy→etb-untap-loop); actual proven (hasty-copy→etb-untap-loop)
- PASS `known-combo-imprint-untap-spell-loop`: expected proven (imprint-untap-spell-loop); actual proven (imprint-untap-spell-loop)
- PASS `known-combo-layered-recursive-body-death-mana`: expected proven (recursive-body-sacrifice-mana-loop); actual proven (recursive-body-sacrifice-mana-loop)
- PASS `known-combo-library-exile-win`: expected proven (library-exile-empty-library-win); actual proven (library-exile-empty-library-win)
- PASS `known-combo-lifelink-counter-damage`: expected proven (lifelink-counter-damage-loop); actual proven (lifelink-counter-damage-loop)
- PASS `known-combo-mill-lifeloss-feedback`: expected proven (mill-lifeloss-feedback-loop); actual proven (mill-lifeloss-feedback-loop)
- PASS `known-combo-mill-multiplier-finite-mill`: expected proven (mill-multiplier-finite-mill); actual proven (mill-multiplier-finite-mill)
- PASS `known-combo-mutual-etb-blink-reset`: expected proven (mutual-etb-blink-reset-loop); actual proven (mutual-etb-blink-reset-loop)
- PASS `known-combo-opponent-draw-punisher-win`: expected proven (opponent-draw-punisher-win); actual proven (opponent-draw-punisher-win)
- PASS `known-combo-recursive-body-sacrifice-mana`: expected proven (recursive-body-sacrifice-mana-loop); actual proven (recursive-body-sacrifice-mana-loop)
- PASS `known-combo-self-untap-ability-copy`: expected proven (self-untap-mana→ability-copy-loop); actual proven (self-untap-mana→ability-copy-loop)
- PASS `known-combo-spell-copy-creature-copy`: expected proven (spell-copy-etb→creature-copy-spell-loop); actual proven (spell-copy-etb→creature-copy-spell-loop)
- PASS `known-combo-token-modifier-payoff`: expected proven (token-source-modifier-payoff); actual proven (token-source-modifier-payoff)
- PASS `known-combo-token-replacement-sacrifice-mana`: expected proven (token-replacement-sacrifice-mana-loop); actual proven (token-replacement-sacrifice-mana-loop)
- PASS `negative-any-type-amplifier-break-even-only`: expected not-proven; actual not-repeatable
- PASS `negative-colored-recursion-colorless-sac`: expected not-proven; actual not-repeatable
- PASS `negative-colored-recursive-cast-colorless-sac`: expected not-proven; actual not-repeatable
- PASS `negative-colorless-amplifier-colored-self-untapper`: expected not-proven; actual not-repeatable
- PASS `negative-expensive-imprint-untap`: expected not-proven; actual no-proof
- PASS `negative-expensive-recursive-body`: expected not-proven; actual not-repeatable
- PASS `negative-hasty-copy-nonlegendary-target`: expected not-proven; actual not-repeatable
- PASS `negative-lifelink-counter-noncreature-source`: expected not-proven; actual not-repeatable
- PASS `negative-low-output-ability-copy`: expected not-proven; actual not-repeatable
- PASS `negative-mutual-etb-blink-target-mismatch`: expected not-proven; actual not-repeatable
- PASS `negative-one-shot-blink`: expected not-proven; actual not-repeatable
- PASS `negative-one-way-draw-damage`: expected not-proven; actual no-proof
- PASS `negative-one-way-mill-lifeloss`: expected not-proven; actual not-repeatable
- PASS `negative-opponent-draw-damage-feedback`: expected not-proven; actual not-repeatable
- PASS `negative-recursive-body-missing-another-creature`: expected not-proven; actual not-repeatable
- PASS `negative-reducer-scope-rock`: expected not-proven; actual no-proof
- PASS `negative-small-mill-multiplier`: expected not-proven; actual not-repeatable
- PASS `negative-small-opponent-draw-punisher`: expected not-proven; actual not-repeatable
- PASS `negative-spell-copy-noncreature-copier`: expected not-proven; actual not-repeatable
- PASS `negative-token-reminder-overreach`: expected not-proven; actual no-proof
- PASS `negative-token-replacement-missing-outlet`: expected not-proven; actual not-repeatable
- PASS `negative-unreplenished-aristocrats`: expected not-proven; actual not-repeatable
- PASS `spellbook-seed-artifact-top-loop`: expected proven (artifact-top-cost-reduction-loop); actual proven (artifact-top-cost-reduction-loop)
- PASS `spellbook-seed-deadeye-drake`: expected proven (blink-etb-land-untap-loop); actual proven (blink-etb-land-untap-loop)
- PASS `spellbook-seed-lifegain-lifeloss`: expected proven (lifegain-lifeloss-loop); actual proven (lifegain-lifeloss-loop)
- PASS `spellbook-seed-self-untap-mana`: expected proven (self-untap-mana-loop); actual proven (self-untap-mana-loop)

## Manual audit queues

- Missed combos: none
- False positives: none
- Low-confidence proofs: none
- Suspicious hubs: sample-xantcha:draw=42, sample-xantcha:ramp→sink=42
