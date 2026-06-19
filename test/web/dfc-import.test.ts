import { describe, expect, it, vi } from 'vitest'
import { resolveViaScryfall } from '../../src/web/services/import/scryfall'
import { MoxfieldDeckImporter } from '../../src/web/services/import/moxfieldImporter'
import { createBrowserGraphBuilder } from '../../src/web/services/browserGraphBuilder'
import * as INTERACTION_MODEL from '../../src/interaction-model.js'
import * as DECK_METRICS from '../../src/metrics.js'
import type { InteractionModelModule } from '../../src/web/services/adapters/interactionModel'
import type { MetricsModule } from '../../src/web/types'

const urabraskCard = {
  id: 'urabrask-print',
  oracle_id: 'urabrask-oracle',
  name: 'Urabrask // The Great Work',
  layout: 'transform',
  type_line: 'Legendary Creature — Phyrexian Praetor // Enchantment — Saga',
  cmc: 4,
  edhrec_rank: 100,
  color_identity: ['R'],
  card_faces: [
    {
      name: 'Urabrask',
      mana_cost: '{2}{R}{R}',
      type_line: 'Legendary Creature — Phyrexian Praetor',
      oracle_text: 'First strike. Whenever you cast an instant or sorcery spell, add {R}.',
    },
    {
      name: 'The Great Work',
      mana_cost: '',
      type_line: 'Enchantment — Saga',
      oracle_text: 'III — Exile the top cards of your library. You may play them this turn.',
    },
  ],
}

describe('DFC face-aware imports', () => {
  it('resolves a Scryfall back-face decklist name to one canonical card with faces', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [urabraskCard] }), { status: 200 }))

    const result = await resolveViaScryfall(
      [{ qty: 2, name: 'The Great Work' }],
      { fetch: fetcher as unknown as typeof fetch },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.cards).toHaveLength(1)
    expect(result.value.cards[0].qty).toBe(2)
    expect(result.value.cards[0].card.name).toBe('Urabrask // The Great Work')
    expect(result.value.cards[0].card.aliases).toContain('the great work')
    expect(result.value.cards[0].card.faces?.map(face => face.name)).toEqual(['Urabrask', 'The Great Work'])
    expect(result.value.cards[0].card.oracle_text).toContain(' // ')
    expect(result.value.cards[0].card.mana_cost).toBe('{2}{R}{R}')
  })

  it('sums DFC alias quantities and dedupes duplicate Scryfall collection hits', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: [urabraskCard, urabraskCard],
      not_found: [{ name: 'The Great Work' }],
    }), { status: 200 }))

    const result = await resolveViaScryfall(
      [
        { qty: 1, name: 'Urabrask' },
        { qty: 2, name: 'The Great Work' },
      ],
      { fetch: fetcher as unknown as typeof fetch },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.cards).toHaveLength(1)
    expect(result.value.cards[0].qty).toBe(3)
    expect(result.value.missing).toEqual([])
  })

  it('merges browser graph entries that refer to different faces of one physical card', () => {
    const buildGraph = createBrowserGraphBuilder(
      INTERACTION_MODEL as unknown as InteractionModelModule,
      DECK_METRICS as unknown as MetricsModule,
    )
    const graph = buildGraph([
      { qty: 1, card: { ...urabraskCard, name: 'Urabrask // The Great Work' } as any },
      { qty: 2, card: { ...urabraskCard, name: 'Urabrask // The Great Work' } as any },
    ])
    const nodes = graph.nodes.filter(node => node.id === 'Urabrask // The Great Work')

    expect(nodes).toHaveLength(1)
    expect(nodes[0].qty).toBe(3)
    expect(graph.edges.some(edge => edge.source === edge.target)).toBe(false)
  })

  it('carries Moxfield DFC faces into browser graph nodes', async () => {
    const payload = {
      name: 'DFC fixture',
      boards: {
        mainboard: {
          cards: {
            urabrask: { quantity: 1, card: urabraskCard },
          },
        },
      },
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    const buildGraph = createBrowserGraphBuilder(
      INTERACTION_MODEL as unknown as InteractionModelModule,
      DECK_METRICS as unknown as MetricsModule,
    )
    const importer = new MoxfieldDeckImporter()
    const result = await importer.import(
      { kind: 'url', url: 'https://moxfield.com/decks/dfc12345' },
      { fetch: fetcher as unknown as typeof fetch, buildGraph },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.value.graph.nodes.find(item => item.id === 'Urabrask // The Great Work')
    expect(node).toBeTruthy()
    expect(node?.layout).toBe('transform')
    expect(node?.aliases).toContain('the great work')
    expect(node?.faces?.map(face => face.name)).toEqual(['Urabrask', 'The Great Work'])
    expect(node?.faceFacts?.map(face => face.name)).toEqual(['Urabrask', 'The Great Work'])
    expect((node?.factSources as any)?.caps?.['is-enchantment']?.[0]?.faceName).toBe('The Great Work')
    expect(node?.text).toContain(' // ')
    expect(node?.mana).toBe('{2}{R}{R}')
  })
})
