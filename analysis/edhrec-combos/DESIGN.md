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
- `edhrec-combo-tag-decks.json` — fetched `/tags/combo` commander aggregate
  pages, stored as average-deck approximations for engine scoring.
- `edhrec-combo-tag-deck-evaluation.json` — machine-readable score summary for
  those combo-tag average decks.

Tracked tools/tests:

- `analysis/edhrec-combos/fetch-edhrec-combos.js` — polite/resumable scraper.
- `analysis/edhrec-combos/evaluate-edhrec-combos.js` — offline evaluator.
- `analysis/edhrec-combos/fetch-edhrec-combo-tag-decks.js` —
  `/tags/combo` aggregate commander/cardlist downloader.
- `analysis/edhrec-combos/evaluate-edhrec-combo-tag-decks.js` —
  timeout-safe average-deck scorer. It defaults to a top-card slice because
  EDHREC tag pages expose recommendation pools, not exact 100-card lists.
- `analysis/edhrec-combos/evidence-card-names.json` — generated EDHREC card-name
  evidence for the no-hardcoding guard in clean checkouts.
- tests for parser/evaluator behavior with fixed HTML/fixture data.

## Combo tag average-deck corpus

`https://edhrec.com/tags/combo` is separate from `https://edhrec.com/combos`.
The combo pages are card-combo evidence. The tag page is aggregate deck evidence:
it exposes combo-tagged commanders and tag-filtered commander cardlists through
`https://json.edhrec.com/pages/tags/combo.json` and
`https://json.edhrec.com/pages/commanders/<slug>/combo.json`.

Use this path when we want to iterate on deck-plan, commander-plan, score, graph,
and combo-detection behavior over decks that EDHREC users identify as combo
decks:

```bash
npm run fetch-edhrec-combo-tag-decks -- --delay-ms 25 --fresh --force
npm run evaluate-edhrec-combo-tag-decks -- --max 20 --deck-card-limit 20 --timeout-ms 15000
npm run report:score-corpus
```

The fetched corpus is resumable and local-only. On 2026-06-26 it discovered 33
combo tag/color pages and 784 unique commander average lists with zero fetch
failures. The first top-20/top-20-card score slice evaluated 19 decks, timed out
on `K'rrik, Son of Yawgmoth`, detected combos in 7 decks with 11 combo pairs,
and left several obvious combo commanders at low/no detected cohesion. Those
timeouts and low-recognition rows are iteration targets, not failures of the
download path.

The first post-corpus interaction iteration added a generalized
cast-threshold spell-copy engine for Stella Lee-style Oracle text plus
cantrip-untap loop edges. On the same top-20/top-20-card slice, combo-tag
recognition moved from 7 to 8 detected combo decks, combo pairs moved from 11
to 14, and median cohesion moved from 14 to 16 while median win score stayed 27.
`Stella Lee, Wild Card` moved from 0 cohesion / 0 combo pairs to 72 cohesion /
3 combo pairs. The remaining no-combo rows in that slice are the next audit
queue: Breya, Vivi, Rograkh/Silas, Sisay, Kefka, Krenko, Korvold,
Thrasios/Tymna, Kenrith, Fire Lord Azula, and Celes.


## Current full-corpus baseline

As of the 2026-06-19 50% coverage bridge run, the scraper fetched 34 EDHREC combo categories, 54,714 unique combo summaries, and 54,710 evaluable rows. The local evaluator resolves 54,367 rows (99.4%) against the checked-in card index.

The evaluator now reports three deliberately separate coverage levels:

- **Strict proof:** bounded proof/package logic proves 543 rows.
- **Proof-only expected result-class coverage:** bounded proofs/packages match at least one EDHREC expected class in 1,771/54,160 rows (3.3%).
- **All generalized-signal result coverage:** bounded proofs plus generalized interaction edge-family result axes match at least one EDHREC expected class in 31,764/54,160 classified expected-result rows (58.6%). On the user-facing target metric, 31,642/54,367 fully resolved combos have result-overlap detection (58.2%).

The edge-family bridge is an offline evaluator diagnostic over existing generalized engine edges. It does not change runtime classifier matching rules, does not add card-name exceptions, and does not promote an edge signal into a strict proof.

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
5. Compare existing interaction edge families to axis-specific result classes in
   the analysis-only `EDGE_RESULT_CLASS_MAP`. For example, a sacrifice/body edge
   can explain sacrifice/death/LTB axes, while a landfall edge can explain
   landfall axes. This bridge is result-overlap evidence only; it is reported
   separately from strict proof/package coverage.
6. Report partially unmapped EDHREC result labels so taxonomy gaps are visible
   even when another label on the same combo is classified.
7. Report detected/proven/no-proof/missing-data buckets and deduped edge-case
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
