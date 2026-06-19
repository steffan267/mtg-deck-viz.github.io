# EDHREC combo missing-interaction plan

Generated from the clean full-corpus EDHREC run on 2026-06-19.

This document records the missing interaction families exposed by the current EDHREC combo corpus. Card names are evidence examples only; runtime classifier/proof changes must stay generalized by Oracle text, capabilities, events, costs, target legality, repeatability, and resource deltas.

## Corpus baseline

Source artifacts are local/ignored because they are large:

- Fetch command: `node ./analysis/edhrec-combos/fetch-edhrec-combos.js --all --delay-ms 25 --force`
- Evaluation command: `node ./analysis/edhrec-combos/evaluate-edhrec-combos.js`
- Cache: `analysis/edhrec-combos/edhrec-combo-cache.json`
- Evaluation report: `analysis/edhrec-combos/edhrec-combo-evaluation.{json,md}`

Clean fetch/evaluation result after the current G005 coverage iteration:

- EDHREC categories discovered: **34**
- Unique combo summaries fetched: **54,714**
- Fetch failures: **0**
- Evaluable combos with card names and result labels: **54,710**
- All cards resolved locally: **54,367/54,710** (99.4%)
- Bounded proof/package successes: **543/54,710** (1.0%), up from **527** at the previous pushed baseline and **508** before G003.
- Combo-family detection: **2,013 signal hits**, **3.6%** combo-level detection, up from **1,997** hits at the previous pushed baseline.
- Expected result-class coverage: **1,771/49,532** (3.6%), up from **1,750** covered rows while using a stricter taxonomy denominator.
- Proof-only expected result-class coverage: **1,768/49,532** (3.6%).
- Result-label taxonomy gaps are now explicit: **41,877** combos contain **61,236** unmapped EDHREC label instances, led by `Infinite LTB`, `Infinite landfall triggers`, `Lock`, and `Infinite turns`.
- Unresolved buckets:
  - `generic-edge-only`: **23,607**
  - `bounded-out`: **17,620**
  - `missed`: **12,594**
  - `missing-card`: **343**
  - `classified-not-proven`: **3**

### G003 generalized slice completed

The first iteration intentionally targeted conservative, high-signal variants that could be proved without card-name branches:

- fixed-amount lifegain-to-opponent-lifeloss triggers now participate in `lifegain-lifeloss-loop`;
- nonland-permanent mana amplifiers that add one mana of any type produced now support break-even colorless self-untappers when the amplified source is a compatible nonland permanent;
- `lifelink-counter-damage-loop` now proves the lifelink + gain-counter + counter-to-damage creature pattern with a creature-target legality gate; it reports infinite damage/life only because the loop spends and restores the same counter rather than growing counters without bound.

Regression coverage added positive and negative unit tests, proof-package tests, evaluator fixtures, validation corpus rows, and hardening/no-hardcode checks. The validation corpus is now **46** cases (**24** positive, **22** negative) with 100% sampled recall/precision.

### G004/G005 generalized slices completed

The current iteration added only generalized text/capability/proof logic:

- EDHREC result-label taxonomy now reports partially unmapped labels and adds safe aliases for `opponent/player loses the game` and `Infinite self-mill`.
- Divine-Visitation-style replacement-only token modifiers now get `is-token-replacement-modifier` and a non-combo `token-production→replacement` edge without broadening creature-token replacement loop proofs.
- Proven packages now contribute fact-gated result classes from their `positiveDeltas`, so a proof can expose demonstrated resources such as draw, damage, casts, deaths, sacrifices, lifegain, or opponent life loss without broadening a whole family globally. Delta-derived classes are now gated by both directional positivity and an explicit per-family `resultClasses`/`proofDeltaResultClasses` contract.
- `aristocrats-body-outlet-payoff` now emits payoff-specific deltas for death-drain, death-draw, and death-token variants.
- Draw/damage feedback recognizes source-controlled noncombat damage draw payoffs, and compound ETB/opponent-draw punisher triggers are preserved for threshold win packages.
- Added `life-paid-treasure-recursive-drain-loop`, a bounded family for recursive cast bodies plus life-paid Treasure sacrifice outlets plus death-drain lifegain payoffs. It requires package-local mana coverage, life-payment replenishment, and any type-control recursion precondition; it does not treat life-paid Treasure outlets as free mana outlets.

## Missing result classes

Counts below are EDHREC expected result-class instances still missed after all current model signals. One combo can contribute to multiple classes.

| Missed expected result class | Missed class instances |
| --- | ---: |
| infinite-etb | 36,240 |
| infinite-death | 24,359 |
| infinite-sacrifice | 22,999 |
| infinite-mana | 20,137 |
| infinite-cast | 13,001 |
| infinite-tokens | 12,985 |
| infinite-counters | 8,833 |
| infinite-life | 7,012 |
| infinite-draw | 5,961 |
| infinite-untap | 5,295 |
| infinite-damage | 5,044 |
| mill | 2,977 |
| infinite-opponent-life-loss | 2,410 |
| combat | 1,877 |
| win | 1,687 |
| empty-library | 476 |
| bounce-loop | 432 |
| exile-loop | 205 |

Overlapping high-level clusters from the same unresolved rows:

| Cluster | Approx unresolved combos | Representative examples |
| --- | ---: | --- |
| ETB/death/sacrifice/token/reanimation loops | 37,446 | landfall token loops; recursive creature/sacrifice engines; copy-token loops |
| Mana/cast/storm loops | 27,868 | cast-trigger bounce/replay; escape/ritual loops; buyback/copy loops |
| Counter/life/damage feedback | 16,897 | life-payment damage loops; opponent-draw damage/counter punishers; remaining subject-specific feedback variants |
| Draw/untap/threshold engines | 10,536 | top-of-library draw loops; big-mana untap engines; noncreature-spell blink/draw loops |
| Mill/exile/library/win mapping | 3,023 | self-mill fuel loops; finite mill thresholds; library-exile/play-until-end-of-turn loops |
| Combat/extra-combat engines | 1,867 | extra-combat payment loops; combat-damage treasure engines; Helm-style combat token loops |
| Unmapped EDHREC labels | 41,877 combos / 61,236 label instances | LTB, landfall, lock, infinite turns, self-discard, scry/surveil/looting, protection/prevention |

## Ranked generalized opportunities

### 1. Cast-trigger bounce / replay mana loops

**Observed gap:** high-deck-count rows where a cast trigger bounces a permanent, a cheap or mana-positive permanent is replayed, and the loop yields mana/storm/cast triggers. Current generic graph edges do not promote this to a proof family.

**Example evidence:** Hullbreaker/Tidespout-style bounce engines with Sol Ring or Mana Vault; noncreature-spell blink/reset variants with a mana rock and draw permanent.

**Proposed generalized model additions:**

- capability for cast-trigger bounce/reset of a permanent you control;
- conservative replayability gate for nonland permanents whose mana output covers recast cost;
- package family for positive mana delta plus repeatable cast trigger;
- result classes: `infinite-mana`, `infinite-cast`, possibly `infinite-draw` when a reset draw permanent is in-package.

**Regression gates:** require a true cast-trigger reset source, a recastable permanent, positive package-local mana, and target legality. Do not treat one-shot bounce spells or arbitrary mana rocks as loops.

### 2. Graveyard escape / recast fuel loops

**Observed gap:** many Underworld Breach-style rows are `generic-edge-only` or `missed`. The engine lacks graveyard fuel accounting, escape/exile costs, and self-mill/draw/discard recast accounting.

**Example evidence:** self-mill plus escape/recast loops with ritual mana, wheels, or mill payoffs.

**Proposed generalized model additions:**

- capability for casting nonland cards from graveyard with an exile/fuel cost;
- resource model for graveyard cards gained/lost per loop;
- proof family requiring package-local fuel generation plus mana cost coverage;
- result classes: `infinite-cast`, `infinite-mana`, `mill`, `infinite-draw` when the loop source produces those events.

**Regression gates:** avoid assuming an arbitrary graveyard is infinite; require positive or replenished graveyard fuel and package-local mana.

### 3. Landfall self-replacement / land-token loops

**Observed gap:** landfall rows that make tapped land tokens or mana are entirely missed because token typing and land ETB/resource accounting are too shallow.

**Example evidence:** landfall creates land tokens or mana, which creates more landfall triggers.

**Proposed generalized model additions:**

- capability for landfall-triggered land-token creation;
- land-token ETB event production and tapped/untapped distinction;
- landfall mana/resource deltas when a land enters;
- result classes: `infinite-tokens`, `infinite-etb`, `infinite-mana` where mana-positive.

**Regression gates:** require the generated token to actually be a land or an explicit land ETB source. Do not infer landfall loops from generic token creation.

### 4. Recursive body + sacrifice/reanimation engines

**Observed gap:** unresolved rows dominate `infinite-death`, `infinite-sacrifice`, and `infinite-etb`. Existing proof handles some recursive body/mana cases, and G005 now covers life-paid Treasure recursive-drain loops, but the engine still misses body-fodder, reanimation-payment, artifact-recursion, and replacement variants.

**Example evidence:** recurring creature plus sacrifice outlet plus death/life/token/mana payoff; reanimation artifact/enchantment payment loops.

**Proposed generalized model additions:**

- richer recursive-body facts: cast-from-graveyard, return-from-graveyard, death-triggered reanimation, replacement-return;
- body-fodder accounting for loops that require another creature/token;
- package-local mana/payment profile for reanimation costs;
- result classes: `infinite-death`, `infinite-sacrifice`, `infinite-etb`, `infinite-mana`, `infinite-life` depending on local payoffs.

**Regression gates:** require explicit replenishment or reanimation and explicit payment source. Do not treat arbitrary death triggers as recursive.

### 5. Token-subtype replacement and sacrifice loops

**Observed gap:** Food/Clue/Treasure/replacement loops often have pair edges but no family because token subtype, replacement cardinality, and sacrifice/payoff semantics are missing.

**Example evidence:** token replacement plus Food/Clue/Treasure sacrifice; token creation converted into card draw or mana.

**Proposed generalized model additions:**

- typed token production for Food, Clue, Treasure, creature, and land tokens;
- replacement/cardinality effects that create additional typed tokens;
- costed sacrifice of typed tokens into draw/mana/life;
- result classes: `infinite-tokens`, `infinite-draw`, `infinite-mana`, `infinite-etb`.

**Regression gates:** preserve subtype gates; Food cannot pay Clue-only costs, Treasure cannot imply card draw without an explicit conversion.

### 6. Life/loss/damage/counter feedback variants

**Observed gap:** G003 now covers fixed lifegain→opponent-lifeloss, nonland mana amplification, and lifelink/counter/damage creature loops that restore the spent counter. G005 also covers noncombat damage→draw feedback and compound opponent-draw threshold punishers. Remaining rows are broader variants: life-payment damage loops, opponent-draw damage/counter result accounting beyond threshold wins, true counter-growth variants, each-player subject mismatches, and finite kill packages that lack a repeatable resource cycle.

**Example evidence:** life-payment damage that triggers lifegain, opponent draw creating damage/counters, and subject-sensitive draw/life/damage loops.

**Proposed generalized model additions:**

- subject-aware event conversions among damage, lifegain, life loss, and counters;
- lifelink/damage source modeling for repeatable sources;
- payment-affordability gate for life-payment engines;
- result classes: `infinite-life`, `infinite-opponent-life-loss`, `infinite-damage`, and only `infinite-counters` when a future generalized proof demonstrates net counter growth.

**Regression gates:** keep opponent-only, your-only, and each-player subjects separate. Do not prove finite kill packages as repeatable loops unless a repeatable resource cycle exists.

### 7. Spell-copy, buyback, and stack-object loops

**Observed gap:** stack-copy rows are `missed` or `generic-edge-only`; the engine lacks copy-object targeting and buyback/ritual threshold semantics.

**Example evidence:** copy a creature-copy spell; ritual plus buyback/copy; spell recursion blink loops.

**Proposed generalized model additions:**

- copy-spell-target and copy-permanent-token facts;
- buyback/additional-cost payment model;
- stack object can copy/recur the spell that created it, gated by target legality;
- result classes: `infinite-cast`, `infinite-etb`, `infinite-tokens`, `infinite-mana`.

**Regression gates:** require explicit copyable spell target and positive payment threshold; avoid assuming all spell-copy effects can target themselves.

### 8. Big-mana threshold untap and modal artifact engines

**Observed gap:** rows with costed untap/draw/life modes and variable creature/permanent mana sources are missed because current proof only handles simple self-untap/amplifier shapes.

**Example evidence:** Staff-style engines with mana creatures that produce more than the untap cost.

**Proposed generalized model additions:**

- variable mana-source cardinality facts (e.g. mana per creature/type/permanent);
- costed modal ability sequencing: untap, draw, gain life;
- threshold proof comparing package-local lower-bound mana production to activation costs;
- result classes: `infinite-mana`, `infinite-untap`, `infinite-draw`, `infinite-life`.

**Regression gates:** require a conservative lower bound above the threshold; break-even or unknown-count sources remain unproven.

### 9. Extra-combat payment loops

**Observed gap:** combat rows are mostly missed: combat damage or equipment creates mana/tokens, pays for extra combat, untaps attackers, repeats.

**Example evidence:** extra-combat enchantments/equipment plus Treasure/damage mana sources or token-copy combat sources.

**Proposed generalized model additions:**

- extra-combat activation/payment capability;
- combat-damage-to-mana/token event conversion;
- attacker/untap continuity gate;
- result classes: `combat`, `infinite-mana`, `infinite-tokens`, `infinite-untap`.

**Regression gates:** require a connected attacker or equipment-bearing creature and enough combat-damage resource to pay the next combat. Do not assume all extra-combat cards are repeatable.

### 10. Result-label mapping and non-loop finite/lock packages

**Observed gap:** 5,865 unresolved rows have EDHREC labels not mapped to current expected classes or proof families: lock, infinite turns, self-discard, protection/prevention, direct alternate wins, library play/exile access, and similar labels.

**Proposed generalized model additions:**

- expand evaluator result-class mapping for common EDHREC labels (`infinite-turns`, `lock`, `self-discard`, `protection/prevention`, `play-from-exile/library-access`);
- separate finite threshold packages from repeatable loops;
- add human-review buckets for labels that cannot be safely proven from local text.

**Regression gates:** evaluator mappings must not inflate runtime proof coverage; they should improve diagnosis and direct later generalized families.

## Recommended G003 implementation order

1. **Done in G003:** low-risk proof-family extensions for fixed lifegain/lifeloss, nonland mana amplification, and lifelink-counter damage loops.
2. **Evaluator/result taxonomy next:** add missing non-runtime result classes and diagnostics so later gains are measured correctly.
3. **Token subtype accounting:** Food/Clue/Treasure/land token distinctions that unlock several clusters without relying on names.
4. **Recursive sacrifice/reanimation variants:** continue only with strict payment/replenishment gates.
5. **Threshold engines:** big-mana untap and extra-combat loops only after conservative lower-bound resource accounting is in place.
6. **High-complexity stack/graveyard/cast-reset loops:** bounce/replay, escape/fuel, buyback, and stack-copy families need dedicated regression suites before enabling.

Every implementation slice must update unit tests, hardening/validation fixtures, EDHREC evaluation output, and `analysis/edhrec-combos/EDGE_CASES.md` before it is considered complete.
