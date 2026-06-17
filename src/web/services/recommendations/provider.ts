import { toRaw } from 'vue'
import type { RecommendationInput, RecommendationJob, RecommendationObserver, RecommendationProvider, RecommendationResult } from './types'

export type RecommendationWorkerFactory = () => Worker

type WorkerMessage =
  | { type: 'progress'; key: string; done: number; total: number }
  | { type: 'done'; key: string; total: number; results: RecommendationResult['results'] }
  | { type: 'error'; key?: string; message: string }

export class WorkerRecommendationProvider implements RecommendationProvider {
  constructor(private readonly createWorker: RecommendationWorkerFactory) {}

  recommend(input: RecommendationInput, observer: RecommendationObserver): RecommendationJob {
    const worker = this.createWorker()
    let cancelled = false

    worker.onmessage = event => {
      if (cancelled) return
      const message = event.data as WorkerMessage
      if (message.type === 'progress') {
        observer.onProgress?.({ key: message.key, done: message.done, total: message.total })
      } else if (message.type === 'done') {
        observer.onResult?.({ key: message.key, total: message.total, results: message.results })
        worker.terminate()
      } else if (message.type === 'error') {
        observer.onError?.({ key: message.key, code: 'worker-failed', message: message.message })
        worker.terminate()
      }
    }

    worker.onerror = event => {
      if (cancelled) return
      observer.onError?.({ key: input.key, code: 'worker-failed', message: event.message || 'Recommendation worker failed', cause: event })
      worker.terminate()
    }

    try {
      worker.postMessage(cloneRecommendationInput(input))
    } catch (cause) {
      observer.onError?.({
        key: input.key,
        code: 'worker-failed',
        message: errorMessage(cause, 'Recommendation worker could not start'),
        cause,
      })
      worker.terminate()
    }

    return {
      cancel() {
        cancelled = true
        worker.terminate()
        observer.onError?.({ key: input.key, code: 'cancelled', message: 'Recommendation job cancelled' })
      },
    }
  }
}

export class NullRecommendationProvider implements RecommendationProvider {
  recommend(input: RecommendationInput, observer: RecommendationObserver): RecommendationJob {
    observer.onError?.({ key: input.key, code: 'worker-unavailable', message: 'Recommendations are unavailable in this environment' })
    return { cancel() {} }
  }
}

export function createRecommendationProvider(createWorker?: RecommendationWorkerFactory): RecommendationProvider {
  if (typeof Worker === 'undefined' || !createWorker) return new NullRecommendationProvider()
  return new WorkerRecommendationProvider(createWorker)
}

function cloneRecommendationInput(input: RecommendationInput): RecommendationInput {
  const rawInput = toRaw(input)
  return {
    key: rawInput.key,
    graph: clonePlain(toRaw(rawInput.graph)),
    candidates: clonePlain(toRaw(rawInput.candidates)),
  }
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === 'object' && 'message' in cause && typeof (cause as { message?: unknown }).message === 'string') {
    return (cause as { message: string }).message
  }
  return fallback
}
