const assert = require('node:assert/strict');
const {
  COMBO_FAMILIES,
  getComboFamily,
  validateComboFamilyLibrary,
} = require('../src/combo-family-library');

const validation = validateComboFamilyLibrary();
assert.equal(validation.ok, true, validation.errors.join('\n'));

assert.ok(COMBO_FAMILIES.length >= 9, 'library should cover direct, two-card, and three-card archetypes');

const ids = COMBO_FAMILIES.map(family => family.id);
assert.equal(new Set(ids).size, ids.length, 'family ids should be unique');
assert.equal(ids[0], 'self-untap-mana-loop', 'family order should remain stable and reviewable');

for (const family of COMBO_FAMILIES) {
  assert.equal(getComboFamily(family.id), family);
  assert.ok(family.requiredFacts.length >= 1, `${family.id} needs required facts`);
  assert.ok(family.examples.length >= 1, `${family.id} needs a positive fixture`);
  assert.ok(family.negativeFixtures.length >= 1, `${family.id} needs a negative fixture`);
  assert.ok(family.knownFalsePositives.length >= 1, `${family.id} needs known false positives`);
  assert.ok(family.uiExplanation.length > 20, `${family.id} needs UI-stable explanation`);
  assert.ok(['exact', 'pattern', 'heuristic'].includes(family.confidenceGate));
  assert.ok(family.maxCards >= 1 && family.maxCards <= 3);
}

assert.ok(getComboFamily('artifact-top-cost-reduction-loop').requiredFacts.some(fact => fact.predicate === 'is-self-top-draw-artifact'));
assert.ok(getComboFamily('blink-etb-land-untap-loop').negativeFixtures.some(fixture => fixture.cards.includes('Ephemerate')));
assert.ok(getComboFamily('cost-reducer-activated-output-payoff').knownFalsePositives.some(text => /scoped/i.test(text)));
assert.ok(getComboFamily('token-source-modifier-payoff').requiredFacts.some(fact => fact.kind === 'event.consumes' && fact.event === 'tokens'));
assert.equal(getComboFamily('missing-family'), null);

const invalid = validateComboFamilyLibrary([
  {
    id: 'bad',
    title: 'Bad',
    maxCards: 4,
    confidenceGate: 'guess',
    requiredFacts: [],
    examples: [],
    negativeFixtures: [],
    knownFalsePositives: [],
  },
]);
assert.equal(invalid.ok, false);
assert.ok(invalid.errors.some(error => /maxCards/.test(error)));
assert.ok(invalid.errors.some(error => /confidenceGate/.test(error)));
assert.ok(invalid.errors.some(error => /requiredFacts/.test(error)));

process.stdout.write('Combo family library tests passed\n');
