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
