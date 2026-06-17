import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function deck() {
  return {
    title: 'Breakdown fixture',
    graph: {
      nodes: [
        { id: 'Sol Ring', role: 'ramp', degree: 2, qty: 1, text: 'Add two colorless mana.', type: 'Artifact', produces: { mana: ['you'] }, consumes: {}, zones: [], cmc: 1, mana: '{1}', ci: [], edh: null },
        { id: 'Xantcha, Sleeper Agent', role: 'commander', degree: 1, qty: 1, text: 'Any player may activate this ability.', type: 'Legendary Creature', produces: {}, consumes: { mana: ['you'] }, zones: [], cmc: 3, mana: '{1}{B}{R}', ci: ['B', 'R'], edh: null },
        { id: 'Island Card', role: 'utility', degree: 0, qty: 1, text: 'No links.', type: 'Artifact', produces: {}, consumes: {}, zones: [], cmc: 2, mana: '{2}', ci: [], edh: null },
      ],
      edges: [
        { source: 'Sol Ring', target: 'Xantcha, Sleeper Agent', interactions: [{ family: 'mana→activated-ability', strength: 'moderate' }], events: ['mana→activated-ability'] },
      ],
      eventLabels: { 'mana→activated-ability': 'Mana enables activated abilities' },
      metrics: {
        nonlandCount: 3,
        interactiveCount: 2,
        islandCount: 1,
        islands: ['Island Card'],
        edgeCount: 1,
        avgDegree: 1,
        weightedAvgDegree: 1.25,
        satWeightedAvgDegree: 1.2,
        pctInteractive: 67,
        pctMeaningful: 67,
        density: 0.33,
        largestWeb: 2,
        largestWebShare: 67,
        meaningfulWeb: 2,
        meaningfulWebShare: 67,
        interactiveComponents: 1,
        eventCounts: { 'mana→activated-ability': 1 },
        combos: [['Sol Ring', 'Xantcha, Sleeper Agent']],
        comboCriticalPairs: [{ a: 'Sol Ring', b: 'Xantcha, Sleeper Agent', family: 'mana→activated-ability' }],
        hasCombo: true,
        cohesionScore: 72,
        cohesionBand: 'Connected',
        selfSufficiencyScore: 68,
        selfSufficiencyBand: 'Solid',
        selfSufficiencySignals: { interaction: 1, cardAdvantage: 1, ramp: 1, tutors: 0, resilience: 0, premiumStaples: 1, premiumShare: 33 },
        winTuningScore: 91,
        winTuningBand: 'Highly tuned',
        winTuningSignals: {
          speed: { score: 91, cards: ['Sol Ring'] },
          consistency: { score: 20, cards: [] },
          cardFlow: { score: 30, cards: ['Xantcha, Sleeper Agent'] },
          interaction: { score: 15, cards: [] },
          closure: { score: 35, cards: ['Xantcha, Sleeper Agent'] },
          resilience: { score: 10, cards: [] },
          efficiency: { score: 70, cards: ['Sol Ring'] },
          gameChangers: { score: 0, cards: [] },
          legality: { score: 100, cards: [] },
        },
        winSummary: 'Fast mana and repeatable activated abilities.',
        gameChangerCount: 1,
        gameChangers: ['Sol Ring'],
        commanderBracket: { bracket: 4, label: 'Bracket 4' },
        bracketHint: 4,
        bracketLabel: 'Bracket 4',
      },
    },
  }
}

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(input: { key: string }) {
    setTimeout(() => this.onmessage?.({ data: { type: 'done', key: input.key, total: 0, results: [] } } as MessageEvent), 0)
  }
  terminate() {}
}

beforeEach(() => {
  vi.resetModules()
  Object.defineProperty(globalThis, 'Worker', { value: FakeWorker, configurable: true })
  Object.defineProperty(globalThis, 'ResizeObserver', { value: class { observe() {} disconnect() {} }, configurable: true })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => new Proxy({ canvas: {}, measureText: () => ({ width: 10 }) }, { get(target, key) { return key in target ? target[key as keyof typeof target] : () => {} } }), configurable: true })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 1024, configurable: true })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 768, configurable: true })
  window.__MTG_BOOTSTRAP__ = { decks: [deck() as any], active: 0, candidates: [], title: 'Breakdown fixture' }
  window.__MOXFIELD_PROXY__ = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__MTG_BOOTSTRAP__
  delete window.__MOXFIELD_PROXY__
  document.body.innerHTML = ''
})

describe('App score breakdown drawers', () => {
  it('opens side breakdown drawers with counted categories for win, cohesion, and self-sufficiency', async () => {
    const { default: App } = await import('../../src/web/App.vue')
    const wrapper = mount(App, { attachTo: document.body })
    await flush()
    await nextTick()

    const details = wrapper.findAll('details.score-card')
    expect(details).toHaveLength(3)

    details[0].element.setAttribute('open', '')
    await details[0].find('.score-breakdown-button').trigger('click')
    await nextTick()
    expect(wrapper.find('.breakdown-drawer').text()).toContain('Win tuning')
    expect(wrapper.find('.breakdown-drawer').text()).toContain('Signals explain score contribution')
    expect(wrapper.find('.breakdown-drawer').text()).not.toContain('Fast mana, ramp, and low setup cost')
    expect(wrapper.findAll('.breakdown-drawer .signal-row--button').find(button => button.text().includes('Speed'))!.attributes('title')).toContain('Fast mana, ramp, and low setup cost')
    expect(wrapper.findAll('.breakdown-category').map(button => button.text())).toEqual(expect.arrayContaining([
      expect.stringMatching(/Win tuning score factors\s*8 metrics/i),
      expect.stringMatching(/Win-tuning signal cards\s*4 cards/i),
      expect.stringMatching(/Game Changers\s*1 cards/i),
      expect.stringMatching(/Detected combos\s*1 combos/i),
    ]))

    await wrapper.findAll('.breakdown-category').find(button => button.text().includes('Detected combos'))!.trigger('click')
    await nextTick()
    expect(wrapper.find('.category-card-drawer').text()).toContain('Sol Ring')
    expect(wrapper.find('.category-card-drawer').text()).toContain('Xantcha')
    expect((wrapper.vm as any).selectedNodeId).toBe(null)
    await wrapper.find('.category-card-drawer__cards button').trigger('click')
    await nextTick()
    expect((wrapper.vm as any).selectedNodeId).toBe('Sol Ring')

    await wrapper.find('[aria-label="Close score breakdown"]').trigger('click')
    await nextTick()
    expect(wrapper.find('.breakdown-drawer').exists()).toBe(false)

    details[1].element.setAttribute('open', '')
    await details[1].find('.score-breakdown-button').trigger('click')
    await nextTick()
    expect(wrapper.find('.breakdown-drawer').text()).toContain('Cohesion')
    expect(wrapper.findAll('.breakdown-category').map(button => button.text())).toEqual(expect.arrayContaining([
      expect.stringMatching(/Cohesion score factors\s*14 metrics/i),
      expect.stringMatching(/Interaction families\s*1 families/i),
      expect.stringMatching(/Raw interaction events\s*1 events/i),
      expect.stringMatching(/Most connected cards\s*3 cards/i),
      expect.stringMatching(/Unlinked cards\s*1 cards/i),
    ]))

    await wrapper.findAll('.breakdown-category').find(button => button.text().includes('Interaction families'))!.trigger('click')
    await nextTick()
    expect((wrapper.vm as any).selectedFamily).toBe(null)
    expect(wrapper.find('.category-card-drawer').text()).toContain('Sol Ring')
    await wrapper.find('.breakdown-row-list button').trigger('click')
    await nextTick()
    expect((wrapper.vm as any).selectedFamily).toBe('mana→activated-ability')

    await wrapper.find('[aria-label="Close score breakdown"]').trigger('click')
    await nextTick()

    details[2].element.setAttribute('open', '')
    await details[2].find('.score-breakdown-button').trigger('click')
    await nextTick()
    expect(wrapper.find('.breakdown-drawer').text()).toContain('Self-sufficiency')
    expect(wrapper.find('.breakdown-drawer').text()).not.toContain('standalone card-power score')
    expect(wrapper.findAll('.breakdown-drawer .signal-row--button')[0].attributes('title')).toContain('standalone card-power score')
    expect(wrapper.findAll('.breakdown-category').map(button => button.text())).toEqual(expect.arrayContaining([
      expect.stringMatching(/Self-sufficiency score factors\s*10 metrics/i),
      expect.stringMatching(/Highest rated self-sufficient cards\s*3 cards/i),
      expect.stringMatching(/Standalone capability counts\s*7 signals/i),
    ]))

    wrapper.unmount()
  })

  it('keeps signal highlighting active from the breakdown drawer', async () => {
    const { default: App } = await import('../../src/web/App.vue')
    const wrapper = mount(App, { attachTo: document.body })
    await flush()
    await nextTick()

    const win = wrapper.findAll('details.score-card')[0]
    win.element.setAttribute('open', '')
    await win.find('.score-breakdown-button').trigger('click')
    await nextTick()

    await wrapper.findAll('.breakdown-drawer .signal-row--button').find(button => button.text().includes('Speed'))!.trigger('click')
    await nextTick()
    expect((wrapper.vm as any).selectedFamily).toBe('mana→activated-ability')
    expect(wrapper.find('.breakdown-drawer').exists()).toBe(true)

    wrapper.unmount()
  })
})
