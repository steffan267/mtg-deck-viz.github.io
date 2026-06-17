import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useRecommendations } from '../../src/web/composables/useRecommendations'
import type { DeckGraph } from '../../src/web/types'
import type { RecommendationInput, RecommendationJob, RecommendationObserver, RecommendationProvider, RecommendationRow } from '../../src/web/services/recommendations'

function graph(card: string): DeckGraph {
  return {
    nodes: [{ id: card, role: 'ramp', degree: 0, qty: 1, text: '', type: 'Artifact', produces: {}, consumes: {}, zones: [], cmc: 1, mana: '{1}', ci: [], edh: null } as any],
    edges: [],
  }
}

function row(name: string): RecommendationRow {
  return { name, role: 'ramp', cmc: 1, power: 1, newEdges: 1, deltaWin: 1, deltaCohesion: 1, deltaSelf: 1, totalValue: 1, scoreMissing: 0, signalDeltas: {} }
}

describe('useRecommendations', () => {
  it('cancels and ignores stale worker results after reset before accepting the next deck result', () => {
    const currentGraph = ref(graph('Deck A card'))
    const cancel = vi.fn()
    const calls: Array<{ input: RecommendationInput; observer: RecommendationObserver }> = []
    const provider: RecommendationProvider = {
      recommend(input, observer): RecommendationJob {
        calls.push({ input, observer })
        return { cancel }
      },
    }

    const wrapper = mount(defineComponent({
      setup() {
        const recommendations = useRecommendations(provider, () => currentGraph.value, () => [])
        return { recommendations }
      },
      render: () => h('div'),
    }))
    const recommendations = wrapper.vm.recommendations as ReturnType<typeof useRecommendations>

    recommendations.start()
    expect(calls).toHaveLength(1)
    const oldKey = calls[0].input.key

    recommendations.reset()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(recommendations.result.value).toBeNull()
    expect(recommendations.loading.value).toBe(false)

    calls[0].observer.onResult?.({ key: oldKey, total: 1, results: [row('Stale suggestion')] })
    expect(recommendations.result.value).toBeNull()
    expect(recommendations.rows.value).toEqual([])

    currentGraph.value = graph('Deck B card')
    recommendations.start()
    expect(calls).toHaveLength(2)
    calls[1].observer.onResult?.({ key: calls[1].input.key, total: 1, results: [row('Fresh suggestion')] })

    expect(recommendations.result.value?.results[0].name).toBe('Fresh suggestion')
    expect(recommendations.rows.value[0].name).toBe('Fresh suggestion')
    wrapper.unmount()
  })

  it('ignores stale worker results from an older run with the same deck signature', () => {
    const currentGraph = ref(graph('Same deck card'))
    const calls: Array<{ input: RecommendationInput; observer: RecommendationObserver }> = []
    const provider: RecommendationProvider = {
      recommend(input, observer): RecommendationJob {
        calls.push({ input, observer })
        return { cancel() {} }
      },
    }

    const wrapper = mount(defineComponent({
      setup() {
        const recommendations = useRecommendations(provider, () => currentGraph.value, () => [])
        return { recommendations }
      },
      render: () => h('div'),
    }))
    const recommendations = wrapper.vm.recommendations as ReturnType<typeof useRecommendations>

    recommendations.start()
    recommendations.reset()
    recommendations.start()
    expect(calls).toHaveLength(2)
    expect(calls[0].input.key).toBe(calls[1].input.key)

    calls[0].observer.onResult?.({ key: calls[0].input.key, total: 1, results: [row('Stale same-key suggestion')] })
    expect(recommendations.result.value).toBeNull()

    calls[1].observer.onResult?.({ key: calls[1].input.key, total: 1, results: [row('Fresh same-key suggestion')] })
    expect(recommendations.result.value?.results[0].name).toBe('Fresh same-key suggestion')
    wrapper.unmount()
  })

})
