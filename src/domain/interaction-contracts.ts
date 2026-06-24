import type {
  ComboFamilyId,
  ComboResource,
  ConfidenceGate,
  FactKind,
  LegalityPredicate,
  RepeatabilityStatus,
  ResultClass,
  SemanticEvent,
  SemanticTransitionKind,
  SolverOutcome,
  StateDimension,
  UnderstandingEvidenceKind,
  Zone,
} from './interaction-constants.js'

export interface DomainFactReference {
  readonly role?: string
  readonly kind: FactKind
  readonly predicate?: string
  readonly predicates?: readonly string[]
  readonly event?: SemanticEvent | string
  readonly resource?: ComboResource | string
  readonly note?: string
}

export interface RepeatabilityContract {
  readonly rule?: string
  readonly status?: RepeatabilityStatus
  readonly reason?: string
}

export interface PayoffCriterion {
  readonly resource?: ComboResource | string
  readonly event?: SemanticEvent | string
  readonly comparator: string
  readonly threshold?: number
}

export interface ComboFamilyContract {
  readonly id: ComboFamilyId
  readonly title: string
  readonly maxCards: 1 | 2 | 3
  readonly confidenceGate: ConfidenceGate
  readonly requiredFacts: readonly DomainFactReference[]
  readonly optionalAccelerants?: readonly DomainFactReference[]
  readonly disqualifiers?: readonly DomainFactReference[]
  readonly repeatability: RepeatabilityContract
  readonly payoffCriteria: readonly PayoffCriterion[]
  readonly resultClasses?: readonly ResultClass[]
  readonly proofDeltaResultClasses?: readonly ResultClass[]
  readonly examples: readonly ComboFixture[]
  readonly negativeFixtures: readonly ComboFixture[]
  readonly knownFalsePositives: readonly string[]
  readonly uiExplanation: string
}

export interface ComboFixture {
  readonly name: string
  readonly cards: readonly string[]
  readonly reason?: string
}


export interface NumericInterval {
  readonly min: number
  readonly max: number
}

export interface ManaProfile {
  readonly total: number
  readonly any?: number
  readonly colorless?: number
  readonly colors?: Readonly<Record<string, number>>
}

export interface SemanticTransitionDelta {
  readonly dimension: StateDimension | ComboResource | SemanticEvent | string
  readonly amount: NumericInterval
  readonly resource?: ComboResource | string
  readonly event?: SemanticEvent | string
}

export interface SemanticTransitionCost {
  readonly dimension: StateDimension | ComboResource | SemanticEvent | string
  readonly amount: NumericInterval
  readonly resource?: ComboResource | string
  readonly mana?: ManaProfile
}

export interface SemanticTransitionProvenance {
  readonly cardId: string
  readonly faceIndex?: number
  readonly faceName?: string
  readonly capability?: string
  readonly snippet?: string
}

export interface SemanticLegalityRequirement {
  readonly predicate: LegalityPredicate
  readonly subjectCardId?: string
  readonly objectCardId?: string
  readonly reason: string
}

export interface SemanticTransition {
  readonly id: string
  readonly sourceCardId: string
  readonly kind: SemanticTransitionKind
  readonly label: string
  readonly produces: readonly SemanticTransitionDelta[]
  readonly consumes: readonly SemanticTransitionCost[]
  readonly events: readonly (SemanticEvent | string)[]
  readonly legality: readonly SemanticLegalityRequirement[]
  readonly provenance: readonly SemanticTransitionProvenance[]
}

export interface SemanticUnderstandingState {
  readonly version: 'semantic-understanding-state.v1'
  readonly cards: readonly string[]
  readonly dimensions: Readonly<Record<string, NumericInterval>>
  readonly zones: Readonly<Partial<Record<Zone | string, readonly string[]>>>
  readonly constraints: readonly SemanticLegalityRequirement[]
  readonly unresolved: readonly SolverUnderstandingEvidence[]
}

export interface SolverEvidenceStep {
  readonly transitionId?: string
  readonly cardId?: string
  readonly action: string
  readonly delta?: Readonly<Record<string, number | string>>
}

export interface SolverUnderstandingEvidence {
  readonly id: string
  readonly kind: UnderstandingEvidenceKind
  readonly outcome: SolverOutcome
  readonly family?: ComboFamilyId
  readonly cards: readonly string[]
  readonly transitions: readonly string[]
  readonly requiredLegality: readonly SemanticLegalityRequirement[]
  readonly requiredFacts?: readonly DomainFactReference[]
  readonly steps: readonly SolverEvidenceStep[]
  readonly positiveDeltas: readonly SemanticTransitionDelta[]
  readonly assumptions: readonly string[]
  readonly rejectionReason?: string
}

export interface PackageUnderstandingCoverage {
  readonly transitionKinds: readonly SemanticTransitionKind[]
  readonly stateDimensions: readonly StateDimension[]
  readonly solvedFamilies: readonly ComboFamilyId[]
  readonly deferredDimensions: readonly StateDimension[]
}

export interface PackageUnderstandingModel {
  readonly version: 'package-understanding.v1'
  readonly coverage: PackageUnderstandingCoverage
  readonly state: SemanticUnderstandingState
  readonly transitions: readonly SemanticTransition[]
  readonly evidence: readonly SolverUnderstandingEvidence[]
  readonly unresolved: readonly SolverUnderstandingEvidence[]
}
