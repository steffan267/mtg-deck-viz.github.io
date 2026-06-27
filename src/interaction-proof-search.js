/*
 * interaction-proof-search.js — bounded abstract combo proof search.
 *
 * This intentionally stops short of a full MTG rules engine. It proves a small
 * set of high-signal package families over abstract resources/events, records
 * why near-misses are not repeatable, and enforces hard card/depth/branch caps.
 */
const { buildInteractionHypergraph } = require('./interaction-hypergraph');
const { ProofStatus, RepeatabilityStatus, SolverOutcome } = require('./domain/interaction-constants');
const { buildInteractionIndexes, normalizeCard } = require('./interaction-indexes');
const { buildPackageUnderstanding } = require('./interaction-understanding');
const FACE_CLASSIFICATION = require('./face-classification');
const MODEL = require('./interaction-model.js');
const {
  MANA_COLORS,
  addManaProfiles,
  canPayManaCost,
  capSuffixes,
  capValue,
  eventConsumesFact,
  fact,
  hasCap,
  manaCostProfileFromCaps,
  manaProductionProfileFromCaps,
  maxCapNumber,
  minimumVariableManaCountToPay,
  minCapNumber,
  scaleManaProfile,
  sortedUnique: sorted,
} = require('./semantic-proof-utils');

const DEFAULT_LIMITS = {
  maxCards: 3,
  maxDepth: 8,
  maxBranches: 64,
  auditLowConfidence: false,
};

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

function recursiveCostProfile(card) {
  return {
    total: minCapNumber(card, 'recursive-body-cost'),
    colorless: maxCapNumber(card, 'recursive-body-colorless-cost'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, 'recursive-body-color-' + color)])),
  };
}

function recursiveExileCostProfile(card) {
  return {
    total: minCapNumber(card, 'recursive-exile-body-cost'),
    colorless: maxCapNumber(card, 'recursive-exile-body-colorless-cost'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, 'recursive-exile-body-color-' + color)])),
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

function lifePaidDamageProfile(card) {
  return {
    lifeCost: maxCapNumber(card, 'life-paid-damage-life-cost'),
    damage: maxCapNumber(card, 'life-paid-damage-amount'),
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

function landfallManaProfile(card) {
  return manaProductionProfileFromCaps(card, 'landfall-mana');
}

function landfallTokenManaProfile(card) {
  return manaProductionProfileFromCaps(card, 'landfall-token-mana');
}

function variableManaUnitProfile(card) {
  return manaProductionProfileFromCaps(card, 'variable-mana-unit');
}

function extraCombatCostProfile(card) {
  return manaCostProfileFromCaps(card, 'extra-combat');
}

function anyManaUnitProfile(total = 1) {
  return {
    total,
    any: total,
    colorless: 0,
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])),
  };
}

const canPayRecursiveCost = canPayManaCost;

function artifactTokensPerTurn(card) {
  return maxCapNumber(card, 'artifact-tokens-per-turn');
}

function artifactExtraTurnSacCount(card) {
  return maxCapNumber(card, 'artifact-extra-turn-sac-count');
}

function counterThresholdExtraTurnCount(card) {
  return maxCapNumber(card, 'counter-threshold-extra-turn-threshold');
}

function proliferateCountPerTurn(card) {
  return maxCapNumber(card, 'proliferate-count-per-turn');
}

function proliferateMultiplier(card) {
  return maxCapNumber(card, 'proliferate-multiplier') || (hasCap(card, 'is-proliferate-multiplier') ? 2 : 1);
}

function forcedCastOrigins(card) {
  return capSuffixes(card, 'forced-cast-origin:');
}

function castLockScopes(card) {
  return capSuffixes(card, 'cast-lock-scope:');
}

function castLockAppliesToOpponents(card) {
  const scopes = castLockScopes(card);
  return scopes.includes('players') || scopes.includes('opponents') || !scopes.length;
}

function counterSuppressionScopes(card) {
  return capSuffixes(card, 'counter-suppression:');
}

function counterSuppressionApplies(card, scope) {
  return counterSuppressionScopes(card).includes(scope);
}

function forcedCastLockAxes(engine, lockpiece) {
  const axes = [];
  const origins = forcedCastOrigins(engine);
  if ((origins.includes('exile') || origins.includes('library-top'))
      && (hasCap(lockpiece, 'cast-lock-origin:non-hand') || hasCap(lockpiece, 'cast-lock-origin-exile-any'))) {
    axes.push('origin');
  }
  if (hasCap(engine, 'forced-cast-payment:free')
      && (hasCap(lockpiece, 'cast-lock-axis:free-cast') || hasCap(lockpiece, 'cast-lock-axis:no-colored-mana'))) {
    axes.push(hasCap(lockpiece, 'cast-lock-axis:no-colored-mana') ? 'no-colored-mana' : 'free-cast');
  }
  if (hasCap(engine, 'forced-cast-trigger:spell-from-hand') && hasCap(lockpiece, 'cast-lock-axis:spell-count')) {
    axes.push('spell-count');
  }
  if (hasCap(engine, 'forced-cast-window:trigger-resolution') && hasCap(lockpiece, 'cast-lock-axis:timing-sorcery')) {
    axes.push('timing');
  }
  return sorted(axes);
}

function addCostProfiles(...profiles) {
  return {
    total: profiles.reduce((sum, profile) => sum + (profile?.total || 0), 0),
    colorless: profiles.reduce((sum, profile) => sum + (profile?.colorless || 0), 0),
    colors: Object.fromEntries(MANA_COLORS.map(color => [
      color,
      profiles.reduce((sum, profile) => sum + (profile?.colors?.[color] || 0), 0),
    ])),
  };
}

function reduceGenericCost(cost, reduction) {
  const fixed = (cost.colorless || 0) + MANA_COLORS.reduce((sum, color) => sum + (cost.colors?.[color] || 0), 0);
  return Object.assign({}, cost, {
    total: Math.max(fixed, (cost.total || 0) - Math.max(0, reduction || 0)),
  });
}

function spellCostReducerApplies(reducer, spell) {
  const scopes = capSuffixes(reducer, 'spell-cost-reduction-scope:');
  if (!scopes.length) return true;
  if (scopes.includes('instant-sorcery') && /\b(instant|sorcery)\b/i.test(spell?.type || spell?.type_line || '')) return true;
  return MANA_COLORS.some(color => scopes.includes(color) && maxCapNumber(spell, 'buyback-copy-color-' + color) > 0);
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
  return copyTokenLegendSafe(copier, target, 'hasty-copy-token-nonlegendary', targetCaps);
}

function canHastyCopySpellTarget(copySpell, target, extraTargetCaps = []) {
  if (!hasCap(copySpell, 'hasty-copy-spell-target-creature')) return false;
  const targetCaps = ['is-creature-permanent', 'is-nonlegendary-permanent', ...extraTargetCaps];
  if (!MODEL.faceCompatibleCaps(target, targetCaps)) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  if (!target?.faceFacts?.length && isLegendaryPermanent(target)) return false;
  return true;
}

function copyTokenLegendSafe(copier, target, tokenNonlegendaryCap, targetCaps = []) {
  if (hasCap(copier, tokenNonlegendaryCap)) return true;
  if (MODEL.faceCompatibleCaps(target, [...targetCaps, 'is-nonlegendary-permanent'])) return true;
  if (!target?.faceFacts?.length && !isLegendaryPermanent(target)) return true;
  return false;
}

function canPrecombatCopyTarget(copier, target, extraTargetCaps = []) {
  if (!hasCap(copier, 'is-precombat-hasty-creature-copy-source')) return false;
  const targetCaps = ['is-creature-permanent', ...extraTargetCaps];
  if (!MODEL.faceCompatibleCaps(target, targetCaps)) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  return copyTokenLegendSafe(copier, target, 'precombat-copy-token-nonlegendary', targetCaps);
}

function canAttachedSelfCopyTarget(copySource, target, extraTargetCaps = []) {
  if (!hasCap(copySource, 'is-attached-self-hasty-creature-copy')) return false;
  if (!MODEL.faceCompatibleCaps(target, ['is-creature-permanent', 'is-nonlegendary-permanent', ...extraTargetCaps])) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  if (!target?.faceFacts?.length && isLegendaryPermanent(target)) return false;
  return true;
}

function extraCombatTriggerUntapsCopySource(attacker, resetSubject, connect = false, resetSubjectCaps = []) {
  if (!MODEL.faceCompatibleCaps(resetSubject, ['is-creature-permanent', ...resetSubjectCaps])) return false;
  if (!resetSubject?.faceFacts?.length && !isCreaturePermanent(resetSubject)) return false;
  if (hasCap(attacker, 'attack-extra-combat-untaps-creatures')) return true;
  if (hasCap(attacker, 'attack-extra-combat-untaps-other-creatures')) return true;
  if (connect && hasCap(attacker, 'combat-damage-extra-combat-untaps-creatures')) return true;
  return false;
}

function activeCopyWindowSafe(copier) {
  if (hasCap(copier, 'hasty-copy-activation-window:sorcery')) return false;
  return hasCap(copier, 'hasty-copy-activation-window:instant') || !hasCap(copier, 'hasty-copy-activation-window:sorcery');
}

function attachedCopyWindowSafe(copySource) {
  if (hasCap(copySource, 'attached-copy-activation-window:sorcery')) return false;
  return hasCap(copySource, 'attached-copy-activation-window:instant') || !hasCap(copySource, 'attached-copy-activation-window:sorcery');
}

function canDeathCopySpellTarget(copySpell, target, extraTargetCaps = []) {
  if (!hasCap(copySpell, 'death-copy-spell-target-creature')) return false;
  const targetCaps = ['is-creature-permanent', 'is-nonlegendary-permanent', ...extraTargetCaps];
  if (!MODEL.faceCompatibleCaps(target, targetCaps)) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  if (!target?.faceFacts?.length && isLegendaryPermanent(target)) return false;
  return true;
}

function counterTokenColors(card) {
  return capSuffixes(card, 'counter-token-color:');
}

function etbCounterGranterColors(card) {
  return capSuffixes(card, 'etb-counter-granter-token-color:');
}

function counterTokenCanTriggerGranter(tokenEngine, granter) {
  const tokenColors = counterTokenColors(tokenEngine);
  const accepted = etbCounterGranterColors(granter);
  if (!tokenColors.length || !accepted.length) return false;
  if (accepted.includes('any')) return !tokenColors.includes('unknown');
  return accepted.some(color => tokenColors.includes(color));
}

function lifegainCounterCanTargetEngine(counterPayoff, tokenEngine) {
  const targets = capSuffixes(counterPayoff, 'lifegain-counter-target:');
  if (!targets.length) return false;
  const canTargetCreature = targets.includes('creature') || targets.includes('creature-or-enchantment');
  if (!canTargetCreature) return false;
  return MODEL.faceCompatibleCaps(tokenEngine, ['is-creature-permanent', 'is-counter-to-creature-token-engine']);
}

function intrinsicPingerRole(card) {
  return hasCap(card, 'has-free-creature-ping') ? { card, predicate: 'has-free-creature-ping' } : null;
}

function intrinsicDeathUntapRole(card) {
  return hasCap(card, 'has-death-untap-self') ? { card, predicate: 'has-death-untap-self' } : null;
}

function intrinsicDeathtouchRole(card) {
  return hasCap(card, 'has-deathtouch') ? { card, predicate: 'has-deathtouch' } : null;
}

function grantedRole(cards, predicate) {
  const source = find(cards, card => hasCap(card, predicate));
  return source ? { card: source, predicate } : null;
}

function assembleDeathUntapPinger(cards) {
  const list = cards || [];
  const grantedPing = grantedRole(list, 'grants-free-ping-to-equipped-creature');
  const grantedUntap = grantedRole(list, 'grants-death-untap-to-equipped-creature');
  const grantedDeathtouch = grantedRole(list, 'grants-deathtouch-to-equipped-creature');

  for (const carrier of list) {
    if (!MODEL.faceCompatibleCaps(carrier, ['is-creature-permanent'])) continue;
    const ping = intrinsicPingerRole(carrier) || grantedPing;
    const untap = intrinsicDeathUntapRole(carrier) || grantedUntap;
    const deathtouch = intrinsicDeathtouchRole(carrier) || grantedDeathtouch;
    if (ping && untap && deathtouch) {
      return {
        carrier,
        externalCarrier: false,
        ping,
        untap,
        deathtouch,
        proofCards: uniqueCards([carrier, ping.card, untap.card, deathtouch.card]),
      };
    }
  }

  if (grantedPing && grantedUntap && grantedDeathtouch) {
    return {
      carrier: null,
      externalCarrier: true,
      ping: grantedPing,
      untap: grantedUntap,
      deathtouch: grantedDeathtouch,
      proofCards: uniqueCards([grantedPing.card, grantedUntap.card, grantedDeathtouch.card]),
    };
  }

  return null;
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

function damageToDrawAppliesToSource(damageToDraw, source) {
  if (hasCap(damageToDraw, 'damage-to-draw-scope:source-you-control')) return true;
  if (hasCap(damageToDraw, 'damage-to-draw-scope:enchanted-creature')
      || hasCap(damageToDraw, 'damage-to-draw-scope:equipped-creature')
      || hasCap(damageToDraw, 'damage-to-draw-scope:paired-creature-grant')) {
    return MODEL.faceCompatibleCaps(source, ['is-creature-permanent', 'is-draw-to-damage-payoff']);
  }
  return false;
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
    status: ProofStatus.NotRepeatable,
    cards: sorted(cards.map(card => card.id || card)),
    reason,
    details,
  };
}

function success(id, family, cards, proof, deltas = []) {
  return {
    id,
    status: ProofStatus.Proven,
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
  const reducer = find(cards, c => c !== card
    && Number(capValue(c, 'activated-ability-cost-reduction') || 0) > 0
    && (
      hasCap(c, 'is-cost-reducer')
      || (hasCap(c, 'is-artifact-activated-ability-cost-reducer') && /\bartifact\b/i.test(card.type || card.type_line || ''))
    ));
  const reduction = reducer ? Number(capValue(reducer, 'activated-ability-cost-reduction') || 0) : 0;
  const minimumCost = reducer ? Number(capValue(reducer, 'activated-ability-cost-reduction-minimum') || 0) : 0;
  const effectiveCost = Math.max(minimumCost, cost - reduction);
  const totalProduced = produces + amplification;
  if (totalProduced <= effectiveCost) return failure('proof:self-untap-mana:' + sorted([card.id, amplifier && amplifier.id, reducer && reducer.id]).join('|'), uniqueCards([card, amplifier, reducer]), 'self-untap cost is not below produced mana', { produces, amplification, cost, reduction, effectiveCost });
  const proofCards = uniqueCards([card, amplifier, reducer]);
  return success('proof:self-untap-mana:' + proofCards.map(c => c.id).sort().join('|'), 'self-untap-mana-loop', proofCards, {
    requiredFacts: [
      fact(card, 'taps-for-mana'),
      fact(card, 'is-self-untapper'),
      ...(amplifier ? [fact(amplifier, 'is-colorless-mana-amplifier')] : []),
      ...(reducer ? [fact(reducer, hasCap(reducer, 'is-artifact-activated-ability-cost-reducer') ? 'is-artifact-activated-ability-cost-reducer' : 'is-cost-reducer')] : []),
    ],
    steps: [
      { card: card.id, action: 'tap for mana', delta: { mana: totalProduced } },
      ...(amplifier ? [{ card: amplifier.id, action: 'static amplifier adds colorless mana to the tap output', delta: { mana: amplification } }] : []),
      ...(reducer ? [{ card: reducer.id, action: 'reduces the self-untap activated ability cost', delta: { manaCostReduction: reduction } }] : []),
      { card: card.id, action: 'pay self-untap cost', delta: { mana: -effectiveCost } },
      { card: card.id, action: 'return to untapped abstract state' },
    ],
    repeatability: { status: 'repeatable', reason: 'abstract state repeats with positive mana delta' },
  }, [{ resource: 'mana', min: totalProduced - effectiveCost, max: totalProduced - effectiveCost }]);
}

function proveVariableBoardCountManaLoop(cards) {
  const source = find(cards, c => hasCap(c, 'is-variable-board-count-mana-source') && hasCap(c, 'taps-for-mana'));
  if (!source) return null;
  const engine = find(cards, c => c !== source
    && (hasCap(c, 'is-repeatable-creature-untap-ability') || hasCap(c, 'is-attached-creature-untapper')));
  if (!engine) {
    return failure(
      'proof:variable-board-count-mana-missing-engine:' + sorted(cards.map(c => c.id)).join('|'),
      [source],
      'variable-count mana source needs a repeatable creature-untap engine in the package',
      { source: source.id },
    );
  }
  if (!MODEL.faceCompatibleCaps(source, ['is-creature-permanent', 'taps-for-mana', 'is-variable-board-count-mana-source'])) {
    return failure(
      'proof:variable-board-count-mana-target-illegal:' + sorted([source.id, engine.id]).join('|'),
      [source, engine],
      'repeatable creature untap engine cannot legally target the variable-count mana source',
      { sourceIsCreature: isCreaturePermanent(source) },
    );
  }

  const unitMana = variableManaUnitProfile(source);
  const isAttachedUntapper = hasCap(engine, 'is-attached-creature-untapper');
  const untapCost = isAttachedUntapper
    ? manaCostProfileFromCaps(engine, 'attached-creature-untap')
    : manaCostProfileFromCaps(engine, 'creature-untap-ability');
  let resetCost = { total: 0, colorless: 0, colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])) };
  const untapAbilityTapsEngine = hasCap(engine, 'creature-untap-ability-taps-source');
  if (untapAbilityTapsEngine) {
    if (!hasCap(engine, 'is-self-untapper')) {
      return failure(
        'proof:variable-board-count-mana-engine-tapped:' + sorted([source.id, engine.id]).join('|'),
        [source, engine],
        'repeatable untap ability taps its own source but the package cannot reset that source',
        { engine: engine.id },
      );
    }
    resetCost = manaCostProfileFromCaps(engine, 'self-untap');
  }
  const loopCost = addCostProfiles(untapCost, resetCost);
  const threshold = minimumVariableManaCountToPay(loopCost, unitMana, { requirePositive: true, maxCount: 50 });
  if (!Number.isFinite(threshold)) {
    return failure(
      'proof:variable-board-count-mana-cost:' + sorted([source.id, engine.id]).join('|'),
      [source, engine],
      'variable-count mana unit cannot pay the repeatable untap loop cost with a positive mana delta',
      { unitMana, loopCost },
    );
  }
  const producedAtThreshold = scaleManaProfile(unitMana, threshold);
  const netMana = producedAtThreshold.total - loopCost.total;
  if (netMana <= 0) {
    return failure(
      'proof:variable-board-count-mana-no-positive-delta:' + sorted([source.id, engine.id]).join('|'),
      [source, engine],
      'variable-count mana loop does not prove positive mana at its minimum threshold',
      { unitMana, loopCost, threshold, producedAtThreshold },
    );
  }
  const countSubjects = capSuffixes(source, 'variable-mana-counts:');
  const subject = countSubjects[0] || 'board-resource';
  const deltas = [
    { resource: 'mana', min: netMana, max: Infinity },
    { resource: 'untaps', min: 1, max: Infinity },
  ];
  if (hasCap(engine, 'is-repeatable-tap-draw-ability')) deltas.push({ resource: 'cards', min: 1, max: Infinity });
  if (hasCap(engine, 'is-repeatable-tap-lifegain-ability')) deltas.push({ resource: 'life', min: 1, max: Infinity });
  if (hasCap(engine, 'attached-untap-adds-pump')) deltas.push({ resource: 'pump', min: 1, max: Infinity });
  return success('proof:variable-board-count-mana:' + sorted([source.id, engine.id]).join('|'), 'variable-board-count-mana-loop', [source, engine], {
    requiredFacts: [
      fact(source, 'is-variable-board-count-mana-source'),
      fact(source, 'taps-for-mana'),
      fact(source, 'is-creature-permanent'),
      fact(source, 'variable-mana-unit-produced'),
      { card: source.id, kind: 'precondition', predicate: 'minimum-board-count', subject, value: threshold },
      fact(engine, isAttachedUntapper ? 'is-attached-creature-untapper' : 'is-repeatable-creature-untap-ability'),
      ...(untapAbilityTapsEngine ? [fact(engine, 'is-self-untapper')] : []),
      ...(hasCap(engine, 'is-repeatable-tap-draw-ability') ? [fact(engine, 'is-repeatable-tap-draw-ability')] : []),
      ...(hasCap(engine, 'is-repeatable-tap-lifegain-ability') ? [fact(engine, 'is-repeatable-tap-lifegain-ability')] : []),
    ],
    steps: [
      { card: source.id, action: `tap for variable mana using a minimum ${subject} count of ${threshold}`, delta: { mana: producedAtThreshold.total } },
      { card: engine.id, action: 'pay the repeatable creature-untap cost targeting the variable mana source', cost: { mana: untapCost.total, colors: untapCost.colors, colorless: untapCost.colorless } },
      ...(untapAbilityTapsEngine ? [{ card: engine.id, action: 'pay the engine self-untap cost to restore the repeatable untap source', cost: { mana: resetCost.total, colors: resetCost.colors, colorless: resetCost.colorless } }] : []),
      { action: 'the variable mana source and untap engine return to the same abstract state', delta: { mana: netMana, untaps: 1 } },
      ...(hasCap(engine, 'is-repeatable-tap-draw-ability') ? [{ card: engine.id, action: 'positive mana can repeatedly pay the tap draw mode after the loop is established', delta: { cards: 1 } }] : []),
      ...(hasCap(engine, 'is-repeatable-tap-lifegain-ability') ? [{ card: engine.id, action: 'positive mana can repeatedly pay the tap lifegain mode after the loop is established', delta: { life: 1 } }] : []),
      ...(hasCap(engine, 'attached-untap-adds-pump') ? [{ card: engine.id, action: 'the attached untap activation increases the creature power each iteration', delta: { pump: 1 } }] : []),
    ],
    assumptions: [
      `the board state has at least ${threshold} ${subject === 'board-resource' ? 'counted permanents/resources' : subject + ' resources'} for the variable mana ability`,
      'the repeatable untap ability can legally target the variable mana source each iteration',
    ],
    limitingClauses: ['conditional board-count threshold is explicit; this proof does not infer that an arbitrary deck currently controls the required count'],
    repeatability: { status: 'repeatable-threshold', reason: 'at the stated board-count threshold, variable mana pays the untap/reset costs and returns the package to the same abstract state with positive mana' },
  }, deltas);
}

function isDeterministicCombatResourceEngine(card) {
  return hasCap(card, 'is-combat-damage-land-untap-engine')
    || hasCap(card, 'is-attack-land-untap-engine')
    || hasCap(card, 'is-combat-damage-treasure-engine');
}

function isRejectedCombatResourceEngine(card) {
  return hasCap(card, 'is-random-combat-damage-treasure-source')
    || hasCap(card, 'is-fixed-combat-damage-treasure-source');
}

function extraCombatActivationTimingSafe(card) {
  if (!hasCap(card, 'is-repeatable-extra-combat-activator')) return false;
  if (hasCap(card, 'extra-combat-adds-main-phase')) return true;
  return !hasCap(card, 'extra-combat-activation-window:sorcery');
}

function extraCombatActivationSourceResetSafe(card) {
  const tapsSource = hasCap(card, 'extra-combat-activation-taps-source');
  const usesUntapSymbol = hasCap(card, 'extra-combat-activation-uses-untap-symbol');
  if (!tapsSource && !usesUntapSymbol) return true;
  if (!MODEL.faceCompatibleCaps(card, ['is-creature-permanent'])) return false;
  if (tapsSource && !hasCap(card, 'extra-combat-untaps-activating-creature')) return false;
  return true;
}

function proveCombatResourceExtraCombatPair(resourceEngine, extraCombat) {
  if (!hasCap(extraCombat, 'extra-combat-untaps-creatures')) {
    return failure(
      'proof:combat-resource-extra-combat-no-untap:' + sorted([resourceEngine.id, extraCombat.id]).join('|'),
      [resourceEngine, extraCombat],
      'extra-combat engine does not untap attackers/creatures, so the same combat resource source is not locally reset',
      { extraCombat: extraCombat.id },
    );
  }
  if (!extraCombatActivationSourceResetSafe(extraCombat)) {
    return failure(
      'proof:combat-resource-extra-combat-source-not-reset:' + sorted([resourceEngine.id, extraCombat.id]).join('|'),
      [resourceEngine, extraCombat],
      'extra-combat activation changes the source tap state, but the package does not prove that activating source is reset for the next activation',
      {
        extraCombat: extraCombat.id,
        tapsSource: hasCap(extraCombat, 'extra-combat-activation-taps-source'),
        usesUntapSymbol: hasCap(extraCombat, 'extra-combat-activation-uses-untap-symbol'),
        sourceIsCreature: MODEL.faceCompatibleCaps(extraCombat, ['is-creature-permanent']),
        untapsActivatingCreature: hasCap(extraCombat, 'extra-combat-untaps-activating-creature'),
      },
    );
  }
  if (!extraCombatActivationTimingSafe(extraCombat)) {
    return failure(
      'proof:combat-resource-extra-combat-timing:' + sorted([resourceEngine.id, extraCombat.id]).join('|'),
      [resourceEngine, extraCombat],
      hasCap(extraCombat, 'is-repeatable-extra-combat-attack-trigger')
        ? 'combat resource triggers cannot safely pay an attack-trigger extra-combat cost in the same combat without a separate initial-payment proof'
        : 'sorcery-speed extra-combat activation needs an additional main phase after combat to prove repeatable payment timing',
      {
        extraCombat: extraCombat.id,
        activationWindow: capSuffixes(extraCombat, 'extra-combat-activation-window:')[0] || 'unknown',
        addsMainPhase: hasCap(extraCombat, 'extra-combat-adds-main-phase'),
      },
    );
  }

  const cost = extraCombatCostProfile(extraCombat);
  if (!(cost.total > 0)) {
    return failure(
      'proof:combat-resource-extra-combat-missing-cost:' + sorted([resourceEngine.id, extraCombat.id]).join('|'),
      [resourceEngine, extraCombat],
      'extra-combat cost was not parsed, so resource accounting cannot prove repeatability',
      { cost },
    );
  }
  const usesTreasure = hasCap(resourceEngine, 'is-combat-damage-treasure-engine') && hasCap(resourceEngine, 'combat-damage-treasure-per-damage:1');
  const usesLandUntap = hasCap(resourceEngine, 'is-combat-damage-land-untap-engine') || hasCap(resourceEngine, 'is-attack-land-untap-engine');
  if (!usesTreasure && !usesLandUntap) {
    return failure(
      'proof:combat-resource-extra-combat-nondeterministic:' + sorted([resourceEngine.id, extraCombat.id]).join('|'),
      [resourceEngine, extraCombat],
      'combat resource trigger is not a deterministic per-damage Treasure or land-untap engine',
      {
        randomTreasure: hasCap(resourceEngine, 'is-random-combat-damage-treasure-source'),
        fixedTreasure: hasCap(resourceEngine, 'is-fixed-combat-damage-treasure-source'),
      },
    );
  }
  const resourceUnit = anyManaUnitProfile(1);
  const threshold = minimumVariableManaCountToPay(cost, resourceUnit, { requirePositive: false, maxCount: 50 });
  if (!Number.isFinite(threshold)) {
    return failure(
      'proof:combat-resource-extra-combat-cost:' + sorted([resourceEngine.id, extraCombat.id]).join('|'),
      [resourceEngine, extraCombat],
      'combat resource trigger cannot pay the extra-combat cost',
      { cost },
    );
  }

  const thresholdFact = usesTreasure
    ? { card: resourceEngine.id, kind: 'precondition', predicate: 'minimum-combat-damage', value: threshold }
    : { card: resourceEngine.id, kind: 'precondition', predicate: 'minimum-land-count', value: threshold };
  const needsConnect = hasCap(resourceEngine, 'combat-resource-requires-connect');
  const triggerKind = hasCap(resourceEngine, 'is-attack-land-untap-engine') ? 'attack' : 'combat-damage';
  const deltas = [
    { resource: 'combatPhases', min: 1, max: Infinity },
  ];
  if (usesLandUntap) deltas.push({ resource: 'untaps', min: 1, max: Infinity });
  return success('proof:combat-resource-extra-combat:' + sorted([resourceEngine.id, extraCombat.id]).join('|'), 'combat-resource→extra-combat-loop', [resourceEngine, extraCombat], {
    requiredFacts: [
      fact(extraCombat, 'is-repeatable-extra-combat-engine'),
      fact(extraCombat, 'is-repeatable-extra-combat-activator'),
      fact(extraCombat, 'extra-combat-untaps-creatures'),
      ...(hasCap(extraCombat, 'extra-combat-activation-taps-source') ? [fact(extraCombat, 'extra-combat-activation-taps-source'), fact(extraCombat, 'extra-combat-untaps-activating-creature'), fact(extraCombat, 'is-creature-permanent')] : []),
      ...(hasCap(extraCombat, 'extra-combat-activation-uses-untap-symbol') ? [fact(extraCombat, 'extra-combat-activation-uses-untap-symbol'), fact(extraCombat, 'is-creature-permanent')] : []),
      ...(hasCap(extraCombat, 'extra-combat-adds-main-phase') ? [fact(extraCombat, 'extra-combat-adds-main-phase')] : []),
      usesTreasure ? fact(resourceEngine, 'is-combat-damage-treasure-engine') : fact(resourceEngine, hasCap(resourceEngine, 'is-attack-land-untap-engine') ? 'is-attack-land-untap-engine' : 'is-combat-damage-land-untap-engine'),
      thresholdFact,
      ...(usesLandUntap ? [{ card: resourceEngine.id, kind: 'precondition', predicate: 'land-mana-can-pay-extra-combat-cost', value: cost.total, colors: cost.colors }] : []),
      ...(needsConnect ? [{ card: resourceEngine.id, kind: 'precondition', predicate: 'combat-damage-connects' }] : []),
      ...(hasCap(resourceEngine, 'combat-resource-requires-attack') ? [{ card: resourceEngine.id, kind: 'precondition', predicate: 'attack-trigger-can-be-declared' }] : []),
    ],
    steps: [
      {
        card: resourceEngine.id,
        action: usesTreasure
          ? `deal at least ${threshold} combat damage to create enough Treasure mana`
          : `trigger land untap with at least ${threshold} lands able to pay the extra-combat cost`,
        delta: usesTreasure ? { treasureMana: threshold } : { untappedLands: threshold },
      },
      { card: extraCombat.id, action: 'pay the repeatable extra-combat cost', cost: { mana: cost.total, colors: cost.colors, colorless: cost.colorless } },
      { card: extraCombat.id, action: 'untap attackers/creatures and create the next combat phase plus a payment window', delta: { combatPhases: 1 } },
      { action: 'the next combat repeats the same attack/connect resource trigger and restores the loop' },
    ],
    assumptions: [
      usesTreasure
        ? `a combat creature carrying or supported by the resource trigger deals at least ${threshold} combat damage each combat`
        : `the board has at least ${threshold} lands that can produce the mana required for the extra-combat activation`,
      needsConnect
        ? 'the combat-damage trigger connects with a player/opponent each combat'
        : 'the attack trigger can be declared each combat after the extra-combat engine untaps attackers',
      usesLandUntap ? 'the untapped lands can produce the colored mana required by the extra-combat cost' : 'Treasure mana can pay the colored extra-combat cost',
      'extra-combat timing provides a legal repeatable activation/payment window before the next combat begins',
    ],
    limitingClauses: [
      `conditional ${usesTreasure ? 'combat-damage' : 'land-count'} threshold is explicit; this proof does not infer that an arbitrary board state already satisfies it`,
      triggerKind === 'combat-damage' ? 'evasion/blocker state is not inferred; connection is an explicit precondition' : 'attack legality is an explicit precondition',
    ],
    repeatability: { status: 'repeatable-combat-threshold', reason: 'combat resource trigger pays the repeatable extra-combat cost, the extra-combat effect untaps attackers, and timing provides a fresh payment window' },
  }, deltas);
}

function proveCombatResourceExtraCombatLoop(cards) {
  const extraCombats = cards.filter(c => hasCap(c, 'is-repeatable-extra-combat-engine'));
  if (!extraCombats.length) return null;
  const deterministicResources = cards.filter(c => !extraCombats.includes(c) && isDeterministicCombatResourceEngine(c));
  const rejectedResources = cards.filter(c => !extraCombats.includes(c) && !isDeterministicCombatResourceEngine(c) && isRejectedCombatResourceEngine(c));
  const resourceEngines = [...deterministicResources, ...rejectedResources];
  if (!resourceEngines.length) {
    return failure(
      'proof:combat-resource-extra-combat-missing-resource-engine:' + sorted(cards.map(c => c.id)).join('|'),
      extraCombats,
      'repeatable extra-combat engine needs a package-local attack/connect resource trigger',
      { extraCombats: extraCombats.map(card => card.id) },
    );
  }

  const failures = [];
  for (const extraCombat of extraCombats) {
    for (const resourceEngine of resourceEngines) {
      const result = proveCombatResourceExtraCombatPair(resourceEngine, extraCombat);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
  }
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:combat-resource-extra-combat-all-rejected:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'no combat resource and extra-combat pairing satisfied strict repeatability gates',
    {
      rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12),
    },
  );
}

const COMBAT_SACRIFICE_AURA_CAPS = [
  'is-combat-sacrifice-extra-combat-aura',
  'combat-sacrifice-aura-requires-connect',
  'combat-sacrifice-aura-sacrifices-carrier',
  'combat-sacrifice-aura-reattaches',
  'combat-sacrifice-aura-untaps-creatures',
  'combat-sacrifice-aura-adds-combat',
];

const FRESH_CARRIER_CAPS = [
  'is-fresh-attack-carrier-source',
  'fresh-carrier-token-attacks',
  'fresh-carrier-token-has-haste',
  'fresh-carrier-continuity',
  'fresh-carrier-repeatable-each-combat',
  'fresh-carrier-legal-next-reattach-target',
  'fresh-carrier-timing:beginning-of-combat',
];

function isCombatSacrificeAuraCandidate(card) {
  return COMBAT_SACRIFICE_AURA_CAPS.some(cap => hasCap(card, cap));
}

function isFreshCarrierCandidate(card) {
  return FRESH_CARRIER_CAPS.some(cap => hasCap(card, cap));
}

function proveCombatSacrificeAuraExtraCombatPair(aura, carrierSource) {
  const missingAuraCaps = COMBAT_SACRIFICE_AURA_CAPS.filter(cap => !hasCap(aura, cap));
  if (missingAuraCaps.length) {
    return failure(
      'proof:combat-sacrifice-aura-extra-combat-aura-incomplete:' + sorted([aura.id, carrierSource.id]).join('|'),
      [aura, carrierSource],
      'combat-sacrifice Aura is missing required combat-damage, sacrifice, reattach, untap, or extra-combat text',
      { aura: aura.id, missing: missingAuraCaps },
    );
  }
  const missingCarrierCaps = FRESH_CARRIER_CAPS.filter(cap => !hasCap(carrierSource, cap));
  if (missingCarrierCaps.length) {
    return failure(
      'proof:combat-sacrifice-aura-extra-combat-no-fresh-carrier:' + sorted([aura.id, carrierSource.id]).join('|'),
      [aura, carrierSource],
      'combat-sacrifice Aura needs a package-local beginning-of-combat fresh carrier source that creates a combat-ready legal reattach target',
      { carrierSource: carrierSource.id, missing: missingCarrierCaps },
    );
  }
  if (!MODEL.faceCompatibleCaps(aura, COMBAT_SACRIFICE_AURA_CAPS)) {
    return failure(
      'proof:combat-sacrifice-aura-extra-combat-aura-face-incompatible:' + sorted([aura.id, carrierSource.id]).join('|'),
      [aura, carrierSource],
      'combat-sacrifice Aura loop facts do not coexist on a single legal face',
      { aura: aura.id },
    );
  }
  if (!MODEL.faceCompatibleCaps(carrierSource, FRESH_CARRIER_CAPS)) {
    return failure(
      'proof:combat-sacrifice-aura-extra-combat-carrier-face-incompatible:' + sorted([aura.id, carrierSource.id]).join('|'),
      [aura, carrierSource],
      'fresh carrier source facts do not coexist on a single legal face',
      { carrierSource: carrierSource.id },
    );
  }
  const freshCarrierCount = maxCapNumber(carrierSource, 'fresh-carrier-tokens-created');
  if (freshCarrierCount <= 0) {
    return failure(
      'proof:combat-sacrifice-aura-extra-combat-carrier-count-missing:' + sorted([aura.id, carrierSource.id]).join('|'),
      [aura, carrierSource],
      'fresh carrier source must expose a deterministic creature-token count',
      { carrierSource: carrierSource.id },
    );
  }
  return success('proof:combat-sacrifice-aura-extra-combat:' + sorted([aura.id, carrierSource.id]).join('|'), 'combat-sacrifice-aura→extra-combat-loop', [aura, carrierSource], {
    requiredFacts: [
      ...COMBAT_SACRIFICE_AURA_CAPS.map(cap => fact(aura, cap)),
      ...FRESH_CARRIER_CAPS.map(cap => fact(carrierSource, cap)),
      { card: aura.id, kind: 'precondition', predicate: 'current-enchanted-carrier-at-loop-entry' },
      { card: carrierSource.id, kind: 'precondition', predicate: 'fresh-carrier-source-distinct-from-sacrificed-carrier' },
      { card: aura.id, kind: 'precondition', predicate: 'combat-damage-connects' },
      { card: carrierSource.id, kind: 'precondition', predicate: 'fresh-carrier-continuity', value: freshCarrierCount },
      { card: carrierSource.id, kind: 'precondition', predicate: 'legal-reattach-target-at-trigger-resolution' },
    ],
    steps: [
      { action: 'loop starts with the Aura already attached to a legal current carrier while the carrier source remains separate' },
      { card: carrierSource.id, action: `create ${freshCarrierCount} hasty beginning-of-combat creature token carrier(s) before combat damage`, delta: { legalCarriers: freshCarrierCount } },
      { card: aura.id, action: 'current enchanted carrier deals combat damage to a player/opponent', delta: { combatDamageConnection: 1 } },
      { card: aura.id, action: 'sacrifice the current enchanted carrier and reattach the Aura to the fresh creature you control', delta: { sacrifices: 1, deathTriggers: 1, ltbTriggers: 1 } },
      { card: aura.id, action: 'untap all creatures you control and create the next combat phase', delta: { combatPhases: 1, untaps: 1 } },
      { action: 'the next combat repeats after the carrier source creates another legal reattach target' },
    ],
    assumptions: [
      'the loop is already established with the Aura attached to a legal current carrier',
      'the fresh carrier source is not the sacrificed enchanted carrier and remains available for later combats',
      'the enchanted carrier connects with a player/opponent each combat',
      'the hasty beginning-of-combat carrier token is a creature you control and remains a legal reattach target when the combat-damage trigger resolves',
      'reattaching to the fresh carrier establishes the next enchanted carrier before the additional combat begins',
    ],
    limitingClauses: [
      'no arbitrary external creature is inferred; the next carrier must be created by the package-local beginning-of-combat source from an established loop state',
      'attack-trigger, conditional, random, replacement-amplified, and wrong-timing token sources are outside this strict proof',
      'the proof does not claim surplus tokens, mana, damage, or win-game results',
    ],
    repeatability: { status: 'repeatable-combat-carrier', reason: 'from an established loop state, each combat creates a hasty fresh legal carrier, the Aura sacrifices the current carrier, reattaches to the fresh carrier, untaps creatures, and adds the next combat' },
  }, [
    { resource: 'combatPhases', min: 1, max: Infinity },
    { resource: 'sacrifices', min: 1, max: Infinity },
    { resource: 'deathTriggers', min: 1, max: Infinity },
    { resource: 'ltbTriggers', min: 1, max: Infinity },
    { resource: 'untaps', min: 1, max: Infinity },
  ]);
}

function proveCombatSacrificeAuraExtraCombatLoop(cards) {
  const auras = (cards || []).filter(isCombatSacrificeAuraCandidate);
  if (!auras.length) return null;
  const carrierSources = (cards || []).filter(c => !auras.includes(c) && isFreshCarrierCandidate(c));
  if (!carrierSources.length) {
    return failure(
      'proof:combat-sacrifice-aura-extra-combat-missing-fresh-carrier:' + sorted(cards.map(c => c.id)).join('|'),
      auras,
      'combat-sacrifice Aura needs a package-local beginning-of-combat fresh carrier source',
      { auras: auras.map(card => card.id) },
    );
  }

  const failures = [];
  for (const aura of auras) {
    for (const carrierSource of carrierSources) {
      const result = proveCombatSacrificeAuraExtraCombatPair(aura, carrierSource);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
  }
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:combat-sacrifice-aura-extra-combat-all-rejected:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'no combat-sacrifice Aura and fresh carrier pairing satisfied strict repeatability gates',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  );
}

function proveArtifactTokenExtraTurnPair(source, extraTurn) {
  const sacrificeCount = artifactExtraTurnSacCount(extraTurn);
  const baseTokens = artifactTokensPerTurn(source);
  if (!(sacrificeCount > 0 && baseTokens >= sacrificeCount)) {
    return failure(
      'proof:artifact-token-extra-turn-threshold:' + sorted([source.id, extraTurn.id]).join('|'),
      [source, extraTurn],
      'turn-cycle artifact token refill does not meet the extra-turn artifact sacrifice threshold',
      { sacrificeCount, artifactTokensPerTurn: baseTokens },
    );
  }
  return success('proof:artifact-token-extra-turn:' + sorted([source.id, extraTurn.id]).join('|'), 'artifact-token→extra-turn-loop', [source, extraTurn], {
    requiredFacts: [
      fact(source, 'is-turn-cycle-artifact-token-engine'),
      { card: source.id, kind: 'precondition', predicate: 'artifact-tokens-per-turn', value: baseTokens },
      fact(extraTurn, 'is-artifact-sacrifice-extra-turn-engine'),
      { card: extraTurn.id, kind: 'precondition', predicate: 'artifact-extra-turn-sac-count', value: sacrificeCount },
    ],
    steps: [
      { card: source.id, action: `create ${baseTokens} artifact token(s) on a turn-cycle trigger`, delta: { artifactTokens: baseTokens } },
      { card: extraTurn.id, action: `sacrifice ${sacrificeCount} artifact tokens to take an extra turn`, delta: { turns: 1 } },
      { action: 'the extra turn repeats the same turn-cycle artifact-token trigger before the next activation' },
    ],
    assumptions: [
      'the turn-cycle artifact-token trigger occurs during each extra turn before the extra-turn activation is needed again',
      'the produced artifact tokens remain available to pay the artifact sacrifice cost',
    ],
    limitingClauses: [
      'the proof does not claim surplus artifact tokens, mana, or other payoff unless a separate proof establishes positive surplus',
      'variable, random, replacement-amplified, or combat-damage-dependent artifact token counts are excluded from this strict turn-cycle proof',
    ],
    repeatability: { status: 'repeatable-turn-cycle-threshold', reason: 'each extra turn refreshes enough artifact tokens to pay the artifact-sacrifice extra-turn activation again' },
  }, [{ resource: 'turns', min: 1, max: Infinity }]);
}

function proveArtifactTokenExtraTurnLoop(cards) {
  const extraTurns = (cards || []).filter(c => hasCap(c, 'is-artifact-sacrifice-extra-turn-engine'));
  if (!extraTurns.length) return null;
  const sources = (cards || []).filter(c => hasCap(c, 'is-turn-cycle-artifact-token-engine'));
  if (!sources.length) {
    return failure(
      'proof:artifact-token-extra-turn-missing-source:' + sorted(cards.map(c => c.id)).join('|'),
      extraTurns,
      'artifact-sacrifice extra-turn engine needs a package-local turn-cycle artifact token refill',
      { extraTurns: extraTurns.map(card => card.id) },
    );
  }

  const failures = [];
  for (const extraTurn of extraTurns) {
    for (const source of sources) {
      const result = proveArtifactTokenExtraTurnPair(source, extraTurn);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
  }
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:artifact-token-extra-turn-all-rejected:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'no artifact-token refill and artifact-sacrifice extra-turn pairing satisfied strict repeatability gates',
    {
      rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12),
    },
  );
}

function isArtifactCounterThresholdEngine(card) {
  return hasCap(card, 'is-counter-threshold-extra-turn-engine')
    && hasCap(card, 'counter-threshold-extra-turn-target:self-artifact')
    && hasCap(card, 'counter-threshold-extra-turn-type:charge')
    && /\bartifact\b/i.test(card.type || '');
}

function isZeroManaProfile(profile) {
  return (profile.total || 0) === 0
    && (profile.colorless || 0) === 0
    && !Object.values(profile.colors || {}).some(Boolean);
}

function counterDoublerCanTargetEngine(doubler, engine) {
  if (!/\bartifact\b/i.test(engine.type || '')) return false;
  return hasCap(doubler, 'counter-doubler-target:artifact')
    || hasCap(doubler, 'counter-doubler-target:any-permanent');
}

function proveCounterThresholdDoublerExtraTurnPair(doubler, engine) {
  const threshold = counterThresholdExtraTurnCount(engine);
  if (!(threshold > 0)) return null;
  if (!counterDoublerCanTargetEngine(doubler, engine)) {
    return failure(
      'proof:counter-threshold-doubler-target-illegal:' + sorted([doubler.id, engine.id]).join('|'),
      [doubler, engine],
      'repeatable counter doubler cannot legally target the extra-turn engine',
      { engineType: engine.type, doublerCaps: doubler.caps.filter(cap => cap.startsWith('counter-doubler-target:')) },
    );
  }
  const manaCost = manaCostProfileFromCaps(doubler, 'counter-doubler');
  if (!isZeroManaProfile(manaCost)) {
    return failure(
      'proof:counter-threshold-doubler-cost:' + sorted([doubler.id, engine.id]).join('|'),
      [doubler, engine],
      'counter doubler has a repeatable mana cost the package does not pay locally',
      { manaCost },
    );
  }
  return success('proof:counter-threshold-doubler-extra-turn:' + sorted([doubler.id, engine.id]).join('|'), 'counter-threshold-doubler→extra-turn-loop', [doubler, engine], {
    requiredFacts: [
      fact(doubler, 'is-repeatable-counter-doubler'),
      fact(engine, 'is-counter-threshold-extra-turn-engine'),
      { card: engine.id, kind: 'precondition', predicate: 'counter-threshold-extra-turn-threshold', value: threshold },
      { card: engine.id, kind: 'precondition', predicate: 'established-counters-at-loop-entry', value: threshold },
      { card: doubler.id, kind: 'precondition', predicate: 'counter-doubler-targets-extra-turn-engine' },
    ],
    steps: [
      { card: engine.id, action: `begin the loop with ${threshold} charge counter(s) on the extra-turn engine` },
      { card: doubler.id, action: `double the counters on the extra-turn engine from ${threshold} to ${threshold * 2}` },
      { card: engine.id, action: `remove ${threshold} charge counter(s) to take an extra turn`, delta: { turns: 1, counters: -threshold } },
      { action: `the extra turn untap step resets the doubler and leaves ${threshold} charge counter(s) on the engine for the next iteration`, delta: { counters: threshold } },
    ],
    assumptions: [
      'the loop begins from an explicit established state where the extra-turn engine already has the threshold number of charge counters',
      'the counter doubler starts untapped and can target the same artifact every extra turn',
    ],
    limitingClauses: [
      'the proof does not infer ambient starting counters from the board',
      'the proof does not claim infinite counters or mana when the doubled state only restores the threshold after payment',
      'nonzero mana costs for the doubler remain outside this strict package',
    ],
    repeatability: { status: 'repeatable-turn-threshold', reason: 'doubling a threshold number of counters leaves the same threshold behind after each extra-turn activation' },
  }, [{ resource: 'turns', min: 1, max: Infinity }]);
}

function proveCounterThresholdDoublerExtraTurnLoop(cards) {
  const engines = (cards || []).filter(isArtifactCounterThresholdEngine);
  if (!engines.length) return null;
  const doublers = (cards || []).filter(c => hasCap(c, 'is-repeatable-counter-doubler'));
  if (!doublers.length) {
    return failure(
      'proof:counter-threshold-doubler-missing-support:' + sorted(cards.map(c => c.id)).join('|'),
      engines,
      'counter-threshold extra-turn engine needs a package-local repeatable counter doubler',
      { engines: engines.map(card => card.id) },
    );
  }
  const failures = [];
  for (const engine of engines) {
    for (const doubler of doublers) {
      const result = proveCounterThresholdDoublerExtraTurnPair(doubler, engine);
      if (result && result.status === ProofStatus.Proven) return result;
      if (result) failures.push(result);
    }
  }
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:counter-threshold-doubler-all-rejected:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'no counter doubler and counter-threshold extra-turn pairing satisfied strict threshold gates',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  );
}

function proveCounterThresholdProliferateExtraTurnLoop(cards) {
  const engines = (cards || []).filter(isArtifactCounterThresholdEngine);
  if (!engines.length) return null;
  const proliferators = (cards || []).filter(c => hasCap(c, 'is-repeatable-proliferator') || hasCap(c, 'is-turn-cycle-proliferator'));
  if (!proliferators.length) {
    return failure(
      'proof:counter-threshold-proliferate-missing-support:' + sorted(cards.map(c => c.id)).join('|'),
      engines,
      'counter-threshold extra-turn engine needs a package-local proliferate source',
      { engines: engines.map(card => card.id) },
    );
  }
  const multipliers = (cards || []).filter(c => hasCap(c, 'is-proliferate-multiplier'));
  const failures = [];
  for (const engine of engines) {
    const threshold = counterThresholdExtraTurnCount(engine);
    for (const proliferator of proliferators) {
      const manaCost = manaCostProfileFromCaps(proliferator, 'proliferate');
      if (hasCap(proliferator, 'is-repeatable-proliferator') && !isZeroManaProfile(manaCost)) {
        failures.push(failure(
          'proof:counter-threshold-proliferate-cost:' + sorted([proliferator.id, engine.id]).join('|'),
          [proliferator, engine],
          'proliferate source has a repeatable mana cost the package does not pay locally',
          { manaCost },
        ));
        continue;
      }
      const baseCount = proliferateCountPerTurn(proliferator);
      const multiplier = multipliers.length ? Math.max(...multipliers.map(proliferateMultiplier)) : 1;
      const totalCount = baseCount * multiplier;
      if (!(baseCount > 0 && totalCount >= threshold)) {
        failures.push(failure(
          'proof:counter-threshold-proliferate-threshold:' + sorted([proliferator.id, engine.id]).join('|'),
          uniqueCards([proliferator, engine, ...multipliers]),
          'proliferate support does not reach the extra-turn counter threshold while preserving a seed counter',
          { threshold, proliferateCountPerTurn: baseCount, proliferateMultiplier: multiplier, totalProliferatesPerTurn: totalCount },
        ));
        continue;
      }
      const proofCards = uniqueCards([proliferator, engine, ...multipliers.slice(0, 1)]);
      return success('proof:counter-threshold-proliferate-extra-turn:' + sorted(proofCards.map(card => card.id)).join('|'), 'counter-threshold-proliferate→extra-turn-loop', proofCards, {
        requiredFacts: [
          fact(engine, 'is-counter-threshold-extra-turn-engine'),
          fact(proliferator, hasCap(proliferator, 'is-turn-cycle-proliferator') ? 'is-turn-cycle-proliferator' : 'is-repeatable-proliferator'),
          { card: engine.id, kind: 'precondition', predicate: 'counter-threshold-extra-turn-threshold', value: threshold },
          { card: engine.id, kind: 'precondition', predicate: 'established-counters-at-loop-entry', value: 1 },
          { card: proliferator.id, kind: 'precondition', predicate: 'proliferate-count-per-turn', value: baseCount },
          ...(multiplier > 1 ? [{ card: multipliers[0].id, kind: 'precondition', predicate: 'proliferate-multiplier', value: multiplier }] : []),
        ],
        steps: [
          { card: engine.id, action: 'begin the loop with one seeded charge counter on the extra-turn engine' },
          { card: proliferator.id, action: `proliferate ${baseCount} time(s) during the turn`, delta: { counters: baseCount } },
          ...(multiplier > 1 ? [{ card: multipliers[0].id, action: `double each proliferate event to ${totalCount} total proliferate applications this turn`, delta: { counters: totalCount - baseCount } }] : []),
          { card: engine.id, action: `remove ${threshold} charge counter(s) to take an extra turn`, delta: { turns: 1, counters: -threshold } },
          { action: `after paying the threshold, ${1 + totalCount - threshold} charge counter(s) remain on the engine, so the next extra turn begins with a valid proliferate seed`, delta: { counters: 1 + totalCount - threshold } },
        ],
        assumptions: [
          'the loop begins from an explicit established state with one relevant counter already on the extra-turn engine',
          'the proliferate source can resolve once each turn or extra turn without needing another local resource proof',
        ],
        limitingClauses: [
          'proliferate cannot start from zero counters, so the seed counter is an explicit precondition rather than an inferred board state',
          'the proof does not claim infinite counters or mana when the package only reaches the extra-turn threshold again',
          'nonzero proliferate activation costs remain outside this strict package',
        ],
        repeatability: { status: 'repeatable-turn-threshold', reason: 'the package proliferates enough times every turn to reach the extra-turn threshold and still leave a seeded counter behind' },
      }, [{ resource: 'turns', min: 1, max: Infinity }]);
    }
  }
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:counter-threshold-proliferate-all-rejected:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'no proliferate and counter-threshold extra-turn pairing satisfied strict threshold gates',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  );
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

function proveBlinkSpellRecursionLandUntap(cards) {
  const blinkSpells = cards.filter(card => hasCap(card, 'is-multi-target-blink-spell')
    && hasCap(card, 'blink-spell-target:creature')
    && maxCapNumber(card, 'blink-target-count') >= 2);
  const untappers = cards.filter(card => hasCap(card, 'etb-untaps-land'));
  const recursors = cards.filter(card => hasCap(card, 'is-etb-spell-recursion-to-hand'));
  if (!blinkSpells.length || !untappers.length || !recursors.length) return null;

  const failures = [];
  for (const blink of blinkSpells) {
    for (const untapper of untappers) {
      for (const recursor of recursors) {
        if (blink === untapper || blink === recursor || untapper === recursor) continue;
        const recoveryTarget = /\bsorcery\b/i.test(blink.type) ? 'sorcery' : 'instant';
        if (!hasCap(recursor, 'etb-recursion-target:any-card') && !hasCap(recursor, 'etb-recursion-target:' + recoveryTarget)) continue;
        const spellCost = minCapNumber(blink, 'blink-spell-cost');
        const untapCount = maxCapNumber(untapper, 'etb-untaps-land');
        if (untapCount < spellCost) {
          failures.push(failure(
            'proof:blink-spell-recursion-land-untap-mana:' + sorted([blink.id, untapper.id, recursor.id]).join('|'),
            [blink, untapper, recursor],
            'ETB land untap cannot repay the recovered blink spell',
            { spellCost, untapCount },
          ));
          continue;
        }
        const netMana = untapCount - spellCost;
        const drawCount = maxCapNumber(blink, 'blink-spell-draw-count');
        const proofCards = [blink, untapper, recursor];
        return success(
          'proof:blink-spell-recursion-land-untap:' + sorted(proofCards.map(card => card.id)).join('|'),
          'blink-spell-recursion-land-untap-loop',
          proofCards,
          {
            requiredFacts: [
              fact(blink, 'is-multi-target-blink-spell'),
              fact(blink, 'blink-spell-target:creature'),
              { card: blink.id, kind: 'target-legality', predicate: 'blink-target-count', value: 2 },
              fact(untapper, 'etb-untaps-land'),
              fact(recursor, 'is-etb-spell-recursion-to-hand'),
              fact(recursor, hasCap(recursor, 'etb-recursion-target:any-card') ? 'etb-recursion-target:any-card' : 'etb-recursion-target:' + recoveryTarget),
              ...(drawCount > 0 ? [fact(blink, 'blink-spell-draw-count')] : []),
              { card: blink.id, kind: 'precondition', predicate: 'minimum-available-lands', value: spellCost },
              { card: blink.id, kind: 'precondition', predicate: 'lands-can-pay-blink-spell-colors' },
            ],
            steps: [
              { card: blink.id, action: `pay ${spellCost} mana and cast the blink spell targeting both ETB creatures`, cost: { mana: spellCost } },
              { card: blink.id, action: 'exile both creatures, return them immediately, then put the resolved spell into the graveyard', delta: { casts: 1, blinks: 2, etbTriggers: 2, ltbTriggers: 2, ...(drawCount > 0 ? { cards: drawCount } : {}) } },
              { card: untapper.id, action: `resolve its ETB trigger and untap up to ${untapCount} lands`, delta: { untaps: untapCount, mana: untapCount } },
              { card: recursor.id, action: 'resolve its ETB trigger targeting the blink spell and return that spell from the graveyard to hand' },
              { action: netMana > 0 ? `the spell and both creatures are restored with ${netMana} net mana` : 'the spell, both creatures, and spent mana are restored at break-even' },
            ],
            assumptions: [
              `at least ${spellCost} lands are available and can produce the blink spell's required colors`,
              'the spell-recursion ETB trigger is ordered after the blink spell has resolved into the graveyard',
            ],
            limitingClauses: [
              'the proof requires two legal creature targets and immediate battlefield return',
              'generic graveyard recursion does not qualify unless it explicitly returns the resolved spell to hand',
              'no extra ETB payoff or deterministic win condition is inferred',
            ],
            repeatability: { status: netMana > 0 ? 'repeatable' : 'repeatable-break-even', reason: 'each iteration restores the blink spell, both ETB creatures, and enough land mana to cast the spell again' },
          },
          [
            { resource: 'casts', min: 1, max: Infinity },
            { resource: 'etbTriggers', min: 2, max: Infinity },
            { resource: 'ltbTriggers', min: 2, max: Infinity },
            { resource: 'untaps', min: untapCount, max: Infinity },
            ...(drawCount > 0 ? [{ resource: 'cards', min: drawCount, max: Infinity }] : []),
            ...(netMana > 0 ? [{ resource: 'mana', min: netMana, max: Infinity }] : []),
          ],
        );
      }
    }
  }
  if (failures.length === 1) return failures[0];
  return failures.length ? failure(
    'proof:blink-spell-recursion-land-untap-all-rejected:' + sorted(cards.map(card => card.id)).join('|'),
    cards,
    'no multi-target blink, ETB untap, and spell-recursion assembly closed its mana payment',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  ) : null;
}

function proveBlinkSpellRecursionManaArtifact(cards) {
  const blinkSpells = cards.filter(card => hasCap(card, 'is-multi-target-blink-spell')
    && hasCap(card, 'blink-spell-target:creature')
    && hasCap(card, 'blink-spell-target:artifact')
    && maxCapNumber(card, 'blink-target-count') >= 2);
  const manaArtifacts = cards.filter(card => hasCap(card, 'is-blink-resettable-mana-artifact'));
  const recursors = cards.filter(card => hasCap(card, 'is-etb-spell-recursion-to-hand'));
  if (!blinkSpells.length || !manaArtifacts.length || !recursors.length) return null;

  const failures = [];
  for (const blink of blinkSpells) {
    const spellCost = manaCostProfileFromCaps(blink, 'blink-spell');
    const recoveryTarget = /\bsorcery\b/i.test(blink.type) ? 'sorcery' : 'instant';
    for (const manaArtifact of manaArtifacts) {
      const mana = manaProductionProfileFromCaps(manaArtifact, 'blink-reset-mana');
      for (const recursor of recursors) {
        if (blink === manaArtifact || blink === recursor || manaArtifact === recursor) continue;
        if (!hasCap(recursor, 'etb-recursion-target:any-card') && !hasCap(recursor, 'etb-recursion-target:' + recoveryTarget)) continue;
        if (!canPayManaCost(spellCost, mana)) {
          failures.push(failure(
            'proof:blink-spell-recursion-mana-artifact-payment:' + sorted([blink.id, manaArtifact.id, recursor.id]).join('|'),
            [blink, manaArtifact, recursor],
            'reset mana artifact cannot pay the recovered blink spell full colored cost',
            { spellCost, mana },
          ));
          continue;
        }
        const netMana = mana.total - spellCost.total;
        const drawCount = maxCapNumber(manaArtifact, 'blink-reset-mana-etb-draw-count');
        const proofCards = [blink, manaArtifact, recursor];
        return success(
          'proof:blink-spell-recursion-mana-artifact:' + sorted(proofCards.map(card => card.id)).join('|'),
          'blink-spell-recursion-mana-artifact-loop',
          proofCards,
          {
            requiredFacts: [
              fact(blink, 'is-multi-target-blink-spell'),
              fact(blink, 'blink-spell-target:creature'),
              fact(blink, 'blink-spell-target:artifact'),
              { card: blink.id, kind: 'target-legality', predicate: 'blink-target-count', value: 2 },
              fact(manaArtifact, 'is-blink-resettable-mana-artifact'),
              fact(manaArtifact, 'blink-reset-mana-produced'),
              fact(recursor, 'is-etb-spell-recursion-to-hand'),
              fact(recursor, hasCap(recursor, 'etb-recursion-target:any-card') ? 'etb-recursion-target:any-card' : 'etb-recursion-target:' + recoveryTarget),
              ...(drawCount > 0 ? [fact(manaArtifact, 'blink-reset-mana-etb-draw-count')] : []),
              { card: manaArtifact.id, kind: 'precondition', predicate: 'mana-artifact-untapped-at-loop-entry' },
            ],
            steps: [
              { card: manaArtifact.id, action: `tap the artifact for ${mana.total} mana`, delta: { mana: mana.total } },
              { card: blink.id, action: `pay the full ${spellCost.total}-mana colored cost and cast the blink spell targeting the mana artifact and ETB recursor`, cost: { mana: spellCost.total, colors: spellCost.colors, colorless: spellCost.colorless } },
              { card: blink.id, action: 'exile both targets, return them immediately, then put the resolved spell into the graveyard', delta: { casts: 1, blinks: 2, etbTriggers: 2, ltbTriggers: 2 } },
              { card: manaArtifact.id, action: 'return as a new untapped noncreature artifact that can activate its mana ability again', ...(drawCount > 0 ? { delta: { cards: drawCount } } : {}) },
              { card: recursor.id, action: 'resolve its ETB trigger and return the blink spell from the graveyard to hand' },
              { action: netMana > 0 ? `the spell and both permanents are restored with ${netMana} net mana` : 'the spell, artifact, recursor, and spent mana are restored at break-even' },
            ],
            assumptions: ['the mana artifact and ETB recursor are on the battlefield and the artifact is untapped at loop entry'],
            limitingClauses: [
              'artifact creatures, enters-tapped artifacts, sacrifice mana abilities, and restricted mana are excluded',
              'the mana profile must satisfy colored and explicit colorless pips, not only total mana value',
              'no untap-trigger result is claimed because zone reset is not an untap event',
            ],
            repeatability: { status: netMana > 0 ? 'repeatable' : 'repeatable-break-even', reason: 'each iteration restores the blink spell, ETB recursor, and an untapped artifact whose mana can cast the spell again' },
          },
          [
            { resource: 'casts', min: 1, max: Infinity },
            { resource: 'etbTriggers', min: 2, max: Infinity },
            { resource: 'ltbTriggers', min: 2, max: Infinity },
            ...(drawCount > 0 ? [{ resource: 'cards', min: drawCount, max: Infinity }] : []),
            ...(netMana > 0 ? [{ resource: 'mana', min: netMana, max: Infinity }] : []),
          ],
        );
      }
    }
  }
  if (failures.length === 1) return failures[0];
  return failures.length ? failure(
    'proof:blink-spell-recursion-mana-artifact-all-rejected:' + sorted(cards.map(card => card.id)).join('|'),
    cards,
    'no blink spell, mana artifact, and ETB recursion assembly closed its colored mana payment',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  ) : null;
}

function proveFoodSacrificeTokenFeedback(cards) {
  const engine = find(cards, card => hasCap(card, 'is-food-sacrifice-draw-engine') && hasCap(card, 'is-food-token-replacement'));
  const source = find(cards, card => card !== engine && hasCap(card, 'is-food-sacrifice-token-trigger'));
  if (!engine || !source) return null;

  const sacrificeCount = maxCapNumber(engine, 'food-sacrifice-count');
  const drawCount = maxCapNumber(engine, 'food-sacrifice-draw-count');
  const replacementCount = maxCapNumber(engine, 'food-replacement-extra-count');
  const baseTokenCount = maxCapNumber(source, 'food-sacrifice-trigger-token-count');
  const restoredFoods = sacrificeCount * replacementCount;
  if (!(sacrificeCount > 0 && drawCount > 0 && replacementCount > 0 && baseTokenCount > 0)) return null;
  if (restoredFoods < sacrificeCount) {
    return failure(
      'proof:food-sacrifice-token-feedback-shortfall:' + sorted([engine.id, source.id]).join('|'),
      [engine, source],
      'Food sacrifice token triggers do not restore the full Food activation threshold',
      { sacrificeCount, replacementCount, restoredFoods },
    );
  }

  const tokenSurplus = sacrificeCount * baseTokenCount;
  return success('proof:food-sacrifice-token-feedback:' + sorted([engine.id, source.id]).join('|'), 'food-sacrifice-token-feedback-loop', [engine, source], {
    requiredFacts: [
      fact(engine, 'is-food-sacrifice-draw-engine'),
      fact(engine, 'is-food-token-replacement'),
      fact(engine, 'food-sacrifice-count'),
      fact(engine, 'food-sacrifice-draw-count'),
      fact(engine, 'food-replacement-extra-count'),
      fact(source, 'is-food-sacrifice-token-trigger'),
      fact(source, 'food-sacrifice-trigger-token-count'),
      { card: engine.id, kind: 'precondition', predicate: 'established-food-count-at-loop-entry', value: sacrificeCount },
    ],
    steps: [
      { card: engine.id, action: `begin with ${sacrificeCount} Foods and sacrifice them to draw ${drawCount} card(s)`, delta: { sacrifices: sacrificeCount, cards: drawCount, foods: -sacrificeCount } },
      { card: source.id, action: `each Food sacrifice triggers separately, creating ${baseTokenCount} base token(s) per trigger`, delta: { tokens: tokenSurplus } },
      { card: engine.id, action: `replace each of the ${sacrificeCount} token-creation events with the same tokens plus ${replacementCount} Food`, delta: { foods: restoredFoods } },
      { action: `the ${sacrificeCount}-Food threshold is restored while ${tokenSurplus} non-Food token(s) and ${drawCount} card(s) accumulate` },
    ],
    assumptions: [`the loop begins with ${sacrificeCount} Foods on the battlefield`],
    limitingClauses: [
      'the sacrifice trigger must fire once per Food, not once for one-or-more Foods',
      'restored Foods close the resource loop but are not counted as token surplus',
      'tapped Treasure created by the source is not treated as immediate mana',
    ],
    repeatability: { status: 'repeatable-threshold', reason: 'each sacrificed Food creates a separate replacement event that restores one Food and preserves the full activation threshold' },
  }, [
    { resource: 'cards', min: drawCount, max: Infinity },
    { resource: 'tokens', min: tokenSurplus, max: Infinity },
    { resource: 'sacrifices', min: sacrificeCount, max: Infinity },
    { resource: 'etbTriggers', min: sacrificeCount * (baseTokenCount + replacementCount), max: Infinity },
    { resource: 'ltbTriggers', min: sacrificeCount, max: Infinity },
  ]);
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
  if (!damageToDrawAppliesToSource(damageToDraw, drawToDamage)) {
    return failure(
      'proof:draw-damage-scope-mismatch:' + sorted([drawToDamage.id, damageToDraw.id]).join('|'),
      [drawToDamage, damageToDraw],
      'damage-to-draw trigger does not apply to the draw-triggered damage source',
      { damageToDrawScopes: (damageToDraw.caps || []).filter(cap => cap.startsWith('damage-to-draw-scope:')) },
    );
  }
  return success('proof:draw-damage-feedback:' + sorted([drawToDamage.id, damageToDraw.id]).join('|'), 'draw-damage-feedback-loop', [drawToDamage, damageToDraw], {
    requiredFacts: [
      fact(drawToDamage, (drawToDamage.caps || []).find(cap => cap.startsWith('draw-to-damage-subject:')) || 'is-draw-to-damage-payoff'),
      fact(damageToDraw, 'is-damage-to-draw-payoff'),
      ...(MODEL.faceCompatibleCaps(drawToDamage, ['is-creature-permanent']) ? [fact(drawToDamage, 'is-creature-permanent')] : []),
    ],
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

function proveSelfCopySpellMagecraftDrain(cards) {
  const selfCopySpell = find(cards, c => hasCap(c, 'is-self-copying-targeted-spell'));
  const drainPayoff = find(cards, c => c !== selfCopySpell && hasCap(c, 'is-magecraft-drain-payoff'));
  if (!selfCopySpell || !drainPayoff) return null;
  const drainAmount = Math.max(1, Number(capValue(drainPayoff, 'magecraft-drain-amount') || 1));
  return success('proof:self-copy-spell-magecraft-drain:' + sorted([selfCopySpell.id, drainPayoff.id]).join('|'), 'self-copy-spell→magecraft-drain-loop', [selfCopySpell, drainPayoff], {
    requiredFacts: [
      fact(selfCopySpell, 'is-self-copying-targeted-spell'),
      fact(drainPayoff, 'is-magecraft-drain-payoff'),
    ],
    steps: [
      { card: selfCopySpell.id, action: 'target yourself or another willing player with the spell that lets that player copy it and choose a new target' },
      { card: selfCopySpell.id, action: 'copy the spell and choose the same player as the new target' },
      { card: drainPayoff.id, action: 'each copied instant/sorcery spell triggers the magecraft-style drain payoff' },
      { action: 'the copied spell resolves and offers the same copy choice again, recreating the trigger condition' },
    ],
    assumptions: ['the spell can legally target a player who chooses to keep copying it'],
    repeatability: { status: 'repeatable-candidate', reason: 'each spell copy recreates the same optional copy instruction' },
  }, [
    { resource: 'life', min: drainAmount, max: Infinity },
    { resource: 'opponentLife', min: -Infinity, max: -drainAmount },
    { resource: 'magecraftTriggers', min: 1, max: Infinity },
  ]);
}

function proveBuybackCopyRitualLoop(cards) {
  const copySpell = find(cards, c => hasCap(c, 'is-buyback-spell-copy'));
  const ritual = find(cards, c => c !== copySpell && hasCap(c, 'is-ritual-mana-spell'));
  if (!copySpell || !ritual) {
    if (copySpell || ritual) {
      return failure(
        'proof:buyback-copy-ritual-missing-role:' + sorted(cards.map(c => c.id)).join('|'),
        cards,
        'buyback copy loop needs both a buyback spell-copy card and a mana-producing instant/sorcery spell',
        { hasBuybackCopy: Boolean(copySpell), hasRitual: Boolean(ritual) },
      );
    }
    return null;
  }
  const ritualMana = manaProductionProfileFromCaps(ritual, 'ritual-spell-mana');
  const reducer = find(cards, c => c !== copySpell && c !== ritual
    && hasCap(c, 'is-spell-cost-reducer')
    && spellCostReducerApplies(c, copySpell)
    && maxCapNumber(c, 'spell-cost-reduction') > 0);
  const spellcastManaPayoff = find(cards, c => c !== copySpell && c !== ritual
    && hasCap(c, 'is-spellcast-mana-payoff'));
  const supportMana = spellcastManaPayoff ? manaProductionProfileFromCaps(spellcastManaPayoff, 'spellcast-mana') : null;
  const availableMana = supportMana ? addManaProfiles(ritualMana, supportMana) : ritualMana;
  const unreducedCost = manaCostProfileFromCaps(copySpell, 'buyback-copy');
  const reduction = reducer ? maxCapNumber(reducer, 'spell-cost-reduction') : 0;
  const copyCost = reduceGenericCost(unreducedCost, reduction);
  if (!canPayRecursiveCost(copyCost, availableMana)) {
    return failure(
      'proof:buyback-copy-ritual-cost:' + sorted([copySpell.id, ritual.id, reducer?.id, spellcastManaPayoff?.id]).join('|'),
      uniqueCards([copySpell, ritual, reducer, spellcastManaPayoff]),
      'copied ritual mana plus local support cannot pay the buyback spell-copy cost',
      { ritualMana, supportMana, unreducedCost, reduction, copyCost, availableMana },
    );
  }
  const netMana = availableMana.total - copyCost.total;
  const proofCards = uniqueCards([copySpell, ritual, reducer, spellcastManaPayoff]);
  return success('proof:buyback-copy-ritual:' + sorted(proofCards.map(card => card.id)).join('|'), 'buyback-copy-ritual-loop', proofCards, {
    requiredFacts: [
      fact(copySpell, 'is-buyback-spell-copy'),
      fact(copySpell, 'buyback-copy-cost'),
      fact(ritual, 'is-ritual-mana-spell'),
      fact(ritual, 'ritual-spell-mana-produced'),
      ...(reducer ? [fact(reducer, 'is-spell-cost-reducer'), fact(reducer, 'spell-cost-reduction')] : []),
      ...(spellcastManaPayoff ? [fact(spellcastManaPayoff, 'is-spellcast-mana-payoff'), fact(spellcastManaPayoff, 'spellcast-mana-produced')] : []),
    ],
    steps: [
      { card: ritual.id, action: 'keep a mana-producing instant/sorcery spell on the stack as the legal copy target' },
      { card: copySpell.id, action: 'cast the spell-copy card with buyback targeting that ritual', cost: { mana: copyCost.total, colors: copyCost.colors, colorless: copyCost.colorless } },
      ...(reducer ? [{ card: reducer.id, action: 'reduce the generic portion of the buyback spell-copy cost', delta: { manaCostReduction: reduction } }] : []),
      ...(spellcastManaPayoff ? [{ card: spellcastManaPayoff.id, action: 'spell-cast trigger produces mana for the next iteration', delta: { mana: supportMana.total } }] : []),
      { card: ritual.id, action: 'the copied ritual resolves and produces mana for the next buyback copy', delta: { mana: ritualMana.total } },
      { card: copySpell.id, action: 'buyback returns the spell-copy card to hand, restoring the loop state' },
    ],
    assumptions: ['an original ritual spell is on the stack and remains a legal target while the copied rituals resolve', 'the spell-copy card is cast with buyback each iteration'],
    repeatability: { status: netMana > 0 ? 'repeatable-positive-mana' : 'repeatable-break-even', reason: 'copied ritual mana plus local support covers the buyback spell-copy cost and returns the copy spell to hand' },
  }, [
    { resource: 'casts', min: 1, max: Infinity },
    { resource: 'storm', min: 1, max: Infinity },
    ...(netMana > 0 ? [{ resource: 'mana', min: netMana, max: netMana }] : []),
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

function proveLifePaidDamageRecoveryLoop(cards) {
  const source = find(cards, c => hasCap(c, 'is-life-paid-damage-source') && hasCap(c, 'life-paid-damage-can-hit-opponent'));
  const recovery = find(cards, c => c !== source && hasCap(c, 'is-lifegain-from-opponent-lifeloss'));
  if (!source || !recovery) {
    if (source || find(cards, c => hasCap(c, 'is-lifegain-from-opponent-lifeloss'))) {
      return failure(
        'proof:life-paid-damage-one-way:' + sorted(cards.map(c => c.id)).join('|'),
        cards,
        'life-paid damage needs an opponent-life-loss lifegain converter to restore the life payment',
        { hasSource: Boolean(source), hasRecovery: Boolean(find(cards, c => hasCap(c, 'is-lifegain-from-opponent-lifeloss'))) },
      );
    }
    return null;
  }
  const profile = lifePaidDamageProfile(source);
  if (profile.damage < profile.lifeCost || profile.lifeCost <= 0) {
    return failure(
      'proof:life-paid-damage-insufficient-recovery:' + sorted([source.id, recovery.id]).join('|'),
      [source, recovery],
      'damage dealt to an opponent is not enough to restore the life payment',
      profile,
    );
  }
  return success('proof:life-paid-damage-recovery:' + sorted([source.id, recovery.id]).join('|'), 'life-paid-damage-lifeloss-recovery-loop', [source, recovery], {
    requiredFacts: [fact(source, 'is-life-paid-damage-source'), fact(source, 'life-paid-damage-can-hit-opponent'), fact(recovery, 'is-lifegain-from-opponent-lifeloss')],
    steps: [
      { card: source.id, action: 'pay life to activate a repeatable damage ability', cost: { life: profile.lifeCost } },
      { card: source.id, action: 'deal damage to an opponent or player', delta: { damage: profile.damage, opponentLife: -profile.damage } },
      { card: recovery.id, action: 'opponent life loss causes you to gain that much life', delta: { life: profile.damage } },
      { action: 'the lifegain restores the life payment, so the damage activation can repeat' },
    ],
    assumptions: ['the player can legally pay the initial life cost', 'the damage is aimed at an opponent or opposing player'],
    repeatability: { status: profile.damage > profile.lifeCost ? 'repeatable-positive-life' : 'repeatable-break-even-life', reason: 'opponent-loss lifegain restores the life paid for the damage activation' },
  }, [
    { resource: 'damage', min: profile.damage, max: Infinity },
    { resource: 'opponentLife', min: -Infinity, max: -profile.damage },
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

function proveDelayedMillEqualizerFinisher(cards) {
  const source = find(cards, c => hasCap(c, 'is-half-library-mill-source'));
  const payoff = find(cards, c => c !== source && hasCap(c, 'is-delayed-same-turn-mill-payoff'));
  if (!source || !payoff) {
    const anyPayoff = find(cards, c => hasCap(c, 'is-delayed-same-turn-mill-payoff'));
    const anyMill = find(cards, c => c !== anyPayoff && hasCap(c, 'is-mill-source'));
    if (anyPayoff && anyMill) {
      return failure(
        'proof:delayed-mill-small-mill:' + sorted([anyPayoff.id, anyMill.id]).join('|'),
        [anyPayoff, anyMill],
        'mill source is not a half-library threshold effect',
        { millSource: anyMill.id },
      );
    }
    return null;
  }
  return success('proof:delayed-mill-equalizer-finite:' + sorted([source.id, payoff.id]).join('|'), 'delayed-mill-equalizer-finite-mill', [source, payoff], {
    requiredFacts: [fact(source, 'is-half-library-mill-source'), fact(payoff, 'is-delayed-same-turn-mill-payoff')],
    steps: [
      { card: source.id, action: 'mills half of the affected library' },
      { card: payoff.id, action: 'at the end step, mills the same player for the number of cards put into their graveyard this turn' },
      { action: 'the half-library mill plus equal delayed mill empties the affected library under the threshold model' },
    ],
    assumptions: ['the half-library mill mode is chosen or paid for', 'the delayed mill payoff enchants or otherwise tracks the same affected player'],
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

function proveEscapeWheelManaLoop(cards) {
  const escapeEnabler = find(cards, c => hasCap(c, 'is-graveyard-escape-enabler'));
  const manaSource = find(cards, c => c !== escapeEnabler && hasCap(c, 'is-discard-hand-sac-mana-source'));
  const wheel = find(cards, c => c !== escapeEnabler && c !== manaSource && hasCap(c, 'is-wheel-draw-discard-spell'));
  if (!escapeEnabler || !manaSource || !wheel) {
    if (escapeEnabler || manaSource || wheel) {
      return failure(
        'proof:escape-wheel-mana-missing-role:' + sorted(cards.map(c => c.id)).join('|'),
        cards,
        'escape wheel loop needs a graveyard escape enabler, a discard-hand sacrifice mana source, and an instant/sorcery wheel',
        {
          hasEscapeEnabler: Boolean(escapeEnabler),
          hasDiscardHandSacMana: Boolean(manaSource),
          hasWheel: Boolean(wheel),
        },
      );
    }
    return null;
  }

  const mana = manaProductionProfileFromCaps(manaSource, 'discard-hand-sac-mana');
  const manaSourceCost = manaCostProfileFromCaps(manaSource, 'discard-hand-sac-source');
  const wheelCost = manaCostProfileFromCaps(wheel, 'wheel-spell');
  const escapeFuel = Math.max(1, maxCapNumber(escapeEnabler, 'graveyard-escape-extra-card-cost'));
  const drawCount = maxCapNumber(wheel, 'wheel-draw-count');
  const totalCastCost = addCostProfiles(manaSourceCost, wheelCost);
  if (!canPayRecursiveCost(totalCastCost, mana)) {
    return failure(
      'proof:escape-wheel-mana-cost:' + sorted([escapeEnabler.id, manaSource.id, wheel.id]).join('|'),
      [escapeEnabler, manaSource, wheel],
      'discard-hand sacrifice mana cannot pay the escaped mana source plus wheel costs',
      { produced: mana, manaSourceCost, wheelCost, totalCastCost },
    );
  }
  const requiredFuel = escapeFuel * 2;
  if (drawCount <= requiredFuel) {
    return failure(
      'proof:escape-wheel-mana-fuel:' + sorted([escapeEnabler.id, manaSource.id, wheel.id]).join('|'),
      [escapeEnabler, manaSource, wheel],
      'wheel draw count does not replenish enough graveyard fuel to escape both recurring cards',
      { drawCount, escapeFuel, requiredFuel },
    );
  }

  const proofCards = [escapeEnabler, manaSource, wheel];
  const netMana = mana.total - totalCastCost.total;
  return success('proof:escape-wheel-mana:' + sorted(proofCards.map(card => card.id)).join('|'), 'escape-wheel-mana-loop', proofCards, {
    requiredFacts: [
      fact(escapeEnabler, 'is-graveyard-escape-enabler'),
      fact(escapeEnabler, 'graveyard-escape-extra-card-cost'),
      fact(manaSource, 'is-discard-hand-sac-mana-source'),
      fact(manaSource, 'discard-hand-sac-mana-produced'),
      fact(manaSource, 'discard-hand-sac-source-cost'),
      fact(wheel, 'is-wheel-draw-discard-spell'),
      fact(wheel, 'wheel-draw-count'),
      fact(wheel, 'wheel-spell-cost'),
    ],
    steps: [
      { card: manaSource.id, action: 'escape and sacrifice the hand-discard mana source', delta: { mana: mana.total, selfDiscard: 1 } },
      { card: wheel.id, action: 'spend that mana to escape the instant/sorcery wheel', cost: { mana: wheelCost.total, colors: wheelCost.colors, colorless: wheelCost.colorless } },
      { card: wheel.id, action: 'the wheel discards and draws enough cards to refill graveyard escape fuel', delta: { cards: drawCount, selfDiscard: 1 } },
      { card: escapeEnabler.id, action: 'escape permission remains available for the same nonland cards in the graveyard' },
      { action: 'the mana source and wheel return to the graveyard after use, and the abstract state repeats with fresh fuel' },
    ],
    assumptions: [
      'the loop has enough initial nonland graveyard cards to pay the first escape costs',
      'cards drawn by the wheel are legal nonland escape fuel when discarded by the next mana-source activation',
      'the discard-hand sacrifice mana ability can be activated at a timing point that supplies mana for the wheel cast',
    ],
    repeatability: { status: netMana > 0 ? 'repeatable-positive-mana' : 'repeatable-break-even', reason: 'wheel draw count replenishes escape fuel and the local mana source pays the repeated escape costs' },
  }, [
    { resource: 'casts', min: 2, max: Infinity },
    { resource: 'storm', min: 2, max: Infinity },
    { resource: 'cards', min: drawCount, max: Infinity },
    { resource: 'loots', min: drawCount, max: Infinity },
    { resource: 'selfDiscards', min: 1, max: Infinity },
    ...(netMana > 0 ? [{ resource: 'mana', min: netMana, max: netMana }] : []),
  ]);
}

function proveEscapeMillManaLoop(cards) {
  const escapeEnabler = find(cards, c => hasCap(c, 'is-graveyard-escape-enabler'));
  const manaSource = find(cards, c => c !== escapeEnabler && hasCap(c, 'is-discard-hand-sac-mana-source'));
  const millSpell = find(cards, c => c !== escapeEnabler && c !== manaSource && hasCap(c, 'is-mill-spell'));
  if (!escapeEnabler || !manaSource || !millSpell) {
    if (escapeEnabler || manaSource || millSpell) {
      return failure(
        'proof:escape-mill-mana-missing-role:' + sorted(cards.map(c => c.id)).join('|'),
        cards,
        'escape mill loop needs a graveyard escape enabler, a discard-hand sacrifice mana source, and an instant/sorcery mill spell',
        {
          hasEscapeEnabler: Boolean(escapeEnabler),
          hasDiscardHandSacMana: Boolean(manaSource),
          hasMillSpell: Boolean(millSpell),
        },
      );
    }
    return null;
  }

  const mana = manaProductionProfileFromCaps(manaSource, 'discard-hand-sac-mana');
  const manaSourceCost = manaCostProfileFromCaps(manaSource, 'discard-hand-sac-source');
  const millCost = manaCostProfileFromCaps(millSpell, 'mill-spell');
  const escapeFuel = Math.max(1, maxCapNumber(escapeEnabler, 'graveyard-escape-extra-card-cost'));
  const millCount = maxCapNumber(millSpell, 'mill-count');
  const hasStorm = hasCap(millSpell, 'has-storm');
  const totalCastCost = addCostProfiles(manaSourceCost, millCost);
  if (!canPayRecursiveCost(totalCastCost, mana)) {
    return failure(
      'proof:escape-mill-mana-cost:' + sorted([escapeEnabler.id, manaSource.id, millSpell.id]).join('|'),
      [escapeEnabler, manaSource, millSpell],
      'discard-hand sacrifice mana cannot pay the escaped mana source plus mill spell costs',
      { produced: mana, manaSourceCost, millCost, totalCastCost },
    );
  }

  // Non-storm mill has to refill both recurring escape casts by itself.
  // Storm mill is different: the loop's own cast velocity creates extra copies,
  // so the base mill spell only needs to cover one escape-fuel payment once the
  // steady-state loop is established.
  const requiredFuel = hasStorm ? escapeFuel : escapeFuel * 2;
  if (millCount < requiredFuel || (!hasStorm && millCount === requiredFuel)) {
    return failure(
      'proof:escape-mill-mana-fuel:' + sorted([escapeEnabler.id, manaSource.id, millSpell.id]).join('|'),
      [escapeEnabler, manaSource, millSpell],
      hasStorm
        ? 'storm mill count does not cover enough graveyard fuel to bootstrap recurring escape casts'
        : 'mill count does not replenish enough graveyard fuel to escape both recurring cards',
      { millCount, escapeFuel, requiredFuel, hasStorm },
    );
  }

  const proofCards = [escapeEnabler, manaSource, millSpell];
  const netMana = mana.total - totalCastCost.total;
  const steadyStateMill = hasStorm ? millCount * 2 : millCount;
  return success('proof:escape-mill-mana:' + sorted(proofCards.map(card => card.id)).join('|'), 'escape-mill-mana-loop', proofCards, {
    requiredFacts: [
      fact(escapeEnabler, 'is-graveyard-escape-enabler'),
      fact(escapeEnabler, 'graveyard-escape-extra-card-cost'),
      fact(manaSource, 'is-discard-hand-sac-mana-source'),
      fact(manaSource, 'discard-hand-sac-mana-produced'),
      fact(manaSource, 'discard-hand-sac-source-cost'),
      fact(millSpell, 'is-mill-spell'),
      fact(millSpell, 'mill-count'),
      fact(millSpell, 'mill-spell-cost'),
      ...(hasStorm ? [fact(millSpell, 'has-storm')] : []),
    ],
    steps: [
      { card: manaSource.id, action: 'escape and sacrifice the hand-discard mana source', delta: { mana: mana.total, selfDiscard: 1 } },
      { card: millSpell.id, action: 'spend that mana to escape the mill spell', cost: { mana: millCost.total, colors: millCost.colors, colorless: millCost.colorless } },
      { card: millSpell.id, action: hasStorm ? 'storm copies convert repeated casts into extra mill fuel' : 'the mill spell replenishes enough graveyard fuel for both recurring escape casts', delta: { mill: steadyStateMill } },
      { card: escapeEnabler.id, action: 'escape permission remains available for the same nonland cards in the graveyard' },
      { action: 'the mana source and mill spell return to the graveyard after use, and the abstract state repeats with fresh fuel' },
    ],
    assumptions: [
      'the loop has enough initial nonland graveyard cards to pay the first escape costs',
      ...(hasStorm ? ['the loop has enough initial storm/cast velocity to reach the steady-state storm copy count'] : []),
      'milled cards include enough legal nonland escape fuel over repeated iterations',
      'the discard-hand sacrifice mana ability can be activated at a timing point that supplies mana for the mill spell cast',
    ],
    repeatability: { status: netMana > 0 ? 'repeatable-positive-mana' : 'repeatable-break-even', reason: 'mill fuel and local mana cover the repeated escape costs' },
  }, [
    { resource: 'casts', min: 2, max: Infinity },
    { resource: 'storm', min: hasStorm ? 2 : 0, max: Infinity },
    { resource: 'mill', min: steadyStateMill, max: Infinity },
    { resource: 'selfDiscards', min: 1, max: Infinity },
    ...(netMana > 0 ? [{ resource: 'mana', min: netMana, max: netMana }] : []),
  ]);
}

function proveExileRecastCreatureMana(cards) {
  const outlet = find(cards, c => hasCap(c, 'is-creature-exile-cast-mana-outlet'));
  const body = find(cards, c => c !== outlet && hasCap(c, 'is-recursive-exile-cast-body') && MODEL.faceCompatibleCaps(c, ['is-creature-permanent', 'is-recursive-exile-cast-body']));
  if (!outlet || !body) {
    if (outlet || find(cards, c => hasCap(c, 'is-recursive-exile-cast-body'))) {
      return failure(
        'proof:exile-recast-creature-missing-role:' + sorted(cards.map(c => c.id)).join('|'),
        cards,
        'creature-exile mana outlet needs a creature that can be cast from exile',
        { hasOutlet: Boolean(outlet), hasRecursiveExileBody: Boolean(find(cards, c => hasCap(c, 'is-recursive-exile-cast-body'))) },
      );
    }
    return null;
  }
  const cost = recursiveExileCostProfile(body);
  const surplus = Math.max(1, maxCapNumber(outlet, 'creature-exile-cast-mana-surplus'));
  const mana = {
    total: cost.total + surplus,
    any: cost.total + surplus,
    colorless: 0,
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, 0])),
  };
  if (!canPayRecursiveCost(cost, mana)) {
    return failure(
      'proof:exile-recast-creature-cost:' + sorted([outlet.id, body.id]).join('|'),
      [outlet, body],
      'creature-only exile mana cannot pay the recursive exile creature cost',
      { cost, mana },
    );
  }
  const netMana = mana.total - cost.total;
  return success('proof:exile-recast-creature-mana:' + sorted([outlet.id, body.id]).join('|'), 'exile-recast-creature-mana-loop', [outlet, body], {
    requiredFacts: [
      fact(outlet, 'is-creature-exile-cast-mana-outlet'),
      fact(body, 'is-recursive-exile-cast-body'),
      fact(body, 'is-creature-permanent'),
    ],
    steps: [
      { card: outlet.id, action: 'exile the recursive creature to produce creature-spell mana', delta: { mana: mana.total } },
      { card: body.id, action: 'spend creature-only mana to cast the same creature from exile', cost: { mana: cost.total } },
      { card: body.id, action: 'the creature returns to the battlefield and can be exiled again' },
    ],
    assumptions: ['the restricted mana is spent only on the recursive creature spell it is allowed to cast'],
    repeatability: { status: netMana > 0 ? 'repeatable-positive-mana' : 'repeatable-break-even', reason: 'exiling the creature produces enough restricted mana to recast it from exile and restore the body' },
  }, [
    { resource: 'casts', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'ltbTriggers', min: 1, max: Infinity },
    ...(netMana > 0 ? [{ resource: 'mana', min: netMana, max: netMana }] : []),
  ]);
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

function proveKodamaBounceLandLandfallLoop(cards) {
  const dropper = find(cards, c => hasCap(c, 'is-permanent-etb-hand-dropper'));
  const bounceLand = find(cards, c => c !== dropper && hasCap(c, 'is-self-bounce-land'));
  const payoff = find(cards, c => c !== dropper && c !== bounceLand && hasCap(c, 'is-landfall-payoff'));
  if (!dropper || !bounceLand || !payoff) {
    if (dropper || bounceLand || payoff) {
      return failure(
        'proof:kodama-bounce-land-landfall-missing-role:' + sorted(cards.map(c => c.id)).join('|'),
        cards,
        'landfall bounce loop needs a permanent-ETB hand-dropper, a self-bounce land, and a landfall payoff',
        { hasDropper: Boolean(dropper), hasBounceLand: Boolean(bounceLand), hasPayoff: Boolean(payoff) },
      );
    }
    return null;
  }
  if (!/\bland\b/i.test(bounceLand.type || bounceLand.type_line || '')) {
    return failure(
      'proof:kodama-bounce-land-landfall-not-land:' + sorted([dropper.id, bounceLand.id, payoff.id]).join('|'),
      [dropper, bounceLand, payoff],
      'self-bounce loop piece must be a land permanent',
      { type: bounceLand.type || bounceLand.type_line },
    );
  }
  const landfallMana = landfallManaProfile(payoff);
  const tokenMana = landfallTokenManaProfile(payoff);
  const totalMana = addManaProfiles(landfallMana, tokenMana);
  const deltas = [
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'ltbTriggers', min: 1, max: Infinity },
    { resource: 'landfallTriggers', min: 1, max: Infinity },
  ];
  if (hasCap(payoff, 'is-landfall-token-payoff')) deltas.push({ resource: 'tokens', min: 1, max: Infinity });
  if (totalMana.total > 0) deltas.push({ resource: 'mana', min: totalMana.total, max: Infinity });
  return success('proof:kodama-bounce-land-landfall:' + sorted([dropper.id, bounceLand.id, payoff.id]).join('|'), 'kodama-bounce-land-landfall-loop', [dropper, bounceLand, payoff], {
    requiredFacts: [
      fact(dropper, 'is-permanent-etb-hand-dropper'),
      fact(bounceLand, 'is-self-bounce-land'),
      fact(payoff, 'is-landfall-payoff'),
      ...(hasCap(payoff, 'is-landfall-token-payoff') ? [fact(payoff, 'is-landfall-token-payoff')] : []),
      ...(hasCap(payoff, 'is-landfall-mana-payoff') ? [fact(payoff, 'is-landfall-mana-payoff'), fact(payoff, 'landfall-mana-produced')] : []),
      ...(hasCap(payoff, 'is-landfall-treasure-payoff') ? [fact(payoff, 'is-landfall-treasure-payoff'), fact(payoff, 'landfall-token-mana-produced')] : []),
    ],
    steps: [
      { card: bounceLand.id, action: 'the land enters, creating landfall and permanent-ETB triggers' },
      { card: bounceLand.id, action: 'its ETB trigger returns a land you control, choosing itself', delta: { ltb: 1 } },
      { card: dropper.id, action: 'the permanent-ETB trigger puts the same zero-mana land card from hand back onto the battlefield' },
      { card: payoff.id, action: 'the repeated land entry fires the landfall payoff', delta: { landfall: 1, tokens: hasCap(payoff, 'is-landfall-token-payoff') ? 1 : 0, mana: totalMana.total } },
      { action: 'the same bounce land is back on the battlefield and can return itself again, restoring the loop state' },
    ],
    assumptions: ['the self-bounce land can choose itself for its return trigger', 'the hand-dropper permission can put the zero-mana land card returned to hand onto the battlefield'],
    repeatability: { status: 'repeatable-candidate', reason: 'each bounce-land ETB returns itself and the hand-dropper puts it back, recreating landfall' },
  }, deltas);
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

function cheapUntapSpellCanResetEngine(untapSpell, engine) {
  const type = String(engine.type || engine.type_line || '').toLowerCase();
  if (hasCap(untapSpell, 'untap-spell-target:permanent')) return true;
  if (hasCap(untapSpell, 'untap-spell-target:nonland') && !/\bland\b/.test(type)) return true;
  if (hasCap(untapSpell, 'untap-spell-target:artifact') && /\bartifact\b/.test(type)) return true;
  if (hasCap(untapSpell, 'untap-spell-target:creature') && /\bcreature\b/.test(type)) return true;
  return false;
}

function proveTapFreeCastUntapEngine(cards) {
  const engine = find(cards, c => hasCap(c, 'is-tap-free-cast-engine'));
  const untapSpell = find(cards, c => c !== engine && hasCap(c, 'is-cheap-instant-engine-untap-spell'));
  if (!engine || !untapSpell) return null;
  if (!cheapUntapSpellCanResetEngine(untapSpell, engine)) {
    return failure('proof:tap-free-cast-untap-target-mismatch:' + sorted([engine.id, untapSpell.id]).join('|'), [engine, untapSpell], 'cheap untap spell cannot legally reset the tap/free-cast engine target', {
      engineType: engine.type || engine.type_line || '',
      untapTargets: (untapSpell.caps || []).filter(cap => cap.startsWith('untap-spell-target:')),
    });
  }
  return success('proof:tap-free-cast-untap-engine:' + sorted([engine.id, untapSpell.id]).join('|'), 'tap-free-cast→untap-engine', [engine, untapSpell], {
    requiredFacts: [
      fact(engine, 'is-tap-free-cast-engine'),
      fact(untapSpell, 'is-cheap-instant-engine-untap-spell'),
    ],
    steps: [
      { card: engine.id, action: 'activates a tapped ability that turns a later spell into a free cast from the library or exile' },
      { card: untapSpell.id, action: 'untaps the engine so the same commander-centric line can be assembled again' },
      { card: engine.id, action: 'the engine remains the deck-plan hub rather than an isolated mana sink' },
    ],
    assumptions: ['the pilot can supply the activation mana and a suitable next spell to trigger the free-cast ability'],
    limitingClauses: ['this is a value/plan engine signal, not proof of a deterministic infinite loop'],
    repeatability: { status: 'value-engine', reason: 'the package resets a tap/free-cast engine but still depends on spell sequencing and available mana' },
  }, [
    { resource: 'engineResets', min: 1, max: 1 },
    { resource: 'freeCastAccess', delta: 'enabled' },
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

function proveCombatCopyTokenExtraCombatLoop(cards) {
  const copier = find(cards, c => hasCap(c, 'is-combat-copy-token-equipment'));
  const attacker = find(cards, c => c !== copier && hasCap(c, 'is-attack-extra-combat-source'));
  if (!copier || !attacker) return null;
  if (!canPrecombatCopyTarget(copier, attacker, ['is-attack-extra-combat-source'])) {
    return failure(
      'proof:combat-copy-extra-combat-target-illegal:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'combat-copy equipment cannot legally create a surviving fresh token copy of the extra-combat source',
      {
        targetIsCreature: isCreaturePermanent(attacker),
        targetIsLegendary: isLegendaryPermanent(attacker),
        tokenNonlegendary: hasCap(copier, 'precombat-copy-token-nonlegendary') || hasCap(copier, 'combat-copy-token-nonlegendary'),
      },
    );
  }
  if (!hasCap(copier, 'combat-copy-token-haste')
      || !hasCap(copier, 'combat-copy-token-nonlegendary')
      || !hasCap(copier, 'precombat-copy-created-before-attack')
      || !hasCap(copier, 'precombat-copy-repeatable-each-combat')
      || !hasCap(attacker, 'extra-combat-repeatable-with-fresh-token')
      || !hasCap(attacker, 'fresh-token-unused-attack-trigger')
      || !hasCap(attacker, 'attack-trigger-can-be-declared')) {
    return failure(
      'proof:combat-copy-extra-combat-not-repeatable:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'combat-copy token lacks strict timing/haste/nonlegendary/unused-trigger freshness needed to repeat the extra-combat trigger',
      {
        hastyToken: hasCap(copier, 'combat-copy-token-haste'),
        nonlegendaryToken: hasCap(copier, 'combat-copy-token-nonlegendary'),
        createdBeforeAttack: hasCap(copier, 'precombat-copy-created-before-attack'),
        repeatsEachCombat: hasCap(copier, 'precombat-copy-repeatable-each-combat'),
        freshTokenRepeats: hasCap(attacker, 'extra-combat-repeatable-with-fresh-token'),
        unusedAttackTrigger: hasCap(attacker, 'fresh-token-unused-attack-trigger'),
        attackCanBeDeclared: hasCap(attacker, 'attack-trigger-can-be-declared'),
      },
    );
  }
  return success('proof:combat-copy-extra-combat:' + sorted([copier.id, attacker.id]).join('|'), 'combat-copy-token→extra-combat-loop', [copier, attacker], {
    requiredFacts: [
      fact(copier, 'is-combat-copy-token-equipment'),
      fact(copier, 'is-precombat-hasty-creature-copy-source'),
      fact(copier, 'precombat-copy-created-before-attack'),
      fact(copier, 'precombat-copy-repeatable-each-combat'),
      fact(copier, 'combat-copy-token-haste'),
      fact(copier, 'combat-copy-token-nonlegendary'),
      fact(copier, 'precombat-copy-token-has-haste'),
      fact(copier, 'precombat-copy-token-nonlegendary'),
      fact(attacker, 'is-attack-extra-combat-source'),
      fact(attacker, 'is-creature-permanent'),
      fact(attacker, 'extra-combat-repeatable-with-fresh-token'),
      fact(attacker, 'fresh-token-unused-attack-trigger'),
      fact(attacker, 'attack-trigger-can-be-declared'),
      fact(attacker, 'attack-extra-combat-adds-combat'),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-unused-attack-trigger-at-loop-entry' },
    ],
    steps: [
      { card: copier.id, action: 'at the beginning of combat, create a hasty nonlegendary token copy of the extra-combat attacker' },
      { card: attacker.id, action: 'the fresh token attacks and creates an additional combat phase' },
      { action: 'the next combat phase begins and the equipment creates another fresh attacking token copy' },
    ],
    assumptions: ['the Equipment is attached to the extra-combat creature before the loop starts'],
    limitingClauses: ['tokens put onto the battlefield tapped and attacking are not accepted as attack-trigger proof for this family'],
    repeatability: { status: 'repeatable-combat-fresh-token', reason: 'each additional combat creates a fresh hasty token before attackers with an unused extra-combat attack trigger' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'combatPhases', min: 1, max: Infinity },
  ]);
}

function provePrecombatCopyAttackExtraCombatPair(copier, attacker) {
  if (!canPrecombatCopyTarget(copier, attacker, ['is-attack-extra-combat-source'])) {
    return failure(
      'proof:precombat-copy-attack-extra-combat-target-illegal:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'precombat copy source cannot legally create a surviving fresh token copy of the attack-trigger extra-combat source',
      {
        targetIsCreature: isCreaturePermanent(attacker),
        targetIsLegendary: isLegendaryPermanent(attacker),
        tokenNonlegendary: hasCap(copier, 'precombat-copy-token-nonlegendary'),
      },
    );
  }
  const ok = hasCap(copier, 'precombat-copy-token-has-haste')
    && hasCap(copier, 'precombat-copy-created-before-attack')
    && hasCap(copier, 'precombat-copy-repeatable-each-combat')
    && hasCap(attacker, 'extra-combat-repeatable-with-fresh-token')
    && hasCap(attacker, 'fresh-token-unused-attack-trigger')
    && hasCap(attacker, 'attack-trigger-can-be-declared')
    && hasCap(attacker, 'attack-extra-combat-adds-combat');
  if (!ok) {
    return failure(
      'proof:precombat-copy-attack-extra-combat-not-repeatable:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'attack-trigger extra-combat proof requires pre-attack hasty token timing, repeatable combat copy, and an unused fresh-token attack trigger',
      {
        hastyToken: hasCap(copier, 'precombat-copy-token-has-haste'),
        createdBeforeAttack: hasCap(copier, 'precombat-copy-created-before-attack'),
        repeatsEachCombat: hasCap(copier, 'precombat-copy-repeatable-each-combat'),
        freshTokenRepeats: hasCap(attacker, 'extra-combat-repeatable-with-fresh-token'),
        unusedAttackTrigger: hasCap(attacker, 'fresh-token-unused-attack-trigger'),
        attackCanBeDeclared: hasCap(attacker, 'attack-trigger-can-be-declared'),
        addsCombat: hasCap(attacker, 'attack-extra-combat-adds-combat'),
      },
    );
  }
  return success('proof:precombat-copy-attack-extra-combat:' + sorted([copier.id, attacker.id]).join('|'), 'combat-copy-token→extra-combat-loop', [copier, attacker], {
    requiredFacts: [
      fact(copier, 'is-precombat-hasty-creature-copy-source'),
      fact(copier, 'precombat-copy-target-creature'),
      fact(copier, 'precombat-copy-token-has-haste'),
      fact(copier, 'precombat-copy-created-before-attack'),
      fact(copier, 'precombat-copy-repeatable-each-combat'),
      { card: copier.id, kind: 'precondition', predicate: 'copy-token-legend-safe' },
      fact(attacker, 'is-attack-extra-combat-source'),
      fact(attacker, 'is-creature-permanent'),
      fact(attacker, 'extra-combat-repeatable-with-fresh-token'),
      fact(attacker, 'fresh-token-unused-attack-trigger'),
      fact(attacker, 'attack-trigger-can-be-declared'),
      fact(attacker, 'attack-extra-combat-adds-combat'),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-unused-attack-trigger-at-loop-entry' },
    ],
    steps: [
      { card: copier.id, action: 'at the beginning of combat, create a hasty token copy of the attack-trigger extra-combat attacker before attackers are declared' },
      { card: attacker.id, action: 'the fresh token attacks with an unused attack trigger and creates an additional combat phase' },
      { action: 'the next combat reaches another beginning-of-combat trigger and creates a new fresh hasty token copy' },
    ],
    assumptions: ['the precombat copy source is attached to or can legally target the attack-trigger creature before the loop starts'],
    limitingClauses: ['tapped-and-attacking, random, optional-payment, first-combat-only, and legend-unsafe sources are not accepted'],
    repeatability: { status: 'repeatable-combat-fresh-token', reason: 'each combat creates a fresh hasty token before attackers with an unused extra-combat attack trigger' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'combatPhases', min: 1, max: Infinity },
  ]);
}

function provePrecombatCopyConnectExtraCombatPair(copier, attacker) {
  if (!canPrecombatCopyTarget(copier, attacker, ['is-combat-damage-extra-combat-source'])) {
    return failure(
      'proof:combat-copy-connect-extra-combat-target-illegal:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'precombat copy source cannot legally create a surviving fresh token copy of the connect-trigger extra-combat source',
      {
        targetIsCreature: isCreaturePermanent(attacker),
        targetIsLegendary: isLegendaryPermanent(attacker),
        tokenNonlegendary: hasCap(copier, 'precombat-copy-token-nonlegendary'),
      },
    );
  }
  const ok = hasCap(copier, 'precombat-copy-token-has-haste')
    && hasCap(copier, 'precombat-copy-created-before-attack')
    && hasCap(copier, 'precombat-copy-repeatable-each-combat')
    && hasCap(attacker, 'combat-damage-extra-combat-requires-connect')
    && hasCap(attacker, 'fresh-token-unused-combat-damage-trigger')
    && hasCap(attacker, 'combat-damage-extra-combat-adds-combat')
    && !hasCap(attacker, 'combat-damage-extra-combat-restricts-next-combat-attackers');
  if (!ok) {
    return failure(
      'proof:combat-copy-connect-extra-combat-not-repeatable:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'connect-trigger extra-combat proof requires pre-attack hasty token timing, repeatable combat copy, player connection, and no next-combat attacker restriction',
      {
        hastyToken: hasCap(copier, 'precombat-copy-token-has-haste'),
        createdBeforeAttack: hasCap(copier, 'precombat-copy-created-before-attack'),
        repeatsEachCombat: hasCap(copier, 'precombat-copy-repeatable-each-combat'),
        requiresConnect: hasCap(attacker, 'combat-damage-extra-combat-requires-connect'),
        unusedConnectTrigger: hasCap(attacker, 'fresh-token-unused-combat-damage-trigger'),
        addsCombat: hasCap(attacker, 'combat-damage-extra-combat-adds-combat'),
        restrictsNextCombat: hasCap(attacker, 'combat-damage-extra-combat-restricts-next-combat-attackers'),
      },
    );
  }
  return success('proof:combat-copy-connect-extra-combat:' + sorted([copier.id, attacker.id]).join('|'), 'combat-copy-token→connect-extra-combat-loop', [copier, attacker], {
    requiredFacts: [
      fact(copier, 'is-precombat-hasty-creature-copy-source'),
      fact(copier, 'precombat-copy-target-creature'),
      fact(copier, 'precombat-copy-token-has-haste'),
      fact(copier, 'precombat-copy-created-before-attack'),
      fact(copier, 'precombat-copy-repeatable-each-combat'),
      ...(hasCap(copier, 'precombat-copy-token-nonlegendary') ? [fact(copier, 'precombat-copy-token-nonlegendary')] : [fact(attacker, 'is-nonlegendary-permanent')]),
      fact(attacker, 'is-combat-damage-extra-combat-source'),
      fact(attacker, 'is-creature-permanent'),
      fact(attacker, 'combat-damage-extra-combat-requires-connect'),
      fact(attacker, 'fresh-token-unused-combat-damage-trigger'),
      fact(attacker, 'combat-damage-extra-combat-adds-combat'),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
      { card: attacker.id, kind: 'precondition', predicate: 'combat-damage-connects' },
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-combat-damage-trigger-unused-at-loop-entry' },
    ],
    steps: [
      { card: copier.id, action: 'at the beginning of combat, create a hasty token copy of the connect-trigger extra-combat attacker before attackers are declared' },
      { card: attacker.id, action: 'the fresh token attacks and deals combat damage to a player', delta: { combatDamageConnection: 1 } },
      { card: attacker.id, action: 'the connect trigger creates an additional combat phase', delta: { combatPhases: 1 } },
      { action: 'the next combat reaches another beginning-of-combat trigger and creates a new fresh hasty token copy' },
    ],
    assumptions: ['the copy source is attached to or can legally target the connect-trigger creature before the loop starts', 'the fresh token connects with a player each combat'],
    limitingClauses: ['evasion/blocker state is not inferred; connection is an explicit precondition', 'tapped-and-attacking, random, optional-payment, and next-combat-restricted sources are not accepted'],
    repeatability: { status: 'repeatable-combat-connect-fresh-token', reason: 'each combat creates a fresh hasty token before attackers, that token connects to add the next combat, and the copy source repeats at the next beginning of combat' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'combatPhases', min: 1, max: Infinity },
  ]);
}

function proveHastyCopyExtraCombatPair(copier, attacker, connect = false) {
  const family = connect ? 'hasty-copy→connect-extra-combat-loop' : 'hasty-copy→attack-extra-combat-loop';
  const extraCap = connect ? 'is-combat-damage-extra-combat-source' : 'is-attack-extra-combat-source';
  if (!canHastyCopyTarget(copier, attacker, [extraCap])) {
    return failure(
      'proof:hasty-copy-extra-combat-target-illegal:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'repeatable hasty creature-copy target restrictions or legend-rule survival cannot copy the extra-combat attacker',
      {
        targetIsCreature: isCreaturePermanent(attacker),
        targetIsLegendary: isLegendaryPermanent(attacker),
        requiresNonlegendary: hasCap(copier, 'hasty-copy-target-requires-nonlegendary'),
        connect,
      },
    );
  }
  const ok = activeCopyWindowSafe(copier)
    && hasCap(copier, 'hasty-copy-token-has-haste')
    && (!hasCap(copier, 'hasty-copy-activation-taps-source') || extraCombatTriggerUntapsCopySource(attacker, copier, connect, ['is-repeatable-hasty-creature-copy']))
    && (connect
      ? hasCap(attacker, 'combat-damage-extra-combat-requires-connect') && hasCap(attacker, 'fresh-token-unused-combat-damage-trigger') && hasCap(attacker, 'combat-damage-extra-combat-adds-combat') && !hasCap(attacker, 'combat-damage-extra-combat-restricts-next-combat-attackers')
      : hasCap(attacker, 'extra-combat-repeatable-with-fresh-token') && hasCap(attacker, 'fresh-token-unused-attack-trigger') && hasCap(attacker, 'attack-trigger-can-be-declared'));
  if (!ok) {
    return failure(
      'proof:hasty-copy-extra-combat-not-repeatable:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'activated hasty copy source is not reset/timed safely for a fresh-token extra-combat loop',
      {
        activeCopyWindowSafe: activeCopyWindowSafe(copier),
        hastyToken: hasCap(copier, 'hasty-copy-token-has-haste'),
        tapsSource: hasCap(copier, 'hasty-copy-activation-taps-source'),
        sourceUntappedByTrigger: extraCombatTriggerUntapsCopySource(attacker, copier, connect, ['is-repeatable-hasty-creature-copy']),
        connect,
      },
    );
  }
  return success('proof:hasty-copy-extra-combat:' + sorted([copier.id, attacker.id]).join('|'), family, [copier, attacker], {
    requiredFacts: [
      fact(copier, 'is-repeatable-hasty-creature-copy'),
      fact(copier, 'hasty-copy-target-creature'),
      fact(copier, 'hasty-copy-token-has-haste'),
      ...(hasCap(copier, 'hasty-copy-target-requires-nonlegendary') ? [fact(copier, 'hasty-copy-target-requires-nonlegendary'), fact(attacker, 'is-nonlegendary-permanent')] : []),
      ...(hasCap(copier, 'hasty-copy-activation-taps-source') ? [fact(copier, 'hasty-copy-activation-taps-source')] : []),
      { card: copier.id, kind: 'precondition', predicate: 'copy-activation-window-before-declare-attackers' },
      { card: attacker.id, kind: 'precondition', predicate: 'copy-source-reset-by-extra-combat-trigger' },
      fact(attacker, extraCap),
      fact(attacker, 'is-creature-permanent'),
      ...(connect ? [
        fact(attacker, 'combat-damage-extra-combat-requires-connect'),
        fact(attacker, 'fresh-token-unused-combat-damage-trigger'),
        fact(attacker, 'combat-damage-extra-combat-adds-combat'),
        { card: attacker.id, kind: 'precondition', predicate: 'combat-damage-connects' },
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-combat-damage-trigger-unused-at-loop-entry' },
      ] : [
        fact(attacker, 'extra-combat-repeatable-with-fresh-token'),
        fact(attacker, 'fresh-token-unused-attack-trigger'),
        fact(attacker, 'attack-trigger-can-be-declared'),
        fact(attacker, 'attack-extra-combat-adds-combat'),
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-unused-attack-trigger-at-loop-entry' },
      ]),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
    ],
    steps: [
      { card: copier.id, action: 'activate the repeatable copy source before declare attackers to create a hasty fresh token of the extra-combat attacker' },
      connect
        ? { card: attacker.id, action: 'the fresh token attacks, connects with a player, and creates an additional combat phase' }
        : { card: attacker.id, action: 'the fresh token attacks with an unused attack trigger and creates an additional combat phase' },
      { card: attacker.id, action: 'the extra-combat trigger untaps/resets the copy source for the next combat' },
      { action: 'the next combat repeats from the same copy-source state with a new fresh token' },
    ],
    assumptions: [
      'the repeatable copy source starts untapped and can legally target the extra-combat creature',
      connect ? 'the fresh token connects with a player each combat' : 'the fresh token is declared as an attacker each combat',
    ],
    limitingClauses: [
      'sorcery-speed copy sources, random copies, and tapped-and-attacking token copies are not accepted',
      connect ? 'evasion/blocker state is not inferred; connection is an explicit precondition' : 'the attack trigger must be unused on each fresh token object',
    ],
    repeatability: { status: connect ? 'repeatable-combat-connect-hasty-copy' : 'repeatable-combat-hasty-copy', reason: 'the hasty copy source creates a fresh attacking token each combat and is reset by the extra-combat trigger' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'combatPhases', min: 1, max: Infinity },
  ]);
}

function proveAttachedSelfCopyExtraCombatPair(copySource, attacker, connect = false) {
  const family = connect ? 'hasty-copy→connect-extra-combat-loop' : 'hasty-copy→attack-extra-combat-loop';
  const extraCap = connect ? 'is-combat-damage-extra-combat-source' : 'is-attack-extra-combat-source';
  if (!canAttachedSelfCopyTarget(copySource, attacker, [extraCap])) {
    return failure(
      'proof:attached-copy-extra-combat-target-illegal:' + sorted([copySource.id, attacker.id]).join('|'),
      [copySource, attacker],
      'attached self-copy source requires a nonlegendary creature extra-combat source to avoid legend-rule failure',
      { targetIsCreature: isCreaturePermanent(attacker), targetIsLegendary: isLegendaryPermanent(attacker), connect },
    );
  }
  const ok = attachedCopyWindowSafe(copySource)
    && hasCap(copySource, 'attached-copy-token-has-haste')
    && (!hasCap(copySource, 'attached-copy-activation-taps-enchanted-creature') || extraCombatTriggerUntapsCopySource(attacker, attacker, connect, [extraCap]))
    && (connect
      ? hasCap(attacker, 'combat-damage-extra-combat-requires-connect') && hasCap(attacker, 'fresh-token-unused-combat-damage-trigger') && hasCap(attacker, 'combat-damage-extra-combat-adds-combat') && !hasCap(attacker, 'combat-damage-extra-combat-restricts-next-combat-attackers')
      : hasCap(attacker, 'extra-combat-repeatable-with-fresh-token') && hasCap(attacker, 'fresh-token-unused-attack-trigger') && hasCap(attacker, 'attack-trigger-can-be-declared'));
  if (!ok) {
    return failure(
      'proof:attached-copy-extra-combat-not-repeatable:' + sorted([copySource.id, attacker.id]).join('|'),
      [copySource, attacker],
      'attached self-copy source is not reset/timed safely for a fresh-token extra-combat loop',
      {
        attachedCopyWindowSafe: attachedCopyWindowSafe(copySource),
        hastyToken: hasCap(copySource, 'attached-copy-token-has-haste'),
        tapsEnchantedCreature: hasCap(copySource, 'attached-copy-activation-taps-enchanted-creature'),
        sourceUntappedByTrigger: extraCombatTriggerUntapsCopySource(attacker, attacker, connect, [extraCap]),
        connect,
      },
    );
  }
  return success('proof:attached-copy-extra-combat:' + sorted([copySource.id, attacker.id]).join('|'), family, [copySource, attacker], {
    requiredFacts: [
      fact(copySource, 'is-attached-self-hasty-creature-copy'),
      fact(copySource, 'attached-copy-target-creature'),
      fact(copySource, 'attached-copy-token-has-haste'),
      fact(copySource, 'attached-copy-activation-taps-enchanted-creature'),
      fact(attacker, 'is-nonlegendary-permanent'),
      fact(attacker, extraCap),
      fact(attacker, 'is-creature-permanent'),
      { card: copySource.id, kind: 'precondition', predicate: 'copy-aura-attached-to-extra-combat-source-at-loop-entry' },
      { card: copySource.id, kind: 'precondition', predicate: 'copy-activation-window-before-declare-attackers' },
      { card: attacker.id, kind: 'precondition', predicate: 'copy-source-reset-by-extra-combat-trigger' },
      ...(connect ? [
        fact(attacker, 'combat-damage-extra-combat-requires-connect'),
        fact(attacker, 'fresh-token-unused-combat-damage-trigger'),
        fact(attacker, 'combat-damage-extra-combat-adds-combat'),
        { card: attacker.id, kind: 'precondition', predicate: 'combat-damage-connects' },
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-combat-damage-trigger-unused-at-loop-entry' },
      ] : [
        fact(attacker, 'extra-combat-repeatable-with-fresh-token'),
        fact(attacker, 'fresh-token-unused-attack-trigger'),
        fact(attacker, 'attack-trigger-can-be-declared'),
        fact(attacker, 'attack-extra-combat-adds-combat'),
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-unused-attack-trigger-at-loop-entry' },
      ]),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
    ],
    steps: [
      { card: copySource.id, action: 'the attached Aura grants the enchanted extra-combat source a tap ability that creates a hasty token copy before declare attackers' },
      connect
        ? { card: attacker.id, action: 'the fresh token attacks, connects with a player, and creates an additional combat phase' }
        : { card: attacker.id, action: 'the fresh token attacks with an unused attack trigger and creates an additional combat phase' },
      { card: attacker.id, action: 'the extra-combat trigger untaps/resets the enchanted original for the next combat' },
      { action: 'the next combat repeats from the same attached-copy state with a new fresh token' },
    ],
    assumptions: [
      'the Aura is attached to the nonlegendary extra-combat source before the loop starts',
      connect ? 'the fresh token connects with a player each combat' : 'the fresh token is declared as an attacker each combat',
    ],
    limitingClauses: [
      'legendary targets, sorcery-speed copy windows, random copies, and tapped-and-attacking token copies are not accepted',
      connect ? 'evasion/blocker state is not inferred; connection is an explicit precondition' : 'the attack trigger must be unused on each fresh token object',
    ],
    repeatability: { status: connect ? 'repeatable-combat-connect-attached-copy' : 'repeatable-combat-attached-copy', reason: 'the attached copy ability creates a fresh hasty token each combat and the trigger resets the enchanted original' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'combatPhases', min: 1, max: Infinity },
  ]);
}

function extraTurnTriggerReady(attacker, connect = false) {
  if (!hasCap(attacker, 'extra-turn-repeatable-with-fresh-token')) return false;
  if (hasCap(attacker, 'extra-turn-source-cannot-attack-extra-turns')) return false;
  if (hasCap(attacker, 'extra-turn-source-requires-optional-payment')) return false;
  if (connect) {
    return hasCap(attacker, 'is-combat-damage-extra-turn-source')
      && hasCap(attacker, 'extra-turn-requires-combat-damage-to-player')
      && hasCap(attacker, 'fresh-token-unused-combat-damage-trigger');
  }
  return hasCap(attacker, 'is-attack-extra-turn-source')
    && hasCap(attacker, 'extra-turn-requires-declared-attack')
    && hasCap(attacker, 'fresh-token-unused-attack-trigger')
    && hasCap(attacker, 'attack-trigger-can-be-declared');
}

function resetsDuringExtraTurnUntapStep(subject) {
  return !/doesn'?t untap during your untap step/i.test(subject?.text || '');
}

function provePrecombatCopyExtraTurnPair(copier, attacker, connect = false) {
  const family = connect ? 'combat-copy-token→connect-extra-turn-loop' : 'combat-copy-token→attack-extra-turn-loop';
  const extraCap = connect ? 'is-combat-damage-extra-turn-source' : 'is-attack-extra-turn-source';
  if (!canPrecombatCopyTarget(copier, attacker, [extraCap])) {
    return failure(
      'proof:precombat-copy-extra-turn-target-illegal:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'precombat copy source cannot legally create a surviving fresh token copy of the extra-turn attacker',
      {
        targetIsCreature: isCreaturePermanent(attacker),
        targetIsLegendary: isLegendaryPermanent(attacker),
        tokenNonlegendary: hasCap(copier, 'precombat-copy-token-nonlegendary'),
        connect,
      },
    );
  }
  const ok = hasCap(copier, 'precombat-copy-token-has-haste')
    && hasCap(copier, 'precombat-copy-created-before-attack')
    && hasCap(copier, 'precombat-copy-repeatable-each-combat')
    && extraTurnTriggerReady(attacker, connect);
  if (!ok) {
    return failure(
      'proof:precombat-copy-extra-turn-not-repeatable:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'fresh-copy extra-turn proof requires pre-attack hasty token timing and an extra-turn trigger that remains legal during extra turns',
      {
        hastyToken: hasCap(copier, 'precombat-copy-token-has-haste'),
        createdBeforeAttack: hasCap(copier, 'precombat-copy-created-before-attack'),
        repeatsEachCombat: hasCap(copier, 'precombat-copy-repeatable-each-combat'),
        extraTurnRepeatable: hasCap(attacker, 'extra-turn-repeatable-with-fresh-token'),
        cannotAttackExtraTurns: hasCap(attacker, 'extra-turn-source-cannot-attack-extra-turns'),
        optionalPayment: hasCap(attacker, 'extra-turn-source-requires-optional-payment'),
        connect,
      },
    );
  }
  return success('proof:precombat-copy-extra-turn:' + sorted([copier.id, attacker.id]).join('|'), family, [copier, attacker], {
    requiredFacts: [
      fact(copier, 'is-precombat-hasty-creature-copy-source'),
      fact(copier, 'precombat-copy-target-creature'),
      fact(copier, 'precombat-copy-token-has-haste'),
      fact(copier, 'precombat-copy-created-before-attack'),
      fact(copier, 'precombat-copy-repeatable-each-combat'),
      { card: copier.id, kind: 'precondition', predicate: 'copy-token-legend-safe' },
      fact(attacker, extraCap),
      fact(attacker, 'is-creature-permanent'),
      fact(attacker, 'extra-turn-repeatable-with-fresh-token'),
      ...(connect ? [
        fact(attacker, 'extra-turn-requires-combat-damage-to-player'),
        fact(attacker, 'fresh-token-unused-combat-damage-trigger'),
        { card: attacker.id, kind: 'precondition', predicate: 'combat-damage-connects' },
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-combat-damage-trigger-unused-at-loop-entry' },
      ] : [
        fact(attacker, 'extra-turn-requires-declared-attack'),
        fact(attacker, 'fresh-token-unused-attack-trigger'),
        fact(attacker, 'attack-trigger-can-be-declared'),
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-unused-attack-trigger-at-loop-entry' },
      ]),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
    ],
    steps: [
      { card: copier.id, action: 'at the beginning of combat, create a hasty token copy of the extra-turn attacker before attackers are declared' },
      connect
        ? { card: attacker.id, action: 'the fresh token attacks, connects with a player, and creates an extra turn' }
        : { card: attacker.id, action: 'the fresh token attacks with an unused attack trigger and creates an extra turn' },
      { action: 'the extra turn untap step resets permanents, then its combat creates another fresh hasty token copy' },
    ],
    assumptions: [
      'the precombat copy source is attached to or can legally target the extra-turn creature before the loop starts',
      connect ? 'the fresh token connects with a player each extra turn' : 'the fresh token is declared as an attacker each extra turn',
    ],
    limitingClauses: ['sources that cannot attack during extra turns, require optional payments, create tapped-and-attacking tokens, or fail legend safety are not accepted'],
    repeatability: { status: connect ? 'repeatable-turn-connect-fresh-token' : 'repeatable-turn-attack-fresh-token', reason: 'each extra turn reaches combat, creates a fresh hasty token before attackers, and that token creates the next extra turn' },
  }, [
    { resource: 'turns', min: 1, max: Infinity },
  ]);
}

function proveHastyCopyExtraTurnPair(copier, attacker, connect = false) {
  const family = connect ? 'hasty-copy→connect-extra-turn-loop' : 'hasty-copy→attack-extra-turn-loop';
  const extraCap = connect ? 'is-combat-damage-extra-turn-source' : 'is-attack-extra-turn-source';
  if (!canHastyCopyTarget(copier, attacker, [extraCap])) {
    return failure(
      'proof:hasty-copy-extra-turn-target-illegal:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'repeatable hasty creature-copy target restrictions or legend-rule survival cannot copy the extra-turn attacker',
      {
        targetIsCreature: isCreaturePermanent(attacker),
        targetIsLegendary: isLegendaryPermanent(attacker),
        requiresNonlegendary: hasCap(copier, 'hasty-copy-target-requires-nonlegendary'),
        tokenNonlegendary: hasCap(copier, 'hasty-copy-token-nonlegendary'),
        connect,
      },
    );
  }
  const ok = hasCap(copier, 'hasty-copy-token-has-haste')
    && (!hasCap(copier, 'hasty-copy-activation-taps-source') || resetsDuringExtraTurnUntapStep(copier))
    && extraTurnTriggerReady(attacker, connect);
  if (!ok) {
    return failure(
      'proof:hasty-copy-extra-turn-not-repeatable:' + sorted([copier.id, attacker.id]).join('|'),
      [copier, attacker],
      'activated hasty copy source is not reset/timed safely for a fresh-token extra-turn loop',
      {
        hastyToken: hasCap(copier, 'hasty-copy-token-has-haste'),
        tapsSource: hasCap(copier, 'hasty-copy-activation-taps-source'),
        sourceUntapsDuringExtraTurn: resetsDuringExtraTurnUntapStep(copier),
        extraTurnRepeatable: hasCap(attacker, 'extra-turn-repeatable-with-fresh-token'),
        cannotAttackExtraTurns: hasCap(attacker, 'extra-turn-source-cannot-attack-extra-turns'),
        optionalPayment: hasCap(attacker, 'extra-turn-source-requires-optional-payment'),
        connect,
      },
    );
  }
  return success('proof:hasty-copy-extra-turn:' + sorted([copier.id, attacker.id]).join('|'), family, [copier, attacker], {
    requiredFacts: [
      fact(copier, 'is-repeatable-hasty-creature-copy'),
      fact(copier, 'hasty-copy-target-creature'),
      fact(copier, 'hasty-copy-token-has-haste'),
      { card: copier.id, kind: 'precondition', predicate: 'copy-token-legend-safe' },
      ...(hasCap(copier, 'hasty-copy-activation-taps-source') ? [
        fact(copier, 'hasty-copy-activation-taps-source'),
        { card: copier.id, kind: 'precondition', predicate: 'copy-source-reset-by-extra-turn-untap-step' },
      ] : []),
      fact(attacker, extraCap),
      fact(attacker, 'is-creature-permanent'),
      fact(attacker, 'extra-turn-repeatable-with-fresh-token'),
      ...(connect ? [
        fact(attacker, 'extra-turn-requires-combat-damage-to-player'),
        fact(attacker, 'fresh-token-unused-combat-damage-trigger'),
        { card: attacker.id, kind: 'precondition', predicate: 'combat-damage-connects' },
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-combat-damage-trigger-unused-at-loop-entry' },
      ] : [
        fact(attacker, 'extra-turn-requires-declared-attack'),
        fact(attacker, 'fresh-token-unused-attack-trigger'),
        fact(attacker, 'attack-trigger-can-be-declared'),
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-unused-attack-trigger-at-loop-entry' },
      ]),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
    ],
    steps: [
      { card: copier.id, action: 'create a hasty fresh token copy of the extra-turn attacker before combat each turn' },
      connect
        ? { card: attacker.id, action: 'the fresh token attacks, connects with a player, and creates an extra turn' }
        : { card: attacker.id, action: 'the fresh token attacks with an unused attack trigger and creates an extra turn' },
      { action: 'the extra turn untap step resets the copy source and the next precombat window creates another fresh token' },
    ],
    assumptions: [
      'the repeatable copy source starts ready and can legally target the extra-turn creature',
      connect ? 'the fresh token connects with a player each extra turn' : 'the fresh token is declared as an attacker each extra turn',
    ],
    limitingClauses: ['sources that cannot attack during extra turns, require optional payments, or fail legend safety are not accepted'],
    repeatability: { status: connect ? 'repeatable-turn-connect-hasty-copy' : 'repeatable-turn-attack-hasty-copy', reason: 'each extra turn resets the copy source, creates a fresh hasty token, and that token creates the next extra turn' },
  }, [
    { resource: 'turns', min: 1, max: Infinity },
  ]);
}

function proveAttachedSelfCopyExtraTurnPair(copySource, attacker, connect = false) {
  const family = connect ? 'hasty-copy→connect-extra-turn-loop' : 'hasty-copy→attack-extra-turn-loop';
  const extraCap = connect ? 'is-combat-damage-extra-turn-source' : 'is-attack-extra-turn-source';
  if (!canAttachedSelfCopyTarget(copySource, attacker, [extraCap])) {
    return failure(
      'proof:attached-copy-extra-turn-target-illegal:' + sorted([copySource.id, attacker.id]).join('|'),
      [copySource, attacker],
      'attached self-copy source requires a nonlegendary creature extra-turn source to avoid legend-rule failure',
      { targetIsCreature: isCreaturePermanent(attacker), targetIsLegendary: isLegendaryPermanent(attacker), connect },
    );
  }
  const ok = hasCap(copySource, 'attached-copy-token-has-haste')
    && (!hasCap(copySource, 'attached-copy-activation-taps-enchanted-creature') || resetsDuringExtraTurnUntapStep(attacker))
    && extraTurnTriggerReady(attacker, connect);
  if (!ok) {
    return failure(
      'proof:attached-copy-extra-turn-not-repeatable:' + sorted([copySource.id, attacker.id]).join('|'),
      [copySource, attacker],
      'attached self-copy source is not reset/timed safely for a fresh-token extra-turn loop',
      {
        hastyToken: hasCap(copySource, 'attached-copy-token-has-haste'),
        tapsEnchantedCreature: hasCap(copySource, 'attached-copy-activation-taps-enchanted-creature'),
        enchantedCreatureUntapsDuringExtraTurn: resetsDuringExtraTurnUntapStep(attacker),
        extraTurnRepeatable: hasCap(attacker, 'extra-turn-repeatable-with-fresh-token'),
        cannotAttackExtraTurns: hasCap(attacker, 'extra-turn-source-cannot-attack-extra-turns'),
        optionalPayment: hasCap(attacker, 'extra-turn-source-requires-optional-payment'),
        connect,
      },
    );
  }
  return success('proof:attached-copy-extra-turn:' + sorted([copySource.id, attacker.id]).join('|'), family, [copySource, attacker], {
    requiredFacts: [
      fact(copySource, 'is-attached-self-hasty-creature-copy'),
      fact(copySource, 'attached-copy-target-creature'),
      fact(copySource, 'attached-copy-token-has-haste'),
      fact(copySource, 'attached-copy-activation-taps-enchanted-creature'),
      fact(attacker, 'is-nonlegendary-permanent'),
      fact(attacker, extraCap),
      fact(attacker, 'is-creature-permanent'),
      fact(attacker, 'extra-turn-repeatable-with-fresh-token'),
      { card: copySource.id, kind: 'precondition', predicate: 'copy-aura-attached-to-extra-turn-source-at-loop-entry' },
      { card: attacker.id, kind: 'precondition', predicate: 'copy-source-reset-by-extra-turn-untap-step' },
      ...(connect ? [
        fact(attacker, 'extra-turn-requires-combat-damage-to-player'),
        fact(attacker, 'fresh-token-unused-combat-damage-trigger'),
        { card: attacker.id, kind: 'precondition', predicate: 'combat-damage-connects' },
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-combat-damage-trigger-unused-at-loop-entry' },
      ] : [
        fact(attacker, 'extra-turn-requires-declared-attack'),
        fact(attacker, 'fresh-token-unused-attack-trigger'),
        fact(attacker, 'attack-trigger-can-be-declared'),
        { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-unused-attack-trigger-at-loop-entry' },
      ]),
      { card: attacker.id, kind: 'precondition', predicate: 'fresh-token-can-be-declared-attacker' },
    ],
    steps: [
      { card: copySource.id, action: 'the attached Aura grants the extra-turn source a tap ability that creates a hasty token copy before combat each turn' },
      connect
        ? { card: attacker.id, action: 'the fresh token attacks, connects with a player, and creates an extra turn' }
        : { card: attacker.id, action: 'the fresh token attacks with an unused attack trigger and creates an extra turn' },
      { action: 'the extra turn untap step resets the enchanted original and the next turn creates another fresh token' },
    ],
    assumptions: [
      'the Aura is attached to the nonlegendary extra-turn source before the loop starts',
      connect ? 'the fresh token connects with a player each extra turn' : 'the fresh token is declared as an attacker each extra turn',
    ],
    limitingClauses: ['legendary targets, cannot-attack-extra-turn clauses, optional payments, and tapped-and-attacking token copies are not accepted'],
    repeatability: { status: connect ? 'repeatable-turn-connect-attached-copy' : 'repeatable-turn-attack-attached-copy', reason: 'each extra turn resets the enchanted original, creates a fresh hasty token, and that token creates the next extra turn' },
  }, [
    { resource: 'turns', min: 1, max: Infinity },
  ]);
}

function proveFreshCopyExtraCombatLoops(cards) {
  const attackers = cards.filter(c => hasCap(c, 'is-attack-extra-combat-source'));
  const connectAttackers = cards.filter(c => hasCap(c, 'is-combat-damage-extra-combat-source'));
  if (!attackers.length && !connectAttackers.length) return null;
  const precombatCopiers = cards.filter(c => hasCap(c, 'is-precombat-hasty-creature-copy-source'));
  const activeCopiers = cards.filter(c => hasCap(c, 'is-repeatable-hasty-creature-copy'));
  const attachedCopiers = cards.filter(c => hasCap(c, 'is-attached-self-hasty-creature-copy'));
  const failures = [];

  for (const attacker of attackers) {
    for (const copier of precombatCopiers.filter(c => c !== attacker && !hasCap(c, 'is-combat-copy-token-equipment'))) {
      const result = provePrecombatCopyAttackExtraCombatPair(copier, attacker);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of activeCopiers.filter(c => c !== attacker)) {
      const result = proveHastyCopyExtraCombatPair(copier, attacker, false);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of attachedCopiers.filter(c => c !== attacker)) {
      const result = proveAttachedSelfCopyExtraCombatPair(copier, attacker, false);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
  }
  for (const attacker of connectAttackers) {
    for (const copier of precombatCopiers.filter(c => c !== attacker)) {
      const result = provePrecombatCopyConnectExtraCombatPair(copier, attacker);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of activeCopiers.filter(c => c !== attacker)) {
      const result = proveHastyCopyExtraCombatPair(copier, attacker, true);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of attachedCopiers.filter(c => c !== attacker)) {
      const result = proveAttachedSelfCopyExtraCombatPair(copier, attacker, true);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
  }
  if (!failures.length) return null;
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:fresh-copy-extra-combat-all-rejected:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'no fresh hasty copy and extra-combat attacker pairing satisfied strict timing, target, reset, and trigger gates',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  );
}

function proveFreshCopyExtraTurnLoops(cards) {
  const attackTurners = cards.filter(c => hasCap(c, 'is-attack-extra-turn-source'));
  const connectTurners = cards.filter(c => hasCap(c, 'is-combat-damage-extra-turn-source'));
  if (!attackTurners.length && !connectTurners.length) return null;
  const precombatCopiers = cards.filter(c => hasCap(c, 'is-precombat-hasty-creature-copy-source'));
  const activeCopiers = cards.filter(c => hasCap(c, 'is-repeatable-hasty-creature-copy'));
  const attachedCopiers = cards.filter(c => hasCap(c, 'is-attached-self-hasty-creature-copy'));
  const failures = [];

  for (const attacker of attackTurners) {
    for (const copier of precombatCopiers.filter(c => c !== attacker)) {
      const result = provePrecombatCopyExtraTurnPair(copier, attacker, false);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of activeCopiers.filter(c => c !== attacker)) {
      const result = proveHastyCopyExtraTurnPair(copier, attacker, false);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of attachedCopiers.filter(c => c !== attacker)) {
      const result = proveAttachedSelfCopyExtraTurnPair(copier, attacker, false);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
  }
  for (const attacker of connectTurners) {
    for (const copier of precombatCopiers.filter(c => c !== attacker)) {
      const result = provePrecombatCopyExtraTurnPair(copier, attacker, true);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of activeCopiers.filter(c => c !== attacker)) {
      const result = proveHastyCopyExtraTurnPair(copier, attacker, true);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
    for (const copier of attachedCopiers.filter(c => c !== attacker)) {
      const result = proveAttachedSelfCopyExtraTurnPair(copier, attacker, true);
      if (result.status === ProofStatus.Proven) return result;
      failures.push(result);
    }
  }
  if (!failures.length) return null;
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:fresh-copy-extra-turn-all-rejected:' + sorted(cards.map(c => c.id)).join('|'),
    cards,
    'no fresh hasty copy and extra-turn attacker pairing satisfied strict turn, target, trigger, and blocker gates',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  );
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
      fact(spellCopier, 'is-nonlegendary-permanent'),
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

function proveDeathCopySpellEtbCopyLoop(cards) {
  const spellCopier = find(cards, c => hasCap(c, 'is-etb-spell-copier'));
  const copySpell = find(cards, c => c !== spellCopier && hasCap(c, 'is-death-copy-creature-spell'));
  if (!spellCopier || !copySpell) return null;
  if (!canDeathCopySpellTarget(copySpell, spellCopier, ['is-etb-spell-copier'])) {
    return failure(
      'proof:death-copy-spell-target-illegal:' + sorted([spellCopier.id, copySpell.id]).join('|'),
      [spellCopier, copySpell],
      'death-copy spell cannot safely target the ETB spell copier as a nonlegendary creature',
      {
        targetIsCreature: isCreaturePermanent(spellCopier),
        targetIsLegendary: isLegendaryPermanent(spellCopier),
      },
    );
  }
  return success('proof:death-copy-spell-etb-copy:' + sorted([spellCopier.id, copySpell.id]).join('|'), 'death-copy-spell-etb-copy-loop', [spellCopier, copySpell], {
    requiredFacts: [
      fact(spellCopier, 'is-etb-spell-copier'),
      fact(spellCopier, 'is-creature-permanent'),
      fact(spellCopier, 'is-nonlegendary-permanent'),
      fact(copySpell, 'is-death-copy-creature-spell'),
      fact(copySpell, 'death-copy-spell-target-creature'),
    ],
    steps: [
      { card: copySpell.id, action: 'destroy the nonlegendary ETB spell copier with a spell that creates two token copies if it dies' },
      { card: spellCopier.id, action: 'two token copies enter and each has the ETB spell-copy trigger', delta: { tokens: 2, etbTriggers: 2, deathTriggers: 1, ltbTriggers: 1 } },
      { card: spellCopier.id, action: 'one ETB trigger copies the original death-copy spell and targets another spell-copier token' },
      { action: 'the copied spell recreates the death, token, ETB, and spell-copy state with surplus token material' },
    ],
    assumptions: ['the original creature-copying spell is still on the stack when the ETB spell-copy trigger resolves'],
    repeatability: { status: 'repeatable-candidate', reason: 'each copied death-copy spell creates replacement spell-copier tokens and a new ETB copy trigger' },
  }, [
    { resource: 'tokens', min: 1, max: Infinity },
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'ltbTriggers', min: 1, max: Infinity },
    { resource: 'deathTriggers', min: 1, max: Infinity },
    { resource: 'magecraftTriggers', min: 1, max: Infinity },
  ]);
}

function proveCounterTokenEtbCounterLoop(cards) {
  const tokenEngines = (cards || []).filter(c => hasCap(c, 'is-counter-to-creature-token-engine'));
  const counterGranters = (cards || []).filter(c => hasCap(c, 'is-creature-etb-counter-granter'));
  if (!tokenEngines.length || !counterGranters.length) return null;
  let firstRejected = null;
  for (const tokenEngine of tokenEngines) {
    for (const counterGranter of counterGranters) {
      if (counterGranter === tokenEngine) continue;
      const targetLegal = MODEL.faceCompatibleCaps(tokenEngine, ['is-creature-permanent', 'is-counter-to-creature-token-engine']);
      const tokenCanTrigger = counterTokenCanTriggerGranter(tokenEngine, counterGranter);
      if (!targetLegal || !tokenCanTrigger) {
        firstRejected ||= { tokenEngine, counterGranter, targetLegal };
        continue;
      }
      return success('proof:counter-token-etb-counter:' + sorted([tokenEngine.id, counterGranter.id]).join('|'), 'counter-token→etb-counter-loop', [tokenEngine, counterGranter], {
        requiredFacts: [
          fact(tokenEngine, 'is-counter-to-creature-token-engine'),
          fact(tokenEngine, 'is-creature-permanent'),
          fact(counterGranter, 'is-creature-etb-counter-granter'),
          fact(counterGranter, 'etb-counter-targets-creature'),
        ],
        steps: [
          { card: tokenEngine.id, action: 'a +1/+1 counter on the token engine creates a creature token', delta: { counters: 1, tokens: 1 } },
          { card: counterGranter.id, action: 'that creature token enters and triggers the ETB counter granter' },
          { card: counterGranter.id, action: 'put the +1/+1 counter on the token engine' },
          { action: 'the new counter recreates the token trigger condition' },
        ],
        assumptions: ['an initial +1/+1 counter or legal creature-ETB seed starts the cycle', 'the ETB counter trigger chooses the counter-token engine as its target'],
        repeatability: { status: 'repeatable-candidate', reason: 'each token ETB restores the +1/+1 counter event that creates the next token' },
      }, [
        { resource: 'tokens', min: 1, max: Infinity },
        { resource: 'counters', min: 1, max: Infinity },
        { resource: 'etbTriggers', min: 1, max: Infinity },
      ]);
    }
  }
  if (!firstRejected) return null;
  const { tokenEngine, counterGranter, targetLegal } = firstRejected;
  return failure(
    'proof:counter-token-etb-counter-target-or-color:' + sorted([tokenEngine.id, counterGranter.id]).join('|'),
    [tokenEngine, counterGranter],
    'counter-triggered token must be a creature that can trigger the ETB counter granter, and the granter must be able to target the token engine',
    {
      targetLegal,
      tokenColors: counterTokenColors(tokenEngine),
      acceptedTokenColors: etbCounterGranterColors(counterGranter),
    },
  );
}

function proveMinusCounterDeathTokenLoop(cards) {
  const spreader = find(cards, c => hasCap(c, 'is-minus-counter-death-spreader'));
  const tokenEngine = find(cards, c => c !== spreader && hasCap(c, 'is-minus-counter-to-1-1-token-engine'));
  if (!spreader || !tokenEngine) return null;
  return success('proof:minus-counter-death-token:' + sorted([spreader.id, tokenEngine.id]).join('|'), 'minus-counter-death→token-loop', [spreader, tokenEngine], {
    requiredFacts: [
      fact(spreader, 'is-minus-counter-death-spreader'),
      fact(tokenEngine, 'is-minus-counter-to-1-1-token-engine'),
    ],
    steps: [
      { card: spreader.id, action: 'a creature with a -1/-1 counter dies and puts a -1/-1 counter on a 1/1 creature token' },
      { card: tokenEngine.id, action: 'putting the -1/-1 counter on a creature creates a new 1/1 creature token', delta: { tokens: 1, etbTriggers: 1 } },
      { action: 'the countered 1/1 creature dies, triggering the death spreader again', delta: { deathTriggers: 1, ltbTriggers: 1 } },
      { action: 'the death trigger targets the newly created 1/1 token and repeats the abstract state' },
    ],
    assumptions: ['a legal 1/1 creature token or equivalent seeded creature is available for the first -1/-1 counter', 'the death-spreader trigger targets the newly created 1/1 creature token each loop'],
    repeatability: { status: 'repeatable-candidate', reason: 'each -1/-1 counter kills a 1/1 token and creates the next 1/1 token target' },
  }, [
    { resource: 'etbTriggers', min: 1, max: Infinity },
    { resource: 'ltbTriggers', min: 1, max: Infinity },
    { resource: 'deathTriggers', min: 1, max: Infinity },
  ]);
}

function proveLifegainCounterTokenEtbLoop(cards) {
  const tokenEngines = (cards || []).filter(c => hasCap(c, 'is-counter-to-creature-token-engine'));
  const counterPayoffs = (cards || []).filter(c => hasCap(c, 'is-lifegain-to-counter-payoff'));
  const etbLifegainers = (cards || []).filter(c => hasCap(c, 'is-creature-etb-lifegain-payoff'));
  if (!tokenEngines.length || !counterPayoffs.length || !etbLifegainers.length) return null;
  let firstRejected = null;
  for (const tokenEngine of tokenEngines) {
    for (const counterPayoff of counterPayoffs) {
      const targetLegal = lifegainCounterCanTargetEngine(counterPayoff, tokenEngine);
      if (!targetLegal) {
        firstRejected ||= { tokenEngine, counterPayoff, etbLifegainer: etbLifegainers[0], targetLegal };
        continue;
      }
      for (const etbLifegainer of etbLifegainers) {
        const proofCards = uniqueCards([tokenEngine, counterPayoff, etbLifegainer]);
        return success('proof:lifegain-counter-token-etb:' + sorted(proofCards.map(card => card.id)).join('|'), 'lifegain-counter-token-etb-loop', proofCards, {
          requiredFacts: [
            fact(tokenEngine, 'is-counter-to-creature-token-engine'),
            fact(tokenEngine, 'is-creature-permanent'),
            fact(counterPayoff, 'is-lifegain-to-counter-payoff'),
            fact(counterPayoff, firstCap(counterPayoff, ['lifegain-counter-target:creature', 'lifegain-counter-target:creature-or-enchantment']) || 'lifegain-counter-target:creature'),
            fact(etbLifegainer, 'is-creature-etb-lifegain-payoff'),
          ],
          steps: [
            { card: tokenEngine.id, action: 'a +1/+1 counter on the token engine creates a creature token', delta: { counters: 1, tokens: 1 } },
            { card: etbLifegainer.id, action: 'that creature token enters and triggers life gain', delta: { life: 1, etbTriggers: 1 } },
            { card: counterPayoff.id, action: 'the life-gain trigger puts a +1/+1 counter on the token engine' },
            { action: 'the new counter recreates the creature-token ETB life-gain state' },
          ],
          assumptions: ['an initial +1/+1 counter or legal life-gain/counter seed starts the cycle', 'the lifegain counter trigger chooses the counter-token engine as its target'],
          repeatability: { status: 'repeatable-candidate', reason: 'each creature token ETB gains life, and each life-gain counter recreates the token trigger condition' },
        }, [
          { resource: 'tokens', min: 1, max: Infinity },
          { resource: 'counters', min: 1, max: Infinity },
          { resource: 'etbTriggers', min: 1, max: Infinity },
          { resource: 'life', min: 1, max: Infinity },
        ]);
      }
    }
  }
  if (!firstRejected) return null;
  const { tokenEngine, counterPayoff, etbLifegainer, targetLegal } = firstRejected;
  return failure(
    'proof:lifegain-counter-token-etb-target:' + sorted([tokenEngine.id, counterPayoff.id, etbLifegainer.id]).join('|'),
    uniqueCards([tokenEngine, counterPayoff, etbLifegainer]),
    'lifegain counter payoff must be able to target the counter-triggered creature-token engine',
    {
      targetLegal,
      acceptedTargets: capSuffixes(counterPayoff, 'lifegain-counter-target:'),
    },
  );
}

function proveDeathUntapDeathtouchPingerLock(cards) {
  const assembly = assembleDeathUntapPinger(cards);
  if (!assembly) return null;
  const { carrier, externalCarrier, ping, untap, deathtouch, proofCards } = assembly;
  const sourceLabel = carrier ? carrier.id : 'equipped creature';
  return success('proof:death-untap-deathtouch-pinger-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'death-untap-deathtouch-pinger-lock', proofCards, {
    requiredFacts: [
      fact(ping.card, ping.predicate),
      fact(untap.card, untap.predicate),
      fact(deathtouch.card, deathtouch.predicate),
    ],
    steps: [
      { card: ping.card.id, action: `tap ${sourceLabel} to deal 1 damage to a creature` },
      { card: deathtouch.card.id, action: 'deathtouch on that same source makes the damage lethal' },
      { card: untap.card.id, action: 'the killed creature dies and untaps that same pinger source' },
      { action: 'the pinger returns to the same abstract state and can repeat against the next creature' },
    ],
    assumptions: [
      externalCarrier ? 'a legal creature can carry the equipped abilities together' : 'one legal creature source carries the ping, death-untap, and deathtouch roles together',
      'there is a sequence of opposing creatures or lock-relevant creature targets to kill',
    ],
    repeatability: { status: 'repeatable-lock', reason: 'each deathtouch ping kills a creature and the death trigger untaps the pinger' },
  });
}

function proveForcedCastLock(cards) {
  const engines = (cards || []).filter(card => hasCap(card, 'is-forced-nonhand-cast-engine'));
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-cast-origin-lockpiece'));
  if (!engines.length || !lockpieces.length) return null;
  let firstRejected = null;
  for (const engine of engines) {
    for (const lockpiece of lockpieces) {
      if (!castLockAppliesToOpponents(lockpiece)) {
        firstRejected ||= { engine, lockpiece, axes: [] };
        continue;
      }
      if (hasCap(lockpiece, 'cast-lock-origin-exile-noncreature-only')) {
        firstRejected ||= { engine, lockpiece, axes: [] };
        continue;
      }
      const axes = forcedCastLockAxes(engine, lockpiece);
      if (!axes.length) {
        firstRejected ||= { engine, lockpiece, axes };
        continue;
      }
      const proofCards = uniqueCards([engine, lockpiece]);
      return success('proof:forced-cast-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'forced-cast→cast-lock', proofCards, {
        requiredFacts: [
          fact(engine, 'is-forced-nonhand-cast-engine'),
          ...(origins => origins.length ? origins.map(origin => fact(engine, 'forced-cast-origin:' + origin)) : [fact(engine, 'forced-cast-origin:exile')])(forcedCastOrigins(engine)),
          ...(hasCap(engine, 'forced-cast-payment:free') ? [fact(engine, 'forced-cast-payment:free')] : []),
          ...(hasCap(engine, 'forced-cast-trigger:spell-from-hand') ? [fact(engine, 'forced-cast-trigger:spell-from-hand')] : []),
          ...(hasCap(engine, 'forced-cast-window:trigger-resolution') ? [fact(engine, 'forced-cast-window:trigger-resolution')] : []),
          fact(lockpiece, 'is-cast-origin-lockpiece'),
          ...axes.map(axis => {
            if (axis === 'origin') {
              return fact(lockpiece, hasCap(lockpiece, 'cast-lock-origin:non-hand') ? 'cast-lock-origin:non-hand' : 'cast-lock-origin-exile-any');
            }
            if (axis === 'spell-count') return fact(lockpiece, 'cast-lock-axis:spell-count');
            if (axis === 'timing') return fact(lockpiece, 'cast-lock-axis:timing-sorcery');
            if (axis === 'no-colored-mana') return fact(lockpiece, 'cast-lock-axis:no-colored-mana');
            return fact(lockpiece, 'cast-lock-axis:free-cast');
          }),
        ],
        steps: [
          { card: engine.id, action: 'the engine consumes a normal cast or draw step and offers a replacement cast from a non-hand path' },
          { card: lockpiece.id, action: `the lockpiece forbids or counters that replacement cast on the ${axes.join('/')} axis` },
          { action: 'the attempted spell or draw replacement is blanked, returning the opponents to the same locked turn-structure state' },
        ],
        assumptions: ['the lock is evaluated against opponents or the table rather than your own main-line casts'],
        limitingClauses: ['noncreature-only exile restrictions are deferred', 'the family claims only cast-denial lock coverage, not wins or extra resource axes'],
        repeatability: { status: 'repeatable-lock', reason: 'each repeated attempt to cast through the same forced nonhand path is prohibited or countered on the matching axis' },
      });
    }
  }
  if (!firstRejected) return null;
  const { engine, lockpiece } = firstRejected;
  return failure(
    'proof:forced-cast-lock-axis:' + sorted([engine.id, lockpiece.id]).join('|'),
    [engine, lockpiece],
    'forced cast engine and lockpiece do not align on a strict origin, timing, spell-count, or free-cast lock axis',
    {
      engineOrigins: forcedCastOrigins(engine),
      engineTrigger: firstCap(engine, ['forced-cast-trigger:spell-from-hand', 'forced-cast-trigger:draw-step']),
      lockScopes: castLockScopes(lockpiece),
      lockAxes: capSuffixes(lockpiece, 'cast-lock-axis:'),
      lockOrigins: sorted([
        ...capSuffixes(lockpiece, 'cast-lock-origin:'),
        ...capSuffixes(lockpiece, 'cast-lock-origin-exile-'),
      ]),
    },
  );
}

function proveCounterSuppressionPreventionLock(cards) {
  const suppressors = (cards || []).filter(card => hasCap(card, 'is-counter-suppression-static'));
  const shields = (cards || []).filter(card => hasCap(card, 'is-damage-prevention-counter-burden'));
  if (!suppressors.length || !shields.length) return null;
  let firstRejected = null;
  for (const suppression of suppressors) {
    for (const shield of shields) {
      if (!counterSuppressionApplies(suppression, 'enchantments')) {
        firstRejected ||= { suppression, shield, needed: 'enchantments' };
        continue;
      }
      const proofCards = uniqueCards([suppression, shield]);
      return success('proof:counter-suppression-prevention-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'counter-suppression→prevention-lock', proofCards, {
        requiredFacts: [
          fact(suppression, 'is-counter-suppression-static'),
          fact(suppression, 'counter-suppression:enchantments'),
          fact(shield, 'is-damage-prevention-counter-burden'),
          fact(shield, firstCap(shield, ['damage-prevention-scope:self-all', 'damage-prevention-scope:self-any-damage']) || 'damage-prevention-scope:self-any-damage'),
        ],
        steps: [
          { card: shield.id, action: 'damage that would be dealt to you is prevented or redirected into burden counters on the shield' },
          { card: suppression.id, action: 'counter suppression stops those counters from being placed on the enchantment' },
          { action: 'the prevention text persists without the burden ever accumulating, keeping the same damage-prevention state' },
        ],
        limitingClauses: ['only direct counter-burdened damage-prevention shields qualify', 'the family claims only lock coverage'],
        repeatability: { status: 'repeatable-lock', reason: 'every future damage event is prevented while the counter burden never accumulates' },
      });
    }
  }
  if (!firstRejected) return null;
  return failure(
    'proof:counter-suppression-prevention-lock-scope:' + sorted([firstRejected.suppression.id, firstRejected.shield.id]).join('|'),
    [firstRejected.suppression, firstRejected.shield],
    'counter suppression does not apply to the permanent class receiving the prevention counters',
    { suppressionScopes: counterSuppressionScopes(firstRejected.suppression), neededScope: firstRejected.needed },
  );
}

function proveCounterSuppressionDepletionLock(cards) {
  const suppressors = (cards || []).filter(card => hasCap(card, 'is-counter-suppression-static'));
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-spell-counter-depletion-lockpiece'));
  if (!suppressors.length || !lockpieces.length) return null;
  let firstRejected = null;
  for (const suppression of suppressors) {
    for (const lockpiece of lockpieces) {
      if (!counterSuppressionApplies(suppression, 'enchantments')) {
        firstRejected ||= { suppression, lockpiece, needed: 'enchantments' };
        continue;
      }
      const proofCards = uniqueCards([suppression, lockpiece]);
      return success('proof:counter-suppression-depletion-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'counter-suppression→depletion-lock', proofCards, {
        requiredFacts: [
          fact(suppression, 'is-counter-suppression-static'),
          fact(suppression, 'counter-suppression:enchantments'),
          fact(lockpiece, 'is-spell-counter-depletion-lockpiece'),
        ],
        steps: [
          { card: lockpiece.id, action: 'each opposing spell is countered and would normally place a depletion counter on the lockpiece' },
          { card: suppression.id, action: 'counter suppression stops the depletion counter from being placed on the enchantment' },
          { action: 'the sacrifice threshold never advances, so the opponent spell lock remains in place' },
        ],
        limitingClauses: ['only self-depleting counterspell lockpieces qualify', 'tax or delay effects without direct counters are excluded'],
        repeatability: { status: 'repeatable-lock', reason: 'each opposing spell is countered while the depletion threshold never accumulates' },
      });
    }
  }
  if (!firstRejected) return null;
  return failure(
    'proof:counter-suppression-depletion-lock-scope:' + sorted([firstRejected.suppression.id, firstRejected.lockpiece.id]).join('|'),
    [firstRejected.suppression, firstRejected.lockpiece],
    'counter suppression does not apply to the permanent class receiving the depletion counters',
    { suppressionScopes: counterSuppressionScopes(firstRejected.suppression), neededScope: firstRejected.needed },
  );
}

function proveCounterSuppressionPoisonLossLock(cards) {
  const suppressors = (cards || []).filter(card => hasCap(card, 'is-counter-suppression-static'));
  const shields = (cards || []).filter(card => hasCap(card, 'is-zero-life-poison-shield'));
  if (!suppressors.length || !shields.length) return null;
  let firstRejected = null;
  for (const suppression of suppressors) {
    for (const shield of shields) {
      if (!counterSuppressionApplies(suppression, 'players')) {
        firstRejected ||= { suppression, shield, needed: 'players' };
        continue;
      }
      const proofCards = uniqueCards([suppression, shield]);
      return success('proof:counter-suppression-poison-loss-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'counter-suppression→poison-loss-lock', proofCards, {
        requiredFacts: [
          fact(suppression, 'is-counter-suppression-static'),
          fact(suppression, 'counter-suppression:players'),
          fact(shield, 'is-zero-life-poison-shield'),
        ],
        steps: [
          { card: shield.id, action: 'you do not lose the game at zero or less life, and damage to you becomes poison counters instead of ordinary life loss' },
          { card: suppression.id, action: 'player counter suppression stops those poison counters from being placed on you' },
          { action: 'damage can no longer convert into a losing poison state, preserving the damage-survival lock' },
        ],
        assumptions: ['the lock-relevant state is at or below zero life, where the poison replacement matters'],
        limitingClauses: ['the family claims only lock coverage; it does not prove a win condition or arbitrary life-total stability'],
        repeatability: { status: 'repeatable-lock', reason: 'repeated damage cannot create poison counters on you while the zero-life shield remains active' },
      });
    }
  }
  if (!firstRejected) return null;
  return failure(
    'proof:counter-suppression-poison-loss-lock-scope:' + sorted([firstRejected.suppression.id, firstRejected.shield.id]).join('|'),
    [firstRejected.suppression, firstRejected.shield],
    'counter suppression does not apply to players, so poison counters can still be placed on you',
    { suppressionScopes: counterSuppressionScopes(firstRejected.suppression), neededScope: firstRejected.needed },
  );
}

function proveCounterSuppressionCumulativePreventionLock(cards) {
  const suppressors = (cards || []).filter(card => hasCap(card, 'is-counter-suppression-static'));
  const shields = (cards || []).filter(card => hasCap(card, 'is-cumulative-upkeep-counter-burden') && hasCap(card, 'is-full-self-damage-prevention-source'));
  if (!suppressors.length || !shields.length) return null;
  let firstRejected = null;
  for (const suppression of suppressors) {
    for (const shield of shields) {
      if (!counterSuppressionApplies(suppression, 'lands')) {
        firstRejected ||= { suppression, shield, needed: 'lands' };
        continue;
      }
      const proofCards = uniqueCards([suppression, shield]);
      return success('proof:counter-suppression-cumulative-prevention-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'counter-suppression→cumulative-upkeep-prevention-lock', proofCards, {
        requiredFacts: [
          fact(suppression, 'is-counter-suppression-static'),
          fact(suppression, 'counter-suppression:lands'),
          fact(shield, 'is-cumulative-upkeep-counter-burden'),
          fact(shield, 'is-full-self-damage-prevention-source'),
        ],
        steps: [
          { card: shield.id, action: 'the land prevents all damage that would be dealt to you, but cumulative upkeep would normally add an age counter first' },
          { card: suppression.id, action: 'counter suppression stops the age counter from being placed on the land' },
          { action: 'the cumulative-upkeep count never grows, so the upkeep burden does not advance while the damage-prevention lock stays active' },
        ],
        limitingClauses: ['only cumulative-upkeep prevention sources qualify', 'no extra-land-play or graveyard replay assumptions are used in this family'],
        repeatability: { status: 'repeatable-lock', reason: 'each upkeep fails to add the age counter, preserving the prevention source turn after turn' },
      });
    }
  }
  if (!firstRejected) return null;
  return failure(
    'proof:counter-suppression-cumulative-prevention-lock-scope:' + sorted([firstRejected.suppression.id, firstRejected.shield.id]).join('|'),
    [firstRejected.suppression, firstRejected.shield],
    'counter suppression does not apply to the land receiving age counters',
    { suppressionScopes: counterSuppressionScopes(firstRejected.suppression), neededScope: firstRejected.needed },
  );
}

function proveGlobalUntapSkipUpkeepSkipLock(cards) {
  const lockpiece = find(cards, card => hasCap(card, 'is-global-untap-skipper'));
  const support = find(cards, card => card !== lockpiece && hasCap(card, 'is-global-upkeep-skipper'));
  if (!lockpiece || !support) return null;
  return success('proof:global-untap-skip-upkeep-skip-lock:' + sorted([lockpiece.id, support.id]).join('|'), 'global-untap-skip→upkeep-skip-lock', [lockpiece, support], {
    requiredFacts: [
      fact(lockpiece, 'is-global-untap-skipper'),
      fact(support, 'is-global-upkeep-skipper'),
    ],
    steps: [
      { card: lockpiece.id, action: 'players skip their untap steps, freezing ordinary permanent refresh' },
      { card: support.id, action: 'players also skip upkeep steps, so the upkeep sacrifice/payment burden on the untap-skip lockpiece never triggers' },
      { action: 'the table remains in the same turn-structure lock state each turn cycle' },
    ],
    limitingClauses: ['the family claims only lock coverage', 'it does not prove a win or any resource-positive loop'],
    repeatability: { status: 'repeatable-lock', reason: 'skipped upkeep steps prevent the self-sacrifice burden from ever resolving while untap steps remain skipped' },
  });
}

function proveGlobalUntapSkipEndStepUntapLock(cards) {
  const lockpiece = find(cards, card => hasCap(card, 'is-global-untap-skipper'));
  const support = find(cards, card => card !== lockpiece && hasCap(card, 'is-self-end-step-nonland-untapper'));
  if (!lockpiece || !support) return null;
  return success('proof:global-untap-skip-end-step-untap-lock:' + sorted([lockpiece.id, support.id]).join('|'), 'global-untap-skip→end-step-untap-lock', [lockpiece, support], {
    requiredFacts: [
      fact(lockpiece, 'is-global-untap-skipper'),
      fact(support, 'is-self-end-step-nonland-untapper'),
    ],
    steps: [
      { card: support.id, action: 'at your end step, your nonland permanents untap before the next upkeep arrives' },
      { card: lockpiece.id, action: 'players still skip their untap steps, but your refreshed nonland mana survives into upkeep to preserve the lockpiece' },
      { action: 'opponents remain frozen by the global untap skip while your upkeep payment window stays live' },
    ],
    assumptions: ['you control at least one nonland mana source that remains available through upkeep and can pay the lockpiece upkeep'],
    limitingClauses: ['the support must refresh your mana before upkeep, not merely later in turn', 'the family claims only lock coverage'],
    repeatability: { status: 'repeatable-lock', reason: 'end-step untapping refreshes the upkeep payment infrastructure every turn while the untap lock remains global' },
  });
}

function proveGlobalUntapSkipUpkeepLandLock(cards) {
  const lockpiece = find(cards, card => hasCap(card, 'is-global-untap-skipper'));
  const support = find(cards, card => card !== lockpiece && hasCap(card, 'is-upkeep-self-untap-mana-land'));
  if (!lockpiece || !support) return null;
  return success('proof:global-untap-skip-upkeep-land-lock:' + sorted([lockpiece.id, support.id]).join('|'), 'global-untap-skip→upkeep-untap-land-lock', [lockpiece, support], {
    requiredFacts: [
      fact(lockpiece, 'is-global-untap-skipper'),
      fact(support, 'is-upkeep-self-untap-mana-land'),
      fact(support, 'upkeep-self-untap-mana-land-produces:any'),
    ],
    steps: [
      { card: support.id, action: 'during your upkeep, the support land refreshes itself even though untap steps are skipped' },
      { card: lockpiece.id, action: 'that refreshed land pays the upkeep that keeps the global untap-skip lock active' },
      { action: 'the table remains under the untap-skip lock on each turn cycle' },
    ],
    assumptions: ['you have one disposable or exilable card available each upkeep to satisfy the support land refresh clause'],
    limitingClauses: ['the family claims only lock coverage', 'self-refreshing upkeep lands must explicitly refresh before the lockpiece upkeep resolves'],
    repeatability: { status: 'repeatable-lock', reason: 'the upkeep-refresh land reopens the exact mana window needed to preserve the global untap lock every turn' },
  });
}

function selfBounceCanTargetUntapLockpiece(support, lockpiece) {
  if (!lockpiece || !hasCap(lockpiece, 'is-global-untap-skipper')) return false;
  if (hasCap(support, 'self-bounce-target:permanent-you-control')) return true;
  if (hasCap(support, 'self-bounce-target:any-permanent')) return true;
  return hasCap(support, 'self-bounce-target:any-permanent-not-enchanted');
}

function proveGlobalUntapSkipSelfBounceLock(cards) {
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-global-untap-skipper'));
  const supports = (cards || []).filter(card => hasCap(card, 'is-repeatable-self-bounce-support'));
  if (!lockpieces.length || !supports.length) return null;
  let firstRejected = null;
  for (const lockpiece of lockpieces) {
    for (const support of supports) {
      if (hasCap(support, 'self-bounce-window:your-turn')) {
        firstRejected ||= { lockpiece, support, reason: 'timing' };
        continue;
      }
      if (!selfBounceCanTargetUntapLockpiece(support, lockpiece)) {
        firstRejected ||= { lockpiece, support, reason: 'target' };
        continue;
      }
      const proofCards = uniqueCards([lockpiece, support]);
      const supportCost = selfBounceCostProfile(support);
      const assumptions = [
        `you can reserve ${supportCost.total || 0} mana for the bounce activation during the opponents’ end step each turn cycle`,
      ];
      if (hasCap(support, 'self-bounce-additional-cost:discard')) assumptions.push('you have one spare discardable card each turn cycle for the bounce activation');
      const creatureTap = firstCap(support, capSuffixes(support, 'self-bounce-additional-tap-creatures:').map(v => 'self-bounce-additional-tap-creatures:' + v));
      const birdTap = firstCap(support, capSuffixes(support, 'self-bounce-additional-tap-birds:').map(v => 'self-bounce-additional-tap-birds:' + v));
      const snowReq = capSuffixes(support, 'self-bounce-requires-snow-permanents:')[0];
      if (creatureTap) assumptions.push(`you control ${creatureTap.split(':').pop()} other untapped creatures each turn for the bounce activation`);
      if (birdTap) assumptions.push(`you control ${birdTap.split(':').pop()} other untapped Birds each turn for the bounce activation`);
      if (snowReq) assumptions.push(`you control at least ${snowReq} snow permanents whenever the bounce support is activated`);
      return success('proof:global-untap-skip-self-bounce-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'global-untap-skip→self-bounce-lock', proofCards, {
        requiredFacts: [
          fact(lockpiece, 'is-global-untap-skipper'),
          fact(support, 'is-repeatable-self-bounce-support'),
          fact(support,
            hasCap(support, 'self-bounce-target:permanent-you-control') ? 'self-bounce-target:permanent-you-control'
              : hasCap(support, 'self-bounce-target:any-permanent-not-enchanted') ? 'self-bounce-target:any-permanent-not-enchanted'
                : 'self-bounce-target:any-permanent'),
          ...(hasCap(support, 'self-bounce-additional-cost:discard') ? [fact(support, 'self-bounce-additional-cost:discard')] : []),
          ...(creatureTap ? [fact(support, creatureTap)] : []),
          ...(birdTap ? [fact(support, birdTap)] : []),
          ...(snowReq ? [fact(support, 'self-bounce-requires-snow-permanents:' + snowReq)] : []),
        ],
        steps: [
          { card: support.id, action: 'during the opponents’ end step, return the global untap-skip lockpiece to your hand' },
          { action: 'your next untap step happens normally because the untap-skip piece is no longer on the battlefield' },
          { card: lockpiece.id, action: 'recast the untap-skip lockpiece on your turn before opponents reach another untap step' },
          { action: 'the same table-wide untap freeze is restored for the next full turn cycle' },
        ],
        assumptions,
        limitingClauses: ['your-turn-only bounce timing is excluded', 'the family claims only lock coverage', 'the proof does not count one-shot reset effects or non-repeatable tutors/copies'],
        repeatability: { status: 'repeatable-lock', reason: 'bouncing the untap-skip piece before your untap step lets you reset and replay the same lock every turn cycle' },
      });
    }
  }
  if (!firstRejected) return null;
  if (firstRejected.reason === 'timing') {
    return failure(
      'proof:global-untap-skip-self-bounce-lock-timing:' + sorted([firstRejected.lockpiece.id, firstRejected.support.id]).join('|'),
      [firstRejected.lockpiece, firstRejected.support],
      'self-bounce support only works during your turn, so it cannot remove the untap-skip lockpiece before your next untap step',
      { supportCaps: (firstRejected.support.caps || []).filter(cap => cap.startsWith('self-bounce-')) },
    );
  }
  return failure(
    'proof:global-untap-skip-self-bounce-lock-target:' + sorted([firstRejected.lockpiece.id, firstRejected.support.id]).join('|'),
    [firstRejected.lockpiece, firstRejected.support],
    'self-bounce support cannot legally return the untap-skip lockpiece you control to hand',
    { supportCaps: (firstRejected.support.caps || []).filter(cap => cap.startsWith('self-bounce-target:')) },
  );
}

function selfBounceCostProfile(card) {
  return manaCostProfileFromCaps(card, 'self-bounce');
}

function faceUpCostProfile(card) {
  return manaCostProfileFromCaps(card, 'face-up');
}

function extraLandDropCount(card) {
  const values = capSuffixes(card, 'extra-land-drops:').map(value => parseInt(value, 10)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function drawLimitScopes(card) {
  return capSuffixes(card, 'draw-limit-scope:');
}

function searchLockScopes(card) {
  return capSuffixes(card, 'search-lock-scope:');
}

function attackLockAxes(card) {
  return capSuffixes(card, 'attack-lock-axis:');
}

function artifactActivationLockScopes(card) {
  return capSuffixes(card, 'artifact-activation-lock-scope:');
}

function attackLockScopes(card) {
  return capSuffixes(card, 'attack-lock-scope:');
}

function evasionRemovalKinds(card) {
  return capSuffixes(card, 'evasion-removal:');
}

function evasionRemovalScopes(card) {
  return capSuffixes(card, 'evasion-removal-scope:');
}

function selfBounceCanTargetProtectionSource(support, source) {
  if (hasCap(support, 'self-bounce-target:permanent-you-control')) return true;
  if (hasCap(support, 'self-bounce-target:any-permanent')) return true;
  if (hasCap(support, 'self-bounce-target:any-permanent-not-enchanted')) return true;
  return hasCap(source, 'protection-source-type:artifact') && hasCap(support, 'self-bounce-target:artifact-you-control');
}

function graveyardCastSupportCanReplayProtectionSource(support, source) {
  if (!hasCap(source, 'protection-source-type:artifact')) return false;
  if (hasCap(support, 'graveyard-cast-support-requires-combat-damage')) return false;
  return hasCap(support, 'is-graveyard-artifact-cast-support')
    || hasCap(support, 'is-graveyard-permanent-cast-support');
}

function proveCastProtectionSelfBounceLock(cards) {
  const sources = (cards || []).filter(card => hasCap(card, 'is-cast-gated-opponent-turn-protection-source') && hasCap(card, 'protection-source-type:artifact'));
  const supports = (cards || []).filter(card => hasCap(card, 'is-repeatable-self-bounce-support'));
  if (!sources.length || !supports.length) return null;
  let firstRejected = null;
  for (const source of sources) {
    for (const support of supports) {
      if (!selfBounceCanTargetProtectionSource(support, source)) {
        firstRejected ||= { source, support };
        continue;
      }
      const proofCards = uniqueCards([source, support]);
      const supportCost = selfBounceCostProfile(support);
      const assumptions = [
        `you can pay the recast cost for ${source.id} and the self-bounce activation cost of ${supportCost.total || 0} mana on each of your turns`,
      ];
      if (hasCap(support, 'self-bounce-additional-cost:discard')) assumptions.push('you have one spare discardable card each turn cycle for the self-bounce support');
      const creatureTap = firstCap(support, capSuffixes(support, 'self-bounce-additional-tap-creatures:').map(v => 'self-bounce-additional-tap-creatures:' + v));
      const birdTap = firstCap(support, capSuffixes(support, 'self-bounce-additional-tap-birds:').map(v => 'self-bounce-additional-tap-birds:' + v));
      const snowReq = capSuffixes(support, 'self-bounce-requires-snow-permanents:')[0];
      if (creatureTap) assumptions.push(`you control ${creatureTap.split(':').pop()} other untapped creatures each turn for the bounce activation`);
      if (birdTap) assumptions.push(`you control ${birdTap.split(':').pop()} other untapped Birds each turn for the bounce activation`);
      if (snowReq) assumptions.push(`you control at least ${snowReq} snow permanents whenever the bounce support is activated`);
      return success('proof:cast-protection-self-bounce-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'cast-protection→self-bounce-lock', proofCards, {
        requiredFacts: [
          fact(source, 'is-cast-gated-opponent-turn-protection-source'),
          fact(source, 'protection-source-type:artifact'),
          fact(support, 'is-repeatable-self-bounce-support'),
          fact(support,
            hasCap(support, 'self-bounce-target:artifact-you-control') ? 'self-bounce-target:artifact-you-control'
              : hasCap(support, 'self-bounce-target:permanent-you-control') ? 'self-bounce-target:permanent-you-control'
                : hasCap(support, 'self-bounce-target:any-permanent-not-enchanted') ? 'self-bounce-target:any-permanent-not-enchanted'
                  : 'self-bounce-target:any-permanent'),
          ...(hasCap(support, 'self-bounce-window:your-turn') ? [fact(support, 'self-bounce-window:your-turn')] : []),
          ...(hasCap(support, 'self-bounce-additional-cost:discard') ? [fact(support, 'self-bounce-additional-cost:discard')] : []),
          ...(creatureTap ? [fact(support, creatureTap)] : []),
          ...(birdTap ? [fact(support, birdTap)] : []),
          ...(snowReq ? [fact(support, 'self-bounce-requires-snow-permanents:' + snowReq)] : []),
        ],
        steps: [
          { card: support.id, action: 'on your turn, the support returns the protection source artifact to your hand' },
          { card: source.id, action: 'you recast the protection source and its cast-gated trigger grants protection from everything until your next turn' },
          { action: 'the same protected opponent-turn state is restored for the next full turn cycle' },
        ],
        assumptions,
        limitingClauses: ['the family defers creature-tap bounce shells, snow-count gates, and non-self-contained blink resets', 'the family claims only lock coverage'],
        repeatability: { status: 'repeatable-lock', reason: 'recasting the same protection artifact every turn cycle renews the opponent-turn protection lock' },
      });
    }
  }
  if (!firstRejected) return null;
  return failure(
    'proof:cast-protection-self-bounce-target:' + sorted([firstRejected.source.id, firstRejected.support.id]).join('|'),
    [firstRejected.source, firstRejected.support],
    'self-bounce support cannot legally return the cast-gated protection source to hand',
    {
      sourceCaps: capSuffixes(firstRejected.source, 'protection-source-type:'),
      supportTargets: capSuffixes(firstRejected.support, 'self-bounce-target:'),
    },
  );
}

function proveCastProtectionGraveyardRecastLock(cards) {
  const sources = (cards || []).filter(card => hasCap(card, 'is-cast-gated-opponent-turn-protection-source') && hasCap(card, 'protection-source-type:artifact'));
  const outlets = (cards || []).filter(card => hasCap(card, 'is-artifact-sac-outlet'));
  const supports = (cards || []).filter(card => hasCap(card, 'is-graveyard-artifact-cast-support') || hasCap(card, 'is-graveyard-permanent-cast-support'));
  if (!sources.length || !outlets.length || !supports.length) return null;
  let firstRejected = null;
  for (const source of sources) {
    for (const outlet of outlets) {
      for (const support of supports) {
        if (!graveyardCastSupportCanReplayProtectionSource(support, source)) {
          firstRejected ||= { source, outlet, support };
          continue;
        }
        const proofCards = uniqueCards([source, outlet, support]);
        const supportCost = manaCostProfileFromCaps(support, 'graveyard-cast-support');
        const assumptions = [
          `you can pay the recast cost for ${source.id} and any activation costs required by ${support.id} on each of your turns`,
        ];
        if (hasCap(support, 'graveyard-cast-support-activation-taps-source')) assumptions.push(`${support.id} is able to tap on your turn to enable the recast line`);
        if (hasCap(support, 'graveyard-cast-support-precondition:no-spell-yet')) assumptions.push(`you activate ${support.id} before casting any other spell that turn`);
        return success('proof:cast-protection-graveyard-recast-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'cast-protection→graveyard-recast-lock', proofCards, {
          requiredFacts: [
            fact(source, 'is-cast-gated-opponent-turn-protection-source'),
            fact(source, 'protection-source-type:artifact'),
            fact(outlet, 'is-artifact-sac-outlet'),
            fact(support, hasCap(support, 'is-graveyard-artifact-cast-support') ? 'is-graveyard-artifact-cast-support' : 'is-graveyard-permanent-cast-support'),
            fact(support, hasCap(support, 'graveyard-cast-support-target:artifact') ? 'graveyard-cast-support-target:artifact' : 'graveyard-cast-support-target:permanent'),
            ...(hasCap(support, 'graveyard-cast-support-window:your-turn') ? [fact(support, 'graveyard-cast-support-window:your-turn')] : []),
            ...(hasCap(support, 'graveyard-cast-support-precondition:no-spell-yet') ? [fact(support, 'graveyard-cast-support-precondition:no-spell-yet')] : []),
            ...(hasCap(support, 'graveyard-cast-support-postcondition:no-more-spells') ? [fact(support, 'graveyard-cast-support-postcondition:no-more-spells')] : []),
            ...(supportCost.total > 0 ? [{ card: support.id, kind: 'precondition', predicate: 'graveyard-cast-support-cost', value: supportCost }] : []),
          ],
          steps: [
            { card: outlet.id, action: 'on your turn, sacrifice the protection artifact so it moves to your graveyard' },
            { card: support.id, action: 'use the support to authorize casting that artifact from your graveyard during the same turn' },
            { card: source.id, action: 'recast the protection artifact from graveyard, renewing protection from everything until your next turn' },
            { action: 'the same protected opponent-turn state is restored for the next full turn cycle' },
          ],
          assumptions,
          limitingClauses: [
            'combat-damage-gated graveyard recast supports are intentionally excluded from this strict family',
            'the family claims only lock coverage and does not infer any surplus value from sacrificing the artifact',
          ],
          repeatability: { status: 'repeatable-lock', reason: 'the artifact can be sacrificed and recast from graveyard on each of your turns, refreshing the same cast-gated protection window each cycle' },
        });
      }
    }
  }
  if (!firstRejected) return null;
  return failure(
    'proof:cast-protection-graveyard-recast-support:' + sorted([firstRejected.source.id, firstRejected.outlet.id, firstRejected.support.id]).join('|'),
    [firstRejected.source, firstRejected.outlet, firstRejected.support],
    'graveyard-cast support cannot strictly recast the protection artifact each turn without combat or wrong target scope',
    {
      supportTargets: capSuffixes(firstRejected.support, 'graveyard-cast-support-target:'),
      supportFlags: (firstRejected.support.caps || []).filter(cap => String(cap).startsWith('graveyard-cast-support-')),
    },
  );
}

function proveFaceUpUntapSkipResetLock(cards) {
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-face-up-opponent-next-untap-skipper'));
  const supports = (cards || []).filter(card =>
    hasCap(card, 'is-upkeep-face-down-resetter')
    && hasCap(card, 'is-face-up-copy-creature')
  );
  if (!lockpieces.length || !supports.length) return null;
  for (const lockpiece of lockpieces) {
    for (const support of supports) {
      const faceUpCost = faceUpCostProfile(support);
      return success('proof:face-up-untap-skip-face-down-reset-lock:' + sorted([lockpiece.id, support.id]).join('|'), 'face-up-untap-skip→face-down-reset-lock', [lockpiece, support], {
        requiredFacts: [
          fact(lockpiece, 'is-face-up-opponent-next-untap-skipper'),
          fact(support, 'is-upkeep-face-down-resetter'),
          fact(support, 'is-face-up-copy-creature'),
          fact(support, 'face-up-copy-target:another-creature'),
          ...(faceUpCost.total > 0 ? [{ card: support.id, kind: 'precondition', predicate: 'face-up-cost', value: faceUpCost }] : []),
        ],
        steps: [
          { card: support.id, action: 'during your upkeep, turn the support creature face down using its built-in reset ability' },
          { card: support.id, action: `turn the support creature face up${faceUpCost.total > 0 ? ` by paying ${faceUpCost.total} mana` : ''} and choose the untap-skip creature to copy` },
          { card: lockpiece.id, action: 'the copied turned-face-up trigger makes each opponent skip their next untap step' },
          { action: 'on the next upkeep, the support resets face down again and repeats the same face-up copy trigger' },
        ],
        assumptions: [
          `you can pay the support creature's turn-face-up cost of ${faceUpCost.total || 0} mana on each of your upkeeps`,
          'the untap-skip creature remains on the battlefield so the support can copy it each time it is turned face up',
        ],
        limitingClauses: [
          'the family claims only lock coverage and does not infer surplus mana or extra morph activations',
          'one-shot clone effects or copy shells that do not copy as they are turned face up are excluded',
        ],
        repeatability: { status: 'repeatable-lock', reason: 'the support creature can reset face down every upkeep and re-copy the untap-skip trigger on the same turn cycle' },
      });
    }
  }
  return null;
}

function proveReplayablePreventionLandLock(cards) {
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-replayable-prevention-land-lockpiece'));
  const recursors = (cards || []).filter(card => hasCap(card, 'is-land-recursion'));
  const extraLandSupports = (cards || []).filter(card => hasCap(card, 'is-extra-land-drop'));
  if (!lockpieces.length || !recursors.length || !extraLandSupports.length) return null;
  const failures = [];
  for (const lockpiece of lockpieces) {
    for (const recursor of recursors) {
      for (const support of extraLandSupports) {
        const extraLandCount = extraLandDropCount(support);
        if (extraLandCount < 1) {
          failures.push(failure(
            'proof:prevention-land-extra-land-threshold:' + sorted(uniqueCards([lockpiece, recursor, support]).map(card => card.id)).join('|'),
            uniqueCards([lockpiece, recursor, support]),
            'the extra-land support does not explicitly add at least one extra land play',
            { extraLandCount },
          ));
          continue;
        }
        const proofCards = uniqueCards([lockpiece, recursor, support]);
        return success('proof:prevention-land-graveyard-extra-land-lock:' + sorted(proofCards.map(card => card.id)).join('|'), 'prevention-land→graveyard-extra-land-lock', proofCards, {
          requiredFacts: [
            fact(lockpiece, 'is-replayable-prevention-land-lockpiece'),
            fact(recursor, 'is-land-recursion'),
            fact(support, 'is-extra-land-drop'),
            { card: support.id, kind: 'precondition', predicate: 'extra-land-drops', value: extraLandCount },
          ],
          steps: [
            { card: lockpiece.id, action: 'during upkeep, let the prevention land be sacrificed instead of paying the cumulative upkeep' },
            { card: recursor.id, action: 'replay the prevention land from the graveyard during your turn' },
            { card: lockpiece.id, action: 'when the prevention land enters, sacrifice another land you control to satisfy its ETB burden' },
            { card: support.id, action: `use the extra land-play allowance (${extraLandCount} extra land${extraLandCount === 1 ? '' : 's'}) to replay the sacrificed land or another land that restores your land count` },
            { action: 'the prevention land remains on the battlefield preventing all damage to you until the next upkeep, where the same replay line repeats' },
          ],
          assumptions: [
            'you can choose not to pay the cumulative upkeep so the prevention land reaches the graveyard for replay',
            'you have another land available to sacrifice when the prevention land reenters',
          ],
          limitingClauses: [
            'the family does not cover graveyard-to-hand land recovery shells such as dredge-only lines',
            'graveyard replay without an extra land play is intentionally excluded from strict lock proof',
          ],
          repeatability: { status: 'repeatable-lock', reason: 'each upkeep cycle replays the same prevention land from the graveyard and restores the sacrificed land slot with the extra land play' },
        });
      }
    }
  }
  if (failures.length === 1) return failures[0];
  return failure(
    'proof:prevention-land-graveyard-extra-land-lock-all-rejected:' + sorted(cards.map(card => card.id)).join('|'),
    cards,
    'no prevention-land / graveyard replay / extra-land support package satisfied the strict maintenance gates',
    { rejections: failures.map(item => ({ cards: item.cards, reason: item.reason, details: item.details })).slice(0, 12) },
  );
}

function proveDrawStepHandCycleDrawLimitLock(cards) {
  const engines = (cards || []).filter(card => hasCap(card, 'is-draw-step-hand-cycler'));
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-draw-limit-lockpiece'));
  if (!engines.length || !lockpieces.length) return null;
  for (const engine of engines) {
    for (const lockpiece of lockpieces) {
      const scopes = drawLimitScopes(lockpiece);
      const proofScope = scopes.includes('opponents') ? 'opponents' : 'players';
      return success('proof:draw-step-hand-cycle-draw-limit-lock:' + sorted([engine.id, lockpiece.id]).join('|'), 'draw-step-hand-cycle→draw-limit-lock', [engine, lockpiece], {
        requiredFacts: [
          fact(engine, 'is-draw-step-hand-cycler'),
          fact(lockpiece, 'is-draw-limit-lockpiece'),
          fact(lockpiece, scopes.includes('opponents') ? 'draw-limit-scope:opponents' : 'draw-limit-scope:players'),
          fact(lockpiece, 'draw-limit-count:1'),
          ...(hasCap(lockpiece, 'draw-limit-replacement:skip') ? [fact(lockpiece, 'draw-limit-replacement:skip')] : []),
        ],
        steps: [
          { card: engine.id, action: `${proofScope === 'opponents' ? 'on each opponent draw step' : 'on each draw step'}, the engine moves that player's whole hand away before the redraw` },
          { card: lockpiece.id, action: `the lockpiece limits the redraw to at most one card for ${proofScope}` },
          { action: 'the affected player starts each turn with no meaningful hand rebuild, reproducing the same hand-denial lock state every draw step' },
        ],
        assumptions: [
          proofScope === 'opponents'
            ? 'the proof is evaluated for locking opponents, not your own optional card flow'
            : 'the table accepts the symmetric draw-limit lock state',
        ],
        limitingClauses: [
          'the family claims hand-denial lock coverage only, not card-advantage or win conversion',
          'ordinary wheel effects without a repeated draw-step trigger are excluded',
        ],
        repeatability: { status: 'repeatable-lock', reason: 'the draw-step hand cycler repeats every turn and the draw limit prevents the hand from being restored' },
      });
    }
  }
  return null;
}

function proveNoDrawSearchStepSearchLock(cards) {
  const engines = (cards || []).filter(card => hasCap(card, 'is-no-draw-search-step-engine'));
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-search-lockpiece'));
  if (!engines.length || !lockpieces.length) return null;
  for (const engine of engines) {
    for (const lockpiece of lockpieces) {
      const scopes = searchLockScopes(lockpiece);
      const proofScope = scopes.includes('opponents') ? 'opponents' : 'players';
      return success('proof:no-draw-search-step-search-lock:' + sorted([engine.id, lockpiece.id]).join('|'), 'no-draw-search-step→search-lock', [engine, lockpiece], {
        requiredFacts: [
          fact(engine, 'is-no-draw-search-step-engine'),
          fact(lockpiece, 'is-search-lockpiece'),
          fact(lockpiece, scopes.includes('opponents') ? 'search-lock-scope:opponents' : 'search-lock-scope:players'),
          ...(hasCap(lockpiece, 'search-lock-mode:controlled-search-exile') ? [fact(lockpiece, 'search-lock-mode:controlled-search-exile')] : []),
        ],
        steps: [
          { card: engine.id, action: `${proofScope === 'opponents' ? 'on each opponent draw step' : 'on each draw step'}, normal card draw is prohibited and replaced by a search-for-a-card instruction` },
          { card: lockpiece.id, action: `the lockpiece prevents that search from giving the affected ${proofScope === 'opponents' ? 'opponent' : 'player'} a real card in hand` },
          { action: 'the affected draw step yields neither a draw nor a successful search, recreating the same locked card-flow state each turn' },
        ],
        assumptions: [
          proofScope === 'opponents'
            ? 'the proof is scoped to locking opponents while your own search/draw constraints are outside this family'
            : 'the table-wide search denial is acceptable as a symmetric lock state',
        ],
        limitingClauses: [
          'the family does not claim theft/value conversion from exiled searched cards beyond the lock itself',
          'search taxes or optional search replacement effects that still let the player find a card are excluded',
        ],
        repeatability: { status: 'repeatable-lock', reason: 'the draw-step replacement search recurs every turn and the search denial prevents it from restoring the affected player hand' },
      });
    }
  }
  return null;
}

function proveNoFlyingAttackFlyingRemovalLock(cards) {
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-attack-lockpiece') && hasCap(card, 'attack-lock-axis:no-flying'));
  const supports = (cards || []).filter(card => hasCap(card, 'is-evasion-removal-lock-support') && hasCap(card, 'evasion-removal:flying'));
  if (!lockpieces.length || !supports.length) return null;
  for (const lockpiece of lockpieces) {
    for (const support of supports) {
      const lockScopes = attackLockScopes(lockpiece);
      const supportScopes = evasionRemovalScopes(support);
      const compatible = lockScopes.includes('players') || (lockScopes.includes('you') && (supportScopes.includes('players') || supportScopes.includes('opponents')));
      if (!compatible) continue;
      return success('proof:no-flying-attack-flying-removal-lock:' + sorted([lockpiece.id, support.id]).join('|'), 'no-flying-attack→flying-removal-lock', [lockpiece, support], {
        requiredFacts: [
          fact(lockpiece, 'is-attack-lockpiece'),
          fact(lockpiece, 'attack-lock-axis:no-flying'),
          fact(lockpiece, lockScopes.includes('players') ? 'attack-lock-scope:players' : 'attack-lock-scope:you'),
          fact(support, 'is-evasion-removal-lock-support'),
          fact(support, 'evasion-removal:flying'),
          fact(support, supportScopes.includes('players') ? 'evasion-removal-scope:players' : 'evasion-removal-scope:opponents'),
        ],
        steps: [
          { card: support.id, action: 'the support continuously strips flying from the relevant opposing or global creature set' },
          { card: lockpiece.id, action: 'the attack prison forbids every creature without flying from attacking on the protected scope' },
          { action: 'because the relevant attackers no longer have flying, no legal attack line remains on that scope' },
        ],
        assumptions: [
          lockScopes.includes('you') ? 'the proof is scoped to preventing attacks against you, not necessarily against every player at the table' : 'the table accepts the global no-attack state',
        ],
        limitingClauses: [
          'partial rows that still leave islandwalk or other alternate evasion lines are excluded from this family',
          'the family claims combat-denial lock coverage only',
        ],
        repeatability: { status: 'repeatable-lock', reason: 'the flying-removal support is static and the no-flying prison remains continuously active' },
      });
    }
  }
  return null;
}

function proveFlyingOnlyAttackGroundLock(cards) {
  const flyingOnly = (cards || []).filter(card => hasCap(card, 'is-attack-lockpiece') && hasCap(card, 'attack-lock-axis:flying-only') && hasCap(card, 'attack-lock-scope:you'));
  const noFlying = (cards || []).filter(card => hasCap(card, 'is-attack-lockpiece') && hasCap(card, 'attack-lock-axis:no-flying'));
  if (!flyingOnly.length || !noFlying.length) return null;
  for (const flyerLock of flyingOnly) {
    for (const groundLock of noFlying) {
      if (groundLock === flyerLock) continue;
      const groundScopes = attackLockScopes(groundLock);
      if (!groundScopes.includes('players') && !groundScopes.includes('you')) continue;
      return success('proof:flying-only-attack-ground-lock:' + sorted([flyerLock.id, groundLock.id]).join('|'), 'flying-only-attack→ground-lock', [flyerLock, groundLock], {
        requiredFacts: [
          fact(flyerLock, 'is-attack-lockpiece'),
          fact(flyerLock, 'attack-lock-axis:flying-only'),
          fact(flyerLock, 'attack-lock-scope:you'),
          fact(groundLock, 'is-attack-lockpiece'),
          fact(groundLock, 'attack-lock-axis:no-flying'),
          fact(groundLock, groundScopes.includes('players') ? 'attack-lock-scope:players' : 'attack-lock-scope:you'),
        ],
        steps: [
          { card: groundLock.id, action: 'the ground prison forbids every nonflying creature from attacking on the protected scope' },
          { card: flyerLock.id, action: 'the flying-only prison forbids every flying creature from attacking you' },
          { action: 'between the two prisons, neither fliers nor nonfliers can attack you' },
        ],
        assumptions: ['the proof is scoped to protecting you from combat, not to globally freezing combat for every player'],
        limitingClauses: ['the family does not cover alternate evasions like islandwalk unless another family proves they are removed'],
        repeatability: { status: 'repeatable-lock', reason: 'both attack restrictions are static and jointly partition all creatures into forbidden attacker classes' },
      });
    }
  }
  return null;
}

function proveFlyingOrIslandwalkAttackEvasionRemovalLock(cards) {
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-attack-lockpiece') && hasCap(card, 'attack-lock-axis:flying-or-islandwalk-only'));
  const supports = (cards || []).filter(card =>
    hasCap(card, 'is-evasion-removal-lock-support')
    && hasCap(card, 'evasion-removal:flying')
    && hasCap(card, 'evasion-removal:islandwalk')
  );
  if (!lockpieces.length || !supports.length) return null;
  for (const lockpiece of lockpieces) {
    for (const support of supports) {
      const lockScopes = attackLockScopes(lockpiece);
      const supportScopes = evasionRemovalScopes(support);
      const compatible = lockScopes.includes('players') || (lockScopes.includes('you') && supportScopes.includes('players'));
      if (!compatible) continue;
      return success('proof:flying-or-islandwalk-attack-evasion-removal-lock:' + sorted([lockpiece.id, support.id]).join('|'), 'flying-or-islandwalk-attack→evasion-removal-lock', [lockpiece, support], {
        requiredFacts: [
          fact(lockpiece, 'is-attack-lockpiece'),
          fact(lockpiece, 'attack-lock-axis:flying-or-islandwalk-only'),
          fact(lockpiece, lockScopes.includes('players') ? 'attack-lock-scope:players' : 'attack-lock-scope:you'),
          fact(support, 'is-evasion-removal-lock-support'),
          fact(support, 'evasion-removal:flying'),
          fact(support, 'evasion-removal:islandwalk'),
          fact(support, 'evasion-removal-scope:players'),
        ],
        steps: [
          { card: support.id, action: 'the support strips both flying and islandwalk from all creatures' },
          { card: lockpiece.id, action: 'the prison allows attacks only from creatures with flying and/or islandwalk on the protected scope' },
          { action: 'because all creatures lose both qualifying evasions, no legal attackers remain on that scope' },
        ],
        assumptions: [
          lockScopes.includes('you') ? 'the proof is scoped to preventing attacks against you' : 'the table accepts the global no-attack state',
        ],
        limitingClauses: ['support that removes only flying but not islandwalk is excluded', 'the family claims combat-denial lock coverage only'],
        repeatability: { status: 'repeatable-lock', reason: 'the evasion-removal support is static and continuously invalidates every attacker the prison would otherwise permit' },
      });
    }
  }
  return null;
}

function proveAllLandsIslandsUntapLock(cards) {
  const engines = (cards || []).filter(card => hasCap(card, 'is-all-lands-are-islands'));
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-island-untap-lockpiece'));
  if (!engines.length || !lockpieces.length) return null;
  for (const engine of engines) {
    for (const lockpiece of lockpieces) {
      return success('proof:all-lands-islands-island-untap-lock:' + sorted([engine.id, lockpiece.id]).join('|'), 'all-lands-islands→island-untap-lock', [engine, lockpiece], {
        requiredFacts: [
          fact(engine, 'is-all-lands-are-islands'),
          fact(lockpiece, 'is-island-untap-lockpiece'),
          ...(hasCap(lockpiece, 'island-untap-lockpiece-taps-islands-on-entry') ? [fact(lockpiece, 'island-untap-lockpiece-taps-islands-on-entry')] : []),
        ],
        steps: [
          { card: engine.id, action: 'the engine continuously makes every land an Island in addition to its other land types' },
          { card: lockpiece.id, action: 'the lockpiece prevents Islands from untapping during their controllers’ untap steps' },
          ...(hasCap(lockpiece, 'island-untap-lockpiece-taps-islands-on-entry')
            ? [{ card: lockpiece.id, action: 'its enter-the-battlefield rider taps the affected Islands immediately, accelerating the land freeze' }]
            : []),
          { action: 'because every land is an Island, ordinary land mana stops refreshing through untap steps for every player' },
        ],
        assumptions: [
          'the family proves a mana-denial lock only and does not distinguish which player can still operate through nonland mana or preexisting untapped lands',
        ],
        limitingClauses: [
          'nonbasic-only Island conversion is intentionally excluded from this strict family',
          'the family claims lock coverage only, not a deterministic win or an asymmetrical resource proof',
        ],
        repeatability: { status: 'repeatable-lock', reason: 'the land-type change and Island untap denial are static and recreate the same frozen land-refresh state every turn cycle' },
      });
    }
  }
  return null;
}

function proveAllPermanentsArtifactsActivationLock(cards) {
  const engines = (cards || []).filter(card => hasCap(card, 'is-all-permanents-artifacts'));
  const lockpieces = (cards || []).filter(card => hasCap(card, 'is-artifact-activation-lockpiece'));
  if (!engines.length || !lockpieces.length) return null;
  for (const engine of engines) {
    for (const lockpiece of lockpieces) {
      const scopes = artifactActivationLockScopes(lockpiece);
      if (!scopes.length) continue;
      return success('proof:all-permanents-artifacts-artifact-activation-lock:' + sorted([engine.id, lockpiece.id]).join('|'), 'all-permanents-artifacts→artifact-activation-lock', [engine, lockpiece], {
        requiredFacts: [
          fact(engine, 'is-all-permanents-artifacts'),
          fact(lockpiece, 'is-artifact-activation-lockpiece'),
          fact(lockpiece, scopes.includes('opponents') ? 'artifact-activation-lock-scope:opponents' : 'artifact-activation-lock-scope:players'),
        ],
        steps: [
          { card: engine.id, action: 'the engine continuously makes every permanent an artifact in addition to its other types' },
          { card: lockpiece.id, action: scopes.includes('opponents')
            ? 'the lockpiece prevents activated abilities of artifacts your opponents control from being activated'
            : 'the lockpiece prevents activated abilities of artifacts from being activated' },
          { action: scopes.includes('opponents')
            ? 'because opposing permanents are artifacts, opponents lose access to activated abilities across those permanents under the static lock'
            : 'because every permanent is an artifact, activated abilities across the battlefield are statically shut off under the lock' },
        ],
        assumptions: [
          scopes.includes('opponents')
            ? 'the proof is scoped to locking opponents’ activated permanent abilities and does not model your own surviving lines'
            : 'the family proves activation-denial lock coverage only and does not require asymmetry',
        ],
        limitingClauses: [
          'the family claims lock coverage only, not land-destruction, resource-deprivation, or deterministic win proof',
          'artifact taxes or cost increases that still allow activation are intentionally excluded',
        ],
        repeatability: { status: 'repeatable-lock', reason: 'the type-changing engine and artifact activation denial are both static, so the activation lock reasserts continuously without spending additional resources' },
      });
    }
  }
  return null;
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


function proofDeltasFromUnderstanding(evidence) {
  return (evidence.positiveDeltas || []).map(delta => ({
    resource: delta.resource || delta.dimension,
    min: delta.amount ? delta.amount.min : 0,
    max: delta.amount ? delta.amount.max : 0,
  }));
}

function proofFromUnderstandingEvidence(evidence, indexedCards) {
  const cards = (evidence.cards || []).map(id => indexedCards[id]).filter(Boolean);
  if (evidence.outcome !== SolverOutcome.Proven) {
    return failure(evidence.id, cards, evidence.rejectionReason || 'generic understanding solver did not prove closure', {
      understanding: evidence,
    });
  }
  return success(evidence.id, evidence.family, cards, {
    requiredFacts: evidence.requiredFacts || [],
    steps: evidence.steps || [],
    assumptions: evidence.assumptions || [],
    repeatability: {
      status: RepeatabilityStatus.Repeatable,
      reason: 'generic understanding solver closed the package-local transition/state cycle',
    },
    understanding: evidence,
  }, proofDeltasFromUnderstanding(evidence));
}

function bespokeProofs(cards) {
  return [
    proveDirectSelfLoop(cards),
    proveBlinkUntap(cards),
    proveBlinkSpellRecursionLandUntap(cards),
    proveBlinkSpellRecursionManaArtifact(cards),
    proveFoodSacrificeTokenFeedback(cards),
    proveLifeLoop(cards),
    proveMillLifeLossLoop(cards),
    proveDrawDamageFeedback(cards),
    proveSelfCopySpellMagecraftDrain(cards),
    proveVariableBoardCountManaLoop(cards),
    proveCombatResourceExtraCombatLoop(cards),
    proveCombatSacrificeAuraExtraCombatLoop(cards),
    proveArtifactTokenExtraTurnLoop(cards),
    proveCounterThresholdDoublerExtraTurnLoop(cards),
    proveCounterThresholdProliferateExtraTurnLoop(cards),
    proveBuybackCopyRitualLoop(cards),
    proveLifelinkCounterDamageLoop(cards),
    proveLifePaidDamageRecoveryLoop(cards),
    proveOpponentDrawPunisherWin(cards),
    proveMillMultiplierFinisher(cards),
    proveDelayedMillEqualizerFinisher(cards),
    proveTopLoop(cards),
    proveRecursiveBodySacrificeMana(cards),
    proveLifePaidTreasureRecursiveDrain(cards),
    proveEscapeWheelManaLoop(cards),
    proveEscapeMillManaLoop(cards),
    proveExileRecastCreatureMana(cards),
    proveMutualEtbBlinkReset(cards),
    proveTokenReplacementSacrificeMana(cards),
    proveKodamaBounceLandLandfallLoop(cards),
    proveAristocrats(cards),
    proveTokenModifierPayoff(cards),
    proveLibraryExileWin(cards),
    proveImprintUntapSpellLoop(cards),
    proveTapFreeCastUntapEngine(cards),
    proveSelfUntapAbilityCopyLoop(cards),
    proveHastyCopyEtbUntapLoop(cards),
    proveCombatCopyTokenExtraCombatLoop(cards),
    proveFreshCopyExtraCombatLoops(cards),
    proveFreshCopyExtraTurnLoops(cards),
    proveSpellCopyCreatureCopyLoop(cards),
    proveDeathCopySpellEtbCopyLoop(cards),
    proveCounterTokenEtbCounterLoop(cards),
    proveMinusCounterDeathTokenLoop(cards),
    proveLifegainCounterTokenEtbLoop(cards),
    proveDeathUntapDeathtouchPingerLock(cards),
    proveForcedCastLock(cards),
    proveCounterSuppressionPreventionLock(cards),
    proveCounterSuppressionDepletionLock(cards),
    proveCounterSuppressionPoisonLossLock(cards),
    proveCounterSuppressionCumulativePreventionLock(cards),
    proveFaceUpUntapSkipResetLock(cards),
    proveReplayablePreventionLandLock(cards),
    proveDrawStepHandCycleDrawLimitLock(cards),
    proveNoDrawSearchStepSearchLock(cards),
    proveNoFlyingAttackFlyingRemovalLock(cards),
    proveFlyingOnlyAttackGroundLock(cards),
    proveFlyingOrIslandwalkAttackEvasionRemovalLock(cards),
    proveAllPermanentsArtifactsActivationLock(cards),
    proveAllLandsIslandsUntapLock(cards),
    proveGlobalUntapSkipUpkeepSkipLock(cards),
    proveGlobalUntapSkipEndStepUntapLock(cards),
    proveGlobalUntapSkipUpkeepLandLock(cards),
    proveGlobalUntapSkipSelfBounceLock(cards),
    proveCastProtectionSelfBounceLock(cards),
    proveCastProtectionGraveyardRecastLock(cards),
  ].filter(Boolean);
}

function provePackage(rawCards, options = {}) {
  const limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});
  const cards = (rawCards || []).map(normalizeCard);
  if (cards.length > limits.maxCards) {
    return {
      status: ProofStatus.BoundedOut,
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
  const understanding = buildPackageUnderstanding(cards, { limits });
  const indexedCards = cardsById(cards);
  const solverResults = (understanding.evidence || [])
    .filter(item => item.outcome !== SolverOutcome.Unresolved)
    .map(item => proofFromUnderstandingEvidence(item, indexedCards));
  const solverProvenFamilies = new Set(solverResults.filter(result => result.status === ProofStatus.Proven).map(result => result.family));
  const familySpecificResults = bespokeProofs(cards).filter(result => !(result.status === ProofStatus.Proven && solverProvenFamilies.has(result.family)));
  const results = [...solverResults, ...familySpecificResults];

  const faceRejections = results
    .filter(r => r.status === ProofStatus.Proven)
    .map(proof => faceIncompatibilityRejection(proof, indexedCards))
    .filter(Boolean);
  const rejectedProofIds = new Set(faceRejections.map(rejection => rejection.details && rejection.details.proof));
  const proofs = results.filter(r => r.status === ProofStatus.Proven && !rejectedProofIds.has(r.id));
  const rejections = [...results.filter(r => r.status !== ProofStatus.Proven), ...faceRejections];
  return {
    status: proofs.length ? ProofStatus.Proven : rejections.length ? ProofStatus.NotRepeatable : ProofStatus.NoProof,
    limits,
    state,
    transitions,
    packageUnderstanding: understanding,
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
