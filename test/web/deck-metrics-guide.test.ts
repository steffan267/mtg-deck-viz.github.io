import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeckMetricsGuide from '../../src/web/components/sidebar/DeckMetricsGuide.vue'
import type { DeckMetricStatus } from '../../src/web/services/deckGuideMetrics'

const metrics: DeckMetricStatus[] = [
  { id: 'deck-plan', label: 'Deck plan', value: 80, target: 70, percent: 100, status: '80/100', title: 'Plan check', tone: 'ok' },
  { id: 'mana-base', label: 'Land / mana base', value: 36, target: 36, percent: 100, status: '36/36–38', title: 'Land check', tone: 'ok' },
  { id: 'board-wipes', label: 'Board wipes', value: 3, target: 5, percent: 60, status: '3/5', title: 'Wipe check', tone: 'warn' },
]

describe('DeckMetricsGuide', () => {
  it('renders compact guideline signals without salt or win-tuning adornments', () => {
    const wrapper = mount(DeckMetricsGuide, { props: { metrics } })

    expect(wrapper.text()).toContain('Current deck vs guidelines')
    expect(wrapper.findAll('.deck-guide-signal')).toHaveLength(3)
    expect(wrapper.text()).toContain('Land / mana base')
    expect(wrapper.text()).toContain('3/5')
    expect(wrapper.find('.deck-metric__salt').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Win tuning')
    expect(wrapper.text()).not.toContain('Commander')
  })
})
