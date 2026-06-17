import { describe, expect, it } from 'vitest'
import { buildDeckGuideMetrics } from '../../src/web/services/deckGuideMetrics'
import type { GraphNode } from '../../src/web/types'

function node(partial: Partial<GraphNode>): GraphNode {
  return {
    id: partial.id || 'Card',
    role: partial.role || 'utility',
    qty: partial.qty || 1,
    degree: partial.degree || 0,
    text: partial.text || '',
    type: partial.type || '',
    produces: partial.produces || {},
    consumes: partial.consumes || {},
    zones: partial.zones || [],
    caps: partial.caps || [],
    cmc: partial.cmc || 0,
    mana: partial.mana || '',
    ci: partial.ci || [],
  } as GraphNode
}

describe('buildDeckGuideMetrics', () => {
  it('excludes commander and win tuning from guideline rows', () => {
    expect(buildDeckGuideMetrics([node({ id: 'Commander', role: 'commander' })], null).map(metric => metric.id)).toEqual([
      'deck-plan',
      'mana-base',
      'ramp',
      'card-draw',
      'targeted-removal',
      'board-wipes',
    ])
  })

  it('counts functional ramp, draw, removal, and wipes beyond primary role', () => {
    const metrics = buildDeckGuideMetrics([
      node({ id: 'Commander', role: 'commander', text: 'Whenever you cast a spell, you may draw a card.' }),
      node({ id: 'Utility Rock', role: 'utility', produces: { mana: ['you'] }, caps: ['is-ramp'] }),
      node({ id: 'Flexible Answer', role: 'utility', produces: { destroy: ['any'] }, text: 'Destroy target artifact or creature.' }),
      node({ id: 'Sweeper', role: 'utility', text: 'Destroy all creatures.' }),
    ], null)

    expect(metrics.find(metric => metric.id === 'card-draw')?.value).toBe(1)
    expect(metrics.find(metric => metric.id === 'ramp')?.value).toBe(1)
    expect(metrics.find(metric => metric.id === 'targeted-removal')?.value).toBe(1)
    expect(metrics.find(metric => metric.id === 'board-wipes')?.value).toBe(1)
  })

  it('scores the land guideline as a 36–38 range instead of an unbounded minimum', () => {
    const thirtySevenLands = Array.from({ length: 37 }, (_, index) => node({ id: `Land ${index}`, role: 'land' }))
    const fiftyLands = Array.from({ length: 50 }, (_, index) => node({ id: `Land ${index}`, role: 'land' }))

    expect(buildDeckGuideMetrics(thirtySevenLands, null).find(metric => metric.id === 'mana-base')).toMatchObject({ percent: 100, tone: 'ok' })
    expect(buildDeckGuideMetrics(fiftyLands, null).find(metric => metric.id === 'mana-base')).toMatchObject({ percent: 76, tone: 'watch' })
  })
})
