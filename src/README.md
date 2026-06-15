# Deck Interaction Map

An interactive, force-directed map of how the cards in *any* Commander/EDH deck
mechanically interact — built to answer **"how interactive is this deck?"**

Unlike a typical "synergy by card type" view, an edge here means a **real
mechanical interaction**: one card *produces* a game event (e.g. "opponents
draw", "a creature dies", "a Treasure is made") that another card *reacts to*.
The five game zones (Hand, Graveyard, Exile, Library, Other players) are nodes
too, so you can see how each card reads from / writes to them.

## Generate a map (one or many decks)

Run from the repo root. Source lives in `src/`, sample/corpus data in `data/`,
and generated maps land in the root workspace by default.

```bash
# single deck (file) -> output.html
node src/build-deck-viz.js <decklist.txt> -o output.html

# single deck from a Moxfield URL
node src/build-deck-viz.js https://moxfield.com/decks/NQ8mZv-BAEaKflOhzyXflg -o map.html

# COMPARE several decks (any mix of files + Moxfield URLs)
node src/build-deck-viz.js data/sample-decklist.txt \
     https://moxfield.com/decks/AAAA https://moxfield.com/decks/BBBB -o compare.html

# default (no -o): bundled sample (data/sample-decklist.txt) -> deck-map.html in root
node src/build-deck-viz.js
```

Decklist .txt format is one-card-per-line (Moxfield/Archidekt export works):
`1 Sol Ring`, `1 Wheel of Fortune (VMA) 192`, `3 Mountain (J25) 90 *F*`. Set
codes, collector numbers, and foil markers are ignored.

The CLI prints each deck's cohesion line and, for multiple decks, a comparison
table. The generated HTML is fully self-contained — open it in a browser.

> **Moxfield note:** Moxfield's API is behind Cloudflare, so fetches are routed
> through the `r.jina.ai` reader proxy. Needs internet. Card oracle text comes
> straight from Moxfield (no Scryfall round-trip needed).

## Cohesion score — how it's measured

Each deck gets a **0–100 cohesion score** (sidebar + CLI). Interactions are
*classified* — each edge carries a `family` (e.g. `death→drain`, `go-wide→payoff`,
`untap→tap-ability`) and a `strength` (weak / moderate / strong / combo-critical).
The score leans on **meaningful** (moderate-or-stronger) connectivity so incidental
links don't inflate it, with per-family diminishing returns so one repeated effect
(an anthem, a mana rock) can't fan out into a high score:

| Weight | Signal | Meaning |
|--------|--------|---------|
| 38% | **% meaningfully linked** | nonland cards with ≥1 moderate+ interaction |
| 38% | **core-web share** | how much of the deck sits in one moderate+ web |
| 16% | **saturated weighted degree** | per-family √-damped interaction richness |
| 8%  | **combo bonus** | detected combo-critical / loop pieces |

Bands: **≥70 Very cohesive · 50–69 Cohesive · 32–49 Loosely connected · <32 Pile of good-stuff.**
Also reported: the detected *engine* (densest family), `hasCombo`, raw interaction
count, and the island list. The model was tuned over five rounds of 100-deck
adversarial AI audits (see `AUDIT-100-decks-round5-FINAL.json`).

## Self-sufficiency score — standalone card strength

Cohesion measures only ONE route to power (winning through synergy), so it
systematically underrates control/goodstuff/political decks whose power comes
from individually strong, independent cards. **Self-sufficiency** (0–100) is the
complement: standalone strength that doesn't need an engine. Read the two
together — a combo deck is high-cohesion, a control pile is high-self-sufficiency,
a tuned deck is high on both. Six signals, each a count over nonland cards
saturated against a target, combined as a balanced density (card quality is a
tiebreaker weight only, since EDHREC rank is a popularity proxy, not power):

| Weight | Signal | Detected from |
|--------|--------|---------------|
| 22% | **interaction** | removal / counters / wipes / burn / bounce |
| 20% | **card advantage** | draw / impulse / investigate / treasure / search |
| 15% | **ramp** | mana producers (classifier `produces.mana`) |
| 10% | **consistency** | tutors (non-land library search) |
| 10% | **resilience** | hexproof / indestructible / recursion / ward / uncounterable |
| 23% | **card quality** | share of cards in the EDHREC top tier (≤1500) |

Bands: **≥70 Very self-sufficient · 50–69 Self-sufficient · 32–49 Somewhat reliant · <32 Engine-dependent.** Validated across the 100-precon corpus (median 60): pure-engine tribal/counters precons score low here while big-mana/control piles that cohesion brands "Pile of good-stuff" correctly score high. The sidebar shows all six signals as bars so the number is always explainable.

## Win tuning score — optimized to win

**Win tuning** (0–100) is the explicit "how well is this deck tuned to win?"
axis. It is separate from Cohesion so a slow but elegant combat engine does not
automatically outrank a faster tutor/wheel/finisher list, and separate from
Self-sufficiency so a pile of strong cards still has to show real closing power.

Detection is **heuristic** — oracle text + role + mana value, *not* a curated
list of card names (hardcoded lists looked precise but silently scored every
off-list card as zero and were a maintenance treadmill). The one curated list is
**Game Changers** below, which is authoritative WotC reference data, not a guess.

| Weight | Signal | Meaning |
|--------|--------|---------|
| 16% | **speed** | fast mana and efficient acceleration; slow ramp counts less |
| 13% | **consistency** | tutors, weighted by flexibility and cost |
| 13% | **card flow** | wheels, draw engines, impulse/cast-from-exile and recursion velocity |
| 12% | **interaction** | removal, wipes, free interaction and stax/hatebears |
| 18% | **closure** | compact win conditions and combos; combat finishers are discounted because they are board-dependent |
| 6% | **resilience** | protection, recursion, uncounterability and defensive free spells |
| 6% | **efficiency** | average mana value plus widely-played efficient staples |
| 12% | **game changers** | count of official WotC Commander-Brackets power cards (see below) |
| 4% | **deck size** | Commander deck-size sanity check; 100 cards scores best |

**Every signal is card-grounded:** the metric records the specific cards that
drove each signal (hover a sidebar bar to see them) and synthesises a one-line
plain-English **"how this deck wins"** summary (e.g. *"Wins with a compact
noncombat finisher, backed by fast mana, tutor consistency, strong card flow."*),
so the number is always explainable and auditable — never a black box.

Bands: **≥86 Highly tuned · 74–85 Tuned to win · 58–73 Focused · 42–57 Casual · <42 Untuned.**
These cutoffs are **calibrated against the 100-precon corpus** (`data/validate-wintuning.js`),
a known-casual baseline: precons span min 39 / median 57 / max 73, so "Tuned to
win" begins at 74 — one point above the strongest precon — i.e. *upgraded beyond
an out-of-box deck*. "Highly tuned" (≥86) is reserved for genuinely optimised,
cEDH-adjacent lists. The sidebar shows this score first because it answers the
win-rate question; Cohesion and Self-sufficiency remain explanatory axes below it.

## Game Changers & bracket — official WotC power list

**Game Changers** is the curated card list from WotC's *Commander Brackets*
system — the cards powerful enough to define a deck's power level. Unlike the
heuristics above this is authoritative reference data (transcribed verbatim in
`metrics.js`; update it when WotC does), so a card is a Game Changer *iff* WotC
says so. The deck's **count** of these — with the actual card names always
surfaced, so it is fully auditable — feeds win tuning *and* yields a **bracket
hint** following the official count mapping:

- **0** Game Changers → Bracket 1–2 (Casual)
- **1–3** → Bracket 3 (Upgraded)
- **4+** → Bracket 4 (Optimised / cEDH)

This is a hint from the GC count alone (a full bracket ruling also weighs tutors,
combos and mass land denial), but it tracks the official intent. Validated across
the 100-precon corpus: 88/100 precons run **zero** Game Changers and none run more
than one — exactly the clean casual/optimised separation the list is meant to give.

## In the browser

- **+ Add Moxfield deck** — paste a URL to fetch and add a deck live.
- **Import file…** / drag-and-drop — add a `.txt` decklist (resolved via Scryfall).
- **Deck tabs** (sidebar) — switch the active deck; each shows its win-tuning score.
- **compare ▸** (appears with 2+ decks) — side-by-side metrics table, best value highlighted.
- **Power-gravity layout** — the graph reveals the deck's strongest cards: each
  card has a **mass** that pulls it toward the centre, so powerful / well-connected
  cards sink to the core and chaff drifts to the rim. The **gold-ringed** centre
  card is the commander (or, with none, the heaviest card). **Node size** also
  scales with mass. **Hover/click** a card → its interaction web, families, power
  and link-mass. **Hide isolated** and **Freeze** layout as needed.

### Layout gravity modes (the "Gravity" button)

Mass has two ingredients per card: **link mass** (Σ of its interaction-edge
strengths — weak 1 / moderate 2 / strong 3 / combo-critical 4) and **power**
(`metrics.js` `cardPower()`: standalone card strength — efficient answers, card
advantage, tutors, resilience, finishers — plus a Game-Changer bonus and an
EDHREC-staple bonus). The button cycles three lenses:

| Mode | Centre pull | Node size | Reveals |
|------|-------------|-----------|---------|
| **links + power** | link mass + power | same | both synergy *and* lone bombs pull inward |
| **links · size = power** | link mass only | power | position = synergy, size = standalone power (two clean dimensions) |
| **power-weighted links** | Σ(strength × partner power) | same | linking to strong cards pulls hardest — the true core engine knots up |

> The five **game-zone squares** (Hand, Graveyard, Exile, Library, Other players)
> were removed: they were near-universal hubs (almost every deck targets "other
> players", draws, tutors) that pulled the layout toward thematic poles instead
> of revealing the deck's real power structure. Card *mass* replaces them as the
> organizing force.

## Layout

Engine source lives in `src/`, sample + validation data in `data/`, and
generated maps land in the root workspace.

**`src/` — engine source**
- `build-deck-viz.js` — CLI generator (Node; local DB + Moxfield/Scryfall fetch).
- `interaction-model.js` — shared produce/consume event taxonomy. Edit to tune
  what counts as an interaction; CLI and browser both use it, so they never drift.
- `metrics.js` — shared win-tuning, cohesion, and self-sufficiency metrics (same numbers everywhere).
- `template.html` — the visualization shell (data injected at build time).
- `build-web.js` — builds the GitHub Pages site into `docs/` (see *Publishing* below).
- `README.md` — this file.

**`data/` — samples, corpus & audit**
- `sample-decklist.txt` — the Xantcha deck used as the default.
- `precon-sample-100.json` / `precon-results.json` — the 100-precon validation
  corpus and its current scores.
- `AUDIT-100-decks-round5-FINAL.json` — the final per-deck AI audit of the model.

**root workspace — generated output**
- `MTG Deck Map.html` — a prebuilt, self-contained map (the shareable artifact).
- Generated maps are written wherever you point `-o`, or `deck-map.html` in the
  root by default (self-contained HTML).

## Publishing to GitHub Pages

The map can be published as a static site. A **manually-triggered** GitHub
Action (`.github/workflows/deploy-pages.yml`) rebuilds and deploys it — it runs
only when you click **Run workflow** in the Actions tab, never automatically on
push.

What it does: install deps → `npm run build-data` (downloads the Scryfall bulk
Oracle Cards DB, which is gitignored) → `npm run build-web` (writes a
self-contained `docs/index.html` + `docs/.nojekyll`) → deploy to Pages.

**What works on the published site**

| Feature | Works on Pages? | Why |
|---------|-----------------|-----|
| Viewing the map, all scores, compare, layout modes | ✅ | the HTML is fully self-contained |
| **Import file / paste / drag-drop** decklist | ✅ | Scryfall's API allows browser (CORS `*`) requests |
| **+ Add Moxfield deck** (live URL) | ⚠️ needs a proxy | Moxfield's API is Cloudflare-gated with no CORS, so browsers can't fetch it directly |

**Enabling live Moxfield import.** Deploy the tiny Cloudflare Worker in
`deploy/moxfield-proxy/` (see its README — `wrangler deploy`, free tier), then
add its URL as an Actions **repository variable** named `MOXFIELD_PROXY`
(*Settings → Secrets and variables → Actions → Variables*). The build bakes it
into the page; at runtime the page tries Moxfield directly → the proxy → the
`r.jina.ai` reader, so a deck loads even if one path is down. Without the
variable set, the site still publishes and file/paste import still works —
Moxfield import just shows a helpful error.

**One-time setup**

1. Push the repo to GitHub.
2. *Settings → Pages → Build and deployment → Source =* **GitHub Actions**.
3. (Optional) Deploy the Worker and set the `MOXFIELD_PROXY` variable.
4. *Actions → Deploy deck map to GitHub Pages → Run workflow.*

To preview the exact published artifact locally:

```bash
npm run build-data            # once, to fetch the card DB
npm run build-web             # writes docs/index.html (+ .nojekyll)
# open docs/index.html in a browser
```

## Tuning the model

`interaction-model.js` runs a three-stage pipeline: **segment** a card's oracle
text into abilities, **tag** each with capabilities, then **match** card pairs
into classified `Interaction` objects. Two edge kinds: *reaction* (one card's
produced event intersects another's consumed event, subject-aware) and
*enablement/synergy* families (capability A → capability B, e.g. a free untapper →
a tap-for-mana ability). Add or refine capabilities/families there and regenerate;
the CLI and browser both load this one file, so they never drift.
