const assert = require('node:assert/strict');
const {
  buildInteractionHypergraph,
  summarizeHyperedgesToPairEdges,
} = require('../src/interaction-hypergraph');

function card(id, type, text, cmc = 0) {
  return { id, name: id, type_line: type, oracle_text: text, cmc };
}

const cards = [
  card('Self Top Draw Artifact', 'Artifact', '{T}: Draw a card, then put this artifact on top of its owner’s library.', 1, '{1}'),
  card('Artifact Spell Reducer', 'Artifact Creature — Vedalken Artificer', 'Artifact spells you cast cost {1} less to cast.', 2),
  card('Artifact Top Caster', 'Artifact', 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.', 4),
  card('Raise the Alarm', 'Instant', 'Create two 1/1 white Soldier creature tokens.', 2),
  card('Token Doubler', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', 4),
  card('Token Payoff', 'Creature', 'Whenever one or more tokens you control enter, draw a card.', 3),
  card('Free Body', 'Creature', 'When this creature dies, draw a card.', 1),
  card('Sac Outlet', 'Creature', 'Sacrifice a creature: Add {C}.', 1),
  card('Death Payoff', 'Creature', 'Whenever another creature dies, each opponent loses 1 life.', 2),
  card('Heartstone', 'Artifact', "Activated abilities of creatures cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.", 3),
  card('Xantcha', 'Legendary Creature', "{3}: Xantcha's controller loses 2 life and you draw a card. Any player may activate this ability.", 3),
  card('Draw Punisher', 'Creature', 'Whenever you draw a card, each opponent loses 1 life.', 3),
];

const graph = buildInteractionHypergraph(cards, { perCardPairLimit: 10, perCardTripleLimit: 20 });
assert.equal(graph.version, 'interaction-hypergraph.v1');
assert.ok(graph.hyperedges.length > 0);

function findFamily(family, requiredCards) {
  return graph.hyperedges.find(edge =>
    edge.family === family
    && requiredCards.every(cardName => edge.cards.includes(cardName))
  );
}

function assertProof(edge) {
  assert.ok(edge.id.startsWith('hyper:'), 'stable hyperedge id expected');
  assert.ok(edge.requires.length, `${edge.family} requires typed facts`);
  assert.ok(edge.produces.length, `${edge.family} produces derived facts`);
  assert.ok(edge.proof.cards.length >= 2);
  assert.ok(edge.proof.steps.length >= 2);
  assert.ok(Array.isArray(edge.proof.assumptions));
  assert.ok(Array.isArray(edge.proof.resourceDeltas));
  assert.ok(edge.proof.repeatability.status);
  assert.ok(Array.isArray(edge.proof.limitingClauses));
  assert.ok(Array.isArray(edge.proof.evidence));
}

const topLoop = findFamily('artifact-top-cost-reduction-loop', ['Self Top Draw Artifact', 'Artifact Spell Reducer', 'Artifact Top Caster']);
assert.ok(topLoop, 'three-card artifact top loop should be represented as a hyperedge');
assert.equal(topLoop.strength, 'combo-critical');
assert.equal(topLoop.confidence, 'pattern');
assertProof(topLoop);
assert.ok(topLoop.produces.some(fact => fact.kind === 'combo.loop'));

const tokenPackage = findFamily('token-source-modifier-payoff', ['Raise the Alarm', 'Token Doubler', 'Token Payoff']);
assert.ok(tokenPackage, 'token source + modifier + payoff should be represented as one hyperedge');
assertProof(tokenPackage);

const aristocrats = findFamily('aristocrats-body-outlet-payoff', ['Free Body', 'Sac Outlet', 'Death Payoff']);
assert.ok(aristocrats, 'body + outlet + death payoff should be represented as one hyperedge');
assertProof(aristocrats);

const reducerPackage = findFamily('cost-reducer-activated-output-payoff', ['Heartstone', 'Xantcha', 'Draw Punisher']);
assert.ok(reducerPackage, 'cost reducer + activated output + payoff should be represented as one hyperedge');
assert.equal(reducerPackage.confidence, 'heuristic');
assertProof(reducerPackage);

const summaries = summarizeHyperedgesToPairEdges([topLoop, tokenPackage, aristocrats, reducerPackage]);
const topSummaries = summaries.filter(edge => edge.hyperedgeIds.includes(topLoop.id));
assert.equal(topSummaries.length, 3, 'three-card hyperedge should produce three UI pair summaries');
assert.ok(topSummaries.every(edge => edge.isHyperedgeSummary));
assert.ok(topSummaries.every(edge => edge.isComboCritical === false), 'three-card combo summaries must not become pairwise combo-critical cliques');
assert.ok(topSummaries.every(edge => edge.strength !== 'combo-critical'));

const reducerSummaries = summaries.filter(edge => edge.hyperedgeIds.includes(reducerPackage.id));
assert.equal(reducerSummaries.length, 3);
assert.ok(reducerSummaries.every(edge => edge.family === 'cost-reducer-activated-output-payoff'));

process.stdout.write('Interaction hypergraph tests passed\n');
