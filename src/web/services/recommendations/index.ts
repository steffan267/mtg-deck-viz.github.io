import RecommendationWorker from '../../workers/recommendation.worker.ts?worker'
import { createRecommendationProvider } from './provider'

export * from './types'
export * from './provider'
export * from './presenter'

export function createBrowserRecommendationProvider() {
  return createRecommendationProvider(() => new RecommendationWorker())
}
