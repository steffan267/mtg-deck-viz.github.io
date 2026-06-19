# EDHREC combo evidence analysis design

## Goal

Use public EDHREC combo pages as an external evidence corpus for evaluating the
rulesbuilder's interaction/proof model. The scraper/cache and evaluator are
analysis tools; classifier/model code must stay generalized by Oracle text,
capabilities, events, and proof families rather than combo card names.

## Source shape

`https://edhrec.com/combos` exposes category links, including bracket-relevant
combo groups (`early-game-2-card-combos`, `late-game-2-card-combos`) and color
combo pages. Category pages render repeated combo summaries containing:

- card names
- card count (`2 card combo`, etc.)
- deck counts / eligible deck counts
- result labels such as `Infinite lifegain`, `Infinite colorless mana`,
  `Win the game`
- Commander bracket link markers
- `View combo details` links

Detail pages expose more analysis-useful fields:

- card names
- prerequisites
- ordered steps
- results
- metadata (`DECKS`, eligible deck denominator, rank)
- Commander bracket notes
- Commander Spellbook outbound link

## Local artifacts

Planned ignored artifacts under `analysis/edhrec-combos/`:

- `edhrec-combo-cache.json` — fetched category and detail evidence records.
- `edhrec-combo-evaluation.json` — machine-readable evaluation of model behavior.
- `edhrec-combo-evaluation.md` — human-readable baseline and edge-case report.

Planned tracked tools/tests:

- `analysis/edhrec-combos/fetch-edhrec-combos.js` — polite/resumable scraper.
- `analysis/edhrec-combos/evaluate-edhrec-combos.js` — offline evaluator.
- `analysis/edhrec-combos/evidence-card-names.json` — generated EDHREC card-name
  evidence for the no-hardcoding guard in clean checkouts.
- tests for parser/evaluator behavior with fixed HTML/fixture data.

## Evaluation approach

For each cached combo record:

1. Resolve each card through the local card index (`loadCards`).
2. Build normalized model nodes using the existing classifier/build pipeline.
3. Run bounded proof search (`provePackage`) and proof-package generation where
   card count is within current bounds.
4. Compare model outputs to EDHREC result labels by family `resultClasses` from
   `src/combo-family-library.js`, not by exact card names.
5. Report detected/proven/no-proof/missing-data buckets and deduped edge-case
   shapes.

## Hardcoding guard

Card names may appear in scraped cache, output reports, and regression fixtures.
New model/classifier logic must use text-derived facts only: events,
capabilities, costs, trigger conditions, repeatability, and resource deltas.
`npm run no-hardcode:interactions` scans core classifier/proof files using the
tracked EDHREC evidence snapshot plus an optional local cache, with normalized
case/punctuation matching so lowercase card-name branches are still caught.
