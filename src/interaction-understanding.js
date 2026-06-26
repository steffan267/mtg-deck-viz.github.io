/*
 * interaction-understanding.js — shared semantic transition/state substrate.
 *
 * This module is intentionally broader than combo detection. It builds a
 * package-local understanding model that can explain graph edges, strict proofs,
 * evaluator mappings, UI/debug output, and honest unresolved/human-review cases.
 */
const {
  Capability,
  ComboFamilyId,
  ComboResource,
  LegalityPredicate,
  SemanticEvent,
  SemanticTransitionKind,
  SolverOutcome,
  StateDimension,
  UnderstandingEvidenceKind,
  Zone,
} = require('./domain/interaction-constants');
const MODEL = require('./interaction-model.js');
const {
  addManaProfiles,
  canPayManaCost,
  capValue,
  emptyManaProfile,
  fact,
  hasCap,
  manaCostProfileFromCaps,
  manaProductionProfileFromCaps,
  sortedUnique: sorted,
} = require('./semantic-proof-utils');

const MODEL_VERSION = 'package-understanding.v1';
const STATE_VERSION = 'semantic-understanding-state.v1';


const UNDERSTANDING_COVERAGE = Object.freeze({
  transitionKinds: Object.freeze([
    SemanticTransitionKind.ActivatedAbility,
    SemanticTransitionKind.TriggeredAbility,
  ]),
  stateDimensions: Object.freeze([
    StateDimension.Mana,
    StateDimension.Untap,
    StateDimension.Blink,
    StateDimension.Etb,
    StateDimension.Death,
    StateDimension.Tokens,
    StateDimension.Counters,
    StateDimension.Legality,
  ]),
  solvedFamilies: Object.freeze([
    ComboFamilyId.SelfUntapManaLoop,
    ComboFamilyId.BlinkEtbLandUntapLoop,
    ComboFamilyId.LifegainLifelossLoop,
    ComboFamilyId.DrawDamageFeedbackLoop,
    ComboFamilyId.RecursiveBodySacrificeManaLoop,
  ]),
  deferredDimensions: Object.freeze([
    StateDimension.Cast,
    StateDimension.ZoneAccess,
    StateDimension.TurnFreshness,
  ]),
});

function interval(min = 0, max = min) {
  return { min, max };
}

function amount(dimension, min, max = min, extra = {}) {
  return { dimension, amount: interval(min, max), ...extra };
}

function cardIds(cards) {
  return sorted((cards || []).map(card => card.id));
}

function transitionId(card, kind, label) {
  return ['transition', kind, card.id, label].join(':');
}

function provenance(card, capability) {
  return [{ cardId: card.id, capability }];
}

function legality(predicate, reason, subjectCardId, objectCardId) {
  return { predicate, reason, ...(subjectCardId ? { subjectCardId } : {}), ...(objectCardId ? { objectCardId } : {}) };
}

function transition(card, kind, label, details = {}) {
  return {
    id: transitionId(card, kind, label),
    sourceCardId: card.id,
    kind,
    label,
    produces: details.produces || [],
    consumes: details.consumes || [],
    events: details.events || [],
    legality: details.legality || [],
    provenance: provenance(card, details.capability || label),
  };
}

function transitionsForCard(card) {
  const transitions = [];
  if (hasCap(card, Capability.TapsForMana)) {
    const produced = Number(capValue(card, Capability.ManaProduced) || 1);
    transitions.push(transition(card, SemanticTransitionKind.ActivatedAbility, Capability.TapsForMana, {
      capability: Capability.TapsForMana,
      produces: [amount(StateDimension.Mana, 1, produced, { resource: ComboResource.Mana })],
      events: [SemanticEvent.Tap],
      legality: [legality(LegalityPredicate.PackageLocal, 'mana source is part of the bounded package', card.id)],
    }));
  }
  if (hasCap(card, Capability.IsSelfUntapper)) {
    const cost = Number(capValue(card, Capability.SelfUntapCost) || 0);
    transitions.push(transition(card, SemanticTransitionKind.ActivatedAbility, Capability.IsSelfUntapper, {
      capability: Capability.IsSelfUntapper,
      consumes: [amount(StateDimension.Mana, cost, cost, { resource: ComboResource.Mana })],
      produces: [amount(StateDimension.Untap, 1, 1, { resource: ComboResource.Untap })],
      events: [SemanticEvent.Untap],
      legality: [legality(LegalityPredicate.RepeatableAction, 'self-untap action is modeled as repeatable unless a stricter cap rejects it', card.id)],
    }));
  }
  if (hasCap(card, Capability.IsRepeatableBlink)) {
    const cost = Number(capValue(card, Capability.BlinkCost) || 0);
    transitions.push(transition(card, SemanticTransitionKind.ActivatedAbility, Capability.IsRepeatableBlink, {
      capability: Capability.IsRepeatableBlink,
      consumes: [amount(StateDimension.Mana, cost, cost, { resource: ComboResource.Mana })],
      produces: [amount(StateDimension.Blink, 1, 1, { resource: ComboResource.Blink })],
      events: [SemanticEvent.Etb, SemanticEvent.Ltb],
      legality: [legality(LegalityPredicate.RepeatableAction, 'blink source exposes a repeatable action instead of a one-shot spell', card.id)],
    }));
  }
  if (hasCap(card, Capability.EtbUntapsLand)) {
    const lands = Number(capValue(card, Capability.EtbUntapsLand) || 1);
    transitions.push(transition(card, SemanticTransitionKind.TriggeredAbility, Capability.EtbUntapsLand, {
      capability: Capability.EtbUntapsLand,
      consumes: [amount(StateDimension.Etb, 1, 1, { event: SemanticEvent.Etb })],
      produces: [amount(StateDimension.Mana, lands, lands, { resource: ComboResource.Mana }), amount(StateDimension.Untap, lands, lands, { resource: ComboResource.Untap })],
      events: [SemanticEvent.Etb, SemanticEvent.Untap],
      legality: [legality(LegalityPredicate.PackageLocal, 'land-untap trigger is modeled only as package-local mana repayment', card.id)],
    }));
  }
  if (hasCap(card, Capability.IsLifegainFromOpponentLifeloss)) {
    transitions.push(transition(card, SemanticTransitionKind.TriggeredAbility, Capability.IsLifegainFromOpponentLifeloss, {
      capability: Capability.IsLifegainFromOpponentLifeloss,
      consumes: [amount(ComboResource.Lifeloss, 1, 1, { resource: ComboResource.Lifeloss })],
      produces: [amount(ComboResource.Lifegain, 1, 1, { resource: ComboResource.Lifegain })],
      events: [SemanticEvent.Lifeloss, SemanticEvent.Lifegain],
    }));
  }
  if (hasCap(card, Capability.IsLifelossFromYourLifegain)) {
    transitions.push(transition(card, SemanticTransitionKind.TriggeredAbility, Capability.IsLifelossFromYourLifegain, {
      capability: Capability.IsLifelossFromYourLifegain,
      consumes: [amount(ComboResource.Lifegain, 1, 1, { resource: ComboResource.Lifegain })],
      produces: [amount(ComboResource.Lifeloss, 1, 1, { resource: ComboResource.Lifeloss })],
      events: [SemanticEvent.Lifegain, SemanticEvent.Lifeloss],
    }));
  }
  if (hasCap(card, Capability.IsDrawToDamagePayoff)) {
    transitions.push(transition(card, SemanticTransitionKind.TriggeredAbility, Capability.IsDrawToDamagePayoff, {
      capability: Capability.IsDrawToDamagePayoff,
      consumes: [amount(ComboResource.Draw, 1, 1, { resource: ComboResource.Draw })],
      produces: [amount(ComboResource.Damage, 1, 1, { resource: ComboResource.Damage })],
      events: [SemanticEvent.Draw, SemanticEvent.Damage],
    }));
  }
  if (hasCap(card, Capability.IsDamageToDrawPayoff)) {
    transitions.push(transition(card, SemanticTransitionKind.TriggeredAbility, Capability.IsDamageToDrawPayoff, {
      capability: Capability.IsDamageToDrawPayoff,
      consumes: [amount(ComboResource.Damage, 1, 1, { resource: ComboResource.Damage })],
      produces: [amount(ComboResource.Draw, 1, 1, { resource: ComboResource.Draw })],
      events: [SemanticEvent.Damage, SemanticEvent.Draw],
    }));
  }
  return transitions;
}

function buildUnderstandingState(cards, limits = {}) {
  const zones = {};
  for (const card of cards) {
    for (const zone of card.zones || []) {
      const key = zone || Zone.Battlefield;
      zones[key] = sorted([...(zones[key] || []), card.id]);
    }
  }
  return {
    version: STATE_VERSION,
    cards: cardIds(cards),
    dimensions: {
      [StateDimension.Mana]: interval(0, 0),
      [StateDimension.Untap]: interval(0, 0),
      [StateDimension.Blink]: interval(0, 0),
      [StateDimension.Etb]: interval(0, 0),
      [StateDimension.Death]: interval(0, 0),
      [StateDimension.Tokens]: interval(0, 0),
      [StateDimension.Counters]: interval(0, 0),
      [StateDimension.Legality]: interval(1, 1),
    },
    zones,
    constraints: [legality(LegalityPredicate.BoundedSearch, `bounded package-local model with maxCards ${limits.maxCards || 3}`)],
    unresolved: [],
  };
}

function evidence(id, family, cards, transitions, details = {}) {
  return {
    id,
    kind: details.kind || UnderstandingEvidenceKind.StrictProof,
    outcome: details.outcome || SolverOutcome.Proven,
    family,
    cards: cardIds(cards),
    transitions: sorted(transitions.map(item => item.id || item)),
    requiredLegality: details.requiredLegality || [],
    requiredFacts: details.requiredFacts || [],
    steps: details.steps || [],
    positiveDeltas: details.positiveDeltas || [],
    assumptions: details.assumptions || [],
    ...(details.rejectionReason ? { rejectionReason: details.rejectionReason } : {}),
  };
}

function findTransition(transitions, card, label) {
  return transitions.find(item => item.sourceCardId === card.id && item.label === label);
}

function drawToDamageAcceptsYourDraw(card) {
  return hasCap(card, 'draw-to-damage-subject:you') || hasCap(card, 'draw-to-damage-subject:each');
}

function damageToDrawAppliesToSource(damageToDraw, source) {
  if (hasCap(damageToDraw, 'damage-to-draw-scope:source-you-control')) return true;
  if (hasCap(damageToDraw, 'damage-to-draw-scope:enchanted-creature')
      || hasCap(damageToDraw, 'damage-to-draw-scope:equipped-creature')
      || hasCap(damageToDraw, 'damage-to-draw-scope:paired-creature-grant')) {
    return MODEL.faceCompatibleCaps(source, ['is-creature-permanent', Capability.IsDrawToDamagePayoff]);
  }
  return false;
}

function frameKey(frame) {
  return JSON.stringify({
    pointer: frame.pointer,
    obligations: frame.obligations,
    mana: frame.state?.mana,
    death: frame.state?.deathEvents || 0,
    sacrifices: frame.state?.sacrifices || 0,
    restored: frame.state?.restoredBodies || 0,
  });
}

function obligationStackSearch(seedFrame, resolver, limits = {}) {
  const maxBranches = limits.maxBranches || 64;
  const maxDepth = limits.maxDepth || 8;
  const stack = [seedFrame];
  const visited = new Set();
  let branches = 0;
  while (stack.length) {
    const frame = stack.pop();
    const key = frameKey(frame);
    if (visited.has(key)) continue;
    visited.add(key);
    if ((frame.path || []).length > maxDepth) continue;
    if (!(frame.obligations || []).length) return frame;
    if (++branches > maxBranches) break;
    const [nextObligation, ...remaining] = frame.obligations;
    for (const next of resolver(frame, nextObligation) || []) {
      stack.push({
        ...next,
        obligations: [...(next.obligations || []), ...remaining],
        path: [...(frame.path || []), ...(next.path || [])],
      });
    }
  }
  return null;
}

function recursiveBodyCostProfile(card) {
  return manaCostProfileFromCaps(card, 'recursive-body');
}

function deathManaProfile(card) {
  return manaProductionProfileFromCaps(card, 'death-mana');
}

function freeSacOutletCanSacrificeBody(outlet) {
  if (!hasCap(outlet, 'is-creature-sac-outlet')) return false;
  return manaCostProfileFromCaps(outlet, 'sac-outlet-activation').total === 0;
}

function recursiveBodyPreconditionSatisfied(body, outlet, support) {
  if (!hasCap(body, 'recursive-body-requires-another-creature')) return true;
  return [outlet, support].some(card => card && card !== body && MODEL.faceCompatibleCaps(card, ['is-creature-permanent']));
}

function solveRecursiveBodyDeathManaSacrifice(cards) {
  const bodies = cards.filter(card => hasCap(card, Capability.IsRecursiveBody));
  const outlets = cards.filter(freeSacOutletCanSacrificeBody);
  const payoffs = cards.filter(card => hasCap(card, 'is-death-mana-payoff'));
  for (const body of bodies) {
    for (const outlet of outlets) {
      if (outlet === body) continue;
      for (const payoff of payoffs) {
        if (payoff === body || payoff === outlet) continue;
        if (!recursiveBodyPreconditionSatisfied(body, outlet, payoff)) continue;
        const cost = recursiveBodyCostProfile(body);
        const deathMana = deathManaProfile(payoff);
        const seed = {
          pointer: body.id,
          obligations: [
            { kind: 'sacrifice-recursive-body', cardId: body.id },
            { kind: 'pay-recursion-cost', cardId: body.id },
            { kind: 'restore-recursive-body', cardId: body.id },
          ],
          state: {
            mana: emptyManaProfile(),
            deathEvents: 0,
            sacrifices: 0,
            restoredBodies: 0,
          },
          path: [],
        };
        const closed = obligationStackSearch(seed, (frame, obligation) => {
          if (obligation.kind === 'sacrifice-recursive-body') {
            return [{
              pointer: outlet.id,
              obligations: [],
              state: {
                ...frame.state,
                deathEvents: (frame.state.deathEvents || 0) + 1,
                sacrifices: (frame.state.sacrifices || 0) + 1,
              },
              path: [{ cardId: outlet.id, action: 'sacrifice the recursive body, creating death and sacrifice events' }],
            }];
          }
          if (obligation.kind === 'pay-recursion-cost') {
            if ((frame.state.deathEvents || 0) <= 0) return [];
            const mana = addManaProfiles(frame.state.mana, deathMana);
            if (!canPayManaCost(cost, mana)) return [];
            return [{
              pointer: payoff.id,
              obligations: [],
              state: { ...frame.state, mana },
              path: [{ cardId: payoff.id, action: 'death trigger creates mana that pays the recursive body cost' }],
            }];
          }
          if (obligation.kind === 'restore-recursive-body') {
            if (!canPayManaCost(cost, frame.state.mana)) return [];
            return [{
              pointer: body.id,
              obligations: [],
              state: { ...frame.state, restoredBodies: (frame.state.restoredBodies || 0) + 1 },
              path: [{ cardId: body.id, action: 'recast or return the same recursive body, restoring the starting body state' }],
            }];
          }
          return [];
        }, { maxDepth: 6, maxBranches: 16 });
        if (!closed) continue;
        const proofCards = [body, outlet, payoff];
        const netMana = Math.max(0, (deathMana.total || 0) - (cost.total || 0));
        return evidence('solver:routing-slip-recursive-body-sacrifice-mana:' + cardIds(proofCards).join('|'), ComboFamilyId.RecursiveBodySacrificeManaLoop, proofCards, [], {
          requiredLegality: [
            legality(LegalityPredicate.BoundedSearch, 'routing-slip obligation stack clears within bounded package-local search'),
            legality(LegalityPredicate.PaymentClosed, 'death-triggered mana pays the recursive body cost', payoff.id, body.id),
            legality(LegalityPredicate.RepeatableAction, 'free creature sacrifice outlet and recursive body restore the same abstract state', outlet.id, body.id),
          ],
          requiredFacts: [
            fact(body, Capability.IsRecursiveBody),
            fact(body, Capability.RecursiveBodyCost),
            fact(outlet, 'is-creature-sac-outlet'),
            fact(outlet, Capability.IsSacOutlet),
            fact(payoff, 'is-death-mana-payoff'),
            fact(payoff, 'death-mana-produced'),
          ],
          steps: closed.path,
          positiveDeltas: [
            amount(StateDimension.Death, 1, 1, { resource: 'deathTriggers' }),
            amount(StateDimension.Ltb, 1, 1, { resource: 'ltbTriggers' }),
            amount(StateDimension.Etb, 1, 1, { resource: 'etbTriggers' }),
            amount(StateDimension.Cast, hasCap(body, 'is-recursive-cast-body') ? 1 : 0, hasCap(body, 'is-recursive-cast-body') ? 1 : 0, { resource: 'casts' }),
            amount(StateDimension.Death, 1, 1, { resource: 'sacrifices' }),
            ...(netMana > 0 ? [amount(StateDimension.Mana, netMana, netMana, { resource: ComboResource.Mana })] : []),
          ],
          assumptions: hasCap(body, 'recursive-body-requires-another-creature')
            ? ['another package-local creature remains controlled while the recursive body is in the graveyard']
            : [],
        });
      }
    }
  }
  return null;
}

function solveSelfUntapMana(cards, transitions) {
  const source = cards.find(card => hasCap(card, Capability.TapsForMana) && hasCap(card, Capability.IsSelfUntapper));
  if (!source) return null;
  const manaProduced = Number(capValue(source, Capability.ManaProduced) || 1);
  const untapCost = Number(capValue(source, Capability.SelfUntapCost) || 0);
  const amplifier = cards.find(card => card !== source && hasCap(card, 'is-colorless-mana-amplifier') && hasCap(source, 'produces-colorless-mana'));
  const amplification = amplifier ? Number(capValue(amplifier, 'colorless-mana-amplifier') || 1) : 0;
  const reducer = cards.find(card => card !== source
    && Number(capValue(card, 'activated-ability-cost-reduction') || 0) > 0
    && (hasCap(card, 'is-cost-reducer') || (hasCap(card, 'is-artifact-activated-ability-cost-reducer') && /\bartifact\b/i.test(source.type || source.type_line || ''))));
  const reduction = reducer ? Number(capValue(reducer, 'activated-ability-cost-reduction') || 0) : 0;
  const minimumCost = reducer ? Number(capValue(reducer, 'activated-ability-cost-reduction-minimum') || 0) : 0;
  const effectiveCost = Math.max(minimumCost, untapCost - reduction);
  const netMana = manaProduced + amplification - effectiveCost;
  const proofCards = [source, amplifier, reducer].filter(Boolean);
  const proofTransitions = [findTransition(transitions, source, Capability.TapsForMana), findTransition(transitions, source, Capability.IsSelfUntapper)].filter(Boolean);
  if (netMana <= 0) {
    return evidence('solver:self-untap-mana:rejected:' + cardIds(proofCards).join('|'), ComboFamilyId.SelfUntapManaLoop, proofCards, proofTransitions, {
      outcome: SolverOutcome.Rejected,
      kind: UnderstandingEvidenceKind.Rejection,
      rejectionReason: 'self-untap cost is not below produced mana in the package-local state model',
    });
  }
  return evidence('solver:self-untap-mana:' + cardIds(proofCards).join('|'), ComboFamilyId.SelfUntapManaLoop, proofCards, proofTransitions, {
    requiredLegality: [legality(LegalityPredicate.PaymentClosed, 'tap mana output pays the self-untap action and leaves a positive mana delta', source.id)],
    requiredFacts: [
      fact(source, Capability.TapsForMana),
      fact(source, Capability.IsSelfUntapper),
      ...(amplifier ? [fact(amplifier, 'is-colorless-mana-amplifier')] : []),
      ...(reducer ? [fact(reducer, hasCap(reducer, 'is-artifact-activated-ability-cost-reducer') ? 'is-artifact-activated-ability-cost-reducer' : 'is-cost-reducer')] : []),
    ],
    steps: [
      { transitionId: proofTransitions[0] && proofTransitions[0].id, cardId: source.id, action: 'tap for mana', delta: { mana: manaProduced + amplification } },
      { transitionId: proofTransitions[1] && proofTransitions[1].id, cardId: source.id, action: 'pay self-untap cost and restore untapped state', delta: { mana: -effectiveCost } },
      { action: 'package-local abstract state repeats with positive mana delta', delta: { mana: netMana } },
    ],
    positiveDeltas: [amount(StateDimension.Mana, netMana, netMana, { resource: ComboResource.Mana })],
  });
}

function solveBlinkEtbUntap(cards, transitions) {
  const blink = cards.find(card => hasCap(card, Capability.IsRepeatableBlink));
  const untapper = cards.find(card => card !== blink && hasCap(card, Capability.EtbUntapsLand));
  if (!blink || !untapper) return null;
  const blinkCost = Number(capValue(blink, Capability.BlinkCost) || 0);
  const untapCount = Number(capValue(untapper, Capability.EtbUntapsLand) || 0);
  const proofTransitions = [findTransition(transitions, blink, Capability.IsRepeatableBlink), findTransition(transitions, untapper, Capability.EtbUntapsLand)].filter(Boolean);
  if (untapCount < blinkCost) {
    return evidence('solver:blink-etb-land-untap:rejected:' + cardIds([blink, untapper]).join('|'), ComboFamilyId.BlinkEtbLandUntapLoop, [blink, untapper], proofTransitions, {
      outcome: SolverOutcome.Rejected,
      kind: UnderstandingEvidenceKind.Rejection,
      rejectionReason: 'ETB land untap cannot repay repeatable blink cost',
    });
  }
  const netMana = untapCount - blinkCost;
  return evidence('solver:blink-etb-land-untap:' + cardIds([blink, untapper]).join('|'), ComboFamilyId.BlinkEtbLandUntapLoop, [blink, untapper], proofTransitions, {
    requiredLegality: [
      legality(LegalityPredicate.RepeatableAction, 'blink source is repeatable, not a one-shot effect', blink.id),
      legality(LegalityPredicate.LegalTarget, 'blink can reuse the package ETB land-untap permanent', blink.id, untapper.id),
      legality(LegalityPredicate.PaymentClosed, 'untapped lands repay the blink action and close the package-local loop', untapper.id, blink.id),
    ],
    requiredFacts: [fact(blink, Capability.IsRepeatableBlink), fact(untapper, Capability.EtbUntapsLand)],
    steps: [
      { transitionId: proofTransitions[0] && proofTransitions[0].id, cardId: blink.id, action: 'pay repeatable blink activation', delta: { mana: -blinkCost } },
      { transitionId: proofTransitions[1] && proofTransitions[1].id, cardId: untapper.id, action: 'ETB trigger untaps lands', delta: { mana: untapCount } },
      { action: netMana > 0 ? 'blink and ETB state close with positive package-local mana delta' : 'blink and ETB state close at break-even with a sustaining loop', delta: { mana: netMana } },
    ],
    positiveDeltas: [amount(StateDimension.Mana, netMana, netMana, { resource: ComboResource.Mana })],
  });
}

function solveLifeFeedback(cards, transitions) {
  const gainFromLoss = cards.find(card => hasCap(card, Capability.IsLifegainFromOpponentLifeloss));
  const lossFromGain = cards.find(card => hasCap(card, Capability.IsLifelossFromYourLifegain));
  if (!gainFromLoss || !lossFromGain) return null;
  const proofTransitions = [findTransition(transitions, gainFromLoss, Capability.IsLifegainFromOpponentLifeloss), findTransition(transitions, lossFromGain, Capability.IsLifelossFromYourLifegain)].filter(Boolean);
  return evidence('solver:lifegain-lifeloss:' + cardIds([gainFromLoss, lossFromGain]).join('|'), ComboFamilyId.LifegainLifelossLoop, [gainFromLoss, lossFromGain], proofTransitions, {
    requiredLegality: [legality(LegalityPredicate.PackageLocal, 'lifegain and opponent-lifeloss triggers are both in the bounded package')],
    requiredFacts: [fact(gainFromLoss, Capability.IsLifegainFromOpponentLifeloss), fact(lossFromGain, Capability.IsLifelossFromYourLifegain)],
    steps: [
      { transitionId: proofTransitions[1] && proofTransitions[1].id, cardId: lossFromGain.id, action: 'your life gain makes opponents lose life', delta: { opponentLife: -1 } },
      { transitionId: proofTransitions[0] && proofTransitions[0].id, cardId: gainFromLoss.id, action: 'opponent life loss gains you life', delta: { life: 1 } },
      { action: 'reciprocal trigger state repeats after a seed life event' },
    ],
    positiveDeltas: [amount(ComboResource.Life, 1, Number.POSITIVE_INFINITY, { resource: ComboResource.Life }), amount(ComboResource.OpponentLife, Number.NEGATIVE_INFINITY, -1, { resource: ComboResource.OpponentLife })],
    assumptions: ['an initial life gain or opponent life-loss event starts the reciprocal trigger cycle'],
  });
}

function solveDrawDamageFeedback(cards, transitions) {
  const drawToDamage = cards.find(card => hasCap(card, Capability.IsDrawToDamagePayoff) && drawToDamageAcceptsYourDraw(card));
  const damageToDraw = cards.find(card => card !== drawToDamage && hasCap(card, Capability.IsDamageToDrawPayoff));
  if (!drawToDamage || !damageToDraw) return null;
  const proofTransitions = [findTransition(transitions, drawToDamage, Capability.IsDrawToDamagePayoff), findTransition(transitions, damageToDraw, Capability.IsDamageToDrawPayoff)].filter(Boolean);
  if (!damageToDrawAppliesToSource(damageToDraw, drawToDamage)) {
    return evidence('solver:draw-damage-feedback:rejected:' + cardIds([drawToDamage, damageToDraw]).join('|'), ComboFamilyId.DrawDamageFeedbackLoop, [drawToDamage, damageToDraw], proofTransitions, {
      outcome: SolverOutcome.Rejected,
      kind: UnderstandingEvidenceKind.Rejection,
      rejectionReason: 'damage-to-draw trigger does not legally apply to the draw-triggered damage source',
      requiredLegality: [legality(LegalityPredicate.LegalTarget, 'damage-to-draw scope must apply to the draw-to-damage source', damageToDraw.id, drawToDamage.id)],
    });
  }
  return evidence('solver:draw-damage-feedback:' + cardIds([drawToDamage, damageToDraw]).join('|'), ComboFamilyId.DrawDamageFeedbackLoop, [drawToDamage, damageToDraw], proofTransitions, {
    requiredLegality: [legality(LegalityPredicate.LegalTarget, 'damage-to-draw scope applies to the draw-to-damage source', damageToDraw.id, drawToDamage.id)],
    requiredFacts: [fact(drawToDamage, (drawToDamage.caps || []).find(cap => cap.startsWith('draw-to-damage-subject:')) || Capability.IsDrawToDamagePayoff), fact(damageToDraw, Capability.IsDamageToDrawPayoff)],
    steps: [
      { transitionId: proofTransitions[0] && proofTransitions[0].id, cardId: drawToDamage.id, action: 'your draw causes damage', delta: { damage: 1 } },
      { transitionId: proofTransitions[1] && proofTransitions[1].id, cardId: damageToDraw.id, action: 'that damage draws a card', delta: { cards: 1 } },
      { action: 'draw and damage triggers restore the seed event and repeat' },
    ],
    positiveDeltas: [amount(ComboResource.Damage, 1, 1, { resource: ComboResource.Damage }), amount(ComboResource.Draw, 1, 1, { resource: ComboResource.Draw })],
    assumptions: ['an initial draw or damage event starts the reciprocal trigger cycle'],
  });
}

function solvePackageUnderstanding(cards, transitions) {
  return [
    solveSelfUntapMana(cards, transitions),
    solveBlinkEtbUntap(cards, transitions),
    solveLifeFeedback(cards, transitions),
    solveDrawDamageFeedback(cards, transitions),
    solveRecursiveBodyDeathManaSacrifice(cards),
  ].filter(Boolean);
}


function unresolvedUnderstanding(cards, evidenceItems, limits = {}) {
  if (cards.length > (limits.maxCards || 3)) {
    return [evidence('solver:unresolved:package-size:' + cardIds(cards).join('|'), undefined, cards, [], {
      outcome: SolverOutcome.Unresolved,
      kind: UnderstandingEvidenceKind.HumanReview,
      rejectionReason: `package size ${cards.length} exceeds bounded understanding maxCards ${limits.maxCards || 3}`,
      assumptions: ['larger packages require audit-only or future bounded solver work'],
    })];
  }
  if (evidenceItems.some(item => item.outcome === SolverOutcome.Proven)) return [];
  const relevantCaps = cards.flatMap(card => card.caps || []).filter(cap => /cast|graveyard|exile|landfall|copy|buyback|extra-combat|extra-turn|lock|counter|token|sacrifice|death|zone/.test(cap));
  const relevantZones = cards.flatMap(card => card.zones || []).filter(zone => /graveyard|exile|library|hand|stack/i.test(zone));
  if (!relevantCaps.length && !relevantZones.length) return [];
  return [evidence('solver:unresolved:deferred-dimension:' + cardIds(cards).join('|'), undefined, cards, [], {
    outcome: SolverOutcome.Unresolved,
    kind: UnderstandingEvidenceKind.HumanReview,
    rejectionReason: 'package uses semantic dimensions that are intentionally deferred from the first understanding slice',
    assumptions: sorted([...relevantCaps, ...relevantZones]).slice(0, 12),
  })];
}

function buildPackageUnderstanding(cards, options = {}) {
  const limits = options.limits || {};
  const normalizedCards = cards || [];
  const transitions = normalizedCards.flatMap(transitionsForCard);
  const evidenceItems = solvePackageUnderstanding(normalizedCards, transitions);
  const unresolved = unresolvedUnderstanding(normalizedCards, evidenceItems, limits);
  return {
    version: MODEL_VERSION,
    coverage: UNDERSTANDING_COVERAGE,
    state: buildUnderstandingState(normalizedCards, limits),
    transitions,
    evidence: [...evidenceItems, ...unresolved],
    unresolved,
  };
}

module.exports = {
  MODEL_VERSION,
  STATE_VERSION,
  buildPackageUnderstanding,
  buildUnderstandingState,
  transitionsForCard,
  UNDERSTANDING_COVERAGE,
};
