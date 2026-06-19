# Face-aware card model design note

Date: 2026-06-18  
Status: Implemented architecture note for the shipped face-aware model. The
original audit/design informed the current implementation; the later story list
below is retained as an implementation checklist and regression map, not as
remaining work.

## Problem statement

Before this model, the interaction/rulesbuilder engine treated most
double-faced and multi-faced cards as one merged text blob. That made a deck
entry visible, but it lost which face produced each fact. Losing face
provenance created three classes of risk:

1. **Resolution risk** — a decklist, import, or recommendation can name the back face (`The Great Work`) while lookups only reliably index the full name (`Urabrask // The Great Work`) or front face (`Urabrask`).
2. **Evidence risk** — proof packages and recommendations cannot explain which face produced the capability or event.
3. **Rules risk** — a physical card may be one deck object while its faces are not always simultaneously available. Merging face text can allow impossible “front face pays / back face profits” reasoning in layered combo search.

The target design is: **one physical card/deck node, many auditable face facts**. We should not explode a DFC into multiple deck entries; we should preserve face-level facts and use layout-aware constraints when building pair/triple/proof candidates.

## External API facts to preserve

Scryfall’s card-object docs say multi-faced cards expose `card_faces`, root `name` contains both names separated by ` // `, and root `mana_cost` for multi-faced cards is reported on faces. Scryfall’s layout docs also state that layouts such as `split`, `flip`, `transform`, and `double_faced_token` have `card_faces`; `modal_dfc` means either side can be played; `transform` describes two transformed modes while root fields apply to both sides.

Design implication: the reusable model should trust provider fields (`layout`, `card_faces[].name`, `card_faces[].type_line`, `card_faces[].oracle_text`, `card_faces[].mana_cost`, root `oracle_id`/`id` when present) instead of ad hoc name dictionaries.

References:
- <https://scryfall.com/docs/api/cards>
- <https://scryfall.com/docs/api/layouts>

## Implementation map

### Data generation

- `lib/build-commander-search.js` keeps compact `card_faces` with face `name`,
  `mana_cost`, `type_line`, and `oracle_text`, and derives root display
  `oracle_text`/`type_line` by joining face text with ` // `.
- Raw oracle data may omit root DFC `oracle_text`; `src/card-faces.js` makes the
  face list the reusable source of truth and provides merged display fields.
- Generated candidate/search data keeps both merged display text and compact
  `card_faces`, so downstream import/build paths do not need per-card exceptions.

### Static/CLI builder

- `src/build-deck-viz.js` normalizes every resolved card through
  `toFaceAwareResolvedCard`, indexes provider-derived aliases, and dedupes by
  physical-card key so root/front/back names resolve to one graph node.
- Graph nodes preserve `layout`, `aliases`, `faces`, `faceFacts`,
  `factSources`, and `faceCompatibilityWarnings` while retaining the legacy
  aggregate fields used by existing UI and metrics.
- Static proof packages are built from face-aware graph nodes, so proof search
  can reject mutually exclusive same-card facts while proof payloads still show
  card-level summaries.

### Browser import/build path

- `src/web/services/import/scryfall.ts` and
  `src/web/services/import/moxfieldImporter.ts` preserve layout, aliases, and
  normalized face metadata in resolved cards.
- `src/web/services/adapters/interactionModel.ts` reuses the shared face helpers
  and face classifier to produce aggregate graph fields plus face provenance.
- `src/web/services/browserGraphBuilder.ts` annotates pairwise interactions with
  face evidence and keeps proof generation explicitly opt-in/injected rather
  than importing the Node/CommonJS proof engine directly.

### Interaction/proof path

- `src/interaction-model.js` remains the shared classifier for one text/type
  surface and emits target-type capability facts such as
  `is-creature-permanent` and `is-nonlegendary-permanent`.
- `src/face-classification.js` classifies each face independently, aggregates
  backward-compatible card facts, and records the face source for every fact.
- `src/interaction-indexes.js` face-classifies raw `card_faces` inputs before
  indexing, then keeps candidate pair/triple generation bounded.
- `src/interaction-hypergraph.js`, `src/interaction-proof-search.js`, and
  `src/interaction-proof-packages.js` consume face-aware facts. Proof search
  rejects requirements that only work by merging mutually exclusive faces, and
  proof packages can surface face-level evidence.

## Identity model

### Definitions

- **Physical card identity**: the deckbuilding object. Prefer stable provider IDs in this order: Scryfall `oracle_id` when available for the whole card, Scryfall root `id` for print-specific imports, then normalized root `name`. This remains the graph node ID/display anchor unless a later migration introduces opaque IDs.
- **Canonical display name**: provider root `name`, for example `Urabrask // The Great Work`.
- **Face identity**: a stable child of a physical card: `{ cardKey, faceIndex, faceName }`, optionally `oracle_id` for reversible faces if present.
- **Alias key**: normalized lookup key derived from root name, full split name, every `card_faces[].name`, and provider-supplied names. Aliases map to one physical card identity, not separate deck entries.
- **Face availability mode**: a conservative layout-derived hint used by proof search:
  - `single` — normal card, no distinct faces.
  - `either-face` — modal/split/adventure-like alternatives; one choice supplies the relevant spell/permanent facts at a time.
  - `transforms` — front/back states are related but sequential/stateful, not automatically simultaneous.
  - `same-object-parts` — flip/level/prototype-style layouts where parts are card-local modes on one object.
  - `separate-objects` — reversible cards or unrelated sides; treat as exceptional and avoid merging into one gameplay proof unless explicit support exists.

### Shared data shape

Keep this small and serializable so Node, browser, tests, and generated bootstrap data can share it:

```ts
interface CardFaceFacts {
  index: number
  name: string
  type_line: string
  oracle_text: string
  mana_cost: string
  colors?: string[]
  oracle_id?: string
  layout?: string
  availability: 'single' | 'either-face' | 'transforms' | 'same-object-parts' | 'separate-objects'
}

interface FaceAwareCardFacts {
  canonicalName: string
  cardKey: string
  layout: string
  aliases: string[]
  faces: CardFaceFacts[]
  mergedTypeLine: string
  mergedOracleText: string
  displayManaCost: string
}
```

Implementation should expose pure helpers, not classes:

- `normalizeCardNameKey(value)` — one normalizer for decklist names, aliases, and lookup keys.
- `extractCardFaces(card)` — returns at least one face for every card; never returns `undefined`.
- `cardAliases(card)` — root name, split components, face names, normalized unique keys.
- `cardAvailability(layout, face)` — maps provider layout to conservative availability mode.
- `mergedOracleText(faces)` / `mergedTypeLine(faces)` / `displayManaCost(faces)` — standard display fallbacks.
- `toFaceAwareResolvedCard(card)` — provider-neutral adapter used by Scryfall, Moxfield, static build, and recommendations.

The helpers should be the only place that knows how to split ` // ` names.

## Algorithm design for interactions and layered combos

The scalable path is a two-level fact graph:

1. **Card node** stays one deck object for UI, quantity, metrics, legality, and decklist dedupe.
2. **Face facts** are classified independently and attached to the node:
   - `node.faceFacts[faceIndex].classification`
   - `node.faceFacts[faceIndex].segments`
   - `node.faceFacts[faceIndex].evidence`
3. **Aggregated node facts** are derived from face facts for backward compatibility:
   - existing `produces`, `consumes`, `caps`, `zones` remain available.
   - each aggregate fact carries provenance internally: `{ faceIndex, faceName, snippet, availability }`.
4. **Pair/triple candidate generation** uses the existing bounded indexes, but index entries include `factSource` metadata. The search remains bounded to existing pair/triple/closure APIs; it does not become a rules simulator.
5. **Proof validation** rejects or downgrades packages that require incompatible facts from the same physical card under the same proof step. Examples:
   - Same DFC using a front-face cast trigger and a back-face static payoff simultaneously should be `near-miss` unless the proof has a transform step.
   - Modal DFC land face producing mana and spell face consuming that mana in the same package should be rejected unless another copy is available.
   - Facts from different physical cards are allowed even if they come from particular faces; evidence should name the face.
6. **Product payloads** surface face evidence without increasing deck entries:
   - Edge interaction: `sourceFace?: { index, name }`, `targetFace?: { index, name }`, `faceConstraint?: string`.
   - Proof contribution: `face?: { index, name, availability }`.
   - UI detail text groups evidence by card and face.

This preserves the existing maintainable architecture in `src/INTERACTION_ENGINE.md`: classifier → indexes → hypergraph → bounded proof search → product proof packages. Face awareness is added as provenance and constraint metadata at each layer, not as an unbounded MTG state simulation.

## Implemented scope

### Canonical face model

- `src/card-faces.js` provides the shared pure helper module for layout-aware
  face availability, aliases, merged display text, display mana, and physical
  card keys.
- TypeScript graph/deck types carry optional `layout`, `aliases`, and `faces`
  fields for browser/static graph paths.
- Helper behavior is covered for normal cards, transform DFCs, modal DFCs, split
  cards, and reversible/separate-object layouts.

### Import/static integration

- Static lookup and browser import paths resolve full name, front face, and back
  face aliases to the same physical card where provider data supports it.
- Scryfall, Moxfield, static fetch/candidates, and graph-node creation preserve
  `layout` plus normalized face metadata.
- Shared helpers provide merged display text/mana and physical-card dedupe keys.

### Face-aware interaction evidence

- `src/face-classification.js` classifies each face independently and aggregates
  backward-compatible card facts with provenance.
- Indexes, graph edges, proof search, and proof packages preserve existing public
  fields while carrying face source metadata internally and in UI evidence.
- Same-card compatibility checks reject proof requirements that only work by
  merging mutually exclusive faces; copy-target, mutual ETB-blink target, and
  recursive another-creature legality also require the target/precondition type
  and loop capability on the same compatible face.

### QA and hardening

- Regression fixtures cover:
  - `Urabrask // The Great Work` resolving by `Urabrask`, `The Great Work`, and full name.
  - `Zof Consumption // Zof Bloodbog` preserving both spell and land face facts while staying one deck node.
  - Raw oracle DFC fallback where root `oracle_text` is absent.
  - Same-card incompatible-face near misses in proof search and graph/proof
    copy-target, mutual ETB-blink target, and recursive another-creature
    precondition legality.
- Targeted unit tests, web tests, `npm run check`, `npm test`, and `git diff
  --check` are part of the final gate.

## Acceptance criteria

1. **Canonical resolution**: decklist lines using root name, front face, or back face resolve to one physical card object with the same canonical display name.
2. **No ad hoc card dictionaries**: aliases come from provider root/face names and one normalizer.
3. **One deck object**: graph nodes, decklist quantities, recommendations, and metrics do not duplicate DFCs into separate physical cards.
4. **Face metadata preserved**: imported/resolved/candidate cards keep layout and face name/type/mana/oracle fields.
5. **Per-face classification**: graph nodes can expose which face produced each event/capability/zone reference.
6. **Compatibility guardrails**: proof search can reject or mark near-miss packages that require incompatible facts from different faces of the same physical card.
7. **Auditable UI/proofs**: recommendations, edges, and proof packages can display face-level evidence while retaining card-level summaries.
8. **Performance bounded**: no O(n^3) browser scans; pair/triple/closure generation remains indexed and capped as documented in `src/INTERACTION_ENGINE.md`.
9. **Backward compatibility**: existing fields (`id`, `text`, `type`, `mana`, `produces`, `consumes`, `caps`, `zones`) remain populated for current UI and metrics.
10. **QA complete**: helper, import, static build, graph, proof-package, and web
    tests cover DFC behavior and copy-target face compatibility before final
    completion.

## Non-goals

- No full MTG stack/turn simulator.
- No per-card handwritten exceptions for individual DFCs.
- No browser import dependency on Node/CommonJS proof modules.
- No schema-breaking proof package change without version/type/UI/hardening updates in the same story.
