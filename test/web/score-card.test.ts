import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScoreCard from '../../src/web/components/score/ScoreCard.vue'
import type { ScoreSection } from '../../src/web/types'

function section(id: string, value: number): ScoreSection {
  return {
    id,
    label: id,
    value,
    band: 'Band',
    summary: 'Detailed score summary.',
    evidence: [{ id: 'evidence', label: 'Evidence chip' }],
    metrics: [{ id: 'metric', label: 'Metric', value: 7 }],
    signals: [{ id: 'signal', label: 'Signal', value: 42, cards: ['Card'] }],
  }
}

function scoreColor(id: string, value: number): string {
  return (mount(ScoreCard, { props: { section: section(id, value) } }).find('.score-card__value').element as HTMLElement).style.color
}

describe('ScoreCard color grading', () => {
  it('uses the legacy score color thresholds for win, cohesion, and self-sufficiency values', () => {
    expect(scoreColor('win', 91)).toBe('rgb(84, 201, 138)')
    expect(scoreColor('cohesion', 12)).toBe('rgb(255, 122, 61)')
    expect(scoreColor('self-sufficiency', 71)).toBe('rgb(84, 201, 138)')
  })

  it('keeps details closed by default but renders the expandable detail content', () => {
    const wrapper = mount(ScoreCard, { props: { section: section('win', 91) } })

    expect((wrapper.find('details.score-card').element as HTMLDetailsElement).open).toBe(false)
    expect(wrapper.text()).toContain('Detailed score summary.')
    expect(wrapper.text()).toContain('Evidence chip')
    expect(wrapper.text()).toContain('Metric')
  })


  it('shows salt references on the top-level score summary when provided', () => {
    const salty = section('win', 91)
    salty.saltReferences = [{ name: 'Rhystic Study', source: 'https://edhrec.com/top/salt' }]
    const wrapper = mount(ScoreCard, { props: { section: salty } })

    expect(wrapper.text()).toContain('EDHREC salt reference: Rhystic Study')
    expect(wrapper.find('.score-card__salt').attributes('href')).toBe('https://edhrec.com/top/salt')
    expect(wrapper.find('.score-card__salt').attributes('title')).toContain('Rhystic Study')
  })

  it('emits signal-select when a selectable signal row is clicked', async () => {
    const wrapper = mount(ScoreCard, { props: { section: section('win', 91), selectableSignals: true } })

    await wrapper.find('.signal-row--button').trigger('click')

    expect(wrapper.emitted('signal-select')?.[0]?.[0]).toMatchObject({ id: 'signal', label: 'Signal' })
    expect(wrapper.emitted('signal-select')?.[0]?.[1]).toMatchObject({ id: 'win' })
  })
})
