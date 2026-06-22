import type {
  ComboFamilyId,
  ComboResource,
  ConfidenceGate,
  FactKind,
  RepeatabilityStatus,
  ResultClass,
  SemanticEvent,
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
