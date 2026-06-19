# EDHREC combo fanout review

Generated during ultragoal G005 on 2026-06-19.

## Fanout lanes

| Lane | Role | Result | Resolution |
| --- | --- | --- | --- |
| Review | `code-reviewer` | Found unsafe false-positive surfaces for life-paid damage, origin-bound exile casting, proof/detection mana leakage, and missing product proof-package seeds. | Fixed in runtime/proof/evaluator/package tests. |
| Architecture | `architect` | Blocked on product path: `provePackage()` recognized new families but `buildInteractionProofPackages()` did not seed them, so UI/static `interactionProofs` omitted proven combos. | Added bounded seed candidates and package regressions. |
| Test | `test-engineer` | Identified missing direct proof/model/product regressions and build/no-hardcode coverage gaps. | Added proof-search, model, evaluator, and proof-package tests; final build/no-hardcode gates remain in G010. |
| Explorer | `explorer` | Confirmed no card-name hardcoding and flagged doc drift plus parser-limited future opportunities. | Added this durable fanout record and kept future parser broadening out of scope unless proof gates support it. |

## Changes made from fanout findings

### Product proof-package path aligned

`src/interaction-proof-packages.js` now seeds candidates for the newly proven families and related reducer support:

- `self-copy-spell→magecraft-drain-loop`
- `life-paid-damage-lifeloss-recovery-loop`
- `exile-recast-creature-mana-loop`
- `combat-copy-token→extra-combat-loop`
- `death-copy-spell-etb-copy-loop`
- cost-reduced `self-untap-mana-loop`

Regression coverage in `test/interaction-proof-packages.test.js` asserts both seeding and emitted product packages.

### False-positive surfaces tightened

- Life-paid damage sources are only tagged when the activation is repeatable by current proof semantics: no tap/untap symbol, no sacrifice/discard/exile cost, and no once-per-turn/sorcery-speed activation clause.
- Exile recursion now distinguishes unrestricted `cast this card from exile` from origin-bound/conditional permissions such as `if it was foretold`; only unrestricted permissions feed `exile-recast-creature-mana-loop`.
- Detection-only `exile-recast-creature-mana-loop` edge classes no longer claim `infinite-mana`; mana coverage comes from strict proof deltas.
- Draw-damage graph/proof gating no longer lets a separate `this creature deals damage → draw` card satisfy another creature's draw-triggered damage source.
- Death-copy graph edges now use the same nonlegendary creature target legality as strict proof.
- Artifact activated-ability cost reducers no longer also become generic `is-cost-reducer`, and graph edges are scoped to artifact activated abilities.

### Regression coverage added

Targeted tests now cover:

- direct model capabilities for life-paid damage, unrestricted vs origin-bound exile casting, creature-only exile mana outlets, death-copy spells, artifact activated-ability reducers, draw-damage scopes, and product proof-package seed surfaces;
- direct strict proof positives/negatives for life-paid damage recovery, exile-recast mana, death-copy spell loops, artifact reducer cost floor/non-artifact near misses, and draw-damage scope mismatch;
- evaluator guards for detection-only exile mana separation and non-repeatable life-paid/origin-bound exile near misses;
- no-card-name-hardcoding on changed core paths.

## Remaining deliberate limits

These are not fixed by G005 because they need new semantic systems, not safe regex broadening:

- attachment/equipment/pairing state is still represented as an assumption for some draw-damage loops;
- parser variants may recover additional rows later, but only after target/cost/repeatability gates exist;
- large-card-count, escape/fuel, stack recursion, landfall/land-play, variable-board-count, and artifact-recursion systems remain documented blockers.

## Verification evidence

Targeted verification after fanout fixes passed:

```text
node --check src/interaction-model.js && node --check src/interaction-proof-search.js && node --check src/interaction-proof-packages.js && node --check analysis/edhrec-combos/evaluate-edhrec-combos.js
node ./test/interaction-model.test.js
node ./test/interaction-proof-search.test.js
node ./test/interaction-proof-packages.test.js
node ./test/edhrec-combo-evaluator.test.js
node ./test/no-combo-name-hardcoding.test.js
```

All runtime/evaluator logic remains capability/text-derived; no card names or card pairs were hard-coded.
