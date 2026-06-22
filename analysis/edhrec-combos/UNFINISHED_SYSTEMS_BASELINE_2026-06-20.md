# Unfinished systems baseline and implementation map — 2026-06-20

Source artifact: `analysis/edhrec-combos/edhrec-combo-evaluation.json`, generated at `2026-06-20T05:20:36.909Z` by:

```sh
node ./analysis/edhrec-combos/evaluate-edhrec-combos.js
```

## Fresh baseline

| Metric | Value |
| --- | ---: |
| EDHREC detailed combos evaluated | 54,710 |
| Fully resolved locally | 54,367 / 54,710 |
| Strict proved bucket | 667 |
| Proof-status `proven` | 659 |
| Combo-family detected | 65.8% |
| Signal/result-class coverage | 31,875 / 54,161 (58.9%) |
| Proof-only expected coverage | 1,896 / 54,161 (3.5%) |

## Reconciled blocker partition

Every row with mapped EDHREC expected classes but no model overlap is assigned one blocker:

| Blocker | Rows |
| --- | ---: |
| `no-current-signal` | 12,402 |
| `proof-size-bound` | 4,409 |
| `generic-edge-no-result-class` | 3,016 |
| `semantic-system-needed-classified` | 2,231 |
| `missing-card-data` | 221 |
| `proved-result-axis-mismatch` | 7 |
| **Total** | **22,286** |

## Subsystem-ranked implementation map

The table below assigns each uncovered row to the first matching subsystem by expected result class and current family/capability signals. Rows are overlapping in reality, so subsystem counts are planning weights rather than mutually exclusive rules for runtime logic.

| Rank | Subsystem | Planning weight | Dominant blockers | Representative rows |
| ---: | --- | ---: | --- | --- |
| 1 | Variable board-count mana/resources | 8,220 | `no-current-signal` 4,013; `generic-edge-no-result-class` 1,904; `proof-size-bound` 1,194; `semantic-system-needed-classified` 1,065 | The Reaver Cleaver + Aggravated Assault; Staff of Domination + Priest of Titania; Staff of Domination + Elvish Archdruid |
| 2 | Stack/spell recursion + escape/graveyard | 6,498 | `no-current-signal` 3,268; `proof-size-bound` 1,916; `semantic-system-needed-classified` 702; `generic-edge-no-result-class` 488 | Hullbreaker Horror + Sol Ring; Underworld Breach + Lion's Eye Diamond + Wheel of Fortune; Underworld Breach + Wheel of Fortune + Jeska's Will |
| 3 | Lock/turn/combat/prevention | 4,459 | `no-current-signal` 3,016; `proof-size-bound` 669; `semantic-system-needed-classified` 397; `generic-edge-no-result-class` 345 | Sword of Feast and Famine + Aggravated Assault; The One Ring + Displacer Kitten + Teferi, Time Raveler; Vraska, Betrayal's Sting + Vorinclex, Monstrous Raider |
| 4 | Landfall / land-play resources | 1,472 | `no-current-signal` 816; `proof-size-bound` 493; `generic-edge-no-result-class` 117 | Springheart Nantuko + Tireless Provisioner; Springheart Nantuko + Lotus Cobra; Springheart Nantuko + Dryad Arbor + Tireless Provisioner + Lotus Cobra |
| 5 | Token/ETB/LTB/death/sacrifice residual loops | 1,489 | `no-current-signal` 1,161; `generic-edge-no-result-class` 152; `proof-size-bound` 130 | The Mindskinner + Syr Konrad, the Grim; Abdel Adrian, Gorion's Ward + Animate Dead; Vito, Thorn of the Dusk Rose + Beacon of Immortality |
| 6 | Unassigned/mixed and data/axis cleanup | 148 plus data/axis blockers | Mostly `no-current-signal`, `missing-card-data`, `proved-result-axis-mismatch` | Residual labels that do not fit the first-pass subsystem rules |

## Current engine/proof architecture map

- `src/interaction-model.js` classifies card facts (`classify`) and generates pairwise graph edges (`interactionsBetween`). This is where generalized text-derived capabilities and pairwise family signals are born.
- `src/combo-family-library.js` is the durable family/result-axis library used by strict proof and EDHREC evaluator mappings.
- `src/semantic-proof-utils.js` centralizes card-name-agnostic resource/state proof primitives: capability facts, cap parsing, mana profiles/payment checks, and proof-delta-to-result-axis mapping.
- `src/interaction-proof-search.js` contains bounded strict proof recognizers (`prove*` families) and currently defaults to small package proofs; many `proof-size-bound` rows need a larger but pruned state search rather than a raw cap increase.
- `src/interaction-proof-packages.js` materializes product proof packages and hyperedge metadata for the UI.
- `analysis/edhrec-combos/evaluate-edhrec-combos.js` maps EDHREC result labels, graph families, strict proof deltas, and blockers; it must keep result-overlap separate from proof-only coverage.
- `test/no-combo-name-hardcoding.test.js` and `scripts/check-no-combo-name-hardcoding.js` protect the no-card-name-hardcoding constraint.

## Implementation sequence from this baseline

1. Add shared state/resource semantics first: normalized resources, repeatability guards, target legality predicates, zone transition predicates, and result-axis projection helpers.
2. Implement high-yield variable mana/resource loops and stack/spell recursion early because they dominate uncovered rows.
3. Add land-resource and lock/combat semantics after shared state primitives exist.
4. Add larger 4+ proof packages only with pruning/resource accounting; do not simply raise `maxCards` globally.
5. After each subsystem, run the full evaluator and update the blocker partition so newly exposed blockers can be steered into the plan.

## G004 stack/spell recursion update

Implemented two generalized, card-name-agnostic proof families:

- `escape-wheel-mana-loop`: graveyard-wide escape permission + discard-hand sacrifice mana + instant/sorcery wheel, with mana-cost accounting, face-sourced DFC cost handling, escape fuel accounting, and result-axis deltas for cast/storm/draw/looting/self-discard.
- `buyback-copy-ritual-loop`: buyback spell-copy + fixed ritual mana, requiring local spell-cost reduction or spellcast-mana support when the ritual does not pay the buyback copy cost alone.

Fresh evaluator after G004 (`2026-06-20T06:26:39.939Z`):

| Metric | Baseline | After G004 |
| --- | ---: | ---: |
| Strict proved bucket | 667 | 674 |
| Proof-status `proven` | 659 | 666 |
| Signal/result-class coverage | 31,875 / 54,161 (58.9%) | 31,878 / 54,161 (58.9%) |
| Proof-only expected coverage | 1,896 / 54,161 (3.5%) | 1,903 / 54,161 (3.5%) |

Representative newly proven generalized packages:

- Graveyard escape + discard-hand mana + seven-card wheel: covers infinite cast/storm, draw, and looting axes when the wheel replenishes enough escape fuel.
- Buyback spell-copy + five-mana ritual + red spell-cost reduction or spellcast-mana payoff: covers infinite cast/storm and, when positive, net mana.

Explicitly not generalized in G004:

- Variable external-threshold rituals such as opponent-hand or tapped-land mana remain rejected unless a later variable-resource subsystem proves the threshold safely.
- Bounce/cast loops that require implicit extra spells or outside permanents remain residual until a later subsystem can prove all loop pieces locally.

## G005 land-resource update

Implemented one generalized, card-name-agnostic proof family:

- `kodama-bounce-land-landfall-loop`: a permanent-ETB hand-dropper + a land that can bounce a land you control + a landfall payoff, with local repeatability proof that the bounce land can return itself and be replayed from hand. The proof projects infinite ETB, LTB, landfall, token, and mana axes only when those deltas are locally supported.

Fresh evaluator after G005 (`2026-06-20T07:03:20.722Z`):

| Metric | After G004 | After G005 |
| --- | ---: | ---: |
| Strict proved bucket | 674 | 952 |
| Proof-status `proven` | 666 | 944 |
| Combo-family detected | 65.8% | 66.3% |
| Signal/result-class coverage | 31,878 / 54,161 (58.9%) | 32,156 / 54,161 (59.4%) |
| Proof-only expected coverage | 1,903 / 54,161 (3.5%) | 2,181 / 54,161 (4.0%) |

Representative newly proven generalized packages:

- Permanent-ETB hand-dropper + bounce land + landfall Treasure/mana payoff: covers infinite ETB/LTB/landfall, token, and mana axes.
- Permanent-ETB hand-dropper + bounce land + landfall creature-token payoff: covers infinite ETB/LTB/landfall and token axes.
- Permanent-ETB hand-dropper + bounce land + landfall mana payoff: covers infinite ETB/LTB/landfall and mana axes.

Explicitly not generalized in G005:

- Two-card landfall rows that require an implicit enchanted/creature land or other nonlocal permanent remain residual until a later larger-package proof can prove every loop piece locally.

## G006 variable board-count/resource update

Implemented one generalized, card-name-agnostic proof family:

- `variable-board-count-mana-loop`: a variable board-count mana creature plus a repeatable creature-untap engine, with explicit minimum board-count threshold, target-legality checks, colored mana payment checks, engine reset cost accounting, and optional draw/lifegain/pump result axes only when locally supported.

Fresh evaluator after G006 (`2026-06-20T07:32:50.140Z`):

| Metric | After G005 | After G006 |
| --- | ---: | ---: |
| Strict proved bucket | 952 | 1,072 |
| Proof-status `proven` | 944 | 1,064 |
| Combo-family detected | 66.3% | 66.5% |
| Signal/result-class coverage | 32,156 / 54,161 (59.4%) | 32,236 / 54,161 (59.5%) |
| Proof-only expected coverage | 2,181 / 54,161 (4.0%) | 2,288 / 54,161 (4.2%) |

Representative newly proven generalized packages:

- Staff-style modal untap engines plus variable creature/tribe/power mana sources: covers infinite mana, untap, card draw, and lifegain when the threshold is met.
- Attached untap engines using an untap symbol or aura-style activation plus variable mana sources: covers infinite mana/untap and pump when the activation grows the creature.
- Real EDHREC rows now covered include Staff of Domination + Priest of Titania, Staff of Domination + Elvish Archdruid, Staff of Domination + Marwyn, and Umbral Mantle + Priest/Archdruid/Marwyn-style packages.

Explicitly not generalized in G006:

- Opponent-only count sources stay diagnostic-only and do not seed/prove board-count mana loops.
- Variable mana sources that cannot pay colored untap costs remain rejected.
- The proof is conditional: it records a `minimum-board-count` precondition and does not infer that an arbitrary deck state currently has the required count.

## G013 strict combat/turn-loop proof slice update

Implemented two generalized, card-name-agnostic proof families from the split G007 turn/combat umbrella:

- `combat-resource→extra-combat-loop`: combat-phase resource generation plus a repeatable extra-combat engine, with payment/color accounting, main-phase timing, connection preconditions, untap/reset checks, and a tap-state guard that rejects noncreature `{T}` extra-combat activators unless the activating source itself is reset.
- `artifact-token→extra-turn-loop`: deterministic turn-cycle artifact-token refill plus an artifact-sacrifice extra-turn engine, requiring enough artifact tokens each upkeep/turn cycle to pay the sacrifice threshold and rejecting once-per-turn activations, random/variable counts, end-step-only refill, nonartifact tokens, and replacement-amplified token counts.

Fresh evaluator after G013 (`2026-06-20T13:32:24.696Z`):

| Metric | After G006 | After G013 |
| --- | ---: | ---: |
| Strict proved bucket | 1,072 | 1,087 |
| Proof-status `proven` | 1,064 | 1,079 |
| Combo-family detected | 66.5% | 65.4% |
| Signal/result-class coverage | 32,236 / 54,161 (59.5%) | 31,663 / 54,161 (58.5%) |
| Proof-only expected coverage | 2,288 / 54,161 (4.2%) | 2,303 / 54,161 (4.3%) |

The family/signal coverage decrease is intentional: unsafe raw `combat-resource→extra-combat-loop` edge-result mappings were removed from the evaluator so combat-resource candidates require strict proof before covering EDHREC combat/result axes. Strict proof coverage increased while broad signal inflation decreased.

Representative newly proven generalized packages:

- Combat-damage/attack mana or Treasure production plus extra-combat activations that untap the relevant attackers and provide a legal postcombat main-phase payment window.
- Upkeep/turn-cycle artifact-token sources producing enough artifacts for an artifact-sacrifice extra-turn engine, proving only the `infinite-turns` axis unless a later local proof justifies other resources.

Explicitly not generalized in G013:

- Noncreature extra-combat engines with `{T}` activation costs are rejected unless a package-local reset of the tapped source is proven.
- Token-doubler/replacement-amplified artifact-token loops are rejected until a future replacement-effect proof can account for deterministic counts.
- End-step artifact-token sources and once-per-turn artifact-sacrifice turn engines are rejected because they do not prove per-extra-turn repeatability.
- Breath-of-Fury-style aura reattachment, fresh-token attack-trigger copies, counter-threshold extra turns, and lock/prevention systems were split into explicit follow-up stories instead of being counted under the broad G007 umbrella.

## G014 combat-sacrifice Aura strict proof update

Implemented one narrow, generalized, card-name-agnostic proof family:

- `combat-sacrifice-aura→extra-combat-loop`: an Aura-like attachment whose
  enchanted carrier deals combat damage to a player/opponent, sacrifices that
  carrier, reattaches to another creature you control, untaps/resets creatures,
  and adds another combat, paired with a deterministic beginning-of-combat hasty
  fresh carrier source. The proof requires an established loop state, a legal
  current carrier, a fresh carrier source distinct from the sacrificed carrier,
  a legal reattach target at trigger resolution, and records the combat-damage
  connection as a precondition.

Fresh evaluator after G014 (`2026-06-20T15:10:57.299Z`):

| Metric | After G013 | After G014 |
| --- | ---: | ---: |
| Strict proved bucket | 1,087 | 1,090 |
| Proof-status `proven` | 1,079 | 1,082 |
| Combo-family detected | 65.4% | 65.4% |
| Signal/result-class coverage | 31,663 / 54,161 (58.5%) | 31,666 / 54,161 (58.5%) |
| Proof-only expected coverage | 2,303 / 54,161 (4.3%) | 2,306 / 54,161 (4.3%) |

The strict family proved three real EDHREC rows:
Breath of Fury + Legion Warboss, Breath of Fury + Goblin Rabblemaster, and
Breath of Fury + Harried Dronesmith. The story adds the missing proof engine
semantics and regression suite without raw edge-result inflation.

Representative generalized package shape:

- Combat-sacrifice extra-combat Aura + deterministic beginning-of-combat hasty
  creature-token source from an established-loop state: covers only `combat`,
  `infinite-sacrifice`, `infinite-ltb`, `infinite-death`, and
  `infinite-untap` via strict proof deltas.

Explicitly not generalized in G014:

- Attack-trigger or tapped-and-attacking token carrier engines are
  deferred to `G015`.
- Conditional, first-combat-only, random, wrong-timing, and non-hasty carrier
  sources remain rejected.
- Generic “another creature exists” board-state assumptions, token surplus,
  mana, damage, and win-game result axes remain unclaimed.
- The evaluator still does not map this family through raw edge classes; strict
  proof is required before any result-class coverage is counted.

## G015 fresh-copy extra-combat and extra-turn strict proof update

Implemented a strict, generalized, card-name-agnostic proof slice for hasty
fresh-copy extra-combat and extra-turn loops. The story hardens
`combat-copy-token→extra-combat-loop` and adds:

- `hasty-copy→attack-extra-combat-loop`;
- `combat-copy-token→connect-extra-combat-loop`;
- `hasty-copy→connect-extra-combat-loop`.
- `combat-copy-token→attack-extra-turn-loop`;
- `combat-copy-token→connect-extra-turn-loop`;
- `hasty-copy→attack-extra-turn-loop`;
- `hasty-copy→connect-extra-turn-loop`.

The proof requires legal copy targets, hasty creature tokens, legend safety,
pre-attack token timing, unused per-token attack or combat-damage triggers,
attacker declaration, copy-source reset when the source tapped, and explicit
player/opponent connect preconditions for connect-trigger loops. Extra-turn
proof additionally requires repeated extra-turn legality and rejects
cannot-attack-extra-turns plus optional-payment/fodder-dependent turn triggers.

Fresh evaluator after G015 (`2026-06-20T16:58:11.637Z`):

| Metric | After G014 | After G015 |
| --- | ---: | ---: |
| Strict proved bucket | 1,090 | 1,097 |
| Proof-status `proven` | 1,082 | 1,089 |
| Combo-family detected | 65.4% | 65.4% |
| Signal/result-class coverage | 31,666 / 54,161 (58.5%) | 31,673 / 54,161 (58.5%) |
| Proof-only expected coverage | 2,306 / 54,161 (4.3%) | 2,313 / 54,161 (4.3%) |

Strict fresh-copy extra-combat proof rows:

- `combat-copy-token→extra-combat-loop`: 4 rows
  (`Aurelia, the Warleader + Helm of the Host`,
  `Godo, Bandit Warlord + Helm of the Host`,
  `Combat Celebrant + Helm of the Host`,
  `Rionya, Fire Dancer + Combat Celebrant`);
- `hasty-copy→attack-extra-combat-loop`: 3 rows
  (`Combat Celebrant + Kiki-Jiki, Mirror Breaker`,
  `Combat Celebrant + Splinter Twin`,
  `Feldon of the Third Path + Combat Celebrant + Determined Iteration`);
- `combat-copy-token→connect-extra-combat-loop`: 3 rows
  (`Port Razer + Helm of the Host`,
  `Rionya, Fire Dancer + Port Razer`,
  `Rionya, Fire Dancer + Bloodthirster`);
- `hasty-copy→connect-extra-combat-loop`: 2 rows
  (`Kiki-Jiki, Mirror Breaker + Port Razer`,
  `Port Razer + Splinter Twin`).

The evaluator no longer has capability-only result coverage for the old
combat-copy family, and none of the fresh-copy combat/turn families are mapped
through raw `EDGE_RESULT_CLASS_MAP` classes. Result coverage is proof/package
only. Extra-combat proof families project only `combat`, `infinite-etb`, and
`infinite-tokens`; extra-turn proof families project only `infinite-turns`.

Explicitly not generalized in G015:

- The extra-turn families are implemented generically, but the current full
  EDHREC corpus contributes zero real proof rows for them.
- Medomai-style “can't attack during extra turns”, Wanderwine-style optional
  sacrifice/fodder dependencies, tapped-and-attacking copy tokens, first-combat
  only engines, random copy counts, non-player combat damage, and next-combat
  attack restrictions are rejected or recorded as residual blockers.
- No fresh-copy combat/turn family claims damage, win, or broad mana/card
  result axes, and extra-turn families do not leak token, ETB, or combat axes.

## G016 counter-threshold/proliferate extra-turn strict proof update

The repo now has a conservative G016 slice for counter-threshold extra-turn
engines:

- `counter-threshold-doubler→extra-turn-loop`
- `counter-threshold-proliferate→extra-turn-loop`

The slice is intentionally narrow:

- only self-spending charge-counter extra-turn engines are in scope;
- the proof must state either an established threshold state or a seeded single
  counter state at loop entry;
- repeatable support must be package-local and zero-mana;
- both families project only `infinite-turns`.

This captures the generalized *shape* of seeded Scepter-style threshold loops
without counting mana-paid or ambient-board-state setups. The fresh full
evaluator (`2026-06-22T07:09:13.653Z`) shows **zero** real EDHREC proof rows
for these families, so corpus metrics stay unchanged even though the proof
infrastructure and regressions now exist.
