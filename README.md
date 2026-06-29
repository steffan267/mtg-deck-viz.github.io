# MTG local card data + Commander deck context

This folder exists for one purpose: give future ChatGPT/Codex prompts a local, up-to-date Magic: The Gathering card database that can be searched quickly when making Commander deck suggestions.

## What is already downloaded

The local data in `data/out` was refreshed from Scryfall on **2026-06-14**.

Current local source:

- Scryfall bulk type: `oracle_cards`
- Scryfall source updated at: `2026-06-13T21:02:55.102+00:00`
- Raw file: `data/out/oracle-cards.json`
- Compact search file: `data/out/commander-search.json`
- Raw Oracle record count: `38178`
- Compact paper/Commander search card count: `33395`

`oracle_cards` is one canonical gameplay record per card concept. That is the right default for deckbuilding suggestions because it avoids duplicate printings while keeping names, rules text, colors, legalities, keywords, EDHREC rank, and Commander-relevant derived tags.

It does **not** try to preserve every printing, image, price, or purchase URL. If you ever need those, use a different Scryfall bulk type such as `default_cards`.

## Requirements

- Node.js 18+
- Network access only when refreshing from Scryfall
- No npm dependencies are required

## Refresh / verify all local card data

Run this when starting a future session if you want the newest Scryfall Oracle Cards data:

```bash
npm run build-data -- --force-download
```

This downloads current Scryfall bulk metadata, downloads the current `oracle_cards` file, and rebuilds `data/out/commander-search.json`.

If network is unavailable, the existing local files can still be used:

```bash
npm run build-data
```

## Make deck-suggestion context for ChatGPT/Codex

Use `mtg-deck-context` to produce a compact Markdown or JSON packet that is easy to paste into, or let Codex read during, a future prompt.

Examples:

```bash
node ./bin/mtg-deck-context.js --commander "The Wise Mothman" --theme mill --limit 120
node ./bin/mtg-deck-context.js --colors UB --theme "zombies,graveyard" --limit 100
node ./bin/mtg-deck-context.js --commander "Muldrotha, the Gravetide" --format json --limit 80
```

Useful options:

- `--commander <name>`: finds a commander-like card and uses its color identity.
- `--colors <WUBRG|C>`: manually restricts suggestions to a Commander color identity.
- `--theme <text|tag>`: adds one theme/tag. Repeat it or use comma-separated values.
- `--limit <number>`: controls how many cards are returned.
- `--format <markdown|json>`: Markdown for human/prompt context, JSON for programmatic use.

The tool filters to Commander-legal cards, respects Commander color identity, scores cards by theme/tag/text matches plus EDHREC rank, and includes a category summary for staples such as ramp, draw, removal, board wipes, graveyard, tokens, and lands.

## Suggested future prompt

When you open a new prompt one day, say something like:

> This repo is my local MTG deckbuilding data. First read `README.md`. Refresh with `npm run build-data -- --force-download` if I ask for current cards. Then use `node ./bin/mtg-deck-context.js --commander "COMMANDER NAME" --theme "THEME" --limit 120` to gather local card context before suggesting a Commander deck.

## Moxfield public bracket evidence corpus

Use these commands to build a per-bracket likes-descending public Commander sample for empirical scoring checks:

```bash
npm run fetch-bracket-sample
npm run cache-reference-decks
npm run analyze-bracket-sample
npm run report-bracket-analysis
```

What this does:

- `npm run fetch-bracket-sample` seeds each Moxfield bracket from its public likes-sorted page, keeps the inline bracket value when the page mixes bracket labels, then fills additional decks from the global likes leaderboard until each bracket bucket reaches 100 decks or the accessible source exhausts.
- `npm run cache-reference-decks` downloads the fetched sample's normalized decklists to `analysis/bracket/moxfield-reference-decks.json`, preserving resolved card / face data so repeated analysis can run locally without re-fetching every Moxfield deck.
- `npm run analyze-bracket-sample` runs the existing deck metrics / win-tuning analysis over the fetched sample and writes `analysis/bracket/moxfield-bracket-corpus.json`, reading `analysis/bracket/moxfield-reference-decks.json` first and falling back to the accessible network path only for cache misses.
- `npm run report-bracket-analysis` turns the analyzed corpus into reusable bracket-summary artifacts, including a centroid-based check of how well `{win, cohesion, self}` alone recover the source brackets.

Artifacts:

- `analysis/bracket/moxfield-bracket-sample-500.json` — fetched public sample plus counts/shortfalls metadata
- `analysis/bracket/moxfield-reference-decks.json` — local-only normalized decklist cache for the fetched reference sample (ignored by default)
- `analysis/bracket/moxfield-bracket-corpus.json` — analyzed corpus with win/cohesion/self-sufficiency/Game Changer output per deck
- `analysis/bracket/moxfield-bracket-report.md` — human-readable summary of source-bracket means plus exact / ±1 / coarse-bucket classifier accuracy
- `analysis/bracket/moxfield-bracket-report.json` — machine-readable version of the same analysis

Because Moxfield search and deck pages are Cloudflare-gated, these scripts rely on the same network-access path already used elsewhere in this repo and may still report source shortfalls when a bracket cannot be paged deeply enough from the accessible surfaces.

The 100-deck precon calibration sample uses the same local-cache path:

```bash
npm run cache-precon-reference-decks
npm run analyze-precon-reference-decks
```

That writes the local-only decklist cache to `analysis/bracket/precon-reference-decks.json` and reuses it when refreshing `data/wintuning-corpus.json`.


## Repository layout

- `src/`, `lib/`, `bin/`, and `scripts/` contain source files.
- `src/web/` is the Vue/Vite source for the GitHub Pages app.
- `data/` contains reusable card data, sample deck inputs, and generated Scryfall search files in `data/out/`.
- `analysis/` contains local-only research, calibration, reports, and improvement artifacts that are not page source.
- `docs/` is generated GitHub Pages output; `dist/` is intermediate Vite output.

## Files

- `bin/mtg-commander-search.js` — downloads Scryfall Oracle Cards and builds compact search data.
- `lib/build-commander-search.js` — transform/index logic for the compact card database.
- `bin/mtg-deck-context.js` — produces deck-suggestion context from the local database.
- `lib/search-commander-cards.js` — scoring/filtering logic used by the context CLI.
- `data/out/scryfall-bulk-metadata.json` — latest downloaded Scryfall bulk metadata.
- `data/out/oracle-cards.json` — raw Scryfall Oracle Cards data.
- `data/out/commander-search.json` — compact Commander-friendly search data.

## Validation

Run the full local QA gate:

```bash
npm run baseline:interaction:check
npm run validate:interactions:check
npm run validate:proofs:poc
npm run hardening:interactions
npm test
npm run check
```

Interaction-engine maintainers should also read `src/INTERACTION_ENGINE.md`.
It documents the ontology, combo-family contribution checklist, runtime vs
audit-only boundaries, validation thresholds, proof-payload budgets, and known
behavior notes for the rulesbuilder.

## Local proof review pipeline

This repo's interaction work is proof-first: the goal is not to retag Magic
cards, but to explain why cards interact and to measure progress by proof
coverage. The proof-review pipeline extends the existing deterministic Node
engine (`src/interaction-*` and `src/combo-family-library.js`) instead of
creating a parallel Python proof engine. Deterministic proof logic remains the
authority; review confidence is routing metadata, not truth.

The local review store lives under `analysis/proof-review/` as JSONL files:

- `cards.jsonl`
- `decks.jsonl`
- `interaction-candidates.jsonl`
- `proof-attempts.jsonl`
- `proof-reviews.jsonl`
- `proof-packages.jsonl`
- `engine-runs.jsonl`
- `golden-tests.jsonl`
- `llm-drafts.jsonl`

Run the local workflow with the Node CLI:

```bash
node ./bin/mtg-proofs.js sample
node ./bin/mtg-proofs.js run
node ./bin/mtg-proofs.js export-review --limit 20
# Optional local-only LLM drafting for unresolved proofs:
node ./bin/mtg-proofs.js draft-proofs --limit 10
node ./bin/mtg-proofs.js prepare-review-candidates --limit 100
node ./bin/mtg-proofs.js import-review analysis/proof-review/reviewed.candidates.jsonl
node ./bin/mtg-proofs.js promote-tests
npm test
```

`sample` records a representative local sample deck using existing Scryfall data
when available. `run` builds the existing deterministic graph/proof packages and
persists proven packages plus graph interactions that still need proof coverage.
Unexplained interactions become `NEEDS_REVIEW` records instead of being counted
as proven.

`export-review` writes compact Markdown and JSONL batches for manual ChatGPT
review. This is intentionally export/import only: the review lifecycle does not call
OpenAI, paid APIs, or cloud services. The optional `draft-proofs` command can
call only your configured local Ollama server. The review prompt tells the
reviewer to use only provided Oracle text and proof data, then return JSONL.
`import-review`
validates that JSONL shape before appending review records and updating local
statuses; malformed rows are rejected and are never auto-promoted.

`draft-proofs` is optional Phase 2 local assistance. It sends only local
`NEEDS_REVIEW` proof data to an Ollama server you run on your machine, asks for
strict JSON proof drafts, and stores results in `llm-drafts.jsonl`. Drafts that pass the local critic
are persisted as `REVIEW_READY`; malformed or unavailable-model responses are
persisted as `REJECTED` draft records with a failure reason, and critic failures
are persisted as `CRITIC_REJECTED`. Drafting never
changes a source proof to `ACCEPTED`, `DETERMINISTICALLY_PROVEN`, or
`PROMOTED_TO_TEST`; deterministic proof logic and manual review remain the only
routes toward accepted test fixtures.

`prepare-review-candidates` reduces review formatting overhead after local LLM
drafting. It reads latest `REVIEW_READY` drafts and writes import-compatible
`analysis/proof-review/reviewed.candidates.jsonl` plus a Markdown summary grouped
by risk bucket (`likely_accept`, `needs_human_rules_check`, `likely_reject`).
These files are still untrusted local-LLM suggestions: inspect or edit them
before running `import-review`. The command never imports, accepts, or promotes
proofs by itself.

Ollama setup is intentionally optional:

```bash
# Install/start Ollama with your local package manager, then pull any models you want.
ollama pull qwen3:14b
ollama pull qwen3:32b
ollama pull qwen3-coder:30b

export MTG_OLLAMA_BASE_URL=http://127.0.0.1:11434
export MTG_LLM_GENERATOR_MODEL=qwen3:14b
export MTG_LLM_PROOF_MODEL=qwen3:32b
export MTG_LLM_CRITIC_MODEL=qwen3-coder:30b
```

Recommended local model roles for an M3 Pro Mac with 36 GB RAM are `qwen3:14b`
for fast candidate/draft work, `qwen3:32b` for deeper proof drafting when it
fits your local memory budget, and `qwen3-coder:30b` or similar for
structured/code-like JSON extraction. The CLI does not assume those models are
installed; if Ollama is not reachable it prints a clear local setup error and no
cloud alternate path is attempted.

`promote-tests` converts `ACCEPTED` or `DETERMINISTICALLY_PROVEN` records into
JSON fixtures under `test/fixtures/proof-review/` so future deterministic proof
families can be promoted into the existing test style. Add new interaction
families by following `src/INTERACTION_ENGINE.md`: add or refine typed facts,
seed/prove bounded packages, add positive and negative fixtures, and keep graph,
evaluator, review, and strict-proof evidence separate. Future deterministic
validators should add explicit check results to proof-attempt records rather than
allowing local LLM or manual review output to bypass the verifier.

For a read-only POC sanity check of the proof-review artifacts, run:

```bash
npm run validate:proofs:poc
```

This validates JSONL shape, latest proof lifecycle states, deterministic-package backing for proven/promoted proofs, review-batch guardrails, LLM draft non-promotion, and golden fixture consistency. It is intentionally a lifecycle/artifact validator, not a second rules engine.
