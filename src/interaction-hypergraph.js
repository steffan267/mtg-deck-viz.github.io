/*
 * interaction-hypergraph.js — AND-shaped interaction representation.
 *
 * Hyperedges are proof-carrying candidates over typed facts. Pair edges can be
 * derived from them for UI summaries, but a three-card hyperedge remains the
 * source of truth so a package is not misrepresented as multiple two-card
 * combos.
 */
const {
  buildInteractionIndexes,
  candidatePairs,
  candidateTriples,
} = require('./interaction-indexes');

const COMBO_STRENGTH = 'combo-critical';

function compareId(a, b) {
  return String(a).localeCompare(String(b));
}

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean))].sort(compareId);
}

function pairKey(a, b) {
  return [a, b].sort(compareId).join('|');
}

function hasCap(indexes, id, cap) {
  return !!(indexes.cardsById[id] && (indexes.cardsById[id].caps || []).includes(cap));
}

function firstWithCap(indexes, cards, cap) {
  return cards.find(id => hasCap(indexes, id, cap));
}

function fact(card, predicate, value = null) {
  return { card, kind: 'capability', predicate, value };
}

function eventFact(card, kind, event) {
  return { card, kind, event };
}

function evidence(indexes, card, predicate) {
  const source = indexes.cardsById[card] || {};
  return {
    card,
    predicate,
    text: (source.text || '').replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

function baseProof(cards, family, steps, extra = {}) {
  return {
    cards: cards.slice().sort(compareId),
    assumptions: extra.assumptions || [],
    steps,
    resourceDeltas: extra.resourceDeltas || [],
    repeatability: extra.repeatability || { status: 'candidate', reason: 'requires bounded interpreter confirmation' },
    limitingClauses: extra.limitingClauses || [],
    evidence: extra.evidence || [],
  };
}

function hyperedge(id, family, cards, requires, produces, proof, strength = 'strong', confidence = 'pattern') {
  return {
    id,
    family,
    summaryFamily: family,
    cards: cards.slice().sort(compareId),
    requires,
    produces,
    proof,
    strength,
    confidence,
  };
}

function artifactTopLoop(candidate, indexes) {
  const cards = candidate.cards;
  const topPiece = firstWithCap(indexes, cards, 'is-self-top-draw-artifact');
  const reducer = firstWithCap(indexes, cards, 'is-artifact-spell-cost-reducer');
  const topCaster = firstWithCap(indexes, cards, 'is-artifact-cast-from-top-enabler');
  if (!topPiece || !reducer || !topCaster) return null;
  return hyperedge(
    'hyper:artifact-top-cost-reduction-loop:' + cards.join('|'),
    'artifact-top-cost-reduction-loop',
    cards,
    [
      fact(topPiece, 'is-self-top-draw-artifact'),
      fact(reducer, 'is-artifact-spell-cost-reducer'),
      fact(topCaster, 'is-artifact-cast-from-top-enabler'),
    ],
    [{ kind: 'combo.loop', family: 'artifact-top-cost-reduction-loop', result: 'repeatable top-card draw/cast loop' }],
    baseProof(cards, 'artifact-top-cost-reduction-loop', [
      { card: reducer, action: 'reduces the artifact spell or loop piece cost' },
      { card: topCaster, action: 'permits casting the artifact loop piece from the top of the library' },
      { card: topPiece, action: 'draws a card and returns itself to the top of the library' },
    ], {
      assumptions: ['the loop piece can be recast after returning to library top'],
      resourceDeltas: [{ resource: 'cards', delta: '+1 per iteration', confidence: 'pattern' }],
      repeatability: { status: 'candidate-repeatable', reason: 'same three cards can re-establish the starting library-top state' },
      limitingClauses: ['mana/payment proof is delegated to the bounded interpreter'],
      evidence: [evidence(indexes, topPiece, 'is-self-top-draw-artifact'), evidence(indexes, reducer, 'is-artifact-spell-cost-reducer'), evidence(indexes, topCaster, 'is-artifact-cast-from-top-enabler')],
    }),
    COMBO_STRENGTH,
    'pattern',
  );
}

function tokenModifierPayoff(candidate, indexes) {
  const cards = candidate.cards;
  const modifier = firstWithCap(indexes, cards, 'is-token-doubler');
  const source = cards.find(id => id !== modifier && hasCap(indexes, id, 'is-token-producer'));
  const payoff = cards.find(id => id !== source && id !== modifier);
  if (!source || !modifier || !payoff) return null;
  return hyperedge(
    'hyper:token-source-modifier-payoff:' + cards.join('|'),
    'token-source-modifier-payoff',
    cards,
    [
      fact(source, 'is-token-producer'),
      fact(modifier, 'is-token-doubler'),
      eventFact(payoff, 'event.consumes', 'tokens'),
    ],
    [{ kind: 'amplified.event', event: 'tokens', result: 'token payoff sees an amplified token event' }],
    baseProof(cards, 'token-source-modifier-payoff', [
      { card: source, action: 'creates one or more tokens' },
      { card: modifier, action: 'replaces or doubles that token creation event' },
      { card: payoff, action: 'consumes or rewards the token event' },
    ], {
      assumptions: ['token modifier applies to the source event under controller restrictions'],
      resourceDeltas: [{ resource: 'tokens', delta: 'amplified', confidence: 'pattern' }],
      evidence: [evidence(indexes, source, 'is-token-producer'), evidence(indexes, modifier, 'is-token-doubler'), evidence(indexes, payoff, 'tokens-payoff')],
    }),
    'strong',
    'pattern',
  );
}

function aristocrats(candidate, indexes) {
  const cards = candidate.cards;
  const outlet = firstWithCap(indexes, cards, 'is-sac-outlet');
  const payoff = cards.find(id => ['is-death-drain-payoff', 'is-death-draw-payoff', 'is-death-token-payoff'].some(cap => hasCap(indexes, id, cap)));
  const body = cards.find(id => id !== outlet && id !== payoff);
  if (!body || !outlet || !payoff) return null;
  return hyperedge(
    'hyper:aristocrats-body-outlet-payoff:' + cards.join('|'),
    'aristocrats-body-outlet-payoff',
    cards,
    [
      fact(body, hasCap(indexes, body, 'is-creature-token-producer') ? 'is-creature-token-producer' : 'is-body'),
      fact(outlet, 'is-sac-outlet'),
      { card: payoff, kind: 'capability', predicate: 'death-payoff' },
    ],
    [{ kind: 'triggered.payoff', event: 'death', result: 'sacrifice/death payoff engine' }],
    baseProof(cards, 'aristocrats-body-outlet-payoff', [
      { card: body, action: 'provides a sacrifice/death-visible body' },
      { card: outlet, action: 'turns the body into a sacrifice/death event' },
      { card: payoff, action: 'rewards the death event' },
    ], {
      assumptions: ['body is available to sacrifice or replace itself with creature tokens'],
      limitingClauses: ['repeatability depends on body replenishment'],
      evidence: [evidence(indexes, body, 'body'), evidence(indexes, outlet, 'is-sac-outlet'), evidence(indexes, payoff, 'death-payoff')],
    }),
    'strong',
    'pattern',
  );
}

function costReducerActivatedPayoff(candidate, indexes) {
  const cards = candidate.cards;
  const reducer = cards.find(id => ['is-cost-reducer', 'is-creature-ability-cost-reducer', 'is-food-ability-cost-reducer'].some(cap => hasCap(indexes, id, cap)));
  const ability = cards.find(id => id !== reducer && ['has-nonmana-activated-ability', 'has-creature-activated-ability'].some(cap => hasCap(indexes, id, cap)));
  const payoff = cards.find(id => id !== reducer && id !== ability);
  if (!reducer || !ability || !payoff) return null;
  return hyperedge(
    'hyper:cost-reducer-activated-output-payoff:' + cards.join('|'),
    'cost-reducer-activated-output-payoff',
    cards,
    [
      { card: reducer, kind: 'capability', predicate: 'ability-cost-reducer' },
      { card: ability, kind: 'capability', predicate: 'activated-output' },
      { card: payoff, kind: 'event.consumes', event: 'output-from-activated-ability' },
    ],
    [{ kind: 'discounted.ability.payoff', result: 'reduced activation can feed a payoff' }],
    baseProof(cards, 'cost-reducer-activated-output-payoff', [
      { card: reducer, action: 'reduces a scoped activated ability cost' },
      { card: ability, action: 'activates an ability with a relevant output' },
      { card: payoff, action: 'consumes that output as a payoff' },
    ], {
      assumptions: ['cost reducer scope applies to the activated ability'],
      limitingClauses: ['output/payoff event compatibility is refined by the bounded interpreter'],
      evidence: [evidence(indexes, reducer, 'ability-cost-reducer'), evidence(indexes, ability, 'activated-output'), evidence(indexes, payoff, 'payoff')],
    }),
    'moderate',
    'heuristic',
  );
}

function pairHyperedge(candidate) {
  const reason = candidate.reasons[0] || {};
  const family = reason.family || reason.event || 'pair-interaction';
  const cards = candidate.cards;
  const requires = reason.event
    ? [eventFact(cards[0], 'event.produces', reason.event), eventFact(cards[1], 'event.consumes', reason.event)]
    : [fact(cards[0], reason.from || 'source'), fact(cards[1], reason.to || 'target')];
  return hyperedge(
    'hyper:pair:' + family + ':' + cards.join('|'),
    family,
    cards,
    requires,
    [{ kind: 'pair.summary', family, result: 'direct pair interaction candidate' }],
    baseProof(cards, family, [
      { card: cards[0], action: 'provides the source fact' },
      { card: cards[1], action: 'provides the matching target fact' },
    ]),
    reason.kind === 'enablement' ? 'strong' : 'weak',
    'pattern',
  );
}

function hyperedgeFromTripleCandidate(candidate, indexes) {
  if (candidate.family === 'artifact-top-cost-reduction-loop') return artifactTopLoop(candidate, indexes);
  if (candidate.family === 'token-source-modifier-payoff') return tokenModifierPayoff(candidate, indexes);
  if (candidate.family === 'aristocrats-body-outlet-payoff') return aristocrats(candidate, indexes);
  if (candidate.family === 'cost-reducer-activated-output-payoff') return costReducerActivatedPayoff(candidate, indexes);
  return null;
}

function buildInteractionHypergraph(cardsOrIndexes, options = {}) {
  const indexes = cardsOrIndexes && cardsOrIndexes.cardsById ? cardsOrIndexes : buildInteractionIndexes(cardsOrIndexes || []);
  const hyperedges = new Map();
  const perCardPairLimit = options.perCardPairLimit || 20;
  const perCardTripleLimit = options.perCardTripleLimit || 20;
  for (const card of indexes.cards) {
    for (const pair of candidatePairs(card.id, indexes, { limit: perCardPairLimit })) {
      const edge = pairHyperedge(pair);
      hyperedges.set(edge.id, edge);
    }
    for (const triple of candidateTriples(card.id, indexes, { limit: perCardTripleLimit })) {
      const edge = hyperedgeFromTripleCandidate(triple, indexes);
      if (edge) hyperedges.set(edge.id, edge);
    }
  }
  return {
    version: 'interaction-hypergraph.v1',
    indexes,
    hyperedges: [...hyperedges.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function summaryStrength(hyperedge) {
  return hyperedge.cards.length > 2 && hyperedge.strength === COMBO_STRENGTH ? 'strong' : hyperedge.strength;
}

function summarizeHyperedgesToPairEdges(hyperedges) {
  const map = new Map();
  for (const edge of hyperedges || []) {
    const cards = edge.cards.slice().sort(compareId);
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const key = pairKey(cards[i], cards[j]) + ':' + edge.family;
        const current = map.get(key) || {
          source: cards[i],
          target: cards[j],
          family: edge.family,
          strength: summaryStrength(edge),
          isHyperedgeSummary: cards.length > 2,
          isComboCritical: cards.length === 2 && edge.strength === COMBO_STRENGTH,
          hyperedgeIds: [],
        };
        current.hyperedgeIds.push(edge.id);
        current.strength = current.strength === COMBO_STRENGTH ? current.strength : summaryStrength(edge);
        current.isHyperedgeSummary = current.isHyperedgeSummary || cards.length > 2;
        current.isComboCritical = current.isComboCritical || (cards.length === 2 && edge.strength === COMBO_STRENGTH);
        map.set(key, current);
      }
    }
  }
  return [...map.values()]
    .map(edge => Object.assign(edge, { hyperedgeIds: sortedUnique(edge.hyperedgeIds) }))
    .sort((a, b) => pairKey(a.source, a.target).localeCompare(pairKey(b.source, b.target)) || a.family.localeCompare(b.family));
}

module.exports = {
  buildInteractionHypergraph,
  summarizeHyperedgesToPairEdges,
};
