/*
 * interaction-proof-packages.js — product-facing proof package summaries.
 *
 * This is the bridge between the bounded proof-search/audit layer and the UI.
 * It deliberately emits compact, JSON-safe records so Node static builds and
 * browser imports can share the same proof presentation model.
 */
const { getComboFamily } = require('./combo-family-library');
const { buildInteractionIndexes, candidateTriples } = require('./interaction-indexes');
const { provePackage } = require('./interaction-proof-search');

const PROOF_PACKAGE_SCHEMA_VERSION = 'interaction-proof-package.v1';

const PROOF_PACKAGE_SCHEMA_FIELDS = [
  'schemaVersion',
  'id',
  'family',
  'familyTitle',
  'cards',
  'cardCount',
  'status',
  'confidence',
  'strength',
  'result',
  'repeatability',
  'assumptions',
  'limitingClauses',
  'resourceDeltas',
  'sequence',
  'contributions',
  'evidence',
  'hyperedgeIds',
];

const DEFAULT_OPTIONS = {
  maxProofPackages: 24,
  perCardTripleLimit: 8,
};

function compareId(a, b) {
  return String(a).localeCompare(String(b));
}

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean))].sort(compareId);
}

function packageKey(cards) {
  return sortedUnique(cards).join('\u0000');
}

function titleCase(value) {
  return String(value || '')
    .replace(/[→-]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

function capabilityIds(indexes, cap) {
  return indexes.byCapability[cap] || [];
}

function capabilityIdsStartingWith(indexes, prefix) {
  const ids = [];
  for (const [cap, cards] of Object.entries(indexes.byCapability || {})) {
    if (cap.startsWith(prefix)) ids.push(...cards);
  }
  return sortedUnique(ids);
}

function addCandidate(map, cards) {
  const ids = sortedUnique(cards);
  if (!ids.length || ids.length > 3) return;
  const key = packageKey(ids);
  if (!map.has(key)) map.set(key, { cards: ids });
}

function pairCandidates(map, left, right) {
  for (const a of left) for (const b of right) addCandidate(map, [a, b]);
}

function seedCandidates(indexes, options) {
  const candidates = new Map();

  for (const id of capabilityIds(indexes, 'taps-for-mana')) {
    if (capabilityIds(indexes, 'is-self-untapper').includes(id)) addCandidate(candidates, [id]);
  }

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-repeatable-blink'),
    capabilityIdsStartingWith(indexes, 'etb-untaps-land:'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-lifegain-from-opponent-lifeloss'),
    capabilityIds(indexes, 'is-lifeloss-from-your-lifegain'),
  );

  for (const card of indexes.cards) {
    for (const triple of candidateTriples(card.id, indexes, { limit: options.perCardTripleLimit })) {
      addCandidate(candidates, triple.cards);
    }
  }

  return [...candidates.values()].sort((a, b) => a.cards.length - b.cards.length || packageKey(a.cards).localeCompare(packageKey(b.cards)));
}

function relatedHyperedges(result, proof) {
  const key = packageKey(proof.cards);
  return (result.hyperedges || []).filter(edge => edge.family === proof.family && packageKey(edge.cards) === key);
}

function jsonSafeNumber(value) {
  if (value === Infinity) return '∞';
  if (value === -Infinity) return '-∞';
  return Number.isFinite(value) ? value : String(value);
}

function normalizeDelta(delta) {
  if (!delta) return null;
  if (delta.delta && typeof delta.delta === 'object') {
    return {
      resource: delta.resource,
      min: jsonSafeNumber(delta.delta.min),
      max: jsonSafeNumber(delta.delta.max),
      source: delta.source,
    };
  }
  return {
    resource: delta.resource,
    min: jsonSafeNumber(delta.min),
    max: jsonSafeNumber(delta.max),
    source: delta.source,
    delta: delta.delta == null ? undefined : String(delta.delta),
    confidence: delta.confidence,
  };
}

function deltaSummary(delta) {
  if (!delta) return '';
  if (delta.delta) return `${delta.resource} ${delta.delta}`;
  if (delta.min === delta.max) return `${delta.resource} ${delta.min}`;
  return `${delta.resource} ${delta.min}..${delta.max}`;
}

function resultSummary(familyDef, proof, hyperedges) {
  const deltas = (proof.positiveDeltas || []).map(normalizeDelta).filter(Boolean);
  if (deltas.length) return deltas.map(deltaSummary).join('; ');
  const produced = hyperedges.flatMap(edge => edge.produces || []).find(item => item && item.result);
  if (produced) return produced.result;
  return familyDef && familyDef.uiExplanation ? familyDef.uiExplanation : `${titleCase(proof.family)} package proven`;
}

function contributionFacts(card, hyperedges) {
  return hyperedges
    .flatMap(edge => edge.requires || [])
    .filter(fact => fact.card === card)
    .map(fact => fact.predicate || fact.event || fact.kind)
    .filter(Boolean);
}

function contributionRole(card, familyDef, hyperedges) {
  const facts = hyperedges.flatMap(edge => edge.requires || []).filter(fact => fact.card === card);
  const fact = facts.find(item => item.role) || facts[0];
  if (fact && fact.role) return fact.role;
  const required = (familyDef && familyDef.requiredFacts) || [];
  return required.find(req => contributionFacts(card, hyperedges).some(value => value === req.predicate || (req.predicates || []).includes(value)))?.role || 'piece';
}

function packageFromProof(result, proof, indexes) {
  const familyDef = getComboFamily(proof.family);
  const hyperedges = relatedHyperedges(result, proof);
  const proofBody = proof.proof || {};
  const hyperProofs = hyperedges.map(edge => edge.proof || {});
  const assumptions = sortedUnique([...(proofBody.assumptions || []), ...hyperProofs.flatMap(p => p.assumptions || [])]);
  const limitingClauses = sortedUnique([...(proofBody.limitingClauses || []), ...hyperProofs.flatMap(p => p.limitingClauses || [])]);
  const resourceDeltas = [
    ...(proof.positiveDeltas || []),
    ...hyperProofs.flatMap(p => p.resourceDeltas || []),
  ].map(normalizeDelta).filter(Boolean);
  const evidence = hyperProofs.flatMap(p => p.evidence || []);
  const steps = (proofBody.steps || hyperProofs.flatMap(p => p.steps || []) || []).map((step, index) => ({
    index: index + 1,
    card: step.card,
    action: step.action || String(step),
    delta: step.delta,
    cost: step.cost,
  }));

  return {
    schemaVersion: PROOF_PACKAGE_SCHEMA_VERSION,
    id: proof.id,
    family: proof.family,
    familyTitle: (familyDef && familyDef.title) || titleCase(proof.family),
    cards: proof.cards.slice().sort(compareId),
    cardCount: proof.cards.length,
    status: 'proven',
    confidence: (familyDef && familyDef.confidenceGate) || hyperedges[0]?.confidence || 'pattern',
    strength: hyperedges[0]?.strength || (proof.cards.length <= 2 ? 'combo-critical' : 'strong'),
    result: resultSummary(familyDef, proof, hyperedges),
    repeatability: proofBody.repeatability || hyperProofs.find(p => p.repeatability)?.repeatability || null,
    assumptions,
    limitingClauses,
    resourceDeltas,
    sequence: steps,
    contributions: proof.cards.slice().sort(compareId).map(card => ({
      card,
      role: contributionRole(card, familyDef, hyperedges),
      facts: sortedUnique(contributionFacts(card, hyperedges)),
      text: indexes.cardsById[card]?.text || '',
    })),
    evidence,
    hyperedgeIds: hyperedges.map(edge => edge.id).sort(compareId),
  };
}

function buildInteractionProofPackages(cards, options = {}) {
  const opts = Object.assign({}, DEFAULT_OPTIONS, options);
  const indexes = buildInteractionIndexes((cards || []).filter(card => card && card.role !== 'zone'));
  const packages = [];
  const seen = new Set();

  for (const candidate of seedCandidates(indexes, opts)) {
    const result = provePackage(candidate.cards.map(id => indexes.cardsById[id]), options);
    if (result.status !== 'proven') continue;
    for (const proof of result.proofs || []) {
      const key = proof.family + '\u0000' + packageKey(proof.cards);
      if (seen.has(key)) continue;
      seen.add(key);
      packages.push(packageFromProof(result, proof, indexes));
      if (packages.length >= opts.maxProofPackages) return packages;
    }
  }

  return packages.sort((a, b) =>
    b.cardCount - a.cardCount ||
    a.familyTitle.localeCompare(b.familyTitle) ||
    packageKey(a.cards).localeCompare(packageKey(b.cards)));
}

module.exports = {
  DEFAULT_OPTIONS,
  PROOF_PACKAGE_SCHEMA_FIELDS,
  PROOF_PACKAGE_SCHEMA_VERSION,
  buildInteractionProofPackages,
  seedCandidates,
};
