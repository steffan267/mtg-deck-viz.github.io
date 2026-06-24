const assert = require('node:assert/strict');
const METRICS = require('../src/metrics');

function card({
  id,
  role = 'utility',
  cmc = 2,
  text = '',
  edh = 1000,
  qty = 1,
  mana = '',
  produces = {},
  consumes = {},
  caps = []
}) {
  return {
    id,
    qty,
    role,
    cmc,
    type: role === 'land' ? 'Land' : 'Spell',
    mana,
    text,
    edh,
    produces,
    consumes,
    caps,
    degree: 0,
  };
}

function graph(nodes, edges = []) {
  return { nodes, edges, zoneEdges: [], zones: [], eventLabels: {}, missing: [] };
}

function main() {
  const mana = { mana: ['you'] };
  const tunedFastFinisher = graph([
    card({ id: 'Xantcha, Sleeper Agent', role: 'commander', cmc: 3, text: '{3}: Xantcha\'s controller loses 2 life and you draw a card.' }),
    card({ id: 'Sol Ring', role: 'ramp', cmc: 1, text: '{T}: Add {C}{C}.', produces: mana, caps: ['is-ramp', 'taps-for-mana'], edh: 1 }),
    card({ id: 'Mana Vault', role: 'ramp', cmc: 1, text: '{T}: Add {C}{C}{C}.', produces: mana, caps: ['is-ramp', 'taps-for-mana'], edh: 144 }),
    card({ id: 'Chrome Mox', role: 'ramp', cmc: 0, text: '{T}: Add one mana of any color.', produces: mana, caps: ['is-ramp', 'taps-for-mana'], edh: 142 }),
    card({ id: 'Lotus Petal', role: 'ramp', cmc: 0, text: 'Sacrifice this artifact: Add one mana of any color.', produces: mana, caps: ['is-ramp'], edh: 118 }),
    card({ id: 'Dark Ritual', role: 'ramp', cmc: 1, text: 'Add {B}{B}{B}.', produces: mana, caps: ['is-ramp'], edh: 34 }),
    card({ id: 'Cabal Ritual', role: 'ramp', cmc: 2, text: 'Add {B}{B}{B}. Threshold — Add {B}{B}{B}{B}{B} instead.', produces: mana, caps: ['is-ramp'], edh: 464 }),
    card({ id: 'Jeska\'s Will', role: 'ramp', cmc: 3, text: 'Add {R} for each card in target opponent\'s hand. Exile the top three cards of your library. You may play them this turn.', produces: mana, caps: ['is-ramp'], edh: 102 }),
    card({ id: 'Demonic Tutor', role: 'tutor', cmc: 2, text: 'Search your library for a card, put that card into your hand, then shuffle.', edh: 59 }),
    card({ id: 'Vampiric Tutor', role: 'tutor', cmc: 1, text: 'Search your library for a card, then shuffle and put that card on top.', edh: 110 }),
    card({ id: 'Gamble', role: 'tutor', cmc: 1, text: 'Search your library for a card, put that card into your hand, discard a card at random, then shuffle.', edh: 236 }),
    card({ id: 'Necropotence', cmc: 3, text: 'Skip your draw step. Pay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.', edh: 503 }),
    card({ id: 'Bolas\'s Citadel', role: 'finisher', cmc: 6, text: 'You may look at the top card of your library any time. You may play lands and cast spells from the top of your library.', edh: 262 }),
    card({ id: 'Wheel of Fortune', cmc: 3, text: 'Each player discards their hand, then draws seven cards.', edh: 560 }),
    card({ id: 'Memory Jar', cmc: 5, text: 'Each player exiles all cards from their hand face down and draws seven cards.', edh: 6804 }),
    card({ id: 'Torment of Hailfire', role: 'finisher', cmc: 2, mana: '{X}{B}{B}', text: 'Repeat X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent or discards a card.', consumes: mana, edh: 612 }),
    card({ id: 'Exsanguinate', role: 'finisher', cmc: 2, mana: '{X}{B}{B}', text: 'Each opponent loses X life. You gain life equal to the life lost this way.', consumes: mana, edh: 282 }),
    card({ id: 'Peer into the Abyss', role: 'finisher', cmc: 7, text: 'Target player draws cards equal to half the number of cards in their library and loses half their life.', edh: 1256 }),
    card({ id: 'Sheoldred, the Apocalypse', role: 'payoff', cmc: 4, text: 'Whenever an opponent draws a card, they lose 2 life.', edh: 466 }),
    card({ id: 'Orcish Bowmasters', role: 'payoff', cmc: 2, text: 'Whenever an opponent draws a card except the first one they draw in each of their draw steps, Orcish Bowmasters deals 1 damage to any target.', edh: 254 }),
    card({ id: 'Deadly Rollick', role: 'removal', cmc: 4, text: 'If you control a commander, you may cast this spell without paying its mana cost. Exile target creature.', edh: 112 }),
    card({ id: 'Toxic Deluge', role: 'wipe', cmc: 3, text: 'All creatures get -X/-X until end of turn.', edh: 66 }),
    card({ id: 'Deflecting Swat', cmc: 3, text: 'If you control a commander, you may cast this spell without paying its mana cost. You may choose new targets for target spell or ability.', edh: 79 }),
    card({ id: 'Swamp', role: 'land', qty: 77, edh: null }),
  ]);

  const cohesiveCombatValue = graph([
    card({ id: 'Marisi, Breaker of the Coil', role: 'commander', cmc: 4, text: 'Whenever a creature you control deals combat damage to a player, goad each creature that player controls.' }),
    card({ id: 'Sol Ring', role: 'ramp', cmc: 1, text: '{T}: Add {C}{C}.', produces: mana, caps: ['is-ramp', 'taps-for-mana'], edh: 1 }),
    card({ id: 'Arcane Signet', role: 'ramp', cmc: 2, text: '{T}: Add one mana of any color in your commander\'s color identity.', produces: mana, caps: ['is-ramp', 'taps-for-mana'], edh: 3 }),
    card({ id: 'Farseek', role: 'ramp', cmc: 2, text: 'Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.', edh: 23 }),
    card({ id: 'Nature\'s Lore', role: 'ramp', cmc: 2, text: 'Search your library for a Forest card, put that card onto the battlefield, then shuffle.', edh: 29 }),
    card({ id: 'Cultivate', role: 'ramp', cmc: 3, text: 'Search your library for up to two basic land cards.', edh: 20 }),
    card({ id: 'Kodama\'s Reach', role: 'ramp', cmc: 3, text: 'Search your library for up to two basic land cards.', edh: 37 }),
    card({ id: 'Worldly Tutor', role: 'tutor', cmc: 1, text: 'Search your library for a creature card, reveal it, then shuffle and put the card on top.', edh: 165 }),
    card({ id: 'Eladamri\'s Call', role: 'tutor', cmc: 2, text: 'Search your library for a creature card, reveal that card, put it into your hand, then shuffle.', edh: 747 }),
    card({ id: 'Chord of Calling', role: 'tutor', cmc: 3, text: 'Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.', edh: 532 }),
    card({ id: 'Green Sun\'s Zenith', role: 'tutor', cmc: 1, text: 'Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle.', edh: 550 }),
    card({ id: 'Eldritch Evolution', role: 'tutor', cmc: 3, text: 'Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.', edh: 714 }),
    card({ id: 'Toski, Bearer of Secrets', role: 'draw', cmc: 4, text: 'Whenever a creature you control deals combat damage to a player, draw a card.', edh: 381 }),
    card({ id: 'Guardian Project', role: 'draw', cmc: 4, text: 'Whenever a nontoken creature enters the battlefield under your control, draw a card.', edh: 314 }),
    card({ id: 'Beast Whisperer', role: 'draw', cmc: 4, text: 'Whenever you cast a creature spell, draw a card.', edh: 212 }),
    card({ id: 'Ohran Frostfang', role: 'draw', cmc: 5, text: 'Whenever a creature you control deals combat damage to a player, draw a card.', edh: 460 }),
    card({ id: 'Skullclamp', role: 'draw', cmc: 1, text: 'Equipped creature gets +1/-1. Whenever equipped creature dies, draw two cards.', edh: 41 }),
    card({ id: 'Beastmaster Ascension', role: 'utility', cmc: 3, text: 'Whenever a creature you control attacks, put a quest counter on Beastmaster Ascension. Creatures you control get +5/+5.', edh: 563 }),
    card({ id: 'Adeline, Resplendent Cathar', role: 'creature', cmc: 3, text: 'Whenever you attack, create a 1/1 white Human creature token tapped and attacking.', edh: 507 }),
    card({ id: 'Krenko, Tin Street Kingpin', role: 'creature', cmc: 3, text: 'Whenever Krenko attacks, create a number of 1/1 Goblin creature tokens equal to Krenko\'s power.', edh: 852 }),
    card({ id: 'Nacatl War-Pride', role: 'creature', cmc: 6, text: 'Whenever Nacatl War-Pride attacks, create X tokens that are tapped and attacking.', edh: 10183 }),
    card({ id: 'Combat Celebrant', role: 'creature', cmc: 3, text: 'If Combat Celebrant hasn\'t been exerted this turn, you may exert it as it attacks. Untap all other creatures you control and after this phase, there is an additional combat phase.', edh: 1014 }),
    card({ id: 'Heroic Intervention', cmc: 2, text: 'Permanents you control gain hexproof and indestructible until end of turn.', edh: 31 }),
    card({ id: 'Teferi\'s Protection', cmc: 3, text: 'Until your next turn, your life total can\'t change and you gain protection from everything. All permanents you control phase out.', edh: 104 }),
    card({ id: 'Flawless Maneuver', cmc: 3, text: 'If you control a commander, you may cast this spell without paying its mana cost. Creatures you control gain indestructible until end of turn.', edh: 184 }),
    card({ id: 'Mother of Runes', role: 'creature', cmc: 1, text: '{T}: Target creature you control gains protection from the color of your choice until end of turn.', edh: 512 }),
    card({ id: 'Swords to Plowshares', role: 'removal', cmc: 1, text: 'Exile target creature.', edh: 11 }),
    card({ id: 'Path to Exile', role: 'removal', cmc: 1, text: 'Exile target creature.', edh: 15 }),
    card({ id: 'Beast Within', role: 'removal', cmc: 3, text: 'Destroy target permanent.', edh: 24 }),
    card({ id: 'Blasphemous Act', role: 'wipe', cmc: 9, text: 'This spell deals 13 damage to each creature.', edh: 22 }),
    card({ id: 'Drannith Magistrate', role: 'creature', cmc: 2, text: 'Your opponents can\'t cast spells from anywhere other than their hands.', edh: 684 }),
    card({ id: 'Archon of Emeria', role: 'creature', cmc: 3, text: 'Each player can\'t cast more than one spell each turn. Nonbasic lands your opponents control enter tapped.', edh: 2059 }),
    card({ id: 'Forest', role: 'land', qty: 68, edh: null }),
  ]);

  const tuned = METRICS.compute(tunedFastFinisher);
  const combat = METRICS.compute(cohesiveCombatValue);

  assert.ok(tuned.winTuningScore > combat.winTuningScore, `expected tuned finisher (${tuned.winTuningScore}) > combat value (${combat.winTuningScore})`);
  assert.ok(tuned.winTuningSignals.speed.score > combat.winTuningSignals.speed.score);
  assert.ok(tuned.winTuningSignals.closure.score > combat.winTuningSignals.closure.score);
  assert.equal(tuned.winTuningSignals.legality, undefined, 'deck size must not be a win-tuning signal');
  assert.equal(combat.winTuningSignals.legality, undefined, 'deck size must not be a win-tuning signal');

  const fullSizeDeck = METRICS.compute(graph([
    card({ id: 'Compact Commander', role: 'commander', cmc: 2, text: 'Whenever you draw your second card each turn, each opponent loses 1 life.' }),
    card({ id: 'Compact Finisher', role: 'finisher', cmc: 2, text: 'Each opponent loses X life.', mana: '{X}{B}', consumes: mana }),
    card({ id: 'Forest', role: 'land', qty: 98, edh: null }),
  ]));
  const undersizedDeck = METRICS.compute(graph([
    card({ id: 'Compact Commander', role: 'commander', cmc: 2, text: 'Whenever you draw your second card each turn, each opponent loses 1 life.' }),
    card({ id: 'Compact Finisher', role: 'finisher', cmc: 2, text: 'Each opponent loses X life.', mana: '{X}{B}', consumes: mana }),
    card({ id: 'Forest', role: 'land', qty: 78, edh: null }),
  ]));
  assert.equal(undersizedDeck.winTuningScore, fullSizeDeck.winTuningScore, 'deck size must not affect win tuning');

  // --- Game Changers: authoritative WotC power list, fully card-grounded. ---
  // The tuned shell runs many GC cards (Mana Vault, Demonic Tutor, Vampiric
  // Tutor, Gamble, Necropotence, Bolas's Citadel, Chrome Mox, Orcish Bowmasters).
  assert.ok(tuned.gameChangerCount >= 6, `expected tuned shell to run many Game Changers, got ${tuned.gameChangerCount}`);
  assert.ok(tuned.gameChangers.includes('Demonic Tutor'), 'Demonic Tutor should be detected as a Game Changer');
  assert.ok(tuned.gameChangers.includes('Mana Vault'), 'Mana Vault should be detected as a Game Changer');
  assert.ok(!tuned.gameChangers.includes('Sol Ring'), 'Sol Ring is NOT on the Game Changers list');
  // count must equal the surfaced card list length (the figure is auditable)
  assert.equal(tuned.gameChangerCount, tuned.gameChangers.length);
  // bracket hint now uses the full Beta classifier; 4+ Game Changers still force Bracket 4+.
  assert.equal(tuned.bracketHint, 4, 'a list with 4+ Game Changers maps to Bracket 4');
  assert.ok(tuned.gameChangerCount > combat.gameChangerCount);
  assert.ok(combat.bracketHint <= 3);

  // --- Commander Brackets classifier: applies the image rules, not GC count only.
  const casualExhibition = METRICS.compute(graph([
    card({ id: 'Friendly Commander', role: 'commander', cmc: 4, text: 'Whenever you gain life, scry 1.', edh: null }),
    card({ id: 'Vanilla Friend', role: 'creature', cmc: 3, text: 'A friendly creature.', edh: null }),
    card({ id: 'Forest', role: 'land', qty: 98, edh: null }),
  ]));
  assert.equal(casualExhibition.bracketHint, 1);
  assert.equal(casualExhibition.commanderBracket.name, 'Exhibition');

  const singleExtraTurn = METRICS.compute(graph([
    card({ id: 'Slow Commander', role: 'commander', cmc: 4, edh: null }),
    card({ id: 'One Time Warp', cmc: 5, text: 'Target player takes an extra turn after this one.', edh: null }),
    card({ id: 'Island', role: 'land', qty: 98, edh: null }),
  ]));
  assert.equal(singleExtraTurn.bracketHint, 2, 'Bracket 1 forbids extra turns, but Bracket 2 forbids only chaining them');
  assert.deepEqual(singleExtraTurn.commanderBracket.flags.extraTurnCards, ['One Time Warp']);

  const chainedExtraTurns = METRICS.compute(graph([
    card({ id: 'Turn Commander', role: 'commander', cmc: 4, edh: null }),
    card({ id: 'First Time Warp', cmc: 5, text: 'Target player takes an extra turn after this one.', edh: null }),
    card({ id: 'Second Time Warp', cmc: 5, text: 'Target player takes an extra turn after this one.', edh: null }),
    card({ id: 'Island', role: 'land', qty: 97, edh: null }),
  ]));
  assert.equal(chainedExtraTurns.bracketHint, 4, 'chaining extra turns is unrestricted-bracket territory');
  assert.ok(chainedExtraTurns.commanderBracket.ruleBreaks.includes('chaining extra turns'));

  const massLandDenial = METRICS.compute(graph([
    card({ id: 'Table Commander', role: 'commander', cmc: 4, edh: null }),
    card({ id: 'Not-Armageddon', cmc: 4, text: 'Destroy all lands.', edh: null }),
    card({ id: 'Plains', role: 'land', qty: 98, edh: null }),
  ]));
  assert.equal(massLandDenial.bracketHint, 4);
  assert.deepEqual(massLandDenial.commanderBracket.flags.massLandDenialCards, ['Not-Armageddon']);

  const threeGameChangers = METRICS.compute(graph([
    card({ id: 'Value Commander', role: 'commander', cmc: 4, edh: null }),
    card({ id: 'Rhystic Study', cmc: 3, text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', edh: 20 }),
    card({ id: 'Smothering Tithe', cmc: 4, text: 'Whenever an opponent draws a card, create a Treasure token unless they pay {2}.', edh: 20 }),
    card({ id: 'Cyclonic Rift', cmc: 2, text: 'Return target nonland permanent you don’t control to its owner’s hand.', edh: 20 }),
    card({ id: 'Island', role: 'land', qty: 96, edh: null }),
  ]));
  assert.equal(threeGameChangers.bracketHint, 3, '1-3 Game Changers maps to Upgraded');

  const fourGameChangers = METRICS.compute(graph([
    card({ id: 'Value Commander', role: 'commander', cmc: 4, edh: null }),
    card({ id: 'Rhystic Study', cmc: 3, text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', edh: 20 }),
    card({ id: 'Smothering Tithe', cmc: 4, text: 'Whenever an opponent draws a card, create a Treasure token unless they pay {2}.', edh: 20 }),
    card({ id: 'Cyclonic Rift', cmc: 2, text: 'Return target nonland permanent you don’t control to its owner’s hand.', edh: 20 }),
    card({ id: 'Mystical Tutor', cmc: 1, text: 'Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.', edh: 20 }),
    card({ id: 'Island', role: 'land', qty: 95, edh: null }),
  ]));
  assert.equal(fourGameChangers.bracketHint, 4, '4+ Game Changers maps to Optimized/unrestricted');
  assert.ok(fourGameChangers.commanderBracket.ruleBreaks.includes('4+ Game Changers'));

  const lateCombo = METRICS.compute(graph([
    card({ id: 'Big Engine A', cmc: 4, text: '{T}: Untap target permanent.', edh: null }),
    card({ id: 'Big Engine B', cmc: 4, text: 'Whenever this becomes untapped, add mana.', edh: null }),
    card({ id: 'Forest', role: 'land', qty: 98, edh: null }),
  ], [
    { source: 'Big Engine A', target: 'Big Engine B', interactions: [{ kind: 'enablement', direction: 'A→B', strength: 'combo-critical', family: 'untap loop' }] },
  ]));
  assert.equal(lateCombo.bracketHint, 3, 'late-game two-card combos are allowed in Bracket 3');
  assert.deepEqual(lateCombo.commanderBracket.flags.lateComboPairs[0].cards, ['Big Engine A', 'Big Engine B']);

  const earlyCombo = METRICS.compute(graph([
    card({ id: 'Cheap Engine A', cmc: 2, text: '{T}: Untap target permanent.', edh: null }),
    card({ id: 'Cheap Engine B', cmc: 2, text: 'Whenever this becomes untapped, add mana.', edh: null }),
    card({ id: 'Forest', role: 'land', qty: 98, edh: null }),
  ], [
    { source: 'Cheap Engine A', target: 'Cheap Engine B', interactions: [{ kind: 'enablement', direction: 'A→B', strength: 'combo-critical', family: 'untap loop' }] },
  ]));
  assert.equal(earlyCombo.bracketHint, 4, 'cheap two-card infinites are above the Bracket 3 late-game exception');
  assert.deepEqual(earlyCombo.commanderBracket.flags.earlyComboPairs[0].cards, ['Cheap Engine A', 'Cheap Engine B']);

  const topLoopCombo = METRICS.compute(graph([
    card({ id: 'Self Top Draw Artifact', cmc: 1, text: '{1}: Draw a card, then put this artifact on top of its owner’s library.', edh: null }),
    card({ id: 'Artifact Spell Reducer', cmc: 2, text: 'Artifact spells you cast cost {1} less to cast.', edh: null }),
    card({ id: 'Artifact Top Caster', cmc: 4, text: 'You may look at the top card of your library any time. You may cast artifact spells from the top of your library.', edh: null }),
    card({ id: 'Island', role: 'land', qty: 97, edh: null }),
  ], [
    { source: 'Artifact Spell Reducer', target: 'Self Top Draw Artifact', interactions: [{ kind: 'enablement', direction: 'A→B', strength: 'strong', family: 'artifact-cost-reduction→top-loop-piece' }] },
    { source: 'Artifact Top Caster', target: 'Self Top Draw Artifact', interactions: [{ kind: 'enablement', direction: 'A→B', strength: 'strong', family: 'cast-from-top→top-loop-piece' }] },
  ]));
  assert.equal(topLoopCombo.hasCombo, true, 'three-card artifact top loop should count as a combo');
  assert.deepEqual(topLoopCombo.comboCriticalTriples[0].cards, ['Artifact Spell Reducer', 'Artifact Top Caster', 'Self Top Draw Artifact']);
  assert.equal(topLoopCombo.comboCriticalTriples[0].family, 'artifact-top-cost-reduction-loop');
  assert.deepEqual(topLoopCombo.commanderBracket.flags.comboPairs, [], 'three-card combos must not be reclassified as two-card pairs');
  assert.deepEqual(topLoopCombo.commanderBracket.flags.comboTriples[0].cards, ['Artifact Spell Reducer', 'Artifact Top Caster', 'Self Top Draw Artifact']);
  assert.equal(topLoopCombo.bracketHint, 3, 'three-card combo should not trigger the early two-card Bracket 4 rule');
  assert.ok(!topLoopCombo.commanderBracket.ruleBreaks.includes('early two-card infinite combo'));

  const reciprocalLoop = METRICS.compute(graph([
    card({ id: 'Loss Converts To Gain', cmc: 5, text: 'Whenever an opponent loses life, you gain that much life.', edh: null }),
    card({ id: 'Gain Converts To Loss', cmc: 5, text: 'Whenever you gain life, target opponent loses that much life.', edh: null }),
    card({ id: 'Swamp', role: 'land', qty: 98, edh: null }),
  ], [
    { source: 'Loss Converts To Gain', target: 'Gain Converts To Loss', interactions: [
      { kind: 'enablement', direction: 'A→B', strength: 'combo-critical', family: 'lifeloss→lifegain-loop' },
      { kind: 'enablement', direction: 'B→A', strength: 'combo-critical', family: 'lifegain→lifeloss-loop' },
    ] },
  ]));
  assert.equal(reciprocalLoop.comboCriticalPairs.length, 1, 'reciprocal families should count as one unique combo pair');
  assert.deepEqual(reciprocalLoop.comboCriticalPairs[0].families, ['lifeloss→lifegain-loop', 'lifegain→lifeloss-loop']);

  // --- plain-English summary names the win path so the score reads as a story
  assert.match(tuned.winSummary, /finisher|combo/i, `summary should describe the win path: "${tuned.winSummary}"`);
  assert.match(combat.winSummary, /combat/i, `combat deck summary should mention combat: "${combat.winSummary}"`);

  // --- band calibration. "Tuned to win" begins at 74 — one point above the
  // strongest precon (the 100-precon corpus tops out at 73), so the band means
  // "upgraded beyond an out-of-box deck". This synthetic shell is deliberately
  // sparse (no full interaction/resilience suite), so we assert the ordering and
  // a comfortable margin rather than an absolute threshold; the corpus run and
  // the live Political-Agent reference (90, "Highly tuned") anchor the absolute
  // calibration. The combat-value shell must stay below the tuned band.
  assert.ok(tuned.winTuningScore - combat.winTuningScore >= 15,
    `tuned shell should clearly beat combat value, got ${tuned.winTuningScore} vs ${combat.winTuningScore}`);
  assert.ok(combat.winTuningScore < 74, `combat shell should stay below 'Tuned to win', got ${combat.winTuningScore}`);

  process.stdout.write('Metrics tests passed\n');
}

main();
