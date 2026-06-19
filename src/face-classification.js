/*
 * face-classification.js — face provenance around the shared interaction model.
 *
 * The core classifier remains card-text oriented. This adapter classifies each
 * physical card face independently, keeps existing aggregate node fields stable,
 * and attaches compact provenance metadata that edge/proof layers can surface.
 */
const CARD_FACES = require('./card-faces.js');

const EXCLUSIVE_FACE_AVAILABILITIES = new Set(['either-face', 'transforms', 'separate-objects', 'merged-multiface']);

function compare(a, b) {
  return String(a).localeCompare(String(b));
}

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean))].sort(compare);
}

function compactSnippet(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function sourceFromFace(face, kind, key) {
  return {
    kind,
    key,
    faceIndex: face.index,
    faceName: face.name,
    availability: face.availability,
    layout: face.layout,
    snippet: compactSnippet(face.oracle_text),
  };
}

function addSource(out, bucket, key, source) {
  if (!key) return;
  const group = out[bucket] || (out[bucket] = {});
  const slot = group[key] || (group[key] = []);
  if (!slot.some(item => item.faceIndex === source.faceIndex && item.kind === source.kind && item.key === source.key)) {
    slot.push(source);
    slot.sort((a, b) => a.faceIndex - b.faceIndex || compare(a.faceName, b.faceName));
  }
}

function sourceKey(source) {
  return `${source.faceIndex}:${source.faceName}:${source.availability}`;
}

function buildFactSources(faceFacts) {
  const out = { produces: {}, consumes: {}, caps: {}, zones: {} };
  for (const faceFact of faceFacts || []) {
    const cls = faceFact.classification || {};
    for (const event of Object.keys(cls.produces || {})) addSource(out, 'produces', event, sourceFromFace(faceFact, 'event.produces', event));
    for (const event of Object.keys(cls.consumes || {})) addSource(out, 'consumes', event, sourceFromFace(faceFact, 'event.consumes', event));
    for (const cap of cls.caps || []) addSource(out, 'caps', cap, sourceFromFace(faceFact, 'capability', cap));
    for (const zone of cls.zones || []) addSource(out, 'zones', String(zone), sourceFromFace(faceFact, 'zone.reference', String(zone)));
  }
  return out;
}

function backfillAggregateSources(factSources, aggregate, faceAware) {
  // The aggregate classifier can still produce a coarse fact that no individual
  // face produced verbatim. Preserve that backward-compatible fact, but mark it
  // as merged evidence so proof/UI layers do not mistake it for face-specific
  // rules text.
  const aggregateSource = {
    kind: 'merged-card',
    key: faceAware.name,
    faceIndex: null,
    faceName: faceAware.name,
    availability: faceAware.faces && faceAware.faces.length > 1 ? 'merged-multiface' : 'single',
    layout: faceAware.layout,
    snippet: compactSnippet(faceAware.oracle_text),
  };
  for (const event of Object.keys(aggregate.produces || {})) if (!factSources.produces[event]) addSource(factSources, 'produces', event, Object.assign({}, aggregateSource, { kind: 'event.produces', key: event }));
  for (const event of Object.keys(aggregate.consumes || {})) if (!factSources.consumes[event]) addSource(factSources, 'consumes', event, Object.assign({}, aggregateSource, { kind: 'event.consumes', key: event }));
  for (const cap of aggregate.caps || []) if (!factSources.caps[cap]) addSource(factSources, 'caps', cap, Object.assign({}, aggregateSource, { kind: 'capability', key: cap }));
  for (const zone of aggregate.zones || []) if (!factSources.zones[String(zone)]) addSource(factSources, 'zones', String(zone), Object.assign({}, aggregateSource, { kind: 'zone.reference', key: String(zone) }));
  return factSources;
}

function faceCompatibilityWarnings(faceFacts, factSources) {
  const warnings = [];
  const allSources = [];
  const checkBucket = (bucketName, bucket) => {
    for (const [key, sources] of Object.entries(bucket || {})) {
      allSources.push(...sources);
      const distinct = new Map((sources || []).map(source => [sourceKey(source), source]));
      const exclusiveSources = [...distinct.values()].filter(source => EXCLUSIVE_FACE_AVAILABILITIES.has(source.availability));
      if (exclusiveSources.length > 1) {
        warnings.push({
          kind: 'multi-face-fact',
          bucket: bucketName,
          key,
          message: `Fact ${bucketName}.${key} appears on multiple mutually exclusive faces; proof search must cite a compatible face.`,
          faces: exclusiveSources.map(source => ({ index: source.faceIndex, name: source.faceName, availability: source.availability })),
        });
      }
    }
  };
  if ((faceFacts || []).length > 1) {
    checkBucket('produces', factSources.produces);
    checkBucket('consumes', factSources.consumes);
    checkBucket('caps', factSources.caps);
    checkBucket('zones', factSources.zones);
    const distinctExclusiveFaces = new Map(allSources
      .filter(source => EXCLUSIVE_FACE_AVAILABILITIES.has(source.availability))
      .map(source => [sourceKey(source), source]));
    if (distinctExclusiveFaces.size > 1) {
      warnings.unshift({
        kind: 'exclusive-face-aggregate',
        message: 'Aggregate card facts span mutually exclusive faces; proof search and UI evidence must cite the compatible face for each fact.',
        faces: [...distinctExclusiveFaces.values()].map(source => ({ index: source.faceIndex, name: source.faceName, availability: source.availability })),
      });
    }
  }
  return warnings;
}

function classifyFaceAwareCard(card, model) {
  const faceAware = CARD_FACES.toFaceAwareResolvedCard(card);
  const aggregate = model.classify({
    type_line: faceAware.type_line,
    oracle_text: faceAware.oracle_text,
    cmc: faceAware.cmc,
    mana_cost: faceAware.mana_cost,
  });
  const faceFacts = (faceAware.faces || []).map(face => {
    const classification = model.classify({
      type_line: face.type_line || faceAware.type_line,
      oracle_text: face.oracle_text || faceAware.oracle_text,
      cmc: faceAware.cmc,
      mana_cost: face.mana_cost || faceAware.mana_cost,
    });
    return Object.assign({}, face, {
      role: classification.role,
      produces: classification.produces,
      consumes: classification.consumes,
      zones: classification.zones,
      caps: classification.caps,
      myTypes: classification.myTypes,
      tribalRefs: classification.tribalRefs,
      classification,
    });
  });
  const factSources = backfillAggregateSources(buildFactSources(faceFacts), aggregate, faceAware);
  return {
    faceAware,
    aggregate,
    faceFacts,
    factSources,
    faceCompatibilityWarnings: faceCompatibilityWarnings(faceFacts, factSources),
  };
}

function compactFaceSource(source) {
  if (!source) return null;
  return {
    index: source.faceIndex,
    name: source.faceName,
    availability: source.availability,
    layout: source.layout,
    snippet: source.snippet,
  };
}

function firstSource(node, bucket, key) {
  const sources = node && node.factSources && node.factSources[bucket] && node.factSources[bucket][key];
  return sources && sources.length ? sources[0] : null;
}

function capSource(node, cap) {
  return firstSource(node, 'caps', cap);
}

function eventSource(node, bucket, event) {
  return firstSource(node, bucket, event);
}

function nodesForDirection(a, b, direction) {
  if (direction === 'B→A') return [b, a];
  return [a, b];
}

function annotateInteractionWithFaceEvidence(a, b, interaction) {
  const out = Object.assign({}, interaction);
  const evidence = interaction.evidence || {};
  const [src, dst] = nodesForDirection(a, b, interaction.direction);
  let source = null;
  let target = null;

  if (evidence.event) {
    source = eventSource(src, 'produces', evidence.event);
    target = eventSource(dst, 'consumes', evidence.event);
  } else if (evidence.from || evidence.to) {
    source = capSource(src, evidence.from);
    target = capSource(dst, evidence.to);
  } else if (interaction.family === 'lord→tribe') {
    source = capSource(a, 'is-lord') || capSource(b, 'is-lord');
  } else if (interaction.family === 'tribal-payoff→tribe') {
    source = capSource(a, 'is-tribal-payoff') || capSource(b, 'is-tribal-payoff');
  }

  const sourceFace = compactFaceSource(source);
  const targetFace = compactFaceSource(target);
  if (sourceFace) out.sourceFace = sourceFace;
  if (targetFace) out.targetFace = targetFace;
  if (sourceFace || targetFace) out.faceEvidence = { source: sourceFace, target: targetFace };
  return out;
}

function annotateInteractionsWithFaceEvidence(a, b, interactions) {
  return (interactions || []).map(interaction => annotateInteractionWithFaceEvidence(a, b, interaction));
}

function faceSourcesForFact(card, fact) {
  if (!card || !fact) return [];
  if (fact.kind === 'anyCapability' && Array.isArray(fact.predicates)) {
    return fact.predicates.flatMap(predicate => faceSourcesForFact(card, { kind: 'capability', predicate }));
  }
  if (fact.predicate && card.factSources && card.factSources.caps) {
    if (card.factSources.caps[fact.predicate]) return card.factSources.caps[fact.predicate];
    const prefix = `${fact.predicate}:`;
    return Object.entries(card.factSources.caps)
      .filter(([key]) => key.startsWith(prefix))
      .flatMap(([, sources]) => sources);
  }
  if (fact.event && card.factSources) {
    if (fact.kind === 'event.produces' && card.factSources.produces && card.factSources.produces[fact.event]) return card.factSources.produces[fact.event];
    if (fact.kind === 'event.consumes' && card.factSources.consumes && card.factSources.consumes[fact.event]) return card.factSources.consumes[fact.event];
  }
  return [];
}

function faceConstraintKey(source) {
  if (!source || source.faceIndex == null) return null;
  if (!EXCLUSIVE_FACE_AVAILABILITIES.has(source.availability)) return null;
  return `${source.availability}:${source.faceIndex}`;
}

function isExclusivePhysicalCard(card) {
  return (card && card.faceFacts || []).some(face => EXCLUSIVE_FACE_AVAILABILITIES.has(face.availability));
}

function isMergedOnlyFactSource(card, sources) {
  return isExclusivePhysicalCard(card)
    && sources.length > 0
    && sources.every(source => source && source.availability === 'merged-multiface' && source.faceIndex == null);
}

function describeFact(fact) {
  if (!fact) return 'unknown';
  if (fact.predicate) return fact.predicate;
  if (fact.event) return `${fact.kind || 'event'}:${fact.event}`;
  return fact.kind || 'unknown';
}

function faceCompatibilityForFacts(card, facts) {
  const constrained = [];
  for (const fact of facts || []) {
    const sources = faceSourcesForFact(card, fact);
    if (isMergedOnlyFactSource(card, sources)) {
      return {
        compatible: false,
        reason: 'Required fact is available only as merged text across mutually exclusive faces.',
        constrained: [{
          fact: describeFact(fact),
          keys: [],
          faces: compactFaceSources(sources),
        }],
      };
    }
    const keys = sortedUnique(sources.map(faceConstraintKey));
    if (keys.length) {
      constrained.push({
        fact: describeFact(fact),
        keys,
        faces: compactFaceSources(sources.filter(source => faceConstraintKey(source))),
      });
    }
  }
  if (constrained.length <= 1) return { compatible: true, constrained };
  let possible = new Set(constrained[0].keys);
  for (const item of constrained.slice(1)) {
    possible = new Set(item.keys.filter(key => possible.has(key)));
  }
  if (possible.size) return { compatible: true, constrained, compatibleFaceKeys: [...possible].sort(compare) };
  return {
    compatible: false,
    reason: 'Required facts are sourced from mutually exclusive faces of one physical card.',
    constrained,
  };
}

function incompatibleFaceFacts(cardsById, facts) {
  const byCard = new Map();
  for (const fact of facts || []) {
    if (!fact || !fact.card) continue;
    const slot = byCard.get(fact.card) || [];
    slot.push(fact);
    byCard.set(fact.card, slot);
  }
  const out = [];
  for (const [cardId, cardFacts] of byCard.entries()) {
    const card = cardsById && cardsById[cardId];
    const compatibility = faceCompatibilityForFacts(card, cardFacts);
    if (!compatibility.compatible) out.push(Object.assign({ card: cardId }, compatibility));
  }
  return out;
}

function compactFaceSources(sources) {
  const seen = new Set();
  return (sources || []).map(compactFaceSource).filter(Boolean).filter(source => {
    const key = `${source.index}:${source.name}:${source.availability}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (a.index ?? 999) - (b.index ?? 999) || compare(a.name, b.name));
}

module.exports = {
  annotateInteractionsWithFaceEvidence,
  classifyFaceAwareCard,
  compactFaceSource,
  compactFaceSources,
  faceCompatibilityForFacts,
  faceSourcesForFact,
  incompatibleFaceFacts,
  sortedUnique,
};
