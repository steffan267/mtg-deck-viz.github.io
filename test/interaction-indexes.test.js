const assert = require('node:assert/strict');
const {
  buildInteractionIndexes,
  candidateClosures,
  candidatePairs,
  candidateTriples,
} = require('../src/interaction-indexes');

function card(id, type, text, cmc = 0, mana_cost = '') {
  return { id, name: id, type_line: type, oracle_text: text, cmc, mana_cost };
}

const cards = [
  card('Self Top Draw Artifact', 'Artifact', '{1}: Draw a card, then put this artifact on top of its owner’s library.', 1),
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
  card('Black Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard.', 1, '{B}'),
  card('Double Blink Spell', 'Instant', 'Exile up to two target creatures you control, then return those cards to the battlefield under their owner’s control.', 3, '{2}{U}'),
  card('ETB Land Untapper', 'Creature — Drake', 'When this creature enters, untap up to five lands.', 5, '{4}{U}'),
  card('ETB Spell Recursor', 'Creature — Wizard', 'When this creature enters, return target instant or sorcery card from your graveyard to your hand.', 4, '{2}{U}{U}'),
];

const indexes = buildInteractionIndexes(cards);

assert.equal(indexes.stats.cardCount, cards.length);
assert.ok(indexes.stats.producedEventKinds > 0);
assert.ok(indexes.stats.consumedEventKinds > 0);
assert.ok(indexes.stats.capabilityKinds > 0);
assert.deepEqual(indexes.modifiers.tokenDoublers.tokens, ['Token Doubler']);
assert.deepEqual(indexes.modifiers.costReducers['creature-activated-ability'], ['Heartstone']);
assert.ok(indexes.byCapability['is-self-top-draw-artifact'].includes('Self Top Draw Artifact'));
assert.ok(indexes.byProducedEvent.tokens.includes('Raise the Alarm'));
assert.ok(indexes.byConsumedEvent.tokens.includes('Token Doubler'));
assert.ok(indexes.byCapability['recursive-body-color-b:1'].includes('Black Recursive Cast Body'));
assert.equal(indexes.byCapability['recursive-body-generic-cost:1']?.includes('Black Recursive Cast Body') || false, false);

const tokenPairs = candidatePairs('Raise the Alarm', indexes);
assert.ok(tokenPairs.some(pair => pair.cards.includes('Raise the Alarm') && pair.cards.includes('Token Payoff') && pair.reasons.some(r => r.event === 'tokens')));

const heartstonePairs = candidatePairs('Heartstone', indexes);
assert.ok(heartstonePairs.some(pair => pair.cards.includes('Heartstone') && pair.cards.includes('Xantcha') && pair.reasons.some(r => r.family === 'cost-reduction→ability')));

const topTriples = candidateTriples('Self Top Draw Artifact', indexes);
assert.ok(topTriples.some(triple =>
  triple.family === 'artifact-top-cost-reduction-loop'
  && triple.cards.join('|') === ['Artifact Spell Reducer', 'Artifact Top Caster', 'Self Top Draw Artifact'].join('|')
));

const tokenTriples = candidateTriples('Raise the Alarm', indexes);
assert.ok(tokenTriples.some(triple =>
  triple.family === 'token-source-modifier-payoff'
  && triple.cards.includes('Raise the Alarm')
  && triple.cards.includes('Token Doubler')
  && triple.cards.includes('Token Payoff')
));

const aristocratTriples = candidateTriples('Sac Outlet', indexes);
assert.ok(aristocratTriples.some(triple =>
  triple.family === 'aristocrats-body-outlet-payoff'
  && triple.cards.includes('Free Body')
  && triple.cards.includes('Sac Outlet')
  && triple.cards.includes('Death Payoff')
));

const costReducerTriples = candidateTriples('Heartstone', indexes);
assert.ok(costReducerTriples.some(triple =>
  triple.family === 'cost-reducer-activated-output-payoff'
  && triple.cards.includes('Heartstone')
  && triple.cards.includes('Xantcha')
  && triple.cards.includes('Draw Punisher')
));
const blinkRecursionTriples = candidateTriples('Double Blink Spell', indexes);
assert.ok(blinkRecursionTriples.some(triple =>
  triple.family === 'blink-spell-recursion-land-untap-loop'
  && triple.cards.join('|') === ['Double Blink Spell', 'ETB Land Untapper', 'ETB Spell Recursor'].join('|')
));
assert.ok(candidateTriples('Heartstone', indexes, { limit: 2 }).length <= 2);
assert.ok(candidatePairs('Heartstone', indexes, { limit: 2 }).length <= 2);

const closures = candidateClosures([
  { kind: 'event.produces', event: 'tokens' },
  { kind: 'capability', predicate: 'is-token-doubler' },
], indexes);
assert.deepEqual(closures.capabilities['is-token-doubler'], ['Token Doubler']);
assert.ok(closures.producedEvents.tokens.includes('Token Payoff'));
assert.ok(closures.candidates.includes('Token Doubler'));
assert.ok(closures.candidates.includes('Token Payoff'));

assert.deepEqual(candidatePairs('Missing Card', indexes), []);
assert.deepEqual(candidateTriples('Missing Card', indexes), []);

process.stdout.write('Interaction index tests passed\n');
