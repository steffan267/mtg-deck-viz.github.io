# EDHREC combo evidence analysis design

## Goal

Use public EDHREC combo pages as an external evidence corpus for evaluating the
rulesbuilder's interaction/proof model. The scraper/cache and evaluator are
analysis tools; classifier/model code must stay generalized by Oracle text,
capabilities, events, and proof families rather than combo card names.

## Source shape

`https://edhrec.com/combos` exposes category links, including bracket-relevant
combo groups (`early-game-2-card-combos`, `late-game-2-card-combos`) and color
combo pages. Category pages render repeated combo summaries in their
`__NEXT_DATA__` payload and continue through
`https://json.edhrec.com/pages/combos/<category>-N.json` pagination. Those
summary records contain enough evidence for broad evaluation:

- card names
- card count (`2 card combo`, etc.)
- deck counts / eligible deck counts
- result labels such as `Infinite lifegain`, `Infinite colorless mana`,
  `Win the game`
- Commander bracket link markers
- `View combo details` links / stable detail paths

Detail pages expose additional analysis-useful fields for sampled/deep-dive
records:

- card names
- prerequisites
- ordered steps
- results
- metadata (`DECKS`, eligible deck denominator, rank)
- Commander bracket notes
- Commander Spellbook outbound link

The scraper treats malformed or schema-shifted category `__NEXT_DATA__` payloads
as completeness failures even when fallback HTML links still yield combo rows.
This keeps parser drift visible instead of silently presenting a partial corpus
as complete.

## Local artifacts

Ignored generated artifacts under `analysis/edhrec-combos/`:

- `edhrec-combo-cache.json` — fetched category and detail evidence records.
- `edhrec-combo-evaluation.json` — machine-readable evaluation of model behavior.
- `edhrec-combo-evaluation.md` — human-readable baseline and edge-case report.

Tracked tools/tests:

- `analysis/edhrec-combos/fetch-edhrec-combos.js` — polite/resumable scraper.
- `analysis/edhrec-combos/evaluate-edhrec-combos.js` — offline evaluator.
- `analysis/edhrec-combos/evidence-card-names.json` — generated EDHREC card-name
  evidence for the no-hardcoding guard in clean checkouts.
- tests for parser/evaluator behavior with fixed HTML/fixture data.


## Current full-corpus baseline

As of the 2026-06-19 G005 clean run, the scraper fetched 34 EDHREC combo categories, 54,714 unique combo summaries, and 54,710 evaluable rows. The local evaluator resolves 99.4% of those rows against the checked-in card index. After the current generalized coverage iteration, bounded proof/package logic proves 543 rows and detects 2,013 combo-family signals without runtime card-name branches. Expected result-class coverage is 1,771/49,532 (3.6%) with the stricter taxonomy denominator, and proof-only coverage is 1,768/49,532 (3.6%).

## Evaluation approach

For each cached combo record:

1. Resolve each card through the local card index (`loadCards`).
2. Build normalized model nodes using the existing classifier/build pipeline.
3. Run bounded proof search (`provePackage`) and proof-package generation where
   card count is within current bounds.
4. Compare model outputs to EDHREC result labels by family `resultClasses` from
   `src/combo-family-library.js` plus fact-gated bounded proof `positiveDeltas`.
   Delta-derived classes must be directionally positive and explicitly allowed
   by the family contract; they are never inferred from exact card names.
5. Report partially unmapped EDHREC result labels so taxonomy gaps are visible
   even when another label on the same combo is classified.
6. Report detected/proven/no-proof/missing-data buckets and deduped edge-case
   shapes.

## Hardcoding guard

Card names may appear in scraped cache, output reports, and regression fixtures.
New model/classifier logic must use text-derived facts only: events,
capabilities, costs, trigger conditions, repeatability, and resource deltas.
`npm run no-hardcode:interactions` auto-discovers current runtime interaction
logic files under `src/` (while excluding declarative combo-family examples) and
scans them using the tracked EDHREC evidence snapshot plus distinctive
multi-token/punctuated names from any optional local exhaustive cache. The
exhaustive cache contains card names that are also generic rules/model words
(for example common mechanics and layout terms), so single-token optional-only
names are excluded to avoid blocking generalized classifiers while the tracked
evidence snapshot still catches known high-value combo card names in clean
checkouts.
