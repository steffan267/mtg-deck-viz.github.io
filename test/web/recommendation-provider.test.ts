import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { WorkerRecommendationProvider } from '../../src/web/services/recommendations/provider'
import type { RecommendationInput } from '../../src/web/services/recommendations/types'

class CapturingWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: unknown[] = []

  postMessage(input: unknown) {
    this.messages.push(input)
  }

  terminate() {}
}

describe('WorkerRecommendationProvider', () => {
  it('posts cloneable plain data when given Vue reactive recommendation input', () => {
    const worker = new CapturingWorker()
    const provider = new WorkerRecommendationProvider(() => worker as unknown as Worker)
    const input = reactive({
      key: 'deck',
      graph: {
        nodes: [{ id: 'A', role: 'ramp', degree: 1, qty: 1, cmc: 1, type: 'Artifact', mana: '', text: '', ci: [], edh: null, produces: {}, consumes: {}, zones: [] }],
        edges: [],
      },
      candidates: [{ name: 'B', ci: [], cmc: 1, type: 'Artifact', mana: '', text: '', edh: null, tags: [] }],
    }) as RecommendationInput

    provider.recommend(input, {})

    expect(worker.messages).toHaveLength(1)
    expect(() => structuredClone(worker.messages[0])).not.toThrow()
    expect(worker.messages[0]).not.toBe(input)
    expect((worker.messages[0] as RecommendationInput).graph).not.toBe(input.graph)
  })

  it('reports synchronous postMessage clone failures instead of leaving the job loading', () => {
    const error = new DOMException('Proxy object could not be cloned.', 'DataCloneError')
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage: vi.fn(() => { throw error }),
      terminate: vi.fn(),
    }
    const provider = new WorkerRecommendationProvider(() => worker as unknown as Worker)
    const onError = vi.fn()

    provider.recommend({ key: 'deck', graph: { nodes: [], edges: [] }, candidates: [] }, { onError })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      key: 'deck',
      code: 'worker-failed',
      message: 'Proxy object could not be cloned.',
    }))
    expect(worker.terminate).toHaveBeenCalled()
  })
})
