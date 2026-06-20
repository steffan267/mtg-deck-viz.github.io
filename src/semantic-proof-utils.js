/*
 * semantic-proof-utils.js — shared abstract semantics for interaction proofs.
 *
 * This module intentionally stays card-name agnostic. It operates on normalized
 * card facts/capability strings and proof deltas so proof recognizers and EDHREC
 * evaluator mappings share one resource/result vocabulary.
 */

const MANA_COLORS = ['w', 'u', 'b', 'r', 'g'];

const RESULT_CLASS_BY_PROOF_RESOURCE = {
  mana: 'infinite-mana',
  life: 'infinite-life',
  opponentLife: 'infinite-opponent-life-loss',
  damage: 'infinite-damage',
  cards: 'infinite-draw',
  tokens: 'infinite-tokens',
  mill: 'mill',
  counters: 'infinite-counters',
  deathTriggers: 'infinite-death',
  sacrifices: 'infinite-sacrifice',
  etbTriggers: 'infinite-etb',
  ltbTriggers: 'infinite-ltb',
  landfallTriggers: 'infinite-landfall',
  casts: 'infinite-cast',
  storm: 'infinite-cast',
  untaps: 'infinite-untap',
  combatPhases: 'combat',
  turns: 'infinite-turns',
  pump: 'infinite-pump',
  loots: 'infinite-looting',
  selfDiscards: 'infinite-self-discard',
};

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function capsForSemantics(card) {
  return sortedUnique([
    ...(card?.caps || []),
    ...Object.keys(card?.factSources?.caps || {}),
  ]);
}

function hasCap(card, cap) {
  return capsForSemantics(card).includes(cap);
}

function fact(card, predicate) {
  return { card: card.id || card, kind: 'capability', predicate };
}

function eventConsumesFact(card, event) {
  return { card: card.id || card, kind: 'event.consumes', event };
}

function capValue(card, prefix) {
  const raw = capsForSemantics(card).find(cap => cap.startsWith(prefix + ':'));
  if (!raw) return null;
  const value = raw.slice(prefix.length + 1);
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function capNumbers(card, prefix) {
  return capsForSemantics(card)
    .filter(cap => cap.startsWith(prefix + ':'))
    .map(cap => Number(cap.slice(prefix.length + 1)))
    .filter(Number.isFinite);
}

function maxCapNumber(card, prefix) {
  return Math.max(0, ...capNumbers(card, prefix));
}

function minCapNumber(card, prefix) {
  const values = capNumbers(card, prefix);
  return values.length ? Math.min(...values) : 0;
}

function capSuffixes(card, prefix) {
  return capsForSemantics(card)
    .filter(cap => cap.startsWith(prefix))
    .map(cap => cap.slice(prefix.length));
}

function emptyManaProfile() {
  return {
    total: 0,
    any: 0,
    colorless: 0,
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])),
  };
}

function manaCostProfileFromCaps(card, prefix) {
  return {
    total: minCapNumber(card, prefix + '-cost'),
    colorless: maxCapNumber(card, prefix + '-colorless-cost'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, prefix + '-color-' + color)])),
  };
}

function manaProductionProfileFromCaps(card, prefix) {
  return {
    total: maxCapNumber(card, prefix + '-produced'),
    any: maxCapNumber(card, prefix + '-any'),
    colorless: maxCapNumber(card, prefix + '-c'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, prefix + '-' + color)])),
  };
}

function addManaProfiles(a = emptyManaProfile(), b = emptyManaProfile()) {
  return {
    total: (a.total || 0) + (b.total || 0),
    any: (a.any || 0) + (b.any || 0),
    colorless: (a.colorless || 0) + (b.colorless || 0),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, (a.colors?.[color] || 0) + (b.colors?.[color] || 0)])),
  };
}

function scaleManaProfile(profile = emptyManaProfile(), factor = 1) {
  const n = Math.max(0, Math.floor(Number(factor) || 0));
  return {
    total: (profile.total || 0) * n,
    any: (profile.any || 0) * n,
    colorless: (profile.colorless || 0) * n,
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, (profile.colors?.[color] || 0) * n])),
  };
}

function canPayManaCost(cost, mana) {
  if ((mana.colorless || 0) < (cost.colorless || 0)) return false;
  let anyRemaining = mana.any || 0;
  for (const color of MANA_COLORS) {
    const shortage = Math.max(0, (cost.colors?.[color] || 0) - (mana.colors?.[color] || 0));
    anyRemaining -= shortage;
    if (anyRemaining < 0) return false;
  }
  return (mana.total || 0) >= (cost.total || 0);
}

function minimumVariableManaCountToPay(cost, unitProfile, { requirePositive = false, maxCount = 100 } = {}) {
  for (let count = 0; count <= maxCount; count++) {
    const produced = scaleManaProfile(unitProfile, count);
    if (!canPayManaCost(cost, produced)) continue;
    if (!requirePositive || (produced.total || 0) > (cost.total || 0)) return count;
  }
  return Infinity;
}

function classForProofDeltaResource(resource) {
  return RESULT_CLASS_BY_PROOF_RESOURCE[resource] || null;
}

function proofDeltaShowsPositiveResult(delta) {
  if (!delta) return false;
  if (delta.resource === 'opponentLife') return delta.min === -Infinity || delta.max < 0;
  return delta.min > 0 || delta.max > 0;
}

module.exports = {
  MANA_COLORS,
  RESULT_CLASS_BY_PROOF_RESOURCE,
  addManaProfiles,
  canPayManaCost,
  capNumbers,
  capSuffixes,
  capValue,
  capsForSemantics,
  classForProofDeltaResource,
  emptyManaProfile,
  eventConsumesFact,
  fact,
  hasCap,
  manaCostProfileFromCaps,
  manaProductionProfileFromCaps,
  maxCapNumber,
  minimumVariableManaCountToPay,
  minCapNumber,
  proofDeltaShowsPositiveResult,
  scaleManaProfile,
  sortedUnique,
};
