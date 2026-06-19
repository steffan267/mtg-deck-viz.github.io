#!/usr/bin/env node
/*
 * audit-interaction-baseline.js — deterministic phase-0 lock for the current
 * interaction graph. It records representative deck counts, inspectable hubs,
 * combo detections, and golden fixtures before the rulesbuilder evolves into
 * layered proof search.
 *
 * The output is intentionally compact and stable: no timestamps, no random
 * ordering, and no full edge dumps. Use it as a reviewed baseline, not as a
 * substitute for the richer exploratory coverage audit.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { loadCards, build, parseDecklist } = require('../src/build-deck-viz');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'analysis/interaction-baseline');
const DEFAULT_JSON_OUT = 'interaction-baseline.json';
const DEFAULT_MD_OUT = 'interaction-baseline.md';
const SCHEMA_VERSION = 'interaction-baseline.v1';

const REVIEW_THRESHOLDS = {
  goldenFixtureFailuresAllowed: 0,
  missingFixtureCardsAllowed: 0,
  weakInteractionShareWarnAt: 0.7,
  familyFanoutWarnAt: 18,
  weakFamilyFanoutWarnAt: 12,
  nodeDegreeWarnAt: 20,
  comboCriticalPairCountWarnAt: 6,
  edgeCountDeltaPctReviewAt: 5,
  comboCriticalCountDeltaReviewAt: 1,
};

const PHASE_QA_GATE = {
  phase: 'G001-baseline-lock-and-audit-harness',
  requiredCommands: [
    'node scripts/audit-interaction-baseline.js --check',
    'node test/interaction-baseline.test.js',
    'npm test',
    'npm run check',
  ],
  passCriteria: [
    'baseline JSON and Markdown are deterministic and match the checked-in artifacts',
    'all golden fixtures pass with zero missing cards and zero unexpected combo-class regressions',
    'full repository tests and syntax/type checks pass, or unrelated pre-existing gaps are recorded in the checkpoint evidence',
  ],
};

const ABSTRACT_CARDS = {
  'Self Top Draw Artifact': resolvedCard(
    'Self Top Draw Artifact',
    'Artifact',
    '{1}: Draw a card, then put this artifact on top of its owner’s library.',
    1,
  ),
  'Artifact Spell Reducer': resolvedCard(
    'Artifact Spell Reducer',
    'Artifact Creature — Vedalken Artificer',
    'Artifact spells you cast cost {1} less to cast.',
    2,
  ),
  'Artifact Top Caster': resolvedCard(
    'Artifact Top Caster',
    'Artifact',
    'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.',
    4,
  ),
  'Library Exiling Tutor': resolvedCard(
    'Library Exiling Tutor',
    'Instant',
    'Name a card. Exile the top six cards of your library, then reveal cards from the top of your library until you reveal the named card. Put that card into your hand and exile all other cards revealed this way.',
    1,
  ),
  'Empty Library Oracle': resolvedCard(
    'Empty Library Oracle',
    'Creature — Merfolk Wizard',
    'When this creature enters, look at the top X cards of your library, where X is your devotion to blue. If X is greater than or equal to the number of cards in your library, you win the game.',
    2,
  ),
};

const BASELINE_DECKS = [
  {
    id: 'sample-xantcha',
    title: 'Sample Xantcha decklist',
    kind: 'representative-local-deck',
    source: 'data/sample-decklist.txt',
  },
  {
    id: 'combo-and-false-positive-suite',
    title: 'Combo and false-positive suite',
    kind: 'synthetic-real-card-suite',
    decklistText: [
      '1 Xantcha, Sleeper Agent',
      '1 Heartstone',
      '1 Sol Ring',
      '1 Mana Vault',
      '1 Deadeye Navigator',
      '1 Peregrine Drake',
      '1 Cloud of Faeries',
      '1 Ephemerate',
      '1 Sanguine Bond',
      '1 Exquisite Blood',
      '1 Vito, Thorn of the Dusk Rose',
      '1 Smothering Tithe',
      '1 Academy Manufactor',
      '1 Wheel of Fortune',
      '1 Nuka-Cola Vending Machine',
      '1 Haldan, Avid Arcanist',
      '1 Pako, Arcane Retriever',
      '1 Prosper, Tome-Bound',
    ].join('\n'),
  },
  {
    id: 'abstract-layered-combo-suite',
    title: 'Abstract layered combo suite',
    kind: 'synthetic-oracle-text-suite',
    decklist: [
      entryFor('Self Top Draw Artifact'),
      entryFor('Artifact Spell Reducer'),
      entryFor('Artifact Top Caster'),
      entryFor('Library Exiling Tutor'),
      entryFor('Empty Library Oracle'),
    ],
  },
];

const GOLDEN_FIXTURES = [
  {
    id: 'creature-cost-reducer-scope-positive',
    title: 'Creature-scoped cost reducer links to creature activated ability',
    cards: ['Heartstone', 'Xantcha, Sleeper Agent'],
    expect: {
      edge: true,
      families: ['cost-reduction→ability'],
      strengths: ['weak'],
      noComboPair: true,
    },
    rationale: 'Heartstone should not be flattened into generic tap-ability reduction, but it should still help Xantcha.',
  },
  {
    id: 'creature-cost-reducer-scope-negative',
    title: 'Creature-scoped cost reducer does not fan out to mana rocks',
    cards: ['Heartstone', 'Sol Ring'],
    expect: {
      edge: false,
      noComboPair: true,
    },
    rationale: 'This is the canonical false-positive guard for reducer fan-out.',
  },
  {
    id: 'repeatable-blink-land-untap-combo',
    title: 'Repeatable blink plus land-untap ETB is combo-critical',
    cards: ['Deadeye Navigator', 'Peregrine Drake'],
    expect: {
      edge: true,
      families: ['blink→land-untap-etb'],
      strengths: ['combo-critical'],
      comboPairFamilies: ['blink→land-untap-etb'],
    },
    rationale: 'A one-two layered combo must be promoted from ordinary ETB synergy to combo-critical.',
  },
  {
    id: 'single-shot-blink-is-not-infinite',
    title: 'Single-shot blink plus land-untap ETB is not combo-critical',
    cards: ['Ephemerate', 'Peregrine Drake'],
    expect: {
      edge: true,
      families: ['etb→blink'],
      strengths: ['strong'],
      noComboPair: true,
    },
    rationale: 'The audit distinguishes strong value synergy from repeatable combo closure.',
  },
  {
    id: 'lifegain-lifeloss-two-card-loop',
    title: 'Reciprocal life gain/life loss loop is combo-critical',
    cards: ['Sanguine Bond', 'Exquisite Blood'],
    expect: {
      edge: true,
      families: ['lifeloss→lifegain-loop', 'lifegain→lifeloss-loop'],
      strengths: ['combo-critical'],
      comboPairFamilies: ['lifeloss→lifegain-loop', 'lifegain→lifeloss-loop'],
    },
    rationale: 'Bidirectional reaction loops must surface both directions for explainability.',
  },
  {
    id: 'token-amplifier-without-treasure-overreach',
    title: 'Token amplifier links without treasure/mana overreach',
    cards: ['Smothering Tithe', 'Academy Manufactor'],
    expect: {
      edge: true,
      families: ['token-production→amplifier'],
      forbiddenEvents: ['treasure', 'mana'],
      noComboPair: true,
    },
    rationale: 'Reminder text and artifact-token subtypes must not leak into broad mana/treasure false positives.',
  },
  {
    id: 'opponent-draw-feeds-smothering-tithe',
    title: 'Wheel draw feeds Smothering Tithe as a weak reaction',
    cards: ['Smothering Tithe', 'Naktamun Lorespinner // Wheel of Fortune'],
    expect: {
      edge: true,
      families: ['draw'],
      strengths: ['weak'],
      noComboPair: true,
    },
    rationale: 'Opponent-draw triggers are useful context but should remain low-strength unless another layer closes a loop.',
  },
  {
    id: 'partner-exile-access',
    title: 'Pako/Haldan style fetch-counter access is linked',
    cards: ['Haldan, Avid Arcanist', 'Pako, Arcane Retriever'],
    expect: {
      edge: true,
      families: ['exiled-card-access'],
      strengths: ['strong'],
      noComboPair: true,
    },
    rationale: 'Cross-card access to exiled cards is a domain-specific interaction that generic exile detection misses.',
  },
  {
    id: 'three-card-artifact-top-loop',
    title: 'Artifact top loop requires three pieces',
    cards: ['Self Top Draw Artifact', 'Artifact Spell Reducer', 'Artifact Top Caster'],
    resolvedCards: pickResolved(['Self Top Draw Artifact', 'Artifact Spell Reducer', 'Artifact Top Caster']),
    expect: {
      edge: true,
      families: ['artifact-cost-reduction→top-loop-piece', 'cast-from-top→top-loop-piece'],
      noComboPair: true,
      comboTripleFamily: 'artifact-top-cost-reduction-loop',
    },
    rationale: 'A three-piece engine should be detected as a triple, not downgraded to a misleading two-card pair.',
  },
  {
    id: 'library-exile-empty-library-win',
    title: 'Library exile can feed empty-library win condition',
    cards: ['Library Exiling Tutor', 'Empty Library Oracle'],
    resolvedCards: pickResolved(['Library Exiling Tutor', 'Empty Library Oracle']),
    expect: {
      edge: true,
      families: ['library-exile→empty-library-win'],
      strengths: ['combo-critical'],
      comboPairFamilies: ['library-exile→empty-library-win'],
    },
    rationale: 'Layered win-condition detection needs text-derived capability edges, not name dictionaries.',
  },
];

function resolvedCard(name, typeLine, oracleText, cmc = 0, extra = {}) {
  return {
    name,
    type_line: typeLine,
    oracle_text: oracleText,
    mana_cost: extra.mana_cost || '',
    cmc,
    color_identity: extra.color_identity || [],
    edhrec_rank: extra.edhrec_rank || null,
  };
}

function entryFor(name) {
  return { qty: 1, name, resolved: ABSTRACT_CARDS[name] };
}

function pickResolved(names) {
  return Object.fromEntries(names.map(name => [name, ABSTRACT_CARDS[name]]));
}

function usage() {
  process.stderr.write([
    'Usage: node scripts/audit-interaction-baseline.js [--write|--check] [--out-dir dir]',
    '',
    '  --write          write analysis/interaction-baseline JSON and Markdown artifacts',
    '  --check          fail if generated artifacts differ from checked-in artifacts',
    '  --out-dir dir    override output directory',
    '',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = { mode: 'print', outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    if (a === '--write') { args.mode = 'write'; continue; }
    if (a === '--check') { args.mode = 'check'; continue; }
    if (a === '--out-dir') { args.outDir = path.resolve(argv[++i]); continue; }
    throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function sha256(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function sortedObject(obj) {
  return Object.fromEntries(Object.entries(obj || {}).sort(([a], [b]) => a.localeCompare(b)));
}

function increment(map, key, by = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + by;
}

function decklistFromSpec(spec) {
  if (spec.decklist) return spec.decklist;
  if (spec.decklistText) return parseDecklist(spec.decklistText);
  if (spec.source) {
    const file = path.join(ROOT, spec.source);
    return parseDecklist(fs.readFileSync(file, 'utf8'));
  }
  throw new Error(`Deck spec ${spec.id} has no source or decklist`);
}

function graphForFixture(fixture, idx) {
  const decklist = fixture.cards.map(name => ({
    qty: 1,
    name,
    resolved: fixture.resolvedCards && fixture.resolvedCards[name],
  }));
  return build(decklist, idx);
}

function edgeBetween(graph, cards) {
  const wanted = new Set(cards);
  return (graph.edges || []).filter(edge => wanted.has(edge.source) && wanted.has(edge.target));
}

function sortedInteractions(interactions) {
  return (interactions || [])
    .map(it => ({
      family: it.family,
      event: it.event,
      kind: it.kind,
      strength: it.strength,
      direction: it.direction,
    }))
    .sort((a, b) =>
      a.family.localeCompare(b.family)
      || a.event.localeCompare(b.event)
      || a.direction.localeCompare(b.direction)
      || a.strength.localeCompare(b.strength)
      || a.kind.localeCompare(b.kind));
}

function edgeFamilies(edges) {
  return [...new Set(edges.flatMap(edge => (edge.interactions || []).map(it => it.family)).filter(Boolean))].sort();
}

function edgeEvents(edges) {
  return [...new Set(edges.flatMap(edge => (edge.interactions || []).map(it => it.event || it.family)).filter(Boolean))].sort();
}

function edgeStrengths(edges) {
  return [...new Set(edges.flatMap(edge => (edge.interactions || []).map(it => it.strength)).filter(Boolean))].sort();
}

function comboPairsForCards(graph, cards) {
  const set = new Set(cards);
  return (graph.metrics.comboCriticalPairs || [])
    .filter(pair => set.has(pair.a) && set.has(pair.b))
    .map(pair => ({
      cards: [pair.a, pair.b].sort(),
      family: pair.family,
      families: (pair.families || [pair.family]).slice().sort(),
    }))
    .sort((a, b) => a.cards.join('|').localeCompare(b.cards.join('|')) || a.family.localeCompare(b.family));
}

function comboTriplesForCards(graph, cards) {
  const key = cards.slice().sort().join('|');
  return (graph.metrics.comboCriticalTriples || [])
    .filter(triple => (triple.cards || []).slice().sort().join('|') === key)
    .map(triple => ({
      cards: (triple.cards || []).slice().sort(),
      family: triple.family,
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

function includesAll(actual, expected) {
  return (expected || []).every(x => actual.includes(x));
}

function excludesAll(actual, forbidden) {
  return !(forbidden || []).some(x => actual.includes(x));
}

function fixtureChecks(fixture, graph, edges) {
  const expected = fixture.expect || {};
  const families = edgeFamilies(edges);
  const events = edgeEvents(edges);
  const strengths = edgeStrengths(edges);
  const comboPairs = comboPairsForCards(graph, fixture.cards);
  const comboTriples = comboTriplesForCards(graph, fixture.cards);
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  if (Object.hasOwn(expected, 'edge')) add('edge-presence', edges.length > 0 === expected.edge, `expected edge=${expected.edge}, observed ${edges.length}`);
  if (expected.families) add('required-families', includesAll(families, expected.families), `required ${expected.families.join(', ') || '(none)'}`);
  if (expected.forbiddenFamilies) add('forbidden-families', excludesAll(families, expected.forbiddenFamilies), `forbidden ${expected.forbiddenFamilies.join(', ') || '(none)'}`);
  if (expected.forbiddenEvents) add('forbidden-events', excludesAll(events, expected.forbiddenEvents), `forbidden ${expected.forbiddenEvents.join(', ') || '(none)'}`);
  if (expected.strengths) add('required-strengths', includesAll(strengths, expected.strengths), `required ${expected.strengths.join(', ') || '(none)'}`);
  if (expected.noComboPair) add('no-combo-pair', comboPairs.length === 0, `observed ${comboPairs.length}`);
  if (expected.comboPairFamilies) {
    const pairFamilies = [...new Set(comboPairs.flatMap(pair => pair.families || [pair.family]))].sort();
    add('combo-pair-families', includesAll(pairFamilies, expected.comboPairFamilies), `required ${expected.comboPairFamilies.join(', ')}`);
  }
  if (expected.comboTripleFamily) {
    add('combo-triple-family', comboTriples.some(triple => triple.family === expected.comboTripleFamily), `required ${expected.comboTripleFamily}`);
  }
  return checks;
}

function evaluateGoldenFixtures(idx, fixtures = GOLDEN_FIXTURES) {
  return fixtures.map(fixture => {
    const graph = graphForFixture(fixture, idx);
    const edges = edgeBetween(graph, fixture.cards);
    const checks = fixtureChecks(fixture, graph, edges);
    return {
      id: fixture.id,
      title: fixture.title,
      cards: fixture.cards.slice().sort(),
      status: graph.missing.length === 0 && checks.every(check => check.pass) ? 'pass' : 'fail',
      rationale: fixture.rationale,
      missing: graph.missing.slice().sort(),
      expected: fixture.expect,
      observed: {
        edgeCount: edges.length,
        families: edgeFamilies(edges),
        events: edgeEvents(edges),
        strengths: edgeStrengths(edges),
        interactions: sortedInteractions(edges.flatMap(edge => edge.interactions || [])),
        comboCriticalPairs: comboPairsForCards(graph, fixture.cards),
        comboCriticalTriples: comboTriplesForCards(graph, fixture.cards),
      },
      checks,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function summarizeDeck(spec, graph) {
  const cards = graph.nodes.filter(node => node.role !== 'zone');
  const nonland = cards.filter(node => node.role !== 'land');
  const familyCounts = {};
  const eventCounts = {};
  const strengthCounts = {};
  const kindCounts = {};
  const familyStrengths = {};
  let interactionCount = 0;

  for (const edge of graph.edges || []) {
    for (const interaction of edge.interactions || []) {
      interactionCount++;
      increment(familyCounts, interaction.family);
      increment(eventCounts, interaction.event || interaction.family);
      increment(strengthCounts, interaction.strength);
      increment(kindCounts, interaction.kind);
      if (interaction.family) {
        const slot = familyStrengths[interaction.family] || (familyStrengths[interaction.family] = {});
        increment(slot, interaction.strength);
      }
    }
  }

  const topHubs = cards
    .slice()
    .sort((a, b) => (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id))
    .slice(0, 8)
    .map(node => {
      const incidentFamilyCounts = {};
      for (const edge of graph.edges || []) {
        if (edge.source !== node.id && edge.target !== node.id) continue;
        for (const interaction of edge.interactions || []) increment(incidentFamilyCounts, interaction.family);
      }
      return {
        id: node.id,
        role: node.role,
        degree: node.degree || 0,
        cmc: node.cmc == null ? 0 : node.cmc,
        topFamilies: Object.entries(incidentFamilyCounts)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([family, count]) => ({ family, count })),
      };
    });

  const highDegreeNodes = topHubs.filter(node => node.degree >= REVIEW_THRESHOLDS.nodeDegreeWarnAt);
  const highFamilyFanout = Object.entries(familyCounts)
    .filter(([, count]) => count >= REVIEW_THRESHOLDS.familyFanoutWarnAt)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([family, count]) => ({ family, count }));
  const highWeakFamilyFanout = Object.entries(familyCounts)
    .filter(([family, count]) => count >= REVIEW_THRESHOLDS.weakFamilyFanoutWarnAt && (familyStrengths[family] || {}).weak === count)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([family, count]) => ({ family, count }));
  const weakInteractionShare = interactionCount ? +((strengthCounts.weak || 0) / interactionCount).toFixed(3) : 0;

  return {
    id: spec.id,
    title: spec.title,
    kind: spec.kind,
    source: spec.source || '(inline synthetic decklist)',
    cardCount: cards.length,
    nonlandCount: nonland.length,
    missing: graph.missing.slice().sort(),
    edgeCount: graph.edges.length,
    zoneEdgeCount: graph.zoneEdges.length,
    interactionCount,
    familyCounts: sortedObject(familyCounts),
    eventCounts: sortedObject(eventCounts),
    strengthCounts: sortedObject(strengthCounts),
    kindCounts: sortedObject(kindCounts),
    combos: {
      mutualEnablementLoops: (graph.metrics.combos || []).map(loop => loop.slice().sort()).sort(),
      comboCriticalPairCount: (graph.metrics.comboCriticalPairs || []).length,
      comboCriticalPairs: (graph.metrics.comboCriticalPairs || []).map(pair => ({
        cards: [pair.a, pair.b].sort(),
        family: pair.family,
        families: (pair.families || [pair.family]).slice().sort(),
      })).sort((a, b) => a.cards.join('|').localeCompare(b.cards.join('|')) || a.family.localeCompare(b.family)),
      comboCriticalTripleCount: (graph.metrics.comboCriticalTriples || []).length,
      comboCriticalTriples: (graph.metrics.comboCriticalTriples || []).map(triple => ({
        cards: (triple.cards || []).slice().sort(),
        family: triple.family,
      })).sort((a, b) => a.cards.join('|').localeCompare(b.cards.join('|')) || a.family.localeCompare(b.family)),
    },
    topHubs,
    reviewWarnings: {
      weakInteractionShare,
      weakInteractionShareExceedsThreshold: weakInteractionShare >= REVIEW_THRESHOLDS.weakInteractionShareWarnAt,
      highDegreeNodes,
      highFamilyFanout,
      highWeakFamilyFanout,
      comboCriticalPairCountExceedsThreshold: (graph.metrics.comboCriticalPairs || []).length >= REVIEW_THRESHOLDS.comboCriticalPairCountWarnAt,
    },
    metricsSnapshot: {
      cohesionScore: graph.metrics.cohesionScore,
      cohesionBand: graph.metrics.cohesionBand,
      selfSufficiencyScore: graph.metrics.selfSufficiencyScore,
      winTuningScore: graph.metrics.winTuningScore,
      winTuningBand: graph.metrics.winTuningBand,
      bracketHint: graph.metrics.bracketHint,
      bracketLabel: graph.metrics.bracketLabel,
      pctInteractive: graph.metrics.pctInteractive,
      pctMeaningful: graph.metrics.pctMeaningful,
      largestWebShare: graph.metrics.largestWebShare,
      avgDegree: graph.metrics.avgDegree,
      satWeightedAvgDegree: graph.metrics.satWeightedAvgDegree,
      islandCount: graph.metrics.islandCount,
    },
  };
}

function dataFingerprint() {
  // Hash input data only. The baseline JSON/Markdown already capture derived
  // graph behavior; hashing implementation files here would force artifact
  // churn for internal refactors that intentionally preserve those counts.
  const files = [
    'data/out/commander-search.json',
    'data/out/oracle-cards.json',
    'data/sample-decklist.txt',
  ];
  return Object.fromEntries(files.map(file => [file, sha256(path.join(ROOT, file))]));
}

function assertLocalDataAvailable() {
  const required = [
    'data/out/commander-search.json',
    'data/out/oracle-cards.json',
    'data/sample-decklist.txt',
  ];
  const missing = required.filter(file => !fs.existsSync(path.join(ROOT, file)));
  if (missing.length) {
    throw new Error(`Baseline audit requires local card data: missing ${missing.join(', ')}. Run npm run build-data first.`);
  }
}

function buildBaseline(options = {}) {
  if (options.requireLocalData !== false) assertLocalDataAvailable();
  const idx = options.idx || loadCards();
  const decks = (options.decks || BASELINE_DECKS).map(spec => summarizeDeck(spec, build(decklistFromSpec(spec), idx)));
  const goldenFixtures = evaluateGoldenFixtures(idx, options.fixtures || GOLDEN_FIXTURES);
  const aggregateFamilyCounts = {};
  const aggregateEventCounts = {};
  for (const deck of decks) {
    for (const [family, count] of Object.entries(deck.familyCounts)) increment(aggregateFamilyCounts, family, count);
    for (const [event, count] of Object.entries(deck.eventCounts)) increment(aggregateEventCounts, event, count);
  }

  const failingFixtures = goldenFixtures.filter(fixture => fixture.status !== 'pass');
  const missingFixtureCards = goldenFixtures.flatMap(fixture => fixture.missing);
  const missingDeckCards = decks.flatMap(deck => deck.missing.map(card => ({ deckId: deck.id, card })));
  return {
    schemaVersion: SCHEMA_VERSION,
    purpose: 'Phase-0 baseline for evolving MTG interaction detection from pairwise heuristic edges toward layered, bounded combo proof search.',
    generatedBy: 'scripts/audit-interaction-baseline.js',
    deterministic: true,
    dataFingerprint: dataFingerprint(),
    thresholds: REVIEW_THRESHOLDS,
    qaGate: PHASE_QA_GATE,
    aggregate: {
      deckCount: decks.length,
      totalEdges: decks.reduce((sum, deck) => sum + deck.edgeCount, 0),
      totalInteractions: decks.reduce((sum, deck) => sum + deck.interactionCount, 0),
      totalComboCriticalPairs: decks.reduce((sum, deck) => sum + deck.combos.comboCriticalPairCount, 0),
      totalComboCriticalTriples: decks.reduce((sum, deck) => sum + deck.combos.comboCriticalTripleCount, 0),
      familyCounts: sortedObject(aggregateFamilyCounts),
      eventCounts: sortedObject(aggregateEventCounts),
      goldenFixtureCount: goldenFixtures.length,
      goldenFixtureFailures: failingFixtures.map(fixture => fixture.id),
      missingFixtureCards: [...new Set(missingFixtureCards)].sort(),
      missingDeckCards,
      qaStatus: failingFixtures.length === 0 && missingFixtureCards.length === 0 ? 'ready' : 'blocked',
    },
    decks,
    goldenFixtures,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Interaction baseline audit');
  lines.push('');
  lines.push(`Schema: \`${report.schemaVersion}\``);
  lines.push('');
  lines.push(report.purpose);
  lines.push('');
  lines.push('## QA gate');
  lines.push('');
  for (const command of report.qaGate.requiredCommands) lines.push(`- \`${command}\``);
  lines.push('');
  lines.push('Pass criteria:');
  for (const criterion of report.qaGate.passCriteria) lines.push(`- ${criterion}`);
  lines.push('');
  lines.push('## Thresholds');
  lines.push('');
  lines.push(`- Golden fixture failures allowed: ${report.thresholds.goldenFixtureFailuresAllowed}`);
  lines.push(`- Missing fixture cards allowed: ${report.thresholds.missingFixtureCardsAllowed}`);
  lines.push(`- Weak interaction share warning: ${Math.round(report.thresholds.weakInteractionShareWarnAt * 100)}%`);
  lines.push(`- Family fan-out warning: ${report.thresholds.familyFanoutWarnAt} interactions`);
  lines.push(`- Weak-family fan-out warning: ${report.thresholds.weakFamilyFanoutWarnAt} interactions`);
  lines.push(`- Node degree warning: ${report.thresholds.nodeDegreeWarnAt} edges`);
  lines.push(`- Edge-count drift review: ${report.thresholds.edgeCountDeltaPctReviewAt}%`);
  lines.push('');
  lines.push('## Aggregate snapshot');
  lines.push('');
  lines.push(`- Decks: ${report.aggregate.deckCount}`);
  lines.push(`- Total edges: ${report.aggregate.totalEdges}`);
  lines.push(`- Total interactions: ${report.aggregate.totalInteractions}`);
  lines.push(`- Combo-critical pairs: ${report.aggregate.totalComboCriticalPairs}`);
  lines.push(`- Combo-critical triples: ${report.aggregate.totalComboCriticalTriples}`);
  lines.push(`- Golden fixtures: ${report.aggregate.goldenFixtureCount}`);
  lines.push(`- Golden fixture failures: ${report.aggregate.goldenFixtureFailures.length ? report.aggregate.goldenFixtureFailures.join(', ') : 'none'}`);
  lines.push(`- Missing fixture cards: ${report.aggregate.missingFixtureCards.length ? report.aggregate.missingFixtureCards.join(', ') : 'none'}`);
  lines.push(`- Missing representative-deck cards: ${report.aggregate.missingDeckCards.length ? report.aggregate.missingDeckCards.map(x => `${x.deckId}:${x.card}`).join(', ') : 'none'}`);
  lines.push(`- QA status: ${report.aggregate.qaStatus}`);
  lines.push('');
  lines.push('## Deck summaries');
  lines.push('');
  for (const deck of report.decks) {
    lines.push(`### ${deck.title}`);
    lines.push('');
    lines.push(`- ID: \`${deck.id}\``);
    lines.push(`- Kind/source: ${deck.kind}; ${deck.source}`);
    lines.push(`- Cards/nonlands: ${deck.cardCount}/${deck.nonlandCount}`);
    lines.push(`- Missing: ${deck.missing.length ? deck.missing.join(', ') : 'none'}`);
    lines.push(`- Edges/interactions: ${deck.edgeCount}/${deck.interactionCount}`);
    lines.push(`- Combo-critical pairs/triples: ${deck.combos.comboCriticalPairCount}/${deck.combos.comboCriticalTripleCount}`);
    lines.push(`- Cohesion/win tuning: ${deck.metricsSnapshot.cohesionScore} (${deck.metricsSnapshot.cohesionBand}) / ${deck.metricsSnapshot.winTuningScore} (${deck.metricsSnapshot.winTuningBand})`);
    lines.push(`- Bracket hint: ${deck.metricsSnapshot.bracketLabel}`);
    lines.push(`- Review warnings: weak share ${deck.reviewWarnings.weakInteractionShare}; high-degree nodes ${deck.reviewWarnings.highDegreeNodes.length}; high fan-out families ${deck.reviewWarnings.highFamilyFanout.length}`);
    lines.push('- Top hubs:');
    for (const hub of deck.topHubs.slice(0, 5)) {
      const fams = hub.topFamilies.map(f => `${f.family} ${f.count}`).join(', ') || 'none';
      lines.push(`  - ${hub.id}: degree ${hub.degree}; ${fams}`);
    }
    lines.push('');
  }
  lines.push('## Golden fixtures');
  lines.push('');
  for (const fixture of report.goldenFixtures) {
    lines.push(`### ${fixture.title}`);
    lines.push('');
    lines.push(`- ID: \`${fixture.id}\``);
    lines.push(`- Status: ${fixture.status}`);
    lines.push(`- Cards: ${fixture.cards.join(' + ')}`);
    lines.push(`- Families observed: ${fixture.observed.families.join(', ') || 'none'}`);
    lines.push(`- Combo pairs/triples observed: ${fixture.observed.comboCriticalPairs.length}/${fixture.observed.comboCriticalTriples.length}`);
    lines.push(`- Rationale: ${fixture.rationale}`);
    lines.push('');
  }
  return lines.join('\n');
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function outputPaths(outDir) {
  return {
    json: path.join(outDir, DEFAULT_JSON_OUT),
    md: path.join(outDir, DEFAULT_MD_OUT),
  };
}

function writeArtifacts(report, outDir) {
  const files = outputPaths(outDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(files.json, stableJson(report));
  fs.writeFileSync(files.md, renderMarkdown(report) + '\n');
  return files;
}

function checkArtifacts(report, outDir) {
  const files = outputPaths(outDir);
  const expected = {
    json: stableJson(report),
    md: renderMarkdown(report) + '\n',
  };
  const mismatches = [];
  for (const [key, file] of Object.entries(files)) {
    const actual = readIfExists(file);
    if (actual !== expected[key]) mismatches.push(rel(file));
  }
  return mismatches;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const report = buildBaseline();
  if (report.aggregate.goldenFixtureFailures.length > REVIEW_THRESHOLDS.goldenFixtureFailuresAllowed) {
    process.stderr.write(`Golden fixture failures: ${report.aggregate.goldenFixtureFailures.join(', ')}\n`);
    process.exitCode = 1;
  }
  if (report.aggregate.missingFixtureCards.length > REVIEW_THRESHOLDS.missingFixtureCardsAllowed) {
    process.stderr.write(`Missing fixture cards: ${report.aggregate.missingFixtureCards.join(', ')}\n`);
    process.exitCode = 1;
  }

  if (args.mode === 'write') {
    const files = writeArtifacts(report, args.outDir);
    process.stdout.write(`Wrote ${rel(files.json)} and ${rel(files.md)}\n`);
    return;
  }
  if (args.mode === 'check') {
    const mismatches = checkArtifacts(report, args.outDir);
    if (mismatches.length) {
      process.stderr.write(`Interaction baseline drift detected in: ${mismatches.join(', ')}\n`);
      process.stderr.write('Run `node scripts/audit-interaction-baseline.js --write` after reviewing intentional interaction-model changes.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write('Interaction baseline artifacts are current\n');
    return;
  }
  process.stdout.write(stableJson(report));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
} else {
  module.exports = {
    ABSTRACT_CARDS,
    BASELINE_DECKS,
    GOLDEN_FIXTURES,
    PHASE_QA_GATE,
    REVIEW_THRESHOLDS,
    buildBaseline,
    checkArtifacts,
    evaluateGoldenFixtures,
    renderMarkdown,
    summarizeDeck,
  };
}
