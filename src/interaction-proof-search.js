/*
 * interaction-proof-search.js — bounded abstract combo proof search.
 *
 * This intentionally stops short of a full MTG rules engine. It proves a small
 * set of high-signal package families over abstract resources/events, records
 * why near-misses are not repeatable, and enforces hard card/depth/branch caps.
 */
const { buildInteractionHypergraph } = require('./interaction-hypergraph');
const { buildInteractionIndexes, normalizeCard } = require('./interaction-indexes');

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

function capValue(card, prefix) {
  const raw = (card.caps || []).find(cap => cap.startsWith(prefix + ':'));
  if (!raw) return null;
  const n = Number(raw.slice(prefix.length + 1));
  return Number.isFinite(n) ? n : raw.slice(prefix.length + 1);
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
  if (produces <= cost) return failure('proof:self-untap-mana:' + card.id, [card], 'self-untap cost is not below produced mana', { produces, cost });
  return success('proof:self-untap-mana:' + card.id, 'self-untap-mana-loop', [card], {
    steps: [
      { card: card.id, action: 'tap for mana', delta: { mana: produces } },
      { card: card.id, action: 'pay self-untap cost', delta: { mana: -cost } },
      { card: card.id, action: 'return to untapped abstract state' },
    ],
    repeatability: { status: 'repeatable', reason: 'abstract state repeats with positive mana delta' },
  }, [{ resource: 'mana', min: produces - cost, max: produces - cost }]);
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
    steps: [
      { card: gainFromLoss.id, action: 'opponent life loss causes you to gain life' },
      { card: lossFromGain.id, action: 'your life gain causes opponent life loss' },
      { action: 'trigger cycle repeats while legal targets/opponents remain' },
    ],
    repeatability: { status: 'repeatable', reason: 'each trigger recreates the other trigger condition' },
  }, [{ resource: 'life', min: 1, max: Infinity }, { resource: 'opponentLife', min: -Infinity, max: -1 }]);
}

function proveTopLoop(cards) {
  const topPiece = find(cards, c => hasCap(c, 'is-self-top-draw-artifact'));
  const reducer = find(cards, c => hasCap(c, 'is-artifact-spell-cost-reducer'));
  const caster = find(cards, c => hasCap(c, 'is-artifact-cast-from-top-enabler'));
  if (!topPiece || !reducer || !caster) return null;
  return success('proof:artifact-top-loop:' + sorted([topPiece.id, reducer.id, caster.id]).join('|'), 'artifact-top-cost-reduction-loop', [topPiece, reducer, caster], {
    steps: [
      { card: reducer.id, action: 'reduces the artifact loop piece cost' },
      { card: caster.id, action: 'casts the loop piece from the top of the library' },
      { card: topPiece.id, action: 'draws a card and returns itself to library top' },
      { action: 'library-top abstract state repeats' },
    ],
    repeatability: { status: 'repeatable-candidate', reason: 'same top-card state repeats; exact payment proof remains bounded by assumptions' },
  }, [{ resource: 'cards', min: 1, max: 1 }]);
}

function proveAristocrats(cards) {
  const outlet = find(cards, c => hasCap(c, 'is-sac-outlet'));
  const payoff = find(cards, c => ['is-death-drain-payoff', 'is-death-draw-payoff', 'is-death-token-payoff'].some(cap => hasCap(c, cap)));
  const body = find(cards, c => c !== outlet && c !== payoff && (hasCap(c, 'is-creature-token-producer') || hasCap(c, 'is-body')));
  if (!outlet || !payoff || !body) return null;
  if (!hasCap(body, 'is-creature-token-producer')) return failure('proof:aristocrats-not-repeatable:' + sorted([body.id, outlet.id, payoff.id]).join('|'), [body, outlet, payoff], 'body is not replenished by the package', { body: body.id, outlet: outlet.id, payoff: payoff.id });
  return success('proof:aristocrats:' + sorted([body.id, outlet.id, payoff.id]).join('|'), 'aristocrats-body-outlet-payoff', [body, outlet, payoff], {
    steps: [
      { card: body.id, action: 'creates or supplies creature bodies' },
      { card: outlet.id, action: 'sacrifices a body to create a death event' },
      { card: payoff.id, action: 'turns death event into deterministic payoff' },
    ],
    repeatability: { status: 'repeatable-candidate', reason: 'body production can replenish sacrifice fodder' },
  }, [{ resource: 'deathTriggers', min: 1, max: Infinity }]);
}

function proveTokenModifierPayoff(cards) {
  const modifier = find(cards, c => hasCap(c, 'is-token-doubler'));
  const source = find(cards, c => c !== modifier && hasCap(c, 'is-token-producer'));
  const payoff = find(cards, c => c !== source && c !== modifier && ((c.consumes || {}).tokens || hasCap(c, 'is-combat-payoff') || hasCap(c, 'is-width-payoff')));
  if (!source || !modifier || !payoff) return null;
  return success('proof:token-modifier-payoff:' + sorted([source.id, modifier.id, payoff.id]).join('|'), 'token-source-modifier-payoff', [source, modifier, payoff], {
    steps: [
      { card: source.id, action: 'creates token event' },
      { card: modifier.id, action: 'applies replacement/static token modifier before payoff checks' },
      { card: payoff.id, action: 'sees amplified token event' },
    ],
    repeatability: { status: 'value-engine', reason: 'not automatically a loop without source repeatability' },
  }, [{ resource: 'tokens', min: 2, max: Infinity }]);
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
    proveTopLoop(cards),
    proveAristocrats(cards),
    proveTokenModifierPayoff(cards),
  ].filter(Boolean);
  const proofs = results.filter(r => r.status === 'proven');
  const rejections = results.filter(r => r.status !== 'proven');
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
