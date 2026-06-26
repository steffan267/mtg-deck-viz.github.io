# Deck Interaction Map

An interactive, force-directed map of how the cards in *any* Commander/EDH deck
mechanically interact — built to answer **"how interactive is this deck?"**

Unlike a typical "synergy by card type" view, an edge here means a **real
mechanical interaction**: one card *produces* a game event (e.g. "opponents
draw", "a creature dies", "a Treasure is made") that another card *reacts to*.
The five game zones (Hand, Graveyard, Exile, Library, Other players) are nodes
too, so you can see how each card reads from / writes to them.

## Generate a map (one or many decks)

Run from the repo root. Source lives in `src/`, reusable sample data lives in `data/`, and local analysis/calibration artifacts live in `analysis/`.

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
| 16.7% | **speed** | fast mana and efficient acceleration; slow ramp counts less |
| 13.5% | **consistency** | tutors, weighted by flexibility and cost |
| 13.5% | **card flow** | wheels, draw engines, impulse/cast-from-exile and recursion velocity |
| 12.5% | **interaction** | removal, wipes, free interaction and stax/hatebears |
| 18.8% | **closure** | compact win conditions and combos; combat finishers are discounted because they are board-dependent |
| 6.25% | **resilience** | protection, recursion, uncounterability and defensive free spells |
| 6.25% | **efficiency** | average mana value plus widely-played efficient staples |
| 12.5% | **game changers** | count of official WotC Commander-Brackets power cards (see below) |

**Every signal is card-grounded:** the metric records the specific cards that
drove each signal (hover a sidebar bar to see them) and synthesises a one-line
plain-English **"how this deck wins"** summary (e.g. *"Wins with a compact
noncombat finisher, backed by fast mana, tutor consistency, strong card flow."*),
so the number is always explainable and auditable — never a black box.

Bands: **≥86 Highly tuned · 74–85 Tuned to win · 58–73 Focused · 42–57 Casual · <42 Untuned.**
These cutoffs are **calibrated against the 100-precon corpus** (`analysis/bracket/validate-wintuning.js`),
a known-casual baseline: precons span min 39 / median 57 / max 73, so "Tuned to
win" begins at 74 — one point above the strongest precon — i.e. *upgraded beyond
an out-of-box deck*. "Highly tuned" (≥86) is reserved for genuinely optimised,
cEDH-adjacent lists. The sidebar shows this score first because it answers the
win-rate question; Cohesion and Self-sufficiency remain explanatory axes below it.

## Commander Brackets classifier — rules plus official WotC power list

**Game Changers** is the curated card list from WotC's *Commander Brackets*
system — the cards powerful enough to define a deck's power level. Unlike the
heuristics above this is authoritative reference data (transcribed verbatim in
`metrics.js`; update it when WotC does), so a card is a Game Changer *iff* WotC
says so. The deck's **count** of these — with the actual card names always
surfaced, so it is fully auditable — feeds win tuning and the **Commander
Bracket classifier**.

- **0** Game Changers → Bracket 1–2 (Casual)
- **1–3** → Bracket 3 (Upgraded)
- **4+** → Bracket 4 (Optimised / cEDH)

The classifier now applies the Beta rules directly where the decklist exposes
them: mass land denial, extra-turn chaining, two-card combo timing (cheap compact
pairs vs late-game pairs), tutor density, Game Changer count, and win-tuning
band. It returns `commanderBracket.flags` and `commanderBracket.ruleBreaks` so
every bracket decision is auditable per card instead of being a black box.

## Interaction proofs and combo packages

The rulesbuilder now supports a bounded `interactionProofs` payload. Static/CLI
builds opt into emitting it up front; browser imports keep proof search off the
initial graph-build path and do not load the Node/CommonJS proof engine directly.
Imported browser decks can display proof packages when they are already present
in the payload or supplied by an explicitly injected browser-safe proof builder.
Proof packages are not a full MTG rules engine; they are compact, auditable
direct/two-card/three-card proofs over typed facts. Each package records:

- cards and contribution roles;
- proof sequence;
- result/resource deltas;
- assumptions and limiting clauses;
- confidence and repeatability notes;
- hyperedge references when a three-card AND package is involved.

The browser exposes these through the **Proofs** drawer with family and package
size filters. Selecting a package highlights all cards in the graph, and card
detail panels link back to every proof involving that card after packages are
available. Three-card packages remain grouped as packages instead of being
inflated into pairwise combo cliques. The schema version and required fields are
owned by `src/interaction-proof-packages.js` and enforced by the hardening gate;
browser runtime code treats that file as a Node/static-build boundary.

For maintenance rules, ontology definitions, budgets, and the contribution
checklist, read `src/INTERACTION_ENGINE.md`.

## Deck plan analysis

The browser breakdown page now includes a deck-level plan model that sits on top
of the graph and proof layers. It identifies the clearest engine package, core
engine cards, support shell, weak spots, and unlinked off-plan review cards, then
feeds the same plan score into the sidebar guideline row. The current flow and
completed implementation notes live in `src/DECK_PLAN_ANALYSIS.md`.

For corpus work, `npm run report:score-corpus` prints the compact score summary
from whichever local sample artifacts are available. Ignored caches under
`analysis/` or `work/` are valid inputs during model development; they do not
need to be promoted into checked-in `data/` before they are useful.

For benchmark health, run
`npm run report:calibration -- --out analysis/calibration-report.json --quiet`.
That report compares current rebuilt precon/Moxfield reference scores against
saved baselines, bracket labels, audit verdicts, watched false-positive
inflation families, and the real engine families we are intentionally adding.

For EDHREC combo iteration, `npm run fetch-edhrec-combos` and
`npm run evaluate-edhrec-combos` maintain the card-combo evidence corpus, while
`npm run fetch-edhrec-combo-tag-decks` and
`npm run evaluate-edhrec-combo-tag-decks` maintain the `/tags/combo` commander
average-deck corpus used to pressure-test combo, deck-plan, and commander-plan
recognition.

Long-running analysis and build commands emit structured progress lines to
`stderr` using `[progress] <label> current/total pct eta elapsed rate | detail`.
This keeps JSON/Markdown/stdout payloads parseable while making corpus runs easy
to monitor. The largest corpus scripts also accept `--progress-every n` so full
EDHREC or Moxfield runs can be made quieter or chattier without changing code.

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

Engine source lives in `src/`, reusable sample data lives in `data/`, local analysis/improvement artifacts live in `analysis/`, and the GitHub Pages source lives in `src/web/`.

**`src/` — engine source**
- `build-deck-viz.js` — CLI generator (Node; local DB + Moxfield/Scryfall fetch).
- `interaction-model.js` — shared produce/consume event taxonomy. Edit to tune
  what counts as an interaction; CLI and browser both use it, so they never drift.
- `interaction-indexes.js` — deterministic event/capability/modifier indexes and
  bounded pair/triple/closure candidate APIs.
- `interaction-hypergraph.js` — AND-shaped package candidates with proof
  serialization and pair-summary projection.
- `interaction-proof-search.js` — bounded abstract proof search for compact
  combo packages and near-miss explanations.
- `interaction-proof-packages.js` — JSON-safe product payload for proof drawer
  presentation.
- `combo-family-library.js` — declarative combo archetype definitions, fixtures,
  disqualifiers, and UI explanations.
- `metrics.js` — shared win-tuning, cohesion, and self-sufficiency metrics (same numbers everywhere).
- `web/` — Vue 3 + TypeScript browser app using `<script setup>` components, composables, typed services, and a canvas renderer facade.
- `legacy-template.html` — legacy CLI-only self-contained visualization shell used by `build-deck-viz.js` for ad hoc `deck-map.html` exports; the published Pages app is now Vue/Vite.
- `build-web.js` — builds the Vue/Vite GitHub Pages site into `docs/` (see *Publishing* below).
- `README.md` — this file.

**`data/` — reusable app/CLI data**
- `sample-decklist.txt` — the Xantcha deck used as the default.
- `precon-sample-100.json` / `precon-results.json` — reusable validation inputs/results.
- `AUDIT-100-decks-round5-FINAL.json` — the final per-deck AI audit of the model.
- `out/` — generated Scryfall card database files used by local tools and builds.

**`analysis/` — local analysis & improvement artifacts**
- `bracket/` — Moxfield bracket sampling, win-tuning calibration scripts, corpora, and reports.
- `interaction-baseline/` — deterministic baseline/audit artifacts for current
  interaction behavior.
- `interaction-validation/` — proof-search validation corpus and reproducible
  metrics report.

**generated outputs**
- `docs/` — generated GitHub Pages artifact uploaded by the workflow.
- `dist/web/` — intermediate Vite build output.
- Ad hoc CLI maps are written wherever you point `-o`, or `deck-map.html` in the root by default.

## Browser app development

The published browser app lives in `src/web/` and is built with Vue 3,
TypeScript, Vite, and `<script setup lang="ts">` single-file components. The
app keeps reusable UI primitives under `src/web/components/common/`, score and
sidebar components under `src/web/components/score/` and `src/web/components/sidebar/`,
and behavior behind typed services/composables such as importers, recommendation
providers, graph layout strategies, and the canvas renderer facade.

Useful commands:

```bash
npm run dev        # Vite dev server for src/web
npm run build      # strict typecheck + Vite build to dist/web
npm run build-web  # strict typecheck + generate docs/ for GitHub Pages
npm run typecheck  # vue-tsc app check + tsc config check
npm run test:web   # web adapter/static build smoke tests
npm run hardening:interactions # ontology/family/validation/proof-payload budgets
```

Do not open `src/web/index.html` directly with `file://` for development: it is
a Vite TypeScript source entry and browsers cannot execute `main.ts` modules
from the filesystem. Use `npm run dev`, or open the generated `docs/index.html`
after `npm run build-web`.

`npm test` includes the legacy Node tests plus `npm run test:web`; `npm run
check` includes JavaScript syntax checks plus Vue/TypeScript typechecking.

## Publishing to GitHub Pages

The map can be published as a static site. The GitHub Action
(`.github/workflows/deploy-pages.yml`) rebuilds and deploys it on every push to
`main`, and can also be run manually with **Run workflow** in the Actions tab.

What it does: install deps → `npm run build-data` (downloads the Scryfall bulk
Oracle Cards DB, which is gitignored) → `npm run build-web` (builds the
Vue/Vite app, writes the included deck/candidate `bootstrap-data.json`, writes
`docs/index.html` + `docs/.nojekyll`) → deploy to Pages.

**Including multiple decks in the published site.** By default the Pages build
includes `data/sample-decklist.txt`. To bake in more decks at build time, pass
sources to the build command or set `MTG_DECK_SOURCES` to a newline- or
comma-separated list. Each source can be a local `.txt` decklist or a Moxfield
URL.

```bash
npm run build-web -- data/sample-decklist.txt data/another-deck.txt
MTG_DECK_SOURCES=$'data/sample-decklist.txt\nhttps://moxfield.com/decks/AAAA' npm run build-web
```

For GitHub Pages, use **Run workflow** and fill the `deck_sources` input, or add
an Actions repository variable named `MTG_DECK_SOURCES` for every push build.
The included decks load as tabs and can be compared immediately.

**What works on the published site**

| Feature | Works on Pages? | Why |
|---------|-----------------|-----|
| Viewing the map, all scores, compare, layout modes | ✅ | the static Pages build includes the Vue shell plus cacheable bootstrap data |
| **Import file / paste / drag-drop** decklist | ✅ | Scryfall's API allows browser (CORS `*`) requests |
| **+ Add Moxfield deck** (live URL) | ⚠️ needs a proxy | Moxfield's API is Cloudflare-gated with no CORS, so browsers can't fetch it directly |

**Enabling live Moxfield import.** Deploy the tiny Cloudflare Worker in
`deploy/moxfield-proxy/` (see its README — `wrangler deploy`, free tier), then
add its URL as an Actions **repository variable** named `MOXFIELD_PROXY`
(*Settings → Secrets and variables → Actions → Variables*). The build bakes the proxy URL into the page; at runtime the page tries Moxfield directly and then the explicitly configured proxy. Without the variable set, the site still publishes and file/paste import still works — Moxfield import just shows a helpful error. No unconfigured third-party reader fallback is used by the Vue app.

**One-time setup**

1. Push the repo to GitHub.
2. *Settings → Pages → Build and deployment → Source =* **GitHub Actions**.
   Do not use branch publishing from `/` or `/docs`: `docs/` is a generated,
   gitignored artifact, so branch publishing may show the repository README
   instead of the Vue app.
3. (Optional) Deploy the Worker and set the `MOXFIELD_PROXY` variable.
4. Push to `main` or use *Actions → Deploy deck map to GitHub Pages → Run workflow.*

To preview the exact published artifact locally:

```bash
npm run build-data            # once, to fetch the card DB
npm run build-web             # builds Vue app and writes docs/index.html (+ .nojekyll)
npm run build-web -- deck-a.txt deck-b.txt  # preview with multiple included decks
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
