import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeckMetricsGuide from '../../src/web/components/sidebar/DeckMetricsGuide.vue'
import type { DeckMetricStatus } from '../../src/web/services/deckGuideMetrics'

const metrics: DeckMetricStatus[] = [
  { id: 'deck-plan', label: 'Deck plan', value: 80, target: 70, percent: 100, status: '80/100', currentLabel: '80', targetLabel: '100', title: 'Plan check', tone: 'ok', overRecommended: false },
  { id: 'mana-base', label: 'Land / mana base', value: 36, target: 36, percent: 100, status: '36/36–38', currentLabel: '36', targetLabel: '36–38', title: 'Land check', tone: 'ok', overRecommended: false },
  { id: 'ramp', label: 'Mana ramp', value: 14, target: 10, percent: 100, status: '14/10', currentLabel: '14', targetLabel: '10', title: 'Ramp check', tone: 'ok', overRecommended: true },
  { id: 'board-wipes', label: 'Board wipes', value: 3, target: 5, percent: 60, status: '3/5', currentLabel: '3', targetLabel: '5', title: 'Wipe check', tone: 'warn', overRecommended: false },
]

describe('DeckMetricsGuide', () => {
  it('renders compact guideline signals without salt or win-tuning adornments', () => {
    const wrapper = mount(DeckMetricsGuide, { props: { metrics } })

    expect(wrapper.text()).toContain('Current deck vs guidelines')
    expect(wrapper.findAll('.deck-guide-signal')).toHaveLength(4)
    expect(wrapper.text()).toContain('Land / mana base')
    expect(wrapper.text()).toContain('3/5')
    const overValues = wrapper.findAll('.deck-guide-signal__current--over')
    expect(overValues).toHaveLength(1)
    expect(overValues[0].text()).toBe('14')
    expect(wrapper.find('.deck-metric__salt').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Win tuning')
    expect(wrapper.text()).not.toContain('Commander')
  })
})
