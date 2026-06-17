import { describe, expect, it, vi } from 'vitest'
import { createBrowserGraphBuilder } from '../../src/web/services/browserGraphBuilder'
import { useDeckImport } from '../../src/web/composables/useDeckImport'
import * as INTERACTION_MODEL from '../../src/interaction-model.js'
import * as DECK_METRICS from '../../src/metrics.js'
import type { InteractionModelModule } from '../../src/web/services/adapters/interactionModel'
import type { MetricsModule } from '../../src/web/types'

const moxfieldPayload = {
  name: 'Proxy fixture',
  boards: {
    mainboard: {
      cards: {
        one: {
          quantity: 1,
          card: {
            name: 'Sol Ring',
            type_line: 'Artifact',
            oracle_text: 'Add two colorless mana.',
            mana_cost: '{1}',
            cmc: 1,
            color_identity: [],
          },
        },
      },
    },
  },
}

describe('deck import proxy wiring', () => {
  it('reads the latest moxfieldProxy value at import time', async () => {
    let proxy = ''
    const urls: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.startsWith('https://api2.moxfield.com')) return new Response('blocked', { status: 403 })
      if (url === 'https://proxy.example.test/abc12345') return new Response(JSON.stringify(moxfieldPayload), { status: 200 })
      return new Response('not found', { status: 404 })
    })
    const buildGraph = createBrowserGraphBuilder(INTERACTION_MODEL as unknown as InteractionModelModule, DECK_METRICS as unknown as MetricsModule)
    const importer = useDeckImport({
      buildGraph,
      fetch: fetcher as unknown as typeof fetch,
      get moxfieldProxy() { return proxy },
    })

    proxy = 'https://proxy.example.test'
    const result = await importer.importDeck({ kind: 'url', url: 'https://moxfield.com/decks/abc12345' })

    expect(result.ok).toBe(true)
    expect(urls).toContain('https://api2.moxfield.com/v3/decks/all/abc12345')
    expect(urls).toContain('https://proxy.example.test/abc12345')
  })
})
