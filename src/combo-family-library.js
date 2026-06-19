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
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'engine', kind: 'capability', predicate: 'taps-for-mana' },
      { role: 'engine', kind: 'capability', predicate: 'is-self-untapper' },
    ],
    optionalAccelerants: [
      { kind: 'capability', predicate: 'mana-produced', note: 'larger mana output improves positive delta' },
      { kind: 'capability', predicate: 'is-colorless-mana-amplifier', note: 'static colorless-mana amplification can turn a break-even self-untapper positive' },
    ],
    disqualifiers: [{ kind: 'cost', rule: 'self-untap cost >= mana produced' }],
    repeatability: { rule: 'same card returns to untapped abstract state with positive mana delta' },
    payoffCriteria: [{ resource: 'mana', comparator: '>', threshold: 0 }],
    resultClasses: ['infinite-mana', 'infinite-untap'],
    examples: [{ name: 'synthetic self-untap dork', cards: ['Self Untap Dork'] }],
    negativeFixtures: [{ name: 'costed self-untapper', cards: ['Self Untap Dork'], reason: 'untap cost not below produced mana' }],
    knownFalsePositives: ['lands with ordinary untap clauses', 'costed untappers that only break even'],
    uiExplanation: 'Tap for mana, pay less mana to untap, and repeat from the same abstract state.',
  },
  {
    id: 'blink-etb-land-untap-loop',
    title: 'Repeatable blink plus ETB land untap',
    maxCards: 3,
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
    resultClasses: ['infinite-mana', 'infinite-etb', 'infinite-untap'],
    examples: [{ name: 'Deadeye Navigator + Peregrine Drake', cards: ['Deadeye Navigator', 'Peregrine Drake'] }],
    negativeFixtures: [{ name: 'Ephemerate + Peregrine Drake', cards: ['Ephemerate', 'Peregrine Drake'], reason: 'blink is one-shot' }],
    knownFalsePositives: ['one-shot blink spells', 'ETB untappers that untap too few lands for the blink cost'],
    uiExplanation: 'A repeatable blink engine resets a land-untap ETB creature; the loop is valid only when the blink can be paid again.',
  },
  {
    id: 'mutual-etb-blink-reset-loop',
    title: 'Mutual ETB blink reset loop',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'firstBlinker', kind: 'capability', predicate: 'is-etb-blink' },
      { role: 'secondBlinker', kind: 'capability', predicate: 'is-etb-blink' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'ETB payoff', note: 'other permanents may profit from the repeated ETB/LTB cycle' }],
    disqualifiers: [
      { kind: 'capability', predicate: 'is-blink', without: 'is-etb-blink' },
      { kind: 'target-legality', rule: 'creature-scoped blink must target a card whose ETB-blink capability and creature type are available on the same compatible face' },
    ],
    repeatability: { rule: 'each permanent enters and blinks the other, causing the other ETB to re-fire and restore the pair' },
    payoffCriteria: [{ event: 'etb', comparator: 'repeats' }, { event: 'ltb', comparator: 'repeats' }],
    resultClasses: ['infinite-etb', 'infinite-ltb'],
    examples: [{ name: 'two ETB blink creatures', cards: ['ETB Creature Blinker', 'ETB Permanent Blinker'] }],
    negativeFixtures: [{ name: 'one-shot blink plus ETB blinker', cards: ['One-Shot Blink', 'ETB Creature Blinker'], reason: 'spell blink is not restored as a permanent ETB source' }],
    knownFalsePositives: ['one-shot blink spells', 'ETB blink text that cannot target the partner permanent type'],
    uiExplanation: 'Two ETB blink permanents can reset each other when each trigger can legally target the other permanent type.',
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
    resultClasses: ['infinite-death', 'infinite-ltb', 'infinite-sacrifice'],
    proofDeltaResultClasses: ['infinite-draw', 'infinite-life', 'infinite-opponent-life-loss', 'infinite-tokens'],
    examples: [{ name: 'token body + outlet + death-drain payoff', cards: ['Token Source', 'Sac Outlet', 'Death Payoff'] }],
    negativeFixtures: [{ name: 'single free body + outlet + payoff', cards: ['Free Body', 'Sac Outlet', 'Death Payoff'], reason: 'body not replenished' }],
    knownFalsePositives: ['ordinary creatures counted as infinite fodder', 'noncreature token creation feeding creature-death payoffs'],
    uiExplanation: 'The body creates the death event, the outlet controls timing, and the payoff consumes the death trigger.',
  },
  {
    id: 'recursive-body-sacrifice-mana-loop',
    title: 'Recursive body plus mana sacrifice outlet',
    maxCards: 3,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'body', kind: 'capability', predicate: 'is-recursive-body' },
      { role: 'body', kind: 'capability', predicate: 'recursive-body-cost' },
      { role: 'outlet', kind: 'capability', predicate: 'is-mana-sac-outlet' },
      { role: 'outlet', kind: 'capability', predicate: 'sac-outlet-mana-produced' },
    ],
    optionalAccelerants: [
      { kind: 'capability', predicate: 'is-creature-sac-outlet', note: 'creature-scoped outlets match recursive creature bodies cleanly' },
      { kind: 'capability', predicate: 'is-death-mana-payoff', note: 'death-triggered Treasure or similar mana can satisfy colored recursion costs in layered three-card loops' },
      { kind: 'capability', predicate: 'recursive-body-requires-another-creature', note: 'requires another local creature permanent to satisfy recursion permission' },
    ],
    disqualifiers: [
      { kind: 'cost', rule: 'sacrifice outlet mana produced < recursive body cost' },
      { kind: 'precondition', rule: 'recursive permission clauses such as "another creature" must be satisfied by package-local support on a compatible face; a DFC outlet cannot borrow creature type from a mutually exclusive face' },
    ],
    repeatability: { rule: 'sacrifice the body for mana, spend that mana to recast or return the same body, and restore the starting state' },
    payoffCriteria: [{ event: 'death', comparator: 'repeats' }, { event: 'cast/etb', comparator: 'repeats' }],
    resultClasses: ['infinite-death', 'infinite-etb', 'infinite-ltb', 'infinite-sacrifice'],
    proofDeltaResultClasses: ['infinite-cast', 'infinite-mana'],
    examples: [
      { name: 'recursive creature + mana sacrifice outlet', cards: ['Recursive Body', 'Mana Sac Outlet'] },
      { name: 'recursive creature + colorless sacrifice outlet + death-mana payoff', cards: ['Recursive Body', 'Colorless Mana Sac Outlet', 'Death Mana Payoff'] },
    ],
    negativeFixtures: [
      { name: 'expensive or colored recursive body + insufficient outlet mana', cards: ['Expensive Recursive Body', 'Mana Sac Outlet'], reason: 'package mana cannot cover the recursion cost' },
      { name: 'conditional recursive body + noncreature outlet only', cards: ['Conditional Recursive Body', 'Mana Sac Outlet'], reason: 'another-creature recursion permission is not satisfied' },
    ],
    knownFalsePositives: ['ordinary bodies treated as replenished fodder', 'sacrifice outlets that create no mana or too little mana', 'assuming external colored mana instead of proving package-local mana', 'assuming another-creature recursion permission without proving a remaining creature'],
    uiExplanation: 'A recursive creature can be sacrificed for mana and then replayed or returned when the package covers the recursion cost.',
  },
  {
    id: 'life-paid-treasure-recursive-drain-loop',
    title: 'Recursive cast body plus life-paid Treasure sacrifice outlet and death drain',
    maxCards: 3,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'body', kind: 'capability', predicate: 'is-recursive-cast-body' },
      { role: 'body', kind: 'capability', predicate: 'recursive-body-cost' },
      { role: 'outlet', kind: 'capability', predicate: 'is-life-paid-treasure-sac-outlet' },
      { role: 'outlet', kind: 'capability', predicate: 'life-sac-outlet-mana-produced' },
      { role: 'payoff', kind: 'capability', predicate: 'is-death-drain-payoff' },
    ],
    optionalAccelerants: [{ kind: 'precondition', predicate: 'controls-type', note: 'recursive cast permission such as “control a type” must be package-local' }],
    disqualifiers: [
      { kind: 'cost', rule: 'Treasure mana cannot cover the recursive cast cost' },
      { kind: 'life', rule: 'outlet life payment is not restored by a local death-drain lifegain payoff' },
    ],
    repeatability: { rule: 'sacrifice the recursive body for a Treasure while paying life, death-drain restores the life, and the Treasure recasts the body' },
    payoffCriteria: [{ event: 'death', comparator: 'repeats' }, { event: 'cast/etb', comparator: 'repeats' }, { resource: 'life', comparator: '>=', threshold: 0 }],
    resultClasses: ['infinite-cast', 'infinite-death', 'infinite-etb', 'infinite-ltb', 'infinite-opponent-life-loss', 'infinite-sacrifice'],
    examples: [{ name: 'recursive cast creature + life-paid Treasure outlet + death-drain payoff', cards: ['Recursive Body', 'Life-Paid Treasure Outlet', 'Death Drain Payoff'] }],
    negativeFixtures: [
      { name: 'life-paid outlet without death-drain lifegain', cards: ['Recursive Body', 'Life-Paid Treasure Outlet'], reason: 'life payment is not replenished' },
      { name: 'multi-life Treasure outlet with one-point death drain', cards: ['Recursive Body', 'Multi-Life Treasure Outlet', 'Death Drain Payoff'], reason: 'lifegain amount is not proven to replenish the outlet cost' },
    ],
    knownFalsePositives: ['treating life-paid Treasure outlets as free mana outlets', 'ignoring type-control recursion permissions'],
    uiExplanation: 'The outlet converts the recursive body into Treasure at a life cost; the death-drain payoff restores that life while the Treasure recasts the body.',
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
    resultClasses: ['infinite-tokens'],
    examples: [{ name: 'Raise the Alarm + Anointed Procession + token payoff', cards: ['Raise the Alarm', 'Token Doubler', 'Token Payoff'] }],
    negativeFixtures: [{ name: 'Smothering Tithe reminder token text', cards: ['Smothering Tithe', 'Academy Manufactor'], reason: 'should not imply treasure/mana overreach' }],
    knownFalsePositives: ['reminder text for artifact tokens', 'replacement effects treated as token producers without an actual source'],
    uiExplanation: 'A token event is modified before token-matter payoffs inspect it.',
  },
  {
    id: 'token-replacement-sacrifice-mana-loop',
    title: 'Token replacement plus sacrifice/death mana loop',
    maxCards: 3,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'replacer', kind: 'capability', predicate: 'is-token-to-creature-token-replacer' },
      { role: 'outlet', kind: 'capability', predicate: 'is-creature-sac-outlet' },
      { role: 'payoff', kind: 'capability', predicate: 'is-death-mana-payoff' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'initial creature token', note: 'one seed creature token starts the self-replacing cycle' }],
    disqualifiers: [{ kind: 'repeatability', rule: 'token replacement does not create creature fodder, or the outlet cannot sacrifice that fodder' }],
    repeatability: { rule: 'sacrificed creature token creates a mana token; the replacement effect creates replacement creature fodder with that token' },
    payoffCriteria: [{ event: 'death', comparator: 'repeats' }, { resource: 'mana', comparator: '>=', threshold: 0 }],
    resultClasses: ['infinite-death', 'infinite-ltb', 'infinite-sacrifice', 'infinite-tokens'],
    proofDeltaResultClasses: ['infinite-mana'],
    examples: [{ name: 'creature-token replacement outlet plus death Treasure payoff', cards: ['Token Creature Replacer Outlet', 'Death Mana Payoff'] }],
    negativeFixtures: [{ name: 'token replacer without sacrifice outlet', cards: ['Token Creature Replacer', 'Death Mana Payoff'], reason: 'no local way to sacrifice the replacement creature token' }],
    knownFalsePositives: ['token doublers treated as token sources', 'noncreature token replacement treated as creature fodder'],
    uiExplanation: 'A death-mana payoff creates a token, a replacement effect adds creature fodder to that token event, and a sacrifice outlet repeats the death.',
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
    resultClasses: ['infinite-draw', 'infinite-cast'],
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
    resultClasses: ['infinite-life', 'infinite-opponent-life-loss'],
    examples: [{ name: 'Sanguine Bond + Exquisite Blood', cards: ['Sanguine Bond', 'Exquisite Blood'] }],
    negativeFixtures: [{ name: 'lifegain payoff without reciprocal loss', cards: ['Soul Warden', 'Sanguine Bond'], reason: 'no opponent-loss to life-gain converter' }],
    knownFalsePositives: ['one-way drain engines', 'once-per-turn lifegain triggers'],
    uiExplanation: 'Opponent life loss creates your life gain, and your life gain creates more opponent life loss.',
  },
  {
    id: 'mill-lifeloss-feedback-loop',
    title: 'Reciprocal mill and life-loss loop',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'millToLoss', kind: 'capability', predicate: 'is-mill-to-lifeloss-payoff' },
      { role: 'lossToMill', kind: 'capability', predicate: 'is-lifeloss-to-mill-payoff' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'initial mill or life loss', note: 'a seed event starts the deterministic feedback cycle' }],
    disqualifiers: [{ kind: 'scope', rule: 'mill/life-loss trigger is once each turn or aimed at the wrong player' }],
    repeatability: { rule: 'mill puts cards into an opponent graveyard, causing life loss; that life loss mills the same player again' },
    payoffCriteria: [{ event: 'mill', comparator: 'repeats' }, { resource: 'opponentLife', comparator: 'decreases' }],
    resultClasses: ['mill', 'infinite-opponent-life-loss', 'infinite-life'],
    examples: [{ name: 'opponent graveyard drain plus life-loss miller', cards: ['Mill To Loss Payoff', 'Life Loss To Mill Payoff'] }],
    negativeFixtures: [{ name: 'one-way mill drain', cards: ['Mill To Loss Payoff'], reason: 'missing life-loss-to-mill converter' }],
    knownFalsePositives: ['graveyard-size payoffs without a mill trigger', 'one-shot mill plus unrelated drain'],
    uiExplanation: 'A graveyard/mill trigger drains the opponent, and that life loss mills the opponent again.',
  },
  {
    id: 'draw-damage-feedback-loop',
    title: 'Reciprocal draw and damage loop',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'drawToDamage', kind: 'capability', predicate: 'is-draw-to-damage-payoff' },
      { role: 'damageToDraw', kind: 'capability', predicate: 'is-damage-to-draw-payoff' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'initial draw or damage', note: 'a seed event starts the deterministic feedback cycle' }],
    disqualifiers: [{ kind: 'scope', rule: 'damage-to-draw trigger does not apply to the damage source' }],
    repeatability: { rule: 'drawing causes damage; the damage causes a draw; the new draw restarts the same trigger pair' },
    payoffCriteria: [{ resource: 'cards', comparator: '+', threshold: 1 }, { resource: 'damage', comparator: '+', threshold: 1 }],
    resultClasses: ['infinite-damage', 'infinite-draw'],
    examples: [{ name: 'draw-damage engine + damage-draw aura', cards: ['Draw Damage Engine', 'Damage Draw Aura'] }],
    negativeFixtures: [{ name: 'one-way draw punisher', cards: ['Draw Damage Engine'], reason: 'missing damage-to-draw converter' }],
    knownFalsePositives: ['draw triggers that only drain life without damage', 'damage-to-draw triggers scoped to a different source'],
    uiExplanation: 'A draw-triggered damage source and a damage-triggered draw effect can feed each other after any legal seed draw or damage.',
  },
  {
    id: 'lifelink-counter-damage-loop',
    title: 'Lifelink counter-damage feedback loop',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'engine', kind: 'capability', predicate: 'is-lifelink-counter-engine' },
      { role: 'source', kind: 'capability', predicate: 'is-counter-to-damage-source' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'initial +1/+1 counter', note: 'one counter starts the deterministic feedback cycle' }],
    disqualifiers: [
      { kind: 'target-legality', rule: 'lifelink grant and lifegain counter trigger must be able to target the counter-removing damage creature' },
      { kind: 'cost', rule: 'damage source must spend and then regain a +1/+1 counter each loop' },
    ],
    repeatability: { rule: 'grant lifelink, remove a +1/+1 counter for damage, lifelink causes life gain, life gain replaces the counter' },
    payoffCriteria: [{ resource: 'damage', comparator: '+', threshold: 1 }, { resource: 'life', comparator: '+', threshold: 1 }],
    resultClasses: ['infinite-damage', 'infinite-life'],
    examples: [{ name: 'lifelink/counter engine + counter damage creature', cards: ['Lifelink Counter Engine', 'Counter Damage Creature'] }],
    negativeFixtures: [{ name: 'counter damage artifact without creature type', cards: ['Lifelink Counter Engine', 'Counter Damage Artifact'], reason: 'lifelink grant cannot target it as a creature' }],
    knownFalsePositives: ['lifegain counter payoffs that cannot target the damage source', 'counter damage sources without a replenished +1/+1 counter'],
    uiExplanation: 'A lifelink grant turns counter-fueled damage into life gain, and the lifegain trigger restores the spent counter.',
  },
  {
    id: 'opponent-draw-punisher-win',
    title: 'Opponent mass-draw punisher win',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'drawSource', kind: 'capability', predicate: 'is-mass-opponent-draw-source' },
      { role: 'punisher', kind: 'capability', predicate: 'is-opponent-draw-punisher' },
    ],
    optionalAccelerants: [{ kind: 'resource', resource: 'opponent life total', note: 'threshold proof assumes the mass draw is aimed at an opponent or all players' }],
    disqualifiers: [{ kind: 'scope', rule: 'punisher reacts only to your draws, or draw source is too small/bounded' }],
    repeatability: { rule: 'not a loop; a mass opponent draw creates enough repeated draw-trigger punishments to be lethal under threshold assumptions' },
    payoffCriteria: [{ resource: 'winCondition', comparator: 'threshold', threshold: 1 }],
    resultClasses: ['win'],
    examples: [{ name: 'target opponent mass draw plus opponent draw punisher', cards: ['Opponent Mass Draw', 'Opponent Draw Punisher'] }],
    negativeFixtures: [{ name: 'small draw plus opponent draw punisher', cards: ['Small Opponent Draw', 'Opponent Draw Punisher'], reason: 'draw count is not enough for threshold win proof' }],
    knownFalsePositives: ['punishers scoped to your draws', 'small cantrip-style opponent draw effects'],
    uiExplanation: 'A large opponent-draw effect can be a threshold win when paired with a punisher that triggers for each opponent draw.',
  },
  {
    id: 'mill-multiplier-finite-mill',
    title: 'Mill multiplier plus half-library mill',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'millSource', kind: 'capability', predicate: 'is-half-library-mill-source' },
      { role: 'multiplier', kind: 'capability', predicate: 'is-mill-multiplier' },
    ],
    optionalAccelerants: [{ kind: 'resource', resource: 'opponent library size', note: 'threshold proof depends on the half-library rounding clause' }],
    disqualifiers: [{ kind: 'scope', rule: 'mill source is a small fixed count rather than half the library' }],
    repeatability: { rule: 'not a loop; doubled half-library mill empties the affected library under the rounded-up threshold' },
    payoffCriteria: [{ event: 'mill', comparator: 'threshold' }],
    resultClasses: ['mill'],
    examples: [{ name: 'half-library mill plus mill doubler', cards: ['Half Library Mill', 'Mill Doubler'] }],
    negativeFixtures: [{ name: 'small mill plus mill doubler', cards: ['Small Mill', 'Mill Doubler'], reason: 'doubling a small mill does not prove a library-empty threshold' }],
    knownFalsePositives: ['generic graveyard-size payoffs', 'small fixed-count mill effects with a multiplier'],
    uiExplanation: 'A mill replacement effect doubles a half-library mill effect, creating a finite library-empty threshold package.',
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
    resultClasses: ['win', 'empty-library'],
    examples: [{ name: 'library exiling tutor + empty-library oracle', cards: ['Library Exiling Tutor', 'Empty Library Oracle'] }],
    negativeFixtures: [{ name: 'impulse draw + empty-library oracle', cards: ['Impulse Draw', 'Empty Library Oracle'], reason: 'not enough library exile pressure' }],
    knownFalsePositives: ['ordinary exile removal', 'small impulse draw effects'],
    uiExplanation: 'A source shrinks or exiles the library enough for a win condition that checks the remaining library size.',
  },
  {
    id: 'imprint-untap-spell-loop',
    title: 'Repeatable cheap instant caster plus nonland untap spell',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'untapSpell', kind: 'capability', predicate: 'is-cheap-instant-nonland-permanent-untap-spell' },
      { role: 'caster', kind: 'capability', predicate: 'is-repeatable-cheap-instant-caster' },
    ],
    optionalAccelerants: [{ kind: 'resource', resource: 'nonland permanent mana', note: 'mana positivity depends on available nonland mana sources' }],
    disqualifiers: [{ kind: 'scope', rule: 'instant must be cheap enough for the repeatable caster' }],
    repeatability: { rule: 'the copied untap spell restores the repeatable caster and other nonland permanents' },
    payoffCriteria: [{ event: 'spell-copy/cast', comparator: 'repeats' }, { event: 'untap', comparator: 'repeats' }],
    resultClasses: ['infinite-mana', 'infinite-untap', 'infinite-cast'],
    examples: [{ name: 'repeatable instant caster + nonland untap spell', cards: ['Repeatable Instant Caster', 'Nonland Untap Spell'] }],
    negativeFixtures: [{ name: 'repeatable caster + expensive untap spell', cards: ['Repeatable Instant Caster', 'Expensive Untap Spell'], reason: 'untap spell is not cheap enough to be repeatably cast' }],
    knownFalsePositives: ['one-shot spell copying', 'untap spells that do not untap the repeatable caster'],
    uiExplanation: 'A repeatable cheap-instant caster reuses an untap spell that restores nonland permanents, including the caster.',
  },
  {
    id: 'self-untap-mana→ability-copy-loop',
    title: 'Self-untap mana ability plus activated ability copier',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'copier', kind: 'capability', predicate: 'is-activated-ability-copier' },
      { role: 'engine', kind: 'capability', predicate: 'is-self-untapper' },
      { role: 'engine', kind: 'capability', predicate: 'taps-for-mana' },
    ],
    optionalAccelerants: [{ kind: 'capability', predicate: 'ability-copy-cost' }, { kind: 'capability', predicate: 'mana-produced' }],
    disqualifiers: [{ kind: 'cost', rule: 'mana produced must cover untap cost and exceed copy cost' }],
    repeatability: { rule: 'copying the self-untap ability creates an extra tap window before the original untap resolves' },
    payoffCriteria: [{ resource: 'mana', comparator: '>', threshold: 0 }],
    resultClasses: ['infinite-mana', 'infinite-untap'],
    examples: [{ name: 'self-untapping mana rock + ability copier', cards: ['Self Untap Mana Rock', 'Ability Copier'] }],
    negativeFixtures: [{ name: 'low-output self-untapper + ability copier', cards: ['Low Output Self Untapper', 'Ability Copier'], reason: 'copy cost consumes the extra mana window' }],
    knownFalsePositives: ['ability copiers that cannot copy mana abilities directly', 'self-untappers whose output does not beat copy cost'],
    uiExplanation: 'The copier duplicates a nonmana self-untap ability, creating an extra tap-for-mana window each loop.',
  },
  {
    id: 'hasty-copy→etb-untap-loop',
    title: 'Repeatable hasty copy plus ETB permanent untap',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'copyEngine', kind: 'capability', predicate: 'is-repeatable-hasty-creature-copy' },
      { role: 'untapper', kind: 'capability', predicate: 'etb-untaps-permanent' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'ETB payoff' }],
    disqualifiers: [{ kind: 'scope', rule: 'copy target restrictions must be able to copy the ETB untapper, including nonlegendary clauses' }],
    repeatability: { rule: 'each hasty token copy untaps the copy engine so it can activate again' },
    payoffCriteria: [{ event: 'etb', comparator: 'repeats' }, { resource: 'tokens', comparator: '+', threshold: 1 }],
    resultClasses: ['infinite-etb', 'infinite-ltb', 'infinite-tokens', 'infinite-untap'],
    examples: [{ name: 'hasty copy engine + ETB untapper', cards: ['Hasty Copy Engine', 'Permanent Untapper'] }],
    negativeFixtures: [
      { name: 'hasty copy engine + land-only untapper', cards: ['Hasty Copy Engine', 'Land Untapper'], reason: 'land-only untap cannot reset the copy engine' },
      { name: 'nonlegendary-copy engine + legendary ETB untapper', cards: ['Hasty Copy Engine', 'Legendary Untapper'], reason: 'copy target restriction is illegal' },
    ],
    knownFalsePositives: ['one-shot creature copies', 'ETB untap effects scoped away from the copy engine', 'nonlegendary copy restrictions applied to legendary ETB untappers'],
    uiExplanation: 'A hasty token copy enters, untaps the repeatable copy engine, and allows the copy action to repeat.',
  },
  {
    id: 'spell-copy-etb→creature-copy-spell-loop',
    title: 'ETB spell copier plus hasty creature-copy spell',
    maxCards: 2,
    confidenceGate: 'pattern',
    requiredFacts: [
      { role: 'spellCopier', kind: 'capability', predicate: 'is-etb-spell-copier' },
      { role: 'copySpell', kind: 'capability', predicate: 'is-hasty-creature-copy-spell' },
    ],
    optionalAccelerants: [{ kind: 'event', event: 'magecraft/copy payoff' }],
    disqualifiers: [{ kind: 'stack', rule: 'copy spell must still be on the stack with a legal creature target that is the ETB spell copier' }],
    repeatability: { rule: 'each copied creature-copy spell creates another ETB spell copier token' },
    payoffCriteria: [{ event: 'etb', comparator: 'repeats' }, { event: 'spell-copy', comparator: 'repeats' }],
    resultClasses: ['infinite-cast', 'infinite-etb', 'infinite-ltb'],
    proofDeltaResultClasses: ['infinite-tokens'],
    examples: [{ name: 'ETB spell copier + hasty creature-copy spell', cards: ['ETB Spell Copier', 'Hasty Creature Copy Spell'] }],
    negativeFixtures: [{ name: 'ETB spell copier + noncreature copy spell', cards: ['ETB Spell Copier', 'Artifact Copy Spell'], reason: 'copy spell does not recreate the spell-copying creature' }],
    knownFalsePositives: ['spell copy effects matched to permanent-only copies', 'copy spells that do not grant haste or fail to copy the spell copier', 'noncreature ETB spell copiers treated as legal creature-copy targets'],
    uiExplanation: 'The creature-copy spell creates a spell-copying ETB token that copies the same spell and recreates the state.',
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
    if (family.resultClasses != null && (!Array.isArray(family.resultClasses) || family.resultClasses.some(cls => typeof cls !== 'string' || !cls))) {
      errors.push(`${family.id} resultClasses must be non-empty strings when present`);
    }
    if (family.proofDeltaResultClasses != null && (!Array.isArray(family.proofDeltaResultClasses) || family.proofDeltaResultClasses.some(cls => typeof cls !== 'string' || !cls))) {
      errors.push(`${family.id} proofDeltaResultClasses must be non-empty strings when present`);
    }
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
