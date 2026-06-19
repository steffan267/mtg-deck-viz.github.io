# EDHREC combo missing-interaction plan

Generated from the clean full-corpus EDHREC run on 2026-06-19.

This document records the missing interaction families exposed by the current EDHREC combo corpus. Card names are evidence examples only; runtime classifier/proof changes must stay generalized by Oracle text, capabilities, events, costs, target legality, repeatability, and resource deltas.

## Corpus baseline

Source artifacts are local/ignored because they are large:

- Fetch command: `node ./analysis/edhrec-combos/fetch-edhrec-combos.js --all --delay-ms 25 --force`
- Evaluation command: `node ./analysis/edhrec-combos/evaluate-edhrec-combos.js`
- Cache: `analysis/edhrec-combos/edhrec-combo-cache.json`
- Evaluation report: `analysis/edhrec-combos/edhrec-combo-evaluation.{json,md}`

Clean fetch/evaluation result after the 50% coverage bridge iteration:

- EDHREC categories discovered: **34**
- Unique combo summaries fetched: **54,714**
- Fetch failures: **0**
- Evaluable combos with card names and result labels: **54,710**
- All cards resolved locally: **54,367/54,710** (99.4%)
- Bounded proof/package successes: **543/54,710** (1.0%), up from **527** at the previous pushed baseline and **508** before G003.
- Combo-family/edge signal detection: **61,840 signal hits** across **65.5%** of combos.
- Resolved-combo result coverage target metric: **31,642/54,367** (58.2%), exceeding the 50% target of **27,184** by **4,458** combos.
- Expected result-class coverage across all generalized signals: **31,764/54,160** (58.6%).
- Proof-only expected result-class coverage remains separately reported at **1,771/54,160** (3.3%).
- Remaining result-label taxonomy gaps are now explicit: **5,104** combos contain **5,760** unmapped EDHREC label instances, led by `Draw the game`, all-land/all-creature library movement, graveyard recursion, artifact/land copy labels, and dungeon/venture labels.
- Current buckets:
  - `classified-not-proven`: **20,454**
  - `bounded-out`: **17,620**
  - `missed`: **12,594**
  - `generic-edge-only`: **3,156**
  - `proved`: **543**
  - `missing-card`: **343**

Before the 50% run, the comparable resolved-combo result-overlap metric was **1,771/54,367** (3.26%). The lift comes from generalized interaction-edge/result-axis evidence in the offline evaluator, not from card-name exceptions or looser strict proof semantics.

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

### 50% coverage bridge completed

The 50% run added a generalized, evaluator-only bridge from existing interaction edge families to EDHREC result classes:

- EDHREC result taxonomy now maps high-volume previously unmapped labels including LTB, landfall, blinking, scry, surveil, looting, rummaging, self-discard, proliferate, temporary pump, locks, turns, commander casts, and mass reanimation.
- `EDGE_RESULT_CLASS_MAP` maps existing engine edge families to their own result axes. Sacrifice/body edges can explain death/sacrifice/LTB axes; blink edges can explain blink/ETB/LTB axes; landfall edges explain landfall axes; draw/discard/counter/combat/bounce edges only explain their own axes.
- The evaluator reports edge-derived coverage as result-overlap classification, not strict proof. Strict proof remains the bounded package/proof system and is still reported separately.
- Regression tests cover positive and negative result-class bridge behavior so an edge that explains sacrifice/LTB does not explain unrelated mana or other axes.

## Missing result classes

Counts below are EDHREC expected result-class instances still missed after all current model signals. One combo can contribute to multiple classes.

| Missed expected result class | Missed class instances |
| --- | ---: |
| infinite-mana | 17,747 |
| infinite-etb | 12,354 |
| infinite-cast | 10,864 |
| infinite-tokens | 9,295 |
| infinite-ltb | 8,279 |
| infinite-counters | 7,248 |
| infinite-life | 6,261 |
| infinite-death | 5,030 |
| infinite-damage | 4,979 |
| infinite-untap | 4,937 |
| infinite-draw | 4,732 |
| lock | 4,289 |
| infinite-landfall | 4,009 |
| infinite-sacrifice | 3,733 |
| infinite-turns | 2,913 |
| mill | 1,929 |
| infinite-scry | 1,857 |
| infinite-opponent-life-loss | 1,733 |
| win | 1,687 |
| infinite-pump | 1,465 |
| infinite-self-discard | 1,414 |
| combat | 1,085 |
| infinite-blink | 1,023 |
| infinite-surveil | 829 |
| infinite-looting | 782 |
| empty-library | 476 |
| bounce-loop | 432 |
| infinite-rummage | 368 |
| infinite-proliferate | 265 |
| exile-loop | 205 |
| mass-reanimate | 186 |

Overlapping high-level clusters from rows that still lack result-overlap detection:

| Cluster | Approx unresolved combos | Representative examples |
| --- | ---: | --- |
| Cast/mana/storm reset/fuel loops | 9,949 | cast-trigger bounce/replay; escape/ritual loops; buyback/copy loops |
| Token/count-growth loops | 9,443 | landfall token loops; recursive creature/sacrifice engines; copy-token loops |
| Life/lifeloss/damage/win feedback | 5,199 | life-payment damage loops; opponent-draw damage/counter punishers; subject-specific feedback variants |
| Combat/turn/lock engines | 4,857 | extra-combat payment loops; combat-damage treasure engines; turn/lock loops |
| Untap/bounce/exile/library loops | 3,555 | big-mana untap engines; cast-trigger bounce; library-exile/play-until-end-of-turn loops |
| Counter/proliferate/pump loops | 2,629 | true counter-growth and temporary-size loops requiring monotonic growth semantics |
| Draw/loot/rummage/scry/surveil/discard loops | 2,271 | top-of-library draw loops; wheel/discard fuel; all-player subject-sensitive draw |
| Landfall/land-token loops | 1,934 | landfall-created land tokens and typed land ETB loops |
| Mill/graveyard/recursion loops | 509 | self-mill fuel loops; mass recursion labels; graveyard escape/recast |
| Blink/flicker/reset loops | 540 | noncreature-spell blink reset, spell-recursion blink, and repeatability/accounting gaps |
| Remaining unmapped EDHREC labels | 5,104 combos / 5,760 label instances | draw-the-game, all-library movement, artifact/land copies, ventures/dungeons, protection/prevention |

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

## Recommended next implementation order

1. **Done in G003:** low-risk proof-family extensions for fixed lifegain/lifeloss, nonland mana amplification, and lifelink-counter damage loops.
2. **Done in G004/G005:** taxonomy diagnostics, token replacement edges, proof-delta result classes, draw/damage feedback, threshold opponent-draw wins, and life-paid Treasure recursive-drain loops.
3. **Done in the 50% coverage bridge:** evaluator result taxonomy expansion plus edge-family/result-axis bridge, lifting resolved-combo result-overlap coverage from **3.26%** to **58.2%** without changing strict proof counts.
4. **Next proof-family work:** cast-trigger bounce/replay and graveyard escape/fuel systems, because the largest remaining uncovered cluster is cast/mana/storm reset/fuel loops.
5. **Then token subtype/count-growth accounting:** Food/Clue/Treasure/land token distinctions and conservative count-growth lower bounds.
6. **Then recursive sacrifice/reanimation variants:** continue only with strict payment/replenishment gates.
7. **Then threshold engines:** big-mana untap and extra-combat loops only after conservative lower-bound resource accounting is in place.
8. **High-complexity stack/graveyard/cast-reset loops:** buyback and stack-copy families need dedicated regression suites before enabling.

Every implementation slice must update unit tests, hardening/validation fixtures, EDHREC evaluation output, and `analysis/edhrec-combos/EDGE_CASES.md` before it is considered complete.
