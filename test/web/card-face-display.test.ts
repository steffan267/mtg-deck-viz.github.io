import { describe, expect, it } from 'vitest'
import { cardFaceListSummary, cardFaceOverview } from '../../src/web/services/cardFaceDisplay'
import type { GraphNode } from '../../src/web/types/graph'

function node(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'Card',
    qty: 1,
    role: 'utility',
    cmc: 1,
    type: 'Artifact',
    mana: '{1}',
    text: '',
    ci: [],
    edh: null,
    degree: 0,
    produces: {},
    consumes: {},
    zones: [],
    ...overrides,
  } as GraphNode
}

describe('card face display helpers', () => {
  it('returns no overview for single-faced cards', () => {
    const overview = cardFaceOverview(node({ id: 'Ms. Bumbleflower', layout: 'normal', faces: [{ index: 0, name: 'Ms. Bumbleflower', type_line: 'Legendary Creature — Rabbit Citizen', oracle_text: 'Vigilance', mana_cost: '{1}{G}{W}{U}', availability: 'single' }] }))

    expect(overview).toBeNull()
  })

  it('summarizes transform cards with separate face details', () => {
    const heliod = node({
      id: 'Heliod, the Radiant Dawn // Heliod, the Warped Eclipse',
      layout: 'transform',
      type: 'Legendary Enchantment Creature — God // Legendary Enchantment Creature — Phyrexian God',
      text: 'When Heliod enters, return target enchantment card from your graveyard. // You may cast spells as though they had flash.',
      faces: [
        { index: 0, name: 'Heliod, the Radiant Dawn', type_line: 'Legendary Enchantment Creature — God', oracle_text: 'When Heliod enters, return target enchantment card from your graveyard.', mana_cost: '{2}{W}{W}', availability: 'transforms' },
        { index: 1, name: 'Heliod, the Warped Eclipse', type_line: 'Legendary Enchantment Creature — Phyrexian God', oracle_text: 'You may cast spells as though they had flash.', mana_cost: '', availability: 'transforms' },
      ],
    })

    expect(cardFaceListSummary(heliod)).toBe('2 faces')
    expect(cardFaceOverview(heliod)).toMatchObject({
      label: 'Transform card',
      chip: '2 faces',
      faces: [
        { name: 'Heliod, the Radiant Dawn', manaCost: '{2}{W}{W}' },
        { name: 'Heliod, the Warped Eclipse', manaCost: '' },
      ],
    })
  })
})
