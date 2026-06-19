# EDHREC strict proof coverage audit

Generated during ultragoal G002.

## Definition: strict proof

In this repo, **strict proof** means a bounded, generalized proof package can explain the loop from text-derived facts: repeatability, target legality, costs/resources, and positive deltas. It is intentionally stricter than EDHREC result overlap or graph edge detection.

A combo can therefore be:

- **proved**: bounded proof package exists.
- **classified-not-proven / generic-edge-only**: interaction signals or result axes overlap, but repeatability/cost legality was not proven.
- **missed**: no current generalized signal explains the combo.
- **bounded-out**: package is outside the current proof search card limit.


## Fresh corpus result after G008

Source: `analysis/edhrec-combos/edhrec-combo-evaluation.json` from `node ./analysis/edhrec-combos/evaluate-edhrec-combos.js`, generated at `2026-06-19T22:08:32.209Z`.

| Metric | Value |
| --- | ---: |
| Detailed combos | 54,710 |
| Fully resolved against local card index | 54,367 |
| Strict proved bucket | 667 |
| Proof-status `proven` | 659 |
| Proof-only expected class coverage | 1,896 / 54,161 = 3.5% |
| Signal/result expected class coverage | 31,875 / 54,161 = 58.9% |
| Combo family detected | 65.8% |
| Missing local cards | 343 combos |
| Bounded-out rows | 17,620 bucket / 17,641 proof status |

G008 increased strict proved rows from the G007 checkpoint of 649 to 667 after the final carrier-assembly review fix. The new family is `death-untap-deathtouch-pinger-lock`, a generalized lock proof for free tap-only pingers plus death-trigger untap plus deathtouch. It is guarded by regression tests for mana-costed pingers and once-per-turn death-untap effects, and split intrinsic roles across different creatures.

## Fresh corpus result after G002

Source: `analysis/edhrec-combos/edhrec-combo-evaluation.json` from `node ./analysis/edhrec-combos/evaluate-edhrec-combos.js`.

| Metric | Value |
| --- | ---: |
| Detailed combos | 54,710 |
| Fully resolved against local card index | 54,367 |
| Strict proved bucket | 572 |
| Proof-status `proven` | 564 |
| Proof-only expected class coverage | 1,800 / 54,161 = 3.3% |
| Signal/result expected class coverage | 31,781 / 54,161 = 58.7% |
| Combo family detected | 65.6% |
| Missing local cards | 343 combos |
| Bounded-out rows | 17,620 bucket / 17,641 proof status |

G001 checkpoint baseline was 549 strict proved and 1,777 proof-only covered expected classes. G002 increased that to 572 strict proved and 1,800 proof-only covered expected classes without card-name hardcoding.

## Generalized proof additions in G002

All additions are capability/text driven; runtime and evaluator logic do not match specific card names.

1. **Broader hasty creature-copy spell proof**
   - Existing family: `spell-copy-etb→creature-copy-spell-loop`.
   - Added support for direct wording such as “create a token that is a copy of target creature ... haste”.
   - Tightened proof/evaluator/graph target legality: the ETB spell copier must be a nonlegendary creature so the copied creature can safely recreate the loop.

2. **Paired/attached draw-damage feedback**
   - Existing family: `draw-damage-feedback-loop`.
   - Added explicit damage-to-draw scopes (`source-you-control`, `enchanted-creature`, `equipped-creature`, `this-creature`, `paired-creature-grant`).
   - This proves source-controlled/soulbond/attachment-style damage → draw loops only when the draw-triggered damage source is a legal source. A separate `this creature deals damage → draw` payoff is now rejected because it does not apply to another creature's damage.

3. **Self-copying targeted spell plus magecraft drain**
   - New family: `self-copy-spell→magecraft-drain-loop`.
   - Proves targeted spells that let the target copy the spell and retarget it, paired with payoffs that trigger on copied instant/sorcery spells and drain/gain life.
   - Result axes: `infinite-cast` for the existing magecraft taxonomy, `infinite-life`, `infinite-opponent-life-loss`.

4. **Cost-reduced self-untapping mana artifact**
   - Existing family: `self-untap-mana-loop`.
   - Adds activated-ability cost-reducer support when the reducer applies to the self-untapping artifact and the effective untap cost is below mana output.
   - Respects “cannot reduce below one mana” text through an explicit minimum-cost cap.

5. **Combat token-copy equipment plus fresh-token extra combats**
   - New family: `combat-copy-token→extra-combat-loop`.
   - Proves combat-start Equipment/token-copy effects that create hasty nonlegendary copies of attackers whose fresh-token attack creates the next combat.
   - Handles first-attack-per-turn and fresh exert-token wording.

6. **ETB spell copier plus death-copy creature spell**
   - New family: `death-copy-spell-etb-copy-loop`.
   - Proves nonlegendary creature ETB spell copiers with instant/sorcery text that destroys target creature and creates two token copies if it dies.
   - G005 aligned graph target legality with strict proof so legendary/noncreature ETB spell copiers do not emit combo-critical product edges.

## High-impact rows now strictly proved

Representative rows now proved by generalized mechanics:

- Dualcaster-style ETB spell copier + broad hasty creature-copy spell rows, including direct “copy target creature” wording.
- Niv-Mizzet-style draw/damage loops with Aura, source-controlled, and paired-creature damage-to-draw text.
- Chain/copy-spell + magecraft drain loops.
- Basalt/Grim Monolith-style self-untap mana loops with artifact activated-ability reducers.
- Helm-style combat token-copy + extra-combat attacker loops.

Top examples from the current corpus include rows with deck counts 70,780; 64,706; 57,193; 50,072; 45,125; 41,865; 36,585; 32,601; 29,212; 26,077; 24,796; 24,407; 23,707; 23,270; 21,100; and 20,539.

## Why 100% strict proof is not currently safe

The top remaining unproved rows are not merely missing regexes. They need semantic systems or hidden state the bounded proof engine does not currently model:

| Remaining cluster | Example | Why not strict-proved now |
| --- | --- | --- |
| Bounce/recast storm | Hullbreaker Horror + Sol Ring | Needs another spell/permanent bounce state or stack sequencing not represented by the listed two-card package. |
| Escape/graveyard fuel loops | Underworld Breach + LED/Lotus Petal + Brain Freeze/Wheel | Needs graveyard fuel accounting, escape costs, self-mill feedback, and sometimes discard/draw replacement semantics. |
| Landfall/token attachment loops | Springheart Nantuko + Tireless Provisioner/Lotus Cobra | Needs land/token-copy attachment, land-play timing, payment, and landfall resource semantics. |
| Variable creature-count mana | Staff of Domination + Priest of Titania/Elvish Archdruid/Marwyn | Requires proving enough controlled creature/type count; listed package alone often does not establish the count. |
| Recursive creature packages with tribal/precondition state | Gravecrawler / Pitiless Plunderer / sac outlet rows | Some rows require an external Zombie or support permanent not present in the listed cards; proving them would be unsafe without board-state facts. |
| One-shot blink recursion | Ghostly Flicker + Peregrine Drake + Archaeomancer | Requires stack/card-return target sequencing and spell recursion beyond the current repeatability model. |
| Damage replacement / global damage chains | Blasphemous Act + Repercussion, Blowfly Infestation rows | Needs simultaneous damage/state-based-action and target distribution semantics. |
| Multi-card artifact recursion | Scrap Trawler / Myr Retriever / KCI / reducer rows | Often bounded out at >3 cards and needs artifact mana-value recursion ordering. |

## Regression guardrails added

- Positive and negative fixtures for every G002 proof change.
- Legendary/noncreature near-miss tests for creature-copy spell loops.
- Scope-gated damage-to-draw tests to prevent “different source” false positives.
- Non-drain magecraft near miss for self-copying spells.
- Non-extra-combat attacker near miss for combat-copy Equipment.
- Cost-reducer proof requires an applicable activated-ability reduction and positive net mana.
- Product proof-package seeds now cover all new G001/G002 families, including life-paid damage, exile-recast, self-copy magecraft, combat-copy, death-copy, and cost-reduced self-untap packages.
- G005 hardening rejects tapped/sacrificial/once-per-turn life-paid damage sources, origin-bound exile-cast permissions, and detection-only exile mana claims.

## Current safe conclusion

Strict proof coverage is improved but cannot honestly reach 100% with the current bounded proof model. The remaining path to materially higher strict proof coverage is not more label mapping; it is adding new semantic subsystems for escape/graveyard fuel, stack spell recursion, landfall/land-play resources, variable board counts, combat damage, and larger-card-count artifact recursion.
