import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeckList from '../../src/web/components/sidebar/DeckList.vue'
import type { DeckNode } from '../../src/web/types/deck'

function node(id: string, role: string, overrides: Partial<DeckNode> = {}): DeckNode {
  return {
    id,
    role,
    qty: 1,
    degree: 0,
    cmc: 1,
    type: 'Artifact',
    mana: '{1}',
    text: '',
    ci: [],
    edh: null,
    produces: {},
    consumes: {},
    zones: [],
    ...overrides,
  } as DeckNode
}

describe('DeckList', () => {
  it('renders the active deck card list and excludes synthetic zone nodes', () => {
    const wrapper = mount(DeckList, {
      props: {
        nodes: [
          node('Sol Ring', 'ramp', { degree: 2 }),
          node('Heliod, the Radiant Dawn // Heliod, the Warped Eclipse', 'utility', {
            layout: 'transform',
            faces: [
              { index: 0, name: 'Heliod, the Radiant Dawn', type_line: 'Legendary Enchantment Creature — God', oracle_text: 'When Heliod enters, return target enchantment card.', mana_cost: '{2}{W}{W}', availability: 'transforms' },
              { index: 1, name: 'Heliod, the Warped Eclipse', type_line: 'Legendary Enchantment Creature — Phyrexian God', oracle_text: 'You may cast spells as though they had flash.', mana_cost: '', availability: 'transforms' },
            ],
          }),
          node('Command Tower', 'land', { cmc: 0 }),
          node('@Hand', 'zone'),
        ],
        roleLabels: { ramp: 'Ramp / mana', land: 'Land' },
      },
    })

    expect(wrapper.text()).toContain('Decklist')
    expect(wrapper.text()).toContain('3 cards · 2 nonlands')
    expect(wrapper.text()).toContain('Sol Ring')
    expect(wrapper.text()).toContain('Ramp / mana · MV 1 · 2 links')
    expect(wrapper.text()).toContain('Heliod, the Radiant Dawn // Heliod, the Warped Eclipse')
    expect(wrapper.text()).toContain('utility · MV 1 · 0 links · 2 faces')
    expect(wrapper.text()).toContain('Command Tower')
    expect(wrapper.text()).not.toContain('@Hand')
    expect(wrapper.findAll('.deck-list__card')).toHaveLength(3)
  })

  it('emits selected card ids from the persistent list', async () => {
    const wrapper = mount(DeckList, {
      props: {
        nodes: [node('Rhystic Study', 'draw')],
        selectedId: 'Rhystic Study',
      },
    })

    expect(wrapper.get('.deck-list__card').classes()).toContain('is-selected')
    await wrapper.get('.deck-list__card').trigger('click')
    expect(wrapper.emitted('select-card')).toEqual([['Rhystic Study']])
  })
})
