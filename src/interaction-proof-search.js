/*
 * interaction-proof-search.js — bounded abstract combo proof search.
 *
 * This intentionally stops short of a full MTG rules engine. It proves a small
 * set of high-signal package families over abstract resources/events, records
 * why near-misses are not repeatable, and enforces hard card/depth/branch caps.
 */
const { buildInteractionHypergraph } = require('./interaction-hypergraph');
const { buildInteractionIndexes, normalizeCard } = require('./interaction-indexes');
const FACE_CLASSIFICATION = require('./face-classification');
const MODEL = require('./interaction-model.js');

const DEFAULT_LIMITS = {
  maxCards: 3,
  maxDepth: 8,
  maxBranches: 64,
  auditLowConfidence: false,
};

function sorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function hasCap(card, cap) {
  return (card.caps || []).includes(cap);
}

function fact(card, predicate) {
  return { card: card.id || card, kind: 'capability', predicate };
}

function eventConsumesFact(card, event) {
  return { card: card.id || card, kind: 'event.consumes', event };
}

function firstCap(card, caps) {
  return (caps || []).find(cap => hasCap(card, cap));
}

function tokenPayoffFact(card) {
  if ((card.consumes || {}).tokens) return eventConsumesFact(card, 'tokens');
  return fact(card, firstCap(card, ['is-combat-payoff', 'is-width-payoff']) || 'token-payoff');
}

function deathPayoffFact(card) {
  return fact(card, firstCap(card, ['is-death-drain-payoff', 'is-death-draw-payoff', 'is-death-token-payoff']) || 'death-payoff');
}

function capValue(card, prefix) {
  const raw = (card.caps || []).find(cap => cap.startsWith(prefix + ':'));
  if (!raw) return null;
  const n = Number(raw.slice(prefix.length + 1));
  return Number.isFinite(n) ? n : raw.slice(prefix.length + 1);
}

function capNumbers(card, prefix) {
  return (card.caps || [])
    .filter(cap => cap.startsWith(prefix + ':'))
    .map(cap => Number(cap.slice(prefix.length + 1)))
    .filter(Number.isFinite);
}

const MANA_COLORS = ['w', 'u', 'b', 'r', 'g'];

function maxCapNumber(card, prefix) {
  return Math.max(0, ...capNumbers(card, prefix));
}

function minCapNumber(card, prefix) {
  const values = capNumbers(card, prefix);
  return values.length ? Math.min(...values) : 0;
}

function recursiveCostProfile(card) {
  return {
    total: minCapNumber(card, 'recursive-body-cost'),
    colorless: maxCapNumber(card, 'recursive-body-colorless-cost'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, 'recursive-body-color-' + color)])),
  };
}

function manaCostProfileFromCaps(card, prefix) {
  return {
    total: minCapNumber(card, prefix + '-cost'),
    colorless: maxCapNumber(card, prefix + '-colorless-cost'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, prefix + '-color-' + color)])),
  };
}

function sacOutletManaProfile(card) {
  return {
    total: maxCapNumber(card, 'sac-outlet-mana-produced'),
    any: maxCapNumber(card, 'sac-outlet-mana-any'),
    colorless: maxCapNumber(card, 'sac-outlet-mana-c'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, 'sac-outlet-mana-' + color)])),
  };
}

function lifePaidTreasureSacOutletProfile(card) {
  const produced = maxCapNumber(card, 'life-sac-outlet-mana-produced');
  return {
    total: produced,
    any: maxCapNumber(card, 'life-sac-outlet-mana-any') || produced,
    colorless: 0,
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])),
    lifeCost: maxCapNumber(card, 'life-sac-outlet-life-cost') || 1,
  };
}

function deathManaProfile(card) {
  return {
    total: maxCapNumber(card, 'death-mana-produced'),
    any: maxCapNumber(card, 'death-mana-any'),
    colorless: maxCapNumber(card, 'death-mana-c'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, 'death-mana-' + color)])),
  };
}

function addManaProfiles(a, b) {
  return {
    total: (a.total || 0) + (b.total || 0),
    any: (a.any || 0) + (b.any || 0),
    colorless: (a.colorless || 0) + (b.colorless || 0),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, (a.colors?.[color] || 0) + (b.colors?.[color] || 0)])),
  };
}

function canPayRecursiveCost(cost, mana) {
  if ((mana.colorless || 0) < (cost.colorless || 0)) return false;
  let anyRemaining = mana.any;
  for (const color of MANA_COLORS) {
    const shortage = Math.max(0, (cost.colors[color] || 0) - (mana.colors[color] || 0));
    anyRemaining -= shortage;
    if (anyRemaining < 0) return false;
  }
  return mana.total >= cost.total;
}

function uniqueCards(cards) {
  const seen = new Set();
  return (cards || []).filter(card => {
    const id = card && card.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isCreaturePermanent(card) {
  return /\bcreature\b/i.test(card?.type || card?.type_line || '');
}

function isLegendaryPermanent(card) {
  return /\blegendary\b/i.test(card?.type || card?.type_line || '');
}

function canHastyCopyTarget(copier, target, extraTargetCaps = []) {
  if (!hasCap(copier, 'hasty-copy-target-creature')) return false;
  const targetCaps = ['is-creature-permanent', ...extraTargetCaps];
  if (hasCap(copier, 'hasty-copy-target-requires-nonlegendary')) targetCaps.push('is-nonlegendary-permanent');
  if (!MODEL.faceCompatibleCaps(target, targetCaps)) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  if (!target?.faceFacts?.length && hasCap(copier, 'hasty-copy-target-requires-nonlegendary') && isLegendaryPermanent(target)) return false;
  return true;
}

function canHastyCopySpellTarget(copySpell, target, extraTargetCaps = []) {
  if (!hasCap(copySpell, 'hasty-copy-spell-target-creature')) return false;
  const targetCaps = ['is-creature-permanent', ...extraTargetCaps];
  if (hasCap(copySpell, 'hasty-copy-spell-target-requires-nonlegendary')) targetCaps.push('is-nonlegendary-permanent');
  if (!MODEL.faceCompatibleCaps(target, targetCaps)) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  if (!target?.faceFacts?.length && hasCap(copySpell, 'hasty-copy-spell-target-requires-nonlegendary') && isLegendaryPermanent(target)) return false;
  return true;
}

function recursiveBodyPreconditionSupport(body, cards, requiredCapsByCardId = new Map()) {
  if (!hasCap(body, 'recursive-body-requires-another-creature')) {
    return { ok: true, supportCards: [], facts: [], steps: [] };
  }
  const support = find(cards, card => {
    if (!card || card === body) return false;
    const roleCaps = requiredCapsByCardId.get(card.id) || [];
    return MODEL.faceCompatibleCaps(card, ['is-creature-permanent', ...roleCaps]);
  });
  if (!support) {
    return {
      ok: false,
      supportCards: [],
      facts: [fact(body, 'recursive-body-requires-another-creature')],
      steps: [],
      reason: 'recursive cast permission requires another creature controlled by the package',
    };
  }
  return {
    ok: true,
    supportCards: [support],
    facts: [fact(body, 'recursive-body-requires-another-creature'), fact(support, 'is-creature-permanent')],
    steps: [{ card: support.id, action: 'remains on the battlefield to satisfy the recursive cast permission' }],
  };
}

function recursiveControlTypePrecondition(body, cards) {
  const text = String(body.text || '').toLowerCase();
  const match = text.match(/as long as you control an? ([a-z][a-z-]*)/);
  if (!match) return { ok: true, facts: [], steps: [] };
  const requiredType = match[1].replace(/s$/, '');
  const cardHasSubtype = (card) => {
    const listedTypes = card.myTypes || [];
    if (listedTypes.some(type => String(type).toLowerCase().replace(/s$/, '') === requiredType)) return true;
    const subtypeText = String(card.type || card.type_line || '').toLowerCase().split('—').slice(1).join(' ');
    return new RegExp(`\\b${requiredType}s?\\b`).test(subtypeText);
  };
  const support = find(cards, card => card && card !== body
    && (requiredType === 'creature'
      ? hasCap(card, 'is-creature-permanent')
      : cardHasSubtype(card)));
  if (!support) {
    return {
      ok: false,
      facts: [{ card: body.id, kind: 'precondition', predicate: 'controls-type', value: requiredType }],
      steps: [],
      reason: `recursive cast requires another controlled ${requiredType}`,
    };
  }
  return {
    ok: true,
    facts: [{ card: support.id, kind: 'precondition', predicate: 'controls-type', value: requiredType }],
    steps: [{ card: support.id, action: `satisfies recursive cast permission by remaining a controlled ${requiredType}` }],
    support,
  };
}

function drawToDamageAcceptsYourDraw(card) {
  return hasCap(card, 'draw-to-damage-subject:you') || hasCap(card, 'draw-to-damage-subject:each');
}

function interval(min = 0, max = 0) {
  return { min, max };
}

function addDelta(deltas, resource, min, max, source) {
  deltas.push({ resource, delta: interval(min, max), source });
}

function abstractInitialState(cards, hypergraph = null, limits = DEFAULT_LIMITS) {
  return {
    version: 'abstract-state.v1',
    cards: cards.map(card => card.id).sort(),
    resources: {
      mana: interval(0, 0),
      tokens: interval(0, 0),
      cards: interval(0, 0),
      life: interval(0, 0),
      counters: interval(0, 0),
      storm: interval(0, 0),
    },
    flags: {
      tapped: {},
      oncePerTurn: {},
      relevantZones: sorted(cards.flatMap(card => card.zones || [])),
      staticModifiers: sorted(cards.flatMap(card => (card.caps || []).filter(cap => /doubler|multiplier|reducer|cost-reducer/.test(cap)))),
      replacementModifiers: sorted(cards.flatMap(card => (card.caps || []).filter(cap => /doubler|multiplier/.test(cap)))),
      hyperedges: hypergraph ? hypergraph.hyperedges.map(edge => edge.id).sort() : [],
    },
    limits,
  };
}

function transitionForCard(card) {
  const deltas = [];
  const events = [];
  if (hasCap(card, 'taps-for-mana')) addDelta(deltas, 'mana', 1, Number(capValue(card, 'mana-produced') || 1), card.id);
  if (hasCap(card, 'is-token-producer')) {
    addDelta(deltas, 'tokens', 1, 2, card.id);
    events.push({ event: 'tokens', card: card.id });
  }
  if (hasCap(card, 'is-self-top-draw-artifact')) addDelta(deltas, 'cards', 1, 1, card.id);
  if (hasCap(card, 'is-sac-outlet')) events.push({ event: 'death', card: card.id });
  if (hasCap(card, 'is-repeatable-blink')) events.push({ event: 'blink', card: card.id, cost: Number(capValue(card, 'blink-cost') || 0) });
  if (hasCap(card, 'is-etb-doubler') || hasCap(card, 'is-trigger-doubler')) events.push({ event: 'trigger-modifier', card: card.id });
  if (hasCap(card, 'is-artifact-cast-from-top-enabler')) events.push({ event: 'cast-from-zone', zone: 'library-top', card: card.id });
  return { card: card.id, deltas, events };
}

function failure(id, cards, reason, details = {}) {
  return {
    id,
    status: 'not-repeatable',
    cards: sorted(cards.map(card => card.id || card)),
    reason,
    details,
  };
}

function success(id, family, cards, proof, deltas = []) {
  return {
    id,
    status: 'proven',
    family,
    cards: sorted(cards.map(card => card.id || card)),
    proof,
    positiveDeltas: deltas,
  };
}

function find(cards, predicate) {
  return cards.find(predicate);
}

function proveDirectSelfLoop(cards) {
  const card = find(cards, c => hasCap(c, 'taps-for-mana') && hasCap(c, 'is-self-untapper'));
  if (!card) return null;
  const produces = Number(capValue(card, 'mana-produced') || 1);
  const cost = Number(capValue(card, 'self-untap-cost') || 0);
  const amplifier = find(cards, c => c !== card && hasCap(c, 'is-colorless-mana-amplifier'));
  const amplification = amplifier && hasCap(card, 'produces-colorless-mana') ? Number(capValue(amplifier, 'colorless-mana-amplifier') || 1) : 0;
  const totalProduced = produces + amplification;
  if (totalProduced <= cost) return failure('proof:self-untap-mana:' + sorted([card.id, amplifier && amplifier.id]).join('|'), uniqueCards([card, amplifier]), 'self-untap cost is not below produced mana', { produces, amplification, cost });
  const proofCards = uniqueCards([card, amplifier]);
  return success('proof:self-untap-mana:' + proofCards.map(c => c.id).sort().join('|'), 'self-untap-mana-loop', proofCards, {
    requiredFacts: [fact(card, 'taps-for-mana'), fact(card, 'is-self-untapper'), ...(amplifier ? [fact(amplifier, 'is-colorless-mana-amplifier')] : [])],
    steps: [
      { card: card.id, action: 'tap for mana', delta: { mana: totalProduced } },
      ...(amplifier ? [{ card: amplifier.id, action: 'static amplifier adds colorless mana to the tap output', delta: { mana: amplification } }] : []),
      { card: card.id, action: 'pay self-untap cost', delta: { mana: -cost } },
      { card: card.id, action: 'return to untapped abstract state' },
    ],
    repeatability: { status: 'repeatable', reason: 'abstract state repeats with positive mana delta' },
  }, [{ resource: 'mana', min: totalProduced - cost, max: totalProduced - cost }]);
}

function proveBlinkUntap(cards) {
  const blink = find(cards, c => hasCap(c, 'is-repeatable-blink'));
  const untapper = find(cards, c => c !== blink && (c.caps || []).some(cap => cap.startsWith('etb-untaps-land:')));
  if (!blink || !untapper) {
    const oneShotBlink = find(cards, c => hasCap(c, 'is-blink') && !hasCap(c, 'is-repeatable-blink'));
    const etbUntap = find(cards, c => (c.caps || []).some(cap => cap.startsWith('etb-untaps-land')));
    if (oneShotBlink && etbUntap) return failure('proof:blink-etb-not-repeatable:' + sorted(cards.map(c => c.id)).join('|'), cards, 'blink effect is not repeatable', { blink: oneShotBlink.id, etbUntap: etbUntap.id });
    return null;
  }
  const blinkCost = Number(capValue(blink, 'blink-cost') || 0);
  const untapCount = Number(capValue(untapper, 'etb-untaps-land') || 0);
  if (untapCount < blinkCost) return failure('proof:blink-etb-mana-negative:' + sorted(cards.map(c => c.id)).join('|'), [blink, untapper], 'untap count cannot cover repeatable blink cost', { blinkCost, untapCount });
  return success('proof:blink-etb-land-untap:' + sorted([blink.id, untapper.id]).join('|'), 'blink-etb-land-untap-loop', [blink, untapper], {
    requiredFacts: [fact(blink, 'is-repeatable-blink'), fact(untapper, 'etb-untaps-land')],
    steps: [
      { card: blink.id, action: 'pay repeatable blink cost', cost: { mana: blinkCost } },
      { card: untapper.id, action: 're-enters and untaps lands', delta: { untappedLands: untapCount } },
      { card: blink.id, action: 'abstract state repeats with blink engine available' },
    ],
    repeatability: { status: 'repeatable', reason: 'repeatable blink reuses the ETB untap trigger' },
  }, [{ resource: 'mana', min: untapCount - blinkCost, max: untapCount - blinkCost }]);
}

function proveLifeLoop(cards) {
  const gainFromLoss = find(cards, c => hasCap(c, 'is-lifegain-from-opponent-lifeloss'));
  const lossFromGain = find(cards, c => hasCap(c, 'is-lifeloss-from-your-lifegain'));
  if (!gainFromLoss || !lossFromGain) return null;
  return success('proof:lifegain-lifeloss:' + sorted([gainFromLoss.id, lossFromGain.id]).join('|'), 'lifegain-lifeloss-loop', [gainFromLoss, lossFromGain], {
    requiredFacts: [fact(gainFromLoss, 'is-lifegain-from-opponent-lifeloss'), fact(lossFromGain, 'is-lifeloss-from-your-lifegain')],
    steps: [
      { card: gainFromLoss.id, action: 'opponent life loss causes you to gain life' },
      { card: lossFromGain.id, action: 'your life gain causes opponent life loss' },
      { action: 'trigger cycle repeats while legal targets/opponents remain' },
    ],
    repeatability: { status: 'repeatable', reason: 'each trigger recreates the other trigger condition' },
  }, [{ resource: 'life', min: 1, max: Infinity }, { resource: 'opponentLife', min: -Infinity, max: -1 }]);
}

function proveMillLifeLossLoop(cards) {
  const millToLoss = find(cards, c => hasCap(c, 'is-mill-to-lifeloss-payoff'));
  const lossToMill = find(cards, c => c !== millToLoss && hasCap(c, 'is-lifeloss-to-mill-payoff'));
  if (!millToLoss || !lossToMill) {
    if (millToLoss || find(cards, c => hasCap(c, 'is-lifeloss-to-mill-payoff'))) {
      return failure(
        'proof:mill-lifeloss-one-way:' + sorted(cards.map(c => c.id)).join('|'),
        cards,
        'mill/life-loss package is one-way and cannot recreate the trigger condition',
        { hasMillToLoss: Boolean(millToLoss), hasLossToMill: Boolean(find(cards, c => hasCap(c, 'is-lifeloss-to-mill-payoff'))) },
      );
    }
    return null;
  }
  return success('proof:mill-lifeloss-feedback:' + sorted([millToLoss.id, lossToMill.id]).join('|'), 'mill-lifeloss-feedback-loop', [millToLoss, lossToMill], {
    requiredFacts: [fact(millToLoss, 'is-mill-to-lifeloss-payoff'), fact(lossToMill, 'is-lifeloss-to-mill-payoff')],
    steps: [
      { card: lossToMill.id, action: 'opponent life loss mills that opponent' },
      { card: millToLoss.id, action: 'milled cards entering the opponent graveyard cause life loss and life gain' },
      { action: 'the life loss recreates the mill trigger condition' },
    ],
    assumptions: ['an initial mill or life-loss event starts the cycle', 'the graveyard/life-loss triggers apply to the same opponent'],
    repeatability: { status: 'repeatable-candidate', reason: 'each mill/life-loss trigger recreates the other trigger condition' },
  }, [
    { resource: 'mill', min: 1, max: Infinity },
    { resource: 'life', min: 1, max: Infinity },
    { resource: 'opponentLife', min: -Infinity, max: -1 },
  ]);
}

function proveDrawDamageFeedback(cards) {
  const drawToDamage = find(cards, c => hasCap(c, 'is-draw-to-damage-payoff') && drawToDamageAcceptsYourDraw(c));
  const damageToDraw = find(cards, c => c !== drawToDamage && hasCap(c, 'is-damage-to-draw-payoff'));
  if (!drawToDamage || !damageToDraw) {
    const incompatibleDrawToDamage = find(cards, c => hasCap(c, 'is-draw-to-damage-payoff') && !drawToDamageAcceptsYourDraw(c));
    const anyDamageToDraw = find(cards, c => hasCap(c, 'is-damage-to-draw-payoff'));
    if (incompatibleDrawToDamage && anyDamageToDraw) {
      return failure(
        'proof:draw-damage-subject-mismatch:' + sorted([incompatibleDrawToDamage.id, anyDamageToDraw.id]).join('|'),
        [incompatibleDrawToDamage, anyDamageToDraw],
        'damage-to-draw effect draws cards for you, but draw-to-damage trigger does not react to your draws',
        { drawSubjects: (incompatibleDrawToDamage.caps || []).filter(cap => cap.startsWith('draw-to-damage-subject:')) },
      );
    }
    return null;
  }
  return success('proof:draw-damage-feedback:' + sorted([drawToDamage.id, damageToDraw.id]).join('|'), 'draw-damage-feedback-loop', [drawToDamage, damageToDraw], {
    requiredFacts: [fact(drawToDamage, (drawToDamage.caps || []).find(cap => cap.startsWith('draw-to-damage-subject:')) || 'is-draw-to-damage-payoff'), fact(damageToDraw, 'is-damage-to-draw-payoff')],
    steps: [
      { card: drawToDamage.id, action: 'a draw trigger deals damage' },
      { card: damageToDraw.id, action: 'that damage creates a draw trigger' },
      { action: 'the new draw recreates the damage trigger condition' },
    ],
    assumptions: ['a legal source/attachment or equivalent scope makes the damage-to-draw trigger apply to the damage source', 'an initial draw or damage event starts the cycle'],
    repeatability: { status: 'repeatable-candidate', reason: 'each draw/damage trigger recreates the other trigger condition' },
  }, [
    { resource: 'cards', min: 1, max: Infinity },
    { resource: 'damage', min: 1, max: Infinity },
  ]);
}

function proveLifelinkCounterDamageLoop(cards) {
  const engine = find(cards, c => hasCap(c, 'is-lifelink-counter-engine'));
  const source = find(cards, c => c !== engine && hasCap(c, 'is-counter-to-damage-source'));
  if (!engine || !source) return null;
  if (!MODEL.faceCompatibleCaps(source, ['is-creature-permanent', 'is-counter-to-damage-source'])) {
    return failure(
      'proof:lifelink-counter-damage-target-illegal:' + sorted([engine.id, source.id]).join('|'),
      [engine, source],
      'lifelink/counter engine cannot legally target the counter-damage source as a creature',
      { sourceCaps: (source.caps || []).filter(cap => /creature|counter-to-damage/.test(cap)) },
    );
  }
  return success('proof:lifelink-counter-damage:' + sorted([engine.id, source.id]).join('|'), 'lifelink-counter-damage-loop', [engine, source], {
    requiredFacts: [
      fact(engine, 'is-lifelink-counter-engine'),
      fact(engine, 'grants-lifelink-to-creature'),
      fact(engine, 'is-lifegain-to-counter-payoff'),
      fact(source, 'is-counter-to-damage-source'),
      fact(source, 'is-creature-permanent'),
    ],
    steps: [
      { card: engine.id, action: 'grants lifelink to the counter-fueled damage creature' },
      { card: source.id, action: 'removes a +1/+1 counter to deal damage', delta: { counters: -1, damage: 1 } },
      { card: source.id, action: 'lifelink on that damage causes you to gain life', delta: { life: 1 } },
      { card: engine.id, action: 'lifegain trigger puts a +1/+1 counter back on the damage source', delta: { counters: 1 } },
      { action: 'the spent counter is restored and the loop can repeat' },
    ],
    assumptions: ['the damage source starts with or can receive an initial +1/+1 counter', 'the lifelink grant and counter trigger target the same creature'],
    repeatability: { status: 'repeatable-candidate', reason: 'each damage event restores the counter consumed to create it' },
  }, [
    { resource: 'damage', min: 1, max: Infinity },
    { resource: 'life', min: 1, max: Infinity },
  ]);
}

function proveOpponentDrawPunisherWin(cards) {
  const drawSource = find(cards, c => hasCap(c, 'is-mass-opponent-draw-source'));
  const punisher = find(cards, c => c !== drawSource && hasCap(c, 'is-opponent-draw-punisher'));
  if (!drawSource || !punisher) {
    const anyPunisher = find(cards, c => hasCap(c, 'is-opponent-draw-punisher'));
    const anyDraw = find(cards, c => c !== anyPunisher && (c.produces || {}).draw);
    if (anyPunisher && anyDraw) {
      return failure(
        'proof:opponent-draw-punisher-threshold-negative:' + sorted([anyPunisher.id, anyDraw.id]).join('|'),
        [anyPunisher, anyDraw],
        'draw source is not large enough to prove a threshold win with the opponent-draw punisher',
        { drawSource: anyDraw.id },
      );
    }
    return null;
  }
  const drawCount = Number(capValue(drawSource, 'mass-opponent-draw-count') || 20);
  const perDrawDamage = Number(capValue(punisher, 'opponent-draw-punisher-damage') || 1);
  if (drawCount * perDrawDamage < 20) {
    return failure(
      'proof:opponent-draw-punisher-insufficient:' + sorted([drawSource.id, punisher.id]).join('|'),
      [drawSource, punisher],
      'mass draw plus punisher does not meet the threshold win budget',
      { drawCount, perDrawDamage },
    );
  }
  return success('proof:opponent-draw-punisher-win:' + sorted([drawSource.id, punisher.id]).join('|'), 'opponent-draw-punisher-win', [drawSource, punisher], {
    requiredFacts: [fact(drawSource, 'is-mass-opponent-draw-source'), fact(punisher, 'is-opponent-draw-punisher')],
    steps: [
      { card: drawSource.id, action: 'target opponent or each player draws a very large number of cards', delta: { opponentDraws: drawCount } },
      { card: punisher.id, action: 'opponent-draw trigger punishes each draw', delta: { damageOrLifeLoss: drawCount * perDrawDamage } },
      { action: 'threshold damage/life loss is enough to be treated as a deterministic win package under bounded assumptions' },
    ],
    assumptions: ['the large draw is aimed at an opponent or applies to all players', 'opponent has a normal Commander-size life total or less after prior game actions'],
    repeatability: { status: 'non-loop-win', reason: 'finite threshold win package, not an infinite loop' },
  }, [{ resource: 'winCondition', delta: 'opponent mass-draw punisher win' }]);
}

function proveMillMultiplierFinisher(cards) {
  const source = find(cards, c => hasCap(c, 'is-half-library-mill-source'));
  const multiplier = find(cards, c => c !== source && hasCap(c, 'is-mill-multiplier'));
  if (!source || !multiplier) {
    const anyMultiplier = find(cards, c => hasCap(c, 'is-mill-multiplier'));
    const anyMill = find(cards, c => c !== anyMultiplier && hasCap(c, 'is-mill-source'));
    if (anyMultiplier && anyMill) {
      return failure(
        'proof:mill-multiplier-small-mill:' + sorted([anyMultiplier.id, anyMill.id]).join('|'),
        [anyMultiplier, anyMill],
        'mill source is not a half-library threshold effect',
        { millSource: anyMill.id },
      );
    }
    return null;
  }
  return success('proof:mill-multiplier-finite:' + sorted([source.id, multiplier.id]).join('|'), 'mill-multiplier-finite-mill', [source, multiplier], {
    requiredFacts: [fact(source, 'is-half-library-mill-source'), fact(multiplier, 'is-mill-multiplier')],
    steps: [
      { card: source.id, action: 'mills half of the affected library, rounded up' },
      { card: multiplier.id, action: 'replacement effect doubles that mill amount' },
      { action: 'the affected library is emptied under the rounded-up half-library threshold' },
    ],
    assumptions: ['the half-library mill mode is chosen or paid for', 'the affected opponent is the player whose mill is doubled'],
    repeatability: { status: 'non-loop-threshold', reason: 'finite mill threshold, not an infinite loop' },
  }, [{ resource: 'mill', min: 1, max: Infinity }]);
}

function proveTopLoop(cards) {
  const topPiece = find(cards, c => hasCap(c, 'is-self-top-draw-artifact'));
  const reducer = find(cards, c => hasCap(c, 'is-artifact-spell-cost-reducer'));
  const caster = find(cards, c => hasCap(c, 'is-artifact-cast-from-top-enabler'));
  if (!topPiece || !reducer || !caster) return null;
  return success('proof:artifact-top-loop:' + sorted([topPiece.id, reducer.id, caster.id]).join('|'), 'artifact-top-cost-reduction-loop', [topPiece, reducer, caster], {
    requiredFacts: [fact(topPiece, 'is-self-top-draw-artifact'), fact(reducer, 'is-artifact-spell-cost-reducer'), fact(caster, 'is-artifact-cast-from-top-enabler')],
    steps: [
      { card: reducer.id, action: 'reduces the artifact loop piece cost' },
      { card: caster.id, action: 'casts the loop piece from the top of the library' },
      { card: topPiece.id, action: 'draws a card and returns itself to library top' },
      { action: 'library-top abstract state repeats' },
    ],
    repeatability: { status: 'repeatable-candidate', reason: 'same top-card state repeats; exact payment proof remains bounded by assumptions' },
  }, [{ resource: 'cards', min: 1, max: 1 }]);
}

function proveRecursiveBodySacrificeMana(cards) {
  const bodies = cards.filter(c => hasCap(c, 'is-recursive-body'));
  const outlets = cards.filter(c => hasCap(c, 'is-mana-sac-outlet'));
  const failures = [];
  for (const body of bodies) {
    for (const outlet of outlets) {
      if (outlet === body) continue;
      const cost = recursiveCostProfile(body);
      const outletMana = sacOutletManaProfile(outlet);
      let support = null;
      let supportMana = { total: 0, any: 0, colorless: 0, colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])) };
      let mana = outletMana;
      if (!canPayRecursiveCost(cost, outletMana)) {
        support = find(cards, c => c !== body && c !== outlet && hasCap(c, 'is-death-mana-payoff')
          && canPayRecursiveCost(cost, addManaProfiles(outletMana, deathManaProfile(c))));
        if (support) {
          supportMana = deathManaProfile(support);
          mana = addManaProfiles(outletMana, supportMana);
        }
      }
      if (!canPayRecursiveCost(cost, mana)) {
        failures.push(failure(
          'proof:recursive-body-sacrifice-mana-negative:' + sorted([body.id, outlet.id]).join('|'),
          [body, outlet],
          'sacrifice outlet mana cannot cover recursive body cost',
          { produced: outletMana, cost },
        ));
        continue;
      }
      const preconditionRoleCaps = new Map([[outlet.id, ['is-mana-sac-outlet', 'sac-outlet-mana-produced']]]);
      if (support) preconditionRoleCaps.set(support.id, ['is-death-mana-payoff', 'death-mana-produced']);
      const precondition = recursiveBodyPreconditionSupport(body, uniqueCards([body, outlet, support, ...cards]), preconditionRoleCaps);
      if (!precondition.ok) {
        failures.push(failure(
          'proof:recursive-body-sacrifice-mana-precondition:' + sorted([body.id, outlet.id]).join('|'),
          [body, outlet],
          precondition.reason,
          { requiredFacts: precondition.facts },
        ));
        continue;
      }
      const netMana = mana.total - cost.total;
      const proofCards = uniqueCards([body, outlet, support, ...precondition.supportCards]);
      const deltas = [
        { resource: 'deathTriggers', min: 1, max: Infinity },
        { resource: 'sacrifices', min: 1, max: Infinity },
        { resource: 'etbTriggers', min: 1, max: Infinity },
      ];
      if (hasCap(body, 'is-recursive-cast-body')) deltas.push({ resource: 'casts', min: 1, max: Infinity });
      if (netMana > 0) deltas.push({ resource: 'mana', min: netMana, max: netMana });
      return success('proof:recursive-body-sacrifice-mana:' + sorted(proofCards.map(card => card.id)).join('|'), 'recursive-body-sacrifice-mana-loop', proofCards, {
        requiredFacts: [
          fact(body, 'is-recursive-body'),
          fact(body, 'recursive-body-cost'),
          fact(outlet, 'is-mana-sac-outlet'),
          fact(outlet, 'sac-outlet-mana-produced'),
          ...precondition.facts,
          ...(support ? [fact(support, 'is-death-mana-payoff'), fact(support, 'death-mana-produced')] : []),
        ],
        steps: [
          { card: outlet.id, action: 'sacrifice the recursive body for mana', delta: { mana: outletMana.total, death: 1, sacrifice: 1 } },
          ...(support ? [{ card: support.id, action: 'death trigger creates mana-token resource for the recursion payment', delta: { mana: supportMana.total } }] : []),
          ...precondition.steps,
          { card: body.id, action: 'spend package mana to recast or return the same body', cost: { mana: cost.total, colors: cost.colors, colorless: cost.colorless } },
          { action: 'the same body is available again and the abstract state repeats' },
        ],
        assumptions: hasCap(body, 'recursive-body-requires-another-creature') ? ['the named support creature remains controlled while the recursive body is in the graveyard'] : [],
        repeatability: { status: netMana > 0 ? 'repeatable' : 'repeatable-break-even', reason: 'sacrifice outlet mana covers the body recursion cost, including colored requirements, and restores the body' },
      }, deltas);
    }
  }
  return failures[0] || null;
}

function proveLifePaidTreasureRecursiveDrain(cards) {
  const bodies = cards.filter(c => hasCap(c, 'is-recursive-cast-body'));
  const outlets = cards.filter(c => hasCap(c, 'is-life-paid-treasure-sac-outlet'));
  const payoffs = cards.filter(c => hasCap(c, 'is-death-drain-payoff') && (c.produces || {}).lifegain);
  const failures = [];
  for (const body of bodies) {
    for (const outlet of outlets) {
      if (outlet === body) continue;
      const cost = recursiveCostProfile(body);
      const outletMana = lifePaidTreasureSacOutletProfile(outlet);
      if (!canPayRecursiveCost(cost, outletMana)) {
        failures.push(failure(
          'proof:life-paid-treasure-recursive-drain-mana-negative:' + sorted([body.id, outlet.id]).join('|'),
          [body, outlet],
          'life-paid Treasure sacrifice outlet cannot cover recursive body cast cost',
          { produced: outletMana, cost },
        ));
        continue;
      }
      const typePrecondition = recursiveControlTypePrecondition(body, cards);
      if (!typePrecondition.ok) {
        failures.push(failure(
          'proof:life-paid-treasure-recursive-drain-type-precondition:' + sorted([body.id, outlet.id]).join('|'),
          [body, outlet],
          typePrecondition.reason,
          { requiredFacts: typePrecondition.facts },
        ));
        continue;
      }
      if (outletMana.lifeCost > 1) {
        failures.push(failure(
          'proof:life-paid-treasure-recursive-drain-life-negative:' + sorted([body.id, outlet.id]).join('|'),
          [body, outlet],
          'death-drain lifegain does not prove replenishing a multi-life outlet cost',
          { lifeCost: outletMana.lifeCost },
        ));
        continue;
      }
      for (const payoff of payoffs) {
        if (payoff === body || payoff === outlet) continue;
        const proofCards = uniqueCards([body, outlet, payoff, typePrecondition.support]);
        return success('proof:life-paid-treasure-recursive-drain:' + sorted(proofCards.map(card => card.id)).join('|'), 'life-paid-treasure-recursive-drain-loop', proofCards, {
          requiredFacts: [
            fact(body, 'is-recursive-cast-body'),
            fact(body, 'recursive-body-cost'),
            fact(outlet, 'is-life-paid-treasure-sac-outlet'),
            fact(outlet, 'life-sac-outlet-life-cost'),
            fact(outlet, 'life-sac-outlet-mana-produced'),
            fact(payoff, 'is-death-drain-payoff'),
            ...typePrecondition.facts,
          ],
          steps: [
            { card: outlet.id, action: 'pay life and sacrifice the recursive body to create a Treasure token', delta: { life: -outletMana.lifeCost, death: 1, sacrifice: 1, treasure: outletMana.total } },
            { card: payoff.id, action: 'death trigger drains an opponent and restores the life payment', delta: { life: 1, opponentLife: -1 } },
            { card: body.id, action: 'spend the Treasure mana to recast the recursive body', cost: { mana: cost.total, colors: cost.colors, colorless: cost.colorless } },
            ...typePrecondition.steps,
            { action: 'the same body, outlet, and payoff state repeats with the life payment replenished' },
          ],
          assumptions: ['the death-drain trigger targets an opponent when a target is required'],
          repeatability: { status: 'repeatable-break-even', reason: 'Treasure mana covers the recursive cast cost and death-drain lifegain covers the outlet life payment' },
        }, [
          { resource: 'deathTriggers', min: 1, max: Infinity },
          { resource: 'sacrifices', min: 1, max: Infinity },
          { resource: 'etbTriggers', min: 1, max: Infinity },
          { resource: 'casts', min: 1, max: Infinity },
          { resource: 'opponentLife', min: -Infinity, max: -1 },
        ]);
      }
      failures.push(failure(
        'proof:life-paid-treasure-recursive-drain-no-lifegain-payoff:' + sorted([body.id, outlet.id]).join('|'),
        [body, outlet],
        'life-paid recursive Treasure loop needs a package-local death-drain payoff that restores life',
        { lifeCost: outletMana.lifeCost },
      ));
    }
  }
  return failures[0] || null;
}

function canEtbBlinkTarget(blinker, target) {
  return MODEL.canEtbBlinkTarget(blinker, target);
}

function etbBlinkTargetFacts(blinker, target) {
  return MODEL.etbBlinkTargetCaps(blinker).map(predicate => fact(target, predicate));
}

function proveMutualEtbBlinkReset(cards) {
  const blinkers = cards.filter(c => hasCap(c, 'is-etb-blink'));
  const failures = [];
  for (const a of blinkers) {
    for (const b of blinkers) {
      if (a === b) continue;
      if (!canEtbBlinkTarget(a, b) || !canEtbBlinkTarget(b, a)) {
        failures.push(failure(
          'proof:mutual-etb-blink-target-mismatch:' + sorted([a.id, b.id]).join('|'),
          [a, b],
          'ETB blink target scopes cannot reset each other',
          { firstCanTargetSecond: canEtbBlinkTarget(a, b), secondCanTargetFirst: canEtbBlinkTarget(b, a) },
        ));
        continue;
      }
      return success('proof:mutual-etb-blink-reset:' + sorted([a.id, b.id]).join('|'), 'mutual-etb-blink-reset-loop', [a, b], {
        requiredFacts: [
          fact(a, 'is-etb-blink'),
          fact(b, 'is-etb-blink'),
          ...etbBlinkTargetFacts(a, b),
          ...etbBlinkTargetFacts(b, a),
        ],
        steps: [
          { card: a.id, action: 'enters and exiles/returns the partner permanent' },
          { card: b.id, action: 'partner re-enters and exiles/returns the first permanent' },
          { action: 'both ETB triggers are restored and can repeat the same reset cycle' },
        ],
        assumptions: ['both ETB blink triggers are mandatory or can be chosen to target the partner', 'target restrictions are represented by the broad creature/permanent scope caps'],
        repeatability: { status: 'repeatable-candidate', reason: 'each ETB blink can legally reset the other permanent' },
      }, [
        { resource: 'etbTriggers', min: 1, max: Infinity },
        { resource: 'ltbTriggers', min: 1, max: Infinity },
      ]);
    }
  }
  const oneShotBlink = find(cards, c => hasCap(c, 'is-blink') && !hasCap(c, 'is-etb-blink') && !hasCap(c, 'is-repeatable-blink'));
  const etbBlink = find(cards, c => hasCap(c, 'is-etb-blink'));
  if (oneShotBlink && etbBlink) return failure('proof:mutual-etb-blink-one-shot:' + sorted([oneShotBlink.id, etbBlink.id]).join('|'), [oneShotBlink, etbBlink], 'one-shot blink is not restored by the mutual ETB blink cycle', { blink: oneShotBlink.id });
  return failures[0] || null;
}

function proveTokenReplacementSacrificeMana(cards) {
  const replacers = cards.filter(c => hasCap(c, 'is-token-to-creature-token-replacer'));
  const outlets = cards.filter(c => hasCap(c, 'is-creature-sac-outlet'));
  const payoffs = cards.filter(c => hasCap(c, 'is-death-mana-payoff'));
  if (!replacers.length || !payoffs.length) return null;
  if (!outlets.length) return failure(
    'proof:token-replacement-sacrifice-missing-outlet:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'token replacement and death-mana payoff need a local creature sacrifice outlet',
  );
  const failures = [];
  for (const replacer of replacers) {
    for (const outlet of outlets) {
      for (const payoff of payoffs) {
        if (payoff === outlet) continue;
        const activationCost = manaCostProfileFromCaps(outlet, 'sac-outlet-activation');
        const deathMana = deathManaProfile(payoff);
        if (!canPayRecursiveCost(activationCost, deathMana)) {
          failures.push(failure(
            'proof:token-replacement-sacrifice-cost:' + sorted([replacer.id, outlet.id, payoff.id]).join('|'),
            uniqueCards([replacer, outlet, payoff]),
            'death-mana token cannot cover the sacrifice outlet activation cost',
            { activationCost, deathMana },
          ));
          continue;
        }
        const netMana = deathMana.total - activationCost.total;
        const proofCards = uniqueCards([replacer, outlet, payoff]);
        const deltas = [
          { resource: 'deathTriggers', min: 1, max: Infinity },
          { resource: 'sacrifices', min: 1, max: Infinity },
          { resource: 'tokens', min: 1, max: Infinity },
        ];
        if (netMana > 0) deltas.push({ resource: 'mana', min: netMana, max: netMana });
        return success('proof:token-replacement-sacrifice-mana:' + proofCards.map(card => card.id).sort().join('|'), 'token-replacement-sacrifice-mana-loop', proofCards, {
          requiredFacts: [
            fact(replacer, 'is-token-to-creature-token-replacer'),
            fact(outlet, 'is-creature-sac-outlet'),
            fact(payoff, 'is-death-mana-payoff'),
          ],
          steps: [
            { card: outlet.id, action: 'sacrifice a creature token as repeatable fodder', cost: { mana: activationCost.total } },
            { card: payoff.id, action: 'death trigger creates a mana token', delta: { mana: deathMana.total, death: 1, sacrifice: 1 } },
            { card: replacer.id, action: 'token replacement adds creature-token fodder to the mana-token event' },
            { action: 'the package restores mana payment and creature fodder for the next activation' },
          ],
          assumptions: ['the loop starts with a legal creature token/fodder state', 'the replacement effect applies to the death-mana token event'],
          repeatability: { status: netMana > 0 ? 'repeatable' : 'repeatable-break-even', reason: 'death-mana pays the outlet and token replacement restores sacrifice fodder' },
        }, deltas);
      }
    }
  }
  return failures[0] || null;
}

function proveAristocrats(cards) {
  const outlet = find(cards, c => hasCap(c, 'is-sac-outlet'));
  const payoff = find(cards, c => ['is-death-drain-payoff', 'is-death-draw-payoff', 'is-death-token-payoff'].some(cap => hasCap(c, cap)));
  const body = find(cards, c => c !== outlet && c !== payoff && (hasCap(c, 'is-creature-token-producer') || hasCap(c, 'is-body')));
  if (!outlet || !payoff || !body) return null;
  if (!hasCap(body, 'is-creature-token-producer')) return failure('proof:aristocrats-not-repeatable:' + sorted([body.id, outlet.id, payoff.id]).join('|'), [body, outlet, payoff], 'body is not replenished by the package', { body: body.id, outlet: outlet.id, payoff: payoff.id });
  const deltas = [
    { resource: 'deathTriggers', min: 1, max: Infinity },
    { resource: 'sacrifices', min: 1, max: Infinity },
  ];
  if (hasCap(payoff, 'is-death-drain-payoff')) {
    deltas.push({ resource: 'life', min: 1, max: Infinity });
    deltas.push({ resource: 'opponentLife', min: -Infinity, max: -1 });
  }
  if (hasCap(payoff, 'is-death-draw-payoff')) deltas.push({ resource: 'cards', min: 1, max: Infinity });
  if (hasCap(payoff, 'is-death-token-payoff')) deltas.push({ resource: 'tokens', min: 1, max: Infinity });
  return success('proof:aristocrats:' + sorted([body.id, outlet.id, payoff.id]).join('|'), 'aristocrats-body-outlet-payoff', [body, outlet, payoff], {
    requiredFacts: [fact(body, 'is-creature-token-producer'), fact(outlet, 'is-sac-outlet'), deathPayoffFact(payoff)],
    steps: [
      { card: body.id, action: 'creates or supplies creature bodies' },
      { card: outlet.id, action: 'sacrifices a body to create a death event' },
      { card: payoff.id, action: 'turns death event into deterministic payoff' },
    ],
    repeatability: { status: 'repeatable-candidate', reason: 'body production can replenish sacrifice fodder' },
  }, deltas);
}

function proveTokenModifierPayoff(cards) {
  const modifier = find(cards, c => hasCap(c, 'is-token-doubler'));
  const source = find(cards, c => c !== modifier && hasCap(c, 'is-token-producer'));
  const payoff = find(cards, c => c !== source && c !== modifier && ((c.consumes || {}).tokens || hasCap(c, 'is-combat-payoff') || hasCap(c, 'is-width-payoff')));
  if (!source || !modifier || !payoff) return null;
  return success('proof:token-modifier-payoff:' + sorted([source.id, modifier.id, payoff.id]).join('|'), 'token-source-modifier-payoff', [source, modifier, payoff], {
    requiredFacts: [fact(source, 'is-token-producer'), fact(modifier, 'is-token-doubler'), tokenPayoffFact(payoff)],
    steps: [
      { card: source.id, action: 'creates token event' },
      { card: modifier.id, action: 'applies replacement/static token modifier before payoff checks' },
      { card: payoff.id, action: 'sees amplified token event' },
    ],
    repeatability: { status: 'value-engine', reason: 'not automatically a loop without source repeatability' },
  }, [{ resource: 'tokens', min: 2, max: Infinity }]);
}

function proveLibraryExileWin(cards) {
  const source = find(cards, c => hasCap(c, 'is-library-exile-source'));
  const payoff = find(cards, c => c !== source && hasCap(c, 'is-empty-library-win-payoff'));
  if (!source || !payoff) return null;
  return success('proof:library-exile-empty-library-win:' + sorted([source.id, payoff.id]).join('|'), 'library-exile-empty-library-win', [source, payoff], {
    requiredFacts: [fact(source, 'is-library-exile-source'), fact(payoff, 'is-empty-library-win-payoff')],
    steps: [
      { card: source.id, action: 'moves or exiles enough library cards to lower the remaining-library count' },
      { card: payoff.id, action: 'checks the remaining library size against its win condition' },
      { action: 'non-loop win condition resolves when the library-size predicate is satisfied' },
    ],
    assumptions: ['the source can be sequenced so the payoff sees a low enough library count'],
    repeatability: { status: 'non-loop-win', reason: 'this is a deterministic win package, not a repeatable resource loop' },
  }, [{ resource: 'winCondition', delta: 'empty-library win' }]);
}

function proveImprintUntapSpellLoop(cards) {
  const untapSpell = find(cards, c => hasCap(c, 'is-cheap-instant-nonland-permanent-untap-spell'));
  const caster = find(cards, c => c !== untapSpell && hasCap(c, 'is-repeatable-cheap-instant-caster'));
  if (!untapSpell || !caster) return null;
  return success('proof:imprint-untap-spell-loop:' + sorted([untapSpell.id, caster.id]).join('|'), 'imprint-untap-spell-loop', [untapSpell, caster], {
    requiredFacts: [fact(untapSpell, 'is-cheap-instant-nonland-permanent-untap-spell'), fact(caster, 'is-repeatable-cheap-instant-caster')],
    steps: [
      { card: caster.id, action: 'stores or repeatedly copies a cheap instant spell' },
      { card: untapSpell.id, action: 'untaps nonland permanents controlled by the player' },
      { card: caster.id, action: 'the untap includes the repeatable caster, restoring the starting tap state' },
    ],
    assumptions: ['nonland permanents can pay the repeatable casting cost and may produce surplus mana'],
    limitingClauses: ['mana positivity depends on the external nonland permanent mana sources in play'],
    repeatability: { status: 'repeatable-candidate', reason: 'the caster and untap spell restore the same abstract state each iteration' },
  }, [
    { resource: 'storm', min: 1, max: Infinity },
    { resource: 'nonlandPermanentUntaps', min: 1, max: Infinity },
  ]);
}

function proveSelfUntapAbilityCopyLoop(cards) {
  const copier = find(cards, c => hasCap(c, 'is-activated-ability-copier'));
  const selfUntapper = find(cards, c => c !== copier && hasCap(c, 'is-self-untapper') && hasCap(c, 'taps-for-mana'));
  if (!copier || !selfUntapper) return null;
  const produces = Number(capValue(selfUntapper, 'mana-produced') || 1);
  const untapCost = Number(capValue(selfUntapper, 'self-untap-cost') || 0);
  const copyCost = Number(capValue(copier, 'ability-copy-cost') || 0);
  if (produces < untapCost) {
    return failure('proof:self-untap-copy-cost-negative:' + sorted([copier.id, selfUntapper.id]).join('|'), [copier, selfUntapper], 'self-untap mana cannot cover its own untap activation before copying', { produces, untapCost, copyCost });
  }
  if (produces <= copyCost) {
    return failure('proof:self-untap-copy-no-positive-delta:' + sorted([copier.id, selfUntapper.id]).join('|'), [copier, selfUntapper], 'copied untap does not create positive mana after copy cost', { produces, untapCost, copyCost });
  }
  return success('proof:self-untap-mana-ability-copy:' + sorted([copier.id, selfUntapper.id]).join('|'), 'self-untap-mana→ability-copy-loop', [copier, selfUntapper], {
    requiredFacts: [fact(copier, 'is-activated-ability-copier'), fact(selfUntapper, 'is-self-untapper'), fact(selfUntapper, 'taps-for-mana')],
    steps: [
      { card: selfUntapper.id, action: 'tap for mana', delta: { mana: produces } },
      { card: selfUntapper.id, action: 'activate self-untap ability', cost: { mana: untapCost } },
      { card: copier.id, action: 'copy the nonmana untap ability', cost: { mana: copyCost } },
      { card: selfUntapper.id, action: 'use the copied untap to tap for mana before the original untap resolves' },
      { action: 'original untap resolves and restores the starting untapped state' },
    ],
    repeatability: { status: 'repeatable', reason: 'copying the self-untap ability creates an extra tap-for-mana window each cycle' },
  }, [{ resource: 'mana', min: produces - copyCost, max: produces - copyCost }]);
}

function proveHastyCopyEtbUntapLoop(cards) {
  const copier = find(cards, c => hasCap(c, 'is-repeatable-hasty-creature-copy'));
  const untapper = find(cards, c => c !== copier && hasCap(c, 'etb-untaps-permanent'));
  if (!copier || !untapper) return null;
  if (!canHastyCopyTarget(copier, untapper, ['etb-untaps-permanent'])) {
    return failure(
      'proof:hasty-copy-etb-untap-target-illegal:' + sorted([copier.id, untapper.id]).join('|'),
      [copier, untapper],
      'hasty creature-copy target restrictions cannot copy the ETB untapper',
      {
        targetIsCreature: isCreaturePermanent(untapper),
        targetIsLegendary: isLegendaryPermanent(untapper),
        requiresNonlegendary: hasCap(copier, 'hasty-copy-target-requires-nonlegendary'),
      },
    );
  }
  return success('proof:hasty-copy-etb-untap:' + sorted([copier.id, untapper.id]).join('|'), 'hasty-copy→etb-untap-loop', [copier, untapper], {
    requiredFacts: [
      fact(copier, 'is-repeatable-hasty-creature-copy'),
      fact(copier, 'hasty-copy-target-creature'),
      fact(untapper, 'etb-untaps-permanent'),
      fact(untapper, 'is-creature-permanent'),
      ...(hasCap(copier, 'hasty-copy-target-requires-nonlegendary') ? [fact(untapper, 'is-nonlegendary-permanent')] : []),
    ],
    steps: [
      { card: copier.id, action: 'creates a hasty token copy of the ETB untapper' },
      { card: untapper.id, action: 'token copy enters and untaps the repeatable copier' },
      { action: 'the hasty copy engine is restored and can repeat' },
    ],
    repeatability: { status: 'repeatable-candidate', reason: 'the ETB untap can target the repeatable copy engine' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
  ]);
}

function proveSpellCopyCreatureCopyLoop(cards) {
  const spellCopier = find(cards, c => hasCap(c, 'is-etb-spell-copier'));
  const creatureCopySpell = find(cards, c => c !== spellCopier && hasCap(c, 'is-hasty-creature-copy-spell'));
  if (!spellCopier || !creatureCopySpell) return null;
  if (!canHastyCopySpellTarget(creatureCopySpell, spellCopier, ['is-etb-spell-copier'])) {
    return failure(
      'proof:spell-copy-creature-copy-target-illegal:' + sorted([spellCopier.id, creatureCopySpell.id]).join('|'),
      [spellCopier, creatureCopySpell],
      'hasty creature-copy spell cannot target the ETB spell copier',
      {
        targetIsCreature: isCreaturePermanent(spellCopier),
        targetIsLegendary: isLegendaryPermanent(spellCopier),
        requiresNonlegendary: hasCap(creatureCopySpell, 'hasty-copy-spell-target-requires-nonlegendary'),
      },
    );
  }
  return success('proof:spell-copy-creature-copy:' + sorted([spellCopier.id, creatureCopySpell.id]).join('|'), 'spell-copy-etb→creature-copy-spell-loop', [spellCopier, creatureCopySpell], {
    requiredFacts: [
      fact(spellCopier, 'is-etb-spell-copier'),
      fact(spellCopier, 'is-creature-permanent'),
      ...(hasCap(creatureCopySpell, 'hasty-copy-spell-target-requires-nonlegendary') ? [fact(spellCopier, 'is-nonlegendary-permanent')] : []),
      fact(creatureCopySpell, 'is-hasty-creature-copy-spell'),
      fact(creatureCopySpell, 'hasty-copy-spell-target-creature'),
    ],
    steps: [
      { card: creatureCopySpell.id, action: 'creates a hasty token copy of the ETB spell copier' },
      { card: spellCopier.id, action: 'the token ETB copies the creature-copy spell' },
      { action: 'the copied spell targets the original spell copier, recreating the ETB copy state' },
    ],
    assumptions: ['the creature-copy spell is on the stack with a legal spell-copier target when the ETB trigger resolves'],
    repeatability: { status: 'repeatable-candidate', reason: 'each copied spell makes another spell-copying ETB token' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'magecraftTriggers', min: 1, max: Infinity },
  ]);
}

function cardsById(cards) {
  return Object.fromEntries((cards || []).map(card => [card.id, card]));
}

function faceIncompatibilityRejection(proof, indexedCards) {
  const requiredFacts = (proof.proof && proof.proof.requiredFacts) || [];
  const conflicts = FACE_CLASSIFICATION.incompatibleFaceFacts(indexedCards, requiredFacts);
  if (!conflicts.length) return null;
  return failure(
    'proof:face-incompatible:' + proof.id,
    proof.cards,
    'required facts are sourced from mutually exclusive faces of one physical card',
    { proof: proof.id, family: proof.family, conflicts },
  );
}

function provePackage(rawCards, options = {}) {
  const limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});
  const cards = (rawCards || []).map(normalizeCard);
  if (cards.length > limits.maxCards) {
    return {
      status: 'bounded-out',
      reason: `package has ${cards.length} cards; maxCards is ${limits.maxCards}`,
      limits,
      proofs: [],
      rejections: [],
    };
  }
  const indexes = buildInteractionIndexes(cards);
  const hypergraph = buildInteractionHypergraph(indexes, { perCardPairLimit: limits.maxBranches, perCardTripleLimit: limits.maxBranches });
  const state = abstractInitialState(cards, hypergraph, limits);
  const transitions = cards.map(transitionForCard);
  const results = [
    proveDirectSelfLoop(cards),
    proveBlinkUntap(cards),
    proveLifeLoop(cards),
    proveMillLifeLossLoop(cards),
    proveDrawDamageFeedback(cards),
    proveLifelinkCounterDamageLoop(cards),
    proveOpponentDrawPunisherWin(cards),
    proveMillMultiplierFinisher(cards),
    proveTopLoop(cards),
    proveRecursiveBodySacrificeMana(cards),
    proveLifePaidTreasureRecursiveDrain(cards),
    proveMutualEtbBlinkReset(cards),
    proveTokenReplacementSacrificeMana(cards),
    proveAristocrats(cards),
    proveTokenModifierPayoff(cards),
    proveLibraryExileWin(cards),
    proveImprintUntapSpellLoop(cards),
    proveSelfUntapAbilityCopyLoop(cards),
    proveHastyCopyEtbUntapLoop(cards),
    proveSpellCopyCreatureCopyLoop(cards),
  ].filter(Boolean);
  const indexedCards = cardsById(cards);
  const faceRejections = results
    .filter(r => r.status === 'proven')
    .map(proof => faceIncompatibilityRejection(proof, indexedCards))
    .filter(Boolean);
  const rejectedProofIds = new Set(faceRejections.map(rejection => rejection.details && rejection.details.proof));
  const proofs = results.filter(r => r.status === 'proven' && !rejectedProofIds.has(r.id));
  const rejections = [...results.filter(r => r.status !== 'proven'), ...faceRejections];
  return {
    status: proofs.length ? 'proven' : rejections.length ? 'not-repeatable' : 'no-proof',
    limits,
    state,
    transitions,
    hyperedges: hypergraph.hyperedges,
    proofs,
    rejections,
  };
}

function boundedProofSearch(packages, options = {}) {
  const list = Array.isArray(packages && packages[0]) ? packages : [packages];
  return {
    version: 'bounded-proof-search.v1',
    limits: Object.assign({}, DEFAULT_LIMITS, options.limits || {}),
    results: list.map(pkg => provePackage(pkg, options)),
  };
}

module.exports = {
  DEFAULT_LIMITS,
  abstractInitialState,
  boundedProofSearch,
  provePackage,
  transitionForCard,
};
