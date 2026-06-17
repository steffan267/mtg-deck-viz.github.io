const assert = require('node:assert/strict');
const MODEL = require('../src/interaction-model');

function node(name, type, text, cmc = undefined) {
  const classified = MODEL.classify({ type_line: type, oracle_text: text, cmc });
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

  const doomBlade = node('Doom Blade', 'Instant', 'Destroy target nonblack creature.');
  const bloodArtist = node('Blood Artist', 'Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.');
  const bastion = node('Bastion of Remembrance', 'Enchantment', 'When Bastion of Remembrance enters the battlefield, create a 1/1 white Human Soldier creature token. Whenever a creature you control dies, each opponent loses 1 life and you gain 1 life.');
  assertHasCap(bloodArtist, 'is-death-drain-payoff');
  assertHasCap(bastion, 'is-death-drain-payoff');
  assertNoEvent(doomBlade, bastion, 'sacrifice');

  const worldShaper = node('World Shaper', 'Creature — Merfolk Shaman', 'Whenever World Shaper attacks, you mill three cards. When World Shaper dies, return all land cards from your graveyard to the battlefield tapped.');
  const rampagingBaloths = node('Rampaging Baloths', 'Creature — Beast', 'Landfall — Whenever a land enters the battlefield under your control, create a 4/4 green Beast creature token.');
  assertHasCap(worldShaper, 'is-land-recursion');
  assertHasCap(rampagingBaloths, 'is-landfall-payoff');
  assertHasEvent(worldShaper, rampagingBaloths, 'landfall');
  assertHasFamily(worldShaper, rampagingBaloths, 'land-recursion→landfall');
  const cultivate = node('Cultivate', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand. Then shuffle.');
  assertHasEvent(cultivate, rampagingBaloths, 'landfall');

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
  assertHasCap(skullclamp, 'has-death-trigger');
  assertHasCap(skullclamp, 'is-death-draw-payoff');
  assertHasFamily(visceraSeer, skullclamp, 'death→draw');

  const pitilessPlunderer = node('Pitiless Plunderer', 'Creature — Human Pirate', 'Whenever another creature you control dies, create a Treasure token.');
  assertHasCap(pitilessPlunderer, 'has-death-trigger');
  assertHasCap(pitilessPlunderer, 'is-death-token-payoff');
  assertHasFamily(visceraSeer, pitilessPlunderer, 'death→tokens');

  const marionetteApprentice = node('Marionette Apprentice', 'Creature — Human Artificer', 'Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.) Whenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.');
  assertHasCap(marionetteApprentice, 'has-counters');
  assertHasCap(marionetteApprentice, 'is-creature-token-producer');
  assertHasCap(marionetteApprentice, 'has-death-trigger');
  assertHasCap(marionetteApprentice, 'is-death-drain-payoff');

  const satya = node('Satya, Aetherflux Genius', 'Legendary Creature — Human Artificer', 'Whenever Satya attacks, create a tapped and attacking token that’s a copy of up to one other target nontoken creature you control. You get {E}{E}.');
  assertHasCap(satya, 'is-copy');
  assertHasCap(satya, 'is-permanent-copy');
  const reverberate = node('Reverberate', 'Instant', 'Copy target instant or sorcery spell. You may choose new targets for the copy.');
  assertHasCap(reverberate, 'is-copy');
  assertNoCap(reverberate, 'is-permanent-copy');
  assertNoEvent(reverberate, wallOfOmens, 'enable:copy→trigger');

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

  const caravan = node('Cultivator\'s Caravan', 'Artifact — Vehicle', '{T}: Add one mana of any color.\nCrew 3');
  const depala = node('Depala, Pilot Exemplar', 'Legendary Creature — Dwarf Pilot', 'Other Dwarves you control get +1/+1. Each Vehicle you control gets +1/+1. Whenever Depala becomes tapped, you may pay {X}. If you do, reveal the top X cards of your library, put all Dwarf and Vehicle cards from among them into your hand.');
  assertHasCap(caravan, 'is-vehicle');
  assertHasCap(depala, 'is-vehicle-payoff');
  assertHasFamily(caravan, depala, 'vehicle→payoff');
  assertNoEvent(solRing, depala, 'enable:vehicle→payoff');

  const quina = node('Quina, Qu Gourmet', 'Legendary Creature — Rat Chef', 'If one or more tokens would be created under your control, those tokens plus a 1/1 green Frog creature token are created instead. {2}, Sacrifice a Frog: Put a +1/+1 counter on Quina.');
  const slimeAgainstHumanity = node('Slime Against Humanity', 'Sorcery', 'Create a 0/0 green Ooze creature token with trample. Put X +1/+1 counters on it, where X is two plus the total number of cards you own in exile and in your graveyard that are Oozes or are named Slime Against Humanity. A deck can have any number of cards named Slime Against Humanity.');
  const genericTokenAmplifier = node('Generic Token Amplifier', 'Enchantment', 'If one or more tokens would be created under your control, twice that many of those tokens are created instead.');
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
  assertHasCap(genericTokenSpell, 'is-creature-token-producer');
  assertHasFamily(genericTokenSpell, genericTokenAmplifier, 'token-production→amplifier');
  assertHasCap(winota, 'is-tribal-payoff');
  assertHasFamily(winota, bladeHistorian, 'tribal-payoff→tribe');
  assertHasEvent(winota, bladeHistorian, 'tribal');
  assertNoCap(parasiticGrasp, 'is-tribal-payoff');

  const deadeyeNavigator = node('Deadeye Navigator', 'Creature — Spirit', 'Soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)\nAs long as Deadeye Navigator is paired with another creature, each of those creatures has "{1}{U}: Exile this creature, then return it to the battlefield under your control."');
  const peregrineDrake = node('Peregrine Drake', 'Creature — Drake', 'Flying\nWhen this creature enters, untap up to five lands.');
  const cloudOfFaeries = node('Cloud of Faeries', 'Creature — Faerie', 'Flying\nWhen this creature enters, untap up to two lands.\nCycling {2} ({2}, Discard this card: Draw a card.)');
  const ephemerate = node('Ephemerate', 'Instant', 'Exile target creature you control, then return it to the battlefield under its owner\'s control.');
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
  assertHasCap(lifegainFromOppLoss, 'is-lifegain-from-opponent-lifeloss');
  assertHasCap(oppLossFromLifeGain, 'is-lifeloss-from-your-lifegain');
  assertHasInteraction(lifegainFromOppLoss, oppLossFromLifeGain,
    it => it.family === 'lifeloss→lifegain-loop' && it.strength === 'combo-critical',
    'reciprocal opponent-life-loss/lifegain text should be detected as a loop without card names');
  assertHasInteraction(lifegainFromOppLoss, oppLossFromLifeGain,
    it => it.family === 'lifegain→lifeloss-loop' && it.strength === 'combo-critical',
    'reciprocal lifegain/opponent-life-loss text should emit the reverse loop family');

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

  const repeatableHastyCopier = node('Repeatable Hasty Copier', 'Legendary Creature — Goblin Shaman', 'Haste. {T}: Create a token that’s a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.');
  const etbPermanentUntapper = node('ETB Permanent Untapper', 'Creature — Human Warrior', 'When this creature enters the battlefield, gain control of target permanent until end of turn. Untap that permanent. It gains haste until end of turn.');
  assertHasCap(repeatableHastyCopier, 'is-repeatable-hasty-creature-copy');
  assertHasCap(etbPermanentUntapper, 'etb-untaps-permanent');
  assertHasInteraction(repeatableHastyCopier, etbPermanentUntapper,
    it => it.family === 'hasty-copy→etb-untap-loop' && it.strength === 'combo-critical',
    'repeatable hasty creature-copy text plus ETB permanent untap text should be combo-critical');

  const etbSpellCopier = node('ETB Spell Copier', 'Creature — Human Wizard', 'Flash. When this creature enters the battlefield, copy target instant or sorcery spell. You may choose new targets for the copy.');
  const hastyCreatureCopySpell = node('Hasty Creature Copy Spell', 'Sorcery', 'Choose any number of target creatures you control. For each of them, create a token that’s a copy of that creature, except it has haste. Exile those tokens at the beginning of the next end step.');
  assertHasCap(etbSpellCopier, 'is-etb-spell-copier');
  assertHasCap(hastyCreatureCopySpell, 'is-hasty-creature-copy-spell');
  assertHasInteraction(etbSpellCopier, hastyCreatureCopySpell,
    it => it.family === 'spell-copy-etb→creature-copy-spell-loop' && it.strength === 'combo-critical',
    'ETB spell-copy creature plus hasty creature-copy spell should be combo-critical without names');

  const topDrawArtifact = node('Self Top Draw Artifact', 'Artifact', '{1}: Draw a card, then put this artifact on top of its owner’s library.');
  const artifactReducer = node('Artifact Spell Reducer', 'Artifact Creature — Vedalken Artificer', 'Artifact spells you cast cost {1} less to cast.');
  const castFromTop = node('Artifact Top Caster', 'Artifact', 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.');
  assertHasCap(topDrawArtifact, 'is-self-top-draw-artifact');
  assertHasCap(artifactReducer, 'is-artifact-spell-cost-reducer');
  assertHasCap(castFromTop, 'is-artifact-cast-from-top-enabler');
  assertHasInteraction(artifactReducer, topDrawArtifact,
    it => it.family === 'artifact-cost-reduction→top-loop-piece' && it.strength === 'strong',
    'artifact cost reducer should link to a self-top draw artifact as one half of a three-card loop');
  assertHasInteraction(castFromTop, topDrawArtifact,
    it => it.family === 'cast-from-top→top-loop-piece' && it.strength === 'strong',
    'cast-from-top enabler should link to a self-top draw artifact as one half of a three-card loop');

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
