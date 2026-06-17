import type { CandidateCard, DeckGraph, GraphNode, Interaction } from './graph'
import type { DeckMetrics } from './metrics'

export type RecommendationMode = 'total' | 'win' | 'cohesion' | 'self' | 'missing-signal'
export type RecommendationState = 'idle' | 'pending' | 'done' | 'error'

export interface RecommendationInput {
  key: string
  graph: DeckGraph
  candidates: CandidateCard[]
  mode?: RecommendationMode
}

export interface RecommendationProgress {
  key: string
  done: number
  total: number
}

export interface RecommendationCardResult {
  name: string
  role: string
  cmc: number
  power: number
  newEdges: number
  deltaWin: number
  deltaCohesion: number
  deltaSelf: number
  totalValue: number
  scoreMissing: number
  signalDeltas: Record<string, number>
}

export interface RecommendationResult {
  key: string
  total: number
  results: RecommendationCardResult[]
}

export interface RecommendationError {
  key?: string
  message: string
  cause?: unknown
}

export interface RecommendationCacheEntry {
  state: RecommendationState
  total?: number
  results?: RecommendationCardResult[]
  message?: string
}

export interface RecommendationObserver {
  onProgress?(progress: RecommendationProgress): void
  onResult?(result: RecommendationResult): void
  onError?(error: RecommendationError): void
}

export interface RecommendationJob {
  cancel(): void
}

export interface RecommendationProvider {
  recommend(input: RecommendationInput, observer: RecommendationObserver): RecommendationJob
}

export interface CandidateEvaluationContext {
  baseMetrics: DeckMetrics
  graph: DeckGraph
  candidate: CandidateCard
  candidateNode: GraphNode
  interactions: Interaction[]
}
