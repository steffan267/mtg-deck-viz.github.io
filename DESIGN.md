# Design

## Source of truth
- Status: Draft
- Last refreshed: 2026-06-19
- Primary product surfaces: Vue deck visualisation, sidebar decklist/tabs/import, graph canvas, card detail drawer, score/proof/recommendation drawers, GitHub Pages static artifact.
- Evidence reviewed: `src/web/App.vue`, `src/web/components/sidebar/DeckList.vue`, `src/web/components/sidebar/DeckTabs.vue`, `src/web/components/import/ImportControls.vue`, `src/web/components/common/*`, `src/web/components/score/*`, `src/web/CAPABILITY_PARITY.md`, `src/README.md`, user-provided screenshots from the live Pages app.

## Brand
- Personality: technical, evidence-first, compact, analytical, Commander-focused.
- Trust signals: exact card names, mechanical interaction labels, score evidence, proof packages, explicit import/deploy limitations.
- Avoid: decorative chrome that hides graph/data density, unexplained icons, card text that collapses important rules distinctions.

## Product goals
- Goals: help Commander players inspect real mechanical interactions, compare decks, and understand why cards are linked or scored.
- Non-goals: full card-database replacement, price/deckbuilding marketplace, pixel-perfect paper-card rendering.
- Success signals: users can identify hubs, isolated cards, score drivers, imported decks, and special card structures without external lookup.

## Personas and jobs
- Primary personas: Commander deck tuners, casual players comparing upgraded lists, developers validating the interaction model.
- User jobs: import or load decks, scan cards, inspect why a card matters, compare versions, discover recommendations, verify mechanical evidence.
- Key contexts of use: desktop graph exploration, mobile quick inspection, static GitHub Pages with limited live Moxfield support.

## Information architecture
- Primary navigation: Deck visualisation and Deck breakdown tabs.
- Core routes/screens: visualisation shell with sidebar + graph, compare modal, help modal, recommendations drawer, proof drawer, score breakdown drawer.
- Content hierarchy: active deck title and deck tabs; persistent decklist; graph canvas; selected-card detail; score/recommendation/proof supporting panels.

## Design principles
- Principle 1: Make hidden structure explicit. Show merged analysis data and the source card/fact details that explain it.
- Principle 2: Preserve graph density while adding progressive disclosure. Scan-level badges belong in lists; full explanations belong in detail panels.
- Tradeoffs: compact panels may need scrolling for long oracle/proof text; prefer scrollable detail over new full-screen routes for local inspection.

## Visual language
- Color: dark panels, muted borders, red accent for action/selection, blue chips for interaction/fact metadata, gold for mana/commander emphasis.
- Typography: system UI, compact uppercase section labels, high-contrast card names and numeric badges.
- Spacing/layout rhythm: dense grid/list spacing with 6-14px gaps; drawers use card-like sections.
- Shape/radius/elevation: rounded dark cards, subtle borders, elevated overlays for detail and drawers.
- Motion: minimal; physics movement belongs to the graph, not UI chrome.
- Imagery/iconography: text-first; icons only when they improve scanning and have labels.

## Components
- Existing components to reuse: `SidebarShell`, `DeckList`, `DeckTabs`, `ImportControls`, `ToolbarButton`, `ModalShell`, score components, recommendation/proof drawers.
- New/changed components: card-face display metadata service; decklist face summary; selected-card detail face panels for double-faced/multi-face cards.
- Variants and states: single-faced cards show no face chrome; multi-face cards show a scan badge and face-by-face detail cards; long details scroll.
- Token/component ownership: maintain current `App.vue` scoped CSS variables and component-local scoped styles; avoid a new design-token layer.

## Accessibility
- Target standard: practical WCAG 2.1 AA for contrast, labels, keyboard activation, and dialog semantics.
- Keyboard/focus behavior: controls are buttons/inputs; overlays expose labels; close controls have aria labels.
- Contrast/readability: muted helper text must remain readable on dark panels; chips must not be color-only where content matters.
- Screen-reader semantics: decklist is a list; card detail uses dialog role; face section has an aria label.
- Reduced motion and sensory considerations: do not add nonessential animation; graph motion remains user-controllable through freeze/re-layout.

## Responsive behavior
- Supported breakpoints/devices: desktop graph-first layout, mobile stacked/drawer layout at existing 860px/520px breakpoints.
- Layout adaptations: detail/proof/category drawers become bottom sheets on mobile and stay scrollable.
- Touch/hover differences: hover tooltip is desktop-only; click/tap detail must contain equivalent information.

## Interaction states
- Loading: full graph overlay with progress labels/counts.
- Empty: decklist/recommendations use explicit empty states.
- Error: import and recommendation flows surface errors inline.
- Success: imported decks appear as tabs and in compare rows.
- Disabled: disabled buttons reduce opacity and keep affordance.
- Offline/slow network, if applicable: static deck data works; live Moxfield import requires configured proxy or file/paste fallback.

## Content voice
- Tone: direct, mechanical, concise.
- Terminology: use Magic/community terms such as deck, card, face, transform, modal double-faced card, interaction web, proof package.
- Microcopy rules: explain why a thing exists in one sentence; prefer “shown separately” over vague “details”.

## Implementation constraints
- Framework/styling system: Vue 3 + TypeScript app with scoped CSS and shared CommonJS model adapters.
- Design-token constraints: reuse `--bg`, `--panel`, `--panel2`, `--line`, `--text`, `--dim`, `--accent`.
- Performance constraints: avoid repeated heavy derived work in render loops; use small computed helpers/services for repeated display metadata.
- Compatibility constraints: GitHub Pages static build, cacheable bootstrap JSON, no browser CommonJS leaks.
- Test/screenshot expectations: protect visible deck controls, static build contract, and special card display through Vitest/static smoke tests.

## Open questions
- [ ] Should the Deck breakdown route eventually include a dedicated “special card structures” section for DFCs, adventures, split cards, and face-compatibility warnings? / Product owner / Medium impact.
- [ ] Should face-specific interaction evidence be surfaced inline next to each interaction row? / Product owner + model owner / Medium impact.
