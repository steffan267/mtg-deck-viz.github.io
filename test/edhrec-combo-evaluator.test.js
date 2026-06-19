const assert = require('node:assert/strict');
const {
  classifyResultLabels,
  classifyResultLabelsDetailed,
  classesForEdgeFamilies,
  classesForProofDeltas,
  evaluateCombo,
  resultCoverage,
  summarizeEvaluations,
  renderMarkdown,
} = require('../analysis/edhrec-combos/evaluate-edhrec-combos');

function card(name, typeLine, oracleText, cmc = 1, mana_cost = '') {
  return { name, type_line: typeLine, oracle_text: oracleText, cmc, mana_cost, legalities: { commander: 'legal' } };
}

const idx = {
  'gain from loss': card('Gain From Loss', 'Enchantment', 'Whenever an opponent loses life, you gain that much life.', 5),
  'loss from gain': card('Loss From Gain', 'Enchantment', 'Whenever you gain life, target opponent loses that much life.', 5),
  'fixed loss from gain': card('Fixed Loss From Gain', 'Creature — Cleric', 'Whenever you gain life, each opponent loses 1 life.', 3),
  'blank rock': card('Blank Rock', 'Artifact', '{T}: Add {C}.', 2),
  'draw damage engine': card('Draw Damage Engine', 'Legendary Creature — Wizard', 'Whenever you draw a card, this creature deals 1 damage to any target.', 6),
  'damage draw aura': card('Damage Draw Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.', 1),
  'lifelink counter engine': card('Lifelink Counter Engine', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control. {1}{W}: Another target creature gains lifelink until end of turn.', 3),
  'counter damage creature': card('Counter Damage Creature', 'Artifact Creature — Construct', 'This creature enters with X +1/+1 counters on it. Remove a +1/+1 counter from this creature: It deals 1 damage to any target.', 0),
  'recursive body': card('Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard.', 1, '{B}'),
  'mana sac outlet': card('Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add one mana of any color.', 3),
  'colored recursive body': card('Colored Recursive Body', 'Creature — Skeleton', '{1}{B}: Return this creature from your graveyard to the battlefield.', 2),
  'colorless mana sac outlet': card('Colorless Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add {C}{C}.', 3),
  'death mana payoff': card('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.', 4),
  'hasty copy engine': card('Hasty Copy Engine', 'Legendary Creature — Goblin Shaman', "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.", 5),
  'permanent untapper': card('Permanent Untapper', 'Creature — Human Warrior', 'When this creature enters, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.', 5),
  'colorless mana amplifier': card('Colorless Mana Amplifier', 'Artifact', 'Whenever you tap a permanent for {C}, add an additional {C}.', 5),
  'any-type nonland mana amplifier': card('Any-Type Nonland Mana Amplifier', 'Legendary Creature — Druid', 'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.', 2),
  'break-even self untapper with colorless': card('Break-Even Self Untapper With Colorless', 'Artifact', '{T}: Add {C}{C}{C}. {3}: Untap this artifact.', 3),
  'mill to life loss payoff': card('Mill To Life Loss Payoff', 'Enchantment', "Whenever a card is put into an opponent's graveyard from anywhere, that player loses 1 life and you gain 1 life.", 1),
  'life loss to mill payoff': card('Life Loss To Mill Payoff', 'Enchantment', 'Whenever an opponent loses life, that player mills that many cards.', 3),
  'opponent half-library draw': card('Opponent Half-Library Draw', 'Sorcery', 'Target opponent draws cards equal to half the number of cards in their library, rounded up.', 7),
  'opponent draw punisher': card('Opponent Draw Punisher', 'Enchantment', 'Whenever an opponent draws a card, that player loses 1 life.', 3),
  'half-library mill': card('Half-Library Mill', 'Sorcery', 'Target player mills half their library, rounded up.', 5),
  'mill multiplier': card('Mill Multiplier', 'Enchantment', 'If an opponent would mill one or more cards, that player mills twice that many cards instead.', 3),
  'etb creature blinker': card('ETB Creature Blinker', 'Creature — Angel', 'Flying When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.', 5),
  'etb permanent blinker': card('ETB Permanent Blinker', 'Creature — Cat Beast', 'When this creature enters the battlefield, exile another target permanent you control, then return that card to the battlefield under its owner’s control.', 4),
  'creature-token replacement outlet': card('Creature-Token Replacement Outlet', 'Legendary Creature — Squirrel Warrior', 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.', 3),
  'artifact blinker // vanilla creature': {
    name: 'Artifact Blinker // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 4,
    legalities: { commander: 'legal' },
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
  'conditional recursive body': card('Conditional Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control another creature.', 1, '{B}'),
  'separate creature support': card('Separate Creature Support', 'Creature — Human', 'A separate creature permanent that remains on the battlefield.', 2),
  'aristocrats token body': card('Aristocrats Token Body', 'Creature', 'When this creature enters the battlefield, create a 1/1 white Soldier creature token.', 2),
  'free creature sac outlet': card('Free Creature Sac Outlet', 'Creature', 'Sacrifice a creature: Scry 1.', 1),
  'death drain payoff': card('Death Drain Payoff', 'Creature', 'Whenever another creature you control dies, each opponent loses 1 life and you gain 1 life.', 2),
  'typed recursive cast body': card('Typed Recursive Cast Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control a Zombie.', 1, '{B}'),
  'life-paid treasure outlet': card('Life-Paid Treasure Outlet', 'Creature — Zombie Advisor', 'Pay 1 life, Sacrifice another creature: Create a Treasure token.', 2),
  'artifact outlet // vanilla creature': {
    name: 'Artifact Outlet // Vanilla Creature',
    layout: 'modal_dfc',
    type_line: 'Artifact // Creature',
    cmc: 3,
    legalities: { commander: 'legal' },
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
};

assert.deepEqual(classifyResultLabels(['Infinite lifegain', 'Win the game', 'Exile your library']), ['empty-library', 'infinite-life', 'win']);
assert.deepEqual(classifyResultLabels(['Each opponent loses the game', 'Target player loses the game', 'Infinite self-mill', 'Infinite commander casts']), ['infinite-cast', 'mill', 'win']);
assert.deepEqual(classifyResultLabelsDetailed(['Infinite lifegain', 'Infinite LTB']), {
  classes: ['infinite-life', 'infinite-ltb'],
  unmappedLabels: [],
});
assert.deepEqual(classifyResultLabels(['Infinite landfall triggers', 'Infinite blinking', 'Infinite scry 1', 'Infinite self-discard triggers']), ['infinite-blink', 'infinite-landfall', 'infinite-scry', 'infinite-self-discard']);
assert.deepEqual(resultCoverage(['infinite-life', 'win'], ['infinite-life']).missed, ['win']);
assert.deepEqual(classesForEdgeFamilies(['sac-fodder→outlet', 'landfall', 'unknown-family']), ['infinite-death', 'infinite-etb', 'infinite-landfall', 'infinite-ltb', 'infinite-sacrifice', 'infinite-tokens']);
assert.deepEqual(classesForEdgeFamilies(['graveyard']), ['mill'], 'generic graveyard evidence must not imply self-discard without a discard edge');
assert.deepEqual(classesForEdgeFamilies(['discard']), ['infinite-self-discard']);
assert.deepEqual(classesForProofDeltas([
  { family: 'blink-etb-land-untap-loop', positiveDeltas: [{ resource: 'mana', min: 0, max: 0 }] },
]), []);
assert.deepEqual(classesForProofDeltas([
  { family: 'recursive-body-sacrifice-mana-loop', positiveDeltas: [{ resource: 'mana', min: 1, max: 1 }, { resource: 'casts', min: 1, max: Infinity }] },
]), ['infinite-cast', 'infinite-mana']);
assert.deepEqual(classesForProofDeltas([
  { family: 'aristocrats-body-outlet-payoff', positiveDeltas: [{ resource: 'mana', min: 1, max: 1 }] },
]), []);

const lifeLoop = evaluateCombo({
  id: 'life-loop',
  detailPath: '/combos/test/life-loop',
  url: 'https://example.test/life-loop',
  cards: ['Gain From Loss', 'Loss From Gain'],
  cardCount: 2,
  results: ['Infinite lifegain', 'Infinite lifeloss'],
  categories: ['test'],
  metadata: { deckCount: 10 },
}, idx);
assert.equal(lifeLoop.resolvedAll, true);
assert.equal(lifeLoop.bucket, 'proved');
assert.ok(lifeLoop.familySignals.includes('lifegain-lifeloss-loop'));
assert.equal(lifeLoop.resultCoverage.coveredAny, true);

const fixedLifeLoop = evaluateCombo({
  id: 'fixed-life-loop',
  detailPath: '/combos/test/fixed-life-loop',
  url: 'https://example.test/fixed-life-loop',
  cards: ['Gain From Loss', 'Fixed Loss From Gain'],
  cardCount: 2,
  results: ['Infinite lifegain', 'Infinite lifeloss'],
  categories: ['test'],
  metadata: { deckCount: 9 },
}, idx);
assert.equal(fixedLifeLoop.bucket, 'proved');
assert.ok(fixedLifeLoop.familySignals.includes('lifegain-lifeloss-loop'));
assert.equal(fixedLifeLoop.resultCoverage.coveredAny, true);

const drawDamageLoop = evaluateCombo({
  id: 'draw-damage-loop',
  detailPath: '/combos/test/draw-damage-loop',
  url: 'https://example.test/draw-damage-loop',
  cards: ['Draw Damage Engine', 'Damage Draw Aura'],
  cardCount: 2,
  results: ['Infinite damage', 'Infinite card draw'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(drawDamageLoop.bucket, 'proved');
assert.ok(drawDamageLoop.familySignals.includes('draw-damage-feedback-loop'));
assert.deepEqual(drawDamageLoop.proofOnlyModelClasses, ['infinite-damage', 'infinite-draw']);
assert.equal(drawDamageLoop.proofOnlyResultCoverage.coveredAny, true);
assert.deepEqual(drawDamageLoop.modelClasses, ['infinite-damage', 'infinite-draw']);
assert.equal(drawDamageLoop.resultCoverage.coveredAny, true);

const lifelinkCounterDamageLoop = evaluateCombo({
  id: 'lifelink-counter-damage-loop',
  detailPath: '/combos/test/lifelink-counter-damage-loop',
  url: 'https://example.test/lifelink-counter-damage-loop',
  cards: ['Lifelink Counter Engine', 'Counter Damage Creature'],
  cardCount: 2,
  results: ['Infinite damage', 'Infinite lifegain'],
  categories: ['test'],
  metadata: { deckCount: 8 },
}, idx);
assert.equal(lifelinkCounterDamageLoop.bucket, 'proved');
assert.ok(lifelinkCounterDamageLoop.familySignals.includes('lifelink-counter-damage-loop'));
assert.equal(lifelinkCounterDamageLoop.resultCoverage.coveredAny, true);

const recursiveSacLoop = evaluateCombo({
  id: 'recursive-sac-loop',
  detailPath: '/combos/test/recursive-sac-loop',
  url: 'https://example.test/recursive-sac-loop',
  cards: ['Recursive Body', 'Mana Sac Outlet'],
  cardCount: 2,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite storm count'],
  categories: ['test'],
  metadata: { deckCount: 7 },
}, idx);
assert.equal(recursiveSacLoop.bucket, 'proved');
assert.ok(recursiveSacLoop.familySignals.includes('recursive-body-sacrifice-mana-loop'));
assert.equal(recursiveSacLoop.proofOnlyResultCoverage.coveredAny, true);
assert.equal(recursiveSacLoop.resultCoverage.coveredAny, true);

const layeredRecursiveSacLoop = evaluateCombo({
  id: 'layered-recursive-sac-loop',
  detailPath: '/combos/test/layered-recursive-sac-loop',
  url: 'https://example.test/layered-recursive-sac-loop',
  cards: ['Colored Recursive Body', 'Colorless Mana Sac Outlet', 'Death Mana Payoff'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite ETB'],
  categories: ['test'],
  metadata: { deckCount: 6 },
}, idx);
assert.equal(layeredRecursiveSacLoop.bucket, 'proved');
assert.ok(layeredRecursiveSacLoop.proofOnlyFamilies.includes('recursive-body-sacrifice-mana-loop'));
assert.equal(layeredRecursiveSacLoop.proofOnlyResultCoverage.coveredAny, true);

const hastyCopyLoop = evaluateCombo({
  id: 'hasty-copy-loop',
  detailPath: '/combos/test/hasty-copy-loop',
  url: 'https://example.test/hasty-copy-loop',
  cards: ['Hasty Copy Engine', 'Permanent Untapper'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 5 },
}, idx);
assert.equal(hastyCopyLoop.bucket, 'proved');
assert.ok(hastyCopyLoop.familySignals.includes('hasty-copy→etb-untap-loop'));
assert.deepEqual(hastyCopyLoop.modelClasses, ['infinite-etb', 'infinite-ltb', 'infinite-tokens', 'infinite-untap']);
assert.equal(hastyCopyLoop.resultCoverage.coveredAny, false, 'hasty-copy ETB untap loops should not imply mana without mana facts');

const amplifiedSelfUntapLoop = evaluateCombo({
  id: 'amplified-self-untap-loop',
  detailPath: '/combos/test/amplified-self-untap-loop',
  url: 'https://example.test/amplified-self-untap-loop',
  cards: ['Colorless Mana Amplifier', 'Break-Even Self Untapper With Colorless'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(amplifiedSelfUntapLoop.bucket, 'proved');
assert.ok(amplifiedSelfUntapLoop.familySignals.includes('self-untap-mana-loop'));
assert.equal(amplifiedSelfUntapLoop.resultCoverage.coveredAny, true);

const anyTypeAmplifiedSelfUntapLoop = evaluateCombo({
  id: 'any-type-amplified-self-untap-loop',
  detailPath: '/combos/test/any-type-amplified-self-untap-loop',
  url: 'https://example.test/any-type-amplified-self-untap-loop',
  cards: ['Any-Type Nonland Mana Amplifier', 'Break-Even Self Untapper With Colorless'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(anyTypeAmplifiedSelfUntapLoop.bucket, 'proved');
assert.ok(anyTypeAmplifiedSelfUntapLoop.familySignals.includes('self-untap-mana-loop'));
assert.equal(anyTypeAmplifiedSelfUntapLoop.resultCoverage.coveredAny, true);

const millLifeLossLoop = evaluateCombo({
  id: 'mill-lifeloss-loop',
  detailPath: '/combos/test/mill-lifeloss-loop',
  url: 'https://example.test/mill-lifeloss-loop',
  cards: ['Mill To Life Loss Payoff', 'Life Loss To Mill Payoff'],
  cardCount: 2,
  results: ['Infinite mill', 'Infinite lifeloss', 'Infinite lifegain'],
  categories: ['test'],
  metadata: { deckCount: 4 },
}, idx);
assert.equal(millLifeLossLoop.bucket, 'proved');
assert.ok(millLifeLossLoop.familySignals.includes('mill-lifeloss-feedback-loop'));
assert.equal(millLifeLossLoop.resultCoverage.coveredAny, true);

const opponentDrawPunisherWin = evaluateCombo({
  id: 'opponent-draw-punisher-win',
  detailPath: '/combos/test/opponent-draw-punisher-win',
  url: 'https://example.test/opponent-draw-punisher-win',
  cards: ['Opponent Half-Library Draw', 'Opponent Draw Punisher'],
  cardCount: 2,
  results: ['Win the game'],
  categories: ['test'],
  metadata: { deckCount: 3 },
}, idx);
assert.equal(opponentDrawPunisherWin.bucket, 'proved');
assert.ok(opponentDrawPunisherWin.familySignals.includes('opponent-draw-punisher-win'));
assert.equal(opponentDrawPunisherWin.resultCoverage.coveredAny, true);

const millMultiplierFinisher = evaluateCombo({
  id: 'mill-multiplier-finisher',
  detailPath: '/combos/test/mill-multiplier-finisher',
  url: 'https://example.test/mill-multiplier-finisher',
  cards: ['Half-Library Mill', 'Mill Multiplier'],
  cardCount: 2,
  results: ['Mill all opponents'],
  categories: ['test'],
  metadata: { deckCount: 3 },
}, idx);
assert.equal(millMultiplierFinisher.bucket, 'proved');
assert.ok(millMultiplierFinisher.familySignals.includes('mill-multiplier-finite-mill'));
assert.equal(millMultiplierFinisher.resultCoverage.coveredAny, true);

const mutualEtbBlinkLoop = evaluateCombo({
  id: 'mutual-etb-blink-loop',
  detailPath: '/combos/test/mutual-etb-blink-loop',
  url: 'https://example.test/mutual-etb-blink-loop',
  cards: ['ETB Creature Blinker', 'ETB Permanent Blinker'],
  cardCount: 2,
  results: ['Infinite ETB triggers'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(mutualEtbBlinkLoop.bucket, 'proved');
assert.ok(mutualEtbBlinkLoop.familySignals.includes('mutual-etb-blink-reset-loop'));
assert.equal(mutualEtbBlinkLoop.resultCoverage.coveredAny, true);

const tokenReplacementSacLoop = evaluateCombo({
  id: 'token-replacement-sac-loop',
  detailPath: '/combos/test/token-replacement-sac-loop',
  url: 'https://example.test/token-replacement-sac-loop',
  cards: ['Creature-Token Replacement Outlet', 'Death Mana Payoff'],
  cardCount: 2,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite tokens'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(tokenReplacementSacLoop.bucket, 'proved');
assert.ok(tokenReplacementSacLoop.familySignals.includes('token-replacement-sacrifice-mana-loop'));
assert.equal(tokenReplacementSacLoop.resultCoverage.coveredAny, true);

const aristocratsDrainLoop = evaluateCombo({
  id: 'aristocrats-drain-loop',
  detailPath: '/combos/test/aristocrats-drain-loop',
  url: 'https://example.test/aristocrats-drain-loop',
  cards: ['Aristocrats Token Body', 'Free Creature Sac Outlet', 'Death Drain Payoff'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers', 'Infinite lifegain', 'Infinite lifeloss'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(aristocratsDrainLoop.bucket, 'proved');
assert.ok(aristocratsDrainLoop.familySignals.includes('aristocrats-body-outlet-payoff'));
assert.ok(aristocratsDrainLoop.proofDeltaClasses.includes('infinite-life'));
assert.ok(aristocratsDrainLoop.proofDeltaClasses.includes('infinite-opponent-life-loss'));
assert.equal(aristocratsDrainLoop.resultCoverage.coveredAny, true);

const lifePaidTreasureRecursiveDrainLoop = evaluateCombo({
  id: 'life-paid-treasure-recursive-drain-loop',
  detailPath: '/combos/test/life-paid-treasure-recursive-drain-loop',
  url: 'https://example.test/life-paid-treasure-recursive-drain-loop',
  cards: ['Typed Recursive Cast Body', 'Life-Paid Treasure Outlet', 'Death Drain Payoff'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite ETB', 'Infinite lifegain', 'Infinite lifeloss', 'Infinite sacrifice triggers', 'Infinite storm count'],
  categories: ['test'],
  metadata: { deckCount: 2 },
}, idx);
assert.equal(lifePaidTreasureRecursiveDrainLoop.bucket, 'proved');
assert.ok(lifePaidTreasureRecursiveDrainLoop.familySignals.includes('life-paid-treasure-recursive-drain-loop'));
assert.ok(!lifePaidTreasureRecursiveDrainLoop.proofDeltaClasses.includes('infinite-life'));
assert.equal(lifePaidTreasureRecursiveDrainLoop.resultCoverage.coveredAny, true);

const mutualEtbBlinkDfcNearMiss = evaluateCombo({
  id: 'mutual-etb-blink-dfc-near-miss',
  detailPath: '/combos/test/mutual-etb-blink-dfc-near-miss',
  url: 'https://example.test/mutual-etb-blink-dfc-near-miss',
  cards: ['ETB Creature Blinker', 'Artifact Blinker'],
  cardCount: 2,
  results: ['Infinite ETB triggers'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(mutualEtbBlinkDfcNearMiss.resolvedAll, true);
assert.ok(!mutualEtbBlinkDfcNearMiss.familySignals.includes('mutual-etb-blink-reset-loop'));
assert.ok(!mutualEtbBlinkDfcNearMiss.proofOnlyFamilies.includes('mutual-etb-blink-reset-loop'));

const recursiveDfcPreconditionNearMiss = evaluateCombo({
  id: 'recursive-dfc-precondition-near-miss',
  detailPath: '/combos/test/recursive-dfc-precondition-near-miss',
  url: 'https://example.test/recursive-dfc-precondition-near-miss',
  cards: ['Conditional Recursive Body', 'Artifact Outlet'],
  cardCount: 2,
  results: ['Infinite death triggers'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(recursiveDfcPreconditionNearMiss.resolvedAll, true);
assert.ok(!recursiveDfcPreconditionNearMiss.familySignals.includes('recursive-body-sacrifice-mana-loop'));
assert.ok(!recursiveDfcPreconditionNearMiss.proofOnlyFamilies.includes('recursive-body-sacrifice-mana-loop'));

const recursiveDfcPreconditionWithSupport = evaluateCombo({
  id: 'recursive-dfc-precondition-with-support',
  detailPath: '/combos/test/recursive-dfc-precondition-with-support',
  url: 'https://example.test/recursive-dfc-precondition-with-support',
  cards: ['Conditional Recursive Body', 'Artifact Outlet', 'Separate Creature Support'],
  cardCount: 3,
  results: ['Infinite death triggers', 'Infinite sacrifice triggers'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(recursiveDfcPreconditionWithSupport.bucket, 'proved');
assert.ok(recursiveDfcPreconditionWithSupport.familySignals.includes('recursive-body-sacrifice-mana-loop'));
assert.ok(recursiveDfcPreconditionWithSupport.proofOnlyFamilies.includes('recursive-body-sacrifice-mana-loop'));

const miss = evaluateCombo({
  id: 'miss',
  detailPath: '/combos/test/miss',
  url: 'https://example.test/miss',
  cards: ['Blank Rock', 'Missing Card'],
  cardCount: 2,
  results: ['Infinite mana'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(miss.bucket, 'missing-card');
assert.deepEqual(miss.missing, ['Missing Card']);

const unmappedOnly = evaluateCombo({
  id: 'unmapped-only',
  detailPath: '/combos/test/unmapped-only',
  url: 'https://example.test/unmapped-only',
  cards: ['Blank Rock'],
  cardCount: 1,
  results: ['Infinite LTB'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.deepEqual(unmappedOnly.expectedClasses, ['infinite-ltb']);
assert.deepEqual(unmappedOnly.unmappedLabels, []);
assert.equal(unmappedOnly.resultCoverage.coveredAny, false);

const edgeBridgedSacrificeInteraction = evaluateCombo({
  id: 'edge-bridged-sacrifice-interaction',
  detailPath: '/combos/test/edge-bridged-sacrifice-interaction',
  url: 'https://example.test/edge-bridged-sacrifice-interaction',
  cards: ['Aristocrats Token Body', 'Free Creature Sac Outlet'],
  cardCount: 2,
  results: ['Infinite sacrifice triggers', 'Infinite LTB'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(edgeBridgedSacrificeInteraction.proofStatus, 'no-proof');
assert.equal(edgeBridgedSacrificeInteraction.bucket, 'classified-not-proven');
assert.ok(edgeBridgedSacrificeInteraction.edgeSignalFamilies.includes('sac-fodder→outlet'));
assert.ok(edgeBridgedSacrificeInteraction.edgeSignalClasses.includes('infinite-sacrifice'));
assert.ok(edgeBridgedSacrificeInteraction.edgeSignalClasses.includes('infinite-ltb'));
assert.equal(edgeBridgedSacrificeInteraction.resultCoverage.coveredAny, true);

const edgeBridgeNegative = evaluateCombo({
  id: 'edge-bridge-negative',
  detailPath: '/combos/test/edge-bridge-negative',
  url: 'https://example.test/edge-bridge-negative',
  cards: ['Aristocrats Token Body', 'Free Creature Sac Outlet'],
  cardCount: 2,
  results: ['Infinite colorless mana'],
  categories: ['test'],
  metadata: { deckCount: 1 },
}, idx);
assert.equal(edgeBridgeNegative.bucket, 'classified-not-proven');
assert.ok(edgeBridgeNegative.edgeSignalFamilies.includes('sac-fodder→outlet'));
assert.equal(edgeBridgeNegative.resultCoverage.coveredAny, false, 'sacrifice edge signals must not imply unrelated mana results');

const summary = summarizeEvaluations([
  lifeLoop,
  fixedLifeLoop,
  drawDamageLoop,
  lifelinkCounterDamageLoop,
  recursiveSacLoop,
  layeredRecursiveSacLoop,
  hastyCopyLoop,
  amplifiedSelfUntapLoop,
  anyTypeAmplifiedSelfUntapLoop,
  millLifeLossLoop,
  opponentDrawPunisherWin,
  millMultiplierFinisher,
  mutualEtbBlinkLoop,
  tokenReplacementSacLoop,
  miss,
], { source: 'fixture' });
assert.equal(summary.totalDetailed, 15);
assert.equal(summary.byBucket.proved, 14);
assert.equal(summary.byBucket['missing-card'], 1);
assert.equal(summary.proofOnlyExpectedClassCoverage.considered, 15);
assert.equal(summary.proofOnlyExpectedClassCoverage.coveredAny, 13);
assert.equal(summary.proofOnlyExpectedClassCoverage.coveredAnyPct, 86.7);
const taxonomyGapSummary = summarizeEvaluations([unmappedOnly], { source: 'fixture' });
assert.equal(taxonomyGapSummary.unmappedResultLabels.combosWithAny, 0);
assert.equal(taxonomyGapSummary.unmappedResultLabels.labelInstances, 0);
assert.equal(taxonomyGapSummary.expectedClassCoverage.coveredAny, 0);
assert.ok(renderMarkdown({ summary, edgeCases: [] }).includes('EDHREC combo model baseline'));
assert.ok(renderMarkdown({ summary, edgeCases: [] }).includes('Proof-only expected result-class coverage'));
assert.ok(renderMarkdown({ summary: taxonomyGapSummary, edgeCases: [] }).includes('Unmapped EDHREC result labels'));

process.stdout.write('EDHREC combo evaluator tests passed\n');
