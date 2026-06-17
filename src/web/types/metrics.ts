import type { ComboCriticalPair, ComboCriticalTriple, CommanderBracketResult } from './graph'

export interface WeightedCardRef {
  id: string
  w?: number
  [key: string]: unknown
}

export interface ScoreSignal {
  raw?: number
  score?: number
  cards?: string[] | WeightedCardRef[]
  [key: string]: unknown
}

export interface SelfSufficiencySignals {
  interaction: number
  cardAdvantage: number
  ramp: number
  tutors: number
  resilience: number
  premiumStaples: number
  premiumShare: number
  [key: string]: number
}

export interface WinTuningSignals {
  speed?: ScoreSignal
  consistency?: ScoreSignal
  cardFlow?: ScoreSignal
  interaction?: ScoreSignal
  closure?: ScoreSignal
  resilience?: ScoreSignal
  efficiency?: ScoreSignal
  gameChangers?: ScoreSignal
  legality?: ScoreSignal
  [key: string]: ScoreSignal | undefined
}

export interface DeckMetrics {
  nonlandCount: number
  interactiveCount: number
  islandCount: number
  islands: string[]
  edgeCount: number
  avgDegree: number
  weightedAvgDegree: number
  satWeightedAvgDegree: number
  pctInteractive: number
  pctMeaningful: number
  density: number
  largestWeb: number
  largestWebShare: number
  meaningfulWeb: number
  meaningfulWebShare: number
  interactiveComponents: number
  eventCounts: Record<string, number>
  combos: string[][]
  comboCriticalPairs: ComboCriticalPair[]
  comboCriticalTriples: ComboCriticalTriple[]
  hasCombo: boolean
  cohesionScore: number
  cohesionBand: string
  selfSufficiencyScore: number
  selfSufficiencyBand: string
  selfSufficiencySignals: SelfSufficiencySignals
  winTuningScore: number
  winTuningBand: string
  winTuningSignals: WinTuningSignals
  winSummary: string
  gameChangerCount: number
  gameChangers: string[]
  commanderBracket: CommanderBracketResult
  bracketHint: number | string
  bracketLabel: string
  [key: string]: unknown
}

export type ScoreAxis = 'win' | 'cohesion' | 'selfSufficiency'

export type { EvidenceBadge, SignalBar, ScoreSection } from './ui'

export interface MetricRowViewModel {
  id: string
  label: string
  value: number | string
  suffix?: string
  band?: string
  higherIsBetter?: boolean | null
  section?: string
}

export interface MetricsModule {
  compute(graph: import('./graph').DeckGraph): DeckMetrics
  cardPower(node: import('./graph').GraphNode): number
}
