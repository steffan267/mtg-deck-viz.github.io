# EDHREC combo edge cases

This file is a concise tracked snapshot of hard or currently missed combo shapes from the local EDHREC evidence run. It is evidence for future generalized rules, not a card-name exception list. The full local report is generated at `analysis/edhrec-combos/edhrec-combo-evaluation.md`.

## Current baseline

- Detailed combos evaluated: 120
- Proven by bounded proof/package logic: 29/120 (24.2%) — improved from 21/120 (17.5%) in the prior baseline and 13/120 (10.8%) before the first EDHREC pass.
- Combo-family detection: 24.2% — improved from 17.5%.
- Expected result-class coverage (all signals): 27/111 (24.3%) — improved from 21/111 (18.9%).
- Proof-only expected result-class coverage: 27/111 (24.3%); current signal coverage still intentionally does not count unproven capability-only hints.
- Remaining buckets: 49 missed, 38 generic-edge-only, 4 bounded-out.
- Newly covered generalized shapes this pass: colorless-mana amplifier + break-even self-untapper, mill↔life-loss feedback, opponent mass-draw punisher threshold wins, half-library mill + mill multiplier, mutual ETB blink reset with target-scope gates, and token-replacement + creature-sacrifice + death-mana loops.

## Hard categories

- **no current family/capability/proof signal** — 21 sampled unique combo shape(s). Examples: Hullbreaker Horror + Sol Ring; Springheart Nantuko + Tireless Provisioner; Underworld Breach + Lion's Eye Diamond + Wheel of Fortune.
- **generic pair edge(s) exist, but no known combo-family classification** — 16 sampled unique/partial combo shape(s). Examples: Exquisite Blood + Marauding Blight-Priest; Peregrin Took + Nuka-Cola Vending Machine; Dualcaster Mage + Molten Duplication.
- **EDHREC result labels need richer result-class mapping** — 3 sampled unique combo shape(s). Examples: Narset's Reversal + Isochron Scepter; The One Ring + Displacer Kitten + Teferi, Time Raveler; Vraska, Betrayal's Sting + Vorinclex, Monstrous Raider.

## Highest-priority edge cases

| Cards | EDHREC result labels | Current bucket | Why hard |
| --- | --- | --- | --- |
| Hullbreaker Horror + Sol Ring | Infinite colorless mana; Infinite storm count | missed | bounce/cast-reset loop needs stack, recast, and payment modeling |
| Springheart Nantuko + Tireless Provisioner | Infinite landfall triggers; Infinite tapped land tokens | missed | landfall creates token lands/resource loops; land-token typing and ETB accounting needed |
| Underworld Breach + Lion's Eye Diamond + Wheel of Fortune | Infinite draw triggers; Infinite looting; Infinite looting for opponents; Near-infinite storm count | missed | graveyard escape/fuel loop needs graveyard-count, discard/draw, and recast-cost accounting |
| Underworld Breach + Wheel of Fortune + Jeska's Will | Infinite draw triggers for all players; Infinite looting for all players; Near-infinite magecraft triggers; Near-infinite storm count | missed | graveyard escape/fuel plus ritual mana; outside current bounded resource semantics |
| Springheart Nantuko + Lotus Cobra | Infinite landfall triggers; Infinite tapped land tokens | missed | landfall self-replacement with mana production needs land-token and payment proof |
| Hullbreaker Horror + Mana Vault | Infinite colorless mana; Infinite storm count | missed | same bounce/cast-reset family as Hullbreaker + Sol Ring |
| Exquisite Blood + Marauding Blight-Priest | Infinite lifegain triggers; Infinite lifeloss; Infinite lifegain | generic-edge-only | one side is lifegain→loss; the other is loss→lifegain variant not yet generalized broadly enough |
| Peregrin Took + Nuka-Cola Vending Machine | Infinite card draw; Infinite draw triggers; Near-infinite tapped Treasure tokens | generic-edge-only | Food/Clue/Treasure replacement plus token sacrifice/card draw loop needs token-subtype accounting |
| Aetherflux Reservoir + Exquisite Blood | Infinite damage; Infinite lifegain triggers | missed | life-payment/life-gain/damage loop needs payment affordability and life total accounting |
| Dualcaster Mage + Molten Duplication | Infinite LTB; Infinite ETB; Infinite sacrifice triggers; Infinite death triggers; Infinite creature tokens with haste; Infinite magecraft triggers | generic-edge-only | spell-copy creature-copy loop variant needs stack target/copy-object proof |
| Sensei's Divining Top + Aetherflux Reservoir + Bolas's Citadel | Infinite card draw; Infinite draw triggers; Near-infinite damage; Near-infinite lifegain; Near-infinite lifegain triggers; Near-infinite storm count | generic-edge-only | top-loop variant needs life-payment, library-top, and storm/lifegain payoff accounting |
| Walking Ballista + Heliod, Sun-Crowned | Infinite damage; Infinite lifegain; Infinite lifegain triggers | generic-edge-only | counter/lifelink/damage feedback loop needs counter payment and damage/lifegain subject model |
| Teferi, Time Raveler + Displacer Kitten + Sol Ring | Infinite card draw; Infinite draw triggers; Near-infinite colorless mana; Near-infinite storm count | missed | noncreature-spell blink reset with mana rock and draw permanent needs cast/blink/reset modeling |
| Orcish Bowmasters + Peer into the Abyss | Infinite +1/+1 counters on a creature; Near-infinite card draw for target opponent; Near-infinite damage; Near-infinite draw triggers for target opponent; Target opponent loses the game | missed | opponent draw punisher variant includes damage/counters, not just life-loss threshold |
| The Reaver Cleaver + Aggravated Assault | Infinite colored mana; Infinite combat damage; Infinite combat phases; Infinite mana creatures you control can produce; Infinite Treasure tokens; Infinite untap of creatures you control | missed | extra-combat treasure engine needs combat-damage connection and combat-phase payment proof |
| Ghostly Flicker + Peregrine Drake + Archaeomancer | Infinite blinking; Infinite ETB; Infinite landfall triggers; Infinite LTB; Infinite magecraft triggers; Infinite mana lands you control can produce; Infinite storm count | generic-edge-only | spell-recursion blink loop needs stack/spell-return and mana positivity across three pieces |
| Skirk Prospector + Goblin Warchief + Krenko, Mob Boss | Infinite commander casts; Infinite creature tokens with haste; Infinite death triggers; Infinite ETB; Infinite LTB; Infinite red mana; Infinite sacrifice triggers; Infinite storm count | generic-edge-only | tribal token factory plus cost reduction/sac mana needs count-growth and commander/cast accounting |
| Jeska's Will + Reiterate | Infinite magecraft triggers; Infinite red mana; Infinite storm count; Exile your library with playable exiled cards | missed | spell-copy buyback/ritual loop needs stack-copy and mana threshold semantics |
| Staff of Domination + Priest of Titania | Infinite card draw; Infinite draw triggers; Infinite lifegain; Infinite lifegain triggers; Infinite untap; Infinite green mana | missed | threshold untap engine needs variable mana source count and ability-cost sequencing |
| Nim Deathmantle + Ashnod's Altar | Infinite LTB; Infinite ETB; Infinite sacrifice triggers; Infinite death triggers | missed | death-triggered reanimation/payment loop needs reanimation replacement and body-fodder accounting |

## Next generalized families to investigate

- Bounce/cast-reset permanent loops: cast trigger bounces a mana source or free/cheap permanent, recast, repeat. Needs stack/payment modeling and mana-source replay constraints.
- Landfall token/mana self-replacement loops: landfall creates token lands or mana that creates more land ETBs. Needs land-token typing and landfall event accounting.
- Graveyard escape/recursion loops: self-mill plus recast from graveyard. Needs graveyard-fuel, exile-cost, and recast-cost accounting.
- Food/Clue/Treasure token-subtype loops: token replacement plus sacrifice/card-draw/mana payoff. Needs token-subtype and replacement cardinality accounting.
- Life-payment / life-damage loops: lifegain source plus life-payment or life-spend payoff. Needs payment affordability and opponent damage/life state modeling.
- Spell-copy / buyback / stack loops: copy effects that reproduce a spell, ETB, or ritual state. Needs stack target and copy object modeling.
- Big-mana threshold untap engines: mana producer plus costed untap/draw engine. Needs threshold proof rather than assuming all tap/untap pairs are positive.
- Extra-combat treasure/equipment engines: combat damage creates mana that pays for another combat. Needs combat phase, attacker connection, and mana/payment model.
