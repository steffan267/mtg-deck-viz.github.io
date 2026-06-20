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
const FACE_CLASSIFICATION = require('./face-classification');
const MODEL = require('./interaction-model.js');

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

const FAMILY_HYPEREDGE_ALIASES = {
  'library-exile-empty-library-win': ['library-exile→empty-library-win'],
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

function intersectIds(...groups) {
  if (!groups.length) return [];
  const [first, ...rest] = groups.map(group => new Set(group || []));
  return [...first].filter(id => rest.every(group => group.has(id))).sort(compareId);
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

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-mill-to-lifeloss-payoff'),
    capabilityIds(indexes, 'is-lifeloss-to-mill-payoff'),
  );

  pairCandidates(
    candidates,
    sortedUnique([
      ...capabilityIds(indexes, 'draw-to-damage-subject:you'),
      ...capabilityIds(indexes, 'draw-to-damage-subject:each'),
    ]),
    capabilityIds(indexes, 'is-damage-to-draw-payoff'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-self-copying-targeted-spell'),
    capabilityIds(indexes, 'is-magecraft-drain-payoff'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-lifelink-counter-engine'),
    capabilityIds(indexes, 'is-counter-to-damage-source'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-counter-to-creature-token-engine'),
    capabilityIds(indexes, 'is-creature-etb-counter-granter'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-minus-counter-death-spreader'),
    capabilityIds(indexes, 'is-minus-counter-to-1-1-token-engine'),
  );

  for (const tokenEngine of capabilityIds(indexes, 'is-counter-to-creature-token-engine')) {
    for (const counterPayoff of capabilityIds(indexes, 'is-lifegain-to-counter-payoff')) {
      for (const lifegainer of capabilityIds(indexes, 'is-creature-etb-lifegain-payoff')) {
        addCandidate(candidates, [tokenEngine, counterPayoff, lifegainer]);
      }
    }
  }

  const freePingers = sortedUnique([
    ...capabilityIds(indexes, 'has-free-creature-ping'),
    ...capabilityIds(indexes, 'grants-free-ping-to-equipped-creature'),
  ]);
  const deathUntappers = sortedUnique([
    ...capabilityIds(indexes, 'has-death-untap-self'),
    ...capabilityIds(indexes, 'grants-death-untap-to-equipped-creature'),
  ]);
  const deathtouchers = sortedUnique([
    ...capabilityIds(indexes, 'has-deathtouch'),
    ...capabilityIds(indexes, 'grants-deathtouch-to-equipped-creature'),
  ]);
  for (const pinger of freePingers) {
    for (const untapper of deathUntappers) {
      for (const deathtoucher of deathtouchers) {
        addCandidate(candidates, [pinger, untapper, deathtoucher]);
      }
    }
  }

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-life-paid-damage-source'),
    capabilityIds(indexes, 'is-lifegain-from-opponent-lifeloss'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-mass-opponent-draw-source'),
    capabilityIds(indexes, 'is-opponent-draw-punisher'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-half-library-mill-source'),
    capabilityIds(indexes, 'is-mill-multiplier'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-half-library-mill-source'),
    capabilityIds(indexes, 'is-delayed-same-turn-mill-payoff'),
  );

  const recursiveBodies = capabilityIds(indexes, 'is-recursive-body');
  const manaSacOutlets = capabilityIds(indexes, 'is-mana-sac-outlet');
  pairCandidates(candidates, recursiveBodies, manaSacOutlets);
  for (const body of recursiveBodies) {
    const bodyCard = indexes.cardsById[body];
    for (const outlet of manaSacOutlets) {
      const outletCard = indexes.cardsById[outlet];
      for (const support of capabilityIds(indexes, 'is-death-mana-payoff')) {
        addCandidate(candidates, [body, outlet, support]);
      }
      if (bodyCard && outletCard && (bodyCard.caps || []).includes('recursive-body-requires-another-creature')) {
        const outletCanAlsoSupport = MODEL.faceCompatibleCaps(outletCard, ['is-creature-permanent', 'is-mana-sac-outlet', 'sac-outlet-mana-produced']);
        if (!outletCanAlsoSupport) {
          const creatureSupport = capabilityIds(indexes, 'is-creature-permanent')
            .find(id => id !== body && id !== outlet);
          if (creatureSupport) addCandidate(candidates, [body, outlet, creatureSupport]);
        }
      }
    }
  }

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-etb-blink'),
    capabilityIds(indexes, 'is-etb-blink'),
  );

  for (const replacer of capabilityIds(indexes, 'is-token-to-creature-token-replacer')) {
    for (const outlet of capabilityIds(indexes, 'is-creature-sac-outlet')) {
      for (const payoff of capabilityIds(indexes, 'is-death-mana-payoff')) {
        addCandidate(candidates, [replacer, outlet, payoff]);
      }
    }
  }

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-library-exile-source'),
    capabilityIds(indexes, 'is-empty-library-win-payoff'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-cheap-instant-nonland-permanent-untap-spell'),
    capabilityIds(indexes, 'is-repeatable-cheap-instant-caster'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-activated-ability-copier'),
    capabilityIds(indexes, 'is-self-untapper'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-colorless-mana-amplifier'),
    capabilityIds(indexes, 'is-self-untapper'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-variable-board-count-mana-source'),
    sortedUnique([
      ...capabilityIds(indexes, 'is-repeatable-creature-untap-ability'),
      ...capabilityIds(indexes, 'is-attached-creature-untapper'),
    ]),
  );

  pairCandidates(
    candidates,
    sortedUnique([
      ...capabilityIds(indexes, 'is-cost-reducer'),
      ...capabilityIds(indexes, 'is-artifact-activated-ability-cost-reducer'),
    ]),
    capabilityIds(indexes, 'is-self-untapper'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-repeatable-hasty-creature-copy'),
    capabilityIds(indexes, 'etb-untaps-permanent'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-combat-copy-token-equipment'),
    capabilityIds(indexes, 'is-attack-extra-combat-source'),
  );

  pairCandidates(
    candidates,
    sortedUnique([
      ...capabilityIds(indexes, 'is-precombat-hasty-creature-copy-source'),
      ...capabilityIds(indexes, 'is-repeatable-hasty-creature-copy'),
      ...capabilityIds(indexes, 'is-attached-self-hasty-creature-copy'),
    ]),
    sortedUnique([
      ...capabilityIds(indexes, 'is-attack-extra-combat-source'),
      ...capabilityIds(indexes, 'is-combat-damage-extra-combat-source'),
    ]),
  );

  pairCandidates(
    candidates,
    sortedUnique([
      ...capabilityIds(indexes, 'is-precombat-hasty-creature-copy-source'),
      ...capabilityIds(indexes, 'is-repeatable-hasty-creature-copy'),
      ...capabilityIds(indexes, 'is-attached-self-hasty-creature-copy'),
    ]),
    sortedUnique([
      ...intersectIds(capabilityIds(indexes, 'is-attack-extra-turn-source'), capabilityIds(indexes, 'extra-turn-repeatable-with-fresh-token')),
      ...intersectIds(capabilityIds(indexes, 'is-combat-damage-extra-turn-source'), capabilityIds(indexes, 'extra-turn-repeatable-with-fresh-token')),
    ]),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-combat-sacrifice-extra-combat-aura'),
    capabilityIds(indexes, 'is-fresh-attack-carrier-source'),
  );

  pairCandidates(
    candidates,
    sortedUnique([
      ...capabilityIds(indexes, 'is-combat-damage-land-untap-engine'),
      ...capabilityIds(indexes, 'is-attack-land-untap-engine'),
      ...capabilityIds(indexes, 'is-combat-damage-treasure-engine'),
    ]),
    capabilityIds(indexes, 'is-repeatable-extra-combat-engine'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-turn-cycle-artifact-token-engine'),
    capabilityIds(indexes, 'is-artifact-sacrifice-extra-turn-engine'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-etb-spell-copier'),
    capabilityIds(indexes, 'is-hasty-creature-copy-spell'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-etb-spell-copier'),
    capabilityIds(indexes, 'is-death-copy-creature-spell'),
  );

  pairCandidates(
    candidates,
    capabilityIds(indexes, 'is-creature-exile-cast-mana-outlet'),
    capabilityIds(indexes, 'is-recursive-exile-cast-body'),
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
  const families = new Set([proof.family, ...(FAMILY_HYPEREDGE_ALIASES[proof.family] || [])]);
  return (result.hyperedges || []).filter(edge => families.has(edge.family) && packageKey(edge.cards) === key);
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

function requiredFactsForProof(proofBody, hyperedges) {
  return [
    ...hyperedges.flatMap(edge => edge.requires || []),
    ...((proofBody && proofBody.requiredFacts) || []),
  ];
}

function proofEvidence(indexes, fact) {
  const source = indexes.cardsById[fact.card] || {};
  const faces = FACE_CLASSIFICATION.compactFaceSources(FACE_CLASSIFICATION.faceSourcesForFact(source, fact));
  return {
    ...fact,
    card: fact.card,
    predicate: fact.predicate || fact.event || fact.kind,
    kind: fact.kind,
    event: fact.event,
    text: (source.text || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    faces,
    face: faces[0],
  };
}

function contributionFacts(card, requiredFacts) {
  return requiredFacts
    .filter(fact => fact.card === card)
    .map(fact => fact.predicate || fact.event || fact.kind)
    .filter(Boolean);
}

function contributionFaceSources(card, requiredFacts, indexes) {
  const indexed = indexes.cardsById[card] || {};
  const sources = requiredFacts
    .filter(fact => fact.card === card)
    .flatMap(fact => FACE_CLASSIFICATION.faceSourcesForFact(indexed, fact));
  return FACE_CLASSIFICATION.compactFaceSources(sources);
}

function contributionRole(card, familyDef, requiredFacts) {
  const facts = requiredFacts.filter(fact => fact.card === card);
  const fact = facts.find(item => item.role) || facts[0];
  if (fact && fact.role) return fact.role;
  const required = (familyDef && familyDef.requiredFacts) || [];
  return required.find(req => contributionFacts(card, requiredFacts).some(value => value === req.predicate || (req.predicates || []).includes(value)))?.role || 'piece';
}

function packageFromProof(result, proof, indexes) {
  const familyDef = getComboFamily(proof.family);
  const hyperedges = relatedHyperedges(result, proof);
  const proofBody = proof.proof || {};
  const requiredFacts = requiredFactsForProof(proofBody, hyperedges);
  const hyperProofs = hyperedges.map(edge => edge.proof || {});
  const assumptions = sortedUnique([...(proofBody.assumptions || []), ...hyperProofs.flatMap(p => p.assumptions || [])]);
  const limitingClauses = sortedUnique([...(proofBody.limitingClauses || []), ...hyperProofs.flatMap(p => p.limitingClauses || [])]);
  const resourceDeltas = [
    ...(proof.positiveDeltas || []),
    ...hyperProofs.flatMap(p => p.resourceDeltas || []),
  ].map(normalizeDelta).filter(Boolean);
  const evidence = hyperProofs.flatMap(p => p.evidence || []);
  const packageEvidence = evidence.length ? evidence : requiredFacts.map(fact => proofEvidence(indexes, fact));
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
      role: contributionRole(card, familyDef, requiredFacts),
      facts: sortedUnique(contributionFacts(card, requiredFacts)),
      text: indexes.cardsById[card]?.text || '',
      faces: contributionFaceSources(card, requiredFacts, indexes),
    })),
    evidence: packageEvidence,
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
