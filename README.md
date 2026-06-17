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
npm run analyze-bracket-sample
npm run report-bracket-analysis
```

What this does:

- `npm run fetch-bracket-sample` seeds each Moxfield bracket from its public likes-sorted page, keeps the inline bracket value when the page mixes bracket labels, then fills additional decks from the global likes leaderboard until each bracket bucket reaches 100 decks or the accessible source exhausts.
- `npm run analyze-bracket-sample` runs the existing deck metrics / win-tuning analysis over the fetched sample and writes `analysis/bracket/moxfield-bracket-corpus.json`, including explicit failure metadata if some decks cannot be fetched or built from the accessible network path.
- `npm run report-bracket-analysis` turns the analyzed corpus into reusable bracket-summary artifacts, including a centroid-based check of how well `{win, cohesion, self}` alone recover the source brackets.

Artifacts:

- `analysis/bracket/moxfield-bracket-sample-500.json` — fetched public sample plus counts/shortfalls metadata
- `analysis/bracket/moxfield-bracket-corpus.json` — analyzed corpus with win/cohesion/self-sufficiency/Game Changer output per deck
- `analysis/bracket/moxfield-bracket-report.md` — human-readable summary of source-bracket means plus exact / ±1 / coarse-bucket classifier accuracy
- `analysis/bracket/moxfield-bracket-report.json` — machine-readable version of the same analysis

Because Moxfield search and deck pages are Cloudflare-gated, these scripts rely on the same network-access path already used elsewhere in this repo and may still report source shortfalls when a bracket cannot be paged deeply enough from the accessible surfaces.


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

Run both tests and syntax checks:

```bash
npm test
npm run check
```
