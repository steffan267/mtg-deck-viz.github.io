# Interaction baseline audit

Schema: `interaction-baseline.v1`

Phase-0 baseline for evolving MTG interaction detection from pairwise heuristic edges toward layered, bounded combo proof search.

## QA gate

- `node scripts/audit-interaction-baseline.js --check`
- `node test/interaction-baseline.test.js`
- `npm test`
- `npm run check`

Pass criteria:
- baseline JSON and Markdown are deterministic and match the checked-in artifacts
- all golden fixtures pass with zero missing cards and zero unexpected combo-class regressions
- full repository tests and syntax/type checks pass, or unrelated pre-existing gaps are recorded in the checkpoint evidence

## Thresholds

- Golden fixture failures allowed: 0
- Missing fixture cards allowed: 0
- Weak interaction share warning: 70%
- Family fan-out warning: 18 interactions
- Weak-family fan-out warning: 12 interactions
- Node degree warning: 20 edges
- Edge-count drift review: 5%

## Aggregate snapshot

- Decks: 3
- Total edges: 173
- Total interactions: 195
- Combo-critical pairs: 10
- Combo-critical triples: 1
- Golden fixtures: 10
- Golden fixture failures: none
- Missing fixture cards: none
- Missing representative-deck cards: sample-xantcha:Valley of Gorgoroth
- QA status: ready

## Deck summaries

### Sample Xantcha decklist

- ID: `sample-xantcha`
- Kind/source: representative-local-deck; data/sample-decklist.txt
- Cards/nonlands: 92/63
- Missing: Valley of Gorgoroth
- Edges/interactions: 154/166
- Combo-critical pairs/triples: 5/0
- Cohesion/win tuning: 27 (Pile of good-stuff) / 91 (Highly tuned)
- Bracket hint: Bracket 5 · cEDH
- Review warnings: weak share 0.91; high-degree nodes 0; high fan-out families 2
- Top hubs:
  - Sheoldred, the Apocalypse: degree 15; draw 15, opponent-draw-punisher-win 1
  - Waste Not: degree 15; discard 6, combat→payoff 4, ramp→sink 3, death→drain 2, death→tokens 1
  - Descent into Avernus: degree 14; ramp→sink 14, treasure 1
  - Exsanguinate: degree 14; ramp→sink 14
  - Fire Covenant: degree 14; ramp→sink 14

### Combo and false-positive suite

- ID: `combo-and-false-positive-suite`
- Kind/source: synthetic-real-card-suite; (inline synthetic decklist)
- Cards/nonlands: 18/18
- Missing: none
- Edges/interactions: 16/26
- Combo-critical pairs/triples: 4/0
- Cohesion/win tuning: 49 (Loosely connected) / 34 (Untuned)
- Bracket hint: Bracket 3 · Upgraded
- Review warnings: weak share 0.538; high-degree nodes 0; high fan-out families 0
- Top hubs:
  - Academy Manufactor: degree 3; tokens 4, token-production→amplifier 3
  - Nuka-Cola Vending Machine: degree 3; tokens 4, token-production→amplifier 1
  - Smothering Tithe: degree 3; tokens 2, draw 1, token-production→amplifier 1
  - Vito, Thorn of the Dusk Rose: degree 3; lifegain 2, cost-reduction→ability 1, lifegain→lifeloss-loop 1, lifeloss 1, lifeloss→lifegain-loop 1
  - Cloud of Faeries: degree 2; blink→land-untap-etb 1, etb→blink 1

### Abstract layered combo suite

- ID: `abstract-layered-combo-suite`
- Kind/source: synthetic-oracle-text-suite; (inline synthetic decklist)
- Cards/nonlands: 5/5
- Missing: none
- Edges/interactions: 3/3
- Combo-critical pairs/triples: 1/1
- Cohesion/win tuning: 72 (Very cohesive) / 13 (Untuned)
- Bracket hint: Bracket 4 · Optimized
- Review warnings: weak share 0; high-degree nodes 0; high fan-out families 0
- Top hubs:
  - Self Top Draw Artifact: degree 2; artifact-cost-reduction→top-loop-piece 1, cast-from-top→top-loop-piece 1
  - Artifact Spell Reducer: degree 1; artifact-cost-reduction→top-loop-piece 1
  - Artifact Top Caster: degree 1; cast-from-top→top-loop-piece 1
  - Empty Library Oracle: degree 1; library-exile→empty-library-win 1
  - Library Exiling Tutor: degree 1; library-exile→empty-library-win 1

## Golden fixtures

### Creature-scoped cost reducer does not fan out to mana rocks

- ID: `creature-cost-reducer-scope-negative`
- Status: pass
- Cards: Heartstone + Sol Ring
- Families observed: none
- Combo pairs/triples observed: 0/0
- Rationale: This is the canonical false-positive guard for reducer fan-out.

### Creature-scoped cost reducer links to creature activated ability

- ID: `creature-cost-reducer-scope-positive`
- Status: pass
- Cards: Heartstone + Xantcha, Sleeper Agent
- Families observed: cost-reduction→ability
- Combo pairs/triples observed: 0/0
- Rationale: Heartstone should not be flattened into generic tap-ability reduction, but it should still help Xantcha.

### Library exile can feed empty-library win condition

- ID: `library-exile-empty-library-win`
- Status: pass
- Cards: Empty Library Oracle + Library Exiling Tutor
- Families observed: library-exile→empty-library-win
- Combo pairs/triples observed: 1/0
- Rationale: Layered win-condition detection needs text-derived capability edges, not name dictionaries.

### Reciprocal life gain/life loss loop is combo-critical

- ID: `lifegain-lifeloss-two-card-loop`
- Status: pass
- Cards: Exquisite Blood + Sanguine Bond
- Families observed: lifegain, lifegain→lifeloss-loop, lifeloss, lifeloss→lifegain-loop
- Combo pairs/triples observed: 1/0
- Rationale: Bidirectional reaction loops must surface both directions for explainability.

### Wheel draw feeds Smothering Tithe as a weak reaction

- ID: `opponent-draw-feeds-smothering-tithe`
- Status: pass
- Cards: Naktamun Lorespinner // Wheel of Fortune + Smothering Tithe
- Families observed: draw
- Combo pairs/triples observed: 0/0
- Rationale: Opponent-draw triggers are useful context but should remain low-strength unless another layer closes a loop.

### Pako/Haldan style fetch-counter access is linked

- ID: `partner-exile-access`
- Status: pass
- Cards: Haldan, Avid Arcanist + Pako, Arcane Retriever
- Families observed: exiled-card-access
- Combo pairs/triples observed: 0/0
- Rationale: Cross-card access to exiled cards is a domain-specific interaction that generic exile detection misses.

### Repeatable blink plus land-untap ETB is combo-critical

- ID: `repeatable-blink-land-untap-combo`
- Status: pass
- Cards: Deadeye Navigator + Peregrine Drake
- Families observed: blink→land-untap-etb
- Combo pairs/triples observed: 1/0
- Rationale: A one-two layered combo must be promoted from ordinary ETB synergy to combo-critical.

### Single-shot blink plus land-untap ETB is not combo-critical

- ID: `single-shot-blink-is-not-infinite`
- Status: pass
- Cards: Ephemerate + Peregrine Drake
- Families observed: etb→blink
- Combo pairs/triples observed: 0/0
- Rationale: The audit distinguishes strong value synergy from repeatable combo closure.

### Artifact top loop requires three pieces

- ID: `three-card-artifact-top-loop`
- Status: pass
- Cards: Artifact Spell Reducer + Artifact Top Caster + Self Top Draw Artifact
- Families observed: artifact-cost-reduction→top-loop-piece, cast-from-top→top-loop-piece
- Combo pairs/triples observed: 0/1
- Rationale: A three-piece engine should be detected as a triple, not downgraded to a misleading two-card pair.

### Token amplifier links without treasure/mana overreach

- ID: `token-amplifier-without-treasure-overreach`
- Status: pass
- Cards: Academy Manufactor + Smothering Tithe
- Families observed: token-production→amplifier, tokens
- Combo pairs/triples observed: 0/0
- Rationale: Reminder text and artifact-token subtypes must not leak into broad mana/treasure false positives.

