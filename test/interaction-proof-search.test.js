const assert = require('node:assert/strict');
const {
  boundedProofSearch,
  provePackage,
} = require('../src/interaction-proof-search');

function card(id, type, text, cmc = 0) {
  return { id, name: id, type_line: type, oracle_text: text, cmc };
}

function proofByFamily(result, family) {
  return result.proofs.find(proof => proof.family === family);
}

const selfUntapper = card(
  'Self Untap Dork',
  'Creature — Elf Druid',
  '{T}: Add {G}{G}. {0}: Untap this creature.',
  2,
);
const selfLoop = provePackage([selfUntapper]);
assert.equal(selfLoop.status, 'proven');
assert.ok(proofByFamily(selfLoop, 'self-untap-mana-loop'));
assert.deepEqual(proofByFamily(selfLoop, 'self-untap-mana-loop').positiveDeltas[0], { resource: 'mana', min: 2, max: 2 });

const deadeye = card(
  'Deadeye Navigator',
  'Creature — Spirit',
  '{1}{U}: Exile another target creature you control, then return it to the battlefield under your control.',
  6,
);
const drake = card(
  'Peregrine Drake',
  'Creature — Drake',
  'Flying When this creature enters, untap up to five lands.',
  5,
);
const blinkLoop = provePackage([deadeye, drake]);
assert.equal(blinkLoop.status, 'proven');
const blinkProof = proofByFamily(blinkLoop, 'blink-etb-land-untap-loop');
assert.ok(blinkProof);
assert.equal(blinkProof.positiveDeltas[0].resource, 'mana');
assert.equal(blinkProof.proof.repeatability.status, 'repeatable');

const ephemerate = card(
  'Ephemerate',
  'Instant',
  'Exile target creature you control, then return it to the battlefield under its owner’s control.',
  1,
);
const nearMiss = provePackage([ephemerate, drake]);
assert.equal(nearMiss.status, 'not-repeatable');
assert.ok(nearMiss.rejections.some(rejection => /not repeatable|blink effect is not repeatable/.test(rejection.reason)));

const sanguineBond = card(
  'Sanguine Bond',
  'Enchantment',
  'Whenever you gain life, target opponent loses that much life.',
  5,
);
const exquisiteBlood = card(
  'Exquisite Blood',
  'Enchantment',
  'Whenever an opponent loses life, you gain that much life.',
  5,
);
const lifeLoop = provePackage([sanguineBond, exquisiteBlood]);
assert.equal(lifeLoop.status, 'proven');
assert.ok(proofByFamily(lifeLoop, 'lifegain-lifeloss-loop'));

const topLoop = provePackage([
  card('Self Top Draw Artifact', 'Artifact', '{1}: Draw a card, then put this artifact on top of its owner’s library.', 1),
  card('Artifact Spell Reducer', 'Artifact Creature — Vedalken Artificer', 'Artifact spells you cast cost {1} less to cast.', 2),
  card('Artifact Top Caster', 'Artifact', 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.', 4),
]);
assert.equal(topLoop.status, 'proven');
assert.ok(proofByFamily(topLoop, 'artifact-top-cost-reduction-loop'));
assert.ok(topLoop.hyperedges.some(edge => edge.family === 'artifact-top-cost-reduction-loop'));

const aristocratsNearMiss = provePackage([
  card('Free Body', 'Creature', 'When this creature dies, draw a card.', 1),
  card('Sac Outlet', 'Creature', 'Sacrifice a creature: Add {C}.', 1),
  card('Death Payoff', 'Creature', 'Whenever another creature dies, each opponent loses 1 life.', 2),
]);
assert.equal(aristocratsNearMiss.status, 'not-repeatable');
assert.ok(aristocratsNearMiss.rejections.some(rejection => /not replenished/.test(rejection.reason)));

const tokenEngine = provePackage([
  card('Token Source', 'Creature', 'When this creature enters, create a 1/1 white Soldier creature token.', 2),
  card('Token Doubler', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', 4),
  card('Token Payoff', 'Creature', 'Whenever one or more tokens you control enter, draw a card.', 3),
]);
assert.equal(tokenEngine.status, 'proven');
assert.ok(proofByFamily(tokenEngine, 'token-source-modifier-payoff'));
assert.ok(tokenEngine.state.flags.replacementModifiers.includes('is-token-doubler'));

const bounded = provePackage([
  card('A', 'Creature', ''),
  card('B', 'Creature', ''),
  card('C', 'Creature', ''),
  card('D', 'Creature', ''),
], { limits: { maxCards: 3 } });
assert.equal(bounded.status, 'bounded-out');
assert.match(bounded.reason, /maxCards/);

const batch = boundedProofSearch([[deadeye, drake], [ephemerate, drake]], { limits: { maxCards: 3, maxDepth: 6, maxBranches: 10 } });
assert.equal(batch.version, 'bounded-proof-search.v1');
assert.equal(batch.results.length, 2);
assert.equal(batch.results[0].status, 'proven');
assert.equal(batch.results[1].status, 'not-repeatable');

process.stdout.write('Interaction proof-search tests passed\n');
