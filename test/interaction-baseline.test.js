const assert = require('node:assert/strict');

const {
  BASELINE_DECKS,
  GOLDEN_FIXTURES,
  PHASE_QA_GATE,
  REVIEW_THRESHOLDS,
  buildBaseline,
  renderMarkdown,
} = require('../scripts/audit-interaction-baseline');

const abstractDeck = BASELINE_DECKS.find(deck => deck.id === 'abstract-layered-combo-suite');
const abstractFixtures = GOLDEN_FIXTURES.filter(fixture => fixture.resolvedCards);

const report = buildBaseline({
  requireLocalData: false,
  idx: {},
  decks: [abstractDeck],
  fixtures: abstractFixtures,
});

assert.equal(report.schemaVersion, 'interaction-baseline.v1');
assert.equal(report.deterministic, true);
assert.equal('generatedAt' in report, false, 'baseline reports must not include timestamps');
assert.equal(report.aggregate.deckCount, 1);
assert.equal(report.aggregate.qaStatus, 'ready');
assert.deepEqual(report.aggregate.goldenFixtureFailures, []);
assert.deepEqual(report.aggregate.missingFixtureCards, []);
assert.deepEqual(report.aggregate.missingDeckCards, []);
assert.equal(report.aggregate.totalComboCriticalPairs, 1);
assert.equal(report.aggregate.totalComboCriticalTriples, 1);

assert.equal(REVIEW_THRESHOLDS.goldenFixtureFailuresAllowed, 0);
assert.equal(REVIEW_THRESHOLDS.missingFixtureCardsAllowed, 0);
assert.ok(REVIEW_THRESHOLDS.edgeCountDeltaPctReviewAt > 0);
assert.ok(PHASE_QA_GATE.requiredCommands.includes('node scripts/audit-interaction-baseline.js --check'));
assert.ok(PHASE_QA_GATE.requiredCommands.includes('npm test'));
assert.ok(PHASE_QA_GATE.requiredCommands.includes('npm run check'));

const deck = report.decks[0];
assert.equal(deck.id, 'abstract-layered-combo-suite');
assert.equal(deck.edgeCount, 3);
assert.equal(deck.combos.comboCriticalPairCount, 1);
assert.equal(deck.combos.comboCriticalTripleCount, 1);
assert.deepEqual(deck.combos.comboCriticalTriples[0], {
  cards: ['Artifact Spell Reducer', 'Artifact Top Caster', 'Self Top Draw Artifact'],
  family: 'artifact-top-cost-reduction-loop',
});

const fixtureById = new Map(report.goldenFixtures.map(fixture => [fixture.id, fixture]));
assert.equal(fixtureById.get('three-card-artifact-top-loop').status, 'pass');
assert.equal(fixtureById.get('library-exile-empty-library-win').status, 'pass');
assert.equal(fixtureById.get('three-card-artifact-top-loop').observed.comboCriticalPairs.length, 0);
assert.equal(fixtureById.get('three-card-artifact-top-loop').observed.comboCriticalTriples.length, 1);

const markdown = renderMarkdown(report);
assert.match(markdown, /## QA gate/);
assert.match(markdown, /Artifact top loop requires three pieces/);
assert.match(markdown, /Combo-critical pairs\/triples: 1\/1/);

process.stdout.write('Interaction baseline tests passed\n');
