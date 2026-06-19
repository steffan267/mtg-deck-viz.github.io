# EDHREC combo edge cases for human review

This tracked snapshot comes from the clean full-corpus EDHREC run on 2026-06-19. It records hard or currently missed combo shapes for future generalized rules. Card names are examples for review only, not runtime classifier exceptions.

The full local/generated report is `analysis/edhrec-combos/edhrec-combo-evaluation.md` and the machine-readable run is `analysis/edhrec-combos/edhrec-combo-evaluation.json`.

## Current baseline

- EDHREC categories discovered: **34**
- Unique combo summaries fetched: **54,714**
- Evaluable combos: **54,710**
- Local card resolution: **54,367/54,710** (99.4%)
- Proven by bounded proof/package logic: **543/54,710** (1.0%), up from **527** at the previous pushed baseline and **508** before G003.
- Combo-family/edge signal detection: **61,840 signal hits** across **65.5%** of combos.
- Resolved-combo result coverage target metric: **31,642/54,367** (58.2%), above the 50% target of **27,184** by **4,458** combos.
- Expected result-class coverage across all generalized signals: **31,764/54,160** (58.6%).
- Proof-only expected result-class coverage remains separately reported at **1,771/54,160** (3.3%); the 50% lift is intentionally not counted as strict proof.
- Remaining result-label taxonomy gaps: **5,104** combos contain **5,760** unmapped EDHREC label instances.
- Current buckets: **20,454** classified-not-proven, **17,620** bounded-out, **12,594** missed, **3,156** generic-edge-only, **543** proved, **343** missing-card.

## Before/after detection metrics

The 50% coverage run changed the offline EDHREC evaluator's generalized result-overlap reporting while preserving strict proof semantics:

| Metric | Before 50% run | After 50% run |
| --- | ---: | ---: |
| Fully resolved combos | 54,367 | 54,367 |
| Resolved-combo result-overlap detections | 1,771 (3.26%) | 31,642 (58.2%) |
| Required for 50% of resolved combos | 27,184 | 27,184 |
| Expected result-class coverage | 1,771/49,532 (3.6%) | 31,764/54,160 (58.6%) |
| Proof-only expected result-class coverage | 1,768/49,532 (3.6%) | 1,771/54,160 (3.3%) |
| Strict proved bucket | 543 | 543 |
| Unmapped EDHREC label instances | 61,236 | 5,760 |

## Covered in G003-G006

These were previously in the hard-case list and are now covered by generalized rules, not card-name exceptions:

- fixed lifegain→opponent-lifeloss paired with opponent-lifeloss→lifegain;
- nonland-permanent mana amplifiers paired with compatible break-even colorless self-untappers;
- lifelink + lifegain-to-counter + counter-to-damage creature loops with target-legality checks, reported as damage/life loops only because the counter is spent and restored rather than grown without bound.
- replacement-only token modifiers now surface as non-combo token replacement edges without broadening token-replacement sacrifice loop proof semantics;
- Niv-style noncombat damage→draw feedback now proves through generic draw/damage capabilities;
- compound ETB/opponent-draw punishers now feed mass-draw threshold win packages;
- Warren/Gravecrawler/Blood-Artist-style loops now prove through `life-paid-treasure-recursive-drain-loop`, with explicit life-payment, Treasure-mana, and controlled-type precondition gates.
- EDHREC result taxonomy now recognizes high-volume labels such as LTB, landfall, blink, scry, surveil, looting, rummaging, self-discard, proliferate, pump, locks, turns, commander casts, and mass reanimation.
- The offline evaluator now bridges existing generalized interaction edge families to matching result axes. For example, sacrifice-body/outlet edges can explain death/sacrifice/LTB axes, blink edges can explain blink/ETB/LTB axes, landfall edges can explain landfall axes, and draw/discard/counter/combat edges only explain their own axes.
- This bridge is evaluator-only result-class evidence. It does not add card-name branches and it does not make an edge signal a bounded proof.

## Highest-priority remaining proof gaps

These rows remain useful human-review exemplars after the 50% bridge. Some now have result-overlap detection (`classified-not-proven`) while still lacking strict proof; others remain fully missed because the engine lacks the required resource, stack, combat, or subject model.

| Cards | EDHREC result labels | Current status | Proposed generalized gap |
| --- | --- | --- | --- |
| Hullbreaker Horror + Sol Ring | Infinite colorless mana; Infinite storm count | missed | cast-trigger bounce/replay with positive mana and storm/cast accounting |
| Underworld Breach + Lotus Petal + Brain Freeze | Infinite self-mill; Near-infinite magecraft triggers; Near-infinite mill | classified-not-proven via graveyard/mill signal | graveyard escape fuel, self-mill, and recast-cost accounting |
| Underworld Breach + Lion's Eye Diamond + Brain Freeze | Infinite self-mill; Near-infinite colored mana; Near-infinite magecraft triggers; Near-infinite mill; Near-infinite storm count | classified-not-proven via graveyard/mill signal | graveyard escape plus mana/fuel positivity |
| Springheart Nantuko + Tireless Provisioner | Infinite landfall triggers; Infinite tapped land tokens | missed | landfall-created land-token ETB loop; token typing needed |
| Underworld Breach + Lion's Eye Diamond + Wheel of Fortune | Infinite draw triggers; Infinite looting; Infinite looting for opponents; Near-infinite storm count | missed | wheel/discard/draw refills graveyard fuel for escape loop |
| Underworld Breach + Wheel of Fortune + Jeska's Will | Infinite draw triggers for all players; Infinite looting for all players; Near-infinite magecraft triggers; Near-infinite storm count | missed | escape/fuel plus ritual mana and all-player draw events |
| Springheart Nantuko + Lotus Cobra | Infinite landfall triggers; Infinite tapped land tokens | missed | landfall self-replacement with mana production and land-token accounting |
| Hullbreaker Horror + Mana Vault | Infinite colorless mana; Infinite storm count | missed | same cast-trigger bounce/replay family with mana-value/payment gate |
| Peregrin Took + Nuka-Cola Vending Machine | Infinite card draw; Infinite draw triggers; Near-infinite tapped Treasure tokens | classified-not-proven via token signals | Food/Clue/Treasure subtype conversion and token sacrifice/draw loop |
| Aetherflux Reservoir + Exquisite Blood | Infinite damage; Infinite lifegain triggers | missed | life-payment/damage/lifegain feedback with affordability gate |
| Dualcaster Mage + Molten Duplication | Infinite LTB; Infinite ETB; Infinite sacrifice triggers; Infinite death triggers; Infinite creature tokens with haste; Infinite magecraft triggers | classified-not-proven via copy/ETB/LTB signal | spell-copy creature-copy stack loop with copy-object target legality |
| The Gitrog Monster + Dakmor Salvage | Infinite self-mill; Near-infinite self-discard triggers | missed | result taxonomy + self-discard/graveyard fuel loop modeling |
| Sensei's Divining Top + Aetherflux Reservoir + Bolas's Citadel | Infinite card draw; Infinite draw triggers; Near-infinite damage; Near-infinite lifegain; Near-infinite lifegain triggers; Near-infinite storm count | classified-not-proven via cast signal | top-of-library plus life-payment and lifegain payoff accounting |
| Teferi, Time Raveler + Displacer Kitten + Sol Ring | Infinite card draw; Infinite draw triggers; Near-infinite colorless mana; Near-infinite storm count | missed | noncreature-spell blink reset with mana-positive recast and draw permanent |
| Razorkin Needlehead + Peer into the Abyss | Near-infinite damage to one opponent; Near-infinite draw triggers for target opponent; Near-infinite card draw for target opponent; Near-infinite lifeloss for target opponent | proved but result-class mismatch | finite opponent-draw threshold win is detected, but EDHREC near-infinite damage/draw/lifeloss labels need finite-vs-near-infinite result taxonomy |
| The Reaver Cleaver + Aggravated Assault | Infinite colored mana; Infinite combat damage; Infinite combat phases; Infinite mana creatures you control can produce; Infinite Treasure tokens; Infinite untap of creatures you control | missed | extra-combat treasure/equipment engine with combat damage payment continuity |
| Ghostly Flicker + Peregrine Drake + Archaeomancer | Infinite blinking; Infinite ETB; Infinite landfall triggers; Infinite LTB; Infinite magecraft triggers; Infinite mana lands you control can produce; Infinite storm count; Infinite untap of lands you control | classified-not-proven via blink/ETB/LTB signal | spell-recursion blink loop with stack/spell-return and land mana positivity |
| Skirk Prospector + Goblin Warchief + Krenko, Mob Boss | Infinite commander casts; Infinite creature tokens with haste; Infinite death triggers; Infinite ETB; Infinite LTB; Infinite red mana; Infinite sacrifice triggers; Infinite storm count | classified-not-proven via mana edge signal | token factory + cost reduction + sacrifice mana; needs count-growth accounting |
| Jeska's Will + Reiterate | Infinite magecraft triggers; Infinite red mana; Infinite storm count; Exile your library with playable exiled cards | missed | buyback/spell-copy ritual loop plus exile/play-access result mapping |
| Sword of Feast and Famine + Aggravated Assault | Infinite combat phases | missed | extra-combat payment loop with attacker damage/untap connection |
| Staff of Domination + Priest of Titania | Infinite card draw; Infinite draw triggers; Infinite lifegain; Infinite lifegain triggers; Infinite untap; Infinite green mana | missed | big-mana threshold untap/modal artifact engine |
| Blowfly Infestation + Nest of Scarabs | Infinite death triggers; Infinite ETB; Infinite LTB | generic-edge-only | counter/death/token replacement loop with creature death replenishment |
| Narset's Reversal + Isochron Scepter | Infinite turns; Lock | missed | result taxonomy for infinite turns/lock plus spell-copy/activation loop proof |
| Dualcaster Mage + Saw in Half | Infinite creature tokens; Infinite ETB; Infinite magecraft triggers; Infinite LTB; Infinite death triggers | missed | spell-copy/copy-token loop with death/ETB events |
| Aetherflux Reservoir + Bloodthirsty Conqueror | Infinite damage; Infinite lifegain triggers | missed | life-payment/lifegain feedback variant |
| Aurelia, the Warleader + Helm of the Host | Infinite combat phases; Infinite creature tokens with haste; Infinite ETB; Infinite mana creatures you control can produce; Infinite untap of creatures you control | missed | combat-token copy loop with nonlegendary/extra-combat target gates |
| Nim Deathmantle + Ashnod's Altar | Infinite LTB; Infinite ETB; Infinite sacrifice triggers; Infinite death triggers | missed | reanimation/payment body-fodder loop; needs death-trigger and replacement accounting |

## Remaining human-review buckets

These categories are not good candidates for quick permissive rules. They need either richer semantics or explicit human acceptance criteria:

1. **Graveyard fuel loops:** escape, retrace, dredge, wheel, and self-mill engines need a graveyard resource model before proof.
2. **Stack-copy/buyback loops:** copy effects need target legality, whether the copy can copy the original spell, and buyback/additional-cost payment.
3. **Combat continuity:** extra combat loops need an attacker/damage source that survives and untaps, plus enough resource generation to pay for the next combat.
4. **Finite threshold wins/locks:** lock, infinite turns, alternate-win, protection/prevention, and library-access labels are now more visible in taxonomy but still need separate finite-package proof semantics.
5. **Variable-count engines:** creature-count or land-count mana sources should not be treated as positive without a conservative lower bound from package-local permanents.
6. **Token subtype conversion:** Food, Clue, Treasure, land, and creature token loops need subtype-specific costs/results to avoid false positives.
7. **Subject-sensitive feedback:** opponent-only, you-only, each-player, and target-player draw/life/damage triggers must remain distinct; G003/G005 covered fixed-lifeloss, counter-neutral lifelink/counter/damage, noncombat damage→draw, and finite opponent-draw threshold subsets only.
8. **Library/deck-wide effects:** draw-the-game, put-all-lands/creatures/artifacts onto the battlefield, cast-all-spells, ventures/dungeons, and mass recursion labels need non-loop outcome modeling before they can be safely treated as detections.

## Regression expectations for any fix

- Add positive and negative unit tests for every new generalized family/capability.
- Add or update hardening/validation fixtures for the new family.
- Rerun `node ./analysis/edhrec-combos/evaluate-edhrec-combos.js` and report before/after counts.
- Keep `npm run no-hardcode:interactions` and `npm run hardening:interactions` passing.
- Do not introduce runtime branches keyed on card names from this document.
