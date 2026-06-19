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
assert.deepEqual(getComboFamily('hasty-copy→etb-untap-loop').resultClasses, ['infinite-etb', 'infinite-ltb', 'infinite-tokens', 'infinite-untap']);
assert.equal(getComboFamily('hasty-copy→etb-untap-loop').resultClasses.includes('infinite-mana'), false);
assert.deepEqual(getComboFamily('combat-copy-token→extra-combat-loop').resultClasses, ['combat', 'infinite-etb', 'infinite-tokens']);
assert.deepEqual(getComboFamily('draw-damage-feedback-loop').resultClasses, ['infinite-damage', 'infinite-draw']);
assert.deepEqual(getComboFamily('lifelink-counter-damage-loop').resultClasses, ['infinite-damage', 'infinite-life']);
assert.deepEqual(getComboFamily('counter-token→etb-counter-loop').resultClasses, ['infinite-counters', 'infinite-etb', 'infinite-tokens']);
assert.deepEqual(getComboFamily('minus-counter-death→token-loop').resultClasses, ['infinite-death', 'infinite-etb', 'infinite-ltb']);
assert.deepEqual(getComboFamily('lifegain-counter-token-etb-loop').resultClasses, ['infinite-counters', 'infinite-etb', 'infinite-life', 'infinite-tokens']);
assert.deepEqual(getComboFamily('death-untap-deathtouch-pinger-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('death-untap-deathtouch-pinger-lock').optionalAccelerants.some(item => /equipment/i.test(item.note)));
assert.ok(getComboFamily('death-untap-deathtouch-pinger-lock').knownFalsePositives.some(text => /deathtouch/i.test(text)));
assert.deepEqual(getComboFamily('life-paid-damage-lifeloss-recovery-loop').resultClasses, ['infinite-damage', 'infinite-life']);
assert.deepEqual(getComboFamily('exile-recast-creature-mana-loop').resultClasses, ['infinite-cast', 'infinite-etb', 'infinite-ltb']);
assert.deepEqual(getComboFamily('exile-recast-creature-mana-loop').proofDeltaResultClasses, ['infinite-mana']);
assert.ok(getComboFamily('recursive-body-sacrifice-mana-loop').requiredFacts.some(fact => fact.predicate === 'is-mana-sac-outlet'));
assert.deepEqual(getComboFamily('recursive-body-sacrifice-mana-loop').proofDeltaResultClasses, ['infinite-cast', 'infinite-mana']);
assert.ok(getComboFamily('self-untap-mana-loop').optionalAccelerants.some(fact => fact.predicate === 'is-colorless-mana-amplifier'));
assert.deepEqual(getComboFamily('mill-lifeloss-feedback-loop').resultClasses, ['mill', 'infinite-opponent-life-loss', 'infinite-life']);
assert.deepEqual(getComboFamily('self-copy-spell→magecraft-drain-loop').resultClasses, ['infinite-cast', 'infinite-life', 'infinite-opponent-life-loss']);
assert.deepEqual(getComboFamily('opponent-draw-punisher-win').resultClasses, ['win']);
assert.deepEqual(getComboFamily('mill-multiplier-finite-mill').resultClasses, ['mill']);
assert.deepEqual(getComboFamily('delayed-mill-equalizer-finite-mill').resultClasses, ['mill']);
assert.deepEqual(getComboFamily('mutual-etb-blink-reset-loop').resultClasses, ['infinite-etb', 'infinite-ltb']);
assert.ok(getComboFamily('token-replacement-sacrifice-mana-loop').requiredFacts.some(fact => fact.predicate === 'is-token-to-creature-token-replacer'));
assert.deepEqual(getComboFamily('token-replacement-sacrifice-mana-loop').proofDeltaResultClasses, ['infinite-mana']);
assert.deepEqual(getComboFamily('death-copy-spell-etb-copy-loop').resultClasses, ['infinite-cast', 'infinite-death', 'infinite-etb', 'infinite-ltb']);
assert.deepEqual(getComboFamily('death-copy-spell-etb-copy-loop').proofDeltaResultClasses, ['infinite-tokens']);
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
