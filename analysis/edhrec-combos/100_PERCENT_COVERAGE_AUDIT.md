# EDHREC 100% combo coverage audit

Generated during the 100% coverage ultragoal pass on 2026-06-19.

## Summary

True 100% EDHREC combo detection is **not safe to claim** with the current engine without either:

- broadening result mappings beyond what the engine actually understands,
- treating generic interaction edges as combo proofs,
- hard-coding card names or card pairs, or
- building semantic systems that are not implemented yet.

This pass therefore maximized only **strictly generalized, text-derived** coverage and recorded the remaining blocker classes.

## Metric definitions kept separate

- **Resolved-combo result coverage**: resolved combos where at least one generalized model class overlaps at least one EDHREC result class.
- **Expected result-class coverage**: combos with at least one mapped EDHREC result class where any model class overlaps.
- **Proof-only expected coverage**: only bounded proof/package families and proof deltas; edge-result overlap is excluded.
- **Strict proved bucket**: bounded proof search/package logic found a proof; this is not the same as result-overlap detection.

## Before vs after

Baseline before this pass came from the fresh evaluator run immediately before G001 changes.

| Metric | Before | After G001 | Delta |
|---|---:|---:|---:|
| Detailed combos evaluated | 54,710 | 54,710 | 0 |
| Local card resolution | 54,367 | 54,367 | 0 |
| Strict proved bucket | 543 | 549 | +6 |
| Resolved-combo result coverage | 31,642 / 54,367 (58.2%) | 31,648 / 54,367 (58.2%) | +6 |
| Expected result-class coverage | 31,764 / 54,160 (58.6%) | 31,770 / 54,161 (58.7%) | +6, denominator +1 |
| Proof-only expected coverage | 1,771 / 54,160 (3.3%) | 1,777 / 54,161 (3.3%) | +6, denominator +1 |
| Combo-family detected | 65.5% | 65.6% | +0.1pp |
| Unmapped EDHREC labels | 5,104 combos / 5,760 labels | 4,385 combos / 4,916 labels | -719 combos / -844 labels |

The coverage gain is intentionally modest because the safe implementation added only families whose repeatability/payment/target constraints could be represented by current proof semantics.

## Generalized additions in this pass

### 1. Life-paid damage restored by opponent-loss lifegain

Files:

- `src/interaction-model.js`
- `src/interaction-proof-search.js`
- `src/combo-family-library.js`
- `analysis/edhrec-combos/evaluate-edhrec-combos.js`
- `test/edhrec-combo-evaluator.test.js`
- `test/combo-family-library.test.js`

Text-derived facts:

- repeatable activated ability with `pay N life` in the cost,
- deals at least `N` damage to an opponent/player/any target,
- separate payoff with `Whenever an opponent loses life, you gain that much life`.

Proof gate:

- damage must be enough to restore the life payment,
- damage must be aimable at an opponent/player,
- no card names or pair exceptions.

Measured corpus lift: 2 strict proofs/family hits.

### 2. Exile-recast creature plus creature-only exile mana outlet

Text-derived facts:

- creature can be cast from exile,
- outlet exiles a creature you control for `X = 1 + mana value`,
- mana is restricted to creature spells.

Proof gate:

- the same creature is castable from exile,
- restricted mana is used only on that creature spell,
- package restores the battlefield body and creates bounded positive mana.

Measured corpus lift: 3 strict proofs/family hits.

### 3. ETB spell copier plus death-copy creature spell

Text-derived facts:

- nonlegendary creature has an ETB trigger copying target instant/sorcery,
- instant/sorcery destroys target creature and creates two token copies if it dies.

Proof gate:

- target must be a nonlegendary creature with the ETB spell-copy fact,
- generic graph edge alone is **not** allowed to count; target legality must pass first,
- legendary near-miss regression added.

Measured corpus lift: 1 strict proof/family hit.

### 4. Safe EDHREC label taxonomy improvements

Expanded result-label mapping for plainly lock-shaped and mass-reanimation-shaped EDHREC labels. This reduces unmapped-label noise without claiming runtime proof.

Examples now classified as `lock`:

- `Counter all spells opponents cast`
- `Opponents skip their untap steps`
- `You can't be attacked`
- `Players can't draw cards`
- `Destroy all creatures opponents control`

Examples now classified as `mass-reanimate`:

- `Return all creature cards from your graveyard to the battlefield`
- `Return all nonland permanents from your graveyard to the battlefield`

## Remaining blocker counts after G001

Among resolved combos with mapped expected classes but zero result overlap:

| Bucket / blocker | Count |
|---|---:|
| Remaining zero-overlap resolved expected-class rows | 22,170 |
| No model family signals at all | 18,400 |
| No edges and no family signals | 14,605 |
| Generic edge exists but no result-class signal | 3,795 |
| Family signal exists but no expected-result overlap | 3,770 |
| Bounded proof size blocker (`>3` cards) with no overlap | 4,409 |

Top remaining missed expected classes:

| Expected class | Remaining zero-overlap rows |
|---|---:|
| `infinite-etb` | 8,758 |
| `infinite-mana` | 7,290 |
| `infinite-ltb` | 6,224 |
| `infinite-tokens` | 4,920 |
| `infinite-cast` | 4,580 |
| `lock` | 3,981 |
| `infinite-death` | 3,531 |
| `infinite-untap` | 3,037 |
| `infinite-turns` | 2,889 |
| `infinite-life` | 2,602 |

## Why 100% result-overlap is unsafe right now

### Missing semantic systems

1. **Cast-trigger bounce/replay loops**
   - Need stack timing, cast seed, replayed permanent state, mana positivity, and target legality.
   - Unsafe shortcut avoided: mapping `bounce` or `cast` edges directly to `infinite-mana`/`infinite-cast`.

2. **Escape/graveyard-fuel storm loops**
   - Need graveyard fuel accounting, replacement draws, self-mill, escape costs, and storm/cast loop state.
   - Unsafe shortcut avoided: treating `graveyard` edges as `infinite-cast`.

3. **Dredge/discard/replacement loops**
   - Need replacement-effect ordering and draw/discard/dredge resource accounting.
   - Unsafe shortcut avoided: broad `graveyard -> self-discard` mapping; regression keeps this disallowed.

4. **Land-token / landfall self-replacement loops**
   - Need typed token resources, land-token ETB tapped/untapped state, landfall target choice, and repeatability gates.
   - Unsafe shortcut avoided: mapping every `landfall` edge to complete token/mana coverage.

5. **Combat-phase and connect-trigger loops**
   - Need attack/connect/combat-damage preconditions, extra-combat phase sequencing, equipment/combat damage targeting, and untap timing.
   - Unsafe shortcut avoided: mapping `combat→payoff` to all combat/damage/tokens/mana classes.

6. **Lock/extra-turn/stax outcomes**
   - Label taxonomy can identify lock outcomes, but proof needs turn structure, replacement/prevention, counterspell windows, and static-rule lock modeling.
   - Unsafe shortcut avoided: mapping `etb→blink` or generic `draw` to `lock`/`infinite-turns`.

7. **Mass library/permanent-copy/tutor outcomes**
   - Many labels describe broad outcomes (`cast all spells`, `put all lands`, `infinite copies of artifacts`) rather than a currently modeled loop mechanism.
   - Unsafe shortcut avoided: regex-mapping all copy/tutor labels to existing token/mana/cast classes.

8. **Proof size bound**
   - Current strict proof search is capped at 3 cards by design.
   - 17,620 combos are still `bounded-out`; 4,409 of those have no result overlap.

## Remaining unmapped label classes for human/semantic review

Top unmapped labels after safe taxonomy fixes:

| Label | Instances |
|---|---:|
| `Draw the game` | 269 |
| `Put all lands with a basic land type from your library onto the battlefield tapped` | 227 |
| `Infinite recursion of creature cards in your graveyard` | 200 |
| `Put all basic lands from your library onto the battlefield tapped` | 127 |
| `Put all land cards from your library and graveyard onto the battlefield` | 119 |
| `Put all basic lands from your library onto the battlefield` | 110 |
| `Put all creature cards from your library onto the battlefield tapped` | 99 |
| `Put all artifact cards and a subset of creature cards from your library onto the battleifeld` | 96 |
| `Infinite copies of artifacts you control` | 95 |
| `Infinite creature copies of artifacts you control` | 95 |

These are intentionally not force-mapped in G001 because most require either a new result axis or a new proof/semantic system.

## G001 conclusion

- Detection/result-overlap was improved where current semantics could prove generalized families.
- True 100% detection is blocked by missing semantic systems and would require misleading broad mappings if forced now.
- The remaining rows are classified enough to guide later proof/interaction work without conflating recall-style result overlap with strict proof.

## Post-G005 safety note

Later fanout review found and fixed several safety/product-path gaps without changing the conclusion above:

- product `interactionProofs` now seed the new proof families instead of relying only on offline `provePackage()` checks;
- life-paid damage detection excludes tapped/sacrificial/once-per-turn activation costs;
- exile-recast detection excludes origin-bound exile permissions such as “if it was foretold”;
- detection-only `exile-recast-creature-mana-loop` signals no longer claim `infinite-mana` without proof deltas.

For the current combined fanout record, see `analysis/edhrec-combos/FANOUT_REVIEW.md`.

## Post-G007 detection/proof lift and current blocker reconciliation

G007 reran fanout against the remaining misses and added only additional families that were generalized, text-derived, and regression-tested:

- `counter-token→etb-counter-loop`
- `delayed-mill-equalizer-finite-mill`
- `minus-counter-death→token-loop`
- `lifegain-counter-token-etb-loop`

The full evaluator run generated at `2026-06-19T21:38:32.889Z` measured:

| Metric | Current value |
| --- | ---: |
| Detailed combos evaluated | 54,710 |
| Fully resolved locally | 54,367 |
| Strict proved bucket | 649 |
| Proof-status `proven` | 641 |
| Expected result-class coverage | 31,857 / 54,161 (58.8%) |
| Proof-only expected coverage | 1,878 / 54,161 (3.5%) |
| Combo-family detected | 65.7% |

100% is still not safe to claim. The evaluator now reconciles all **22,304** remaining expected-result misses into one blocker each:

| Blocker | Count |
| --- | ---: |
| `no-current-signal` | 12,406 |
| `proof-size-bound` | 4,409 |
| `generic-edge-no-result-class` | 3,030 |
| `semantic-system-needed-classified` | 2,231 |
| `missing-card-data` | 221 |
| `proved-result-axis-mismatch` | 7 |

See `analysis/edhrec-combos/G007_REMAINING_COVERAGE_BLOCKERS.md` for the current blocker taxonomy and next semantic-system priorities.
