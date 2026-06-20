const assert = require('node:assert/strict');
const SEMANTICS = require('../src/semantic-proof-utils');

const card = {
  id: 'Generic Mana Engine',
  caps: [
    'loop-cost-cost:3',
    'loop-cost-colorless-cost:1',
    'loop-cost-color-g:2',
    'producer-produced:4',
    'producer-any:1',
    'producer-g:1',
    'producer-c:2',
  ],
};

assert.equal(SEMANTICS.hasCap(card, 'loop-cost-cost:3'), true);
assert.equal(SEMANTICS.capValue(card, 'loop-cost-cost'), 3);
assert.deepEqual(SEMANTICS.capNumbers(card, 'loop-cost-color-g'), [2]);

const cost = SEMANTICS.manaCostProfileFromCaps(card, 'loop-cost');
const produced = SEMANTICS.manaProductionProfileFromCaps(card, 'producer');
assert.equal(SEMANTICS.canPayManaCost(cost, produced), true);
assert.equal(SEMANTICS.canPayManaCost({ total: 5, colorless: 0, colors: { w: 0, u: 0, b: 0, r: 0, g: 0 } }, produced), false);

assert.equal(SEMANTICS.classForProofDeltaResource('combatPhases'), 'combat');
assert.equal(SEMANTICS.classForProofDeltaResource('loots'), 'infinite-looting');
assert.equal(SEMANTICS.classForProofDeltaResource('selfDiscards'), 'infinite-self-discard');
assert.equal(SEMANTICS.classForProofDeltaResource('storm'), 'infinite-cast');
assert.equal(SEMANTICS.classForProofDeltaResource('landfallTriggers'), 'infinite-landfall');
assert.equal(SEMANTICS.classForProofDeltaResource('pump'), 'infinite-pump');
assert.equal(SEMANTICS.classForProofDeltaResource('turns'), 'infinite-turns');
assert.equal(SEMANTICS.proofDeltaShowsPositiveResult({ resource: 'tokens', min: 1, max: Infinity }), true);
assert.equal(SEMANTICS.proofDeltaShowsPositiveResult({ resource: 'opponentLife', min: -Infinity, max: -1 }), true);
assert.equal(SEMANTICS.proofDeltaShowsPositiveResult({ resource: 'opponentLife', min: 0, max: 0 }), false);

assert.deepEqual(SEMANTICS.sortedUnique(['b', 'a', 'b', null]), ['a', 'b']);

const faceSourcedCard = {
  id: 'Face Sourced',
  caps: ['loop-cost-cost:6'],
  factSources: {
    caps: {
      'loop-cost-cost:3': [{ faceIndex: 1, faceName: 'Spell Face' }],
      'face-only-cap': [{ faceIndex: 1, faceName: 'Spell Face' }],
    },
  },
};
assert.equal(SEMANTICS.hasCap(faceSourcedCard, 'face-only-cap'), true);
assert.deepEqual(SEMANTICS.capNumbers(faceSourcedCard, 'loop-cost-cost'), [3, 6]);
assert.equal(SEMANTICS.minCapNumber(faceSourcedCard, 'loop-cost-cost'), 3);

const variableUnit = { total: 1, any: 0, colorless: 0, colors: { w: 0, u: 0, b: 0, r: 0, g: 1 } };
const variableCost = { total: 4, colorless: 0, colors: { w: 0, u: 0, b: 0, r: 0, g: 0 } };
assert.deepEqual(SEMANTICS.scaleManaProfile(variableUnit, 5), {
  total: 5,
  any: 0,
  colorless: 0,
  colors: { w: 0, u: 0, b: 0, r: 0, g: 5 },
});
assert.equal(SEMANTICS.minimumVariableManaCountToPay(variableCost, variableUnit, { requirePositive: true }), 5);
assert.equal(SEMANTICS.minimumVariableManaCountToPay(variableCost, variableUnit, { requirePositive: false }), 4);

process.stdout.write('Semantic proof utility tests passed\n');
