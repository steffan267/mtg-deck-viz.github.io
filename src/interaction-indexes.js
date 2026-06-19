/*
 * interaction-indexes.js — deterministic indexes over the semantic IR.
 *
 * These indexes are the candidate-generation layer for future layered combo
 * proof search. They do not decide that a package is a combo; they cheaply
 * surface plausible pairs/triples by typed facts so later phases avoid
 * unbounded O(n³) enumeration.
 */
const MODEL = require('./interaction-model.js');
const FACE_CLASSIFICATION = require('./face-classification.js');

const DEFAULT_LIMIT = 100;

function compareId(a, b) {
  return String(a).localeCompare(String(b));
}

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean))].sort(compareId);
}

function addToIndex(index, key, value) {
  if (!key || !value) return;
  const slot = index[key] || (index[key] = []);
  slot.push(value);
}

function finalizeIndex(index) {
  return Object.fromEntries(Object.entries(index)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => [key, sortedUnique(values)]));
}

function cardId(card) {
  return card.id || card.name || card.cardName;
}

function classifyCard(card) {
  if (card.ir && card.caps) return card;
  if (Array.isArray(card && card.card_faces) && card.card_faces.length > 0) {
    const faceClassified = FACE_CLASSIFICATION.classifyFaceAwareCard(card, MODEL);
    return Object.assign({}, card, faceClassified.faceAware, faceClassified.aggregate, {
      faceFacts: faceClassified.faceFacts,
      factSources: faceClassified.factSources,
      faceCompatibilityWarnings: faceClassified.faceCompatibilityWarnings,
    });
  }
  const typeLine = card.type_line || card.type || '';
  const oracleText = card.oracle_text || card.text || '';
  const manaCost = card.mana_cost || card.mana || '';
  if (card.produces || card.consumes || card.caps) {
    return Object.assign({}, card, {
      produces: card.produces || {},
      consumes: card.consumes || {},
      caps: card.caps || [],
      zones: card.zones || [],
      myTypes: card.myTypes || [],
      tribalRefs: card.tribalRefs || [],
      role: card.role || 'utility',
      segments: card.segments || [],
    });
  }
  return Object.assign({}, card, MODEL.classify({ type_line: typeLine, oracle_text: oracleText, cmc: card.cmc, mana_cost: manaCost }));
}

function normalizeCard(card) {
  const classified = classifyCard(card);
  const id = cardId(classified);
  if (!id) throw new Error('Indexed cards require a stable id/name');
  const caps = sortedUnique(classified.caps || []);
  return {
    id,
    role: classified.role || 'utility',
    type: classified.type_line || classified.type || '',
    text: classified.oracle_text || classified.text || '',
    produces: classified.produces || {},
    consumes: classified.consumes || {},
    caps,
    zones: classified.zones || [],
    factSources: classified.factSources || {},
    faceFacts: classified.faceFacts || [],
    faceCompatibilityWarnings: classified.faceCompatibilityWarnings || [],
  };
}

function hasCap(card, cap) {
  return (card.caps || []).includes(cap);
}

function capabilityIds(indexes, cap) {
  return indexes.byCapability[cap] || [];
}

function unionIds(...groups) {
  return sortedUnique(groups.flat());
}

function buildInteractionIndexes(cards) {
  const normalized = (cards || []).map(normalizeCard).sort((a, b) => compareId(a.id, b.id));
  const byProducedEvent = {};
  const byConsumedEvent = {};
  const byCapability = {};
  const byZone = {};
  const byRole = {};
  const resourceProducers = {};
  const eventProducers = {};
  const zoneMovers = {};
  const repeatableEngines = {};
  const staticReplacementModifiers = {};
  const eventConsumers = {};
  const costRequirements = {};
  const triggerPrerequisites = {};
  const payoffRequirements = {};
  const winConditionDependencies = {};
  const modifiers = {
    costReducers: {},
    triggerDoublers: {},
    tokenDoublers: {},
    staticModifiers: {},
  };
  const cardsById = {};

  for (const card of normalized) {
    cardsById[card.id] = card;
    addToIndex(byRole, card.role, card.id);
    for (const zone of card.zones || []) addToIndex(byZone, zone, card.id);
    for (const cap of card.caps || []) addToIndex(byCapability, cap, card.id);
    for (const event of Object.keys(card.produces || {}).sort()) {
      addToIndex(byProducedEvent, event, card.id);
      addToIndex(eventProducers, event, card.id);
      if (['mana', 'treasure', 'tokens', 'draw', 'lifegain'].includes(event)) addToIndex(resourceProducers, event, card.id);
      if (['blink', 'reanimate', 'cast', 'graveyard', 'exile', 'steal'].includes(event)) addToIndex(zoneMovers, event, card.id);
    }
    for (const event of Object.keys(card.consumes || {}).sort()) {
      addToIndex(byConsumedEvent, event, card.id);
      addToIndex(eventConsumers, event, card.id);
      if (event === 'mana') addToIndex(costRequirements, event, card.id);
      if (['draw', 'tokens', 'lifegain', 'lifeloss', 'cast', 'death', 'sacrifice', 'tap'].includes(event)) addToIndex(triggerPrerequisites, event, card.id);
      if (['mana', 'draw', 'tokens', 'lifegain', 'lifeloss', 'graveyard'].includes(event)) addToIndex(payoffRequirements, event, card.id);
    }
    if (card.caps.some(cap => /repeatable|free-untapper|self-untapper|self-top-draw/.test(cap))) addToIndex(repeatableEngines, 'any', card.id);
    if (card.caps.some(cap => /doubler|multiplier|reducer|replacement|cost-reducer/.test(cap))) addToIndex(staticReplacementModifiers, 'any', card.id);
    if (hasCap(card, 'is-cost-reducer')) addToIndex(modifiers.costReducers, 'activated-ability', card.id);
    if (hasCap(card, 'is-creature-ability-cost-reducer')) addToIndex(modifiers.costReducers, 'creature-activated-ability', card.id);
    if (hasCap(card, 'is-food-ability-cost-reducer')) addToIndex(modifiers.costReducers, 'food-activated-ability', card.id);
    if (hasCap(card, 'is-artifact-spell-cost-reducer')) addToIndex(modifiers.costReducers, 'artifact-spell', card.id);
    if (hasCap(card, 'is-etb-doubler')) addToIndex(modifiers.triggerDoublers, 'etb', card.id);
    if (hasCap(card, 'is-trigger-doubler')) addToIndex(modifiers.triggerDoublers, 'any-trigger', card.id);
    if (hasCap(card, 'is-token-doubler')) addToIndex(modifiers.tokenDoublers, 'tokens', card.id);
    if (hasCap(card, 'is-counter-multiplier')) addToIndex(modifiers.staticModifiers, 'counters', card.id);
    if (hasCap(card, 'is-empty-library-win-payoff')) addToIndex(winConditionDependencies, 'empty-library', card.id);
    if (hasCap(card, 'is-lifeloss-from-your-lifegain')) addToIndex(winConditionDependencies, 'lifegain-loop', card.id);
    if (hasCap(card, 'is-lifegain-from-opponent-lifeloss')) addToIndex(winConditionDependencies, 'lifeloss-loop', card.id);
  }

  return {
    cards: normalized,
    cardsById,
    byProducedEvent: finalizeIndex(byProducedEvent),
    byConsumedEvent: finalizeIndex(byConsumedEvent),
    byCapability: finalizeIndex(byCapability),
    byZone: finalizeIndex(byZone),
    byRole: finalizeIndex(byRole),
    resourceProducers: finalizeIndex(resourceProducers),
    eventProducers: finalizeIndex(eventProducers),
    zoneMovers: finalizeIndex(zoneMovers),
    repeatableEngines: finalizeIndex(repeatableEngines),
    staticReplacementModifiers: finalizeIndex(staticReplacementModifiers),
    eventConsumers: finalizeIndex(eventConsumers),
    costRequirements: finalizeIndex(costRequirements),
    triggerPrerequisites: finalizeIndex(triggerPrerequisites),
    payoffRequirements: finalizeIndex(payoffRequirements),
    winConditionDependencies: finalizeIndex(winConditionDependencies),
    modifiers: {
      costReducers: finalizeIndex(modifiers.costReducers),
      triggerDoublers: finalizeIndex(modifiers.triggerDoublers),
      tokenDoublers: finalizeIndex(modifiers.tokenDoublers),
      staticModifiers: finalizeIndex(modifiers.staticModifiers),
    },
    stats: {
      cardCount: normalized.length,
      producedEventKinds: Object.keys(byProducedEvent).length,
      consumedEventKinds: Object.keys(byConsumedEvent).length,
      capabilityKinds: Object.keys(byCapability).length,
    },
  };
}

function resolveId(cardOrId) {
  return typeof cardOrId === 'string' ? cardOrId : cardId(cardOrId);
}

function pairId(a, b) {
  return 'pair:' + [a, b].sort(compareId).join('|');
}

function tripleId(cards) {
  return 'triple:' + cards.slice().sort(compareId).join('|');
}

function addPairCandidate(map, a, b, reason, limit) {
  if (!a || !b || a === b) return;
  const id = pairId(a, b);
  if (!map.has(id) && map.size >= limit) return;
  const entry = map.get(id) || { id, cards: [a, b].sort(compareId), reasons: [] };
  const reasonId = JSON.stringify(reason);
  if (!entry.reasons.some(r => JSON.stringify(r) === reasonId)) entry.reasons.push(reason);
  map.set(id, entry);
}

function candidatePairs(cardOrId, indexes, options = {}) {
  const id = resolveId(cardOrId);
  const card = indexes.cardsById[id];
  if (!card) return [];
  const limit = options.limit || DEFAULT_LIMIT;
  const map = new Map();
  for (const event of Object.keys(card.produces || {}).sort()) {
    for (const other of indexes.byConsumedEvent[event] || []) addPairCandidate(map, id, other, { kind: 'event', event, direction: 'produces→consumes' }, limit);
  }
  for (const event of Object.keys(card.consumes || {}).sort()) {
    for (const other of indexes.byProducedEvent[event] || []) addPairCandidate(map, other, id, { kind: 'event', event, direction: 'produces→consumes' }, limit);
  }
  for (const rule of MODEL.ENABLEMENT) {
    if (hasCap(card, rule.from)) {
      for (const other of capabilityIds(indexes, rule.to)) addPairCandidate(map, id, other, { kind: rule.kind, family: rule.family, from: rule.from, to: rule.to, strength: rule.strength }, limit);
    }
    if (hasCap(card, rule.to)) {
      for (const other of capabilityIds(indexes, rule.from)) addPairCandidate(map, other, id, { kind: rule.kind, family: rule.family, from: rule.from, to: rule.to, strength: rule.strength }, limit);
    }
  }
  return [...map.values()]
    .map(entry => ({ id: entry.id, cards: entry.cards, reasons: entry.reasons.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limit);
}

function addTripleCandidate(map, family, cards, reason, limit) {
  const ids = sortedUnique(cards);
  if (ids.length !== 3) return;
  const id = tripleId(ids);
  if (!map.has(id) && map.size >= limit) return;
  const entry = map.get(id) || { id, family, cards: ids, reasons: [] };
  const reasonId = JSON.stringify(reason);
  if (!entry.reasons.some(r => JSON.stringify(r) === reasonId)) entry.reasons.push(reason);
  map.set(id, entry);
}

function combineTriples(map, family, seed, left, right, reasonFor, limit) {
  for (const a of left) {
    if (map.size >= limit) return;
    for (const b of right) {
      addTripleCandidate(map, family, [seed, a, b], reasonFor(a, b), limit);
      if (map.size >= limit) return;
    }
  }
}

function candidateTriples(cardOrId, indexes, options = {}) {
  const seed = resolveId(cardOrId);
  const card = indexes.cardsById[seed];
  if (!card) return [];
  const limit = options.limit || DEFAULT_LIMIT;
  const map = new Map();

  const topPieces = capabilityIds(indexes, 'is-self-top-draw-artifact');
  const artifactReducers = capabilityIds(indexes, 'is-artifact-spell-cost-reducer');
  const topCasters = capabilityIds(indexes, 'is-artifact-cast-from-top-enabler');
  if (topPieces.includes(seed)) combineTriples(map, 'artifact-top-cost-reduction-loop', seed, artifactReducers, topCasters, (reducer, caster) => ({ role: 'top-piece', reducer, caster }), limit);
  if (artifactReducers.includes(seed)) combineTriples(map, 'artifact-top-cost-reduction-loop', seed, topPieces, topCasters, (topPiece, caster) => ({ role: 'cost-reducer', topPiece, caster }), limit);
  if (topCasters.includes(seed)) combineTriples(map, 'artifact-top-cost-reduction-loop', seed, topPieces, artifactReducers, (topPiece, reducer) => ({ role: 'cast-from-top', topPiece, reducer }), limit);

  const tokenSources = capabilityIds(indexes, 'is-token-producer');
  const tokenDoublers = indexes.modifiers.tokenDoublers.tokens || [];
  const tokenPayoffs = unionIds(indexes.byConsumedEvent.tokens || [], capabilityIds(indexes, 'is-combat-payoff'), capabilityIds(indexes, 'is-width-payoff'));
  if (tokenSources.includes(seed)) combineTriples(map, 'token-source-modifier-payoff', seed, tokenDoublers, tokenPayoffs, (modifier, payoff) => ({ role: 'token-source', modifier, payoff }), limit);
  if (tokenDoublers.includes(seed)) combineTriples(map, 'token-source-modifier-payoff', seed, tokenSources, tokenPayoffs, (source, payoff) => ({ role: 'token-modifier', source, payoff }), limit);
  if (tokenPayoffs.includes(seed)) combineTriples(map, 'token-source-modifier-payoff', seed, tokenSources, tokenDoublers, (source, modifier) => ({ role: 'token-payoff', source, modifier }), limit);

  const bodySeeds = capabilityIds(indexes, 'is-creature-token-producer');
  const bodies = unionIds(bodySeeds, capabilityIds(indexes, 'is-body'));
  const outlets = capabilityIds(indexes, 'is-sac-outlet');
  const deathPayoffs = unionIds(capabilityIds(indexes, 'is-death-drain-payoff'), capabilityIds(indexes, 'is-death-draw-payoff'), capabilityIds(indexes, 'is-death-token-payoff'));
  if (bodySeeds.includes(seed)) combineTriples(map, 'aristocrats-body-outlet-payoff', seed, outlets, deathPayoffs, (outlet, payoff) => ({ role: 'body', outlet, payoff }), limit);
  if (outlets.includes(seed)) combineTriples(map, 'aristocrats-body-outlet-payoff', seed, bodies, deathPayoffs, (body, payoff) => ({ role: 'outlet', body, payoff }), limit);
  if (deathPayoffs.includes(seed)) combineTriples(map, 'aristocrats-body-outlet-payoff', seed, bodies, outlets, (body, outlet) => ({ role: 'death-payoff', body, outlet }), limit);

  const reducers = unionIds(...Object.values(indexes.modifiers.costReducers));
  const activatedOutputs = unionIds(capabilityIds(indexes, 'has-nonmana-activated-ability'), capabilityIds(indexes, 'has-creature-activated-ability'));
  const payoffConsumers = unionIds(...Object.values(indexes.byConsumedEvent));
  if (reducers.includes(seed)) combineTriples(map, 'cost-reducer-activated-output-payoff', seed, activatedOutputs, payoffConsumers, (ability, payoff) => ({ role: 'cost-reducer', ability, payoff }), limit);
  if (activatedOutputs.includes(seed)) combineTriples(map, 'cost-reducer-activated-output-payoff', seed, reducers, payoffConsumers, (reducer, payoff) => ({ role: 'activated-output', reducer, payoff }), limit);
  if (payoffConsumers.includes(seed)) combineTriples(map, 'cost-reducer-activated-output-payoff', seed, reducers, activatedOutputs, (reducer, ability) => ({ role: 'payoff', reducer, ability }), limit);

  return [...map.values()]
    .map(entry => ({ id: entry.id, family: entry.family, cards: entry.cards, reasons: entry.reasons.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limit);
}

function normalizeSeedFact(fact) {
  if (typeof fact === 'string') {
    const [kind, value] = fact.split(':');
    if (kind === 'capability') return { kind, predicate: value };
    if (kind === 'event.produces' || kind === 'event.consumes') return { kind, event: value };
    return { kind: 'capability', predicate: fact };
  }
  return fact || {};
}

function candidateClosures(seedFacts, indexes) {
  const out = {
    producedEvents: {},
    consumedEvents: {},
    capabilities: {},
    zones: {},
    candidates: [],
  };
  const candidates = new Set();
  for (const raw of seedFacts || []) {
    const fact = normalizeSeedFact(raw);
    if (fact.kind === 'event.produces' && fact.event) {
      out.producedEvents[fact.event] = indexes.byConsumedEvent[fact.event] || [];
      for (const id of out.producedEvents[fact.event]) candidates.add(id);
    }
    if (fact.kind === 'event.consumes' && fact.event) {
      out.consumedEvents[fact.event] = indexes.byProducedEvent[fact.event] || [];
      for (const id of out.consumedEvents[fact.event]) candidates.add(id);
    }
    if (fact.kind === 'capability' && fact.predicate) {
      out.capabilities[fact.predicate] = indexes.byCapability[fact.predicate] || [];
      for (const id of out.capabilities[fact.predicate]) candidates.add(id);
    }
    if (fact.kind === 'zone.reference' && fact.zone) {
      out.zones[fact.zone] = indexes.byZone[fact.zone] || [];
      for (const id of out.zones[fact.zone]) candidates.add(id);
    }
  }
  out.producedEvents = finalizeIndex(out.producedEvents);
  out.consumedEvents = finalizeIndex(out.consumedEvents);
  out.capabilities = finalizeIndex(out.capabilities);
  out.zones = finalizeIndex(out.zones);
  out.candidates = sortedUnique([...candidates]);
  return out;
}

module.exports = {
  buildInteractionIndexes,
  candidateClosures,
  candidatePairs,
  candidateTriples,
  normalizeCard,
};
