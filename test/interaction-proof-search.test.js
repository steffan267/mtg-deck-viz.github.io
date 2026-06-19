const assert = require('node:assert/strict');
const {
  boundedProofSearch,
  provePackage,
} = require('../src/interaction-proof-search');

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

const combatCopyExtraCombatNearMiss = provePackage([
  card('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}", 4),
  card('Vanilla Attacker', 'Creature — Human Warrior', 'Haste.', 2),
]);
assert.notEqual(combatCopyExtraCombatNearMiss.status, 'proven');

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
