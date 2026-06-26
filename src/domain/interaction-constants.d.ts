export type DomainValue<T extends Record<string, string>> = T[keyof T]

export const ComboFamilyId: {
  readonly SelfUntapManaLoop: 'self-untap-mana-loop'
  readonly VariableBoardCountManaLoop: 'variable-board-count-mana-loop'
  readonly BlinkEtbLandUntapLoop: 'blink-etb-land-untap-loop'
  readonly MutualEtbBlinkResetLoop: 'mutual-etb-blink-reset-loop'
  readonly AristocratsBodyOutletPayoff: 'aristocrats-body-outlet-payoff'
  readonly RecursiveBodySacrificeManaLoop: 'recursive-body-sacrifice-mana-loop'
  readonly LifePaidTreasureRecursiveDrainLoop: 'life-paid-treasure-recursive-drain-loop'
  readonly TokenSourceModifierPayoff: 'token-source-modifier-payoff'
  readonly TokenReplacementSacrificeManaLoop: 'token-replacement-sacrifice-mana-loop'
  readonly KodamaBounceLandLandfallLoop: 'kodama-bounce-land-landfall-loop'
  readonly CostReducerActivatedOutputPayoff: 'cost-reducer-activated-output-payoff'
  readonly ArtifactTopCostReductionLoop: 'artifact-top-cost-reduction-loop'
  readonly LifegainLifelossLoop: 'lifegain-lifeloss-loop'
  readonly MillLifelossFeedbackLoop: 'mill-lifeloss-feedback-loop'
  readonly DrawDamageFeedbackLoop: 'draw-damage-feedback-loop'
  readonly SelfCopySpellMagecraftDrainLoop: 'self-copy-spell→magecraft-drain-loop'
  readonly EscapeWheelManaLoop: 'escape-wheel-mana-loop'
  readonly BuybackCopyRitualLoop: 'buyback-copy-ritual-loop'
  readonly LifelinkCounterDamageLoop: 'lifelink-counter-damage-loop'
  readonly CounterTokenEtbCounterLoop: 'counter-token→etb-counter-loop'
  readonly MinusCounterDeathTokenLoop: 'minus-counter-death→token-loop'
  readonly LifegainCounterTokenEtbLoop: 'lifegain-counter-token-etb-loop'
  readonly DeathUntapDeathtouchPingerLock: 'death-untap-deathtouch-pinger-lock'
  readonly ForcedCastCastLock: 'forced-cast→cast-lock'
  readonly CounterSuppressionPreventionLock: 'counter-suppression→prevention-lock'
  readonly CounterSuppressionDepletionLock: 'counter-suppression→depletion-lock'
  readonly CounterSuppressionPoisonLossLock: 'counter-suppression→poison-loss-lock'
  readonly CounterSuppressionCumulativeUpkeepPreventionLock: 'counter-suppression→cumulative-upkeep-prevention-lock'
  readonly FaceUpUntapSkipFaceDownResetLock: 'face-up-untap-skip→face-down-reset-lock'
  readonly NoFlyingAttackFlyingRemovalLock: 'no-flying-attack→flying-removal-lock'
  readonly FlyingOnlyAttackGroundLock: 'flying-only-attack→ground-lock'
  readonly FlyingOrIslandwalkAttackEvasionRemovalLock: 'flying-or-islandwalk-attack→evasion-removal-lock'
  readonly DrawStepHandCycleDrawLimitLock: 'draw-step-hand-cycle→draw-limit-lock'
  readonly NoDrawSearchStepSearchLock: 'no-draw-search-step→search-lock'
  readonly PreventionLandGraveyardExtraLandLock: 'prevention-land→graveyard-extra-land-lock'
  readonly AllPermanentsArtifactsArtifactActivationLock: 'all-permanents-artifacts→artifact-activation-lock'
  readonly AllLandsIslandsIslandUntapLock: 'all-lands-islands→island-untap-lock'
  readonly GlobalUntapSkipUpkeepSkipLock: 'global-untap-skip→upkeep-skip-lock'
  readonly GlobalUntapSkipEndStepUntapLock: 'global-untap-skip→end-step-untap-lock'
  readonly GlobalUntapSkipUpkeepUntapLandLock: 'global-untap-skip→upkeep-untap-land-lock'
  readonly GlobalUntapSkipSelfBounceLock: 'global-untap-skip→self-bounce-lock'
  readonly CastProtectionSelfBounceLock: 'cast-protection→self-bounce-lock'
  readonly CastProtectionGraveyardRecastLock: 'cast-protection→graveyard-recast-lock'
  readonly LifePaidDamageLifelossRecoveryLoop: 'life-paid-damage-lifeloss-recovery-loop'
  readonly ExileRecastCreatureManaLoop: 'exile-recast-creature-mana-loop'
  readonly OpponentDrawPunisherWin: 'opponent-draw-punisher-win'
  readonly MillMultiplierFiniteMill: 'mill-multiplier-finite-mill'
  readonly DelayedMillEqualizerFiniteMill: 'delayed-mill-equalizer-finite-mill'
  readonly LibraryExileEmptyLibraryWin: 'library-exile-empty-library-win'
  readonly ImprintUntapSpellLoop: 'imprint-untap-spell-loop'
  readonly TapFreeCastUntapEngine: 'tap-free-cast→untap-engine'
  readonly SelfUntapManaAbilityCopyLoop: 'self-untap-mana→ability-copy-loop'
  readonly HastyCopyEtbUntapLoop: 'hasty-copy→etb-untap-loop'
  readonly CombatCopyTokenExtraCombatLoop: 'combat-copy-token→extra-combat-loop'
  readonly HastyCopyAttackExtraCombatLoop: 'hasty-copy→attack-extra-combat-loop'
  readonly CombatCopyTokenConnectExtraCombatLoop: 'combat-copy-token→connect-extra-combat-loop'
  readonly HastyCopyConnectExtraCombatLoop: 'hasty-copy→connect-extra-combat-loop'
  readonly CombatCopyTokenAttackExtraTurnLoop: 'combat-copy-token→attack-extra-turn-loop'
  readonly CombatCopyTokenConnectExtraTurnLoop: 'combat-copy-token→connect-extra-turn-loop'
  readonly HastyCopyAttackExtraTurnLoop: 'hasty-copy→attack-extra-turn-loop'
  readonly HastyCopyConnectExtraTurnLoop: 'hasty-copy→connect-extra-turn-loop'
  readonly CombatSacrificeAuraExtraCombatLoop: 'combat-sacrifice-aura→extra-combat-loop'
  readonly CombatResourceExtraCombatLoop: 'combat-resource→extra-combat-loop'
  readonly ArtifactTokenExtraTurnLoop: 'artifact-token→extra-turn-loop'
  readonly CounterThresholdDoublerExtraTurnLoop: 'counter-threshold-doubler→extra-turn-loop'
  readonly CounterThresholdProliferateExtraTurnLoop: 'counter-threshold-proliferate→extra-turn-loop'
  readonly SpellCopyEtbCreatureCopySpellLoop: 'spell-copy-etb→creature-copy-spell-loop'
  readonly DeathCopySpellEtbCopyLoop: 'death-copy-spell-etb-copy-loop'
  readonly CopyEtbTriggerPayoff: 'copy-etb-trigger-payoff'
}
export type ComboFamilyId = DomainValue<typeof ComboFamilyId>

export const ResultClass: {
  readonly Combat: 'combat'
  readonly EmptyLibrary: 'empty-library'
  readonly InfiniteCast: 'infinite-cast'
  readonly InfiniteCounters: 'infinite-counters'
  readonly InfiniteDamage: 'infinite-damage'
  readonly InfiniteDeath: 'infinite-death'
  readonly InfiniteDraw: 'infinite-draw'
  readonly InfiniteEtb: 'infinite-etb'
  readonly InfiniteLandfall: 'infinite-landfall'
  readonly InfiniteLife: 'infinite-life'
  readonly InfiniteLooting: 'infinite-looting'
  readonly InfiniteLtb: 'infinite-ltb'
  readonly InfiniteMana: 'infinite-mana'
  readonly InfiniteOpponentLifeLoss: 'infinite-opponent-life-loss'
  readonly InfinitePump: 'infinite-pump'
  readonly InfiniteSacrifice: 'infinite-sacrifice'
  readonly InfiniteSelfDiscard: 'infinite-self-discard'
  readonly InfiniteTokens: 'infinite-tokens'
  readonly InfiniteTurns: 'infinite-turns'
  readonly InfiniteUntap: 'infinite-untap'
  readonly Lock: 'lock'
  readonly Mill: 'mill'
  readonly Win: 'win'
}
export type ResultClass = DomainValue<typeof ResultClass>

export const ConfidenceGate: {
  readonly Exact: 'exact'
  readonly Pattern: 'pattern'
  readonly Heuristic: 'heuristic'
}
export type ConfidenceGate = DomainValue<typeof ConfidenceGate>

export const ProofStatus: {
  readonly Proven: 'proven'
  readonly NotRepeatable: 'not-repeatable'
  readonly BoundedOut: 'bounded-out'
  readonly NoProof: 'no-proof'
}
export type ProofStatus = DomainValue<typeof ProofStatus>

export const RepeatabilityStatus: {
  readonly Repeatable: 'repeatable'
  readonly RepeatableThreshold: 'repeatable-threshold'
  readonly RepeatableCombatThreshold: 'repeatable-combat-threshold'
  readonly RepeatableCombatCarrier: 'repeatable-combat-carrier'
  readonly RepeatableTurnCycleThreshold: 'repeatable-turn-cycle-threshold'
  readonly RepeatableTurnThreshold: 'repeatable-turn-threshold'
  readonly RepeatableCandidate: 'repeatable-candidate'
  readonly RepeatableBreakEven: 'repeatable-break-even'
  readonly RepeatableLock: 'repeatable-lock'
  readonly RepeatableCombatFreshToken: 'repeatable-combat-fresh-token'
  readonly RepeatableCombatConnectFreshToken: 'repeatable-combat-connect-fresh-token'
  readonly NonLoopWin: 'non-loop-win'
  readonly NonLoopThreshold: 'non-loop-threshold'
  readonly ValueEngine: 'value-engine'
  readonly Candidate: 'candidate'
  readonly CandidateRepeatable: 'candidate-repeatable'
}
export type RepeatabilityStatus = DomainValue<typeof RepeatabilityStatus>

export const FactKind: {
  readonly Capability: 'capability'
  readonly AnyCapability: 'anyCapability'
  readonly EventConsumes: 'event.consumes'
  readonly EventProduces: 'event.produces'
  readonly Precondition: 'precondition'
  readonly Resource: 'resource'
  readonly Event: 'event'
  readonly Cost: 'cost'
  readonly Threshold: 'threshold'
  readonly TargetLegality: 'target-legality'
  readonly Repeatability: 'repeatability'
}
export type FactKind = DomainValue<typeof FactKind>

export const ComboRole: {
  readonly Engine: 'engine'
  readonly Source: 'source'
  readonly Threshold: 'threshold'
  readonly Blink: 'blink'
  readonly Untapper: 'untapper'
  readonly FirstBlinker: 'firstBlinker'
  readonly SecondBlinker: 'secondBlinker'
  readonly Body: 'body'
  readonly Outlet: 'outlet'
  readonly Payoff: 'payoff'
  readonly Modifier: 'modifier'
  readonly Replacer: 'replacer'
  readonly Dropper: 'dropper'
  readonly Land: 'land'
  readonly Reducer: 'reducer'
  readonly Ability: 'ability'
  readonly TopPiece: 'topPiece'
  readonly Caster: 'caster'
  readonly LossToGain: 'lossToGain'
  readonly GainToLoss: 'gainToLoss'
  readonly DrawToDamage: 'drawToDamage'
  readonly DamageToDraw: 'damageToDraw'
  readonly CopySpell: 'copySpell'
  readonly Ritual: 'ritual'
  readonly Lockpiece: 'lockpiece'
  readonly Support: 'support'
  readonly Shield: 'shield'
  readonly Suppression: 'suppression'
  readonly Recursion: 'recursion'
  readonly Recovery: 'recovery'
}
export type ComboRole = DomainValue<typeof ComboRole>

export const ComboResource: {
  readonly Mana: 'mana'
  readonly Untap: 'untap'
  readonly Blink: 'blink'
  readonly Lifegain: 'lifegain'
  readonly Lifeloss: 'lifeloss'
  readonly Damage: 'damage'
  readonly Draw: 'draw'
  readonly Cards: 'cards'
  readonly Tokens: 'tokens'
  readonly Life: 'life'
  readonly OpponentLife: 'opponentLife'
  readonly Counters: 'counters'
  readonly Turns: 'turns'
  readonly Combat: 'combat'
  readonly Lands: 'lands'
}
export type ComboResource = DomainValue<typeof ComboResource>

export const SemanticEvent: {
  readonly Etb: 'etb'
  readonly Ltb: 'ltb'
  readonly Death: 'death'
  readonly Cast: 'cast'
  readonly Tap: 'tap'
  readonly Untap: 'untap'
  readonly Sacrifice: 'sacrifice'
  readonly Draw: 'draw'
  readonly Damage: 'damage'
  readonly Lifegain: 'lifegain'
  readonly Lifeloss: 'lifeloss'
  readonly Tokens: 'tokens'
  readonly Landfall: 'landfall'
  readonly Mill: 'mill'
  readonly Discard: 'discard'
  readonly Combat: 'combat'
  readonly ExtraTurn: 'extraTurn'
}
export type SemanticEvent = DomainValue<typeof SemanticEvent>

export const Capability: {
  readonly TapsForMana: 'taps-for-mana'
  readonly IsSelfUntapper: 'is-self-untapper'
  readonly ManaProduced: 'mana-produced'
  readonly SelfUntapCost: 'self-untap-cost'
  readonly IsRepeatableBlink: 'is-repeatable-blink'
  readonly BlinkCost: 'blink-cost'
  readonly EtbUntapsLand: 'etb-untaps-land'
  readonly IsEtbBlink: 'is-etb-blink'
  readonly IsBody: 'is-body'
  readonly IsSacOutlet: 'is-sac-outlet'
  readonly IsRecursiveBody: 'is-recursive-body'
  readonly RecursiveBodyCost: 'recursive-body-cost'
  readonly IsManaSacOutlet: 'is-mana-sac-outlet'
  readonly SacOutletManaProduced: 'sac-outlet-mana-produced'
  readonly IsTokenProducer: 'is-token-producer'
  readonly IsTokenDoubler: 'is-token-doubler'
  readonly IsLandfallPayoff: 'is-landfall-payoff'
  readonly IsDrawToDamagePayoff: 'is-draw-to-damage-payoff'
  readonly IsDamageToDrawPayoff: 'is-damage-to-draw-payoff'
  readonly IsLifegainFromOpponentLifeloss: 'is-lifegain-from-opponent-lifeloss'
  readonly IsLifelossFromYourLifegain: 'is-lifeloss-from-your-lifegain'
}
export type Capability = DomainValue<typeof Capability>

export const Zone: {
  readonly Battlefield: 'battlefield'
  readonly Graveyard: 'graveyard'
  readonly Exile: 'exile'
  readonly Hand: 'hand'
  readonly Library: 'library'
  readonly Command: 'command'
  readonly Stack: 'stack'
}
export type Zone = DomainValue<typeof Zone>

export const GraphStrength: {
  readonly Weak: 'weak'
  readonly Moderate: 'moderate'
  readonly Strong: 'strong'
  readonly ComboCritical: 'combo-critical'
}
export type GraphStrength = DomainValue<typeof GraphStrength>


export const SemanticTransitionKind: {
  readonly ActivatedAbility: 'activated-ability'
  readonly TriggeredAbility: 'triggered-ability'
  readonly StaticModifier: 'static-modifier'
  readonly CastAction: 'cast-action'
  readonly ZoneMove: 'zone-move'
  readonly ReplacementEffect: 'replacement-effect'
}
export type SemanticTransitionKind = DomainValue<typeof SemanticTransitionKind>

export const UnderstandingEvidenceKind: {
  readonly GraphExplanation: 'graph-explanation'
  readonly StrictProof: 'strict-proof'
  readonly Rejection: 'rejection'
  readonly EvaluatorMapping: 'evaluator-mapping'
  readonly DebugReport: 'debug-report'
  readonly HumanReview: 'human-review'
}
export type UnderstandingEvidenceKind = DomainValue<typeof UnderstandingEvidenceKind>

export const SolverOutcome: {
  readonly Proven: 'proven'
  readonly Rejected: 'rejected'
  readonly Unresolved: 'unresolved'
}
export type SolverOutcome = DomainValue<typeof SolverOutcome>

export const StateDimension: {
  readonly Mana: 'mana'
  readonly Untap: 'untap'
  readonly Blink: 'blink'
  readonly Etb: 'etb'
  readonly Ltb: 'ltb'
  readonly Death: 'death'
  readonly Cast: 'cast'
  readonly Tokens: 'tokens'
  readonly Counters: 'counters'
  readonly ZoneAccess: 'zone-access'
  readonly TurnFreshness: 'turn-freshness'
  readonly Legality: 'legality'
}
export type StateDimension = DomainValue<typeof StateDimension>

export const LegalityPredicate: {
  readonly PackageLocal: 'package-local'
  readonly RepeatableAction: 'repeatable-action'
  readonly LegalTarget: 'legal-target'
  readonly FaceCompatible: 'face-compatible'
  readonly PaymentClosed: 'payment-closed'
  readonly BoundedSearch: 'bounded-search'
}
export type LegalityPredicate = DomainValue<typeof LegalityPredicate>

export function valuesOf<T extends Record<string, string>>(domain: T): Array<DomainValue<T>>
export function hasDomainValue<T extends Record<string, string>>(domain: T, value: unknown): value is DomainValue<T>
