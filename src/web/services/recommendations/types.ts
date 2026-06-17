import type { CandidateCard, DeckGraph, DeckNode } from '../../types/deck'

export interface RecommendationInput {
  key: string
  graph: DeckGraph
  candidates: CandidateCard[]
}

export interface RecommendationProgress {
  key: string
  done: number
  total: number
}

export interface RecommendationRow {
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
  results: RecommendationRow[]
}

export interface RecommendationError {
  key?: string
  code: 'worker-unavailable' | 'worker-failed' | 'cancelled'
  message: string
  cause?: unknown
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

export type RecommendationMode = 'total' | 'win' | 'cohesion' | 'self'

export interface RecommendationDeckCard extends DeckNode {
  replacementRows?: RecommendationRow[]
  matchingRows?: RecommendationMatchRow[]
}

export interface RecommendationMatchRow {
  name: string
  role: string
  score: number
  interactions: string[]
}
