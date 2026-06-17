import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScorePanel from '../../src/web/components/score/ScorePanel.vue'
import type { ScoreSection } from '../../src/web/types'

const section: ScoreSection = {
  id: 'cohesion',
  label: 'Cohesion',
  value: 72,
  band: 'Connected',
  signals: [{ id: 'family', label: 'Family', value: 4, selectableFamily: 'family' }],
}

describe('ScorePanel', () => {
  it('renders an empty state when no score sections are available', () => {
    const wrapper = mount(ScorePanel, { props: { sections: [] } })

    expect(wrapper.text()).toContain('No scores yet')
  })

  it('renders an error instead of score cards when scoring fails', () => {
    const wrapper = mount(ScorePanel, { props: { sections: [section], error: 'Metrics failed' } })

    expect(wrapper.text()).toContain('Score unavailable')
    expect(wrapper.text()).toContain('Metrics failed')
    expect(wrapper.find('details.score-card').exists()).toBe(false)
  })

  it('forwards selected signals with their originating section', async () => {
    const wrapper = mount(ScorePanel, { props: { sections: [section], selectableSignals: true } })

    await wrapper.find('.signal-row--button').trigger('click')

    expect(wrapper.emitted('signal-select')?.[0]?.[0]).toMatchObject({ id: 'family' })
    expect(wrapper.emitted('signal-select')?.[0]?.[1]).toMatchObject({ id: 'cohesion' })
  })
})
