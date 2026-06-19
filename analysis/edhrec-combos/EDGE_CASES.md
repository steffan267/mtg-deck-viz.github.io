# EDHREC combo edge cases for human review

This tracked snapshot comes from the clean full-corpus EDHREC run on 2026-06-19. It records hard or currently missed combo shapes for future generalized rules. Card names are examples for review only, not runtime classifier exceptions.

The full local/generated report is `analysis/edhrec-combos/edhrec-combo-evaluation.md` and the machine-readable run is `analysis/edhrec-combos/edhrec-combo-evaluation.json`.

## Current baseline

- EDHREC categories discovered: **34**
- Unique combo summaries fetched: **54,714**
- Evaluable combos: **54,710**
- Local card resolution: **54,367/54,710** (99.4%)
- Proven by bounded proof/package logic: **543/54,710** (1.0%), up from **527** at the previous pushed baseline and **508** before G003.
- Combo-family detection: **2,013 signal hits** / **3.6%** combo-level detection.
- Expected result-class coverage: **1,771/49,532** (3.6%); proof-only coverage: **1,768/49,532** (3.6%).
- Result-label taxonomy gaps: **41,877** combos contain **61,236** unmapped label instances.
- Unresolved buckets: **23,607** generic-edge-only, **17,620** bounded-out, **12,594** missed, **343** missing-card, **3** classified-not-proven.

## Covered in G003-G005

These were previously in the hard-case list and are now covered by generalized rules, not card-name exceptions:

- fixed lifegain→opponent-lifeloss paired with opponent-lifeloss→lifegain;
- nonland-permanent mana amplifiers paired with compatible break-even colorless self-untappers;
- lifelink + lifegain-to-counter + counter-to-damage creature loops with target-legality checks, reported as damage/life loops only because the counter is spent and restored rather than grown without bound.
- replacement-only token modifiers now surface as non-combo token replacement edges without broadening token-replacement sacrifice loop proof semantics;
- Niv-style noncombat damage→draw feedback now proves through generic draw/damage capabilities;
- compound ETB/opponent-draw punishers now feed mass-draw threshold win packages;
- Warren/Gravecrawler/Blood-Artist-style loops now prove through `life-paid-treasure-recursive-drain-loop`, with explicit life-payment, Treasure-mana, and controlled-type precondition gates.

## Highest-priority hard cases

| Cards | EDHREC result labels | Current bucket | Proposed generalized gap |
| --- | --- | --- | --- |
| Hullbreaker Horror + Sol Ring | Infinite colorless mana; Infinite storm count | missed | cast-trigger bounce/replay with positive mana and storm/cast accounting |
| Underworld Breach + Lotus Petal + Brain Freeze | Infinite self-mill; Near-infinite magecraft triggers; Near-infinite mill | generic-edge-only | graveyard escape fuel, self-mill, and recast-cost accounting |
| Underworld Breach + Lion's Eye Diamond + Brain Freeze | Infinite self-mill; Near-infinite colored mana; Near-infinite magecraft triggers; Near-infinite mill; Near-infinite storm count | generic-edge-only | graveyard escape plus mana/fuel positivity |
| Springheart Nantuko + Tireless Provisioner | Infinite landfall triggers; Infinite tapped land tokens | missed | landfall-created land-token ETB loop; token typing needed |
| Underworld Breach + Lion's Eye Diamond + Wheel of Fortune | Infinite draw triggers; Infinite looting; Infinite looting for opponents; Near-infinite storm count | missed | wheel/discard/draw refills graveyard fuel for escape loop |
| Underworld Breach + Wheel of Fortune + Jeska's Will | Infinite draw triggers for all players; Infinite looting for all players; Near-infinite magecraft triggers; Near-infinite storm count | missed | escape/fuel plus ritual mana and all-player draw events |
| Springheart Nantuko + Lotus Cobra | Infinite landfall triggers; Infinite tapped land tokens | missed | landfall self-replacement with mana production and land-token accounting |
| Hullbreaker Horror + Mana Vault | Infinite colorless mana; Infinite storm count | missed | same cast-trigger bounce/replay family with mana-value/payment gate |
| Peregrin Took + Nuka-Cola Vending Machine | Infinite card draw; Infinite draw triggers; Near-infinite tapped Treasure tokens | generic-edge-only | Food/Clue/Treasure subtype conversion and token sacrifice/draw loop |
| Aetherflux Reservoir + Exquisite Blood | Infinite damage; Infinite lifegain triggers | missed | life-payment/damage/lifegain feedback with affordability gate |
| Dualcaster Mage + Molten Duplication | Infinite LTB; Infinite ETB; Infinite sacrifice triggers; Infinite death triggers; Infinite creature tokens with haste; Infinite magecraft triggers | generic-edge-only | spell-copy creature-copy stack loop with copy-object target legality |
| The Gitrog Monster + Dakmor Salvage | Infinite self-mill; Near-infinite self-discard triggers | missed | result taxonomy + self-discard/graveyard fuel loop modeling |
| Sensei's Divining Top + Aetherflux Reservoir + Bolas's Citadel | Infinite card draw; Infinite draw triggers; Near-infinite damage; Near-infinite lifegain; Near-infinite lifegain triggers; Near-infinite storm count | generic-edge-only | top-of-library plus life-payment and lifegain payoff accounting |
| Teferi, Time Raveler + Displacer Kitten + Sol Ring | Infinite card draw; Infinite draw triggers; Near-infinite colorless mana; Near-infinite storm count | missed | noncreature-spell blink reset with mana-positive recast and draw permanent |
| Razorkin Needlehead + Peer into the Abyss | Near-infinite damage to one opponent; Near-infinite draw triggers for target opponent; Near-infinite card draw for target opponent; Near-infinite lifeloss for target opponent | proved but result-class mismatch | finite opponent-draw threshold win is detected, but EDHREC near-infinite damage/draw/lifeloss labels need finite-vs-near-infinite result taxonomy |
| The Reaver Cleaver + Aggravated Assault | Infinite colored mana; Infinite combat damage; Infinite combat phases; Infinite mana creatures you control can produce; Infinite Treasure tokens; Infinite untap of creatures you control | missed | extra-combat treasure/equipment engine with combat damage payment continuity |
| Ghostly Flicker + Peregrine Drake + Archaeomancer | Infinite blinking; Infinite ETB; Infinite landfall triggers; Infinite LTB; Infinite magecraft triggers; Infinite mana lands you control can produce; Infinite storm count; Infinite untap of lands you control | generic-edge-only | spell-recursion blink loop with stack/spell-return and land mana positivity |
| Skirk Prospector + Goblin Warchief + Krenko, Mob Boss | Infinite commander casts; Infinite creature tokens with haste; Infinite death triggers; Infinite ETB; Infinite LTB; Infinite red mana; Infinite sacrifice triggers; Infinite storm count | generic-edge-only | token factory + cost reduction + sacrifice mana; needs count-growth accounting |
| Jeska's Will + Reiterate | Infinite magecraft triggers; Infinite red mana; Infinite storm count; Exile your library with playable exiled cards | missed | buyback/spell-copy ritual loop plus exile/play-access result mapping |
| Sword of Feast and Famine + Aggravated Assault | Infinite combat phases | missed | extra-combat payment loop with attacker damage/untap connection |
| Staff of Domination + Priest of Titania | Infinite card draw; Infinite draw triggers; Infinite lifegain; Infinite lifegain triggers; Infinite untap; Infinite green mana | missed | big-mana threshold untap/modal artifact engine |
| Blowfly Infestation + Nest of Scarabs | Infinite death triggers; Infinite ETB; Infinite LTB | generic-edge-only | counter/death/token replacement loop with creature death replenishment |
| Narset's Reversal + Isochron Scepter | Infinite turns; Lock | missed | result taxonomy for infinite turns/lock plus spell-copy/activation loop proof |
| Dualcaster Mage + Saw in Half | Infinite creature tokens; Infinite ETB; Infinite magecraft triggers; Infinite LTB; Infinite death triggers | missed | spell-copy/copy-token loop with death/ETB events |
| Aetherflux Reservoir + Bloodthirsty Conqueror | Infinite damage; Infinite lifegain triggers | missed | life-payment/lifegain feedback variant |
| Aurelia, the Warleader + Helm of the Host | Infinite combat phases; Infinite creature tokens with haste; Infinite ETB; Infinite mana creatures you control can produce; Infinite untap of creatures you control | missed | combat-token copy loop with nonlegendary/extra-combat target gates |
| Nim Deathmantle + Ashnod's Altar | Infinite LTB; Infinite ETB; Infinite sacrifice triggers; Infinite death triggers | missed | reanimation/payment body-fodder loop; needs death-trigger and replacement accounting |

## Human-review buckets

These categories are not good candidates for quick permissive rules. They need either richer semantics or explicit human acceptance criteria:

1. **Graveyard fuel loops:** escape, retrace, dredge, wheel, and self-mill engines need a graveyard resource model before proof.
2. **Stack-copy/buyback loops:** copy effects need target legality, whether the copy can copy the original spell, and buyback/additional-cost payment.
3. **Combat continuity:** extra combat loops need an attacker/damage source that survives and untaps, plus enough resource generation to pay for the next combat.
4. **Finite threshold wins/locks:** lock, infinite turns, alternate-win, protection/prevention, and library-access labels need evaluator taxonomy first, then separate finite-package proof semantics.
5. **Variable-count engines:** creature-count or land-count mana sources should not be treated as positive without a conservative lower bound from package-local permanents.
6. **Token subtype conversion:** Food, Clue, Treasure, land, and creature token loops need subtype-specific costs/results to avoid false positives.
7. **Subject-sensitive feedback:** opponent-only, you-only, each-player, and target-player draw/life/damage triggers must remain distinct; G003/G005 covered fixed-lifeloss, counter-neutral lifelink/counter/damage, noncombat damage→draw, and finite opponent-draw threshold subsets only.

## Regression expectations for any fix

- Add positive and negative unit tests for every new generalized family/capability.
- Add or update hardening/validation fixtures for the new family.
- Rerun `node ./analysis/edhrec-combos/evaluate-edhrec-combos.js` and report before/after counts.
- Keep `npm run no-hardcode:interactions` and `npm run hardening:interactions` passing.
- Do not introduce runtime branches keyed on card names from this document.
