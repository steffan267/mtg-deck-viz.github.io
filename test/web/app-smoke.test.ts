import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { DeckPayloadEntry } from '../../src/web/types'

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function deck(title = 'Fixture deck'): DeckPayloadEntry {
  return {
    title,
    graph: {
      nodes: [
        { id: 'Sol Ring', role: 'ramp', degree: 2, qty: 1, text: 'Add two colorless mana.', type: 'Artifact', produces: { mana: ['you'] }, consumes: {}, zones: [], cmc: 1, mana: '{1}', ci: [], edh: null } as any,
        { id: 'Xantcha, Sleeper Agent', role: 'commander', degree: 1, qty: 1, text: 'Any player may activate this ability.', type: 'Legendary Creature', produces: {}, consumes: { mana: ['you'] }, zones: [], cmc: 3, mana: '{1}{B}{R}', ci: ['B', 'R'], edh: null } as any,
        { id: 'Rhystic Study', role: 'draw', degree: 0, qty: 1, text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', type: 'Enchantment', produces: { draw: ['you'] }, consumes: {}, zones: [], cmc: 3, mana: '{2}{U}', ci: ['U'], edh: null } as any,
        {
          id: 'Heliod, the Radiant Dawn // Heliod, the Warped Eclipse',
          role: 'utility',
          degree: 0,
          qty: 1,
          text: 'When Heliod enters, return target enchantment card from your graveyard. // You may cast spells as though they had flash.',
          type: 'Legendary Enchantment Creature — God // Legendary Enchantment Creature — Phyrexian God',
          produces: {},
          consumes: {},
          zones: [],
          cmc: 4,
          mana: '{2}{W}{W}',
          ci: ['W', 'U', 'B'],
          edh: null,
          layout: 'transform',
          faces: [
            { index: 0, name: 'Heliod, the Radiant Dawn', type_line: 'Legendary Enchantment Creature — God', oracle_text: 'When Heliod enters, return target enchantment card from your graveyard.', mana_cost: '{2}{W}{W}', availability: 'transforms' },
            { index: 1, name: 'Heliod, the Warped Eclipse', type_line: 'Legendary Enchantment Creature — Phyrexian God', oracle_text: 'You may cast spells as though they had flash.', mana_cost: '', availability: 'transforms' },
          ],
        } as any,
        { id: 'Unlinked Card', role: 'utility', degree: 0, qty: 1, text: 'No direct interaction.', type: 'Artifact', produces: {}, consumes: {}, zones: [], cmc: 2, mana: '{2}', ci: [], edh: null } as any,
      ],
      edges: [
        { source: 'Sol Ring', target: 'Xantcha, Sleeper Agent', interactions: [{ family: 'mana→activated-ability', strength: 'moderate' }], events: ['mana→activated-ability'] },
      ],
      eventLabels: { 'mana→activated-ability': 'Mana enables activated abilities' },
      metrics: {
        winTuningScore: 91,
        winTuningBand: 'Tuned',
        winSummary: 'Fast mana and repeatable activated abilities.',
        bracketLabel: 'Bracket 3',
        gameChangerCount: 0,
        cohesionScore: 72,
        cohesionBand: 'Connected',
        selfSufficiencyScore: 68,
        selfSufficiencyBand: 'Solid',
        meaningfulWebShare: 67,
        edgeCount: 1,
        avgDegree: 1,
        pctMeaningful: 67,
        pctInteractive: 67,
        islandCount: 1,
        nonlandCount: 3,
        winTuningSignals: {
          speed: { score: 91, cards: ['Sol Ring'] },
          consistency: { score: 20, cards: [] },
          cardFlow: { score: 30, cards: ['Xantcha, Sleeper Agent'] },
          interaction: { score: 15, cards: [] },
          closure: { score: 35, cards: ['Xantcha, Sleeper Agent'] },
          resilience: { score: 10, cards: [] },
          efficiency: { score: 70, cards: ['Sol Ring'] },
          gameChangers: { score: 0, cards: [] },
        },
        selfSufficiencySignals: { interaction: 1, cardAdvantage: 1, ramp: 1 },
      } as any,
    },
  }
}

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(input: { key: string }) {
    setTimeout(() => {
      this.onmessage?.({ data: { type: 'done', key: input.key, total: 0, results: [] } } as MessageEvent)
    }, 0)
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
  window.__MTG_BOOTSTRAP__ = { decks: [deck()], active: 0, candidates: [], title: 'Fixture deck' }
  window.__MOXFIELD_PROXY__ = ''
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      data: [{ name: 'Arcane Signet', type_line: 'Artifact', oracle_text: 'Add one mana of any color.', mana_cost: '{2}', cmc: 2, color_identity: [] }],
      not_found: [],
    }),
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__MTG_BOOTSTRAP__
  delete window.__MOXFIELD_PROXY__
})

describe('Vue app browser smoke', () => {
  it('loads graph UI, imports via dropped file and paste, compares decks, opens help/detail/recommendations, and resets selection', async () => {
    const { default: App } = await import('../../src/web/App.vue')
    const wrapper = mount(App, { attachTo: document.body })
    await flush()
    await nextTick()

    expect(wrapper.text()).toContain('Fixture deck')
    expect(wrapper.text()).toContain('Deck visualisation')
    expect(wrapper.text()).toContain('Deck breakdown')
    expect(wrapper.text()).toContain('Decks')
    expect(wrapper.find('.deck-tabs-add').text()).toContain('2')
    expect(wrapper.find('input[placeholder="Paste Moxfield URL + Enter…"]').exists()).toBe(true)
    expect(wrapper.findAll('details.score-card')).toHaveLength(3)
    expect(wrapper.text()).toContain('Fast mana and repeatable activated abilities.')
    const guide = wrapper.find('.deck-metrics-guide')
    expect(guide.text()).toContain('Current deck vs guidelines')
    expect(guide.text()).toContain('Land / mana base')
    expect(guide.text()).not.toContain('Commander')
    expect(guide.text()).not.toContain('Win tuning')
    expect(wrapper.text()).toContain('EDHREC salt reference: Rhystic Study')
    expect(wrapper.find('.score-card__salt').attributes('href')).toBe('https://edhrec.com/top/salt')
    expect(wrapper.find('.role-legend').exists()).toBe(false)
    expect(wrapper.find('[data-testid="persistent-decklist"]').exists()).toBe(false)

    await wrapper.findAll('button').find(button => button.text() === 'Deck breakdown')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Compare weighted score to brackets')
    expect(wrapper.text()).toContain('Closest public-deck benchmark')
    expect(wrapper.text()).toContain('Decklist')
    const breakdownDecklist = wrapper.get('[data-testid="persistent-decklist"]')
    expect(breakdownDecklist.text()).toContain('5 cards · 5 nonlands')
    expect(breakdownDecklist.text()).toContain('Sol Ring')
    expect(breakdownDecklist.text()).toContain('Rhystic Study')
    expect(breakdownDecklist.text()).toContain('2 faces')
    expect(breakdownDecklist.findAll('.deck-list__card')).toHaveLength(5)

    await breakdownDecklist.findAll('.deck-list__card').find(button => button.text().includes('Heliod, the Radiant Dawn'))!.trigger('click')
    await nextTick()
    await wrapper.findAll('button').find(button => button.text() === 'Deck visualisation')!.trigger('click')
    await nextTick()
    expect(document.body.textContent).toContain('Transform card')
    expect(document.body.textContent).toContain('Heliod, the Radiant Dawn')
    expect(document.body.textContent).toContain('Heliod, the Warped Eclipse')
    expect(document.body.textContent).toContain('Shown separately so front/back or alternate faces are visible')

    const cohesion = wrapper.findAll('details.score-card')[1]
    cohesion.element.setAttribute('open', '')
    await cohesion.findAll('button').find(button => button.text().includes('Mana enables activated abilities'))!.trigger('click')
    await nextTick()
    expect((wrapper.vm as any).selectedFamily).toBe('mana→activated-ability')

    const selfSufficiency = wrapper.findAll('details.score-card')[2]
    selfSufficiency.element.setAttribute('open', '')
    await selfSufficiency.findAll('button').find(button => button.text().includes('Sol Ring'))!.trigger('click')
    await nextTick()
    expect((wrapper.vm as any).selectedNodeId).toBe('Sol Ring')

    await wrapper.find('input[type="search"]').setValue('Sol Ring')
    expect(wrapper.text()).toContain('Sol Ring')

    await wrapper.findAll('button').find(button => button.text() === 'Reset view')!.trigger('click')
    await nextTick()
    expect((wrapper.find('input[type="search"]').element as HTMLInputElement).value).toBe('')

    const cohesionBreakdown = wrapper.findAll('details.score-card')[1]
    cohesionBreakdown.element.setAttribute('open', '')
    await cohesionBreakdown.find('.score-breakdown-button').trigger('click')
    await nextTick()
    await wrapper.findAll('.breakdown-category').find(button => button.text().includes('Most connected cards'))!.trigger('click')
    await nextTick()
    await wrapper.find('.category-card-drawer__cards button').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Add two colorless mana.')
    expect((wrapper.find('input[type="search"]').element as HTMLInputElement).value).toBe('')

    await wrapper.find('.detail-card__links button').trigger('click')
    await nextTick()
    expect(document.body.textContent).toContain('Any player may activate this ability.')
    expect((wrapper.find('input[type="search"]').element as HTMLInputElement).value).toBe('')

    await wrapper.findAll('button').find(button => button.text() === 'Re-layout')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Freeze')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Unfreeze')
    const gravityButton = wrapper.findAll('button').find(button => button.text().startsWith('Gravity:'))!
    const firstGravity = gravityButton.text()
    await gravityButton.trigger('click')
    await nextTick()
    expect(wrapper.findAll('button').find(button => button.text().startsWith('Gravity:'))!.text()).not.toBe(firstGravity)
    await wrapper.findAll('button').find(button => button.text() === 'Hide isolated: off')!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Hide isolated: on')

    const file = new File(['1 Arcane Signet'], 'imported.txt', { type: 'text/plain' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } })
    await wrapper.find('.main').element.dispatchEvent(drop)
    await flush()
    await nextTick()
    expect(wrapper.text()).toContain('imported')

    await wrapper.find('[aria-label="More import options"]').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Paste list')!.trigger('click')
    await wrapper.find('textarea').setValue('1 Arcane Signet')
    await wrapper.findAll('button').find(button => button.text() === 'Import pasted list')!.trigger('click')
    await flush()
    await nextTick()
    expect(wrapper.text()).toContain('Pasted decklist')

    await wrapper.findAll('button').find(button => button.text() === 'Compare')!.trigger('click')
    expect(document.body.textContent).toContain('Compare decks')
    expect(wrapper.text()).toContain('Fixture deck')
    expect(document.body.textContent).toContain('How it wins')

    await wrapper.findAll('button').find(button => button.text() === 'Help')!.trigger('click')
    expect(document.body.textContent).toContain('How to use the graph')

    await wrapper.findAll('button').find(button => button.text() === 'Recommendations')!.trigger('click')
    await flush()
    await nextTick()
    expect(wrapper.text()).toContain('Recommendations')
    expect(wrapper.text()).toContain('Deck cards')
    await wrapper.findAll('button').find(button => button.text() === 'Deck breakdown')!.trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="persistent-decklist"]').text()).toContain('Arcane Signet')

    wrapper.unmount()
  })
})
