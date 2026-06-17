/*
 * combo-family-library.js — declarative archetype definitions for interaction
 * proof search. Definitions are data-shaped on purpose: new families should add
 * compact required facts, repeatability rules, examples, and false-positive
 * fixtures rather than spreading bespoke logic through unrelated modules.
 */

const COMBO_FAMILIES = [
  {
    id: 'self-untap-mana-loop',
    title: 'Self-untap mana loop',
    maxCards: 1,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'engine', kind: 'capability', predicate: 'taps-for-mana' },
      { role: 'engine', kind: 'capability', predicate: 'is-self-untapper' },
    ],
    optionalAccelerants: [{ kind: 'capability', predicate: 'mana-produced', note: 'larger mana output improves positive delta' }],
    disqualifiers: [{ kind: 'cost', rule: 'self-untap cost >= mana produced' }],
    repeatability: { rule: 'same card returns to untapped abstract state with positive mana delta' },
    payoffCriteria: [{ resource: 'mana', comparator: '>', threshold: 0 }],
    examples: [{ name: 'synthetic self-untap dork', cards: ['Self Untap Dork'] }],
    negativeFixtures: [{ name: 'costed self-untapper', cards: ['Self Untap Dork'], reason: 'untap cost not below produced mana' }],
    knownFalsePositives: ['lands with ordinary untap clauses', 'costed untappers that only break even'],
    uiExplanation: 'Tap for mana, pay less mana to untap, and repeat from the same abstract state.',
  },
  {
    id: 'blink-etb-land-untap-loop',
    title: 'Repeatable blink plus ETB land untap',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'blink', kind: 'capability', predicate: 'is-repeatable-blink' },
      { role: 'blink', kind: 'capability', predicate: 'blink-cost' },
      { role: 'untapper', kind: 'capability', predicate: 'etb-untaps-land' },
    ],
    optionalAccelerants: [{ kind: 'resource', resource: 'lands', note: 'lands that produce more than one mana increase delta' }],
    disqualifiers: [{ kind: 'capability', predicate: 'is-blink', without: 'is-repeatable-blink' }],
    repeatability: { rule: 'repeatable blink reuses an ETB untap trigger and restores blink availability' },
    payoffCriteria: [{ resource: 'mana', comparator: '>=', threshold: 0 }, { event: 'etb', comparator: 'repeats' }],
    examples: [{ name: 'Deadeye Navigator + Peregrine Drake', cards: ['Deadeye Navigator', 'Peregrine Drake'] }],
    negativeFixtures: [{ name: 'Ephemerate + Peregrine Drake', cards: ['Ephemerate', 'Peregrine Drake'], reason: 'blink is one-shot' }],
    knownFalsePositives: ['one-shot blink spells', 'ETB untappers that untap too few lands for the blink cost'],
    uiExplanation: 'A repeatable blink engine resets a land-untap ETB creature; the loop is valid only when the blink can be paid again.',
  },
  {
    id: 'aristocrats-body-outlet-payoff',
    title: 'Sacrifice body plus outlet plus death payoff',
    maxCards: 3,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'body', kind: 'capability', predicate: 'is-body' },
      { role: 'outlet', kind: 'capability', predicate: 'is-sac-outlet' },
      { role: 'payoff', kind: 'anyCapability', predicates: ['is-death-drain-payoff', 'is-death-draw-payoff', 'is-death-token-payoff'] },
    ],
    optionalAccelerants: [{ kind: 'capability', predicate: 'is-creature-token-producer', note: 'turns a value engine into a repeatable candidate' }],
    disqualifiers: [{ kind: 'repeatability', rule: 'body is not replenished by the package' }],
    repeatability: { rule: 'requires body replenishment, recursive body, or a token-producing body source' },
    payoffCriteria: [{ event: 'death', comparator: 'triggers payoff' }],
    examples: [{ name: 'token body + outlet + Blood Artist-style payoff', cards: ['Token Source', 'Sac Outlet', 'Death Payoff'] }],
    negativeFixtures: [{ name: 'single free body + outlet + payoff', cards: ['Free Body', 'Sac Outlet', 'Death Payoff'], reason: 'body not replenished' }],
    knownFalsePositives: ['ordinary creatures counted as infinite fodder', 'noncreature token creation feeding creature-death payoffs'],
    uiExplanation: 'The body creates the death event, the outlet controls timing, and the payoff consumes the death trigger.',
  },
  {
    id: 'token-source-modifier-payoff',
    title: 'Token source plus token modifier plus token payoff',
    maxCards: 3,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'source', kind: 'capability', predicate: 'is-token-producer' },
      { role: 'modifier', kind: 'capability', predicate: 'is-token-doubler' },
      { role: 'payoff', kind: 'event.consumes', event: 'tokens' },
    ],
    optionalAccelerants: [{ kind: 'capability', predicate: 'is-creature-token-producer' }],
    disqualifiers: [{ kind: 'scope', rule: 'modifier applies only to another controller or token subtype' }],
    repeatability: { rule: 'value engine unless token source is itself repeatable' },
    payoffCriteria: [{ event: 'tokens', comparator: 'amplified before payoff' }],
    examples: [{ name: 'Raise the Alarm + Anointed Procession + token payoff', cards: ['Raise the Alarm', 'Token Doubler', 'Token Payoff'] }],
    negativeFixtures: [{ name: 'Smothering Tithe reminder token text', cards: ['Smothering Tithe', 'Academy Manufactor'], reason: 'should not imply treasure/mana overreach' }],
    knownFalsePositives: ['reminder text for artifact tokens', 'replacement effects treated as token producers without an actual source'],
    uiExplanation: 'A token event is modified before token-matter payoffs inspect it.',
  },
  {
    id: 'cost-reducer-activated-output-payoff',
    title: 'Cost reducer plus activated output plus payoff',
    maxCards: 3,
    confidenceGate: 'heuristic',
    requiredFacts: [
      { role: 'reducer', kind: 'anyCapability', predicates: ['is-cost-reducer', 'is-creature-ability-cost-reducer', 'is-food-ability-cost-reducer'] },
      { role: 'ability', kind: 'anyCapability', predicates: ['has-nonmana-activated-ability', 'has-creature-activated-ability'] },
      { role: 'payoff', kind: 'event.consumes', event: 'output-from-activated-ability' },
    ],
    optionalAccelerants: [{ kind: 'capability', predicate: 'ability-copy-cost' }],
    disqualifiers: [{ kind: 'scope', rule: 'reducer scope does not apply to the activated ability' }],
    repeatability: { rule: 'requires the activated ability to remain available and the output to feed the payoff' },
    payoffCriteria: [{ event: 'activated-output', comparator: 'feeds payoff' }],
    examples: [{ name: 'Heartstone + Xantcha + draw punisher', cards: ['Heartstone', 'Xantcha', 'Draw Punisher'] }],
    negativeFixtures: [{ name: 'Heartstone + Sol Ring', cards: ['Heartstone', 'Sol Ring'], reason: 'creature-only reducer must not reduce mana rocks' }],
    knownFalsePositives: ['generic reducers applied to scoped abilities', 'cost reducers treated as payoffs without an output consumer'],
    uiExplanation: 'A scoped cost reducer makes an activated output easier to repeat; a separate payoff must consume that output.',
  },
  {
    id: 'artifact-top-cost-reduction-loop',
    title: 'Artifact top recast loop',
    maxCards: 3,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'topPiece', kind: 'capability', predicate: 'is-self-top-draw-artifact' },
      { role: 'reducer', kind: 'capability', predicate: 'is-artifact-spell-cost-reducer' },
      { role: 'caster', kind: 'capability', predicate: 'is-artifact-cast-from-top-enabler' },
    ],
    optionalAccelerants: [{ kind: 'resource', resource: 'life/mana payment', note: 'payment proof is family-specific' }],
    disqualifiers: [{ kind: 'zone', rule: 'top piece cannot be cast from library top' }],
    repeatability: { rule: 'top piece draws and returns itself to the library top while cast permission and cost reduction persist' },
    payoffCriteria: [{ resource: 'cards', comparator: '+', threshold: 1 }],
    examples: [{ name: 'self-top draw artifact + reducer + top caster', cards: ['Self Top Draw Artifact', 'Artifact Spell Reducer', 'Artifact Top Caster'] }],
    negativeFixtures: [{ name: 'top piece + reducer without cast permission', cards: ['Self Top Draw Artifact', 'Artifact Spell Reducer'], reason: 'missing cast-from-top permission' }],
    knownFalsePositives: ['top-of-library look effects without cast permission', 'artifact reducers without a self-top draw artifact'],
    uiExplanation: 'The artifact draws and returns to top, then persistent cost reduction and cast permission let it be replayed.',
  },
  {
    id: 'lifegain-lifeloss-loop',
    title: 'Reciprocal lifegain/lifeloss loop',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'lossToGain', kind: 'capability', predicate: 'is-lifegain-from-opponent-lifeloss' },
      { role: 'gainToLoss', kind: 'capability', predicate: 'is-lifeloss-from-your-lifegain' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'initial life change' }],
    disqualifiers: [{ kind: 'scope', rule: 'life gain/loss only once each turn' }],
    repeatability: { rule: 'each trigger recreates the other trigger condition' },
    payoffCriteria: [{ resource: 'opponentLife', comparator: 'decreases until game-ending' }],
    examples: [{ name: 'Sanguine Bond + Exquisite Blood', cards: ['Sanguine Bond', 'Exquisite Blood'] }],
    negativeFixtures: [{ name: 'lifegain payoff without reciprocal loss', cards: ['Soul Warden', 'Sanguine Bond'], reason: 'no opponent-loss to life-gain converter' }],
    knownFalsePositives: ['one-way drain engines', 'once-per-turn lifegain triggers'],
    uiExplanation: 'Opponent life loss creates your life gain, and your life gain creates more opponent life loss.',
  },
  {
    id: 'library-exile-empty-library-win',
    title: 'Library exile plus empty-library win condition',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'source', kind: 'capability', predicate: 'is-library-exile-source' },
      { role: 'payoff', kind: 'capability', predicate: 'is-empty-library-win-payoff' },
    ],
    optionalAccelerants: [{ kind: 'resource', resource: 'devotion/library size manipulation' }],
    disqualifiers: [{ kind: 'scope', rule: 'impulse draw exiles only a bounded small number of cards' }],
    repeatability: { rule: 'not a loop; source must move enough library cards for payoff threshold' },
    payoffCriteria: [{ resource: 'library', comparator: '<= payoff look count' }],
    examples: [{ name: 'library exiling tutor + empty-library oracle', cards: ['Library Exiling Tutor', 'Empty Library Oracle'] }],
    negativeFixtures: [{ name: 'impulse draw + empty-library oracle', cards: ['Impulse Draw', 'Empty Library Oracle'], reason: 'not enough library exile pressure' }],
    knownFalsePositives: ['ordinary exile removal', 'small impulse draw effects'],
    uiExplanation: 'A source shrinks or exiles the library enough for a win condition that checks the remaining library size.',
  },
  {
    id: 'copy-etb-trigger-payoff',
    title: 'Copy effect plus ETB/trigger payoff',
    maxCards: 3,
    confidenceGate: 'heuristic',
    requiredFacts: [
      { role: 'copy', kind: 'anyCapability', predicates: ['is-permanent-copy', 'is-etb-spell-copier'] },
      { role: 'target', kind: 'anyCapability', predicates: ['has-etb', 'has-trigger'] },
    ],
    optionalAccelerants: [{ kind: 'capability', predicate: 'is-trigger-doubler' }],
    disqualifiers: [{ kind: 'scope', rule: 'spell copy cannot copy permanent ETB target' }],
    repeatability: { rule: 'requires repeatable copy source or looped target' },
    payoffCriteria: [{ event: 'trigger', comparator: 're-fired' }],
    examples: [{ name: 'permanent copy plus ETB target', cards: ['Copy Permanent', 'ETB Payoff'] }],
    negativeFixtures: [{ name: 'spell copy plus creature ETB', cards: ['Reverberate', 'Wall of Omens'], reason: 'wrong copy scope' }],
    knownFalsePositives: ['spell-copy text matched to permanent ETBs', 'one-shot copy treated as repeatable'],
    uiExplanation: 'A copy effect reuses a permanent or trigger only when its scope matches the target.',
  },
];

function byId() {
  return Object.fromEntries(COMBO_FAMILIES.map(family => [family.id, family]));
}

function getComboFamily(id) {
  return byId()[id] || null;
}

function validateComboFamilyLibrary(families = COMBO_FAMILIES) {
  const errors = [];
  const ids = new Set();
  for (const family of families) {
    if (!family.id) errors.push('family missing id');
    if (ids.has(family.id)) errors.push(`duplicate family id ${family.id}`);
    ids.add(family.id);
    for (const field of ['title', 'confidenceGate', 'requiredFacts', 'repeatability', 'payoffCriteria', 'examples', 'negativeFixtures', 'knownFalsePositives', 'uiExplanation']) {
      if (family[field] == null || (Array.isArray(family[field]) && family[field].length === 0)) errors.push(`${family.id} missing ${field}`);
    }
    if (!Number.isInteger(family.maxCards) || family.maxCards < 1 || family.maxCards > 3) errors.push(`${family.id} maxCards must be 1-3`);
    if (!['exact', 'pattern', 'heuristic'].includes(family.confidenceGate)) errors.push(`${family.id} invalid confidenceGate`);
    for (const fact of family.requiredFacts || []) {
      if (!fact.role || !fact.kind) errors.push(`${family.id} required fact missing role/kind`);
      if (!fact.predicate && !fact.predicates && !fact.event) errors.push(`${family.id} required fact missing predicate(s)/event`);
    }
    for (const fixture of [...(family.examples || []), ...(family.negativeFixtures || [])]) {
      if (!fixture.name || !Array.isArray(fixture.cards) || !fixture.cards.length) errors.push(`${family.id} fixture missing name/cards`);
      if ((fixture.cards || []).length > family.maxCards) errors.push(`${family.id} fixture ${fixture.name} exceeds maxCards`);
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  COMBO_FAMILIES,
  getComboFamily,
  validateComboFamilyLibrary,
};
