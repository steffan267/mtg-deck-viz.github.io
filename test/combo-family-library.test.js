const assert = require('node:assert/strict');
const {
  COMBO_FAMILIES,
  getComboFamily,
  validateComboFamilyLibrary,
  ComboFamilyId,
  ResultClass,
} = require('../src/combo-family-library');

const validation = validateComboFamilyLibrary();
assert.equal(validation.ok, true, validation.errors.join('\n'));

assert.ok(COMBO_FAMILIES.length >= 9, 'library should cover direct, two-card, and three-card archetypes');

const ids = COMBO_FAMILIES.map(family => family.id);
assert.equal(new Set(ids).size, ids.length, 'family ids should be unique');
assert.equal(ids[0], ComboFamilyId.SelfUntapManaLoop, 'family order should remain stable and reviewable');

for (const family of COMBO_FAMILIES) {
  assert.ok(Object.values(ComboFamilyId).includes(family.id), `${family.id} must be a canonical ComboFamilyId`);
  for (const cls of [...(family.resultClasses || []), ...(family.proofDeltaResultClasses || [])]) {
    assert.ok(Object.values(ResultClass).includes(cls), `${family.id} uses non-canonical result class ${cls}`);
  }
}

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

assert.ok(getComboFamily(ComboFamilyId.ArtifactTopCostReductionLoop).requiredFacts.some(fact => fact.predicate === 'is-self-top-draw-artifact'));
assert.ok(getComboFamily(ComboFamilyId.BlinkEtbLandUntapLoop).negativeFixtures.some(fixture => fixture.cards.includes('Ephemerate')));
assert.deepEqual(getComboFamily(ComboFamilyId.BlinkSpellRecursionLandUntapLoop).resultClasses, ['infinite-blink', 'infinite-cast', 'infinite-etb', 'infinite-ltb', 'infinite-untap']);
assert.deepEqual(getComboFamily(ComboFamilyId.BlinkSpellRecursionLandUntapLoop).proofDeltaResultClasses, ['infinite-draw', 'infinite-mana']);
assert.ok(getComboFamily(ComboFamilyId.BlinkSpellRecursionLandUntapLoop).knownFalsePositives.some(text => /single-target/i.test(text)));
assert.ok(getComboFamily('cost-reducer-activated-output-payoff').knownFalsePositives.some(text => /scoped/i.test(text)));
assert.ok(getComboFamily('token-source-modifier-payoff').requiredFacts.some(fact => fact.kind === 'event.consumes' && fact.event === 'tokens'));
assert.deepEqual(getComboFamily(ComboFamilyId.HastyCopyEtbUntapLoop).resultClasses, [ResultClass.InfiniteEtb, ResultClass.InfiniteLtb, ResultClass.InfiniteTokens, ResultClass.InfiniteUntap]);
assert.equal(getComboFamily(ComboFamilyId.HastyCopyEtbUntapLoop).resultClasses.includes(ResultClass.InfiniteMana), false);
assert.deepEqual(getComboFamily('combat-copy-token→extra-combat-loop').resultClasses, ['combat', 'infinite-etb', 'infinite-tokens']);
assert.ok(getComboFamily('combat-copy-token→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'precombat-copy-created-before-attack'));
assert.ok(getComboFamily('combat-copy-token→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'fresh-token-unused-attack-trigger'));
assert.ok(getComboFamily('combat-copy-token→extra-combat-loop').knownFalsePositives.some(text => /tapped and attacking/i.test(text)));
for (const familyId of ['hasty-copy→attack-extra-combat-loop', 'combat-copy-token→connect-extra-combat-loop', 'hasty-copy→connect-extra-combat-loop']) {
  const family = getComboFamily(familyId);
  assert.deepEqual(family.resultClasses, ['combat', 'infinite-etb', 'infinite-tokens']);
  assert.deepEqual(family.proofDeltaResultClasses, ['combat', 'infinite-etb', 'infinite-tokens']);
  assert.equal(family.resultClasses.includes('infinite-mana'), false);
  assert.equal(family.resultClasses.includes('infinite-damage'), false);
  assert.equal(family.resultClasses.includes('win'), false);
  assert.ok(family.disqualifiers.some(item => /timing|connection|reset|target/i.test(item.rule)));
}
for (const familyId of ['combat-copy-token→attack-extra-turn-loop', 'combat-copy-token→connect-extra-turn-loop', 'hasty-copy→attack-extra-turn-loop', 'hasty-copy→connect-extra-turn-loop']) {
  const family = getComboFamily(familyId);
  assert.deepEqual(family.resultClasses, ['infinite-turns']);
  assert.deepEqual(family.proofDeltaResultClasses, ['infinite-turns']);
  assert.equal(family.resultClasses.includes('combat'), false);
  assert.equal(family.resultClasses.includes('infinite-tokens'), false);
  assert.equal(family.resultClasses.includes('infinite-damage'), false);
  assert.ok(family.requiredFacts.some(fact => fact.predicate === 'extra-turn-repeatable-with-fresh-token'));
  assert.ok(family.disqualifiers.some(item => /extra turns|optional|payment/i.test(item.rule)));
}
assert.ok(getComboFamily('combat-copy-token→connect-extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'combat-damage-connects'));
assert.ok(getComboFamily('hasty-copy→connect-extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'copy-source-reset-by-extra-combat-trigger'));
assert.deepEqual(getComboFamily('combat-sacrifice-aura→extra-combat-loop').resultClasses, ['combat', 'infinite-death', 'infinite-ltb', 'infinite-sacrifice', 'infinite-untap']);
assert.deepEqual(getComboFamily('combat-sacrifice-aura→extra-combat-loop').proofDeltaResultClasses, ['combat', 'infinite-death', 'infinite-ltb', 'infinite-sacrifice', 'infinite-untap']);
assert.equal(getComboFamily('combat-sacrifice-aura→extra-combat-loop').resultClasses.includes('infinite-mana'), false);
assert.equal(getComboFamily('combat-sacrifice-aura→extra-combat-loop').resultClasses.includes('infinite-damage'), false);
assert.equal(getComboFamily('combat-sacrifice-aura→extra-combat-loop').resultClasses.includes('infinite-tokens'), false);
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'is-combat-sacrifice-extra-combat-aura'));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'is-fresh-attack-carrier-source'));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'combat-damage-connects'));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'legal-reattach-target-at-trigger-resolution'));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'current-enchanted-carrier-at-loop-entry'));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'fresh-carrier-source-distinct-from-sacrificed-carrier'));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'fresh-carrier-token-has-haste'));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').negativeFixtures.some(fixture => /fresh carrier/i.test(fixture.reason)));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').knownFalsePositives.some(text => /arbitrary external creature/i.test(text)));
assert.ok(getComboFamily('combat-sacrifice-aura→extra-combat-loop').knownFalsePositives.some(text => /surplus tokens, mana, damage, or wins/i.test(text)));
assert.deepEqual(getComboFamily('combat-resource→extra-combat-loop').resultClasses, ['combat']);
assert.deepEqual(getComboFamily('combat-resource→extra-combat-loop').proofDeltaResultClasses, ['combat', 'infinite-untap']);
assert.ok(getComboFamily('combat-resource→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'is-repeatable-extra-combat-engine'));
assert.ok(getComboFamily('combat-resource→extra-combat-loop').requiredFacts.some(fact => fact.predicate === 'extra-combat-untaps-creatures'));
assert.ok(getComboFamily('combat-resource→extra-combat-loop').requiredFacts.some(fact => (fact.predicates || []).includes('is-combat-damage-treasure-engine')));
assert.ok(getComboFamily('combat-resource→extra-combat-loop').requiredFacts.some(fact => (fact.predicates || []).includes('minimum-combat-damage')));
assert.ok(getComboFamily('combat-resource→extra-combat-loop').knownFalsePositives.some(text => /connect/i.test(text)));
assert.ok(getComboFamily('combat-resource→extra-combat-loop').knownFalsePositives.some(text => /main phase/i.test(text)));
assert.ok(getComboFamily('combat-resource→extra-combat-loop').knownFalsePositives.some(text => /mana/.test(text) && /tokens/.test(text)));
assert.deepEqual(getComboFamily('artifact-token→extra-turn-loop').resultClasses, ['infinite-turns']);
assert.deepEqual(getComboFamily('artifact-token→extra-turn-loop').proofDeltaResultClasses, ['infinite-turns']);
assert.ok(getComboFamily('artifact-token→extra-turn-loop').requiredFacts.some(fact => fact.predicate === 'is-turn-cycle-artifact-token-engine'));
assert.ok(getComboFamily('artifact-token→extra-turn-loop').requiredFacts.some(fact => fact.predicate === 'is-artifact-sacrifice-extra-turn-engine'));
assert.ok(getComboFamily('artifact-token→extra-turn-loop').disqualifiers.some(item => /replacement-amplified/.test(item.rule)));
assert.deepEqual(getComboFamily('counter-threshold-doubler→extra-turn-loop').resultClasses, ['infinite-turns']);
assert.deepEqual(getComboFamily('counter-threshold-doubler→extra-turn-loop').proofDeltaResultClasses, ['infinite-turns']);
assert.ok(getComboFamily('counter-threshold-doubler→extra-turn-loop').requiredFacts.some(fact => fact.predicate === 'is-counter-threshold-extra-turn-engine'));
assert.ok(getComboFamily('counter-threshold-doubler→extra-turn-loop').requiredFacts.some(fact => fact.predicate === 'is-repeatable-counter-doubler'));
assert.ok(getComboFamily('counter-threshold-doubler→extra-turn-loop').knownFalsePositives.some(text => /infinite-counters/i.test(text)));
assert.deepEqual(getComboFamily('counter-threshold-proliferate→extra-turn-loop').resultClasses, ['infinite-turns']);
assert.deepEqual(getComboFamily('counter-threshold-proliferate→extra-turn-loop').proofDeltaResultClasses, ['infinite-turns']);
assert.ok(getComboFamily('counter-threshold-proliferate→extra-turn-loop').requiredFacts.some(fact => fact.predicate === 'proliferate-count-per-turn'));
assert.ok(getComboFamily('counter-threshold-proliferate→extra-turn-loop').optionalAccelerants.some(item => item.predicate === 'is-proliferate-multiplier'));
assert.ok(getComboFamily('counter-threshold-proliferate→extra-turn-loop').disqualifiers.some(item => /seed/i.test(item.rule)));
assert.deepEqual(getComboFamily('draw-damage-feedback-loop').resultClasses, ['infinite-damage', 'infinite-draw']);
assert.deepEqual(getComboFamily('lifelink-counter-damage-loop').resultClasses, ['infinite-damage', 'infinite-life']);
assert.deepEqual(getComboFamily('counter-token→etb-counter-loop').resultClasses, ['infinite-counters', 'infinite-etb', 'infinite-tokens']);
assert.deepEqual(getComboFamily('minus-counter-death→token-loop').resultClasses, ['infinite-death', 'infinite-etb', 'infinite-ltb']);
assert.deepEqual(getComboFamily('lifegain-counter-token-etb-loop').resultClasses, ['infinite-counters', 'infinite-etb', 'infinite-life', 'infinite-tokens']);
assert.deepEqual(getComboFamily('death-untap-deathtouch-pinger-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('death-untap-deathtouch-pinger-lock').optionalAccelerants.some(item => /equipment/i.test(item.note)));
assert.ok(getComboFamily('death-untap-deathtouch-pinger-lock').knownFalsePositives.some(text => /deathtouch/i.test(text)));
assert.deepEqual(getComboFamily('forced-cast→cast-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('forced-cast→cast-lock').requiredFacts.some(fact => fact.predicate === 'is-forced-nonhand-cast-engine'));
assert.ok(getComboFamily('forced-cast→cast-lock').requiredFacts.some(fact => fact.predicate === 'is-cast-origin-lockpiece'));
assert.ok(getComboFamily('forced-cast→cast-lock').disqualifiers.some(item => /same origin|free-cast|spell-count|timing/i.test(item.rule)));
assert.ok(getComboFamily('forced-cast→cast-lock').knownFalsePositives.some(text => /graveyard-only|noncreature/i.test(text)));
for (const familyId of ['counter-suppression→prevention-lock', 'counter-suppression→depletion-lock', 'counter-suppression→poison-loss-lock', 'counter-suppression→cumulative-upkeep-prevention-lock']) {
  const family = getComboFamily(familyId);
  assert.deepEqual(family.resultClasses, ['lock']);
  assert.ok(family.requiredFacts.some(fact => fact.predicate === 'is-counter-suppression-static'));
  assert.ok(family.knownFalsePositives.some(text => /counter/i.test(text)));
}
assert.ok(getComboFamily('counter-suppression→prevention-lock').requiredFacts.some(fact => fact.predicate === 'is-damage-prevention-counter-burden'));
assert.ok(getComboFamily('counter-suppression→depletion-lock').requiredFacts.some(fact => fact.predicate === 'is-spell-counter-depletion-lockpiece'));
assert.ok(getComboFamily('counter-suppression→poison-loss-lock').requiredFacts.some(fact => fact.predicate === 'is-zero-life-poison-shield'));
assert.ok(getComboFamily('counter-suppression→cumulative-upkeep-prevention-lock').requiredFacts.some(fact => fact.predicate === 'is-cumulative-upkeep-counter-burden'));
assert.deepEqual(getComboFamily('face-up-untap-skip→face-down-reset-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('face-up-untap-skip→face-down-reset-lock').requiredFacts.some(fact => fact.predicate === 'is-face-up-opponent-next-untap-skipper'));
assert.ok(getComboFamily('face-up-untap-skip→face-down-reset-lock').requiredFacts.some(fact => fact.predicate === 'is-upkeep-face-down-resetter'));
assert.ok(getComboFamily('face-up-untap-skip→face-down-reset-lock').requiredFacts.some(fact => fact.predicate === 'is-face-up-copy-creature'));
assert.ok(getComboFamily('face-up-untap-skip→face-down-reset-lock').knownFalsePositives.some(text => /copy|face up|untap/i.test(text)));
assert.deepEqual(getComboFamily('prevention-land→graveyard-extra-land-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('prevention-land→graveyard-extra-land-lock').requiredFacts.some(fact => fact.predicate === 'is-replayable-prevention-land-lockpiece'));
assert.ok(getComboFamily('prevention-land→graveyard-extra-land-lock').requiredFacts.some(fact => fact.predicate === 'is-land-recursion'));
assert.ok(getComboFamily('prevention-land→graveyard-extra-land-lock').requiredFacts.some(fact => fact.predicate === 'is-extra-land-drop'));
assert.ok(getComboFamily('prevention-land→graveyard-extra-land-lock').knownFalsePositives.some(text => /graveyard|land replay|extra land/i.test(text)));
assert.deepEqual(getComboFamily('draw-step-hand-cycle→draw-limit-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('draw-step-hand-cycle→draw-limit-lock').requiredFacts.some(fact => fact.predicate === 'is-draw-step-hand-cycler'));
assert.ok(getComboFamily('draw-step-hand-cycle→draw-limit-lock').requiredFacts.some(fact => fact.predicate === 'is-draw-limit-lockpiece'));
assert.deepEqual(getComboFamily('no-draw-search-step→search-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('no-draw-search-step→search-lock').requiredFacts.some(fact => fact.predicate === 'is-no-draw-search-step-engine'));
assert.ok(getComboFamily('no-draw-search-step→search-lock').requiredFacts.some(fact => fact.predicate === 'is-search-lockpiece'));
assert.deepEqual(getComboFamily('no-flying-attack→flying-removal-lock').resultClasses, ['lock']);
assert.deepEqual(getComboFamily('flying-only-attack→ground-lock').resultClasses, ['lock']);
assert.deepEqual(getComboFamily('flying-or-islandwalk-attack→evasion-removal-lock').resultClasses, ['lock']);
assert.deepEqual(getComboFamily('all-permanents-artifacts→artifact-activation-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('all-permanents-artifacts→artifact-activation-lock').requiredFacts.some(fact => fact.predicate === 'is-all-permanents-artifacts'));
assert.ok(getComboFamily('all-permanents-artifacts→artifact-activation-lock').requiredFacts.some(fact => fact.predicate === 'is-artifact-activation-lockpiece'));
assert.deepEqual(getComboFamily('all-lands-islands→island-untap-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('all-lands-islands→island-untap-lock').requiredFacts.some(fact => fact.predicate === 'is-all-lands-are-islands'));
assert.ok(getComboFamily('all-lands-islands→island-untap-lock').requiredFacts.some(fact => fact.predicate === 'is-island-untap-lockpiece'));
for (const familyId of ['global-untap-skip→upkeep-skip-lock', 'global-untap-skip→end-step-untap-lock', 'global-untap-skip→upkeep-untap-land-lock', 'global-untap-skip→self-bounce-lock']) {
  const family = getComboFamily(familyId);
  assert.deepEqual(family.resultClasses, ['lock']);
  assert.ok(family.requiredFacts.some(fact => fact.predicate === 'is-global-untap-skipper'));
  assert.ok(family.knownFalsePositives.some(text => /untap|upkeep/i.test(text)));
}
assert.ok(getComboFamily('global-untap-skip→upkeep-skip-lock').requiredFacts.some(fact => fact.predicate === 'is-global-upkeep-skipper'));
assert.ok(getComboFamily('global-untap-skip→end-step-untap-lock').requiredFacts.some(fact => fact.predicate === 'is-self-end-step-nonland-untapper'));
assert.ok(getComboFamily('global-untap-skip→upkeep-untap-land-lock').requiredFacts.some(fact => fact.predicate === 'is-upkeep-self-untap-mana-land'));
assert.ok(getComboFamily('global-untap-skip→self-bounce-lock').requiredFacts.some(fact => fact.predicate === 'is-repeatable-self-bounce-support'));
assert.deepEqual(getComboFamily('cast-protection→self-bounce-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('cast-protection→self-bounce-lock').requiredFacts.some(fact => fact.predicate === 'is-cast-gated-opponent-turn-protection-source'));
assert.ok(getComboFamily('cast-protection→self-bounce-lock').requiredFacts.some(fact => fact.predicate === 'is-repeatable-self-bounce-support'));
assert.ok(getComboFamily('cast-protection→self-bounce-lock').disqualifiers.some(item => /artifact|protection|blink|snow|creature-tap/i.test(item.rule)));
assert.deepEqual(getComboFamily('cast-protection→graveyard-recast-lock').resultClasses, ['lock']);
assert.ok(getComboFamily('cast-protection→graveyard-recast-lock').requiredFacts.some(fact => fact.predicate === 'is-artifact-sac-outlet'));
assert.ok(getComboFamily('cast-protection→graveyard-recast-lock').requiredFacts.some(fact => (fact.predicates || []).includes('is-graveyard-artifact-cast-support') || (fact.predicates || []).includes('is-graveyard-permanent-cast-support')));
assert.deepEqual(getComboFamily('life-paid-damage-lifeloss-recovery-loop').resultClasses, ['infinite-damage', 'infinite-life']);
assert.deepEqual(getComboFamily('exile-recast-creature-mana-loop').resultClasses, ['infinite-cast', 'infinite-etb', 'infinite-ltb']);
assert.deepEqual(getComboFamily('exile-recast-creature-mana-loop').proofDeltaResultClasses, ['infinite-mana']);
assert.ok(getComboFamily('recursive-body-sacrifice-mana-loop').requiredFacts.some(fact => fact.predicate === 'is-mana-sac-outlet'));
assert.deepEqual(getComboFamily('recursive-body-sacrifice-mana-loop').proofDeltaResultClasses, ['infinite-cast', 'infinite-mana']);
assert.ok(getComboFamily('self-untap-mana-loop').optionalAccelerants.some(fact => fact.predicate === 'is-colorless-mana-amplifier'));
assert.deepEqual(getComboFamily('variable-board-count-mana-loop').resultClasses, ['infinite-mana', 'infinite-untap']);
assert.deepEqual(getComboFamily('variable-board-count-mana-loop').proofDeltaResultClasses, ['infinite-draw', 'infinite-life', 'infinite-pump']);
assert.ok(getComboFamily('variable-board-count-mana-loop').requiredFacts.some(fact => fact.predicate === 'is-variable-board-count-mana-source'));
assert.ok(getComboFamily('variable-board-count-mana-loop').requiredFacts.some(fact => fact.predicate === 'minimum-board-count'));
assert.ok(getComboFamily('variable-board-count-mana-loop').disqualifiers.some(item => /threshold/.test(item.rule)));
assert.ok(getComboFamily('variable-board-count-mana-loop').disqualifiers.some(item => /target/.test(item.kind)));
assert.deepEqual(getComboFamily('mill-lifeloss-feedback-loop').resultClasses, ['mill', 'infinite-opponent-life-loss', 'infinite-life']);
assert.deepEqual(getComboFamily('self-copy-spell→magecraft-drain-loop').resultClasses, ['infinite-cast', 'infinite-life', 'infinite-opponent-life-loss']);
assert.deepEqual(getComboFamily('escape-wheel-mana-loop').resultClasses, ['infinite-cast', 'infinite-draw', 'infinite-looting']);
assert.deepEqual(getComboFamily('escape-wheel-mana-loop').proofDeltaResultClasses, ['infinite-mana', 'infinite-self-discard']);
assert.ok(getComboFamily('escape-wheel-mana-loop').requiredFacts.some(fact => fact.predicate === 'is-graveyard-escape-enabler'));
assert.deepEqual(getComboFamily('escape-mill-mana-loop').resultClasses, ['infinite-cast', 'mill']);
assert.deepEqual(getComboFamily('escape-mill-mana-loop').proofDeltaResultClasses, ['infinite-mana', 'infinite-self-discard']);
assert.ok(getComboFamily('escape-mill-mana-loop').optionalAccelerants.some(fact => fact.predicate === 'has-storm'));
assert.deepEqual(getComboFamily('buyback-copy-ritual-loop').resultClasses, ['infinite-cast']);
assert.deepEqual(getComboFamily('buyback-copy-ritual-loop').proofDeltaResultClasses, ['infinite-mana']);
assert.ok(getComboFamily('buyback-copy-ritual-loop').optionalAccelerants.some(fact => fact.predicate === 'is-spell-cost-reducer'));
assert.deepEqual(getComboFamily('opponent-draw-punisher-win').resultClasses, ['win']);
assert.deepEqual(getComboFamily('mill-multiplier-finite-mill').resultClasses, ['mill']);
assert.deepEqual(getComboFamily('delayed-mill-equalizer-finite-mill').resultClasses, ['mill']);
assert.deepEqual(getComboFamily('mutual-etb-blink-reset-loop').resultClasses, ['infinite-etb', 'infinite-ltb']);
assert.ok(getComboFamily('token-replacement-sacrifice-mana-loop').requiredFacts.some(fact => fact.predicate === 'is-token-to-creature-token-replacer'));
assert.deepEqual(getComboFamily('token-replacement-sacrifice-mana-loop').proofDeltaResultClasses, ['infinite-mana']);
assert.deepEqual(getComboFamily('kodama-bounce-land-landfall-loop').resultClasses, ['infinite-etb', 'infinite-landfall', 'infinite-ltb']);
assert.deepEqual(getComboFamily('kodama-bounce-land-landfall-loop').proofDeltaResultClasses, ['infinite-mana', 'infinite-tokens']);
assert.ok(getComboFamily('kodama-bounce-land-landfall-loop').requiredFacts.some(fact => fact.predicate === 'is-self-bounce-land'));
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
