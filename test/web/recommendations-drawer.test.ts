import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RecommendationsDrawer from '../../src/web/components/recommendations/RecommendationsDrawer.vue'
import recommendationsDrawerSource from '../../src/web/components/recommendations/RecommendationsDrawer.vue?raw'
import type { CandidateCard, DeckNode } from '../../src/web/types/deck'
import type { RecommendationRow } from '../../src/web/services/recommendations'

function row(name: string, totalValue: number): RecommendationRow {
  return {
    name,
    role: 'combo',
    cmc: 3,
    power: 4,
    newEdges: 2,
    deltaWin: 2,
    deltaCohesion: 3,
    deltaSelf: 1,
    totalValue,
    scoreMissing: 0,
    signalDeltas: {},
  }
}

function candidate(name: string): CandidateCard {
  return {
    name,
    ci: [],
    cmc: 3,
    type: 'Creature',
    mana: '{2}{R}',
    text: 'Whenever you cast a spell, this card creates a new interaction.',
    edh: null,
    tags: [],
  }
}

describe('RecommendationsDrawer', () => {
  it('renders recommendation cards inside a dedicated scroll list', () => {
    const rows = [
      row('Urabrask // The Great Work', 2.82),
      row('Birgi, God of Storytelling', 1.41),
      row('Storm-Kiln Artist', 1.12),
    ]
    const wrapper = mount(RecommendationsDrawer, {
      props: {
        open: true,
        loading: false,
        progress: { done: 0, total: 0 },
        rows,
        deckCards: [] as DeckNode[],
        candidates: rows.map(({ name }) => candidate(name)),
        roleLabels: { combo: 'Combo' },
        mode: 'total',
      },
    })

    const list = wrapper.get('[data-testid="recommendations-list"]')
    expect(list.classes()).toContain('recommendations-drawer__list')
    expect(list.findAll('.rec-card')).toHaveLength(rows.length)
    for (const recommendation of rows) expect(list.text()).toContain(recommendation.name)
    expect(list.text()).toContain('+2.82σ')
  })

  it('keeps drawer chrome separate from the scrollable card stack', () => {
    expect(recommendationsDrawerSource).toMatch(/\.recommendations-drawer\s*{[^}]*overflow:\s*hidden/s)
    expect(recommendationsDrawerSource).toMatch(/\.recommendations-drawer__list\s*{[^}]*display:\s*grid/s)
    expect(recommendationsDrawerSource).toMatch(/\.recommendations-drawer__list\s*{[^}]*grid-auto-rows:\s*max-content/s)
    expect(recommendationsDrawerSource).toMatch(/\.recommendations-drawer__list\s*{[^}]*overflow:\s*auto/s)
  })
})
