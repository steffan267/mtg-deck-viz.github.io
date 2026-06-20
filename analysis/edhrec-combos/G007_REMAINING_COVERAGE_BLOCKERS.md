# G007 remaining EDHREC coverage blockers

Generated for ultragoal story G007 after the full evaluator run at `2026-06-19T21:38:32.889Z`.

## Result

100% combo detection remains unsafe to claim. The engine reached:

- strict proved bucket: **649 / 54,710**;
- proof-status `proven`: **641**;
- expected result-class coverage: **31,857 / 54,161 (58.8%)**;
- proof-only expected coverage: **1,878 / 54,161 (3.5%)**;
- combo-family detected: **65.7%**.

G007 safely added generalized families for counter-token ETB-counter loops, same-turn delayed mill finishers, -1/-1 counter death-token loops, and lifegain/counter/token ETB loops. No runtime/evaluator card-name matching was introduced.

## Exhaustive blocker reconciliation

Every row with mapped EDHREC expected classes but no model overlap is assigned exactly one blocker:

| Blocker | Count | Meaning |
| --- | ---: | --- |
| `no-current-signal` | 12,406 | Current classifier/proof graph has no usable generalized family/edge signal. |
| `proof-size-bound` | 4,409 | Combo needs proof beyond the current bounded package limit or larger state model. |
| `generic-edge-no-result-class` | 3,030 | A graph edge exists, but mapping it to a combo result class would inflate coverage. |
| `semantic-system-needed-classified` | 2,231 | A family/edge signal exists, but strict proof/result-axis semantics are missing. |
| `missing-card-data` | 221 | At least one card in the combo row does not resolve locally. |
| `proved-result-axis-mismatch` | 7 | A strict proof exists, but its generalized result axis does not match EDHREC's labels. |
| **Total** | **22,304** | Matches `summary.expectedClassCoverage.missedAll`. |

Resolved-only blocker counts exclude `missing-card-data` and reconcile to **22,083**.

## Top blocker details

### `no-current-signal` — 12,406

Dominant missed classes: `infinite-etb` 4,776; `infinite-mana` 4,502; `infinite-ltb` 3,738; `infinite-cast` 2,605; `infinite-tokens` 2,305; `infinite-untap` 2,183.

Representative systems requiring new semantics:

- stack/bounce/replay loops;
- escape/graveyard fuel loops;
- landfall, land-token, and land-play loops;
- variable board-count mana loops;
- combat/connect/extra-combat sequencing.

### `proof-size-bound` — 4,409

Dominant missed classes: `infinite-etb` 1,936; `infinite-cast` 1,462; `infinite-ltb` 1,317; `infinite-mana` 1,270; `infinite-tokens` 1,223.

These rows are often 4+ card packages. Raising the cap alone is unsafe without better state pruning/resource accounting.

### `generic-edge-no-result-class` — 3,030

Dominant missed classes: `infinite-etb` 1,556; `infinite-mana` 1,196; `infinite-tokens` 1,099; `infinite-ltb` 816; `infinite-life` 793; `infinite-counters` 741.

These are deliberately not counted as covered: generic edges can show synergy but not repeatability/payment/target legality.

### `semantic-system-needed-classified` — 2,231

Dominant missed classes: `lock` 921; `infinite-turns` 776; `infinite-etb` 414; `infinite-ltb` 316; `infinite-mana` 279.

The classifier sees relevant structure, but proof needs missing systems such as turn locks, stack recursion, replacement/prevention effects, or combat phase sequencing.

### `missing-card-data` — 221 expected misses

These cannot be evaluated until the local card index resolves the missing card rows.

### `proved-result-axis-mismatch` — 7

These have strict proof evidence, but EDHREC labels ask for axes the proved family does not claim. The evaluator keeps these visible rather than broadening the family result classes.

## Safe next work candidates

The fanout review found no third broad safe class after the implemented G007 families. Remaining high-volume clusters require new semantic systems rather than more label mapping.

Prioritized future systems:

1. variable board-count mana with explicit threshold assumptions;
2. landfall/land-token/land-play resource model;
3. stack recursion and spell-copy/recast accounting;
4. escape/graveyard fuel accounting;
5. combat/connect/extra-combat sequencing;
6. lock/turn-prevention proof model;
7. larger-card-count proof search with pruning and regression snapshots.

## 2026-06-20 G013 split update

The broad G007 umbrella is superseded for scheduling by explicit replacement stories. The first replacement slice (`G013`) safely added strict combat-resource extra-combat and artifact-token extra-turn proof families without card-name matching.

Fresh evaluator after G013 (`2026-06-20T13:32:24.696Z`):

- detailed combos evaluated: **54,710**;
- local card resolution: **54,367 / 54,710**;
- strict proved bucket: **1,087**;
- proof-status `proven`: **1,079**;
- combo-family detected: **65.4%**;
- expected result-class coverage: **31,663 / 54,161 (58.5%)**;
- proof-only expected coverage: **2,303 / 54,161 (4.3%)**.

The expected result-class coverage is lower than the previous G006 snapshot because unsafe raw combat-resource edge-result mappings were removed; those rows now require strict proof instead of signal inflation. This is a safety improvement, not a regression in proved coverage.

Remaining G007 replacement stories:

1. `G014` Breath-of-Fury-style combat-damage aura reattachment loops.
2. `G015` fresh-token attack-trigger extra-combat/extra-turn loops.
3. `G016` counter-threshold/proliferate extra-turn loops.
4. `G017` lock/prevention turn-structure systems.
5. `G019` reconciliation of the split replacement set and residual unsafe cases.

## 2026-06-20 G014 split update

The second replacement slice (`G014`) added strict proof support for
Breath-of-Fury-style combat-damage Aura reattachment loops without broadening
raw graph-edge result mappings.

Fresh evaluator after G014 (`2026-06-20T15:10:57.299Z`):

- detailed combos evaluated: **54,710**;
- local card resolution: **54,367 / 54,710**;
- strict proved bucket: **1,090**;
- proof-status `proven`: **1,082**;
- combo-family detected: **65.4%**;
- expected result-class coverage: **31,666 / 54,161 (58.5%)**;
- proof-only expected coverage: **2,306 / 54,161 (4.3%)**.

The strict family proved three real EDHREC rows: Breath of Fury + Legion
Warboss, Breath of Fury + Goblin Rabblemaster, and Breath of Fury + Harried
Dronesmith. The family proves only local Aura reattachment, established-loop
state, combat-damage connection, carrier sacrifice, legal hasty next-carrier
continuity, untap/reset, and extra-combat semantics. Conditional, first-combat,
wrong-timing, non-hasty, generic board-state, and attack-trigger token engines
stay unresolved for later replacement stories.

Remaining G007 replacement stories after G014:

1. `G015` fresh-token attack-trigger extra-combat/extra-turn loops.
2. `G016` counter-threshold/proliferate extra-turn loops.
3. `G017` lock/prevention turn-structure systems.
4. `G019` reconciliation of the split replacement set and residual unsafe cases.

## 2026-06-20 G015 split update

The third replacement slice (`G015`) added strict proof support for fresh hasty
copy-token extra-combat loops. The implementation is proof/package-only: the
old capability-only evaluator path for `combat-copy-token→extra-combat-loop`
was removed, and the old/new fresh-copy combat families are not mapped through
raw graph-edge result classes.

Fresh evaluator after G015 (`2026-06-20T16:03:32.690Z`):

- detailed combos evaluated: **54,710**;
- local card resolution: **54,367 / 54,710**;
- strict proved bucket: **1,096**;
- proof-status `proven`: **1,088**;
- combo-family detected: **65.4%**;
- expected result-class coverage: **31,672 / 54,161 (58.5%)**;
- proof-only expected coverage: **2,312 / 54,161 (4.3%)**.

The strict proof slice covers:

- `combat-copy-token→extra-combat-loop`: precombat hasty creature copy plus
  attack-trigger extra combat;
- `hasty-copy→attack-extra-combat-loop`: activated/attached hasty creature copy
  plus attack-trigger extra combat;
- `combat-copy-token→connect-extra-combat-loop`: precombat hasty creature copy
  plus combat-damage-to-player extra combat;
- `hasty-copy→connect-extra-combat-loop`: activated/attached hasty creature
  copy plus combat-damage-to-player extra combat.

Together these families prove eleven real EDHREC rows, including the
Helm/Aurelia/Godo/Combat Celebrant rows, Kiki-Jiki or Splinter Twin plus
Combat Celebrant/Port Razer rows, Rionya plus Port Razer or Bloodthirster, and
Feldon plus Combat Celebrant plus Determined Iteration. The proof requires
legal copy targets, haste, legend safety, pre-attack timing, unused fresh-token
attack/connect triggers, attacker declaration, source reset for tapping copy
sources, and explicit player/opponent connect preconditions where applicable.

Remaining G007 replacement stories after G015:

1. `G016` counter-threshold/proliferate extra-turn loops.
2. `G017` lock/prevention turn-structure systems.
3. `G019` reconciliation of the split replacement set and residual unsafe cases.

Residual/deferred from G015:

- Attacker extra-turn copy loops remain unresolved until the turn-cycle model
  can prove repeatability safely.
- Medomai-style “can't attack during extra turns”, Wanderwine-style optional
  sacrifice/fodder dependencies, tapped-and-attacking copy tokens,
  first-combat-only engines, random copy counts, non-player combat damage, and
  next-combat attacker restrictions stay rejected or human-review residuals
  instead of being counted through unsafe graph signals.
