#!/usr/bin/env node
/*
 * evaluate-edhrec-combos.js — offline EDHREC combo corpus evaluator.
 *
 * This script measures current model behavior against scraped combo evidence.
 * It does not teach the classifier about any card-name pair. Card names are
 * only evidence/report identifiers; all model decisions come from existing
 * text-derived capabilities, events, edges, and proof families.
 */
const fs = require('fs');
const path = require('path');
const { loadCards, build } = require('../../src/build-deck-viz');
const { provePackage } = require('../../src/interaction-proof-search');
const { buildInteractionIndexes } = require('../../src/interaction-indexes');
const { COMBO_FAMILIES } = require('../../src/combo-family-library');
const MODEL = require('../../src/interaction-model');
const SEMANTICS = require('../../src/semantic-proof-utils');

const DEFAULT_CACHE = path.join(__dirname, 'edhrec-combo-cache.json');
const DEFAULT_JSON_OUT = path.join(__dirname, 'edhrec-combo-evaluation.json');
const DEFAULT_MD_OUT = path.join(__dirname, 'edhrec-combo-evaluation.md');
const MAX_EDGE_CASES = 40;

const RESULT_CLASS_PATTERNS = [
  { id: 'win', re: /\bwin the game\b|(?:each |target |all )?(?:opponents?|players?) loses? the game/i },
  { id: 'empty-library', re: /exile your library|library.*empty|empty library/i },
  { id: 'infinite-mana', re: /infinite .*mana|infinite mana/i },
  { id: 'infinite-life', re: /infinite (life|lifegain)|infinite .*life gain/i },
  { id: 'infinite-opponent-life-loss', re: /infinite (lifeloss|life loss)|opponents? lose infinite/i },
  { id: 'infinite-damage', re: /infinite damage/i },
  { id: 'infinite-draw', re: /infinite (card )?draw|draw your deck|draw.*library/i },
  { id: 'infinite-tokens', re: /infinite .*tokens?|infinite token/i },
  { id: 'infinite-etb', re: /infinite (enter|etb)|infinite .*enters/i },
  { id: 'infinite-death', re: /infinite death|infinite dies|infinite .*dies/i },
  { id: 'infinite-sacrifice', re: /infinite sacrifice/i },
  { id: 'infinite-cast', re: /infinite (storm|magecraft|cast|spell|commander casts?)/i },
  { id: 'infinite-untap', re: /infinite untap/i },
  { id: 'infinite-counters', re: /infinite .*counters?/i },
  { id: 'mill', re: /mill (each|all|target|your opponent)|infinite (?:self[- ]?)?mill/i },
  { id: 'exile-loop', re: /infinite exile|exile all/i },
  { id: 'bounce-loop', re: /infinite bounce|return .* to .*hand/i },
  { id: 'combat', re: /infinite combat|additional combat/i },
  { id: 'infinite-ltb', re: /infinite .*ltb|near-infinite .*ltb/i },
  { id: 'infinite-landfall', re: /infinite .*landfall|near-infinite .*landfall/i },
  { id: 'infinite-blink', re: /infinite blinking|near-infinite blinking/i },
  { id: 'infinite-scry', re: /infinite scry/i },
  { id: 'infinite-surveil', re: /infinite surveil/i },
  { id: 'infinite-looting', re: /infinite looting/i },
  { id: 'infinite-rummage', re: /infinite rummaging/i },
  { id: 'infinite-self-discard', re: /self-discard triggers/i },
  { id: 'infinite-proliferate', re: /infinite proliferate/i },
  { id: 'infinite-pump', re: /infinitely (large|powerful).*creatures?|infinite power and toughness/i },
  { id: 'lock', re: /\block\b|mass land denial|skip your draw steps|(?:target opponent |opponents?|players?) skip (?:their|all) (?:un)?tap steps|opponents skip their draw steps?|target opponent skips their draw step|prevent all damage|you (?:can'?t be attacked|have protection from everything)|counter all spells opponents cast|(?:opponents?|players?) can(?:not|'?t) (?:cast spells|draw cards|search libraries|attack|tap lands for mana)|(?:opponents?|players?) can only cast one spell per turn|creatures can(?:not|'?t) attack|activated abilities can(?:not|'?t) be activated|lands (?:do not|don'?t) untap|creatures (?:do not|don'?t) untap|lands can(?:not|'?t) enter|destroy (?:each|all) creatures? that enters? the battlefield under an opponent'?s control|destroy all creatures opponents control(?: whenever a creature enters the battlefield)?|destroy all permanents opponents control(?: on each of your turns| each turn)?/i },
  { id: 'infinite-turns', re: /infinite turns/i },
  { id: 'mass-reanimate', re: /return all creature cards from (?:all|your) graveyards? to the battlefield|return some creature cards from your graveyard to the battlefield|put all creature cards from each opponent'?s graveyard onto the battlefield under your control|return all nonland permanents from your graveyard to the battlefield/i },
];

const FAMILY_CLASS_ALIASES = {
  'library-exile→empty-library-win': 'library-exile-empty-library-win',
};
const FAMILY_CLASS_MAP = Object.assign(
  {},
  Object.fromEntries(COMBO_FAMILIES
    .filter(family => Array.isArray(family.resultClasses) && family.resultClasses.length)
    .map(family => [family.id, family.resultClasses])),
  Object.fromEntries(Object.entries(FAMILY_CLASS_ALIASES)
    .map(([alias, familyId]) => [alias, (COMBO_FAMILIES.find(family => family.id === familyId) || {}).resultClasses || []])),
);
const FAMILY_PROOF_DELTA_CLASS_MAP = Object.fromEntries(COMBO_FAMILIES
  .map(family => [
    family.id,
    sortedUnique([...(family.resultClasses || []), ...(family.proofDeltaResultClasses || [])]),
  ]));

// These are generalized interaction-edge result classes used by the offline
// EDHREC evaluator. They deliberately do not claim bounded proof: strict proof
// counts and proof-only coverage remain separate. The map says that when the
// engine already found a specific interaction edge family inside a known combo
// package, that edge can explain the corresponding EDHREC result axis.
const EDGE_RESULT_CLASS_MAP = {
  'sac-fodder→outlet': ['infinite-death', 'infinite-etb', 'infinite-ltb', 'infinite-sacrifice'],
  sacrifice: ['infinite-death', 'infinite-ltb', 'infinite-sacrifice'],
  'death→tokens': ['infinite-death', 'infinite-ltb', 'infinite-sacrifice', 'infinite-tokens'],
  'death→drain': ['infinite-death', 'infinite-ltb', 'infinite-life', 'infinite-opponent-life-loss', 'infinite-sacrifice'],
  'death→draw': ['infinite-death', 'infinite-draw', 'infinite-ltb', 'infinite-sacrifice'],
  'etb→blink': ['infinite-blink', 'infinite-etb', 'infinite-ltb'],
  blink: ['infinite-blink', 'infinite-etb', 'infinite-ltb'],
  'blink→land-untap-etb': ['infinite-blink', 'infinite-etb', 'infinite-mana', 'infinite-untap'],
  'copy→trigger': ['infinite-etb', 'infinite-ltb'],
  reanimate: ['infinite-etb', 'mass-reanimate'],
  tokens: ['infinite-tokens'],
  'token-production→amplifier': ['infinite-tokens'],
  'token-production→replacement': ['infinite-tokens'],
  'life-paid-damage-lifeloss-recovery-loop': ['infinite-damage', 'infinite-life'],
  'exile-recast-creature-mana-loop': ['infinite-cast', 'infinite-etb', 'infinite-ltb'],
  'counter-token→etb-counter-loop': ['infinite-counters', 'infinite-etb', 'infinite-tokens'],
  'go-wide→payoff': ['infinite-pump', 'infinite-tokens'],
  landfall: ['infinite-etb', 'infinite-landfall', 'infinite-tokens'],
  'land-recursion→landfall': ['infinite-etb', 'infinite-landfall'],
  'ramp→sink': ['infinite-mana'],
  'untap→tap-ability': ['infinite-mana', 'infinite-untap'],
  counters: ['infinite-counters', 'infinite-pump'],
  'counter-multiplier': ['infinite-counters', 'infinite-pump'],
  'proliferate→counters': ['infinite-counters', 'infinite-proliferate'],
  draw: ['infinite-draw'],
  scry: ['infinite-scry'],
  discard: ['infinite-self-discard'],
  graveyard: ['mill'],
  cast: ['infinite-cast'],
  magecraft: ['infinite-cast'],
  'artifact-cost-reduction→top-loop-piece': ['infinite-cast', 'infinite-draw'],
  'cast-from-top→top-loop-piece': ['infinite-cast', 'infinite-draw'],
  bounce: ['bounce-loop'],
};

function usage() {
  console.error('Usage: node analysis/edhrec-combos/evaluate-edhrec-combos.js [--cache file] [--json-out file] [--md-out file] [--max n]');
  process.exit(2);
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgs(argv) {
  const opts = { cache: DEFAULT_CACHE, jsonOut: DEFAULT_JSON_OUT, mdOut: DEFAULT_MD_OUT, max: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cache') opts.cache = argv[++i];
    else if (arg === '--json-out') opts.jsonOut = argv[++i];
    else if (arg === '--md-out') opts.mdOut = argv[++i];
    else if (arg === '--max') opts.max = parsePositiveInt(argv[++i], opts.max);
    else if (arg === '--help') usage();
    else usage();
  }
  return opts;
}

function sortedUnique(values) {
  return [...new Set((values || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function increment(map, key, by = 1) {
  map[key] = (map[key] || 0) + by;
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function loadCache(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function detailedCombos(cache, max = Infinity) {
  return (cache.combos || [])
    .filter(combo => Array.isArray(combo.cards) && combo.cards.length && Array.isArray(combo.results) && combo.results.length)
    .slice(0, max);
}

function classifyResultLabelsDetailed(labels) {
  const classes = new Set();
  const unmappedLabels = [];
  for (const label of labels || []) {
    let matched = false;
    for (const pattern of RESULT_CLASS_PATTERNS) {
      if (pattern.re.test(label)) {
        classes.add(pattern.id);
        matched = true;
      }
    }
    if (!matched) unmappedLabels.push(label);
  }
  return { classes: sortedUnique([...classes]), unmappedLabels: sortedUnique(unmappedLabels) };
}

function classifyResultLabels(labels) {
  return classifyResultLabelsDetailed(labels).classes;
}

function hasCap(card, cap) {
  return (card.caps || []).includes(cap);
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

function sacOutletManaProfile(card) {
  return {
    total: maxCapNumber(card, 'sac-outlet-mana-produced'),
    any: maxCapNumber(card, 'sac-outlet-mana-any'),
    colorless: maxCapNumber(card, 'sac-outlet-mana-c'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, 'sac-outlet-mana-' + color)])),
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

function manaCostProfileFromCaps(card, prefix) {
  return {
    total: minCapNumber(card, prefix + '-cost'),
    colorless: maxCapNumber(card, prefix + '-colorless-cost'),
    colors: Object.fromEntries(MANA_COLORS.map(color => [color, maxCapNumber(card, prefix + '-color-' + color)])),
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

function etbBlinkCanTarget(blinker, target) {
  return MODEL.canEtbBlinkTarget(blinker, target);
}

function isCreaturePermanent(card) {
  return /\bcreature\b/i.test(card?.type || card?.type_line || '');
}

function isLegendaryPermanent(card) {
  return /\blegendary\b/i.test(card?.type || card?.type_line || '');
}

function hastyCopyCanTarget(copier, target, extraTargetCaps = []) {
  if (!hasCap(copier, 'hasty-copy-target-creature')) return false;
  const targetCaps = ['is-creature-permanent', ...extraTargetCaps];
  if (hasCap(copier, 'hasty-copy-target-requires-nonlegendary')) targetCaps.push('is-nonlegendary-permanent');
  if (!MODEL.faceCompatibleCaps(target, targetCaps)) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  if (!target?.faceFacts?.length && hasCap(copier, 'hasty-copy-target-requires-nonlegendary') && isLegendaryPermanent(target)) return false;
  return true;
}

function hastyCopySpellCanTarget(copySpell, target, extraTargetCaps = []) {
  if (!hasCap(copySpell, 'hasty-copy-spell-target-creature')) return false;
  const targetCaps = ['is-creature-permanent', 'is-nonlegendary-permanent', ...extraTargetCaps];
  if (!MODEL.faceCompatibleCaps(target, targetCaps)) return false;
  if (!target?.faceFacts?.length && !isCreaturePermanent(target)) return false;
  if (!target?.faceFacts?.length && isLegendaryPermanent(target)) return false;
  return true;
}

function recursivePreconditionSatisfiedWith(body, cards, requiredCardCaps = new Map()) {
  if (!hasCap(body, 'recursive-body-requires-another-creature')) return true;
  return cards.some(card => {
    if (card === body) return false;
    const extraCaps = requiredCardCaps.get(card) || [];
    return MODEL.faceCompatibleCaps(card, ['is-creature-permanent', ...extraCaps]);
  });
}

function hasMutualEtbBlinkReset(cards) {
  return cards.some(first => hasCap(first, 'is-etb-blink')
    && cards.some(second => second !== first
      && hasCap(second, 'is-etb-blink')
      && etbBlinkCanTarget(first, second)
      && etbBlinkCanTarget(second, first)));
}

function hasAmplifiedSelfUntapLoop(cards) {
  return cards.some(amplifier => hasCap(amplifier, 'is-colorless-mana-amplifier')
    && cards.some(engine => engine !== amplifier
      && hasCap(engine, 'is-self-untapper')
      && hasCap(engine, 'taps-for-mana')
      && hasCap(engine, 'produces-colorless-mana')
      && maxCapNumber(engine, 'mana-produced') + maxCapNumber(amplifier, 'colorless-mana-amplifier') > maxCapNumber(engine, 'self-untap-cost')));
}

function hasTokenReplacementSacrificeManaLoop(cards) {
  return cards.some(replacer => {
    if (!hasCap(replacer, 'is-token-to-creature-token-replacer') || !hasCap(replacer, 'is-creature-sac-outlet')) return false;
    const cost = manaCostProfileFromCaps(replacer, 'sac-outlet-activation');
    return cards.some(payoff => payoff !== replacer && hasCap(payoff, 'is-death-mana-payoff') && canPayRecursiveCost(cost, deathManaProfile(payoff)));
  });
}

function hasLifelinkCounterDamageLoop(cards) {
  return cards.some(engine => hasCap(engine, 'is-lifelink-counter-engine')
    && cards.some(source => source !== engine
      && hasCap(source, 'is-counter-to-damage-source')
      && MODEL.faceCompatibleCaps(source, ['is-creature-permanent', 'is-counter-to-damage-source'])));
}

function capSuffixes(card, prefix) {
  return (card.caps || [])
    .filter(cap => cap.startsWith(prefix))
    .map(cap => cap.slice(prefix.length));
}

function counterTokenCanTriggerGranter(tokenEngine, granter) {
  const tokenColors = capSuffixes(tokenEngine, 'counter-token-color:');
  const accepted = capSuffixes(granter, 'etb-counter-granter-token-color:');
  if (!tokenColors.length || !accepted.length) return false;
  if (accepted.includes('any')) return !tokenColors.includes('unknown');
  return accepted.some(color => tokenColors.includes(color));
}

function hasCounterTokenEtbCounterLoop(cards) {
  return cards.some(tokenEngine => hasCap(tokenEngine, 'is-counter-to-creature-token-engine')
    && MODEL.faceCompatibleCaps(tokenEngine, ['is-creature-permanent', 'is-counter-to-creature-token-engine'])
    && cards.some(granter => granter !== tokenEngine
      && hasCap(granter, 'is-creature-etb-counter-granter')
      && counterTokenCanTriggerGranter(tokenEngine, granter)));
}

function lifegainCounterCanTargetEngine(counterPayoff, tokenEngine) {
  const targets = capSuffixes(counterPayoff, 'lifegain-counter-target:');
  if (!targets.includes('creature') && !targets.includes('creature-or-enchantment')) return false;
  return MODEL.faceCompatibleCaps(tokenEngine, ['is-creature-permanent', 'is-counter-to-creature-token-engine']);
}

function hasLifegainCounterTokenEtbLoop(cards) {
  return cards.some(tokenEngine => hasCap(tokenEngine, 'is-counter-to-creature-token-engine')
    && cards.some(counterPayoff => hasCap(counterPayoff, 'is-lifegain-to-counter-payoff')
      && lifegainCounterCanTargetEngine(counterPayoff, tokenEngine)
      && cards.some(lifegainer => hasCap(lifegainer, 'is-creature-etb-lifegain-payoff'))));
}

function detectCapabilityFamilies(nodes) {
  const cards = (nodes || []).filter(node => node && node.role !== 'zone');
  const families = new Set();
  if (cards.some(c => hasCap(c, 'is-library-exile-source')) && cards.some(c => hasCap(c, 'is-empty-library-win-payoff'))) families.add('library-exile-empty-library-win');
  if (cards.some(c => hasCap(c, 'is-cheap-instant-nonland-permanent-untap-spell')) && cards.some(c => hasCap(c, 'is-repeatable-cheap-instant-caster'))) families.add('imprint-untap-spell-loop');
  if (cards.some(c => hasCap(c, 'is-activated-ability-copier')) && cards.some(c => hasCap(c, 'is-self-untapper'))) families.add('self-untap-mana→ability-copy-loop');
  if (cards.some(copier => hasCap(copier, 'is-repeatable-hasty-creature-copy')
    && cards.some(untapper => untapper !== copier && hasCap(untapper, 'etb-untaps-permanent') && hastyCopyCanTarget(copier, untapper, ['etb-untaps-permanent'])))) families.add('hasty-copy→etb-untap-loop');
  if (cards.some(spellCopier => hasCap(spellCopier, 'is-etb-spell-copier')
    && cards.some(copySpell => copySpell !== spellCopier && hasCap(copySpell, 'is-hasty-creature-copy-spell') && hastyCopySpellCanTarget(copySpell, spellCopier, ['is-etb-spell-copier'])))) families.add('spell-copy-etb→creature-copy-spell-loop');
  if (cards.some(spellCopier => hasCap(spellCopier, 'is-etb-spell-copier')
    && MODEL.faceCompatibleCaps(spellCopier, ['is-creature-permanent', 'is-nonlegendary-permanent', 'is-etb-spell-copier'])
    && cards.some(copySpell => copySpell !== spellCopier && hasCap(copySpell, 'is-death-copy-creature-spell')))) families.add('death-copy-spell-etb-copy-loop');
  if (cards.some(drawToDamage => hasCap(drawToDamage, 'is-draw-to-damage-payoff')
    && drawToDamageAcceptsYourDraw(drawToDamage)
    && cards.some(damageToDraw => damageToDraw !== drawToDamage
      && hasCap(damageToDraw, 'is-damage-to-draw-payoff')
      && damageToDrawAppliesToSource(damageToDraw, drawToDamage)))) families.add('draw-damage-feedback-loop');
  if (cards.some(c => hasCap(c, 'is-self-copying-targeted-spell')) && cards.some(c => hasCap(c, 'is-magecraft-drain-payoff'))) families.add('self-copy-spell→magecraft-drain-loop');
  if (hasLifelinkCounterDamageLoop(cards)) families.add('lifelink-counter-damage-loop');
  if (hasCounterTokenEtbCounterLoop(cards)) families.add('counter-token→etb-counter-loop');
  if (hasLifegainCounterTokenEtbLoop(cards)) families.add('lifegain-counter-token-etb-loop');
  if (cards.some(c => hasCap(c, 'is-minus-counter-death-spreader'))
      && cards.some(c => hasCap(c, 'is-minus-counter-to-1-1-token-engine'))) families.add('minus-counter-death→token-loop');
  if (cards.some(c => hasCap(c, 'is-life-paid-damage-source') && hasCap(c, 'life-paid-damage-can-hit-opponent'))
      && cards.some(c => hasCap(c, 'is-lifegain-from-opponent-lifeloss'))) families.add('life-paid-damage-lifeloss-recovery-loop');
  if (cards.some(c => hasCap(c, 'is-creature-exile-cast-mana-outlet'))
      && cards.some(c => hasCap(c, 'is-recursive-exile-cast-body') && MODEL.faceCompatibleCaps(c, ['is-creature-permanent', 'is-recursive-exile-cast-body']))) families.add('exile-recast-creature-mana-loop');
  if (cards.some(c => hasCap(c, 'is-mill-to-lifeloss-payoff')) && cards.some(c => hasCap(c, 'is-lifeloss-to-mill-payoff'))) families.add('mill-lifeloss-feedback-loop');
  if (cards.some(c => hasCap(c, 'is-mass-opponent-draw-source')) && cards.some(c => hasCap(c, 'is-opponent-draw-punisher'))) families.add('opponent-draw-punisher-win');
  if (cards.some(c => hasCap(c, 'is-half-library-mill-source')) && cards.some(c => hasCap(c, 'is-mill-multiplier'))) families.add('mill-multiplier-finite-mill');
  if (cards.some(c => hasCap(c, 'is-half-library-mill-source')) && cards.some(c => hasCap(c, 'is-delayed-same-turn-mill-payoff'))) families.add('delayed-mill-equalizer-finite-mill');
  if (hasMutualEtbBlinkReset(cards)) families.add('mutual-etb-blink-reset-loop');
  if (hasAmplifiedSelfUntapLoop(cards)) families.add('self-untap-mana-loop');
  if (hasTokenReplacementSacrificeManaLoop(cards)) families.add('token-replacement-sacrifice-mana-loop');
  if (cards.some(body => {
    if (!hasCap(body, 'is-recursive-body')) return false;
    const cost = recursiveCostProfile(body);
    return cards.some(outlet => {
      if (outlet === body || !hasCap(outlet, 'is-mana-sac-outlet')) return false;
      const outletMana = sacOutletManaProfile(outlet);
      const outletCaps = new Map([[outlet, ['is-mana-sac-outlet']]]);
      if (canPayRecursiveCost(cost, outletMana) && recursivePreconditionSatisfiedWith(body, cards, outletCaps)) return true;
      return cards.some(support => {
        if (support === body || support === outlet || !hasCap(support, 'is-death-mana-payoff')) return false;
        const requiredCaps = new Map([[outlet, ['is-mana-sac-outlet']], [support, ['is-death-mana-payoff']]]);
        return recursivePreconditionSatisfiedWith(body, cards, requiredCaps)
          && canPayRecursiveCost(cost, addManaProfiles(outletMana, deathManaProfile(support)));
      });
    });
  })) families.add('recursive-body-sacrifice-mana-loop');
  return sortedUnique([...families]);
}

function classesForFamilies(families) {
  return sortedUnique((families || []).flatMap(family => FAMILY_CLASS_MAP[family] || []));
}

function edgeResultFamilies(families) {
  return sortedUnique((families || []).filter(family => EDGE_RESULT_CLASS_MAP[family]));
}

function classesForEdgeFamilies(families) {
  return sortedUnique((families || []).flatMap(family => EDGE_RESULT_CLASS_MAP[family] || []));
}

function classesForProofDeltas(proofs) {
  const classes = new Set();
  for (const proof of proofs || []) {
    const familyId = FAMILY_CLASS_ALIASES[proof.family] || proof.family;
    const allowedClasses = FAMILY_PROOF_DELTA_CLASS_MAP[familyId] || [];
    for (const delta of proof.positiveDeltas || []) {
      const cls = SEMANTICS.classForProofDeltaResource(delta.resource);
      if (!cls) continue;
      if (!allowedClasses.includes(cls)) continue;
      if (!SEMANTICS.proofDeltaShowsPositiveResult(delta)) continue;
      classes.add(cls);
    }
  }
  return sortedUnique([...classes]);
}

function resultCoverage(expectedClasses, modelClasses) {
  const expected = new Set(expectedClasses || []);
  const model = new Set(modelClasses || []);
  const covered = [...expected].filter(cls => model.has(cls)).sort();
  return {
    covered,
    missed: [...expected].filter(cls => !model.has(cls)).sort(),
    coveredAny: expected.size === 0 ? null : covered.length > 0,
  };
}

function compactProof(proof) {
  if (!proof) return null;
  return {
    status: proof.status,
    proofs: (proof.proofs || []).map(item => ({ family: item.family, cards: item.cards, positiveDeltas: item.positiveDeltas || [] })),
    rejections: (proof.rejections || []).map(item => ({ reason: item.reason, cards: item.cards, details: item.details })).slice(0, 6),
    reason: proof.reason,
  };
}

function edgeFamilies(graph) {
  return sortedUnique((graph.edges || []).flatMap(edge => (edge.interactions || []).map(item => item.family || item.event || item.kind)));
}

function evaluateCombo(combo, idx) {
  const decklist = combo.cards.map(name => ({ qty: 1, name }));
  const graph = build(decklist, idx, { includeInteractionProofs: true });
  const nodes = (graph.nodes || []).filter(node => node.role !== 'zone');
  const resultClassification = classifyResultLabelsDetailed(combo.results);
  const expectedClasses = resultClassification.classes;
  const proof = nodes.length ? provePackage(nodes, { limits: { maxCards: 3, maxBranches: 16, maxDepth: 6 } }) : { status: 'missing-card', proofs: [], rejections: [] };
  const indexes = buildInteractionIndexes(nodes);
  const proofFamilies = sortedUnique((proof.proofs || []).map(item => item.family));
  const packageFamilies = sortedUnique((graph.interactionProofs || []).map(pkg => pkg.family));
  const proofOnlyFamilies = sortedUnique([...proofFamilies, ...packageFamilies]);
  const graphEdgeFamilies = edgeFamilies(graph);
  const edgeSignalFamilies = edgeResultFamilies(graphEdgeFamilies);
  const capabilityFamilies = detectCapabilityFamilies(nodes);
  const capabilities = Object.keys(indexes.byCapability || {}).sort();
  const familySignals = sortedUnique([
    ...proofFamilies,
    ...packageFamilies,
    ...edgeSignalFamilies,
    ...capabilityFamilies,
  ]);
  const proofDeltaClasses = classesForProofDeltas(proof.proofs);
  const edgeSignalClasses = classesForEdgeFamilies(edgeSignalFamilies);
  const proofOnlyModelClasses = sortedUnique([...classesForFamilies(proofOnlyFamilies), ...proofDeltaClasses]);
  const modelClasses = sortedUnique([...classesForFamilies(familySignals), ...edgeSignalClasses, ...proofDeltaClasses]);
  const proofOnlyCoverage = resultCoverage(expectedClasses, proofOnlyModelClasses);
  const coverage = resultCoverage(expectedClasses, modelClasses);
  const resolvedAll = graph.missing.length === 0 && nodes.length === combo.cards.length;
  const proofProven = proof.status === 'proven' || (graph.interactionProofs || []).length > 0;
  const comboFamilyDetected = familySignals.length > 0;
  const genericEdgeDetected = (graph.edges || []).length > 0;
  const bucket = !resolvedAll ? 'missing-card'
    : proof.status === 'bounded-out' ? 'bounded-out'
    : proofProven ? 'proved'
    : comboFamilyDetected ? 'classified-not-proven'
    : genericEdgeDetected ? 'generic-edge-only'
    : 'missed';

  return {
    id: combo.id,
    detailPath: combo.detailPath,
    url: combo.url,
    categories: combo.categories || [],
    deckCount: combo.metadata && combo.metadata.deckCount,
    cardCount: combo.cardCount || combo.cards.length,
    cards: combo.cards,
    results: combo.results,
    expectedClasses,
    unmappedLabels: resultClassification.unmappedLabels,
    resolvedAll,
    missing: graph.missing,
    nodeCount: nodes.length,
    proofStatus: proof.status,
    proofFamilies,
    packageFamilies,
    proofOnlyFamilies,
    proofDeltaClasses,
    edgeFamilies: graphEdgeFamilies,
    edgeSignalFamilies,
    edgeSignalClasses,
    capabilityFamilies,
    familySignals,
    proofOnlyModelClasses,
    modelClasses,
    proofOnlyResultCoverage: proofOnlyCoverage,
    resultCoverage: coverage,
    bucket,
    graphEdgeCount: (graph.edges || []).length,
    proofPackageCount: (graph.interactionProofs || []).length,
    capabilityCount: capabilities.length,
    notableCapabilities: capabilities.filter(cap => /library|empty|imprint|self-untap|ability-copy|lifegain|lifeloss|mill|opponent-draw|mass-opponent-draw|draw-to-damage|damage-to-draw|escape|wheel|discard-hand|recursive|token|blink|sac|death|top|caster|untap-spell|variable-|board-count|creature-untap|attached-creature-untap|combat-|extra-combat|colorless-mana-amplifier/.test(cap)).slice(0, 24),
    proof: compactProof(proof),
  };
}

function summarizeEvaluations(evaluations, cacheMeta = {}) {
  const summary = {
    source: cacheMeta.source,
    generatedAt: new Date().toISOString(),
    totalDetailed: evaluations.length,
    resolvedAll: 0,
    byCardCount: {},
    byBucket: {},
    byProofStatus: {},
    byExpectedClass: {},
    byModelClass: {},
    topFamilySignals: {},
    unmappedResultLabels: { combosWithAny: 0, labelInstances: 0, topLabels: {} },
    resolvedResultCoverage: { considered: 0, coveredAny: 0, missedAll: 0 },
    expectedClassCoverage: { considered: 0, coveredAny: 0, missedAll: 0, unclassifiedExpected: 0 },
    proofOnlyExpectedClassCoverage: { considered: 0, coveredAny: 0, missedAll: 0, unclassifiedExpected: 0 },
    coverageBlockers: { totalExpectedMisses: 0, byBlocker: {}, byResolvedBlocker: {}, topMissedClassByBlocker: {} },
  };
  for (const item of evaluations) {
    if (item.resolvedAll) {
      summary.resolvedAll++;
      summary.resolvedResultCoverage.considered++;
      if (item.resultCoverage.coveredAny) summary.resolvedResultCoverage.coveredAny++;
      else summary.resolvedResultCoverage.missedAll++;
    }
    increment(summary.byCardCount, String(item.cardCount));
    increment(summary.byBucket, item.bucket);
    increment(summary.byProofStatus, item.proofStatus || 'unknown');
    for (const cls of item.expectedClasses) increment(summary.byExpectedClass, cls);
    for (const cls of item.modelClasses) increment(summary.byModelClass, cls);
    for (const family of item.familySignals) increment(summary.topFamilySignals, family);
    if ((item.unmappedLabels || []).length) {
      summary.unmappedResultLabels.combosWithAny++;
      summary.unmappedResultLabels.labelInstances += item.unmappedLabels.length;
      for (const label of item.unmappedLabels) increment(summary.unmappedResultLabels.topLabels, label);
    }
    if (item.expectedClasses.length) {
      summary.expectedClassCoverage.considered++;
      if (item.resultCoverage.coveredAny) summary.expectedClassCoverage.coveredAny++;
      else {
        summary.expectedClassCoverage.missedAll++;
        const blocker = coverageBlockerForItem(item);
        summary.coverageBlockers.totalExpectedMisses++;
        increment(summary.coverageBlockers.byBlocker, blocker);
        if (item.resolvedAll) increment(summary.coverageBlockers.byResolvedBlocker, blocker);
        if (!summary.coverageBlockers.topMissedClassByBlocker[blocker]) summary.coverageBlockers.topMissedClassByBlocker[blocker] = {};
        for (const cls of item.resultCoverage.missed || []) increment(summary.coverageBlockers.topMissedClassByBlocker[blocker], cls);
      }
      summary.proofOnlyExpectedClassCoverage.considered++;
      if (item.proofOnlyResultCoverage.coveredAny) summary.proofOnlyExpectedClassCoverage.coveredAny++;
      else summary.proofOnlyExpectedClassCoverage.missedAll++;
    } else {
      summary.expectedClassCoverage.unclassifiedExpected++;
      summary.proofOnlyExpectedClassCoverage.unclassifiedExpected++;
    }
  }
  summary.resolvedPct = percent(summary.resolvedAll, evaluations.length);
  summary.provedPct = percent(summary.byBucket.proved || 0, evaluations.length);
  summary.comboFamilyDetectedPct = percent(evaluations.filter(item => item.familySignals.length).length, evaluations.length);
  summary.resolvedResultCoverage.coveredAnyPct = percent(summary.resolvedResultCoverage.coveredAny, summary.resolvedResultCoverage.considered);
  summary.expectedClassCoverage.coveredAnyPct = percent(summary.expectedClassCoverage.coveredAny, summary.expectedClassCoverage.considered);
  summary.proofOnlyExpectedClassCoverage.coveredAnyPct = percent(summary.proofOnlyExpectedClassCoverage.coveredAny, summary.proofOnlyExpectedClassCoverage.considered);
  summary.topFamilySignals = Object.fromEntries(Object.entries(summary.topFamilySignals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  summary.unmappedResultLabels.topLabels = Object.fromEntries(Object.entries(summary.unmappedResultLabels.topLabels).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  summary.coverageBlockers.byBlocker = Object.fromEntries(Object.entries(summary.coverageBlockers.byBlocker).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  summary.coverageBlockers.byResolvedBlocker = Object.fromEntries(Object.entries(summary.coverageBlockers.byResolvedBlocker).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  summary.coverageBlockers.topMissedClassByBlocker = Object.fromEntries(Object.entries(summary.coverageBlockers.topMissedClassByBlocker)
    .map(([blocker, classes]) => [blocker, Object.fromEntries(Object.entries(classes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12))])
    .sort((a, b) => a[0].localeCompare(b[0])));
  return summary;
}

function coverageBlockerForItem(item) {
  if (!item.expectedClasses.length || item.resultCoverage.coveredAny !== false) return null;
  if (!item.resolvedAll) return 'missing-card-data';
  if (item.proofStatus === 'bounded-out' || item.bucket === 'bounded-out') return 'proof-size-bound';
  if (item.bucket === 'proved') return 'proved-result-axis-mismatch';
  if (item.familySignals.length && item.proofStatus !== 'proven') return 'semantic-system-needed-classified';
  if (item.graphEdgeCount) return 'generic-edge-no-result-class';
  return 'no-current-signal';
}

function edgeCaseReason(item) {
  if (!item.resolvedAll) return `missing local card data: ${item.missing.join(', ')}`;
  if (item.proofStatus === 'bounded-out') return 'outside current bounded proof size (>3 cards)';
  if (item.familySignals.length && item.proofStatus !== 'proven') return 'classified as a combo-family signal but no bounded proof package yet';
  if (item.graphEdgeCount) return 'generic pair edge(s) exist, but no known combo-family classification';
  if (!item.expectedClasses.length) return 'EDHREC result labels need richer result-class mapping';
  return 'no current family/capability/proof signal';
}

function edgeCases(evaluations, limit = MAX_EDGE_CASES) {
  const seen = new Set();
  return evaluations
    .filter(item => item.bucket !== 'proved' || item.resultCoverage.coveredAny === false)
    .sort((a, b) => (b.deckCount || 0) - (a.deckCount || 0) || a.detailPath.localeCompare(b.detailPath))
    .filter(item => {
      const key = `${sortedUnique(item.cards).join('|')}::${sortedUnique(item.results).join('|')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(item => ({
      id: item.id,
      detailPath: item.detailPath,
      deckCount: item.deckCount,
      cardCount: item.cardCount,
      cards: item.cards,
      results: item.results,
      expectedClasses: item.expectedClasses,
      bucket: item.bucket,
      proofStatus: item.proofStatus,
      familySignals: item.familySignals,
      modelClasses: item.modelClasses,
      missedClasses: item.resultCoverage.missed,
      reason: edgeCaseReason(item),
    }));
}

function markdownTable(rows, headers) {
  const escape = value => String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${headers.map(header => escape(row[header])).join(' | ')} |`),
  ].join('\n');
}

function countRows(obj) {
  return Object.entries(obj || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count }));
}

function renderMarkdown(payload) {
  const { summary, edgeCases: cases } = payload;
  const lines = [];
  lines.push('# EDHREC combo model baseline');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push('');
  lines.push('## Baseline answer');
  lines.push('');
  lines.push(`- Detailed combos evaluated: **${summary.totalDetailed}**`);
  lines.push(`- Local card resolution: **${summary.resolvedAll}/${summary.totalDetailed}** (${summary.resolvedPct}%)`);
  lines.push(`- Proven by bounded proof/package logic: **${summary.byBucket.proved || 0}/${summary.totalDetailed}** (${summary.provedPct}%)`);
  lines.push(`- Combo-family signal detected (proof, package, edge, or capability family): **${Object.values(summary.topFamilySignals).reduce((a, b) => a + b, 0)} signal hits across ${summary.totalDetailed} combos**; combo-level detection **${summary.comboFamilyDetectedPct}%**`);
  lines.push(`- Resolved-combo result coverage target metric: **${summary.resolvedResultCoverage.coveredAny}/${summary.resolvedResultCoverage.considered}** (${summary.resolvedResultCoverage.coveredAnyPct}%) resolved combos had a generalized signal matching at least one EDHREC result class.`);
  lines.push(`- Expected result-class coverage (all signals): **${summary.expectedClassCoverage.coveredAny}/${summary.expectedClassCoverage.considered}** (${summary.expectedClassCoverage.coveredAnyPct}%) had at least one EDHREC result class matched by a model family class.`);
  lines.push(`- Proof-only expected result-class coverage: **${summary.proofOnlyExpectedClassCoverage.coveredAny}/${summary.proofOnlyExpectedClassCoverage.considered}** (${summary.proofOnlyExpectedClassCoverage.coveredAnyPct}%) had at least one EDHREC result class matched by a bounded proof/package family.`);
  lines.push(`- Result-label taxonomy gaps: **${summary.unmappedResultLabels.combosWithAny}** combos contain **${summary.unmappedResultLabels.labelInstances}** unmapped EDHREC label instance(s).`);
  lines.push('');
  lines.push('Interpretation: card-name evidence is only used in this report/cache. The evaluated model behavior comes from generalized text-derived capabilities, edges, families, and proof search.');
  lines.push('');
  lines.push('## Buckets');
  lines.push('');
  lines.push(markdownTable(countRows(summary.byBucket), ['key', 'count']));
  lines.push('');
  lines.push('## Proof status');
  lines.push('');
  lines.push(markdownTable(countRows(summary.byProofStatus), ['key', 'count']));
  lines.push('');
  lines.push('## Coverage blockers for expected misses');
  lines.push('');
  lines.push(`Every expected-class miss is assigned to exactly one blocker category. Reconciled misses: **${summary.coverageBlockers.totalExpectedMisses}/${summary.expectedClassCoverage.missedAll}**.`);
  lines.push('');
  lines.push(markdownTable(countRows(summary.coverageBlockers.byBlocker), ['key', 'count']));
  lines.push('');
  lines.push('## Card counts');
  lines.push('');
  lines.push(markdownTable(countRows(summary.byCardCount), ['key', 'count']));
  lines.push('');
  lines.push('## Expected EDHREC result classes');
  lines.push('');
  lines.push(markdownTable(countRows(summary.byExpectedClass), ['key', 'count']));
  lines.push('');
  lines.push('## Unmapped EDHREC result labels');
  lines.push('');
  const unmappedRows = countRows(summary.unmappedResultLabels.topLabels).slice(0, 30);
  lines.push(unmappedRows.length ? markdownTable(unmappedRows, ['key', 'count']) : '_No unmapped labels in this run._');
  lines.push('');
  lines.push('## Model family signals');
  lines.push('');
  lines.push(markdownTable(countRows(summary.topFamilySignals).slice(0, 20), ['key', 'count']));
  lines.push('');
  lines.push('## Edge cases / misses to inspect');
  lines.push('');
  lines.push(markdownTable(cases.map(item => ({
    cards: item.cards.join(' + '),
    results: item.results.join('; '),
    bucket: item.bucket,
    families: item.familySignals.join(', '),
    reason: item.reason,
    path: item.detailPath,
  })), ['cards', 'results', 'bucket', 'families', 'reason', 'path']));
  lines.push('');
  return lines.join('\n');
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cache = loadCache(opts.cache);
  const combos = detailedCombos(cache, opts.max);
  const idx = loadCards();
  const evaluations = combos.map(combo => evaluateCombo(combo, idx));
  const summary = summarizeEvaluations(evaluations, cache.meta || {});
  const payload = {
    meta: {
      cache: opts.cache,
      cacheGeneratedAt: cache.meta && cache.meta.generatedAt,
      generatedAt: summary.generatedAt,
      noCardNameHardcoding: 'Card names are report evidence only; classifier/proof decisions are text-derived.',
    },
    summary,
    edgeCases: edgeCases(evaluations),
    evaluations,
  };
  writeJson(opts.jsonOut, payload);
  fs.mkdirSync(path.dirname(opts.mdOut), { recursive: true });
  fs.writeFileSync(opts.mdOut, renderMarkdown(payload));
  process.stdout.write(`✓ evaluated ${evaluations.length} detailed combos\n`);
  process.stdout.write(`  resolved ${summary.resolvedAll}/${summary.totalDetailed}; proved ${summary.byBucket.proved || 0}; family-detected ${summary.comboFamilyDetectedPct}%; signal result-class coverage ${summary.expectedClassCoverage.coveredAnyPct}%; proof-only ${summary.proofOnlyExpectedClassCoverage.coveredAnyPct}%\n`);
  process.stdout.write(`  wrote ${opts.jsonOut}\n  wrote ${opts.mdOut}\n`);
}

if (require.main === module) main();
else module.exports = {
  FAMILY_CLASS_MAP,
  EDGE_RESULT_CLASS_MAP,
  classifyResultLabels,
  classifyResultLabelsDetailed,
  classesForEdgeFamilies,
  classesForProofDeltas,
  coverageBlockerForItem,
  detectCapabilityFamilies,
  evaluateCombo,
  resultCoverage,
  summarizeEvaluations,
  renderMarkdown,
};
