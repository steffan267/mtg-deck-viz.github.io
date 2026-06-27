const assert = require('node:assert/strict');
const {
  boundedProofSearch,
  provePackage,
} = require('../src/interaction-proof-search');
const {
  ComboFamilyId,
  ComboResource,
  SemanticTransitionKind,
  SolverOutcome,
  StateDimension,
  UnderstandingEvidenceKind,
} = require('../src/domain/interaction-constants');

function card(id, type, text, cmc = 0, mana_cost = '') {
  return { id, name: id, type_line: type, oracle_text: text, cmc, mana_cost };
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
assert.equal(selfLoop.packageUnderstanding.version, 'package-understanding.v1');
assert.equal(selfLoop.packageUnderstanding.state.version, 'semantic-understanding-state.v1');
const selfSolverEvidence = proofByFamily(selfLoop, ComboFamilyId.SelfUntapManaLoop).proof.understanding;
assert.equal(selfSolverEvidence.outcome, SolverOutcome.Proven);
assert.equal(selfSolverEvidence.kind, UnderstandingEvidenceKind.StrictProof);
assert.ok(selfLoop.packageUnderstanding.transitions.some(item => item.kind === SemanticTransitionKind.ActivatedAbility && item.sourceCardId === selfUntapper.id));
assert.ok(selfSolverEvidence.positiveDeltas.some(delta => delta.dimension === StateDimension.Mana && delta.resource === ComboResource.Mana));

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
assert.equal(blinkProof.proof.understanding.family, ComboFamilyId.BlinkEtbLandUntapLoop);
assert.ok(blinkProof.proof.understanding.requiredLegality.some(item => item.predicate === 'payment-closed'));
assert.ok(blinkLoop.packageUnderstanding.transitions.some(item => item.events.includes('etb')));

assert.ok(blinkLoop.packageUnderstanding.coverage.solvedFamilies.includes(ComboFamilyId.BlinkEtbLandUntapLoop));
assert.ok(blinkLoop.packageUnderstanding.coverage.deferredDimensions.includes(StateDimension.Cast));
const breakEvenBlinkLoop = provePackage([
  card('Two-Mana Blink Engine', 'Creature — Spirit', '{1}{U}: Exile another target creature you control, then return it to the battlefield under your control.', 6),
  card('Two-Land Untapper', 'Creature — Drake', 'Flying When this creature enters, untap up to two lands.', 5),
]);
assert.equal(breakEvenBlinkLoop.status, 'proven');
const breakEvenBlinkProof = proofByFamily(breakEvenBlinkLoop, ComboFamilyId.BlinkEtbLandUntapLoop);
assert.ok(breakEvenBlinkProof);
assert.equal(breakEvenBlinkProof.proof.understanding.outcome, SolverOutcome.Proven);
assert.equal(breakEvenBlinkProof.positiveDeltas.some(delta => delta.resource === ComboResource.Mana && delta.min === 0 && delta.max === 0), true);
assert.equal(breakEvenBlinkLoop.packageUnderstanding.evidence.some(item => item.family === ComboFamilyId.BlinkEtbLandUntapLoop && item.outcome === SolverOutcome.Rejected), false);

const ephemerate = card(
  'Ephemerate',
  'Instant',
  'Exile target creature you control, then return it to the battlefield under its owner’s control.',
  1,
);
const nearMiss = provePackage([ephemerate, drake]);
assert.equal(nearMiss.status, 'not-repeatable');
assert.ok(nearMiss.rejections.some(rejection => /not repeatable|blink effect is not repeatable/.test(rejection.reason)));

const ghostlyFlicker = card(
  'Ghostly Flicker',
  'Instant',
  'Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control.',
  3,
  '{2}{U}',
);
const archaeomancer = card(
  'Archaeomancer',
  'Creature — Human Wizard',
  'When this creature enters, return target instant or sorcery card from your graveyard to your hand.',
  4,
  '{2}{U}{U}',
);
const blinkSpellRecursionLoop = provePackage([ghostlyFlicker, drake, archaeomancer]);
assert.equal(blinkSpellRecursionLoop.status, 'proven');
const blinkSpellRecursionProof = proofByFamily(blinkSpellRecursionLoop, ComboFamilyId.BlinkSpellRecursionLandUntapLoop);
assert.ok(blinkSpellRecursionProof);
assert.ok(blinkSpellRecursionProof.positiveDeltas.some(delta => delta.resource === 'casts'));
assert.ok(blinkSpellRecursionProof.positiveDeltas.some(delta => delta.resource === 'mana' && delta.min === 2));
assert.ok(blinkSpellRecursionProof.proof.requiredFacts.some(item => item.predicate === 'blink-target-count' && item.value === 2));
assert.ok(blinkSpellRecursionProof.proof.requiredFacts.some(item => item.predicate === 'minimum-available-lands' && item.value === 3));

const cantripBlinkRecursionLoop = provePackage([
  card('Cantrip Double Blink', 'Instant', 'Exile up to two target creatures you control, then return those cards to the battlefield under their owner\'s control. Draw a card.', 4, '{3}{U}'),
  drake,
  archaeomancer,
]);
const cantripBlinkRecursionProof = proofByFamily(cantripBlinkRecursionLoop, ComboFamilyId.BlinkSpellRecursionLandUntapLoop);
assert.ok(cantripBlinkRecursionProof);
assert.ok(cantripBlinkRecursionProof.positiveDeltas.some(delta => delta.resource === 'cards' && delta.min === 1));

const singleTargetBlinkRecursionNearMiss = provePackage([ephemerate, drake, archaeomancer]);
assert.equal(proofByFamily(singleTargetBlinkRecursionNearMiss, ComboFamilyId.BlinkSpellRecursionLandUntapLoop), undefined);

const underfundedBlinkRecursionNearMiss = provePackage([
  ghostlyFlicker,
  card('Two-Land Untapper Again', 'Creature — Drake', 'When this creature enters, untap up to two lands.', 4, '{3}{U}'),
  archaeomancer,
]);
assert.equal(proofByFamily(underfundedBlinkRecursionNearMiss, ComboFamilyId.BlinkSpellRecursionLandUntapLoop), undefined);
assert.ok(underfundedBlinkRecursionNearMiss.rejections.some(rejection => /cannot repay the recovered blink spell/.test(rejection.reason)));

const gildedLotus = card(
  'Gilded Lotus',
  'Artifact',
  '{T}: Add three mana of any one color.',
  5,
  '{5}',
);
const manaArtifactBlinkLoop = provePackage([ghostlyFlicker, gildedLotus, archaeomancer]);
assert.equal(manaArtifactBlinkLoop.status, 'proven');
const manaArtifactBlinkProof = proofByFamily(manaArtifactBlinkLoop, ComboFamilyId.BlinkSpellRecursionManaArtifactLoop);
assert.ok(manaArtifactBlinkProof);
assert.ok(manaArtifactBlinkProof.positiveDeltas.some(delta => delta.resource === 'casts'));
assert.equal(manaArtifactBlinkProof.positiveDeltas.some(delta => delta.resource === 'mana'), false, 'three-mana artifact and three-mana blink are break-even');
assert.ok(manaArtifactBlinkProof.proof.requiredFacts.some(item => item.predicate === 'mana-artifact-untapped-at-loop-entry'));

const colorlessManaArtifactNearMiss = provePackage([
  ghostlyFlicker,
  card('Three-Mana Colorless Rock', 'Artifact', '{T}: Add {C}{C}{C}.', 3, '{3}'),
  archaeomancer,
]);
assert.equal(proofByFamily(colorlessManaArtifactNearMiss, ComboFamilyId.BlinkSpellRecursionManaArtifactLoop), undefined);
assert.ok(colorlessManaArtifactNearMiss.rejections.some(rejection => /full colored cost/.test(rejection.reason)));

const tappedManaArtifactNearMiss = provePackage([
  ghostlyFlicker,
  card('Tapped Mana Artifact', 'Artifact', 'Tapped Mana Artifact enters tapped. {T}: Add three mana of any one color.', 3, '{3}'),
  archaeomancer,
]);
assert.equal(proofByFamily(tappedManaArtifactNearMiss, ComboFamilyId.BlinkSpellRecursionManaArtifactLoop), undefined);

const drawingManaArtifactLoop = provePackage([
  ghostlyFlicker,
  card('Drawing Mana Artifact', 'Artifact', 'When this artifact enters, draw three cards. {T}: Add three mana of any one color.', 6, '{6}'),
  archaeomancer,
]);
const drawingManaArtifactProof = proofByFamily(drawingManaArtifactLoop, ComboFamilyId.BlinkSpellRecursionManaArtifactLoop);
assert.ok(drawingManaArtifactProof);
assert.ok(drawingManaArtifactProof.positiveDeltas.some(delta => delta.resource === 'cards' && delta.min === 3));

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
assert.equal(proofByFamily(lifeLoop, ComboFamilyId.LifegainLifelossLoop).proof.understanding.outcome, SolverOutcome.Proven);
assert.ok(proofByFamily(lifeLoop, ComboFamilyId.LifegainLifelossLoop).proof.understanding.assumptions.some(text => /initial/.test(text)));

const fixedLifeLoop = provePackage([
  card('Fixed Gain Converts To Loss', 'Creature — Cleric', 'Whenever you gain life, each opponent loses 1 life.', 3),
  exquisiteBlood,
]);
assert.equal(fixedLifeLoop.status, 'proven');
assert.ok(proofByFamily(fixedLifeLoop, 'lifegain-lifeloss-loop'));

const drawDamageLoop = provePackage([
  card('Draw Damage Engine', 'Legendary Creature — Wizard', 'Whenever you draw a card, this creature deals 1 damage to any target.', 6),
  card('Damage Draw Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.', 1),
]);
assert.equal(drawDamageLoop.status, 'proven');
assert.ok(proofByFamily(drawDamageLoop, 'draw-damage-feedback-loop'));
assert.ok(proofByFamily(drawDamageLoop, 'draw-damage-feedback-loop').positiveDeltas.some(delta => delta.resource === 'damage'));
assert.equal(proofByFamily(drawDamageLoop, ComboFamilyId.DrawDamageFeedbackLoop).proof.understanding.outcome, SolverOutcome.Proven);
assert.ok(proofByFamily(drawDamageLoop, ComboFamilyId.DrawDamageFeedbackLoop).proof.understanding.transitions.length >= 2);

const noncombatDrawDamageLoop = provePackage([
  card('Draw Damage Engine', 'Legendary Creature — Wizard', 'Whenever you draw a card, this creature deals 1 damage to any target.', 6),
  card('Noncombat Damage Draw Payoff', 'Creature — Dragon Wizard', 'Whenever a source you control deals noncombat damage to an opponent, you draw that many cards.', 6),
]);
assert.equal(noncombatDrawDamageLoop.status, 'proven');
assert.ok(proofByFamily(noncombatDrawDamageLoop, 'draw-damage-feedback-loop'));

const pairedCreatureDrawDamageLoop = provePackage([
  card('Draw Damage Creature', 'Legendary Creature — Dragon Wizard', 'Whenever you draw a card, this creature deals 1 damage to any target.', 6),
  card('Paired Creature Damage Draw', 'Creature — Human Scout', 'Soulbond. As long as this creature is paired with another creature, each of those creatures has "Whenever this creature deals damage to an opponent, draw a card."', 3),
]);
assert.equal(pairedCreatureDrawDamageLoop.status, 'proven');
assert.ok(proofByFamily(pairedCreatureDrawDamageLoop, 'draw-damage-feedback-loop'));

const opponentDrawDamageNearMiss = provePackage([
  card('Opponent Draw Damage Engine', 'Creature — Devil', 'Whenever an opponent draws a card, this creature deals 1 damage to any target.', 3),
  card('Damage Draw Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.', 1),
]);
assert.equal(opponentDrawDamageNearMiss.status, 'not-repeatable');
assert.ok(opponentDrawDamageNearMiss.rejections.some(rejection => /does not react to your draws/.test(rejection.reason)));

const drawDamageScopeNearMiss = provePackage([
  card('Draw Damage Engine', 'Legendary Creature — Wizard', 'Whenever you draw a card, this creature deals 1 damage to any target.', 6),
  card('Self Damage Draw Payoff', 'Creature — Human Wizard', 'Whenever this creature deals damage to an opponent, draw a card.', 2),
]);
assert.equal(drawDamageScopeNearMiss.status, 'not-repeatable');
assert.ok(drawDamageScopeNearMiss.rejections.some(rejection => /does not apply/.test(rejection.reason)));
assert.ok(drawDamageScopeNearMiss.packageUnderstanding.evidence.some(item => item.kind === UnderstandingEvidenceKind.Rejection && item.outcome === SolverOutcome.Rejected));

const unsupportedCastUnderstanding = provePackage([
  card('Graveyard Cast Enabler', 'Enchantment', 'You may cast creature spells from your graveyard.', 3),
  card('Cast Payoff', 'Creature — Wizard', 'Whenever you cast a creature spell, draw a card.', 3),
]);
const unresolvedEvidence = unsupportedCastUnderstanding.packageUnderstanding.unresolved[0];
assert.equal(unresolvedEvidence.kind, UnderstandingEvidenceKind.HumanReview);
assert.equal(unresolvedEvidence.outcome, SolverOutcome.Unresolved);
assert.match(unresolvedEvidence.rejectionReason, /intentionally deferred/);
assert.equal(unsupportedCastUnderstanding.packageUnderstanding.evidence.includes(unresolvedEvidence), true);

const selfCopySpellMagecraftDrainLoop = provePackage([
  card('Self-Copying Targeted Spell', 'Sorcery', 'Target player discards two cards. That player may copy this spell and may choose a new target for that copy.', 2),
  card('Magecraft Drain Payoff', 'Creature — Human Druid', 'Magecraft — Whenever you cast or copy an instant or sorcery spell, each opponent loses 1 life and you gain 1 life.', 2),
]);
assert.equal(selfCopySpellMagecraftDrainLoop.status, 'proven');
assert.ok(proofByFamily(selfCopySpellMagecraftDrainLoop, 'self-copy-spell→magecraft-drain-loop'));
assert.ok(proofByFamily(selfCopySpellMagecraftDrainLoop, 'self-copy-spell→magecraft-drain-loop').positiveDeltas.some(delta => delta.resource === 'opponentLife'));

const selfCopySpellNonDrainNearMiss = provePackage([
  card('Self-Copying Targeted Spell', 'Sorcery', 'Target player discards two cards. That player may copy this spell and may choose a new target for that copy.', 2),
  card('Magecraft Token Payoff', 'Creature — Human Wizard', 'Magecraft — Whenever you cast or copy an instant or sorcery spell, create a 1/1 creature token.', 2),
]);
assert.notEqual(selfCopySpellNonDrainNearMiss.status, 'proven');

const escapeWheelManaLoop = provePackage([
  card('Graveyard Escape Enabler', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exiling three other cards from your graveyard.", 2, '{1}{R}'),
  card('Discard-Hand Mana Source', 'Artifact', '{T}, Discard your hand, Sacrifice this artifact: Add three mana of any one color.', 0, '{0}'),
  card('Seven-Card Wheel', 'Sorcery', 'Each player discards their hand, then draws seven cards.', 3, '{2}{R}'),
]);
assert.equal(escapeWheelManaLoop.status, 'proven');
const escapeWheelProof = proofByFamily(escapeWheelManaLoop, 'escape-wheel-mana-loop');
assert.ok(escapeWheelProof);
assert.ok(escapeWheelProof.positiveDeltas.some(delta => delta.resource === 'casts'));
assert.ok(escapeWheelProof.positiveDeltas.some(delta => delta.resource === 'loots'));
assert.ok(escapeWheelProof.positiveDeltas.some(delta => delta.resource === 'selfDiscards'));

const smallWheelEscapeNearMiss = provePackage([
  card('Graveyard Escape Enabler', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exiling three other cards from your graveyard.", 2, '{1}{R}'),
  card('Discard-Hand Mana Source', 'Artifact', '{T}, Discard your hand, Sacrifice this artifact: Add three mana of any one color.', 0, '{0}'),
  card('Three-Card Wheel', 'Sorcery', 'Each player discards their hand, then draws three cards.', 3, '{2}{R}'),
]);
assert.equal(smallWheelEscapeNearMiss.status, 'not-repeatable');
assert.ok(smallWheelEscapeNearMiss.rejections.some(rejection => /escape both recurring cards|graveyard fuel/.test(rejection.reason)));

const underpoweredEscapeManaNearMiss = provePackage([
  card('Graveyard Escape Enabler', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exiling three other cards from your graveyard.", 2, '{1}{R}'),
  card('Two-Mana Discard Source', 'Artifact', '{T}, Discard your hand, Sacrifice this artifact: Add two mana of any one color.', 0, '{0}'),
  card('Seven-Card Wheel', 'Sorcery', 'Each player discards their hand, then draws seven cards.', 3, '{2}{R}'),
]);
assert.equal(underpoweredEscapeManaNearMiss.status, 'not-repeatable');
assert.ok(underpoweredEscapeManaNearMiss.rejections.some(rejection => /cannot pay/.test(rejection.reason)));

const escapeStormMillManaLoop = provePackage([
  card('Graveyard Escape Enabler', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exiling three other cards from your graveyard.", 2, '{1}{R}'),
  card('Discard-Hand Mana Source', 'Artifact', '{T}, Discard your hand, Sacrifice this artifact: Add three mana of any one color.', 0, '{0}'),
  card('Storm Mill Spell', 'Sorcery', 'Target player mills three cards.\nStorm', 2, '{1}{U}'),
]);
assert.equal(escapeStormMillManaLoop.status, 'proven');
const escapeStormMillProof = proofByFamily(escapeStormMillManaLoop, 'escape-mill-mana-loop');
assert.ok(escapeStormMillProof);
assert.ok(escapeStormMillProof.positiveDeltas.some(delta => delta.resource === 'casts'));
assert.ok(escapeStormMillProof.positiveDeltas.some(delta => delta.resource === 'storm'));
assert.ok(escapeStormMillProof.positiveDeltas.some(delta => delta.resource === 'mill'));
assert.ok(escapeStormMillProof.positiveDeltas.some(delta => delta.resource === 'selfDiscards'));
assert.ok(escapeStormMillProof.proof.assumptions.some(text => /storm/.test(text)));

const smallNonStormEscapeMillNearMiss = provePackage([
  card('Graveyard Escape Enabler', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exiling three other cards from your graveyard.", 2, '{1}{R}'),
  card('Discard-Hand Mana Source', 'Artifact', '{T}, Discard your hand, Sacrifice this artifact: Add three mana of any one color.', 0, '{0}'),
  card('Small Mill Spell', 'Sorcery', 'Target player mills three cards.', 2, '{1}{U}'),
]);
assert.equal(smallNonStormEscapeMillNearMiss.status, 'not-repeatable');
assert.ok(smallNonStormEscapeMillNearMiss.rejections.some(rejection => /graveyard fuel|mill count/.test(rejection.reason)));

const underpoweredEscapeMillManaNearMiss = provePackage([
  card('Graveyard Escape Enabler', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exiling three other cards from your graveyard.", 2, '{1}{R}'),
  card('One-Mana Discard Source', 'Artifact', '{T}, Discard your hand, Sacrifice this artifact: Add one mana of any color.', 0, '{0}'),
  card('Storm Mill Spell', 'Sorcery', 'Target player mills three cards.\nStorm', 2, '{1}{U}'),
]);
assert.equal(underpoweredEscapeMillManaNearMiss.status, 'not-repeatable');
assert.ok(underpoweredEscapeMillManaNearMiss.rejections.some(rejection => /cannot pay/.test(rejection.reason)));

const buybackRitualReducerLoop = provePackage([
  card('Buyback Spell Copy', 'Instant', 'Buyback {3}. Copy target instant or sorcery spell. You may choose new targets for the copy.', 3, '{1}{R}{R}'),
  card('Five-Mana Ritual', 'Instant', 'Add {R}{R}{R}{R}{R}.', 3, '{2}{R}'),
  card('Red Spell Reducer', 'Artifact', 'Red spells you cast cost {1} less to cast.', 2),
]);
assert.equal(buybackRitualReducerLoop.status, 'proven');
assert.ok(proofByFamily(buybackRitualReducerLoop, 'buyback-copy-ritual-loop'));
assert.ok(proofByFamily(buybackRitualReducerLoop, 'buyback-copy-ritual-loop').positiveDeltas.some(delta => delta.resource === 'casts'));

const buybackRitualSpellcastManaLoop = provePackage([
  card('Buyback Spell Copy', 'Instant', 'Buyback {3}. Copy target instant or sorcery spell. You may choose new targets for the copy.', 3, '{1}{R}{R}'),
  card('Five-Mana Ritual', 'Instant', 'Add {R}{R}{R}{R}{R}.', 3, '{2}{R}'),
  card('Spellcast Mana Payoff', 'Legendary Creature — God', 'Whenever you cast a spell, add {R}.', 3),
]);
assert.equal(buybackRitualSpellcastManaLoop.status, 'proven');
assert.ok(proofByFamily(buybackRitualSpellcastManaLoop, 'buyback-copy-ritual-loop'));

const buybackRitualNoSupportNearMiss = provePackage([
  card('Buyback Spell Copy', 'Instant', 'Buyback {3}. Copy target instant or sorcery spell. You may choose new targets for the copy.', 3, '{1}{R}{R}'),
  card('Five-Mana Ritual', 'Instant', 'Add {R}{R}{R}{R}{R}.', 3, '{2}{R}'),
]);
assert.equal(buybackRitualNoSupportNearMiss.status, 'not-repeatable');
assert.ok(buybackRitualNoSupportNearMiss.rejections.some(rejection => /buyback spell-copy cost/.test(rejection.reason)));

const kodamaBounceLandTokenLoop = provePackage([
  card('Permanent ETB Hand Dropper', 'Legendary Creature — Spirit', "Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.", 6),
  card('Self-Bounce Land', 'Land', "This land enters tapped. When this land enters, return a land you control to its owner's hand. {T}: Add {G}{U}.", 0),
  card('Landfall Treasure Payoff', 'Creature — Scout', 'Landfall — Whenever a land you control enters, create a Food token or a Treasure token.', 3),
]);
assert.equal(kodamaBounceLandTokenLoop.status, 'proven');
const kodamaBounceProof = proofByFamily(kodamaBounceLandTokenLoop, 'kodama-bounce-land-landfall-loop');
assert.ok(kodamaBounceProof);
assert.ok(kodamaBounceProof.positiveDeltas.some(delta => delta.resource === 'landfallTriggers'));
assert.ok(kodamaBounceProof.positiveDeltas.some(delta => delta.resource === 'tokens'));
assert.ok(kodamaBounceProof.positiveDeltas.some(delta => delta.resource === 'mana'));

const kodamaBounceLandManaLoop = provePackage([
  card('Permanent ETB Hand Dropper', 'Legendary Creature — Spirit', "Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.", 6),
  card('Self-Bounce Land', 'Land', "This land enters tapped. When this land enters, return a land you control to its owner's hand. {T}: Add {G}{U}.", 0),
  card('Landfall Mana Payoff', 'Creature — Snake', 'Landfall — Whenever a land you control enters, add one mana of any color.', 2),
]);
assert.equal(kodamaBounceLandManaLoop.status, 'proven');
assert.ok(proofByFamily(kodamaBounceLandManaLoop, 'kodama-bounce-land-landfall-loop').positiveDeltas.some(delta => delta.resource === 'mana'));

const landfallWithoutBounceNearMiss = provePackage([
  card('Permanent ETB Hand Dropper', 'Legendary Creature — Spirit', "Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.", 6),
  card('Landfall Treasure Payoff', 'Creature — Scout', 'Landfall — Whenever a land you control enters, create a Food token or a Treasure token.', 3),
]);
assert.equal(landfallWithoutBounceNearMiss.status, 'not-repeatable');
assert.ok(landfallWithoutBounceNearMiss.rejections.some(rejection => /self-bounce land/.test(rejection.reason)));

const variableBoardCountModalLoop = provePackage([
  card('Generic Tribe Count Druid', 'Creature — Elf Druid', '{T}: Add {G} for each Elf you control.', 2, '{1}{G}'),
  card('Generic Modal Untap Engine', 'Artifact', '{1}: Untap this artifact. {3}, {T}: Untap target creature. {4}, {T}: Draw a card. {2}, {T}: You gain 1 life.', 3, '{3}'),
]);
assert.equal(variableBoardCountModalLoop.status, 'proven');
const variableBoardCountModalProof = proofByFamily(variableBoardCountModalLoop, 'variable-board-count-mana-loop');
assert.ok(variableBoardCountModalProof);
assert.ok(variableBoardCountModalProof.positiveDeltas.some(delta => delta.resource === 'mana'));
assert.ok(variableBoardCountModalProof.positiveDeltas.some(delta => delta.resource === 'untaps'));
assert.ok(variableBoardCountModalProof.positiveDeltas.some(delta => delta.resource === 'cards'));
assert.ok(variableBoardCountModalProof.positiveDeltas.some(delta => delta.resource === 'life'));
assert.ok(variableBoardCountModalProof.proof.requiredFacts.some(f => f.predicate === 'minimum-board-count' && f.value === 5));
assert.ok(variableBoardCountModalProof.proof.assumptions.some(text => /at least 5 elf/.test(text)));

const variableBoardCountAuraLoop = provePackage([
  card('Generic Creature Count Druid', 'Creature — Druid', '{T}: Add one mana of any color for each creature you control.', 2, '{1}{G}'),
  card('Attached Green Untap Aura', 'Enchantment — Aura', 'Enchant creature {G}: Untap enchanted creature.', 1, '{G}'),
]);
assert.equal(variableBoardCountAuraLoop.status, 'proven');
assert.ok(proofByFamily(variableBoardCountAuraLoop, 'variable-board-count-mana-loop').proof.requiredFacts.some(f => f.predicate === 'minimum-board-count' && f.value === 2));

const variableBoardCountGlobalLoop = provePackage([
  card('Global Creature Count Druid', 'Creature — Druid', '{T}: Add {G} for each creature on the battlefield.', 2, '{1}{G}'),
  card('Attached Green Untap Aura', 'Enchantment — Aura', 'Enchant creature {G}: Untap enchanted creature.', 1, '{G}'),
]);
assert.equal(variableBoardCountGlobalLoop.status, 'proven');
assert.ok(proofByFamily(variableBoardCountGlobalLoop, 'variable-board-count-mana-loop').proof.assumptions.some(text => /at least 2 creature/.test(text)));

const variableBoardCountOpponentNearMiss = provePackage([
  card('Opponent Count Druid', 'Creature — Druid', '{T}: Add {G} for each creature target opponent controls.', 2, '{1}{G}'),
  card('Generic Modal Untap Engine', 'Artifact', '{1}: Untap this artifact. {3}, {T}: Untap target creature.', 3, '{3}'),
]);
assert.notEqual(variableBoardCountOpponentNearMiss.status, 'proven');
assert.equal(proofByFamily(variableBoardCountOpponentNearMiss, 'variable-board-count-mana-loop'), undefined);

const variableBoardCountColorMismatchNearMiss = provePackage([
  card('Green Tribe Count Druid', 'Creature — Elf Druid', '{T}: Add {G} for each Elf you control.', 2, '{1}{G}'),
  card('Blue Untap Aura', 'Enchantment — Aura', 'Enchant creature {U}: Untap enchanted creature.', 1, '{U}'),
]);
assert.equal(variableBoardCountColorMismatchNearMiss.status, 'not-repeatable');
assert.ok(variableBoardCountColorMismatchNearMiss.rejections.some(rejection => /cannot pay|positive mana/.test(rejection.reason)));

const variableBoardCountPumpLoop = provePackage([
  card('Generic Tribe Count Druid', 'Creature — Elf Druid', '{T}: Add {G} for each Elf you control.', 2, '{1}{G}'),
  card('Untap Symbol Equipment', 'Artifact — Equipment', 'Equipped creature has "{3}, {Q}: This creature gets +2/+2 until end of turn." Equip {0}', 3, '{3}'),
]);
assert.equal(variableBoardCountPumpLoop.status, 'proven');
assert.ok(proofByFamily(variableBoardCountPumpLoop, 'variable-board-count-mana-loop').positiveDeltas.some(delta => delta.resource === 'pump'));
assert.ok(proofByFamily(variableBoardCountPumpLoop, 'variable-board-count-mana-loop').proof.requiredFacts.some(f => f.predicate === 'minimum-board-count' && f.value === 4));

const variableBoardCountMissingEngineNearMiss = provePackage([
  card('Generic Tribe Count Druid', 'Creature — Elf Druid', '{T}: Add {G} for each Elf you control.', 2, '{1}{G}'),
]);
assert.equal(variableBoardCountMissingEngineNearMiss.status, 'not-repeatable');
assert.ok(variableBoardCountMissingEngineNearMiss.rejections.some(rejection => /repeatable creature-untap engine/.test(rejection.reason)));

const variableBoardCountIllegalTargetNearMiss = provePackage([
  card('Generic Count Rock', 'Artifact', '{T}: Add {G} for each artifact you control.', 2, '{2}'),
  card('Generic Modal Untap Engine', 'Artifact', '{1}: Untap this artifact. {3}, {T}: Untap target creature.', 3, '{3}'),
]);
assert.equal(variableBoardCountIllegalTargetNearMiss.status, 'not-repeatable');
assert.ok(variableBoardCountIllegalTargetNearMiss.rejections.some(rejection => /cannot legally target/.test(rejection.reason)));

const genericExtraCombatActivator = card('Generic Extra Combat Activator', 'Enchantment', '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase followed by an additional main phase. Activate only as a sorcery.', 3, '{3}');
const combatTreasureLoop = provePackage([
  card('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', 3, '{3}'),
  genericExtraCombatActivator,
]);
assert.equal(combatTreasureLoop.status, 'proven');
const combatTreasureProof = proofByFamily(combatTreasureLoop, 'combat-resource→extra-combat-loop');
assert.ok(combatTreasureProof);
assert.ok(combatTreasureProof.positiveDeltas.some(delta => delta.resource === 'combatPhases'));
assert.equal(combatTreasureProof.positiveDeltas.some(delta => delta.resource === 'mana' || delta.resource === 'tokens'), false, 'threshold Treasure loops should not claim accumulating mana/tokens without surplus proof');
assert.ok(combatTreasureProof.proof.requiredFacts.some(f => f.predicate === 'minimum-combat-damage' && f.value === 5));
assert.ok(combatTreasureProof.proof.requiredFacts.some(f => f.predicate === 'combat-damage-connects'));
assert.ok(combatTreasureProof.proof.assumptions.some(text => /connects/.test(text)));

const combatLandUntapLoop = provePackage([
  card('Combat Land Untap Equipment', 'Artifact — Equipment', 'Whenever equipped creature deals combat damage to a player, untap all lands you control.', 3, '{3}'),
  genericExtraCombatActivator,
]);
assert.equal(combatLandUntapLoop.status, 'proven');
const combatLandUntapProof = proofByFamily(combatLandUntapLoop, 'combat-resource→extra-combat-loop');
assert.ok(combatLandUntapProof.positiveDeltas.some(delta => delta.resource === 'combatPhases'));
assert.ok(combatLandUntapProof.positiveDeltas.some(delta => delta.resource === 'untaps'));
assert.ok(combatLandUntapProof.proof.requiredFacts.some(f => f.predicate === 'minimum-land-count' && f.value === 5));
assert.ok(combatLandUntapProof.proof.requiredFacts.some(f => f.predicate === 'land-mana-can-pay-extra-combat-cost'));

const attackLandUntapLoop = provePackage([
  card('Attack Land Untap Aura', 'Enchantment — Aura', 'Enchant creature Whenever enchanted creature attacks, untap all lands you control.', 2, '{2}'),
  genericExtraCombatActivator,
]);
assert.equal(attackLandUntapLoop.status, 'proven');
const attackLandUntapProof = proofByFamily(attackLandUntapLoop, 'combat-resource→extra-combat-loop');
assert.ok(attackLandUntapProof);
assert.equal(attackLandUntapProof.proof.requiredFacts.some(f => f.predicate === 'combat-damage-connects'), false);
assert.ok(attackLandUntapProof.proof.requiredFacts.some(f => f.predicate === 'attack-trigger-can-be-declared'));
assert.ok(attackLandUntapProof.proof.assumptions.some(text => /attack trigger/.test(text)));

const randomTreasureNearMiss = provePackage([
  card('Random Treasure Dragon', 'Creature — Dragon', 'Whenever this creature deals combat damage to a player, roll a d20. Create a number of Treasure tokens equal to the result.', 6, '{4}{R}{R}'),
  genericExtraCombatActivator,
]);
assert.equal(randomTreasureNearMiss.status, 'not-repeatable');
assert.ok(randomTreasureNearMiss.rejections.some(rejection => /not a deterministic/.test(rejection.reason)));

const fixedTreasureNearMiss = provePackage([
  card('Fixed Treasure Saboteur', 'Creature — Rogue', 'Whenever this creature deals combat damage to a player, create a Treasure token.', 2, '{1}{R}'),
  genericExtraCombatActivator,
]);
assert.equal(fixedTreasureNearMiss.status, 'not-repeatable');
assert.ok(fixedTreasureNearMiss.rejections.some(rejection => /not a deterministic/.test(rejection.reason)));

const noUntapExtraCombatNearMiss = provePackage([
  card('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', 3, '{3}'),
  card('Extra Combat Without Untap', 'Enchantment', '{3}{R}{R}: After this phase, there is an additional combat phase. Activate only as a sorcery.', 3, '{3}'),
]);
assert.equal(noUntapExtraCombatNearMiss.status, 'not-repeatable');
assert.ok(noUntapExtraCombatNearMiss.rejections.some(rejection => /does not untap attackers/.test(rejection.reason)));

const noMainPhaseExtraCombatNearMiss = provePackage([
  card('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', 3, '{3}'),
  card('Extra Combat Without Main', 'Enchantment', '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase. Activate only as a sorcery.', 3, '{3}'),
]);
assert.equal(noMainPhaseExtraCombatNearMiss.status, 'not-repeatable');
assert.ok(noMainPhaseExtraCombatNearMiss.rejections.some(rejection => /additional main phase/.test(rejection.reason)));

const attackTriggerTimingNearMiss = provePackage([
  card('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', 3, '{3}'),
  card('Attack Triggered Extra Combat', 'Creature — Dragon', 'Whenever this creature attacks, you may pay {5}{R}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.', 6, '{4}{R}{R}'),
]);
assert.equal(attackTriggerTimingNearMiss.status, 'not-repeatable');
assert.ok(attackTriggerTimingNearMiss.rejections.some(rejection => /cannot safely pay an attack-trigger extra-combat cost/.test(rejection.reason)));

const tappedNoncreatureExtraCombatNearMiss = provePackage([
  card('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', 3, '{3}'),
  card('Tapped Artifact Extra Combat', 'Artifact', '{3}{R}{R}, {T}: Untap all creatures you control. After this phase, there is an additional combat phase followed by an additional main phase.', 3, '{3}'),
]);
assert.equal(tappedNoncreatureExtraCombatNearMiss.status, 'not-repeatable');
assert.ok(tappedNoncreatureExtraCombatNearMiss.rejections.some(rejection => /source tap state/.test(rejection.reason)));
assert.equal(proofByFamily(tappedNoncreatureExtraCombatNearMiss, 'combat-resource→extra-combat-loop'), undefined);

const extraCombatPairOrderLoop = provePackage([
  card('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}', 3, '{3}'),
  card('Extra Combat Without Main', 'Enchantment', '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase. Activate only as a sorcery.', 3, '{3}'),
  genericExtraCombatActivator,
]);
assert.equal(extraCombatPairOrderLoop.status, 'proven');
assert.ok(proofByFamily(extraCombatPairOrderLoop, 'combat-resource→extra-combat-loop'), 'a rejected first extra-combat engine must not hide a later valid engine');

const combatSacrificeAura = card('Combat Sacrifice Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. Untap all creatures you control. After this phase, there is an additional combat phase.', 3, '{2}{R}');
const breathShapedAura = card('Breath-Shaped Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice it and attach Breath-Shaped Aura to a creature you control. If you do, untap all creatures you control and after this phase, there is an additional combat phase.', 3, '{2}{R}');
const freshCombatCarrierSource = card('Fresh Combat Carrier Source', 'Creature — Human Warrior', 'At the beginning of combat on your turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.', 3, '{2}{R}');
const combatSacrificeAuraLoop = provePackage([
  combatSacrificeAura,
  freshCombatCarrierSource,
]);
assert.equal(combatSacrificeAuraLoop.status, 'proven');
const combatSacrificeAuraProof = proofByFamily(combatSacrificeAuraLoop, 'combat-sacrifice-aura→extra-combat-loop');
assert.ok(combatSacrificeAuraProof);
for (const resource of ['combatPhases', 'sacrifices', 'deathTriggers', 'ltbTriggers', 'untaps']) {
  assert.ok(combatSacrificeAuraProof.positiveDeltas.some(delta => delta.resource === resource), `missing ${resource} delta`);
}
assert.equal(combatSacrificeAuraProof.positiveDeltas.some(delta => ['mana', 'tokens', 'damage'].includes(delta.resource)), false);
assert.ok(combatSacrificeAuraProof.proof.requiredFacts.some(f => f.predicate === 'combat-damage-connects'));
assert.ok(combatSacrificeAuraProof.proof.requiredFacts.some(f => f.predicate === 'fresh-carrier-continuity'));
assert.ok(combatSacrificeAuraProof.proof.requiredFacts.some(f => f.predicate === 'legal-reattach-target-at-trigger-resolution'));
assert.ok(combatSacrificeAuraProof.proof.requiredFacts.some(f => f.predicate === 'current-enchanted-carrier-at-loop-entry'));
assert.ok(combatSacrificeAuraProof.proof.requiredFacts.some(f => f.predicate === 'fresh-carrier-source-distinct-from-sacrificed-carrier'));
assert.ok(combatSacrificeAuraProof.proof.assumptions.some(text => /legal reattach target/.test(text)));
assert.ok(combatSacrificeAuraProof.proof.assumptions.some(text => /loop is already established/.test(text)));
assert.ok(combatSacrificeAuraProof.proof.limitingClauses.some(text => /no arbitrary external creature is inferred/.test(text)));
assert.equal(combatSacrificeAuraProof.proof.repeatability.status, 'repeatable-combat-carrier');

const breathShapedAuraLoop = provePackage([
  breathShapedAura,
  freshCombatCarrierSource,
]);
assert.equal(breathShapedAuraLoop.status, 'proven');
const breathShapedAuraProof = proofByFamily(breathShapedAuraLoop, 'combat-sacrifice-aura→extra-combat-loop');
assert.ok(breathShapedAuraProof);
assert.ok(breathShapedAuraProof.proof.requiredFacts.some(f => f.predicate === 'legal-reattach-target-at-trigger-resolution'));
assert.ok(breathShapedAuraProof.proof.requiredFacts.some(f => f.predicate === 'current-enchanted-carrier-at-loop-entry'));
assert.ok(breathShapedAuraProof.proof.assumptions.some(text => /creature you control and remains a legal reattach target/.test(text)));
assert.ok(breathShapedAuraProof.proof.limitingClauses.some(text => /established loop state/.test(text)));
assert.equal(breathShapedAuraProof.proof.repeatability.status, 'repeatable-combat-carrier');

const combatSacrificeAuraMissingCarrier = provePackage([combatSacrificeAura]);
assert.equal(combatSacrificeAuraMissingCarrier.status, 'not-repeatable');
assert.ok(combatSacrificeAuraMissingCarrier.rejections.some(rejection => /fresh carrier source/.test(rejection.reason)));

const breathShapedAuraMissingCarrier = provePackage([breathShapedAura]);
assert.equal(breathShapedAuraMissingCarrier.status, 'not-repeatable');
assert.ok(breathShapedAuraMissingCarrier.rejections.some(rejection => /fresh carrier source/.test(rejection.reason)));

const combatSacrificeAuraNoReattach = provePackage([
  card('Combat Sacrifice Aura Without Reattach', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature. Untap all creatures you control. After this phase, there is an additional combat phase.', 3),
  freshCombatCarrierSource,
]);
assert.equal(combatSacrificeAuraNoReattach.status, 'not-repeatable');
assert.ok(combatSacrificeAuraNoReattach.rejections.some(rejection => /reattach/.test(rejection.reason)));

const combatSacrificeAuraNoUntap = provePackage([
  card('Combat Sacrifice Aura Without Untap', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. After this phase, there is an additional combat phase.', 3),
  freshCombatCarrierSource,
]);
assert.notEqual(combatSacrificeAuraNoUntap.status, 'proven');
assert.equal(proofByFamily(combatSacrificeAuraNoUntap, 'combat-sacrifice-aura→extra-combat-loop'), undefined);

const combatSacrificeAuraOncePerTurn = provePackage([
  card('Once Per Turn Combat Sacrifice Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. Untap all creatures you control. After this phase, there is an additional combat phase. This ability triggers only once each turn.', 3),
  freshCombatCarrierSource,
]);
assert.notEqual(combatSacrificeAuraOncePerTurn.status, 'proven');
assert.equal(proofByFamily(combatSacrificeAuraOncePerTurn, 'combat-sacrifice-aura→extra-combat-loop'), undefined);

for (const staleCarrier of [
  card('Stale Carrier Source', 'Creature — Human Soldier', 'At the beginning of combat on your turn, create a 1/1 white Soldier creature token.', 2),
  card('Wrong Timing Carrier Source', 'Creature — Human Soldier', 'Whenever this creature attacks, create a 1/1 red Warrior creature token with haste.', 2),
  card('Non-Hasty Carrier Source', 'Creature — Human Soldier', 'At the beginning of combat on your turn, create a 1/1 red Warrior creature token. It attacks this combat if able.', 2),
  card('Tapped Attacking Carrier Source', 'Creature — Human Soldier', 'At the beginning of combat on your turn, create a 1/1 red Warrior creature token tapped and attacking.', 2),
  card('Hasty Tapped Attacking Carrier Source', 'Creature — Human Soldier', 'At the beginning of combat on your turn, create a 1/1 red Warrior creature token tapped and attacking. That token gains haste.', 2),
  card('Conditional Carrier Source', 'Creature — Human Soldier', 'At the beginning of combat on your turn, if you control a legendary creature, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.', 2),
  card('First Combat Only Carrier Source', 'Creature — Human Warrior', 'At the beginning of combat on your turn, if this is the first combat phase this turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.', 2),
  card('Generic Body Only', 'Creature — Bear', 'A plain creature.', 2),
]) {
  const nearMiss = provePackage([combatSacrificeAura, staleCarrier]);
  assert.notEqual(nearMiss.status, 'proven');
  assert.equal(proofByFamily(nearMiss, 'combat-sacrifice-aura→extra-combat-loop'), undefined);
}

const artifactTokenExtraTurnLoop = provePackage([
  card('Upkeep Artifact Token Engine', 'Artifact Creature — Thopter', 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens.', 6, '{6}'),
  card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
]);
assert.equal(artifactTokenExtraTurnLoop.status, 'proven');
const artifactTokenExtraTurnProof = proofByFamily(artifactTokenExtraTurnLoop, 'artifact-token→extra-turn-loop');
assert.ok(artifactTokenExtraTurnProof);
assert.ok(artifactTokenExtraTurnProof.positiveDeltas.some(delta => delta.resource === 'turns'));
assert.equal(artifactTokenExtraTurnProof.positiveDeltas.some(delta => delta.resource === 'mana' || delta.resource === 'tokens'), false, 'threshold extra-turn loops must not claim surplus mana/tokens');
assert.ok(artifactTokenExtraTurnProof.proof.requiredFacts.some(f => f.predicate === 'artifact-tokens-per-turn' && f.value === 5));
assert.ok(artifactTokenExtraTurnProof.proof.requiredFacts.some(f => f.predicate === 'artifact-extra-turn-sac-count' && f.value === 5));

const insufficientArtifactTokenExtraTurnNearMiss = provePackage([
  card('Four Artifact Token Engine', 'Artifact', 'At the beginning of your upkeep, create four Clue tokens.', 4, '{4}'),
  card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
]);
assert.equal(insufficientArtifactTokenExtraTurnNearMiss.status, 'not-repeatable');
assert.ok(insufficientArtifactTokenExtraTurnNearMiss.rejections.some(rejection => /does not meet/.test(rejection.reason)));

const nonArtifactTokenExtraTurnNearMiss = provePackage([
  card('Creature Token Engine', 'Creature', 'At the beginning of your upkeep, create five 1/1 white Soldier creature tokens.', 5, '{5}'),
  card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
]);
assert.equal(nonArtifactTokenExtraTurnNearMiss.status, 'not-repeatable');
assert.ok(nonArtifactTokenExtraTurnNearMiss.rejections.some(rejection => /artifact token refill/.test(rejection.reason)));

const oneShotArtifactTokenExtraTurnNearMiss = provePackage([
  card('ETB Artifact Token Engine', 'Artifact', 'When this artifact enters, create five Treasure tokens.', 5, '{5}'),
  card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
]);
assert.equal(oneShotArtifactTokenExtraTurnNearMiss.status, 'not-repeatable');
assert.ok(oneShotArtifactTokenExtraTurnNearMiss.rejections.some(rejection => /artifact token refill/.test(rejection.reason)));

const endStepArtifactTokenExtraTurnNearMiss = provePackage([
  card('End Step Artifact Token Engine', 'Artifact', 'At the beginning of your end step, create five Treasure tokens.', 5, '{5}'),
  card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
]);
assert.equal(endStepArtifactTokenExtraTurnNearMiss.status, 'not-repeatable');
assert.ok(endStepArtifactTokenExtraTurnNearMiss.rejections.some(rejection => /artifact token refill/.test(rejection.reason)));

const oncePerTurnArtifactTokenSourceNearMiss = provePackage([
  card('Once Per Turn Upkeep Artifact Token Engine', 'Artifact Creature — Thopter', 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens. This ability triggers only once each turn.', 6, '{6}'),
  card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
]);
assert.equal(oncePerTurnArtifactTokenSourceNearMiss.status, 'not-repeatable');
assert.ok(oncePerTurnArtifactTokenSourceNearMiss.rejections.some(rejection => /artifact token refill/.test(rejection.reason)));
assert.equal(proofByFamily(oncePerTurnArtifactTokenSourceNearMiss, 'artifact-token→extra-turn-loop'), undefined);

const oncePerTurnArtifactExtraTurnNearMiss = provePackage([
  card('Upkeep Artifact Token Engine', 'Artifact Creature — Thopter', 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens.', 6, '{6}'),
  card('Once Per Turn Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one. Activate only once each turn.', 2, '{2}'),
]);
assert.equal(oncePerTurnArtifactExtraTurnNearMiss.status, 'no-proof');

const replacementAmplifiedArtifactExtraTurnNearMiss = provePackage([
  card('Four Artifact Token Engine', 'Artifact', 'At the beginning of your upkeep, create four Clue tokens.', 4, '{4}'),
  card('Token Doubler', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', 4, '{4}'),
  card('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.', 2, '{2}'),
]);
assert.equal(replacementAmplifiedArtifactExtraTurnNearMiss.status, 'not-repeatable');
assert.equal(proofByFamily(replacementAmplifiedArtifactExtraTurnNearMiss, 'artifact-token→extra-turn-loop'), undefined, 'broad token replacement is deliberately not strict proof for artifact-token extra turns');

const counterThresholdDoublerExtraTurnLoop = provePackage([
  card('Counter Threshold Extra-Turn Engine', 'Artifact', '{T}, Remove three charge counters from this artifact: Take an extra turn after this one.', 3),
  card('Free Counter Doubler', 'Artifact', '{T}: Double the number of each kind of counter on target artifact.', 2),
]);
assert.equal(counterThresholdDoublerExtraTurnLoop.status, 'proven');
const counterThresholdDoublerProof = proofByFamily(counterThresholdDoublerExtraTurnLoop, 'counter-threshold-doubler→extra-turn-loop');
assert.ok(counterThresholdDoublerProof);
assert.ok(counterThresholdDoublerProof.positiveDeltas.some(delta => delta.resource === 'turns'));
assert.equal(counterThresholdDoublerProof.positiveDeltas.some(delta => delta.resource === 'counters'), false, 'threshold-only counter extra-turn loops must not claim surplus counters');
assert.ok(counterThresholdDoublerProof.proof.requiredFacts.some(f => f.predicate === 'counter-threshold-extra-turn-threshold' && f.value === 3));
assert.ok(counterThresholdDoublerProof.proof.requiredFacts.some(f => f.predicate === 'established-counters-at-loop-entry' && f.value === 3));

const manaPaidCounterThresholdNearMiss = provePackage([
  card('Counter Threshold Extra-Turn Engine', 'Artifact', '{T}, Remove three charge counters from this artifact: Take an extra turn after this one.', 3),
  card('Mana-Paid Counter Doubler', 'Artifact', '{2}, {T}: Double the number of each kind of counter on target artifact.', 3),
]);
assert.equal(manaPaidCounterThresholdNearMiss.status, 'not-repeatable');
assert.ok(manaPaidCounterThresholdNearMiss.rejections.some(rejection => /mana cost/.test(rejection.reason)));
assert.equal(proofByFamily(manaPaidCounterThresholdNearMiss, 'counter-threshold-doubler→extra-turn-loop'), undefined);

const counterThresholdProliferateExtraTurnLoop = provePackage([
  card('Counter Threshold Extra-Turn Engine', 'Artifact', '{T}, Remove three charge counters from this artifact: Take an extra turn after this one.', 3),
  card('Single Proliferator', 'Artifact', 'At the beginning of your end step, proliferate.', 4),
  card('Proliferate Doubler', 'Creature — Phyrexian Wizard', 'If you would proliferate, proliferate twice instead.', 4),
]);
assert.equal(counterThresholdProliferateExtraTurnLoop.status, 'not-repeatable');
assert.equal(proofByFamily(counterThresholdProliferateExtraTurnLoop, 'counter-threshold-proliferate→extra-turn-loop'), undefined, 'two proliferates per turn are still below a three-counter threshold from a single seed');

const strongCounterThresholdProliferateLoop = provePackage([
  card('Counter Threshold Extra-Turn Engine', 'Artifact', '{T}, Remove three charge counters from this artifact: Take an extra turn after this one.', 3),
  card('Free Proliferator', 'Artifact', '{T}: Proliferate three times.', 4),
  card('Proliferate Doubler', 'Creature — Phyrexian Wizard', 'If you would proliferate, proliferate twice instead.', 4),
]);
assert.equal(strongCounterThresholdProliferateLoop.status, 'proven');
const counterThresholdProliferateProof = proofByFamily(strongCounterThresholdProliferateLoop, 'counter-threshold-proliferate→extra-turn-loop');
assert.ok(counterThresholdProliferateProof);
assert.ok(counterThresholdProliferateProof.positiveDeltas.some(delta => delta.resource === 'turns'));
assert.equal(counterThresholdProliferateProof.positiveDeltas.some(delta => delta.resource === 'counters'), false);
assert.ok(counterThresholdProliferateProof.proof.requiredFacts.some(f => f.predicate === 'established-counters-at-loop-entry' && f.value === 1));
assert.ok(counterThresholdProliferateProof.proof.requiredFacts.some(f => f.predicate === 'proliferate-count-per-turn' && f.value === 3));

const lifelinkCounterDamageLoop = provePackage([
  card('Lifelink Counter Engine', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control. {1}{W}: Another target creature gains lifelink until end of turn.', 3),
  card('Counter Damage Creature', 'Artifact Creature — Construct', 'This creature enters with X +1/+1 counters on it. Remove a +1/+1 counter from this creature: It deals 1 damage to any target.', 0),
]);
assert.equal(lifelinkCounterDamageLoop.status, 'proven');
assert.ok(proofByFamily(lifelinkCounterDamageLoop, 'lifelink-counter-damage-loop'));
assert.ok(proofByFamily(lifelinkCounterDamageLoop, 'lifelink-counter-damage-loop').positiveDeltas.some(delta => delta.resource === 'damage'));

const lifelinkCounterDamageNearMiss = provePackage([
  card('Lifelink Counter Engine', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control. {1}{W}: Another target creature gains lifelink until end of turn.', 3),
  card('Counter Damage Artifact', 'Artifact', 'This artifact enters with X +1/+1 counters on it. Remove a +1/+1 counter from this artifact: It deals 1 damage to any target.', 0),
]);
assert.notEqual(lifelinkCounterDamageNearMiss.status, 'proven');

const lifePaidDamageRecoveryLoop = provePackage([
  card('Life-Paid Damage Source', 'Artifact', 'Pay 50 life: This artifact deals 50 damage to any target.', 4),
  card('Opponent Loss Lifegain Payoff', 'Enchantment', 'Whenever an opponent loses life, you gain that much life.', 5),
]);
assert.equal(lifePaidDamageRecoveryLoop.status, 'proven');
assert.ok(proofByFamily(lifePaidDamageRecoveryLoop, 'life-paid-damage-lifeloss-recovery-loop'));
assert.ok(proofByFamily(lifePaidDamageRecoveryLoop, 'life-paid-damage-lifeloss-recovery-loop').positiveDeltas.some(delta => delta.resource === 'damage'));

const tappedLifePaidDamageNearMiss = provePackage([
  card('Tapped Life-Paid Damage Source', 'Artifact', '{T}, Pay 50 life: This artifact deals 50 damage to any target.', 4),
  card('Opponent Loss Lifegain Payoff', 'Enchantment', 'Whenever an opponent loses life, you gain that much life.', 5),
]);
assert.notEqual(tappedLifePaidDamageNearMiss.status, 'proven');
assert.equal(proofByFamily(tappedLifePaidDamageNearMiss, 'life-paid-damage-lifeloss-recovery-loop'), undefined);

const counterTokenEtbCounterLoop = provePackage([
  card('Counter Token Engine', 'Creature — Plant', 'Whenever one or more +1/+1 counters are put on this creature, create a 1/1 green Saproling creature token.', 3),
  card('Green ETB Counter Granter', 'Creature — Elf', 'Whenever another green creature you control enters, put a +1/+1 counter on target creature.', 4),
]);
assert.equal(counterTokenEtbCounterLoop.status, 'proven');
const counterTokenProof = proofByFamily(counterTokenEtbCounterLoop, 'counter-token→etb-counter-loop');
assert.ok(counterTokenProof);
assert.ok(counterTokenProof.positiveDeltas.some(delta => delta.resource === 'tokens'));
assert.ok(counterTokenProof.positiveDeltas.some(delta => delta.resource === 'counters'));

const reminderTextCounterTokenEtbCounterLoop = provePackage([
  card('Reminder Text Counter Token Engine', 'Creature — Treefolk', 'Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.) Whenever one or more +1/+1 counters are put on this creature, you may create a 1/1 green Squirrel creature token.', 3),
  card('Green ETB Counter Granter', 'Creature — Elf', 'Whenever another green creature you control enters, put a +1/+1 counter on target creature.', 4),
]);
assert.equal(reminderTextCounterTokenEtbCounterLoop.status, 'proven');
assert.ok(proofByFamily(reminderTextCounterTokenEtbCounterLoop, 'counter-token→etb-counter-loop'));

const counterTokenColorNearMiss = provePackage([
  card('Colorless Counter Token Engine', 'Creature — Eldrazi', 'Whenever one or more +1/+1 counters are put on this creature, create a 0/1 colorless Eldrazi Spawn creature token.', 2),
  card('Green ETB Counter Granter', 'Creature — Elf', 'Whenever another green creature you control enters, put a +1/+1 counter on target creature.', 4),
]);
assert.notEqual(counterTokenColorNearMiss.status, 'proven');
assert.equal(proofByFamily(counterTokenColorNearMiss, 'counter-token→etb-counter-loop'), undefined);

const minusCounterDeathTokenLoop = provePackage([
  card('Minus Counter Death Spreader', 'Enchantment', 'Whenever a creature dies, if it had a -1/-1 counter on it, put a -1/-1 counter on target creature.', 3),
  card('Minus Counter Token Engine', 'Enchantment', 'Whenever you put one or more -1/-1 counters on a creature, create that many 1/1 black Insect creature tokens.', 3),
]);
assert.equal(minusCounterDeathTokenLoop.status, 'proven');
const minusCounterProof = proofByFamily(minusCounterDeathTokenLoop, 'minus-counter-death→token-loop');
assert.ok(minusCounterProof);
assert.ok(minusCounterProof.positiveDeltas.some(delta => delta.resource === 'deathTriggers'));

const lifegainCounterTokenEtbLoop = provePackage([
  card('Named Counter Token Engine', 'Creature — Treefolk', 'Whenever one or more +1/+1 counters are put on Named Counter Token Engine, create a 1/1 green Squirrel creature token.', 3),
  card('Lifegain Counter Payoff', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control.', 3),
  card('Creature ETB Lifegain Payoff', 'Creature — Cleric', 'Whenever another creature enters the battlefield under your control, you gain 1 life.', 1),
]);
assert.equal(lifegainCounterTokenEtbLoop.status, 'proven');
const lifegainCounterProof = proofByFamily(lifegainCounterTokenEtbLoop, 'lifegain-counter-token-etb-loop');
assert.ok(lifegainCounterProof);
assert.ok(lifegainCounterProof.positiveDeltas.some(delta => delta.resource === 'life'));
assert.ok(lifegainCounterProof.positiveDeltas.some(delta => delta.resource === 'tokens'));

const lifegainCounterOncePerTurnNearMiss = provePackage([
  card('Named Counter Token Engine', 'Creature — Treefolk', 'Whenever one or more +1/+1 counters are put on Named Counter Token Engine, create a 1/1 green Squirrel creature token.', 3),
  card('Lifegain Counter Payoff', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control.', 3),
  card('Once-Per-Turn ETB Lifegain Payoff', 'Creature — Cleric', 'Whenever another creature enters the battlefield under your control, you gain 1 life. This ability triggers only once each turn.', 1),
]);
assert.notEqual(lifegainCounterOncePerTurnNearMiss.status, 'proven');
assert.equal(proofByFamily(lifegainCounterOncePerTurnNearMiss, 'lifegain-counter-token-etb-loop'), undefined);

const intrinsicDeathUntapPingerLock = provePackage([
  card('Death Untap Pinger', 'Creature — Goblin', "This creature doesn't untap during your untap step. Whenever a creature dies, untap this creature. {T}: This creature deals 1 damage to any target.", 3),
  card('Deathtouch Equipment', 'Artifact — Equipment', 'Equipped creature has deathtouch. Equip {2}', 1),
]);
assert.equal(intrinsicDeathUntapPingerLock.status, 'proven');
assert.ok(proofByFamily(intrinsicDeathUntapPingerLock, 'death-untap-deathtouch-pinger-lock'));

const grantedDeathUntapPingerLock = provePackage([
  card('Death Untap Equipment', 'Artifact — Equipment', 'Equipped creature has "Whenever a creature dies, untap this creature." Equip {4}', 2),
  card('Free Ping Equipment', 'Artifact — Equipment', 'Equipped creature has "{T}: This creature deals 1 damage to any target." Equip {3}', 1),
  card('Deathtouch Equipment', 'Artifact — Equipment', 'Equipped creature has deathtouch. Equip {2}', 1),
]);
assert.equal(grantedDeathUntapPingerLock.status, 'proven');
assert.ok(proofByFamily(grantedDeathUntapPingerLock, 'death-untap-deathtouch-pinger-lock'));

const costedPingerNearMiss = provePackage([
  card('Death Untap Equipment', 'Artifact — Equipment', 'Equipped creature has "Whenever a creature dies, untap this creature." Equip {4}', 2),
  card('Costed Ping Equipment', 'Artifact — Equipment', 'Equipped creature has "{2}, {T}: This creature deals 1 damage to any target." Equip {4}', 2),
  card('Deathtouch Equipment', 'Artifact — Equipment', 'Equipped creature has deathtouch. Equip {2}', 1),
]);
assert.notEqual(costedPingerNearMiss.status, 'proven');
assert.equal(proofByFamily(costedPingerNearMiss, 'death-untap-deathtouch-pinger-lock'), undefined);

const oncePerTurnDeathUntapNearMiss = provePackage([
  card('Once-Per-Turn Death Untap Equipment', 'Artifact — Equipment', 'Equipped creature has "Whenever a creature dies, untap this creature. This ability triggers only once each turn." Equip {4}', 2),
  card('Free Ping Equipment', 'Artifact — Equipment', 'Equipped creature has "{T}: This creature deals 1 damage to any target." Equip {3}', 1),
  card('Deathtouch Equipment', 'Artifact — Equipment', 'Equipped creature has deathtouch. Equip {2}', 1),
]);
assert.notEqual(oncePerTurnDeathUntapNearMiss.status, 'proven');
assert.equal(proofByFamily(oncePerTurnDeathUntapNearMiss, 'death-untap-deathtouch-pinger-lock'), undefined);

const splitIntrinsicPingerUntapperNearMiss = provePackage([
  card('Free Pinger Creature', 'Creature — Goblin', '{T}: This creature deals 1 damage to any target.', 1),
  card('Death Untap Creature', 'Creature — Spirit', 'Whenever a creature dies, untap this creature.', 2),
  card('Deathtouch Equipment', 'Artifact — Equipment', 'Equipped creature has deathtouch. Equip {2}', 1),
]);
assert.notEqual(splitIntrinsicPingerUntapperNearMiss.status, 'proven');
assert.equal(proofByFamily(splitIntrinsicPingerUntapperNearMiss, 'death-untap-deathtouch-pinger-lock'), undefined, 'intrinsic ping and death-untap roles on different creatures must not be assembled into one source');

const libraryWin = provePackage([
  card('Repeat Library Exiler', 'Instant', 'Exile the top card of your library. You may put that card into your hand unless it has the same name as another card exiled this way. Repeat this process until you put a card into your hand or exile two cards with the same name.', 2),
  card('Empty Library Oracle', 'Creature — Merfolk Wizard', 'When this creature enters, look at the top X cards of your library, where X is your devotion to blue. If X is greater than or equal to the number of cards in your library, you win the game.', 2),
]);
assert.equal(libraryWin.status, 'proven');
assert.ok(proofByFamily(libraryWin, 'library-exile-empty-library-win'));
assert.equal(proofByFamily(libraryWin, 'library-exile-empty-library-win').proof.repeatability.status, 'non-loop-win');

const impulseNearMiss = provePackage([
  card('Small Impulse Draw', 'Sorcery', 'Exile the top two cards of your library. Until your next turn, you may play those cards.', 2),
  card('Empty Library Oracle', 'Creature — Merfolk Wizard', 'When this creature enters, look at the top X cards of your library, where X is your devotion to blue. If X is greater than or equal to the number of cards in your library, you win the game.', 2),
]);
assert.notEqual(impulseNearMiss.status, 'proven');

const imprintLoop = provePackage([
  card('Nonland Untap Spell', 'Instant', 'Untap all nonland permanents you control.', 2),
  card('Repeatable Instant Caster', 'Artifact', 'Imprint — When this artifact enters, you may exile an instant card with mana value 2 or less from your hand. {2}, {T}: You may copy the exiled card. If you do, you may cast the copy without paying its mana cost.', 2),
]);
assert.equal(imprintLoop.status, 'proven');
assert.ok(proofByFamily(imprintLoop, 'imprint-untap-spell-loop'));
assert.equal(proofByFamily(imprintLoop, 'imprint-untap-spell-loop').proof.repeatability.status, 'repeatable-candidate');

const tapFreeCastUntapEngine = provePackage([
  card('Codie-Style Engine', 'Legendary Artifact Creature — Construct', '{4}, {T}: Add {W}{U}{B}{R}{G}. When you cast your next spell this turn, exile cards from the top of your library until you exile an instant or sorcery card with lesser mana value. Until end of turn, you may cast that card without paying its mana cost.', 3),
  card('Twiddle-Style Spell', 'Instant', 'You may tap or untap target artifact, creature, or land.', 1),
]);
assert.equal(tapFreeCastUntapEngine.status, 'proven');
assert.ok(proofByFamily(tapFreeCastUntapEngine, 'tap-free-cast→untap-engine'));
assert.equal(proofByFamily(tapFreeCastUntapEngine, 'tap-free-cast→untap-engine').proof.repeatability.status, 'value-engine');

const targetMismatchTapFreeCastEngine = provePackage([
  card('Tap Free-Cast Enchantment', 'Enchantment', '{2}, {T}: Exile the top card of your library. You may cast it without paying its mana cost.', 3),
  card('Creature-Only Untap Spell', 'Instant', 'Untap target creature.', 1),
]);
assert.equal(targetMismatchTapFreeCastEngine.status, 'not-repeatable');
assert.ok(targetMismatchTapFreeCastEngine.rejections.some(rejection => /cannot legally reset/.test(rejection.reason)));

const abilityCopyLoop = provePackage([
  card('Ability Copier', 'Artifact', "Whenever you activate an ability, if it isn't a mana ability, you may pay {2}. If you do, copy that ability.", 3),
  card('Self Untap Mana Rock', 'Artifact', "{T}: Add {C}{C}{C}. {3}: Untap this artifact.", 3),
]);
assert.equal(abilityCopyLoop.status, 'proven');
assert.ok(proofByFamily(abilityCopyLoop, 'self-untap-mana→ability-copy-loop'));
assert.deepEqual(proofByFamily(abilityCopyLoop, 'self-untap-mana→ability-copy-loop').positiveDeltas[0], { resource: 'mana', min: 1, max: 1 });

const lowOutputCopyNearMiss = provePackage([
  card('Ability Copier', 'Artifact', "Whenever you activate an ability, if it isn't a mana ability, you may pay {2}. If you do, copy that ability.", 3),
  card('Low Output Self Untapper', 'Artifact', "{T}: Add {C}. {1}: Untap this artifact.", 2),
]);
assert.equal(lowOutputCopyNearMiss.status, 'not-repeatable');
assert.ok(lowOutputCopyNearMiss.rejections.some(rejection => /positive mana|copy cost/.test(rejection.reason)));

const colorlessAmplifiedSelfLoop = provePackage([
  card('Colorless Mana Amplifier', 'Artifact', 'Whenever you tap a permanent for {C}, add an additional {C}.', 5),
  card('Break-Even Self Untapper With Colorless', 'Artifact', '{T}: Add {C}{C}{C}. {3}: Untap this artifact.', 3),
]);
assert.equal(colorlessAmplifiedSelfLoop.status, 'proven');
assert.ok(proofByFamily(colorlessAmplifiedSelfLoop, 'self-untap-mana-loop'));
assert.deepEqual(proofByFamily(colorlessAmplifiedSelfLoop, 'self-untap-mana-loop').positiveDeltas[0], { resource: 'mana', min: 1, max: 1 });

const anyTypeAmplifiedSelfLoop = provePackage([
  card('Any-Type Nonland Mana Amplifier', 'Legendary Creature — Druid', 'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.', 2),
  card('Break-Even Self Untapper With Colorless', 'Artifact', '{T}: Add {C}{C}{C}. {3}: Untap this artifact.', 3),
]);
assert.equal(anyTypeAmplifiedSelfLoop.status, 'proven');
assert.ok(proofByFamily(anyTypeAmplifiedSelfLoop, 'self-untap-mana-loop'));
assert.deepEqual(proofByFamily(anyTypeAmplifiedSelfLoop, 'self-untap-mana-loop').positiveDeltas[0], { resource: 'mana', min: 1, max: 1 });

const colorlessAmplifierNearMiss = provePackage([
  card('Colorless Mana Amplifier', 'Artifact', 'Whenever you tap a permanent for {C}, add an additional {C}.', 5),
  card('Colored Self Untapper', 'Creature — Elf', '{T}: Add {G}{G}{G}. {3}: Untap this creature.', 3),
]);
assert.equal(colorlessAmplifierNearMiss.status, 'not-repeatable');
assert.ok(colorlessAmplifierNearMiss.rejections.some(rejection => /self-untap cost/.test(rejection.reason)));

const costReducedSelfUntapLoop = provePackage([
  card('Self Untapping Artifact', 'Artifact', "This artifact doesn't untap during your untap step. {T}: Add {C}{C}{C}. {3}: Untap this artifact.", 3),
  card('Artifact Ability Cost Reducer', 'Creature — Vedalken Artificer', "Activated abilities of artifacts you control cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.", 3),
]);
assert.equal(costReducedSelfUntapLoop.status, 'proven');
assert.ok(proofByFamily(costReducedSelfUntapLoop, 'self-untap-mana-loop'));
assert.deepEqual(proofByFamily(costReducedSelfUntapLoop, 'self-untap-mana-loop').positiveDeltas[0], { resource: 'mana', min: 1, max: 1 });

const artifactReducerCreatureNearMiss = provePackage([
  card('Self Untapping Creature', 'Creature — Elf Druid', '{T}: Add {G}{G}{G}. {3}: Untap this creature.', 3),
  card('Artifact Ability Cost Reducer', 'Creature — Vedalken Artificer', "Activated abilities of artifacts you control cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.", 3),
]);
assert.equal(artifactReducerCreatureNearMiss.status, 'not-repeatable');
assert.ok(artifactReducerCreatureNearMiss.rejections.some(rejection => /self-untap cost/.test(rejection.reason)));

const artifactReducerMinimumCostNearMiss = provePackage([
  card('One Mana Self Untapping Artifact', 'Artifact', '{T}: Add {C}. {1}: Untap this artifact.', 1),
  card('Artifact Ability Cost Reducer', 'Creature — Vedalken Artificer', "Activated abilities of artifacts you control cost {3} less to activate. This effect can't reduce the mana in that cost to less than one mana.", 3),
]);
assert.equal(artifactReducerMinimumCostNearMiss.status, 'not-repeatable');
assert.ok(artifactReducerMinimumCostNearMiss.rejections.some(rejection => /self-untap cost/.test(rejection.reason)));

const hastyCopyLoop = provePackage([
  card('Hasty Copy Engine', 'Legendary Creature — Goblin Shaman', "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.", 5),
  card('Permanent Untapper', 'Creature — Human Warrior', 'When this creature enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.', 5),
]);
assert.equal(hastyCopyLoop.status, 'proven');
assert.ok(proofByFamily(hastyCopyLoop, 'hasty-copy→etb-untap-loop'));

const hastyCopyLegendaryNearMiss = provePackage([
  card('Hasty Copy Engine', 'Legendary Creature — Goblin Shaman', "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.", 5),
  card('Legendary Permanent Untapper', 'Legendary Creature — Human Warrior', 'When this creature enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.', 5),
]);
assert.equal(hastyCopyLegendaryNearMiss.status, 'not-repeatable');
assert.ok(hastyCopyLegendaryNearMiss.rejections.some(rejection => /target restrictions/.test(rejection.reason)));

const hastyCopyDfcFaceMismatch = provePackage([
  card('Hasty Copy Engine', 'Legendary Creature — Goblin Shaman', "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.", 5),
  {
    name: 'Artifact Untapper // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 3,
    card_faces: [
      {
        name: 'Artifact Untapper',
        type_line: 'Artifact',
        oracle_text: 'When this artifact enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.',
      },
      {
        name: 'Vanilla Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain creature face with no triggered abilities.',
      },
    ],
  },
]);
assert.equal(hastyCopyDfcFaceMismatch.status, 'not-repeatable');
assert.ok(hastyCopyDfcFaceMismatch.rejections.some(rejection => /target restrictions|mutually exclusive faces/.test(rejection.reason)));

const combatCopyExtraCombatLoop = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('First Attack Extra Combat', 'Legendary Creature — Angel', 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.', 4),
]);
assert.equal(combatCopyExtraCombatLoop.status, 'proven');
assert.ok(proofByFamily(combatCopyExtraCombatLoop, 'combat-copy-token→extra-combat-loop'));
const combatCopyProof = proofByFamily(combatCopyExtraCombatLoop, 'combat-copy-token→extra-combat-loop');
assert.ok(combatCopyProof.proof.requiredFacts.some(fact => fact.predicate === 'precombat-copy-created-before-attack'));
assert.ok(combatCopyProof.proof.requiredFacts.some(fact => fact.predicate === 'fresh-token-unused-attack-trigger-at-loop-entry'));

const combatCopyExtraCombatNearMiss = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('Vanilla Attacker', 'Creature — Human Warrior', 'Haste.', 2),
]);
assert.notEqual(combatCopyExtraCombatNearMiss.status, 'proven');

const hastyCopyAttackExtraCombatLoop = provePackage([
  card('Hasty Copy Source', 'Legendary Creature — Goblin Shaman', "Haste. {T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", 5),
  card('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", 3),
]);
assert.equal(hastyCopyAttackExtraCombatLoop.status, 'proven');
assert.ok(proofByFamily(hastyCopyAttackExtraCombatLoop, 'hasty-copy→attack-extra-combat-loop'));

const genericPrecombatAttackExtraCombatLoop = provePackage([
  card('Generic Precombat Copy Source', 'Enchantment', "At the beginning of combat on your turn, create a token that's a copy of target creature you control. That token gains haste.", 4),
  card('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", 3),
]);
assert.equal(genericPrecombatAttackExtraCombatLoop.status, 'proven');
assert.ok(proofByFamily(genericPrecombatAttackExtraCombatLoop, 'combat-copy-token→extra-combat-loop'));

const broadHastyCopyNonlegendaryAttackLoop = provePackage([
  card('Broad Hasty Copy Source', 'Artifact Creature — Shapeshifter', "{T}: Create a token that's a copy of target creature you control, except it has haste.", 5),
  card('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", 3),
]);
assert.equal(broadHastyCopyNonlegendaryAttackLoop.status, 'proven');
assert.ok(proofByFamily(broadHastyCopyNonlegendaryAttackLoop, 'hasty-copy→attack-extra-combat-loop'));

const attachedCopyAttackExtraCombatLoop = provePackage([
  card('Attached Self Copy Aura', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature has "{T}: Create a token that’s a copy of this creature, except it has haste. Exile that token at the beginning of the next end step."', 4),
  card('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", 3),
]);
assert.equal(attachedCopyAttackExtraCombatLoop.status, 'proven');
assert.ok(proofByFamily(attachedCopyAttackExtraCombatLoop, 'hasty-copy→attack-extra-combat-loop'));

const hastyCopyLegendaryAttackNearMiss = provePackage([
  card('Hasty Copy Source', 'Legendary Creature — Goblin Shaman', "Haste. {T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", 5),
  card('Legendary Attack Extra Combat', 'Legendary Creature — Angel', 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.', 4),
]);
assert.notEqual(hastyCopyLegendaryAttackNearMiss.status, 'proven');
assert.ok(hastyCopyLegendaryAttackNearMiss.rejections.some(rejection => /target restrictions|legend/i.test(rejection.reason)));

const broadHastyCopyLegendaryAttackNearMiss = provePackage([
  card('Broad Hasty Copy Source', 'Artifact Creature — Shapeshifter', "{T}: Create a token that's a copy of target creature you control, except it has haste.", 5),
  card('Legendary Attack Extra Combat', 'Legendary Creature — Angel', 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.', 4),
]);
assert.notEqual(broadHastyCopyLegendaryAttackNearMiss.status, 'proven');
assert.ok(broadHastyCopyLegendaryAttackNearMiss.rejections.some(rejection => /target restrictions|legend|survival/i.test(rejection.reason)));

const precombatCopyLegendaryDfcAttackNearMiss = provePackage([
  card('Generic Precombat Copy Source', 'Enchantment', "At the beginning of combat on your turn, create a token that's a copy of target creature you control. That token gains haste.", 4),
  {
    name: 'Legendary Extra Combat // Nonlegendary Creature',
    layout: 'modal_dfc',
    type_line: 'Legendary Creature // Creature',
    cmc: 4,
    card_faces: [
      {
        name: 'Legendary Extra Combat',
        type_line: 'Legendary Creature — Angel',
        oracle_text: 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.',
      },
      {
        name: 'Nonlegendary Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain nonlegendary creature face.',
      },
    ],
  },
]);
assert.notEqual(precombatCopyLegendaryDfcAttackNearMiss.status, 'proven');
assert.equal(proofByFamily(precombatCopyLegendaryDfcAttackNearMiss, 'combat-copy-token→extra-combat-loop'), undefined);
assert.ok(precombatCopyLegendaryDfcAttackNearMiss.rejections.some(rejection => /legend|copy|target|surviv/i.test(rejection.reason)));

const tappedArtifactHastyCopyAttackNearMiss = provePackage([
  card('Tapped Artifact Hasty Copy Source', 'Artifact', "{T}: Create a token that's a copy of target creature you control, except it has haste.", 5),
  card('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", 3),
]);
assert.notEqual(tappedArtifactHastyCopyAttackNearMiss.status, 'proven');
assert.equal(proofByFamily(tappedArtifactHastyCopyAttackNearMiss, 'hasty-copy→attack-extra-combat-loop'), undefined);
assert.ok(tappedArtifactHastyCopyAttackNearMiss.rejections.some(rejection => /reset|untap/i.test(rejection.reason)));

const artifactFaceHastyCopyDfcAttackNearMiss = provePackage([
  {
    name: 'Artifact Hasty Copy // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 5,
    card_faces: [
      {
        name: 'Artifact Hasty Copy',
        type_line: 'Artifact',
        oracle_text: "{T}: Create a token that's a copy of target creature you control, except it has haste.",
      },
      {
        name: 'Vanilla Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain creature face with no activated copy ability.',
      },
    ],
  },
  card('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.", 3),
]);
assert.notEqual(artifactFaceHastyCopyDfcAttackNearMiss.status, 'proven');
assert.equal(proofByFamily(artifactFaceHastyCopyDfcAttackNearMiss, 'hasty-copy→attack-extra-combat-loop'), undefined);
assert.ok(artifactFaceHastyCopyDfcAttackNearMiss.rejections.some(rejection => /reset|untap/i.test(rejection.reason)));

const combatCopyConnectExtraCombatLoop = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('Connect Extra Combat', 'Creature — Orc Pirate', "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase. This creature can't attack a player it has already attacked this turn.", 5),
]);
assert.equal(combatCopyConnectExtraCombatLoop.status, 'proven');
const connectProof = proofByFamily(combatCopyConnectExtraCombatLoop, 'combat-copy-token→connect-extra-combat-loop');
assert.ok(connectProof);
assert.ok(connectProof.proof.requiredFacts.some(fact => fact.predicate === 'combat-damage-connects'));

const hastyCopyConnectExtraCombatLoop = provePackage([
  card('Hasty Copy Source', 'Legendary Creature — Goblin Shaman', "Haste. {T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", 5),
  card('Connect Extra Combat', 'Creature — Orc Pirate', "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase. This creature can't attack a player it has already attacked this turn.", 5),
]);
assert.equal(hastyCopyConnectExtraCombatLoop.status, 'proven');
assert.ok(proofByFamily(hastyCopyConnectExtraCombatLoop, 'hasty-copy→connect-extra-combat-loop'));

const tappedArtifactHastyCopyConnectNearMiss = provePackage([
  card('Tapped Artifact Hasty Copy Source', 'Artifact', "{T}: Create a token that's a copy of target creature you control, except it has haste.", 5),
  card('Connect Extra Combat', 'Creature — Orc Pirate', "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase. This creature can't attack a player it has already attacked this turn.", 5),
]);
assert.notEqual(tappedArtifactHastyCopyConnectNearMiss.status, 'proven');
assert.equal(proofByFamily(tappedArtifactHastyCopyConnectNearMiss, 'hasty-copy→connect-extra-combat-loop'), undefined);

const restrictedConnectExtraCombatNearMiss = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('Restricted Connect Extra Combat', 'Creature — Noble', 'Whenever this creature deals combat damage to a player, untap all lands you control. After this phase, there is an additional combat phase. Only land creatures can attack during that combat phase.', 5),
]);
assert.notEqual(restrictedConnectExtraCombatNearMiss.status, 'proven');

const tappedAndAttackingCopyNearMiss = provePackage([
  card('Tapped Attacking Copy Source', 'Artifact — Equipment', "Whenever equipped creature attacks, create a token that's a copy of equipped creature tapped and attacking. Exile it at end of combat. Equip {4}", 4),
  card('Connect Extra Combat', 'Creature — Orc Pirate', "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase. This creature can't attack a player it has already attacked this turn.", 5),
]);
assert.notEqual(tappedAndAttackingCopyNearMiss.status, 'proven');

const extraTurnCannotAttackNearMiss = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('Extra Turn Cannot Attack', 'Legendary Creature — Sphinx', "Flying Whenever Extra Turn Cannot Attack deals combat damage to a player, take an extra turn after this one. Extra Turn Cannot Attack can't attack during extra turns.", 6),
]);
assert.notEqual(extraTurnCannotAttackNearMiss.status, 'proven');

const combatCopyConnectExtraTurnLoop = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('Connect Extra Turn', 'Creature — Sphinx', 'Flying. Whenever this creature deals combat damage to a player, take an extra turn after this one.', 6),
]);
assert.equal(combatCopyConnectExtraTurnLoop.status, 'proven');
const combatCopyConnectExtraTurnProof = proofByFamily(combatCopyConnectExtraTurnLoop, 'combat-copy-token→connect-extra-turn-loop');
assert.ok(combatCopyConnectExtraTurnProof);
assert.ok(combatCopyConnectExtraTurnProof.proof.requiredFacts.some(fact => fact.predicate === 'extra-turn-repeatable-with-fresh-token'));
assert.ok(combatCopyConnectExtraTurnProof.proof.requiredFacts.some(fact => fact.predicate === 'combat-damage-connects'));

const hastyCopyConnectExtraTurnLoop = provePackage([
  card('Hasty Copy Source', 'Legendary Creature — Goblin Shaman', "Haste. {T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.", 5),
  card('Connect Extra Turn', 'Creature — Sphinx', 'Flying. Whenever this creature deals combat damage to a player, take an extra turn after this one.', 6),
]);
assert.equal(hastyCopyConnectExtraTurnLoop.status, 'proven');
assert.ok(proofByFamily(hastyCopyConnectExtraTurnLoop, 'hasty-copy→connect-extra-turn-loop'));

const combatCopyAttackExtraTurnLoop = provePackage([
  card('Generic Precombat Copy Source', 'Enchantment', "At the beginning of combat on your turn, create a token that's a copy of target creature you control. That token gains haste.", 4),
  card('Attack Extra Turn', 'Creature — Human Warrior', 'Whenever this creature attacks, take an extra turn after this one.', 4),
]);
assert.equal(combatCopyAttackExtraTurnLoop.status, 'proven');
assert.ok(proofByFamily(combatCopyAttackExtraTurnLoop, 'combat-copy-token→attack-extra-turn-loop'));

const precombatCopyLegendaryDfcAttackExtraTurnNearMiss = provePackage([
  card('Generic Precombat Copy Source', 'Enchantment', "At the beginning of combat on your turn, create a token that's a copy of target creature you control. That token gains haste.", 4),
  {
    name: 'Legendary Attack Extra Turn // Nonlegendary Creature',
    layout: 'modal_dfc',
    type_line: 'Legendary Creature // Creature',
    cmc: 4,
    card_faces: [
      {
        name: 'Legendary Attack Extra Turn',
        type_line: 'Legendary Creature — Human Warrior',
        oracle_text: 'Whenever this creature attacks, take an extra turn after this one.',
      },
      {
        name: 'Nonlegendary Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain nonlegendary creature face.',
      },
    ],
  },
]);
assert.notEqual(precombatCopyLegendaryDfcAttackExtraTurnNearMiss.status, 'proven');
assert.equal(proofByFamily(precombatCopyLegendaryDfcAttackExtraTurnNearMiss, 'combat-copy-token→attack-extra-turn-loop'), undefined);
assert.ok(precombatCopyLegendaryDfcAttackExtraTurnNearMiss.rejections.some(rejection => /legend|copy|target|surviv/i.test(rejection.reason)));

const optionalSacrificeExtraTurnNearMiss = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('Optional Sacrifice Extra Turn', 'Creature — Merfolk Wizard', 'Whenever this creature deals combat damage to a player, you may sacrifice a Merfolk. If you do, take an extra turn after this one.', 4),
]);
assert.notEqual(optionalSacrificeExtraTurnNearMiss.status, 'proven');

const spellCopyLoop = provePackage([
  card('ETB Spell Copier', 'Creature — Human Wizard', 'Flash When this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy.', 3),
  card('Hasty Creature Copy Spell', 'Sorcery', "Choose target creature you control. Create a token that's a copy of that creature, except it has haste. Exile it at the beginning of the next end step.", 2),
]);
assert.equal(spellCopyLoop.status, 'proven');
assert.ok(proofByFamily(spellCopyLoop, 'spell-copy-etb→creature-copy-spell-loop'));

const deathCopySpellEtbCopyLoop = provePackage([
  card('ETB Spell Copier', 'Creature — Human Wizard', 'Flash When this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy.', 3),
  card('Death-Copy Creature Spell', 'Instant', 'Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature.', 3),
]);
assert.equal(deathCopySpellEtbCopyLoop.status, 'proven');
assert.ok(proofByFamily(deathCopySpellEtbCopyLoop, 'death-copy-spell-etb-copy-loop'));

const deathCopyLegendaryNearMiss = provePackage([
  card('Legendary ETB Spell Copier', 'Legendary Creature — Human Wizard', 'When this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy.', 3),
  card('Death-Copy Creature Spell', 'Instant', 'Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature.', 3),
]);
assert.equal(deathCopyLegendaryNearMiss.status, 'not-repeatable');
assert.ok(deathCopyLegendaryNearMiss.rejections.some(rejection => /nonlegendary/.test(rejection.reason)));

const spellCopyArtifactNearMiss = provePackage([
  card('Artifact ETB Spell Copier', 'Artifact', 'When this artifact enters, copy target instant or sorcery spell. You may choose new targets for the copy.', 3),
  card('Hasty Creature Copy Spell', 'Sorcery', "Choose target creature you control. Create a token that's a copy of that creature, except it has haste. Exile it at the beginning of the next end step.", 2),
]);
assert.equal(spellCopyArtifactNearMiss.status, 'not-repeatable');
assert.ok(spellCopyArtifactNearMiss.rejections.some(rejection => /cannot target/.test(rejection.reason)));

const spellCopyLegendaryNearMiss = provePackage([
  card('Legendary ETB Spell Copier', 'Legendary Creature — Human Wizard', 'When this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy.', 3),
  card('Broad Hasty Creature Copy Spell', 'Sorcery', "Create a token that's a copy of target creature, except it has haste. Exile it at the beginning of the next end step.", 2),
]);
assert.equal(spellCopyLegendaryNearMiss.status, 'not-repeatable');
assert.ok(spellCopyLegendaryNearMiss.rejections.some(rejection => /cannot target/.test(rejection.reason)));

const spellCopyDfcFaceMismatch = provePackage([
  {
    name: 'Artifact Spell Copier // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 3,
    card_faces: [
      {
        name: 'Artifact Spell Copier',
        type_line: 'Artifact',
        oracle_text: 'When this artifact enters, copy target instant or sorcery spell. You may choose new targets for the copy.',
      },
      {
        name: 'Vanilla Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain creature face with no triggered abilities.',
      },
    ],
  },
  card('Hasty Creature Copy Spell', 'Sorcery', "Choose target creature you control. Create a token that's a copy of that creature, except it has haste. Exile it at the beginning of the next end step.", 2),
]);
assert.equal(spellCopyDfcFaceMismatch.status, 'not-repeatable');
assert.ok(spellCopyDfcFaceMismatch.rejections.some(rejection => /cannot target|mutually exclusive faces/.test(rejection.reason)));

const millLifeLossLoop = provePackage([
  card('Mill To Life Loss Payoff', 'Enchantment', "Whenever a card is put into an opponent's graveyard from anywhere, that player loses 1 life and you gain 1 life.", 1),
  card('Life Loss To Mill Payoff', 'Enchantment', 'Whenever an opponent loses life, that player mills that many cards.', 3),
]);
assert.equal(millLifeLossLoop.status, 'proven');
assert.ok(proofByFamily(millLifeLossLoop, 'mill-lifeloss-feedback-loop'));
assert.ok(proofByFamily(millLifeLossLoop, 'mill-lifeloss-feedback-loop').positiveDeltas.some(delta => delta.resource === 'mill'));

const oneWayMillLifeLoss = provePackage([
  card('Mill To Life Loss Payoff', 'Enchantment', "Whenever a card is put into an opponent's graveyard from anywhere, that player loses 1 life and you gain 1 life.", 1),
]);
assert.equal(oneWayMillLifeLoss.status, 'not-repeatable');
assert.ok(oneWayMillLifeLoss.rejections.some(rejection => /one-way/.test(rejection.reason)));

const opponentDrawPunisherWin = provePackage([
  card('Opponent Half-Library Draw', 'Sorcery', 'Target opponent draws cards equal to half the number of cards in their library, rounded up.', 7),
  card('Opponent Draw Punisher', 'Enchantment', 'Whenever an opponent draws a card, that player loses 1 life.', 3),
]);
assert.equal(opponentDrawPunisherWin.status, 'proven');
assert.ok(proofByFamily(opponentDrawPunisherWin, 'opponent-draw-punisher-win'));
assert.equal(proofByFamily(opponentDrawPunisherWin, 'opponent-draw-punisher-win').proof.repeatability.status, 'non-loop-win');

const compoundOpponentDrawPunisherWin = provePackage([
  card('Opponent Half-Library Draw', 'Sorcery', 'Target opponent draws cards equal to half the number of cards in their library, rounded up.', 7),
  card('Compound Opponent Draw Punisher', 'Creature', 'When this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target.', 2),
]);
assert.equal(compoundOpponentDrawPunisherWin.status, 'proven');
assert.ok(proofByFamily(compoundOpponentDrawPunisherWin, 'opponent-draw-punisher-win'));

const opponentDrawPunisherNearMiss = provePackage([
  card('Small Opponent Draw', 'Sorcery', 'Target opponent draws a card.', 1),
  card('Opponent Draw Punisher', 'Enchantment', 'Whenever an opponent draws a card, that player loses 1 life.', 3),
]);
assert.equal(opponentDrawPunisherNearMiss.status, 'not-repeatable');
assert.ok(opponentDrawPunisherNearMiss.rejections.some(rejection => /not large enough/.test(rejection.reason)));

const millMultiplierFinisher = provePackage([
  card('Half-Library Mill', 'Sorcery', 'Target player mills half their library, rounded up.', 5),
  card('Mill Multiplier', 'Enchantment', 'If an opponent would mill one or more cards, that player mills twice that many cards instead.', 3),
]);
assert.equal(millMultiplierFinisher.status, 'proven');
assert.ok(proofByFamily(millMultiplierFinisher, 'mill-multiplier-finite-mill'));
assert.equal(proofByFamily(millMultiplierFinisher, 'mill-multiplier-finite-mill').proof.repeatability.status, 'non-loop-threshold');

const delayedMillEqualizerFinisher = provePackage([
  card('Half-Library Mill', 'Sorcery', 'Target player mills half their library, rounded up.', 5),
  card('Delayed Mill Equalizer', 'Enchantment — Aura Curse', "Enchant player At the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.", 3),
]);
assert.equal(delayedMillEqualizerFinisher.status, 'proven');
assert.ok(proofByFamily(delayedMillEqualizerFinisher, 'delayed-mill-equalizer-finite-mill'));
assert.equal(proofByFamily(delayedMillEqualizerFinisher, 'delayed-mill-equalizer-finite-mill').proof.repeatability.status, 'non-loop-threshold');

const smallMillMultiplierNearMiss = provePackage([
  card('Small Mill', 'Sorcery', 'Target player mills three cards.', 2),
  card('Mill Multiplier', 'Enchantment', 'If an opponent would mill one or more cards, that player mills twice that many cards instead.', 3),
]);
assert.equal(smallMillMultiplierNearMiss.status, 'not-repeatable');
assert.ok(smallMillMultiplierNearMiss.rejections.some(rejection => /half-library/.test(rejection.reason)));

const smallDelayedMillNearMiss = provePackage([
  card('Small Mill', 'Sorcery', 'Target player mills three cards.', 2),
  card('Delayed Mill Equalizer', 'Enchantment — Aura Curse', "Enchant player At the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.", 3),
]);
assert.equal(smallDelayedMillNearMiss.status, 'not-repeatable');
assert.ok(smallDelayedMillNearMiss.rejections.some(rejection => /half-library/.test(rejection.reason)));

const mutualEtbBlinkLoop = provePackage([
  card('ETB Creature Blinker', 'Creature — Angel', 'Flying When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.', 5),
  card('ETB Permanent Blinker', 'Creature — Cat Beast', 'When this creature enters the battlefield, exile another target permanent you control, then return that card to the battlefield under its owner’s control.', 4),
]);
assert.equal(mutualEtbBlinkLoop.status, 'proven');
assert.ok(proofByFamily(mutualEtbBlinkLoop, 'mutual-etb-blink-reset-loop'));

const mutualEtbBlinkNearMiss = provePackage([
  card('ETB Creature Blinker', 'Creature — Angel', 'Flying When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.', 5),
  card('ETB Artifact Blinker', 'Artifact', 'When this artifact enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.', 4),
]);
assert.equal(mutualEtbBlinkNearMiss.status, 'not-repeatable');
assert.ok(mutualEtbBlinkNearMiss.rejections.some(rejection => /target scopes/.test(rejection.reason)));

const mutualEtbBlinkDfcFaceMismatch = provePackage([
  card('ETB Creature Blinker', 'Creature — Angel', 'Flying When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.', 5),
  {
    name: 'Artifact Blinker // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 4,
    card_faces: [
      {
        name: 'Artifact Blinker',
        type_line: 'Artifact',
        oracle_text: 'When this artifact enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.',
      },
      {
        name: 'Vanilla Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain creature face with no triggered abilities.',
      },
    ],
  },
]);
assert.equal(mutualEtbBlinkDfcFaceMismatch.status, 'not-repeatable');
assert.ok(mutualEtbBlinkDfcFaceMismatch.rejections.some(rejection => /target scopes|mutually exclusive faces/.test(rejection.reason)));

const tokenReplacementSacrificeLoop = provePackage([
  card('Creature-Token Replacement Outlet', 'Legendary Creature — Squirrel Warrior', 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.', 3),
  card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
]);
assert.equal(tokenReplacementSacrificeLoop.status, 'proven');
assert.ok(proofByFamily(tokenReplacementSacrificeLoop, 'token-replacement-sacrifice-mana-loop'));
assert.equal(proofByFamily(tokenReplacementSacrificeLoop, 'token-replacement-sacrifice-mana-loop').cards.length, 2);

const tokenReplacementNoOutlet = provePackage([
  card('Creature-Token Replacement Only', 'Enchantment', 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.', 3),
  card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
]);
assert.equal(tokenReplacementNoOutlet.status, 'not-repeatable');
assert.ok(tokenReplacementNoOutlet.rejections.some(rejection => /sacrifice outlet/.test(rejection.reason)));

const replacementOnlyCreatureTokens = provePackage([
  card('Replacement-Only Creature Token Modifier', 'Enchantment', 'If one or more creature tokens would be created under your control, that many 4/4 white Angel creature tokens with flying and vigilance are created instead.', 5),
  card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
  card('Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add one mana of any color.', 3),
]);
assert.notEqual(replacementOnlyCreatureTokens.status, 'proven');
assert.equal(proofByFamily(replacementOnlyCreatureTokens, 'token-replacement-sacrifice-mana-loop'), undefined);

const topLoop = provePackage([
  card('Self Top Draw Artifact', 'Artifact', '{1}: Draw a card, then put this artifact on top of its owner’s library.', 1),
  card('Artifact Spell Reducer', 'Artifact Creature — Vedalken Artificer', 'Artifact spells you cast cost {1} less to cast.', 2),
  card('Artifact Top Caster', 'Artifact', 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.', 4),
]);
assert.equal(topLoop.status, 'proven');
assert.ok(proofByFamily(topLoop, 'artifact-top-cost-reduction-loop'));
assert.ok(topLoop.hyperedges.some(edge => edge.family === 'artifact-top-cost-reduction-loop'));

const topLoopVariant = provePackage([
  card('Self Top Draw Artifact', 'Artifact', '{1}: Draw a card, then put this artifact on top of its owner’s library.', 1),
  card('Historic Spell Reducer', 'Artifact Creature — Construct', 'Historic spells you cast cost {1} less to cast.', 2),
  card('Flexible Artifact Top Caster', 'Artifact', 'You may look at the top card of your library any time. You may cast artifact spells and colorless spells from the top of your library.', 4),
]);
assert.equal(topLoopVariant.status, 'proven');
assert.ok(proofByFamily(topLoopVariant, 'artifact-top-cost-reduction-loop'));

const recursiveSacLoop = provePackage([
  card('Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard.', 1, '{B}'),
  card('Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add one mana of any color.', 3),
]);
assert.equal(recursiveSacLoop.status, 'proven');
const recursiveProof = proofByFamily(recursiveSacLoop, 'recursive-body-sacrifice-mana-loop');
assert.ok(recursiveProof);
assert.ok(recursiveProof.positiveDeltas.some(delta => delta.resource === 'casts'));

const routingSlipRecursiveDeathManaLoop = provePackage([
  card('Typed Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 1, '{B}'),
  card('Free Creature Sac Outlet', 'Creature — Vampire Wizard', 'Sacrifice a creature: Scry 1.', 1),
  card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
]);
assert.equal(routingSlipRecursiveDeathManaLoop.status, 'proven');
const routingSlipRecursiveProof = proofByFamily(routingSlipRecursiveDeathManaLoop, 'recursive-body-sacrifice-mana-loop');
assert.ok(routingSlipRecursiveProof);
assert.equal(routingSlipRecursiveProof.proof.understanding.kind, 'strict-proof');
assert.ok(routingSlipRecursiveProof.proof.understanding.requiredLegality.some(item => item.predicate === 'bounded-search'));
assert.ok(routingSlipRecursiveProof.positiveDeltas.some(delta => delta.resource === 'casts'));
assert.ok(routingSlipRecursiveProof.positiveDeltas.some(delta => delta.resource === 'sacrifices'));

const routingSlipRecursiveInsufficientMana = provePackage([
  card('Expensive Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 2, '{1}{B}'),
  card('Free Creature Sac Outlet', 'Creature — Vampire Wizard', 'Sacrifice a creature: Scry 1.', 1),
  card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
]);
assert.notEqual(routingSlipRecursiveInsufficientMana.status, 'proven');
assert.equal(proofByFamily(routingSlipRecursiveInsufficientMana, 'recursive-body-sacrifice-mana-loop'), undefined);

const exileRecastCreatureManaLoop = provePackage([
  card('Recursive Exile Creature', 'Creature — Elemental', 'You may cast this card from exile.', 3, '{2}{R}'),
  card('Creature-Only Exile Mana Outlet', 'Enchantment', "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.", 3),
]);
assert.equal(exileRecastCreatureManaLoop.status, 'proven');
assert.ok(proofByFamily(exileRecastCreatureManaLoop, 'exile-recast-creature-mana-loop'));
assert.ok(proofByFamily(exileRecastCreatureManaLoop, 'exile-recast-creature-mana-loop').positiveDeltas.some(delta => delta.resource === 'mana'));

const originBoundExileNearMiss = provePackage([
  card('Conditional Exile Creature', 'Creature — Elemental', 'You may cast this card from exile if it was foretold.', 3, '{2}{R}'),
  card('Creature-Only Exile Mana Outlet', 'Enchantment', "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.", 3),
]);
assert.notEqual(originBoundExileNearMiss.status, 'proven');
assert.equal(proofByFamily(originBoundExileNearMiss, 'exile-recast-creature-mana-loop'), undefined);

const lifePaidTreasureRecursiveDrainLoop = provePackage([
  card('Typed Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 1, '{B}'),
  card('Life-Paid Treasure Outlet', 'Creature — Zombie Advisor', 'Pay 1 life, Sacrifice another creature: Create a Treasure token.', 2),
  card('Death Drain Payoff', 'Creature — Vampire', 'Whenever another creature you control dies, target player loses 1 life and you gain 1 life.', 2),
]);
assert.equal(lifePaidTreasureRecursiveDrainLoop.status, 'proven');
const lifePaidTreasureProof = proofByFamily(lifePaidTreasureRecursiveDrainLoop, 'life-paid-treasure-recursive-drain-loop');
assert.ok(lifePaidTreasureProof);
assert.ok(lifePaidTreasureProof.positiveDeltas.some(delta => delta.resource === 'casts'));
assert.ok(lifePaidTreasureProof.positiveDeltas.some(delta => delta.resource === 'opponentLife'));
assert.ok(!lifePaidTreasureProof.positiveDeltas.some(delta => delta.resource === 'life'));

const lifePaidTreasureNoDrain = provePackage([
  card('Typed Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 1, '{B}'),
  card('Life-Paid Treasure Outlet', 'Creature — Zombie Advisor', 'Pay 1 life, Sacrifice another creature: Create a Treasure token.', 2),
]);
assert.notEqual(lifePaidTreasureNoDrain.status, 'proven');
assert.equal(proofByFamily(lifePaidTreasureNoDrain, 'life-paid-treasure-recursive-drain-loop'), undefined);

const multiLifePaidTreasure = provePackage([
  card('Typed Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 1, '{B}'),
  card('Multi-Life Treasure Outlet', 'Creature — Zombie Advisor', 'Pay 2 life, Sacrifice another creature: Create a Treasure token.', 2),
  card('Death Drain Payoff', 'Creature — Vampire', 'Whenever another creature you control dies, target player loses 1 life and you gain 1 life.', 2),
]);
assert.notEqual(multiLifePaidTreasure.status, 'proven');
assert.equal(proofByFamily(multiLifePaidTreasure, 'life-paid-treasure-recursive-drain-loop'), undefined);
assert.ok(multiLifePaidTreasure.rejections.some(rejection => /multi-life outlet cost/.test(rejection.reason)));

const lifePaidTreasureTypeMissing = provePackage([
  card('Typed Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 1, '{B}'),
  card('Life-Paid Treasure Outlet', 'Creature — Human Advisor', 'Pay 1 life, Sacrifice another creature: Create a Treasure token.', 2),
  card('Death Drain Payoff', 'Creature — Vampire', 'Whenever another creature you control dies, target player loses 1 life and you gain 1 life.', 2),
]);
assert.notEqual(lifePaidTreasureTypeMissing.status, 'proven');
assert.ok(lifePaidTreasureTypeMissing.rejections.some(rejection => /controlled zombie/.test(rejection.reason)));

const conditionalRecursiveNearMiss = provePackage([
  card('Conditional Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control another creature.', 1, '{B}'),
  card('Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add one mana of any color.', 3),
]);
assert.equal(conditionalRecursiveNearMiss.status, 'not-repeatable');
assert.ok(conditionalRecursiveNearMiss.rejections.some(rejection => /requires another creature/.test(rejection.reason)));

const conditionalRecursiveWithCreatureOutlet = provePackage([
  card('Conditional Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control another creature.', 1, '{B}'),
  card('Creature Mana Sac Outlet', 'Creature — Cleric', 'Sacrifice a creature: Add one mana of any color.', 3),
]);
assert.equal(conditionalRecursiveWithCreatureOutlet.status, 'proven');
assert.ok(proofByFamily(conditionalRecursiveWithCreatureOutlet, 'recursive-body-sacrifice-mana-loop'));

const conditionalRecursiveWithDfcOutlet = provePackage([
  card('Conditional Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control another creature.', 1, '{B}'),
  {
    name: 'Artifact Outlet // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 3,
    card_faces: [
      {
        name: 'Artifact Outlet',
        type_line: 'Artifact',
        oracle_text: 'Sacrifice a creature: Add one mana of any color.',
      },
      {
        name: 'Vanilla Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain creature face with no sacrifice ability.',
      },
    ],
  },
]);
assert.equal(conditionalRecursiveWithDfcOutlet.status, 'not-repeatable');
assert.ok(conditionalRecursiveWithDfcOutlet.rejections.some(rejection => /requires another creature|mutually exclusive faces|required facts/.test(rejection.reason)));

const conditionalRecursiveWithDfcOutletAndSeparateSupport = provePackage([
  card('Conditional Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control another creature.', 1, '{B}'),
  {
    name: 'Artifact Outlet // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 3,
    card_faces: [
      {
        name: 'Artifact Outlet',
        type_line: 'Artifact',
        oracle_text: 'Sacrifice a creature: Add one mana of any color.',
      },
      {
        name: 'Vanilla Creature',
        type_line: 'Creature — Human',
        oracle_text: 'A plain creature face with no sacrifice ability.',
      },
    ],
  },
  card('Separate Creature Support', 'Creature — Human', 'A separate creature permanent that remains on the battlefield.', 2),
]);
assert.equal(conditionalRecursiveWithDfcOutletAndSeparateSupport.status, 'proven');
assert.ok(proofByFamily(conditionalRecursiveWithDfcOutletAndSeparateSupport, 'recursive-body-sacrifice-mana-loop'));
assert.ok(
  proofByFamily(conditionalRecursiveWithDfcOutletAndSeparateSupport, 'recursive-body-sacrifice-mana-loop')
    .proof.requiredFacts.some(f => f.card === 'Separate Creature Support' && f.predicate === 'is-creature-permanent'),
  'separate creature support should satisfy the another-creature precondition instead of the incompatible DFC outlet face',
);

const recursiveSacNearMiss = provePackage([
  card('Expensive Recursive Body', 'Creature — Skeleton', 'You may cast this card from your graveyard.', 3),
  card('Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add one mana of any color.', 3),
]);
assert.equal(recursiveSacNearMiss.status, 'not-repeatable');
assert.ok(recursiveSacNearMiss.rejections.some(rejection => /cannot cover recursive body cost/.test(rejection.reason)));

const coloredRecursiveSacNearMiss = provePackage([
  card('Colored Recursive Body', 'Creature — Skeleton', '{1}{B}: Return this creature from your graveyard to the battlefield.', 2),
  card('Colorless Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add {C}{C}.', 3),
]);
assert.equal(coloredRecursiveSacNearMiss.status, 'not-repeatable');
assert.ok(coloredRecursiveSacNearMiss.rejections.some(rejection => /cannot cover recursive body cost/.test(rejection.reason)));

const coloredRecursiveCastNearMiss = provePackage([
  card('Black Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard.', 1, '{B}'),
  card('Colorless One Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add {C}.', 1),
]);
assert.equal(coloredRecursiveCastNearMiss.status, 'not-repeatable');
assert.ok(coloredRecursiveCastNearMiss.rejections.some(rejection => /cannot cover recursive body cost/.test(rejection.reason)));

const layeredRecursiveSacLoop = provePackage([
  card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
  card('Colorless Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add {C}{C}.', 3),
  card('Colored Recursive Body', 'Creature — Skeleton', '{1}{B}: Return this creature from your graveyard to the battlefield.', 2),
]);
assert.equal(layeredRecursiveSacLoop.status, 'proven');
assert.ok(proofByFamily(layeredRecursiveSacLoop, 'recursive-body-sacrifice-mana-loop'));
assert.equal(proofByFamily(layeredRecursiveSacLoop, 'recursive-body-sacrifice-mana-loop').cards.length, 3);

const aristocratsNearMiss = provePackage([
  card('Free Body', 'Creature', 'When this creature dies, draw a card.', 1),
  card('Sac Outlet', 'Creature', 'Sacrifice a creature: Add {C}.', 1),
  card('Death Payoff', 'Creature', 'Whenever another creature dies, each opponent loses 1 life.', 2),
]);
assert.equal(aristocratsNearMiss.status, 'not-repeatable');
assert.ok(aristocratsNearMiss.rejections.some(rejection => /not replenished/.test(rejection.reason)));

const aristocratsDrainLoop = provePackage([
  card('Token Body', 'Creature', 'When this creature enters, create a 1/1 white Soldier creature token.', 2),
  card('Sac Outlet', 'Creature', 'Sacrifice a creature: Scry 1.', 1),
  card('Death Drain Payoff', 'Creature', 'Whenever another creature you control dies, each opponent loses 1 life and you gain 1 life.', 2),
]);
assert.equal(aristocratsDrainLoop.status, 'proven');
assert.ok(proofByFamily(aristocratsDrainLoop, 'aristocrats-body-outlet-payoff'));
assert.ok(proofByFamily(aristocratsDrainLoop, 'aristocrats-body-outlet-payoff').positiveDeltas.some(delta => delta.resource === 'life'));
assert.ok(proofByFamily(aristocratsDrainLoop, 'aristocrats-body-outlet-payoff').positiveDeltas.some(delta => delta.resource === 'opponentLife'));

const tokenEngine = provePackage([
  card('Token Source', 'Creature', 'When this creature enters, create a 1/1 white Soldier creature token.', 2),
  card('Token Doubler', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', 4),
  card('Token Payoff', 'Creature', 'Whenever one or more tokens you control enter, draw a card.', 3),
]);
assert.equal(tokenEngine.status, 'proven');
assert.ok(proofByFamily(tokenEngine, 'token-source-modifier-payoff'));
assert.ok(tokenEngine.state.flags.replacementModifiers.includes('is-token-doubler'));

const forcedOriginCastLock = provePackage([
  card('Forced Exile Cast Engine', 'Artifact', 'Whenever a player casts a spell from their hand, that player exiles it. If the player does, they may cast a spell from among other cards exiled with this artifact without paying its mana cost.', 6),
  card('Nonhand Cast Lockpiece', 'Creature — Human Wizard', "Your opponents can't cast spells from anywhere other than their hands.", 2),
]);
assert.equal(forcedOriginCastLock.status, 'proven');
assert.ok(proofByFamily(forcedOriginCastLock, 'forced-cast→cast-lock'));

const forcedSpellCountLock = provePackage([
  card('Forced Exile Cast Engine', 'Artifact', 'Whenever a player casts a spell from their hand, that player exiles it. If the player does, they may cast a spell from among other cards exiled with this artifact without paying its mana cost.', 6),
  card('Spell Count Lockpiece', 'Enchantment', "Each player can't cast more than one spell each turn.", 3),
]);
assert.equal(forcedSpellCountLock.status, 'proven');
assert.ok(proofByFamily(forcedSpellCountLock, 'forced-cast→cast-lock'));

const forcedTimingLock = provePackage([
  card('Forced Draw Replacement Cast Engine', 'Artifact', "Players can't draw cards. At the beginning of each player's draw step, that player exiles the top card of their library. If it's a land card, the player puts it onto the battlefield. Otherwise, the player casts it without paying its mana cost if able.", 5),
  card('Sorcery Timing Lockpiece', 'Legendary Planeswalker', 'Each opponent can cast spells only any time they could cast a sorcery.', 3),
]);
assert.equal(forcedTimingLock.status, 'proven');
assert.ok(proofByFamily(forcedTimingLock, 'forced-cast→cast-lock'));

const forcedFreeCastLock = provePackage([
  card('Forced Draw Replacement Cast Engine', 'Artifact', "Players can't draw cards. At the beginning of each player's draw step, that player exiles the top card of their library. If it's a land card, the player puts it onto the battlefield. Otherwise, the player casts it without paying its mana cost if able.", 5),
  card('Free Cast Counter Lockpiece', 'Artifact', 'Whenever a player casts a spell, if no mana was spent to cast it, counter that spell.', 1),
]);
assert.equal(forcedFreeCastLock.status, 'proven');
assert.ok(proofByFamily(forcedFreeCastLock, 'forced-cast→cast-lock'));

const forcedOpponentFreeCastLock = provePackage([
  card('Forced Exile Cast Engine', 'Artifact', 'Whenever a player casts a spell from their hand, that player exiles it. If the player does, they may cast a spell from among other cards exiled with this artifact without paying its mana cost.', 6),
  card('Opponent Free Cast Counter Lockpiece', 'Creature — Human Soldier', 'Whenever an opponent casts a spell, if no mana was spent to cast it, counter that spell.', 2),
]);
assert.equal(forcedOpponentFreeCastLock.status, 'proven');
assert.ok(proofByFamily(forcedOpponentFreeCastLock, 'forced-cast→cast-lock'));

const forcedNoncreatureOnlyNearMiss = provePackage([
  card('Forced Draw Replacement Cast Engine', 'Artifact', "Players can't draw cards. At the beginning of each player's draw step, that player exiles the top card of their library. If it's a land card, the player puts it onto the battlefield. Otherwise, the player casts it without paying its mana cost if able.", 5),
  card('Noncreature Exile Lockpiece', 'Artifact Creature — Phyrexian Golem', "Players can't cast noncreature spells from graveyards or exile.", 2),
]);
assert.equal(forcedNoncreatureOnlyNearMiss.status, 'not-repeatable');
assert.ok(forcedNoncreatureOnlyNearMiss.rejections.some(rejection => /strict origin, timing, spell-count, or free-cast lock axis/.test(rejection.reason)));

const counterSuppressionPreventionLock = provePackage([
  card('Counter Suppression Static', 'Enchantment', "Players can't get counters. Counters can't be put on artifacts, creatures, enchantments, or lands.", 3),
  card('Counter Burden Prevention Shield', 'Enchantment', 'If a source would deal damage to you, prevent that damage and put an incarnation counter on this enchantment. When there are nine or more incarnation counters on this enchantment, exile it.', 3),
]);
assert.equal(counterSuppressionPreventionLock.status, 'proven');
assert.ok(proofByFamily(counterSuppressionPreventionLock, 'counter-suppression→prevention-lock'));

const counterSuppressionDelayedShieldLock = provePackage([
  card('Counter Suppression Static', 'Enchantment', "Players can't get counters. Counters can't be put on artifacts, creatures, enchantments, or lands.", 3),
  card('Delayed Counter Shield', 'Enchantment', 'If damage would be dealt to you, put that many delay counters on this enchantment instead. At the beginning of your upkeep, remove all delay counters from this enchantment. For each delay counter removed this way, you lose 1 life unless you pay {1}{W}.', 4),
]);
assert.equal(counterSuppressionDelayedShieldLock.status, 'proven');
assert.ok(proofByFamily(counterSuppressionDelayedShieldLock, 'counter-suppression→prevention-lock'));

const counterSuppressionDepletionLock = provePackage([
  card('Counter Suppression Static', 'Enchantment', "Players can't get counters. Counters can't be put on artifacts, creatures, enchantments, or lands.", 3),
  card('Depletion Counterspell Lockpiece', 'Enchantment', 'Whenever an opponent casts a spell, counter that spell and put a depletion counter on this enchantment. If there are three or more depletion counters on this enchantment, sacrifice it.', 8),
]);
assert.equal(counterSuppressionDepletionLock.status, 'proven');
assert.ok(proofByFamily(counterSuppressionDepletionLock, 'counter-suppression→depletion-lock'));

const counterSuppressionPoisonLock = provePackage([
  card('Counter Suppression Static', 'Enchantment', "Players can't get counters. Counters can't be put on artifacts, creatures, enchantments, or lands.", 3),
  card('Zero Life Poison Shield', 'Enchantment', "You don't lose the game for having 0 or less life. As long as you have 0 or less life, all damage is dealt to you as though its source had infect.", 3),
]);
assert.equal(counterSuppressionPoisonLock.status, 'proven');
assert.ok(proofByFamily(counterSuppressionPoisonLock, 'counter-suppression→poison-loss-lock'));

const counterSuppressionAgeLock = provePackage([
  card('Counter Suppression Static', 'Enchantment', "Players can't get counters. Counters can't be put on artifacts, creatures, enchantments, or lands.", 3),
  card('Age Counter Prevention Source', 'Land', 'Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.) Creatures you control can\'t attack. Prevent all damage that would be dealt to you.', 0),
]);
assert.equal(counterSuppressionAgeLock.status, 'proven');
assert.ok(proofByFamily(counterSuppressionAgeLock, 'counter-suppression→cumulative-upkeep-prevention-lock'));

const faceUpUntapSkipResetLock = provePackage([
  card('Face-Up Untap Skipper', 'Creature — Elemental', 'Morph {5}{U}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.) When this creature is turned face up, each opponent skips their next untap step.', 6),
  card('Upkeep Reset Copier', 'Creature — Shapeshifter', 'As this creature enters or is turned face up, you may choose another creature on the battlefield. If you do, until this creature is turned face down, it becomes a copy of that creature, except it has "At the beginning of your upkeep, you may turn this creature face down." Morph {1}{U}', 5),
]);
assert.equal(faceUpUntapSkipResetLock.status, 'proven');
assert.ok(proofByFamily(faceUpUntapSkipResetLock, 'face-up-untap-skip→face-down-reset-lock'));

const replayablePreventionLandLock = provePackage([
  card('Replayable Prevention Land', 'Land', 'Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.) When this land enters, sacrifice a land. Creatures you control can\'t attack. Prevent all damage that would be dealt to you.', 0),
  card('Land Replay Support', 'Artifact', 'You may play lands from your graveyard.', 3),
  card('Extra Land Support', 'Enchantment', 'You may play an additional land on each of your turns.', 1),
]);
assert.equal(replayablePreventionLandLock.status, 'proven');
assert.ok(proofByFamily(replayablePreventionLandLock, 'prevention-land→graveyard-extra-land-lock'));

const drawStepHandCycleDrawLimitLock = provePackage([
  card('Draw-Step Hand Cycler', 'Artifact', "At the beginning of each player's draw step, that player puts the cards in their hand on the bottom of their library in any order, then draws that many cards.", 4),
  card('Opponent Draw Limit', 'Planeswalker', "Each opponent can't draw more than one card each turn.", 3),
]);
assert.equal(drawStepHandCycleDrawLimitLock.status, 'proven');
assert.ok(proofByFamily(drawStepHandCycleDrawLimitLock, 'draw-step-hand-cycle→draw-limit-lock'));

const noDrawSearchStepSearchLock = provePackage([
  card('No-Draw Search-Step Engine', 'Creature — Elf Wizard', "Players can't draw cards. At the beginning of each player's draw step, that player loses 3 life, searches their library for a card, puts it into their hand, then shuffles.", 3),
  card('Opponent Search Lockpiece', 'Creature — Human Rogue', "You control your opponents while they're searching their libraries. While an opponent is searching their library, they exile each card they find.", 3),
]);
assert.equal(noDrawSearchStepSearchLock.status, 'proven');
assert.ok(proofByFamily(noDrawSearchStepSearchLock, 'no-draw-search-step→search-lock'));

const noFlyingAttackFlyingRemovalLock = provePackage([
  card('No-Flying Attack All Lockpiece', 'Enchantment', "Creatures without flying can't attack.", 4),
  card('Opponent Flying Removal Support', 'Enchantment Creature — Human Wizard', "Creatures you control have flying. Creatures your opponents control lose flying and can't have or gain flying.", 6),
]);
assert.equal(noFlyingAttackFlyingRemovalLock.status, 'proven');
assert.ok(proofByFamily(noFlyingAttackFlyingRemovalLock, 'no-flying-attack→flying-removal-lock'));

const flyingOnlyAttackGroundLock = provePackage([
  card('Flyers Cant Attack You Lockpiece', 'Enchantment', "Creatures with flying can't attack you.", 8),
  card('No-Flying Attack All Lockpiece', 'Enchantment', "Creatures without flying can't attack.", 4),
]);
assert.equal(flyingOnlyAttackGroundLock.status, 'proven');
assert.ok(proofByFamily(flyingOnlyAttackGroundLock, 'flying-only-attack→ground-lock'));

const flyingIslandwalkAttackRemovalLock = provePackage([
  card('Flying Islandwalk Only Attack You Lockpiece', 'Enchantment', "If you would draw a card during your draw step, instead you may skip that draw. If you do, until your next turn, you can't be attacked except by creatures with flying and/or islandwalk.", 2),
  card('Global Flying Islandwalk Removal Support', 'World Enchantment', 'All creatures lose flying and islandwalk.', 4),
]);
assert.equal(flyingIslandwalkAttackRemovalLock.status, 'proven');
assert.ok(proofByFamily(flyingIslandwalkAttackRemovalLock, 'flying-or-islandwalk-attack→evasion-removal-lock'));

const allPermanentsArtifactActivationLock = provePackage([
  card('All-Permanents Are Artifacts Engine', 'Artifact', 'All permanents are artifacts in addition to their other types.', 6),
  card('Artifact Activation Lockpiece', 'Artifact', "Activated abilities of artifacts can't be activated.", 2),
]);
assert.equal(allPermanentsArtifactActivationLock.status, 'proven');
assert.ok(proofByFamily(allPermanentsArtifactActivationLock, 'all-permanents-artifacts→artifact-activation-lock'));

const allPermanentsOpponentArtifactActivationLock = provePackage([
  card('All-Permanents Are Artifacts Engine', 'Artifact', 'All permanents are artifacts in addition to their other types.', 6),
  card('Opponent Artifact Activation Lockpiece', 'Planeswalker', "Activated abilities of artifacts your opponents control can't be activated.", 4),
]);
assert.equal(allPermanentsOpponentArtifactActivationLock.status, 'proven');
assert.ok(proofByFamily(allPermanentsOpponentArtifactActivationLock, 'all-permanents-artifacts→artifact-activation-lock'));

const allLandsIslandUntapLock = provePackage([
  card('All-Lands Are Islands Engine', 'Creature — Leviathan', "All lands are Islands in addition to their other types. Creatures without flying or islandwalk can't attack.", 8),
  card('Island Untap Lockpiece', 'Enchantment', "Islands don't untap during their controllers' untap steps.", 3),
]);
assert.equal(allLandsIslandUntapLock.status, 'proven');
assert.ok(proofByFamily(allLandsIslandUntapLock, 'all-lands-islands→island-untap-lock'));

const allLandsIslandTapUntapLock = provePackage([
  card('All-Lands Are Islands Engine', 'Creature — Leviathan', "All lands are Islands in addition to their other types. Creatures without flying or islandwalk can't attack.", 8),
  card('Island Tap Untap Lockpiece', 'Enchantment', "When this enchantment enters, tap all Islands. Islands don't untap during their controllers' untap steps.", 3),
]);
assert.equal(allLandsIslandTapUntapLock.status, 'proven');
assert.ok(proofByFamily(allLandsIslandTapUntapLock, 'all-lands-islands→island-untap-lock'));

const nonbasicOnlyIslandNearMiss = provePackage([
  card('Nonbasic Lands Are Islands Engine', 'Creature — Merfolk Wizard', 'Nonbasic lands are Islands.', 2),
  card('Island Untap Lockpiece', 'Enchantment', "Islands don't untap during their controllers' untap steps.", 3),
]);
assert.equal(nonbasicOnlyIslandNearMiss.status, 'no-proof');

const permanentOnlyPoisonNearMiss = provePackage([
  card('Permanent Only Counter Suppression', 'Enchantment', "Counters can't be put on artifacts, creatures, enchantments, or lands.", 3),
  card('Zero Life Poison Shield', 'Enchantment', "You don't lose the game for having 0 or less life. As long as you have 0 or less life, all damage is dealt to you as though its source had infect.", 3),
]);
assert.equal(permanentOnlyPoisonNearMiss.status, 'not-repeatable');
assert.ok(permanentOnlyPoisonNearMiss.rejections.some(rejection => /does not apply to players/.test(rejection.reason)));

const globalUntapUpkeepSkipLock = provePackage([
  card('Global Untap Skipper', 'Enchantment', "Players skip their untap steps. At the beginning of your upkeep, sacrifice this enchantment unless you pay {U}.", 2),
  card('Global Upkeep Skipper', 'Artifact', 'Players skip their upkeep steps.', 5),
]);
assert.equal(globalUntapUpkeepSkipLock.status, 'proven');
assert.ok(proofByFamily(globalUntapUpkeepSkipLock, 'global-untap-skip→upkeep-skip-lock'));

const globalUntapEndStepUntapLock = provePackage([
  card('Global Untap Skipper', 'Enchantment', "Players skip their untap steps. At the beginning of your upkeep, sacrifice this enchantment unless you pay {U}.", 2),
  card('Self End Step Nonland Untapper', 'Enchantment', 'At the beginning of your end step, untap all nonland permanents you control.', 3),
]);
assert.equal(globalUntapEndStepUntapLock.status, 'proven');
assert.ok(proofByFamily(globalUntapEndStepUntapLock, 'global-untap-skip→end-step-untap-lock'));

const globalUntapUpkeepLandLock = provePackage([
  card('Global Untap Skipper', 'Enchantment', "Players skip their untap steps. At the beginning of your upkeep, sacrifice this enchantment unless you pay {U}.", 2),
  card('Upkeep Untap Mana Land', 'Land', "This land doesn't untap during your untap step. At the beginning of your upkeep, you may exile a card from your hand. If you do, untap this land. {T}: Add one mana of any color.", 0),
]);
assert.equal(globalUntapUpkeepLandLock.status, 'proven');
assert.ok(proofByFamily(globalUntapUpkeepLandLock, 'global-untap-skip→upkeep-untap-land-lock'));

const globalUntapSelfBounceLock = provePackage([
  card('Global Untap Skipper', 'Enchantment', "Players skip their untap steps. At the beginning of your upkeep, sacrifice this enchantment unless you pay {U}.", 2),
  card('Permanent Self Bounce Support', 'Creature — Vedalken Wizard', '{U}, {T}: Return target permanent you control to its owner\'s hand.', 2),
]);
assert.equal(globalUntapSelfBounceLock.status, 'proven');
assert.ok(proofByFamily(globalUntapSelfBounceLock, 'global-untap-skip→self-bounce-lock'));

const globalUntapSelfBounceTimingNearMiss = provePackage([
  card('Global Untap Skipper', 'Enchantment', "Players skip their untap steps. At the beginning of your upkeep, sacrifice this enchantment unless you pay {U}.", 2),
  card('Your-Turn-Only Self Bounce Support', 'Creature — Wizard', '{U}, {T}: Return target permanent you control to its owner\'s hand. Activate only during your turn.', 2),
]);
assert.equal(globalUntapSelfBounceTimingNearMiss.status, 'not-repeatable');
assert.ok(globalUntapSelfBounceTimingNearMiss.rejections.some(rejection => /only works during your turn/.test(rejection.reason)));

const castProtectionArtifactBounceLock = provePackage([
  card('Cast Protection Source', 'Legendary Artifact', 'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.', 4),
  card('Artifact Self Bounce Support', 'Legendary Creature — Human Advisor', '{1}{U}: Return target artifact you control to its owner\'s hand.', 2),
]);
assert.equal(castProtectionArtifactBounceLock.status, 'proven');
assert.ok(proofByFamily(castProtectionArtifactBounceLock, 'cast-protection→self-bounce-lock'));

const castProtectionPermanentBounceLock = provePackage([
  card('Cast Protection Source', 'Legendary Artifact', 'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.', 4),
  card('Permanent Self Bounce Support', 'Creature — Vedalken Wizard', '{U}, {T}: Return target permanent you control to its owner\'s hand.', 2),
]);
assert.equal(castProtectionPermanentBounceLock.status, 'proven');
assert.ok(proofByFamily(castProtectionPermanentBounceLock, 'cast-protection→self-bounce-lock'));

const castProtectionDiscardBounceLock = provePackage([
  card('Cast Protection Source', 'Legendary Artifact', 'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.', 4),
  card('Discard Self Bounce Support', 'Creature — Human Spellshaper', 'Flying {U}, {T}, Discard a card: Return target permanent you control to its owner\'s hand.', 4),
]);
assert.equal(castProtectionDiscardBounceLock.status, 'proven');
assert.ok(proofByFamily(castProtectionDiscardBounceLock, 'cast-protection→self-bounce-lock'));

const castProtectionArtifactGraveyardRecastLock = provePackage([
  card('Cast Protection Source', 'Legendary Artifact', 'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.', 4),
  card('Artifact Sac Outlet', 'Artifact', 'Sacrifice an artifact: Add {C}{C}.', 4),
  card('Graveyard Artifact Cast Support', 'Legendary Creature — Merfolk Wizard', '{T}: Choose target artifact card in your graveyard. You may cast that card this turn.', 2),
]);
assert.equal(castProtectionArtifactGraveyardRecastLock.status, 'proven');
assert.ok(proofByFamily(castProtectionArtifactGraveyardRecastLock, 'cast-protection→graveyard-recast-lock'));

const castProtectionPermanentGraveyardRecastLock = provePackage([
  card('Cast Protection Source', 'Legendary Artifact', 'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.', 4),
  card('Artifact Sac Outlet', 'Artifact', 'Sacrifice an artifact: Add {C}{C}.', 4),
  card('Graveyard Permanent Cast Support', 'Legendary Creature — Elemental Avatar', 'During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard.', 6),
]);
assert.equal(castProtectionPermanentGraveyardRecastLock.status, 'proven');
assert.ok(proofByFamily(castProtectionPermanentGraveyardRecastLock, 'cast-protection→graveyard-recast-lock'));

const castProtectionConduitStyleLock = provePackage([
  card('Cast Protection Source', 'Legendary Artifact', 'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.', 4),
  card('Artifact Sac Outlet', 'Land', '{1}, {T}, Sacrifice an artifact: You gain 1 life.', 0),
  card('Constrained Graveyard Permanent Cast Support', 'Artifact', "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn. Activate only as a sorcery.", 4),
]);
assert.equal(castProtectionConduitStyleLock.status, 'proven');
assert.ok(proofByFamily(castProtectionConduitStyleLock, 'cast-protection→graveyard-recast-lock'));

const combatGatedGraveyardRecastNearMiss = provePackage([
  card('Cast Protection Source', 'Legendary Artifact', 'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.', 4),
  card('Artifact Sac Outlet', 'Artifact Creature — Beast', 'Sacrifice an artifact: Put a +1/+1 counter on this creature.', 2),
  card('Combat Graveyard Artifact Cast Support', 'Legendary Artifact Creature — Human', 'Whenever this creature deals combat damage to a player, choose target artifact card in your graveyard. You may cast that card this turn.', 3),
]);
assert.equal(combatGatedGraveyardRecastNearMiss.status, 'not-repeatable');
assert.ok(combatGatedGraveyardRecastNearMiss.rejections.some(rejection => /without combat/.test(rejection.reason)));

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
