import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RecommendationCard from '../../src/web/components/recommendations/RecommendationCard.vue'
import recommendationCardSource from '../../src/web/components/recommendations/RecommendationCard.vue?raw'
import { recommendationScoreTone } from '../../src/web/services/recommendations'
import type { CandidateCard } from '../../src/web/types/deck'
import type { RecommendationMode, RecommendationRow } from '../../src/web/services/recommendations'

function row(overrides: Partial<RecommendationRow> = {}): RecommendationRow {
  return {
    name: 'Urabrask // The Great Work',
    role: 'combo',
    cmc: 4,
    power: 5,
    newEdges: 3,
    deltaWin: 2,
    deltaCohesion: 3,
    deltaSelf: 1,
    totalValue: 2.82,
    scoreMissing: 0,
    signalDeltas: {},
    ...overrides,
  }
}

const candidate: CandidateCard = {
  name: 'Urabrask // The Great Work',
  ci: ['R'],
  cmc: 4,
  type: 'Creature',
  mana: '{2}{R}{R}',
  text: 'Whenever you cast an instant or sorcery spell, copy it.',
  edh: null,
  tags: ['combo'],
}

describe('RecommendationCard score tone', () => {
  it.each([
    ['total', row({ totalValue: 2 }), 'excellent'],
    ['total', row({ totalValue: 1 }), 'good'],
    ['total', row({ totalValue: 0.5 }), 'modest'],
    ['win', row({ deltaWin: 8 }), 'excellent'],
    ['win', row({ deltaWin: 3 }), 'good'],
    ['self', row({ power: 8 }), 'excellent'],
    ['self', row({ power: 4 }), 'good'],
  ] as Array<[RecommendationMode, RecommendationRow, string]>)('maps %s recommendation scores to %s', (mode, recommendation, expectedTone) => {
    expect(recommendationScoreTone(recommendation, mode)).toBe(expectedTone)
  })

  it('renders positive recommendations as non-red quality badges', () => {
    const wrapper = mount(RecommendationCard, {
      props: {
        row: row(),
        detail: '+2.82σ',
        mode: 'total',
        candidate,
        roleLabels: { combo: 'Combo' },
      },
    })

    const score = wrapper.get('.rec-score')
    expect(score.classes()).toContain('rec-score--excellent')
    expect(score.attributes('title')).toBe('Excellent recommendation fit')
    expect(score.text()).toBe('+2.82σ')
  })

  it('does not style recommendation scores with the global red accent', () => {
    expect(recommendationCardSource).not.toMatch(/\.rec-score\s*{[^}]*var\(--accent/s)
    expect(recommendationCardSource).toMatch(/\.rec-score--excellent\s*{[^}]*#8be0b0/s)
    expect(recommendationCardSource).toMatch(/\.rec-score--good\s*{[^}]*#9cc8ff/s)
    expect(recommendationCardSource).toMatch(/\.rec-score--modest\s*{[^}]*#ead77c/s)
  })
})
