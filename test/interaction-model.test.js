const assert = require('node:assert/strict');
const MODEL = require('../src/interaction-model');
const FACE_CLASSIFICATION = require('../src/face-classification');

function node(name, type, text, cmc = undefined, manaCost = undefined) {
  const classified = MODEL.classify({ name, type_line: type, oracle_text: text, cmc, mana_cost: manaCost });
  return {
    id: name,
    type,
    text,
    produces: classified.produces,
    consumes: classified.consumes,
    myTypes: classified.myTypes,
    tribalRefs: classified.tribalRefs,
    caps: classified.caps,
  };
}

function faceAwareNode(card) {
  const classified = FACE_CLASSIFICATION.classifyFaceAwareCard(card, MODEL);
  return {
    id: classified.faceAware.name,
    type: classified.faceAware.type_line,
    text: classified.faceAware.oracle_text,
    produces: classified.aggregate.produces,
    consumes: classified.aggregate.consumes,
    myTypes: classified.aggregate.myTypes,
    tribalRefs: classified.aggregate.tribalRefs,
    caps: classified.aggregate.caps,
    faceFacts: classified.faceFacts,
    factSources: classified.factSources,
  };
}

function interactions(a, b) {
  return MODEL.interactionsBetween(a, b);
}

function events(a, b) {
  return MODEL.eventsFromInteractions(interactions(a, b));
}

function assertHasCap(card, cap) {
  assert.ok(card.caps.includes(cap), `${card.id} should have cap ${cap}; caps=${card.caps.join(',')}`);
}

function assertNoCap(card, cap) {
  assert.ok(!card.caps.includes(cap), `${card.id} should not have cap ${cap}; caps=${card.caps.join(',')}`);
}

function assertHasEvent(a, b, event) {
  const eventList = events(a, b);
  assert.ok(eventList.includes(event), `${a.id} ↔ ${b.id} should include ${event}; events=${eventList.join(',')}`);
}

function assertNoEvent(a, b, event) {
  const eventList = events(a, b);
  assert.ok(!eventList.includes(event), `${a.id} ↔ ${b.id} should not include ${event}; events=${eventList.join(',')}`);
}

function assertHasFamily(a, b, family) {
  const interactionList = interactions(a, b);
  assert.ok(
    interactionList.some((it) => it.family === family),
    `${a.id} ↔ ${b.id} should include family ${family}; interactions=${JSON.stringify(interactionList)}`
  );
}

function assertNoFamily(a, b, family) {
  const interactionList = interactions(a, b);
  assert.equal(
    interactionList.some((it) => it.family === family),
    false,
    `${a.id} ↔ ${b.id} should not include family ${family}; interactions=${JSON.stringify(interactionList)}`
  );
}

function assertHasInteraction(a, b, predicate, message) {
  const interactionList = interactions(a, b);
  assert.ok(
    interactionList.some(predicate),
    `${message}; interactions=${JSON.stringify(interactionList)}`
  );
}

function main() {
  const heartstone = node(
    'Heartstone',
    'Artifact',
    "Activated abilities of creatures cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana."
  );
  const solRing = node('Sol Ring', 'Artifact', '{T}: Add {C}{C}.');
  const manaVault = node('Mana Vault', 'Artifact', '{T}: Add {C}{C}{C}.');
  const arcaneSignet = node('Arcane Signet', 'Artifact', "{T}: Add one mana of any color in your commander's color identity.");
  const xantcha = node('Xantcha, Sleeper Agent', 'Legendary Creature — Phyrexian Minion', "Xantcha, Sleeper Agent enters the battlefield under the control of an opponent of your choice.\n{3}: Xantcha's controller loses 2 life and you draw a card. Any player may activate this ability.");

  assertHasCap(heartstone, 'is-creature-ability-cost-reducer');
  assertNoCap(heartstone, 'is-cost-reducer');
  assertHasCap(xantcha, 'has-creature-activated-ability');
  assertNoCap(solRing, 'has-creature-activated-ability');

  for (const rock of [solRing, manaVault, arcaneSignet]) {
    assertNoEvent(heartstone, rock, 'enable:cost-reduction→ability');
  }
  assertHasEvent(heartstone, xantcha, 'enable:cost-reduction→ability');

  const sam = node('Sam, Loyal Attendant', 'Legendary Creature — Halfling Peasant', 'Partner with Frodo, Adventurous Hobbit. At the beginning of combat on your turn, create a Food token. Activated abilities of Foods you control cost {1} less to activate.');
  const gildedGoose = node('Gilded Goose', 'Creature — Bird', `Flying
When Gilded Goose enters, create a Food token.
{1}{G}, {T}: Create a Food token.
{T}, Sacrifice a Food: Add one mana of any color.`);
  assertHasCap(sam, 'is-food-ability-cost-reducer');
  assertNoCap(sam, 'is-cost-reducer');
  assertNoEvent(sam, gildedGoose, 'enable:cost-reduction→ability');

  const foodDrawReplacer = node('Food Draw Replacer', 'Legendary Creature — Halfling', 'If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead. Sacrifice three Foods: Draw a card.');
  const foodSacrificeTokenSource = node('Food Sacrifice Token Source', 'Artifact', 'Whenever you sacrifice a Food, create a tapped Treasure token.');
  const batchedFoodSource = node('Batched Food Source', 'Artifact', 'Whenever you sacrifice one or more Foods, create a tapped Treasure token.');
  const limitedFoodSource = node('Limited Food Source', 'Artifact', 'Whenever you sacrifice a Food, create a tapped Treasure token. This ability triggers only once each turn.');
  assertHasCap(foodDrawReplacer, 'is-food-token-replacement');
  assertHasCap(foodDrawReplacer, 'food-replacement-extra-count:1');
  assertHasCap(foodDrawReplacer, 'is-food-sacrifice-draw-engine');
  assertHasCap(foodDrawReplacer, 'food-sacrifice-count:3');
  assertHasCap(foodDrawReplacer, 'food-sacrifice-draw-count:1');
  assertHasCap(foodSacrificeTokenSource, 'is-food-sacrifice-token-trigger');
  assertHasCap(foodSacrificeTokenSource, 'food-sacrifice-trigger-token-count:1');
  assertNoCap(batchedFoodSource, 'is-food-sacrifice-token-trigger');
  assertNoCap(limitedFoodSource, 'is-food-sacrifice-token-trigger');

  const doomBlade = node('Doom Blade', 'Instant', 'Destroy target nonblack creature.');
  const bloodArtist = node('Blood Artist', 'Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.');
  const bastion = node('Bastion of Remembrance', 'Enchantment', 'When Bastion of Remembrance enters the battlefield, create a 1/1 white Human Soldier creature token. Whenever a creature you control dies, each opponent loses 1 life and you gain 1 life.');
  assertHasCap(bloodArtist, 'is-death-drain-payoff');
  assertHasCap(bastion, 'is-death-drain-payoff');
  assertNoEvent(doomBlade, bastion, 'sacrifice');

  const worldShaper = node('World Shaper', 'Creature — Merfolk Shaman', 'Whenever World Shaper attacks, you mill three cards. When World Shaper dies, return all land cards from your graveyard to the battlefield tapped.');
  const rampagingBaloths = node('Rampaging Baloths', 'Creature — Beast', 'Landfall — Whenever a land enters the battlefield under your control, create a 4/4 green Beast creature token.');
  assertHasCap(worldShaper, 'is-land-recursion');
  assertHasCap(worldShaper, 'is-graveyard-fuel');
  assertHasCap(worldShaper, 'is-graveyard-recursion');
  assertHasCap(rampagingBaloths, 'is-landfall-payoff');
  assertHasEvent(worldShaper, rampagingBaloths, 'landfall');
  assertHasFamily(worldShaper, rampagingBaloths, 'land-recursion→landfall');
  const cultivate = node('Cultivate', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand. Then shuffle.');
  assertHasEvent(cultivate, rampagingBaloths, 'landfall');

  const stitchersSupplier = node('Stitcher-Style Supplier', 'Creature — Zombie', 'When this creature enters, mill three cards.');
  const reanimateSpell = node('Reanimate-Style Spell', 'Sorcery', 'Return target creature card from a graveyard to the battlefield under your control.');
  const eternalWitness = node('Eternal Witness-Style Recursion', 'Creature — Human Shaman', 'When this creature enters, return target card from your graveyard to your hand.');
  assertHasCap(stitchersSupplier, 'is-graveyard-fuel');
  assertHasCap(reanimateSpell, 'is-graveyard-recursion');
  assertHasFamily(stitchersSupplier, reanimateSpell, 'graveyard-fuel→recursion');
  assertNoFamily(reanimateSpell, eternalWitness, 'graveyard-fuel→recursion');
  assertNoFamily(stitchersSupplier, reanimateSpell, 'graveyard');

  const battleScreech = node('Battle Screech', 'Sorcery', 'Create two 1/1 white Bird creature tokens with flying. Flashback—Tap three untapped white creatures you control.');
  const stokeTheFlames = node('Stoke the Flames', 'Instant', 'Convoke. Stoke the Flames deals 4 damage to any target.');
  const kasla = node('Kasla, the Broken Halo', 'Legendary Creature — Angel Ally', 'Convoke. Flying, vigilance, haste. Whenever you cast another spell that has convoke, scry 2, then draw a card.');
  assertHasCap(battleScreech, 'is-creature-token-producer');
  assertHasCap(stokeTheFlames, 'is-convoke-spell');
  assertHasCap(kasla, 'is-convoke-cast-payoff');
  assertNoFamily(battleScreech, stokeTheFlames, 'ramp→sink');
  assertNoFamily(battleScreech, stokeTheFlames, 'convoke-fodder→payoff');
  assertHasFamily(battleScreech, kasla, 'convoke-fodder→payoff');
  assertHasFamily(stokeTheFlames, kasla, 'convoke-spell→payoff');

  const panharmonicon = node('Panharmonicon', 'Artifact', 'If an artifact or creature entering the battlefield causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.');
  const wallOfOmens = node('Wall of Omens', 'Creature — Wall', 'When Wall of Omens enters the battlefield, draw a card.');
  const compactWall = node('Compact Wall of Omens', 'Creature — Wall', 'Defender When this creature enters, draw a card.');
  assertHasCap(panharmonicon, 'is-etb-doubler');
  assertHasCap(wallOfOmens, 'has-etb');
  assertHasCap(compactWall, 'has-etb');
  assertHasFamily(panharmonicon, wallOfOmens, 'etb-doubler');
  assertHasFamily(panharmonicon, compactWall, 'etb-doubler');

  const visceraSeer = node('Viscera Seer', 'Creature — Vampire Wizard', 'Sacrifice a creature: Scry 1.');
  const skullclamp = node('Skullclamp', 'Artifact — Equipment', 'Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}');
  const grizzlyBears = node('Grizzly Bears', 'Creature — Bear', '');
  assertHasCap(visceraSeer, 'is-sac-outlet');
  assertHasCap(grizzlyBears, 'is-body');
  assertNoFamily(grizzlyBears, visceraSeer, 'sac-fodder→outlet');
  assertHasCap(skullclamp, 'has-death-trigger');
  assertHasCap(skullclamp, 'is-death-draw-payoff');
  assertHasFamily(visceraSeer, skullclamp, 'death→draw');

  const pitilessPlunderer = node('Pitiless Plunderer', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.');
  assertHasCap(pitilessPlunderer, 'has-death-trigger');
  assertHasCap(pitilessPlunderer, 'is-death-token-payoff');
  assertHasCap(pitilessPlunderer, 'is-death-mana-payoff');
  assertHasCap(pitilessPlunderer, 'death-mana-any:1');
  assertHasFamily(visceraSeer, pitilessPlunderer, 'death→tokens');

  const marionetteApprentice = node('Marionette Apprentice', 'Creature — Human Artificer', 'Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.) Whenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.');
  assertHasCap(marionetteApprentice, 'has-counters');
  assertHasCap(marionetteApprentice, 'is-creature-token-producer');
  assertHasCap(marionetteApprentice, 'has-death-trigger');
  assertHasCap(marionetteApprentice, 'is-death-drain-payoff');

  const counterThresholdExtraTurnEngine = node(
    'Counter Threshold Extra-Turn Engine',
    'Artifact',
    '{T}, Remove three charge counters from this artifact: Take an extra turn after this one.',
    3,
  );
  const freeCounterDoubler = node(
    'Free Counter Doubler',
    'Artifact',
    '{T}: Double the number of each kind of counter on target artifact.',
    2,
  );
  const manaPaidCounterDoubler = node(
    'Mana-Paid Counter Doubler',
    'Artifact',
    '{2}, {T}: Double the number of each kind of counter on target artifact.',
    3,
  );
  const freeProliferator = node(
    'Free Proliferator',
    'Artifact',
    '{T}: Proliferate three times.',
    4,
  );
  const singleProliferator = node(
    'Single Proliferator',
    'Artifact',
    'At the beginning of your end step, proliferate.',
    4,
  );
  const proliferateDoubler = node(
    'Proliferate Doubler',
    'Creature — Phyrexian Wizard',
    'If you would proliferate, proliferate twice instead.',
    4,
  );
  const forcedExileCastEngine = node(
    'Forced Exile Cast Engine',
    'Artifact',
    'Whenever a player casts a spell from their hand, that player exiles it. If the player does, they may cast a spell from among other cards exiled with this artifact without paying its mana cost.',
    6,
  );
  const forcedDrawReplacementCastEngine = node(
    'Forced Draw Replacement Cast Engine',
    'Artifact',
    "Players can't draw cards. At the beginning of each player's draw step, that player exiles the top card of their library. If it's a land card, the player puts it onto the battlefield. Otherwise, the player casts it without paying its mana cost if able.",
    5,
  );
  const codieStyleEngine = node(
    'Codie-Style Engine',
    'Legendary Artifact Creature — Construct',
    '{4}, {T}: Add {W}{U}{B}{R}{G}. When you cast your next spell this turn, exile cards from the top of your library until you exile an instant or sorcery card with lesser mana value. Until end of turn, you may cast that card without paying its mana cost.',
    3,
  );
  const twiddleStyleSpell = node(
    'Twiddle-Style Spell',
    'Instant',
    'You may tap or untap target artifact, creature, or land.',
    1,
  );
  const creatureUntapTrick = node(
    'Creature Untap Trick',
    'Instant',
    'Target creature gets +1/+2 and gains reach until end of turn. Untap it.',
    1,
  );
  const castThresholdSpellCopyEngine = node(
    'Cast-Threshold Spell Copy Engine',
    'Legendary Creature — Human Rogue',
    "Whenever you cast your second spell each turn, exile the top card of your library. Until the end of your next turn, you may play that card. {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy. Activate only if you've cast three or more spells this turn.",
    3,
  );
  const cantripCreatureUntap = node(
    'Cantrip Creature Untap',
    'Instant',
    'Untap target creature. Draw a card.',
    1,
  );
  const tapOrUntapCantrip = node(
    'Tap-Or-Untap Cantrip',
    'Instant',
    'You may tap or untap target artifact, creature, or land. Draw a card.',
    3,
  );
  assertHasCap(codieStyleEngine, 'is-tap-free-cast-engine');
  assertHasCap(twiddleStyleSpell, 'is-cheap-instant-engine-untap-spell');
  assertHasCap(creatureUntapTrick, 'is-cheap-instant-engine-untap-spell');
  assertHasCap(castThresholdSpellCopyEngine, 'is-cast-threshold-spell-copy-engine');
  assertHasCap(cantripCreatureUntap, 'is-cheap-instant-cantrip-engine-untap-spell');
  assertHasCap(tapOrUntapCantrip, 'is-cheap-instant-engine-untap-spell');
  assertHasCap(tapOrUntapCantrip, 'is-cheap-instant-cantrip-engine-untap-spell');
  assertHasFamily(twiddleStyleSpell, codieStyleEngine, 'tap-free-cast→untap-engine');
  assertHasFamily(creatureUntapTrick, codieStyleEngine, 'tap-free-cast→untap-engine');
  assertHasInteraction(cantripCreatureUntap, castThresholdSpellCopyEngine,
    it => it.family === 'spell-copy-engine→cantrip-untap-loop' && it.strength === 'combo-critical',
    'cantrip creature untap plus cast-threshold spell-copy engine should be combo-critical');
  assertHasInteraction(tapOrUntapCantrip, castThresholdSpellCopyEngine,
    it => it.family === 'spell-copy-engine→cantrip-untap-loop' && it.strength === 'combo-critical',
    'tap-or-untap cantrip text should still feed the spell-copy cantrip loop');
  assertHasInteraction(creatureUntapTrick, castThresholdSpellCopyEngine,
    it => it.family === 'spell-copy-engine→untap-reset' && it.strength === 'strong',
    'non-cantrip creature untap should reset the spell-copy engine without becoming a direct combo-critical pair');
  assertNoEvent(creatureUntapTrick, castThresholdSpellCopyEngine, 'enable:spell-copy-engine→cantrip-untap-loop');
  const nonhandCastLockpiece = node(
    'Nonhand Cast Lockpiece',
    'Creature — Human Wizard',
    "Your opponents can't cast spells from anywhere other than their hands.",
    2,
  );
  const spellCountLockpiece = node(
    'Spell Count Lockpiece',
    'Enchantment',
    "Each player can't cast more than one spell each turn.",
    3,
  );
  const sorceryTimingLockpiece = node(
    'Sorcery Timing Lockpiece',
    'Legendary Planeswalker',
    'Each opponent can cast spells only any time they could cast a sorcery.',
    3,
  );
  const freeCastCounterLockpiece = node(
    'Free Cast Counter Lockpiece',
    'Artifact',
    'Whenever a player casts a spell, if no mana was spent to cast it, counter that spell.',
    1,
  );
  const opponentFreeCastCounterLockpiece = node(
    'Opponent Free Cast Counter Lockpiece',
    'Creature — Human Soldier',
    'Whenever an opponent casts a spell, if no mana was spent to cast it, counter that spell.',
    2,
  );
  const noncreatureExileLockpiece = node(
    'Noncreature Exile Lockpiece',
    'Artifact Creature — Phyrexian Golem',
    "Players can't cast noncreature spells from graveyards or exile.",
    2,
  );
  const counterSuppressionStatic = node(
    'Counter Suppression Static',
    'Enchantment',
    "Players can't get counters. Counters can't be put on artifacts, creatures, enchantments, or lands.",
    3,
  );
  const counterBurdenPreventionShield = node(
    'Counter Burden Prevention Shield',
    'Enchantment',
    'If a source would deal damage to you, prevent that damage and put an incarnation counter on this enchantment. When there are nine or more incarnation counters on this enchantment, exile it.',
    3,
  );
  const delayedCounterShield = node(
    'Delayed Counter Shield',
    'Enchantment',
    'If damage would be dealt to you, put that many delay counters on this enchantment instead. At the beginning of your upkeep, remove all delay counters from this enchantment. For each delay counter removed this way, you lose 1 life unless you pay {1}{W}.',
    4,
  );
  const depletionCounterspellLockpiece = node(
    'Depletion Counterspell Lockpiece',
    'Enchantment',
    'Whenever an opponent casts a spell, counter that spell and put a depletion counter on this enchantment. If there are three or more depletion counters on this enchantment, sacrifice it.',
    8,
  );
  const zeroLifePoisonShield = node(
    'Zero Life Poison Shield',
    'Enchantment',
    "You don't lose the game for having 0 or less life. As long as you have 0 or less life, all damage is dealt to you as though its source had infect.",
    3,
  );
  assertHasCap(counterThresholdExtraTurnEngine, 'has-counters');
  assertNoCap(counterBurdenPreventionShield, 'has-counters');
  assertNoCap(delayedCounterShield, 'has-counters');
  assertNoCap(depletionCounterspellLockpiece, 'has-counters');
  assertHasFamily(freeProliferator, counterThresholdExtraTurnEngine, 'proliferate→counters');
  assertNoFamily(freeProliferator, delayedCounterShield, 'proliferate→counters');
  assertNoFamily(freeCounterDoubler, depletionCounterspellLockpiece, 'counter-multiplier');
  const ageCounterPreventionSource = node(
    'Age Counter Prevention Source',
    'Land',
    'Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.) Creatures you control can\'t attack. Prevent all damage that would be dealt to you.',
    0,
  );
  const replayablePreventionLand = node(
    'Replayable Prevention Land',
    'Land',
    'Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.) When this land enters, sacrifice a land. Creatures you control can\'t attack. Prevent all damage that would be dealt to you.',
    0,
  );
  const landReplaySupport = node(
    'Land Replay Support',
    'Artifact',
    'You may play lands from your graveyard.',
    3,
  );
  const extraLandSupport = node(
    'Extra Land Support',
    'Enchantment',
    'You may play an additional land on each of your turns.',
    1,
  );
  const drawStepHandCycler = node(
    'Draw-Step Hand Cycler',
    'Artifact',
    "At the beginning of each player's draw step, that player puts the cards in their hand on the bottom of their library in any order, then draws that many cards.",
    4,
  );
  const opponentDrawLimit = node(
    'Opponent Draw Limit',
    'Planeswalker',
    "Each opponent can't draw more than one card each turn.",
    3,
  );
  const playerDrawLimit = node(
    'Player Draw Limit',
    'Creature — Spirit',
    "Each player can't draw more than one card each turn.",
    2,
  );
  const opponentDrawReplacementLimit = node(
    'Opponent Draw Replacement Limit',
    'Creature — Rogue',
    'If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.',
    4,
  );
  const noDrawSearchStepEngine = node(
    'No-Draw Search-Step Engine',
    'Creature — Elf Wizard',
    "Players can't draw cards. At the beginning of each player's draw step, that player loses 3 life, searches their library for a card, puts it into their hand, then shuffles.",
    3,
  );
  const opponentSearchLockpiece = node(
    'Opponent Search Lockpiece',
    'Creature — Human Rogue',
    "You control your opponents while they're searching their libraries. While an opponent is searching their library, they exile each card they find.",
    3,
  );
  const playerSearchLockpiece = node(
    'Player Search Lockpiece',
    'Artifact',
    "Players can't search libraries.",
    4,
  );
  const noFlyingAttackYouLockpiece = node(
    'No-Flying Attack You Lockpiece',
    'Enchantment',
    "Creatures without flying can't attack you.",
    5,
  );
  const noFlyingAttackAllLockpiece = node(
    'No-Flying Attack All Lockpiece',
    'Enchantment',
    "Creatures without flying can't attack.",
    4,
  );
  const flyersCantAttackYouLockpiece = node(
    'Flyers Cant Attack You Lockpiece',
    'Enchantment',
    "Creatures with flying can't attack you.",
    8,
  );
  const flyingIslandwalkOnlyAttackYouLockpiece = node(
    'Flying Islandwalk Only Attack You Lockpiece',
    'Enchantment',
    "If you would draw a card during your draw step, instead you may skip that draw. If you do, until your next turn, you can't be attacked except by creatures with flying and/or islandwalk.",
    2,
  );
  const flyingIslandwalkOnlyAttackAllLockpiece = node(
    'Flying Islandwalk Only Attack All Lockpiece',
    'Creature — Leviathan',
    "All lands are Islands in addition to their other types. Creatures without flying or islandwalk can't attack.",
    8,
  );
  const opponentFlyingRemovalSupport = node(
    'Opponent Flying Removal Support',
    'Enchantment Creature — Human Wizard',
    "Creatures you control have flying. Creatures your opponents control lose flying and can't have or gain flying.",
    6,
  );
  const globalFlyingIslandwalkRemovalSupport = node(
    'Global Flying Islandwalk Removal Support',
    'World Enchantment',
    'All creatures lose flying and islandwalk.',
    4,
  );
  const globalFlyingRemovalSupport = node(
    'Global Flying Removal Support',
    'Enchantment',
    'All creatures lose flying.',
    1,
  );
  const globalUntapSkipper = node(
    'Global Untap Skipper',
    'Enchantment',
    "Players skip their untap steps. At the beginning of your upkeep, sacrifice this enchantment unless you pay {U}.",
    2,
  );
  const allPermanentsAreArtifactsEngine = node(
    'All-Permanents Are Artifacts Engine',
    'Artifact',
    'All permanents are artifacts in addition to their other types.',
    6,
  );
  const artifactActivationLockpiece = node(
    'Artifact Activation Lockpiece',
    'Artifact',
    "Activated abilities of artifacts can't be activated.",
    2,
  );
  const opponentArtifactActivationLockpiece = node(
    'Opponent Artifact Activation Lockpiece',
    'Planeswalker',
    "Activated abilities of artifacts your opponents control can't be activated.",
    4,
  );
  const allLandsAreIslandsEngine = node(
    'All-Lands Are Islands Engine',
    'Creature — Leviathan',
    "All lands are Islands in addition to their other types. Creatures without flying or islandwalk can't attack.",
    8,
  );
  const nonbasicLandsAreIslandsEngine = node(
    'Nonbasic Lands Are Islands Engine',
    'Creature — Merfolk Wizard',
    'Nonbasic lands are Islands.',
    3,
  );
  const islandUntapLockpiece = node(
    'Island Untap Lockpiece',
    'Enchantment',
    "Islands don't untap during their controllers' untap steps.",
    3,
  );
  const islandTapUntapLockpiece = node(
    'Island Tap Untap Lockpiece',
    'Enchantment',
    "When this enchantment enters, tap all Islands. Islands don't untap during their controllers' untap steps.",
    4,
  );
  const faceUpUntapSkipper = node(
    'Face-Up Untap Skipper',
    'Creature — Elemental',
    'Morph {5}{U}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.) When this creature is turned face up, each opponent skips their next untap step.',
    6,
  );
  const upkeepResetCopier = node(
    'Upkeep Reset Copier',
    'Creature — Shapeshifter',
    'As this creature enters or is turned face up, you may choose another creature on the battlefield. If you do, until this creature is turned face down, it becomes a copy of that creature, except it has "At the beginning of your upkeep, you may turn this creature face down." Morph {1}{U}',
    5,
  );
  const globalUpkeepSkipper = node(
    'Global Upkeep Skipper',
    'Artifact',
    'Players skip their upkeep steps.',
    5,
  );
  const selfEndStepNonlandUntapper = node(
    'Self End Step Nonland Untapper',
    'Enchantment',
    'At the beginning of your end step, untap all nonland permanents you control.',
    3,
  );
  const upkeepUntapManaLand = node(
    'Upkeep Untap Mana Land',
    'Land',
    "This land doesn't untap during your untap step. At the beginning of your upkeep, you may exile a card from your hand. If you do, untap this land. {T}: Add one mana of any color.",
    0,
  );
  const graveyardArtifactCastSupport = node(
    'Graveyard Artifact Cast Support',
    'Legendary Creature — Merfolk Wizard',
    '{T}: Choose target artifact card in your graveyard. You may cast that card this turn.',
    2,
  );
  const combatGraveyardArtifactCastSupport = node(
    'Combat Graveyard Artifact Cast Support',
    'Legendary Artifact Creature — Human',
    'Whenever this creature deals combat damage to a player, choose target artifact card in your graveyard. You may cast that card this turn.',
    3,
  );
  const graveyardPermanentCastSupport = node(
    'Graveyard Permanent Cast Support',
    'Legendary Creature — Elemental Avatar',
    'During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard.',
    6,
  );
  const constrainedGraveyardPermanentCastSupport = node(
    'Constrained Graveyard Permanent Cast Support',
    'Artifact',
    "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn. Activate only as a sorcery.",
    4,
  );
  const castProtectionSource = node(
    'Cast Protection Source',
    'Legendary Artifact',
    'Indestructible When this artifact enters, if you cast it, you gain protection from everything until your next turn. At the beginning of your upkeep, you lose 1 life for each burden counter on this artifact.',
    4,
  );
  const artifactSelfBounceSupport = node(
    'Artifact Self Bounce Support',
    'Legendary Creature — Human Advisor',
    '{1}{U}: Return target artifact you control to its owner\'s hand.',
    2,
  );
  const permanentSelfBounceSupport = node(
    'Permanent Self Bounce Support',
    'Creature — Vedalken Wizard',
    '{U}, {T}: Return target permanent you control to its owner\'s hand.',
    2,
  );
  const discardSelfBounceSupport = node(
    'Discard Self Bounce Support',
    'Creature — Human Spellshaper',
    'Flying {U}, {T}, Discard a card: Return target permanent you control to its owner\'s hand.',
    4,
  );
  const yourTurnOnlySelfBounceSupport = node(
    'Your-Turn-Only Self Bounce Support',
    'Creature — Wizard',
    '{U}, {T}: Return target permanent you control to its owner\'s hand. Activate only during your turn.',
    2,
  );
  assertHasCap(counterThresholdExtraTurnEngine, 'is-counter-threshold-extra-turn-engine');
  assertHasCap(counterThresholdExtraTurnEngine, 'counter-threshold-extra-turn-threshold:3');
  assertHasCap(counterThresholdExtraTurnEngine, 'counter-threshold-extra-turn-type:charge');
  assertHasCap(freeCounterDoubler, 'is-repeatable-counter-doubler');
  assertHasCap(freeCounterDoubler, 'counter-doubler-target:artifact');
  assertHasCap(manaPaidCounterDoubler, 'counter-doubler-cost:2');
  assertHasCap(freeProliferator, 'is-repeatable-proliferator');
  assertHasCap(freeProliferator, 'proliferate-count-per-turn:3');
  assertHasCap(singleProliferator, 'is-turn-cycle-proliferator');
  assertHasCap(singleProliferator, 'proliferate-count-per-turn:1');
  assertHasCap(proliferateDoubler, 'is-proliferate-multiplier');
  assertHasCap(proliferateDoubler, 'proliferate-multiplier:2');
  assertHasCap(forcedExileCastEngine, 'is-forced-nonhand-cast-engine');
  assertHasCap(forcedExileCastEngine, 'forced-cast-origin:exile');
  assertHasCap(forcedExileCastEngine, 'forced-cast-trigger:spell-from-hand');
  assertHasCap(forcedDrawReplacementCastEngine, 'is-forced-nonhand-cast-engine');
  assertHasCap(forcedDrawReplacementCastEngine, 'forced-cast-origin:library-top');
  assertHasCap(forcedDrawReplacementCastEngine, 'forced-cast-trigger:draw-step');
  assertHasCap(nonhandCastLockpiece, 'is-cast-origin-lockpiece');
  assertHasCap(nonhandCastLockpiece, 'cast-lock-origin:non-hand');
  assertHasCap(spellCountLockpiece, 'cast-lock-axis:spell-count');
  assertHasCap(sorceryTimingLockpiece, 'cast-lock-axis:timing-sorcery');
  assertHasCap(freeCastCounterLockpiece, 'cast-lock-axis:free-cast');
  assertHasCap(opponentFreeCastCounterLockpiece, 'cast-lock-axis:free-cast');
  assertHasCap(opponentFreeCastCounterLockpiece, 'cast-lock-scope:opponents');
  assertHasCap(noncreatureExileLockpiece, 'cast-lock-origin-exile-noncreature-only');
  assertHasCap(yourTurnOnlySelfBounceSupport, 'self-bounce-window:your-turn');
  assertHasCap(counterSuppressionStatic, 'is-counter-suppression-static');
  assertHasCap(counterSuppressionStatic, 'counter-suppression:players');
  assertHasCap(counterSuppressionStatic, 'counter-suppression:enchantments');
  assertHasCap(counterSuppressionStatic, 'counter-suppression:lands');
  assertHasCap(counterBurdenPreventionShield, 'is-damage-prevention-counter-burden');
  assertHasCap(counterBurdenPreventionShield, 'counter-burden-type:incarnation');
  assertHasCap(counterBurdenPreventionShield, 'counter-burden-threshold-failure');
  assertHasCap(delayedCounterShield, 'is-damage-prevention-counter-burden');
  assertHasCap(delayedCounterShield, 'counter-burden-type:delay');
  assertHasCap(delayedCounterShield, 'counter-burden-upkeep-loss');
  assertHasCap(depletionCounterspellLockpiece, 'is-spell-counter-depletion-lockpiece');
  assertHasCap(zeroLifePoisonShield, 'is-zero-life-poison-shield');
  assertHasCap(ageCounterPreventionSource, 'is-cumulative-upkeep-counter-burden');
  assertHasCap(ageCounterPreventionSource, 'counter-burden-type:age');
  assertHasCap(ageCounterPreventionSource, 'is-full-self-damage-prevention-source');
  assertHasCap(replayablePreventionLand, 'is-replayable-prevention-land-lockpiece');
  assertHasCap(landReplaySupport, 'is-land-recursion');
  assertHasCap(extraLandSupport, 'is-extra-land-drop');
  assertHasCap(extraLandSupport, 'extra-land-drops:1');
  assertHasCap(drawStepHandCycler, 'is-draw-step-hand-cycler');
  assertHasCap(opponentDrawLimit, 'is-draw-limit-lockpiece');
  assertHasCap(opponentDrawLimit, 'draw-limit-scope:opponents');
  assertHasCap(playerDrawLimit, 'draw-limit-scope:players');
  assertHasCap(opponentDrawReplacementLimit, 'draw-limit-replacement:skip');
  assertHasCap(noDrawSearchStepEngine, 'is-no-draw-search-step-engine');
  assertHasCap(opponentSearchLockpiece, 'is-search-lockpiece');
  assertHasCap(opponentSearchLockpiece, 'search-lock-scope:opponents');
  assertHasCap(playerSearchLockpiece, 'search-lock-scope:players');
  assertHasCap(noFlyingAttackYouLockpiece, 'attack-lock-axis:no-flying');
  assertHasCap(noFlyingAttackYouLockpiece, 'attack-lock-scope:you');
  assertHasCap(noFlyingAttackAllLockpiece, 'attack-lock-scope:players');
  assertHasCap(flyersCantAttackYouLockpiece, 'attack-lock-axis:flying-only');
  assertHasCap(flyingIslandwalkOnlyAttackYouLockpiece, 'attack-lock-axis:flying-or-islandwalk-only');
  assertHasCap(flyingIslandwalkOnlyAttackAllLockpiece, 'attack-lock-axis:flying-or-islandwalk-only');
  assertHasCap(opponentFlyingRemovalSupport, 'evasion-removal:flying');
  assertHasCap(opponentFlyingRemovalSupport, 'evasion-removal-scope:opponents');
  assertHasCap(globalFlyingIslandwalkRemovalSupport, 'evasion-removal:flying');
  assertHasCap(globalFlyingIslandwalkRemovalSupport, 'evasion-removal:islandwalk');
  assertHasCap(globalFlyingRemovalSupport, 'evasion-removal:flying');
  assertHasCap(globalUntapSkipper, 'is-global-untap-skipper');
  assertHasCap(allPermanentsAreArtifactsEngine, 'is-all-permanents-artifacts');
  assertHasCap(artifactActivationLockpiece, 'is-artifact-activation-lockpiece');
  assertHasCap(artifactActivationLockpiece, 'artifact-activation-lock-scope:players');
  assertHasCap(opponentArtifactActivationLockpiece, 'artifact-activation-lock-scope:opponents');
  assertHasCap(allLandsAreIslandsEngine, 'is-all-lands-are-islands');
  assertHasCap(nonbasicLandsAreIslandsEngine, 'is-nonbasic-lands-are-islands');
  assertHasCap(islandUntapLockpiece, 'is-island-untap-lockpiece');
  assertHasCap(islandTapUntapLockpiece, 'is-island-untap-lockpiece');
  assertHasCap(islandTapUntapLockpiece, 'island-untap-lockpiece-taps-islands-on-entry');
  assertHasCap(faceUpUntapSkipper, 'is-face-up-opponent-next-untap-skipper');
  assertHasCap(faceUpUntapSkipper, 'face-up-cost:7');
  assertHasCap(upkeepResetCopier, 'is-upkeep-face-down-resetter');
  assertHasCap(upkeepResetCopier, 'is-face-up-copy-creature');
  assertHasCap(upkeepResetCopier, 'face-up-copy-target:another-creature');
  assertHasCap(upkeepResetCopier, 'face-up-cost:2');
  assertHasCap(globalUpkeepSkipper, 'is-global-upkeep-skipper');
  assertHasCap(selfEndStepNonlandUntapper, 'is-self-end-step-nonland-untapper');
  assertHasCap(upkeepUntapManaLand, 'is-upkeep-self-untap-mana-land');
  assertHasCap(upkeepUntapManaLand, 'upkeep-self-untap-mana-land-produces:any');
  assertHasCap(upkeepUntapManaLand, 'upkeep-self-untap-mana-land-requires-hand-card');
  assertHasCap(graveyardArtifactCastSupport, 'is-graveyard-artifact-cast-support');
  assertHasCap(graveyardArtifactCastSupport, 'graveyard-cast-support-target:artifact');
  assertHasCap(graveyardArtifactCastSupport, 'graveyard-cast-support-window:your-turn');
  assertHasCap(combatGraveyardArtifactCastSupport, 'graveyard-cast-support-requires-combat-damage');
  assertHasCap(graveyardPermanentCastSupport, 'is-graveyard-permanent-cast-support');
  assertHasCap(graveyardPermanentCastSupport, 'graveyard-cast-support-target:permanent');
  assertHasCap(constrainedGraveyardPermanentCastSupport, 'graveyard-cast-support-precondition:no-spell-yet');
  assertHasCap(constrainedGraveyardPermanentCastSupport, 'graveyard-cast-support-postcondition:no-more-spells');
  assertHasCap(castProtectionSource, 'is-cast-gated-opponent-turn-protection-source');
  assertHasCap(castProtectionSource, 'protection-source-type:artifact');
  assertHasCap(artifactSelfBounceSupport, 'is-repeatable-self-bounce-support');
  assertHasCap(artifactSelfBounceSupport, 'self-bounce-target:artifact-you-control');
  assertHasCap(permanentSelfBounceSupport, 'self-bounce-target:permanent-you-control');
  assertHasCap(discardSelfBounceSupport, 'self-bounce-additional-cost:discard');

  const satya = node('Satya, Aetherflux Genius', 'Legendary Creature — Human Artificer', 'Whenever Satya attacks, create a tapped and attacking token that’s a copy of up to one other target nontoken creature you control. You get {E}{E}.');
  assertHasCap(satya, 'is-copy');
  assertHasCap(satya, 'is-permanent-copy');
  assertHasCap(satya, 'is-repeatable-permanent-copy');
  assertHasCap(satya, 'permanent-copy-target:creature');
  const reverberate = node('Reverberate', 'Instant', 'Copy target instant or sorcery spell. You may choose new targets for the copy.');
  assertHasCap(reverberate, 'is-copy');
  assertNoCap(reverberate, 'is-permanent-copy');
  assertNoEvent(reverberate, wallOfOmens, 'enable:copy→trigger');
  const enchantmentEtb = node('Banishing Light Stand-In', 'Enchantment', 'When this enchantment enters the battlefield, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.');
  const oneShotCreatureCopy = node('One-Shot Creature Copy Spell', 'Sorcery', 'Create a token that’s a copy of target creature you control.');
  assertHasFamily(satya, wallOfOmens, 'copy→trigger');
  assertNoEvent(satya, enchantmentEtb, 'enable:copy→trigger');
  assertHasCap(oneShotCreatureCopy, 'is-permanent-copy');
  assertNoCap(oneShotCreatureCopy, 'is-repeatable-permanent-copy');
  assertNoEvent(oneShotCreatureCopy, wallOfOmens, 'enable:copy→trigger');

  const dauthi = node('Dauthi Voidwalker', 'Creature — Dauthi Rogue', "Shadow. If a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it. {T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost.");
  const jeskasWill = node('Jeska\'s Will', 'Sorcery', "Choose one. If you control a commander as you cast this spell, you may choose both instead. Add {R} for each card in target opponent's hand. Exile the top three cards of your library. You may play them this turn.");
  assertHasCap(dauthi, 'is-theft-cast-source');
  assertNoCap(jeskasWill, 'is-theft-cast-source');

  const markedExileAttacker = node('Marked Exile Attacker', 'Legendary Creature — Elemental Dog', 'Haste\nWhenever Marked Exile Attacker attacks, exile the top card of each player\'s library and put a fetch counter on each of them. Put a +1/+1 counter on Marked Exile Attacker for each noncreature card exiled this way.');
  const markedExileCaster = node('Marked Exile Caster', 'Legendary Creature — Human Wizard', 'You may play lands and cast noncreature spells from among cards you exiled that have fetch counters on them, and you may spend mana as though it were mana of any color to cast those spells.');
  const suspendRamp = node('Suspend Ramp', 'Sorcery', 'Search your library for a basic land card, put it onto the battlefield, then shuffle.\nSuspend 2—{G} (Rather than cast this card from your hand, you may pay {G} and exile it with two time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)');
  assertHasCap(markedExileAttacker, 'is-exile-access-source');
  assertHasCap(markedExileAttacker, 'exile-access-source:fetch');
  assertHasCap(markedExileCaster, 'uses-exiled-card-access');
  assertHasCap(markedExileCaster, 'uses-exiled-card-access:fetch');
  assertHasFamily(markedExileAttacker, markedExileCaster, 'exiled-card-access');
  assertHasEvent(markedExileAttacker, markedExileCaster, 'enable:exiled-card-access');
  assertNoCap(suspendRamp, 'is-exile-access-source');
  assertNoEvent(suspendRamp, markedExileCaster, 'enable:exiled-card-access');

  const zirda = node('Zirda-like Reducer', 'Creature — Elemental Fox', 'Abilities you activate that aren\'t mana abilities cost {2} less to activate. This effect can\'t reduce the mana in that cost to less than one mana.');
  const walkingBallista = node('Walking Ballista', 'Artifact Creature — Construct', 'Walking Ballista enters the battlefield with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on Walking Ballista.\nRemove a +1/+1 counter from Walking Ballista: It deals 1 damage to any target.');
  assertHasCap(zirda, 'is-cost-reducer');
  assertHasCap(walkingBallista, 'has-nonmana-activated-ability');
  assertNoEvent(zirda, solRing, 'enable:cost-reduction→ability');
  assertHasEvent(zirda, walkingBallista, 'enable:cost-reduction→ability');

  const artifactSacDraw = node('Oni-Cult Anvil', 'Artifact', 'Whenever one or more artifacts you control leave the battlefield during your turn, create a 1/1 colorless Construct artifact creature token. This ability triggers only once each turn.\n{T}, Sacrifice an artifact: Oni-Cult Anvil deals 1 damage to each opponent. You gain 1 life.');
  const sacrificeDrawPayoff = node('Sacrifice Draw Payoff', 'Enchantment', 'Whenever you sacrifice an artifact, draw a card.');
  assertHasCap(sacrificeDrawPayoff, 'has-sacrifice-trigger');
  assertHasCap(sacrificeDrawPayoff, 'is-artifact-sacrifice-payoff');
  assertNoCap(sacrificeDrawPayoff, 'has-death-trigger');
  assertNoCap(sacrificeDrawPayoff, 'is-death-draw-payoff');
  assertNoEvent(artifactSacDraw, sacrificeDrawPayoff, 'enable:death→draw');

  const smotheringTithe = node('Smothering Tithe', 'Enchantment', "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")");
  const wheelOfFortune = node('Wheel of Fortune', 'Sorcery', 'Each player discards their hand, then draws seven cards.');
  const wellOfLostDreams = node('Well of Lost Dreams', 'Artifact', 'Whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards.');
  const academyManufactor = node('Academy Manufactor', 'Artifact Creature — Assembly-Worker', 'If you would create a Clue, Food, or Treasure token, instead create one of each.');
  assert.deepEqual(smotheringTithe.consumes.draw, ['opp']);
  assert.deepEqual(smotheringTithe.produces.treasure, ['you']);
  assert.deepEqual(smotheringTithe.produces.tokens, ['you']);
  assert.ok(!smotheringTithe.produces.mana, 'Smothering Tithe should not produce mana from Treasure reminder text');
  assert.ok(!smotheringTithe.consumes.treasure, 'Smothering Tithe should not consume Treasure from Treasure reminder text');
  assertNoCap(smotheringTithe, 'is-creature-token-producer');
  assertNoCap(smotheringTithe, 'is-body');
  assertHasEvent(wheelOfFortune, smotheringTithe, 'draw');
  assertNoEvent(smotheringTithe, wellOfLostDreams, 'mana');
  assertNoEvent(smotheringTithe, academyManufactor, 'treasure');

  const professionalFaceBreaker = node('Professional Face-Breaker', 'Creature — Human Warrior', 'Menace Whenever one or more creatures you control deal combat damage to a player, create a Treasure token. Sacrifice a Treasure: Exile the top card of your library. You may play that card this turn.');
  assertHasCap(professionalFaceBreaker, 'has-trigger');
  assertHasCap(professionalFaceBreaker, 'is-token-producer');
  assertNoCap(professionalFaceBreaker, 'is-creature-token-producer');

  const swiftfootBoots = node('Swiftfoot Boots', 'Artifact — Equipment', 'Equipped creature has hexproof and haste.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)');
  const maskOfMemory = node('Mask of Memory', 'Artifact — Equipment', 'Whenever equipped creature deals combat damage to a player, you may draw two cards. If you do, discard a card.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)');
  const attachPayoff = node('Attach Payoff', 'Creature — Artificer', 'Whenever an Equipment becomes attached to a creature you control, draw a card.');
  const curseAura = node('Player Curse Aura', 'Enchantment — Aura Curse', 'Enchant player\nWhenever enchanted player is attacked, create a Treasure token.');
  assertHasCap(swiftfootBoots, 'is-equipment-attachment-source');
  assertHasCap(swiftfootBoots, 'is-creature-attachment-source');
  assertHasCap(attachPayoff, 'is-attachment-payoff');
  assertHasCap(curseAura, 'is-player-attachment-source');
  assertNoCap(curseAura, 'is-creature-attachment-source');
  assertNoEvent(swiftfootBoots, maskOfMemory, 'attach');
  assertNoFamily(swiftfootBoots, maskOfMemory, 'attachment-source→payoff');
  assertHasFamily(swiftfootBoots, attachPayoff, 'attachment-source→payoff');
  assertNoFamily(curseAura, attachPayoff, 'attachment-source→payoff');

  const caravan = node('Cultivator\'s Caravan', 'Artifact — Vehicle', '{T}: Add one mana of any color.\nCrew 3');
  const depala = node('Depala, Pilot Exemplar', 'Legendary Creature — Dwarf Pilot', 'Other Dwarves you control get +1/+1. Each Vehicle you control gets +1/+1. Whenever Depala becomes tapped, you may pay {X}. If you do, reveal the top X cards of your library, put all Dwarf and Vehicle cards from among them into your hand.');
  assertHasCap(caravan, 'is-vehicle');
  assertHasCap(depala, 'is-vehicle-payoff');
  assertHasFamily(caravan, depala, 'vehicle→payoff');
  assertNoEvent(solRing, depala, 'enable:vehicle→payoff');

  const quina = node('Quina, Qu Gourmet', 'Legendary Creature — Rat Chef', 'If one or more tokens would be created under your control, those tokens plus a 1/1 green Frog creature token are created instead. {2}, Sacrifice a Frog: Put a +1/+1 counter on Quina.');
  const slimeAgainstHumanity = node('Slime Against Humanity', 'Sorcery', 'Create a 0/0 green Ooze creature token with trample. Put X +1/+1 counters on it, where X is two plus the total number of cards you own in exile and in your graveyard that are Oozes or are named Slime Against Humanity. A deck can have any number of cards named Slime Against Humanity.');
  const genericTokenAmplifier = node('Generic Token Amplifier', 'Enchantment', 'If one or more tokens would be created under your control, twice that many of those tokens are created instead.');
  const replacementOnlyTokenModifier = node('Replacement-Only Token Modifier', 'Enchantment', 'If one or more creature tokens would be created under your control, that many 4/4 white Angel creature tokens with flying and vigilance are created instead.');
  const genericTokenSpell = node('Generic Token Spell', 'Sorcery', 'Create a 2/2 green Bear creature token.');
  const winota = node('Winota, Joiner of Forces', 'Legendary Creature — Human Warrior', 'Whenever a non-Human creature you control attacks, look at the top six cards of your library. You may put a Human creature card from among them onto the battlefield tapped and attacking. It gains indestructible until end of turn. Put the rest of the cards on the bottom of your library in a random order.');
  const bladeHistorian = node('Blade Historian', 'Creature — Human Cleric', 'Attacking creatures you control have double strike.');
  const parasiticGrasp = node('Parasitic Grasp', 'Instant', 'Parasitic Grasp deals 3 damage to target Human creature. You gain 3 life.');
  assertHasCap(quina, 'is-token-doubler');
  assertHasCap(quina, 'has-creature-activated-ability');
  assert.deepEqual(quina.consumes.tokens, ['you']);
  assertHasCap(slimeAgainstHumanity, 'is-token-producer');
  assertHasCap(slimeAgainstHumanity, 'is-creature-token-producer');
  assert.deepEqual(slimeAgainstHumanity.produces.tokens, ['you']);
  assertHasFamily(slimeAgainstHumanity, quina, 'token-production→amplifier');
  assertHasEvent(slimeAgainstHumanity, quina, 'tokens');
  assertHasCap(genericTokenAmplifier, 'is-token-doubler');
  assertHasCap(replacementOnlyTokenModifier, 'is-token-replacement-modifier');
  assertNoCap(replacementOnlyTokenModifier, 'is-token-doubler');
  assertNoCap(replacementOnlyTokenModifier, 'is-token-to-creature-token-replacer');
  assertHasCap(genericTokenSpell, 'is-creature-token-producer');
  assertHasFamily(genericTokenSpell, genericTokenAmplifier, 'token-production→amplifier');
  assertHasFamily(genericTokenSpell, replacementOnlyTokenModifier, 'token-production→replacement');
  assertHasCap(winota, 'is-tribal-payoff');
  assertHasFamily(winota, bladeHistorian, 'tribal-payoff→tribe');
  assertHasEvent(winota, bladeHistorian, 'tribal');
  assertNoCap(parasiticGrasp, 'is-tribal-payoff');

  const goblinChieftain = node('Goblin Chieftain', 'Creature — Goblin', 'Haste. Other Goblin creatures you control get +1/+1 and have haste.');
  const goblinToken = node('Goblin Token', 'Creature — Goblin', '');
  const bearCub = node('Bear Cub', 'Creature — Bear', '');
  const genericAnthem = node('Generic Team Anthem', 'Enchantment', 'Creatures you control get +1/+1.');
  const bastionProtector = node('Bastion Protector', 'Creature — Human Soldier', 'Commander creatures you control get +2/+2 and have indestructible.');
  assertHasCap(goblinChieftain, 'is-typed-lord');
  assertHasFamily(goblinChieftain, goblinToken, 'lord→tribe');
  assertNoFamily(goblinChieftain, bearCub, 'lord→tribe');
  assertNoFamily(genericAnthem, bearCub, 'lord→tribe');
  assertNoFamily(bastionProtector, bearCub, 'lord→tribe');
  const murder = node('Murder', 'Instant', 'Destroy target creature.');
  const heroicIntervention = node('Heroic Intervention', 'Instant', 'Permanents you control gain hexproof and indestructible until end of turn.');
  const destroyPayoff = node('Destroy Payoff', 'Creature — Horror', 'Whenever a permanent is destroyed, each opponent loses 1 life.');
  assertNoEvent(murder, heroicIntervention, 'destroy');
  assertNoEvent(murder, bastionProtector, 'destroy');
  assertHasEvent(murder, destroyPayoff, 'destroy');

  const deadeyeNavigator = node('Deadeye Navigator', 'Creature — Spirit', 'Soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)\nAs long as Deadeye Navigator is paired with another creature, each of those creatures has "{1}{U}: Exile this creature, then return it to the battlefield under your control."');
  const peregrineDrake = node('Peregrine Drake', 'Creature — Drake', 'Flying\nWhen this creature enters, untap up to five lands.');
  const cloudOfFaeries = node('Cloud of Faeries', 'Creature — Faerie', 'Flying\nWhen this creature enters, untap up to two lands.\nCycling {2} ({2}, Discard this card: Draw a card.)');
  const ephemerate = node('Ephemerate', 'Instant', 'Exile target creature you control, then return it to the battlefield under its owner\'s control.');
  const ghostlyFlicker = node('Ghostly Flicker', 'Instant', 'Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control.', 3, '{2}{U}');
  const illusionistsStratagem = node('Illusionist\'s Stratagem', 'Instant', 'Exile up to two target creatures you control, then return those cards to the battlefield under their owner\'s control. Draw a card.', 4, '{3}{U}');
  const archaeomancer = node('Archaeomancer', 'Creature — Human Wizard', 'When this creature enters, return target instant or sorcery card from your graveyard to your hand.');
  const scholarOfTheAges = node('Scholar of the Ages', 'Creature — Human Wizard', 'When this creature enters, return up to two target instant and/or sorcery cards from your graveyard to your hand.');
  const gildedLotus = node('Gilded Lotus', 'Artifact', '{T}: Add three mana of any one color.', 5, '{5}');
  const basaltMonolith = node('Basalt Monolith', 'Artifact', 'This artifact doesn\'t untap during your untap step. {T}: Add {C}{C}{C}. {3}: Untap this artifact.', 3, '{3}');
  const tappedManaArtifact = node('Tapped Mana Artifact', 'Artifact', 'Tapped Mana Artifact enters tapped. {T}: Add three mana of any one color.', 3, '{3}');
  const costedManaArtifact = node('Costed Mana Artifact', 'Artifact', '{1}, {T}: Add three mana of any one color.', 3, '{3}');
  const covetedJewel = node('Coveted Jewel', 'Artifact', 'When this artifact enters, draw three cards. {T}: Add three mana of any one color.', 6, '{6}');
  assertHasCap(deadeyeNavigator, 'is-repeatable-blink');
  assertHasCap(deadeyeNavigator, 'blink-cost:2');
  assertHasCap(peregrineDrake, 'etb-untaps-land:5');
  assertHasCap(cloudOfFaeries, 'etb-untaps-land:2');
  assertHasInteraction(deadeyeNavigator, peregrineDrake,
    it => it.family === 'blink→land-untap-etb' && it.strength === 'combo-critical',
    'Deadeye Navigator + Peregrine Drake should be a combo-critical repeatable blink/land-untap loop');
  assertHasInteraction(deadeyeNavigator, cloudOfFaeries,
    it => it.family === 'blink→land-untap-etb' && it.strength === 'combo-critical',
    'Deadeye Navigator + Cloud of Faeries should be a combo-critical repeatable blink/land-untap loop');
  assertNoCap(ephemerate, 'is-repeatable-blink');
  assertNoCap(ephemerate, 'is-multi-target-blink-spell');
  assertHasCap(ghostlyFlicker, 'is-multi-target-blink-spell');
  assertHasCap(ghostlyFlicker, 'blink-target-count:2');
  assertHasCap(ghostlyFlicker, 'blink-spell-target:creature');
  assertHasCap(ghostlyFlicker, 'blink-spell-cost:3');
  assertHasCap(illusionistsStratagem, 'blink-spell-draw-count:1');
  assertHasCap(archaeomancer, 'is-etb-spell-recursion-to-hand');
  assertHasCap(archaeomancer, 'etb-recursion-target:instant');
  assertHasCap(archaeomancer, 'etb-recursion-target:sorcery');
  assertHasCap(scholarOfTheAges, 'is-etb-spell-recursion-to-hand');
  assertHasCap(scholarOfTheAges, 'etb-recursion-target:instant');
  assertHasCap(gildedLotus, 'is-blink-resettable-mana-artifact');
  assertHasCap(gildedLotus, 'blink-reset-mana-produced:3');
  assertHasCap(gildedLotus, 'blink-reset-mana-any:3');
  assertHasCap(basaltMonolith, 'blink-reset-mana-c:3');
  assertNoCap(tappedManaArtifact, 'is-blink-resettable-mana-artifact');
  assertNoCap(costedManaArtifact, 'is-blink-resettable-mana-artifact');
  assertHasCap(covetedJewel, 'blink-reset-mana-etb-draw-count:3');
  assertHasFamily(ephemerate, peregrineDrake, 'etb→blink');
  assertNoEvent(ephemerate, peregrineDrake, 'enable:blink→land-untap-etb');

  const genericRepeatableBlink = node('Generic Repeatable Blink Engine', 'Creature — Spirit', 'As long as this creature is paired with another creature, each of those creatures has "{1}{U}: Exile this creature, then return it to the battlefield under your control."');
  const genericLandUntapEtb = node('Generic Land Untap Creature', 'Creature — Elemental', 'When this creature enters, untap up to three lands.');
  assertHasInteraction(genericRepeatableBlink, genericLandUntapEtb,
    it => it.family === 'blink→land-untap-etb' && it.strength === 'combo-critical' && it.evidence.blinkCost === 2 && it.evidence.untapCount === 3,
    'same rules text on non-famous card names should still detect repeatable blink/land-untap combo');

  const libraryExiler = node('Library Exiling Tutor', 'Instant', 'Name a card. Exile the top six cards of your library, then reveal cards from the top of your library until you reveal the named card. Put that card into your hand and exile all other cards revealed this way.');
  const emptyLibraryWin = node('Empty Library Oracle', 'Creature — Merfolk Wizard', 'When this creature enters, look at the top X cards of your library, where X is your devotion to blue. If X is greater than or equal to the number of cards in your library, you win the game.');
  assertHasCap(libraryExiler, 'is-library-exile-source');
  assertHasCap(emptyLibraryWin, 'is-empty-library-win-payoff');
  assertHasInteraction(libraryExiler, emptyLibraryWin,
    it => it.family === 'library-exile→empty-library-win' && it.strength === 'combo-critical',
    'generic library-exile source plus empty-library win payoff should be combo-critical');

  const lifegainFromOppLoss = node('Loss Converts To Gain', 'Enchantment', 'Whenever an opponent loses life, you gain that much life.');
  const oppLossFromLifeGain = node('Gain Converts To Loss', 'Enchantment', 'Whenever you gain life, target opponent loses that much life.');
  const fixedOppLossFromLifeGain = node('Fixed Gain Converts To Loss', 'Creature — Cleric', 'Whenever you gain life, each opponent loses 1 life.');
  assertHasCap(lifegainFromOppLoss, 'is-lifegain-from-opponent-lifeloss');
  assertHasCap(oppLossFromLifeGain, 'is-lifeloss-from-your-lifegain');
  assertHasCap(fixedOppLossFromLifeGain, 'is-lifeloss-from-your-lifegain');
  assertHasInteraction(lifegainFromOppLoss, oppLossFromLifeGain,
    it => it.family === 'lifeloss→lifegain-loop' && it.strength === 'combo-critical',
    'reciprocal opponent-life-loss/lifegain text should be detected as a loop without card names');
  assertHasInteraction(lifegainFromOppLoss, oppLossFromLifeGain,
    it => it.family === 'lifegain→lifeloss-loop' && it.strength === 'combo-critical',
    'reciprocal lifegain/opponent-life-loss text should emit the reverse loop family');
  assertHasInteraction(lifegainFromOppLoss, fixedOppLossFromLifeGain,
    it => it.family === 'lifegain→lifeloss-loop' && it.strength === 'combo-critical',
    'fixed opponent life-loss from your lifegain should be treated as a reciprocal loop candidate');
  const creatureEtbLifegainEngine = node('Creature ETB Lifegain Engine', 'Creature — Cleric', 'Whenever another creature enters the battlefield under your control, you gain 1 life.');
  const tapLifegainEngine = node('Tap Lifegain Engine', 'Creature — Cleric', '{T}: You gain 1 life.');
  const lifelinkGrantEngine = node('Lifelink Grant Engine', 'Enchantment', '{1}{W}: Another target creature gains lifelink until end of turn.');
  const smallLifegainSpell = node('Small Lifegain Spell', 'Instant', 'You gain 3 life.');
  assertHasFamily(creatureEtbLifegainEngine, oppLossFromLifeGain, 'lifegain-source→drain-payoff');
  assertHasFamily(tapLifegainEngine, oppLossFromLifeGain, 'lifegain-source→drain-payoff');
  assertHasFamily(lifelinkGrantEngine, oppLossFromLifeGain, 'lifegain-source→drain-payoff');
  assertNoEvent(smallLifegainSpell, oppLossFromLifeGain, 'enable:lifegain-source→drain-payoff');

  const impulseDraw = node('Impulse Draw', 'Artifact', '{3}: Exile the top card of your library. You may play that card this turn.');
  assertNoCap(impulseDraw, 'is-library-exile-source');
  assertNoEvent(impulseDraw, emptyLibraryWin, 'enable:library-exile→empty-library-win');
  const exileWipe = node('Exile Wipe', 'Sorcery', 'Exile all creatures.');
  assertNoCap(exileWipe, 'is-library-exile-source');
  assertNoEvent(exileWipe, emptyLibraryWin, 'enable:library-exile→empty-library-win');

  const massNonlandUntap = node('Mass Nonland Untap', 'Instant', 'Untap all nonland permanents you control.', 2);
  const repeatableImprinter = node('Repeatable Imprinter', 'Artifact', 'Imprint — When this artifact enters, you may exile an instant card with mana value 2 or less from your hand. {2}, {T}: You may copy the exiled card. If you do, you may cast the copy without paying its mana cost.');
  assertHasCap(massNonlandUntap, 'is-cheap-instant-nonland-permanent-untap-spell');
  assertHasCap(repeatableImprinter, 'is-repeatable-cheap-instant-caster');
  assertHasInteraction(massNonlandUntap, repeatableImprinter,
    it => it.family === 'imprint-untap-spell-loop' && it.strength === 'combo-critical',
    'repeatable cheap instant caster plus mass nonland untap spell should be combo-critical');
  const nonImprintableUntapper = node('Nonimprintable Untapper', 'Artifact', 'Whenever you cast a spell, untap all nonland permanents you control.', 5);
  assertNoCap(nonImprintableUntapper, 'is-cheap-instant-nonland-permanent-untap-spell');
  assertNoEvent(nonImprintableUntapper, repeatableImprinter, 'enable:imprint-untap-spell-loop');
  const expensiveUntapInstant = node('Expensive Untap Instant', 'Instant', 'Untap all nonland permanents you control.', 3);
  assertNoCap(expensiveUntapInstant, 'is-cheap-instant-nonland-permanent-untap-spell');
  assertNoEvent(expensiveUntapInstant, repeatableImprinter, 'enable:imprint-untap-spell-loop');

  const selfUntapManaRock = node('Self Untapping Monolith', 'Artifact', '{T}: Add {C}{C}{C}. {3}: Untap this artifact.');
  const activatedAbilityCopier = node('Activated Ability Copier', 'Artifact', 'Whenever you activate an ability, if it isn’t a mana ability, you may pay {2}. If you do, copy that ability. You may choose new targets for the copy.');
  assertHasCap(selfUntapManaRock, 'is-self-untapper');
  assertHasCap(selfUntapManaRock, 'self-untap-cost:3');
  assertHasCap(selfUntapManaRock, 'mana-produced:3');
  assertHasCap(activatedAbilityCopier, 'is-activated-ability-copier');
  assertHasCap(activatedAbilityCopier, 'ability-copy-cost:2');
  assertHasInteraction(activatedAbilityCopier, selfUntapManaRock,
    it => it.family === 'self-untap-mana→ability-copy-loop' && it.strength === 'combo-critical' && it.evidence.copyCost === 2,
    'ability copier plus self-untapping mana artifact should be detected generically');
  const lowOutputSelfUntapper = node('Low Output Self Untapper', 'Artifact', '{T}: Add {C}. {3}: Untap this artifact.');
  assertNoEvent(activatedAbilityCopier, lowOutputSelfUntapper, 'enable:self-untap-mana→ability-copy-loop');
  const breakEvenSelfUntapper = node('Break Even Self Untapper', 'Artifact', '{T}: Add {C}{C}. {2}: Untap this artifact.');
  assertNoEvent(activatedAbilityCopier, breakEvenSelfUntapper, 'enable:self-untap-mana→ability-copy-loop');
  const creatureBreakEvenSelfUntapper = node('Creature Break Even Self Untapper', 'Creature — Elf', '{T}: Add {G}{G}. {2}: Untap this creature.');
  const artifactAbilityReducer = node('Artifact Ability Reducer', 'Creature — Vedalken Artificer', "Activated abilities of artifacts you control cost {1} less to activate. This effect can't reduce the mana in that cost to less than one mana.");
  assertHasCap(artifactAbilityReducer, 'is-artifact-activated-ability-cost-reducer');
  assertNoCap(artifactAbilityReducer, 'is-cost-reducer');
  assertHasCap(artifactAbilityReducer, 'activated-ability-cost-reduction:1');
  assertHasCap(artifactAbilityReducer, 'activated-ability-cost-reduction-minimum:1');
  assertHasEvent(artifactAbilityReducer, breakEvenSelfUntapper, 'enable:cost-reduction→ability');
  assertNoEvent(artifactAbilityReducer, creatureBreakEvenSelfUntapper, 'enable:cost-reduction→ability');

  const repeatableHastyCopier = node('Repeatable Hasty Copier', 'Legendary Creature — Goblin Shaman', 'Haste. {T}: Create a token that’s a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.');
  const etbPermanentUntapper = node('ETB Permanent Untapper', 'Creature — Human Warrior', 'When this creature enters the battlefield, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.');
  const legendaryEtbPermanentUntapper = node('Legendary ETB Permanent Untapper', 'Legendary Creature — Human Warrior', 'When this creature enters the battlefield, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.');
  assertHasCap(repeatableHastyCopier, 'is-repeatable-hasty-creature-copy');
  assertHasCap(repeatableHastyCopier, 'hasty-copy-target-requires-nonlegendary');
  assertHasCap(etbPermanentUntapper, 'etb-untaps-permanent');
  assertHasInteraction(repeatableHastyCopier, etbPermanentUntapper,
    it => it.family === 'hasty-copy→etb-untap-loop' && it.strength === 'combo-critical',
    'repeatable hasty creature-copy text plus ETB permanent untap text should be combo-critical');
  assertNoEvent(repeatableHastyCopier, legendaryEtbPermanentUntapper, 'enable:hasty-copy→etb-untap-loop');

  const combatCopyEquipment = node('Combat Copy Equipment', 'Legendary Artifact — Equipment', "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste. Equip {5}");
  const firstAttackExtraCombat = node('First Attack Extra Combat', 'Legendary Creature — Angel', 'Haste. Whenever this creature attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.');
  const exertExtraCombat = node('Exert Extra Combat', 'Creature — Human Warrior', "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase.");
  const connectExtraCombat = node('Connect Extra Combat', 'Creature — Orc Pirate', "Whenever this creature deals combat damage to a player, untap each creature you control. After this phase, there is an additional combat phase. This creature can't attack a player it has already attacked this turn.");
  const globalConnectNearMiss = node('Global Connect Near Miss', 'Creature — Human Monk', 'Whenever one or more creatures you control with power 7 or greater deal combat damage to a player, untap all creatures you control. If this is the first combat phase of the turn, after this phase, there is an additional combat phase.');
  const creatureDamageNearMiss = node('Creature Damage Near Miss', 'Creature — Orc Pirate', 'Whenever this creature deals combat damage to a creature, untap each creature you control. After this phase, there is an additional combat phase.');
  const restrictedConnectNearMiss = node('Restricted Connect Near Miss', 'Creature — Noble', 'Whenever this creature deals combat damage to a player, untap all lands you control. After this phase, there is an additional combat phase. Only land creatures can attack during that combat phase.');
  const vanillaAttacker = node('Vanilla Attacker', 'Creature — Human Warrior', 'Haste.');
  const tappedAttackingCopy = node('Tapped Attacking Copy', 'Artifact — Equipment', "Whenever equipped creature attacks, create a token that's a copy of equipped creature tapped and attacking. Exile it at end of combat. Equip {4}");
  const attachedSelfCopy = node('Attached Self Copy Aura', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature has "{T}: Create a token that’s a copy of this creature, except it has haste. Exile that token at the beginning of the next end step."');
  const extraTurnCannotAttack = node('Extra Turn Cannot Attack', 'Legendary Creature — Sphinx', "Flying Whenever Extra Turn Cannot Attack deals combat damage to a player, take an extra turn after this one. Extra Turn Cannot Attack can't attack during extra turns.");
  const optionalSacrificeExtraTurn = node('Optional Sacrifice Extra Turn', 'Creature — Merfolk Wizard', 'Whenever this creature deals combat damage to a player, you may sacrifice a Merfolk. If you do, take an extra turn after this one.');
  const legendaryExtraCombatDfc = faceAwareNode({
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
  });
  const artifactFaceHastyCopyDfc = faceAwareNode({
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
  });
  const legendaryAttackExtraTurnDfc = faceAwareNode({
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
  });
  assertHasCap(combatCopyEquipment, 'is-combat-copy-token-equipment');
  assertHasCap(combatCopyEquipment, 'combat-copy-token-haste');
  assertHasCap(combatCopyEquipment, 'combat-copy-token-nonlegendary');
  assertHasCap(combatCopyEquipment, 'is-precombat-hasty-creature-copy-source');
  assertHasCap(combatCopyEquipment, 'precombat-copy-created-before-attack');
  assertHasCap(combatCopyEquipment, 'precombat-copy-token-has-haste');
  assertHasCap(combatCopyEquipment, 'precombat-copy-token-nonlegendary');
  assertHasCap(firstAttackExtraCombat, 'is-attack-extra-combat-source');
  assertHasCap(firstAttackExtraCombat, 'fresh-token-unused-attack-trigger');
  assertHasCap(firstAttackExtraCombat, 'attack-trigger-can-be-declared');
  assertHasCap(exertExtraCombat, 'is-attack-extra-combat-source');
  assertHasCap(exertExtraCombat, 'fresh-token-unused-exert-state');
  assertHasCap(connectExtraCombat, 'is-combat-damage-extra-combat-source');
  assertHasCap(connectExtraCombat, 'combat-damage-extra-combat-requires-connect');
  assertHasCap(connectExtraCombat, 'combat-damage-extra-combat-untaps-creatures');
  assertNoCap(globalConnectNearMiss, 'is-combat-damage-extra-combat-source');
  assertNoCap(creatureDamageNearMiss, 'is-combat-damage-extra-combat-source');
  assertHasCap(restrictedConnectNearMiss, 'combat-damage-extra-combat-restricts-next-combat-attackers');
  assertNoCap(restrictedConnectNearMiss, 'is-combat-damage-extra-combat-source');
  assertNoCap(tappedAttackingCopy, 'is-precombat-hasty-creature-copy-source');
  assertHasCap(attachedSelfCopy, 'is-attached-self-hasty-creature-copy');
  assertHasCap(attachedSelfCopy, 'attached-copy-token-has-haste');
  assertHasCap(extraTurnCannotAttack, 'is-combat-damage-extra-turn-source');
  assertHasCap(extraTurnCannotAttack, 'extra-turn-source-cannot-attack-extra-turns');
  assertNoCap(extraTurnCannotAttack, 'extra-turn-repeatable-with-fresh-token');
  assertHasCap(optionalSacrificeExtraTurn, 'extra-turn-source-requires-optional-payment');
  assertNoCap(optionalSacrificeExtraTurn, 'extra-turn-repeatable-with-fresh-token');
  assertHasCap(legendaryExtraCombatDfc, 'is-attack-extra-combat-source');
  assertHasCap(artifactFaceHastyCopyDfc, 'is-repeatable-hasty-creature-copy');
  assertHasCap(artifactFaceHastyCopyDfc, 'is-creature-permanent');
  assertHasCap(legendaryAttackExtraTurnDfc, 'is-attack-extra-turn-source');
  assertHasInteraction(combatCopyEquipment, firstAttackExtraCombat,
    it => it.family === 'combat-copy-token→extra-combat-loop' && it.strength === 'combo-critical',
    'combat-copy equipment plus first-attack extra combat creature should be detected generically');
  assertHasInteraction(combatCopyEquipment, exertExtraCombat,
    it => it.family === 'combat-copy-token→extra-combat-loop' && it.strength === 'combo-critical',
    'combat-copy equipment plus exert extra combat creature should be detected generically');
  assertNoEvent(combatCopyEquipment, vanillaAttacker, 'enable:combat-copy-token→extra-combat-loop');

  const etbSpellCopier = node('ETB Spell Copier', 'Creature — Human Wizard', 'Flash. When this creature enters the battlefield, copy target instant or sorcery spell. You may choose new targets for the copy.');
  const legendaryEtbSpellCopier = node('Legendary ETB Spell Copier', 'Legendary Creature — Human Wizard', 'Flash. When this creature enters the battlefield, copy target instant or sorcery spell. You may choose new targets for the copy.');
  const artifactEtbSpellCopier = node('Artifact ETB Spell Copier', 'Artifact', 'When this artifact enters the battlefield, copy target instant or sorcery spell. You may choose new targets for the copy.');
  const hastyCreatureCopySpell = node('Hasty Creature Copy Spell', 'Sorcery', 'Choose any number of target creatures you control. For each of them, create a token that’s a copy of that creature, except it has haste. Exile those tokens at the beginning of the next end step.');
  const broadHastyCreatureCopySpell = node('Broad Hasty Creature Copy Spell', 'Sorcery', 'Create a token that’s a copy of target creature, except it has haste. Exile it at the beginning of the next end step.');
  const deathCopyCreatureSpell = node('Death-Copy Creature Spell', 'Instant', 'Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature.');
  assertHasCap(etbSpellCopier, 'is-etb-spell-copier');
  assertHasCap(artifactEtbSpellCopier, 'is-etb-spell-copier');
  assertHasCap(hastyCreatureCopySpell, 'is-hasty-creature-copy-spell');
  assertHasCap(hastyCreatureCopySpell, 'hasty-copy-spell-target-creature');
  assertHasCap(broadHastyCreatureCopySpell, 'is-hasty-creature-copy-spell');
  assertHasCap(broadHastyCreatureCopySpell, 'hasty-copy-spell-target-creature');
  assertHasCap(deathCopyCreatureSpell, 'is-death-copy-creature-spell');
  assertHasCap(deathCopyCreatureSpell, 'death-copy-spell-target-creature');
  assertHasInteraction(etbSpellCopier, hastyCreatureCopySpell,
    it => it.family === 'spell-copy-etb→creature-copy-spell-loop' && it.strength === 'combo-critical',
    'ETB spell-copy creature plus hasty creature-copy spell should be combo-critical without names');
  assertHasInteraction(etbSpellCopier, broadHastyCreatureCopySpell,
    it => it.family === 'spell-copy-etb→creature-copy-spell-loop' && it.strength === 'combo-critical',
    'broad hasty creature-copy spell text should still detect an ETB spell-copy creature loop');
  assertHasInteraction(etbSpellCopier, deathCopyCreatureSpell,
    it => it.family === 'death-copy-spell-etb-copy-loop' && it.strength === 'combo-critical',
    'ETB spell-copy creature plus generic death-copy creature spell should be detected without card names');
  assertNoEvent(legendaryEtbSpellCopier, broadHastyCreatureCopySpell, 'enable:spell-copy-etb→creature-copy-spell-loop');
  assertNoEvent(legendaryEtbSpellCopier, deathCopyCreatureSpell, 'enable:death-copy-spell-etb-copy-loop');
  assertNoEvent(artifactEtbSpellCopier, hastyCreatureCopySpell, 'enable:spell-copy-etb→creature-copy-spell-loop');

  const topDrawArtifact = node('Self Top Draw Artifact', 'Artifact', '{T}: Draw a card, then put this artifact on top of its owner’s library.', 1, '{1}');
  const artifactReducer = node('Artifact Spell Reducer', 'Artifact Creature — Vedalken Artificer', 'Artifact spells you cast cost {1} less to cast.');
  const castFromTop = node('Artifact Top Caster', 'Artifact', 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.');
  const historicReducer = node('Historic Spell Reducer', 'Artifact Creature — Construct', 'Historic spells you cast cost {1} less to cast.');
  const flexibleCastFromTop = node('Flexible Artifact Top Caster', 'Artifact', 'You may look at the top card of your library any time. You may cast artifact spells and colorless spells from the top of your library.');
  const attachedCastFromTop = node('Attached Top Caster', 'Legendary Artifact Creature — Equipment', 'You may look at the top card of your library any time. As long as this artifact is attached to a creature, you may play lands and cast spells from the top of your library.');
  const lifePaymentCastFromTop = node('Life Payment Top Caster', 'Legendary Artifact', 'You may look at the top card of your library any time. You may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.');
  const additionalCostCastFromTop = node('Additional Cost Top Caster', 'Legendary Creature', 'You may look at the top card of your library any time. You may cast spells from the top of your library by removing a counter from a creature you control in addition to paying their other costs.');
  const costedTopDrawArtifact = node('Costed Self Top Artifact', 'Artifact', '{1}: Draw a card, then put this artifact on top of its owner’s library.', 1, '{1}');
  assertHasCap(topDrawArtifact, 'is-self-top-draw-artifact');
  assertHasCap(topDrawArtifact, 'self-top-artifact-cost:1');
  assertNoCap(costedTopDrawArtifact, 'is-self-top-draw-artifact');
  assertHasCap(artifactReducer, 'is-artifact-spell-cost-reducer');
  assertHasCap(castFromTop, 'is-artifact-cast-from-top-enabler');
  assertHasCap(historicReducer, 'is-artifact-spell-cost-reducer');
  assertHasCap(flexibleCastFromTop, 'is-artifact-cast-from-top-enabler');
  assertHasCap(attachedCastFromTop, 'is-artifact-cast-from-top-enabler');
  assertHasCap(attachedCastFromTop, 'cast-from-top-requires-attached-creature');
  assertNoCap(lifePaymentCastFromTop, 'is-artifact-cast-from-top-enabler');
  assertHasCap(lifePaymentCastFromTop, 'is-life-payment-cast-from-top-enabler');
  assertNoCap(additionalCostCastFromTop, 'is-artifact-cast-from-top-enabler');
  assertHasCap(additionalCostCastFromTop, 'is-additional-cost-cast-from-top-enabler');
  assertHasInteraction(artifactReducer, topDrawArtifact,
    it => it.family === 'artifact-cost-reduction→top-loop-piece' && it.strength === 'strong',
    'artifact cost reducer should link to a self-top draw artifact as one half of a three-card loop');
  assertHasInteraction(castFromTop, topDrawArtifact,
    it => it.family === 'cast-from-top→top-loop-piece' && it.strength === 'strong',
    'cast-from-top enabler should link to a self-top draw artifact as one half of a three-card loop');
  assertHasInteraction(flexibleCastFromTop, topDrawArtifact,
    it => it.family === 'cast-from-top→top-loop-piece' && it.strength === 'strong',
    'cast-from-top text with artifact plus colorless spells should still link to a top-loop piece');

  const drawDamageEngine = node('Draw Damage Engine', 'Legendary Creature — Wizard', 'Whenever you draw a card, this creature deals 1 damage to any target.');
  const damageDrawAura = node('Damage Draw Aura', 'Enchantment — Aura', 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.');
  const pairedCreatureDamageDraw = node('Paired Creature Damage Draw', 'Creature — Human Scout', 'Soulbond. As long as this creature is paired with another creature, each of those creatures has "Whenever this creature deals damage to an opponent, draw a card."');
  const noncombatDamageDrawPayoff = node('Noncombat Damage Draw Payoff', 'Creature — Dragon Wizard', 'Whenever a source you control deals noncombat damage to an opponent, you draw that many cards.');
  const selfDamageDrawPayoff = node('Self Damage Draw Payoff', 'Creature — Human Wizard', 'Whenever this creature deals damage to an opponent, draw a card.');
  const opponentDrawDamage = node('Opponent Draw Damage Engine', 'Creature — Devil', 'Whenever an opponent draws a card, this creature deals 1 damage to any target.');
  assertHasCap(drawDamageEngine, 'is-draw-to-damage-payoff');
  assertHasCap(drawDamageEngine, 'draw-to-damage-subject:you');
  assertHasCap(damageDrawAura, 'is-damage-to-draw-payoff');
  assertHasCap(damageDrawAura, 'damage-to-draw-scope:enchanted-creature');
  assertHasCap(pairedCreatureDamageDraw, 'is-damage-to-draw-payoff');
  assertHasCap(pairedCreatureDamageDraw, 'damage-to-draw-scope:paired-creature-grant');
  assertHasCap(noncombatDamageDrawPayoff, 'is-damage-to-draw-payoff');
  assertHasCap(noncombatDamageDrawPayoff, 'damage-to-draw-scope:source-you-control');
  assertHasCap(selfDamageDrawPayoff, 'is-damage-to-draw-payoff');
  assertHasCap(selfDamageDrawPayoff, 'damage-to-draw-scope:this-creature');
  assertHasCap(opponentDrawDamage, 'is-draw-to-damage-payoff');
  assertHasCap(opponentDrawDamage, 'draw-to-damage-subject:opp');
  assertHasInteraction(drawDamageEngine, damageDrawAura,
    it => it.family === 'draw-damage-feedback-loop' && it.strength === 'combo-critical',
    'draw-triggered damage plus damage-triggered draw should be detected without card names');
  assertHasInteraction(drawDamageEngine, pairedCreatureDamageDraw,
    it => it.family === 'draw-damage-feedback-loop' && it.strength === 'combo-critical',
    'soulbond-style granted damage draw should apply to a draw-triggered damage creature');
  assertHasInteraction(drawDamageEngine, noncombatDamageDrawPayoff,
    it => it.family === 'draw-damage-feedback-loop' && it.strength === 'combo-critical',
    'draw-triggered damage should feed source-controlled noncombat damage draw payoffs without card names');
  assertNoEvent(opponentDrawDamage, damageDrawAura, 'enable:draw-damage-feedback-loop');
  assertNoEvent(drawDamageEngine, selfDamageDrawPayoff, 'enable:draw-damage-feedback-loop');

  const selfCopyingTargetedSpell = node('Self-Copying Targeted Spell', 'Sorcery', 'Target player discards two cards. That player may copy this spell and may choose a new target for that copy.');
  const magecraftDrainPayoff = node('Magecraft Drain Payoff', 'Creature — Human Druid', 'Magecraft — Whenever you cast or copy an instant or sorcery spell, each opponent loses 1 life and you gain 1 life.');
  const magecraftTokenPayoff = node('Magecraft Token Payoff', 'Creature — Human Wizard', 'Magecraft — Whenever you cast or copy an instant or sorcery spell, create a 1/1 creature token.');
  assertHasCap(selfCopyingTargetedSpell, 'is-self-copying-targeted-spell');
  assertHasCap(magecraftDrainPayoff, 'is-magecraft-drain-payoff');
  assertHasCap(magecraftDrainPayoff, 'magecraft-drain-amount:1');
  assertHasInteraction(selfCopyingTargetedSpell, magecraftDrainPayoff,
    it => it.family === 'self-copy-spell→magecraft-drain-loop' && it.strength === 'combo-critical',
    'self-copying targeted spells plus magecraft drain should be a generic loop family');
  assertNoEvent(selfCopyingTargetedSpell, magecraftTokenPayoff, 'enable:self-copy-spell→magecraft-drain-loop');

  const lifelinkCounterEngine = node('Lifelink Counter Engine', 'Enchantment Creature — God', 'Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control. {1}{W}: Another target creature gains lifelink until end of turn.');
  const counterDamageCreature = node('Counter Damage Creature', 'Artifact Creature — Construct', 'This creature enters with X +1/+1 counters on it. Remove a +1/+1 counter from this creature: It deals 1 damage to any target.');
  const counterDamageArtifact = node('Counter Damage Artifact', 'Artifact', 'This artifact enters with X +1/+1 counters on it. Remove a +1/+1 counter from this artifact: It deals 1 damage to any target.');
  const lifePaidDamageSource = node('Life-Paid Damage Source', 'Artifact', 'Pay 50 life: This artifact deals 50 damage to any target.');
  const tappedLifePaidDamageSource = node('Tapped Life-Paid Damage Source', 'Artifact', '{T}, Pay 50 life: This artifact deals 50 damage to any target.');
  const opponentLossLifegainPayoff = node('Opponent Loss Lifegain Payoff', 'Enchantment', 'Whenever an opponent loses life, you gain that much life.');
  assertHasCap(lifelinkCounterEngine, 'is-lifegain-to-counter-payoff');
  assertHasCap(lifelinkCounterEngine, 'grants-lifelink-to-creature');
  assertHasCap(lifelinkCounterEngine, 'is-lifelink-counter-engine');
  assertHasCap(counterDamageCreature, 'is-counter-to-damage-source');
  assertHasCap(lifePaidDamageSource, 'is-life-paid-damage-source');
  assertHasCap(lifePaidDamageSource, 'life-paid-damage-life-cost:50');
  assertHasCap(lifePaidDamageSource, 'life-paid-damage-amount:50');
  assertHasCap(lifePaidDamageSource, 'life-paid-damage-can-hit-opponent');
  assertNoCap(tappedLifePaidDamageSource, 'is-life-paid-damage-source');
  assertHasInteraction(lifelinkCounterEngine, counterDamageCreature,
    it => it.family === 'lifelink-counter-damage-loop' && it.strength === 'combo-critical' && it.evidence.targetLegal === true,
    'lifelink grant plus lifegain counter trigger should loop with a creature that spends counters for damage');
  assertNoEvent(lifelinkCounterEngine, counterDamageArtifact, 'enable:lifelink-counter-damage-loop');
  assertHasInteraction(lifePaidDamageSource, opponentLossLifegainPayoff,
    it => it.family === 'life-paid-damage-lifeloss-recovery-loop' && it.strength === 'combo-critical',
    'life-paid opponent damage plus opponent-life-loss lifegain should be detected without card names');

  const counterTokenEngine = node('Counter Token Engine', 'Creature — Plant', 'Whenever one or more +1/+1 counters are put on this creature, create a 1/1 green Saproling creature token.');
  const greenEtbCounterGranter = node('Green ETB Counter Granter', 'Creature — Elf', 'Whenever another green creature you control enters, put a +1/+1 counter on target creature.');
  const anyEtbCounterGranter = node('Any ETB Counter Granter', 'Creature — Citizen', 'Alliance — Whenever another creature you control enters, put a +1/+1 counter on target creature you control.');
  const colorlessCounterTokenEngine = node('Colorless Counter Token Engine', 'Creature — Eldrazi', 'Whenever one or more +1/+1 counters are put on this creature, create a 0/1 colorless Eldrazi Spawn creature token.');
  const reminderTextCounterTokenEngine = node('Reminder Text Counter Token Engine', 'Creature — Treefolk', 'Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.) Whenever one or more +1/+1 counters are put on this creature, you may create a 1/1 green Squirrel creature token.');
  const splitCounterAndTokenCard = node('Split Counter And Token Card', 'Creature — Weird', 'Whenever one or more +1/+1 counters are put on this creature, add one mana of any color.\n{X}, {T}: Create a 0/0 green Fractal creature token and put X +1/+1 counters on it.');
  assertHasCap(counterTokenEngine, 'is-counter-to-creature-token-engine');
  assertHasCap(counterTokenEngine, 'counter-token-color:g');
  assertHasCap(reminderTextCounterTokenEngine, 'is-counter-to-creature-token-engine');
  assertHasCap(reminderTextCounterTokenEngine, 'counter-token-color:g');
  assertHasCap(greenEtbCounterGranter, 'is-creature-etb-counter-granter');
  assertHasCap(greenEtbCounterGranter, 'etb-counter-granter-token-color:g');
  assertHasInteraction(counterTokenEngine, greenEtbCounterGranter,
    it => it.family === 'counter-token→etb-counter-loop' && it.strength === 'combo-critical',
    'counter-triggered creature-token engine plus matching ETB counter granter should be detected generically');
  assertHasInteraction(colorlessCounterTokenEngine, anyEtbCounterGranter,
    it => it.family === 'counter-token→etb-counter-loop' && it.strength === 'combo-critical',
    'unrestricted creature-ETB counter granters can use colorless creature tokens');
  assertHasInteraction(reminderTextCounterTokenEngine, greenEtbCounterGranter,
    it => it.family === 'counter-token→etb-counter-loop' && it.strength === 'combo-critical',
    'counter-token engines should survive reminder text before the real counter trigger');
  assertNoCap(splitCounterAndTokenCard, 'is-counter-to-creature-token-engine');
  assertNoEvent(colorlessCounterTokenEngine, greenEtbCounterGranter, 'enable:counter-token→etb-counter-loop');

  const minusCounterDeathSpreader = node('Minus Counter Death Spreader', 'Enchantment', 'Whenever a creature dies, if it had a -1/-1 counter on it, put a -1/-1 counter on target creature.');
  const minusCounterTokenEngine = node('Minus Counter Token Engine', 'Enchantment', 'Whenever you put one or more -1/-1 counters on a creature, create that many 1/1 black Insect creature tokens.');
  const largeMinusCounterTokenEngine = node('Large Minus Counter Token Engine', 'Enchantment', 'Whenever you put one or more -1/-1 counters on a creature, create that many 2/2 black Insect creature tokens.');
  assertHasCap(minusCounterDeathSpreader, 'is-minus-counter-death-spreader');
  assertHasCap(minusCounterTokenEngine, 'is-minus-counter-to-1-1-token-engine');
  assertHasInteraction(minusCounterDeathSpreader, minusCounterTokenEngine,
    it => it.family === 'minus-counter-death→token-loop' && it.strength === 'combo-critical',
    '-1/-1 counter death spreader plus 1/1 counter-token payoff should be detected generically');
  assertNoCap(largeMinusCounterTokenEngine, 'is-minus-counter-to-1-1-token-engine');
  assertNoEvent(minusCounterDeathSpreader, largeMinusCounterTokenEngine, 'enable:minus-counter-death→token-loop');

  const namedCounterTokenEngine = node('Named Counter Token Engine', 'Creature — Treefolk', 'Whenever one or more +1/+1 counters are put on Named Counter Token Engine, create a 1/1 green Squirrel creature token.');
  const creatureEtbLifegain = node('Creature ETB Lifegain Payoff', 'Creature — Cleric', 'Whenever another creature enters the battlefield under your control, you gain 1 life.');
  const oncePerTurnCreatureEtbLifegain = node('Once-Per-Turn ETB Lifegain Payoff', 'Creature — Cleric', 'Whenever another creature enters the battlefield under your control, you gain 1 life. This ability triggers only once each turn.');
  assertHasCap(namedCounterTokenEngine, 'is-counter-to-creature-token-engine');
  assertHasCap(creatureEtbLifegain, 'is-creature-etb-lifegain-payoff');
  assertNoCap(oncePerTurnCreatureEtbLifegain, 'is-creature-etb-lifegain-payoff');
  assertHasCap(lifelinkCounterEngine, 'lifegain-counter-target:creature-or-enchantment');

  const deathUntapPinger = node('Death Untap Pinger', 'Creature — Goblin', "This creature doesn't untap during your untap step. Whenever a creature dies, untap this creature. {T}: This creature deals 1 damage to any target.");
  const deathtouchEquipment = node('Deathtouch Equipment', 'Artifact — Equipment', 'Equipped creature has deathtouch. Equip {2}');
  const freePingEquipment = node('Free Ping Equipment', 'Artifact — Equipment', 'Equipped creature has "{T}: This creature deals 1 damage to any target." Equip {3}');
  const deathUntapEquipment = node('Death Untap Equipment', 'Artifact — Equipment', 'Equipped creature has "Whenever a creature dies, untap this creature." Equip {4}');
  const oncePerTurnDeathUntapEquipment = node('Once-Per-Turn Death Untap Equipment', 'Artifact — Equipment', 'Equipped creature has "Whenever a creature dies, untap this creature. This ability triggers only once each turn." Equip {4}');
  const costedPingEquipment = node('Costed Ping Equipment', 'Artifact — Equipment', 'Equipped creature has "{2}, {T}: This creature deals 1 damage to any target." Equip {4}');
  assertHasCap(deathUntapPinger, 'has-free-creature-ping');
  assertHasCap(deathUntapPinger, 'has-death-untap-self');
  assertHasCap(deathtouchEquipment, 'grants-deathtouch-to-equipped-creature');
  assertHasCap(freePingEquipment, 'grants-free-ping-to-equipped-creature');
  assertHasCap(deathUntapEquipment, 'grants-death-untap-to-equipped-creature');
  assertNoCap(oncePerTurnDeathUntapEquipment, 'grants-death-untap-to-equipped-creature');
  assertNoCap(costedPingEquipment, 'grants-free-ping-to-equipped-creature');

  const recursiveBody = node('Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard.', 1, '{B}');
  const conditionalRecursiveBody = node('Conditional Recursive Body', 'Creature — Zombie', 'You may cast this card from your graveyard as long as you control another creature.', 1, '{B}');
  const manaSacOutlet = node('Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add one mana of any color.', 3);
  const creatureManaSacOutlet = node('Creature Mana Sac Outlet', 'Creature — Cleric', 'Sacrifice a creature: Add one mana of any color.', 3);
  const expensiveRecursiveBody = node('Expensive Recursive Body', 'Creature — Skeleton', 'You may cast this card from your graveyard.', 3);
  const coloredRecursiveBody = node('Colored Recursive Body', 'Creature — Skeleton', '{1}{B}: Return this creature from your graveyard to the battlefield.', 2);
  const colorlessSacOutlet = node('Colorless Mana Sac Outlet', 'Artifact', 'Sacrifice a creature: Add {C}{C}.', 3);
  const recursiveExileCreature = node('Recursive Exile Creature', 'Creature — Elemental', 'You may cast this card from exile.', 3, '{2}{R}');
  const conditionalExileCreature = node('Conditional Exile Creature', 'Creature — Elemental', 'You may cast this card from exile if it was foretold.', 3, '{2}{R}');
  const creatureExileCastManaOutlet = node('Creature Exile Cast Mana Outlet', 'Enchantment', "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.", 3);
  assertHasCap(recursiveBody, 'is-recursive-body');
  assertHasCap(recursiveBody, 'recursive-body-cost:1');
  assertHasCap(recursiveBody, 'recursive-body-color-b:1');
  assertHasCap(conditionalRecursiveBody, 'recursive-body-requires-another-creature');
  assertHasCap(manaSacOutlet, 'is-mana-sac-outlet');
  assertHasCap(manaSacOutlet, 'sac-outlet-mana-produced:1');
  assertHasCap(manaSacOutlet, 'sac-outlet-mana-any:1');
  assertHasCap(coloredRecursiveBody, 'recursive-body-color-b:1');
  assertHasCap(colorlessSacOutlet, 'sac-outlet-mana-c:2');
  assertHasCap(recursiveExileCreature, 'is-recursive-exile-cast-body');
  assertHasCap(recursiveExileCreature, 'recursive-exile-body-cost:3');
  assertHasCap(recursiveExileCreature, 'recursive-exile-body-generic-cost:2');
  assertHasCap(recursiveExileCreature, 'recursive-exile-body-color-r:1');
  assertNoCap(conditionalExileCreature, 'is-recursive-exile-cast-body');
  assertHasCap(conditionalExileCreature, 'is-origin-bound-exile-cast-body');
  assertHasCap(creatureExileCastManaOutlet, 'is-creature-exile-cast-mana-outlet');
  assertHasCap(creatureExileCastManaOutlet, 'creature-exile-cast-mana-surplus:1');
  assertHasInteraction(recursiveBody, manaSacOutlet,
    it => it.family === 'recursive-body-sacrifice-mana-loop' && it.strength === 'combo-critical' && it.evidence.bodyCost === 1,
    'recursive body plus mana sacrifice outlet should be detected when mana covers recursion cost');
  assertHasInteraction(creatureExileCastManaOutlet, recursiveExileCreature,
    it => it.family === 'exile-recast-creature-mana-loop' && it.strength === 'combo-critical',
    'creature-only exile mana outlet plus creature castable from exile should be detected without card names');
  assertNoEvent(creatureExileCastManaOutlet, conditionalExileCreature, 'enable:exile-recast-creature-mana-loop');
  assertHasInteraction(conditionalRecursiveBody, creatureManaSacOutlet,
    it => it.family === 'recursive-body-sacrifice-mana-loop' && it.strength === 'combo-critical' && it.evidence.recursionPreconditionSatisfied === true,
    'recursive body with another-creature precondition should require another creature in the package');
  assertNoEvent(conditionalRecursiveBody, manaSacOutlet, 'enable:recursive-body-sacrifice-mana-loop');
  const faceCrossingCreatureOutlet = faceAwareNode({
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
  });
  assertHasCap(faceCrossingCreatureOutlet, 'is-mana-sac-outlet');
  assertHasCap(faceCrossingCreatureOutlet, 'is-creature-permanent');
  assertNoEvent(conditionalRecursiveBody, faceCrossingCreatureOutlet, 'enable:recursive-body-sacrifice-mana-loop');
  assertNoEvent(expensiveRecursiveBody, manaSacOutlet, 'enable:recursive-body-sacrifice-mana-loop');
  assertNoEvent(coloredRecursiveBody, colorlessSacOutlet, 'enable:recursive-body-sacrifice-mana-loop');

  const colorlessManaAmplifier = node('Colorless Mana Amplifier', 'Artifact', 'Whenever you tap a permanent for {C}, add an additional {C}.');
  const anyTypeNonlandManaAmplifier = node('Any-Type Nonland Mana Amplifier', 'Legendary Creature — Druid', 'Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.');
  const breakEvenSelfUntapperForAmplifier = node('Break-Even Self Untapper With Colorless', 'Artifact', '{T}: Add {C}{C}{C}. {3}: Untap this artifact.');
  const coloredSelfUntapper = node('Colored Self Untapper', 'Creature — Elf', '{T}: Add {G}{G}{G}. {3}: Untap this creature.');
  assertHasCap(colorlessManaAmplifier, 'is-colorless-mana-amplifier');
  assertHasCap(anyTypeNonlandManaAmplifier, 'is-colorless-mana-amplifier');
  assertHasCap(breakEvenSelfUntapperForAmplifier, 'produces-colorless-mana');
  assertHasInteraction(colorlessManaAmplifier, breakEvenSelfUntapperForAmplifier,
    it => it.family === 'self-untap-mana-loop' && it.strength === 'combo-critical' && it.evidence.amplification === 1,
    'static colorless amplifier should turn a break-even colorless self-untapper into a loop');
  assertHasInteraction(anyTypeNonlandManaAmplifier, breakEvenSelfUntapperForAmplifier,
    it => it.family === 'self-untap-mana-loop' && it.strength === 'combo-critical' && it.evidence.amplification === 1,
    'any-type nonland permanent mana amplifier should turn a colorless self-untapper positive when the permanent produced colorless mana');
  assertNoEvent(colorlessManaAmplifier, coloredSelfUntapper, 'enable:self-untap-mana-loop');

  const millToLossPayoff = node('Mill To Life Loss Payoff', 'Enchantment', "Whenever a card is put into an opponent's graveyard from anywhere, that player loses 1 life and you gain 1 life.");
  const lossToMillPayoff = node('Life Loss To Mill Payoff', 'Enchantment', 'Whenever an opponent loses life, that player mills that many cards.');
  assertHasCap(millToLossPayoff, 'is-mill-to-lifeloss-payoff');
  assertHasCap(lossToMillPayoff, 'is-lifeloss-to-mill-payoff');
  assertHasInteraction(millToLossPayoff, lossToMillPayoff,
    it => it.family === 'mill-lifeloss-feedback-loop' && it.strength === 'combo-critical',
    'reciprocal mill/life-loss text should be detected without card names');

  const massOpponentDraw = node('Opponent Half-Library Draw', 'Sorcery', 'Target opponent draws cards equal to half the number of cards in their library, rounded up.');
  const opponentDrawPunisher = node('Opponent Draw Punisher', 'Enchantment', 'Whenever an opponent draws a card, that player loses 1 life.');
  const compoundOpponentDrawPunisher = node('Compound Opponent Draw Punisher', 'Creature — Archer', 'When this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target.');
  const smallOpponentDraw = node('Small Opponent Draw', 'Sorcery', 'Target opponent draws a card.');
  const repeatableTableDraw = node('Repeatable Table Draw', 'Creature — Human Knight', 'At the beginning of each player\'s upkeep, that player draws a card and loses 1 life.');
  const additionalDrawStepDraw = node('Additional Draw Step Draw', 'Enchantment', 'At the beginning of each player\'s draw step, that player draws an additional card.');
  assertHasCap(massOpponentDraw, 'is-mass-opponent-draw-source');
  assertHasCap(repeatableTableDraw, 'is-repeatable-opponent-draw-source');
  assertHasCap(additionalDrawStepDraw, 'is-repeatable-opponent-draw-source');
  assertHasCap(opponentDrawPunisher, 'is-opponent-draw-punisher');
  assertHasCap(compoundOpponentDrawPunisher, 'is-opponent-draw-punisher');
  assertHasCap(compoundOpponentDrawPunisher, 'opponent-draw-punisher-damage:1');
  assertHasInteraction(repeatableTableDraw, opponentDrawPunisher,
    it => it.family === 'opponent-draw→punisher' && it.strength === 'strong',
    'repeatable table draw should feed opponent-draw punishers as a deck engine');
  assertHasInteraction(additionalDrawStepDraw, compoundOpponentDrawPunisher,
    it => it.family === 'opponent-draw→punisher' && it.strength === 'strong',
    'additional draw-step draw should feed damage-based opponent-draw punishers');
  assertHasInteraction(massOpponentDraw, opponentDrawPunisher,
    it => it.family === 'opponent-draw-punisher-win' && it.strength === 'combo-critical',
    'large opponent draw source plus opponent draw punisher should be a finite threshold win signal');
  assertHasInteraction(massOpponentDraw, compoundOpponentDrawPunisher,
    it => it.family === 'opponent-draw-punisher-win' && it.strength === 'combo-critical',
    'compound ETB/opponent-draw trigger text should preserve the opponent-draw punisher signal');
  assertNoEvent(smallOpponentDraw, opponentDrawPunisher, 'enable:opponent-draw-punisher-win');
  assertNoEvent(smallOpponentDraw, opponentDrawPunisher, 'enable:opponent-draw→punisher');

  const halfLibraryMill = node('Half-Library Mill', 'Sorcery', 'Target player mills half their library, rounded up.');
  const millMultiplier = node('Mill Multiplier', 'Enchantment', 'If an opponent would mill one or more cards, that player mills twice that many cards instead.');
  const delayedMillEqualizer = node('Delayed Mill Equalizer', 'Enchantment — Aura Curse', "Enchant player At the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.");
  const smallMill = node('Small Mill', 'Sorcery', 'Target player mills three cards.');
  assertHasCap(halfLibraryMill, 'is-half-library-mill-source');
  assertHasCap(millMultiplier, 'is-mill-multiplier');
  assertHasCap(delayedMillEqualizer, 'is-delayed-same-turn-mill-payoff');
  assertHasInteraction(halfLibraryMill, millMultiplier,
    it => it.family === 'mill-multiplier-finite-mill' && it.strength === 'combo-critical',
    'half-library mill plus mill multiplier should be a finite mill threshold signal');
  assertHasInteraction(halfLibraryMill, delayedMillEqualizer,
    it => it.family === 'delayed-mill-equalizer-finite-mill' && it.strength === 'combo-critical',
    'half-library mill plus delayed same-turn mill payoff should be a finite mill threshold signal');
  assertNoEvent(smallMill, millMultiplier, 'enable:mill-multiplier-finite-mill');
  assertNoEvent(smallMill, delayedMillEqualizer, 'enable:delayed-mill-equalizer-finite-mill');

  const etbCreatureBlinker = node('ETB Creature Blinker', 'Creature — Angel', 'Flying When this creature enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.');
  const etbPermanentBlinker = node('ETB Permanent Blinker', 'Creature — Cat Beast', 'When this creature enters the battlefield, exile another target permanent you control, then return that card to the battlefield under its owner’s control.');
  const etbArtifactBlinker = node('ETB Artifact Blinker', 'Artifact', 'When this artifact enters the battlefield, exile another target creature you control, then return that card to the battlefield under its owner’s control.');
  assertHasCap(etbCreatureBlinker, 'is-etb-blink');
  assertHasCap(etbPermanentBlinker, 'etb-blinks-permanent');
  assertHasInteraction(etbCreatureBlinker, etbPermanentBlinker,
    it => it.family === 'mutual-etb-blink-reset-loop' && it.strength === 'combo-critical',
    'two ETB blink permanents should only form a mutual reset loop when each can target the other');
  assertNoEvent(etbCreatureBlinker, etbArtifactBlinker, 'enable:mutual-etb-blink-reset-loop');
  const faceCrossingEtbBlinker = faceAwareNode({
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
  });
  assertHasCap(faceCrossingEtbBlinker, 'is-etb-blink');
  assertHasCap(faceCrossingEtbBlinker, 'is-creature-permanent');
  assertNoEvent(etbCreatureBlinker, faceCrossingEtbBlinker, 'enable:mutual-etb-blink-reset-loop');

  const tokenReplacementOutlet = node('Creature-Token Replacement Outlet', 'Legendary Creature — Squirrel Warrior', 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.');
  const deathManaPayoff = node('Death Mana Payoff', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.');
  const replacementWithoutOutlet = node('Creature-Token Replacement Only', 'Enchantment', 'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.');
  const lifePaidTreasureSacOutlet = node('Life-Paid Treasure Sac Outlet', 'Creature — Zombie Advisor', 'Pay 1 life, Sacrifice another creature: Create a Treasure token.');
  assertHasCap(tokenReplacementOutlet, 'is-token-to-creature-token-replacer');
  assertHasCap(tokenReplacementOutlet, 'is-token-replacement-modifier');
  assertHasCap(tokenReplacementOutlet, 'is-creature-sac-outlet');
  assertHasCap(deathManaPayoff, 'is-death-mana-payoff');
  assertHasCap(lifePaidTreasureSacOutlet, 'is-life-paid-treasure-sac-outlet');
  assertHasCap(lifePaidTreasureSacOutlet, 'life-sac-outlet-life-cost:1');
  assertHasCap(lifePaidTreasureSacOutlet, 'life-sac-outlet-mana-produced:1');
  assertHasInteraction(tokenReplacementOutlet, deathManaPayoff,
    it => it.family === 'token-replacement-sacrifice-mana-loop' && it.strength === 'combo-critical',
    'token replacement on a creature sac outlet plus death-mana payoff should be detected as a loop');
  assertNoEvent(replacementWithoutOutlet, deathManaPayoff, 'enable:token-replacement-sacrifice-mana-loop');

  const graveyardEscapeEnabler = node('Graveyard Escape Enabler', 'Enchantment', "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exiling three other cards from your graveyard.");
  const discardHandManaSource = node('Discard-Hand Mana Source', 'Artifact', '{T}, Discard your hand, Sacrifice this artifact: Add three mana of any one color.', 0, '{0}');
  const sevenCardWheel = node('Seven-Card Wheel', 'Sorcery', 'Each player discards their hand, then draws seven cards.', 3, '{2}{R}');
  const stormMillSpell = node('Storm Mill Spell', 'Sorcery', 'Target player mills three cards.\nStorm', 2, '{1}{U}');
  const permanentWheel = node('Permanent Wheel', 'Artifact', '{T}, Sacrifice this artifact: Each player discards their hand, then draws seven cards.', 3, '{3}');
  assertHasCap(graveyardEscapeEnabler, 'is-graveyard-escape-enabler');
  assertHasCap(graveyardEscapeEnabler, 'graveyard-escape-extra-card-cost:3');
  assertHasCap(discardHandManaSource, 'is-discard-hand-sac-mana-source');
  assertHasCap(discardHandManaSource, 'discard-hand-sac-mana-produced:3');
  assertHasCap(discardHandManaSource, 'discard-hand-sac-mana-any:3');
  assertHasCap(discardHandManaSource, 'discard-hand-sac-source-cost:0');
  assertHasCap(sevenCardWheel, 'is-wheel-draw-discard-spell');
  assertHasCap(sevenCardWheel, 'wheel-draw-count:7');
  assertHasCap(stormMillSpell, 'is-mill-source');
  assertHasCap(stormMillSpell, 'is-mill-spell');
  assertHasCap(stormMillSpell, 'mill-count:3');
  assertHasCap(stormMillSpell, 'mill-spell-cost:2');
  assertHasCap(stormMillSpell, 'has-storm');
  assertNoCap(permanentWheel, 'is-wheel-draw-discard-spell');
  assertHasFamily(graveyardEscapeEnabler, sevenCardWheel, 'escape-wheel-mana-loop');
  assertHasFamily(graveyardEscapeEnabler, discardHandManaSource, 'escape-wheel-mana-loop');
  assertHasFamily(discardHandManaSource, sevenCardWheel, 'escape-wheel-mana-loop');

  const buybackSpellCopy = node('Buyback Spell Copy', 'Instant', 'Buyback {3}. Copy target instant or sorcery spell. You may choose new targets for the copy.', 3, '{1}{R}{R}');
  const fiveManaRitual = node('Five-Mana Ritual', 'Instant', 'Add {R}{R}{R}{R}{R}.', 3, '{2}{R}');
  const redSpellReducer = node('Red Spell Reducer', 'Artifact', 'Red spells you cast cost {1} less to cast.');
  const spellcastManaPayoff = node('Spellcast Mana Payoff', 'Legendary Creature — God', 'Whenever you cast a spell, add {R}.');
  assertHasCap(buybackSpellCopy, 'is-buyback-spell-copy');
  assertHasCap(buybackSpellCopy, 'buyback-copy-cost:6');
  assertHasCap(fiveManaRitual, 'is-ritual-mana-spell');
  assertHasCap(fiveManaRitual, 'ritual-spell-mana-produced:5');
  assertHasCap(redSpellReducer, 'is-spell-cost-reducer');
  assertHasCap(redSpellReducer, 'spell-cost-reduction:1');
  assertHasCap(redSpellReducer, 'spell-cost-reduction-scope:r');
  assertHasCap(spellcastManaPayoff, 'is-spellcast-mana-payoff');
  assertHasCap(spellcastManaPayoff, 'spellcast-mana-produced:1');
  assertHasFamily(buybackSpellCopy, fiveManaRitual, 'buyback-copy-ritual-loop');
  assertHasFamily(redSpellReducer, buybackSpellCopy, 'buyback-copy-ritual-loop');
  assertHasFamily(spellcastManaPayoff, buybackSpellCopy, 'buyback-copy-ritual-loop');

  const permanentEtbHandDropper = node('Permanent ETB Hand Dropper', 'Legendary Creature — Spirit', "Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.");
  const selfBounceLand = node('Self-Bounce Land', 'Land', "This land enters tapped. When this land enters, return a land you control to its owner's hand. {T}: Add {G}{U}.");
  const landfallTreasurePayoff = node('Landfall Treasure Payoff', 'Creature — Scout', 'Landfall — Whenever a land you control enters, create a Food token or a Treasure token.');
  const landfallManaPayoff = node('Landfall Mana Payoff', 'Creature — Snake', 'Landfall — Whenever a land you control enters, add one mana of any color.');
  assertHasCap(permanentEtbHandDropper, 'is-permanent-etb-hand-dropper');
  assertHasCap(selfBounceLand, 'is-self-bounce-land');
  assertHasCap(landfallTreasurePayoff, 'is-landfall-payoff');
  assertHasCap(landfallTreasurePayoff, 'is-landfall-token-payoff');
  assertHasCap(landfallTreasurePayoff, 'is-landfall-treasure-payoff');
  assertHasCap(landfallTreasurePayoff, 'landfall-token-mana-produced:1');
  assertHasCap(landfallManaPayoff, 'is-landfall-mana-payoff');
  assertHasCap(landfallManaPayoff, 'landfall-mana-produced:1');
  assertHasFamily(permanentEtbHandDropper, selfBounceLand, 'kodama-bounce-land-landfall-loop');
  assertHasFamily(selfBounceLand, landfallTreasurePayoff, 'kodama-bounce-land-landfall-loop');

  const genericTribeCountDruid = node('Generic Tribe Count Druid', 'Creature — Elf Druid', '{T}: Add {G} for each Elf you control.');
  const genericCreatureCountDruid = node('Generic Creature Count Druid', 'Creature — Druid', '{T}: Add {G} for each creature you control.');
  const globalCreatureCountDruid = node('Global Creature Count Druid', 'Creature — Druid', '{T}: Add {G} for each creature on the battlefield.');
  const opponentCountDruid = node('Opponent Count Druid', 'Creature — Druid', '{T}: Add {G} for each creature target opponent controls.');
  const modalUntapEngine = node('Generic Modal Untap Engine', 'Artifact', '{1}: Untap this artifact. {3}, {T}: Untap target creature. {4}, {T}: Draw a card. {2}, {T}: You gain 1 life.');
  const oneShotUntap = node('One-Shot Untap Spell', 'Instant', 'Untap target creature. Draw a card.');
  const attachedUntapAura = node('Attached Untap Aura', 'Enchantment — Aura', 'Enchant creature {U}: Untap enchanted creature.');
  const untapSymbolEquipment = node('Untap Symbol Equipment', 'Artifact — Equipment', 'Equipped creature has "{3}, {Q}: This creature gets +2/+2 until end of turn." Equip {0}');
  assertHasCap(genericTribeCountDruid, 'is-variable-board-count-mana-source');
  assertHasCap(genericTribeCountDruid, 'is-variable-creature-mana-source');
  assertHasCap(genericTribeCountDruid, 'variable-mana-counts:elf');
  assertHasCap(genericTribeCountDruid, 'variable-mana-unit-g:1');
  assertHasCap(genericCreatureCountDruid, 'variable-mana-counts:creature');
  assertHasCap(globalCreatureCountDruid, 'is-variable-board-count-mana-source');
  assertHasCap(globalCreatureCountDruid, 'board-count-scope:creature');
  assertNoCap(opponentCountDruid, 'is-variable-board-count-mana-source');
  assertNoCap(opponentCountDruid, 'is-variable-creature-mana-source');
  assertHasCap(modalUntapEngine, 'is-repeatable-creature-untap-ability');
  assertHasCap(modalUntapEngine, 'creature-untap-ability-cost:3');
  assertHasCap(modalUntapEngine, 'creature-untap-ability-taps-source');
  assertHasCap(modalUntapEngine, 'self-untap-cost:1');
  assertHasCap(modalUntapEngine, 'is-repeatable-tap-draw-ability');
  assertHasCap(modalUntapEngine, 'tap-draw-ability-cost:4');
  assertHasCap(modalUntapEngine, 'is-repeatable-tap-lifegain-ability');
  assertHasCap(modalUntapEngine, 'tap-lifegain-ability-cost:2');
  assertNoCap(oneShotUntap, 'is-repeatable-creature-untap-ability');
  assertHasCap(attachedUntapAura, 'is-attached-creature-untapper');
  assertHasCap(attachedUntapAura, 'attached-creature-untap-cost:1');
  assertHasCap(untapSymbolEquipment, 'is-attached-creature-untapper');
  assertHasCap(untapSymbolEquipment, 'attached-creature-untap-cost:3');
  assertHasCap(untapSymbolEquipment, 'attached-untap-adds-pump');
  assertHasFamily(genericTribeCountDruid, modalUntapEngine, 'variable-board-count-mana-loop');
  assertHasFamily(genericTribeCountDruid, attachedUntapAura, 'variable-board-count-mana-loop');

  const genericExtraCombatActivator = node('Generic Extra Combat Activator', 'Enchantment', '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase followed by an additional main phase. Activate only as a sorcery.');
  const combatTreasureEquipment = node('Combat Treasure Equipment', 'Artifact — Equipment', 'Equipped creature has trample and "Whenever this creature deals combat damage to a player, create that many Treasure tokens." Equip {3}');
  const combatLandUntapEquipment = node('Combat Land Untap Equipment', 'Artifact — Equipment', 'Whenever equipped creature deals combat damage to a player, untap all lands you control.');
  const attackLandUntapAura = node('Attack Land Untap Aura', 'Enchantment — Aura', 'Enchant creature Whenever enchanted creature attacks, untap all lands you control.');
  const fixedTreasureSaboteur = node('Fixed Treasure Saboteur', 'Creature — Rogue', 'Whenever this creature deals combat damage to a player, create a Treasure token.');
  const randomTreasureDragon = node('Random Treasure Dragon', 'Creature — Dragon', 'Whenever this creature deals combat damage to a player, roll a d20. Create a number of Treasure tokens equal to the result.');
  const extraCombatWithoutUntap = node('Extra Combat Without Untap', 'Enchantment', '{3}{R}{R}: After this phase, there is an additional combat phase. Activate only as a sorcery.');
  const extraCombatWithoutMain = node('Extra Combat Without Main', 'Enchantment', '{3}{R}{R}: Untap all creatures you control. After this phase, there is an additional combat phase. Activate only as a sorcery.');
  const attackTriggeredExtraCombat = node('Attack Triggered Extra Combat', 'Creature — Dragon', 'Whenever this creature attacks, you may pay {5}{R}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase.');
  const tappedArtifactExtraCombat = node('Tapped Artifact Extra Combat', 'Artifact', '{3}{R}{R}, {T}: Untap all creatures you control. After this phase, there is an additional combat phase followed by an additional main phase.');
  assertHasCap(genericExtraCombatActivator, 'is-repeatable-extra-combat-engine');
  assertHasCap(genericExtraCombatActivator, 'is-repeatable-extra-combat-activator');
  assertHasCap(genericExtraCombatActivator, 'extra-combat-cost:5');
  assertHasCap(genericExtraCombatActivator, 'extra-combat-color-r:2');
  assertHasCap(genericExtraCombatActivator, 'extra-combat-untaps-creatures');
  assertHasCap(genericExtraCombatActivator, 'extra-combat-activation-window:sorcery');
  assertHasCap(genericExtraCombatActivator, 'extra-combat-adds-main-phase');
  assertHasCap(combatTreasureEquipment, 'is-combat-damage-treasure-engine');
  assertHasCap(combatTreasureEquipment, 'combat-damage-treasure-per-damage:1');
  assertHasCap(combatTreasureEquipment, 'combat-resource-requires-connect');
  assertHasCap(combatLandUntapEquipment, 'is-combat-damage-land-untap-engine');
  assertHasCap(attackLandUntapAura, 'is-attack-land-untap-engine');
  assertHasCap(fixedTreasureSaboteur, 'is-fixed-combat-damage-treasure-source');
  assertNoCap(fixedTreasureSaboteur, 'is-combat-damage-treasure-engine');
  assertHasCap(randomTreasureDragon, 'is-random-combat-damage-treasure-source');
  assertNoCap(randomTreasureDragon, 'is-combat-damage-treasure-engine');
  assertHasCap(extraCombatWithoutMain, 'is-repeatable-extra-combat-activator');
  assertHasCap(extraCombatWithoutMain, 'extra-combat-untaps-creatures');
  assertNoCap(extraCombatWithoutMain, 'extra-combat-adds-main-phase');
  assertHasCap(attackTriggeredExtraCombat, 'is-repeatable-extra-combat-attack-trigger');
  assertHasCap(tappedArtifactExtraCombat, 'is-repeatable-extra-combat-engine');
  assertHasCap(tappedArtifactExtraCombat, 'extra-combat-activation-taps-source');
  assertHasCap(tappedArtifactExtraCombat, 'extra-combat-untaps-activating-creature');
  assertHasFamily(combatTreasureEquipment, genericExtraCombatActivator, 'combat-resource→extra-combat-loop');
  assertHasFamily(combatLandUntapEquipment, genericExtraCombatActivator, 'combat-resource→extra-combat-loop');
  assertHasFamily(attackLandUntapAura, genericExtraCombatActivator, 'combat-resource→extra-combat-loop');
  assertNoFamily(combatTreasureEquipment, extraCombatWithoutUntap, 'combat-resource→extra-combat-loop');
  assertNoFamily(combatTreasureEquipment, extraCombatWithoutMain, 'combat-resource→extra-combat-loop');
  assertNoFamily(combatTreasureEquipment, attackTriggeredExtraCombat, 'combat-resource→extra-combat-loop');
  assertNoFamily(combatTreasureEquipment, tappedArtifactExtraCombat, 'combat-resource→extra-combat-loop');

  const artifactSacrificeExtraTurnEngine = node('Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one.');
  const oncePerTurnArtifactSacrificeExtraTurnEngine = node('Once Per Turn Artifact Sacrifice Extra-Turn Engine', 'Artifact', '{T}, Sacrifice five artifacts: Take an extra turn after this one. Activate only once each turn.');
  const upkeepArtifactTokenEngine = node('Upkeep Artifact Token Engine', 'Artifact Creature — Thopter', 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens.');
  const oncePerTurnUpkeepArtifactTokenEngine = node('Once Per Turn Upkeep Artifact Token Engine', 'Artifact Creature — Thopter', 'At the beginning of your upkeep, create five 1/1 colorless Thopter artifact creature tokens. This ability triggers only once each turn.');
  const fourArtifactTokenEngine = node('Four Artifact Token Engine', 'Artifact', 'At the beginning of your upkeep, create four Clue tokens.');
  const creatureTokenEngine = node('Creature Token Engine', 'Creature', 'At the beginning of your upkeep, create five 1/1 white Soldier creature tokens.');
  const etbArtifactTokenEngine = node('ETB Artifact Token Engine', 'Artifact', 'When this artifact enters, create five Treasure tokens.');
  const endStepArtifactTokenEngine = node('End Step Artifact Token Engine', 'Artifact', 'At the beginning of your end step, create five Treasure tokens.');
  assertHasCap(artifactSacrificeExtraTurnEngine, 'is-artifact-sacrifice-extra-turn-engine');
  assertHasCap(artifactSacrificeExtraTurnEngine, 'artifact-extra-turn-sac-count:5');
  assertNoCap(oncePerTurnArtifactSacrificeExtraTurnEngine, 'is-artifact-sacrifice-extra-turn-engine');
  assertHasCap(upkeepArtifactTokenEngine, 'is-artifact-token-producer');
  assertHasCap(upkeepArtifactTokenEngine, 'is-turn-cycle-artifact-token-engine');
  assertHasCap(upkeepArtifactTokenEngine, 'artifact-tokens-produced:5');
  assertHasCap(upkeepArtifactTokenEngine, 'artifact-tokens-per-turn:5');
  assertNoCap(oncePerTurnUpkeepArtifactTokenEngine, 'is-turn-cycle-artifact-token-engine');
  assertHasCap(fourArtifactTokenEngine, 'artifact-tokens-per-turn:4');
  assertNoCap(creatureTokenEngine, 'is-artifact-token-producer');
  assertHasCap(etbArtifactTokenEngine, 'artifact-tokens-produced:5');
  assertNoCap(etbArtifactTokenEngine, 'is-turn-cycle-artifact-token-engine');
  assertHasCap(endStepArtifactTokenEngine, 'artifact-tokens-produced:5');
  assertNoCap(endStepArtifactTokenEngine, 'is-turn-cycle-artifact-token-engine');
  assertHasFamily(upkeepArtifactTokenEngine, artifactSacrificeExtraTurnEngine, 'artifact-token→extra-turn-loop');
  assertNoFamily(fourArtifactTokenEngine, artifactSacrificeExtraTurnEngine, 'artifact-token→extra-turn-loop');
  assertNoFamily(creatureTokenEngine, artifactSacrificeExtraTurnEngine, 'artifact-token→extra-turn-loop');
  assertNoFamily(etbArtifactTokenEngine, artifactSacrificeExtraTurnEngine, 'artifact-token→extra-turn-loop');
  assertNoFamily(oncePerTurnUpkeepArtifactTokenEngine, artifactSacrificeExtraTurnEngine, 'artifact-token→extra-turn-loop');
  assertNoFamily(endStepArtifactTokenEngine, artifactSacrificeExtraTurnEngine, 'artifact-token→extra-turn-loop');
  assertNoFamily(upkeepArtifactTokenEngine, oncePerTurnArtifactSacrificeExtraTurnEngine, 'artifact-token→extra-turn-loop');

  const combatSacrificeAura = node(
    'Combat Sacrifice Aura',
    'Enchantment — Aura',
    'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. Untap all creatures you control. After this phase, there is an additional combat phase.'
  );
  const breathShapedAura = node(
    'Breath-Shaped Aura',
    'Enchantment — Aura',
    'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice it and attach Breath-Shaped Aura to a creature you control. If you do, untap all creatures you control and after this phase, there is an additional combat phase.'
  );
  const freshCombatCarrierSource = node(
    'Fresh Combat Carrier Source',
    'Creature — Human Warrior',
    'At the beginning of combat on your turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.'
  );
  const auraWithoutReattach = node(
    'Combat Sacrifice Aura Without Reattach',
    'Enchantment — Aura',
    'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature. Untap all creatures you control. After this phase, there is an additional combat phase.'
  );
  const auraWithoutUntap = node(
    'Combat Sacrifice Aura Without Untap',
    'Enchantment — Aura',
    'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. After this phase, there is an additional combat phase.'
  );
  const oncePerTurnAura = node(
    'Once Per Turn Combat Sacrifice Aura',
    'Enchantment — Aura',
    'Enchant creature\nWhenever enchanted creature deals combat damage to a player, sacrifice that creature and attach this Aura to another target creature you control. Untap all creatures you control. After this phase, there is an additional combat phase. This ability triggers only once each turn.'
  );
  const staleCarrierSource = node(
    'Stale Carrier Source',
    'Creature — Human Soldier',
    'At the beginning of combat on your turn, create a 1/1 white Soldier creature token.'
  );
  const wrongTimingCarrierSource = node(
    'Wrong Timing Carrier Source',
    'Creature — Human Soldier',
    'Whenever this creature attacks, create a 1/1 red Warrior creature token with haste.'
  );
  const nonHastyCarrierSource = node(
    'Non-Hasty Carrier Source',
    'Creature — Human Soldier',
    'At the beginning of combat on your turn, create a 1/1 red Warrior creature token. It attacks this combat if able.'
  );
  const tappedAttackingCarrierSource = node(
    'Tapped Attacking Carrier Source',
    'Creature — Human Soldier',
    'At the beginning of combat on your turn, create a 1/1 red Warrior creature token tapped and attacking.'
  );
  const hastyTappedAttackingCarrierSource = node(
    'Hasty Tapped Attacking Carrier Source',
    'Creature — Human Soldier',
    'At the beginning of combat on your turn, create a 1/1 red Warrior creature token tapped and attacking. That token gains haste.'
  );
  const conditionalCarrierSource = node(
    'Conditional Carrier Source',
    'Creature — Human Soldier',
    'At the beginning of combat on your turn, if you control a legendary creature, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.'
  );
  const firstCombatOnlyCarrierSource = node(
    'First Combat Only Carrier Source',
    'Creature — Human Warrior',
    'At the beginning of combat on your turn, if this is the first combat phase this turn, create a 1/1 red Warrior creature token with haste. It attacks this combat if able.'
  );
  assertHasCap(combatSacrificeAura, 'is-combat-sacrifice-extra-combat-aura');
  assertHasCap(combatSacrificeAura, 'combat-sacrifice-aura-requires-connect');
  assertHasCap(combatSacrificeAura, 'combat-sacrifice-aura-sacrifices-carrier');
  assertHasCap(combatSacrificeAura, 'combat-sacrifice-aura-reattaches');
  assertHasCap(combatSacrificeAura, 'combat-sacrifice-aura-untaps-creatures');
  assertHasCap(combatSacrificeAura, 'combat-sacrifice-aura-adds-combat');
  assertHasCap(breathShapedAura, 'is-combat-sacrifice-extra-combat-aura');
  assertHasCap(breathShapedAura, 'combat-sacrifice-aura-reattaches');
  assertHasCap(breathShapedAura, 'combat-sacrifice-aura-untaps-creatures');
  assertHasCap(breathShapedAura, 'combat-sacrifice-aura-adds-combat');
  assertHasCap(freshCombatCarrierSource, 'is-fresh-attack-carrier-source');
  assertHasCap(freshCombatCarrierSource, 'fresh-carrier-token-attacks');
  assertHasCap(freshCombatCarrierSource, 'fresh-carrier-token-has-haste');
  assertHasCap(freshCombatCarrierSource, 'fresh-carrier-continuity');
  assertHasCap(freshCombatCarrierSource, 'fresh-carrier-repeatable-each-combat');
  assertHasCap(freshCombatCarrierSource, 'fresh-carrier-legal-next-reattach-target');
  assertHasCap(freshCombatCarrierSource, 'fresh-carrier-timing:beginning-of-combat');
  assertHasCap(freshCombatCarrierSource, 'fresh-carrier-tokens-created:1');
  assertHasFamily(combatSacrificeAura, freshCombatCarrierSource, 'combat-sacrifice-aura→extra-combat-loop');
  assertHasFamily(breathShapedAura, freshCombatCarrierSource, 'combat-sacrifice-aura→extra-combat-loop');
  assertNoCap(auraWithoutReattach, 'is-combat-sacrifice-extra-combat-aura');
  assertHasCap(auraWithoutReattach, 'combat-sacrifice-aura-sacrifices-carrier');
  assertNoCap(auraWithoutUntap, 'is-combat-sacrifice-extra-combat-aura');
  assertNoCap(oncePerTurnAura, 'is-combat-sacrifice-extra-combat-aura');
  assertNoCap(staleCarrierSource, 'is-fresh-attack-carrier-source');
  assertNoCap(wrongTimingCarrierSource, 'is-fresh-attack-carrier-source');
  assertNoCap(nonHastyCarrierSource, 'is-fresh-attack-carrier-source');
  assertNoCap(tappedAttackingCarrierSource, 'is-fresh-attack-carrier-source');
  assertNoCap(hastyTappedAttackingCarrierSource, 'is-fresh-attack-carrier-source');
  assertNoCap(conditionalCarrierSource, 'is-fresh-attack-carrier-source');
  assertNoCap(firstCombatOnlyCarrierSource, 'is-fresh-attack-carrier-source');
  assertNoCap(firstCombatOnlyCarrierSource, 'fresh-carrier-continuity');
  assertNoFamily(combatSacrificeAura, staleCarrierSource, 'combat-sacrifice-aura→extra-combat-loop');
  assertNoFamily(combatSacrificeAura, firstCombatOnlyCarrierSource, 'combat-sacrifice-aura→extra-combat-loop');

  const profile = MODEL.interactionProfile({
    id: 'Heartstone',
    role: 'utility',
    produces: heartstone.produces,
    consumes: heartstone.consumes,
    caps: heartstone.caps,
  });
  assert.equal(profile.surface, 'utility');
  assert.equal(profile.primary.family, 'utility');
  assert.ok(profile.caps.includes('is-creature-ability-cost-reducer'));

  process.stdout.write('Interaction model tests passed\n');
}

main();
