export type ComboDetectionStrategyId =
  | 'brute-force-combinations'
  | 'rule-template-search'
  | 'graph-resource-search'

export type ComboResource =
  | 'mana'
  | 'untap'
  | 'blink'
  | 'lifegain'
  | 'lifeloss'
  | 'damage'
  | 'draw'

export interface ComboCardInput {
  readonly id?: string
  readonly name: string
  readonly typeLine?: string
  readonly oracleText?: string
  readonly manaCost?: string
  readonly manaValue?: number
}

export interface ComboDetectionInput {
  readonly cards: readonly ComboCardInput[]
  readonly maxCards?: number
}

export interface ComboCandidate {
  readonly id: string
  readonly strategyId: ComboDetectionStrategyId
  readonly cardIds: readonly string[]
  readonly reason: string
}

export interface ComboProof {
  readonly id: string
  readonly family: string
  readonly cardIds: readonly string[]
  readonly resources: readonly ComboResource[]
  readonly explanation: string
}

export interface ComboDetectionResult {
  readonly strategyId: ComboDetectionStrategyId
  readonly candidates: readonly ComboCandidate[]
  readonly proofs: readonly ComboProof[]
}

export interface ComboDetectionStrategy {
  readonly id: ComboDetectionStrategyId
  readonly label: string
  detect(input: ComboDetectionInput): ComboDetectionResult
}

export interface ComboStrategyBenchmarkCase {
  readonly id: string
  readonly cards: readonly ComboCardInput[]
}

export interface ComboStrategyBenchmarkRow {
  readonly strategyId: ComboDetectionStrategyId
  readonly candidateCount: number
  readonly proofCount: number
  readonly proofFamilies: readonly string[]
}

export interface ComboStrategyBenchmarkCaseResult {
  readonly caseId: string
  readonly rows: readonly ComboStrategyBenchmarkRow[]
}

export interface ComboStrategyBenchmarkResult {
  readonly version: 'combo-strategy-benchmark.v1'
  readonly generatedAt: string
  readonly cases: readonly ComboStrategyBenchmarkCaseResult[]
}
