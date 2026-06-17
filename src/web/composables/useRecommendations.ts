import { computed, onBeforeUnmount, ref } from 'vue'
import type { CandidateCard, DeckGraph } from '../types/deck'
import type { RecommendationJob, RecommendationMode, RecommendationProvider, RecommendationResult, RecommendationRow } from '../services/recommendations'
import { deckSignature, visibleRecommendations } from '../services/recommendations'

export function useRecommendations(provider: RecommendationProvider, graph: () => DeckGraph | null, candidates: () => CandidateCard[]) {
  const loading = ref(false)
  const mode = ref<RecommendationMode>('total')
  const progress = ref({ done: 0, total: 0 })
  const error = ref<string | null>(null)
  const result = ref<RecommendationResult | null>(null)
  let job: RecommendationJob | null = null
  let activeKey: string | null = null
  let activeRun = 0

  const rows = computed<RecommendationRow[]>(() => visibleRecommendations(result.value?.results ?? [], mode.value))

  function start() {
    const activeGraph = graph()
    const activeCandidates = candidates()
    if (!activeGraph) return
    cancel()
    const run = ++activeRun
    loading.value = true
    error.value = null
    progress.value = { done: 0, total: activeCandidates.length }
    const key = deckSignature(activeGraph)
    activeKey = key
    job = provider.recommend(
      { key, graph: activeGraph, candidates: activeCandidates },
      {
        onProgress(nextProgress) {
          if (run === activeRun && nextProgress.key === key && nextProgress.key === activeKey) progress.value = { done: nextProgress.done, total: nextProgress.total }
        },
        onResult(nextResult) {
          if (run !== activeRun || nextResult.key !== key || nextResult.key !== activeKey) return
          result.value = nextResult
          loading.value = false
          job = null
        },
        onError(nextError) {
          if (nextError.code === 'cancelled') return
          if (run !== activeRun || (nextError.key && nextError.key !== activeKey)) return
          error.value = nextError.message
          loading.value = false
          job = null
        },
      },
    )
  }

  function cancel() {
    activeRun += 1
    job?.cancel()
    job = null
    activeKey = null
    loading.value = false
  }

  function reset() {
    cancel()
    progress.value = { done: 0, total: 0 }
    error.value = null
    result.value = null
  }

  onBeforeUnmount(cancel)

  return { loading, mode, progress, error, result, rows, start, cancel, reset }
}
