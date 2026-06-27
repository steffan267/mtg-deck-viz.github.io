/*
 * Canonical interaction/combo domain vocabulary.
 *
 * Keep this module runtime-safe for Node CommonJS scripts and browser bundling.
 * TypeScript declarations live next to it in interaction-constants.d.ts.
 * New engine code should reference these constants instead of repeating important
 * domain strings inline.
 */

function freeze(values) {
  return Object.freeze(values);
}

const ComboFamilyId = freeze({
  SelfUntapManaLoop: 'self-untap-mana-loop',
  VariableBoardCountManaLoop: 'variable-board-count-mana-loop',
  BlinkEtbLandUntapLoop: 'blink-etb-land-untap-loop',
  BlinkSpellRecursionLandUntapLoop: 'blink-spell-recursion-land-untap-loop',
  BlinkSpellRecursionManaArtifactLoop: 'blink-spell-recursion-mana-artifact-loop',
  FoodSacrificeTokenFeedbackLoop: 'food-sacrifice-token-feedback-loop',
  MutualEtbBlinkResetLoop: 'mutual-etb-blink-reset-loop',
  AristocratsBodyOutletPayoff: 'aristocrats-body-outlet-payoff',
  RecursiveBodySacrificeManaLoop: 'recursive-body-sacrifice-mana-loop',
  LifePaidTreasureRecursiveDrainLoop: 'life-paid-treasure-recursive-drain-loop',
  TokenSourceModifierPayoff: 'token-source-modifier-payoff',
  TokenReplacementSacrificeManaLoop: 'token-replacement-sacrifice-mana-loop',
  KodamaBounceLandLandfallLoop: 'kodama-bounce-land-landfall-loop',
  CostReducerActivatedOutputPayoff: 'cost-reducer-activated-output-payoff',
  ArtifactTopCostReductionLoop: 'artifact-top-cost-reduction-loop',
  LifegainLifelossLoop: 'lifegain-lifeloss-loop',
  MillLifelossFeedbackLoop: 'mill-lifeloss-feedback-loop',
  DrawDamageFeedbackLoop: 'draw-damage-feedback-loop',
  SelfCopySpellMagecraftDrainLoop: 'self-copy-spell→magecraft-drain-loop',
  EscapeWheelManaLoop: 'escape-wheel-mana-loop',
  EscapeMillManaLoop: 'escape-mill-mana-loop',
  BuybackCopyRitualLoop: 'buyback-copy-ritual-loop',
  LifelinkCounterDamageLoop: 'lifelink-counter-damage-loop',
  CounterTokenEtbCounterLoop: 'counter-token→etb-counter-loop',
  MinusCounterDeathTokenLoop: 'minus-counter-death→token-loop',
  LifegainCounterTokenEtbLoop: 'lifegain-counter-token-etb-loop',
  DeathUntapDeathtouchPingerLock: 'death-untap-deathtouch-pinger-lock',
  ForcedCastCastLock: 'forced-cast→cast-lock',
  CounterSuppressionPreventionLock: 'counter-suppression→prevention-lock',
  CounterSuppressionDepletionLock: 'counter-suppression→depletion-lock',
  CounterSuppressionPoisonLossLock: 'counter-suppression→poison-loss-lock',
  CounterSuppressionCumulativeUpkeepPreventionLock: 'counter-suppression→cumulative-upkeep-prevention-lock',
  FaceUpUntapSkipFaceDownResetLock: 'face-up-untap-skip→face-down-reset-lock',
  NoFlyingAttackFlyingRemovalLock: 'no-flying-attack→flying-removal-lock',
  FlyingOnlyAttackGroundLock: 'flying-only-attack→ground-lock',
  FlyingOrIslandwalkAttackEvasionRemovalLock: 'flying-or-islandwalk-attack→evasion-removal-lock',
  DrawStepHandCycleDrawLimitLock: 'draw-step-hand-cycle→draw-limit-lock',
  NoDrawSearchStepSearchLock: 'no-draw-search-step→search-lock',
  PreventionLandGraveyardExtraLandLock: 'prevention-land→graveyard-extra-land-lock',
  AllPermanentsArtifactsArtifactActivationLock: 'all-permanents-artifacts→artifact-activation-lock',
  AllLandsIslandsIslandUntapLock: 'all-lands-islands→island-untap-lock',
  GlobalUntapSkipUpkeepSkipLock: 'global-untap-skip→upkeep-skip-lock',
  GlobalUntapSkipEndStepUntapLock: 'global-untap-skip→end-step-untap-lock',
  GlobalUntapSkipUpkeepUntapLandLock: 'global-untap-skip→upkeep-untap-land-lock',
  GlobalUntapSkipSelfBounceLock: 'global-untap-skip→self-bounce-lock',
  CastProtectionSelfBounceLock: 'cast-protection→self-bounce-lock',
  CastProtectionGraveyardRecastLock: 'cast-protection→graveyard-recast-lock',
  LifePaidDamageLifelossRecoveryLoop: 'life-paid-damage-lifeloss-recovery-loop',
  ExileRecastCreatureManaLoop: 'exile-recast-creature-mana-loop',
  OpponentDrawPunisherWin: 'opponent-draw-punisher-win',
  MillMultiplierFiniteMill: 'mill-multiplier-finite-mill',
  DelayedMillEqualizerFiniteMill: 'delayed-mill-equalizer-finite-mill',
  LibraryExileEmptyLibraryWin: 'library-exile-empty-library-win',
  ImprintUntapSpellLoop: 'imprint-untap-spell-loop',
  TapFreeCastUntapEngine: 'tap-free-cast→untap-engine',
  SelfUntapManaAbilityCopyLoop: 'self-untap-mana→ability-copy-loop',
  HastyCopyEtbUntapLoop: 'hasty-copy→etb-untap-loop',
  CombatCopyTokenExtraCombatLoop: 'combat-copy-token→extra-combat-loop',
  HastyCopyAttackExtraCombatLoop: 'hasty-copy→attack-extra-combat-loop',
  CombatCopyTokenConnectExtraCombatLoop: 'combat-copy-token→connect-extra-combat-loop',
  HastyCopyConnectExtraCombatLoop: 'hasty-copy→connect-extra-combat-loop',
  CombatCopyTokenAttackExtraTurnLoop: 'combat-copy-token→attack-extra-turn-loop',
  CombatCopyTokenConnectExtraTurnLoop: 'combat-copy-token→connect-extra-turn-loop',
  HastyCopyAttackExtraTurnLoop: 'hasty-copy→attack-extra-turn-loop',
  HastyCopyConnectExtraTurnLoop: 'hasty-copy→connect-extra-turn-loop',
  CombatSacrificeAuraExtraCombatLoop: 'combat-sacrifice-aura→extra-combat-loop',
  CombatResourceExtraCombatLoop: 'combat-resource→extra-combat-loop',
  ArtifactTokenExtraTurnLoop: 'artifact-token→extra-turn-loop',
  CounterThresholdDoublerExtraTurnLoop: 'counter-threshold-doubler→extra-turn-loop',
  CounterThresholdProliferateExtraTurnLoop: 'counter-threshold-proliferate→extra-turn-loop',
  SpellCopyEtbCreatureCopySpellLoop: 'spell-copy-etb→creature-copy-spell-loop',
  DeathCopySpellEtbCopyLoop: 'death-copy-spell-etb-copy-loop',
  CopyEtbTriggerPayoff: 'copy-etb-trigger-payoff',
});

const ResultClass = freeze({
  Combat: 'combat',
  EmptyLibrary: 'empty-library',
  InfiniteCast: 'infinite-cast',
  InfiniteCounters: 'infinite-counters',
  InfiniteDamage: 'infinite-damage',
  InfiniteDeath: 'infinite-death',
  InfiniteDraw: 'infinite-draw',
  InfiniteBlink: 'infinite-blink',
  InfiniteEtb: 'infinite-etb',
  InfiniteLandfall: 'infinite-landfall',
  InfiniteLife: 'infinite-life',
  InfiniteLooting: 'infinite-looting',
  InfiniteLtb: 'infinite-ltb',
  InfiniteMana: 'infinite-mana',
  InfiniteOpponentLifeLoss: 'infinite-opponent-life-loss',
  InfinitePump: 'infinite-pump',
  InfiniteSacrifice: 'infinite-sacrifice',
  InfiniteSelfDiscard: 'infinite-self-discard',
  InfiniteTokens: 'infinite-tokens',
  InfiniteTurns: 'infinite-turns',
  InfiniteUntap: 'infinite-untap',
  Lock: 'lock',
  Mill: 'mill',
  Win: 'win',
});

const ConfidenceGate = freeze({
  Exact: 'exact',
  Pattern: 'pattern',
  Heuristic: 'heuristic',
});

const ProofStatus = freeze({
  Proven: 'proven',
  NotRepeatable: 'not-repeatable',
  BoundedOut: 'bounded-out',
  NoProof: 'no-proof',
});

const RepeatabilityStatus = freeze({
  Repeatable: 'repeatable',
  RepeatableThreshold: 'repeatable-threshold',
  RepeatableCombatThreshold: 'repeatable-combat-threshold',
  RepeatableCombatCarrier: 'repeatable-combat-carrier',
  RepeatableTurnCycleThreshold: 'repeatable-turn-cycle-threshold',
  RepeatableTurnThreshold: 'repeatable-turn-threshold',
  RepeatableCandidate: 'repeatable-candidate',
  RepeatableBreakEven: 'repeatable-break-even',
  RepeatableLock: 'repeatable-lock',
  RepeatableCombatFreshToken: 'repeatable-combat-fresh-token',
  RepeatableCombatConnectFreshToken: 'repeatable-combat-connect-fresh-token',
  NonLoopWin: 'non-loop-win',
  NonLoopThreshold: 'non-loop-threshold',
  ValueEngine: 'value-engine',
  Candidate: 'candidate',
  CandidateRepeatable: 'candidate-repeatable',
});

const FactKind = freeze({
  Capability: 'capability',
  AnyCapability: 'anyCapability',
  EventConsumes: 'event.consumes',
  EventProduces: 'event.produces',
  Precondition: 'precondition',
  Resource: 'resource',
  Event: 'event',
  Cost: 'cost',
  Threshold: 'threshold',
  TargetLegality: 'target-legality',
  Repeatability: 'repeatability',
});

const ComboRole = freeze({
  Engine: 'engine',
  Source: 'source',
  Threshold: 'threshold',
  Blink: 'blink',
  Untapper: 'untapper',
  FirstBlinker: 'firstBlinker',
  SecondBlinker: 'secondBlinker',
  Body: 'body',
  Outlet: 'outlet',
  Payoff: 'payoff',
  Modifier: 'modifier',
  Replacer: 'replacer',
  Dropper: 'dropper',
  Land: 'land',
  Reducer: 'reducer',
  Ability: 'ability',
  TopPiece: 'topPiece',
  Caster: 'caster',
  LossToGain: 'lossToGain',
  GainToLoss: 'gainToLoss',
  DrawToDamage: 'drawToDamage',
  DamageToDraw: 'damageToDraw',
  CopySpell: 'copySpell',
  Ritual: 'ritual',
  Lockpiece: 'lockpiece',
  Support: 'support',
  Shield: 'shield',
  Suppression: 'suppression',
  Recursion: 'recursion',
  Recovery: 'recovery',
});

const ComboResource = freeze({
  Mana: 'mana',
  Untap: 'untap',
  Blink: 'blink',
  Lifegain: 'lifegain',
  Lifeloss: 'lifeloss',
  Damage: 'damage',
  Draw: 'draw',
  Cards: 'cards',
  Tokens: 'tokens',
  Life: 'life',
  OpponentLife: 'opponentLife',
  Counters: 'counters',
  Turns: 'turns',
  Combat: 'combat',
  Lands: 'lands',
});

const SemanticEvent = freeze({
  Etb: 'etb',
  Ltb: 'ltb',
  Death: 'death',
  Cast: 'cast',
  Tap: 'tap',
  Untap: 'untap',
  Sacrifice: 'sacrifice',
  Draw: 'draw',
  Damage: 'damage',
  Lifegain: 'lifegain',
  Lifeloss: 'lifeloss',
  Tokens: 'tokens',
  Landfall: 'landfall',
  Mill: 'mill',
  Discard: 'discard',
  Combat: 'combat',
  ExtraTurn: 'extraTurn',
});

const Capability = freeze({
  TapsForMana: 'taps-for-mana',
  IsSelfUntapper: 'is-self-untapper',
  ManaProduced: 'mana-produced',
  SelfUntapCost: 'self-untap-cost',
  IsRepeatableBlink: 'is-repeatable-blink',
  BlinkCost: 'blink-cost',
  IsMultiTargetBlinkSpell: 'is-multi-target-blink-spell',
  BlinkTargetCount: 'blink-target-count',
  IsEtbSpellRecursionToHand: 'is-etb-spell-recursion-to-hand',
  IsBlinkResettableManaArtifact: 'is-blink-resettable-mana-artifact',
  IsFoodSacrificeDrawEngine: 'is-food-sacrifice-draw-engine',
  IsFoodTokenReplacement: 'is-food-token-replacement',
  IsFoodSacrificeTokenTrigger: 'is-food-sacrifice-token-trigger',
  EtbUntapsLand: 'etb-untaps-land',
  IsEtbBlink: 'is-etb-blink',
  IsBody: 'is-body',
  IsSacOutlet: 'is-sac-outlet',
  IsRecursiveBody: 'is-recursive-body',
  RecursiveBodyCost: 'recursive-body-cost',
  IsManaSacOutlet: 'is-mana-sac-outlet',
  SacOutletManaProduced: 'sac-outlet-mana-produced',
  IsTokenProducer: 'is-token-producer',
  IsTokenDoubler: 'is-token-doubler',
  IsLandfallPayoff: 'is-landfall-payoff',
  IsDrawToDamagePayoff: 'is-draw-to-damage-payoff',
  IsDamageToDrawPayoff: 'is-damage-to-draw-payoff',
  IsLifegainFromOpponentLifeloss: 'is-lifegain-from-opponent-lifeloss',
  IsLifelossFromYourLifegain: 'is-lifeloss-from-your-lifegain',
});

const Zone = freeze({
  Battlefield: 'battlefield',
  Graveyard: 'graveyard',
  Exile: 'exile',
  Hand: 'hand',
  Library: 'library',
  Command: 'command',
  Stack: 'stack',
});

const GraphStrength = freeze({
  Weak: 'weak',
  Moderate: 'moderate',
  Strong: 'strong',
  ComboCritical: 'combo-critical',
});


const SemanticTransitionKind = freeze({
  ActivatedAbility: 'activated-ability',
  TriggeredAbility: 'triggered-ability',
  StaticModifier: 'static-modifier',
  CastAction: 'cast-action',
  ZoneMove: 'zone-move',
  ReplacementEffect: 'replacement-effect',
});

const UnderstandingEvidenceKind = freeze({
  GraphExplanation: 'graph-explanation',
  StrictProof: 'strict-proof',
  Rejection: 'rejection',
  EvaluatorMapping: 'evaluator-mapping',
  DebugReport: 'debug-report',
  HumanReview: 'human-review',
});

const SolverOutcome = freeze({
  Proven: 'proven',
  Rejected: 'rejected',
  Unresolved: 'unresolved',
});

const StateDimension = freeze({
  Mana: 'mana',
  Untap: 'untap',
  Blink: 'blink',
  Etb: 'etb',
  Ltb: 'ltb',
  Death: 'death',
  Cast: 'cast',
  Tokens: 'tokens',
  Counters: 'counters',
  ZoneAccess: 'zone-access',
  TurnFreshness: 'turn-freshness',
  Legality: 'legality',
});

const LegalityPredicate = freeze({
  PackageLocal: 'package-local',
  RepeatableAction: 'repeatable-action',
  LegalTarget: 'legal-target',
  FaceCompatible: 'face-compatible',
  PaymentClosed: 'payment-closed',
  BoundedSearch: 'bounded-search',
});


function valuesOf(domain) {
  return Object.values(domain);
}

function hasDomainValue(domain, value) {
  return valuesOf(domain).includes(value);
}

module.exports = {
  ComboFamilyId,
  ResultClass,
  ConfidenceGate,
  ProofStatus,
  RepeatabilityStatus,
  FactKind,
  ComboRole,
  ComboResource,
  SemanticEvent,
  Capability,
  Zone,
  GraphStrength,
  SemanticTransitionKind,
  UnderstandingEvidenceKind,
  SolverOutcome,
  StateDimension,
  LegalityPredicate,
  valuesOf,
  hasDomainValue,
};
